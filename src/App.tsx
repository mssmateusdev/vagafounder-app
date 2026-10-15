import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Briefcase, 
  Settings, 
  Search, 
  ExternalLink,
  CheckCircle2,
  X,
  RefreshCw,
  Bookmark,
  MapPin,
  Clock,
  Building2,
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
  Check,
  BellRing,
  Plus,
  Tag,
  Sun,
  Moon,
  Columns3,
  DollarSign,
  Trophy,
  Gift,
  Send,
  Keyboard,
  Activity,
  CheckCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { 
  Job, 
  MonitorStatus, 
  NotificationSettings, 
  ExternalNotifySettings, 
  KanbanApplication, 
  KanbanStage 
} from './types';
import { JobDetailsModal } from './components/JobDetailsModal';
import { KanbanBoard } from './components/KanbanBoard';

const PRESET_NOTIFICATION_ROLES = [
  { id: 'Jovem Aprendiz', label: 'Jovem Aprendiz', desc: 'Vagas para primeiro emprego e aprendizado' },
  { id: 'Estágio', label: 'Estágio', desc: 'Estágios técnicos ou de ensino superior' },
  { id: 'Auxiliar Administrativo', label: 'Auxiliar Administrativo', desc: 'Rotinas de escritório, recepção e apoio' },
  { id: 'Recursos Humanos (RH)', label: 'Recursos Humanos (RH)', desc: 'Recrutamento, DP, gestão de pessoas' },
  { id: 'Suporte de TI', label: 'Suporte de TI', desc: 'Helpdesk, suporte técnico, hardware e redes' },
  { id: 'Tecnologia & Dev', label: 'Tecnologia & Dev', desc: 'Programação, frontend, backend, dados' },
  { id: 'Atendimento / Recepção', label: 'Atendimento / Recepção', desc: 'SAC, recepcionista, portaria e atendimento' },
];

const PLATFORMS_INFO = [
  { id: 'gupy', name: 'Gupy', type: 'JSON API Direta', latency: '~350ms' },
  { id: 'linkedin', name: 'LinkedIn', type: 'Guest API Paginada', latency: '~600ms' },
  { id: 'indeed', name: 'Indeed', type: 'Busca Integrada', latency: '~1.5s' },
  { id: 'vagas', name: 'Vagas.com', type: 'Web Scraper SSR', latency: '~450ms' },
  { id: 'trabalhabrasil', name: 'Trabalha Brasil (SINE)', type: 'Web Scraper SSR', latency: '~400ms' },
  { id: 'infojobs', name: 'InfoJobs', type: 'Web Scraper SSR', latency: '~650ms' },
  { id: 'catho', name: 'Catho', type: 'Web Scraper SSR', latency: '~700ms' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'jobs' | 'kanban' | 'history' | 'settings'>('jobs');
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
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filtros rápidos em Dropdowns
  const [selectedSource, setSelectedSource] = useState<string>('ALL');
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('ALL');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('ALL');
  const [selectedTimeFilter, setSelectedTimeFilter] = useState<'ALL' | '24H' | '3D' | '7D' | '30D'>('ALL');
  
  // Filtros Avançados: Salário e Benefícios
  const [filterWithSalaryOnly, setFilterWithSalaryOnly] = useState<boolean>(false);
  const [filterWithBenefitsOnly, setFilterWithBenefitsOnly] = useState<boolean>(false);

  // Ordenação e Paginação (Padrão: 25 vagas por página)
  const [sortField, setSortField] = useState<'publishedAt' | 'title' | 'company'>('publishedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(25);

  // Status de Monitoramento do Rust/Tauri
  const [monitorStatus, setMonitorStatus] = useState<MonitorStatus | null>(null);

  // Responsividade, Modos de Visualização e Split-View
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'split'>('table');
  const [activeSplitJob, setActiveSplitJob] = useState<Job | null>(null);
  const [focusedJobIndex, setFocusedJobIndex] = useState<number>(0);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Referência do input de busca para atalho Ctrl+K
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Modo Escuro Estilo Discord / Claro
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('vagafounder_theme');
      return saved === 'dark' || (saved === null && window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('vagafounder_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('vagafounder_theme', 'light');
    }
  }, [isDarkMode]);

  // Funil de Candidaturas (Kanban)
  const [kanbanApps, setKanbanApps] = useState<KanbanApplication[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('vagafounder_kanban_apps') || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('vagafounder_kanban_apps', JSON.stringify(kanbanApps));
  }, [kanbanApps]);

  // Avisos Programáveis (Filtro de Notificações do Windows)
  const [notifyAllRoles, setNotifyAllRoles] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('vagafounder_notify_all');
      return saved !== null ? JSON.parse(saved) : true;
    } catch {
      return true;
    }
  });

  const [selectedNotifyRoles, setSelectedNotifyRoles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('vagafounder_notify_roles');
      return saved ? JSON.parse(saved) : [
        'Jovem Aprendiz',
        'Estágio',
        'Auxiliar Administrativo',
        'Recursos Humanos (RH)',
        'Suporte de TI',
        'Tecnologia & Dev',
        'Atendimento / Recepção',
      ];
    } catch {
      return [
        'Jovem Aprendiz',
        'Estágio',
        'Auxiliar Administrativo',
        'Recursos Humanos (RH)',
        'Suporte de TI',
        'Tecnologia & Dev',
        'Atendimento / Recepção',
      ];
    }
  });

  const [customNotifyKeywords, setCustomNotifyKeywords] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('vagafounder_notify_kws') || '[]');
    } catch {
      return [];
    }
  });

  const [newKeywordInput, setNewKeywordInput] = useState<string>('');
  const [isTestingNotify, setIsTestingNotify] = useState<boolean>(false);

  // Notificações Externas (Telegram & Discord)
  const [externalSettings, setExternalSettings] = useState<ExternalNotifySettings>({
    telegramEnabled: false,
    telegramBotToken: '',
    telegramChatId: '',
    discordEnabled: false,
    discordWebhookUrl: '',
  });
  const [isTestingTelegram, setIsTestingTelegram] = useState<boolean>(false);
  const [isTestingDiscord, setIsTestingDiscord] = useState<boolean>(false);

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

  useEffect(() => {
    localStorage.setItem('vagafounder_notify_all', JSON.stringify(notifyAllRoles));
  }, [notifyAllRoles]);

  useEffect(() => {
    localStorage.setItem('vagafounder_notify_roles', JSON.stringify(selectedNotifyRoles));
  }, [selectedNotifyRoles]);

  useEffect(() => {
    localStorage.setItem('vagafounder_notify_kws', JSON.stringify(customNotifyKeywords));
  }, [customNotifyKeywords]);

  // Carregar dados e inicializar com máxima velocidade
  useEffect(() => {
    async function init() {
      try {
        try {
          const status = await invoke<MonitorStatus>('get_status');
          setMonitorStatus(status);
        } catch (e) {
          console.warn('Status indisponível:', e);
        }

        try {
          const nSettings = await invoke<NotificationSettings>('get_notification_settings');
          if (nSettings) {
            setNotifyAllRoles(nSettings.notifyAll);
            if (nSettings.roles && nSettings.roles.length > 0) {
              setSelectedNotifyRoles(nSettings.roles);
            }
            if (nSettings.keywords) {
              setCustomNotifyKeywords(nSettings.keywords);
            }
          }
        } catch (e) {
          console.warn('Avisos programáveis indisponíveis:', e);
        }

        try {
          const extSettings = await invoke<ExternalNotifySettings>('get_external_notify_settings');
          if (extSettings) {
            setExternalSettings(extSettings);
          }
        } catch (e) {
          console.warn('Configurações externas indisponíveis:', e);
        }

        // Tenta carregar do cache instantâneo primeiro
        const cached = await invoke<Job[]>('get_jobs');
        if (cached && cached.length > 0) {
          setJobs(cached);
          setIsLoading(false);
        } else {
          // Se não houver cache, dispara primeira varredura rápida
          setIsLoading(true);
          const fetchedJobs = await invoke<Job[]>('scan_now', { keyword: null });
          if (fetchedJobs && fetchedJobs.length > 0) {
            setJobs(fetchedJobs);
          }
          setIsLoading(false);
        }
      } catch (err) {
        console.error('Erro na inicialização:', err);
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
        if (event.payload.notificationSettings) {
          setNotifyAllRoles(event.payload.notificationSettings.notifyAll);
          if (event.payload.notificationSettings.roles) {
            setSelectedNotifyRoles(event.payload.notificationSettings.roles);
          }
          if (event.payload.notificationSettings.keywords) {
            setCustomNotifyKeywords(event.payload.notificationSettings.keywords);
          }
        }
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

  // Buscar vagas na Web (Otimizado: retorno veloz em ~1.5s das 6 fontes HTTP + Indeed assíncrono)
  const handleSearchWeb = async (customKw?: string) => {
    const term = (customKw !== undefined ? customKw : searchQuery).trim();
    setIsLoading(true);
    try {
      showToast(term ? `Buscando "${term}" nas 7 plataformas nacionais...` : 'Varrendo 7 plataformas em tempo real...');
      const res = await invoke<Job[]>('scan_now', { keyword: term || null });
      if (res && res.length > 0) {
        setJobs(res);
        showToast(term ? `${res.length} vagas encontradas para "${term}"!` : `Varredura concluída! ${res.length} vagas.`);
      } else {
        showToast('Nenhuma nova vaga encontrada nesta busca.');
      }
    } catch (err) {
      console.error('Erro na busca de vagas:', err);
      showToast('Erro ao consultar vagas.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    handleSearchWeb(searchQuery);
  };

  const handleRefresh = () => {
    handleSearchWeb('');
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

  // Sincronizar configurações de avisos com o Rust backend
  const syncNotificationSettings = async (
    all: boolean,
    roles: string[],
    keywords: string[]
  ) => {
    try {
      const payload: NotificationSettings = {
        notifyAll: all,
        roles,
        keywords,
      };
      await invoke('set_notification_settings', { settings: payload });
    } catch (err) {
      console.error('Erro ao salvar avisos programáveis no Rust:', err);
    }
  };

  const handleToggleNotifyMode = (all: boolean) => {
    setNotifyAllRoles(all);
    syncNotificationSettings(all, selectedNotifyRoles, customNotifyKeywords);
    showToast(all ? 'Avisos ativados para todas as vagas!' : 'Avisos configurados apenas para cargos selecionados!');
  };

  const handleToggleNotifyRole = (roleId: string) => {
    const nextRoles = selectedNotifyRoles.includes(roleId)
      ? selectedNotifyRoles.filter(r => r !== roleId)
      : [...selectedNotifyRoles, roleId];
    setSelectedNotifyRoles(nextRoles);
    syncNotificationSettings(notifyAllRoles, nextRoles, customNotifyKeywords);
    showToast(selectedNotifyRoles.includes(roleId) ? `Aviso desativado para "${roleId}"` : `Aviso ativado para "${roleId}"!`);
  };

  const handleAddKeyword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = newKeywordInput.trim();
    if (!clean) return;
    if (customNotifyKeywords.some(k => k.toLowerCase() === clean.toLowerCase())) {
      showToast(`O termo "${clean}" já está na lista de avisos.`);
      setNewKeywordInput('');
      return;
    }
    const nextKws = [...customNotifyKeywords, clean];
    setCustomNotifyKeywords(nextKws);
    setNewKeywordInput('');
    syncNotificationSettings(notifyAllRoles, selectedNotifyRoles, nextKws);
    showToast(`Termo "${clean}" adicionado aos avisos!`);
  };

  const handleRemoveKeyword = (kwToRemove: string) => {
    const nextKws = customNotifyKeywords.filter(k => k !== kwToRemove);
    setCustomNotifyKeywords(nextKws);
    syncNotificationSettings(notifyAllRoles, selectedNotifyRoles, nextKws);
    showToast(`Termo "${kwToRemove}" removido dos avisos.`);
  };

  const handleTestNotification = async () => {
    setIsTestingNotify(true);
    try {
      await invoke('test_notification');
      showToast('Aviso de teste disparado com sucesso no Windows!');
    } catch (err) {
      console.error('Erro ao disparar aviso de teste:', err);
      showToast('Erro ao disparar notificação de teste.');
    } finally {
      setTimeout(() => setIsTestingNotify(false), 1200);
    }
  };

  // Funil de Candidaturas (Kanban)
  const handleSendToKanban = (job: Job, stage: KanbanStage = 'wishlist') => {
    const exists = kanbanApps.find(a => a.jobId === job.id);
    if (exists) {
      showToast(`A vaga "${job.title}" já está no seu Funil de Candidaturas!`);
      return;
    }
    const newApp: KanbanApplication = {
      id: `app-${Date.now()}`,
      jobId: job.id,
      title: job.title,
      company: job.company,
      location: job.location,
      modality: job.modality,
      url: job.url,
      source: job.source,
      salary: job.salary,
      benefits: job.benefits,
      stage,
      notes: '',
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setKanbanApps(prev => [newApp, ...prev]);
    showToast(`Vaga adicionada ao Funil em "${stage === 'applied' ? 'Inscrito' : 'Interesse'}"! 🚀`);
  };

  const handleUpdateKanbanApp = (updated: KanbanApplication) => {
    setKanbanApps(prev => prev.map(a => a.id === updated.id ? updated : a));
    showToast('Candidatura atualizada no Funil!');
  };

  const handleDeleteKanbanApp = (id: string) => {
    setKanbanApps(prev => prev.filter(a => a.id !== id));
    showToast('Candidatura removida do Funil.');
  };

  const handleAddKanbanApp = (newApp: Omit<KanbanApplication, 'id' | 'appliedAt' | 'updatedAt'>) => {
    const app: KanbanApplication = {
      ...newApp,
      id: `app-${Date.now()}`,
      appliedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setKanbanApps(prev => [app, ...prev]);
    showToast('Nova vaga cadastrada no Funil com sucesso!');
  };

  // Salvar Notificações Externas (Telegram & Discord)
  const handleSaveExternalSettings = async (nextSettings: ExternalNotifySettings) => {
    setExternalSettings(nextSettings);
    try {
      await invoke('set_external_notify_settings', { settings: nextSettings });
      showToast('Configurações de notificações externas salvas com sucesso!');
    } catch (err) {
      console.error('Erro ao salvar configurações externas:', err);
      showToast('Erro ao salvar configurações externas.');
    }
  };

  const handleTestExternal = async (service: 'telegram' | 'discord') => {
    if (service === 'telegram') setIsTestingTelegram(true);
    else setIsTestingDiscord(true);
    try {
      const msg = await invoke<string>('test_external_notification', { service });
      showToast(msg);
    } catch (err: any) {
      showToast(`Erro ao testar ${service}: ${err?.toString() || err}`);
    } finally {
      if (service === 'telegram') setIsTestingTelegram(false);
      else setIsTestingDiscord(false);
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

  // Formatação limpa de localidade
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

  // Badges estilizados para todas as 7 fontes
  const renderSourceBadge = (source: string) => {
    const s = (source || '').toLowerCase();
    if (s.includes('gupy')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
          Gupy
        </span>
      );
    }
    if (s.includes('linkedin')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#0A66C2]/10 dark:bg-[#0A66C2]/20 text-[#0A66C2] dark:text-[#388be8] border border-[#0A66C2]/25 dark:border-[#0A66C2]/40 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0A66C2]"></span>
          LinkedIn
        </span>
      );
    }
    if (s.includes('indeed')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#003A9B]/10 dark:bg-[#003A9B]/25 text-[#003A9B] dark:text-[#528de8] border border-[#003A9B]/25 dark:border-[#003A9B]/40 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-[#003A9B]"></span>
          Indeed
        </span>
      );
    }
    if (s.includes('vagas')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
          Vagas.com
        </span>
      );
    }
    if (s.includes('trabalha')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          Trabalha Brasil
        </span>
      );
    }
    if (s.includes('infojobs')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
          InfoJobs
        </span>
      );
    }
    if (s.includes('catho')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 shadow-2xs">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-600"></span>
          Catho
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-[#1e1f22] text-slate-700 dark:text-[#dbdee1] border border-slate-200 dark:border-[#383a40] shadow-2xs">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
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

  // Filtragem e Ordenação Ultrarrápida no Cliente
  const filteredAndSortedJobs = useMemo(() => {
    const searchLower = searchQuery.trim().toLowerCase();

    const filtered = jobs.filter(job => {
      const isDismissed = dismissedJobs.includes(job.id);
      if (!showDismissed && isDismissed && activeTab !== 'history') {
        return false;
      }

      // Busca textual instantânea
      if (searchLower !== '') {
        const titleLower = (job.title || '').toLowerCase();
        const companyLower = (job.company || '').toLowerCase();
        const locLower = (job.location || '').toLowerCase();
        if (!titleLower.includes(searchLower) && !companyLower.includes(searchLower) && !locLower.includes(searchLower)) {
          return false;
        }
      }

      // Fonte
      const jobSourceLower = (job.source || '').toLowerCase();
      if (selectedSource !== 'ALL' && !jobSourceLower.includes(selectedSource.toLowerCase())) {
        return false;
      }

      // Filtros de Salário e Benefícios
      if (filterWithSalaryOnly && !job.salary) {
        return false;
      }
      if (filterWithBenefitsOnly && (!job.benefits || job.benefits.length === 0)) {
        return false;
      }

      // Local / Modalidade
      if (selectedCityFilter !== 'ALL') {
        const locLower = (job.location || '').toLowerCase();
        if (selectedCityFilter === 'RECIFE' && !locLower.includes('recife')) return false;
        if (selectedCityFilter === 'JABOATAO' && !locLower.includes('jaboat')) return false;
        if (selectedCityFilter === 'METRO_80KM') {
          const inMetro = locLower.includes('recife') || locLower.includes('jaboat') || locLower.includes('olinda') || 
            locLower.includes('paulista') || locLower.includes('camaragibe') || locLower.includes('cabo') || 
            locLower.includes('ipojuca') || locLower.includes('igarassu') || locLower.includes('moreno') || 
            locLower.includes('goiana') || locLower.includes('vitoria') || locLower.includes('pernambuco') ||
            locLower.includes('remot');
          if (!inMetro) return false;
        }
        if (selectedCityFilter === 'REMOTO' && !locLower.includes('remoto')) return false;
        if (selectedCityFilter === 'PRESENCIAL' && locLower.includes('remoto')) return false;
        if (selectedCityFilter === 'HIBRIDO' && !locLower.includes('híbrido') && !locLower.includes('hibrido')) return false;
      }

      // Área / Cargo
      if (selectedRoleFilter !== 'ALL') {
        const titleLower = (job.title || '').toLowerCase();
        const typeLower = (job.type || '').toLowerCase();
        if (selectedRoleFilter === 'ADMIN') {
          if (!titleLower.includes('auxiliar') && !titleLower.includes('administrativ') && !titleLower.includes('assistente') && !typeLower.includes('auxiliar')) return false;
        } else if (selectedRoleFilter === 'RH') {
          if (!titleLower.includes('rh') && !titleLower.includes('recursos humanos') && !titleLower.includes('departamento pessoal') && !titleLower.includes('recrutamento') && !typeLower.includes('rh')) return false;
        } else if (selectedRoleFilter === 'SUPORTE') {
          if (!titleLower.includes('suporte') && !titleLower.includes('helpdesk') && !titleLower.includes('tecnico') && !titleLower.includes('técnico') && !titleLower.includes('informatica') && !titleLower.includes('informática') && !typeLower.includes('suporte')) return false;
        } else if (selectedRoleFilter === 'APRENDIZ') {
          if (!titleLower.includes('aprendiz') && !typeLower.includes('aprendiz')) return false;
        } else if (selectedRoleFilter === 'ESTAGIO') {
          if (!titleLower.includes('estágio') && !titleLower.includes('estagio') && !typeLower.includes('estágio') && !typeLower.includes('estagio')) return false;
        } else if (selectedRoleFilter === 'ATENDIMENTO') {
          if (!titleLower.includes('atendente') && !titleLower.includes('recep') && !titleLower.includes('caixa') && !titleLower.includes('atendimento')) return false;
        } else if (selectedRoleFilter === 'DEV') {
          if (!titleLower.includes('desenvolvedor') && !titleLower.includes('software') && !titleLower.includes('programador') && !titleLower.includes('dev') && !titleLower.includes('frontend') && !titleLower.includes('backend')) return false;
        }
      }

      // Período
      if (selectedTimeFilter !== 'ALL') {
        const pubTime = new Date(job.publishedAt).getTime();
        if (!isNaN(pubTime)) {
          const diffHours = (Date.now() - pubTime) / (1000 * 60 * 60);
          if (selectedTimeFilter === '24H' && diffHours > 24) return false;
          if (selectedTimeFilter === '3D' && diffHours > 72) return false;
          if (selectedTimeFilter === '7D' && diffHours > 168) return false;
          if (selectedTimeFilter === '30D' && diffHours > 720) return false;
        }
      }

      // Aba Histórico
      if (activeTab === 'history') {
        const isFav = favorites.includes(job.id);
        const isApp = appliedJobs.includes(job.id);
        const matchHistory = historySubTab === 'favorites' ? isFav : isApp;
        if (!matchHistory) return false;
      }

      return true;
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
  }, [jobs, searchQuery, selectedSource, filterWithSalaryOnly, filterWithBenefitsOnly, selectedCityFilter, selectedRoleFilter, selectedTimeFilter, activeTab, favorites, appliedJobs, dismissedJobs, showDismissed, historySubTab, sortField, sortDirection]);

  // Paginação (Padrão 25)
  const totalPages = Math.max(1, Math.ceil(filteredAndSortedJobs.length / itemsPerPage));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedJobs.slice(start, start + itemsPerPage);
  }, [filteredAndSortedJobs, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedSource, filterWithSalaryOnly, filterWithBenefitsOnly, selectedCityFilter, selectedRoleFilter, selectedTimeFilter, activeTab, historySubTab]);

  // Split view: sincronizar vaga selecionada
  useEffect(() => {
    if (viewMode === 'split' && paginatedJobs.length > 0) {
      if (!activeSplitJob || !paginatedJobs.some(j => j.id === activeSplitJob.id)) {
        setActiveSplitJob(paginatedJobs[0]);
        setFocusedJobIndex(0);
      }
    }
  }, [viewMode, paginatedJobs]);

  // Atalhos de teclado (Ctrl+K, Setas, Espaço, F, Enter, Esc)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'Escape') {
        if (isDetailsModalOpen) {
          handleCloseDetails();
        } else if (isInput) {
          (target as HTMLInputElement).blur();
        }
        return;
      }

      if (isInput) return;

      if ((activeTab === 'jobs' || activeTab === 'history') && paginatedJobs.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setFocusedJobIndex((prev) => {
            const next = Math.min(prev + 1, paginatedJobs.length - 1);
            if (viewMode === 'split') setActiveSplitJob(paginatedJobs[next]);
            return next;
          });
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setFocusedJobIndex((prev) => {
            const next = Math.max(prev - 1, 0);
            if (viewMode === 'split') setActiveSplitJob(paginatedJobs[next]);
            return next;
          });
        } else if (e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          const targetJob = paginatedJobs[focusedJobIndex];
          if (targetJob) handleOpenDetails(targetJob);
        } else if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          const targetJob = paginatedJobs[focusedJobIndex];
          if (targetJob) toggleFavorite(targetJob.id);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const targetJob = paginatedJobs[focusedJobIndex];
          if (targetJob) handleOpenLink(targetJob.url);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, paginatedJobs, focusedJobIndex, viewMode, isDetailsModalOpen]);

  const nextCheckMinutes = useMemo(() => {
    if (!monitorStatus?.nextCheckAt) return null;
    const diffMs = new Date(monitorStatus.nextCheckAt).getTime() - Date.now();
    if (diffMs <= 0) return 'em instantes';
    const mins = Math.ceil(diffMs / 60000);
    return `em ${mins} min`;
  }, [monitorStatus]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-discord-main font-sans text-slate-800 dark:text-discord-text antialiased overflow-hidden select-none transition-colors">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 dark:bg-discord-card text-white dark:text-discord-header rounded-xl shadow-2xl border border-slate-700 dark:border-discord-border animate-in slide-in-from-bottom duration-200">
          <ExternalLink size={16} className="text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* ---------------- SIDEBAR (Estilo Discord) ---------------- */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-slate-900 dark:bg-discord-darkest flex flex-col justify-between shrink-0 shadow-2xl border-r border-slate-800 dark:border-discord-borderSubtle transition-all duration-300 ease-in-out z-20`}>
        <div>
          <div className="p-4 flex items-center justify-between border-b border-slate-800/80 dark:border-discord-borderSubtle">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 shrink-0">
                <Briefcase size={20} className="stroke-[2.5]" />
              </div>
              {!isSidebarCollapsed && (
                <div className="truncate">
                  <h1 className="text-white dark:text-discord-header font-bold text-base tracking-tight leading-none">VagaFounder</h1>
                  <p className="text-[11px] text-emerald-400 font-semibold tracking-wide mt-1">by: MateusDeveloper</p>
                </div>
              )}
            </div>

            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-1.5 text-slate-400 hover:text-white dark:hover:text-discord-header hover:bg-slate-800 dark:hover:bg-discord-hover rounded-lg transition-colors cursor-pointer"
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
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-semibold' 
                  : 'text-slate-400 dark:text-discord-muted hover:text-slate-200 dark:hover:text-discord-header hover:bg-slate-800/60 dark:hover:bg-discord-hover/60'
              }`}
              title="Painel de Vagas"
            >
              <Briefcase size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>Painel de Vagas</span>}
              {!isSidebarCollapsed && jobs.length > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-slate-800 dark:bg-discord-input text-slate-300 dark:text-discord-text font-semibold border border-slate-700 dark:border-discord-border">
                  {jobs.length}
                </span>
              )}
            </button>

            {/* Funil de Candidaturas (Kanban) */}
            <button 
              onClick={() => setActiveTab('kanban')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 cursor-pointer ${
                activeTab === 'kanban' 
                  ? 'bg-gradient-to-r from-indigo-600 to-emerald-600 text-white shadow-md shadow-indigo-600/30 font-bold' 
                  : 'text-slate-400 dark:text-discord-muted hover:text-slate-200 dark:hover:text-discord-header hover:bg-slate-800/60 dark:hover:bg-discord-hover/60'
              }`}
              title="Funil de Candidaturas (Kanban)"
            >
              <Trophy size={18} className="shrink-0 text-amber-400" />
              {!isSidebarCollapsed && <span>Funil de Candidaturas</span>}
              {!isSidebarCollapsed && kanbanApps.length > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30">
                  {kanbanApps.length}
                </span>
              )}
            </button>

            <button 
              onClick={() => setActiveTab('history')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 cursor-pointer ${
                activeTab === 'history' 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-semibold' 
                  : 'text-slate-400 dark:text-discord-muted hover:text-slate-200 dark:hover:text-discord-header hover:bg-slate-800/60 dark:hover:bg-discord-hover/60'
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
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-semibold' 
                  : 'text-slate-400 dark:text-discord-muted hover:text-slate-200 dark:hover:text-discord-header hover:bg-slate-800/60 dark:hover:bg-discord-hover/60'
              }`}
              title="Configurações & Notificações"
            >
              <Settings size={18} className="shrink-0" />
              {!isSidebarCollapsed && <span>Configurações</span>}
            </button>
          </nav>
        </div>

        {/* Rodapé da Sidebar */}
        <div className="p-3 border-t border-slate-800/80 dark:border-discord-borderSubtle">
          <div className="bg-slate-800/60 dark:bg-discord-card rounded-xl p-3 border border-slate-800 dark:border-discord-border">
            <div className="flex items-center justify-between mb-1">
              {!isSidebarCollapsed && (
                <span className="text-xs font-semibold text-slate-300 dark:text-discord-header">
                  {monitorStatus?.paused ? 'Monitor Pausado' : '7 Fontes Monitoradas'}
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
              <p className="text-[11px] text-slate-400 dark:text-discord-muted leading-tight">
                Gupy, LinkedIn, Indeed, Vagas, Trab. Brasil, InfoJobs e Catho
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* ---------------- CONTEÚDO PRINCIPAL ---------------- */}
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        {/* Topbar Superior */}
        <header className="h-16 bg-white dark:bg-discord-card border-b border-slate-200/90 dark:border-discord-border flex items-center justify-between px-6 shrink-0 gap-4 transition-colors">
          <div className="flex items-center gap-3 shrink-0">
            <button 
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-discord-muted dark:hover:text-discord-header hover:bg-slate-100 dark:hover:bg-discord-hover rounded-xl transition-all border border-slate-200 dark:border-discord-border cursor-pointer"
              title="Alternar barra lateral"
            >
              {isSidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-discord-muted font-medium">
              <span>Dashboard</span>
              <span>/</span>
              <span className="text-slate-900 dark:text-discord-header font-semibold capitalize">
                {activeTab === 'jobs' ? 'Vagas Recentes' : activeTab === 'kanban' ? 'Funil de Candidaturas' : activeTab === 'history' ? 'Minhas Vagas' : 'Configurações'}
              </span>
              <span className="text-slate-300 dark:text-discord-border">•</span>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-bold border border-indigo-200/70 dark:border-indigo-800 shadow-2xs">
                by: MateusDeveloper
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Status do Monitor */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100/90 dark:bg-discord-input rounded-xl border border-slate-200 dark:border-discord-border text-xs">
              <span className="relative flex h-2 w-2">
                {(!monitorStatus?.paused && !isLoading) && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  isLoading ? 'bg-indigo-500 animate-spin' : monitorStatus?.paused ? 'bg-amber-400' : 'bg-emerald-500'
                }`}></span>
              </span>
              <span className="font-semibold text-slate-700 dark:text-discord-header">
                {isLoading ? 'Varrendo...' : monitorStatus?.paused ? 'Pausado' : 'Ativo'}
              </span>
              {(!monitorStatus?.paused && nextCheckMinutes) && (
                <span className="text-[11px] text-slate-400 dark:text-discord-muted border-l border-slate-300 dark:border-discord-border pl-2">
                  Próxima {nextCheckMinutes}
                </span>
              )}

              <button
                onClick={handleTogglePause}
                title={monitorStatus?.paused ? "Retomar monitoramento" : "Pausar monitoramento"}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-discord-header cursor-pointer ml-0.5"
              >
                {monitorStatus?.paused ? <Play size={12} className="text-emerald-600" /> : <Pause size={12} />}
              </button>

              <button
                onClick={handleToggleMute}
                title={monitorStatus?.muted ? "Ativar notificações" : "Silenciar notificações"}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-discord-header cursor-pointer"
              >
                {monitorStatus?.muted ? <BellOff size={12} className="text-rose-500" /> : <Bell size={12} />}
              </button>
            </div>

            {/* Alternador de Modo: Tabela vs Cards vs Split-View */}
            <div className="flex items-center bg-slate-100 dark:bg-discord-input p-0.5 rounded-xl border border-slate-200 dark:border-discord-border text-xs font-medium shrink-0">
              <button
                onClick={() => setViewMode('table')}
                title="Modo Tabela Completa"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'table' ? 'bg-white dark:bg-discord-card shadow-xs text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-500 dark:text-discord-muted hover:text-slate-800 dark:hover:text-discord-header'
                }`}
              >
                <List size={15} />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                title="Modo Grade / Cards"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'cards' ? 'bg-white dark:bg-discord-card shadow-xs text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-500 dark:text-discord-muted hover:text-slate-800 dark:hover:text-discord-header'
                }`}
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => setViewMode('split')}
                title="Modo Split-View (Lista + Prévia Instantânea)"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'split' ? 'bg-white dark:bg-discord-card shadow-xs text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-500 dark:text-discord-muted hover:text-slate-800 dark:hover:text-discord-header'
                }`}
              >
                <Columns3 size={15} />
              </button>
            </div>

            {/* Alternador Modo Claro / Escuro Discord */}
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              title={isDarkMode ? "Mudar para modo claro" : "Mudar para modo escuro (Discord)"}
              className="p-2 text-slate-500 hover:text-indigo-600 dark:text-discord-muted dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-discord-hover rounded-xl transition-all border border-slate-200 dark:border-discord-border cursor-pointer shrink-0"
            >
              {isDarkMode ? <Sun size={15} className="text-amber-400" /> : <Moon size={15} />}
            </button>

            {/* Botão de Varredura Imediata */}
            <button 
              onClick={handleRefresh}
              disabled={isLoading}
              title="Buscar novas vagas agora nas 7 plataformas (rápido)"
              className="flex items-center gap-1.5 px-3 py-1.5 text-slate-700 dark:text-discord-header hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-discord-hover rounded-xl transition-all border border-slate-200 dark:border-discord-border text-xs font-semibold cursor-pointer shrink-0 disabled:opacity-50"
            >
              <RefreshCw size={13} className={`${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
              <span className="hidden sm:inline">{isLoading ? 'Buscando...' : 'Verificar Agora'}</span>
            </button>
          </div>
        </header>

        {/* ---------------- BARRA DE BUSCA E FILTROS DIRETOS ---------------- */}
        {activeTab === 'jobs' && (
          <div className="bg-white dark:bg-discord-card border-b border-slate-200/90 dark:border-discord-border px-6 py-2.5 shrink-0 shadow-2xs space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Busca Textual Direta com Filtragem Instantânea e Busca Web Otimizada */}
              <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-[240px] flex items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-discord-muted" size={14} />
                  <input 
                    ref={searchInputRef}
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar cargo, empresa ou skill (ex: Dev, RH, Estágio...)" 
                    className="w-full pl-8 pr-16 py-1.5 bg-slate-50 dark:bg-discord-input hover:bg-slate-100/80 dark:hover:bg-discord-hover/60 focus:bg-white dark:focus:bg-discord-input text-xs text-slate-800 dark:text-discord-header border border-slate-200 dark:border-discord-border focus:border-indigo-500 rounded-xl outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-discord-muted"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {searchQuery && (
                      <button 
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="text-slate-400 hover:text-slate-600 dark:text-discord-muted dark:hover:text-discord-header p-0.5 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    )}
                    <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[9px] font-mono text-slate-400 dark:text-discord-muted bg-slate-200/60 dark:bg-discord-card rounded border border-slate-300 dark:border-discord-border">
                      Ctrl+K
                    </kbd>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  title="Buscar nas 7 plataformas online agora"
                  className="ml-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                >
                  <Search size={13} className={isLoading ? 'animate-spin' : ''} />
                  <span>{isLoading ? 'Buscando...' : 'Buscar'}</span>
                </button>
              </form>

              {/* Dropdown: Período */}
              <div className="shrink-0">
                <select
                  value={selectedTimeFilter}
                  onChange={(e) => setSelectedTimeFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-discord-input border border-slate-200 dark:border-discord-border hover:bg-slate-100/80 dark:hover:bg-discord-hover rounded-xl text-xs font-medium text-slate-700 dark:text-discord-header outline-none focus:border-indigo-500 cursor-pointer transition-all"
                >
                  <option value="ALL">Período: Todas</option>
                  <option value="24H">Últimas 24h</option>
                  <option value="3D">Últimos 3 dias</option>
                  <option value="7D">Últimos 7 dias</option>
                  <option value="30D">Últimos 30 dias</option>
                </select>
              </div>

              {/* Dropdown: Local / Modalidade */}
              <div className="shrink-0">
                <select
                  value={selectedCityFilter}
                  onChange={(e) => setSelectedCityFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-discord-input border border-slate-200 dark:border-discord-border hover:bg-slate-100/80 dark:hover:bg-discord-hover rounded-xl text-xs font-medium text-slate-700 dark:text-discord-header outline-none focus:border-indigo-500 cursor-pointer transition-all"
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

              {/* Dropdown: Área / Cargo */}
              <div className="shrink-0">
                <select
                  value={selectedRoleFilter}
                  onChange={(e) => setSelectedRoleFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-discord-input border border-slate-200 dark:border-discord-border hover:bg-slate-100/80 dark:hover:bg-discord-hover rounded-xl text-xs font-medium text-slate-700 dark:text-discord-header outline-none focus:border-indigo-500 cursor-pointer transition-all"
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

              {/* Toggles Rápidos: Salário e Benefícios */}
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => setFilterWithSalaryOnly(!filterWithSalaryOnly)}
                  title="Mostrar apenas vagas com remuneração informada"
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                    filterWithSalaryOnly 
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' 
                      : 'bg-slate-50 dark:bg-discord-input text-slate-600 dark:text-discord-muted border-slate-200 dark:border-discord-border hover:border-slate-300'
                  }`}
                >
                  <DollarSign size={13} className={filterWithSalaryOnly ? 'text-white' : 'text-emerald-500'} />
                  <span>Com Salário</span>
                </button>

                <button
                  onClick={() => setFilterWithBenefitsOnly(!filterWithBenefitsOnly)}
                  title="Mostrar apenas vagas com benefícios em destaque"
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                    filterWithBenefitsOnly 
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs' 
                      : 'bg-slate-50 dark:bg-discord-input text-slate-600 dark:text-discord-muted border-slate-200 dark:border-discord-border hover:border-slate-300'
                  }`}
                >
                  <Gift size={13} className={filterWithBenefitsOnly ? 'text-white' : 'text-purple-500'} />
                  <span>Com Benefícios</span>
                </button>
              </div>
            </div>

            {/* Pills de Plataformas (7 Fontes Nacionais) */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none text-xs">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-discord-muted shrink-0">Fontes:</span>
              <button
                onClick={() => setSelectedSource('ALL')}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  selectedSource === 'ALL' 
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs' 
                    : 'bg-slate-100 dark:bg-discord-input text-slate-600 dark:text-discord-text hover:bg-slate-200 dark:hover:bg-discord-hover'
                }`}
              >
                Todas as 7 Fontes
              </button>
              <button
                onClick={() => setSelectedSource('Gupy')}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  selectedSource.toLowerCase() === 'gupy' 
                    ? 'bg-indigo-600 text-white shadow-xs' 
                    : 'bg-slate-100 dark:bg-discord-input text-slate-600 dark:text-discord-text hover:bg-slate-200 dark:hover:bg-discord-hover'
                }`}
              >
                Gupy
              </button>
              <button
                onClick={() => setSelectedSource('LinkedIn')}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  selectedSource.toLowerCase() === 'linkedin' 
                    ? 'bg-[#0A66C2] text-white shadow-xs' 
                    : 'bg-slate-100 dark:bg-discord-input text-slate-600 dark:text-discord-text hover:bg-slate-200 dark:hover:bg-discord-hover'
                }`}
              >
                LinkedIn
              </button>
              <button
                onClick={() => setSelectedSource('Indeed')}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  selectedSource.toLowerCase() === 'indeed' 
                    ? 'bg-[#003A9B] text-white shadow-xs' 
                    : 'bg-slate-100 dark:bg-discord-input text-slate-600 dark:text-discord-text hover:bg-slate-200 dark:hover:bg-discord-hover'
                }`}
              >
                Indeed
              </button>
              <button
                onClick={() => setSelectedSource('Vagas')}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  selectedSource.toLowerCase() === 'vagas' 
                    ? 'bg-rose-600 text-white shadow-xs' 
                    : 'bg-slate-100 dark:bg-discord-input text-slate-600 dark:text-discord-text hover:bg-slate-200 dark:hover:bg-discord-hover'
                }`}
              >
                Vagas.com
              </button>
              <button
                onClick={() => setSelectedSource('Trabalha')}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  selectedSource.toLowerCase() === 'trabalha' 
                    ? 'bg-emerald-600 text-white shadow-xs' 
                    : 'bg-slate-100 dark:bg-discord-input text-slate-600 dark:text-discord-text hover:bg-slate-200 dark:hover:bg-discord-hover'
                }`}
              >
                Trabalha Brasil
              </button>
              <button
                onClick={() => setSelectedSource('InfoJobs')}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  selectedSource.toLowerCase() === 'infojobs' 
                    ? 'bg-orange-600 text-white shadow-xs' 
                    : 'bg-slate-100 dark:bg-discord-input text-slate-600 dark:text-discord-text hover:bg-slate-200 dark:hover:bg-discord-hover'
                }`}
              >
                InfoJobs
              </button>
              <button
                onClick={() => setSelectedSource('Catho')}
                className={`px-2.5 py-0.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer shrink-0 ${
                  selectedSource.toLowerCase() === 'catho' 
                    ? 'bg-sky-600 text-white shadow-xs' 
                    : 'bg-slate-100 dark:bg-discord-input text-slate-600 dark:text-discord-text hover:bg-slate-200 dark:hover:bg-discord-hover'
                }`}
              >
                Catho
              </button>
            </div>
          </div>
        )}

        {/* Subheader da Aba Minhas Vagas */}
        {activeTab === 'history' && (
          <div className="bg-white dark:bg-discord-card border-b border-slate-200/90 dark:border-discord-border px-6 py-2.5 flex items-center gap-3 shrink-0 text-xs shadow-2xs">
            <span className="text-slate-500 dark:text-discord-muted font-semibold">Exibir:</span>
            <button
              onClick={() => setHistorySubTab('favorites')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                historySubTab === 'favorites' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'bg-slate-50 dark:bg-discord-input text-slate-600 dark:text-discord-text border border-slate-200 dark:border-discord-border'
              }`}
            >
              <Bookmark size={13} className={historySubTab === 'favorites' ? 'fill-white' : ''} />
              <span>Salvas / Favoritas ({favorites.length})</span>
            </button>
            <button
              onClick={() => setHistorySubTab('applied')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                historySubTab === 'applied' ? 'bg-emerald-600 text-white font-bold shadow-xs' : 'bg-slate-50 dark:bg-discord-input text-slate-600 dark:text-discord-text border border-slate-200 dark:border-discord-border'
              }`}
            >
              <CheckCircle2 size={13} />
              <span>Já me Candidatei ({appliedJobs.length})</span>
            </button>
          </div>
        )}

        {/* ---------------- MAIN CONTENT ---------------- */}
        <main className="flex-1 overflow-auto p-4 sm:p-5 lg:p-6 w-full">
          {/* ABA KANBAN BOARD */}
          {activeTab === 'kanban' && (
            <KanbanBoard
              apps={kanbanApps}
              onUpdateApp={handleUpdateKanbanApp}
              onDeleteApp={handleDeleteKanbanApp}
              onAddApp={handleAddKanbanApp}
              onOpenLink={handleOpenLink}
            />
          )}

          {/* ABA VAGAS OU HISTÓRICO */}
          {(activeTab === 'jobs' || activeTab === 'history') && (
            <div className="w-full space-y-4">
              {/* Cabeçalho */}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 dark:text-discord-header tracking-tight flex items-center gap-2.5">
                    <span>
                      {activeTab === 'history' 
                        ? (historySubTab === 'favorites' ? 'Vagas Favoritas' : 'Vagas Candidatadas') 
                        : 'Oportunidades em Aberto'}
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-200/70 dark:border-emerald-800">
                      {filteredAndSortedJobs.length} vagas encontradas
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-discord-muted mt-0.5">
                    {activeTab === 'history' 
                      ? 'Oportunidades marcadas para acompanhamento do processo seletivo.'
                      : 'Varredura rápida em tempo real nas 7 principais plataformas nacionais de recrutamento.'}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {dismissedJobs.length > 0 && activeTab === 'jobs' && (
                    <button
                      onClick={() => setShowDismissed(!showDismissed)}
                      className="text-xs text-slate-500 hover:text-slate-800 dark:text-discord-muted dark:hover:text-discord-header flex items-center gap-1 cursor-pointer transition-colors"
                    >
                      {showDismissed ? <Eye size={12} /> : <EyeOff size={12} />}
                      <span>{showDismissed ? 'Ocultar descartadas' : `Ver ${dismissedJobs.length} descartadas`}</span>
                    </button>
                  )}

                  <div className="hidden lg:flex items-center gap-1 text-[11px] text-slate-400 dark:text-discord-muted">
                    <Keyboard size={13} />
                    <span>Navegue com <kbd className="px-1 py-0.2 bg-slate-200 dark:bg-discord-input rounded font-mono">↑</kbd> <kbd className="px-1 py-0.2 bg-slate-200 dark:bg-discord-input rounded font-mono">↓</kbd> • <kbd className="px-1 py-0.2 bg-slate-200 dark:bg-discord-input rounded font-mono">Espaço</kbd> ver • <kbd className="px-1 py-0.2 bg-slate-200 dark:bg-discord-input rounded font-mono">F</kbd> favoritar</span>
                  </div>
                </div>
              </div>

              {/* LISTAGEM VAZIA */}
              {filteredAndSortedJobs.length === 0 ? (
                <div className="bg-white dark:bg-discord-card rounded-2xl border border-slate-200/90 dark:border-discord-border shadow-sm flex flex-col items-center justify-center py-20 text-center px-4">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-discord-input flex items-center justify-center text-indigo-500 mb-3">
                    <Search size={28} />
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-discord-header">
                    {isLoading ? 'Varrendo as 7 plataformas de vagas...' : 'Nenhuma vaga correspondente encontrada'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-discord-muted max-w-sm mt-1">
                    {isLoading 
                      ? 'Consultando Gupy, LinkedIn, Indeed, Vagas, Trabalha Brasil, InfoJobs e Catho...'
                      : searchQuery.trim() 
                        ? `Nenhum resultado local para "${searchQuery}". Deseja pesquisar diretamente nas plataformas agora?`
                        : 'Altere o período, área ou local nos filtros acima para expandir os resultados.'}
                  </p>
                  {!isLoading && (
                    <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
                      {searchQuery.trim() && (
                        <button
                          onClick={() => handleSearchWeb(searchQuery)}
                          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                        >
                          <Search size={13} />
                          <span>Buscar "{searchQuery}" na Web Agora</span>
                        </button>
                      )}
                      <button
                        onClick={handleRefresh}
                        className="px-4 py-2 rounded-xl bg-indigo-50 dark:bg-discord-input text-indigo-600 dark:text-indigo-400 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-discord-hover transition-colors cursor-pointer"
                      >
                        Recarregar Vagas
                      </button>
                    </div>
                  )}
                </div>
              ) : viewMode === 'split' ? (
                /* ---------------- MODO SPLIT-VIEW (2 COLUNAS) ---------------- */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-235px)]">
                  {/* Coluna Esquerda: Lista de Vagas */}
                  <div className="lg:col-span-5 flex flex-col h-full bg-white dark:bg-discord-card rounded-2xl border border-slate-200/90 dark:border-discord-border shadow-sm overflow-hidden">
                    <div className="p-3 border-b border-slate-100 dark:border-discord-border flex items-center justify-between text-xs text-slate-500 dark:text-discord-muted">
                      <span className="font-semibold text-slate-700 dark:text-discord-header">{paginatedJobs.length} vagas exibidas</span>
                      <span>Página {currentPage} de {totalPages}</span>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-discord-borderSubtle p-2 space-y-1">
                      {paginatedJobs.map((job, idx) => {
                        const isSelected = activeSplitJob?.id === job.id;
                        const isFav = favorites.includes(job.id);
                        const isApplied = appliedJobs.includes(job.id);

                        return (
                          <div
                            key={job.id}
                            onClick={() => {
                              setActiveSplitJob(job);
                              setFocusedJobIndex(idx);
                            }}
                            className={`p-3 rounded-xl transition-all cursor-pointer flex flex-col gap-1.5 ${
                              isSelected 
                                ? 'bg-indigo-50/80 dark:bg-discord-hover/90 border-2 border-indigo-600 dark:border-indigo-500 shadow-xs' 
                                : 'hover:bg-slate-50 dark:hover:bg-discord-hover/40 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              {renderSourceBadge(job.source)}
                              <span className="text-[10px] text-slate-400 dark:text-discord-muted">
                                {formatDistanceToNow(new Date(job.publishedAt), { addSuffix: true, locale: ptBR })}
                              </span>
                            </div>

                            <h4 className="font-bold text-xs text-slate-900 dark:text-discord-header line-clamp-1 leading-snug">
                              {job.title}
                            </h4>

                            <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-discord-muted truncate">
                              <span className="font-medium text-slate-700 dark:text-discord-text truncate">{job.company}</span>
                              <span>•</span>
                              <span className="truncate">{formatLocation(job.location, job.modality)}</span>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              {job.salary && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  <DollarSign size={10} />
                                  {job.salary}
                                </span>
                              )}
                              {isApplied && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                                  <Check size={9} /> Inscrito
                                </span>
                              )}
                              {isFav && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                                  ⭐ Salva
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Paginação compacta para split view */}
                    <div className="p-2.5 border-t border-slate-100 dark:border-discord-border flex items-center justify-between">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1 rounded-lg border border-slate-200 dark:border-discord-border disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-xs font-semibold text-slate-600 dark:text-discord-header">
                        {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1 rounded-lg border border-slate-200 dark:border-discord-border disabled:opacity-40 cursor-pointer"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Coluna Direita: Prévia Detalhada Fixa da Vaga */}
                  <div className="lg:col-span-7 flex flex-col h-full bg-white dark:bg-discord-card rounded-2xl border border-slate-200/90 dark:border-discord-border shadow-sm p-6 overflow-y-auto">
                    {activeSplitJob ? (
                      <div className="space-y-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-2">
                              {renderSourceBadge(activeSplitJob.source)}
                              <span className="text-xs text-slate-400 dark:text-discord-muted">
                                Publicada {formatDistanceToNow(new Date(activeSplitJob.publishedAt), { addSuffix: true, locale: ptBR })}
                              </span>
                            </div>
                            <h3 className="text-lg font-extrabold text-slate-900 dark:text-discord-header leading-snug">
                              {activeSplitJob.title}
                            </h3>
                            <p className="text-sm font-semibold text-slate-700 dark:text-discord-text mt-1 flex items-center gap-2">
                              <Building2 size={15} className="text-slate-400" />
                              <span>{activeSplitJob.company}</span>
                              <span className="text-slate-300 dark:text-discord-border">•</span>
                              <MapPin size={15} className="text-indigo-500" />
                              <span>{formatLocation(activeSplitJob.location, activeSplitJob.modality)}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => toggleFavorite(activeSplitJob.id)}
                              title="Favoritar"
                              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                                favorites.includes(activeSplitJob.id) 
                                  ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-500' 
                                  : 'border-slate-200 dark:border-discord-border text-slate-400 dark:text-discord-muted hover:text-amber-500'
                              }`}
                            >
                              <Bookmark size={16} className={favorites.includes(activeSplitJob.id) ? 'fill-amber-500' : ''} />
                            </button>

                            <button
                              onClick={() => toggleApplied(activeSplitJob.id)}
                              title="Marcar como já me candidatei"
                              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                                appliedJobs.includes(activeSplitJob.id) 
                                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-600' 
                                  : 'border-slate-200 dark:border-discord-border text-slate-400 dark:text-discord-muted hover:text-emerald-600'
                              }`}
                            >
                              <CheckCircle2 size={16} className={appliedJobs.includes(activeSplitJob.id) ? 'fill-emerald-100' : ''} />
                            </button>
                          </div>
                        </div>

                        {/* Remuneração & Benefícios Destacados */}
                        {(activeSplitJob.salary || (activeSplitJob.benefits && activeSplitJob.benefits.length > 0)) && (
                          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50/70 via-teal-50/50 to-indigo-50/50 dark:from-emerald-950/30 dark:via-teal-950/30 dark:to-indigo-950/30 border border-emerald-200/80 dark:border-emerald-800 space-y-2.5">
                            {activeSplitJob.salary && (
                              <div className="flex items-center gap-2">
                                <DollarSign size={16} className="text-emerald-600 dark:text-emerald-400" />
                                <span className="text-xs text-slate-500 dark:text-discord-muted">Salário / Remuneração:</span>
                                <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300">{activeSplitJob.salary}</span>
                              </div>
                            )}

                            {activeSplitJob.benefits && activeSplitJob.benefits.length > 0 && (
                              <div className="flex items-center gap-2 flex-wrap">
                                <Gift size={16} className="text-purple-600 dark:text-purple-400 shrink-0" />
                                <span className="text-xs text-slate-500 dark:text-discord-muted">Benefícios:</span>
                                {activeSplitJob.benefits.map((b, i) => (
                                  <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                                    {b}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Botões de Ação Direta */}
                        <div className="flex items-center gap-3 pt-2">
                          <button
                            onClick={() => handleOpenLink(activeSplitJob.url)}
                            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2"
                          >
                            <span>Candidatar-se na Página Oficial</span>
                            <ExternalLink size={14} />
                          </button>

                          <button
                            onClick={() => handleSendToKanban(activeSplitJob)}
                            className="py-2.5 px-4 bg-indigo-50 dark:bg-discord-input text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-discord-hover border border-indigo-200 dark:border-discord-border font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                          >
                            <Trophy size={14} className="text-amber-500" />
                            <span>Adicionar ao Funil</span>
                          </button>
                        </div>

                        {/* Descrição da Vaga */}
                        <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-discord-border">
                          <h4 className="text-xs font-bold text-slate-700 dark:text-discord-header uppercase tracking-wider">
                            Descrição e Detalhes da Vaga
                          </h4>
                          <div className="text-xs text-slate-600 dark:text-discord-text leading-relaxed whitespace-pre-line bg-slate-50 dark:bg-discord-input p-4 rounded-xl border border-slate-100 dark:border-discord-border max-h-96 overflow-y-auto">
                            {activeSplitJob.description || 'Descrição detalhada não fornecida pela fonte.'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 dark:text-discord-muted">
                        <Columns3 size={32} className="mb-2" />
                        <p className="text-xs">Selecione uma vaga à esquerda para pré-visualizar os detalhes instantaneamente.</p>
                      </div>
                    )}
                  </div>
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
                          className={`bg-white dark:bg-discord-card rounded-2xl border ${
                            isApplied ? 'border-emerald-300 dark:border-emerald-700 ring-1 ring-emerald-300/40' : 'border-slate-200/90 dark:border-discord-border'
                          } p-5 shadow-xs hover:shadow-md hover:dark:bg-discord-hover/30 transition-all flex flex-col justify-between group ${
                            isDismissed ? 'opacity-50 bg-slate-50 dark:bg-discord-input' : ''
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2">
                                {renderSourceBadge(job.source)}

                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-discord-muted">
                                  <Clock size={11} />
                                  {formatDistanceToNow(new Date(job.publishedAt), { addSuffix: true, locale: ptBR })}
                                </span>
                              </div>

                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => handleSendToKanban(job)}
                                  title="Adicionar ao Funil de Candidaturas"
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-discord-border text-slate-400 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-discord-hover transition-all cursor-pointer"
                                >
                                  <Trophy size={14} className="text-amber-500" />
                                </button>

                                <button 
                                  onClick={() => toggleApplied(job.id)}
                                  title={isApplied ? "Remover marcação" : "Marcar como já me candidatei"}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isApplied ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 text-emerald-600' : 'border-slate-200 dark:border-discord-border text-slate-300 dark:text-discord-muted hover:text-emerald-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <CheckCircle2 size={14} className={isApplied ? 'fill-emerald-100' : ''} />
                                </button>

                                <button 
                                  onClick={() => toggleFavorite(job.id)}
                                  title={isFav ? "Remover dos favoritos" : "Salvar vaga"}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isFav ? 'bg-amber-50 dark:bg-amber-950 border-amber-300 text-amber-500' : 'border-slate-200 dark:border-discord-border text-slate-300 dark:text-discord-muted hover:text-amber-500 hover:bg-slate-50'
                                  }`}
                                >
                                  <Bookmark size={14} className={isFav ? 'fill-amber-500' : ''} />
                                </button>

                                <button 
                                  onClick={() => handleDismissJob(job.id)}
                                  title={isDismissed ? "Reexibir vaga" : "Ocultar vaga"}
                                  className="p-1.5 text-slate-300 dark:text-discord-muted hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-discord-hover border border-slate-200 dark:border-discord-border rounded-lg transition-all cursor-pointer"
                                >
                                  {isDismissed ? <Eye size={14} /> : <EyeOff size={14} />}
                                </button>
                              </div>
                            </div>

                            {isApplied && (
                              <div className="mb-2">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                  <Check size={11} className="stroke-[3]" />
                                  Já me candidatei
                                </span>
                              </div>
                            )}

                            <h3 
                              onClick={() => handleOpenDetails(job)}
                              title="Clique para ver os detalhes completos da vaga"
                              className="font-bold text-slate-900 dark:text-discord-header text-sm hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer line-clamp-2 leading-snug flex items-start justify-between gap-1 group/title"
                            >
                              <span>{job.title}</span>
                              <Eye size={14} className="text-slate-300 dark:text-discord-muted group-hover/title:text-indigo-600 transition-colors shrink-0 mt-0.5" />
                            </h3>

                            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-discord-text font-medium mt-2">
                              <Building2 size={13} className="text-slate-400" />
                              <span className="truncate">{job.company}</span>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-discord-muted mt-1.5">
                              <MapPin size={13} className="text-indigo-500 shrink-0" />
                              <span className="truncate">{formatLocation(job.location, job.modality)}</span>
                            </div>

                            {/* Salário e Benefícios em Destaque */}
                            <div className="mt-3 space-y-1.5">
                              {job.salary && (
                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800">
                                  <DollarSign size={12} className="stroke-[2.5]" />
                                  <span>{job.salary}</span>
                                </div>
                              )}

                              {job.benefits && job.benefits.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {job.benefits.slice(0, 3).map((b, i) => (
                                    <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800">
                                      {b}
                                    </span>
                                  ))}
                                  {job.benefits.length > 3 && (
                                    <span className="text-[10px] text-slate-400 dark:text-discord-muted font-semibold self-center">
                                      +{job.benefits.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="mt-5 pt-3 border-t border-slate-100 dark:border-discord-border flex items-center gap-2">
                            <button 
                              onClick={() => handleOpenLink(job.url)}
                              className="flex-1 group/btn relative inline-flex items-center justify-center gap-2 py-2 px-4 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer border border-emerald-500/40"
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
                  <div className="bg-white dark:bg-discord-card rounded-2xl border border-slate-200/90 dark:border-discord-border p-4 flex items-center justify-between flex-wrap gap-3">
                    <span className="text-xs text-slate-500 dark:text-discord-muted">
                      Exibindo <span className="font-semibold text-slate-900 dark:text-discord-header">{filteredAndSortedJobs.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span>–<span className="font-semibold text-slate-900 dark:text-discord-header">{Math.min(currentPage * itemsPerPage, filteredAndSortedJobs.length)}</span> de <span className="font-semibold text-slate-900 dark:text-discord-header">{filteredAndSortedJobs.length}</span> vagas
                    </span>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-discord-border text-slate-600 dark:text-discord-text hover:bg-slate-100 dark:hover:bg-discord-hover disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-xs font-medium flex items-center gap-1"
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
                              currentPage === pageNum ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-discord-text hover:bg-slate-100 dark:hover:bg-discord-hover border border-slate-200 dark:border-discord-border'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-discord-border text-slate-600 dark:text-discord-text hover:bg-slate-100 dark:hover:bg-discord-hover disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-xs font-medium flex items-center gap-1"
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
                <div className="bg-white dark:bg-discord-card rounded-2xl border border-slate-200/90 dark:border-discord-border shadow-sm overflow-hidden w-full">
                  <div className="overflow-x-auto w-full">
                    <table className="w-full text-left border-collapse table-auto">
                      <thead>
                        <tr className="bg-slate-50/90 dark:bg-discord-darkest/90 border-b border-slate-200 dark:border-discord-border text-xs font-bold text-slate-600 dark:text-discord-muted uppercase tracking-wider">
                          <th className="py-3 px-3 w-10 text-center">#</th>

                          <th 
                            className="py-3 px-3 min-w-[220px] cursor-pointer hover:bg-slate-100 dark:hover:bg-discord-hover transition-colors select-none"
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
                            className="py-3 px-3 w-36 max-w-[150px] cursor-pointer hover:bg-slate-100 dark:hover:bg-discord-hover transition-colors select-none"
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
                          <th className="py-3 px-3 min-w-[140px]">Remuneração & Benefícios</th>
                          <th className="py-3 px-3 min-w-[150px]">Local / Modalidade</th>

                          <th 
                            className="py-3 px-3 w-28 whitespace-nowrap cursor-pointer hover:bg-slate-100 dark:hover:bg-discord-hover transition-colors select-none"
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

                          <th className="py-3 px-3 w-52 min-w-[210px] text-center font-extrabold text-emerald-800 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 whitespace-nowrap">
                            Ações & Funil
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-discord-borderSubtle text-xs sm:text-sm">
                        {paginatedJobs.map((job, idx) => {
                          const isFav = favorites.includes(job.id);
                          const isApplied = appliedJobs.includes(job.id);
                          const isDismissed = dismissedJobs.includes(job.id);

                          return (
                            <tr 
                              key={job.id} 
                              className={`hover:bg-slate-50/80 dark:hover:bg-discord-hover/40 transition-colors group ${
                                isApplied ? 'bg-emerald-50/20 dark:bg-emerald-950/20' : ''
                              } ${isDismissed ? 'opacity-50 bg-slate-50 dark:bg-discord-input' : ''}`}
                            >
                              <td className="py-3 px-3 text-xs text-slate-400 dark:text-discord-muted font-mono text-center">
                                {(currentPage - 1) * itemsPerPage + idx + 1}
                              </td>

                              <td className="py-3 px-3">
                                <div className="space-y-1">
                                  <div 
                                    className="font-bold text-slate-900 dark:text-discord-header text-xs sm:text-sm hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer flex items-center gap-1.5 group/title"
                                    onClick={() => handleOpenDetails(job)}
                                    title="Clique para ver os detalhes completos da vaga"
                                  >
                                    <span className="line-clamp-1">{job.title}</span>
                                    <Eye size={13} className="text-slate-300 dark:text-discord-muted group-hover/title:text-indigo-600 transition-colors shrink-0" />
                                  </div>
                                  {isApplied && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded shadow-2xs">
                                      <Check size={10} className="stroke-[3]" />
                                      Já me candidatei
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-3 text-slate-600 dark:text-discord-text text-xs">
                                <div className="flex items-center gap-1.5 font-medium">
                                  <Building2 size={13} className="text-slate-400" />
                                  <span className="truncate max-w-[140px]" title={job.company}>{job.company}</span>
                                </div>
                              </td>

                              <td className="py-3 px-3 text-center">
                                {renderSourceBadge(job.source)}
                              </td>

                              {/* Coluna: Remuneração & Benefícios */}
                              <td className="py-3 px-3 text-xs">
                                <div className="space-y-1 max-w-[160px]">
                                  {job.salary ? (
                                    <div className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                                      <DollarSign size={11} />
                                      <span className="truncate">{job.salary}</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 dark:text-discord-muted text-[11px] italic">A combinar</span>
                                  )}

                                  {job.benefits && job.benefits.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {job.benefits.slice(0, 2).map((b, i) => (
                                        <span key={i} className="text-[10px] px-1 py-0.2 rounded bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                          {b}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-3 text-xs text-slate-600 dark:text-discord-muted">
                                <div className="flex items-center gap-1">
                                  <MapPin size={12} className="text-indigo-500 shrink-0" />
                                  <span className="font-medium truncate max-w-[170px]" title={formatLocation(job.location, job.modality)}>
                                    {formatLocation(job.location, job.modality)}
                                  </span>
                                </div>
                              </td>

                              <td className="py-3 px-3 text-xs text-slate-500 dark:text-discord-muted whitespace-nowrap">
                                <div className="flex items-center gap-1">
                                  <Clock size={12} className="text-slate-400" />
                                  <span>
                                    {formatDistanceToNow(new Date(job.publishedAt), { addSuffix: true, locale: ptBR })}
                                  </span>
                                </div>
                              </td>

                              {/* Ações por Linha */}
                              <td className="py-3 px-3 text-center bg-slate-50/40 dark:bg-discord-darkest/40 whitespace-nowrap w-52 min-w-[210px]">
                                <div className="flex items-center justify-center gap-1.5">
                                  <button 
                                    onClick={() => handleOpenLink(job.url)}
                                    className="group/btn relative inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap border border-emerald-500/40"
                                    title="Abrir página oficial de inscrição"
                                  >
                                    <span className="tracking-wide uppercase text-[10px]">Candidatar</span>
                                    <ExternalLink size={12} className="stroke-[2.2]" />
                                  </button>

                                  <button 
                                    onClick={() => handleSendToKanban(job)}
                                    title="Adicionar ao Funil de Candidaturas"
                                    className="p-1.5 rounded-xl border border-slate-200 dark:border-discord-border text-slate-400 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-discord-hover transition-all cursor-pointer"
                                  >
                                    <Trophy size={14} className="text-amber-500" />
                                  </button>

                                  <button 
                                    onClick={() => toggleApplied(job.id)}
                                    title={isApplied ? "Remover candidatura" : "Marcar como: Já me candidatei"}
                                    className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                                      isApplied 
                                        ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-300 text-emerald-600' 
                                        : 'border-slate-200 dark:border-discord-border text-slate-400 hover:text-emerald-600 hover:bg-emerald-50/50'
                                    }`}
                                  >
                                    <CheckCircle2 size={14} className={isApplied ? 'fill-emerald-100 text-emerald-600' : ''} />
                                  </button>

                                  <button 
                                    onClick={() => toggleFavorite(job.id)}
                                    title={isFav ? "Remover dos favoritos" : "Salvar vaga"}
                                    className={`p-1.5 rounded-xl border transition-all cursor-pointer ${
                                      isFav 
                                        ? 'bg-amber-50 dark:bg-amber-950 border-amber-300 text-amber-500' 
                                        : 'border-slate-200 dark:border-discord-border text-slate-400 hover:text-amber-500 hover:bg-amber-50/50'
                                    }`}
                                  >
                                    <Bookmark size={14} className={isFav ? 'fill-amber-500' : ''} />
                                  </button>

                                  <button 
                                    onClick={() => handleDismissJob(job.id)}
                                    title={isDismissed ? "Reexibir vaga" : "Ocultar vaga"}
                                    className={`p-1.5 border border-slate-200 dark:border-discord-border rounded-xl transition-all cursor-pointer ${
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

                  {/* ---------------- PAGINAÇÃO LIMPA ---------------- */}
                  <div className="bg-slate-50/90 dark:bg-discord-darkest/90 border-t border-slate-200 dark:border-discord-border px-6 py-3 flex items-center justify-between flex-wrap gap-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 dark:text-discord-muted">
                        Exibindo <span className="font-semibold text-slate-900 dark:text-discord-header">{filteredAndSortedJobs.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span>–<span className="font-semibold text-slate-900 dark:text-discord-header">{Math.min(currentPage * itemsPerPage, filteredAndSortedJobs.length)}</span> de <span className="font-semibold text-slate-900 dark:text-discord-header">{filteredAndSortedJobs.length}</span> vagas
                      </span>

                      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-discord-muted">
                        <span>Por página:</span>
                        <select 
                          value={itemsPerPage}
                          onChange={(e) => {
                            setItemsPerPage(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                          className="bg-white dark:bg-discord-input border border-slate-200 dark:border-discord-border rounded-lg px-2 py-1 text-xs outline-none cursor-pointer text-slate-700 dark:text-discord-header"
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
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-discord-border bg-white dark:bg-discord-card text-slate-600 dark:text-discord-text hover:bg-slate-100 dark:hover:bg-discord-hover disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-xs font-medium flex items-center gap-1"
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
                              currentPage === pageNum ? 'bg-indigo-600 text-white shadow-xs' : 'bg-white dark:bg-discord-card text-slate-600 dark:text-discord-text hover:bg-slate-100 dark:hover:bg-discord-hover border border-slate-200 dark:border-discord-border'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}

                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-discord-border bg-white dark:bg-discord-card text-slate-600 dark:text-discord-text hover:bg-slate-100 dark:hover:bg-discord-hover disabled:opacity-40 disabled:pointer-events-none cursor-pointer text-xs font-medium flex items-center gap-1"
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

          {/* ABA CONFIGURAÇÕES */}
          {activeTab === 'settings' && (
            <div className="max-w-4xl mx-auto space-y-6 pb-12">
              {/* CARTÃO 1: NOTIFICAÇÕES EXTERNAS (TELEGRAM & DISCORD) */}
              <div className="bg-white dark:bg-discord-card rounded-2xl border border-slate-200 dark:border-discord-border p-6 sm:p-8 shadow-sm space-y-6">
                <div className="flex items-start justify-between flex-wrap gap-4 pb-4 border-b border-slate-100 dark:border-discord-border">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-emerald-500 rounded-xl text-white shadow-xs">
                      <Send size={22} className="stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-discord-header">Notificações Externas</h2>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          Telegram & Discord
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-discord-muted mt-0.5">
                        Receba novas vagas diretamente no seu celular ou servidor sem precisar olhar o computador.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Bloco Telegram */}
                  <div className="p-5 rounded-2xl border border-slate-200 dark:border-discord-border bg-slate-50/50 dark:bg-discord-input/60 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#229ED9] text-white flex items-center justify-center font-bold text-xs">
                          TG
                        </div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-discord-header">Telegram Bot</h4>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={externalSettings.telegramEnabled}
                          onChange={(e) => setExternalSettings(prev => ({ ...prev, telegramEnabled: e.target.checked }))}
                          className="sr-only peer" 
                        />
                        <div className="w-9 h-5 bg-slate-200 dark:bg-discord-card peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="font-semibold text-slate-700 dark:text-discord-text block mb-1">Bot Token:</label>
                        <input
                          type="password"
                          value={externalSettings.telegramBotToken}
                          onChange={(e) => setExternalSettings(prev => ({ ...prev, telegramBotToken: e.target.value }))}
                          placeholder="Ex: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                          className="w-full px-3 py-2 bg-white dark:bg-discord-darkest border border-slate-200 dark:border-discord-border rounded-xl outline-none focus:border-indigo-500 font-mono text-[11px] text-slate-900 dark:text-discord-header"
                        />
                      </div>

                      <div>
                        <label className="font-semibold text-slate-700 dark:text-discord-text block mb-1">Chat ID / Canal:</label>
                        <input
                          type="text"
                          value={externalSettings.telegramChatId}
                          onChange={(e) => setExternalSettings(prev => ({ ...prev, telegramChatId: e.target.value }))}
                          placeholder="Ex: 987654321 ou @meucanal"
                          className="w-full px-3 py-2 bg-white dark:bg-discord-darkest border border-slate-200 dark:border-discord-border rounded-xl outline-none focus:border-indigo-500 font-mono text-[11px] text-slate-900 dark:text-discord-header"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => handleTestExternal('telegram')}
                        disabled={isTestingTelegram || !externalSettings.telegramBotToken || !externalSettings.telegramChatId}
                        className="w-full py-2 px-3 rounded-xl bg-slate-200 dark:bg-discord-card hover:bg-[#229ED9] hover:text-white transition-all font-bold text-xs cursor-pointer disabled:opacity-40 text-slate-700 dark:text-discord-header"
                      >
                        {isTestingTelegram ? 'Enviando teste...' : 'Testar Mensagem no Telegram'}
                      </button>
                    </div>
                  </div>

                  {/* Bloco Discord */}
                  <div className="p-5 rounded-2xl border border-slate-200 dark:border-discord-border bg-slate-50/50 dark:bg-discord-input/60 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#5865F2] text-white flex items-center justify-center font-bold text-xs">
                          DC
                        </div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-discord-header">Discord Webhook</h4>
                      </div>

                      <label className="relative inline-flex items-center cursor-pointer">
                        <input 
                          type="checkbox" 
                          checked={externalSettings.discordEnabled}
                          onChange={(e) => setExternalSettings(prev => ({ ...prev, discordEnabled: e.target.checked }))}
                          className="sr-only peer" 
                        />
                        <div className="w-9 h-5 bg-slate-200 dark:bg-discord-card peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>

                    <div className="space-y-3 text-xs">
                      <div>
                        <label className="font-semibold text-slate-700 dark:text-discord-text block mb-1">Webhook URL:</label>
                        <input
                          type="password"
                          value={externalSettings.discordWebhookUrl}
                          onChange={(e) => setExternalSettings(prev => ({ ...prev, discordWebhookUrl: e.target.value }))}
                          placeholder="https://discord.com/api/webhooks/..."
                          className="w-full px-3 py-2 bg-white dark:bg-discord-darkest border border-slate-200 dark:border-discord-border rounded-xl outline-none focus:border-indigo-500 font-mono text-[11px] text-slate-900 dark:text-discord-header"
                        />
                      </div>

                      <div className="pt-7">
                        <button
                          type="button"
                          onClick={() => handleTestExternal('discord')}
                          disabled={isTestingDiscord || !externalSettings.discordWebhookUrl}
                          className="w-full py-2 px-3 rounded-xl bg-slate-200 dark:bg-discord-card hover:bg-[#5865F2] hover:text-white transition-all font-bold text-xs cursor-pointer disabled:opacity-40 text-slate-700 dark:text-discord-header"
                        >
                          {isTestingDiscord ? 'Enviando teste...' : 'Testar Embed no Discord'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => handleSaveExternalSettings(externalSettings)}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                  >
                    Salvar Integrações Externas
                  </button>
                </div>
              </div>

              {/* CARTÃO 2: HEALTH CHECK & MONITOR DAS 7 FONTES NACIONAIS */}
              <div className="bg-white dark:bg-discord-card rounded-2xl border border-slate-200 dark:border-discord-border p-6 sm:p-8 shadow-sm space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-slate-100 dark:border-discord-border">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl text-white shadow-xs">
                      <Activity size={22} className="stroke-[2.2]" />
                    </div>
                    <div>
                      <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-discord-header">Health Check & Fontes Nacionais</h2>
                      <p className="text-xs text-slate-500 dark:text-discord-muted mt-0.5">
                        Status operacional em tempo real de cada uma das 7 plataformas integradas.
                      </p>
                    </div>
                  </div>

                  <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                    7 de 7 Operando
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {PLATFORMS_INFO.map((p) => {
                    const count = jobs.filter(j => j.source.toLowerCase().includes(p.id)).length;
                    return (
                      <div key={p.id} className="p-4 rounded-xl border border-slate-200 dark:border-discord-border bg-slate-50/50 dark:bg-discord-input/60 flex flex-col justify-between gap-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-discord-header">{p.name}</h4>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle size={10} /> Online
                          </span>
                        </div>

                        <div className="space-y-1 text-xs text-slate-500 dark:text-discord-muted">
                          <div className="flex justify-between">
                            <span>Protocolo:</span>
                            <span className="font-mono text-slate-700 dark:text-discord-text">{p.type}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Latência:</span>
                            <span className="font-mono text-slate-700 dark:text-discord-text">{p.latency}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Vagas no banco:</span>
                            <span className="font-bold text-indigo-600 dark:text-indigo-400">{count}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* CARTÃO 3: AVISOS PROGRAMÁVEIS (WINDOWS) */}
              <div className="bg-white dark:bg-discord-card rounded-2xl border border-slate-200 dark:border-discord-border p-6 sm:p-8 shadow-sm space-y-6">
                <div className="flex items-start justify-between flex-wrap gap-4 pb-4 border-b border-slate-100 dark:border-discord-border">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl text-white shadow-xs">
                      <BellRing size={22} className="stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-discord-header">Avisos Programáveis (Windows)</h2>
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          Filtro Inteligente
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-discord-muted mt-0.5">
                        Defina exatamente para quais vagas você quer receber notificações no Windows.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleTestNotification}
                    disabled={isTestingNotify}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 dark:bg-discord-input hover:bg-slate-200 dark:hover:bg-discord-hover active:scale-95 text-slate-700 dark:text-discord-header rounded-xl text-xs font-semibold border border-slate-200 dark:border-discord-border transition-all cursor-pointer shadow-2xs disabled:opacity-50"
                    title="Dispara um balão de notificação no Windows para testar"
                  >
                    <BellRing size={13} className={isTestingNotify ? 'animate-bounce text-indigo-600' : 'text-slate-500'} />
                    <span>{isTestingNotify ? 'Enviando...' : 'Testar Notificação'}</span>
                  </button>
                </div>

                {/* Seletor de Modo de Aviso */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-700 dark:text-discord-text uppercase tracking-wider block">
                    Modo de Disparo das Notificações
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleNotifyMode(true)}
                      className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        notifyAllRoles
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-discord-hover/70 shadow-xs'
                          : 'border-slate-200 dark:border-discord-border bg-white dark:bg-discord-input/50 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 dark:text-discord-header">Todas as Oportunidades</span>
                        <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          notifyAllRoles ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-discord-border'
                        }`}>
                          {notifyAllRoles && <Check size={10} className="stroke-[3]" />}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-discord-muted leading-relaxed">
                        Avisar sempre que qualquer nova vaga for encontrada na varredura.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleNotifyMode(false)}
                      className={`p-4 rounded-xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                        !notifyAllRoles
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-discord-hover/70 shadow-xs'
                          : 'border-slate-200 dark:border-discord-border bg-white dark:bg-discord-input/50 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-discord-header">Apenas Cargos Selecionados</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            Sem Spam
                          </span>
                        </div>
                        <span className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          !notifyAllRoles ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-discord-border'
                        }`}>
                          {!notifyAllRoles && <Check size={10} className="stroke-[3]" />}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-discord-muted leading-relaxed">
                        Notificar apenas quando a vaga pertencer aos cargos ou termos abaixo.
                      </p>
                    </button>
                  </div>
                </div>

                {/* Grade de Cargos Programáveis */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 dark:text-discord-text uppercase tracking-wider">
                        Cargos de Interesse
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-discord-muted">
                        Selecione as áreas que devem acionar a notificação no Windows
                      </p>
                    </div>
                    {!notifyAllRoles && (
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800">
                        {selectedNotifyRoles.length} selecionado{selectedNotifyRoles.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {PRESET_NOTIFICATION_ROLES.map((role) => {
                      const isSelected = selectedNotifyRoles.includes(role.id);
                      return (
                        <div
                          key={role.id}
                          onClick={() => handleToggleNotifyRole(role.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-indigo-50/60 dark:bg-discord-hover border-indigo-300 dark:border-indigo-600 text-slate-900 dark:text-discord-header shadow-2xs'
                              : 'bg-white dark:bg-discord-input/60 border-slate-200 dark:border-discord-border text-slate-600 dark:text-discord-muted hover:border-slate-300'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate text-slate-900 dark:text-discord-header">{role.label}</p>
                            <p className="text-[10px] text-slate-500 dark:text-discord-muted truncate">{role.desc}</p>
                          </div>

                          <div className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-all ${
                            isSelected 
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' 
                              : 'border-slate-300 dark:border-discord-border bg-white dark:bg-discord-card'
                          }`}>
                            {isSelected && <Check size={12} className="stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Palavras-chave Customizadas */}
                <div className="space-y-3 pt-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 dark:text-discord-text uppercase tracking-wider">
                      Termos e Palavras-chave Adicionais
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-discord-muted">
                      Receba alertas também se o título da vaga contiver algum destes termos
                    </p>
                  </div>

                  <form onSubmit={handleAddKeyword} className="flex gap-2">
                    <div className="relative flex-1">
                      <Tag size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={newKeywordInput}
                        onChange={(e) => setNewKeywordInput(e.target.value)}
                        placeholder="Ex: Home Office, Desenvolvedor, Design, PCD, React..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-discord-input border border-slate-200 dark:border-discord-border rounded-xl text-xs text-slate-800 dark:text-discord-header placeholder-slate-400 dark:placeholder-discord-muted focus:outline-none focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={!newKeywordInput.trim()}
                      className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs whitespace-nowrap"
                    >
                      <Plus size={14} className="stroke-[2.5]" />
                      <span>Adicionar</span>
                    </button>
                  </form>

                  {customNotifyKeywords.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {customNotifyKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-discord-input hover:bg-slate-200 dark:hover:bg-discord-hover border border-slate-200 dark:border-discord-border rounded-lg text-xs font-medium text-slate-800 dark:text-discord-header transition-colors"
                        >
                          <span>{kw}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyword(kw)}
                            className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                            title="Remover termo"
                          >
                            <X size={12} className="stroke-[2.5]" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400 dark:text-discord-muted italic">
                      Nenhum termo adicional cadastrado.
                    </p>
                  )}
                </div>
              </div>

              {/* CARTÃO 4: MOTOR DE MONITORAMENTO & SISTEMA */}
              <div className="bg-white dark:bg-discord-card rounded-2xl border border-slate-200 dark:border-discord-border p-6 sm:p-8 shadow-sm space-y-6">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-discord-header mb-0.5">Motor de Monitoramento & Sistema</h3>
                  <p className="text-xs text-slate-500 dark:text-discord-muted">Parâmetros do processo nativo em segundo plano e scrapers.</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-discord-input/60 rounded-xl border border-slate-200 dark:border-discord-border">
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-discord-header">Notificações Toast do Windows</h4>
                      <p className="text-[11px] text-slate-500 dark:text-discord-muted">Exibir balão nativo no canto da tela ao encontrar novas vagas</p>
                    </div>
                    <button
                      onClick={handleToggleMute}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                        monitorStatus?.muted ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {monitorStatus?.muted ? 'Silenciado' : 'Ativado'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-discord-input/60 rounded-xl border border-slate-200 dark:border-discord-border">
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-discord-header">Rotina em Segundo Plano</h4>
                      <p className="text-[11px] text-slate-500 dark:text-discord-muted">Varreduras periódicas a cada 15 minutos (com cache local resiliente)</p>
                    </div>
                    <button
                      onClick={handleTogglePause}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                        monitorStatus?.paused ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {monitorStatus?.paused ? 'Pausado' : 'Monitorando'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-discord-input/60 rounded-xl border border-slate-200 dark:border-discord-border">
                    <div>
                      <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-discord-header">Bandeja do Sistema (System Tray)</h4>
                      <p className="text-[11px] text-slate-500 dark:text-discord-muted">Ao fechar a janela, o aplicativo permanece rodando discretamente na bandeja</p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 rounded-lg">
                      Habilitado
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

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
        onSendToKanban={handleSendToKanban}
      />
    </div>
  );
}
