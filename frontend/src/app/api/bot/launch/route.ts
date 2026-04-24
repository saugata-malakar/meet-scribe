import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSession, updateSession } from "@/lib/server/sessionStore";
import type { ScribeConfig } from "@/lib/server/sessionStore";

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

  updateSession(sessionId, {
    status: "joining",
    config: body.config ?? s.config,
  });

  // Browser mode — frontend does tab-audio capture itself and POSTs chunks.
  return NextResponse.json({
    mode: "browser",
    session_id: sessionId,
    chunk_endpoint: `/api/bot/chunk`,
    meet_url: s.meetUrl,
  });
}
