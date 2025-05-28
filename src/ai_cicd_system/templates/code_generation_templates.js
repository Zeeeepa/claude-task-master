/**
 * @fileoverview Code Generation Templates
 * @description Comprehensive templates for intelligent code generation
 */

/**
 * Code generation template library with context-aware patterns
 */
export class CodeGenerationTemplates {
    constructor() {
        this.templates = this._initializeTemplates();
        this.patterns = this._initializePatterns();
        this.snippets = this._initializeSnippets();
    }

    /**
     * Get template by type and technology
     * @param {string} type - Template type
     * @param {string} technology - Technology stack
     * @returns {Object} Template configuration
     */
    getTemplate(type, technology = 'javascript') {
        const typeTemplates = this.templates[type] || this.templates.default;
        return typeTemplates[technology] || typeTemplates.default || this.templates.default.default;
    }

    /**
     * Get pattern by name
     * @param {string} patternName - Pattern name
     * @returns {Object} Pattern configuration
     */
    getPattern(patternName) {
        return this.patterns[patternName] || this.patterns.default;
    }

    /**
     * Get code snippet
     * @param {string} snippetName - Snippet name
     * @param {string} technology - Technology
     * @returns {string} Code snippet
     */
    getSnippet(snippetName, technology = 'javascript') {
        const techSnippets = this.snippets[technology] || this.snippets.javascript;
        return techSnippets[snippetName] || '';
    }

    /**
     * Initialize template library
     * @returns {Object} Template configurations
     * @private
     */
    _initializeTemplates() {
        return {
            feature: {
                javascript: {
                    structure: 'modular',
                    patterns: ['service', 'validation', 'error-handling'],
                    requirements: ['tests', 'documentation', 'logging'],
                    guidelines: [
                        'Use ES6+ features appropriately',
                        'Implement proper error handling',
                        'Add comprehensive logging',
                        'Follow single responsibility principle',
                        'Include input validation',
                        'Write unit tests for all functions'
                    ]
                },
                react: {
                    structure: 'component-based',
                    patterns: ['hooks', 'context', 'error-boundary'],
                    requirements: ['prop-types', 'tests', 'accessibility'],
                    guidelines: [
                        'Use functional components with hooks',
                        'Implement proper state management',
                        'Add PropTypes for type checking',
                        'Include accessibility attributes',
                        'Handle loading and error states',
                        'Write component tests'
                    ]
                },
                node: {
                    structure: 'layered',
                    patterns: ['middleware', 'service', 'repository'],
                    requirements: ['validation', 'logging', 'error-handling'],
                    guidelines: [
                        'Use Express.js best practices',
                        'Implement proper middleware',
                        'Add request validation',
                        'Include comprehensive logging',
                        'Handle async operations properly',
                        'Write integration tests'
                    ]
                },
                python: {
                    structure: 'object-oriented',
                    patterns: ['class-based', 'decorator', 'context-manager'],
                    requirements: ['type-hints', 'docstrings', 'tests'],
                    guidelines: [
                        'Use type hints for better code clarity',
                        'Add comprehensive docstrings',
                        'Follow PEP 8 style guidelines',
                        'Implement proper exception handling',
                        'Use context managers for resources',
                        'Write pytest tests'
                    ]
                },
                default: {
                    structure: 'modular',
                    patterns: ['separation-of-concerns', 'error-handling'],
                    requirements: ['tests', 'documentation'],
                    guidelines: [
                        'Follow language-specific best practices',
                        'Implement proper error handling',
                        'Add comprehensive documentation',
                        'Write appropriate tests',
                        'Use consistent naming conventions'
                    ]
                }
            },

            bug_fix: {
                javascript: {
                    approach: 'targeted',
                    patterns: ['defensive-programming', 'validation'],
                    requirements: ['regression-tests', 'logging'],
                    guidelines: [
                        'Identify root cause before fixing',
                        'Add validation to prevent similar issues',
                        'Include regression tests',
                        'Add logging for debugging',
                        'Minimize changes to existing code',
                        'Document the fix and reasoning'
                    ]
                },
                default: {
                    approach: 'minimal',
                    patterns: ['defensive-programming'],
                    requirements: ['tests'],
                    guidelines: [
                        'Make minimal, targeted changes',
                        'Add tests to prevent regression',
                        'Document the issue and solution',
                        'Verify fix doesn\'t break existing functionality'
                    ]
                }
            },

            refactor: {
                javascript: {
                    approach: 'incremental',
                    patterns: ['extract-function', 'extract-class', 'remove-duplication'],
                    requirements: ['tests', 'documentation'],
                    guidelines: [
                        'Maintain existing functionality',
                        'Improve code readability',
                        'Reduce code duplication',
                        'Enhance maintainability',
                        'Keep changes focused',
                        'Ensure all tests pass'
                    ]
                },
                default: {
                    approach: 'conservative',
                    patterns: ['simplification', 'organization'],
                    requirements: ['tests'],
                    guidelines: [
                        'Preserve existing behavior',
                        'Improve code organization',
                        'Enhance readability',
                        'Maintain test coverage'
                    ]
                }
            },

            test: {
                javascript: {
                    framework: 'jest',
                    patterns: ['unit', 'integration', 'mocking'],
                    requirements: ['coverage', 'edge-cases'],
                    guidelines: [
                        'Write descriptive test names',
                        'Test both positive and negative cases',
                        'Include edge case testing',
                        'Use appropriate mocking',
                        'Aim for high test coverage',
                        'Keep tests simple and focused'
                    ]
                },
                react: {
                    framework: 'react-testing-library',
                    patterns: ['component', 'hooks', 'integration'],
                    requirements: ['accessibility', 'user-interaction'],
                    guidelines: [
                        'Test user interactions, not implementation',
                        'Include accessibility testing',
                        'Test component states and props',
                        'Mock external dependencies',
                        'Test error boundaries',
                        'Verify rendering behavior'
                    ]
                },
                python: {
                    framework: 'pytest',
                    patterns: ['unit', 'integration', 'fixtures'],
                    requirements: ['coverage', 'parametrization'],
                    guidelines: [
                        'Use pytest fixtures for setup',
                        'Parametrize tests for multiple inputs',
                        'Test exception handling',
                        'Include integration tests',
                        'Mock external services',
                        'Aim for comprehensive coverage'
                    ]
                },
                default: {
                    framework: 'language-appropriate',
                    patterns: ['unit', 'integration'],
                    requirements: ['coverage'],
                    guidelines: [
                        'Write clear, descriptive tests',
                        'Test both success and failure cases',
                        'Include edge case testing',
                        'Maintain good test coverage'
                    ]
                }
            },

            documentation: {
                default: {
                    format: 'markdown',
                    patterns: ['structured', 'examples', 'api-docs'],
                    requirements: ['clarity', 'completeness'],
                    guidelines: [
                        'Write clear, concise documentation',
                        'Include practical examples',
                        'Organize information logically',
                        'Keep documentation up-to-date',
                        'Use consistent formatting',
                        'Include troubleshooting information'
                    ]
                }
            },

            configuration: {
                default: {
                    approach: 'declarative',
                    patterns: ['environment-specific', 'validation'],
                    requirements: ['documentation', 'examples'],
                    guidelines: [
                        'Use environment-specific configurations',
                        'Validate configuration values',
                        'Provide clear documentation',
                        'Include example configurations',
                        'Make configurations discoverable',
                        'Handle missing configurations gracefully'
                    ]
                }
            },

            integration: {
                default: {
                    approach: 'robust',
                    patterns: ['retry', 'circuit-breaker', 'monitoring'],
                    requirements: ['error-handling', 'logging', 'tests'],
                    guidelines: [
                        'Implement robust error handling',
                        'Add comprehensive logging',
                        'Include retry mechanisms',
                        'Monitor integration health',
                        'Handle timeouts gracefully',
                        'Write integration tests'
                    ]
                }
            },

            default: {
                default: {
                    structure: 'modular',
                    patterns: ['best-practices'],
                    requirements: ['tests', 'documentation'],
                    guidelines: [
                        'Follow established best practices',
                        'Write clean, maintainable code',
                        'Include appropriate tests',
                        'Add clear documentation',
                        'Handle errors gracefully'
                    ]
                }
            }
        };
    }

    /**
     * Initialize coding patterns
     * @returns {Object} Pattern configurations
     * @private
     */
    _initializePatterns() {
        return {
            service: {
                description: 'Service layer pattern for business logic',
                structure: {
                    constructor: 'Initialize dependencies and configuration',
                    methods: 'Public methods for business operations',
                    validation: 'Input validation and sanitization',
                    errorHandling: 'Comprehensive error handling',
                    logging: 'Structured logging for operations'
                },
                example: 'UserService, PaymentService, NotificationService'
            },

            repository: {
                description: 'Repository pattern for data access',
                structure: {
                    interface: 'Define data access interface',
                    implementation: 'Implement data operations',
                    abstraction: 'Abstract database specifics',
                    transactions: 'Handle database transactions',
                    caching: 'Implement caching strategies'
                },
                example: 'UserRepository, ProductRepository'
            },

            middleware: {
                description: 'Middleware pattern for request processing',
                structure: {
                    authentication: 'Handle user authentication',
                    authorization: 'Check user permissions',
                    validation: 'Validate request data',
                    logging: 'Log request/response information',
                    errorHandling: 'Handle and format errors'
                },
                example: 'authMiddleware, validationMiddleware'
            },

            'error-handling': {
                description: 'Comprehensive error handling pattern',
                structure: {
                    customErrors: 'Define custom error classes',
                    errorBoundaries: 'Implement error boundaries',
                    logging: 'Log errors with context',
                    userFeedback: 'Provide meaningful user messages',
                    recovery: 'Implement error recovery strategies'
                },
                example: 'ValidationError, NetworkError, BusinessLogicError'
            },

            validation: {
                description: 'Input validation and sanitization',
                structure: {
                    schema: 'Define validation schemas',
                    sanitization: 'Sanitize input data',
                    typeChecking: 'Validate data types',
                    businessRules: 'Apply business rule validation',
                    errorMessages: 'Provide clear error messages'
                },
                example: 'Joi, Yup, class-validator'
            },

            'defensive-programming': {
                description: 'Defensive programming practices',
                structure: {
                    nullChecks: 'Check for null/undefined values',
                    typeValidation: 'Validate parameter types',
                    boundaryChecks: 'Check array/string boundaries',
                    fallbacks: 'Provide fallback values',
                    assertions: 'Use assertions for invariants'
                },
                example: 'Guard clauses, null checks, type validation'
            },

            default: {
                description: 'General best practices pattern',
                structure: {
                    organization: 'Organize code logically',
                    naming: 'Use clear, descriptive names',
                    comments: 'Add meaningful comments',
                    testing: 'Include comprehensive tests',
                    documentation: 'Document public interfaces'
                },
                example: 'Clean code principles'
            }
        };
    }

    /**
     * Initialize code snippets
     * @returns {Object} Code snippets by technology
     * @private
     */
    _initializeSnippets() {
        return {
            javascript: {
                'error-class': `class CustomError extends Error {
    constructor(message, code, statusCode = 500) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}`,

                'async-handler': `const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};`,

                'validation-middleware': `const validateRequest = (schema) => (req, res, next) => {
    const { error } = schema.validate(req.body);
    if (error) {
        return res.status(400).json({
            error: 'Validation failed',
            details: error.details.map(d => d.message)
        });
    }
    next();
};`,

                'logger-setup': `import winston from 'winston';

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});`,

                'service-class': `export class ExampleService {
    constructor(dependencies = {}) {
        this.repository = dependencies.repository;
        this.logger = dependencies.logger;
        this.config = dependencies.config;
    }

    async processData(data) {
        try {
            this.validateInput(data);
            const result = await this.repository.save(data);
            this.logger.info('Data processed successfully', { id: result.id });
            return result;
        } catch (error) {
            this.logger.error('Data processing failed', { error: error.message });
            throw error;
        }
    }

    validateInput(data) {
        if (!data || typeof data !== 'object') {
            throw new ValidationError('Invalid input data');
        }
    }
}`
            },

            react: {
                'functional-component': `import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

const ExampleComponent = ({ initialData, onUpdate }) => {
    const [data, setData] = useState(initialData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (initialData) {
            setData(initialData);
        }
    }, [initialData]);

    const handleUpdate = async (newData) => {
        setLoading(true);
        setError(null);

        try {
            await onUpdate(newData);
            setData(newData);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    if (error) {
        return <div className="error" role="alert">Error: {error}</div>;
    }

    return (
        <div className="example-component">
            {loading && <div className="loading" aria-live="polite">Loading...</div>}
            {/* Component content */}
        </div>
    );
};

ExampleComponent.propTypes = {
    initialData: PropTypes.object,
    onUpdate: PropTypes.func.isRequired
};

export default ExampleComponent;`,

                'custom-hook': `import { useState, useEffect, useCallback } from 'react';

export const useAsyncOperation = (asyncFunction, dependencies = []) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const execute = useCallback(async (...args) => {
        setLoading(true);
        setError(null);

        try {
            const result = await asyncFunction(...args);
            setData(result);
            return result;
        } catch (err) {
            setError(err);
            throw err;
        } finally {
            setLoading(false);
        }
    }, dependencies);

    return { data, loading, error, execute };
};`,

                'error-boundary': `import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
        // Log to error reporting service
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <h2>Something went wrong</h2>
                    <p>We're sorry, but something unexpected happened.</p>
                    <button onClick={() => this.setState({ hasError: false, error: null })}>
                        Try again
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;`
            },

            python: {
                'class-template': `from typing import Optional, Dict, Any
import logging

class ExampleService:
    """Example service class with proper typing and documentation."""
    
    def __init__(self, config: Dict[str, Any]) -> None:
        """Initialize the service with configuration.
        
        Args:
            config: Configuration dictionary
        """
        self.config = config
        self.logger = logging.getLogger(__name__)
        
    def process_data(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process input data and return result.
        
        Args:
            data: Input data to process
            
        Returns:
            Processed data or None if processing fails
            
        Raises:
            ValueError: If input data is invalid
        """
        try:
            self._validate_input(data)
            result = self._perform_processing(data)
            self.logger.info(f"Data processed successfully: {result.get('id')}")
            return result
        except Exception as e:
            self.logger.error(f"Processing failed: {str(e)}")
            raise
            
    def _validate_input(self, data: Dict[str, Any]) -> None:
        """Validate input data."""
        if not isinstance(data, dict):
            raise ValueError("Input must be a dictionary")
            
    def _perform_processing(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Perform the actual data processing."""
        # Implementation here
        return {"id": "processed", "data": data}`,

                'async-function': `import asyncio
import aiohttp
from typing import Optional, Dict, Any

async def fetch_data(url: str, timeout: int = 30) -> Optional[Dict[str, Any]]:
    """Fetch data from URL with proper error handling.
    
    Args:
        url: URL to fetch data from
        timeout: Request timeout in seconds
        
    Returns:
        Fetched data or None if request fails
    """
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
            async with session.get(url) as response:
                response.raise_for_status()
                return await response.json()
    except aiohttp.ClientError as e:
        logging.error(f"HTTP request failed: {str(e)}")
        return None
    except asyncio.TimeoutError:
        logging.error(f"Request timeout for URL: {url}")
        return None`,

                'context-manager': `from contextlib import contextmanager
from typing import Generator, Any
import logging

@contextmanager
def managed_resource(resource_config: dict) -> Generator[Any, None, None]:
    """Context manager for resource lifecycle management.
    
    Args:
        resource_config: Configuration for the resource
        
    Yields:
        Initialized resource
    """
    resource = None
    try:
        resource = initialize_resource(resource_config)
        logging.info("Resource initialized successfully")
        yield resource
    except Exception as e:
        logging.error(f"Resource operation failed: {str(e)}")
        raise
    finally:
        if resource:
            cleanup_resource(resource)
            logging.info("Resource cleaned up")`
            },

            node: {
                'express-route': `import express from 'express';
import { body, validationResult } from 'express-validator';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.post('/example',
    authenticate,
    [
        body('name').notEmpty().withMessage('Name is required'),
        body('email').isEmail().withMessage('Valid email is required')
    ],
    asyncHandler(async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { name, email } = req.body;
        
        try {
            const result = await exampleService.create({ name, email });
            res.status(201).json({
                success: true,
                data: result
            });
        } catch (error) {
            res.status(500).json({
                error: 'Internal server error',
                message: error.message
            });
        }
    })
);

export default router;`,

                'middleware': `export const requestLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(\`\${req.method} \${req.url} - \${res.statusCode} - \${duration}ms\`);
    });
    
    next();
};

export const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            error: 'Validation Error',
            message: err.message
        });
    }
    
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid token'
        });
    }
    
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
};`
            }
        };
    }
}

export default CodeGenerationTemplates;

