import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Database,
  Cpu,
  FileCheck,
  Clock,
  Layers,
  Sparkles,
} from 'lucide-react';
import { api } from '../lib/api';

interface DecisionInfo {
  id: string;
  title: string;
  category: string;
  status: 'LOCKED' | 'PROPOSED' | 'OPEN';
  description: string;
  value: any;
  options?: any[];
}

interface ReleaseReadinessData {
  ok: boolean;
  summary: {
    total_decisions: number;
    locked: number;
    proposed: number;
    open: number;
    can_run_production: boolean;
    active_rule_set: string;
    unresolved_blockers: Array<{
      id: string;
      title: string;
      current_status: string;
      reason: string;
    }>;
  };
  rule_set: {
    id: string;
    version: string;
    is_active: boolean;
    parameters: Record<string, any>;
  };
}

export const ReleaseReadinessView: React.FC = () => {
  const [data, setData] = useState<ReleaseReadinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchReadiness = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getReleaseReadiness();
      setData(res);
      // Initialize edit values from current parameters
      if (res?.rule_set?.parameters) {
        const initialEdits: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.rule_set.parameters)) {
          initialEdits[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
        }
        setEditValues(initialEdits);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load release readiness');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReadiness();
  }, [fetchReadiness]);

  const handleLockDecision = async (decisionId: string) => {
    setLockingId(decisionId);
    setError(null);
    setSuccessMsg(null);
    try {
      let rawVal: any = editValues[decisionId];
      // Try parsing if number or JSON
      if (rawVal !== undefined && !isNaN(Number(rawVal)) && rawVal.trim() !== '') {
        rawVal = Number(rawVal);
      } else {
        try {
          rawVal = JSON.parse(rawVal);
        } catch {}
      }

      const res = await api.lockDecision(decisionId, rawVal);
      setSuccessMsg(`Decision ${decisionId} locked successfully!`);
      await fetchReadiness();
    } catch (err: any) {
      setError(err?.message || `Failed to lock decision ${decisionId}`);
    } finally {
      setLockingId(null);
    }
  };

  const isBlocked = !data?.summary?.can_run_production;

  const DECISION_METADATA: Record<string, { title: string; desc: string; category: string; defaultVal: string }> = {
    'D-01': {
      title: 'Pre-Order Matching Window',
      desc: 'Authoritative boundary window in seconds before trade execution (e.g. 300s / 5 min).',
      category: 'Pipeline Timing',
      defaultVal: '300',
    },
    'D-02': {
      title: 'Missing Order Timestamp Policy',
      desc: 'Action when exchange trade order timestamp is null (e.g. REJECT_AUDIT, USE_TRADE_DATE_EOD).',
      category: 'Trade Matching',
      defaultVal: 'REJECT_AUDIT',
    },
    'D-03': {
      title: 'Multiple Trade Candidates Policy',
      desc: 'Resolution policy when multiple trades match call attributes (AMBIGUOUS_TRADE_MATCH or deterministic ranking).',
      category: 'Trade Matching',
      defaultVal: 'AMBIGUOUS_TRADE_MATCH',
    },
    'D-04': {
      title: 'Out-Of-Market Hours Call Disposition',
      desc: 'Handling of calls outside 09:15:00 - 15:40:00 IST (EXCLUDE_FROM_AUDIT or SCRAP).',
      category: 'Eligibility Gate',
      defaultVal: 'EXCLUDE_FROM_AUDIT',
    },
    'D-05': {
      title: 'Non-Equity Trade Book Records Policy',
      desc: 'Filtering policy for derivative/commodity records present in uploaded trade report.',
      category: 'Eligibility Gate',
      defaultVal: 'EXCLUDE_NON_EQUITY',
    },
    'D-06': {
      title: 'Overlapping Pre-Order Call Windows',
      desc: 'Handling when multiple calls from same customer fall into the same pre-order trade window.',
      category: 'Pipeline Timing',
      defaultVal: 'AMBIGUOUS_PRE_ORDER',
    },
    'D-07': {
      title: 'Evidence Silence & Length Threshold',
      desc: 'Minimum audible speech duration and maximum trailing silence for verbal evidence.',
      category: 'Worker B Compliance',
      defaultVal: '0.6',
    },
    'D-08': {
      title: 'Advisor Attribution Confidence Threshold',
      desc: 'Minimum diarization & speaker recognition score required for Q5 violation attributing to advisor.',
      category: 'Worker B Compliance',
      defaultVal: '0.85',
    },
    'D-09': {
      title: 'Mail Confirmation SLA & Matching Window',
      desc: 'Acceptable time delta in hours for matching mail confirmation PDFs to unrecorded trades.',
      category: 'Audit Resolution',
      defaultVal: '24',
    },
  };

  return (
    <div className="p-3 sm:p-5 max-w-[1600px] w-full mx-auto space-y-6 text-gray-200">
      {/* Top Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#21262D] pb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <ShieldCheck className="text-blue-400" size={24} />
              Production Release Readiness &amp; Governance
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-[#21262D] text-gray-300">
              RuleSet: {data?.summary?.active_rule_set || 'v2.0-prod'}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Authoritative gatekeeper per RULES.md, ARCHITECTURE.md §13-14, and PRD.md. Production processing is strictly gated by complete D-01..D-09 resolution.
          </p>
        </div>

        <button
          onClick={fetchReadiness}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-[#161B22] hover:bg-[#21262D] border border-[#21262D] text-xs font-medium rounded-lg text-gray-300 transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Gates</span>
        </button>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center gap-2">
          <AlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 size={15} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Production Processing Status Banner */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isBlocked
            ? 'bg-gradient-to-r from-rose-950/40 via-[#161B22] to-[#161B22] border-rose-500/40'
            : 'bg-gradient-to-r from-emerald-950/40 via-[#161B22] to-[#161B22] border-emerald-500/40'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`p-3 rounded-xl shrink-0 ${
                isBlocked ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'
              }`}
            >
              {isBlocked ? <ShieldAlert size={28} /> : <ShieldCheck size={28} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">
                  {isBlocked ? 'PRODUCTION PROCESSING BLOCKED' : 'PRODUCTION PROCESSING ENABLED'}
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold uppercase ${
                    isBlocked ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {isBlocked ? `${data?.summary?.unresolved_blockers?.length || 0} Blockers` : 'All Gates Passed'}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1 max-w-2xl leading-relaxed">
                {isBlocked
                  ? 'The system has detected unresolved business decisions (D-01 through D-09). Per RULES.md, automated pipeline runs cannot execute until all production parameters are formally locked by the compliance administrator.'
                  : 'All release gates, architectural constraints, and D-01 through D-09 governance decisions are locked and verified. The 100% pre-order audit pipeline is fully operational.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 shrink-0 text-center">
            <div className="p-3 bg-[#0D1117] border border-[#21262D] rounded-xl">
              <div className="text-lg font-bold font-mono text-emerald-400">
                {data?.summary?.locked ?? 0}
              </div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Locked</div>
            </div>
            <div className="p-3 bg-[#0D1117] border border-[#21262D] rounded-xl">
              <div className="text-lg font-bold font-mono text-amber-400">
                {data?.summary?.proposed ?? 0}
              </div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Proposed</div>
            </div>
            <div className="p-3 bg-[#0D1117] border border-[#21262D] rounded-xl">
              <div className="text-lg font-bold font-mono text-rose-400">
                {data?.summary?.open ?? 0}
              </div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5">Open / Blocker</div>
            </div>
          </div>
        </div>
      </div>

      {/* Unresolved Blockers Notification List */}
      {isBlocked && data?.summary?.unresolved_blockers && data.summary.unresolved_blockers.length > 0 && (
        <div className="bg-[#161B22] border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold mb-3">
            <AlertCircle size={16} />
            <span>Unresolved Production Gate Blockers ({data.summary.unresolved_blockers.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {data.summary.unresolved_blockers.map((b) => (
              <div
                key={b.id}
                className="p-3 bg-[#0D1117] border border-[#21262D] rounded-lg text-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold text-amber-300">{b.id}</span>
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded">
                      {b.current_status}
                    </span>
                  </div>
                  <div className="font-medium text-gray-200 mt-1">{b.title}</div>
                  <div className="text-gray-400 text-[11px] mt-1">{b.reason}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Production Release Gates Matrix (D-01 through D-09) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Sliders size={18} className="text-blue-400" />
            Authoritative Decision Governance Matrix (D-01 — D-09)
          </h2>
          <span className="text-xs text-gray-400">RULES.md Part C Authoritative Targets</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {Object.entries(DECISION_METADATA).map(([decId, meta]) => {
            const currentParam = data?.rule_set?.parameters?.[decId];
            const isLocked = currentParam && currentParam.status === 'LOCKED';
            const status = currentParam?.status || 'PROPOSED';
            const currentValue = currentParam?.value !== undefined ? currentParam.value : meta.defaultVal;

            return (
              <div
                key={decId}
                className={`bg-[#161B22] border rounded-xl p-4 flex flex-col justify-between transition-all ${
                  isLocked ? 'border-[#21262D]' : 'border-amber-500/40 shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-blue-400">{decId}</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#21262D] text-gray-300">
                        {meta.category}
                      </span>
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                        isLocked
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}
                    >
                      {isLocked ? <Lock size={10} /> : <Unlock size={10} />}
                      {status}
                    </span>
                  </div>

                  <h3 className="text-sm font-semibold text-white mt-2.5">{meta.title}</h3>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">{meta.desc}</p>

                  <div className="mt-4 pt-3 border-t border-[#21262D] space-y-2">
                    <label className="text-[11px] font-medium text-gray-300 flex items-center justify-between">
                      <span>Configured Production Value:</span>
                      <span className="font-mono text-gray-400">
                        {isLocked ? 'Immutable' : 'Editable'}
                      </span>
                    </label>

                    <input
                      type="text"
                      value={editValues[decId] !== undefined ? editValues[decId] : String(currentValue)}
                      onChange={(e) => setEditValues({ ...editValues, [decId]: e.target.value })}
                      placeholder={meta.defaultVal}
                      disabled={lockingId === decId}
                      className="w-full px-3 py-1.5 bg-[#0D1117] border border-[#21262D] rounded-lg text-xs font-mono text-white focus:border-blue-500 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="mt-4 pt-3">
                  <button
                    onClick={() => handleLockDecision(decId)}
                    disabled={lockingId === decId}
                    className={`w-full py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      isLocked
                        ? 'bg-[#21262D] hover:bg-[#30363D] text-gray-200'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xs'
                    }`}
                  >
                    {lockingId === decId ? (
                      <RefreshCw size={13} className="animate-spin" />
                    ) : isLocked ? (
                      <>
                        <Lock size={12} className="text-emerald-400" />
                        <span>Re-lock Parameter</span>
                      </>
                    ) : (
                      <>
                        <Lock size={12} />
                        <span>Lock Parameter for Production</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Production Architecture Guardrails Status */}
      <div className="bg-[#161B22] border border-[#21262D] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Layers size={16} className="text-blue-400" />
          Production Specification Architecture Guardrails
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="p-3.5 bg-[#0D1117] border border-[#21262D] rounded-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 size={15} />
              <span>Deepgram Nova-3 Multi-Lingual ASR Engine</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Deepgram Nova-3 Multi-Lingual Engine is the primary transcription engine with speaker diarization, Indian dialect vocabulary, and audio pre-filter DSP.
            </p>
          </div>

          <div className="p-3.5 bg-[#0D1117] border border-[#21262D] rounded-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 size={15} />
              <span>Single Authoritative Scoring Engine</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Backend pure scoring engine (`scoreAudit`) with universal 5-point rubric. Frontend strictly renders Score object verbatim.
            </p>
          </div>

          <div className="p-3.5 bg-[#0D1117] border border-[#21262D] rounded-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 size={15} />
              <span>100% Pre-Order Audit Loop</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Autonomous background worker loop continues until eligible count equals completed scorecards. Browser disconnect safe.
            </p>
          </div>

          <div className="p-3.5 bg-[#0D1117] border border-[#21262D] rounded-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 size={15} />
              <span>PostgreSQL &amp; SQLite Constraints</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Unique constraints for current scorecard (`uq_scorecard_current`), import hashes, trade keys, and job identities.
            </p>
          </div>

          <div className="p-3.5 bg-[#0D1117] border border-[#21262D] rounded-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 size={15} />
              <span>Transactional Outbox &amp; Watchdog</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              Outbox table (`outbox_events`) guarantees zero loss across worker or Redis restart. Autonomous sweeper reclaims expired leases.
            </p>
          </div>

          <div className="p-3.5 bg-[#0D1117] border border-[#21262D] rounded-lg">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
              <CheckCircle2 size={15} />
              <span>Fail-Closed Security &amp; RBAC</span>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              No first-admin fallback. Authenticated routes, rate limiters, SHA-256 integrity, and immutable evidence segments.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
