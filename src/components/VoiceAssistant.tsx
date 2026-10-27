import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Command,
  X,
  Play,
  RotateCcw,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Maximize2,
  Minimize2,
  Send,
  Radio,
  Activity,
  Layers,
  ChevronRight,
  Shield,
  Bot,
  Zap,
} from 'lucide-react';
import type { ActiveTab, PipelineStats, ScorecardRecord } from '../types';

interface VoiceAssistantProps {
  onNavigate: (tab: ActiveTab) => void;
  onStartPipeline?: () => void;
  onRefresh?: () => void;
  onOpenSendModal?: () => void;
  onSearch?: (query: string) => void;
  stats?: PipelineStats | null;
  scorecards?: ScorecardRecord[];
  currentTab?: ActiveTab;
  isOpenControlled?: boolean;
  onToggleOpen?: () => void;
}

interface CommandLog {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  actionExecuted?: string;
  timestamp: string;
}

// Web Audio API Synthesizer Chimes (Failsafe Instant Audio Feedback)
function playSciFiChime(type: 'activate' | 'success' | 'speak' = 'activate') {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'activate') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.start(now);
      osc.stop(now + 0.35);
    } else if (type === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880, now + 0.1);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.start(now);
      osc.stop(now + 0.28);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  } catch (_) {}
}

export const VoiceAssistant: React.FC<VoiceAssistantProps> = ({
  onNavigate,
  onStartPipeline,
  onRefresh,
  onOpenSendModal,
  onSearch,
  stats,
  scorecards = [],
  currentTab = 'dashboard',
  isOpenControlled,
  onToggleOpen,
}) => {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = isOpenControlled !== undefined ? isOpenControlled : internalOpen;
  const setIsOpen = (val: boolean) => {
    if (onToggleOpen && val !== isOpen) onToggleOpen();
    setInternalOpen(val);
  };

  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [hasActivatedAudio, setHasActivatedAudio] = useState(false);
  const [lastAction, setLastAction] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isListeningRef = useRef(false);

  const [logs, setLogs] = useState<CommandLog[]>([
    {
      id: 'init',
      sender: 'assistant',
      text: 'Adam AI Voice Assistant online. Tap "Talk to Adam" or say "Adam, run pipeline" / "Adam, how many calls?" to converse and execute tasks.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  // Ensure speech synthesis voices are loaded properly across browsers
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const loadVoices = () => {
        try {
          window.speechSynthesis.getVoices();
        } catch (_) {}
      };
      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }, []);
  const speak = useCallback((text: string) => {
    if (isMuted) return;
    playSciFiChime('speak');

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('SpeechSynthesis not available in this browser environment');
      return;
    }

    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      // Pick crisp modern voice
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find(
          (v) =>
            (v.name.includes('Natural') ||
              v.name.includes('Google') ||
              v.name.includes('Samantha') ||
              v.name.includes('David') ||
              v.name.includes('George')) &&
            v.lang.startsWith('en')
        ) || voices.find((v) => v.lang.startsWith('en'));

      if (preferred) utterance.voice = preferred;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Speech synthesis error:', err);
      setIsSpeaking(false);
    }
  }, [isMuted]);

  // Conversational AI & Task Execution Matrix for Adam
  const handleConversationAndCommands = useCallback((rawText: string) => {
    const text = rawText.toLowerCase().trim();
    if (!text) return;

    const cleanPrompt = text
      .replace(/^(hey|hi|hello|ok|okay)?\s*adam\b[,:\s]*/i, '')
      .replace(/\badam\b[,:\s]*/i, '')
      .trim();

    const userLog: CommandLog = {
      id: String(Date.now()),
      sender: 'user',
      text: rawText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    let reply = '';
    let actionExecuted = '';

    // Dynamic metrics
    const totalCalls = stats?.calls ?? 0;
    const scoredCalls = stats?.scored ?? scorecards.length;
    const preOrders = stats?.pre_orders_count ?? 0;
    const failedCalls = stats?.failed ?? scorecards.filter((s) => s.is_fatal || s.score === 0).length;
    const fatalCalls = scorecards.filter((s) => s.is_fatal).length;
    const complianceRate = scoredCalls > 0 ? Math.round(((scoredCalls - failedCalls) / scoredCalls) * 100) : 0;

    // 1. RUN PIPELINE
    if (
      cleanPrompt.includes('run pipeline') ||
      cleanPrompt.includes('start pipeline') ||
      cleanPrompt.includes('execute pipeline') ||
      cleanPrompt.includes('run audit') ||
      cleanPrompt.includes('start audit') ||
      cleanPrompt.includes('audit calls')
    ) {
      if (onStartPipeline) {
        onStartPipeline();
        reply = 'Initiating compliance pipeline now. Audio pre-filter DSP and Deepgram Nova 3 transcription are processing all calls.';
        actionExecuted = 'Triggered Audit Pipeline';
      } else {
        reply = 'Pipeline trigger is not available on this screen.';
      }
    }
    // 2. DASHBOARD
    else if (
      cleanPrompt.includes('dashboard') ||
      cleanPrompt.includes('go home') ||
      cleanPrompt.includes('main screen')
    ) {
      onNavigate('dashboard');
      reply = 'Opening Operations Dashboard.';
      actionExecuted = 'Opened Dashboard';
    }
    // 3. LIVE PIPELINE
    else if (
      cleanPrompt.includes('live pipeline') ||
      cleanPrompt.includes('pipeline status') ||
      cleanPrompt.includes('show pipeline')
    ) {
      onNavigate('pipeline');
      reply = 'Navigating to Live Pipeline monitor.';
      actionExecuted = 'Opened Live Pipeline';
    }
    // 4. CALL EXPLORER
    else if (
      cleanPrompt.includes('call explorer') ||
      cleanPrompt.includes('show calls') ||
      cleanPrompt.includes('view calls') ||
      cleanPrompt.includes('transcripts')
    ) {
      onNavigate('calls');
      reply = 'Opening Call Explorer and audio transcripts.';
      actionExecuted = 'Opened Call Explorer';
    }
    // 5. TRADE MATCHING
    else if (
      cleanPrompt.includes('trade match') ||
      cleanPrompt.includes('matching') ||
      cleanPrompt.includes('trades')
    ) {
      onNavigate('matching');
      reply = 'Opening Trade Matching and execution correlation.';
      actionExecuted = 'Opened Trade Matching';
    }
    // 6. SCORECARDS
    else if (
      cleanPrompt.includes('scorecard') ||
      cleanPrompt.includes('scorecards') ||
      cleanPrompt.includes('q1 to q5')
    ) {
      onNavigate('scorecards');
      reply = 'Displaying Q1 to Q5 Compliance Scorecards.';
      actionExecuted = 'Opened Scorecards';
    }
    // 7. ADVISORS
    else if (
      cleanPrompt.includes('advisor') ||
      cleanPrompt.includes('dealers') ||
      cleanPrompt.includes('top advisor')
    ) {
      onNavigate('advisors');
      reply = 'Displaying Advisor Performance rankings and compliance rates.';
      actionExecuted = 'Opened Advisor Performance';
    }
    // 8. REPORTS
    else if (
      cleanPrompt.includes('report') ||
      cleanPrompt.includes('download report') ||
      cleanPrompt.includes('insights')
    ) {
      onNavigate('reports');
      reply = 'Navigating to Compliance Insights & Automated SEBI Reports.';
      actionExecuted = 'Opened Reports';
    }
    // 9. INGESTION
    else if (
      cleanPrompt.includes('ingest') ||
      cleanPrompt.includes('upload calls') ||
      cleanPrompt.includes('auto download')
    ) {
      onNavigate('ingestion_hub');
      reply = 'Opening Call Ingestion & Auto-Download Workspace.';
      actionExecuted = 'Opened Ingestion Workspace';
    }
    // 10. SYSTEM STATUS / AUDIT SUMMARY
    else if (
      cleanPrompt.includes('status') ||
      cleanPrompt.includes('summary') ||
      cleanPrompt.includes('how many calls') ||
      cleanPrompt.includes('compliance score') ||
      cleanPrompt.includes('tell me stats')
    ) {
      if (totalCalls === 0) {
        reply = 'There are currently zero calls loaded in the database. Ingest audio files or execute the pipeline to start pre-order compliance analysis.';
      } else {
        reply = `System Telemetry: ${totalCalls} total calls tracked, ${preOrders} pre-order calls, and ${scoredCalls} audited. The overall compliance rate is ${complianceRate} percent with ${failedCalls} calls flagged for review and ${fatalCalls} fatal violations.`;
      }
      actionExecuted = 'Provided Real-time Telemetry Summary';
    }
    // 11. FATAL CALLS INQUIRY
    else if (
      cleanPrompt.includes('fatal') ||
      cleanPrompt.includes('violations') ||
      cleanPrompt.includes('failed calls')
    ) {
      if (fatalCalls > 0) {
        reply = `Alert: There are ${fatalCalls} fatal compliance violations detected, such as CLI unregistered phone numbers or return guarantee promises. Opening Call Explorer to review.`;
        onNavigate('calls');
      } else {
        reply = `Good news! Zero fatal violations are currently recorded in the active batch.`;
      }
      actionExecuted = 'Reported Fatal Violations';
    }
    // 12. SEARCH COMMAND
    else if (cleanPrompt.startsWith('search ') || cleanPrompt.startsWith('find ')) {
      const query = cleanPrompt.replace(/^(search|find)\s+/, '').trim();
      if (query && onSearch) {
        onSearch(query);
        reply = `Filtering calls and records for "${query}".`;
        actionExecuted = `Searched for "${query}"`;
      } else {
        reply = 'What would you like me to search for? Mention a client code, stock symbol, or advisor name.';
      }
    }
    // 13. SEND SCORECARDS
    else if (cleanPrompt.includes('send') || cleanPrompt.includes('email scorecard') || cleanPrompt.includes('dispatch')) {
      if (onOpenSendModal) {
        onOpenSendModal();
        reply = 'Opening Scorecard Email Dispatch modal for advisor notifications.';
        actionExecuted = 'Opened Scorecard Dispatch Modal';
      }
    }
    // 14. REFRESH DATA
    else if (cleanPrompt.includes('refresh') || cleanPrompt.includes('reload') || cleanPrompt.includes('sync')) {
      if (onRefresh) {
        onRefresh();
        reply = 'Refreshing all real-time call and scorecard data from the database.';
        actionExecuted = 'Refreshed Database Data';
      }
    }
    // 15. SEBI REGULATORY QUESTIONS
    else if (
      cleanPrompt.includes('sebi rule') ||
      cleanPrompt.includes('pre order rule') ||
      cleanPrompt.includes('why pre order')
    ) {
      reply = 'Per SEBI regulations, brokers must record all client order instructions prior to executing trades on the exchange. The call must authenticate UCC, scrip, price, and quantity with zero assurance of return allowed.';
      actionExecuted = 'Explained SEBI Pre-Order Regulation';
    }
    // 16. WHO ARE YOU / INTRO
    else if (cleanPrompt.includes('who are you') || cleanPrompt.includes('what is your name') || cleanPrompt.includes('tell me about yourself')) {
      reply = 'I am Adam, your autonomous AI assistant for SEBI pre-order call auditing. I operate with Deepgram Nova 3 transcription, acoustic DSP pre-filtering, and deterministic trade matching.';
      actionExecuted = 'Self Introduction';
    }
    // 17. TEST SPEECH
    else if (cleanPrompt.includes('test voice') || cleanPrompt.includes('test speech') || cleanPrompt.includes('can you hear me') || cleanPrompt.includes('can you talk')) {
      reply = 'Voice output is crystal clear and active. I am Adam, listening and ready for your commands.';
      actionExecuted = 'Audio Speech Verified';
    }
    // 18. GREETING
    else if (cleanPrompt.includes('hello') || cleanPrompt.includes('hey') || cleanPrompt.includes('hi')) {
      reply = 'Hello! Adam at your service. I am monitoring your pre-order trading desk. What would you like me to do?';
      actionExecuted = 'Greeting';
    }
    // 19. NATURAL FALLBACK
    else {
      reply = `Understood: "${rawText}". I am Adam, standing by. You can ask me any SEBI compliance questions or say "Run pipeline", "Show calls", or "Audit summary".`;
      actionExecuted = 'Speech Processed';
    }

    setLastAction(actionExecuted);
    playSciFiChime('success');

    const botLog: CommandLog = {
      id: String(Date.now() + 1),
      sender: 'assistant',
      text: reply,
      actionExecuted,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setLogs((prev) => [...prev, userLog, botLog]);
    speak(reply);

    setTimeout(() => {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [stats, scorecards, onStartPipeline, onNavigate, onSearch, onOpenSendModal, onRefresh, speak]);

  // Activate Mic & Speech Recognition
  const activateSpeechRecognition = useCallback(() => {
    playSciFiChime('activate');
    setHasActivatedAudio(true);

    if (typeof window === 'undefined') return;

    if (window.speechSynthesis) {
      window.speechSynthesis.resume();
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSpeechSupported(false);
      speak('Speech recognition is not supported in this browser. Please type your message below.');
      return;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (_) {}
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
        isListeningRef.current = true;
      };

      recognition.onresult = (event: any) => {
        let currentInterim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const chunk = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += chunk;
          } else {
            currentInterim += chunk;
          }
        }

        if (currentInterim) {
          setInterimTranscript(currentInterim);
        }

        if (final) {
          setTranscript(final);
          setInterimTranscript('');
          handleConversationAndCommands(final.trim());
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          console.warn('[Adam AI Voice] Recognition event:', event.error);
        }
      };

      recognition.onend = () => {
        if (isListeningRef.current) {
          try {
            recognition.start();
          } catch (_) {
            setTimeout(() => {
              if (isListeningRef.current) {
                try {
                  recognition.start();
                } catch (e) {}
              }
            }, 300);
          }
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      isListeningRef.current = true;
    } catch (err) {
      console.warn('Recognition start error:', err);
    }
  }, [handleConversationAndCommands, speak]);

  const stopSpeechRecognition = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (_) {}
    }
  }, []);

  // One-Click Talk / Greeting Trigger
  const handleActivateAndTalk = useCallback(() => {
    activateSpeechRecognition();
    setIsOpen(true);
    speak('Hello! I am Adam, your AI pre-order compliance assistant. Voice control is active and I am listening. Say "Run pipeline" or ask me any question.');
  }, [activateSpeechRecognition, speak]);

  // Ambient Auto-Activation on First User Interaction (Bypasses Browser Autoplay Restrictions)
  useEffect(() => {
    let unmounted = false;
    const unlockAndActivate = () => {
      if (unmounted) return;
      if (!hasActivatedAudio) {
        setHasActivatedAudio(true);
        activateSpeechRecognition();
      }
      window.removeEventListener('click', unlockAndActivate);
      window.removeEventListener('keydown', unlockAndActivate);
      window.removeEventListener('touchstart', unlockAndActivate);
    };

    window.addEventListener('click', unlockAndActivate, { once: true });
    window.addEventListener('keydown', unlockAndActivate, { once: true });
    window.addEventListener('touchstart', unlockAndActivate, { once: true });

    return () => {
      unmounted = true;
      window.removeEventListener('click', unlockAndActivate);
      window.removeEventListener('keydown', unlockAndActivate);
      window.removeEventListener('touchstart', unlockAndActivate);
    };
  }, [hasActivatedAudio, activateSpeechRecognition]);

  const handleTextSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    const txt = inputText.trim();
    setInputText('');
    handleConversationAndCommands(txt);
  };

  return (
    <>
      {/* Persistent Bottom Floating Voice Bar (Unmistakable & Always Accessible) */}
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 select-none">
        {/* Floating Ambient Voice Control Bar */}
        {!isOpen && (
          <div
            onClick={handleActivateAndTalk}
            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#0a1636]/95 via-[#0f2152]/95 to-[#0a1636]/95 border border-cyan-400/50 backdrop-blur-xl shadow-2xl shadow-cyan-950/80 cursor-pointer hover:border-cyan-300 transition-all hover:scale-102 group"
            title="Click to talk with Adam AI"
          >
            {/* 8-Channel Dynamic Wave Bars */}
            <div className="flex items-center gap-0.5 h-4">
              {[8, 14, 18, 12, 20, 15, 10, 16].map((h, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-100 ${
                    isSpeaking
                      ? 'bg-gradient-to-t from-blue-500 to-cyan-300 shadow-[0_0_6px_#00f0ff]'
                      : isListening
                      ? 'bg-gradient-to-t from-cyan-400 to-emerald-400 shadow-[0_0_6px_#10b981]'
                      : 'bg-cyan-500/50 group-hover:bg-cyan-400'
                  }`}
                  style={{
                    height: isSpeaking || isListening ? `${(h * (i % 2 === 0 ? 1.2 : 0.8)) % 16 + 4}px` : '6px',
                  }}
                />
              ))}
            </div>

            <div className="flex flex-col text-left">
              <span className="text-xs font-black text-white leading-tight flex items-center gap-1.5">
                <span>TALK TO ADAM</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </span>
              <span className="text-[10px] font-mono text-cyan-300 truncate max-w-[160px]">
                {interimTranscript ? `"${interimTranscript}"` : isSpeaking ? 'Adam is answering...' : isListening ? 'Listening... Speak now' : 'Click to activate mic'}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleActivateAndTalk();
              }}
              className="p-1.5 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 hover:bg-cyan-500/40 group-hover:text-white transition-colors"
            >
              <Mic size={14} className={isListening ? 'animate-bounce text-emerald-400' : ''} />
            </button>
          </div>
        )}

        {/* Circular Toggle Orb Button */}
        <button
          onClick={() => {
            if (!isOpen) {
              handleActivateAndTalk();
            } else {
              setIsOpen(false);
            }
          }}
          className={`relative group p-3.5 rounded-2xl flex items-center justify-center transition-all duration-300 cursor-pointer shadow-2xl ${
            isOpen
              ? 'bg-gradient-to-tr from-cyan-600 to-blue-600 text-white shadow-cyan-500/40 scale-105'
              : 'bg-gradient-to-tr from-[#09132b] to-[#12204a] text-cyan-300 border border-cyan-500/40 hover:border-cyan-400 shadow-black/80 hover:shadow-cyan-500/30 hover:scale-105'
          }`}
          title="Adam AI Assistant"
        >
          {/* Animated Neon Pulse Rings */}
          {(isListening || isSpeaking) && (
            <>
              <span className="absolute -inset-1 rounded-2xl bg-cyan-400/30 blur-sm animate-ping opacity-50" />
              <span className="absolute -inset-2 rounded-2xl bg-blue-500/20 blur-md animate-pulse" />
            </>
          )}

          <div className="relative flex items-center gap-2">
            <Bot size={20} className={isSpeaking ? 'text-white animate-bounce' : 'text-cyan-300'} />
            <span className="hidden md:inline font-black text-xs tracking-wider">
              ADAM
            </span>
          </div>
        </button>
      </div>

      {/* Expanded Holographic Voice & Conversational Assistant Modal */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-[#070e24]/95 backdrop-blur-2xl border border-cyan-500/40 shadow-2xl shadow-cyan-950/90 overflow-hidden flex flex-col text-xs text-gray-200 animate-in fade-in slide-in-from-bottom-6 duration-200">
          {/* HUD Header Bar */}
          <div className="px-4 py-3 bg-gradient-to-r from-[#0a1433] via-[#0f2152] to-[#0a1433] border-b border-cyan-500/30 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300 shadow-[0_0_12px_rgba(0,240,255,0.3)]">
                <Bot size={16} className="text-cyan-300" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm text-white tracking-wide">ADAM</span>
                  <span className="px-1.5 py-0.2 rounded-md bg-emerald-500/20 text-emerald-300 text-[9px] font-mono font-bold border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    VOICE ACTIVE
                  </span>
                </div>
                <div className="text-[10px] text-cyan-400/80 font-mono">Conversational Pre-Order Auditor</div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => speak('Testing voice output. Adam AI speech synthesis is crystal clear and operational.')}
                className="px-2 py-1 rounded-lg bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 hover:text-white text-[10px] font-semibold flex items-center gap-1"
                title="Test Adam voice speech aloud"
              >
                <Volume2 size={12} />
                <span>Test Voice</span>
              </button>
              <button
                onClick={() => setIsMuted((m) => !m)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isMuted
                    ? 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                    : 'bg-cyan-950/40 border-cyan-500/30 text-cyan-300 hover:text-white'
                }`}
                title={isMuted ? 'Unmute Adam Voice Output' : 'Mute Adam Voice Output'}
              >
                {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg bg-black/40 border border-white/10 text-gray-400 hover:text-white transition-colors"
                title="Minimize Adam HUD"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Real-time Audio Frequency Visualizer */}
          <div className="px-4 py-3 bg-gradient-to-b from-[#09132c] to-[#060b1a] border-b border-cyan-500/20 flex flex-col items-center justify-center">
            {/* 16 Audio Wave Bars */}
            <div className="flex items-center justify-center gap-1 h-12 w-full">
              {[35, 60, 85, 45, 95, 75, 55, 90, 60, 30, 80, 50, 70, 95, 45, 60].map((h, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-150 ${
                    isListening || isSpeaking
                      ? 'bg-gradient-to-t from-cyan-500 to-emerald-400 shadow-[0_0_8px_rgba(0,240,255,0.6)]'
                      : 'bg-cyan-950/60'
                  }`}
                  style={{
                    height:
                      isListening || isSpeaking
                        ? `${Math.max(10, ((h * (i % 2 === 0 ? 1.3 : 0.7)) % 42) + 6)}px`
                        : '6px',
                  }}
                />
              ))}
            </div>

            {/* Listening / Speaking Live Feedback */}
            <div className="mt-2 flex items-center justify-between w-full px-2">
              <button
                onClick={() => {
                  if (isListening) {
                    stopSpeechRecognition();
                  } else {
                    activateSpeechRecognition();
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-mono font-semibold transition-all shadow-md cursor-pointer ${
                  isListening
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30'
                }`}
              >
                {!speechSupported ? (
                  <span className="text-[10px] text-cyan-300 font-mono flex items-center gap-1">
                    <Command size={10} />
                    <span>Type or Click Chips</span>
                  </span>
                ) : isListening ? (
                  <>
                    <Mic size={11} className="animate-pulse text-emerald-400" />
                    <span>Mic Listening (Tap to Stop)</span>
                  </>
                ) : (
                  <>
                    <MicOff size={11} />
                    <span>Tap to Speak</span>
                  </>
                )}
              </button>

              <span className="text-[10px] font-mono text-cyan-300 truncate max-w-[180px]">
                {interimTranscript ? `"${interimTranscript}"` : isSpeaking ? 'Adam is speaking...' : 'Say "Adam" + command'}
              </span>
            </div>
          </div>

          {/* Quick Voice & Action Chips */}
          <div className="p-2.5 bg-[#060c1d] border-b border-cyan-500/20">
            <div className="text-[10px] font-mono text-cyan-400 uppercase font-semibold mb-1.5 flex items-center justify-between">
              <span>Quick Voice Tasks:</span>
              <span className="text-gray-500 text-[9px]">Tap to execute & speak</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '🗣 "Hello Adam"', cmd: 'Hello Adam' },
                { label: '▶ Run Pipeline', cmd: 'Run pipeline' },
                { label: '📊 Dashboard', cmd: 'Open dashboard' },
                { label: '⚡ Live Pipeline', cmd: 'Open live pipeline' },
                { label: '📞 Show Calls', cmd: 'Show calls' },
                { label: '📋 Status Summary', cmd: 'Audit summary' },
                { label: '🚨 Fatal Calls?', cmd: 'How many fatal calls?' },
                { label: '📜 SEBI Rules', cmd: 'What are the SEBI pre-order rules?' },
                { label: '🔄 Refresh', cmd: 'Refresh data' },
              ].map((chip) => (
                <button
                  key={chip.cmd}
                  onClick={() => handleConversationAndCommands(chip.cmd)}
                  className="px-2 py-1 rounded-lg bg-[#0b1633] hover:bg-[#122352] border border-cyan-500/30 text-cyan-200 text-[10px] font-medium transition-colors cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Log Body */}
          <div className="flex-1 max-h-56 overflow-y-auto p-3 space-y-2.5 custom-scrollbar bg-[#040816]/90">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`flex flex-col ${log.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-xl text-xs leading-relaxed ${
                    log.sender === 'user'
                      ? 'bg-blue-600/30 border border-blue-500/40 text-blue-100 rounded-br-xs'
                      : 'bg-[#0a1636] border border-cyan-500/30 text-gray-200 rounded-bl-xs'
                  }`}
                >
                  <p>{log.text}</p>
                  {log.actionExecuted && (
                    <div className="mt-1 pt-1 border-t border-cyan-500/20 text-[10px] font-mono text-cyan-300 flex items-center gap-1 font-semibold">
                      <CheckCircle2 size={10} className="text-emerald-400" />
                      <span>{log.actionExecuted}</span>
                    </div>
                  )}
                </div>
                <span className="text-[9px] text-gray-500 mt-0.5 px-1 font-mono">{log.timestamp}</span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>

          {/* Input & Fallback Text Prompt Bar */}
          <form onSubmit={handleTextSubmit} className="p-2.5 bg-[#070e24] border-t border-cyan-500/30 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Talk to Adam or type command..."
              className="flex-1 px-3 py-1.5 bg-[#040816] border border-cyan-500/30 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 font-sans"
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className="p-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white disabled:opacity-40 transition-all cursor-pointer shadow-md"
              title="Send to Adam"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
