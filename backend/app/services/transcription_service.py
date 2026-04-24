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
"""

import base64
import json
from typing import Optional
from app.config import settings


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


async def _transcribe_with_google_stt(
    audio_bytes: bytes,
    language_code: str,
) -> Optional[str]:
    try:
        from google.cloud import speech

        client = _get_speech_client()
        audio = speech.RecognitionAudio(content=audio_bytes)
        config = speech.RecognitionConfig(
            encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            sample_rate_hertz=48000,
            language_code=language_code,
            enable_automatic_punctuation=True,
            enable_speaker_diarization=True,
            diarization_speaker_count=6,
            model="latest_long",
            use_enhanced=True,
        )
        response = client.recognize(config=config, audio=audio)
        transcripts = [r.alternatives[0].transcript for r in response.results if r.alternatives]
        return " ".join(t for t in transcripts if t).strip() or None
    except Exception as e:
        print(f"Google STT error: {e}")
        return None


# ─── Gemini multimodal audio ──────────────────────────────────────────────────

async def _transcribe_with_gemini(
    audio_bytes: bytes,
    mime_type: str,
    language_code: str,
) -> Optional[str]:
    try:
        import google.generativeai as genai

        genai.configure(api_key=settings.GEMINI_API_KEY)
        model = genai.GenerativeModel("gemini-1.5-flash")

        prompt = (
            "You are an expert transcriptionist. Transcribe the following audio "
            "verbatim in the original language (default: English, language hint: "
            f"{language_code}). Produce clean, punctuated prose. If multiple "
            "speakers are detectable, prefix each utterance with 'Speaker N: '. "
            "If the audio is silent, empty, or unintelligible, reply with the "
            "single word NONE and nothing else."
        )

        # Gemini SDK accepts inline audio parts via {"mime_type", "data"} dicts.
        response = model.generate_content(
            [
                prompt,
                {"mime_type": mime_type, "data": audio_bytes},
            ],
            generation_config={"temperature": 0.0, "max_output_tokens": 2048},
        )

        text = (response.text or "").strip()
        if not text or text.upper().startswith("NONE"):
            return None
        return text
    except Exception as e:
        # Common cases: unsupported mime for a given model, quota, bad audio.
        print(f"Gemini transcription error: {e}")
        return None


# ─── Public API ───────────────────────────────────────────────────────────────

async def transcribe_audio_chunk(
    audio_bytes: bytes,
    mime_type: str = "audio/webm",
    language_code: str = "en-US",
) -> Optional[str]:
    """Transcribe one audio chunk. Prefers Google STT, falls back to Gemini."""
    if not audio_bytes:
        return None

    if _has_speech_credentials():
        text = await _transcribe_with_google_stt(audio_bytes, language_code)
        if text:
            return text
        # fall through to Gemini if STT returned nothing

    if _has_gemini():
        return await _transcribe_with_gemini(audio_bytes, mime_type, language_code)

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
            language_code=language_code,
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
