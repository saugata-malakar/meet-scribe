"""
Transcription service.

Two backends, tried in order:
1. Google Cloud Speech-to-Text (if GOOGLE_CREDENTIALS_JSON or
   GOOGLE_APPLICATION_CREDENTIALS is set) — fastest, best quality.
2. Gemini multimodal audio input (if GEMINI_API_KEY is set) — works on any
   deployment with just a Gemini API key and no GCP billing.

If neither is configured, transcription returns None and the session falls
back to whatever transcript the caller already has (e.g. a manually pasted
one, or live-captured browser audio with no server-side STT).

Both backends are configured to handle **multiple speakers** (diarization)
and **multilingual / code-switching audio** (Hindi-English, Spanish-English,
etc.) when a SessionConfig is provided.
"""

import base64
import json
from typing import Optional

from app.config import settings
from app.services.session_config import SessionConfig


def _has_speech_credentials() -> bool:
    return bool(settings.GOOGLE_CREDENTIALS_JSON or settings.GOOGLE_APPLICATION_CREDENTIALS)


def _has_gemini() -> bool:
    return bool(settings.GEMINI_API_KEY)


# ─── Google Cloud Speech-to-Text ──────────────────────────────────────────────

def _get_speech_client():
    from google.cloud import speech
    from google.oauth2 import service_account

    if settings.GOOGLE_CREDENTIALS_JSON:
        creds_json = base64.b64decode(settings.GOOGLE_CREDENTIALS_JSON).decode()
        creds_dict = json.loads(creds_json)
        credentials = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        return speech.SpeechClient(credentials=credentials)
    return speech.SpeechClient()


def _normalize_lang(lang: str) -> str:
    """Convert 'auto', 'en', etc. to a BCP-47 Google STT expects."""
    if not lang or lang.lower() == "auto":
        return "en-US"
    # Common shorthand: "en" → "en-US", "hi" → "hi-IN", etc.
    shorthand = {
        "en": "en-US", "hi": "hi-IN", "es": "es-ES", "fr": "fr-FR",
        "de": "de-DE", "pt": "pt-BR", "zh": "zh-CN", "ja": "ja-JP",
        "ko": "ko-KR", "ar": "ar-SA", "ru": "ru-RU", "it": "it-IT",
    }
    l = lang.lower()
    return shorthand.get(l, lang if "-" in lang else shorthand.get(l, "en-US"))


async def _transcribe_with_google_stt(
    audio_bytes: bytes,
    cfg: SessionConfig,
) -> Optional[str]:
    try:
        from google.cloud import speech

        client = _get_speech_client()
        primary = _normalize_lang(cfg.language)
        alternates = [
            _normalize_lang(l) for l in cfg.additional_languages[:3]
            if l and l.lower() != "auto" and _normalize_lang(l) != primary
        ]

        audio = speech.RecognitionAudio(content=audio_bytes)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            sample_rate_hertz=48000,
            language_code=primary,
            alternative_language_codes=alternates or None,
            enable_automatic_punctuation=True,
            enable_speaker_diarization=True,
            diarization_speaker_count=6,  # up to 6 speakers
            model="latest_long",
            use_enhanced=True,
        )
        response = client.recognize(config=config, audio=audio)

        # Build a speaker-labeled transcript from the diarization word info on
        # the last result (that's where Google returns the full breakdown).
        if not response.results:
            return None

        words = response.results[-1].alternatives[0].words or []
        if words and any(getattr(w, "speaker_tag", 0) for w in words):
            lines: list[str] = []
            current_speaker = None
            buf: list[str] = []
            for w in words:
                tag = getattr(w, "speaker_tag", 0) or 0
                label = _speaker_label(tag, cfg.speaker_hints)
                if label != current_speaker:
                    if buf:
                        lines.append(f"{current_speaker}: {' '.join(buf).strip()}")
                        buf = []
                    current_speaker = label
                buf.append(w.word)
            if buf:
                lines.append(f"{current_speaker}: {' '.join(buf).strip()}")
            return "\n".join(lines).strip() or None

        # No diarization info — fall back to concatenating transcripts.
        transcripts = [r.alternatives[0].transcript for r in response.results if r.alternatives]
        return " ".join(t for t in transcripts if t).strip() or None
    except Exception as e:
        print(f"Google STT error: {e}")
        return None


def _speaker_label(tag: int, hints: list[str]) -> str:
    if tag <= 0:
        return "Speaker"
    if hints and tag <= len(hints):
        return hints[tag - 1]
    return f"Speaker {tag}"


# ─── Gemini multimodal audio ──────────────────────────────────────────────────

def _build_gemini_prompt(cfg: SessionConfig) -> str:
    lang_clause = (
        "Transcribe each utterance in the ORIGINAL language it was spoken in — "
        "do not translate."
    )
    if cfg.language and cfg.language.lower() != "auto":
        langs = [cfg.language] + [
            l for l in cfg.additional_languages if l and l.lower() != "auto"
        ]
        lang_clause = (
            "The meeting is conducted in "
            + ", ".join(langs)
            + ". Transcribe each utterance in the original language it was "
            "spoken in; do not translate. If the speakers code-switch "
            "mid-sentence, preserve the switch verbatim."
        )

    speaker_clause = (
        "If multiple speakers are audible, prefix each utterance with a "
        "speaker label followed by a colon. Use numbered labels (Speaker 1, "
        "Speaker 2, ...) consistent across the whole chunk."
    )
    if cfg.speaker_hints:
        names = ", ".join(cfg.speaker_hints)
        speaker_clause = (
            f"Known participants: {names}. When you can confidently tell who "
            "is speaking, use their name as the prefix (e.g. 'Priya: ...'). "
            "If unsure, fall back to 'Speaker 1', 'Speaker 2', etc. "
            "Keep speaker labels consistent across the chunk."
        )

    return (
        "You are a professional meeting transcriptionist. Transcribe the "
        "following audio verbatim. "
        + lang_clause + " "
        + speaker_clause + " "
        "Clean up filler words only when they obscure meaning (uh, um, like). "
        "Preserve domain terms, numbers, acronyms, and proper nouns exactly. "
        "If the audio is silent, empty, or fully unintelligible, reply with "
        "the single word NONE and nothing else."
    )


async def _transcribe_with_gemini(
    audio_bytes: bytes,
    mime_type: str,
    cfg: SessionConfig,
) -> Optional[str]:
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")

        prompt = _build_gemini_prompt(cfg)
        response = model.generate_content(
            [prompt, {"mime_type": mime_type, "data": audio_bytes}],
            generation_config={"temperature": 0.0, "max_output_tokens": 4096},
        )

        text = (response.text or "").strip()
        if not text or text.upper().startswith("NONE"):
            return None
        return text
    except Exception as e:
        print(f"Gemini transcription error: {e}")
        return None


# ─── Public API ───────────────────────────────────────────────────────────────

async def transcribe_audio_chunk(
    audio_bytes: bytes,
    mime_type: str = "audio/webm",
    config: Optional[SessionConfig] = None,
    # kept for backward compat with the old positional `language_code` arg
    language_code: Optional[str] = None,
) -> Optional[str]:
    """Transcribe one audio chunk. Prefers Google STT, falls back to Gemini."""
    if not audio_bytes:
        return None

    cfg = config or SessionConfig()
    if language_code and cfg.language == "auto":
        cfg = SessionConfig(**{**cfg.to_dict(), "language": language_code})

    if _has_speech_credentials():
        text = await _transcribe_with_google_stt(audio_bytes, cfg)
        if text:
            return text
        # fall through to Gemini if STT returned nothing

    if _has_gemini():
        return await _transcribe_with_gemini(audio_bytes, mime_type, cfg)

    print("Transcription skipped: no STT or Gemini credentials configured")
    return None


async def transcribe_audio_long(
    gcs_uri: str,
    language_code: str = "en-US",
) -> Optional[str]:
    """Long-running transcription of an audio file already in GCS."""
    if not _has_speech_credentials():
        print("Long transcription skipped: Google Cloud Speech credentials required")
        return None
    try:
        from google.cloud import speech

        client = _get_speech_client()
        audio = speech.RecognitionAudio(uri=gcs_uri)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            sample_rate_hertz=48000,
            language_code=_normalize_lang(language_code),
            enable_automatic_punctuation=True,
            enable_speaker_diarization=True,
            diarization_speaker_count=6,
            model="latest_long",
            use_enhanced=True,
        )
        operation = client.long_running_recognize(config=config, audio=audio)
        response = operation.result(timeout=600)
        transcripts = [r.alternatives[0].transcript for r in response.results if r.alternatives]
        return "\n".join(t for t in transcripts if t) or None
    except Exception as e:
        print(f"Long transcription error: {e}")
        return None
