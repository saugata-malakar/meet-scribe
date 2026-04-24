import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Token getter registered by useApiSetup (Clerk's getToken)
let _getToken: (() => Promise<string | null>) | null = null;

export function registerTokenGetter(fn: () => Promise<string | null>) {
  _getToken = fn;
}

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// Inject Clerk token before every request
api.interceptors.request.use(async (config) => {
  if (_getToken) {
    const token = await _getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

export const botApi = {
  launch: (session_id: string, mode?: "browser" | "playwright") =>
    api.post<LaunchBotResponse>("/api/bot/launch", { session_id, mode }),
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
  process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";
