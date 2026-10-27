import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';

interface ComplianceRadarProps {
  scores: {
    q1: number; // 0 to 100
    q2: number;
    q3: number;
    q4: number;
    q5: number;
  };
  size?: number;
  className?: string;
}

export const ComplianceRadarChart: React.FC<ComplianceRadarProps> = ({
  scores,
  size = 320,
  className = '',
}) => {
  const [hoveredAxis, setHoveredAxis] = useState<number | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const maxRadius = size * 0.38;

  const axes = [
    { id: 'q1', label: 'Q1: Number Match', desc: 'Registered Phone Match', fatal: true, val: scores.q1 },
    { id: 'q2', label: 'Q2: Pre-Order Time', desc: 'Timing Prior to Trade', fatal: true, val: scores.q2 },
    { id: 'q3', label: 'Q3: Script/Qty/Price', desc: 'Financial Parameters', fatal: false, val: scores.q3 },
    { id: 'q4', label: 'Q4: Customer Ack', desc: 'Verbal Authorization', fatal: false, val: scores.q4 },
    { id: 'q5', label: 'Q5: Return Guarantee', desc: 'Zero Return Commitment', fatal: true, val: scores.q5 },
  ];

  const totalAxes = 5;

  const getCoordinates = (axisIndex: number, radius: number) => {
    // Start at top (-PI/2) and rotate clockwise
    const angle = -Math.PI / 2 + (axisIndex * 2 * Math.PI) / totalAxes;
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
      angle,
    };
  };

  // Concentric polygon grids (20%, 40%, 60%, 80%, 100%)
  const gridRings = [0.2, 0.4, 0.6, 0.8, 1.0];

  // Data polygon points
  const dataPoints = axes.map((axis, i) => {
    const r = (Math.max(5, Math.min(100, axis.val)) / 100) * maxRadius;
    return getCoordinates(i, r);
  });

  const polygonPath = dataPoints.map((pt) => `${pt.x},${pt.y}`).join(' ');

  return (
    <div className={`relative flex flex-col items-center justify-center p-3 select-none ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
        <defs>
          {/* Glowing Radial Gradient for Data Polygon */}
          <radialGradient id="radarGlowGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.6" />
            <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.1" />
          </radialGradient>

          {/* Glowing Filter */}
          <filter id="radarShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 1. Concentric Guide Pentagon Rings */}
        {gridRings.map((scale, ringIdx) => {
          const ringPts = Array.from({ length: totalAxes }).map((_, i) => {
            const { x, y } = getCoordinates(i, maxRadius * scale);
            return `${x},${y}`;
          });
          return (
            <polygon
              key={`ring-${ringIdx}`}
              points={ringPts.join(' ')}
              fill="none"
              stroke={ringIdx === gridRings.length - 1 ? 'rgba(0, 240, 255, 0.28)' : 'rgba(255, 255, 255, 0.05)'}
              strokeWidth={ringIdx === gridRings.length - 1 ? '1.5' : '1'}
              strokeDasharray={ringIdx < gridRings.length - 1 ? '3 3' : undefined}
            />
          );
        })}

        {/* 2. Radial Axis Spokes */}
        {axes.map((_, i) => {
          const outer = getCoordinates(i, maxRadius);
          return (
            <line
              key={`spoke-${i}`}
              x1={cx}
              y1={cy}
              x2={outer.x}
              y2={outer.y}
              stroke="rgba(0, 240, 255, 0.15)"
              strokeWidth="1"
            />
          );
        })}

        {/* 3. Filled Compliance Data Polygon with Animated Morphing */}
        <polygon
          points={polygonPath}
          fill="url(#radarGlowGradient)"
          stroke="#00f0ff"
          strokeWidth="2.5"
          filter="url(#radarShadow)"
          className="transition-all duration-700 ease-out"
        />

        {/* 4. Interactive Vertex Nodes */}
        {dataPoints.map((pt, i) => {
          const axis = axes[i];
          const isHovered = hoveredAxis === i;
          return (
            <g
              key={`point-${i}`}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredAxis(i)}
              onMouseLeave={() => setHoveredAxis(null)}
            >
              {/* Outer Pulsing Halo */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 9 : 6}
                fill={axis.val >= 80 ? '#10b981' : axis.val >= 60 ? '#f59e0b' : '#f43f5e'}
                opacity={isHovered ? 0.9 : 0.4}
                className="transition-all duration-200"
              />
              {/* Inner Solid Core */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isHovered ? 4.5 : 3}
                fill="#ffffff"
                className="transition-all duration-200"
              />
            </g>
          );
        })}

        {/* 5. Axis Labels around the Perimeter */}
        {axes.map((axis, i) => {
          const labelPos = getCoordinates(i, maxRadius + 28);
          const isHovered = hoveredAxis === i;

          return (
            <g
              key={`label-${i}`}
              className="cursor-pointer"
              onMouseEnter={() => setHoveredAxis(i)}
              onMouseLeave={() => setHoveredAxis(null)}
            >
              <text
                x={labelPos.x}
                y={labelPos.y - 4}
                textAnchor="middle"
                className={`text-[10px] font-bold transition-all duration-150 ${
                  isHovered ? 'fill-cyan-300 scale-105' : 'fill-gray-300'
                }`}
              >
                {axis.label.split(':')[0]}
              </text>
              <text
                x={labelPos.x}
                y={labelPos.y + 8}
                textAnchor="middle"
                className={`text-[9px] font-mono font-bold transition-all duration-150 ${
                  axis.val >= 80
                    ? 'fill-emerald-400'
                    : axis.val >= 50
                    ? 'fill-amber-400'
                    : 'fill-rose-400'
                }`}
              >
                {axis.val}%
              </text>
            </g>
          );
        })}
      </svg>

      {/* Hover Information Badge */}
      <div className="h-6 flex items-center justify-center mt-1">
        {hoveredAxis !== null ? (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#091533] border border-cyan-500/40 text-[11px] font-medium text-white shadow-lg animate-in fade-in zoom-in-95 duration-150">
            <span className="font-bold text-cyan-300">{axes[hoveredAxis].label}</span>
            <span className="text-gray-400">•</span>
            <span>{axes[hoveredAxis].desc}</span>
            <span className="text-gray-400">•</span>
            <span
              className={`font-mono font-bold ${
                axes[hoveredAxis].val >= 80 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {axes[hoveredAxis].val}% Pass Rate
            </span>
            {axes[hoveredAxis].fatal && (
              <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-mono text-[9px] font-bold">
                FATAL MANDATE
              </span>
            )}
          </div>
        ) : (
          <span className="text-[10px] text-gray-500 font-medium">
            Hover over pentagon axes to inspect SEBI parameter performance
          </span>
        )}
      </div>
    </div>
  );
};
