import React, { useState } from 'react';
import {
  LayoutDashboard,
  Activity,
  Search,
  Layers,
  ClipboardCheck,
  FileSpreadsheet,
  Users,
  UserCheck,
  ShieldCheck,
  Download,
  UploadCloud,
  TrendingUp,
  Contact,
  Radio,
  Cpu,
  Globe,
  UserCog,
  Settings,
  ChevronsLeft,
  ChevronsRight,
  Send,
  Loader2,
  LogOut,
  Sliders,
  Database,
  ArrowRightLeft,
  Check,
  X,
  ExternalLink,
} from 'lucide-react';
import type { ActiveTab, UserProfile } from '../types';
import { AdamLogo } from './AdamLogo';
import { WORKSPACE_ACCOUNTS, type WorkspaceAccount } from './LoginScreen';

export type { ActiveTab };

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isOpen?: boolean;
  onToggle?: () => void;
  onSendScorecards?: () => Promise<void>;
  onOpenSendModal?: () => void;
  onLogout?: () => void;
  onSwitchWorkspace?: (ws: WorkspaceAccount) => void;
  currentUser?: UserProfile | null;
  stats?: {
    transcribed: number;
    calls: number;
    audits: number;
    scored: number;
    failed: number;
  } | null;
}

interface NavCategory {
  title: string;
  items: {
    id: ActiveTab;
    label: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    badge?: string | number;
  }[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  isOpen = true,
  onToggle,
  onSendScorecards,
  onOpenSendModal,
  onLogout,
  onSwitchWorkspace,
  currentUser,
  stats,
}) => {
  const [isSwitchModalOpen, setIsSwitchModalOpen] = useState(false);

  const currentWsAccount = WORKSPACE_ACCOUNTS.find(
    (w) => w.id === currentUser?.workspace_id || w.name === currentUser?.workspace_name
  ) || WORKSPACE_ACCOUNTS[0];

  const categories: NavCategory[] = [
    {
      title: 'OVERVIEW',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'pipeline', label: 'Live Pipeline', icon: Activity },
        { id: 'calls', label: 'Call Explorer', icon: Search, badge: stats?.calls },
        { id: 'matching', label: 'Trade Matching', icon: Layers },
        { id: 'master_table', label: 'Audit Results', icon: ClipboardCheck, badge: stats?.scored },
      ],
    },
    {
      title: 'QUALITY & RUBRIC',
      items: [
        { id: 'workspace_parameters', label: 'Quality Parameters (50)', icon: Sliders },
        { id: 'scorecards', label: 'Scorecards', icon: FileSpreadsheet, badge: stats?.scored },
        { id: 'reports', label: 'Compliance Insights', icon: ShieldCheck },
        { id: 'exports', label: 'Download Reports', icon: Download },
      ],
    },
    {
      title: 'PERFORMANCE',
      items: [
        { id: 'advisors', label: 'Advisor Performance', icon: Users },
        { id: 'clients', label: 'Client Analysis', icon: UserCheck },
      ],
    },
    {
      title: 'DATA MANAGEMENT',
      items: [
        { id: 'ingestion_hub', label: 'Ingestion & Download', icon: UploadCloud },
        { id: 'trades', label: 'Trade Book Upload', icon: TrendingUp },
        { id: 'tata', label: 'Tata CloudPhone API', icon: Radio },
      ],
    },
    {
      title: 'SYSTEM',
      items: [
        { id: 'admin', label: 'Processing & Model', icon: Cpu },
        { id: 'api_connections', label: 'API & Integrations', icon: Globe },
        { id: 'security', label: 'User Management', icon: UserCog },
        { id: 'maintenance', label: 'Settings', icon: Settings },
      ],
    },
  ];

  return (
    <>
      <aside
        className={`${
          isOpen ? 'w-64' : 'w-16'
        } bg-[#040918]/95 backdrop-blur-2xl text-gray-300 flex flex-col border-r border-[#162344] shrink-0 h-screen sticky top-0 z-40 transition-all duration-200 select-none shadow-[10px_0_30px_rgba(0,0,0,0.6)]`}
      >
        {/* Platform Branding Header with 3D Glossy AdamLogo */}
        <div className="h-16 px-4 border-b border-[#141e36] flex items-center justify-between shrink-0 bg-[#060d21]">
          <AdamLogo size={36} showText={isOpen} subtext="Compliance Quality Platform" />
        </div>

        {/* Active Workplace Desk Card with Switch Trigger */}
        {isOpen ? (
          <div className="mx-3 mt-3 p-3 rounded-2xl bg-gradient-to-br from-[#0a1738] to-[#061026] border border-cyan-500/25 shadow-lg relative group">
            <div className="flex items-start justify-between gap-1 mb-1.5">
              <span className="text-[9px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                {currentWsAccount.category}
              </span>

              <button
                type="button"
                onClick={() => setIsSwitchModalOpen(true)}
                title="Switch Workplace Desk"
                className="text-[10px] font-mono text-cyan-400 hover:text-white flex items-center gap-1 hover:bg-white/10 px-1.5 py-0.5 rounded transition-all cursor-pointer"
              >
                <ArrowRightLeft size={11} />
                <span>Switch</span>
              </button>
            </div>

            <div className="text-xs font-black text-white tracking-tight truncate">
              {currentWsAccount.name}
            </div>

            <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1.5 mt-1 truncate">
              <Database size={11} className="text-emerald-400 shrink-0" />
              <span className="truncate text-emerald-300/90">{currentWsAccount.db}</span>
            </div>
          </div>
        ) : (
          <div className="flex justify-center mt-3">
            <button
              type="button"
              onClick={() => setIsSwitchModalOpen(true)}
              title={`Active Desk: ${currentWsAccount.name} (${currentWsAccount.db}) - Click to Switch`}
              className="p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:scale-105 transition-all cursor-pointer"
            >
              <Database size={16} />
            </button>
          </div>
        )}

        {/* Navigation Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
          {categories.map((category) => (
            <div key={category.title} className="space-y-1">
              {isOpen && (
                <div className="px-3 py-1 text-[9px] font-mono font-bold text-slate-400 tracking-wider uppercase flex items-center justify-between">
                  <span>{category.title}</span>
                </div>
              )}
              <div className="space-y-0.5">
                {category.items.map((item) => {
                  const IconComponent = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={`${category.title}-${item.id}-${item.label}`}
                      onClick={() => onTabChange(item.id)}
                      title={!isOpen ? item.label : undefined}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer relative group ${
                        isActive
                          ? 'bg-gradient-to-r from-cyan-500/25 via-blue-600/25 to-indigo-600/25 text-white border border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      } ${!isOpen ? 'justify-center px-0' : ''}`}
                    >
                      {isActive && (
                        <span className="absolute left-1 w-1 h-4 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                      )}
                      <IconComponent
                        size={16}
                        className={isActive ? 'text-cyan-300 shrink-0' : 'text-slate-400 shrink-0 group-hover:text-white'}
                      />
                      {isOpen && <span className="truncate flex-1 text-left">{item.label}</span>}
                      {isOpen && item.badge !== undefined && Number(item.badge) > 0 && (
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                            isActive
                              ? 'bg-cyan-500/30 text-cyan-200 font-bold border border-cyan-400/30'
                              : 'bg-[#0e172e] text-slate-400 border border-white/5'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Direct Sign Out Action */}
        {onLogout && (
          <div className="px-3 pb-2 shrink-0">
            <button
              type="button"
              onClick={onLogout}
              title="Sign Out of ADAM-AR"
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/40 transition-all duration-150 cursor-pointer shadow-xs ${
                !isOpen ? 'justify-center px-0' : ''
              }`}
            >
              <LogOut size={15} className="text-rose-400 shrink-0" />
              {isOpen && <span className="truncate flex-1 text-left">Sign Out</span>}
            </button>
          </div>
        )}

        {/* Bottom Status Pill */}
        <div className="p-3 border-t border-[#141e36] shrink-0 bg-[#060d21]">
          <div
            className={`rounded-xl p-2.5 bg-[#0b142c] border border-cyan-500/20 shadow-inner flex items-center ${
              isOpen ? 'justify-between' : 'justify-center'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
              </span>
              {isOpen && (
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-white tracking-tight leading-none">
                    Multi-DB Active
                  </span>
                  <span className="text-[9px] text-emerald-400 mt-1 leading-none">
                    Isolated Storage
                  </span>
                </div>
              )}
            </div>
            {isOpen && (
              <div className="flex items-center gap-1.5">
                <div className="flex items-end gap-[1.5px] h-3">
                  <div className="w-[2px] bg-cyan-400 soundwave-bar-1 rounded-full" />
                  <div className="w-[2px] bg-cyan-300 soundwave-bar-2 rounded-full" />
                  <div className="w-[2px] bg-indigo-400 soundwave-bar-3 rounded-full" />
                  <div className="w-[2px] bg-emerald-400 soundwave-bar-4 rounded-full" />
                </div>
                <span className="text-[9px] font-mono text-gray-400">
                  v17.2
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ========================================================== */}
      {/* MODAL: FAST SWITCH WORKPLACE DESK (ALL 9 DESKS)             */}
      {/* ========================================================== */}
      {isSwitchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="relative w-full max-w-2xl bg-[#09152e] border border-cyan-500/40 rounded-3xl shadow-2xl p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  <ArrowRightLeft size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Switch Workplace Desk</h3>
                  <p className="text-xs text-slate-400">
                    Active Desk: <b className="text-cyan-300">{currentWsAccount.name}</b> (Personal DB: {currentWsAccount.db})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsSwitchModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 custom-scrollbar py-2">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs">
                <b>Strict Workspace Isolation Policy:</b> Each workspace desk is protected by distinct credentials and personal database storage. To enter a different workspace, sign out and authenticate with that desk&apos;s unique Login ID and password.
              </div>

              <div className="space-y-2">
                {WORKSPACE_ACCOUNTS.map((ws) => {
                  const isCurrent = ws.id === currentWsAccount.id;
                  const IconComp = ws.icon;
                  return (
                    <div
                      key={ws.id}
                      className={`w-full p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'border-cyan-400/60 bg-cyan-500/15'
                          : 'border-white/10 bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-xl ${ws.theme.bg} ${ws.theme.text} border border-white/10 shrink-0`}>
                          <IconComp size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white truncate">{ws.name}</span>
                            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/40 text-slate-300">
                              {ws.category}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">{ws.tagline}</div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 justify-end">
                          <Database size={11} />
                          <span>{ws.db}</span>
                        </div>
                        {isCurrent ? (
                          <span className="text-cyan-300 font-bold text-[10px] font-mono flex items-center gap-1 justify-end mt-0.5">
                            <Check size={11} /> Active Desk
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px] font-mono">
                            Credentials Required
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 font-mono shrink-0">
              <span>Personal isolated database per desk.</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSwitchModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 text-white font-bold hover:bg-white/15 text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsSwitchModalOpen(false);
                    if (onLogout) onLogout();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut size={13} />
                  <span>Sign Out to Switch</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
