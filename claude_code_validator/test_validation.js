#!/usr/bin/env node

/**
 * claude_code_validator/test_validation.js
 * 
 * Simple test script to verify the Claude Code validation system works correctly.
 * This script can be run to validate the implementation and demonstrate functionality.
 */

import { runAllExamples } from './examples/usage_examples.js';
import { healthCheck, validateConfig, DEFAULT_CONFIG } from './index.js';

async function main() {
    console.log('🧪 Claude Code Validator Test Suite');
    console.log('=====================================\n');

    try {
        // 1. Health Check
        console.log('1️⃣ Running Health Check...');
        const health = await healthCheck();
        console.log(`✅ Health Status: ${health.status}`);
        console.log(`📅 Timestamp: ${health.timestamp}`);
        console.log(`🔢 Version: ${health.version}\n`);

        // 2. Configuration Validation
        console.log('2️⃣ Validating Configuration...');
        const config_validation = validateConfig({ ...DEFAULT_CONFIG, use_mock: true });
        console.log(`✅ Config Valid: ${config_validation.valid}`);
        if (config_validation.warnings.length > 0) {
            console.log(`⚠️ Warnings: ${config_validation.warnings.join(', ')}`);
        }
        if (config_validation.errors.length > 0) {
            console.log(`❌ Errors: ${config_validation.errors.join(', ')}`);
        }
        console.log();

        // 3. Run All Examples
        console.log('3️⃣ Running All Examples...');
        const example_results = await runAllExamples();
        
        const success_count = example_results.filter(r => r.status === 'success').length;
        const total_count = example_results.length;
        
        console.log(`\n📊 Test Results: ${success_count}/${total_count} examples passed`);
        
        if (success_count === total_count) {
            console.log('🎉 All tests passed! The validation system is working correctly.');
            process.exit(0);
        } else {
            console.log('⚠️ Some tests failed. Check the output above for details.');
            process.exit(1);
        }

    } catch (error) {
        console.error('❌ Test suite failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the test suite
main().catch(error => {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
});

