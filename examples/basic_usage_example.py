#!/usr/bin/env python3
"""
Basic Usage Example for PostgreSQL Task Storage and Context Engine
Demonstrates core functionality with mock implementations
"""

import asyncio
import json
from datetime import datetime

# Import the task storage system
from task_storage import (
    AtomicTask, TaskStatus, TaskPriority, DependencyType, InteractionType,
    MockDatabaseManager, generate_mock_task, generate_mock_ai_interaction,
    generate_mock_validation_result
)
from context_engine import ContextEngine


async def main():
    """Main example demonstrating the task storage system"""
    print("🚀 PostgreSQL Task Storage and Context Engine Example")
    print("=" * 60)
    
    # Initialize mock database (use real DatabaseManager for production)
    print("\n1. Initializing Database...")
    db_manager = MockDatabaseManager()
    await db_manager.initialize()
    
    task_storage = db_manager.get_task_storage()
    context_storage = db_manager.get_context_storage()
    context_engine = ContextEngine(db_manager)
    
    print("✅ Database initialized successfully")
    
    # Create and store tasks
    print("\n2. Creating Tasks...")
    
    # Task 1: Database Schema
    schema_task = AtomicTask(
        title="Design Database Schema",
        description="Create PostgreSQL schema for task management system",
        requirements={
            "database": "PostgreSQL 14+",
            "features": ["JSONB support", "UUID primary keys", "Full-text search"],
            "performance": "Sub-100ms query response"
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
        assigned_to="architect@example.com",
        estimated_hours=24.0,
        tags=["database", "schema", "foundation"]
    )
    
    schema_task_id = await task_storage.store_task(schema_task)
    print(f"✅ Created schema task: {schema_task_id}")
    
    # Task 2: API Implementation
    api_task = AtomicTask(
        title="Implement REST API",
        description="Create REST API endpoints for task management",
        requirements={
            "api": "RESTful design with OpenAPI documentation",
            "endpoints": ["GET /tasks", "POST /tasks", "PUT /tasks/{id}"],
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
        assigned_to="backend@example.com",
        estimated_hours=20.0,
        tags=["api", "rest", "backend"]
    )
    
    api_task_id = await task_storage.store_task(api_task)
    print(f"✅ Created API task: {api_task_id}")
    
    # Task 3: Frontend Dashboard
    frontend_task = AtomicTask(
        title="Build Task Dashboard",
        description="Create React dashboard for task visualization",
        requirements={
            "framework": "React with TypeScript",
            "features": ["task list", "task details", "status updates"],
            "design": "Material-UI components"
        },
        acceptance_criteria={
            "responsive": "Works on desktop and mobile",
            "performance": "Page load < 2 seconds",
            "accessibility": "WCAG 2.1 AA compliance"
        },
        affected_files=["frontend/src/components/TaskDashboard.tsx"],
        complexity_score=9,
        status=TaskStatus.PENDING,
        priority=TaskPriority.MEDIUM,
        assigned_to="frontend@example.com",
        estimated_hours=32.0,
        tags=["frontend", "react", "dashboard"]
    )
    
    frontend_task_id = await task_storage.store_task(frontend_task)
    print(f"✅ Created frontend task: {frontend_task_id}")
    
    # Add dependencies
    print("\n3. Setting up Dependencies...")
    await task_storage.add_task_dependency(schema_task_id, api_task_id, DependencyType.BLOCKS)
    await task_storage.add_task_dependency(api_task_id, frontend_task_id, DependencyType.BLOCKS)
    
    print(f"✅ API task depends on schema task")
    print(f"✅ Frontend task depends on API task")
    
    # Start working on API task
    print("\n4. Starting API Implementation...")
    await task_storage.update_task_status(
        api_task_id,
        TaskStatus.IN_PROGRESS,
        {
            "started_by": "backend@example.com",
            "start_time": datetime.now().isoformat(),
            "notes": "Beginning API implementation"
        }
    )
    
    # Store context for API task
    await task_storage.store_task_context(
        api_task_id,
        "requirements",
        {
            "technical_stack": {
                "framework": "Django REST Framework",
                "database": "PostgreSQL",
                "authentication": "JWT tokens"
            },
            "integration_points": ["task_storage", "user_management", "notifications"],
            "performance_requirements": {
                "response_time": "< 300ms",
                "concurrent_users": 100,
                "throughput": "1000 requests/minute"
            }
        }
    )
    
    print("✅ Updated API task status and stored context")
    
    # Simulate AI interaction
    print("\n5. AI Agent Interaction...")
    interaction_data = {
        "type": "prompt",
        "request": {
            "prompt": "Generate Django REST API views for task management",
            "context": "Task management system with PostgreSQL backend",
            "requirements": ["CRUD operations", "filtering", "pagination"]
        },
        "response": {
            "code": """
class TaskViewSet(viewsets.ModelViewSet):
    queryset = Task.objects.all()
    serializer_class = TaskSerializer
    filter_backends = [DjangoFilterBackend, OrderingFilter]
    filterset_fields = ['status', 'priority', 'assigned_to']
    ordering_fields = ['created_at', 'updated_at', 'priority']
    
    def get_queryset(self):
        queryset = super().get_queryset()
        # Add custom filtering logic
        return queryset
            """,
            "explanation": "Generated complete ViewSet with filtering and pagination",
            "files_created": ["api/views.py", "api/serializers.py"],
            "next_steps": ["Add authentication", "Write tests", "Add documentation"]
        },
        "execution_time_ms": 1250,
        "success": True,
        "session_id": "session-001"
    }
    
    await context_storage.store_ai_interaction(api_task_id, "codegen", interaction_data)
    print("✅ Stored AI interaction for code generation")
    
    # Simulate validation
    print("\n6. Code Validation...")
    validation_data = {
        "validation_type": "code_quality",
        "validator_name": "pylint",
        "status": "passed",
        "score": 8.5,
        "details": {
            "issues_found": 2,
            "warnings": 5,
            "suggestions": 3,
            "lines_analyzed": 150
        },
        "suggestions": {
            "improvements": [
                "Add docstrings to all methods",
                "Implement error handling for edge cases",
                "Add input validation for API endpoints"
            ]
        }
    }
    
    await context_storage.store_validation_result(
        api_task_id,
        validation_data["validation_type"],
        validation_data["validator_name"],
        validation_data["status"],
        validation_data["details"],
        validation_data["suggestions"],
        validation_data["score"]
    )
    
    print("✅ Stored validation results")
    
    # Generate AI prompt context
    print("\n7. Generating AI Prompt Context...")
    prompt_context = await context_engine.generate_prompt_context(api_task_id)
    
    print(f"📋 Task: {prompt_context.task_summary['title']}")
    print(f"📊 Status: {prompt_context.task_summary['status']}")
    print(f"🎯 Priority: {prompt_context.task_summary['priority']}")
    print(f"🧠 Complexity: {prompt_context.task_summary['complexity_score']}/10")
    
    if prompt_context.dependency_context:
        dep_ctx = prompt_context.dependency_context
        print(f"🔗 Dependencies: {dep_ctx['total_dependencies']} total, {dep_ctx['completed_dependencies']} completed")
        print(f"✅ Ready to work: {dep_ctx['is_ready']}")
    
    if prompt_context.recent_interactions:
        print(f"🤖 AI Interactions: {len(prompt_context.recent_interactions)} recent")
    
    # Export context for AI prompt
    print("\n8. Exporting Context for AI Prompt...")
    structured_context = await context_engine.export_context_for_prompt(
        api_task_id,
        format_type="structured"
    )
    
    print("📄 Structured Context Preview:")
    print("-" * 40)
    print(structured_context[:500] + "..." if len(structured_context) > 500 else structured_context)
    print("-" * 40)
    
    # Analyze context patterns
    print("\n9. Context Pattern Analysis...")
    analytics = await context_engine.analyze_context_patterns(api_task_id)
    
    print(f"🔍 Complexity Analysis:")
    complexity = analytics.complexity_indicators
    print(f"  - Overall complexity: {complexity.get('overall_complexity', 'unknown')}")
    print(f"  - Affected files: {complexity.get('affected_files_count', 0)}")
    print(f"  - Has dependencies: {complexity.get('has_dependencies', False)}")
    
    print(f"🤖 Interaction Patterns:")
    interactions = analytics.interaction_patterns
    if interactions.get('has_interactions'):
        print(f"  - Total interactions: {interactions.get('total_interactions', 0)}")
        print(f"  - Success rate: {interactions.get('success_rate', 0):.1%}")
        print(f"  - Avg execution time: {interactions.get('avg_execution_time_ms', 0):.0f}ms")
    
    print(f"✅ Validation Trends:")
    validations = analytics.validation_trends
    if validations.get('has_validations'):
        print(f"  - Total validations: {validations.get('total_validations', 0)}")
        print(f"  - Pass rate: {validations.get('pass_rate', 0):.1%}")
        print(f"  - Average score: {validations.get('avg_score', 0):.1f}")
    
    print(f"💡 Recommendations:")
    for i, recommendation in enumerate(analytics.recommendations[:3], 1):
        print(f"  {i}. {recommendation}")
    
    # Get context health score
    print("\n10. Context Health Assessment...")
    health_score = await context_engine.get_context_health_score(api_task_id)
    
    print(f"🏥 Overall Health Score: {health_score['overall_score']:.1f}/100")
    print(f"📊 Health Status: {health_score['health_status'].upper()}")
    
    component_scores = health_score.get('component_scores', {})
    for component, score in component_scores.items():
        print(f"  - {component.replace('_', ' ').title()}: {score:.1f}/100")
    
    # Complete the task
    print("\n11. Completing Task...")
    await task_storage.update_task_status(
        api_task_id,
        TaskStatus.DONE,
        {
            "completed_by": "backend@example.com",
            "completion_time": datetime.now().isoformat(),
            "result": "success",
            "deliverables": ["REST API endpoints", "OpenAPI documentation", "Unit tests"],
            "metrics": {
                "lines_of_code": 450,
                "test_coverage": 92.5,
                "performance": "avg 180ms response time"
            }
        }
    )
    
    print("✅ API task completed successfully!")
    
    # Get system metrics
    print("\n12. System Metrics...")
    
    # Get tasks by status
    pending_tasks = await task_storage.get_tasks_by_status(TaskStatus.PENDING)
    done_tasks = await task_storage.get_tasks_by_status(TaskStatus.DONE)
    
    print(f"📊 System Status:")
    print(f"  - Pending tasks: {len(pending_tasks)}")
    print(f"  - Completed tasks: {len(done_tasks)}")
    
    # Show task dependencies
    print(f"\n🔗 Task Dependencies:")
    for task_id in [api_task_id, frontend_task_id]:
        deps = await task_storage.get_task_dependencies(task_id)
        task = await task_storage.get_task(task_id)
        print(f"  - {task.title}: depends on {len(deps)} task(s)")
    
    print("\n🎉 Example completed successfully!")
    print("=" * 60)
    print("This demonstrates the core functionality of the PostgreSQL Task Storage")
    print("and Context Engine, including task management, dependency tracking,")
    print("AI interaction logging, validation results, and context analysis.")
    print("\nFor production use, replace MockDatabaseManager with DatabaseManager")
    print("and configure a real PostgreSQL database connection.")


if __name__ == "__main__":
    # Run the example
    asyncio.run(main())

