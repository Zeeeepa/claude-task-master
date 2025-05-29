/**
 * Linear Correlation Mapper
 * 
 * Maps Task Master tasks to Linear issues, tracks parent-child relationships,
 * maintains bidirectional references, and handles orphaned issues cleanup.
 */

export class LinearCorrelationMapper {
    constructor(config = {}) {
        this.config = {
            enableOrphanCleanup: config.enableOrphanCleanup !== false,
            orphanRetentionDays: config.orphanRetentionDays || 7,
            batchSize: config.batchSize || 50,
            enableCaching: config.enableCaching !== false,
            cacheTimeout: config.cacheTimeout || 300000, // 5 minutes
            ...config
        };

        // Database connection (injected)
        this.database = null;
        
        // Cache for correlations
        this.correlationCache = new Map();
        this.hierarchyCache = new Map();
        
        // Cleanup timer
        this.cleanupTimer = null;
    }

    /**
     * Initialize correlation mapper
     */
    async initialize(database) {
        this.database = database;
        
        // Ensure correlation tables exist
        await this.ensureCorrelationTables();
        
        // Start cleanup timer if enabled
        if (this.config.enableOrphanCleanup) {
            this.startCleanupTimer();
        }
        
        console.log('Linear Correlation Mapper initialized');
    }

    // ==================== CORRELATION MANAGEMENT ====================

    /**
     * Create correlation between Task Master task and Linear issue
     */
    async createCorrelation(correlationData) {
        const {
            taskId,
            linearIssueId,
            parentTaskId = null,
            parentLinearIssueId = null,
            correlationType = 'task_to_issue',
            metadata = {}
        } = correlationData;

        try {
            // Check if correlation already exists
            const existing = await this.getCorrelationByTaskId(taskId);
            if (existing) {
                throw new Error(`Correlation already exists for task ${taskId}`);
            }

            const correlation = {
                id: this.generateCorrelationId(),
                task_id: taskId,
                linear_issue_id: linearIssueId,
                parent_task_id: parentTaskId,
                parent_linear_issue_id: parentLinearIssueId,
                correlation_type: correlationType,
                status: 'active',
                metadata: metadata,
                created_at: new Date(),
                updated_at: new Date(),
                last_synced_at: new Date()
            };

            await this.storeCorrelation(correlation);
            
            // Update hierarchy if parent exists
            if (parentTaskId || parentLinearIssueId) {
                await this.updateHierarchy(correlation);
            }

            // Clear relevant caches
            this.invalidateCache(taskId, linearIssueId);

            return correlation;

        } catch (error) {
            throw new Error(`Failed to create correlation: ${error.message}`);
        }
    }

    /**
     * Update existing correlation
     */
    async updateCorrelation(correlationId, updateData) {
        try {
            const existing = await this.getCorrelationById(correlationId);
            if (!existing) {
                throw new Error(`Correlation ${correlationId} not found`);
            }

            const updatedCorrelation = {
                ...existing,
                ...updateData,
                updated_at: new Date()
            };

            await this.storeCorrelation(updatedCorrelation);
            
            // Clear caches
            this.invalidateCache(existing.task_id, existing.linear_issue_id);

            return updatedCorrelation;

        } catch (error) {
            throw new Error(`Failed to update correlation: ${error.message}`);
        }
    }

    /**
     * Delete correlation (soft delete)
     */
    async deleteCorrelation(correlationId, reason = 'manual_deletion') {
        try {
            const correlation = await this.getCorrelationById(correlationId);
            if (!correlation) {
                throw new Error(`Correlation ${correlationId} not found`);
            }

            await this.updateCorrelation(correlationId, {
                status: 'deleted',
                deleted_at: new Date(),
                deletion_reason: reason
            });

            // Clear caches
            this.invalidateCache(correlation.task_id, correlation.linear_issue_id);

            return true;

        } catch (error) {
            throw new Error(`Failed to delete correlation: ${error.message}`);
        }
    }

    // ==================== CORRELATION RETRIEVAL ====================

    /**
     * Get correlation by task ID
     */
    async getCorrelationByTaskId(taskId) {
        // Check cache first
        if (this.config.enableCaching) {
            const cached = this.correlationCache.get(`task_${taskId}`);
            if (cached && this.isCacheValid(cached.timestamp)) {
                return cached.data;
            }
        }

        const query = `
            SELECT * FROM linear_correlations 
            WHERE task_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        `;

        const result = await this.database.query(query, [taskId]);
        const correlation = result.rows[0] || null;

        // Cache result
        if (this.config.enableCaching && correlation) {
            this.correlationCache.set(`task_${taskId}`, {
                data: correlation,
                timestamp: Date.now()
            });
        }

        return correlation;
    }

    /**
     * Get correlation by Linear issue ID
     */
    async getCorrelationByLinearIssueId(linearIssueId) {
        // Check cache first
        if (this.config.enableCaching) {
            const cached = this.correlationCache.get(`linear_${linearIssueId}`);
            if (cached && this.isCacheValid(cached.timestamp)) {
                return cached.data;
            }
        }

        const query = `
            SELECT * FROM linear_correlations 
            WHERE linear_issue_id = $1 AND status = 'active'
            ORDER BY created_at DESC LIMIT 1
        `;

        const result = await this.database.query(query, [linearIssueId]);
        const correlation = result.rows[0] || null;

        // Cache result
        if (this.config.enableCaching && correlation) {
            this.correlationCache.set(`linear_${linearIssueId}`, {
                data: correlation,
                timestamp: Date.now()
            });
        }

        return correlation;
    }

    /**
     * Get correlation by ID
     */
    async getCorrelationById(correlationId) {
        const query = `
            SELECT * FROM linear_correlations 
            WHERE id = $1
        `;

        const result = await this.database.query(query, [correlationId]);
        return result.rows[0] || null;
    }

    /**
     * Get all correlations for a parent task
     */
    async getChildCorrelations(parentTaskId) {
        const query = `
            SELECT * FROM linear_correlations 
            WHERE parent_task_id = $1 AND status = 'active'
            ORDER BY created_at ASC
        `;

        const result = await this.database.query(query, [parentTaskId]);
        return result.rows;
    }

    /**
     * Get correlation hierarchy
     */
    async getCorrelationHierarchy(rootTaskId) {
        // Check cache first
        if (this.config.enableCaching) {
            const cached = this.hierarchyCache.get(rootTaskId);
            if (cached && this.isCacheValid(cached.timestamp)) {
                return cached.data;
            }
        }

        const hierarchy = await this.buildHierarchy(rootTaskId);

        // Cache result
        if (this.config.enableCaching) {
            this.hierarchyCache.set(rootTaskId, {
                data: hierarchy,
                timestamp: Date.now()
            });
        }

        return hierarchy;
    }

    /**
     * Build correlation hierarchy recursively
     */
    async buildHierarchy(taskId, level = 0) {
        const correlation = await this.getCorrelationByTaskId(taskId);
        if (!correlation) {
            return null;
        }

        const children = await this.getChildCorrelations(taskId);
        const childHierarchies = [];

        for (const child of children) {
            const childHierarchy = await this.buildHierarchy(child.task_id, level + 1);
            if (childHierarchy) {
                childHierarchies.push(childHierarchy);
            }
        }

        return {
            correlation,
            level,
            children: childHierarchies,
            hasChildren: childHierarchies.length > 0
        };
    }

    // ==================== BIDIRECTIONAL REFERENCES ====================

    /**
     * Create bidirectional reference
     */
    async createBidirectionalReference(taskId, linearIssueId, referenceType = 'sync') {
        try {
            // Create Task Master -> Linear reference
            await this.createTaskReference(taskId, linearIssueId, referenceType);
            
            // Create Linear -> Task Master reference
            await this.createLinearReference(linearIssueId, taskId, referenceType);

            return {
                task_id: taskId,
                linear_issue_id: linearIssueId,
                reference_type: referenceType,
                created_at: new Date()
            };

        } catch (error) {
            throw new Error(`Failed to create bidirectional reference: ${error.message}`);
        }
    }

    /**
     * Create Task Master reference
     */
    async createTaskReference(taskId, linearIssueId, referenceType) {
        const query = `
            INSERT INTO task_linear_references (
                task_id, linear_issue_id, reference_type, created_at
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (task_id, linear_issue_id) 
            DO UPDATE SET updated_at = NOW()
        `;

        await this.database.query(query, [taskId, linearIssueId, referenceType, new Date()]);
    }

    /**
     * Create Linear reference
     */
    async createLinearReference(linearIssueId, taskId, referenceType) {
        const query = `
            INSERT INTO linear_task_references (
                linear_issue_id, task_id, reference_type, created_at
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (linear_issue_id, task_id) 
            DO UPDATE SET updated_at = NOW()
        `;

        await this.database.query(query, [linearIssueId, taskId, referenceType, new Date()]);
    }

    /**
     * Get bidirectional references for task
     */
    async getTaskReferences(taskId) {
        const query = `
            SELECT tlr.*, lc.linear_issue_id, lc.status as correlation_status
            FROM task_linear_references tlr
            LEFT JOIN linear_correlations lc ON tlr.linear_issue_id = lc.linear_issue_id
            WHERE tlr.task_id = $1
            ORDER BY tlr.created_at DESC
        `;

        const result = await this.database.query(query, [taskId]);
        return result.rows;
    }

    /**
     * Get bidirectional references for Linear issue
     */
    async getLinearReferences(linearIssueId) {
        const query = `
            SELECT ltr.*, lc.task_id, lc.status as correlation_status
            FROM linear_task_references ltr
            LEFT JOIN linear_correlations lc ON ltr.task_id = lc.task_id
            WHERE ltr.linear_issue_id = $1
            ORDER BY ltr.created_at DESC
        `;

        const result = await this.database.query(query, [linearIssueId]);
        return result.rows;
    }

    // ==================== ORPHAN MANAGEMENT ====================

    /**
     * Find orphaned correlations
     */
    async findOrphanedCorrelations() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.orphanRetentionDays);

        const query = `
            SELECT lc.* 
            FROM linear_correlations lc
            LEFT JOIN tasks t ON lc.task_id = t.id
            WHERE lc.status = 'active'
            AND (
                t.id IS NULL 
                OR lc.last_synced_at < $1
            )
            ORDER BY lc.created_at ASC
        `;

        const result = await this.database.query(query, [cutoffDate]);
        return result.rows;
    }

    /**
     * Clean up orphaned correlations
     */
    async cleanupOrphanedCorrelations() {
        try {
            const orphans = await this.findOrphanedCorrelations();
            
            if (orphans.length === 0) {
                return { cleaned: 0, errors: [] };
            }

            console.log(`Found ${orphans.length} orphaned correlations to clean up`);

            const results = {
                cleaned: 0,
                errors: []
            };

            for (const orphan of orphans) {
                try {
                    await this.deleteCorrelation(orphan.id, 'orphan_cleanup');
                    results.cleaned++;
                } catch (error) {
                    results.errors.push({
                        correlation_id: orphan.id,
                        error: error.message
                    });
                }
            }

            console.log(`Cleaned up ${results.cleaned} orphaned correlations`);
            return results;

        } catch (error) {
            throw new Error(`Failed to cleanup orphaned correlations: ${error.message}`);
        }
    }

    /**
     * Start cleanup timer
     */
    startCleanupTimer() {
        // Run cleanup every hour
        this.cleanupTimer = setInterval(async () => {
            try {
                await this.cleanupOrphanedCorrelations();
            } catch (error) {
                console.error('Orphan cleanup error:', error);
            }
        }, 60 * 60 * 1000); // 1 hour

        console.log('Orphan cleanup timer started');
    }

    /**
     * Stop cleanup timer
     */
    stopCleanupTimer() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    // ==================== HIERARCHY MANAGEMENT ====================

    /**
     * Update hierarchy relationships
     */
    async updateHierarchy(correlation) {
        try {
            // Update parent-child relationships in hierarchy table
            if (correlation.parent_task_id) {
                await this.createHierarchyRelationship(
                    correlation.parent_task_id,
                    correlation.task_id,
                    'parent_child'
                );
            }

            // Update Linear issue hierarchy if applicable
            if (correlation.parent_linear_issue_id) {
                await this.createLinearHierarchyRelationship(
                    correlation.parent_linear_issue_id,
                    correlation.linear_issue_id,
                    'parent_child'
                );
            }

        } catch (error) {
            console.error('Failed to update hierarchy:', error);
            // Don't throw - hierarchy is not critical
        }
    }

    /**
     * Create hierarchy relationship
     */
    async createHierarchyRelationship(parentId, childId, relationshipType) {
        const query = `
            INSERT INTO correlation_hierarchy (
                parent_id, child_id, relationship_type, created_at
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (parent_id, child_id) 
            DO UPDATE SET updated_at = NOW()
        `;

        await this.database.query(query, [parentId, childId, relationshipType, new Date()]);
    }

    /**
     * Create Linear hierarchy relationship
     */
    async createLinearHierarchyRelationship(parentIssueId, childIssueId, relationshipType) {
        const query = `
            INSERT INTO linear_hierarchy (
                parent_issue_id, child_issue_id, relationship_type, created_at
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (parent_issue_id, child_issue_id) 
            DO UPDATE SET updated_at = NOW()
        `;

        await this.database.query(query, [parentIssueId, childIssueId, relationshipType, new Date()]);
    }

    /**
     * Get hierarchy path for task
     */
    async getHierarchyPath(taskId) {
        const query = `
            WITH RECURSIVE hierarchy_path AS (
                SELECT task_id, parent_task_id, 0 as level, ARRAY[task_id] as path
                FROM linear_correlations 
                WHERE task_id = $1 AND status = 'active'
                
                UNION ALL
                
                SELECT lc.task_id, lc.parent_task_id, hp.level + 1, hp.path || lc.task_id
                FROM linear_correlations lc
                JOIN hierarchy_path hp ON lc.task_id = hp.parent_task_id
                WHERE lc.status = 'active' AND NOT lc.task_id = ANY(hp.path)
            )
            SELECT * FROM hierarchy_path ORDER BY level DESC
        `;

        const result = await this.database.query(query, [taskId]);
        return result.rows;
    }

    // ==================== DATABASE OPERATIONS ====================

    /**
     * Store correlation in database
     */
    async storeCorrelation(correlation) {
        const query = `
            INSERT INTO linear_correlations (
                id, task_id, linear_issue_id, parent_task_id, parent_linear_issue_id,
                correlation_type, status, metadata, created_at, updated_at, last_synced_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO UPDATE SET
                task_id = EXCLUDED.task_id,
                linear_issue_id = EXCLUDED.linear_issue_id,
                parent_task_id = EXCLUDED.parent_task_id,
                parent_linear_issue_id = EXCLUDED.parent_linear_issue_id,
                correlation_type = EXCLUDED.correlation_type,
                status = EXCLUDED.status,
                metadata = EXCLUDED.metadata,
                updated_at = EXCLUDED.updated_at,
                last_synced_at = EXCLUDED.last_synced_at
        `;

        const values = [
            correlation.id,
            correlation.task_id,
            correlation.linear_issue_id,
            correlation.parent_task_id,
            correlation.parent_linear_issue_id,
            correlation.correlation_type,
            correlation.status,
            JSON.stringify(correlation.metadata),
            correlation.created_at,
            correlation.updated_at,
            correlation.last_synced_at
        ];

        await this.database.query(query, values);
    }

    /**
     * Ensure correlation tables exist
     */
    async ensureCorrelationTables() {
        const createTablesQuery = `
            -- Linear correlations table
            CREATE TABLE IF NOT EXISTS linear_correlations (
                id VARCHAR(255) PRIMARY KEY,
                task_id UUID NOT NULL,
                linear_issue_id VARCHAR(255) NOT NULL,
                parent_task_id UUID,
                parent_linear_issue_id VARCHAR(255),
                correlation_type VARCHAR(50) NOT NULL DEFAULT 'task_to_issue',
                status VARCHAR(20) NOT NULL DEFAULT 'active',
                metadata JSONB DEFAULT '{}',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                deleted_at TIMESTAMP WITH TIME ZONE,
                deletion_reason VARCHAR(255),
                
                UNIQUE(task_id, linear_issue_id)
            );

            -- Task to Linear references
            CREATE TABLE IF NOT EXISTS task_linear_references (
                id SERIAL PRIMARY KEY,
                task_id UUID NOT NULL,
                linear_issue_id VARCHAR(255) NOT NULL,
                reference_type VARCHAR(50) NOT NULL DEFAULT 'sync',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                
                UNIQUE(task_id, linear_issue_id)
            );

            -- Linear to Task references
            CREATE TABLE IF NOT EXISTS linear_task_references (
                id SERIAL PRIMARY KEY,
                linear_issue_id VARCHAR(255) NOT NULL,
                task_id UUID NOT NULL,
                reference_type VARCHAR(50) NOT NULL DEFAULT 'sync',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                
                UNIQUE(linear_issue_id, task_id)
            );

            -- Correlation hierarchy
            CREATE TABLE IF NOT EXISTS correlation_hierarchy (
                id SERIAL PRIMARY KEY,
                parent_id UUID NOT NULL,
                child_id UUID NOT NULL,
                relationship_type VARCHAR(50) NOT NULL DEFAULT 'parent_child',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                
                UNIQUE(parent_id, child_id)
            );

            -- Linear hierarchy
            CREATE TABLE IF NOT EXISTS linear_hierarchy (
                id SERIAL PRIMARY KEY,
                parent_issue_id VARCHAR(255) NOT NULL,
                child_issue_id VARCHAR(255) NOT NULL,
                relationship_type VARCHAR(50) NOT NULL DEFAULT 'parent_child',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                
                UNIQUE(parent_issue_id, child_issue_id)
            );

            -- Create indexes
            CREATE INDEX IF NOT EXISTS idx_linear_correlations_task_id ON linear_correlations(task_id);
            CREATE INDEX IF NOT EXISTS idx_linear_correlations_linear_issue_id ON linear_correlations(linear_issue_id);
            CREATE INDEX IF NOT EXISTS idx_linear_correlations_status ON linear_correlations(status);
            CREATE INDEX IF NOT EXISTS idx_linear_correlations_parent_task_id ON linear_correlations(parent_task_id);
            CREATE INDEX IF NOT EXISTS idx_task_linear_references_task_id ON task_linear_references(task_id);
            CREATE INDEX IF NOT EXISTS idx_linear_task_references_linear_issue_id ON linear_task_references(linear_issue_id);
        `;

        await this.database.query(createTablesQuery);
    }

    // ==================== CACHE MANAGEMENT ====================

    /**
     * Check if cache is valid
     */
    isCacheValid(timestamp) {
        return Date.now() - timestamp < this.config.cacheTimeout;
    }

    /**
     * Invalidate cache entries
     */
    invalidateCache(taskId, linearIssueId) {
        if (taskId) {
            this.correlationCache.delete(`task_${taskId}`);
            this.hierarchyCache.delete(taskId);
        }
        if (linearIssueId) {
            this.correlationCache.delete(`linear_${linearIssueId}`);
        }
    }

    /**
     * Clear all caches
     */
    clearCache() {
        this.correlationCache.clear();
        this.hierarchyCache.clear();
    }

    // ==================== UTILITIES ====================

    /**
     * Generate correlation ID
     */
    generateCorrelationId() {
        return `corr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get correlation statistics
     */
    async getStatistics() {
        const queries = {
            total: 'SELECT COUNT(*) as count FROM linear_correlations WHERE status = \'active\'',
            byType: 'SELECT correlation_type, COUNT(*) as count FROM linear_correlations WHERE status = \'active\' GROUP BY correlation_type',
            orphaned: 'SELECT COUNT(*) as count FROM linear_correlations lc LEFT JOIN tasks t ON lc.task_id = t.id WHERE lc.status = \'active\' AND t.id IS NULL',
            hierarchical: 'SELECT COUNT(*) as count FROM linear_correlations WHERE status = \'active\' AND parent_task_id IS NOT NULL'
        };

        const results = {};
        for (const [key, query] of Object.entries(queries)) {
            const result = await this.database.query(query);
            results[key] = result.rows;
        }

        return {
            ...results,
            cache: {
                correlations: this.correlationCache.size,
                hierarchies: this.hierarchyCache.size
            },
            config: {
                orphan_cleanup: this.config.enableOrphanCleanup,
                retention_days: this.config.orphanRetentionDays,
                caching: this.config.enableCaching
            }
        };
    }

    /**
     * Cleanup resources
     */
    async cleanup() {
        this.stopCleanupTimer();
        this.clearCache();
    }
}

export default LinearCorrelationMapper;

