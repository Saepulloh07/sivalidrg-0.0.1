# app/routes/inference.py - COMPLETE MODIFIED VERSION
from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, Field
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import text
from app.database import get_db
from app.models import (
    Document, CodingCase, AIRecommendation, Patient,
    StatusEnum, CodeTypeEnum, MismatchFlag, AutoChecklist
)
from app.nlp.entity_extractor import extract_entities, validate_extracted_entities
from app.nlp.icd_matcher import match_icd
from app.nlp.evidence_highlighter import highlight_evidence, merge_overlapping_ranges
from app.agents.orchestrator import MultiAgentOrchestrator
import time
import logging
from datetime import datetime, timedelta

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["inference"])

# ============= Request/Response Models =============

class InferRequest(BaseModel):
    document_id: int = Field(..., gt=0, description="ID dokumen yang akan diproses")
    run_validation: bool = Field(default=True, description="Jalankan multi-agent validation")
    skip_icd_matching: bool = Field(default=False, description="Skip ICD matching (manual entry)")

class HighlightRange(BaseModel):
    start: int = Field(..., ge=0)
    end: int = Field(..., gt=0)

class AIRecommendationResponse(BaseModel):
    id: int
    code: str
    code_type: str
    description: str
    confidence: float
    evidence: str
    highlight_ranges: List[HighlightRange]
    
    class Config:
        from_attributes = True

class MismatchFlagResponse(BaseModel):
    id: int
    mismatch_type: str
    severity: str
    field_name: str
    expected_value: Optional[str]
    actual_value: Optional[str]
    similarity_score: Optional[float]
    recommendation: Optional[str]
    
    class Config:
        from_attributes = True

class InferenceResponse(BaseModel):
    coding_case_id: int
    document_id: int
    total_recommendations: int
    results: List[AIRecommendationResponse]
    validation_report: Optional[dict] = None
    inference_time: float
    status: str
    icd_matching_status: Optional[str] = None
    extracted_entities_count: Optional[int] = None
    manual_entry_required: Optional[bool] = None
    message: Optional[str] = None

class ValidationRequest(BaseModel):
    norm: str = Field(..., description="Nomor Rekam Medis pasien")
    coding_case_id: int = Field(..., gt=0, description="ID coding case")

class ValidationResponse(BaseModel):
    norm: str
    coding_case_id: int
    validation_status: str
    total_mismatches: int
    critical_issues: int
    checklist_score: Optional[float] = None
    report: dict

class HealthCheckResponse(BaseModel):
    status: str
    ollama_available: bool
    database_available: bool
    agents_available: bool
    timestamp: str

class DocumentStatusResponse(BaseModel):
    document_id: int
    document_status: str
    coding_case: Optional[dict] = None
    can_process: bool
    can_reprocess: bool
    is_stuck: bool
    available_actions: List[dict]

# ============= Helper Functions =============

def _validate_document(document_id: int, db: Session, check_stuck: bool = True) -> Document:
    """Validate document exists and is ready for processing."""
    document = db.query(Document).filter(Document.id == document_id).first()
    
    if not document:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dokumen dengan ID {document_id} tidak ditemukan"
        )
    
    if check_stuck and document.status == StatusEnum.ai_processing:
        coding_case = db.query(CodingCase).filter(
            CodingCase.document_id == document_id
        ).first()
        
        if coding_case:
            time_elapsed = datetime.utcnow() - coding_case.updated_at
            is_stuck = time_elapsed.total_seconds() > 600
            
            if is_stuck:
                logger.warning(
                    f"Document {document_id} stuck in processing for {time_elapsed.total_seconds():.0f}s"
                )
            
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "Document is currently being processed",
                    "document_id": document_id,
                    "status": document.status.value,
                    "coding_case_id": coding_case.id if coding_case else None,
                    "processing_time_seconds": int(time_elapsed.total_seconds()),
                    "is_stuck": is_stuck,
                    "message": "Document is in 'ai_processing' status. Use reprocess endpoint to force reprocess.",
                    "solutions": {
                        "option_1": {
                            "description": "Check document status",
                            "endpoint": f"GET /api/v1/document/{document_id}/status"
                        },
                        "option_2": {
                            "description": "Force reprocess (recommended if stuck)",
                            "endpoint": "POST /api/v1/infer/reprocess?force=true",
                            "body": {"document_id": document_id, "run_validation": True}
                        },
                        "option_3": {
                            "description": "Reset status via SQL",
                            "sql": f"UPDATE coding_cases SET status='uploaded' WHERE document_id={document_id}"
                        }
                    }
                }
            )
    
    if document.status not in [StatusEnum.uploaded, StatusEnum.failed]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Dokumen tidak siap diproses. Status: {document.status.value}"
        )
    
    if not document.raw_text or not document.raw_text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Dokumen tidak memiliki teks yang dapat diproses"
        )
    
    return document

def _get_or_create_coding_case(document_id: int, db: Session) -> CodingCase:
    """Get existing coding case or create new one."""
    coding_case = db.query(CodingCase).filter(
        CodingCase.document_id == document_id
    ).first()
    
    if not coding_case:
        coding_case = CodingCase(
            document_id=document_id,
            status=StatusEnum.ai_processing
        )
        db.add(coding_case)
        db.flush()
        logger.info(f"Created new coding case ID: {coding_case.id}")
    else:
        if coding_case.status in [StatusEnum.finalized]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Kasus sudah finalized. Status: {coding_case.status.value}"
            )
        
        coding_case.status = StatusEnum.ai_processing
        logger.info(f"Reusing existing coding case ID: {coding_case.id}")
    
    return coding_case

def _create_recommendations(
    matched_entities: List[dict], 
    coding_case_id: int,
    raw_text: str,
    db: Session
) -> List[AIRecommendation]:
    """
    Create AI recommendation records in database.
    MODIFIED: Returns empty list if no matches (instead of raising error)
    """
    recommendations = []
    
    if not matched_entities:
        logger.warning(f"No matched entities for case {coding_case_id}, skipping recommendations creation")
        return recommendations
    
    for item in matched_entities:
        evidence = item['deskripsi']
        highlights = highlight_evidence(raw_text, evidence)
        
        if not highlights:
            logger.warning(f"No highlights found for evidence: {evidence[:50]}...")
            highlights = [{"start": 0, "end": 0}]
        
        highlights = merge_overlapping_ranges(highlights)
        
        for h in highlights:
            try:
                code_type_enum = CodeTypeEnum(item['tipe'])
                
                rec = AIRecommendation(
                    coding_case_id=coding_case_id,
                    code=item['code'],
                    code_type=code_type_enum,
                    description=item['description'],
                    confidence=float(item['confidence']),
                    evidence=evidence,
                    highlight_start=h['start'],
                    highlight_end=h['end']
                )
                db.add(rec)
                recommendations.append(rec)
                
            except ValueError as e:
                logger.error(f"Invalid code_type '{item['tipe']}': {e}")
                continue
    
    return recommendations

def _process_document_inference(
    document: Document,
    coding_case: CodingCase,
    run_validation: bool,
    skip_icd_matching: bool,
    db: Session
) -> dict:
    """
    MODIFIED: Core inference logic dengan optional ICD matching
    
    Alur baru:
    1. Extract entities (optional jika gagal)
    2. Match ICD codes (optional, bisa di-skip)
    3. PRIORITAS: Jalankan validation (Agent 1 → 2 → 3)
    4. User bisa tambah kode manual jika matching gagal
    """
    start_time = time.time()
    
    try:
        # Get patient
        patient = db.query(Patient).filter(
            Patient.id == document.patient_id
        ).first()
        
        if not patient:
            raise ValueError("Patient not found")
        
        # STEP 1: Extract entities (OPTIONAL - tidak fatal jika gagal)
        logger.info("🔍 Step 1: Extracting entities from document...")
        entities = []
        extraction_status = "success"
        
        try:
            entities = extract_entities(document.raw_text)
            
            if not entities:
                logger.warning("⚠️ No entities extracted from document")
                extraction_status = "no_entities"
                entities = []
            else:
                entities = validate_extracted_entities(entities)
                logger.info(f"✅ Extracted and validated {len(entities)} entities")
                extraction_status = "success"
                
        except Exception as e:
            logger.error(f"❌ Entity extraction error (non-fatal): {e}")
            extraction_status = "error"
            entities = []
        
        # STEP 2: Match to ICD codes (OPTIONAL - bisa di-skip)
        logger.info("🔍 Step 2: ICD Code Matching...")
        matched = []
        icd_matching_status = "skipped"
        
        if not skip_icd_matching and entities:
            logger.info(f"Attempting to match {len(entities)} entities to ICD codes...")
            
            try:
                matched = match_icd(entities, db)
                
                if matched:
                    logger.info(f"✅ Matched {len(matched)} entities to ICD codes")
                    icd_matching_status = "success"
                else:
                    logger.warning("⚠️ No entities matched to ICD codes - user can add manually")
                    icd_matching_status = "no_match"
                    
            except Exception as e:
                logger.error(f"❌ ICD matching error (non-fatal): {e}")
                icd_matching_status = "error"
                matched = []
        else:
            if skip_icd_matching:
                logger.info("⏭️ ICD matching skipped by user request")
            else:
                logger.info("⏭️ ICD matching skipped - no entities to match")
            icd_matching_status = "skipped"
        
        # Create recommendations (may be empty - NOT AN ERROR)
        logger.info("Creating AI recommendations...")
        recommendations = _create_recommendations(
            matched, 
            coding_case.id,
            document.raw_text,
            db
        )
        
        if recommendations:
            logger.info(f"✅ Created {len(recommendations)} AI recommendations")
        else:
            logger.info("ℹ️ No AI recommendations created - manual entry required")
        
        db.commit()
        
        for rec in recommendations:
            db.refresh(rec)
        
        # Update status - ALWAYS set to ai_completed (even if no recommendations)
        try:
            coding_case.status = StatusEnum.ai_completed
            coding_case.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(coding_case)
            logger.info(f"✅ Coding case status updated to: {coding_case.status.value}")
        except Exception as e:
            logger.error(f"Failed to update status to ai_completed: {e}")
            db.rollback()
            raise ValueError(f"Cannot update coding case status: {str(e)}")
        
        # STEP 3: Run multi-agent validation (PRIORITAS UTAMA!)
        logger.info("=" * 60)
        logger.info("🔥 STEP 3: RUNNING MULTI-AGENT VALIDATION (PRIORITY!)")
        logger.info("=" * 60)
        
        validation_report = None
        
        if run_validation:
            orchestrator = MultiAgentOrchestrator(db)
            
            try:
                logger.info("Starting Agent 1: Mismatch Checker...")
                logger.info("Starting Agent 2: ICD Validator...")
                logger.info("Starting Agent 3: Auto Checklist...")
                
                validation_report = orchestrator.run_full_validation(
                    norm=patient.norm,
                    coding_case_id=coding_case.id,
                    user_id=document.upload_by
                )
                
                logger.info("=" * 60)
                logger.info(f"✅ VALIDATION COMPLETED!")
                logger.info(f"   Status: {validation_report['overall_status']}")
                logger.info(f"   Total Mismatches: {validation_report['total_mismatches']}")
                logger.info(f"   Critical Issues: {validation_report['critical_issues']}")
                if 'checklist_summary' in validation_report:
                    logger.info(f"   Quality Score: {validation_report['checklist_summary']['overall_score']:.1f}%")
                logger.info("=" * 60)
                
            except Exception as e:
                logger.error(f"❌ Validation failed: {e}", exc_info=True)
                validation_report = {
                    "status": "error",
                    "message": str(e),
                    "overall_status": "error",
                    "total_mismatches": 0,
                    "critical_issues": 0
                }
        else:
            logger.info("⏭️ Validation skipped by user request")
        
        # Format response
        duration = time.time() - start_time
        
        # Group recommendations by code
        output_map = {}
        for rec in recommendations:
            key = (rec.code, rec.code_type.value)
            if key not in output_map:
                output_map[key] = {
                    "id": rec.id,
                    "code": rec.code,
                    "code_type": rec.code_type.value,
                    "description": rec.description,
                    "confidence": float(rec.confidence),
                    "evidence": rec.evidence,
                    "highlight_ranges": []
                }
            
            output_map[key]["highlight_ranges"].append({
                "start": rec.highlight_start,
                "end": rec.highlight_end
            })
        
        output = list(output_map.values())
        
        # Determine manual entry requirement
        manual_entry_required = len(output) == 0
        
        # Generate user-friendly message
        if manual_entry_required:
            if icd_matching_status == "skipped":
                message = "⚠️ ICD matching was skipped. Please add codes manually. Validation has been completed."
            elif icd_matching_status == "no_match":
                message = "⚠️ No ICD codes matched automatically. Please add codes manually. Validation has been completed."
            elif icd_matching_status == "error":
                message = "⚠️ ICD matching encountered an error. Please add codes manually. Validation has been completed."
            else:
                message = "⚠️ No ICD recommendations available. Please add codes manually. Validation has been completed."
        else:
            if validation_report and validation_report.get('overall_status') != 'error':
                message = f"✅ AI processing completed successfully. Found {len(output)} ICD recommendations. Validation completed with {validation_report.get('total_mismatches', 0)} findings."
            else:
                message = f"✅ AI processing completed. Found {len(output)} ICD recommendations."
        
        return {
            "coding_case_id": coding_case.id,
            "document_id": document.id,
            "total_recommendations": len(output),
            "results": output,
            "validation_report": validation_report,
            "inference_time": round(duration, 2),
            "status": coding_case.status.value,
            "icd_matching_status": icd_matching_status,
            "extraction_status": extraction_status,
            "extracted_entities_count": len(entities),
            "manual_entry_required": manual_entry_required,
            "message": message
        }
    
    except Exception as e:
        logger.error(f"Error in _process_document_inference: {e}", exc_info=True)
        raise


# ============= API Endpoints =============

@router.post("/infer", response_model=InferenceResponse)
async def process_inference(
    request: InferRequest,
    db: Session = Depends(get_db)
):
    """
    MODIFIED: Process inference dengan optional ICD matching
    
    Perubahan utama:
    - ICD matching tidak lagi fatal error jika gagal
    - Validation SELALU dijalankan (Agent 1 → 2 → 3)
    - Status selalu menjadi ai_completed
    - User bisa tambah kode manual jika matching gagal
    
    Parameters:
    - document_id: ID dokumen
    - run_validation: True = jalankan multi-agent (default)
    - skip_icd_matching: True = skip ICD matching, langsung manual entry
    """
    start_time = time.time()
    coding_case = None
    
    try:
        document = db.query(Document).filter(Document.id == request.document_id).first()
        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document with ID {request.document_id} not found"
            )
       
        coding_case = db.query(CodingCase).filter(CodingCase.document_id == document.id).first()
        if not coding_case:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="No coding case found for document"
            )
       
        if coding_case.status in [StatusEnum.processing, StatusEnum.ai_processing]:
            processing_time = abs((datetime.utcnow() - (coding_case.updated_at or datetime.utcnow())).total_seconds())
            is_stuck = processing_time > 3600
           
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": "Document is currently being processed",
                    "document_id": document.id,
                    "status": coding_case.status.value,
                    "coding_case_id": coding_case.id,
                    "processing_time_seconds": processing_time,
                    "is_stuck": is_stuck,
                    "message": f"Document is in '{coding_case.status.value}' status.",
                    "solutions": {
                        "option_1": {
                            "description": "Check document status",
                            "endpoint": f"GET /api/v1/document/{document.id}/status"
                        },
                        "option_2": {
                            "description": "Force reprocess",
                            "endpoint": "POST /api/v1/infer/reprocess?force=true",
                            "body": {"document_id": document.id, "run_validation": request.run_validation}
                        }
                    }
                }
            )
       
        try:
            coding_case.status = StatusEnum.processing
            coding_case.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(coding_case)
        except Exception as e:
            logger.error(f"Failed to update status to processing: {e}")
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Database error: Cannot update status. {str(e)}"
            )
       
        result = _process_document_inference(
            document, 
            coding_case, 
            request.run_validation,
            request.skip_icd_matching,
            db
        )
        result["inference_time"] = round(time.time() - start_time, 2)
        
        return InferenceResponse(**result)
    
    except HTTPException:
        raise
    
    except ValueError as e:
        db.rollback()
        if coding_case:
            try:
                coding_case.status = StatusEnum.failed
                coding_case.updated_at = datetime.utcnow()
                db.commit()
            except Exception as commit_error:
                logger.error(f"Failed to set status to failed: {commit_error}")
                db.rollback()
        raise HTTPException(status_code=422, detail=str(e))
    
    except Exception as e:
        db.rollback()
        if coding_case:
            try:
                coding_case.status = StatusEnum.failed
                coding_case.updated_at = datetime.utcnow()
                db.commit()
            except Exception as commit_error:
                logger.error(f"Failed to set status to failed: {commit_error}")
                db.rollback()
        
        logger.error(f"Unexpected error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@router.post("/infer/reprocess", response_model=InferenceResponse)
async def reprocess_inference(
    request: InferRequest,
    force: bool = Query(False, description="Force reprocess even if not stuck"),
    db: Session = Depends(get_db)
):
    """
    MODIFIED: Reprocess dengan skip_icd_matching option
    """
    start_time = time.time()
    try:
        document = db.query(Document).filter(Document.id == request.document_id).first()
        if not document:
            raise HTTPException(status_code=404, detail=f"Document with ID {request.document_id} not found")
       
        coding_case = db.query(CodingCase).filter(CodingCase.document_id == document.id).first()
        if not coding_case:
            raise HTTPException(status_code=500, detail="No coding case found for document")
       
        if coding_case.status in [StatusEnum.processing, StatusEnum.ai_processing]:
            processing_time = abs((datetime.utcnow() - (coding_case.updated_at or datetime.utcnow())).total_seconds())
            is_stuck = processing_time > 3600
           
            if not force and not is_stuck:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "Document is processing but not stuck",
                        "processing_time_seconds": processing_time,
                        "message": "Set force=true to override"
                    }
                )
       
        coding_case.status = StatusEnum.uploaded
        coding_case.updated_at = datetime.utcnow()
        db.commit()
       
        return await process_inference(request, db)
   
    except HTTPException:
        raise
    except Exception as e:
        if coding_case:
            coding_case.status = StatusEnum.failed
            coding_case.updated_at = datetime.utcnow()
            db.commit()
        logger.error(f"Reprocess error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/document/{document_id}/status", response_model=DocumentStatusResponse)
def get_document_status(
    document_id: int,
    db: Session = Depends(get_db)
):
    """Check status dokumen dan coding case dengan available actions."""
    document = db.query(Document).filter(Document.id == document_id).first()
    
    if not document:
        raise HTTPException(404, "Document not found")
    
    coding_case = db.query(CodingCase).filter(
        CodingCase.document_id == document_id
    ).first()
    
    response = {
        "document_id": document_id,
        "document_status": document.status.value,
        "coding_case": None,
        "can_process": False,
        "can_reprocess": False,
        "is_stuck": False,
        "available_actions": []
    }
    
    if coding_case:
        time_elapsed = datetime.utcnow() - coding_case.updated_at
        processing_seconds = int(time_elapsed.total_seconds())
        is_stuck = coding_case.status == StatusEnum.ai_processing and processing_seconds > 600
        
        response["coding_case"] = {
            "id": coding_case.id,
            "status": coding_case.status.value,
            "updated_at": coding_case.updated_at.isoformat(),
            "processing_time_seconds": processing_seconds,
            "is_stuck": is_stuck
        }
        response["is_stuck"] = is_stuck
        
        if coding_case.status == StatusEnum.uploaded:
            response["can_process"] = True
            response["available_actions"].append({
                "action": "process",
                "description": "Process document with AI",
                "endpoint": "POST /api/v1/infer",
                "body": {"document_id": document_id, "run_validation": True},
                "recommended": True
            })
        
        elif coding_case.status == StatusEnum.ai_processing:
            if is_stuck:
                response["can_reprocess"] = True
                response["available_actions"].append({
                    "action": "force_reprocess",
                    "description": "Force reprocess (document is stuck)",
                    "endpoint": "POST /api/v1/infer/reprocess?force=true",
                    "body": {"document_id": document_id, "run_validation": True},
                    "recommended": True,
                    "warning": "This will cancel current processing"
                })
            else:
                response["available_actions"].append({
                    "action": "wait",
                    "description": f"Wait for processing to complete (running for {processing_seconds}s)",
                    "endpoint": None,
                    "recommended": True
                })
        
        elif coding_case.status in [StatusEnum.ai_completed, StatusEnum.failed]:
            response["can_reprocess"] = True
            response["available_actions"].append({
                "action": "reprocess",
                "description": "Reprocess document",
                "endpoint": "POST /api/v1/infer/reprocess",
                "body": {"document_id": document_id, "run_validation": True},
                "recommended": True
            })
    else:
        response["can_process"] = document.status == StatusEnum.uploaded
        if response["can_process"]:
            response["available_actions"].append({
                "action": "process",
                "description": "Process document with AI (first time)",
                "endpoint": "POST /api/v1/infer",
                "body": {"document_id": document_id, "run_validation": True},
                "recommended": True
            })
    
    return response

@router.post("/validate", response_model=ValidationResponse)
def run_validation(
    request: ValidationRequest,
    db: Session = Depends(get_db)
):
    """Run multi-agent validation secara terpisah"""
    logger.info(f"Running validation for NoRM: {request.norm}")
    
    try:
        coding_case = db.query(CodingCase).filter(
            CodingCase.id == request.coding_case_id
        ).first()
        
        if not coding_case:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Coding case {request.coding_case_id} not found"
            )
        
        orchestrator = MultiAgentOrchestrator(db)
        report = orchestrator.run_full_validation(
            norm=request.norm,
            coding_case_id=request.coding_case_id
        )
        
        checklist_score = None
        if "checklist_summary" in report and "overall_score" in report["checklist_summary"]:
            checklist_score = report["checklist_summary"]["overall_score"]
        
        return ValidationResponse(
            norm=request.norm,
            coding_case_id=request.coding_case_id,
            validation_status=report["overall_status"],
            total_mismatches=report["total_mismatches"],
            critical_issues=report["critical_issues"],
            checklist_score=checklist_score,
            report=report
        )
    
    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"Validation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/validation/{coding_case_id}")
def get_validation_results(
    coding_case_id: int,
    db: Session = Depends(get_db)
):
    """Get validation results untuk coding case tertentu"""
    try:
        flags = db.query(MismatchFlag).filter(
            MismatchFlag.coding_case_id == coding_case_id
        ).all()
        
        checklist = db.query(AutoChecklist).filter(
            AutoChecklist.coding_case_id == coding_case_id
        ).first()
        
        if not checklist and not flags:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No validation results found for coding case {coding_case_id}. "
                       "Run validation first using POST /api/v1/validate"
            )
        
        return {
            "coding_case_id": coding_case_id,
            "mismatch_flags": [
                {
                    "id": f.id,
                    "type": f.mismatch_type.value,
                    "severity": f.severity.value,
                    "field": f.field_name,
                    "expected": f.expected_value,
                    "actual": f.actual_value,
                    "similarity_score": f.similarity_score,
                    "recommendation": f.recommendation,
                    "is_resolved": f.is_resolved
                }
                for f in flags
            ],
            "checklist": checklist.checklist_data if checklist else None,
            "overall_score": checklist.overall_score if checklist else None,
            "total_checks": checklist.total_checks if checklist else 0,
            "passed_checks": checklist.passed_checks if checklist else 0,
            "failed_checks": checklist.failed_checks if checklist else 0,
            "created_at": checklist.created_at.isoformat() if checklist else None,
            "has_validation": checklist is not None
        }
    
    except HTTPException:
        raise
    
    except Exception as e:
        logger.error(f"Error retrieving validation results: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/health", response_model=HealthCheckResponse)
def health_check(db: Session = Depends(get_db)):
    """Health check endpoint untuk monitoring"""
    from app.utils.ollama_client import OllamaClient
    from datetime import datetime
    
    ollama_status = False
    db_status = False
    agents_status = False
    
    try:
        client = OllamaClient()
        ollama_status = client.health_check()
    except Exception as e:
        logger.error(f"Ollama health check failed: {e}")
    
    try:
        db.execute(text("SELECT 1"))
        db_status = True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
    
    try:
        orchestrator = MultiAgentOrchestrator(db)
        agents_status = True
    except Exception as e:
        logger.error(f"Agents health check failed: {e}")
    
    overall_status = "healthy" if all([
        ollama_status, db_status, agents_status
    ]) else "degraded"
    
    return HealthCheckResponse(
        status=overall_status,
        ollama_available=ollama_status,
        database_available=db_status,
        agents_available=agents_status,
        timestamp=datetime.utcnow().isoformat()
    )