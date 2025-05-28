/**
 * @fileoverview Authentication Middleware
 * @description Authentication middleware for webhook endpoints
 */

import { log } from '../../../scripts/modules/utils.js';

/**
 * Authentication middleware for admin endpoints
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authorization header required'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // In a real implementation, this would validate against a proper auth system
    const validToken = process.env.WEBHOOK_ADMIN_TOKEN;
    
    if (!validToken) {
      log('warn', 'Admin token not configured, allowing access');
      return next();
    }

    if (token !== validToken) {
      log('warn', 'Invalid admin token provided', {
        ip: req.ip,
        user_agent: req.get('User-Agent')
      });
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token'
      });
    }

    log('info', 'Admin access granted', {
      ip: req.ip,
      endpoint: req.path
    });

    next();
    
  } catch (error) {
    log('error', 'Authentication middleware error', {
      error: error.message,
      ip: req.ip
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

/**
 * API key authentication middleware
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
export function apiKeyMiddleware(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required'
      });
    }

    // In a real implementation, this would validate against a database
    const validApiKeys = (process.env.WEBHOOK_API_KEYS || '').split(',').filter(Boolean);
    
    if (validApiKeys.length === 0) {
      log('warn', 'No API keys configured, allowing access');
      return next();
    }

    if (!validApiKeys.includes(apiKey)) {
      log('warn', 'Invalid API key provided', {
        ip: req.ip,
        user_agent: req.get('User-Agent'),
        api_key_prefix: apiKey.substring(0, 8) + '...'
      });
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key'
      });
    }

    log('info', 'API access granted', {
      ip: req.ip,
      endpoint: req.path,
      api_key_prefix: apiKey.substring(0, 8) + '...'
    });

    next();
    
  } catch (error) {
    log('error', 'API key middleware error', {
      error: error.message,
      ip: req.ip
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
}

/**
 * Role-based access control middleware
 * @param {Array} allowedRoles - Array of allowed roles
 * @returns {Function} Middleware function
 */
export function rbacMiddleware(allowedRoles = []) {
  return (req, res, next) => {
    try {
      // Extract user role from token or headers
      const userRole = req.headers['x-user-role'] || 'user';
      
      if (!allowedRoles.includes(userRole)) {
        log('warn', 'Insufficient permissions', {
          ip: req.ip,
          user_role: userRole,
          required_roles: allowedRoles,
          endpoint: req.path
        });
        
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions'
        });
      }

      log('info', 'Role-based access granted', {
        ip: req.ip,
        user_role: userRole,
        endpoint: req.path
      });

      next();
      
    } catch (error) {
      log('error', 'RBAC middleware error', {
        error: error.message,
        ip: req.ip
      });
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authorization failed'
      });
    }
  };
}

/**
 * IP whitelist middleware
 * @param {Array} allowedIPs - Array of allowed IP addresses/ranges
 * @returns {Function} Middleware function
 */
export function ipWhitelistMiddleware(allowedIPs = []) {
  return (req, res, next) => {
    try {
      if (allowedIPs.length === 0) {
        return next();
      }

      const clientIP = req.ip || req.connection.remoteAddress;
      
      // Simple IP matching (in production, use a proper IP range library)
      const isAllowed = allowedIPs.some(allowedIP => {
        if (allowedIP.includes('/')) {
          // CIDR notation - simplified check
          const [network, prefix] = allowedIP.split('/');
          return clientIP.startsWith(network.split('.').slice(0, Math.floor(parseInt(prefix) / 8)).join('.'));
        } else {
          return clientIP === allowedIP;
        }
      });

      if (!isAllowed) {
        log('warn', 'IP not in whitelist', {
          ip: clientIP,
          allowed_ips: allowedIPs,
          endpoint: req.path
        });
        
        return res.status(403).json({
          error: 'Forbidden',
          message: 'IP address not allowed'
        });
      }

      next();
      
    } catch (error) {
      log('error', 'IP whitelist middleware error', {
        error: error.message,
        ip: req.ip
      });
      
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'IP validation failed'
      });
    }
  };
}

export default authMiddleware;

