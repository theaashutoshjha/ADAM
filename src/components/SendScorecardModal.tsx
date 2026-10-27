import React, { useState, useMemo, useEffect } from 'react';
import {
  Mail,
  Send,
  X,
  AlertTriangle,
  CheckCircle2,
  Users,
  Filter,
  ShieldCheck,
  Eye,
  FileCheck,
  FileText,
  Sparkles,
  Loader2,
} from 'lucide-react';
import type { ScorecardRecord } from '../types';
import {
  getAdvisorEmailRouting,
  FUNDSINDIA_ADVISOR_DIRECTORY,
  FATAL_CC_EMAIL,
} from '../lib/fundsindia-directory';
import { cleanCallerName } from '../lib/clientCode';
import { api, getStoredToken, getApiUrl, safeParseJsonResponse } from '../lib/api';

interface SendScorecardModalProps {
  isOpen: boolean;
  onClose: () => void;
  scorecards: ScorecardRecord[];
  initialAdvisor?: string;
  initialScorecardId?: number;
  initialMarkFilter?: string;
  onSuccess?: (msg: string) => void;
}

export const SendScorecardModal: React.FC<SendScorecardModalProps> = ({
  isOpen,
  onClose,
  scorecards,
  initialAdvisor = 'ALL',
  initialScorecardId,
  initialMarkFilter = 'all',
  onSuccess,
}) => {
  const [selectedAdvisor, setSelectedAdvisor] = useState<string>(initialAdvisor);
  const [markFilter, setMarkFilter] = useState<string>(initialMarkFilter);
  const [toEmail, setToEmail] = useState<string>('');
  const [ccEmail, setCcEmail] = useState<string>('');
  const [subject, setSubject] = useState<string>('');
  const [customNotes, setCustomNotes] = useState<string>('');
  const [isSending, setIsSending] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Extract unique advisors
  const uniqueAdvisors = useMemo(() => {
    const set = new Set<string>();
    FUNDSINDIA_ADVISOR_DIRECTORY.forEach((e) => set.add(e.advisor_name));
    scorecards.forEach((s) => {
      if (s.caller_name && s.caller_name !== '—') set.add(s.caller_name);
    });
    return Array.from(set).sort();
  }, [scorecards]);

  // Compute matched scorecards based on selected advisor & mark filter
  const matchedScorecards = useMemo(() => {
    return scorecards.filter((sc) => {
      if (initialScorecardId && sc.id !== initialScorecardId) {
        return false;
      }
      if (selectedAdvisor !== 'ALL') {
        const adv = sc.caller_name || '';
        if (adv.toLowerCase() !== selectedAdvisor.toLowerCase()) return false;
      }
      const isFatal = sc.is_fatal || sc.score === 0 || sc.q1_status === 'FAIL' || sc.q2_status === 'FAIL' || sc.q5_status === 'FAIL';
      if (markFilter === '5') return !isFatal && Number(sc.score) === 5;
      if (markFilter === '4') return !isFatal && Number(sc.score) === 4;
      if (markFilter === '0' || markFilter === 'fatal') return isFatal;
      return true;
    });
  }, [scorecards, selectedAdvisor, markFilter, initialScorecardId]);

  const hasFatal = useMemo(() => {
    return matchedScorecards.some(
      (s) => s.is_fatal || s.score === 0 || s.q1_status === 'FAIL' || s.q2_status === 'FAIL' || s.q5_status === 'FAIL'
    );
  }, [matchedScorecards]);

  // Update TO, CC, and Subject when advisor or markFilter changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialScorecardId) {
      const card = scorecards.find((c) => c.id === initialScorecardId);
      if (card) {
        const isCardFatal = card.is_fatal || card.score === 0 || card.q1_status === 'FAIL' || card.q2_status === 'FAIL' || card.q5_status === 'FAIL';
        const advName = card.caller_name || 'Advisor';
        const routing = getAdvisorEmailRouting({
          advisorName: advName,
          isFatalAlone: isCardFatal,
        });
        setSelectedAdvisor(advName);
        setToEmail(routing.to);
        setCcEmail(routing.cc);
        setSubject(
          `Offline Pre Order Confirmation Call Audit Score Card — ${cleanCallerName(advName)} (Client: ${card.client || 'UCC'}, Score: ${isCardFatal ? '0/5 FATAL' : `${card.score}/5`})`
        );
        return;
      }
    }

    if (selectedAdvisor === 'ALL') {
      setToEmail('Individual Advisor Mailboxes (Auto-routed via directory)');
      setCcEmail(hasFatal ? `compliance@fundsindia.com, ${FATAL_CC_EMAIL}` : 'compliance@fundsindia.com');
      setSubject(
        `Offline Pre Order Confirmation Call Audit Score Card Summary — ${matchedScorecards.length} Calls (${hasFatal ? 'Fatal Detected: CC Sambath' : 'Compliant'})`
      );
    } else {
      const routing = getAdvisorEmailRouting({
        advisorName: selectedAdvisor,
        isFatalAlone: hasFatal,
      });
      setToEmail(routing.to);
      setCcEmail(routing.cc);
      setSubject(
        `Offline Pre Order Confirmation Call Audit Score Card Summary — ${selectedAdvisor} (${matchedScorecards.length} Calls, ${hasFatal ? 'Fatal Detected: CC Sambath' : 'Compliant'})`
      );
    }
  }, [isOpen, selectedAdvisor, markFilter, initialScorecardId, hasFatal, scorecards]);

  if (!isOpen) return null;

  const handleSend = async () => {
    if (matchedScorecards.length === 0) {
      setStatusMessage({ text: 'No scorecards match the selected criteria.', type: 'error' });
      return;
    }

    setIsSending(true);
    setStatusMessage(null);

    try {
      const token = getStoredToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const url = getApiUrl('/api/scorecards/send-all-to-advisors');
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          advisor: selectedAdvisor,
          markFilter: markFilter === 'all' ? undefined : markFilter,
          customTo: selectedAdvisor === 'ALL' ? undefined : toEmail.trim(),
          customCc: ccEmail.trim(),
          customSubject: subject.trim(),
          customNotes: customNotes.trim() || undefined,
        }),
      });

      const data = await safeParseJsonResponse<any>(res);
      if (!res.ok) throw new Error(data.error || 'Failed to dispatch scorecards');

      setStatusMessage({
        text: data.message || `Dispatched ${data.dispatched || matchedScorecards.length} scorecards successfully.`,
        type: 'success',
      });

      if (onSuccess) {
        onSuccess(data.message || `Dispatched scorecards successfully.`);
      }

      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Dispatch failed', type: 'error' });
    } finally {
      setIsSending(false);
    }
  };

  const previewCard = matchedScorecards[0];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#0D1117] border border-teal-500/30 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-teal-500/20 bg-gradient-to-r from-[#0F172A] to-[#0D1117] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-300 border border-teal-500/20 shadow-xs">
              <Send className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>1-Click Scorecard Email Dispatch</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  {matchedScorecards.length} Ready
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Send official 5-point regulatory scorecards directly to dealer mailboxes with full website formatting.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 custom-scrollbar text-xs">
          {/* Status Alert */}
          {statusMessage && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              )}
              <span className="font-medium text-xs">{statusMessage.text}</span>
            </div>
          )}

          {/* Filtering & Recipient Controls Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-900/60 p-4 rounded-xl border border-teal-500/20">
            {/* Advisor Selector */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-teal-400" />
                <span>Select Advisor</span>
              </label>
              <select
                value={selectedAdvisor}
                onChange={(e) => setSelectedAdvisor(e.target.value)}
                disabled={Boolean(initialScorecardId)}
                className="w-full px-3 py-2 bg-slate-950 border border-teal-500/20 rounded-xl text-xs text-white focus:border-teal-400 focus:outline-hidden"
              >
                <option value="ALL">ALL Advisors ({uniqueAdvisors.length})</option>
                {uniqueAdvisors.map((adv) => (
                  <option key={adv} value={adv}>
                    {adv}
                  </option>
                ))}
              </select>
            </div>

            {/* Score Mark Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-teal-400" />
                <span>Filter Scorecards by Marks</span>
              </label>
              <select
                value={markFilter}
                onChange={(e) => setMarkFilter(e.target.value)}
                disabled={Boolean(initialScorecardId)}
                className="w-full px-3 py-2 bg-slate-950 border border-teal-500/20 rounded-xl text-xs text-white focus:border-teal-400 focus:outline-hidden"
              >
                <option value="all">All Marks (5/5, 4/5, and Fatals)</option>
                <option value="5">5 / 5 — Full Compliant Only</option>
                <option value="4">4 / 5 — Minor Defect Only</option>
                <option value="0">0 / 5 — Fatal Breaches Only (Auto-CC Sambath)</option>
              </select>
            </div>

            {/* TO Input */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-teal-400" />
                  <span>TO (Recipient)</span>
                </span>
                {selectedAdvisor !== 'ALL' && (
                  <span className="text-[10px] text-teal-400 font-mono">Editable</span>
                )}
              </label>
              <input
                type="text"
                value={toEmail}
                onChange={(e) => setToEmail(e.target.value)}
                disabled={selectedAdvisor === 'ALL'}
                placeholder="advisor@fundsindia.com"
                className="w-full px-3 py-2 bg-slate-950 border border-teal-500/20 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-teal-400 focus:outline-hidden disabled:opacity-60"
              />
            </div>

            {/* CC Input with Compliance Badge */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                  <span>CC (Compliance Oversight)</span>
                </span>
                {hasFatal && (
                  <span className="text-[10px] text-amber-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span>Sambath Included</span>
                  </span>
                )}
              </label>
              <input
                type="text"
                value={ccEmail}
                onChange={(e) => setCcEmail(e.target.value)}
                placeholder="compliance@fundsindia.com"
                className="w-full px-3 py-2 bg-slate-950 border border-teal-500/20 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-teal-400 focus:outline-hidden"
              />
              {hasFatal ? (
                <p className="text-[10px] text-amber-400/90 mt-1 flex items-center gap-1">
                  <span>Mandatory:</span> sambath.s@fundsindia.com automatically added for 0/5 fatal violations.
                </p>
              ) : (
                <p className="text-[10px] text-slate-400 mt-1">
                  Compliant scorecards routed to standard compliance audit mailbox.
                </p>
              )}
            </div>

            {/* Subject Input */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5">Email Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email Subject Line"
                className="w-full px-3 py-2 bg-slate-950 border border-teal-500/20 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-teal-400 focus:outline-hidden font-mono"
              />
            </div>

            {/* Custom Notes / Message */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5">
                Audit Remarks / Custom Notice to Dealer (Optional)
              </label>
              <textarea
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                rows={2}
                placeholder="Add any specific instructions or compliance observations to include in the email body..."
                className="w-full px-3 py-2 bg-slate-950 border border-teal-500/20 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-teal-400 focus:outline-hidden resize-none"
              />
            </div>
          </div>

          {/* Exact Scorecard Preview Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-teal-400" />
                <span>Exact Email Scorecard Preview (HTML Format Sent to Advisor)</span>
              </span>
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] text-slate-400 font-mono">
                  {matchedScorecards.length > 1
                    ? `Showing 1 of ${matchedScorecards.length} scorecards`
                    : 'Single Scorecard'}
                </span>
                {previewCard && (
                  <a
                    href={api.getSebiAuditPdfUrl(previewCard.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={`SEBI_Audit_Certificate_${previewCard.id}.pdf`}
                    className="px-2 py-0.5 rounded-lg border border-emerald-500/40 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 text-[10px] font-bold flex items-center gap-1 transition-colors shadow-sm"
                    title="Download Official SEBI Formatted PDF Certificate"
                  >
                    <FileText className="w-3 h-3 text-emerald-400" />
                    <span>SEBI PDF</span>
                  </a>
                )}
              </div>
            </div>

            {previewCard ? (
              <div className="bg-[#0B0F17] p-4 rounded-xl border border-teal-500/20 space-y-3 font-sans shadow-inner">
                {/* Official Card Header */}
                <div className="bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-700 text-white font-bold text-center py-2 px-3 rounded-t-lg text-xs uppercase tracking-wide">
                  Offline Pre Order Confirmation Call Audit Score Card
                </div>

                {/* Metadata Table */}
                <table className="w-full border-collapse border border-slate-700 text-[11px]">
                  <tbody>
                    <tr>
                      <th className="border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-left font-semibold text-slate-300 w-1/4">
                        Caller Name
                      </th>
                      <td className="border border-slate-700 bg-slate-900/40 px-2.5 py-1.5 text-white w-1/4">
                        {cleanCallerName(previewCard.caller_name) || '—'}
                      </td>
                      <th className="border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-left font-semibold text-slate-300 w-1/4">
                        Team
                      </th>
                      <td className="border border-slate-700 bg-slate-900/40 px-2.5 py-1.5 text-white w-1/4">
                        {previewCard.team || 'Equity Dealing'}
                      </td>
                    </tr>
                    <tr>
                      <th className="border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-left font-semibold text-slate-300">
                        Client ID
                      </th>
                      <td className="border border-slate-700 bg-slate-900/40 px-2.5 py-1.5 font-mono text-teal-300 font-bold">
                        {previewCard.client || '—'}
                      </td>
                      <th className="border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-left font-semibold text-slate-300">
                        Phone Number
                      </th>
                      <td className="border border-slate-700 bg-slate-900/40 px-2.5 py-1.5 font-mono text-slate-300">
                        {previewCard.trade_phone || previewCard.calling_number || '—'}
                      </td>
                    </tr>
                    <tr>
                      <th className="border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-left font-semibold text-slate-300">
                        Trade Date
                      </th>
                      <td className="border border-slate-700 bg-slate-900/40 px-2.5 py-1.5 text-slate-300 font-mono">
                        {previewCard.trade_date || previewCard.call_date || '—'}
                      </td>
                      <th className="border border-slate-700 bg-slate-900/90 px-2.5 py-1.5 text-left font-semibold text-slate-300">
                        Audit Date
                      </th>
                      <td className="border border-slate-700 bg-slate-900/40 px-2.5 py-1.5 text-slate-300 font-mono">
                        {previewCard.created_at ? previewCard.created_at.slice(0, 10) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 5-Point Parameters Table */}
                {(() => {
                  const isCardFatal =
                    previewCard.is_fatal ||
                    previewCard.score === 0 ||
                    previewCard.q1_status === 'FAIL' ||
                    previewCard.q2_status === 'FAIL' ||
                    previewCard.q5_status === 'FAIL';
                  const scoreVal = isCardFatal ? 0 : Math.min(5, Math.max(0, previewCard.score ?? 5));
                  const stars = isCardFatal ? '*' : '*'.repeat(scoreVal);

                  const params = [
                    {
                      num: '1',
                      text: "Confirmation given in the Customer's Registered / authorised Number ?",
                      mark: previewCard.q1_status === 'PASS' ? '1' : '0',
                      flag: 'FATAL',
                      score: previewCard.q1_status === 'PASS' ? 'Yes' : 'No',
                      isFail: previewCard.q1_status === 'FAIL',
                    },
                    {
                      num: '2',
                      text: 'Pre Order Confirmation is as per the Regulatory Norms? (Client code verbally confirmed)',
                      mark: previewCard.q2_status === 'PASS' ? '1' : '0',
                      flag: 'FATAL',
                      score: previewCard.q2_status === 'PASS' ? 'Yes' : 'No',
                      isFail: previewCard.q2_status === 'FAIL',
                    },
                    {
                      num: '3',
                      text: "Wasn't pre-order partial (Script, price and quantity mentioned)",
                      mark: previewCard.q3_status === 'PASS' ? '1' : '0',
                      flag: '',
                      score: previewCard.q3_status === 'PASS' ? 'Yes' : 'No',
                      isFail: previewCard.q3_status === 'FAIL',
                    },
                    {
                      num: '4',
                      text: 'Customer Acknowledge the same?',
                      mark: '1',
                      flag: '',
                      score: 'Yes',
                      isFail: false,
                    },
                    {
                      num: '5',
                      text: "Wasn't there any Return Commitment ? (Fatal)",
                      mark: previewCard.q5_status === 'PASS' ? '1' : '0',
                      flag: 'FATAL',
                      score: previewCard.q5_status === 'PASS' ? 'Yes' : 'No',
                      isFail: previewCard.q5_status === 'FAIL',
                    },
                  ];

                  return (
                    <table className="w-full border-collapse border border-slate-700 text-[11px]">
                      <thead>
                        <tr className="bg-slate-900 text-slate-300 font-semibold border-b border-slate-700">
                          <th className="border border-slate-700 px-2.5 py-1.5 text-left">PARAMETERS</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center w-14">Mark</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center w-16">Flag</th>
                          <th className="border border-slate-700 px-2 py-1.5 text-center w-16">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {params.map((p) => (
                          <tr
                            key={p.num}
                            className={p.isFail ? 'bg-rose-950/20 text-rose-200' : 'text-slate-200'}
                          >
                            <td className="border border-slate-700 px-2.5 py-1.5">
                              {p.num}. {p.text}
                            </td>
                            <td className="border border-slate-700 px-2 py-1.5 text-center font-mono">{p.mark}</td>
                            <td
                              className={`border border-slate-700 px-2 py-1.5 text-center font-bold ${
                                p.flag === 'FATAL' ? 'text-rose-400 font-black' : ''
                              }`}
                            >
                              {p.flag}
                            </td>
                            <td
                              className={`border border-slate-700 px-2 py-1.5 text-center font-bold ${
                                p.score === 'No' ? 'text-rose-400' : 'text-emerald-400'
                              }`}
                            >
                              {p.score}
                            </td>
                          </tr>
                        ))}
                        {/* Total Row */}
                        <tr className="bg-teal-950/70 font-bold text-white border-t border-teal-500/30">
                          <td className="border border-slate-700 px-2.5 py-1.5 text-right text-teal-300">TOTAL</td>
                          <td className="border border-slate-700 px-2 py-1.5 text-center font-mono">5</td>
                          <td className="border border-slate-700 px-2 py-1.5 text-center font-mono text-amber-300">
                            {stars}
                          </td>
                          <td className="border border-slate-700 px-2 py-1.5 text-center font-mono text-teal-300">
                            {scoreVal}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  );
                })()}

                {/* Comment Box */}
                <div className="border border-slate-700 bg-slate-900/60 p-2.5 rounded-lg text-[11px]">
                  <b className="text-teal-300 mr-1.5">Comment about call:</b>
                  <span className="text-slate-300">
                    {previewCard.audit_comment || 'Pre Order Confirmation is as per the Regulatory Norm.'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No scorecards to preview with the selected filters.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-4 sm:p-5 border-t border-teal-500/20 bg-slate-950/90 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            Total target scorecards: <b className="text-white">{matchedScorecards.length}</b>
            {hasFatal && (
              <span className="ml-2 text-amber-400 font-bold">(Contains Fatal Violations)</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={isSending || matchedScorecards.length === 0}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-teal-500/20 disabled:opacity-50 transition-all active:scale-95"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Dispatching Mails…</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Send {matchedScorecards.length} Scorecard{matchedScorecards.length === 1 ? '' : 's'} Now</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
