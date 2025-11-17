# tests/test_agents/test_orchestrator.py
import pytest
from app.agents.orchestrator import MultiAgentOrchestrator

class TestMultiAgentOrchestrator:
    """Test suite for Multi-Agent Orchestrator"""
    
    def test_run_full_validation(self, db_session, sample_patient, sample_medical_records, sample_coding_case):
        """Test complete multi-agent validation pipeline"""
        orchestrator = MultiAgentOrchestrator(db_session)
        
        report = orchestrator.run_full_validation(
            norm=sample_patient.norm,
            coding_case_id=sample_coding_case.id,
            user_id=None
        )
        
        # Check report structure
        assert 'norm' in report
        assert 'coding_case_id' in report
        assert 'agents_executed' in report
        assert 'total_mismatches' in report
        assert 'overall_status' in report
        
        # Should have executed 3 agents
        assert len(report['agents_executed']) == 3
        
        # Check agent names
        agent_names = [a['agent'] for a in report['agents_executed']]
        assert 'MismatchChecker' in agent_names
        assert 'ICDValidator' in agent_names
        assert 'AutoChecklistGenerator' in agent_names
    
    def test_run_single_agent_mismatch(self, db_session, sample_patient, sample_medical_records, sample_coding_case):
        """Test running single agent - mismatch checker"""
        orchestrator = MultiAgentOrchestrator(db_session)
        
        result = orchestrator.run_single_agent(
            'mismatch',
            sample_patient.norm,
            sample_coding_case.id
        )
        
        assert result['agent'] == 'MismatchChecker'
        assert 'results' in result
        assert 'count' in result
    
    def test_get_validation_summary(self, db_session, sample_patient, sample_medical_records, sample_coding_case):
        """Test getting validation summary"""
        orchestrator = MultiAgentOrchestrator(db_session)
        
        # Run validation first
        orchestrator.run_full_validation(
            sample_patient.norm,
            sample_coding_case.id
        )
        
        # Get summary
        summary = orchestrator.get_validation_summary(sample_coding_case.id)
        
        assert 'coding_case_id' in summary
        assert 'total_flags' in summary
        assert 'checklist_score' in summary
        assert 'quality_level' in summary