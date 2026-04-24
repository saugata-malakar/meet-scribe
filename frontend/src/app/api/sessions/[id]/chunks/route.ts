import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getSession } from "@/lib/server/sessionStore";

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
  return NextResponse.json(
    s.chunks.map((c, idx) => ({
      id: `${s.id}-${c.sequence}`,
      sequence: c.sequence,
      text: c.text,
    })),
  );
}
