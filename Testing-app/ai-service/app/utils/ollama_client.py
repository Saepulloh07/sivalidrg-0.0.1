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
    Menggunakan Llama 3 untuk entity extraction.
    """
    
    def __init__(self, model: str = "sivalidrg-med-id:latest", temperature: float = 0.1):
        """
        Args:
            model: Nama model Ollama yang akan digunakan
            temperature: Kontrol randomness (0.0 = deterministic, 1.0 = creative)
        """
        self.model = model
        self.temperature = temperature
        self._verify_model()
    
    def _verify_model(self):
        """Verifikasi bahwa model tersedia di Ollama."""
        try:
            # Get models using tags endpoint
            import requests
            response = requests.get('http://localhost:11434/api/tags')
            
            if response.status_code == 200:
                data = response.json()
                models_list = data.get('models', [])
                
                if not models_list:
                    logger.warning("No models found in Ollama. Please pull a model first.")
                    logger.warning("Example: ollama pull llama3")
                    return
                
                # Extract model names
                available = []
                for m in models_list:
                    if isinstance(m, dict):
                        # Model name is usually in 'name' field
                        model_name = m.get('name', '')
                        if model_name:
                            # Remove :latest or other tags for comparison
                            base_name = model_name.split(':')[0]
                            available.append(model_name)
                            available.append(base_name)
                
                logger.info(f"Available Ollama models: {list(set(available))}")
                
                # Check if configured model exists
                if self.model in available or any(self.model in m for m in available):
                    logger.info(f"✓ Model '{self.model}' is available")
                else:
                    logger.warning(
                        f"⚠ Model '{self.model}' not found. Available: {list(set(available))}"
                    )
                    logger.warning(f"  Will attempt to use '{self.model}' anyway")
                    logger.warning(f"  To pull model: ollama pull {self.model}")
            else:
                logger.error(f"Failed to get models: HTTP {response.status_code}")
                
        except requests.exceptions.ConnectionError:
            logger.error("Cannot connect to Ollama. Is it running?")
            logger.error("Start Ollama: ollama serve")
        except Exception as e:
            logger.error(f"Model verification error: {e}")
    
    def infer(self, prompt: str, max_retries: int = 2) -> List[Dict]:
        """
        Melakukan inferensi dengan Ollama API.
        
        Args:
            prompt: Prompt untuk model
            max_retries: Jumlah retry jika parsing gagal
            
        Returns:
            List of extracted entities dengan format:
            [{"tipe": "diagnosis"|"procedure", "deskripsi": "..."}]
        """
        for attempt in range(max_retries + 1):
            try:
                logger.info(f"Inference attempt {attempt + 1}/{max_retries + 1}")
                
                response = ollama.chat(
                    model=self.model,
                    messages=[{
                        'role': 'user',
                        'content': prompt
                    }],
                    options={
                        'temperature': self.temperature,
                        'top_p': 0.9,
                        'top_k': 40
                    }
                )
                
                # Handle different response formats
                if isinstance(response, dict):
                    content = response.get('message', {}).get('content', '')
                else:
                    content = str(response)
                
                content = content.strip()
                logger.info(f"Ollama raw response: {content[:200]}...")
                
                # Parse JSON from response
                entities = self._parse_json_response(content)
                
                # Validate entities
                validated = self._validate_entities(entities)
                
                if validated:
                    logger.info(f"Successfully extracted {len(validated)} entities")
                    return validated
                else:
                    logger.warning(f"No valid entities found (attempt {attempt + 1})")
                    
            except json.JSONDecodeError as e:
                logger.error(f"JSON parse error (attempt {attempt + 1}): {e}")
                if 'content' in locals():
                    logger.error(f"Raw content: {content}")
                
            except Exception as e:
                logger.error(f"Ollama error (attempt {attempt + 1}): {e}")
                logger.error(f"Error type: {type(e).__name__}")
        
        # If all retries failed
        logger.error("All extraction attempts failed")
        return []
    
    def _parse_json_response(self, content: str) -> List[Dict]:
        """
        Parse JSON dari response, dengan handling untuk berbagai format.
        """
        # Try direct JSON parse
        try:
            parsed = json.loads(content)
            # Ensure it's a list
            if isinstance(parsed, dict):
                # If it's a dict with a key containing a list, extract it
                for key in ['entities', 'results', 'data']:
                    if key in parsed and isinstance(parsed[key], list):
                        return parsed[key]
            elif isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
        
        # Try to extract JSON from markdown code blocks
        json_match = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        
        # Try to find JSON array in text
        array_match = re.search(r'\[.*\]', content, re.DOTALL)
        if array_match:
            try:
                return json.loads(array_match.group(0))
            except json.JSONDecodeError:
                pass
        
        raise json.JSONDecodeError("Cannot parse JSON from response", content, 0)
    
    def _validate_entities(self, entities: List[Dict]) -> List[Dict]:
        """
        Validasi bahwa entities memiliki struktur yang benar.
        """
        if not isinstance(entities, list):
            logger.warning(f"Entities is not a list: {type(entities)}")
            return []
        
        validated = []
        for ent in entities:
            if not isinstance(ent, dict):
                logger.warning(f"Entity is not a dict: {type(ent)}")
                continue
            
            # Check required fields
            if 'tipe' not in ent or 'deskripsi' not in ent:
                logger.warning(f"Invalid entity structure: {ent}")
                continue
            
            # Validate tipe value
            tipe = str(ent['tipe']).lower().strip()
            if tipe not in ['diagnosis', 'procedure']:
                logger.warning(f"Invalid tipe: {tipe}")
                continue
            
            # Validate deskripsi
            deskripsi = str(ent['deskripsi']).strip()
            if not deskripsi or len(deskripsi) < 3:
                logger.warning(f"Invalid deskripsi: {deskripsi}")
                continue
            
            validated.append({
                'tipe': tipe,
                'deskripsi': deskripsi
            })
        
        return validated
    
    def health_check(self) -> bool:
        """
        Check apakah Ollama service tersedia.
        """
        try:
            # Try a simple generation test
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
        """
        Get list of available models in Ollama.
        """
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