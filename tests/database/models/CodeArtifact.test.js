/**
 * @fileoverview Code Artifact Model Tests
 * @description Comprehensive tests for the CodeArtifact model
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { CodeArtifact } from '../../../src/ai_cicd_system/database/models/CodeArtifact.js';

describe('CodeArtifact Model', () => {
    let artifact;
    const validTaskId = '123e4567-e89b-12d3-a456-426614174000';

    beforeEach(() => {
        artifact = new CodeArtifact({
            task_id: validTaskId,
            file_path: 'src/components/Button.jsx',
            content: 'export const Button = () => <button>Click me</button>;',
            artifact_type: 'source_code'
        });
    });

    describe('Constructor', () => {
        test('should create artifact with default values', () => {
            const emptyArtifact = new CodeArtifact();
            
            expect(emptyArtifact.id).toBeDefined();
            expect(emptyArtifact.artifact_type).toBe('source_code');
            expect(emptyArtifact.storage_type).toBe('database');
            expect(emptyArtifact.content_size).toBe(0);
            expect(emptyArtifact.metadata).toEqual({});
        });

        test('should create artifact with provided data', () => {
            expect(artifact.task_id).toBe(validTaskId);
            expect(artifact.file_path).toBe('src/components/Button.jsx');
            expect(artifact.artifact_type).toBe('source_code');
        });
    });

    describe('Validation', () => {
        test('should validate valid artifact', () => {
            const result = artifact.validate();
            
            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('should require task_id', () => {
            artifact.task_id = null;
            const result = artifact.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Task ID is required');
        });

        test('should require file_path', () => {
            artifact.file_path = '';
            const result = artifact.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('File path is required');
        });

        test('should validate file_path length', () => {
            artifact.file_path = 'a'.repeat(501);
            const result = artifact.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('File path must be 500 characters or less');
        });

        test('should validate artifact_type', () => {
            artifact.artifact_type = 'invalid_type';
            const result = artifact.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid artifact type');
        });

        test('should validate storage_type', () => {
            artifact.storage_type = 'invalid_storage';
            const result = artifact.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('Invalid storage type');
        });

        test('should validate content_size', () => {
            artifact.content_size = -1;
            const result = artifact.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Content size cannot be negative');
        });

        test('should warn about missing storage_location for non-database storage', () => {
            artifact.storage_type = 's3';
            artifact.storage_location = null;
            const result = artifact.validate();
            
            expect(result.valid).toBe(false);
            expect(result.errors).toContain('Storage location is required for non-database storage types');
        });
    });

    describe('Content Hash Generation', () => {
        test('should generate content hash', () => {
            const hash = artifact.generateContentHash();
            
            expect(hash).toBeDefined();
            expect(hash).toHaveLength(64); // SHA-256 hex length
            expect(artifact.content_hash).toBe(hash);
            expect(artifact.content_size).toBeGreaterThan(0);
        });

        test('should return null for empty content', () => {
            artifact.content = '';
            const hash = artifact.generateContentHash();
            
            expect(hash).toBeNull();
        });

        test('should generate consistent hash for same content', () => {
            const hash1 = artifact.generateContentHash();
            const hash2 = artifact.generateContentHash();
            
            expect(hash1).toBe(hash2);
        });
    });

    describe('Content Integrity Verification', () => {
        test('should verify content integrity', () => {
            artifact.generateContentHash();
            const isValid = artifact.verifyContentIntegrity();
            
            expect(isValid).toBe(true);
        });

        test('should detect content tampering', () => {
            artifact.generateContentHash();
            artifact.content = 'modified content';
            const isValid = artifact.verifyContentIntegrity();
            
            expect(isValid).toBe(false);
        });

        test('should return false for missing content or hash', () => {
            artifact.content = '';
            artifact.content_hash = null;
            const isValid = artifact.verifyContentIntegrity();
            
            expect(isValid).toBe(false);
        });
    });

    describe('File Extension and Content Type', () => {
        test('should get file extension', () => {
            expect(artifact.getFileExtension()).toBe('jsx');
            
            artifact.file_path = 'script.js';
            expect(artifact.getFileExtension()).toBe('js');
            
            artifact.file_path = 'README';
            expect(artifact.getFileExtension()).toBe('');
        });

        test('should infer content type from extension', () => {
            artifact.file_path = 'component.jsx';
            expect(artifact.inferContentType()).toBe('application/javascript');
            
            artifact.file_path = 'styles.css';
            expect(artifact.inferContentType()).toBe('text/css');
            
            artifact.file_path = 'data.json';
            expect(artifact.inferContentType()).toBe('application/json');
            
            artifact.file_path = 'unknown.xyz';
            expect(artifact.inferContentType()).toBe('text/plain');
        });
    });

    describe('File Type Detection', () => {
        test('should detect source code files', () => {
            artifact.file_path = 'component.jsx';
            expect(artifact.isSourceCode()).toBe(true);
            
            artifact.file_path = 'script.py';
            expect(artifact.isSourceCode()).toBe(true);
            
            artifact.file_path = 'README.md';
            expect(artifact.isSourceCode()).toBe(false);
        });

        test('should detect test files', () => {
            artifact.file_path = 'component.test.js';
            expect(artifact.isTestFile()).toBe(true);
            
            artifact.file_path = 'utils.spec.ts';
            expect(artifact.isTestFile()).toBe(true);
            
            artifact.file_path = 'test_helper.py';
            expect(artifact.isTestFile()).toBe(true);
            
            artifact.artifact_type = 'test_file';
            artifact.file_path = 'regular.js';
            expect(artifact.isTestFile()).toBe(true);
            
            artifact.artifact_type = 'source_code';
            artifact.file_path = 'regular.js';
            expect(artifact.isTestFile()).toBe(false);
        });
    });

    describe('Summary and Record Conversion', () => {
        test('should generate summary', () => {
            artifact.generateContentHash();
            const summary = artifact.getSummary();
            
            expect(summary).toHaveProperty('id');
            expect(summary).toHaveProperty('task_id');
            expect(summary).toHaveProperty('file_path');
            expect(summary).toHaveProperty('artifact_type');
            expect(summary).toHaveProperty('is_source_code');
            expect(summary).toHaveProperty('is_test_file');
            expect(summary).toHaveProperty('has_content');
            expect(summary).toHaveProperty('integrity_verified');
            
            expect(summary.has_content).toBe(true);
            expect(summary.integrity_verified).toBe(true);
        });

        test('should convert to database record', () => {
            const record = artifact.toRecord();
            
            expect(record).toHaveProperty('id');
            expect(record).toHaveProperty('task_id');
            expect(record).toHaveProperty('file_path');
            expect(record).toHaveProperty('content_hash');
            expect(record).toHaveProperty('content_size');
            expect(record).toHaveProperty('metadata');
            
            expect(typeof record.metadata).toBe('string'); // Should be JSON string
        });

        test('should create from database record', () => {
            const record = {
                id: artifact.id,
                task_id: validTaskId,
                file_path: 'test.js',
                content: 'console.log("test");',
                metadata: '{"test": true}'
            };
            
            const fromRecord = CodeArtifact.fromRecord(record);
            
            expect(fromRecord.id).toBe(record.id);
            expect(fromRecord.task_id).toBe(record.task_id);
            expect(fromRecord.metadata).toEqual({ test: true });
        });
    });

    describe('Static Factory Methods', () => {
        test('should create from content', () => {
            const content = 'const test = "hello";';
            const filePath = 'test.js';
            
            const fromContent = CodeArtifact.fromContent(filePath, content, validTaskId);
            
            expect(fromContent.file_path).toBe(filePath);
            expect(fromContent.content).toBe(content);
            expect(fromContent.task_id).toBe(validTaskId);
            expect(fromContent.content_hash).toBeDefined();
            expect(fromContent.content_type).toBe('application/javascript');
        });

        test('should create from content with options', () => {
            const content = 'test content';
            const filePath = 'test.txt';
            const options = {
                artifact_type: 'documentation',
                storage_type: 's3',
                metadata: { custom: 'data' }
            };
            
            const fromContent = CodeArtifact.fromContent(filePath, content, validTaskId, options);
            
            expect(fromContent.artifact_type).toBe('documentation');
            expect(fromContent.storage_type).toBe('s3');
            expect(fromContent.metadata).toEqual({ custom: 'data' });
        });
    });

    describe('Edge Cases', () => {
        test('should handle malformed JSON in fromRecord', () => {
            const record = {
                id: artifact.id,
                task_id: validTaskId,
                metadata: 'invalid json'
            };
            
            const fromRecord = CodeArtifact.fromRecord(record);
            expect(fromRecord.metadata).toEqual({});
        });

        test('should handle empty file path in getFileExtension', () => {
            artifact.file_path = '';
            expect(artifact.getFileExtension()).toBe('');
        });

        test('should auto-generate hash and infer content type in toRecord', () => {
            artifact.content_hash = null;
            artifact.content_type = 'text/plain';
            
            const record = artifact.toRecord();
            
            expect(record.content_hash).toBeDefined();
            expect(record.content_type).toBe('application/javascript'); // Inferred from .jsx
        });
    });
});

