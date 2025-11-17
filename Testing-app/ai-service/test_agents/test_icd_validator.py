# tests/test_agents/test_icd_validator.py
import pytest
from app.agents.icd_validator import ICDValidatorAgent
from app.models import ICDMaster, CodeTypeEnum

class TestICDValidatorAgent:
    """Test suite for ICD Validator Agent"""
    
    @pytest.fixture(autouse=True)
    def setup_icd_master(self, db_session):
        """Setup ICD master data for testing"""
        icd_codes = [
            ICDMaster(
                code="E11.2",
                code_type=CodeTypeEnum.diagnosis,
                description="Diabetes mellitus tipe 2 dengan komplikasi ginjal",
                category="Endocrine"
            ),
            ICDMaster(
                code="E11.9",
                code_type=CodeTypeEnum.diagnosis,
                description="Diabetes mellitus tipe 2 tanpa komplikasi",
                category="Endocrine"
            ),
            ICDMaster(
                code="I11.9",
                code_type=CodeTypeEnum.diagnosis,
                description="Penyakit jantung hipertensi tanpa gagal jantung",
                category="Circulatory"
            ),
        ]
        
        for icd in icd_codes:
            db_session.add(icd)
        
        db_session.commit()
    
    def test_validate_icd10_code_exists(self, db_session, sample_patient, sample_medical_records):
        """Test ICD-10 code validation - code exists in master"""
        agent = ICDValidatorAgent(db_session)
        
        resume = sample_medical_records['resume']
        
        mismatches = agent._validate_icd10_code(
            "E11.9",
            "Diabetes mellitus tipe 2",
            sample_patient.norm,
            is_primary=True
        )
        
        # Code exists, should have no critical errors
        critical = [m for m in mismatches if m['severity'].value == 'critical']
        assert len(critical) == 0, "Valid ICD code should not have critical errors"
    
    def test_validate_icd10_code_not_exists(self, db_session, sample_patient):
        """Test ICD-10 code validation - code not in master"""
        agent = ICDValidatorAgent(db_session)
        
        mismatches = agent._validate_icd10_code(
            "Z99.9",  # Non-existent code
            "Some diagnosis",
            sample_patient.norm,
            is_primary=True
        )
        
        # Should flag as not found
        assert len(mismatches) > 0
        assert any('tidak ditemukan' in m['recommendation'].lower() for m in mismatches)
    
    def test_semantic_consistency_check(self, db_session, sample_patient):
        """Test semantic consistency between ICD and diagnosis"""
        agent = ICDValidatorAgent(db_session)
        
        # Good match
        mismatches_good = agent._validate_icd10_code(
            "E11.9",
            "Diabetes mellitus tipe 2 tidak terkontrol",
            sample_patient.norm,
            is_primary=True
        )
        
        # Poor match
        mismatches_bad = agent._validate_icd10_code(
            "E11.9",
            "Pneumonia bakterial",  # Completely different
            sample_patient.norm,
            is_primary=True
        )
        
        # Bad match should have more/worse mismatches
        assert len(mismatches_bad) >= len(mismatches_good)
    
    def test_get_icd_suggestions(self, db_session):
        """Test ICD code suggestions via semantic search"""
        agent = ICDValidatorAgent(db_session)
        
        suggestions = agent.get_icd_suggestions(
            "diabetes mellitus",
            CodeTypeEnum.diagnosis,
            top_k=3
        )
        
        assert len(suggestions) > 0
        assert len(suggestions) <= 3
        
        # Check structure
        for sugg in suggestions:
            assert 'code' in sugg
            assert 'description' in sugg
            assert 'similarity' in sugg
            assert 0 <= sugg['similarity'] <= 1