import React, { useEffect, useState } from 'react';

interface AnimatedMetricRingProps {
  value: number; // 0 to 100
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  colorScheme?: 'teal' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'cyan';
  animateOnMount?: boolean;
}

export const AnimatedMetricRing: React.FC<AnimatedMetricRingProps> = ({
  value,
  size = 110,
  strokeWidth = 9,
  label,
  sublabel,
  colorScheme = 'teal',
  animateOnMount = true,
}) => {
  const [currentProgress, setCurrentProgress] = useState(animateOnMount ? 0 : value);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const duration = 1200;
    const initialProgress = currentProgress;
    const targetProgress = Math.min(100, Math.max(0, value));

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // Cubic ease-out
      const easeOut = 1 - Math.pow(1 - progress, 3);
      setCurrentProgress(initialProgress + (targetProgress - initialProgress) * easeOut);

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    const reqId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(reqId);
  }, [value]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (currentProgress / 100) * circumference;

  const colorConfigs = {
    teal: {
      gradient: ['#14b8a6', '#06b6d4'],
      glow: 'drop-shadow(0 0 8px rgba(20, 184, 166, 0.45))',
      textColor: 'text-teal-400',
      track: '#134e4a25',
    },
    indigo: {
      gradient: ['#6366f1', '#a855f7'],
      glow: 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.45))',
      textColor: 'text-indigo-400',
      track: '#312e8125',
    },
    emerald: {
      gradient: ['#10b981', '#34d399'],
      glow: 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.45))',
      textColor: 'text-emerald-400',
      track: '#064e3b25',
    },
    amber: {
      gradient: ['#f59e0b', '#fbbf24'],
      glow: 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.45))',
      textColor: 'text-amber-400',
      track: '#78350f25',
    },
    rose: {
      gradient: ['#f43f5e', '#fb7185'],
      glow: 'drop-shadow(0 0 8px rgba(244, 63, 94, 0.45))',
      textColor: 'text-rose-400',
      track: '#88133725',
    },
    cyan: {
      gradient: ['#06b6d4', '#38bdf8'],
      glow: 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.45))',
      textColor: 'text-cyan-400',
      track: '#164e6325',
    },
  };

  const scheme = colorConfigs[colorScheme] || colorConfigs.teal;
  const gradId = `ring-grad-${colorScheme}-${size}`;

  return (
    <div className="flex flex-col items-center justify-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={scheme.gradient[0]} />
              <stop offset="100%" stopColor={scheme.gradient[1]} />
            </linearGradient>
          </defs>

          {/* Background track circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={scheme.track}
            strokeWidth={strokeWidth}
            fill="transparent"
          />

          {/* Animated active progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={`url(#${gradId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            fill="transparent"
            style={{
              transition: 'stroke-dashoffset 0.05s linear',
              filter: scheme.glow,
            }}
          />
        </svg>

        {/* Center Percentage Display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className={`text-base font-extrabold font-mono tracking-tight ${scheme.textColor}`}>
            {Math.round(currentProgress)}%
          </span>
          {sublabel && <span className="text-[9px] font-mono text-slate-300 uppercase">{sublabel}</span>}
        </div>
      </div>

      {label && <span className="mt-2 text-xs font-semibold text-slate-200">{label}</span>}
    </div>
  );
};
