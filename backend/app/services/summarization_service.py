"""
Summarization service (Gemini).

Single-pass summaries for short/medium transcripts, and a two-stage
map-reduce for long meetings (>~60 min of speech) so we don't blow the
context window or lose detail. Accepts a SessionConfig so summaries can be
tuned per meeting — different tone, output language, extra instructions.
"""

import json
from typing import Optional, Dict, Any

import google.generativeai as genai

from app.config import settings
from app.services.session_config import SessionConfig


genai.configure(api_key=settings.GEMINI_API_KEY)


def _get_model():
    return genai.GenerativeModel(
        model_name="gemini-1.5-pro",
        generation_config={
            "temperature": 0.3,
            "top_p": 0.95,
            "max_output_tokens": 4096,
        },
        safety_settings=[
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ],
    )


# ─── Prompt builders ──────────────────────────────────────────────────────────

_STYLE_CLAUSES = {
    "brief": (
        "Write a tight 3-5 bullet executive summary. No prose paragraphs. "
        "Prefer clarity over completeness."
    ),
    "standard": (
        "Write a 2-3 paragraph executive summary covering what was discussed, "
        "what was decided, and what happens next."
    ),
    "detailed": (
        "Write a thorough summary. Start with a 2-paragraph overview, then "
        "break out each distinct topic as its own sub-section with a heading "
        "and 3-6 bullets of key points. Preserve numeric details and names."
    ),
}


def _summary_prompt(transcript: str, cfg: SessionConfig) -> str:
    style_clause = _STYLE_CLAUSES.get(cfg.summary_style, _STYLE_CLAUSES["standard"])

    language_clause = ""
    if cfg.summary_language and cfg.summary_language.lower() != "same":
        language_clause = (
            f"Write the summary, key points, action items and all other "
            f"output in {cfg.summary_language}, regardless of the language "
            f"of the transcript."
        )
    else:
        language_clause = (
            "Write the summary in the same primary language as the "
            "transcript. If the transcript is multilingual, use the "
            "dominant language."
        )

    audience_clause = ""
    if cfg.summary_audience:
        audience_clause = (
            f"Target audience: {cfg.summary_audience}. Adjust the tone and "
            "level of technical detail accordingly."
        )

    extras = f"\nAdditional instructions: {cfg.extra_instructions}" if cfg.extra_instructions else ""
    hints = ""
    if cfg.speaker_hints:
        hints = (
            "\nKnown participants (use real names in the participants list "
            "when the transcript supports it): " + ", ".join(cfg.speaker_hints)
        )

    return f"""You are an expert meeting analyst. Analyze the transcript and produce a structured summary.

{style_clause}
{language_clause}
{audience_clause}{hints}{extras}

TRANSCRIPT:
{transcript}

Respond ONLY with a valid JSON object (no markdown, no code blocks) in EXACTLY this shape:
{{
  "title": "Concise meeting title (5-8 words)",
  "summary": "Full summary per the style requested above",
  "key_points": ["Key point 1", "Key point 2"],
  "action_items": ["Action with owner and deadline if mentioned"],
  "participants": ["Name or role if identifiable"],
  "sentiment": "positive|neutral|negative|mixed",
  "topics": ["Main topic 1"],
  "decisions": ["Decision made in the meeting"],
  "follow_ups": ["Follow-up item or open question"],
  "per_speaker": [
    {{"speaker": "Name or Speaker 1", "takeaways": ["Their top points and commitments"]}}
  ]
}}
"""


def _long_map_prompt(section: str, cfg: SessionConfig) -> str:
    lang = cfg.summary_language if cfg.summary_language.lower() != "same" else "the transcript's primary language"
    return (
        "You are summarizing one section of a longer meeting. Produce a "
        f"compact factual recap in {lang} covering topics discussed, "
        "decisions made, action items, and each speaker's key contributions. "
        "Preserve names, numbers, and dates. Do not editorialize.\n\n"
        f"SECTION:\n{section}"
    )


# ─── Core calls ───────────────────────────────────────────────────────────────

def _strip_json_fences(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip("` \n")
    return raw


def _empty_summary() -> Dict[str, Any]:
    return {
        "title": "Meeting",
        "summary": "",
        "key_points": [],
        "action_items": [],
        "participants": [],
        "sentiment": "neutral",
        "topics": [],
        "decisions": [],
        "follow_ups": [],
        "per_speaker": [],
    }


async def generate_summary(
    transcript: str,
    config: Optional[SessionConfig] = None,
) -> Optional[Dict[str, Any]]:
    """Generate a structured meeting summary using Gemini.

    Picks single-pass for short/medium meetings, or map-reduce when the
    config requests long-meeting mode (or the transcript is very long).
    """
    if not transcript or len(transcript.strip()) < 50:
        stub = _empty_summary()
        stub["title"] = "Short Meeting"
        stub["summary"] = "The meeting was too short to generate a meaningful summary."
        return stub

    cfg = config or SessionConfig()

    # ~200 chars per second of speech (English). 50k chars ≈ 40 min. Switch to
    # map-reduce for longer content or when the user explicitly asked for it.
    use_map_reduce = cfg.long_meeting_mode or len(transcript) > 60_000

    try:
        if use_map_reduce:
            return await _summarize_long(transcript, cfg)
        return await _summarize_single(transcript, cfg)
    except Exception as e:
        print(f"Summarization error: {e}")
        return None


async def _summarize_single(transcript: str, cfg: SessionConfig) -> Optional[Dict[str, Any]]:
    model = _get_model()
    prompt = _summary_prompt(transcript[:120_000], cfg)
    response = model.generate_content(prompt)
    raw = _strip_json_fences(response.text or "")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Return a best-effort fallback so the session still completes.
        stub = _empty_summary()
        stub["title"] = "Meeting Summary"
        stub["summary"] = (response.text or "").strip()
        return stub


async def _summarize_long(transcript: str, cfg: SessionConfig) -> Optional[Dict[str, Any]]:
    model = _get_model()

    # Chunk by paragraphs/lines. Target ~20k-char sections so each map call
    # stays well within Gemini's context and leaves headroom for the prompt.
    sections = _chunk_transcript(transcript, target_chars=20_000)
    section_summaries: list[str] = []
    for idx, sec in enumerate(sections):
        resp = model.generate_content(_long_map_prompt(sec, cfg))
        section_summaries.append(f"[Section {idx + 1}]\n{resp.text.strip() if resp.text else ''}")

    combined = "\n\n".join(section_summaries)
    reduce_prompt = _summary_prompt(combined, cfg)
    resp = model.generate_content(reduce_prompt)
    raw = _strip_json_fences(resp.text or "")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        stub = _empty_summary()
        stub["title"] = "Meeting Summary"
        stub["summary"] = (resp.text or "").strip()
        return stub


def _chunk_transcript(transcript: str, target_chars: int = 20_000) -> list[str]:
    paragraphs = transcript.split("\n")
    chunks: list[str] = []
    buf: list[str] = []
    count = 0
    for p in paragraphs:
        if count + len(p) > target_chars and buf:
            chunks.append("\n".join(buf))
            buf = []
            count = 0
        buf.append(p)
        count += len(p) + 1
    if buf:
        chunks.append("\n".join(buf))
    return chunks


async def generate_quick_title(transcript_excerpt: str) -> str:
    try:
        model = _get_model()
        prompt = (
            "Based on this meeting transcript excerpt, generate a short, "
            "descriptive meeting title (5-8 words max). Respond with ONLY "
            "the title, nothing else.\n\nTranscript excerpt:\n"
            f"{transcript_excerpt[:2000]}"
        )
        response = model.generate_content(prompt)
        return (response.text or "").strip().strip('"').strip("'") or "Untitled Meeting"
    except Exception:
        return "Untitled Meeting"
