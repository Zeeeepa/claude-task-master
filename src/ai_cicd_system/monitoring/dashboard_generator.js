/**
 * @fileoverview Dashboard Generator
 * @description Generates monitoring dashboards and visualizations
 */

import { EventEmitter } from 'events';

/**
 * Dashboard generator for creating monitoring visualizations
 */
export class DashboardGenerator extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            enable_grafana: config.enable_grafana !== false,
            enable_custom_dashboards: config.enable_custom_dashboards !== false,
            dashboard_refresh_interval: config.dashboard_refresh_interval || 30000, // 30 seconds
            enable_real_time: config.enable_real_time !== false,
            theme: config.theme || 'dark',
            ...config
        };

        this.dashboards = new Map();
        this.widgets = new Map();
        this.templates = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize dashboard generator
     */
    async initialize() {
        if (this.isInitialized) return;

        this._initializeTemplates();
        this._initializeDefaultDashboards();
        
        this.isInitialized = true;
        this.emit('initialized');
    }

    /**
     * Generate CI/CD overview dashboard
     */
    generateCICDDashboard(metricsCollector, performanceTracker) {
        const dashboard = {
            id: 'cicd_overview',
            title: 'CI/CD Pipeline Overview',
            description: 'Comprehensive view of CI/CD pipeline performance and health',
            tags: ['cicd', 'pipeline', 'overview'],
            time: {
                from: 'now-1h',
                to: 'now'
            },
            refresh: '30s',
            panels: []
        };

        // Pipeline execution metrics
        dashboard.panels.push(this._createTimeSeriesPanel({
            title: 'Pipeline Execution Rate',
            targets: [
                {
                    metric: 'pipeline_executions_total',
                    legend: 'Executions per minute'
                }
            ],
            yAxes: [{
                label: 'Executions/min'
            }],
            gridPos: { x: 0, y: 0, w: 12, h: 8 }
        }));

        // Pipeline duration
        dashboard.panels.push(this._createTimeSeriesPanel({
            title: 'Pipeline Duration',
            targets: [
                {
                    metric: 'pipeline_duration_seconds',
                    legend: 'Average Duration'
                }
            ],
            yAxes: [{
                label: 'Seconds'
            }],
            gridPos: { x: 12, y: 0, w: 12, h: 8 }
        }));

        // Success rate gauge
        dashboard.panels.push(this._createGaugePanel({
            title: 'Pipeline Success Rate',
            targets: [
                {
                    metric: 'pipeline_success_rate',
                    legend: 'Success Rate'
                }
            ],
            thresholds: [
                { color: 'red', value: 0 },
                { color: 'yellow', value: 0.8 },
                { color: 'green', value: 0.95 }
            ],
            gridPos: { x: 0, y: 8, w: 6, h: 8 }
        }));

        // Error rate gauge
        dashboard.panels.push(this._createGaugePanel({
            title: 'Error Rate',
            targets: [
                {
                    metric: 'error_rate_percent',
                    legend: 'Error Rate'
                }
            ],
            thresholds: [
                { color: 'green', value: 0 },
                { color: 'yellow', value: 5 },
                { color: 'red', value: 10 }
            ],
            gridPos: { x: 6, y: 8, w: 6, h: 8 }
        }));

        // Stage breakdown
        dashboard.panels.push(this._createBarChartPanel({
            title: 'Pipeline Stage Duration Breakdown',
            targets: [
                {
                    metric: 'stage_duration_seconds',
                    legend: '{{stage}}'
                }
            ],
            gridPos: { x: 12, y: 8, w: 12, h: 8 }
        }));

        // Recent pipeline executions table
        dashboard.panels.push(this._createTablePanel({
            title: 'Recent Pipeline Executions',
            columns: [
                { text: 'Pipeline ID', value: 'pipeline_id' },
                { text: 'Status', value: 'status' },
                { text: 'Duration', value: 'duration' },
                { text: 'Started', value: 'started_at' },
                { text: 'Completed', value: 'completed_at' }
            ],
            gridPos: { x: 0, y: 16, w: 24, h: 8 }
        }));

        this.dashboards.set('cicd_overview', dashboard);
        return dashboard;
    }

    /**
     * Generate performance analytics dashboard
     */
    generatePerformanceDashboard(performanceTracker) {
        const dashboard = {
            id: 'performance_analytics',
            title: 'Performance Analytics',
            description: 'Detailed performance metrics and analytics',
            tags: ['performance', 'analytics'],
            time: {
                from: 'now-6h',
                to: 'now'
            },
            refresh: '1m',
            panels: []
        };

        // Response time distribution
        dashboard.panels.push(this._createHistogramPanel({
            title: 'Response Time Distribution',
            targets: [
                {
                    metric: 'response_time_histogram',
                    legend: 'Response Time'
                }
            ],
            gridPos: { x: 0, y: 0, w: 12, h: 8 }
        }));

        // Throughput
        dashboard.panels.push(this._createTimeSeriesPanel({
            title: 'System Throughput',
            targets: [
                {
                    metric: 'requests_per_second',
                    legend: 'Requests/sec'
                }
            ],
            gridPos: { x: 12, y: 0, w: 12, h: 8 }
        }));

        // Resource utilization
        dashboard.panels.push(this._createTimeSeriesPanel({
            title: 'Resource Utilization',
            targets: [
                {
                    metric: 'cpu_usage_percent',
                    legend: 'CPU %'
                },
                {
                    metric: 'memory_usage_percent',
                    legend: 'Memory %'
                }
            ],
            gridPos: { x: 0, y: 8, w: 12, h: 8 }
        }));

        // Top slow operations
        dashboard.panels.push(this._createTablePanel({
            title: 'Top Slow Operations',
            columns: [
                { text: 'Operation', value: 'operation' },
                { text: 'Avg Duration', value: 'avg_duration' },
                { text: 'Count', value: 'count' },
                { text: 'P95', value: 'p95' },
                { text: 'P99', value: 'p99' }
            ],
            gridPos: { x: 12, y: 8, w: 12, h: 8 }
        }));

        // Performance trends
        dashboard.panels.push(this._createTimeSeriesPanel({
            title: 'Performance Trends',
            targets: [
                {
                    metric: 'avg_response_time',
                    legend: 'Average Response Time'
                },
                {
                    metric: 'p95_response_time',
                    legend: '95th Percentile'
                }
            ],
            gridPos: { x: 0, y: 16, w: 24, h: 8 }
        }));

        this.dashboards.set('performance_analytics', dashboard);
        return dashboard;
    }

    /**
     * Generate system health dashboard
     */
    generateSystemHealthDashboard(systemMonitor) {
        const dashboard = {
            id: 'system_health',
            title: 'System Health Overview',
            description: 'Real-time system health and status monitoring',
            tags: ['system', 'health', 'monitoring'],
            time: {
                from: 'now-1h',
                to: 'now'
            },
            refresh: '15s',
            panels: []
        };

        // System status overview
        dashboard.panels.push(this._createStatPanel({
            title: 'System Status',
            targets: [
                {
                    metric: 'system_health_status',
                    legend: 'Overall Health'
                }
            ],
            colorMode: 'background',
            gridPos: { x: 0, y: 0, w: 6, h: 4 }
        }));

        // Active alerts
        dashboard.panels.push(this._createStatPanel({
            title: 'Active Alerts',
            targets: [
                {
                    metric: 'active_alerts_count',
                    legend: 'Alerts'
                }
            ],
            colorMode: 'value',
            gridPos: { x: 6, y: 0, w: 6, h: 4 }
        }));

        // Uptime
        dashboard.panels.push(this._createStatPanel({
            title: 'System Uptime',
            targets: [
                {
                    metric: 'system_uptime_seconds',
                    legend: 'Uptime'
                }
            ],
            unit: 'seconds',
            gridPos: { x: 12, y: 0, w: 6, h: 4 }
        }));

        // Component health status
        dashboard.panels.push(this._createStatusPanel({
            title: 'Component Health',
            targets: [
                {
                    metric: 'component_health_status',
                    legend: '{{component}}'
                }
            ],
            gridPos: { x: 18, y: 0, w: 6, h: 4 }
        }));

        // Memory usage
        dashboard.panels.push(this._createTimeSeriesPanel({
            title: 'Memory Usage',
            targets: [
                {
                    metric: 'memory_usage_bytes',
                    legend: '{{type}}'
                }
            ],
            yAxes: [{
                label: 'Bytes',
                unit: 'bytes'
            }],
            gridPos: { x: 0, y: 4, w: 12, h: 8 }
        }));

        // CPU usage
        dashboard.panels.push(this._createTimeSeriesPanel({
            title: 'CPU Usage',
            targets: [
                {
                    metric: 'cpu_usage_percent',
                    legend: 'CPU %'
                }
            ],
            yAxes: [{
                label: 'Percentage',
                unit: 'percent',
                max: 100
            }],
            gridPos: { x: 12, y: 4, w: 12, h: 8 }
        }));

        // Recent alerts table
        dashboard.panels.push(this._createTablePanel({
            title: 'Recent Alerts',
            columns: [
                { text: 'Severity', value: 'severity' },
                { text: 'Message', value: 'message' },
                { text: 'Component', value: 'component' },
                { text: 'Time', value: 'timestamp' },
                { text: 'Status', value: 'status' }
            ],
            gridPos: { x: 0, y: 12, w: 24, h: 8 }
        }));

        this.dashboards.set('system_health', dashboard);
        return dashboard;
    }

    /**
     * Generate custom dashboard
     */
    generateCustomDashboard(config) {
        const dashboard = {
            id: config.id || `custom_${Date.now()}`,
            title: config.title || 'Custom Dashboard',
            description: config.description || '',
            tags: config.tags || ['custom'],
            time: config.time || { from: 'now-1h', to: 'now' },
            refresh: config.refresh || '30s',
            panels: []
        };

        // Add panels based on configuration
        if (config.panels) {
            config.panels.forEach(panelConfig => {
                const panel = this._createPanelFromConfig(panelConfig);
                if (panel) {
                    dashboard.panels.push(panel);
                }
            });
        }

        this.dashboards.set(dashboard.id, dashboard);
        return dashboard;
    }

    /**
     * Export dashboard to Grafana format
     */
    exportToGrafana(dashboardId) {
        const dashboard = this.dashboards.get(dashboardId);
        if (!dashboard) {
            throw new Error(`Dashboard ${dashboardId} not found`);
        }

        return {
            dashboard: {
                id: null,
                title: dashboard.title,
                description: dashboard.description,
                tags: dashboard.tags,
                timezone: 'browser',
                panels: dashboard.panels.map(panel => this._convertToGrafanaPanel(panel)),
                time: dashboard.time,
                timepicker: {},
                templating: {
                    list: []
                },
                annotations: {
                    list: []
                },
                refresh: dashboard.refresh,
                schemaVersion: 30,
                version: 1,
                links: []
            },
            overwrite: false
        };
    }

    /**
     * Get dashboard as JSON
     */
    getDashboard(dashboardId) {
        return this.dashboards.get(dashboardId);
    }

    /**
     * List all dashboards
     */
    listDashboards() {
        return Array.from(this.dashboards.keys()).map(id => ({
            id,
            title: this.dashboards.get(id).title,
            description: this.dashboards.get(id).description,
            tags: this.dashboards.get(id).tags
        }));
    }

    /**
     * Private methods
     */
    _initializeTemplates() {
        // Panel templates for reuse
        this.templates.set('timeseries', {
            type: 'timeseries',
            fieldConfig: {
                defaults: {
                    color: { mode: 'palette-classic' },
                    custom: {
                        axisLabel: '',
                        axisPlacement: 'auto',
                        barAlignment: 0,
                        drawStyle: 'line',
                        fillOpacity: 10,
                        gradientMode: 'none',
                        hideFrom: { legend: false, tooltip: false, vis: false },
                        lineInterpolation: 'linear',
                        lineWidth: 1,
                        pointSize: 5,
                        scaleDistribution: { type: 'linear' },
                        showPoints: 'never',
                        spanNulls: false,
                        stacking: { group: 'A', mode: 'none' },
                        thresholdsStyle: { mode: 'off' }
                    },
                    mappings: [],
                    thresholds: {
                        mode: 'absolute',
                        steps: [
                            { color: 'green', value: null }
                        ]
                    },
                    unit: 'short'
                },
                overrides: []
            },
            options: {
                legend: { calcs: [], displayMode: 'list', placement: 'bottom' },
                tooltip: { mode: 'single', sort: 'none' }
            }
        });

        this.templates.set('gauge', {
            type: 'gauge',
            fieldConfig: {
                defaults: {
                    color: { mode: 'thresholds' },
                    mappings: [],
                    max: 100,
                    min: 0,
                    thresholds: {
                        mode: 'absolute',
                        steps: [
                            { color: 'green', value: null },
                            { color: 'red', value: 80 }
                        ]
                    },
                    unit: 'percent'
                },
                overrides: []
            },
            options: {
                orientation: 'auto',
                reduceOptions: {
                    calcs: ['lastNotNull'],
                    fields: '',
                    values: false
                },
                showThresholdLabels: false,
                showThresholdMarkers: true
            }
        });
    }

    _initializeDefaultDashboards() {
        // Initialize with empty dashboards that will be populated when metrics are available
        this.dashboards.set('cicd_overview', null);
        this.dashboards.set('performance_analytics', null);
        this.dashboards.set('system_health', null);
    }

    _createTimeSeriesPanel(config) {
        const template = this.templates.get('timeseries');
        return {
            ...template,
            id: this._generatePanelId(),
            title: config.title,
            targets: config.targets || [],
            gridPos: config.gridPos || { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: {
                ...template.fieldConfig,
                defaults: {
                    ...template.fieldConfig.defaults,
                    unit: config.unit || 'short'
                }
            }
        };
    }

    _createGaugePanel(config) {
        const template = this.templates.get('gauge');
        return {
            ...template,
            id: this._generatePanelId(),
            title: config.title,
            targets: config.targets || [],
            gridPos: config.gridPos || { x: 0, y: 0, w: 6, h: 8 },
            fieldConfig: {
                ...template.fieldConfig,
                defaults: {
                    ...template.fieldConfig.defaults,
                    thresholds: {
                        mode: 'absolute',
                        steps: config.thresholds || [
                            { color: 'green', value: null }
                        ]
                    }
                }
            }
        };
    }

    _createBarChartPanel(config) {
        return {
            type: 'barchart',
            id: this._generatePanelId(),
            title: config.title,
            targets: config.targets || [],
            gridPos: config.gridPos || { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: {
                defaults: {
                    color: { mode: 'palette-classic' },
                    custom: {
                        axisLabel: '',
                        axisPlacement: 'auto',
                        barAlignment: 0,
                        displayMode: 'list',
                        orientation: 'horizontal'
                    },
                    mappings: [],
                    thresholds: {
                        mode: 'absolute',
                        steps: [
                            { color: 'green', value: null }
                        ]
                    }
                },
                overrides: []
            },
            options: {
                legend: { calcs: [], displayMode: 'list', placement: 'bottom' },
                tooltip: { mode: 'single', sort: 'none' }
            }
        };
    }

    _createTablePanel(config) {
        return {
            type: 'table',
            id: this._generatePanelId(),
            title: config.title,
            targets: config.targets || [],
            gridPos: config.gridPos || { x: 0, y: 0, w: 24, h: 8 },
            fieldConfig: {
                defaults: {
                    color: { mode: 'thresholds' },
                    custom: {
                        align: 'auto',
                        displayMode: 'auto'
                    },
                    mappings: [],
                    thresholds: {
                        mode: 'absolute',
                        steps: [
                            { color: 'green', value: null }
                        ]
                    }
                },
                overrides: []
            },
            options: {
                showHeader: true
            },
            transformations: [
                {
                    id: 'organize',
                    options: {
                        excludeByName: {},
                        indexByName: {},
                        renameByName: {}
                    }
                }
            ]
        };
    }

    _createStatPanel(config) {
        return {
            type: 'stat',
            id: this._generatePanelId(),
            title: config.title,
            targets: config.targets || [],
            gridPos: config.gridPos || { x: 0, y: 0, w: 6, h: 4 },
            fieldConfig: {
                defaults: {
                    color: { mode: config.colorMode || 'value' },
                    mappings: [],
                    thresholds: {
                        mode: 'absolute',
                        steps: [
                            { color: 'green', value: null }
                        ]
                    },
                    unit: config.unit || 'short'
                },
                overrides: []
            },
            options: {
                colorMode: config.colorMode || 'value',
                graphMode: 'area',
                justifyMode: 'auto',
                orientation: 'auto',
                reduceOptions: {
                    calcs: ['lastNotNull'],
                    fields: '',
                    values: false
                },
                textMode: 'auto'
            }
        };
    }

    _createHistogramPanel(config) {
        return {
            type: 'histogram',
            id: this._generatePanelId(),
            title: config.title,
            targets: config.targets || [],
            gridPos: config.gridPos || { x: 0, y: 0, w: 12, h: 8 },
            fieldConfig: {
                defaults: {
                    color: { mode: 'palette-classic' },
                    custom: {
                        hideFrom: { legend: false, tooltip: false, vis: false }
                    },
                    mappings: [],
                    thresholds: {
                        mode: 'absolute',
                        steps: [
                            { color: 'green', value: null }
                        ]
                    }
                },
                overrides: []
            },
            options: {
                legend: { calcs: [], displayMode: 'list', placement: 'bottom' }
            }
        };
    }

    _createStatusPanel(config) {
        return {
            type: 'status-panel',
            id: this._generatePanelId(),
            title: config.title,
            targets: config.targets || [],
            gridPos: config.gridPos || { x: 0, y: 0, w: 6, h: 4 },
            fieldConfig: {
                defaults: {
                    color: { mode: 'thresholds' },
                    mappings: [
                        { options: { '0': { color: 'red', index: 0, text: 'Down' } }, type: 'value' },
                        { options: { '1': { color: 'yellow', index: 1, text: 'Degraded' } }, type: 'value' },
                        { options: { '2': { color: 'green', index: 2, text: 'Healthy' } }, type: 'value' }
                    ],
                    thresholds: {
                        mode: 'absolute',
                        steps: [
                            { color: 'red', value: null },
                            { color: 'yellow', value: 1 },
                            { color: 'green', value: 2 }
                        ]
                    }
                },
                overrides: []
            }
        };
    }

    _createPanelFromConfig(config) {
        switch (config.type) {
            case 'timeseries':
                return this._createTimeSeriesPanel(config);
            case 'gauge':
                return this._createGaugePanel(config);
            case 'barchart':
                return this._createBarChartPanel(config);
            case 'table':
                return this._createTablePanel(config);
            case 'stat':
                return this._createStatPanel(config);
            case 'histogram':
                return this._createHistogramPanel(config);
            case 'status':
                return this._createStatusPanel(config);
            default:
                console.warn(`Unknown panel type: ${config.type}`);
                return null;
        }
    }

    _convertToGrafanaPanel(panel) {
        // Convert internal panel format to Grafana format
        return {
            ...panel,
            datasource: {
                type: 'prometheus',
                uid: 'prometheus'
            }
        };
    }

    _generatePanelId() {
        return Math.floor(Math.random() * 1000000);
    }
}

export default DashboardGenerator;

