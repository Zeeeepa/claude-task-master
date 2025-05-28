/**
 * Webhook API Routes
 * 
 * RESTful endpoints for handling webhooks from GitHub, Linear, and other services
 */

const express = require('express');
const { body, header, validationResult } = require('express-validator');
const crypto = require('crypto');

const router = express.Router();

/**
 * Validation middleware
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array()
    });
  }
  next();
};

/**
 * Verify GitHub webhook signature
 */
const verifyGitHubSignature = (req, res, next) => {
  const signature = req.get('X-Hub-Signature-256');
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (!secret) {
    console.warn('GitHub webhook secret not configured');
    return next();
  }

  if (!signature) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing signature'
    });
  }

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid signature'
    });
  }

  next();
};

/**
 * Verify Linear webhook signature
 */
const verifyLinearSignature = (req, res, next) => {
  const signature = req.get('Linear-Signature');
  const secret = process.env.LINEAR_WEBHOOK_SECRET;

  if (!secret) {
    console.warn('Linear webhook secret not configured');
    return next();
  }

  if (!signature) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing signature'
    });
  }

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid signature'
    });
  }

  next();
};

/**
 * POST /api/webhook/github
 * Handle GitHub webhooks
 */
router.post('/github', [
  header('X-GitHub-Event').notEmpty().withMessage('GitHub event header is required'),
  verifyGitHubSignature,
  handleValidationErrors
], async (req, res) => {
  try {
    const { deploymentOrchestrator, databaseConnector, orchestratorClient } = req.agentAPI;
    const event = req.get('X-GitHub-Event');
    const payload = req.body;

    console.log(`Received GitHub webhook: ${event}`);

    let result = { processed: false, message: 'Event not handled' };

    switch (event) {
      case 'pull_request':
        result = await handlePullRequestEvent(payload, deploymentOrchestrator, databaseConnector);
        break;
      
      case 'push':
        result = await handlePushEvent(payload, deploymentOrchestrator, databaseConnector);
        break;
      
      case 'issue_comment':
        result = await handleIssueCommentEvent(payload, deploymentOrchestrator);
        break;
      
      case 'pull_request_review':
        result = await handlePullRequestReviewEvent(payload, deploymentOrchestrator);
        break;
      
      case 'workflow_run':
        result = await handleWorkflowRunEvent(payload, orchestratorClient);
        break;
      
      default:
        console.log(`Unhandled GitHub event: ${event}`);
        result = { processed: false, message: `Unhandled event: ${event}` };
    }

    // Store webhook event in database
    await databaseConnector.createWebhookEvent({
      source: 'github',
      event,
      payload,
      processed: result.processed,
      result: result.message,
      createdAt: new Date()
    });

    res.json({
      success: true,
      event,
      processed: result.processed,
      message: result.message
    });
  } catch (error) {
    console.error('GitHub webhook error:', error);
    res.status(500).json({
      error: 'Webhook Processing Failed',
      message: error.message
    });
  }
});

/**
 * POST /api/webhook/linear
 * Handle Linear webhooks
 */
router.post('/linear', [
  verifyLinearSignature,
  handleValidationErrors
], async (req, res) => {
  try {
    const { deploymentOrchestrator, databaseConnector, orchestratorClient } = req.agentAPI;
    const payload = req.body;
    const event = payload.type;

    console.log(`Received Linear webhook: ${event}`);

    let result = { processed: false, message: 'Event not handled' };

    switch (event) {
      case 'Issue':
        result = await handleLinearIssueEvent(payload, deploymentOrchestrator, orchestratorClient);
        break;
      
      case 'IssueComment':
        result = await handleLinearCommentEvent(payload, deploymentOrchestrator);
        break;
      
      case 'Project':
        result = await handleLinearProjectEvent(payload, orchestratorClient);
        break;
      
      default:
        console.log(`Unhandled Linear event: ${event}`);
        result = { processed: false, message: `Unhandled event: ${event}` };
    }

    // Store webhook event in database
    await databaseConnector.createWebhookEvent({
      source: 'linear',
      event,
      payload,
      processed: result.processed,
      result: result.message,
      createdAt: new Date()
    });

    res.json({
      success: true,
      event,
      processed: result.processed,
      message: result.message
    });
  } catch (error) {
    console.error('Linear webhook error:', error);
    res.status(500).json({
      error: 'Webhook Processing Failed',
      message: error.message
    });
  }
});

/**
 * POST /api/webhook/generic
 * Handle generic webhooks from other services
 */
router.post('/generic', [
  body('source').notEmpty().withMessage('Source is required'),
  body('event').notEmpty().withMessage('Event is required'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { databaseConnector } = req.agentAPI;
    const { source, event, payload } = req.body;

    console.log(`Received generic webhook: ${source}/${event}`);

    // Store webhook event in database
    await databaseConnector.createWebhookEvent({
      source,
      event,
      payload,
      processed: false,
      result: 'Generic webhook received',
      createdAt: new Date()
    });

    res.json({
      success: true,
      source,
      event,
      message: 'Generic webhook received and stored'
    });
  } catch (error) {
    console.error('Generic webhook error:', error);
    res.status(500).json({
      error: 'Webhook Processing Failed',
      message: error.message
    });
  }
});

/**
 * GET /api/webhook/events
 * List webhook events with filtering
 */
router.get('/events', async (req, res) => {
  try {
    const { databaseConnector } = req.agentAPI;
    
    const {
      source,
      event,
      processed,
      page = 1,
      limit = 50
    } = req.query;

    const events = await databaseConnector.getWebhookEvents({
      source,
      event,
      processed: processed !== undefined ? processed === 'true' : undefined,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.json({
      success: true,
      events: events.events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: events.total,
        totalPages: Math.ceil(events.total / limit)
      }
    });
  } catch (error) {
    console.error('Get webhook events error:', error);
    res.status(500).json({
      error: 'Get Events Failed',
      message: error.message
    });
  }
});

/**
 * Handle GitHub pull request events
 */
async function handlePullRequestEvent(payload, deploymentOrchestrator, databaseConnector) {
  const { action, pull_request, repository } = payload;

  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return { processed: false, message: `PR action '${action}' not handled` };
  }

  try {
    // Check if auto-deployment is enabled for this repository
    const repoConfig = await databaseConnector.getRepositoryConfig(repository.full_name);
    
    if (!repoConfig || !repoConfig.autoDeployEnabled) {
      return { processed: false, message: 'Auto-deployment not enabled for this repository' };
    }

    // Create deployment request
    const deploymentRequest = {
      repositoryUrl: repository.clone_url,
      prBranch: pull_request.head.ref,
      validationTasks: repoConfig.validationTasks || [
        { type: 'code_analysis', scope: 'changed_files' },
        { type: 'test_execution', command: 'npm test' },
        { type: 'lint_check', command: 'npm run lint' }
      ],
      gitConfig: {
        name: 'AgentAPI Bot',
        email: 'agentapi@example.com'
      },
      metadata: {
        requestedBy: 'github_webhook',
        prNumber: pull_request.number,
        prTitle: pull_request.title,
        author: pull_request.user.login,
        repository: repository.full_name
      }
    };

    // Start deployment
    const result = await deploymentOrchestrator.startDeployment(deploymentRequest);

    // Store deployment-PR relationship
    await databaseConnector.createPRDeployment({
      deploymentId: result.deploymentId,
      repositoryFullName: repository.full_name,
      prNumber: pull_request.number,
      prBranch: pull_request.head.ref,
      prTitle: pull_request.title,
      author: pull_request.user.login,
      createdAt: new Date()
    });

    return { 
      processed: true, 
      message: `Deployment started for PR #${pull_request.number}: ${result.deploymentId}` 
    };
  } catch (error) {
    console.error('PR event handling error:', error);
    return { processed: false, message: `Error: ${error.message}` };
  }
}

/**
 * Handle GitHub push events
 */
async function handlePushEvent(payload, deploymentOrchestrator, databaseConnector) {
  const { ref, repository, commits } = payload;

  // Only handle pushes to main/master branch
  if (!ref.endsWith('/main') && !ref.endsWith('/master')) {
    return { processed: false, message: 'Push not to main branch' };
  }

  try {
    // Check if continuous deployment is enabled
    const repoConfig = await databaseConnector.getRepositoryConfig(repository.full_name);
    
    if (!repoConfig || !repoConfig.continuousDeployment) {
      return { processed: false, message: 'Continuous deployment not enabled' };
    }

    // Create deployment for main branch
    const deploymentRequest = {
      repositoryUrl: repository.clone_url,
      prBranch: ref.split('/').pop(),
      validationTasks: repoConfig.productionValidationTasks || [
        { type: 'test_execution', command: 'npm test' },
        { type: 'build_verification', command: 'npm run build' },
        { type: 'security_scan', command: 'npm audit' }
      ],
      gitConfig: {
        name: 'AgentAPI Bot',
        email: 'agentapi@example.com'
      },
      metadata: {
        requestedBy: 'github_webhook',
        commitSha: payload.after,
        commits: commits.length,
        repository: repository.full_name,
        type: 'continuous_deployment'
      }
    };

    const result = await deploymentOrchestrator.startDeployment(deploymentRequest);

    return { 
      processed: true, 
      message: `Continuous deployment started: ${result.deploymentId}` 
    };
  } catch (error) {
    console.error('Push event handling error:', error);
    return { processed: false, message: `Error: ${error.message}` };
  }
}

/**
 * Handle GitHub issue comment events
 */
async function handleIssueCommentEvent(payload, deploymentOrchestrator) {
  const { action, comment, issue } = payload;

  if (action !== 'created' || !issue.pull_request) {
    return { processed: false, message: 'Not a new PR comment' };
  }

  const commentBody = comment.body.toLowerCase();
  
  // Check for deployment trigger commands
  if (commentBody.includes('/deploy') || commentBody.includes('/validate')) {
    try {
      // Find existing deployment for this PR
      const prDeployments = await databaseConnector.getPRDeployments(
        payload.repository.full_name,
        issue.number
      );

      if (prDeployments.length === 0) {
        return { processed: false, message: 'No existing deployment found for this PR' };
      }

      // Get the latest deployment
      const latestDeployment = prDeployments[0];
      
      // Trigger re-validation
      const result = await deploymentOrchestrator.startDeployment(latestDeployment.request);

      return { 
        processed: true, 
        message: `Re-validation triggered by comment: ${result.deploymentId}` 
      };
    } catch (error) {
      console.error('Comment event handling error:', error);
      return { processed: false, message: `Error: ${error.message}` };
    }
  }

  return { processed: false, message: 'Comment does not contain deployment commands' };
}

/**
 * Handle GitHub pull request review events
 */
async function handlePullRequestReviewEvent(payload, deploymentOrchestrator) {
  const { action, review, pull_request } = payload;

  if (action !== 'submitted' || review.state !== 'approved') {
    return { processed: false, message: 'Not an approval review' };
  }

  try {
    // Check if auto-merge is enabled after approval
    const repoConfig = await databaseConnector.getRepositoryConfig(payload.repository.full_name);
    
    if (!repoConfig || !repoConfig.autoMergeOnApproval) {
      return { processed: false, message: 'Auto-merge on approval not enabled' };
    }

    // Find deployment for this PR
    const prDeployments = await databaseConnector.getPRDeployments(
      payload.repository.full_name,
      pull_request.number
    );

    if (prDeployments.length === 0) {
      return { processed: false, message: 'No deployment found for this PR' };
    }

    // Check if latest deployment was successful
    const latestDeployment = prDeployments[0];
    const deploymentStatus = deploymentOrchestrator.getDeploymentStatus(latestDeployment.deploymentId);

    if (!deploymentStatus || deploymentStatus.status !== 'completed') {
      return { processed: false, message: 'Latest deployment not completed successfully' };
    }

    // Trigger merge workflow (this would integrate with GitHub API)
    // For now, just log the event
    console.log(`PR #${pull_request.number} approved and ready for auto-merge`);

    return { 
      processed: true, 
      message: `PR approved and marked for auto-merge` 
    };
  } catch (error) {
    console.error('Review event handling error:', error);
    return { processed: false, message: `Error: ${error.message}` };
  }
}

/**
 * Handle GitHub workflow run events
 */
async function handleWorkflowRunEvent(payload, orchestratorClient) {
  const { action, workflow_run } = payload;

  if (action !== 'completed') {
    return { processed: false, message: 'Workflow not completed' };
  }

  try {
    // Notify orchestrator about workflow completion
    await orchestratorClient.notifyWorkflowCompletion({
      workflowId: workflow_run.id,
      status: workflow_run.conclusion,
      repository: payload.repository.full_name,
      branch: workflow_run.head_branch,
      commit: workflow_run.head_sha
    });

    return { 
      processed: true, 
      message: `Workflow completion notified to orchestrator` 
    };
  } catch (error) {
    console.error('Workflow event handling error:', error);
    return { processed: false, message: `Error: ${error.message}` };
  }
}

/**
 * Handle Linear issue events
 */
async function handleLinearIssueEvent(payload, deploymentOrchestrator, orchestratorClient) {
  const { action, data } = payload;

  if (action !== 'create' && action !== 'update') {
    return { processed: false, message: `Issue action '${action}' not handled` };
  }

  try {
    // Check if issue has deployment labels or mentions
    const issue = data;
    const labels = issue.labels || [];
    const description = issue.description || '';

    const hasDeploymentLabel = labels.some(label => 
      label.name.toLowerCase().includes('deploy') || 
      label.name.toLowerCase().includes('validation')
    );

    const hasDeploymentMention = description.toLowerCase().includes('@agentapi') ||
                                description.toLowerCase().includes('deploy') ||
                                description.toLowerCase().includes('validate');

    if (!hasDeploymentLabel && !hasDeploymentMention) {
      return { processed: false, message: 'Issue does not require deployment action' };
    }

    // Extract repository information from issue description
    const repoMatch = description.match(/repository:\s*([^\s\n]+)/i);
    const branchMatch = description.match(/branch:\s*([^\s\n]+)/i);

    if (!repoMatch || !branchMatch) {
      return { processed: false, message: 'Repository or branch information not found in issue' };
    }

    // Notify orchestrator about Linear issue
    await orchestratorClient.notifyLinearIssue({
      issueId: issue.id,
      title: issue.title,
      description: issue.description,
      repository: repoMatch[1],
      branch: branchMatch[1],
      action
    });

    return { 
      processed: true, 
      message: `Linear issue ${action} notified to orchestrator` 
    };
  } catch (error) {
    console.error('Linear issue event handling error:', error);
    return { processed: false, message: `Error: ${error.message}` };
  }
}

/**
 * Handle Linear comment events
 */
async function handleLinearCommentEvent(payload, deploymentOrchestrator) {
  const { action, data } = payload;

  if (action !== 'create') {
    return { processed: false, message: 'Not a new comment' };
  }

  const comment = data;
  const commentBody = comment.body.toLowerCase();

  // Check for deployment commands in Linear comments
  if (commentBody.includes('/deploy') || commentBody.includes('/validate')) {
    try {
      // This would trigger deployment based on Linear issue context
      console.log(`Deployment command detected in Linear comment: ${comment.id}`);

      return { 
        processed: true, 
        message: `Deployment command processed from Linear comment` 
      };
    } catch (error) {
      console.error('Linear comment event handling error:', error);
      return { processed: false, message: `Error: ${error.message}` };
    }
  }

  return { processed: false, message: 'Comment does not contain deployment commands' };
}

/**
 * Handle Linear project events
 */
async function handleLinearProjectEvent(payload, orchestratorClient) {
  const { action, data } = payload;

  try {
    // Notify orchestrator about project changes
    await orchestratorClient.notifyLinearProject({
      projectId: data.id,
      name: data.name,
      action
    });

    return { 
      processed: true, 
      message: `Linear project ${action} notified to orchestrator` 
    };
  } catch (error) {
    console.error('Linear project event handling error:', error);
    return { processed: false, message: `Error: ${error.message}` };
  }
}

module.exports = router;

