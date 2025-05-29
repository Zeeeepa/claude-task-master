#!/usr/bin/env node

/**
 * @fileoverview Component Analysis and Testing
 * @description Analyze if all components from PRs 13-17 are properly implemented
 */

// Simple logging function
function log(level, message) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
}

/**
 * Component Analysis Class
 */
class ComponentAnalysis {
    constructor() {
        this.results = {
            components: {},
            imports: {},
            functionality: {},
            integration: {}
        };
    }

    /**
     * Analyze component implementation
     */
    async analyzeComponents() {
        console.log('🔬 Component Analysis: Verifying PR 13-17 Implementation');
        console.log('=' .repeat(70));

        try {
            // Test 1: Check if main system can be imported
            await this.testMainSystemImport();
            
            // Test 2: Check component creation
            await this.testComponentCreation();
            
            // Test 3: Test basic functionality
            await this.testBasicFunctionality();
            
            // Test 4: Test with provided Codegen credentials
            await this.testCodegenIntegration();
            
            // Generate report
            this.generateReport();
            
        } catch (error) {
            console.error('❌ Analysis failed:', error.message);
            throw error;
        }
    }

    /**
     * Test main system import
     */
    async testMainSystemImport() {
        console.log('\n📦 Testing Main System Import');
        console.log('-' .repeat(40));

        try {
            // Try to import the main system
            const { AICICDSystem, createAICICDSystem, processRequirement } = await import('../src/ai_cicd_system/index.js');
            
            console.log('✅ Main system imports successful');
            console.log('   - AICICDSystem class available');
            console.log('   - createAICICDSystem factory available');
            console.log('   - processRequirement function available');
            
            this.results.imports.mainSystem = true;
            
            // Test system creation
            const system = new AICICDSystem({
                mode: 'development',
                database: { enable_mock: true },
                codegen: { enable_mock: true },
                validation: { enable_mock: true }
            });
            
            console.log('✅ System instance created successfully');
            this.results.imports.systemCreation = true;
            
            return { AICICDSystem, createAICICDSystem, processRequirement };
            
        } catch (error) {
            console.error('❌ Main system import failed:', error.message);
            this.results.imports.mainSystem = false;
            this.results.imports.error = error.message;
            throw error;
        }
    }

    /**
     * Test component creation and initialization
     */
    async testComponentCreation() {
        console.log('\n🧩 Testing Component Creation');
        console.log('-' .repeat(40));

        try {
            const { createAICICDSystem } = await import('../src/ai_cicd_system/index.js');
            
            const system = await createAICICDSystem({
                mode: 'development',
                database: { enable_mock: true },
                codegen: { enable_mock: true },
                validation: { enable_mock: true }
            });

            console.log('✅ System initialized successfully');

            // Check expected components from PRs 13-17
            const expectedComponents = [
                'requirementProcessor',  // PR 14
                'taskStorage',          // PR 15
                'codegenIntegrator',    // PR 13
                'validationEngine',     // PR 16
                'workflowOrchestrator', // PR 17
                'contextManager',       // Unified
                'systemMonitor'         // Unified
            ];

            let foundComponents = 0;
            for (const componentName of expectedComponents) {
                const component = system.components.get(componentName);
                if (component) {
                    console.log(`   ✅ ${componentName}: Found`);
                    foundComponents++;
                    this.results.components[componentName] = true;
                } else {
                    console.log(`   ❌ ${componentName}: Missing`);
                    this.results.components[componentName] = false;
                }
            }

            console.log(`\nComponent Discovery: ${foundComponents}/${expectedComponents.length} found`);
            
            await system.shutdown();
            return foundComponents === expectedComponents.length;

        } catch (error) {
            console.error('❌ Component creation failed:', error.message);
            this.results.components.error = error.message;
            return false;
        }
    }

    /**
     * Test basic functionality
     */
    async testBasicFunctionality() {
        console.log('\n⚙️  Testing Basic Functionality');
        console.log('-' .repeat(40));

        try {
            const { processRequirement } = await import('../src/ai_cicd_system/index.js');

            console.log('Testing basic requirement processing...');
            const startTime = Date.now();
            
            const result = await processRequirement(
                'Create a simple REST API for user management with basic CRUD operations',
                {
                    mode: 'development',
                    database: { enable_mock: true },
                    codegen: { enable_mock: true },
                    validation: { enable_mock: true }
                }
            );

            const duration = Date.now() - startTime;
            
            console.log(`✅ Basic workflow completed in ${duration}ms`);
            console.log(`   Status: ${result.status}`);
            console.log(`   Tasks generated: ${result.tasks?.length || 0}`);
            console.log(`   Codegen results: ${result.codegen_results?.length || 0}`);
            console.log(`   Validation results: ${result.validation_results?.length || 0}`);

            this.results.functionality.basicWorkflow = {
                success: true,
                duration: duration,
                tasksGenerated: result.tasks?.length || 0,
                codegenResults: result.codegen_results?.length || 0,
                validationResults: result.validation_results?.length || 0
            };

            return true;

        } catch (error) {
            console.error('❌ Basic functionality test failed:', error.message);
            this.results.functionality.basicWorkflow = {
                success: false,
                error: error.message
            };
            return false;
        }
    }

    /**
     * Test Codegen integration with provided credentials
     */
    async testCodegenIntegration() {
        console.log('\n🤖 Testing Codegen Integration');
        console.log('-' .repeat(40));
        console.log('Using provided credentials for real API testing...');

        try {
            const { createAICICDSystem } = await import('../src/ai_cicd_system/index.js');

            // Test with real Codegen API using provided credentials
            const system = await createAICICDSystem({
                mode: 'production',
                database: { enable_mock: true },
                codegen: {
                    enable_mock: false,
                    api_key: "sk-ce027fa7-3c8d-4beb-8c86-ed8ae982ac99",
                    api_url: "https://api.codegen.sh",
                    timeout: 60000
                },
                validation: { enable_mock: true }
            });

            console.log('✅ System configured with real Codegen API');

            // Test a simple requirement
            const testRequirement = `
                Create a simple Node.js function that calculates the factorial of a number.
                
                Requirements:
                - Function should be named 'factorial'
                - Accept a single number parameter
                - Return the factorial result
                - Handle edge cases (0, negative numbers)
                - Include basic JSDoc documentation
                
                Context:
                - Language: JavaScript/Node.js
                - File: src/math-utils.js
                - Testing: Include a simple test case
            `;

            console.log('Sending request to Codegen API...');
            const startTime = Date.now();
            
            const result = await system.processRequirement(testRequirement);
            const duration = Date.now() - startTime;

            console.log(`✅ Codegen API integration completed in ${duration}ms`);
            console.log(`   Status: ${result.status}`);
            
            if (result.codegen_results && result.codegen_results.length > 0) {
                for (const codegenResult of result.codegen_results) {
                    console.log(`   Request status: ${codegenResult.status}`);
                    if (codegenResult.pr_info) {
                        console.log(`   📝 PR URL: ${codegenResult.pr_info.pr_url}`);
                        console.log(`   🌿 Branch: ${codegenResult.pr_info.branch_name}`);
                    }
                }
            }

            this.results.integration.codegenAPI = {
                success: true,
                duration: duration,
                apiUsed: true,
                result: result
            };

            await system.shutdown();
            return true;

        } catch (error) {
            console.error('❌ Codegen integration test failed:', error.message);
            console.log('   This could be due to API limits, network issues, or credential problems');
            
            this.results.integration.codegenAPI = {
                success: false,
                error: error.message,
                apiUsed: true
            };
            return false;
        }
    }

    /**
     * Generate comprehensive report
     */
    generateReport() {
        console.log('\n📊 COMPREHENSIVE ANALYSIS REPORT');
        console.log('=' .repeat(70));

        // Import Analysis
        console.log('\n📦 IMPORT ANALYSIS');
        console.log('-' .repeat(30));
        if (this.results.imports.mainSystem) {
            console.log('✅ Main system imports: SUCCESS');
        } else {
            console.log('❌ Main system imports: FAILED');
            if (this.results.imports.error) {
                console.log(`   Error: ${this.results.imports.error}`);
            }
        }

        // Component Analysis
        console.log('\n🧩 COMPONENT ANALYSIS');
        console.log('-' .repeat(30));
        
        const componentNames = Object.keys(this.results.components);
        const foundComponents = componentNames.filter(name => this.results.components[name] === true).length;
        const totalComponents = componentNames.length;
        
        console.log(`Components found: ${foundComponents}/${totalComponents}`);
        
        for (const [name, found] of Object.entries(this.results.components)) {
            if (name !== 'error') {
                console.log(`   ${found ? '✅' : '❌'} ${name}: ${found ? 'IMPLEMENTED' : 'MISSING'}`);
            }
        }

        if (this.results.components.error) {
            console.log(`   Error: ${this.results.components.error}`);
        }

        // Functionality Analysis
        console.log('\n⚙️  FUNCTIONALITY ANALYSIS');
        console.log('-' .repeat(30));
        
        if (this.results.functionality.basicWorkflow) {
            const workflow = this.results.functionality.basicWorkflow;
            if (workflow.success) {
                console.log('✅ Basic workflow: SUCCESS');
                console.log(`   Duration: ${workflow.duration}ms`);
                console.log(`   Tasks generated: ${workflow.tasksGenerated}`);
                console.log(`   Codegen results: ${workflow.codegenResults}`);
                console.log(`   Validation results: ${workflow.validationResults}`);
            } else {
                console.log('❌ Basic workflow: FAILED');
                console.log(`   Error: ${workflow.error}`);
            }
        }

        // Integration Analysis
        console.log('\n🔗 INTEGRATION ANALYSIS');
        console.log('-' .repeat(30));
        
        if (this.results.integration.codegenAPI) {
            const integration = this.results.integration.codegenAPI;
            if (integration.success) {
                console.log('✅ Codegen API integration: SUCCESS');
                console.log(`   Duration: ${integration.duration}ms`);
                console.log('   Real API credentials worked successfully');
            } else {
                console.log('⚠️  Codegen API integration: FAILED');
                console.log(`   Error: ${integration.error}`);
                console.log('   Note: This may be due to API limits or network issues');
            }
        }

        // Overall Assessment
        console.log('\n🎯 OVERALL ASSESSMENT');
        console.log('-' .repeat(30));
        
        const score = this.calculateOverallScore();
        console.log(`Overall Implementation Score: ${score.toFixed(1)}/100`);
        
        if (score >= 90) {
            console.log('🟢 EXCELLENT: All components properly implemented');
        } else if (score >= 75) {
            console.log('🟡 GOOD: Most components implemented, minor issues');
        } else if (score >= 50) {
            console.log('🟠 FAIR: Significant implementation gaps');
        } else {
            console.log('🔴 POOR: Major implementation issues');
        }

        // Specific PR Analysis
        console.log('\n📋 PR IMPLEMENTATION STATUS');
        console.log('-' .repeat(30));
        
        const prComponents = {
            'PR 13 (Codegen Integration)': ['codegenIntegrator'],
            'PR 14 (Requirement Analyzer)': ['requirementProcessor'],
            'PR 15 (Task Storage)': ['taskStorage'],
            'PR 16 (Claude Code Validation)': ['validationEngine'],
            'PR 17 (Workflow Orchestration)': ['workflowOrchestrator']
        };

        for (const [prName, components] of Object.entries(prComponents)) {
            const implemented = components.every(comp => this.results.components[comp] === true);
            console.log(`   ${implemented ? '✅' : '❌'} ${prName}: ${implemented ? 'IMPLEMENTED' : 'MISSING/INCOMPLETE'}`);
        }

        // Recommendations
        console.log('\n💡 RECOMMENDATIONS');
        console.log('-' .repeat(30));
        
        if (foundComponents < totalComponents) {
            console.log('• Complete implementation of missing components');
        }
        
        if (this.results.integration.codegenAPI && !this.results.integration.codegenAPI.success) {
            console.log('• Verify Codegen API credentials and connectivity');
        }
        
        if (score < 90) {
            console.log('• Review and fix component integration issues');
            console.log('• Add comprehensive error handling');
        }
        
        console.log('• Consider adding more integration tests');
        console.log('• Implement comprehensive logging and monitoring');

        console.log('\n✅ Component Analysis Complete!');
        console.log('=' .repeat(70));
    }

    /**
     * Calculate overall implementation score
     */
    calculateOverallScore() {
        let score = 0;
        let maxScore = 0;

        // Import success (20 points)
        if (this.results.imports.mainSystem) score += 20;
        maxScore += 20;

        // Component implementation (40 points)
        const componentNames = Object.keys(this.results.components).filter(name => name !== 'error');
        if (componentNames.length > 0) {
            const foundComponents = componentNames.filter(name => this.results.components[name] === true).length;
            score += (foundComponents / componentNames.length) * 40;
        }
        maxScore += 40;

        // Basic functionality (25 points)
        if (this.results.functionality.basicWorkflow?.success) score += 25;
        maxScore += 25;

        // Integration (15 points)
        if (this.results.integration.codegenAPI?.success) score += 15;
        maxScore += 15;

        return (score / maxScore) * 100;
    }
}

/**
 * Main execution
 */
async function runComponentAnalysis() {
    const analysis = new ComponentAnalysis();
    
    try {
        await analysis.analyzeComponents();
        return analysis;
    } catch (error) {
        console.error('❌ Component analysis failed:', error);
        throw error;
    }
}

// Run analysis if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runComponentAnalysis().catch(error => {
        console.error('Analysis execution failed:', error);
        process.exit(1);
    });
}

export { ComponentAnalysis, runComponentAnalysis };

