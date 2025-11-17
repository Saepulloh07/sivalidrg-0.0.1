# tests/test_agents/test_auto_checklist.py
import pytest
from app.agents.auto_checklist import AutoChecklistAgent
from datetime import date, timedelta

class TestAutoChecklistAgent:
    """Test suite for Auto-Checklist Generator Agent"""
    
    def test_generate_checklist_complete(self, db_session, sample_patient, sample_medical_records, sample_coding_case):
        """Test complete checklist generation"""
        agent = AutoChecklistAgent(db_session)
        
        checklist = agent.generate_checklist(
            sample_patient.norm,
            [],  # No mismatch flags
            sample_coding_case.id
        )
        
        assert 'checks' in checklist
        assert 'summary' in checklist
        assert len(checklist['checks']) > 0
        
        # Check summary structure
        summary = checklist['summary']
        assert 'total_checks' in summary
        assert 'passed_checks' in summary
        assert 'overall_score' in summary
        assert 'quality_level' in summary
    
    def test_check_duration_anomaly_normal(self, db_session, sample_patient, sample_medical_records):
        """Test duration check - normal case"""
        agent = AutoChecklistAgent(db_session)
        
        resume = sample_medical_records['resume']
        # Same day admission/discharge
        resume.tanggal_masuk = date.today()
        resume.tanggal_keluar = date.today()
        db_session.commit()
        
        result = agent._check_duration_anomaly(sample_patient.norm, resume)
        
        assert result['check_name'] == 'Duration Anomaly'
        # 1 day should be acceptable for moderate severity
        assert result['status'] in ['pass', 'warning']
    
    def test_check_duration_anomaly_too_long(self, db_session, sample_patient, sample_medical_records):
        """Test duration check - suspiciously long"""
        agent = AutoChecklistAgent(db_session)
        
        resume = sample_medical_records['resume']
        resume.tanggal_masuk = date.today() - timedelta(days=30)
        resume.tanggal_keluar = date.today()
        db_session.commit()
        
        result = agent._check_duration_anomaly(sample_patient.norm, resume)
        
        # 30 days might be too long for moderate diagnosis
        assert result['status'] in ['warning', 'fail']
    
    def test_check_documentation_completeness(self, db_session, sample_patient, sample_medical_records):
        """Test documentation completeness check"""
        agent = AutoChecklistAgent(db_session)
        
        resume = sample_medical_records['resume']
        
        result = agent._check_documentation_completeness(
            sample_patient.norm,
            resume
        )
        
        assert result['check_name'] == 'Documentation Completeness'
        assert 'score' in result
        assert 'details' in result
        
        # Should have CPPT, lab, vitals
        details = result['details']
        assert details['cppt_count'] > 0
        assert details['lab_count'] > 0
        assert details['vital_count'] > 0
    
    def test_overall_score_calculation(self, db_session, sample_patient, sample_medical_records, sample_coding_case):
        """Test overall quality score calculation"""
        agent = AutoChecklistAgent(db_session)
        
        checklist = agent.generate_checklist(
            sample_patient.norm,
            [],
            sample_coding_case.id
        )
        
        summary = checklist['summary']
        
        # Score should be 0-100
        assert 0 <= summary['overall_score'] <= 100
        
        # Score calculation should be consistent
        expected_score = (summary['passed_checks'] / summary['total_checks']) * 100
        assert abs(summary['overall_score'] - expected_score) < 1