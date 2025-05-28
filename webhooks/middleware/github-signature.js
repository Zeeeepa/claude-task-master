/**
 * GitHub Webhook Signature Validation Middleware
 * Validates GitHub webhook signatures using HMAC-SHA256
 */

import crypto from 'crypto';

/**
 * Validate GitHub webhook signature
 * Ensures the webhook payload is from GitHub and hasn't been tampered with
 */
export function validateGitHubSignature(req, res, next) {
  try {
    const signature = req.headers['x-hub-signature-256'];
    const payload = req.rawBody || req.body;

    // Skip validation for test endpoints
    if (req.path.includes('/test')) {
      return next();
    }

    // Check if signature exists
    if (!signature) {
      console.warn('⚠️ GitHub webhook missing signature');
      return res.status(401).json({
        error: 'Missing signature',
        message: 'GitHub webhook signature is required'
      });
    }

    // Get the webhook secret
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      console.error('❌ GitHub webhook secret not configured');
      return res.status(500).json({
        error: 'Configuration error',
        message: 'GitHub webhook secret is not configured'
      });
    }

    // Validate the signature
    const isValid = verifyGitHubSignature(payload, signature, secret);
    
    if (!isValid) {
      console.warn('⚠️ GitHub webhook signature validation failed');
      return res.status(401).json({
        error: 'Invalid signature',
        message: 'GitHub webhook signature validation failed'
      });
    }

    console.log('✅ GitHub webhook signature validated');
    next();

  } catch (error) {
    console.error('❌ GitHub signature validation error:', error);
    
    return res.status(500).json({
      error: 'Signature validation error',
      message: 'An error occurred during signature validation'
    });
  }
}

/**
 * Verify GitHub webhook signature using HMAC-SHA256
 * @param {Buffer|string} payload - The webhook payload
 * @param {string} signature - The signature from GitHub (x-hub-signature-256 header)
 * @param {string} secret - The webhook secret
 * @returns {boolean} - Whether the signature is valid
 */
function verifyGitHubSignature(payload, signature, secret) {
  try {
    // Ensure payload is a buffer
    const payloadBuffer = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
    
    // Create the expected signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payloadBuffer)
      .digest('hex');
    
    // GitHub sends signature as "sha256=<hash>"
    const expectedSignatureWithPrefix = `sha256=${expectedSignature}`;
    
    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expectedSignatureWithPrefix, 'utf8')
    );
    
  } catch (error) {
    console.error('❌ Error verifying GitHub signature:', error);
    return false;
  }
}

/**
 * Generate a test signature for development/testing
 * @param {string} payload - The payload to sign
 * @param {string} secret - The secret to use for signing
 * @returns {string} - The generated signature
 */
export function generateGitHubSignature(payload, secret) {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  
  return `sha256=${signature}`;
}

/**
 * Middleware to log GitHub webhook details for debugging
 */
export function logGitHubWebhook(req, res, next) {
  const event = req.headers['x-github-event'];
  const delivery = req.headers['x-github-delivery'];
  const signature = req.headers['x-hub-signature-256'];
  
  console.log('📥 GitHub Webhook Details:', {
    event,
    delivery,
    hasSignature: !!signature,
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length'],
    userAgent: req.headers['user-agent']
  });
  
  next();
}

/**
 * Validate GitHub webhook event type
 * Ensures we only process supported event types
 */
export function validateGitHubEventType(supportedEvents = []) {
  return (req, res, next) => {
    const event = req.headers['x-github-event'];
    
    if (!event) {
      return res.status(400).json({
        error: 'Missing event type',
        message: 'GitHub event type header is required'
      });
    }
    
    if (supportedEvents.length > 0 && !supportedEvents.includes(event)) {
      console.log(`⚠️ Unsupported GitHub event type: ${event}`);
      return res.status(200).json({
        success: true,
        message: `Event type '${event}' is not supported`,
        processed: false
      });
    }
    
    next();
  };
}

