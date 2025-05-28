/**
 * @fileoverview Event Bus Tests
 * @description Comprehensive tests for the EventBus class
 */

import { jest } from '@jest/globals';
import { EventBus } from '../../src/ai_cicd_system/orchestrator/event_bus.js';
import { MessageQueue } from '../../src/ai_cicd_system/events/message_queue.js';

// Mock MessageQueue
jest.mock('../../src/ai_cicd_system/events/message_queue.js');

describe('EventBus', () => {
    let eventBus;
    let mockMessageQueue;

    beforeEach(() => {
        mockMessageQueue = {
            initialize: jest.fn(),
            shutdown: jest.fn(),
            enqueue: jest.fn(),
            dequeue: jest.fn().mockResolvedValue(null),
            getStats: jest.fn().mockReturnValue({
                currentSize: 0,
                totalEnqueued: 0,
                totalDequeued: 0
            })
        };

        MessageQueue.mockImplementation(() => mockMessageQueue);
        
        eventBus = new EventBus({
            maxHistorySize: 100,
            processingInterval: 10
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Lifecycle Management', () => {
        test('should start successfully', async () => {
            await eventBus.start();
            
            expect(eventBus.isStarted).toBe(true);
            expect(mockMessageQueue.initialize).toHaveBeenCalled();
        });

        test('should not start twice', async () => {
            await eventBus.start();
            await eventBus.start();
            
            expect(mockMessageQueue.initialize).toHaveBeenCalledTimes(1);
        });

        test('should stop successfully', async () => {
            await eventBus.start();
            await eventBus.stop();
            
            expect(eventBus.isStarted).toBe(false);
            expect(mockMessageQueue.shutdown).toHaveBeenCalled();
        });

        test('should handle stop when not started', async () => {
            await expect(eventBus.stop()).resolves.not.toThrow();
        });
    });

    describe('Event Listener Management', () => {
        beforeEach(async () => {
            await eventBus.start();
        });

        afterEach(async () => {
            await eventBus.stop();
        });

        test('should register event listener successfully', () => {
            const listener = jest.fn();
            
            const listenerId = eventBus.on('test.event', listener);
            
            expect(listenerId).toBeDefined();
            expect(typeof listenerId).toBe('string');
            expect(eventBus.getStats().activeListeners).toBe(1);
        });

        test('should register listener with options', () => {
            const listener = jest.fn();
            const options = {
                once: true,
                priority: 10,
                timeout: 5000,
                context: { test: 'data' }
            };
            
            const listenerId = eventBus.on('test.event', listener, options);
            
            expect(listenerId).toBeDefined();
            const listeners = eventBus.getListeners('test.event');
            expect(listeners['test.event']).toHaveLength(1);
            expect(listeners['test.event'][0].priority).toBe(10);
            expect(listeners['test.event'][0].once).toBe(true);
        });

        test('should register one-time listener', () => {
            const listener = jest.fn();
            
            const listenerId = eventBus.once('test.event', listener);
            
            expect(listenerId).toBeDefined();
            const listeners = eventBus.getListeners('test.event');
            expect(listeners['test.event'][0].once).toBe(true);
        });

        test('should throw error for non-function listener', () => {
            expect(() => {
                eventBus.on('test.event', 'not a function');
            }).toThrow('Listener must be a function');
        });

        test('should enforce max listeners limit', () => {
            const limitedEventBus = new EventBus({ maxListeners: 2 });
            
            eventBus.on('test.event', jest.fn());
            eventBus.on('test.event', jest.fn());
            
            expect(() => {
                limitedEventBus.on('test.event', jest.fn());
                limitedEventBus.on('test.event', jest.fn());
                limitedEventBus.on('test.event', jest.fn()); // This should throw
            }).toThrow('Maximum listeners (2) reached for event type: test.event');
        });

        test('should remove listener successfully', () => {
            const listener = jest.fn();
            const listenerId = eventBus.on('test.event', listener);
            
            const removed = eventBus.off('test.event', listenerId);
            
            expect(removed).toBe(true);
            expect(eventBus.getStats().activeListeners).toBe(0);
        });

        test('should return false when removing non-existent listener', () => {
            const removed = eventBus.off('test.event', 'non_existent_id');
            expect(removed).toBe(false);
        });

        test('should remove all listeners for event type', () => {
            eventBus.on('test.event', jest.fn());
            eventBus.on('test.event', jest.fn());
            eventBus.on('other.event', jest.fn());
            
            const removedCount = eventBus.removeAllListeners('test.event');
            
            expect(removedCount).toBe(2);
            expect(eventBus.getStats().activeListeners).toBe(1);
        });

        test('should sort listeners by priority', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            const listener3 = jest.fn();
            
            eventBus.on('test.event', listener1, { priority: 5 });
            eventBus.on('test.event', listener2, { priority: 10 });
            eventBus.on('test.event', listener3, { priority: 1 });
            
            const listeners = eventBus.getListeners('test.event');
            const priorities = listeners['test.event'].map(l => l.priority);
            
            expect(priorities).toEqual([10, 5, 1]);
        });
    });

    describe('Event Emission', () => {
        beforeEach(async () => {
            await eventBus.start();
        });

        afterEach(async () => {
            await eventBus.stop();
        });

        test('should emit event successfully', async () => {
            const listener = jest.fn().mockResolvedValue('test_result');
            eventBus.on('test.event', listener);
            
            const results = await eventBus.emit('test.event', { test: 'data' });
            
            expect(listener).toHaveBeenCalledWith(
                { test: 'data' },
                expect.objectContaining({
                    type: 'test.event',
                    data: { test: 'data' }
                })
            );
            expect(results).toHaveLength(1);
            expect(results[0].result).toBe('test_result');
        });

        test('should emit event with multiple listeners', async () => {
            const listener1 = jest.fn().mockResolvedValue('result1');
            const listener2 = jest.fn().mockResolvedValue('result2');
            
            eventBus.on('test.event', listener1);
            eventBus.on('test.event', listener2);
            
            const results = await eventBus.emit('test.event', { test: 'data' });
            
            expect(results).toHaveLength(2);
            expect(listener1).toHaveBeenCalled();
            expect(listener2).toHaveBeenCalled();
        });

        test('should handle listener execution order by priority', async () => {
            const executionOrder = [];
            const listener1 = jest.fn().mockImplementation(() => executionOrder.push('listener1'));
            const listener2 = jest.fn().mockImplementation(() => executionOrder.push('listener2'));
            const listener3 = jest.fn().mockImplementation(() => executionOrder.push('listener3'));
            
            eventBus.on('test.event', listener1, { priority: 1 });
            eventBus.on('test.event', listener2, { priority: 10 });
            eventBus.on('test.event', listener3, { priority: 5 });
            
            await eventBus.emit('test.event');
            
            expect(executionOrder).toEqual(['listener2', 'listener3', 'listener1']);
        });

        test('should remove one-time listeners after execution', async () => {
            const listener = jest.fn();
            eventBus.once('test.event', listener);
            
            await eventBus.emit('test.event');
            await eventBus.emit('test.event');
            
            expect(listener).toHaveBeenCalledTimes(1);
            expect(eventBus.getStats().activeListeners).toBe(0);
        });

        test('should handle listener errors gracefully', async () => {
            const errorListener = jest.fn().mockRejectedValue(new Error('Test error'));
            const successListener = jest.fn().mockResolvedValue('success');
            
            eventBus.on('test.event', errorListener);
            eventBus.on('test.event', successListener);
            
            const results = await eventBus.emit('test.event');
            
            expect(results).toHaveLength(2);
            expect(results[0].error).toBe('Test error');
            expect(results[1].result).toBe('success');
        });

        test('should handle listener timeout', async () => {
            const slowListener = jest.fn().mockImplementation(() => 
                new Promise(resolve => setTimeout(resolve, 100))
            );
            
            eventBus.on('test.event', slowListener, { timeout: 50 });
            
            const results = await eventBus.emit('test.event');
            
            expect(results).toHaveLength(1);
            expect(results[0].error).toContain('timed out');
        });

        test('should throw error when not started', async () => {
            await eventBus.stop();
            
            await expect(eventBus.emit('test.event'))
                .rejects.toThrow('Event bus not started');
        });

        test('should queue events for async processing', async () => {
            const listener = jest.fn();
            eventBus.on('test.event', listener);
            
            const results = await eventBus.emit('test.event', { test: 'data' }, { async: true });
            
            expect(results).toHaveLength(0); // No immediate results for async events
            expect(mockMessageQueue.enqueue).toHaveBeenCalled();
        });
    });

    describe('Event History', () => {
        beforeEach(async () => {
            await eventBus.start();
        });

        afterEach(async () => {
            await eventBus.stop();
        });

        test('should maintain event history', async () => {
            await eventBus.emit('test.event1', { data: 'test1' });
            await eventBus.emit('test.event2', { data: 'test2' });
            
            const history = eventBus.getEventHistory();
            
            expect(history).toHaveLength(2);
            expect(history[0].type).toBe('test.event1');
            expect(history[1].type).toBe('test.event2');
        });

        test('should filter event history by type', async () => {
            await eventBus.emit('test.event1', { data: 'test1' });
            await eventBus.emit('test.event2', { data: 'test2' });
            await eventBus.emit('test.event1', { data: 'test3' });
            
            const history = eventBus.getEventHistory('test.event1');
            
            expect(history).toHaveLength(2);
            expect(history.every(event => event.type === 'test.event1')).toBe(true);
        });

        test('should limit event history size', async () => {
            const limitedEventBus = new EventBus({ maxHistorySize: 2 });
            await limitedEventBus.start();
            
            await limitedEventBus.emit('event1');
            await limitedEventBus.emit('event2');
            await limitedEventBus.emit('event3');
            
            const history = limitedEventBus.getEventHistory();
            
            expect(history).toHaveLength(2);
            expect(history[0].type).toBe('event2');
            expect(history[1].type).toBe('event3');
            
            await limitedEventBus.stop();
        });

        test('should respect history limit parameter', async () => {
            for (let i = 0; i < 10; i++) {
                await eventBus.emit(`event${i}`);
            }
            
            const history = eventBus.getEventHistory(null, 5);
            
            expect(history).toHaveLength(5);
        });
    });

    describe('Statistics and Monitoring', () => {
        beforeEach(async () => {
            await eventBus.start();
        });

        afterEach(async () => {
            await eventBus.stop();
        });

        test('should track event statistics', async () => {
            const listener = jest.fn();
            eventBus.on('test.event', listener);
            
            await eventBus.emit('test.event');
            await eventBus.emit('test.event');
            
            const stats = eventBus.getStats();
            
            expect(stats.totalEvents).toBe(2);
            expect(stats.processedEvents).toBe(2);
            expect(stats.activeListeners).toBe(1);
        });

        test('should track listener information', () => {
            const listener1 = jest.fn();
            const listener2 = jest.fn();
            
            eventBus.on('test.event1', listener1, { priority: 5 });
            eventBus.on('test.event2', listener2, { once: true });
            
            const listeners = eventBus.getListeners();
            
            expect(listeners['test.event1']).toHaveLength(1);
            expect(listeners['test.event2']).toHaveLength(1);
            expect(listeners['test.event1'][0].priority).toBe(5);
            expect(listeners['test.event2'][0].once).toBe(true);
        });

        test('should get listeners for specific event type', () => {
            const listener = jest.fn();
            eventBus.on('test.event', listener);
            eventBus.on('other.event', jest.fn());
            
            const listeners = eventBus.getListeners('test.event');
            
            expect(listeners['test.event']).toHaveLength(1);
            expect(listeners['other.event']).toBeUndefined();
        });
    });

    describe('Message Queue Processing', () => {
        beforeEach(async () => {
            await eventBus.start();
        });

        afterEach(async () => {
            await eventBus.stop();
        });

        test('should process queued messages', async () => {
            const listener = jest.fn();
            eventBus.on('test.event', listener);
            
            const queuedEvent = {
                type: 'test.event',
                data: { test: 'queued_data' },
                timestamp: new Date(),
                id: 'test_id'
            };
            
            mockMessageQueue.dequeue.mockResolvedValueOnce(queuedEvent);
            
            // Trigger message processing
            await new Promise(resolve => setTimeout(resolve, 20));
            
            expect(listener).toHaveBeenCalledWith(
                { test: 'queued_data' },
                expect.objectContaining({
                    type: 'test.event',
                    id: 'test_id'
                })
            );
        });

        test('should handle message queue processing errors', async () => {
            mockMessageQueue.dequeue.mockRejectedValueOnce(new Error('Queue error'));
            
            // Should not throw error, just log it
            await new Promise(resolve => setTimeout(resolve, 20));
            
            const stats = eventBus.getStats();
            expect(stats.failedEvents).toBeGreaterThan(0);
        });
    });

    describe('Configuration Options', () => {
        test('should respect maxListeners configuration', () => {
            const configuredEventBus = new EventBus({ maxListeners: 5 });
            
            expect(configuredEventBus.config.maxListeners).toBe(5);
        });

        test('should respect maxHistorySize configuration', () => {
            const configuredEventBus = new EventBus({ maxHistorySize: 500 });
            
            expect(configuredEventBus.config.maxHistorySize).toBe(500);
        });

        test('should respect processingInterval configuration', () => {
            const configuredEventBus = new EventBus({ processingInterval: 100 });
            
            expect(configuredEventBus.config.processingInterval).toBe(100);
        });

        test('should use default configuration when not specified', () => {
            const defaultEventBus = new EventBus();
            
            expect(defaultEventBus.config.maxListeners).toBe(100);
            expect(defaultEventBus.config.maxHistorySize).toBe(1000);
            expect(defaultEventBus.config.enableAsyncProcessing).toBe(true);
        });
    });

    describe('Error Handling', () => {
        beforeEach(async () => {
            await eventBus.start();
        });

        afterEach(async () => {
            await eventBus.stop();
        });

        test('should handle message queue initialization failure', async () => {
            mockMessageQueue.initialize.mockRejectedValueOnce(new Error('Init failed'));
            
            const failingEventBus = new EventBus();
            
            await expect(failingEventBus.start()).rejects.toThrow('Init failed');
        });

        test('should handle message queue shutdown failure gracefully', async () => {
            mockMessageQueue.shutdown.mockRejectedValueOnce(new Error('Shutdown failed'));
            
            await expect(eventBus.stop()).rejects.toThrow('Shutdown failed');
        });

        test('should track failed events in statistics', async () => {
            const errorListener = jest.fn().mockRejectedValue(new Error('Listener error'));
            eventBus.on('test.event', errorListener);
            
            await eventBus.emit('test.event');
            
            const stats = eventBus.getStats();
            expect(stats.failedEvents).toBe(1);
        });
    });

    describe('Performance', () => {
        beforeEach(async () => {
            await eventBus.start();
        });

        afterEach(async () => {
            await eventBus.stop();
        });

        test('should handle many listeners efficiently', async () => {
            const listeners = [];
            for (let i = 0; i < 50; i++) {
                const listener = jest.fn();
                listeners.push(listener);
                eventBus.on('test.event', listener);
            }
            
            const startTime = Date.now();
            await eventBus.emit('test.event');
            const endTime = Date.now();
            
            expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
            listeners.forEach(listener => {
                expect(listener).toHaveBeenCalled();
            });
        });

        test('should handle rapid event emission', async () => {
            const listener = jest.fn();
            eventBus.on('test.event', listener);
            
            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(eventBus.emit('test.event', { index: i }));
            }
            
            const results = await Promise.all(promises);
            
            expect(results).toHaveLength(100);
            expect(listener).toHaveBeenCalledTimes(100);
        });
    });
});

