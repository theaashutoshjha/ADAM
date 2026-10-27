import React, { useState } from 'react';
import {
  PhoneCall,
  Radio,
  Cpu,
  ShieldCheck,
  Mail,
  Database,
  CheckCircle2,
  AlertCircle,
  Zap,
  Activity,
  ArrowRight,
  Sparkles,
  Wifi,
  Lock,
} from 'lucide-react';

interface NodeData {
  id: string;
  name: string;
  category: string;
  status: 'active' | 'standby' | 'warning';
  latency: string;
  throughput: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  glowColor: string;
  borderColor: string;
  details: string[];
}

export const PipelineTopologyGraph: React.FC = () => {
  const [selectedNodeId, setSelectedNodeId] = useState<string>('speech-dsp');
  const [isSimulatingPackets, setIsSimulatingPackets] = useState<boolean>(true);

  const nodes: NodeData[] = [
    {
      id: 'tata-pbx',
      name: 'Tata Smartflo PBX',
      category: 'Telephony Trunk',
      status: 'active',
      latency: '18ms',
      throughput: '119 Pre-Orders',
      description: 'Enterprise SIP trunking & 8kHz dual-channel raw WAV audio capture from Tata CloudPhone infrastructure.',
      icon: PhoneCall,
      accentColor: 'text-sky-400',
      glowColor: 'shadow-sky-500/20',
      borderColor: 'border-sky-500/30',
      details: [
        'Protocol: SIP / TLS Dual-Channel Telephony',
        'Audio Sampling: 8000 Hz, 16-bit PCM Mono/Stereo',
        'Payload Security: AES-256 Encrypted Trunking',
        'Sync Channel: Webhook Push + On-Demand Batch Polling',
      ],
    },
    {
      id: 'ingest-queue',
      name: 'Ingestion & Buffer',
      category: 'Streaming Queue',
      status: 'active',
      latency: '4ms',
      throughput: 'Zero Drop',
      description: 'Webhook HMAC-SHA256 signature verification, audio normalization, and fast memory buffering.',
      icon: Radio,
      accentColor: 'text-teal-400',
      glowColor: 'shadow-teal-500/20',
      borderColor: 'border-teal-500/30',
      details: [
        'Authentication: HMAC-SHA256 Shared Secret',
        'Buffer: In-Memory Ring Buffer & Disk Persistence',
        'Bandpass Filter: 300Hz - 3400Hz Speech Isolation',
        'Backpressure: Concurrent worker thread pool',
      ],
    },
    {
      id: 'speech-dsp',
      name: 'Dual-Engine ASR DSP',
      category: 'Speech Engine',
      status: 'active',
      latency: '240ms',
      throughput: 'Nova-3 & Whisper',
      description: 'Deepgram Nova-3 & Groq Whisper Large-v3 with phonetic dictionary, diacritics, and Indian financial lexicons.',
      icon: Cpu,
      accentColor: 'text-indigo-400',
      glowColor: 'shadow-indigo-500/25',
      borderColor: 'border-indigo-500/40',
      details: [
        'Primary Engine: Deepgram Nova-3 Financial Model',
        'Fallback Engine: Groq Whisper Large-v3 (Sub-second)',
        'Code-Switching: Hinglish & Multi-dialectic Indian English',
        'Confidence Scoring: Per-token acoustic log-probabilities',
      ],
    },
    {
      id: 'sebi-audit',
      name: 'SEBI Compliance Core',
      category: 'Ruleset Validator',
      status: 'active',
      latency: '310ms',
      throughput: '5-Point Rubric',
      description: 'Strict regulatory validation across Q1 (Registered Phone), Q2 (Client Code), Q3 (Qty/Price), Q4 (Ack), & Q5 (Guaranteed Returns).',
      icon: ShieldCheck,
      accentColor: 'text-emerald-400',
      glowColor: 'shadow-emerald-500/25',
      borderColor: 'border-emerald-500/40',
      details: [
        'Parameters: Q1 to Q5 SEBI Pre-Order Circulars',
        'Fatal Flag Detection: Immediate zero-rating on violation',
        'Evidence Extraction: Exact verbatim quote & timestamping',
        'Deterministic Fallback: Regex acoustic pattern matcher',
      ],
    },
    {
      id: 'smtp-dispatch',
      name: 'Corporate SMTP Mailer',
      category: 'Dispatch Gateway',
      status: 'active',
      latency: '85ms',
      throughput: 'Instant Alerts',
      description: 'Automated advisor violation warnings, compliance desk bulletins, and daily executive summaries.',
      icon: Mail,
      accentColor: 'text-amber-400',
      glowColor: 'shadow-amber-500/20',
      borderColor: 'border-amber-500/30',
      details: [
        'Transport: STARTTLS / SSL Port 587 or 465',
        'Templates: HTML Responsive Audit Scorecards',
        'Rate Limiting: Exponential Backoff & Queueing',
        'Tracking: SMTP Delivery Confirmation & Bounce Catching',
      ],
    },
    {
      id: 'ledger-db',
      name: 'SQLite Audit Vault',
      category: 'Persistent Storage',
      status: 'active',
      latency: '2ms',
      throughput: 'WAL Mode',
      description: 'Full audit history, caller mappings, phonetic transcripts, and compliance metrics stored securely.',
      icon: Database,
      accentColor: 'text-cyan-400',
      glowColor: 'shadow-cyan-500/20',
      borderColor: 'border-cyan-500/30',
      details: [
        'Engine: SQLite3 with Write-Ahead Logging (WAL)',
        'Integrity: Foreign Key Constraints & Cascading Checks',
        'Encryption: Server-Side AES-256 for Key Vault',
        'Retention: Regulatory 5-Year Financial Archive Ready',
      ],
    },
  ];

  const activeNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  return (
    <div className="relative overflow-hidden rounded-2xl border border-teal-500/30 bg-gradient-to-b from-[#0b121e]/90 via-[#070d18]/95 to-[#040810]/95 p-6 shadow-2xl backdrop-blur-xl">
      {/* Radiant ambient glow spots */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 h-72 w-96 rounded-full bg-cyan-500/5 blur-3xl" />

      {/* Header controls */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-teal-500/15">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500/30 to-indigo-500/20 border border-teal-500/40 text-teal-300 shadow-md shadow-teal-500/20">
              <Activity className="h-4 w-4 animate-pulse" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2 tracking-tight">
                <span>System Architecture &amp; Data Pipeline Topology</span>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono text-emerald-300 font-bold">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                  ALL NODES OPERATIONAL
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time interactive data flow: SIP trunking audio ingestion, speech recognition, SEBI compliance scoring, and alert routing.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsSimulatingPackets(!isSimulatingPackets)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer border ${
              isSimulatingPackets
                ? 'bg-teal-500/15 text-teal-300 border-teal-500/30 shadow-sm shadow-teal-500/20'
                : 'bg-slate-800/60 text-slate-400 border-slate-700/50 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>{isSimulatingPackets ? 'Packet Flow Active' : 'Flow Paused'}</span>
          </button>
        </div>
      </div>

      {/* Architecture Graphic Grid: Interactive Nodes */}
      <div className="relative z-10 my-6">
        {/* Animated Connecting Traces (SVG background overlay) */}
        <div className="hidden lg:block relative mb-4">
          <svg className="w-full h-6 overflow-visible" viewBox="0 0 1000 24" preserveAspectRatio="none">
            <defs>
              <linearGradient id="traceGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
                <stop offset="35%" stopColor="#2dd4bf" stopOpacity="0.8" />
                <stop offset="65%" stopColor="#818cf8" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.6" />
              </linearGradient>
            </defs>
            <line
              x1="50"
              y1="12"
              x2="950"
              y2="12"
              stroke="url(#traceGrad)"
              strokeWidth="2"
              strokeDasharray={isSimulatingPackets ? '6, 6' : 'none'}
              className={isSimulatingPackets ? 'animate-marquee' : ''}
            />
            {/* Pulsing energy beads */}
            {isSimulatingPackets && (
              <>
                <circle cx="200" cy="12" r="3" fill="#2dd4bf" className="animate-ping" />
                <circle cx="500" cy="12" r="3.5" fill="#818cf8" className="animate-ping" />
                <circle cx="800" cy="12" r="3" fill="#34d399" className="animate-ping" />
              </>
            )}
          </svg>
        </div>

        {/* 6 Responsive Pipeline Node Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {nodes.map((node, index) => {
            const Icon = node.icon;
            const isSelected = selectedNodeId === node.id;

            return (
              <div
                key={node.id}
                onClick={() => setSelectedNodeId(node.id)}
                className={`relative group cursor-pointer rounded-xl p-3.5 transition-all duration-300 border flex flex-col justify-between ${
                  isSelected
                    ? `bg-slate-900/90 ${node.borderColor} shadow-lg ${node.glowColor} ring-1 ring-teal-500/40 -translate-y-1`
                    : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-800/60 hover:border-slate-700/80 hover:-translate-y-0.5'
                }`}
              >
                {/* Step Index Badge */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
                    0{index + 1}
                  </span>
                  <span
                    className={`h-2 w-2 rounded-full ${
                      node.status === 'active' ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-amber-400'
                    }`}
                  />
                </div>

                {/* Node Icon & Name */}
                <div className="space-y-1.5 my-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 ${node.accentColor}`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-white leading-tight truncate">
                      {node.name}
                    </span>
                  </div>
                  <p className="text-[10.5px] text-slate-300 truncate">
                    {node.category}
                  </p>
                </div>

                {/* Live Metrics footer */}
                <div className="pt-2.5 mt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono">
                  <span className="text-slate-300">{node.latency}</span>
                  <span className={`font-semibold ${node.accentColor}`}>{node.throughput}</span>
                </div>

                {/* Subtle active indicator bar at bottom */}
                {isSelected && (
                  <div className="absolute inset-x-2 -bottom-[1px] h-0.5 bg-gradient-to-r from-teal-400 to-indigo-500 rounded-full" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Node Inspector Panel (Dynamic Details HUD) */}
      <div className="relative z-10 mt-4 rounded-xl border border-teal-500/20 bg-slate-900/70 p-4 transition-all duration-300 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800/90 border border-slate-700/70 ${activeNode.accentColor} shadow-md`}
            >
              <activeNode.icon className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">{activeNode.name}</h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/50">
                  {activeNode.category}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">{activeNode.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono shrink-0">
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-300 uppercase">Average Latency</span>
              <span className="font-bold text-teal-300">{activeNode.latency}</span>
            </div>
            <div className="h-6 w-[1px] bg-slate-800" />
            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-300 uppercase">Throughput Rate</span>
              <span className="font-bold text-indigo-300">{activeNode.throughput}</span>
            </div>
          </div>
        </div>

        {/* Technical specs pill list */}
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
          {activeNode.details.map((detail, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/50 border border-slate-800/60 text-[11px] text-slate-300 font-mono"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 shrink-0" />
              <span className="truncate">{detail}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
