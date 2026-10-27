import React, { useState, useRef, useEffect } from 'react';
import {
  Bell,
  Calendar,
  Play,
  Search,
  ChevronDown,
  Check,
  Edit3,
  X,
  Key,
  Shield,
  LogOut,
  User,
  Radio,
  Sparkles,
  AlertTriangle,
  Mail,
  CheckCircle2,
  Trash2,
  ChevronRight,
  ExternalLink,
  Mic,
} from 'lucide-react';
import type { UserProfile, ScorecardRecord, ActiveTab } from '../types';
import { api } from '../lib/api';
import { LiveAudioVisualizer } from './LiveAudioVisualizer';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  onRefresh: () => void;
  onStartPipeline?: () => void;
  isLoading: boolean;
  pipelineRunning?: boolean;
  currentUser: UserProfile | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  dateRange?: string;
  onDateRangeChange?: (range: string) => void;
  onUpdateProfile?: (user: UserProfile) => void;
  onSearch?: (query: string) => void;
  onOpenVoiceAssistant?: () => void;
  scorecards?: ScorecardRecord[];
  onNavigate?: (tab: ActiveTab) => void;
}

interface NotificationItem {
  id: string;
  type: 'fatal' | 'email' | 'system' | 'trade';
  title: string;
  desc: string;
  time: string;
  read?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onRefresh,
  onStartPipeline,
  isLoading,
  pipelineRunning,
  currentUser,
  onOpenAuth,
  onLogout,
  dateRange = '06 Oct 2026 - 09 Oct 2026',
  onDateRangeChange,
  onUpdateProfile,
  onSearch,
  onOpenVoiceAssistant,
  scorecards = [],
  onNavigate,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [liveMenuOpen, setLiveMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);

  // Edit Profile Form State
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Custom Date Range State
  const [customStartDate, setCustomStartDate] = useState('2026-10-06');
  const [customEndDate, setCustomEndDate] = useState('2026-10-09');

  const datePickerRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Authoritative real-time notifications derived exclusively from actual database scorecards
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Update notifications dynamically from real database scorecards
  useEffect(() => {
    const fatalScorecards = scorecards.filter((s) => s.is_fatal || s.score === 0);
    if (fatalScorecards.length > 0) {
      const realFatalNotifs: NotificationItem[] = fatalScorecards.slice(0, 10).map((s) => ({
        id: `sc-fatal-${s.id}`,
        type: 'fatal',
        title: `Fatal Violation: Call #${s.call_id || s.id}`,
        desc: `Score ${s.score}/5 for client ${s.client_code || s.client || 'UCC'}. ${s.fatal_reasons || 'Regulatory Non-Compliance'}`,
        time: s.created_at ? new Date(s.created_at).toLocaleTimeString() : 'Recent',
        read: false,
      }));

      setNotifications(realFatalNotifs);
    } else {
      setNotifications([]);
    }
  }, [scorecards]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Keyboard shortcut Ctrl + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) {
        setDatePickerOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
      if (liveRef.current && !liveRef.current.contains(e.target as Node)) {
        setLiveMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotificationOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery);
    }
  };

  const handleDismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleClearAllNotifications = () => {
    setNotifications([]);
  };

  const displayName = currentUser?.full_name || currentUser?.name || 'Ashutosh Kumar';
  const roleName = currentUser?.role === 'compliance_head' ? 'Compliance Head' : 'Admin';

  const initials =
    displayName
      .split(' ')
      .filter(Boolean)
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'AK';

  const handleOpenEditProfile = () => {
    setEditName(currentUser?.full_name || currentUser?.name || 'Ashutosh Kumar');
    setEditEmail(currentUser?.email || '');
    setProfileSuccess(false);
    setProfileOpen(false);
    setIsEditProfileOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    setSavingProfile(true);
    try {
      const res = await api.updateProfile({
        full_name: editName.trim(),
        email: editEmail.trim() || undefined,
      });
      if (res.ok && res.user) {
        if (onUpdateProfile) {
          onUpdateProfile(res.user);
        }
        setProfileSuccess(true);
        setTimeout(() => {
          setIsEditProfileOpen(false);
          setProfileSuccess(false);
        }, 800);
      }
    } catch (err) {
      console.error('Failed to update profile:', err);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleApplyCustomDate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStartDate) return;
    const rangeStr =
      customStartDate === customEndDate || !customEndDate
        ? customStartDate
        : `${customStartDate} - ${customEndDate}`;
    if (onDateRangeChange) {
      onDateRangeChange(rangeStr);
    }
    setDatePickerOpen(false);
  };

  return (
    <header className="h-16 bg-[#070b19]/90 backdrop-blur-xl border-b border-[#141f3d] px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 select-none shadow-xl">
      {/* Search Bar matching screenshot */}
      <div className="flex-1 max-w-xl mr-2 sm:mr-4">
        <form onSubmit={handleSearchSubmit} className="relative">
          <div className="relative flex items-center">
            <Search
              size={15}
              className="absolute left-3.5 text-gray-400 pointer-events-none"
            />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (onSearch) onSearch(e.target.value);
              }}
              placeholder="Search calls, client code, advisor, stock, trade ID..."
              className="w-full pl-10 pr-20 py-2 bg-[#0b132b]/80 hover:bg-[#0d1734] focus:bg-[#0e1939] border border-[#1b2a52] focus:border-cyan-400/60 rounded-full text-xs text-gray-200 placeholder-gray-400 transition-all focus:outline-none focus:ring-1 focus:ring-cyan-400/40 shadow-inner"
            />
            <div className="absolute right-3 hidden sm:flex items-center gap-1 pointer-events-none">
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#162447] text-gray-400 border border-white/5 font-semibold">
                Ctrl + K
              </span>
            </div>
          </div>
        </form>
      </div>

      {/* Right Controls matching screenshot */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Dynamic AI DSP Spectrum Visualizer Widget */}
        <LiveAudioVisualizer
          isActive={true}
          barCount={14}
          height={20}
          variant="cyan-emerald"
          label="Nova-3 DSP"
          className="hidden xl:inline-flex"
        />

        {/* Date Selector Pill */}
        <div className="relative hidden md:block" ref={datePickerRef}>
          <button
            onClick={() => setDatePickerOpen(!datePickerOpen)}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-[#0b132b]/80 hover:bg-[#101b3c] border border-[#1b2a52] hover:border-cyan-500/40 rounded-full text-xs text-gray-200 transition-all cursor-pointer shadow-sm"
          >
            <Calendar size={13} className="text-gray-400 shrink-0" />
            <span className="font-medium text-[11px] text-gray-200">{dateRange}</span>
            <ChevronDown
              size={12}
              className={`text-gray-400 transition-transform ${
                datePickerOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {datePickerOpen && (
            <div className="absolute right-0 mt-2 w-72 bg-[#0c142d] border border-cyan-500/30 rounded-2xl shadow-2xl p-3 z-50 text-xs text-gray-300 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl">
              <div className="flex items-center justify-between pb-2 border-b border-[#1b2a52] mb-2">
                <span className="font-semibold text-white text-[11px] uppercase tracking-wider">
                  Select Date Range
                </span>
                <button
                  onClick={() => setDatePickerOpen(false)}
                  className="p-1 hover:bg-[#162447] rounded text-gray-400 hover:text-white"
                >
                  <X size={13} />
                </button>
              </div>

              <div className="space-y-1 mb-3">
                {[
                  { label: '06 Oct 2026 - 09 Oct 2026', range: '06 Oct 2026 - 09 Oct 2026' },
                  { label: '04-08-2026 (Upload Batch)', range: '04-08-2026' },
                  { label: 'All Recorded Dates', range: 'All Dates' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      if (onDateRangeChange) onDateRangeChange(item.range);
                      setDatePickerOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer ${
                      dateRange === item.range
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'hover:bg-[#162447] text-gray-300'
                    }`}
                  >
                    <span>{item.label}</span>
                    {dateRange === item.range && <Check size={12} className="text-cyan-400" />}
                  </button>
                ))}
              </div>

              <form onSubmit={handleApplyCustomDate} className="pt-2 border-t border-[#1b2a52] space-y-2">
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Custom Range
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-2 py-1 bg-[#070c1b] border border-[#1b2a52] rounded-lg text-white text-[11px]"
                  />
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-2 py-1 bg-[#070c1b] border border-[#1b2a52] rounded-lg text-white text-[11px]"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-md"
                >
                  Apply Custom Range
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Live Status Pill with green pulsing dot */}
        <div className="relative hidden sm:block" ref={liveRef}>
          <button
            onClick={() => setLiveMenuOpen(!liveMenuOpen)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0b132b]/80 hover:bg-[#101b3c] border border-[#1b2a52] rounded-full text-xs text-gray-200 transition-all cursor-pointer shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981] animate-pulse"></span>
            <span className="font-semibold text-[11px] text-gray-200">Live</span>
            <ChevronDown size={11} className="text-gray-400" />
          </button>
        </div>

        {/* Action Button: Glowing Run Pipeline pill button */}
        {onStartPipeline && (
          <button
            onClick={onStartPipeline}
            disabled={isLoading || pipelineRunning}
            className="flex items-center gap-2 px-3 sm:px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full text-xs font-bold transition-all cursor-pointer shadow-[0_0_20px_rgba(37,99,235,0.45)] hover:shadow-[0_0_25px_rgba(37,99,235,0.6)] disabled:opacity-50 shimmer-sweep-hover"
          >
            <Play size={13} className={pipelineRunning ? 'animate-spin' : 'fill-white'} />
            <span className="hidden sm:inline">{pipelineRunning ? 'Processing…' : 'Run Pipeline'}</span>
            <span className="sm:hidden">{pipelineRunning ? '…' : 'Run'}</span>
          </button>
        )}

        {/* Active Adam Voice AI Trigger Button */}
        {onOpenVoiceAssistant && (
          <button
            onClick={onOpenVoiceAssistant}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gradient-to-r from-[#0b1638] via-[#0f2356] to-[#0b1638] hover:from-[#12245a] hover:to-[#173075] border border-cyan-400/40 hover:border-cyan-300 rounded-full text-xs text-white transition-all cursor-pointer shadow-[0_0_15px_rgba(0,240,255,0.25)] hover:shadow-[0_0_20px_rgba(0,240,255,0.45)] group shimmer-sweep-hover"
            title="Talk to Adam (AI Voice Assistant Active)"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <Mic size={13} className="text-cyan-300 group-hover:scale-110 transition-transform" />
            <span className="font-bold text-[11px] text-cyan-200 hidden md:inline">Talk to Adam</span>
          </button>
        )}

        {/* Interactive Notification Bell with Drawer & Count */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotificationOpen((prev) => !prev)}
            className="relative p-2 text-gray-400 hover:text-white rounded-full hover:bg-[#101b3c] transition-colors cursor-pointer"
            title="System Notifications (Fatal Calls & Email Alerts)"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center ring-2 ring-[#070b19] animate-pulse">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Interactive Notifications Dropdown */}
          {notificationOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-[#0c142e] border border-cyan-500/30 rounded-2xl shadow-2xl p-3 z-50 text-xs text-gray-300 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl">
              <div className="flex items-center justify-between pb-2 border-b border-[#1b2a52] mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-white text-xs uppercase tracking-wider">
                    Notifications & Alerts
                  </span>
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-300 font-mono text-[10px] font-bold">
                    {notifications.length}
                  </span>
                </div>
                {notifications.length > 0 && (
                  <button
                    onClick={handleClearAllNotifications}
                    className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 size={11} />
                    <span>Clear All</span>
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <div className="text-center py-6 text-gray-500 font-mono text-xs">
                  No unread alerts. All compliance checks clear.
                </div>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                  {notifications.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2.5 rounded-xl border transition-all ${
                        item.type === 'fatal'
                          ? 'bg-rose-950/40 border-rose-500/30 hover:border-rose-500/60'
                          : item.type === 'email'
                          ? 'bg-emerald-950/40 border-emerald-500/30 hover:border-emerald-500/60'
                          : 'bg-[#0f1b3b] border-cyan-500/20 hover:border-cyan-500/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          {item.type === 'fatal' ? (
                            <AlertTriangle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                          ) : item.type === 'email' ? (
                            <Mail size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                          ) : (
                            <Radio size={15} className="text-cyan-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <div className="font-bold text-white text-xs leading-tight">
                              {item.title}
                            </div>
                            <div className="text-[11px] text-gray-300 mt-0.5 leading-snug">
                              {item.desc}
                            </div>
                            <div className="text-[9px] font-mono text-gray-400 mt-1">
                              {item.time}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={(e) => handleDismissNotification(item.id, e)}
                          className="text-gray-500 hover:text-white p-1 rounded cursor-pointer"
                          title="Dismiss"
                        >
                          <X size={12} />
                        </button>
                      </div>

                      {/* Quick action button */}
                      {item.type === 'fatal' && onNavigate && (
                        <div className="mt-2 pt-1 border-t border-rose-500/20 flex justify-end">
                          <button
                            onClick={() => {
                              onNavigate('calls');
                              setNotificationOpen(false);
                            }}
                            className="text-[10px] font-bold text-rose-300 hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <span>Inspect Call</span>
                            <ChevronRight size={11} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Active Workspace Desk Badge */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#08152e]/90 border border-cyan-500/35 text-xs shadow-inner">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0" />
          <span className="text-[11px] font-mono text-cyan-300 font-bold tracking-tight truncate max-w-[200px]">
            {currentUser?.workspace_name || 'Pre-order Regulatory Desk'}
          </span>
        </div>

        {/* User Profile Pill matching screenshot */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2.5 p-1 pl-1 rounded-full hover:bg-[#101b3c] transition-colors cursor-pointer"
          >
            {/* Glowing Blue Circle with AK */}
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center font-bold text-white text-xs shrink-0 shadow-[0_0_12px_rgba(0,240,255,0.4)]">
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-bold text-white leading-tight">
                {displayName}
              </div>
              <div className="text-[10px] text-gray-400 leading-tight">
                {roleName}
              </div>
            </div>
          </button>

          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-[#0c142d] border border-cyan-500/30 rounded-2xl shadow-2xl p-2 z-50 text-xs text-gray-300 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl">
              <div className="px-3 py-2 border-b border-[#1b2a52] mb-1">
                <div className="font-semibold text-white truncate text-xs">{displayName}</div>
                <div className="text-[10px] text-gray-400 truncate">
                  {currentUser?.email || 'admin@fundsindia.com'}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/20 text-blue-300">
                    <Shield size={10} />
                    <span>{roleName}</span>
                  </span>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    <span>{currentUser?.workspace_name || 'Pre-order Regulatory Desk'}</span>
                  </span>
                </div>
              </div>

              <button
                onClick={handleOpenEditProfile}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#162447] text-left cursor-pointer transition-colors text-gray-200"
              >
                <Edit3 size={13} className="text-cyan-400" />
                <span>Edit Profile</span>
              </button>

              <button
                onClick={() => {
                  setProfileOpen(false);
                  onOpenAuth();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[#162447] text-left cursor-pointer transition-colors text-gray-200"
              >
                <Key size={13} className="text-indigo-400" />
                <span>API Keys & Engine</span>
              </button>

              <button
                onClick={() => {
                  setProfileOpen(false);
                  onLogout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-500/20 text-rose-300 text-left cursor-pointer transition-colors"
              >
                <LogOut size={13} />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>

        {/* Direct 1-Click Logout Button */}
        <button
          type="button"
          onClick={onLogout}
          title="Sign Out of ADAM-AR"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 hover:text-white transition-all duration-150 cursor-pointer shadow-xs text-xs font-semibold"
        >
          <LogOut size={13} className="text-rose-400" />
          <span className="hidden md:inline">Sign Out</span>
        </button>
      </div>

      {/* Edit Profile Modal */}
      {isEditProfileOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0c142d] border border-cyan-500/40 rounded-2xl shadow-2xl w-full max-w-md p-6 text-xs animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#1b2a52] mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                  <User size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Edit Profile</h3>
                  <p className="text-[11px] text-gray-400">Update display name</p>
                </div>
              </div>
              <button
                onClick={() => setIsEditProfileOpen(false)}
                className="p-1 hover:bg-[#162447] rounded-lg text-gray-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {profileSuccess && (
              <div className="mb-3 p-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl flex items-center gap-2">
                <Check size={14} className="text-emerald-400 shrink-0" />
                <span>Profile updated successfully!</span>
              </div>
            )}

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Full Name / Display Name
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#070c1b] border border-[#1b2a52] rounded-xl text-white text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-[#070c1b] border border-[#1b2a52] rounded-xl text-white text-xs focus:border-cyan-400 focus:outline-none"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditProfileOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-[#162447] text-gray-300 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold cursor-pointer shadow-md"
                >
                  {savingProfile ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
