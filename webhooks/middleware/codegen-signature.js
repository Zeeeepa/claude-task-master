/**
 * Codegen Webhook Signature Validation Middleware
 * Validates Codegen internal webhook signatures
 */

import crypto from 'crypto';

/**
 * Validate Codegen webhook signature
 * Ensures the webhook payload is from a trusted Codegen source
 */
export function validateCodegenSignature(req, res, next) {
  try {
    const signature = req.headers['x-codegen-signature'];
    const timestamp = req.headers['x-codegen-timestamp'];
    const payload = req.rawBody || req.body;

    // Skip validation for test endpoints and status updates from internal sources
    if (req.path.includes('/test') || req.path.includes('/status')) {
      return next();
    }

    // Check if signature exists
    if (!signature) {
      console.warn('⚠️ Codegen webhook missing signature');
      return res.status(401).json({
        error: 'Missing signature',
        message: 'Codegen webhook signature is required'
      });
    }

    // Get the webhook secret
    const secret = process.env.CODEGEN_WEBHOOK_SECRET;
    if (!secret) {
      console.error('❌ Codegen webhook secret not configured');
      return res.status(500).json({
        error: 'Configuration error',
        message: 'Codegen webhook secret is not configured'
      });
    }

    // Validate timestamp to prevent replay attacks
    if (timestamp) {
      const timestampAge = Math.abs(Date.now() - parseInt(timestamp));
      const maxAge = 10 * 60 * 1000; // 10 minutes (longer for internal systems)
      
      if (timestampAge > maxAge) {
        console.warn('⚠️ Codegen webhook timestamp too old');
        return res.status(401).json({
          error: 'Timestamp too old',
          message: 'Codegen webhook timestamp is too old'
        });
      }
    }

    // Validate the signature
    const isValid = verifyCodegenSignature(payload, signature, secret, timestamp);
    
    if (!isValid) {
      console.warn('⚠️ Codegen webhook signature validation failed');
      return res.status(401).json({
        error: 'Invalid signature',
        message: 'Codegen webhook signature validation failed'
      });
    }

    console.log('✅ Codegen webhook signature validated');
    next();

  } catch (error) {
    console.error('❌ Codegen signature validation error:', error);
    
    return res.status(500).json({
      error: 'Signature validation error',
      message: 'An error occurred during signature validation'
    });
  }
}

/**
 * Verify Codegen webhook signature
 * @param {Buffer|string} payload - The webhook payload
 * @param {string} signature - The signature from Codegen
 * @param {string} secret - The webhook secret
 * @param {string} timestamp - The timestamp from Codegen
 * @returns {boolean} - Whether the signature is valid
 */
function verifyCodegenSignature(payload, signature, secret, timestamp) {
  try {
    // Ensure payload is a string
    const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
    
    // Create the signing string (payload + timestamp if available)
    const signingString = timestamp ? `${payloadString}.${timestamp}` : payloadString;
    
    // Create the expected signature using HMAC-SHA256
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signingString, 'utf8')
      .digest('hex');
    
    // Codegen uses "codegen-" prefix for signatures
    const expectedSignatureWithPrefix = `codegen-${expectedSignature}`;
    
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedSignatureWithPrefix, 'utf8')
    );
    
  } catch (error) {
    console.error('❌ Error verifying Codegen signature:', error);
    return false;
  }
}

/**
 * Generate a test signature for Codegen webhooks
 * @param {string} payload - The payload to sign
 * @param {string} secret - The secret to use for signing
 * @param {string} timestamp - Optional timestamp
 * @returns {string} - The generated signature
 */
export function generateCodegenSignature(payload, secret, timestamp) {
  const signingString = timestamp ? `${payload}.${timestamp}` : payload;
  
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingString, 'utf8')
    .digest('hex');
  
  return `codegen-${signature}`;
}

/**
 * Middleware to log Codegen webhook details for debugging
 */
export function logCodegenWebhook(req, res, next) {
  const signature = req.headers['x-codegen-signature'];
  const timestamp = req.headers['x-codegen-timestamp'];
  const eventType = req.headers['x-codegen-event'];
  
  console.log('📥 Codegen Webhook Details:', {
    eventType,
    hasSignature: !!signature,
    hasTimestamp: !!timestamp,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    userAgent: req.headers['user-agent']
  });
  
  next();
}

/**
 * Validate Codegen webhook event type
 * Ensures we only process supported event types
 */
export function validateCodegenEventType(supportedEvents = []) {
  return (req, res, next) => {
    const eventType = req.headers['x-codegen-event'];
    
    if (!eventType) {
      return res.status(400).json({
        error: 'Missing event type',
        message: 'Codegen event type header is required'
      });
    }
    
    if (supportedEvents.length > 0 && !supportedEvents.includes(eventType)) {
      console.log(`⚠️ Unsupported Codegen event type: ${eventType}`);
      return res.status(200).json({
        success: true,
        message: `Event type '${eventType}' is not supported`,
        processed: false
      });
    }
    
    next();
  };
}

/**
 * Internal Codegen authentication for status updates
 * Less strict validation for internal system communications
 */
export function validateInternalCodegen(req, res, next) {
  try {
    const internalKey = req.headers['x-codegen-internal-key'];
    const expectedKey = process.env.CODEGEN_INTERNAL_KEY;
    
    // Allow through if no internal key is configured (development mode)
    if (!expectedKey) {
      console.warn('⚠️ Codegen internal key not configured - allowing request');
      return next();
    }
    
    if (!internalKey || internalKey !== expectedKey) {
      console.warn('⚠️ Invalid Codegen internal key');
      return res.status(401).json({
        error: 'Invalid internal key',
        message: 'Codegen internal authentication failed'
      });
    }
    
    console.log('✅ Codegen internal authentication validated');
    next();
    
  } catch (error) {
    console.error('❌ Codegen internal auth error:', error);
    
    return res.status(500).json({
      error: 'Internal authentication error',
      message: 'An error occurred during internal authentication'
    });
  }
}

