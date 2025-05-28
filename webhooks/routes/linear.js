/**
 * Linear Webhook Routes
 * Handles Linear webhook events for issue updates and status changes
 */

import { Router } from 'express';
import { LinearWebhookService } from '../services/linear-webhook.js';
import { webhookAuth } from '../middleware/webhook-auth.js';
import { validateLinearSignature } from '../middleware/linear-signature.js';

const router = Router();

// Initialize Linear webhook service
const linearService = new LinearWebhookService();

/**
 * Linear webhook endpoint
 * Handles all Linear webhook events
 */
router.post('/', 
  validateLinearSignature,
  webhookAuth,
  async (req, res) => {
    try {
      const payload = req.body;
      const signature = req.headers['linear-signature'];
      const timestamp = req.headers['linear-timestamp'];

      console.log(`📥 Linear webhook received: ${payload.type}`);

      // Process the webhook event
      const result = await linearService.processWebhook({
        payload,
        signature,
        timestamp: new Date(timestamp || Date.now())
      });

      // Send response
      res.status(200).json({
        success: true,
        message: 'Linear webhook processed successfully',
        eventId: result.eventId,
        processed: result.processed
      });

    } catch (error) {
      console.error('❌ Linear webhook processing error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

/**
 * Linear webhook test endpoint
 * For testing webhook connectivity
 */
router.get('/test', async (req, res) => {
  try {
    const testResult = await linearService.testConnection();
    
    res.json({
      success: true,
      message: 'Linear webhook service is operational',
      test: testResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Linear webhook service test failed',
      message: error.message
    });
  }
});

/**
 * Get Linear webhook events
 * Returns recent webhook events for debugging
 */
router.get('/events', async (req, res) => {
  try {
    const { limit = 50, offset = 0, event_type } = req.query;
    
    const events = await linearService.getRecentEvents({
      limit: parseInt(limit),
      offset: parseInt(offset),
      eventType: event_type
    });

    res.json({
      success: true,
      events,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: events.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve Linear webhook events',
      message: error.message
    });
  }
});

/**
 * Retry failed Linear webhook processing
 * Manually retry processing for a specific event
 */
router.post('/retry/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const result = await linearService.retryEvent(eventId);
    
    res.json({
      success: true,
      message: 'Linear event retry initiated',
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retry Linear event',
      message: error.message
    });
  }
});

export default router;

