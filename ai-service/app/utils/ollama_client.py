# app/utils/ollama_client.py
import ollama
import json
import re
from typing import List, Dict, Any
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class OllamaClient:
    def __init__(self, model: str = "medllama2:latest", temperature: float = 0.0):
        self.model = model
        self.temperature = temperature
        self._verify_model()

    def _verify_model(self):
        # ... (biarkan sama, tidak perlu diubah)
        try:
            import requests
            r = requests.get("http://localhost:11434/api/tags", timeout=5)
            if r.status_code == 200:
                models = [m.get("name") for m in r.json().get("models", [])]
                logger.info(f"Available models: {models}")
                if self.model in models or any(self.model in m for m in models):
                    logger.info(f"✓ Model '{self.model}' tersedia")
                else:
                    logger.warning(f"Model '{self.model}' tidak ditemukan!")
        except Exception as e:
            logger.error(f"Model check error: {e}")

    def infer(self, prompt: str, max_retries: int = 3) -> List[Dict[str, str]]:
        for attempt in range(max_retries):
            try:
                logger.info(f"Inference attempt {attempt + 1}/{max_retries}")

                full_prompt = self._build_prompt(prompt)

                # 1. Coba strict JSON dulu
                result = self._strict_json_call(full_prompt)
                if result:
                    logger.info(f"Strict JSON berhasil → {len(result)} entitas")
                    return result

                # 2. Fallback tanpa format=json + parsing sangat toleran
                result = self._fallback_call(full_prompt)
                if result:
                    logger.info(f"Fallback berhasil → {len(result)} entitas")
                    return result

            except Exception as e:
                logger.error(f"Attempt {attempt + 1} gagal: {e}")

        raise ValueError("Gagal ekstrak entitas setelah beberapa percobaan")

    # ==============================================================
    # STRICT JSON (paling diharapkan)
    # ==============================================================
    def _strict_json_call(self, prompt: str):
        try:
            response = ollama.chat(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                format="json",
                options={
                    "temperature": self.temperature,
                    "num_predict": 1024,
                }
            )
            content = response["message"]["content"].strip()
            logger.info(f"[STRICT] Raw ({len(content)} chars): {content[:300]}...")

            if not content:
                return None

            data = json.loads(content)

            # NORMALISASI apapun bentuknya → list of dict
            entities = self._normalize_to_list(data)
            validated = self._validate_entities(entities)
            return validated if validated else None

        except Exception as e:
            logger.warning(f"Strict JSON gagal: {e}")
            return None

    # ==============================================================
    # FALLBACK (tanpa format=json)
    # ==============================================================
    def _fallback_call(self, prompt: str):
        try:
            response = ollama.chat(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                options={"temperature": self.temperature}
            )
            content = response["message"]["content"].strip()
            logger.info(f"[FALLBACK] Raw ({len(content)} chars): {content[:300]}...")

            if not content:
                return []

            # Parsing sangat toleran
            entities = self._extract_entities_loose(content)
            return self._validate_entities(entities)

        except Exception as e:
            logger.error(f"Fallback error: {e}")
            return []

    # ==============================================================
    # PROMPT YANG LEBIH KETAT & DIPERBAIKI
    # ==============================================================
    def _build_prompt(self, user_prompt: str) -> str:
        return f"""Analisis teks medis berikut dan ekstrak hanya diagnosis dan procedure yang disebutkan.

Teks:
{user_prompt}

INSTRUKSI SANGAT KETAT:
- Keluarkan HANYA JSON yang valid
- Format HARUS berupa array of objects
- Jangan ada teks penjelasan sebelum/sesudah JSON
- Jika tidak ada entitas → return []

Contoh output yang benar:
[
  {{"tipe": "diagnosis", "deskripsi": "Diabetes Melitus Tipe 2"}},
  {{"tipe": "procedure", "deskripsi": "Appendektomi laparaskopi"}}
]

JSON:"""

    # ==============================================================
    # NORMALISASI apapun → List[Dict]
    # ==============================================================
    def _normalize_to_list(self, data: Any) -> List[Dict]:
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            # Kasus 1: {"entities": [...]}
            if "entities" in data and isinstance(data["entities"], list):
                return data["entities"]
            # Kasus 2: {"diagnosis": [...], "procedure": [...]}
            if "diagnosis" in data or "procedure" in data:
                result = []
                for tipe in ["diagnosis", "procedure"]:
                    items = data.get(tipe, [])
                    if isinstance(items, str):
                        items = [items]
                    for desc in items:
                        result.append({"tipe": tipe, "deskripsi": str(desc).strip()})
                return result
            # Kasus 3: dict tunggal
            return [data]
        return []

    # ==============================================================
    # PARSING SUPER TOLERAN (fallback)
    # ==============================================================
    def _extract_entities_loose(self, text: str) -> List[Dict]:
        # 1. Coba ambil isi dalam [...]
        array_match = re.search(r"\[\s*(.*?)\s*\]", text, re.DOTALL)
        if array_match:
            try:
                return json.loads("[" + array_match.group(1) + "]")
            except:
                pass

        # 2. Ambil semua object {...}
        objects = re.findall(r"\{[^}]{20,500}\}", text, re.DOTALL)  # minimal 20 char biar ga ambil noise
        result = []
        for obj in objects:
            try:
                parsed = json.loads(obj)
                if isinstance(parsed, dict) and "tipe" in parsed and "deskripsi" in parsed:
                    result.append(parsed)
            except:
                continue
        return result

    # ==============================================================
    # VALIDASI & DEDUPLIKASI
    # ==============================================================
    def _validate_entities(self, items: List[Dict]) -> List[Dict]:
        if not items:
            return []

        valid_tipe = {"diagnosis", "procedure", "diag", "proc", "tindakan"}
        output = []
        seen = set()

        for ent in items:
            if not isinstance(ent, dict):
                continue
            raw_tipe = str(ent.get("tipe") or "").lower().strip()
            desc = str(ent.get("deskripsi") or ent.get("nama") or "").strip()
            if not desc:
                continue

            # Normalisasi tipe
            if "diag" in raw_tipe or raw_tipe == "diagnosis":
                tipe = "diagnosis"
            elif "proc" in raw_tipe or "tindakan" in raw_tipe or raw_tipe == "procedure":
                tipe = "procedure"
            else:
                continue

            key = (tipe, desc.lower())
            if key in seen:
                continue
            seen.add(key)

            output.append({"tipe": tipe, "deskripsi": desc})

        return output

    # ==============================================================
    # HEALTH CHECK & LIST MODEL
    # ==============================================================
    def health_check(self) -> bool:
        try:
            ollama.generate(model=self.model, prompt="ping", options={"num_predict": 1}, keep_alive=10)
            return True
        except:
            return False

    def get_available_models(self) -> List[str]:
        try:
            import requests
            r = requests.get("http://localhost:11434/api/tags", timeout=5)
            if r.status_code == 200:
                return [m["name"] for m in r.json().get("models", [])]
        except:
            pass
        return []