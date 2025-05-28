/**
 * @fileoverview Security Scanner
 * @description Comprehensive security vulnerability scanning and analysis
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Security Scanner for comprehensive vulnerability detection
 */
export class SecurityScanner {
    constructor(config = {}) {
        this.config = {
            enable_dependency_scan: config.enable_dependency_scan !== false,
            enable_code_scan: config.enable_code_scan !== false,
            enable_secret_scan: config.enable_secret_scan !== false,
            timeout: config.timeout || 300000, // 5 minutes
            severity_threshold: config.severity_threshold || 'medium',
            max_findings: config.max_findings || 100,
            ...config
        };

        this.securityTools = {
            javascript: {
                dependency: ['npm', 'audit', '--json'],
                code: ['eslint', '--ext', '.js,.jsx,.ts,.tsx', '--format', 'json'],
                secrets: ['truffleHog', '--json']
            },
            python: {
                dependency: ['safety', 'check', '--json'],
                code: ['bandit', '-f', 'json'],
                secrets: ['detect-secrets', 'scan', '--force-use-all-plugins']
            },
            java: {
                dependency: ['mvn', 'org.owasp:dependency-check-maven:check'],
                code: ['spotbugs', '-xml:withMessages']
            }
        };

        this.vulnerabilityPatterns = {
            secrets: [
                {
                    name: 'API Key',
                    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9]{20,})['"]?/gi,
                    severity: 'high'
                },
                {
                    name: 'AWS Access Key',
                    pattern: /AKIA[0-9A-Z]{16}/g,
                    severity: 'critical'
                },
                {
                    name: 'Private Key',
                    pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
                    severity: 'critical'
                },
                {
                    name: 'Database Password',
                    pattern: /(?:password|pwd|pass)\s*[:=]\s*['"]?([^'"\s]{8,})['"]?/gi,
                    severity: 'high'
                }
            ],
            code: [
                {
                    name: 'SQL Injection',
                    pattern: /(?:SELECT|INSERT|UPDATE|DELETE).*\+.*(?:request|input|param)/gi,
                    severity: 'high',
                    description: 'Potential SQL injection vulnerability'
                },
                {
                    name: 'XSS Vulnerability',
                    pattern: /innerHTML\s*=.*(?:request|input|param)/gi,
                    severity: 'medium',
                    description: 'Potential XSS vulnerability'
                },
                {
                    name: 'Command Injection',
                    pattern: /exec\(.*(?:request|input|param)/gi,
                    severity: 'high',
                    description: 'Potential command injection vulnerability'
                }
            ]
        };

        this.scanMetrics = {
            files_scanned: 0,
            vulnerabilities_found: 0,
            critical_findings: 0,
            high_findings: 0,
            medium_findings: 0,
            low_findings: 0
        };
    }

    /**
     * Initialize the security scanner
     * @returns {Promise<void>}
     */
    async initialize() {
        log('debug', 'Initializing Security Scanner...');
        
        // Check available security tools
        await this.checkAvailableTools();
        
        log('debug', 'Security Scanner initialized');
    }

    /**
     * Scan for security vulnerabilities
     * @param {Object} config - Scan configuration
     * @returns {Promise<Object>} Security scan results
     */
    async scanSecurity(config) {
        const { workspace, prData, taskContext, secureEnvironment } = config;
        const startTime = Date.now();
        
        log('debug', `Running security scan in workspace: ${workspace.path}`);
        
        try {
            // Reset metrics
            this.scanMetrics = {
                files_scanned: 0,
                vulnerabilities_found: 0,
                critical_findings: 0,
                high_findings: 0,
                medium_findings: 0,
                low_findings: 0
            };

            const findings = [];
            
            // Dependency vulnerability scan
            if (this.config.enable_dependency_scan) {
                const depFindings = await this.scanDependencies(workspace.path, secureEnvironment);
                findings.push(...depFindings);
            }
            
            // Code vulnerability scan
            if (this.config.enable_code_scan) {
                const codeFindings = await this.scanCode(workspace.path, secureEnvironment);
                findings.push(...codeFindings);
            }
            
            // Secret scan
            if (this.config.enable_secret_scan) {
                const secretFindings = await this.scanSecrets(workspace.path, secureEnvironment);
                findings.push(...secretFindings);
            }
            
            // Filter and prioritize findings
            const filteredFindings = this.filterFindings(findings);
            const prioritizedFindings = this.prioritizeFindings(filteredFindings);
            
            // Generate security report
            const securityReport = this.generateSecurityReport(prioritizedFindings);
            
            return {
                status: 'completed',
                result: {
                    findings: prioritizedFindings,
                    summary: securityReport.summary,
                    recommendations: securityReport.recommendations,
                    quality_gate: {
                        passed: this.scanMetrics.critical_findings === 0 && this.scanMetrics.high_findings <= 5,
                        critical_findings: this.scanMetrics.critical_findings,
                        high_findings: this.scanMetrics.high_findings,
                        threshold: 'No critical, max 5 high severity findings'
                    },
                    metrics: {
                        ...this.scanMetrics,
                        duration_ms: Date.now() - startTime,
                        scan_coverage: this.calculateScanCoverage(workspace.path)
                    }
                }
            };
            
        } catch (error) {
            log('error', `Security scan failed: ${error.message}`);
            return {
                status: 'failed',
                error: error.message,
                result: {
                    findings: [],
                    issues: [{
                        type: 'security_scan_error',
                        severity: 'high',
                        message: `Security scan failed: ${error.message}`,
                        category: 'security'
                    }],
                    metrics: {
                        ...this.scanMetrics,
                        duration_ms: Date.now() - startTime
                    }
                }
            };
        }
    }

    /**
     * Scan dependencies for vulnerabilities
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Array>} Array of dependency vulnerabilities
     */
    async scanDependencies(workspacePath, secureEnvironment) {
        const findings = [];
        
        // Check for package.json (Node.js)
        const packageJsonPath = join(workspacePath, 'package.json');
        if (await this.fileExists(packageJsonPath)) {
            const npmFindings = await this.runNpmAudit(workspacePath, secureEnvironment);
            findings.push(...npmFindings);
        }
        
        // Check for requirements.txt (Python)
        const requirementsPath = join(workspacePath, 'requirements.txt');
        if (await this.fileExists(requirementsPath)) {
            const pythonFindings = await this.runPythonSafety(workspacePath, secureEnvironment);
            findings.push(...pythonFindings);
        }
        
        // Check for pom.xml (Java)
        const pomPath = join(workspacePath, 'pom.xml');
        if (await this.fileExists(pomPath)) {
            const javaFindings = await this.runDependencyCheck(workspacePath, secureEnvironment);
            findings.push(...javaFindings);
        }
        
        return findings;
    }

    /**
     * Run npm audit for Node.js dependencies
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Array>} Array of npm audit findings
     */
    async runNpmAudit(workspacePath, secureEnvironment) {
        const findings = [];
        
        try {
            const result = await this.executeCommand(['npm', 'audit', '--json'], workspacePath, secureEnvironment);
            
            if (result.stdout) {
                const auditData = JSON.parse(result.stdout);
                
                if (auditData.vulnerabilities) {
                    for (const [packageName, vulnData] of Object.entries(auditData.vulnerabilities)) {
                        for (const advisory of vulnData.via || []) {
                            if (typeof advisory === 'object') {
                                findings.push({
                                    id: `npm-${advisory.id || Date.now()}`,
                                    type: 'dependency_vulnerability',
                                    severity: this.mapNpmSeverity(advisory.severity),
                                    title: advisory.title || `Vulnerability in ${packageName}`,
                                    description: advisory.overview || advisory.title,
                                    package: packageName,
                                    version: vulnData.version,
                                    cwe: advisory.cwe,
                                    cvss_score: advisory.cvss?.score,
                                    remediation: `Update ${packageName} to version ${vulnData.fixAvailable?.version || 'latest'}`,
                                    references: advisory.url ? [advisory.url] : [],
                                    category: 'dependency'
                                });
                            }
                        }
                    }
                }
            }
        } catch (error) {
            log('warning', `npm audit failed: ${error.message}`);
            findings.push({
                id: `npm-audit-error-${Date.now()}`,
                type: 'scan_error',
                severity: 'medium',
                title: 'npm audit execution failed',
                description: `Failed to run npm audit: ${error.message}`,
                category: 'tooling'
            });
        }
        
        return findings;
    }

    /**
     * Scan code for security vulnerabilities
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Array>} Array of code vulnerabilities
     */
    async scanCode(workspacePath, secureEnvironment) {
        const findings = [];
        
        // Find source files
        const sourceFiles = await this.findSourceFiles(workspacePath);
        
        // Scan each file for vulnerability patterns
        for (const filePath of sourceFiles) {
            try {
                const fileFindings = await this.scanFile(filePath);
                findings.push(...fileFindings);
                this.scanMetrics.files_scanned++;
            } catch (error) {
                log('warning', `Failed to scan file ${filePath}: ${error.message}`);
            }
        }
        
        return findings;
    }

    /**
     * Scan a single file for vulnerabilities
     * @param {string} filePath - File path
     * @returns {Promise<Array>} Array of vulnerabilities found in file
     */
    async scanFile(filePath) {
        const findings = [];
        
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            
            // Check for code vulnerability patterns
            for (const pattern of this.vulnerabilityPatterns.code) {
                const matches = content.matchAll(pattern.pattern);
                
                for (const match of matches) {
                    const lineNumber = this.findLineNumber(content, match.index);
                    
                    findings.push({
                        id: `code-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                        type: 'code_vulnerability',
                        severity: pattern.severity,
                        title: pattern.name,
                        description: pattern.description,
                        file_path: filePath,
                        line_number: lineNumber,
                        code_snippet: lines[lineNumber - 1]?.trim(),
                        pattern_matched: pattern.name,
                        category: 'code_security'
                    });
                }
            }
            
        } catch (error) {
            log('warning', `Failed to read file ${filePath}: ${error.message}`);
        }
        
        return findings;
    }

    /**
     * Scan for secrets and sensitive information
     * @param {string} workspacePath - Workspace path
     * @param {Object} secureEnvironment - Secure environment
     * @returns {Promise<Array>} Array of secret findings
     */
    async scanSecrets(workspacePath, secureEnvironment) {
        const findings = [];
        
        // Find all text files
        const textFiles = await this.findTextFiles(workspacePath);
        
        // Scan each file for secret patterns
        for (const filePath of textFiles) {
            try {
                const secretFindings = await this.scanFileForSecrets(filePath);
                findings.push(...secretFindings);
            } catch (error) {
                log('warning', `Failed to scan file for secrets ${filePath}: ${error.message}`);
            }
        }
        
        return findings;
    }

    /**
     * Scan a file for secrets
     * @param {string} filePath - File path
     * @returns {Promise<Array>} Array of secret findings
     */
    async scanFileForSecrets(filePath) {
        const findings = [];
        
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const lines = content.split('\n');
            
            // Check for secret patterns
            for (const pattern of this.vulnerabilityPatterns.secrets) {
                const matches = content.matchAll(pattern.pattern);
                
                for (const match of matches) {
                    const lineNumber = this.findLineNumber(content, match.index);
                    
                    findings.push({
                        id: `secret-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                        type: 'secret_exposure',
                        severity: pattern.severity,
                        title: `${pattern.name} detected`,
                        description: `Potential ${pattern.name.toLowerCase()} found in code`,
                        file_path: filePath,
                        line_number: lineNumber,
                        code_snippet: lines[lineNumber - 1]?.trim(),
                        secret_type: pattern.name,
                        category: 'secrets'
                    });
                }
            }
            
        } catch (error) {
            log('warning', `Failed to scan file for secrets ${filePath}: ${error.message}`);
        }
        
        return findings;
    }

    /**
     * Filter findings based on configuration
     * @param {Array} findings - Array of findings
     * @returns {Array} Filtered findings
     */
    filterFindings(findings) {
        const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
        const thresholdIndex = severityOrder.indexOf(this.config.severity_threshold);
        
        return findings
            .filter(finding => {
                const findingIndex = severityOrder.indexOf(finding.severity);
                return findingIndex <= thresholdIndex;
            })
            .slice(0, this.config.max_findings);
    }

    /**
     * Prioritize findings by severity and type
     * @param {Array} findings - Array of findings
     * @returns {Array} Prioritized findings
     */
    prioritizeFindings(findings) {
        const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
        
        return findings.sort((a, b) => {
            const aSeverity = severityOrder.indexOf(a.severity);
            const bSeverity = severityOrder.indexOf(b.severity);
            
            if (aSeverity !== bSeverity) {
                return aSeverity - bSeverity;
            }
            
            // Secondary sort by type priority
            const typeOrder = ['secret_exposure', 'code_vulnerability', 'dependency_vulnerability'];
            const aType = typeOrder.indexOf(a.type);
            const bType = typeOrder.indexOf(b.type);
            
            return aType - bType;
        });
    }

    /**
     * Generate security report
     * @param {Array} findings - Array of findings
     * @returns {Object} Security report
     */
    generateSecurityReport(findings) {
        // Update metrics
        for (const finding of findings) {
            this.scanMetrics.vulnerabilities_found++;
            
            switch (finding.severity) {
                case 'critical':
                    this.scanMetrics.critical_findings++;
                    break;
                case 'high':
                    this.scanMetrics.high_findings++;
                    break;
                case 'medium':
                    this.scanMetrics.medium_findings++;
                    break;
                case 'low':
                    this.scanMetrics.low_findings++;
                    break;
            }
        }
        
        const summary = {
            total_findings: findings.length,
            by_severity: {
                critical: this.scanMetrics.critical_findings,
                high: this.scanMetrics.high_findings,
                medium: this.scanMetrics.medium_findings,
                low: this.scanMetrics.low_findings
            },
            by_type: this.groupFindingsByType(findings),
            risk_score: this.calculateRiskScore(findings)
        };
        
        const recommendations = this.generateSecurityRecommendations(findings);
        
        return {
            summary,
            recommendations
        };
    }

    /**
     * Group findings by type
     * @param {Array} findings - Array of findings
     * @returns {Object} Findings grouped by type
     */
    groupFindingsByType(findings) {
        const grouped = {};
        
        for (const finding of findings) {
            grouped[finding.type] = (grouped[finding.type] || 0) + 1;
        }
        
        return grouped;
    }

    /**
     * Calculate risk score based on findings
     * @param {Array} findings - Array of findings
     * @returns {number} Risk score (0-100)
     */
    calculateRiskScore(findings) {
        let score = 0;
        
        for (const finding of findings) {
            switch (finding.severity) {
                case 'critical':
                    score += 25;
                    break;
                case 'high':
                    score += 15;
                    break;
                case 'medium':
                    score += 5;
                    break;
                case 'low':
                    score += 1;
                    break;
            }
        }
        
        return Math.min(100, score);
    }

    /**
     * Generate security recommendations
     * @param {Array} findings - Array of findings
     * @returns {Array} Array of recommendations
     */
    generateSecurityRecommendations(findings) {
        const recommendations = [];
        
        if (this.scanMetrics.critical_findings > 0) {
            recommendations.push('Immediately address all critical security vulnerabilities');
        }
        
        if (this.scanMetrics.high_findings > 0) {
            recommendations.push('Address high severity vulnerabilities as soon as possible');
        }
        
        const secretFindings = findings.filter(f => f.type === 'secret_exposure');
        if (secretFindings.length > 0) {
            recommendations.push('Remove exposed secrets and rotate compromised credentials');
        }
        
        const depFindings = findings.filter(f => f.type === 'dependency_vulnerability');
        if (depFindings.length > 0) {
            recommendations.push('Update vulnerable dependencies to secure versions');
        }
        
        if (findings.length === 0) {
            recommendations.push('No security vulnerabilities detected - maintain current security practices');
        }
        
        return recommendations;
    }

    /**
     * Utility methods
     */

    async findSourceFiles(workspacePath) {
        const sourceFiles = [];
        const sourceExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.php', '.rb'];
        
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

    async findTextFiles(workspacePath) {
        const textFiles = [];
        const textExtensions = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.go', '.php', '.rb', '.json', '.yml', '.yaml', '.env', '.config'];
        
        const findFiles = async (dir) => {
            try {
                const entries = await fs.readdir(dir, { withFileTypes: true });
                
                for (const entry of entries) {
                    const fullPath = join(dir, entry.name);
                    
                    if (entry.isDirectory() && !this.shouldSkipDirectory(entry.name)) {
                        await findFiles(fullPath);
                    } else if (entry.isFile()) {
                        const hasTextExt = textExtensions.some(ext => entry.name.endsWith(ext));
                        if (hasTextExt || entry.name.startsWith('.env')) {
                            textFiles.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                log('warning', `Failed to read directory ${dir}: ${error.message}`);
            }
        };
        
        await findFiles(workspacePath);
        return textFiles;
    }

    shouldSkipDirectory(dirName) {
        const skipDirs = ['node_modules', '.git', 'dist', 'build', '__pycache__', '.pytest_cache', 'target', 'vendor'];
        return skipDirs.includes(dirName);
    }

    findLineNumber(content, index) {
        const beforeIndex = content.substring(0, index);
        return beforeIndex.split('\n').length;
    }

    mapNpmSeverity(npmSeverity) {
        const mapping = {
            'critical': 'critical',
            'high': 'high',
            'moderate': 'medium',
            'low': 'low',
            'info': 'info'
        };
        return mapping[npmSeverity] || 'medium';
    }

    async calculateScanCoverage(workspacePath) {
        const allFiles = await this.findSourceFiles(workspacePath);
        return {
            files_found: allFiles.length,
            files_scanned: this.scanMetrics.files_scanned,
            coverage_percentage: allFiles.length > 0 ? (this.scanMetrics.files_scanned / allFiles.length) * 100 : 0
        };
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
                reject(new Error(`Security scan command timed out: ${command.join(' ')}`));
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

    async fileExists(path) {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    async checkAvailableTools() {
        const tools = ['npm', 'safety', 'bandit', 'eslint'];
        const available = {};
        
        for (const tool of tools) {
            try {
                await this.executeCommand([tool, '--version'], process.cwd(), null);
                available[tool] = true;
            } catch {
                available[tool] = false;
            }
        }
        
        log('debug', `Available security tools: ${JSON.stringify(available)}`);
        return available;
    }

    async runPythonSafety(workspacePath, secureEnvironment) {
        // Placeholder for Python safety check
        return [];
    }

    async runDependencyCheck(workspacePath, secureEnvironment) {
        // Placeholder for Java dependency check
        return [];
    }

    /**
     * Get security scanner health status
     * @returns {Promise<Object>} Health status
     */
    async getHealth() {
        return {
            status: 'healthy',
            config: this.config,
            metrics: this.scanMetrics,
            supported_languages: Object.keys(this.securityTools)
        };
    }

    /**
     * Shutdown the security scanner
     * @returns {Promise<void>}
     */
    async shutdown() {
        log('info', 'Shutting down Security Scanner...');
        // No specific cleanup needed
        log('info', 'Security Scanner shutdown complete');
    }
}

export default SecurityScanner;

