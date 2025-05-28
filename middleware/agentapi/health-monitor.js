/**
 * Health Monitor
 * 
 * Monitors system health, agent performance, and resource usage
 * Provides metrics collection and alerting capabilities
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

export class HealthMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.checkInterval = options.checkInterval || 30000; // 30 seconds
    this.metricsRetention = options.metricsRetention || 24 * 60 * 60 * 1000; // 24 hours
    this.alertThresholds = options.alertThresholds || this.getDefaultThresholds();
    
    this.metrics = {
      system: [],
      agents: new Map(),
      workspaces: new Map(),
      alerts: [],
    };
    
    this.isRunning = false;
    this.checkTimer = null;
  }

  getDefaultThresholds() {
    return {
      cpu: {
        warning: 70,
        critical: 90,
      },
      memory: {
        warning: 80,
        critical: 95,
      },
      disk: {
        warning: 85,
        critical: 95,
      },
      agentResponseTime: {
        warning: 10000, // 10 seconds
        critical: 30000, // 30 seconds
      },
      errorRate: {
        warning: 0.1, // 10%
        critical: 0.25, // 25%
      },
    };
  }

  async start() {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    
    // Initial health check
    await this.performHealthCheck();
    
    // Start periodic monitoring
    this.checkTimer = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('Health check failed:', error);
        this.emit('healthCheckError', error);
      });
    }, this.checkInterval);

    this.emit('started');
    console.log('Health monitor started');
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    this.emit('stopped');
    console.log('Health monitor stopped');
  }

  async performHealthCheck() {
    const timestamp = new Date().toISOString();
    
    try {
      // Collect system metrics
      const systemMetrics = await this.collectSystemMetrics();
      
      // Store metrics
      this.storeSystemMetrics(systemMetrics, timestamp);
      
      // Check thresholds and generate alerts
      await this.checkThresholds(systemMetrics, timestamp);
      
      // Clean up old metrics
      this.cleanupOldMetrics();
      
      this.emit('healthCheckCompleted', { timestamp, metrics: systemMetrics });
      
    } catch (error) {
      this.emit('healthCheckError', error);
      throw error;
    }
  }

  async collectSystemMetrics() {
    const metrics = {
      timestamp: new Date().toISOString(),
      cpu: await this.getCPUUsage(),
      memory: this.getMemoryUsage(),
      disk: await this.getDiskUsage(),
      network: await this.getNetworkStats(),
      processes: await this.getProcessStats(),
      uptime: process.uptime(),
    };

    return metrics;
  }

  async getCPUUsage() {
    return new Promise((resolve) => {
      const startUsage = process.cpuUsage();
      const startTime = process.hrtime();
      
      setTimeout(() => {
        const endUsage = process.cpuUsage(startUsage);
        const endTime = process.hrtime(startTime);
        
        const totalTime = endTime[0] * 1000000 + endTime[1] / 1000; // microseconds
        const cpuPercent = ((endUsage.user + endUsage.system) / totalTime) * 100;
        
        resolve({
          percent: Math.round(cpuPercent * 100) / 100,
          user: endUsage.user,
          system: endUsage.system,
          cores: os.cpus().length,
          loadAverage: os.loadavg(),
        });
      }, 100);
    });
  }

  getMemoryUsage() {
    const processMemory = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
    };
    
    const used = systemMemory.total - systemMemory.free;
    const usedPercent = (used / systemMemory.total) * 100;
    
    return {
      system: {
        total: systemMemory.total,
        used: used,
        free: systemMemory.free,
        percent: Math.round(usedPercent * 100) / 100,
      },
      process: {
        rss: processMemory.rss,
        heapTotal: processMemory.heapTotal,
        heapUsed: processMemory.heapUsed,
        external: processMemory.external,
        arrayBuffers: processMemory.arrayBuffers,
      },
    };
  }

  async getDiskUsage() {
    try {
      const stats = await fs.statfs(process.cwd());
      const total = stats.blocks * stats.bsize;
      const free = stats.bavail * stats.bsize;
      const used = total - free;
      const usedPercent = (used / total) * 100;
      
      return {
        total,
        used,
        free,
        percent: Math.round(usedPercent * 100) / 100,
      };
    } catch (error) {
      // Fallback for systems that don't support statfs
      return {
        total: 0,
        used: 0,
        free: 0,
        percent: 0,
        error: error.message,
      };
    }
  }

  async getNetworkStats() {
    const interfaces = os.networkInterfaces();
    const stats = {};
    
    for (const [name, addresses] of Object.entries(interfaces)) {
      stats[name] = addresses.map(addr => ({
        address: addr.address,
        family: addr.family,
        internal: addr.internal,
      }));
    }
    
    return stats;
  }

  async getProcessStats() {
    return {
      pid: process.pid,
      ppid: process.ppid,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      uptime: process.uptime(),
    };
  }

  storeSystemMetrics(metrics, timestamp) {
    this.metrics.system.push({
      timestamp,
      ...metrics,
    });
  }

  async checkThresholds(metrics, timestamp) {
    const alerts = [];
    
    // Check CPU threshold
    if (metrics.cpu.percent >= this.alertThresholds.cpu.critical) {
      alerts.push(this.createAlert('cpu', 'critical', 
        `CPU usage is ${metrics.cpu.percent}%`, metrics.cpu));
    } else if (metrics.cpu.percent >= this.alertThresholds.cpu.warning) {
      alerts.push(this.createAlert('cpu', 'warning', 
        `CPU usage is ${metrics.cpu.percent}%`, metrics.cpu));
    }
    
    // Check memory threshold
    if (metrics.memory.system.percent >= this.alertThresholds.memory.critical) {
      alerts.push(this.createAlert('memory', 'critical', 
        `Memory usage is ${metrics.memory.system.percent}%`, metrics.memory));
    } else if (metrics.memory.system.percent >= this.alertThresholds.memory.warning) {
      alerts.push(this.createAlert('memory', 'warning', 
        `Memory usage is ${metrics.memory.system.percent}%`, metrics.memory));
    }
    
    // Check disk threshold
    if (metrics.disk.percent >= this.alertThresholds.disk.critical) {
      alerts.push(this.createAlert('disk', 'critical', 
        `Disk usage is ${metrics.disk.percent}%`, metrics.disk));
    } else if (metrics.disk.percent >= this.alertThresholds.disk.warning) {
      alerts.push(this.createAlert('disk', 'warning', 
        `Disk usage is ${metrics.disk.percent}%`, metrics.disk));
    }
    
    // Store alerts
    for (const alert of alerts) {
      this.metrics.alerts.push(alert);
      this.emit('alert', alert);
    }
  }

  createAlert(type, severity, message, data) {
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      type,
      severity,
      message,
      data,
      acknowledged: false,
    };
  }

  // Agent-specific monitoring
  trackAgentMetrics(agentId, metrics) {
    const agentMetrics = this.metrics.agents.get(agentId) || [];
    
    agentMetrics.push({
      timestamp: new Date().toISOString(),
      ...metrics,
    });
    
    this.metrics.agents.set(agentId, agentMetrics);
    this.emit('agentMetricsUpdated', { agentId, metrics });
  }

  trackWorkspaceMetrics(workspaceId, metrics) {
    const workspaceMetrics = this.metrics.workspaces.get(workspaceId) || [];
    
    workspaceMetrics.push({
      timestamp: new Date().toISOString(),
      ...metrics,
    });
    
    this.metrics.workspaces.set(workspaceId, workspaceMetrics);
    this.emit('workspaceMetricsUpdated', { workspaceId, metrics });
  }

  // Metrics retrieval
  getMetrics(options = {}) {
    const { 
      includeSystem = true, 
      includeAgents = true, 
      includeWorkspaces = true,
      timeRange = null 
    } = options;
    
    const result = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
    
    if (includeSystem) {
      result.system = this.getFilteredMetrics(this.metrics.system, timeRange);
    }
    
    if (includeAgents) {
      result.agents = {};
      for (const [agentId, metrics] of this.metrics.agents) {
        result.agents[agentId] = this.getFilteredMetrics(metrics, timeRange);
      }
    }
    
    if (includeWorkspaces) {
      result.workspaces = {};
      for (const [workspaceId, metrics] of this.metrics.workspaces) {
        result.workspaces[workspaceId] = this.getFilteredMetrics(metrics, timeRange);
      }
    }
    
    result.alerts = this.getFilteredMetrics(this.metrics.alerts, timeRange);
    
    return result;
  }

  getFilteredMetrics(metrics, timeRange) {
    if (!timeRange) {
      return metrics;
    }
    
    const { start, end } = timeRange;
    return metrics.filter(metric => {
      const timestamp = new Date(metric.timestamp);
      return (!start || timestamp >= new Date(start)) && 
             (!end || timestamp <= new Date(end));
    });
  }

  getCurrentSystemStatus() {
    const latestMetrics = this.metrics.system[this.metrics.system.length - 1];
    
    if (!latestMetrics) {
      return {
        status: 'unknown',
        message: 'No metrics available',
      };
    }
    
    const issues = [];
    
    if (latestMetrics.cpu.percent >= this.alertThresholds.cpu.critical) {
      issues.push(`Critical CPU usage: ${latestMetrics.cpu.percent}%`);
    }
    
    if (latestMetrics.memory.system.percent >= this.alertThresholds.memory.critical) {
      issues.push(`Critical memory usage: ${latestMetrics.memory.system.percent}%`);
    }
    
    if (latestMetrics.disk.percent >= this.alertThresholds.disk.critical) {
      issues.push(`Critical disk usage: ${latestMetrics.disk.percent}%`);
    }
    
    let status = 'healthy';
    if (issues.length > 0) {
      status = 'critical';
    } else {
      const warnings = [];
      
      if (latestMetrics.cpu.percent >= this.alertThresholds.cpu.warning) {
        warnings.push(`High CPU usage: ${latestMetrics.cpu.percent}%`);
      }
      
      if (latestMetrics.memory.system.percent >= this.alertThresholds.memory.warning) {
        warnings.push(`High memory usage: ${latestMetrics.memory.system.percent}%`);
      }
      
      if (latestMetrics.disk.percent >= this.alertThresholds.disk.warning) {
        warnings.push(`High disk usage: ${latestMetrics.disk.percent}%`);
      }
      
      if (warnings.length > 0) {
        status = 'warning';
        issues.push(...warnings);
      }
    }
    
    return {
      status,
      timestamp: latestMetrics.timestamp,
      issues,
      metrics: latestMetrics,
    };
  }

  // Log management
  async getLogs(agentType, workspaceId, options = {}) {
    const { lines = 100, follow = false } = options;
    
    // This would integrate with actual log files
    // For now, return a placeholder structure
    const logs = [];
    
    if (follow) {
      // Return a stream for following logs
      const logStream = new EventEmitter();
      
      // Simulate log streaming
      const interval = setInterval(() => {
        logStream.emit('data', `[${new Date().toISOString()}] Sample log entry`);
      }, 1000);
      
      logStream.destroy = () => {
        clearInterval(interval);
      };
      
      return logStream;
    } else {
      // Return static logs
      for (let i = 0; i < lines; i++) {
        logs.push(`[${new Date().toISOString()}] Log entry ${i + 1}`);
      }
      
      return logs;
    }
  }

  // Alert management
  acknowledgeAlert(alertId) {
    const alert = this.metrics.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date().toISOString();
      this.emit('alertAcknowledged', alert);
    }
  }

  getActiveAlerts() {
    return this.metrics.alerts.filter(alert => !alert.acknowledged);
  }

  // Cleanup
  cleanupOldMetrics() {
    const cutoffTime = new Date(Date.now() - this.metricsRetention);
    
    // Clean system metrics
    this.metrics.system = this.metrics.system.filter(metric => 
      new Date(metric.timestamp) > cutoffTime
    );
    
    // Clean agent metrics
    for (const [agentId, metrics] of this.metrics.agents) {
      const filteredMetrics = metrics.filter(metric => 
        new Date(metric.timestamp) > cutoffTime
      );
      
      if (filteredMetrics.length === 0) {
        this.metrics.agents.delete(agentId);
      } else {
        this.metrics.agents.set(agentId, filteredMetrics);
      }
    }
    
    // Clean workspace metrics
    for (const [workspaceId, metrics] of this.metrics.workspaces) {
      const filteredMetrics = metrics.filter(metric => 
        new Date(metric.timestamp) > cutoffTime
      );
      
      if (filteredMetrics.length === 0) {
        this.metrics.workspaces.delete(workspaceId);
      } else {
        this.metrics.workspaces.set(workspaceId, filteredMetrics);
      }
    }
    
    // Clean alerts
    this.metrics.alerts = this.metrics.alerts.filter(alert => 
      new Date(alert.timestamp) > cutoffTime
    );
  }

  // Performance analysis
  getPerformanceReport(timeRange = null) {
    const systemMetrics = this.getFilteredMetrics(this.metrics.system, timeRange);
    
    if (systemMetrics.length === 0) {
      return {
        error: 'No metrics available for the specified time range',
      };
    }
    
    const cpuValues = systemMetrics.map(m => m.cpu.percent);
    const memoryValues = systemMetrics.map(m => m.memory.system.percent);
    const diskValues = systemMetrics.map(m => m.disk.percent);
    
    return {
      timeRange: {
        start: systemMetrics[0].timestamp,
        end: systemMetrics[systemMetrics.length - 1].timestamp,
        samples: systemMetrics.length,
      },
      cpu: {
        average: this.calculateAverage(cpuValues),
        min: Math.min(...cpuValues),
        max: Math.max(...cpuValues),
        current: cpuValues[cpuValues.length - 1],
      },
      memory: {
        average: this.calculateAverage(memoryValues),
        min: Math.min(...memoryValues),
        max: Math.max(...memoryValues),
        current: memoryValues[memoryValues.length - 1],
      },
      disk: {
        average: this.calculateAverage(diskValues),
        min: Math.min(...diskValues),
        max: Math.max(...diskValues),
        current: diskValues[diskValues.length - 1],
      },
      alerts: this.metrics.alerts.filter(alert => 
        !timeRange || (
          new Date(alert.timestamp) >= new Date(timeRange.start) &&
          new Date(alert.timestamp) <= new Date(timeRange.end)
        )
      ).length,
    };
  }

  calculateAverage(values) {
    if (values.length === 0) return 0;
    return Math.round((values.reduce((sum, val) => sum + val, 0) / values.length) * 100) / 100;
  }
}

