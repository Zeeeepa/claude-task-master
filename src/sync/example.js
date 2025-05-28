/**
 * @fileoverview Real-time Status Synchronization System Example
 * @description Comprehensive example demonstrating the synchronization system
 */

import { StatusSynchronizer } from './status-synchronizer.js';
import { EventProcessor } from './event-processor.js';
import { WebSocketManager } from './websocket-manager.js';
import { ConflictResolver } from './conflict-resolver.js';
import { StatusMapper } from './status-mapper.js';
import { SyncMonitor } from '../monitoring/sync-monitor.js';

/**
 * Basic Usage Example
 */
async function basicUsageExample() {
    console.log('\n🚀 Basic Usage Example');
    console.log('='.repeat(50));

    try {
        // Initialize the synchronization system
        const synchronizer = new StatusSynchronizer({
            enableRealTimeSync: true,
            syncInterval: 5000,
            systems: {
                linear: { enabled: true, priority: 1 },
                github: { enabled: true, priority: 2 },
                postgresql: { enabled: true, priority: 0 },
                agentapi: { enabled: true, priority: 3 }
            }
        });

        // Start the system
        await synchronizer.initialize();
        await synchronizer.start();

        console.log('✅ Synchronization system started successfully');

        // Example status update
        const statusUpdate = {
            entityId: 'task-123',
            entityType: 'task',
            status: 'completed',
            metadata: {
                completedBy: 'user-456',
                completedAt: new Date().toISOString(),
                description: 'Task completed successfully'
            }
        };

        // Synchronize the status update
        console.log('🔄 Synchronizing status update...');
        const result = await synchronizer.synchronizeStatus(statusUpdate, 'linear');
        
        console.log('✅ Synchronization completed:', {
            syncId: result.syncId,
            success: result.success,
            duration: result.duration,
            systems: Object.keys(result.results)
        });

        // Get health status
        const health = synchronizer.getHealthStatus();
        console.log('📊 System health:', {
            overall: health.isRunning ? 'running' : 'stopped',
            activeSyncs: health.activeSyncs,
            queueSize: health.queueSize
        });

        // Stop the system
        await synchronizer.stop();
        console.log('🛑 Synchronization system stopped');

    } catch (error) {
        console.error('❌ Basic usage example failed:', error);
    }
}

/**
 * Event Processing Example
 */
async function eventProcessingExample() {
    console.log('\n📥 Event Processing Example');
    console.log('='.repeat(50));

    try {
        const processor = new EventProcessor({
            maxQueueSize: 1000,
            batchSize: 10,
            enableDeduplication: true,
            maxRetries: 3,
            enableBatching: true
        });

        await processor.initialize();
        await processor.start();

        console.log('✅ Event processor started');

        // Add events with different priorities
        const events = [
            {
                entityId: 'critical-task-1',
                entityType: 'task',
                status: 'failed',
                source: 'postgresql'
            },
            {
                entityId: 'normal-task-1',
                entityType: 'task',
                status: 'in_progress',
                source: 'linear'
            },
            {
                entityId: 'low-task-1',
                entityType: 'task',
                status: 'pending',
                source: 'github'
            }
        ];

        const priorities = ['critical', 'normal', 'low'];

        for (let i = 0; i < events.length; i++) {
            const eventId = processor.addEvent(events[i], priorities[i]);
            console.log(`📥 Added event [${eventId}] with priority: ${priorities[i]}`);
        }

        // Listen for processed events
        processor.on('status:update', (event) => {
            console.log(`✅ Processed event [${event.id}]: ${event.data.entityType}:${event.data.entityId}`);
        });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get status
        const status = processor.getStatus();
        console.log('📊 Processor status:', {
            isProcessing: status.isProcessing,
            totalEvents: status.metrics.totalEvents,
            processedEvents: status.metrics.processedEvents
        });

        await processor.stop();
        console.log('🛑 Event processor stopped');

    } catch (error) {
        console.error('❌ Event processing example failed:', error);
    }
}

/**
 * WebSocket Communication Example
 */
async function webSocketExample() {
    console.log('\n🌐 WebSocket Communication Example');
    console.log('='.repeat(50));

    try {
        const wsManager = new WebSocketManager({
            port: 8081, // Use different port for example
            maxConnections: 100,
            enableAuth: false, // Disable auth for example
            enableRateLimit: true
        });

        await wsManager.initialize();
        await wsManager.start();

        console.log('✅ WebSocket server started on port 8081');

        // Listen for connections
        wsManager.on('connection:new', (connection) => {
            console.log(`🔌 New connection: ${connection.id}`);
            
            // Send welcome message
            wsManager.sendToConnection(connection.id, {
                type: 'welcome',
                message: 'Connected to sync system'
            });
        });

        // Listen for messages
        wsManager.on('client:message', (message) => {
            console.log(`📥 Received message: ${message.type} from ${message.connectionId}`);
        });

        // Simulate broadcasting updates
        setTimeout(() => {
            wsManager.broadcast({
                type: 'status_update',
                data: {
                    entityId: 'task-456',
                    entityType: 'task',
                    status: 'completed',
                    timestamp: new Date().toISOString()
                }
            });
            console.log('📡 Broadcasted status update');
        }, 1000);

        // Wait for demo
        await new Promise(resolve => setTimeout(resolve, 3000));

        await wsManager.stop();
        console.log('🛑 WebSocket server stopped');

    } catch (error) {
        console.error('❌ WebSocket example failed:', error);
    }
}

/**
 * Conflict Resolution Example
 */
async function conflictResolutionExample() {
    console.log('\n⚔️ Conflict Resolution Example');
    console.log('='.repeat(50));

    try {
        const resolver = new ConflictResolver({
            defaultStrategy: 'priority_based',
            autoResolve: true,
            systemPriorities: {
                postgresql: 0,
                linear: 1,
                github: 2,
                agentapi: 3
            }
        });

        await resolver.initialize();

        console.log('✅ Conflict resolver initialized');

        // Simulate conflicting status update
        const statusUpdate = {
            entityId: 'task-789',
            entityType: 'task',
            status: 'completed',
            source: 'linear',
            timestamp: Date.now()
        };

        // Detect conflicts
        console.log('🔍 Detecting conflicts...');
        const conflicts = await resolver.detectConflicts(statusUpdate, 'linear');
        
        if (conflicts.length > 0) {
            console.log(`⚠️ Found ${conflicts.length} conflicts:`);
            conflicts.forEach((conflict, index) => {
                console.log(`  ${index + 1}. ${conflict.type}: ${conflict.description}`);
            });

            // Resolve conflicts
            console.log('🔧 Resolving conflicts...');
            const resolution = await resolver.resolveConflicts(conflicts, statusUpdate);
            
            console.log('✅ Conflicts resolved:', {
                strategy: resolution.strategy,
                winningSystem: resolution.winningSystem,
                reason: resolution.reason
            });
        } else {
            console.log('✅ No conflicts detected');
        }

        // Add custom resolution strategy
        resolver.registerResolutionStrategy('custom_merge', async (conflicts, statusUpdate) => {
            return {
                resolvedUpdate: {
                    ...statusUpdate,
                    status: 'in_progress', // Custom resolution logic
                    metadata: {
                        ...statusUpdate.metadata,
                        resolvedBy: 'custom_strategy'
                    }
                },
                winningSystem: 'custom',
                reason: 'Applied custom merge strategy',
                conflictsResolved: conflicts.length
            };
        });

        console.log('📝 Registered custom resolution strategy');

        // Get status
        const status = resolver.getStatus();
        console.log('📊 Resolver status:', {
            isInitialized: status.isInitialized,
            availableStrategies: status.availableStrategies,
            totalConflicts: status.metrics.totalConflicts
        });

    } catch (error) {
        console.error('❌ Conflict resolution example failed:', error);
    }
}

/**
 * Status Mapping Example
 */
async function statusMappingExample() {
    console.log('\n🗺️ Status Mapping Example');
    console.log('='.repeat(50));

    try {
        const mapper = new StatusMapper({
            enableBidirectionalMapping: true,
            enableCustomMappings: true,
            strictMapping: false
        });

        await mapper.initialize();

        console.log('✅ Status mapper initialized');

        // Example status update from Linear
        const linearStatusUpdate = {
            entityId: 'issue-123',
            entityType: 'issue',
            status: 'Done',
            priority: 'High',
            metadata: {
                assignee: 'john.doe',
                labels: ['bug', 'urgent']
            }
        };

        // Map to different systems
        console.log('🔄 Mapping Linear status to other systems...');
        const mappedStatuses = await mapper.mapStatusToSystems(linearStatusUpdate, 'linear');

        Object.entries(mappedStatuses).forEach(([system, mappedStatus]) => {
            if (mappedStatus.error) {
                console.log(`❌ ${system}: ${mappedStatus.error}`);
            } else {
                console.log(`✅ ${system}: ${mappedStatus.status} (${mappedStatus.entityType})`);
            }
        });

        // Add custom mapping
        mapper.addCustomMapping('linear', 'github', 'In Review', 'draft', 'status');
        console.log('📝 Added custom mapping: Linear "In Review" -> GitHub "draft"');

        // Test custom mapping
        const customStatusUpdate = {
            entityId: 'pr-456',
            entityType: 'pr',
            status: 'In Review'
        };

        const githubMapped = await mapper.mapStatus(customStatusUpdate, 'linear', 'github');
        console.log('🔄 Custom mapping result:', {
            original: customStatusUpdate.status,
            mapped: githubMapped.status
        });

        // Get status
        const status = mapper.getStatus();
        console.log('📊 Mapper status:', {
            isInitialized: status.isInitialized,
            supportedSystems: status.supportedSystems,
            customMappingsCount: status.customMappingsCount
        });

    } catch (error) {
        console.error('❌ Status mapping example failed:', error);
    }
}

/**
 * Monitoring Example
 */
async function monitoringExample() {
    console.log('\n📊 Monitoring Example');
    console.log('='.repeat(50));

    try {
        const monitor = new SyncMonitor({
            enableMetrics: true,
            enableAlerts: true,
            alertThresholds: {
                syncFailureRate: 0.1,
                avgSyncTime: 5000,
                queueSize: 100
            }
        });

        await monitor.initialize();
        await monitor.start();

        console.log('✅ Sync monitor started');

        // Simulate sync events
        const syncEvents = [
            { success: true, duration: 1200, conflicts: 0 },
            { success: true, duration: 800, conflicts: 1 },
            { success: false, duration: 5000, conflicts: 2 },
            { success: true, duration: 1500, conflicts: 0 },
            { success: true, duration: 900, conflicts: 0 }
        ];

        console.log('📈 Recording sync events...');
        syncEvents.forEach((event, index) => {
            monitor.recordSyncEvent(event);
            console.log(`  Event ${index + 1}: ${event.success ? 'success' : 'failure'} (${event.duration}ms, ${event.conflicts} conflicts)`);
        });

        // Record queue metrics
        monitor.recordQueueMetrics({ size: 25, waitTime: 500 });
        console.log('📊 Recorded queue metrics');

        // Record conflict events
        monitor.recordConflictEvent({ resolved: true, escalated: false });
        console.log('⚔️ Recorded conflict event');

        // Listen for alerts
        monitor.on('alert:created', (alert) => {
            console.log(`🚨 Alert created: ${alert.severity} - ${alert.message}`);
        });

        monitor.on('alert:resolved', (alert) => {
            console.log(`✅ Alert resolved: ${alert.id}`);
        });

        // Get metrics
        const metrics = monitor.getMetrics();
        console.log('📊 Current metrics:', {
            totalSyncs: metrics.totalSyncs,
            successfulSyncs: metrics.successfulSyncs,
            failedSyncs: metrics.failedSyncs,
            averageSyncTime: Math.round(metrics.averageSyncTime),
            errorRate: (metrics.errorRate * 100).toFixed(2) + '%',
            availability: (metrics.availability * 100).toFixed(2) + '%'
        });

        // Get active alerts
        const alerts = monitor.getActiveAlerts();
        console.log(`🚨 Active alerts: ${alerts.length}`);

        // Get health status
        const health = monitor.getHealthStatus();
        console.log('🏥 Health status:', health.overall);

        await monitor.stop();
        console.log('🛑 Sync monitor stopped');

    } catch (error) {
        console.error('❌ Monitoring example failed:', error);
    }
}

/**
 * Complete Integration Example
 */
async function completeIntegrationExample() {
    console.log('\n🔗 Complete Integration Example');
    console.log('='.repeat(50));

    try {
        // Initialize all components
        const synchronizer = new StatusSynchronizer({
            enableRealTimeSync: true,
            syncInterval: 3000,
            systems: {
                linear: { enabled: true, priority: 1 },
                github: { enabled: true, priority: 2 },
                postgresql: { enabled: true, priority: 0 }
            },
            conflictResolution: {
                strategy: 'priority_based',
                autoResolve: true
            },
            monitoring: {
                enableMetrics: true,
                enableAlerts: true
            }
        });

        console.log('🔄 Initializing complete synchronization system...');
        await synchronizer.initialize();
        await synchronizer.start();

        console.log('✅ Complete system started successfully');

        // Listen for events
        synchronizer.on('sync:completed', (event) => {
            console.log(`✅ Sync completed [${event.syncId}] in ${event.duration}ms`);
        });

        synchronizer.on('sync:failed', (event) => {
            console.log(`❌ Sync failed [${event.syncId}]: ${event.error}`);
        });

        synchronizer.on('conflict:detected', (event) => {
            console.log(`⚠️ Conflicts detected: ${event.conflicts.length}`);
        });

        synchronizer.on('conflict:resolved', (event) => {
            console.log(`✅ Conflicts resolved using ${event.resolution.strategy}`);
        });

        // Simulate real-world scenario
        const scenarios = [
            {
                name: 'Task Creation',
                update: {
                    entityId: 'task-001',
                    entityType: 'task',
                    status: 'pending',
                    metadata: { createdBy: 'user-123' }
                },
                source: 'linear'
            },
            {
                name: 'Task Start',
                update: {
                    entityId: 'task-001',
                    entityType: 'task',
                    status: 'in_progress',
                    metadata: { startedBy: 'user-123', startedAt: new Date().toISOString() }
                },
                source: 'linear'
            },
            {
                name: 'PR Creation',
                update: {
                    entityId: 'pr-001',
                    entityType: 'pr',
                    status: 'open',
                    metadata: { author: 'user-123', branch: 'feature/task-001' }
                },
                source: 'github'
            },
            {
                name: 'Task Completion',
                update: {
                    entityId: 'task-001',
                    entityType: 'task',
                    status: 'completed',
                    metadata: { completedBy: 'user-123', completedAt: new Date().toISOString() }
                },
                source: 'postgresql'
            }
        ];

        console.log('🎭 Running real-world scenarios...');
        
        for (const scenario of scenarios) {
            console.log(`\n📋 Scenario: ${scenario.name}`);
            
            try {
                const result = await synchronizer.synchronizeStatus(
                    scenario.update, 
                    scenario.source
                );
                
                console.log(`  ✅ Success: ${result.syncId} (${result.duration}ms)`);
                
                // Show sync results
                Object.entries(result.results).forEach(([system, result]) => {
                    const status = result.success ? '✅' : '❌';
                    console.log(`    ${status} ${system}: ${result.success ? 'synced' : result.error}`);
                });
                
            } catch (error) {
                console.log(`  ❌ Failed: ${error.message}`);
            }
            
            // Wait between scenarios
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Get final system status
        console.log('\n📊 Final System Status:');
        const health = synchronizer.getHealthStatus();
        
        console.log(`  Overall Status: ${health.isRunning ? '🟢 Running' : '🔴 Stopped'}`);
        console.log(`  Active Syncs: ${health.activeSyncs}`);
        console.log(`  Queue Size: ${health.queueSize}`);
        console.log(`  Total Syncs: ${health.stats.totalSyncs}`);
        console.log(`  Success Rate: ${((health.stats.successfulSyncs / health.stats.totalSyncs) * 100).toFixed(1)}%`);
        console.log(`  Avg Sync Time: ${health.stats.averageSyncTime.toFixed(0)}ms`);

        // Component status
        console.log('\n🔧 Component Status:');
        Object.entries(health.components).forEach(([component, status]) => {
            const indicator = status.isRunning ? '🟢' : '🔴';
            console.log(`  ${indicator} ${component}: ${status.isRunning ? 'healthy' : 'stopped'}`);
        });

        await synchronizer.stop();
        console.log('\n🛑 Complete system stopped successfully');

    } catch (error) {
        console.error('❌ Complete integration example failed:', error);
    }
}

/**
 * Run all examples
 */
async function runAllExamples() {
    console.log('🚀 Real-time Status Synchronization System Examples');
    console.log('='.repeat(60));

    try {
        await basicUsageExample();
        await eventProcessingExample();
        await webSocketExample();
        await conflictResolutionExample();
        await statusMappingExample();
        await monitoringExample();
        await completeIntegrationExample();

        console.log('\n🎉 All examples completed successfully!');
        
    } catch (error) {
        console.error('\n❌ Examples failed:', error);
    }
}

// Export functions for individual testing
export {
    basicUsageExample,
    eventProcessingExample,
    webSocketExample,
    conflictResolutionExample,
    statusMappingExample,
    monitoringExample,
    completeIntegrationExample,
    runAllExamples
};

// Run all examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(console.error);
}

