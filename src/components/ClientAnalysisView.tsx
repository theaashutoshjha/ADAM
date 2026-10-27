import React, { useState, useMemo } from 'react';
import {
  UserCheck,
  Search,
  Filter,
  Phone,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Play,
  Volume2,
  ExternalLink,
  ChevronRight,
  X,
  FileSpreadsheet,
  Activity,
  Layers,
  Clock,
  ArrowUpDown,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import type { TradeRecord, CallRecord, ScorecardRecord } from '../types';
import { useAudioPlayer } from './GlobalAudioPlayer';
import { formatCleanClientCode } from '../lib/clientCode';

interface ClientAnalysisViewProps {
  trades: TradeRecord[];
  calls?: CallRecord[];
  scorecards?: ScorecardRecord[];
  preOrdersSummary?: any;
  onSelectCall?: (callId: number) => void;
  isLoading?: boolean;
  dateRange?: string;
}

interface ClientStat {
  clientCode: string;
  phone: string;
  totalTrades: number;
  matchedCalls: number;
  status: 'VERIFIED' | 'PENDING' | 'MISSING_CALL';
  complianceRate: number;
  latestDate: string;
  latestTime: string;
  trades: TradeRecord[];
  matchedScorecards: ScorecardRecord[];
  matchedCallRecords: CallRecord[];
}

export const ClientAnalysisView: React.FC<ClientAnalysisViewProps> = ({
  trades = [],
  calls = [],
  scorecards = [],
  preOrdersSummary,
  onSelectCall,
  isLoading = false,
  dateRange,
}) => {
  const { playCall, isPlaying, activeCall } = useAudioPlayer();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VERIFIED' | 'PENDING' | 'MISSING_CALL'>('ALL');
  const [selectedClientCode, setSelectedClientCode] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'totalTrades' | 'clientCode' | 'latestDate' | 'status'>('totalTrades');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Group trades, calls, and scorecards by Client Code
  const clientData = useMemo(() => {
    const map = new Map<string, {
      trades: TradeRecord[];
      phones: Set<string>;
      latestDate: string;
      latestTime: string;
    }>();

    for (const t of trades) {
      const rawCode = t.client_code || t.client || '';
      const cleanCode = formatCleanClientCode(rawCode) || rawCode.trim().toUpperCase() || 'UNKNOWN';

      if (!map.has(cleanCode)) {
        map.set(cleanCode, {
          trades: [],
          phones: new Set<string>(),
          latestDate: '',
          latestTime: '',
        });
      }

      const entry = map.get(cleanCode)!;
      entry.trades.push(t);
      if (t.phone_number || t.client_number) {
        entry.phones.add(t.phone_number || t.client_number);
      }
      if (t.trade_date && (!entry.latestDate || t.trade_date > entry.latestDate)) {
        entry.latestDate = t.trade_date;
        entry.latestTime = t.trade_time || '';
      }
    }

    // Build lookup maps for calls and scorecards
    const scorecardsByClient = new Map<string, ScorecardRecord[]>();
    for (const sc of scorecards) {
      const code = formatCleanClientCode(sc.client) || (sc.client || '').trim().toUpperCase();
      if (code) {
        if (!scorecardsByClient.has(code)) scorecardsByClient.set(code, []);
        scorecardsByClient.get(code)!.push(sc);
      }
    }

    const callsByClient = new Map<string, CallRecord[]>();
    for (const c of calls) {
      const code = formatCleanClientCode(c.client_code || c.client) || (c.client_code || c.client || '').trim().toUpperCase();
      if (code) {
        if (!callsByClient.has(code)) callsByClient.set(code, []);
        callsByClient.get(code)!.push(c);
      }
    }

    const results: ClientStat[] = [];
    for (const [code, val] of map.entries()) {
      const clientScorecards = scorecardsByClient.get(code) || [];
      const clientCalls = callsByClient.get(code) || [];
      const primaryPhone = Array.from(val.phones)[0] || '—';

      const passCount = clientScorecards.filter((s) => !s.is_fatal && s.score >= 4).length;
      const complianceRate = clientScorecards.length > 0
        ? Math.round((passCount / clientScorecards.length) * 100)
        : 100;

      let status: 'VERIFIED' | 'PENDING' | 'MISSING_CALL' = 'MISSING_CALL';
      if (clientScorecards.length > 0) {
        status = 'VERIFIED';
      } else if (clientCalls.length > 0) {
        status = 'PENDING';
      }

      results.push({
        clientCode: code,
        phone: primaryPhone,
        totalTrades: val.trades.length,
        matchedCalls: clientCalls.length || clientScorecards.length,
        status,
        complianceRate,
        latestDate: val.latestDate || '—',
        latestTime: val.latestTime || '',
        trades: val.trades,
        matchedScorecards: clientScorecards,
        matchedCallRecords: clientCalls,
      });
    }

    return results;
  }, [trades, calls, scorecards]);

  // Overall metrics
  const summaryMetrics = useMemo(() => {
    const totalClients = clientData.length;
    const verifiedClients = clientData.filter((c) => c.status === 'VERIFIED').length;
    const pendingClients = clientData.filter((c) => c.status === 'PENDING').length;
    const missingCallClients = clientData.filter((c) => c.status === 'MISSING_CALL').length;
    const totalTrades = trades.length;
    const verifiedRate = totalClients > 0 ? Math.round((verifiedClients / totalClients) * 100) : 0;

    return {
      totalClients,
      verifiedClients,
      pendingClients,
      missingCallClients,
      totalTrades,
      verifiedRate,
    };
  }, [clientData, trades]);

  // Filtered and sorted clients
  const filteredClients = useMemo(() => {
    return clientData
      .filter((c) => {
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          const matchCode = c.clientCode.toLowerCase().includes(q);
          const matchPhone = c.phone.toLowerCase().includes(q);
          if (!matchCode && !matchPhone) return false;
        }
        if (statusFilter !== 'ALL' && c.status !== statusFilter) {
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
  }, [clientData, searchTerm, statusFilter, sortField, sortOrder]);

  const selectedClient = useMemo(() => {
    if (!selectedClientCode) return null;
    return clientData.find((c) => c.clientCode === selectedClientCode) || null;
  }, [clientData, selectedClientCode]);

  const handlePlayAudio = (callId: number) => {
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
        callerId: selectedClient?.phone || '—',
        clientCode: selectedClient?.clientCode,
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
                Client UCC Directory
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Trade Pre-Order Correlation
              </span>
            </div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2.5">
              <UserCheck className="w-6 h-6 text-cyan-400" />
              <span>Client Trade Analysis &amp; Pre-Order Verification</span>
            </h1>
            <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
              Complete investor portfolio verification: Authoritative correlation between executed exchange trades, customer phone numbers, and recorded pre-order telephony confirmations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-3 py-1.5 rounded-xl bg-[#0b1329] border border-cyan-500/20 text-cyan-300 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>{summaryMetrics.totalClients} Unique Accounts</span>
            </span>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="glass-panel p-4 rounded-xl border border-white/10 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Total Accounts</span>
            <UserCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-white">{summaryMetrics.totalClients}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{summaryMetrics.totalTrades} Executed Trades</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-emerald-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-emerald-400">
            <span>Pre-Order Verified</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-emerald-400">{summaryMetrics.verifiedClients}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">{summaryMetrics.verifiedRate}% Verified Ratio</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-amber-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-amber-400">
            <span>Pending Audit</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-amber-400">{summaryMetrics.pendingClients}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">Calls Ingestion Active</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-rose-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-rose-400">
            <span>Missing Pre-Order</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-rose-400">{summaryMetrics.missingCallClients}</div>
            <div className="text-[10px] text-rose-300/80 mt-0.5">Flagged for SEBI Audit</div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-xl border border-purple-500/20 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-purple-400">
            <span>Exchange Trades</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold font-mono text-purple-300">{summaryMetrics.totalTrades}</div>
            <div className="text-[10px] text-gray-400 mt-0.5">All CMP Fills Grouped</div>
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="glass-panel p-3 rounded-xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Client UCC or Phone number..."
            className="w-full pl-8 pr-3 py-1.5 glass-input rounded-lg text-xs text-neutral-100 placeholder:text-gray-500 font-mono"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <span>Verification Status:</span>
          </div>

          <div className="flex rounded-lg bg-[#0b1329] border border-white/10 p-0.5 text-[11px]">
            {(['ALL', 'VERIFIED', 'PENDING', 'MISSING_CALL'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  statusFilter === st
                    ? st === 'VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : st === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : st === 'MISSING_CALL'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {st.replace('_', ' ')}
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
            <option value="totalTrades" className="bg-slate-900">Total Trades</option>
            <option value="clientCode" className="bg-slate-900">Client Code</option>
            <option value="latestDate" className="bg-slate-900">Latest Trade Date</option>
            <option value="status" className="bg-slate-900">Verification Status</option>
          </select>
        </div>
      </div>

      {/* Main Client Master Table */}
      <div className="glass-panel rounded-2xl shadow-xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-cyan-400" />
            <span>Client Accounts Registry ({filteredClients.length})</span>
          </h2>
          <span className="text-xs text-gray-400">Click any client row to inspect trades and listen to pre-order recording</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="glass-inner border-b border-white/10 text-gray-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-4">Client UCC</th>
                <th className="py-3 px-4">Registered Phone</th>
                <th className="py-3 px-3 text-center">Trades Executed</th>
                <th className="py-3 px-3 text-center">Matched Calls</th>
                <th className="py-3 px-3 text-center">Pre-Order Status</th>
                <th className="py-3 px-3 text-center">Compliance Pass</th>
                <th className="py-3 px-4 text-center">Latest Trade</th>
                <th className="py-3 px-4 text-right font-sans">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400 font-sans">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <UserCheck className="w-8 h-8 text-gray-600" />
                      <span className="font-semibold text-gray-300">No client accounts found</span>
                      <span className="text-[11px] text-gray-500">Upload trade records or adjust filters</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => {
                  const isSelected = selectedClientCode === c.clientCode;
                  return (
                    <tr
                      key={c.clientCode}
                      onClick={() => setSelectedClientCode(isSelected ? null : c.clientCode)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-cyan-500/15 border-l-4 border-l-cyan-400'
                          : 'hover:bg-white/[0.04]'
                      }`}
                    >
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-bold">
                          {c.clientCode}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-gray-300 font-mono">
                        {c.phone}
                      </td>

                      <td className="py-3 px-3 text-center font-bold text-white">
                        {c.totalTrades}
                      </td>

                      <td className="py-3 px-3 text-center font-bold text-cyan-300">
                        {c.matchedCalls}
                      </td>

                      <td className="py-3 px-3 text-center font-sans">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          c.status === 'VERIFIED'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : c.status === 'PENDING'
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        }`}>
                          {c.status.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="py-3 px-3 text-center font-bold">
                        <span className={c.complianceRate >= 80 ? 'text-emerald-400' : 'text-amber-400'}>
                          {c.complianceRate}%
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center text-gray-400 text-[11px]">
                        {c.latestDate} {c.latestTime ? `· ${c.latestTime}` : ''}
                      </td>

                      <td className="py-3 px-4 text-right font-sans">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedClientCode(isSelected ? null : c.clientCode);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold flex items-center gap-1 ml-auto transition-colors"
                        >
                          <span>{isSelected ? 'Close' : 'View Trades'}</span>
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

      {/* Expanded Drilldown for Selected Client (Solving "client on any changes nothing") */}
      {selectedClient && (
        <div className="glass-panel p-5 rounded-2xl shadow-2xl border border-cyan-500/30 space-y-5 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                <UserCheck className="w-5 h-5 text-cyan-400" />
              </span>
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span>Client Account: {selectedClient.clientCode}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    selectedClient.status === 'VERIFIED'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      : selectedClient.status === 'PENDING'
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                  }`}>
                    {selectedClient.status.replace('_', ' ')}
                  </span>
                </h3>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  Phone: {selectedClient.phone} &bull; {selectedClient.totalTrades} Executions &bull; {selectedClient.matchedCalls} Matched Audio Sessions
                </p>
              </div>
            </div>

            <button
              onClick={() => setSelectedClientCode(null)}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Executed Trade Book for this Client */}
            <div className="bg-[#0b1329] p-4 rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  <span>Executed Trades ({selectedClient.trades.length})</span>
                </h4>
                <span className="text-[10px] text-gray-400 font-mono">Exchange Fills</span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {selectedClient.trades.map((t, idx) => (
                  <div
                    key={`${t.id || idx}`}
                    className="p-2.5 bg-[#0d162e] border border-white/5 rounded-lg flex items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div>
                      <div className="font-bold text-white flex items-center gap-1.5">
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                          t.side === 'BUY' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                        }`}>
                          {t.side}
                        </span>
                        <span>{t.symbol}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {t.trade_date} &bull; {t.trade_time} &bull; Dealer: {t.dealer || '—'}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-bold text-cyan-300">
                        {t.quantity} shares @ {t.price_display || t.price || 'CMP'}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        Advisor: {t.advisor_name || '—'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Matched Audio Recordings & Pre-Order Calls */}
            <div className="bg-[#0b1329] p-4 rounded-xl border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>Pre-Order Call Recordings ({selectedClient.matchedScorecards.length || selectedClient.matchedCallRecords.length})</span>
                </h4>
                <span className="text-[10px] text-gray-400 font-mono">Telephony Audit</span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {selectedClient.matchedScorecards.length === 0 && selectedClient.matchedCallRecords.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 text-xs flex flex-col items-center justify-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                    <span className="font-bold text-gray-300">No Pre-Order Call Correlated Yet</span>
                    <span className="text-[11px] text-gray-500 max-w-xs">
                      Run the automated pipeline or upload the matching call recording in Ingestion Hub to correlate with this trade.
                    </span>
                  </div>
                ) : (
                  (selectedClient.matchedScorecards.length > 0
                    ? selectedClient.matchedScorecards
                    : selectedClient.matchedCallRecords
                  ).map((item: any, idx: number) => {
                    const callId = item.call_id || item.id;
                    const isPlayingCurrent = isPlaying && activeCall?.callId === callId;
                    return (
                      <div
                        key={item.id || idx}
                        className="p-3 bg-[#0d162e] border border-white/5 hover:border-cyan-500/30 rounded-xl flex items-center justify-between gap-3 text-xs transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handlePlayAudio(callId)}
                            className={`p-2 rounded-xl transition-all cursor-pointer ${
                              isPlayingCurrent
                                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/40 animate-pulse'
                                : 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            }`}
                            title="Listen to pre-order verification recording"
                          >
                            {isPlayingCurrent ? <Volume2 size={14} /> : <Play size={14} />}
                          </button>

                          <div>
                            <div className="font-bold text-white flex items-center gap-2">
                              <span>Call #{callId}</span>
                              <span className="text-[10px] font-mono text-emerald-400">
                                {item.classification || 'PRE_ORDER'}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                              Advisor: {item.caller_name || item.advisor_name || '—'} &bull; Date: {item.trade_date || item.call_date || '—'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {item.score !== undefined && (
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                              item.is_fatal
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}>
                              {item.is_fatal ? 'FATAL' : `${item.score}/5`}
                            </span>
                          )}

                          {onSelectCall && (
                            <button
                              type="button"
                              onClick={() => onSelectCall(callId)}
                              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
                              title="Open Call Explorer"
                            >
                              <ExternalLink size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
