/**
 * Receives one audio chunk from the live-capture controller in the browser.
 * Body: multipart/form-data with fields:
 *   - session_id: string
 *   - sequence: integer (as string)
 *   - audio: Blob (audio/webm;opus, ~5s)
 *
 * We send the blob to Gemini for transcription and append the resulting text
 * to the session's chunk list.
 */

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSession, addChunk } from "@/lib/server/sessionStore";
import { transcribeAudio } from "@/lib/server/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Allow audio payloads a bit larger than Next's default.
export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch (e) {
    return NextResponse.json(
      { detail: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  const sessionId = String(form.get("session_id") ?? "");
  const seqRaw = form.get("sequence");
  const audio = form.get("audio");

  if (!sessionId || seqRaw === null || !(audio instanceof Blob)) {
    return NextResponse.json(
      { detail: "session_id, sequence and audio are required" },
      { status: 400 },
    );
  }

  const s = getSession(sessionId);
  if (!s || s.userId !== userId) {
    return NextResponse.json({ detail: "Session not found" }, { status: 404 });
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
