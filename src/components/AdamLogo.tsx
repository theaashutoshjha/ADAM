import React from 'react';

interface AdamLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  subtext?: string;
}

export const AdamLogo: React.FC<AdamLogoProps> = ({
  size = 36,
  className = '',
  showText = false,
  subtext = 'Quantum Audio Audit EQ',
}) => {
  return (
    <div className={`flex items-center gap-3 select-none ${className}`}>
      {/* 3D Glossy Quantum Prism Logo Icon */}
      <div
        className="relative group shrink-0 cursor-pointer transition-transform duration-300 hover:scale-105 active:scale-95"
        style={{ width: size, height: size }}
      >
        {/* Ambient Neon Back-Glow */}
        <div
          className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-cyan-500/30 via-indigo-500/20 to-emerald-400/30 blur-md opacity-75 group-hover:opacity-100 transition-opacity"
        />

        {/* Vector SVG Emblem */}
        <svg
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative w-full h-full drop-shadow-[0_4px_12px_rgba(0,240,255,0.35)]"
        >
          <defs>
            <linearGradient id="logoRing" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00f0ff" />
              <stop offset="50%" stopColor="#3b82f6" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>

            <linearGradient id="logoObsidian" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#141a24" />
              <stop offset="50%" stopColor="#0b0e14" />
              <stop offset="100%" stopColor="#020407" />
            </linearGradient>

            <linearGradient id="logoGloss" x1="20%" y1="0%" x2="80%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
              <stop offset="35%" stopColor="#ffffff" stopOpacity="0.1" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="logoWave" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00f0ff" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#00f0ff" />
            </linearGradient>

            <filter id="logoGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Hexagonal Prism Base with Gloss Edge */}
          <polygon
            points="32,3 58,18 58,46 32,61 6,46 6,18"
            fill="url(#logoObsidian)"
            stroke="url(#logoRing)"
            strokeWidth="2.4"
          />

          {/* Inner Cyber Inset Chamfer */}
          <polygon
            points="32,6 54,19 54,44 32,57 10,44 10,19"
            stroke="#ffffff"
            strokeOpacity="0.16"
            strokeWidth="0.8"
          />

          {/* Gloss Top Specular Reflection */}
          <path
            d="M10 19 L32 6 L54 19 L46 24 L32 14 L18 24 Z"
            fill="url(#logoGloss)"
          />

          {/* Stylized Futuristic Delta 'A' */}
          <path
            d="M32 15 L45 43 L38 43 L34 34 L30 34 L26 43 L19 43 Z"
            fill="none"
            stroke="url(#logoRing)"
            strokeWidth="2.2"
            strokeLinejoin="round"
            filter="url(#logoGlow)"
          />

          {/* Center Diarization Wave Pulse */}
          <path
            d="M21 34 L43 34"
            stroke="url(#logoWave)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Central Pulse Core */}
          <circle cx="32" cy="27" r="2.8" fill="#00f0ff" filter="url(#logoGlow)" />
          <circle cx="32" cy="27" r="1.2" fill="#ffffff" />
        </svg>
      </div>

      {/* Typography Brand Block */}
      {showText && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-black text-sm tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-cyan-400 drop-shadow-[0_1px_4px_rgba(0,240,255,0.3)]">
              ADAM-AR
            </span>
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded-md bg-cyan-500/15 text-cyan-300 font-extrabold border border-cyan-400/30 tracking-tight">
              PRO
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium tracking-tight truncate">
            {subtext}
          </span>
        </div>
      )}
    </div>
  );
};
