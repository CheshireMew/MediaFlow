
import json
import os
import uuid
from typing import List, Optional
from loguru import logger
from src.models.schemas import GlossaryTerm

DATA_DIR = os.path.join(os.getcwd(), "data")
GLOSSARY_FILE = os.path.join(DATA_DIR, "glossary.json")

class GlossaryService:
    def __init__(self):
        self._ensure_data_dir()
        self.terms: List[GlossaryTerm] = self._load_terms()

    def _ensure_data_dir(self):
        if not os.path.exists(DATA_DIR):
            os.makedirs(DATA_DIR, exist_ok=True)

    def _load_terms(self) -> List[GlossaryTerm]:
        if not os.path.exists(GLOSSARY_FILE):
            return []
        try:
            with open(GLOSSARY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return [GlossaryTerm(**item) for item in data]
        except Exception as e:
            logger.error(f"Failed to load glossary: {e}")
            return []

    def _save_terms(self):
        try:
            with open(GLOSSARY_FILE, "w", encoding="utf-8") as f:
                json.dump([t.dict() for t in self.terms], f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error(f"Failed to save glossary: {e}")

    def list_terms(self) -> List[GlossaryTerm]:
        return self.terms

    def add_term(self, source: str, target: str, note: Optional[str] = None, category: str = "general") -> GlossaryTerm:
        term = GlossaryTerm(
            id=str(uuid.uuid4()),
            source=source,
            target=target,
            note=note,
            category=category
        )
        self.terms.append(term)
        self._save_terms()
        logger.info(f"Added glossary term: {source} -> {target}")
        return term

    def update_term(self, term_id: str, updates: dict) -> Optional[GlossaryTerm]:
        for term in self.terms:
            if term.id == term_id:
                if "source" in updates: term.source = updates["source"]
                if "target" in updates: term.target = updates["target"]
                if "note" in updates: term.note = updates["note"]
                if "category" in updates: term.category = updates["category"]
                self._save_terms()
                return term
        return None

    def delete_term(self, term_id: str) -> bool:
        original_len = len(self.terms)
        self.terms = [t for t in self.terms if t.id != term_id]
        if len(self.terms) < original_len:
            self._save_terms()
            return True
        return False

    def get_relevant_terms(self, text: str) -> List[GlossaryTerm]:
        """
        Simple keyword matching to find terms relevant to the provided text.
        Case-insensitive matching.
        """
        relevant = []
        text_lower = text.lower()
        for term in self.terms:
            if term.source.lower() in text_lower:
                relevant.append(term)
        return relevant


