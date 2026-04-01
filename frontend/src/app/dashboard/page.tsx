"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { motion } from "framer-motion";
import {
  Video, Clock, CheckCircle, Zap, Plus, Search, TrendingUp,
  Mic, Brain, ArrowRight
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import toast from "react-hot-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button, Card, StatCard, Badge, Skeleton } from "@/components/ui";
import { useApiSetup } from "@/lib/useApiSetup";
import { sessionsApi } from "@/lib/api";
import NewSessionModal from "@/components/ui/NewSessionModal";

interface Stats { total_sessions: number; completed_sessions: number; total_minutes_recorded: number; }
interface Session {
  id: string; title?: string; meet_url: string; status: string;
  created_at: string; duration_seconds?: number; sentiment?: string; summary?: string;
}

export default function DashboardPage() {
  useApiSetup();
  const { user } = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    try {
      const [statsRes, sessRes] = await Promise.all([
        sessionsApi.stats(),
        sessionsApi.list(1, 5),
      ]);
      setStats(statsRes.data);
      setSessions(sessRes.data);
    } catch {
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const name = user?.firstName || user?.fullName?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <DashboardLayout>
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-10"
        >
          <div>
            <h1 className="font-display font-700 text-3xl text-white">
              {greeting}, {name} 👋
            </h1>
            <p className="text-white/40 text-sm font-body mt-1">
              Here&apos;s what&apos;s happening with your meetings.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/dashboard/sessions">
              <Button variant="ghost" size="sm">
                <Search size={14} /> Search
              </Button>
            </Link>
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus size={14} /> New Session
            </Button>
          </div>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))
          ) : (
            <>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <StatCard label="Total Sessions" value={stats?.total_sessions ?? 0} icon={<Video size={20} />} accent="plasma" />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
                <StatCard label="Completed" value={stats?.completed_sessions ?? 0} icon={<CheckCircle size={20} />} accent="cyan" />
              </motion.div>
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <StatCard label="Minutes Recorded" value={stats?.total_minutes_recorded ?? 0} icon={<Clock size={20} />} accent="violet" />
              </motion.div>
            </>
          )}
        </div>

        {/* Recent sessions + quick start */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Sessions */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="lg:col-span-2"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-600 text-lg text-white">Recent Sessions</h2>
              <Link href="/dashboard/sessions">
                <span className="text-xs text-plasma-300 hover:text-plasma-200 transition-colors font-mono flex items-center gap-1">
                  View all <ArrowRight size={12} />
                </span>
              </Link>
            </div>
            <div className="space-y-3">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)
              ) : sessions.length === 0 ? (
                <Card className="text-center py-12">
                  <Mic size={32} className="text-white/15 mx-auto mb-3" />
                  <p className="text-white/30 text-sm font-body">No sessions yet.</p>
                  <Button size="sm" className="mt-4" onClick={() => setShowModal(true)}>
                    <Plus size={14} /> Launch your first bot
                  </Button>
                </Card>
              ) : (
                sessions.map((s) => (
                  <Link key={s.id} href={`/dashboard/sessions/${s.id}`}>
                    <Card className="hover:border-plasma/30 transition-all duration-200 cursor-pointer group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white/90 group-hover:text-white transition-colors truncate font-body">
                            {s.title || "Untitled Meeting"}
                          </p>
                          <p className="text-xs text-white/30 font-mono mt-0.5 truncate">{s.meet_url}</p>
                          {s.summary && (
                            <p className="text-xs text-white/40 mt-2 line-clamp-2 font-body">{s.summary}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <Badge status={s.status}>{s.status}</Badge>
                          <span className="text-xs text-white/25 font-mono">
                            {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))
              )}
            </div>
          </motion.div>

          {/* Quick start panel */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <h2 className="font-display font-600 text-lg text-white mb-4">Quick Start</h2>
            <Card
              className="border-plasma/20 cursor-pointer hover:border-plasma/40 transition-all duration-300 group"
              glow
              onClick={() => setShowModal(true)}
            >
              <div className="w-12 h-12 rounded-xl bg-plasma/15 border border-plasma/25 flex items-center justify-center mb-5 group-hover:bg-plasma/25 transition-colors">
                <Zap size={22} className="text-plasma-400" />
              </div>
              <h3 className="font-display font-700 text-white text-base mb-2">Launch AI Bot</h3>
              <p className="text-white/35 text-xs font-body leading-relaxed mb-5">
                Paste a Google Meet link and our bot joins, listens, and summarizes — fully automatic.
              </p>
              <Button size="sm" className="w-full">
                <Plus size={14} /> Start New Session
              </Button>
            </Card>

            <Card className="mt-4">
              <div className="flex items-center gap-3 mb-3">
                <Brain size={18} className="text-aurora-violet" />
                <span className="text-sm font-display font-600 text-white">Semantic Search</span>
              </div>
              <p className="text-xs text-white/35 font-body mb-4">
                Search across all your meetings with natural language — powered by Pinecone.
              </p>
              <Link href="/dashboard/sessions?tab=search">
                <Button variant="outline" size="sm" className="w-full">
                  <Search size={14} /> Search Meetings
                </Button>
              </Link>
            </Card>

            <Card className="mt-4">
              <div className="flex items-center gap-3 mb-3">
                <TrendingUp size={18} className="text-aurora-cyan" />
                <span className="text-sm font-display font-600 text-white">Analytics</span>
              </div>
              <div className="space-y-2">
                {[
                  { label: "Avg. meeting length", value: stats && stats.completed_sessions > 0
                    ? `${Math.round((stats.total_minutes_recorded / stats.completed_sessions))} min` : "—" },
                  { label: "Completion rate", value: stats && stats.total_sessions > 0
                    ? `${Math.round((stats.completed_sessions / stats.total_sessions) * 100)}%` : "—" },
                ].map((m) => (
                  <div key={m.label} className="flex justify-between">
                    <span className="text-xs text-white/30 font-body">{m.label}</span>
                    <span className="text-xs text-aurora-cyan font-mono">{m.value}</span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>

      <NewSessionModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => { setShowModal(false); load(); }}
      />
    </DashboardLayout>
  );
}
