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
    
    Args:
        raw_text: Teks ringkasan pulang raw (belum diproses)
        
    Returns:
        List of entities:
        [
            {"tipe": "diagnosis", "deskripsi": "diabetes mellitus tipe 2"},
            {"tipe": "procedure", "deskripsi": "sectio caesarea"}
        ]
    """
    if not raw_text or not raw_text.strip():
        logger.warning("Empty raw_text provided")
        return []
    
    # Clean and normalize text
    clean = clean_text(raw_text)
    
    if not clean:
        logger.warning("Text cleaning resulted in empty string")
        return []
    
    # Initialize Ollama client
    client = OllamaClient()
    
    # Check Ollama health
    if not client.health_check():
        logger.error("Ollama service is not available")
        raise ConnectionError("Ollama service tidak dapat dihubungi")
    
    # Construct detailed prompt for entity extraction
    prompt = _build_extraction_prompt(clean)
    
    # Execute inference
    entities = client.infer(prompt)
    
    if not entities:
        logger.warning("No entities extracted from text")
    
    return entities


def _build_extraction_prompt(clean_text: str) -> str:
    """
    Membangun prompt yang optimal untuk ekstraksi entitas.
    
    Prompt engineering untuk Llama 3 dengan fokus pada:
    - Clear instruction
    - Few-shot examples
    - Structured output format
    """
    
    prompt = f"""Kamu adalah asisten medis AI yang bertugas mengekstrak informasi dari ringkasan pulang pasien.

TUGAS:
Dari teks ringkasan pulang di bawah ini, ekstrak SEMUA diagnosis dan prosedur medis yang disebutkan.

ATURAN:
1. Tipe harus "diagnosis" untuk penyakit/kondisi medis, atau "procedure" untuk tindakan medis
2. Deskripsi harus lengkap dan spesifik (misalnya "diabetes mellitus tipe 2" bukan hanya "diabetes")
3. Gunakan terminologi medis Indonesia yang standar
4. Jika ada kode ICD yang disebutkan, abaikan - fokus hanya pada deskripsi kondisi
5. Output harus dalam format JSON array yang valid

CONTOH INPUT:
"Pasien dirawat dengan diagnosa diabetes mellitus tipe 2 tidak terkontrol dan hipertensi stage 2. Dilakukan tindakan sectio caesarea emergency."

CONTOH OUTPUT:
[
  {{"tipe": "diagnosis", "deskripsi": "diabetes mellitus tipe 2 tidak terkontrol"}},
  {{"tipe": "diagnosis", "deskripsi": "hipertensi stage 2"}},
  {{"tipe": "procedure", "deskripsi": "sectio caesarea emergency"}}
]

TEKS RINGKASAN PULANG:
"{clean_text}"

OUTPUT (JSON array only, no explanation):"""
    
    return prompt


def validate_extracted_entities(entities: List[Dict]) -> List[Dict]:
    """
    Validasi tambahan untuk memastikan kualitas entities.
    
    Args:
        entities: Raw entities dari LLM
        
    Returns:
        Validated and cleaned entities
    """
    validated = []
    
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
        
        # Remove duplicates (case-insensitive)
        is_duplicate = False
        for v in validated:
            if v['tipe'] == tipe and v['deskripsi'].lower() == deskripsi.lower():
                is_duplicate = True
                break
        
        if not is_duplicate:
            validated.append({
                'tipe': tipe,
                'deskripsi': deskripsi
            })  
    
    return validated