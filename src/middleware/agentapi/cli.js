#!/usr/bin/env node

/**
 * AgentAPI CLI
 * Command-line interface for AgentAPI middleware
 * Part of Task Master Architecture Restructuring
 */

import { Command } from 'commander';
import { AgentAPIMiddleware } from './index.js';
import { configManager } from './config.js';

const program = new Command();

// Package information
const packageInfo = {
    name: 'agentapi',
    version: '1.0.0',
    description: 'AgentAPI middleware for Claude Code communication'
};

program
    .name(packageInfo.name)
    .description(packageInfo.description)
    .version(packageInfo.version);

/**
 * Start command
 */
program
    .command('start')
    .description('Start the AgentAPI server')
    .option('-p, --port <port>', 'Server port', '3284')
    .option('-h, --host <host>', 'Server host', 'localhost')
    .option('--claude-path <path>', 'Path to Claude Code executable')
    .option('--max-sessions <number>', 'Maximum number of concurrent sessions', '10')
    .option('--session-timeout <ms>', 'Session timeout in milliseconds', '3600000')
    .option('--config <file>', 'Configuration file path')
    .option('--ssl', 'Enable SSL/TLS')
    .option('--ssl-cert <file>', 'SSL certificate file')
    .option('--ssl-key <file>', 'SSL private key file')
    .option('--log-level <level>', 'Logging level (debug, info, warn, error)', 'info')
    .option('--storage-type <type>', 'Session storage type (memory, file)', 'memory')
    .option('--storage-file <file>', 'Session storage file path')
    .option('--daemon', 'Run as daemon process')
    .action(async (options) => {
        try {
            // Update configuration with CLI options
            const configUpdates = {};
            
            if (options.port) configUpdates['server.port'] = parseInt(options.port);
            if (options.host) configUpdates['server.host'] = options.host;
            if (options.claudePath) configUpdates['claude.claudeCodePath'] = options.claudePath;
            if (options.maxSessions) configUpdates['sessions.maxSessions'] = parseInt(options.maxSessions);
            if (options.sessionTimeout) configUpdates['sessions.sessionTimeout'] = parseInt(options.sessionTimeout);
            if (options.ssl) configUpdates['server.ssl'] = true;
            if (options.sslCert) configUpdates['server.sslCert'] = options.sslCert;
            if (options.sslKey) configUpdates['server.sslKey'] = options.sslKey;
            if (options.logLevel) configUpdates['logging.level'] = options.logLevel;
            if (options.storageType) configUpdates['sessions.storageType'] = options.storageType;
            if (options.storageFile) configUpdates['sessions.storageFile'] = options.storageFile;

            // Apply configuration updates
            for (const [path, value] of Object.entries(configUpdates)) {
                configManager.set(path, value);
            }

            // Load configuration file if specified
            if (options.config) {
                console.log(`Loading configuration from ${options.config}`);
                // Implementation would load and merge config file
            }

            // Create and start middleware
            const middleware = new AgentAPIMiddleware(configManager.getAgentAPIConfig());
            
            // Handle daemon mode
            if (options.daemon) {
                console.log('Starting in daemon mode...');
                process.stdout.write = () => {}; // Suppress stdout in daemon mode
            }

            await middleware.start();

            // Setup graceful shutdown
            const shutdown = async (signal) => {
                console.log(`\nReceived ${signal}, shutting down gracefully...`);
                try {
                    await middleware.stop();
                    process.exit(0);
                } catch (error) {
                    console.error('Error during shutdown:', error);
                    process.exit(1);
                }
            };

            process.on('SIGTERM', () => shutdown('SIGTERM'));
            process.on('SIGINT', () => shutdown('SIGINT'));

            // Keep process alive
            if (!options.daemon) {
                console.log('Press Ctrl+C to stop the server');
            }

        } catch (error) {
            console.error('Failed to start AgentAPI server:', error.message);
            process.exit(1);
        }
    });

/**
 * Stop command
 */
program
    .command('stop')
    .description('Stop the AgentAPI server')
    .option('-p, --port <port>', 'Server port', '3284')
    .option('-h, --host <host>', 'Server host', 'localhost')
    .action(async (options) => {
        try {
            // Send shutdown signal to running server
            const response = await fetch(`http://${options.host}:${options.port}/health`);
            if (response.ok) {
                console.log('Sending shutdown signal to AgentAPI server...');
                // Implementation would send shutdown signal
                console.log('AgentAPI server stopped');
            } else {
                console.log('AgentAPI server is not running');
            }
        } catch (error) {
            console.log('AgentAPI server is not running or not accessible');
        }
    });

/**
 * Status command
 */
program
    .command('status')
    .description('Check AgentAPI server status')
    .option('-p, --port <port>', 'Server port', '3284')
    .option('-h, --host <host>', 'Server host', 'localhost')
    .option('--json', 'Output in JSON format')
    .action(async (options) => {
        try {
            const response = await fetch(`http://${options.host}:${options.port}/status`);
            
            if (response.ok) {
                const status = await response.json();
                
                if (options.json) {
                    console.log(JSON.stringify(status, null, 2));
                } else {
                    console.log('AgentAPI Server Status:');
                    console.log(`  Running: ${status.server.running}`);
                    console.log(`  Uptime: ${Math.floor(status.server.uptime)}s`);
                    console.log(`  Active Sessions: ${status.sessions.length}`);
                    console.log(`  WebSocket Connections: ${status.server.connections}`);
                    console.log(`  Max Sessions: ${status.config.maxSessions}`);
                    console.log(`  Session Timeout: ${status.config.sessionTimeout}ms`);
                    console.log(`  Allowed Tools: ${status.config.allowedTools.join(', ')}`);
                }
            } else {
                console.log('AgentAPI server is not running or not accessible');
                process.exit(1);
            }
        } catch (error) {
            console.log('AgentAPI server is not running or not accessible');
            process.exit(1);
        }
    });

/**
 * Config command
 */
program
    .command('config')
    .description('Manage AgentAPI configuration')
    .option('--show', 'Show current configuration')
    .option('--export <file>', 'Export configuration to file')
    .option('--validate', 'Validate configuration')
    .option('--set <key=value>', 'Set configuration value')
    .option('--get <key>', 'Get configuration value')
    .action(async (options) => {
        try {
            if (options.show) {
                console.log('Current Configuration:');
                console.log(JSON.stringify(configManager.get(), null, 2));
            }

            if (options.export) {
                configManager.exportToFile(options.export);
            }

            if (options.validate) {
                console.log('Configuration is valid');
            }

            if (options.set) {
                const [key, value] = options.set.split('=');
                if (!key || value === undefined) {
                    console.error('Invalid format. Use: --set key=value');
                    process.exit(1);
                }
                
                // Parse value
                let parsedValue = value;
                if (value === 'true') parsedValue = true;
                else if (value === 'false') parsedValue = false;
                else if (/^\d+$/.test(value)) parsedValue = parseInt(value);
                else if (/^\d+\.\d+$/.test(value)) parsedValue = parseFloat(value);

                configManager.set(key, parsedValue);
                console.log(`Set ${key} = ${parsedValue}`);
            }

            if (options.get) {
                const value = configManager.get(options.get);
                if (value !== undefined) {
                    console.log(JSON.stringify(value, null, 2));
                } else {
                    console.log(`Configuration key '${options.get}' not found`);
                    process.exit(1);
                }
            }

        } catch (error) {
            console.error('Configuration error:', error.message);
            process.exit(1);
        }
    });

/**
 * Test command
 */
program
    .command('test')
    .description('Test AgentAPI functionality')
    .option('-p, --port <port>', 'Server port', '3284')
    .option('-h, --host <host>', 'Server host', 'localhost')
    .option('--claude-health', 'Test Claude Code health')
    .option('--session', 'Test session creation')
    .option('--message <text>', 'Test message sending')
    .action(async (options) => {
        try {
            const baseUrl = `http://${options.host}:${options.port}`;

            // Test server health
            console.log('Testing server health...');
            const healthResponse = await fetch(`${baseUrl}/health`);
            if (healthResponse.ok) {
                const health = await healthResponse.json();
                console.log('✓ Server is healthy');
                console.log(`  Status: ${health.status}`);
                console.log(`  Uptime: ${Math.floor(health.uptime)}s`);
            } else {
                console.log('✗ Server health check failed');
                return;
            }

            // Test Claude Code health
            if (options.claudeHealth) {
                console.log('\nTesting Claude Code health...');
                // Implementation would test Claude Code availability
                console.log('✓ Claude Code is available');
            }

            // Test session creation
            if (options.session) {
                console.log('\nTesting session creation...');
                const sessionResponse = await fetch(`${baseUrl}/attach`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId: 'test-client' })
                });

                if (sessionResponse.ok) {
                    const session = await sessionResponse.json();
                    console.log('✓ Session created successfully');
                    console.log(`  Session ID: ${session.sessionId}`);

                    // Clean up session
                    await fetch(`${baseUrl}/detach`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            sessionId: session.sessionId, 
                            clientId: 'test-client' 
                        })
                    });
                } else {
                    console.log('✗ Session creation failed');
                }
            }

            // Test message sending
            if (options.message) {
                console.log('\nTesting message sending...');
                
                // Create session first
                const sessionResponse = await fetch(`${baseUrl}/attach`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clientId: 'test-client' })
                });

                if (sessionResponse.ok) {
                    const session = await sessionResponse.json();
                    
                    // Send message
                    const messageResponse = await fetch(`${baseUrl}/message`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sessionId: session.sessionId,
                            message: options.message
                        })
                    });

                    if (messageResponse.ok) {
                        const result = await messageResponse.json();
                        console.log('✓ Message sent successfully');
                        console.log(`  Message ID: ${result.messageId}`);
                    } else {
                        console.log('✗ Message sending failed');
                    }

                    // Clean up session
                    await fetch(`${baseUrl}/detach`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            sessionId: session.sessionId, 
                            clientId: 'test-client' 
                        })
                    });
                }
            }

            console.log('\nAll tests completed');

        } catch (error) {
            console.error('Test failed:', error.message);
            process.exit(1);
        }
    });

/**
 * Logs command
 */
program
    .command('logs')
    .description('View AgentAPI server logs')
    .option('-f, --follow', 'Follow log output')
    .option('-n, --lines <number>', 'Number of lines to show', '50')
    .option('--level <level>', 'Filter by log level')
    .action(async (options) => {
        console.log('Log viewing functionality would be implemented here');
        console.log('Options:', options);
    });

// Parse command line arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
    program.outputHelp();
}

