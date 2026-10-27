import React, { useEffect, useRef, useState } from 'react';
import { Activity, Radio, Cpu, Sparkles, Volume2 } from 'lucide-react';

interface LiveAudioVisualizerProps {
  isActive?: boolean;
  barCount?: number;
  height?: number;
  variant?: 'cyan-emerald' | 'purple-cyan' | 'electric-blue';
  showTelemetry?: boolean;
  label?: string;
  className?: string;
}

export const LiveAudioVisualizer: React.FC<LiveAudioVisualizerProps> = ({
  isActive = true,
  barCount = 14,
  height = 24,
  variant = 'cyan-emerald',
  showTelemetry = true,
  label = 'AI DSP Telemetry',
  className = '',
}) => {
  const [bars, setBars] = useState<number[]>(() =>
    Array.from({ length: barCount }, () => Math.random() * 0.4 + 0.2)
  );

  const [peakCaps, setPeakCaps] = useState<number[]>(() =>
    Array.from({ length: barCount }, () => 0.5)
  );

  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let tick = 0;

    const updateSpectrum = () => {
      tick += 0.08;

      setBars((prev) =>
        prev.map((_, i) => {
          if (!isActive) return 0.08;
          // Harmonic wave simulation with pseudo-random acoustics
          const wave1 = Math.sin(tick * 1.8 + i * 0.45);
          const wave2 = Math.cos(tick * 2.4 - i * 0.3);
          const wave3 = Math.sin(tick * 0.9 + i * 0.8);
          const noise = Math.random() * 0.18;
          const energy = Math.abs(wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25) + noise;
          return Math.max(0.12, Math.min(1.0, energy));
        })
      );

      setPeakCaps((prev) =>
        prev.map((cap, i) => {
          const currentBar = bars[i] || 0.1;
          if (currentBar >= cap) return currentBar;
          return Math.max(0.1, cap - 0.025); // Slow gravity decay
        })
      );

      animFrameRef.current = requestAnimationFrame(updateSpectrum);
    };

    animFrameRef.current = requestAnimationFrame(updateSpectrum);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isActive, bars]);

  const getGradient = (normVal: number) => {
    if (variant === 'purple-cyan') {
      return normVal > 0.75
        ? 'from-pink-500 to-purple-400'
        : 'from-purple-600 to-cyan-400';
    }
    if (variant === 'electric-blue') {
      return normVal > 0.75
        ? 'from-cyan-300 to-blue-400'
        : 'from-blue-600 to-indigo-400';
    }
    // Default cyan-emerald
    return normVal > 0.75
      ? 'from-cyan-400 to-emerald-300'
      : 'from-blue-500 to-cyan-400';
  };

  return (
    <div
      className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#091124]/90 border border-cyan-500/25 shadow-[0_4px_16px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md select-none ${className}`}
    >
      {/* Live Pulsing Beacon Dot */}
      <span className="relative flex h-2 w-2 shrink-0">
        {isActive && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isActive
              ? 'bg-cyan-400 shadow-[0_0_8px_#00f0ff]'
              : 'bg-gray-600'
          }`}
        ></span>
      </span>

      {/* Animated Frequency Bars */}
      <div
        className="flex items-end gap-[2.5px] px-0.5"
        style={{ height: `${height}px` }}
      >
        {bars.map((val, idx) => {
          const barHeightPx = Math.max(3, Math.round(val * height));
          const peakHeightPx = Math.max(3, Math.round(peakCaps[idx] * height));

          return (
            <div
              key={idx}
              className="relative w-[3px] bg-slate-800/80 rounded-t-sm flex flex-col justify-end overflow-visible"
              style={{ height: `${height}px` }}
            >
              {/* Floating Peak Cap LED */}
              {isActive && (
                <div
                  className="absolute w-[3px] h-[1.5px] bg-white rounded-full transition-all duration-75 shadow-[0_0_4px_#ffffff]"
                  style={{
                    bottom: `${Math.min(height - 2, peakHeightPx)}px`,
                  }}
                />
              )}

              {/* Glowing Dynamic Bar */}
              <div
                className={`w-full rounded-t-sm bg-gradient-to-t ${getGradient(
                  val
                )} transition-all duration-75 ease-out shadow-[0_0_6px_rgba(0,240,255,0.4)]`}
                style={{ height: `${barHeightPx}px` }}
              />
            </div>
          );
        })}
      </div>

      {/* Telemetry Label */}
      {showTelemetry && (
        <div className="flex flex-col pl-1 border-l border-white/10 leading-none">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-cyan-300 flex items-center gap-1">
            <Radio size={9} className="text-cyan-400 animate-pulse" />
            {label}
          </span>
          <span className="text-[8px] font-mono text-gray-400 tracking-tight mt-0.5">
            Nova-3 · 8kHz DSP
          </span>
        </div>
      )}
    </div>
  );
};
