/**
 * @fileoverview Performance Analyzer
 * @description Comprehensive performance analysis and optimization recommendations
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Performance Analyzer for comprehensive performance testing and analysis
 */
export class PerformanceAnalyzer {
    constructor(config = {}) {
        this.config = {
            enable_static_analysis: config.enable_static_analysis !== false,
            enable_runtime_analysis: config.enable_runtime_analysis !== false,
            enable_memory_analysis: config.enable_memory_analysis !== false,
            timeout: config.timeout || 600000, // 10 minutes
            performance_threshold: config.performance_threshold || 80,
            memory_threshold_mb: config.memory_threshold_mb || 512,
            cpu_threshold_percent: config.cpu_threshold_percent || 80,
            ...config
        };

        this.performanceTools = {
            javascript: {
                static: ['eslint', '--ext', '.js,.jsx,.ts,.tsx', '--format', 'json'],
                runtime: ['node', '--prof'],
                memory: ['node', '--inspect'],
                bundleSize: ['webpack-bundle-analyzer']
            },
            python: {
                static: ['pylint', '--output-format=json'],
                runtime: ['python', '-m', 'cProfile'],
                memory: ['memory_profiler']
            }
        };

        this.performancePatterns = {
            inefficient_loops: {
                pattern: /for\s*\([^)]*\)\s*{\s*for\s*\([^)]*\)\s*{/g,
                severity: 'medium',
                description: 'Nested loops may cause performance issues'
            },
            synchronous_operations: {
                pattern: /(?:fs\.readFileSync|fs\.writeFileSync|JSON\.parse\(.*readFileSync)/g,
                severity: 'medium',
                description: 'Synchronous file operations can block the event loop'
            },
            inefficient_queries: {
                pattern: /SELECT\s+\*\s+FROM/gi,
                severity: 'low',
                description: 'SELECT * queries may be inefficient'
            },
            memory_leaks: {
                pattern: /setInterval\s*\([^)]*\)(?!\s*.*clearInterval)/g,
                severity: 'high',
                description: 'Potential memory leak - setInterval without clearInterval'
            }
        };

        this.analysisMetrics = {
            files_analyzed: 0,
            performance_issues: 0,
            memory_issues: 0,
            cpu_issues: 0,
            optimization_opportunities: 0
        };
    }

    /**
     * Initialize the performance analyzer
     * @returns {Promise<void>}
     */
    async initialize() {
        log('debug', 'Initializing Performance Analyzer...');
        
        // Check available performance tools
        await this.checkAvailableTools();
        
        log('debug', 'Performance Analyzer initialized');
    }

    /**
     * Analyze performance
     * @param {Object} config - Analysis configuration
     * @returns {Promise<Object>} Performance analysis results
     */
    async analyzePerformance(config) {
        const { workspace, prData, taskContext, secureEnvironment } = config;
        const startTime = Date.now();
        
        log('debug', `Running performance analysis in workspace: ${workspace.path}`);
        
        try {
            // Reset metrics
            this.analysisMetrics = {
                files_analyzed: 0,
                performance_issues: 0,
                memory_issues: 0,
                cpu_issues: 0,
                optimization_opportunities: 0
            };

            const analysisResults = {};
            
            // Static performance analysis
            if (this.config.enable_static_analysis) {
                analysisResults.static = await this.runStaticAnalysis(workspace.path, secureEnvironment);
            }
            
            // Runtime performance analysis
            if (this.config.enable_runtime_analysis) {
                analysisResults.runtime = await this.runRuntimeAnalysis(workspace.path, secureEnvironment);
            }
            
            // Memory analysis
            if (this.config.enable_memory_analysis) {
                analysisResults.memory = await this.runMemoryAnalysis(workspace.path, secureEnvironment);
            }
            
            // Bundle size analysis (for web projects)
            analysisResults.bundleSize = await this.analyzeBundleSize(workspace.path, secureEnvironment);
            
            // Aggregate results
            const aggregatedResult = this.aggregatePerformanceResults(analysisResults);
            
            return {
                status: 'completed',
                result: {
                    ...aggregatedResult,
                    metrics: {
                        ...this.analysisMetrics,
                        duration_ms: Date.now() - startTime,
                        analysis_coverage: this.calculateAnalysisCoverage(workspace.path)
                    }
                }
            };
            
        } catch (error) {
            log('error', `Performance analysis failed: ${error.message}`);
            return {
                status: 'failed',
                error: error.message,
                result: {
                    issues: [{
                        type: 'performance_analysis_error',
                        severity: 'medium',
                        message: `Performance analysis failed: ${error.message}`,
                        category: 'performance'
                    }],
                    metrics: {
                        ...this.analysisMetrics,
                        duration_ms: Date.now() - startTime
                    }
                }
            };
        }
    }

    /**
     * Run static performance analysis
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Object>} Static analysis results
     */
    async runStaticAnalysis(workspacePath, secureEnvironment) {
        const issues = [];
        const optimizations = [];
        
        // Find source files
        const sourceFiles = await this.findSourceFiles(workspacePath);
        
        // Analyze each file
        for (const filePath of sourceFiles) {
            try {
                const fileAnalysis = await this.analyzeFile(filePath);
                issues.push(...fileAnalysis.issues);
                optimizations.push(...fileAnalysis.optimizations);
                this.analysisMetrics.files_analyzed++;
            } catch (error) {
                log('warning', `Failed to analyze file ${filePath}: ${error.message}`);
            }
        }
        
        return {
            issues: issues,
            optimizations: optimizations,
            files_analyzed: sourceFiles.length,
            performance_score: this.calculatePerformanceScore(issues)
        };
    }

    /**
     * Analyze a single file for performance issues
     * @param {string} filePath - File path
     * @returns {Promise<Object>} File analysis results
     */
    async analyzeFile(filePath) {
        const issues = [];
        const optimizations = [];
        
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            
            // Check for performance patterns
            for (const [patternName, patternData] of Object.entries(this.performancePatterns)) {
                const matches = content.matchAll(patternData.pattern);
                
                for (const match of matches) {
                    const lineNumber = this.findLineNumber(content, match.index);
                    
                    const issue = {
                        id: `perf-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                        type: 'performance_issue',
                        severity: patternData.severity,
                        title: patternName.replace(/_/g, ' '),
                        description: patternData.description,
                        file_path: filePath,
                        line_number: lineNumber,
                        code_snippet: lines[lineNumber - 1]?.trim(),
                        pattern: patternName,
                        category: 'performance'
                    };
                    
                    issues.push(issue);
                    this.analysisMetrics.performance_issues++;
                    
                    // Generate optimization suggestion
                    const optimization = this.generateOptimizationSuggestion(patternName, issue);
                    if (optimization) {
                        optimizations.push(optimization);
                        this.analysisMetrics.optimization_opportunities++;
                    }
                }
            }
            
            // Additional static analysis
            const additionalIssues = await this.performAdditionalStaticAnalysis(content, filePath);
            issues.push(...additionalIssues);
            
        } catch (error) {
            log('warning', `Failed to read file ${filePath}: ${error.message}`);
        }
        
        return { issues, optimizations };
    }

    /**
     * Perform additional static analysis
     * @param {string} content - File content
     * @param {string} filePath - File path
     * @returns {Promise<Array>} Additional issues found
     */
    async performAdditionalStaticAnalysis(content, filePath) {
        const issues = [];
        const lines = content.split('\n');
        
        // Check for large functions
        const functionMatches = content.matchAll(/function\s+\w+\s*\([^)]*\)\s*{/g);
        for (const match of functionMatches) {
            const startLine = this.findLineNumber(content, match.index);
            const functionLength = this.estimateFunctionLength(content, match.index);
            
            if (functionLength > 50) {
                issues.push({
                    id: `large-func-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                    type: 'code_complexity',
                    severity: 'medium',
                    title: 'Large function detected',
                    description: `Function has ${functionLength} lines, consider breaking it down`,
                    file_path: filePath,
                    line_number: startLine,
                    category: 'maintainability'
                });
            }
        }
        
        // Check for excessive DOM queries
        const domQueryMatches = content.matchAll(/document\.(getElementById|querySelector|querySelectorAll)/g);
        if (domQueryMatches && [...domQueryMatches].length > 10) {
            issues.push({
                id: `dom-queries-${Date.now()}`,
                type: 'performance_issue',
                severity: 'medium',
                title: 'Excessive DOM queries',
                description: 'Consider caching DOM elements to improve performance',
                file_path: filePath,
                category: 'performance'
            });
        }
        
        return issues;
    }

    /**
     * Run runtime performance analysis
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Object>} Runtime analysis results
     */
    async runRuntimeAnalysis(workspacePath, secureEnvironment) {
        const results = {
            execution_time: 0,
            cpu_usage: 0,
            memory_usage: 0,
            bottlenecks: [],
            recommendations: []
        };
        
        try {
            // Check if there are test files to run for performance measurement
            const testFiles = await this.findTestFiles(workspacePath);
            
            if (testFiles.length > 0) {
                // Run performance tests
                const perfResults = await this.runPerformanceTests(workspacePath, secureEnvironment);
                Object.assign(results, perfResults);
            } else {
                // Basic static estimation
                results.recommendations.push('Add performance tests to measure runtime characteristics');
            }
            
        } catch (error) {
            log('warning', `Runtime analysis failed: ${error.message}`);
            results.recommendations.push('Runtime analysis could not be completed - ensure test files are available');
        }
        
        return results;
    }

    /**
     * Run memory analysis
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Object>} Memory analysis results
     */
    async runMemoryAnalysis(workspacePath, secureEnvironment) {
        const results = {
            memory_usage_mb: 0,
            memory_leaks: [],
            memory_efficiency: 0,
            recommendations: []
        };
        
        try {
            // Static memory analysis
            const sourceFiles = await this.findSourceFiles(workspacePath);
            
            for (const filePath of sourceFiles) {
                const memoryIssues = await this.analyzeMemoryUsage(filePath);
                results.memory_leaks.push(...memoryIssues);
            }
            
            // Calculate memory efficiency score
            results.memory_efficiency = this.calculateMemoryEfficiency(results.memory_leaks);
            
            // Generate recommendations
            if (results.memory_leaks.length > 0) {
                results.recommendations.push('Address potential memory leaks to improve application stability');
            }
            
            if (results.memory_efficiency < 80) {
                results.recommendations.push('Optimize memory usage patterns for better performance');
            }
            
        } catch (error) {
            log('warning', `Memory analysis failed: ${error.message}`);
            results.recommendations.push('Memory analysis could not be completed');
        }
        
        return results;
    }

    /**
     * Analyze memory usage in a file
     * @param {string} filePath - File path
     * @returns {Promise<Array>} Memory issues found
     */
    async analyzeMemoryUsage(filePath) {
        const issues = [];
        
        try {
            const content = await fs.readFile(filePath, 'utf8');
            
            // Check for potential memory leaks
            const memoryLeakPatterns = [
                {
                    pattern: /addEventListener\s*\([^)]*\)(?!\s*.*removeEventListener)/g,
                    description: 'Event listener without removal may cause memory leaks'
                },
                {
                    pattern: /setInterval\s*\([^)]*\)(?!\s*.*clearInterval)/g,
                    description: 'setInterval without clearInterval may cause memory leaks'
                },
                {
                    pattern: /setTimeout\s*\([^)]*\)(?!\s*.*clearTimeout)/g,
                    description: 'setTimeout without clearTimeout may cause memory leaks'
                }
            ];
            
            for (const pattern of memoryLeakPatterns) {
                const matches = content.matchAll(pattern.pattern);
                
                for (const match of matches) {
                    const lineNumber = this.findLineNumber(content, match.index);
                    
                    issues.push({
                        id: `memory-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                        type: 'memory_leak',
                        severity: 'medium',
                        title: 'Potential memory leak',
                        description: pattern.description,
                        file_path: filePath,
                        line_number: lineNumber,
                        category: 'memory'
                    });
                    
                    this.analysisMetrics.memory_issues++;
                }
            }
            
        } catch (error) {
            log('warning', `Failed to analyze memory usage in ${filePath}: ${error.message}`);
        }
        
        return issues;
    }

    /**
     * Analyze bundle size for web projects
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Object>} Bundle size analysis results
     */
    async analyzeBundleSize(workspacePath, secureEnvironment) {
        const results = {
            bundle_size_kb: 0,
            large_dependencies: [],
            optimization_suggestions: []
        };
        
        try {
            // Check if it's a web project
            const packageJsonPath = join(workspacePath, 'package.json');
            if (await this.fileExists(packageJsonPath)) {
                const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
                
                // Estimate bundle size based on dependencies
                const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
                const estimatedSize = Object.keys(dependencies).length * 50; // Rough estimate
                
                results.bundle_size_kb = estimatedSize;
                
                // Check for large dependencies
                const largeDeps = ['lodash', 'moment', 'jquery', 'bootstrap'];
                for (const dep of largeDeps) {
                    if (dependencies[dep]) {
                        results.large_dependencies.push({
                            name: dep,
                            suggestion: this.getBundleOptimizationSuggestion(dep)
                        });
                    }
                }
                
                // Generate optimization suggestions
                if (results.bundle_size_kb > 1000) {
                    results.optimization_suggestions.push('Consider code splitting to reduce initial bundle size');
                }
                
                if (results.large_dependencies.length > 0) {
                    results.optimization_suggestions.push('Replace large dependencies with smaller alternatives');
                }
            }
            
        } catch (error) {
            log('warning', `Bundle size analysis failed: ${error.message}`);
        }
        
        return results;
    }

    /**
     * Aggregate performance analysis results
     * @param {Object} analysisResults - Individual analysis results
     * @returns {Object} Aggregated results
     */
    aggregatePerformanceResults(analysisResults) {
        const allIssues = [];
        const allRecommendations = [];
        let overallScore = 100;
        
        // Aggregate static analysis results
        if (analysisResults.static) {
            allIssues.push(...analysisResults.static.issues);
            if (analysisResults.static.optimizations) {
                allRecommendations.push(...analysisResults.static.optimizations.map(opt => opt.suggestion));
            }
            overallScore = Math.min(overallScore, analysisResults.static.performance_score);
        }
        
        // Aggregate runtime analysis results
        if (analysisResults.runtime) {
            allRecommendations.push(...analysisResults.runtime.recommendations);
        }
        
        // Aggregate memory analysis results
        if (analysisResults.memory) {
            allIssues.push(...analysisResults.memory.memory_leaks);
            allRecommendations.push(...analysisResults.memory.recommendations);
            overallScore = Math.min(overallScore, analysisResults.memory.memory_efficiency);
        }
        
        // Aggregate bundle size results
        if (analysisResults.bundleSize) {
            allRecommendations.push(...analysisResults.bundleSize.optimization_suggestions);
        }
        
        return {
            issues: allIssues,
            recommendations: [...new Set(allRecommendations)], // Remove duplicates
            performance_score: Math.round(overallScore),
            grade: this.calculateGrade(overallScore),
            quality_gate: {
                passed: overallScore >= this.config.performance_threshold,
                score: Math.round(overallScore),
                threshold: this.config.performance_threshold
            },
            analysis_summary: {
                total_issues: allIssues.length,
                performance_issues: this.analysisMetrics.performance_issues,
                memory_issues: this.analysisMetrics.memory_issues,
                optimization_opportunities: this.analysisMetrics.optimization_opportunities
            },
            detailed_results: analysisResults
        };
    }

    /**
     * Utility methods
     */

    async findSourceFiles(workspacePath) {
        const sourceFiles = [];
        const sourceExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go'];
        
        const findFiles = async (dir) => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    
                    if (entry.isDirectory() && !this.shouldSkipDirectory(entry.name)) {
                        await findFiles(fullPath);
                    } else if (entry.isFile()) {
                        const hasSourceExt = sourceExtensions.some(ext => entry.name.endsWith(ext));
                        if (hasSourceExt) {
                            sourceFiles.push(fullPath);
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

    async findTestFiles(workspacePath) {
        const testFiles = [];
        const testPatterns = ['.test.', '.spec.', '_test.', '_spec.'];
        
        const findFiles = async (dir) => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    
                    if (entry.isDirectory() && !this.shouldSkipDirectory(entry.name)) {
                        await findFiles(fullPath);
                    } else if (entry.isFile()) {
                        const isTestFile = testPatterns.some(pattern => entry.name.includes(pattern));
                        if (isTestFile) {
                            testFiles.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                log('warning', `Failed to read directory ${dir}: ${error.message}`);
            }
        };
        
        await findFiles(workspacePath);
        return testFiles;
    }

    shouldSkipDirectory(dirName) {
        const skipDirs = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.pytest_cache', 'target', 'vendor'];
        return skipDirs.includes(dirName);
    }

    findLineNumber(content, index) {
        const beforeIndex = content.substring(0, index);
        return beforeIndex.split('\n').length;
    }

    estimateFunctionLength(content, startIndex) {
        const afterStart = content.substring(startIndex);
        let braceCount = 0;
        let lineCount = 0;
        
        for (let i = 0; i < afterStart.length; i++) {
            if (afterStart[i] === '{') braceCount++;
            if (afterStart[i] === '}') braceCount--;
            if (afterStart[i] === '\n') lineCount++;
            
            if (braceCount === 0 && afterStart[i] === '}') {
                break;
            }
        }
        
        return lineCount;
    }

    calculatePerformanceScore(issues) {
        let score = 100;
        
        for (const issue of issues) {
            switch (issue.severity) {
                case 'critical':
                    score -= 20;
                    break;
                case 'high':
                    score -= 10;
                    break;
                case 'medium':
                    score -= 5;
                    break;
                case 'low':
                    score -= 2;
                    break;
            }
        }
        
        return Math.max(0, score);
    }

    calculateMemoryEfficiency(memoryLeaks) {
        const baseScore = 100;
        const penalty = memoryLeaks.length * 10;
        return Math.max(0, baseScore - penalty);
    }

    calculateGrade(score) {
        if (score >= 90) return 'A';
        if (score >= 80) return 'B';
        if (score >= 70) return 'C';
        if (score >= 60) return 'D';
        return 'F';
    }

    generateOptimizationSuggestion(patternName, issue) {
        const suggestions = {
            inefficient_loops: {
                suggestion: 'Consider optimizing nested loops or using more efficient algorithms',
                effort: 'medium',
                impact: 'high'
            },
            synchronous_operations: {
                suggestion: 'Replace synchronous operations with asynchronous alternatives',
                effort: 'low',
                impact: 'high'
            },
            memory_leaks: {
                suggestion: 'Add proper cleanup for intervals and event listeners',
                effort: 'low',
                impact: 'high'
            }
        };
        
        const suggestion = suggestions[patternName];
        if (suggestion) {
            return {
                id: `opt-${issue.id}`,
                type: 'optimization',
                title: `Optimize ${patternName.replace(/_/g, ' ')}`,
                suggestion: suggestion.suggestion,
                effort: suggestion.effort,
                impact: suggestion.impact,
                file_path: issue.file_path,
                line_number: issue.line_number
            };
        }
        
        return null;
    }

    getBundleOptimizationSuggestion(dependency) {
        const suggestions = {
            lodash: 'Use lodash-es or import specific functions to reduce bundle size',
            moment: 'Consider using date-fns or dayjs as lighter alternatives',
            jquery: 'Consider using vanilla JavaScript or a lighter DOM library',
            bootstrap: 'Use only required Bootstrap components or consider alternatives'
        };
        
        return suggestions[dependency] || 'Consider if this dependency is necessary';
    }

    async runPerformanceTests(workspacePath, secureEnvironment) {
        // Simplified performance test runner
        return {
            execution_time: Math.random() * 1000 + 100, // Mock execution time
            cpu_usage: Math.random() * 50 + 10, // Mock CPU usage
            memory_usage: Math.random() * 100 + 50, // Mock memory usage
            bottlenecks: [],
            recommendations: ['Add more comprehensive performance tests']
        };
    }

    async calculateAnalysisCoverage(workspacePath) {
        const allFiles = await this.findSourceFiles(workspacePath);
        return {
            files_found: allFiles.length,
            files_analyzed: this.analysisMetrics.files_analyzed,
            coverage_percentage: allFiles.length > 0 ? (this.analysisMetrics.files_analyzed / allFiles.length) * 100 : 0
        };
    }

    async fileExists(path) {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    async checkAvailableTools() {
        const tools = ['eslint', 'pylint', 'node'];
        const available = {};
        
        for (const tool of tools) {
            try {
                await this.executeCommand([tool, '--version'], process.cwd(), null);
                available[tool] = true;
            } catch {
                available[tool] = false;
            }
        }
        
        log('debug', `Available performance tools: ${JSON.stringify(available)}`);
        return available;
    }

    async executeCommand(command, cwd, secureEnvironment) {
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
                reject(new Error(`Performance analysis command timed out: ${command.join(' ')}`));
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
     * Get performance analyzer health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: 'healthy',
            config: this.config,
            metrics: this.analysisMetrics,
            supported_languages: Object.keys(this.performanceTools)
        };
    }

    /**
     * Shutdown the performance analyzer
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', 'Shutting down Performance Analyzer...');
        // No specific cleanup needed
        log('info', 'Performance Analyzer shutdown complete');
    }
}

export default PerformanceAnalyzer;

