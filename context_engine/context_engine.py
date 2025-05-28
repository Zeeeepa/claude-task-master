"""
Context Engine for AI-Driven Task Management
Comprehensive context preservation and retrieval for AI prompt generation
"""

import json
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass

from task_storage.task_storage import (
    DatabaseManager, TaskContext, AIInteraction, ValidationResult,
    CodebaseContext, InteractionType
)


@dataclass
class PromptContext:
    """Structured context for AI prompt generation"""
    task_id: str
    task_summary: Dict[str, Any]
    requirements_context: Optional[Dict[str, Any]] = None
    codebase_context: Optional[Dict[str, Any]] = None
    recent_interactions: Optional[List[Dict[str, Any]]] = None
    validation_history: Optional[List[Dict[str, Any]]] = None
    dependency_context: Optional[Dict[str, Any]] = None
    performance_context: Optional[Dict[str, Any]] = None
    workflow_state: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


@dataclass
class ContextAnalytics:
    """Analytics and insights from context data"""
    task_id: str
    complexity_indicators: Dict[str, Any]
    interaction_patterns: Dict[str, Any]
    validation_trends: Dict[str, Any]
    performance_metrics: Dict[str, Any]
    recommendations: List[str]


class ContextEngine:
    """Advanced context engine for AI-driven development"""
    
    def __init__(self, db_manager: DatabaseManager):
        self.db_manager = db_manager
        self.logger = logging.getLogger(__name__)

    async def generate_prompt_context(self, task_id: str, 
                                    include_history: bool = True,
                                    max_interactions: int = 10,
                                    max_validations: int = 5) -> PromptContext:
        """Generate comprehensive context for AI prompt generation"""
        try:
            # Get basic task information
            task_storage = self.db_manager.get_task_storage()
            task = await task_storage.get_task(task_id)
            
            if not task:
                raise ValueError(f"Task {task_id} not found")
            
            # Get comprehensive context
            context_storage = self.db_manager.get_context_storage()
            full_context = await context_storage.get_task_context(task_id)
            
            # Get dependency context
            dependencies = await task_storage.get_task_dependencies(task_id)
            dependency_context = await self._build_dependency_context(task_id, dependencies)
            
            # Get performance context
            performance_context = await self._get_performance_context(task_id)
            
            # Build task summary
            task_summary = {
                'id': task.id,
                'title': task.title,
                'description': task.description,
                'status': task.status.value if hasattr(task.status, 'value') else task.status,
                'priority': task.priority.value if hasattr(task.priority, 'value') else task.priority,
                'complexity_score': task.complexity_score,
                'affected_files': task.affected_files,
                'tags': task.tags,
                'created_at': task.created_at.isoformat() if task.created_at else None,
                'updated_at': task.updated_at.isoformat() if task.updated_at else None,
                'assigned_to': task.assigned_to,
                'estimated_hours': task.estimated_hours,
                'actual_hours': task.actual_hours
            }
            
            # Filter recent interactions
            recent_interactions = None
            if include_history and full_context.ai_interactions:
                recent_interactions = full_context.ai_interactions[:max_interactions]
            
            # Filter recent validations
            validation_history = None
            if include_history and full_context.validation_results:
                validation_history = full_context.validation_results[:max_validations]
            
            return PromptContext(
                task_id=task_id,
                task_summary=task_summary,
                requirements_context=full_context.requirements_context,
                codebase_context=full_context.codebase_context,
                recent_interactions=recent_interactions,
                validation_history=validation_history,
                dependency_context=dependency_context,
                performance_context=performance_context,
                workflow_state=full_context.workflow_state,
                metadata=full_context.metadata
            )
            
        except Exception as e:
            self.logger.error(f"Error generating prompt context for task {task_id}: {e}")
            raise

    async def _build_dependency_context(self, task_id: str, dependencies: List[str]) -> Dict[str, Any]:
        """Build context about task dependencies"""
        if not dependencies:
            return {'has_dependencies': False, 'dependencies': []}
        
        dependency_info = []
        task_storage = self.db_manager.get_task_storage()
        
        for dep_id in dependencies:
            dep_task = await task_storage.get_task(dep_id)
            if dep_task:
                dependency_info.append({
                    'id': dep_task.id,
                    'title': dep_task.title,
                    'status': dep_task.status.value if hasattr(dep_task.status, 'value') else dep_task.status,
                    'priority': dep_task.priority.value if hasattr(dep_task.priority, 'value') else dep_task.priority,
                    'complexity_score': dep_task.complexity_score
                })
        
        # Analyze dependency status
        completed_deps = [d for d in dependency_info if d['status'] == 'done']
        pending_deps = [d for d in dependency_info if d['status'] in ['pending', 'in-progress']]
        blocked_deps = [d for d in dependency_info if d['status'] in ['blocked', 'deferred']]
        
        return {
            'has_dependencies': True,
            'total_dependencies': len(dependency_info),
            'completed_dependencies': len(completed_deps),
            'pending_dependencies': len(pending_deps),
            'blocked_dependencies': len(blocked_deps),
            'dependencies': dependency_info,
            'is_ready': len(pending_deps) == 0 and len(blocked_deps) == 0
        }

    async def _get_performance_context(self, task_id: str) -> Dict[str, Any]:
        """Get performance metrics context for task"""
        async with self.db_manager.pool.acquire() as conn:
            query = """
            SELECT metric_type, metric_name, metric_value, unit, timestamp
            FROM performance_metrics
            WHERE task_id = $1
            ORDER BY timestamp DESC
            LIMIT 20
            """
            
            rows = await conn.fetch(query, task_id)
            
            if not rows:
                return {'has_metrics': False}
            
            metrics = []
            for row in rows:
                metrics.append({
                    'type': row['metric_type'],
                    'name': row['metric_name'],
                    'value': float(row['metric_value']) if row['metric_value'] else None,
                    'unit': row['unit'],
                    'timestamp': row['timestamp'].isoformat()
                })
            
            # Analyze performance trends
            execution_times = [m for m in metrics if m['type'] == 'execution_time']
            avg_execution_time = sum(m['value'] for m in execution_times if m['value']) / len(execution_times) if execution_times else None
            
            return {
                'has_metrics': True,
                'total_metrics': len(metrics),
                'avg_execution_time': avg_execution_time,
                'recent_metrics': metrics[:10],
                'performance_summary': {
                    'execution_times': len(execution_times),
                    'avg_execution_time_ms': avg_execution_time
                }
            }

    async def analyze_context_patterns(self, task_id: str) -> ContextAnalytics:
        """Analyze context patterns and provide insights"""
        try:
            # Get full context
            prompt_context = await self.generate_prompt_context(task_id)
            
            # Analyze complexity indicators
            complexity_indicators = self._analyze_complexity(prompt_context)
            
            # Analyze interaction patterns
            interaction_patterns = self._analyze_interactions(prompt_context.recent_interactions)
            
            # Analyze validation trends
            validation_trends = self._analyze_validations(prompt_context.validation_history)
            
            # Analyze performance metrics
            performance_metrics = self._analyze_performance(prompt_context.performance_context)
            
            # Generate recommendations
            recommendations = self._generate_recommendations(
                complexity_indicators, interaction_patterns, validation_trends, performance_metrics
            )
            
            return ContextAnalytics(
                task_id=task_id,
                complexity_indicators=complexity_indicators,
                interaction_patterns=interaction_patterns,
                validation_trends=validation_trends,
                performance_metrics=performance_metrics,
                recommendations=recommendations
            )
            
        except Exception as e:
            self.logger.error(f"Error analyzing context patterns for task {task_id}: {e}")
            raise

    def _analyze_complexity(self, context: PromptContext) -> Dict[str, Any]:
        """Analyze task complexity indicators"""
        indicators = {
            'complexity_score': context.task_summary.get('complexity_score'),
            'affected_files_count': len(context.task_summary.get('affected_files', [])),
            'has_dependencies': context.dependency_context.get('has_dependencies', False),
            'dependency_count': context.dependency_context.get('total_dependencies', 0),
            'requirements_complexity': 'high' if context.requirements_context else 'low'
        }
        
        # Calculate overall complexity level
        complexity_factors = 0
        if indicators['complexity_score'] and indicators['complexity_score'] > 7:
            complexity_factors += 2
        elif indicators['complexity_score'] and indicators['complexity_score'] > 5:
            complexity_factors += 1
            
        if indicators['affected_files_count'] > 5:
            complexity_factors += 2
        elif indicators['affected_files_count'] > 2:
            complexity_factors += 1
            
        if indicators['dependency_count'] > 3:
            complexity_factors += 1
            
        if complexity_factors >= 4:
            indicators['overall_complexity'] = 'very_high'
        elif complexity_factors >= 3:
            indicators['overall_complexity'] = 'high'
        elif complexity_factors >= 2:
            indicators['overall_complexity'] = 'medium'
        else:
            indicators['overall_complexity'] = 'low'
        
        return indicators

    def _analyze_interactions(self, interactions: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
        """Analyze AI interaction patterns"""
        if not interactions:
            return {'has_interactions': False}
        
        # Count interaction types
        type_counts = {}
        error_count = 0
        total_execution_time = 0
        execution_count = 0
        
        for interaction in interactions:
            interaction_type = interaction.get('interaction_type', 'unknown')
            type_counts[interaction_type] = type_counts.get(interaction_type, 0) + 1
            
            if not interaction.get('success', True):
                error_count += 1
            
            exec_time = interaction.get('execution_time_ms')
            if exec_time:
                total_execution_time += exec_time
                execution_count += 1
        
        avg_execution_time = total_execution_time / execution_count if execution_count > 0 else None
        error_rate = error_count / len(interactions) if interactions else 0
        
        return {
            'has_interactions': True,
            'total_interactions': len(interactions),
            'interaction_types': type_counts,
            'error_count': error_count,
            'error_rate': error_rate,
            'avg_execution_time_ms': avg_execution_time,
            'success_rate': 1 - error_rate
        }

    def _analyze_validations(self, validations: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
        """Analyze validation trends"""
        if not validations:
            return {'has_validations': False}
        
        # Count validation results
        status_counts = {}
        type_counts = {}
        total_score = 0
        score_count = 0
        
        for validation in validations:
            status = validation.get('status', 'unknown')
            validation_type = validation.get('validation_type', 'unknown')
            
            status_counts[status] = status_counts.get(status, 0) + 1
            type_counts[validation_type] = type_counts.get(validation_type, 0) + 1
            
            score = validation.get('score')
            if score is not None:
                total_score += score
                score_count += 1
        
        avg_score = total_score / score_count if score_count > 0 else None
        pass_rate = status_counts.get('passed', 0) / len(validations) if validations else 0
        
        return {
            'has_validations': True,
            'total_validations': len(validations),
            'status_distribution': status_counts,
            'validation_types': type_counts,
            'avg_score': avg_score,
            'pass_rate': pass_rate,
            'recent_trend': self._calculate_validation_trend(validations)
        }

    def _calculate_validation_trend(self, validations: List[Dict[str, Any]]) -> str:
        """Calculate validation trend (improving, declining, stable)"""
        if len(validations) < 3:
            return 'insufficient_data'
        
        # Look at recent vs older validations
        recent = validations[:len(validations)//2]
        older = validations[len(validations)//2:]
        
        recent_pass_rate = sum(1 for v in recent if v.get('status') == 'passed') / len(recent)
        older_pass_rate = sum(1 for v in older if v.get('status') == 'passed') / len(older)
        
        if recent_pass_rate > older_pass_rate + 0.1:
            return 'improving'
        elif recent_pass_rate < older_pass_rate - 0.1:
            return 'declining'
        else:
            return 'stable'

    def _analyze_performance(self, performance_context: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze performance metrics"""
        if not performance_context or not performance_context.get('has_metrics'):
            return {'has_performance_data': False}
        
        metrics = performance_context.get('recent_metrics', [])
        
        # Analyze execution time trends
        execution_times = [m['value'] for m in metrics if m['type'] == 'execution_time' and m['value']]
        
        performance_analysis = {
            'has_performance_data': True,
            'total_metrics': len(metrics),
            'avg_execution_time': performance_context.get('avg_execution_time'),
            'execution_time_trend': self._calculate_performance_trend(execution_times)
        }
        
        return performance_analysis

    def _calculate_performance_trend(self, execution_times: List[float]) -> str:
        """Calculate performance trend"""
        if len(execution_times) < 3:
            return 'insufficient_data'
        
        # Simple trend analysis
        recent_avg = sum(execution_times[:len(execution_times)//2]) / (len(execution_times)//2)
        older_avg = sum(execution_times[len(execution_times)//2:]) / (len(execution_times) - len(execution_times)//2)
        
        if recent_avg < older_avg * 0.9:
            return 'improving'
        elif recent_avg > older_avg * 1.1:
            return 'declining'
        else:
            return 'stable'

    def _generate_recommendations(self, complexity: Dict[str, Any], 
                                interactions: Dict[str, Any],
                                validations: Dict[str, Any],
                                performance: Dict[str, Any]) -> List[str]:
        """Generate actionable recommendations based on context analysis"""
        recommendations = []
        
        # Complexity-based recommendations
        if complexity.get('overall_complexity') == 'very_high':
            recommendations.append("Consider breaking this task into smaller subtasks due to very high complexity")
        elif complexity.get('overall_complexity') == 'high':
            recommendations.append("Task has high complexity - ensure thorough testing and validation")
        
        if complexity.get('dependency_count', 0) > 3:
            recommendations.append("High number of dependencies - verify all prerequisites are completed")
        
        # Interaction-based recommendations
        if interactions.get('error_rate', 0) > 0.3:
            recommendations.append("High error rate in AI interactions - review prompts and context quality")
        
        if interactions.get('avg_execution_time_ms', 0) > 5000:
            recommendations.append("Long AI interaction times - consider optimizing prompts or context size")
        
        # Validation-based recommendations
        if validations.get('pass_rate', 1) < 0.7:
            recommendations.append("Low validation pass rate - review code quality and testing strategy")
        
        if validations.get('recent_trend') == 'declining':
            recommendations.append("Validation quality is declining - investigate recent changes")
        
        # Performance-based recommendations
        if performance.get('execution_time_trend') == 'declining':
            recommendations.append("Performance is declining - consider optimization opportunities")
        
        # General recommendations
        if not interactions.get('has_interactions'):
            recommendations.append("No AI interactions recorded - ensure proper logging is enabled")
        
        if not validations.get('has_validations'):
            recommendations.append("No validation results - implement automated validation checks")
        
        return recommendations

    async def export_context_for_prompt(self, task_id: str, format_type: str = 'structured') -> str:
        """Export context in format suitable for AI prompts"""
        context = await self.generate_prompt_context(task_id)
        
        if format_type == 'structured':
            return self._format_structured_context(context)
        elif format_type == 'narrative':
            return self._format_narrative_context(context)
        elif format_type == 'json':
            return json.dumps(context.__dict__, indent=2, default=str)
        else:
            raise ValueError(f"Unsupported format type: {format_type}")

    def _format_structured_context(self, context: PromptContext) -> str:
        """Format context in structured format for AI prompts"""
        sections = []
        
        # Task Summary
        sections.append("## Task Summary")
        sections.append(f"**ID**: {context.task_summary['id']}")
        sections.append(f"**Title**: {context.task_summary['title']}")
        sections.append(f"**Status**: {context.task_summary['status']}")
        sections.append(f"**Priority**: {context.task_summary['priority']}")
        if context.task_summary.get('complexity_score'):
            sections.append(f"**Complexity**: {context.task_summary['complexity_score']}/10")
        sections.append(f"**Description**: {context.task_summary.get('description', 'N/A')}")
        
        # Dependencies
        if context.dependency_context and context.dependency_context.get('has_dependencies'):
            sections.append("\n## Dependencies")
            dep_ctx = context.dependency_context
            sections.append(f"**Total Dependencies**: {dep_ctx['total_dependencies']}")
            sections.append(f"**Completed**: {dep_ctx['completed_dependencies']}")
            sections.append(f"**Pending**: {dep_ctx['pending_dependencies']}")
            sections.append(f"**Ready to Start**: {'Yes' if dep_ctx['is_ready'] else 'No'}")
        
        # Recent Interactions
        if context.recent_interactions:
            sections.append("\n## Recent AI Interactions")
            for i, interaction in enumerate(context.recent_interactions[:3]):
                sections.append(f"**Interaction {i+1}**: {interaction['interaction_type']} by {interaction['agent_name']}")
                if interaction.get('error_message'):
                    sections.append(f"  - Error: {interaction['error_message']}")
        
        # Validation History
        if context.validation_history:
            sections.append("\n## Recent Validations")
            for validation in context.validation_history[:3]:
                status_emoji = "✅" if validation['status'] == 'passed' else "❌" if validation['status'] == 'failed' else "⚠️"
                sections.append(f"{status_emoji} **{validation['validation_type']}**: {validation['status']} ({validation['validator_name']})")
        
        # Codebase Context
        if context.codebase_context:
            sections.append("\n## Codebase Context")
            sections.append("Recent file changes and code context available")
        
        return "\n".join(sections)

    def _format_narrative_context(self, context: PromptContext) -> str:
        """Format context in narrative format for AI prompts"""
        narrative = []
        
        # Task introduction
        task = context.task_summary
        narrative.append(f"You are working on task '{task['title']}' (ID: {task['id']}), which is currently {task['status']} with {task['priority']} priority.")
        
        if task.get('description'):
            narrative.append(f"The task involves: {task['description']}")
        
        # Dependencies
        if context.dependency_context and context.dependency_context.get('has_dependencies'):
            dep_ctx = context.dependency_context
            if dep_ctx['is_ready']:
                narrative.append("All dependencies have been satisfied and the task is ready to begin.")
            else:
                narrative.append(f"This task has {dep_ctx['pending_dependencies']} pending dependencies that must be completed first.")
        
        # Complexity and scope
        if task.get('complexity_score'):
            complexity_desc = {
                range(1, 4): "low complexity",
                range(4, 7): "medium complexity", 
                range(7, 9): "high complexity",
                range(9, 11): "very high complexity"
            }
            for score_range, desc in complexity_desc.items():
                if task['complexity_score'] in score_range:
                    narrative.append(f"This is a {desc} task (score: {task['complexity_score']}/10).")
                    break
        
        # Recent context
        if context.recent_interactions:
            interaction_count = len(context.recent_interactions)
            error_count = sum(1 for i in context.recent_interactions if not i.get('success', True))
            if error_count > 0:
                narrative.append(f"There have been {interaction_count} recent AI interactions with {error_count} errors that may need attention.")
            else:
                narrative.append(f"There have been {interaction_count} successful recent AI interactions.")
        
        # Validation status
        if context.validation_history:
            recent_validations = context.validation_history[:3]
            passed = sum(1 for v in recent_validations if v['status'] == 'passed')
            narrative.append(f"Recent validation results show {passed}/{len(recent_validations)} checks passing.")
        
        return " ".join(narrative)

    async def get_context_health_score(self, task_id: str) -> Dict[str, Any]:
        """Calculate overall context health score for task"""
        try:
            analytics = await self.analyze_context_patterns(task_id)
            
            # Calculate component scores (0-100)
            scores = {}
            
            # Interaction health (based on success rate and response times)
            if analytics.interaction_patterns.get('has_interactions'):
                success_rate = analytics.interaction_patterns.get('success_rate', 0)
                avg_time = analytics.interaction_patterns.get('avg_execution_time_ms', 0)
                time_score = max(0, 100 - (avg_time / 100)) if avg_time else 100  # Penalize slow responses
                scores['interaction_health'] = (success_rate * 70) + (time_score * 0.3)
            else:
                scores['interaction_health'] = 50  # Neutral score for no data
            
            # Validation health (based on pass rate and trends)
            if analytics.validation_trends.get('has_validations'):
                pass_rate = analytics.validation_trends.get('pass_rate', 0)
                trend = analytics.validation_trends.get('recent_trend', 'stable')
                trend_bonus = {'improving': 10, 'stable': 0, 'declining': -20}.get(trend, 0)
                scores['validation_health'] = min(100, max(0, (pass_rate * 100) + trend_bonus))
            else:
                scores['validation_health'] = 50  # Neutral score for no data
            
            # Performance health
            if analytics.performance_metrics.get('has_performance_data'):
                trend = analytics.performance_metrics.get('execution_time_trend', 'stable')
                trend_score = {'improving': 90, 'stable': 70, 'declining': 40}.get(trend, 50)
                scores['performance_health'] = trend_score
            else:
                scores['performance_health'] = 50
            
            # Complexity health (lower complexity = higher health)
            complexity = analytics.complexity_indicators.get('overall_complexity', 'medium')
            complexity_scores = {'low': 90, 'medium': 70, 'high': 50, 'very_high': 30}
            scores['complexity_health'] = complexity_scores.get(complexity, 50)
            
            # Overall health score (weighted average)
            weights = {
                'interaction_health': 0.3,
                'validation_health': 0.3,
                'performance_health': 0.2,
                'complexity_health': 0.2
            }
            
            overall_score = sum(scores[key] * weights[key] for key in scores)
            
            # Determine health status
            if overall_score >= 80:
                health_status = 'excellent'
            elif overall_score >= 60:
                health_status = 'good'
            elif overall_score >= 40:
                health_status = 'fair'
            else:
                health_status = 'poor'
            
            return {
                'overall_score': round(overall_score, 1),
                'health_status': health_status,
                'component_scores': scores,
                'recommendations': analytics.recommendations,
                'last_updated': datetime.now().isoformat()
            }
            
        except Exception as e:
            self.logger.error(f"Error calculating context health score: {e}")
            return {
                'overall_score': 0,
                'health_status': 'error',
                'error': str(e),
                'last_updated': datetime.now().isoformat()
            }

