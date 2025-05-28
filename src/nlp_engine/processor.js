/**
 * Natural Language Processing engine for requirement analysis
 * Provides text analysis, entity extraction, and semantic understanding
 */

/**
 * NLP Processor for analyzing requirement text
 */
export class NLPProcessor {
    constructor(options = {}) {
        this.options = {
            enableEntityExtraction: true,
            enableSentimentAnalysis: false,
            enableKeywordExtraction: true,
            confidenceThreshold: 0.7,
            ...options
        };
        
        // Initialize keyword dictionaries
        this.technicalKeywords = this._initializeTechnicalKeywords();
        this.businessKeywords = this._initializeBusinessKeywords();
        this.actionKeywords = this._initializeActionKeywords();
        this.priorityKeywords = this._initializePriorityKeywords();
    }

    /**
     * Analyzes requirement text and extracts structured information
     * @param {string} text - The requirement text to analyze
     * @returns {Object} Analysis results with extracted information
     */
    async analyze(text) {
        try {
            const analysis = {
                originalText: text,
                processedAt: new Date().toISOString(),
                confidence: 0.8
            };

            // Basic text preprocessing
            const preprocessed = this._preprocessText(text);
            analysis.preprocessedText = preprocessed;

            // Extract entities
            if (this.options.enableEntityExtraction) {
                analysis.entities = this._extractEntities(preprocessed);
            }

            // Extract keywords
            if (this.options.enableKeywordExtraction) {
                analysis.keywords = this._extractKeywords(preprocessed);
            }

            // Analyze sentence structure
            analysis.sentences = this._analyzeSentences(preprocessed);

            // Extract title and description
            analysis.title = this._extractTitle(preprocessed);
            analysis.description = this._extractDescription(preprocessed);

            // Classify requirement type
            analysis.requirementType = this._classifyRequirementType(preprocessed);

            // Estimate complexity indicators
            analysis.complexityIndicators = this._analyzeComplexityIndicators(preprocessed);

            // Extract priority indicators
            analysis.priorityIndicators = this._extractPriorityIndicators(preprocessed);

            // Calculate overall confidence
            analysis.confidence = this._calculateConfidence(analysis);

            return analysis;
        } catch (error) {
            throw new Error(`NLP analysis failed: ${error.message}`);
        }
    }

    /**
     * Extracts specific entities from text
     * @param {string} text - Preprocessed text
     * @returns {Object} Extracted entities
     */
    _extractEntities(text) {
        const entities = {
            technologies: [],
            files: [],
            functions: [],
            classes: [],
            apis: [],
            databases: [],
            services: [],
            users: [],
            actions: []
        };

        // Extract technology entities
        entities.technologies = this._extractTechnologies(text);

        // Extract file entities
        entities.files = this._extractFiles(text);

        // Extract function entities
        entities.functions = this._extractFunctions(text);

        // Extract class entities
        entities.classes = this._extractClasses(text);

        // Extract API entities
        entities.apis = this._extractAPIs(text);

        // Extract database entities
        entities.databases = this._extractDatabases(text);

        // Extract service entities
        entities.services = this._extractServices(text);

        // Extract user entities
        entities.users = this._extractUsers(text);

        // Extract action entities
        entities.actions = this._extractActions(text);

        return entities;
    }

    /**
     * Extracts keywords from text
     * @param {string} text - Preprocessed text
     * @returns {Object} Categorized keywords
     */
    _extractKeywords(text) {
        const keywords = {
            technical: [],
            business: [],
            actions: [],
            priorities: []
        };

        const words = text.toLowerCase().split(/\s+/);

        // Extract technical keywords
        keywords.technical = words.filter(word => 
            this.technicalKeywords.includes(word)
        );

        // Extract business keywords
        keywords.business = words.filter(word => 
            this.businessKeywords.includes(word)
        );

        // Extract action keywords
        keywords.actions = words.filter(word => 
            this.actionKeywords.includes(word)
        );

        // Extract priority keywords
        keywords.priorities = words.filter(word => 
            this.priorityKeywords.includes(word)
        );

        return keywords;
    }

    /**
     * Analyzes sentence structure and extracts meaningful sentences
     * @param {string} text - Preprocessed text
     * @returns {Array} Analyzed sentences
     */
    _analyzeSentences(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
        
        return sentences.map(sentence => {
            const trimmed = sentence.trim();
            return {
                text: trimmed,
                length: trimmed.length,
                wordCount: trimmed.split(/\s+/).length,
                hasAction: this._containsAction(trimmed),
                hasTechnicalTerms: this._containsTechnicalTerms(trimmed),
                hasBusinessTerms: this._containsBusinessTerms(trimmed),
                complexity: this._estimateSentenceComplexity(trimmed)
            };
        });
    }

    /**
     * Extracts title from text
     * @param {string} text - Preprocessed text
     * @returns {string} Extracted title
     */
    _extractTitle(text) {
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        
        if (lines.length === 0) return 'Untitled Requirement';

        // Look for markdown headers
        const headerMatch = lines[0].match(/^#+\s*(.+)$/);
        if (headerMatch) {
            return headerMatch[1].trim();
        }

        // Use first line if it's short and looks like a title
        const firstLine = lines[0].trim();
        if (firstLine.length < 100 && !firstLine.includes('.')) {
            return firstLine;
        }

        // Extract from first sentence
        const firstSentence = text.split(/[.!?]/)[0].trim();
        if (firstSentence.length < 150) {
            return firstSentence;
        }

        // Generate title from action and object
        const action = this._extractPrimaryAction(text);
        const object = this._extractPrimaryObject(text);
        
        if (action && object) {
            return `${action} ${object}`;
        }

        return 'Requirement Analysis';
    }

    /**
     * Extracts description from text
     * @param {string} text - Preprocessed text
     * @returns {string} Extracted description
     */
    _extractDescription(text) {
        // Remove title if it exists
        const lines = text.split('\n');
        let startIndex = 0;

        // Skip title line
        if (lines[0] && (lines[0].startsWith('#') || lines[0].length < 100)) {
            startIndex = 1;
        }

        // Join remaining lines
        const description = lines.slice(startIndex).join('\n').trim();
        
        return description || text.trim();
    }

    /**
     * Classifies the type of requirement
     * @param {string} text - Preprocessed text
     * @returns {string} Requirement type
     */
    _classifyRequirementType(text) {
        const lowerText = text.toLowerCase();

        // Functional requirements
        if (this._containsPattern(lowerText, ['implement', 'create', 'build', 'develop', 'add'])) {
            return 'functional';
        }

        // Non-functional requirements
        if (this._containsPattern(lowerText, ['performance', 'security', 'scalability', 'reliability'])) {
            return 'non-functional';
        }

        // Bug fixes
        if (this._containsPattern(lowerText, ['fix', 'bug', 'error', 'issue', 'problem'])) {
            return 'bug-fix';
        }

        // Enhancements
        if (this._containsPattern(lowerText, ['enhance', 'improve', 'optimize', 'upgrade'])) {
            return 'enhancement';
        }

        // Documentation
        if (this._containsPattern(lowerText, ['document', 'documentation', 'readme', 'guide'])) {
            return 'documentation';
        }

        // Testing
        if (this._containsPattern(lowerText, ['test', 'testing', 'unit test', 'integration test'])) {
            return 'testing';
        }

        return 'general';
    }

    /**
     * Analyzes complexity indicators in the text
     * @param {string} text - Preprocessed text
     * @returns {Object} Complexity analysis
     */
    _analyzeComplexityIndicators(text) {
        const indicators = {
            textLength: text.length,
            wordCount: text.split(/\s+/).length,
            sentenceCount: text.split(/[.!?]+/).length,
            technicalTermCount: 0,
            integrationTermCount: 0,
            complexityScore: 1
        };

        const lowerText = text.toLowerCase();

        // Count technical terms
        this.technicalKeywords.forEach(keyword => {
            if (lowerText.includes(keyword)) {
                indicators.technicalTermCount++;
            }
        });

        // Count integration terms
        const integrationTerms = ['api', 'service', 'integration', 'external', 'third-party', 'webhook'];
        integrationTerms.forEach(term => {
            if (lowerText.includes(term)) {
                indicators.integrationTermCount++;
            }
        });

        // Calculate complexity score
        let score = 1;
        
        // Text length factor
        if (indicators.textLength > 1000) score += 2;
        else if (indicators.textLength > 500) score += 1;

        // Technical complexity
        score += Math.min(3, Math.floor(indicators.technicalTermCount / 2));

        // Integration complexity
        score += Math.min(2, indicators.integrationTermCount);

        // Sentence complexity
        if (indicators.sentenceCount > 10) score += 1;

        indicators.complexityScore = Math.min(10, score);

        return indicators;
    }

    /**
     * Extracts priority indicators from text
     * @param {string} text - Preprocessed text
     * @returns {Object} Priority analysis
     */
    _extractPriorityIndicators(text) {
        const indicators = {
            urgencyKeywords: [],
            timelineKeywords: [],
            priorityKeywords: [],
            suggestedPriority: 'medium'
        };

        const lowerText = text.toLowerCase();

        // Urgency keywords
        const urgencyTerms = ['urgent', 'asap', 'immediately', 'critical', 'emergency'];
        indicators.urgencyKeywords = urgencyTerms.filter(term => lowerText.includes(term));

        // Timeline keywords
        const timelineTerms = ['today', 'tomorrow', 'this week', 'next week', 'deadline'];
        indicators.timelineKeywords = timelineTerms.filter(term => lowerText.includes(term));

        // Priority keywords
        const priorityTerms = ['high priority', 'low priority', 'important', 'optional', 'nice to have'];
        indicators.priorityKeywords = priorityTerms.filter(term => lowerText.includes(term));

        // Determine suggested priority
        if (indicators.urgencyKeywords.length > 0 || lowerText.includes('high priority')) {
            indicators.suggestedPriority = 'high';
        } else if (lowerText.includes('low priority') || lowerText.includes('nice to have')) {
            indicators.suggestedPriority = 'low';
        }

        return indicators;
    }

    /**
     * Calculates overall confidence score for the analysis
     * @param {Object} analysis - The analysis results
     * @returns {number} Confidence score between 0 and 1
     */
    _calculateConfidence(analysis) {
        let confidence = 0.5; // Base confidence

        // Increase confidence based on text length
        if (analysis.originalText.length > 100) confidence += 0.1;
        if (analysis.originalText.length > 500) confidence += 0.1;

        // Increase confidence based on entity extraction
        if (analysis.entities) {
            const entityCount = Object.values(analysis.entities).reduce((sum, arr) => sum + arr.length, 0);
            confidence += Math.min(0.2, entityCount * 0.02);
        }

        // Increase confidence based on keyword extraction
        if (analysis.keywords) {
            const keywordCount = Object.values(analysis.keywords).reduce((sum, arr) => sum + arr.length, 0);
            confidence += Math.min(0.1, keywordCount * 0.01);
        }

        // Increase confidence if we found a clear title
        if (analysis.title && analysis.title !== 'Untitled Requirement') {
            confidence += 0.1;
        }

        return Math.min(1.0, confidence);
    }

    // Text preprocessing methods

    _preprocessText(text) {
        // Remove extra whitespace
        let processed = text.replace(/\s+/g, ' ').trim();
        
        // Normalize line endings
        processed = processed.replace(/\r\n/g, '\n');
        
        // Remove markdown formatting for analysis
        processed = processed.replace(/[*_`]/g, '');
        
        return processed;
    }

    // Entity extraction methods

    _extractTechnologies(text) {
        const technologies = [
            'javascript', 'python', 'java', 'react', 'vue', 'angular', 'node.js', 'express',
            'mongodb', 'postgresql', 'mysql', 'redis', 'docker', 'kubernetes', 'aws', 'azure'
        ];
        
        return this._findMatches(text, technologies);
    }

    _extractFiles(text) {
        const filePattern = /[\w-]+\.(js|py|java|html|css|json|xml|yml|yaml|md|txt)/gi;
        return [...text.matchAll(filePattern)].map(match => match[0]);
    }

    _extractFunctions(text) {
        const functionPatterns = [
            /function\s+(\w+)/gi,
            /def\s+(\w+)/gi,
            /(\w+)\s*\(/gi
        ];
        
        const functions = [];
        functionPatterns.forEach(pattern => {
            const matches = [...text.matchAll(pattern)];
            functions.push(...matches.map(match => match[1] || match[0]));
        });
        
        return [...new Set(functions)];
    }

    _extractClasses(text) {
        const classPatterns = [
            /class\s+(\w+)/gi,
            /interface\s+(\w+)/gi,
            /component\s+(\w+)/gi
        ];
        
        const classes = [];
        classPatterns.forEach(pattern => {
            const matches = [...text.matchAll(pattern)];
            classes.push(...matches.map(match => match[1]));
        });
        
        return [...new Set(classes)];
    }

    _extractAPIs(text) {
        const apiPatterns = [
            /api\s+endpoint/gi,
            /rest\s+api/gi,
            /graphql/gi,
            /\/api\/[\w\/]+/gi
        ];
        
        const apis = [];
        apiPatterns.forEach(pattern => {
            const matches = [...text.matchAll(pattern)];
            apis.push(...matches.map(match => match[0]));
        });
        
        return [...new Set(apis)];
    }

    _extractDatabases(text) {
        const dbTerms = ['database', 'table', 'collection', 'schema', 'migration'];
        return this._findMatches(text, dbTerms);
    }

    _extractServices(text) {
        const servicePattern = /(\w+)\s+service/gi;
        return [...text.matchAll(servicePattern)].map(match => match[0]);
    }

    _extractUsers(text) {
        const userTerms = ['user', 'admin', 'customer', 'client', 'stakeholder'];
        return this._findMatches(text, userTerms);
    }

    _extractActions(text) {
        return this._findMatches(text, this.actionKeywords);
    }

    // Helper methods

    _findMatches(text, terms) {
        const lowerText = text.toLowerCase();
        return terms.filter(term => lowerText.includes(term.toLowerCase()));
    }

    _containsAction(text) {
        return this.actionKeywords.some(action => 
            text.toLowerCase().includes(action)
        );
    }

    _containsTechnicalTerms(text) {
        return this.technicalKeywords.some(term => 
            text.toLowerCase().includes(term)
        );
    }

    _containsBusinessTerms(text) {
        return this.businessKeywords.some(term => 
            text.toLowerCase().includes(term)
        );
    }

    _containsPattern(text, patterns) {
        return patterns.some(pattern => text.includes(pattern));
    }

    _estimateSentenceComplexity(sentence) {
        let complexity = 1;
        
        // Length factor
        if (sentence.length > 100) complexity += 1;
        if (sentence.length > 200) complexity += 1;
        
        // Technical terms factor
        if (this._containsTechnicalTerms(sentence)) complexity += 1;
        
        // Nested clauses factor
        const commaCount = (sentence.match(/,/g) || []).length;
        complexity += Math.floor(commaCount / 2);
        
        return Math.min(5, complexity);
    }

    _extractPrimaryAction(text) {
        const actionPattern = new RegExp(`\\b(${this.actionKeywords.join('|')})\\b`, 'i');
        const match = text.match(actionPattern);
        return match ? match[1] : null;
    }

    _extractPrimaryObject(text) {
        // Simple heuristic: find noun after action
        const words = text.split(/\s+/);
        const actionIndex = words.findIndex(word => 
            this.actionKeywords.includes(word.toLowerCase())
        );
        
        if (actionIndex >= 0 && actionIndex < words.length - 1) {
            return words[actionIndex + 1];
        }
        
        return null;
    }

    // Keyword initialization methods

    _initializeTechnicalKeywords() {
        return [
            'api', 'database', 'server', 'client', 'frontend', 'backend',
            'authentication', 'authorization', 'security', 'encryption',
            'algorithm', 'optimization', 'performance', 'scalability',
            'integration', 'interface', 'component', 'service', 'module',
            'framework', 'library', 'dependency', 'configuration',
            'deployment', 'testing', 'debugging', 'logging', 'monitoring'
        ];
    }

    _initializeBusinessKeywords() {
        return [
            'user', 'customer', 'stakeholder', 'requirement', 'business',
            'workflow', 'process', 'feature', 'functionality', 'capability',
            'value', 'benefit', 'goal', 'objective', 'outcome', 'result',
            'compliance', 'regulation', 'policy', 'standard', 'guideline'
        ];
    }

    _initializeActionKeywords() {
        return [
            'implement', 'create', 'build', 'develop', 'design', 'add',
            'remove', 'delete', 'update', 'modify', 'change', 'fix',
            'enhance', 'improve', 'optimize', 'refactor', 'migrate',
            'integrate', 'configure', 'deploy', 'test', 'validate'
        ];
    }

    _initializePriorityKeywords() {
        return [
            'urgent', 'critical', 'high', 'important', 'priority',
            'asap', 'immediately', 'soon', 'later', 'optional',
            'nice', 'future', 'low', 'medium'
        ];
    }
}

