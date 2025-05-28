/**
 * @fileoverview Integration Framework Module
 * @description Main entry point for the component integration framework
 */

export { IntegrationFramework } from './integration-framework.js';
export { ServiceRegistry } from './service-registry.js';
export { HealthMonitor } from './health-monitor.js';
export { ConfigManager } from './config-manager.js';
export { EventBus } from './event-bus.js';

// Re-export default as main framework
export { IntegrationFramework as default } from './integration-framework.js';

/**
 * Create and initialize a complete integration framework
 * @param {Object} config - Framework configuration
 * @returns {Promise<IntegrationFramework>} Initialized framework
 */
export async function createIntegrationFramework(config = {}) {
	const { IntegrationFramework } = await import('./integration-framework.js');
	const framework = new IntegrationFramework(config);
	await framework.initialize();
	return framework;
}

/**
 * Framework version
 */
export const VERSION = '1.0.0';

/**
 * Framework metadata
 */
export const METADATA = {
	name: 'Component Integration Framework',
	version: VERSION,
	description:
		'Comprehensive component integration framework for AI CI/CD systems',
	features: [
		'Service Discovery',
		'Health Monitoring',
		'Configuration Management',
		'Event-Driven Communication',
		'Circuit Breaker Pattern',
		'Rate Limiting',
		'Load Balancing',
		'Hot Configuration Reloading'
	],
	author: 'AI CI/CD Development Team',
	license: 'MIT'
};
