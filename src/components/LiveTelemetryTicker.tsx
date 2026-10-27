import React from 'react';
import {
  Activity,
  Radio,
  Cpu,
  CheckCircle2,
  Volume2,
} from 'lucide-react';

interface TelemetryItem {
  id: string;
  label: string;
  value: string;
  status: 'optimal' | 'active' | 'synced';
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

/**
 * LiveTelemetryTicker: Crisp static HUD telemetry bar.
 * Animations removed per user instruction.
 */
export const LiveTelemetryTicker: React.FC<{ className?: string }> = ({ className = '' }) => {
  const telemetryItems: TelemetryItem[] = [
    {
      id: 'dg-nova',
      label: 'Deepgram Nova-3 ASR',
      value: 'Multi-Lingual DSP Active',
      status: 'optimal',
      icon: Cpu,
    },
    {
      id: 'tata-sip',
      label: 'Tata CloudPhone SIP',
      value: 'Trunks Connected',
      status: 'active',
      icon: Radio,
    },
    {
      id: 'preorder-parity',
      label: 'Regulatory Isolation',
      value: 'Zero Cross-Workspace Collision',
      status: 'synced',
      icon: CheckCircle2,
    },
    {
      id: 'audio-dsp',
      label: 'Telephony DSP',
      value: 'Noise Filter Active',
      status: 'optimal',
      icon: Volume2,
    },
    {
      id: 'diarization',
      label: 'Acoustic Diarization',
      value: 'Speaker Attributed',
      status: 'active',
      icon: Activity,
    },
  ];

  return (
    <div
      className={`h-9 bg-[#070e22] border-b border-[#162344] flex items-center px-4 overflow-x-auto no-scrollbar gap-6 select-none shrink-0 ${className}`}
    >
      {/* Live Badge */}
      <div className="flex items-center gap-2 pr-3 border-r border-[#1a2c56] shrink-0">
        <span className="w-2 h-2 rounded-full bg-cyan-400" />
        <span className="text-[10px] font-mono font-bold tracking-widest text-cyan-400 uppercase">
          TELEMETRY
        </span>
      </div>

      {/* Static Crisp Status Items */}
      <div className="flex items-center gap-6 whitespace-nowrap">
        {telemetryItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="inline-flex items-center gap-2 text-xs"
            >
              <div className="w-4 h-4 rounded-md bg-[#0f1d3f] border border-cyan-500/30 flex items-center justify-center text-cyan-300 shrink-0">
                <Icon size={10} />
              </div>
              <span className="text-[10px] font-bold text-gray-300 font-sans tracking-tight">
                {item.label}:
              </span>
              <span className="text-[10px] font-mono font-bold text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded border border-cyan-500/25">
                {item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
