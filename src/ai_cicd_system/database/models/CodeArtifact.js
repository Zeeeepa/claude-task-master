/**
 * @fileoverview Code Artifact Model
 * @description Model for managing code artifacts, tests, documentation and other CI/CD generated files
 */

import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

/**
 * Code Artifact model class
 */
export class CodeArtifact {
    constructor(data = {}) {
        this.id = data.id || uuidv4();
        this.task_id = data.task_id || null;
        this.artifact_type = data.artifact_type || 'source_code';
        this.file_path = data.file_path || '';
        this.content_hash = data.content_hash || null;
        this.content_size = data.content_size || 0;
        this.content_type = data.content_type || 'text/plain';
        this.storage_location = data.storage_location || null;
        this.storage_type = data.storage_type || 'database';
        this.content = data.content || '';
        this.metadata = data.metadata || {};
        this.created_at = data.created_at || new Date();
        this.updated_at = data.updated_at || new Date();
    }

    /**
     * Validate code artifact data
     * @returns {Object} Validation result
     */
    validate() {
        const errors = [];
        const warnings = [];

        // Required fields
        if (!this.task_id) {
            errors.push('Task ID is required');
        }

        if (!this.file_path || this.file_path.trim().length === 0) {
            errors.push('File path is required');
        }

        if (this.file_path && this.file_path.length > 500) {
            errors.push('File path must be 500 characters or less');
        }

        // Artifact type validation
        const validTypes = [
            'source_code', 'test_file', 'documentation', 'configuration',
            'build_script', 'deployment_config', 'schema_migration', 'other'
        ];
        if (!validTypes.includes(this.artifact_type)) {
            errors.push(`Invalid artifact type. Must be one of: ${validTypes.join(', ')}`);
        }

        // Storage type validation
        const validStorageTypes = ['database', 'file_system', 's3', 'azure_blob', 'gcs'];
        if (!validStorageTypes.includes(this.storage_type)) {
            errors.push(`Invalid storage type. Must be one of: ${validStorageTypes.join(', ')}`);
        }

        // Content validation
        if (this.content_size < 0) {
            errors.push('Content size cannot be negative');
        }

        if (this.storage_type === 'database' && !this.content) {
            warnings.push('Content is empty for database storage type');
        }

        if (this.storage_type !== 'database' && !this.storage_location) {
            errors.push('Storage location is required for non-database storage types');
        }

        // Content hash validation
        if (this.content && !this.content_hash) {
            warnings.push('Content hash should be generated for content integrity');
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Generate content hash from content
     * @returns {string} SHA-256 hash of content
     */
    generateContentHash() {
        if (!this.content) {
            return null;
        }
        
        const hash = crypto.createHash('sha256');
        hash.update(this.content, 'utf8');
        this.content_hash = hash.digest('hex');
        this.content_size = Buffer.byteLength(this.content, 'utf8');
        
        return this.content_hash;
    }

    /**
     * Verify content integrity
     * @returns {boolean} True if content matches hash
     */
    verifyContentIntegrity() {
        if (!this.content || !this.content_hash) {
            return false;
        }

        const currentHash = crypto.createHash('sha256');
        currentHash.update(this.content, 'utf8');
        return currentHash.digest('hex') === this.content_hash;
    }

    /**
     * Get file extension from file path
     * @returns {string} File extension
     */
    getFileExtension() {
        if (!this.file_path) return '';
        const parts = this.file_path.split('.');
        return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
    }

    /**
     * Determine content type from file extension
     * @returns {string} MIME type
     */
    inferContentType() {
        const extension = this.getFileExtension();
        const mimeTypes = {
            'js': 'application/javascript',
            'ts': 'application/typescript',
            'jsx': 'application/javascript',
            'tsx': 'application/typescript',
            'py': 'text/x-python',
            'java': 'text/x-java-source',
            'cpp': 'text/x-c++src',
            'c': 'text/x-csrc',
            'h': 'text/x-chdr',
            'css': 'text/css',
            'html': 'text/html',
            'xml': 'application/xml',
            'json': 'application/json',
            'yaml': 'application/x-yaml',
            'yml': 'application/x-yaml',
            'md': 'text/markdown',
            'txt': 'text/plain',
            'sql': 'application/sql',
            'sh': 'application/x-sh',
            'bat': 'application/x-bat',
            'dockerfile': 'text/x-dockerfile'
        };

        return mimeTypes[extension] || 'text/plain';
    }

    /**
     * Check if artifact is a source code file
     * @returns {boolean} True if source code
     */
    isSourceCode() {
        const sourceExtensions = ['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs'];
        return sourceExtensions.includes(this.getFileExtension());
    }

    /**
     * Check if artifact is a test file
     * @returns {boolean} True if test file
     */
    isTestFile() {
        const testPatterns = [
            /\.test\./i,
            /\.spec\./i,
            /test_.*\.py$/i,
            /_test\.go$/i,
            /Test\.java$/i
        ];
        
        return testPatterns.some(pattern => pattern.test(this.file_path)) || 
               this.artifact_type === 'test_file';
    }

    /**
     * Get artifact summary for display
     * @returns {Object} Summary information
     */
    getSummary() {
        return {
            id: this.id,
            task_id: this.task_id,
            file_path: this.file_path,
            artifact_type: this.artifact_type,
            content_type: this.content_type,
            content_size: this.content_size,
            storage_type: this.storage_type,
            is_source_code: this.isSourceCode(),
            is_test_file: this.isTestFile(),
            has_content: !!this.content,
            integrity_verified: this.verifyContentIntegrity(),
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    /**
     * Convert to database record format
     * @returns {Object} Database record
     */
    toRecord() {
        // Auto-generate content hash if content exists but hash is missing
        if (this.content && !this.content_hash) {
            this.generateContentHash();
        }

        // Auto-infer content type if not set
        if (!this.content_type || this.content_type === 'text/plain') {
            this.content_type = this.inferContentType();
        }

        return {
            id: this.id,
            task_id: this.task_id,
            artifact_type: this.artifact_type,
            file_path: this.file_path,
            content_hash: this.content_hash,
            content_size: this.content_size,
            content_type: this.content_type,
            storage_location: this.storage_location,
            storage_type: this.storage_type,
            content: this.content,
            metadata: JSON.stringify(this.metadata),
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }

    /**
     * Create from database record
     * @param {Object} record - Database record
     * @returns {CodeArtifact} CodeArtifact instance
     */
    static fromRecord(record) {
        const data = { ...record };
        
        // Parse JSON fields
        if (typeof data.metadata === 'string') {
            try {
                data.metadata = JSON.parse(data.metadata);
            } catch (e) {
                data.metadata = {};
            }
        }

        return new CodeArtifact(data);
    }

    /**
     * Create artifact from file content
     * @param {string} filePath - File path
     * @param {string} content - File content
     * @param {string} taskId - Associated task ID
     * @param {Object} options - Additional options
     * @returns {CodeArtifact} CodeArtifact instance
     */
    static fromContent(filePath, content, taskId, options = {}) {
        const artifact = new CodeArtifact({
            task_id: taskId,
            file_path: filePath,
            content: content,
            artifact_type: options.artifact_type || 'source_code',
            storage_type: options.storage_type || 'database',
            metadata: options.metadata || {}
        });

        artifact.generateContentHash();
        artifact.content_type = artifact.inferContentType();

        return artifact;
    }
}

export default CodeArtifact;

