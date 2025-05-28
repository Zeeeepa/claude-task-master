/**
 * @fileoverview Codegen Integration Client
 * @description Client for integrating with Codegen API for PR analysis and fixes
 */

import { log } from '../../scripts/modules/utils.js';
import { CodegenErrorHandler } from '../ai_cicd_system/core/error_handler.js';
import { webhookConfig } from '../webhooks/config.js';

/**
 * Codegen Integration Client
 * Handles communication with Codegen API for automated analysis and fixes
 */
export class CodegenIntegration {
  constructor(config = {}) {
    this.config = {
      baseURL: config.baseURL || webhookConfig.codegen.baseURL,
      apiKey: config.apiKey || webhookConfig.codegen.apiKey,
      timeout: config.timeout || webhookConfig.codegen.timeout,
      ...config
    };

    this.errorHandler = new CodegenErrorHandler({
      enableRetry: true,
      enableCircuitBreaker: true,
      maxRetries: 3
    });

    this.requestQueue = [];
    this.processing = false;
  }

  /**
   * Request analysis from Codegen
   * @param {Object} analysisRequest - Analysis request data
   * @returns {Promise<Object>} Analysis response
   */
  async requestAnalysis(analysisRequest) {
    try {
      log('info', 'Requesting Codegen analysis', {
        type: analysisRequest.type,
        pr_number: analysisRequest.pr_number,
        repository: analysisRequest.repository
      });

      const response = await this.errorHandler.handleError(
        async () => {
          return await this._makeRequest('/api/v1/analysis/request', {
            method: 'POST',
            body: JSON.stringify(analysisRequest),
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.apiKey}`,
              'X-Request-ID': this._generateRequestId()
            }
          });
        },
        { component: 'codegen_client', operation: 'request_analysis' }
      );

      log('info', 'Codegen analysis requested successfully', {
        analysis_id: response.analysis_id,
        status: response.status
      });

      return response;
    } catch (error) {
      log('error', 'Failed to request Codegen analysis', {
        error: error.message,
        pr_number: analysisRequest.pr_number
      });
      throw error;
    }
  }

  /**
   * Get analysis status
   * @param {string} analysisId - Analysis ID
   * @returns {Promise<Object>} Analysis status
   */
  async getAnalysisStatus(analysisId) {
    try {
      const response = await this._makeRequest(`/api/v1/analysis/${analysisId}/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      return response;
    } catch (error) {
      log('error', 'Failed to get analysis status', {
        error: error.message,
        analysis_id: analysisId
      });
      throw error;
    }
  }

  /**
   * Get analysis results
   * @param {string} analysisId - Analysis ID
   * @returns {Promise<Object>} Analysis results
   */
  async getAnalysisResults(analysisId) {
    try {
      const response = await this._makeRequest(`/api/v1/analysis/${analysisId}/results`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      log('info', 'Retrieved Codegen analysis results', {
        analysis_id: analysisId,
        fixes_count: response.fixes?.length || 0,
        suggestions_count: response.suggestions?.length || 0
      });

      return response;
    } catch (error) {
      log('error', 'Failed to get analysis results', {
        error: error.message,
        analysis_id: analysisId
      });
      throw error;
    }
  }

  /**
   * Submit PR feedback
   * @param {Object} feedback - Feedback data
   * @returns {Promise<Object>} Feedback response
   */
  async submitFeedback(feedback) {
    try {
      const response = await this._makeRequest('/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify(feedback),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      log('info', 'Submitted feedback to Codegen', {
        pr_number: feedback.pr_number,
        feedback_type: feedback.type
      });

      return response;
    } catch (error) {
      log('error', 'Failed to submit feedback', {
        error: error.message,
        pr_number: feedback.pr_number
      });
      throw error;
    }
  }

  /**
   * Request automated fixes
   * @param {Object} fixRequest - Fix request data
   * @returns {Promise<Object>} Fix response
   */
  async requestFixes(fixRequest) {
    try {
      log('info', 'Requesting automated fixes from Codegen', {
        pr_number: fixRequest.pr_number,
        issues_count: fixRequest.issues?.length || 0
      });

      const response = await this._makeRequest('/api/v1/fixes/request', {
        method: 'POST',
        body: JSON.stringify(fixRequest),
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
          'X-Request-ID': this._generateRequestId()
        }
      });

      return response;
    } catch (error) {
      log('error', 'Failed to request fixes', {
        error: error.message,
        pr_number: fixRequest.pr_number
      });
      throw error;
    }
  }

  /**
   * Get system health
   * @returns {Promise<Object>} Health status
   */
  async getHealth() {
    try {
      const response = await this._makeRequest('/api/v1/health', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });

      return response;
    } catch (error) {
      log('error', 'Failed to get Codegen health status', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Queue analysis request for batch processing
   * @param {Object} analysisRequest - Analysis request
   * @returns {Promise<void>}
   */
  async queueAnalysis(analysisRequest) {
    this.requestQueue.push({
      ...analysisRequest,
      queued_at: new Date().toISOString(),
      id: this._generateRequestId()
    });

    log('info', 'Queued analysis request', {
      queue_size: this.requestQueue.length,
      pr_number: analysisRequest.pr_number
    });

    // Process queue if not already processing
    if (!this.processing) {
      this._processQueue();
    }
  }

  /**
   * Get queue status
   * @returns {Object} Queue status
   */
  getQueueStatus() {
    return {
      queue_size: this.requestQueue.length,
      processing: this.processing,
      last_processed: this.lastProcessed || null
    };
  }

  /**
   * Process queued requests
   * @private
   */
  async _processQueue() {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.requestQueue.length > 0) {
        const request = this.requestQueue.shift();
        
        try {
          await this.requestAnalysis(request);
          this.lastProcessed = new Date().toISOString();
          
          // Add delay between requests to avoid rate limiting
          await this._delay(1000);
        } catch (error) {
          log('error', 'Failed to process queued request', {
            error: error.message,
            request_id: request.id
          });
          
          // Re-queue failed requests with exponential backoff
          if (request.retry_count < 3) {
            request.retry_count = (request.retry_count || 0) + 1;
            request.retry_delay = Math.pow(2, request.retry_count) * 1000;
            
            setTimeout(() => {
              this.requestQueue.push(request);
            }, request.retry_delay);
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Make HTTP request to Codegen API
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Request options
   * @returns {Promise<Object>} Response data
   * @private
   */
  async _makeRequest(endpoint, options = {}) {
    const url = `${this.config.baseURL}${endpoint}`;
    
    const requestOptions = {
      timeout: this.config.timeout,
      ...options,
      headers: {
        'User-Agent': 'Claude-Task-Master-Webhook/1.0',
        ...options.headers
      }
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...requestOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }

  /**
   * Generate unique request ID
   * @returns {string} Request ID
   * @private
   */
  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay execution
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise<void>}
   * @private
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default CodegenIntegration;

