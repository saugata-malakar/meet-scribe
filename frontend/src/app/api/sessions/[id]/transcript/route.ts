import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSession, updateSession } from "@/lib/server/sessionStore";
import { generateSummary } from "@/lib/server/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  request: Request,
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

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (text.length < 10) {
    return NextResponse.json(
      { detail: "transcript too short" },
      { status: 400 },
    );
  }

  updateSession(id, {
    status: "processing",
    fullTranscript: text,
  });

  const summary = await generateSummary(text, s.config);

  updateSession(id, {
    status: "completed",
    endedAt: Date.now(),
    durationSeconds: Math.floor((Date.now() - s.createdAt) / 1000),
    summary: summary?.summary,
    title_generated: summary?.title,
    keyPoints: summary?.key_points ?? [],
    actionItems: summary?.action_items ?? [],
    participants: summary?.participants ?? [],
    sentiment: summary?.sentiment,
  });

  return NextResponse.json({ ok: true });
}
