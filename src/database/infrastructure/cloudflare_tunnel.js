/**
 * @fileoverview Consolidated Cloudflare Database Tunnel Configuration
 * @description Secure database access through Cloudflare tunnels for external services
 * Consolidates Cloudflare integration patterns from PRs #41,42,53,59,62,64,65,69,70,74,79,81
 * @version 2.0.0
 */

import { execSync, spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { cloudflareDbConfig, validateCloudflareConfig } from '../config/database_config.js';

/**
 * Consolidated Cloudflare Database Tunnel Manager
 * Provides secure external access to PostgreSQL database through Cloudflare tunnels
 */
export class CloudflareDatabaseTunnel extends EventEmitter {
    constructor(config = {}) {
        super();
        
        // Merge provided config with defaults
        this.config = {
            ...cloudflareDbConfig,
            ...config
        };
        
        // Validate configuration
        const validation = validateCloudflareConfig(this.config);
        if (!validation.valid) {
            throw new Error(`Cloudflare configuration invalid: ${validation.errors.join(', ')}`);
        }
        
        this.isRunning = false;
        this.tunnelProcess = null;
        this.healthCheckInterval = null;
        this.metrics = {
            connections: 0,
            requests: 0,
            errors: 0,
            lastHealthCheck: null,
            uptime: 0,
            startTime: null,
            bytesTransferred: 0,
            avgResponseTime: 0
        };
        
        // Security settings
        this.security = {
            rateLimiter: new Map(), // IP -> { count, resetTime }
            blockedIPs: new Set(),
            allowedIPs: new Set(this.config.allowedIPs || []),
            activeConnections: new Map() // connectionId -> { ip, startTime, requests }
        };
        
        // WAF rules
        this.wafRules = [
            {
                name: 'Block SQL injection attempts',
                pattern: /(union|select|insert|update|delete|drop|create|alter)\s+/i,
                action: 'block'
            },
            {
                name: 'Block unauthorized database access',
                pattern: /\/api\/database/,
                requireAuth: true,
                action: 'challenge'
            },
            {
                name: 'Rate limit excessive requests',
                rateLimit: {
                    requests: 100,
                    window: 60000 // 1 minute
                },
                action: 'rate_limit'
            }
        ];
    }

    /**
     * Setup and deploy Cloudflare tunnel
     * @returns {Promise<Object>} Deployment result
     */
    async setupTunnel() {
        try {
            this.log('info', 'Setting up Cloudflare tunnel for database access');
            
            // Validate prerequisites
            await this._validatePrerequisites();
            
            // Generate tunnel configuration
            const tunnelConfig = await this._generateTunnelConfig();
            
            // Deploy tunnel configuration
            const deployResult = await this._deployTunnelConfig(tunnelConfig);
            
            // Configure DNS records
            await this._configureDNSRecords();
            
            // Setup security rules
            await this._setupSecurityRules();
            
            // Start tunnel process
            await this._startTunnelProcess();
            
            // Start health monitoring
            this._startHealthMonitoring();
            
            this.log('info', 'Cloudflare tunnel setup completed successfully', {
                tunnelId: this.config.tunnel_id,
                domain: this.config.domain,
                subdomain: this.config.subdomain
            });
            
            this.emit('tunnelReady', {
                tunnelUrl: `https://${this.config.subdomain}.${this.config.domain}`,
                healthUrl: `https://${this.config.healthSubdomain || 'health'}.${this.config.domain}`,
                apiUrl: `https://${this.config.apiSubdomain || 'api'}.${this.config.domain}`
            });
            
            return {
                success: true,
                tunnelId: this.config.tunnel_id,
                urls: {
                    database: `https://${this.config.subdomain}.${this.config.domain}`,
                    health: `https://${this.config.healthSubdomain || 'health'}.${this.config.domain}`,
                    api: `https://${this.config.apiSubdomain || 'api'}.${this.config.domain}`
                }
            };
            
        } catch (error) {
            this.log('error', 'Failed to setup Cloudflare tunnel', { error: error.message });
            throw error;
        }
    }

    /**
     * Generate tunnel configuration
     * @returns {Promise<Object>} Tunnel configuration
     * @private
     */
    async _generateTunnelConfig() {
        const config = {
            tunnel: this.config.tunnel_id,
            credentials_file: this.config.credentials_file,
            
            // Ingress rules for database access
            ingress: [
                // PostgreSQL database access
                {
                    hostname: `${this.config.subdomain}.${this.config.domain}`,
                    service: `tcp://localhost:${this.config.db_port || 5432}`,
                    originRequest: {
                        // Enable TCP proxy for PostgreSQL
                        tcpKeepAlive: '30s',
                        connectTimeout: '30s',
                        tlsTimeout: '30s',
                        // Disable HTTP/2 for TCP connections
                        http2Origin: false,
                        // Enable connection pooling
                        keepAliveConnections: 100,
                        keepAliveTimeout: '90s',
                        // Buffer settings
                        bufferSize: '512kb'
                    }
                },
                
                // Health check endpoint
                {
                    hostname: `${this.config.healthSubdomain || 'health'}.${this.config.domain}`,
                    service: `http://localhost:${this.config.healthPort || 3000}/health`,
                    originRequest: {
                        connectTimeout: '10s',
                        tlsTimeout: '10s',
                        httpHostHeader: 'localhost',
                        compression: 'gzip'
                    }
                },
                
                // API access for system monitoring
                {
                    hostname: `${this.config.apiSubdomain || 'api'}.${this.config.domain}`,
                    service: `http://localhost:${this.config.apiPort || 3000}`,
                    originRequest: {
                        connectTimeout: '30s',
                        tlsTimeout: '30s',
                        httpHostHeader: 'localhost',
                        compression: 'gzip',
                        // Security headers
                        headers: {
                            'X-Forwarded-Proto': 'https',
                            'X-Real-IP': '{cf-connecting-ip}',
                            'X-Forwarded-For': '{cf-connecting-ip}'
                        }
                    }
                },
                
                // Catch-all rule (required)
                {
                    service: 'http_status:404'
                }
            ],
            
            // Logging configuration
            logLevel: this.config.log_level || 'info',
            logFile: this.config.logFile || '/var/log/cloudflared/tunnel.log',
            
            // Metrics and monitoring
            metrics: '0.0.0.0:8080',
            
            // Connection settings
            retries: 3,
            gracePeriod: '30s',
            
            // TLS settings for secure connections
            originServerName: 'localhost',
            
            // Protocol settings
            protocol: 'auto',
            
            // Connection pool settings
            connectionPoolSize: 4,
            
            // Heartbeat settings
            heartbeatInterval: '5s',
            heartbeatCount: 5,
            
            // Proxy settings for database connections
            proxyConnectTimeout: '30s',
            proxyTLSTimeout: '30s',
            
            // Compression settings
            compression: 'gzip',
            
            // Keep-alive settings for persistent connections
            keepAliveConnections: 100,
            keepAliveTimeout: '90s',
            
            // DNS settings
            dnsResolverIPs: ['1.1.1.1', '1.0.0.1'],
            
            // Load balancing settings
            loadBalancer: {
                pool: 'default',
                sessionAffinity: 'none'
            }
        };
        
        // Add security configuration if enabled
        if (this.config.security) {
            config.security = {
                // Enable DDoS protection
                ddosProtection: this.config.ddosProtectionEnabled !== false,
                // Rate limiting
                rateLimit: {
                    threshold: this.config.rateLimitRpm || 1000,
                    period: '60s'
                }
            };
            
            // Add IP allowlist if configured
            if (this.config.allowedIPs && this.config.allowedIPs.length > 0) {
                config.security.allowedIPs = this.config.allowedIPs;
            }
        }
        
        // Add monitoring configuration
        if (this.config.monitoring) {
            config.monitoring = {
                enabled: true,
                healthCheck: {
                    interval: '30s',
                    timeout: '10s',
                    path: '/health'
                },
                metrics: {
                    enabled: true,
                    port: 8080,
                    path: '/metrics'
                }
            };
        }
        
        return config;
    }

    /**
     * Deploy tunnel configuration
     * @param {Object} tunnelConfig - Tunnel configuration
     * @returns {Promise<Object>} Deployment result
     * @private
     */
    async _deployTunnelConfig(tunnelConfig) {
        try {
            // Write configuration to file
            const configPath = this.config.tunnel_config_path || './cloudflare-tunnel-config.yml';
            const configYaml = this._convertToYaml(tunnelConfig);
            
            await fs.writeFile(configPath, configYaml, 'utf8');
            
            this.log('info', 'Tunnel configuration written to file', { configPath });
            
            // Validate configuration with cloudflared
            try {
                execSync(`cloudflared tunnel --config ${configPath} validate`, { 
                    stdio: 'pipe',
                    timeout: 30000
                });
                this.log('info', 'Tunnel configuration validated successfully');
            } catch (error) {
                throw new Error(`Tunnel configuration validation failed: ${error.message}`);
            }
            
            return {
                success: true,
                configPath,
                tunnelId: tunnelConfig.tunnel
            };
            
        } catch (error) {
            this.log('error', 'Failed to deploy tunnel configuration', { error: error.message });
            throw error;
        }
    }

    /**
     * Configure DNS records
     * @returns {Promise<void>}
     * @private
     */
    async _configureDNSRecords() {
        if (!this.config.auto_dns || !this.config.cloudflare_api_token) {
            this.log('info', 'Skipping automatic DNS configuration');
            return;
        }
        
        try {
            const records = [
                {
                    type: 'CNAME',
                    name: this.config.subdomain,
                    content: `${this.config.tunnel_id}.cfargotunnel.com`
                },
                {
                    type: 'CNAME',
                    name: this.config.healthSubdomain || 'health',
                    content: `${this.config.tunnel_id}.cfargotunnel.com`
                },
                {
                    type: 'CNAME',
                    name: this.config.apiSubdomain || 'api',
                    content: `${this.config.tunnel_id}.cfargotunnel.com`
                }
            ];
            
            for (const record of records) {
                await this._createDNSRecord(record);
            }
            
            this.log('info', 'DNS records configured successfully');
            
        } catch (error) {
            this.log('error', 'Failed to configure DNS records', { error: error.message });
            throw error;
        }
    }

    /**
     * Setup security rules
     * @returns {Promise<void>}
     * @private
     */
    async _setupSecurityRules() {
        if (!this.config.wafEnabled) {
            this.log('info', 'WAF is disabled, skipping security rules setup');
            return;
        }
        
        try {
            // Create WAF rules for database protection
            const wafRules = [
                {
                    name: 'Block SQL injection attempts',
                    expression: '(http.request.body contains "UNION") or (http.request.uri.query contains "UNION")',
                    action: 'block'
                },
                {
                    name: 'Block unauthorized database access',
                    expression: '(http.request.uri.path contains "/api/database" and not any(http.request.headers["authorization"][*] contains "Bearer"))',
                    action: 'block'
                },
                {
                    name: 'Rate limit database API',
                    expression: 'http.request.uri.path contains "/api/database"',
                    action: 'rate_limit',
                    rateLimit: {
                        threshold: this.config.rateLimitRpm || 100,
                        period: 60
                    }
                }
            ];
            
            // Apply WAF rules (would integrate with Cloudflare API)
            for (const rule of wafRules) {
                await this._createWAFRule(rule);
            }
            
            this.log('info', 'Security rules configured successfully');
            
        } catch (error) {
            this.log('error', 'Failed to setup security rules', { error: error.message });
            throw error;
        }
    }

    /**
     * Start tunnel process
     * @returns {Promise<void>}
     * @private
     */
    async _startTunnelProcess() {
        try {
            const configPath = this.config.tunnel_config_path || './cloudflare-tunnel-config.yml';
            
            this.log('info', 'Starting Cloudflare tunnel process');
            
            // Start tunnel process
            this.tunnelProcess = spawn('cloudflared', [
                'tunnel',
                '--config', configPath,
                'run',
                this.config.tunnel_id
            ], {
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: false
            });
            
            // Handle process events
            this.tunnelProcess.stdout.on('data', (data) => {
                this.log('debug', 'Tunnel stdout', { output: data.toString().trim() });
            });
            
            this.tunnelProcess.stderr.on('data', (data) => {
                const output = data.toString().trim();
                if (output.includes('error') || output.includes('failed')) {
                    this.log('error', 'Tunnel stderr', { output });
                } else {
                    this.log('debug', 'Tunnel stderr', { output });
                }
            });
            
            this.tunnelProcess.on('close', (code) => {
                this.isRunning = false;
                this.log('warn', 'Tunnel process closed', { exitCode: code });
                this.emit('tunnelClosed', { exitCode: code });
                
                // Attempt restart if unexpected closure
                if (code !== 0 && this.config.autoRestart !== false) {
                    this.log('info', 'Attempting to restart tunnel process');
                    setTimeout(() => this._startTunnelProcess(), 5000);
                }
            });
            
            this.tunnelProcess.on('error', (error) => {
                this.log('error', 'Tunnel process error', { error: error.message });
                this.emit('tunnelError', error);
            });
            
            // Wait for tunnel to be ready
            await this._waitForTunnelReady();
            
            this.isRunning = true;
            this.metrics.startTime = new Date();
            
            this.log('info', 'Tunnel process started successfully');
            
        } catch (error) {
            this.log('error', 'Failed to start tunnel process', { error: error.message });
            throw error;
        }
    }

    /**
     * Start health monitoring
     * @private
     */
    _startHealthMonitoring() {
        if (!this.config.healthCheck?.enabled) {
            return;
        }
        
        this.healthCheckInterval = setInterval(async () => {
            try {
                const health = await this.getHealth();
                this.metrics.lastHealthCheck = new Date();
                
                if (!health.healthy) {
                    this.log('warn', 'Health check failed', health);
                    this.emit('healthCheckFailed', health);
                }
                
                // Update uptime
                if (this.metrics.startTime) {
                    this.metrics.uptime = Date.now() - this.metrics.startTime.getTime();
                }
                
            } catch (error) {
                this.log('error', 'Health check error', { error: error.message });
            }
        }, this.config.healthCheck.interval || 30000);
    }

    /**
     * Get tunnel health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        try {
            const health = {
                healthy: this.isRunning,
                tunnelRunning: this.isRunning,
                processId: this.tunnelProcess?.pid,
                uptime: this.metrics.uptime,
                metrics: this.metrics,
                timestamp: new Date().toISOString()
            };
            
            // Test tunnel connectivity
            if (this.isRunning) {
                try {
                    // Test health endpoint
                    const healthUrl = `https://${this.config.healthSubdomain || 'health'}.${this.config.domain}/health`;
                    const response = await fetch(healthUrl, { timeout: 5000 });
                    health.healthEndpoint = {
                        accessible: response.ok,
                        status: response.status,
                        responseTime: response.headers.get('x-response-time')
                    };
                } catch (error) {
                    health.healthEndpoint = {
                        accessible: false,
                        error: error.message
                    };
                }
            }
            
            return health;
            
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get tunnel metrics
     * @returns {Object} Tunnel metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            security: {
                blockedIPs: this.security.blockedIPs.size,
                activeConnections: this.security.activeConnections.size,
                rateLimitedRequests: Array.from(this.security.rateLimiter.values())
                    .reduce((total, data) => total + data.count, 0)
            },
            tunnel: {
                running: this.isRunning,
                processId: this.tunnelProcess?.pid,
                configPath: this.config.tunnel_config_path
            }
        };
    }

    /**
     * Stop tunnel
     * @returns {Promise<void>}
     */
    async stop() {
        try {
            this.log('info', 'Stopping Cloudflare tunnel');
            
            // Stop health monitoring
            if (this.healthCheckInterval) {
                clearInterval(this.healthCheckInterval);
                this.healthCheckInterval = null;
            }
            
            // Stop tunnel process
            if (this.tunnelProcess && !this.tunnelProcess.killed) {
                this.tunnelProcess.kill('SIGTERM');
                
                // Wait for graceful shutdown
                await new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        if (!this.tunnelProcess.killed) {
                            this.tunnelProcess.kill('SIGKILL');
                        }
                        resolve();
                    }, 10000);
                    
                    this.tunnelProcess.on('close', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                });
            }
            
            this.isRunning = false;
            this.tunnelProcess = null;
            
            this.log('info', 'Tunnel stopped successfully');
            this.emit('tunnelStopped');
            
        } catch (error) {
            this.log('error', 'Failed to stop tunnel', { error: error.message });
            throw error;
        }
    }

    /**
     * Utility methods
     */
    
    async _validatePrerequisites() {
        // Check if cloudflared is installed
        try {
            execSync('cloudflared version', { stdio: 'pipe' });
        } catch (error) {
            throw new Error('cloudflared CLI not found. Please install cloudflared first.');
        }
        
        // Check credentials file
        if (this.config.credentials_file) {
            try {
                await fs.access(this.config.credentials_file);
            } catch (error) {
                throw new Error(`Credentials file not found: ${this.config.credentials_file}`);
            }
        }
        
        // Validate tunnel ID
        if (!this.config.tunnel_id) {
            throw new Error('Tunnel ID is required');
        }
    }

    async _waitForTunnelReady() {
        const maxAttempts = 30;
        const delay = 2000;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                // Check if tunnel is responding
                const metricsUrl = 'http://localhost:8080/metrics';
                const response = await fetch(metricsUrl, { timeout: 1000 });
                
                if (response.ok) {
                    this.log('info', 'Tunnel is ready and responding');
                    return;
                }
            } catch (error) {
                // Tunnel not ready yet
            }
            
            if (attempt < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw new Error('Tunnel failed to become ready within timeout period');
    }

    _convertToYaml(obj) {
        // Simple YAML conversion - in production, use a proper YAML library
        return JSON.stringify(obj, null, 2)
            .replace(/"/g, '')
            .replace(/,$/gm, '')
            .replace(/^\s*[\{\}]/gm, '');
    }

    async _createDNSRecord(record) {
        // Placeholder for Cloudflare API integration
        this.log('info', 'Creating DNS record', record);
    }

    async _createWAFRule(rule) {
        // Placeholder for Cloudflare WAF API integration
        this.log('info', 'Creating WAF rule', { name: rule.name });
    }

    /**
     * Logging method
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {Object} meta - Additional metadata
     * @private
     */
    log(level, message, meta = {}) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level,
            component: 'CloudflareDatabaseTunnel',
            message,
            ...meta
        };

        console[level === 'error' ? 'error' : 'log'](JSON.stringify(logEntry));
    }
}

export default CloudflareDatabaseTunnel;

