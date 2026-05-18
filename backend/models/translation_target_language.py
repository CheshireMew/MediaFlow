from enum import Enum


class TranslationTargetLanguage(str, Enum):
    SIMPLIFIED_CHINESE = "SimplifiedChinese"
    TRADITIONAL_CHINESE = "TraditionalChinese"
    ENGLISH = "English"
    JAPANESE = "Japanese"
    SPANISH = "Spanish"
    FRENCH = "French"
    GERMAN = "German"
    RUSSIAN = "Russian"


DEFAULT_TRANSLATION_TARGET_LANGUAGE = TranslationTargetLanguage.SIMPLIFIED_CHINESE

_LANGUAGE_SUFFIX_MAP: dict[TranslationTargetLanguage, str] = {
    TranslationTargetLanguage.SIMPLIFIED_CHINESE: "_ZH-CN",
    TranslationTargetLanguage.TRADITIONAL_CHINESE: "_ZH-TW",
    TranslationTargetLanguage.ENGLISH: "_EN",
    TranslationTargetLanguage.JAPANESE: "_JP",
    TranslationTargetLanguage.SPANISH: "_ES",
    TranslationTargetLanguage.FRENCH: "_FR",
    TranslationTargetLanguage.GERMAN: "_DE",
    TranslationTargetLanguage.RUSSIAN: "_RU",
}

_LANGUAGE_PROMPT_NAMES: dict[TranslationTargetLanguage, str] = {
    TranslationTargetLanguage.SIMPLIFIED_CHINESE: (
        "Simplified Chinese. Use Simplified Chinese characters only; do not use Traditional Chinese characters."
    ),
    TranslationTargetLanguage.TRADITIONAL_CHINESE: (
        "Traditional Chinese. Use Traditional Chinese characters only; do not use Simplified Chinese characters."
    ),
    TranslationTargetLanguage.ENGLISH: "English",
    TranslationTargetLanguage.JAPANESE: "Japanese",
    TranslationTargetLanguage.SPANISH: "Spanish",
    TranslationTargetLanguage.FRENCH: "French",
    TranslationTargetLanguage.GERMAN: "German",
    TranslationTargetLanguage.RUSSIAN: "Russian",
}

_CHINESE_TARGET_LANGUAGES = {
    TranslationTargetLanguage.SIMPLIFIED_CHINESE,
    TranslationTargetLanguage.TRADITIONAL_CHINESE,
}


def parse_translation_target_language(value: str | TranslationTargetLanguage) -> TranslationTargetLanguage:
    if isinstance(value, TranslationTargetLanguage):
        return value
    try:
        return TranslationTargetLanguage(value)
    except ValueError as exc:
        raise ValueError(f"Unsupported translation target language: {value}") from exc


def get_language_suffix(target_language: str | TranslationTargetLanguage) -> str:
    language = parse_translation_target_language(target_language)
    return _LANGUAGE_SUFFIX_MAP[language]


def get_language_prompt_name(target_language: str | TranslationTargetLanguage) -> str:
    language = parse_translation_target_language(target_language)
    return _LANGUAGE_PROMPT_NAMES[language]


def is_chinese_target_language(target_language: str | TranslationTargetLanguage | None) -> bool:
    if target_language is None:
        return False
    try:
        return parse_translation_target_language(target_language) in _CHINESE_TARGET_LANGUAGES
    except ValueError:
        return False
