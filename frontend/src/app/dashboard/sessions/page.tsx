"use client";
import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Search, Plus, Filter, Video, Trash2, ExternalLink, RefreshCw
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import Link from "next/link";
import toast from "react-hot-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button, Card, Badge, Skeleton, Input } from "@/components/ui";
import { sessionsApi, searchApi } from "@/lib/api";
import { useApiSetup } from "@/lib/useApiSetup";
import NewSessionModal from "@/components/ui/NewSessionModal";

interface Session {
  id: string; title?: string; meet_url: string; status: string;
  created_at: string; duration_seconds?: number; sentiment?: string; summary?: string;
}

const STATUS_FILTERS = ["all", "completed", "recording", "processing", "pending", "failed"];

export default function SessionsPage() {
  useApiSetup();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Session[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sessionsApi.list(page, 20, statusFilter === "all" ? undefined : statusFilter);
      setSessions(res.data);
    } catch {
      toast.error("Failed to load sessions");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    setSearching(true);
    try {
      const res = await searchApi.search(searchQuery);
      setSearchResults(res.data);
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (!confirm("Delete this session?")) return;
    try {
      await sessionsApi.delete(id);
      toast.success("Session deleted");
      loadSessions();
    } catch {
      toast.error("Delete failed");
    }
  };

  const displaySessions = searchResults ?? sessions;

  return (
    <DashboardLayout>
      <div className="p-8 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="font-display font-700 text-3xl text-white">Sessions</h1>
            <p className="text-white/40 text-sm font-body mt-1">All your recorded meetings.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="ghost" size="sm" onClick={loadSessions}>
              <RefreshCw size={14} />
            </Button>
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus size={14} /> New Session
            </Button>
          </div>
        </motion.div>

        {/* Semantic search bar */}
        <Card className="mb-6">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder='Search meetings… e.g. "Q3 budget discussion" or "action items for sales team"'
                icon={<Search size={14} />}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!e.target.value) setSearchResults(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} loading={searching} variant="outline" size="md">
              Search
            </Button>
          </div>
          {searchResults !== null && (
            <p className="text-xs text-white/35 mt-2 font-mono">
              {searchResults.length} semantic matches for &quot;{searchQuery}&quot; •{" "}
              <button className="text-plasma-300 hover:underline" onClick={() => { setSearchResults(null); setSearchQuery(""); }}>
                clear
              </button>
            </p>
          )}
        </Card>

        {/* Status filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-mono transition-all duration-200 border ${
                statusFilter === s
                  ? "bg-plasma/20 border-plasma/40 text-plasma-300"
                  : "bg-transparent border-white/8 text-white/35 hover:border-white/20 hover:text-white/60"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Sessions grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)
          ) : displaySessions.length === 0 ? (
            <div className="col-span-2">
              <Card className="text-center py-16">
                <Video size={36} className="text-white/10 mx-auto mb-3" />
                <p className="text-white/30 text-sm font-body">
                  {searchResults !== null ? "No matching meetings found." : "No sessions yet."}
                </p>
                {searchResults === null && (
                  <Button size="sm" className="mt-4" onClick={() => setShowModal(true)}>
                    <Plus size={14} /> Start recording
                  </Button>
                )}
              </Card>
            </div>
          ) : (
            displaySessions.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Link href={`/dashboard/sessions/${s.id}`}>
                  <Card className="h-full hover:border-plasma/30 transition-all duration-200 cursor-pointer group relative">
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(s.id, e)}
                      className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-white/20 hover:text-aurora-rose transition-all duration-200"
                    >
                      <Trash2 size={14} />
                    </button>

                    <div className="flex items-start justify-between mb-3 pr-6">
                      <Badge status={s.status}>{s.status}</Badge>
                      {s.sentiment && (
                        <span className={`text-xs font-mono ${
                          s.sentiment === "positive" ? "text-aurora-cyan" :
                          s.sentiment === "negative" ? "text-aurora-rose" : "text-white/30"
                        }`}>
                          {s.sentiment}
                        </span>
                      )}
                    </div>

                    <h3 className="font-display font-600 text-base text-white/90 group-hover:text-white mb-1 transition-colors line-clamp-1">
                      {s.title || "Untitled Meeting"}
                    </h3>

                    {s.summary ? (
                      <p className="text-xs text-white/35 font-body line-clamp-3 mb-4 leading-relaxed">{s.summary}</p>
                    ) : (
                      <p className="text-xs text-white/20 font-mono mb-4 truncate">{s.meet_url}</p>
                    )}

                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-xs text-white/25 font-mono">
                        {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                      </span>
                      {s.duration_seconds && (
                        <span className="text-xs text-white/25 font-mono">
                          {Math.floor(s.duration_seconds / 60)}m {s.duration_seconds % 60}s
                        </span>
                      )}
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))
          )}
        </div>

        {/* Pagination */}
        {!searchResults && sessions.length === 20 && (
          <div className="flex justify-center gap-3 mt-8">
            <Button variant="ghost" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <span className="flex items-center text-xs text-white/30 font-mono px-3">Page {page}</span>
            <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>

      <NewSessionModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreated={() => { setShowModal(false); loadSessions(); }}
      />
    </DashboardLayout>
  );
}
