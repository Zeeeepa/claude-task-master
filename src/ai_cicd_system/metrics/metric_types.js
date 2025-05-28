/**
 * @fileoverview Metric Types Constants
 * @description Centralized metric type definitions for the monitoring system
 */

/**
 * Core Metrics Categories
 */
export const MetricTypes = {
  // System Performance
  API_RESPONSE_TIME: 'api_response_time',
  DATABASE_QUERY_TIME: 'database_query_time',
  CODEGEN_REQUEST_TIME: 'codegen_request_time',
  WORKFLOW_EXECUTION_TIME: 'workflow_execution_time',
  
  // Throughput Metrics
  REQUESTS_PER_SECOND: 'requests_per_second',
  TASKS_PROCESSED_PER_MINUTE: 'tasks_processed_per_minute',
  PRS_CREATED_PER_HOUR: 'prs_created_per_hour',
  
  // Error Metrics
  ERROR_RATE: 'error_rate',
  RETRY_COUNT: 'retry_count',
  CIRCUIT_BREAKER_TRIPS: 'circuit_breaker_trips',
  
  // Resource Utilization
  MEMORY_USAGE: 'memory_usage',
  CPU_USAGE: 'cpu_usage',
  DATABASE_CONNECTIONS: 'database_connections',
  CONCURRENT_WORKFLOWS: 'concurrent_workflows'
};

/**
 * Metric Units
 */
export const MetricUnits = {
  MILLISECONDS: 'ms',
  SECONDS: 's',
  COUNT: 'count',
  PERCENTAGE: 'percentage',
  BYTES: 'bytes',
  RATE: 'rate'
};

/**
 * Alert Severities
 */
export const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  CRITICAL: 'critical'
};

export default MetricTypes;

