import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSession, deleteSession } from "@/lib/server/sessionStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const s = getSession(id);
  if (!s || s.userId !== userId) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  return NextResponse.json({
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
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const s = getSession(id);
  if (!s || s.userId !== userId) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  deleteSession(id);
  return NextResponse.json({ ok: true });
}
