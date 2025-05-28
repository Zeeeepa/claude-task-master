# Requirement Analyzer Engine

A comprehensive NLP-powered requirement analysis and task decomposition system that intelligently parses natural language requirements and creates atomic, implementable tasks with dependency analysis and complexity estimation.

## 🎯 Overview

The Requirement Analyzer Engine is the foundational component of the claude-task-master system, designed to:

- **Parse natural language requirements** into structured, analyzable data
- **Decompose complex requirements** into atomic, implementable tasks
- **Analyze task dependencies** and create execution graphs
- **Estimate complexity** across multiple dimensions
- **Generate codegen prompts** for AI-powered implementation
- **Validate task completeness** and provide improvement suggestions

## 🏗️ Architecture

### Core Components

```
src/requirement_analyzer/
├── analyzer.js          # Main RequirementAnalyzer class
├── types.js            # Data structures and type definitions
├── index.js            # Public API and convenience functions
├── examples.js         # Sample data and usage examples
└── README.md           # This documentation

src/nlp_engine/
└── processor.js        # Natural language processing engine

src/task_decomposition/
└── decomposer.js       # Task decomposition strategies
```

### Key Classes

- **`RequirementAnalyzer`** - Main orchestrator class
- **`ParsedRequirement`** - Structured requirement representation
- **`AtomicTask`** - Individual implementable task
- **`DependencyGraph`** - Task relationship management
- **`ComplexityScore`** - Multi-dimensional complexity analysis
- **`TaskContext`** - Rich context for AI agents
- **`CodegenPrompt`** - Formatted prompts for code generation

## 🚀 Quick Start

### Basic Usage

```javascript
import { RequirementAnalyzer, analyzeRequirement } from './src/requirement_analyzer/index.js';

// Simple analysis
const requirementText = `
  Create a user authentication system that allows users to register, 
  login, and logout. The system should validate email addresses and 
  enforce strong password requirements.
`;

const result = await analyzeRequirement(requirementText);

console.log(`Generated ${result.summary.totalTasks} tasks`);
console.log(`Average complexity: ${result.summary.averageComplexity}`);
```

### Advanced Usage

```javascript
// Create configured analyzer
const analyzer = new RequirementAnalyzer({
  enableDependencyAnalysis: true,
  enableComplexityEstimation: true,
  maxTasksPerRequirement: 15,
  maxTaskComplexity: 8
});

// Step-by-step analysis
const requirement = await analyzer.parseRequirements(requirementText);
const tasks = await analyzer.decomposeTask(requirement);
const dependencyGraph = await analyzer.analyzeDependencies(tasks);

// Generate codegen prompts
const prompts = await Promise.all(
  tasks.map(task => analyzer.generateCodegenPrompt(task))
);
```

## 📊 Features

### 1. Natural Language Processing

The NLP engine extracts structured information from requirement text:

```javascript
const requirement = await analyzer.parseRequirements(text);

console.log(requirement.technicalSpecs);     // ['API endpoint', 'Database schema']
console.log(requirement.businessRequirements); // ['User registration', 'Login functionality']
console.log(requirement.acceptanceCriteria);   // ['Users can register', 'Invalid data rejected']
```

### 2. Task Decomposition Strategies

Multiple decomposition strategies based on requirement type:

- **Linear** - Sequential step-by-step breakdown
- **Hierarchical** - Main tasks with subtasks
- **Feature-based** - Organized by functional features
- **Layer-based** - Architectural layer separation
- **Workflow-based** - Business process flow

### 3. Dependency Analysis

Automatic dependency detection and validation:

```javascript
const dependencyGraph = await analyzer.analyzeDependencies(tasks);

// Check for circular dependencies
const cycles = dependencyGraph.detectCircularDependencies();

// Get execution order
const executionOrder = dependencyGraph.getTopologicalOrder();
```

### 4. Complexity Estimation

Multi-dimensional complexity scoring:

```javascript
const complexityScore = await analyzer.estimateComplexity(task);

console.log(complexityScore.technical);      // 1-10
console.log(complexityScore.business);       // 1-10
console.log(complexityScore.integration);    // 1-10
console.log(complexityScore.getOverallScore()); // Weighted average
console.log(complexityScore.getCategory());     // 'low', 'medium', 'high', 'very-high'
```

### 5. Codegen Integration

Generate structured prompts for AI code generation:

```javascript
const prompt = await analyzer.generateCodegenPrompt(task);
const formattedPrompt = prompt.format();

// Formatted prompt includes:
// - Title and description
// - Requirements and acceptance criteria
// - Technical specifications
// - Affected files
// - Context and complexity
```

### 6. Task Validation

Comprehensive task completeness validation:

```javascript
const validation = await analyzer.validateTaskCompleteness(task);

console.log(validation.isValid);      // true/false
console.log(validation.errors);       // Critical issues
console.log(validation.warnings);     // Potential problems
console.log(validation.suggestions);  // Improvement recommendations
console.log(validation.score);        // 0-100 completeness score
```

## 🔧 Configuration Options

```javascript
const analyzer = new RequirementAnalyzer({
  // Task decomposition
  maxTaskComplexity: 5,           // Maximum complexity per task
  minTaskComplexity: 1,           // Minimum complexity per task
  maxTasksPerRequirement: 20,     // Maximum tasks generated
  enableSubtaskGeneration: true,  // Create subtasks for complex tasks
  
  // Analysis features
  enableDependencyAnalysis: true,    // Analyze task dependencies
  enableComplexityEstimation: true,  // Estimate task complexity
  enableFileAnalysis: true,          // Analyze affected files
  
  // NLP processing
  nlp: {
    enableEntityExtraction: true,     // Extract entities from text
    enableKeywordExtraction: true,    // Extract relevant keywords
    confidenceThreshold: 0.7          // Minimum confidence for analysis
  },
  
  // Task decomposition
  decomposer: {
    enableDependencyInference: true   // Infer dependencies between tasks
  }
});
```

## 📝 Data Structures

### ParsedRequirement

```javascript
{
  id: 'req_timestamp_hash',
  title: 'User Authentication System',
  description: 'Create a user authentication system...',
  originalText: 'Create a user authentication...',
  technicalSpecs: ['Email validation', 'Password hashing'],
  businessRequirements: ['User registration', 'Login functionality'],
  acceptanceCriteria: ['Users can register', 'Invalid data rejected'],
  estimatedComplexity: 4,
  priority: 'high',
  tags: ['authentication', 'security'],
  metadata: { /* NLP analysis results */ },
  createdAt: '2025-05-28T07:00:00.000Z'
}
```

### AtomicTask

```javascript
{
  id: 'req_id_task_1',
  title: 'Implement User Registration',
  description: 'Create user registration functionality...',
  requirements: ['Email validation', 'Password strength validation'],
  acceptanceCriteria: ['User can register with valid email'],
  affectedFiles: ['src/auth/registration.js', 'src/models/user.js'],
  complexityScore: 3,
  dependencies: [],
  context: { /* Rich context data */ },
  parentRequirementId: 'req_timestamp_hash',
  estimatedHours: 8,
  priority: 'high',
  tags: ['authentication', 'registration'],
  implementationNotes: 'Use bcrypt for password hashing',
  testStrategy: 'Unit tests for validation, integration tests for flow',
  status: 'pending',
  createdAt: '2025-05-28T07:00:00.000Z'
}
```

## 🧪 Testing

Run the comprehensive test suite:

```bash
npm test tests/requirement_analyzer.test.js
```

Test coverage includes:
- Data structure validation
- NLP processing accuracy
- Task decomposition strategies
- Dependency analysis
- Complexity estimation
- Error handling
- Performance benchmarks

## 📚 Examples

### Example 1: Simple Authentication System

```javascript
import { analyzeRequirement } from './src/requirement_analyzer/index.js';

const requirement = `
  Create a user authentication system that allows users to register, 
  login, and logout. The system should validate email addresses and 
  enforce strong password requirements. Users should be able to reset 
  their passwords via email.
`;

const result = await analyzeRequirement(requirement);

// Result includes:
// - 3-4 atomic tasks (registration, login/logout, password reset)
// - Dependency relationships
// - Complexity scores (2-4 per task)
// - Codegen prompts for each task
// - Validation results
```

### Example 2: Complex E-commerce System

```javascript
const complexRequirement = `
  # E-commerce Product Catalog System
  
  Implement a comprehensive product catalog system with:
  - Product management with categories and tags
  - Advanced search and filtering
  - Product recommendations
  - Inventory management
  - Multi-language support
  - RESTful API endpoints
  - Admin dashboard
  - Analytics and reporting
`;

const result = await analyzeRequirement(complexRequirement, {
  maxTasksPerRequirement: 15,
  enableSubtaskGeneration: true
});

// Result includes:
// - 10-15 atomic tasks organized by feature
// - Complex dependency graph
// - Higher complexity scores
// - Detailed codegen prompts
// - Comprehensive validation
```

### Example 3: Workflow-based CI/CD Pipeline

```javascript
const workflowRequirement = `
  Implement an automated CI/CD pipeline:
  1. Code commit triggers automated testing
  2. Successful tests trigger security scanning
  3. Security approval triggers staging deployment
  4. Manual approval triggers production deployment
  5. Post-deployment monitoring and alerting
`;

const result = await analyzeRequirement(workflowRequirement);

// Result includes:
// - Sequential tasks with clear dependencies
// - Workflow-based decomposition strategy
// - Integration complexity considerations
// - Deployment-focused context
```

## 🔄 Integration Points

### Database Schema Integration

The analyzer generates task data compatible with PostgreSQL storage:

```javascript
// Task data can be directly stored in database
const taskData = {
  id: task.id,
  title: task.title,
  description: task.description,
  requirements: JSON.stringify(task.requirements),
  acceptance_criteria: JSON.stringify(task.acceptanceCriteria),
  affected_files: JSON.stringify(task.affectedFiles),
  complexity_score: task.complexityScore,
  dependencies: JSON.stringify(task.dependencies),
  context: JSON.stringify(task.context),
  parent_requirement_id: task.parentRequirementId,
  status: task.status,
  created_at: task.createdAt
};
```

### Codegen Integration

Generated prompts are optimized for AI code generation:

```javascript
const prompt = await analyzer.generateCodegenPrompt(task);
const formattedPrompt = prompt.format();

// Send to codegen system
const codegenResult = await codegen.generate(formattedPrompt);
```

### Claude Code Validation

Task context includes validation requirements:

```javascript
const context = await analyzer.generateTaskContext(task);

// Context includes:
// - Codebase context for validation
// - Technical constraints
// - Success metrics
// - Risk factors
```

## 🚨 Error Handling

The analyzer includes comprehensive error handling:

```javascript
try {
  const result = await analyzeRequirement(requirementText);
} catch (error) {
  if (error.message.includes('Failed to parse requirements')) {
    // Handle parsing errors
  } else if (error.message.includes('Task decomposition failed')) {
    // Handle decomposition errors
  } else if (error.message.includes('Circular dependencies detected')) {
    // Handle dependency errors
  }
}
```

## 🔮 Future Enhancements

Planned improvements include:

1. **Machine Learning Integration** - Train models on requirement patterns
2. **Real-time Collaboration** - Multi-user requirement editing
3. **Version Control** - Track requirement changes over time
4. **Template System** - Reusable requirement templates
5. **Metrics Dashboard** - Analytics on requirement quality
6. **API Integration** - REST API for external systems
7. **Plugin System** - Custom decomposition strategies

## 📄 License

This module is part of the claude-task-master project and follows the same licensing terms.

## 🤝 Contributing

Contributions are welcome! Please see the main project's contributing guidelines.

---

**Note**: This is a foundational component designed for maximum concurrency and integration. The interface-first design enables immediate parallel development of downstream components while providing comprehensive mock implementations for testing and validation.

