/**
 * @fileoverview Type definitions for codegen integration system
 * Provides comprehensive type definitions for task management, prompt generation, and PR tracking
 */

/**
 * @typedef {Object} AtomicTask
 * @property {string} id - Unique task identifier
 * @property {string} title - Task title
 * @property {string} description - Detailed task description
 * @property {string} type - Task type (implementation, bug_fix, feature, refactor, etc.)
 * @property {string[]} requirements - List of specific requirements
 * @property {string[]} acceptance_criteria - Acceptance criteria for completion
 * @property {string[]} affected_files - Files that may be affected by this task
 * @property {number} priority - Task priority (1-5, 5 being highest)
 * @property {string} status - Current task status
 * @property {Object} metadata - Additional task metadata
 */

/**
 * @typedef {Object} TaskContext
 * @property {string} project_name - Name of the project
 * @property {string} repository_url - Repository URL
 * @property {string} base_branch - Base branch for PR creation
 * @property {CodebaseContext} codebase_context - Relevant codebase information
 * @property {string[]} dependencies - Task dependencies
 * @property {Object} environment - Environment configuration
 */

/**
 * @typedef {Object} CodebaseContext
 * @property {string} language - Primary programming language
 * @property {string} framework - Framework being used
 * @property {string[]} key_files - Important files for context
 * @property {Object} file_structure - Relevant file structure
 * @property {string[]} coding_standards - Coding standards to follow
 * @property {string[]} test_patterns - Testing patterns and requirements
 */

/**
 * @typedef {Object} CodegenPrompt
 * @property {string} content - The formatted prompt content
 * @property {string} task_id - Associated task ID
 * @property {string} task_type - Type of task for this prompt
 * @property {Object} metadata - Additional prompt metadata
 * @property {number} estimated_complexity - Complexity estimate (1-10)
 * @property {string[]} validation_requirements - Requirements for validation
 */

/**
 * @typedef {Object} CodegenResponse
 * @property {string} request_id - Unique request identifier
 * @property {string} status - Response status (success, error, pending)
 * @property {PRInfo|null} pr_info - PR information if successful
 * @property {string|null} error_message - Error message if failed
 * @property {Object} metadata - Additional response metadata
 * @property {number} timestamp - Response timestamp
 */

/**
 * @typedef {Object} PRInfo
 * @property {string} pr_url - URL of the created PR
 * @property {number} pr_number - PR number
 * @property {string} branch_name - Branch name for the PR
 * @property {string} title - PR title
 * @property {string} description - PR description
 * @property {string[]} modified_files - List of modified files
 * @property {string} status - PR status (open, closed, merged)
 */

/**
 * @typedef {Object} CodegenStatus
 * @property {string} request_id - Request identifier
 * @property {string} status - Current status (pending, processing, completed, failed)
 * @property {number} progress - Progress percentage (0-100)
 * @property {string|null} error_message - Error message if applicable
 * @property {number} estimated_completion - Estimated completion time
 */

/**
 * @typedef {Object} PRStatus
 * @property {string} task_id - Associated task ID
 * @property {string} pr_url - PR URL
 * @property {number} pr_number - PR number
 * @property {string} status - Current PR status
 * @property {Object[]} checks - CI/CD check results
 * @property {string[]} review_comments - Review comments
 * @property {boolean} is_mergeable - Whether PR can be merged
 */

/**
 * @typedef {Object} PromptTemplate
 * @property {string} name - Template name
 * @property {string} type - Task type this template is for
 * @property {string} template - Template string with placeholders
 * @property {string[]} required_fields - Required fields for this template
 * @property {Object} default_values - Default values for optional fields
 */

/**
 * Task types supported by the system
 */
export const TASK_TYPES = {
    IMPLEMENTATION: 'implementation',
    BUG_FIX: 'bug_fix',
    FEATURE: 'feature',
    REFACTOR: 'refactor',
    DOCUMENTATION: 'documentation',
    TESTING: 'testing',
    OPTIMIZATION: 'optimization',
    SECURITY: 'security'
};

/**
 * Codegen request statuses
 */
export const CODEGEN_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRYING: 'retrying'
};

/**
 * PR statuses
 */
export const PR_STATUS = {
    OPEN: 'open',
    CLOSED: 'closed',
    MERGED: 'merged',
    DRAFT: 'draft'
};

export default {
    TASK_TYPES,
    CODEGEN_STATUS,
    PR_STATUS
};

