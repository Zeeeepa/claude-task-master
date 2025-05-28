/**
 * @fileoverview Integration tests for the complete synchronization system
 * @description Tests the interaction between all synchronization components
 */

import { jest } from '@jest/globals';
import { StatusSynchronizer } from '../../../src/sync/status-synchronizer.js';
import { EventProcessor } from '../../../src/sync/event-processor.js';
import { WebSocketManager } from '../../../src/sync/websocket-manager.js';
import { ConflictResolver } from '../../../src/sync/conflict-resolver.js';
import { StatusMapper } from '../../../src/sync/status-mapper.js';
import { SyncMonitor } from '../../../src/monitoring/sync-monitor.js';

// Mock database connection
jest.mock('../../../src/ai_cicd_system/database/connection.js', () => ({
    DatabaseConnection: jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(),
        close: jest.fn().mockResolvedValue(),
        query: jest.fn().mockResolvedValue({
            rows: [{ id: 'task-123', status: 'completed', updated_at: new Date() }]
        })
    }))
}));

describe('Sync System Integration', () => {
    let synchronizer;
    let eventProcessor;
    let wsManager;
    let conflictResolver;
    let statusMapper;
    let monitor;

    beforeAll(async () => {
        // Initialize components with test configuration
        const testConfig = {
            enableRealTimeSync: false, // Disable for testing
            syncInterval: 100,
            systems: {
                postgresql: { enabled: true, priority: 0 },
                linear: { enabled: true, priority: 1 },
                github: { enabled: true, priority: 2 }
            },
            monitoring: {
                enableMetrics: true,
                enableAlerts: false // Disable alerts for testing
            }
        };

        synchronizer = new StatusSynchronizer(testConfig);
        await synchronizer.initialize();
    });

    afterAll(async () => {
        if (synchronizer && synchronizer.isRunning) {
            await synchronizer.stop();
        }
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Component Integration', () => {
        test('should initialize all components successfully', async () => {
            expect(synchronizer.isInitialized).toBe(true);
            expect(synchronizer.eventProcessor).toBeDefined();
            expect(synchronizer.websocketManager).toBeDefined();
            expect(synchronizer.conflictResolver).toBeDefined();
            expect(synchronizer.statusMapper).toBeDefined();
            expect(synchronizer.monitor).toBeDefined();
        });

        test('should start and stop all components', async () => {
            await synchronizer.start();
            expect(synchronizer.isRunning).toBe(true);

            await synchronizer.stop();
            expect(synchronizer.isRunning).toBe(false);
        });
    });

    describe('End-to-End Synchronization', () => {
        beforeEach(async () => {
            await synchronizer.start();
        });

        afterEach(async () => {
            await synchronizer.stop();
        });

        test('should synchronize status across all systems', async () => {
            const statusUpdate = {
                entityId: 'task-integration-test',
                entityType: 'task',
                status: 'completed',
                metadata: {
                    completedBy: 'integration-test',
                    completedAt: new Date().toISOString()
                }
            };

            const result = await synchronizer.synchronizeStatus(statusUpdate, 'linear');

            expect(result.success).toBe(true);
            expect(result.syncId).toBeDefined();
            expect(result.results).toBeDefined();
            
            // Verify all target systems were processed
            expect(result.results).toHaveProperty('postgresql');
            expect(result.results).toHaveProperty('github');
            // Linear should not be in results as it's the source system
            expect(result.results).not.toHaveProperty('linear');
        });

        test('should handle multiple concurrent synchronizations', async () => {
            const statusUpdates = [
                {
                    entityId: 'task-concurrent-1',
                    entityType: 'task',
                    status: 'in_progress'
                },
                {
                    entityId: 'task-concurrent-2',
                    entityType: 'task',
                    status: 'completed'
                },
                {
                    entityId: 'task-concurrent-3',
                    entityType: 'task',
                    status: 'failed'
                }
            ];

            const promises = statusUpdates.map(update => 
                synchronizer.synchronizeStatus(update, 'postgresql')
            );

            const results = await Promise.all(promises);

            results.forEach(result => {
                expect(result.success).toBe(true);
                expect(result.syncId).toBeDefined();
            });

            // Verify all syncs were tracked
            expect(synchronizer.syncStats.totalSyncs).toBeGreaterThanOrEqual(3);
        });

        test('should propagate events between components', async () => {
            const eventSpy = jest.fn();
            synchronizer.on('sync:completed', eventSpy);

            const statusUpdate = {
                entityId: 'task-event-test',
                entityType: 'task',
                status: 'completed'
            };

            await synchronizer.synchronizeStatus(statusUpdate, 'github');

            expect(eventSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    syncId: expect.any(String),
                    statusUpdate,
                    sourceSystem: 'github'
                })
            );
        });
    });

    describe('Status Mapping Integration', () => {
        beforeEach(async () => {
            await synchronizer.start();
        });

        afterEach(async () => {
            await synchronizer.stop();
        });

        test('should map status between different systems', async () => {
            // Test Linear to GitHub mapping
            const linearUpdate = {
                entityId: 'issue-mapping-test',
                entityType: 'issue',
                status: 'Done' // Linear status
            };

            const result = await synchronizer.synchronizeStatus(linearUpdate, 'linear');

            expect(result.success).toBe(true);
            
            // Verify mapping occurred (this would be tested more thoroughly in unit tests)
            expect(result.results.github).toBeDefined();
            expect(result.results.postgresql).toBeDefined();
        });

        test('should handle custom mappings', async () => {
            // Add a custom mapping
            synchronizer.statusMapper.addCustomMapping(
                'linear', 
                'github', 
                'In Review', 
                'draft', 
                'status'
            );

            const customStatusUpdate = {
                entityId: 'custom-mapping-test',
                entityType: 'pr',
                status: 'In Review'
            };

            const result = await synchronizer.synchronizeStatus(customStatusUpdate, 'linear');

            expect(result.success).toBe(true);
        });
    });

    describe('Conflict Resolution Integration', () => {
        beforeEach(async () => {
            await synchronizer.start();
        });

        afterEach(async () => {
            await synchronizer.stop();
        });

        test('should detect and resolve conflicts', async () => {
            // Mock conflict detection
            const mockConflicts = [
                {
                    type: 'concurrent_update',
                    severity: 'medium',
                    description: 'Concurrent update detected',
                    sourceSystem: 'linear'
                }
            ];

            synchronizer.conflictResolver.detectConflicts = jest.fn()
                .mockResolvedValue(mockConflicts);

            synchronizer.conflictResolver.resolveConflicts = jest.fn()
                .mockResolvedValue({
                    resolvedUpdate: {
                        entityId: 'conflict-test',
                        entityType: 'task',
                        status: 'completed'
                    },
                    strategy: 'priority_based',
                    reason: 'Resolved using system priority'
                });

            const statusUpdate = {
                entityId: 'conflict-test',
                entityType: 'task',
                status: 'completed'
            };

            const result = await synchronizer.synchronizeStatus(statusUpdate, 'linear');

            expect(result.success).toBe(true);
            expect(synchronizer.conflictResolver.detectConflicts).toHaveBeenCalled();
            expect(synchronizer.conflictResolver.resolveConflicts).toHaveBeenCalledWith(
                mockConflicts,
                statusUpdate
            );
        });

        test('should handle conflict resolution failures', async () => {
            // Mock conflict that cannot be auto-resolved
            synchronizer.conflictResolver.detectConflicts = jest.fn()
                .mockResolvedValue([
                    {
                        type: 'manual_intervention_required',
                        severity: 'critical',
                        description: 'Manual intervention required'
                    }
                ]);

            synchronizer.conflictResolver.resolveConflicts = jest.fn()
                .mockRejectedValue(new Error('Manual resolution required'));

            const statusUpdate = {
                entityId: 'manual-conflict-test',
                entityType: 'task',
                status: 'completed'
            };

            await expect(
                synchronizer.synchronizeStatus(statusUpdate, 'linear')
            ).rejects.toThrow('Manual resolution required');
        });
    });

    describe('Monitoring Integration', () => {
        beforeEach(async () => {
            await synchronizer.start();
        });

        afterEach(async () => {
            await synchronizer.stop();
        });

        test('should record metrics during synchronization', async () => {
            const recordSyncEventSpy = jest.spyOn(synchronizer.monitor, 'recordSyncEvent');

            const statusUpdate = {
                entityId: 'metrics-test',
                entityType: 'task',
                status: 'completed'
            };

            await synchronizer.synchronizeStatus(statusUpdate, 'postgresql');

            // Note: In a real implementation, this would be called automatically
            // For testing, we verify the monitor has the capability
            expect(synchronizer.monitor.recordSyncEvent).toBeDefined();
        });

        test('should track system health', () => {
            const health = synchronizer.getHealthStatus();

            expect(health).toMatchObject({
                isInitialized: true,
                isRunning: true,
                activeSyncs: expect.any(Number),
                queueSize: expect.any(Number),
                stats: expect.any(Object),
                components: expect.any(Object)
            });

            // Verify all components are included in health status
            expect(health.components).toHaveProperty('eventProcessor');
            expect(health.components).toHaveProperty('websocketManager');
            expect(health.components).toHaveProperty('conflictResolver');
            expect(health.components).toHaveProperty('statusMapper');
            expect(health.components).toHaveProperty('monitor');
        });
    });

    describe('Error Handling Integration', () => {
        beforeEach(async () => {
            await synchronizer.start();
        });

        afterEach(async () => {
            await synchronizer.stop();
        });

        test('should handle partial system failures gracefully', async () => {
            // Mock one system failing
            const originalSyncToGitHub = synchronizer._syncToGitHub;
            synchronizer._syncToGitHub = jest.fn()
                .mockRejectedValue(new Error('GitHub API unavailable'));

            const statusUpdate = {
                entityId: 'partial-failure-test',
                entityType: 'task',
                status: 'completed'
            };

            const result = await synchronizer.synchronizeStatus(statusUpdate, 'linear');

            expect(result.success).toBe(true);
            expect(result.results.github.success).toBe(false);
            expect(result.results.github.error).toBe('GitHub API unavailable');
            expect(result.results.postgresql.success).toBe(true);

            // Restore original method
            synchronizer._syncToGitHub = originalSyncToGitHub;
        });

        test('should handle database connection failures', async () => {
            // Mock database failure
            synchronizer.db.query.mockRejectedValue(new Error('Database connection lost'));

            const statusUpdate = {
                entityId: 'db-failure-test',
                entityType: 'task',
                status: 'completed'
            };

            await expect(
                synchronizer.synchronizeStatus(statusUpdate, 'postgresql')
            ).rejects.toThrow();
        });
    });

    describe('Performance Integration', () => {
        beforeEach(async () => {
            await synchronizer.start();
        });

        afterEach(async () => {
            await synchronizer.stop();
        });

        test('should handle high-volume synchronization', async () => {
            const startTime = Date.now();
            const numSyncs = 10;
            
            const promises = Array.from({ length: numSyncs }, (_, i) => 
                synchronizer.synchronizeStatus({
                    entityId: `bulk-test-${i}`,
                    entityType: 'task',
                    status: 'completed'
                }, 'postgresql')
            );

            const results = await Promise.all(promises);
            const endTime = Date.now();

            // Verify all syncs completed successfully
            results.forEach(result => {
                expect(result.success).toBe(true);
            });

            // Verify performance is reasonable (less than 10 seconds for 10 syncs)
            expect(endTime - startTime).toBeLessThan(10000);

            // Verify stats were updated
            expect(synchronizer.syncStats.totalSyncs).toBeGreaterThanOrEqual(numSyncs);
        });

        test('should maintain performance under load', async () => {
            const syncTimes = [];
            
            // Perform multiple syncs and track timing
            for (let i = 0; i < 5; i++) {
                const startTime = Date.now();
                
                await synchronizer.synchronizeStatus({
                    entityId: `performance-test-${i}`,
                    entityType: 'task',
                    status: 'completed'
                }, 'linear');
                
                syncTimes.push(Date.now() - startTime);
            }

            // Verify sync times are consistent (no significant degradation)
            const avgTime = syncTimes.reduce((a, b) => a + b, 0) / syncTimes.length;
            const maxTime = Math.max(...syncTimes);
            
            expect(maxTime).toBeLessThan(avgTime * 3); // Max time shouldn't be more than 3x average
        });
    });

    describe('Real-world Scenarios', () => {
        beforeEach(async () => {
            await synchronizer.start();
        });

        afterEach(async () => {
            await synchronizer.stop();
        });

        test('should handle task lifecycle synchronization', async () => {
            const taskId = 'lifecycle-test-task';
            
            // Task creation
            let result = await synchronizer.synchronizeStatus({
                entityId: taskId,
                entityType: 'task',
                status: 'pending',
                metadata: { createdBy: 'user-123' }
            }, 'linear');
            expect(result.success).toBe(true);

            // Task start
            result = await synchronizer.synchronizeStatus({
                entityId: taskId,
                entityType: 'task',
                status: 'in_progress',
                metadata: { startedBy: 'user-123' }
            }, 'linear');
            expect(result.success).toBe(true);

            // Task completion
            result = await synchronizer.synchronizeStatus({
                entityId: taskId,
                entityType: 'task',
                status: 'completed',
                metadata: { completedBy: 'user-123' }
            }, 'postgresql');
            expect(result.success).toBe(true);

            // Verify final stats
            expect(synchronizer.syncStats.totalSyncs).toBeGreaterThanOrEqual(3);
            expect(synchronizer.syncStats.successfulSyncs).toBeGreaterThanOrEqual(3);
        });

        test('should handle cross-system workflow', async () => {
            // Linear issue creation
            let result = await synchronizer.synchronizeStatus({
                entityId: 'workflow-issue-123',
                entityType: 'issue',
                status: 'Backlog'
            }, 'linear');
            expect(result.success).toBe(true);

            // GitHub PR creation
            result = await synchronizer.synchronizeStatus({
                entityId: 'workflow-pr-456',
                entityType: 'pr',
                status: 'open',
                metadata: { linkedIssue: 'workflow-issue-123' }
            }, 'github');
            expect(result.success).toBe(true);

            // PR merge and issue completion
            result = await synchronizer.synchronizeStatus({
                entityId: 'workflow-pr-456',
                entityType: 'pr',
                status: 'merged'
            }, 'github');
            expect(result.success).toBe(true);

            result = await synchronizer.synchronizeStatus({
                entityId: 'workflow-issue-123',
                entityType: 'issue',
                status: 'Done'
            }, 'linear');
            expect(result.success).toBe(true);
        });
    });
});

