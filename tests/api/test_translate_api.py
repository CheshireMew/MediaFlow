from backend.api.v1.translate import (
    get_language_suffix,
    get_translation_output_suffix,
)


def test_get_language_suffix_uses_frontend_compatible_codes():
    assert get_language_suffix("Chinese") == "_CN"
    assert get_language_suffix("English") == "_EN"
    assert get_language_suffix("Japanese") == "_JP"
    assert get_language_suffix("Spanish") == "_ES"
    assert get_language_suffix("French") == "_FR"


def test_get_language_suffix_falls_back_to_language_name_for_unknown_values():
    assert get_language_suffix("Italian") == "_Italian"


def test_get_translation_output_suffix_uses_proofread_suffix():
    assert get_translation_output_suffix("Chinese", "proofread") == "_PR"
    assert get_translation_output_suffix("Japanese", "standard") == "_JP"
