"""
Pinecone service for semantic search over meeting summaries.

Flow:
  1. After a meeting is summarized, generate a text embedding via Gemini.
  2. Upsert the embedding + metadata into Pinecone.
  3. On search, embed the query and find the top-k nearest sessions.

Index spec: dimension=768 (Gemini text-embedding-004), metric=cosine.
"""
from typing import Optional
import google.generativeai as genai
from pinecone import Pinecone, ServerlessSpec

from app.config import settings

genai.configure(api_key=settings.GEMINI_API_KEY)

_pc: Optional[Pinecone] = None
_index = None

EMBEDDING_MODEL = "models/text-embedding-004"
DIMENSION = 768


def _get_client() -> Pinecone:
    global _pc
    if _pc is None:
        _pc = Pinecone(api_key=settings.PINECONE_API_KEY)
    return _pc


def _get_index():
    global _index
    if _index is None:
        pc = _get_client()
        existing = [idx.name for idx in pc.list_indexes()]
        if settings.PINECONE_INDEX_NAME not in existing:
            pc.create_index(
                name=settings.PINECONE_INDEX_NAME,
                dimension=DIMENSION,
                metric="cosine",
                spec=ServerlessSpec(cloud="aws", region=settings.PINECONE_ENVIRONMENT),
            )
        _index = pc.Index(settings.PINECONE_INDEX_NAME)
    return _index


def _embed(text: str) -> list[float]:
    """Generate a 768-dim embedding using Gemini text-embedding-004."""
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=text,
        task_type="RETRIEVAL_DOCUMENT",
    )
    return result["embedding"]


def _embed_query(text: str) -> list[float]:
    result = genai.embed_content(
        model=EMBEDDING_MODEL,
        content=text,
        task_type="RETRIEVAL_QUERY",
    )
    return result["embedding"]


# ─── Public API ───────────────────────────────────────────────────────────────

def index_session(
    session_id: str,
    user_id: str,
    title: str,
    summary: str,
    key_points: list[str],
    action_items: list[str],
    topics: list[str],
    sentiment: Optional[str],
    created_at: str,
) -> None:
    """
    Embed and upsert a completed session into Pinecone.
    Call this after summary generation.
    """
    try:
        # Build a rich text representation for embedding
        text_to_embed = f"""
Title: {title}
Summary: {summary}
Key Points: {'. '.join(key_points)}
Action Items: {'. '.join(action_items)}
Topics: {', '.join(topics)}
        """.strip()

        embedding = _embed(text_to_embed)
        index = _get_index()

        index.upsert(
            vectors=[
                {
                    "id": session_id,
                    "values": embedding,
                    "metadata": {
                        "user_id": user_id,
                        "title": title,
                        "summary": summary[:500],
                        "topics": topics,
                        "sentiment": sentiment or "neutral",
                        "created_at": created_at,
                    },
                }
            ],
            namespace=user_id,  # Namespace per user for isolation
        )
    except Exception as e:
        print(f"Pinecone index error for session {session_id}: {e}")


def search_sessions(
    user_id: str,
    query: str,
    top_k: int = 10,
) -> list[dict]:
    """
    Semantic search: find sessions most relevant to the query for a given user.
    Returns a list of {session_id, title, summary, score, ...}.
    """
    try:
        query_embedding = _embed_query(query)
        index = _get_index()

        results = index.query(
            vector=query_embedding,
            top_k=top_k,
            namespace=user_id,
            include_metadata=True,
        )

        return [
            {
                "session_id": match["id"],
                "score": round(match["score"], 4),
                **match.get("metadata", {}),
            }
            for match in results.get("matches", [])
            if match["score"] > 0.5  # Minimum relevance threshold
        ]
    except Exception as e:
        print(f"Pinecone search error: {e}")
        return []


def delete_session(session_id: str, user_id: str) -> None:
    """Remove a session's embedding when the session is deleted."""
    try:
        index = _get_index()
        index.delete(ids=[session_id], namespace=user_id)
    except Exception as e:
        print(f"Pinecone delete error for session {session_id}: {e}")
