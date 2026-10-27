import React, { useState, useEffect, useRef } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  TrendingUp,
  Users,
  UserRound,
  MailCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Download,
  Play,
  Square,
  ShieldCheck,
  Sparkles,
  PhoneCall,
  ArrowRight,
  Database,
  FileText,
  AlertTriangle,
  Trash2,
  Loader2,
} from 'lucide-react';
import { api } from '../lib/api';

interface ImportCardState {
  file: File | null;
  status: 'IDLE' | 'UPLOADING' | 'VALIDATING' | 'SUCCESS' | 'ERROR';
  batchId?: string;
  acceptedRows?: number;
  rejectedRows?: number;
  duplicates?: number;
  errors?: string[];
  message?: string;
}

interface IngestionWorkspaceProps {
  onRefreshAll?: () => Promise<void>;
  onNavigate?: (tab: string) => void;
}

export const IngestionWorkspace: React.FC<IngestionWorkspaceProps> = ({
  onRefreshAll,
  onNavigate,
}) => {
  // Primary 2-Step Ingestion State (ZIP Upload completely removed)
  const [tradeReportState, setTradeReportState] = useState<ImportCardState>({ file: null, status: 'IDLE' });
  const [metadataState, setMetadataState] = useState<ImportCardState>({ file: null, status: 'IDLE' });

  // Optional Masters & Mail Confirmation
  const [clientMasterState, setClientMasterState] = useState<ImportCardState>({ file: null, status: 'IDLE' });
  const [advisorMasterState, setAdvisorMasterState] = useState<ImportCardState>({ file: null, status: 'IDLE' });
  const [mailPdfsState, setMailPdfsState] = useState<ImportCardState & { files?: File[] }>({ file: null, status: 'IDLE' });

  // Auto-Download State from TataTele Smartflo Column Y
  const [downloadProgress, setDownloadProgress] = useState<{
    isDownloading: boolean;
    total: number;
    completed: number;
    failed: number;
    currentCallId?: string;
    errors: Array<{ callId: string; error: string }>;
    lastUpdated: string;
  }>({
    isDownloading: false,
    total: 0,
    completed: 0,
    failed: 0,
    errors: [],
    lastUpdated: new Date().toISOString(),
  });

  // Pre-Order & 5-Point Audit Execution State
  const [isAuditingPreOrders, setIsAuditingPreOrders] = useState(false);
  const [preOrderResult, setPreOrderResult] = useState<{
    tradesProcessed: number;
    matchedPreOrders: number;
    mailConfirmations: number;
    unmatched: number;
    auditedScorecards: number;
    message: string;
  } | null>(null);

  const [copiedBatchId, setCopiedBatchId] = useState<string | null>(null);
  const [showOptionalMasters, setShowOptionalMasters] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Server Data Purge & Reset State
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handlePurgeAllData = async () => {
    setIsResetting(true);
    try {
      await api.resetAllServerData();
      setIsResetConfirmOpen(false);
      setTradeReportState({ file: null, status: 'IDLE' });
      setMetadataState({ file: null, status: 'IDLE' });
      setPreOrderResult(null);
      if (onRefreshAll) await onRefreshAll();
    } catch (err: any) {
      alert(`Purge failed: ${err?.message || 'Error clearing server data'}`);
    } finally {
      setIsResetting(false);
    }
  };

  // Poll TataTele Auto-Download Status
  const fetchDownloadStatus = async () => {
    try {
      const res = await api.getDownloadStatus();
      if (res && res.ok) {
        setDownloadProgress({
          isDownloading: res.isDownloading,
          total: res.total,
          completed: res.completed,
          failed: res.failed,
          currentCallId: res.currentCallId,
          errors: res.errors || [],
          lastUpdated: res.lastUpdated,
        });
      }
    } catch {
      // Background poll failure handled silently
    }
  };

  useEffect(() => {
    fetchDownloadStatus();
    pollingRef.current = setInterval(() => {
      fetchDownloadStatus();
    }, 3000);

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBatchId(text);
    setTimeout(() => setCopiedBatchId(null), 2000);
  };

  // Step 1: Upload Trade Report (Excel / CSV)
  const handleUploadTrades = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeReportState.file) return;
    setTradeReportState((prev) => ({ ...prev, status: 'UPLOADING', message: 'Uploading trade execution book...' }));
    try {
      setTradeReportState((prev) => ({ ...prev, status: 'VALIDATING', message: 'Parsing orders, stock symbols, and client codes...' }));
      const res = await api.uploadTrades(tradeReportState.file);
      const count = (res as any).accepted_rows ?? res.imported ?? 0;
      setTradeReportState({
        file: null,
        status: 'SUCCESS',
        batchId: (res as any).batch_id || `BATCH_TRD_${Date.now().toString().slice(-6)}`,
        acceptedRows: count,
        rejectedRows: 0,
        duplicates: (res as any).merged_split_trades || 0,
        message: res.message || `Successfully imported ${count} trade execution(s) into database.`,
      });
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setTradeReportState((prev) => ({
        ...prev,
        status: 'ERROR',
        errors: [err.message || 'Upload failed'],
        message: err.message || 'Failed to upload trade report',
      }));
    }
  };

  // Step 2: Upload Call Metadata (meta.csv) with TataTele Column Y Auto-Download
  const handleUploadMetadata = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!metadataState.file) return;
    setMetadataState((prev) => ({ ...prev, status: 'UPLOADING', message: 'Uploading meta.csv with TataTele links...' }));
    try {
      const formData = new FormData();
      formData.append('metadata', metadataState.file);
      setMetadataState((prev) => ({
        ...prev,
        status: 'VALIDATING',
        message: 'Validating Column C (Call ID), Column E (Customer Number), and Column Y (TataTele Recording URLs)...',
      }));
      const res = await api.uploadCalls(formData);
      const count = (res as any).accepted_rows ?? (res as any).imported ?? 0;
      setMetadataState({
        file: null,
        status: 'SUCCESS',
        batchId: (res as any).batch_id || `BATCH_META_${Date.now().toString().slice(-6)}`,
        acceptedRows: count,
        rejectedRows: 0,
        duplicates: 0,
        message: res.message || `Processed ${count} call metadata record(s). TataTele Column Y auto-downloader active!`,
      });
      // Immediately refresh download status
      await fetchDownloadStatus();
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setMetadataState((prev) => ({
        ...prev,
        status: 'ERROR',
        errors: [err.message || 'Upload failed'],
        message: err.message || 'Failed to upload call metadata',
      }));
    }
  };

  // Manual Trigger: Start or Resume TataTele Auto-Download
  const handleTriggerAutoDownload = async () => {
    try {
      await api.startDownloadRecordings();
      await fetchDownloadStatus();
    } catch (err: any) {
      alert(`Auto-download start failed: ${err.message}`);
    }
  };

  // Cancel TataTele Auto-Download
  const handleCancelAutoDownload = async () => {
    try {
      await api.cancelDownloadRecordings();
      await fetchDownloadStatus();
    } catch (err: any) {
      alert(`Cancel failed: ${err.message}`);
    }
  };

  // Run Pre-Order Finding & 5-Point Equity Audit Pipeline
  const handleRunPreOrderAudit = async () => {
    setIsAuditingPreOrders(true);
    setPreOrderResult(null);
    try {
      const res = await api.runPreOrderAudit();
      setPreOrderResult({
        tradesProcessed: res.tradesProcessed,
        matchedPreOrders: res.matchedPreOrders,
        mailConfirmations: res.mailConfirmations,
        unmatched: res.unmatched,
        auditedScorecards: res.auditedScorecards,
        message: res.message,
      });
      if (onRefreshAll) await onRefreshAll();
    } catch (err: any) {
      alert(`Pre-Order Audit failed: ${err.message}`);
    } finally {
      setIsAuditingPreOrders(false);
    }
  };

  // Optional Masters
  const handleUploadClientMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientMasterState.file) return;
    setClientMasterState((prev) => ({ ...prev, status: 'UPLOADING', message: 'Uploading UCC Client Master...' }));
    try {
      setClientMasterState((prev) => ({ ...prev, status: 'VALIDATING', message: 'Validating client codes and registered mobile numbers...' }));
      const res = await api.uploadClientMaster(clientMasterState.file);
      setClientMasterState({
        file: null,
        status: 'SUCCESS',
        batchId: res.batch_id,
        acceptedRows: res.accepted_rows,
        rejectedRows: res.rejected_rows,
        duplicates: res.duplicates,
        errors: res.errors,
        message: res.message,
      });
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setClientMasterState((prev) => ({
        ...prev,
        status: 'ERROR',
        errors: [err.message || 'Upload failed'],
        message: err.message || 'Failed to upload Client Master',
      }));
    }
  };

  const handleUploadAdvisorMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advisorMasterState.file) return;
    setAdvisorMasterState((prev) => ({ ...prev, status: 'UPLOADING', message: 'Uploading Advisor / Dealer Master...' }));
    try {
      setAdvisorMasterState((prev) => ({ ...prev, status: 'VALIDATING', message: 'Validating advisor codes and names...' }));
      const res = await api.uploadAdvisorMaster(advisorMasterState.file);
      setAdvisorMasterState({
        file: null,
        status: 'SUCCESS',
        batchId: res.batch_id,
        acceptedRows: res.accepted_rows,
        rejectedRows: res.rejected_rows,
        duplicates: res.duplicates,
        errors: res.errors,
        message: res.message,
      });
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setAdvisorMasterState((prev) => ({
        ...prev,
        status: 'ERROR',
        errors: [err.message || 'Upload failed'],
        message: err.message || 'Failed to upload Advisor Master',
      }));
    }
  };

  const handleUploadMailPdfs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mailPdfsState.files || mailPdfsState.files.length === 0) return;
    setMailPdfsState((prev) => ({ ...prev, status: 'UPLOADING', message: 'Uploading mail confirmation PDFs...' }));
    try {
      const formData = new FormData();
      mailPdfsState.files.forEach((f) => formData.append('files', f));
      setMailPdfsState((prev) => ({ ...prev, status: 'VALIDATING', message: 'Extracting trade confirmations from PDFs...' }));
      const res = await api.uploadMailConfirmations(formData);
      setMailPdfsState({
        file: null,
        files: [],
        status: 'SUCCESS',
        batchId: `BATCH_PDF_${Date.now().toString().slice(-6)}`,
        acceptedRows: res?.summary?.matchedCount || 0,
        rejectedRows: (res?.summary?.unmatchedFiles || []).length,
        duplicates: 0,
        message: `Processed ${res?.summary?.filesProcessed || 0} PDF(s). ${res?.summary?.matchedCount || 0} trade confirmation(s) matched.`,
      });
      if (onRefreshAll) onRefreshAll();
    } catch (err: any) {
      setMailPdfsState((prev) => ({
        ...prev,
        status: 'ERROR',
        errors: [err.message || 'Upload failed'],
        message: err.message || 'Failed to upload mail confirmations',
      }));
    }
  };

  const renderStatusBox = (card: ImportCardState) => {
    if (card.status === 'IDLE') return null;

    return (
      <div className="mt-3 pt-3 border-t border-[#21262D] space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-400">Status:</span>
          <span
            className={`font-mono font-semibold px-2 py-0.5 rounded text-[11px] ${
              card.status === 'SUCCESS'
                ? 'bg-emerald-500/10 text-emerald-400'
                : card.status === 'ERROR'
                ? 'bg-rose-500/10 text-rose-400'
                : 'bg-blue-500/10 text-blue-400'
            }`}
          >
            {card.status}
          </span>
        </div>

        {card.batchId && (
          <div className="flex items-center justify-between text-xs bg-[#0D1117] p-1.5 rounded border border-[#30363D]">
            <span className="text-gray-400 font-mono text-[10px]">Batch ID:</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-gray-200 text-[10px]">{card.batchId}</span>
              <button
                type="button"
                onClick={() => copyToClipboard(card.batchId!)}
                className="text-gray-400 hover:text-white transition-colors"
                title="Copy Batch ID"
              >
                {copiedBatchId === card.batchId ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>
        )}

        {card.message && (
          <p className={`text-xs ${card.status === 'ERROR' ? 'text-rose-400' : 'text-gray-300'}`}>
            {card.message}
          </p>
        )}

        {card.status === 'SUCCESS' && typeof card.acceptedRows === 'number' && (
          <div className="grid grid-cols-2 gap-2 text-center text-xs pt-1">
            <div className="bg-emerald-950/30 border border-emerald-500/20 p-1.5 rounded">
              <div className="text-[10px] text-emerald-400/80 uppercase font-semibold">Accepted</div>
              <div className="text-emerald-400 font-bold font-mono text-sm">{card.acceptedRows}</div>
            </div>
            <div className="bg-gray-800/40 border border-gray-700/30 p-1.5 rounded">
              <div className="text-[10px] text-gray-400 uppercase font-semibold">Rejected</div>
              <div className="text-gray-300 font-bold font-mono text-sm">{card.rejectedRows || 0}</div>
            </div>
          </div>
        )}

        {card.errors && card.errors.length > 0 && (
          <div className="bg-rose-950/20 border border-rose-500/20 p-2 rounded text-[11px] text-rose-300 max-h-24 overflow-y-auto space-y-1">
            {card.errors.slice(0, 3).map((err, i) => (
              <div key={i} className="flex items-start gap-1">
                <AlertCircle size={12} className="shrink-0 mt-0.5 text-rose-400" />
                <span>{err}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const downloadProgressPercent = downloadProgress.total > 0
    ? Math.min(100, Math.round((downloadProgress.completed / downloadProgress.total) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner: Simplified 2-Step Ingestion with TataTele Column Y Auto-Download */}
      <div className="bg-gradient-to-r from-blue-950/40 via-[#161B22] to-indigo-950/30 border border-blue-500/20 rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded text-[11px] font-bold tracking-wider uppercase border border-blue-500/30">
                Streamlined Ingestion
              </span>
              <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded text-[11px] font-bold tracking-wider uppercase border border-emerald-500/30">
                TataTele Auto-Download
              </span>
            </div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Trade & Call Ingestion Center
            </h1>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
              Upload your <strong>Trade Data</strong> and <strong>Call Metadata (<code className="text-blue-300">meta.csv</code>)</strong>. 
              The system automatically parses Column Y, extracts TataTele Smartflo recording links, and downloads all audio files directly to the server.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsResetConfirmOpen(true)}
              disabled={isResetting}
              className="px-4 py-2.5 neu-button text-rose-300 hover:text-rose-200 font-semibold text-xs rounded-xl border border-rose-500/30 hover:border-rose-500/70 shadow-lg flex items-center gap-2 transition-all cursor-pointer"
              title="Delete all data from the server and start completely clean"
            >
              <Trash2 size={14} className="text-rose-400" />
              <span>Purge &amp; Reset Server</span>
            </button>

            <button
              onClick={handleRunPreOrderAudit}
              disabled={isAuditingPreOrders}
              className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-cyan-950/50 flex items-center gap-2 border border-cyan-400/30 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isAuditingPreOrders ? (
                <>
                  <RefreshCw size={14} className="animate-spin text-white" />
                  <span>Auditing Pre-Orders...</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} className="text-amber-300" />
                  <span>Run Pre-Order Audit</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Pre-Order Audit Results Summary Banner if executed */}
      {preOrderResult && (
        <div className="bg-[#161B22] border border-emerald-500/30 rounded-xl p-4 shadow-xl">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#30363D]">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">
                Pre-Order Audit Execution Complete
              </span>
            </div>
            <span className="text-[11px] text-gray-400">{preOrderResult.message}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
            <div className="bg-[#0D1117] p-2.5 rounded-lg border border-[#30363D]">
              <div className="text-[10px] text-gray-400 uppercase font-semibold">Trades Evaluated</div>
              <div className="text-lg font-bold font-mono text-white mt-0.5">{preOrderResult.tradesProcessed}</div>
            </div>
            <div className="bg-[#0D1117] p-2.5 rounded-lg border border-emerald-500/20">
              <div className="text-[10px] text-emerald-400 uppercase font-semibold">Matched Pre-Orders</div>
              <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">{preOrderResult.matchedPreOrders}</div>
            </div>
            <div className="bg-[#0D1117] p-2.5 rounded-lg border border-cyan-500/20">
              <div className="text-[10px] text-cyan-400 uppercase font-semibold">Mail Confirmations</div>
              <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">{preOrderResult.mailConfirmations}</div>
            </div>
            <div className="bg-[#0D1117] p-2.5 rounded-lg border border-amber-500/20">
              <div className="text-[10px] text-amber-400 uppercase font-semibold">Missing Call / Unmatched</div>
              <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">{preOrderResult.unmatched}</div>
            </div>
            <div className="bg-[#0D1117] p-2.5 rounded-lg border border-purple-500/20">
              <div className="text-[10px] text-purple-400 uppercase font-semibold">5-Pt Scorecards Generated</div>
              <div className="text-lg font-bold font-mono text-purple-400 mt-0.5">{preOrderResult.auditedScorecards}</div>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {onNavigate && (
              <>
                <button
                  onClick={() => onNavigate('pre_orders')}
                  className="px-3 py-1 bg-[#21262D] hover:bg-[#30363D] text-xs text-gray-200 rounded border border-[#30363D] flex items-center gap-1.5 transition-colors"
                >
                  <span>View Pre-Orders</span>
                  <ArrowRight size={12} />
                </button>
                <button
                  onClick={() => onNavigate('scorecards')}
                  className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-xs text-blue-300 rounded border border-blue-500/30 flex items-center gap-1.5 transition-colors"
                >
                  <span>View Scorecards</span>
                  <ArrowRight size={12} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Primary 2-Step Workflow Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Step 1: Trade Report */}
        <div className="bg-[#161B22] border border-[#30363D] hover:border-blue-500/40 rounded-xl p-5 flex flex-col justify-between transition-all shadow-md">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <TrendingUp size={18} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Step 1</div>
                  <h3 className="text-sm font-bold text-white">Trade Data Book</h3>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-gray-800 text-gray-300 text-[10px] font-mono rounded border border-gray-700">
                .xlsx, .csv
              </span>
            </div>

            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Upload your trade executions book. The system extracts <strong>Client Code</strong>, <strong>Stock Symbol</strong>, <strong>Price</strong>, <strong>Quantity</strong>, and <strong>Order Execution Time</strong>.
            </p>

            <form onSubmit={handleUploadTrades} className="space-y-3">
              <div className="relative border-2 border-dashed border-[#30363D] hover:border-blue-500/50 rounded-lg p-4 text-center cursor-pointer transition-colors bg-[#0D1117]/60">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => setTradeReportState((prev) => ({ ...prev, file: e.target.files?.[0] || null, status: 'IDLE' }))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <FileSpreadsheet size={24} className="mx-auto text-blue-400 mb-1.5" />
                <span className="text-xs text-gray-300 block font-medium">
                  {tradeReportState.file ? tradeReportState.file.name : 'Choose Trade Report or Drag & Drop'}
                </span>
                <span className="text-[10px] text-gray-500 block mt-0.5">
                  {tradeReportState.file ? `${(tradeReportState.file.size / 1024).toFixed(1)} KB` : 'All exchange orders and CMP splits supported'}
                </span>
              </div>

              <button
                type="submit"
                disabled={!tradeReportState.file || tradeReportState.status === 'UPLOADING' || tradeReportState.status === 'VALIDATING'}
                className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {tradeReportState.status === 'UPLOADING' || tradeReportState.status === 'VALIDATING' ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Processing Trades...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={14} />
                    <span>Upload Trade Data</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {renderStatusBox(tradeReportState)}
        </div>

        {/* Step 2: Call Metadata with TataTele Column Y */}
        <div className="bg-[#161B22] border border-[#30363D] hover:border-indigo-500/40 rounded-xl p-5 flex flex-col justify-between transition-all shadow-md">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Database size={18} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Step 2</div>
                  <h3 className="text-sm font-bold text-white">Call Metadata (meta.csv)</h3>
                </div>
              </div>
              <span className="px-2 py-0.5 bg-emerald-950/60 text-emerald-300 text-[10px] font-mono rounded border border-emerald-500/30">
                Auto-Downloads Audio
              </span>
            </div>

            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
              Upload <code className="text-indigo-300 font-mono">meta.csv</code>. The server automatically detects <strong>Column Y</strong> TataTele Smartflo recording links and immediately downloads all call audio in the background.
            </p>

            <form onSubmit={handleUploadMetadata} className="space-y-3">
              <div className="relative border-2 border-dashed border-[#30363D] hover:border-indigo-500/50 rounded-lg p-4 text-center cursor-pointer transition-colors bg-[#0D1117]/60">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.tsv"
                  onChange={(e) => setMetadataState((prev) => ({ ...prev, file: e.target.files?.[0] || null, status: 'IDLE' }))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <PhoneCall size={24} className="mx-auto text-indigo-400 mb-1.5" />
                <span className="text-xs text-gray-300 block font-medium">
                  {metadataState.file ? metadataState.file.name : 'Choose meta.csv with Column Y TataTele Links'}
                </span>
                <span className="text-[10px] text-gray-500 block mt-0.5">
                  {metadataState.file ? `${(metadataState.file.size / 1024).toFixed(1)} KB` : 'Column C (ID), Column E (Customer), Column Y (Audio Link)'}
                </span>
              </div>

              <button
                type="submit"
                disabled={!metadataState.file || metadataState.status === 'UPLOADING' || metadataState.status === 'VALIDATING'}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              >
                {metadataState.status === 'UPLOADING' || metadataState.status === 'VALIDATING' ? (
                  <>
                    <RefreshCw size={13} className="animate-spin" />
                    <span>Processing Metadata & Links...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud size={14} />
                    <span>Upload Call Metadata & Start Auto-Download</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {renderStatusBox(metadataState)}
        </div>
      </div>

      {/* Real-Time TataTele Cloudphone Auto-Download Monitor */}
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${downloadProgress.isDownloading ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                TataTele Smartflo Auto-Downloader Status
              </h3>
              <p className="text-[11px] text-gray-400">
                Downloads audio calls from <code className="text-gray-300">cloudphone.tatateleservices.com</code> directly into local storage.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {downloadProgress.isDownloading ? (
              <button
                onClick={handleCancelAutoDownload}
                className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 text-xs rounded-lg border border-rose-500/30 flex items-center gap-1.5 transition-colors"
              >
                <Square size={12} className="fill-rose-400" />
                <span>Pause Download</span>
              </button>
            ) : (
              <button
                onClick={handleTriggerAutoDownload}
                className="px-3 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/50 text-emerald-300 text-xs rounded-lg border border-emerald-500/30 flex items-center gap-1.5 transition-colors"
              >
                <Play size={12} className="fill-emerald-400" />
                <span>Start / Resume Auto-Download</span>
              </button>
            )}

            <button
              onClick={fetchDownloadStatus}
              className="p-1.5 bg-[#21262D] hover:bg-[#30363D] text-gray-300 rounded-lg border border-[#30363D] transition-colors"
              title="Refresh status"
            >
              <RefreshCw size={14} className={downloadProgress.isDownloading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Progress Bar & Metrics */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-gray-400">
              {downloadProgress.isDownloading ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <RefreshCw size={12} className="animate-spin" />
                  Downloading Call: {downloadProgress.currentCallId || 'processing...'}
                </span>
              ) : downloadProgress.total > 0 && downloadProgress.completed === downloadProgress.total ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 size={12} />
                  All {downloadProgress.total} Column Y recordings downloaded locally.
                </span>
              ) : (
                <span className="text-gray-400">Auto-downloader idle.</span>
              )}
            </span>
            <span className="text-gray-300 font-bold">
              {downloadProgress.completed} / {downloadProgress.total} ({downloadProgressPercent}%)
            </span>
          </div>

          <div className="w-full bg-[#0D1117] rounded-full h-2.5 overflow-hidden border border-[#30363D]">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                downloadProgress.isDownloading
                  ? 'bg-gradient-to-r from-blue-500 to-emerald-400'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${downloadProgressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1">
            <span>Completed: <strong className="text-gray-300 font-mono">{downloadProgress.completed}</strong></span>
            <span>Failed / Offline: <strong className="text-rose-400 font-mono">{downloadProgress.failed}</strong></span>
            <span>Pending: <strong className="text-blue-300 font-mono">{Math.max(0, downloadProgress.total - downloadProgress.completed - downloadProgress.failed)}</strong></span>
            <span>Last Sync: <strong className="text-gray-400 font-mono">{new Date(downloadProgress.lastUpdated).toLocaleTimeString()}</strong></span>
          </div>

          {downloadProgress.errors && downloadProgress.errors.length > 0 && (
            <div className="mt-3 p-2.5 bg-rose-950/20 border border-rose-500/20 rounded-lg text-xs text-rose-300 space-y-1">
              <div className="font-semibold text-rose-400 flex items-center gap-1">
                <AlertTriangle size={13} />
                <span>Download Warnings ({downloadProgress.errors.length}):</span>
              </div>
              <div className="max-h-20 overflow-y-auto font-mono text-[11px] space-y-0.5">
                {downloadProgress.errors.slice(0, 5).map((err, i) => (
                  <div key={i}>Call {err.callId}: {err.error}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Optional Masters & Mail Confirmation Toggle */}
      <div>
        <button
          onClick={() => setShowOptionalMasters((prev) => !prev)}
          className="text-xs text-gray-400 hover:text-white flex items-center gap-1.5 transition-colors font-medium py-1"
        >
          <span>{showOptionalMasters ? '▼ Hide' : '▶ Show'} Optional Reference Masters (UCC Clients, Advisors, Mail Confirmations)</span>
        </button>

        {showOptionalMasters && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            {/* Client Master */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users size={16} className="text-emerald-400" />
                <h4 className="text-xs font-bold text-white">UCC Client Master</h4>
              </div>
              <p className="text-[11px] text-gray-400 mb-3">
                Upload registered mobile numbers for strict Q1 compliance check.
              </p>
              <form onSubmit={handleUploadClientMaster} className="space-y-2">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => setClientMasterState((prev) => ({ ...prev, file: e.target.files?.[0] || null, status: 'IDLE' }))}
                  className="text-xs text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700"
                />
                <button
                  type="submit"
                  disabled={!clientMasterState.file}
                  className="w-full py-1.5 bg-[#21262D] hover:bg-[#30363D] text-xs font-medium text-gray-200 rounded border border-[#30363D] transition-colors disabled:opacity-40"
                >
                  Upload Client Master
                </button>
              </form>
              {renderStatusBox(clientMasterState)}
            </div>

            {/* Advisor Master */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <UserRound size={16} className="text-purple-400" />
                <h4 className="text-xs font-bold text-white">Advisor Master</h4>
              </div>
              <p className="text-[11px] text-gray-400 mb-3">
                Upload dealer IDs, teams, and advisor extension mappings.
              </p>
              <form onSubmit={handleUploadAdvisorMaster} className="space-y-2">
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(e) => setAdvisorMasterState((prev) => ({ ...prev, file: e.target.files?.[0] || null, status: 'IDLE' }))}
                  className="text-xs text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700"
                />
                <button
                  type="submit"
                  disabled={!advisorMasterState.file}
                  className="w-full py-1.5 bg-[#21262D] hover:bg-[#30363D] text-xs font-medium text-gray-200 rounded border border-[#30363D] transition-colors disabled:opacity-40"
                >
                  Upload Advisor Master
                </button>
              </form>
              {renderStatusBox(advisorMasterState)}
            </div>

            {/* Mail Confirmation PDFs */}
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <MailCheck size={16} className="text-cyan-400" />
                <h4 className="text-xs font-bold text-white">Mail Confirmation PDFs</h4>
              </div>
              <p className="text-[11px] text-gray-400 mb-3">
                Upload trade order authorization emails for non-phone orders.
              </p>
              <form onSubmit={handleUploadMailPdfs} className="space-y-2">
                <input
                  type="file"
                  multiple
                  accept=".pdf"
                  onChange={(e) => setMailPdfsState((prev) => ({ ...prev, files: Array.from(e.target.files || []), status: 'IDLE' }))}
                  className="text-xs text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700"
                />
                <button
                  type="submit"
                  disabled={!mailPdfsState.files || mailPdfsState.files.length === 0}
                  className="w-full py-1.5 bg-[#21262D] hover:bg-[#30363D] text-xs font-medium text-gray-200 rounded border border-[#30363D] transition-colors disabled:opacity-40"
                >
                  Upload Mail Confirmations
                </button>
              </form>
              {renderStatusBox(mailPdfsState)}
            </div>
          </div>
        )}
      </div>

      {/* 3D Neumorphic Purge & Reset Server Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="w-full max-w-md neu-panel rounded-2xl p-6 border border-rose-500/30 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl neu-button flex items-center justify-center bg-rose-950/40 border border-rose-500/40 text-rose-400 shadow-md">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Purge All Server Operational Data</h3>
                <p className="text-[11px] text-gray-400">Irreversible Database Clean Slate</p>
              </div>
            </div>

            <div className="p-3.5 neu-inset rounded-xl border border-rose-500/20 text-xs text-rose-200/90 leading-relaxed space-y-2">
              <p>
                <strong>Warning:</strong> This will delete all live calls, trades, pre-order correlations, transcripts, audio files, and audit scorecards from the server.
              </p>
              <p className="text-[11px] text-gray-400">
                The database will be wiped to a pristine empty state, ready for your new upload batch.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl neu-button text-xs font-semibold text-gray-300 hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeAllData}
                disabled={isResetting}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 shadow-lg shadow-rose-900/40 transition-all cursor-pointer disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-white" />
                    <span>Wiping Server Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Confirm &amp; Purge All Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
