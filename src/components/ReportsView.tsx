import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  Filter,
  Search,
  Award,
  Archive,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  ShieldCheck,
  BarChart3,
  Users,
  Activity,
  ArrowUpRight,
  Info,
  RefreshCw,
  Clock,
  PieChart,
  Tag,
  AlertOctagon,
  FileCheck,
  FileSpreadsheet,
  Play,
  RotateCcw,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import pptxgen from 'pptxgenjs';
import type { ReportArchive, ScorecardRecord, CallRecord } from '../types';
import { getStoredToken, getApiUrl, safeParseJsonResponse } from '../lib/api';
import { useAudioPlayer } from './GlobalAudioPlayer';
import { cleanCallerName } from '../lib/clientCode';

interface AnalyticsData {
  totalScorecards: number;
  avgScore: number;
  compliantCount: number;
  fatalCount: number;
  complianceRate: number;
  qStats: {
    q1: { pass: number; fail: number; review: number };
    q2: { pass: number; fail: number; review: number };
    q3: { pass: number; fail: number; review: number; cmpCount: number };
    q4: { pass: number; fail: number; review: number };
    q5: { pass: number; fail: number; review: number };
  };
  advisors: Array<{
    name: string;
    totalCalls: number;
    avgScore: number;
    passCount: number;
    fatalCount: number;
    complianceRate: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  dailyTrend: Array<{
    date: string;
    total: number;
    pass: number;
    fatal: number;
    avgScore: number;
  }>;
  callClassification?: {
    total: number;
    preOrder: number;
    regular: number;
    scrap: number;
    unclassified: number;
    preOrderPct: number;
    regularPct: number;
    scrapPct: number;
    avgDurationPreOrder: number;
    avgDurationRegular: number;
    avgDurationScrap: number;
  };
  parameterFailures?: Array<{
    parameter: string;
    fails: number;
    total: number;
    failRate: number;
    severity: string;
  }>;
}

interface ReportsViewProps {
  archives?: ReportArchive[];
  scorecards?: ScorecardRecord[];
  calls?: CallRecord[];
  advisors?: string[];
  isLoading?: boolean;
  dateRange?: string;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  archives = [],
  scorecards = [],
  calls = [],
  advisors = [],
  isLoading = false,
  dateRange,
}) => {
  const { playCall, activeCall, isPlaying } = useAudioPlayer();

  // Active view section
  const [activeTab, setActiveTab] = useState<'ledger' | 'analytics' | 'archives'>('ledger');

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [advisorFilter, setAdvisorFilter] = useState('ALL');
  const [clientPrefixFilter, setClientPrefixFilter] = useState('ALL');
  const [scoreFilter, setScoreFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLIANT' | 'FATAL' | 'REVIEW'>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Export & Analytics state
  const [isExporting, setIsExporting] = useState(false);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isFetchingAnalytics, setIsFetchingAnalytics] = useState(false);
  const [advisorSearch, setAdvisorSearch] = useState('');

  const fetchAnalytics = async () => {
    setIsFetchingAnalytics(true);
    try {
      const token = getStoredToken();
      const url = getApiUrl('/api/reports/analytics');
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await safeParseJsonResponse<any>(res);
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setIsFetchingAnalytics(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  // Distinct advisor names
  const uniqueAdvisors = useMemo(() => {
    const set = new Set<string>();
    advisors.forEach((a) => a && set.add(a));
    scorecards.forEach((s) => {
      if (s.caller_name && s.caller_name !== '—') set.add(s.caller_name);
    });
    return Array.from(set).sort();
  }, [advisors, scorecards]);

  // Safe normalized date parser
  const normalizeDateStr = (d?: string): string => {
    if (!d) return '';
    const clean = d.trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts[0].length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return clean;
  };

  // Filtered scorecards ledger
  const filteredScorecards = useMemo(() => {
    return scorecards.filter((sc) => {
      // 1. Status Filter
      const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL' || sc.score === 0;
      if (statusFilter === 'COMPLIANT' && isFatal) return false;
      if (statusFilter === 'FATAL' && !isFatal) return false;
      if (statusFilter === 'REVIEW' && (sc.score >= 4 && !isFatal)) return false;

      // 2. Score Filter
      if (scoreFilter !== 'ALL') {
        const target = parseInt(scoreFilter, 10);
        if (sc.score !== target) return false;
      }

      // 3. Advisor Filter
      if (advisorFilter !== 'ALL') {
        const advName = (sc.caller_name || '').toLowerCase();
        if (advName !== advisorFilter.toLowerCase()) return false;
      }

      // 4. Client Prefix Filter
      if (clientPrefixFilter !== 'ALL') {
        const clientCode = (sc.client || sc.client_code || '').toUpperCase();
        if (!clientCode.startsWith(clientPrefixFilter)) return false;
      }

      // 5. Date From / To
      const itemDate = normalizeDateStr(sc.trade_date || sc.call_date || sc.created_at);
      if (dateFrom && itemDate && itemDate < dateFrom) return false;
      if (dateTo && itemDate && itemDate > dateTo) return false;

      // 6. Global dateRange Filter
      if (dateRange && dateRange !== 'all' && dateRange !== 'All Dates') {
        const sNorm = itemDate;
        if (dateRange.includes(' - ')) {
          const [start, end] = dateRange.split(' - ').map((s) => normalizeDateStr(s));
          if (sNorm && start && end && (sNorm < start || sNorm > end)) return false;
        } else {
          const target = normalizeDateStr(dateRange);
          if (sNorm && target && sNorm !== target) return false;
        }
      }

      // 7. Search text
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const client = (sc.client || sc.client_code || '').toLowerCase();
        const advisor = (sc.caller_name || '').toLowerCase();
        const symbol = (sc.symbol || '').toLowerCase();
        const phone = (sc.trade_phone || sc.calling_number || '').toLowerCase();
        const comment = (sc.audit_comment || '').toLowerCase();
        const fatalReason = (sc.fatal_reasons || '').toLowerCase();

        return (
          client.includes(q) ||
          advisor.includes(q) ||
          symbol.includes(q) ||
          phone.includes(q) ||
          comment.includes(q) ||
          fatalReason.includes(q) ||
          String(sc.id).includes(q)
        );
      }

      return true;
    });
  }, [scorecards, statusFilter, scoreFilter, advisorFilter, clientPrefixFilter, dateFrom, dateTo, dateRange, searchTerm]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredScorecards.length / pageSize));
  const paginatedScorecards = useMemo(() => {
    if (pageSize >= 9999) return filteredScorecards;
    const start = (currentPage - 1) * pageSize;
    return filteredScorecards.slice(start, start + pageSize);
  }, [filteredScorecards, currentPage, pageSize]);

  // Export current filtered ledger to Excel
  const handleExportFilteredLedger = () => {
    if (filteredScorecards.length === 0) {
      alert('No audit records match the current filter selection.');
      return;
    }

    const data = filteredScorecards.map((sc) => {
      const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL' || sc.score === 0;
      return {
        Audit_ID: sc.id,
        Call_ID: sc.call_id || 'N/A',
        Trade_Date: sc.trade_date || sc.call_date || 'N/A',
        Client_Code: sc.client || sc.client_code || 'N/A',
        Advisor_Name: cleanCallerName(sc.caller_name) || 'N/A',
        Phone_Number: sc.trade_phone || sc.calling_number || 'N/A',
        Symbol_Scrip: sc.symbol || 'N/A',
        Price: sc.price || 0,
        Quantity: sc.quantity || 0,
        Q1_Mobile_Match: sc.q1_status || 'FAIL',
        Q2_Client_Code_Confirm: sc.q2_status || 'FAIL',
        Q3_Stock_Price_Confirm: sc.q3_status || 'FAIL',
        Q4_Disclosure: sc.q4_status || 'PASS',
        Q5_No_Guarantee: sc.q5_status || 'PASS',
        Score_OutOf_5: isFatal ? 0 : sc.score,
        Compliance_Status: isFatal ? 'FATAL BREACH' : 'COMPLIANT',
        Fatal_Reasons: sc.fatal_reasons || (isFatal ? 'Mandatory Checkpoint Failure' : 'None'),
        Audit_Comments: sc.audit_comment || 'Pre-order confirmation evaluated as per SEBI norms',
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Audited_Calls_Ledger');
    XLSX.writeFile(wb, `AuditEQ_Compliance_Ledger_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Full multi-sheet Excel export
  const handleExportExcel = async () => {
    setIsExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Executive Summary
      const summaryData = [
        { Metric: 'Report Name', Value: 'AuditEQ Quality & Regulatory Compliance Audit' },
        { Metric: 'Generation Date', Value: new Date().toLocaleString() },
        { Metric: 'Audit Standard', Value: 'Pre-Order Confirmation Norms (5-Point Framework)' },
        { Metric: 'Total Audited Orders', Value: analytics?.totalScorecards || scorecards.length },
        { Metric: 'Overall Compliance Rate (%)', Value: `${analytics?.complianceRate || 0}%` },
        { Metric: 'Compliant Calls (Pass)', Value: analytics?.compliantCount || 0 },
        { Metric: 'Fatal Violations', Value: analytics?.fatalCount || 0 },
        { Metric: 'Average Audit Score', Value: analytics?.avgScore || 0 },
        { Metric: 'Active Filter Date Range', Value: dateRange || 'All Dates' },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive_Summary');

      // Sheet 2: Audited Calls Detail
      if (filteredScorecards.length > 0) {
        const rows = filteredScorecards.map((sc) => ({
          Scorecard_ID: sc.id,
          Call_ID: sc.call_id || '—',
          Trade_Date: sc.trade_date || sc.call_date || '—',
          Client_Code: sc.client || sc.client_code || '—',
          Advisor_Dealer: sc.caller_name || '—',
          Client_Phone: sc.trade_phone || sc.calling_number || '—',
          Symbol: sc.symbol || '—',
          Q1_CLI: sc.q1_status,
          Q2_UCC: sc.q2_status,
          Q3_Stock_Price: sc.q3_status,
          Q4_Ack: sc.q4_status,
          Q5_No_Guarantee: sc.q5_status,
          Final_Score: sc.is_fatal ? 0 : sc.score,
          Status: sc.is_fatal ? 'FATAL' : 'COMPLIANT',
          Fatal_Reason: sc.fatal_reasons || '',
        }));
        const wsDetail = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Audited_Orders');
      }

      // Sheet 3: Dealer Scorecard
      if (analytics?.advisors) {
        const advData = analytics.advisors.map((adv) => ({
          Advisor_Dealer_Name: adv.name,
          Total_Audited_Calls: adv.totalCalls,
          Average_Score: adv.avgScore,
          Compliant_Calls: adv.passCount,
          Fatal_Breaches: adv.fatalCount,
          Compliance_Rate_Pct: `${adv.complianceRate}%`,
          Risk_Category: adv.riskLevel,
        }));
        const wsAdv = XLSX.utils.json_to_sheet(advData);
        XLSX.utils.book_append_sheet(wb, wsAdv, 'Dealer_Scorecard');
      }

      XLSX.writeFile(wb, `AuditEQ_Quality_Report_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err: unknown) {
      alert(`Excel export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Executive PowerPoint deck export
  const handleExportPPT = async () => {
    setIsExporting(true);
    try {
      const pres = new pptxgen();
      pres.layout = 'LAYOUT_16x9';

      // Slide 1: Cover
      const slide1 = pres.addSlide();
      slide1.background = { color: '0A0A0E' };
      slide1.addText('AuditEQ Voice Quality & Pre-Order Compliance', {
        x: 0.8,
        y: 1.8,
        w: 8.5,
        fontSize: 28,
        bold: true,
        color: 'FBBF24',
        fontFace: 'Arial',
      });
      slide1.addText('Executive Quality & Regulatory Compliance Review Deck', {
        x: 0.8,
        y: 2.8,
        w: 8.5,
        fontSize: 16,
        color: 'E5E5E5',
        fontFace: 'Arial',
      });
      slide1.addText(`Generated: ${new Date().toLocaleDateString()} | Framework: SEBI Pre-Order v1.1`, {
        x: 0.8,
        y: 3.6,
        w: 8.5,
        fontSize: 12,
        color: 'A3A3A3',
        fontFace: 'Arial',
      });

      // Slide 2: High Level KPI Metrics
      const slide2 = pres.addSlide();
      slide2.background = { color: 'FFFFFF' };
      slide2.addText('Executive Compliance Summary', {
        x: 0.8,
        y: 0.6,
        fontSize: 22,
        bold: true,
        color: '0A0A0E',
      });
      slide2.addText(`Audit records filtered by ${dateRange || 'All Dates'}`, {
        x: 0.8,
        y: 1.1,
        fontSize: 12,
        color: '737373',
      });

      const kpiBoxes = [
        { title: 'Audited Orders', val: `${analytics?.totalScorecards || scorecards.length}`, sub: 'Calls cross-referenced' },
        { title: 'Compliance Rate', val: `${analytics?.complianceRate || 0}%`, sub: 'Adherence to Norms' },
        { title: 'Compliant Audits', val: `${analytics?.compliantCount || 0}`, sub: 'Zero Fatal Breaches' },
        { title: 'Fatal Breaches', val: `${analytics?.fatalCount || 0}`, sub: 'Q1, Q2, Q5 Fatalities' },
      ];

      kpiBoxes.forEach((box, i) => {
        const xPos = 0.8 + i * 2.2;
        slide2.addShape(pres.ShapeType.rect, {
          x: xPos,
          y: 1.8,
          w: 2.0,
          h: 2.0,
          fill: { color: 'F8FAFC' },
          line: { color: 'E2E8F0', width: 1 },
        });
        slide2.addText(box.title, { x: xPos + 0.1, y: 2.0, w: 1.8, fontSize: 10, bold: true, color: '64748B' });
        slide2.addText(box.val, { x: xPos + 0.1, y: 2.5, w: 1.8, fontSize: 24, bold: true, color: '0F172A' });
        slide2.addText(box.sub, { x: xPos + 0.1, y: 3.2, w: 1.8, fontSize: 9, color: '94A3B8' });
      });

      await pres.writeFile({ fileName: `AuditEQ_Compliance_Deck_${new Date().toISOString().slice(0, 10)}.pptx` });
    } catch (err: unknown) {
      alert(`PowerPoint export failed: ${(err as Error).message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const formatSeconds = (sec?: number) => {
    if (!sec || sec <= 0) return '0s';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m === 0 ? `${s}s` : `${m}m ${s}s`;
  };

  const total = analytics?.totalScorecards || scorecards.length;
  const qStats = analytics?.qStats;
  const classification = analytics?.callClassification;

  const calculatePct = (val: number, tot: number) => {
    if (!tot || tot === 0) return 0;
    return Math.round((val / tot) * 100);
  };

  const filteredAdvisors = (analytics?.advisors || []).filter((adv) =>
    adv.name.toLowerCase().includes(advisorSearch.toLowerCase())
  );

  // Maximum Failure Reason with Verbatim Evidence Deduction
  const maxFailureInfo = useMemo(() => {
    if (!qStats) return null;
    const failures = [
      { key: 'q1', name: 'Q1: Unregistered Customer Phone (CLI Mismatch)', fails: qStats.q1.fail, flag: 'FATAL', desc: 'Call placed or received on unverified / unregistered mobile number' },
      { key: 'q2', name: 'Q2: Regulatory UCC Timing Violation', fails: qStats.q2.fail, flag: 'FATAL', desc: 'Unique Client Code was not explicitly confirmed prior to order execution' },
      { key: 'q3', name: 'Q3: Incomplete Order Confirmation (Scrip/Price/Qty)', fails: qStats.q3.fail, flag: 'DEFECT', desc: 'Dealer failed to verbally specify script, exact quantity, or market price' },
      { key: 'q5', name: 'Q5: Guaranteed Return / Commitment Breach', fails: qStats.q5.fail, flag: 'FATAL', desc: 'Assurance of returns or profit guarantee promised on recorded line' },
    ];
    failures.sort((a, b) => b.fails - a.fails);
    const top = failures[0];
    if (!top || top.fails === 0) return null;

    let sampleEvidence = '';
    let sampleClient = '';
    let sampleAdvisor = '';
    for (const sc of scorecards) {
      if (top.key === 'q1' && sc.q1_status === 'FAIL') {
        sampleEvidence = sc.q1_evidence || sc.transcript?.slice(0, 180) || '';
        sampleClient = sc.client || '';
        sampleAdvisor = sc.caller_name || '';
        break;
      }
      if (top.key === 'q2' && sc.q2_status === 'FAIL') {
        sampleEvidence = sc.q2_evidence || sc.transcript?.slice(0, 180) || '';
        sampleClient = sc.client || '';
        sampleAdvisor = sc.caller_name || '';
        break;
      }
      if (top.key === 'q3' && sc.q3_status === 'FAIL') {
        sampleEvidence = sc.q3_evidence || sc.transcript?.slice(0, 180) || '';
        sampleClient = sc.client || '';
        sampleAdvisor = sc.caller_name || '';
        break;
      }
      if (top.key === 'q5' && sc.q5_status === 'FAIL') {
        sampleEvidence = sc.q5_evidence || sc.transcript?.slice(0, 180) || '';
        sampleClient = sc.client || '';
        sampleAdvisor = sc.caller_name || '';
        break;
      }
    }

    return {
      ...top,
      sampleEvidence,
      sampleClient,
      sampleAdvisor,
      percentage: total > 0 ? Math.round((top.fails / total) * 100) : 0,
    };
  }, [qStats, scorecards, total]);

  // Date-wise summary rollup from scorecards or analytics
  const dateWiseTrend = useMemo(() => {
    if (analytics?.dailyTrend && analytics.dailyTrend.length > 0) {
      return analytics.dailyTrend;
    }
    const map: Record<string, { total: number; pass: number; fatal: number; sumScore: number }> = {};
    for (const sc of scorecards) {
      const d = (sc.trade_date || sc.call_date || (sc.created_at ? sc.created_at.slice(0, 10) : 'Unknown')).slice(0, 10);
      if (!map[d]) map[d] = { total: 0, pass: 0, fatal: 0, sumScore: 0 };
      map[d].total++;
      const isFatal = sc.is_fatal || sc.score === 0 || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
      if (isFatal) {
        map[d].fatal++;
      } else {
        map[d].pass++;
      }
      map[d].sumScore += (isFatal ? 0 : (sc.score ?? 5));
    }
    return Object.entries(map).map(([date, val]) => ({
      date,
      total: val.total,
      pass: val.pass,
      fatal: val.fatal,
      avgScore: Number((val.sumScore / val.total).toFixed(1)),
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [analytics?.dailyTrend, scorecards]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Multi-Export Center */}
      <div className="glass-panel p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-teal-500/10 text-teal-300 border border-teal-500/20">
              <BarChart3 className="w-5 h-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                <span>Detailed Regulatory Compliance Reports</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  5-POINT AUDIT STANDARD
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                In-depth audit reconciliation with inline call listening, dealer scorecards, parameter breakdowns, and regulatory export.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchAnalytics}
            disabled={isFetchingAnalytics}
            className="px-3 py-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-teal-500/20 transition-all cursor-pointer"
            title="Refresh analytics and audit records"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-teal-400 ${isFetchingAnalytics ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportFilteredLedger}
            className="px-3.5 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Download current filtered audit ledger as Excel file"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span>Export Filtered ({filteredScorecards.length})</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={isExporting}
            className="px-3.5 py-2 bg-slate-900/80 hover:bg-slate-800 text-teal-300 border border-teal-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Download full executive multi-sheet Excel package"
          >
            <Download className="w-3.5 h-3.5 text-teal-400" />
            <span>Full Excel (.XLSX)</span>
          </button>

          <button
            onClick={handleExportPPT}
            disabled={isExporting}
            className="px-3.5 py-2 bg-teal-500/20 hover:bg-teal-500/30 text-teal-200 border border-teal-500/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
            title="Download executive presentation deck"
          >
            <FileText className="w-3.5 h-3.5 text-teal-300" />
            <span>Deck (.PPTX)</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Audited Orders */}
        <div className="glass-card-interactive p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span className="font-semibold text-slate-300">Audited Orders</span>
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-300 border border-teal-500/20">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">{total}</div>
          <div className="text-[11px] text-slate-400 mt-1">
            Reconciled against trade execution logs
          </div>
        </div>

        {/* Overall Compliance Rate */}
        <div className="glass-card-interactive p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span className="font-semibold text-slate-300">Compliance Rate</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {analytics?.complianceRate ?? 0}%
          </div>
          <div className="text-[11px] text-emerald-400 font-medium mt-1">
            {analytics?.compliantCount || 0} compliant orders (Scores 4-5)
          </div>
        </div>

        {/* Fatal Non-Compliance */}
        <div className="glass-card-interactive p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span className="font-semibold text-slate-300">Fatal Breaches</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/20">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight">
            {analytics?.fatalCount || 0}
          </div>
          <div className="text-[11px] text-rose-400 font-medium mt-1">
            {total > 0 ? Math.round(((analytics?.fatalCount || 0) / total) * 100) : 0}% failure rate (Score 0)
          </div>
        </div>

        {/* Average Audit Score */}
        <div className="glass-card-interactive p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span className="font-semibold text-slate-300">Quality Rating</span>
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-300 border border-teal-500/20">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white tracking-tight flex items-baseline gap-1">
            <span>{analytics?.avgScore ?? 0}</span>
            <span className="text-xs text-slate-400 font-normal">/ 5.0</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            SEBI passing threshold &ge; 4.0
          </div>
        </div>
      </div>

      {/* View Switcher Navigation Tabs */}
      <div className="border-b border-teal-500/20 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'ledger'
                ? 'border-teal-400 text-white bg-teal-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-teal-400" />
            <span>Audited Calls Ledger</span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-teal-950 text-teal-300 border border-teal-500/30">
              {filteredScorecards.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'analytics'
                ? 'border-teal-400 text-white bg-teal-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <PieChart className="w-4 h-4 text-teal-400" />
            <span>Compliance Analytics &amp; Pareto</span>
          </button>

          <button
            onClick={() => setActiveTab('archives')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'archives'
                ? 'border-teal-400 text-white bg-teal-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
            }`}
          >
            <Archive className="w-4 h-4 text-teal-400" />
            <span>Historical Archives</span>
            {archives.length > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                {archives.length}
              </span>
            )}
          </button>
        </div>

        {dateRange && dateRange !== 'All Dates' && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-teal-300 bg-teal-950/60 px-2.5 py-1 rounded-lg border border-teal-500/30">
            <Calendar className="w-3.5 h-3.5 text-teal-400" />
            <span>Filter Active: {dateRange}</span>
          </div>
        )}
      </div>

      {/* TAB 1: AUDITED CALLS LEDGER */}
      {activeTab === 'ledger' && (
        <div className="space-y-4">
          {/* Comprehensive Multi-Parameter Filter Toolbar */}
          <div className="glass-panel p-4 rounded-2xl space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-300 font-semibold border-b border-slate-800/80 pb-2">
              <span className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5 text-teal-400" />
                <span>Audit Ledger Filters</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Displaying {filteredScorecards.length} of {scorecards.length} audited orders
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              {/* Search Box */}
              <div className="lg:col-span-2 relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search client code, advisor, symbol, remarks..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-950/70 border border-teal-500/20 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-hidden focus:border-teal-400 transition-colors"
                />
              </div>

              {/* Advisor Name Filter */}
              <div>
                <select
                  value={advisorFilter}
                  onChange={(e) => {
                    setAdvisorFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-950/70 border border-teal-500/20 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-teal-400"
                >
                  <option value="ALL">All Advisors ({uniqueAdvisors.length})</option>
                  {uniqueAdvisors.map((adv) => (
                    <option key={adv} value={adv}>
                      {adv}
                    </option>
                  ))}
                </select>
              </div>

              {/* Client Code Prefix Filter */}
              <div>
                <select
                  value={clientPrefixFilter}
                  onChange={(e) => {
                    setClientPrefixFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-950/70 border border-teal-500/20 rounded-xl text-xs font-mono text-slate-200 focus:outline-hidden focus:border-teal-400"
                >
                  <option value="ALL">All Client Prefixes</option>
                  <option value="WIA">WIA (Standard Equity)</option>
                  <option value="WIF">WIF (F&amp;O)</option>
                  <option value="WIC">WIC (Commodity)</option>
                  <option value="WID">WID (Derivatives)</option>
                  <option value="WIG">WIG (Global)</option>
                  <option value="WIE">WIE (Enterprise)</option>
                  <option value="FIA">FIA (Institutional)</option>
                  <option value="PWD">PWD (Privileged)</option>
                </select>
              </div>

              {/* Score Filter */}
              <div>
                <select
                  value={scoreFilter}
                  onChange={(e) => {
                    setScoreFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-950/70 border border-teal-500/20 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-teal-400"
                >
                  <option value="ALL">All Scores (0-5)</option>
                  <option value="5">5 Marks (Perfect)</option>
                  <option value="4">4 Marks (Qualified Pass)</option>
                  <option value="3">3 Marks (Remarks)</option>
                  <option value="0">0 Marks (Fatal Deficient)</option>
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as any);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-950/70 border border-teal-500/20 rounded-xl text-xs text-slate-200 focus:outline-hidden focus:border-teal-400"
                >
                  <option value="ALL">All Dispositions</option>
                  <option value="COMPLIANT">Compliant (Score 4-5)</option>
                  <option value="FATAL">Fatal Breaches (Score 0)</option>
                  <option value="REVIEW">Needs Review</option>
                </select>
              </div>
            </div>

            {/* Date Range Sub-Bar */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800/60 text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-teal-400" />
                <span>Date Range:</span>
              </span>
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-slate-500">From:</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-slate-950/70 border border-teal-500/20 rounded-lg text-xs text-slate-200"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-slate-500">To:</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-slate-950/70 border border-teal-500/20 rounded-lg text-xs text-slate-200"
                />
              </div>

              {/* Rows Per Page */}
              <div className="flex items-center gap-1.5 ml-auto">
                <label className="text-[11px] text-slate-500">Page size:</label>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-slate-950/70 border border-teal-500/20 rounded-lg text-xs text-slate-200"
                >
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                  <option value={9999}>All ({filteredScorecards.length})</option>
                </select>
              </div>

              {(dateFrom || dateTo || searchTerm || advisorFilter !== 'ALL' || clientPrefixFilter !== 'ALL' || scoreFilter !== 'ALL' || statusFilter !== 'ALL') && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setAdvisorFilter('ALL');
                    setClientPrefixFilter('ALL');
                    setScoreFilter('ALL');
                    setStatusFilter('ALL');
                    setDateFrom('');
                    setDateTo('');
                    setCurrentPage(1);
                  }}
                  className="text-[11px] text-teal-400 hover:text-teal-300 font-bold cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Filters</span>
                </button>
              )}
            </div>
          </div>

          {/* Detailed Ledger Table */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950/90 text-slate-300 font-semibold border-b border-teal-500/20 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3">Call &amp; Audit ID</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Client Code</th>
                    <th className="py-3 px-3">Advisor / Dealer</th>
                    <th className="py-3 px-3">Symbol / Scrip</th>
                    <th className="py-3 px-2 text-center" title="Q1: Registered CLI Match (FATAL)">Q1 CLI</th>
                    <th className="py-3 px-2 text-center" title="Q2: Client UCC Verified (FATAL)">Q2 UCC</th>
                    <th className="py-3 px-2 text-center" title="Q3: Script, Qty & Price Confirmed (1 PT)">Q3 Details</th>
                    <th className="py-3 px-2 text-center" title="Q4: Disclosures & Brokerage Norms (1 PT)">Q4 Disc</th>
                    <th className="py-3 px-2 text-center" title="Q5: Return Guarantee Prohibited (FATAL)">Q5 Conduct</th>
                    <th className="py-3 px-3 text-center">Score</th>
                    <th className="py-3 px-3 text-center">Compliance Status</th>
                    <th className="py-3 px-3 min-w-[160px]">Fatal Reason / Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-500/10 text-slate-200">
                  {paginatedScorecards.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="py-12 text-center text-slate-400">
                        No audit records match the current filter selection. Try clearing or expanding your filters.
                      </td>
                    </tr>
                  ) : (
                    paginatedScorecards.map((sc) => {
                      const isFatal = sc.is_fatal || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL' || sc.score === 0;
                      const isCurrentPlaying = activeCall?.callId === sc.call_id && isPlaying;

                      const q1Pass = sc.q1_status === 'PASS';
                      const q2Pass = sc.q2_status === 'PASS';
                      const q3Pass = sc.q3_status === 'PASS';
                      const q4Pass = sc.q4_status === 'PASS';
                      const q5Pass = sc.q5_status === 'PASS';

                      const displayScore = isFatal ? 0 : sc.score;

                      return (
                        <tr
                          key={sc.id}
                          className={`transition-colors hover:bg-teal-500/5 ${
                            isFatal ? 'border-l-4 border-l-rose-500 bg-rose-950/5' : 'border-l-4 border-l-emerald-500/40'
                          }`}
                        >
                          {/* ID & Play Audio Button */}
                          <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              {sc.call_id ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    playCall({
                                      callId: sc.call_id!,
                                      callerId: `Report #${sc.id} (Call #${sc.call_id})`,
                                      clientCode: sc.client || sc.client_code,
                                      advisorName: sc.caller_name,
                                      date: sc.trade_date || sc.call_date,
                                      transcript: sc.transcript,
                                    })
                                  }
                                  className={`p-1.5 rounded-lg border text-xs font-bold flex items-center gap-1 cursor-pointer transition-all shadow-xs ${
                                    isCurrentPlaying
                                      ? 'bg-amber-400 text-slate-950 border-amber-300 ring-2 ring-amber-400/50 animate-pulse'
                                      : 'bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border-teal-500/40 hover:scale-105 active:scale-95'
                                  }`}
                                  title="Listen to call with live subtitles"
                                >
                                  <Play className="w-3 h-3 fill-current text-teal-400" />
                                  <span className="text-[10px]">Play</span>
                                </button>
                              ) : null}
                              <span className="text-teal-400">#{sc.id}</span>
                            </div>
                          </td>

                          {/* Trade Date */}
                          <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                            {sc.trade_date || sc.call_date || '—'}
                          </td>

                          {/* Client Code */}
                          <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md bg-teal-950/80 text-teal-300 border border-teal-500/30">
                              {sc.client || sc.client_code || '—'}
                            </span>
                          </td>

                          {/* Advisor / Dealer */}
                          <td className="py-2.5 px-3 font-medium text-white whitespace-nowrap">
                            {cleanCallerName(sc.caller_name) || '—'}
                          </td>

                          {/* Symbol */}
                          <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">
                            {sc.symbol || '—'}
                          </td>

                          {/* Q1: CLI Match */}
                          <td className="py-2.5 px-2 text-center">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                                q1Pass
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {q1Pass ? 'PASS' : 'FAIL'}
                            </span>
                          </td>

                          {/* Q2: UCC */}
                          <td className="py-2.5 px-2 text-center">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                                q2Pass
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {q2Pass ? 'PASS' : 'FAIL'}
                            </span>
                          </td>

                          {/* Q3: Details */}
                          <td className="py-2.5 px-2 text-center">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                                q3Pass
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {q3Pass ? 'PASS' : 'FAIL'}
                            </span>
                          </td>

                          {/* Q4: Disclosure */}
                          <td className="py-2.5 px-2 text-center">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                                q4Pass
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {q4Pass ? 'PASS' : 'FAIL'}
                            </span>
                          </td>

                          {/* Q5: Conduct */}
                          <td className="py-2.5 px-2 text-center">
                            <span
                              className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                                q5Pass
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {q5Pass ? 'PASS' : 'FAIL'}
                            </span>
                          </td>

                          {/* Score */}
                          <td className="py-2.5 px-3 text-center font-bold font-mono">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] ${
                                displayScore >= 4
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              }`}
                            >
                              {displayScore} / 5
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider ${
                                isFatal
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              }`}
                            >
                              {isFatal ? <AlertTriangle className="w-3 h-3 text-rose-400" /> : <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                              <span>{isFatal ? 'FATAL BREACH' : 'COMPLIANT'}</span>
                            </span>
                          </td>

                          {/* Remarks / Fatal Reason */}
                          <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                            {sc.fatal_reasons ? (
                              <span className="text-rose-300 font-semibold">{sc.fatal_reasons}</span>
                            ) : (
                              <span>{sc.audit_comment || 'Pre Order Confirmation is as per Regulatory Norm.'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-3 border-t border-teal-500/20 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
                <span>
                  Showing page {currentPage} of {totalPages} ({filteredScorecards.length} records)
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="font-mono px-2 py-0.5 text-slate-200">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 disabled:opacity-40 hover:bg-slate-800 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: COMPLIANCE ANALYTICS & PARETO */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Call Categorization & Ingestion Breakdown Card */}
          {classification && (
            <div className="glass-panel p-5 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Tag className="w-4 h-4 text-teal-400" />
                    <span>Call Volume &amp; Ingestion Spectrum</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Breakdown of {classification.total} imported recordings across order, advisory, and scrap calls
                  </p>
                </div>
                <span className="text-xs font-mono font-bold text-teal-300 bg-teal-950/80 px-3 py-1 rounded-full border border-teal-500/30">
                  Total Ingested: {classification.total}
                </span>
              </div>

              {/* Categorization Visual Bar */}
              <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden flex border border-teal-500/20">
                <div
                  style={{ width: `${classification.preOrderPct}%` }}
                  className="bg-teal-400 transition-all shadow-[0_0_8px_rgba(45,212,191,0.5)]"
                  title={`Pre-Order Calls: ${classification.preOrder} (${classification.preOrderPct}%)`}
                />
                <div
                  style={{ width: `${classification.regularPct}%` }}
                  className="bg-slate-600 transition-all"
                  title={`Regular Advisory Calls: ${classification.regular} (${classification.regularPct}%)`}
                />
                <div
                  style={{ width: `${classification.scrapPct}%` }}
                  className="bg-rose-500 transition-all shadow-[0_0_8px_rgba(244,63,94,0.5)]"
                  title={`Scrap Calls (<=6s): ${classification.scrap} (${classification.scrapPct}%)`}
                />
              </div>

              {/* 3 Detailed Categorization Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {/* Pre-Order */}
                <div className="p-3.5 rounded-xl border border-teal-500/30 bg-teal-950/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-200 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.8)]" />
                      <span>Pre-Order Calls</span>
                    </span>
                    <span className="text-xs font-extrabold text-teal-300 font-mono">
                      {classification.preOrder} ({classification.preOrderPct}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Audited for client identity, script name, quantity, and price confirmation.
                  </p>
                  <div className="text-[11px] text-teal-300 font-semibold flex items-center gap-1 pt-1 border-t border-teal-500/20">
                    <Clock className="w-3 h-3 text-teal-400" />
                    <span>Avg Duration: {formatSeconds(classification.avgDurationPreOrder)}</span>
                  </div>
                </div>

                {/* Regular */}
                <div className="p-3.5 rounded-xl border border-slate-700 bg-slate-900/40 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />
                      <span>Regular Advisory Calls</span>
                    </span>
                    <span className="text-xs font-extrabold text-slate-300 font-mono">
                      {classification.regular} ({classification.regularPct}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    General recommendations and portfolio discussions with no trade instruction.
                  </p>
                  <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1 pt-1 border-t border-slate-700/60">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>Avg Duration: {formatSeconds(classification.avgDurationRegular)}</span>
                  </div>
                </div>

                {/* Scrap */}
                <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-950/30 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                      <span>Scrap Calls (&le; 6s)</span>
                    </span>
                    <span className="text-xs font-extrabold text-rose-300 font-mono">
                      {classification.scrap} ({classification.scrapPct}%)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Voicemails, ringing timeouts, and brief disconnects under 6 seconds.
                  </p>
                  <div className="text-[11px] text-rose-300 font-semibold flex items-center gap-1 pt-1 border-t border-rose-500/20">
                    <Clock className="w-3 h-3 text-rose-400" />
                    <span>Avg Duration: {formatSeconds(classification.avgDurationScrap)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 5-Point Parameter Failure Pareto Section */}
          <div className="glass-panel p-5 rounded-2xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertOctagon className="w-4 h-4 text-teal-400" />
                <span>Audit Standard 5-Point Parameter Evaluation</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Pass / fail audit breakdown across mandatory checkpoints
              </p>
            </div>

            {qStats && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Q1 */}
                <div className="p-3.5 rounded-xl border border-teal-500/20 bg-slate-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Q1: CLI Match</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      FATAL
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Mandate: Call received on registered client mobile number.
                  </p>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800 font-medium">
                    <span className="text-emerald-400">Pass: {qStats.q1.pass} ({calculatePct(qStats.q1.pass, total)}%)</span>
                    <span className="text-rose-400 font-bold">Fail: {qStats.q1.fail}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div style={{ width: `${calculatePct(qStats.q1.pass, total)}%` }} className="bg-emerald-400" />
                    <div style={{ width: `${calculatePct(qStats.q1.fail, total)}%` }} className="bg-rose-500" />
                  </div>
                </div>

                {/* Q2 */}
                <div className="p-3.5 rounded-xl border border-teal-500/20 bg-slate-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Q2: Client UCC</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      FATAL
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Mandate: Unique Client Code explicitly confirmed before order.
                  </p>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800 font-medium">
                    <span className="text-emerald-400">Pass: {qStats.q2.pass} ({calculatePct(qStats.q2.pass, total)}%)</span>
                    <span className="text-rose-400 font-bold">Fail: {qStats.q2.fail}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div style={{ width: `${calculatePct(qStats.q2.pass, total)}%` }} className="bg-emerald-400" />
                    <div style={{ width: `${calculatePct(qStats.q2.fail, total)}%` }} className="bg-rose-500" />
                  </div>
                </div>

                {/* Q3 */}
                <div className="p-3.5 rounded-xl border border-teal-500/20 bg-slate-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Q3: Script / Qty / Price</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                      1 PT
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Stock name, quantity, and price/CMP confirmed.
                  </p>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800 font-medium">
                    <span className="text-emerald-400">Pass: {qStats.q3.pass} ({calculatePct(qStats.q3.pass, total)}%)</span>
                    <span className="text-teal-400 font-bold">Fail: {qStats.q3.fail}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div style={{ width: `${calculatePct(qStats.q3.pass, total)}%` }} className="bg-emerald-400" />
                    <div style={{ width: `${calculatePct(qStats.q3.fail, total)}%` }} className="bg-teal-400" />
                  </div>
                </div>

                {/* Q5 */}
                <div className="p-3.5 rounded-xl border border-teal-500/20 bg-slate-900/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Q5: Conduct Standard</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      FATAL
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Code of Conduct: No false promises or assured return guarantees.
                  </p>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800 font-medium">
                    <span className="text-emerald-400">Pass: {qStats.q5.pass} ({calculatePct(qStats.q5.pass, total)}%)</span>
                    <span className="text-rose-400 font-bold">Fail: {qStats.q5.fail}</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div style={{ width: `${calculatePct(qStats.q5.pass, total)}%` }} className="bg-emerald-400" />
                    <div style={{ width: `${calculatePct(qStats.q5.fail, total)}%` }} className="bg-rose-500" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Top Compliance Vulnerability / Maximum Failure Reason with Verbatim Evidence Deduction */}
          {maxFailureInfo && (
            <div className="glass-panel p-5 rounded-2xl space-y-3 border-rose-500/30 bg-gradient-to-r from-rose-950/30 via-slate-900/60 to-amber-950/20 shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-rose-500/20 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/30 shrink-0">
                    <ShieldAlert className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
                        Top Compliance Vulnerability &bull; Maximum Failure Reason
                      </span>
                      <span className="text-[10px] font-black px-2 py-0.2 rounded-full bg-rose-500 text-slate-950">
                        {maxFailureInfo.flag}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-white mt-0.5">{maxFailureInfo.name}</h4>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-rose-300 bg-rose-950/80 px-3 py-1 rounded-lg border border-rose-500/30">
                    {maxFailureInfo.fails} Breaches ({maxFailureInfo.percentage}% of all audits)
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-300">{maxFailureInfo.desc}</p>

              {/* Deducted Speech Transcript Evidence */}
              {maxFailureInfo.sampleEvidence ? (
                <div className="bg-slate-950/80 rounded-xl p-3.5 border border-rose-500/20 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span className="text-rose-400 font-bold flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      <span>Deducted Call Audio Transcript Evidence (Verbatim Proof of Violation)</span>
                    </span>
                    <span>
                      Client: <b className="text-white">{maxFailureInfo.sampleClient || 'UCC'}</b> | Advisor:{' '}
                      <b className="text-white">{maxFailureInfo.sampleAdvisor || 'Dealer'}</b>
                    </span>
                  </div>
                  <blockquote className="text-xs text-amber-200/90 italic border-l-2 border-rose-500 pl-3 py-1 font-serif leading-relaxed">
                    "{maxFailureInfo.sampleEvidence}"
                  </blockquote>
                </div>
              ) : (
                <div className="text-[11px] text-slate-500 italic">
                  Deducted audio transcription evidence available on individual call scorecards.
                </div>
              )}
            </div>
          )}

          {/* Date-Wise Compliance & Volume Trend Visual Graph */}
          {dateWiseTrend.length > 0 && (
            <div className="glass-panel p-5 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-teal-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-teal-400" />
                  <h3 className="text-sm font-bold text-white">Date-Wise Compliance &amp; Audit Volume Trend</h3>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-400" />
                    <span>Compliant Orders</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
                    <span>Fatal Breaches</span>
                  </span>
                </div>
              </div>

              {/* Multi-Bar Date Visual Chart */}
              <div className="h-44 flex items-end justify-between gap-2 pt-4 px-2">
                {(() => {
                  const maxDayCount = Math.max(...dateWiseTrend.map((d) => d.total), 1);
                  return dateWiseTrend.map((d) => {
                    const passPct = d.total > 0 ? (d.pass / d.total) * 100 : 0;
                    const heightPct = Math.max(10, (d.total / maxDayCount) * 100);
                    return (
                      <div
                        key={d.date}
                        className="flex-1 flex flex-col items-center gap-2 h-full justify-end group cursor-pointer"
                        title={`${d.date}: ${d.total} audits (${d.pass} pass, ${d.fatal} fatal) - Rating: ${d.avgScore}/5`}
                      >
                        <span className="text-[10px] font-mono text-teal-300 opacity-0 group-hover:opacity-100 transition-opacity">
                          {d.total}
                        </span>
                        <div
                          style={{ height: `${heightPct}%` }}
                          className="w-full max-w-[28px] rounded-t-lg overflow-hidden flex flex-col-reverse bg-slate-900 border border-teal-500/20 shadow-xs"
                        >
                          <div style={{ height: `${passPct}%` }} className="w-full bg-emerald-500" />
                          <div style={{ height: `${100 - passPct}%` }} className="w-full bg-rose-500" />
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono truncate max-w-[50px]">
                          {d.date.length > 5 ? d.date.slice(5) : d.date}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Advisor Performance Comparison Visual Chart */}
          {filteredAdvisors.length > 0 && (
            <div className="glass-panel p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-teal-500/20 pb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-teal-400" />
                  <h3 className="text-sm font-bold text-white">Advisor Performance Comparison Visual</h3>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {filteredAdvisors.length} Dealers Audited
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredAdvisors.map((adv) => (
                  <div key={adv.name} className="p-3.5 bg-slate-950/70 rounded-xl border border-teal-500/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white truncate max-w-[130px]">{adv.name}</span>
                      <span
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                          adv.complianceRate >= 85
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : adv.complianceRate >= 70
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {adv.complianceRate}% Compliance
                      </span>
                    </div>

                    <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden flex border border-teal-500/20">
                      <div
                        style={{ width: `${adv.complianceRate}%` }}
                        className={`rounded-full transition-all ${
                          adv.complianceRate >= 85 ? 'bg-emerald-400' : adv.complianceRate >= 70 ? 'bg-amber-400' : 'bg-rose-500'
                        }`}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>{adv.totalCalls} Audits</span>
                      <span>Score: <b className="text-white">{adv.avgScore} / 5</b></span>
                      <span className={adv.fatalCount > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                        {adv.fatalCount} Fatal
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Advisor Performance & Risk Matrix */}
          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-teal-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-teal-400" />
                  <span>Advisor Compliance &amp; Risk Ranking</span>
                </h3>
                <p className="text-xs text-slate-400">Rollup by advisor name with automated risk rating</p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={advisorSearch}
                  onChange={(e) => setAdvisorSearch(e.target.value)}
                  placeholder="Filter advisors…"
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900/70 border border-teal-500/20 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-hidden focus:border-teal-400 transition-colors"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-950/80 text-slate-300 font-semibold border-b border-teal-500/20 text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3.5">Advisor / Caller</th>
                    <th className="py-3 px-3.5 text-center">Audited Calls</th>
                    <th className="py-3 px-3.5 text-center">Avg Rating (0-5)</th>
                    <th className="py-3 px-3.5 text-center">Compliant</th>
                    <th className="py-3 px-3.5 text-center">Violations</th>
                    <th className="py-3 px-3.5 text-center">Compliance Rate</th>
                    <th className="py-3 px-3.5 text-right">Risk Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-teal-500/10 text-slate-300">
                  {filteredAdvisors.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        No advisor audit data found.
                      </td>
                    </tr>
                  ) : (
                    filteredAdvisors.map((adv) => (
                      <tr key={adv.name} className="hover:bg-teal-500/5 transition-colors">
                        <td className="py-3 px-3.5 font-semibold text-white">{adv.name}</td>
                        <td className="py-3 px-3.5 text-center font-mono">{adv.totalCalls}</td>
                        <td className="py-3 px-3.5 text-center font-bold">
                          <span
                            className={`px-2 py-0.5 rounded-full font-mono text-[11px] ${
                              adv.avgScore >= 4.5
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : adv.avgScore >= 3.5
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {adv.avgScore} / 5
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-center font-mono text-emerald-400 font-bold">{adv.passCount}</td>
                        <td className="py-3 px-3.5 text-center font-mono text-rose-400 font-bold">{adv.fatalCount}</td>
                        <td className="py-3 px-3.5 text-center font-mono font-bold text-white">{adv.complianceRate}%</td>
                        <td className="py-3 px-3.5 text-right">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              adv.riskLevel === 'HIGH'
                                ? 'bg-rose-500 text-slate-950 font-black'
                                : adv.riskLevel === 'MEDIUM'
                                ? 'bg-amber-400 text-slate-950 font-black'
                                : 'bg-emerald-500 text-slate-950 font-black'
                            }`}
                          >
                            {adv.riskLevel} RISK
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: HISTORICAL ARCHIVES */}
      {activeTab === 'archives' && (
        <div className="glass-panel p-5 rounded-2xl space-y-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Archive className="w-4 h-4 text-teal-400" />
              <span>Compliance Report Archives</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Permanently sealed and timestamped regulatory audit snapshots
            </p>
          </div>

          {archives.length === 0 ? (
            <div className="py-12 text-center text-slate-400 space-y-2">
              <Archive className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs">No historical report archives currently saved.</p>
              <p className="text-[11px] text-slate-500">
                Generate and archive snapshot packages from the top action bar.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {archives.map((arc) => (
                <div
                  key={arc.id || arc.archive_key}
                  className="p-3.5 rounded-xl border border-teal-500/20 bg-slate-900/50 flex items-center justify-between gap-3 hover:bg-slate-900/80 transition-colors"
                >
                  <div>
                    <h4 className="text-xs font-bold text-white">{arc.label || `Archive #${arc.id}`}</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Period: {arc.period_start || 'Start'} to {arc.period_end || 'End'} | Archived: {arc.archived_at}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono text-teal-300 bg-teal-950 px-2 py-0.5 rounded border border-teal-500/30">
                      {arc.scored_count || arc.call_count || 0} records
                    </span>
                    <a
                      href={`/api/reports/archives/${arc.id}/download`}
                      className="px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 text-xs font-bold flex items-center gap-1 border border-teal-500/30"
                    >
                      <Download className="w-3 h-3 text-teal-400" />
                      <span>Download</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportsView;
