"""
Per-session bot/scribe configuration.

Stored in Redis (with an in-process dict as a fallback when Redis is
unreachable). Keyed by session_id, TTL of 24 h — well past the
MAX_MEETING_DURATION_MINUTES cap, but short enough to not accumulate garbage.

The config is set at /api/bot/launch time and read by the transcription and
summarization pipelines. Kept out of the MeetSession SQL model so we don't
have to run a migration on the live Postgres.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from typing import Optional

from app.services import redis_service


# ─── Config shape ─────────────────────────────────────────────────────────────

@dataclass
class SessionConfig:
    # Primary spoken language (BCP-47, e.g. "en-US", "hi-IN", "es-ES").
    # "auto" lets Gemini auto-detect, useful for mixed/unknown meetings.
    language: str = "auto"

    # Extra languages to expect (for code-switching / multilingual meetings).
    # e.g. ["en-US", "hi-IN"] for Hinglish. Translation is NOT forced —
    # transcript stays in the original language of each utterance.
    additional_languages: list[str] = field(default_factory=list)

    # If set, produce the final summary in this language (BCP-47 or "same" to
    # match the transcript's language). "same" = no translation.
    summary_language: str = "same"

    # Hints for speaker labeling. Gemini prefixes utterances with these when
    # they match; otherwise falls back to Speaker 1/2/3.
    speaker_hints: list[str] = field(default_factory=list)

    # How much detail in the summary. "brief" = 3-5 bullets,
    # "standard" = our usual 2-3 paragraph exec summary,
    # "detailed" = long-form per-topic breakdown.
    summary_style: str = "standard"

    # Tone/audience for the summary. Free-form, e.g. "technical engineering
    # team", "non-technical executive", "client-facing recap".
    summary_audience: str = ""

    # Long-meeting handling. When a transcript is very long, summarize section
    # by section first, then fold the section summaries into a final summary.
    # Set to True for meetings over ~1 h.
    long_meeting_mode: bool = False

    # Extra custom instructions appended to the summary prompt, e.g.
    # "Call out any risks mentioned related to the ingest pipeline".
    extra_instructions: str = ""

    @classmethod
    def from_dict(cls, data: Optional[dict]) -> "SessionConfig":
        if not data:
            return cls()
        known = {f.name for f in cls.__dataclass_fields__.values()}
        return cls(**{k: v for k, v in data.items() if k in known})

    def to_dict(self) -> dict:
        return asdict(self)


# ─── Storage ──────────────────────────────────────────────────────────────────

_KEY = "scribe_cfg:{}"
_TTL_SECONDS = 24 * 3600

# Process-local fallback used when Redis is down / not configured.
_memory_store: dict[str, dict] = {}


def save(session_id: str, config: SessionConfig) -> None:
    data = config.to_dict()
    try:
        redis = redis_service.get_redis()
        redis.setex(_KEY.format(session_id), _TTL_SECONDS, json.dumps(data))
    except Exception as e:
        print(f"[session_config] redis save failed, using memory: {e}")
    _memory_store[session_id] = data


def load(session_id: str) -> SessionConfig:
    try:
        redis = redis_service.get_redis()
        raw = redis.get(_KEY.format(session_id))
        if raw:
            return SessionConfig.from_dict(json.loads(raw))
    except Exception as e:
        print(f"[session_config] redis load failed, using memory: {e}")
    data = _memory_store.get(session_id)
    return SessionConfig.from_dict(data)
