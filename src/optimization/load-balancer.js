/**
 * @fileoverview Load Balancer
 * @description Load balancing and distribution system for optimal resource utilization
 */

import EventEmitter from 'events';
import { performance } from 'perf_hooks';

/**
 * Load balancing strategies
 */
export const LoadBalancingStrategy = {
    ROUND_ROBIN: 'round_robin',
    WEIGHTED_ROUND_ROBIN: 'weighted_round_robin',
    LEAST_CONNECTIONS: 'least_connections',
    LEAST_RESPONSE_TIME: 'least_response_time',
    RESOURCE_BASED: 'resource_based',
    HASH: 'hash'
};

/**
 * Server health status
 */
export const ServerStatus = {
    HEALTHY: 'healthy',
    DEGRADED: 'degraded',
    UNHEALTHY: 'unhealthy',
    MAINTENANCE: 'maintenance'
};

/**
 * Load Balancer for distributing requests across multiple servers/workers
 */
export class LoadBalancer extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            enabled: config.enabled !== false,
            strategy: config.strategy || LoadBalancingStrategy.ROUND_ROBIN,
            healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
            healthCheckTimeout: config.healthCheckTimeout || 5000,
            maxRetries: config.maxRetries || 3,
            retryDelay: config.retryDelay || 1000,
            enableMetrics: config.enableMetrics !== false,
            enableStickySessions: config.enableStickySessions || false,
            sessionTimeout: config.sessionTimeout || 3600000, // 1 hour
            ...config
        };

        this.servers = new Map();
        this.currentIndex = 0;
        this.sessions = new Map();
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalResponseTime: 0,
            serverMetrics: new Map()
        };
        
        this.healthCheckInterval = null;
        this.isRunning = false;
    }

    /**
     * Initialize the load balancer
     */
    async initialize() {
        if (!this.config.enabled) {
            console.log('Load balancing disabled');
            return;
        }

        console.log('Initializing load balancer...');
        
        // Start health checks
        this.startHealthChecks();
        
        this.isRunning = true;
        this.emit('initialized');
        
        console.log('Load balancer initialized');
    }

    /**
     * Add a server to the pool
     */
    addServer(id, config) {
        const server = {
            id,
            host: config.host,
            port: config.port,
            weight: config.weight || 1,
            maxConnections: config.maxConnections || 100,
            status: ServerStatus.HEALTHY,
            currentConnections: 0,
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            totalResponseTime: 0,
            averageResponseTime: 0,
            lastHealthCheck: null,
            healthCheckFailures: 0,
            metadata: config.metadata || {},
            createdAt: Date.now()
        };

        this.servers.set(id, server);
        this.metrics.serverMetrics.set(id, {
            requests: 0,
            responses: 0,
            errors: 0,
            avgResponseTime: 0
        });

        this.emit('server_added', { server });
        console.log(`Added server: ${id} (${config.host}:${config.port})`);
        
        return server;
    }

    /**
     * Remove a server from the pool
     */
    removeServer(id) {
        const server = this.servers.get(id);
        if (!server) {
            return false;
        }

        this.servers.delete(id);
        this.metrics.serverMetrics.delete(id);
        
        // Remove any sticky sessions for this server
        for (const [sessionId, serverId] of this.sessions) {
            if (serverId === id) {
                this.sessions.delete(sessionId);
            }
        }

        this.emit('server_removed', { server });
        console.log(`Removed server: ${id}`);
        
        return true;
    }

    /**
     * Update server configuration
     */
    updateServer(id, updates) {
        const server = this.servers.get(id);
        if (!server) {
            return false;
        }

        Object.assign(server, updates);
        this.emit('server_updated', { server });
        
        return true;
    }

    /**
     * Get the next server based on the load balancing strategy
     */
    getNextServer(sessionId = null, requestHash = null) {
        const healthyServers = this.getHealthyServers();
        
        if (healthyServers.length === 0) {
            throw new Error('No healthy servers available');
        }

        // Check for sticky sessions
        if (sessionId && this.config.enableStickySessions) {
            const stickyServerId = this.sessions.get(sessionId);
            if (stickyServerId) {
                const stickyServer = this.servers.get(stickyServerId);
                if (stickyServer && stickyServer.status === ServerStatus.HEALTHY) {
                    return stickyServer;
                } else {
                    // Remove invalid session
                    this.sessions.delete(sessionId);
                }
            }
        }

        let selectedServer;

        switch (this.config.strategy) {
            case LoadBalancingStrategy.ROUND_ROBIN:
                selectedServer = this.roundRobinSelection(healthyServers);
                break;
            case LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN:
                selectedServer = this.weightedRoundRobinSelection(healthyServers);
                break;
            case LoadBalancingStrategy.LEAST_CONNECTIONS:
                selectedServer = this.leastConnectionsSelection(healthyServers);
                break;
            case LoadBalancingStrategy.LEAST_RESPONSE_TIME:
                selectedServer = this.leastResponseTimeSelection(healthyServers);
                break;
            case LoadBalancingStrategy.RESOURCE_BASED:
                selectedServer = this.resourceBasedSelection(healthyServers);
                break;
            case LoadBalancingStrategy.HASH:
                selectedServer = this.hashBasedSelection(healthyServers, requestHash);
                break;
            default:
                selectedServer = this.roundRobinSelection(healthyServers);
        }

        // Create sticky session if enabled
        if (sessionId && this.config.enableStickySessions) {
            this.sessions.set(sessionId, selectedServer.id);
            // Set session timeout
            setTimeout(() => {
                this.sessions.delete(sessionId);
            }, this.config.sessionTimeout);
        }

        return selectedServer;
    }

    /**
     * Execute a request through the load balancer
     */
    async executeRequest(requestFn, options = {}) {
        const startTime = performance.now();
        const sessionId = options.sessionId;
        const requestHash = options.hash;
        let attempt = 0;
        let lastError = null;

        while (attempt < this.config.maxRetries) {
            try {
                const server = this.getNextServer(sessionId, requestHash);
                
                // Increment connection count
                server.currentConnections++;
                
                // Execute the request
                const result = await requestFn(server);
                const responseTime = performance.now() - startTime;
                
                // Update metrics
                this.updateServerMetrics(server.id, responseTime, true);
                this.updateGlobalMetrics(responseTime, true);
                
                // Decrement connection count
                server.currentConnections--;
                
                this.emit('request_success', {
                    serverId: server.id,
                    responseTime,
                    attempt: attempt + 1
                });
                
                return result;

            } catch (error) {
                lastError = error;
                attempt++;
                
                // Update metrics for failed request
                this.updateGlobalMetrics(performance.now() - startTime, false);
                
                this.emit('request_failure', {
                    error: error.message,
                    attempt,
                    maxRetries: this.config.maxRetries
                });
                
                if (attempt < this.config.maxRetries) {
                    await this.delay(this.config.retryDelay * attempt);
                }
            }
        }

        throw new Error(`Request failed after ${this.config.maxRetries} attempts: ${lastError.message}`);
    }

    /**
     * Round robin server selection
     */
    roundRobinSelection(servers) {
        const server = servers[this.currentIndex % servers.length];
        this.currentIndex++;
        return server;
    }

    /**
     * Weighted round robin server selection
     */
    weightedRoundRobinSelection(servers) {
        const totalWeight = servers.reduce((sum, server) => sum + server.weight, 0);
        let randomWeight = Math.random() * totalWeight;
        
        for (const server of servers) {
            randomWeight -= server.weight;
            if (randomWeight <= 0) {
                return server;
            }
        }
        
        return servers[0]; // Fallback
    }

    /**
     * Least connections server selection
     */
    leastConnectionsSelection(servers) {
        return servers.reduce((min, server) => 
            server.currentConnections < min.currentConnections ? server : min
        );
    }

    /**
     * Least response time server selection
     */
    leastResponseTimeSelection(servers) {
        return servers.reduce((min, server) => 
            server.averageResponseTime < min.averageResponseTime ? server : min
        );
    }

    /**
     * Resource-based server selection
     */
    resourceBasedSelection(servers) {
        // Select server based on a combination of connections and response time
        return servers.reduce((best, server) => {
            const serverScore = this.calculateServerScore(server);
            const bestScore = this.calculateServerScore(best);
            return serverScore < bestScore ? server : best;
        });
    }

    /**
     * Hash-based server selection
     */
    hashBasedSelection(servers, hash) {
        if (!hash) {
            return this.roundRobinSelection(servers);
        }
        
        const hashValue = this.simpleHash(hash);
        const index = hashValue % servers.length;
        return servers[index];
    }

    /**
     * Calculate server score for resource-based selection
     */
    calculateServerScore(server) {
        const connectionRatio = server.currentConnections / server.maxConnections;
        const responseTimeRatio = server.averageResponseTime / 1000; // Normalize to seconds
        
        // Lower score is better
        return (connectionRatio * 0.6) + (responseTimeRatio * 0.4);
    }

    /**
     * Simple hash function
     */
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Get healthy servers
     */
    getHealthyServers() {
        return Array.from(this.servers.values()).filter(server => 
            server.status === ServerStatus.HEALTHY || server.status === ServerStatus.DEGRADED
        );
    }

    /**
     * Update server metrics
     */
    updateServerMetrics(serverId, responseTime, success) {
        const server = this.servers.get(serverId);
        if (!server) return;

        server.totalRequests++;
        server.totalResponseTime += responseTime;
        server.averageResponseTime = server.totalResponseTime / server.totalRequests;

        if (success) {
            server.successfulRequests++;
        } else {
            server.failedRequests++;
        }

        // Update metrics map
        const metrics = this.metrics.serverMetrics.get(serverId);
        if (metrics) {
            metrics.requests++;
            if (success) {
                metrics.responses++;
            } else {
                metrics.errors++;
            }
            metrics.avgResponseTime = server.averageResponseTime;
        }
    }

    /**
     * Update global metrics
     */
    updateGlobalMetrics(responseTime, success) {
        this.metrics.totalRequests++;
        this.metrics.totalResponseTime += responseTime;

        if (success) {
            this.metrics.successfulRequests++;
        } else {
            this.metrics.failedRequests++;
        }
    }

    /**
     * Start health checks
     */
    startHealthChecks() {
        if (this.healthCheckInterval) {
            return;
        }

        this.healthCheckInterval = setInterval(() => {
            this.performHealthChecks();
        }, this.config.healthCheckInterval);

        console.log('Health checks started');
    }

    /**
     * Stop health checks
     */
    stopHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Perform health checks on all servers
     */
    async performHealthChecks() {
        const promises = Array.from(this.servers.values()).map(server => 
            this.performHealthCheck(server)
        );

        await Promise.allSettled(promises);
    }

    /**
     * Perform health check on a single server
     */
    async performHealthCheck(server) {
        try {
            const startTime = performance.now();
            
            // Simple TCP connection test (in production, use HTTP health endpoint)
            await this.testConnection(server);
            
            const responseTime = performance.now() - startTime;
            
            // Update server status
            const previousStatus = server.status;
            server.status = responseTime < 1000 ? ServerStatus.HEALTHY : ServerStatus.DEGRADED;
            server.lastHealthCheck = Date.now();
            server.healthCheckFailures = 0;
            
            if (previousStatus !== server.status) {
                this.emit('server_status_changed', { server, previousStatus });
            }

        } catch (error) {
            server.healthCheckFailures++;
            const previousStatus = server.status;
            
            if (server.healthCheckFailures >= 3) {
                server.status = ServerStatus.UNHEALTHY;
            } else {
                server.status = ServerStatus.DEGRADED;
            }
            
            server.lastHealthCheck = Date.now();
            
            if (previousStatus !== server.status) {
                this.emit('server_status_changed', { server, previousStatus, error });
            }
        }
    }

    /**
     * Test connection to a server
     */
    async testConnection(server) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Health check timeout'));
            }, this.config.healthCheckTimeout);

            // Simulate connection test
            setTimeout(() => {
                clearTimeout(timeout);
                resolve();
            }, Math.random() * 100); // Random delay 0-100ms
        });
    }

    /**
     * Get load balancer statistics
     */
    getStats() {
        const servers = Array.from(this.servers.values());
        const healthyCount = servers.filter(s => s.status === ServerStatus.HEALTHY).length;
        const degradedCount = servers.filter(s => s.status === ServerStatus.DEGRADED).length;
        const unhealthyCount = servers.filter(s => s.status === ServerStatus.UNHEALTHY).length;
        
        const avgResponseTime = this.metrics.totalRequests > 0 
            ? this.metrics.totalResponseTime / this.metrics.totalRequests 
            : 0;
        
        const successRate = this.metrics.totalRequests > 0 
            ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
            : 0;

        return {
            strategy: this.config.strategy,
            totalServers: servers.length,
            healthyServers: healthyCount,
            degradedServers: degradedCount,
            unhealthyServers: unhealthyCount,
            totalRequests: this.metrics.totalRequests,
            successfulRequests: this.metrics.successfulRequests,
            failedRequests: this.metrics.failedRequests,
            averageResponseTime: avgResponseTime,
            successRate,
            activeSessions: this.sessions.size,
            isRunning: this.isRunning
        };
    }

    /**
     * Get server details
     */
    getServers() {
        return Array.from(this.servers.values());
    }

    /**
     * Get server by ID
     */
    getServer(id) {
        return this.servers.get(id);
    }

    /**
     * Shutdown the load balancer
     */
    async shutdown() {
        console.log('Shutting down load balancer...');
        
        this.stopHealthChecks();
        this.sessions.clear();
        this.isRunning = false;
        
        this.emit('shutdown');
        console.log('Load balancer shut down');
    }

    /**
     * Utility function for delays
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default LoadBalancer;

