"""
PostgreSQL Task Storage and Context Engine
Foundation for AI-driven task management with comprehensive context preservation
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass, asdict
from enum import Enum

import asyncpg
from asyncpg import Pool, Connection


# Data Models
class TaskStatus(Enum):
    PENDING = "pending"
    IN_PROGRESS = "in-progress"
    DONE = "done"
    DEFERRED = "deferred"
    BLOCKED = "blocked"
    CANCELLED = "cancelled"


class TaskPriority(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class DependencyType(Enum):
    BLOCKS = "blocks"
    REQUIRES = "requires"
    RELATES_TO = "relates_to"
    SUBTASK = "subtask"


class InteractionType(Enum):
    PROMPT = "prompt"
    RESPONSE = "response"
    VALIDATION = "validation"
    FEEDBACK = "feedback"
    ERROR = "error"
    COMPLETION = "completion"


@dataclass
class AtomicTask:
    """Core atomic task representation"""
    id: Optional[str] = None
    title: str = ""
    description: Optional[str] = None
    requirements: Optional[Dict[str, Any]] = None
    acceptance_criteria: Optional[Dict[str, Any]] = None
    affected_files: Optional[List[str]] = None
    complexity_score: Optional[int] = None
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority = TaskPriority.MEDIUM
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    created_by: Optional[str] = None
    assigned_to: Optional[str] = None
    estimated_hours: Optional[float] = None
    actual_hours: Optional[float] = None
    tags: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization"""
        data = asdict(self)
        # Convert enums to strings
        data['status'] = self.status.value if isinstance(self.status, TaskStatus) else self.status
        data['priority'] = self.priority.value if isinstance(self.priority, TaskPriority) else self.priority
        # Convert datetime objects to ISO strings
        if self.created_at:
            data['created_at'] = self.created_at.isoformat()
        if self.updated_at:
            data['updated_at'] = self.updated_at.isoformat()
        return data

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'AtomicTask':
        """Create from dictionary"""
        # Convert string enums back to enum objects
        if 'status' in data and isinstance(data['status'], str):
            data['status'] = TaskStatus(data['status'])
        if 'priority' in data and isinstance(data['priority'], str):
            data['priority'] = TaskPriority(data['priority'])
        # Convert ISO strings back to datetime objects
        if 'created_at' in data and isinstance(data['created_at'], str):
            data['created_at'] = datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
        if 'updated_at' in data and isinstance(data['updated_at'], str):
            data['updated_at'] = datetime.fromisoformat(data['updated_at'].replace('Z', '+00:00'))
        return cls(**data)


@dataclass
class TaskContext:
    """Comprehensive task context for AI prompt generation"""
    task_id: str
    requirements_context: Optional[Dict[str, Any]] = None
    codebase_context: Optional[Dict[str, Any]] = None
    ai_interactions: Optional[List[Dict[str, Any]]] = None
    validation_results: Optional[List[Dict[str, Any]]] = None
    workflow_state: Optional[Dict[str, Any]] = None
    performance_metrics: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class AIInteraction:
    """AI agent interaction record"""
    id: Optional[str] = None
    task_id: str = ""
    agent_name: str = ""
    interaction_type: InteractionType = InteractionType.PROMPT
    request_data: Optional[Dict[str, Any]] = None
    response_data: Optional[Dict[str, Any]] = None
    execution_time_ms: Optional[int] = None
    success: bool = True
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None
    session_id: Optional[str] = None
    parent_interaction_id: Optional[str] = None


@dataclass
class ValidationResult:
    """Validation result from PR validation"""
    id: Optional[str] = None
    task_id: str = ""
    validation_type: str = ""
    validator_name: str = ""
    status: str = ""
    score: Optional[float] = None
    details: Optional[Dict[str, Any]] = None
    suggestions: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    execution_time_ms: Optional[int] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class CodebaseContext:
    """Codebase context for file relationships"""
    task_id: str
    file_changes: List[Dict[str, Any]]
    dependencies: List[str]
    impact_analysis: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class TaskStorage:
    """Core task storage interface with PostgreSQL backend"""
    
    def __init__(self, connection_pool: Pool):
        self.pool = connection_pool
        self.logger = logging.getLogger(__name__)

    async def store_task(self, task: AtomicTask) -> str:
        """Store atomic task with complete context and metadata"""
        async with self.pool.acquire() as conn:
            try:
                # Generate UUID if not provided
                task_id = task.id or str(uuid.uuid4())
                
                query = """
                INSERT INTO tasks (
                    id, title, description, requirements, acceptance_criteria,
                    affected_files, complexity_score, status, priority,
                    created_by, assigned_to, estimated_hours, actual_hours,
                    tags, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING id
                """
                
                result = await conn.fetchval(
                    query,
                    task_id,
                    task.title,
                    task.description,
                    json.dumps(task.requirements) if task.requirements else None,
                    json.dumps(task.acceptance_criteria) if task.acceptance_criteria else None,
                    task.affected_files,
                    task.complexity_score,
                    task.status.value if isinstance(task.status, TaskStatus) else task.status,
                    task.priority.value if isinstance(task.priority, TaskPriority) else task.priority,
                    task.created_by,
                    task.assigned_to,
                    task.estimated_hours,
                    task.actual_hours,
                    task.tags,
                    json.dumps(task.metadata) if task.metadata else '{}'
                )
                
                self.logger.info(f"Stored task {result} successfully")
                return result
                
            except Exception as e:
                self.logger.error(f"Error storing task: {e}")
                raise

    async def get_task(self, task_id: str) -> Optional[AtomicTask]:
        """Retrieve task by ID"""
        async with self.pool.acquire() as conn:
            try:
                query = """
                SELECT id, title, description, requirements, acceptance_criteria,
                       affected_files, complexity_score, status, priority,
                       created_at, updated_at, created_by, assigned_to,
                       estimated_hours, actual_hours, tags, metadata
                FROM tasks WHERE id = $1
                """
                
                row = await conn.fetchrow(query, task_id)
                if not row:
                    return None
                
                # Convert row to AtomicTask
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
                
                return AtomicTask(**task_data)
                
            except Exception as e:
                self.logger.error(f"Error retrieving task {task_id}: {e}")
                raise

    async def update_task_status(self, task_id: str, status: TaskStatus, context: Optional[Dict[str, Any]] = None) -> None:
        """Update task status with context"""
        async with self.pool.acquire() as conn:
            try:
                async with conn.transaction():
                    # Update task status
                    await conn.execute(
                        "UPDATE tasks SET status = $1, updated_at = NOW() WHERE id = $2",
                        status.value if isinstance(status, TaskStatus) else status,
                        task_id
                    )
                    
                    # Store context if provided
                    if context:
                        await self.store_task_context(task_id, "status_update", context)
                
                self.logger.info(f"Updated task {task_id} status to {status}")
                
            except Exception as e:
                self.logger.error(f"Error updating task status: {e}")
                raise

    async def get_tasks_by_status(self, status: TaskStatus) -> List[AtomicTask]:
        """Get all tasks with specified status"""
        async with self.pool.acquire() as conn:
            try:
                query = """
                SELECT id, title, description, requirements, acceptance_criteria,
                       affected_files, complexity_score, status, priority,
                       created_at, updated_at, created_by, assigned_to,
                       estimated_hours, actual_hours, tags, metadata
                FROM tasks WHERE status = $1
                ORDER BY priority DESC, created_at ASC
                """
                
                rows = await conn.fetch(query, status.value if isinstance(status, TaskStatus) else status)
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
                
            except Exception as e:
                self.logger.error(f"Error retrieving tasks by status {status}: {e}")
                raise

    async def store_task_context(self, task_id: str, context_type: str, context_data: Dict[str, Any]) -> None:
        """Store comprehensive context for task"""
        async with self.pool.acquire() as conn:
            try:
                query = """
                INSERT INTO task_context (task_id, context_type, context_data)
                VALUES ($1, $2, $3)
                """
                
                await conn.execute(
                    query,
                    task_id,
                    context_type,
                    json.dumps(context_data)
                )
                
                self.logger.info(f"Stored context for task {task_id}, type: {context_type}")
                
            except Exception as e:
                self.logger.error(f"Error storing task context: {e}")
                raise

    async def get_task_dependencies(self, task_id: str) -> List[str]:
        """Get task dependencies"""
        async with self.pool.acquire() as conn:
            try:
                query = """
                SELECT parent_task_id, dependency_type
                FROM task_dependencies
                WHERE child_task_id = $1
                """
                
                rows = await conn.fetch(query, task_id)
                return [row['parent_task_id'] for row in rows]
                
            except Exception as e:
                self.logger.error(f"Error retrieving task dependencies: {e}")
                raise

    async def add_task_dependency(self, parent_task_id: str, child_task_id: str, dependency_type: DependencyType = DependencyType.BLOCKS) -> None:
        """Add task dependency"""
        async with self.pool.acquire() as conn:
            try:
                query = """
                INSERT INTO task_dependencies (parent_task_id, child_task_id, dependency_type)
                VALUES ($1, $2, $3)
                ON CONFLICT (parent_task_id, child_task_id, dependency_type) DO NOTHING
                """
                
                await conn.execute(
                    query,
                    parent_task_id,
                    child_task_id,
                    dependency_type.value if isinstance(dependency_type, DependencyType) else dependency_type
                )
                
                self.logger.info(f"Added dependency: {parent_task_id} -> {child_task_id}")
                
            except Exception as e:
                self.logger.error(f"Error adding task dependency: {e}")
                raise


class ContextStorage:
    """Context storage interface for comprehensive context preservation"""
    
    def __init__(self, connection_pool: Pool):
        self.pool = connection_pool
        self.logger = logging.getLogger(__name__)

    async def store_ai_interaction(self, task_id: str, interaction: AIInteraction) -> None:
        """Store AI agent interaction"""
        async with self.pool.acquire() as conn:
            try:
                query = """
                INSERT INTO ai_interactions (
                    task_id, agent_name, interaction_type, request_data,
                    response_data, execution_time_ms, success, error_message,
                    session_id, parent_interaction_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                """
                
                await conn.execute(
                    query,
                    task_id,
                    interaction.agent_name,
                    interaction.interaction_type.value if isinstance(interaction.interaction_type, InteractionType) else interaction.interaction_type,
                    json.dumps(interaction.request_data) if interaction.request_data else None,
                    json.dumps(interaction.response_data) if interaction.response_data else None,
                    interaction.execution_time_ms,
                    interaction.success,
                    interaction.error_message,
                    interaction.session_id,
                    interaction.parent_interaction_id
                )
                
                self.logger.info(f"Stored AI interaction for task {task_id}")
                
            except Exception as e:
                self.logger.error(f"Error storing AI interaction: {e}")
                raise

    async def get_task_context(self, task_id: str) -> TaskContext:
        """Get comprehensive task context"""
        async with self.pool.acquire() as conn:
            try:
                # Get task context data
                context_query = """
                SELECT context_type, context_data
                FROM task_context
                WHERE task_id = $1 AND is_active = true
                ORDER BY created_at DESC
                """
                
                context_rows = await conn.fetch(context_query, task_id)
                
                # Get AI interactions
                ai_query = """
                SELECT agent_name, interaction_type, request_data, response_data,
                       execution_time_ms, success, error_message, created_at
                FROM ai_interactions
                WHERE task_id = $1
                ORDER BY created_at DESC
                LIMIT 50
                """
                
                ai_rows = await conn.fetch(ai_query, task_id)
                
                # Get validation results
                validation_query = """
                SELECT validation_type, validator_name, status, score,
                       details, suggestions, created_at
                FROM validation_results
                WHERE task_id = $1
                ORDER BY created_at DESC
                LIMIT 20
                """
                
                validation_rows = await conn.fetch(validation_query, task_id)
                
                # Build context object
                context = TaskContext(task_id=task_id)
                
                # Process context data
                for row in context_rows:
                    context_data = json.loads(row['context_data'])
                    context_type = row['context_type']
                    
                    if context_type == 'requirements':
                        context.requirements_context = context_data
                    elif context_type == 'codebase':
                        context.codebase_context = context_data
                    elif context_type == 'workflow':
                        context.workflow_state = context_data
                    elif context_type == 'performance':
                        context.performance_metrics = context_data
                
                # Process AI interactions
                context.ai_interactions = [
                    {
                        'agent_name': row['agent_name'],
                        'interaction_type': row['interaction_type'],
                        'request_data': json.loads(row['request_data']) if row['request_data'] else None,
                        'response_data': json.loads(row['response_data']) if row['response_data'] else None,
                        'execution_time_ms': row['execution_time_ms'],
                        'success': row['success'],
                        'error_message': row['error_message'],
                        'created_at': row['created_at'].isoformat()
                    }
                    for row in ai_rows
                ]
                
                # Process validation results
                context.validation_results = [
                    {
                        'validation_type': row['validation_type'],
                        'validator_name': row['validator_name'],
                        'status': row['status'],
                        'score': row['score'],
                        'details': json.loads(row['details']) if row['details'] else None,
                        'suggestions': json.loads(row['suggestions']) if row['suggestions'] else None,
                        'created_at': row['created_at'].isoformat()
                    }
                    for row in validation_rows
                ]
                
                return context
                
            except Exception as e:
                self.logger.error(f"Error retrieving task context: {e}")
                raise

    async def store_validation_result(self, task_id: str, result: ValidationResult) -> None:
        """Store validation result"""
        async with self.pool.acquire() as conn:
            try:
                query = """
                INSERT INTO validation_results (
                    task_id, validation_type, validator_name, status,
                    score, details, suggestions, execution_time_ms, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """
                
                await conn.execute(
                    query,
                    task_id,
                    result.validation_type,
                    result.validator_name,
                    result.status,
                    result.score,
                    json.dumps(result.details) if result.details else None,
                    json.dumps(result.suggestions) if result.suggestions else None,
                    result.execution_time_ms,
                    json.dumps(result.metadata) if result.metadata else '{}'
                )
                
                self.logger.info(f"Stored validation result for task {task_id}")
                
            except Exception as e:
                self.logger.error(f"Error storing validation result: {e}")
                raise

    async def get_codebase_context(self, task_id: str) -> CodebaseContext:
        """Get codebase context for task"""
        async with self.pool.acquire() as conn:
            try:
                query = """
                SELECT file_path, file_type, change_type, content_hash,
                       diff_data, line_count, metadata
                FROM codebase_context
                WHERE task_id = $1
                ORDER BY created_at DESC
                """
                
                rows = await conn.fetch(query, task_id)
                
                file_changes = [
                    {
                        'file_path': row['file_path'],
                        'file_type': row['file_type'],
                        'change_type': row['change_type'],
                        'content_hash': row['content_hash'],
                        'diff_data': row['diff_data'],
                        'line_count': row['line_count'],
                        'metadata': json.loads(row['metadata']) if row['metadata'] else {}
                    }
                    for row in rows
                ]
                
                # Get dependencies
                dep_query = """
                SELECT parent_task_id
                FROM task_dependencies
                WHERE child_task_id = $1
                """
                
                dep_rows = await conn.fetch(dep_query, task_id)
                dependencies = [row['parent_task_id'] for row in dep_rows]
                
                return CodebaseContext(
                    task_id=task_id,
                    file_changes=file_changes,
                    dependencies=dependencies
                )
                
            except Exception as e:
                self.logger.error(f"Error retrieving codebase context: {e}")
                raise


# Database connection management
class DatabaseManager:
    """Database connection and management utilities"""
    
    def __init__(self, connection_string: str):
        self.connection_string = connection_string
        self.pool: Optional[Pool] = None
        self.logger = logging.getLogger(__name__)

    async def initialize(self) -> None:
        """Initialize database connection pool"""
        try:
            self.pool = await asyncpg.create_pool(
                self.connection_string,
                min_size=5,
                max_size=20,
                command_timeout=60
            )
            self.logger.info("Database connection pool initialized")
        except Exception as e:
            self.logger.error(f"Failed to initialize database: {e}")
            raise

    async def close(self) -> None:
        """Close database connection pool"""
        if self.pool:
            await self.pool.close()
            self.logger.info("Database connection pool closed")

    async def create_tables(self) -> None:
        """Create database tables from schema"""
        if not self.pool:
            raise RuntimeError("Database not initialized")
        
        # Read schema file
        import os
        schema_path = os.path.join(os.path.dirname(__file__), '..', 'database', 'schemas', 'task_storage_schema.sql')
        
        try:
            with open(schema_path, 'r') as f:
                schema_sql = f.read()
            
            async with self.pool.acquire() as conn:
                await conn.execute(schema_sql)
            
            self.logger.info("Database tables created successfully")
        except Exception as e:
            self.logger.error(f"Error creating tables: {e}")
            raise

    def get_task_storage(self) -> TaskStorage:
        """Get task storage instance"""
        if not self.pool:
            raise RuntimeError("Database not initialized")
        return TaskStorage(self.pool)

    def get_context_storage(self) -> ContextStorage:
        """Get context storage instance"""
        if not self.pool:
            raise RuntimeError("Database not initialized")
        return ContextStorage(self.pool)


# Configuration
class DatabaseConfig:
    """Database configuration"""
    
    def __init__(self, 
                 host: str = "localhost",
                 port: int = 5432,
                 database: str = "codegen-taskmaster-db",
                 username: str = "software_developer",
                 password: str = "password",
                 ssl_mode: str = "require"):
        self.host = host
        self.port = port
        self.database = database
        self.username = username
        self.password = password
        self.ssl_mode = ssl_mode

    @property
    def connection_string(self) -> str:
        """Get PostgreSQL connection string"""
        return f"postgresql://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}?sslmode={self.ssl_mode}"

    @classmethod
    def from_env(cls) -> 'DatabaseConfig':
        """Create config from environment variables"""
        import os
        return cls(
            host=os.getenv('DB_HOST', 'localhost'),
            port=int(os.getenv('DB_PORT', '5432')),
            database=os.getenv('DB_NAME', 'codegen-taskmaster-db'),
            username=os.getenv('DB_USER', 'software_developer'),
            password=os.getenv('DB_PASSWORD', 'password'),
            ssl_mode=os.getenv('DB_SSL_MODE', 'require')
        )

