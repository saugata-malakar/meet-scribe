import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSession, updateSession } from "@/lib/server/sessionStore";
import type { ScribeConfig } from "@/lib/server/sessionStore";
import { launchBot, isBotActive } from "@/lib/server/meetBot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let body: { session_id?: string; mode?: string; config?: ScribeConfig };
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

  // Persist the scribe config now so the chunk + finalize routes pick it up.
  updateSession(sessionId, { config: body.config ?? s.config });

  if (isBotActive(sessionId)) {
    return NextResponse.json({
      mode: "playwright",
      session_id: sessionId,
      already_active: true,
    });
  }

  const result = await launchBot(sessionId, s.meetUrl);
  if (!result.ok) {
    updateSession(sessionId, { status: "failed", errorMessage: result.error });
    return NextResponse.json({ detail: result.error }, { status: 500 });
  }

  return NextResponse.json({
    mode: "playwright",
    session_id: sessionId,
    meet_url: s.meetUrl,
  });
}
