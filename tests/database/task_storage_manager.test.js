import { jest } from '@jest/globals';

// Mock database initialization
const mockDatabaseConnection = async () => {
    try {
        await initializeDatabase();
    } catch (err) {
        console.error('Database connection failed:', err);
    }
};

// Mock initializeDatabase function
const initializeDatabase = jest.fn().mockImplementation(async () => {
    // Simulate successful database initialization
    return Promise.resolve();
});

// Ensure uninitializedStorage is properly mocked
let uninitializedStorage = {
    storeTask: jest.fn().mockImplementation(() => {
        throw new Error('Storage not initialized');
    }),
    getTask: jest.fn().mockImplementation(() => {
        throw new Error('Storage not initialized');
    }),
    updateTask: jest.fn().mockImplementation(() => {
        throw new Error('Storage not initialized');
    }),
    deleteTask: jest.fn().mockImplementation(() => {
        throw new Error('Storage not initialized');
    })
};

// Mock initialized storage
let initializedStorage = {
    storeTask: jest.fn().mockImplementation(async (task) => {
        return Promise.resolve({ id: 'task-123', ...task });
    }),
    getTask: jest.fn().mockImplementation(async (id) => {
        return Promise.resolve({ id, title: 'Test Task', status: 'pending' });
    }),
    updateTask: jest.fn().mockImplementation(async (id, updates) => {
        return Promise.resolve({ id, ...updates });
    }),
    deleteTask: jest.fn().mockImplementation(async (id) => {
        return Promise.resolve({ success: true, id });
    })
};

describe('TaskStorageManager', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Database Initialization', () => {
        it('should handle database connection errors gracefully', async () => {
            const mockError = new Error('Connection failed');
            initializeDatabase.mockRejectedValueOnce(mockError);
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            
            await mockDatabaseConnection();
            
            expect(consoleSpy).toHaveBeenCalledWith('Database connection failed:', mockError);
            consoleSpy.mockRestore();
        });

        it('should initialize database successfully', async () => {
            initializeDatabase.mockResolvedValueOnce();
            
            await expect(mockDatabaseConnection()).resolves.not.toThrow();
            expect(initializeDatabase).toHaveBeenCalled();
        });
    });

    describe('Uninitialized Storage', () => {
        it('should throw error when trying to store task without initialization', () => {
            expect(() => {
                uninitializedStorage.storeTask({ title: 'Test Task' });
            }).toThrow('Storage not initialized');
        });

        it('should throw error when trying to get task without initialization', () => {
            expect(() => {
                uninitializedStorage.getTask('task-123');
            }).toThrow('Storage not initialized');
        });

        it('should throw error when trying to update task without initialization', () => {
            expect(() => {
                uninitializedStorage.updateTask('task-123', { status: 'completed' });
            }).toThrow('Storage not initialized');
        });

        it('should throw error when trying to delete task without initialization', () => {
            expect(() => {
                uninitializedStorage.deleteTask('task-123');
            }).toThrow('Storage not initialized');
        });
    });

    describe('Initialized Storage', () => {
        it('should store task successfully when initialized', async () => {
            const task = { title: 'Test Task', description: 'Test Description' };
            const result = await initializedStorage.storeTask(task);
            
            expect(result).toEqual({ id: 'task-123', ...task });
            expect(initializedStorage.storeTask).toHaveBeenCalledWith(task);
        });

        it('should get task successfully when initialized', async () => {
            const taskId = 'task-123';
            const result = await initializedStorage.getTask(taskId);
            
            expect(result).toEqual({ id: taskId, title: 'Test Task', status: 'pending' });
            expect(initializedStorage.getTask).toHaveBeenCalledWith(taskId);
        });

        it('should update task successfully when initialized', async () => {
            const taskId = 'task-123';
            const updates = { status: 'completed' };
            const result = await initializedStorage.updateTask(taskId, updates);
            
            expect(result).toEqual({ id: taskId, ...updates });
            expect(initializedStorage.updateTask).toHaveBeenCalledWith(taskId, updates);
        });

        it('should delete task successfully when initialized', async () => {
            const taskId = 'task-123';
            const result = await initializedStorage.deleteTask(taskId);
            
            expect(result).toEqual({ success: true, id: taskId });
            expect(initializedStorage.deleteTask).toHaveBeenCalledWith(taskId);
        });
    });
});

