/**
 * @fileoverview Distributed Tracer
 * @description Distributed tracing implementation for observability across services
 */

import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

/**
 * Distributed tracer for comprehensive observability
 */
export class DistributedTracer extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            service_name: config.service_name || 'ai-cicd-system',
            enable_sampling: config.enable_sampling !== false,
            sampling_rate: config.sampling_rate || 1.0, // 100% by default
            enable_baggage: config.enable_baggage !== false,
            enable_logs_correlation: config.enable_logs_correlation !== false,
            max_span_duration: config.max_span_duration || 300000, // 5 minutes
            max_spans_per_trace: config.max_spans_per_trace || 1000,
            ...config
        };

        this.activeSpans = new Map();
        this.completedTraces = new Map();
        this.spanContext = new Map();
        this.baggage = new Map();
        this.isInitialized = false;
    }

    /**
     * Initialize the tracer
     */
    async initialize() {
        if (this.isInitialized) return;

        this.isInitialized = true;
        this._startCleanupInterval();
        
        this.emit('initialized');
    }

    /**
     * Start a new trace
     */
    startTrace(operationName, metadata = {}) {
        const traceId = this._generateTraceId();
        const spanId = this._generateSpanId();
        
        const span = this._createSpan({
            traceId,
            spanId,
            parentSpanId: null,
            operationName,
            startTime: Date.now(),
            metadata: {
                service: this.config.service_name,
                ...metadata
            }
        });

        this.activeSpans.set(spanId, span);
        this._setActiveSpan(span);

        this.emit('trace_started', {
            traceId,
            spanId,
            operationName
        });

        return span;
    }

    /**
     * Start a child span
     */
    startSpan(operationName, parentSpan = null, metadata = {}) {
        if (!this._shouldSample()) {
            return this._createNoOpSpan();
        }

        const parent = parentSpan || this._getActiveSpan();
        if (!parent) {
            return this.startTrace(operationName, metadata);
        }

        const spanId = this._generateSpanId();
        
        const span = this._createSpan({
            traceId: parent.traceId,
            spanId,
            parentSpanId: parent.spanId,
            operationName,
            startTime: Date.now(),
            metadata: {
                service: this.config.service_name,
                ...metadata
            }
        });

        this.activeSpans.set(spanId, span);
        this._setActiveSpan(span);

        this.emit('span_started', {
            traceId: span.traceId,
            spanId,
            parentSpanId: parent.spanId,
            operationName
        });

        return span;
    }

    /**
     * Finish a span
     */
    finishSpan(span, result = {}) {
        if (!span || span.isNoOp) return;

        const endTime = Date.now();
        const duration = endTime - span.startTime;

        // Update span with completion data
        span.endTime = endTime;
        span.duration = duration;
        span.status = result.error ? 'error' : 'ok';
        span.error = result.error || null;
        span.result = result;

        // Add tags if provided
        if (result.tags) {
            span.tags = { ...span.tags, ...result.tags };
        }

        // Move from active to completed
        this.activeSpans.delete(span.spanId);
        
        // Store in completed traces
        if (!this.completedTraces.has(span.traceId)) {
            this.completedTraces.set(span.traceId, {
                traceId: span.traceId,
                spans: [],
                startTime: span.startTime,
                endTime: endTime,
                duration: 0,
                status: 'ok'
            });
        }

        const trace = this.completedTraces.get(span.traceId);
        trace.spans.push(span);
        trace.endTime = Math.max(trace.endTime, endTime);
        trace.duration = trace.endTime - trace.startTime;
        
        // Update trace status if span has error
        if (span.status === 'error') {
            trace.status = 'error';
        }

        // Clear active span if this was the active one
        if (this._getActiveSpan()?.spanId === span.spanId) {
            this._clearActiveSpan();
        }

        this.emit('span_finished', {
            traceId: span.traceId,
            spanId: span.spanId,
            operationName: span.operationName,
            duration,
            status: span.status
        });

        // Check if trace is complete
        this._checkTraceCompletion(span.traceId);
    }

    /**
     * Add tags to a span
     */
    addTags(span, tags) {
        if (!span || span.isNoOp) return;
        
        span.tags = { ...span.tags, ...tags };
        
        this.emit('tags_added', {
            traceId: span.traceId,
            spanId: span.spanId,
            tags
        });
    }

    /**
     * Add logs to a span
     */
    addLogs(span, logs) {
        if (!span || span.isNoOp) return;
        
        const logEntry = {
            timestamp: Date.now(),
            ...logs
        };
        
        span.logs.push(logEntry);
        
        this.emit('logs_added', {
            traceId: span.traceId,
            spanId: span.spanId,
            logs: logEntry
        });
    }

    /**
     * Set baggage (cross-cutting concerns)
     */
    setBaggage(key, value, span = null) {
        if (!this.config.enable_baggage) return;
        
        const targetSpan = span || this._getActiveSpan();
        if (!targetSpan) return;
        
        if (!this.baggage.has(targetSpan.traceId)) {
            this.baggage.set(targetSpan.traceId, new Map());
        }
        
        this.baggage.get(targetSpan.traceId).set(key, value);
        
        this.emit('baggage_set', {
            traceId: targetSpan.traceId,
            key,
            value
        });
    }

    /**
     * Get baggage value
     */
    getBaggage(key, span = null) {
        if (!this.config.enable_baggage) return null;
        
        const targetSpan = span || this._getActiveSpan();
        if (!targetSpan) return null;
        
        const traceBaggage = this.baggage.get(targetSpan.traceId);
        return traceBaggage ? traceBaggage.get(key) : null;
    }

    /**
     * Get correlation ID for logs
     */
    getCorrelationId(span = null) {
        if (!this.config.enable_logs_correlation) return null;
        
        const targetSpan = span || this._getActiveSpan();
        if (!targetSpan) return null;
        
        return `${targetSpan.traceId}:${targetSpan.spanId}`;
    }

    /**
     * Inject trace context for propagation
     */
    inject(span, format = 'http_headers') {
        if (!span || span.isNoOp) return {};
        
        switch (format) {
            case 'http_headers':
                return {
                    'x-trace-id': span.traceId,
                    'x-span-id': span.spanId,
                    'x-parent-span-id': span.parentSpanId || '',
                    'x-sampled': '1'
                };
            case 'text_map':
                return {
                    traceId: span.traceId,
                    spanId: span.spanId,
                    parentSpanId: span.parentSpanId,
                    sampled: true
                };
            default:
                throw new Error(`Unsupported injection format: ${format}`);
        }
    }

    /**
     * Extract trace context from carrier
     */
    extract(carrier, format = 'http_headers') {
        switch (format) {
            case 'http_headers':
                return {
                    traceId: carrier['x-trace-id'],
                    spanId: carrier['x-span-id'],
                    parentSpanId: carrier['x-parent-span-id'],
                    sampled: carrier['x-sampled'] === '1'
                };
            case 'text_map':
                return {
                    traceId: carrier.traceId,
                    spanId: carrier.spanId,
                    parentSpanId: carrier.parentSpanId,
                    sampled: carrier.sampled
                };
            default:
                throw new Error(`Unsupported extraction format: ${format}`);
        }
    }

    /**
     * Continue trace from extracted context
     */
    continueTrace(context, operationName, metadata = {}) {
        if (!context.traceId) {
            return this.startTrace(operationName, metadata);
        }

        const spanId = this._generateSpanId();
        
        const span = this._createSpan({
            traceId: context.traceId,
            spanId,
            parentSpanId: context.spanId,
            operationName,
            startTime: Date.now(),
            metadata: {
                service: this.config.service_name,
                ...metadata
            }
        });

        this.activeSpans.set(spanId, span);
        this._setActiveSpan(span);

        this.emit('trace_continued', {
            traceId: span.traceId,
            spanId,
            parentSpanId: context.spanId,
            operationName
        });

        return span;
    }

    /**
     * Get trace by ID
     */
    getTrace(traceId) {
        return this.completedTraces.get(traceId);
    }

    /**
     * Get all traces
     */
    getAllTraces(limit = 100) {
        const traces = Array.from(this.completedTraces.values())
            .sort((a, b) => b.startTime - a.startTime)
            .slice(0, limit);
        
        return traces;
    }

    /**
     * Get trace statistics
     */
    getTraceStatistics(timeRange = '1h') {
        const timeRangeMs = this._parseTimeRange(timeRange);
        const cutoffTime = Date.now() - timeRangeMs;
        
        const recentTraces = Array.from(this.completedTraces.values())
            .filter(trace => trace.startTime >= cutoffTime);
        
        if (recentTraces.length === 0) {
            return {
                totalTraces: 0,
                avgDuration: 0,
                minDuration: 0,
                maxDuration: 0,
                errorRate: 0,
                throughput: 0
            };
        }

        const durations = recentTraces.map(t => t.duration);
        const errorCount = recentTraces.filter(t => t.status === 'error').length;
        
        return {
            totalTraces: recentTraces.length,
            avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            errorRate: errorCount / recentTraces.length,
            throughput: recentTraces.length / (timeRangeMs / 1000) // traces per second
        };
    }

    /**
     * Export traces for external systems
     */
    exportTraces(format = 'jaeger', limit = 100) {
        const traces = this.getAllTraces(limit);
        
        switch (format.toLowerCase()) {
            case 'jaeger':
                return this._exportToJaeger(traces);
            case 'zipkin':
                return this._exportToZipkin(traces);
            case 'opentelemetry':
                return this._exportToOpenTelemetry(traces);
            default:
                return traces;
        }
    }

    /**
     * Private methods
     */
    _createSpan(config) {
        return {
            traceId: config.traceId,
            spanId: config.spanId,
            parentSpanId: config.parentSpanId,
            operationName: config.operationName,
            startTime: config.startTime,
            endTime: null,
            duration: null,
            status: 'active',
            tags: {},
            logs: [],
            metadata: config.metadata,
            error: null,
            result: null,
            isNoOp: false
        };
    }

    _createNoOpSpan() {
        return {
            traceId: null,
            spanId: null,
            parentSpanId: null,
            operationName: 'noop',
            startTime: Date.now(),
            endTime: null,
            duration: null,
            status: 'noop',
            tags: {},
            logs: [],
            metadata: {},
            error: null,
            result: null,
            isNoOp: true
        };
    }

    _generateTraceId() {
        return randomBytes(16).toString('hex');
    }

    _generateSpanId() {
        return randomBytes(8).toString('hex');
    }

    _shouldSample() {
        return Math.random() < this.config.sampling_rate;
    }

    _setActiveSpan(span) {
        // Simple thread-local storage simulation
        this.spanContext.set('active', span);
    }

    _getActiveSpan() {
        return this.spanContext.get('active');
    }

    _clearActiveSpan() {
        this.spanContext.delete('active');
    }

    _checkTraceCompletion(traceId) {
        // Check if all spans in trace are completed
        const hasActiveSpans = Array.from(this.activeSpans.values())
            .some(span => span.traceId === traceId);
        
        if (!hasActiveSpans) {
            const trace = this.completedTraces.get(traceId);
            if (trace) {
                this.emit('trace_completed', trace);
            }
        }
    }

    _startCleanupInterval() {
        setInterval(() => {
            this._cleanupOldTraces();
            this._cleanupStaleSpans();
        }, 60000); // Every minute
    }

    _cleanupOldTraces() {
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
        
        for (const [traceId, trace] of this.completedTraces) {
            if (trace.startTime < cutoffTime) {
                this.completedTraces.delete(traceId);
                this.baggage.delete(traceId);
            }
        }
    }

    _cleanupStaleSpans() {
        const cutoffTime = Date.now() - this.config.max_span_duration;
        
        for (const [spanId, span] of this.activeSpans) {
            if (span.startTime < cutoffTime) {
                // Force finish stale spans
                this.finishSpan(span, { 
                    error: new Error('Span exceeded maximum duration'),
                    tags: { stale: true }
                });
            }
        }
    }

    _parseTimeRange(timeRange) {
        const units = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000
        };

        const match = timeRange.match(/^(\d+)([smhd])$/);
        if (!match) return 60 * 60 * 1000; // Default to 1 hour

        const [, value, unit] = match;
        return parseInt(value) * units[unit];
    }

    _exportToJaeger(traces) {
        return {
            data: traces.map(trace => ({
                traceID: trace.traceId,
                spans: trace.spans.map(span => ({
                    traceID: span.traceId,
                    spanID: span.spanId,
                    parentSpanID: span.parentSpanId,
                    operationName: span.operationName,
                    startTime: span.startTime * 1000, // Jaeger expects microseconds
                    duration: span.duration * 1000,
                    tags: Object.entries(span.tags).map(([key, value]) => ({
                        key,
                        type: typeof value === 'string' ? 'string' : 'number',
                        value: value.toString()
                    })),
                    logs: span.logs.map(log => ({
                        timestamp: log.timestamp * 1000,
                        fields: Object.entries(log).filter(([key]) => key !== 'timestamp')
                            .map(([key, value]) => ({
                                key,
                                value: value.toString()
                            }))
                    })),
                    process: {
                        serviceName: this.config.service_name,
                        tags: []
                    }
                }))
            }))
        };
    }

    _exportToZipkin(traces) {
        const spans = [];
        
        traces.forEach(trace => {
            trace.spans.forEach(span => {
                spans.push({
                    traceId: span.traceId,
                    id: span.spanId,
                    parentId: span.parentSpanId,
                    name: span.operationName,
                    timestamp: span.startTime * 1000, // Zipkin expects microseconds
                    duration: span.duration * 1000,
                    localEndpoint: {
                        serviceName: this.config.service_name
                    },
                    tags: span.tags,
                    annotations: span.logs.map(log => ({
                        timestamp: log.timestamp * 1000,
                        value: JSON.stringify(log)
                    }))
                });
            });
        });
        
        return spans;
    }

    _exportToOpenTelemetry(traces) {
        return {
            resourceSpans: [{
                resource: {
                    attributes: [{
                        key: 'service.name',
                        value: { stringValue: this.config.service_name }
                    }]
                },
                instrumentationLibrarySpans: [{
                    instrumentationLibrary: {
                        name: 'ai-cicd-tracer',
                        version: '1.0.0'
                    },
                    spans: traces.flatMap(trace => 
                        trace.spans.map(span => ({
                            traceId: Buffer.from(span.traceId, 'hex').toString('base64'),
                            spanId: Buffer.from(span.spanId, 'hex').toString('base64'),
                            parentSpanId: span.parentSpanId ? 
                                Buffer.from(span.parentSpanId, 'hex').toString('base64') : undefined,
                            name: span.operationName,
                            kind: 'SPAN_KIND_INTERNAL',
                            startTimeUnixNano: span.startTime * 1000000, // nanoseconds
                            endTimeUnixNano: span.endTime * 1000000,
                            attributes: Object.entries(span.tags).map(([key, value]) => ({
                                key,
                                value: { stringValue: value.toString() }
                            })),
                            events: span.logs.map(log => ({
                                timeUnixNano: log.timestamp * 1000000,
                                name: 'log',
                                attributes: Object.entries(log).filter(([key]) => key !== 'timestamp')
                                    .map(([key, value]) => ({
                                        key,
                                        value: { stringValue: value.toString() }
                                    }))
                            })),
                            status: {
                                code: span.status === 'error' ? 'STATUS_CODE_ERROR' : 'STATUS_CODE_OK',
                                message: span.error ? span.error.message : ''
                            }
                        }))
                    )
                }]
            }]
        };
    }
}

export default DistributedTracer;

