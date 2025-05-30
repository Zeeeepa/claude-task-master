/**
 * Database Models Tests
 */

import { jest } from '@jest/globals';
import Task from '../../src/database/models/Task.js';
import Project from '../../src/database/models/Project.js';

describe('Task Model', () => {
  describe('constructor', () => {
    test('should create task with default values', () => {
      const task = new Task();
      expect(task.id).toBeNull();
      expect(task.title).toBe('');
      expect(task.status).toBe('backlog');
      expect(task.priority).toBe('medium');
      expect(task.complexity_score).toBe(0);
    });

    test('should create task with provided data', () => {
      const taskData = {
        id: 'test-id',
        title: 'Test Task',
        description: 'Test Description',
        status: 'in-progress',
        priority: 'high',
        complexity_score: 75
      };

      const task = new Task(taskData);
      expect(task.id).toBe('test-id');
      expect(task.title).toBe('Test Task');
      expect(task.description).toBe('Test Description');
      expect(task.status).toBe('in-progress');
      expect(task.priority).toBe('high');
      expect(task.complexity_score).toBe(75);
    });
  });

  describe('validation', () => {
    test('should validate required fields', () => {
      const task = new Task();
      const validation = task.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Title is required');
    });

    test('should validate title length', () => {
      const task = new Task({ title: 'a'.repeat(256) });
      const validation = task.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Title must be 255 characters or less');
    });

    test('should validate complexity score range', () => {
      const task = new Task({ title: 'Valid Title', complexity_score: 150 });
      const validation = task.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Complexity score must be between 0 and 100');
    });

    test('should validate status enum', () => {
      const task = new Task({ title: 'Valid Title', status: 'invalid-status' });
      const validation = task.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Invalid status');
    });

    test('should validate priority enum', () => {
      const task = new Task({ title: 'Valid Title', priority: 'invalid-priority' });
      const validation = task.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Invalid priority');
    });

    test('should pass validation with valid data', () => {
      const task = new Task({
        title: 'Valid Task',
        description: 'Valid description',
        status: 'in-progress',
        priority: 'high',
        complexity_score: 50
      });
      
      const validation = task.validate();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('toJSON', () => {
    test('should return JSON representation', () => {
      const taskData = {
        id: 'test-id',
        title: 'Test Task',
        description: 'Test Description',
        status: 'done',
        priority: 'low'
      };

      const task = new Task(taskData);
      const json = task.toJSON();

      expect(json).toEqual(expect.objectContaining(taskData));
      expect(json).toHaveProperty('requirements');
      expect(json).toHaveProperty('dependencies');
      expect(json).toHaveProperty('acceptance_criteria');
    });
  });
});

describe('Project Model', () => {
  describe('constructor', () => {
    test('should create project with default values', () => {
      const project = new Project();
      expect(project.id).toBeNull();
      expect(project.name).toBe('');
      expect(project.status).toBe('active');
      expect(project.context).toEqual({});
      expect(project.architecture).toEqual({});
    });

    test('should create project with provided data', () => {
      const projectData = {
        id: 'test-id',
        name: 'Test Project',
        description: 'Test Description',
        status: 'inactive',
        repository_url: 'https://github.com/test/repo'
      };

      const project = new Project(projectData);
      expect(project.id).toBe('test-id');
      expect(project.name).toBe('Test Project');
      expect(project.description).toBe('Test Description');
      expect(project.status).toBe('inactive');
      expect(project.repository_url).toBe('https://github.com/test/repo');
    });
  });

  describe('validation', () => {
    test('should validate required fields', () => {
      const project = new Project();
      const validation = project.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Name is required');
    });

    test('should validate name length', () => {
      const project = new Project({ name: 'a'.repeat(256) });
      const validation = project.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Name must be 255 characters or less');
    });

    test('should validate status enum', () => {
      const project = new Project({ name: 'Valid Name', status: 'invalid-status' });
      const validation = project.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Invalid status');
    });

    test('should validate repository URL length', () => {
      const project = new Project({ 
        name: 'Valid Name', 
        repository_url: 'https://github.com/' + 'a'.repeat(500)
      });
      const validation = project.validate();
      
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Repository URL must be 500 characters or less');
    });

    test('should pass validation with valid data', () => {
      const project = new Project({
        name: 'Valid Project',
        description: 'Valid description',
        status: 'active',
        repository_url: 'https://github.com/test/repo'
      });
      
      const validation = project.validate();
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });
  });

  describe('toJSON', () => {
    test('should return JSON representation', () => {
      const projectData = {
        id: 'test-id',
        name: 'Test Project',
        description: 'Test Description',
        status: 'active'
      };

      const project = new Project(projectData);
      const json = project.toJSON();

      expect(json).toEqual(expect.objectContaining(projectData));
      expect(json).toHaveProperty('context');
      expect(json).toHaveProperty('architecture');
      expect(json).toHaveProperty('repository_url');
    });
  });
});

