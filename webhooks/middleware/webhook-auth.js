/**
 * Webhook Authentication Middleware
 * Provides general authentication for webhook endpoints
 */

import jwt from 'jsonwebtoken';

/**
 * General webhook authentication middleware
 * Validates API keys or JWT tokens for webhook access
 */
export function webhookAuth(req, res, next) {
  try {
    // Skip auth for health checks and test endpoints
    if (req.path.includes('/test') || req.path.includes('/health')) {
      return next();
    }

    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'];

    // Check for API key authentication
    if (apiKey) {
      if (!validateApiKey(apiKey)) {
        return res.status(401).json({
          error: 'Invalid API key',
          message: 'The provided API key is not valid'
        });
      }
      
      req.auth = { type: 'api_key', key: apiKey };
      return next();
    }

    // Check for JWT authentication
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
        req.auth = { type: 'jwt', user: decoded };
        return next();
      } catch (jwtError) {
        return res.status(401).json({
          error: 'Invalid token',
          message: 'The provided JWT token is invalid or expired'
        });
      }
    }

    // For webhook signature validation, allow through
    // (signature validation happens in specific middleware)
    if (req.headers['x-github-event'] || 
        req.headers['linear-signature'] || 
        req.headers['x-codegen-signature']) {
      return next();
    }

    // No valid authentication found
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid API key or JWT token'
    });

  } catch (error) {
    console.error('❌ Webhook auth error:', error);
    
    return res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    });
  }
}

/**
 * Validate API key
 * @param {string} apiKey - The API key to validate
 * @returns {boolean} - Whether the API key is valid
 */
function validateApiKey(apiKey) {
  const validApiKeys = process.env.WEBHOOK_API_KEYS?.split(',') || [];
  
  // Always allow the master API key
  const masterKey = process.env.WEBHOOK_MASTER_KEY;
  if (masterKey && apiKey === masterKey) {
    return true;
  }

  // Check against list of valid API keys
  return validApiKeys.includes(apiKey);
}

/**
 * Generate a new API key
 * @returns {string} - A new API key
 */
export function generateApiKey() {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Admin authentication middleware
 * Requires elevated privileges for admin operations
 */
export function adminAuth(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    const authHeader = req.headers.authorization;

    // Check for master API key
    if (apiKey === process.env.WEBHOOK_MASTER_KEY) {
      req.auth = { type: 'master_key', admin: true };
      return next();
    }

    // Check for admin JWT token
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret');
        
        if (decoded.role === 'admin' || decoded.admin === true) {
          req.auth = { type: 'jwt', user: decoded, admin: true };
          return next();
        }
      } catch (jwtError) {
        // JWT validation failed, continue to unauthorized
      }
    }

    return res.status(403).json({
      error: 'Admin access required',
      message: 'This endpoint requires administrator privileges'
    });

  } catch (error) {
    console.error('❌ Admin auth error:', error);
    
    return res.status(500).json({
      error: 'Authentication error',
      message: 'An error occurred during admin authentication'
    });
  }
}

/**
 * Rate limiting bypass for authenticated requests
 * Allows higher rate limits for authenticated users
 */
export function authRateLimitBypass(req, res, next) {
  if (req.auth) {
    // Set higher rate limit for authenticated requests
    req.rateLimitBypass = true;
    req.rateLimitMultiplier = req.auth.admin ? 10 : 5;
  }
  
  next();
}

