/**
 * @fileoverview Query Builder Tests
 * @description Comprehensive tests for the QueryBuilder and CICDQueryBuilder classes
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { QueryBuilder, CICDQueryBuilder, query, cicdQuery } from '../../src/ai_cicd_system/database/query_builder.js';

// Mock the database connection
jest.mock('../../src/ai_cicd_system/database/connection.js', () => ({
    getConnection: jest.fn(() => ({
        query: jest.fn()
    }))
}));

describe('QueryBuilder', () => {
    let qb;

    beforeEach(() => {
        qb = new QueryBuilder('users');
    });

    describe('Constructor', () => {
        test('should initialize with table name', () => {
            expect(qb.tableName).toBe('users');
            expect(qb.selectFields).toEqual(['*']);
            expect(qb.parameters).toEqual([]);
            expect(qb.parameterIndex).toBe(1);
        });
    });

    describe('SELECT clause', () => {
        test('should set select fields from array', () => {
            qb.select(['id', 'name', 'email']);
            expect(qb.selectFields).toEqual(['id', 'name', 'email']);
        });

        test('should set select fields from string', () => {
            qb.select('id, name, email');
            expect(qb.selectFields).toEqual(['id', 'name', 'email']);
        });
    });

    describe('JOIN clauses', () => {
        test('should add INNER JOIN', () => {
            qb.join('profiles p', 'users.id = p.user_id');
            expect(qb.joinClauses).toContain('INNER JOIN profiles p ON users.id = p.user_id');
        });

        test('should add LEFT JOIN', () => {
            qb.leftJoin('profiles p', 'users.id = p.user_id');
            expect(qb.joinClauses).toContain('LEFT JOIN profiles p ON users.id = p.user_id');
        });

        test('should add custom JOIN type', () => {
            qb.join('profiles p', 'users.id = p.user_id', 'RIGHT');
            expect(qb.joinClauses).toContain('RIGHT JOIN profiles p ON users.id = p.user_id');
        });
    });

    describe('WHERE clauses', () => {
        test('should add basic WHERE clause', () => {
            qb.where('name', '=', 'John');
            
            expect(qb.whereClauses).toContain('name = $1');
            expect(qb.parameters).toContain('John');
        });

        test('should add multiple WHERE clauses', () => {
            qb.where('name', '=', 'John')
              .where('age', '>', 18);
            
            expect(qb.whereClauses).toHaveLength(2);
            expect(qb.parameters).toEqual(['John', 18]);
        });

        test('should add WHERE IN clause', () => {
            qb.whereIn('status', ['active', 'pending']);
            
            expect(qb.whereClauses).toContain('status IN ($1, $2)');
            expect(qb.parameters).toEqual(['active', 'pending']);
        });

        test('should handle empty array in WHERE IN', () => {
            qb.whereIn('status', []);
            expect(qb.whereClauses).toHaveLength(0);
        });

        test('should add WHERE BETWEEN clause', () => {
            qb.whereBetween('age', 18, 65);
            
            expect(qb.whereClauses).toContain('age BETWEEN $1 AND $2');
            expect(qb.parameters).toEqual([18, 65]);
        });

        test('should add WHERE LIKE clause', () => {
            qb.whereLike('name', '%John%');
            
            expect(qb.whereClauses).toContain('name LIKE $1');
            expect(qb.parameters).toContain('%John%');
        });

        test('should add WHERE NULL clauses', () => {
            qb.whereNull('deleted_at');
            expect(qb.whereClauses).toContain('deleted_at IS NULL');
            
            qb.whereNotNull('email');
            expect(qb.whereClauses).toContain('email IS NOT NULL');
        });

        test('should add raw WHERE clause', () => {
            qb.whereRaw('created_at > NOW() - INTERVAL ? DAY', [30]);
            
            expect(qb.whereClauses).toContain('created_at > NOW() - INTERVAL $1 DAY');
            expect(qb.parameters).toContain(30);
        });

        test('should add OR WHERE clause', () => {
            qb.where('name', '=', 'John')
              .orWhere(subQuery => {
                  subQuery.where('email', '=', 'john@example.com');
              });
            
            expect(qb.whereClauses).toHaveLength(2);
            expect(qb.whereClauses[1]).toContain('OR (email = $2)');
        });
    });

    describe('GROUP BY and HAVING', () => {
        test('should add GROUP BY clause', () => {
            qb.groupBy('department');
            expect(qb.groupByClauses).toContain('department');
            
            qb.groupBy(['city', 'state']);
            expect(qb.groupByClauses).toEqual(['department', 'city', 'state']);
        });

        test('should add HAVING clause', () => {
            qb.having('COUNT(*)', '>', 5);
            
            expect(qb.havingClauses).toContain('COUNT(*) > $1');
            expect(qb.parameters).toContain(5);
        });
    });

    describe('ORDER BY', () => {
        test('should add ORDER BY clause', () => {
            qb.orderBy('name');
            expect(qb.orderByClauses).toContain('name ASC');
            
            qb.orderBy('created_at', 'DESC');
            expect(qb.orderByClauses).toContain('created_at DESC');
        });
    });

    describe('LIMIT and OFFSET', () => {
        test('should add LIMIT clause', () => {
            qb.limit(10);
            expect(qb.limitValue).toBe(10);
        });

        test('should add OFFSET clause', () => {
            qb.offset(20);
            expect(qb.offsetValue).toBe(20);
        });

        test('should add pagination', () => {
            qb.paginate(3, 10); // Page 3, 10 per page
            expect(qb.limitValue).toBe(10);
            expect(qb.offsetValue).toBe(20); // (3-1) * 10
        });
    });

    describe('Query Building', () => {
        test('should build basic SELECT query', () => {
            const query = qb.build();
            
            expect(query.text).toBe('SELECT * FROM users');
            expect(query.values).toEqual([]);
        });

        test('should build complex query', () => {
            qb.select(['u.id', 'u.name', 'p.bio'])
              .leftJoin('profiles p', 'u.id = p.user_id')
              .where('u.active', '=', true)
              .where('u.age', '>', 18)
              .groupBy('u.department')
              .having('COUNT(*)', '>', 5)
              .orderBy('u.name')
              .limit(10)
              .offset(20);
            
            const query = qb.build();
            
            expect(query.text).toContain('SELECT u.id, u.name, p.bio FROM users');
            expect(query.text).toContain('LEFT JOIN profiles p ON u.id = p.user_id');
            expect(query.text).toContain('WHERE u.active = $1 AND u.age = $2');
            expect(query.text).toContain('GROUP BY u.department');
            expect(query.text).toContain('HAVING COUNT(*) > $3');
            expect(query.text).toContain('ORDER BY u.name ASC');
            expect(query.text).toContain('LIMIT 10');
            expect(query.text).toContain('OFFSET 20');
            expect(query.values).toEqual([true, 18, 5]);
        });
    });

    describe('Execution Methods', () => {
        test('should execute query', async () => {
            const mockConnection = {
                query: jest.fn().mockResolvedValue({ rows: [{ id: 1, name: 'John' }] })
            };
            
            const { getConnection } = await import('../../src/ai_cicd_system/database/connection.js');
            getConnection.mockReturnValue(mockConnection);
            
            qb.where('id', '=', 1);
            await qb.execute();
            
            expect(mockConnection.query).toHaveBeenCalledWith(
                'SELECT * FROM users WHERE id = $1',
                [1]
            );
        });

        test('should get first result', async () => {
            const mockConnection = {
                query: jest.fn().mockResolvedValue({ rows: [{ id: 1, name: 'John' }] })
            };
            
            const { getConnection } = await import('../../src/ai_cicd_system/database/connection.js');
            getConnection.mockReturnValue(mockConnection);
            
            const result = await qb.first();
            
            expect(result).toEqual({ id: 1, name: 'John' });
            expect(qb.limitValue).toBe(1);
        });

        test('should get all results', async () => {
            const mockRows = [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }];
            const mockConnection = {
                query: jest.fn().mockResolvedValue({ rows: mockRows })
            };
            
            const { getConnection } = await import('../../src/ai_cicd_system/database/connection.js');
            getConnection.mockReturnValue(mockConnection);
            
            const results = await qb.get();
            
            expect(results).toEqual(mockRows);
        });

        test('should get count', async () => {
            const mockConnection = {
                query: jest.fn().mockResolvedValue({ rows: [{ count: '42' }] })
            };
            
            const { getConnection } = await import('../../src/ai_cicd_system/database/connection.js');
            getConnection.mockReturnValue(mockConnection);
            
            const count = await qb.count();
            
            expect(count).toBe(42);
            expect(mockConnection.query).toHaveBeenCalledWith(
                'SELECT COUNT(*) as count FROM users',
                []
            );
        });

        test('should check existence', async () => {
            const mockConnection = {
                query: jest.fn().mockResolvedValue({ rows: [{ count: '1' }] })
            };
            
            const { getConnection } = await import('../../src/ai_cicd_system/database/connection.js');
            getConnection.mockReturnValue(mockConnection);
            
            const exists = await qb.exists();
            
            expect(exists).toBe(true);
        });
    });
});

describe('CICDQueryBuilder', () => {
    describe('getTasksWithCICDStatus', () => {
        test('should build tasks with CI/CD status query', () => {
            const qb = CICDQueryBuilder.getTasksWithCICDStatus();
            const query = qb.build();
            
            expect(query.text).toContain('SELECT t.*, COUNT(DISTINCT ca.id) as artifact_count');
            expect(query.text).toContain('LEFT JOIN code_artifacts ca ON t.id = ca.task_id');
            expect(query.text).toContain('LEFT JOIN validation_results vr ON t.id = vr.task_id');
            expect(query.text).toContain('LEFT JOIN execution_history eh ON t.id = eh.task_id');
            expect(query.text).toContain('GROUP BY t.id');
        });

        test('should apply filters', () => {
            const filters = {
                status: ['pending', 'in_progress'],
                priority: 5,
                assigned_to: 'john@example.com',
                created_after: new Date('2023-01-01'),
                created_before: new Date('2023-12-31')
            };
            
            const qb = CICDQueryBuilder.getTasksWithCICDStatus(filters);
            const query = qb.build();
            
            expect(query.text).toContain('WHERE t.status IN ($1, $2)');
            expect(query.text).toContain('AND t.priority >= $3');
            expect(query.text).toContain('AND t.assigned_to = $4');
            expect(query.values).toEqual([
                'pending', 'in_progress', 5, 'john@example.com',
                filters.created_after, filters.created_before
            ]);
        });
    });

    describe('getValidationResults', () => {
        test('should build validation results query', () => {
            const qb = CICDQueryBuilder.getValidationResults();
            const query = qb.build();
            
            expect(query.text).toContain('SELECT vr.*, t.title as task_title');
            expect(query.text).toContain('LEFT JOIN tasks t ON vr.task_id = t.id');
            expect(query.text).toContain('LEFT JOIN code_artifacts ca ON vr.artifact_id = ca.id');
        });

        test('should apply validation filters', () => {
            const filters = {
                task_id: 'task-123',
                validation_type: ['syntax', 'style'],
                status: 'failed',
                min_score: 80,
                has_critical_issues: true,
                completed_after: new Date('2023-01-01')
            };
            
            const qb = CICDQueryBuilder.getValidationResults(filters);
            const query = qb.build();
            
            expect(query.text).toContain('WHERE vr.task_id = $1');
            expect(query.text).toContain('AND vr.validation_type IN ($2, $3)');
            expect(query.text).toContain('AND vr.validation_status IN ($4)');
            expect(query.text).toContain('AND vr.score >= $5');
            expect(query.text).toContain('AND vr.issues_critical > $6');
        });
    });

    describe('getExecutionHistory', () => {
        test('should build execution history query', () => {
            const qb = CICDQueryBuilder.getExecutionHistory();
            const query = qb.build();
            
            expect(query.text).toContain('SELECT eh.*, t.title as task_title');
            expect(query.text).toContain('LEFT JOIN tasks t ON eh.task_id = t.id');
        });

        test('should apply execution filters', () => {
            const filters = {
                task_id: 'task-123',
                execution_type: 'code_generation',
                status: ['completed', 'failed'],
                min_duration_ms: 1000,
                max_duration_ms: 60000,
                started_after: new Date('2023-01-01'),
                exclude_retries: true
            };
            
            const qb = CICDQueryBuilder.getExecutionHistory(filters);
            const query = qb.build();
            
            expect(query.text).toContain('WHERE eh.task_id = $1');
            expect(query.text).toContain('AND eh.execution_type IN ($2)');
            expect(query.text).toContain('AND eh.status IN ($3, $4)');
            expect(query.text).toContain('AND eh.duration_ms >= $5');
            expect(query.text).toContain('AND eh.duration_ms <= $6');
            expect(query.text).toContain('AND eh.retry_of IS NULL');
        });
    });

    describe('getPerformanceMetrics', () => {
        test('should build performance metrics query', () => {
            const qb = CICDQueryBuilder.getPerformanceMetrics();
            const query = qb.build();
            
            expect(query.text).toContain("DATE_TRUNC('hour', timestamp) as time_bucket");
            expect(query.text).toContain('AVG(metric_value) as avg_value');
            expect(query.text).toContain('GROUP BY');
        });

        test('should apply performance metric options', () => {
            const options = {
                interval: 'day',
                start_time: new Date('2023-01-01'),
                end_time: new Date('2023-01-31'),
                categories: ['database', 'application'],
                metrics: ['query_time', 'cpu_usage']
            };
            
            const qb = CICDQueryBuilder.getPerformanceMetrics(options);
            const query = qb.build();
            
            expect(query.text).toContain("DATE_TRUNC('day', timestamp)");
            expect(query.text).toContain('WHERE timestamp >= $1');
            expect(query.text).toContain('AND timestamp <= $2');
            expect(query.text).toContain('AND metric_category IN ($3, $4)');
            expect(query.text).toContain('AND metric_name IN ($5, $6)');
        });
    });

    describe('getTaskDependencyGraph', () => {
        test('should build task dependency graph query', () => {
            const taskId = 'task-123';
            const qb = CICDQueryBuilder.getTaskDependencyGraph(taskId);
            const query = qb.build();
            
            expect(query.text).toContain('SELECT tr.*, t1.title as source_task_title');
            expect(query.text).toContain('JOIN tasks t1 ON tr.source_task_id = t1.id');
            expect(query.text).toContain('JOIN tasks t2 ON tr.target_task_id = t2.id');
            expect(query.text).toContain('OR (tr.source_task_id = $1)');
            expect(query.text).toContain('OR (tr.target_task_id = $2)');
            expect(query.values).toEqual([taskId, taskId]);
        });
    });
});

describe('Factory Functions', () => {
    test('should create QueryBuilder with query function', () => {
        const qb = query('test_table');
        expect(qb).toBeInstanceOf(QueryBuilder);
        expect(qb.tableName).toBe('test_table');
    });

    test('should return CICDQueryBuilder with cicdQuery function', () => {
        const cicd = cicdQuery();
        expect(cicd).toBe(CICDQueryBuilder);
    });
});

describe('Edge Cases', () => {
    test('should handle empty WHERE IN arrays', () => {
        const qb = new QueryBuilder('users');
        qb.whereIn('status', []);
        
        const query = qb.build();
        expect(query.text).toBe('SELECT * FROM users');
    });

    test('should handle OR WHERE with no conditions', () => {
        const qb = new QueryBuilder('users');
        qb.orWhere(() => {}); // Empty callback
        
        const query = qb.build();
        expect(query.text).toBe('SELECT * FROM users');
    });

    test('should handle first() with no results', async () => {
        const mockConnection = {
            query: jest.fn().mockResolvedValue({ rows: [] })
        };
        
        const { getConnection } = await import('../../src/ai_cicd_system/database/connection.js');
        getConnection.mockReturnValue(mockConnection);
        
        const qb = new QueryBuilder('users');
        const result = await qb.first();
        
        expect(result).toBeNull();
    });

    test('should handle exists() with zero count', async () => {
        const mockConnection = {
            query: jest.fn().mockResolvedValue({ rows: [{ count: '0' }] })
        };
        
        const { getConnection } = await import('../../src/ai_cicd_system/database/connection.js');
        getConnection.mockReturnValue(mockConnection);
        
        const qb = new QueryBuilder('users');
        const exists = await qb.exists();
        
        expect(exists).toBe(false);
    });
});

