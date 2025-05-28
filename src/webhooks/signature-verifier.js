/**
 * Signature Verifier
 * 
 * GitHub webhook signature verification using HMAC-SHA256
 * for secure webhook authentication.
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';

export class SignatureVerifier {
  constructor(secret) {
    if (!secret) {
      throw new Error('Webhook secret is required for signature verification');
    }
    
    this.secret = secret;
    this.algorithm = 'sha256';
  }

  /**
   * Verify GitHub webhook signature
   */
  async verify(payload, signature) {
    if (!signature) {
      throw new Error('Missing webhook signature');
    }

    // GitHub sends signature in format: sha256=<hash>
    if (!signature.startsWith('sha256=')) {
      throw new Error('Invalid signature format. Expected sha256= prefix');
    }

    const receivedSignature = signature.substring(7); // Remove 'sha256=' prefix
    const expectedSignature = this.generateSignature(payload);

    // Use timing-safe comparison to prevent timing attacks
    if (!this.timingSafeEqual(receivedSignature, expectedSignature)) {
      logger.warn('Webhook signature verification failed', {
        receivedLength: receivedSignature.length,
        expectedLength: expectedSignature.length
      });
      
      throw new Error('Webhook signature verification failed');
    }

    logger.debug('Webhook signature verified successfully');
    return true;
  }

  /**
   * Generate HMAC signature for payload
   */
  generateSignature(payload) {
    const payloadString = typeof payload === 'string' 
      ? payload 
      : JSON.stringify(payload);
      
    return crypto
      .createHmac(this.algorithm, this.secret)
      .update(payloadString, 'utf8')
      .digest('hex');
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   */
  timingSafeEqual(a, b) {
    if (a.length !== b.length) {
      return false;
    }

    // Convert to buffers for crypto.timingSafeEqual
    const bufferA = Buffer.from(a, 'hex');
    const bufferB = Buffer.from(b, 'hex');

    try {
      return crypto.timingSafeEqual(bufferA, bufferB);
    } catch (error) {
      logger.error('Error in timing-safe comparison', {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Verify signature with raw body (for Express.js)
   */
  verifyRawBody(rawBody, signature) {
    if (!signature) {
      throw new Error('Missing webhook signature');
    }

    if (!signature.startsWith('sha256=')) {
      throw new Error('Invalid signature format. Expected sha256= prefix');
    }

    const receivedSignature = signature.substring(7);
    const expectedSignature = crypto
      .createHmac(this.algorithm, this.secret)
      .update(rawBody)
      .digest('hex');

    if (!this.timingSafeEqual(receivedSignature, expectedSignature)) {
      logger.warn('Raw body signature verification failed');
      throw new Error('Webhook signature verification failed');
    }

    logger.debug('Raw body signature verified successfully');
    return true;
  }

  /**
   * Generate test signature for development/testing
   */
  generateTestSignature(payload) {
    const signature = this.generateSignature(payload);
    return `sha256=${signature}`;
  }

  /**
   * Validate webhook secret strength
   */
  static validateSecret(secret) {
    if (!secret) {
      throw new Error('Webhook secret is required');
    }

    if (typeof secret !== 'string') {
      throw new Error('Webhook secret must be a string');
    }

    if (secret.length < 16) {
      throw new Error('Webhook secret must be at least 16 characters long');
    }

    // Check for common weak patterns
    const weakPatterns = [
      /^(.)\1+$/, // All same character
      /^(012|123|234|345|456|567|678|789|890)+$/, // Sequential numbers
      /^(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)+$/i, // Sequential letters
      /^(password|secret|webhook|github|test|admin|root|user)+$/i // Common words
    ];

    for (const pattern of weakPatterns) {
      if (pattern.test(secret)) {
        throw new Error('Webhook secret appears to be weak. Use a strong, random secret');
      }
    }

    return true;
  }

  /**
   * Generate a secure random secret
   */
  static generateSecret(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }
}

export default SignatureVerifier;

