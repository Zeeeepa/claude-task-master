/**
 * Validation Utilities
 * Common validation functions for webhook payloads and requests
 */

/**
 * Validate GitHub webhook payload
 */
export function validateGitHubPayload(payload, eventType) {
  const errors = [];
  
  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be a valid object');
    return { valid: false, errors };
  }
  
  // Common validations for all GitHub events
  if (!payload.sender || !payload.sender.login) {
    errors.push('Missing or invalid sender information');
  }
  
  if (!payload.repository && eventType !== 'ping') {
    errors.push('Missing repository information');
  }
  
  // Event-specific validations
  switch (eventType) {
    case 'pull_request':
      validatePullRequestPayload(payload, errors);
      break;
    
    case 'push':
      validatePushPayload(payload, errors);
      break;
    
    case 'check_run':
    case 'check_suite':
      validateCheckPayload(payload, errors);
      break;
    
    case 'ping':
      // Ping events are always valid
      break;
    
    default:
      // Unknown events are considered valid but logged
      console.log(`⚠️ Unknown GitHub event type: ${eventType}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate Pull Request payload
 */
function validatePullRequestPayload(payload, errors) {
  if (!payload.action) {
    errors.push('Missing pull_request action');
  }
  
  if (!payload.pull_request) {
    errors.push('Missing pull_request data');
    return;
  }
  
  const pr = payload.pull_request;
  
  if (!pr.number || typeof pr.number !== 'number') {
    errors.push('Missing or invalid pull_request number');
  }
  
  if (!pr.title || typeof pr.title !== 'string') {
    errors.push('Missing or invalid pull_request title');
  }
  
  if (!pr.head || !pr.head.ref) {
    errors.push('Missing pull_request head branch');
  }
  
  if (!pr.base || !pr.base.ref) {
    errors.push('Missing pull_request base branch');
  }
  
  if (!pr.user || !pr.user.login) {
    errors.push('Missing pull_request author');
  }
}

/**
 * Validate Push payload
 */
function validatePushPayload(payload, errors) {
  if (!payload.ref) {
    errors.push('Missing push ref');
  }
  
  if (!payload.commits || !Array.isArray(payload.commits)) {
    errors.push('Missing or invalid commits array');
  }
  
  if (!payload.pusher || !payload.pusher.name) {
    errors.push('Missing pusher information');
  }
}

/**
 * Validate Check payload
 */
function validateCheckPayload(payload, errors) {
  if (!payload.action) {
    errors.push('Missing check action');
  }
  
  const checkData = payload.check_run || payload.check_suite;
  if (!checkData) {
    errors.push('Missing check data');
    return;
  }
  
  if (!checkData.status) {
    errors.push('Missing check status');
  }
}

/**
 * Validate Linear webhook payload
 */
export function validateLinearPayload(payload) {
  const errors = [];
  
  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be a valid object');
    return { valid: false, errors };
  }
  
  if (!payload.type) {
    errors.push('Missing Linear event type');
  }
  
  if (!payload.action) {
    errors.push('Missing Linear action');
  }
  
  if (!payload.data) {
    errors.push('Missing Linear event data');
  }
  
  // Event-specific validations
  switch (payload.type) {
    case 'Issue':
      validateLinearIssuePayload(payload, errors);
      break;
    
    case 'Comment':
      validateLinearCommentPayload(payload, errors);
      break;
    
    case 'Project':
    case 'Cycle':
    case 'Team':
    case 'User':
      // Basic validation is sufficient for these types
      break;
    
    default:
      console.log(`⚠️ Unknown Linear event type: ${payload.type}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate Linear Issue payload
 */
function validateLinearIssuePayload(payload, errors) {
  const issue = payload.data;
  
  if (!issue.id) {
    errors.push('Missing issue ID');
  }
  
  if (!issue.title) {
    errors.push('Missing issue title');
  }
  
  if (!issue.identifier) {
    errors.push('Missing issue identifier');
  }
  
  if (payload.action === 'update' && !payload.updatedFrom) {
    errors.push('Missing updatedFrom data for issue update');
  }
}

/**
 * Validate Linear Comment payload
 */
function validateLinearCommentPayload(payload, errors) {
  const comment = payload.data;
  
  if (!comment.id) {
    errors.push('Missing comment ID');
  }
  
  if (!comment.body) {
    errors.push('Missing comment body');
  }
  
  if (!comment.issueId) {
    errors.push('Missing comment issue ID');
  }
  
  if (!comment.userId) {
    errors.push('Missing comment user ID');
  }
}

/**
 * Validate Codegen webhook payload
 */
export function validateCodegenPayload(payload, eventType) {
  const errors = [];
  
  if (!payload || typeof payload !== 'object') {
    errors.push('Payload must be a valid object');
    return { valid: false, errors };
  }
  
  // Event-specific validations
  switch (eventType) {
    case 'agent_status':
      validateAgentStatusPayload(payload, errors);
      break;
    
    case 'validation_complete':
    case 'validation_failed':
      validateValidationPayload(payload, errors);
      break;
    
    case 'pr_created':
    case 'pr_updated':
      validatePREventPayload(payload, errors);
      break;
    
    case 'error_escalation':
      validateErrorEscalationPayload(payload, errors);
      break;
    
    case 'workflow_complete':
      validateWorkflowPayload(payload, errors);
      break;
    
    default:
      console.log(`⚠️ Unknown Codegen event type: ${eventType}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate Agent Status payload
 */
function validateAgentStatusPayload(payload, errors) {
  if (!payload.agentId) {
    errors.push('Missing agent ID');
  }
  
  if (!payload.status) {
    errors.push('Missing agent status');
  }
  
  const validStatuses = ['started', 'working', 'completed', 'failed', 'error'];
  if (payload.status && !validStatuses.includes(payload.status)) {
    errors.push(`Invalid agent status: ${payload.status}`);
  }
}

/**
 * Validate Validation payload
 */
function validateValidationPayload(payload, errors) {
  if (!payload.validationId) {
    errors.push('Missing validation ID');
  }
  
  if (!payload.result) {
    errors.push('Missing validation result');
  }
  
  if (payload.result && !payload.result.status) {
    errors.push('Missing validation result status');
  }
}

/**
 * Validate PR Event payload
 */
function validatePREventPayload(payload, errors) {
  if (!payload.repository) {
    errors.push('Missing repository');
  }
  
  if (!payload.prNumber || typeof payload.prNumber !== 'number') {
    errors.push('Missing or invalid PR number');
  }
  
  if (!payload.prUrl) {
    errors.push('Missing PR URL');
  }
}

/**
 * Validate Error Escalation payload
 */
function validateErrorEscalationPayload(payload, errors) {
  if (!payload.agentId) {
    errors.push('Missing agent ID');
  }
  
  if (!payload.error) {
    errors.push('Missing error message');
  }
  
  if (!payload.severity) {
    errors.push('Missing error severity');
  }
}

/**
 * Validate Workflow payload
 */
function validateWorkflowPayload(payload, errors) {
  if (!payload.workflowId) {
    errors.push('Missing workflow ID');
  }
  
  if (!payload.workflowType) {
    errors.push('Missing workflow type');
  }
  
  if (!payload.status) {
    errors.push('Missing workflow status');
  }
}

/**
 * Validate webhook headers
 */
export function validateWebhookHeaders(headers, webhookType) {
  const errors = [];
  
  switch (webhookType) {
    case 'github':
      if (!headers['x-github-event']) {
        errors.push('Missing X-GitHub-Event header');
      }
      
      if (!headers['x-github-delivery']) {
        errors.push('Missing X-GitHub-Delivery header');
      }
      
      if (!headers['x-hub-signature-256']) {
        errors.push('Missing X-Hub-Signature-256 header');
      }
      break;
    
    case 'linear':
      if (!headers['linear-signature']) {
        errors.push('Missing Linear-Signature header');
      }
      break;
    
    case 'codegen':
      if (!headers['x-codegen-event']) {
        errors.push('Missing X-Codegen-Event header');
      }
      
      if (!headers['x-codegen-signature']) {
        errors.push('Missing X-Codegen-Signature header');
      }
      break;
    
    default:
      errors.push(`Unknown webhook type: ${webhookType}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Validate request body size
 */
export function validateRequestSize(body, maxSize = 10 * 1024 * 1024) { // 10MB default
  if (!body) {
    return { valid: true, errors: [] };
  }
  
  const size = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(JSON.stringify(body));
  
  if (size > maxSize) {
    return {
      valid: false,
      errors: [`Request body too large: ${size} bytes (max: ${maxSize} bytes)`]
    };
  }
  
  return { valid: true, errors: [] };
}

/**
 * Validate JSON structure
 */
export function validateJSON(jsonString) {
  try {
    const parsed = JSON.parse(jsonString);
    return {
      valid: true,
      errors: [],
      data: parsed
    };
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid JSON: ${error.message}`],
      data: null
    };
  }
}

/**
 * Validate URL format
 */
export function validateURL(url) {
  try {
    new URL(url);
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [`Invalid URL format: ${error.message}`]
    };
  }
}

/**
 * Validate email format
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    return {
      valid: false,
      errors: ['Invalid email format']
    };
  }
  
  return { valid: true, errors: [] };
}

/**
 * Validate timestamp
 */
export function validateTimestamp(timestamp) {
  const date = new Date(timestamp);
  
  if (isNaN(date.getTime())) {
    return {
      valid: false,
      errors: ['Invalid timestamp format']
    };
  }
  
  // Check if timestamp is not too far in the future or past
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  const timestampAge = Math.abs(now - date.getTime());
  
  if (timestampAge > maxAge) {
    return {
      valid: false,
      errors: ['Timestamp is too old or too far in the future']
    };
  }
  
  return { valid: true, errors: [] };
}

/**
 * Sanitize input string
 */
export function sanitizeString(input, maxLength = 1000) {
  if (typeof input !== 'string') {
    return '';
  }
  
  // Remove potentially dangerous characters
  const sanitized = input
    .replace(/[<>]/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: URLs
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
  
  // Truncate if too long
  return sanitized.length > maxLength ? 
    sanitized.substring(0, maxLength) + '...' : 
    sanitized;
}

/**
 * Validate and sanitize webhook payload
 */
export function validateAndSanitizePayload(payload, webhookType, eventType) {
  // First validate the structure
  let validation;
  
  switch (webhookType) {
    case 'github':
      validation = validateGitHubPayload(payload, eventType);
      break;
    case 'linear':
      validation = validateLinearPayload(payload);
      break;
    case 'codegen':
      validation = validateCodegenPayload(payload, eventType);
      break;
    default:
      validation = { valid: false, errors: [`Unknown webhook type: ${webhookType}`] };
  }
  
  if (!validation.valid) {
    return validation;
  }
  
  // Sanitize string fields recursively
  const sanitizedPayload = sanitizeObjectStrings(payload);
  
  return {
    valid: true,
    errors: [],
    sanitizedPayload
  };
}

/**
 * Recursively sanitize string fields in an object
 */
function sanitizeObjectStrings(obj, maxDepth = 10, currentDepth = 0) {
  if (currentDepth >= maxDepth) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectStrings(item, maxDepth, currentDepth + 1));
  }
  
  if (obj && typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObjectStrings(value, maxDepth, currentDepth + 1);
    }
    return sanitized;
  }
  
  return obj;
}

