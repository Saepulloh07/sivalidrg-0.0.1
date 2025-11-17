# app/agents/mismatch_checker.py
import Levenshtein
from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List, Dict, Optional, Tuple
from sqlalchemy.orm import Session
from app.models import (
    Patient, CPPT, ResumeMedis, Penunjang, ObservasiVital,
    MismatchFlag, MismatchTypeEnum, SeverityEnum
)
from datetime import datetime, timedelta
import logging
import re

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load Sentence Transformer for semantic similarity
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

# Medical synonym dictionary
MEDICAL_SYNONYMS = {
    "pneumonia": ["pneumoni", "infeksi paru", "radang paru", "paru basah"],
    "sepsis": ["septikemia", "keracunan darah", "infeksi sistemik"],
    "diabetes": ["dm", "diabetes mellitus", "kencing manis"],
    "hipertensi": ["ht", "htn", "tekanan darah tinggi", "darah tinggi"],
    "tuberculosis": ["tb", "tbc", "tuberkulosis", "batuk darah"],
    "covid": ["covid-19", "corona", "sars-cov-2"],
    "stroke": ["cva", "cerebrovascular accident", "serangan otak"],
    "appendicitis": ["usus buntu", "radang usus buntu", "apendisitis"],
}

# Lab reference ranges and diagnosis support rules
LAB_DIAGNOSIS_RULES = {
    "sepsis": {
        "leukosit": {"min": 12000, "max": None, "unit": "/µL"},
        "neutrofil": {"min": 75, "max": None, "unit": "%"},
        "crp": {"min": 100, "max": None, "unit": "mg/L"},
        "procalcitonin": {"min": 2.0, "max": None, "unit": "ng/mL"},
    },
    "anemia": {
        "hemoglobin_male": {"min": None, "max": 13, "unit": "g/dL"},
        "hemoglobin_female": {"min": None, "max": 12, "unit": "g/dL"},
        "hematokrit": {"min": None, "max": 36, "unit": "%"},
    },
    "diabetes": {
        "gula_darah_puasa": {"min": 126, "max": None, "unit": "mg/dL"},
        "gula_darah_sewaktu": {"min": 200, "max": None, "unit": "mg/dL"},
        "hba1c": {"min": 6.5, "max": None, "unit": "%"},
    },
    "gagal_ginjal": {
        "kreatinin": {"min": 1.5, "max": None, "unit": "mg/dL"},
        "ureum": {"min": 50, "max": None, "unit": "mg/dL"},
        "gfr": {"min": None, "max": 60, "unit": "mL/min"},
    },
    "hipertensi": {
        "systolic": {"min": 140, "max": None, "unit": "mmHg"},
        "diastolic": {"min": 90, "max": None, "unit": "mmHg"},
    },
}


class MismatchCheckerAgent:
    """
    Agent 1: Mismatch Checker
    
    Responsibilities:
    1. Check diagnosis consistency between CPPT and Resume
    2. Validate lab support for diagnoses
    3. Detect semantic similarities using embeddings
    4. Flag mismatches with severity levels
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.model = model
        self._embedding_cache = {}
    
    def check_patient_mismatches(self, norm: str) -> List[MismatchFlag]:
        """
        Main method to check all mismatches for a patient.
        """
        logger.info(f"Checking mismatches for patient NoRM: {norm}")
        
        mismatches = []
        
        # Get patient data
        patient = self.db.query(Patient).filter(Patient.norm == norm).first()
        if not patient:
            logger.error(f"Patient {norm} not found")
            return []
        
        # Get medical resume
        resume = self.db.query(ResumeMedis).filter(
            ResumeMedis.norm == norm
        ).order_by(ResumeMedis.created_at.desc()).first()
        
        if not resume:
            logger.warning(f"No medical resume found for {norm}")
            return []
        
        # Check 1: Diagnosis consistency (CPPT vs Resume)
        diagnosis_mismatches = self._check_diagnosis_consistency(norm, resume)
        mismatches.extend(diagnosis_mismatches)
        
        # Check 2: Lab support for diagnoses
        lab_mismatches = self._check_lab_support(norm, resume, patient.gender.value)
        mismatches.extend(lab_mismatches)
        
        # Check 3: Vital signs support
        vital_mismatches = self._check_vital_support(norm, resume)
        mismatches.extend(vital_mismatches)
        
        logger.info(f"Found {len(mismatches)} mismatches for patient {norm}")
        return mismatches
    
    def _check_diagnosis_consistency(self, norm: str, resume: ResumeMedis) -> List[Dict]:
        """
        Check if diagnoses in CPPT match with Resume using fuzzy matching
        and semantic similarity.
        """
        mismatches = []
        
        # Get all CPPT diagnoses
        cppt_records = self.db.query(CPPT).filter(CPPT.norm == norm).all()
        
        if not cppt_records:
            return []
        
        # Extract diagnoses from CPPT notes
        cppt_diagnoses = []
        for record in cppt_records:
            extracted = self._extract_diagnoses_from_text(record.catatan)
            cppt_diagnoses.extend(extracted)
        
        if not cppt_diagnoses:
            logger.warning(f"No diagnoses found in CPPT for {norm}")
            return mismatches
        
        # Get resume diagnoses
        resume_diagnoses = []
        if resume.diagnosa_utama:
            resume_diagnoses.append(resume.diagnosa_utama.lower().strip())
        if resume.diagnosa_penyerta:
            for diag in resume.diagnosa_penyerta.split(','):
                resume_diagnoses.append(diag.lower().strip())
        
        # Compare each resume diagnosis with CPPT
        for resume_diag in resume_diagnoses:
            best_match, best_score, match_type = self._find_best_match(
                resume_diag, cppt_diagnoses
            )
            
            # Threshold for mismatch
            if best_score < 0.75:
                severity = self._calculate_severity(best_score)
                
                mismatches.append({
                    "mismatch_type": MismatchTypeEnum.diagnosis_mismatch,
                    "severity": severity,
                    "field_name": "diagnosis",
                    "expected_value": resume_diag,
                    "actual_value": best_match if best_match else "Not found in CPPT",
                    "similarity_score": best_score,
                    "evidence": {
                        "match_type": match_type,
                        "cppt_diagnoses": cppt_diagnoses[:5]  # Sample
                    },
                    "recommendation": self._generate_recommendation(
                        "diagnosis_mismatch", resume_diag, best_match, best_score
                    )
                })
                
                logger.warning(
                    f"Diagnosis mismatch: Resume='{resume_diag}' vs "
                    f"CPPT='{best_match}' (score={best_score:.2f})"
                )
        
        return mismatches
    
    def _check_lab_support(self, norm: str, resume: ResumeMedis, gender: str) -> List[Dict]:
        """
        Check if lab results support the diagnoses.
        """
        mismatches = []
        
        # Get all diagnoses
        diagnoses = []
        if resume.diagnosa_utama:
            diagnoses.append(resume.diagnosa_utama.lower().strip())
        if resume.diagnosa_penyerta:
            for diag in resume.diagnosa_penyerta.split(','):
                diagnoses.append(diag.lower().strip())
        
        # Get lab results
        lab_results = self.db.query(Penunjang).filter(
            Penunjang.norm == norm
        ).all()
        
        if not lab_results:
            logger.warning(f"No lab results found for {norm}")
            return mismatches
        
        # Parse lab values
        lab_values = self._parse_lab_results(lab_results)
        
        # Check each diagnosis
        for diagnosis in diagnoses:
            diagnosis_key = self._normalize_diagnosis_for_rules(diagnosis)
            
            if diagnosis_key in LAB_DIAGNOSIS_RULES:
                rules = LAB_DIAGNOSIS_RULES[diagnosis_key]
                unsupported = self._check_diagnosis_rules(
                    diagnosis, diagnosis_key, rules, lab_values, gender
                )
                
                if unsupported:
                    mismatches.append(unsupported)
        
        return mismatches
    
    def _check_vital_support(self, norm: str, resume: ResumeMedis) -> List[Dict]:
        """
        Check if vital signs support diagnoses (e.g., hypertension).
        """
        mismatches = []
        
        # Get diagnoses
        diagnoses = []
        if resume.diagnosa_utama:
            diagnoses.append(resume.diagnosa_utama.lower().strip())
        if resume.diagnosa_penyerta:
            for diag in resume.diagnosa_penyerta.split(','):
                diagnoses.append(diag.lower().strip())
        
        # Check for hypertension
        hypertension_keywords = ["hipertensi", "ht", "htn", "tekanan tinggi"]
        has_hypertension = any(
            any(kw in diag for kw in hypertension_keywords)
            for diag in diagnoses
        )
        
        if has_hypertension:
            # Get vital signs
            vitals = self.db.query(ObservasiVital).filter(
                ObservasiVital.norm == norm
            ).all()
            
            if not vitals:
                mismatches.append({
                    "mismatch_type": MismatchTypeEnum.lab_unsupported,
                    "severity": SeverityEnum.medium,
                    "field_name": "vital_signs",
                    "expected_value": "SBP >= 140 or DBP >= 90",
                    "actual_value": "No vital signs recorded",
                    "similarity_score": 0.0,
                    "evidence": {"vitals_count": 0},
                    "recommendation": "Pastikan vital signs tercatat untuk mendukung diagnosis hipertensi"
                })
            else:
                # Check if any reading shows hypertension
                hypertensive_readings = [
                    v for v in vitals
                    if (v.sbp and v.sbp >= 140) or (v.dbp and v.dbp >= 90)
                ]
                
                if not hypertensive_readings:
                    avg_sbp = np.mean([v.sbp for v in vitals if v.sbp])
                    avg_dbp = np.mean([v.dbp for v in vitals if v.dbp])
                    
                    mismatches.append({
                        "mismatch_type": MismatchTypeEnum.lab_unsupported,
                        "severity": SeverityEnum.high,
                        "field_name": "blood_pressure",
                        "expected_value": "SBP >= 140 or DBP >= 90",
                        "actual_value": f"Avg SBP={avg_sbp:.1f}, DBP={avg_dbp:.1f}",
                        "similarity_score": 0.0,
                        "evidence": {
                            "total_readings": len(vitals),
                            "avg_sbp": float(avg_sbp),
                            "avg_dbp": float(avg_dbp)
                        },
                        "recommendation": "Tidak ada pembacaan tekanan darah yang mendukung diagnosis hipertensi. Verifikasi diagnosis atau periksa riwayat tekanan darah sebelumnya."
                    })
        
        return mismatches
    
    # ============= Helper Methods =============
    
    def _extract_diagnoses_from_text(self, text: str) -> List[str]:
        """
        Extract diagnosis mentions from CPPT text using pattern matching.
        """
        if not text:
            return []
        
        text = text.lower()
        diagnoses = []
        
        # Pattern: "diagnosis:", "dx:", "diag:"
        patterns = [
            r'diagnosis\s*:?\s*([^\n\.;]+)',
            r'dx\s*:?\s*([^\n\.;]+)',
            r'diag\s*:?\s*([^\n\.;]+)',
            r'dd\s*:?\s*([^\n\.;]+)',  # Differential diagnosis
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                # Clean and split by common delimiters
                clean = match.strip()
                for diag in re.split(r'[,;/]', clean):
                    diag = diag.strip()
                    if len(diag) > 3:  # Minimum length
                        diagnoses.append(diag)
        
        return list(set(diagnoses))  # Remove duplicates
    
    def _find_best_match(self, target: str, candidates: List[str]) -> Tuple[Optional[str], float, str]:
        """
        Find best match using fuzzy + semantic similarity.
        
        Returns:
            (best_match, best_score, match_type)
        """
        if not candidates:
            return None, 0.0, "none"
        
        best_match = None
        best_score = 0.0
        match_type = "none"
        
        # Get embedding for target
        target_emb = self._get_embedding(target)
        
        for candidate in candidates:
            # 1. Exact match
            if target == candidate:
                return candidate, 1.0, "exact"
            
            # 2. Fuzzy string match (Levenshtein)
            fuzzy_score = Levenshtein.ratio(target, candidate)
            
            # 3. Semantic similarity
            candidate_emb = self._get_embedding(candidate)
            semantic_score = float(np.dot(target_emb, candidate_emb))
            
            # 4. Synonym check
            synonym_score = self._check_synonym(target, candidate)
            
            # Combined score (weighted)
            combined_score = (
                0.3 * fuzzy_score +
                0.5 * semantic_score +
                0.2 * synonym_score
            )
            
            if combined_score > best_score:
                best_score = combined_score
                best_match = candidate
                
                if synonym_score > 0.5:
                    match_type = "synonym"
                elif semantic_score > 0.8:
                    match_type = "semantic"
                else:
                    match_type = "fuzzy"
        
        return best_match, best_score, match_type
    
    def _get_embedding(self, text: str) -> np.ndarray:
        """Get cached embedding."""
        if text not in self._embedding_cache:
            self._embedding_cache[text] = self.model.encode(
                text, normalize_embeddings=True
            )
        return self._embedding_cache[text]
    
    def _check_synonym(self, text1: str, text2: str) -> float:
        """
        Check if texts are synonyms based on dictionary.
        Returns score 0-1.
        """
        for canonical, synonyms in MEDICAL_SYNONYMS.items():
            text1_match = canonical in text1 or any(s in text1 for s in synonyms)
            text2_match = canonical in text2 or any(s in text2 for s in synonyms)
            
            if text1_match and text2_match:
                return 1.0
        
        return 0.0
    
    def _parse_lab_results(self, lab_results: List[Penunjang]) -> Dict[str, float]:
        """
        Parse lab results into structured format.
        """
        values = {}
        
        for lab in lab_results:
            # Parse hasil field for numerical values
            hasil = lab.hasil.lower()
            
            # Common lab patterns
            patterns = {
                r'leukosit[:\s]*(\d+\.?\d*)': 'leukosit',
                r'wbc[:\s]*(\d+\.?\d*)': 'leukosit',
                r'hemoglobin[:\s]*(\d+\.?\d*)': 'hemoglobin',
                r'hb[:\s]*(\d+\.?\d*)': 'hemoglobin',
                r'hematokrit[:\s]*(\d+\.?\d*)': 'hematokrit',
                r'ht[:\s]*(\d+\.?\d*)': 'hematokrit',
                r'kreatinin[:\s]*(\d+\.?\d*)': 'kreatinin',
                r'ureum[:\s]*(\d+\.?\d*)': 'ureum',
                r'gula darah puasa[:\s]*(\d+\.?\d*)': 'gula_darah_puasa',
                r'gdp[:\s]*(\d+\.?\d*)': 'gula_darah_puasa',
                r'gula darah sewaktu[:\s]*(\d+\.?\d*)': 'gula_darah_sewaktu',
                r'gds[:\s]*(\d+\.?\d*)': 'gula_darah_sewaktu',
                r'hba1c[:\s]*(\d+\.?\d*)': 'hba1c',
                r'crp[:\s]*(\d+\.?\d*)': 'crp',
            }
            
            for pattern, key in patterns.items():
                match = re.search(pattern, hasil)
                if match:
                    try:
                        values[key] = float(match.group(1))
                    except ValueError:
                        continue
        
        return values
    
    def _normalize_diagnosis_for_rules(self, diagnosis: str) -> Optional[str]:
        """
        Normalize diagnosis to match rule keys.
        """
        diag_lower = diagnosis.lower()
        
        for rule_key in LAB_DIAGNOSIS_RULES.keys():
            if rule_key in diag_lower:
                return rule_key
            
            # Check synonyms
            if rule_key in MEDICAL_SYNONYMS:
                if any(syn in diag_lower for syn in MEDICAL_SYNONYMS[rule_key]):
                    return rule_key
        
        return None
    
    def _check_diagnosis_rules(self, diagnosis: str, diagnosis_key: str,
                                rules: Dict, lab_values: Dict, gender: str) -> Optional[Dict]:
        """
        Check if lab values support the diagnosis according to rules.
        """
        unsupported_tests = []
        
        for test_name, thresholds in rules.items():
            # Handle gender-specific tests
            if test_name.endswith('_male') or test_name.endswith('_female'):
                base_name = test_name.rsplit('_', 1)[0]
                expected_gender = test_name.rsplit('_', 1)[1]
                
                if gender != expected_gender:
                    continue
                
                test_name = base_name
            
            if test_name not in lab_values:
                unsupported_tests.append(f"{test_name} (not measured)")
                continue
            
            value = lab_values[test_name]
            min_val = thresholds.get('min')
            max_val = thresholds.get('max')
            
            # Check thresholds
            is_supported = True
            if min_val is not None and value < min_val:
                is_supported = False
            if max_val is not None and value > max_val:
                is_supported = False
            
            if not is_supported:
                unsupported_tests.append(
                    f"{test_name}={value}{thresholds['unit']} "
                    f"(expected: {min_val or 'any'}-{max_val or 'any'})"
                )
        
        if unsupported_tests:
            return {
                "mismatch_type": MismatchTypeEnum.lab_unsupported,
                "severity": SeverityEnum.high,
                "field_name": "laboratory",
                "expected_value": f"Lab values supporting {diagnosis}",
                "actual_value": "; ".join(unsupported_tests),
                "similarity_score": 0.0,
                "evidence": {
                    "diagnosis": diagnosis,
                    "lab_values": lab_values,
                    "unsupported_tests": unsupported_tests
                },
                "recommendation": f"Nilai lab tidak mendukung diagnosis {diagnosis}. "
                                  f"Periksa kembali: {', '.join([t.split('=')[0] for t in unsupported_tests])}"
            }
        
        return None
    
    def _calculate_severity(self, similarity_score: float) -> SeverityEnum:
        """Calculate severity based on similarity score."""
        if similarity_score < 0.3:
            return SeverityEnum.critical
        elif similarity_score < 0.5:
            return SeverityEnum.high
        elif similarity_score < 0.7:
            return SeverityEnum.medium
        else:
            return SeverityEnum.low
    
    def _generate_recommendation(self, mismatch_type: str, expected: str,
                                 actual: Optional[str], score: float) -> str:
        """Generate human-readable recommendation."""
        if mismatch_type == "diagnosis_mismatch":
            if score < 0.3:
                return (f"Diagnosis '{expected}' di resume tidak ditemukan di CPPT. "
                        f"Pastikan konsistensi diagnosis atau tambahkan dokumentasi di CPPT.")
            elif score < 0.7:
                return (f"Diagnosis '{expected}' di resume mirip dengan '{actual}' di CPPT (score={score:.2f}). "
                        f"Verifikasi apakah ini diagnosis yang sama atau berbeda.")
            else:
                return (f"Diagnosis hampir cocok (score={score:.2f}). "
                        f"Pertimbangkan standardisasi terminologi.")
        
        return "Periksa kembali dokumentasi medis."