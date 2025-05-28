"""
Mock Implementations for Task Storage and Context Engine
Provides realistic mock data and implementations for immediate testing and development
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import asdict

from .task_storage import (
    AtomicTask, TaskContext, AIInteraction, ValidationResult, CodebaseContext,
    TaskStatus, TaskPriority, DependencyType, InteractionType
)


class MockTaskStorage:
    """Mock implementation of TaskStorage for testing"""
    
    def __init__(self):
        self.tasks: Dict[str, AtomicTask] = {}
        self.dependencies: Dict[str, List[str]] = {}
        self.contexts: Dict[str, List[Dict[str, Any]]] = {}
        self._initialize_mock_data()

    def _initialize_mock_data(self):
        """Initialize with realistic mock data"""
        # Create sample tasks
        sample_tasks = [
            AtomicTask(
                id="task-001",
                title="Implement User Authentication",
                description="Create secure user authentication system with JWT tokens",
                requirements={
                    "security": "JWT-based authentication",
                    "features": ["login", "logout", "password_reset"],
                    "database": "PostgreSQL user table"
                },
                acceptance_criteria={
                    "security": "All passwords hashed with bcrypt",
                    "testing": "Unit tests with 90%+ coverage",
                    "performance": "Login response < 200ms"
                },
                affected_files=["auth/models.py", "auth/views.py", "auth/serializers.py"],
                complexity_score=7,
                status=TaskStatus.IN_PROGRESS,
                priority=TaskPriority.HIGH,
                created_at=datetime.now() - timedelta(days=2),
                updated_at=datetime.now() - timedelta(hours=3),
                assigned_to="developer@example.com",
                estimated_hours=16.0,
                actual_hours=12.5,
                tags=["authentication", "security", "backend"],
                metadata={"sprint": "sprint-1", "epic": "user-management"}
            ),
            AtomicTask(
                id="task-002", 
                title="Design Database Schema",
                description="Design and implement PostgreSQL database schema for task management",
                requirements={
                    "database": "PostgreSQL with JSONB support",
                    "tables": ["tasks", "dependencies", "context", "interactions"],
                    "performance": "Optimized indexes for queries"
                },
                acceptance_criteria={
                    "schema": "All tables created with proper constraints",
                    "performance": "Query response < 100ms",
                    "scalability": "Support for 10,000+ tasks"
                },
                affected_files=["database/schema.sql", "migrations/001_initial.sql"],
                complexity_score=8,
                status=TaskStatus.DONE,
                priority=TaskPriority.CRITICAL,
                created_at=datetime.now() - timedelta(days=5),
                updated_at=datetime.now() - timedelta(days=1),
                assigned_to="architect@example.com",
                estimated_hours=24.0,
                actual_hours=28.0,
                tags=["database", "schema", "foundation"],
                metadata={"sprint": "sprint-1", "epic": "infrastructure"}
            ),
            AtomicTask(
                id="task-003",
                title="Implement API Endpoints",
                description="Create REST API endpoints for task management operations",
                requirements={
                    "api": "RESTful design with OpenAPI documentation",
                    "endpoints": ["GET /tasks", "POST /tasks", "PUT /tasks/{id}", "DELETE /tasks/{id}"],
                    "validation": "Request/response validation"
                },
                acceptance_criteria={
                    "documentation": "Complete OpenAPI spec",
                    "testing": "Integration tests for all endpoints",
                    "performance": "API response < 300ms"
                },
                affected_files=["api/views.py", "api/serializers.py", "api/urls.py"],
                complexity_score=6,
                status=TaskStatus.PENDING,
                priority=TaskPriority.HIGH,
                created_at=datetime.now() - timedelta(days=1),
                updated_at=datetime.now() - timedelta(hours=2),
                assigned_to="backend@example.com",
                estimated_hours=20.0,
                tags=["api", "rest", "backend"],
                metadata={"sprint": "sprint-1", "epic": "api-development"}
            ),
            AtomicTask(
                id="task-004",
                title="Frontend Task Dashboard",
                description="Create React dashboard for task visualization and management",
                requirements={
                    "framework": "React with TypeScript",
                    "features": ["task list", "task details", "status updates", "filtering"],
                    "design": "Material-UI components"
                },
                acceptance_criteria={
                    "responsive": "Works on desktop and mobile",
                    "performance": "Page load < 2 seconds",
                    "accessibility": "WCAG 2.1 AA compliance"
                },
                affected_files=["frontend/src/components/TaskDashboard.tsx", "frontend/src/hooks/useTasks.ts"],
                complexity_score=9,
                status=TaskStatus.BLOCKED,
                priority=TaskPriority.MEDIUM,
                created_at=datetime.now() - timedelta(hours=12),
                updated_at=datetime.now() - timedelta(hours=1),
                assigned_to="frontend@example.com",
                estimated_hours=32.0,
                tags=["frontend", "react", "dashboard"],
                metadata={"sprint": "sprint-2", "epic": "user-interface"}
            ),
            AtomicTask(
                id="task-005",
                title="Setup CI/CD Pipeline",
                description="Configure automated testing and deployment pipeline",
                requirements={
                    "platform": "GitHub Actions",
                    "stages": ["test", "build", "deploy"],
                    "environments": ["staging", "production"]
                },
                acceptance_criteria={
                    "automation": "Fully automated deployment",
                    "testing": "All tests pass before deployment",
                    "rollback": "Automatic rollback on failure"
                },
                affected_files=[".github/workflows/ci.yml", ".github/workflows/deploy.yml"],
                complexity_score=5,
                status=TaskStatus.DEFERRED,
                priority=TaskPriority.LOW,
                created_at=datetime.now() - timedelta(hours=6),
                updated_at=datetime.now() - timedelta(minutes=30),
                assigned_to="devops@example.com",
                estimated_hours=12.0,
                tags=["devops", "ci-cd", "automation"],
                metadata={"sprint": "sprint-2", "epic": "infrastructure"}
            )
        ]
        
        # Store tasks
        for task in sample_tasks:
            self.tasks[task.id] = task
        
        # Set up dependencies
        self.dependencies = {
            "task-003": ["task-002"],  # API depends on database schema
            "task-004": ["task-003"],  # Frontend depends on API
            "task-005": ["task-001", "task-003"]  # CI/CD depends on auth and API
        }
        
        # Initialize contexts
        self._initialize_mock_contexts()

    def _initialize_mock_contexts(self):
        """Initialize mock context data"""
        # Context for authentication task
        self.contexts["task-001"] = [
            {
                "context_type": "requirements",
                "context_data": {
                    "security_requirements": {
                        "password_policy": "Minimum 8 characters, mixed case, numbers, symbols",
                        "session_timeout": "24 hours",
                        "failed_login_lockout": "5 attempts"
                    },
                    "integration_points": ["user_profile", "permissions", "audit_log"],
                    "compliance": ["GDPR", "SOC2"]
                },
                "created_at": datetime.now() - timedelta(hours=24)
            },
            {
                "context_type": "codebase",
                "context_data": {
                    "existing_files": ["models/user.py", "utils/crypto.py"],
                    "dependencies": ["django-rest-framework", "PyJWT", "bcrypt"],
                    "architecture": "Django REST API with JWT middleware"
                },
                "created_at": datetime.now() - timedelta(hours=12)
            }
        ]
        
        # Context for database schema task
        self.contexts["task-002"] = [
            {
                "context_type": "requirements",
                "context_data": {
                    "database_requirements": {
                        "engine": "PostgreSQL 14+",
                        "features": ["JSONB", "UUID", "full-text search"],
                        "performance": "Sub-100ms query response"
                    },
                    "scalability": {
                        "concurrent_users": 1000,
                        "data_volume": "10M+ tasks",
                        "growth_rate": "20% monthly"
                    }
                },
                "created_at": datetime.now() - timedelta(days=3)
            }
        ]

    async def store_task(self, task: AtomicTask) -> str:
        """Mock store task implementation"""
        task_id = task.id or str(uuid.uuid4())
        task.id = task_id
        task.created_at = task.created_at or datetime.now()
        task.updated_at = datetime.now()
        self.tasks[task_id] = task
        return task_id

    async def get_task(self, task_id: str) -> Optional[AtomicTask]:
        """Mock get task implementation"""
        return self.tasks.get(task_id)

    async def update_task_status(self, task_id: str, status: TaskStatus, context: Optional[Dict[str, Any]] = None) -> None:
        """Mock update task status implementation"""
        if task_id in self.tasks:
            self.tasks[task_id].status = status
            self.tasks[task_id].updated_at = datetime.now()
            
            if context:
                await self.store_task_context(task_id, "status_update", context)

    async def get_tasks_by_status(self, status: TaskStatus) -> List[AtomicTask]:
        """Mock get tasks by status implementation"""
        return [task for task in self.tasks.values() if task.status == status]

    async def store_task_context(self, task_id: str, context_type: str, context_data: Dict[str, Any]) -> None:
        """Mock store task context implementation"""
        if task_id not in self.contexts:
            self.contexts[task_id] = []
        
        self.contexts[task_id].append({
            "context_type": context_type,
            "context_data": context_data,
            "created_at": datetime.now()
        })

    async def get_task_dependencies(self, task_id: str) -> List[str]:
        """Mock get task dependencies implementation"""
        return self.dependencies.get(task_id, [])

    async def add_task_dependency(self, parent_task_id: str, child_task_id: str, dependency_type: DependencyType = DependencyType.BLOCKS) -> None:
        """Mock add task dependency implementation"""
        if child_task_id not in self.dependencies:
            self.dependencies[child_task_id] = []
        
        if parent_task_id not in self.dependencies[child_task_id]:
            self.dependencies[child_task_id].append(parent_task_id)


class MockContextStorage:
    """Mock implementation of ContextStorage for testing"""
    
    def __init__(self):
        self.ai_interactions: Dict[str, List[AIInteraction]] = {}
        self.validation_results: Dict[str, List[ValidationResult]] = {}
        self.codebase_contexts: Dict[str, CodebaseContext] = {}
        self._initialize_mock_data()

    def _initialize_mock_data(self):
        """Initialize mock context data"""
        # Mock AI interactions for authentication task
        self.ai_interactions["task-001"] = [
            AIInteraction(
                id="ai-001",
                task_id="task-001",
                agent_name="codegen",
                interaction_type=InteractionType.PROMPT,
                request_data={
                    "prompt": "Generate Django authentication views with JWT support",
                    "context": "User authentication system for task management app"
                },
                response_data={
                    "code": "class LoginView(APIView): ...",
                    "explanation": "Generated secure login view with JWT token generation"
                },
                execution_time_ms=1250,
                success=True,
                created_at=datetime.now() - timedelta(hours=6),
                session_id="session-001"
            ),
            AIInteraction(
                id="ai-002",
                task_id="task-001",
                agent_name="claude-code",
                interaction_type=InteractionType.VALIDATION,
                request_data={
                    "code": "class LoginView(APIView): ...",
                    "validation_type": "security"
                },
                response_data={
                    "status": "passed",
                    "issues": [],
                    "suggestions": ["Add rate limiting", "Implement CSRF protection"]
                },
                execution_time_ms=800,
                success=True,
                created_at=datetime.now() - timedelta(hours=4),
                session_id="session-001",
                parent_interaction_id="ai-001"
            ),
            AIInteraction(
                id="ai-003",
                task_id="task-001",
                agent_name="codegen",
                interaction_type=InteractionType.FEEDBACK,
                request_data={
                    "feedback_type": "improvement",
                    "suggestions": ["Add rate limiting", "Implement CSRF protection"]
                },
                response_data={
                    "updated_code": "class LoginView(APIView): ...",
                    "changes": ["Added rate limiting decorator", "Added CSRF middleware"]
                },
                execution_time_ms=950,
                success=True,
                created_at=datetime.now() - timedelta(hours=2),
                session_id="session-002"
            )
        ]
        
        # Mock validation results
        self.validation_results["task-001"] = [
            ValidationResult(
                id="val-001",
                task_id="task-001",
                validation_type="security",
                validator_name="bandit",
                status="passed",
                score=8.5,
                details={
                    "issues_found": 0,
                    "warnings": 2,
                    "scanned_files": 3
                },
                suggestions={
                    "improvements": ["Add input sanitization", "Implement rate limiting"]
                },
                created_at=datetime.now() - timedelta(hours=3),
                execution_time_ms=450
            ),
            ValidationResult(
                id="val-002",
                task_id="task-001",
                validation_type="tests",
                validator_name="pytest",
                status="passed",
                score=9.2,
                details={
                    "tests_run": 15,
                    "tests_passed": 15,
                    "coverage": 92.5
                },
                created_at=datetime.now() - timedelta(hours=1),
                execution_time_ms=2100
            )
        ]
        
        # Mock codebase context
        self.codebase_contexts["task-001"] = CodebaseContext(
            task_id="task-001",
            file_changes=[
                {
                    "file_path": "auth/views.py",
                    "file_type": "python",
                    "change_type": "created",
                    "content_hash": "abc123def456",
                    "diff_data": "+class LoginView(APIView):\n+    def post(self, request):\n+        ...",
                    "line_count": 45,
                    "metadata": {"author": "developer@example.com", "timestamp": datetime.now().isoformat()}
                },
                {
                    "file_path": "auth/serializers.py",
                    "file_type": "python", 
                    "change_type": "created",
                    "content_hash": "def456ghi789",
                    "diff_data": "+class LoginSerializer(serializers.Serializer):\n+    username = serializers.CharField()\n+    ...",
                    "line_count": 28,
                    "metadata": {"author": "developer@example.com", "timestamp": datetime.now().isoformat()}
                }
            ],
            dependencies=["task-002"],
            impact_analysis={
                "affected_modules": ["auth", "api"],
                "risk_level": "medium",
                "breaking_changes": False
            }
        )

    async def store_ai_interaction(self, task_id: str, interaction: AIInteraction) -> None:
        """Mock store AI interaction implementation"""
        if task_id not in self.ai_interactions:
            self.ai_interactions[task_id] = []
        
        interaction.id = interaction.id or str(uuid.uuid4())
        interaction.created_at = interaction.created_at or datetime.now()
        self.ai_interactions[task_id].append(interaction)

    async def get_task_context(self, task_id: str) -> TaskContext:
        """Mock get task context implementation"""
        # Get AI interactions
        ai_interactions = []
        if task_id in self.ai_interactions:
            for interaction in self.ai_interactions[task_id]:
                ai_interactions.append({
                    'agent_name': interaction.agent_name,
                    'interaction_type': interaction.interaction_type.value if hasattr(interaction.interaction_type, 'value') else interaction.interaction_type,
                    'request_data': interaction.request_data,
                    'response_data': interaction.response_data,
                    'execution_time_ms': interaction.execution_time_ms,
                    'success': interaction.success,
                    'error_message': interaction.error_message,
                    'created_at': interaction.created_at.isoformat() if interaction.created_at else None
                })
        
        # Get validation results
        validation_results = []
        if task_id in self.validation_results:
            for result in self.validation_results[task_id]:
                validation_results.append({
                    'validation_type': result.validation_type,
                    'validator_name': result.validator_name,
                    'status': result.status,
                    'score': result.score,
                    'details': result.details,
                    'suggestions': result.suggestions,
                    'created_at': result.created_at.isoformat() if result.created_at else None
                })
        
        return TaskContext(
            task_id=task_id,
            requirements_context={
                "functional_requirements": ["secure authentication", "JWT tokens", "password reset"],
                "non_functional_requirements": ["performance < 200ms", "security compliance"],
                "constraints": ["Django framework", "PostgreSQL database"]
            },
            codebase_context={
                "architecture": "Django REST API",
                "patterns": ["Model-View-Serializer", "JWT middleware"],
                "dependencies": ["django-rest-framework", "PyJWT"]
            },
            ai_interactions=ai_interactions,
            validation_results=validation_results,
            workflow_state={
                "current_phase": "implementation",
                "progress": 75,
                "next_steps": ["add tests", "security review"]
            },
            performance_metrics={
                "avg_response_time": 180,
                "test_coverage": 92.5,
                "code_quality_score": 8.5
            }
        )

    async def store_validation_result(self, task_id: str, result: ValidationResult) -> None:
        """Mock store validation result implementation"""
        if task_id not in self.validation_results:
            self.validation_results[task_id] = []
        
        result.id = result.id or str(uuid.uuid4())
        result.created_at = result.created_at or datetime.now()
        self.validation_results[task_id].append(result)

    async def get_codebase_context(self, task_id: str) -> CodebaseContext:
        """Mock get codebase context implementation"""
        return self.codebase_contexts.get(task_id, CodebaseContext(
            task_id=task_id,
            file_changes=[],
            dependencies=[]
        ))


class MockDatabaseManager:
    """Mock database manager for testing"""
    
    def __init__(self):
        self.task_storage = MockTaskStorage()
        self.context_storage = MockContextStorage()
        self.initialized = False

    async def initialize(self) -> None:
        """Mock initialize implementation"""
        self.initialized = True

    async def close(self) -> None:
        """Mock close implementation"""
        self.initialized = False

    async def create_tables(self) -> None:
        """Mock create tables implementation"""
        # In mock implementation, tables are always "created"
        pass

    def get_task_storage(self) -> MockTaskStorage:
        """Get mock task storage instance"""
        return self.task_storage

    def get_context_storage(self) -> MockContextStorage:
        """Get mock context storage instance"""
        return self.context_storage


# Mock data generators
def generate_mock_task(task_id: Optional[str] = None, **overrides) -> AtomicTask:
    """Generate a mock task with realistic data"""
    base_task = AtomicTask(
        id=task_id or f"task-{uuid.uuid4().hex[:8]}",
        title=f"Sample Task {uuid.uuid4().hex[:6]}",
        description="A sample task for testing and development",
        requirements={
            "framework": "Django",
            "database": "PostgreSQL",
            "testing": "pytest with 90% coverage"
        },
        acceptance_criteria={
            "functionality": "All features working as specified",
            "performance": "Response time < 300ms",
            "quality": "Code review approved"
        },
        affected_files=["models.py", "views.py", "tests.py"],
        complexity_score=5,
        status=TaskStatus.PENDING,
        priority=TaskPriority.MEDIUM,
        created_at=datetime.now() - timedelta(hours=24),
        updated_at=datetime.now() - timedelta(hours=1),
        assigned_to="developer@example.com",
        estimated_hours=8.0,
        tags=["backend", "api"],
        metadata={"sprint": "current", "epic": "development"}
    )
    
    # Apply overrides
    for key, value in overrides.items():
        if hasattr(base_task, key):
            setattr(base_task, key, value)
    
    return base_task


def generate_mock_ai_interaction(task_id: str, **overrides) -> AIInteraction:
    """Generate a mock AI interaction"""
    base_interaction = AIInteraction(
        id=f"ai-{uuid.uuid4().hex[:8]}",
        task_id=task_id,
        agent_name="codegen",
        interaction_type=InteractionType.PROMPT,
        request_data={
            "prompt": "Generate code for the specified requirements",
            "context": "Task implementation"
        },
        response_data={
            "code": "# Generated code here",
            "explanation": "Implementation details"
        },
        execution_time_ms=1000,
        success=True,
        created_at=datetime.now(),
        session_id=f"session-{uuid.uuid4().hex[:8]}"
    )
    
    # Apply overrides
    for key, value in overrides.items():
        if hasattr(base_interaction, key):
            setattr(base_interaction, key, value)
    
    return base_interaction


def generate_mock_validation_result(task_id: str, **overrides) -> ValidationResult:
    """Generate a mock validation result"""
    base_result = ValidationResult(
        id=f"val-{uuid.uuid4().hex[:8]}",
        task_id=task_id,
        validation_type="tests",
        validator_name="pytest",
        status="passed",
        score=8.5,
        details={
            "tests_run": 10,
            "tests_passed": 9,
            "coverage": 85.0
        },
        suggestions={
            "improvements": ["Add more edge case tests", "Improve test coverage"]
        },
        created_at=datetime.now(),
        execution_time_ms=1500
    )
    
    # Apply overrides
    for key, value in overrides.items():
        if hasattr(base_result, key):
            setattr(base_result, key, value)
    
    return base_result


# Test scenarios
async def run_mock_scenario_basic_workflow():
    """Run a basic workflow scenario with mock data"""
    print("Running basic workflow scenario...")
    
    # Initialize mock database
    db_manager = MockDatabaseManager()
    await db_manager.initialize()
    
    task_storage = db_manager.get_task_storage()
    context_storage = db_manager.get_context_storage()
    
    # Create a new task
    new_task = generate_mock_task(
        title="Test Task Implementation",
        description="Implement a test feature for the application",
        complexity_score=6,
        priority=TaskPriority.HIGH
    )
    
    task_id = await task_storage.store_task(new_task)
    print(f"Created task: {task_id}")
    
    # Add some AI interactions
    interaction1 = generate_mock_ai_interaction(
        task_id,
        agent_name="codegen",
        interaction_type=InteractionType.PROMPT
    )
    await context_storage.store_ai_interaction(task_id, interaction1)
    
    interaction2 = generate_mock_ai_interaction(
        task_id,
        agent_name="claude-code",
        interaction_type=InteractionType.VALIDATION,
        parent_interaction_id=interaction1.id
    )
    await context_storage.store_ai_interaction(task_id, interaction2)
    
    # Add validation results
    validation = generate_mock_validation_result(
        task_id,
        validation_type="security",
        validator_name="bandit",
        status="passed",
        score=9.0
    )
    await context_storage.store_validation_result(task_id, validation)
    
    # Update task status
    await task_storage.update_task_status(
        task_id, 
        TaskStatus.IN_PROGRESS,
        {"reason": "Started implementation", "timestamp": datetime.now().isoformat()}
    )
    
    # Get full context
    context = await context_storage.get_task_context(task_id)
    print(f"Task context retrieved with {len(context.ai_interactions)} interactions")
    
    # Mark task as completed
    await task_storage.update_task_status(
        task_id,
        TaskStatus.DONE,
        {"completion_time": datetime.now().isoformat(), "result": "success"}
    )
    
    print("Basic workflow scenario completed successfully!")
    return task_id


async def run_mock_scenario_complex_dependencies():
    """Run a complex dependency scenario"""
    print("Running complex dependency scenario...")
    
    db_manager = MockDatabaseManager()
    await db_manager.initialize()
    task_storage = db_manager.get_task_storage()
    
    # Create a chain of dependent tasks
    tasks = []
    for i in range(5):
        task = generate_mock_task(
            title=f"Dependent Task {i+1}",
            complexity_score=3 + i,
            priority=TaskPriority.HIGH if i < 2 else TaskPriority.MEDIUM
        )
        task_id = await task_storage.store_task(task)
        tasks.append(task_id)
        
        # Add dependency to previous task
        if i > 0:
            await task_storage.add_task_dependency(tasks[i-1], task_id, DependencyType.BLOCKS)
    
    print(f"Created dependency chain of {len(tasks)} tasks")
    
    # Check dependencies
    for task_id in tasks:
        deps = await task_storage.get_task_dependencies(task_id)
        print(f"Task {task_id} depends on: {deps}")
    
    print("Complex dependency scenario completed!")
    return tasks


if __name__ == "__main__":
    # Run mock scenarios
    asyncio.run(run_mock_scenario_basic_workflow())
    asyncio.run(run_mock_scenario_complex_dependencies())

