# app/agents/icd_validator.py
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from app.models import (
    ICDMaster, ResumeMedis, CPPT, LaporanOperasi,
    CodeTypeEnum, MismatchFlag, MismatchTypeEnum, SeverityEnum
)
from sentence_transformers import SentenceTransformer
import numpy as np
import logging
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load model
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

# ICD-10 Documentation Requirements
ICD10_DOCUMENTATION_REQUIREMENTS = {
    # Infectious diseases (A00-B99)
    r'^A\d{2}': {
        'required_fields': ['pathogen', 'culture_result', 'symptoms'],
        'min_documentation_length': 100,
        'keywords': ['infeksi', 'bakteri', 'virus', 'kultur', 'demam']
    },
    # Neoplasms (C00-D48)
    r'^C\d{2}': {
        'required_fields': ['histopathology', 'staging', 'location'],
        'min_documentation_length': 150,
        'keywords': ['tumor', 'kanker', 'biopsi', 'stadium', 'metastasis', 'histopatologi']
    },
    # Endocrine (E00-E90)
    r'^E\d{2}': {
        'required_fields': ['lab_values', 'symptoms'],
        'min_documentation_length': 80,
        'keywords': ['diabetes', 'tiroid', 'metabolik', 'hormon', 'gula darah']
    },
    # Circulatory (I00-I99)
    r'^I\d{2}': {
        'required_fields': ['symptoms', 'vital_signs', 'examination'],
        'min_documentation_length': 100,
        'keywords': ['jantung', 'tekanan darah', 'ekg', 'kardio', 'hipertensi']
    },
    # Respiratory (J00-J99)
    r'^J\d{2}': {
        'required_fields': ['symptoms', 'imaging'],
        'min_documentation_length': 80,
        'keywords': ['napas', 'paru', 'batuk', 'sesak', 'rontgen', 'ct scan']
    },
    # Digestive (K00-K93)
    r'^K\d{2}': {
        'required_fields': ['symptoms', 'examination'],
        'min_documentation_length': 80,
        'keywords': ['perut', 'mual', 'muntah', 'diare', 'pencernaan', 'abdomen']
    },
    # Pregnancy (O00-O99)
    r'^O\d{2}': {
        'required_fields': ['gestational_age', 'obstetric_history'],
        'min_documentation_length': 100,
        'keywords': ['hamil', 'partus', 'gravida', 'obstetri', 'janin']
    },
    # Injury (S00-T98)
    r'^[ST]\d{2}': {
        'required_fields': ['mechanism', 'location', 'severity'],
        'min_documentation_length': 80,
        'keywords': ['trauma', 'luka', 'cedera', 'fraktur', 'kecelakaan']
    },
}

# ICD-9-CM Procedure Requirements
ICD9_PROCEDURE_REQUIREMENTS = {
    'surgery': {
        'keywords': ['operasi', 'insisi', 'eksisi', 'reseksi', 'anastomosis'],
        'required_docs': ['laporan operasi', 'temuan operasi']
    },
    'imaging': {
        'keywords': ['ct', 'mri', 'rontgen', 'usg', 'radiologi'],
        'required_docs': ['hasil radiologi']
    },
    'diagnostic': {
        'keywords': ['biopsi', 'endoskopi', 'kolonoskopi', 'bronkoskopi'],
        'required_docs': ['hasil pemeriksaan', 'histopatologi']
    },
}


class ICDValidatorAgent:
    """
    Agent 2: ICD Validator
    
    Responsibilities:
    1. Validate ICD-10 codes exist in master
    2. Check documentation completeness for ICD codes
    3. Verify consistency between ICD and diagnosis description
    4. Validate ICD-9-CM procedure codes
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.model = model
        self._embedding_cache = {}
    
    def validate_icd_codes(self, norm: str, coding_case_id: Optional[int] = None) -> List[Dict]:
        """
        Main validation method for ICD codes.
        """
        logger.info(f"Validating ICD codes for patient NoRM: {norm}")
        
        mismatches = []
        
        # Get medical resume
        resume = self.db.query(ResumeMedis).filter(
            ResumeMedis.norm == norm
        ).order_by(ResumeMedis.created_at.desc()).first()
        
        if not resume:
            logger.warning(f"No medical resume found for {norm}")
            return []
        
        # Validate ICD-10 diagnosis codes
        if resume.icd10_diagnosa_utama:
            icd10_mismatches = self._validate_icd10_code(
                resume.icd10_diagnosa_utama,
                resume.diagnosa_utama,
                norm,
                is_primary=True
            )
            mismatches.extend(icd10_mismatches)
        
        if resume.icd10_diagnosa_penyerta:
            secondary_codes = [c.strip() for c in resume.icd10_diagnosa_penyerta.split(',')]
            secondary_diags = [d.strip() for d in (resume.diagnosa_penyerta or '').split(',')]
            
            for idx, code in enumerate(secondary_codes):
                diag = secondary_diags[idx] if idx < len(secondary_diags) else ""
                icd10_mismatches = self._validate_icd10_code(
                    code, diag, norm, is_primary=False
                )
                mismatches.extend(icd10_mismatches)
        
        # Validate ICD-9-CM procedure codes
        if resume.icd9_tindakan:
            procedure_codes = [c.strip() for c in resume.icd9_tindakan.split(',')]
            procedures = [p.strip() for p in (resume.tindakan or '').split(',')]
            
            for idx, code in enumerate(procedure_codes):
                proc = procedures[idx] if idx < len(procedures) else ""
                icd9_mismatches = self._validate_icd9_code(code, proc, norm)
                mismatches.extend(icd9_mismatches)
        
        logger.info(f"Found {len(mismatches)} ICD validation issues")
        return mismatches
    
    def _validate_icd10_code(self, code: str, diagnosis: str, norm: str,
                             is_primary: bool = True) -> List[Dict]:
        """
        Validate a single ICD-10 code.
        """
        mismatches = []
        
        if not code:
            return []
        
        # Check 1: Code exists in master
        icd_record = self.db.query(ICDMaster).filter(
            ICDMaster.code == code,
            ICDMaster.code_type == CodeTypeEnum.diagnosis
        ).first()
        
        if not icd_record:
            mismatches.append({
                "mismatch_type": MismatchTypeEnum.icd_inconsistent,
                "severity": SeverityEnum.critical,
                "field_name": "icd10_code",
                "expected_value": f"Valid ICD-10 code in master",
                "actual_value": code,
                "similarity_score": 0.0,
                "evidence": {"code": code, "diagnosis": diagnosis},
                "recommendation": f"Kode ICD-10 '{code}' tidak ditemukan dalam master ICD. Verifikasi kode yang benar."
            })
            return mismatches
        
        # Check 2: Semantic consistency between ICD description and diagnosis
        if diagnosis:
            icd_desc_emb = self._get_embedding(icd_record.description.lower())
            diag_emb = self._get_embedding(diagnosis.lower())
            similarity = float(np.dot(icd_desc_emb, diag_emb))
            
            if similarity < 0.7:
                mismatches.append({
                    "mismatch_type": MismatchTypeEnum.icd_inconsistent,
                    "severity": SeverityEnum.high,
                    "field_name": "icd10_consistency",
                    "expected_value": icd_record.description,
                    "actual_value": diagnosis,
                    "similarity_score": similarity,
                    "evidence": {
                        "icd_code": code,
                        "icd_description": icd_record.description,
                        "documented_diagnosis": diagnosis
                    },
                    "recommendation": f"Diagnosis '{diagnosis}' tidak sesuai dengan deskripsi ICD-10 '{code}': '{icd_record.description}'. Similarity score: {similarity:.2f}"
                })
        
        # Check 3: Documentation completeness
        doc_mismatches = self._check_documentation_completeness(
            code, icd_record.description, norm, is_primary
        )
        mismatches.extend(doc_mismatches)
        
        return mismatches
    
    def _validate_icd9_code(self, code: str, procedure: str, norm: str) -> List[Dict]:
        """
        Validate a single ICD-9-CM procedure code.
        """
        mismatches = []
        
        if not code:
            return []
        
        # Check 1: Code exists in master
        icd_record = self.db.query(ICDMaster).filter(
            ICDMaster.code == code,
            ICDMaster.code_type == CodeTypeEnum.procedure
        ).first()
        
        if not icd_record:
            mismatches.append({
                "mismatch_type": MismatchTypeEnum.icd_inconsistent,
                "severity": SeverityEnum.critical,
                "field_name": "icd9_code",
                "expected_value": f"Valid ICD-9-CM code in master",
                "actual_value": code,
                "similarity_score": 0.0,
                "evidence": {"code": code, "procedure": procedure},
                "recommendation": f"Kode ICD-9-CM '{code}' tidak ditemukan dalam master ICD. Verifikasi kode yang benar."
            })
            return mismatches
        
        # Check 2: Procedure documentation exists
        surgery_report = self.db.query(LaporanOperasi).filter(
            LaporanOperasi.norm == norm
        ).first()
        
        if not surgery_report:
            # Check if this is actually a surgical procedure
            surgical_keywords = ['operasi', 'bedah', 'insisi', 'eksisi', 'reseksi']
            if any(kw in (procedure or '').lower() or kw in icd_record.description.lower() 
                   for kw in surgical_keywords):
                mismatches.append({
                    "mismatch_type": MismatchTypeEnum.missing_documentation,
                    "severity": SeverityEnum.high,
                    "field_name": "surgery_report",
                    "expected_value": "Laporan operasi harus ada",
                    "actual_value": "Laporan operasi tidak ditemukan",
                    "similarity_score": 0.0,
                    "evidence": {
                        "icd9_code": code,
                        "procedure": procedure,
                        "icd_description": icd_record.description
                    },
                    "recommendation": f"Prosedur bedah '{procedure}' (ICD-9: {code}) memerlukan laporan operasi lengkap."
                })
        else:
            # Check if procedure is documented in surgery report
            if procedure:
                proc_lower = procedure.lower()
                report_text = (
                    f"{surgery_report.prosedur} {surgery_report.temuan or ''} "
                    f"{surgery_report.komplikasi or ''}"
                ).lower()
                
                # Simple keyword check
                proc_words = set(proc_lower.split())
                report_words = set(report_text.split())
                overlap = len(proc_words & report_words)
                
                if overlap < len(proc_words) * 0.5:
                    mismatches.append({
                        "mismatch_type": MismatchTypeEnum.missing_documentation,
                        "severity": SeverityEnum.medium,
                        "field_name": "procedure_documentation",
                        "expected_value": f"Dokumentasi prosedur: {procedure}",
                        "actual_value": f"Prosedur tercatat: {surgery_report.prosedur}",
                        "similarity_score": overlap / max(len(proc_words), 1),
                        "evidence": {
                            "icd9_code": code,
                            "claimed_procedure": procedure,
                            "documented_procedure": surgery_report.prosedur
                        },
                        "recommendation": f"Prosedur '{procedure}' tidak tercatat lengkap dalam laporan operasi. Verifikasi konsistensi dokumentasi."
                    })
        
        return mismatches
    
    def _check_documentation_completeness(self, icd_code: str, icd_description: str,
                                          norm: str, is_primary: bool) -> List[Dict]:
        """
        Check if documentation is complete for specific ICD code categories.
        """
        mismatches = []
        
        # Find matching requirement pattern
        requirements = None
        for pattern, reqs in ICD10_DOCUMENTATION_REQUIREMENTS.items():
            if re.match(pattern, icd_code):
                requirements = reqs
                break
        
        if not requirements:
            return []  # No specific requirements
        
        # Get all CPPT records
        cppt_records = self.db.query(CPPT).filter(CPPT.norm == norm).all()
        
        if not cppt_records:
            if is_primary:
                mismatches.append({
                    "mismatch_type": MismatchTypeEnum.missing_documentation,
                    "severity": SeverityEnum.critical,
                    "field_name": "cppt_documentation",
                    "expected_value": "CPPT harus ada untuk diagnosis utama",
                    "actual_value": "Tidak ada CPPT tercatat",
                    "similarity_score": 0.0,
                    "evidence": {"icd_code": icd_code},
                    "recommendation": f"Diagnosis utama (ICD-10: {icd_code}) memerlukan dokumentasi CPPT lengkap."
                })
            return mismatches
        
        # Combine all CPPT text
        all_cppt_text = " ".join([c.catatan.lower() for c in cppt_records])
        
        # Check minimum documentation length
        if len(all_cppt_text) < requirements.get('min_documentation_length', 0):
            mismatches.append({
                "mismatch_type": MismatchTypeEnum.missing_documentation,
                "severity": SeverityEnum.medium,
                "field_name": "documentation_length",
                "expected_value": f"Min {requirements['min_documentation_length']} karakter",
                "actual_value": f"{len(all_cppt_text)} karakter",
                "similarity_score": len(all_cppt_text) / requirements['min_documentation_length'],
                "evidence": {"icd_code": icd_code, "text_length": len(all_cppt_text)},
                "recommendation": f"Dokumentasi untuk ICD-10 {icd_code} terlalu singkat. Tambahkan detail klinis."
            })
        
        # Check required keywords
        missing_keywords = []
        for keyword in requirements.get('keywords', []):
            if keyword not in all_cppt_text:
                missing_keywords.append(keyword)
        
        if missing_keywords and len(missing_keywords) > len(requirements.get('keywords', [])) * 0.5:
            mismatches.append({
                "mismatch_type": MismatchTypeEnum.missing_documentation,
                "severity": SeverityEnum.medium,
                "field_name": "documentation_keywords",
                "expected_value": f"Kata kunci: {', '.join(requirements['keywords'])}",
                "actual_value": f"Tidak ditemukan: {', '.join(missing_keywords)}",
                "similarity_score": 1 - (len(missing_keywords) / len(requirements.get('keywords', []))),
                "evidence": {
                    "icd_code": icd_code,
                    "missing_keywords": missing_keywords
                },
                "recommendation": f"Dokumentasi untuk ICD-10 {icd_code} ({icd_description}) tidak lengkap. Tambahkan informasi tentang: {', '.join(missing_keywords[:3])}"
            })
        
        return mismatches
    
    def _get_embedding(self, text: str) -> np.ndarray:
        """Get cached embedding."""
        if text not in self._embedding_cache:
            self._embedding_cache[text] = self.model.encode(
                text, normalize_embeddings=True
            )
        return self._embedding_cache[text]
    
    def get_icd_suggestions(self, diagnosis: str, code_type: CodeTypeEnum,
                            top_k: int = 5) -> List[Dict]:
        """
        Get ICD code suggestions for a diagnosis using semantic search.
        """
        if not diagnosis:
            return []
        
        # Get all ICD codes of the specified type
        icd_codes = self.db.query(ICDMaster).filter(
            ICDMaster.code_type == code_type
        ).all()
        
        if not icd_codes:
            return []
        
        # Get diagnosis embedding
        diag_emb = self._get_embedding(diagnosis.lower())
        
        # Calculate similarities
        scores = []
        for icd in icd_codes:
            icd_emb = self._get_embedding(icd.description.lower())
            similarity = float(np.dot(diag_emb, icd_emb))
            scores.append({
                "code": icd.code,
                "description": icd.description,
                "similarity": similarity
            })
        
        # Sort by similarity
        scores.sort(key=lambda x: x['similarity'], reverse=True)
        
        return scores[:top_k]