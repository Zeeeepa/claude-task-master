/**
 * @fileoverview Event Router
 * @description Intelligent event routing based on event type, context, and business rules
 */

/**
 * Event Router class
 */
export class EventRouter {
    constructor(config = {}) {
        this.config = {
            enableContextRouting: config.enableContextRouting !== false,
            enablePriorityRouting: config.enablePriorityRouting !== false,
            enableLoadBalancing: config.enableLoadBalancing !== false,
            defaultPriority: config.defaultPriority || 5,
            ...config
        };

        this.routes = new Map();
        this.routingRules = new Map();
        this.statistics = {
            eventsRouted: 0,
            routingDecisions: new Map(),
            averageRoutingTime: 0,
            totalRoutingTime: 0
        };

        this.initializeDefaultRoutes();
        this.initializeRoutingRules();
    }

    /**
     * Initialize default routing configuration
     */
    initializeDefaultRoutes() {
        // GitHub event routes
        this.addRoute('github', 'pull_request', {
            handler: 'github_handler',
            priority: 8,
            timeout: 30000,
            retryable: true,
            conditions: []
        });

        this.addRoute('github', 'push', {
            handler: 'github_handler',
            priority: 6,
            timeout: 15000,
            retryable: true,
            conditions: []
        });

        this.addRoute('github', 'issue_comment', {
            handler: 'github_handler',
            priority: 5,
            timeout: 10000,
            retryable: true,
            conditions: []
        });

        this.addRoute('github', 'workflow_run', {
            handler: 'github_handler',
            priority: 7,
            timeout: 20000,
            retryable: true,
            conditions: []
        });

        // Linear event routes
        this.addRoute('linear', 'issue.create', {
            handler: 'linear_handler',
            priority: 9,
            timeout: 30000,
            retryable: true,
            conditions: []
        });

        this.addRoute('linear', 'issue.update', {
            handler: 'linear_handler',
            priority: 7,
            timeout: 20000,
            retryable: true,
            conditions: []
        });

        this.addRoute('linear', 'issue.remove', {
            handler: 'linear_handler',
            priority: 6,
            timeout: 15000,
            retryable: false,
            conditions: []
        });

        // Codegen event routes
        this.addRoute('codegen', 'generation.complete', {
            handler: 'codegen_handler',
            priority: 9,
            timeout: 45000,
            retryable: true,
            conditions: []
        });

        this.addRoute('codegen', 'generation.failed', {
            handler: 'codegen_handler',
            priority: 8,
            timeout: 30000,
            retryable: true,
            conditions: []
        });

        // Claude Code event routes
        this.addRoute('claude_code', 'validation.complete', {
            handler: 'claude_code_handler',
            priority: 8,
            timeout: 30000,
            retryable: true,
            conditions: []
        });

        this.addRoute('claude_code', 'validation.failed', {
            handler: 'claude_code_handler',
            priority: 8,
            timeout: 30000,
            retryable: true,
            conditions: []
        });
    }

    /**
     * Initialize routing rules
     */
    initializeRoutingRules() {
        // High priority rules
        this.addRoutingRule('codegen_assigned', {
            condition: (event) => {
                return event.source === 'linear' && 
                       event.type === 'issue.update' &&
                       event.context?.linear?.issue?.assignee?.toLowerCase().includes('codegen');
            },
            priority: 10,
            handler: 'linear_handler',
            metadata: { reason: 'codegen_assigned' }
        });

        this.addRoutingRule('codegen_pr_created', {
            condition: (event) => {
                return event.source === 'github' && 
                       event.type === 'pull_request' &&
                       event.payload?.action === 'opened' &&
                       this.isCodegenPR(event.payload?.pull_request);
            },
            priority: 10,
            handler: 'github_handler',
            metadata: { reason: 'codegen_pr_created' }
        });

        this.addRoutingRule('workflow_failure', {
            condition: (event) => {
                return event.source === 'github' && 
                       event.type === 'workflow_run' &&
                       event.payload?.action === 'completed' &&
                       event.payload?.workflow_run?.conclusion === 'failure';
            },
            priority: 9,
            handler: 'github_handler',
            metadata: { reason: 'workflow_failure' }
        });

        this.addRoutingRule('urgent_issue', {
            condition: (event) => {
                return event.source === 'linear' && 
                       (event.type === 'issue.create' || event.type === 'issue.update') &&
                       event.context?.linear?.issue?.priority >= 1; // High priority
            },
            priority: 9,
            handler: 'linear_handler',
            metadata: { reason: 'urgent_issue' }
        });

        // Context-based rules
        this.addRoutingRule('production_branch', {
            condition: (event) => {
                return event.source === 'github' && 
                       event.type === 'push' &&
                       (event.payload?.ref?.includes('main') || 
                        event.payload?.ref?.includes('master') ||
                        event.payload?.ref?.includes('production'));
            },
            priority: 8,
            handler: 'github_handler',
            metadata: { reason: 'production_branch' }
        });

        this.addRoutingRule('security_related', {
            condition: (event) => {
                const content = JSON.stringify(event.payload).toLowerCase();
                return content.includes('security') || 
                       content.includes('vulnerability') ||
                       content.includes('cve-') ||
                       content.includes('auth') ||
                       content.includes('permission');
            },
            priority: 9,
            handler: 'security_handler',
            metadata: { reason: 'security_related' }
        });
    }

    /**
     * Route an event
     * @param {Object} event - Event to route
     * @returns {Promise<Object>} Routing result
     */
    async routeEvent(event) {
        const startTime = Date.now();
        
        try {
            // Apply routing rules
            const routingDecision = await this.applyRoutingRules(event);
            
            // Update statistics
            this.updateStatistics(routingDecision, Date.now() - startTime);
            
            return routingDecision;

        } catch (error) {
            console.error('Event routing failed:', error);
            
            // Return default routing
            return this.getDefaultRouting(event);
        }
    }

    /**
     * Apply routing rules to event
     * @param {Object} event - Event to route
     * @returns {Promise<Object>} Routing decision
     */
    async applyRoutingRules(event) {
        const routingDecision = {
            eventId: event.id,
            source: event.source,
            type: event.type,
            handler: null,
            priority: this.config.defaultPriority,
            timeout: 30000,
            retryable: true,
            conditions: [],
            metadata: {},
            appliedRules: [],
            routedAt: new Date().toISOString()
        };

        // Check custom routing rules first
        const applicableRules = this.findApplicableRules(event);
        
        if (applicableRules.length > 0) {
            // Apply highest priority rule
            const topRule = applicableRules[0];
            routingDecision.handler = topRule.handler;
            routingDecision.priority = topRule.priority;
            routingDecision.metadata = { ...routingDecision.metadata, ...topRule.metadata };
            routingDecision.appliedRules.push(topRule.name);
        }

        // Apply default route if no custom rules matched
        if (!routingDecision.handler) {
            const defaultRoute = this.getRoute(event.source, event.type);
            if (defaultRoute) {
                routingDecision.handler = defaultRoute.handler;
                routingDecision.priority = defaultRoute.priority;
                routingDecision.timeout = defaultRoute.timeout;
                routingDecision.retryable = defaultRoute.retryable;
                routingDecision.conditions = defaultRoute.conditions;
            }
        }

        // Apply context-based routing adjustments
        if (this.config.enableContextRouting) {
            this.applyContextRouting(event, routingDecision);
        }

        // Apply priority adjustments
        if (this.config.enablePriorityRouting) {
            this.applyPriorityRouting(event, routingDecision);
        }

        // Apply load balancing if enabled
        if (this.config.enableLoadBalancing) {
            this.applyLoadBalancing(event, routingDecision);
        }

        return routingDecision;
    }

    /**
     * Find applicable routing rules for event
     * @param {Object} event - Event to check
     * @returns {Array} Applicable rules sorted by priority
     */
    findApplicableRules(event) {
        const applicableRules = [];

        for (const [name, rule] of this.routingRules) {
            try {
                if (rule.condition(event)) {
                    applicableRules.push({ name, ...rule });
                }
            } catch (error) {
                console.warn(`Routing rule ${name} evaluation failed:`, error);
            }
        }

        // Sort by priority (highest first)
        return applicableRules.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Apply context-based routing adjustments
     * @param {Object} event - Event
     * @param {Object} routingDecision - Routing decision to modify
     */
    applyContextRouting(event, routingDecision) {
        // Adjust based on event context
        if (event.context?.github?.pullRequest) {
            const pr = event.context.github.pullRequest;
            
            // Increase priority for draft PRs ready for review
            if (pr.isDraft === false && event.type === 'pull_request') {
                routingDecision.priority = Math.min(routingDecision.priority + 1, 10);
                routingDecision.metadata.contextAdjustment = 'ready_for_review';
            }

            // Increase priority for PRs with conflicts
            if (pr.hasConflicts) {
                routingDecision.priority = Math.min(routingDecision.priority + 1, 10);
                routingDecision.metadata.contextAdjustment = 'has_conflicts';
            }
        }

        if (event.context?.linear?.issue) {
            const issue = event.context.linear.issue;
            
            // Adjust priority based on Linear issue priority
            if (issue.priority >= 1) { // High priority
                routingDecision.priority = Math.min(routingDecision.priority + 2, 10);
                routingDecision.metadata.contextAdjustment = 'high_priority_issue';
            }
        }
    }

    /**
     * Apply priority-based routing adjustments
     * @param {Object} event - Event
     * @param {Object} routingDecision - Routing decision to modify
     */
    applyPriorityRouting(event, routingDecision) {
        // Time-based priority adjustments
        const eventAge = Date.now() - new Date(event.timestamp).getTime();
        const ageInMinutes = eventAge / (1000 * 60);

        // Increase priority for older events
        if (ageInMinutes > 30) {
            routingDecision.priority = Math.min(routingDecision.priority + 1, 10);
            routingDecision.metadata.priorityAdjustment = 'aged_event';
        }

        // Business hours adjustment
        const now = new Date();
        const hour = now.getHours();
        const isBusinessHours = hour >= 9 && hour <= 17;

        if (!isBusinessHours) {
            // Lower priority for non-business hours unless urgent
            if (routingDecision.priority < 8) {
                routingDecision.priority = Math.max(routingDecision.priority - 1, 1);
                routingDecision.metadata.priorityAdjustment = 'non_business_hours';
            }
        }
    }

    /**
     * Apply load balancing
     * @param {Object} event - Event
     * @param {Object} routingDecision - Routing decision to modify
     */
    applyLoadBalancing(event, routingDecision) {
        // Simple round-robin or least-loaded handler selection
        // This would integrate with actual handler load metrics
        routingDecision.metadata.loadBalancing = 'applied';
    }

    /**
     * Add a route
     * @param {string} source - Event source
     * @param {string} type - Event type
     * @param {Object} config - Route configuration
     */
    addRoute(source, type, config) {
        const routeKey = `${source}:${type}`;
        this.routes.set(routeKey, {
            source,
            type,
            ...config,
            addedAt: new Date().toISOString()
        });
    }

    /**
     * Get route for event
     * @param {string} source - Event source
     * @param {string} type - Event type
     * @returns {Object|null} Route configuration
     */
    getRoute(source, type) {
        const routeKey = `${source}:${type}`;
        return this.routes.get(routeKey) || this.routes.get(`${source}:*`) || null;
    }

    /**
     * Add routing rule
     * @param {string} name - Rule name
     * @param {Object} rule - Rule configuration
     */
    addRoutingRule(name, rule) {
        this.routingRules.set(name, {
            ...rule,
            addedAt: new Date().toISOString()
        });
    }

    /**
     * Remove routing rule
     * @param {string} name - Rule name
     * @returns {boolean} True if removed
     */
    removeRoutingRule(name) {
        return this.routingRules.delete(name);
    }

    /**
     * Get default routing for event
     * @param {Object} event - Event
     * @returns {Object} Default routing decision
     */
    getDefaultRouting(event) {
        return {
            eventId: event.id,
            source: event.source,
            type: event.type,
            handler: 'default_handler',
            priority: this.config.defaultPriority,
            timeout: 30000,
            retryable: true,
            conditions: [],
            metadata: { reason: 'default_routing' },
            appliedRules: [],
            routedAt: new Date().toISOString()
        };
    }

    /**
     * Check if PR is created by Codegen
     * @param {Object} pr - Pull request object
     * @returns {boolean} True if Codegen PR
     */
    isCodegenPR(pr) {
        if (!pr) return false;

        // Check author
        if (pr.user?.login?.includes('codegen')) {
            return true;
        }

        // Check branch name
        if (pr.head?.ref?.startsWith('codegen/') || 
            pr.head?.ref?.startsWith('codegen-')) {
            return true;
        }

        // Check PR title or body for Codegen mentions
        const title = pr.title?.toLowerCase() || '';
        const body = pr.body?.toLowerCase() || '';
        
        return title.includes('codegen') || body.includes('@codegen');
    }

    /**
     * Update routing statistics
     * @param {Object} routingDecision - Routing decision
     * @param {number} routingTime - Time taken to route
     */
    updateStatistics(routingDecision, routingTime) {
        this.statistics.eventsRouted++;
        this.statistics.totalRoutingTime += routingTime;
        this.statistics.averageRoutingTime = this.statistics.totalRoutingTime / this.statistics.eventsRouted;

        // Track routing decisions
        const decisionKey = `${routingDecision.source}:${routingDecision.type}:${routingDecision.handler}`;
        const currentCount = this.statistics.routingDecisions.get(decisionKey) || 0;
        this.statistics.routingDecisions.set(decisionKey, currentCount + 1);
    }

    /**
     * Get routing statistics
     * @returns {Object} Routing statistics
     */
    getStatistics() {
        return {
            eventsRouted: this.statistics.eventsRouted,
            averageRoutingTime: this.statistics.averageRoutingTime,
            routingDecisions: Object.fromEntries(this.statistics.routingDecisions),
            registeredRoutes: this.routes.size,
            registeredRules: this.routingRules.size,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get health status
     * @returns {Promise<string>} Health status
     */
    async getHealth() {
        try {
            // Check if routing is taking too long
            if (this.statistics.averageRoutingTime > 1000) { // More than 1 second
                return 'degraded';
            }

            // Check if routes are configured
            if (this.routes.size === 0) {
                return 'unhealthy';
            }

            return 'healthy';
        } catch (error) {
            return 'unhealthy';
        }
    }

    /**
     * Get all routes
     * @returns {Array} All configured routes
     */
    getAllRoutes() {
        return Array.from(this.routes.entries()).map(([key, route]) => ({
            key,
            ...route
        }));
    }

    /**
     * Get all routing rules
     * @returns {Array} All configured routing rules
     */
    getAllRoutingRules() {
        return Array.from(this.routingRules.entries()).map(([name, rule]) => ({
            name,
            priority: rule.priority,
            handler: rule.handler,
            metadata: rule.metadata,
            addedAt: rule.addedAt
        }));
    }
}

export default EventRouter;

