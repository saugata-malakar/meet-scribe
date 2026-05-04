/**
 * Receives one audio chunk.
 *
 * Two callers:
 *   1. The server-side Playwright bot (running inside the same Node process)
 *      — its Chromium has no Clerk session, so it sends an `internal_token`
 *      we minted for its session at launch time.
 *   2. The fallback user-side LiveCaptureController — has a Clerk session.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSession, addChunk } from "@/lib/server/sessionStore";
import { transcribeAudio } from "@/lib/server/gemini";
import { verifyInternalToken } from "@/lib/server/meetBot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { detail: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const sessionId = String(form.get("session_id") ?? "");
  const seqRaw = form.get("sequence");
  const audio = form.get("audio");
  const internalToken = form.get("internal_token");

  if (!sessionId || seqRaw === null || !(audio instanceof Blob)) {
    return NextResponse.json(
      { detail: "session_id, sequence and audio are required" },
      { status: 400 },
    );
  }

  const s = getSession(sessionId);
  if (!s) {
    return NextResponse.json({ detail: "Session not found" }, { status: 404 });
  }

  // Authorize: either the server-side bot's internal token, or the session's
  // Clerk-authenticated owner.
  const tokenStr = typeof internalToken === "string" ? internalToken : null;
  const isBot = verifyInternalToken(sessionId, tokenStr);
  if (!isBot) {
    const { userId } = await auth();
    if (!userId || s.userId !== userId) {
      return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
    }
  }

  const sequence = Number(seqRaw);
  if (!Number.isFinite(sequence)) {
    return NextResponse.json({ detail: "bad sequence" }, { status: 400 });
  }

  const bytes = new Uint8Array(await audio.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ ok: true, text: "", sequence });
  }

  const mime = audio.type || "audio/webm";
  const text = await transcribeAudio(bytes, mime, s.config);
  addChunk(sessionId, sequence, text);

  return NextResponse.json({ ok: true, text, sequence });
}
