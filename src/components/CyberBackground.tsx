import React from 'react';

/**
 * CyberBackground: Ultra-clean static obsidian background.
 * All animations removed per user instruction.
 */
export const CyberBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#060b18]"
    >
      {/* Subtle static gradient glow rings without any motion */}
      <div className="absolute -top-40 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-40 w-[450px] h-[450px] bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 left-1/3 w-[550px] h-[550px] bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />
    </div>
  );
};
