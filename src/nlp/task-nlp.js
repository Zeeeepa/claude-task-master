/**
 * Natural Language Processing for Task Understanding
 * Processes natural language requirements and converts them to actionable tasks
 */

import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

/**
 * Task NLP - Natural Language Processing for task understanding
 */
export class TaskNLP {
  constructor(options = {}) {
    this.options = {
      provider: 'anthropic', // anthropic, openai
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 4000,
      temperature: 0.1,
      enableCaching: true,
      ...options
    };

    this.provider = this._initializeProvider();
    this.cache = new Map();
    
    // Task classification patterns
    this.taskPatterns = {
      implementation: /implement|create|build|develop|code|write/i,
      testing: /test|verify|validate|check|ensure/i,
      documentation: /document|readme|guide|explain/i,
      bugfix: /fix|bug|error|issue|problem/i,
      refactor: /refactor|improve|optimize|clean/i,
      integration: /integrate|connect|link|api/i,
      deployment: /deploy|release|publish|launch/i,
      configuration: /config|setup|install|configure/i
    };

    // Dependency keywords
    this.dependencyKeywords = [
      'after', 'before', 'requires', 'depends on', 'needs', 'prerequisite',
      'first', 'then', 'next', 'following', 'prior to', 'once'
    ];
  }

  /**
   * Parse natural language requirements into actionable items
   * @param {string} description - Natural language task description
   * @param {Object} context - Additional context for parsing
   */
  async parseRequirements(description, context = {}) {
    try {
      const cacheKey = this._getCacheKey('parse', description, context);
      if (this.options.enableCaching && this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const prompt = this._buildParsingPrompt(description, context);
      const response = await generateText({
        model: this.provider,
        prompt,
        maxTokens: this.options.maxTokens,
        temperature: this.options.temperature
      });

      const result = this._parseNLPResponse(response.text);
      
      if (this.options.enableCaching) {
        this.cache.set(cacheKey, result);
      }

      return result;
      
    } catch (error) {
      console.error('❌ NLP parsing error:', error);
      return this._fallbackParsing(description);
    }
  }

  /**
   * Identify dependencies between tasks
   * @param {Array} tasks - Array of task objects
   */
  async identifyDependencies(tasks) {
    try {
      const cacheKey = this._getCacheKey('dependencies', tasks);
      if (this.options.enableCaching && this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const prompt = this._buildDependencyPrompt(tasks);
      const response = await generateText({
        model: this.provider,
        prompt,
        maxTokens: this.options.maxTokens,
        temperature: this.options.temperature
      });

      const dependencies = this._parseDependencyResponse(response.text);
      
      if (this.options.enableCaching) {
        this.cache.set(cacheKey, dependencies);
      }

      return dependencies;
      
    } catch (error) {
      console.error('❌ Dependency identification error:', error);
      return this._fallbackDependencyDetection(tasks);
    }
  }

  /**
   * Generate instructions for coding agents
   * @param {Object} task - Task object
   * @param {Object} context - Additional context
   */
  async generateInstructions(task, context = {}) {
    try {
      const cacheKey = this._getCacheKey('instructions', task, context);
      if (this.options.enableCaching && this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }

      const prompt = this._buildInstructionPrompt(task, context);
      const response = await generateText({
        model: this.provider,
        prompt,
        maxTokens: this.options.maxTokens,
        temperature: this.options.temperature
      });

      const instructions = this._parseInstructionResponse(response.text);
      
      if (this.options.enableCaching) {
        this.cache.set(cacheKey, instructions);
      }

      return instructions;
      
    } catch (error) {
      console.error('❌ Instruction generation error:', error);
      return this._fallbackInstructions(task);
    }
  }

  /**
   * Validate task completion against requirements
   * @param {Object} task - Original task
   * @param {Object} result - Execution result
   */
  async validateCompletion(task, result) {
    try {
      const prompt = this._buildValidationPrompt(task, result);
      const response = await generateText({
        model: this.provider,
        prompt,
        maxTokens: this.options.maxTokens,
        temperature: this.options.temperature
      });

      return this._parseValidationResponse(response.text);
      
    } catch (error) {
      console.error('❌ Validation error:', error);
      return { valid: false, confidence: 0, issues: ['Validation failed'] };
    }
  }

  /**
   * Decompose complex task into atomic subtasks
   * @param {Array} actionableItems - Items from NLP parsing
   * @param {Object} originalTask - Original task context
   */
  async decomposeTask(actionableItems, originalTask) {
    try {
      const prompt = this._buildDecompositionPrompt(actionableItems, originalTask);
      const response = await generateText({
        model: this.provider,
        prompt,
        maxTokens: this.options.maxTokens,
        temperature: this.options.temperature
      });

      return this._parseDecompositionResponse(response.text);
      
    } catch (error) {
      console.error('❌ Task decomposition error:', error);
      return this._fallbackDecomposition(actionableItems);
    }
  }

  /**
   * Extract task metadata and classification
   * @param {string} description - Task description
   */
  extractTaskMetadata(description) {
    const metadata = {
      type: 'general',
      priority: 'medium',
      complexity: 'medium',
      estimatedTime: '2-4 hours',
      tags: [],
      technologies: []
    };

    // Classify task type
    for (const [type, pattern] of Object.entries(this.taskPatterns)) {
      if (pattern.test(description)) {
        metadata.type = type;
        metadata.tags.push(type);
        break;
      }
    }

    // Extract technologies
    const techPatterns = {
      javascript: /javascript|js|node|npm|yarn/i,
      python: /python|pip|django|flask/i,
      react: /react|jsx|tsx/i,
      database: /database|sql|postgres|mysql|mongodb/i,
      api: /api|rest|graphql|endpoint/i,
      docker: /docker|container|kubernetes/i,
      aws: /aws|amazon|s3|ec2|lambda/i,
      git: /git|github|gitlab|version control/i
    };

    for (const [tech, pattern] of Object.entries(techPatterns)) {
      if (pattern.test(description)) {
        metadata.technologies.push(tech);
      }
    }

    // Estimate complexity based on keywords
    const complexityIndicators = {
      high: /complex|advanced|sophisticated|enterprise|scalable|distributed/i,
      low: /simple|basic|quick|small|minor/i
    };

    for (const [level, pattern] of Object.entries(complexityIndicators)) {
      if (pattern.test(description)) {
        metadata.complexity = level;
        break;
      }
    }

    return metadata;
  }

  /**
   * Private: Initialize AI provider
   */
  _initializeProvider() {
    switch (this.options.provider) {
      case 'anthropic':
        return createAnthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        })(this.options.model);
      case 'openai':
        return createOpenAI({
          apiKey: process.env.OPENAI_API_KEY
        })(this.options.model);
      default:
        throw new Error(`Unsupported provider: ${this.options.provider}`);
    }
  }

  /**
   * Private: Build parsing prompt
   */
  _buildParsingPrompt(description, context) {
    return `You are an expert software development task analyzer. Parse the following task description and extract actionable items.

Task Description:
${description}

Context:
${JSON.stringify(context, null, 2)}

Please analyze this task and provide a JSON response with the following structure:
{
  "actionableItems": [
    {
      "id": "unique_id",
      "title": "Clear, specific title",
      "description": "Detailed description",
      "type": "implementation|testing|documentation|bugfix|refactor|integration|deployment|configuration",
      "priority": "high|medium|low",
      "estimatedTime": "time estimate",
      "dependencies": ["list of dependency IDs"],
      "acceptanceCriteria": ["list of criteria"]
    }
  ],
  "dependencies": [
    {
      "from": "task_id",
      "to": "dependency_id",
      "type": "hard|soft",
      "reason": "explanation"
    }
  ],
  "metadata": {
    "complexity": "high|medium|low",
    "technologies": ["list of technologies"],
    "riskFactors": ["list of risks"]
  }
}

Focus on creating atomic, executable tasks that can be assigned to coding agents.`;
  }

  /**
   * Private: Build dependency identification prompt
   */
  _buildDependencyPrompt(tasks) {
    return `Analyze the following tasks and identify dependencies between them.

Tasks:
${JSON.stringify(tasks, null, 2)}

Return a JSON array of dependencies:
[
  {
    "from": "task_id",
    "to": "dependency_id", 
    "type": "hard|soft",
    "reason": "explanation"
  }
]

Consider logical dependencies, technical prerequisites, and optimal execution order.`;
  }

  /**
   * Private: Build instruction generation prompt
   */
  _buildInstructionPrompt(task, context) {
    return `Generate detailed instructions for a coding agent to complete this task.

Task:
${JSON.stringify(task, null, 2)}

Context:
${JSON.stringify(context, null, 2)}

Provide clear, step-by-step instructions that include:
1. Setup requirements
2. Implementation steps
3. Testing approach
4. Acceptance criteria
5. Potential challenges and solutions

Format as JSON:
{
  "instructions": "detailed step-by-step instructions",
  "setup": ["setup requirements"],
  "implementation": ["implementation steps"],
  "testing": ["testing approach"],
  "deliverables": ["expected outputs"],
  "challenges": ["potential issues and solutions"]
}`;
  }

  /**
   * Private: Build validation prompt
   */
  _buildValidationPrompt(task, result) {
    return `Validate if the execution result meets the task requirements.

Original Task:
${JSON.stringify(task, null, 2)}

Execution Result:
${JSON.stringify(result, null, 2)}

Provide validation assessment as JSON:
{
  "valid": true|false,
  "confidence": 0-100,
  "completedCriteria": ["list of met criteria"],
  "missingCriteria": ["list of unmet criteria"],
  "issues": ["list of issues found"],
  "recommendations": ["suggestions for improvement"]
}`;
  }

  /**
   * Private: Build decomposition prompt
   */
  _buildDecompositionPrompt(actionableItems, originalTask) {
    return `Decompose these actionable items into atomic, executable subtasks.

Actionable Items:
${JSON.stringify(actionableItems, null, 2)}

Original Task Context:
${JSON.stringify(originalTask, null, 2)}

Create atomic subtasks that:
1. Can be completed independently
2. Have clear success criteria
3. Take 1-4 hours each
4. Can be assigned to different agents

Return as JSON array of atomic tasks with dependencies.`;
  }

  /**
   * Private: Parse NLP response
   */
  _parseNLPResponse(responseText) {
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      console.error('Failed to parse NLP response:', error);
      return this._fallbackParsing(responseText);
    }
  }

  /**
   * Private: Parse dependency response
   */
  _parseDependencyResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      console.error('Failed to parse dependency response:', error);
      return [];
    }
  }

  /**
   * Private: Parse instruction response
   */
  _parseInstructionResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      return this._fallbackInstructions();
    }
  }

  /**
   * Private: Parse validation response
   */
  _parseValidationResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      return { valid: false, confidence: 0, issues: ['Validation parsing failed'] };
    }
  }

  /**
   * Private: Parse decomposition response
   */
  _parseDecompositionResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return [];
    } catch (error) {
      console.error('Failed to parse decomposition response:', error);
      return [];
    }
  }

  /**
   * Private: Fallback parsing when NLP fails
   */
  _fallbackParsing(description) {
    const metadata = this.extractTaskMetadata(description);
    
    return {
      actionableItems: [{
        id: 'fallback_1',
        title: 'Complete Task',
        description: description,
        type: metadata.type,
        priority: metadata.priority,
        estimatedTime: metadata.estimatedTime,
        dependencies: [],
        acceptanceCriteria: ['Task completed successfully']
      }],
      dependencies: [],
      metadata
    };
  }

  /**
   * Private: Fallback dependency detection
   */
  _fallbackDependencyDetection(tasks) {
    const dependencies = [];
    
    // Simple heuristic: look for dependency keywords
    tasks.forEach((task, index) => {
      this.dependencyKeywords.forEach(keyword => {
        if (task.description?.toLowerCase().includes(keyword)) {
          // Create dependency to previous task if exists
          if (index > 0) {
            dependencies.push({
              from: task.id,
              to: tasks[index - 1].id,
              type: 'soft',
              reason: `Contains dependency keyword: ${keyword}`
            });
          }
        }
      });
    });
    
    return dependencies;
  }

  /**
   * Private: Fallback instructions
   */
  _fallbackInstructions(task) {
    return {
      instructions: `Complete the task: ${task?.title || 'Unknown task'}`,
      setup: ['Review task requirements'],
      implementation: ['Implement the required functionality'],
      testing: ['Test the implementation'],
      deliverables: ['Working implementation'],
      challenges: ['Ensure requirements are met']
    };
  }

  /**
   * Private: Fallback decomposition
   */
  _fallbackDecomposition(actionableItems) {
    return actionableItems.map((item, index) => ({
      ...item,
      id: `atomic_${index + 1}`,
      atomic: true
    }));
  }

  /**
   * Private: Generate cache key
   */
  _getCacheKey(operation, ...args) {
    const content = JSON.stringify(args);
    return `${operation}_${Buffer.from(content).toString('base64').slice(0, 32)}`;
  }

  /**
   * Clear NLP cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: 1000 // Could be configurable
    };
  }
}

export default TaskNLP;

