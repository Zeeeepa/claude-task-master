/**
 * Security Framework Usage Examples
 * Comprehensive examples demonstrating all security framework capabilities
 */

import SecurityFramework from './index.js';
import express from 'express';

/**
 * Basic Security Framework Setup
 */
async function basicSetup() {
    console.log('🔐 Setting up Security Framework...');
    
    const security = new SecurityFramework({
        enableAuth: true,
        enableRBAC: true,
        enableInputValidation: true,
        enableEncryption: true,
        enableAuditLogging: true,
        enableVulnerabilityScanning: true,
        
        auth: {
            jwtSecret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
            jwtExpiresIn: '24h',
            mfaRequired: false,
            sessionTimeout: 30 * 60 * 1000, // 30 minutes
            maxLoginAttempts: 5,
            lockoutDuration: 15 * 60 * 1000 // 15 minutes
        },
        
        rbac: {
            strictMode: true,
            inheritanceEnabled: true,
            cacheTimeout: 5 * 60 * 1000 // 5 minutes
        },
        
        encryption: {
            algorithm: 'aes-256-gcm',
            enableKeyRotation: true,
            keyRotationInterval: 30 * 24 * 60 * 60 * 1000 // 30 days
        },
        
        auditLogger: {
            logLevel: 'info',
            enableConsoleOutput: true,
            enableFileOutput: true,
            logDirectory: './logs/security'
        },
        
        vulnerabilityScanner: {
            enableContinuousScanning: true,
            scanInterval: 24 * 60 * 60 * 1000, // 24 hours
            scanners: ['npm-audit', 'static-analysis']
        }
    });

    // Initialize the framework
    await security.initializeComponents();
    
    console.log('✅ Security Framework initialized successfully');
    return security;
}

/**
 * Authentication Examples
 */
async function authenticationExamples(security) {
    console.log('\n🔑 Authentication Examples');
    
    const authManager = security.getAuthManager();
    
    try {
        // Example 1: User Authentication
        console.log('1. Authenticating user...');
        const authResult = await security.authenticateUser(
            'admin',
            'admin123',
            null, // No MFA token for this example
            {
                ip: '127.0.0.1',
                userAgent: 'Example-Client/1.0'
            }
        );
        
        console.log('✅ Authentication successful:', {
            userId: authResult.user.id,
            username: authResult.user.username,
            roles: authResult.user.roles,
            sessionId: authResult.session.id
        });
        
        // Example 2: Token Verification
        console.log('2. Verifying token...');
        const decoded = await authManager.verifyToken(authResult.tokens.accessToken);
        console.log('✅ Token verified:', {
            userId: decoded.userId,
            username: decoded.username,
            roles: decoded.roles
        });
        
        // Example 3: API Key Creation
        console.log('3. Creating API key...');
        const apiKey = await authManager.createApiKey(
            authResult.user.id,
            'Service Integration Key',
            ['api:read', 'api:write', 'tasks:read']
        );
        console.log('✅ API key created:', {
            id: apiKey.id,
            name: apiKey.name,
            permissions: apiKey.permissions
        });
        
        return { authResult, apiKey };
        
    } catch (error) {
        console.error('❌ Authentication error:', error.message);
        throw error;
    }
}

/**
 * Authorization Examples
 */
async function authorizationExamples(security, authResult) {
    console.log('\n🛡️ Authorization Examples');
    
    const rbac = security.getRBACController();
    const userId = authResult.user.id;
    
    try {
        // Example 1: Check Basic Permission
        console.log('1. Checking basic permission...');
        const canReadTasks = await security.checkPermission(
            userId,
            'tasks:read'
        );
        console.log(`✅ Can read tasks: ${canReadTasks}`);
        
        // Example 2: Check Resource-Specific Permission
        console.log('2. Checking resource-specific permission...');
        const canWriteSpecificTask = await security.checkPermission(
            userId,
            'tasks:write',
            'tasks:123',
            { userId, ip: '127.0.0.1' }
        );
        console.log(`✅ Can write to task 123: ${canWriteSpecificTask}`);
        
        // Example 3: Get User Permissions
        console.log('3. Getting user permissions...');
        const userPermissions = await rbac.getUserPermissions(userId);
        console.log('✅ User permissions:', userPermissions.slice(0, 5), '...');
        
        // Example 4: Create Custom Role
        console.log('4. Creating custom role...');
        const customRole = await rbac.createRole({
            id: 'data_analyst',
            name: 'Data Analyst',
            description: 'Read-only access to data and reports',
            permissions: ['tasks:read', 'cicd:read', 'api:read'],
            inherits: ['user']
        }, userId);
        console.log('✅ Custom role created:', customRole.name);
        
    } catch (error) {
        console.error('❌ Authorization error:', error.message);
    }
}

/**
 * Input Validation Examples
 */
async function inputValidationExamples(security) {
    console.log('\n🔍 Input Validation Examples');
    
    try {
        // Example 1: Valid User Input
        console.log('1. Validating valid user input...');
        const validUserData = await security.validateInput({
            username: 'john_doe',
            email: 'john@example.com',
            firstName: 'John',
            lastName: 'Doe'
        }, 'user');
        console.log('✅ Valid user data:', validUserData);
        
        // Example 2: Valid Task Input
        console.log('2. Validating valid task input...');
        const validTaskData = await security.validateInput({
            title: 'Implement new feature',
            description: 'Add user authentication to the system',
            priority: 'high',
            status: 'pending',
            tags: ['authentication', 'security', 'backend']
        }, 'task');
        console.log('✅ Valid task data:', validTaskData);
        
        // Example 3: Invalid Input (will throw error)
        console.log('3. Validating invalid input...');
        try {
            await security.validateInput({
                username: 'a', // Too short
                email: 'invalid-email',
                password: '123' // Too short
            }, 'user');
        } catch (validationError) {
            console.log('✅ Validation correctly caught errors:', 
                validationError.violations.map(v => v.violation));
        }
        
        // Example 4: Security Pattern Detection
        console.log('4. Testing security pattern detection...');
        try {
            await security.validateInput({
                comment: '<script>alert("xss")</script>',
                query: "'; DROP TABLE users; --"
            }, 'api');
        } catch (securityError) {
            console.log('✅ Security patterns detected:', 
                securityError.violations.map(v => v.violation));
        }
        
    } catch (error) {
        console.error('❌ Input validation error:', error.message);
    }
}

/**
 * Encryption Examples
 */
async function encryptionExamples(security) {
    console.log('\n🔒 Encryption Examples');
    
    try {
        // Example 1: Basic Data Encryption
        console.log('1. Encrypting sensitive data...');
        const sensitiveData = 'This is confidential information';
        const encrypted = await security.encryptData(sensitiveData);
        console.log('✅ Data encrypted:', {
            algorithm: encrypted.algorithm,
            keyVersion: encrypted.keyVersion,
            dataLength: encrypted.data.length
        });
        
        // Example 2: Data Decryption
        console.log('2. Decrypting data...');
        const decrypted = await security.decryptData(encrypted);
        console.log('✅ Data decrypted successfully:', decrypted === sensitiveData);
        
        // Example 3: Password Hashing
        console.log('3. Hashing password...');
        const encryptionService = security.getEncryptionService();
        const hashedPassword = await encryptionService.hashData('user_password_123');
        console.log('✅ Password hashed:', {
            algorithm: hashedPassword.algorithm,
            iterations: hashedPassword.iterations
        });
        
        // Example 4: Password Verification
        console.log('4. Verifying password...');
        const isValidPassword = await encryptionService.verifyHash('user_password_123', hashedPassword);
        console.log('✅ Password verification:', isValidPassword);
        
        // Example 5: Generate Secure Token
        console.log('5. Generating secure token...');
        const secureToken = encryptionService.generateSecureToken({
            length: 32,
            prefix: 'tok_',
            includeTimestamp: true
        });
        console.log('✅ Secure token generated:', secureToken.substring(0, 20) + '...');
        
    } catch (error) {
        console.error('❌ Encryption error:', error.message);
    }
}

/**
 * Audit Logging Examples
 */
async function auditLoggingExamples(security) {
    console.log('\n📊 Audit Logging Examples');
    
    const auditLogger = security.getAuditLogger();
    
    try {
        // Example 1: Log Security Event
        console.log('1. Logging security events...');
        await security.logSecurityEvent('USER_ACTION', {
            action: 'file_download',
            userId: 'user_123',
            fileName: 'sensitive_document.pdf',
            ip: '192.168.1.100'
        });
        
        await security.logSecurityEvent('SYSTEM_CHANGE', {
            component: 'security_config',
            change: 'password_policy_updated',
            changedBy: 'admin_user'
        }, 'warn');
        
        console.log('✅ Security events logged');
        
        // Example 2: Log Critical Event
        console.log('2. Logging critical security event...');
        await security.logSecurityEvent('SECURITY_INCIDENT', {
            type: 'suspicious_activity',
            description: 'Multiple failed login attempts from unusual location',
            severity: 'high',
            affectedUser: 'user_456',
            sourceIP: '203.0.113.1'
        }, 'critical');
        
        console.log('✅ Critical event logged');
        
        // Example 3: Get Audit Statistics
        console.log('3. Getting audit statistics...');
        const auditStats = auditLogger.getAuditStats();
        console.log('✅ Audit stats:', {
            bufferSize: auditStats.bufferSize,
            uptime: Math.round(auditStats.uptime) + 's'
        });
        
    } catch (error) {
        console.error('❌ Audit logging error:', error.message);
    }
}

/**
 * Vulnerability Scanning Examples
 */
async function vulnerabilityScanningExamples(security) {
    console.log('\n🔍 Vulnerability Scanning Examples');
    
    const scanner = security.getVulnerabilityScanner();
    
    try {
        // Example 1: Run Quick Security Scan
        console.log('1. Running security scan...');
        const scanResults = await scanner.runScan({
            scanners: ['static-analysis'], // Quick scan for demo
            targetDirectory: './src'
        });
        
        console.log('✅ Scan completed:', {
            scanId: scanResults.scanId,
            duration: scanResults.duration + 'ms',
            vulnerabilitiesFound: scanResults.vulnerabilities.length,
            riskScore: scanResults.summary.riskScore
        });
        
        // Example 2: Get Scan History
        console.log('2. Getting scan history...');
        const scanHistory = scanner.getScanHistory(3);
        console.log('✅ Recent scans:', scanHistory.map(scan => ({
            id: scan.scanId,
            status: scan.status,
            vulnerabilities: scan.vulnerabilities.length
        })));
        
        // Example 3: Get Vulnerability Database
        console.log('3. Getting vulnerability database...');
        const vulnerabilities = scanner.getVulnerabilities({ severity: 'high' });
        console.log('✅ High severity vulnerabilities:', vulnerabilities.length);
        
        // Example 4: Scanner Statistics
        console.log('4. Getting scanner statistics...');
        const scannerStats = scanner.getScannerStats();
        console.log('✅ Scanner stats:', {
            totalScans: scannerStats.totalScans,
            totalVulnerabilities: scannerStats.totalVulnerabilities,
            enabledScanners: scannerStats.enabledScanners.map(s => s.name)
        });
        
    } catch (error) {
        console.error('❌ Vulnerability scanning error:', error.message);
    }
}

/**
 * Express.js Integration Example
 */
async function expressIntegrationExample(security) {
    console.log('\n🌐 Express.js Integration Example');
    
    const app = express();
    const securityMiddleware = security.getSecurityMiddleware();
    
    // Apply global security middleware
    app.use(express.json());
    app.use(...securityMiddleware.getAllMiddleware());
    
    // Public endpoint
    app.get('/api/health', (req, res) => {
        res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });
    
    // JWT protected endpoint
    app.get('/api/profile',
        ...securityMiddleware.createRouteMiddleware({
            auth: 'jwt',
            permission: 'users:read'
        }),
        (req, res) => {
            res.json({
                user: req.user,
                message: 'Profile data retrieved successfully'
            });
        }
    );
    
    // API key protected endpoint with input validation
    app.post('/api/tasks',
        ...securityMiddleware.createRouteMiddleware({
            auth: 'api_key',
            permission: 'tasks:write',
            validateInput: 'task'
        }),
        (req, res) => {
            res.json({
                message: 'Task created successfully',
                task: req.body
            });
        }
    );
    
    // Admin only endpoint
    app.get('/api/admin/users',
        ...securityMiddleware.createRouteMiddleware({
            auth: 'jwt',
            permission: 'users:read',
            resource: 'admin'
        }),
        (req, res) => {
            res.json({
                users: [
                    { id: '1', username: 'admin', roles: ['admin'] },
                    { id: '2', username: 'user', roles: ['user'] }
                ]
            });
        }
    );
    
    // File upload endpoint with validation
    app.post('/api/upload',
        ...securityMiddleware.createRouteMiddleware({
            auth: 'jwt',
            permission: 'files:write',
            validateFile: true
        }),
        (req, res) => {
            res.json({
                message: 'File uploaded successfully',
                file: req.file
            });
        }
    );
    
    // Error handling
    app.use(securityMiddleware.handleErrors());
    
    console.log('✅ Express.js security integration configured');
    
    // Start server for demo (comment out in production)
    // const server = app.listen(3000, () => {
    //     console.log('🚀 Secure server running on http://localhost:3000');
    // });
    
    return app;
}

/**
 * Security Status and Reporting Examples
 */
async function securityStatusExamples(security) {
    console.log('\n📊 Security Status and Reporting Examples');
    
    try {
        // Example 1: Get Security Status
        console.log('1. Getting security status...');
        const status = await security.getSecurityStatus();
        console.log('✅ Security status:', {
            initialized: status.framework.initialized,
            components: status.framework.components,
            activeSessions: status.authentication?.activeSessions || 0,
            totalRoles: status.authorization?.totalRoles || 0,
            riskScore: status.vulnerabilities?.totalVulnerabilities || 0
        });
        
        // Example 2: Perform Health Check
        console.log('2. Performing health check...');
        const healthCheck = await security.performHealthCheck();
        console.log('✅ Health check:', {
            status: healthCheck.status,
            components: Object.keys(healthCheck.components),
            issues: healthCheck.issues.length
        });
        
        // Example 3: Generate Security Report
        console.log('3. Generating security report...');
        const report = await security.generateSecurityReport();
        console.log('✅ Security report generated:', {
            generatedAt: report.generatedAt,
            recommendations: report.recommendations.length,
            frameworkStatus: report.framework.framework.initialized
        });
        
    } catch (error) {
        console.error('❌ Security status error:', error.message);
    }
}

/**
 * Event Handling Examples
 */
async function eventHandlingExamples(security) {
    console.log('\n🔔 Event Handling Examples');
    
    // Set up event listeners
    security.on('userAuthenticated', (data) => {
        console.log('🔑 User authenticated:', data.user.username);
    });
    
    security.on('authenticationFailed', (data) => {
        console.log('❌ Authentication failed for:', data.username);
    });
    
    security.on('criticalSecurityEvent', (event) => {
        console.log('🚨 Critical security event:', event.eventType);
        // In production, this would trigger alerts, notifications, etc.
    });
    
    security.on('scanCompleted', (results) => {
        console.log('🔍 Security scan completed:', results.scanId);
    });
    
    security.on('keyRotated', (data) => {
        console.log('🔄 Encryption key rotated:', data.newVersion);
    });
    
    console.log('✅ Event listeners configured');
}

/**
 * Main Example Runner
 */
async function runAllExamples() {
    try {
        console.log('🚀 Starting Security Framework Examples\n');
        
        // 1. Basic Setup
        const security = await basicSetup();
        
        // 2. Set up event handling
        await eventHandlingExamples(security);
        
        // 3. Authentication Examples
        const { authResult, apiKey } = await authenticationExamples(security);
        
        // 4. Authorization Examples
        await authorizationExamples(security, authResult);
        
        // 5. Input Validation Examples
        await inputValidationExamples(security);
        
        // 6. Encryption Examples
        await encryptionExamples(security);
        
        // 7. Audit Logging Examples
        await auditLoggingExamples(security);
        
        // 8. Vulnerability Scanning Examples
        await vulnerabilityScanningExamples(security);
        
        // 9. Express.js Integration
        const app = await expressIntegrationExample(security);
        
        // 10. Security Status and Reporting
        await securityStatusExamples(security);
        
        console.log('\n✅ All examples completed successfully!');
        console.log('\n📚 Security Framework is ready for production use.');
        console.log('📖 See README.md for detailed documentation.');
        
        // Clean up
        await security.destroy();
        
    } catch (error) {
        console.error('\n❌ Example execution failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

/**
 * Individual Example Functions for Testing
 */
export {
    basicSetup,
    authenticationExamples,
    authorizationExamples,
    inputValidationExamples,
    encryptionExamples,
    auditLoggingExamples,
    vulnerabilityScanningExamples,
    expressIntegrationExample,
    securityStatusExamples,
    eventHandlingExamples,
    runAllExamples
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAllExamples().catch(console.error);
}

