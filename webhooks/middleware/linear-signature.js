/**
 * Linear Webhook Signature Validation Middleware
 * Validates Linear webhook signatures
 */

import crypto from 'crypto';

/**
 * Validate Linear webhook signature
 * Ensures the webhook payload is from Linear and hasn't been tampered with
 */
export function validateLinearSignature(req, res, next) {
  try {
    const signature = req.headers['linear-signature'];
    const timestamp = req.headers['linear-timestamp'];
    const payload = req.rawBody || req.body;

    // Skip validation for test endpoints
    if (req.path.includes('/test')) {
      return next();
    }

    // Check if signature exists
    if (!signature) {
      console.warn('⚠️ Linear webhook missing signature');
      return res.status(401).json({
        error: 'Missing signature',
        message: 'Linear webhook signature is required'
      });
    }

    // Get the webhook secret
    const secret = process.env.LINEAR_WEBHOOK_SECRET;
    if (!secret) {
      console.error('❌ Linear webhook secret not configured');
      return res.status(500).json({
        error: 'Configuration error',
        message: 'Linear webhook secret is not configured'
      });
    }

    // Validate timestamp to prevent replay attacks
    if (timestamp) {
      const timestampAge = Math.abs(Date.now() - parseInt(timestamp));
      const maxAge = 5 * 60 * 1000; // 5 minutes
      
      if (timestampAge > maxAge) {
        console.warn('⚠️ Linear webhook timestamp too old');
        return res.status(401).json({
          error: 'Timestamp too old',
          message: 'Linear webhook timestamp is too old'
        });
      }
    }

    // Validate the signature
    const isValid = verifyLinearSignature(payload, signature, secret, timestamp);
    
    if (!isValid) {
      console.warn('⚠️ Linear webhook signature validation failed');
      return res.status(401).json({
        error: 'Invalid signature',
        message: 'Linear webhook signature validation failed'
      });
    }

    console.log('✅ Linear webhook signature validated');
    next();

  } catch (error) {
    console.error('❌ Linear signature validation error:', error);
    
    return res.status(500).json({
      error: 'Signature validation error',
      message: 'An error occurred during signature validation'
    });
  }
}

/**
 * Verify Linear webhook signature
 * @param {Buffer|string} payload - The webhook payload
 * @param {string} signature - The signature from Linear
 * @param {string} secret - The webhook secret
 * @param {string} timestamp - The timestamp from Linear
 * @returns {boolean} - Whether the signature is valid
 */
function verifyLinearSignature(payload, signature, secret, timestamp) {
  try {
    // Ensure payload is a string for Linear
    const payloadString = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
    
    // Linear uses a different signature format
    // Create the signing string (payload + timestamp if available)
    const signingString = timestamp ? `${payloadString}.${timestamp}` : payloadString;
    
    // Create the expected signature using HMAC-SHA256
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signingString, 'utf8')
      .digest('hex');
    
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedSignature, 'utf8')
    );
    
  } catch (error) {
    console.error('❌ Error verifying Linear signature:', error);
    return false;
  }
}

/**
 * Generate a test signature for Linear webhooks
 * @param {string} payload - The payload to sign
 * @param {string} secret - The secret to use for signing
 * @param {string} timestamp - Optional timestamp
 * @returns {string} - The generated signature
 */
export function generateLinearSignature(payload, secret, timestamp) {
  const signingString = timestamp ? `${payload}.${timestamp}` : payload;
  
  return crypto
    .createHmac('sha256', secret)
    .update(signingString, 'utf8')
    .digest('hex');
}

/**
 * Middleware to log Linear webhook details for debugging
 */
export function logLinearWebhook(req, res, next) {
  const signature = req.headers['linear-signature'];
  const timestamp = req.headers['linear-timestamp'];
  const eventType = req.body?.type;
  
  console.log('📥 Linear Webhook Details:', {
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
 * Validate Linear webhook event type
 * Ensures we only process supported event types
 */
export function validateLinearEventType(supportedEvents = []) {
  return (req, res, next) => {
    const eventType = req.body?.type;
    
    if (!eventType) {
      return res.status(400).json({
        error: 'Missing event type',
        message: 'Linear event type is required in payload'
      });
    }
    
    if (supportedEvents.length > 0 && !supportedEvents.includes(eventType)) {
      console.log(`⚠️ Unsupported Linear event type: ${eventType}`);
      return res.status(200).json({
        success: true,
        message: `Event type '${eventType}' is not supported`,
        processed: false
      });
    }
    
    next();
  };
}

