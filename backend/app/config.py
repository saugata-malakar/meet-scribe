from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    APP_NAME: str = "Google Meet AI Scribe"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    FRONTEND_URL: str = "https://meet-scribe.vercel.app"

    # Supabase PostgreSQL
    DATABASE_URL: str

    # Clerk Auth
    CLERK_DOMAIN: str                              # e.g. clerk.your-app.clerk.accounts.dev
    CLERK_SECRET_KEY: str                          # sk_live_...
    CLERK_WEBHOOK_SECRET: Optional[str] = None

    # Google Gemini
    GEMINI_API_KEY: str

    # Google Cloud
    GOOGLE_CLOUD_PROJECT: str
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None
    GOOGLE_CREDENTIALS_JSON: Optional[str] = None  # base64-encoded SA JSON for Render

    # GCP Cloud Storage
    GCS_BUCKET_NAME: str = "meet-scribe-storage"

    # Upstash Redis
    UPSTASH_REDIS_URL: str
    UPSTASH_REDIS_TOKEN: str

    # Pinecone
    PINECONE_API_KEY: str
    PINECONE_INDEX_NAME: str = "meet-scribe"
    PINECONE_ENVIRONMENT: str = "us-east-1"

    # Sentry
    SENTRY_DSN: Optional[str] = None

    # PostHog (server-side)
    POSTHOG_API_KEY: Optional[str] = None
    POSTHOG_HOST: str = "https://app.posthog.com"

    # Bot
    BOT_NAME: str = "AI Scribe Bot"
    MAX_CONCURRENT_BOTS: int = 5
    AUDIO_CHUNK_DURATION_MS: int = 10000
    MAX_MEETING_DURATION_MINUTES: int = 120

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
