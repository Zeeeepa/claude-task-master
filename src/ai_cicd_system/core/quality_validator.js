/**
 * @fileoverview Response Quality Validator
 * @description Advanced quality validation for Codegen responses and generated content
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * Quality validator for Codegen responses and generated content
 */
export class QualityValidator {
    constructor(config = {}) {
        this.config = {
            minQualityScore: config.minQualityScore || 75,
            enableCodeAnalysis: config.enableCodeAnalysis !== false,
            enableContentAnalysis: config.enableContentAnalysis !== false,
            enableSecurityAnalysis: config.enableSecurityAnalysis !== false,
            enablePerformanceAnalysis: config.enablePerformanceAnalysis !== false,
            strictMode: config.strictMode || false,
            ...config
        };

        // Initialize validators
        this.codeValidator = new CodeValidator(this.config);
        this.contentValidator = new ContentValidator(this.config);
        this.securityValidator = new SecurityValidator(this.config);
        this.performanceValidator = new PerformanceValidator(this.config);
        this.structureValidator = new StructureValidator(this.config);

        log('info', 'Quality validator initialized');
    }

    /**
     * Validate Codegen response quality
     * @param {Object} response - Codegen response to validate
     * @param {Object} originalTask - Original task structure
     * @returns {Promise<Object>} Validation results
     */
    async validateResponse(response, originalTask) {
        try {
            log('debug', 'Validating Codegen response', {
                responseType: typeof response,
                hasOriginalTask: !!originalTask
            });

            const validation = {
                isValid: true,
                overallScore: 0,
                issues: [],
                warnings: [],
                suggestions: [],
                metrics: {},
                timestamp: new Date().toISOString()
            };

            // Step 1: Validate response structure
            const structureValidation = await this.structureValidator.validate(response, originalTask);
            validation.metrics.structure = structureValidation;
            validation.overallScore += structureValidation.score * 0.2;

            if (!structureValidation.isValid) {
                validation.isValid = false;
                validation.issues.push(...structureValidation.issues);
            }

            // Step 2: Validate content quality
            if (this.config.enableContentAnalysis) {
                const contentValidation = await this.contentValidator.validate(response, originalTask);
                validation.metrics.content = contentValidation;
                validation.overallScore += contentValidation.score * 0.3;

                validation.warnings.push(...contentValidation.warnings);
                validation.suggestions.push(...contentValidation.suggestions);
            }

            // Step 3: Validate code quality (if response contains code)
            if (this.config.enableCodeAnalysis && this._containsCode(response)) {
                const codeValidation = await this.codeValidator.validate(response, originalTask);
                validation.metrics.code = codeValidation;
                validation.overallScore += codeValidation.score * 0.3;

                if (!codeValidation.isValid) {
                    validation.isValid = false;
                    validation.issues.push(...codeValidation.issues);
                }
                validation.warnings.push(...codeValidation.warnings);
            }

            // Step 4: Validate security aspects
            if (this.config.enableSecurityAnalysis) {
                const securityValidation = await this.securityValidator.validate(response, originalTask);
                validation.metrics.security = securityValidation;
                validation.overallScore += securityValidation.score * 0.1;

                if (!securityValidation.isValid) {
                    validation.isValid = false;
                    validation.issues.push(...securityValidation.issues);
                }
                validation.warnings.push(...securityValidation.warnings);
            }

            // Step 5: Validate performance considerations
            if (this.config.enablePerformanceAnalysis) {
                const performanceValidation = await this.performanceValidator.validate(response, originalTask);
                validation.metrics.performance = performanceValidation;
                validation.overallScore += performanceValidation.score * 0.1;

                validation.warnings.push(...performanceValidation.warnings);
                validation.suggestions.push(...performanceValidation.suggestions);
            }

            // Final score calculation (0-100)
            validation.overallScore = Math.round(validation.overallScore * 100);

            // Check if score meets minimum threshold
            if (validation.overallScore < this.config.minQualityScore) {
                validation.isValid = false;
                validation.issues.push(`Quality score ${validation.overallScore} below minimum threshold ${this.config.minQualityScore}`);
            }

            log('info', 'Response validation completed', {
                score: validation.overallScore,
                isValid: validation.isValid,
                issueCount: validation.issues.length,
                warningCount: validation.warnings.length
            });

            return validation;

        } catch (error) {
            log('error', 'Response validation failed', { error: error.message });
            throw new QualityValidationError(`Failed to validate response: ${error.message}`, 'VALIDATION_ERROR', error);
        }
    }

    /**
     * Validate prompt quality before sending to Codegen
     * @param {Object} promptData - Prompt data to validate
     * @returns {Promise<Object>} Validation results
     */
    async validatePrompt(promptData) {
        try {
            const { prompt, metadata } = promptData;
            
            const validation = {
                isValid: true,
                score: 0,
                issues: [],
                suggestions: [],
                metrics: {}
            };

            // 1. Length validation
            validation.metrics.length = this._validatePromptLength(prompt);
            if (!validation.metrics.length.isValid) {
                validation.isValid = false;
                validation.issues.push(validation.metrics.length.issue);
            }

            // 2. Clarity validation
            validation.metrics.clarity = this._validatePromptClarity(prompt);
            validation.score += validation.metrics.clarity.score * 0.4;

            // 3. Completeness validation
            validation.metrics.completeness = this._validatePromptCompleteness(prompt, metadata);
            validation.score += validation.metrics.completeness.score * 0.4;

            // 4. Technical accuracy validation
            validation.metrics.technical = this._validatePromptTechnical(prompt);
            validation.score += validation.metrics.technical.score * 0.2;

            // Generate suggestions
            validation.suggestions = this._generatePromptSuggestions(validation.metrics);

            // Final score (0-100)
            validation.score = Math.round(validation.score * 100);

            return validation;

        } catch (error) {
            log('error', 'Prompt validation failed', { error: error.message });
            throw new QualityValidationError(`Failed to validate prompt: ${error.message}`, 'PROMPT_VALIDATION_ERROR', error);
        }
    }

    /**
     * Generate quality improvement recommendations
     * @param {Object} validation - Validation results
     * @returns {Array} Improvement recommendations
     */
    generateImprovementRecommendations(validation) {
        const recommendations = [];

        // Structure improvements
        if (validation.metrics.structure?.score < 0.8) {
            recommendations.push({
                category: 'structure',
                priority: 'high',
                description: 'Improve response structure and organization',
                suggestions: validation.metrics.structure.suggestions || []
            });
        }

        // Content improvements
        if (validation.metrics.content?.score < 0.7) {
            recommendations.push({
                category: 'content',
                priority: 'medium',
                description: 'Enhance content quality and clarity',
                suggestions: validation.metrics.content.suggestions || []
            });
        }

        // Code improvements
        if (validation.metrics.code?.score < 0.8) {
            recommendations.push({
                category: 'code',
                priority: 'high',
                description: 'Improve code quality and best practices',
                suggestions: validation.metrics.code.suggestions || []
            });
        }

        // Security improvements
        if (validation.metrics.security?.score < 0.9) {
            recommendations.push({
                category: 'security',
                priority: 'critical',
                description: 'Address security concerns and vulnerabilities',
                suggestions: validation.metrics.security.suggestions || []
            });
        }

        return recommendations;
    }

    /**
     * Check if response contains code
     * @private
     */
    _containsCode(response) {
        if (typeof response === 'string') {
            return /```|function|class|import|export|const|let|var/.test(response);
        }
        
        if (response.data && typeof response.data === 'string') {
            return /```|function|class|import|export|const|let|var/.test(response.data);
        }
        
        return false;
    }

    /**
     * Validate prompt length
     * @private
     */
    _validatePromptLength(prompt) {
        const length = prompt.length;
        const minLength = 100;
        const maxLength = 8000;
        
        return {
            isValid: length >= minLength && length <= maxLength,
            length,
            minLength,
            maxLength,
            issue: length < minLength ? `Prompt too short: ${length} < ${minLength}` :
                   length > maxLength ? `Prompt too long: ${length} > ${maxLength}` : null
        };
    }

    /**
     * Validate prompt clarity
     * @private
     */
    _validatePromptClarity(prompt) {
        let score = 0.5; // Base score
        
        // Check for clear structure
        if (/^#+\s/m.test(prompt)) score += 0.2;
        
        // Check for objectives
        if (/objective|goal|purpose/i.test(prompt)) score += 0.1;
        
        // Check for requirements
        if (/requirement|must|should/i.test(prompt)) score += 0.1;
        
        // Check for examples
        if (/example|sample|demo/i.test(prompt)) score += 0.1;
        
        return {
            score: Math.min(score, 1.0),
            hasStructure: /^#+\s/m.test(prompt),
            hasObjectives: /objective|goal|purpose/i.test(prompt),
            hasRequirements: /requirement|must|should/i.test(prompt),
            hasExamples: /example|sample|demo/i.test(prompt)
        };
    }

    /**
     * Validate prompt completeness
     * @private
     */
    _validatePromptCompleteness(prompt, metadata) {
        const requiredSections = ['task', 'objective', 'requirement', 'output'];
        let score = 0;
        
        const presentSections = requiredSections.filter(section => 
            new RegExp(section, 'i').test(prompt)
        );
        
        score = presentSections.length / requiredSections.length;
        
        return {
            score,
            requiredSections,
            presentSections,
            missingSections: requiredSections.filter(section => 
                !presentSections.includes(section)
            )
        };
    }

    /**
     * Validate prompt technical accuracy
     * @private
     */
    _validatePromptTechnical(prompt) {
        let score = 0.7; // Base score
        
        // Check for technical terms
        if (/api|database|function|class|component/i.test(prompt)) score += 0.1;
        
        // Check for specific technologies
        if (/javascript|typescript|python|react|node/i.test(prompt)) score += 0.1;
        
        // Check for best practices mention
        if (/best practice|pattern|principle/i.test(prompt)) score += 0.1;
        
        return {
            score: Math.min(score, 1.0),
            hasTechnicalTerms: /api|database|function|class|component/i.test(prompt),
            hasTechnologies: /javascript|typescript|python|react|node/i.test(prompt),
            hasBestPractices: /best practice|pattern|principle/i.test(prompt)
        };
    }

    /**
     * Generate prompt improvement suggestions
     * @private
     */
    _generatePromptSuggestions(metrics) {
        const suggestions = [];
        
        if (metrics.clarity.score < 0.7) {
            suggestions.push('Add clear headers and structure to improve readability');
        }
        
        if (metrics.completeness.score < 0.8) {
            suggestions.push(`Include missing sections: ${metrics.completeness.missingSections.join(', ')}`);
        }
        
        if (metrics.technical.score < 0.8) {
            suggestions.push('Add more technical context and specific technology requirements');
        }
        
        return suggestions;
    }
}

/**
 * Code validator for analyzing code quality
 */
class CodeValidator {
    constructor(config) {
        this.config = config;
    }

    async validate(response, originalTask) {
        const validation = {
            isValid: true,
            score: 0,
            issues: [],
            warnings: [],
            suggestions: [],
            metrics: {}
        };

        try {
            const code = this._extractCode(response);
            
            // 1. Syntax validation
            validation.metrics.syntax = this._validateSyntax(code);
            validation.score += validation.metrics.syntax.score * 0.3;
            
            if (!validation.metrics.syntax.isValid) {
                validation.isValid = false;
                validation.issues.push(...validation.metrics.syntax.issues);
            }

            // 2. Style validation
            validation.metrics.style = this._validateStyle(code);
            validation.score += validation.metrics.style.score * 0.2;
            validation.warnings.push(...validation.metrics.style.warnings);

            // 3. Best practices validation
            validation.metrics.bestPractices = this._validateBestPractices(code);
            validation.score += validation.metrics.bestPractices.score * 0.3;
            validation.suggestions.push(...validation.metrics.bestPractices.suggestions);

            // 4. Completeness validation
            validation.metrics.completeness = this._validateCodeCompleteness(code, originalTask);
            validation.score += validation.metrics.completeness.score * 0.2;

        } catch (error) {
            validation.isValid = false;
            validation.issues.push(`Code validation error: ${error.message}`);
        }

        return validation;
    }

    _extractCode(response) {
        if (typeof response === 'string') {
            // Extract code blocks
            const codeBlocks = response.match(/```[\s\S]*?```/g) || [];
            return codeBlocks.join('\n');
        }
        
        if (response.data) {
            return this._extractCode(response.data);
        }
        
        return '';
    }

    _validateSyntax(code) {
        // Basic syntax validation
        const issues = [];
        let score = 1.0;

        // Check for common syntax errors
        if (/\(\s*\)/.test(code) && !/function|=>\s*\(\s*\)/.test(code)) {
            issues.push('Empty parentheses detected - possible syntax error');
            score -= 0.1;
        }

        // Check for unmatched brackets
        const openBrackets = (code.match(/\{/g) || []).length;
        const closeBrackets = (code.match(/\}/g) || []).length;
        if (openBrackets !== closeBrackets) {
            issues.push('Unmatched curly brackets detected');
            score -= 0.3;
        }

        return {
            isValid: issues.length === 0,
            score: Math.max(score, 0),
            issues
        };
    }

    _validateStyle(code) {
        const warnings = [];
        let score = 1.0;

        // Check indentation consistency
        if (/^\t/m.test(code) && /^  /m.test(code)) {
            warnings.push('Mixed indentation (tabs and spaces) detected');
            score -= 0.2;
        }

        // Check line length
        const longLines = code.split('\n').filter(line => line.length > 120);
        if (longLines.length > 0) {
            warnings.push(`${longLines.length} lines exceed 120 characters`);
            score -= 0.1;
        }

        return {
            score: Math.max(score, 0),
            warnings
        };
    }

    _validateBestPractices(code) {
        const suggestions = [];
        let score = 0.8; // Base score

        // Check for error handling
        if (!/try|catch|throw/.test(code) && code.length > 200) {
            suggestions.push('Consider adding error handling (try/catch blocks)');
            score -= 0.1;
        }

        // Check for input validation
        if (/function.*\(.*\)/.test(code) && !/if.*typeof|if.*instanceof/.test(code)) {
            suggestions.push('Consider adding input validation');
            score -= 0.1;
        }

        // Check for magic numbers
        const magicNumbers = code.match(/\b\d{2,}\b/g);
        if (magicNumbers && magicNumbers.length > 2) {
            suggestions.push('Consider extracting magic numbers to named constants');
            score -= 0.1;
        }

        return {
            score: Math.max(score, 0),
            suggestions
        };
    }

    _validateCodeCompleteness(code, originalTask) {
        let score = 0.5; // Base score

        // Check if code addresses the task requirements
        if (originalTask && originalTask.objectives) {
            const objectives = originalTask.objectives.join(' ').toLowerCase();
            
            if (objectives.includes('test') && !/test|spec|describe|it\(/.test(code)) {
                score -= 0.3;
            }
            
            if (objectives.includes('api') && !/app\.|router\.|express|fastapi/.test(code)) {
                score -= 0.2;
            }
            
            if (objectives.includes('database') && !/query|select|insert|update|delete/.test(code)) {
                score -= 0.2;
            }
        }

        // Check for basic completeness indicators
        if (/function|class|const|let/.test(code)) score += 0.3;
        if (/export|module\.exports/.test(code)) score += 0.2;

        return {
            score: Math.max(score, 0)
        };
    }
}

/**
 * Content validator for analyzing content quality
 */
class ContentValidator {
    constructor(config) {
        this.config = config;
    }

    async validate(response, originalTask) {
        const validation = {
            score: 0,
            warnings: [],
            suggestions: [],
            metrics: {}
        };

        try {
            const content = this._extractContent(response);
            
            // 1. Clarity validation
            validation.metrics.clarity = this._validateClarity(content);
            validation.score += validation.metrics.clarity.score * 0.4;

            // 2. Completeness validation
            validation.metrics.completeness = this._validateContentCompleteness(content, originalTask);
            validation.score += validation.metrics.completeness.score * 0.4;

            // 3. Relevance validation
            validation.metrics.relevance = this._validateRelevance(content, originalTask);
            validation.score += validation.metrics.relevance.score * 0.2;

            // Collect warnings and suggestions
            validation.warnings.push(...(validation.metrics.clarity.warnings || []));
            validation.suggestions.push(...(validation.metrics.completeness.suggestions || []));

        } catch (error) {
            validation.warnings.push(`Content validation error: ${error.message}`);
        }

        return validation;
    }

    _extractContent(response) {
        if (typeof response === 'string') {
            return response;
        }
        
        if (response.data) {
            return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        }
        
        return JSON.stringify(response);
    }

    _validateClarity(content) {
        let score = 0.5; // Base score
        const warnings = [];

        // Check for clear structure
        if (/^#+\s/m.test(content)) score += 0.2;
        else warnings.push('Content lacks clear structure with headers');

        // Check for explanations
        if (/because|since|therefore|thus|explanation/i.test(content)) score += 0.2;
        else warnings.push('Content lacks explanatory text');

        // Check for examples
        if (/example|sample|demo|for instance/i.test(content)) score += 0.1;

        return {
            score: Math.min(score, 1.0),
            warnings
        };
    }

    _validateContentCompleteness(content, originalTask) {
        let score = 0.5; // Base score
        const suggestions = [];

        if (originalTask) {
            // Check if content addresses task objectives
            const objectives = originalTask.objectives || [];
            const addressedObjectives = objectives.filter(obj => 
                content.toLowerCase().includes(obj.toLowerCase().split(' ')[0])
            );
            
            if (objectives.length > 0) {
                score = addressedObjectives.length / objectives.length;
            }

            // Check for deliverables
            const deliverables = originalTask.deliverables || [];
            const addressedDeliverables = deliverables.filter(del => 
                content.toLowerCase().includes(del.toLowerCase().split(' ')[0])
            );
            
            if (deliverables.length > 0 && addressedDeliverables.length === 0) {
                suggestions.push('Content should address specified deliverables');
            }
        }

        return {
            score: Math.max(score, 0),
            suggestions
        };
    }

    _validateRelevance(content, originalTask) {
        let score = 0.7; // Base score

        if (originalTask) {
            const taskType = originalTask.type || '';
            const technologies = originalTask.technologies || [];
            
            // Check relevance to task type
            if (taskType && content.toLowerCase().includes(taskType.toLowerCase())) {
                score += 0.2;
            }
            
            // Check relevance to technologies
            const mentionedTechs = technologies.filter(tech => 
                content.toLowerCase().includes(tech.toLowerCase())
            );
            
            if (technologies.length > 0) {
                score += (mentionedTechs.length / technologies.length) * 0.1;
            }
        }

        return {
            score: Math.min(score, 1.0)
        };
    }
}

/**
 * Security validator for analyzing security aspects
 */
class SecurityValidator {
    constructor(config) {
        this.config = config;
    }

    async validate(response, originalTask) {
        const validation = {
            isValid: true,
            score: 0.8, // Base score
            issues: [],
            warnings: [],
            suggestions: []
        };

        try {
            const content = this._extractContent(response);
            
            // Check for security vulnerabilities
            const vulnerabilities = this._checkVulnerabilities(content);
            if (vulnerabilities.length > 0) {
                validation.isValid = false;
                validation.issues.push(...vulnerabilities);
                validation.score -= vulnerabilities.length * 0.2;
            }

            // Check for security best practices
            const securityChecks = this._checkSecurityPractices(content);
            validation.warnings.push(...securityChecks.warnings);
            validation.suggestions.push(...securityChecks.suggestions);
            validation.score += securityChecks.score * 0.2;

        } catch (error) {
            validation.warnings.push(`Security validation error: ${error.message}`);
        }

        validation.score = Math.max(validation.score, 0);
        return validation;
    }

    _extractContent(response) {
        if (typeof response === 'string') return response;
        if (response.data) return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        return JSON.stringify(response);
    }

    _checkVulnerabilities(content) {
        const vulnerabilities = [];

        // Check for SQL injection patterns
        if (/query.*\+.*|SELECT.*\+|INSERT.*\+/.test(content)) {
            vulnerabilities.push('Potential SQL injection vulnerability detected');
        }

        // Check for XSS patterns
        if (/innerHTML.*\+|document\.write.*\+/.test(content)) {
            vulnerabilities.push('Potential XSS vulnerability detected');
        }

        // Check for hardcoded secrets
        if (/password\s*=\s*["'][^"']+["']|api_key\s*=\s*["'][^"']+["']/i.test(content)) {
            vulnerabilities.push('Hardcoded credentials detected');
        }

        return vulnerabilities;
    }

    _checkSecurityPractices(content) {
        const warnings = [];
        const suggestions = [];
        let score = 0;

        // Check for input validation
        if (/validate|sanitize|escape/.test(content)) {
            score += 0.3;
        } else if (/input|request|params/.test(content)) {
            suggestions.push('Consider adding input validation and sanitization');
        }

        // Check for authentication
        if (/auth|token|jwt|session/.test(content)) {
            score += 0.2;
        }

        // Check for HTTPS usage
        if (/https:\/\//.test(content)) {
            score += 0.1;
        } else if (/http:\/\//.test(content)) {
            warnings.push('HTTP URLs detected - consider using HTTPS');
        }

        return { warnings, suggestions, score };
    }
}

/**
 * Performance validator for analyzing performance considerations
 */
class PerformanceValidator {
    constructor(config) {
        this.config = config;
    }

    async validate(response, originalTask) {
        const validation = {
            score: 0.7, // Base score
            warnings: [],
            suggestions: []
        };

        try {
            const content = this._extractContent(response);
            
            // Check for performance anti-patterns
            const antiPatterns = this._checkAntiPatterns(content);
            validation.warnings.push(...antiPatterns.warnings);
            validation.score -= antiPatterns.penalty;

            // Check for performance best practices
            const bestPractices = this._checkBestPractices(content);
            validation.suggestions.push(...bestPractices.suggestions);
            validation.score += bestPractices.bonus;

        } catch (error) {
            validation.warnings.push(`Performance validation error: ${error.message}`);
        }

        validation.score = Math.max(validation.score, 0);
        return validation;
    }

    _extractContent(response) {
        if (typeof response === 'string') return response;
        if (response.data) return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
        return JSON.stringify(response);
    }

    _checkAntiPatterns(content) {
        const warnings = [];
        let penalty = 0;

        // Check for N+1 query patterns
        if (/for.*query|forEach.*query/.test(content)) {
            warnings.push('Potential N+1 query pattern detected');
            penalty += 0.1;
        }

        // Check for synchronous operations in loops
        if (/for.*await|forEach.*await/.test(content)) {
            warnings.push('Synchronous async operations in loop detected');
            penalty += 0.1;
        }

        return { warnings, penalty };
    }

    _checkBestPractices(content) {
        const suggestions = [];
        let bonus = 0;

        // Check for caching
        if (/cache|memoize|redis/.test(content)) {
            bonus += 0.1;
        } else if (/query|request|fetch/.test(content)) {
            suggestions.push('Consider implementing caching for better performance');
        }

        // Check for pagination
        if (/limit|offset|page|pagination/.test(content)) {
            bonus += 0.1;
        }

        // Check for async/await usage
        if (/async|await|Promise/.test(content)) {
            bonus += 0.1;
        }

        return { suggestions, bonus };
    }
}

/**
 * Structure validator for analyzing response structure
 */
class StructureValidator {
    constructor(config) {
        this.config = config;
    }

    async validate(response, originalTask) {
        const validation = {
            isValid: true,
            score: 0,
            issues: [],
            suggestions: []
        };

        try {
            // Check response format
            validation.score += this._validateFormat(response) * 0.4;
            
            // Check content organization
            validation.score += this._validateOrganization(response) * 0.3;
            
            // Check completeness
            validation.score += this._validateStructureCompleteness(response, originalTask) * 0.3;

        } catch (error) {
            validation.isValid = false;
            validation.issues.push(`Structure validation error: ${error.message}`);
        }

        return validation;
    }

    _validateFormat(response) {
        // Check if response has proper format
        if (typeof response === 'object' && response !== null) {
            return 1.0;
        }
        
        if (typeof response === 'string' && response.length > 0) {
            return 0.8;
        }
        
        return 0.3;
    }

    _validateOrganization(response) {
        const content = typeof response === 'string' ? response : JSON.stringify(response);
        
        let score = 0.5; // Base score
        
        // Check for headers/sections
        if (/^#+\s/m.test(content)) score += 0.3;
        
        // Check for lists/structure
        if (/^[-*]\s/m.test(content)) score += 0.2;
        
        return Math.min(score, 1.0);
    }

    _validateStructureCompleteness(response, originalTask) {
        // Basic completeness check
        const content = typeof response === 'string' ? response : JSON.stringify(response);
        
        if (content.length < 50) return 0.2;
        if (content.length < 200) return 0.6;
        return 1.0;
    }
}

/**
 * Custom error class for quality validation operations
 */
export class QualityValidationError extends Error {
    constructor(message, code = 'QUALITY_ERROR', originalError = null) {
        super(message);
        this.name = 'QualityValidationError';
        this.code = code;
        this.originalError = originalError;
        this.timestamp = new Date().toISOString();
        
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, QualityValidationError);
        }
    }
}

export default QualityValidator;

