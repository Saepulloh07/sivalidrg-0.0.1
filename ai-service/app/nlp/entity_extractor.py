# app/nlp/entity_extractor.py - FIXED VERSION
from app.utils.ollama_client import OllamaClient
from app.nlp.preprocessor import clean_text
from typing import List, Dict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def extract_entities(raw_text: str) -> List[Dict]:
    """
    Ekstraksi diagnosis dan prosedur medis dari teks menggunakan LLM.
    FIXED: Simplified prompt untuk better JSON output.
    """
    if not raw_text or not raw_text.strip():
        logger.warning("Empty raw_text provided")
        return []
    
    # Clean and normalize text
    clean = clean_text(raw_text)
    
    if not clean:
        logger.warning("Text cleaning resulted in empty string")
        return []
    
    # Truncate if too long
    if len(clean) > 1500:
        logger.warning(f"Text too long ({len(clean)} chars), truncating to 1500")
        clean = clean[:1500]
    
    # Initialize Ollama client
    client = OllamaClient()
    
    # Check Ollama health
    if not client.health_check():
        logger.error("Ollama service is not available")
        raise ConnectionError(
            "Ollama service tidak dapat dihubungi. "
            "Pastikan Ollama running: 'ollama serve'"
        )
    
    # Build simplified prompt
    prompt = _build_extraction_prompt(clean)
    
    # Execute inference with error handling
    try:
        entities = client.infer(prompt)
        
        if not entities:
            logger.warning("No entities extracted from text")
            return []
        
        logger.info(f"✓ Extracted {len(entities)} entities")
        return entities
        
    except ValueError as e:
        logger.error(f"Entity extraction failed: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during extraction: {e}")
        raise ValueError(f"Entity extraction error: {str(e)}")


def _build_extraction_prompt(clean_text: str) -> str:
    """
    FIXED: Ultra-simplified prompt untuk maximize JSON compliance.
    """
    
    prompt = f"""TEKS MEDIS:
{clean_text}

TUGAS: Ekstrak diagnosis dan prosedur medis.

FORMAT OUTPUT (wajib JSON array):
[
  {{"tipe":"diagnosis","deskripsi":"Diabetes melitus tipe 2 spesifik"}},
  {{"tipe":"procedure","deskripsi":"pemeriksaan tekanan darah"}}
]

ATURAN:
- Output HANYA JSON array
- Tidak boleh ada teks lain
- "tipe" hanya "diagnosis" atau "procedure"
- Jika tidak ada: []

JSON:"""
    
    return prompt


def validate_extracted_entities(entities: List[Dict]) -> List[Dict]:
    """
    Validasi tambahan untuk memastikan kualitas entities.
    """
    if not entities or not isinstance(entities, list):
        return []
    
    validated = []
    seen_descriptions = set()
    
    for ent in entities:
        # Skip if invalid structure
        if not isinstance(ent, dict):
            continue
        
        if 'tipe' not in ent or 'deskripsi' not in ent:
            continue
        
        tipe = str(ent['tipe']).lower().strip()
        deskripsi = str(ent['deskripsi']).strip()
        
        # Validate tipe
        if tipe not in ['diagnosis', 'procedure']:
            logger.warning(f"Invalid tipe '{tipe}' for entity: {deskripsi}")
            continue
        
        # Validate deskripsi
        if len(deskripsi) < 3 or len(deskripsi) > 500:
            logger.warning(f"Invalid deskripsi length: {len(deskripsi)}")
            continue
        
        # Normalize for duplicate detection
        normalized_desc = deskripsi.lower().strip()
        
        # Remove exact duplicates
        if normalized_desc in seen_descriptions:
            logger.debug(f"Skipping duplicate: {deskripsi}")
            continue
        
        seen_descriptions.add(normalized_desc)
        
        # Clean up description
        import re
        cleaned_desc = re.sub(r'\s+', ' ', deskripsi)
        cleaned_desc = cleaned_desc.strip()
        
        if len(cleaned_desc) < 3:
            continue
        
        validated.append({
            'tipe': tipe,
            'deskripsi': cleaned_desc
        })
    
    logger.info(f"Validated {len(validated)} entities from {len(entities)} raw entities")
    return validated