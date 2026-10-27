import React, { useRef, useMemo } from 'react';
import { Volume2, Activity, Play, Pause } from 'lucide-react';

interface AudioWaveformProps {
  duration: number;
  currentTime: number;
  isPlaying?: boolean;
  onSeek: (time: number) => void;
  height?: number;
  barCount?: number;
  className?: string;
  seed?: number;
}

export const AudioWaveformVisualizer: React.FC<AudioWaveformProps> = ({
  duration = 60,
  currentTime = 0,
  isPlaying = false,
  onSeek,
  height = 54,
  barCount = 70,
  className = '',
  seed = 42,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Generate deterministic synthetic waveform peaks with dual-speaker separation
  const bars = useMemo(() => {
    const list: Array<{ advisorHeight: number; clientHeight: number; speaker: 'advisor' | 'client' | 'silence' }> = [];
    let state = seed;
    const pseudoRand = () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };

    for (let i = 0; i < barCount; i++) {
      const positionNorm = i / barCount;
      // Dialogue turn simulation (Advisor speaks 0-35%, Client 35-65%, Advisor 65-100%)
      const isAdvisor = positionNorm < 0.35 || positionNorm > 0.65;
      const r = pseudoRand();
      const wave = Math.sin(positionNorm * Math.PI * 8) * 0.35 + 0.65;
      const energy = Math.max(0.12, Math.min(1.0, r * wave));

      list.push({
        advisorHeight: isAdvisor ? energy : pseudoRand() * 0.15,
        clientHeight: !isAdvisor ? energy : pseudoRand() * 0.15,
        speaker: energy < 0.15 ? 'silence' : isAdvisor ? 'advisor' : 'client',
      });
    }
    return list;
  }, [barCount, seed]);

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container || duration <= 0) return;

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const progress = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(progress * duration);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onClick={handleSeekClick}
      className={`relative w-full rounded-xl bg-[#081024]/90 border border-cyan-500/25 p-2.5 cursor-pointer group select-none shadow-inner ${className}`}
      style={{ height: `${height + 24}px` }}
      title="Click anywhere to jump/seek audio timestamp"
    >
      {/* Decibel & Speaker Legend */}
      <div className="flex items-center justify-between text-[9px] font-mono text-gray-400 mb-1 leading-none">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-cyan-300 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            Advisor Channel
          </span>
          <span className="flex items-center gap-1 text-purple-300 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
            Client Channel
          </span>
        </div>
        <span className="text-gray-500">8kHz Telephony Waveform · 16-bit PCM</span>
      </div>

      {/* Waveform Bars Container */}
      <div className="relative w-full flex items-center justify-between gap-[1.5px]" style={{ height: `${height}px` }}>
        {bars.map((bar, idx) => {
          const barProgress = (idx / barCount) * 100;
          const isPlayed = barProgress <= progressPercent;

          const barHeightPx = Math.max(4, Math.round((bar.speaker === 'advisor' ? bar.advisorHeight : bar.clientHeight) * height));

          let barBg = 'bg-slate-700/60';
          if (isPlayed) {
            barBg =
              bar.speaker === 'advisor'
                ? 'bg-gradient-to-t from-cyan-600 to-cyan-300 shadow-[0_0_6px_rgba(0,240,255,0.5)]'
                : 'bg-gradient-to-t from-purple-600 to-purple-300 shadow-[0_0_6px_rgba(168,85,247,0.5)]';
          } else {
            barBg =
              bar.speaker === 'advisor'
                ? 'bg-cyan-950/70 border-t border-cyan-500/30'
                : 'bg-purple-950/70 border-t border-purple-500/30';
          }

          return (
            <div
              key={idx}
              className="flex-1 rounded-sm transition-all duration-75 flex flex-col justify-center"
              style={{ height: `${height}px` }}
            >
              <div
                className={`w-full rounded-sm transition-all ${barBg} ${
                  isPlaying && isPlayed ? 'animate-pulse' : ''
                }`}
                style={{ height: `${barHeightPx}px` }}
              />
            </div>
          );
        })}

        {/* Live Playhead Scrubber Line */}
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-white shadow-[0_0_12px_#00f0ff] pointer-events-none transition-all duration-75"
          style={{ left: `${Math.min(100, progressPercent)}%` }}
        >
          {/* Top Playhead Diamond / Bulb */}
          <div className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-cyan-400 rounded-full border-2 border-white shadow-[0_0_8px_#00f0ff]" />
        </div>
      </div>
    </div>
  );
};
