import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  createSession,
  getUserSessions,
} from "@/lib/server/sessionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  const sessions = getUserSessions(userId).map(toWire);
  return NextResponse.json(sessions);
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }

  let body: { meet_url?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  const meetUrl = (body.meet_url ?? "").trim();
  if (!meetUrl) {
    return NextResponse.json({ detail: "meet_url is required" }, { status: 400 });
  }
  if (!meetUrl.includes("meet.google.com")) {
    return NextResponse.json(
      { detail: "meet_url must be a Google Meet link" },
      { status: 400 },
    );
  }

  const session = createSession({
    userId,
    meetUrl,
    title: body.title?.trim() || undefined,
  });
  return NextResponse.json(toWire(session));
}

function toWire(s: ReturnType<typeof getUserSessions>[number]) {
  return {
    id: s.id,
    title: s.title ?? s.title_generated,
    meet_url: s.meetUrl,
    status: s.status,
    created_at: new Date(s.createdAt).toISOString(),
    started_at: s.startedAt ? new Date(s.startedAt).toISOString() : undefined,
    ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : undefined,
    duration_seconds: s.durationSeconds,
    summary: s.summary,
    full_transcript: s.fullTranscript,
    key_points: s.keyPoints ?? [],
    action_items: s.actionItems ?? [],
    participants: s.participants ?? [],
    sentiment: s.sentiment,
  };
}
