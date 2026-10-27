import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  X,
  Maximize2,
  Minimize2,
  Headset,
  User,
  Sparkles,
  FileText,
} from 'lucide-react';
import { getStoredToken } from '../lib/api';
import { LiveAudioVisualizer } from './LiveAudioVisualizer';

export interface ActiveAudioCall {
  callId: number;
  callerId?: string;
  clientCode?: string;
  advisorName?: string;
  date?: string;
  time?: string;
  transcript?: string;
  segments?: Array<{
    start_time: number;
    end_time: number;
    speaker?: string;
    text: string;
  }>;
}

interface AudioPlayerContextType {
  activeCall: ActiveAudioCall | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playCall: (call: ActiveAudioCall) => void;
  pauseCall: () => void;
  resumeCall: () => void;
  seekCall: (time: number) => void;
  closePlayer: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType>({
  activeCall: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playCall: () => {},
  pauseCall: () => {},
  resumeCall: () => {},
  seekCall: () => {},
  closePlayer: () => {},
});

export const useAudioPlayer = () => useContext(AudioPlayerContext);

export const AudioPlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCall, setActiveCall] = useState<ActiveAudioCall | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getAudioUrl = (callId: number) => {
    const token = getStoredToken();
    return `/api/calls/${callId}/audio${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  };

  const playCall = (call: ActiveAudioCall) => {
    setActiveCall(call);
    setCurrentTime(0);
    setIsPlaying(true);
  };

  const pauseCall = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const resumeCall = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const seekCall = (time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setActiveCall(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setIsExpanded(false);
  };

  const formatSeconds = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Find active subtitle sentence/phrase based on currentTime
  const currentSubtitle = React.useMemo(() => {
    if (!activeCall) return null;

    if (activeCall.segments && activeCall.segments.length > 0) {
      const match = activeCall.segments.find(
        (s) => currentTime >= s.start_time && currentTime <= (s.end_time || s.start_time + 4)
      );
      if (match) {
        return {
          speaker: (match.speaker || 'UNKNOWN').toUpperCase().includes('ADVISOR') ? 'ADVISOR' : 'CLIENT',
          text: match.text,
          startTime: match.start_time,
          endTime: match.end_time,
        };
      }
    }

    if (activeCall.transcript) {
      const lines = activeCall.transcript.split('\n').map((l) => l.trim()).filter(Boolean);
      const estIdx = Math.min(lines.length - 1, Math.floor(currentTime / 5));
      const line = lines[estIdx];
      if (line) {
        const isAdv = /^(?:advisor|dealer|agent|a):/i.test(line);
        const clean = line.replace(/^\[?\d{1,2}:\d{2}\]?\s*(?:(?:advisor|dealer|agent|client|customer):)?\s*/i, '');
        return {
          speaker: isAdv ? 'ADVISOR' : 'CLIENT',
          text: clean,
          startTime: estIdx * 5,
          endTime: (estIdx + 1) * 5,
        };
      }
    }

    return null;
  }, [activeCall, currentTime]);

  return (
    <AudioPlayerContext.Provider
      value={{
        activeCall,
        isPlaying,
        currentTime,
        duration,
        playCall,
        pauseCall,
        resumeCall,
        seekCall,
        closePlayer,
      }}
    >
      {children}

      {/* Persistent Global Floating Audio Dock */}
      {activeCall && (
        <div className="fixed bottom-4 left-4 right-4 md:left-64 md:right-8 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
          <audio
            ref={audioRef}
            src={getAudioUrl(activeCall.callId)}
            autoPlay
            onTimeUpdate={() => {
              if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
            }}
            onLoadedMetadata={() => {
              if (audioRef.current) setDuration(audioRef.current.duration);
            }}
            onEnded={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />

          <div className="bg-[#12161F]/95 backdrop-blur-xl border border-teal-500/40 rounded-2xl shadow-2xl shadow-black/80 p-3 sm:p-4 text-white">
            {/* Live Cinema Subtitle Display (Every word highlighted) */}
            {currentSubtitle && (
              <div className="mb-2 px-3 py-1.5 bg-[#0D1117]/90 border border-teal-500/30 rounded-xl flex items-center justify-between gap-3 text-xs shadow-inner">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 uppercase tracking-wider ${
                      currentSubtitle.speaker === 'ADVISOR'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {currentSubtitle.speaker === 'ADVISOR' ? 'Advisor' : 'Client'}
                  </span>

                  {/* Word-level dynamic pacing glow */}
                  <div className="truncate text-gray-200 font-sans text-xs">
                    {(() => {
                      const words = currentSubtitle.text.split(' ');
                      const durationSeg = Math.max(1, currentSubtitle.endTime - currentSubtitle.startTime);
                      const progress = Math.max(0, Math.min(1, (currentTime - currentSubtitle.startTime) / durationSeg));
                      const activeWordIdx = Math.floor(progress * words.length);

                      return words.map((w, wIdx) => {
                        const isSpoken = wIdx <= activeWordIdx;
                        const isCurrentWord = wIdx === activeWordIdx;

                        return (
                          <span
                            key={wIdx}
                            className={`inline-block mr-1 transition-all duration-150 ${
                              isCurrentWord
                                ? 'text-amber-300 font-bold scale-110 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)] underline decoration-amber-400'
                                : isSpoken
                                ? 'text-white font-medium'
                                : 'text-gray-500'
                            }`}
                          >
                            {w}
                          </span>
                        );
                      });
                    })()}
                  </div>
                </div>

                <div className="text-[10px] font-mono text-teal-400 shrink-0 flex items-center gap-1">
                  <Sparkles size={11} className="text-amber-300 animate-pulse" />
                  <span>LIVE SUBTITLE</span>
                </div>
              </div>
            )}

            {/* Playback Controls & Scrubber */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {/* Call Details Badge */}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-300 shrink-0">
                  <Headset size={18} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white truncate">
                      {activeCall.callerId || `Call #${activeCall.callId}`}
                    </span>
                    {activeCall.clientCode && (
                      <span className="px-1.5 py-0.2 rounded bg-cyan-950/80 border border-cyan-500/30 text-[10px] font-mono text-cyan-300 font-bold">
                        {activeCall.clientCode}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {activeCall.advisorName ? `Advisor: ${activeCall.advisorName}` : 'Call Audio'}
                    {activeCall.date ? ` · ${activeCall.date}` : ''}
                    {activeCall.time ? ` ${activeCall.time}` : ''}
                  </div>
                </div>
              </div>

              {/* Scrubber & Central Buttons */}
              <div className="flex-1 max-w-xl w-full flex items-center gap-3">
                <span className="text-[11px] font-mono text-gray-400 w-10 text-right">
                  {formatSeconds(currentTime)}
                </span>

                <div className="relative flex-1 group">
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => seekCall(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-teal-400 group-hover:h-2 transition-all"
                  />
                </div>

                <span className="text-[11px] font-mono text-gray-400 w-10">
                  {formatSeconds(duration)}
                </span>
              </div>

              {/* Action Buttons & Live Visualizer */}
              <div className="flex items-center gap-2.5 shrink-0">
                <LiveAudioVisualizer
                  isActive={isPlaying}
                  barCount={10}
                  height={18}
                  variant="electric-blue"
                  showTelemetry={false}
                  className="hidden lg:inline-flex py-1 px-2"
                />

                <button
                  onClick={() => seekCall(Math.max(0, currentTime - 5))}
                  className="p-1.5 text-gray-400 hover:text-white transition-colors"
                  title="Rewind 5 seconds"
                >
                  <RotateCcw size={14} />
                </button>

                <button
                  onClick={() => (isPlaying ? pauseCall() : resumeCall())}
                  className="w-8 h-8 rounded-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold flex items-center justify-center shadow-lg shadow-teal-500/30 transition-all hover:scale-105 active:scale-95"
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
                </button>

                <button
                  onClick={() => seekCall(Math.min(duration, currentTime + 5))}
                  className="p-1.5 text-gray-400 hover:text-white transition-colors"
                  title="Forward 5 seconds"
                >
                  <RotateCw size={14} />
                </button>

                {/* Speed Toggle */}
                <button
                  onClick={() => {
                    const speeds = [1, 1.25, 1.5, 2];
                    const next = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
                    setPlaybackRate(next);
                    if (audioRef.current) audioRef.current.playbackRate = next;
                  }}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-teal-300 font-mono text-[10px] rounded-lg border border-gray-700 font-bold"
                  title="Change playback speed"
                >
                  {playbackRate}x
                </button>

                {/* Mute Toggle */}
                <button
                  onClick={() => {
                    if (audioRef.current) {
                      audioRef.current.muted = !isMuted;
                      setIsMuted(!isMuted);
                    }
                  }}
                  className="p-1.5 text-gray-400 hover:text-white transition-colors"
                >
                  {isMuted ? <VolumeX size={15} className="text-rose-400" /> : <Volume2 size={15} />}
                </button>

                {/* Expand / Minimize Subtitle Drawer */}
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1.5 text-gray-400 hover:text-teal-300 transition-colors"
                  title={isExpanded ? 'Minimize Subtitles' : 'Expand Full Subtitle Transcript'}
                >
                  {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                </button>

                {/* Close Player */}
                <button
                  onClick={closePlayer}
                  className="p-1.5 text-gray-400 hover:text-rose-400 transition-colors ml-1"
                  title="Close audio player"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Expanded Full Subtitle Drawer */}
            {isExpanded && activeCall.transcript && (
              <div className="mt-3 pt-3 border-t border-gray-800 max-h-60 overflow-y-auto space-y-2 text-xs">
                <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono mb-1">
                  <span>Interactive Subtitle Timeline (Click any line to seek):</span>
                  <span className="text-teal-400">Audio Sync Active</span>
                </div>

                {activeCall.segments && activeCall.segments.length > 0 ? (
                  activeCall.segments.map((seg, idx) => {
                    const isSegActive = currentTime >= seg.start_time && currentTime <= seg.end_time;
                    const isAdv = (seg.speaker || '').toUpperCase().includes('ADVISOR');

                    return (
                      <div
                        key={idx}
                        onClick={() => seekCall(seg.start_time)}
                        className={`p-2 rounded-xl border transition-all cursor-pointer ${
                          isSegActive
                            ? 'bg-teal-500/20 border-teal-400 text-white shadow-lg shadow-teal-500/20 ring-1 ring-teal-400'
                            : 'bg-[#0D1117]/80 border-gray-800 hover:border-gray-700 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] mb-1 font-mono text-gray-400">
                          <span className={isAdv ? 'text-indigo-400 font-bold' : 'text-emerald-400 font-bold'}>
                            {isAdv ? 'Advisor' : 'Client'}
                          </span>
                          <span>{formatSeconds(seg.start_time)}</span>
                        </div>
                        <p className={isSegActive ? 'text-amber-200 font-medium' : ''}>{seg.text}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 bg-[#0D1117] rounded-xl text-gray-300 whitespace-pre-wrap leading-relaxed font-mono text-xs">
                    {activeCall.transcript}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </AudioPlayerContext.Provider>
  );
};
