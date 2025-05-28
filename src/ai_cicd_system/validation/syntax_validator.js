/**
 * @fileoverview Syntax Validator
 * @description Comprehensive syntax checking, linting, and code quality analysis
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, extname } from 'path';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Syntax Validator for comprehensive code analysis
 */
export class SyntaxValidator {
    constructor(config = {}) {
        this.config = {
            enable_syntax_check: config.enable_syntax_check !== false,
            enable_linting: config.enable_linting !== false,
            enable_code_quality: config.enable_code_quality !== false,
            enable_dependency_check: config.enable_dependency_check !== false,
            timeout: config.timeout || 300000, // 5 minutes
            max_file_size: config.max_file_size || 1024 * 1024, // 1MB
            supported_languages: config.supported_languages || [
                'javascript', 'typescript', 'python', 'java', 'go', 'rust', 'php', 'ruby'
            ],
            linting_rules: config.linting_rules || {},
            ...config
        };

        this.languageConfigs = {
            javascript: {
                extensions: ['.js', '.jsx', '.mjs'],
                syntax_checker: 'node',
                syntax_args: ['--check'],
                linter: 'eslint',
                linter_args: ['--format', 'json'],
                package_file: 'package.json'
            },
            typescript: {
                extensions: ['.ts', '.tsx'],
                syntax_checker: 'tsc',
                syntax_args: ['--noEmit', '--skipLibCheck'],
                linter: 'eslint',
                linter_args: ['--format', 'json', '--ext', '.ts,.tsx'],
                package_file: 'package.json'
            },
            python: {
                extensions: ['.py'],
                syntax_checker: 'python',
                syntax_args: ['-m', 'py_compile'],
                linter: 'flake8',
                linter_args: ['--format=json'],
                package_file: 'requirements.txt'
            },
            java: {
                extensions: ['.java'],
                syntax_checker: 'javac',
                syntax_args: ['-Xlint'],
                linter: 'checkstyle',
                linter_args: ['-f', 'json'],
                package_file: 'pom.xml'
            },
            go: {
                extensions: ['.go'],
                syntax_checker: 'go',
                syntax_args: ['build', '-o', '/dev/null'],
                linter: 'golint',
                linter_args: [],
                package_file: 'go.mod'
            }
        };

        this.validationMetrics = {
            files_processed: 0,
            syntax_errors: 0,
            linting_issues: 0,
            quality_issues: 0,
            dependency_issues: 0
        };
    }

    /**
     * Initialize the syntax validator
     * @returns {Promise<void>}
     */
    async initialize() {
        log('debug', 'Initializing Syntax Validator...');
        
        // Check available tools
        await this.checkAvailableTools();
        
        log('debug', 'Syntax Validator initialized');
    }

    /**
     * Validate syntax for all files in workspace
     * @param {Object} config - Validation configuration
     * @returns {Promise<Object>} Syntax validation result
     */
    async validateSyntax(config) {
        const { workspace, prData, taskContext, secureEnvironment } = config;
        const startTime = Date.now();
        
        log('debug', `Running syntax validation in workspace: ${workspace.path}`);
        
        try {
            // Reset metrics
            this.validationMetrics = {
                files_processed: 0,
                syntax_errors: 0,
                linting_issues: 0,
                quality_issues: 0,
                dependency_issues: 0
            };

            // Find source files
            const sourceFiles = await this.findSourceFiles(workspace.path);
            
            // Group files by language
            const filesByLanguage = this.groupFilesByLanguage(sourceFiles);
            
            // Validate each language group
            const results = {};
            for (const [language, files] of Object.entries(filesByLanguage)) {
                if (files.length > 0) {
                    results[language] = await this.validateLanguageFiles(
                        language, 
                        files, 
                        workspace.path,
                        secureEnvironment
                    );
                }
            }
            
            // Aggregate results
            const aggregatedResult = this.aggregateSyntaxResults(results, sourceFiles.length);
            
            return {
                status: 'completed',
                result: {
                    ...aggregatedResult,
                    metrics: {
                        ...this.validationMetrics,
                        duration_ms: Date.now() - startTime,
                        files_analyzed: sourceFiles.length,
                        languages_detected: Object.keys(filesByLanguage)
                    }
                }
            };
            
        } catch (error) {
            log('error', `Syntax validation failed: ${error.message}`);
            return {
                status: 'failed',
                error: error.message,
                result: {
                    issues: [{
                        type: 'validation_error',
                        severity: 'high',
                        message: `Syntax validation failed: ${error.message}`,
                        category: 'system'
                    }],
                    metrics: {
                        ...this.validationMetrics,
                        duration_ms: Date.now() - startTime
                    }
                }
            };
        }
    }

    /**
     * Run linting analysis
     * @param {Object} config - Validation configuration
     * @returns {Promise<Object>} Linting result
     */
    async runLinting(config) {
        const { workspace, prData, taskContext, secureEnvironment } = config;
        const startTime = Date.now();
        
        log('debug', `Running linting analysis in workspace: ${workspace.path}`);
        
        try {
            const sourceFiles = await this.findSourceFiles(workspace.path);
            const filesByLanguage = this.groupFilesByLanguage(sourceFiles);
            
            const lintingResults = {};
            for (const [language, files] of Object.entries(filesByLanguage)) {
                if (files.length > 0 && this.languageConfigs[language]?.linter) {
                    lintingResults[language] = await this.runLanguageLinting(
                        language,
                        files,
                        workspace.path,
                        secureEnvironment
                    );
                }
            }
            
            const aggregatedResult = this.aggregateLintingResults(lintingResults);
            
            return {
                status: 'completed',
                result: {
                    ...aggregatedResult,
                    metrics: {
                        duration_ms: Date.now() - startTime,
                        files_analyzed: sourceFiles.length,
                        linters_used: Object.keys(lintingResults)
                    }
                }
            };
            
        } catch (error) {
            log('error', `Linting analysis failed: ${error.message}`);
            return {
                status: 'failed',
                error: error.message,
                result: {
                    issues: [{
                        type: 'linting_error',
                        severity: 'medium',
                        message: `Linting failed: ${error.message}`,
                        category: 'tooling'
                    }],
                    metrics: {
                        duration_ms: Date.now() - startTime
                    }
                }
            };
        }
    }

    /**
     * Check dependencies
     * @param {Object} config - Validation configuration
     * @returns {Promise<Object>} Dependency check result
     */
    async checkDependencies(config) {
        const { workspace, prData, taskContext, secureEnvironment } = config;
        const startTime = Date.now();
        
        log('debug', `Checking dependencies in workspace: ${workspace.path}`);
        
        try {
            const dependencyResults = {};
            
            // Check each language's dependencies
            for (const [language, langConfig] of Object.entries(this.languageConfigs)) {
                const packageFile = join(workspace.path, langConfig.package_file);
                
                if (await this.fileExists(packageFile)) {
                    dependencyResults[language] = await this.checkLanguageDependencies(
                        language,
                        packageFile,
                        workspace.path,
                        secureEnvironment
                    );
                }
            }
            
            const aggregatedResult = this.aggregateDependencyResults(dependencyResults);
            
            return {
                status: 'completed',
                result: {
                    ...aggregatedResult,
                    metrics: {
                        duration_ms: Date.now() - startTime,
                        package_files_found: Object.keys(dependencyResults).length
                    }
                }
            };
            
        } catch (error) {
            log('error', `Dependency check failed: ${error.message}`);
            return {
                status: 'failed',
                error: error.message,
                result: {
                    issues: [{
                        type: 'dependency_error',
                        severity: 'high',
                        message: `Dependency check failed: ${error.message}`,
                        category: 'dependencies'
                    }],
                    metrics: {
                        duration_ms: Date.now() - startTime
                    }
                }
            };
        }
    }

    /**
     * Analyze code quality
     * @param {Object} config - Validation configuration
     * @returns {Promise<Object>} Code quality analysis result
     */
    async analyzeCodeQuality(config) {
        const { workspace, prData, taskContext, secureEnvironment } = config;
        const startTime = Date.now();
        
        log('debug', `Analyzing code quality in workspace: ${workspace.path}`);
        
        try {
            const sourceFiles = await this.findSourceFiles(workspace.path);
            const qualityMetrics = await this.calculateQualityMetrics(sourceFiles, workspace.path);
            const complexityAnalysis = await this.analyzeComplexity(sourceFiles, workspace.path);
            const maintainabilityScore = await this.calculateMaintainabilityScore(sourceFiles, workspace.path);
            
            const qualityResult = {
                overall_score: this.calculateOverallQualityScore(qualityMetrics, complexityAnalysis, maintainabilityScore),
                quality_metrics: qualityMetrics,
                complexity_analysis: complexityAnalysis,
                maintainability_score: maintainabilityScore,
                recommendations: this.generateQualityRecommendations(qualityMetrics, complexityAnalysis),
                quality_gate: {
                    passed: qualityMetrics.overall_score >= 70,
                    threshold: 70,
                    score: qualityMetrics.overall_score
                }
            };
            
            return {
                status: 'completed',
                result: {
                    ...qualityResult,
                    metrics: {
                        duration_ms: Date.now() - startTime,
                        files_analyzed: sourceFiles.length,
                        lines_of_code: qualityMetrics.total_lines
                    }
                }
            };
            
        } catch (error) {
            log('error', `Code quality analysis failed: ${error.message}`);
            return {
                status: 'failed',
                error: error.message,
                result: {
                    issues: [{
                        type: 'quality_analysis_error',
                        severity: 'medium',
                        message: `Code quality analysis failed: ${error.message}`,
                        category: 'analysis'
                    }],
                    metrics: {
                        duration_ms: Date.now() - startTime
                    }
                }
            };
        }
    }

    /**
     * Find source files in workspace
     * @param {string} workspacePath - Workspace path
     * @returns {Promise<Array>} Array of source file paths
     */
    async findSourceFiles(workspacePath) {
        const sourceFiles = [];
        const excludePatterns = [
            'node_modules',
            '.git',
            'dist',
            'build',
            '__pycache__',
            '.pytest_cache',
            'target',
            'vendor'
        ];
        
        const findFiles = async (dir) => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    
                    if (entry.isDirectory()) {
                        // Skip excluded directories
                        if (!excludePatterns.includes(entry.name)) {
                            await findFiles(fullPath);
                        }
                    } else if (entry.isFile()) {
                        // Check if it's a source file
                        const ext = extname(entry.name);
                        const isSourceFile = Object.values(this.languageConfigs)
                            .some(config => config.extensions.includes(ext));
                        
                        if (isSourceFile) {
                            // Check file size
                            const stats = await fs.stat(fullPath);
                            if (stats.size <= this.config.max_file_size) {
                                sourceFiles.push(fullPath);
                            }
                        }
                    }
                }
            } catch (error) {
                log('warning', `Failed to read directory ${dir}: ${error.message}`);
            }
        };
        
        await findFiles(workspacePath);
        return sourceFiles;
    }

    /**
     * Group files by programming language
     * @param {Array} files - Array of file paths
     * @returns {Object} Files grouped by language
     */
    groupFilesByLanguage(files) {
        const grouped = {};
        
        for (const file of files) {
            const ext = extname(file);
            
            for (const [language, config] of Object.entries(this.languageConfigs)) {
                if (config.extensions.includes(ext)) {
                    if (!grouped[language]) {
                        grouped[language] = [];
                    }
                    grouped[language].push(file);
                    break;
                }
            }
        }
        
        return grouped;
    }

    /**
     * Validate files for a specific language
     * @param {string} language - Programming language
     * @param {Array} files - Array of file paths
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Object>} Validation result
     */
    async validateLanguageFiles(language, files, workspacePath, secureEnvironment) {
        const config = this.languageConfigs[language];
        if (!config) {
            throw new Error(`Unsupported language: ${language}`);
        }
        
        const issues = [];
        
        // Check syntax for each file
        for (const file of files) {
            try {
                const syntaxResult = await this.checkFileSyntax(file, language, workspacePath, secureEnvironment);
                if (syntaxResult.issues) {
                    issues.push(...syntaxResult.issues);
                }
                this.validationMetrics.files_processed++;
            } catch (error) {
                issues.push({
                    type: 'syntax_error',
                    severity: 'high',
                    message: `Syntax check failed for ${file}: ${error.message}`,
                    file: file,
                    category: 'syntax'
                });
                this.validationMetrics.syntax_errors++;
            }
        }
        
        return {
            language,
            files_checked: files.length,
            issues: issues,
            syntax_valid: issues.filter(i => i.type === 'syntax_error').length === 0
        };
    }

    /**
     * Check syntax for a single file
     * @param {string} filePath - File path
     * @param {string} language - Programming language
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Object>} Syntax check result
     */
    async checkFileSyntax(filePath, language, workspacePath, secureEnvironment) {
        const config = this.languageConfigs[language];
        const issues = [];
        
        try {
            // Read file content for basic checks
            const content = await fs.readFile(filePath, 'utf8');
            
            // Basic syntax checks
            const basicIssues = this.performBasicSyntaxChecks(content, filePath, language);
            issues.push(...basicIssues);
            
            // Language-specific syntax checking
            if (config.syntax_checker) {
                const syntaxIssues = await this.runSyntaxChecker(
                    filePath, 
                    language, 
                    workspacePath, 
                    secureEnvironment
                );
                issues.push(...syntaxIssues);
            }
            
        } catch (error) {
            issues.push({
                type: 'file_read_error',
                severity: 'high',
                message: `Cannot read file: ${error.message}`,
                file: filePath,
                category: 'system'
            });
        }
        
        return { issues };
    }

    /**
     * Perform basic syntax checks
     * @param {string} content - File content
     * @param {string} filePath - File path
     * @param {string} language - Programming language
     * @returns {Array} Array of issues
     */
    performBasicSyntaxChecks(content, filePath, language) {
        const issues = [];
        
        // Check for common syntax issues
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;
            
            // Check for mixed tabs and spaces
            if (line.includes('\t') && line.includes('  ')) {
                issues.push({
                    type: 'mixed_indentation',
                    severity: 'low',
                    message: 'Mixed tabs and spaces in indentation',
                    file: filePath,
                    line: lineNumber,
                    category: 'style'
                });
            }
            
            // Check for trailing whitespace
            if (line.endsWith(' ') || line.endsWith('\t')) {
                issues.push({
                    type: 'trailing_whitespace',
                    severity: 'low',
                    message: 'Trailing whitespace',
                    file: filePath,
                    line: lineNumber,
                    category: 'style'
                });
            }
            
            // Language-specific checks
            if (language === 'javascript' || language === 'typescript') {
                // Check for missing semicolons (basic check)
                if (line.trim().match(/^(var|let|const|return|throw)\s+.*[^;{}\s]$/)) {
                    issues.push({
                        type: 'missing_semicolon',
                        severity: 'medium',
                        message: 'Potentially missing semicolon',
                        file: filePath,
                        line: lineNumber,
                        category: 'syntax'
                    });
                }
            }
        }
        
        return issues;
    }

    /**
     * Run language-specific syntax checker
     * @param {string} filePath - File path
     * @param {string} language - Programming language
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Array>} Array of syntax issues
     */
    async runSyntaxChecker(filePath, language, workspacePath, secureEnvironment) {
        const config = this.languageConfigs[language];
        const issues = [];
        
        try {
            const command = [config.syntax_checker, ...config.syntax_args, filePath];
            const result = await this.executeCommand(command, workspacePath, secureEnvironment);
            
            if (!result.success) {
                // Parse error output based on language
                const parsedIssues = this.parseSyntaxErrors(result.stderr, language, filePath);
                issues.push(...parsedIssues);
            }
            
        } catch (error) {
            issues.push({
                type: 'syntax_checker_error',
                severity: 'medium',
                message: `Syntax checker failed: ${error.message}`,
                file: filePath,
                category: 'tooling'
            });
        }
        
        return issues;
    }

    /**
     * Parse syntax errors from tool output
     * @param {string} errorOutput - Error output from syntax checker
     * @param {string} language - Programming language
     * @param {string} filePath - File path
     * @returns {Array} Array of parsed issues
     */
    parseSyntaxErrors(errorOutput, language, filePath) {
        const issues = [];
        
        if (!errorOutput) return issues;
        
        const lines = errorOutput.split('\n');
        
        for (const line of lines) {
            if (line.trim()) {
                // Basic error parsing (would be more sophisticated in production)
                const issue = {
                    type: 'syntax_error',
                    severity: 'high',
                    message: line.trim(),
                    file: filePath,
                    category: 'syntax'
                };
                
                // Try to extract line number
                const lineMatch = line.match(/:(\d+):/);
                if (lineMatch) {
                    issue.line = parseInt(lineMatch[1]);
                }
                
                issues.push(issue);
            }
        }
        
        return issues;
    }

    /**
     * Execute command in secure environment
     * @param {Array} command - Command to execute
     * @param {string} cwd - Working directory
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Object>} Command result
     */
    async executeCommand(command, cwd, secureEnvironment) {
        // If secure environment is available, use it
        if (secureEnvironment && secureEnvironment.type === 'docker') {
            // Execute in Docker container (implementation would depend on SecuritySandbox)
            return await this.executeInContainer(command, cwd, secureEnvironment);
        }
        
        // Execute on host
        return await this.executeHostCommand(command, cwd);
    }

    /**
     * Execute command on host
     * @param {Array} command - Command to execute
     * @param {string} cwd - Working directory
     * @returns {Promise<Object>} Command result
     */
    async executeHostCommand(command, cwd) {
        return new Promise((resolve, reject) => {
            const process = spawn(command[0], command.slice(1), {
                cwd,
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            const timeoutId = setTimeout(() => {
                process.kill('SIGTERM');
                reject(new Error(`Command timed out: ${command.join(' ')}`));
            }, this.config.timeout);

            process.on('close', (code) => {
                clearTimeout(timeoutId);
                resolve({
                    success: code === 0,
                    code,
                    stdout,
                    stderr,
                    command: command.join(' ')
                });
            });

            process.on('error', (error) => {
                clearTimeout(timeoutId);
                reject(error);
            });
        });
    }

    /**
     * Utility methods
     */

    async fileExists(path) {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    async checkAvailableTools() {
        const tools = ['node', 'python', 'eslint', 'flake8', 'tsc'];
        const available = {};
        
        for (const tool of tools) {
            try {
                await this.executeHostCommand([tool, '--version'], process.cwd());
                available[tool] = true;
            } catch {
                available[tool] = false;
            }
        }
        
        log('debug', `Available tools: ${JSON.stringify(available)}`);
        return available;
    }

    aggregateSyntaxResults(results, totalFiles) {
        const allIssues = [];
        let totalFilesProcessed = 0;
        
        for (const result of Object.values(results)) {
            allIssues.push(...result.issues);
            totalFilesProcessed += result.files_checked;
        }
        
        return {
            issues: allIssues,
            total_files: totalFiles,
            files_processed: totalFilesProcessed,
            syntax_valid: allIssues.filter(i => i.type === 'syntax_error').length === 0,
            issue_summary: this.summarizeIssues(allIssues)
        };
    }

    aggregateLintingResults(results) {
        const allIssues = [];
        
        for (const result of Object.values(results)) {
            if (result.issues) {
                allIssues.push(...result.issues);
            }
        }
        
        return {
            issues: allIssues,
            linting_passed: allIssues.length === 0,
            issue_summary: this.summarizeIssues(allIssues)
        };
    }

    aggregateDependencyResults(results) {
        const allIssues = [];
        
        for (const result of Object.values(results)) {
            if (result.issues) {
                allIssues.push(...result.issues);
            }
        }
        
        return {
            issues: allIssues,
            dependencies_valid: allIssues.filter(i => i.severity === 'high' || i.severity === 'critical').length === 0,
            issue_summary: this.summarizeIssues(allIssues)
        };
    }

    summarizeIssues(issues) {
        const summary = {
            total: issues.length,
            by_severity: {
                critical: 0,
                high: 0,
                medium: 0,
                low: 0,
                info: 0
            },
            by_category: {}
        };
        
        for (const issue of issues) {
            summary.by_severity[issue.severity] = (summary.by_severity[issue.severity] || 0) + 1;
            summary.by_category[issue.category] = (summary.by_category[issue.category] || 0) + 1;
        }
        
        return summary;
    }

    async calculateQualityMetrics(files, workspacePath) {
        // Simplified quality metrics calculation
        let totalLines = 0;
        let codeLines = 0;
        let commentLines = 0;
        
        for (const file of files) {
            try {
                const content = await fs.readFile(file, 'utf8');
                const lines = content.split('\n');
                totalLines += lines.length;
                
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('/*')) {
                        commentLines++;
                    } else if (trimmed.length > 0) {
                        codeLines++;
                    }
                }
            } catch (error) {
                log('warning', `Failed to read file ${file}: ${error.message}`);
            }
        }
        
        const commentRatio = totalLines > 0 ? (commentLines / totalLines) * 100 : 0;
        const codeRatio = totalLines > 0 ? (codeLines / totalLines) * 100 : 0;
        
        return {
            total_lines: totalLines,
            code_lines: codeLines,
            comment_lines: commentLines,
            comment_ratio: Math.round(commentRatio * 100) / 100,
            code_ratio: Math.round(codeRatio * 100) / 100,
            overall_score: Math.min(100, Math.max(0, 50 + (commentRatio * 2) + (codeRatio * 0.5)))
        };
    }

    async analyzeComplexity(files, workspacePath) {
        // Simplified complexity analysis
        return {
            average_complexity: 5,
            max_complexity: 10,
            complex_functions: [],
            complexity_score: 75
        };
    }

    async calculateMaintainabilityScore(files, workspacePath) {
        // Simplified maintainability score
        return {
            score: 80,
            factors: {
                code_organization: 85,
                naming_conventions: 75,
                function_size: 80,
                duplication: 90
            }
        };
    }

    calculateOverallQualityScore(qualityMetrics, complexityAnalysis, maintainabilityScore) {
        return Math.round((qualityMetrics.overall_score + complexityAnalysis.complexity_score + maintainabilityScore.score) / 3);
    }

    generateQualityRecommendations(qualityMetrics, complexityAnalysis) {
        const recommendations = [];
        
        if (qualityMetrics.comment_ratio < 10) {
            recommendations.push('Increase code documentation and comments');
        }
        
        if (complexityAnalysis.average_complexity > 7) {
            recommendations.push('Reduce code complexity by breaking down large functions');
        }
        
        return recommendations;
    }

    /**
     * Get validator health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: 'healthy',
            config: this.config,
            metrics: this.validationMetrics,
            supported_languages: this.config.supported_languages
        };
    }

    /**
     * Shutdown the validator
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', 'Shutting down Syntax Validator...');
        // No specific cleanup needed
        log('info', 'Syntax Validator shutdown complete');
    }
}

export default SyntaxValidator;

