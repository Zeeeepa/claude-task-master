/**
 * @fileoverview Performance Configuration
 * @description Configuration settings for the performance optimization and monitoring system
 */

/**
 * Default performance system configuration
 */
export const defaultPerformanceConfig = {
    // Global settings
    enabled: true,
    enablePerformanceMonitoring: true,
    enableHealthChecking: true,
    enableDatabaseOptimization: true,
    enableCaching: true,
    enableLoadBalancing: false, // Disabled by default for single-instance deployments
    enableMetricsCollection: true,
    
    // Dashboard and API settings
    dashboardPort: 3001,
    metricsPort: 9090,
    
    // Performance Monitor Configuration
    performanceMonitor: {
        enabled: true,
        collectInterval: 5000, // 5 seconds
        retentionPeriod: 3600000, // 1 hour
        thresholds: {
            cpuUsage: 80, // percentage
            memoryUsage: 85, // percentage
            responseTime: 1000, // milliseconds
            errorRate: 5 // percentage
        }
    },
    
    // Health Checker Configuration
    healthChecker: {
        enabled: true,
        checkInterval: 30000, // 30 seconds
        timeout: 5000, // 5 seconds
        retryAttempts: 3,
        retryDelay: 1000, // 1 second
        thresholds: {
            responseTime: 2000, // milliseconds
            errorRate: 10, // percentage
            memoryUsage: 90, // percentage
            cpuUsage: 85, // percentage
            diskUsage: 90 // percentage
        }
    },
    
    // Database Optimizer Configuration
    databaseOptimizer: {
        enabled: true,
        slowQueryThreshold: 1000, // 1 second
        connectionPoolSize: 20,
        connectionTimeout: 30000, // 30 seconds
        idleTimeout: 10000, // 10 seconds
        maxRetries: 3,
        retryDelay: 1000, // 1 second
        enableQueryLogging: true,
        enableIndexAnalysis: true
    },
    
    // Cache Manager Configuration
    cacheManager: {
        enabled: true,
        defaultTTL: 300000, // 5 minutes
        maxSize: 1000,
        strategy: 'lru', // lru, lfu, ttl, fifo
        enableMetrics: true,
        enableCompression: false,
        compressionThreshold: 1024, // 1KB
        cleanupInterval: 60000 // 1 minute
    },
    
    // Load Balancer Configuration
    loadBalancer: {
        enabled: false,
        strategy: 'round_robin', // round_robin, weighted_round_robin, least_connections, least_response_time, resource_based, hash
        healthCheckInterval: 30000, // 30 seconds
        healthCheckTimeout: 5000, // 5 seconds
        maxRetries: 3,
        retryDelay: 1000, // 1 second
        enableMetrics: true,
        enableStickySessions: false,
        sessionTimeout: 3600000 // 1 hour
    },
    
    // Metrics Collector Configuration
    metricsCollector: {
        enabled: true,
        collectInterval: 10000, // 10 seconds
        retentionPeriod: 86400000, // 24 hours
        maxMetrics: 10000,
        enableSystemMetrics: true,
        enableCustomMetrics: true,
        enableAggregation: true,
        aggregationInterval: 60000, // 1 minute
        exportFormats: ['json', 'prometheus']
    }
};

/**
 * Production performance configuration
 */
export const productionPerformanceConfig = {
    ...defaultPerformanceConfig,
    
    // More conservative thresholds for production
    performanceMonitor: {
        ...defaultPerformanceConfig.performanceMonitor,
        collectInterval: 10000, // 10 seconds
        retentionPeriod: 7200000, // 2 hours
        thresholds: {
            cpuUsage: 70,
            memoryUsage: 80,
            responseTime: 500,
            errorRate: 2
        }
    },
    
    healthChecker: {
        ...defaultPerformanceConfig.healthChecker,
        checkInterval: 15000, // 15 seconds
        thresholds: {
            responseTime: 1000,
            errorRate: 5,
            memoryUsage: 85,
            cpuUsage: 75,
            diskUsage: 85
        }
    },
    
    databaseOptimizer: {
        ...defaultPerformanceConfig.databaseOptimizer,
        slowQueryThreshold: 500, // 500ms
        connectionPoolSize: 50,
        enableQueryLogging: true,
        enableIndexAnalysis: true
    },
    
    cacheManager: {
        ...defaultPerformanceConfig.cacheManager,
        defaultTTL: 600000, // 10 minutes
        maxSize: 5000,
        enableCompression: true,
        compressionThreshold: 512 // 512 bytes
    },
    
    loadBalancer: {
        ...defaultPerformanceConfig.loadBalancer,
        enabled: true, // Enable for production
        enableStickySessions: true
    },
    
    metricsCollector: {
        ...defaultPerformanceConfig.metricsCollector,
        retentionPeriod: 172800000, // 48 hours
        maxMetrics: 50000
    }
};

/**
 * Development performance configuration
 */
export const developmentPerformanceConfig = {
    ...defaultPerformanceConfig,
    
    // More relaxed settings for development
    performanceMonitor: {
        ...defaultPerformanceConfig.performanceMonitor,
        collectInterval: 15000, // 15 seconds
        retentionPeriod: 1800000, // 30 minutes
        thresholds: {
            cpuUsage: 90,
            memoryUsage: 90,
            responseTime: 2000,
            errorRate: 10
        }
    },
    
    healthChecker: {
        ...defaultPerformanceConfig.healthChecker,
        checkInterval: 60000, // 1 minute
        thresholds: {
            responseTime: 5000,
            errorRate: 20,
            memoryUsage: 95,
            cpuUsage: 95,
            diskUsage: 95
        }
    },
    
    databaseOptimizer: {
        ...defaultPerformanceConfig.databaseOptimizer,
        slowQueryThreshold: 2000, // 2 seconds
        connectionPoolSize: 10,
        enableQueryLogging: true,
        enableIndexAnalysis: false // Disable for faster startup
    },
    
    cacheManager: {
        ...defaultPerformanceConfig.cacheManager,
        defaultTTL: 60000, // 1 minute
        maxSize: 100,
        enableCompression: false
    },
    
    metricsCollector: {
        ...defaultPerformanceConfig.metricsCollector,
        collectInterval: 30000, // 30 seconds
        retentionPeriod: 3600000, // 1 hour
        maxMetrics: 1000
    }
};

/**
 * Testing performance configuration
 */
export const testingPerformanceConfig = {
    ...defaultPerformanceConfig,
    
    // Minimal settings for testing
    performanceMonitor: {
        ...defaultPerformanceConfig.performanceMonitor,
        enabled: false // Disable for tests
    },
    
    healthChecker: {
        ...defaultPerformanceConfig.healthChecker,
        enabled: false // Disable for tests
    },
    
    databaseOptimizer: {
        ...defaultPerformanceConfig.databaseOptimizer,
        enabled: false // Disable for tests
    },
    
    cacheManager: {
        ...defaultPerformanceConfig.cacheManager,
        defaultTTL: 1000, // 1 second
        maxSize: 10
    },
    
    loadBalancer: {
        ...defaultPerformanceConfig.loadBalancer,
        enabled: false
    },
    
    metricsCollector: {
        ...defaultPerformanceConfig.metricsCollector,
        enabled: false // Disable for tests
    }
};

/**
 * Get performance configuration based on environment
 */
export function getPerformanceConfig(environment = 'development', customConfig = {}) {
    let baseConfig;
    
    switch (environment.toLowerCase()) {
        case 'production':
        case 'prod':
            baseConfig = productionPerformanceConfig;
            break;
        case 'development':
        case 'dev':
            baseConfig = developmentPerformanceConfig;
            break;
        case 'testing':
        case 'test':
            baseConfig = testingPerformanceConfig;
            break;
        default:
            baseConfig = defaultPerformanceConfig;
    }
    
    // Deep merge custom configuration
    return deepMerge(baseConfig, customConfig);
}

/**
 * Deep merge two objects
 */
function deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            result[key] = deepMerge(target[key] || {}, source[key]);
        } else {
            result[key] = source[key];
        }
    }
    
    return result;
}

/**
 * Validate performance configuration
 */
export function validatePerformanceConfig(config) {
    const errors = [];
    
    // Validate required fields
    if (typeof config.enabled !== 'boolean') {
        errors.push('config.enabled must be a boolean');
    }
    
    // Validate performance monitor config
    if (config.performanceMonitor) {
        const pm = config.performanceMonitor;
        if (pm.collectInterval && (typeof pm.collectInterval !== 'number' || pm.collectInterval < 1000)) {
            errors.push('performanceMonitor.collectInterval must be a number >= 1000');
        }
        if (pm.retentionPeriod && (typeof pm.retentionPeriod !== 'number' || pm.retentionPeriod < 60000)) {
            errors.push('performanceMonitor.retentionPeriod must be a number >= 60000');
        }
    }
    
    // Validate health checker config
    if (config.healthChecker) {
        const hc = config.healthChecker;
        if (hc.checkInterval && (typeof hc.checkInterval !== 'number' || hc.checkInterval < 5000)) {
            errors.push('healthChecker.checkInterval must be a number >= 5000');
        }
        if (hc.timeout && (typeof hc.timeout !== 'number' || hc.timeout < 1000)) {
            errors.push('healthChecker.timeout must be a number >= 1000');
        }
    }
    
    // Validate database optimizer config
    if (config.databaseOptimizer) {
        const db = config.databaseOptimizer;
        if (db.connectionPoolSize && (typeof db.connectionPoolSize !== 'number' || db.connectionPoolSize < 1)) {
            errors.push('databaseOptimizer.connectionPoolSize must be a number >= 1');
        }
        if (db.slowQueryThreshold && (typeof db.slowQueryThreshold !== 'number' || db.slowQueryThreshold < 100)) {
            errors.push('databaseOptimizer.slowQueryThreshold must be a number >= 100');
        }
    }
    
    // Validate cache manager config
    if (config.cacheManager) {
        const cm = config.cacheManager;
        if (cm.maxSize && (typeof cm.maxSize !== 'number' || cm.maxSize < 1)) {
            errors.push('cacheManager.maxSize must be a number >= 1');
        }
        if (cm.defaultTTL && (typeof cm.defaultTTL !== 'number' || cm.defaultTTL < 1000)) {
            errors.push('cacheManager.defaultTTL must be a number >= 1000');
        }
    }
    
    // Validate metrics collector config
    if (config.metricsCollector) {
        const mc = config.metricsCollector;
        if (mc.collectInterval && (typeof mc.collectInterval !== 'number' || mc.collectInterval < 1000)) {
            errors.push('metricsCollector.collectInterval must be a number >= 1000');
        }
        if (mc.maxMetrics && (typeof mc.maxMetrics !== 'number' || mc.maxMetrics < 100)) {
            errors.push('metricsCollector.maxMetrics must be a number >= 100');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

export default {
    defaultPerformanceConfig,
    productionPerformanceConfig,
    developmentPerformanceConfig,
    testingPerformanceConfig,
    getPerformanceConfig,
    validatePerformanceConfig
};

