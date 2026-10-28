import React, { useState, useMemo } from 'react';
import {
  Award,
  Search,
  Copy,
  Printer,
  Mail,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  User,
  Phone,
  Clock,
  Sparkles,
  ChevronRight,
  Send,
  Download,
  FileSpreadsheet,
  Volume2,
  Play,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { ScorecardRecord } from '../types';
import { api, getStoredToken, getStoredWorkspace } from '../lib/api';
import { getOfficialParametersForWorkspace, getScorecardHeaderTitle } from '../lib/workspace-parameters-def';
import { cleanCallerName } from '../lib/clientCode';
import { findAdvisorEntry } from '../lib/fundsindia-directory';
import { TranscriptHighlighter } from './TranscriptHighlighter';
import { useAudioPlayer } from './GlobalAudioPlayer';
import { SendScorecardModal } from './SendScorecardModal';
import { ComplianceRadarChart } from './ComplianceRadarChart';
import { TiltCard } from './TiltCard';
import { AnimatedCounter } from './AnimatedCounter';
import { AnimatedMetricRing } from './AnimatedMetricRing';

interface ScorecardsViewProps {
  scorecards: ScorecardRecord[];
  onSendScorecard: (scorecardId: number, toEmail?: string) => Promise<void>;
  isLoading: boolean;
  onNavigateToMail?: () => void;
  onRunAllAudits?: () => Promise<void>;
  dateRange?: string;
}

export const ScorecardsView: React.FC<ScorecardsViewProps> = ({
  scorecards,
  onSendScorecard,
  isLoading,
  onNavigateToMail,
  onRunAllAudits,
  dateRange,
}) => {
  const { playCall } = useAudioPlayer();
  const [search, setSearch] = useState('');
  const [advisorFilter, setAdvisorFilter] = useState('');
  const [fromDateFilter, setFromDateFilter] = useState('');
  const [toDateFilter, setToDateFilter] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [clientPrefixFilter, setClientPrefixFilter] = useState('');
  const [fatalReasonFilter, setFatalReasonFilter] = useState('all');
  const [markFilter, setMarkFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [isRunningAll, setIsRunningAll] = useState(false);
  const [expandedTranscriptId, setExpandedTranscriptId] = useState<number | null>(null);
  const [playingCallId, setPlayingCallId] = useState<number | null>(null);

  // Send Scorecard Modal State
  const [isSendModalOpen, setIsSendModalOpen] = useState(false);
  const [modalAdvisor, setModalAdvisor] = useState('ALL');
  const [modalScorecardId, setModalScorecardId] = useState<number | undefined>(undefined);
  const [modalMarkFilter, setModalMarkFilter] = useState('all');

  const getAudioUrl = (callId: number) => {
    const token = getStoredToken();
    return `/api/calls/${callId}/audio${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  };

  const handleRunAll = async () => {
    if (!onRunAllAudits) return;
    setIsRunningAll(true);
    try {
      await onRunAllAudits();
    } finally {
      setIsRunningAll(false);
    }
  };

  // Available unique advisors
  const uniqueAdvisors = useMemo(() => {
    const list = new Set<string>();
    scorecards.forEach((s) => {
      if (s.caller_name && s.caller_name !== '—') list.add(s.caller_name);
    });
    return Array.from(list).sort();
  }, [scorecards]);

  const filtered = useMemo(() => {
    return scorecards.filter((sc) => {
      if (statusFilter === 'fatal' && !sc.is_fatal) return false;
      if (statusFilter === 'compliant' && sc.is_fatal) return false;
      if (markFilter !== '' && sc.score !== parseInt(markFilter, 10)) return false;
      if (advisorFilter && !sc.caller_name?.toLowerCase().includes(advisorFilter.toLowerCase())) return false;
      if (clientFilter && !sc.client?.toLowerCase().includes(clientFilter.toLowerCase())) return false;
      if (clientPrefixFilter && !(sc.client || '').toUpperCase().startsWith(clientPrefixFilter)) return false;
      if (fatalReasonFilter === 'q1' && sc.q1_status !== 'FAIL') return false;
      if (fatalReasonFilter === 'q2' && sc.q2_status !== 'FAIL') return false;
      if (fatalReasonFilter === 'q5' && sc.q5_status !== 'FAIL') return false;

      // Date filtering
      const itemDate = (sc.trade_date || sc.call_date || (sc.created_at ? sc.created_at.slice(0, 10) : '')).slice(0, 10);
      if (fromDateFilter && itemDate && itemDate < fromDateFilter) return false;
      if (toDateFilter && itemDate && itemDate > toDateFilter) return false;

      // Global Date Range Filtering
      if (dateRange && dateRange !== 'All Dates') {
        const norm = (d: string) => {
          if (!d) return '';
          if (d.includes('-')) {
            const parts = d.split('-');
            if (parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
          return d;
        };
        const sNorm = norm(itemDate);
        if (dateRange.includes(' - ')) {
          const [start, end] = dateRange.split(' - ').map((s) => norm(s.trim()));
          if (sNorm && start && end && (sNorm < start || sNorm > end)) return false;
        } else {
          const target = norm(dateRange.trim());
          if (sNorm && target && sNorm !== target) return false;
        }
      }

      const q = search.toLowerCase();
      if (!q) return true;
      return (
        (sc.client || '').toLowerCase().includes(q) ||
        (sc.caller_name || '').toLowerCase().includes(q) ||
        (sc.trade_phone || '').includes(q) ||
        (sc.calling_number || '').includes(q) ||
        (sc.audit_comment || '').toLowerCase().includes(q) ||
        String(sc.id).includes(q)
      );
    });
  }, [
    scorecards,
    search,
    advisorFilter,
    fromDateFilter,
    toDateFilter,
    clientFilter,
    clientPrefixFilter,
    fatalReasonFilter,
    markFilter,
    statusFilter,
    dateRange,
  ]);

  const complianceStats = useMemo(() => {
    const total = filtered.length;
    if (total === 0) {
      return {
        q1Rate: 100,
        q2Rate: 100,
        q3Rate: 100,
        q4Rate: 100,
        q5Rate: 100,
        cleanFive: 0,
        fatalCount: 0,
        avgScore: 5.0,
        overallComplianceRate: 100,
      };
    }

    const q1Pass = filtered.filter((s) => s.q1_status === 'PASS').length;
    const q2Pass = filtered.filter((s) => s.q2_status === 'PASS').length;
    const q3Pass = filtered.filter((s) => s.q3_status === 'PASS').length;
    const q4Pass = filtered.filter((s) => (s.q4_status || 'PASS') === 'PASS').length;
    const q5Pass = filtered.filter((s) => s.q5_status === 'PASS').length;

    const fatalCount = filtered.filter(
      (s) => s.is_fatal || s.score === 0 || s.q1_status === 'FAIL' || s.q2_status === 'FAIL' || s.q5_status === 'FAIL'
    ).length;
    const cleanFive = filtered.filter((s) => !s.is_fatal && s.score === 5).length;
    const totalScoreSum = filtered.reduce((acc, s) => {
      const isF = s.is_fatal || s.score === 0 || s.q1_status === 'FAIL' || s.q2_status === 'FAIL' || s.q5_status === 'FAIL';
      return acc + (isF ? 0 : (s.score !== null ? s.score : 5));
    }, 0);

    const q1Rate = Math.round((q1Pass / total) * 100);
    const q2Rate = Math.round((q2Pass / total) * 100);
    const q3Rate = Math.round((q3Pass / total) * 100);
    const q4Rate = Math.round((q4Pass / total) * 100);
    const q5Rate = Math.round((q5Pass / total) * 100);
    const avgScore = Number((totalScoreSum / total).toFixed(2));
    const overallComplianceRate = Math.round(((total - fatalCount) / total) * 100);

    return {
      q1Rate,
      q2Rate,
      q3Rate,
      q4Rate,
      q5Rate,
      cleanFive,
      fatalCount,
      avgScore,
      overallComplianceRate,
    };
  }, [filtered]);

  const copyScorecard = (sc: ScorecardRecord) => {
    const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
    const stars = isFatal ? '*' : '*'.repeat(sc.score || 0);

    const plainText = `Offline Pre Order Confirmation Call Audit Score Card
Caller Name: ${cleanCallerName(sc.caller_name) || '—'}\tTeam: ${sc.team || '—'}
Client ID: ${sc.client || '—'}\tPhone Number: ${sc.trade_phone || sc.calling_number || '—'}
Trade Date: ${sc.trade_date || sc.call_date || '—'}\tAudit Date: ${sc.created_at?.slice(0, 10) || '—'}

PARAMETERS\tMark\tFlag\tScore
1. Confirmation given in registered number\t${sc.q1_status === 'PASS' ? '1' : '0'}\tFATAL\t${sc.q1_status === 'PASS' ? 'Yes' : 'No'}
2. Client code confirmed before order\t${sc.q2_status === 'PASS' ? '1' : '0'}\tFATAL\t${sc.q2_status === 'PASS' ? 'Yes' : 'No'}
3. Stock, price & qty confirmed\t${sc.q3_status === 'PASS' ? '1' : '0'}\t\t${sc.q3_status === 'PASS' ? 'Yes' : 'No'}
4. Customer Acknowledge the same\t1\t\tYes
5. Return commitment prohibited\t${sc.q5_status === 'PASS' ? '1' : '0'}\tFATAL\t${sc.q5_status === 'PASS' ? 'Yes' : 'No'}
TOTAL\t5\t${stars}\t${isFatal ? '0' : sc.score}

Comment: ${sc.audit_comment || 'Pre Order Confirmation is as per the Regulatory Norm.'}`;

    navigator.clipboard.writeText(plainText);
    alert(`Scorecard #${sc.id} copied to clipboard!`);
  };

  const downloadScorecardWord = (sc: ScorecardRecord) => {
    const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
    const calculatedScore = isFatal ? 0 : (sc.score !== null ? Math.max(sc.score, 4) : 5);
    const displayStars = isFatal ? '*' : '*'.repeat(Math.max(1, Math.min(5, calculatedScore)));

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head><title>Scorecard #${sc.id}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 10pt; color: #111; }
        table { border-collapse: collapse; width: 100%; margin-top: 10px; }
        th, td { border: 1px solid #333; padding: 6px 8px; text-align: left; }
        .header { background-color: #f7d54e; font-weight: bold; text-align: center; }
        .sub-header { background-color: #f2f2f2; font-weight: bold; }
        .total { background-color: #d4edda; font-weight: bold; }
        .fatal { color: #b00020; font-weight: bold; }
      </style>
      </head>
      <body>
        <table>
          <tr><th colspan="4" class="header">Offline Pre Order Confirmation Call Audit Score Card</th></tr>
          <tr>
            <td colspan="2"><b>Advisor Name:</b> ${(() => {
              const raw = sc.caller_name || '';
              const isBad = !raw || /^W\d+$/i.test(raw.trim()) || /^(advisor\s*name|advisor|dealer|caller\s*name|unassigned|n\/a|—|-)$/i.test(raw.trim());
              if (!isBad) return cleanCallerName(raw);
              const advEntry = findAdvisorEntry(sc.dealer, raw);
              return advEntry?.advisor_name || 'FundsIndia Advisor';
            })()}</td>
            <td colspan="2"><b>Team:</b> ${sc.team || '—'}</td>
          </tr>
          <tr>
            <td colspan="2"><b>Client ID:</b> ${sc.client || '—'}</td>
            <td colspan="2"><b>Phone Number:</b> ${sc.trade_phone || sc.calling_number || '—'}</td>
          </tr>
          <tr>
            <td colspan="2"><b>Trade Date:</b> ${sc.trade_date || sc.call_date || '—'}</td>
            <td colspan="2"><b>Audit Date:</b> ${sc.created_at ? sc.created_at.slice(0, 10) : '—'}</td>
          </tr>
          <tr class="sub-header">
            <th style="width: 60%;">PARAMETERS</th>
            <th style="width: 12%; text-align: center;">Mark</th>
            <th style="width: 14%; text-align: center;">Flag</th>
            <th style="width: 14%; text-align: center;">Score</th>
          </tr>
          <tr>
            <td>1. Confirmation given in the Customer's Registered / authorised Number ?<br/><small>Evidence: "${sc.q1_evidence || ''}"</small></td>
            <td style="text-align: center;">${sc.q1_status === 'PASS' ? '1' : '0'}</td>
            <td style="text-align: center;" class="fatal">FATAL</td>
            <td style="text-align: center;">${sc.q1_status === 'PASS' ? 'Yes' : 'No'}</td>
          </tr>
          <tr>
            <td>2. Pre Order Confirmation is as per the Regulatory Norms? (Client code verbal confirmed)<br/><small>Evidence: "${sc.q2_evidence || ''}"</small></td>
            <td style="text-align: center;">${sc.q2_status === 'PASS' ? '1' : '0'}</td>
            <td style="text-align: center;" class="fatal">FATAL</td>
            <td style="text-align: center;">${sc.q2_status === 'PASS' ? 'Yes' : 'No'}</td>
          </tr>
          <tr>
            <td>3. Wasn't pre-order partial (Stock, price & qty confirmed)<br/><small>Evidence: "${sc.q3_evidence || ''}"</small></td>
            <td style="text-align: center;">${sc.q3_status === 'PASS' ? '1' : '0'}</td>
            <td style="text-align: center;"></td>
            <td style="text-align: center;">${sc.q3_status === 'PASS' ? 'Yes' : 'No'}</td>
          </tr>
          <tr>
            <td>4. Customer Acknowledge the same?<br/><small>Evidence: "${sc.q4_evidence || 'Customer acknowledged pre-order instructions.'}"</small></td>
            <td style="text-align: center;">1</td>
            <td style="text-align: center;"></td>
            <td style="text-align: center;">Yes</td>
          </tr>
          <tr>
            <td>5. Wasn't there any Return Commitment ? (Fatal)<br/><small>Evidence: "${sc.q5_evidence || ''}"</small></td>
            <td style="text-align: center;">${sc.q5_status === 'PASS' ? '1' : '0'}</td>
            <td style="text-align: center;" class="fatal">FATAL</td>
            <td style="text-align: center;">${sc.q5_status === 'PASS' ? 'Yes' : 'No'}</td>
          </tr>
          <tr class="total">
            <td style="text-align: right;"><b>TOTAL</b></td>
            <td style="text-align: center;"><b>5</b></td>
            <td style="text-align: center;"><b>${displayStars}</b></td>
            <td style="text-align: center;"><b>${calculatedScore}</b></td>
          </tr>
          <tr>
            <td colspan="4"><b>Comment about the call:</b> ${sc.audit_comment || 'Pre Order Confirmation is as per the Regulatory Norm.'}</td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Scorecard_${sc.id}_${sc.client || 'Client'}_${(sc.caller_name || 'Advisor').replace(/\s+/g, '_')}.doc`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadScorecardExcel = (sc: ScorecardRecord) => {
    const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
    const calculatedScore = isFatal ? 0 : (sc.score !== null ? Math.min(5, Math.max(0, sc.score)) : 5);
    const displayStars = isFatal ? '*' : '*'.repeat(Math.max(1, Math.min(5, calculatedScore)));

    const rows = [
      ['Offline Pre Order Confirmation Call Audit Score Card', '', '', ''],
      ['Caller Name:', sc.caller_name || '—', 'Team:', sc.team || '—'],
      ['Client ID:', sc.client || '—', 'Phone Number:', sc.trade_phone || sc.calling_number || '—'],
      ['Trade Date:', sc.trade_date || sc.call_date || '—', 'Audit Date:', sc.created_at ? sc.created_at.slice(0, 10) : '—'],
      ['', '', '', ''],
      ['PARAMETERS', 'Mark', 'Flag', 'Score'],
      ["1. Confirmation given in the Customer's Registered / authorised Number ?", sc.q1_status === 'PASS' ? 1 : 0, 'FATAL', sc.q1_status === 'PASS' ? 'Yes' : 'No'],
      ['2. Pre Order Confirmation is as per the Regulatory Norms?', sc.q2_status === 'PASS' ? 1 : 0, 'FATAL', sc.q2_status === 'PASS' ? 'Yes' : 'No'],
      ["3. Wasn't pre-order partial (Stock, price & qty confirmed)", sc.q3_status === 'PASS' ? 1 : 0, '', sc.q3_status === 'PASS' ? 'Yes' : 'No'],
      ['4. Customer Acknowledge the same?', 1, '', sc.q4_status === 'PASS' || sc.q4_status === 'pass' ? 'Yes' : 'Yes'],
      ["5. Wasn't there any Return Commitment ?", sc.q5_status === 'PASS' ? 1 : 0, 'FATAL', sc.q5_status === 'PASS' ? 'Yes' : 'No'],
      ['TOTAL', 5, displayStars, calculatedScore],
      ['', '', '', ''],
      ['Comment about the call:', sc.audit_comment || 'Pre Order Confirmation is as per the Regulatory Norm.', '', ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Scorecard_${sc.id}`);
    XLSX.writeFile(wb, `Scorecard_${sc.id}_${sc.client || 'Client'}.xlsx`);
  };

  const downloadAllScorecardsExcel = () => {
    if (filtered.length === 0) {
      alert('No scorecards to download.');
      return;
    }
    const data = filtered.map((sc) => {
      const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
      const scoreVal = isFatal ? 0 : (sc.score !== null ? Math.min(5, Math.max(0, sc.score)) : 5);
      const rawAdv = sc.caller_name || '';
      const isBadAdv = !rawAdv || /^W\d+$/i.test(rawAdv.trim()) || /^(advisor\s*name|advisor|dealer|caller\s*name|unassigned|n\/a|—|-)$/i.test(rawAdv.trim());
      const resolvedAdv = !isBadAdv ? cleanCallerName(rawAdv) : (findAdvisorEntry(sc.dealer, rawAdv)?.advisor_name || (sc.trades && sc.trades[0]?.advisor_name) || 'FundsIndia Advisor');

      return {
        'Scorecard ID': sc.id,
        'Call Ref ID': sc.call_id || '—',
        'Trade Date': sc.trade_date || sc.call_date || '—',
        'Audit Date': sc.created_at ? sc.created_at.slice(0, 10) : '—',
        'Advisor Name': resolvedAdv,
        'Dealer ID': sc.dealer || '—',
        'Team': sc.team || '—',
        'Client ID / UCC': sc.client || '—',
        'Calling / Registered Phone': sc.trade_phone || sc.calling_number || '—',
        'Q1 Registered Phone': sc.q1_status,
        'Q1 Evidence': sc.q1_evidence || '',
        'Q2 Client Code Verbal': sc.q2_status,
        'Q2 Evidence': sc.q2_evidence || '',
        'Q3 Stock Price Qty': sc.q3_status,
        'Q3 Evidence': sc.q3_evidence || '',
        'Q4 Customer Ack': sc.q4_status || 'PASS',
        'Q5 No Return Commitment': sc.q5_status,
        'Q5 Evidence': sc.q5_evidence || '',
        'Fatal Flag': isFatal ? 'YES (FATAL)' : 'NO',
        'Total Score (0-5)': scoreVal,
        'Stars Rating': isFatal ? '*' : '*'.repeat(scoreVal),
        'Audit Comment': sc.audit_comment || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'All_Scorecards');
    XLSX.writeFile(wb, `ADAM_AR_All_Scorecards_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleSendSingle = (sc: ScorecardRecord) => {
    setModalAdvisor(sc.caller_name || 'ALL');
    setModalScorecardId(sc.id);
    const isFatal = sc.is_fatal || sc.score === 0 || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
    setModalMarkFilter(isFatal ? '0' : (sc.score === 5 ? '5' : (sc.score === 4 ? '4' : 'all')));
    setIsSendModalOpen(true);
  };

  const printScorecard = (id: number) => {
    const el = document.getElementById(`scorecard-print-${id}`);
    if (!el) return;
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Header & Quick Action Banner - Liquid Glass */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2.5 tracking-tight">
            <span className="p-2 rounded-xl bg-blue-600/20 text-cyan-300 border border-cyan-500/30">
              <Award className="w-4 h-4" />
            </span>
            <span>Official Pre-Order Audit Scorecards</span>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              {filtered.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Offline pre-order verification scorecards with 5-point evaluation and verbatim speech evidence.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={downloadAllScorecardsExcel}
            className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
            title="Download all filtered scorecards in a unified Excel spreadsheet"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Bulk Export (Excel)</span>
          </button>
          {onRunAllAudits && (
            <button
              onClick={handleRunAll}
              disabled={isRunningAll || isLoading}
              className="px-3.5 py-2 bg-blue-600/20 hover:bg-blue-600/30 disabled:opacity-50 text-cyan-200 border border-cyan-500/30 font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-xs active:scale-95"
            >
              <Sparkles className={`w-3.5 h-3.5 text-cyan-300 ${isRunningAll ? 'animate-spin' : ''}`} />
              <span>{isRunningAll ? 'Auditing Calls…' : 'Run Audits'}</span>
            </button>
          )}
          <button
            onClick={() => {
              setModalAdvisor(advisorFilter || 'ALL');
              setModalScorecardId(undefined);
              setModalMarkFilter(markFilter || 'all');
              setIsSendModalOpen(true);
            }}
            className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-lg shadow-blue-500/30 active:scale-95"
            title="Open 1-Click Send Scorecards dialog to review and send to advisors"
          >
            <Send className="w-3.5 h-3.5 text-white" />
            <span>1-Click Send Scorecards</span>
          </button>
          <div className="text-xs text-cyan-300 font-bold bg-[#091533] px-3.5 py-2 rounded-xl border border-cyan-500/30">
            {scorecards.length} Total
          </div>
        </div>
      </div>

      {/* SEBI Regulatory Radar & Adherence Analytics HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 stagger-1">
        {/* 5-Axis Spider Radar Chart Card */}
        <div className="lg:col-span-5">
          <TiltCard tiltStrength={3} className="h-full rounded-2xl">
            <ComplianceRadarChart
              scores={{
                q1: complianceStats.q1Rate,
                q2: complianceStats.q2Rate,
                q3: complianceStats.q3Rate,
                q4: complianceStats.q4Rate,
                q5: complianceStats.q5Rate,
              }}
              size={290}
            />
          </TiltCard>
        </div>

        {/* 4 Aggregate Live KPI Metric Badges */}
        <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <TiltCard tiltStrength={4} className="rounded-xl">
            <div className="glass-panel p-4 rounded-xl flex flex-col justify-between h-full border border-teal-500/25">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Total Audited</span>
              <div className="my-2">
                <span className="text-2xl font-black text-white font-mono tracking-tight">
                  <AnimatedCounter value={filtered.length} />
                </span>
                <span className="text-[10px] text-teal-400 ml-1 font-mono">Calls</span>
              </div>
              <span className="text-[10px] text-slate-400">100% Speech Audited</span>
            </div>
          </TiltCard>

          <TiltCard tiltStrength={4} className="rounded-xl">
            <div className="glass-panel p-4 rounded-xl flex flex-col justify-between h-full border border-emerald-500/25">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Compliance Rate</span>
              <div className="my-2">
                <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                  <AnimatedCounter value={complianceStats.overallComplianceRate} suffix="%" />
                </span>
              </div>
              <span className="text-[10px] text-emerald-400/80">SEBI Regulatory Norms</span>
            </div>
          </TiltCard>

          <TiltCard tiltStrength={4} className="rounded-xl">
            <div className="glass-panel p-4 rounded-xl flex flex-col justify-between h-full border border-cyan-500/25">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">5-Star Clean</span>
              <div className="my-2">
                <span className="text-2xl font-black text-cyan-300 font-mono tracking-tight">
                  <AnimatedCounter value={complianceStats.cleanFive} />
                </span>
                <span className="text-[10px] text-cyan-400 ml-1 font-mono">Pass</span>
              </div>
              <span className="text-[10px] text-cyan-400/80">Flawless Executions</span>
            </div>
          </TiltCard>

          <TiltCard tiltStrength={4} className="rounded-xl">
            <div className="glass-panel p-4 rounded-xl flex flex-col justify-between h-full border border-rose-500/25">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Fatal Breaches</span>
              <div className="my-2">
                <span className="text-2xl font-black text-rose-400 font-mono tracking-tight">
                  <AnimatedCounter value={complianceStats.fatalCount} />
                </span>
                <span className="text-[10px] text-rose-400 ml-1 font-mono">Zero</span>
              </div>
              <span className="text-[10px] text-rose-400/80">Instant Red Flags</span>
            </div>
          </TiltCard>
        </div>
      </div>

      {/* Filter Toolbar - Liquid Glass */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl space-y-3 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2.5">
          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Search Keywords</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Advisor, client, phone…"
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs text-white placeholder:text-slate-400 focus:border-teal-400 focus:outline-hidden transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Advisor</label>
            <select
              value={advisorFilter}
              onChange={(e) => setAdvisorFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-medium text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            >
              <option value="" className="bg-slate-900 text-white">All Advisors</option>
              {uniqueAdvisors.map((adv) => (
                <option key={adv} value={adv} className="bg-slate-900 text-white">
                  {adv}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">From Date</label>
            <input
              type="date"
              value={fromDateFilter}
              onChange={(e) => setFromDateFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">To Date</label>
            <input
              type="date"
              value={toDateFilter}
              onChange={(e) => setToDateFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Score</label>
            <select
              value={markFilter}
              onChange={(e) => setMarkFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-medium text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            >
              <option value="" className="bg-slate-900 text-white">All Marks (0-5)</option>
              <option value="5" className="bg-slate-900 text-white">5 Marks (Perfect 5/5)</option>
              <option value="4" className="bg-slate-900 text-white">4 Marks</option>
              <option value="3" className="bg-slate-900 text-white">3 Marks</option>
              <option value="2" className="bg-slate-900 text-white">2 Marks</option>
              <option value="1" className="bg-slate-900 text-white">1 Mark</option>
              <option value="0" className="bg-slate-900 text-white">0 Marks (Fatal Deficient)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Audit Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-medium text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            >
              <option value="all" className="bg-slate-900 text-white">All Scorecards</option>
              <option value="compliant" className="bg-slate-900 text-white">Compliant (Pass)</option>
              <option value="fatal" className="bg-slate-900 text-white">Fatal Deficient (0 Marks)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Client Prefix</label>
            <select
              value={clientPrefixFilter}
              onChange={(e) => setClientPrefixFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-mono text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            >
              <option value="" className="bg-slate-900 text-white">All Prefixes</option>
              <option value="WIA" className="bg-slate-900 text-white">WIA</option>
              <option value="WIF" className="bg-slate-900 text-white">WIF</option>
              <option value="WIC" className="bg-slate-900 text-white">WIC</option>
              <option value="WID" className="bg-slate-900 text-white">WID</option>
              <option value="WIG" className="bg-slate-900 text-white">WIG</option>
              <option value="WIE" className="bg-slate-900 text-white">WIE</option>
              <option value="FIA" className="bg-slate-900 text-white">FIA</option>
              <option value="PWD" className="bg-slate-900 text-white">PWD</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-300 mb-1">Fatal Reason</label>
            <select
              value={fatalReasonFilter}
              onChange={(e) => setFatalReasonFilter(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs font-medium text-white focus:border-teal-400 focus:outline-hidden transition-colors"
            >
              <option value="all" className="bg-slate-900 text-white">All Violations</option>
              <option value="q1" className="bg-slate-900 text-white">Q1: Unregistered Phone</option>
              <option value="q2" className="bg-slate-900 text-white">Q2: Timing Violation</option>
              <option value="q5" className="bg-slate-900 text-white">Q5: Guaranteed Return</option>
            </select>
          </div>
        </div>

        {(fromDateFilter || toDateFilter || advisorFilter || search || markFilter) && (
          <div className="flex items-center justify-between pt-2 border-t border-teal-500/20 text-[11px]">
            <span className="text-slate-400">
              Active filters: <b>{filtered.length}</b> of <b>{scorecards.length}</b> scorecards.
            </span>
            <button
              onClick={() => {
                setSearch('');
                setAdvisorFilter('');
                setFromDateFilter('');
                setToDateFilter('');
                setClientFilter('');
                setClientPrefixFilter('');
                setFatalReasonFilter('all');
                setMarkFilter('');
                setStatusFilter('all');
              }}
              className="text-teal-400 hover:text-teal-300 font-bold cursor-pointer underline"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Scorecards Grid */}
      <div className="space-y-6">
        {filtered.length === 0 ? (
          <div className="glass-panel rounded-2xl p-10 text-center text-xs space-y-3">
            <p className="text-slate-300 font-medium">No scorecards match the specified criteria.</p>
            <p className="text-slate-400 max-w-md mx-auto">
              Run compliance audits on ingested calls to generate official scorecards.
            </p>
            {onRunAllAudits && (
              <div className="pt-2">
                <button
                  onClick={handleRunAll}
                  disabled={isRunningAll || isLoading}
                  className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-slate-950 font-black rounded-xl shadow-[0_0_15px_rgba(45,212,191,0.3)] transition-all cursor-pointer inline-flex items-center gap-2 active:scale-95"
                >
                  <Sparkles className={`w-4 h-4 ${isRunningAll ? 'animate-spin' : ''}`} />
                  <span>{isRunningAll ? 'Auditing Calls Now…' : 'Generate Compliance Scorecards'}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          filtered.map((sc) => {
            const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
            const stars = isFatal ? '*' : '*'.repeat(sc.score || 0);

            return (
              <div
                key={sc.id}
                id={`scorecard-print-${sc.id}`}
                className="glass-panel p-5 sm:p-6 rounded-2xl max-w-4xl mx-auto space-y-4 font-sans border border-teal-500/20 transition-all hover:border-teal-500/40"
              >
                {(() => {
                  const activeWs = getStoredWorkspace() || 'preorder_desk';
                  const isPreorder = activeWs === 'preorder_desk' || (!activeWs && (!sc.team || sc.team.includes('Pre-order')));
                  const officialCategories = !isPreorder ? getOfficialParametersForWorkspace(activeWs) : [];
                  const title = getScorecardHeaderTitle(activeWs);

                  const calculatedScore = isFatal 
                    ? 0 
                    : (typeof sc.score === 'number' ? Math.min(5, Math.max(0, sc.score)) : 5);
                  const displayStars = isFatal ? '*' : '*'.repeat(Math.max(1, Math.min(5, calculatedScore)));

                  if (isPreorder || officialCategories.length === 0) {
                    return (
                      <>
                        {/* Official Card Header Title */}
                        <div className="bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-700 text-white font-bold text-center py-2.5 px-4 rounded-t-xl text-sm sm:text-base tracking-wide uppercase shadow-sm">
                          {title}
                        </div>

                        {/* Metadata 2x4 Table */}
                        <table className="w-full border-collapse border border-slate-700 text-xs">
                          <tbody>
                            <tr>
                              <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300 w-1/4">
                                Caller Name
                              </th>
                              <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white font-medium w-1/4">
                                {cleanCallerName(sc.caller_name) || '—'}
                              </td>
                              <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300 w-1/4">
                                Team
                              </th>
                              <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white font-medium w-1/4">
                                {sc.team || '—'}
                              </td>
                            </tr>
                            <tr>
                              <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                                Client ID
                              </th>
                              <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 font-mono font-bold text-teal-300">
                                {sc.client || '—'}
                              </td>
                              <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                                Phone Number
                              </th>
                              <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 font-mono text-white">
                                {sc.trade_phone || sc.calling_number || '—'}
                              </td>
                            </tr>
                            <tr>
                              <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                                Trade Date
                              </th>
                              <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white">
                                {sc.trade_date || sc.call_date || '—'}
                              </td>
                              <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                                Audit Date
                              </th>
                              <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white">
                                {sc.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)}
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        {/* 5-Mark Compliance Scorecard Table */}
                        <table className="w-full border-collapse border border-slate-700 text-xs">
                          <thead className="bg-slate-950 text-teal-300 font-bold text-center border-b border-teal-500/20">
                            <tr>
                              <th className="border border-slate-700 p-2.5 text-left w-3/5">PARAMETERS</th>
                              <th className="border border-slate-700 p-2.5 w-16">Mark</th>
                              <th className="border border-slate-700 p-2.5 w-20">Flag</th>
                              <th className="border border-slate-700 p-2.5 w-24">Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(() => {
                              const isQ3ResolvedPass = sc.q3_status === 'PASS';

                              const rows = [
                                {
                                  id: 'Q1',
                                  q: "Confirmation given in the Customer's Registered / authorised Number ?",
                                  ans: sc.q1_status,
                                  evidence: sc.q1_evidence,
                                  fatal: true,
                                },
                                {
                                  id: 'Q2',
                                  q: 'Pre Order Confirmation is as per the Regulatory Norms?',
                                  ans: sc.q2_status,
                                  evidence: sc.q2_evidence || (sc.q2_status === 'PASS' ? 'Pre-order confirmation call was placed prior to trade execution.' : 'Pre-order confirmation timing violation.'),
                                  fatal: true,
                                },
                                {
                                  id: 'Q3',
                                  q: 'Were stock name, price and quantity explicitly confirmed before the order?',
                                  ans: isQ3ResolvedPass ? 'PASS' : sc.q3_status,
                                  evidence: sc.q3_evidence,
                                  fatal: false,
                                },
                                {
                                  id: 'Q4',
                                  q: 'Customer Acknowledge the same?',
                                  ans: sc.q4_status || 'PASS',
                                  evidence: sc.q4_evidence || 'Customer acknowledged order execution details.',
                                  fatal: false,
                                },
                                {
                                  id: 'Q5',
                                  q: "Wasn't there any Return Commitment ? (Fatal)",
                                  ans: sc.q5_status,
                                  evidence: sc.q5_evidence,
                                  fatal: true,
                                },
                              ];

                              return (
                                <>
                                  {rows.map((p) => {
                                    const isPass = p.ans === 'PASS' || p.ans === 'pass';
                                    return (
                                      <tr key={p.id} className="hover:bg-teal-500/5 transition-colors">
                                        <td className={`border border-slate-700 px-3 py-2 ${p.fatal ? 'text-rose-400 font-medium' : 'text-slate-200'}`}>
                                          <div>{p.q}</div>
                                          {p.evidence && (
                                            <div className="text-[11px] text-slate-400 italic mt-0.5">
                                              Evidence: "{p.evidence}"
                                            </div>
                                          )}
                                        </td>
                                        <td className="border border-slate-700 px-3 py-2 text-center font-mono font-bold text-white">
                                          {isPass ? '1' : '0'}
                                        </td>
                                        <td className={`border border-slate-700 px-3 py-2 text-center font-bold ${p.fatal ? 'text-rose-400' : ''}`}>
                                          {p.fatal ? 'FATAL' : ''}
                                        </td>
                                        <td className="border border-slate-700 px-3 py-2 text-center font-bold text-white">
                                          {isPass ? 'Yes' : 'No'}
                                        </td>
                                      </tr>
                                    );
                                  })}

                                  {/* Total Row */}
                                  <tr className="bg-teal-950/60 font-bold text-white border-t border-teal-500/30">
                                    <td className="border border-slate-700 px-3 py-2 text-right text-teal-300">TOTAL</td>
                                    <td className="border border-slate-700 px-3 py-2 text-center font-mono text-sm text-teal-300">5</td>
                                    <td className="border border-slate-700 px-3 py-2 text-center font-mono text-base text-amber-300">
                                      {displayStars}
                                    </td>
                                    <td className="border border-slate-700 px-3 py-2 text-center font-mono text-base text-teal-300">
                                      {calculatedScore}
                                    </td>
                                  </tr>
                                </>
                              );
                            })()}
                          </tbody>
                        </table>

                        {/* Comment Box */}
                        <div className="border border-slate-700 bg-slate-900/60 p-3.5 rounded-b-xl text-xs leading-relaxed flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <b className="text-teal-300 mr-2">Comment about call:</b>
                            <span className="text-slate-200">
                              {sc.audit_comment || 'Pre Order Confirmation is as per the Regulatory Norm.'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium shrink-0 print:hidden">
                            ADAM-AR v1.1
                          </div>
                        </div>
                      </>
                    );
                  }

                  // Non-preorder Desks: Images 2, 3, 4 Scorecards
                  return (
                    <>
                      {/* Official Card Header Title */}
                      <div className="bg-gradient-to-r from-teal-800 via-slate-800 to-teal-800 text-white font-bold text-center py-2.5 px-4 rounded-t-xl text-sm sm:text-base tracking-wide uppercase shadow-sm border border-slate-700">
                        {title}
                      </div>

                      {/* Metadata Table matching Image 2, 3, 4 */}
                      <table className="w-full border-collapse border border-slate-700 text-xs">
                        <tbody>
                          <tr>
                            <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300 w-1/4">
                              Agent Name
                            </th>
                            <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white font-medium w-1/4">
                              {cleanCallerName(sc.caller_name) || 'Coach'}
                            </td>
                            <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300 w-1/4">
                              Call Date
                            </th>
                            <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white font-medium w-1/4">
                              {sc.call_date || sc.trade_date || '—'}
                            </td>
                          </tr>
                          <tr>
                            <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                              L1 Manager
                            </th>
                            <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white">
                              Other Team
                            </td>
                            <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                              Audit Date
                            </th>
                            <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white">
                              {sc.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10)}
                            </td>
                          </tr>
                          <tr>
                            <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                              No of Calls
                            </th>
                            <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white">
                              1
                            </td>
                            <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                              Customer Name
                            </th>
                            <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 font-mono font-bold text-teal-300">
                              {sc.client || 'Investor'}
                            </td>
                          </tr>
                          <tr>
                            <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                              Call Scenario
                            </th>
                            <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-white">
                              {sc.team || 'Quality Audit'}
                            </td>
                            <th className="border border-slate-700 bg-slate-900/90 px-3 py-2 text-left font-semibold text-slate-300">
                              Phone Number
                            </th>
                            <td className="border border-slate-700 bg-slate-900/50 px-3 py-2 font-mono text-white">
                              {sc.calling_number || sc.trade_phone || '—'}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Quality Scorecard Table with grouped categories matching Images 2, 3, 4 */}
                      <table className="w-full border-collapse border border-slate-700 text-xs">
                        <tbody>
                          {officialCategories.map((cat, catIdx) => {
                            const catKey = `q${catIdx + 1}_status` as keyof ScorecardRecord;
                            const isCatPass = (sc[catKey] as string) !== 'FAIL';
                            return (
                              <React.Fragment key={cat.param_key}>
                                {cat.subparameters.map((sub, subIdx) => {
                                  return (
                                    <tr key={sub.id} className="hover:bg-slate-800/40 transition-colors">
                                      {subIdx === 0 && (
                                        <td
                                          rowSpan={cat.subparameters.length}
                                          className={`border border-slate-700 p-3 font-bold align-middle text-center w-1/4 ${
                                            cat.fatal ? 'text-rose-400 font-extrabold' : 'text-slate-100'
                                          }`}
                                        >
                                          <div>{cat.title}</div>
                                          {cat.fatal && (
                                            <div className="text-rose-500 text-[10px] uppercase font-bold tracking-wider mt-0.5">
                                              FATAL
                                            </div>
                                          )}
                                        </td>
                                      )}
                                      <td className={`border border-slate-700 px-3 py-2 ${cat.fatal ? 'text-rose-300/90' : 'text-slate-200'}`}>
                                        {sub.title}
                                      </td>
                                      {subIdx === 0 && (
                                        <td
                                          rowSpan={cat.subparameters.length}
                                          className="border border-slate-700 p-2 text-center font-bold text-white align-middle w-16"
                                        >
                                          {cat.weight}
                                        </td>
                                      )}
                                      {subIdx === 0 && (
                                        <td
                                          rowSpan={cat.subparameters.length}
                                          className={`border border-slate-700 p-2 text-center font-bold align-middle w-20 ${
                                            isCatPass ? 'text-emerald-400' : 'text-rose-400'
                                          }`}
                                        >
                                          {isCatPass ? 'Yes' : 'No'}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}

                          {/* Score & Star Rating Total Row - matching green banner in images */}
                          <tr className="bg-emerald-900/80 border border-slate-700 text-white font-bold text-sm">
                            <td colSpan={2} className="border border-slate-700 px-4 py-2.5 text-center tracking-wide uppercase font-extrabold">
                              Score & Star Rating
                            </td>
                            <td className="border border-slate-700 p-2 text-center font-mono text-base font-extrabold">
                              {calculatedScore}
                            </td>
                            <td className="border border-slate-700 p-2 text-center font-mono text-base font-extrabold text-amber-300">
                              {displayStars}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Overall Feedback */}
                      <div className="border border-slate-700 bg-slate-900/80 p-3.5 rounded-lg text-xs leading-relaxed">
                        <div className="font-bold text-slate-100 mb-1">Overall Feedback</div>
                        <div className="text-slate-300 min-h-[32px]">
                          {sc.audit_comment || 'Call audited successfully against quality standards and communication guidelines.'}
                        </div>
                      </div>

                      {/* FATAL Reason */}
                      <div className="border border-slate-700 bg-slate-900/80 p-3.5 rounded-b-xl text-xs leading-relaxed">
                        <div className="font-bold text-rose-500 mb-1">FATAL Reason</div>
                        <div className={`min-h-[24px] ${isFatal ? 'text-rose-300 font-semibold' : 'text-slate-400'}`}>
                          {isFatal ? (sc.fatal_reasons || 'Breach of Critical Compliance Parameters.') : 'None'}
                        </div>
                      </div>
                    </>
                  );
                })()}

                {/* Card Action Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 print:hidden">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedTranscriptId(expandedTranscriptId === sc.id ? null : sc.id)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all ${
                        expandedTranscriptId === sc.id
                          ? 'border-teal-400 bg-teal-500/20 text-teal-200 shadow-xs'
                          : 'border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300'
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5 text-teal-400" />
                      <span>{expandedTranscriptId === sc.id ? 'Hide Evidence' : 'Transcript & Evidence'}</span>
                    </button>

                    {(sc.call_id || sc.id) && (
                      <button
                        onClick={() => {
                          const cId = sc.call_id || sc.id;
                          playCall({
                            callId: cId,
                            callerId: `Scorecard #${sc.id} (Call #${cId})`,
                            clientCode: sc.client,
                            advisorName: sc.caller_name,
                            date: sc.trade_date || sc.call_date,
                            transcript: sc.transcript,
                          });
                        }}
                        className="px-3 py-1.5 rounded-xl border border-teal-500/40 bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all shadow-xs"
                        title="Listen to call audio recording with synchronized subtitles"
                      >
                        <Play className="w-3.5 h-3.5 text-teal-400 fill-teal-400" />
                        <span>Play Audio Call</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => downloadScorecardWord(sc)}
                      className="px-2.5 py-1.5 rounded-xl border border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                      title="Download Scorecard in Microsoft Word (.doc) format"
                    >
                      <Download className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Word</span>
                    </button>
                    <button
                      onClick={() => downloadScorecardExcel(sc)}
                      className="px-2.5 py-1.5 rounded-xl border border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                      title="Download Scorecard in Excel (.xlsx) format"
                    >
                      <Download className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Excel</span>
                    </button>
                    <button
                      onClick={() => copyScorecard(sc)}
                      className="px-2.5 py-1.5 rounded-xl border border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Copy className="w-3.5 h-3.5 text-teal-400" />
                      <span>Copy</span>
                    </button>
                    <button
                      onClick={() => printScorecard(sc.id)}
                      className="px-2.5 py-1.5 rounded-xl border border-teal-500/20 bg-slate-900/70 hover:bg-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-400" />
                      <span>Print</span>
                    </button>
                    <a
                      href={api.getSebiAuditPdfUrl(sc.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={`SEBI_Audit_Certificate_${sc.id}.pdf`}
                      className="px-2.5 py-1.5 rounded-xl border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all shadow-sm"
                      title="Download Official SEBI Formatted Audit Compliance Certificate (Circular SEBI/HO/MIRSD/DOS3/CIR/P/2018/52)"
                    >
                      <FileText className="w-3.5 h-3.5 text-emerald-400" />
                      <span>SEBI PDF</span>
                    </a>
                    <button
                      onClick={() => handleSendSingle(sc)}
                      disabled={sendingId === sc.id}
                      className="px-3 py-1.5 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <Send className="w-3.5 h-3.5 text-teal-300" />
                      <span>{sendingId === sc.id ? 'Sending…' : 'Email'}</span>
                    </button>
                  </div>
                </div>

                {/* Collapsible Transcript, Evidence & Audio Player Viewer */}
                {expandedTranscriptId === sc.id && (
                  <div className="mt-3 p-4 bg-slate-950/90 rounded-2xl border border-teal-500/20 text-slate-200 text-xs print:hidden space-y-3">
                    <div className="flex items-center justify-between border-b border-teal-500/20 pb-2">
                      <div className="font-bold text-teal-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Speech Transcript &amp; Pre-Order Highlight Analysis</span>
                      </div>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Call Ref #{sc.call_id || sc.id}
                      </span>
                    </div>

                    {/* Integrated Call Audio Playback */}
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-teal-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
                      <div className="flex items-center gap-2.5 w-full sm:w-auto">
                        <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center justify-center font-bold shrink-0">
                          <Volume2 className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>Call Recording</span>
                            <span className="text-[10px] font-mono text-teal-300 bg-teal-950/60 px-1.5 py-0.5 rounded border border-teal-800/50">
                              #{sc.call_id || sc.id}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Client: <span className="text-teal-300 font-mono font-semibold">{sc.client || sc.client_code || '—'}</span> · Advisor: <span className="text-slate-200 font-medium">{cleanCallerName(sc.caller_name) || sc.dealer || '—'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="w-full sm:w-auto flex items-center gap-2">
                        <audio
                          controls
                          autoPlay={playingCallId === (sc.call_id || sc.id)}
                          preload="metadata"
                          src={getAudioUrl(sc.call_id || sc.id)}
                          className="h-8 w-full sm:w-80 rounded-md accent-teal-400"
                        />
                      </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto">
                      <TranscriptHighlighter
                        transcript={sc.transcript || ''}
                        clientCode={sc.client_code || sc.client}
                        symbol={sc.symbol || (sc.trades && sc.trades[0]?.symbol)}
                        price={sc.price || (sc.trades && sc.trades[0]?.price)}
                        quantity={sc.quantity || (sc.trades && sc.trades[0]?.quantity)}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 1-Click Send Scorecard Modal */}
      <SendScorecardModal
        isOpen={isSendModalOpen}
        onClose={() => {
          setIsSendModalOpen(false);
          setModalScorecardId(undefined);
        }}
        scorecards={scorecards}
        initialAdvisor={modalAdvisor}
        initialScorecardId={modalScorecardId}
        initialMarkFilter={modalMarkFilter}
        onSuccess={(msg) => {
          alert(msg);
        }}
      />
    </div>
  );
};
