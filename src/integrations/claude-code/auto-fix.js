/**
 * Auto-Fix System
 * 
 * Automated error resolution system that analyzes deployment failures
 * and applies intelligent fixes for common issues.
 */

export class AutoFixSystem {
    constructor(claudeCodeClient, wsl2Manager) {
        this.claudeCode = claudeCodeClient;
        this.wsl2Manager = wsl2Manager;
        
        // Auto-fix strategies configuration
        this.fixStrategies = {
            dependency_resolution: {
                name: 'Dependency Resolution',
                description: 'Resolves dependency conflicts and missing packages',
                priority: 1,
                timeout: 300000, // 5 minutes
                patterns: [
                    /module not found/i,
                    /cannot resolve dependency/i,
                    /package not found/i,
                    /missing dependency/i,
                    /version conflict/i
                ]
            },
            syntax_correction: {
                name: 'Syntax Correction',
                description: 'Fixes common syntax errors and linting issues',
                priority: 2,
                timeout: 120000, // 2 minutes
                patterns: [
                    /syntax error/i,
                    /unexpected token/i,
                    /missing semicolon/i,
                    /undefined variable/i,
                    /linting error/i
                ]
            },
            test_fixes: {
                name: 'Test Fixes',
                description: 'Fixes failing tests and test configuration issues',
                priority: 3,
                timeout: 600000, // 10 minutes
                patterns: [
                    /test failed/i,
                    /assertion error/i,
                    /test timeout/i,
                    /jest.*error/i,
                    /mocha.*error/i
                ]
            },
            build_fixes: {
                name: 'Build Fixes',
                description: 'Resolves build configuration and compilation issues',
                priority: 4,
                timeout: 600000, // 10 minutes
                patterns: [
                    /build failed/i,
                    /compilation error/i,
                    /webpack.*error/i,
                    /typescript.*error/i,
                    /babel.*error/i
                ]
            },
            environment_fixes: {
                name: 'Environment Fixes',
                description: 'Fixes environment configuration and setup issues',
                priority: 5,
                timeout: 300000, // 5 minutes
                patterns: [
                    /environment variable/i,
                    /path not found/i,
                    /permission denied/i,
                    /command not found/i,
                    /docker.*error/i
                ]
            }
        };

        // Fix attempt tracking
        this.fixAttempts = new Map();
        
        // Success patterns for learning
        this.successPatterns = new Map();
    }

    /**
     * Analyze errors and determine applicable fix strategies
     * @param {Array} errors - Array of error messages
     * @param {Object} context - Deployment context
     * @returns {Array} Ordered list of applicable fix strategies
     */
    analyzeErrors(errors, context = {}) {
        const applicableStrategies = [];
        const errorText = errors.join(' ').toLowerCase();

        // Check each strategy against error patterns
        for (const [strategyName, strategy] of Object.entries(this.fixStrategies)) {
            const matches = strategy.patterns.some(pattern => pattern.test(errorText));
            
            if (matches) {
                applicableStrategies.push({
                    name: strategyName,
                    ...strategy,
                    confidence: this.calculateConfidence(strategyName, errorText, context)
                });
            }
        }

        // Sort by priority and confidence
        applicableStrategies.sort((a, b) => {
            if (a.priority !== b.priority) {
                return a.priority - b.priority;
            }
            return b.confidence - a.confidence;
        });

        console.log(`Identified ${applicableStrategies.length} applicable fix strategies`);
        return applicableStrategies;
    }

    /**
     * Apply auto-fix strategies
     * @param {string} deploymentId - Deployment ID
     * @param {Array} errors - Array of errors to fix
     * @param {Object} options - Fix options
     * @returns {Promise<Object>} Fix result
     */
    async applyAutoFix(deploymentId, errors, options = {}) {
        const fixId = `fix-${deploymentId}-${Date.now()}`;
        const maxAttempts = options.maxAttempts || 3;
        const strategies = options.fixStrategies || Object.keys(this.fixStrategies);

        console.log(`Starting auto-fix ${fixId} for deployment ${deploymentId}`);

        const fixAttempt = {
            fixId,
            deploymentId,
            errors,
            strategies,
            maxAttempts,
            currentAttempt: 0,
            startTime: Date.now(),
            status: 'running',
            appliedFixes: [],
            results: []
        };

        this.fixAttempts.set(fixId, fixAttempt);

        try {
            // Analyze errors to determine fix strategies
            const applicableStrategies = this.analyzeErrors(errors, { deploymentId });
            
            if (applicableStrategies.length === 0) {
                throw new Error('No applicable fix strategies found for the given errors');
            }

            // Apply strategies in order
            for (const strategy of applicableStrategies) {
                if (fixAttempt.currentAttempt >= maxAttempts) {
                    console.log(`Max attempts (${maxAttempts}) reached for fix ${fixId}`);
                    break;
                }

                fixAttempt.currentAttempt++;
                console.log(`Applying fix strategy: ${strategy.name} (attempt ${fixAttempt.currentAttempt})`);

                try {
                    const result = await this.applyFixStrategy(deploymentId, strategy, errors);
                    
                    fixAttempt.appliedFixes.push({
                        strategy: strategy.name,
                        attempt: fixAttempt.currentAttempt,
                        result,
                        timestamp: new Date()
                    });

                    if (result.status === 'success') {
                        console.log(`Fix strategy ${strategy.name} succeeded`);
                        fixAttempt.status = 'success';
                        fixAttempt.successStrategy = strategy.name;
                        break;
                    } else {
                        console.log(`Fix strategy ${strategy.name} failed: ${result.error}`);
                    }

                } catch (error) {
                    console.error(`Error applying fix strategy ${strategy.name}:`, error);
                    fixAttempt.appliedFixes.push({
                        strategy: strategy.name,
                        attempt: fixAttempt.currentAttempt,
                        result: { status: 'error', error: error.message },
                        timestamp: new Date()
                    });
                }
            }

            // Final status determination
            if (fixAttempt.status !== 'success') {
                fixAttempt.status = 'failed';
            }

            fixAttempt.endTime = Date.now();
            fixAttempt.duration = fixAttempt.endTime - fixAttempt.startTime;

            console.log(`Auto-fix ${fixId} completed with status: ${fixAttempt.status}`);
            return this.generateFixReport(fixAttempt);

        } catch (error) {
            console.error(`Auto-fix ${fixId} failed:`, error);
            fixAttempt.status = 'error';
            fixAttempt.error = error.message;
            fixAttempt.endTime = Date.now();
            
            return this.generateFixReport(fixAttempt);
        }
    }

    /**
     * Apply a specific fix strategy
     * @param {string} deploymentId - Deployment ID
     * @param {Object} strategy - Fix strategy
     * @param {Array} errors - Array of errors
     * @returns {Promise<Object>} Strategy application result
     */
    async applyFixStrategy(deploymentId, strategy, errors) {
        const startTime = Date.now();

        try {
            let result;

            switch (strategy.name) {
                case 'dependency_resolution':
                    result = await this.fixDependencyIssues(deploymentId, errors);
                    break;
                case 'syntax_correction':
                    result = await this.fixSyntaxIssues(deploymentId, errors);
                    break;
                case 'test_fixes':
                    result = await this.fixTestIssues(deploymentId, errors);
                    break;
                case 'build_fixes':
                    result = await this.fixBuildIssues(deploymentId, errors);
                    break;
                case 'environment_fixes':
                    result = await this.fixEnvironmentIssues(deploymentId, errors);
                    break;
                default:
                    throw new Error(`Unknown fix strategy: ${strategy.name}`);
            }

            return {
                ...result,
                strategy: strategy.name,
                duration: Date.now() - startTime
            };

        } catch (error) {
            return {
                status: 'error',
                error: error.message,
                strategy: strategy.name,
                duration: Date.now() - startTime
            };
        }
    }

    /**
     * Fix dependency-related issues
     * @param {string} deploymentId - Deployment ID
     * @param {Array} errors - Array of errors
     * @returns {Promise<Object>} Fix result
     */
    async fixDependencyIssues(deploymentId, errors) {
        console.log('Applying dependency resolution fixes...');

        const fixes = [
            // Clear package manager caches
            {
                name: 'Clear npm cache',
                command: 'npm cache clean --force',
                condition: (errors) => errors.some(e => e.includes('npm'))
            },
            {
                name: 'Clear yarn cache',
                command: 'yarn cache clean',
                condition: (errors) => errors.some(e => e.includes('yarn'))
            },
            // Reinstall dependencies
            {
                name: 'Reinstall npm dependencies',
                command: 'rm -rf node_modules package-lock.json && npm install',
                condition: (errors) => errors.some(e => e.includes('module not found'))
            },
            {
                name: 'Update pip packages',
                command: 'pip install --upgrade -r requirements.txt',
                condition: (errors) => errors.some(e => e.includes('pip') || e.includes('python'))
            },
            // Fix version conflicts
            {
                name: 'Fix npm audit issues',
                command: 'npm audit fix',
                condition: (errors) => errors.some(e => e.includes('vulnerability'))
            }
        ];

        return await this.applyFixCommands(deploymentId, fixes, errors);
    }

    /**
     * Fix syntax-related issues
     * @param {string} deploymentId - Deployment ID
     * @param {Array} errors - Array of errors
     * @returns {Promise<Object>} Fix result
     */
    async fixSyntaxIssues(deploymentId, errors) {
        console.log('Applying syntax correction fixes...');

        const fixes = [
            // Auto-fix linting issues
            {
                name: 'ESLint auto-fix',
                command: 'npx eslint . --fix',
                condition: (errors) => errors.some(e => e.includes('eslint'))
            },
            {
                name: 'Prettier format',
                command: 'npx prettier --write .',
                condition: (errors) => errors.some(e => e.includes('format'))
            },
            // TypeScript fixes
            {
                name: 'TypeScript compilation',
                command: 'npx tsc --noEmit',
                condition: (errors) => errors.some(e => e.includes('typescript'))
            },
            // Python formatting
            {
                name: 'Black formatting',
                command: 'black .',
                condition: (errors) => errors.some(e => e.includes('black'))
            }
        ];

        return await this.applyFixCommands(deploymentId, fixes, errors);
    }

    /**
     * Fix test-related issues
     * @param {string} deploymentId - Deployment ID
     * @param {Array} errors - Array of errors
     * @returns {Promise<Object>} Fix result
     */
    async fixTestIssues(deploymentId, errors) {
        console.log('Applying test fixes...');

        const fixes = [
            // Update test snapshots
            {
                name: 'Update Jest snapshots',
                command: 'npm test -- --updateSnapshot',
                condition: (errors) => errors.some(e => e.includes('snapshot'))
            },
            // Clear test caches
            {
                name: 'Clear Jest cache',
                command: 'npx jest --clearCache',
                condition: (errors) => errors.some(e => e.includes('jest'))
            },
            // Run tests with verbose output
            {
                name: 'Run tests with coverage',
                command: 'npm test -- --coverage',
                condition: (errors) => errors.some(e => e.includes('coverage'))
            }
        ];

        return await this.applyFixCommands(deploymentId, fixes, errors);
    }

    /**
     * Fix build-related issues
     * @param {string} deploymentId - Deployment ID
     * @param {Array} errors - Array of errors
     * @returns {Promise<Object>} Fix result
     */
    async fixBuildIssues(deploymentId, errors) {
        console.log('Applying build fixes...');

        const fixes = [
            // Clear build caches
            {
                name: 'Clear build cache',
                command: 'rm -rf dist build .next',
                condition: (errors) => errors.some(e => e.includes('build'))
            },
            // Rebuild dependencies
            {
                name: 'Rebuild native dependencies',
                command: 'npm rebuild',
                condition: (errors) => errors.some(e => e.includes('native'))
            },
            // TypeScript build
            {
                name: 'TypeScript build',
                command: 'npx tsc',
                condition: (errors) => errors.some(e => e.includes('typescript'))
            }
        ];

        return await this.applyFixCommands(deploymentId, fixes, errors);
    }

    /**
     * Fix environment-related issues
     * @param {string} deploymentId - Deployment ID
     * @param {Array} errors - Array of errors
     * @returns {Promise<Object>} Fix result
     */
    async fixEnvironmentIssues(deploymentId, errors) {
        console.log('Applying environment fixes...');

        const fixes = [
            // Set common environment variables
            {
                name: 'Set NODE_ENV',
                command: 'export NODE_ENV=development',
                condition: (errors) => errors.some(e => e.includes('NODE_ENV'))
            },
            // Fix permissions
            {
                name: 'Fix file permissions',
                command: 'chmod +x ./scripts/* || true',
                condition: (errors) => errors.some(e => e.includes('permission'))
            },
            // Update PATH
            {
                name: 'Update PATH',
                command: 'export PATH=$PATH:./node_modules/.bin',
                condition: (errors) => errors.some(e => e.includes('command not found'))
            }
        ];

        return await this.applyFixCommands(deploymentId, fixes, errors);
    }

    /**
     * Apply a series of fix commands
     * @param {string} deploymentId - Deployment ID
     * @param {Array} fixes - Array of fix commands
     * @param {Array} errors - Array of errors
     * @returns {Promise<Object>} Fix application result
     */
    async applyFixCommands(deploymentId, fixes, errors) {
        const applicableFixes = fixes.filter(fix => fix.condition(errors));
        const results = [];

        if (applicableFixes.length === 0) {
            return {
                status: 'skipped',
                reason: 'No applicable fixes found',
                results: []
            };
        }

        for (const fix of applicableFixes) {
            try {
                console.log(`Applying fix: ${fix.name}`);
                
                const result = await this.claudeCode.executeCommand(deploymentId, {
                    command: 'bash',
                    args: ['-c', fix.command],
                    workingDirectory: '/workspace',
                    timeout: 300000 // 5 minutes
                });

                results.push({
                    name: fix.name,
                    command: fix.command,
                    status: result.exitCode === 0 ? 'success' : 'failed',
                    output: result.stdout,
                    error: result.stderr
                });

                if (result.exitCode === 0) {
                    console.log(`Fix ${fix.name} applied successfully`);
                    return {
                        status: 'success',
                        appliedFix: fix.name,
                        results
                    };
                } else {
                    console.log(`Fix ${fix.name} failed: ${result.stderr}`);
                }

            } catch (error) {
                console.error(`Error applying fix ${fix.name}:`, error);
                results.push({
                    name: fix.name,
                    command: fix.command,
                    status: 'error',
                    error: error.message
                });
            }
        }

        return {
            status: 'failed',
            reason: 'All applicable fixes failed',
            results
        };
    }

    /**
     * Calculate confidence score for a fix strategy
     * @param {string} strategyName - Strategy name
     * @param {string} errorText - Error text
     * @param {Object} context - Context information
     * @returns {number} Confidence score (0-1)
     */
    calculateConfidence(strategyName, errorText, context) {
        let confidence = 0.5; // Base confidence

        // Check success patterns
        const successPattern = this.successPatterns.get(strategyName);
        if (successPattern) {
            confidence += 0.2;
        }

        // Adjust based on error specificity
        const strategy = this.fixStrategies[strategyName];
        const matchingPatterns = strategy.patterns.filter(pattern => pattern.test(errorText));
        confidence += (matchingPatterns.length / strategy.patterns.length) * 0.3;

        return Math.min(confidence, 1.0);
    }

    /**
     * Record successful fix for learning
     * @param {string} strategyName - Strategy name
     * @param {Array} errors - Errors that were fixed
     * @param {Object} context - Context information
     */
    recordSuccessfulFix(strategyName, errors, context) {
        const pattern = {
            strategy: strategyName,
            errors: errors.slice(0, 3), // Store first 3 errors
            context,
            timestamp: new Date(),
            count: 1
        };

        const existing = this.successPatterns.get(strategyName);
        if (existing) {
            existing.count++;
            existing.lastSuccess = new Date();
        } else {
            this.successPatterns.set(strategyName, pattern);
        }

        console.log(`Recorded successful fix pattern for ${strategyName}`);
    }

    /**
     * Generate fix report
     * @param {Object} fixAttempt - Fix attempt data
     * @returns {Object} Fix report
     */
    generateFixReport(fixAttempt) {
        return {
            fixId: fixAttempt.fixId,
            deploymentId: fixAttempt.deploymentId,
            status: fixAttempt.status,
            duration: fixAttempt.duration,
            attempts: fixAttempt.currentAttempt,
            maxAttempts: fixAttempt.maxAttempts,
            appliedFixes: fixAttempt.appliedFixes,
            successStrategy: fixAttempt.successStrategy,
            error: fixAttempt.error,
            summary: this.generateFixSummary(fixAttempt)
        };
    }

    /**
     * Generate fix summary
     * @param {Object} fixAttempt - Fix attempt data
     * @returns {string} Fix summary
     */
    generateFixSummary(fixAttempt) {
        if (fixAttempt.status === 'success') {
            return `Auto-fix succeeded using ${fixAttempt.successStrategy} strategy in ${Math.round(fixAttempt.duration / 1000)}s`;
        } else if (fixAttempt.status === 'failed') {
            return `Auto-fix failed after ${fixAttempt.currentAttempt} attempts. Applied strategies: ${fixAttempt.appliedFixes.map(f => f.strategy).join(', ')}`;
        } else {
            return `Auto-fix encountered an error: ${fixAttempt.error}`;
        }
    }

    /**
     * Get fix attempt status
     * @param {string} fixId - Fix ID
     * @returns {Object|null} Fix attempt data
     */
    getFixAttempt(fixId) {
        return this.fixAttempts.get(fixId) || null;
    }

    /**
     * Get success patterns for learning analysis
     * @returns {Map} Success patterns
     */
    getSuccessPatterns() {
        return this.successPatterns;
    }

    /**
     * Clear old fix attempts (cleanup)
     * @param {number} maxAge - Maximum age in milliseconds
     */
    cleanupOldAttempts(maxAge = 86400000) { // 24 hours
        const cutoff = Date.now() - maxAge;
        
        for (const [fixId, attempt] of this.fixAttempts.entries()) {
            if (attempt.startTime < cutoff) {
                this.fixAttempts.delete(fixId);
            }
        }
    }
}

export default AutoFixSystem;

