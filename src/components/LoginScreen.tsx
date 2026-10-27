import React, { useState } from 'react';
import {
  Lock,
  Mail,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Building2,
  Headphones,
  Coins,
  Gem,
  Smartphone,
  UserCheck,
  TrendingUp,
  Crown,
  ChevronDown,
  Server,
  CheckCircle2,
  RefreshCw,
  Settings2,
} from 'lucide-react';
import type { UserProfile } from '../types';
import { AdamLogo } from './AdamLogo';
import {
  setStoredToken,
  setStoredWorkspace,
  getApiUrl,
  safeParseJsonResponse,
  getApiBaseUrl,
  setApiBaseUrl,
} from '../lib/api';

interface LoginScreenProps {
  onLoginSuccess: (user: UserProfile, token: string) => void;
  onBackToLanding?: () => void;
}

export interface WorkspaceAccount {
  id: string;
  name: string;
  category: 'Equity' | 'Mutual Fund' | 'Support';
  db: string;
  tagline: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  theme: {
    accent: string;
    border: string;
    bg: string;
    glow: string;
    text: string;
    pill: string;
  };
}

export const WORKSPACE_ACCOUNTS: WorkspaceAccount[] = [
  {
    id: 'preorder_desk',
    name: 'Pre-order Regulatory Desk',
    category: 'Equity',
    db: 'auditeq_production.db',
    tagline: 'SEBI Voice Mandate & Pre-Order Q1–Q5 Audit',
    icon: Building2,
    theme: {
      accent: 'from-cyan-400 to-blue-500',
      border: 'border-cyan-500/40',
      bg: 'bg-cyan-500/10',
      glow: 'shadow-none',
      text: 'text-cyan-300',
      pill: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
    },
  },
  {
    id: 'customer_support',
    name: 'Customer support',
    category: 'Support',
    db: 'customer_support.db',
    tagline: 'Customer Service & Ticket Resolution QA',
    icon: Headphones,
    theme: {
      accent: 'from-indigo-400 to-violet-500',
      border: 'border-indigo-500/40',
      bg: 'bg-indigo-500/10',
      glow: 'shadow-none',
      text: 'text-indigo-300',
      pill: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
    },
  },
  {
    id: 'mf_gold',
    name: 'MF Gold',
    category: 'Mutual Fund',
    db: 'mf_gold.db',
    tagline: 'Mutual Fund High-Value Portfolio Advisory QA',
    icon: Coins,
    theme: {
      accent: 'from-amber-400 to-yellow-500',
      border: 'border-amber-500/40',
      bg: 'bg-amber-500/10',
      glow: 'shadow-none',
      text: 'text-amber-300',
      pill: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
  },
  {
    id: 'mf_silver',
    name: 'MF Silver',
    category: 'Mutual Fund',
    db: 'mf_silver.db',
    tagline: 'Mutual Fund Retail Wealth & SIP Sales QA',
    icon: Gem,
    theme: {
      accent: 'from-slate-300 to-cyan-400',
      border: 'border-slate-400/40',
      bg: 'bg-slate-400/10',
      glow: 'shadow-none',
      text: 'text-slate-200',
      pill: 'bg-slate-400/20 text-slate-200 border-slate-400/40',
    },
  },
  {
    id: 'mf_digital',
    name: 'MF Digital',
    category: 'Mutual Fund',
    db: 'mf_digital.db',
    tagline: 'App Inquiries & Digital Platform Telephony QA',
    icon: Smartphone,
    theme: {
      accent: 'from-teal-400 to-emerald-500',
      border: 'border-teal-500/40',
      bg: 'bg-teal-500/10',
      glow: 'shadow-none',
      text: 'text-teal-300',
      pill: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
    },
  },
  {
    id: 'mf_onboarding',
    name: 'MF Onboarding',
    category: 'Mutual Fund',
    db: 'mf_onboarding.db',
    tagline: 'KYC, Penny-Drop & Account Opening Compliance',
    icon: UserCheck,
    theme: {
      accent: 'from-blue-400 to-indigo-500',
      border: 'border-blue-500/40',
      bg: 'bg-blue-500/10',
      glow: 'shadow-none',
      text: 'text-blue-300',
      pill: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    },
  },
  {
    id: 'equity_onboarding',
    name: 'Equity Onboarding',
    category: 'Equity',
    db: 'equity_onboarding.db',
    tagline: 'Demat & Trading Account Opening Verification',
    icon: UserCheck,
    theme: {
      accent: 'from-emerald-400 to-teal-500',
      border: 'border-emerald-500/40',
      bg: 'bg-emerald-500/10',
      glow: 'shadow-none',
      text: 'text-emerald-300',
      pill: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    },
  },
  {
    id: 'equity_regular',
    name: 'Equity Regular',
    category: 'Equity',
    db: 'equity_regular.db',
    tagline: 'Secondary Broking & Retail Trading Advisory QA',
    icon: TrendingUp,
    theme: {
      accent: 'from-sky-400 to-blue-600',
      border: 'border-sky-500/40',
      bg: 'bg-sky-500/10',
      glow: 'shadow-none',
      text: 'text-sky-300',
      pill: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    },
  },
  {
    id: 'mf_platinum',
    name: 'MF platinum',
    category: 'Mutual Fund',
    db: 'mf_platinum.db',
    tagline: 'HNW Wealth Advisory & Family Office QA',
    icon: Crown,
    theme: {
      accent: 'from-purple-400 to-pink-500',
      border: 'border-purple-500/40',
      bg: 'bg-purple-500/10',
      glow: 'shadow-none',
      text: 'text-purple-300',
      pill: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    },
  },
];

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onBackToLanding }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>('auto');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showServerConfig, setShowServerConfig] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState(() => getApiBaseUrl());
  const [serverStatusMsg, setServerStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [isTestingServer, setIsTestingServer] = useState(false);

  const handleTestAndSaveServer = async () => {
    setIsTestingServer(true);
    setServerStatusMsg(null);
    try {
      const targetBase = serverUrlInput.trim().replace(/\/+$/, '');
      const testUrl = targetBase ? `${targetBase}/api/health` : '/api/health';
      const res = await fetch(testUrl);
      const data = await safeParseJsonResponse<any>(res);
      if (res.ok && (data.status === 'ok' || data.version)) {
        setApiBaseUrl(targetBase);
        setServerStatusMsg({ text: `Connected successfully to backend v${data.version || ''}!`, ok: true });
        setErrorMessage(null);
      } else {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
    } catch (err: any) {
      setServerStatusMsg({ text: `Connection failed: ${err?.message || 'Server unreachable'}`, ok: false });
    } finally {
      setIsTestingServer(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanUser = username.trim();
    const cleanPass = password;

    if (!cleanUser) {
      setErrorMessage('Please enter your Login ID or Email.');
      return;
    }
    if (!cleanPass) {
      setErrorMessage('Please enter your Password.');
      return;
    }

    setIsLoading(true);

    try {
      // Determine workspace override header if specific desk chosen
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (selectedWorkspace !== 'auto') {
        headers['X-AuditEQ-Workspace'] = selectedWorkspace;
      }

      const loginUrl = getApiUrl('/api/auth/login');
      let res: Response;
      try {
        res = await fetch(loginUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            username: cleanUser,
            password: cleanPass,
            workspace_id: selectedWorkspace !== 'auto' ? selectedWorkspace : undefined,
          }),
        });
      } catch (netErr: any) {
        throw new Error(
          `Unable to reach backend server at ${loginUrl}. If running frontend on Cloudflare Pages, configure your Backend Server URL below.`
        );
      }

      const data = await safeParseJsonResponse<any>(res);

      if (!res.ok || !data.ok || !data.authenticated) {
        throw new Error(data.error || 'Authentication failed. Please verify your Login ID and Password.');
      }

      const token = data.token;
      const user = data.user;
      const wsId = data.workspace?.id || user.workspace_id || 'preorder_desk';

      setStoredToken(token);
      setStoredWorkspace(wsId);

      onLoginSuccess(user, token);
    } catch (err: any) {
      const msg = err.message || 'Unable to authenticate. Please check your credentials.';
      setErrorMessage(msg);
      if (
        msg.includes('405') ||
        msg.includes('503') ||
        msg.includes('502') ||
        msg.includes('Backend') ||
        msg.includes('Cloudflare') ||
        msg.includes('unreachable') ||
        msg.includes('Network Error')
      ) {
        setShowServerConfig(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#060b18] text-gray-200 flex flex-col justify-center items-center px-4 py-8 select-none">
      {/* Centered Login Card */}
      <div className="w-full max-w-md bg-[#0a1128] border border-[#1a2c56] rounded-2xl p-8 shadow-2xl">
        {/* Back Link to Landing */}
        {onBackToLanding && (
          <button
            type="button"
            onClick={onBackToLanding}
            className="mb-4 text-xs font-mono text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <span>&larr; Back to ADAM Overview</span>
          </button>
        )}

        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <AdamLogo size={48} showText={false} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white font-sans">
            ADAM-AR <span className="text-cyan-400 font-mono text-sm px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-800">PRO</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Compliance Quality Intelligence Platform
          </p>
          <div className="mt-3 inline-block px-3 py-1 rounded-full bg-[#0d1c44] border border-[#223b75] text-[11px] font-mono text-cyan-300">
            Secure Desk Authentication
          </div>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-red-950/70 border border-red-500/50 text-red-200 text-xs flex flex-col gap-2">
            <div className="flex items-start gap-2.5">
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
            {(errorMessage.includes('Cloudflare') ||
              errorMessage.includes('Backend') ||
              errorMessage.includes('405') ||
              errorMessage.includes('404') ||
              errorMessage.includes('503') ||
              errorMessage.includes('502') ||
              errorMessage.includes('521') ||
              errorMessage.includes('unreachable') ||
              errorMessage.includes('reach') ||
              errorMessage.includes('connect')) && (
              <button
                type="button"
                onClick={() => setShowServerConfig(true)}
                className="self-start text-[11px] font-mono text-cyan-400 hover:text-cyan-300 underline cursor-pointer mt-0.5 flex items-center gap-1"
              >
                <Server size={12} />
                <span>Configure Backend Server URL &rarr;</span>
              </button>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username / Email */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 font-sans">
              Login ID / Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Mail size={15} />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your Workspace Login ID"
                autoComplete="username"
                className="w-full pl-9 pr-3 py-2.5 bg-[#070e22] border border-[#1e3260] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 font-sans">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock size={15} />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your Workspace Password"
                autoComplete="current-password"
                className="w-full pl-9 pr-10 py-2.5 bg-[#070e22] border border-[#1e3260] rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-200"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Optional Workspace Dropdown Menu */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5 font-sans flex items-center justify-between">
              <span>Target Workspace Desk</span>
              <span className="text-[10px] text-cyan-400 font-mono">Auto-resolves by default</span>
            </label>
            <div className="relative">
              <select
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                className="w-full appearance-none px-3 py-2.5 bg-[#070e22] border border-[#1e3260] rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 cursor-pointer"
              >
                <option value="auto">Auto-detect from Login ID & Password</option>
                {WORKSPACE_ACCOUNTS.map((ws) => (
                  <option key={ws.id} value={ws.id}>
                    {ws.name} ({ws.category})
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400">
                <ChevronDown size={14} />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-2 border border-cyan-400/40 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Authenticating...</span>
              </>
            ) : (
              <>
                <span>Authenticate & Enter Workspace</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Cloudflare Pages / Remote Backend Host Configuration */}
        <div className="mt-6 pt-4 border-t border-[#162344]">
          <button
            type="button"
            onClick={() => setShowServerConfig(!showServerConfig)}
            className="w-full flex items-center justify-between text-xs text-gray-400 hover:text-cyan-300 transition-colors py-1 cursor-pointer"
          >
            <span className="flex items-center gap-1.5 font-mono text-[11px]">
              <Server size={13} className="text-cyan-400" />
              API Host: {serverUrlInput ? serverUrlInput : '(Same Origin / Local)'}
            </span>
            <span className="text-[11px] text-cyan-400/90 font-mono underline">
              {showServerConfig ? 'Close' : 'Configure Server'}
            </span>
          </button>

          {showServerConfig && (
            <div className="mt-3 p-3.5 bg-[#070e22] border border-[#1a2c56] rounded-xl text-xs space-y-2.5">
              <div className="text-[11px] text-gray-400 leading-relaxed">
                Deploying on Cloudflare Pages? Specify your active Node.js server URL (e.g. <span className="text-cyan-300">https://api.yourdomain.com</span> or leave empty for same origin):
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="https://api.yourdomain.com (or empty for default)"
                  value={serverUrlInput}
                  onChange={(e) => setServerUrlInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-[#0a1128] border border-[#1e3260] rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400 font-mono"
                />
                <button
                  type="button"
                  onClick={handleTestAndSaveServer}
                  disabled={isTestingServer}
                  className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
                >
                  {isTestingServer ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                  <span>Save & Test</span>
                </button>
              </div>
              {serverStatusMsg && (
                <div className={`text-[11px] flex items-center gap-1.5 ${serverStatusMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {serverStatusMsg.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  <span>{serverStatusMsg.text}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Security Notice */}
        <div className="mt-4 pt-3 border-t border-[#162344] text-center">
          <p className="text-[11px] text-gray-500">
            Authorized institutional access only. Personal isolated database & dedicated cryptographic storage active.
          </p>
        </div>
      </div>
    </div>
  );
};
