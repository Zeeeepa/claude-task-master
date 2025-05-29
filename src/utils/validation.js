/**
 * Validation Utility
 * Input validation system for Task Master orchestrator
 * 
 * Provides comprehensive validation functions for data integrity,
 * security, and consistency across the system.
 */

import { ValidationError } from './error-handler.js';
import { logger } from './logger.js';

/**
 * Validation class for input validation and data integrity
 */
export class Validator {
    constructor(options = {}) {
        this.options = {
            strictMode: false,
            allowUnknownFields: true,
            coerceTypes: true,
            ...options
        };
        
        this.schemas = new Map();
        this.customValidators = new Map();
        
        this._setupBuiltInValidators();
    }

    /**
     * Register a validation schema
     * @param {string} name - Schema name
     * @param {Object} schema - Validation schema
     */
    registerSchema(name, schema) {
        this.schemas.set(name, schema);
        logger.debug(`Registered validation schema: ${name}`);
    }

    /**
     * Register a custom validator function
     * @param {string} name - Validator name
     * @param {Function} validator - Validator function
     */
    registerValidator(name, validator) {
        this.customValidators.set(name, validator);
        logger.debug(`Registered custom validator: ${name}`);
    }

    /**
     * Validate data against a schema
     * @param {*} data - Data to validate
     * @param {Object|string} schema - Validation schema or schema name
     * @param {Object} options - Validation options
     * @returns {Object} Validation result
     */
    validate(data, schema, options = {}) {
        try {
            const validationOptions = { ...this.options, ...options };
            const resolvedSchema = typeof schema === 'string' ? this.schemas.get(schema) : schema;
            
            if (!resolvedSchema) {
                throw new ValidationError(`Schema not found: ${schema}`);
            }

            const result = this._validateValue(data, resolvedSchema, '', validationOptions);
            
            return {
                valid: result.errors.length === 0,
                errors: result.errors,
                warnings: result.warnings,
                data: result.data
            };
        } catch (error) {
            logger.error('Validation error:', error);
            throw error;
        }
    }

    /**
     * Validate and throw on error
     * @param {*} data - Data to validate
     * @param {Object|string} schema - Validation schema or schema name
     * @param {Object} options - Validation options
     * @returns {*} Validated data
     */
    validateAndThrow(data, schema, options = {}) {
        const result = this.validate(data, schema, options);
        
        if (!result.valid) {
            const errorMessage = result.errors.map(e => e.message).join(', ');
            throw new ValidationError(`Validation failed: ${errorMessage}`, null, data);
        }
        
        return result.data;
    }

    /**
     * Validate a single value
     * @param {*} value - Value to validate
     * @param {Object} schema - Validation schema
     * @param {string} path - Current path in data structure
     * @param {Object} options - Validation options
     * @returns {Object} Validation result
     * @private
     */
    _validateValue(value, schema, path, options) {
        const result = {
            data: value,
            errors: [],
            warnings: []
        };

        // Handle null/undefined values
        if (value === null || value === undefined) {
            if (schema.required) {
                result.errors.push({
                    path,
                    message: `Field is required`,
                    code: 'REQUIRED'
                });
            } else if (schema.default !== undefined) {
                result.data = schema.default;
            }
            return result;
        }

        // Type validation and coercion
        if (schema.type) {
            const typeResult = this._validateType(value, schema.type, path, options);
            result.errors.push(...typeResult.errors);
            result.warnings.push(...typeResult.warnings);
            result.data = typeResult.data;
            value = typeResult.data;
        }

        // Format validation
        if (schema.format && typeof value === 'string') {
            const formatResult = this._validateFormat(value, schema.format, path);
            result.errors.push(...formatResult.errors);
        }

        // Length validation
        if (schema.minLength !== undefined || schema.maxLength !== undefined) {
            const lengthResult = this._validateLength(value, schema, path);
            result.errors.push(...lengthResult.errors);
        }

        // Range validation
        if (schema.min !== undefined || schema.max !== undefined) {
            const rangeResult = this._validateRange(value, schema, path);
            result.errors.push(...rangeResult.errors);
        }

        // Enum validation
        if (schema.enum) {
            const enumResult = this._validateEnum(value, schema.enum, path);
            result.errors.push(...enumResult.errors);
        }

        // Pattern validation
        if (schema.pattern) {
            const patternResult = this._validatePattern(value, schema.pattern, path);
            result.errors.push(...patternResult.errors);
        }

        // Custom validator
        if (schema.validator) {
            const customResult = this._validateCustom(value, schema.validator, path);
            result.errors.push(...customResult.errors);
            result.warnings.push(...customResult.warnings);
        }

        // Object validation
        if (schema.type === 'object' && schema.properties) {
            const objectResult = this._validateObject(value, schema, path, options);
            result.errors.push(...objectResult.errors);
            result.warnings.push(...objectResult.warnings);
            result.data = objectResult.data;
        }

        // Array validation
        if (schema.type === 'array' && schema.items) {
            const arrayResult = this._validateArray(value, schema, path, options);
            result.errors.push(...arrayResult.errors);
            result.warnings.push(...arrayResult.warnings);
            result.data = arrayResult.data;
        }

        return result;
    }

    /**
     * Validate and coerce type
     * @param {*} value - Value to validate
     * @param {string} type - Expected type
     * @param {string} path - Current path
     * @param {Object} options - Validation options
     * @returns {Object} Validation result
     * @private
     */
    _validateType(value, type, path, options) {
        const result = {
            data: value,
            errors: [],
            warnings: []
        };

        const actualType = Array.isArray(value) ? 'array' : typeof value;

        if (actualType === type) {
            return result;
        }

        // Type coercion if enabled
        if (options.coerceTypes) {
            try {
                switch (type) {
                    case 'string':
                        result.data = String(value);
                        break;
                    case 'number':
                        const num = Number(value);
                        if (isNaN(num)) {
                            throw new Error('Cannot convert to number');
                        }
                        result.data = num;
                        break;
                    case 'boolean':
                        if (typeof value === 'string') {
                            result.data = value.toLowerCase() === 'true';
                        } else {
                            result.data = Boolean(value);
                        }
                        break;
                    case 'date':
                        result.data = new Date(value);
                        if (isNaN(result.data.getTime())) {
                            throw new Error('Invalid date');
                        }
                        break;
                    default:
                        throw new Error(`Cannot coerce to type: ${type}`);
                }
                
                result.warnings.push({
                    path,
                    message: `Type coerced from ${actualType} to ${type}`,
                    code: 'TYPE_COERCED'
                });
            } catch (coercionError) {
                result.errors.push({
                    path,
                    message: `Expected ${type}, got ${actualType}`,
                    code: 'INVALID_TYPE'
                });
            }
        } else {
            result.errors.push({
                path,
                message: `Expected ${type}, got ${actualType}`,
                code: 'INVALID_TYPE'
            });
        }

        return result;
    }

    /**
     * Validate format (email, url, etc.)
     * @param {string} value - Value to validate
     * @param {string} format - Format to validate against
     * @param {string} path - Current path
     * @returns {Object} Validation result
     * @private
     */
    _validateFormat(value, format, path) {
        const result = { errors: [] };
        
        const formats = {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            url: /^https?:\/\/.+/,
            uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            date: /^\d{4}-\d{2}-\d{2}$/,
            time: /^\d{2}:\d{2}:\d{2}$/,
            datetime: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
            phone: /^\+?[\d\s\-\(\)]+$/,
            ipv4: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
            slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/
        };

        const pattern = formats[format];
        if (!pattern) {
            result.errors.push({
                path,
                message: `Unknown format: ${format}`,
                code: 'UNKNOWN_FORMAT'
            });
            return result;
        }

        if (!pattern.test(value)) {
            result.errors.push({
                path,
                message: `Invalid ${format} format`,
                code: 'INVALID_FORMAT'
            });
        }

        return result;
    }

    /**
     * Validate length constraints
     * @param {*} value - Value to validate
     * @param {Object} schema - Schema with length constraints
     * @param {string} path - Current path
     * @returns {Object} Validation result
     * @private
     */
    _validateLength(value, schema, path) {
        const result = { errors: [] };
        
        let length;
        if (typeof value === 'string' || Array.isArray(value)) {
            length = value.length;
        } else if (typeof value === 'object' && value !== null) {
            length = Object.keys(value).length;
        } else {
            return result; // Skip length validation for other types
        }

        if (schema.minLength !== undefined && length < schema.minLength) {
            result.errors.push({
                path,
                message: `Length must be at least ${schema.minLength}`,
                code: 'MIN_LENGTH'
            });
        }

        if (schema.maxLength !== undefined && length > schema.maxLength) {
            result.errors.push({
                path,
                message: `Length must be at most ${schema.maxLength}`,
                code: 'MAX_LENGTH'
            });
        }

        return result;
    }

    /**
     * Validate range constraints
     * @param {number} value - Value to validate
     * @param {Object} schema - Schema with range constraints
     * @param {string} path - Current path
     * @returns {Object} Validation result
     * @private
     */
    _validateRange(value, schema, path) {
        const result = { errors: [] };
        
        if (typeof value !== 'number') {
            return result; // Skip range validation for non-numbers
        }

        if (schema.min !== undefined && value < schema.min) {
            result.errors.push({
                path,
                message: `Value must be at least ${schema.min}`,
                code: 'MIN_VALUE'
            });
        }

        if (schema.max !== undefined && value > schema.max) {
            result.errors.push({
                path,
                message: `Value must be at most ${schema.max}`,
                code: 'MAX_VALUE'
            });
        }

        return result;
    }

    /**
     * Validate enum constraints
     * @param {*} value - Value to validate
     * @param {Array} enumValues - Allowed values
     * @param {string} path - Current path
     * @returns {Object} Validation result
     * @private
     */
    _validateEnum(value, enumValues, path) {
        const result = { errors: [] };
        
        if (!enumValues.includes(value)) {
            result.errors.push({
                path,
                message: `Value must be one of: ${enumValues.join(', ')}`,
                code: 'INVALID_ENUM'
            });
        }

        return result;
    }

    /**
     * Validate pattern constraints
     * @param {string} value - Value to validate
     * @param {RegExp|string} pattern - Pattern to match
     * @param {string} path - Current path
     * @returns {Object} Validation result
     * @private
     */
    _validatePattern(value, pattern, path) {
        const result = { errors: [] };
        
        if (typeof value !== 'string') {
            return result; // Skip pattern validation for non-strings
        }

        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
        
        if (!regex.test(value)) {
            result.errors.push({
                path,
                message: `Value does not match required pattern`,
                code: 'INVALID_PATTERN'
            });
        }

        return result;
    }

    /**
     * Validate using custom validator
     * @param {*} value - Value to validate
     * @param {string|Function} validator - Validator name or function
     * @param {string} path - Current path
     * @returns {Object} Validation result
     * @private
     */
    _validateCustom(value, validator, path) {
        const result = { errors: [], warnings: [] };
        
        let validatorFn;
        if (typeof validator === 'string') {
            validatorFn = this.customValidators.get(validator);
            if (!validatorFn) {
                result.errors.push({
                    path,
                    message: `Unknown validator: ${validator}`,
                    code: 'UNKNOWN_VALIDATOR'
                });
                return result;
            }
        } else if (typeof validator === 'function') {
            validatorFn = validator;
        } else {
            result.errors.push({
                path,
                message: 'Invalid validator type',
                code: 'INVALID_VALIDATOR'
            });
            return result;
        }

        try {
            const validationResult = validatorFn(value, path);
            
            if (validationResult === false) {
                result.errors.push({
                    path,
                    message: 'Custom validation failed',
                    code: 'CUSTOM_VALIDATION_FAILED'
                });
            } else if (typeof validationResult === 'object') {
                if (validationResult.errors) {
                    result.errors.push(...validationResult.errors);
                }
                if (validationResult.warnings) {
                    result.warnings.push(...validationResult.warnings);
                }
            }
        } catch (error) {
            result.errors.push({
                path,
                message: `Custom validator error: ${error.message}`,
                code: 'VALIDATOR_ERROR'
            });
        }

        return result;
    }

    /**
     * Validate object properties
     * @param {Object} value - Object to validate
     * @param {Object} schema - Object schema
     * @param {string} path - Current path
     * @param {Object} options - Validation options
     * @returns {Object} Validation result
     * @private
     */
    _validateObject(value, schema, path, options) {
        const result = {
            data: {},
            errors: [],
            warnings: []
        };

        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            result.errors.push({
                path,
                message: 'Expected object',
                code: 'INVALID_TYPE'
            });
            return result;
        }

        // Validate known properties
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
            const propPath = path ? `${path}.${propName}` : propName;
            const propValue = value[propName];
            
            const propResult = this._validateValue(propValue, propSchema, propPath, options);
            result.errors.push(...propResult.errors);
            result.warnings.push(...propResult.warnings);
            result.data[propName] = propResult.data;
        }

        // Handle unknown properties
        if (!options.allowUnknownFields) {
            for (const propName of Object.keys(value)) {
                if (!schema.properties.hasOwnProperty(propName)) {
                    const propPath = path ? `${path}.${propName}` : propName;
                    result.errors.push({
                        path: propPath,
                        message: 'Unknown property',
                        code: 'UNKNOWN_PROPERTY'
                    });
                }
            }
        } else {
            // Copy unknown properties
            for (const propName of Object.keys(value)) {
                if (!schema.properties.hasOwnProperty(propName)) {
                    result.data[propName] = value[propName];
                }
            }
        }

        return result;
    }

    /**
     * Validate array items
     * @param {Array} value - Array to validate
     * @param {Object} schema - Array schema
     * @param {string} path - Current path
     * @param {Object} options - Validation options
     * @returns {Object} Validation result
     * @private
     */
    _validateArray(value, schema, path, options) {
        const result = {
            data: [],
            errors: [],
            warnings: []
        };

        if (!Array.isArray(value)) {
            result.errors.push({
                path,
                message: 'Expected array',
                code: 'INVALID_TYPE'
            });
            return result;
        }

        // Validate each item
        for (let i = 0; i < value.length; i++) {
            const itemPath = `${path}[${i}]`;
            const itemResult = this._validateValue(value[i], schema.items, itemPath, options);
            result.errors.push(...itemResult.errors);
            result.warnings.push(...itemResult.warnings);
            result.data[i] = itemResult.data;
        }

        return result;
    }

    /**
     * Setup built-in validators
     * @private
     */
    _setupBuiltInValidators() {
        // ID validator
        this.registerValidator('id', (value) => {
            return typeof value === 'string' && value.length > 0 && /^[a-zA-Z0-9_-]+$/.test(value);
        });

        // Non-empty string validator
        this.registerValidator('nonEmptyString', (value) => {
            return typeof value === 'string' && value.trim().length > 0;
        });

        // Positive number validator
        this.registerValidator('positiveNumber', (value) => {
            return typeof value === 'number' && value > 0;
        });

        // Safe HTML validator (basic)
        this.registerValidator('safeHtml', (value) => {
            if (typeof value !== 'string') return false;
            
            // Basic check for dangerous tags
            const dangerousTags = /<script|<iframe|<object|<embed|<link|<meta|<style/i;
            return !dangerousTags.test(value);
        });
    }
}

// Create and export singleton validator instance
export const validator = new Validator();

// Export utility functions
export const validate = (data, schema, options) => validator.validate(data, schema, options);
export const validateAndThrow = (data, schema, options) => validator.validateAndThrow(data, schema, options);

export default Validator;

