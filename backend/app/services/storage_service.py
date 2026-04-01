import base64
import json
from typing import Optional
from app.config import settings


def _get_storage_client():
    from google.cloud import storage
    from google.oauth2 import service_account

    if settings.GOOGLE_CREDENTIALS_JSON:
        creds_json = base64.b64decode(settings.GOOGLE_CREDENTIALS_JSON).decode()
        creds_dict = json.loads(creds_json)
        credentials = service_account.Credentials.from_service_account_info(creds_dict)
        return storage.Client(credentials=credentials, project=settings.GOOGLE_CLOUD_PROJECT)
    return storage.Client()


def _get_bucket():
    client = _get_storage_client()
    return client.bucket(settings.GCS_BUCKET_NAME)


async def upload_audio_chunk(
    session_id: str,
    chunk_sequence: int,
    audio_bytes: bytes,
    content_type: str = "audio/webm",
) -> str:
    """Upload audio chunk to GCS and return the GCS path."""
    try:
        bucket = _get_bucket()
        blob_path = f"audio/{session_id}/chunk_{chunk_sequence:04d}.webm"
        blob = bucket.blob(blob_path)
        blob.upload_from_string(audio_bytes, content_type=content_type)
        return f"gs://{settings.GCS_BUCKET_NAME}/{blob_path}"
    except Exception as e:
        print(f"GCS upload error: {e}")
        return ""


async def upload_transcript(session_id: str, transcript: str) -> str:
    """Upload full transcript text to GCS."""
    try:
        bucket = _get_bucket()
        blob_path = f"transcripts/{session_id}/transcript.txt"
        blob = bucket.blob(blob_path)
        blob.upload_from_string(transcript.encode("utf-8"), content_type="text/plain; charset=utf-8")
        return f"gs://{settings.GCS_BUCKET_NAME}/{blob_path}"
    except Exception as e:
        print(f"GCS transcript upload error: {e}")
        return ""


async def upload_summary(session_id: str, summary_data: dict) -> str:
    """Upload summary JSON to GCS."""
    try:
        bucket = _get_bucket()
        blob_path = f"summaries/{session_id}/summary.json"
        blob = bucket.blob(blob_path)
        blob.upload_from_string(json.dumps(summary_data, indent=2), content_type="application/json")
        return f"gs://{settings.GCS_BUCKET_NAME}/{blob_path}"
    except Exception as e:
        print(f"GCS summary upload error: {e}")
        return ""


async def get_signed_url(gcs_path: str, expiration_minutes: int = 60) -> Optional[str]:
    """Generate a signed URL for accessing a GCS file."""
    try:
        from datetime import timedelta
        bucket = _get_bucket()
        blob_path = gcs_path.replace(f"gs://{settings.GCS_BUCKET_NAME}/", "")
        blob = bucket.blob(blob_path)
        url = blob.generate_signed_url(expiration=timedelta(minutes=expiration_minutes))
        return url
    except Exception as e:
        print(f"Signed URL error: {e}")
        return None


def ensure_bucket_exists():
    """Create the GCS bucket if it doesn't exist."""
    try:
        client = _get_storage_client()
        bucket = client.bucket(settings.GCS_BUCKET_NAME)
        if not bucket.exists():
            bucket = client.create_bucket(
                settings.GCS_BUCKET_NAME,
                location="US",
            )
            print(f"Created GCS bucket: {settings.GCS_BUCKET_NAME}")
        else:
            print(f"GCS bucket already exists: {settings.GCS_BUCKET_NAME}")
    except Exception as e:
        print(f"Bucket setup error: {e}")
