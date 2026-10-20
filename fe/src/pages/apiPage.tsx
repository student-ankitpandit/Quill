// Single place for every backend call. If a path differs from yours, change it in ROUTES only.
const API_BASE: string = (import.meta as any).env?.VITE_API_URL ?? 'http://localhost:3001';

const ROUTES = {
  repos: '/api/github/repos',
  repoConfig: '/api/github/repo/config',
  sessions: '/api/sessions', // GET list
  createSession: '/api/app/sessions',
  session: (id: string) => `/api/sessions/${id}`,
};

export type SessionStatus = 'ready' | 'running' | 'waiting_for_input' | 'done' | 'error' | 'stopped';

export interface Repo {
  full_name: string;
  name?: string;
  private: boolean;
}

export interface LogEntry {
  time: string;
  type: 'info' | 'tool_call' | 'tool_result' | 'error';
  text: string;
}

export interface SessionSummary {
  id: string;
  title: string;
  repoFullName: string;
  status: SessionStatus;
  createdAt: string;
  prUrl?: string;
  logs?: LogEntry[];
}

export interface RepoConfig {
  installCommand?: string;
  buildCommand?: string;
  testCommand?: string;
  runCommand?: string;
  port?: number | string;
  hasUI?: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('quill_token');
  if (!token) return {};
  return { Authorization: token };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...init,
    credentials: 'include',
    headers: {
      ...authHeaders(),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`);
  return body as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export { getInstallUrl as installUrl } from '@/lib/api';

export const listRepos = () => {
  return request<Repo[]>(ROUTES.repos);
};
export const listSessions = () => request<SessionSummary[]>(ROUTES.sessions);
export const getSession = (id: string) => request<SessionSummary>(ROUTES.session(id));

export const createSession = (input: { repoFullName: string; task?: string; issueNumber?: number }) =>
  request<SessionSummary>(ROUTES.createSession, post(input));

export const getRepoConfig = (repoFullName: string) =>
  request<RepoConfig>(`${ROUTES.repoConfig}?repoFullName=${encodeURIComponent(repoFullName)}`);

export const saveRepoConfig = (repoFullName: string, config: RepoConfig) =>
  request<RepoConfig>(ROUTES.repoConfig, post({ repoFullName, ...config }));
