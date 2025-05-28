/**
 * Metrics Storage
 * Handles storage and retrieval of monitoring metrics
 */

import fs from 'fs/promises';
import path from 'path';

export class MetricsStorage {
  constructor(config) {
    this.config = config;
    this.data = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the storage system
   */
  async initialize() {
    if (this.initialized) {
      return;
    }

    switch (this.config.type) {
      case 'file':
        await this.initializeFileStorage();
        break;
      case 'memory':
        await this.initializeMemoryStorage();
        break;
      case 'database':
        await this.initializeDatabaseStorage();
        break;
      default:
        throw new Error(`Unsupported storage type: ${this.config.type}`);
    }

    this.initialized = true;
    console.log(`📊 Metrics storage initialized (${this.config.type})`);
  }

  /**
   * Initialize file-based storage
   */
  async initializeFileStorage() {
    try {
      await fs.mkdir(this.config.file_path, { recursive: true });
      
      // Load existing data
      const files = await fs.readdir(this.config.file_path);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const type = file.replace('.json', '');
          const filePath = path.join(this.config.file_path, file);
          const content = await fs.readFile(filePath, 'utf8');
          this.data.set(type, JSON.parse(content));
        }
      }
    } catch (error) {
      console.error('Error initializing file storage:', error);
      throw error;
    }
  }

  /**
   * Initialize memory storage
   */
  async initializeMemoryStorage() {
    // Memory storage is ready immediately
    console.log('Memory storage initialized');
  }

  /**
   * Initialize database storage
   */
  async initializeDatabaseStorage() {
    // Placeholder for database initialization
    throw new Error('Database storage not yet implemented');
  }

  /**
   * Store metrics data
   */
  async store(type, metrics) {
    if (!this.data.has(type)) {
      this.data.set(type, []);
    }

    const typeData = this.data.get(type);
    typeData.push(metrics);

    // Enforce memory limits
    if (this.config.type === 'memory' && typeData.length > this.config.max_memory_entries) {
      typeData.shift(); // Remove oldest entry
    }

    // Persist to file if using file storage
    if (this.config.type === 'file') {
      await this.persistToFile(type, typeData);
    }
  }

  /**
   * Persist data to file
   */
  async persistToFile(type, data) {
    try {
      const filePath = path.join(this.config.file_path, `${type}.json`);
      const content = JSON.stringify(data, null, 2);
      await fs.writeFile(filePath, content, 'utf8');
    } catch (error) {
      console.error(`Error persisting ${type} data:`, error);
    }
  }

  /**
   * Get metrics for a specific type and time range
   */
  async getMetrics(type, timeRange = '1h') {
    const typeData = this.data.get(type) || [];
    const cutoffTime = Date.now() - this.parseTimeRange(timeRange);
    
    return typeData.filter(metric => metric.timestamp >= cutoffTime);
  }

  /**
   * Get latest metrics for a type
   */
  async getLatestMetrics(type, count = 1) {
    const typeData = this.data.get(type) || [];
    return typeData.slice(-count);
  }

  /**
   * Get all metric types
   */
  getMetricTypes() {
    return Array.from(this.data.keys());
  }

  /**
   * Get storage statistics
   */
  getStorageStats() {
    const stats = {
      total_types: this.data.size,
      total_entries: 0,
      storage_type: this.config.type,
      memory_usage: 0
    };

    for (const [type, data] of this.data) {
      stats.total_entries += data.length;
      stats[`${type}_count`] = data.length;
    }

    // Estimate memory usage
    if (this.config.type === 'memory') {
      stats.memory_usage = JSON.stringify(Object.fromEntries(this.data)).length;
    }

    return stats;
  }

  /**
   * Clean up old data
   */
  async cleanup(type, cutoffTime) {
    if (!this.data.has(type)) {
      return;
    }

    const typeData = this.data.get(type);
    const filteredData = typeData.filter(metric => metric.timestamp >= cutoffTime);
    
    const removedCount = typeData.length - filteredData.length;
    if (removedCount > 0) {
      this.data.set(type, filteredData);
      
      // Persist changes if using file storage
      if (this.config.type === 'file') {
        await this.persistToFile(type, filteredData);
      }
      
      console.log(`🧹 Cleaned up ${removedCount} old ${type} metrics`);
    }
  }

  /**
   * Parse time range string to milliseconds
   */
  parseTimeRange(timeRange) {
    const units = {
      's': 1000,
      'm': 60 * 1000,
      'h': 60 * 60 * 1000,
      'd': 24 * 60 * 60 * 1000
    };

    const match = timeRange.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid time range format: ${timeRange}`);
    }

    const [, amount, unit] = match;
    return parseInt(amount) * units[unit];
  }

  /**
   * Export metrics data
   */
  async exportMetrics(type, format = 'json') {
    const typeData = this.data.get(type) || [];
    
    switch (format) {
      case 'json':
        return JSON.stringify(typeData, null, 2);
      case 'csv':
        return this.convertToCSV(typeData);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Convert metrics to CSV format
   */
  convertToCSV(data) {
    if (data.length === 0) {
      return '';
    }

    // Get all unique keys from the data
    const allKeys = new Set();
    data.forEach(item => {
      allKeys.add('timestamp');
      allKeys.add('type');
      if (item.data) {
        Object.keys(item.data).forEach(key => allKeys.add(key));
      }
    });

    const headers = Array.from(allKeys);
    const csvRows = [headers.join(',')];

    data.forEach(item => {
      const row = headers.map(header => {
        if (header === 'timestamp' || header === 'type') {
          return item[header] || '';
        }
        return item.data?.[header] || '';
      });
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  }

  /**
   * Close storage and cleanup
   */
  async close() {
    if (this.config.type === 'file') {
      // Final persist of all data
      for (const [type, data] of this.data) {
        await this.persistToFile(type, data);
      }
    }
    
    this.data.clear();
    this.initialized = false;
    console.log('📊 Metrics storage closed');
  }
}

export default MetricsStorage;

