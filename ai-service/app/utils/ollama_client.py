# app/utils/ollama_client.py
import ollama
import json
import re
from typing import List, Dict, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OllamaClient:
    """
    Client untuk berkomunikasi dengan Ollama API.
    FIXED: Better JSON parsing and error handling.
    """
    
    def __init__(self, model: str = "sivalidrg-med-id:latest", temperature: float = 0.1):
        self.model = model
        self.temperature = temperature
        self._verify_model()
    
    def _verify_model(self):
        """Verifikasi bahwa model tersedia di Ollama."""
        try:
            import requests
            response = requests.get('http://localhost:11434/api/tags')
            
            if response.status_code == 200:
                data = response.json()
                models_list = data.get('models', [])
                
                if not models_list:
                    logger.warning("No models found in Ollama. Please pull a model first.")
                    return
                
                available = []
                for m in models_list:
                    if isinstance(m, dict):
                        model_name = m.get('name', '')
                        if model_name:
                            available.append(model_name)
                            available.append(model_name.split(':')[0])
                
                logger.info(f"Available Ollama models: {list(set(available))}")
                
                if self.model in available or any(self.model in m for m in available):
                    logger.info(f"✓ Model '{self.model}' is available")
                else:
                    logger.warning(f"⚠ Model '{self.model}' not found")
            else:
                logger.error(f"Failed to get models: HTTP {response.status_code}")
                
        except Exception as e:
            logger.error(f"Model verification error: {e}")
    
    def infer(self, prompt: str, max_retries: int = 3) -> List[Dict]:
        """
        Melakukan inferensi dengan Ollama API.
        FIXED: Better retry logic and JSON parsing.
        """
        last_error = None
        
        for attempt in range(max_retries):
            try:
                logger.info(f"Inference attempt {attempt + 1}/{max_retries}")
                
                # Call Ollama with explicit format instruction
                enhanced_prompt = self._enhance_prompt(prompt)
                
                response = ollama.chat(
                    model=self.model,
                    messages=[{
                        'role': 'user',
                        'content': enhanced_prompt
                    }],
                    options={
                        'temperature': self.temperature,
                        'top_p': 0.9,
                        'top_k': 20,
                        'num_predict': 1024
                    },
                    format='json'  # FIXED: Force JSON format
                )
                
                # Extract content
                if isinstance(response, dict):
                    content = response.get('message', {}).get('content', '')
                else:
                    content = str(response)
                
                content = content.strip()
                logger.info(f"Ollama raw response ({len(content)} chars): {content[:200]}...")
                
                # Handle empty response
                if not content:
                    logger.warning(f"Empty response (attempt {attempt + 1})")
                    if attempt < max_retries - 1:
                        continue
                    else:
                        return []
                
                # Parse JSON
                entities = self._parse_json_response(content)
                
                # Validate
                validated = self._validate_entities(entities)
                
                if validated:
                    logger.info(f"✓ Successfully extracted {len(validated)} entities")
                    return validated
                else:
                    logger.warning(f"No valid entities found (attempt {attempt + 1})")
                    last_error = "No valid entities after parsing"
                    
            except json.JSONDecodeError as e:
                logger.error(f"JSON parse error (attempt {attempt + 1}): {e}")
                if 'content' in locals():
                    logger.error(f"Raw content: {content[:500]}")
                last_error = str(e)
                
            except Exception as e:
                logger.error(f"Ollama error (attempt {attempt + 1}): {e}")
                logger.error(f"Error type: {type(e).__name__}")
                last_error = str(e)
        
        # All retries failed
        logger.error(f"All {max_retries} extraction attempts failed. Last error: {last_error}")
        raise ValueError(
            f"Failed to extract entities after {max_retries} attempts. "
            f"Last error: {last_error}. "
            "Please check if Ollama model is properly configured."
        )
    
    def _enhance_prompt(self, prompt: str) -> str:
        """
        FIXED: Add explicit JSON formatting instruction.
        """
        return f"""{prompt}

CRITICAL: Your response MUST be ONLY a valid JSON array with this exact format:
[
  {{"tipe": "diagnosis", "deskripsi": "..."}},
  {{"tipe": "procedure", "deskripsi": "..."}}
]

Rules:
- NO text before or after JSON
- NO markdown formatting
- NO explanations
- If no entities found, return: []

JSON OUTPUT:"""
    
    def _parse_json_response(self, content: str) -> List[Dict]:
        """
        FIXED: More robust JSON parsing with multiple strategies.
        """
        # Strategy 1: Direct JSON parse
        try:
            parsed = json.loads(content)
            if isinstance(parsed, list):
                return parsed
            elif isinstance(parsed, dict):
                # Check for common keys that might contain the array
                for key in ['entities', 'results', 'data', 'items']:
                    if key in parsed and isinstance(parsed[key], list):
                        return parsed[key]
                # If dict but not array-like, wrap in list
                if 'tipe' in parsed and 'deskripsi' in parsed:
                    return [parsed]
        except json.JSONDecodeError:
            pass
        
        # Strategy 2: Extract from markdown code block
        json_patterns = [
            r'```json\s*(\[.*?\])\s*```',
            r'```\s*(\[.*?\])\s*```',
            r'(\[.*?\])'
        ]
        
        for pattern in json_patterns:
            match = re.search(pattern, content, re.DOTALL)
            if match:
                try:
                    return json.loads(match.group(1))
                except json.JSONDecodeError:
                    continue
        
        # Strategy 3: Clean and retry
        # Remove common non-JSON prefixes
        cleaned = re.sub(r'^[^[{]*', '', content)
        cleaned = re.sub(r'[^}\]]*$', '', cleaned)
        
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass
        
        # Strategy 4: Try to find any JSON-like structure
        try:
            # Find all { } pairs
            objects = re.findall(r'\{[^{}]*\}', content)
            if objects:
                parsed_objects = []
                for obj in objects:
                    try:
                        parsed_objects.append(json.loads(obj))
                    except:
                        continue
                if parsed_objects:
                    return parsed_objects
        except:
            pass
        
        raise json.JSONDecodeError(
            f"Cannot parse JSON from response. Content: {content[:200]}...",
            content,
            0
        )
    
    def _validate_entities(self, entities: List[Dict]) -> List[Dict]:
        """
        FIXED: More thorough validation.
        """
        if not isinstance(entities, list):
            logger.warning(f"Entities is not a list: {type(entities)}")
            return []
        
        validated = []
        seen = set()  # Prevent duplicates
        
        for idx, ent in enumerate(entities):
            if not isinstance(ent, dict):
                logger.warning(f"Entity {idx} is not a dict: {type(ent)}")
                continue
            
            # Check required fields
            if 'tipe' not in ent or 'deskripsi' not in ent:
                logger.warning(f"Invalid entity structure: {ent}")
                continue
            
            # Validate and normalize tipe
            tipe = str(ent['tipe']).lower().strip()
            if tipe not in ['diagnosis', 'procedure']:
                # Try to infer
                if any(x in tipe for x in ['diag', 'penyakit', 'kondisi']):
                    tipe = 'diagnosis'
                elif any(x in tipe for x in ['proc', 'tindakan', 'operasi']):
                    tipe = 'procedure'
                else:
                    logger.warning(f"Invalid tipe: {tipe}")
                    continue
            
            # Validate deskripsi
            deskripsi = str(ent['deskripsi']).strip()
            if not deskripsi or len(deskripsi) < 3:
                logger.warning(f"Invalid deskripsi: {deskripsi}")
                continue
            
            # Check for duplicates
            key = (tipe, deskripsi.lower())
            if key in seen:
                continue
            seen.add(key)
            
            validated.append({
                'tipe': tipe,
                'deskripsi': deskripsi
            })
        
        return validated
    
    def health_check(self) -> bool:
        """Check apakah Ollama service tersedia."""
        try:
            test_response = ollama.generate(
                model=self.model,
                prompt="test",
                options={'num_predict': 1}
            )
            
            logger.info("Ollama health check: PASSED")
            return True
            
        except Exception as e:
            logger.error(f"Ollama health check failed: {e}")
            return False
    
    def get_available_models(self) -> List[str]:
        """Get list of available models in Ollama."""
        try:
            import requests
            response = requests.get('http://localhost:11434/api/tags')
            
            if response.status_code == 200:
                data = response.json()
                models_list = data.get('models', [])
                
                available = []
                for m in models_list:
                    if isinstance(m, dict):
                        model_name = m.get('name', '')
                        if model_name:
                            available.append(model_name)
                
                return available
            else:
                logger.error(f"Failed to get models: HTTP {response.status_code}")
                return []
            
        except Exception as e:
            logger.error(f"Failed to get available models: {e}")
            return []