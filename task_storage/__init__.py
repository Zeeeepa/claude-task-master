"""
PostgreSQL Task Storage and Context Engine
Foundation for AI-driven task management with comprehensive context preservation

This module provides:
- Core task storage with PostgreSQL backend
- Comprehensive context preservation for AI interactions
- Advanced dependency management
- Performance monitoring and analytics
- Mock implementations for testing
"""

from .task_storage import (
    # Core classes
    AtomicTask,
    TaskContext,
    AIInteraction,
    ValidationResult,
    CodebaseContext,
    TaskStorage,
    ContextStorage,
    DatabaseManager,
    DatabaseConfig,
    
    # Enums
    TaskStatus,
    TaskPriority,
    DependencyType,
    InteractionType
)

from .core_functions import (
    # Async functions
    initialize_database,
    close_database,
    create_task_tables,
    store_atomic_task,
    retrieve_task_by_id,
    update_task_status,
    get_pending_tasks,
    store_task_context,
    get_task_full_context,
    store_ai_interaction,
    get_task_dependencies,
    mark_task_completed,
    get_ready_tasks,
    add_task_dependency,
    store_validation_result,
    get_codebase_context,
    store_codebase_context,
    get_task_summary,
    get_task_metrics,
    
    # Sync functions
    create_task_tables_sync,
    store_atomic_task_sync,
    retrieve_task_by_id_sync,
    update_task_status_sync,
    get_pending_tasks_sync,
    store_task_context_sync,
    get_task_full_context_sync,
    store_ai_interaction_sync,
    get_task_dependencies_sync,
    mark_task_completed_sync
)

from .mock_implementations import (
    MockTaskStorage,
    MockContextStorage,
    MockDatabaseManager,
    generate_mock_task,
    generate_mock_ai_interaction,
    generate_mock_validation_result,
    run_mock_scenario_basic_workflow,
    run_mock_scenario_complex_dependencies
)

__version__ = "1.0.0"
__author__ = "Codegen Task Storage Team"
__description__ = "PostgreSQL Task Storage and Context Engine for AI-driven development"

# Export all public interfaces
__all__ = [
    # Core classes
    "AtomicTask",
    "TaskContext", 
    "AIInteraction",
    "ValidationResult",
    "CodebaseContext",
    "TaskStorage",
    "ContextStorage",
    "DatabaseManager",
    "DatabaseConfig",
    
    # Enums
    "TaskStatus",
    "TaskPriority",
    "DependencyType",
    "InteractionType",
    
    # Async functions
    "initialize_database",
    "close_database",
    "create_task_tables",
    "store_atomic_task",
    "retrieve_task_by_id",
    "update_task_status",
    "get_pending_tasks",
    "store_task_context",
    "get_task_full_context",
    "store_ai_interaction",
    "get_task_dependencies",
    "mark_task_completed",
    "get_ready_tasks",
    "add_task_dependency",
    "store_validation_result",
    "get_codebase_context",
    "store_codebase_context",
    "get_task_summary",
    "get_task_metrics",
    
    # Sync functions
    "create_task_tables_sync",
    "store_atomic_task_sync",
    "retrieve_task_by_id_sync",
    "update_task_status_sync",
    "get_pending_tasks_sync",
    "store_task_context_sync",
    "get_task_full_context_sync",
    "store_ai_interaction_sync",
    "get_task_dependencies_sync",
    "mark_task_completed_sync",
    
    # Mock implementations
    "MockTaskStorage",
    "MockContextStorage", 
    "MockDatabaseManager",
    "generate_mock_task",
    "generate_mock_ai_interaction",
    "generate_mock_validation_result",
    "run_mock_scenario_basic_workflow",
    "run_mock_scenario_complex_dependencies"
]

