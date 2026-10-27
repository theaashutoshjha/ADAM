import React, { useState, useEffect, useMemo } from 'react';
import {
  Sliders,
  Plus,
  Trash2,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Filter,
  Download,
  Upload,
  ArrowUp,
  ArrowDown,
  Layers,
  ShieldAlert,
  HelpCircle,
  X,
  Save,
  Check,
  ChevronDown,
  ChevronUp,
  ListPlus,
  Sparkles,
} from 'lucide-react';
import type { WorkspaceParameter, WorkspaceSubparameter, UserProfile } from '../types';
import { api } from '../lib/api';

interface WorkspaceParametersViewProps {
  currentUser?: UserProfile | null;
  onRefreshWorkspaceData?: () => void;
}

export const WorkspaceParametersView: React.FC<WorkspaceParametersViewProps> = ({
  currentUser,
  onRefreshWorkspaceData,
}) => {
  const [parameters, setParameters] = useState<WorkspaceParameter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<{ text: string; type?: 'success' | 'error' } | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [fatalOnlyFilter, setFatalOnlyFilter] = useState(false);

  // Modal State for Add / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParam, setEditingParam] = useState<WorkspaceParameter | null>(null);
  const [modalForm, setModalForm] = useState<{
    param_key: string;
    title: string;
    category: string;
    question: string;
    fatal: boolean;
    weight: number;
    rule: string;
    subparameters: WorkspaceSubparameter[];
  }>({
    param_key: '',
    title: '',
    category: 'Quality & Compliance',
    question: '',
    fatal: false,
    weight: 10,
    rule: '',
    subparameters: [],
  });

  // Expanded cards state
  const [expandedCards, setExpandedCards] = useState<Record<number, boolean>>({});

  // Reset confirmation modal
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Load Parameters
  const loadParameters = async () => {
    setIsLoading(true);
    try {
      const res = await api.getWorkspaceParameters();
      if (res.ok && Array.isArray(res.parameters)) {
        setParameters(res.parameters);
      }
    } catch (err: any) {
      showNotice(err?.message || 'Failed to load workspace parameters', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadParameters();
  }, [currentUser?.workspace_id]);

  const showNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setSaveStatus({ text, type });
    setTimeout(() => setSaveStatus(null), 4000);
  };

  // Distinct Categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    parameters.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set)];
  }, [parameters]);

  // Filtered List
  const filteredParameters = useMemo(() => {
    return parameters.filter((p) => {
      if (fatalOnlyFilter && !p.fatal) return false;
      if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = p.title.toLowerCase().includes(q);
        const matchesKey = p.param_key.toLowerCase().includes(q);
        const matchesQuestion = p.question.toLowerCase().includes(q);
        const matchesCategory = p.category.toLowerCase().includes(q);
        const matchesSub = p.subparameters.some((s) => s.title.toLowerCase().includes(q));
        if (!matchesTitle && !matchesKey && !matchesQuestion && !matchesCategory && !matchesSub) {
          return false;
        }
      }
      return true;
    });
  }, [parameters, searchQuery, selectedCategory, fatalOnlyFilter]);

  // Metrics
  const totalCount = parameters.length;
  const fatalCount = parameters.filter((p) => p.fatal).length;
  const totalWeight = parameters.reduce((acc, p) => acc + (p.weight || 0), 0);
  const totalSubparameters = parameters.reduce((acc, p) => acc + (p.subparameters?.length || 0), 0);

  // Open Modal for Add
  const handleOpenAddModal = () => {
    if (parameters.length >= 50) {
      showNotice('Maximum limit of 50 parameters reached. Please delete an existing parameter first.', 'error');
      return;
    }
    const nextIdx = parameters.length + 1;
    const defaultKey = `P${String(nextIdx).padStart(2, '0')}`;
    setEditingParam(null);
    setModalForm({
      param_key: defaultKey,
      title: '',
      category: 'Quality & Compliance',
      question: '',
      fatal: false,
      weight: 10,
      rule: '',
      subparameters: [
        { id: `sub_${Date.now()}_1`, title: 'Verify primary requirement in interaction dialogue', mandatory: true },
      ],
    });
    setIsModalOpen(true);
  };

  // Open Modal for Edit
  const handleOpenEditModal = (p: WorkspaceParameter) => {
    setEditingParam(p);
    setModalForm({
      param_key: p.param_key,
      title: p.title,
      category: p.category || 'Quality & Compliance',
      question: p.question,
      fatal: p.fatal,
      weight: p.weight,
      rule: p.rule || '',
      subparameters: Array.isArray(p.subparameters) ? [...p.subparameters] : [],
    });
    setIsModalOpen(true);
  };

  // Save Modal Form (Create or Update)
  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalForm.title.trim()) {
      showNotice('Please specify a parameter title.', 'error');
      return;
    }
    if (!modalForm.question.trim()) {
      showNotice('Please specify the audit question or evaluation rule.', 'error');
      return;
    }

    try {
      if (editingParam) {
        // Update
        const res = await api.updateWorkspaceParameter(editingParam.id, {
          param_key: modalForm.param_key,
          title: modalForm.title,
          category: modalForm.category,
          question: modalForm.question,
          fatal: modalForm.fatal,
          weight: modalForm.weight,
          rule: modalForm.rule,
          subparameters: modalForm.subparameters,
        });
        if (!res.ok) throw new Error(res.error || 'Failed to update parameter');
        showNotice(`Parameter ${res.parameter?.param_key || ''} updated successfully!`);
      } else {
        // Create
        const res = await api.createWorkspaceParameter({
          param_key: modalForm.param_key,
          title: modalForm.title,
          category: modalForm.category,
          question: modalForm.question,
          fatal: modalForm.fatal,
          weight: modalForm.weight,
          rule: modalForm.rule,
          subparameters: modalForm.subparameters,
        });
        if (!res.ok) throw new Error(res.error || 'Failed to create parameter');
        showNotice(`New parameter ${res.parameter?.param_key || ''} added! (${parameters.length + 1}/50)`);
      }

      setIsModalOpen(false);
      await loadParameters();
      if (onRefreshWorkspaceData) onRefreshWorkspaceData();
    } catch (err: any) {
      showNotice(err?.message || 'Save failed', 'error');
    }
  };

  // Delete Parameter
  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`Are you sure you want to delete parameter "${title}"?`)) {
      return;
    }
    try {
      const res = await api.deleteWorkspaceParameter(id);
      if (!res.ok) throw new Error(res.error || 'Failed to delete parameter');
      showNotice(`Parameter deleted.`);
      await loadParameters();
      if (onRefreshWorkspaceData) onRefreshWorkspaceData();
    } catch (err: any) {
      showNotice(err?.message || 'Delete failed', 'error');
    }
  };

  // Move parameter up or down
  const handleMoveOrder = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= parameters.length) return;

    const reordered = [...parameters];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    // Reassign display_order
    const updated = reordered.map((p, idx) => ({ ...p, display_order: idx + 1 }));
    setParameters(updated);

    try {
      const res = await api.bulkSaveWorkspaceParameters(updated);
      if (!res.ok) throw new Error(res.error || 'Failed to update ordering');
      showNotice('Parameter order updated.');
    } catch (err: any) {
      showNotice(err?.message || 'Failed to reorder', 'error');
      await loadParameters();
    }
  };

  // Reset to default template
  const handleResetTemplate = async () => {
    try {
      const res = await api.resetWorkspaceParameters();
      if (!res.ok) throw new Error(res.error || 'Failed to reset template');
      setParameters(res.parameters);
      setIsResetConfirmOpen(false);
      showNotice(`Reset to official ${currentUser?.workspace_name || 'workspace'} template.`);
      if (onRefreshWorkspaceData) onRefreshWorkspaceData();
    } catch (err: any) {
      showNotice(err?.message || 'Reset failed', 'error');
    }
  };

  // Export parameters as JSON
  const handleExportJSON = () => {
    const blob = new Blob([JSON.stringify(parameters, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentUser?.workspace_id || 'workspace'}_parameters_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotice(`Exported ${parameters.length} parameters as JSON.`);
  };

  // Toggle card expansion
  const toggleCard = (id: number) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Add subparameter to form
  const handleAddSubparameter = () => {
    const newSub: WorkspaceSubparameter = {
      id: `sub_${Date.now()}_${modalForm.subparameters.length + 1}`,
      title: '',
      description: '',
      mandatory: true,
    };
    setModalForm((prev) => ({
      ...prev,
      subparameters: [...prev.subparameters, newSub],
    }));
  };

  // Remove subparameter from form
  const handleRemoveSubparameter = (idx: number) => {
    setModalForm((prev) => ({
      ...prev,
      subparameters: prev.subparameters.filter((_, i) => i !== idx),
    }));
  };

  // Update subparameter in form
  const handleUpdateSubparameter = (idx: number, field: keyof WorkspaceSubparameter, val: any) => {
    setModalForm((prev) => {
      const copy = [...prev.subparameters];
      copy[idx] = { ...copy[idx], [field]: val };
      return { ...prev, subparameters: copy };
    });
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Workspace Parameters Banner */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-cyan-500/20 shadow-2xl relative overflow-hidden bg-gradient-to-br from-[#07132a]/90 via-[#0a1b38]/80 to-[#050c1e]/90">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-cyan-500/10 via-indigo-500/10 to-transparent blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-xs font-mono font-bold tracking-wider uppercase mb-2">
              <Sliders className="w-3.5 h-3.5" />
              <span>{currentUser?.workspace_name || 'Active Workspace'} • Parameter Hub</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              Quality &amp; Compliance Rubric
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Up to 50 Parameters
              </span>
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-300 max-w-2xl">
              Configure tailored parameters, sub-parameters, and fatal regulatory compliance rules for this dedicated desk.
              All changes are isolated to this workspace database.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleOpenAddModal}
              disabled={parameters.length >= 50}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 text-slate-950 hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(6,182,212,0.35)] flex items-center gap-2 cursor-pointer transition-all border border-cyan-300/40"
            >
              <Plus className="w-4 h-4 text-slate-950" />
              <span>Add Parameter ({parameters.length}/50)</span>
            </button>

            <button
              onClick={handleExportJSON}
              title="Export Rubric as JSON"
              className="p-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">Export</span>
            </button>

            <button
              onClick={() => setIsResetConfirmOpen(true)}
              title="Reset to Workspace Default Template"
              className="p-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-rose-500/15 text-slate-200 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <RefreshCw className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Reset Template</span>
            </button>
          </div>
        </div>

        {/* Live Capacity Meter & Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-cyan-500/15">
          {/* Active Parameters vs Capacity */}
          <div className="glass-inner p-3.5 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
              <span>Active Parameters</span>
              <span className="text-cyan-300 font-bold">{totalCount} / 50</span>
            </div>
            <div className="text-xl font-black text-white">{totalCount}</div>
            <div className="w-full h-1.5 rounded-full bg-slate-800 mt-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.min(100, (totalCount / 50) * 100)}%` }}
              />
            </div>
          </div>

          {/* Fatal Parameters */}
          <div className="glass-inner p-3.5 rounded-2xl border border-white/5">
            <div className="text-[11px] font-mono text-slate-400 mb-1 flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>Fatal Rules</span>
            </div>
            <div className="text-xl font-black text-rose-400">{fatalCount}</div>
            <span className="text-[10px] text-slate-400">Triggers instant zero score</span>
          </div>

          {/* Subparameters */}
          <div className="glass-inner p-3.5 rounded-2xl border border-white/5">
            <div className="text-[11px] font-mono text-slate-400 mb-1 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Subparameters</span>
            </div>
            <div className="text-xl font-black text-indigo-300">{totalSubparameters}</div>
            <span className="text-[10px] text-slate-400">Detailed checklist items</span>
          </div>

          {/* Total Weight */}
          <div className="glass-inner p-3.5 rounded-2xl border border-white/5">
            <div className="text-[11px] font-mono text-slate-400 mb-1">Total Weight Points</div>
            <div className="text-xl font-black text-emerald-300">{totalWeight} pts</div>
            <span className="text-[10px] text-slate-400">Cumulative scoring scale</span>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {saveStatus && (
        <div
          className={`p-4 rounded-2xl text-xs font-semibold flex items-center gap-2.5 animate-in fade-in duration-200 border ${
            saveStatus.type === 'error'
              ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {saveStatus.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{saveStatus.text}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 glass-panel rounded-2xl border border-white/10">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search parameter by key, name, question, category or subparameter..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#030816]/70 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
          />
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 rounded-xl bg-[#030816]/80 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-400 cursor-pointer"
          >
            {categories.map((c) => (
              <option key={c} value={c} className="bg-slate-900 text-white">
                Category: {c}
              </option>
            ))}
          </select>

          {/* Fatal Filter Toggle */}
          <button
            type="button"
            onClick={() => setFatalOnlyFilter(!fatalOnlyFilter)}
            className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 flex items-center gap-1.5 ${
              fatalOnlyFilter
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            <span>Fatal Only</span>
          </button>
        </div>
      </div>

      {/* Parameters List */}
      {isLoading ? (
        <div className="py-20 text-center flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-cyan-400/20 border-t-cyan-400 animate-spin" />
          <span className="text-xs font-mono text-cyan-300">Loading workspace parameters…</span>
        </div>
      ) : filteredParameters.length === 0 ? (
        <div className="p-12 glass-panel rounded-3xl border border-white/10 text-center space-y-3">
          <HelpCircle className="w-10 h-10 text-slate-500 mx-auto" />
          <h3 className="text-base font-bold text-white">No Parameters Match</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {searchQuery || selectedCategory !== 'All' || fatalOnlyFilter
              ? 'Try adjusting your search criteria or clearing filters.'
              : 'This workspace has no parameters configured yet. Click "Add Parameter" or "Reset Template" to initialize.'}
          </p>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition-all cursor-pointer inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Parameter</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredParameters.map((param, index) => {
            const isExpanded = Boolean(expandedCards[param.id]);
            return (
              <div
                key={param.id}
                className={`glass-panel rounded-2xl border transition-all duration-200 overflow-hidden ${
                  param.fatal
                    ? 'border-rose-500/30 hover:border-rose-500/50 bg-gradient-to-r from-rose-950/15 via-[#081226]/80 to-[#081226]/80'
                    : 'border-white/10 hover:border-cyan-500/30 bg-[#081226]/80'
                }`}
              >
                {/* Header row */}
                <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    {/* Parameter Index & Key */}
                    <div className="flex flex-col items-center justify-center shrink-0">
                      <span className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 font-mono font-black text-xs text-cyan-300">
                        {param.param_key}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 mt-0.5">#{index + 1}</span>
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm sm:text-base font-bold text-white tracking-tight">{param.title}</h3>
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300">
                          {param.category}
                        </span>
                        {param.fatal ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-xs animate-pulse">
                            <ShieldAlert className="w-3 h-3 text-rose-400" />
                            <span>FATAL PARAMETER</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md">
                            Weight: {param.weight} pts
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed font-sans">{param.question}</p>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {/* Move Up / Down */}
                    <button
                      onClick={() => handleMoveOrder(index, 'up')}
                      disabled={index === 0}
                      title="Move Up"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-all"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleMoveOrder(index, 'down')}
                      disabled={index === parameters.length - 1}
                      title="Move Down"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-all"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>

                    {/* Edit */}
                    <button
                      onClick={() => handleOpenEditModal(param)}
                      title="Edit Parameter"
                      className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/25 cursor-pointer transition-all flex items-center gap-1 text-xs px-2.5 font-bold"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(param.id, param.title)}
                      title="Delete Parameter"
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/25 cursor-pointer transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Expand Subparameters Toggle */}
                    <button
                      onClick={() => toggleCard(param.id)}
                      title={isExpanded ? 'Collapse' : 'View Subparameters'}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer transition-all flex items-center gap-1 text-xs px-2 font-mono"
                    >
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      <span>{param.subparameters?.length || 0}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Subparameters Drawer */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-2 border-t border-white/5 bg-black/30 space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span className="flex items-center gap-1.5 text-indigo-300 font-bold">
                        <Layers className="w-3.5 h-3.5" />
                        Checklist Subparameters ({param.subparameters?.length || 0})
                      </span>
                      {param.rule && (
                        <span className="text-[11px] text-slate-400 max-w-md truncate">
                          <b>Rule:</b> {param.rule}
                        </span>
                      )}
                    </div>

                    {param.subparameters && param.subparameters.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                        {param.subparameters.map((sub, sIdx) => (
                          <div
                            key={sub.id || sIdx}
                            className="p-3 rounded-xl bg-white/[0.03] border border-white/5 text-xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-200 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                {sub.title}
                              </span>
                              {sub.mandatory && (
                                <span className="text-[9px] font-mono uppercase font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                                  Mandatory
                                </span>
                              )}
                            </div>
                            {sub.description && (
                              <p className="text-[11px] text-slate-400 pl-3">{sub.description}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic">No subparameters specified for this item.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================== */}
      {/* MODAL: ADD / EDIT PARAMETER (Up to 50)                      */}
      {/* ========================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-[#09152e] border border-cyan-500/30 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between shrink-0 bg-[#0c1c3d]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">
                    {editingParam ? 'Edit Quality Parameter' : 'Create Quality Parameter'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Workspace: <span className="text-cyan-300 font-bold">{currentUser?.workspace_name}</span> (Max 50)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white cursor-pointer transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveModal} className="p-6 space-y-4.5 overflow-y-auto flex-1 custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Parameter Code / Key */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Param Code</label>
                  <input
                    type="text"
                    required
                    value={modalForm.param_key}
                    onChange={(e) => setModalForm({ ...modalForm, param_key: e.target.value.toUpperCase() })}
                    placeholder="e.g. CS01, MFG02"
                    className="w-full px-3 py-2 bg-[#040b1a] border border-white/15 rounded-xl text-xs text-white font-mono focus:outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Category */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-300 mb-1">Category / Section</label>
                  <input
                    type="text"
                    required
                    value={modalForm.category}
                    onChange={(e) => setModalForm({ ...modalForm, category: e.target.value })}
                    placeholder="e.g. Identity Verification, Advisory, Regulatory"
                    className="w-full px-3 py-2 bg-[#040b1a] border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Parameter Title / Name</label>
                <input
                  type="text"
                  required
                  value={modalForm.title}
                  onChange={(e) => setModalForm({ ...modalForm, title: e.target.value })}
                  placeholder="e.g. Registered Mobile Number Verification"
                  className="w-full px-3 py-2 bg-[#040b1a] border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Question / Evaluation Standard */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Evaluation Question / Audit Prompt
                </label>
                <textarea
                  rows={3}
                  required
                  value={modalForm.question}
                  onChange={(e) => setModalForm({ ...modalForm, question: e.target.value })}
                  placeholder="The precise question the AI auditor checks in the call recording or dialogue..."
                  className="w-full px-3 py-2 bg-[#040b1a] border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 font-sans"
                />
              </div>

              {/* Fatal Toggle & Weight */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                {/* Fatal Parameter Switch */}
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="fatal-toggle"
                    checked={modalForm.fatal}
                    onChange={(e) => setModalForm({ ...modalForm, fatal: e.target.checked })}
                    className="w-4 h-4 mt-0.5 rounded text-rose-500 bg-slate-900 border-white/20 focus:ring-rose-500 cursor-pointer"
                  />
                  <div>
                    <label htmlFor="fatal-toggle" className="text-xs font-bold text-rose-300 cursor-pointer flex items-center gap-1.5">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                      Mark as FATAL Parameter
                    </label>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Failing this parameter triggers an immediate fatal flag and sets total compliance score to 0.
                    </p>
                  </div>
                </div>

                {/* Weight Points */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    Weight Points ({modalForm.weight} pts)
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={modalForm.weight}
                    onChange={(e) => setModalForm({ ...modalForm, weight: Number(e.target.value) })}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-slate-500">
                    <span>1 pt</span>
                    <span>50 pts</span>
                    <span>100 pts</span>
                  </div>
                </div>
              </div>

              {/* Scoring Guidance / Rule */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Scoring Rule / Guidance (Optional)
                </label>
                <input
                  type="text"
                  value={modalForm.rule}
                  onChange={(e) => setModalForm({ ...modalForm, rule: e.target.value })}
                  placeholder="e.g. PASS when calling number matches registered number; FAIL if non-authorized."
                  className="w-full px-3 py-2 bg-[#040b1a] border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Subparameters Builder */}
              <div className="space-y-2.5 pt-2 border-t border-white/10">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Subparameters &amp; Checklist Items ({modalForm.subparameters.length})</span>
                  </label>

                  <button
                    type="button"
                    onClick={handleAddSubparameter}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hover:bg-indigo-500/30 cursor-pointer flex items-center gap-1 transition-all"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                    <span>Add Sub-item</span>
                  </button>
                </div>

                {modalForm.subparameters.map((sub, sIdx) => (
                  <div key={sub.id || sIdx} className="p-3 rounded-xl bg-white/[0.02] border border-white/10 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-cyan-400">#{sIdx + 1}</span>
                      <input
                        type="text"
                        required
                        value={sub.title}
                        onChange={(e) => handleUpdateSubparameter(sIdx, 'title', e.target.value)}
                        placeholder="Subparameter title (e.g. Caller CLI Verified)"
                        className="flex-1 px-2.5 py-1.5 bg-[#040b1a] border border-white/15 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-400"
                      />
                      <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={sub.mandatory}
                          onChange={(e) => handleUpdateSubparameter(sIdx, 'mandatory', e.target.checked)}
                          className="w-3.5 h-3.5 rounded text-amber-500 bg-slate-900 border-white/20"
                        />
                        <span>Mandatory</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubparameter(sIdx)}
                        className="p-1 rounded text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={sub.description || ''}
                      onChange={(e) => handleUpdateSubparameter(sIdx, 'description', e.target.value)}
                      placeholder="Optional explanation / what the auditor should listen for..."
                      className="w-full px-2.5 py-1 bg-[#040b1a]/60 border border-white/10 rounded-lg text-[11px] text-slate-300 focus:outline-none focus:border-cyan-400 font-sans"
                    />
                  </div>
                ))}
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-white/5 hover:bg-white/10 cursor-pointer transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 hover:brightness-110 active:scale-95 shadow-[0_4px_20px_rgba(6,182,212,0.4)] cursor-pointer transition-all flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4 text-slate-950" />
                  <span>{editingParam ? 'Save Changes' : 'Create Parameter'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* CONFIRM RESET TEMPLATE MODAL                                */}
      {/* ========================================================== */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0a1630] border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Reset to Default Rubric?</h3>
                <p className="text-xs text-slate-400">
                  This will reload the official parameters for {currentUser?.workspace_name}.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Any custom parameters you created will be replaced with the curated default template for this workspace.
              This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-white/5 hover:bg-white/10 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleResetTemplate}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer transition-all"
              >
                Yes, Reset Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
