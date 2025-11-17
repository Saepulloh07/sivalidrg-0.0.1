# app/nlp/icd_matcher.py
from fuzzywuzzy import fuzz
from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List, Dict, Tuple
from sqlalchemy.orm import Session
from app.models import ICDMaster, CodeTypeEnum
from app.nlp.preprocessor import normalize_icd_code
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load Sentence-BERT model for semantic similarity
# Using multilingual model for better Indonesian support
model = SentenceTransformer('paraphrase-multilingual-MiniLM-L12-v2')

# Cache for embeddings to avoid recomputation
_embedding_cache = {}

def embed(text: str) -> np.ndarray:
    """
    Generate embedding vector for text.
    Uses caching for performance.
    """
    if text not in _embedding_cache:
        _embedding_cache[text] = model.encode(text, normalize_embeddings=True)
    return _embedding_cache[text]


def cosine_sim(a: np.ndarray, b: np.ndarray) -> float:
    """
    Calculate cosine similarity between two vectors.
    """
    return float(np.dot(a, b))


def match_icd(entities: List[Dict], db: Session, 
              confidence_threshold: float = 0.70,
              fuzzy_threshold: float = 0.85) -> List[Dict]:
    """
    Match extracted entities ke ICD codes dari database.
    
    Menggunakan hybrid approach:
    - 60% semantic similarity (Sentence-BERT)
    - 40% fuzzy string matching
    
    Args:
        entities: List dari entity extractor
        db: Database session
        confidence_threshold: Minimum confidence untuk hasil (0.0-1.0)
        fuzzy_threshold: Minimum fuzzy score untuk filtering (0.0-1.0)
        
    Returns:
        List of matched entities dengan ICD codes:
        [
            {
                "tipe": "diagnosis",
                "deskripsi": "diabetes mellitus tipe 2",
                "code": "E11.9",
                "description": "Diabetes mellitus tipe 2 tanpa komplikasi",
                "confidence": 0.923
            }
        ]
    """
    if not entities:
        logger.warning("No entities provided for ICD matching")
        return []
    
    results = []
    
    # Query all ICD items once (with proper enum filtering)
    icd_items = db.query(ICDMaster).all()
    
    if not icd_items:
        logger.error("No ICD codes found in database")
        return []
    
    logger.info(f"Loaded {len(icd_items)} ICD codes from database")
    
    # Precompute embeddings for all ICD descriptions
    icd_embeddings = {}
    for item in icd_items:
        key = (item.code_type.value, item.code)  # Use .value for enum
        icd_embeddings[key] = embed(item.description.lower())
    
    # Match each entity
    for ent in entities:
        desc = ent['deskripsi'].lower().strip()
        entity_type = ent['tipe'].lower()  # "diagnosis" or "procedure"
        
        # Convert to CodeTypeEnum for proper filtering
        try:
            code_type_enum = CodeTypeEnum(entity_type)
        except ValueError:
            logger.error(f"Invalid entity type: {entity_type}")
            continue
        
        # Filter candidates by code_type
        candidates = [
            item for item in icd_items 
            if item.code_type == code_type_enum
        ]
        
        if not candidates:
            logger.warning(f"No ICD codes found for type: {entity_type}")
            continue
        
        logger.info(f"Matching '{desc}' against {len(candidates)} {entity_type} codes")
        
        # Find best match
        best_match = _find_best_match(
            desc, 
            candidates, 
            icd_embeddings,
            fuzzy_threshold
        )
        
        if best_match and best_match['confidence'] >= confidence_threshold:
            results.append({
                'tipe': entity_type,
                'deskripsi': ent['deskripsi'],  # Keep original casing
                'code': best_match['code'],
                'description': best_match['description'],
                'confidence': best_match['confidence']
            })
            logger.info(f"Match found: {best_match['code']} (confidence: {best_match['confidence']:.3f})")
        else:
            logger.warning(f"No confident match found for: {desc}")
    
    return results


def _find_best_match(desc: str, 
                     candidates: List[ICDMaster],
                     icd_embeddings: Dict[Tuple, np.ndarray],
                     fuzzy_threshold: float) -> Dict:
    """
    Find the best ICD match for a given description.
    
    Returns:
        Dict with code, description, and confidence, or None
    """
    best = None
    best_score = 0.0
    
    # Compute embedding for entity description once
    desc_emb = embed(desc)
    
    for item in candidates:
        ref_desc = item.description.lower()
        
        # Calculate fuzzy string similarity
        fuzzy_score = fuzz.ratio(desc, ref_desc) / 100.0
        
        # Skip if fuzzy score too low (optimization)
        if fuzzy_score < fuzzy_threshold:
            continue
        
        # Calculate semantic similarity
        key = (item.code_type.value, item.code)
        sem_score = cosine_sim(desc_emb, icd_embeddings[key])
        
        # Combined score (weighted average)
        combined_score = 0.6 * sem_score + 0.4 * fuzzy_score
        
        if combined_score > best_score:
            best_score = combined_score
            best = {
                "code": normalize_icd_code(item.code),
                "description": item.description,
                "confidence": round(combined_score, 3)
            }
    
    return best


def batch_match_icd(entities_list: List[List[Dict]], 
                    db: Session,
                    **kwargs) -> List[List[Dict]]:
    """
    Batch processing untuk multiple dokumen.
    Lebih efisien untuk processing banyak dokumen sekaligus.
    
    Args:
        entities_list: List of entities lists from multiple documents
        db: Database session
        **kwargs: Additional arguments for match_icd
        
    Returns:
        List of matched results for each document
    """
    # Preload all ICD items once
    icd_items = db.query(ICDMaster).all()
    
    # Precompute all embeddings
    icd_embeddings = {}
    for item in icd_items:
        key = (item.code_type.value, item.code)
        icd_embeddings[key] = embed(item.description.lower())
    
    results = []
    for entities in entities_list:
        matched = match_icd(entities, db, **kwargs)
        results.append(matched)
    
    return results


def get_icd_statistics(db: Session) -> Dict:
    """
    Get statistics about ICD codes in database.
    Useful for monitoring and debugging.
    """
    from sqlalchemy import func
    
    stats = {}
    
    # Total codes
    stats['total'] = db.query(ICDMaster).count()
    
    # Count by type
    by_type = db.query(
        ICDMaster.code_type,
        func.count(ICDMaster.id)
    ).group_by(ICDMaster.code_type).all()
    
    stats['by_type'] = {str(t): c for t, c in by_type}
    
    # Count by category (if available)
    by_category = db.query(
        ICDMaster.category,
        func.count(ICDMaster.id)
    ).filter(
        ICDMaster.category.isnot(None)
    ).group_by(ICDMaster.category).limit(10).all()
    
    stats['top_categories'] = {c: cnt for c, cnt in by_category}
    
    return stats