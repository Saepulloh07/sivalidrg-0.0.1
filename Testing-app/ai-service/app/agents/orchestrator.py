# app/agents/orchestrator.py
from typing import Dict, List
from sqlalchemy.orm import Session
from app.agents.mismatch_checker import MismatchCheckerAgent
from app.agents.icd_validator import ICDValidatorAgent
from app.agents.auto_checklist import AutoChecklistAgent
from app.models import (
    MismatchFlag, AutoChecklist, CodingCase, AuditLog,
    MismatchTypeEnum, SeverityEnum
)
from datetime import datetime
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MultiAgentOrchestrator:
    """
    Multi-Agent System Orchestrator
    
    Coordinates the three agents:
    1. MismatchCheckerAgent - Diagnosis and lab validation
    2. ICDValidatorAgent - ICD code validation
    3. AutoChecklistAgent - Comprehensive checklist generation
    
    Ensures sequential execution and proper error handling.
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.agent1 = MismatchCheckerAgent(db)
        self.agent2 = ICDValidatorAgent(db)
        self.agent3 = AutoChecklistAgent(db)
    
    def run_full_validation(self, norm: str, coding_case_id: int,
                            user_id: int = None) -> Dict:
        """
        Run complete validation pipeline with all three agents.
        
        Args:
            norm: Patient medical record number
            coding_case_id: Associated coding case ID
            user_id: User ID for audit logging
            
        Returns:
            Complete validation report with all findings
        """
        logger.info(f"=== Starting Multi-Agent Validation for NoRM: {norm} ===")
        
        start_time = datetime.utcnow()
        report = {
            "norm": norm,
            "coding_case_id": coding_case_id,
            "validation_timestamp": start_time.isoformat(),
            "agents_executed": [],
            "total_mismatches": 0,
            "critical_issues": 0,
            "warnings": 0,
            "overall_status": "pending"
        }
        
        try:
            # ===== Agent 1: Mismatch Checker =====
            logger.info("Executing Agent 1: Mismatch Checker...")
            mismatch_results = self.agent1.check_patient_mismatches(norm)
            
            # Save mismatch flags to database
            saved_mismatches = self._save_mismatch_flags(
                mismatch_results, coding_case_id
            )
            
            report["agents_executed"].append({
                "agent": "MismatchChecker",
                "status": "completed",
                "findings_count": len(saved_mismatches),
                "execution_time": (datetime.utcnow() - start_time).total_seconds()
            })
            
            logger.info(f"Agent 1 completed: {len(saved_mismatches)} mismatches found")
            
            # ===== Agent 2: ICD Validator =====
            logger.info("Executing Agent 2: ICD Validator...")
            agent2_start = datetime.utcnow()
            
            icd_results = self.agent2.validate_icd_codes(norm, coding_case_id)
            
            # Save ICD validation flags
            saved_icd_flags = self._save_mismatch_flags(
                icd_results, coding_case_id
            )
            
            report["agents_executed"].append({
                "agent": "ICDValidator",
                "status": "completed",
                "findings_count": len(saved_icd_flags),
                "execution_time": (datetime.utcnow() - agent2_start).total_seconds()
            })
            
            logger.info(f"Agent 2 completed: {len(saved_icd_flags)} ICD issues found")
            
            # ===== Combine all mismatch flags =====
            all_flags = saved_mismatches + saved_icd_flags
            
            # ===== Agent 3: Auto-Checklist Generator =====
            logger.info("Executing Agent 3: Auto-Checklist Generator...")
            agent3_start = datetime.utcnow()
            
            checklist_data = self.agent3.generate_checklist(
                norm, all_flags, coding_case_id
            )
            
            # Save checklist to database
            saved_checklist = self._save_auto_checklist(
                checklist_data, coding_case_id
            )
            
            report["agents_executed"].append({
                "agent": "AutoChecklistGenerator",
                "status": "completed",
                "overall_score": checklist_data["summary"]["overall_score"],
                "execution_time": (datetime.utcnow() - agent3_start).total_seconds()
            })
            
            logger.info(
                f"Agent 3 completed: Overall score = "
                f"{checklist_data['summary']['overall_score']:.1f}%"
            )
            
            # ===== Compile Final Report =====
            report["total_mismatches"] = len(all_flags)
            report["critical_issues"] = sum(
                1 for f in all_flags
                if f.severity == SeverityEnum.critical
            )
            report["warnings"] = sum(
                1 for f in all_flags
                if f.severity in [SeverityEnum.medium, SeverityEnum.low]
            )
            
            report["mismatch_summary"] = self._summarize_mismatches(all_flags)
            report["checklist_summary"] = checklist_data["summary"]
            report["overall_status"] = self._determine_overall_status(
                report["critical_issues"],
                checklist_data["summary"]["overall_score"]
            )
            
            report["total_execution_time"] = (
                datetime.utcnow() - start_time
            ).total_seconds()
            
            # ===== Create Audit Log =====
            if user_id:
                self._create_audit_log(
                    user_id, coding_case_id, report
                )
            
            logger.info(
                f"=== Validation Complete: {report['overall_status'].upper()} "
                f"({report['total_execution_time']:.2f}s) ==="
            )
            
            return report
            
        except Exception as e:
            logger.error(f"Multi-agent validation failed: {e}", exc_info=True)
            report["overall_status"] = "error"
            report["error_message"] = str(e)
            return report
    
    def run_single_agent(self, agent_name: str, norm: str,
                         coding_case_id: int = None) -> Dict:
        """
        Run a single agent independently.
        
        Args:
            agent_name: 'mismatch', 'icd', or 'checklist'
            norm: Patient medical record number
            coding_case_id: Optional coding case ID
            
        Returns:
            Agent-specific results
        """
        logger.info(f"Running single agent: {agent_name} for NoRM: {norm}")
        
        if agent_name.lower() == 'mismatch':
            results = self.agent1.check_patient_mismatches(norm)
            return {
                "agent": "MismatchChecker",
                "results": results,
                "count": len(results)
            }
        
        elif agent_name.lower() == 'icd':
            results = self.agent2.validate_icd_codes(norm, coding_case_id)
            return {
                "agent": "ICDValidator",
                "results": results,
                "count": len(results)
            }
        
        elif agent_name.lower() == 'checklist':
            # Need mismatch flags for checklist
            all_flags = self.db.query(MismatchFlag).filter(
                MismatchFlag.coding_case_id == coding_case_id
            ).all() if coding_case_id else []
            
            results = self.agent3.generate_checklist(norm, all_flags, coding_case_id)
            return {
                "agent": "AutoChecklistGenerator",
                "results": results,
                "score": results["summary"]["overall_score"]
            }
        
        else:
            raise ValueError(f"Unknown agent: {agent_name}")
    
    def get_validation_summary(self, coding_case_id: int) -> Dict:
        """
        Get validation summary for a coding case.
        """
        # Get mismatch flags
        flags = self.db.query(MismatchFlag).filter(
            MismatchFlag.coding_case_id == coding_case_id
        ).all()
        
        # Get checklist
        checklist = self.db.query(AutoChecklist).filter(
            AutoChecklist.coding_case_id == coding_case_id
        ).first()
        
        summary = {
            "coding_case_id": coding_case_id,
            "total_flags": len(flags),
            "flags_by_severity": self._count_by_severity(flags),
            "flags_by_type": self._count_by_type(flags),
            "checklist_score": checklist.overall_score if checklist else None,
            "quality_level": self._get_quality_level(
                checklist.overall_score
            ) if checklist else "Unknown"
        }
        
        return summary
    
    # ============= Helper Methods =============
    
    def _save_mismatch_flags(self, mismatch_results: List[Dict],
                             coding_case_id: int) -> List[MismatchFlag]:
        """
        Save mismatch flags to database.
        """
        saved_flags = []
        
        for result in mismatch_results:
            try:
                flag = MismatchFlag(
                    coding_case_id=coding_case_id,
                    mismatch_type=result["mismatch_type"],
                    severity=result["severity"],
                    field_name=result["field_name"],
                    expected_value=result.get("expected_value"),
                    actual_value=result.get("actual_value"),
                    similarity_score=result.get("similarity_score"),
                    evidence=result.get("evidence"),
                    recommendation=result.get("recommendation"),
                    is_resolved=False
                )
                
                self.db.add(flag)
                saved_flags.append(flag)
                
            except Exception as e:
                logger.error(f"Failed to save mismatch flag: {e}")
                continue
        
        self.db.commit()
        
        # Refresh to get IDs
        for flag in saved_flags:
            self.db.refresh(flag)
        
        return saved_flags
    
    def _save_auto_checklist(self, checklist_data: Dict,
                             coding_case_id: int) -> AutoChecklist:
        """
        Save auto-checklist to database.
        """
        # Check if checklist already exists
        existing = self.db.query(AutoChecklist).filter(
            AutoChecklist.coding_case_id == coding_case_id
        ).first()
        
        if existing:
            # Update existing
            existing.checklist_data = checklist_data
            existing.overall_score = checklist_data["summary"]["overall_score"]
            existing.total_checks = checklist_data["summary"]["total_checks"]
            existing.passed_checks = checklist_data["summary"]["passed_checks"]
            existing.failed_checks = checklist_data["summary"]["failed_checks"]
            existing.updated_at = datetime.utcnow()
            checklist = existing
        else:
            # Create new
            checklist = AutoChecklist(
                coding_case_id=coding_case_id,
                checklist_data=checklist_data,
                overall_score=checklist_data["summary"]["overall_score"],
                total_checks=checklist_data["summary"]["total_checks"],
                passed_checks=checklist_data["summary"]["passed_checks"],
                failed_checks=checklist_data["summary"]["failed_checks"]
            )
            self.db.add(checklist)
        
        self.db.commit()
        self.db.refresh(checklist)
        
        return checklist
    
    def _summarize_mismatches(self, flags: List[MismatchFlag]) -> Dict:
        """
        Create summary of mismatch flags.
        """
        return {
            "total": len(flags),
            "by_severity": self._count_by_severity(flags),
            "by_type": self._count_by_type(flags),
            "unresolved": sum(1 for f in flags if not f.is_resolved),
            "critical_flags": [
                {
                    "type": f.mismatch_type.value,
                    "field": f.field_name,
                    "recommendation": f.recommendation
                }
                for f in flags
                if f.severity == SeverityEnum.critical
            ][:5]  # Top 5 critical
        }
    
    def _count_by_severity(self, flags: List[MismatchFlag]) -> Dict:
        """Count flags by severity."""
        counts = {
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0
        }
        
        for flag in flags:
            counts[flag.severity.value] += 1
        
        return counts
    
    def _count_by_type(self, flags: List[MismatchFlag]) -> Dict:
        """Count flags by type."""
        counts = {}
        
        for flag in flags:
            flag_type = flag.mismatch_type.value
            counts[flag_type] = counts.get(flag_type, 0) + 1
        
        return counts
    
    def _determine_overall_status(self, critical_count: int,
                                   checklist_score: float) -> str:
        """
        Determine overall validation status.
        """
        if critical_count > 0:
            return "critical"
        elif checklist_score < 70:
            return "needs_review"
        elif checklist_score < 85:
            return "acceptable"
        else:
            return "excellent"
    
    def _get_quality_level(self, score: float) -> str:
        """Convert score to quality level."""
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
    
    def _create_audit_log(self, user_id: int, coding_case_id: int,
                          report: Dict):
        """
        Create audit log entry for validation.
        """
        try:
            audit = AuditLog(
                user_id=user_id,
                action="multi_agent_validation",
                entity_type="coding_case",
                entity_id=coding_case_id,
                old_value=None,
                new_value={
                    "validation_report": {
                        "total_mismatches": report["total_mismatches"],
                        "critical_issues": report["critical_issues"],
                        "overall_status": report["overall_status"],
                        "execution_time": report["total_execution_time"]
                    }
                }
            )
            
            self.db.add(audit)
            self.db.commit()
            
        except Exception as e:
            logger.error(f"Failed to create audit log: {e}")