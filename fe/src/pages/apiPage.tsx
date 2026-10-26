// Share the same configured backend URL as the rest of the frontend.
import { API_BASE_URL, getInstallationId } from "@/lib/api";
const API_BASE = API_BASE_URL;

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
  prBaseBranch?: string;
  prMergedAt?: string;
  prMergeCommitSha?: string;
  branch?: string;
  task?: string;
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

let repoCache: { data: Repo[]; fetchedAt: number; installationId: string | null } | null = null;
let repoRequest: { installationId: string | null; promise: Promise<Repo[]> } | null = null;

export const listRepos = (forceRefresh = false): Promise<Repo[]> => {
  const installationId = getInstallationId();
  if (!forceRefresh && repoCache?.installationId === installationId && Date.now() - repoCache.fetchedAt < 30_000) {
    return Promise.resolve(repoCache.data);
  }
  if (!forceRefresh && repoRequest?.installationId === installationId) return repoRequest.promise;
  const pending = request<Repo[]>(ROUTES.repos).then((repos) => {
    repoCache = { data: repos, fetchedAt: Date.now(), installationId };
    return repos;
  });
  repoRequest = { installationId, promise: pending };
  void pending.then(
    () => { if (repoRequest?.promise === pending) repoRequest = null; },
    () => { if (repoRequest?.promise === pending) repoRequest = null; },
  );
  return pending;
};
export const listSessions = () => request<SessionSummary[]>(ROUTES.sessions);
export const getSession = (id: string) => request<SessionSummary>(ROUTES.session(id));

export const createSession = (input: { repoFullName: string; task?: string; issueNumber?: number }) =>
  request<SessionSummary>(ROUTES.createSession, post(input));

export const getRepoConfig = (repoFullName: string) =>
  request<RepoConfig>(`${ROUTES.repoConfig}?repoFullName=${encodeURIComponent(repoFullName)}`);

export const saveRepoConfig = (repoFullName: string, config: RepoConfig) =>
  request<RepoConfig>(ROUTES.repoConfig, post({ repoFullName, ...config }));
