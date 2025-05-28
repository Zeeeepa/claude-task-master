/**
 * @fileoverview Validation Result Model Tests
 * @description Comprehensive tests for the ValidationResult model
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ValidationResult } from '../../../src/ai_cicd_system/database/models/ValidationResult.js';

describe('ValidationResult Model', () => {
    let validationResult;
    const validTaskId = '123e4567-e89b-12d3-a456-426614174000';
    const validArtifactId = '987fcdeb-51a2-43d1-9f12-345678901234';

    beforeEach(() => {
        validationResult = new ValidationResult({
            task_id: validTaskId,
            artifact_id: validArtifactId,
            validation_type: 'syntax',
            validator_name: 'ESLint',
            validation_status: 'pending'
        });
    });

    describe('Constructor', () => {
        test('should create validation result with default values', () => {
            const emptyResult = new ValidationResult();
            
            expect(emptyResult.id).toBeDefined();
            expect(emptyResult.validation_type).toBe('syntax');
            expect(emptyResult.validation_status).toBe('pending');
            expect(emptyResult.max_score).toBe(100);
            expect(emptyResult.issues_found).toBe(0);
            expect(emptyResult.suggestions).toEqual([]);
        });

        test('should create validation result with provided data', () => {
            expect(validationResult.task_id).toBe(validTaskId);
            expect(validationResult.artifact_id).toBe(validArtifactId);
            expect(validationResult.validation_type).toBe('syntax');
            expect(validationResult.validator_name).toBe('ESLint');
        });
    });

    describe('Validation', () => {
        test('should validate valid result', () => {
            const result = validationResult.validate();
            
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should require task_id', () => {
            validationResult.task_id = null;
            const result = validationResult.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Task ID is required');
        });

        test('should require validator_name', () => {
            validationResult.validator_name = '';
            const result = validationResult.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Validator name is required');
        });

        test('should validate validation_type', () => {
            validationResult.validation_type = 'invalid_type';
            const result = validationResult.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid validation type');
        });

        test('should validate validation_status', () => {
            validationResult.validation_status = 'invalid_status';
            const result = validationResult.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid validation status');
        });

        test('should validate score range', () => {
            validationResult.score = -1;
            let result = validationResult.validate();
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Score cannot be negative');

            validationResult.score = 150;
            validationResult.max_score = 100;
            result = validationResult.validate();
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Score cannot exceed max score');
        });

        test('should validate max_score', () => {
            validationResult.max_score = -1;
            const result = validationResult.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Max score must be positive');
        });

        test('should validate issue counts', () => {
            validationResult.issues_critical = -1;
            let result = validationResult.validate();
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Issue counts cannot be negative');

            validationResult.issues_critical = 5;
            validationResult.issues_major = 3;
            validationResult.issues_minor = 2;
            validationResult.issues_found = 5; // Less than sum
            result = validationResult.validate();
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Sum of categorized issues cannot exceed total issues found');
        });

        test('should validate execution_time_ms', () => {
            validationResult.execution_time_ms = -1;
            const result = validationResult.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Execution time cannot be negative');
        });

        test('should warn about status consistency', () => {
            validationResult.validation_status = 'completed';
            validationResult.completed_at = null;
            let result = validationResult.validate();
            expect(result.warnings).toContain('Completed status should have completion timestamp');

            validationResult.validation_status = 'running';
            validationResult.completed_at = new Date();
            result = validationResult.validate();
            expect(result.warnings).toContain('Running status should not have completion timestamp');
        });
    });

    describe('Score Calculation', () => {
        test('should calculate score based on issues', () => {
            validationResult.max_score = 100;
            validationResult.issues_critical = 1;
            validationResult.issues_major = 2;
            validationResult.issues_minor = 3;
            
            const score = validationResult.calculateScore();
            // Default weights: critical=10, major=5, minor=1
            // Deductions: 1*10 + 2*5 + 3*1 = 23
            // Score: 100 - 23 = 77
            expect(score).toBe(77);
            expect(validationResult.score).toBe(77);
        });

        test('should use custom weights', () => {
            validationResult.max_score = 100;
            validationResult.issues_critical = 1;
            validationResult.issues_major = 1;
            validationResult.issues_minor = 1;
            
            const weights = { critical: 20, major: 10, minor: 2 };
            const score = validationResult.calculateScore(weights);
            // Deductions: 1*20 + 1*10 + 1*2 = 32
            // Score: 100 - 32 = 68
            expect(score).toBe(68);
        });

        test('should not go below zero', () => {
            validationResult.max_score = 10;
            validationResult.issues_critical = 5;
            
            const score = validationResult.calculateScore();
            expect(score).toBe(0);
        });

        test('should return null for invalid max_score', () => {
            validationResult.max_score = null;
            const score = validationResult.calculateScore();
            expect(score).toBeNull();
        });
    });

    describe('Grade Calculation', () => {
        test('should calculate grades correctly', () => {
            validationResult.max_score = 100;
            
            validationResult.score = 95;
            expect(validationResult.getGrade()).toBe('A');
            
            validationResult.score = 85;
            expect(validationResult.getGrade()).toBe('B');
            
            validationResult.score = 75;
            expect(validationResult.getGrade()).toBe('C');
            
            validationResult.score = 65;
            expect(validationResult.getGrade()).toBe('D');
            
            validationResult.score = 55;
            expect(validationResult.getGrade()).toBe('F');
        });

        test('should return N/A for missing score or max_score', () => {
            validationResult.score = null;
            expect(validationResult.getGrade()).toBe('N/A');
            
            validationResult.score = 80;
            validationResult.max_score = null;
            expect(validationResult.getGrade()).toBe('N/A');
        });
    });

    describe('Severity Level', () => {
        test('should determine severity levels', () => {
            validationResult.issues_critical = 1;
            expect(validationResult.getSeverityLevel()).toBe('critical');
            
            validationResult.issues_critical = 0;
            validationResult.issues_major = 1;
            expect(validationResult.getSeverityLevel()).toBe('major');
            
            validationResult.issues_major = 0;
            validationResult.issues_minor = 1;
            expect(validationResult.getSeverityLevel()).toBe('minor');
            
            validationResult.issues_minor = 0;
            validationResult.validation_status = 'failed';
            expect(validationResult.getSeverityLevel()).toBe('error');
            
            validationResult.validation_status = 'passed';
            expect(validationResult.getSeverityLevel()).toBe('clean');
        });
    });

    describe('Status Checks', () => {
        test('should check if passed', () => {
            validationResult.validation_status = 'passed';
            expect(validationResult.isPassed()).toBe(true);
            
            validationResult.validation_status = 'failed';
            expect(validationResult.isPassed()).toBe(false);
        });

        test('should check if failed', () => {
            validationResult.validation_status = 'failed';
            expect(validationResult.isFailed()).toBe(true);
            
            validationResult.validation_status = 'error';
            expect(validationResult.isFailed()).toBe(true);
            
            validationResult.validation_status = 'passed';
            expect(validationResult.isFailed()).toBe(false);
        });

        test('should check if complete', () => {
            const completeStatuses = ['passed', 'failed', 'warning', 'error', 'skipped'];
            const incompleteStatuses = ['pending', 'running'];
            
            completeStatuses.forEach(status => {
                validationResult.validation_status = status;
                expect(validationResult.isComplete()).toBe(true);
            });
            
            incompleteStatuses.forEach(status => {
                validationResult.validation_status = status;
                expect(validationResult.isComplete()).toBe(false);
            });
        });
    });

    describe('Lifecycle Management', () => {
        test('should mark as started', () => {
            const startTime = new Date();
            validationResult.markStarted();
            
            expect(validationResult.validation_status).toBe('running');
            expect(validationResult.started_at).toBeInstanceOf(Date);
            expect(validationResult.started_at.getTime()).toBeGreaterThanOrEqual(startTime.getTime());
            expect(validationResult.completed_at).toBeNull();
        });

        test('should mark as completed', () => {
            validationResult.started_at = new Date(Date.now() - 1000);
            const results = {
                score: 85,
                issues_found: 3,
                issues_critical: 0,
                issues_major: 1,
                issues_minor: 2
            };
            
            validationResult.markCompleted('passed', results);
            
            expect(validationResult.validation_status).toBe('passed');
            expect(validationResult.completed_at).toBeInstanceOf(Date);
            expect(validationResult.execution_time_ms).toBeGreaterThan(0);
            expect(validationResult.score).toBe(85);
            expect(validationResult.issues_found).toBe(3);
        });
    });

    describe('Issue and Suggestion Management', () => {
        test('should add issues', () => {
            const issue = {
                severity: 'major',
                message: 'Unused variable',
                line: 10,
                rule: 'no-unused-vars'
            };
            
            validationResult.addIssue(issue);
            
            expect(validationResult.issues_found).toBe(1);
            expect(validationResult.issues_major).toBe(1);
            expect(validationResult.validation_details.issues).toHaveLength(1);
            expect(validationResult.validation_details.issues[0]).toMatchObject({
                severity: 'major',
                message: 'Unused variable',
                line: 10,
                rule: 'no-unused-vars'
            });
        });

        test('should add suggestions', () => {
            const suggestion = {
                type: 'improvement',
                message: 'Consider using const instead of let',
                priority: 'medium'
            };
            
            validationResult.addSuggestion(suggestion);
            
            expect(validationResult.suggestions).toHaveLength(1);
            expect(validationResult.suggestions[0]).toMatchObject({
                type: 'improvement',
                message: 'Consider using const instead of let',
                priority: 'medium'
            });
        });
    });

    describe('Summary and Record Conversion', () => {
        test('should generate summary', () => {
            validationResult.score = 85;
            validationResult.issues_critical = 1;
            validationResult.validation_status = 'passed';
            
            const summary = validationResult.getSummary();
            
            expect(summary).toHaveProperty('id');
            expect(summary).toHaveProperty('task_id');
            expect(summary).toHaveProperty('validation_type');
            expect(summary).toHaveProperty('status');
            expect(summary).toHaveProperty('score');
            expect(summary).toHaveProperty('grade');
            expect(summary).toHaveProperty('severity_level');
            expect(summary).toHaveProperty('is_passed');
            expect(summary).toHaveProperty('is_failed');
            expect(summary).toHaveProperty('is_complete');
            
            expect(summary.is_passed).toBe(true);
            expect(summary.severity_level).toBe('critical');
        });

        test('should convert to database record', () => {
            validationResult.validation_details = { test: true };
            validationResult.suggestions = [{ message: 'test' }];
            
            const record = validationResult.toRecord();
            
            expect(record).toHaveProperty('id');
            expect(record).toHaveProperty('task_id');
            expect(record).toHaveProperty('validation_details');
            expect(record).toHaveProperty('suggestions');
            expect(record).toHaveProperty('metadata');
            
            expect(typeof record.validation_details).toBe('string');
            expect(typeof record.suggestions).toBe('string');
            expect(typeof record.metadata).toBe('string');
        });

        test('should create from database record', () => {
            const record = {
                id: validationResult.id,
                task_id: validTaskId,
                validation_details: '{"test": true}',
                suggestions: '[{"message": "test"}]',
                metadata: '{"custom": "data"}'
            };
            
            const fromRecord = ValidationResult.fromRecord(record);
            
            expect(fromRecord.id).toBe(record.id);
            expect(fromRecord.task_id).toBe(record.task_id);
            expect(fromRecord.validation_details).toEqual({ test: true });
            expect(fromRecord.suggestions).toEqual([{ message: 'test' }]);
            expect(fromRecord.metadata).toEqual({ custom: 'data' });
        });
    });

    describe('Static Factory Methods', () => {
        test('should create for Claude Code', () => {
            const options = {
                validation_type: 'best_practices',
                max_score: 100,
                claude_version: '3.5',
                config: { strict: true }
            };
            
            const claudeResult = ValidationResult.forClaudeCode(validTaskId, validArtifactId, options);
            
            expect(claudeResult.task_id).toBe(validTaskId);
            expect(claudeResult.artifact_id).toBe(validArtifactId);
            expect(claudeResult.validation_type).toBe('best_practices');
            expect(claudeResult.validator_name).toBe('Claude Code');
            expect(claudeResult.max_score).toBe(100);
            expect(claudeResult.metadata.claude_version).toBe('3.5');
            expect(claudeResult.metadata.validation_config).toEqual({ strict: true });
        });
    });

    describe('Edge Cases', () => {
        test('should handle malformed JSON in fromRecord', () => {
            const record = {
                id: validationResult.id,
                task_id: validTaskId,
                validation_details: 'invalid json',
                suggestions: 'invalid json',
                metadata: 'invalid json'
            };
            
            const fromRecord = ValidationResult.fromRecord(record);
            expect(fromRecord.validation_details).toEqual({});
            expect(fromRecord.suggestions).toEqual([]);
            expect(fromRecord.metadata).toEqual({});
        });

        test('should handle default issue severity', () => {
            const issue = { message: 'Test issue' };
            validationResult.addIssue(issue);
            
            expect(validationResult.issues_minor).toBe(1);
            expect(validationResult.validation_details.issues[0].severity).toBe('minor');
        });

        test('should handle default suggestion values', () => {
            const suggestion = { message: 'Test suggestion' };
            validationResult.addSuggestion(suggestion);
            
            expect(validationResult.suggestions[0].type).toBe('improvement');
            expect(validationResult.suggestions[0].priority).toBe('low');
        });
    });
});

