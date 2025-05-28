/**
 * @fileoverview File Tracker
 * @description Track file modifications and changes during task execution
 */

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * File change tracking and monitoring
 */
export class FileTracker {
  constructor(config = {}) {
    this.config = {
      trackContent: config.trackContent !== false,
      trackMetadata: config.trackMetadata !== false,
      trackPermissions: config.trackPermissions !== false,
      maxFileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB
      excludePatterns: config.excludePatterns || [
        'node_modules/**',
        '.git/**',
        '*.log',
        'tmp/**',
        '.DS_Store'
      ],
      ...config
    };

    this.snapshots = new Map(); // taskId -> snapshot
    this.changes = new Map(); // taskId -> changes
  }

  /**
   * Create a snapshot of files before task execution
   * @param {string} taskId - Task identifier
   * @param {string} workspacePath - Workspace path to track
   * @param {Array} specificFiles - Specific files to track (optional)
   * @returns {Promise<Object>} Snapshot information
   */
  async createSnapshot(taskId, workspacePath, specificFiles = null) {
    try {
      const snapshot = {
        taskId,
        workspacePath,
        timestamp: new Date(),
        files: new Map(),
        totalFiles: 0,
        totalSize: 0
      };

      const filesToTrack = specificFiles || await this.discoverFiles(workspacePath);
      
      for (const filePath of filesToTrack) {
        const fullPath = path.resolve(workspacePath, filePath);
        
        try {
          const fileInfo = await this.captureFileInfo(fullPath, filePath);
          if (fileInfo) {
            snapshot.files.set(filePath, fileInfo);
            snapshot.totalFiles++;
            snapshot.totalSize += fileInfo.size;
          }
        } catch (error) {
          console.warn(`Failed to capture file info for ${filePath}:`, error.message);
        }
      }

      this.snapshots.set(taskId, snapshot);
      console.log(`Created snapshot for task ${taskId}: ${snapshot.totalFiles} files, ${this.formatSize(snapshot.totalSize)}`);

      return {
        taskId,
        filesTracked: snapshot.totalFiles,
        totalSize: snapshot.totalSize,
        timestamp: snapshot.timestamp
      };

    } catch (error) {
      console.error(`Failed to create snapshot for task ${taskId}:`, error);
      throw error;
    }
  }

  /**
   * Detect changes since snapshot creation
   * @param {string} taskId - Task identifier
   * @returns {Promise<Object>} Change detection results
   */
  async detectChanges(taskId) {
    const snapshot = this.snapshots.get(taskId);
    if (!snapshot) {
      throw new Error(`No snapshot found for task ${taskId}`);
    }

    const changes = {
      taskId,
      timestamp: new Date(),
      modified: [],
      created: [],
      deleted: [],
      summary: {
        totalChanges: 0,
        linesAdded: 0,
        linesRemoved: 0,
        filesModified: 0,
        filesCreated: 0,
        filesDeleted: 0
      }
    };

    // Check for modifications and deletions
    for (const [filePath, originalInfo] of snapshot.files) {
      const fullPath = path.resolve(snapshot.workspacePath, filePath);
      
      try {
        const currentInfo = await this.captureFileInfo(fullPath, filePath);
        
        if (!currentInfo) {
          // File was deleted
          changes.deleted.push({
            path: filePath,
            originalInfo,
            type: 'deleted'
          });
          changes.summary.filesDeleted++;
        } else if (this.hasFileChanged(originalInfo, currentInfo)) {
          // File was modified
          const changeInfo = await this.analyzeFileChange(originalInfo, currentInfo, fullPath);
          changes.modified.push(changeInfo);
          changes.summary.filesModified++;
          changes.summary.linesAdded += changeInfo.linesAdded || 0;
          changes.summary.linesRemoved += changeInfo.linesRemoved || 0;
        }
      } catch (error) {
        console.warn(`Failed to check file ${filePath}:`, error.message);
      }
    }

    // Check for new files
    const currentFiles = await this.discoverFiles(snapshot.workspacePath);
    for (const filePath of currentFiles) {
      if (!snapshot.files.has(filePath)) {
        const fullPath = path.resolve(snapshot.workspacePath, filePath);
        
        try {
          const fileInfo = await this.captureFileInfo(fullPath, filePath);
          if (fileInfo) {
            changes.created.push({
              path: filePath,
              info: fileInfo,
              type: 'created'
            });
            changes.summary.filesCreated++;
          }
        } catch (error) {
          console.warn(`Failed to analyze new file ${filePath}:`, error.message);
        }
      }
    }

    changes.summary.totalChanges = changes.modified.length + changes.created.length + changes.deleted.length;
    
    this.changes.set(taskId, changes);
    console.log(`Detected changes for task ${taskId}: ${changes.summary.totalChanges} total changes`);

    return changes;
  }

  /**
   * Capture file information
   * @param {string} fullPath - Full file path
   * @param {string} relativePath - Relative file path
   * @returns {Promise<Object|null>} File information
   */
  async captureFileInfo(fullPath, relativePath) {
    try {
      const stats = await fs.stat(fullPath);
      
      if (!stats.isFile()) {
        return null;
      }

      if (stats.size > this.config.maxFileSize) {
        console.warn(`File ${relativePath} is too large (${this.formatSize(stats.size)}), skipping content tracking`);
        return {
          path: relativePath,
          size: stats.size,
          mtime: stats.mtime,
          mode: stats.mode,
          contentHash: null,
          content: null,
          lines: null,
          encoding: null,
          tooLarge: true
        };
      }

      const fileInfo = {
        path: relativePath,
        size: stats.size,
        mtime: stats.mtime,
        mode: stats.mode,
        contentHash: null,
        content: null,
        lines: null,
        encoding: null
      };

      if (this.config.trackContent) {
        try {
          const content = await fs.readFile(fullPath, 'utf8');
          fileInfo.content = content;
          fileInfo.lines = content.split('\n').length;
          fileInfo.contentHash = this.calculateHash(content);
          fileInfo.encoding = 'utf8';
        } catch (error) {
          // Try reading as binary if UTF-8 fails
          try {
            const buffer = await fs.readFile(fullPath);
            fileInfo.contentHash = this.calculateHash(buffer);
            fileInfo.encoding = 'binary';
          } catch (binaryError) {
            console.warn(`Failed to read file ${relativePath}:`, binaryError.message);
          }
        }
      }

      return fileInfo;

    } catch (error) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Check if a file has changed
   * @param {Object} originalInfo - Original file info
   * @param {Object} currentInfo - Current file info
   * @returns {boolean} True if file has changed
   */
  hasFileChanged(originalInfo, currentInfo) {
    // Check size first (fastest)
    if (originalInfo.size !== currentInfo.size) {
      return true;
    }

    // Check modification time
    if (originalInfo.mtime.getTime() !== currentInfo.mtime.getTime()) {
      return true;
    }

    // Check content hash if available
    if (originalInfo.contentHash && currentInfo.contentHash) {
      return originalInfo.contentHash !== currentInfo.contentHash;
    }

    // Check permissions if tracking
    if (this.config.trackPermissions && originalInfo.mode !== currentInfo.mode) {
      return true;
    }

    return false;
  }

  /**
   * Analyze detailed file changes
   * @param {Object} originalInfo - Original file info
   * @param {Object} currentInfo - Current file info
   * @param {string} fullPath - Full file path
   * @returns {Promise<Object>} Change analysis
   */
  async analyzeFileChange(originalInfo, currentInfo, fullPath) {
    const changeInfo = {
      path: originalInfo.path,
      type: 'modified',
      originalInfo,
      currentInfo,
      changes: {
        size: currentInfo.size - originalInfo.size,
        lines: currentInfo.lines - (originalInfo.lines || 0),
        mtime: currentInfo.mtime
      },
      linesAdded: 0,
      linesRemoved: 0,
      diff: null
    };

    // Perform detailed diff analysis for text files
    if (originalInfo.content && currentInfo.content && originalInfo.encoding === 'utf8') {
      const diffResult = this.calculateDiff(originalInfo.content, currentInfo.content);
      changeInfo.linesAdded = diffResult.added;
      changeInfo.linesRemoved = diffResult.removed;
      changeInfo.diff = diffResult.diff;
    }

    return changeInfo;
  }

  /**
   * Calculate simple diff between two text contents
   * @param {string} original - Original content
   * @param {string} current - Current content
   * @returns {Object} Diff result
   */
  calculateDiff(original, current) {
    const originalLines = original.split('\n');
    const currentLines = current.split('\n');
    
    // Simple line-based diff
    const originalSet = new Set(originalLines);
    const currentSet = new Set(currentLines);
    
    let added = 0;
    let removed = 0;
    
    // Count added lines
    for (const line of currentLines) {
      if (!originalSet.has(line)) {
        added++;
      }
    }
    
    // Count removed lines
    for (const line of originalLines) {
      if (!currentSet.has(line)) {
        removed++;
      }
    }

    return {
      added,
      removed,
      diff: `+${added} -${removed} lines`
    };
  }

  /**
   * Discover files in a directory
   * @param {string} dirPath - Directory path
   * @returns {Promise<Array>} Array of relative file paths
   */
  async discoverFiles(dirPath) {
    const files = [];
    
    try {
      await this.walkDirectory(dirPath, dirPath, files);
    } catch (error) {
      console.error(`Failed to discover files in ${dirPath}:`, error);
    }
    
    return files;
  }

  /**
   * Recursively walk directory
   * @param {string} currentPath - Current directory path
   * @param {string} basePath - Base directory path
   * @param {Array} files - Array to collect files
   */
  async walkDirectory(currentPath, basePath, files) {
    try {
      const entries = await fs.readdir(currentPath, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(basePath, fullPath);
        
        // Check exclusion patterns
        if (this.isExcluded(relativePath)) {
          continue;
        }
        
        if (entry.isDirectory()) {
          await this.walkDirectory(fullPath, basePath, files);
        } else if (entry.isFile()) {
          files.push(relativePath);
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory ${currentPath}:`, error.message);
    }
  }

  /**
   * Check if a file path should be excluded
   * @param {string} filePath - File path to check
   * @returns {boolean} True if should be excluded
   */
  isExcluded(filePath) {
    for (const pattern of this.config.excludePatterns) {
      if (this.matchesPattern(filePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a file path matches a pattern
   * @param {string} filePath - File path
   * @param {string} pattern - Pattern to match
   * @returns {boolean} True if matches
   */
  matchesPattern(filePath, pattern) {
    // Simple glob-like pattern matching
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  /**
   * Calculate hash of content
   * @param {string|Buffer} content - Content to hash
   * @returns {string} Hash string
   */
  calculateHash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Format file size for display
   * @param {number} bytes - Size in bytes
   * @returns {string} Formatted size
   */
  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  /**
   * Get snapshot for a task
   * @param {string} taskId - Task identifier
   * @returns {Object|null} Snapshot data
   */
  getSnapshot(taskId) {
    return this.snapshots.get(taskId) || null;
  }

  /**
   * Get changes for a task
   * @param {string} taskId - Task identifier
   * @returns {Object|null} Changes data
   */
  getChanges(taskId) {
    return this.changes.get(taskId) || null;
  }

  /**
   * Generate change summary report
   * @param {string} taskId - Task identifier
   * @returns {Object} Summary report
   */
  generateSummaryReport(taskId) {
    const snapshot = this.snapshots.get(taskId);
    const changes = this.changes.get(taskId);
    
    if (!snapshot || !changes) {
      return null;
    }

    return {
      taskId,
      snapshot: {
        timestamp: snapshot.timestamp,
        filesTracked: snapshot.totalFiles,
        totalSize: this.formatSize(snapshot.totalSize)
      },
      changes: {
        timestamp: changes.timestamp,
        summary: changes.summary,
        details: {
          modified: changes.modified.map(c => ({
            path: c.path,
            sizeChange: c.changes.size,
            linesAdded: c.linesAdded,
            linesRemoved: c.linesRemoved
          })),
          created: changes.created.map(c => ({
            path: c.path,
            size: this.formatSize(c.info.size)
          })),
          deleted: changes.deleted.map(c => ({
            path: c.path,
            originalSize: this.formatSize(c.originalInfo.size)
          }))
        }
      }
    };
  }

  /**
   * Clean up tracking data for a task
   * @param {string} taskId - Task identifier
   */
  cleanup(taskId) {
    this.snapshots.delete(taskId);
    this.changes.delete(taskId);
    console.log(`Cleaned up tracking data for task ${taskId}`);
  }

  /**
   * Get tracking statistics
   * @returns {Object} Statistics
   */
  getStatistics() {
    return {
      activeSnapshots: this.snapshots.size,
      activeChanges: this.changes.size,
      config: this.config
    };
  }
}

export default FileTracker;

