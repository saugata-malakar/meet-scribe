import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSession } from "@/lib/server/sessionStore";
import { stopBot } from "@/lib/server/meetBot";

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

  await stopBot(sessionId);
  return NextResponse.json({ ok: true, session_id: sessionId });
}
