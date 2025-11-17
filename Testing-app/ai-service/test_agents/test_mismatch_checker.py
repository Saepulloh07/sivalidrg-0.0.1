# tests/test_agents/test_mismatch_checker.py
import pytest
from app.agents.mismatch_checker import MismatchCheckerAgent

class TestMismatchCheckerAgent:
    """Test suite for Mismatch Checker Agent"""
    
    def test_check_diagnosis_consistency_pass(self, db_session, sample_patient, sample_medical_records):
        """Test diagnosis consistency check - should pass"""
        agent = MismatchCheckerAgent(db_session)
        
        resume = sample_medical_records['resume']
        mismatches = agent._check_diagnosis_consistency(
            sample_patient.norm, 
            resume
        )
        
        # Should have no or minimal mismatches
        assert len(mismatches) <= 1, "Expected consistent diagnoses"
    
    def test_check_lab_support_pass(self, db_session, sample_patient, sample_medical_records):
        """Test lab support validation - should pass for diabetes"""
        agent = MismatchCheckerAgent(db_session)
        
        resume = sample_medical_records['resume']
        mismatches = agent._check_lab_support(
            sample_patient.norm,
            resume,
            'male'
        )
        
        # Diabetes should be supported by GDS 385 and HbA1c 11.2
        diabetes_mismatches = [
            m for m in mismatches 
            if 'diabetes' in m.get('expected_value', '').lower()
        ]
        assert len(diabetes_mismatches) == 0, "Diabetes should be supported by labs"
    
    def test_check_vital_support_pass(self, db_session, sample_patient, sample_medical_records):
        """Test vital signs support for hypertension"""
        agent = MismatchCheckerAgent(db_session)
        
        resume = sample_medical_records['resume']
        mismatches = agent._check_vital_support(
            sample_patient.norm,
            resume
        )
        
        # Hypertension should be supported by SBP 160, DBP 95
        assert len(mismatches) == 0, "Hypertension should be supported by vitals"
    
    def test_full_check_patient_mismatches(self, db_session, sample_patient, sample_medical_records):
        """Test complete mismatch checking"""
        agent = MismatchCheckerAgent(db_session)
        
        mismatches = agent.check_patient_mismatches(sample_patient.norm)
        
        # Should return list (even if empty)
        assert isinstance(mismatches, list)
        
        # Check structure of mismatches
        if len(mismatches) > 0:
            mismatch = mismatches[0]
            assert 'mismatch_type' in mismatch
            assert 'severity' in mismatch
            assert 'recommendation' in mismatch
    
    def test_semantic_similarity(self, db_session):
        """Test semantic similarity calculation"""
        agent = MismatchCheckerAgent(db_session)
        
        text1 = "diabetes mellitus tipe 2"
        text2 = "dm tipe 2"
        
        emb1 = agent._get_embedding(text1)
        emb2 = agent._get_embedding(text2)
        
        assert emb1.shape == emb2.shape
        assert len(emb1) > 0
        
        # Check synonym detection
        synonym_score = agent._check_synonym(text1, text2)
        assert synonym_score > 0.5, "Should detect diabetes synonym"