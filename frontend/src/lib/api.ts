import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Token getter registered by useApiSetup (Clerk's getToken)
let _getToken: (() => Promise<string | null>) | null = null;

export function registerTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

// Render free tier cold starts can take 40-60s. Give the backend room to wake
// up before axios gives up with "timeout of 30000 ms exceeded". Most calls
// finish in under a second; this ceiling only matters after idle periods.
export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 90000,
});

// Inject Clerk token before every request
api.interceptors.request.use(async (config) => {
  if (_getToken) {
    const token = await _getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If NEXT_PUBLIC_WS_URL isn't set, derive the WS URL from the HTTP API URL so
// production deployments don't default to ws://localhost:8000 (which would
// make live capture silently fail).
function deriveWsUrl(httpUrl: string): string {
  try {
    const u = new URL(httpUrl);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString().replace(/\/$/, "");
  } catch {
    return "ws://localhost:8000";
  }
}

// Sessions
export const sessionsApi = {
  create: (meet_url: string, title?: string) =>
    api.post("/api/sessions", { meet_url, title }),
  list: (page = 1, limit = 10, status?: string) =>
    api.get("/api/sessions", { params: { page, limit, status } }),
  get: (id: string) => api.get(`/api/sessions/${id}`),
  getChunks: (id: string) => api.get(`/api/sessions/${id}/chunks`),
  delete: (id: string) => api.delete(`/api/sessions/${id}`),
  stats: () => api.get("/api/sessions/stats/summary"),
};

// Bot
export interface LaunchBotResponse {
  mode: "browser" | "playwright";
  session_id: string;
  ws_path?: string;
  meet_url?: string;
  already_active?: boolean;
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

export const botApi = {
  launch: (
    session_id: string,
    opts?: { mode?: "browser" | "playwright"; config?: ScribeConfig }
  ) =>
    api.post<LaunchBotResponse>("/api/bot/launch", {
      session_id,
      mode: opts?.mode,
      config: opts?.config,
    }),
  stop: (session_id: string) => api.post("/api/bot/stop", { session_id }),
};

// Admin
export const adminApi = {
  stats: () => api.get("/api/admin/stats"),
  users: (page = 1, search?: string) =>
    api.get("/api/admin/users", { params: { page, search } }),
  updateUser: (id: string, data: { role?: string; is_active?: boolean }) =>
    api.patch(`/api/admin/users/${id}`, data),
  sessions: (page = 1, status?: string) =>
    api.get("/api/admin/sessions", { params: { page, status } }),
  deleteSession: (id: string) => api.delete(`/api/admin/sessions/${id}`),
};

// Semantic search
export const searchApi = {
  search: (q: string, limit = 10) =>
    api.get("/api/search", { params: { q, limit } }),
};

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || deriveWsUrl(API_URL);

// Warm the backend (wake Render's free-tier dyno) so the next real call
// doesn't hit a cold-start timeout. Safe to call on dashboard mount.
export async function warmBackend(): Promise<void> {
  try {
    await fetch(`${API_URL}/health`, { method: "GET", mode: "cors" });
  } catch {
    /* best-effort */
  }
}
