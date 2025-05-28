/**
 * Cloudflare Database Proxy Worker
 * Secure PostgreSQL proxy with authentication, rate limiting, and connection pooling
 */

import { Pool } from 'pg';

// Configuration constants
const CONFIG = {
  // Rate limiting: 1000 requests per minute per IP
  RATE_LIMIT_WINDOW: 60 * 1000, // 1 minute in milliseconds
  RATE_LIMIT_MAX_REQUESTS: 1000,
  
  // Connection pooling
  DB_POOL_SIZE: 20,
  DB_IDLE_TIMEOUT: 30000, // 30 seconds
  DB_CONNECTION_TIMEOUT: 5000, // 5 seconds
  
  // Security
  MAX_QUERY_LENGTH: 10000,
  ALLOWED_OPERATIONS: ['SELECT', 'INSERT', 'UPDATE', 'DELETE'],
  
  // Performance
  QUERY_TIMEOUT: 30000, // 30 seconds
  MAX_ROWS_RETURNED: 10000,
};

// Rate limiting store (using Cloudflare KV in production)
const rateLimitStore = new Map();

// Database connection pool
let dbPool = null;

/**
 * Initialize database connection pool
 */
function initializeDbPool(env) {
  if (!dbPool) {
    dbPool = new Pool({
      host: env.DB_HOST,
      port: parseInt(env.DB_PORT) || 5432,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      ssl: {
        rejectUnauthorized: false,
        require: true
      },
      max: CONFIG.DB_POOL_SIZE,
      idleTimeoutMillis: CONFIG.DB_IDLE_TIMEOUT,
      connectionTimeoutMillis: CONFIG.DB_CONNECTION_TIMEOUT,
    });
  }
  return dbPool;
}

/**
 * Rate limiting middleware
 */
async function checkRateLimit(clientIP, env) {
  const now = Date.now();
  const windowStart = now - CONFIG.RATE_LIMIT_WINDOW;
  
  // In production, use Cloudflare KV for distributed rate limiting
  if (env.RATE_LIMIT_KV) {
    const key = `rate_limit:${clientIP}`;
    const requests = await env.RATE_LIMIT_KV.get(key, { type: 'json' }) || [];
    
    // Filter requests within the current window
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);
    
    if (recentRequests.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }
    
    // Add current request and store
    recentRequests.push(now);
    await env.RATE_LIMIT_KV.put(key, JSON.stringify(recentRequests), {
      expirationTtl: Math.ceil(CONFIG.RATE_LIMIT_WINDOW / 1000)
    });
    
    return true;
  }
  
  // Fallback to in-memory rate limiting (for development)
  if (!rateLimitStore.has(clientIP)) {
    rateLimitStore.set(clientIP, []);
  }
  
  const requests = rateLimitStore.get(clientIP);
  const recentRequests = requests.filter(timestamp => timestamp > windowStart);
  
  if (recentRequests.length >= CONFIG.RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimitStore.set(clientIP, recentRequests);
  
  return true;
}

/**
 * Authentication middleware
 */
async function authenticate(request, env) {
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { success: false, error: 'Missing or invalid authorization header' };
  }
  
  const token = authHeader.substring(7);
  
  // Validate API token against environment variable or KV store
  const validTokens = env.VALID_API_TOKENS ? env.VALID_API_TOKENS.split(',') : [];
  
  if (!validTokens.includes(token)) {
    return { success: false, error: 'Invalid API token' };
  }
  
  return { success: true };
}

/**
 * Validate SQL query for security
 */
function validateQuery(query) {
  if (!query || typeof query !== 'string') {
    return { valid: false, error: 'Query must be a non-empty string' };
  }
  
  if (query.length > CONFIG.MAX_QUERY_LENGTH) {
    return { valid: false, error: `Query exceeds maximum length of ${CONFIG.MAX_QUERY_LENGTH} characters` };
  }
  
  // Basic SQL injection protection
  const suspiciousPatterns = [
    /;\s*(DROP|DELETE|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\s+/i,
    /UNION\s+SELECT/i,
    /--\s*$/,
    /\/\*.*\*\//,
    /xp_cmdshell/i,
    /sp_executesql/i
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(query)) {
      return { valid: false, error: 'Query contains potentially dangerous patterns' };
    }
  }
  
  return { valid: true };
}

/**
 * Execute database query with timeout and result limiting
 */
async function executeQuery(pool, query, params = []) {
  const client = await pool.connect();
  
  try {
    // Set query timeout
    await client.query('SET statement_timeout = $1', [CONFIG.QUERY_TIMEOUT]);
    
    const startTime = Date.now();
    const result = await client.query(query, params);
    const executionTime = Date.now() - startTime;
    
    // Limit number of returned rows
    if (result.rows && result.rows.length > CONFIG.MAX_ROWS_RETURNED) {
      result.rows = result.rows.slice(0, CONFIG.MAX_ROWS_RETURNED);
      result.truncated = true;
      result.totalRows = result.rowCount;
    }
    
    return {
      success: true,
      data: result.rows,
      rowCount: result.rowCount,
      executionTime,
      truncated: result.truncated || false,
      totalRows: result.totalRows
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      code: error.code
    };
  } finally {
    client.release();
  }
}

/**
 * Log request for audit purposes
 */
async function logRequest(env, clientIP, query, result, executionTime) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    clientIP,
    query: query.substring(0, 200), // Log first 200 chars only
    success: result.success,
    executionTime,
    error: result.error || null
  };
  
  // In production, store logs in Cloudflare KV or external logging service
  if (env.AUDIT_LOG_KV) {
    const logKey = `audit:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    await env.AUDIT_LOG_KV.put(logKey, JSON.stringify(logEntry), {
      expirationTtl: 30 * 24 * 60 * 60 // 30 days
    });
  }
  
  console.log('Database Query:', logEntry);
}

/**
 * Handle CORS preflight requests
 */
function handleCORS(request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  return corsHeaders;
}

/**
 * Main request handler
 */
export default {
  async fetch(request, env, ctx) {
    const startTime = Date.now();
    
    try {
      // Handle CORS
      if (request.method === 'OPTIONS') {
        return handleCORS(request);
      }
      
      const corsHeaders = handleCORS(request);
      
      // Only allow POST requests
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      // Get client IP
      const clientIP = request.headers.get('CF-Connecting-IP') || 
                      request.headers.get('X-Forwarded-For') || 
                      'unknown';
      
      // Check rate limit
      const rateLimitOk = await checkRateLimit(clientIP, env);
      if (!rateLimitOk) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(CONFIG.RATE_LIMIT_WINDOW / 1000)
        }), {
          status: 429,
          headers: { 
            'Content-Type': 'application/json',
            'Retry-After': Math.ceil(CONFIG.RATE_LIMIT_WINDOW / 1000).toString(),
            ...corsHeaders
          }
        });
      }
      
      // Authenticate request
      const authResult = await authenticate(request, env);
      if (!authResult.success) {
        return new Response(JSON.stringify({ error: authResult.error }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      // Parse request body
      let requestBody;
      try {
        requestBody = await request.json();
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      const { query, params } = requestBody;
      
      // Validate query
      const validation = validateQuery(query);
      if (!validation.valid) {
        return new Response(JSON.stringify({ error: validation.error }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders }
        });
      }
      
      // Initialize database pool
      const pool = initializeDbPool(env);
      
      // Execute query
      const result = await executeQuery(pool, query, params);
      const executionTime = Date.now() - startTime;
      
      // Log request for audit
      await logRequest(env, clientIP, query, result, executionTime);
      
      // Return result
      const statusCode = result.success ? 200 : 400;
      return new Response(JSON.stringify({
        ...result,
        executionTime,
        timestamp: new Date().toISOString()
      }), {
        status: statusCode,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
      
    } catch (error) {
      console.error('Database proxy error:', error);
      
      return new Response(JSON.stringify({ 
        error: 'Internal server error',
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

