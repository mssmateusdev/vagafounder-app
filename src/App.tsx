import { useState, useEffect, useMemo } from 'react';
import { 
  Briefcase, 
  Settings, 
  Search, 
  Plus, 
  Trash2, 
  ExternalLink,
  CheckCircle2,
  X,
  RefreshCw,
  Bookmark,
  MapPin,
  Clock,
  Building2,
  Filter as FilterIcon,
  PanelLeftClose,
  PanelLeft,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Bell,
  BellOff,
  Play,
  Pause,
  EyeOff,
  Eye,
  Check
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Filter, Job, MonitorStatus } from './types';
import { JobDetailsModal } from './components/JobDetailsModal';

export default function App() {
  const [activeTab, setActiveTab] = useState<'jobs' | 'filters' | 'history' | 'settings'>('jobs');
  const [filters, setFilters] = useState<Filter[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  
  // Persistência local de ações rápidas
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('vagafounder_favorites') || '[]');
    } catch {
      return [];
    }
  });
  const [appliedJobs, setAppliedJobs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('vagafounder_applied') || '[]');
    } catch {
      return [];
    }
  });
  const [dismissedJobs, setDismissedJobs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('vagafounder_dismissed') || '[]');
    } catch {
      return [];
    }
  });

  const [showDismissed, setShowDismissed] = useState(false);
  const [historySubTab, setHistorySubTab] = useState<'favorites' | 'applied'>('favorites');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filtros rápidos em Dropdowns
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('ALL');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<'ALL' | '24H' | '3D' | '7D' | '30D'>('ALL');
  
  // Ordenação e Paginação (Padrão: 25 vagas por página)
  const [sortField, setSortField] = useState<'publishedAt' | 'title' | 'company'>('publishedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  // Status de Monitoramento do Rust/Tauri
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null);

  // Responsividade e Modo de Visualização
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form states para criação de filtro
  const [keyword, setKeyword] = useState('');
  const [location, setLocation] = useState('');
  const [modality, setModality] = useState('Qualquer');
  const [contractType, setContractType] = useState('Todos');
  const [timeWindow, setTimeWindow] = useState('30d');

  // Sincronizar localStorage
  useEffect(() => {
    localStorage.setItem('vagafounder_favorites', JSON.stringify(favorites));
  }, [favorites]);

  useEffect(() => {
    localStorage.setItem('vagafounder_applied', JSON.stringify(appliedJobs));
  }, [appliedJobs]);

  useEffect(() => {
    localStorage.setItem('vagafounder_dismissed', JSON.stringify(dismissedJobs));
  }, [dismissedJobs]);

  // Carregar dados e inicializar
  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const savedFilters = await invoke<Filter[]>('get_filters');
        setFilters(savedFilters);

        try {
          const status = await invoke<MonitorStatus>('get_status');
          setMonitorStatus(status);
        } catch (e) {
          console.warn('Status indisponível:', e);
        }

        const cached = await invoke<Job[]>('get_jobs');
        if (cached && cached.length > 0) {
          setJobs(cached);
        } else {
          const fetchedJobs = await invoke<Job[]>('scan_now');
          setJobs(fetchedJobs);
        }
      } catch (err) {
        console.error('Erro na inicialização:', err);
      } finally {
        setIsLoading(false);
      }
    }

    init();

    const unlistenJobs = listen<Job[]>('jobs-updated', (event) => {
      if (event.payload && event.payload.length > 0) {
        setJobs(event.payload);
      }
    });

    const unlistenStatus = listen<MonitorStatus>('monitor-status', (event) => {
      if (event.payload) {
        setMonitorStatus(event.payload);
      }
    });

    return () => {
      unlistenJobs.then((u) => u());
      unlistenStatus.then((u) => u());
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Recarregar vagas manualmente via Rust
  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      const res = await invoke<Job[]>('scan_now');
      setJobs(res);
      showToast(`Varredura concluída! ${res.length} vagas encontradas.`);
    } catch (err) {
      console.error('Erro ao atualizar vagas:', err);
      showToast('Erro ao atualizar vagas.');
    } finally {
      setIsLoading(false);
    }
  };

  // Alternar pausa no monitoramento
  const handleTogglePause = async () => {
    const nextPaused = !monitorStatus?.paused;
    try {
      await invoke('set_paused', { paused: nextPaused });
      setMonitorStatus(prev => prev ? { ...prev, paused: nextPaused } : null);
      showToast(nextPaused ? 'Monitoramento pausado.' : 'Monitoramento retomado!');
    } catch (err) {
      console.error('Erro ao alternar pausa:', err);
    }
  };

  // Alternar silenciamento de notificações
  const handleToggleMute = async () => {
    const nextMuted = !monitorStatus?.muted;
    try {
      await invoke('set_muted', { muted: nextMuted });
      setMonitorStatus(prev => prev ? { ...prev, muted: nextMuted } : null);
      showToast(nextMuted ? 'Notificações silenciadas.' : 'Notificações ativadas!');
    } catch (err) {
      console.error('Erro ao alternar silenciamento:', err);
    }
  };

  // Abrir link no navegador padrão do sistema através do Rust
  const handleOpenLink = async (url: string) => {
    if (!url) return;
    try {
      showToast('Abrindo link oficial da vaga no seu navegador...');
      await invoke('open_url', { url });
    } catch (err) {
      console.error('Erro ao abrir link externo via Rust:', err);
      window.open(url, '_blank');
    }
  };

  // Abrir Modal de Detalhes da Vaga
  const handleOpenDetails = (job: Job) => {
    setSelectedJob(job);
    setIsDetailsModalOpen(true);
  };

  // Fechar Modal de Detalhes
  const handleCloseDetails = () => {
    setIsDetailsModalOpen(false);
    setSelectedJob(null);
  };

  // Salvar novo filtro
  const handleSaveFilter = async () => {
    if (!keyword.trim() && !location.trim()) return;

    let finalLocation = location.trim();
    if (modality === 'Apenas Remoto') {
      finalLocation = 'Remoto';
    } else if (modality === 'Presencial' && finalLocation) {
      finalLocation = `${finalLocation} (Presencial)`;
    } else if (modality === 'Híbrido' && finalLocation) {
      finalLocation = `${finalLocation} (Híbrido)`;
    }

    const newFilter: Filter = {
      id: Date.now().toString(),
      keyword: keyword.trim() || 'Vagas em Geral',
      location: finalLocation || 'Recife (até 80 km)',
      type: contractType,
      timeWindow,
      active: true,
    };

    try {
      const updated = await invoke<Filter[]>('save_filter', { filter: newFilter });
      setFilters(updated);
      setIsFilterModalOpen(false);

      setKeyword('');
      setLocation('');
      setModality('Qualquer');
      setContractType('Todos');
      setTimeWindow('30d');

      setIsLoading(true);
      const res = await invoke<Job[]>('scan_now');
      setJobs(res);
      showToast(`Filtro "${newFilter.keyword}" salvo!`);
    } catch (err) {
      console.error('Erro ao salvar filtro:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Remover filtro
  const handleDeleteFilter = async (id: string) => {
    try {
      const updated = await invoke<Filter[]>('delete_filter', { id });
      setFilters(updated);
      showToast('Filtro removido.');
    } catch (err) {
      console.error('Erro ao remover filtro:', err);
    }
  };

  // Favoritar / Desfavoritar vaga
  const toggleFavorite = (jobId: string) => {
    setFavorites(prev => {
      const isFav = prev.includes(jobId);
      const next = isFav ? prev.filter(id => id !== jobId) : [...prev, jobId];
      showToast(isFav ? 'Vaga removida dos favoritos.' : 'Vaga favoritada! ⭐');
      return next;
    });
  };

  // Marcar como "Já me candidatei"
  const toggleApplied = (jobId: string) => {
    setAppliedJobs(prev => {
      const isApplied = prev.includes(jobId);
      const next = isApplied ? prev.filter(id => id !== jobId) : [...prev, jobId];
      showToast(isApplied ? 'Marcação de candidatura removida.' : 'Marcada como: Já me candidatei! ✅');
      return next;
    });
  };

  // Descartar / Ocultar vaga
  const handleDismissJob = (jobId: string) => {
    setDismissedJobs(prev => {
      const isDismissed = prev.includes(jobId);
      const next = isDismissed ? prev.filter(id => id !== jobId) : [...prev, jobId];
      showToast(isDismissed ? 'Vaga restaurada na lista.' : 'Vaga ocultada da lista.');
      return next;
    });
  };

  // Formatação limpa de localidade (sem repetições redundantes)
  const formatLocation = (rawLocation: string, modality?: string): string => {
    if (!rawLocation) return modality ? `Brasil (${modality})` : 'Brasil';
    
    let loc = rawLocation
      .replace(/,\s*Pernambuco/gi, '')
      .replace(/,\s*Brazil/gi, '')
      .replace(/,\s*Brasil/gi, '')
      .replace(/\s*-\s*PE/gi, '')
      .trim();

    const parenMatch = loc.match(/\(([^)]+)\)/);
    const foundModality = parenMatch ? parenMatch[1] : (modality || 'Presencial');
    loc = loc.replace(/\s*\([^)]*\)/g, '').trim();

    if (!loc || loc.toLowerCase() === 'brasil' || loc.toLowerCase() === 'brazil') {
      return foundModality.toLowerCase().includes('remot') ? 'Brasil (Remoto)' : 'Brasil (Presencial)';
    }

    return `${loc} (${foundModality})`;
  };

  // Badge da Fonte
  const renderSourceBadge = (source: string) => {
    const s = (source || '').toLowerCase();
    if (s.includes('gupy')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
          Gupy
        </span>
      );
    }
    if (s.includes('linkedin')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#0A66C2]/10 text-[#0A66C2] border border-[#0A66C2]/20 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0A66C2]"></span>
          LinkedIn
        </span>
      );
    }
    if (s.includes('indeed')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#003A9B]/10 text-[#003A9B] border border-[#003A9B]/25 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#003A9B]"></span>
          Indeed
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
        {source}
      </span>
    );
  };

  // Alternar ordenação
  const handleSort = (field: 'publishedAt' | 'title' | 'company') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'publishedAt' ? 'desc' : 'asc');
    }
    setCurrentPage(1);
  };

  // Filtragem e Ordenação
  const filteredAndSortedJobs = useMemo(() => {
    const filtered = jobs.filter(job => {
      const isDismissed = dismissedJobs.includes(job.id);
      if (!showDismissed && isDismissed && activeTab !== 'history') {
        return false;
      }

      const titleLower = (job.title || '').toLowerCase();
      const companyLower = (job.company || '').toLowerCase();
      const locLower = (job.location || '').toLowerCase();
      const searchLower = searchQuery.toLowerCase();

      // Busca textual em tempo real
      const matchesSearch = searchQuery === '' || 
        titleLower.includes(searchLower) ||
        companyLower.includes(searchLower) ||
        locLower.includes(searchLower);

      // Fonte
      const jobSourceLower = (job.source || '').toLowerCase();
      const matchesSource = selectedSource === 'ALL' || jobSourceLower === selectedSource.toLowerCase();

      // Local / Modalidade
      let matchesCity = true;
      if (selectedCityFilter === 'RECIFE') {
        matchesCity = locLower.includes('recife');
      } else if (selectedCityFilter === 'JABOATAO') {
        matchesCity = locLower.includes('jaboat') || locLower.includes('jaboatão');
      } else if (selectedCityFilter === 'METRO_80KM') {
        matchesCity = locLower.includes('recife') || locLower.includes('jaboat') || locLower.includes('olinda') || 
          locLower.includes('paulista') || locLower.includes('camaragibe') || locLower.includes('cabo') || 
          locLower.includes('ipojuca') || locLower.includes('igarassu') || locLower.includes('moreno') || 
          locLower.includes('goiana') || locLower.includes('vitoria') || locLower.includes('pernambuco');
      } else if (selectedCityFilter === 'REMOTO') {
        matchesCity = locLower.includes('remoto');
      } else if (selectedCityFilter === 'PRESENCIAL') {
        matchesCity = locLower.includes('presencial') || (!locLower.includes('remoto') && !locLower.includes('híbrido') && !locLower.includes('hibrido'));
      } else if (selectedCityFilter === 'HIBRIDO') {
        matchesCity = locLower.includes('híbrido') || locLower.includes('hibrido');
      }

      // Área / Cargo
      let matchesRole = true;
      const typeLower = (job.type || '').toLowerCase();
      if (selectedRoleFilter === 'ADMIN') {
        matchesRole = titleLower.includes('auxiliar') || titleLower.includes('administrativ') || titleLower.includes('assistente') || typeLower.includes('auxiliar');
      } else if (selectedRoleFilter === 'RH') {
        matchesRole = titleLower.includes('rh') || 
          titleLower.includes('recursos humanos') || 
          titleLower.includes('departamento pessoal') || 
          titleLower.includes('recrutamento') || 
          titleLower.includes('gestao de pessoas') || 
          titleLower.includes('gestão de pessoas') || 
          titleLower.includes('talent') || 
          typeLower.includes('rh');
      } else if (selectedRoleFilter === 'SUPORTE') {
        matchesRole = titleLower.includes('suporte') || 
          titleLower.includes('helpdesk') || 
          titleLower.includes('help desk') || 
          titleLower.includes('service desk') || 
          titleLower.includes('tecnico de ti') || 
          titleLower.includes('técnico de ti') || 
          titleLower.includes('informatica') || 
          titleLower.includes('informática') || 
          titleLower.includes('redes') || 
          titleLower.includes('infraestrutura') || 
          typeLower.includes('suporte');
      } else if (selectedRoleFilter === 'APRENDIZ') {
        matchesRole = titleLower.includes('aprendiz') || typeLower.includes('aprendiz');
      } else if (selectedRoleFilter === 'ESTAGIO') {
        matchesRole = titleLower.includes('estágio') || titleLower.includes('estagio') || typeLower.includes('estágio') || typeLower.includes('estagio');
      } else if (selectedRoleFilter === 'ATENDIMENTO') {
        matchesRole = titleLower.includes('atendente') || titleLower.includes('recep') || titleLower.includes('caixa') || titleLower.includes('suporte ao cliente') || titleLower.includes('vendas');
      } else if (selectedRoleFilter === 'DEV') {
        matchesRole = titleLower.includes('desenvolvedor') || titleLower.includes('software') || titleLower.includes('programador') || titleLower.includes('dev') || titleLower.includes('frontend') || titleLower.includes('backend');
      }

      // Período
      let matchesTime = true;
      if (selectedTimeFilter !== 'ALL') {
        const pubTime = new Date(job.publishedAt).getTime();
        if (!isNaN(pubTime)) {
          const diffHours = (Date.now() - pubTime) / (1000 * 60 * 60);
          if (selectedTimeFilter === '24H') matchesTime = diffHours <= 24;
          else if (selectedTimeFilter === '3D') matchesTime = diffHours <= 72;
          else if (selectedTimeFilter === '7D') matchesTime = diffHours <= 168;
          else if (selectedTimeFilter === '30D') matchesTime = diffHours <= 720;
        }
      }

      // Aba Histórico
      if (activeTab === 'history') {
        const isFav = favorites.includes(job.id);
        const isApp = appliedJobs.includes(job.id);
        const matchHistory = historySubTab === 'favorites' ? isFav : isApp;
        return matchesSearch && matchesSource && matchesCity && matchesRole && matchesTime && matchHistory;
      }

      return matchesSearch && matchesSource && matchesCity && matchesRole && matchesTime;
    });

    return filtered.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'publishedAt') {
        const dateA = new Date(a.publishedAt).getTime() || 0;
        const dateB = new Date(b.publishedAt).getTime() || 0;
        comparison = dateA - dateB;
      } else if (sortField === 'title') {
        comparison = (a.title || '').localeCompare(b.title || '');
      } else if (sortField === 'company') {
        comparison = (a.company || '').localeCompare(b.company || '');
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [jobs, searchQuery, selectedSource, selectedCityFilter, selectedRoleFilter, selectedTimeFilter, activeTab, favorites, appliedJobs, dismissedJobs, showDismissed, historySubTab, sortField, sortDirection]);

  // Paginação (Padrão 25)
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedJobs.length / itemsPerPage));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedJobs.slice(start, start + itemsPerPage);
  }, [filteredAndSortedJobs, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedSource, selectedCityFilter, selectedRoleFilter, selectedTimeFilter, activeTab, historySubTab]);

  const nextCheckMinutes = useMemo(() => {
    if (!monitorStatus?.nextCheckAt) return null;
    const diffMs = new Date(monitorStatus.nextCheckAt).getTime() - Date.now();
    if (diffMs <= 0) return 'em instantes';
    const mins = Math.ceil(diffMs / 60000);
    return `em ${mins} min`;
  }, [monitorStatus]);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 antialiased overflow-hidden select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700 animate-in slide-in-from-bottom duration-200">
          <ExternalLink size={16} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* ---------------- SIDEBAR ---------------- */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-slate-900 flex flex-col justify-between shrink-0 shadow-2xl border-r border-slate-800 transition-all duration-300 ease-in-out z-20`}>
        <div>
          <div className="p-4 flex items-center justify-between border-b border-slate-800/80">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 shrink-0">
                <Briefcase size={20} className="stroke-[2.5]" />
              </div>
              {!isSidebarCollapsed && (
                <div className="truncate">
                  <h1 className="text-white font-bold text-base tracking-tight leading-none">VagaFounder</h1>
                  <p className="text-[11px] text-emerald-400 font-semibold tracking-wide mt-1">by: MateusDeveleoper</p>
                </div>
              )}
            </div>

            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title={isSidebarCollapsed ? "Expandir barra lateral" : "Recolher barra lateral"}
            >
              {isSidebarCollapsed ? <PanelLeft size={17} /> : <PanelLeftClose size={17} />}
            </button>
          </div>

          <nav className="p-3 space-y-1.5">
            <button 
              onClick={() => setActiveTab('jobs')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 cursor-pointer ${
                activeTab === 'jobs' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Painel de Vagas"
            >
              <Briefcase size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>Painel de Vagas</span>}
              {!isSidebarCollapsed && jobs.length > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                  {jobs.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('filters')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 cursor-pointer ${
                activeTab === 'filters' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Filtros de Monitoramento"
            >
              <FilterIcon size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>Filtros Ativos</span>}
              {!isSidebarCollapsed && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-semibold border border-slate-700">
                  {filters.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 cursor-pointer ${
                activeTab === 'history' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Candidaturas e Favoritos"
            >
              <Bookmark size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>Minhas Vagas</span>}
              {!isSidebarCollapsed && (favorites.length > 0 || appliedJobs.length > 0) && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-semibold border border-amber-500/30">
                  {favorites.length + appliedJobs.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('settings')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 cursor-pointer ${
                activeTab === 'settings' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title="Configurações do Monitor"
            >
              <Settings size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>Configurações</span>}
            </button>
          </nav>
        </div>

        <div className="p-3 border-t border-slate-800/80">
          <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-800">
            <div className="flex items-center justify-between mb-1">
              {!isSidebarCollapsed && (
                <span className="text-xs font-semibold text-slate-300">
                  {monitorStatus?.paused ? 'Monitor Pausado' : 'Monitor Ativo'}
                </span>
              )}
              <span className="relative flex h-2.5 w-2.5">
                {!monitorStatus?.paused && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${monitorStatus?.paused ? 'bg-amber-400' : 'bg-emerald-500'}`}></span>
              </span>
            </div>
            {!isSidebarCollapsed && (
              <p className="text-[11px] text-slate-400 leading-tight">
                Recife & até 80km • Gupy, LinkedIn e Indeed
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* ---------------- CONTEÚDO PRINCIPAL ---------------- */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Topbar Superior Limpa */}
        <header className="h-16 bg-white border-b border-slate-200/90 flex items-center justify-between px-6 shrink-0 gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all border border-slate-200 cursor-pointer"
              title="Alternar barra lateral"
            >
              {isSidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
              <span>Dashboard</span>
              <span>/</span>
              <span className="text-slate-900 font-semibold capitalize">
                {activeTab === 'jobs' ? 'Vagas Recentes' : activeTab === 'filters' ? 'Filtros' : activeTab === 'history' ? 'Minhas Vagas' : 'Configurações'}
              </span>
              <span className="text-slate-300">•</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-bold border border-indigo-200/70 shadow-2xs">
                by: MateusDeveleoper
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Indicador de Status Discreto */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100/90 rounded-xl border border-slate-200 text-xs">
              <span className="relative flex h-2 w-2">
                {(!monitorStatus?.paused && !isLoading) && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  isLoading ? 'bg-indigo-500 animate-spin' : monitorStatus?.paused ? 'bg-amber-400' : 'bg-emerald-500'
                }`}></span>
              </span>
              <span className="font-semibold text-slate-700">
                {isLoading ? 'Varrendo...' : monitorStatus?.paused ? 'Pausado' : 'Ativo'}
              </span>
              {(!monitorStatus?.paused && nextCheckMinutes) && (
                <span className="text-[11px] text-slate-400 border-l border-slate-300 pl-2">
                  Próxima {nextCheckMinutes}
                </span>
              )}

              <button
                onClick={handleTogglePause}
                title={monitorStatus?.paused ? "Retomar monitoramento" : "Pausar monitoramento"}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer ml-0.5"
              >
                {monitorStatus?.paused ? <Play size={12} className="text-emerald-600" /> : <Pause size={12} />}
              </button>

              <button
                onClick={handleToggleMute}
                title={monitorStatus?.muted ? "Ativar notificações" : "Silenciar notificações"}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                {monitorStatus?.muted ? <BellOff size={12} className="text-rose-500" /> : <Bell size={12} />}
              </button>
            </div>

            {/* Alternador de Modo: Tabela vs Cards */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-medium shrink-0">
              <button
                onClick={() => setViewMode('table')}
                title="Modo Tabela Completa"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'table' ? 'bg-white shadow-xs text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List size={15} />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                title="Modo Grade / Cards"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'cards' ? 'bg-white shadow-xs text-indigo-600' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid size={15} />
              </button>
            </div>

            {/* Botão de Varredura Imediata */}
            <button 
              onClick={handleRefresh}
              disabled={isLoading}
              title="Buscar novas vagas agora em todas as fontes"
              className="flex items-center gap-1.5 px-3 py-1.5 text-slate-700 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-slate-200 text-xs font-semibold cursor-pointer shrink-0"
            >
              <RefreshCw size={13} className={`${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
              <span className="hidden sm:inline">{isLoading ? 'Buscando...' : 'Verificar Agora'}</span>
            </button>
          </div>
        </header>

        {/* ---------------- BARRA DE FILTROS MINIMALISTA EM LINHA ÚNICA ---------------- */}
        {activeTab === 'jobs' && (
          <div className="bg-white border-b border-slate-200/90 px-6 py-2.5 shrink-0 shadow-2xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* 1. Busca Textual em Tempo Real */}
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar cargo, empresa, palavra-chave..." 
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 hover:bg-slate-100/80 focus:bg-white text-xs border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* 2. Dropdown: Período */}
              <div className="shrink-0">
                <select
                  value={selectedTimeFilter}
                  onChange={(e) => setSelectedTimeFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100/80 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 cursor-pointer transition-all"
                >
                  <option value="ALL">Período: Todas</option>
                  <option value="24H">Últimas 24h</option>
                  <option value="3D">Últimos 3 dias</option>
                  <option value="7D">Últimos 7 dias</option>
                  <option value="30D">Últimos 30 dias</option>
                </select>
              </div>

              {/* 3. Dropdown: Local / Modalidade */}
              <div className="shrink-0">
                <select
                  value={selectedCityFilter}
                  onChange={(e) => setSelectedCityFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100/80 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 cursor-pointer transition-all"
                >
                  <option value="ALL">Local: Todos</option>
                  <option value="RECIFE">Recife</option>
                  <option value="JABOATAO">Jaboatão</option>
                  <option value="METRO_80KM">Recife (Raio 80km)</option>
                  <option value="REMOTO">Remoto</option>
                  <option value="HIBRIDO">Híbrido</option>
                  <option value="PRESENCIAL">Presencial</option>
                </select>
              </div>

              {/* 4. Dropdown: Área / Tipo de Vaga */}
              <div className="shrink-0">
                <select
                  value={selectedRoleFilter}
                  onChange={(e) => setSelectedRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 hover:bg-slate-100/80 rounded-xl text-xs font-medium text-slate-700 outline-none focus:border-indigo-500 cursor-pointer transition-all"
                >
                  <option value="ALL">Todos os Cargos</option>
                  <option value="DEV">TI & Dev</option>
                  <option value="APRENDIZ">Jovem Aprendiz</option>
                  <option value="ESTAGIO">Estágio</option>
                  <option value="ADMIN">Auxiliar Administrativo</option>
                  <option value="RH">Recursos Humanos (RH)</option>
                  <option value="SUPORTE">Suporte de TI</option>
                  <option value="ATENDIMENTO">Atendimento / Recepção</option>
                </select>
              </div>

              {/* 5. Pills de Fonte Compactas */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs font-medium shrink-0">
                <button
                  onClick={() => setSelectedSource('ALL')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    selectedSource === 'ALL' ? 'bg-white shadow-xs text-slate-900 font-semibold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Todas
                </button>
                <button
                  onClick={() => setSelectedSource('LinkedIn')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    selectedSource.toLowerCase() === 'linkedin' ? 'bg-[#0A66C2] text-white font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  LinkedIn
                </button>
                <button
                  onClick={() => setSelectedSource('Gupy')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    selectedSource.toLowerCase() === 'gupy' ? 'bg-indigo-600 text-white font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Gupy
                </button>
                <button
                  onClick={() => setSelectedSource('Indeed')}
                  className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                    selectedSource.toLowerCase() === 'indeed' ? 'bg-[#003A9B] text-white font-semibold shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Indeed
                </button>
              </div>

              {/* 6. Botão "+ Adicionar Busca" */}
              <button 
                onClick={() => setIsFilterModalOpen(true)}
                className="bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 ml-auto"
              >
                <Plus size={14} />
                <span>+ Adicionar Busca</span>
              </button>
            </div>
          </div>
        )}

        {/* Subheader da Aba Minhas Vagas */}
        {activeTab === 'history' && (
          <div className="bg-white border-b border-slate-200/90 px-6 py-2.5 flex items-center gap-3 shrink-0 text-xs shadow-2xs">
            <span className="text-slate-500 font-semibold">Exibir:</span>
            <button
              onClick={() => setHistorySubTab('favorites')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                historySubTab === 'favorites' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'bg-slate-50 text-slate-600 border border-slate-200'
              }`}
            >
              <Bookmark size={13} className={historySubTab === 'favorites' ? 'fill-white' : ''} />
              <span>Salvas / Favoritas ({favorites.length})</span>
            </button>
            <button
              onClick={() => setHistorySubTab('applied')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                historySubTab === 'applied' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'bg-slate-50 text-slate-600 border border-slate-200'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>Já me Candidatei ({appliedJobs.length})</span>
            </button>
          </div>
        )}

        {/* ---------------- MAIN CONTENT ---------------- */}
        <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6 w-full">
          {(activeTab === 'jobs' || activeTab === 'history') && (
            <div className="w-full space-y-4">
              {/* Cabeçalho Limpo */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
                    <span>
                      {activeTab === 'history' 
                        ? (historySubTab === 'favorites' ? 'Vagas Favoritas' : 'Vagas Candidatadas') 
                        : 'Oportunidades em Aberto'}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/70">
                      {filteredAndSortedJobs.length} vagas encontradas
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {activeTab === 'history' 
                      ? 'Oportunidades marcadas para acompanhamento do processo seletivo.'
                      : 'Varredura em tempo real no Gupy, LinkedIn e Indeed (Recife, até 80 km e Remoto).'}
                  </p>
                </div>

                {dismissedJobs.length > 0 && activeTab === 'jobs' && (
                  <button
                    onClick={() => setShowDismissed(!showDismissed)}
                    className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {showDismissed ? <Eye size={12} /> : <EyeOff size={12} />}
                    <span>{showDismissed ? 'Ocultar descartadas' : `Ver ${dismissedJobs.length} descartadas`}</span>
                  </button>
                )}
              </div>

              {/* LISTAGEM VAZIA */}
              {filteredAndSortedJobs.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col items-center justify-center py-20 text-center px-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-500 mb-3">
                    <Search size={28} />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900">
                    {isLoading ? 'Varrendo Gupy, LinkedIn e Indeed...' : 'Nenhuma vaga correspondente encontrada'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    {isLoading 
                      ? 'Consultando vagas até 80 km de Recife e vagas remotas...'
                      : 'Altere o período, área ou local nos filtros acima para expandir os resultados.'}
                  </p>
                  {!isLoading && (
                    <button
                      onClick={handleRefresh}
                      className="mt-4 px-4 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-semibold hover:bg-indigo-100 transition-colors cursor-pointer"
                    >
                      Recarregar Vagas
                    </button>
                  )}
                </div>
              ) : viewMode === 'cards' ? (
                /* ---------------- MODO CARDS ---------------- */
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {paginatedJobs.map((job) => {
                      const isFav = favorites.includes(job.id);
                      const isApplied = appliedJobs.includes(job.id);
                      const isDismissed = dismissedJobs.includes(job.id);

                      return (
                        <div 
                          key={job.id} 
                          className={`bg-white rounded-2xl border ${
                            isApplied ? 'border-emerald-300 ring-1 ring-emerald-300/40' : 'border-slate-200/90'
                          } p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group ${
                            isDismissed ? 'opacity-50 bg-slate-50' : ''
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                {renderSourceBadge(job.source)}

                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                                  <Clock size={11} />
                                  {formatDistanceToNow(new Date(job.publishedAt), { addSuffix: true, locale: ptBR })}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => toggleApplied(job.id)}
                                  title={isApplied ? "Remover marcação" : "Marcar como já me candidatei"}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isApplied ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'border-slate-200 text-slate-300 hover:text-emerald-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <CheckCircle2 size={14} className={isApplied ? 'fill-emerald-100' : ''} />
                                </button>

                                <button 
                                  onClick={() => toggleFavorite(job.id)}
                                  title={isFav ? "Remover dos favoritos" : "Salvar vaga"}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isFav ? 'bg-amber-50 border-amber-300 text-amber-500' : 'border-slate-200 text-slate-300 hover:text-amber-500 hover:bg-slate-50'
                                  }`}
                                >
                                  <Bookmark size={14} className={isFav ? 'fill-amber-500' : ''} />
                                </button>

                                <button 
                                  onClick={() => handleDismissJob(job.id)}
                                  title={isDismissed ? "Reexibir vaga" : "Ocultar vaga"}
                                  className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-lg transition-all cursor-pointer"
                                >
                                  {isDismissed ? <Eye size={14} /> : <EyeOff size={14} />}
                                </button>
                              </div>
                            </div>

                            {isApplied && (
                              <div className="mb-2">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <Check size={11} className="stroke-[3]" />
                                  Já me candidatei
                                </span>
                              </div>
                            )}

                            <h3 
                              onClick={() => handleOpenDetails(job)}
                              title="Clique para ver os detalhes completos da vaga"
                              className="font-bold text-slate-900 text-sm hover:text-indigo-600 transition-colors cursor-pointer line-clamp-2 leading-snug flex items-start justify-between gap-1 group/title"
                            >
                              <span>{job.title}</span>
                              <Eye size={14} className="text-slate-300 group-hover/title:text-indigo-600 transition-colors shrink-0 mt-0.5" />
                            </h3>

                            <div className="flex items-center gap-1.5 text-xs text-slate-600 font-medium mt-2">
                              <Building2 size={13} className="text-slate-400 shrink-0" />
                              <span className="truncate">{job.company}</span>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1.5">
                              <MapPin size={13} className="text-indigo-500 shrink-0" />
                              <span className="truncate">{formatLocation(job.location, job.modality)}</span>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-1.5">
                              <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${
                                job.type.includes('Aprendiz')
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : job.type.includes('RH')
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : job.type.includes('Suporte')
                                  ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                                  : job.type.includes('Estágio')
                                  ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                  : job.type.includes('Auxiliar')
                                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              }`}>
                                {job.type}
                              </span>
                            </div>
                          </div>

                          <div className="mt-5 pt-3 border-t border-slate-100">
                            <button 
                              onClick={() => handleOpenLink(job.url)}
                              className="w-full group/btn relative inline-flex items-center justify-center gap-2 py-2 px-4 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer border border-emerald-500/40"
                              title="Abrir página oficial de inscrição"
                            >
                              <span className="tracking-wide uppercase text-[11px]">Candidatar-se</span>
                              <ExternalLink size={13} className="stroke-[2.2] group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Paginação para Cards */}
                  <div className="bg-white rounded-2xl border border-slate-200/90 p-4 flex items-center justify-between flex-wrap gap-3">
                    <span className="text-xs text-slate-500">
                      Exibindo <span className="font-semibold text-slate-900">{filteredAndSortedJobs.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span>–<span className="font-semibold text-slate-900">{Math.min(currentPage * itemsPerPage, filteredAndSortedJobs.length)}</span> de <span className="font-semibold text-slate-900">{filteredAndSortedJobs.length}</span> vagas
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-xs font-medium flex items-center gap-1"
                        title="Página Anterior"
                      >
                        <ChevronLeft size={14} />
                        <span>Anterior</span>
                      </button>

                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum = i + 1;
                        if (totalPages > 5 && currentPage > 3) {
                          pageNum = Math.min(totalPages - 4, currentPage - 2) + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              currentPage === pageNum ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-xs font-medium flex items-center gap-1"
                        title="Próxima Página"
                      >
                        <span>Próxima</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ---------------- MODO TABELA ---------------- */
                <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden w-full">
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-left border-collapse table-auto">
                      <thead>
                        <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                          <th className="py-3 px-3 w-10 text-center">#</th>

                          <th 
                            className="py-3 px-3 min-w-[240px] cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => handleSort('title')}
                            title="Ordenar por Título"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Título da Vaga</span>
                              {sortField === 'title' ? (
                                sortDirection === 'asc' ? <ArrowUp size={13} className="text-indigo-600" /> : <ArrowDown size={13} className="text-indigo-600" />
                              ) : (
                                <ArrowUpDown size={12} className="text-slate-400" />
                              )}
                            </div>
                          </th>

                          <th 
                            className="py-3 px-3 w-36 max-w-[150px] cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => handleSort('company')}
                            title="Ordenar por Empresa"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Empresa</span>
                              {sortField === 'company' ? (
                                sortDirection === 'asc' ? <ArrowUp size={13} className="text-indigo-600" /> : <ArrowDown size={13} className="text-indigo-600" />
                              ) : (
                                <ArrowUpDown size={12} className="text-slate-400" />
                              )}
                            </div>
                          </th>

                          <th className="py-3 px-3 w-24 text-center">Fonte</th>
                          <th className="py-3 px-3 min-w-[160px]">Local / Modalidade</th>
                          <th className="py-3 px-3 w-32">Tipo</th>

                          <th 
                            className="py-3 px-3 w-32 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors select-none"
                            onClick={() => handleSort('publishedAt')}
                            title="Ordenar por Data de Publicação"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Publicada</span>
                              {sortField === 'publishedAt' ? (
                                sortDirection === 'asc' ? <ArrowUp size={13} className="text-indigo-600" /> : <ArrowDown size={13} className="text-indigo-600" />
                              ) : (
                                <ArrowUpDown size={12} className="text-slate-400" />
                              )}
                            </div>
                          </th>

                          <th className="py-3 px-3 w-48 min-w-[190px] text-center font-extrabold text-emerald-800 bg-emerald-50/50 whitespace-nowrap">
                            Ações / Inscrição
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                        {paginatedJobs.map((job, idx) => {
                          const isFav = favorites.includes(job.id);
                          const isApplied = appliedJobs.includes(job.id);
                          const isDismissed = dismissedJobs.includes(job.id);

                          return (
                            <tr 
                              key={job.id} 
                              className={`hover:bg-slate-50/80 transition-colors group ${
                                isApplied ? 'bg-emerald-50/20' : ''
                              } ${isDismissed ? 'opacity-50 bg-slate-50' : ''}`}
                            >
                              <td className="py-3 px-3 text-xs text-slate-400 font-mono text-center">
                                {(currentPage - 1) * itemsPerPage + idx + 1}
                              </td>

                              <td className="py-3 px-3">
                                <div className="space-y-1">
                                  <div 
                                    className="font-bold text-slate-900 text-xs sm:text-sm hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1.5 group/title"
                                    onClick={() => handleOpenDetails(job)}
                                    title="Clique para ver os detalhes completos da vaga"
                                  >
                                    <span className="line-clamp-1">{job.title}</span>
                                    <Eye size={13} className="text-slate-300 group-hover/title:text-indigo-600 transition-colors shrink-0" />
                                  </div>
                                  {isApplied && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shadow-2xs">
                                      <Check size={10} className="stroke-[3]" />
                                      Já me candidatei
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-3 text-slate-600 text-xs">
                                <div className="flex items-center gap-1.5 font-medium">
                                  <Building2 size={13} className="text-slate-400 shrink-0" />
                                  <span className="truncate max-w-[140px]" title={job.company}>{job.company}</span>
                                </div>
                              </td>

                              <td className="py-3 px-3 text-center">
                                {renderSourceBadge(job.source)}
                              </td>

                              <td className="py-3 px-3 text-xs text-slate-600">
                                <div className="flex items-center gap-1">
                                  <MapPin size={12} className="text-indigo-500 shrink-0" />
                                  <span className="font-medium text-slate-700 truncate max-w-[180px]" title={formatLocation(job.location, job.modality)}>
                                    {formatLocation(job.location, job.modality)}
                                  </span>
                                </div>
                              </td>

                              <td className="py-3 px-3 text-xs">
                                <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold whitespace-nowrap ${
                                  job.type.includes('Aprendiz')
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : job.type.includes('RH')
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : job.type.includes('Suporte')
                                    ? 'bg-cyan-100 text-cyan-800 border border-cyan-300'
                                    : job.type.includes('Estágio')
                                    ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                    : job.type.includes('Auxiliar')
                                    ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                }`}>
                                  {job.type}
                                </span>
                              </td>

                              <td className="py-3 px-3 text-xs text-slate-500 whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <Clock size={12} className="text-slate-400 shrink-0" />
                                  <span>
                                    {formatDistanceToNow(new Date(job.publishedAt), { addSuffix: true, locale: ptBR })}
                                  </span>
                                </div>
                              </td>

                              {/* Ações por Linha */}
                              <td className="py-3 px-3 text-center bg-slate-50/40 whitespace-nowrap w-48 min-w-[190px]">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button 
                                    onClick={() => handleOpenLink(job.url)}
                                    className="group/btn relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap border border-emerald-500/40"
                                    title="Abrir página oficial de inscrição"
                                  >
                                    <span className="tracking-wide uppercase text-[10px]">Candidatar-se</span>
                                    <ExternalLink size={13} className="stroke-[2.2] group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
                                  </button>

                                  <button 
                                    onClick={() => toggleApplied(job.id)}
                                    title={isApplied ? "Remover candidatura" : "Marcar como: Já me candidatei"}
                                    className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                                      isApplied 
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-600' 
                                        : 'border-slate-200 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/50'
                                    }`}
                                  >
                                    <CheckCircle2 size={14} className={isApplied ? 'fill-emerald-100 text-emerald-600' : ''} />
                                  </button>

                                  <button 
                                    onClick={() => toggleFavorite(job.id)}
                                    title={isFav ? "Remover dos favoritos" : "Salvar vaga"}
                                    className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                                      isFav 
                                        ? 'bg-amber-50 border-amber-300 text-amber-500' 
                                        : 'border-slate-200 text-slate-400 hover:text-amber-500 hover:bg-amber-50/50'
                                    }`}
                                  >
                                    <Bookmark size={14} className={isFav ? 'fill-amber-500' : ''} />
                                  </button>

                                  <button 
                                    onClick={() => handleDismissJob(job.id)}
                                    title={isDismissed ? "Reexibir vaga" : "Ocultar vaga"}
                                    className={`p-1.5 border border-slate-200 rounded-xl transition-all cursor-pointer ${
                                      isDismissed ? 'text-indigo-600 bg-indigo-50 border-indigo-200' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                    }`}
                                  >
                                    {isDismissed ? <Eye size={14} /> : <EyeOff size={14} />}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* ---------------- PAGINAÇÃO LIMPA (PADRÃO 25 VAGAS) ---------------- */}
                  <div className="bg-slate-50/90 border-t border-slate-200 px-6 py-3 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500">
                        Exibindo <span className="font-semibold text-slate-900">{filteredAndSortedJobs.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span>–<span className="font-semibold text-slate-900">{Math.min(currentPage * itemsPerPage, filteredAndSortedJobs.length)}</span> de <span className="font-semibold text-slate-900">{filteredAndSortedJobs.length}</span> vagas
                      </span>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span>Por página:</span>
                        <select 
                          value={itemsPerPage}
                          onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none cursor-pointer"
                        >
                          <option value={25}>25</option>
                          <option value={50}>50</option>
                          <option value={100}>100</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-xs font-medium flex items-center gap-1"
                        title="Página Anterior"
                      >
                        <ChevronLeft size={14} />
                        <span>Anterior</span>
                      </button>

                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum = i + 1;
                        if (totalPages > 5 && currentPage > 3) {
                          pageNum = Math.min(totalPages - 4, currentPage - 2) + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              currentPage === pageNum ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-xs font-medium flex items-center gap-1"
                        title="Próxima Página"
                      >
                        <span>Próxima</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ABA FILTROS */}
          {activeTab === 'filters' && (
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Filtros de Monitoramento</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    O robô em Rust pesquisa periodicamente em paralelo no Gupy, LinkedIn e Indeed usando estas regras.
                  </p>
                </div>
                <button 
                  onClick={() => setIsFilterModalOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus size={15} />
                  <span>Novo Filtro</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filters.map((filter) => (
                  <div key={filter.id} className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-sm relative group">
                    <button 
                      onClick={() => handleDeleteFilter(filter.id)}
                      className="absolute top-4 right-4 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Excluir filtro"
                    >
                      <Trash2 size={16} />
                    </button>

                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                        <FilterIcon size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-base text-slate-900">{filter.keyword}</h3>
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          <MapPin size={12} className="text-indigo-500" />
                          <span>{filter.location || 'Recife (até 80 km)'}</span>
                          <span>•</span>
                          <span className="font-medium text-slate-700">{filter.type}</span>
                        </p>

                        <div className="mt-3.5 flex items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-600">
                            <Clock size={11} />
                            {filter.timeWindow}
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={11} />
                            Ativo
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ABA CONFIGURAÇÕES */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 shadow-sm space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Configurações do Monitor</h2>
                <p className="text-xs text-slate-500">Parâmetros do motor nativo Tauri v2 e scrapers em Rust.</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Notificações Toast do Windows</h4>
                    <p className="text-xs text-slate-500">Exibir balão nativo ao encontrar novas oportunidades</p>
                  </div>
                  <button
                    onClick={handleToggleMute}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      monitorStatus?.muted ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {monitorStatus?.muted ? 'Silenciado' : 'Ativado'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Rotina em Segundo Plano</h4>
                    <p className="text-xs text-slate-500">Varreduras automáticas em background</p>
                  </div>
                  <button
                    onClick={handleTogglePause}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                      monitorStatus?.paused ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {monitorStatus?.paused ? 'Pausado' : 'Monitorando'}
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Fontes Ativas Integradas</h4>
                    <p className="text-xs text-slate-500">Gupy (JSON API), LinkedIn (Guest API) e Indeed (Busca integrada)</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg">
                    3 Fontes Ativas
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Bandeja do Sistema (Tray)</h4>
                    <p className="text-xs text-slate-500">Fechar janela oculta para a bandeja sem encerrar o app</p>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
                    Habilitado
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ---------------- MODAL SIMPLIFICADO E ENXUTO DE NOVO FILTRO ---------------- */}
      {isFilterModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">Novo Filtro de Monitoramento</h3>
                <p className="text-xs text-slate-500">Busca automática em até 80 km de Recife e Remoto.</p>
              </div>
              <button 
                onClick={() => setIsFilterModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* 1. Cargo com Datalist/Autocomplete */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Cargo ou Palavra-chave</label>
                <input 
                  type="text" 
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  list="cargos-sugestoes"
                  placeholder="Ex: Auxiliar Administrativo, RH, Suporte TI..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
                <datalist id="cargos-sugestoes">
                  <option value="Auxiliar Administrativo" />
                  <option value="Recursos Humanos (RH)" />
                  <option value="Suporte de TI" />
                  <option value="Jovem Aprendiz" />
                  <option value="Estágio" />
                  <option value="Atendimento" />
                  <option value="Desenvolvedor" />
                </datalist>
              </div>

              {/* 2. Localização com atalhos discretos */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">Localização</label>
                  <div className="flex items-center gap-1 text-[11px]">
                    <button 
                      type="button" 
                      onClick={() => setLocation('Recife (até 80 km)')}
                      className="text-indigo-600 hover:underline cursor-pointer"
                    >
                      [Recife 80km]
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setLocation('Jaboatão dos Guararapes')}
                      className="text-indigo-600 hover:underline cursor-pointer"
                    >
                      [Jaboatão]
                    </button>
                    <button 
                      type="button" 
                      onClick={() => setLocation('Remoto')}
                      className="text-indigo-600 hover:underline cursor-pointer"
                    >
                      [Remoto]
                    </button>
                  </div>
                </div>
                <input 
                  type="text" 
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ex: Recife (até 80 km), Jaboatão, Remoto..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              {/* 3. Modalidade em Segmented Control Limpo */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Modalidade</label>
                <div className="grid grid-cols-4 gap-1.5 bg-slate-100 p-1 rounded-xl">
                  {['Qualquer', 'Presencial', 'Híbrido', 'Apenas Remoto'].map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setModality(m)}
                      className={`py-1.5 text-xs font-medium rounded-lg transition-all cursor-pointer text-center ${
                        modality === m
                          ? 'bg-white text-slate-900 font-semibold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {m === 'Apenas Remoto' ? 'Remoto' : m}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Período */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Tipo de Contrato</label>
                  <select 
                    value={contractType}
                    onChange={(e) => setContractType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="Todos">Todos os Contratos</option>
                    <option value="CLT">CLT</option>
                    <option value="Jovem Aprendiz">Jovem Aprendiz</option>
                    <option value="Estágio">Estágio</option>
                    <option value="PJ">PJ</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Janela de Publicação</label>
                  <select 
                    value={timeWindow}
                    onChange={(e) => setTimeWindow(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500 cursor-pointer"
                  >
                    <option value="30d">Últimos 30 dias</option>
                    <option value="7d">Últimos 7 dias</option>
                    <option value="3d">Últimos 3 dias</option>
                    <option value="24h">Últimas 24 horas</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex justify-end gap-2.5">
              <button 
                onClick={() => setIsFilterModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSaveFilter}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Salvar Filtro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- POP-UP / MODAL DE DETALHES DA VAGA ---------------- */}
      <JobDetailsModal
        job={selectedJob}
        isOpen={isDetailsModalOpen}
        onClose={handleCloseDetails}
        isFavorite={selectedJob ? favorites.includes(selectedJob.id) : false}
        isApplied={selectedJob ? appliedJobs.includes(selectedJob.id) : false}
        onToggleFavorite={toggleFavorite}
        onToggleApplied={toggleApplied}
        onOpenLink={handleOpenLink}
        formatLocation={formatLocation}
      />
    </div>
  );
}
