"""
Bot router — endpoints for launching, stopping, and streaming to/from the bot.

Flow (browser mode, default):
  POST /api/bot/launch    → { mode: "browser", ws_path }
  WS   /api/bot/stream/{session_id}
      client sends first message: {"type":"auth","token":"<clerk jwt>"}
      then binary WebM/Opus chunks (each ~5-10 s) or
      {"type":"chunk","sequence":N,"audio_base64":"..."}
      server replies {"type":"chunk_ack","sequence":N,"text":"..."}
      on WS close OR POST /api/bot/stop → session is finalized + summarized.

Flow (playwright mode, if BOT_MODE=playwright):
  POST /api/bot/launch    → { mode: "playwright" }
  background task joins the Meet, pushes chunks to POST /api/bot/chunk
"""

import asyncio
import base64
import json
from typing import Optional

from fastapi import (
    APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from app.database import get_db, AsyncSessionLocal
from app.models.session import MeetSession, SessionStatus, TranscriptChunk
from app.models.user import User
from app.utils.clerk_auth import get_current_user, _verify_token as verify_clerk_token
from app.services import bot_service


async def _authenticate_ws(token: str) -> Optional[str]:
    """Verify a Clerk JWT passed over WS. Returns the Clerk user id (sub) or None."""
    try:
        payload = await verify_clerk_token(token)
        return payload.get("sub")
    except Exception:
        return None


async def _lookup_user_id(db: AsyncSession, clerk_id: str) -> Optional[str]:
    """Resolve a Clerk user id to our internal User.id (as str)."""
    result = await db.execute(select(User).where(User.clerk_id == clerk_id))
    user = result.scalar_one_or_none()
    return str(user.id) if user else None


router = APIRouter(prefix="/api/bot", tags=["bot"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class LaunchBotRequest(BaseModel):
    session_id: str
    mode: Optional[str] = None  # "browser" | "playwright"


class StopBotRequest(BaseModel):
    session_id: str


class AudioChunkRequest(BaseModel):
    session_id: str
    sequence: int
    audio_base64: str
    mime_type: str = "audio/webm;codecs=opus"


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/launch")
async def launch_bot(
    body: LaunchBotRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Launch a bot to capture a Google Meet.

    In browser mode (default) this just marks the session as joining and
    returns the WebSocket path the frontend should open. In playwright mode
    it spawns a headful Chromium that joins the meet as a guest.
    """
    result = await db.execute(
        select(MeetSession).where(
            MeetSession.id == body.session_id,
            MeetSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.status in (SessionStatus.recording, SessionStatus.joining):
        # Already live — idempotent: hand back the stream info.
        return {
            "mode": "browser",
            "session_id": str(session.id),
            "ws_path": f"/api/bot/stream/{session.id}",
            "meet_url": session.meet_url,
            "already_active": True,
        }

    try:
        info = await bot_service.launch_bot(
            session_id=str(session.id),
            meet_url=session.meet_url,
            db=db,
            mode=body.mode,
        )
    except ValueError as e:
        raise HTTPException(status_code=429, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bot launch failed: {e}")

    return info


@router.post("/stop")
async def stop_bot(
    body: StopBotRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Stop an active bot and run the final summarization."""
    result = await db.execute(
        select(MeetSession).where(
            MeetSession.id == body.session_id,
            MeetSession.user_id == current_user.id,
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    await bot_service.stop_bot(str(session.id), db)
    return {"message": "Bot stopped", "session_id": str(session.id)}


@router.post("/chunk")
async def receive_audio_chunk(
    body: AudioChunkRequest,
    db: AsyncSession = Depends(get_db),
):
    """Receive one audio chunk (HTTP path, used by the playwright bot)."""
    try:
        audio_bytes = base64.b64decode(body.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="audio_base64 is not valid base64")

    try:
        text = await bot_service.process_audio_chunk(
            db=db,
            session_id=body.session_id,
            sequence=body.sequence,
            audio_bytes=audio_bytes,
            mime_type=body.mime_type,
        )
        return {"status": "ok", "text": text, "sequence": body.sequence}
    except Exception as e:
        # Never fail loudly — the bot should keep recording even if one chunk fails.
        return {"status": "error", "error": str(e), "sequence": body.sequence}


@router.get("/active")
async def get_active_bots(current_user: User = Depends(get_current_user)):
    active = bot_service.get_active_sessions()
    return {"active_sessions": active, "count": len(active)}


# ─── WebSocket: live audio stream from the user's browser ────────────────────

@router.websocket("/stream/{session_id}")
async def ws_stream(websocket: WebSocket, session_id: str):
    """Accept live audio chunks from the frontend MediaRecorder.

    Protocol:
      1. Client connects. Server accepts.
      2. Client sends first *text* message: {"type":"auth","token":"<jwt>"}
      3. Authenticated. Server replies {"type":"ready"}.
      4. Client sends chunks, either:
         - binary frames (raw audio/webm;opus bytes). sequence is auto-incremented.
         - OR text frames {"type":"chunk","sequence":N,"audio_base64":"..."}
      5. Client can send {"type":"stop"} to finalize.
      6. On disconnect, if no explicit stop was received, we still finalize.
    """
    await websocket.accept()

    # ── Auth
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
        msg = json.loads(raw)
        if msg.get("type") != "auth" or "token" not in msg:
            await websocket.close(code=4000)
            return
        clerk_id = await _authenticate_ws(msg["token"])
        if not clerk_id:
            await websocket.send_json({"type": "error", "error": "Unauthorized"})
            await websocket.close(code=4001)
            return
    except (asyncio.TimeoutError, json.JSONDecodeError, KeyError):
        await websocket.close(code=4002)
        return

    # ── Session ownership check
    async with AsyncSessionLocal() as db:
        our_user_id = await _lookup_user_id(db, clerk_id)
        if our_user_id is None:
            await websocket.send_json({"type": "error", "error": "Unknown user"})
            await websocket.close(code=4003)
            return

        result = await db.execute(
            select(MeetSession).where(MeetSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session is None or str(session.user_id) != our_user_id:
            await websocket.send_json({"type": "error", "error": "Not found"})
            await websocket.close(code=4004)
            return

        # Register the session as active in case the client opened WS
        # without first calling /launch.
        bot_service.register_browser_session(session_id, session.meet_url)

    await websocket.send_json({"type": "ready", "session_id": session_id})

    sequence = 0
    explicit_stop = False

    try:
        while True:
            frame = await websocket.receive()

            # receive() returns {"type":"websocket.receive", "bytes"|"text": ...}
            if frame["type"] == "websocket.disconnect":
                break

            if "bytes" in frame and frame["bytes"] is not None:
                audio_bytes = frame["bytes"]
                if not audio_bytes:
                    continue
                seq = sequence
                sequence += 1
                async with AsyncSessionLocal() as db:
                    try:
                        text = await bot_service.process_audio_chunk(
                            db=db,
                            session_id=session_id,
                            sequence=seq,
                            audio_bytes=audio_bytes,
                            mime_type="audio/webm;codecs=opus",
                        )
                        await websocket.send_json({
                            "type": "chunk_ack", "sequence": seq, "text": text,
                        })
                    except Exception as e:
                        await websocket.send_json({
                            "type": "chunk_error", "sequence": seq, "error": str(e),
                        })

            elif "text" in frame and frame["text"] is not None:
                try:
                    data = json.loads(frame["text"])
                except json.JSONDecodeError:
                    continue

                kind = data.get("type")
                if kind == "chunk":
                    try:
                        audio_bytes = base64.b64decode(data["audio_base64"])
                    except Exception:
                        await websocket.send_json({
                            "type": "chunk_error",
                            "sequence": data.get("sequence"),
                            "error": "invalid base64",
                        })
                        continue
                    seq = int(data.get("sequence", sequence))
                    sequence = max(sequence, seq + 1)
                    mime = data.get("mime_type", "audio/webm;codecs=opus")
                    async with AsyncSessionLocal() as db:
                        try:
                            text = await bot_service.process_audio_chunk(
                                db=db, session_id=session_id, sequence=seq,
                                audio_bytes=audio_bytes, mime_type=mime,
                            )
                            await websocket.send_json({
                                "type": "chunk_ack", "sequence": seq, "text": text,
                            })
                        except Exception as e:
                            await websocket.send_json({
                                "type": "chunk_error", "sequence": seq, "error": str(e),
                            })

                elif kind == "stop":
                    explicit_stop = True
                    break

                elif kind == "ping":
                    await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"ws_stream error for session {session_id}: {e}")

    # ── Finalize
    async with AsyncSessionLocal() as db:
        try:
            await bot_service.stop_bot(session_id, db)
        except Exception as e:
            print(f"finalize on ws close failed: {e}")

    try:
        if explicit_stop:
            await websocket.send_json({"type": "stopped", "session_id": session_id})
            await websocket.close()
    except Exception:
        pass


# ─── Status WebSocket (kept for backwards-compatibility) ─────────────────────

@router.websocket("/ws/{session_id}")
async def websocket_status(websocket: WebSocket, session_id: str):
    """Real-time session status updates for the detail page."""
    await websocket.accept()

    try:
        auth_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
        clerk_id = await _authenticate_ws(auth_msg)
        if not clerk_id:
            await websocket.send_json({"error": "Unauthorized"})
            await websocket.close(code=4001)
            return
    except asyncio.TimeoutError:
        await websocket.close(code=4002)
        return

    async with AsyncSessionLocal() as db:
        user_id = await _lookup_user_id(db, clerk_id)
    if user_id is None:
        await websocket.send_json({"error": "Unknown user"})
        await websocket.close(code=4003)
        return

    try:
        while True:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(MeetSession).where(MeetSession.id == session_id)
                )
                session = result.scalar_one_or_none()

                if not session or str(session.user_id) != user_id:
                    await websocket.send_json({"error": "Not found"})
                    break

                from sqlalchemy import func
                chunk_count_result = await db.execute(
                    select(func.count(TranscriptChunk.id)).where(
                        TranscriptChunk.session_id == session_id
                    )
                )
                chunk_count = chunk_count_result.scalar() or 0

                await websocket.send_json({
                    "session_id": session_id,
                    "status": session.status.value,
                    "chunk_count": chunk_count,
                    "title": session.title,
                    "summary": session.summary,
                    "sentiment": session.sentiment,
                })

                if session.status in (
                    SessionStatus.completed,
                    SessionStatus.failed,
                    SessionStatus.stopped,
                ):
                    break

            await asyncio.sleep(3)

    except WebSocketDisconnect:
        pass
