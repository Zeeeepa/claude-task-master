/**
 * AgentAPI Integration for Task Master PR Analysis
 * 
 * Provides integration with AgentAPI for deploying Claude Code agents
 * to automatically fix issues detected during PR analysis.
 */

/**
 * AgentAPI Integration Manager
 */
export class AgentAPIIntegration {
    constructor(config = {}) {
        this.config = {
            base_url: config.base_url || process.env.AGENTAPI_BASE_URL || 'http://localhost:8000',
            api_key: config.api_key || process.env.AGENTAPI_KEY,
            timeout: config.timeout || 300000, // 5 minutes
            max_retries: config.max_retries || 3,
            auto_fix_enabled: config.auto_fix_enabled !== false,
            task_aware_fixes: config.task_aware_fixes !== false,
            ...config
        };
        
        if (!this.config.api_key) {
            console.warn('AgentAPI key not configured - auto-fix features will be disabled');
        }
        
        this.activeDeployments = new Map();
        this.deploymentHistory = [];
        this.fixTemplates = new Map();
        
        this.initializeFixTemplates();
    }

    /**
     * Initialize fix templates for different issue types
     */
    initializeFixTemplates() {
        // Task completion fix template
        this.fixTemplates.set('task_completion', {
            agent_type: 'claude-code',
            instructions: `
                You are a task completion specialist. Your job is to analyze the current PR 
                and ensure it fully meets the task requirements.
                
                Focus on:
                1. Reviewing task acceptance criteria
                2. Identifying missing implementations
                3. Adding missing functionality
                4. Ensuring all requirements are addressed
                
                Provide specific, actionable fixes that complete the task requirements.
            `,
            tools: ['code_analysis', 'file_modification', 'test_generation'],
            priority: 'high'
        });
        
        // Dependency fix template
        this.fixTemplates.set('dependency', {
            agent_type: 'claude-code',
            instructions: `
                You are a dependency resolution specialist. Your job is to fix dependency 
                conflicts and ensure proper integration between tasks.
                
                Focus on:
                1. Analyzing dependency conflicts
                2. Updating import statements
                3. Resolving version conflicts
                4. Ensuring proper API contracts
                
                Make minimal, targeted changes to resolve dependency issues.
            `,
            tools: ['dependency_analysis', 'package_management', 'api_validation'],
            priority: 'high'
        });
        
        // Code quality fix template
        this.fixTemplates.set('quality', {
            agent_type: 'claude-code',
            instructions: `
                You are a code quality improvement specialist. Your job is to improve 
                code quality while maintaining functionality.
                
                Focus on:
                1. Refactoring complex code
                2. Improving readability
                3. Adding proper error handling
                4. Optimizing performance
                
                Make improvements that enhance maintainability and reliability.
            `,
            tools: ['code_refactoring', 'quality_analysis', 'performance_optimization'],
            priority: 'medium'
        });
        
        // Security fix template
        this.fixTemplates.set('security', {
            agent_type: 'claude-code',
            instructions: `
                You are a security specialist. Your job is to identify and fix 
                security vulnerabilities in the code.
                
                Focus on:
                1. Fixing security vulnerabilities
                2. Implementing proper authentication
                3. Adding input validation
                4. Securing API endpoints
                
                Prioritize security fixes that protect against common vulnerabilities.
            `,
            tools: ['security_analysis', 'vulnerability_scanning', 'secure_coding'],
            priority: 'critical'
        });
        
        // Performance fix template
        this.fixTemplates.set('performance', {
            agent_type: 'claude-code',
            instructions: `
                You are a performance optimization specialist. Your job is to improve 
                application performance and resource utilization.
                
                Focus on:
                1. Optimizing slow algorithms
                2. Reducing memory usage
                3. Improving database queries
                4. Caching strategies
                
                Make performance improvements that provide measurable benefits.
            `,
            tools: ['performance_profiling', 'optimization', 'caching'],
            priority: 'medium'
        });
        
        // AI editor compatibility fix template
        this.fixTemplates.set('ai_editor', {
            agent_type: 'claude-code',
            instructions: `
                You are an AI editor compatibility specialist. Your job is to ensure 
                code works seamlessly with AI editors like Cursor, Lovable, Windsurf, and Roo.
                
                Focus on:
                1. Fixing MCP integration issues
                2. Improving AI editor compatibility
                3. Adding proper configuration
                4. Ensuring smooth workflow integration
                
                Make changes that enhance the AI-assisted development experience.
            `,
            tools: ['mcp_integration', 'editor_compatibility', 'workflow_optimization'],
            priority: 'medium'
        });
    }

    /**
     * Deploy fix agent for a specific issue
     */
    async deployFixAgent(options = {}) {
        const { issue, pr_context, task_context, analysis_context } = options;
        
        if (!this.config.auto_fix_enabled) {
            throw new Error('Auto-fix is disabled');
        }
        
        if (!this.config.api_key) {
            throw new Error('AgentAPI key not configured');
        }
        
        try {
            // Generate deployment configuration
            const deploymentConfig = await this.generateDeploymentConfig(
                issue,
                pr_context,
                task_context,
                analysis_context
            );
            
            // Deploy agent
            const deployment = await this.deployAgent(deploymentConfig);
            
            // Track deployment
            this.activeDeployments.set(deployment.id, deployment);
            this.deploymentHistory.push({
                ...deployment,
                issue_id: issue.id,
                timestamp: new Date().toISOString()
            });
            
            // Monitor deployment
            this.monitorDeployment(deployment.id);
            
            return deployment;
            
        } catch (error) {
            console.error('Failed to deploy fix agent:', error);
            throw new Error(`Agent deployment failed: ${error.message}`);
        }
    }

    /**
     * Generate deployment configuration for an issue
     */
    async generateDeploymentConfig(issue, prContext, taskContext, analysisContext) {
        // Get fix template for issue type
        const template = this.fixTemplates.get(issue.type) || this.fixTemplates.get('quality');
        
        // Generate task-aware instructions
        const taskAwareInstructions = this.generateTaskAwareInstructions(
            template.instructions,
            issue,
            taskContext
        );
        
        // Generate context for the agent
        const agentContext = {
            issue: {
                title: issue.title,
                description: issue.description,
                severity: issue.severity,
                type: issue.type,
                file: issue.file,
                line: issue.line,
                suggestion: issue.suggestion
            },
            pr: {
                url: prContext.pr_url,
                title: prContext.title,
                files: prContext.files,
                diff: prContext.diff
            },
            task: {
                id: taskContext.task_id,
                title: taskContext.title,
                description: taskContext.description,
                acceptance_criteria: taskContext.acceptance_criteria,
                dependencies: taskContext.dependencies
            },
            analysis: {
                overall_score: analysisContext.overall_score,
                grade: analysisContext.grade,
                ai_editor: analysisContext.ai_editor
            }
        };
        
        return {
            agent_type: template.agent_type,
            instructions: taskAwareInstructions,
            context: agentContext,
            tools: template.tools,
            priority: template.priority,
            timeout: this.config.timeout,
            max_retries: this.config.max_retries,
            metadata: {
                issue_id: issue.id,
                task_id: taskContext.task_id,
                pr_url: prContext.pr_url,
                analysis_id: analysisContext.analysis_id
            }
        };
    }

    /**
     * Generate task-aware instructions
     */
    generateTaskAwareInstructions(baseInstructions, issue, taskContext) {
        let instructions = baseInstructions;
        
        if (this.config.task_aware_fixes && taskContext.task_id) {
            instructions += `\n\nTASK CONTEXT:\n`;
            instructions += `- Task ID: ${taskContext.task_id}\n`;
            
            if (taskContext.title) {
                instructions += `- Task Title: ${taskContext.title}\n`;
            }
            
            if (taskContext.description) {
                instructions += `- Task Description: ${taskContext.description}\n`;
            }
            
            if (taskContext.acceptance_criteria && taskContext.acceptance_criteria.length > 0) {
                instructions += `- Acceptance Criteria:\n`;
                taskContext.acceptance_criteria.forEach((criteria, index) => {
                    instructions += `  ${index + 1}. ${criteria}\n`;
                });
            }
            
            if (taskContext.dependencies && taskContext.dependencies.length > 0) {
                instructions += `- Dependencies: ${taskContext.dependencies.join(', ')}\n`;
            }
            
            instructions += `\nEnsure your fix aligns with the task requirements and doesn't break dependencies.\n`;
        }
        
        // Add issue-specific context
        instructions += `\n\nISSUE TO FIX:\n`;
        instructions += `- Title: ${issue.title}\n`;
        instructions += `- Description: ${issue.description}\n`;
        instructions += `- Severity: ${issue.severity}\n`;
        
        if (issue.file) {
            instructions += `- File: ${issue.file}\n`;
        }
        
        if (issue.line) {
            instructions += `- Line: ${issue.line}\n`;
        }
        
        if (issue.suggestion) {
            instructions += `- Suggested Fix: ${issue.suggestion}\n`;
        }
        
        return instructions;
    }

    /**
     * Deploy agent to AgentAPI
     */
    async deployAgent(config) {
        try {
            // Mock AgentAPI deployment - in real implementation, this would make HTTP requests
            const deployment = {
                id: `deployment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                agent_type: config.agent_type,
                status: 'deploying',
                created_at: new Date().toISOString(),
                config: config,
                url: `${this.config.base_url}/deployments/${config.metadata.issue_id}`,
                estimated_completion: new Date(Date.now() + config.timeout).toISOString()
            };
            
            console.log(`Deploying ${config.agent_type} agent for issue: ${config.metadata.issue_id}`);
            
            // Simulate deployment process
            setTimeout(() => {
                deployment.status = 'running';
                deployment.started_at = new Date().toISOString();
                this.activeDeployments.set(deployment.id, deployment);
            }, 2000);
            
            return deployment;
            
        } catch (error) {
            console.error('AgentAPI deployment failed:', error);
            throw new Error(`Deployment failed: ${error.message}`);
        }
    }

    /**
     * Monitor deployment progress
     */
    monitorDeployment(deploymentId) {
        const checkInterval = 30000; // 30 seconds
        
        const monitor = setInterval(async () => {
            try {
                const status = await this.getDeploymentStatus(deploymentId);
                
                if (status.status === 'completed' || status.status === 'failed') {
                    clearInterval(monitor);
                    await this.handleDeploymentCompletion(deploymentId, status);
                }
                
            } catch (error) {
                console.error(`Failed to monitor deployment ${deploymentId}:`, error);
                clearInterval(monitor);
            }
        }, checkInterval);
        
        // Set timeout to stop monitoring
        setTimeout(() => {
            clearInterval(monitor);
        }, this.config.timeout);
    }

    /**
     * Get deployment status
     */
    async getDeploymentStatus(deploymentId) {
        try {
            // Mock status check - in real implementation, this would query AgentAPI
            const deployment = this.activeDeployments.get(deploymentId);
            if (!deployment) {
                throw new Error('Deployment not found');
            }
            
            // Simulate status progression
            const elapsed = Date.now() - new Date(deployment.created_at).getTime();
            
            if (elapsed > 120000) { // 2 minutes
                return {
                    ...deployment,
                    status: 'completed',
                    completed_at: new Date().toISOString(),
                    result: {
                        success: Math.random() > 0.2, // 80% success rate
                        files_modified: Math.floor(Math.random() * 5) + 1,
                        fixes_applied: Math.floor(Math.random() * 3) + 1,
                        tests_added: Math.random() > 0.5,
                        documentation_updated: Math.random() > 0.7
                    }
                };
            } else if (elapsed > 10000) { // 10 seconds
                return {
                    ...deployment,
                    status: 'running',
                    progress: Math.min(90, (elapsed / 120000) * 100)
                };
            }
            
            return deployment;
            
        } catch (error) {
            console.error('Failed to get deployment status:', error);
            throw new Error(`Status check failed: ${error.message}`);
        }
    }

    /**
     * Handle deployment completion
     */
    async handleDeploymentCompletion(deploymentId, finalStatus) {
        try {
            const deployment = this.activeDeployments.get(deploymentId);
            if (!deployment) {
                return;
            }
            
            // Update deployment record
            const completedDeployment = {
                ...deployment,
                ...finalStatus,
                completed_at: new Date().toISOString()
            };
            
            // Remove from active deployments
            this.activeDeployments.delete(deploymentId);
            
            // Update history
            const historyIndex = this.deploymentHistory.findIndex(d => d.id === deploymentId);
            if (historyIndex >= 0) {
                this.deploymentHistory[historyIndex] = completedDeployment;
            }
            
            // Log completion
            console.log(`Deployment ${deploymentId} completed with status: ${finalStatus.status}`);
            
            if (finalStatus.status === 'completed' && finalStatus.result) {
                console.log('Fix results:', finalStatus.result);
            }
            
            return completedDeployment;
            
        } catch (error) {
            console.error('Failed to handle deployment completion:', error);
        }
    }

    /**
     * Deploy multiple agents for batch fixing
     */
    async deployBatchFixAgents(issues, prContext, taskContext, analysisContext) {
        const deployments = [];
        const maxConcurrent = 3; // Limit concurrent deployments
        
        // Group issues by priority
        const prioritizedIssues = this.prioritizeIssues(issues);
        
        // Deploy agents in batches
        for (let i = 0; i < prioritizedIssues.length; i += maxConcurrent) {
            const batch = prioritizedIssues.slice(i, i + maxConcurrent);
            
            const batchPromises = batch.map(async (issue) => {
                try {
                    return await this.deployFixAgent({
                        issue,
                        pr_context: prContext,
                        task_context: taskContext,
                        analysis_context: analysisContext
                    });
                } catch (error) {
                    console.error(`Failed to deploy agent for issue ${issue.id}:`, error);
                    return {
                        issue_id: issue.id,
                        error: error.message,
                        status: 'failed'
                    };
                }
            });
            
            const batchResults = await Promise.allSettled(batchPromises);
            deployments.push(...batchResults.map(r => r.value || r.reason));
            
            // Wait between batches to avoid overwhelming the system
            if (i + maxConcurrent < prioritizedIssues.length) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
        
        return {
            deployments: deployments,
            total_deployments: deployments.length,
            successful_deployments: deployments.filter(d => d.status !== 'failed').length,
            failed_deployments: deployments.filter(d => d.status === 'failed').length
        };
    }

    /**
     * Prioritize issues for fixing
     */
    prioritizeIssues(issues) {
        const allIssues = [
            ...(issues.critical || []),
            ...(issues.high || []),
            ...(issues.medium || []),
            ...(issues.low || [])
        ];
        
        // Filter auto-fixable issues and sort by priority
        return allIssues
            .filter(issue => issue.auto_fixable)
            .sort((a, b) => {
                const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
                return severityOrder[a.severity] - severityOrder[b.severity];
            });
    }

    /**
     * Get deployment results
     */
    async getDeploymentResults(deploymentId) {
        try {
            const deployment = this.activeDeployments.get(deploymentId) ||
                             this.deploymentHistory.find(d => d.id === deploymentId);
            
            if (!deployment) {
                throw new Error('Deployment not found');
            }
            
            // Get latest status if still active
            if (this.activeDeployments.has(deploymentId)) {
                return await this.getDeploymentStatus(deploymentId);
            }
            
            return deployment;
            
        } catch (error) {
            console.error('Failed to get deployment results:', error);
            throw new Error(`Results retrieval failed: ${error.message}`);
        }
    }

    /**
     * Cancel deployment
     */
    async cancelDeployment(deploymentId) {
        try {
            const deployment = this.activeDeployments.get(deploymentId);
            if (!deployment) {
                throw new Error('Deployment not found or already completed');
            }
            
            // Mock cancellation - in real implementation, this would call AgentAPI
            deployment.status = 'cancelled';
            deployment.cancelled_at = new Date().toISOString();
            
            this.activeDeployments.delete(deploymentId);
            
            console.log(`Cancelled deployment: ${deploymentId}`);
            return { success: true, deployment_id: deploymentId };
            
        } catch (error) {
            console.error('Failed to cancel deployment:', error);
            throw new Error(`Cancellation failed: ${error.message}`);
        }
    }

    /**
     * Get integration statistics
     */
    getStatistics() {
        const totalDeployments = this.deploymentHistory.length;
        const successfulDeployments = this.deploymentHistory.filter(d => d.status === 'completed').length;
        const failedDeployments = this.deploymentHistory.filter(d => d.status === 'failed').length;
        
        return {
            total_deployments: totalDeployments,
            successful_deployments: successfulDeployments,
            failed_deployments: failedDeployments,
            success_rate: totalDeployments > 0 ? (successfulDeployments / totalDeployments) * 100 : 0,
            active_deployments: this.activeDeployments.size,
            available_templates: this.fixTemplates.size,
            configuration: {
                auto_fix_enabled: this.config.auto_fix_enabled,
                task_aware_fixes: this.config.task_aware_fixes,
                timeout: this.config.timeout,
                max_retries: this.config.max_retries
            }
        };
    }

    /**
     * Get integration health
     */
    async getHealth() {
        try {
            // Test API connectivity
            const connectionTest = await this.testConnection();
            
            const stats = this.getStatistics();
            
            return {
                status: connectionTest.success ? 'healthy' : 'error',
                api_key_configured: !!this.config.api_key,
                base_url: this.config.base_url,
                connection: connectionTest,
                statistics: stats,
                features: {
                    auto_fix_enabled: this.config.auto_fix_enabled,
                    task_aware_fixes: this.config.task_aware_fixes,
                    batch_deployments: true,
                    deployment_monitoring: true
                }
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                api_key_configured: !!this.config.api_key,
                base_url: this.config.base_url
            };
        }
    }

    /**
     * Test AgentAPI connection
     */
    async testConnection() {
        try {
            // Mock connection test - in real implementation, this would ping AgentAPI
            if (!this.config.api_key) {
                throw new Error('API key not configured');
            }
            
            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 100));
            
            return {
                success: true,
                timestamp: new Date().toISOString(),
                base_url: this.config.base_url
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

export default AgentAPIIntegration;

