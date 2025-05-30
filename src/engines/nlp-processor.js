/**
 * @fileoverview NLP Processor
 * @description Natural Language Processing engine for analyzing requirement text,
 * extracting entities, sentiment analysis, and linguistic pattern recognition.
 */

import { log } from '../../scripts/modules/utils.js';

/**
 * NLP Processor for natural language analysis
 */
export class NLPProcessor {
    constructor() {
        this.isInitialized = false;
        this.patterns = this._initializePatterns();
        
        log('debug', 'NLP Processor created');
    }

    /**
     * Initialize the NLP processor
     */
    async initialize() {
        if (this.isInitialized) {
            return;
        }

        log('info', 'Initializing NLP Processor...');
        
        try {
            // Initialize NLP components
            this.isInitialized = true;
            log('info', 'NLP Processor initialized successfully');
        } catch (error) {
            log('error', 'Failed to initialize NLP Processor:', error);
            throw error;
        }
    }

    /**
     * Process requirement text with NLP analysis
     * @param {string} text - Text to process
     * @returns {Promise<Object>} NLP analysis results
     */
    async process(text) {
        this._ensureInitialized();
        
        log('debug', 'Processing text with NLP', { textLength: text.length });

        try {
            const analysis = {
                entities: await this.extractEntities(text),
                sentiment: await this.analyzeSentiment(text),
                keywords: await this.extractKeywords(text),
                phrases: await this.extractKeyPhrases(text),
                language: await this.detectLanguage(text),
                complexity: await this.analyzeComplexity(text),
                intent: await this.classifyIntent(text),
                topics: await this.extractTopics(text)
            };

            log('debug', 'NLP processing completed', {
                entitiesFound: analysis.entities.length,
                keywordsFound: analysis.keywords.length,
                sentiment: analysis.sentiment.label,
                language: analysis.language
            });

            return analysis;
        } catch (error) {
            log('error', 'Failed to process text with NLP:', error);
            throw error;
        }
    }

    /**
     * Extract entities from text
     * @param {string} text - Input text
     * @returns {Promise<Array>} Extracted entities
     */
    async extractEntities(text) {
        const entities = [];
        
        try {
            // Technology entities
            const techEntities = this._extractTechnologyEntities(text);
            entities.push(...techEntities);

            // Action entities
            const actionEntities = this._extractActionEntities(text);
            entities.push(...actionEntities);

            // Component entities
            const componentEntities = this._extractComponentEntities(text);
            entities.push(...componentEntities);

            // Business entities
            const businessEntities = this._extractBusinessEntities(text);
            entities.push(...businessEntities);

            return entities;
        } catch (error) {
            log('error', 'Failed to extract entities:', error);
            return [];
        }
    }

    /**
     * Analyze sentiment of the text
     * @param {string} text - Input text
     * @returns {Promise<Object>} Sentiment analysis
     */
    async analyzeSentiment(text) {
        try {
            // Simple rule-based sentiment analysis
            const positiveWords = ['good', 'great', 'excellent', 'amazing', 'perfect', 'love', 'like', 'best'];
            const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'worst', 'problem', 'issue', 'difficult'];
            const urgentWords = ['urgent', 'asap', 'immediately', 'critical', 'emergency', 'now'];

            const words = text.toLowerCase().split(/\s+/);
            
            let positiveScore = 0;
            let negativeScore = 0;
            let urgencyScore = 0;

            for (const word of words) {
                if (positiveWords.includes(word)) positiveScore++;
                if (negativeWords.includes(word)) negativeScore++;
                if (urgentWords.includes(word)) urgencyScore++;
            }

            const totalScore = positiveScore - negativeScore;
            let label = 'neutral';
            
            if (totalScore > 0) label = 'positive';
            else if (totalScore < 0) label = 'negative';

            return {
                label,
                score: totalScore,
                confidence: Math.min(Math.abs(totalScore) / words.length * 10, 1),
                urgency: urgencyScore > 0 ? 'high' : 'normal',
                details: {
                    positive: positiveScore,
                    negative: negativeScore,
                    urgency: urgencyScore
                }
            };
        } catch (error) {
            log('error', 'Failed to analyze sentiment:', error);
            return { label: 'neutral', score: 0, confidence: 0, urgency: 'normal' };
        }
    }

    /**
     * Extract keywords from text
     * @param {string} text - Input text
     * @returns {Promise<Array>} Extracted keywords
     */
    async extractKeywords(text) {
        try {
            // Remove common stop words
            const stopWords = new Set([
                'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
                'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
                'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must', 'shall',
                'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
                'this', 'that', 'these', 'those', 'here', 'there', 'where', 'when', 'why', 'how'
            ]);

            const words = text.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 2 && !stopWords.has(word));

            // Count word frequency
            const wordCount = {};
            for (const word of words) {
                wordCount[word] = (wordCount[word] || 0) + 1;
            }

            // Sort by frequency and return top keywords
            const keywords = Object.entries(wordCount)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 20)
                .map(([word, count]) => ({
                    word,
                    frequency: count,
                    relevance: count / words.length
                }));

            return keywords;
        } catch (error) {
            log('error', 'Failed to extract keywords:', error);
            return [];
        }
    }

    /**
     * Extract key phrases from text
     * @param {string} text - Input text
     * @returns {Promise<Array>} Key phrases
     */
    async extractKeyPhrases(text) {
        try {
            const phrases = [];
            
            // Extract noun phrases (simple pattern matching)
            const nounPhrasePattern = /\b(?:(?:the|a|an)\s+)?(?:\w+\s+)*(?:system|component|feature|module|service|api|database|interface|application|platform|framework|library|tool|function|method|class|object)\b/gi;
            const nounPhrases = text.match(nounPhrasePattern) || [];
            
            for (const phrase of nounPhrases) {
                phrases.push({
                    text: phrase.trim(),
                    type: 'noun_phrase',
                    confidence: 0.8
                });
            }

            // Extract action phrases
            const actionPhrasePattern = /\b(?:implement|create|build|develop|design|add|remove|update|modify|integrate|configure|setup|deploy|test|validate)\s+(?:\w+\s+)*\w+/gi;
            const actionPhrases = text.match(actionPhrasePattern) || [];
            
            for (const phrase of actionPhrases) {
                phrases.push({
                    text: phrase.trim(),
                    type: 'action_phrase',
                    confidence: 0.9
                });
            }

            return phrases.slice(0, 15); // Limit to top 15 phrases
        } catch (error) {
            log('error', 'Failed to extract key phrases:', error);
            return [];
        }
    }

    /**
     * Detect language of the text
     * @param {string} text - Input text
     * @returns {Promise<string>} Detected language
     */
    async detectLanguage(text) {
        try {
            // Simple language detection based on common words
            const englishWords = ['the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'have', 'has', 'will', 'would'];
            const words = text.toLowerCase().split(/\s+/);
            
            const englishWordCount = words.filter(word => englishWords.includes(word)).length;
            const englishRatio = englishWordCount / words.length;
            
            if (englishRatio > 0.1) {
                return 'en';
            }
            
            return 'unknown';
        } catch (error) {
            log('error', 'Failed to detect language:', error);
            return 'unknown';
        }
    }

    /**
     * Analyze text complexity
     * @param {string} text - Input text
     * @returns {Promise<Object>} Complexity analysis
     */
    async analyzeComplexity(text) {
        try {
            const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const words = text.split(/\s+/).filter(w => w.length > 0);
            const avgWordsPerSentence = words.length / sentences.length;
            const avgCharsPerWord = text.replace(/\s/g, '').length / words.length;
            
            // Technical complexity indicators
            const technicalTerms = this._countTechnicalTerms(text);
            const complexSentences = sentences.filter(s => s.split(/\s+/).length > 20).length;
            
            let complexityScore = 0;
            
            // Sentence length complexity
            if (avgWordsPerSentence > 20) complexityScore += 2;
            else if (avgWordsPerSentence > 15) complexityScore += 1;
            
            // Word length complexity
            if (avgCharsPerWord > 6) complexityScore += 1;
            
            // Technical terms complexity
            complexityScore += Math.min(technicalTerms / 5, 3);
            
            // Complex sentences
            complexityScore += Math.min(complexSentences / 2, 2);
            
            const level = complexityScore < 3 ? 'low' : 
                         complexityScore < 6 ? 'medium' : 'high';

            return {
                level,
                score: complexityScore,
                metrics: {
                    sentences: sentences.length,
                    words: words.length,
                    avgWordsPerSentence: Math.round(avgWordsPerSentence * 10) / 10,
                    avgCharsPerWord: Math.round(avgCharsPerWord * 10) / 10,
                    technicalTerms,
                    complexSentences
                }
            };
        } catch (error) {
            log('error', 'Failed to analyze complexity:', error);
            return { level: 'medium', score: 3, metrics: {} };
        }
    }

    /**
     * Classify intent of the text
     * @param {string} text - Input text
     * @returns {Promise<Object>} Intent classification
     */
    async classifyIntent(text) {
        try {
            const intents = {
                'feature_request': ['implement', 'create', 'add', 'build', 'develop', 'feature', 'functionality'],
                'bug_fix': ['fix', 'bug', 'error', 'issue', 'problem', 'broken', 'not working'],
                'improvement': ['improve', 'enhance', 'optimize', 'better', 'upgrade', 'refactor'],
                'question': ['how', 'what', 'why', 'when', 'where', 'can you', 'is it possible'],
                'documentation': ['document', 'documentation', 'readme', 'guide', 'manual', 'explain'],
                'testing': ['test', 'testing', 'verify', 'validate', 'check', 'ensure'],
                'deployment': ['deploy', 'deployment', 'release', 'publish', 'production', 'live']
            };

            const textLower = text.toLowerCase();
            const scores = {};

            for (const [intent, keywords] of Object.entries(intents)) {
                let score = 0;
                for (const keyword of keywords) {
                    if (textLower.includes(keyword)) {
                        score += 1;
                    }
                }
                scores[intent] = score;
            }

            const topIntent = Object.entries(scores)
                .sort(([,a], [,b]) => b - a)[0];

            return {
                intent: topIntent[1] > 0 ? topIntent[0] : 'general',
                confidence: Math.min(topIntent[1] / 3, 1),
                scores
            };
        } catch (error) {
            log('error', 'Failed to classify intent:', error);
            return { intent: 'general', confidence: 0, scores: {} };
        }
    }

    /**
     * Extract topics from text
     * @param {string} text - Input text
     * @returns {Promise<Array>} Extracted topics
     */
    async extractTopics(text) {
        try {
            const topics = [];
            const textLower = text.toLowerCase();

            const topicKeywords = {
                'frontend': ['ui', 'interface', 'frontend', 'react', 'vue', 'angular', 'html', 'css', 'javascript'],
                'backend': ['backend', 'server', 'api', 'database', 'service', 'microservice', 'node.js', 'python'],
                'database': ['database', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'data', 'storage'],
                'security': ['security', 'authentication', 'authorization', 'encryption', 'ssl', 'https', 'token'],
                'performance': ['performance', 'optimization', 'speed', 'fast', 'cache', 'benchmark', 'scalability'],
                'testing': ['test', 'testing', 'unit test', 'integration test', 'qa', 'quality assurance'],
                'deployment': ['deployment', 'ci/cd', 'docker', 'kubernetes', 'aws', 'cloud', 'production'],
                'mobile': ['mobile', 'ios', 'android', 'react native', 'flutter', 'app', 'smartphone']
            };

            for (const [topic, keywords] of Object.entries(topicKeywords)) {
                let score = 0;
                for (const keyword of keywords) {
                    if (textLower.includes(keyword)) {
                        score += 1;
                    }
                }
                
                if (score > 0) {
                    topics.push({
                        topic,
                        relevance: Math.min(score / keywords.length, 1),
                        mentions: score
                    });
                }
            }

            return topics.sort((a, b) => b.relevance - a.relevance);
        } catch (error) {
            log('error', 'Failed to extract topics:', error);
            return [];
        }
    }

    /**
     * Extract technology entities
     * @param {string} text - Input text
     * @returns {Array} Technology entities
     * @private
     */
    _extractTechnologyEntities(text) {
        const entities = [];
        const techPatterns = this.patterns.technology;
        
        for (const [category, patterns] of Object.entries(techPatterns)) {
            for (const pattern of patterns) {
                const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
                const matches = text.match(regex) || [];
                
                for (const match of matches) {
                    entities.push({
                        text: match,
                        type: 'technology',
                        category: category,
                        confidence: 0.9
                    });
                }
            }
        }
        
        return entities;
    }

    /**
     * Extract action entities
     * @param {string} text - Input text
     * @returns {Array} Action entities
     * @private
     */
    _extractActionEntities(text) {
        const entities = [];
        const actionPatterns = this.patterns.actions;
        
        for (const pattern of actionPatterns) {
            const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
            const matches = text.match(regex) || [];
            
            for (const match of matches) {
                entities.push({
                    text: match,
                    type: 'action',
                    confidence: 0.8
                });
            }
        }
        
        return entities;
    }

    /**
     * Extract component entities
     * @param {string} text - Input text
     * @returns {Array} Component entities
     * @private
     */
    _extractComponentEntities(text) {
        const entities = [];
        const componentPatterns = this.patterns.components;
        
        for (const pattern of componentPatterns) {
            const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
            const matches = text.match(regex) || [];
            
            for (const match of matches) {
                entities.push({
                    text: match,
                    type: 'component',
                    confidence: 0.7
                });
            }
        }
        
        return entities;
    }

    /**
     * Extract business entities
     * @param {string} text - Input text
     * @returns {Array} Business entities
     * @private
     */
    _extractBusinessEntities(text) {
        const entities = [];
        const businessPatterns = this.patterns.business;
        
        for (const pattern of businessPatterns) {
            const regex = new RegExp(`\\b${pattern}\\b`, 'gi');
            const matches = text.match(regex) || [];
            
            for (const match of matches) {
                entities.push({
                    text: match,
                    type: 'business',
                    confidence: 0.6
                });
            }
        }
        
        return entities;
    }

    /**
     * Count technical terms in text
     * @param {string} text - Input text
     * @returns {number} Count of technical terms
     * @private
     */
    _countTechnicalTerms(text) {
        const technicalTerms = [
            'api', 'database', 'framework', 'library', 'algorithm', 'architecture',
            'microservice', 'authentication', 'authorization', 'encryption', 'optimization',
            'scalability', 'performance', 'integration', 'deployment', 'configuration'
        ];
        
        const textLower = text.toLowerCase();
        return technicalTerms.filter(term => textLower.includes(term)).length;
    }

    /**
     * Initialize patterns for entity extraction
     * @returns {Object} Pattern definitions
     * @private
     */
    _initializePatterns() {
        return {
            technology: {
                languages: ['javascript', 'typescript', 'python', 'java', 'go', 'rust', 'c\\+\\+', 'c#'],
                frameworks: ['react', 'vue', 'angular', 'express', 'fastapi', 'django', 'spring', 'laravel'],
                databases: ['postgresql', 'mysql', 'mongodb', 'redis', 'elasticsearch', 'sqlite'],
                cloud: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform']
            },
            actions: [
                'implement', 'create', 'build', 'develop', 'design', 'add', 'remove', 'update',
                'modify', 'integrate', 'configure', 'setup', 'deploy', 'test', 'validate',
                'optimize', 'refactor', 'migrate', 'upgrade', 'install'
            ],
            components: [
                'component', 'module', 'service', 'class', 'function', 'method', 'interface',
                'controller', 'model', 'view', 'router', 'middleware', 'plugin', 'widget'
            ],
            business: [
                'user', 'customer', 'admin', 'role', 'permission', 'workflow', 'process',
                'business logic', 'requirement', 'feature', 'functionality', 'use case'
            ]
        };
    }

    /**
     * Ensure processor is initialized
     * @private
     */
    _ensureInitialized() {
        if (!this.isInitialized) {
            throw new Error('NLP Processor not initialized. Call initialize() first.');
        }
    }

    /**
     * Get processor statistics
     * @returns {Object} Statistics
     */
    getStatistics() {
        return {
            isInitialized: this.isInitialized,
            patternsLoaded: Object.keys(this.patterns).length
        };
    }
}

export default NLPProcessor;

