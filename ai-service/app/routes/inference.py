# app/routes/inference.py
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
    
    # Check if stuck in processing
    if check_stuck and document.status == StatusEnum.ai_processing:
        coding_case = db.query(CodingCase).filter(
            CodingCase.document_id == document_id
        ).first()
        
        if coding_case:
            time_elapsed = datetime.utcnow() - coding_case.updated_at
            is_stuck = time_elapsed.total_seconds() > 600  # 10 minutes
            
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
    """Create AI recommendation records in database."""
    recommendations = []
    
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
    db: Session
) -> dict:
    """
    Core inference logic - extracted untuk reuse di infer dan reprocess.
    """
    start_time = time.time()
    
    # Get patient
    patient = db.query(Patient).filter(
        Patient.id == document.patient_id
    ).first()
    
    if not patient:
        raise ValueError("Patient not found")
    
    # Extract entities
    logger.info("Extracting entities from document...")
    entities = extract_entities(document.raw_text)
    
    if not entities:
        raise ValueError("Tidak ada entitas medis yang dapat diekstrak dari dokumen")
    
    entities = validate_extracted_entities(entities)
    logger.info(f"Extracted and validated {len(entities)} entities")
    
    # Match to ICD codes
    logger.info("Matching entities to ICD codes...")
    matched = match_icd(entities, db)
    
    if not matched:
        raise ValueError("Tidak ada entitas yang dapat dicocokkan dengan kode ICD")
    
    logger.info(f"Matched {len(matched)} entities to ICD codes")
    
    # Create recommendations
    logger.info("Creating AI recommendations...")
    recommendations = _create_recommendations(
        matched, 
        coding_case.id,
        document.raw_text,
        db
    )
    
    db.commit()
    
    for rec in recommendations:
        db.refresh(rec)
    
    # Update status
    coding_case.status = StatusEnum.ai_completed
    coding_case.updated_at = datetime.utcnow()
    db.commit()
    
    # Run validation if requested
    validation_report = None
    if run_validation:
        logger.info("Running multi-agent validation...")
        orchestrator = MultiAgentOrchestrator(db)
        
        try:
            validation_report = orchestrator.run_full_validation(
                norm=patient.norm,
                coding_case_id=coding_case.id,
                user_id=document.upload_by
            )
            logger.info("Multi-agent validation completed")
            
        except Exception as e:
            logger.error(f"Validation failed: {e}")
            validation_report = {
                "status": "error",
                "message": str(e)
            }
    
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
    
    return {
        "coding_case_id": coding_case.id,
        "document_id": document.id,
        "total_recommendations": len(output),
        "results": output,
        "validation_report": validation_report,
        "inference_time": round(duration, 2),
        "status": coding_case.status.value
    }

# ============= API Endpoints =============

@router.post("/infer", response_model=InferenceResponse)
async def process_inference(
    request: InferRequest,
    db: Session = Depends(get_db)
):
    start_time = time.time()
    coding_case = None  # Initialize di awal
    
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
                    "status": coding_case.status.value,  # PERBAIKAN: Gunakan .value
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
       
        # PERBAIKAN: Set status dengan explicit string conversion
        try:
            coding_case.status = StatusEnum.processing
            coding_case.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(coding_case)  # Refresh untuk ensure update berhasil
        except Exception as e:
            logger.error(f"Failed to update status to processing: {e}")
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Database error: Cannot update status. {str(e)}"
            )
       
        result = _process_document_inference(document, coding_case, request.run_validation, db)
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


def _process_document_inference(
    document: Document,
    coding_case: CodingCase,
    run_validation: bool,
    db: Session
) -> dict:
    """
    Core inference logic dengan better error handling.
    """
    start_time = time.time()
    
    try:
        # Get patient
        patient = db.query(Patient).filter(
            Patient.id == document.patient_id
        ).first()
        
        if not patient:
            raise ValueError("Patient not found")
        
        # Extract entities
        logger.info("Extracting entities from document...")
        entities = extract_entities(document.raw_text)
        
        if not entities:
            raise ValueError("Tidak ada entitas medis yang dapat diekstrak dari dokumen")
        
        entities = validate_extracted_entities(entities)
        logger.info(f"Extracted and validated {len(entities)} entities")
        
        # Match to ICD codes
        logger.info("Matching entities to ICD codes...")
        matched = match_icd(entities, db)
        
        if not matched:
            raise ValueError("Tidak ada entitas yang dapat dicocokkan dengan kode ICD")
        
        logger.info(f"Matched {len(matched)} entities to ICD codes")
        
        # Create recommendations
        logger.info("Creating AI recommendations...")
        recommendations = _create_recommendations(
            matched, 
            coding_case.id,
            document.raw_text,
            db
        )
        
        db.commit()
        
        for rec in recommendations:
            db.refresh(rec)
        
        # Update status - PERBAIKAN: Dengan proper error handling
        try:
            coding_case.status = StatusEnum.ai_completed
            coding_case.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(coding_case)
        except Exception as e:
            logger.error(f"Failed to update status to ai_completed: {e}")
            db.rollback()
            raise ValueError(f"Cannot update coding case status: {str(e)}")
        
        # Run validation if requested
        validation_report = None
        if run_validation:
            logger.info("Running multi-agent validation...")
            orchestrator = MultiAgentOrchestrator(db)
            
            try:
                validation_report = orchestrator.run_full_validation(
                    norm=patient.norm,
                    coding_case_id=coding_case.id,
                    user_id=document.upload_by
                )
                logger.info("Multi-agent validation completed")
                
            except Exception as e:
                logger.error(f"Validation failed: {e}")
                validation_report = {
                    "status": "error",
                    "message": str(e)
                }
        
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
        
        return {
            "coding_case_id": coding_case.id,
            "document_id": document.id,
            "total_recommendations": len(output),
            "results": output,
            "validation_report": validation_report,
            "inference_time": round(duration, 2),
            "status": coding_case.status.value  # PERBAIKAN: Gunakan .value
        }
    
    except Exception as e:
        logger.error(f"Error in _process_document_inference: {e}", exc_info=True)
        raise
@router.post("/infer/reprocess", response_model=InferenceResponse)
async def reprocess_inference(
    request: InferRequest,
    force: bool = Query(False, description="Force reprocess even if not stuck"),
    db: Session = Depends(get_db)
):
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
    """
    **Check status dokumen dan coding case dengan available actions.**
    
    Useful untuk:
    - Check apakah dokumen bisa diproses
    - Detect dokumen yang застрял di processing
    - Determine available actions (process, reprocess, force reprocess)
    
    **Response Fields:**
    - `document_id`: ID dokumen
    - `document_status`: Status dokumen (uploaded, ai_processing, ai_completed, etc.)
    - `coding_case`: Info coding case jika ada
    - `can_process`: Apakah bisa diproses dengan /infer
    - `can_reprocess`: Apakah bisa direprocess dengan /infer/reprocess
    - `is_stuck`: Apakah застрял di processing > 10 menit
    - `available_actions`: List aksi yang bisa dilakukan
    
    **Response Example:**
    ```json
    {
      "document_id": 5,
      "document_status": "uploaded",
      "coding_case": {
        "id": 5,
        "status": "ai_processing",
        "updated_at": "2025-01-17T10:30:00",
        "processing_time_seconds": 720,
        "is_stuck": true
      },
      "can_process": false,
      "can_reprocess": true,
      "is_stuck": true,
      "available_actions": [
        {
          "action": "force_reprocess",
          "description": "Force reprocess (document is stuck)",
          "endpoint": "POST /api/v1/infer/reprocess?force=true",
          "body": {"document_id": 5, "run_validation": true},
          "recommended": true
        }
      ]
    }
    ```
    """
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
        
        # Determine available actions
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
                response["available_actions"].append({
                    "action": "force_reprocess",
                    "description": "Force reprocess (cancel current)",
                    "endpoint": "POST /api/v1/infer/reprocess?force=true",
                    "body": {"document_id": document_id, "run_validation": True},
                    "recommended": False,
                    "warning": "Only use if processing is stuck"
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
            
            if coding_case.status == StatusEnum.ai_completed:
                response["available_actions"].append({
                    "action": "view_results",
                    "description": "View current results",
                    "endpoint": f"GET /api/v1/validation/{coding_case.id}",
                    "recommended": True
                })
        
        elif coding_case.status == StatusEnum.finalized:
            response["available_actions"].append({
                "action": "force_reprocess",
                "description": "Force reprocess finalized document",
                "endpoint": "POST /api/v1/infer/reprocess?force=true",
                "body": {"document_id": document_id, "run_validation": True},
                "recommended": False,
                "warning": "This will delete finalized codes and reprocess from scratch"
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
    """
    **Endpoint untuk menjalankan multi-agent validation secara terpisah.**
    
    Menjalankan sistem validasi 3 agent:
    - **Agent 1**: Mismatch Checker - Validasi konsistensi diagnosis, lab support
    - **Agent 2**: ICD Validator - Validasi kode ICD dan dokumentasi
    - **Agent 3**: Auto-Checklist - Generate checklist komprehensif
    
    **Request Body:**
    ```json
    {
      "norm": "RM001234",
      "coding_case_id": 1
    }
    ```
    
    **Response:**
    - 200: Validation completed with report
    - 404: Coding case not found
    - 500: Validation process error
    """
    logger.info(f"Running validation for NoRM: {request.norm}")
    
    try:
        # Verify coding case exists
        coding_case = db.query(CodingCase).filter(
            CodingCase.id == request.coding_case_id
        ).first()
        
        if not coding_case:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Coding case {request.coding_case_id} not found"
            )
        
        # Run multi-agent validation
        orchestrator = MultiAgentOrchestrator(db)
        report = orchestrator.run_full_validation(
            norm=request.norm,
            coding_case_id=request.coding_case_id
        )
        
        # Get checklist score (may be None if validation failed)
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
    """
    **Get validation results untuk coding case tertentu.**
    
    Mengembalikan hasil validasi yang sudah tersimpan:
    - Mismatch flags dari Agent 1 & 2
    - Auto-checklist dari Agent 3
    - Overall validation score
    
    **Path Parameters:**
    - `coding_case_id`: ID dari coding case
    
    **Response:**
    - 200: Validation results found
    - 404: Validation results not found
    - 500: Database error
    """
    try:
        # Get mismatch flags
        flags = db.query(MismatchFlag).filter(
            MismatchFlag.coding_case_id == coding_case_id
        ).all()
        
        # Get checklist
        checklist = db.query(AutoChecklist).filter(
            AutoChecklist.coding_case_id == coding_case_id
        ).first()
        
        # FIXED: Return appropriate response even if no validation exists yet
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
    """
    **Health check endpoint untuk monitoring.**
    
    Mengecek status:
    - Ollama AI service
    - Database connection
    - Multi-agent system
    
    **Response:**
    ```json
    {
      "status": "healthy",
      "ollama_available": true,
      "database_available": true,
      "agents_available": true,
      "timestamp": "2025-01-01T00:00:00"
    }
    ```
    """
    from app.utils.ollama_client import OllamaClient
    
    ollama_status = False
    db_status = False
    agents_status = False
    
    # Check Ollama
    try:
        client = OllamaClient()
        ollama_status = client.health_check()
    except Exception as e:
        logger.error(f"Ollama health check failed: {e}")
    
    # Check Database - FIXED: Use text() wrapper
    try:
        db.execute(text("SELECT 1"))
        db_status = True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
    
    # Check Agents
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