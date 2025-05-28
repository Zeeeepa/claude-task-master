"""
Core Task Storage Functions
Implementation of the required interface functions for task lifecycle management
"""

import asyncio
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

from .task_storage import (
    DatabaseManager, DatabaseConfig, TaskStorage, ContextStorage,
    AtomicTask, TaskContext, AIInteraction, ValidationResult, CodebaseContext,
    TaskStatus, TaskPriority, DependencyType, InteractionType
)


# Global database manager instance
_db_manager: Optional[DatabaseManager] = None


async def initialize_database(config: Optional[DatabaseConfig] = None) -> None:
    """Initialize database connection"""
    global _db_manager
    
    if config is None:
        config = DatabaseConfig.from_env()
    
    _db_manager = DatabaseManager(config.connection_string)
    await _db_manager.initialize()


async def close_database() -> None:
    """Close database connection"""
    global _db_manager
    if _db_manager:
        await _db_manager.close()
        _db_manager = None


def get_db_manager() -> DatabaseManager:
    """Get database manager instance"""
    global _db_manager
    if _db_manager is None:
        raise RuntimeError("Database not initialized. Call initialize_database() first.")
    return _db_manager


# Core Functions as specified in requirements
async def create_task_tables() -> None:
    """Create database tables for task storage"""
    db_manager = get_db_manager()
    await db_manager.create_tables()


async def store_atomic_task(task: AtomicTask) -> str:
    """Store atomic task with complete context and metadata"""
    db_manager = get_db_manager()
    task_storage = db_manager.get_task_storage()
    return await task_storage.store_task(task)


async def retrieve_task_by_id(task_id: str) -> Optional[AtomicTask]:
    """Retrieve task by ID"""
    db_manager = get_db_manager()
    task_storage = db_manager.get_task_storage()
    return await task_storage.get_task(task_id)


async def update_task_status(task_id: str, status: str, context: Optional[Dict[str, Any]] = None) -> None:
    """Update task status with optional context"""
    db_manager = get_db_manager()
    task_storage = db_manager.get_task_storage()
    
    # Convert string status to enum
    task_status = TaskStatus(status)
    await task_storage.update_task_status(task_id, task_status, context)


async def get_pending_tasks() -> List[AtomicTask]:
    """Get all pending tasks"""
    db_manager = get_db_manager()
    task_storage = db_manager.get_task_storage()
    return await task_storage.get_tasks_by_status(TaskStatus.PENDING)


async def store_task_context(task_id: str, context_type: str, context_data: Dict[str, Any]) -> None:
    """Store comprehensive context for task"""
    db_manager = get_db_manager()
    task_storage = db_manager.get_task_storage()
    await task_storage.store_task_context(task_id, context_type, context_data)


async def get_task_full_context(task_id: str) -> TaskContext:
    """Get comprehensive task context for AI prompt generation"""
    db_manager = get_db_manager()
    context_storage = db_manager.get_context_storage()
    return await context_storage.get_task_context(task_id)


async def store_ai_interaction(task_id: str, agent: str, interaction: Dict[str, Any]) -> None:
    """Store AI agent interaction"""
    db_manager = get_db_manager()
    context_storage = db_manager.get_context_storage()
    
    # Create AIInteraction object
    ai_interaction = AIInteraction(
        task_id=task_id,
        agent_name=agent,
        interaction_type=InteractionType(interaction.get('type', 'prompt')),
        request_data=interaction.get('request'),
        response_data=interaction.get('response'),
        execution_time_ms=interaction.get('execution_time_ms'),
        success=interaction.get('success', True),
        error_message=interaction.get('error_message'),
        session_id=interaction.get('session_id'),
        parent_interaction_id=interaction.get('parent_interaction_id')
    )
    
    await context_storage.store_ai_interaction(task_id, ai_interaction)


async def get_task_dependencies(task_id: str) -> List[str]:
    """Get task dependencies"""
    db_manager = get_db_manager()
    task_storage = db_manager.get_task_storage()
    return await task_storage.get_task_dependencies(task_id)


async def mark_task_completed(task_id: str, results: Dict[str, Any]) -> None:
    """Mark task as completed with results"""
    db_manager = get_db_manager()
    task_storage = db_manager.get_task_storage()
    
    # Update status to done
    await task_storage.update_task_status(task_id, TaskStatus.DONE, results)
    
    # Store completion context
    completion_context = {
        'completion_time': datetime.now().isoformat(),
        'results': results,
        'status': 'completed'
    }
    await task_storage.store_task_context(task_id, 'completion', completion_context)


# Additional utility functions for enhanced functionality
async def get_ready_tasks() -> List[AtomicTask]:
    """Get tasks that are ready to be worked on (pending with satisfied dependencies)"""
    db_manager = get_db_manager()
    
    async with db_manager.pool.acquire() as conn:
        query = """
        SELECT t.id, t.title, t.description, t.requirements, t.acceptance_criteria,
               t.affected_files, t.complexity_score, t.status, t.priority,
               t.created_at, t.updated_at, t.created_by, t.assigned_to,
               t.estimated_hours, t.actual_hours, t.tags, t.metadata
        FROM ready_tasks t
        ORDER BY t.priority DESC, t.created_at ASC
        """
        
        rows = await conn.fetch(query)
        tasks = []
        
        for row in rows:
            task_data = dict(row)
            
            # Parse JSON fields
            if task_data['requirements']:
                task_data['requirements'] = json.loads(task_data['requirements'])
            if task_data['acceptance_criteria']:
                task_data['acceptance_criteria'] = json.loads(task_data['acceptance_criteria'])
            if task_data['metadata']:
                task_data['metadata'] = json.loads(task_data['metadata'])
            
            # Convert string enums to enum objects
            task_data['status'] = TaskStatus(task_data['status'])
            task_data['priority'] = TaskPriority(task_data['priority'])
            
            tasks.append(AtomicTask(**task_data))
        
        return tasks


async def add_task_dependency(parent_task_id: str, child_task_id: str, dependency_type: str = "blocks") -> None:
    """Add dependency between tasks"""
    db_manager = get_db_manager()
    task_storage = db_manager.get_task_storage()
    
    dep_type = DependencyType(dependency_type)
    await task_storage.add_task_dependency(parent_task_id, child_task_id, dep_type)


async def store_validation_result(task_id: str, validation_type: str, validator_name: str, 
                                 status: str, details: Optional[Dict[str, Any]] = None,
                                 suggestions: Optional[Dict[str, Any]] = None,
                                 score: Optional[float] = None) -> None:
    """Store validation result for task"""
    db_manager = get_db_manager()
    context_storage = db_manager.get_context_storage()
    
    result = ValidationResult(
        task_id=task_id,
        validation_type=validation_type,
        validator_name=validator_name,
        status=status,
        score=score,
        details=details,
        suggestions=suggestions
    )
    
    await context_storage.store_validation_result(task_id, result)


async def get_codebase_context(task_id: str) -> CodebaseContext:
    """Get codebase context for task"""
    db_manager = get_db_manager()
    context_storage = db_manager.get_context_storage()
    return await context_storage.get_codebase_context(task_id)


async def store_codebase_context(task_id: str, file_path: str, change_type: str,
                                file_type: Optional[str] = None, diff_data: Optional[str] = None,
                                content_hash: Optional[str] = None, line_count: Optional[int] = None,
                                metadata: Optional[Dict[str, Any]] = None) -> None:
    """Store codebase context for file changes"""
    db_manager = get_db_manager()
    
    async with db_manager.pool.acquire() as conn:
        query = """
        INSERT INTO codebase_context (
            task_id, file_path, file_type, change_type, content_hash,
            diff_data, line_count, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        """
        
        await conn.execute(
            query,
            task_id,
            file_path,
            file_type,
            change_type,
            content_hash,
            diff_data,
            line_count,
            json.dumps(metadata) if metadata else '{}'
        )


async def get_task_summary(limit: int = 100, offset: int = 0) -> List[Dict[str, Any]]:
    """Get task summary with aggregated information"""
    db_manager = get_db_manager()
    
    async with db_manager.pool.acquire() as conn:
        query = """
        SELECT id, title, status, priority, complexity_score, created_at, updated_at,
               assigned_to, dependency_count, context_count, ai_interaction_count
        FROM task_summary
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2
        """
        
        rows = await conn.fetch(query, limit, offset)
        return [dict(row) for row in rows]


async def get_task_metrics() -> Dict[str, Any]:
    """Get overall task metrics and statistics"""
    db_manager = get_db_manager()
    
    async with db_manager.pool.acquire() as conn:
        # Get status distribution
        status_query = """
        SELECT status, COUNT(*) as count
        FROM tasks
        GROUP BY status
        """
        status_rows = await conn.fetch(status_query)
        status_distribution = {row['status']: row['count'] for row in status_rows}
        
        # Get priority distribution
        priority_query = """
        SELECT priority, COUNT(*) as count
        FROM tasks
        GROUP BY priority
        """
        priority_rows = await conn.fetch(priority_query)
        priority_distribution = {row['priority']: row['count'] for row in priority_rows}
        
        # Get complexity distribution
        complexity_query = """
        SELECT 
            CASE 
                WHEN complexity_score <= 3 THEN 'low'
                WHEN complexity_score <= 6 THEN 'medium'
                WHEN complexity_score <= 8 THEN 'high'
                ELSE 'very_high'
            END as complexity_level,
            COUNT(*) as count
        FROM tasks
        WHERE complexity_score IS NOT NULL
        GROUP BY complexity_level
        """
        complexity_rows = await conn.fetch(complexity_query)
        complexity_distribution = {row['complexity_level']: row['count'] for row in complexity_rows}
        
        # Get total counts
        total_query = """
        SELECT 
            COUNT(*) as total_tasks,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_tasks,
            COUNT(CASE WHEN status = 'in-progress' THEN 1 END) as in_progress_tasks,
            COUNT(CASE WHEN status = 'done' THEN 1 END) as completed_tasks,
            AVG(complexity_score) as avg_complexity
        FROM tasks
        """
        total_row = await conn.fetchrow(total_query)
        
        return {
            'total_tasks': total_row['total_tasks'],
            'pending_tasks': total_row['pending_tasks'],
            'in_progress_tasks': total_row['in_progress_tasks'],
            'completed_tasks': total_row['completed_tasks'],
            'avg_complexity': float(total_row['avg_complexity']) if total_row['avg_complexity'] else 0,
            'status_distribution': status_distribution,
            'priority_distribution': priority_distribution,
            'complexity_distribution': complexity_distribution
        }


# Synchronous wrapper functions for backward compatibility
def sync_wrapper(async_func):
    """Wrapper to run async functions synchronously"""
    def wrapper(*args, **kwargs):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            return loop.run_until_complete(async_func(*args, **kwargs))
        finally:
            loop.close()
    return wrapper


# Synchronous versions of core functions
create_task_tables_sync = sync_wrapper(create_task_tables)
store_atomic_task_sync = sync_wrapper(store_atomic_task)
retrieve_task_by_id_sync = sync_wrapper(retrieve_task_by_id)
update_task_status_sync = sync_wrapper(update_task_status)
get_pending_tasks_sync = sync_wrapper(get_pending_tasks)
store_task_context_sync = sync_wrapper(store_task_context)
get_task_full_context_sync = sync_wrapper(get_task_full_context)
store_ai_interaction_sync = sync_wrapper(store_ai_interaction)
get_task_dependencies_sync = sync_wrapper(get_task_dependencies)
mark_task_completed_sync = sync_wrapper(mark_task_completed)


# Export all functions
__all__ = [
    # Async functions
    'initialize_database',
    'close_database',
    'create_task_tables',
    'store_atomic_task',
    'retrieve_task_by_id',
    'update_task_status',
    'get_pending_tasks',
    'store_task_context',
    'get_task_full_context',
    'store_ai_interaction',
    'get_task_dependencies',
    'mark_task_completed',
    'get_ready_tasks',
    'add_task_dependency',
    'store_validation_result',
    'get_codebase_context',
    'store_codebase_context',
    'get_task_summary',
    'get_task_metrics',
    
    # Sync functions
    'create_task_tables_sync',
    'store_atomic_task_sync',
    'retrieve_task_by_id_sync',
    'update_task_status_sync',
    'get_pending_tasks_sync',
    'store_task_context_sync',
    'get_task_full_context_sync',
    'store_ai_interaction_sync',
    'get_task_dependencies_sync',
    'mark_task_completed_sync',
    
    # Classes
    'AtomicTask',
    'TaskContext',
    'AIInteraction',
    'ValidationResult',
    'CodebaseContext',
    'TaskStatus',
    'TaskPriority',
    'DependencyType',
    'InteractionType',
    'DatabaseConfig'
]

