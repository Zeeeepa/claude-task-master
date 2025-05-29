/**
 * @fileoverview Database Performance Benchmark Tool
 * @description Comprehensive performance testing and benchmarking for PostgreSQL database operations
 */

import { getConnection } from '../connection.js';
import { TaskRepository } from '../repositories/TaskRepository.js';
import { ContextRepository } from '../repositories/ContextRepository.js';
import { StateRepository } from '../repositories/StateRepository.js';
import { Task } from '../models/Task.js';
import { TaskContext } from '../models/TaskContext.js';
import { WorkflowState } from '../models/WorkflowState.js';

/**
 * Database Performance Benchmark Tool
 */
export class DatabaseBenchmark {
    constructor(connection = null) {
        this.connection = connection || getConnection();
        this.taskRepo = new TaskRepository(this.connection);
        this.contextRepo = new ContextRepository(this.connection);
        this.stateRepo = new StateRepository(this.connection);
        
        this.results = {
            connection: {},
            crud_operations: {},
            query_performance: {},
            concurrent_operations: {},
            stress_tests: {},
            summary: {}
        };
    }

    /**
     * Run comprehensive benchmark suite
     * @param {Object} options - Benchmark options
     * @returns {Promise<Object>} Benchmark results
     */
    async runBenchmark(options = {}) {
        const {
            includeConnectionTests = true,
            includeCrudTests = true,
            includeQueryTests = true,
            includeConcurrencyTests = true,
            includeStressTests = false,
            iterations = 100,
            concurrency = 10,
            stressIterations = 1000
        } = options;

        console.log('🚀 Starting Database Performance Benchmark...');
        const startTime = Date.now();

        try {
            // Connection performance tests
            if (includeConnectionTests) {
                console.log('📡 Testing connection performance...');
                this.results.connection = await this.benchmarkConnection();
            }

            // CRUD operation tests
            if (includeCrudTests) {
                console.log('📝 Testing CRUD operations...');
                this.results.crud_operations = await this.benchmarkCrudOperations(iterations);
            }

            // Query performance tests
            if (includeQueryTests) {
                console.log('🔍 Testing query performance...');
                this.results.query_performance = await this.benchmarkQueryPerformance(iterations);
            }

            // Concurrent operation tests
            if (includeConcurrencyTests) {
                console.log('⚡ Testing concurrent operations...');
                this.results.concurrent_operations = await this.benchmarkConcurrentOperations(concurrency, iterations);
            }

            // Stress tests
            if (includeStressTests) {
                console.log('💪 Running stress tests...');
                this.results.stress_tests = await this.benchmarkStressTests(stressIterations);
            }

            // Generate summary
            this.results.summary = this.generateSummary(Date.now() - startTime);
            
            console.log('✅ Benchmark completed successfully!');
            return this.results;

        } catch (error) {
            console.error('❌ Benchmark failed:', error.message);
            throw error;
        }
    }

    /**
     * Benchmark connection performance
     * @returns {Promise<Object>} Connection benchmark results
     */
    async benchmarkConnection() {
        const results = {
            connection_time: {},
            health_check: {},
            pool_performance: {}
        };

        // Test connection establishment time
        const connectionTimes = [];
        for (let i = 0; i < 10; i++) {
            const start = Date.now();
            await this.connection.query('SELECT 1');
            connectionTimes.push(Date.now() - start);
        }

        results.connection_time = {
            avg_ms: connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length,
            min_ms: Math.min(...connectionTimes),
            max_ms: Math.max(...connectionTimes),
            samples: connectionTimes.length
        };

        // Test health check performance
        const healthCheckTimes = [];
        for (let i = 0; i < 20; i++) {
            const start = Date.now();
            const health = this.connection.getHealth();
            healthCheckTimes.push(Date.now() - start);
        }

        results.health_check = {
            avg_ms: healthCheckTimes.reduce((a, b) => a + b, 0) / healthCheckTimes.length,
            min_ms: Math.min(...healthCheckTimes),
            max_ms: Math.max(...healthCheckTimes),
            samples: healthCheckTimes.length
        };

        // Test pool performance
        const poolStats = this.connection.getHealth().poolStats;
        results.pool_performance = {
            total_connections: poolStats?.totalCount || 0,
            idle_connections: poolStats?.idleCount || 0,
            waiting_connections: poolStats?.waitingCount || 0,
            utilization_percentage: poolStats?.totalCount > 0 
                ? Math.round(((poolStats.totalCount - poolStats.idleCount) / poolStats.totalCount) * 100)
                : 0
        };

        return results;
    }

    /**
     * Benchmark CRUD operations
     * @param {number} iterations - Number of iterations
     * @returns {Promise<Object>} CRUD benchmark results
     */
    async benchmarkCrudOperations(iterations = 100) {
        const results = {
            task_operations: {},
            context_operations: {},
            state_operations: {}
        };

        // Task CRUD operations
        results.task_operations = await this.benchmarkTaskCrud(iterations);
        
        // Context CRUD operations
        results.context_operations = await this.benchmarkContextCrud(iterations);
        
        // State CRUD operations
        results.state_operations = await this.benchmarkStateCrud(iterations);

        return results;
    }

    /**
     * Benchmark Task CRUD operations
     * @param {number} iterations - Number of iterations
     * @returns {Promise<Object>} Task CRUD results
     */
    async benchmarkTaskCrud(iterations) {
        const createTimes = [];
        const readTimes = [];
        const updateTimes = [];
        const deleteTimes = [];
        const createdTasks = [];

        // Create operations
        for (let i = 0; i < iterations; i++) {
            const taskData = {
                title: `Benchmark Task ${i}`,
                description: `Performance test task ${i}`,
                type: 'benchmark',
                priority: Math.floor(Math.random() * 10),
                complexity_score: Math.floor(Math.random() * 10) + 1
            };

            const start = Date.now();
            const task = await this.taskRepo.create(taskData);
            createTimes.push(Date.now() - start);
            createdTasks.push(task.id);
        }

        // Read operations
        for (const taskId of createdTasks) {
            const start = Date.now();
            await this.taskRepo.findById(taskId);
            readTimes.push(Date.now() - start);
        }

        // Update operations
        for (const taskId of createdTasks) {
            const start = Date.now();
            await this.taskRepo.update(taskId, { 
                description: `Updated at ${Date.now()}` 
            });
            updateTimes.push(Date.now() - start);
        }

        // Delete operations
        for (const taskId of createdTasks) {
            const start = Date.now();
            await this.taskRepo.delete(taskId);
            deleteTimes.push(Date.now() - start);
        }

        return {
            create: this.calculateStats(createTimes),
            read: this.calculateStats(readTimes),
            update: this.calculateStats(updateTimes),
            delete: this.calculateStats(deleteTimes)
        };
    }

    /**
     * Benchmark Context CRUD operations
     * @param {number} iterations - Number of iterations
     * @returns {Promise<Object>} Context CRUD results
     */
    async benchmarkContextCrud(iterations) {
        // Create a test task first
        const testTask = await this.taskRepo.create({
            title: 'Context Benchmark Task',
            description: 'Task for context benchmarking'
        });

        const createTimes = [];
        const readTimes = [];
        const updateTimes = [];
        const deleteTimes = [];
        const createdContexts = [];

        // Create operations
        for (let i = 0; i < iterations; i++) {
            const contextData = {
                task_id: testTask.id,
                context_type: 'benchmark',
                context_data: {
                    iteration: i,
                    timestamp: Date.now(),
                    data: `Benchmark context data ${i}`
                }
            };

            const start = Date.now();
            const context = await this.contextRepo.create(contextData);
            createTimes.push(Date.now() - start);
            createdContexts.push(context.id);
        }

        // Read operations
        for (const contextId of createdContexts) {
            const start = Date.now();
            await this.contextRepo.findById(contextId);
            readTimes.push(Date.now() - start);
        }

        // Update operations
        for (const contextId of createdContexts) {
            const start = Date.now();
            await this.contextRepo.update(contextId, {
                context_data: { updated: true, timestamp: Date.now() }
            });
            updateTimes.push(Date.now() - start);
        }

        // Delete operations
        for (const contextId of createdContexts) {
            const start = Date.now();
            await this.contextRepo.delete(contextId);
            deleteTimes.push(Date.now() - start);
        }

        // Clean up test task
        await this.taskRepo.delete(testTask.id);

        return {
            create: this.calculateStats(createTimes),
            read: this.calculateStats(readTimes),
            update: this.calculateStats(updateTimes),
            delete: this.calculateStats(deleteTimes)
        };
    }

    /**
     * Benchmark State CRUD operations
     * @param {number} iterations - Number of iterations
     * @returns {Promise<Object>} State CRUD results
     */
    async benchmarkStateCrud(iterations) {
        const createTimes = [];
        const readTimes = [];
        const updateTimes = [];
        const deleteTimes = [];
        const createdStates = [];

        // Create operations
        for (let i = 0; i < iterations; i++) {
            const stateData = {
                workflow_id: `benchmark-workflow-${i}`,
                step: `step-${i}`,
                status: 'pending'
            };

            const start = Date.now();
            const state = await this.stateRepo.create(stateData);
            createTimes.push(Date.now() - start);
            createdStates.push(state.id);
        }

        // Read operations
        for (const stateId of createdStates) {
            const start = Date.now();
            await this.stateRepo.findById(stateId);
            readTimes.push(Date.now() - start);
        }

        // Update operations
        for (const stateId of createdStates) {
            const start = Date.now();
            await this.stateRepo.updateStatus(stateId, 'completed');
            updateTimes.push(Date.now() - start);
        }

        // Delete operations
        for (const stateId of createdStates) {
            const start = Date.now();
            await this.stateRepo.delete(stateId);
            deleteTimes.push(Date.now() - start);
        }

        return {
            create: this.calculateStats(createTimes),
            read: this.calculateStats(readTimes),
            update: this.calculateStats(updateTimes),
            delete: this.calculateStats(deleteTimes)
        };
    }

    /**
     * Benchmark query performance
     * @param {number} iterations - Number of iterations
     * @returns {Promise<Object>} Query performance results
     */
    async benchmarkQueryPerformance(iterations) {
        const results = {
            simple_queries: {},
            complex_queries: {},
            aggregation_queries: {},
            join_queries: {}
        };

        // Simple queries
        const simpleTimes = [];
        for (let i = 0; i < iterations; i++) {
            const start = Date.now();
            await this.connection.query('SELECT COUNT(*) FROM tasks');
            simpleTimes.push(Date.now() - start);
        }
        results.simple_queries = this.calculateStats(simpleTimes);

        // Complex queries with WHERE clauses
        const complexTimes = [];
        for (let i = 0; i < iterations; i++) {
            const start = Date.now();
            await this.connection.query(`
                SELECT * FROM tasks 
                WHERE status = 'pending' 
                AND priority > 5 
                AND created_at > NOW() - INTERVAL '30 days'
                ORDER BY priority DESC, created_at ASC
                LIMIT 10
            `);
            complexTimes.push(Date.now() - start);
        }
        results.complex_queries = this.calculateStats(complexTimes);

        // Aggregation queries
        const aggregationTimes = [];
        for (let i = 0; i < iterations; i++) {
            const start = Date.now();
            await this.connection.query(`
                SELECT 
                    status,
                    COUNT(*) as count,
                    AVG(priority) as avg_priority,
                    AVG(complexity_score) as avg_complexity
                FROM tasks 
                GROUP BY status
            `);
            aggregationTimes.push(Date.now() - start);
        }
        results.aggregation_queries = this.calculateStats(aggregationTimes);

        // Join queries
        const joinTimes = [];
        for (let i = 0; i < iterations; i++) {
            const start = Date.now();
            await this.connection.query(`
                SELECT 
                    t.id,
                    t.title,
                    t.status,
                    COUNT(tc.id) as context_count
                FROM tasks t
                LEFT JOIN task_contexts tc ON t.id = tc.task_id
                GROUP BY t.id, t.title, t.status
                ORDER BY context_count DESC
                LIMIT 20
            `);
            joinTimes.push(Date.now() - start);
        }
        results.join_queries = this.calculateStats(joinTimes);

        return results;
    }

    /**
     * Benchmark concurrent operations
     * @param {number} concurrency - Number of concurrent operations
     * @param {number} iterations - Number of iterations per worker
     * @returns {Promise<Object>} Concurrency benchmark results
     */
    async benchmarkConcurrentOperations(concurrency, iterations) {
        const results = {
            concurrent_reads: {},
            concurrent_writes: {},
            mixed_operations: {}
        };

        // Concurrent reads
        const readPromises = [];
        const readStart = Date.now();
        
        for (let i = 0; i < concurrency; i++) {
            readPromises.push(this.performConcurrentReads(iterations));
        }
        
        await Promise.all(readPromises);
        const readTotalTime = Date.now() - readStart;
        
        results.concurrent_reads = {
            total_time_ms: readTotalTime,
            operations_per_second: Math.round((concurrency * iterations) / (readTotalTime / 1000)),
            concurrency_level: concurrency,
            total_operations: concurrency * iterations
        };

        // Concurrent writes
        const writePromises = [];
        const writeStart = Date.now();
        
        for (let i = 0; i < concurrency; i++) {
            writePromises.push(this.performConcurrentWrites(iterations, i));
        }
        
        await Promise.all(writePromises);
        const writeTotalTime = Date.now() - writeStart;
        
        results.concurrent_writes = {
            total_time_ms: writeTotalTime,
            operations_per_second: Math.round((concurrency * iterations) / (writeTotalTime / 1000)),
            concurrency_level: concurrency,
            total_operations: concurrency * iterations
        };

        // Mixed operations
        const mixedPromises = [];
        const mixedStart = Date.now();
        
        for (let i = 0; i < concurrency; i++) {
            mixedPromises.push(this.performMixedOperations(iterations, i));
        }
        
        await Promise.all(mixedPromises);
        const mixedTotalTime = Date.now() - mixedStart;
        
        results.mixed_operations = {
            total_time_ms: mixedTotalTime,
            operations_per_second: Math.round((concurrency * iterations * 3) / (mixedTotalTime / 1000)), // 3 ops per iteration
            concurrency_level: concurrency,
            total_operations: concurrency * iterations * 3
        };

        return results;
    }

    /**
     * Perform concurrent read operations
     * @param {number} iterations - Number of iterations
     * @returns {Promise<void>}
     */
    async performConcurrentReads(iterations) {
        for (let i = 0; i < iterations; i++) {
            await this.connection.query('SELECT COUNT(*) FROM tasks');
        }
    }

    /**
     * Perform concurrent write operations
     * @param {number} iterations - Number of iterations
     * @param {number} workerId - Worker ID for uniqueness
     * @returns {Promise<void>}
     */
    async performConcurrentWrites(iterations, workerId) {
        const createdTasks = [];
        
        for (let i = 0; i < iterations; i++) {
            const task = await this.taskRepo.create({
                title: `Concurrent Task ${workerId}-${i}`,
                description: `Concurrent benchmark task`,
                type: 'concurrent_benchmark'
            });
            createdTasks.push(task.id);
        }
        
        // Clean up
        for (const taskId of createdTasks) {
            await this.taskRepo.delete(taskId);
        }
    }

    /**
     * Perform mixed operations (read, write, update)
     * @param {number} iterations - Number of iterations
     * @param {number} workerId - Worker ID for uniqueness
     * @returns {Promise<void>}
     */
    async performMixedOperations(iterations, workerId) {
        for (let i = 0; i < iterations; i++) {
            // Create
            const task = await this.taskRepo.create({
                title: `Mixed Op Task ${workerId}-${i}`,
                description: `Mixed operations benchmark task`,
                type: 'mixed_benchmark'
            });
            
            // Read
            await this.taskRepo.findById(task.id);
            
            // Update
            await this.taskRepo.update(task.id, {
                description: `Updated at ${Date.now()}`
            });
            
            // Delete
            await this.taskRepo.delete(task.id);
        }
    }

    /**
     * Benchmark stress tests
     * @param {number} iterations - Number of stress test iterations
     * @returns {Promise<Object>} Stress test results
     */
    async benchmarkStressTests(iterations) {
        console.log(`⚠️  Running stress test with ${iterations} iterations...`);
        
        const results = {
            bulk_insert: {},
            bulk_update: {},
            bulk_delete: {},
            memory_usage: {}
        };

        // Bulk insert stress test
        const insertStart = Date.now();
        const insertedTasks = [];
        
        for (let i = 0; i < iterations; i++) {
            const task = await this.taskRepo.create({
                title: `Stress Test Task ${i}`,
                description: `Stress test task ${i} with some longer description to test memory usage`,
                type: 'stress_test',
                priority: Math.floor(Math.random() * 10),
                complexity_score: Math.floor(Math.random() * 10) + 1,
                tags: [`tag-${i % 10}`, `category-${i % 5}`],
                metadata: {
                    stress_test: true,
                    iteration: i,
                    timestamp: Date.now()
                }
            });
            insertedTasks.push(task.id);
            
            if (i % 100 === 0) {
                console.log(`  Inserted ${i}/${iterations} tasks...`);
            }
        }
        
        const insertTime = Date.now() - insertStart;
        results.bulk_insert = {
            total_time_ms: insertTime,
            operations_per_second: Math.round(iterations / (insertTime / 1000)),
            total_operations: iterations
        };

        // Bulk update stress test
        const updateStart = Date.now();
        
        for (let i = 0; i < insertedTasks.length; i++) {
            await this.taskRepo.update(insertedTasks[i], {
                description: `Updated stress test task ${i}`,
                updated_at: new Date()
            });
            
            if (i % 100 === 0) {
                console.log(`  Updated ${i}/${insertedTasks.length} tasks...`);
            }
        }
        
        const updateTime = Date.now() - updateStart;
        results.bulk_update = {
            total_time_ms: updateTime,
            operations_per_second: Math.round(insertedTasks.length / (updateTime / 1000)),
            total_operations: insertedTasks.length
        };

        // Bulk delete stress test
        const deleteStart = Date.now();
        
        for (let i = 0; i < insertedTasks.length; i++) {
            await this.taskRepo.delete(insertedTasks[i]);
            
            if (i % 100 === 0) {
                console.log(`  Deleted ${i}/${insertedTasks.length} tasks...`);
            }
        }
        
        const deleteTime = Date.now() - deleteStart;
        results.bulk_delete = {
            total_time_ms: deleteTime,
            operations_per_second: Math.round(insertedTasks.length / (deleteTime / 1000)),
            total_operations: insertedTasks.length
        };

        // Memory usage (if available)
        if (process.memoryUsage) {
            const memUsage = process.memoryUsage();
            results.memory_usage = {
                rss_mb: Math.round(memUsage.rss / 1024 / 1024),
                heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
                heap_total_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
                external_mb: Math.round(memUsage.external / 1024 / 1024)
            };
        }

        return results;
    }

    /**
     * Calculate statistics for timing arrays
     * @param {number[]} times - Array of timing measurements
     * @returns {Object} Statistics
     */
    calculateStats(times) {
        if (times.length === 0) {
            return { avg_ms: 0, min_ms: 0, max_ms: 0, p95_ms: 0, p99_ms: 0, samples: 0 };
        }

        const sorted = times.slice().sort((a, b) => a - b);
        const sum = times.reduce((a, b) => a + b, 0);
        
        return {
            avg_ms: Math.round((sum / times.length) * 100) / 100,
            min_ms: sorted[0],
            max_ms: sorted[sorted.length - 1],
            p95_ms: sorted[Math.floor(sorted.length * 0.95)],
            p99_ms: sorted[Math.floor(sorted.length * 0.99)],
            samples: times.length
        };
    }

    /**
     * Generate benchmark summary
     * @param {number} totalTime - Total benchmark time
     * @returns {Object} Summary
     */
    generateSummary(totalTime) {
        const summary = {
            total_time_ms: totalTime,
            total_time_seconds: Math.round(totalTime / 1000),
            timestamp: new Date().toISOString(),
            performance_grade: 'A', // Will be calculated based on results
            recommendations: []
        };

        // Calculate performance grade based on key metrics
        const grades = [];
        
        // Connection performance
        if (this.results.connection?.connection_time?.avg_ms) {
            const connTime = this.results.connection.connection_time.avg_ms;
            if (connTime < 10) grades.push('A');
            else if (connTime < 50) grades.push('B');
            else if (connTime < 100) grades.push('C');
            else grades.push('D');
        }

        // CRUD performance
        if (this.results.crud_operations?.task_operations?.create?.avg_ms) {
            const createTime = this.results.crud_operations.task_operations.create.avg_ms;
            if (createTime < 10) grades.push('A');
            else if (createTime < 50) grades.push('B');
            else if (createTime < 100) grades.push('C');
            else grades.push('D');
        }

        // Query performance
        if (this.results.query_performance?.simple_queries?.avg_ms) {
            const queryTime = this.results.query_performance.simple_queries.avg_ms;
            if (queryTime < 5) grades.push('A');
            else if (queryTime < 20) grades.push('B');
            else if (queryTime < 50) grades.push('C');
            else grades.push('D');
        }

        // Calculate overall grade
        if (grades.length > 0) {
            const gradeValues = { 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
            const avgGrade = grades.reduce((sum, grade) => sum + gradeValues[grade], 0) / grades.length;
            
            if (avgGrade >= 3.5) summary.performance_grade = 'A';
            else if (avgGrade >= 2.5) summary.performance_grade = 'B';
            else if (avgGrade >= 1.5) summary.performance_grade = 'C';
            else summary.performance_grade = 'D';
        }

        // Generate recommendations
        if (this.results.connection?.connection_time?.avg_ms > 50) {
            summary.recommendations.push('Consider optimizing database connection settings or network latency');
        }

        if (this.results.crud_operations?.task_operations?.create?.avg_ms > 100) {
            summary.recommendations.push('CRUD operations are slow - consider database indexing or query optimization');
        }

        if (this.results.query_performance?.complex_queries?.avg_ms > 200) {
            summary.recommendations.push('Complex queries are slow - consider adding indexes or query optimization');
        }

        if (this.results.concurrent_operations?.concurrent_writes?.operations_per_second < 100) {
            summary.recommendations.push('Low concurrent write performance - consider connection pool tuning');
        }

        if (summary.recommendations.length === 0) {
            summary.recommendations.push('Database performance is excellent! No immediate optimizations needed.');
        }

        return summary;
    }

    /**
     * Export benchmark results to JSON
     * @param {string} filepath - File path to save results
     * @returns {Promise<void>}
     */
    async exportResults(filepath) {
        const fs = await import('fs/promises');
        await fs.writeFile(filepath, JSON.stringify(this.results, null, 2));
        console.log(`📊 Benchmark results exported to ${filepath}`);
    }

    /**
     * Print benchmark results to console
     */
    printResults() {
        console.log('\n📊 Database Performance Benchmark Results');
        console.log('==========================================');
        
        if (this.results.connection?.connection_time) {
            console.log(`\n📡 Connection Performance:`);
            console.log(`  Average connection time: ${this.results.connection.connection_time.avg_ms}ms`);
            console.log(`  Min/Max: ${this.results.connection.connection_time.min_ms}ms / ${this.results.connection.connection_time.max_ms}ms`);
        }

        if (this.results.crud_operations?.task_operations) {
            console.log(`\n📝 CRUD Operations (Tasks):`);
            const crud = this.results.crud_operations.task_operations;
            console.log(`  Create: ${crud.create?.avg_ms}ms avg`);
            console.log(`  Read: ${crud.read?.avg_ms}ms avg`);
            console.log(`  Update: ${crud.update?.avg_ms}ms avg`);
            console.log(`  Delete: ${crud.delete?.avg_ms}ms avg`);
        }

        if (this.results.query_performance) {
            console.log(`\n🔍 Query Performance:`);
            const query = this.results.query_performance;
            console.log(`  Simple queries: ${query.simple_queries?.avg_ms}ms avg`);
            console.log(`  Complex queries: ${query.complex_queries?.avg_ms}ms avg`);
            console.log(`  Aggregation queries: ${query.aggregation_queries?.avg_ms}ms avg`);
            console.log(`  Join queries: ${query.join_queries?.avg_ms}ms avg`);
        }

        if (this.results.concurrent_operations) {
            console.log(`\n⚡ Concurrent Operations:`);
            const concurrent = this.results.concurrent_operations;
            console.log(`  Concurrent reads: ${concurrent.concurrent_reads?.operations_per_second} ops/sec`);
            console.log(`  Concurrent writes: ${concurrent.concurrent_writes?.operations_per_second} ops/sec`);
            console.log(`  Mixed operations: ${concurrent.mixed_operations?.operations_per_second} ops/sec`);
        }

        if (this.results.summary) {
            console.log(`\n📈 Summary:`);
            console.log(`  Overall Grade: ${this.results.summary.performance_grade}`);
            console.log(`  Total Time: ${this.results.summary.total_time_seconds}s`);
            console.log(`  Recommendations:`);
            this.results.summary.recommendations.forEach(rec => {
                console.log(`    • ${rec}`);
            });
        }

        console.log('\n==========================================\n');
    }
}

export default DatabaseBenchmark;

