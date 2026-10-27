import React, { useState, useMemo } from 'react';
import {
  Users,
  Award,
  ShieldAlert,
  ShieldCheck,
  Search,
  Filter,
  Play,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Activity,
  ArrowUpDown,
  X,
  Phone,
  FileSpreadsheet,
  ChevronRight,
  ExternalLink,
  RotateCcw,
} from 'lucide-react';
import type { ScorecardRecord, CallRecord } from '../types';
import { useAudioPlayer } from './GlobalAudioPlayer';
import { cleanCallerName } from '../lib/clientCode';

interface AdvisorPerformanceViewProps {
  scorecards: ScorecardRecord[];
  calls?: CallRecord[];
  advisors?: string[];
  onSelectCall?: (callId: number) => void;
  onNavigateToScorecards?: (advisorName: string) => void;
  isLoading?: boolean;
  dateRange?: string;
}

interface AdvisorStat {
  name: string;
  totalCalls: number;
  passCount: number;
  fatalCount: number;
  reviewCount: number;
  avgScore: number;
  complianceRate: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  q1Pass: number;
  q2Pass: number;
  q3Pass: number;
  q4Pass: number;
  q5Pass: number;
  scorecards: ScorecardRecord[];
}

export const AdvisorPerformanceView: React.FC<AdvisorPerformanceViewProps> = ({
  scorecards = [],
  calls = [],
  advisors = [],
  onSelectCall,
  onNavigateToScorecards,
  isLoading = false,
  dateRange,
}) => {
  const { playCall, isPlaying, activeCall } = useAudioPlayer();

  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<'ALL' | 'LOW' | 'MEDIUM' | 'HIGH'>('ALL');
  const [sortField, setSortField] = useState<'totalCalls' | 'complianceRate' | 'avgScore' | 'fatalCount' | 'name'>('totalCalls');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedAdvisorName, setSelectedAdvisorName] = useState<string | null>(null);

  // Safe scorecards collection
  const safeScorecards = useMemo(
    () => (Array.isArray(scorecards) ? scorecards.filter((s): s is ScorecardRecord => Boolean(s && typeof s === 'object')) : []),
    [scorecards]
  );

  // Group and calculate stats per advisor
  const advisorStats = useMemo(() => {
    const map = new Map<string, {
      total: number;
      pass: number;
      fatal: number;
      review: number;
      scores: number[];
      q1: number;
      q2: number;
      q3: number;
      q4: number;
      q5: number;
      items: ScorecardRecord[];
    }>();

    for (const sc of safeScorecards) {
      const rawName = sc.caller_name || (sc as any).advisor_name || sc.dealer || 'Unassigned';
      const cleanName = cleanCallerName(rawName) || 'Unassigned';

      if (!map.has(cleanName)) {
        map.set(cleanName, {
          total: 0,
          pass: 0,
          fatal: 0,
          review: 0,
          scores: [],
          q1: 0,
          q2: 0,
          q3: 0,
          q4: 0,
          q5: 0,
          items: [],
        });
      }

      const entry = map.get(cleanName)!;
      entry.total++;
      entry.items.push(sc);
      entry.scores.push(sc.score ?? 5);

      if (sc.is_fatal || sc.score === 0) {
        entry.fatal++;
      } else if (sc.score >= 4) {
        entry.pass++;
      } else {
        entry.review++;
      }

      if (sc.q1_status === 'PASS') entry.q1++;
      if (sc.q2_status === 'PASS') entry.q2++;
      if (sc.q3_status === 'PASS') entry.q3++;
      if ((sc.q4_status || 'PASS') === 'PASS') entry.q4++;
      if (sc.q5_status === 'PASS') entry.q5++;
    }

    const results: AdvisorStat[] = [];
    for (const [name, d] of map.entries()) {
      const avgScore = d.scores.length > 0
        ? parseFloat((d.scores.reduce((a, b) => a + b, 0) / d.scores.length).toFixed(1))
        : 0;
      const complianceRate = d.total > 0 ? Math.round((d.pass / d.total) * 100) : 0;

      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (d.fatal > 0 || complianceRate < 60) {
        riskLevel = 'HIGH';
      } else if (complianceRate < 80) {
        riskLevel = 'MEDIUM';
      }

      results.push({
        name,
        totalCalls: d.total,
        passCount: d.pass,
        fatalCount: d.fatal,
        reviewCount: d.review,
        avgScore,
        complianceRate,
        riskLevel,
        q1Pass: d.q1,
        q2Pass: d.q2,
        q3Pass: d.q3,
        q4Pass: d.q4,
        q5Pass: d.q5,
        scorecards: d.items,
      });
    }

    return results;
  }, [safeScorecards]);

  // Overall aggregate stats
  const overallMetrics = useMemo(() => {
    const totalAdvisors = advisorStats.length;
    const totalCalls = safeScorecards.length;
    const fatalTotal = safeScorecards.filter((s) => s.is_fatal || s.score === 0).length;
    const cleanPass = safeScorecards.filter((s) => !s.is_fatal && s.score >= 4).length;
    const overallRate = totalCalls > 0 ? Math.round((cleanPass / totalCalls) * 100) : 0;
    const avgScore = totalCalls > 0
      ? (safeScorecards.reduce((acc, s) => acc + (s.score || 0), 0) / totalCalls).toFixed(1)
      : '5.0';
    const highRiskCount = advisorStats.filter((a) => a.riskLevel === 'HIGH').length;

    return {
      totalAdvisors,
      totalCalls,
      fatalTotal,
      cleanPass,
      overallRate,
      avgScore,
      highRiskCount,
    };
  }, [advisorStats, safeScorecards]);

  // Filtered and sorted list
  const filteredAdvisors = useMemo(() => {
    return advisorStats
      .filter((a) => {
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          if (!a.name.toLowerCase().includes(q)) return false;
        }
        if (riskFilter !== 'ALL' && a.riskLevel !== riskFilter) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];
        if (typeof valA === 'string') {
          return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      });
  }, [advisorStats, searchTerm, riskFilter, sortField, sortOrder]);

  const selectedAdvisor = useMemo(() => {
    if (!selectedAdvisorName) return null;
    return advisorStats.find((a) => a.name === selectedAdvisorName) || null;
  }, [advisorStats, selectedAdvisorName]);

  const handlePlayCallAudio = (callId: number) => {
    const call = calls.find((c) => c.id === callId);
    if (call) {
      playCall({
        callId: call.id,
        callerId: call.caller_id || call.customer_number,
        clientCode: call.client_code,
        advisorName: call.advisor_name || (call as any).caller_name,
        date: call.call_date || (call as any).date,
        time: call.call_time || (call as any).time,
        transcript: call.transcript || call.transcript_raw,
      });
    } else {
      playCall({
        callId: callId,
        advisorName: selectedAdvisorName || 'Advisor',
        callerId: '—',
      });
    }
  };

  return (
    <div className="space-y-6 view-enter pb-12">
      {/* Page Header */}
      <div className="glass-panel p-5 rounded-2xl shadow-xl border border-cyan-500/20 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                Dealer &amp; RM Performance Hub
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                SEBI Pre-Order Mandate
              </span>
            </div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
              <Users className="w-6 h-6 text-cyan-400" />
              <span>Advisor Performance &amp; Compliance Scorecard</span>
            </h1>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
              Real-time audit performance metrics, fatal violation detection, question-by-question scoring, and risk ranking across all registered investment advisors and trading desk operators.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-[#0b1329] border border-cyan-500/20 text-cyan-300 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>{overallMetrics.totalAdvisors} Active Advisors</span>
            </span>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="glass-panel p-4 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Total Advisors</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-white">{overallMetrics.totalAdvisors}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{overallMetrics.totalCalls} Audited Calls</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-emerald-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-emerald-400">
            <span>Platform Pass Rate</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-emerald-400">{overallMetrics.overallRate}%</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{overallMetrics.cleanPass} Compliant Sessions</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-cyan-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-cyan-400">
            <span>Average Score</span>
            <Award className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-cyan-300">{overallMetrics.avgScore} <span className="text-xs text-gray-400">/ 5.0</span></div>
            <div className="text-[10px] text-gray-400 mt-0.5">5-Point SEBI Rubric</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-rose-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-rose-400">
            <span>Fatal Violations</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-rose-400">{overallMetrics.fatalTotal}</div>
            <div className="text-[10px] text-rose-300/80 mt-0.5">Breaches Flagged</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-amber-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-amber-400">
            <span>High Risk Advisors</span>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-amber-400">{overallMetrics.highRiskCount}</div>
            <div className="text-[10px] text-amber-300/80 mt-0.5">Need Training / Action</div>
          </div>
        </div>
      </div>

      {/* Filter & Controls Bar */}
      <div className="glass-panel p-3 rounded-xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search advisor by name..."
            className="w-full pl-8 pr-3 py-1.5 glass-input rounded-lg text-xs text-neutral-100 placeholder:text-gray-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <span>Risk Tier:</span>
          </div>

          <div className="flex rounded-lg bg-[#0b1329] border border-white/10 p-0.5 text-[11px]">
            {(['ALL', 'LOW', 'MEDIUM', 'HIGH'] as const).map((lvl) => (
              <button
                key={lvl}
                onClick={() => setRiskFilter(lvl)}
                className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  riskFilter === lvl
                    ? lvl === 'HIGH'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : lvl === 'MEDIUM'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : lvl === 'LOW'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-400 ml-2">
            <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
            <span>Sort:</span>
          </div>

          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as any)}
            className="px-2.5 py-1.5 glass-input rounded-lg text-xs text-neutral-100 cursor-pointer"
          >
            <option value="totalCalls" className="bg-slate-900">Total Calls</option>
            <option value="complianceRate" className="bg-slate-900">Pass Rate %</option>
            <option value="avgScore" className="bg-slate-900">Average Score</option>
            <option value="fatalCount" className="bg-slate-900">Fatal Count</option>
            <option value="name" className="bg-slate-900">Advisor Name</option>
          </select>
        </div>
      </div>

      {/* Main Advisor Cards & Table Grid */}
      <div className="glass-panel rounded-2xl shadow-xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-cyan-400" />
            <span>Advisor Audit Leaderboard ({filteredAdvisors.length})</span>
          </h2>
          <span className="text-xs text-gray-400">Click any advisor to view detailed call recordings &amp; question breakdown</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="glass-inner border-b border-white/10 text-gray-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Advisor Name</th>
                <th className="py-3 px-3 text-center">Total Audits</th>
                <th className="py-3 px-3 text-center">Compliant</th>
                <th className="py-3 px-3 text-center">Fatal Violations</th>
                <th className="py-3 px-3 text-center">Avg Score</th>
                <th className="py-3 px-4 text-center">Compliance Pass Rate</th>
                <th className="py-3 px-3 text-center">Risk Level</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 font-mono">
              {filteredAdvisors.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Users className="w-8 h-8 text-gray-600" />
                      <span className="font-semibold text-gray-300">No advisors matching criteria</span>
                      <span className="text-[11px] text-gray-500">Try adjusting your search query or risk filters</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredAdvisors.map((adv, idx) => {
                  const isSelected = selectedAdvisorName === adv.name;
                  return (
                    <tr
                      key={adv.name}
                      onClick={() => setSelectedAdvisorName(isSelected ? null : adv.name)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-cyan-500/15 border-l-4 border-l-cyan-400'
                          : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className="w-5 h-5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 flex items-center justify-center text-[10px] font-bold font-mono">
                            {idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-white font-sans text-xs flex items-center gap-1.5">
                              <span>{adv.name}</span>
                              {adv.riskLevel === 'HIGH' && (
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                              )}
                            </div>
                            <div className="text-[10px] text-gray-400 font-sans">Trading Desk &bull; FundsIndia</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center text-gray-200 font-bold">
                        {adv.totalCalls}
                      </td>

                      <td className="py-3 px-3 text-center text-emerald-400 font-bold">
                        {adv.passCount}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className={`font-bold ${adv.fatalCount > 0 ? 'text-rose-400' : 'text-gray-400'}`}>
                          {adv.fatalCount}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          adv.avgScore >= 4
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : adv.avgScore >= 3
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}>
                          {adv.avgScore} / 5
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <div className="w-32 mx-auto">
                          <div className="flex items-center justify-between text-[10px] mb-1">
                            <span className="font-bold text-white">{adv.complianceRate}%</span>
                            <span className="text-gray-400 text-[9px]">{adv.passCount}/{adv.totalCalls}</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-gray-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                adv.complianceRate >= 80
                                  ? 'bg-emerald-400'
                                  : adv.complianceRate >= 60
                                  ? 'bg-amber-400'
                                  : 'bg-rose-400'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(5, adv.complianceRate))}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-center font-sans">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          adv.riskLevel === 'LOW'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : adv.riskLevel === 'MEDIUM'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse'
                        }`}>
                          {adv.riskLevel}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAdvisorName(isSelected ? null : adv.name);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-sans font-bold flex items-center gap-1 ml-auto transition-colors"
                        >
                          <span>{isSelected ? 'Close' : 'Drill Down'}</span>
                          <ChevronRight className={`w-3 h-3 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down Drawer for Selected Advisor */}
      {selectedAdvisor && (
        <div className="glass-panel p-5 rounded-2xl shadow-2xl border border-cyan-500/30 space-y-5 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                <Award className="w-5 h-5 text-cyan-400" />
              </span>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>{selectedAdvisor.name}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    selectedAdvisor.riskLevel === 'LOW'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : selectedAdvisor.riskLevel === 'MEDIUM'
                      ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}>
                    {selectedAdvisor.riskLevel} RISK
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  Detailed 5-point parameter performance &amp; call verification records for this advisor
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedAdvisorName(null)}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 5-Point Question Breakdown Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {[
              { label: 'Q1: Greeting & ID', pass: selectedAdvisor.q1Pass, total: selectedAdvisor.totalCalls },
              { label: 'Q2: Regulatory Mandate', pass: selectedAdvisor.q2Pass, total: selectedAdvisor.totalCalls },
              { label: 'Q3: CMP Price Disclosure', pass: selectedAdvisor.q3Pass, total: selectedAdvisor.totalCalls },
              { label: 'Q4: Order Confirmation', pass: selectedAdvisor.q4Pass, total: selectedAdvisor.totalCalls },
              { label: 'Q5: Script Adherence', pass: selectedAdvisor.q5Pass, total: selectedAdvisor.totalCalls },
            ].map((q) => {
              const pct = q.total > 0 ? Math.round((q.pass / q.total) * 100) : 0;
              return (
                <div key={q.label} className="bg-[#0b1329] p-3 rounded-xl border border-white/5 space-y-1.5">
                  <div className="text-[10px] text-gray-400 font-bold">{q.label}</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-white">{pct}% Pass</span>
                    <span className="text-[10px] text-gray-500 font-mono">{q.pass}/{q.total}</span>
                  </div>
                  <div className="w-full h-1 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 80 ? 'bg-emerald-400' : pct >= 60 ? 'bg-amber-400' : 'bg-rose-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Audited Scorecard Calls List */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-gray-300 flex items-center justify-between">
              <span>Audited Call Recordings ({selectedAdvisor.scorecards.length})</span>
              <span className="text-[11px] text-gray-400 font-normal">Click play to listen to audio</span>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {selectedAdvisor.scorecards.map((sc) => {
                const isPlayingCurrent = isPlaying && activeCall?.callId === sc.call_id;
                const phoneNum = sc.calling_number || sc.trade_phone || sc.registered_number || '—';
                return (
                  <div
                    key={sc.id}
                    className="p-3 bg-[#0d162e] border border-white/5 hover:border-cyan-500/30 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handlePlayCallAudio(sc.call_id)}
                        className={`p-2 rounded-xl transition-all cursor-pointer ${
                          isPlayingCurrent
                            ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/40 animate-pulse'
                            : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                        }`}
                        title="Listen to recording"
                      >
                        {isPlayingCurrent ? <Volume2 size={14} /> : <Play size={14} />}
                      </button>

                      <div>
                        <div className="font-bold text-white flex items-center gap-2">
                          <span>Call #{sc.call_id}</span>
                          <span className="font-mono text-cyan-300 font-normal text-[11px]">
                            Client: {sc.client || '—'}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                          Date: {sc.trade_date ? sc.trade_date.slice(0, 10) : '—'} &bull; Phone: {phoneNum}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className={`font-bold font-mono text-xs ${sc.is_fatal ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {sc.is_fatal ? 'FATAL BREACH' : `${sc.score}/5 PASS`}
                        </div>
                        <div className="text-[10px] text-gray-400 font-sans truncate max-w-xs">
                          {sc.audit_comment || 'Pre-order confirmation verified.'}
                        </div>
                      </div>

                      {onSelectCall && (
                        <button
                          type="button"
                          onClick={() => onSelectCall(sc.call_id)}
                          className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                          title="Open in Call Explorer"
                        >
                          <ExternalLink size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
