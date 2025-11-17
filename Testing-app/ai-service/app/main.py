# app/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routes.inference import router as infer_router
from app.database import engine
from app.models import Base
from sqlalchemy import text
import logging
import time

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="SIVALIDRG AI Inference Service",
    description="AI service untuk ekstraksi dan coding ICD-10/ICD-9-CM dari dokumen medis dengan Multi-Agent Validation System",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# ============= Middleware =============

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """
    Log all incoming requests and their processing time.
    """
    start_time = time.time()
    
    # Process request
    response = await call_next(request)
    
    # Calculate duration
    duration = time.time() - start_time
    
    # Log
    logger.info(
        f"{request.method} {request.url.path} "
        f"completed in {duration:.3f}s with status {response.status_code}"
    )
    
    # Add custom header
    response.headers["X-Process-Time"] = str(duration)
    
    return response

# ============= Exception Handlers =============

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler untuk menangkap error yang tidak tertangani.
    """
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error occurred",
            "type": type(exc).__name__
        }
    )

# ============= Startup/Shutdown Events =============

@app.on_event("startup")
async def startup_event():
    """
    Run on application startup.
    """
    logger.info("Starting SIVALIDRG AI Inference Service...")
    
    # Create database tables if not exist
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✓ Database tables initialized")
    except Exception as e:
        logger.error(f"✗ Failed to initialize database: {e}")
    
    # Verify Ollama connection
    try:
        from app.utils.ollama_client import OllamaClient
        client = OllamaClient()
        
        if client.health_check():
            logger.info("✓ Ollama service is available")
            
            # List available models
            available_models = client.get_available_models()
            if available_models:
                logger.info(f"✓ Available models: {', '.join(available_models)}")
            else:
                logger.warning("⚠ No models found in Ollama")
                logger.warning("  To pull a model: ollama pull llama3")
        else:
            logger.warning("⚠ Ollama service is not responding")
            logger.warning("  Please ensure:")
            logger.warning("  1. Ollama is running: ollama serve")
            logger.warning("  2. Model is pulled: ollama pull llama3")
    except Exception as e:
        logger.error(f"✗ Failed to check Ollama: {e}")
    
    logger.info("Service started successfully on port 8000")
    logger.info("API Docs: http://localhost:8000/docs")

@app.on_event("shutdown")
async def shutdown_event():
    """
    Run on application shutdown.
    """
    logger.info("Shutting down SIVALIDRG AI Inference Service...")

# ============= Routes =============

# Include inference router
app.include_router(infer_router)

# Root endpoint
@app.get("/", tags=["health"])
def root():
    """
    Root endpoint untuk basic info.
    """
    return {
        "service": "SIVALIDRG AI Inference Service",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }

# Readiness probe
@app.get("/ready", tags=["health"])
def readiness():
    """
    Kubernetes readiness probe.
    """
    return {"status": "ready"}

# Liveness probe
@app.get("/live", tags=["health"])
def liveness():
    """
    Kubernetes liveness probe.
    """
    return {"status": "alive"}

# Health check endpoint - FIXED
@app.get("/health", tags=["health"])
def health_check():
    """
    Comprehensive health check.
    """
    from datetime import datetime
    
    health_status = {
        "status": "healthy",
        "ollama_available": False,
        "database_available": False,
        "agents_available": False,
        "timestamp": datetime.utcnow().isoformat()
    }
    
    # Check Database - FIXED: Use text() wrapper
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        health_status["database_available"] = True
        logger.info("Database health check: OK")
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        health_status["status"] = "degraded"
    
    # Check Ollama
    try:
        from app.utils.ollama_client import OllamaClient
        client = OllamaClient()
        if client.health_check():
            health_status["ollama_available"] = True
            logger.info("Ollama health check: OK")
        else:
            logger.warning("Ollama service is not responding")
            health_status["status"] = "degraded"
    except Exception as e:
        logger.error(f"Ollama health check failed: {e}")
        health_status["status"] = "degraded"
    
    # Check Agents
    try:
        from app.agents.orchestrator import MultiAgentOrchestrator
        # Just check if we can import
        health_status["agents_available"] = True
        logger.info("Agents health check: OK")
    except Exception as e:
        logger.error(f"Agents health check failed: {e}")
        health_status["status"] = "degraded"
    
    # Overall status
    if not all([
        health_status["database_available"],
        health_status["ollama_available"],
        health_status["agents_available"]
    ]):
        health_status["status"] = "degraded"
    
    return health_status

# Info endpoint
@app.get("/info", tags=["health"])
def info():
    """
    Service information endpoint.
    """
    return {
        "service": "SIVALIDRG AI Inference Service",
        "version": "1.0.0",
        "description": "AI-powered medical coding service using Llama 3 with Multi-Agent Validation",
        "features": [
            "Entity extraction from medical discharge summaries",
            "ICD-10 diagnosis coding with semantic search",
            "ICD-9-CM procedure coding",
            "Multi-Agent Validation System:",
            "  - Agent 1: Diagnosis & Lab Mismatch Checker",
            "  - Agent 2: ICD Code Validator",
            "  - Agent 3: Auto-Checklist Generator",
            "Evidence highlighting for transparency"
        ],
        "endpoints": {
            "inference": "/api/v1/infer",
            "validation": "/api/v1/validate",
            "results": "/api/v1/validation/{coding_case_id}",
            "health": "/health",
            "docs": "/docs"
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,  # Set to False in production
        log_level="info"
    )