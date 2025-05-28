/**
 * @fileoverview Webhook Configuration
 * @description Configuration settings for GitHub webhook handlers and PR validation
 */

export const webhookConfig = {
  server: {
    port: process.env.WEBHOOK_PORT || 3000,
    host: process.env.WEBHOOK_HOST || '0.0.0.0',
    timeout: process.env.WEBHOOK_TIMEOUT || 30000
  },
  github: {
    token: process.env.GITHUB_TOKEN,
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET,
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com'
  },
  validation: {
    maxPRSize: parseInt(process.env.MAX_PR_SIZE) || 500,
    requireTests: process.env.REQUIRE_TESTS !== 'false',
    securityScan: process.env.SECURITY_SCAN !== 'false',
    performanceCheck: process.env.PERFORMANCE_CHECK !== 'false',
    maxFilesChanged: parseInt(process.env.MAX_FILES_CHANGED) || 50,
    complexityThreshold: parseInt(process.env.COMPLEXITY_THRESHOLD) || 10
  },
  codegen: {
    baseURL: process.env.CODEGEN_API_URL || 'https://api.codegen.sh',
    apiKey: process.env.CODEGEN_API_KEY,
    timeout: parseInt(process.env.CODEGEN_TIMEOUT) || 60000
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP to 100 requests per windowMs
    skipSuccessfulRequests: true
  },
  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
    metricsPort: process.env.METRICS_PORT || 9090,
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableRequestLogging: process.env.ENABLE_REQUEST_LOGGING !== 'false',
    enableErrorTracking: process.env.ENABLE_ERROR_TRACKING !== 'false'
  }
};

export const securityPatterns = [
  {
    name: 'password',
    pattern: /password\s*[=:]\s*["'][^"']+["']/gi,
    severity: 'critical'
  },
  {
    name: 'api_key',
    pattern: /api[_-]?key\s*[=:]\s*["'][^"']+["']/gi,
    severity: 'critical'
  },
  {
    name: 'secret',
    pattern: /secret\s*[=:]\s*["'][^"']+["']/gi,
    severity: 'critical'
  },
  {
    name: 'token',
    pattern: /token\s*[=:]\s*["'][^"']+["']/gi,
    severity: 'critical'
  },
  {
    name: 'private_key',
    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/gi,
    severity: 'critical'
  },
  {
    name: 'aws_access_key',
    pattern: /AKIA[0-9A-Z]{16}/gi,
    severity: 'critical'
  },
  {
    name: 'github_token',
    pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/gi,
    severity: 'critical'
  }
];

export const validationRules = {
  pr: {
    maxSize: webhookConfig.validation.maxPRSize,
    maxFiles: webhookConfig.validation.maxFilesChanged,
    requireTests: webhookConfig.validation.requireTests,
    requireDocumentation: false,
    allowedFileTypes: ['.js', '.ts', '.jsx', '.tsx', '.json', '.md', '.yml', '.yaml'],
    blockedFileTypes: ['.env', '.key', '.pem', '.p12']
  },
  commits: {
    maxCommits: 50,
    requireSignedCommits: false,
    conventionalCommits: false
  },
  security: {
    scanForSecrets: webhookConfig.validation.securityScan,
    scanForVulnerabilities: true,
    allowedDomains: ['github.com', 'githubusercontent.com']
  }
};

export default webhookConfig;

