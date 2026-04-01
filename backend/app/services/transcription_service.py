import base64
import json
import os
import tempfile
from typing import Optional
from app.config import settings


def _get_speech_client():
    """Initialize Google Cloud Speech client with credentials from env or file."""
    from google.cloud import speech
    from google.oauth2 import service_account

    if settings.GOOGLE_CREDENTIALS_JSON:
        # On Render: credentials stored as base64-encoded JSON env var
        creds_json = base64.b64decode(settings.GOOGLE_CREDENTIALS_JSON).decode()
        creds_dict = json.loads(creds_json)
        credentials = service_account.Credentials.from_service_account_info(
            creds_dict,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
        return speech.SpeechClient(credentials=credentials)
    elif settings.GOOGLE_APPLICATION_CREDENTIALS:
        return speech.SpeechClient()
    else:
        raise ValueError("No Google credentials configured")


async def transcribe_audio_chunk(
    audio_bytes: bytes,
    language_code: str = "en-US",
    sample_rate: int = 16000,
) -> Optional[str]:
    """
    Transcribe an audio chunk using Google Cloud Speech-to-Text.
    Audio should be in WebM/Opus or WAV format.
    """
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
            diarization_speaker_count=6,  # Up to 6 speakers
            model="latest_long",
            use_enhanced=True,
        )

        response = client.recognize(config=config, audio=audio)

        transcripts = []
        for result in response.results:
            alternative = result.alternatives[0]
            transcripts.append(alternative.transcript)

        return " ".join(transcripts) if transcripts else None

    except Exception as e:
        print(f"Transcription error: {e}")
        # Fallback: return None to signal transcription failed
        return None


async def transcribe_audio_long(
    gcs_uri: str,
    language_code: str = "en-US",
) -> Optional[str]:
    """
    Transcribe a long audio file stored in GCS using LongRunningRecognize.
    """
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
        response = operation.result(timeout=600)  # 10 min timeout

        transcripts = []
        for result in response.results:
            alternative = result.alternatives[0]
            transcripts.append(alternative.transcript)

        return "\n".join(transcripts) if transcripts else None

    except Exception as e:
        print(f"Long transcription error: {e}")
        return None
