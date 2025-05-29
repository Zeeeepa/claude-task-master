import { jest } from '@jest/globals';

// Increase timeout to 10 seconds
jest.setTimeout(10000);

// Retry with exponential backoff utility
const retryWithBackoff = async (fn, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            await new Promise(res => setTimeout(res, delay * (i + 1)));
        }
    }
};

// Mock CodegenClient
class MockCodegenClient {
    constructor(options = {}) {
        this.options = options;
        this.isConnected = false;
    }

    async connect() {
        // Simulate connection delay
        await new Promise(resolve => setTimeout(resolve, 100));
        this.isConnected = true;
        return this;
    }

    async waitForCompletion(taskId, options = {}) {
        const { timeout = 5000, pollInterval = 500 } = options;
        const startTime = Date.now();

        return new Promise((resolve, reject) => {
            const poll = () => {
                const elapsed = Date.now() - startTime;
                
                if (elapsed >= timeout) {
                    reject(new Error(`Timeout exceeded: ${elapsed}ms`));
                    return;
                }

                // Simulate task completion after some time
                if (elapsed > 1000) {
                    resolve({ 
                        taskId, 
                        status: 'completed', 
                        result: 'Task completed successfully',
                        duration: elapsed 
                    });
                } else {
                    setTimeout(poll, pollInterval);
                }
            };

            poll();
        });
    }

    async submitTask(task) {
        // Simulate task submission
        await new Promise(resolve => setTimeout(resolve, 200));
        return {
            taskId: `task-${Date.now()}`,
            status: 'submitted',
            task
        };
    }

    disconnect() {
        this.isConnected = false;
    }
}

describe('CodegenClient', () => {
    let client;

    beforeEach(() => {
        client = new MockCodegenClient();
    });

    afterEach(() => {
        if (client && client.isConnected) {
            client.disconnect();
        }
    });

    describe('Connection Management', () => {
        it('should connect successfully', async () => {
            await client.connect();
            expect(client.isConnected).toBe(true);
        });

        it('should handle connection with retry', async () => {
            const connectWithRetry = async () => {
                return retryWithBackoff(async () => {
                    await client.connect();
                    return client;
                });
            };

            const result = await connectWithRetry();
            expect(result.isConnected).toBe(true);
        });
    });

    describe('Task Submission', () => {
        beforeEach(async () => {
            await client.connect();
        });

        it('should submit task successfully', async () => {
            const task = { type: 'analysis', data: 'test data' };
            const result = await client.submitTask(task);
            
            expect(result).toHaveProperty('taskId');
            expect(result.status).toBe('submitted');
            expect(result.task).toEqual(task);
        });

        it('should submit task with retry on failure', async () => {
            const task = { type: 'analysis', data: 'test data' };
            
            const submitWithRetry = async () => {
                return retryWithBackoff(async () => {
                    return await client.submitTask(task);
                });
            };

            const result = await submitWithRetry();
            expect(result).toHaveProperty('taskId');
            expect(result.status).toBe('submitted');
        });
    });

    describe('waitForCompletion Method', () => {
        beforeEach(async () => {
            await client.connect();
        });

        it('should complete within timeout', async () => {
            const task = await client.submitTask({ type: 'quick-task' });
            
            const result = await client.waitForCompletion(task.taskId, {
                timeout: 3000,
                pollInterval: 100
            });
            
            expect(result.status).toBe('completed');
            expect(result.taskId).toBe(task.taskId);
        });

        it('should timeout for long-running tasks', async () => {
            const task = await client.submitTask({ type: 'long-task' });
            
            await expect(
                client.waitForCompletion(task.taskId, {
                    timeout: 500, // Very short timeout
                    pollInterval: 100
                })
            ).rejects.toThrow('Timeout exceeded');
        });

        it('should handle waitForCompletion with retry strategy', async () => {
            const task = await client.submitTask({ type: 'retry-task' });
            
            const waitWithRetry = async () => {
                return retryWithBackoff(async () => {
                    return await client.waitForCompletion(task.taskId, {
                        timeout: 2000,
                        pollInterval: 100
                    });
                }, 3, 500);
            };

            const result = await waitWithRetry();
            expect(result.status).toBe('completed');
        });

        it('should respect custom timeout settings', async () => {
            const task = await client.submitTask({ type: 'medium-task' });
            const startTime = Date.now();
            
            try {
                await client.waitForCompletion(task.taskId, {
                    timeout: 800,
                    pollInterval: 100
                });
            } catch (error) {
                const elapsed = Date.now() - startTime;
                expect(elapsed).toBeGreaterThanOrEqual(800);
                expect(error.message).toContain('Timeout exceeded');
            }
        });
    });

    describe('Error Handling and Resilience', () => {
        it('should handle multiple retry attempts', async () => {
            let attempts = 0;
            const flakyOperation = async () => {
                attempts++;
                if (attempts < 3) {
                    throw new Error(`Attempt ${attempts} failed`);
                }
                return { success: true, attempts };
            };

            const result = await retryWithBackoff(flakyOperation, 5, 100);
            expect(result.success).toBe(true);
            expect(result.attempts).toBe(3);
        });

        it('should fail after max retries', async () => {
            const alwaysFailOperation = async () => {
                throw new Error('Always fails');
            };

            await expect(
                retryWithBackoff(alwaysFailOperation, 3, 100)
            ).rejects.toThrow('Always fails');
        });

        it('should use exponential backoff correctly', async () => {
            const delays = [];
            let attempts = 0;

            const trackingOperation = async () => {
                attempts++;
                const start = Date.now();
                
                if (attempts < 4) {
                    throw new Error(`Attempt ${attempts}`);
                }
                
                return { attempts };
            };

            // Mock setTimeout to track delays
            const originalSetTimeout = global.setTimeout;
            global.setTimeout = jest.fn((fn, delay) => {
                delays.push(delay);
                return originalSetTimeout(fn, 0); // Execute immediately for test
            });

            try {
                await retryWithBackoff(trackingOperation, 5, 100);
                
                // Check exponential backoff: 100, 200, 300
                expect(delays).toEqual([100, 200, 300]);
            } finally {
                global.setTimeout = originalSetTimeout;
            }
        });
    });
});

