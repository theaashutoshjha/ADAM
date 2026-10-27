import React, { useState, useEffect, useMemo } from 'react';
import {
  Phone,
  FileText,
  ShieldCheck,
  Clock,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  Filter,
  Download,
  Eye,
  MoreVertical,
  Activity,
  ArrowRight,
  Upload,
  Cpu,
  Layers,
  Sparkles,
  Radio,
  UploadCloud,
  CheckCircle2,
  Users,
} from 'lucide-react';
import type { PipelineStats, CallRecord, ScorecardRecord } from '../types';
import type { ActiveTab } from './Sidebar';
import { api } from '../lib/api';

interface DashboardViewProps {
  stats: PipelineStats | null;
  scorecards?: ScorecardRecord[];
  onNavigate: (tab: ActiveTab) => void;
  onStartPipeline: () => void;
  isLoading: boolean;
  dateRange?: string;
  onDateRangeChange?: (range: string) => void;
}

import { AnimatedNetworkGlobe } from './AnimatedNetworkGlobe';
import { AnimatedCounter } from './AnimatedCounter';
import { TiltCard } from './TiltCard';
import { ComplianceRadarChart } from './ComplianceRadarChart';

// Circular Gauge Ring Component
interface CircleGaugeProps {
  percent: number;
  size?: number;
  strokeWidth?: number;
  colorClass?: string;
  glowColor?: string;
}

const CircleGauge: React.FC<CircleGaugeProps> = ({
  percent,
  size = 56,
  strokeWidth = 4.5,
  colorClass = 'stroke-cyan-400',
  glowColor = 'rgba(0,240,255,0.4)',
}) => {
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="stroke-[#131d3b]"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={`${colorClass} transition-all duration-700 ease-out`}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          fill="none"
          style={{ filter: `drop-shadow(0 0 6px ${glowColor})` }}
        />
      </svg>
      <span className="absolute font-extrabold text-[12px] text-white tracking-tight">
        {percent}%
      </span>
    </div>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  scorecards = [],
  onNavigate,
  onStartPipeline,
  isLoading,
}) => {
  const [selectedFilter, setSelectedFilter] = useState<'All' | 'Pre-Order' | 'Regular' | 'Scrap'>('All');
  const [tableSearch, setTableSearch] = useState('');
  const [complianceDropdown, setComplianceDropdown] = useState('Pre-Order Calls');
  const [callTypeDropdown, setCallTypeDropdown] = useState('All Calls');
  const [volumeDropdown, setVolumeDropdown] = useState('Last 7 Days');
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([]);

  // Fetch real calls from database
  useEffect(() => {
    let isMounted = true;
    api
      .getCalls(10)
      .then((data) => {
        if (isMounted && Array.isArray(data)) setRecentCalls(data);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [stats]);

  // NO FAKE DATA: Strictly derive metrics from real database state
  const totalCalls = stats?.calls ?? 0;
  const preOrders = stats?.pre_orders_count ?? 0;
  const auditedCount = stats?.scored ?? scorecards.length;
  const processingCount = Math.max(0, (stats?.transcribed ?? 0) - auditedCount);
  const failedCount = stats?.failed ?? scorecards.filter((s) => s.is_fatal || s.score === 0).length;

  const todayProgress = totalCalls > 0 ? Math.round((auditedCount / totalCalls) * 100) : 0;
  const estimatedTimeMinutes = processingCount > 0 ? processingCount * 2 : 0;

  // Real Q1-Q5 percentages computed dynamically from actual scorecards
  const q1Pct = useMemo(() => {
    if (auditedCount === 0) return 0;
    const failed = stats?.q1_failed_count ?? scorecards.filter((s) => s.q1_status === 'FAIL').length;
    return Math.max(0, Math.round(((auditedCount - failed) / auditedCount) * 100));
  }, [auditedCount, stats?.q1_failed_count, scorecards]);

  const q2Pct = useMemo(() => {
    if (auditedCount === 0) return 0;
    const failed = stats?.q2_failed_count ?? scorecards.filter((s) => s.q2_status === 'FAIL').length;
    return Math.max(0, Math.round(((auditedCount - failed) / auditedCount) * 100));
  }, [auditedCount, stats?.q2_failed_count, scorecards]);

  const q3Pct = useMemo(() => {
    if (auditedCount === 0) return 0;
    const failed = stats?.q3_failed_count ?? scorecards.filter((s) => s.q3_status === 'FAIL').length;
    return Math.max(0, Math.round(((auditedCount - failed) / auditedCount) * 100));
  }, [auditedCount, stats?.q3_failed_count, scorecards]);

  const q4Pct = useMemo(() => {
    if (auditedCount === 0) return 0;
    const failed = scorecards.filter((s) => s.q4_status === 'FAIL').length;
    return Math.max(0, Math.round(((auditedCount - failed) / auditedCount) * 100));
  }, [auditedCount, scorecards]);

  const q5Pct = useMemo(() => {
    if (auditedCount === 0) return 0;
    const failed = stats?.q5_failed_count ?? scorecards.filter((s) => s.q5_status === 'FAIL').length;
    return Math.max(0, Math.round(((auditedCount - failed) / auditedCount) * 100));
  }, [auditedCount, stats?.q5_failed_count, scorecards]);

  // Real Call Type Distribution
  const regularCount = stats?.regular_count ?? 0;
  const scrapCount = stats?.scrap_count ?? 0;
  const preOrderPct = totalCalls > 0 ? Math.round((preOrders / totalCalls) * 100) : 0;
  const regularPct = totalCalls > 0 ? Math.round((regularCount / totalCalls) * 100) : 0;
  const scrapPct = totalCalls > 0 ? Math.max(0, 100 - preOrderPct - regularPct) : 0;

  // Real Daily Call Volume from backend stats
  const volumeDays = useMemo(() => {
    if (stats?.daily_volume && stats.daily_volume.length > 0) {
      return stats.daily_volume.slice(-7);
    }
    // Generate empty 7 days baseline
    const dates: { day: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const str = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      dates.push({ day: str, count: 0 });
    }
    return dates;
  }, [stats?.daily_volume]);

  // Real Top 5 Advisors derived dynamically from scorecards
  const topAdvisors = useMemo(() => {
    if (scorecards.length === 0) return [];
    const map: Record<string, { calls: number; totalScore: number }> = {};
    for (const sc of scorecards) {
      const name = sc.caller_name || sc.dealer || 'Unknown Advisor';
      if (!map[name]) map[name] = { calls: 0, totalScore: 0 };
      map[name].calls += 1;
      map[name].totalScore += sc.score;
    }
    const list = Object.entries(map).map(([name, val]) => {
      const compliance = val.calls > 0 ? Math.round(((val.totalScore / (val.calls * 5)) * 100)) : 0;
      const initials = name
        .split(' ')
        .map((p) => p[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'AD';
      return {
        initials,
        name,
        calls: val.calls,
        compliance,
        color: compliance >= 90 ? 'bg-blue-600' : 'bg-purple-600',
      };
    });
    list.sort((a, b) => b.calls - a.calls);
    return list.slice(0, 5);
  }, [scorecards]);

  // Map real calls & scorecards into table rows
  const displayRows = useMemo(() => {
    if (scorecards.length > 0) {
      return scorecards.map((sc) => ({
        id: `CL-${sc.call_id || sc.id}`,
        date: sc.call_date || sc.created_at?.slice(0, 16) || '—',
        clientCode: sc.client_code || sc.client || '—',
        phone: sc.trade_phone || sc.calling_number || '—',
        advisor: sc.caller_name || sc.dealer || '—',
        stock: sc.symbol || 'EQUITY',
        type: 'Pre-Order',
        score: `${sc.score}/5`,
        q1: sc.q1_status === 'PASS',
        q2: sc.q2_status === 'PASS',
        q3: sc.q3_status === 'PASS' ? true : sc.q3_status === 'REVIEW' ? 'warning' : false,
        q4: sc.q4_status === 'PASS',
        q5: sc.q5_status === 'PASS',
        status: sc.score >= 4 ? 'Pass' : sc.is_fatal ? 'Review' : 'Review',
      }));
    }

    if (recentCalls.length > 0) {
      return recentCalls.map((c) => ({
        id: `CL-${c.id}`,
        date: c.call_date || c.created_at?.slice(0, 16) || '—',
        clientCode: c.client_code || '—',
        phone: c.customer_number || c.caller_name || '—',
        advisor: c.dealer || c.caller_name || '—',
        stock: '—',
        type: c.call_type === 'pre_order' ? 'Pre-Order' : c.call_type === 'scrap' ? 'Scrap' : 'Regular',
        score: '—',
        q1: true,
        q2: true,
        q3: true,
        q4: true,
        q5: true,
        status: 'Review',
      }));
    }

    return [];
  }, [scorecards, recentCalls]);

  const filteredRows = displayRows.filter((r) => {
    if (selectedFilter !== 'All' && r.type !== selectedFilter) return false;
    if (tableSearch) {
      const q = tableSearch.toLowerCase();
      return (
        r.id.toLowerCase().includes(q) ||
        r.clientCode.toLowerCase().includes(q) ||
        r.advisor.toLowerCase().includes(q) ||
        r.stock.toLowerCase().includes(q) ||
        r.phone.includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-3 sm:p-5 space-y-4 max-w-[1600px] w-full mx-auto text-gray-200">
      {/* 1. TOP HERO BANNER: 100% replica with real dynamic progress */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#07122b] via-[#09183d] to-[#07122b] border border-cyan-500/30 shadow-[0_0_35px_rgba(0,180,255,0.15)] p-4 sm:p-6 flex flex-col xl:flex-row items-center justify-between gap-4 border-beam-container">
        {/* Ambient Top Glow Line */}
        <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80" />

        {/* Left Branding Block */}
        <div className="flex items-center gap-3 sm:gap-4 z-10 w-full xl:w-auto">
          {/* Hexagonal Shield Logo */}
          <div className="relative w-14 sm:w-16 h-14 sm:h-16 shrink-0 flex items-center justify-center">
            <div className="absolute inset-0 bg-blue-500/25 blur-lg rounded-full" />
            <svg viewBox="0 0 64 64" className="w-14 sm:w-16 h-14 sm:h-16 drop-shadow-[0_0_12px_rgba(0,240,255,0.5)]">
              <polygon
                points="32,4 58,19 58,45 32,60 6,45 6,19"
                fill="#0b1736"
                stroke="#00f0ff"
                strokeWidth="2.2"
              />
              <polygon
                points="32,8 54,21 54,43 32,56 10,43 10,21"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="0.8"
                strokeOpacity="0.4"
              />
              <path
                d="M32 17 L44 45 L38 45 L34 36 L30 36 L26 45 L20 45 Z"
                fill="none"
                stroke="#00f0ff"
                strokeWidth="2.2"
                strokeLinejoin="round"
              />
              <circle cx="32" cy="27" r="2.5" fill="#a855f7" />
            </svg>
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-wide flex items-center gap-2">
              <span>ADAM-AR</span>
            </h1>
            <p className="text-xs font-semibold text-cyan-300 mt-0.5">
              AI-Powered Pre-Order Call Audit Platform
            </p>
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-400 mt-1 font-medium">
              <span>Real-time ingestion</span>
              <span className="text-cyan-400 font-bold">•</span>
              <span>Deepgram Nova 3 transcription</span>
              <span className="text-cyan-400 font-bold">•</span>
              <span>Trade matching</span>
              <span className="text-cyan-400 font-bold">•</span>
              <span>Compliance audit</span>
              <span className="text-cyan-400 font-bold">•</span>
              <span>Actionable insights</span>
            </div>
          </div>
        </div>

        {/* Center: 3D Holographic Animated Network Globe */}
        <div className="hidden lg:flex items-center justify-center">
          <AnimatedNetworkGlobe size={210} />
        </div>

        {/* Center Right Tagline */}
        <div className="hidden 2xl:flex flex-col items-center justify-center text-center">
          <span className="text-xs italic text-gray-300 font-medium tracking-wide">
            " Turning Every Call
          </span>
          <span className="text-xs italic text-cyan-300 font-semibold tracking-wide">
            Into Compliance Confidence "
          </span>
        </div>

        {/* Right Stats Widget in Banner (Real metrics) */}
        <div className="z-10 rounded-xl bg-[#091430]/90 border border-cyan-500/25 p-3 px-4 sm:px-5 flex items-center gap-4 sm:gap-5 shadow-inner w-full xl:w-auto justify-between xl:justify-start">
          {/* Circular Progress Gauge */}
          <div className="flex items-center gap-3">
            <CircleGauge percent={todayProgress} size={54} colorClass="stroke-cyan-400" />
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-gray-200 leading-tight">Today's Progress</span>
              <span className="text-[10px] font-mono text-gray-400 mt-0.5">
                {auditedCount} / {totalCalls} audited
              </span>
            </div>
          </div>

          <div className="h-9 w-[1px] bg-cyan-500/20" />

          {/* Estimated Time */}
          <div className="flex flex-col">
            <span className="text-[10px] text-gray-400 font-medium">Estimated Time</span>
            <span className="text-lg font-black text-white leading-tight">
              {estimatedTimeMinutes} min
            </span>
            <span className="text-[10px] font-mono text-gray-400">
              {processingCount} calls remaining
            </span>
          </div>
        </div>
      </div>

      {/* 2. FIVE KPI METRIC CARDS: Pure Real Data */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Card 1: Total Calls */}
        <TiltCard className="rounded-2xl bg-gradient-to-b from-[#0c1836] to-[#081026] border border-cyan-500/25 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-cyan-400/50 transition-all card-3d shimmer-sweep-hover">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.3)]">
              <Phone size={18} />
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1.5 shadow-sm">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                </span>
                {totalCalls > 0 ? 'Live Feed' : 'Idle'}
              </span>
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-white tracking-tight">
              <AnimatedCounter value={totalCalls} />
            </div>
            <div className="text-xs text-gray-400 font-medium">Total Calls</div>
          </div>
          {/* Animated Equalizer Wave Sparkline */}
          <div className="mt-2.5 flex items-end gap-1 h-5 pt-1">
            {[1, 2, 3, 4, 2, 1, 3, 4, 2, 3, 1, 4].map((animIdx, i) => (
              <div
                key={i}
                className={`w-1 rounded-full transition-all ${
                  totalCalls > 0
                    ? `bg-gradient-to-t from-cyan-600 to-cyan-400 soundwave-bar-${animIdx}`
                    : 'bg-cyan-950/40 h-1'
                }`}
              />
            ))}
          </div>
        </TiltCard>

        {/* Card 2: Pre-Order Calls */}
        <TiltCard className="rounded-2xl bg-gradient-to-b from-[#0c1836] to-[#081026] border border-blue-500/25 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-blue-400/50 transition-all card-3d shimmer-sweep-hover">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.3)]">
              <FileText size={18} />
            </div>
            <CircleGauge percent={preOrderPct} size={44} strokeWidth={4} colorClass="stroke-blue-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-white tracking-tight">
              <AnimatedCounter value={preOrders} />
            </div>
            <div className="text-xs text-gray-400 font-medium">Pre-Order Calls</div>
            <div className="text-[10px] text-gray-400 font-semibold mt-0.5">
              {totalCalls > 0 ? `${preOrderPct}% of total calls` : '0%'}
            </div>
          </div>
        </TiltCard>

        {/* Card 3: Audited */}
        <TiltCard className="rounded-2xl bg-gradient-to-b from-[#0c1836] to-[#081026] border border-emerald-500/25 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-emerald-400/50 transition-all card-3d shimmer-sweep-hover">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
              <ShieldCheck size={18} />
            </div>
            <CircleGauge percent={todayProgress} size={44} strokeWidth={4} colorClass="stroke-emerald-400" glowColor="rgba(16,185,129,0.4)" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-white tracking-tight">
              <AnimatedCounter value={auditedCount} />
            </div>
            <div className="text-xs text-gray-400 font-medium">Audited</div>
            <div className="text-[10px] text-emerald-400 font-semibold mt-0.5">
              {auditedCount > 0 ? `${todayProgress}% audited` : 'Awaiting runs'}
            </div>
          </div>
        </TiltCard>

        {/* Card 4: Processing */}
        <TiltCard className="rounded-2xl bg-gradient-to-b from-[#0c1836] to-[#081026] border border-amber-500/25 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-amber-400/50 transition-all card-3d shimmer-sweep-hover">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.3)]">
              <Clock size={18} />
            </div>
            <CircleGauge
              percent={totalCalls > 0 ? Math.round((processingCount / totalCalls) * 100) : 0}
              size={44}
              strokeWidth={4}
              colorClass="stroke-amber-400"
              glowColor="rgba(245,158,11,0.4)"
            />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-white tracking-tight">
              <AnimatedCounter value={processingCount} />
            </div>
            <div className="text-xs text-gray-400 font-medium">Processing</div>
            <div className="text-[10px] text-gray-400 mt-0.5">
              {processingCount > 0 ? `Est. ${processingCount * 2} min` : 'Queue clear'}
            </div>
          </div>
        </TiltCard>

        {/* Card 5: Failed */}
        <TiltCard className="rounded-2xl bg-gradient-to-b from-[#0c1836] to-[#081026] border border-rose-500/25 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-rose-400/50 transition-all card-3d shimmer-sweep-hover">
          <div className="flex items-start justify-between">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-400/30 flex items-center justify-center text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]">
              <AlertTriangle size={18} />
            </div>
            <CircleGauge
              percent={totalCalls > 0 ? Math.round((failedCount / totalCalls) * 100) : 0}
              size={44}
              strokeWidth={4}
              colorClass="stroke-rose-400"
              glowColor="rgba(244,63,94,0.4)"
            />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-white tracking-tight">
              <AnimatedCounter value={failedCount} />
            </div>
            <div className="text-xs text-gray-400 font-medium">Failed</div>
            <button
              onClick={() => onNavigate('calls')}
              className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold mt-0.5 flex items-center gap-1 cursor-pointer"
            >
              <span>View errors</span>
              <ChevronRight size={11} />
            </button>
          </div>
        </TiltCard>
      </div>

      {/* 3. MAIN DASHBOARD CONTENT: 2-COLUMN RESPONSIVE LAYOUT */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* ===================== LEFT / CENTER SECTION (8 of 12 COLS) ===================== */}
        <div className="xl:col-span-8 space-y-4">
          {/* ROW 1: Audit Compliance (Q1 - Q5) & Call Type Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Card: Audit Compliance (Q1 - Q5) - 7 cols */}
            <div className="md:col-span-7 rounded-2xl bg-[#091126]/90 border border-cyan-500/25 p-4 sm:p-4.5 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <h2 className="text-xs font-bold text-white tracking-wide">
                  Audit Compliance (Q1 – Q5)
                </h2>
                <div className="px-2.5 py-1 rounded-lg bg-[#0e1939] border border-[#1d2b52] text-[10px] font-semibold text-gray-300 flex items-center gap-1.5 cursor-pointer">
                  <span>{complianceDropdown}</span>
                  <ChevronDown size={11} className="text-gray-400" />
                </div>
              </div>

              {/* 5 Circular Meter Rings matching screenshot (Real percentages) */}
              <div className="grid grid-cols-5 gap-2 pt-4 pb-2 text-center">
                {/* Q1 */}
                <div className="flex flex-col items-center">
                  <CircleGauge percent={q1Pct} size={50} colorClass="stroke-cyan-400" />
                  <span className="text-[11px] font-bold text-white mt-2">Q1</span>
                  <span className="text-[9px] text-gray-400 leading-tight">Calling Number Match</span>
                  <span className="text-[9px] font-mono text-gray-500 mt-1">
                    {auditedCount > 0 ? `${Math.round((q1Pct * auditedCount) / 100)} / ${auditedCount}` : '0 / 0'}
                  </span>
                </div>

                {/* Q2 */}
                <div className="flex flex-col items-center">
                  <CircleGauge percent={q2Pct} size={50} colorClass="stroke-blue-400" />
                  <span className="text-[11px] font-bold text-white mt-2">Q2</span>
                  <span className="text-[9px] text-gray-400 leading-tight">Client Code Confirmation</span>
                  <span className="text-[9px] font-mono text-gray-500 mt-1">
                    {auditedCount > 0 ? `${Math.round((q2Pct * auditedCount) / 100)} / ${auditedCount}` : '0 / 0'}
                  </span>
                </div>

                {/* Q3 */}
                <div className="flex flex-col items-center">
                  <CircleGauge percent={q3Pct} size={50} colorClass="stroke-purple-400" />
                  <span className="text-[11px] font-bold text-white mt-2">Q3</span>
                  <span className="text-[9px] text-gray-400 leading-tight">Stock / Price / Qty</span>
                  <span className="text-[9px] font-mono text-gray-500 mt-1">
                    {auditedCount > 0 ? `${Math.round((q3Pct * auditedCount) / 100)} / ${auditedCount}` : '0 / 0'}
                  </span>
                </div>

                {/* Q4 */}
                <div className="flex flex-col items-center">
                  <CircleGauge percent={q4Pct} size={50} colorClass="stroke-emerald-400" />
                  <span className="text-[11px] font-bold text-white mt-2">Q4</span>
                  <span className="text-[9px] text-gray-400 leading-tight">Acknowledgement</span>
                  <span className="text-[9px] font-mono text-gray-500 mt-1">
                    {auditedCount > 0 ? `${Math.round((q4Pct * auditedCount) / 100)} / ${auditedCount}` : '0 / 0'}
                  </span>
                </div>

                {/* Q5 */}
                <div className="flex flex-col items-center">
                  <CircleGauge percent={q5Pct} size={50} colorClass="stroke-amber-400" />
                  <span className="text-[11px] font-bold text-white mt-2">Q5</span>
                  <span className="text-[9px] text-gray-400 leading-tight">No Return Commitment</span>
                  <span className="text-[9px] font-mono text-gray-500 mt-1">
                    {auditedCount > 0 ? `${Math.round((q5Pct * auditedCount) / 100)} / ${auditedCount}` : '0 / 0'}
                  </span>
                </div>
              </div>
            </div>

            {/* Card: Call Type Distribution - 5 cols */}
            <div className="md:col-span-5 rounded-2xl bg-[#091126]/90 border border-cyan-500/25 p-4 sm:p-4.5 shadow-xl flex flex-col justify-between">
              <div className="flex items-center justify-between pb-2 border-b border-white/5">
                <h2 className="text-xs font-bold text-white tracking-wide">
                  Call Type Distribution
                </h2>
                <div className="px-2 py-0.5 rounded-lg bg-[#0e1939] border border-[#1d2b52] text-[10px] font-semibold text-gray-300 flex items-center gap-1 cursor-pointer">
                  <span>{callTypeDropdown}</span>
                  <ChevronDown size={11} className="text-gray-400" />
                </div>
              </div>

              {/* Donut Chart & Legend Row */}
              <div className="flex items-center justify-around py-3">
                {/* Donut Chart with real center count */}
                <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="#0e1733" strokeWidth="11" />
                    {totalCalls > 0 && (
                      <>
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="none"
                          stroke="#00f0ff"
                          strokeWidth="11"
                          strokeDasharray={`${(preOrderPct / 100) * 238} 238`}
                          strokeLinecap="round"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="38"
                          fill="none"
                          stroke="#10b981"
                          strokeWidth="11"
                          strokeDasharray={`${(regularPct / 100) * 238} 238`}
                          strokeDashoffset={`-${(preOrderPct / 100) * 238}`}
                          strokeLinecap="round"
                        />
                      </>
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-lg font-black text-white leading-tight">{totalCalls}</span>
                    <span className="text-[9px] text-gray-400 font-medium">Total Calls</span>
                  </div>
                </div>

                {/* Legend with real numbers */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 shadow-[0_0_6px_#00f0ff]"></span>
                    <span className="text-gray-300 font-medium">Pre-Order</span>
                    <span className="font-bold text-white ml-auto">{preOrders}</span>
                    <span className="text-[10px] text-gray-500">({preOrderPct}%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 shadow-[0_0_6px_#10b981]"></span>
                    <span className="text-gray-300 font-medium">Regular</span>
                    <span className="font-bold text-white ml-auto">{regularCount}</span>
                    <span className="text-[10px] text-gray-500">({regularPct}%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm bg-purple-400 shadow-[0_0_6px_#8b5cf6]"></span>
                    <span className="text-gray-300 font-medium">Scrap</span>
                    <span className="font-bold text-white ml-auto">{scrapCount}</span>
                    <span className="text-[10px] text-gray-500">({scrapPct}%)</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ROW 2: Processing Pipeline (Live) Node Diagram */}
          <div className="rounded-2xl bg-[#091126]/90 border border-cyan-500/25 p-4 sm:p-4.5 shadow-xl">
            <div className="flex items-center gap-2 pb-3 mb-3 border-b border-white/5">
              <h2 className="text-xs font-bold text-white tracking-wide">
                Processing Pipeline
              </h2>
              <span className="text-[10px] font-bold text-emerald-400">(Live)</span>
            </div>

            {/* 5 Connected Pipeline Stages */}
            <div className="flex items-center justify-between gap-1 overflow-x-auto py-1 custom-scrollbar">
              {/* Node 1: Ingestion */}
              <div className="flex-1 min-w-[120px] flex items-center justify-between p-2.5 rounded-xl bg-[#0c1633] border border-cyan-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    <Upload size={14} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white flex items-center gap-1">
                      <span className="text-[9px] px-1 rounded-sm bg-cyan-900/60 text-cyan-300">1</span>
                      <span>Ingestion</span>
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">{totalCalls} / {totalCalls}</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-400">{totalCalls > 0 ? '100%' : '0%'}</span>
              </div>

              <div className="text-cyan-400 px-1 shrink-0 font-bold">➔</div>

              {/* Node 2: Transcription */}
              <div className="flex-1 min-w-[130px] flex items-center justify-between p-2.5 rounded-xl bg-[#0c1633] border border-cyan-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <Activity size={14} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white flex items-center gap-1">
                      <span className="text-[9px] px-1 rounded-sm bg-cyan-900/60 text-cyan-300">2</span>
                      <span>Deepgram Nova 3</span>
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">
                      {stats?.transcribed ?? 0} / {totalCalls}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-400">
                  {totalCalls > 0 ? `${Math.round(((stats?.transcribed ?? 0) / totalCalls) * 100)}%` : '0%'}
                </span>
              </div>

              <div className="text-cyan-400 px-1 shrink-0 font-bold">➔</div>

              {/* Node 3: Trade Matching */}
              <div className="flex-1 min-w-[130px] flex items-center justify-between p-2.5 rounded-xl bg-[#0c1633] border border-cyan-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0">
                    <Layers size={14} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white flex items-center gap-1">
                      <span className="text-[9px] px-1 rounded-sm bg-cyan-900/60 text-cyan-300">3</span>
                      <span>Trade Matching</span>
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">{preOrders} / {totalCalls}</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-cyan-400">{preOrderPct}%</span>
              </div>

              <div className="text-cyan-400 px-1 shrink-0 font-bold">➔</div>

              {/* Node 4: Audit (Q1-Q5) */}
              <div className="flex-1 min-w-[130px] flex items-center justify-between p-2.5 rounded-xl bg-[#0c1633] border border-cyan-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/30 flex items-center justify-center shrink-0">
                    <ShieldCheck size={14} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white flex items-center gap-1">
                      <span className="text-[9px] px-1 rounded-sm bg-cyan-900/60 text-cyan-300">4</span>
                      <span>Audit (Q1–Q5)</span>
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">
                      {auditedCount} / {preOrders || totalCalls}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-amber-400">{todayProgress}%</span>
              </div>

              <div className="text-cyan-400 px-1 shrink-0 font-bold">➔</div>

              {/* Node 5: Scorecards */}
              <div className="flex-1 min-w-[120px] flex items-center justify-between p-2.5 rounded-xl bg-[#0c1633] border border-cyan-500/20">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
                    <FileText size={14} />
                  </div>
                  <div>
                    <div className="text-[11px] font-bold text-white flex items-center gap-1">
                      <span className="text-[9px] px-1 rounded-sm bg-cyan-900/60 text-cyan-300">5</span>
                      <span>Scorecards</span>
                    </div>
                    <div className="text-[10px] font-mono text-gray-400">{auditedCount} / {auditedCount}</div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-400">
                  {auditedCount > 0 ? '100%' : '0%'}
                </span>
              </div>
            </div>
          </div>

          {/* ROW 3: Recent Call Audit Results Table (NO FAKE DATA) */}
          <div className="rounded-2xl bg-[#091126]/90 border border-cyan-500/25 p-4 sm:p-4.5 shadow-xl">
            {/* Table Header & Controls Bar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-white/5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xs font-bold text-white tracking-wide mr-2">
                  Recent Call Audit Results
                </h2>
                {/* Category Filter Pills */}
                <div className="flex items-center gap-1 bg-[#070d1e] p-1 rounded-xl border border-white/5">
                  {(['All', 'Pre-Order', 'Regular', 'Scrap'] as const).map((tab) => {
                    const count =
                      tab === 'All'
                        ? totalCalls
                        : tab === 'Pre-Order'
                        ? preOrders
                        : tab === 'Regular'
                        ? regularCount
                        : scrapCount;
                    const isActive = selectedFilter === tab;
                    return (
                      <button
                        key={tab}
                        onClick={() => setSelectedFilter(tab)}
                        className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {tab} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Search, Filter, Export Buttons */}
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-44">
                  <input
                    type="text"
                    value={tableSearch}
                    onChange={(e) => setTableSearch(e.target.value)}
                    placeholder="Search calls..."
                    className="w-full px-2.5 py-1 bg-[#0c1633] border border-[#1b2b54] rounded-lg text-[11px] text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <button
                  onClick={() => onNavigate('calls')}
                  className="px-2.5 py-1 bg-[#0c1633] hover:bg-[#12204a] border border-[#1b2b54] rounded-lg text-[11px] text-gray-300 flex items-center gap-1 cursor-pointer"
                >
                  <Filter size={11} />
                  <span>Filters</span>
                </button>
                <button
                  onClick={() => onNavigate('exports')}
                  className="px-3 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 cursor-pointer shadow-md"
                >
                  <Download size={11} />
                  <span>Export</span>
                </button>
              </div>
            </div>

            {/* Table or Empty State */}
            {filteredRows.length === 0 ? (
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-cyan-500/20 bg-[#060c1d]/60 mt-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center text-cyan-300 mb-3 shadow-[0_0_20px_rgba(0,240,255,0.2)]">
                  <Radio size={22} className="animate-pulse" />
                </div>
                <h3 className="text-sm font-bold text-white mb-1">No Call Audits Recorded Yet</h3>
                <p className="text-xs text-gray-400 max-w-md mx-auto mb-4">
                  Your pre-order compliance database is clean. Ingest voice recordings or execute the pipeline to display live audit results and scorecard evaluations.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={() => onNavigate('ingestion_hub')}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all cursor-pointer inline-flex items-center gap-2"
                  >
                    <UploadCloud size={14} />
                    <span>Ingest Calls & Audio</span>
                  </button>
                  {onStartPipeline && (
                    <button
                      onClick={onStartPipeline}
                      className="px-4 py-2 bg-[#0c1633] hover:bg-[#12204a] border border-cyan-500/30 text-cyan-300 rounded-xl text-xs font-semibold transition-all cursor-pointer inline-flex items-center gap-2"
                    >
                      <Activity size={14} />
                      <span>Run Pipeline</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto mt-2 custom-scrollbar">
                <table className="w-full text-left text-xs min-w-[850px]">
                  <thead>
                    <tr className="text-[10px] font-bold text-gray-400 border-b border-white/5 uppercase tracking-wider">
                      <th className="py-2.5 px-2">
                        <input type="checkbox" className="rounded bg-black/40 border-white/20" />
                      </th>
                      <th className="py-2.5 px-2">Call ID</th>
                      <th className="py-2.5 px-2">Date & Time</th>
                      <th className="py-2.5 px-2">Client Code</th>
                      <th className="py-2.5 px-2">Customer Number</th>
                      <th className="py-2.5 px-2">Advisor</th>
                      <th className="py-2.5 px-2">Stock</th>
                      <th className="py-2.5 px-2">Call Type</th>
                      <th className="py-2.5 px-2">Score</th>
                      <th className="py-2.5 px-1.5 text-center">Q1</th>
                      <th className="py-2.5 px-1.5 text-center">Q2</th>
                      <th className="py-2.5 px-1.5 text-center">Q3</th>
                      <th className="py-2.5 px-1.5 text-center">Q4</th>
                      <th className="py-2.5 px-1.5 text-center">Q5</th>
                      <th className="py-2.5 px-2">Status</th>
                      <th className="py-2.5 px-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-[11px]">
                    {filteredRows.map((row) => (
                      <tr key={row.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-2.5 px-2">
                          <input type="checkbox" className="rounded bg-black/40 border-white/20" />
                        </td>
                        <td className="py-2.5 px-2 font-bold text-white font-mono">{row.id}</td>
                        <td className="py-2.5 px-2 text-gray-400 font-mono text-[10px]">{row.date}</td>
                        <td className="py-2.5 px-2 font-mono text-cyan-300 font-semibold">{row.clientCode}</td>
                        <td className="py-2.5 px-2 font-mono text-gray-300">{row.phone}</td>
                        <td className="py-2.5 px-2 text-white font-medium">{row.advisor}</td>
                        <td className="py-2.5 px-2 font-bold text-gray-200">{row.stock}</td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              row.type === 'Pre-Order'
                                ? 'bg-blue-900/60 text-blue-300 border border-blue-500/40'
                                : row.type === 'Regular'
                                ? 'bg-slate-800 text-slate-300 border border-slate-600/40'
                                : 'bg-rose-950/60 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            {row.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 font-black text-white">{row.score}</td>
                        {/* Q1-Q5 Indicators */}
                        {[row.q1, row.q2, row.q3, row.q4, row.q5].map((qVal, idx) => (
                          <td key={idx} className="py-2.5 px-1.5 text-center">
                            {qVal === true ? (
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 font-bold text-[10px]">
                                ✓
                              </span>
                            ) : qVal === false ? (
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 font-bold text-[10px]">
                                ✕
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 font-bold text-[10px]">
                                !
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="py-2.5 px-2">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-max ${
                              row.status === 'Pass'
                                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40'
                                : 'bg-amber-950/70 text-amber-300 border border-amber-500/40'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                row.status === 'Pass' ? 'bg-emerald-400' : 'bg-amber-400'
                              }`}
                            />
                            <span>{row.status}</span>
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1.5 text-gray-400">
                            <button
                              onClick={() => onNavigate('calls')}
                              className="p-1 hover:text-white rounded hover:bg-white/5 cursor-pointer"
                              title="View Transcript"
                            >
                              <Eye size={13} />
                            </button>
                            <button
                              className="p-1 hover:text-white rounded hover:bg-white/5 cursor-pointer"
                              title="Options"
                            >
                              <MoreVertical size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ===================== RIGHT SECTION (4 of 12 COLS) ===================== */}
        <div className="xl:col-span-4 space-y-4">
          {/* Card: 5-Point Compliance Spider Radar Chart */}
          <TiltCard className="rounded-2xl bg-[#091126]/90 border border-cyan-500/25 p-4 sm:p-4.5 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-1">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} className="text-cyan-400" />
                <h2 className="text-xs font-bold text-white tracking-wide">
                  SEBI Regulatory Compliance Radar
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-[9px] font-mono text-cyan-300 font-bold">
                Q1–Q5
              </span>
            </div>
            <ComplianceRadarChart
              scores={{ q1: q1Pct, q2: q2Pct, q3: q3Pct, q4: q4Pct, q5: q5Pct }}
              size={290}
            />
          </TiltCard>

          {/* Card 1: Daily Call Volume */}
          <div className="rounded-2xl bg-[#091126]/90 border border-cyan-500/25 p-4 sm:p-4.5 shadow-xl flex flex-col justify-between">
            <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-3">
              <h2 className="text-xs font-bold text-white tracking-wide">
                Daily Call Volume
              </h2>
              <div className="px-2 py-0.5 rounded-lg bg-[#0e1939] border border-[#1d2b52] text-[10px] font-semibold text-gray-300 flex items-center gap-1 cursor-pointer">
                <span>{volumeDropdown}</span>
                <ChevronDown size={11} className="text-gray-400" />
              </div>
            </div>

            {/* Neon Vertical Bar Chart */}
            <div className="relative pt-4 pb-2">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[9px] font-mono text-gray-600 pl-1">
                <div className="border-b border-white/[0.04] pb-0.5">100+</div>
                <div className="border-b border-white/[0.04] pb-0.5">75</div>
                <div className="border-b border-white/[0.04] pb-0.5">50</div>
                <div className="border-b border-white/[0.04] pb-0.5">25</div>
                <div>0</div>
              </div>

              {/* Vertical Bars */}
              <div className="flex items-end justify-between gap-2 h-44 pl-7 pr-2 relative z-10">
                {volumeDays.map((item) => {
                  const maxH = 150;
                  const maxCount = Math.max(...volumeDays.map((d) => d.count), 1);
                  const barH = Math.max(4, (item.count / maxCount) * maxH);
                  const isPeak = item.count > 0 && item.count === maxCount;
                  return (
                    <div key={item.day} className="flex-1 flex flex-col items-center group">
                      <span className="text-[10px] font-mono font-bold text-white mb-1.5 opacity-90 group-hover:opacity-100">
                        {item.count}
                      </span>
                      <div
                        className={`w-full rounded-t-md transition-all duration-300 relative ${
                          item.count > 0
                            ? isPeak
                              ? 'bg-gradient-to-t from-blue-600 via-cyan-400 to-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.5)]'
                              : 'bg-gradient-to-t from-indigo-700 via-blue-500 to-cyan-400 opacity-80 group-hover:opacity-100'
                            : 'bg-cyan-950/30'
                        }`}
                        style={{ height: `${barH}px` }}
                      >
                        {item.count > 0 && (
                          <div className="absolute top-0 left-0 right-0 h-1 bg-white/40 rounded-t-md" />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-gray-400 mt-2 truncate w-full text-center">
                        {item.day}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Card 2: Live Activity Feed */}
          <div className="rounded-2xl bg-[#091126]/90 border border-cyan-500/25 p-4 sm:p-4.5 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-3">
              <h2 className="text-xs font-bold text-white tracking-wide">
                Live Activity
              </h2>
              <button
                onClick={() => onNavigate('pipeline')}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer flex items-center gap-0.5"
              >
                <span>View All</span>
                <ChevronRight size={11} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {scorecards.length > 0 ? (
                scorecards.slice(0, 4).map((sc, i) => (
                  <div key={sc.id || i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981] animate-pulse shrink-0" />
                      <span className="font-mono text-gray-400 text-[10px]">
                        {sc.created_at?.slice(11, 16) || 'Live'}
                      </span>
                      <span className="font-bold text-white text-[11px]">CL-{sc.call_id}</span>
                      <span className="text-gray-400 text-[11px] truncate max-w-[130px]">
                        - {sc.is_fatal ? 'Fatal review' : 'Audit passed'}
                      </span>
                    </div>
                    <span className="font-mono text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/30">
                      {sc.score}/5
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-5 text-gray-500 font-mono text-xs">
                  Awaiting live pipeline activity.
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Advisor Performance (Top 5) (Real Data) */}
          <div className="rounded-2xl bg-[#091126]/90 border border-cyan-500/25 p-4 sm:p-4.5 shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-3">
              <h2 className="text-xs font-bold text-white tracking-wide">
                Advisor Performance (Top 5)
              </h2>
              <button
                onClick={() => onNavigate('advisors')}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer flex items-center gap-0.5"
              >
                <span>View All</span>
                <ChevronRight size={11} />
              </button>
            </div>

            {/* Table */}
            {topAdvisors.length === 0 ? (
              <div className="text-center py-6 text-gray-500 font-mono text-xs">
                No advisor scorecards scored yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider pb-1">
                  <span>Advisor</span>
                  <div className="flex items-center gap-6">
                    <span>Total Calls</span>
                    <span className="w-24 text-right">Compliance</span>
                  </div>
                </div>

                {topAdvisors.map((adv) => (
                  <div key={adv.name} className="flex items-center justify-between text-xs py-0.5">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-full ${adv.color} text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-sm`}
                      >
                        {adv.initials}
                      </div>
                      <span className="font-medium text-white text-[11px] truncate max-w-[120px]">
                        {adv.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-6">
                      <span className="font-mono text-gray-300 text-[11px]">{adv.calls}</span>
                      <div className="flex items-center gap-2 w-24 justify-end">
                        <span className="font-bold text-emerald-400 font-mono text-[11px]">
                          {adv.compliance}%
                        </span>
                        <div className="w-12 h-1.5 bg-[#0e1939] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full"
                            style={{ width: `${adv.compliance}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
