"""Shared project language helpers for media workers."""

SUPPORTED_LANGUAGE_CODES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "da": "Danish",
}

DEFAULT_LANGUAGE_CODE = "en"


def normalize_language_code(value):
    """Normalize an optional language code to a supported project language."""
    if not value:
        return DEFAULT_LANGUAGE_CODE

    normalized = str(value).strip().lower()
    return normalized if normalized in SUPPORTED_LANGUAGE_CODES else DEFAULT_LANGUAGE_CODE


def get_language_name(value):
    """Return the human-readable name for a supported project language."""
    code = normalize_language_code(value)
    return SUPPORTED_LANGUAGE_CODES.get(code, SUPPORTED_LANGUAGE_CODES[DEFAULT_LANGUAGE_CODE])
