/**
 * @fileoverview Infrastructure Testing Helper Utilities
 * @description Comprehensive utilities for infrastructure testing, consolidating Cloudflare, SSL, and monitoring test functionality
 */

import https from 'https';
import http from 'http';
import { URL } from 'url';
import { promisify } from 'util';
import { exec } from 'child_process';
import crypto from 'crypto';

const execAsync = promisify(exec);

// Test infrastructure configuration
const TEST_INFRASTRUCTURE_CONFIG = {
  cloudflare: {
    zoneId: process.env.CLOUDFLARE_TEST_ZONE_ID || 'test_zone_id',
    apiToken: process.env.CLOUDFLARE_TEST_API_TOKEN || 'test_token',
    proxyHostname: process.env.TEST_PROXY_HOSTNAME || 'test-proxy.example.com',
    apiBaseUrl: 'https://api.cloudflare.com/client/v4'
  },
  ssl: {
    certPath: process.env.TEST_SSL_CERT_PATH || '/tmp/test-cert.pem',
    keyPath: process.env.TEST_SSL_KEY_PATH || '/tmp/test-key.pem',
    caPath: process.env.TEST_SSL_CA_PATH || '/tmp/test-ca.pem'
  },
  network: {
    timeout: parseInt(process.env.TEST_NETWORK_TIMEOUT) || 30000,
    retryAttempts: parseInt(process.env.TEST_RETRY_ATTEMPTS) || 3,
    concurrentConnections: parseInt(process.env.TEST_CONCURRENT_CONNECTIONS) || 50
  },
  monitoring: {
    healthCheckUrl: process.env.TEST_HEALTH_CHECK_URL || 'http://localhost:3000/health',
    metricsUrl: process.env.TEST_METRICS_URL || 'http://localhost:3000/metrics',
    alertWebhook: process.env.TEST_ALERT_WEBHOOK || 'http://localhost:3000/alerts'
  }
};

/**
 * Make HTTP/HTTPS request with comprehensive options
 * @param {string} url - Request URL
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response object
 */
export async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'TaskMaster-Test-Client/1.0',
        ...options.headers
      },
      timeout: options.timeout || TEST_INFRASTRUCTURE_CONFIG.network.timeout,
      ...options.requestOptions
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const response = {
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          data: data,
          url: url,
          timing: {
            start: req.startTime,
            end: Date.now()
          }
        };

        // Parse JSON if content-type indicates JSON
        if (res.headers['content-type']?.includes('application/json')) {
          try {
            response.json = JSON.parse(data);
          } catch (e) {
            response.parseError = e.message;
          }
        }

        resolve(response);
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${requestOptions.timeout}ms`));
    });

    req.startTime = Date.now();

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Make request from specific IP (simulated)
 * @param {string} ip - Source IP address
 * @param {string} url - Request URL
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response object
 */
export async function makeRequestFromIP(ip, url, options = {}) {
  // In real testing, this would use network namespaces or proxy
  // For testing purposes, we simulate by adding headers
  const headers = {
    'X-Forwarded-For': ip,
    'X-Real-IP': ip,
    'X-Test-Source-IP': ip,
    ...options.headers
  };

  return makeRequest(url, { ...options, headers });
}

/**
 * Test SSL certificate validity
 * @param {string} hostname - Hostname to test
 * @param {number} port - Port number (default: 443)
 * @returns {Promise<Object>} Certificate information
 */
export async function getSSLCertificate(hostname, port = 443) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      method: 'GET',
      rejectUnauthorized: false, // For testing purposes
      agent: false
    };

    const req = https.request(options, (res) => {
      const cert = res.connection.getPeerCertificate();
      
      if (!cert || Object.keys(cert).length === 0) {
        reject(new Error('No certificate found'));
        return;
      }

      const certInfo = {
        subject: cert.subject,
        issuer: cert.issuer,
        valid: true,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        fingerprint: cert.fingerprint,
        serialNumber: cert.serialNumber,
        subjectAltNames: cert.subjectaltname?.split(', ') || [],
        daysUntilExpiry: Math.floor((new Date(cert.valid_to) - new Date()) / (1000 * 60 * 60 * 24))
      };

      // Check if certificate is expired
      const now = new Date();
      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      
      if (now < validFrom || now > validTo) {
        certInfo.valid = false;
        certInfo.error = 'Certificate is expired or not yet valid';
      }

      resolve(certInfo);
    });

    req.on('error', (error) => {
      reject(new Error(`SSL certificate check failed: ${error.message}`));
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('SSL certificate check timeout'));
    });

    req.end();
  });
}

/**
 * Get TLS connection information
 * @param {string} hostname - Hostname to test
 * @param {number} port - Port number (default: 443)
 * @returns {Promise<Object>} TLS information
 */
export async function getTLSInfo(hostname, port = 443) {
  return new Promise((resolve, reject) => {
    const socket = new https.Agent().createConnection({ host: hostname, port });
    
    socket.on('secureConnect', () => {
      const tlsInfo = {
        protocol: socket.getProtocol(),
        cipherSuite: socket.getCipher(),
        supportedVersions: [], // Would need additional probing
        peerCertificate: socket.getPeerCertificate(),
        authorized: socket.authorized,
        authorizationError: socket.authorizationError
      };

      socket.destroy();
      resolve(tlsInfo);
    });

    socket.on('error', (error) => {
      reject(new Error(`TLS connection failed: ${error.message}`));
    });

    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error('TLS connection timeout'));
    });
  });
}

/**
 * Test Cloudflare proxy functionality
 * @param {string} url - URL to test through proxy
 * @returns {Promise<Object>} Proxy test result
 */
export async function testCloudflareProxy(url) {
  try {
    const response = await makeRequest(url);
    
    const proxyInfo = {
      isCloudflare: false,
      rayId: null,
      country: null,
      datacenter: null,
      cacheStatus: null,
      responseTime: response.timing.end - response.timing.start
    };

    // Check Cloudflare headers
    if (response.headers['cf-ray']) {
      proxyInfo.isCloudflare = true;
      proxyInfo.rayId = response.headers['cf-ray'];
      proxyInfo.country = response.headers['cf-ipcountry'];
      proxyInfo.datacenter = response.headers['cf-ray']?.split('-')[1];
      proxyInfo.cacheStatus = response.headers['cf-cache-status'];
    }

    return {
      success: true,
      status: response.status,
      proxyInfo,
      headers: response.headers,
      responseTime: proxyInfo.responseTime
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Test rate limiting functionality
 * @param {string} url - URL to test
 * @param {number} requestCount - Number of requests to make
 * @param {number} interval - Interval between requests (ms)
 * @returns {Promise<Object>} Rate limiting test result
 */
export async function testRateLimiting(url, requestCount = 10, interval = 100) {
  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < requestCount; i++) {
    try {
      const response = await makeRequest(url);
      results.push({
        requestNumber: i + 1,
        status: response.status,
        rateLimited: response.status === 429,
        headers: {
          'x-ratelimit-limit': response.headers['x-ratelimit-limit'],
          'x-ratelimit-remaining': response.headers['x-ratelimit-remaining'],
          'x-ratelimit-reset': response.headers['x-ratelimit-reset']
        },
        timestamp: Date.now()
      });

      if (response.status === 429) {
        break; // Stop when rate limited
      }

      if (i < requestCount - 1) {
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    } catch (error) {
      results.push({
        requestNumber: i + 1,
        error: error.message,
        timestamp: Date.now()
      });
    }
  }

  const totalTime = Date.now() - startTime;
  const rateLimitedRequests = results.filter(r => r.rateLimited).length;

  return {
    totalRequests: requestCount,
    completedRequests: results.length,
    rateLimitedRequests,
    rateLimitTriggered: rateLimitedRequests > 0,
    totalTime,
    averageResponseTime: totalTime / results.length,
    results
  };
}

/**
 * Test bot management functionality
 * @param {string} url - URL to test
 * @param {string} userAgent - User agent string to test
 * @returns {Promise<Object>} Bot management test result
 */
export async function testBotManagement(url, userAgent) {
  try {
    const response = await makeRequest(url, {
      headers: {
        'User-Agent': userAgent
      }
    });

    return {
      success: true,
      status: response.status,
      blocked: response.status === 403,
      challenged: response.status === 503 || response.headers['cf-mitigated'] === 'challenge',
      botScore: response.headers['cf-bot-score'],
      mitigation: response.headers['cf-mitigated'],
      userAgent,
      responseTime: response.timing.end - response.timing.start
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      userAgent
    };
  }
}

/**
 * Perform health check
 * @param {string} url - Health check URL
 * @returns {Promise<Object>} Health check result
 */
export async function performHealthCheck(url = TEST_INFRASTRUCTURE_CONFIG.monitoring.healthCheckUrl) {
  try {
    const startTime = Date.now();
    const response = await makeRequest(url);
    const responseTime = Date.now() - startTime;

    let healthData = {};
    if (response.json) {
      healthData = response.json;
    }

    return {
      healthy: response.status === 200,
      status: response.status,
      responseTime,
      checks: healthData.checks || {},
      version: healthData.version,
      timestamp: healthData.timestamp || new Date().toISOString(),
      uptime: healthData.uptime
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      responseTime: null
    };
  }
}

/**
 * Test database connection through proxy
 * @returns {Promise<Object>} Database connection test result
 */
export async function testDatabaseConnectionThroughProxy() {
  try {
    // This would typically test actual database connection
    // For testing purposes, we simulate the connection test
    const startTime = Date.now();
    
    // Simulate connection attempt
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const connectionTime = Date.now() - startTime;

    return {
      connected: true,
      connectionTime,
      proxyUsed: true,
      ssl: true,
      error: null
    };
  } catch (error) {
    return {
      connected: false,
      connectionTime: null,
      proxyUsed: false,
      ssl: false,
      error: error.message
    };
  }
}

/**
 * Simulate network failure
 * @param {string} type - Type of failure to simulate
 * @returns {Promise<void>}
 */
export async function simulateNetworkFailure(type = 'connection') {
  // In real testing, this would manipulate network conditions
  // For testing purposes, we just log the simulation
  console.log(`Simulating network failure: ${type}`);
  
  // Could use tools like tc (traffic control) on Linux
  // or network namespace manipulation
  return Promise.resolve();
}

/**
 * Simulate service failure
 * @param {string} service - Service to simulate failure for
 * @returns {Promise<void>}
 */
export async function simulateServiceFailure(service) {
  console.log(`Simulating service failure: ${service}`);
  
  // In real testing, this would stop/restart services
  // or manipulate service responses
  return Promise.resolve();
}

/**
 * Test concurrent connections
 * @param {string} url - URL to test
 * @param {number} concurrency - Number of concurrent connections
 * @returns {Promise<Object>} Concurrent connection test result
 */
export async function testConcurrentConnections(url, concurrency = 10) {
  const startTime = Date.now();
  const promises = [];

  for (let i = 0; i < concurrency; i++) {
    promises.push(
      makeRequest(url).then(response => ({
        success: true,
        status: response.status,
        responseTime: response.timing.end - response.timing.start,
        connectionId: i
      })).catch(error => ({
        success: false,
        error: error.message,
        connectionId: i
      }))
    );
  }

  const results = await Promise.all(promises);
  const totalTime = Date.now() - startTime;
  const successfulConnections = results.filter(r => r.success).length;
  const averageResponseTime = results
    .filter(r => r.success)
    .reduce((sum, r) => sum + r.responseTime, 0) / successfulConnections;

  return {
    totalConnections: concurrency,
    successfulConnections,
    failedConnections: concurrency - successfulConnections,
    successRate: (successfulConnections / concurrency) * 100,
    totalTime,
    averageResponseTime: averageResponseTime || 0,
    results
  };
}

/**
 * Test failover functionality
 * @param {string} primaryUrl - Primary endpoint URL
 * @param {string} secondaryUrl - Secondary endpoint URL
 * @returns {Promise<Object>} Failover test result
 */
export async function testFailover(primaryUrl, secondaryUrl) {
  const results = {
    primaryAvailable: false,
    secondaryAvailable: false,
    failoverWorking: false,
    primaryResponseTime: null,
    secondaryResponseTime: null
  };

  try {
    // Test primary endpoint
    const primaryResponse = await makeRequest(primaryUrl);
    results.primaryAvailable = primaryResponse.status === 200;
    results.primaryResponseTime = primaryResponse.timing.end - primaryResponse.timing.start;
  } catch (error) {
    results.primaryError = error.message;
  }

  try {
    // Test secondary endpoint
    const secondaryResponse = await makeRequest(secondaryUrl);
    results.secondaryAvailable = secondaryResponse.status === 200;
    results.secondaryResponseTime = secondaryResponse.timing.end - secondaryResponse.timing.start;
  } catch (error) {
    results.secondaryError = error.message;
  }

  // Determine if failover is working
  results.failoverWorking = !results.primaryAvailable && results.secondaryAvailable;

  return results;
}

/**
 * Measure network latency
 * @param {string} hostname - Hostname to test
 * @param {number} count - Number of ping attempts
 * @returns {Promise<Object>} Latency measurement result
 */
export async function measureNetworkLatency(hostname, count = 5) {
  try {
    const { stdout } = await execAsync(`ping -c ${count} ${hostname}`);
    
    // Parse ping output (Linux/macOS format)
    const lines = stdout.split('\n');
    const statsLine = lines.find(line => line.includes('min/avg/max'));
    
    if (statsLine) {
      const match = statsLine.match(/(\d+\.\d+)\/(\d+\.\d+)\/(\d+\.\d+)/);
      if (match) {
        return {
          success: true,
          min: parseFloat(match[1]),
          avg: parseFloat(match[2]),
          max: parseFloat(match[3]),
          count,
          hostname
        };
      }
    }

    return {
      success: false,
      error: 'Could not parse ping output',
      hostname
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      hostname
    };
  }
}

/**
 * Test bandwidth utilization
 * @param {string} url - URL to test bandwidth with
 * @param {number} duration - Test duration in seconds
 * @returns {Promise<Object>} Bandwidth test result
 */
export async function testBandwidth(url, duration = 10) {
  const startTime = Date.now();
  const endTime = startTime + (duration * 1000);
  let totalBytes = 0;
  let requestCount = 0;

  while (Date.now() < endTime) {
    try {
      const response = await makeRequest(url);
      totalBytes += response.data.length;
      requestCount++;
    } catch (error) {
      // Continue testing even if some requests fail
    }
  }

  const actualDuration = (Date.now() - startTime) / 1000;
  const bytesPerSecond = totalBytes / actualDuration;
  const mbps = (bytesPerSecond * 8) / (1024 * 1024);

  return {
    duration: actualDuration,
    totalBytes,
    requestCount,
    bytesPerSecond,
    mbps,
    averageBytesPerRequest: totalBytes / requestCount
  };
}

/**
 * Generate test SSL certificate
 * @param {string} hostname - Hostname for certificate
 * @returns {Promise<Object>} Certificate generation result
 */
export async function generateTestSSLCertificate(hostname) {
  try {
    const keyPath = `/tmp/test-${hostname}-key.pem`;
    const certPath = `/tmp/test-${hostname}-cert.pem`;

    // Generate private key
    await execAsync(`openssl genrsa -out ${keyPath} 2048`);

    // Generate certificate
    await execAsync(`openssl req -new -x509 -key ${keyPath} -out ${certPath} -days 365 -subj "/CN=${hostname}"`);

    return {
      success: true,
      keyPath,
      certPath,
      hostname
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      hostname
    };
  }
}

/**
 * Validate infrastructure configuration
 * @param {Object} config - Infrastructure configuration
 * @returns {Object} Validation result
 */
export function validateInfrastructureConfig(config) {
  const errors = [];
  const warnings = [];

  // Validate Cloudflare configuration
  if (!config.cloudflare?.zoneId) {
    errors.push('Cloudflare zone ID is required');
  }
  if (!config.cloudflare?.apiToken) {
    errors.push('Cloudflare API token is required');
  }
  if (!config.cloudflare?.proxyHostname) {
    errors.push('Cloudflare proxy hostname is required');
  }

  // Validate SSL configuration
  if (config.ssl?.enabled && !config.ssl?.certPath) {
    warnings.push('SSL enabled but no certificate path specified');
  }

  // Validate network configuration
  if (config.network?.timeout < 1000) {
    warnings.push('Network timeout is very low (< 1 second)');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export default {
  makeRequest,
  makeRequestFromIP,
  getSSLCertificate,
  getTLSInfo,
  testCloudflareProxy,
  testRateLimiting,
  testBotManagement,
  performHealthCheck,
  testDatabaseConnectionThroughProxy,
  simulateNetworkFailure,
  simulateServiceFailure,
  testConcurrentConnections,
  testFailover,
  measureNetworkLatency,
  testBandwidth,
  generateTestSSLCertificate,
  validateInfrastructureConfig,
  TEST_INFRASTRUCTURE_CONFIG
};

