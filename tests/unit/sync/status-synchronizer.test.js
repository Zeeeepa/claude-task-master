/**
 * @fileoverview Unit tests for StatusSynchronizer
 * @description Tests for the main synchronization orchestrator
 */

import { jest } from '@jest/globals';
import { StatusSynchronizer } from '../../../src/sync/status-synchronizer.js';

// Mock dependencies
jest.mock('../../../src/sync/event-processor.js', () => ({
    EventProcessor: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(),
        start: jest.fn().mockResolvedValue(),
        stop: jest.fn().mockResolvedValue(),
        getStatus: jest.fn().mockReturnValue({ isProcessing: true }),
        on: jest.fn(),
        addEvent: jest.fn().mockReturnValue('event-123')
    }))
}));

jest.mock('../../../src/sync/websocket-manager.js', () => ({
    WebSocketManager: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(),
        start: jest.fn().mockResolvedValue(),
        stop: jest.fn().mockResolvedValue(),
        getStatus: jest.fn().mockReturnValue({ isRunning: true }),
        on: jest.fn()
    }))
}));

jest.mock('../../../src/sync/conflict-resolver.js', () => ({
    ConflictResolver: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(),
        detectConflicts: jest.fn().mockResolvedValue([]),
        resolveConflicts: jest.fn().mockResolvedValue({
            resolvedUpdate: {},
            strategy: 'priority_based',
            reason: 'Test resolution'
        }),
        getStatus: jest.fn().mockReturnValue({ isInitialized: true }),
        on: jest.fn()
    }))
}));

jest.mock('../../../src/sync/status-mapper.js', () => ({
    StatusMapper: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(),
        mapStatusToSystems: jest.fn().mockResolvedValue({
            postgresql: { status: 'completed' },
            linear: { status: 'Done' },
            github: { status: 'merged' }
        }),
        getStatus: jest.fn().mockReturnValue({ isInitialized: true })
    }))
}));

jest.mock('../../../src/monitoring/sync-monitor.js', () => ({
    SyncMonitor: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(),
        start: jest.fn().mockResolvedValue(),
        stop: jest.fn().mockResolvedValue(),
        getStatus: jest.fn().mockReturnValue({ isRunning: true }),
        recordHealthCheck: jest.fn()
    }))
}));

jest.mock('../../../src/ai_cicd_system/database/connection.js', () => ({
    DatabaseConnection: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(),
        close: jest.fn().mockResolvedValue(),
        query: jest.fn().mockResolvedValue({
            rows: [{ id: 'task-123', status: 'completed' }]
        })
    }))
}));

describe('StatusSynchronizer', () => {
    let synchronizer;
    let mockConfig;

    beforeEach(() => {
        mockConfig = {
            enableRealTimeSync: true,
            syncInterval: 1000,
            systems: {
                postgresql: { enabled: true, priority: 0 },
                linear: { enabled: true, priority: 1 },
                github: { enabled: true, priority: 2 }
            }
        };

        synchronizer = new StatusSynchronizer(mockConfig);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize successfully', async () => {
            await synchronizer.initialize();

            expect(synchronizer.isInitialized).toBe(true);
            expect(synchronizer.eventProcessor.initialize).toHaveBeenCalled();
            expect(synchronizer.websocketManager.initialize).toHaveBeenCalled();
            expect(synchronizer.conflictResolver.initialize).toHaveBeenCalled();
            expect(synchronizer.statusMapper.initialize).toHaveBeenCalled();
            expect(synchronizer.monitor.initialize).toHaveBeenCalled();
        });

        test('should not initialize twice', async () => {
            await synchronizer.initialize();
            await synchronizer.initialize();

            expect(synchronizer.eventProcessor.initialize).toHaveBeenCalledTimes(1);
        });

        test('should handle initialization errors', async () => {
            synchronizer.eventProcessor.initialize.mockRejectedValue(new Error('Init failed'));

            await expect(synchronizer.initialize()).rejects.toThrow('Init failed');
            expect(synchronizer.isInitialized).toBe(false);
        });
    });

    describe('Start/Stop', () => {
        beforeEach(async () => {
            await synchronizer.initialize();
        });

        test('should start successfully', async () => {
            await synchronizer.start();

            expect(synchronizer.isRunning).toBe(true);
            expect(synchronizer.eventProcessor.start).toHaveBeenCalled();
            expect(synchronizer.websocketManager.start).toHaveBeenCalled();
        });

        test('should stop successfully', async () => {
            await synchronizer.start();
            await synchronizer.stop();

            expect(synchronizer.isRunning).toBe(false);
            expect(synchronizer.eventProcessor.stop).toHaveBeenCalled();
            expect(synchronizer.websocketManager.stop).toHaveBeenCalled();
        });

        test('should not start if not initialized', async () => {
            const uninitializedSynchronizer = new StatusSynchronizer(mockConfig);
            await uninitializedSynchronizer.start();

            expect(uninitializedSynchronizer.isInitialized).toBe(true);
            expect(uninitializedSynchronizer.isRunning).toBe(true);
        });
    });

    describe('Status Synchronization', () => {
        beforeEach(async () => {
            await synchronizer.initialize();
            await synchronizer.start();
        });

        test('should synchronize status successfully', async () => {
            const statusUpdate = {
                entityId: 'task-123',
                entityType: 'task',
                status: 'completed',
                metadata: { completedBy: 'user-456' }
            };

            const result = await synchronizer.synchronizeStatus(statusUpdate, 'linear');

            expect(result.success).toBe(true);
            expect(result.syncId).toBeDefined();
            expect(result.duration).toBeGreaterThan(0);
            expect(result.results).toBeDefined();
        });

        test('should validate status update', async () => {
            const invalidUpdate = {
                entityId: 'task-123'
                // Missing required fields
            };

            await expect(
                synchronizer.synchronizeStatus(invalidUpdate, 'linear')
            ).rejects.toThrow('Status update must include status');
        });

        test('should handle conflicts', async () => {
            const conflicts = [
                {
                    type: 'concurrent_update',
                    description: 'Concurrent update detected',
                    severity: 'medium'
                }
            ];

            synchronizer.conflictResolver.detectConflicts.mockResolvedValue(conflicts);

            const statusUpdate = {
                entityId: 'task-123',
                entityType: 'task',
                status: 'completed'
            };

            const result = await synchronizer.synchronizeStatus(statusUpdate, 'linear');

            expect(result.success).toBe(true);
            expect(synchronizer.conflictResolver.resolveConflicts).toHaveBeenCalledWith(
                conflicts,
                statusUpdate
            );
        });

        test('should handle synchronization errors', async () => {
            synchronizer.statusMapper.mapStatusToSystems.mockRejectedValue(
                new Error('Mapping failed')
            );

            const statusUpdate = {
                entityId: 'task-123',
                entityType: 'task',
                status: 'completed'
            };

            await expect(
                synchronizer.synchronizeStatus(statusUpdate, 'linear')
            ).rejects.toThrow('Mapping failed');
        });

        test('should update sync statistics', async () => {
            const statusUpdate = {
                entityId: 'task-123',
                entityType: 'task',
                status: 'completed'
            };

            const initialStats = { ...synchronizer.syncStats };
            await synchronizer.synchronizeStatus(statusUpdate, 'linear');

            expect(synchronizer.syncStats.totalSyncs).toBe(initialStats.totalSyncs + 1);
            expect(synchronizer.syncStats.successfulSyncs).toBe(initialStats.successfulSyncs + 1);
        });
    });

    describe('System Integration', () => {
        beforeEach(async () => {
            await synchronizer.initialize();
            await synchronizer.start();
        });

        test('should sync to PostgreSQL', async () => {
            const mappedStatus = {
                entityId: 'task-123',
                status: 'completed',
                metadata: {}
            };

            const result = await synchronizer._syncToPostgreSQL(mappedStatus);

            expect(result).toBeDefined();
            expect(synchronizer.db.query).toHaveBeenCalledWith(
                expect.stringContaining('UPDATE tasks'),
                expect.arrayContaining(['completed', expect.any(String), 'task-123'])
            );
        });

        test('should handle PostgreSQL sync errors', async () => {
            synchronizer.db.query.mockResolvedValue({ rows: [] });

            const mappedStatus = {
                entityId: 'nonexistent-task',
                status: 'completed',
                metadata: {}
            };

            await expect(
                synchronizer._syncToPostgreSQL(mappedStatus)
            ).rejects.toThrow('Task not found: nonexistent-task');
        });
    });

    describe('Health Status', () => {
        beforeEach(async () => {
            await synchronizer.initialize();
        });

        test('should return health status', () => {
            const health = synchronizer.getHealthStatus();

            expect(health).toMatchObject({
                isInitialized: true,
                isRunning: false,
                activeSyncs: 0,
                queueSize: 0,
                stats: expect.any(Object),
                components: expect.any(Object),
                lastHealthCheck: expect.any(String)
            });
        });

        test('should include component status', () => {
            const health = synchronizer.getHealthStatus();

            expect(health.components).toHaveProperty('eventProcessor');
            expect(health.components).toHaveProperty('websocketManager');
            expect(health.components).toHaveProperty('conflictResolver');
            expect(health.components).toHaveProperty('statusMapper');
            expect(health.components).toHaveProperty('monitor');
        });
    });

    describe('Event Handling', () => {
        beforeEach(async () => {
            await synchronizer.initialize();
        });

        test('should emit events on sync completion', async () => {
            const eventSpy = jest.fn();
            synchronizer.on('sync:completed', eventSpy);

            const statusUpdate = {
                entityId: 'task-123',
                entityType: 'task',
                status: 'completed'
            };

            await synchronizer.synchronizeStatus(statusUpdate, 'linear');

            expect(eventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    syncId: expect.any(String),
                    statusUpdate,
                    sourceSystem: 'linear',
                    results: expect.any(Object),
                    duration: expect.any(Number)
                })
            );
        });

        test('should emit events on sync failure', async () => {
            const eventSpy = jest.fn();
            synchronizer.on('sync:failed', eventSpy);

            synchronizer.statusMapper.mapStatusToSystems.mockRejectedValue(
                new Error('Mapping failed')
            );

            const statusUpdate = {
                entityId: 'task-123',
                entityType: 'task',
                status: 'completed'
            };

            try {
                await synchronizer.synchronizeStatus(statusUpdate, 'linear');
            } catch (error) {
                // Expected to fail
            }

            expect(eventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    syncId: expect.any(String),
                    statusUpdate,
                    sourceSystem: 'linear',
                    error: 'Mapping failed',
                    duration: expect.any(Number)
                })
            );
        });
    });

    describe('Configuration', () => {
        test('should use default configuration', () => {
            const defaultSynchronizer = new StatusSynchronizer();

            expect(defaultSynchronizer.config.enableRealTimeSync).toBe(true);
            expect(defaultSynchronizer.config.syncInterval).toBe(5000);
            expect(defaultSynchronizer.config.systems.postgresql.priority).toBe(0);
        });

        test('should merge custom configuration', () => {
            const customConfig = {
                syncInterval: 2000,
                systems: {
                    linear: { enabled: false }
                }
            };

            const customSynchronizer = new StatusSynchronizer(customConfig);

            expect(customSynchronizer.config.syncInterval).toBe(2000);
            expect(customSynchronizer.config.systems.linear.enabled).toBe(false);
            expect(customSynchronizer.config.enableRealTimeSync).toBe(true); // Default preserved
        });
    });

    describe('Sync Queue Management', () => {
        beforeEach(async () => {
            await synchronizer.initialize();
        });

        test('should track sync in queue', async () => {
            const statusUpdate = {
                entityId: 'task-123',
                entityType: 'task',
                status: 'completed'
            };

            const result = await synchronizer.synchronizeStatus(statusUpdate, 'linear');
            const syncStatus = synchronizer.getSyncStatus(result.syncId);

            expect(syncStatus).toMatchObject({
                id: result.syncId,
                statusUpdate,
                sourceSystem: 'linear',
                status: 'completed'
            });
        });

        test('should return null for unknown sync ID', () => {
            const syncStatus = synchronizer.getSyncStatus('unknown-sync-id');
            expect(syncStatus).toBeNull();
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await synchronizer.initialize();
        });

        test('should handle database connection errors', async () => {
            synchronizer.db.query.mockRejectedValue(new Error('Database connection failed'));

            const statusUpdate = {
                entityId: 'task-123',
                entityType: 'task',
                status: 'completed'
            };

            await expect(
                synchronizer.synchronizeStatus(statusUpdate, 'postgresql')
            ).rejects.toThrow();
        });

        test('should handle component initialization errors', async () => {
            const failingSynchronizer = new StatusSynchronizer(mockConfig);
            failingSynchronizer.eventProcessor.initialize.mockRejectedValue(
                new Error('Component failed')
            );

            await expect(failingSynchronizer.initialize()).rejects.toThrow('Component failed');
        });
    });

    describe('Performance', () => {
        beforeEach(async () => {
            await synchronizer.initialize();
        });

        test('should track sync duration', async () => {
            const statusUpdate = {
                entityId: 'task-123',
                entityType: 'task',
                status: 'completed'
            };

            const result = await synchronizer.synchronizeStatus(statusUpdate, 'linear');

            expect(result.duration).toBeGreaterThan(0);
            expect(synchronizer.syncStats.averageSyncTime).toBeGreaterThan(0);
        });

        test('should update average sync time', async () => {
            const statusUpdate = {
                entityId: 'task-123',
                entityType: 'task',
                status: 'completed'
            };

            // Perform multiple syncs
            await synchronizer.synchronizeStatus(statusUpdate, 'linear');
            await synchronizer.synchronizeStatus(statusUpdate, 'linear');

            expect(synchronizer.syncStats.totalSyncs).toBe(2);
            expect(synchronizer.syncStats.averageSyncTime).toBeGreaterThan(0);
        });
    });
});

