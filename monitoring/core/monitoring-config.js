/**
 * Monitoring Configuration
 * Central configuration for the comprehensive monitoring and analytics system
 */

export const MonitoringConfig = {
  // Performance metrics configuration
  metrics: {
    performance: [
      'response_time',
      'throughput',
      'error_rate',
      'cpu_usage',
      'memory_usage',
      'disk_usage'
    ],
    workflow: [
      'task_completion_rate',
      'pr_success_rate',
      'cycle_time',
      'task_creation_rate',
      'subtask_completion_rate'
    ],
    system: [
      'api_calls_per_minute',
      'active_connections',
      'queue_depth',
      'cache_hit_rate',
      'database_connections'
    ]
  },

  // Alert thresholds
  alerts: {
    error_rate_threshold: 5, // %
    response_time_threshold: 1000, // ms
    system_resource_threshold: 80, // %
    task_failure_threshold: 10, // %
    api_rate_limit_threshold: 90, // %
    memory_usage_threshold: 85, // %
    disk_usage_threshold: 90, // %
    queue_depth_threshold: 100 // number of items
  },

  // Data retention policies
  retention: {
    real_time_data: '1h', // 1 hour
    hourly_aggregates: '7d', // 7 days
    daily_aggregates: '90d', // 90 days
    monthly_aggregates: '1y', // 1 year
    alerts_history: '30d' // 30 days
  },

  // Collection intervals
  collection: {
    real_time_interval: 5000, // 5 seconds
    performance_interval: 30000, // 30 seconds
    system_health_interval: 60000, // 1 minute
    workflow_metrics_interval: 300000, // 5 minutes
    cleanup_interval: 3600000 // 1 hour
  },

  // Dashboard configuration
  dashboard: {
    refresh_interval: 10000, // 10 seconds
    max_data_points: 100,
    default_time_range: '1h',
    available_time_ranges: ['5m', '15m', '1h', '6h', '24h', '7d', '30d']
  },

  // Storage configuration
  storage: {
    type: 'memory', // 'memory', 'file', 'database'
    file_path: './monitoring/data',
    max_memory_entries: 10000,
    compression: true
  },

  // Integration points
  integrations: {
    database: {
      enabled: true,
      monitor_queries: true,
      slow_query_threshold: 1000 // ms
    },
    agentapi: {
      enabled: true,
      track_requests: true,
      track_responses: true
    },
    webhooks: {
      enabled: true,
      track_delivery: true,
      track_failures: true
    },
    linear: {
      enabled: true,
      track_ticket_lifecycle: true,
      track_resolution_times: true
    }
  },

  // Privacy and security
  privacy: {
    anonymize_user_data: true,
    exclude_sensitive_fields: [
      'password',
      'token',
      'api_key',
      'secret',
      'private_key'
    ],
    hash_identifiers: true
  }
};

export default MonitoringConfig;

