/**
 * @fileoverview Requirement Parser Utility
 * @description Parse Linear issues and other requirement sources into structured format
 */

import { log } from '../scripts/modules/utils.js';

/**
 * Requirement Parser - Extracts structured requirements from various sources
 */
export class RequirementParser {
    constructor(options = {}) {
        this.options = {
            enableNLP: false, // Disable advanced NLP for now
            strictParsing: false,
            includeMetadata: true,
            ...options
        };

        // Regex patterns for extracting different sections
        this.patterns = {
            acceptance_criteria: /## ✅ Acceptance Criteria\n([\s\S]*?)(?=\n##|$)/,
            technical_specs: /## 📋 Technical Specifications\n([\s\S]*?)(?=\n##|$)/,
            affected_files: /## 📁 Affected Files\n([\s\S]*?)(?=\n##|$)/,
            dependencies: /## 🔗 Dependencies\n([\s\S]*?)(?=\n##|$)/,
            implementation_steps: /## 🚀 Implementation Steps\n([\s\S]*?)(?=\n##|$)/,
            success_metrics: /## 🎯 Success Metrics\n([\s\S]*?)(?=\n##|$)/,
            repository_files: /## 📁 Repository Files\n([\s\S]*?)(?=\n##|$)/
        };

        // Alternative patterns for less structured content
        this.alternativePatterns = {
            acceptance_criteria: [
                /Acceptance Criteria:?\n([\s\S]*?)(?=\n\n|$)/i,
                /AC:?\n([\s\S]*?)(?=\n\n|$)/i,
                /Criteria:?\n([\s\S]*?)(?=\n\n|$)/i
            ],
            technical_specs: [
                /Technical Requirements:?\n([\s\S]*?)(?=\n\n|$)/i,
                /Tech Specs:?\n([\s\S]*?)(?=\n\n|$)/i,
                /Requirements:?\n([\s\S]*?)(?=\n\n|$)/i
            ],
            affected_files: [
                /Files:?\n([\s\S]*?)(?=\n\n|$)/i,
                /File Changes:?\n([\s\S]*?)(?=\n\n|$)/i,
                /Modified Files:?\n([\s\S]*?)(?=\n\n|$)/i
            ],
            dependencies: [
                /Dependencies:?\n([\s\S]*?)(?=\n\n|$)/i,
                /Depends on:?\n([\s\S]*?)(?=\n\n|$)/i,
                /Prerequisites:?\n([\s\S]*?)(?=\n\n|$)/i
            ]
        };

        log('debug', 'Requirement Parser initialized');
    }

    /**
     * Parse Linear issue into structured requirements
     * @param {string} issueDescription - Linear issue description
     * @param {Object} metadata - Additional metadata
     * @returns {Object} Parsed requirements
     */
    parseLinearIssue(issueDescription, metadata = {}) {
        log('debug', 'Parsing Linear issue description');

        try {
            const requirements = {
                title: this.extractTitle(issueDescription, metadata),
                description: this.extractDescription(issueDescription),
                acceptanceCriteria: this.extractSection(issueDescription, 'acceptance_criteria'),
                technicalSpecs: this.extractSection(issueDescription, 'technical_specs'),
                affectedFiles: this.extractFileList(issueDescription),
                dependencies: this.extractDependencies(issueDescription),
                implementationSteps: this.extractSection(issueDescription, 'implementation_steps'),
                successMetrics: this.extractSection(issueDescription, 'success_metrics'),
                repositoryInfo: this.extractRepositoryInfo(issueDescription),
                metadata: this.options.includeMetadata ? this.extractMetadata(issueDescription, metadata) : {}
            };

            // Format for Codegen
            const formatted = this.formatForCodegen(requirements);

            log('debug', 'Linear issue parsed successfully');
            return formatted;

        } catch (error) {
            log('error', `Failed to parse Linear issue: ${error.message}`);
            throw new Error(`Requirement parsing failed: ${error.message}`);
        }
    }

    /**
     * Extract title from description or metadata
     * @param {string} description - Issue description
     * @param {Object} metadata - Issue metadata
     * @returns {string} Extracted title
     */
    extractTitle(description, metadata = {}) {
        // Use metadata title if available
        if (metadata.title) {
            return metadata.title;
        }

        // Extract from first line of description
        const firstLine = description.split('\n')[0].trim();
        
        // Remove markdown headers
        const cleanTitle = firstLine.replace(/^#+\s*/, '');
        
        return cleanTitle || 'Untitled Requirement';
    }

    /**
     * Extract main description (everything before first section header)
     * @param {string} description - Issue description
     * @returns {string} Main description
     */
    extractDescription(description) {
        // Find first section header
        const sectionMatch = description.match(/\n##\s/);
        
        if (sectionMatch) {
            return description.substring(0, sectionMatch.index).trim();
        }
        
        return description.trim();
    }

    /**
     * Extract a specific section from description
     * @param {string} description - Issue description
     * @param {string} sectionType - Section type to extract
     * @returns {Array} Extracted items
     */
    extractSection(description, sectionType) {
        // Try primary pattern first
        const primaryPattern = this.patterns[sectionType];
        if (primaryPattern) {
            const match = description.match(primaryPattern);
            if (match) {
                return this.parseListItems(match[1]);
            }
        }

        // Try alternative patterns
        const alternativePatterns = this.alternativePatterns[sectionType] || [];
        for (const pattern of alternativePatterns) {
            const match = description.match(pattern);
            if (match) {
                return this.parseListItems(match[1]);
            }
        }

        return [];
    }

    /**
     * Extract file list from description
     * @param {string} description - Issue description
     * @returns {Array} List of files
     */
    extractFileList(description) {
        const files = [];

        // Extract from affected files section
        const affectedFiles = this.extractSection(description, 'affected_files');
        files.push(...affectedFiles);

        // Extract from repository files section
        const repoFiles = this.extractSection(description, 'repository_files');
        files.push(...repoFiles);

        // Extract file paths from code blocks
        const codeBlocks = description.match(/```[\s\S]*?```/g) || [];
        codeBlocks.forEach(block => {
            // Look for file paths in comments
            const fileMatches = block.match(/\/\/\s*([^\s]+\.(js|ts|jsx|tsx|py|java|cpp|c|h|css|scss|html|json|xml|yaml|yml|md))/gi) || [];
            files.push(...fileMatches.map(match => match.replace(/\/\/\s*/, '')));

            // Look for import/require statements
            const importMatches = block.match(/(?:import|require|from)\s+['"]([^'"]+)['"]/g) || [];
            files.push(...importMatches.map(match => {
                const pathMatch = match.match(/['"]([^'"]+)['"]/);
                return pathMatch ? pathMatch[1] : null;
            }).filter(Boolean));
        });

        // Extract standalone file paths
        const filePathMatches = description.match(/\b[\w\-./]+\.(js|ts|jsx|tsx|py|java|cpp|c|h|css|scss|html|json|xml|yaml|yml|md)\b/g) || [];
        files.push(...filePathMatches);

        // Remove duplicates and filter out invalid paths
        return [...new Set(files)].filter(file => 
            file && 
            file.length > 0 && 
            !file.includes(' ') && 
            file.includes('.')
        );
    }

    /**
     * Extract dependencies from description
     * @param {string} description - Issue description
     * @returns {Array} List of dependencies
     */
    extractDependencies(description) {
        const dependencies = [];

        // Extract from dependencies section
        const depSection = this.extractSection(description, 'dependencies');
        dependencies.push(...depSection);

        // Look for package.json dependencies in code blocks
        const codeBlocks = description.match(/```[\s\S]*?```/g) || [];
        codeBlocks.forEach(block => {
            // NPM packages
            const npmMatches = block.match(/npm install\s+([\w\-@/\s]+)/g) || [];
            npmMatches.forEach(match => {
                const packages = match.replace('npm install', '').trim().split(/\s+/);
                dependencies.push(...packages.map(pkg => `npm: ${pkg}`));
            });

            // Yarn packages
            const yarnMatches = block.match(/yarn add\s+([\w\-@/\s]+)/g) || [];
            yarnMatches.forEach(match => {
                const packages = match.replace('yarn add', '').trim().split(/\s+/);
                dependencies.push(...packages.map(pkg => `yarn: ${pkg}`));
            });

            // Python packages
            const pipMatches = block.match(/pip install\s+([\w\-\s]+)/g) || [];
            pipMatches.forEach(match => {
                const packages = match.replace('pip install', '').trim().split(/\s+/);
                dependencies.push(...packages.map(pkg => `pip: ${pkg}`));
            });
        });

        // Look for @import statements
        const importMatches = description.match(/@import\s+['"]([^'"]+)['"]/g) || [];
        dependencies.push(...importMatches.map(match => {
            const pathMatch = match.match(/['"]([^'"]+)['"]/);
            return pathMatch ? `import: ${pathMatch[1]}` : null;
        }).filter(Boolean));

        return [...new Set(dependencies)];
    }

    /**
     * Extract repository information
     * @param {string} description - Issue description
     * @returns {Object} Repository information
     */
    extractRepositoryInfo(description) {
        const repoInfo = {};

        // Extract repository URL
        const repoUrlMatch = description.match(/(?:Repository|Repo):\s*([^\s\n]+)/i);
        if (repoUrlMatch) {
            repoInfo.url = repoUrlMatch[1];
        }

        // Extract branch information
        const branchMatch = description.match(/(?:Branch|Target Branch):\s*([^\s\n]+)/i);
        if (branchMatch) {
            repoInfo.branch = branchMatch[1];
        }

        // Extract GitHub URLs
        const githubMatches = description.match(/https:\/\/github\.com\/[^\s\n)]+/g) || [];
        if (githubMatches.length > 0) {
            repoInfo.githubUrls = githubMatches;
            if (!repoInfo.url && githubMatches[0]) {
                repoInfo.url = githubMatches[0];
            }
        }

        return repoInfo;
    }

    /**
     * Extract metadata from description and additional metadata
     * @param {string} description - Issue description
     * @param {Object} additionalMetadata - Additional metadata
     * @returns {Object} Extracted metadata
     */
    extractMetadata(description, additionalMetadata = {}) {
        const metadata = { ...additionalMetadata };

        // Extract priority indicators
        const priorityKeywords = ['urgent', 'critical', 'high priority', 'asap', 'important'];
        const hasPriorityKeyword = priorityKeywords.some(keyword => 
            description.toLowerCase().includes(keyword)
        );
        if (hasPriorityKeyword) {
            metadata.priority = 'high';
        }

        // Extract complexity indicators
        const complexityIndicators = {
            simple: ['simple', 'easy', 'quick', 'minor'],
            medium: ['medium', 'moderate', 'standard'],
            complex: ['complex', 'difficult', 'major', 'significant', 'comprehensive']
        };

        for (const [level, keywords] of Object.entries(complexityIndicators)) {
            if (keywords.some(keyword => description.toLowerCase().includes(keyword))) {
                metadata.complexity = level;
                break;
            }
        }

        // Extract estimated effort
        const effortMatch = description.match(/(?:effort|estimate|time):\s*(\d+)\s*(hour|day|week)s?/i);
        if (effortMatch) {
            metadata.estimatedEffort = `${effortMatch[1]} ${effortMatch[2]}s`;
        }

        // Extract tags from hashtags
        const hashtagMatches = description.match(/#(\w+)/g) || [];
        if (hashtagMatches.length > 0) {
            metadata.tags = hashtagMatches.map(tag => tag.substring(1));
        }

        return metadata;
    }

    /**
     * Parse list items from text
     * @param {string} text - Text containing list items
     * @returns {Array} Parsed items
     */
    parseListItems(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const lines = text.split('\n');
        const items = [];

        for (const line of lines) {
            const trimmed = line.trim();
            
            if (!trimmed) continue;

            // Match various list formats
            const listPatterns = [
                /^[-*+•]\s+(.+)$/,           // Bullet points
                /^\d+\.\s+(.+)$/,           // Numbered lists
                /^-\s*\[\s*[x\s]\s*\]\s+(.+)$/, // Checkboxes
                /^>\s+(.+)$/,               // Blockquotes
                /^\|\s*(.+)\s*\|$/          // Table rows
            ];

            let matched = false;
            for (const pattern of listPatterns) {
                const match = trimmed.match(pattern);
                if (match) {
                    items.push(match[1].trim());
                    matched = true;
                    break;
                }
            }

            // If no list pattern matched, include non-header lines
            if (!matched && !trimmed.startsWith('#') && trimmed.length > 0) {
                items.push(trimmed);
            }
        }

        return items.filter(item => item.length > 0);
    }

    /**
     * Format requirements for Codegen API
     * @param {Object} requirements - Parsed requirements
     * @returns {string} Formatted prompt
     */
    formatForCodegen(requirements) {
        let prompt = `# Task: ${requirements.title}\n\n`;
        
        if (requirements.description) {
            prompt += `## Description\n${requirements.description}\n\n`;
        }

        if (requirements.technicalSpecs && requirements.technicalSpecs.length > 0) {
            prompt += `## Technical Requirements\n`;
            requirements.technicalSpecs.forEach(spec => {
                prompt += `- ${spec}\n`;
            });
            prompt += '\n';
        }

        if (requirements.acceptanceCriteria && requirements.acceptanceCriteria.length > 0) {
            prompt += `## Acceptance Criteria\n`;
            requirements.acceptanceCriteria.forEach(criteria => {
                prompt += `- ${criteria}\n`;
            });
            prompt += '\n';
        }

        if (requirements.affectedFiles && requirements.affectedFiles.length > 0) {
            prompt += `## Files to Modify/Create\n`;
            requirements.affectedFiles.forEach(file => {
                prompt += `- ${file}\n`;
            });
            prompt += '\n';
        }

        if (requirements.dependencies && requirements.dependencies.length > 0) {
            prompt += `## Dependencies\n`;
            requirements.dependencies.forEach(dep => {
                prompt += `- ${dep}\n`;
            });
            prompt += '\n';
        }

        if (requirements.implementationSteps && requirements.implementationSteps.length > 0) {
            prompt += `## Implementation Steps\n`;
            requirements.implementationSteps.forEach((step, index) => {
                prompt += `${index + 1}. ${step}\n`;
            });
            prompt += '\n';
        }

        if (requirements.repositoryInfo && Object.keys(requirements.repositoryInfo).length > 0) {
            prompt += `## Repository Information\n`;
            if (requirements.repositoryInfo.url) {
                prompt += `- Repository: ${requirements.repositoryInfo.url}\n`;
            }
            if (requirements.repositoryInfo.branch) {
                prompt += `- Target Branch: ${requirements.repositoryInfo.branch}\n`;
            }
            prompt += '\n';
        }

        prompt += `## Implementation Guidelines\n`;
        prompt += `- Follow existing code patterns and conventions\n`;
        prompt += `- Include comprehensive error handling\n`;
        prompt += `- Add appropriate logging and monitoring\n`;
        prompt += `- Write unit and integration tests\n`;
        prompt += `- Update documentation as needed\n`;
        prompt += `- Ensure backward compatibility where applicable\n\n`;

        prompt += `Please implement this feature following best practices and include comprehensive tests.`;

        return prompt;
    }

    /**
     * Validate parsed requirements
     * @param {Object} requirements - Requirements to validate
     * @returns {Object} Validation result
     */
    validateRequirements(requirements) {
        const errors = [];
        const warnings = [];

        // Check required fields
        if (!requirements.title || requirements.title.trim().length === 0) {
            errors.push('Title is required');
        }

        if (!requirements.description || requirements.description.trim().length < 10) {
            warnings.push('Description is very short or missing');
        }

        if (!requirements.acceptanceCriteria || requirements.acceptanceCriteria.length === 0) {
            warnings.push('No acceptance criteria specified');
        }

        if (!requirements.technicalSpecs || requirements.technicalSpecs.length === 0) {
            warnings.push('No technical specifications provided');
        }

        if (!requirements.affectedFiles || requirements.affectedFiles.length === 0) {
            warnings.push('No affected files specified');
        }

        // Check for potential issues
        if (requirements.title && requirements.title.length > 100) {
            warnings.push('Title is very long');
        }

        if (requirements.description && requirements.description.length > 5000) {
            warnings.push('Description is very long');
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
            score: Math.max(0, 100 - (errors.length * 30) - (warnings.length * 10))
        };
    }

    /**
     * Get parser health status
     * @returns {Object} Health status
     */
    getHealth() {
        return {
            status: 'healthy',
            options: this.options,
            patterns: Object.keys(this.patterns),
            alternativePatterns: Object.keys(this.alternativePatterns),
            version: '1.0.0'
        };
    }
}

export default RequirementParser;

