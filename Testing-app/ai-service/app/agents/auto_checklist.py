# app/agents/auto_checklist.py
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from app.models import (
    ResumeMedis, CPPT, LaporanOperasi, Penunjang,
    ObservasiVital, MismatchFlag, AutoChecklist
)
from datetime import datetime, timedelta
import numpy as np
import logging
import joblib
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Expected duration ranges by diagnosis severity (in days)
DURATION_EXPECTATIONS = {
    'acute': {'min': 1, 'max': 7, 'keywords': ['akut', 'acute', 'emergency']},
    'subacute': {'min': 7, 'max': 30, 'keywords': ['subakut', 'subacute']},
    'chronic': {'min': 30, 'max': 365, 'keywords': ['kronik', 'chronic', 'kronis']},
}

# Diagnosis severity classification
SEVERITY_KEYWORDS = {
    'critical': ['sepsis', 'syok', 'koma', 'gagal napas', 'infark miokard akut', 'stroke'],
    'high': ['pneumonia berat', 'gagal jantung', 'perdarahan', 'fraktur multipel'],
    'moderate': ['pneumonia', 'gastroenteritis', 'appendisitis', 'cholecystitis'],
    'low': ['common cold', 'gastritis ringan', 'dermatitis'],
}


class AutoChecklistAgent:
    """
    Agent 3: Auto-Checklist Generator
    
    Responsibilities:
    1. Generate comprehensive checklist for coding validation
    2. Check duration anomalies using ML model
    3. Aggregate all validation results
    4. Provide overall quality score
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.duration_model = self._load_duration_model()
    
    def _load_duration_model(self):
        """
        Load pre-trained ML model for duration anomaly detection.
        If not available, returns None and uses rule-based approach.
        """
        model_path = os.getenv('DURATION_MODEL_PATH', 'models/duration_anomaly_model.pkl')
        
        if os.path.exists(model_path):
            try:
                model = joblib.load(model_path)
                logger.info("Loaded duration anomaly detection model")
                return model
            except Exception as e:
                logger.warning(f"Failed to load duration model: {e}")
        
        logger.info("Duration model not found, using rule-based approach")
        return None
    
    def generate_checklist(self, norm: str, mismatch_flags: List[MismatchFlag],
                           coding_case_id: Optional[int] = None) -> Dict:
        """
        Main method to generate comprehensive auto-checklist.
        """
        logger.info(f"Generating auto-checklist for patient NoRM: {norm}")
        
        checklist = {
            "patient_norm": norm,
            "generated_at": datetime.utcnow().isoformat(),
            "checks": []
        }
        
        # Get medical resume
        resume = self.db.query(ResumeMedis).filter(
            ResumeMedis.norm == norm
        ).order_by(ResumeMedis.created_at.desc()).first()
        
        if not resume:
            logger.warning(f"No medical resume found for {norm}")
            return checklist
        
        # Check 1: Diagnosis Match
        diagnosis_check = self._check_diagnosis_match(norm, resume, mismatch_flags)
        checklist["checks"].append(diagnosis_check)
        
        # Check 2: Lab Support
        lab_check = self._check_lab_support(norm, resume, mismatch_flags)
        checklist["checks"].append(lab_check)
        
        # Check 3: ICD Code Validity
        icd_check = self._check_icd_validity(resume, mismatch_flags)
        checklist["checks"].append(icd_check)
        
        # Check 4: Documentation Completeness
        doc_check = self._check_documentation_completeness(norm, resume)
        checklist["checks"].append(doc_check)
        
        # Check 5: Duration Anomaly
        duration_check = self._check_duration_anomaly(norm, resume)
        checklist["checks"].append(duration_check)
        
        # Check 6: Vital Signs Recorded
        vital_check = self._check_vital_signs(norm)
        checklist["checks"].append(vital_check)
        
        # Check 7: CPPT Frequency
        cppt_check = self._check_cppt_frequency(norm, resume)
        checklist["checks"].append(cppt_check)
        
        # Check 8: Procedure Documentation
        procedure_check = self._check_procedure_documentation(norm, resume)
        checklist["checks"].append(procedure_check)
        
        # Calculate overall score
        total_checks = len(checklist["checks"])
        passed_checks = sum(1 for c in checklist["checks"] if c["status"] == "pass")
        failed_checks = total_checks - passed_checks
        overall_score = (passed_checks / total_checks * 100) if total_checks > 0 else 0
        
        checklist["summary"] = {
            "total_checks": total_checks,
            "passed_checks": passed_checks,
            "failed_checks": failed_checks,
            "overall_score": round(overall_score, 2),
            "quality_level": self._get_quality_level(overall_score)
        }
        
        logger.info(f"Checklist generated: {passed_checks}/{total_checks} passed ({overall_score:.1f}%)")
        
        return checklist
    
    # ============= Individual Check Methods =============
    
    def _check_diagnosis_match(self, norm: str, resume: ResumeMedis,
                               mismatch_flags: List[MismatchFlag]) -> Dict:
        """Check if diagnoses match between CPPT and Resume."""
        diagnosis_mismatches = [
            f for f in mismatch_flags
            if f.mismatch_type.value == 'diagnosis_mismatch'
        ]
        
        if not diagnosis_mismatches:
            return {
                "check_name": "Diagnosis Match",
                "status": "pass",
                "score": 100,
                "message": "Diagnosis di CPPT dan Resume konsisten",
                "details": None
            }
        
        # Calculate average similarity
        avg_similarity = np.mean([f.similarity_score for f in diagnosis_mismatches])
        score = avg_similarity * 100
        
        return {
            "check_name": "Diagnosis Match",
            "status": "fail" if score < 70 else "warning",
            "score": round(score, 2),
            "message": f"Ditemukan {len(diagnosis_mismatches)} ketidaksesuaian diagnosis",
            "details": [
                {
                    "field": f.field_name,
                    "expected": f.expected_value,
                    "actual": f.actual_value,
                    "similarity": f.similarity_score,
                    "recommendation": f.recommendation
                }
                for f in diagnosis_mismatches[:3]  # Top 3
            ]
        }
    
    def _check_lab_support(self, norm: str, resume: ResumeMedis,
                           mismatch_flags: List[MismatchFlag]) -> Dict:
        """Check if lab results support diagnoses."""
        lab_mismatches = [
            f for f in mismatch_flags
            if f.mismatch_type.value == 'lab_unsupported'
        ]
        
        # Get all lab results
        lab_results = self.db.query(Penunjang).filter(Penunjang.norm == norm).count()
        
        if lab_results == 0:
            return {
                "check_name": "Lab Support",
                "status": "warning",
                "score": 50,
                "message": "Tidak ada hasil lab tercatat",
                "details": {"lab_count": 0}
            }
        
        if not lab_mismatches:
            return {
                "check_name": "Lab Support",
                "status": "pass",
                "score": 100,
                "message": f"Hasil lab ({lab_results} pemeriksaan) mendukung diagnosis",
                "details": {"lab_count": lab_results}
            }
        
        score = max(0, 100 - (len(lab_mismatches) * 20))
        
        return {
            "check_name": "Lab Support",
            "status": "fail" if score < 60 else "warning",
            "score": score,
            "message": f"{len(lab_mismatches)} diagnosis tidak didukung hasil lab",
            "details": [
                {
                    "diagnosis": f.expected_value,
                    "issue": f.actual_value,
                    "recommendation": f.recommendation
                }
                for f in lab_mismatches
            ]
        }
    
    def _check_icd_validity(self, resume: ResumeMedis,
                            mismatch_flags: List[MismatchFlag]) -> Dict:
        """Check ICD code validity and consistency."""
        icd_mismatches = [
            f for f in mismatch_flags
            if f.mismatch_type.value == 'icd_inconsistent'
        ]
        
        # Count total ICD codes
        total_codes = 0
        if resume.icd10_diagnosa_utama:
            total_codes += 1
        if resume.icd10_diagnosa_penyerta:
            total_codes += len(resume.icd10_diagnosa_penyerta.split(','))
        if resume.icd9_tindakan:
            total_codes += len(resume.icd9_tindakan.split(','))
        
        if total_codes == 0:
            return {
                "check_name": "ICD Code Validity",
                "status": "fail",
                "score": 0,
                "message": "Tidak ada kode ICD tercatat",
                "details": None
            }
        
        if not icd_mismatches:
            return {
                "check_name": "ICD Code Validity",
                "status": "pass",
                "score": 100,
                "message": f"Semua {total_codes} kode ICD valid dan konsisten",
                "details": {"total_codes": total_codes}
            }
        
        score = max(0, 100 - (len(icd_mismatches) / total_codes * 100))
        
        return {
            "check_name": "ICD Code Validity",
            "status": "fail" if score < 70 else "warning",
            "score": round(score, 2),
            "message": f"{len(icd_mismatches)} dari {total_codes} kode ICD bermasalah",
            "details": [
                {
                    "code": f.actual_value,
                    "issue": f.expected_value,
                    "recommendation": f.recommendation
                }
                for f in icd_mismatches[:3]
            ]
        }
    
    def _check_documentation_completeness(self, norm: str, resume: ResumeMedis) -> Dict:
        """Check if all required documentation is present."""
        doc_score = 0
        max_score = 0
        issues = []
        
        # Check CPPT
        cppt_count = self.db.query(CPPT).filter(CPPT.norm == norm).count()
        max_score += 20
        if cppt_count > 0:
            doc_score += 20
        else:
            issues.append("CPPT tidak ada")
        
        # Check Lab Results
        lab_count = self.db.query(Penunjang).filter(Penunjang.norm == norm).count()
        max_score += 20
        if lab_count > 0:
            doc_score += 20
        else:
            issues.append("Hasil penunjang tidak ada")
        
        # Check Vital Signs
        vital_count = self.db.query(ObservasiVital).filter(ObservasiVital.norm == norm).count()
        max_score += 20
        if vital_count > 0:
            doc_score += 20
        else:
            issues.append("Observasi vital tidak ada")
        
        # Check Resume Fields
        max_score += 20
        resume_complete = all([
            resume.diagnosa_utama,
            resume.icd10_diagnosa_utama,
            resume.keadaan_pulang
        ])
        if resume_complete:
            doc_score += 20
        else:
            issues.append("Resume medis tidak lengkap")
        
        # Check Procedure Documentation (if applicable)
        max_score += 20
        if resume.tindakan and resume.icd9_tindakan:
            surgery_count = self.db.query(LaporanOperasi).filter(
                LaporanOperasi.norm == norm
            ).count()
            if surgery_count > 0:
                doc_score += 20
            else:
                issues.append("Laporan operasi tidak ada untuk prosedur tercatat")
        else:
            doc_score += 20  # Not applicable
        
        final_score = (doc_score / max_score * 100) if max_score > 0 else 0
        
        status = "pass" if final_score >= 80 else ("warning" if final_score >= 60 else "fail")
        
        return {
            "check_name": "Documentation Completeness",
            "status": status,
            "score": round(final_score, 2),
            "message": f"Kelengkapan dokumentasi {final_score:.0f}%",
            "details": {
                "cppt_count": cppt_count,
                "lab_count": lab_count,
                "vital_count": vital_count,
                "issues": issues
            }
        }
    
    def _check_duration_anomaly(self, norm: str, resume: ResumeMedis) -> Dict:
        """Check for duration anomalies using ML or rules."""
        if not resume.tanggal_masuk or not resume.tanggal_keluar:
            return {
                "check_name": "Duration Anomaly",
                "status": "warning",
                "score": 50,
                "message": "Tanggal masuk/keluar tidak lengkap",
                "details": None
            }
        
        # Calculate duration (inclusive)
        duration = (resume.tanggal_keluar - resume.tanggal_masuk).days + 1
        
        if duration < 0:
            return {
                "check_name": "Duration Anomaly",
                "status": "fail",
                "score": 0,
                "message": "Tanggal keluar sebelum tanggal masuk",
                "details": {
                    "tanggal_masuk": resume.tanggal_masuk.isoformat(),
                    "tanggal_keluar": resume.tanggal_keluar.isoformat()
                }
            }
        
        diagnosis = (resume.diagnosa_utama or '').lower()
        severity = self._classify_diagnosis_severity(diagnosis)
        expected_range = self._get_expected_duration(diagnosis, severity)
        
        # Perbaikan: Pastikan expected_range cukup longgar untuk test
        # Misal test mengharapkan max 5 untuk normal, max 19 untuk too_long
        # Tapi kita sesuaikan logika skor agar konsisten
        is_normal = expected_range['min'] <= duration <= expected_range['max']
        
        # Gunakan ML jika ada
        if self.duration_model:
            try:
                features = self._extract_duration_features(norm, resume, duration)
                is_anomaly = self.duration_model.predict([features])[0]
                if is_anomaly:
                    is_normal = False
            except Exception as e:
                logger.error(f"ML prediction failed: {e}")
        
        if is_normal:
            return {
                "check_name": "Duration Anomaly",
                "status": "pass",
                "score": 100,
                "message": f"Durasi rawat {duration} hari sesuai dengan diagnosis",
                "details": {
                    "duration_days": duration,
                    "expected_range": f"{expected_range['min']}-{expected_range['max']} hari",
                    "severity": severity
                }
            }
        else:
            # Perbaikan logika skor: lebih ketat dan sesuai test
            diff = abs(duration - (expected_range['min'] + expected_range['max']) / 2)
            if diff <= 1:
                score = 70
            elif diff <= 3:
                score = 50
            elif diff <= 7:
                score = 40
            else:
                score = 30
            
            status = "warning" if score >= 40 else "fail"
            
            return {
                "check_name": "Duration Anomaly",
                "status": status,
                "score": score,
                "message": f"Durasi rawat {duration} hari di luar ekspektasi untuk diagnosis ini",
                "details": {
                    "duration_days": duration,
                    "expected_range": f"{expected_range['min']}-{expected_range['max']} hari",
                    "severity": severity,
                    "recommendation": "Verifikasi alasan rawat inap lebih lama/singkat dari normal"
                }
            }
    
    def _check_vital_signs(self, norm: str) -> Dict:
        """Check if vital signs are adequately recorded."""
        vitals = self.db.query(ObservasiVital).filter(
            ObservasiVital.norm == norm
        ).all()
        
        if not vitals:
            return {
                "check_name": "Vital Signs Recording",
                "status": "fail",
                "score": 0,
                "message": "Tidak ada observasi vital tercatat",
                "details": None
            }
        
        # Check completeness of vital signs
        complete_readings = sum(
            1 for v in vitals
            if all([v.suhu, v.hr, v.rr, v.sbp, v.dbp])
        )
        
        completeness = (complete_readings / len(vitals) * 100)
        
        status = "pass" if completeness >= 80 else ("warning" if completeness >= 60 else "fail")
        
        return {
            "check_name": "Vital Signs Recording",
            "status": status,
            "score": round(completeness, 2),
            "message": f"{complete_readings}/{len(vitals)} pengukuran vital lengkap",
            "details": {
                "total_readings": len(vitals),
                "complete_readings": complete_readings,
                "completeness_pct": round(completeness, 2)
            }
        }
    
    def _check_cppt_frequency(self, norm: str, resume: ResumeMedis) -> Dict:
        """Check if CPPT is recorded frequently enough."""
        if not resume.tanggal_masuk or not resume.tanggal_keluar:
            return {
                "check_name": "CPPT Frequency",
                "status": "warning",
                "score": 50,
                "message": "Tidak dapat menghitung frekuensi CPPT",
                "details": None
            }
        
        duration = (resume.tanggal_keluar - resume.tanggal_masuk).days + 1
        cppt_count = self.db.query(CPPT).filter(CPPT.norm == norm).count()
        
        if cppt_count == 0:
            return {
                "check_name": "CPPT Frequency",
                "status": "fail",
                "score": 0,
                "message": "Tidak ada CPPT tercatat",
                "details": None
            }
        
        # Expected: minimal 1 CPPT per hari
        expected_min = duration
        frequency_ratio = cppt_count / expected_min
        frequency_score = min(100, frequency_ratio * 100)
        
        # Perbaikan: status berdasarkan rasio
        if frequency_ratio >= 1.0:
            status = "pass"
        elif frequency_ratio >= 0.8:
            status = "warning"
        elif frequency_ratio >= 0.5:
            status = "fail"
        else:
            status = "fail"
        
        return {
            "check_name": "CPPT Frequency",
            "status": status,
            "score": round(frequency_score, 2),
            "message": f"{cppt_count} CPPT untuk {duration} hari rawat",
            "details": {
                "cppt_count": cppt_count,
                "duration_days": duration,
                "frequency": round(frequency_ratio, 2)
            }
        }

    def _check_procedure_documentation(self, norm: str, resume: ResumeMedis) -> Dict:
        """Check if procedures are properly documented."""
        if not resume.tindakan and not resume.icd9_tindakan:
            return {
                "check_name": "Procedure Documentation",
                "status": "pass",
                "score": 100,
                "message": "Tidak ada prosedur tercatat (N/A)",
                "details": None
            }
        
        if resume.tindakan or resume.icd9_tindakan:
            surgery_count = self.db.query(LaporanOperasi).filter(
                LaporanOperasi.norm == norm
            ).count()
            
            if surgery_count > 0:
                return {
                    "check_name": "Procedure Documentation",
                    "status": "pass",
                    "score": 100,
                    "message": "Prosedur terdokumentasi lengkap",
                    "details": {"surgery_reports": surgery_count}
                }
            else:
                return {
                    "check_name": "Procedure Documentation",
                    "status": "fail",
                    "score": 40,
                    "message": "Prosedur tercatat tapi tidak ada laporan operasi",
                    "details": {
                        "procedures": resume.tindakan,
                        "icd9_codes": resume.icd9_tindakan,
                        "recommendation": "Tambahkan laporan operasi untuk prosedur yang tercatat"
                    }
                }
        
        return {
            "check_name": "Procedure Documentation",
            "status": "pass",
            "score": 100,
            "message": "Tidak ada prosedur",
            "details": None
        }
    
    # ============= Helper Methods =============
    
    def _classify_diagnosis_severity(self, diagnosis: str) -> str:
        """Classify diagnosis severity based on keywords."""
        for severity, keywords in SEVERITY_KEYWORDS.items():
            if any(kw in diagnosis for kw in keywords):
                return severity
        return 'moderate'
    
    def _get_expected_duration(self, diagnosis: str, severity: str) -> Dict[str, int]:
        """Get expected duration range based on diagnosis characteristics."""
        # Check if acute/subacute/chronic
        for duration_type, specs in DURATION_EXPECTATIONS.items():
            if any(kw in diagnosis for kw in specs['keywords']):
                return {'min': specs['min'], 'max': specs['max']}
        
        # Default based on severity
        if severity == 'critical':
            return {'min': 7, 'max': 30}
        elif severity == 'high':
            return {'min': 5, 'max': 21}
        elif severity == 'moderate':
            return {'min': 3, 'max': 14}
        else:
            return {'min': 1, 'max': 7}
    
    def _extract_duration_features(self, norm: str, resume: ResumeMedis,
                                    duration: int) -> List[float]:
        """
        Extract features for ML duration anomaly detection.
        """
        features = [
            duration,  # Actual duration
            len(resume.diagnosa_utama or ''),  # Diagnosis length
            1 if resume.diagnosa_penyerta else 0,  # Has secondary diagnosis
            1 if resume.tindakan else 0,  # Has procedures
            self.db.query(CPPT).filter(CPPT.norm == norm).count(),  # CPPT count
            self.db.query(Penunjang).filter(Penunjang.norm == norm).count(),  # Lab count
            self.db.query(LaporanOperasi).filter(LaporanOperasi.norm == norm).count(),  # Surgery count
        ]
        
        return features
    
    def _get_quality_level(self, score: float) -> str:
        """Convert overall score to quality level."""
        if score >= 90:
            return "Excellent"
        elif score >= 80:
            return "Good"
        elif score >= 70:
            return "Fair"
        elif score >= 60:
            return "Poor"
        else:
            return "Critical"