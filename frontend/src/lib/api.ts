import axios from "axios";

// Same-origin by default in production: when the frontend + backend are
// served behind a single nginx (the combined Docker image), leave
// NEXT_PUBLIC_API_URL empty and all requests use relative paths ("/api/…").
// Only fall back to localhost during local dev (`npm run dev`) when nothing
// is set.
const RAW_API_URL = process.env.NEXT_PUBLIC_API_URL;
const API_URL =
  RAW_API_URL && RAW_API_URL.trim().length > 0
    ? RAW_API_URL
    : typeof window !== "undefined"
      ? "" // browser: use relative URLs against current origin
      : "http://localhost:8000"; // SSR / build step fallback

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

// If NEXT_PUBLIC_WS_URL isn't set, derive the WS URL from either:
//   1. the configured API URL (if absolute), or
//   2. the current window.location (when API_URL is relative / same-origin).
// This keeps live capture working in all three deployment shapes:
//   - combined Docker image (same origin, wss://same-host)
//   - split deploy with explicit NEXT_PUBLIC_WS_URL
//   - local dev with both services on localhost
function deriveWsUrl(httpUrl: string): string {
  if (!httpUrl || httpUrl.trim().length === 0) {
    if (typeof window !== "undefined") {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}`;
    }
    return "ws://localhost:8000";
  }
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
// In combined-origin mode API_URL is empty string, which makes fetch hit the
// same origin — exactly what we want.
export async function warmBackend(): Promise<void> {
  try {
    await fetch(`${API_URL || ""}/health`, { method: "GET" });
  } catch {
    /* best-effort */
  }
}
