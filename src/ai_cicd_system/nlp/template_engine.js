/**
 * @fileoverview Generate Code Templates and Structures
 * @description Advanced template generation for code scaffolding and structure creation
 */

import { log } from '../utils/simple_logger.js';

/**
 * Template Engine for generating code templates and structures
 */
export class TemplateEngine {
  constructor(config = {}) {
    this.config = {
      enableAdvancedTemplates: config.enableAdvancedTemplates !== false,
      includeComments: config.includeComments !== false,
      includeTypeAnnotations: config.includeTypeAnnotations !== false,
      templateStyle: config.templateStyle || 'modern',
      indentSize: config.indentSize || 2
    };
    
    // Language-specific templates
    this.languageTemplates = {
      javascript: {
        function: this._getJavaScriptFunctionTemplate(),
        class: this._getJavaScriptClassTemplate(),
        module: this._getJavaScriptModuleTemplate(),
        component: this._getJavaScriptComponentTemplate(),
        test: this._getJavaScriptTestTemplate()
      },
      typescript: {
        function: this._getTypeScriptFunctionTemplate(),
        class: this._getTypeScriptClassTemplate(),
        interface: this._getTypeScriptInterfaceTemplate(),
        module: this._getTypeScriptModuleTemplate(),
        component: this._getTypeScriptComponentTemplate(),
        test: this._getTypeScriptTestTemplate()
      },
      python: {
        function: this._getPythonFunctionTemplate(),
        class: this._getPythonClassTemplate(),
        module: this._getPythonModuleTemplate(),
        test: this._getPythonTestTemplate()
      },
      java: {
        class: this._getJavaClassTemplate(),
        interface: this._getJavaInterfaceTemplate(),
        method: this._getJavaMethodTemplate(),
        test: this._getJavaTestTemplate()
      }
    };
    
    // Framework-specific templates
    this.frameworkTemplates = {
      react: {
        component: this._getReactComponentTemplate(),
        hook: this._getReactHookTemplate(),
        context: this._getReactContextTemplate(),
        test: this._getReactTestTemplate()
      },
      express: {
        route: this._getExpressRouteTemplate(),
        middleware: this._getExpressMiddlewareTemplate(),
        controller: this._getExpressControllerTemplate(),
        test: this._getExpressTestTemplate()
      },
      fastapi: {
        route: this._getFastAPIRouteTemplate(),
        model: this._getFastAPIModelTemplate(),
        service: this._getFastAPIServiceTemplate(),
        test: this._getFastAPITestTemplate()
      }
    };
    
    // Project structure templates
    this.projectTemplates = {
      web_app: this._getWebAppStructure(),
      api_service: this._getAPIServiceStructure(),
      library: this._getLibraryStructure(),
      microservice: this._getMicroserviceStructure()
    };
    
    log('debug', 'TemplateEngine initialized', { config: this.config });
  }

  /**
   * Generate template based on intent analysis
   * @param {Object} intentAnalysis - Intent analysis result
   * @param {Object} options - Template options
   * @returns {Promise<Object>} Generated template
   */
  async generateTemplate(intentAnalysis, options = {}) {
    try {
      log('info', `Generating template for ${intentAnalysis.primary_intent.intent} intent`);
      
      const template = {
        type: this._determineTemplateType(intentAnalysis),
        language: options.language || this._inferLanguage(intentAnalysis),
        framework: options.framework || this._inferFramework(intentAnalysis),
        structure: null,
        files: [],
        metadata: {
          generatedAt: new Date().toISOString(),
          intent: intentAnalysis.primary_intent.intent,
          complexity: intentAnalysis.complexity.level,
          templateEngine: 'v1.0'
        }
      };
      
      // Generate appropriate template based on type
      switch (template.type) {
        case 'function':
          template.structure = await this._generateFunctionTemplate(intentAnalysis, template);
          break;
        case 'class':
          template.structure = await this._generateClassTemplate(intentAnalysis, template);
          break;
        case 'component':
          template.structure = await this._generateComponentTemplate(intentAnalysis, template);
          break;
        case 'module':
          template.structure = await this._generateModuleTemplate(intentAnalysis, template);
          break;
        case 'project':
          template.structure = await this._generateProjectTemplate(intentAnalysis, template);
          break;
        default:
          template.structure = await this._generateGenericTemplate(intentAnalysis, template);
      }
      
      // Generate file structure
      template.files = await this._generateFileStructure(intentAnalysis, template);
      
      log('info', `Template generated successfully`, {
        type: template.type,
        language: template.language,
        files: template.files.length
      });
      
      return template;
      
    } catch (error) {
      log('error', `Template generation failed: ${error.message}`);
      throw new Error(`Template generation failed: ${error.message}`);
    }
  }

  /**
   * Generate function template
   * @param {Object} intentAnalysis - Intent analysis
   * @param {Object} template - Template context
   * @returns {Promise<Object>} Function template
   * @private
   */
  async _generateFunctionTemplate(intentAnalysis, template) {
    const functionName = this._extractFunctionName(intentAnalysis);
    const parameters = this._extractParameters(intentAnalysis);
    const returnType = this._inferReturnType(intentAnalysis);
    
    const langTemplate = this.languageTemplates[template.language]?.function;
    if (!langTemplate) {
      throw new Error(`No function template for language: ${template.language}`);
    }
    
    return {
      name: functionName,
      parameters,
      returnType,
      description: intentAnalysis.primary_intent.matched_text,
      complexity: intentAnalysis.complexity.level,
      template: langTemplate({
        name: functionName,
        parameters,
        returnType,
        description: intentAnalysis.primary_intent.matched_text,
        includeComments: this.config.includeComments,
        includeTypes: this.config.includeTypeAnnotations
      })
    };
  }

  /**
   * Generate class template
   * @param {Object} intentAnalysis - Intent analysis
   * @param {Object} template - Template context
   * @returns {Promise<Object>} Class template
   * @private
   */
  async _generateClassTemplate(intentAnalysis, template) {
    const className = this._extractClassName(intentAnalysis);
    const methods = this._extractMethods(intentAnalysis);
    const properties = this._extractProperties(intentAnalysis);
    
    const langTemplate = this.languageTemplates[template.language]?.class;
    if (!langTemplate) {
      throw new Error(`No class template for language: ${template.language}`);
    }
    
    return {
      name: className,
      methods,
      properties,
      description: intentAnalysis.primary_intent.matched_text,
      template: langTemplate({
        name: className,
        methods,
        properties,
        description: intentAnalysis.primary_intent.matched_text,
        includeComments: this.config.includeComments,
        includeTypes: this.config.includeTypeAnnotations
      })
    };
  }

  /**
   * Generate component template
   * @param {Object} intentAnalysis - Intent analysis
   * @param {Object} template - Template context
   * @returns {Promise<Object>} Component template
   * @private
   */
  async _generateComponentTemplate(intentAnalysis, template) {
    const componentName = this._extractComponentName(intentAnalysis);
    const props = this._extractProps(intentAnalysis);
    const state = this._extractState(intentAnalysis);
    
    const frameworkTemplate = this.frameworkTemplates[template.framework]?.component;
    if (!frameworkTemplate) {
      throw new Error(`No component template for framework: ${template.framework}`);
    }
    
    return {
      name: componentName,
      props,
      state,
      description: intentAnalysis.primary_intent.matched_text,
      template: frameworkTemplate({
        name: componentName,
        props,
        state,
        description: intentAnalysis.primary_intent.matched_text,
        includeComments: this.config.includeComments,
        includeTypes: this.config.includeTypeAnnotations
      })
    };
  }

  /**
   * Generate module template
   * @param {Object} intentAnalysis - Intent analysis
   * @param {Object} template - Template context
   * @returns {Promise<Object>} Module template
   * @private
   */
  async _generateModuleTemplate(intentAnalysis, template) {
    const moduleName = this._extractModuleName(intentAnalysis);
    const exports = this._extractExports(intentAnalysis);
    const dependencies = this._extractDependencies(intentAnalysis);
    
    const langTemplate = this.languageTemplates[template.language]?.module;
    if (!langTemplate) {
      throw new Error(`No module template for language: ${template.language}`);
    }
    
    return {
      name: moduleName,
      exports,
      dependencies,
      description: intentAnalysis.primary_intent.matched_text,
      template: langTemplate({
        name: moduleName,
        exports,
        dependencies,
        description: intentAnalysis.primary_intent.matched_text,
        includeComments: this.config.includeComments
      })
    };
  }

  /**
   * Generate project template
   * @param {Object} intentAnalysis - Intent analysis
   * @param {Object} template - Template context
   * @returns {Promise<Object>} Project template
   * @private
   */
  async _generateProjectTemplate(intentAnalysis, template) {
    const projectType = this._determineProjectType(intentAnalysis);
    const projectTemplate = this.projectTemplates[projectType];
    
    if (!projectTemplate) {
      throw new Error(`No project template for type: ${projectType}`);
    }
    
    return {
      type: projectType,
      structure: projectTemplate,
      description: intentAnalysis.primary_intent.matched_text,
      language: template.language,
      framework: template.framework
    };
  }

  /**
   * Generate generic template
   * @param {Object} intentAnalysis - Intent analysis
   * @param {Object} template - Template context
   * @returns {Promise<Object>} Generic template
   * @private
   */
  async _generateGenericTemplate(intentAnalysis, template) {
    return {
      type: 'generic',
      description: intentAnalysis.primary_intent.matched_text,
      suggestions: this._generateSuggestions(intentAnalysis),
      template: this._getGenericTemplate(intentAnalysis, template)
    };
  }

  /**
   * Generate file structure
   * @param {Object} intentAnalysis - Intent analysis
   * @param {Object} template - Template context
   * @returns {Promise<Array>} File structure
   * @private
   */
  async _generateFileStructure(intentAnalysis, template) {
    const files = [];
    
    // Main implementation file
    const mainFile = this._generateMainFile(intentAnalysis, template);
    files.push(mainFile);
    
    // Test file if testing is mentioned
    if (this._shouldIncludeTests(intentAnalysis)) {
      const testFile = this._generateTestFile(intentAnalysis, template);
      files.push(testFile);
    }
    
    // Documentation file for complex projects
    if (intentAnalysis.complexity.level === 'complex') {
      const docFile = this._generateDocumentationFile(intentAnalysis, template);
      files.push(docFile);
    }
    
    // Configuration files if needed
    const configFiles = this._generateConfigFiles(intentAnalysis, template);
    files.push(...configFiles);
    
    return files;
  }

  // Template determination methods

  /**
   * Determine template type
   * @param {Object} intentAnalysis - Intent analysis
   * @returns {string} Template type
   * @private
   */
  _determineTemplateType(intentAnalysis) {
    const artifacts = intentAnalysis.artifacts;
    
    if (artifacts.some(a => a.type === 'class')) return 'class';
    if (artifacts.some(a => a.type === 'component')) return 'component';
    if (artifacts.some(a => a.type === 'module')) return 'module';
    if (artifacts.some(a => a.type === 'function')) return 'function';
    if (intentAnalysis.scope.size === 'large') return 'project';
    
    return 'function'; // Default
  }

  /**
   * Infer programming language
   * @param {Object} intentAnalysis - Intent analysis
   * @returns {string} Programming language
   * @private
   */
  _inferLanguage(intentAnalysis) {
    const description = intentAnalysis.primary_intent.matched_text.toLowerCase();
    
    if (/typescript|ts/.test(description)) return 'typescript';
    if (/javascript|js|node/.test(description)) return 'javascript';
    if (/python|py/.test(description)) return 'python';
    if (/java/.test(description)) return 'java';
    if (/go|golang/.test(description)) return 'go';
    if (/rust/.test(description)) return 'rust';
    
    // Check dependencies
    if (intentAnalysis.dependencies.external.some(d => d.name === 'react')) {
      return 'javascript';
    }
    
    return 'javascript'; // Default
  }

  /**
   * Infer framework
   * @param {Object} intentAnalysis - Intent analysis
   * @returns {string} Framework
   * @private
   */
  _inferFramework(intentAnalysis) {
    const description = intentAnalysis.primary_intent.matched_text.toLowerCase();
    
    if (/react/.test(description)) return 'react';
    if (/express/.test(description)) return 'express';
    if (/fastapi/.test(description)) return 'fastapi';
    if (/django/.test(description)) return 'django';
    if (/vue/.test(description)) return 'vue';
    if (/angular/.test(description)) return 'angular';
    
    // Check dependencies
    if (intentAnalysis.dependencies.external.some(d => d.name === 'react')) {
      return 'react';
    }
    if (intentAnalysis.dependencies.external.some(d => d.name === 'express')) {
      return 'express';
    }
    
    return null;
  }

  // Extraction methods

  /**
   * Extract function name from analysis
   * @param {Object} intentAnalysis - Intent analysis
   * @returns {string} Function name
   * @private
   */
  _extractFunctionName(intentAnalysis) {
    const text = intentAnalysis.primary_intent.matched_text;
    
    // Look for explicit function names
    const functionMatch = text.match(/function\s+(\w+)/i);
    if (functionMatch) return functionMatch[1];
    
    // Generate from description
    return this._generateNameFromDescription(text, 'function');
  }

  /**
   * Extract class name from analysis
   * @param {Object} intentAnalysis - Intent analysis
   * @returns {string} Class name
   * @private
   */
  _extractClassName(intentAnalysis) {
    const text = intentAnalysis.primary_intent.matched_text;
    
    // Look for explicit class names
    const classMatch = text.match(/class\s+(\w+)/i);
    if (classMatch) return classMatch[1];
    
    // Generate from description
    return this._generateNameFromDescription(text, 'class');
  }

  /**
   * Extract component name from analysis
   * @param {Object} intentAnalysis - Intent analysis
   * @returns {string} Component name
   * @private
   */
  _extractComponentName(intentAnalysis) {
    const text = intentAnalysis.primary_intent.matched_text;
    
    // Look for explicit component names
    const componentMatch = text.match(/component\s+(\w+)/i);
    if (componentMatch) return componentMatch[1];
    
    // Generate from description
    return this._generateNameFromDescription(text, 'component');
  }

  /**
   * Generate name from description
   * @param {string} description - Description text
   * @param {string} type - Type of artifact
   * @returns {string} Generated name
   * @private
   */
  _generateNameFromDescription(description, type) {
    // Extract meaningful words
    const words = description
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2)
      .filter(word => !['the', 'and', 'for', 'with', 'that'].includes(word))
      .slice(0, 3);
    
    if (words.length === 0) {
      return type === 'class' ? 'MyClass' : 'myFunction';
    }
    
    // Convert to appropriate case
    if (type === 'class' || type === 'component') {
      return words.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
    } else {
      return words[0] + words.slice(1).map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join('');
    }
  }

  // Language-specific template methods

  /**
   * Get JavaScript function template
   * @returns {Function} Template function
   * @private
   */
  _getJavaScriptFunctionTemplate() {
    return ({ name, parameters, description, includeComments }) => {
      const params = parameters.map(p => p.name).join(', ');
      const comments = includeComments ? `/**\n * ${description}\n */\n` : '';
      
      return `${comments}function ${name}(${params}) {\n  // TODO: Implement ${description}\n  \n}`;
    };
  }

  /**
   * Get JavaScript class template
   * @returns {Function} Template function
   * @private
   */
  _getJavaScriptClassTemplate() {
    return ({ name, methods, properties, description, includeComments }) => {
      const comments = includeComments ? `/**\n * ${description}\n */\n` : '';
      
      return `${comments}class ${name} {\n  constructor() {\n    // TODO: Initialize ${name}\n  }\n  \n  // TODO: Add methods\n}`;
    };
  }

  /**
   * Get TypeScript function template
   * @returns {Function} Template function
   * @private
   */
  _getTypeScriptFunctionTemplate() {
    return ({ name, parameters, returnType, description, includeComments, includeTypes }) => {
      const params = parameters.map(p => 
        includeTypes ? `${p.name}: ${p.type || 'any'}` : p.name
      ).join(', ');
      const retType = includeTypes && returnType ? `: ${returnType}` : '';
      const comments = includeComments ? `/**\n * ${description}\n */\n` : '';
      
      return `${comments}function ${name}(${params})${retType} {\n  // TODO: Implement ${description}\n  \n}`;
    };
  }

  /**
   * Get React component template
   * @returns {Function} Template function
   * @private
   */
  _getReactComponentTemplate() {
    return ({ name, props, description, includeComments, includeTypes }) => {
      const propsType = includeTypes ? `interface ${name}Props {\n  // TODO: Define props\n}\n\n` : '';
      const propsParam = includeTypes ? `props: ${name}Props` : 'props';
      const comments = includeComments ? `/**\n * ${description}\n */\n` : '';
      
      return `${propsType}${comments}function ${name}(${propsParam}) {\n  return (\n    <div>\n      {/* TODO: Implement ${description} */}\n    </div>\n  );\n}`;
    };
  }

  // Additional template methods would be implemented here...
  // For brevity, I'm including placeholders for the remaining methods

  _getJavaScriptModuleTemplate() {
    return ({ name, exports, dependencies, description, includeComments }) => {
      const comments = includeComments ? `/**\n * ${description}\n */\n` : '';
      return `${comments}// TODO: Implement ${name} module\n\nmodule.exports = {\n  // TODO: Add exports\n};`;
    };
  }

  _getJavaScriptComponentTemplate() { return this._getReactComponentTemplate(); }
  _getJavaScriptTestTemplate() {
    return ({ name, description }) => `// Test for ${name}\n// TODO: Implement tests for ${description}`;
  }

  _getTypeScriptClassTemplate() { return this._getJavaScriptClassTemplate(); }
  _getTypeScriptInterfaceTemplate() {
    return ({ name, description, includeComments }) => {
      const comments = includeComments ? `/**\n * ${description}\n */\n` : '';
      return `${comments}interface ${name} {\n  // TODO: Define interface\n}`;
    };
  }
  _getTypeScriptModuleTemplate() { return this._getJavaScriptModuleTemplate(); }
  _getTypeScriptComponentTemplate() { return this._getReactComponentTemplate(); }
  _getTypeScriptTestTemplate() { return this._getJavaScriptTestTemplate(); }

  _getPythonFunctionTemplate() {
    return ({ name, parameters, description, includeComments }) => {
      const params = parameters.map(p => p.name).join(', ');
      const docstring = includeComments ? `    """${description}"""\n` : '';
      return `def ${name}(${params}):\n${docstring}    # TODO: Implement ${description}\n    pass`;
    };
  }
  _getPythonClassTemplate() {
    return ({ name, description, includeComments }) => {
      const docstring = includeComments ? `    """${description}"""\n` : '';
      return `class ${name}:\n${docstring}    def __init__(self):\n        # TODO: Initialize ${name}\n        pass`;
    };
  }
  _getPythonModuleTemplate() { return this._getPythonFunctionTemplate(); }
  _getPythonTestTemplate() { return this._getJavaScriptTestTemplate(); }

  _getJavaClassTemplate() {
    return ({ name, description, includeComments }) => {
      const comments = includeComments ? `/**\n * ${description}\n */\n` : '';
      return `${comments}public class ${name} {\n    // TODO: Implement ${description}\n}`;
    };
  }
  _getJavaInterfaceTemplate() {
    return ({ name, description, includeComments }) => {
      const comments = includeComments ? `/**\n * ${description}\n */\n` : '';
      return `${comments}public interface ${name} {\n    // TODO: Define interface\n}`;
    };
  }
  _getJavaMethodTemplate() { return this._getJavaScriptFunctionTemplate(); }
  _getJavaTestTemplate() { return this._getJavaScriptTestTemplate(); }

  // Framework templates
  _getReactHookTemplate() {
    return ({ name, description, includeComments }) => {
      const comments = includeComments ? `/**\n * ${description}\n */\n` : '';
      return `${comments}function ${name}() {\n  // TODO: Implement ${description}\n  return {};\n}`;
    };
  }
  _getReactContextTemplate() { return this._getReactComponentTemplate(); }
  _getReactTestTemplate() { return this._getJavaScriptTestTemplate(); }

  _getExpressRouteTemplate() {
    return ({ name, description, includeComments }) => {
      const comments = includeComments ? `// ${description}\n` : '';
      return `${comments}router.get('/${name}', (req, res) => {\n  // TODO: Implement ${description}\n  res.json({ message: 'TODO' });\n});`;
    };
  }
  _getExpressMiddlewareTemplate() { return this._getExpressRouteTemplate(); }
  _getExpressControllerTemplate() { return this._getJavaScriptClassTemplate(); }
  _getExpressTestTemplate() { return this._getJavaScriptTestTemplate(); }

  _getFastAPIRouteTemplate() {
    return ({ name, description, includeComments }) => {
      const docstring = includeComments ? `    """${description}"""\n` : '';
      return `@app.get("/${name}")\ndef ${name}():\n${docstring}    # TODO: Implement ${description}\n    return {"message": "TODO"}`;
    };
  }
  _getFastAPIModelTemplate() { return this._getPythonClassTemplate(); }
  _getFastAPIServiceTemplate() { return this._getPythonClassTemplate(); }
  _getFastAPITestTemplate() { return this._getPythonTestTemplate(); }

  // Project structure templates
  _getWebAppStructure() {
    return {
      directories: ['src', 'public', 'tests', 'docs'],
      files: ['package.json', 'README.md', 'index.html']
    };
  }

  _getAPIServiceStructure() {
    return {
      directories: ['src', 'tests', 'docs', 'config'],
      files: ['package.json', 'README.md', 'server.js']
    };
  }

  _getLibraryStructure() {
    return {
      directories: ['src', 'tests', 'docs', 'examples'],
      files: ['package.json', 'README.md', 'index.js']
    };
  }

  _getMicroserviceStructure() {
    return {
      directories: ['src', 'tests', 'docs', 'config', 'docker'],
      files: ['package.json', 'README.md', 'Dockerfile', 'docker-compose.yml']
    };
  }

  // Helper methods
  _extractParameters(intentAnalysis) {
    // Simple parameter extraction - could be enhanced
    return [
      { name: 'param1', type: 'any' },
      { name: 'param2', type: 'any' }
    ];
  }

  _extractMethods(intentAnalysis) { return []; }
  _extractProperties(intentAnalysis) { return []; }
  _extractProps(intentAnalysis) { return []; }
  _extractState(intentAnalysis) { return []; }
  _extractModuleName(intentAnalysis) { return 'MyModule'; }
  _extractExports(intentAnalysis) { return []; }
  _extractDependencies(intentAnalysis) { return []; }
  _inferReturnType(intentAnalysis) { return 'void'; }
  _determineProjectType(intentAnalysis) { return 'web_app'; }
  _shouldIncludeTests(intentAnalysis) { return true; }

  _generateMainFile(intentAnalysis, template) {
    return {
      path: `src/index.${this._getFileExtension(template.language)}`,
      content: template.structure.template || '// TODO: Implement',
      type: 'implementation'
    };
  }

  _generateTestFile(intentAnalysis, template) {
    return {
      path: `tests/index.test.${this._getFileExtension(template.language)}`,
      content: '// TODO: Add tests',
      type: 'test'
    };
  }

  _generateDocumentationFile(intentAnalysis, template) {
    return {
      path: 'README.md',
      content: `# ${intentAnalysis.primary_intent.matched_text}\n\nTODO: Add documentation`,
      type: 'documentation'
    };
  }

  _generateConfigFiles(intentAnalysis, template) {
    const files = [];
    
    if (template.language === 'javascript' || template.language === 'typescript') {
      files.push({
        path: 'package.json',
        content: JSON.stringify({
          name: 'my-project',
          version: '1.0.0',
          description: intentAnalysis.primary_intent.matched_text
        }, null, 2),
        type: 'configuration'
      });
    }
    
    return files;
  }

  _getFileExtension(language) {
    const extensions = {
      javascript: 'js',
      typescript: 'ts',
      python: 'py',
      java: 'java',
      go: 'go',
      rust: 'rs'
    };
    return extensions[language] || 'txt';
  }

  _generateSuggestions(intentAnalysis) {
    return [
      'Consider adding error handling',
      'Add input validation',
      'Include unit tests',
      'Add documentation'
    ];
  }

  _getGenericTemplate(intentAnalysis, template) {
    return `// TODO: Implement ${intentAnalysis.primary_intent.matched_text}`;
  }
}

export default TemplateEngine;

