/**
 * In-memory session store.
 *
 * Good enough for an MVP on a single Render dyno. When the dyno restarts,
 * in-flight sessions are lost — that's an acceptable trade for not needing
 * a Postgres instance. If this needs to survive restarts later, swap the
 * Map for a Redis client (Upstash has a free tier) and the shape stays the
 * same.
 *
 * We use `globalThis` so hot-reloads during `next dev` don't wipe the store.
 */

export type SessionStatus =
  | "pending"
  | "joining"
  | "recording"
  | "processing"
  | "completed"
  | "failed"
  | "stopped";

export interface TranscriptChunk {
  sequence: number;
  text: string;
  createdAt: number;
}

export interface ScribeConfig {
  language?: string;
  additional_languages?: string[];
  summary_language?: string;
  speaker_hints?: string[];
  summary_style?: "brief" | "standard" | "detailed";
  summary_audience?: string;
  long_meeting_mode?: boolean;
  extra_instructions?: string;
}

export interface MeetSession {
  id: string;
  userId: string;           // Clerk user id
  meetUrl: string;
  title?: string;
  status: SessionStatus;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
  durationSeconds?: number;
  config?: ScribeConfig;
  chunks: TranscriptChunk[];
  fullTranscript?: string;
  summary?: string;
  title_generated?: string;
  keyPoints?: string[];
  actionItems?: string[];
  participants?: string[];
  sentiment?: string;
  errorMessage?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __meetScribeStore: Map<string, MeetSession> | undefined;
}

const store: Map<string, MeetSession> =
  globalThis.__meetScribeStore ?? new Map<string, MeetSession>();

if (!globalThis.__meetScribeStore) {
  globalThis.__meetScribeStore = store;
}

export function createSession(data: {
  userId: string;
  meetUrl: string;
  title?: string;
}): MeetSession {
  const id = cryptoRandomId();
  const session: MeetSession = {
    id,
    userId: data.userId,
    meetUrl: data.meetUrl,
    title: data.title,
    status: "pending",
    createdAt: Date.now(),
    chunks: [],
  };
  store.set(id, session);
  return session;
}

export function getSession(id: string): MeetSession | undefined {
  return store.get(id);
}

export function getUserSessions(userId: string): MeetSession[] {
  return Array.from(store.values())
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function updateSession(
  id: string,
  patch: Partial<MeetSession>,
): MeetSession | undefined {
  const s = store.get(id);
  if (!s) return undefined;
  Object.assign(s, patch);
  return s;
}

export function addChunk(
  id: string,
  sequence: number,
  text: string,
): MeetSession | undefined {
  const s = store.get(id);
  if (!s) return undefined;
  s.chunks.push({ sequence, text, createdAt: Date.now() });
  s.chunks.sort((a, b) => a.sequence - b.sequence);
  if (s.status === "joining" && text) s.status = "recording";
  if (!s.startedAt) s.startedAt = Date.now();
  return s;
}

export function deleteSession(id: string): boolean {
  return store.delete(id);
}

function cryptoRandomId(): string {
  // Node 20 has globalThis.crypto.
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}
