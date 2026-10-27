import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { CallsView } from './components/CallsView';
import { AuthModal } from './components/AuthModal';
import { LoginScreen, type WorkspaceAccount } from './components/LoginScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AudioPlayerProvider } from './components/GlobalAudioPlayer';
import { SendScorecardModal } from './components/SendScorecardModal';
import { VoiceAssistant } from './components/VoiceAssistant';
import { AdamLandingPage } from './components/AdamLandingPage';
import { CyberBackground } from './components/CyberBackground';
import { LiveTelemetryTicker } from './components/LiveTelemetryTicker';

// Route Code-Splitting: Lazy chunking for secondary views
const TradesView = lazy(() => import('./components/TradesView').then((m) => ({ default: m.TradesView })));
const MatchingView = lazy(() => import('./components/MatchingView').then((m) => ({ default: m.MatchingView })));
const AuditView = lazy(() => import('./components/AuditView').then((m) => ({ default: m.AuditView })));
const PipelineView = lazy(() => import('./components/PipelineView').then((m) => ({ default: m.PipelineView })));
const AuditedMasterView = lazy(() => import('./components/AuditedMasterView').then((m) => ({ default: m.AuditedMasterView })));
const ManualTradeAuditView = lazy(() => import('./components/ManualTradeAuditView').then((m) => ({ default: m.ManualTradeAuditView })));
const ScorecardsView = lazy(() => import('./components/ScorecardsView').then((m) => ({ default: m.ScorecardsView })));
const MailView = lazy(() => import('./components/MailView').then((m) => ({ default: m.MailView })));
const ReportsView = lazy(() => import('./components/ReportsView').then((m) => ({ default: m.ReportsView })));
const IntegrationsView = lazy(() => import('./components/IntegrationsView').then((m) => ({ default: m.IntegrationsView })));
const TataView = lazy(() => import('./components/TataView').then((m) => ({ default: m.TataView })));
const DiagnosticsView = lazy(() => import('./components/DiagnosticsView').then((m) => ({ default: m.DiagnosticsView })));
const LogsView = lazy(() => import('./components/LogsView').then((m) => ({ default: m.LogsView })));
const MaintenanceView = lazy(() => import('./components/MaintenanceView').then((m) => ({ default: m.MaintenanceView })));
const AdminView = lazy(() => import('./components/AdminView').then((m) => ({ default: m.AdminView })));
const ReleaseReadinessView = lazy(() => import('./components/ReleaseReadinessView').then((m) => ({ default: m.ReleaseReadinessView })));
const IngestionWorkspace = lazy(() => import('./components/IngestionWorkspace').then((m) => ({ default: m.IngestionWorkspace })));
const WorkspaceParametersView = lazy(() => import('./components/WorkspaceParametersView').then((m) => ({ default: m.WorkspaceParametersView })));
import { api, clearStoredToken, getStoredToken, setStoredToken, setStoredWorkspace } from './lib/api';

import type {
  ActiveTab,
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
  TradePreOrdersSummary,
} from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type?: 'success' | 'error' } | null>(null);
  const [isGlobalSendModalOpen, setIsGlobalSendModalOpen] = useState(false);
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState(false);

  // Core Data State
  const [stats, setStats] = useState<PipelineStats | null>(null);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [audits, setAudits] = useState<AuditRecord[]>([]);
  const [scorecards, setScorecards] = useState<ScorecardRecord[]>([]);
  const [advisors, setAdvisors] = useState<string[]>([]);
  const [mailHistory, setMailHistory] = useState<MailHistoryRecord[]>([]);
  const [archives, setArchives] = useState<ReportArchive[]>([]);
  const [integrations, setIntegrations] = useState<SystemIntegrations | null>(null);
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [preOrdersSummary, setPreOrdersSummary] = useState<TradePreOrdersSummary | null>(null);

  // User-selected date filter (defaults to 'All Dates' so uploaded calls are never hidden)
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('All Dates');

  const effectiveDateRange = useMemo(() => {
    if (selectedDateFilter && selectedDateFilter !== 'all' && selectedDateFilter !== 'All Dates') {
      return selectedDateFilter;
    }
    return 'All Dates';
  }, [selectedDateFilter]);

  // Auth State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [showAuthGate, setShowAuthGate] = useState(false);

  const isFetchingRef = useRef(false);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const verifyUserSession = useCallback(async () => {
    try {
      const res = await api.verifySession();
      if (res.ok && res.user) {
        if (res.token) {
          setStoredToken(res.token);
        }
        if (res.user.workspace_id) {
          setStoredWorkspace(res.user.workspace_id);
        }
        setCurrentUser(res.user);
      } else {
        clearStoredToken();
        setCurrentUser(null);
      }
    } catch (err: any) {
      if (err?.status === 401) {
        clearStoredToken();
        setCurrentUser(null);
      } else {
        console.warn('[AuditEQ Session] Network or server busy during session check; session retained.');
      }
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const [
        statsRes,
        callsRes,
        tradesRes,
        matchesRes,
        auditsRes,
        scorecardsRes,
        advisorsRes,
        mailRes,
        archivesRes,
        integrationsRes,
        diagRes,
        logsRes,
        preOrdersRes,
      ] = await Promise.allSettled([
        api.getStats(),
        api.getCalls(500),
        api.getTrades(500),
        api.getMatches(300),
        api.getAudits(300),
        api.getScorecards(300),
        api.getAdvisors(),
        api.getMailHistory(100),
        api.getArchives(),
        api.getIntegrations(),
        api.getDiagnostics(),
        api.getLogs(100),
        api.getPreOrdersSummary(),
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value);
      } else {
        setStats(null);
      }
      if (callsRes.status === 'fulfilled' && Array.isArray(callsRes.value)) {
        setCalls(callsRes.value);
      } else if (callsRes.status === 'rejected') {
        setCalls([]);
      }
      if (tradesRes.status === 'fulfilled' && Array.isArray(tradesRes.value)) {
        setTrades(tradesRes.value);
      } else if (tradesRes.status === 'rejected') {
        setTrades([]);
      }
      if (matchesRes.status === 'fulfilled' && Array.isArray(matchesRes.value)) {
        setMatches(matchesRes.value);
      } else if (matchesRes.status === 'rejected') {
        setMatches([]);
      }
      if (auditsRes.status === 'fulfilled' && Array.isArray(auditsRes.value)) {
        setAudits(auditsRes.value);
      } else if (auditsRes.status === 'rejected') {
        setAudits([]);
      }
      if (scorecardsRes.status === 'fulfilled' && Array.isArray(scorecardsRes.value)) {
        setScorecards(scorecardsRes.value);
      } else if (scorecardsRes.status === 'rejected') {
        setScorecards([]);
      }
      if (advisorsRes.status === 'fulfilled' && Array.isArray(advisorsRes.value)) setAdvisors(advisorsRes.value);
      if (mailRes.status === 'fulfilled' && Array.isArray(mailRes.value)) setMailHistory(mailRes.value);
      if (archivesRes.status === 'fulfilled' && Array.isArray(archivesRes.value)) setArchives(archivesRes.value);
      if (integrationsRes.status === 'fulfilled') setIntegrations(integrationsRes.value);
      if (diagRes.status === 'fulfilled') setDiagnostics(diagRes.value);
      if (logsRes.status === 'fulfilled' && Array.isArray(logsRes.value)) setLogs(logsRes.value);
      if (preOrdersRes.status === 'fulfilled' && preOrdersRes.value?.ok) {
        setPreOrdersSummary(preOrdersRes.value.summary);
      } else if (preOrdersRes.status === 'rejected') {
        setPreOrdersSummary(null);
      }

      const any401 = [statsRes, callsRes, tradesRes].some(
        (r) => r.status === 'rejected' && (r.reason as any)?.status === 401
      );
      if (any401) {
        try {
          const verifyRes = await api.verifySession();
          if (!verifyRes || !verifyRes.ok) {
            clearStoredToken();
            setCurrentUser(null);
          }
        } catch (vErr: any) {
          if (vErr?.status === 401) {
            clearStoredToken();
            setCurrentUser(null);
          }
        }
      }
    } catch (err) {
      console.error('Data fetch error:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      await verifyUserSession();
      if (active) {
        fetchAllData();
      }
    };
    initialize();

    // Fast lightweight heartbeat polling for metrics & pre-order stats
    const heartbeatInterval = setInterval(async () => {
      if (document.hidden || isFetchingRef.current) return;
      try {
        const [statsRes, preOrdersRes] = await Promise.allSettled([
          api.getStats(),
          api.getPreOrdersSummary(),
        ]);
        if (statsRes.status === 'fulfilled') setStats(statsRes.value);
        if (preOrdersRes.status === 'fulfilled' && preOrdersRes.value?.ok) {
          setPreOrdersSummary(preOrdersRes.value.summary);
        }
      } catch {}
    }, 8000);

    // Full periodic background sync every 120s
    const fullSyncInterval = setInterval(() => {
      if (!document.hidden && !isFetchingRef.current) {
        fetchAllData();
      }
    }, 120000);

    return () => {
      active = false;
      clearInterval(heartbeatInterval);
      clearInterval(fullSyncInterval);
    };
  }, [fetchAllData, verifyUserSession]);

  const handleLogout = async () => {
    try {
      await api.logout();
    } catch {}
    clearStoredToken();
    try {
      localStorage.clear();
      sessionStorage.clear();
      document.cookie = 'auditeq_token=; Max-Age=0; path=/;';
      document.cookie = 'token=; Max-Age=0; path=/;';
    } catch {}
    setCalls([]);
    setTrades([]);
    setMatches([]);
    setAudits([]);
    setScorecards([]);
    setStats(null);
    setPreOrdersSummary(null);
    setCurrentUser(null);
    setShowAuthGate(false);
    showToast('Signed out successfully.');
  };

  const handleSwitchWorkspace = async (ws: WorkspaceAccount) => {
    await handleLogout();
    setShowAuthGate(true);
    showToast(`Please sign in with credentials for ${ws.name}.`);
  };

  const handleSaveApiKey = async (apiKey: string): Promise<boolean> => {
    try {
      await api.saveIntegrations({ groq_key: apiKey });
      const testRes = await api.testGroq(apiKey);
      await fetchAllData();
      return Boolean(testRes.ok);
    } catch {
      return false;
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchAllData();
    setIsLoading(false);
    showToast('Data refreshed successfully.');
  };

  const handleStartPipeline = async () => {
    setPipelineRunning(true);
    try {
      const data = await api.startPipeline();
      showToast(data.message || 'Pipeline started successfully!');
      await fetchAllData();
    } catch (err: unknown) {
      showToast(`Pipeline start failed: ${(err as Error).message}`, 'error');
    } finally {
      setPipelineRunning(false);
    }
  };

  const handleUploadTrades = async (file: File) => {
    const data = await api.uploadTrades(file);
    if (!data || !data.ok) {
      throw new Error((data as any)?.error || (data as any)?.message || 'Trade import failed');
    }
    await fetchAllData();
    showToast(data.message || 'Trades imported successfully.');
  };

  const handleRunMatching = async () => {
    const data = await api.runMatching();
    await fetchAllData();
    showToast(data.matching?.message || 'Matching complete.');
  };

  const handleForceAudit = async (callId: number) => {
    await api.forceAudit(callId);
    await fetchAllData();
    showToast(`Audit completed and scorecard finalized for Call #${callId}.`);
  };

  const handleReviewAudit = async (auditId: number, data: Partial<AuditRecord>) => {
    await api.reviewAudit(auditId, data);
    await fetchAllData();
    showToast(`Audit #${auditId} updated & finalized.`);
  };

  const handleSendScorecard = async (scorecardId: number, toEmail?: string) => {
    await api.sendScorecard(scorecardId, toEmail);
    await fetchAllData();
    showToast(`Scorecard #${scorecardId} dispatched to ${toEmail || 'advisor'}.`);
  };

  const handleUpdateScorecard = async (
    id: number,
    data: Partial<ScorecardRecord> & { phone?: string; audit_date?: string; feedback?: string }
  ) => {
    await api.updateScorecard(id, data);
    await fetchAllData();
    showToast(`Audited record #${id} updated and synchronized across scorecards and audits.`);
  };

  const handleBulkUpdateScorecards = async (updates: Array<{ id: number; data: any }>) => {
    const res = await api.bulkUpdateScorecards(updates);
    await fetchAllData();
    showToast(res.message || `Successfully updated ${updates.length} audit records.`);
  };

  const handleDeleteScorecard = async (id: number) => {
    const res = await api.deleteScorecard(id);
    await fetchAllData();
    showToast(res.message || `Audit record #${id} deleted.`);
  };

  const handleCreateScorecard = async (data: any) => {
    const res = await api.createScorecard(data);
    await fetchAllData();
    showToast(res.message || 'New audit record added.');
  };

  const handleRunAllAudits = async () => {
    const res = await api.runAllAudits();
    await fetchAllData();
    showToast(res.message || `Audits executed for ${res.audited} call(s).`);
  };

  const handleBulkSend = async (options: {
    advisor: string;
    from_date?: string;
    to_date?: string;
    subject?: string;
    to?: string;
    cc?: string;
    marker_filter?: string;
  }) => {
    const res = await api.bulkSendScorecards(options);
    await fetchAllData();
    showToast(res.message || `Bulk scorecards successfully sent to ${options.advisor}.`);
  };

  const handleSaveIntegrations = async (data: Record<string, string>) => {
    await api.saveIntegrations(data);
    await fetchAllData();
    showToast('Integrations and processing parameters saved.');
  };

  const handleTestGroq = async (key?: string): Promise<boolean> => {
    try {
      const data = await api.testGroq(key);
      return Boolean(data.ok);
    } catch {
      return false;
    }
  };

  const handleArchiveClear = async (label: string) => {
    await api.archivePeriod(label);
    await fetchAllData();
    showToast('Workspace archived and live data cleared.');
  };

  const handlePermanentClear = async () => {
    await api.permanentClear();
    await fetchAllData();
    showToast('Live operational data permanently cleared.');
  };

  // Header Titles Map (Enterprise labels)
  const tabTitles: Record<ActiveTab, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Operations Dashboard',
      subtitle: 'Real-time call ingestion, trade correlation & compliance telemetry',
    },
    calls: {
      title: 'Calls Master Grid',
      subtitle: 'Complete call recordings, audio playback & compliance verification',
    },
    pre_orders: {
      title: 'Pre-Order Compliance Calls',
      subtitle: 'Mandatory pre-order voice recordings & 5-point audit verification',
    },
    audit: {
      title: 'Compliance Audits (Q1–Q5)',
      subtitle: 'Deterministic scoring with verbatim transcript citations',
    },
    scorecards: {
      title: 'Quality Scorecards',
      subtitle: 'Official 4-mark scorecards with fatal check rules',
    },
    workspace_parameters: {
      title: 'Quality & Compliance Parameters',
      subtitle: 'Configure up to 50 custom parameters, subparameters & fatal rules for this workspace',
    },
    call_metadata: {
      title: 'Call Metadata Repository',
      subtitle: 'Telephony attributes, duration, timestamps & agent numbers',
    },
    trades: {
      title: 'Executed Trades Repository',
      subtitle: 'Daily trade repository & column normalization',
    },
    recordings: {
      title: 'Audio Recording Vault',
      subtitle: 'Telephony wave files & cloud audio storage',
    },
    manual_trade_audit: {
      title: 'Mail Confirmation Audits (D-05)',
      subtitle: 'Non-voice written trade authorizations per RULES D-05',
    },
    clients: {
      title: 'Client Accounts Master',
      subtitle: 'Client UCC mapping & historical audit performance',
    },
    advisors: {
      title: 'Advisors Directory',
      subtitle: 'Dealer / Advisor compliance scores and metrics',
    },
    teams: {
      title: 'Team Hierarchy',
      subtitle: 'Organizational compliance tracking across trading desks',
    },
    pipeline: {
      title: 'Pipeline Automation',
      subtitle: 'End-to-end multi-pass execution status',
    },
    queue: {
      title: 'Processing Queue',
      subtitle: 'Active background transcription & audit tasks',
    },
    failed_jobs: {
      title: 'Failed Jobs & Retries',
      subtitle: 'Failed acoustic analyses, network drops & dead-letter queue',
    },
    reprocess: {
      title: 'Batch Reprocessor',
      subtitle: 'Force rerun ASR & Q1-Q5 scoring across targeted calls',
    },
    tata: {
      title: 'Smartflo Telephony Gateway',
      subtitle: 'Direct cloud telephony audio synchronization',
    },
    mail: {
      title: 'Scorecard Email Dispatch',
      subtitle: 'Advisor scorecard email delivery & dispatch log',
    },
    api_connections: {
      title: 'API Connections',
      subtitle: 'Google Gemini Key Pool ASR, Tata Telephony & Groq Llama integrations',
    },
    reports: {
      title: 'Compliance Audit Reports',
      subtitle: 'SEBI compliance summaries & aggregate audit reports',
    },
    advisor_reports: {
      title: 'Advisor Performance Reports',
      subtitle: 'Per-advisor pass rates, fatal counts & scorecard averages',
    },
    team_reports: {
      title: 'Team Performance Reports',
      subtitle: 'Desk-level compliance metrics & violation summaries',
    },
    scorecard_reports: {
      title: 'Scorecard Distribution Reports',
      subtitle: 'Scorecard delivery status & advisor acknowledgement receipts',
    },
    exports: {
      title: 'Compliance Data Exports',
      subtitle: 'CSV and Excel data exports for regulatory filings',
    },
    admin: {
      title: 'System Settings',
      subtitle: 'Platform configuration, scoring thresholds & user management',
    },
    security: {
      title: 'Security & Access Control',
      subtitle: 'Role-based access permissions & audit logs',
    },
    diagnostics: {
      title: 'System Diagnostics',
      subtitle: 'Subsystem health, API status & worker telemetry',
    },
    logs: {
      title: 'Execution Logs',
      subtitle: 'Real-time chronological events stream',
    },
    maintenance: {
      title: 'Workspace Maintenance',
      subtitle: 'Workspace purge & immutable archive creation',
    },
    master_table: {
      title: 'Audited Master Grid',
      subtitle: 'Pre-order audit records with live inline editing',
    },
    matching: {
      title: 'Trade Correlation Engine',
      subtitle: 'Deterministic 4-anchor matching (UCC, Symbol, Price, Qty)',
    },
    integrations: {
      title: 'Engine Settings & Integrations',
      subtitle: 'ASR models, advisor routing & compliance thresholds',
    },
    release_readiness: {
      title: 'Release Readiness & Governance',
      subtitle: 'Authoritative release gates, D-01..D-09 decisions & architecture guardrails',
    },
    ingestion_hub: {
      title: 'Canonical Ingestion Workspace',
      subtitle: 'Upload and validate all 6 authoritative compliance sources server-side',
    },
  };

  // 1. Session verification check loading screen
  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-[#0B0F17] flex flex-col items-center justify-center text-white">
        <div className="relative mb-4">
          <div className="w-10 h-10 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        </div>
        <div className="text-xs font-bold uppercase tracking-widest text-blue-400">
          ADAM-AR v1.1
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Loading Call Audit Platform...
        </div>
      </div>
    );
  }

  // 2. Unauthenticated: Show deep ADAM landing page first; clicking "Get Started" opens Login Screen
  if (!currentUser) {
    if (!showAuthGate) {
      return <AdamLandingPage onGetStarted={() => setShowAuthGate(true)} />;
    }

    return (
      <LoginScreen
        onBackToLanding={() => setShowAuthGate(false)}
        onLoginSuccess={(user, token) => {
          if (token) setStoredToken(token);
          if (user.workspace_id) {
            setStoredWorkspace(user.workspace_id);
          }
          setCurrentUser(user);
          // Zero data leak: clear all collections before fetching fresh workspace database
          setCalls([]);
          setTrades([]);
          setMatches([]);
          setAudits([]);
          setScorecards([]);
          setStats(null);
          fetchAllData();
          showToast(`Welcome back to ${user.workspace_name || user.workspace_id}!`);
        }}
      />
    );
  }

  return (
    <AudioPlayerProvider>
      <div className="flex min-h-screen bg-[#060b18] text-gray-200 font-sans antialiased ambient-mesh-bg relative">
      <CyberBackground />
      {/* Permanent Enterprise Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        stats={stats}
        currentUser={currentUser}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen((prev) => !prev)}
        onOpenSendModal={() => setIsGlobalSendModalOpen(true)}
        onLogout={handleLogout}
        onSwitchWorkspace={handleSwitchWorkspace}
        onSendScorecards={async () => {
          try {
            const token = getStoredToken();
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const res = await fetch('/api/scorecards/send-all-to-advisors', {
              method: 'POST',
              headers,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to dispatch scorecards');
            showToast(data.message || `Dispatched ${data.dispatched || 0} advisor emails.`);
            await fetchAllData();
          } catch (err: any) {
            showToast(`Scorecard dispatch failed: ${err.message}`, 'error');
          }
        }}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          title={tabTitles[activeTab]?.title || 'Operations'}
          subtitle={tabTitles[activeTab]?.subtitle || 'Compliance Audit Engine'}
          onRefresh={handleRefresh}
          onStartPipeline={handleStartPipeline}
          isLoading={isLoading}
          pipelineRunning={pipelineRunning}
          currentUser={currentUser}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          onLogout={handleLogout}
          dateRange={effectiveDateRange}
          onDateRangeChange={(range) => setSelectedDateFilter(range)}
          onUpdateProfile={(u) => setCurrentUser(u)}
          onSearch={(query) => {
            if (activeTab !== 'calls') {
              setActiveTab('calls');
            }
          }}
          scorecards={scorecards}
          onNavigate={setActiveTab}
          onOpenVoiceAssistant={() => setIsVoiceAssistantOpen(true)}
        />

        {/* Live Streaming HUD Telemetry Marquee */}
        <LiveTelemetryTicker />

        {/* User Authentication & Settings Modal */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          currentUser={currentUser}
          onLoginSuccess={(user) => {
            setCurrentUser(user);
            fetchAllData();
            showToast(`Signed in as ${user.full_name || user.username}`);
          }}
          onSaveApiKey={handleSaveApiKey}
          groqConfigured={Boolean(integrations?.groq_configured)}
        />

        {/* Global Toast Notification */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
            <div
              className={`px-4 py-2.5 rounded-lg shadow-2xl border text-xs font-medium flex items-center gap-2.5 ${
                toastMessage.type === 'error'
                  ? 'bg-red-950/90 text-red-200 border-red-500/40 shadow-red-950/50'
                  : 'bg-[#161B22] text-gray-200 border-[#30363D] shadow-black/60'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${toastMessage.type === 'error' ? 'bg-red-400' : 'bg-emerald-400'} animate-pulse`} />
              <span>{toastMessage.text}</span>
            </div>
          </div>
        )}

        <main key={activeTab} className="flex-1 p-6 w-full relative z-10 view-enter">
          <ErrorBoundary fallbackTitle="View Recovery">
            <Suspense
              fallback={
                <div className="flex flex-col items-center justify-center py-24 space-y-3">
                  <div className="w-8 h-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                  <span className="text-xs font-mono text-cyan-300">Loading module...</span>
                </div>
              }
            >
              {activeTab === 'dashboard' && (
                <DashboardView
                  stats={stats}
                  scorecards={scorecards}
                  onNavigate={setActiveTab}
                  onStartPipeline={handleStartPipeline}
                  isLoading={isLoading}
                  dateRange={effectiveDateRange}
                  onDateRangeChange={(range) => setSelectedDateFilter(range)}
                />
              )}

            {activeTab === 'release_readiness' && (
              <ReleaseReadinessView />
            )}

            {activeTab === 'ingestion_hub' && (
              <IngestionWorkspace
                onRefreshAll={fetchAllData}
                onNavigate={(tab) => setActiveTab(tab as ActiveTab)}
              />
            )}

            {(activeTab === 'calls' || activeTab === 'call_metadata' || activeTab === 'recordings') && (
              <CallsView
                calls={calls}
                dateRange={effectiveDateRange}
                onForceAudit={handleForceAudit}
                onRefresh={fetchAllData}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'pre_orders' && (
              <CallsView
                calls={calls}
                dateRange={effectiveDateRange}
                initialFilter="pre_order"
                onForceAudit={handleForceAudit}
                onRefresh={fetchAllData}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'trades' && (
              <TradesView
                trades={trades}
                preOrdersSummary={preOrdersSummary}
                onUploadTrades={handleUploadTrades}
                onRefreshTrades={fetchAllData}
                onNavigateToManualAudit={() => setActiveTab('manual_trade_audit')}
                onSelectCall={(_id) => {
                  setActiveTab('calls');
                }}
                isLoading={isLoading}
                dateRange={effectiveDateRange}
              />
            )}

            {activeTab === 'matching' && (
              <MatchingView
                matches={matches}
                onRunMatching={handleRunMatching}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'audit' && (
              <AuditView
                audits={audits}
                calls={calls}
                onForceAudit={handleForceAudit}
                onReviewAudit={handleReviewAudit}
                isLoading={isLoading}
              />
            )}

            {(activeTab === 'pipeline' || activeTab === 'queue' || activeTab === 'failed_jobs' || activeTab === 'reprocess') && (
              <PipelineView
                stats={stats}
                onStartPipeline={handleStartPipeline}
                isLoading={isLoading}
              />
            )}

            {(activeTab === 'master_table' || activeTab === 'clients' || activeTab === 'advisors' || activeTab === 'teams') && (
              <AuditedMasterView
                scorecards={scorecards || []}
                onUpdateScorecard={handleUpdateScorecard}
                onBulkUpdateScorecards={handleBulkUpdateScorecards}
                onDeleteScorecard={handleDeleteScorecard}
                onCreateScorecard={handleCreateScorecard}
                onRunAllAudits={handleRunAllAudits}
                onRefresh={fetchAllData}
                isLoading={isLoading}
                dateRange={effectiveDateRange}
              />
            )}

            {activeTab === 'manual_trade_audit' && (
              <ManualTradeAuditView
                onScorecardCreated={fetchAllData}
                onNavigateToScorecards={() => setActiveTab('scorecards')}
              />
            )}

            {activeTab === 'scorecards' && (
              <ScorecardsView
                scorecards={scorecards}
                onSendScorecard={handleSendScorecard}
                isLoading={isLoading}
                onNavigateToMail={() => setActiveTab('mail')}
                onRunAllAudits={handleRunAllAudits}
                dateRange={effectiveDateRange}
              />
            )}

            {activeTab === 'workspace_parameters' && (
              <WorkspaceParametersView
                currentUser={currentUser}
                onRefreshWorkspaceData={fetchAllData}
              />
            )}

            {activeTab === 'tata' && (
              <TataView
                integrations={integrations}
                calls={calls}
                onSaveIntegrations={handleSaveIntegrations}
                onRefresh={fetchAllData}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'mail' && (
              <MailView
                scorecards={scorecards}
                advisors={advisors}
                mailHistory={mailHistory}
                onBulkSend={handleBulkSend}
                isLoading={isLoading}
              />
            )}

            {(activeTab === 'reports' || activeTab === 'advisor_reports' || activeTab === 'team_reports' || activeTab === 'scorecard_reports' || activeTab === 'exports') && (
              <ReportsView
                archives={archives}
                scorecards={scorecards}
                calls={calls}
                advisors={advisors}
                isLoading={isLoading}
                dateRange={effectiveDateRange}
              />
            )}

            {(activeTab === 'integrations' || activeTab === 'api_connections') && (
              <IntegrationsView
                integrations={integrations}
                onSaveIntegrations={handleSaveIntegrations}
                onTestGroq={handleTestGroq}
                onRefresh={fetchAllData}
                isLoading={isLoading}
              />
            )}

            {activeTab === 'diagnostics' && (
              <DiagnosticsView diagnostics={diagnostics} isLoading={isLoading} />
            )}

            {activeTab === 'logs' && (
              <LogsView logs={logs} isLoading={isLoading} />
            )}

            {(activeTab === 'admin' || activeTab === 'security') && (
              <AdminView onRefreshStats={fetchAllData} />
            )}

            {activeTab === 'maintenance' && (
              <MaintenanceView
                onArchiveClear={handleArchiveClear}
                onPermanentClear={handlePermanentClear}
                isLoading={isLoading}
              />
            )}
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* Global Footer */}
        <footer className="px-6 py-3 border-t border-[#21262D] bg-[#0D1117]/80 text-center text-xs text-gray-400 select-none">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span className="font-semibold text-gray-300">ADAM-AR v1.1 Pre-Order Audit Intelligence</span>
            </div>
            <div className="text-[11px] font-medium text-gray-400">
              Designed and developed by <span className="text-blue-400 font-bold">Theashutoshjha</span>
            </div>
          </div>
        </footer>
      </div>
    </div>

    {/* Global 1-Click Send Scorecard Modal */}
    <SendScorecardModal
      isOpen={isGlobalSendModalOpen}
      onClose={() => setIsGlobalSendModalOpen(false)}
      scorecards={scorecards}
      onSuccess={(msg) => {
        showToast(msg);
        fetchAllData();
      }}
    />

    {/* Autonomous AI Voice Assistant with Interactive Voice Commands */}
    <VoiceAssistant
      onNavigate={(tab) => setActiveTab(tab)}
      onStartPipeline={handleStartPipeline}
      onRefresh={fetchAllData}
      onOpenSendModal={() => setIsGlobalSendModalOpen(true)}
      onSearch={(query) => {
        setActiveTab('calls');
      }}
      stats={stats}
      scorecards={scorecards}
      currentTab={activeTab}
      isOpenControlled={isVoiceAssistantOpen}
      onToggleOpen={() => setIsVoiceAssistantOpen((prev) => !prev)}
    />
    </AudioPlayerProvider>
  );
}

export default App;
