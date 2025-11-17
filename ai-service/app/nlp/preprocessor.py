# app/nlp/preprocessor.py
import re
from typing import Dict

# Medical abbreviations dictionary - expand as needed
MED_ABBREVIATIONS: Dict[str, str] = {
    # Diabetes & Metabolic
    "dm": "diabetes mellitus",
    "dm t2": "diabetes mellitus tipe 2",
    "dm t1": "diabetes mellitus tipe 1",
    
    # Cardiovascular
    "ht": "hipertensi",
    "htn": "hipertensi",
    "gjk": "gagal jantung kongestif",
    "chf": "gagal jantung kongestif",
    "mi": "infark miokard",
    "ami": "infark miokard akut",
    "cad": "penyakit arteri koroner",
    "ihd": "penyakit jantung iskemik",
    
    # Respiratory
    "tb": "tuberkulosis",
    "tbc": "tuberkulosis",
    "ppok": "penyakit paru obstruktif kronik",
    "copd": "penyakit paru obstruktif kronik",
    
    # Renal
    "ckd": "chronic kidney disease",
    "pgk": "penyakit ginjal kronik",
    "arf": "gagal ginjal akut",
    "aki": "acute kidney injury",
    
    # Oncology
    "ca": "kanker",
    "ca mammae": "kanker payudara",
    "ca cervix": "kanker serviks",
    
    # Infectious
    "isk": "infeksi saluran kemih",
    "uti": "infeksi saluran kemih",
    "ispa": "infeksi saluran pernapasan akut",
    
    # Surgical
    "sectio caesaria": "sectio caesarea",
    "sc": "sectio caesarea",
    "appendisitis": "appendisitis",
    "laparotomi": "laparotomi",
    
    # Other common terms
    "luka bakar": "luka bakar",
    "fraktur": "fraktur",
    "trauma": "trauma",
    "dehidrasi": "dehidrasi"
}

def clean_text(text: str) -> str:
    """
    Membersihkan dan menormalisasi teks medis.
    
    Args:
        text: Raw text dari dokumen medis
        
    Returns:
        Cleaned and normalized text
    """
    if not text or not isinstance(text, str):
        return ""
    
    # Convert to lowercase
    text = text.lower()
    
    # Remove excessive newlines and replace with space
    text = re.sub(r'\n+', ' ', text)
    
    # Remove excessive whitespace
    text = re.sub(r'\s+', ' ', text)
    
    # Normalize medical abbreviations (case-insensitive word boundary matching)
    for abbr, full in MED_ABBREVIATIONS.items():
        # Use word boundary to avoid partial matches
        pattern = r'\b' + re.escape(abbr) + r'\b'
        text = re.sub(pattern, full, text, flags=re.IGNORECASE)
    
    # Remove special characters that don't add medical meaning
    # Keep: letters, numbers, spaces, and medical punctuation (.,/-:)
    text = re.sub(r'[^\w\s.,/\-:]', '', text)
    
    # Final trim
    text = text.strip()
    
    return text

def extract_sentences(text: str) -> list:
    """
    Memecah teks menjadi kalimat-kalimat.
    Berguna untuk processing yang lebih granular.
    """
    # Simple sentence splitting by period, newline, or semicolon
    sentences = re.split(r'[.;\n]+', text)
    return [s.strip() for s in sentences if s.strip()]

def normalize_icd_code(code: str) -> str:
    """
    Normalize ICD code format.
    Example: E11.9 or E119 -> E11.9
    """
    if not code:
        return ""
    
    code = code.upper().strip()
    
    # For ICD-10: Add dot after first 3 characters if not present
    # Pattern: Letter + 2 digits + optional dot + optional digits
    if re.match(r'^[A-Z]\d{2}\d*$', code):
        if len(code) > 3:
            code = code[:3] + '.' + code[3:]
    
    return code