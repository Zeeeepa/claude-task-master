/**
 * @fileoverview Codegen SDK Wrapper
 * @description Bridge between Node.js and Python Codegen SDK
 */

import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Wrapper for the Codegen Python SDK
 */
export class CodegenSDKWrapper {
    constructor(config) {
        this.orgId = config.org_id || "323";
        this.token = config.token || config.api_key;
        this.apiUrl = config.api_url || "https://api.codegen.sh";
        this.timeout = config.timeout || 120000; // 2 minutes
        this.pythonPath = config.python_path || 'python3';
        this.maxRetries = config.max_retries || 3;
        
        if (!this.token) {
            throw new Error('Codegen API token is required');
        }
        
        log('debug', `CodegenSDKWrapper initialized with org_id: ${this.orgId}`);
    }

    /**
     * Execute a task using the Codegen Python SDK
     * @param {Object} prompt - The optimized prompt object
     * @returns {Promise<Object>} Task execution result
     */
    async executeTask(prompt) {
        const startTime = Date.now();
        log('info', `Executing Codegen task for prompt: ${prompt.task_id}`);

        try {
            // Create Python script for SDK execution
            const pythonScript = this._generatePythonScript(prompt);
            const result = await this._executePythonScript(pythonScript);
            
            const responseTime = Date.now() - startTime;
            log('info', `Codegen task completed in ${responseTime}ms`);
            
            return {
                success: true,
                data: result,
                response_time_ms: responseTime,
                task_id: prompt.task_id,
                request_id: prompt.metadata?.request_id
            };

        } catch (error) {
            const responseTime = Date.now() - startTime;
            log('error', `Codegen task failed: ${error.message}`);
            
            return {
                success: false,
                error: error.message,
                error_type: this._classifyError(error),
                response_time_ms: responseTime,
                task_id: prompt.task_id,
                request_id: prompt.metadata?.request_id
            };
        }
    }

    /**
     * Test connection to Codegen API
     * @returns {Promise<boolean>} Connection status
     */
    async testConnection() {
        log('debug', 'Testing Codegen API connection...');
        
        try {
            const testScript = `
import sys
import json
try:
    from codegen import Agent
    
    # Test agent initialization
    agent = Agent(org_id="${this.orgId}", token="${this.token}")
    
    # Simple connection test
    print(json.dumps({
        "status": "connected",
        "org_id": "${this.orgId}",
        "api_url": "${this.apiUrl}"
    }))
    
except ImportError as e:
    print(json.dumps({
        "status": "error",
        "error": "Codegen SDK not installed",
        "message": str(e)
    }))
    sys.exit(1)
    
except Exception as e:
    print(json.dumps({
        "status": "error",
        "error": "Connection failed",
        "message": str(e)
    }))
    sys.exit(1)
`;

            const result = await this._executePythonScript(testScript);
            return result.status === 'connected';

        } catch (error) {
            log('error', `Connection test failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Get SDK health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        const isConnected = await this.testConnection();
        
        return {
            status: isConnected ? 'healthy' : 'unhealthy',
            sdk_available: isConnected,
            org_id: this.orgId,
            api_url: this.apiUrl,
            python_path: this.pythonPath
        };
    }

    // Private methods

    /**
     * Generate Python script for SDK execution
     * @param {Object} prompt - The prompt object
     * @returns {string} Python script
     * @private
     */
    _generatePythonScript(prompt) {
        const escapedContent = prompt.content.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        
        return `
import sys
import json
import traceback
from datetime import datetime

try:
    from codegen import Agent
    
    # Initialize agent
    agent = Agent(org_id="${this.orgId}", token="${this.token}")
    
    # Prepare task content
    task_content = """${escapedContent}"""
    
    # Execute task
    task = agent.run(task_content)
    
    # Wait for completion with timeout
    import time
    max_wait = ${Math.floor(this.timeout / 1000)}  # Convert to seconds
    wait_time = 0
    
    while task.status not in ['completed', 'failed', 'error'] and wait_time < max_wait:
        time.sleep(5)  # Check every 5 seconds
        task.refresh()
        wait_time += 5
    
    # Prepare result
    result = {
        "task_id": "${prompt.task_id}",
        "status": task.status,
        "created_at": datetime.now().isoformat(),
        "metadata": ${JSON.stringify(prompt.metadata || {})}
    }
    
    if task.status == "completed":
        # Extract PR information from task result
        if hasattr(task, 'result') and task.result:
            result.update({
                "pr_url": getattr(task.result, 'pr_url', None),
                "pr_number": getattr(task.result, 'pr_number', None),
                "branch_name": getattr(task.result, 'branch_name', None),
                "title": getattr(task.result, 'title', None),
                "repository": getattr(task.result, 'repository', None),
                "modified_files": getattr(task.result, 'modified_files', []),
                "commits": getattr(task.result, 'commits', [])
            })
        
        # If result is a dict, merge it
        if isinstance(task.result, dict):
            result.update(task.result)
            
    elif task.status in ['failed', 'error']:
        result["error"] = getattr(task, 'error', 'Task execution failed')
        result["error_details"] = getattr(task, 'error_details', None)
    
    print(json.dumps(result))
    
except ImportError as e:
    error_result = {
        "status": "error",
        "error": "Codegen SDK not installed",
        "error_type": "import_error",
        "message": str(e),
        "task_id": "${prompt.task_id}"
    }
    print(json.dumps(error_result))
    sys.exit(1)
    
except Exception as e:
    error_result = {
        "status": "error",
        "error": str(e),
        "error_type": "execution_error",
        "traceback": traceback.format_exc(),
        "task_id": "${prompt.task_id}"
    }
    print(json.dumps(error_result))
    sys.exit(1)
`;
    }

    /**
     * Execute Python script and return parsed result
     * @param {string} script - Python script to execute
     * @returns {Promise<Object>} Parsed result
     * @private
     */
    async _executePythonScript(script) {
        return new Promise((resolve, reject) => {
            // Create temporary script file
            const scriptPath = join(tmpdir(), `codegen_script_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.py`);
            
            try {
                writeFileSync(scriptPath, script);
                
                const python = spawn(this.pythonPath, [scriptPath], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    timeout: this.timeout
                });

                let stdout = '';
                let stderr = '';

                python.stdout.on('data', (data) => {
                    stdout += data.toString();
                });

                python.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                python.on('close', (code) => {
                    // Cleanup temp file
                    try {
                        if (existsSync(scriptPath)) {
                            unlinkSync(scriptPath);
                        }
                    } catch (cleanupError) {
                        log('warning', `Failed to cleanup temp file: ${cleanupError.message}`);
                    }

                    if (code === 0) {
                        try {
                            const result = JSON.parse(stdout.trim());
                            resolve(result);
                        } catch (parseError) {
                            reject(new Error(`Failed to parse Python output: ${parseError.message}. Output: ${stdout}`));
                        }
                    } else {
                        const errorMessage = stderr || stdout || `Python process exited with code ${code}`;
                        reject(new Error(`Python execution failed: ${errorMessage}`));
                    }
                });

                python.on('error', (error) => {
                    // Cleanup temp file
                    try {
                        if (existsSync(scriptPath)) {
                            unlinkSync(scriptPath);
                        }
                    } catch (cleanupError) {
                        log('warning', `Failed to cleanup temp file: ${cleanupError.message}`);
                    }
                    
                    reject(new Error(`Failed to spawn Python process: ${error.message}`));
                });

            } catch (error) {
                // Cleanup temp file
                try {
                    if (existsSync(scriptPath)) {
                        unlinkSync(scriptPath);
                    }
                } catch (cleanupError) {
                    log('warning', `Failed to cleanup temp file: ${cleanupError.message}`);
                }
                
                reject(error);
            }
        });
    }

    /**
     * Classify error type for better handling
     * @param {Error} error - The error to classify
     * @returns {string} Error type
     * @private
     */
    _classifyError(error) {
        const message = error.message.toLowerCase();
        
        if (message.includes('timeout') || message.includes('etimedout')) {
            return 'timeout';
        } else if (message.includes('connection') || message.includes('econnrefused')) {
            return 'connection';
        } else if (message.includes('authentication') || message.includes('unauthorized')) {
            return 'authentication';
        } else if (message.includes('rate limit') || message.includes('429')) {
            return 'rate_limit';
        } else if (message.includes('import') || message.includes('module')) {
            return 'import_error';
        } else if (message.includes('python') || message.includes('spawn')) {
            return 'python_error';
        } else {
            return 'unknown';
        }
    }
}

export default CodegenSDKWrapper;

