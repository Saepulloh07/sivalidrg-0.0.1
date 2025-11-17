# app/nlp/entity_extractor.py
from app.utils.ollama_client import OllamaClient
from app.nlp.preprocessor import clean_text
from typing import List, Dict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def extract_entities(raw_text: str) -> List[Dict]:
    """
    Ekstraksi diagnosis dan prosedur medis dari teks menggunakan LLM.
    FIXED: Better error handling and prompt engineering.
    """
    if not raw_text or not raw_text.strip():
        logger.warning("Empty raw_text provided")
        return []
    
    # Clean and normalize text
    clean = clean_text(raw_text)
    
    if not clean:
        logger.warning("Text cleaning resulted in empty string")
        return []
    
    # Truncate if too long (keep first 2000 chars for context)
    if len(clean) > 2000:
        logger.warning(f"Text too long ({len(clean)} chars), truncating to 2000")
        clean = clean[:2000] + "..."
    
    # Initialize Ollama client
    client = OllamaClient()
    
    # Check Ollama health
    if not client.health_check():
        logger.error("Ollama service is not available")
        raise ConnectionError(
            "Ollama service tidak dapat dihubungi. "
            "Pastikan Ollama running: 'ollama serve'"
        )
    
    # Build optimized prompt
    prompt = _build_extraction_prompt(clean)
    
    # Execute inference with error handling
    try:
        entities = client.infer(prompt)
        
        if not entities:
            logger.warning("No entities extracted from text")
            # Return empty instead of failing
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
    FIXED: Simplified and more explicit prompt for better JSON output.
    """
    
    prompt = f"""Ekstrak SEMUA diagnosis dan prosedur medis dari teks ringkasan pulang berikut.

TEKS RINGKASAN PULANG:
{clean_text}

INSTRUKSI:
1. Identifikasi semua diagnosis (penyakit/kondisi medis)
2. Identifikasi semua prosedur (tindakan medis/operasi)
3. Gunakan terminologi medis yang lengkap dan spesifik
4. Format output HARUS JSON array seperti contoh di bawah

CONTOH OUTPUT:
[
  {{"tipe": "diagnosis", "deskripsi": "diabetes mellitus tipe 2 tidak terkontrol"}},
  {{"tipe": "diagnosis", "deskripsi": "hipertensi stage 2"}},
  {{"tipe": "procedure", "deskripsi": "sectio caesarea emergency"}}
]

PENTING:
- Hanya output JSON array, tanpa teks lain
- Jika tidak ada entitas, output: []
- Setiap entitas harus punya "tipe" dan "deskripsi"
- "tipe" hanya boleh "diagnosis" atau "procedure"
"""
    
    return prompt


def validate_extracted_entities(entities: List[Dict]) -> List[Dict]:
    """
    Validasi tambahan untuk memastikan kualitas entities.
    FIXED: Better duplicate detection and cleaning.
    """
    validated = []
    seen_descriptions = set()
    
    for ent in entities:
        # Skip if invalid structure
        if not isinstance(ent, dict) or 'tipe' not in ent or 'deskripsi' not in ent:
            continue
        
        tipe = str(ent['tipe']).lower().strip()
        deskripsi = str(ent['deskripsi']).strip()
        
        # Validate tipe
        if tipe not in ['diagnosis', 'procedure']:
            logger.warning(f"Invalid tipe '{tipe}' for entity: {deskripsi}")
            continue
        
        # Validate deskripsi length and content
        if len(deskripsi) < 3:
            logger.warning(f"Deskripsi too short: {deskripsi}")
            continue
        
        # Normalize for duplicate detection
        normalized_desc = deskripsi.lower().strip()
        
        # Remove exact duplicates
        if normalized_desc in seen_descriptions:
            logger.debug(f"Skipping duplicate: {deskripsi}")
            continue
        
        seen_descriptions.add(normalized_desc)
        
        # Clean up description
        # Remove common artifacts
        cleaned_desc = deskripsi.replace('\n', ' ').replace('\r', '')
        cleaned_desc = ' '.join(cleaned_desc.split())  # Normalize whitespace
        
        if len(cleaned_desc) < 3:
            continue
        
        validated.append({
            'tipe': tipe,
            'deskripsi': cleaned_desc
        })
    
    logger.info(f"Validated {len(validated)} entities from {len(entities)} raw entities")
    return validated