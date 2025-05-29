/**
 * Migration: Seed Prompt Templates for CI/CD Operations
 * Created: 2025-05-29T02:27:00.000Z
 */

export async function up(db) {
    // Insert prompt templates for various CI/CD operations
    const templates = [
        {
            name: 'pr_validation_request',
            description: 'Template for requesting PR validation from Claude Code via AgentAPI',
            template_type: 'validation',
            content: `Please analyze the following pull request and provide comprehensive validation:

**Project**: {{project_name}}
**PR**: #{{pr_number}} - {{pr_title}}
**Branch**: {{branch_name}} → {{base_branch}}
**Files Changed**: {{files_changed}}

**Validation Requirements**:
1. Code quality and best practices
2. Security vulnerabilities
3. Performance implications
4. Test coverage
5. Documentation completeness
6. Breaking changes analysis

**Context**:
{{pr_description}}

**Additional Instructions**:
- Focus on {{validation_focus}} if specified
- Consider project-specific requirements: {{project_requirements}}
- Provide actionable feedback with specific line numbers
- Suggest improvements where applicable

Please provide your analysis in the following format:
- Overall Score: X/10
- Critical Issues: [list]
- Recommendations: [list]
- Files to Review: [list]`,
            variables: ['project_name', 'pr_number', 'pr_title', 'branch_name', 'base_branch', 'files_changed', 'pr_description', 'validation_focus', 'project_requirements']
        },
        {
            name: 'error_analysis_request',
            description: 'Template for requesting error analysis and fix suggestions',
            template_type: 'error_analysis',
            content: `Please analyze the following CI/CD pipeline error and provide fix recommendations:

**Project**: {{project_name}}
**Pipeline**: {{pipeline_type}}
**Step**: {{failed_step}}
**Branch**: {{branch_name}}

**Error Details**:
```
{{error_message}}
```

**Pipeline Output**:
```
{{pipeline_output}}
```

**Context**:
- Commit SHA: {{commit_sha}}
- Previous successful run: {{last_success_sha}}
- Recent changes: {{recent_changes}}

**Analysis Required**:
1. Root cause identification
2. Immediate fix suggestions
3. Prevention strategies
4. Related code areas to check

Please provide:
- Diagnosis: [explanation]
- Fix Commands: [specific commands to run]
- Code Changes: [if needed]
- Prevention: [how to avoid this in future]`,
            variables: ['project_name', 'pipeline_type', 'failed_step', 'branch_name', 'error_message', 'pipeline_output', 'commit_sha', 'last_success_sha', 'recent_changes']
        },
        {
            name: 'code_generation_request',
            description: 'Template for requesting code generation from Codegen',
            template_type: 'code_generation',
            content: `Generate code for the following task:

**Project**: {{project_name}}
**Task**: {{task_title}}
**Type**: {{task_type}}
**Priority**: {{task_priority}}

**Requirements**:
{{task_description}}

**Technical Specifications**:
- Framework: {{framework}}
- Language: {{language}}
- Dependencies: {{dependencies}}
- Architecture: {{architecture_pattern}}

**Constraints**:
- Follow project coding standards: {{coding_standards}}
- Maintain compatibility with: {{compatibility_requirements}}
- Performance requirements: {{performance_requirements}}
- Security considerations: {{security_requirements}}

**Deliverables**:
1. Implementation code
2. Unit tests
3. Documentation
4. Migration scripts (if needed)

**Context Files**:
{{context_files}}

Please ensure the generated code:
- Follows the existing project structure
- Includes proper error handling
- Has comprehensive test coverage
- Is well-documented
- Follows security best practices`,
            variables: ['project_name', 'task_title', 'task_type', 'task_priority', 'task_description', 'framework', 'language', 'dependencies', 'architecture_pattern', 'coding_standards', 'compatibility_requirements', 'performance_requirements', 'security_requirements', 'context_files']
        },
        {
            name: 'deployment_validation',
            description: 'Template for validating deployment readiness',
            template_type: 'deployment',
            content: `Validate deployment readiness for the following:

**Project**: {{project_name}}
**Environment**: {{environment_name}}
**Branch**: {{branch_name}}
**Commit**: {{commit_sha}}

**Deployment Checklist**:
1. All tests passing: {{tests_status}}
2. Security scan: {{security_status}}
3. Performance benchmarks: {{performance_status}}
4. Database migrations: {{migration_status}}
5. Environment variables: {{env_vars_status}}
6. Dependencies updated: {{deps_status}}

**Pre-deployment Validation**:
- Check for breaking changes
- Verify rollback procedures
- Validate configuration
- Test deployment scripts
- Review monitoring setup

**Environment Configuration**:
{{environment_config}}

**Deployment Strategy**: {{deployment_strategy}}

Please confirm:
- Deployment is safe to proceed
- Any risks or concerns
- Recommended deployment time
- Rollback plan if needed`,
            variables: ['project_name', 'environment_name', 'branch_name', 'commit_sha', 'tests_status', 'security_status', 'performance_status', 'migration_status', 'env_vars_status', 'deps_status', 'environment_config', 'deployment_strategy']
        },
        {
            name: 'task_breakdown_request',
            description: 'Template for requesting task breakdown and planning',
            template_type: 'planning',
            content: `Break down the following requirement into actionable tasks:

**Project**: {{project_name}}
**Feature**: {{feature_name}}
**Epic**: {{epic_title}}

**Requirements**:
{{requirements_description}}

**Acceptance Criteria**:
{{acceptance_criteria}}

**Technical Context**:
- Current architecture: {{current_architecture}}
- Technology stack: {{tech_stack}}
- Team size: {{team_size}}
- Timeline: {{timeline}}
- Dependencies: {{dependencies}}

**Constraints**:
- Budget: {{budget_constraints}}
- Performance: {{performance_constraints}}
- Security: {{security_constraints}}
- Compliance: {{compliance_requirements}}

Please provide:
1. Task breakdown with estimates
2. Dependency mapping
3. Risk assessment
4. Implementation order
5. Testing strategy
6. Documentation requirements

**Output Format**:
- Task ID, Title, Description, Estimate, Dependencies
- Critical path analysis
- Risk mitigation strategies`,
            variables: ['project_name', 'feature_name', 'epic_title', 'requirements_description', 'acceptance_criteria', 'current_architecture', 'tech_stack', 'team_size', 'timeline', 'dependencies', 'budget_constraints', 'performance_constraints', 'security_constraints', 'compliance_requirements']
        },
        {
            name: 'agentapi_session_init',
            description: 'Template for initializing AgentAPI session with Claude Code',
            template_type: 'agentapi',
            content: `Initialize Claude Code session for CI/CD operation:

**Operation**: {{operation_type}}
**Project**: {{project_name}}
**Session ID**: {{session_id}}

**Claude Code Configuration**:
- Working directory: {{working_directory}}
- Allowed tools: {{allowed_tools}}
- Model: {{model_name}}
- Max tokens: {{max_tokens}}

**Environment Setup**:
```bash
cd {{working_directory}}
git fetch origin {{branch_name}}
git checkout {{branch_name}}
{{setup_commands}}
```

**Operation Context**:
{{operation_context}}

**Expected Outputs**:
{{expected_outputs}}

**Success Criteria**:
{{success_criteria}}

Please confirm session initialization and proceed with the operation.`,
            variables: ['operation_type', 'project_name', 'session_id', 'working_directory', 'allowed_tools', 'model_name', 'max_tokens', 'branch_name', 'setup_commands', 'operation_context', 'expected_outputs', 'success_criteria']
        }
    ];

    for (const template of templates) {
        await db.query(`
            INSERT INTO prompt_templates (name, description, template_type, content, variables)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (name) DO UPDATE SET
                description = EXCLUDED.description,
                template_type = EXCLUDED.template_type,
                content = EXCLUDED.content,
                variables = EXCLUDED.variables,
                updated_at = NOW()
        `, [
            template.name,
            template.description,
            template.template_type,
            template.content,
            JSON.stringify(template.variables)
        ]);
    }

    console.log(`✅ Seeded ${templates.length} prompt templates`);
}

export async function down(db) {
    // Remove all seeded prompt templates
    const templateNames = [
        'pr_validation_request',
        'error_analysis_request',
        'code_generation_request',
        'deployment_validation',
        'task_breakdown_request',
        'agentapi_session_init'
    ];

    for (const name of templateNames) {
        await db.query(`DELETE FROM prompt_templates WHERE name = $1`, [name]);
    }

    console.log(`✅ Removed ${templateNames.length} prompt templates`);
}

