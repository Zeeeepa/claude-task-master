/**
 * @fileoverview Check Suite Handler
 * @description Handles GitHub check suite events for CI/CD integration
 */

import { log } from '../../../scripts/modules/utils.js';
import { PRValidation, ValidationStatus } from '../../database/models/validation.js';

/**
 * Check Suite Handler
 * Processes GitHub check suite events and updates validation status
 */
export class CheckSuiteHandler {
  constructor(config = {}) {
    this.config = {
      enableAutoRetry: config.enableAutoRetry !== false,
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 30000, // 30 seconds
      ...config
    };

    this.codegenClient = config.codegenClient;
    this.statusReporter = config.statusReporter;
  }

  /**
   * Handle check suite event
   * @param {Object} payload - GitHub webhook payload
   * @returns {Promise<void>}
   */
  async handleCheckSuite(payload) {
    const { action, check_suite, repository } = payload;

    log('info', `Processing check suite: ${action}`, {
      repository: repository.full_name,
      check_suite_id: check_suite.id,
      status: check_suite.status,
      conclusion: check_suite.conclusion,
      app_name: check_suite.app?.name
    });

    switch (action) {
      case 'completed':
        await this.handleCompleted(check_suite, repository);
        break;
      case 'requested':
        await this.handleRequested(check_suite, repository);
        break;
      case 'rerequested':
        await this.handleReRequested(check_suite, repository);
        break;
      default:
        log('info', `Unhandled check suite action: ${action}`);
    }
  }

  /**
   * Handle completed check suite
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} repository - GitHub repository object
   * @returns {Promise<void>}
   */
  async handleCompleted(checkSuite, repository) {
    try {
      // Process each PR associated with this check suite
      for (const pr of checkSuite.pull_requests || []) {
        await this.processCompletedCheckSuite(checkSuite, repository, pr);
      }
    } catch (error) {
      log('error', 'Failed to handle completed check suite', {
        check_suite_id: checkSuite.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle requested check suite
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} repository - GitHub repository object
   * @returns {Promise<void>}
   */
  async handleRequested(checkSuite, repository) {
    log('info', 'Check suite requested', {
      repository: repository.full_name,
      check_suite_id: checkSuite.id,
      head_sha: checkSuite.head_sha
    });

    // Update any related validations
    for (const pr of checkSuite.pull_requests || []) {
      const validation = await PRValidation.findByPR(pr.number, repository.full_name);
      if (validation) {
        await this.updateValidationWithCheckSuite(validation, checkSuite, 'requested');
      }
    }
  }

  /**
   * Handle re-requested check suite
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} repository - GitHub repository object
   * @returns {Promise<void>}
   */
  async handleReRequested(checkSuite, repository) {
    log('info', 'Check suite re-requested', {
      repository: repository.full_name,
      check_suite_id: checkSuite.id,
      head_sha: checkSuite.head_sha
    });

    // Reset any related validations
    for (const pr of checkSuite.pull_requests || []) {
      const validation = await PRValidation.findByPR(pr.number, repository.full_name);
      if (validation) {
        await validation.updateStatus(ValidationStatus.PENDING);
        await this.updateValidationWithCheckSuite(validation, checkSuite, 'rerequested');
      }
    }
  }

  /**
   * Process completed check suite for a specific PR
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} repository - GitHub repository object
   * @param {Object} pr - GitHub PR object
   * @returns {Promise<void>}
   */
  async processCompletedCheckSuite(checkSuite, repository, pr) {
    try {
      const validation = await PRValidation.findByPR(pr.number, repository.full_name);
      
      if (!validation) {
        log('info', 'No validation found for PR', {
          pr_number: pr.number,
          repository: repository.full_name
        });
        return;
      }

      await this.updateValidationWithCheckSuite(validation, checkSuite, 'completed');

      // Handle different conclusions
      switch (checkSuite.conclusion) {
        case 'success':
          await this.handleSuccessfulCheckSuite(validation, checkSuite, pr);
          break;
        case 'failure':
          await this.handleFailedCheckSuite(validation, checkSuite, pr);
          break;
        case 'cancelled':
          await this.handleCancelledCheckSuite(validation, checkSuite, pr);
          break;
        case 'timed_out':
          await this.handleTimedOutCheckSuite(validation, checkSuite, pr);
          break;
        case 'action_required':
          await this.handleActionRequiredCheckSuite(validation, checkSuite, pr);
          break;
        case 'neutral':
          await this.handleNeutralCheckSuite(validation, checkSuite, pr);
          break;
        default:
          log('warn', `Unknown check suite conclusion: ${checkSuite.conclusion}`);
      }

    } catch (error) {
      log('error', 'Failed to process completed check suite', {
        pr_number: pr.number,
        check_suite_id: checkSuite.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle successful check suite
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} pr - GitHub PR object
   * @returns {Promise<void>}
   */
  async handleSuccessfulCheckSuite(validation, checkSuite, pr) {
    log('info', 'Check suite completed successfully', {
      validation_id: validation.id,
      pr_number: pr.number,
      check_suite_id: checkSuite.id
    });

    // If this was a Codegen-triggered check suite, mark analysis as completed
    if (this.isCodegenCheckSuite(checkSuite)) {
      await validation.updateStatus(ValidationStatus.CODEGEN_ANALYSIS_COMPLETED);
    }

    // Update validation results
    await this.updateValidationResults(validation, checkSuite, 'success');
  }

  /**
   * Handle failed check suite
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} pr - GitHub PR object
   * @returns {Promise<void>}
   */
  async handleFailedCheckSuite(validation, checkSuite, pr) {
    log('info', 'Check suite failed', {
      validation_id: validation.id,
      pr_number: pr.number,
      check_suite_id: checkSuite.id
    });

    // Check if this is a Codegen-related failure that needs fixing
    if (this.isCodegenCheckSuite(checkSuite) && this.config.enableAutoRetry) {
      await this.requestCodegenFix(validation, checkSuite, pr);
    } else {
      // Regular failure handling
      await this.handleRegularFailure(validation, checkSuite, pr);
    }

    // Update validation results
    await this.updateValidationResults(validation, checkSuite, 'failure');
  }

  /**
   * Handle cancelled check suite
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} pr - GitHub PR object
   * @returns {Promise<void>}
   */
  async handleCancelledCheckSuite(validation, checkSuite, pr) {
    log('info', 'Check suite was cancelled', {
      validation_id: validation.id,
      pr_number: pr.number,
      check_suite_id: checkSuite.id
    });

    await this.updateValidationResults(validation, checkSuite, 'cancelled');
  }

  /**
   * Handle timed out check suite
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} pr - GitHub PR object
   * @returns {Promise<void>}
   */
  async handleTimedOutCheckSuite(validation, checkSuite, pr) {
    log('warn', 'Check suite timed out', {
      validation_id: validation.id,
      pr_number: pr.number,
      check_suite_id: checkSuite.id
    });

    // Consider retrying if this was a Codegen check
    if (this.isCodegenCheckSuite(checkSuite) && this.config.enableAutoRetry) {
      await this.scheduleRetry(validation, checkSuite, pr);
    }

    await this.updateValidationResults(validation, checkSuite, 'timed_out');
  }

  /**
   * Handle action required check suite
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} pr - GitHub PR object
   * @returns {Promise<void>}
   */
  async handleActionRequiredCheckSuite(validation, checkSuite, pr) {
    log('info', 'Check suite requires action', {
      validation_id: validation.id,
      pr_number: pr.number,
      check_suite_id: checkSuite.id
    });

    // Notify about required action
    if (this.statusReporter) {
      await this.statusReporter.postComment(pr, 
        `⚠️ **Action Required**: Check suite requires manual intervention. Please review the failed checks and take appropriate action.`
      );
    }

    await this.updateValidationResults(validation, checkSuite, 'action_required');
  }

  /**
   * Handle neutral check suite
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} pr - GitHub PR object
   * @returns {Promise<void>}
   */
  async handleNeutralCheckSuite(validation, checkSuite, pr) {
    log('info', 'Check suite completed with neutral result', {
      validation_id: validation.id,
      pr_number: pr.number,
      check_suite_id: checkSuite.id
    });

    await this.updateValidationResults(validation, checkSuite, 'neutral');
  }

  /**
   * Request Codegen fix for failed check suite
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} pr - GitHub PR object
   * @returns {Promise<void>}
   */
  async requestCodegenFix(validation, checkSuite, pr) {
    try {
      // Check retry count
      const retryCount = validation.retry_count || 0;
      if (retryCount >= this.config.maxRetries) {
        log('warn', 'Max retries exceeded for validation', {
          validation_id: validation.id,
          retry_count: retryCount,
          max_retries: this.config.maxRetries
        });
        return;
      }

      log('info', 'Requesting Codegen fix for failed check suite', {
        validation_id: validation.id,
        pr_number: pr.number,
        check_suite_id: checkSuite.id,
        retry_count: retryCount
      });

      const fixRequest = {
        type: 'check_suite_failure',
        pr_number: pr.number,
        repository: validation.repository,
        check_suite: {
          id: checkSuite.id,
          conclusion: checkSuite.conclusion,
          url: checkSuite.url,
          check_runs_url: checkSuite.check_runs_url
        },
        validation_id: validation.id,
        retry_count: retryCount,
        priority: 'high'
      };

      if (this.codegenClient) {
        await this.codegenClient.requestFixes(fixRequest);
        await validation.incrementRetry();
      }

    } catch (error) {
      log('error', 'Failed to request Codegen fix', {
        validation_id: validation.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle regular failure (non-Codegen)
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} pr - GitHub PR object
   * @returns {Promise<void>}
   */
  async handleRegularFailure(validation, checkSuite, pr) {
    log('info', 'Handling regular check suite failure', {
      validation_id: validation.id,
      pr_number: pr.number,
      check_suite_id: checkSuite.id
    });

    // Post helpful comment about the failure
    if (this.statusReporter) {
      const comment = this.generateFailureComment(checkSuite);
      await this.statusReporter.postComment(pr, comment);
    }
  }

  /**
   * Schedule retry for failed check suite
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {Object} pr - GitHub PR object
   * @returns {Promise<void>}
   */
  async scheduleRetry(validation, checkSuite, pr) {
    const retryCount = validation.retry_count || 0;
    
    if (retryCount >= this.config.maxRetries) {
      log('warn', 'Max retries exceeded, not scheduling retry', {
        validation_id: validation.id,
        retry_count: retryCount
      });
      return;
    }

    const delay = this.config.retryDelay * Math.pow(2, retryCount); // Exponential backoff
    
    log('info', 'Scheduling check suite retry', {
      validation_id: validation.id,
      retry_count: retryCount,
      delay_ms: delay
    });

    setTimeout(async () => {
      try {
        await this.requestCodegenFix(validation, checkSuite, pr);
      } catch (error) {
        log('error', 'Failed to execute scheduled retry', {
          validation_id: validation.id,
          error: error.message
        });
      }
    }, delay);
  }

  /**
   * Update validation with check suite information
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {string} action - Check suite action
   * @returns {Promise<void>}
   */
  async updateValidationWithCheckSuite(validation, checkSuite, action) {
    const checkSuiteData = {
      id: checkSuite.id,
      status: checkSuite.status,
      conclusion: checkSuite.conclusion,
      url: checkSuite.url,
      created_at: checkSuite.created_at,
      updated_at: checkSuite.updated_at,
      action: action,
      app: checkSuite.app ? {
        id: checkSuite.app.id,
        name: checkSuite.app.name
      } : null
    };

    await validation.setResults({
      ...validation.validation_results,
      check_suites: {
        ...validation.validation_results.check_suites,
        [checkSuite.id]: checkSuiteData
      }
    });
  }

  /**
   * Update validation results with check suite outcome
   * @param {PRValidation} validation - Validation instance
   * @param {Object} checkSuite - GitHub check suite object
   * @param {string} outcome - Check suite outcome
   * @returns {Promise<void>}
   */
  async updateValidationResults(validation, checkSuite, outcome) {
    const results = validation.validation_results || {};
    
    results.check_suite_outcomes = {
      ...results.check_suite_outcomes,
      [checkSuite.id]: {
        outcome: outcome,
        conclusion: checkSuite.conclusion,
        completed_at: new Date().toISOString(),
        app_name: checkSuite.app?.name
      }
    };

    await validation.setResults(results);
  }

  /**
   * Check if check suite is from Codegen
   * @param {Object} checkSuite - GitHub check suite object
   * @returns {boolean} True if Codegen check suite
   */
  isCodegenCheckSuite(checkSuite) {
    const codegenApps = ['codegen', 'codegen-bot', 'claude-task-master'];
    return checkSuite.app && codegenApps.includes(checkSuite.app.name.toLowerCase());
  }

  /**
   * Generate failure comment
   * @param {Object} checkSuite - GitHub check suite object
   * @returns {string} Comment text
   */
  generateFailureComment(checkSuite) {
    return `## ❌ Check Suite Failed

The check suite has failed with conclusion: **${checkSuite.conclusion}**

### Details
- **Check Suite ID**: ${checkSuite.id}
- **Status**: ${checkSuite.status}
- **App**: ${checkSuite.app?.name || 'Unknown'}

### Next Steps
1. Review the failed checks in the [check suite](${checkSuite.url})
2. Fix any issues identified in the checks
3. Push new commits to trigger re-validation

If you believe this is a false positive or need assistance, please comment \`@codegen analyze\` for automated analysis.`;
  }

  /**
   * Get check suite statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      // This would be populated with actual statistics in a real implementation
      total_processed: 0,
      successful: 0,
      failed: 0,
      retries_triggered: 0
    };
  }
}

export default CheckSuiteHandler;

