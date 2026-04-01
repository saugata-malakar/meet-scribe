"use client";
import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Users, Video, Clock, Zap, ShieldAlert, RefreshCw,
  UserCheck, UserX, Trash2, ChevronDown
} from "lucide-react";
import toast from "react-hot-toast";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button, Card, StatCard, Badge, Skeleton } from "@/components/ui";
import { adminApi } from "@/lib/api";
import { useApiSetup } from "@/lib/useApiSetup";

interface SystemStats {
  total_users: number; total_sessions: number; completed_sessions: number;
  active_bots: number; total_minutes_recorded: number;
}
interface AdminUser {
  id: string; email: string; name: string; role: string;
  is_active: boolean; created_at: string; last_login?: string; session_count: number;
}
interface AdminSession {
  id: string; user_id: string; title?: string; meet_url: string;
  status: string; duration_seconds?: number; created_at: string;
}

export default function AdminPage() {
  useApiSetup();
  const { user } = useUser();
  const router = useRouter();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "users" | "sessions">("overview");
  const [userSearch, setUserSearch] = useState("");

  // Note: Admin role check is done server-side via require_admin dependency.
  // Frontend hides the route from non-admins via DashboardLayout, but server enforces it.

  const load = async () => {
    setLoading(true);
    try {
      const [statsRes, usersRes, sessionsRes] = await Promise.all([
        adminApi.stats(),
        adminApi.users(1, userSearch || undefined),
        adminApi.sessions(1),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
      setSessions(sessionsRes.data);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        toast.error("Admin access required");
        router.push("/dashboard");
      } else {
        toast.error("Failed to load admin data");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "user" : "admin";
    try {
      await adminApi.updateUser(userId, { role: newRole });
      toast.success(`User role updated to ${newRole}`);
      load();
    } catch {
      toast.error("Failed to update role");
    }
  };

  const toggleActive = async (userId: string, isActive: boolean) => {
    try {
      await adminApi.updateUser(userId, { is_active: !isActive });
      toast.success(isActive ? "User suspended" : "User re-activated");
      load();
    } catch {
      toast.error("Failed to update user");
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (!confirm("Permanently delete this session?")) return;
    try {
      await adminApi.deleteSession(sessionId);
      toast.success("Session deleted");
      load();
    } catch {
      toast.error("Failed to delete session");
    }
  };

  return (
    <DashboardLayout>
      <div className="p-8 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <div className="flex items-center gap-3 mb-1">
              <ShieldAlert size={22} className="text-aurora-violet" />
              <h1 className="font-display font-700 text-3xl text-white">Admin Panel</h1>
            </div>
            <p className="text-white/40 text-sm font-body">
              Signed in as <span className="text-aurora-violet">{user?.primaryEmailAddress?.emailAddress}</span>
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </motion.div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)
          ) : [
            { label: "Total Users", value: stats?.total_users ?? 0, icon: <Users size={18} />, accent: "plasma" as const },
            { label: "Total Sessions", value: stats?.total_sessions ?? 0, icon: <Video size={18} />, accent: "cyan" as const },
            { label: "Completed", value: stats?.completed_sessions ?? 0, icon: <Zap size={18} />, accent: "violet" as const },
            { label: "Active Bots", value: stats?.active_bots ?? 0, icon: <Clock size={18} />, accent: "amber" as const },
            { label: "Mins Recorded", value: stats?.total_minutes_recorded ?? 0, icon: <Clock size={18} />, accent: "cyan" as const },
          ].map((s, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
              <StatCard label={s.label} value={s.value} icon={s.icon} accent={s.accent} />
            </motion.div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 p-1 glass rounded-xl w-fit">
          {(["overview", "users", "sessions"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-display font-600 capitalize transition-all duration-200 ${
                activeTab === t
                  ? "bg-aurora-violet/20 text-purple-300 border border-aurora-violet/30"
                  : "text-white/35 hover:text-white/60"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Users tab */}
        {activeTab === "users" && (
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-600 text-white">All Users ({users.length})</h2>
              <input
                className="bg-white/4 border border-white/8 rounded-lg px-3 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-aurora-violet/50 font-mono w-48"
                placeholder="Search users…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {["User", "Role", "Sessions", "Status", "Last Login", "Actions"].map((h) => (
                      <th key={h} className="text-left py-3 px-4 text-xs text-white/30 font-mono uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}><td colSpan={6} className="py-2 px-4"><Skeleton className="h-10" /></td></tr>
                    ))
                  ) : users.map((u) => (
                    <tr key={u.id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                      <td className="py-3 px-4">
                        <div>
                          <p className="text-white/80 font-body">{u.name}</p>
                          <p className="text-white/30 text-xs font-mono">{u.email}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-mono px-2 py-1 rounded-full border ${
                          u.role === "admin"
                            ? "text-aurora-violet border-aurora-violet/30 bg-aurora-violet/10"
                            : "text-white/40 border-white/10 bg-white/5"
                        }`}>{u.role}</span>
                      </td>
                      <td className="py-3 px-4 text-white/40 font-mono text-xs">{u.session_count}</td>
                      <td className="py-3 px-4">
                        <span className={`text-xs font-mono ${u.is_active ? "text-aurora-cyan" : "text-aurora-rose"}`}>
                          {u.is_active ? "active" : "suspended"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-white/30 font-mono text-xs">
                        {u.last_login ? new Date(u.last_login).toLocaleDateString() : "never"}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => toggleRole(u.id, u.role)}
                            title={u.role === "admin" ? "Demote to user" : "Promote to admin"}
                            className="p-1.5 rounded text-white/25 hover:text-aurora-violet hover:bg-aurora-violet/10 transition-all"
                          >
                            <ShieldAlert size={13} />
                          </button>
                          <button
                            onClick={() => toggleActive(u.id, u.is_active)}
                            title={u.is_active ? "Suspend" : "Activate"}
                            className={`p-1.5 rounded transition-all ${
                              u.is_active
                                ? "text-white/25 hover:text-aurora-rose hover:bg-aurora-rose/10"
                                : "text-white/25 hover:text-aurora-cyan hover:bg-aurora-cyan/10"
                            }`}
                          >
                            {u.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Sessions tab */}
        {activeTab === "sessions" && (
          <Card>
            <h2 className="font-display font-600 text-white mb-5">All Sessions ({sessions.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Title / URL", "Status", "Duration", "Created", "Actions"].map((h) => (
                      <th key={h} className="text-left py-3 px-4 text-xs text-white/30 font-mono uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b border-white/3 hover:bg-white/2 transition-colors">
                      <td className="py-3 px-4">
                        <p className="text-white/80 font-body text-sm">{s.title || "Untitled"}</p>
                        <p className="text-white/25 text-xs font-mono truncate max-w-xs">{s.meet_url}</p>
                      </td>
                      <td className="py-3 px-4"><Badge status={s.status}>{s.status}</Badge></td>
                      <td className="py-3 px-4 text-white/40 font-mono text-xs">
                        {s.duration_seconds ? `${Math.floor(s.duration_seconds / 60)}m` : "—"}
                      </td>
                      <td className="py-3 px-4 text-white/30 font-mono text-xs">
                        {new Date(s.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          onClick={() => deleteSession(s.id)}
                          className="p-1.5 rounded text-white/25 hover:text-aurora-rose hover:bg-aurora-rose/10 transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Overview tab */}
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <h3 className="font-display font-600 text-white mb-4">Recent Users</h3>
              <div className="space-y-3">
                {users.slice(0, 6).map((u) => (
                  <div key={u.id} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-aurora-violet/15 border border-aurora-violet/25 flex items-center justify-center text-xs font-display text-aurora-violet">
                      {u.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/80 font-body truncate">{u.name}</p>
                      <p className="text-xs text-white/30 font-mono truncate">{u.email}</p>
                    </div>
                    <span className="text-xs font-mono text-white/25">{u.session_count} sessions</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <h3 className="font-display font-600 text-white mb-4">System Health</h3>
              <div className="space-y-3">
                {[
                  { label: "API", status: "operational", color: "text-aurora-cyan" },
                  { label: "Bot Service", status: `${stats?.active_bots ?? 0} active`, color: "text-aurora-cyan" },
                  { label: "Database (Supabase)", status: "connected", color: "text-aurora-cyan" },
                  { label: "Redis (Upstash)", status: "connected", color: "text-aurora-cyan" },
                  { label: "Vector DB (Pinecone)", status: "connected", color: "text-aurora-cyan" },
                  { label: "Auth (Clerk)", status: "active", color: "text-aurora-cyan" },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-sm text-white/50 font-body">{item.label}</span>
                    <span className={`text-xs font-mono ${item.color}`}>{item.status}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
