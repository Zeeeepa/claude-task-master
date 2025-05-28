/**
 * GitHub Webhook Routes
 * Handles GitHub webhook events for PR creation, updates, and status changes
 */

import { Router } from 'express';
import { GitHubWebhookService } from '../services/github-webhook.js';
import { webhookAuth } from '../middleware/webhook-auth.js';
import { validateGitHubSignature } from '../middleware/github-signature.js';

const router = Router();

// Initialize GitHub webhook service
const githubService = new GitHubWebhookService();

/**
 * GitHub webhook endpoint
 * Handles all GitHub webhook events
 */
router.post('/', 
  validateGitHubSignature,
  webhookAuth,
  async (req, res) => {
    try {
      const event = req.headers['x-github-event'];
      const delivery = req.headers['x-github-delivery'];
      const payload = req.body;

      console.log(`📥 GitHub webhook received: ${event} (${delivery})`);

      // Process the webhook event
      const result = await githubService.processWebhook({
        event,
        delivery,
        payload,
        timestamp: new Date()
      });

      // Send response
      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        eventId: result.eventId,
        processed: result.processed
      });

    } catch (error) {
      console.error('❌ GitHub webhook processing error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

/**
 * GitHub webhook test endpoint
 * For testing webhook connectivity
 */
router.get('/test', async (req, res) => {
  try {
    const testResult = await githubService.testConnection();
    
    res.json({
      success: true,
      message: 'GitHub webhook service is operational',
      test: testResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'GitHub webhook service test failed',
      message: error.message
    });
  }
});

/**
 * Get GitHub webhook events
 * Returns recent webhook events for debugging
 */
router.get('/events', async (req, res) => {
  try {
    const { limit = 50, offset = 0, event_type } = req.query;
    
    const events = await githubService.getRecentEvents({
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
      error: 'Failed to retrieve webhook events',
      message: error.message
    });
  }
});

/**
 * Retry failed webhook processing
 * Manually retry processing for a specific event
 */
router.post('/retry/:eventId', async (req, res) => {
  try {
    const { eventId } = req.params;
    
    const result = await githubService.retryEvent(eventId);
    
    res.json({
      success: true,
      message: 'Event retry initiated',
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retry event',
      message: error.message
    });
  }
});

export default router;

