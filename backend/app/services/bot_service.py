"""
Bot service — orchestrates "joining" a Google Meet and capturing its audio.

Two modes are supported:

1. **browser** (default, works on any hosting including Vercel/Render free tiers)
   The user keeps the Google Meet tab open themselves and grants tab-capture
   permission to our app. MediaRecorder in the frontend streams audio chunks
   over WebSocket (see `routers/bot.py::ws_stream`). The backend transcribes
   each chunk and, on stop, runs the full Gemini summary.

2. **playwright** (self-hosted, requires headed Chromium + Xvfb + PulseAudio)
   A Playwright-driven headful Chromium joins the meet as a guest and captures
   tab audio via injected JS. Enabled by setting ``BOT_MODE=playwright`` in the
   environment. Not recommended on free-tier hosts.

The public API (``launch_bot``, ``stop_bot``, ``process_audio_chunk``,
``finalize_session``) is the same in both modes so routers don't care which is
active.
"""

import asyncio
import os
import subprocess
import time
from datetime import datetime, timezone
from typing import Optional, Dict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.config import settings
from app.models.session import MeetSession, SessionStatus, TranscriptChunk
from app.services.transcription_service import transcribe_audio_chunk
from app.services.summarization_service import generate_summary
from app.services.session_config import SessionConfig, load as load_session_config
from app.services.storage_service import (
    upload_audio_chunk,
    upload_transcript,
    upload_summary,
)


# Mode selection. Default to "browser" — works everywhere without extra infra.
BOT_MODE = os.environ.get("BOT_MODE", "browser").lower()


# Global registry of active sessions.
# For browser mode: tracks which sessions are currently streaming.
# For playwright mode: holds the BotInstance so we can stop it.
_active_sessions: Dict[str, "ActiveSession"] = {}


# ─── Active session record ────────────────────────────────────────────────────

class ActiveSession:
    """Lightweight record tracking an in-flight capture.

    In browser mode, ``bot`` is None — the frontend owns the capture loop. In
    playwright mode, ``bot`` is the BotInstance we can stop.
    """

    def __init__(self, session_id: str, meet_url: str, mode: str):
        self.session_id = session_id
        self.meet_url = meet_url
        self.mode = mode
        self.started_at = time.time()
        self.bot: Optional["BotInstance"] = None
        self.last_chunk_at: Optional[float] = None

    @property
    def duration_seconds(self) -> int:
        return int(time.time() - self.started_at)


# ─── Playwright bot (optional, self-hosted) ──────────────────────────────────

class BotInstance:
    def __init__(self, session_id: str, meet_url: str):
        self.session_id = session_id
        self.meet_url = meet_url
        self.browser = None
        self.context = None
        self.page = None
        self.is_running = False
        self.xvfb_proc = None
        self.start_time: Optional[float] = None
        self._playwright_cm = None

    async def launch(self, db: AsyncSession):
        try:
            await _update_session_status(db, self.session_id, SessionStatus.joining)
            self.start_time = time.time()

            from playwright.async_api import async_playwright

            # Start Xvfb virtual display on Linux if no DISPLAY is set.
            if os.name != "nt" and os.environ.get("DISPLAY") is None:
                display = ":99"
                try:
                    self.xvfb_proc = subprocess.Popen(
                        ["Xvfb", display, "-screen", "0", "1920x1080x24", "-ac"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                    os.environ["DISPLAY"] = display
                    await asyncio.sleep(1)
                except FileNotFoundError:
                    raise RuntimeError(
                        "Xvfb is not installed on this host. Either install "
                        "Xvfb + PulseAudio, or set BOT_MODE=browser."
                    )

            self._playwright_cm = async_playwright()
            pw = await self._playwright_cm.__aenter__()

            self.browser = await pw.chromium.launch(
                headless=False,
                args=[
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--use-fake-ui-for-media-stream",
                    "--autoplay-policy=no-user-gesture-required",
                    "--allow-running-insecure-content",
                    "--start-maximized",
                ],
            )

            self.context = await self.browser.new_context(
                permissions=["microphone", "camera", "notifications"],
                viewport={"width": 1920, "height": 1080},
                user_agent=(
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
            )

            self.page = await self.context.new_page()
            await self.page.goto(self.meet_url, wait_until="domcontentloaded", timeout=45000)
            await asyncio.sleep(3)
            await self._handle_prejoin()

            await _update_session_status(db, self.session_id, SessionStatus.recording)
            await _update_session_join_time(db, self.session_id)

            self.is_running = True
            await self._inject_audio_capture()
            await self._monitor_meeting(db)

        except Exception as e:
            print(f"[playwright] Bot launch error for session {self.session_id}: {e}")
            await _update_session_status(
                db, self.session_id, SessionStatus.failed, error=str(e)
            )
        finally:
            await self.cleanup()

    async def _handle_prejoin(self):
        page = self.page

        # Dismiss cookie/consent dialogs.
        for sel in ['button:has-text("Accept all")', 'button:has-text("I agree")']:
            try:
                loc = page.locator(sel)
                if await loc.count() > 0:
                    await loc.first.click()
                    await asyncio.sleep(0.5)
            except Exception:
                pass

        # "Join as guest" / "Continue without signing in".
        for sel in [
            'button:has-text("Join as guest")',
            'button:has-text("Continue without signing in")',
            'button:has-text("Use without an account")',
        ]:
            try:
                loc = page.locator(sel)
                if await loc.count() > 0:
                    await loc.first.click()
                    await asyncio.sleep(1)
                    break
            except Exception:
                pass

        # Name input.
        for sel in [
            'input[placeholder="Your name"]',
            'input[aria-label="Your name"]',
        ]:
            try:
                loc = page.locator(sel)
                if await loc.count() > 0:
                    await loc.first.fill(settings.BOT_NAME)
                    await asyncio.sleep(0.3)
                    break
            except Exception:
                pass

        # Mute mic + cam.
        for sel in ['[aria-label*="microphone" i]', '[aria-label*="camera" i]']:
            try:
                loc = page.locator(sel)
                if await loc.count() > 0:
                    await loc.first.click()
                    await asyncio.sleep(0.2)
            except Exception:
                pass

        # Click the join button.
        for sel in [
            'button:has-text("Ask to join")',
            'button:has-text("Join now")',
            'button:has-text("Join")',
        ]:
            try:
                loc = page.locator(sel)
                if await loc.count() > 0:
                    await loc.first.click()
                    break
            except Exception:
                pass

        # Give the host up to 2 minutes to admit us.
        await asyncio.sleep(5)

    async def _inject_audio_capture(self):
        backend_url = os.environ.get("BACKEND_URL", "http://localhost:8000")
        script = f"""
        (async () => {{
            window._msSessionId = '{self.session_id}';
            window._msBackend = '{backend_url}';
            window._msSeq = 0;
            try {{
                const stream = await navigator.mediaDevices.getUserMedia({{
                    audio: {{ echoCancellation: false, noiseSuppression: false,
                              autoGainControl: false }}, video: false,
                }});
                const rec = new MediaRecorder(stream, {{
                    mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 128000,
                }});
                rec.ondataavailable = async (e) => {{
                    if (!e.data || e.data.size === 0) return;
                    const buf = await e.data.arrayBuffer();
                    const bytes = new Uint8Array(buf);
                    let b = ''; for (let i=0;i<bytes.length;i++) b+=String.fromCharCode(bytes[i]);
                    const seq = window._msSeq++;
                    try {{
                        await fetch(window._msBackend + '/api/bot/chunk', {{
                            method: 'POST',
                            headers: {{'Content-Type': 'application/json'}},
                            body: JSON.stringify({{
                                session_id: window._msSessionId,
                                sequence: seq,
                                audio_base64: btoa(b),
                                mime_type: 'audio/webm;codecs=opus',
                            }}),
                        }});
                    }} catch(err) {{ console.error('chunk upload failed', err); }}
                }};
                rec.start({settings.AUDIO_CHUNK_DURATION_MS});
                window._msRecorder = rec;
            }} catch (err) {{ console.error('audio capture failed', err); }}
        }})();
        """
        try:
            await self.page.evaluate(script)
        except Exception as e:
            print(f"[playwright] audio capture injection error: {e}")

    async def _monitor_meeting(self, db: AsyncSession):
        max_duration = settings.MAX_MEETING_DURATION_MINUTES * 60
        check = 15
        while self.is_running:
            elapsed = time.time() - (self.start_time or time.time())
            if elapsed > max_duration:
                break
            try:
                url = self.page.url if self.page else ""
                if "meet.google.com" not in url:
                    break
                # "You've been removed" detection.
                try:
                    ended = await self.page.locator(
                        'text="You left the meeting", text="Meeting ended"'
                    ).count()
                    if ended:
                        break
                except Exception:
                    pass
            except Exception:
                break
            await asyncio.sleep(check)
        await self.stop(db)

    async def stop(self, db: AsyncSession):
        if not self.is_running:
            return
        self.is_running = False
        try:
            if self.page:
                await self.page.evaluate(
                    "if (window._msRecorder && window._msRecorder.state !== 'inactive') "
                    "window._msRecorder.stop();"
                )
                await asyncio.sleep(2)
        except Exception:
            pass

        duration = int(time.time() - (self.start_time or time.time()))
        await finalize_session(db, self.session_id, duration)
        _active_sessions.pop(self.session_id, None)

    async def cleanup(self):
        try:
            if self.browser:
                await self.browser.close()
        except Exception:
            pass
        try:
            if self._playwright_cm is not None:
                await self._playwright_cm.__aexit__(None, None, None)
        except Exception:
            pass
        try:
            if self.xvfb_proc:
                self.xvfb_proc.terminate()
        except Exception:
            pass


# ─── DB helpers ───────────────────────────────────────────────────────────────

async def _update_session_status(
    db: AsyncSession,
    session_id: str,
    status: SessionStatus,
    error: Optional[str] = None,
):
    values = {"status": status, "updated_at": datetime.now(timezone.utc)}
    if error is not None:
        values["error_message"] = error
    await db.execute(
        update(MeetSession).where(MeetSession.id == session_id).values(**values)
    )
    await db.commit()


async def _update_session_join_time(db: AsyncSession, session_id: str):
    await db.execute(
        update(MeetSession)
        .where(MeetSession.id == session_id)
        .values(bot_joined_at=datetime.now(timezone.utc))
    )
    await db.commit()


# ─── Public API ──────────────────────────────────────────────────────────────

async def launch_bot(
    session_id: str,
    meet_url: str,
    db: AsyncSession,
    mode: Optional[str] = None,
) -> dict:
    """Start a capture session.

    Returns a dict describing how the caller should proceed:
      - mode == "browser": caller (frontend) must open the WS stream and
        drive capture themselves. We just mark the session ready.
      - mode == "playwright": the server-side bot joins the Meet itself.
    """
    if len(_active_sessions) >= settings.MAX_CONCURRENT_BOTS:
        raise ValueError("Maximum concurrent bot limit reached. Please try again later.")

    chosen = (mode or BOT_MODE).lower()
    if chosen not in ("browser", "playwright"):
        chosen = "browser"

    active = ActiveSession(session_id=session_id, meet_url=meet_url, mode=chosen)
    _active_sessions[session_id] = active

    if chosen == "playwright":
        bot = BotInstance(session_id=session_id, meet_url=meet_url)
        active.bot = bot
        asyncio.create_task(bot.launch(db))
        return {"mode": "playwright", "session_id": session_id}

    # Browser mode: mark the session as "joining" immediately and wait for the
    # frontend to open the WS and start pushing chunks. The first chunk flips
    # status to "recording".
    await _update_session_status(db, session_id, SessionStatus.joining)
    return {
        "mode": "browser",
        "session_id": session_id,
        "ws_path": f"/api/bot/stream/{session_id}",
        "meet_url": meet_url,
    }


async def stop_bot(session_id: str, db: AsyncSession) -> bool:
    """Stop an active capture and finalize the session."""
    active = _active_sessions.get(session_id)
    if active is None:
        # Nothing live. Finalize anyway in case chunks arrived but session
        # was never cleaned up.
        await finalize_session(db, session_id, duration=0)
        return False

    if active.bot is not None:
        await active.bot.stop(db)
    else:
        duration = active.duration_seconds
        await finalize_session(db, session_id, duration=duration)
    _active_sessions.pop(session_id, None)
    return True


async def process_audio_chunk(
    db: AsyncSession,
    session_id: str,
    sequence: int,
    audio_bytes: bytes,
    mime_type: str = "audio/webm;codecs=opus",
) -> str:
    """Persist + transcribe one chunk. Returns the transcribed text (may be '')."""
    # Mark the session as recording on the first chunk.
    active = _active_sessions.get(session_id)
    if active is not None and active.last_chunk_at is None:
        await _update_session_status(db, session_id, SessionStatus.recording)
        await _update_session_join_time(db, session_id)
    if active is not None:
        active.last_chunk_at = time.time()

    # Best-effort upload to GCS (no-op without creds).
    gcs_path = await upload_audio_chunk(session_id, sequence, audio_bytes, mime_type)

    # Transcribe using the per-session config (speakers, languages, etc).
    cfg = load_session_config(session_id)
    text = await transcribe_audio_chunk(audio_bytes, mime_type=mime_type, config=cfg) or ""

    chunk = TranscriptChunk(
        session_id=session_id,
        sequence=sequence,
        text=text,
        audio_gcs_path=gcs_path or None,
    )
    db.add(chunk)
    await db.commit()
    return text


async def finalize_session(
    db: AsyncSession,
    session_id: str,
    duration: int,
) -> None:
    """Assemble transcript from chunks, run summary, mark session completed."""
    await _update_session_status(db, session_id, SessionStatus.processing)

    result = await db.execute(
        select(TranscriptChunk)
        .where(TranscriptChunk.session_id == session_id)
        .order_by(TranscriptChunk.sequence)
    )
    chunks = result.scalars().all()
    full_transcript = "\n".join(c.text for c in chunks if c.text).strip()

    summary_data = None
    if full_transcript:
        await upload_transcript(session_id, full_transcript)
        try:
            cfg = load_session_config(session_id)
            summary_data = await generate_summary(full_transcript, config=cfg)
            if summary_data:
                await upload_summary(session_id, summary_data)
        except Exception as e:
            print(f"summary generation failed for {session_id}: {e}")

    values = {
        "status": SessionStatus.completed,
        "full_transcript": full_transcript or None,
        "duration_seconds": duration,
        "ended_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    if summary_data:
        values.update(
            title=summary_data.get("title"),
            summary=summary_data.get("summary"),
            action_items=summary_data.get("action_items", []),
            key_points=summary_data.get("key_points", []),
            participants=summary_data.get("participants", []),
            sentiment=summary_data.get("sentiment"),
        )

    await db.execute(
        update(MeetSession).where(MeetSession.id == session_id).values(**values)
    )
    await db.commit()


def get_active_sessions() -> list:
    return list(_active_sessions.keys())


def is_active(session_id: str) -> bool:
    return session_id in _active_sessions


def register_browser_session(session_id: str, meet_url: str) -> None:
    """Called when a WS client opens the stream without first calling /launch."""
    if session_id not in _active_sessions:
        _active_sessions[session_id] = ActiveSession(
            session_id=session_id, meet_url=meet_url, mode="browser"
        )
