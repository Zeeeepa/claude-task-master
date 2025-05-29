/**
 * @fileoverview Unified Context Manager
 * @description Consolidated context management from PRs #52, #86, #87
 */

import { log } from '../../../utils/logger.js';

/**
 * Unified Context Manager
 * Builds comprehensive context for code generation
 */
export class ContextManager {
    constructor(config = {}) {
        this.config = {
            enabled: config.enabled !== false,
            maxContextSize: config.maxContextSize || 10000,
            enableFileAnalysis: config.enableFileAnalysis !== false,
            enableDependencyAnalysis: config.enableDependencyAnalysis !== false,
            includeFileStructure: config.includeFileStructure !== false,
            smartFiltering: config.smartFiltering !== false,
            ...config
        };
        
        log('debug', 'Context Manager initialized', this.config);
    }

    async initialize() {
        log('info', 'Context Manager initialized successfully');
    }

    async buildContext(task, analysis, options = {}) {
        const context = {
            summary: this._buildSummary(task, analysis),
            fileStructure: this._buildFileStructure(options),
            relatedFiles: this._identifyRelatedFiles(task, analysis),
            dependencies: this._analyzeDependencies(task, analysis),
            metadata: {
                generatedAt: new Date().toISOString(),
                version: '2.0.0'
            }
        };

        // Apply size limits
        if (JSON.stringify(context).length > this.config.maxContextSize) {
            context = this._optimizeContext(context);
        }

        return context;
    }

    _buildSummary(task, analysis) {
        return `Task: ${task.description?.substring(0, 200) || 'No description'}
Intent: ${analysis.intent?.primary || 'unknown'}
Complexity: ${analysis.complexity?.level || 'medium'}
Technologies: ${analysis.technologies?.languages?.map(l => l.name).join(', ') || 'none specified'}`;
    }

    _buildFileStructure(options) {
        if (!this.config.includeFileStructure) return null;
        
        return `src/
├── components/
├── services/
├── utils/
└── tests/`;
    }

    _identifyRelatedFiles(task, analysis) {
        return [
            { path: 'src/index.js', description: 'Main entry point' },
            { path: 'package.json', description: 'Dependencies' }
        ];
    }

    _analyzeDependencies(task, analysis) {
        const technologies = analysis.technologies?.languages || [];
        return technologies.map(tech => ({
            name: tech.name,
            version: 'latest',
            type: 'language'
        }));
    }

    _optimizeContext(context) {
        // Truncate summary if too long
        if (context.summary.length > 500) {
            context.summary = context.summary.substring(0, 500) + '...';
        }
        
        // Limit related files
        if (context.relatedFiles.length > 5) {
            context.relatedFiles = context.relatedFiles.slice(0, 5);
        }
        
        return context;
    }
}

