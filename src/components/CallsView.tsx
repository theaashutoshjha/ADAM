import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Search,
  Calendar,
  Filter,
  Download,
  Check,
  X,
  Minus,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Phone,
  ArrowLeft,
  FileText,
  ShieldCheck,
  RotateCcw,
  Share2,
  Edit3,
  ArrowRightLeft,
  Trash2,
  Tag,
  Loader2,
  FileSpreadsheet,
  Copy,
} from 'lucide-react';
import type { CallRecord } from '../types';
import { api, getStoredToken } from '../lib/api';
import { cleanCallerName } from '../lib/clientCode';
import { useAudioPlayer } from './GlobalAudioPlayer';
import { findAdvisorEntry } from '../lib/fundsindia-directory';
import { LiveAudioVisualizer } from './LiveAudioVisualizer';
import { AudioWaveformVisualizer } from './AudioWaveformVisualizer';

interface CallsViewProps {
  calls: CallRecord[];
  onForceAudit: (callId: number) => Promise<void>;
  onRefresh?: () => Promise<void>;
  isLoading?: boolean;
  initialFilter?: string;
  dateRange?: string;
}

export const CallsView: React.FC<CallsViewProps> = ({
  calls,
  onForceAudit,
  onRefresh,
  isLoading,
  initialFilter,
  dateRange,
}) => {
  const { playCall } = useAudioPlayer();
  const [search, setSearch] = useState('');
  const [advisorFilter, setAdvisorFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<string>(initialFilter || 'all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientPrefixFilter, setClientPrefixFilter] = useState('all');
  const [complianceFilter, setComplianceFilter] = useState('all');
  const [fatalCategoryFilter, setFatalCategoryFilter] = useState('all');
  const [recordingSourceFilter, setRecordingSourceFilter] = useState('all');
  const [selectedCallIds, setSelectedCallIds] = useState<Set<number>>(new Set());
  const [activeCallDetail, setActiveCallDetail] = useState<CallRecord | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<'transcript' | 'segments'>('transcript');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [currentAudioTime, setCurrentAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [detailedSegments, setDetailedSegments] = useState<any[]>([]);
  const [isUpdatingCompliance, setIsUpdatingCompliance] = useState(false);
  const [updatingCallQuestions, setUpdatingCallQuestions] = useState<Record<string, boolean>>({});
  const [isReclassifying, setIsReclassifying] = useState<Record<number, boolean>>({});
  const [isBulkReclassifying, setIsBulkReclassifying] = useState(false);

  const handleReclassifyCall = async (callId: number, type: 'pre_order' | 'regular' | 'scrap') => {
    setIsReclassifying((prev) => ({ ...prev, [callId]: true }));
    try {
      const res = await api.reclassifyCall(callId, type);
      if (res.ok) {
        if (activeCallDetail && activeCallDetail.id === callId) {
          setActiveCallDetail((prev: any) => prev ? {
            ...prev,
            call_type: type,
            classification: type === 'pre_order' ? 'PRE_ORDER' : type.toUpperCase(),
            status: type === 'pre_order' ? 'pending' : type,
            audit_status: type === 'pre_order' ? 'PENDING' : 'EXCLUDED',
            matched_trade_id: type === 'pre_order' ? prev.matched_trade_id : null,
            scorecard: type === 'pre_order' ? prev.scorecard : null,
          } : null);
        }
        if (onRefresh) await onRefresh();
      }
    } catch (err) {
      console.error(`Failed to reclassify call #${callId}:`, err);
    } finally {
      setIsReclassifying((prev) => ({ ...prev, [callId]: false }));
    }
  };

  const handleBulkReclassify = async (type: 'pre_order' | 'regular' | 'scrap') => {
    if (selectedCallIds.size === 0) return;
    setIsBulkReclassifying(true);
    try {
      const ids = Array.from(selectedCallIds);
      const res = await api.bulkReclassifyCalls(ids, type);
      if (res.ok) {
        setSelectedCallIds(new Set());
        if (onRefresh) await onRefresh();
      }
    } catch (err) {
      console.error(`Failed to bulk reclassify calls:`, err);
    } finally {
      setIsBulkReclassifying(false);
    }
  };

  const handleToggleTableQuestion = async (
    e: React.MouseEvent,
    callId: number,
    qKey: 'q1' | 'q2' | 'q3' | 'q4' | 'q5',
    currentPass: boolean
  ) => {
    e.stopPropagation();
    const key = `${callId}_${qKey}`;
    if (updatingCallQuestions[key]) return;
    const nextStatus = currentPass ? 'FAIL' : 'PASS';
    setUpdatingCallQuestions((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await api.overrideCallCompliance(callId, { [`${qKey}_status`]: nextStatus });
      if (res.ok && onRefresh) {
        await onRefresh();
      }
    } catch (err) {
      console.error(`Failed to toggle ${qKey} for call #${callId}:`, err);
    } finally {
      setUpdatingCallQuestions((prev) => ({ ...prev, [key]: false }));
    }
  };

  const getAudioUrl = (callId: number) => {
    const token = getStoredToken();
    return `/api/calls/${callId}/audio${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const parseTimeToSeconds = (tStr: string) => {
    const clean = tStr.replace(/[\[\]]/g, '').trim();
    const parts = clean.split(':').map(Number);
    if (parts.length === 2) return (parts[0] || 0) * 60 + (parts[1] || 0);
    if (parts.length === 3) return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    return 0;
  };

  useEffect(() => {
    if (!activeCallDetail?.id) {
      setDetailedSegments([]);
      return;
    }
    let isMounted = true;
    api.getCall(activeCallDetail.id)
      .then((fullCall) => {
        if (isMounted && fullCall) {
          if (fullCall.segments && Array.isArray(fullCall.segments)) {
            setDetailedSegments(fullCall.segments);
          }
          setActiveCallDetail((prev) => (prev && prev.id === fullCall.id ? { ...prev, ...fullCall } : prev));
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [activeCallDetail?.id]);

  const computedDateRange = useMemo(() => {
    if (dateRange && dateRange !== '01 Jan 2025 - 31 Jan 2025') return dateRange;
    const dates = calls
      .map((c) => c.call_date)
      .filter((d): d is string => Boolean(d && d.trim().length >= 8))
      .sort();
    if (dates.length === 0) return 'All Dates';
    const first = dates[0];
    const last = dates[dates.length - 1];
    if (first === last) return first;
    return `${first} - ${last}`;
  }, [calls, dateRange]);

  // Clean Call ID and Advisor Name Resolvers
  const getCallDisplayId = (c: any) => {
    if (c.caller_id && String(c.caller_id).trim() !== '' && !String(c.caller_id).startsWith('CAL-')) {
      return String(c.caller_id).trim();
    }
    const raw = c.recording_name || c.original_filename || '';
    const cleaned = String(raw)
      .replace(/^rec_/i, '')
      .replace(/\.mp3.*$/i, '')
      .replace(/\s*\(Trade\s*#TRD_\d+\)/i, '')
      .trim();
    if (cleaned && !cleaned.toLowerCase().includes('missing')) return cleaned;
    if (c.status === 'missing_recording' || cleaned.toLowerCase().includes('missing')) return 'Missing Recording';
    return c.caller_id || `CAL-${c.id}`;
  };

  const getAdvisorDisplayName = (c: any) => {
    const raw = String(c.advisor_name || c.caller_name || c.dealer || '').trim();
    const isBad = !raw || /^W\d+$/i.test(raw) || /^(advisor\s*name|advisor|dealer|caller\s*name|unassigned|n\/a|—|-)$/i.test(raw);
    if (!isBad) {
      return raw;
    }
    const entry = findAdvisorEntry(c.dealer || c.advisor_name || c.caller_name);
    if (entry?.advisor_name) return entry.advisor_name;
    if (c.trades && c.trades[0]?.advisor_name && !/^(advisor\s*name|advisor)$/i.test(c.trades[0].advisor_name)) {
      return c.trades[0].advisor_name;
    }
    return 'FundsIndia Advisor';
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Extract unique advisors & teams for dropdowns
  const advisors = useMemo(() => {
    const set = new Set<string>();
    calls.forEach((c) => {
      const adv = getAdvisorDisplayName(c);
      if (adv && adv !== '—') set.add(adv);
    });
    return Array.from(set).sort();
  }, [calls]);

  const teams = useMemo(() => {
    const set = new Set<string>();
    calls.forEach((c) => {
      if (c.team && c.team.trim()) set.add(c.team.trim());
    });
    return Array.from(set).sort();
  }, [calls]);

  // Filter logic
  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const displayId = getCallDisplayId(c).toLowerCase();
        const advDisplay = getAdvisorDisplayName(c).toLowerCase();
        const idMatch = String(c.caller_id || c.id).toLowerCase().includes(q) || displayId.includes(q);
        const custMatch = String(c.customer_number || c.calling_number || '').includes(q);
        const clientMatch = String(c.client_code || c.client || '').toLowerCase().includes(q);
        const advMatch = String(c.advisor_name || c.dealer || '').toLowerCase().includes(q) || advDisplay.includes(q);
        if (!idMatch && !custMatch && !clientMatch && !advMatch) return false;
      }

      // Advisor
      if (advisorFilter !== 'all') {
        const adv = getAdvisorDisplayName(c);
        if (adv !== advisorFilter && c.advisor_name !== advisorFilter && c.dealer !== advisorFilter) return false;
      }

      // Team
      if (teamFilter !== 'all') {
        if ((c.team || '') !== teamFilter) return false;
      }

      // Call Type
      const isPre = c.classification === 'PRE_ORDER' || c.call_type === 'pre_order';
      const isScrap = c.classification === 'SCRAP' || c.call_type === 'scrap';
      const isRegular = !isPre && !isScrap;

      if (typeFilter === 'pre_order' && !isPre) return false;
      if (typeFilter === 'regular' && !isRegular) return false;
      if (typeFilter === 'scrap' && !isScrap) return false;

      // Client Prefix Filter
      if (clientPrefixFilter !== 'all') {
        const code = (c.client_code || c.client || '').toUpperCase().trim();
        if (!code.startsWith(clientPrefixFilter)) return false;
      }

      // Compliance Filter
      if (complianceFilter !== 'all') {
        const sc = (c as any).scorecard || (c as any).audit || c;
        const isFatal = Boolean(sc.is_fatal || (c as any).is_fatal || (c as any).scorecard_is_fatal);
        const isAudited = c.audit_status === 'AUDITED' || c.status === 'audited';
        if (complianceFilter === 'compliant' && (!isAudited || isFatal)) return false;
        if (complianceFilter === 'fatal' && (!isAudited || !isFatal)) return false;
        if (complianceFilter === 'pending' && isAudited) return false;
      }

      // Fatal Category Filter
      if (fatalCategoryFilter !== 'all') {
        const sc = (c as any).scorecard || (c as any).audit || c;
        if (fatalCategoryFilter === 'q1' && sc.q1_status !== 'FAIL') return false;
        if (fatalCategoryFilter === 'q2' && sc.q2_status !== 'FAIL') return false;
        if (fatalCategoryFilter === 'q5' && sc.q5_status !== 'FAIL') return false;
      }

      // Recording Source Filter
      if (recordingSourceFilter !== 'all') {
        const hasLocal = Boolean(c.storage_path && c.storage_path.trim() !== '');
        const hasUrl = Boolean(c.recording_url && c.recording_url.trim() !== '');
        if (recordingSourceFilter === 'downloaded' && !hasLocal) return false;
        if (recordingSourceFilter === 'tata_remote' && (!hasUrl || hasLocal)) return false;
        if (recordingSourceFilter === 'no_audio' && (hasLocal || hasUrl)) return false;
      }

      // Date Range Filter
      if (dateRange && dateRange !== 'All Dates') {
        const cDate = (c.call_date || '').slice(0, 10);
        const norm = (d: string) => {
          if (!d) return '';
          if (d.includes('-')) {
            const parts = d.split('-');
            if (parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
          return d;
        };
        const cNorm = norm(cDate);
        if (dateRange.includes(' - ')) {
          const [start, end] = dateRange.split(' - ').map(s => norm(s.trim()));
          if (cNorm && start && end && (cNorm < start || cNorm > end)) {
            return false;
          }
        } else {
          const target = norm(dateRange.trim());
          if (cNorm && target && cNorm !== target) {
            return false;
          }
        }
      }

      return true;
    });
  }, [
    calls,
    search,
    advisorFilter,
    teamFilter,
    typeFilter,
    statusFilter,
    clientPrefixFilter,
    complianceFilter,
    fatalCategoryFilter,
    recordingSourceFilter,
    dateRange,
  ]);

  // Paginated records
  const totalRecords = filteredCalls.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const pageCalls = filteredCalls.slice(startIndex, startIndex + pageSize);

  const toggleSelectAll = () => {
    if (selectedCallIds.size === pageCalls.length) {
      setSelectedCallIds(new Set());
    } else {
      setSelectedCallIds(new Set(pageCalls.map((c) => c.id)));
    }
  };

  const toggleSelectRow = (id: number) => {
    const next = new Set(selectedCallIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedCallIds(next);
  };

  const handleResetFilters = () => {
    setSearch('');
    setAdvisorFilter('all');
    setTeamFilter('all');
    setTypeFilter('all');
    setStatusFilter('all');
    setClientPrefixFilter('all');
    setComplianceFilter('all');
    setFatalCategoryFilter('all');
    setRecordingSourceFilter('all');
    setCurrentPage(1);
  };

  const [isExportingZip, setIsExportingZip] = useState(false);

  const handleExportZip = async (forcePreOrdersOnly = false) => {
    if (isExportingZip) return;
    try {
      setIsExportingZip(true);
      const params = new URLSearchParams();
      const token = getStoredToken();
      if (token) {
        params.set('token', token);
      }

      let filename = 'Pre_Order_Compliance_Calls_Backup.zip';

      if (forcePreOrdersOnly) {
        params.set('type', 'pre_order');
        filename = 'All_Pre_Order_Calls_Backup.zip';
      } else if (selectedCallIds.size > 0) {
        params.set('ids', Array.from(selectedCallIds).join(','));
        filename = `Pre_Order_Calls_${selectedCallIds.size}_Selected.zip`;
      } else {
        const effectiveType = typeFilter !== 'all' ? typeFilter : (initialFilter || 'pre_order');
        params.set('type', effectiveType);
        if (effectiveType === 'pre_order') {
          filename = 'Pre_Order_Compliance_Calls_Backup.zip';
        } else if (effectiveType === 'regular') {
          filename = 'Regular_Calls_Backup.zip';
        } else {
          filename = 'Calls_Backup.zip';
        }
      }

      if (!forcePreOrdersOnly && selectedCallIds.size === 0) {
        if (advisorFilter !== 'all') params.set('advisor', advisorFilter);
        if (search) params.set('search', search);
      }

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['X-AuditEQ-Token'] = token;
      }

      const response = await fetch(`/api/calls/download-zip?${params.toString()}`, {
        headers,
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `HTTP ${response.status}`;
        try {
          const json = JSON.parse(errText);
          errMsg = json.message || json.error || errMsg;
        } catch {
          errMsg = errText.slice(0, 200) || errMsg;
        }
        throw new Error(errMsg);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 1000);
    } catch (err: any) {
      console.error('Failed to export ZIP:', err);
      alert(`Export failed: ${err?.message || 'Unable to download call recordings archive.'}`);
    } finally {
      setIsExportingZip(false);
    }
  };

  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const handleExportCsv = async (forcePreOrdersOnly = false) => {
    if (isExportingCsv) return;
    try {
      setIsExportingCsv(true);
      const params = new URLSearchParams();
      const token = getStoredToken();
      if (token) {
        params.set('token', token);
      }

      let filename = 'Pre_Order_Compliance_Calls.csv';

      if (forcePreOrdersOnly) {
        params.set('type', 'pre_order');
        filename = 'All_Pre_Order_Compliance_Calls.csv';
      } else if (selectedCallIds.size > 0) {
        params.set('ids', Array.from(selectedCallIds).join(','));
        filename = `Selected_Compliance_Calls_${selectedCallIds.size}.csv`;
      } else {
        const effectiveType = typeFilter !== 'all' ? typeFilter : (initialFilter || 'pre_order');
        params.set('type', effectiveType);
        if (effectiveType === 'pre_order') {
          filename = 'Pre_Order_Compliance_Calls.csv';
        } else if (effectiveType === 'regular') {
          filename = 'Regular_Calls.csv';
        } else {
          filename = 'Calls_Export.csv';
        }
      }

      if (!forcePreOrdersOnly && selectedCallIds.size === 0) {
        if (advisorFilter !== 'all') params.set('advisor', advisorFilter);
        if (search) params.set('search', search);
      }

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['X-AuditEQ-Token'] = token;
      }

      const response = await fetch(`/api/calls/export-csv?${params.toString()}`, {
        headers,
      });

      if (!response.ok) {
        const errText = await response.text();
        let errMsg = `HTTP ${response.status}`;
        try {
          const json = JSON.parse(errText);
          errMsg = json.message || json.error || errMsg;
        } catch {
          errMsg = errText.slice(0, 200) || errMsg;
        }
        throw new Error(errMsg);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }, 1000);
    } catch (err: any) {
      console.error('Failed to export CSV:', err);
      alert(`Export failed: ${err?.message || 'Unable to download CSV entries.'}`);
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleDownloadSingleCall = async (c: CallRecord) => {
    try {
      const token = getStoredToken();
      const url = `/api/calls/${c.id}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        throw new Error(`Download failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.setAttribute('download', c.original_filename || c.recording_name || `call_${c.id}.mp3`);
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl);
        document.body.removeChild(a);
      }, 1000);
    } catch (err: any) {
      alert(`Could not download recording: ${err?.message || 'File not found'}`);
    }
  };

  // If a call detail is active, render the Call Details View (matching Bottom-Right of Reference Screenshot)
  if (activeCallDetail) {
    const isPre = activeCallDetail.classification === 'PRE_ORDER' || activeCallDetail.call_type === 'pre_order';
    const hasTranscript = Boolean(activeCallDetail.transcript && activeCallDetail.transcript.trim().length >= 15);
    const isMissingRecording = (activeCallDetail.status as string) === 'missing_recording' || (activeCallDetail.audit_status as string) === 'MISSING_AUDIO' || (!activeCallDetail.storage_path && !hasTranscript);
    const isAudited = (activeCallDetail.audit_status === 'AUDITED' || activeCallDetail.status === 'audited') && hasTranscript;
    const sc = (activeCallDetail as any).scorecard || (activeCallDetail as any).audit || activeCallDetail;
    const rawScore = typeof sc.score === 'number'
      ? sc.score
      : (typeof activeCallDetail.score === 'number'
          ? activeCallDetail.score
          : ((activeCallDetail as any).scorecard_score ?? null));
    const isFatal = Boolean(
      sc.is_fatal ||
      (sc as any).scorecard_is_fatal ||
      (activeCallDetail as any).is_fatal ||
      (activeCallDetail as any).scorecard_is_fatal ||
      (isAudited && rawScore === 0)
    );
    const callScore = isAudited ? (rawScore !== null ? rawScore : (isFatal ? 0 : 5)) : null;

    const q1Pass = isAudited && (sc.q1_status || (activeCallDetail as any).q1_status || sc.q1 || (activeCallDetail as any).q1) === 'PASS';
    const q2Pass = isAudited && (sc.q2_status || (activeCallDetail as any).q2_status || sc.q2 || (activeCallDetail as any).q2) === 'PASS';
    const q3Pass = isAudited && (sc.q3_status || (activeCallDetail as any).q3_status || sc.q3 || (activeCallDetail as any).q3) === 'PASS';
    const rawQ4 = sc.q4_status || (activeCallDetail as any).q4_status || sc.q4 || (activeCallDetail as any).q4;
    const q4Pass = isAudited && (rawQ4 ? rawQ4 === 'PASS' : true);
    const q5Pass = isAudited && (sc.q5_status || (activeCallDetail as any).q5_status || sc.q5 || (activeCallDetail as any).q5) === 'PASS';

    return (
      <div className="p-3 sm:p-5 space-y-5 max-w-[1600px] w-full mx-auto text-gray-200">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <button
              onClick={() => setActiveCallDetail(null)}
              className="hover:text-white flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft size={13} />
              <span>Calls</span>
            </button>
            <span>/</span>
            <span className="text-white font-mono">{activeCallDetail.caller_id || `CAL-${activeCallDetail.id}`}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveCallDetail(null)}
              className="px-3 py-1.5 rounded-lg bg-[#161B22] border border-[#21262D] text-gray-300 hover:text-white text-xs font-medium cursor-pointer transition-colors"
            >
              Back to Calls
            </button>
            <button
              onClick={() => handleDownloadSingleCall(activeCallDetail)}
              className="px-3 py-1.5 rounded-lg bg-[#161B22] border border-[#21262D] text-gray-300 hover:text-white text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5"
              title="Download call audio recording (.mp3)"
            >
              <Download size={13} />
              <span>Download</span>
            </button>
            <button
              className="px-3 py-1.5 rounded-lg bg-[#161B22] border border-[#21262D] text-gray-300 hover:text-white text-xs font-medium cursor-pointer transition-colors flex items-center gap-1.5"
            >
              <Share2 size={13} />
              <span>Share</span>
            </button>

            {/* Quick Auditor Manual Reclassification Buttons */}
            {isPre ? (
              <>
                <button
                  type="button"
                  disabled={isReclassifying[activeCallDetail.id]}
                  onClick={() => handleReclassifyCall(activeCallDetail.id, 'regular')}
                  className="px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  title="Manually move this call to Regular Calls and exclude from compliance audit"
                >
                  <ArrowRightLeft size={13} className="text-amber-400" />
                  <span>Change to Regular</span>
                </button>
                <button
                  type="button"
                  disabled={isReclassifying[activeCallDetail.id]}
                  onClick={() => handleReclassifyCall(activeCallDetail.id, 'scrap')}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-700/50 text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                  title="Manually move this call to Scrap Calls"
                >
                  <Trash2 size={13} className="text-rose-400" />
                  <span>Mark as Scrap</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={isReclassifying[activeCallDetail.id]}
                onClick={() => handleReclassifyCall(activeCallDetail.id, 'pre_order')}
                className="px-3 py-1.5 rounded-lg bg-blue-950/80 hover:bg-blue-900 text-blue-300 border border-blue-600/50 text-xs font-medium cursor-pointer transition-all flex items-center gap-1.5 shadow-xs disabled:opacity-50"
                title="Designate this call as Pre-Order Call for compliance audit"
              >
                <ArrowRightLeft size={13} className="text-blue-400" />
                <span>Mark as Pre-Order</span>
              </button>
            )}
          </div>
        </div>

        {/* Call Details Header */}
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Call Details</h2>
          <p className="text-xs text-gray-400 mt-0.5">Full call information, transcript and audit results</p>
        </div>

        {/* 2-Column Layout matching Reference Screenshot */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Area: Audio Player + Transcript/Segments Tabs */}
          <div className="lg:col-span-8 space-y-4">
            {/* Real Audio Player with Scrubbable Dual-Channel Waveform */}
            <div className="bg-[#161B22] border border-[#21262D] rounded-xl p-4 space-y-3 shadow-xl">
              <audio
                ref={audioRef}
                src={activeCallDetail ? getAudioUrl(activeCallDetail.id) : ''}
                onTimeUpdate={() => setCurrentAudioTime(audioRef.current?.currentTime || 0)}
                onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || activeCallDetail.duration_seconds || 0)}
                onEnded={() => setIsPlayingAudio(false)}
                onPlay={() => setIsPlayingAudio(true)}
                onPause={() => setIsPlayingAudio(false)}
              />

              {/* High-Tech Interactive Audio Waveform Visualizer */}
              <AudioWaveformVisualizer
                duration={audioDuration || activeCallDetail.duration_seconds || 60}
                currentTime={currentAudioTime}
                isPlaying={isPlayingAudio}
                onSeek={(time) => {
                  setCurrentAudioTime(time);
                  if (audioRef.current) audioRef.current.currentTime = time;
                }}
                seed={activeCallDetail?.id || 42}
                height={50}
                barCount={72}
              />

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-1">
                <button
                  onClick={() => {
                    if (!audioRef.current) return;
                    if (isPlayingAudio) {
                      audioRef.current.pause();
                    } else {
                      audioRef.current.play().catch(() => {});
                    }
                  }}
                  className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-md transition-colors cursor-pointer"
                  title={isPlayingAudio ? 'Pause' : 'Play'}
                >
                  {isPlayingAudio ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
                </button>

                {/* Scrubber / Progress Bar */}
                <div className="flex-1 w-full flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={audioDuration || activeCallDetail.duration_seconds || 1}
                    step={0.1}
                    value={currentAudioTime}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setCurrentAudioTime(val);
                      if (audioRef.current) audioRef.current.currentTime = val;
                    }}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Speed, Time, Volume, Download & Live Visualizer */}
                <div className="flex items-center gap-3 shrink-0 text-xs text-gray-400 font-mono">
                <LiveAudioVisualizer
                  isActive={isPlayingAudio}
                  barCount={14}
                  height={20}
                  variant="cyan-emerald"
                  label="Nova-3 Telemetry"
                  className="hidden md:inline-flex"
                />

                <button
                  onClick={() => {
                    const speeds = [0.75, 1, 1.25, 1.5, 2];
                    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
                    setPlaybackRate(next);
                    if (audioRef.current) audioRef.current.playbackRate = next;
                  }}
                  className="px-1.5 py-0.5 rounded bg-[#21262D] text-gray-300 text-[11px] hover:bg-[#30363D] cursor-pointer"
                  title="Toggle Playback Speed"
                >
                  {playbackRate}x
                </button>
                <span>
                  {formatSeconds(currentAudioTime)} / {formatSeconds(audioDuration || activeCallDetail.duration_seconds || 0)}
                </span>
                <button
                  onClick={() => {
                    if (!audioRef.current) return;
                    const nextMute = !isMuted;
                    setIsMuted(nextMute);
                    audioRef.current.muted = nextMute;
                  }}
                  className="text-gray-400 hover:text-white cursor-pointer"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <a
                  href={activeCallDetail ? getAudioUrl(activeCallDetail.id) : '#'}
                  download={activeCallDetail?.recording_name || `call_${activeCallDetail?.id}.mp3`}
                  className="text-gray-400 hover:text-white cursor-pointer"
                  title="Download Recording"
                >
                  <Download size={16} />
                </a>
                <a
                  href={api.getSebiAuditPdfUrl(activeCallDetail.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={`SEBI_Audit_Certificate_Call_${activeCallDetail.id}.pdf`}
                  className="px-2.5 py-1 rounded-lg bg-emerald-950/50 hover:bg-emerald-900/70 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 transition-colors shadow-sm ml-1"
                  title="Download SEBI Official Formatted PDF Audit Certificate"
                >
                  <FileText size={12} className="text-emerald-400" />
                  <span>SEBI PDF</span>
                </a>
              </div>
            </div>
          </div>

          {/* Dual Tabs: Transcript vs Segments */}
            <div className="bg-[#161B22] border border-[#21262D] rounded-xl overflow-hidden">
              <div className="border-b border-[#21262D] px-4 pt-2 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setActiveDetailTab('transcript')}
                    className={`pb-2.5 text-xs font-semibold tracking-wide border-b-2 transition-colors cursor-pointer ${
                      activeDetailTab === 'transcript'
                        ? 'border-blue-500 text-white'
                        : 'border-transparent text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    Transcript
                  </button>
                  <button
                    onClick={() => setActiveDetailTab('segments')}
                    className={`pb-2.5 text-xs font-semibold tracking-wide border-b-2 transition-colors cursor-pointer ${
                      activeDetailTab === 'segments'
                        ? 'border-blue-500 text-white'
                        : 'border-transparent text-gray-400 hover:text-gray-300'
                    }`}
                  >
                    Segments
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    playCall({
                      callId: activeCallDetail.id,
                      callerId: activeCallDetail.caller_id || `Call #${activeCallDetail.id}`,
                      clientCode: activeCallDetail.client_code || activeCallDetail.client,
                      advisorName: activeCallDetail.advisor_name || activeCallDetail.dealer,
                      date: activeCallDetail.call_date,
                      transcript: activeCallDetail.transcript,
                      segments: detailedSegments,
                    })
                  }
                  className="pb-2 text-[11px] text-teal-300 hover:text-teal-200 font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Stream call into cinema subtitle prompter"
                >
                  <Play size={11} className="fill-current text-teal-400" />
                  <span>Subtitle Prompter</span>
                </button>
              </div>

              {/* Transcript & Segments Pane */}
              <div className="p-4 max-h-[460px] overflow-y-auto space-y-3.5 text-xs leading-relaxed">
                {activeDetailTab === 'transcript' ? (
                  <div>
                    {/* Official Call URL Section */}
                    <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 text-xs space-y-1.5 mb-4 font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                          <Phone size={12} className="text-cyan-400" />
                          <span>Call</span>
                        </span>
                        {(activeCallDetail.recording_url || getAudioUrl(activeCallDetail.id)) && (
                          <button
                            type="button"
                            onClick={() => {
                              const u = activeCallDetail.recording_url || `${window.location.origin}${getAudioUrl(activeCallDetail.id)}`;
                              navigator.clipboard.writeText(u);
                              alert('Call recording link copied to clipboard!');
                            }}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                            title="Copy Call Recording Link"
                          >
                            <Copy size={11} />
                            <span>Copy URL</span>
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] text-cyan-200 break-all select-all font-mono">
                        {activeCallDetail.recording_url ? (
                          <a
                            href={activeCallDetail.recording_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:underline text-cyan-300"
                          >
                            {activeCallDetail.recording_url}
                          </a>
                        ) : (
                          <span className="text-gray-400">
                            {window.location.origin}{getAudioUrl(activeCallDetail.id)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Official Transcription Header & Action */}
                    <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#21262D]">
                      <span className="text-xs font-bold text-white tracking-wide uppercase font-sans">
                        Transcription
                      </span>
                      {activeCallDetail.transcript && activeCallDetail.transcript.trim() && (
                        <button
                          type="button"
                          onClick={() => {
                            const advName = cleanCallerName(activeCallDetail.advisor_name || activeCallDetail.dealer || 'Advisor');
                            const clName = (activeCallDetail as any).client_name || activeCallDetail.client || 'Client';
                            const rawUrl = activeCallDetail.recording_url || `${window.location.origin}${getAudioUrl(activeCallDetail.id)}`;
                            const lines = activeCallDetail.transcript!.split('\n').filter(l => l.trim().length > 0);
                            const formatted = lines.map((l) => {
                              const isAdv = /^(?:A|ADVISOR|DEALER|Broker):/i.test(l) || l.includes('Advisor:') || l.includes('Broker:');
                              const clean = l.replace(/^(?:A|ADVISOR|DEALER|C|CLIENT|CUSTOMER|Broker\/Advisor|Broker):\s*/i, '').replace(/^\[\d{1,2}:\d{2}\]\s*/, '').trim();
                              return isAdv
                                ? `**Broker/Advisor (${advName}):** ${clean}`
                                : `**Client (${clName}):** ${clean}`;
                            }).join('\n\n');
                            const fullExport = `Call\n${rawUrl}\n\nTranscription\n${formatted}`;
                            navigator.clipboard.writeText(fullExport);
                            alert('Transcription copied in official format!');
                          }}
                          className="text-[11px] font-semibold text-teal-300 hover:text-teal-200 flex items-center gap-1 cursor-pointer transition-colors"
                          title="Copy transcription with Call URL and bold speaker titles"
                        >
                          <Copy size={11} />
                          <span>Copy Formatted Transcript</span>
                        </button>
                      )}
                    </div>

                    {activeCallDetail.transcript && activeCallDetail.transcript.trim() ? (
                      (() => {
                        const lines = activeCallDetail.transcript.split('\n').filter(l => l.trim().length > 0);
                        const advName = cleanCallerName(activeCallDetail.advisor_name || activeCallDetail.dealer || 'Advisor');
                        const clName = (activeCallDetail as any).client_name || activeCallDetail.client || 'Client';

                        return lines.map((line, idx) => {
                          const isAdvisor = /^(?:A|ADVISOR|DEALER|Broker):/i.test(line) || line.includes('Advisor:') || line.includes('Broker:');
                          const cleanText = line.replace(/^(?:A|ADVISOR|DEALER|C|CLIENT|CUSTOMER|Broker\/Advisor|Broker):\s*/i, '').replace(/^\[\d{1,2}:\d{2}\]\s*/, '');
                          const timeMatch = line.match(/^\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?/);
                          const segTime = detailedSegments[idx]?.start_time;
                          const timeStr = timeMatch
                            ? timeMatch[1]
                            : (typeof segTime === 'number'
                                ? formatSeconds(segTime)
                                : `00:${idx * 3 < 10 ? '0' : ''}${idx * 3}`);

                          const sec = typeof segTime === 'number' ? segTime : parseTimeToSeconds(timeStr);
                          const nextSec = idx < lines.length - 1
                            ? (typeof detailedSegments[idx + 1]?.start_time === 'number'
                                ? detailedSegments[idx + 1].start_time
                                : sec + 4)
                            : sec + 4;
                          const isLineActive = currentAudioTime >= sec && currentAudioTime < nextSec;

                          const words = cleanText.split(/\s+/);
                          const lineDuration = Math.max(1, nextSec - sec);
                          const progress = Math.min(1, Math.max(0, (currentAudioTime - sec) / lineDuration));
                          const activeWordIndex = isLineActive ? Math.min(words.length - 1, Math.floor(progress * words.length)) : -1;

                          return (
                            <div
                              key={idx}
                              onClick={() => {
                                if (audioRef.current) {
                                  audioRef.current.currentTime = sec;
                                  setCurrentAudioTime(sec);
                                  audioRef.current.play().catch(() => {});
                                }
                              }}
                              className={`flex flex-col gap-1 p-2.5 rounded-xl transition-all cursor-pointer mb-2 ${
                                isLineActive
                                  ? 'bg-blue-600/15 border border-blue-500/40 shadow-sm ring-1 ring-blue-500/30'
                                  : 'hover:bg-white/5 border border-transparent'
                              }`}
                              title="Click to seek audio to this timestamp"
                            >
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-[10px] shrink-0 ${isLineActive ? 'text-blue-400 font-bold' : 'text-gray-500'}`}>
                                  {timeStr}
                                </span>
                                <span className="font-bold text-white text-[11px]">
                                  {isAdvisor ? `**Broker/Advisor (${advName}):**` : `**Client (${clName}):**`}
                                </span>
                              </div>
                              <p className="leading-relaxed pl-6 flex flex-wrap gap-1 text-gray-200">
                                {words.map((word, wIdx) => {
                                  const isWordCurrent = isLineActive && wIdx === activeWordIndex;
                                  const isWordSpoken = isLineActive && wIdx < activeWordIndex;
                                  return (
                                    <span
                                      key={wIdx}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const wordOffset = sec + (wIdx / Math.max(1, words.length)) * lineDuration;
                                        if (audioRef.current) {
                                          audioRef.current.currentTime = wordOffset;
                                          setCurrentAudioTime(wordOffset);
                                          audioRef.current.play().catch(() => {});
                                        }
                                      }}
                                      className={`rounded px-0.5 transition-colors ${
                                        isWordCurrent
                                          ? 'bg-cyan-400 text-slate-950 font-bold shadow-xs'
                                          : isWordSpoken
                                          ? 'text-cyan-200'
                                          : 'text-gray-200'
                                      }`}
                                    >
                                      {word}
                                    </span>
                                  );
                                })}
                              </p>
                            </div>
                          );
                        });
                      })()
                    ) : (
                      <div className="p-8 text-center space-y-2">
                        <div className="text-amber-400 font-mono text-sm font-semibold">
                          {isMissingRecording ? 'No Audio Recording Found (404 Cloud Storage)' : 'No Transcript Recorded Yet'}
                        </div>
                        <p className="text-gray-400 text-xs max-w-md mx-auto">
                          {isMissingRecording 
                            ? 'The call recording link returned HTTP 404 from provider storage and no local file exists. SEBI compliance audits require a genuine audio recording.'
                            : 'This call has not been processed through Deepgram Nova-3. Upload audio or run the pipeline to generate a genuine transcript.'}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Segments Tab */
                  detailedSegments.length > 0 ? (
                    detailedSegments.map((seg: any, idx: number) => {
                      const isAdv = String(seg.speaker).toUpperCase() === 'ADVISOR';
                      const startFmt = typeof seg.start_time === 'number'
                        ? `${Math.floor(seg.start_time / 60).toString().padStart(2, '0')}:${(seg.start_time % 60).toFixed(1).padStart(4, '0')}`
                        : '00:00.0';
                      const endFmt = typeof seg.end_time === 'number'
                        ? `${Math.floor(seg.end_time / 60).toString().padStart(2, '0')}:${(seg.end_time % 60).toFixed(1).padStart(4, '0')}`
                        : '00:00.0';
                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            if (audioRef.current && typeof seg.start_time === 'number') {
                              audioRef.current.currentTime = seg.start_time;
                              setCurrentAudioTime(seg.start_time);
                              audioRef.current.play().catch(() => {});
                            }
                          }}
                          className="p-3 bg-[#0D1117] border border-[#21262D] rounded-lg space-y-1.5 font-mono text-xs cursor-pointer hover:border-blue-500/50 transition-colors"
                          title="Click to seek audio to this segment"
                        >
                          <div className="flex items-center justify-between text-[11px] text-gray-400">
                            <span className="text-blue-400 font-bold">{startFmt} → {endFmt}</span>
                            <span className={`px-1.5 py-0.2 rounded font-bold text-[10px] ${isAdv ? 'bg-blue-500/15 text-blue-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                              {seg.speaker || 'UNKNOWN'}
                            </span>
                          </div>
                          <p className="font-sans text-gray-200">{seg.text}</p>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-gray-500 font-mono text-xs">
                      No segments available for this call.
                    </div>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Right Area: Call Information Card & Scorecard Card */}
          <div className="lg:col-span-4 space-y-4">
            {/* Call Information Card */}
            <div className="bg-[#161B22] border border-[#21262D] rounded-xl p-4.5 space-y-3">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Call Information</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Call ID</span>
                  <span className="font-mono text-white">{activeCallDetail.caller_id || `CAL-${activeCallDetail.id}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Date</span>
                  <span className="text-gray-200">{activeCallDetail.call_date || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Time</span>
                  <span className="font-mono text-gray-200">{activeCallDetail.call_time || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Duration</span>
                  <span className="font-mono text-gray-200">{activeCallDetail.duration_seconds || 0}s</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Advisor</span>
                  <span className="text-gray-200">{activeCallDetail.advisor_name || activeCallDetail.dealer || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Customer</span>
                  <span className="font-mono text-gray-200">{activeCallDetail.customer_number || activeCallDetail.calling_number || (activeCallDetail as any).registered_number || (activeCallDetail as any).trade_phone || (activeCallDetail as any).phone_number || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Client Code</span>
                  <span className="font-mono text-white font-bold">{activeCallDetail.client_code || activeCallDetail.client || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Call Type</span>
                  <select
                    value={activeCallDetail.call_type || (isPre ? 'pre_order' : 'regular')}
                    disabled={isReclassifying[activeCallDetail.id]}
                    onChange={(e) => handleReclassifyCall(activeCallDetail.id, e.target.value as any)}
                    className="bg-[#0D1117] border border-[#30363D] text-xs font-medium rounded px-2 py-1 text-white focus:ring-1 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                  >
                    <option value="pre_order">Pre-Order</option>
                    <option value="regular">Regular</option>
                    <option value="scrap">Scrap</option>
                  </select>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Trade No.</span>
                  <span className="font-mono text-gray-200">{activeCallDetail.matched_trade_id ? `TRD-${activeCallDetail.matched_trade_id}` : '—'}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-[#21262D]">
                  <span className="text-gray-400">Status</span>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-medium ${
                      isAudited
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : isMissingRecording
                        ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        : activeCallDetail.processing_status === 'PROCESSING'
                        ? 'bg-blue-500/15 text-blue-400'
                        : 'bg-gray-800 text-gray-400'
                    }`}
                  >
                    {isAudited ? 'Completed' : isMissingRecording ? 'Missing Recording' : (activeCallDetail.processing_status === 'PROCESSING' ? 'Processing' : 'Not Audited')}
                  </span>
                </div>
              </div>
            </div>

            {/* Scorecard Card matching Reference Screenshot with Live Auditor Override */}
            <div className="bg-[#161B22] border border-[#21262D] rounded-xl p-4.5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">Scorecard</h3>
                  <p className="text-[10px] text-blue-400 font-medium mt-0.5">Click badge to toggle PASS / FAIL</p>
                </div>
                <div className="flex items-center gap-2">
                  {isAudited ? (
                    <>
                      <span className="text-xl font-black text-white font-mono">{callScore} / 5</span>
                      {isFatal && <span className="text-[10px] text-rose-400 font-bold">Fatal Violation</span>}
                      {!isFatal && callScore === 5 && <span className="text-[10px] text-emerald-400 font-bold">Compliant (5/5)</span>}
                      {!isFatal && callScore === 4 && <span className="text-[10px] text-amber-400 font-bold">4/5 Score</span>}
                      {!isFatal && callScore === 3 && <span className="text-[10px] text-amber-400 font-bold">3/5 Score</span>}
                    </>
                  ) : (
                    <>
                      <span className="text-xl font-black text-gray-500 font-mono">— / 5</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                        isMissingRecording ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-gray-800 text-gray-400'
                      }`}>
                        {isMissingRecording ? 'MISSING RECORDING' : 'NOT AUDITED'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Questions List with Interactive Auditor Editing */}
              <div className="space-y-2.5 text-xs">
                {/* Q1 */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-[#0D1117] border border-[#21262D] hover:border-gray-600 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-300">Q1</span>
                    <span className="text-gray-300">Customer Identity</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!activeCallDetail || isUpdatingCompliance) return;
                      const nextStatus = (isAudited ? q1Pass : false) ? 'FAIL' : 'PASS';
                      setIsUpdatingCompliance(true);
                      try {
                        const res = await api.overrideCallCompliance(activeCallDetail.id, { q1_status: nextStatus });
                        if (res.ok && res.scorecard) {
                          setActiveCallDetail((prev: any) => prev ? {
                            ...prev,
                            status: 'audited',
                            audit_status: 'AUDITED',
                            scorecard: res.scorecard,
                            score: res.scorecard.score,
                            is_fatal: res.scorecard.is_fatal,
                            q1_status: nextStatus,
                          } : null);
                          if (onRefresh) await onRefresh();
                        }
                      } catch (e: any) {
                        console.error('Failed to toggle Q1:', e);
                      } finally {
                        setIsUpdatingCompliance(false);
                      }
                    }}
                    disabled={isUpdatingCompliance}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold text-[10px] cursor-pointer transition-all hover:scale-105 active:scale-95 border ${
                      isAudited
                        ? q1Pass
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                        : 'bg-[#21262D] text-gray-300 border-gray-600 hover:bg-[#30363D]'
                    }`}
                    title="Click to toggle PASS / FAIL"
                  >
                    {isAudited ? (
                      q1Pass ? <><Check size={11} className="text-emerald-400" /> PASS</> : <><X size={11} className="text-rose-400" /> FAIL</>
                    ) : (
                      <span>Set Status</span>
                    )}
                    <Edit3 size={10} className="opacity-60" />
                  </button>
                </div>

                {/* Q2 */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-[#0D1117] border border-[#21262D] hover:border-gray-600 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-300">Q2</span>
                    <span className="text-gray-300">Client Code Verification</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!activeCallDetail || isUpdatingCompliance) return;
                      const nextStatus = (isAudited ? q2Pass : false) ? 'FAIL' : 'PASS';
                      setIsUpdatingCompliance(true);
                      try {
                        const res = await api.overrideCallCompliance(activeCallDetail.id, { q2_status: nextStatus });
                        if (res.ok && res.scorecard) {
                          setActiveCallDetail((prev: any) => prev ? {
                            ...prev,
                            status: 'audited',
                            audit_status: 'AUDITED',
                            scorecard: res.scorecard,
                            score: res.scorecard.score,
                            is_fatal: res.scorecard.is_fatal,
                            q2_status: nextStatus,
                          } : null);
                          if (onRefresh) await onRefresh();
                        }
                      } catch (e: any) {
                        console.error('Failed to toggle Q2:', e);
                      } finally {
                        setIsUpdatingCompliance(false);
                      }
                    }}
                    disabled={isUpdatingCompliance}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold text-[10px] cursor-pointer transition-all hover:scale-105 active:scale-95 border ${
                      isAudited
                        ? q2Pass
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                        : 'bg-[#21262D] text-gray-300 border-gray-600 hover:bg-[#30363D]'
                    }`}
                    title="Click to toggle PASS / FAIL"
                  >
                    {isAudited ? (
                      q2Pass ? <><Check size={11} className="text-emerald-400" /> PASS</> : <><X size={11} className="text-rose-400" /> FAIL</>
                    ) : (
                      <span>Set Status</span>
                    )}
                    <Edit3 size={10} className="opacity-60" />
                  </button>
                </div>

                {/* Q3 */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-[#0D1117] border border-[#21262D] hover:border-gray-600 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-300">Q3</span>
                    <span className="text-gray-300">Order Details</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!activeCallDetail || isUpdatingCompliance) return;
                      const nextStatus = (isAudited ? q3Pass : false) ? 'FAIL' : 'PASS';
                      setIsUpdatingCompliance(true);
                      try {
                        const res = await api.overrideCallCompliance(activeCallDetail.id, { q3_status: nextStatus });
                        if (res.ok && res.scorecard) {
                          setActiveCallDetail((prev: any) => prev ? {
                            ...prev,
                            status: 'audited',
                            audit_status: 'AUDITED',
                            scorecard: res.scorecard,
                            score: res.scorecard.score,
                            is_fatal: res.scorecard.is_fatal,
                            q3_status: nextStatus,
                          } : null);
                          if (onRefresh) await onRefresh();
                        }
                      } catch (e: any) {
                        console.error('Failed to toggle Q3:', e);
                      } finally {
                        setIsUpdatingCompliance(false);
                      }
                    }}
                    disabled={isUpdatingCompliance}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold text-[10px] cursor-pointer transition-all hover:scale-105 active:scale-95 border ${
                      isAudited
                        ? q3Pass
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                        : 'bg-[#21262D] text-gray-300 border-gray-600 hover:bg-[#30363D]'
                    }`}
                    title="Click to toggle PASS / FAIL"
                  >
                    {isAudited ? (
                      q3Pass ? <><Check size={11} className="text-emerald-400" /> PASS</> : <><X size={11} className="text-rose-400" /> FAIL</>
                    ) : (
                      <span>Set Status</span>
                    )}
                    <Edit3 size={10} className="opacity-60" />
                  </button>
                </div>

                {/* Q4 */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-[#0D1117] border border-[#21262D] hover:border-gray-600 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-300">Q4</span>
                    <span className="text-gray-300">Customer Acknowledgement</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!activeCallDetail || isUpdatingCompliance) return;
                      const nextStatus = (isAudited ? q4Pass : false) ? 'FAIL' : 'PASS';
                      setIsUpdatingCompliance(true);
                      try {
                        const res = await api.overrideCallCompliance(activeCallDetail.id, { q4_status: nextStatus });
                        if (res.ok && res.scorecard) {
                          setActiveCallDetail((prev: any) => prev ? {
                            ...prev,
                            status: 'audited',
                            audit_status: 'AUDITED',
                            scorecard: res.scorecard,
                            score: res.scorecard.score,
                            is_fatal: res.scorecard.is_fatal,
                            q4_status: nextStatus,
                          } : null);
                          if (onRefresh) await onRefresh();
                        }
                      } catch (e: any) {
                        console.error('Failed to toggle Q4:', e);
                      } finally {
                        setIsUpdatingCompliance(false);
                      }
                    }}
                    disabled={isUpdatingCompliance}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold text-[10px] cursor-pointer transition-all hover:scale-105 active:scale-95 border ${
                      isAudited
                        ? q4Pass
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                        : 'bg-[#21262D] text-gray-300 border-gray-600 hover:bg-[#30363D]'
                    }`}
                    title="Click to toggle PASS / FAIL"
                  >
                    {isAudited ? (
                      q4Pass ? <><Check size={11} className="text-emerald-400" /> PASS</> : <><X size={11} className="text-rose-400" /> FAIL</>
                    ) : (
                      <span>Set Status</span>
                    )}
                    <Edit3 size={10} className="opacity-60" />
                  </button>
                </div>

                {/* Q5 */}
                <div className="flex items-center justify-between p-2 rounded-lg bg-[#0D1117] border border-[#21262D] hover:border-gray-600 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-300">Q5</span>
                    <span className="text-gray-300">Return Guarantee</span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!activeCallDetail || isUpdatingCompliance) return;
                      const nextStatus = (isAudited ? q5Pass : false) ? 'FAIL' : 'PASS';
                      setIsUpdatingCompliance(true);
                      try {
                        const res = await api.overrideCallCompliance(activeCallDetail.id, { q5_status: nextStatus });
                        if (res.ok && res.scorecard) {
                          setActiveCallDetail((prev: any) => prev ? {
                            ...prev,
                            status: 'audited',
                            audit_status: 'AUDITED',
                            scorecard: res.scorecard,
                            score: res.scorecard.score,
                            is_fatal: res.scorecard.is_fatal,
                            q5_status: nextStatus,
                          } : null);
                          if (onRefresh) await onRefresh();
                        }
                      } catch (e: any) {
                        console.error('Failed to toggle Q5:', e);
                      } finally {
                        setIsUpdatingCompliance(false);
                      }
                    }}
                    disabled={isUpdatingCompliance}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded font-bold text-[10px] cursor-pointer transition-all hover:scale-105 active:scale-95 border ${
                      isAudited
                        ? q5Pass
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                        : 'bg-[#21262D] text-gray-300 border-gray-600 hover:bg-[#30363D]'
                    }`}
                    title="Click to toggle PASS / FAIL"
                  >
                    {isAudited ? (
                      q5Pass ? <><Check size={11} className="text-emerald-400" /> PASS</> : <><X size={11} className="text-rose-400" /> FAIL</>
                    ) : (
                      <span>Set Status</span>
                    )}
                    <Edit3 size={10} className="opacity-60" />
                  </button>
                </div>
              </div>

              {/* Force Audit Action */}
              <button
                onClick={() => onForceAudit(activeCallDetail.id)}
                className="w-full mt-2 py-2 rounded-lg bg-[#21262D] hover:bg-[#2D333B] text-gray-200 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <RotateCcw size={13} />
                <span>Re-Audit Call</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Master Calls Table View (matching Top-Right of Reference Screenshot)
  return (
    <div className="p-3 sm:p-5 space-y-4 max-w-[1600px] w-full mx-auto text-gray-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">Calls</h2>
          <p className="text-xs text-gray-400 mt-0.5">View and manage all calls</p>
        </div>

        {/* Search, Date, Filters, Export */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search calls..."
              className="pl-8 pr-3 py-1.5 bg-[#161B22] border border-[#21262D] rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-48 sm:w-60 font-mono"
            />
          </div>

          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#161B22] border border-[#21262D] rounded-lg text-xs text-gray-300 font-mono">
            <Calendar size={13} className="text-gray-400" />
            <span>{computedDateRange}</span>
          </div>

          <button
            onClick={() => onRefresh?.()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors shadow-sm"
          >
            <Filter size={13} />
            <span>Filters</span>
          </button>

          <button
            onClick={() => handleExportZip(true)}
            disabled={isExportingZip}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors shadow-sm disabled:opacity-50"
            title="Download all 1,177 Pre-Order compliance call recordings as MP3 backup ZIP archive"
          >
            {isExportingZip ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            <span>{isExportingZip ? 'Packaging ZIP...' : 'Download All Pre-Orders (ZIP)'}</span>
          </button>

          <button
            onClick={() => handleExportCsv(true)}
            disabled={isExportingCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors shadow-sm disabled:opacity-50"
            title="Download all Pre-Order compliance call entries in CSV format in one click"
          >
            {isExportingCsv ? <Loader2 size={13} className="animate-spin" /> : <FileSpreadsheet size={13} />}
            <span>{isExportingCsv ? 'Generating CSV...' : 'Download Pre-Orders (CSV)'}</span>
          </button>

          <button
            onClick={() => handleExportZip(false)}
            disabled={isExportingZip}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161B22] border border-[#21262D] hover:bg-[#21262D] text-gray-300 hover:text-white rounded-lg text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
            title="Download filtered/selected calls as MP3 backup ZIP archive"
          >
            {isExportingZip ? <Loader2 size={13} className="animate-spin text-blue-400" /> : <Download size={13} />}
            <span>{isExportingZip ? 'Packaging...' : 'Export Calls (ZIP)'}</span>
          </button>

          <button
            onClick={() => handleExportCsv(false)}
            disabled={isExportingCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#161B22] border border-[#21262D] hover:bg-[#21262D] text-gray-300 hover:text-white rounded-lg text-xs font-medium cursor-pointer transition-colors disabled:opacity-50"
            title="Export filtered/selected calls in CSV format"
          >
            {isExportingCsv ? <Loader2 size={13} className="animate-spin text-emerald-400" /> : <FileSpreadsheet size={13} className="text-emerald-400" />}
            <span>{isExportingCsv ? 'Exporting...' : 'Export Calls (CSV)'}</span>
          </button>
        </div>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3 p-3 bg-[#161B22] border border-[#21262D] rounded-xl text-xs">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Advisor:</span>
          <select
            value={advisorFilter}
            onChange={(e) => { setAdvisorFilter(e.target.value); setCurrentPage(1); }}
            className="bg-[#0D1117] border border-[#21262D] rounded-md px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            {advisors.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400">Team:</span>
          <select
            value={teamFilter}
            onChange={(e) => { setTeamFilter(e.target.value); setCurrentPage(1); }}
            className="bg-[#0D1117] border border-[#21262D] rounded-md px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            {teams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400">Call Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
            className="bg-[#0D1117] border border-[#21262D] rounded-md px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="pre_order">Pre-Order</option>
            <option value="regular">Regular</option>
            <option value="scrap">Scrap</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400">Audit Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="bg-[#0D1117] border border-[#21262D] rounded-md px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="no_audit">No Audit</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Client Prefix:</span>
          <select
            value={clientPrefixFilter}
            onChange={(e) => { setClientPrefixFilter(e.target.value); setCurrentPage(1); }}
            className="bg-[#0D1117] border border-[#21262D] rounded-md px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-blue-500 font-mono"
          >
            <option value="all">All Prefixes</option>
            <option value="WIA">WIA</option>
            <option value="WIF">WIF</option>
            <option value="WIC">WIC</option>
            <option value="WID">WID</option>
            <option value="WIG">WIG</option>
            <option value="WIE">WIE</option>
            <option value="FIA">FIA</option>
            <option value="PWD">PWD</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400">Compliance:</span>
          <select
            value={complianceFilter}
            onChange={(e) => { setComplianceFilter(e.target.value); setCurrentPage(1); }}
            className="bg-[#0D1117] border border-[#21262D] rounded-md px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="compliant">Compliant (Pass 4-5)</option>
            <option value="fatal">Fatal Violation (Fail 0)</option>
            <option value="pending">Pending Audit</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400">Fatal Reason:</span>
          <select
            value={fatalCategoryFilter}
            onChange={(e) => { setFatalCategoryFilter(e.target.value); setCurrentPage(1); }}
            className="bg-[#0D1117] border border-[#21262D] rounded-md px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Violations</option>
            <option value="q1">Q1: Unregistered Phone</option>
            <option value="q2">Q2: Timing Violation</option>
            <option value="q5">Q5: Guaranteed Return</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-gray-400">Recording:</span>
          <select
            value={recordingSourceFilter}
            onChange={(e) => { setRecordingSourceFilter(e.target.value); setCurrentPage(1); }}
            className="bg-[#0D1117] border border-[#21262D] rounded-md px-2 py-1 text-gray-200 text-xs focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Sources</option>
            <option value="downloaded">Downloaded Locally</option>
            <option value="tata_remote">TataTele Col Y Link</option>
            <option value="no_audio">No Audio</option>
          </select>
        </div>

        <button
          onClick={handleResetFilters}
          className="ml-auto text-xs text-blue-400 hover:text-blue-300 font-medium cursor-pointer transition-colors"
        >
          Reset All
        </button>
      </div>

      {/* Bulk Action Bar for Reclassification */}
      {selectedCallIds.size > 0 && (
        <div className="bg-blue-950/40 border border-blue-600/40 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-blue-200">
            <span className="inline-flex items-center justify-center bg-blue-600 text-white font-bold rounded-full w-5 h-5 text-[10px]">
              {selectedCallIds.size}
            </span>
            <span>call{selectedCallIds.size > 1 ? 's' : ''} selected</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-medium mr-1">Change selected to:</span>
            <button
              type="button"
              disabled={isBulkReclassifying}
              onClick={() => handleBulkReclassify('regular')}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-600 cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-xs"
              title="Move selected calls to Regular (exclude from compliance audit)"
            >
              <ArrowRightLeft size={12} className="text-amber-400" />
              <span>Regular</span>
            </button>
            <button
              type="button"
              disabled={isBulkReclassifying}
              onClick={() => handleBulkReclassify('pre_order')}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-900/60 hover:bg-blue-800 text-blue-200 border border-blue-500/50 cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-xs"
              title="Designate selected calls as Pre-Order compliance calls"
            >
              <ArrowRightLeft size={12} className="text-blue-400" />
              <span>Pre-Order</span>
            </button>
            <button
              type="button"
              disabled={isBulkReclassifying}
              onClick={() => handleBulkReclassify('scrap')}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border border-rose-700/50 cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-xs"
              title="Mark selected calls as Scrap"
            >
              <Trash2 size={12} className="text-rose-400" />
              <span>Scrap</span>
            </button>
            <button
              type="button"
              disabled={isExportingZip}
              onClick={() => handleExportZip(false)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-950/60 hover:bg-blue-900 text-blue-300 border border-blue-500/50 cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-xs"
              title={`Download all ${selectedCallIds.size} selected call recordings as a ZIP archive`}
            >
              {isExportingZip ? <Loader2 size={12} className="animate-spin text-blue-400" /> : <Download size={12} className="text-blue-400" />}
              <span>{isExportingZip ? 'Packaging...' : `Download Selected ZIP (${selectedCallIds.size})`}</span>
            </button>
            <button
              type="button"
              disabled={isExportingCsv}
              onClick={() => handleExportCsv(false)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/50 cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-xs"
              title={`Export all ${selectedCallIds.size} selected call entries as a CSV spreadsheet`}
            >
              {isExportingCsv ? <Loader2 size={12} className="animate-spin text-emerald-400" /> : <FileSpreadsheet size={12} className="text-emerald-400" />}
              <span>{isExportingCsv ? 'Exporting...' : `Export Selected CSV (${selectedCallIds.size})`}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedCallIds(new Set())}
              className="text-xs text-gray-400 hover:text-white ml-2 cursor-pointer transition-colors"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Enterprise Master Grid */}
      <div className="bg-[#161B22] border border-[#21262D] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#0D1117] border-b border-[#21262D] text-gray-400 text-[11px] font-semibold sticky top-0 z-10 select-none">
              <tr>
                <th className="p-3 w-8">
                  <input
                    type="checkbox"
                    checked={pageCalls.length > 0 && selectedCallIds.size === pageCalls.length}
                    onChange={toggleSelectAll}
                    className="rounded border-[#21262D] bg-[#161B22] text-blue-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-2 font-medium">Call ID</th>
                <th className="py-3 px-2 font-medium">Date</th>
                <th className="py-3 px-2 font-medium">Time</th>
                <th className="py-3 px-2 font-medium">Advisor</th>
                <th className="py-3 px-2 font-medium">Customer</th>
                <th className="py-3 px-2 font-medium">Client Code</th>
                <th className="py-3 px-2 font-medium">Script</th>
                <th className="py-3 px-2 font-medium">Call Type</th>
                <th className="py-3 px-2 text-center font-medium">Q1</th>
                <th className="py-3 px-2 text-center font-medium">Q2</th>
                <th className="py-3 px-2 text-center font-medium">Q3</th>
                <th className="py-3 px-2 text-center font-medium">Q4</th>
                <th className="py-3 px-2 text-center font-medium">Q5</th>
                <th className="py-3 px-2 text-center font-medium">Score</th>
                <th className="py-3 px-2 text-center font-medium">Status</th>
                <th className="py-3 px-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#21262D]/60 font-mono text-[11px]">
              {pageCalls.length > 0 ? (
                pageCalls.map((call) => {
                  const isPre = call.classification === 'PRE_ORDER' || call.call_type === 'pre_order';
                  const isScrap = call.classification === 'SCRAP' || call.call_type === 'scrap';
                  const isProcessing = call.processing_status === 'PROCESSING' || call.status === 'transcribing';
                  const hasTranscript = Boolean(call.transcript && call.transcript.trim().length >= 15);
                  const isMissingRecording = (call.status as string) === 'missing_recording' || (call.audit_status as string) === 'MISSING_AUDIO' || (!call.storage_path && !hasTranscript);
                  const isAudited = (call.audit_status === 'AUDITED' || call.status === 'audited') && hasTranscript;
                  const isSelected = selectedCallIds.has(call.id);

                  const rowSc = (call as any).scorecard || (call as any).audit || call;
                  const rawScore = typeof rowSc.score === 'number'
                    ? rowSc.score
                    : (typeof call.score === 'number' ? call.score : ((call as any).scorecard_score ?? null));
                  const score = isAudited ? (rawScore !== null ? rawScore : 0) : null;
                  const isFatal = Boolean((call as any).is_fatal || (call as any).scorecard_is_fatal || rowSc.is_fatal || (isAudited && score === 0));

                  const q1Pass = isAudited && (rowSc.q1_status || (call as any).q1_status || rowSc.q1) === 'PASS';
                  const q2Pass = isAudited && (rowSc.q2_status || (call as any).q2_status || rowSc.q2) === 'PASS';
                  const q3Pass = isAudited && (rowSc.q3_status || (call as any).q3_status || rowSc.q3) === 'PASS';
                  const q4Pass = isAudited && (rowSc.q4_status || (call as any).q4_status || rowSc.q4 || 'PASS') === 'PASS';
                  const q5Pass = isAudited && (rowSc.q5_status || (call as any).q5_status || rowSc.q5) === 'PASS';
                  const scriptName = (call as any).trade_symbol || (call as any).symbol || (call as any).script || '—';

                  return (
                    <tr
                      key={call.id}
                      onClick={() => setActiveCallDetail(call)}
                      className={`hover:bg-[#21262D]/50 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-600/10' : ''
                      }`}
                    >
                      <td className="p-3 w-8" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectRow(call.id)}
                          className="rounded border-[#21262D] bg-[#161B22] text-blue-600 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-2 text-white font-medium truncate max-w-[150px]">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              playCall({
                                callId: call.id,
                                callerId: getCallDisplayId(call),
                                clientCode: call.client_code || call.client,
                                advisorName: getAdvisorDisplayName(call),
                                date: call.call_date,
                                transcript: call.transcript,
                              });
                            }}
                            className="p-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 cursor-pointer transition-all shadow-xs shrink-0 group/play hover:scale-105 active:scale-95 shimmer-sweep-hover"
                            title="Play call with live subtitles"
                          >
                            <Play size={11} className="fill-current text-blue-400 group-hover/play:text-cyan-300" />
                          </button>
                          <span className="truncate hover:text-cyan-300 transition-colors" title={getCallDisplayId(call)}>{getCallDisplayId(call)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-gray-300 truncate">
                        {call.call_date ? (call.call_date.length === 10 && call.call_date.startsWith('2026-') ? `${call.call_date.slice(8, 10)}-${call.call_date.slice(5, 7)}` : call.call_date) : '—'}
                      </td>
                      <td className="py-2.5 px-2 text-gray-400 truncate">
                        {call.call_time || '—'}
                      </td>
                      <td className="py-2.5 px-2 text-gray-300 truncate max-w-[110px]" title={getAdvisorDisplayName(call)}>
                        {getAdvisorDisplayName(call)}
                      </td>
                      <td className="py-2.5 px-2 text-gray-300 truncate font-mono">
                        {call.customer_number || call.calling_number || (call as any).registered_number || (call as any).trade_phone || (call as any).phone_number || '—'}
                      </td>
                      <td className="py-2.5 px-2 text-white font-medium truncate">
                        {call.client_code || call.client || '—'}
                      </td>
                      <td className="py-2.5 px-2 text-gray-300 truncate font-mono max-w-[100px]">
                        {scriptName}
                      </td>
                      <td className="py-2.5 px-2 font-sans" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={call.call_type || (isPre ? 'pre_order' : isScrap ? 'scrap' : 'regular')}
                          onChange={(e) => handleReclassifyCall(call.id, e.target.value as any)}
                          disabled={isReclassifying[call.id]}
                          title="Click to manually change call classification"
                          className={`px-2 py-0.5 rounded text-[10px] font-medium border cursor-pointer bg-[#0D1117] transition-all outline-none disabled:opacity-50 ${
                            isPre
                              ? 'text-blue-400 border-blue-500/40 hover:border-blue-400'
                              : isScrap
                              ? 'text-rose-400 border-rose-500/40 hover:border-rose-400'
                              : 'text-gray-300 border-gray-600 hover:border-gray-500'
                          }`}
                        >
                          <option value="pre_order" className="bg-[#161B22] text-blue-300 font-medium">Pre-Order</option>
                          <option value="regular" className="bg-[#161B22] text-gray-300 font-medium">Regular</option>
                          <option value="scrap" className="bg-[#161B22] text-rose-300 font-medium">Scrap</option>
                        </select>
                      </td>

                      {/* Q1 */}
                      <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {isAudited ? (
                          <button
                            type="button"
                            onClick={(e) => handleToggleTableQuestion(e, call.id, 'q1', q1Pass)}
                            title={`Q1 Customer Identity: ${q1Pass ? 'PASS' : 'FAIL'} (Click to toggle)`}
                            className="p-1 rounded hover:bg-gray-800 hover:scale-110 active:scale-95 transition-all cursor-pointer inline-flex"
                          >
                            {q1Pass ? (
                              <span className="inline-flex text-emerald-400"><Check size={13} /></span>
                            ) : (
                              <span className="inline-flex text-rose-400"><X size={13} /></span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleToggleTableQuestion(e, call.id, 'q1', false)}
                            title="Click to audit & set Q1 PASS"
                            className="p-1 rounded hover:bg-gray-800 text-gray-500 font-mono hover:text-emerald-400 transition-colors cursor-pointer"
                          >
                            —
                          </button>
                        )}
                      </td>

                      {/* Q2 */}
                      <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {isAudited ? (
                          <button
                            type="button"
                            onClick={(e) => handleToggleTableQuestion(e, call.id, 'q2', q2Pass)}
                            title={`Q2 Client Code Verification: ${q2Pass ? 'PASS' : 'FAIL'} (Click to toggle)`}
                            className="p-1 rounded hover:bg-gray-800 hover:scale-110 active:scale-95 transition-all cursor-pointer inline-flex"
                          >
                            {q2Pass ? (
                              <span className="inline-flex text-emerald-400"><Check size={13} /></span>
                            ) : (
                              <span className="inline-flex text-rose-400"><X size={13} /></span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleToggleTableQuestion(e, call.id, 'q2', false)}
                            title="Click to audit & set Q2 PASS"
                            className="p-1 rounded hover:bg-gray-800 text-gray-500 font-mono hover:text-emerald-400 transition-colors cursor-pointer"
                          >
                            —
                          </button>
                        )}
                      </td>

                      {/* Q3 */}
                      <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {isAudited ? (
                          <button
                            type="button"
                            onClick={(e) => handleToggleTableQuestion(e, call.id, 'q3', q3Pass)}
                            title={`Q3 Order Details: ${q3Pass ? 'PASS' : 'FAIL'} (Click to toggle)`}
                            className="p-1 rounded hover:bg-gray-800 hover:scale-110 active:scale-95 transition-all cursor-pointer inline-flex"
                          >
                            {q3Pass ? (
                              <span className="inline-flex text-emerald-400"><Check size={13} /></span>
                            ) : (
                              <span className="inline-flex text-rose-400"><X size={13} /></span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleToggleTableQuestion(e, call.id, 'q3', false)}
                            title="Click to audit & set Q3 PASS"
                            className="p-1 rounded hover:bg-gray-800 text-gray-500 font-mono hover:text-emerald-400 transition-colors cursor-pointer"
                          >
                            —
                          </button>
                        )}
                      </td>

                      {/* Q4 - Customer Acknowledgement */}
                      <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {isAudited ? (
                          <button
                            type="button"
                            onClick={(e) => handleToggleTableQuestion(e, call.id, 'q4', q4Pass)}
                            title={`Q4 Customer Acknowledgement: ${q4Pass ? 'PASS' : 'FAIL'} (Click to toggle)`}
                            className="p-1 rounded hover:bg-gray-800 hover:scale-110 active:scale-95 transition-all cursor-pointer inline-flex"
                          >
                            {q4Pass ? (
                              <span className="inline-flex text-emerald-400"><Check size={13} /></span>
                            ) : (
                              <span className="inline-flex text-rose-400"><X size={13} /></span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleToggleTableQuestion(e, call.id, 'q4', false)}
                            title="Click to audit & set Q4 PASS"
                            className="p-1 rounded hover:bg-gray-800 text-gray-500 font-mono hover:text-emerald-400 transition-colors cursor-pointer"
                          >
                            —
                          </button>
                        )}
                      </td>

                      {/* Q5 */}
                      <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {isAudited ? (
                          <button
                            type="button"
                            onClick={(e) => handleToggleTableQuestion(e, call.id, 'q5', q5Pass)}
                            title={`Q5 Return Guarantee: ${q5Pass ? 'PASS' : 'FAIL'} (Click to toggle)`}
                            className="p-1 rounded hover:bg-gray-800 hover:scale-110 active:scale-95 transition-all cursor-pointer inline-flex"
                          >
                            {q5Pass ? (
                              <span className="inline-flex text-emerald-400"><Check size={13} /></span>
                            ) : (
                              <span className="inline-flex text-rose-400"><X size={13} /></span>
                            )}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleToggleTableQuestion(e, call.id, 'q5', false)}
                            title="Click to audit & set Q5 PASS"
                            className="p-1 rounded hover:bg-gray-800 text-gray-500 font-mono hover:text-emerald-400 transition-colors cursor-pointer"
                          >
                            —
                          </button>
                        )}
                      </td>

                      {/* Score: Out of 5 */}
                      <td className="py-2.5 px-2 text-center font-bold">
                        {isAudited ? (
                          isFatal || score === 0 ? (
                            <span className="text-rose-400">0/5</span>
                          ) : score === 5 ? (
                            <span className="text-emerald-400">5/5</span>
                          ) : score === 4 ? (
                            <span className="text-amber-400">4/5</span>
                          ) : (
                            <span className="text-white">{score}/5</span>
                          )
                        ) : (
                          <span className="text-gray-500 font-mono">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-2 text-center font-sans">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                            isAudited
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : isMissingRecording
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : isProcessing
                              ? 'bg-blue-500/15 text-blue-400'
                              : isScrap
                              ? 'bg-rose-500/15 text-rose-400'
                              : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {isAudited ? 'Completed' : isMissingRecording ? 'Missing Recording' : isProcessing ? 'Processing' : isScrap ? 'Scrap' : 'Not Audited'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleDownloadSingleCall(call)}
                            title="Download Audio Recording"
                            className="p-1 rounded bg-[#21262D] hover:bg-[#30363D] text-gray-300 hover:text-blue-400 transition-colors cursor-pointer"
                          >
                            <Download size={12} />
                          </button>
                          <button
                            onClick={() => setActiveCallDetail(call)}
                            className="px-2 py-1 rounded bg-[#21262D] hover:bg-blue-600 hover:text-white text-gray-300 text-[10px] font-sans font-medium transition-colors cursor-pointer"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={17} className="p-8 text-center text-gray-500 font-mono text-xs">
                    No calls match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer matching Reference Screenshot */}
        <div className="p-3 border-t border-[#21262D] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400 select-none">
          <div>
            Showing <span className="text-white font-mono">{startIndex + 1}</span>-
            <span className="text-white font-mono">{Math.min(totalRecords, startIndex + pageSize)}</span> of{' '}
            <span className="text-white font-mono">{totalRecords}</span> calls
          </div>

          <div className="flex items-center gap-2">
            {/* Page Buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="p-1 rounded bg-[#0D1117] border border-[#21262D] hover:bg-[#21262D] disabled:opacity-40 text-gray-300 cursor-pointer"
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-6 h-6 rounded text-xs font-mono font-medium cursor-pointer transition-colors ${
                    currentPage === p
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#0D1117] border border-[#21262D] text-gray-400 hover:text-white hover:bg-[#21262D]'
                  }`}
                >
                  {p}
                </button>
              ))}

              {totalPages > 5 && <span className="px-1 text-gray-500 font-mono">...</span>}

              {totalPages > 5 && (
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  className={`w-6 h-6 rounded text-xs font-mono font-medium cursor-pointer ${
                    currentPage === totalPages
                      ? 'bg-blue-600 text-white'
                      : 'bg-[#0D1117] border border-[#21262D] text-gray-400 hover:text-white'
                  }`}
                >
                  {totalPages}
                </button>
              )}

              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="p-1 rounded bg-[#0D1117] border border-[#21262D] hover:bg-[#21262D] disabled:opacity-40 text-gray-300 cursor-pointer"
              >
                <ChevronRight size={14} />
              </button>
            </div>

            {/* Page Size Selector */}
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="bg-[#0D1117] border border-[#21262D] rounded-md px-2 py-1 text-gray-300 text-xs font-mono focus:outline-none"
            >
              <option value={10}>10 / page</option>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
};
