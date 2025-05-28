/**
 * Codegen Webhook Routes
 * Handles Codegen status updates and internal system events
 */

import { Router } from 'express';
import { CodegenWebhookService } from '../services/codegen-webhook.js';
import { webhookAuth } from '../middleware/webhook-auth.js';
import { validateCodegenSignature } from '../middleware/codegen-signature.js';

const router = Router();

// Initialize Codegen webhook service
const codegenService = new CodegenWebhookService();

/**
 * Codegen webhook endpoint
 * Handles Codegen status updates and system events
 */
router.post('/', 
  validateCodegenSignature,
  webhookAuth,
  async (req, res) => {
    try {
      const payload = req.body;
      const signature = req.headers['x-codegen-signature'];
      const eventType = req.headers['x-codegen-event'];

      console.log(`📥 Codegen webhook received: ${eventType}`);

      // Process the webhook event
      const result = await codegenService.processWebhook({
        eventType,
        payload,
        signature,
        timestamp: new Date()
      });

      // Send response
      res.status(200).json({
        success: true,
        message: 'Codegen webhook processed successfully',
        eventId: result.eventId,
        processed: result.processed
      });

    } catch (error) {
      console.error('❌ Codegen webhook processing error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
);

/**
 * Codegen status update endpoint
 * For internal status updates from codegen agents
 */
router.post('/status', 
  webhookAuth,
  async (req, res) => {
    try {
      const { agentId, status, message, metadata } = req.body;

      console.log(`📊 Codegen status update: ${agentId} - ${status}`);

      const result = await codegenService.updateAgentStatus({
        agentId,
        status,
        message,
        metadata,
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Status updated successfully',
        statusId: result.statusId
      });

    } catch (error) {
      console.error('❌ Codegen status update error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to update status',
        message: error.message
      });
    }
  }
);

/**
 * Codegen webhook test endpoint
 * For testing webhook connectivity
 */
router.get('/test', async (req, res) => {
  try {
    const testResult = await codegenService.testConnection();
    
    res.json({
      success: true,
      message: 'Codegen webhook service is operational',
      test: testResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Codegen webhook service test failed',
      message: error.message
    });
  }
});

/**
 * Get Codegen webhook events
 * Returns recent webhook events for debugging
 */
router.get('/events', async (req, res) => {
  try {
    const { limit = 50, offset = 0, event_type, agent_id } = req.query;
    
    const events = await codegenService.getRecentEvents({
      limit: parseInt(limit),
      offset: parseInt(offset),
      eventType: event_type,
      agentId: agent_id
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
      error: 'Failed to retrieve Codegen webhook events',
      message: error.message
    });
  }
});

/**
 * Trigger agentapi workflow
 * Manually trigger a workflow via agentapi
 */
router.post('/trigger', 
  webhookAuth,
  async (req, res) => {
    try {
      const { workflowType, payload, priority = 'normal' } = req.body;

      const result = await codegenService.triggerWorkflow({
        workflowType,
        payload,
        priority,
        timestamp: new Date()
      });

      res.json({
        success: true,
        message: 'Workflow triggered successfully',
        workflowId: result.workflowId
      });

    } catch (error) {
      console.error('❌ Workflow trigger error:', error);
      
      res.status(500).json({
        success: false,
        error: 'Failed to trigger workflow',
        message: error.message
      });
    }
  }
);

export default router;

