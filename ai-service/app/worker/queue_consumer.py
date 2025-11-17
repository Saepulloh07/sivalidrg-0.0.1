# app/worker/queue_consumer.py
import pika
import json
import requests
from dotenv import load_dotenv
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.models import (
    Document, CodingCase, AIRecommendation, Patient,
    StatusEnum, CodeTypeEnum
)
from app.nlp.entity_extractor import extract_entities, validate_extracted_entities
from app.nlp.icd_matcher import match_icd
from app.nlp.evidence_highlighter import highlight_evidence, merge_overlapping_ranges
from app.agents.orchestrator import MultiAgentOrchestrator
import logging
import time
from datetime import datetime
from app.database import SQLALCHEMY_DATABASE_URL, SessionLocal

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

load_dotenv()

# ============= Configuration =============

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "localhost")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "guest")
RABBITMQ_PASS = os.getenv("RABBITMQ_PASS", "guest")
QUEUE_NAME = os.getenv("RABBITMQ_QUEUE", "coding_jobs")
CODING_SERVICE_URL = os.getenv("CODING_SERVICE_URL", "http://localhost:8001")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable must be set")

# Database setup
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    echo=False
)

# ============= Helper Functions =============

def notify_coding_service(endpoint: str, data: dict) -> bool:
    """Send notification to coding service."""
    try:
        url = f"{CODING_SERVICE_URL}{endpoint}"
        response = requests.post(url, json=data, timeout=5)
        response.raise_for_status()
        return True
    except requests.exceptions.RequestException as e:
        logger.error(f"Failed to notify coding service at {endpoint}: {e}")
        return False

def create_recommendations(
    matched_entities: list,
    coding_case_id: int,
    raw_text: str,
    db: Session
) -> list:
    """Create AI recommendation records."""
    recommendations = []
    
    for item in matched_entities:
        evidence = item['deskripsi']
        highlights = highlight_evidence(raw_text, evidence)
        
        if not highlights:
            logger.warning(f"No highlights for: {evidence[:50]}...")
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

def format_results(recommendations: list) -> list:
    """Format recommendations for API response."""
    output_map = {}
    
    for rec in recommendations:
        key = (rec.code, rec.code_type.value)
        if key not in output_map:
            output_map[key] = {
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
    
    return list(output_map.values())

# ============= Message Processing =============

def process_message(ch, method, properties, body):
    """
    Process a single job from RabbitMQ queue with multi-agent validation.
    
    Expected message format:
    {
        "job_id": "unique-job-id",
        "document_id": 123,
        "run_validation": true
    }
    """
    db = SessionLocal()
    start_time = time.time()
    
    try:
        # Parse message
        data = json.loads(body)
        job_id = data.get('job_id')
        document_id = data.get('document_id')
        run_validation = data.get('run_validation', True)
        
        if not job_id or not document_id:
            logger.error(f"Invalid message format: {data}")
            ch.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        logger.info(f"Processing job {job_id} for document {document_id}")
        
        # Update job status to processing
        notify_coding_service("/status", {
            "job_id": job_id,
            "status": "processing"
        })
        
        # Step 1: Get document
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise ValueError(f"Document {document_id} not found")
        
        if not document.raw_text or not document.raw_text.strip():
            raise ValueError("Document has no text content")
        
        # Get patient
        patient = db.query(Patient).filter(Patient.id == document.patient_id).first()
        if not patient:
            raise ValueError("Patient not found")
        
        logger.info(f"Retrieved document {document_id} for patient {patient.norm}")
        
        # Step 2: Get or create coding case
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
            logger.info(f"Created coding case {coding_case.id}")
        else:
            coding_case.status = StatusEnum.ai_processing
            logger.info(f"Using existing coding case {coding_case.id}")
        
        db.commit()
        
        # Step 3: Extract entities
        logger.info("Extracting entities...")
        entities = extract_entities(document.raw_text)
        
        if not entities:
            raise ValueError("No medical entities extracted")
        
        entities = validate_extracted_entities(entities)
        logger.info(f"Validated {len(entities)} entities")
        
        # Step 4: Match ICD codes
        logger.info("Matching ICD codes...")
        matched = match_icd(entities, db)
        
        if not matched:
            raise ValueError("No entities matched to ICD codes")
        
        logger.info(f"Matched {len(matched)} entities")
        
        # Step 5: Create recommendations
        logger.info("Creating recommendations...")
        recommendations = create_recommendations(
            matched,
            coding_case.id,
            document.raw_text,
            db
        )
        
        db.commit()
        
        # Refresh to get IDs
        for rec in recommendations:
            db.refresh(rec)
        
        # Step 6: Update coding case status
        coding_case.status = StatusEnum.ai_completed
        coding_case.updated_at = datetime.utcnow()
        db.commit()
        
        # Step 7: Run multi-agent validation
        validation_report = None
        if run_validation:
            logger.info("Running multi-agent validation...")
            try:
                orchestrator = MultiAgentOrchestrator(db)
                validation_report = orchestrator.run_full_validation(
                    norm=patient.norm,
                    coding_case_id=coding_case.id,
                    user_id=document.upload_by
                )
                logger.info(
                    f"Validation completed: {validation_report['overall_status']} "
                    f"(score: {validation_report['checklist_summary']['overall_score']:.1f}%)"
                )
            except Exception as e:
                logger.error(f"Validation failed: {e}")
                validation_report = {
                    "status": "error",
                    "message": str(e)
                }
        
        # Step 8: Format and send results
        results = format_results(recommendations)
        
        duration = time.time() - start_time
        logger.info(f"Job {job_id} completed in {duration:.2f}s")
        
        # Notify coding service with results
        notify_coding_service("/results", {
            "job_id": job_id,
            "coding_case_id": coding_case.id,
            "results": results,
            "validation_report": validation_report,
            "inference_time": round(duration, 2)
        })
        
        notify_coding_service("/status", {
            "job_id": job_id,
            "status": "completed"
        })
        
        # Acknowledge message
        ch.basic_ack(delivery_tag=method.delivery_tag)
        
    except ValueError as e:
        # Business logic errors
        logger.error(f"Processing error for job {job_id}: {e}")
        db.rollback()
        
        if 'coding_case' in locals():
            coding_case.status = StatusEnum.failed
            db.commit()
        
        notify_coding_service("/status", {
            "job_id": job_id,
            "status": "failed",
            "error": str(e)
        })
        
        ch.basic_ack(delivery_tag=method.delivery_tag)
    
    except Exception as e:
        # Unexpected errors
        logger.error(f"Unexpected error for job {job_id}: {e}", exc_info=True)
        db.rollback()
        
        if 'coding_case' in locals():
            try:
                coding_case.status = StatusEnum.failed
                db.commit()
            except:
                pass
        
        notify_coding_service("/status", {
            "job_id": job_id,
            "status": "failed",
            "error": "Internal server error"
        })
        
        # Reject and requeue (max 3 retries via message headers)
        if properties.headers and properties.headers.get('x-retry-count', 0) < 3:
            logger.info(f"Requeuing job {job_id}")
            ch.basic_nack(delivery_tag=method.delivery_tag, requeue=True)
        else:
            logger.error(f"Max retries reached for job {job_id}")
            ch.basic_ack(delivery_tag=method.delivery_tag)
    
    finally:
        db.close()

# ============= Worker Initialization =============

def main():
    """Start RabbitMQ consumer worker."""
    logger.info("Starting SIVALIDRG AI Worker with Multi-Agent System...")
    logger.info(f"Connecting to RabbitMQ at {RABBITMQ_HOST}:{RABBITMQ_PORT}")
    logger.info(f"Queue: {QUEUE_NAME}")
    
    # Setup RabbitMQ connection with credentials
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASS)
    parameters = pika.ConnectionParameters(
        host=RABBITMQ_HOST,
        port=RABBITMQ_PORT,
        credentials=credentials,
        heartbeat=600,
        blocked_connection_timeout=300
    )
    
    max_retries = 5
    retry_delay = 5
    
    for attempt in range(max_retries):
        try:
            connection = pika.BlockingConnection(parameters)
            channel = connection.channel()
            
            # Declare queue (durable for persistence)
            channel.queue_declare(queue=QUEUE_NAME, durable=True)
            
            # Set QoS to process one message at a time
            channel.basic_qos(prefetch_count=1)
            
            # Setup consumer
            channel.basic_consume(
                queue=QUEUE_NAME,
                on_message_callback=process_message,
                auto_ack=False
            )
            
            logger.info("Worker is ready. Waiting for messages...")
            logger.info("Multi-Agent System: MismatchChecker | ICDValidator | AutoChecklist")
            channel.start_consuming()
            
        except pika.exceptions.AMQPConnectionError as e:
            logger.error(f"Connection failed (attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                logger.info(f"Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
            else:
                logger.error("Max retries reached. Exiting.")
                raise
        
        except KeyboardInterrupt:
            logger.info("Worker stopped by user")
            break
        
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            break

if __name__ == "__main__":
    main()