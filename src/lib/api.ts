import type {
  CallRecord,
  TradeRecord,
  MatchRecord,
  AuditRecord,
  ScorecardRecord,
  PipelineStats,
  LogEntry,
  MailHistoryRecord,
  ReportArchive,
  SystemIntegrations,
  UserProfile,
  FailedJobItem,
  TradePreOrdersSummary,
  WorkspaceParameter,
  WorkspaceInfo,
} from '../types';

export const AUTH_TOKEN_KEY = 'auditeq_auth_token';
export const ACTIVE_DB_KEY = 'auditeq_active_db';

export function getStoredToken(): string | null {
  return (
    localStorage.getItem(AUTH_TOKEN_KEY) ||
    localStorage.getItem('token') ||
    localStorage.getItem('auditeq_session_token') ||
    localStorage.getItem('auditeq_token') ||
    sessionStorage.getItem('auditeq_token')
  );
}

export function setStoredToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem('token', token);
  localStorage.setItem('auditeq_session_token', token);
  localStorage.setItem('auditeq_token', token);
}

export function clearStoredToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem('token');
  localStorage.removeItem('auditeq_session_token');
  localStorage.removeItem('auditeq_token');
  sessionStorage.removeItem('auditeq_token');
}

export const ACTIVE_WORKSPACE_KEY = 'auditeq_active_workspace';

export function getStoredDatabase(): string | null {
  return localStorage.getItem(ACTIVE_DB_KEY);
}

export function setStoredDatabase(dbName: string) {
  localStorage.setItem(ACTIVE_DB_KEY, dbName);
}

export function getStoredWorkspace(): string | null {
  return localStorage.getItem(ACTIVE_WORKSPACE_KEY);
}

export function setStoredWorkspace(wsId: string) {
  localStorage.setItem(ACTIVE_WORKSPACE_KEY, wsId);
  localStorage.setItem(ACTIVE_DB_KEY, wsId);
}

export function getApiBaseUrl(): string {
  // 1. Explicit environment variable set at build or runtime
  const envUrl = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_BACKEND_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  // 2. Window global if injected by Cloudflare HTML / server
  if (typeof window !== 'undefined' && (window as any).__ADAM_API_URL__) {
    return String((window as any).__ADAM_API_URL__).trim().replace(/\/+$/, '');
  }
  // 3. User configured backend host in localStorage
  if (typeof window !== 'undefined') {
    const custom = localStorage.getItem('adam_api_url') || localStorage.getItem('auditeq_api_url');
    if (custom && custom.trim()) {
      return custom.trim().replace(/\/+$/, '');
    }
  }
  // 4. Default to same origin (relative)
  return '';
}

export function setApiBaseUrl(url: string) {
  if (typeof window !== 'undefined') {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean) {
      localStorage.setItem('adam_api_url', clean);
    } else {
      localStorage.removeItem('adam_api_url');
      localStorage.removeItem('auditeq_api_url');
    }
  }
}

export function getApiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return base ? `${base}${cleanEndpoint}` : cleanEndpoint;
}

export async function safeParseJsonResponse<T = any>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text || text.trim().length === 0) {
    if (!response.ok) {
      if (response.status === 405) {
        throw new Error(
          `Backend server not reachable at this address (HTTP 405 Method Not Allowed). The frontend is hosted statically without a live backend connection. Please click "Configure Backend Server URL" below to enter your active Node.js server address (or configure BACKEND_URL in Cloudflare).`
        );
      }
      throw new Error(`Server returned HTTP ${response.status} (${response.statusText || 'Empty Response'}). Backend server may be offline or unreachable.`);
    }
    return {} as T;
  }

  // Check if response is HTML (e.g. Cloudflare error page, 404, or SPA fallback index.html)
  const trimmed = text.trim();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<head')) {
    if (response.status === 405) {
      throw new Error(
        `Backend server not reachable at this address (HTTP 405 Method Not Allowed). The frontend is hosted statically without a live backend connection. Please click "Configure Backend Server URL" below to enter your active Node.js server address (or configure BACKEND_URL in Cloudflare).`
      );
    }
    if (response.status === 404) {
      throw new Error(`Backend API endpoint not found (HTTP 404). If deploying frontend on Cloudflare Pages/Workers, please set your Backend Server URL.`);
    }
    if (response.status === 502 || response.status === 521 || response.status === 522 || response.status === 524) {
      throw new Error(`Cloudflare Gateway Error (HTTP ${response.status}): The backend Node.js server is offline or unreachable.`);
    }
    throw new Error(`Server returned HTML instead of JSON (HTTP ${response.status}). The requested API route may not be responding.`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON response from server (HTTP ${response.status}): ${text.slice(0, 150)}`);
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const activeDb = getStoredDatabase();
  const activeWs = getStoredWorkspace();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('X-AuditEQ-Token', token);
  }

  if (activeWs) {
    headers.set('X-AuditEQ-Workspace', activeWs);
    headers.set('X-AuditEQ-Database', activeWs);
  } else if (activeDb) {
    headers.set('X-AuditEQ-Database', activeDb);
  }

  const url = getApiUrl(endpoint);
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (netErr: any) {
    throw new Error(`Network Error: Unable to connect to ${url}. ${netErr?.message || 'Check your internet connection or backend server status.'}`);
  }

  const data = await safeParseJsonResponse<any>(response);

  if (response.status === 401) {
    const error = new Error(data.error || 'Authentication required');
    (error as any).status = 401;
    throw error;
  }

  if (!response.ok) {
    throw new Error(data.error || data.message || `HTTP ${response.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  verifySession: () => apiRequest<{ ok: boolean; authenticated: boolean; user: UserProfile; token?: string }>('/api/auth/verify'),
  updateProfile: (data: { full_name?: string; email?: string }) =>
    apiRequest<{ ok: boolean; user: UserProfile }>('/api/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  login: (credentials: { username: string; password: string }) =>
    apiRequest<{ ok: boolean; authenticated: boolean; token: string; user: UserProfile }>('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    }),
  signup: (userData: { username: string; password: string; email?: string; full_name?: string; role?: string }) =>
    apiRequest<{ ok: boolean; authenticated: boolean; token: string; user: UserProfile }>('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    }),
  logout: () =>
    apiRequest<{ ok: boolean; message: string }>('/api/auth/logout', {
      method: 'POST',
    }),
  getUsers: () => apiRequest<UserProfile[]>('/api/auth/users'),

  // Data endpoints
  getStats: () => apiRequest<PipelineStats>('/api/stats'),
  getCalls: (perPage = 500) => apiRequest<CallRecord[]>(`/api/calls?per_page=${perPage}`),
  getCall: (id: number) => apiRequest<CallRecord & { segments?: any[]; orders?: any[]; executions?: any[] }>(`/api/calls/${id}`),
  getTrades: (perPage = 500) => apiRequest<TradeRecord[]>(`/api/trades?per_page=${perPage}`),
  getPreOrdersSummary: () =>
    apiRequest<{ ok: boolean; summary: TradePreOrdersSummary }>('/api/trades/pre-orders-summary'),
  matchPreOrdersWithCalls: () =>
    apiRequest<{ ok: boolean; summary: TradePreOrdersSummary; message: string }>('/api/trades/match-pre-orders-with-calls', {
      method: 'POST',
    }),
  deleteTradesPermanently: () =>
    apiRequest<{ ok: boolean; message: string; deletedCount: number }>('/api/trades/delete-all', {
      method: 'POST',
    }),
  getMatches: (perPage = 300) => apiRequest<MatchRecord[]>(`/api/matches?per_page=${perPage}`),
  getAudits: (perPage = 300) => apiRequest<AuditRecord[]>(`/api/audits?per_page=${perPage}`),
  getScorecards: (perPage = 300) => apiRequest<ScorecardRecord[]>(`/api/scorecards?per_page=${perPage}`),
  getAdvisors: () => apiRequest<string[]>('/api/scorecards/advisors'),
  getMailHistory: (perPage = 100) => apiRequest<MailHistoryRecord[]>(`/api/mail-history?per_page=${perPage}`),
  getArchives: () => apiRequest<ReportArchive[]>('/api/reports/archives'),
  getIntegrations: () => apiRequest<SystemIntegrations>('/api/integrations'),
  saveIntegrations: (settings: Record<string, string>) =>
    apiRequest<{ ok: boolean; message: string }>('/api/integrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    }),
  testGroq: (key?: string) =>
    apiRequest<{ ok: boolean; message?: string; error?: string }>('/api/integrations/test-groq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groq_key: key }),
    }),
  testGemini: (key?: string) =>
    apiRequest<{ ok: boolean; message?: string; error?: string; latency_ms?: number }>('/api/integrations/test-gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gemini_key: key }),
    }),
  checkPipelineConnection: () =>
    apiRequest<{
      ok: boolean;
      timestamp: string;
      checks: Record<string, { status: 'healthy' | 'warning' | 'error'; message: string; latency_ms?: number }>;
    }>('/api/pipeline/connection-check'),
  getDiagnostics: () => apiRequest<any>('/api/diagnostics'),
  getLogs: (perPage = 100) => apiRequest<LogEntry[]>(`/api/logs?per_page=${perPage}`),

  // Operations
  uploadCalls: (formData: FormData) =>
    apiRequest<{ ok: boolean; imported: number; message: string }>('/api/imports/calls', {
      method: 'POST',
      body: formData,
    }),
  uploadTrades: (file: File) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return apiRequest<{ ok: boolean; imported: number; message: string }>('/api/imports/trades', {
      method: 'POST',
      body: formData,
    });
  },
  uploadClientMaster: (file: File) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return apiRequest<{
      ok: boolean;
      batch_id: string;
      source_type: string;
      accepted_rows: number;
      rejected_rows: number;
      duplicates: number;
      errors: string[];
      message: string;
    }>('/api/imports/clients', {
      method: 'POST',
      body: formData,
    });
  },
  uploadAdvisorMaster: (file: File) => {
    const formData = new FormData();
    formData.append('file', file, file.name);
    return apiRequest<{
      ok: boolean;
      batch_id: string;
      source_type: string;
      accepted_rows: number;
      rejected_rows: number;
      duplicates: number;
      errors: string[];
      message: string;
    }>('/api/imports/advisors', {
      method: 'POST',
      body: formData,
    });
  },
  getFunnelMetrics: () =>
    apiRequest<{
      ok: boolean;
      funnel: {
        uploaded: number;
        eligible: number;
        pre_order_selected: number;
        trade_matched: number;
        transcribing: number;
        transcribed: number;
        auditing: number;
        audited: number;
        scored: number;
        completed: number;
        remaining: number;
        retryable: number;
        recoverable_exceptions: number;
        terminal_failures: number;
      };
    }>('/api/pipeline/funnel-metrics'),
  getReleaseReadiness: () =>
    apiRequest<{
      ok: boolean;
      summary: {
        total_decisions: number;
        locked: number;
        proposed: number;
        open: number;
        can_run_production: boolean;
        active_rule_set: string;
        unresolved_blockers: Array<{ id: string; title: string; current_status: string; reason: string }>;
      };
      rule_set: {
        id: string;
        version: string;
        is_active: boolean;
        parameters: Record<string, any>;
      };
    }>('/api/release-readiness'),
  lockDecision: (decisionId: string, value: any) =>
    apiRequest<{ ok: boolean; decision: any; message: string }>(`/api/rule-sets/decisions/${decisionId}/lock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    }),
  combineSplitTrades: () =>
    apiRequest<{ ok: boolean; combined_groups: number; merged_rows: number; message: string }>(
      '/api/trades/combine-splits',
      { method: 'POST' }
    ),
  forceAudit: (callId: number) =>
    apiRequest<{ ok: boolean; audit: AuditRecord; scorecard: ScorecardRecord }>(`/api/calls/${callId}/force-audit`, {
      method: 'POST',
    }),
  runAllAudits: () =>
    apiRequest<{ ok: boolean; audited: number; total_calls: number; message: string }>('/api/audits/run-all', {
      method: 'POST',
    }),
  runMatching: () =>
    apiRequest<{ ok: boolean; matching: { matched_count: number; message: string } }>('/api/matching/run', {
      method: 'POST',
    }),
  startPipeline: () =>
    apiRequest<{ ok: boolean; message: string }>('/api/pipeline/start', {
      method: 'POST',
    }),
  getFailedJobs: () => apiRequest<FailedJobItem[]>('/api/jobs/failed'),
  retryJob: (jobId: number) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/jobs/${jobId}/retry`, {
      method: 'POST',
    }),
  retryAllFailedJobs: () =>
    apiRequest<{ ok: boolean; retried: number; message: string }>('/api/jobs/retry-all', {
      method: 'POST',
    }),
  reviewAudit: (auditId: number, reviewData: any) =>
    apiRequest<{ ok: boolean; audit: AuditRecord; scorecard: ScorecardRecord }>(`/api/audits/${auditId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewData),
    }),
  sendScorecard: (scorecardId: number, to?: string) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/scorecards/${scorecardId}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to }),
    }),
  updateScorecard: (scorecardId: number, updateData: Partial<ScorecardRecord> & { phone?: string; audit_date?: string; feedback?: string }) =>
    apiRequest<{ ok: boolean; scorecard: ScorecardRecord; message: string }>(`/api/scorecards/${scorecardId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updateData),
    }),
  bulkUpdateScorecards: (updates: Array<{ id: number; data: any }>) =>
    apiRequest<{ ok: boolean; count: number; message: string }>('/api/scorecards/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    }),
  overrideCallCompliance: (
    callId: number,
    data: {
      q1_status?: string;
      q2_status?: string;
      q3_status?: string;
      q4_status?: string;
      q5_status?: string;
      audit_comment?: string;
    }
  ) =>
    apiRequest<{ ok: boolean; scorecard: ScorecardRecord; call?: any; message: string }>(
      `/api/calls/${callId}/override-compliance`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    ),
  deleteScorecard: (id: number) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/scorecards/${id}`, {
      method: 'DELETE',
    }),
  createScorecard: (data: any) =>
    apiRequest<{ ok: boolean; id: number; message: string }>('/api/scorecards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateCall: (id: number, data: Partial<CallRecord>) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/calls/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  reclassifyCall: (id: number, type: 'pre_order' | 'regular' | 'scrap') =>
    apiRequest<{ ok: boolean; message: string; call?: any }>(`/api/calls/${id}/reclassify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    }),
  bulkReclassifyCalls: (ids: number[], type: 'pre_order' | 'regular' | 'scrap') =>
    apiRequest<{ ok: boolean; updated: number; message: string }>('/api/calls/bulk-reclassify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, type }),
    }),
  reclassifyAllCalls: () =>
    apiRequest<{ ok: boolean; updated: number; message: string }>('/api/calls/classify-all', {
      method: 'POST',
    }),
  downloadCallsZipUrl: (type = 'all', search = '', advisor = '', ids?: number[]) => {
    const params = new URLSearchParams();
    if (ids && ids.length > 0) {
      params.append('ids', ids.join(','));
    } else if (type) {
      params.append('type', type);
    }
    if (search) params.append('search', search);
    if (advisor && advisor !== 'ALL') params.append('advisor', advisor);
    const token = getStoredToken();
    if (token) params.append('token', token);
    return `/api/calls/download-zip?${params.toString()}`;
  },
  downloadCallsCsvUrl: (type = 'pre_order', search = '', advisor = '', ids?: number[]) => {
    const params = new URLSearchParams();
    if (ids && ids.length > 0) {
      params.append('ids', ids.join(','));
    } else if (type) {
      params.append('type', type);
    }
    if (search) params.append('search', search);
    if (advisor && advisor !== 'ALL') params.append('advisor', advisor);
    const token = getStoredToken();
    if (token) params.append('token', token);
    return `/api/calls/export-csv?${params.toString()}`;
  },
  getAnalytics: () => apiRequest<any>('/api/reports/analytics'),
  bulkSendScorecards: (options: {
    advisor: string;
    from_date?: string;
    to_date?: string;
    subject?: string;
    to?: string;
    cc?: string;
    marker_filter?: string;
  }) =>
    apiRequest<{ ok: boolean; sent_count: number; recipient: string; subject: string; message: string }>('/api/scorecards/bulk-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }),
  testSmtpConnection: (config?: { host?: string; port?: number; user?: string; pass?: string; secure?: boolean }) =>
    apiRequest<{ ok: boolean; message: string }>('/api/mail/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || {}),
    }),
  sendTestEmail: (options: { to: string; host?: string; port?: number; user?: string; pass?: string; from?: string; secure?: boolean }) =>
    apiRequest<{ ok: boolean; message: string; messageId: string; response?: string }>('/api/mail/send-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }),
  archivePeriod: (label?: string) =>
    apiRequest<{ ok: boolean; archive_key: string; bundle_hash: string; message: string }>('/api/maintenance/archive-clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label }),
    }),
  permanentClear: () =>
    apiRequest<{ ok: boolean; message: string }>('/api/maintenance/permanent-clear', {
      method: 'POST',
    }),
  getTataStatus: () =>
    apiRequest<{ configured: boolean; account_id: string; api_url: string; message: string }>('/api/tata/status'),
  testTata: (config?: { api_key?: string; account_id?: string; api_url?: string }) =>
    apiRequest<{ ok: boolean; message?: string; error?: string }>('/api/tata/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config || {}),
    }),
  syncTata: (params?: { from_date?: string; to_date?: string; limit?: number; api_key?: string; account_id?: string; api_url?: string }) =>
    apiRequest<{ ok: boolean; synced_count: number; total_fetched: number; message: string }>('/api/tata/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    }),
  simulateTataWebhook: (payload?: { client_number?: string; agent_name?: string; duration?: number }) =>
    apiRequest<{ ok: boolean; message: string; call_id: number; is_scrap: boolean }>('/api/tata/simulate-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    }),
  sendChatMessage: (query: string, mode: 'internal' | 'general' = 'internal') =>
    apiRequest<{ ok: boolean; answer: string; mode?: string; error?: string }>('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, mode }),
    }),
  deleteCall: (id: number) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/calls/${id}`, { method: 'DELETE' }),
  bulkDeleteCalls: (options: { ids?: number[]; type?: string }) =>
    apiRequest<{ ok: boolean; count: number; message: string }>('/api/calls/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options),
    }),
  getAdminUsers: () =>
    apiRequest<Array<{ id: number; username: string; email: string; full_name: string; role: string; created_at: string }>>('/api/admin/users'),
  createAdminUser: (data: { email: string; password: string; full_name?: string; role?: string }) =>
    apiRequest<{ ok: boolean; user: any }>('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateUserPassword: (id: number, password: string) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/admin/users/${id}/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    }),
  deleteAdminUser: (id: number) =>
    apiRequest<{ ok: boolean; message: string }>(`/api/admin/users/${id}`, { method: 'DELETE' }),
  clearAllDatabase: () =>
    apiRequest<{ ok: boolean; message: string; archived_snapshot?: boolean; cleared_counts?: any }>('/api/admin/clear-database', { method: 'POST' }),
  getClearedBackups: () =>
    apiRequest<{ ok: boolean; backups: any[] }>('/api/admin/cleared-backups'),
  getClearedBackupDownloadUrl: (id: number) => {
    const token = getStoredToken();
    return `/api/admin/cleared-backups/${id}/download?token=${encodeURIComponent(token || '')}`;
  },

  // Databases (Multi-User Database Management)
  getDatabases: () =>
    apiRequest<{ ok: boolean; databases: any[]; current_database: string }>('/api/databases'),
  createDatabase: (data: { name: string; display_name?: string }) =>
    apiRequest<{ ok: boolean; database: string; message: string }>('/api/databases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  switchDatabase: (database: string) =>
    apiRequest<{ ok: boolean; active_database: string; message: string }>('/api/databases/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ database }),
    }),

  // Manual Trade Audit (Missing Call / Mail Confirmation)
  getMissingCallTrades: () =>
    apiRequest<{ ok: boolean; missing_trades: any[] }>('/api/trades/missing-calls'),
  manualAuditTrade: (tradeId: number, data: any) =>
    apiRequest<{ ok: boolean; scorecard_id: number; audit_id: number; message: string }>(
      `/api/trades/${tradeId}/manual-audit`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }
    ),
  bulkManualAuditTrades: (audits: any[]) =>
    apiRequest<{ ok: boolean; count: number; message: string }>('/api/trades/bulk-manual-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audits }),
    }),
  uploadMailConfirmations: (formData: FormData) =>
    apiRequest<{
      ok: boolean;
      summary: {
        filesProcessed: number;
        matchedCount: number;
        unmatchedCount: number;
        matches: Array<{
          tradeId: number;
          symbol: string;
          quantity: number;
          price: number;
          advisor: string;
          client: string;
          fileName: string;
          matchedBy: string;
          isCmp: boolean;
          scorecardId: number;
          auditId: number;
        }>;
        unmatchedFiles: string[];
        errorFiles: Array<{ fileName: string; error: string }>;
      };
      message: string;
    }>('/api/trades/upload-mail-confirmations', {
      method: 'POST',
      body: formData,
    }),
  autoResolveReviews: () =>
    apiRequest<{ ok: boolean; resolvedCount: number; message: string }>('/api/pipeline/auto-resolve-reviews', {
      method: 'POST',
    }),

  // TataTele Column Y Auto-Downloader
  getDownloadStatus: () =>
    apiRequest<{
      ok: boolean;
      isDownloading: boolean;
      total: number;
      completed: number;
      failed: number;
      currentCallId?: string;
      errors: Array<{ callId: string; error: string }>;
      lastUpdated: string;
    }>('/api/calls/download-status'),
  startDownloadRecordings: () =>
    apiRequest<{ ok: boolean; message: string; progress: any }>('/api/calls/download-recordings', {
      method: 'POST',
    }),
  cancelDownloadRecordings: () =>
    apiRequest<{ ok: boolean; message: string }>('/api/calls/download-cancel', {
      method: 'POST',
    }),

  // Gemini Multi-Key Pool (1 to 20 Keys)
  getGeminiPoolStatus: () =>
    apiRequest<{
      ok: boolean;
      totalKeys: number;
      activeKeys: number;
      cooldownKeys: number;
      exhaustedKeys: number;
      requestsHandled: number;
      keys: Array<{ index: number; maskedKey: string; isCooldown: boolean; cooldownRemainingMs: number }>;
    }>('/api/gemini/pool-status'),
  saveGeminiKeys: (keys: string[]) =>
    apiRequest<{ ok: boolean; message: string; totalKeys: number }>('/api/gemini/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys }),
    }),

  // Pre-Order Finding & 5-Point AI Audit Pipeline
  runPreOrderAudit: () =>
    apiRequest<{
      ok: boolean;
      tradesProcessed: number;
      matchedPreOrders: number;
      mailConfirmations: number;
      unmatched: number;
      auditedScorecards: number;
      message: string;
    }>('/api/preorder/find-and-audit', {
      method: 'POST',
    }),
  getPreOrderResults: () =>
    apiRequest<{ ok: boolean; trades: any[] }>('/api/preorder/results'),

  // SEBI Audit Certificate PDF Export
  getSebiAuditPdfUrl: (id: number) => {
    const token = getStoredToken();
    const activeDb = getStoredDatabase();
    const params = new URLSearchParams();
    if (token) params.append('token', token);
    if (activeDb) params.append('db', activeDb);
    const qs = params.toString();
    return `/api/reports/sebi-audit-pdf/${id}${qs ? `?${qs}` : ''}`;
  },

  // Complete Server Data Reset & Purge
  resetAllServerData: () =>
    apiRequest<{ ok: boolean; message: string }>('/api/system/reset-all-data', {
      method: 'POST',
    }),

  // Workspaces & Parameter Hub (Up to 50 Parameters)
  getWorkspaces: () =>
    apiRequest<{ ok: boolean; current_workspace: string; workspaces: WorkspaceInfo[] }>('/api/workspaces'),
  getCurrentWorkspace: () =>
    apiRequest<{ ok: boolean; workspace: WorkspaceInfo }>('/api/workspace/current'),
  getWorkspaceParameters: () =>
    apiRequest<{ ok: boolean; workspace_id: string; count: number; max_limit: number; parameters: WorkspaceParameter[] }>('/api/workspace/parameters'),
  createWorkspaceParameter: (param: Partial<WorkspaceParameter>) =>
    apiRequest<{ ok: boolean; parameter: WorkspaceParameter; error?: string }>('/api/workspace/parameters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(param),
    }),
  updateWorkspaceParameter: (id: number, param: Partial<WorkspaceParameter>) =>
    apiRequest<{ ok: boolean; parameter: WorkspaceParameter; error?: string }>(`/api/workspace/parameters/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(param),
    }),
  deleteWorkspaceParameter: (id: number) =>
    apiRequest<{ ok: boolean; error?: string }>(`/api/workspace/parameters/${id}`, {
      method: 'DELETE',
    }),
  bulkSaveWorkspaceParameters: (parameters: Partial<WorkspaceParameter>[]) =>
    apiRequest<{ ok: boolean; count: number; error?: string }>('/api/workspace/parameters/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parameters }),
    }),
  resetWorkspaceParameters: () =>
    apiRequest<{ ok: boolean; parameters: WorkspaceParameter[]; error?: string }>('/api/workspace/parameters/reset', {
      method: 'POST',
    }),
};
