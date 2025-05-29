/**
 * @fileoverview Database Performance Benchmark
 * @description Comprehensive performance testing and benchmarking for CI/CD database operations
 */

import { getConnection } from './connection.js';
import { query, cicdQuery } from './query_builder.js';
import { Task } from './models/Task.js';
import { CodeArtifact } from './models/CodeArtifact.js';
import { ValidationResult } from './models/ValidationResult.js';
import { ExecutionHistory } from './models/ExecutionHistory.js';
import { log } from '../../../scripts/modules/utils.js';

/**
 * Performance Benchmark class for database operations
 */
export class PerformanceBenchmark {
    constructor(options = {}) {
        this.options = {
            warmupRuns: options.warmupRuns || 3,
            benchmarkRuns: options.benchmarkRuns || 10,
            concurrentUsers: options.concurrentUsers || 5,
            dataSetSize: options.dataSetSize || 1000,
            targetResponseTime: options.targetResponseTime || 100, // ms
            ...options
        };
        this.results = {};
        this.connection = null;
    }

    /**
     * Initialize benchmark environment
     */
    async initialize() {
        this.connection = getConnection();
        if (!this.connection.isConnected) {
            await this.connection.initialize();
        }
        
        log('info', 'Performance benchmark initialized');
        log('info', `Configuration: ${JSON.stringify(this.options, null, 2)}`);
    }

    /**
     * Run all benchmarks
     * @returns {Object} Complete benchmark results
     */
    async runAllBenchmarks() {
        await this.initialize();
        
        log('info', 'Starting comprehensive database performance benchmarks...');
        
        // Setup test data
        await this.setupTestData();
        
        // Run individual benchmarks
        this.results.basicQueries = await this.benchmarkBasicQueries();
        this.results.complexQueries = await this.benchmarkComplexQueries();
        this.results.cicdQueries = await this.benchmarkCICDQueries();
        this.results.concurrentOperations = await this.benchmarkConcurrentOperations();
        this.results.bulkOperations = await this.benchmarkBulkOperations();
        this.results.indexPerformance = await this.benchmarkIndexPerformance();
        
        // Cleanup test data
        await this.cleanupTestData();
        
        // Generate summary report
        this.results.summary = this.generateSummaryReport();
        
        log('info', 'All benchmarks completed');
        return this.results;
    }

    /**
     * Setup test data for benchmarks
     */
    async setupTestData() {
        log('info', 'Setting up test data...');
        
        const startTime = Date.now();
        
        // Create test tasks
        const taskPromises = [];
        for (let i = 0; i < this.options.dataSetSize; i++) {
            const task = new Task({
                title: `Benchmark Task ${i}`,
                description: `Test task for performance benchmarking - ${i}`,
                type: 'benchmark',
                status: i % 4 === 0 ? 'completed' : i % 4 === 1 ? 'in_progress' : 'pending',
                priority: Math.floor(Math.random() * 10),
                complexity_score: Math.floor(Math.random() * 10) + 1,
                assigned_to: `user${i % 10}@example.com`
            });
            
            taskPromises.push(this.insertTask(task));
        }
        
        const tasks = await Promise.all(taskPromises);
        this.testTaskIds = tasks.map(t => t.id);
        
        // Create test artifacts
        const artifactPromises = [];
        for (let i = 0; i < this.options.dataSetSize * 2; i++) {
            const taskId = this.testTaskIds[Math.floor(Math.random() * this.testTaskIds.length)];
            const artifact = CodeArtifact.fromContent(
                `src/test/file_${i}.js`,
                `// Test file ${i}\nconsole.log('benchmark test ${i}');`,
                taskId,
                { artifact_type: i % 3 === 0 ? 'test_file' : 'source_code' }
            );
            
            artifactPromises.push(this.insertArtifact(artifact));
        }
        
        await Promise.all(artifactPromises);
        
        // Create test validation results
        const validationPromises = [];
        for (let i = 0; i < this.options.dataSetSize; i++) {
            const taskId = this.testTaskIds[i];
            const validation = new ValidationResult({
                task_id: taskId,
                validation_type: ['syntax', 'style', 'security'][i % 3],
                validator_name: 'Benchmark Validator',
                validation_status: i % 5 === 0 ? 'failed' : 'passed',
                score: Math.floor(Math.random() * 100),
                issues_found: Math.floor(Math.random() * 10),
                issues_critical: Math.floor(Math.random() * 3),
                issues_major: Math.floor(Math.random() * 5),
                issues_minor: Math.floor(Math.random() * 8)
            });
            
            validationPromises.push(this.insertValidation(validation));
        }
        
        await Promise.all(validationPromises);
        
        const setupTime = Date.now() - startTime;
        log('info', `Test data setup completed in ${setupTime}ms`);
    }

    /**
     * Benchmark basic database queries
     */
    async benchmarkBasicQueries() {
        log('info', 'Benchmarking basic queries...');
        
        const benchmarks = {
            selectById: await this.benchmarkQuery(
                'Select Task by ID',
                () => query('tasks').where('id', '=', this.testTaskIds[0]).first()
            ),
            selectByStatus: await this.benchmarkQuery(
                'Select Tasks by Status',
                () => query('tasks').where('status', '=', 'pending').limit(10).get()
            ),
            selectWithLimit: await this.benchmarkQuery(
                'Select Tasks with Limit',
                () => query('tasks').orderBy('created_at', 'DESC').limit(50).get()
            ),
            countTasks: await this.benchmarkQuery(
                'Count Tasks',
                () => query('tasks').count()
            ),
            selectWithIndex: await this.benchmarkQuery(
                'Select with Indexed Column',
                () => query('tasks').where('priority', '>=', 5).get()
            )
        };
        
        return benchmarks;
    }

    /**
     * Benchmark complex database queries
     */
    async benchmarkComplexQueries() {
        log('info', 'Benchmarking complex queries...');
        
        const benchmarks = {
            joinQuery: await this.benchmarkQuery(
                'Tasks with Artifacts Join',
                () => query('tasks t')
                    .select(['t.*', 'COUNT(ca.id) as artifact_count'])
                    .leftJoin('code_artifacts ca', 't.id = ca.task_id')
                    .groupBy('t.id')
                    .limit(100)
                    .get()
            ),
            multipleJoins: await this.benchmarkQuery(
                'Tasks with Multiple Joins',
                () => query('tasks t')
                    .select(['t.*', 'COUNT(DISTINCT ca.id) as artifacts', 'COUNT(DISTINCT vr.id) as validations'])
                    .leftJoin('code_artifacts ca', 't.id = ca.task_id')
                    .leftJoin('validation_results vr', 't.id = vr.task_id')
                    .groupBy('t.id')
                    .limit(50)
                    .get()
            ),
            aggregationQuery: await this.benchmarkQuery(
                'Aggregation with Having',
                () => query('tasks t')
                    .select(['t.status', 'COUNT(*) as count', 'AVG(t.priority) as avg_priority'])
                    .groupBy('t.status')
                    .having('COUNT(*)', '>', 10)
                    .get()
            ),
            subqueryFilter: await this.benchmarkQuery(
                'Subquery Filter',
                () => query('tasks')
                    .whereRaw('id IN (SELECT task_id FROM validation_results WHERE score > ?)', [80])
                    .limit(20)
                    .get()
            )
        };
        
        return benchmarks;
    }

    /**
     * Benchmark CI/CD specific queries
     */
    async benchmarkCICDQueries() {
        log('info', 'Benchmarking CI/CD queries...');
        
        const benchmarks = {
            tasksWithCICDStatus: await this.benchmarkQuery(
                'Tasks with CI/CD Status',
                () => cicdQuery().getTasksWithCICDStatus({ status: ['pending', 'in_progress'] }).limit(50).get()
            ),
            validationResults: await this.benchmarkQuery(
                'Validation Results with Details',
                () => cicdQuery().getValidationResults({ validation_type: 'syntax' }).limit(100).get()
            ),
            executionHistory: await this.benchmarkQuery(
                'Execution History',
                () => cicdQuery().getExecutionHistory({ exclude_retries: true }).limit(100).get()
            ),
            performanceMetrics: await this.benchmarkQuery(
                'Performance Metrics Aggregation',
                () => cicdQuery().getPerformanceMetrics({
                    interval: 'hour',
                    start_time: new Date(Date.now() - 24 * 60 * 60 * 1000)
                }).limit(24).get()
            )
        };
        
        return benchmarks;
    }

    /**
     * Benchmark concurrent operations
     */
    async benchmarkConcurrentOperations() {
        log('info', 'Benchmarking concurrent operations...');
        
        const concurrentReads = await this.benchmarkConcurrentQuery(
            'Concurrent Read Operations',
            () => query('tasks').where('status', '=', 'pending').limit(10).get(),
            this.options.concurrentUsers
        );
        
        const concurrentWrites = await this.benchmarkConcurrentQuery(
            'Concurrent Write Operations',
            async () => {
                const task = new Task({
                    title: `Concurrent Task ${Date.now()}`,
                    description: 'Concurrent benchmark task',
                    type: 'benchmark'
                });
                return await this.insertTask(task);
            },
            Math.min(this.options.concurrentUsers, 3) // Limit concurrent writes
        );
        
        return {
            concurrentReads,
            concurrentWrites
        };
    }

    /**
     * Benchmark bulk operations
     */
    async benchmarkBulkOperations() {
        log('info', 'Benchmarking bulk operations...');
        
        const bulkInsert = await this.benchmarkOperation(
            'Bulk Insert Tasks',
            async () => {
                const tasks = [];
                for (let i = 0; i < 100; i++) {
                    tasks.push(new Task({
                        title: `Bulk Task ${i}`,
                        description: `Bulk insert test ${i}`,
                        type: 'bulk_test'
                    }));
                }
                
                const promises = tasks.map(task => this.insertTask(task));
                return await Promise.all(promises);
            }
        );
        
        const bulkUpdate = await this.benchmarkOperation(
            'Bulk Update Tasks',
            async () => {
                const updateQuery = `
                    UPDATE tasks 
                    SET status = 'completed', updated_at = NOW() 
                    WHERE type = 'bulk_test' AND status = 'pending'
                `;
                return await this.connection.query(updateQuery);
            }
        );
        
        const bulkDelete = await this.benchmarkOperation(
            'Bulk Delete Tasks',
            async () => {
                const deleteQuery = `DELETE FROM tasks WHERE type = 'bulk_test'`;
                return await this.connection.query(deleteQuery);
            }
        );
        
        return {
            bulkInsert,
            bulkUpdate,
            bulkDelete
        };
    }

    /**
     * Benchmark index performance
     */
    async benchmarkIndexPerformance() {
        log('info', 'Benchmarking index performance...');
        
        const indexedQueries = {
            primaryKey: await this.benchmarkQuery(
                'Primary Key Lookup',
                () => query('tasks').where('id', '=', this.testTaskIds[0]).first()
            ),
            statusIndex: await this.benchmarkQuery(
                'Status Index Query',
                () => query('tasks').where('status', '=', 'pending').limit(100).get()
            ),
            priorityIndex: await this.benchmarkQuery(
                'Priority Index Query',
                () => query('tasks').where('priority', '>=', 5).limit(100).get()
            ),
            compositeIndex: await this.benchmarkQuery(
                'Composite Index Query',
                () => query('tasks').where('status', '=', 'pending').where('priority', '>=', 5).limit(50).get()
            ),
            dateIndex: await this.benchmarkQuery(
                'Date Index Query',
                () => query('tasks').where('created_at', '>=', new Date(Date.now() - 24 * 60 * 60 * 1000)).limit(100).get()
            )
        };
        
        return indexedQueries;
    }

    /**
     * Benchmark a single query operation
     * @param {string} name - Benchmark name
     * @param {Function} queryFn - Query function to benchmark
     * @returns {Object} Benchmark results
     */
    async benchmarkQuery(name, queryFn) {
        // Warmup runs
        for (let i = 0; i < this.options.warmupRuns; i++) {
            await queryFn();
        }
        
        // Benchmark runs
        const times = [];
        for (let i = 0; i < this.options.benchmarkRuns; i++) {
            const startTime = process.hrtime.bigint();
            await queryFn();
            const endTime = process.hrtime.bigint();
            times.push(Number(endTime - startTime) / 1000000); // Convert to milliseconds
        }
        
        return this.calculateStats(name, times);
    }

    /**
     * Benchmark concurrent query operations
     * @param {string} name - Benchmark name
     * @param {Function} queryFn - Query function to benchmark
     * @param {number} concurrency - Number of concurrent operations
     * @returns {Object} Benchmark results
     */
    async benchmarkConcurrentQuery(name, queryFn, concurrency) {
        // Warmup
        await Promise.all(Array(concurrency).fill().map(() => queryFn()));
        
        // Benchmark
        const times = [];
        for (let run = 0; run < this.options.benchmarkRuns; run++) {
            const startTime = process.hrtime.bigint();
            await Promise.all(Array(concurrency).fill().map(() => queryFn()));
            const endTime = process.hrtime.bigint();
            times.push(Number(endTime - startTime) / 1000000);
        }
        
        const stats = this.calculateStats(name, times);
        stats.concurrency = concurrency;
        stats.throughput = concurrency / (stats.average / 1000); // Operations per second
        
        return stats;
    }

    /**
     * Benchmark a general operation
     * @param {string} name - Benchmark name
     * @param {Function} operationFn - Operation function to benchmark
     * @returns {Object} Benchmark results
     */
    async benchmarkOperation(name, operationFn) {
        const startTime = process.hrtime.bigint();
        const result = await operationFn();
        const endTime = process.hrtime.bigint();
        
        const duration = Number(endTime - startTime) / 1000000;
        
        return {
            name,
            duration,
            result: result ? (result.rowCount || result.length || 'completed') : 'completed'
        };
    }

    /**
     * Calculate statistics from timing data
     * @param {string} name - Benchmark name
     * @param {Array} times - Array of timing measurements
     * @returns {Object} Statistical summary
     */
    calculateStats(name, times) {
        times.sort((a, b) => a - b);
        
        const sum = times.reduce((a, b) => a + b, 0);
        const average = sum / times.length;
        const min = times[0];
        const max = times[times.length - 1];
        const median = times[Math.floor(times.length / 2)];
        const p95 = times[Math.floor(times.length * 0.95)];
        const p99 = times[Math.floor(times.length * 0.99)];
        
        // Calculate standard deviation
        const variance = times.reduce((acc, time) => acc + Math.pow(time - average, 2), 0) / times.length;
        const stdDev = Math.sqrt(variance);
        
        const meetsTarget = p95 <= this.options.targetResponseTime;
        
        return {
            name,
            runs: times.length,
            average: Math.round(average * 100) / 100,
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            median: Math.round(median * 100) / 100,
            p95: Math.round(p95 * 100) / 100,
            p99: Math.round(p99 * 100) / 100,
            stdDev: Math.round(stdDev * 100) / 100,
            meetsTarget,
            targetResponseTime: this.options.targetResponseTime
        };
    }

    /**
     * Generate summary report
     * @returns {Object} Summary report
     */
    generateSummaryReport() {
        const allBenchmarks = [];
        
        // Collect all benchmark results
        Object.values(this.results).forEach(category => {
            if (typeof category === 'object' && category !== null) {
                Object.values(category).forEach(benchmark => {
                    if (benchmark && benchmark.name) {
                        allBenchmarks.push(benchmark);
                    }
                });
            }
        });
        
        const totalBenchmarks = allBenchmarks.length;
        const passedBenchmarks = allBenchmarks.filter(b => b.meetsTarget).length;
        const failedBenchmarks = totalBenchmarks - passedBenchmarks;
        
        const averageResponseTime = allBenchmarks.reduce((sum, b) => sum + b.average, 0) / totalBenchmarks;
        const worstP95 = Math.max(...allBenchmarks.map(b => b.p95));
        const bestP95 = Math.min(...allBenchmarks.map(b => b.p95));
        
        return {
            totalBenchmarks,
            passedBenchmarks,
            failedBenchmarks,
            passRate: Math.round((passedBenchmarks / totalBenchmarks) * 100),
            averageResponseTime: Math.round(averageResponseTime * 100) / 100,
            worstP95: Math.round(worstP95 * 100) / 100,
            bestP95: Math.round(bestP95 * 100) / 100,
            targetResponseTime: this.options.targetResponseTime,
            dataSetSize: this.options.dataSetSize,
            concurrentUsers: this.options.concurrentUsers,
            recommendations: this.generateRecommendations(allBenchmarks)
        };
    }

    /**
     * Generate performance recommendations
     * @param {Array} benchmarks - All benchmark results
     * @returns {Array} Recommendations
     */
    generateRecommendations(benchmarks) {
        const recommendations = [];
        
        const slowBenchmarks = benchmarks.filter(b => b.p95 > this.options.targetResponseTime);
        if (slowBenchmarks.length > 0) {
            recommendations.push({
                type: 'performance',
                priority: 'high',
                message: `${slowBenchmarks.length} queries exceed target response time of ${this.options.targetResponseTime}ms`,
                queries: slowBenchmarks.map(b => b.name)
            });
        }
        
        const highVariabilityBenchmarks = benchmarks.filter(b => b.stdDev > b.average * 0.5);
        if (highVariabilityBenchmarks.length > 0) {
            recommendations.push({
                type: 'consistency',
                priority: 'medium',
                message: 'Some queries show high response time variability',
                queries: highVariabilityBenchmarks.map(b => b.name)
            });
        }
        
        const verySlowBenchmarks = benchmarks.filter(b => b.p95 > this.options.targetResponseTime * 5);
        if (verySlowBenchmarks.length > 0) {
            recommendations.push({
                type: 'optimization',
                priority: 'critical',
                message: 'Critical performance issues detected - immediate optimization required',
                queries: verySlowBenchmarks.map(b => b.name)
            });
        }
        
        return recommendations;
    }

    /**
     * Helper method to insert a task
     */
    async insertTask(task) {
        const record = task.toRecord();
        const query = `
            INSERT INTO tasks (id, title, description, type, status, priority, complexity_score, assigned_to, metadata, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `;
        const values = [
            record.id, record.title, record.description, record.type, record.status,
            record.priority, record.complexity_score, record.assigned_to, record.metadata,
            record.created_at, record.updated_at
        ];
        
        const result = await this.connection.query(query, values);
        return Task.fromRecord(result.rows[0]);
    }

    /**
     * Helper method to insert an artifact
     */
    async insertArtifact(artifact) {
        const record = artifact.toRecord();
        const query = `
            INSERT INTO code_artifacts (id, task_id, artifact_type, file_path, content_hash, content_size, content_type, content, metadata, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `;
        const values = [
            record.id, record.task_id, record.artifact_type, record.file_path, record.content_hash,
            record.content_size, record.content_type, record.content, record.metadata,
            record.created_at, record.updated_at
        ];
        
        const result = await this.connection.query(query, values);
        return CodeArtifact.fromRecord(result.rows[0]);
    }

    /**
     * Helper method to insert a validation result
     */
    async insertValidation(validation) {
        const record = validation.toRecord();
        const query = `
            INSERT INTO validation_results (id, task_id, validation_type, validator_name, validation_status, score, max_score, issues_found, issues_critical, issues_major, issues_minor, validation_details, suggestions, started_at, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING *
        `;
        const values = [
            record.id, record.task_id, record.validation_type, record.validator_name, record.validation_status,
            record.score, record.max_score, record.issues_found, record.issues_critical, record.issues_major,
            record.issues_minor, record.validation_details, record.suggestions, record.started_at, record.metadata
        ];
        
        const result = await this.connection.query(query, values);
        return ValidationResult.fromRecord(result.rows[0]);
    }

    /**
     * Cleanup test data
     */
    async cleanupTestData() {
        log('info', 'Cleaning up test data...');
        
        if (this.testTaskIds && this.testTaskIds.length > 0) {
            const placeholders = this.testTaskIds.map((_, i) => `$${i + 1}`).join(', ');
            await this.connection.query(`DELETE FROM tasks WHERE id IN (${placeholders})`, this.testTaskIds);
        }
        
        // Clean up any remaining benchmark data
        await this.connection.query(`DELETE FROM tasks WHERE type IN ('benchmark', 'bulk_test')`);
        
        log('info', 'Test data cleanup completed');
    }
}

/**
 * Run performance benchmarks
 * @param {Object} options - Benchmark options
 * @returns {Object} Benchmark results
 */
export async function runPerformanceBenchmarks(options = {}) {
    const benchmark = new PerformanceBenchmark(options);
    return await benchmark.runAllBenchmarks();
}

export default PerformanceBenchmark;

