"""
Google Meet Bot Service using Playwright.

Architecture:
- Playwright launches headless Chrome with Xvfb virtual display
- Bot joins Google Meet as a guest
- JavaScript injected to capture tab audio via MediaRecorder
- Audio chunks sent back via HTTP to backend
- Chunks transcribed with Google STT and stored
- On stop, full summary generated with Gemini
"""

import asyncio
import base64
import os
import subprocess
import time
from datetime import datetime, timezone
from typing import Optional, Dict
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from app.config import settings
from app.models.session import MeetSession, SessionStatus, TranscriptChunk
from app.services.transcription_service import transcribe_audio_chunk
from app.services.summarization_service import generate_summary, generate_quick_title
from app.services.storage_service import upload_audio_chunk, upload_transcript, upload_summary

# Global registry of active bots: session_id -> BotInstance
_active_bots: Dict[str, "BotInstance"] = {}


class BotInstance:
    def __init__(self, session_id: str, meet_url: str):
        self.session_id = session_id
        self.meet_url = meet_url
        self.browser = None
        self.context = None
        self.page = None
        self.is_running = False
        self.transcript_chunks = []
        self.chunk_sequence = 0
        self.xvfb_proc = None
        self.pulse_proc = None
        self.start_time = None

    async def launch(self, db: AsyncSession):
        """Launch the Playwright bot and join the Google Meet."""
        try:
            await _update_session_status(db, self.session_id, SessionStatus.joining)
            self.start_time = time.time()

            from playwright.async_api import async_playwright

            # Start virtual display (Xvfb) if on Linux
            if os.name != "nt" and os.environ.get("DISPLAY") is None:
                display = ":99"
                self.xvfb_proc = subprocess.Popen(
                    ["Xvfb", display, "-screen", "0", "1920x1080x24", "-ac"],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                os.environ["DISPLAY"] = display
                await asyncio.sleep(1)

            async with async_playwright() as pw:
                self.browser = await pw.chromium.launch(
                    headless=False,  # Must be False for Meet to work with audio
                    args=[
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                        "--disable-dev-shm-usage",
                        "--disable-gpu",
                        "--disable-web-security",
                        "--use-fake-ui-for-media-stream",  # Auto-accept mic/cam permissions
                        "--use-fake-device-for-media-stream",
                        "--allow-running-insecure-content",
                        f"--display={os.environ.get('DISPLAY', ':99')}",
                        "--start-maximized",
                        "--auto-select-tab-capture-source-by-title=Google Meet",
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

                # Navigate to Google Meet
                await self.page.goto(self.meet_url, wait_until="networkidle", timeout=30000)
                await asyncio.sleep(2)

                # Handle pre-join screen
                await self._handle_prejoin()

                # Update status to recording
                await _update_session_status(db, self.session_id, SessionStatus.recording)
                await _update_session_join_time(db, self.session_id)

                self.is_running = True

                # Start audio capture via injected JS
                await self._inject_audio_capture()

                # Monitor meeting and collect chunks
                await self._monitor_meeting(db)

        except Exception as e:
            print(f"Bot launch error for session {self.session_id}: {e}")
            await _update_session_status(db, self.session_id, SessionStatus.failed,
                                         error=str(e))
        finally:
            await self.cleanup()

    async def _handle_prejoin(self):
        """Handle the Google Meet pre-join screen."""
        page = self.page

        # Wait for and dismiss any cookie/consent dialogs
        try:
            consent_btn = page.locator('button:has-text("Accept all")', )
            if await consent_btn.count() > 0:
                await consent_btn.first.click()
                await asyncio.sleep(1)
        except Exception:
            pass

        # Try "Continue without signing in" or "Join as guest"
        selectors = [
            'button:has-text("Join as guest")',
            'button:has-text("Continue without signing in")',
            '[data-testid="guest-option"]',
            'button:has-text("Continue")',
        ]

        for selector in selectors:
            try:
                el = page.locator(selector)
                if await el.count() > 0:
                    await el.first.click()
                    await asyncio.sleep(1)
                    break
            except Exception:
                pass

        # Fill in name if prompted
        name_selectors = [
            'input[placeholder="Your name"]',
            'input[aria-label="Your name"]',
            '[data-testid="name-input"]',
        ]
        for selector in name_selectors:
            try:
                el = page.locator(selector)
                if await el.count() > 0:
                    await el.first.fill(settings.BOT_NAME)
                    await asyncio.sleep(0.5)
                    break
            except Exception:
                pass

        # Mute mic and camera before joining
        try:
            mic_btn = page.locator('[data-testid="microphone-button"], [aria-label*="microphone"]')
            if await mic_btn.count() > 0:
                await mic_btn.first.click()
        except Exception:
            pass

        try:
            cam_btn = page.locator('[data-testid="camera-button"], [aria-label*="camera"]')
            if await cam_btn.count() > 0:
                await cam_btn.first.click()
        except Exception:
            pass

        # Click "Join now" or "Ask to join"
        join_selectors = [
            'button:has-text("Join now")',
            'button:has-text("Ask to join")',
            'button:has-text("Join")',
            '[data-testid="join-button"]',
        ]
        for selector in join_selectors:
            try:
                el = page.locator(selector)
                if await el.count() > 0:
                    await el.first.click()
                    await asyncio.sleep(3)
                    break
            except Exception:
                pass

        # Wait to be admitted (up to 2 minutes)
        await asyncio.sleep(5)

    async def _inject_audio_capture(self):
        """Inject JavaScript to capture meeting audio via MediaRecorder."""
        session_id = self.session_id

        # We capture using getDisplayMedia which includes tab audio
        capture_script = f"""
        (async () => {{
            window._meetScribeSessionId = '{session_id}';
            window._meetScribeChunkSeq = 0;
            window._meetScribeBackendUrl = '{os.environ.get("BACKEND_URL", "http://localhost:8000")}';

            async function startAudioCapture() {{
                try {{
                    // Try getUserMedia first (captures mic which in virtual env = system audio)
                    const stream = await navigator.mediaDevices.getUserMedia({{
                        audio: {{
                            echoCancellation: false,
                            noiseSuppression: false,
                            autoGainControl: false,
                        }},
                        video: false
                    }});

                    const recorder = new MediaRecorder(stream, {{
                        mimeType: 'audio/webm;codecs=opus',
                        audioBitsPerSecond: 128000
                    }});

                    recorder.ondataavailable = async (e) => {{
                        if (e.data.size > 0) {{
                            const arrayBuffer = await e.data.arrayBuffer();
                            const base64 = btoa(
                                String.fromCharCode(...new Uint8Array(arrayBuffer))
                            );
                            const seq = window._meetScribeChunkSeq++;
                            try {{
                                await fetch(window._meetScribeBackendUrl + '/api/bot/chunk', {{
                                    method: 'POST',
                                    headers: {{'Content-Type': 'application/json'}},
                                    body: JSON.stringify({{
                                        session_id: window._meetScribeSessionId,
                                        sequence: seq,
                                        audio_base64: base64,
                                        mime_type: 'audio/webm;codecs=opus'
                                    }})
                                }});
                            }} catch(fetchErr) {{
                                console.error('Chunk upload failed:', fetchErr);
                            }}
                        }}
                    }};

                    // Record in 10-second chunks
                    recorder.start({settings.AUDIO_CHUNK_DURATION_MS});
                    window._meetScribeRecorder = recorder;
                    console.log('Meet Scribe: Audio capture started');
                    return 'started';
                }} catch(err) {{
                    console.error('Meet Scribe: Audio capture failed:', err);
                    return 'failed: ' + err.message;
                }}
            }}

            window._meetScribeCaptureResult = await startAudioCapture();
        }})();
        """
        try:
            await self.page.evaluate(capture_script)
        except Exception as e:
            print(f"Audio capture injection error: {e}")

    async def _monitor_meeting(self, db: AsyncSession):
        """Monitor the meeting and check if it has ended."""
        max_duration = settings.MAX_MEETING_DURATION_MINUTES * 60
        check_interval = 30  # seconds

        while self.is_running:
            elapsed = time.time() - (self.start_time or time.time())
            if elapsed > max_duration:
                print(f"Session {self.session_id}: Max duration reached, stopping bot")
                break

            # Check if meeting has ended (page redirected away from Meet)
            try:
                url = self.page.url
                if "meet.google.com" not in url and "meet" not in url:
                    print(f"Session {self.session_id}: Meeting ended (URL changed)")
                    break
            except Exception:
                break

            await asyncio.sleep(check_interval)

        # Stop recording
        await self.stop(db)

    async def stop(self, db: AsyncSession):
        """Stop the bot and generate final summary."""
        if not self.is_running:
            return

        self.is_running = False

        # Stop the recorder
        try:
            await self.page.evaluate("if (window._meetScribeRecorder) window._meetScribeRecorder.stop();")
            await asyncio.sleep(2)
        except Exception:
            pass

        await _update_session_status(db, self.session_id, SessionStatus.processing)

        # Fetch all chunks from DB and assemble transcript
        result = await db.execute(
            select(TranscriptChunk)
            .where(TranscriptChunk.session_id == self.session_id)
            .order_by(TranscriptChunk.sequence)
        )
        chunks = result.scalars().all()
        full_transcript = "\n".join(c.text for c in chunks if c.text)

        # Generate summary
        summary_data = None
        if full_transcript:
            from app.services.storage_service import upload_transcript as _upload_transcript
            transcript_path = await _upload_transcript(self.session_id, full_transcript)

            summary_data = await generate_summary(full_transcript)

            if summary_data:
                await upload_summary(self.session_id, summary_data)

        # Update session with final data
        duration = int(time.time() - (self.start_time or time.time()))
        await _finalize_session(db, self.session_id, full_transcript, summary_data, duration)

        # Remove from active bots
        _active_bots.pop(self.session_id, None)

    async def cleanup(self):
        """Clean up browser and processes."""
        try:
            if self.browser:
                await self.browser.close()
        except Exception:
            pass
        try:
            if self.xvfb_proc:
                self.xvfb_proc.terminate()
        except Exception:
            pass


# ─── Helper DB functions ─────────────────────────────────────────────────────

async def _update_session_status(
    db: AsyncSession,
    session_id: str,
    status: SessionStatus,
    error: Optional[str] = None,
):
    await db.execute(
        update(MeetSession)
        .where(MeetSession.id == session_id)
        .values(status=status, error_message=error, updated_at=datetime.now(timezone.utc))
    )
    await db.commit()


async def _update_session_join_time(db: AsyncSession, session_id: str):
    await db.execute(
        update(MeetSession)
        .where(MeetSession.id == session_id)
        .values(bot_joined_at=datetime.now(timezone.utc))
    )
    await db.commit()


async def _finalize_session(
    db: AsyncSession,
    session_id: str,
    transcript: str,
    summary_data: Optional[dict],
    duration: int,
):
    values = {
        "status": SessionStatus.completed,
        "full_transcript": transcript,
        "duration_seconds": duration,
        "ended_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
    }
    if summary_data:
        values.update({
            "title": summary_data.get("title"),
            "summary": summary_data.get("summary"),
            "action_items": summary_data.get("action_items", []),
            "key_points": summary_data.get("key_points", []),
            "participants": summary_data.get("participants", []),
            "sentiment": summary_data.get("sentiment"),
        })
    await db.execute(update(MeetSession).where(MeetSession.id == session_id).values(**values))
    await db.commit()


# ─── Public API ──────────────────────────────────────────────────────────────

async def launch_bot(session_id: str, meet_url: str, db: AsyncSession):
    """Launch a new bot for a session (runs as a background task)."""
    if len(_active_bots) >= settings.MAX_CONCURRENT_BOTS:
        raise ValueError("Maximum concurrent bot limit reached. Please try again later.")

    bot = BotInstance(session_id=session_id, meet_url=meet_url)
    _active_bots[session_id] = bot
    # Run bot in background without blocking the request
    asyncio.create_task(bot.launch(db))


async def stop_bot(session_id: str, db: AsyncSession):
    """Stop an active bot."""
    bot = _active_bots.get(session_id)
    if bot:
        await bot.stop(db)
        return True
    return False


async def process_audio_chunk(
    db: AsyncSession,
    session_id: str,
    sequence: int,
    audio_bytes: bytes,
    mime_type: str = "audio/webm;codecs=opus",
):
    """Process an incoming audio chunk: transcribe and store."""
    # Upload to GCS
    gcs_path = await upload_audio_chunk(session_id, sequence, audio_bytes, mime_type)

    # Transcribe
    text = await transcribe_audio_chunk(audio_bytes)
    if not text:
        text = ""

    # Store chunk
    chunk = TranscriptChunk(
        session_id=session_id,
        sequence=sequence,
        text=text,
        audio_gcs_path=gcs_path,
    )
    db.add(chunk)
    await db.commit()

    return text


def get_active_sessions() -> list:
    return list(_active_bots.keys())
