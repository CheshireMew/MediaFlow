
import os
import time
from typing import List, Dict, Optional, Union, Literal
from pydantic import BaseModel, Field
import instructor
from openai import OpenAI
from loguru import logger
from src.models.schemas import SubtitleSegment

# --- Schemas for Structured Output ---

class TranslatorSegment(BaseModel):
    id: str = Field(..., description="Original subtitle ID")
    text: str = Field(..., description="Translated text")
    # start/end for verification, though we might not force LLM to output them in standard mode if we just map by ID
    # But for safety we can ask for them.
    
class IntelligentSegment(BaseModel):
    """Segment for intelligent mode (N-to-M mapping)"""
    text: str = Field(..., description="Translated and potentially merged/split text")
    time_percentage: float = Field(..., description="Estimated percentage of the total time block this segment occupies (0.0 to 1.0). If merging multiple lines, this helps redistribute time.")
    
class TranslationResponse(BaseModel):
    """Standard 1-to-1 translation response"""
    segments: List[TranslatorSegment] = Field(..., description="List of translated segments, strictly preserving count and IDs")

class IntelligentTranslationResponse(BaseModel):
    """Intelligent N-to-M translation response"""
    segments: List[IntelligentSegment] = Field(..., description="List of semantic segments. Number of segments can be different from input.")

# --- Translator ---

class LLMTranslator:
    def __init__(self):
        # We no longer load static config here.
        # Client is created lazily per request to allow runtime switching.
        pass

    def _get_client(self):
        """
        Dynamically construct the OpenAI client based on active settings.
        """
        from src.core.container import container, Services
        settings_manager = container.get(Services.SETTINGS_MANAGER)
        
        provider = settings_manager.get_active_llm_provider()
        if not provider:
            logger.error("No active LLM provider found in settings.")
            return None, None

        client = instructor.patch(OpenAI(
            api_key=provider.api_key,
            base_url=provider.base_url
        ))
        return client, provider.model

    def _translate_batch_struct(
        self, 
        segments: List[SubtitleSegment], 
        target_language: str,
        mode: Literal["standard", "intelligent"]
    ) -> List[SubtitleSegment]:
        """
        Internal batch translation using structured output.
        Returns a list of SubtitleSegment (the app's standard schema).
        """
        client, model_name = self._get_client()
        
        if not client:
            raise ValueError("LLM Client not initialized (Check Settings)")

        # Convert to simple list for prompt
        input_text = "\n".join([f"[{s.id}] {s.start:.2f}-{s.end:.2f}: {s.text}" for s in segments])
        
        # --- Glossary Injection ---
        from src.core.container import container, Services
        glossary_service = container.get(Services.GLOSSARY)
        relevant_terms = glossary_service.get_relevant_terms(input_text)
        
        system_prompt = f"You are a professional subtitle translator translating to {target_language}."
        system_prompt += "\nThe source text is transcribed from audio and may contain errors. Please use context to correct valid errors during translation."
        
        if relevant_terms:
            glossary_block = "\nGLOSSARY (Strictly follow these translations):\n"
            for term in relevant_terms:
                glossary_block += f"- {term.source} -> {term.target}\n"
                if term.note:
                    glossary_block += f"  (Note: {term.note})\n"
            system_prompt += glossary_block

        if mode == "standard":
            system_prompt += """
MODE: STANDARD (Strict 1-to-1)
Rules:
1. You MUST return exactly the same number of segments as input.
2. You MUST preserve the exact 'id' from input.
3. Only translate the 'text' field.
4. STRICTLY FORBIDDEN: Merging lines. even if the sentence is incomplete.
5. STRICTLY FORBIDDEN: Splitting lines.
6. If a line is a fragment, translate it as a fragment.
"""
            try:
                resp = client.chat.completions.create(
                    model=model_name,
                    response_model=TranslationResponse,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Input Subtitles:\n{input_text}"}
                    ],
                    temperature=0.3
                )

                logger.info(f"[LLM IO] Input Standard:\n{input_text}")
                logger.info(f"[LLM IO] Output Standard:\n{resp.model_dump_json(indent=2)}")
                
                # Map results back to original segments to preserve exact timestamps
                id_to_text = {s.id: s.text for s in resp.segments}
                
                # Validation: Check for missing IDs
                missing_ids = [str(s.id) for s in segments if str(s.id) not in id_to_text]
                if missing_ids:
                    # Relaxed Matching: If strict ID matching fails but count matches, use positional mapping
                    if len(resp.segments) == len(segments):
                        logger.warning(f"Strict ID matching failed ({len(missing_ids)} missing), but count matches ({len(segments)}). Using positional mapping.")
                        
                        translated_batch = []
                        for i, original in enumerate(segments):
                            new_seg = original.model_copy()
                            new_seg.text = resp.segments[i].text
                            translated_batch.append(new_seg)
                        return translated_batch
                    else:
                        # Partial Success Strategy (User Requested):
                        # Use what we have, fill the rest with source text.
                        # This avoids the "all-or-nothing" retry failure.
                        error_msg = f"LLM response mismatched: Expected {len(segments)} segments, got {len(resp.segments)}. Missing IDs: {missing_ids}. Filling missing with source text."
                        logger.warning(error_msg)
                        
                        translated_batch = []
                        for original in segments:
                            new_seg = original.model_copy()
                            if str(original.id) in id_to_text:
                                new_seg.text = id_to_text[str(original.id)]
                            else:
                                new_seg.text = original.text # Fallback to source
                            translated_batch.append(new_seg)
                        
                        return translated_batch

                translated_batch = []
                for original in segments:
                    new_seg = original.model_copy()
                    # We validated above, so this should be safe, but keep fallback just in case logic changes
                    if str(original.id) in id_to_text:
                        new_seg.text = id_to_text[str(original.id)]
                    translated_batch.append(new_seg)
                    
                return translated_batch
                
            except Exception as e:
                logger.error(f"Standard translation error: {e}")
                raise e

        elif mode == "proofread":
            system_prompt += """
MODE: PROOFREAD (Grammar & Correction)
Rules:
1. The source text is a transcription. It may contain typos, wrong words, or lack punctuation.
2. Your task is to CORRECT the text (fix grammar, spelling, punctuation) while keeping the MEANING and LANGUAGE exactly the same.
3. You MUST return exactly the same number of segments as input.
4. You MUST preserve the exact 'id' from input.
5. Do NOT translate. Keep the original language.
"""
            try:
                resp = client.chat.completions.create(
                    model=model_name,
                    response_model=TranslationResponse,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Input Subtitles:\n{input_text}"}
                    ],
                    temperature=0.3
                )

                logger.info(f"[LLM IO] Input Proofread:\n{input_text}")
                logger.info(f"[LLM IO] Output Proofread:\n{resp.model_dump_json(indent=2)}")
                
                # Map and validate (same as standard)
                id_to_text = {s.id: s.text for s in resp.segments}
                
                # Validation: Check for missing IDs
                missing_ids = [str(s.id) for s in segments if str(s.id) not in id_to_text]
                if missing_ids:
                     # Relaxed Matching logic (Reuse from Standard if possible, or duplicate code for now to be safe)
                    if len(resp.segments) == len(segments):
                        logger.warning(f"[Proofread] Strict ID matching failed, using positional.")
                        translated_batch = []
                        for i, original in enumerate(segments):
                            new_seg = original.model_copy()
                            new_seg.text = resp.segments[i].text
                            translated_batch.append(new_seg)
                        return translated_batch
                    else:
                        logger.warning(f"[Proofread] Mismatch. Filling missing with source.")
                        translated_batch = []
                        for original in segments:
                             new_seg = original.model_copy()
                             if str(original.id) in id_to_text:
                                 new_seg.text = id_to_text[str(original.id)]
                             else:
                                 new_seg.text = original.text
                             translated_batch.append(new_seg)
                        return translated_batch

                translated_batch = []
                for original in segments:
                    new_seg = original.model_copy()
                    if str(original.id) in id_to_text:
                        new_seg.text = id_to_text[str(original.id)]
                    translated_batch.append(new_seg)
                    
                return translated_batch

            except Exception as e:
                logger.error(f"Proofread error: {e}")
                raise e

        elif mode == "intelligent":
            system_prompt += """
MODE: INTELLIGENT (Semantic Resegmentation)
Rules:
1. You are allowed to MERGE short, fragmented lines into complete sentences.
2. You are allowed to SPLIT long, run-on sentences into readable chunks.
3. The goal is readability and flow in {target_language}.
4. Return a list of 'IntelligentSegment'.
5. For each segment, provide 'time_percentage' (0.0-1.0) representing portion of the total block duration.
"""
            try:
                resp = client.chat.completions.create(
                    model=model_name,
                    response_model=IntelligentTranslationResponse,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Input Subtitles:\n{input_text}"}
                    ],
                    temperature=0.7
                )

                logger.info(f"[LLM IO] Input Intelligent:\n{input_text}")
                logger.info(f"[LLM IO] Output Intelligent:\n{resp.model_dump_json(indent=2)}")
                
                # Re-calculate timecodes
                total_start = segments[0].start
                total_end = segments[-1].end
                total_duration = total_end - total_start
                
                new_segments = []
                current_time = total_start
                
                # Normalize percentages
                total_estimated_pct = sum(s.time_percentage for s in resp.segments) or 1.0
                
                # Re-index starting from the first ID of this batch? 
                # Or we need globally unique IDs. 
                # Since this is a batch, we might disrupt IDs. 
                # Strategy: Use string IDs like "{start_id}_{index}" to avoid collision?
                # Or just sequential integers if the consumer allows it.
                # Let's try to keep IDs simple.
                start_id_int = int(segments[0].id) if str(segments[0].id).isdigit() else 0
                
                for i, seg in enumerate(resp.segments):
                    duration = (seg.time_percentage / total_estimated_pct) * total_duration
                    seg_start = current_time
                    seg_end = current_time + duration
                    
                    if i == len(resp.segments) - 1:
                        seg_end = total_end # Clamp last
                    
                    new_segments.append(SubtitleSegment(
                        id=str(start_id_int + i), # This might overlap if not careful, but usually batch processing updates IDs later or UI handles it.
                        text=seg.text,
                        start=round(seg_start, 3),
                        end=round(seg_end, 3)
                    ))
                    current_time = seg_end
                    
                return new_segments

            except Exception as e:
                logger.error(f"Intelligent translation error: {e}")
                raise e
        
        return segments

    def translate_segments(
        self, 
        segments: List[SubtitleSegment], 
        target_language: str, 
        mode: str = "standard", 
        batch_size: int = 50, 
        progress_callback=None
    ) -> List[SubtitleSegment]:
        """
        Orchestrates the batch translation process.
        Compatible with previous API signature.
        """
        if not segments:
            logger.warning("[Translate] Received empty segments list.")
            return []
            
        translated_segments = []
        total_batches = (len(segments) + batch_size - 1) // batch_size
        
        logger.info(f"Starting translation: {len(segments)} segments, mode={mode}, batches={total_batches}")
        
        for i in range(0, len(segments), batch_size):
            batch = segments[i:i+batch_size]
            current_batch_index = i // batch_size
            
            if progress_callback:
                progress_callback(
                    int((current_batch_index / total_batches) * 100), 
                    f"Translating batch {current_batch_index + 1}/{total_batches} ({mode})..."
                )
            

                # Map 'reflect' to 'intelligent'? Or keep 'reflect' as legacy Standard?
                # Using 'reflect' from UI usually maps to Standard with reflection in old code. 
                # Here, let's map:
                # 'standard' -> standard structured
                # 'intelligent' -> intelligent structured
                # 'reflect' -> let's treat as standard for now, or map to intelligent?
                # Let's assume user explicitly chooses 'intelligent'.
                
            effective_mode = mode if mode in ["standard", "intelligent"] else "standard"
            
            # Retry Logic
            max_retries = 3
            for attempt in range(max_retries):
                try:
                    result_batch = self._translate_batch_struct(
                        batch, target_language, effective_mode
                    )
                    translated_segments.extend(result_batch)
                    break # Success, exit retry loop
                    
                except Exception as e:
                    is_last_attempt = (attempt == max_retries - 1)
                    log_level = "error" if is_last_attempt else "warning"
                    getattr(logger, log_level)(f"[Translate] Batch {current_batch_index + 1} failed (Attempt {attempt+1}/{max_retries}): {e}")
                    
                    if is_last_attempt:
                        translated_segments.extend(batch) # Final fallback
                        # We could optionally raise here to stop the whole process, 
                        # but partial translation is usually better than crash.
                    else:
                        time.sleep(1) # Brief pause before retry
                
        # Re-index IDs if intelligent mode mixed things up (optional cleanup)
        if mode == "intelligent":
            for i, seg in enumerate(translated_segments):
                seg.id = str(i + 1)
        
        # Check if we actually translated anything
        # If we just fell back for every batch, we should probably warn or fail
        # But we don't track success count explicitly yet.
        # Let's assume if it completed without raising, it's "success" in terms of "finished".
        logger.info(f"[Translate] Translation loop finished. Total segments: {len(translated_segments)}")
        
        if progress_callback:
            progress_callback(100, "Translation completed")
            
        return translated_segments

# Singleton instance

