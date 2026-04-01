import json
from typing import Optional, Dict, Any
import google.generativeai as genai
from app.config import settings

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


SUMMARY_PROMPT = """You are an expert meeting analyst. Analyze the following meeting transcript and provide a structured summary.

TRANSCRIPT:
{transcript}

Respond ONLY with a valid JSON object (no markdown, no code blocks) in exactly this format:
{{
  "title": "Concise meeting title (5-8 words)",
  "summary": "2-3 paragraph executive summary of the meeting",
  "key_points": [
    "Key point 1",
    "Key point 2",
    "Key point 3"
  ],
  "action_items": [
    "Action item with owner if mentioned",
    "Another action item"
  ],
  "participants": [
    "Name or role if identifiable"
  ],
  "sentiment": "positive|neutral|negative|mixed",
  "topics": [
    "Main topic 1",
    "Main topic 2"
  ],
  "decisions": [
    "Decision made in the meeting"
  ],
  "follow_ups": [
    "Follow-up item or question"
  ]
}}"""


async def generate_summary(transcript: str) -> Optional[Dict[str, Any]]:
    """Generate a structured meeting summary using Gemini."""
    if not transcript or len(transcript.strip()) < 50:
        return {
            "title": "Short Meeting",
            "summary": "The meeting was too short to generate a meaningful summary.",
            "key_points": [],
            "action_items": [],
            "participants": [],
            "sentiment": "neutral",
            "topics": [],
            "decisions": [],
            "follow_ups": [],
        }

    try:
        model = _get_model()
        prompt = SUMMARY_PROMPT.format(transcript=transcript[:50000])  # Limit to ~50k chars
        response = model.generate_content(prompt)

        raw = response.text.strip()
        # Strip markdown code blocks if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        result = json.loads(raw)
        return result

    except json.JSONDecodeError:
        # If JSON parsing fails, extract what we can
        return {
            "title": "Meeting Summary",
            "summary": response.text if 'response' in dir() else "Summary generation failed.",
            "key_points": [],
            "action_items": [],
            "participants": [],
            "sentiment": "neutral",
            "topics": [],
            "decisions": [],
            "follow_ups": [],
        }
    except Exception as e:
        print(f"Summarization error: {e}")
        return None


async def generate_quick_title(transcript_excerpt: str) -> str:
    """Generate a quick title from the first few minutes of transcript."""
    try:
        model = _get_model()
        prompt = f"""Based on this meeting transcript excerpt, generate a short, descriptive meeting title (5-8 words max).
Respond with ONLY the title, nothing else.

Transcript excerpt:
{transcript_excerpt[:2000]}"""
        response = model.generate_content(prompt)
        return response.text.strip().strip('"').strip("'")
    except Exception:
        return "Untitled Meeting"
