import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSession, updateSession } from "@/lib/server/sessionStore";
import { generateSummary } from "@/lib/server/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let body: { session_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  const sessionId = body.session_id ?? "";
  const s = getSession(sessionId);
  if (!s || s.userId !== userId) {
    return NextResponse.json({ detail: "Session not found" }, { status: 404 });
  }

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

  return NextResponse.json({
    ok: true,
    session_id: sessionId,
    has_summary: !!summary,
  });
}
