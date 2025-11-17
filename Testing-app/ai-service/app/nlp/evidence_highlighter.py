# app/nlp/evidence_highlighter.py
from typing import List, Dict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def highlight_evidence(text: str, phrase: str) -> List[Dict[str, int]]:
    """
    Mencari semua kemunculan phrase dalam text dan mengembalikan ranges.
    
    Args:
        text: Full document text (original, case-preserved)
        phrase: Phrase yang ingin di-highlight (evidence dari entity)
        
    Returns:
        List of highlight ranges:
        [
            {"start": 10, "end": 25},
            {"start": 150, "end": 165}
        ]
    """
    if not text or not phrase:
        logger.warning("Empty text or phrase provided to highlight_evidence")
        return []
    
    ranges = []
    text_lower = text.lower()
    phrase_lower = phrase.lower()
    
    # Find all occurrences
    start_pos = 0
    while True:
        idx = text_lower.find(phrase_lower, start_pos)
        
        if idx == -1:
            break
        
        end_pos = idx + len(phrase)
        ranges.append({
            "start": idx,
            "end": end_pos
        })
        
        # Move to next character to find overlapping matches
        start_pos = idx + 1
    
    if not ranges:
        logger.info(f"No exact match found for phrase: '{phrase[:50]}...'")
        # Try fuzzy matching for partial phrases
        ranges = _fuzzy_highlight(text, phrase)
    
    return ranges


def _fuzzy_highlight(text: str, phrase: str, min_word_match: int = 2) -> List[Dict[str, int]]:
    """
    Fuzzy matching untuk menemukan evidence yang tidak exact match.
    Berguna jika LLM mengembalikan deskripsi yang sedikit berbeda.
    
    Args:
        text: Full document text
        phrase: Phrase to search
        min_word_match: Minimum number of words that must match
        
    Returns:
        List of highlight ranges (best effort)
    """
    import re
    
    # Split phrase into significant words (min 3 chars)
    phrase_words = [w.lower() for w in re.findall(r'\w{3,}', phrase)]
    
    if len(phrase_words) < min_word_match:
        return []
    
    text_lower = text.lower()
    ranges = []
    
    # Split text into sentences
    sentences = re.split(r'[.;!\n]+', text)
    current_pos = 0
    
    for sentence in sentences:
        sentence_lower = sentence.lower()
        
        # Count matching words
        matches = sum(1 for word in phrase_words if word in sentence_lower)
        
        if matches >= min_word_match:
            # Find sentence position in original text
            start_idx = text_lower.find(sentence_lower, current_pos)
            if start_idx != -1:
                end_idx = start_idx + len(sentence)
                ranges.append({
                    "start": start_idx,
                    "end": end_idx
                })
        
        current_pos += len(sentence) + 1  # +1 for delimiter
    
    return ranges


def merge_overlapping_ranges(ranges: List[Dict[str, int]]) -> List[Dict[str, int]]:
    """
    Merge overlapping or adjacent highlight ranges.
    Berguna untuk menghindari highlight yang tumpang tindih di UI.
    
    Args:
        ranges: List of {"start": int, "end": int}
        
    Returns:
        Merged ranges
    """
    if not ranges:
        return []
    
    # Sort by start position
    sorted_ranges = sorted(ranges, key=lambda x: x['start'])
    
    merged = [sorted_ranges[0]]
    
    for current in sorted_ranges[1:]:
        last = merged[-1]
        
        # Check if overlapping or adjacent (within 2 characters)
        if current['start'] <= last['end'] + 2:
            # Merge by extending the end
            last['end'] = max(last['end'], current['end'])
        else:
            # Add as new range
            merged.append(current)
    
    return merged


def get_context_snippet(text: str, highlight_range: Dict[str, int], 
                        context_chars: int = 50) -> str:
    """
    Mendapatkan snippet text dengan konteks di sekitar highlight.
    Berguna untuk preview di UI.
    
    Args:
        text: Full document text
        highlight_range: {"start": int, "end": int}
        context_chars: Number of characters before/after to include
        
    Returns:
        Context snippet string with markers
    """
    start = highlight_range['start']
    end = highlight_range['end']
    
    # Calculate context boundaries
    context_start = max(0, start - context_chars)
    context_end = min(len(text), end + context_chars)
    
    # Extract snippet
    before = text[context_start:start]
    highlight = text[start:end]
    after = text[end:context_end]
    
    # Add ellipsis if truncated
    prefix = "..." if context_start > 0 else ""
    suffix = "..." if context_end < len(text) else ""
    
    return f"{prefix}{before}**{highlight}**{after}{suffix}"