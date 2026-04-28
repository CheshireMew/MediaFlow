import json
from typing import Dict, List, Optional

from backend.models.schemas import SubtitleSegment


class TranslationPromptBuilder:
    @staticmethod
    def output_style_rules() -> str:
        return (
            "Output style requirements:\n"
            "- Follow the normal writing and punctuation conventions of the output language.\n"
            "- If the output text is Chinese, do not casually use the em dash. "
            "Prefer commas, periods, colons, or semicolons unless the source clearly requires a strong interruption or abrupt break.\n"
            "- If the output text is Chinese, follow standard Chinese typography: use full-width Chinese punctuation, "
            "and insert spaces between Chinese text and standalone English words, abbreviations, or acronyms."
        )

    def build_user_content(
        self,
        subtitle_rows: List[Dict[str, str]],
        mode: str,
        context_before: Optional[List[SubtitleSegment]],
    ) -> str:
        if context_before and mode != "intelligent":
            context_lines = [
                {"id": str(segment.id), "source_text": segment.text}
                for segment in context_before
            ]
            return (
                "[CONTEXT - previous lines for reference only, do NOT translate these]\n"
                f"{json.dumps(context_lines, ensure_ascii=False)}\n\n"
                f"[TRANSLATE - translate these {len(subtitle_rows)} entries]\n"
                f"{json.dumps(subtitle_rows, ensure_ascii=False)}"
            )
        return json.dumps(subtitle_rows, ensure_ascii=False)

    def build_base_system_prompt(
        self,
        target_language: str,
        relevant_terms,
    ) -> str:
        system_prompt = f"You are a professional subtitle translator translating to {target_language}."
        system_prompt += "\nThe source text is transcribed from audio and may contain errors. Use context to correct errors during translation."
        system_prompt += f"\n{self.output_style_rules()}"

        if relevant_terms:
            glossary_block = "\nGLOSSARY (Strictly follow these translations):\n"
            for term in relevant_terms:
                glossary_block += f"- {term.source} -> {term.target}\n"
                if term.note:
                    glossary_block += f"  (Note: {term.note})\n"
            system_prompt += glossary_block

        return system_prompt

    def build_standard_system_prompt(
        self,
        base_prompt: str,
        segment_count: int,
        has_context: bool,
    ) -> str:
        ctx_note = "\nNote: Lines under [CONTEXT] are for reference only. Only translate lines under [TRANSLATE]." if has_context else ""
        return base_prompt + f"""
MODE: STANDARD (Strict 1-to-1)
Rules:
1. Input is a JSON array with {segment_count} entries. You MUST output exactly {segment_count} segments.
2. Preserve the exact 'id' from input - do NOT renumber.
3. Copy 'source_text' exactly from input into output. Do not edit it.
4. Translate ONLY the text field. Never merge or split lines, even if incomplete.
5. Every translated 'text' must be non-empty.
6. Fragments stay as fragments.
7. NEVER pull meaning from the next or previous segment into the current segment.
8. If two neighboring lines read better as one sentence, you MUST still keep them separate.
9. Do not complete a sentence using words that belong to another segment.
{ctx_note}
Example:
Input: [{{"id":"1","source_text":"Hello everyone"}}, {{"id":"2","source_text":"welcome to"}}, {{"id":"3","source_text":"our channel"}}]
Correct output has 3 segments with unchanged source_text values.
Wrong: any reordered, merged, empty, or source_text-edited output.
"""

    def build_proofread_system_prompt(
        self,
        base_prompt: str,
        segment_count: int,
        has_context: bool,
    ) -> str:
        ctx_note = "\nNote: Lines under [CONTEXT] are for reference only. Only proofread lines under [TRANSLATE]." if has_context else ""
        return base_prompt + f"""
MODE: PROOFREAD (Grammar & Correction)
Rules:
1. The source is a speech transcription with potential typos, wrong words, or missing punctuation.
2. CORRECT the text (grammar, spelling, punctuation) while keeping the MEANING and LANGUAGE the same.
3. Input has {segment_count} entries. You MUST output exactly {segment_count} segments with the same IDs.
4. Copy 'source_text' exactly from input into output. Do not edit it.
5. Output 'text' must be non-empty.
6. Do NOT translate. Keep the original language.
7. NEVER merge semantic content from neighboring segments into the current one.
8. If a line is incomplete, keep it incomplete instead of borrowing completion from the next line.
{ctx_note}"""

    def build_intelligent_system_prompt(
        self,
        base_prompt: str,
        target_language: str,
    ) -> str:
        return base_prompt + f"""
MODE: INTELLIGENT (Semantic Resegmentation)
Rules:
1. You are allowed to MERGE short, fragmented lines into complete sentences.
2. You are allowed to SPLIT long, run-on sentences into readable chunks.
3. Goal: readability and natural flow in {target_language}.
4. For each segment, provide 'time_percentage' (0.0-1.0) representing its portion of total duration.
"""

    def build_single_line_messages(
        self,
        segment: SubtitleSegment,
        target_language: str,
        mode_label: str,
    ) -> List[Dict[str, str]]:
        if mode_label == "Proofread":
            system_content = (
                "Proofread the following subtitle line.\n"
                "Return only the corrected subtitle text as plain text.\n"
                "Do not return JSON, markdown, labels, or explanations.\n"
                "Keep the original language.\n"
                "Do not merge, split, or rewrite surrounding lines.\n"
                f"{self.output_style_rules()}"
            )
        else:
            system_content = (
                f"Translate the following subtitle line to {target_language}.\n"
                "Return only the translated subtitle text as plain text.\n"
                "Do not return JSON, markdown, labels, or explanations.\n"
                "Do not merge, split, or rewrite surrounding lines.\n"
                f"{self.output_style_rules()}"
            )

        return [
            {"role": "system", "content": system_content},
            {"role": "user", "content": segment.text},
        ]
