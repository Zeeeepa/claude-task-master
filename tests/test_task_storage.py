"""
Test suite for PostgreSQL Task Storage and Context Engine
Comprehensive tests for all core functionality
"""

import pytest
import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any

from task_storage import (
    AtomicTask, TaskContext, AIInteraction, ValidationResult, CodebaseContext,
    TaskStatus, TaskPriority, DependencyType, InteractionType,
    MockTaskStorage, MockContextStorage, MockDatabaseManager,
    generate_mock_task, generate_mock_ai_interaction, generate_mock_validation_result
)
from context_engine import ContextEngine, PromptContext


class TestAtomicTask:
    """Test AtomicTask data model"""
    
    def test_task_creation(self):
        """Test basic task creation"""
        task = AtomicTask(
            title="Test Task",
            description="A test task",
            status=TaskStatus.PENDING,
            priority=TaskPriority.HIGH
        )
        
        assert task.title == "Test Task"
        assert task.description == "A test task"
        assert task.status == TaskStatus.PENDING
        assert task.priority == TaskPriority.HIGH
        assert task.id is None  # Should be None until stored
    
    def test_task_to_dict(self):
        """Test task serialization to dictionary"""
        task = AtomicTask(
            title="Test Task",
            description="A test task",
            status=TaskStatus.IN_PROGRESS,
            priority=TaskPriority.MEDIUM,
            complexity_score=7,
            tags=["test", "backend"],
            created_at=datetime.now()
        )
        
        task_dict = task.to_dict()
        
        assert task_dict["title"] == "Test Task"
        assert task_dict["status"] == "in-progress"
        assert task_dict["priority"] == "medium"
        assert task_dict["complexity_score"] == 7
        assert task_dict["tags"] == ["test", "backend"]
        assert "created_at" in task_dict
    
    def test_task_from_dict(self):
        """Test task deserialization from dictionary"""
        task_data = {
            "title": "Test Task",
            "description": "A test task",
            "status": "done",
            "priority": "high",
            "complexity_score": 5,
            "tags": ["test"],
            "created_at": "2024-01-01T12:00:00+00:00"
        }
        
        task = AtomicTask.from_dict(task_data)
        
        assert task.title == "Test Task"
        assert task.status == TaskStatus.DONE
        assert task.priority == TaskPriority.HIGH
        assert task.complexity_score == 5
        assert isinstance(task.created_at, datetime)


class TestMockTaskStorage:
    """Test MockTaskStorage implementation"""
    
    @pytest.fixture
    async def task_storage(self):
        """Create mock task storage instance"""
        return MockTaskStorage()
    
    @pytest.mark.asyncio
    async def test_store_and_retrieve_task(self, task_storage):
        """Test storing and retrieving tasks"""
        task = generate_mock_task(
            title="Test Storage Task",
            complexity_score=6
        )
        
        # Store task
        task_id = await task_storage.store_task(task)
        assert task_id is not None
        assert task.id == task_id
        
        # Retrieve task
        retrieved_task = await task_storage.get_task(task_id)
        assert retrieved_task is not None
        assert retrieved_task.title == "Test Storage Task"
        assert retrieved_task.complexity_score == 6
    
    @pytest.mark.asyncio
    async def test_update_task_status(self, task_storage):
        """Test updating task status"""
        task = generate_mock_task(status=TaskStatus.PENDING)
        task_id = await task_storage.store_task(task)
        
        # Update status
        await task_storage.update_task_status(
            task_id, 
            TaskStatus.IN_PROGRESS,
            {"reason": "Started work"}
        )
        
        # Verify update
        updated_task = await task_storage.get_task(task_id)
        assert updated_task.status == TaskStatus.IN_PROGRESS
        assert updated_task.updated_at > task.created_at
    
    @pytest.mark.asyncio
    async def test_get_tasks_by_status(self, task_storage):
        """Test filtering tasks by status"""
        # Create tasks with different statuses
        pending_task = generate_mock_task(status=TaskStatus.PENDING)
        done_task = generate_mock_task(status=TaskStatus.DONE)
        
        await task_storage.store_task(pending_task)
        await task_storage.store_task(done_task)
        
        # Get pending tasks
        pending_tasks = await task_storage.get_tasks_by_status(TaskStatus.PENDING)
        assert len(pending_tasks) >= 1
        assert all(task.status == TaskStatus.PENDING for task in pending_tasks)
        
        # Get done tasks
        done_tasks = await task_storage.get_tasks_by_status(TaskStatus.DONE)
        assert len(done_tasks) >= 1
        assert all(task.status == TaskStatus.DONE for task in done_tasks)
    
    @pytest.mark.asyncio
    async def test_task_dependencies(self, task_storage):
        """Test task dependency management"""
        parent_task = generate_mock_task(title="Parent Task")
        child_task = generate_mock_task(title="Child Task")
        
        parent_id = await task_storage.store_task(parent_task)
        child_id = await task_storage.store_task(child_task)
        
        # Add dependency
        await task_storage.add_task_dependency(parent_id, child_id, DependencyType.BLOCKS)
        
        # Check dependencies
        dependencies = await task_storage.get_task_dependencies(child_id)
        assert parent_id in dependencies
    
    @pytest.mark.asyncio
    async def test_store_task_context(self, task_storage):
        """Test storing task context"""
        task = generate_mock_task()
        task_id = await task_storage.store_task(task)
        
        context_data = {
            "requirements": ["feature A", "feature B"],
            "constraints": ["time limit", "budget limit"]
        }
        
        await task_storage.store_task_context(task_id, "requirements", context_data)
        
        # Verify context was stored (check internal storage)
        assert task_id in task_storage.contexts
        assert len(task_storage.contexts[task_id]) > 0


class TestMockContextStorage:
    """Test MockContextStorage implementation"""
    
    @pytest.fixture
    async def context_storage(self):
        """Create mock context storage instance"""
        return MockContextStorage()
    
    @pytest.mark.asyncio
    async def test_store_ai_interaction(self, context_storage):
        """Test storing AI interactions"""
        task_id = "test-task-001"
        interaction = generate_mock_ai_interaction(
            task_id,
            agent_name="test-agent",
            interaction_type=InteractionType.PROMPT
        )
        
        await context_storage.store_ai_interaction(task_id, interaction)
        
        # Verify interaction was stored
        assert task_id in context_storage.ai_interactions
        stored_interactions = context_storage.ai_interactions[task_id]
        assert len(stored_interactions) > 0
        assert stored_interactions[-1].agent_name == "test-agent"
    
    @pytest.mark.asyncio
    async def test_store_validation_result(self, context_storage):
        """Test storing validation results"""
        task_id = "test-task-002"
        validation = generate_mock_validation_result(
            task_id,
            validation_type="security",
            status="passed",
            score=9.0
        )
        
        await context_storage.store_validation_result(task_id, validation)
        
        # Verify validation was stored
        assert task_id in context_storage.validation_results
        stored_validations = context_storage.validation_results[task_id]
        assert len(stored_validations) > 0
        assert stored_validations[-1].validation_type == "security"
        assert stored_validations[-1].score == 9.0
    
    @pytest.mark.asyncio
    async def test_get_task_context(self, context_storage):
        """Test retrieving comprehensive task context"""
        task_id = "test-task-003"
        
        # Add some interactions and validations
        interaction = generate_mock_ai_interaction(task_id)
        validation = generate_mock_validation_result(task_id)
        
        await context_storage.store_ai_interaction(task_id, interaction)
        await context_storage.store_validation_result(task_id, validation)
        
        # Get full context
        context = await context_storage.get_task_context(task_id)
        
        assert context.task_id == task_id
        assert context.ai_interactions is not None
        assert context.validation_results is not None
        assert len(context.ai_interactions) > 0
        assert len(context.validation_results) > 0
    
    @pytest.mark.asyncio
    async def test_get_codebase_context(self, context_storage):
        """Test retrieving codebase context"""
        task_id = "test-task-004"
        
        codebase_context = await context_storage.get_codebase_context(task_id)
        
        assert codebase_context.task_id == task_id
        assert isinstance(codebase_context.file_changes, list)
        assert isinstance(codebase_context.dependencies, list)


class TestContextEngine:
    """Test ContextEngine functionality"""
    
    @pytest.fixture
    async def context_engine(self):
        """Create context engine with mock database"""
        db_manager = MockDatabaseManager()
        await db_manager.initialize()
        return ContextEngine(db_manager)
    
    @pytest.mark.asyncio
    async def test_generate_prompt_context(self, context_engine):
        """Test generating prompt context"""
        # Use existing mock task from MockTaskStorage
        task_id = "task-001"  # This exists in mock data
        
        prompt_context = await context_engine.generate_prompt_context(task_id)
        
        assert isinstance(prompt_context, PromptContext)
        assert prompt_context.task_id == task_id
        assert prompt_context.task_summary is not None
        assert "title" in prompt_context.task_summary
        assert "status" in prompt_context.task_summary
    
    @pytest.mark.asyncio
    async def test_analyze_context_patterns(self, context_engine):
        """Test context pattern analysis"""
        task_id = "task-001"  # Existing mock task
        
        analytics = await context_engine.analyze_context_patterns(task_id)
        
        assert analytics.task_id == task_id
        assert analytics.complexity_indicators is not None
        assert analytics.interaction_patterns is not None
        assert analytics.validation_trends is not None
        assert analytics.performance_metrics is not None
        assert isinstance(analytics.recommendations, list)
    
    @pytest.mark.asyncio
    async def test_export_context_for_prompt(self, context_engine):
        """Test exporting context for AI prompts"""
        task_id = "task-001"
        
        # Test structured format
        structured_context = await context_engine.export_context_for_prompt(
            task_id, 
            format_type="structured"
        )
        assert isinstance(structured_context, str)
        assert "## Task Summary" in structured_context
        
        # Test narrative format
        narrative_context = await context_engine.export_context_for_prompt(
            task_id,
            format_type="narrative"
        )
        assert isinstance(narrative_context, str)
        assert len(narrative_context) > 0
        
        # Test JSON format
        json_context = await context_engine.export_context_for_prompt(
            task_id,
            format_type="json"
        )
        assert isinstance(json_context, str)
        # Should be valid JSON
        import json
        json.loads(json_context)
    
    @pytest.mark.asyncio
    async def test_get_context_health_score(self, context_engine):
        """Test context health scoring"""
        task_id = "task-001"
        
        health_score = await context_engine.get_context_health_score(task_id)
        
        assert "overall_score" in health_score
        assert "health_status" in health_score
        assert "component_scores" in health_score
        assert "recommendations" in health_score
        assert "last_updated" in health_score
        
        assert isinstance(health_score["overall_score"], (int, float))
        assert health_score["health_status"] in ["excellent", "good", "fair", "poor", "error"]
        assert isinstance(health_score["recommendations"], list)


class TestIntegration:
    """Integration tests for the complete system"""
    
    @pytest.fixture
    async def system(self):
        """Set up complete system with mock database"""
        db_manager = MockDatabaseManager()
        await db_manager.initialize()
        
        task_storage = db_manager.get_task_storage()
        context_storage = db_manager.get_context_storage()
        context_engine = ContextEngine(db_manager)
        
        return {
            "db_manager": db_manager,
            "task_storage": task_storage,
            "context_storage": context_storage,
            "context_engine": context_engine
        }
    
    @pytest.mark.asyncio
    async def test_complete_task_workflow(self, system):
        """Test complete task workflow from creation to completion"""
        task_storage = system["task_storage"]
        context_storage = system["context_storage"]
        context_engine = system["context_engine"]
        
        # 1. Create task
        task = generate_mock_task(
            title="Integration Test Task",
            description="Test complete workflow",
            complexity_score=8,
            priority=TaskPriority.HIGH
        )
        
        task_id = await task_storage.store_task(task)
        assert task_id is not None
        
        # 2. Add AI interaction
        interaction = generate_mock_ai_interaction(
            task_id,
            agent_name="integration-test-agent",
            interaction_type=InteractionType.PROMPT,
            success=True
        )
        await context_storage.store_ai_interaction(task_id, interaction)
        
        # 3. Add validation result
        validation = generate_mock_validation_result(
            task_id,
            validation_type="integration",
            status="passed",
            score=8.5
        )
        await context_storage.store_validation_result(task_id, validation)
        
        # 4. Update task status
        await task_storage.update_task_status(
            task_id,
            TaskStatus.IN_PROGRESS,
            {"started_by": "integration-test", "timestamp": datetime.now().isoformat()}
        )
        
        # 5. Generate prompt context
        prompt_context = await context_engine.generate_prompt_context(task_id)
        assert prompt_context.task_id == task_id
        assert prompt_context.recent_interactions is not None
        assert len(prompt_context.recent_interactions) > 0
        
        # 6. Analyze patterns
        analytics = await context_engine.analyze_context_patterns(task_id)
        assert analytics.task_id == task_id
        assert analytics.complexity_indicators["complexity_score"] == 8
        
        # 7. Get health score
        health_score = await context_engine.get_context_health_score(task_id)
        assert health_score["overall_score"] > 0
        
        # 8. Complete task
        await task_storage.update_task_status(
            task_id,
            TaskStatus.DONE,
            {"completed_by": "integration-test", "result": "success"}
        )
        
        # Verify final state
        final_task = await task_storage.get_task(task_id)
        assert final_task.status == TaskStatus.DONE
    
    @pytest.mark.asyncio
    async def test_dependency_chain_workflow(self, system):
        """Test workflow with task dependencies"""
        task_storage = system["task_storage"]
        
        # Create parent task
        parent_task = generate_mock_task(
            title="Parent Task",
            status=TaskStatus.DONE
        )
        parent_id = await task_storage.store_task(parent_task)
        
        # Create child task
        child_task = generate_mock_task(
            title="Child Task",
            status=TaskStatus.PENDING
        )
        child_id = await task_storage.store_task(child_task)
        
        # Add dependency
        await task_storage.add_task_dependency(parent_id, child_id, DependencyType.BLOCKS)
        
        # Verify dependency
        dependencies = await task_storage.get_task_dependencies(child_id)
        assert parent_id in dependencies
        
        # Test context with dependencies
        context_engine = system["context_engine"]
        prompt_context = await context_engine.generate_prompt_context(child_id)
        
        assert prompt_context.dependency_context is not None
        assert prompt_context.dependency_context["has_dependencies"] == True
        assert prompt_context.dependency_context["is_ready"] == True  # Parent is done
    
    @pytest.mark.asyncio
    async def test_performance_and_scalability(self, system):
        """Test system performance with multiple tasks"""
        task_storage = system["task_storage"]
        context_storage = system["context_storage"]
        
        # Create multiple tasks
        task_ids = []
        for i in range(10):
            task = generate_mock_task(
                title=f"Performance Test Task {i}",
                complexity_score=i % 10 + 1
            )
            task_id = await task_storage.store_task(task)
            task_ids.append(task_id)
            
            # Add interactions for each task
            interaction = generate_mock_ai_interaction(task_id)
            await context_storage.store_ai_interaction(task_id, interaction)
        
        # Test bulk operations
        pending_tasks = await task_storage.get_tasks_by_status(TaskStatus.PENDING)
        assert len(pending_tasks) >= 10
        
        # Test context retrieval for all tasks
        for task_id in task_ids[:5]:  # Test subset for performance
            context = await context_storage.get_task_context(task_id)
            assert context.task_id == task_id


class TestErrorHandling:
    """Test error handling and edge cases"""
    
    @pytest.fixture
    async def task_storage(self):
        return MockTaskStorage()
    
    @pytest.mark.asyncio
    async def test_get_nonexistent_task(self, task_storage):
        """Test retrieving non-existent task"""
        result = await task_storage.get_task("nonexistent-task-id")
        assert result is None
    
    @pytest.mark.asyncio
    async def test_update_nonexistent_task_status(self, task_storage):
        """Test updating status of non-existent task"""
        # Should not raise exception, just do nothing
        await task_storage.update_task_status(
            "nonexistent-task-id",
            TaskStatus.DONE
        )
    
    @pytest.mark.asyncio
    async def test_get_dependencies_nonexistent_task(self, task_storage):
        """Test getting dependencies for non-existent task"""
        dependencies = await task_storage.get_task_dependencies("nonexistent-task-id")
        assert dependencies == []
    
    def test_invalid_task_status(self):
        """Test creating task with invalid status"""
        with pytest.raises(ValueError):
            TaskStatus("invalid-status")
    
    def test_invalid_task_priority(self):
        """Test creating task with invalid priority"""
        with pytest.raises(ValueError):
            TaskPriority("invalid-priority")


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v"])

