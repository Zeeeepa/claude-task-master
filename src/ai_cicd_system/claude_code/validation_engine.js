/**
 * Validation Engine
 * 
 * Multi-faceted code analysis system for Claude Code integration.
 * Handles syntax validation, code quality analysis, security scanning, and performance profiling.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const execAsync = promisify(exec);

export class ValidationEngine {
    constructor(options = {}) {
        this.config = {
            validationTimeout: options.validationTimeout || 10 * 60 * 1000, // 10 minutes
            maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB
            supportedLanguages: options.supportedLanguages || [
                'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php', 'ruby'
            ],
            qualityThresholds: {
                minScore: options.minScore || 7.0,
                maxComplexity: options.maxComplexity || 10,
                maxDuplication: options.maxDuplication || 5,
                minCoverage: options.minCoverage || 80
            },
            securityRules: options.securityRules || [
                'no-hardcoded-secrets',
                'no-sql-injection',
                'no-xss-vulnerabilities',
                'secure-dependencies',
                'proper-authentication'
            ],
            performanceThresholds: {
                maxBundleSize: options.maxBundleSize || 5 * 1024 * 1024, // 5MB
                maxLoadTime: options.maxLoadTime || 3000, // 3 seconds
                maxMemoryUsage: options.maxMemoryUsage || 512 * 1024 * 1024 // 512MB
            },
            ...options
        };

        this.validators = new Map();
        this.activeValidations = new Map();

        this.metrics = {
            validationsPerformed: 0,
            validationsPassed: 0,
            validationsFailed: 0,
            averageValidationTime: 0,
            averageQualityScore: 0,
            securityIssuesFound: 0,
            performanceIssuesFound: 0
        };

        this.isInitialized = false;
    }

    /**
     * Initialize the Validation Engine
     * @returns {Promise<boolean>} True if initialization successful
     */
    async initialize() {
        try {
            console.log('Initializing Validation Engine...');

            // Initialize language-specific validators
            await this.initializeValidators();

            // Setup validation tools
            await this.setupValidationTools();

            this.isInitialized = true;
            console.log('Validation Engine initialized successfully');

            return true;
        } catch (error) {
            console.error('Failed to initialize Validation Engine:', error.message);
            return false;
        }
    }

    /**
     * Validate code in deployment
     * @param {string} deploymentPath - Path to deployed code
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result
     */
    async validateCode(deploymentPath, options = {}) {
        if (!this.isInitialized) {
            throw new Error('Validation Engine not initialized');
        }

        const validationId = this.generateValidationId();
        const startTime = Date.now();

        try {
            console.log(`Starting code validation ${validationId} for: ${deploymentPath}`);

            // Register validation
            this.registerValidation(validationId, deploymentPath, options);

            // Analyze code structure
            const structureAnalysis = await this.analyzeCodeStructure(deploymentPath);

            // Perform syntax validation
            const syntaxValidation = await this.validateSyntax(deploymentPath, structureAnalysis);

            // Perform quality analysis
            const qualityAnalysis = await this.analyzeCodeQuality(deploymentPath, structureAnalysis);

            // Perform security scan
            const securityScan = await this.performSecurityScan(deploymentPath, structureAnalysis);

            // Perform performance analysis
            const performanceAnalysis = await this.analyzePerformance(deploymentPath, structureAnalysis);

            // Generate documentation validation
            const documentationValidation = await this.validateDocumentation(deploymentPath, structureAnalysis);

            // Compile validation results
            const validationResult = this.compileValidationResults({
                validationId,
                deploymentPath,
                structureAnalysis,
                syntaxValidation,
                qualityAnalysis,
                securityScan,
                performanceAnalysis,
                documentationValidation,
                validationTime: Date.now() - startTime
            });

            // Update metrics
            this.updateMetrics(validationResult, Date.now() - startTime);

            console.log(`Code validation ${validationId} completed in ${Date.now() - startTime}ms`);

            return validationResult;

        } catch (error) {
            this.updateMetrics({ success: false }, Date.now() - startTime);

            return {
                success: false,
                error: error.message,
                validationId,
                validationTime: Date.now() - startTime
            };
        } finally {
            // Unregister validation
            this.unregisterValidation(validationId);
        }
    }

    /**
     * Validate specific files
     * @param {Array} filePaths - Array of file paths to validate
     * @param {Object} options - Validation options
     * @returns {Promise<Object>} Validation result
     */
    async validateFiles(filePaths, options = {}) {
        const validationId = this.generateValidationId();
        const startTime = Date.now();

        try {
            console.log(`Validating ${filePaths.length} files (${validationId})`);

            const fileResults = [];

            for (const filePath of filePaths) {
                const fileResult = await this.validateSingleFile(filePath, options);
                fileResults.push(fileResult);
            }

            const overallResult = this.aggregateFileResults(fileResults);

            return {
                success: true,
                validationId,
                fileResults,
                overallResult,
                validationTime: Date.now() - startTime
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                validationId,
                validationTime: Date.now() - startTime
            };
        }
    }

    /**
     * Get validation status
     * @param {string} validationId - Validation ID
     * @returns {Object} Validation status
     */
    getValidationStatus(validationId) {
        if (!this.activeValidations.has(validationId)) {
            return { status: 'not_found' };
        }

        const validation = this.activeValidations.get(validationId);
        return {
            status: validation.status,
            validationId,
            deploymentPath: validation.deploymentPath,
            startedAt: validation.startedAt,
            progress: validation.progress
        };
    }

    /**
     * Get engine status and metrics
     * @returns {Object} Status and metrics
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            activeValidations: this.activeValidations.size,
            supportedLanguages: this.config.supportedLanguages,
            metrics: this.metrics,
            config: this.config
        };
    }

    /**
     * Analyze code structure
     * @private
     */
    async analyzeCodeStructure(deploymentPath) {
        try {
            const structure = {
                totalFiles: 0,
                totalLines: 0,
                languages: new Map(),
                directories: [],
                files: []
            };

            const files = await this.getAllFiles(deploymentPath);

            for (const file of files) {
                const stats = await fs.stat(file);
                const ext = path.extname(file);
                const language = this.detectLanguage(ext);

                if (stats.size > this.config.maxFileSize) {
                    console.warn(`File ${file} exceeds maximum size limit`);
                    continue;
                }

                const content = await fs.readFile(file, 'utf8');
                const lines = content.split('\n').length;

                structure.totalFiles++;
                structure.totalLines += lines;

                if (language) {
                    const langStats = structure.languages.get(language) || { files: 0, lines: 0 };
                    langStats.files++;
                    langStats.lines += lines;
                    structure.languages.set(language, langStats);
                }

                structure.files.push({
                    path: file,
                    language,
                    lines,
                    size: stats.size
                });
            }

            return structure;

        } catch (error) {
            throw new Error(`Code structure analysis failed: ${error.message}`);
        }
    }

    /**
     * Validate syntax
     * @private
     */
    async validateSyntax(deploymentPath, structureAnalysis) {
        const results = {
            success: true,
            errors: [],
            warnings: [],
            filesChecked: 0,
            errorCount: 0,
            warningCount: 0
        };

        try {
            for (const file of structureAnalysis.files) {
                if (!file.language || !this.validators.has(file.language)) {
                    continue;
                }

                const validator = this.validators.get(file.language);
                const fileResult = await validator.validateSyntax(file.path);

                results.filesChecked++;
                results.errors.push(...fileResult.errors);
                results.warnings.push(...fileResult.warnings);
            }

            results.errorCount = results.errors.length;
            results.warningCount = results.warnings.length;
            results.success = results.errorCount === 0;

            return results;

        } catch (error) {
            return {
                success: false,
                error: error.message,
                filesChecked: results.filesChecked
            };
        }
    }

    /**
     * Analyze code quality
     * @private
     */
    async analyzeCodeQuality(deploymentPath, structureAnalysis) {
        const results = {
            success: true,
            overallScore: 0,
            metrics: {
                complexity: 0,
                duplication: 0,
                maintainability: 0,
                testCoverage: 0
            },
            issues: [],
            recommendations: []
        };

        try {
            // Analyze complexity
            const complexityResult = await this.analyzeComplexity(deploymentPath, structureAnalysis);
            results.metrics.complexity = complexityResult.averageComplexity;
            results.issues.push(...complexityResult.issues);

            // Analyze duplication
            const duplicationResult = await this.analyzeDuplication(deploymentPath, structureAnalysis);
            results.metrics.duplication = duplicationResult.duplicationPercentage;
            results.issues.push(...duplicationResult.issues);

            // Analyze maintainability
            const maintainabilityResult = await this.analyzeMaintainability(deploymentPath, structureAnalysis);
            results.metrics.maintainability = maintainabilityResult.score;
            results.recommendations.push(...maintainabilityResult.recommendations);

            // Analyze test coverage
            const coverageResult = await this.analyzeTestCoverage(deploymentPath);
            results.metrics.testCoverage = coverageResult.percentage;

            // Calculate overall score
            results.overallScore = this.calculateQualityScore(results.metrics);
            results.success = results.overallScore >= this.config.qualityThresholds.minScore;

            return results;

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Perform security scan
     * @private
     */
    async performSecurityScan(deploymentPath, structureAnalysis) {
        const results = {
            success: true,
            vulnerabilities: [],
            riskLevel: 'low',
            securityScore: 10,
            recommendations: []
        };

        try {
            // Scan for hardcoded secrets
            const secretsResult = await this.scanForSecrets(deploymentPath, structureAnalysis);
            results.vulnerabilities.push(...secretsResult.vulnerabilities);

            // Scan for dependency vulnerabilities
            const depsResult = await this.scanDependencies(deploymentPath);
            results.vulnerabilities.push(...depsResult.vulnerabilities);

            // Scan for common security issues
            const commonIssuesResult = await this.scanCommonSecurityIssues(deploymentPath, structureAnalysis);
            results.vulnerabilities.push(...commonIssuesResult.vulnerabilities);

            // Calculate risk level and security score
            const riskAssessment = this.assessSecurityRisk(results.vulnerabilities);
            results.riskLevel = riskAssessment.level;
            results.securityScore = riskAssessment.score;
            results.recommendations = riskAssessment.recommendations;

            results.success = results.riskLevel !== 'critical';

            return results;

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Analyze performance
     * @private
     */
    async analyzePerformance(deploymentPath, structureAnalysis) {
        const results = {
            success: true,
            metrics: {
                bundleSize: 0,
                loadTime: 0,
                memoryUsage: 0
            },
            issues: [],
            optimizations: []
        };

        try {
            // Analyze bundle size
            const bundleResult = await this.analyzeBundleSize(deploymentPath);
            results.metrics.bundleSize = bundleResult.size;
            results.issues.push(...bundleResult.issues);

            // Analyze load time
            const loadTimeResult = await this.analyzeLoadTime(deploymentPath);
            results.metrics.loadTime = loadTimeResult.time;
            results.issues.push(...loadTimeResult.issues);

            // Analyze memory usage
            const memoryResult = await this.analyzeMemoryUsage(deploymentPath, structureAnalysis);
            results.metrics.memoryUsage = memoryResult.usage;
            results.issues.push(...memoryResult.issues);

            // Generate optimization recommendations
            results.optimizations = this.generateOptimizationRecommendations(results.metrics, results.issues);

            // Check against thresholds
            const thresholds = this.config.performanceThresholds;
            results.success = 
                results.metrics.bundleSize <= thresholds.maxBundleSize &&
                results.metrics.loadTime <= thresholds.maxLoadTime &&
                results.metrics.memoryUsage <= thresholds.maxMemoryUsage;

            return results;

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate documentation
     * @private
     */
    async validateDocumentation(deploymentPath, structureAnalysis) {
        const results = {
            success: true,
            coverage: 0,
            issues: [],
            recommendations: []
        };

        try {
            // Check for README files
            const readmeResult = await this.checkReadmeFiles(deploymentPath);
            results.issues.push(...readmeResult.issues);

            // Check code documentation
            const codeDocsResult = await this.checkCodeDocumentation(structureAnalysis);
            results.coverage = codeDocsResult.coverage;
            results.issues.push(...codeDocsResult.issues);

            // Check API documentation
            const apiDocsResult = await this.checkApiDocumentation(deploymentPath);
            results.issues.push(...apiDocsResult.issues);

            // Generate recommendations
            results.recommendations = this.generateDocumentationRecommendations(results);

            results.success = results.coverage >= 70; // 70% documentation coverage threshold

            return results;

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Initialize validators
     * @private
     */
    async initializeValidators() {
        // JavaScript/TypeScript validator
        this.validators.set('javascript', new JavaScriptValidator());
        this.validators.set('typescript', new TypeScriptValidator());

        // Python validator
        this.validators.set('python', new PythonValidator());

        // Add more language validators as needed
        console.log(`Initialized ${this.validators.size} language validators`);
    }

    /**
     * Setup validation tools
     * @private
     */
    async setupValidationTools() {
        try {
            // Install ESLint for JavaScript/TypeScript
            await this.installTool('eslint', 'npm install -g eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin');

            // Install Pylint for Python
            await this.installTool('pylint', 'pip3 install pylint');

            // Install security scanning tools
            await this.installTool('semgrep', 'pip3 install semgrep');

            console.log('Validation tools setup complete');

        } catch (error) {
            console.warn('Some validation tools failed to install:', error.message);
        }
    }

    /**
     * Install validation tool
     * @private
     */
    async installTool(toolName, installCommand) {
        try {
            await execAsync(`which ${toolName}`);
            console.log(`${toolName} already installed`);
        } catch {
            console.log(`Installing ${toolName}...`);
            await execAsync(installCommand);
        }
    }

    /**
     * Get all files in directory
     * @private
     */
    async getAllFiles(dirPath) {
        const files = [];
        const entries = await fs.readdir(dirPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);

            if (entry.isDirectory() && !this.shouldIgnoreDirectory(entry.name)) {
                const subFiles = await this.getAllFiles(fullPath);
                files.push(...subFiles);
            } else if (entry.isFile() && !this.shouldIgnoreFile(entry.name)) {
                files.push(fullPath);
            }
        }

        return files;
    }

    /**
     * Detect programming language from file extension
     * @private
     */
    detectLanguage(extension) {
        const languageMap = {
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.py': 'python',
            '.java': 'java',
            '.go': 'go',
            '.rs': 'rust',
            '.php': 'php',
            '.rb': 'ruby'
        };

        return languageMap[extension.toLowerCase()];
    }

    /**
     * Should ignore directory
     * @private
     */
    shouldIgnoreDirectory(dirName) {
        const ignoreDirs = ['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.pytest_cache'];
        return ignoreDirs.includes(dirName) || dirName.startsWith('.');
    }

    /**
     * Should ignore file
     * @private
     */
    shouldIgnoreFile(fileName) {
        const ignoreFiles = ['.gitignore', '.env', '.env.local', 'package-lock.json', 'yarn.lock'];
        return ignoreFiles.includes(fileName) || fileName.startsWith('.') || fileName.endsWith('.min.js');
    }

    /**
     * Generate validation ID
     * @private
     */
    generateValidationId() {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        return `validation-${timestamp}-${random}`;
    }

    /**
     * Register validation
     * @private
     */
    registerValidation(validationId, deploymentPath, options) {
        this.activeValidations.set(validationId, {
            validationId,
            deploymentPath,
            options,
            status: 'running',
            startedAt: new Date().toISOString(),
            progress: 0
        });

        this.metrics.validationsPerformed++;
    }

    /**
     * Unregister validation
     * @private
     */
    unregisterValidation(validationId) {
        this.activeValidations.delete(validationId);
    }

    /**
     * Compile validation results
     * @private
     */
    compileValidationResults(data) {
        const {
            validationId,
            deploymentPath,
            structureAnalysis,
            syntaxValidation,
            qualityAnalysis,
            securityScan,
            performanceAnalysis,
            documentationValidation,
            validationTime
        } = data;

        const overallSuccess = 
            syntaxValidation.success &&
            qualityAnalysis.success &&
            securityScan.success &&
            performanceAnalysis.success &&
            documentationValidation.success;

        const recommendation = this.generateRecommendation({
            syntaxValidation,
            qualityAnalysis,
            securityScan,
            performanceAnalysis,
            documentationValidation
        });

        return {
            success: overallSuccess,
            validationId,
            deploymentPath,
            validationTime,
            summary: {
                totalFiles: structureAnalysis.totalFiles,
                totalLines: structureAnalysis.totalLines,
                languages: Array.from(structureAnalysis.languages.keys()),
                overallScore: qualityAnalysis.overallScore,
                securityRiskLevel: securityScan.riskLevel,
                performanceScore: this.calculatePerformanceScore(performanceAnalysis.metrics)
            },
            results: {
                syntax: syntaxValidation,
                quality: qualityAnalysis,
                security: securityScan,
                performance: performanceAnalysis,
                documentation: documentationValidation
            },
            recommendation
        };
    }

    /**
     * Generate recommendation
     * @private
     */
    generateRecommendation(results) {
        const issues = [];
        const suggestions = [];

        if (!results.syntaxValidation.success) {
            issues.push('Syntax errors found');
            suggestions.push('Fix syntax errors before proceeding');
        }

        if (!results.qualityAnalysis.success) {
            issues.push('Code quality below threshold');
            suggestions.push('Improve code quality and reduce complexity');
        }

        if (!results.securityScan.success) {
            issues.push('Security vulnerabilities detected');
            suggestions.push('Address security issues immediately');
        }

        if (!results.performanceAnalysis.success) {
            issues.push('Performance issues detected');
            suggestions.push('Optimize performance bottlenecks');
        }

        if (!results.documentationValidation.success) {
            issues.push('Documentation coverage insufficient');
            suggestions.push('Improve code documentation');
        }

        const action = issues.length === 0 ? 'approve' : 'request_changes';

        return {
            action,
            issues,
            suggestions,
            priority: this.calculatePriority(issues)
        };
    }

    /**
     * Calculate priority
     * @private
     */
    calculatePriority(issues) {
        if (issues.some(issue => issue.includes('security'))) return 'critical';
        if (issues.some(issue => issue.includes('syntax'))) return 'high';
        if (issues.length > 2) return 'medium';
        return 'low';
    }

    /**
     * Update metrics
     * @private
     */
    updateMetrics(result, validationTime) {
        if (result.success) {
            this.metrics.validationsPassed++;
            if (result.results?.quality?.overallScore) {
                this.metrics.averageQualityScore = 
                    (this.metrics.averageQualityScore + result.results.quality.overallScore) / 2;
            }
        } else {
            this.metrics.validationsFailed++;
        }

        this.metrics.averageValidationTime = 
            (this.metrics.averageValidationTime + validationTime) / 2;

        if (result.results?.security?.vulnerabilities) {
            this.metrics.securityIssuesFound += result.results.security.vulnerabilities.length;
        }

        if (result.results?.performance?.issues) {
            this.metrics.performanceIssuesFound += result.results.performance.issues.length;
        }
    }

    /**
     * Shutdown the Validation Engine
     */
    async shutdown() {
        console.log('Shutting down Validation Engine...');
        this.activeValidations.clear();
        this.isInitialized = false;
        console.log('Validation Engine shutdown complete');
    }
}

// Language-specific validators
class JavaScriptValidator {
    async validateSyntax(filePath) {
        try {
            const { stdout, stderr } = await execAsync(`eslint ${filePath} --format json`);
            const results = JSON.parse(stdout);
            
            return {
                errors: results[0]?.messages?.filter(m => m.severity === 2) || [],
                warnings: results[0]?.messages?.filter(m => m.severity === 1) || []
            };
        } catch (error) {
            return { errors: [{ message: error.message }], warnings: [] };
        }
    }
}

class TypeScriptValidator {
    async validateSyntax(filePath) {
        try {
            const { stdout, stderr } = await execAsync(`tsc --noEmit ${filePath}`);
            return { errors: [], warnings: [] };
        } catch (error) {
            const errors = error.message.split('\n')
                .filter(line => line.includes('error'))
                .map(line => ({ message: line }));
            return { errors, warnings: [] };
        }
    }
}

class PythonValidator {
    async validateSyntax(filePath) {
        try {
            const { stdout, stderr } = await execAsync(`python3 -m py_compile ${filePath}`);
            return { errors: [], warnings: [] };
        } catch (error) {
            return { errors: [{ message: error.message }], warnings: [] };
        }
    }
}

export default ValidationEngine;

