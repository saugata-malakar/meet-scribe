"use client";
import { useEffect, useState, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, Square, Copy, Download, CheckCircle, Clock,
  Users, Zap, Target, MessageSquare, TrendingUp, AlertCircle, Loader2
} from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button, Card, Badge, Skeleton } from "@/components/ui";
import LiveCaptureController from "@/components/ui/LiveCaptureController";
import { sessionsApi, botApi, WS_URL } from "@/lib/api";
import { useApiSetup } from "@/lib/useApiSetup";
import { useAuth } from "@clerk/nextjs";

interface Session {
  id: string; title?: string; meet_url: string; status: string;
  created_at: string; ended_at?: string; duration_seconds?: number;
  summary?: string; full_transcript?: string; action_items?: string[];
  key_points?: string[]; participants?: string[]; sentiment?: string;
}

function SentimentBar({ value }: { value?: string }) {
  const colors: Record<string, string> = {
    positive: "bg-aurora-cyan", neutral: "bg-white/30",
    negative: "bg-aurora-rose", mixed: "bg-aurora-amber",
  };
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colors[value ?? "neutral"] ?? "bg-white/30"}`} />
      <span className="text-xs font-mono text-white/50 capitalize">{value ?? "neutral"}</span>
    </div>
  );
}

export default function SessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  useApiSetup();
  const { id } = use(params);
  const router = useRouter();
  const { getToken } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [stopping, setStopping] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "transcript" | "chunks">("summary");
  const [chunks, setChunks] = useState<{ id: string; sequence: number; text: string; speaker?: string }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const loadSession = async () => {
    try {
      const res = await sessionsApi.get(id);
      setSession(res.data);
    } catch {
      toast.error("Session not found");
      router.push("/dashboard/sessions");
    } finally {
      setLoading(false);
    }
  };

  // WebSocket for live status updates
  useEffect(() => {
    let ws: WebSocket;

    const connect = async () => {
      const token = await getToken();
      if (!token) return;

      ws = new WebSocket(`${WS_URL}/api/bot/ws/${id}`);
      wsRef.current = ws;

      ws.onopen = () => ws.send(token);
      ws.onmessage = (e) => {
        const data = JSON.parse(e.data);
        if (data.error) return;
        setSession(prev => prev ? {
          ...prev,
          status: data.status,
          title: data.title ?? prev.title,
          summary: data.summary ?? prev.summary,
          sentiment: data.sentiment ?? prev.sentiment,
        } : prev);
        if (["completed", "failed", "stopped"].includes(data.status)) {
          loadSession(); // Reload full session when done
          ws.close();
        }
      };
      ws.onerror = () => ws.close();
    };

    connect();
    loadSession();

    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [id]);

  const handleStop = async () => {
    setStopping(true);
    try {
      await botApi.stop(id);
      toast.success("Bot stopped — generating summary…");
      loadSession();
    } catch {
      toast.error("Failed to stop bot");
    } finally {
      setStopping(false);
    }
  };

  const loadChunks = async () => {
    try {
      const res = await sessionsApi.getChunks(id);
      setChunks(res.data);
    } catch { /* ignore */ }
  };

  const copyTranscript = () => {
    if (session?.full_transcript) {
      navigator.clipboard.writeText(session.full_transcript);
      toast.success("Transcript copied!");
    }
  };

  const downloadSummary = () => {
    if (!session) return;
    const content = `# ${session.title ?? "Meeting Summary"}
Date: ${session.created_at ? format(new Date(session.created_at), "PPP p") : "Unknown"}
Status: ${session.status}
Sentiment: ${session.sentiment ?? "neutral"}

## Summary
${session.summary ?? "Not available"}

## Key Points
${(session.key_points ?? []).map(p => `• ${p}`).join("\n")}

## Action Items
${(session.action_items ?? []).map(a => `☐ ${a}`).join("\n")}

## Participants
${(session.participants ?? []).join(", ")}

## Full Transcript
${session.full_transcript ?? "Not available"}
`;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${session.title ?? "meeting"}-summary.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <DashboardLayout>
      <div className="p-8 max-w-5xl mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    </DashboardLayout>
  );

  if (!session) return null;

  const isLive = ["recording", "joining", "processing"].includes(session.status);
  const tabs = [
    { id: "summary", label: "Summary" },
    { id: "transcript", label: "Transcript" },
    { id: "chunks", label: "Live Feed" },
  ] as const;

  return (
    <DashboardLayout>
      <div className="p-8 max-w-5xl mx-auto">
        {/* Breadcrumb + controls */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-3">
            <Link href="/dashboard/sessions" aria-label="Back to sessions">
              <button
                type="button"
                aria-label="Back to sessions"
                className="text-white/30 hover:text-white/70 transition-colors"
              >
                <ArrowLeft size={20} />
              </button>
            </Link>
            <div>
              <h1 className="font-display font-700 text-2xl text-white">
                {session.title ?? "Untitled Meeting"}
              </h1>
              <p className="text-white/30 text-xs font-mono mt-0.5">
                {session.created_at ? format(new Date(session.created_at), "PPP 'at' p") : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            {isLive && (
              <Button variant="danger" size="sm" loading={stopping} onClick={handleStop}>
                <Square size={12} /> Stop Bot
              </Button>
            )}
            {session.status === "completed" && (
              <>
                <Button variant="ghost" size="sm" onClick={copyTranscript}>
                  <Copy size={14} /> Copy
                </Button>
                <Button variant="ghost" size="sm" onClick={downloadSummary}>
                  <Download size={14} /> Download
                </Button>
              </>
            )}
          </div>
        </motion.div>

        {/* Status bar */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <Card className="mb-6 flex flex-wrap gap-6 items-center">
            <div className="flex items-center gap-3">
              <Badge status={session.status}>{session.status}</Badge>
              {isLive && <span className="text-xs text-aurora-rose font-mono animate-pulse">● LIVE</span>}
            </div>
            {session.duration_seconds && (
              <div className="flex items-center gap-2">
                <Clock size={14} className="text-white/30" />
                <span className="text-xs font-mono text-white/50">
                  {Math.floor(session.duration_seconds / 60)}m {session.duration_seconds % 60}s
                </span>
              </div>
            )}
            {session.sentiment && <SentimentBar value={session.sentiment} />}
            {session.participants && session.participants.length > 0 && (
              <div className="flex items-center gap-2">
                <Users size={14} className="text-white/30" />
                <span className="text-xs font-mono text-white/50">{session.participants.length} participants</span>
              </div>
            )}
          </Card>
        </motion.div>

        {/* Live capture controller — shown while the session is active */}
        {["pending", "joining", "recording"].includes(session.status) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mb-6"
          >
            <LiveCaptureController
              sessionId={session.id}
              meetUrl={session.meet_url}
              onStopped={() => loadSession()}
            />
          </motion.div>
        )}

        {/* Processing state */}
        {session.status === "processing" && (
          <Card className="mb-6 flex items-center gap-4 border-aurora-amber/20">
            <Loader2 size={20} className="text-aurora-amber animate-spin shrink-0" />
            <div>
              <p className="text-sm font-display font-600 text-white">Generating summary…</p>
              <p className="text-xs text-white/40 font-body mt-0.5">
                Gemini is processing your transcript. This takes ~30 seconds.
              </p>
            </div>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 glass rounded-xl w-fit">
          {tabs.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => {
                setActiveTab(t.id);
                if (t.id === "chunks") loadChunks();
              }}
              className={`px-4 py-2 rounded-lg text-sm font-display font-600 transition-all duration-200 ${
                activeTab === t.id
                  ? "bg-plasma/20 text-plasma-300 border border-plasma/30"
                  : "text-white/35 hover:text-white/60"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "summary" && (
          <div className="space-y-5">
            {/* Summary text */}
            <Card>
              <div className="flex items-center gap-2 mb-4">
                <Zap size={16} className="text-plasma-400" />
                <h3 className="font-display font-600 text-white">AI Summary</h3>
              </div>
              {session.summary ? (
                <p className="text-sm text-white/70 font-body leading-relaxed whitespace-pre-wrap">
                  {session.summary}
                </p>
              ) : (
                <p className="text-sm text-white/25 font-body italic">
                  {isLive ? "Summary will appear when the meeting ends." : "No summary available."}
                </p>
              )}
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Key Points */}
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-aurora-cyan" />
                  <h3 className="font-display font-600 text-white">Key Points</h3>
                </div>
                {(session.key_points ?? []).length > 0 ? (
                  <ul className="space-y-2">
                    {session.key_points!.map((p, i) => (
                      <li key={i} className="flex gap-2 text-sm text-white/60 font-body">
                        <span className="text-aurora-cyan mt-0.5 shrink-0">•</span> {p}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-white/25 font-body italic">Not available yet.</p>
                )}
              </Card>

              {/* Action Items */}
              <Card>
                <div className="flex items-center gap-2 mb-4">
                  <Target size={16} className="text-aurora-amber" />
                  <h3 className="font-display font-600 text-white">Action Items</h3>
                </div>
                {(session.action_items ?? []).length > 0 ? (
                  <ul className="space-y-2">
                    {session.action_items!.map((a, i) => (
                      <li key={i} className="flex gap-2 text-sm text-white/60 font-body">
                        <CheckCircle size={14} className="text-aurora-amber mt-0.5 shrink-0" /> {a}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-white/25 font-body italic">No action items found.</p>
                )}
              </Card>

              {/* Participants */}
              {(session.participants ?? []).length > 0 && (
                <Card>
                  <div className="flex items-center gap-2 mb-4">
                    <Users size={16} className="text-aurora-violet" />
                    <h3 className="font-display font-600 text-white">Participants</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {session.participants!.map((p, i) => (
                      <span key={i} className="px-3 py-1 rounded-full text-xs font-mono bg-white/5 border border-white/10 text-white/60">
                        {p}
                      </span>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}

        {activeTab === "transcript" && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-white/40" />
                <h3 className="font-display font-600 text-white">Full Transcript</h3>
              </div>
              {session.full_transcript && (
                <Button variant="ghost" size="sm" onClick={copyTranscript}>
                  <Copy size={12} /> Copy
                </Button>
              )}
            </div>
            {session.full_transcript ? (
              <pre className="text-xs text-white/60 font-mono leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                {session.full_transcript}
              </pre>
            ) : (
              <p className="text-sm text-white/25 font-body italic">
                {isLive ? "Transcript is being captured live…" : "No transcript available."}
              </p>
            )}
          </Card>
        )}

        {activeTab === "chunks" && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-600 text-white">Audio Chunks</h3>
              <span className="text-xs font-mono text-white/30">{chunks.length} chunks</span>
            </div>
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {chunks.length === 0 ? (
                <p className="text-sm text-white/25 font-body italic text-center py-8">
                  No chunks yet. {isLive ? "Recording in progress…" : ""}
                </p>
              ) : (
                chunks.map((c) => (
                  <div key={c.id} className="flex gap-3 p-3 rounded-lg bg-white/3 border border-white/5">
                    <span className="text-xs font-mono text-plasma-400 shrink-0 w-8 text-right">{c.sequence}</span>
                    <div>
                      {c.speaker && <span className="text-xs font-mono text-aurora-cyan mr-2">{c.speaker}:</span>}
                      <span className="text-xs text-white/60 font-body">{c.text || <em className="text-white/25">[silent]</em>}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
