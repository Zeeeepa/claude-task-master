/**
 * WSL2 Configuration
 * 
 * Configuration settings for WSL2 environment management and resource allocation.
 */

export class WSL2Config {
    constructor(options = {}) {
        this.config = {
            // Distribution Configuration
            distribution: {
                name: options.distribution?.name || 'Ubuntu-22.04',
                version: options.distribution?.version || '22.04',
                architecture: options.distribution?.architecture || 'x64',
                imageUrl: options.distribution?.imageUrl || null,
                customImage: options.distribution?.customImage || false,
                ...options.distribution
            },

            // Resource Limits
            resources: {
                memory: {
                    default: '4GB',
                    minimum: '1GB',
                    maximum: '16GB',
                    ...options.resources?.memory
                },
                cpu: {
                    default: '2 cores',
                    minimum: '1 core',
                    maximum: '8 cores',
                    ...options.resources?.cpu
                },
                disk: {
                    default: '20GB',
                    minimum: '10GB',
                    maximum: '100GB',
                    ...options.resources?.disk
                },
                swap: {
                    enabled: true,
                    size: '2GB',
                    ...options.resources?.swap
                },
                ...options.resources
            },

            // Instance Management
            instances: {
                maxConcurrent: options.instances?.maxConcurrent || 10,
                namingPattern: options.instances?.namingPattern || 'pr-validation-{prNumber}-{timestamp}',
                autoCleanup: options.instances?.autoCleanup !== false,
                cleanupDelay: options.instances?.cleanupDelay || 300000, // 5 minutes
                healthCheckInterval: options.instances?.healthCheckInterval || 30000, // 30 seconds
                ...options.instances
            },

            // Network Configuration
            network: {
                enabled: options.network?.enabled !== false,
                mode: options.network?.mode || 'NAT', // NAT, Bridged, Host
                portRange: {
                    start: 22000,
                    end: 23000,
                    ...options.network?.portRange
                },
                dns: {
                    servers: ['8.8.8.8', '8.8.4.4'],
                    ...options.network?.dns
                },
                proxy: {
                    enabled: false,
                    http: null,
                    https: null,
                    ...options.network?.proxy
                },
                ...options.network
            },

            // Storage Configuration
            storage: {
                type: options.storage?.type || 'ext4',
                compression: options.storage?.compression || false,
                backup: {
                    enabled: false,
                    interval: 24 * 60 * 60 * 1000, // 24 hours
                    retention: 7, // 7 backups
                    ...options.storage?.backup
                },
                ...options.storage
            },

            // Security Configuration
            security: {
                isolation: {
                    enabled: true,
                    level: 'strict', // strict, moderate, minimal
                    ...options.security?.isolation
                },
                firewall: {
                    enabled: true,
                    defaultPolicy: 'deny',
                    allowedPorts: [22, 80, 443, 3000, 8000],
                    ...options.security?.firewall
                },
                userAccess: {
                    defaultUser: 'ubuntu',
                    sudoAccess: true,
                    passwordAuth: false,
                    keyAuth: true,
                    ...options.security?.userAccess
                },
                ...options.security
            },

            // Performance Configuration
            performance: {
                optimization: {
                    enabled: true,
                    profile: 'balanced', // performance, balanced, power-saving
                    ...options.performance?.optimization
                },
                caching: {
                    enabled: true,
                    size: '1GB',
                    ...options.performance?.caching
                },
                preallocation: {
                    enabled: false,
                    instances: 2,
                    ...options.performance?.preallocation
                },
                ...options.performance
            },

            // Environment Setup
            setup: {
                basePackages: [
                    'curl',
                    'wget',
                    'git',
                    'build-essential',
                    'python3',
                    'python3-pip',
                    'nodejs',
                    'npm'
                ],
                customPackages: options.setup?.customPackages || [],
                scripts: {
                    preSetup: options.setup?.scripts?.preSetup || [],
                    postSetup: options.setup?.scripts?.postSetup || [],
                    cleanup: options.setup?.scripts?.cleanup || []
                },
                timeout: options.setup?.timeout || 300000, // 5 minutes
                retries: options.setup?.retries || 3,
                ...options.setup
            },

            // Monitoring Configuration
            monitoring: {
                enabled: options.monitoring?.enabled !== false,
                metrics: {
                    cpu: true,
                    memory: true,
                    disk: true,
                    network: true,
                    processes: false,
                    ...options.monitoring?.metrics
                },
                interval: options.monitoring?.interval || 30000, // 30 seconds
                retention: options.monitoring?.retention || 24 * 60 * 60 * 1000, // 24 hours
                alerts: {
                    enabled: true,
                    thresholds: {
                        cpu: { warning: 80, critical: 95 },
                        memory: { warning: 80, critical: 95 },
                        disk: { warning: 85, critical: 95 }
                    },
                    ...options.monitoring?.alerts
                },
                ...options.monitoring
            },

            // Timeouts
            timeouts: {
                creation: options.timeouts?.creation || 120000, // 2 minutes
                startup: options.timeouts?.startup || 60000, // 1 minute
                shutdown: options.timeouts?.shutdown || 30000, // 30 seconds
                command: options.timeouts?.command || 300000, // 5 minutes
                healthCheck: options.timeouts?.healthCheck || 10000, // 10 seconds
                ...options.timeouts
            }
        };

        this.validateConfig();
    }

    /**
     * Validate configuration settings
     */
    validateConfig() {
        // Validate distribution
        if (!this.config.distribution.name) {
            throw new Error('WSL2 distribution name is required');
        }

        // Validate resource limits
        this.validateResourceLimits();

        // Validate instance limits
        if (this.config.instances.maxConcurrent < 1) {
            throw new Error('Maximum concurrent instances must be at least 1');
        }

        // Validate network configuration
        this.validateNetworkConfig();

        // Validate timeouts
        this.validateTimeouts();
    }

    /**
     * Validate resource limit configurations
     */
    validateResourceLimits() {
        const resources = this.config.resources;

        // Validate memory limits
        const memoryValues = this.parseResourceValues(resources.memory);
        if (memoryValues.default < memoryValues.minimum || memoryValues.default > memoryValues.maximum) {
            throw new Error('Default memory must be between minimum and maximum values');
        }

        // Validate CPU limits
        const cpuValues = this.parseResourceValues(resources.cpu);
        if (cpuValues.default < cpuValues.minimum || cpuValues.default > cpuValues.maximum) {
            throw new Error('Default CPU must be between minimum and maximum values');
        }

        // Validate disk limits
        const diskValues = this.parseResourceValues(resources.disk);
        if (diskValues.default < diskValues.minimum || diskValues.default > diskValues.maximum) {
            throw new Error('Default disk must be between minimum and maximum values');
        }
    }

    /**
     * Parse resource values to numeric format for comparison
     * @param {Object} resource - Resource configuration
     * @returns {Object} Parsed resource values
     */
    parseResourceValues(resource) {
        return {
            default: this.parseResourceValue(resource.default),
            minimum: this.parseResourceValue(resource.minimum),
            maximum: this.parseResourceValue(resource.maximum)
        };
    }

    /**
     * Parse individual resource value
     * @param {string} value - Resource value (e.g., '4GB', '2 cores')
     * @returns {number} Numeric value for comparison
     */
    parseResourceValue(value) {
        if (typeof value === 'number') {
            return value;
        }

        const str = value.toString().toLowerCase();
        
        // Parse memory values
        if (str.includes('gb')) {
            return parseFloat(str.replace('gb', '')) * 1024;
        }
        if (str.includes('mb')) {
            return parseFloat(str.replace('mb', ''));
        }
        
        // Parse CPU values
        if (str.includes('core')) {
            return parseFloat(str.replace(/[^0-9.]/g, ''));
        }
        
        // Default numeric parsing
        return parseFloat(str.replace(/[^0-9.]/g, '')) || 0;
    }

    /**
     * Validate network configuration
     */
    validateNetworkConfig() {
        const network = this.config.network;
        
        if (network.enabled) {
            // Validate port range
            if (network.portRange.start >= network.portRange.end) {
                throw new Error('Network port range start must be less than end');
            }
            
            if (network.portRange.start < 1024 || network.portRange.end > 65535) {
                throw new Error('Network port range must be between 1024 and 65535');
            }

            // Validate DNS servers
            if (!Array.isArray(network.dns.servers) || network.dns.servers.length === 0) {
                throw new Error('At least one DNS server must be specified');
            }
        }
    }

    /**
     * Validate timeout configurations
     */
    validateTimeouts() {
        const timeouts = this.config.timeouts;
        
        Object.keys(timeouts).forEach(key => {
            if (typeof timeouts[key] !== 'number' || timeouts[key] < 1000) {
                throw new Error(`Timeout ${key} must be a number >= 1000ms`);
            }
        });
    }

    /**
     * Get distribution configuration
     * @returns {Object} Distribution configuration
     */
    getDistributionConfig() {
        return { ...this.config.distribution };
    }

    /**
     * Get resource configuration
     * @returns {Object} Resource configuration
     */
    getResourceConfig() {
        return { ...this.config.resources };
    }

    /**
     * Get instance configuration
     * @returns {Object} Instance configuration
     */
    getInstanceConfig() {
        return { ...this.config.instances };
    }

    /**
     * Get network configuration
     * @returns {Object} Network configuration
     */
    getNetworkConfig() {
        return { ...this.config.network };
    }

    /**
     * Get security configuration
     * @returns {Object} Security configuration
     */
    getSecurityConfig() {
        return { ...this.config.security };
    }

    /**
     * Get performance configuration
     * @returns {Object} Performance configuration
     */
    getPerformanceConfig() {
        return { ...this.config.performance };
    }

    /**
     * Get setup configuration
     * @returns {Object} Setup configuration
     */
    getSetupConfig() {
        return { ...this.config.setup };
    }

    /**
     * Get monitoring configuration
     * @returns {Object} Monitoring configuration
     */
    getMonitoringConfig() {
        return { ...this.config.monitoring };
    }

    /**
     * Get timeout configuration
     * @returns {Object} Timeout configuration
     */
    getTimeoutConfig() {
        return { ...this.config.timeouts };
    }

    /**
     * Get complete configuration
     * @returns {Object} Complete configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Generate instance name based on pattern
     * @param {Object} context - Context for name generation
     * @returns {string} Generated instance name
     */
    generateInstanceName(context = {}) {
        let name = this.config.instances.namingPattern;
        
        // Replace placeholders
        name = name.replace('{prNumber}', context.prNumber || 'unknown');
        name = name.replace('{timestamp}', Date.now());
        name = name.replace('{random}', Math.random().toString(36).substr(2, 9));
        name = name.replace('{user}', context.user || 'system');
        
        return name;
    }

    /**
     * Get resource requirements for a specific use case
     * @param {string} useCase - Use case (small, medium, large, custom)
     * @param {Object} customRequirements - Custom resource requirements
     * @returns {Object} Resource requirements
     */
    getResourceRequirements(useCase = 'medium', customRequirements = {}) {
        const presets = {
            small: {
                memory: this.config.resources.memory.minimum,
                cpu: this.config.resources.cpu.minimum,
                disk: this.config.resources.disk.minimum
            },
            medium: {
                memory: this.config.resources.memory.default,
                cpu: this.config.resources.cpu.default,
                disk: this.config.resources.disk.default
            },
            large: {
                memory: this.config.resources.memory.maximum,
                cpu: this.config.resources.cpu.maximum,
                disk: this.config.resources.disk.maximum
            }
        };

        const baseRequirements = presets[useCase] || presets.medium;
        
        return {
            ...baseRequirements,
            ...customRequirements
        };
    }

    /**
     * Get setup packages for a specific language/framework
     * @param {string} language - Programming language or framework
     * @returns {Array} Package list
     */
    getLanguagePackages(language) {
        const languagePackages = {
            javascript: ['nodejs', 'npm', 'yarn'],
            typescript: ['nodejs', 'npm', 'yarn', 'typescript'],
            python: ['python3', 'python3-pip', 'python3-venv'],
            java: ['openjdk-11-jdk', 'maven', 'gradle'],
            go: ['golang-go'],
            rust: ['rustc', 'cargo'],
            php: ['php', 'composer'],
            ruby: ['ruby', 'bundler'],
            dotnet: ['dotnet-sdk-6.0'],
            docker: ['docker.io', 'docker-compose']
        };

        return [
            ...this.config.setup.basePackages,
            ...(languagePackages[language.toLowerCase()] || []),
            ...this.config.setup.customPackages
        ];
    }

    /**
     * Create configuration from environment variables
     * @returns {WSL2Config} Configuration instance
     */
    static fromEnvironment() {
        const envConfig = {
            distribution: {
                name: process.env.WSL2_DISTRIBUTION,
                version: process.env.WSL2_VERSION,
                architecture: process.env.WSL2_ARCHITECTURE
            },
            resources: {
                memory: {
                    default: process.env.WSL2_MEMORY_DEFAULT,
                    minimum: process.env.WSL2_MEMORY_MIN,
                    maximum: process.env.WSL2_MEMORY_MAX
                },
                cpu: {
                    default: process.env.WSL2_CPU_DEFAULT,
                    minimum: process.env.WSL2_CPU_MIN,
                    maximum: process.env.WSL2_CPU_MAX
                },
                disk: {
                    default: process.env.WSL2_DISK_DEFAULT,
                    minimum: process.env.WSL2_DISK_MIN,
                    maximum: process.env.WSL2_DISK_MAX
                }
            },
            instances: {
                maxConcurrent: process.env.WSL2_MAX_INSTANCES ? parseInt(process.env.WSL2_MAX_INSTANCES) : undefined,
                namingPattern: process.env.WSL2_NAMING_PATTERN,
                autoCleanup: process.env.WSL2_AUTO_CLEANUP !== 'false'
            },
            network: {
                enabled: process.env.WSL2_NETWORK_ENABLED !== 'false',
                mode: process.env.WSL2_NETWORK_MODE
            },
            security: {
                isolation: {
                    enabled: process.env.WSL2_ISOLATION_ENABLED !== 'false',
                    level: process.env.WSL2_ISOLATION_LEVEL
                }
            },
            monitoring: {
                enabled: process.env.WSL2_MONITORING_ENABLED !== 'false',
                interval: process.env.WSL2_MONITORING_INTERVAL ? parseInt(process.env.WSL2_MONITORING_INTERVAL) : undefined
            }
        };

        // Remove undefined values
        const cleanConfig = JSON.parse(JSON.stringify(envConfig, (key, value) => 
            value === undefined ? null : value
        ));

        return new WSL2Config(cleanConfig);
    }

    /**
     * Export configuration to environment variables format
     * @returns {Object} Environment variables
     */
    toEnvironmentVariables() {
        return {
            WSL2_DISTRIBUTION: this.config.distribution.name,
            WSL2_VERSION: this.config.distribution.version,
            WSL2_ARCHITECTURE: this.config.distribution.architecture,
            
            WSL2_MEMORY_DEFAULT: this.config.resources.memory.default,
            WSL2_MEMORY_MIN: this.config.resources.memory.minimum,
            WSL2_MEMORY_MAX: this.config.resources.memory.maximum,
            
            WSL2_CPU_DEFAULT: this.config.resources.cpu.default,
            WSL2_CPU_MIN: this.config.resources.cpu.minimum,
            WSL2_CPU_MAX: this.config.resources.cpu.maximum,
            
            WSL2_DISK_DEFAULT: this.config.resources.disk.default,
            WSL2_DISK_MIN: this.config.resources.disk.minimum,
            WSL2_DISK_MAX: this.config.resources.disk.maximum,
            
            WSL2_MAX_INSTANCES: this.config.instances.maxConcurrent.toString(),
            WSL2_NAMING_PATTERN: this.config.instances.namingPattern,
            WSL2_AUTO_CLEANUP: this.config.instances.autoCleanup.toString(),
            
            WSL2_NETWORK_ENABLED: this.config.network.enabled.toString(),
            WSL2_NETWORK_MODE: this.config.network.mode,
            
            WSL2_ISOLATION_ENABLED: this.config.security.isolation.enabled.toString(),
            WSL2_ISOLATION_LEVEL: this.config.security.isolation.level,
            
            WSL2_MONITORING_ENABLED: this.config.monitoring.enabled.toString(),
            WSL2_MONITORING_INTERVAL: this.config.monitoring.interval.toString()
        };
    }
}

export default WSL2Config;

