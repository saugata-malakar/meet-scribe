/**
 * Real Google Meet bot — joins a Meet as a guest, asks to be admitted,
 * and captures the meeting audio while inside the call.
 *
 * Flow:
 *   1. Launch Chromium with fake mic/cam permissions pre-granted.
 *   2. Navigate to the Meet URL.
 *   3. Type a guest name, mute mic + cam, click "Ask to join".
 *   4. Wait for the host to admit us. Once admitted, the controls bar appears.
 *   5. Inject MediaRecorder JS into the page that captures the meeting tab's
 *      audio output and POSTs each ~5s chunk back to /api/bot/chunk.
 *   6. Watch for the meeting to end (the host removes us OR everyone leaves).
 *   7. On end (or explicit /api/bot/stop), close the browser and finalize.
 *
 * Hosting requirements: this runs server-side and needs Chromium + audio
 * capture support. Works on a normal Linux/Windows host with Playwright
 * installed. Will NOT run on Render's free tier (no display, low memory).
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { updateSession, getSession, addChunk } from "./sessionStore";
import { transcribeAudio, generateSummary } from "./gemini";

interface ActiveBot {
  sessionId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  startedAt: number;
  stopRequested: boolean;
  finalizePromise?: Promise<void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __meetScribeBots: Map<string, ActiveBot> | undefined;
}

const bots: Map<string, ActiveBot> =
  globalThis.__meetScribeBots ?? new Map<string, ActiveBot>();
if (!globalThis.__meetScribeBots) globalThis.__meetScribeBots = bots;

const BOT_NAME = process.env.BOT_NAME || "AI Scribe Bot";
const HEADLESS =
  (process.env.BOT_HEADLESS ?? "true").toLowerCase() !== "false";

// ─── Public API ───────────────────────────────────────────────────────────

export async function launchBot(
  sessionId: string,
  meetUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (bots.has(sessionId)) {
    return { ok: false, error: "Bot already running for this session" };
  }

  let browser: Browser;
  try {
    browser = await chromium.launch({
      headless: HEADLESS,
      proxy: process.env.PROXY_URL ? { server: process.env.PROXY_URL } : undefined,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        "--autoplay-policy=no-user-gesture-required",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error:
        "Couldn't launch Chromium. On a fresh install run: " +
        "`npx playwright install chromium`. " +
        "On Render free tier, headless Chromium can't run — upgrade to Starter " +
        `or run locally. Underlying error: ${err}`,
    };
  }

  const context = await browser.newContext({
    permissions: ["microphone", "camera"],
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    locale: "en-US",
  });

  await context.grantPermissions(["microphone", "camera"], {
    origin: "https://meet.google.com",
  });

  const page = await context.newPage();
  const bot: ActiveBot = {
    sessionId,
    browser,
    context,
    page,
    startedAt: Date.now(),
    stopRequested: false,
  };
  bots.set(sessionId, bot);

  updateSession(sessionId, { status: "joining" });

  // Run the join in the background; don't block the API response on it.
  joinAndCapture(bot, meetUrl).catch((err) => {
    console.error(`[bot ${sessionId}] fatal:`, err);
    const msg = err instanceof Error ? err.message : String(err);
    updateSession(sessionId, {
      status: "failed",
      errorMessage: msg,
    });
    cleanup(bot).catch(() => {});
  });

  return { ok: true };
}

export async function stopBot(sessionId: string): Promise<void> {
  const bot = bots.get(sessionId);
  if (!bot) {
    // No live bot — still try to finalize from any chunks already collected.
    await finalizeFromChunks(sessionId);
    return;
  }
  bot.stopRequested = true;

  // Tell the in-page recorder to flush + stop.
  try {
    await bot.page.evaluate(() => {
      const w = window as unknown as { __msStop?: () => void };
      w.__msStop?.();
    });
  } catch {
    /* page may already be gone */
  }

  // Give the last chunk(s) a moment to upload before tearing down.
  await new Promise((r) => setTimeout(r, 4000));

  await cleanup(bot);
  await finalizeFromChunks(sessionId);
}

export function isBotActive(sessionId: string): boolean {
  return bots.has(sessionId);
}

// ─── Join + capture flow ──────────────────────────────────────────────────

async function joinAndCapture(bot: ActiveBot, meetUrl: string): Promise<void> {
  const { page, sessionId } = bot;

  await page.goto(meetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(2000);

  // Dismiss any cookie / consent banners.
  for (const sel of [
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Got it")',
  ]) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click({ timeout: 2000 });
        await page.waitForTimeout(500);
      }
    } catch {
      /* ignore */
    }
  }

  // "Use without an account" / "Continue as guest" path.
  for (const sel of [
    'button:has-text("Use without an account")',
    'button:has-text("Continue without signing in")',
    'button:has-text("Join as guest")',
  ]) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.click({ timeout: 2000 });
        await page.waitForTimeout(800);
        break;
      }
    } catch {
      /* ignore */
    }
  }

  // Type a name into "Your name" field if present.
  for (const sel of [
    'input[placeholder*="name" i]',
    'input[aria-label*="name" i]',
  ]) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1500 }).catch(() => false)) {
        await el.fill(BOT_NAME, { timeout: 2000 });
        await page.waitForTimeout(300);
        break;
      }
    } catch {
      /* ignore */
    }
  }

  // Mute mic + cam before joining (best-effort).
  for (const sel of [
    '[aria-label*="microphone" i][aria-pressed="false"]',
    '[aria-label*="camera" i][aria-pressed="false"]',
    '[data-tooltip*="microphone" i]',
    '[data-tooltip*="camera" i]',
  ]) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        await el.click({ timeout: 1500 });
        await page.waitForTimeout(200);
      }
    } catch {
      /* ignore */
    }
  }

  // Click "Ask to join" or "Join now".
  let asked = false;
  for (const sel of [
    'button:has-text("Ask to join")',
    'button:has-text("Join now")',
    'button:has-text("Join")',
  ]) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
        await el.click({ timeout: 3000 });
        asked = true;
        break;
      }
    } catch {
      /* ignore */
    }
  }
  if (!asked) {
    throw new Error(
      "Couldn't find a Join / Ask to join button. Meet URL might be invalid or the UI changed.",
    );
  }

  // Wait up to 2 minutes for the host to admit us. We detect admission by
  // looking for the in-meeting controls (leave-call button).
  const admitted = await waitForAdmission(page, 120_000);
  if (!admitted) {
    throw new Error(
      "Host did not admit the bot within 2 minutes. The meeting may be locked or the request was denied.",
    );
  }

  updateSession(sessionId, { status: "recording", startedAt: Date.now() });

  // Inject the in-page recorder. It POSTs chunks back to our own /api/bot/chunk
  // — but since the bot's Chromium is anonymous (no Clerk cookie), we use a
  // server-internal endpoint that auth-bypasses with a per-session token.
  const internalToken = mintInternalToken(sessionId);
  await page.evaluate(
    ({ sid, token, originHint }) => {
      const w = window as unknown as {
        __msStop?: () => void;
        __msRec?: MediaRecorder;
      };

      const start = async () => {
        try {
          // Capture the page's audio output via getDisplayMedia, with audio
          // forced. In a headful browser inside a meeting, the page's tab
          // audio carries every other participant's voice.
          const stream = await (
            navigator.mediaDevices as MediaDevices & {
              getDisplayMedia: (c: DisplayMediaStreamOptions) => Promise<MediaStream>;
            }
          ).getDisplayMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
            video: false,
            // @ts-expect-error chrome-only hint
            preferCurrentTab: true,
          });

          const audioOnly = new MediaStream(stream.getAudioTracks());
          const rec = new MediaRecorder(audioOnly, {
            mimeType: "audio/webm;codecs=opus",
            audioBitsPerSecond: 96_000,
          });

          let seq = 0;
          rec.ondataavailable = async (e) => {
            if (!e.data || e.data.size === 0) return;
            try {
              const fd = new FormData();
              fd.append("session_id", sid);
              fd.append("sequence", String(seq++));
              fd.append("internal_token", token);
              fd.append("audio", e.data, "chunk.webm");
              await fetch(`${originHint}/api/bot/chunk`, {
                method: "POST",
                body: fd,
              });
            } catch (err) {
              console.error("chunk upload failed", err);
            }
          };
          rec.start(5000);
          w.__msRec = rec;
          w.__msStop = () => {
            try {
              rec.requestData();
              rec.stop();
            } catch {
              /* */
            }
            audioOnly.getTracks().forEach((t) => t.stop());
            stream.getTracks().forEach((t) => t.stop());
          };
        } catch (err) {
          console.error("audio capture init failed", err);
        }
      };
      void start();
    },
    {
      sid: sessionId,
      token: internalToken,
      originHint: process.env.PUBLIC_ORIGIN || "http://localhost:10000",
    },
  );

  // Poll for end-of-meeting markers OR explicit stop.
  const maxDurationMs = 1000 * 60 * 120; // 2h cap
  const tickMs = 5000;
  while (!bot.stopRequested) {
    if (Date.now() - bot.startedAt > maxDurationMs) break;

    // "You've been removed" / "Call ended" / participants count = 0
    const ended = await page
      .locator(
        'text=/You\\\'?ve been removed/i, text=/Meeting ended/i, text=/Call ended/i, text=/You left the meeting/i',
      )
      .count()
      .catch(() => 0);
    if (ended > 0) break;

    // If the page navigated away from meet.google.com, treat as ended.
    if (!page.url().includes("meet.google.com")) break;

    await page.waitForTimeout(tickMs);
  }

  await cleanup(bot);
  await finalizeFromChunks(sessionId);
}

async function waitForAdmission(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // In-meeting indicators.
    const inMeeting = await Promise.race([
      page
        .locator('button[aria-label*="leave call" i], button[aria-label*="end call" i]')
        .first()
        .isVisible({ timeout: 1000 })
        .catch(() => false),
      page
        .locator('[data-promo-anchor-id="hangup"]')
        .first()
        .isVisible({ timeout: 1000 })
        .catch(() => false),
      page
        .locator('text=/You.?re in the meeting/i')
        .first()
        .isVisible({ timeout: 1000 })
        .catch(() => false),
    ]);
    if (inMeeting) return true;

    // Denied / removed.
    const denied = await page
      .locator('text=/denied your request|can\\\'?t join|removed|not allowed/i')
      .count()
      .catch(() => 0);
    if (denied > 0) return false;

    await page.waitForTimeout(2000);
  }
  return false;
}

// ─── Internal token for the in-page chunk uploader ────────────────────────
//
// The bot's Chromium isn't authenticated with Clerk — but it needs to POST
// chunks back. We mint a short-lived HMAC-style token bound to the session
// id and verify it in the chunk route. Token is just a random string kept
// in memory; we don't need cryptographic security since it's never exposed
// outside the in-process bot's tab.

const INTERNAL_TOKENS = new Map<string, string>();

function mintInternalToken(sessionId: string): string {
  const t = `bot-${sessionId}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  INTERNAL_TOKENS.set(sessionId, t);
  return t;
}

export function verifyInternalToken(
  sessionId: string,
  token: string | null,
): boolean {
  if (!token) return false;
  return INTERNAL_TOKENS.get(sessionId) === token;
}

// ─── Cleanup + finalize ───────────────────────────────────────────────────

async function cleanup(bot: ActiveBot): Promise<void> {
  bots.delete(bot.sessionId);
  INTERNAL_TOKENS.delete(bot.sessionId);
  try {
    await bot.context.close();
  } catch {
    /* */
  }
  try {
    await bot.browser.close();
  } catch {
    /* */
  }
}

async function finalizeFromChunks(sessionId: string): Promise<void> {
  const s = getSession(sessionId);
  if (!s) return;
  if (s.status === "completed") return;

  updateSession(sessionId, { status: "processing" });

  const fullTranscript = s.chunks
    .filter((c) => c.text)
    .map((c) => c.text)
    .join("\n")
    .trim();

  const summary = fullTranscript
    ? await generateSummary(fullTranscript, s.config)
    : null;

  const endedAt = Date.now();
  updateSession(sessionId, {
    status: "completed",
    endedAt,
    durationSeconds: Math.floor((endedAt - s.createdAt) / 1000),
    fullTranscript,
    summary: summary?.summary,
    title_generated: summary?.title,
    keyPoints: summary?.key_points ?? [],
    actionItems: summary?.action_items ?? [],
    participants: summary?.participants ?? [],
    sentiment: summary?.sentiment,
  });
}

// Re-export for the chunk route.
export { transcribeAudio, addChunk };
