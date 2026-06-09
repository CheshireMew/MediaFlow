from backend.services.translator.translation_prompts import TranslationPromptBuilder


def test_subtitle_polish_rules_are_limited_to_proofread_prompt():
    builder = TranslationPromptBuilder()

    base_prompt = builder.build_base_system_prompt("SimplifiedChinese", relevant_terms=[])
    standard_prompt = builder.build_standard_system_prompt(
        base_prompt,
        segment_count=2,
        has_context=False,
    )
    proofread_prompt = builder.build_proofread_system_prompt(
        base_prompt,
        segment_count=2,
        has_context=False,
    )

    assert "Optimize for subtitle viewing" in proofread_prompt
    assert "Fix ASR mistakes in proper nouns" in proofread_prompt
    assert "Optimize for subtitle viewing" not in standard_prompt
    assert "Fix ASR mistakes in proper nouns" not in standard_prompt
