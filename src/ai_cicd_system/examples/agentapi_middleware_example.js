/**
 * AgentAPI Middleware Integration Example
 * 
 * This example demonstrates how to use the AgentAPI middleware
 * for PR deployment and validation with Claude Code integration.
 */

import { 
    createAICICDSystem,
    AgentAPIMiddleware,
    ClaudeCodeIntegration,
    WSL2Manager,
    AgentSessionManager
} from '../index.js';

/**
 * Example: Complete PR deployment and validation workflow
 */
async function prDeploymentExample() {
    console.log('🚀 Starting PR Deployment Example');
    
    // Configuration for the middleware
    const config = {
        agentapi: {
            baseURL: process.env.AGENTAPI_URL || 'http://localhost:8000',
            timeout: 60000,
            retryAttempts: 3,
            logLevel: 'info'
        },
        wsl2: {
            maxInstances: 3,
            instanceTimeout: 3600000, // 1 hour
            resourceLimits: {
                memory: '8GB',
                cpu: 4,
                disk: '50GB'
            },
            logLevel: 'info'
        },
        claudeCode: {
            model: 'claude-3-sonnet-20240229',
            maxTokens: 4096,
            temperature: 0.1,
            logLevel: 'info'
        },
        validation: {
            runTests: true,
            runLinting: true,
            runSecurity: true,
            testTimeout: 300000
        }
    };

    try {
        // Create and initialize the AI CI/CD system
        const system = await createAICICDSystem(config);
        
        // Example PR data (would come from GitHub webhook)
        const prData = {
            number: 123,
            title: 'Add new feature for user authentication',
            body: 'This PR adds JWT-based authentication with proper validation and error handling.',
            head: {
                ref: 'feature/auth-system',
                sha: 'abc123def456'
            },
            repository: {
                clone_url: 'https://github.com/example/repo.git',
                name: 'example-repo'
            },
            files: [
                { filename: 'package.json' },
                { filename: 'src/auth/jwt.js' },
                { filename: 'src/auth/middleware.js' },
                { filename: 'tests/auth.test.js' }
            ],
            additions: 245,
            deletions: 12
        };

        // Deploy and validate the PR
        console.log('📦 Deploying and validating PR...');
        const deployment = await system.deployAndValidatePR(prData, {
            gitCredentials: {
                username: process.env.GITHUB_USERNAME,
                token: process.env.GITHUB_TOKEN
            }
        });

        console.log('✅ Deployment completed:', {
            id: deployment.id,
            status: deployment.status,
            duration: deployment.completedAt - deployment.createdAt,
            steps: deployment.steps.length
        });

        // Display validation results
        if (deployment.results) {
            console.log('\n📊 Validation Results:');
            console.log('Tests:', deployment.results.tests?.success ? '✅ PASS' : '❌ FAIL');
            console.log('Linting:', deployment.results.linting?.success ? '✅ PASS' : '❌ FAIL');
            console.log('Security:', deployment.results.security?.success ? '✅ PASS' : '❌ FAIL');
            console.log('Code Review:', deployment.results.codeReview?.success ? '✅ PASS' : '❌ FAIL');
            console.log('Performance:', deployment.results.performance?.success ? '✅ PASS' : '❌ FAIL');
        }

        // Display report summary
        if (deployment.report) {
            console.log('\n📋 Report Summary:');
            console.log('Risk Level:', deployment.report.riskLevel.toUpperCase());
            console.log('Recommendations:', deployment.report.recommendations.length);
            
            if (deployment.report.recommendations.length > 0) {
                console.log('\n💡 Recommendations:');
                deployment.report.recommendations.forEach((rec, index) => {
                    console.log(`${index + 1}. ${rec}`);
                });
            }
        }

        // Cleanup
        await system.shutdown();
        console.log('🏁 Example completed successfully');

    } catch (error) {
        console.error('❌ Example failed:', error.message);
        throw error;
    }
}

/**
 * Example: Direct middleware usage
 */
async function directMiddlewareExample() {
    console.log('🔧 Starting Direct Middleware Example');

    const config = {
        agentapi: {
            baseURL: 'http://localhost:8000',
            logLevel: 'debug'
        },
        wsl2: {
            maxInstances: 2,
            logLevel: 'debug'
        },
        claudeCode: {
            model: 'claude-3-sonnet-20240229',
            logLevel: 'debug'
        }
    };

    try {
        // Create middleware directly
        const middleware = new AgentAPIMiddleware(config);
        await middleware.initialize();

        // Create a WSL2 instance
        console.log('🖥️ Creating WSL2 instance...');
        const instance = await middleware.createWSL2Instance({
            metadata: {
                purpose: 'example-testing',
                project: 'middleware-demo'
            }
        });

        console.log('✅ WSL2 instance created:', instance.id);

        // Deploy some example code
        console.log('📁 Deploying code to instance...');
        await middleware.deployCodeToInstance(instance.id, {
            repository: {
                url: 'https://github.com/example/simple-node-app.git',
                branch: 'main'
            },
            setupCommands: [
                'npm install',
                'npm run build'
            ]
        });

        console.log('✅ Code deployed successfully');

        // Create an agent session
        console.log('🤖 Creating Claude Code session...');
        const session = await middleware.createAgentSession('claude', {
            model: 'claude-3-sonnet-20240229',
            metadata: {
                instanceId: instance.id,
                purpose: 'code-review'
            }
        });

        console.log('✅ Agent session created:', session.id);

        // Send a message to the agent
        console.log('💬 Sending message to agent...');
        const response = await middleware.sendMessageToSession(
            session.id,
            'Please analyze the code in /workspace/repo and provide a summary of the project structure and any potential issues you find.'
        );

        console.log('📝 Agent response:', response.content?.substring(0, 200) + '...');

        // Get system statistics
        const stats = middleware.getSystemStatistics();
        console.log('\n📈 System Statistics:');
        console.log('Active Sessions:', stats.system.activeSessions);
        console.log('Active Instances:', stats.system.activeInstances);
        console.log('Total Requests:', stats.system.totalRequests);

        // Cleanup
        console.log('🧹 Cleaning up...');
        await middleware.stopAgentSession(session.id);
        await middleware.destroyInstance(instance.id);
        await middleware.shutdown();

        console.log('🏁 Direct middleware example completed');

    } catch (error) {
        console.error('❌ Direct middleware example failed:', error.message);
        throw error;
    }
}

/**
 * Example: Session management
 */
async function sessionManagementExample() {
    console.log('👥 Starting Session Management Example');

    const config = {
        sessionManager: {
            maxSessions: 5,
            sessionTimeout: 1800000, // 30 minutes
            logLevel: 'info'
        },
        agentapi: {
            baseURL: 'http://localhost:8000'
        }
    };

    try {
        // Create session manager
        const sessionManager = new AgentSessionManager(config);
        await sessionManager.initialize();

        // Create multiple agent sessions
        console.log('🚀 Creating multiple agent sessions...');
        
        const sessions = [];
        const agentTypes = ['claude', 'goose', 'aider'];
        
        for (const agentType of agentTypes) {
            const session = await sessionManager.createSession(agentType, {
                metadata: {
                    purpose: 'example-testing',
                    created_by: 'session-management-example'
                }
            });
            sessions.push(session);
            console.log(`✅ Created ${agentType} session: ${session.id}`);
        }

        // Send messages to sessions
        console.log('💬 Sending messages to sessions...');
        for (const session of sessions) {
            try {
                const response = await sessionManager.sendMessage(
                    session.id,
                    `Hello! This is a test message for ${session.type} agent.`
                );
                console.log(`📝 Response from ${session.type}:`, response.content?.substring(0, 100) + '...');
            } catch (error) {
                console.log(`❌ Failed to send message to ${session.type}:`, error.message);
            }
        }

        // Get session statistics
        const stats = sessionManager.getStatistics();
        console.log('\n📊 Session Statistics:');
        console.log('Total Sessions:', stats.totalSessions);
        console.log('Active Sessions:', stats.activeSessions);
        console.log('Sessions by Type:', stats.sessionsByType);
        console.log('Total Messages:', stats.totalMessages);

        // Monitor session health
        console.log('🏥 Checking session health...');
        for (const session of sessions) {
            try {
                const status = await sessionManager.getSessionStatus(session.id);
                console.log(`${session.type} session health:`, status.isHealthy ? '✅ Healthy' : '❌ Unhealthy');
            } catch (error) {
                console.log(`❌ Failed to check ${session.type} health:`, error.message);
            }
        }

        // Cleanup all sessions
        console.log('🧹 Cleaning up sessions...');
        for (const session of sessions) {
            try {
                await sessionManager.stopSession(session.id, 'example-cleanup');
                console.log(`✅ Stopped ${session.type} session`);
            } catch (error) {
                console.log(`❌ Failed to stop ${session.type} session:`, error.message);
            }
        }

        await sessionManager.cleanup();
        console.log('🏁 Session management example completed');

    } catch (error) {
        console.error('❌ Session management example failed:', error.message);
        throw error;
    }
}

/**
 * Example: WSL2 instance management
 */
async function wsl2ManagementExample() {
    console.log('🖥️ Starting WSL2 Management Example');

    const config = {
        maxInstances: 3,
        instanceTimeout: 1800000, // 30 minutes
        resourceLimits: {
            memory: '4GB',
            cpu: 2,
            disk: '20GB'
        },
        logLevel: 'info'
    };

    try {
        // Create WSL2 manager
        const wsl2Manager = new WSL2Manager(config);
        await wsl2Manager.initialize();

        // Create multiple instances
        console.log('🚀 Creating WSL2 instances...');
        
        const instances = [];
        for (let i = 1; i <= 2; i++) {
            const instance = await wsl2Manager.createInstance({
                metadata: {
                    purpose: `example-instance-${i}`,
                    project: 'wsl2-demo'
                }
            });
            instances.push(instance);
            console.log(`✅ Created instance ${i}: ${instance.id}`);
        }

        // Deploy code to instances
        console.log('📦 Deploying code to instances...');
        for (const [index, instance] of instances.entries()) {
            await wsl2Manager.deployCode(instance.id, {
                files: {
                    'hello.js': `console.log('Hello from instance ${index + 1}!');`,
                    'package.json': JSON.stringify({
                        name: `example-app-${index + 1}`,
                        version: '1.0.0',
                        main: 'hello.js'
                    }, null, 2)
                },
                setupCommands: [
                    'node hello.js'
                ]
            });
            console.log(`✅ Code deployed to instance ${index + 1}`);
        }

        // Monitor instance status
        console.log('📊 Monitoring instance status...');
        for (const [index, instance] of instances.entries()) {
            try {
                const status = await wsl2Manager.getInstanceStatus(instance.id);
                console.log(`Instance ${index + 1} status:`, {
                    id: status.id,
                    status: status.status,
                    isRunning: status.isRunning,
                    uptime: Math.round(status.uptime / 1000) + 's'
                });
            } catch (error) {
                console.log(`❌ Failed to get status for instance ${index + 1}:`, error.message);
            }
        }

        // Get manager statistics
        const stats = wsl2Manager.getStatistics();
        console.log('\n📈 WSL2 Manager Statistics:');
        console.log('Total Instances:', stats.totalInstances);
        console.log('Running Instances:', stats.runningInstances);
        console.log('Max Instances:', stats.maxInstances);

        // Cleanup instances
        console.log('🧹 Cleaning up instances...');
        for (const [index, instance] of instances.entries()) {
            try {
                await wsl2Manager.destroyInstance(instance.id);
                console.log(`✅ Destroyed instance ${index + 1}`);
            } catch (error) {
                console.log(`❌ Failed to destroy instance ${index + 1}:`, error.message);
            }
        }

        await wsl2Manager.cleanup();
        console.log('🏁 WSL2 management example completed');

    } catch (error) {
        console.error('❌ WSL2 management example failed:', error.message);
        throw error;
    }
}

/**
 * Run all examples
 */
async function runAllExamples() {
    console.log('🎯 Running All AgentAPI Middleware Examples\n');

    const examples = [
        { name: 'PR Deployment', fn: prDeploymentExample },
        { name: 'Direct Middleware', fn: directMiddlewareExample },
        { name: 'Session Management', fn: sessionManagementExample },
        { name: 'WSL2 Management', fn: wsl2ManagementExample }
    ];

    for (const example of examples) {
        try {
            console.log(`\n${'='.repeat(50)}`);
            console.log(`🔄 Running ${example.name} Example`);
            console.log(`${'='.repeat(50)}\n`);
            
            await example.fn();
            
            console.log(`\n✅ ${example.name} Example completed successfully`);
        } catch (error) {
            console.error(`\n❌ ${example.name} Example failed:`, error.message);
            console.error('Stack trace:', error.stack);
        }
        
        // Wait between examples
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('\n🎉 All examples completed!');
}

// Export examples for individual use
export {
    prDeploymentExample,
    directMiddlewareExample,
    sessionManagementExample,
    wsl2ManagementExample,
    runAllExamples
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(error => {
        console.error('❌ Examples failed:', error);
        process.exit(1);
    });
}

