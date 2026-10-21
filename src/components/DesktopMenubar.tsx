import React, { useState, useEffect, useRef } from 'react';
import { 
  RefreshCw, 
  Download, 
  Trash2, 
  Minus, 
  X, 
  Table, 
  LayoutGrid, 
  Columns3, 
  Sun, 
  Moon, 
  PanelLeft, 
  Briefcase, 
  Trophy, 
  Bookmark, 
  Settings, 
  Play, 
  Pause, 
  HelpCircle, 
  Info,
  Laptop
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface DesktopMenubarProps {
  onSync: () => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
  onClearCache: () => void;
  activeTab: 'jobs' | 'kanban' | 'history' | 'settings';
  setActiveTab: (tab: 'jobs' | 'kanban' | 'history' | 'settings') => void;
  viewMode: 'table' | 'cards' | 'split';
  setViewMode: (mode: 'table' | 'cards' | 'split') => void;
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void;
  isPaused: boolean;
  togglePause: () => void;
  onOpenShortcuts: () => void;
  onOpenAbout: () => void;
  isScanning: boolean;
}

export const DesktopMenubar: React.FC<DesktopMenubarProps> = ({
  onSync,
  onExportCSV,
  onExportJSON,
  onClearCache,
  activeTab: _activeTab,
  setActiveTab,
  viewMode,
  setViewMode,
  isDarkMode,
  toggleDarkMode,
  isSidebarCollapsed: _isSidebarCollapsed,
  setIsSidebarCollapsed,
  isPaused,
  togglePause,
  onOpenShortcuts,
  onOpenAbout,
  isScanning
}) => {
  const [openMenu, setOpenMenu] = useState<'arquivo' | 'exibir' | 'ferramentas' | 'ajuda' | null>(null);
  const menubarRef = useRef<HTMLDivElement>(null);

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menubarRef.current && !menubarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMinimize = async () => {
    try {
      await invoke('minimize_window');
    } catch {
      // fallback caso executado em preview web
    }
    setOpenMenu(null);
  };

  const handleHideToTray = async () => {
    try {
      await invoke('hide_to_tray');
    } catch {
      // fallback
    }
    setOpenMenu(null);
  };

  const handleExitApp = async () => {
    try {
      await invoke('exit_app');
    } catch {
      window.close();
    }
  };

  return (
    <div 
      ref={menubarRef} 
      className="h-7 w-full bg-slate-900 border-b border-slate-800 text-slate-300 text-xs flex items-center justify-between px-2 select-none z-40 shrink-0"
    >
      <div className="flex items-center gap-1">
        {/* Marca desktop */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 text-indigo-400 font-semibold border-r border-slate-800 mr-1">
          <Laptop size={13} className="text-emerald-400" />
          <span className="text-[11px] tracking-wide text-slate-200">VagaFounder</span>
        </div>

        {/* Menu Arquivo */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'arquivo' ? null : 'arquivo')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              openMenu === 'arquivo' ? 'bg-slate-700 text-white' : 'hover:bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Arquivo
          </button>
          {openMenu === 'arquivo' && (
            <div className="absolute left-0 top-full mt-0.5 w-60 bg-slate-800 text-slate-200 border border-slate-700 rounded-md shadow-2xl py-1 text-xs z-50">
              <button
                onClick={() => { onSync(); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <RefreshCw size={13} className={isScanning ? "animate-spin text-emerald-400" : ""} />
                  Sincronizar Vagas
                </span>
                <span className="text-[10px] text-slate-400">F5</span>
              </button>

              <button
                onClick={() => { onExportCSV(); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <Download size={13} />
                  Exportar para CSV
                </span>
                <span className="text-[10px] text-slate-400">Excel</span>
              </button>

              <button
                onClick={() => { onExportJSON(); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <Download size={13} />
                  Exportar para JSON
                </span>
                <span className="text-[10px] text-slate-400">Dados</span>
              </button>

              <div className="my-1 border-t border-slate-700"></div>

              <button
                onClick={() => { onClearCache(); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-amber-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <Trash2 size={13} />
                  Limpar Cache Local
                </span>
              </button>

              <div className="my-1 border-t border-slate-700"></div>

              <button
                onClick={handleMinimize}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <Minus size={13} />
                  Minimizar Janela
                </span>
              </button>

              <button
                onClick={handleHideToTray}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <Minus size={13} />
                  Ocultar na Bandeja (Tray)
                </span>
              </button>

              <button
                onClick={handleExitApp}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-rose-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <X size={13} />
                  Sair do VagaFounder
                </span>
                <span className="text-[10px] text-slate-400">Alt+F4</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu Exibir */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'exibir' ? null : 'exibir')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              openMenu === 'exibir' ? 'bg-slate-700 text-white' : 'hover:bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Exibir
          </button>
          {openMenu === 'exibir' && (
            <div className="absolute left-0 top-full mt-0.5 w-56 bg-slate-800 text-slate-200 border border-slate-700 rounded-md shadow-2xl py-1 text-xs z-50">
              <button
                onClick={() => { setViewMode('table'); setOpenMenu(null); }}
                className={`w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left ${viewMode === 'table' ? 'text-indigo-400 font-semibold' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <Table size={13} />
                  Modo Tabela
                </span>
                <span className="text-[10px] text-slate-400">Alt+1</span>
              </button>

              <button
                onClick={() => { setViewMode('cards'); setOpenMenu(null); }}
                className={`w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left ${viewMode === 'cards' ? 'text-indigo-400 font-semibold' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <LayoutGrid size={13} />
                  Modo Cards
                </span>
                <span className="text-[10px] text-slate-400">Alt+2</span>
              </button>

              <button
                onClick={() => { setViewMode('split'); setOpenMenu(null); }}
                className={`w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left ${viewMode === 'split' ? 'text-indigo-400 font-semibold' : ''}`}
              >
                <span className="flex items-center gap-2">
                  <Columns3 size={13} />
                  Modo Dividido (Split)
                </span>
                <span className="text-[10px] text-slate-400">Alt+3</span>
              </button>

              <div className="my-1 border-t border-slate-700"></div>

              <button
                onClick={() => { toggleDarkMode(); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  {isDarkMode ? <Sun size={13} className="text-amber-400" /> : <Moon size={13} />}
                  {isDarkMode ? 'Tema Claro' : 'Tema Escuro'}
                </span>
                <span className="text-[10px] text-slate-400">Alt+T</span>
              </button>

              <button
                onClick={() => { setIsSidebarCollapsed(prev => !prev); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <PanelLeft size={13} />
                  Alternar Barra Lateral
                </span>
                <span className="text-[10px] text-slate-400">Ctrl+B</span>
              </button>
            </div>
          )}
        </div>

        {/* Menu Ferramentas */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'ferramentas' ? null : 'ferramentas')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              openMenu === 'ferramentas' ? 'bg-slate-700 text-white' : 'hover:bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Ferramentas
          </button>
          {openMenu === 'ferramentas' && (
            <div className="absolute left-0 top-full mt-0.5 w-60 bg-slate-800 text-slate-200 border border-slate-700 rounded-md shadow-2xl py-1 text-xs z-50">
              <button
                onClick={() => { setActiveTab('jobs'); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-indigo-600 hover:text-white text-left"
              >
                <Briefcase size={13} />
                Painel de Vagas
              </button>

              <button
                onClick={() => { setActiveTab('kanban'); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-indigo-600 hover:text-white text-left"
              >
                <Trophy size={13} className="text-amber-400" />
                Funil de Candidaturas (Kanban)
              </button>

              <button
                onClick={() => { setActiveTab('history'); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-indigo-600 hover:text-white text-left"
              >
                <Bookmark size={13} />
                Minhas Vagas (Favoritos & Histórico)
              </button>

              <button
                onClick={() => { setActiveTab('settings'); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-indigo-600 hover:text-white text-left"
              >
                <Settings size={13} />
                Configurações & Notificações
              </button>

              <div className="my-1 border-t border-slate-700"></div>

              <button
                onClick={() => { togglePause(); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  {isPaused ? <Play size={13} className="text-emerald-400" /> : <Pause size={13} className="text-amber-400" />}
                  {isPaused ? 'Retomar Monitoramento' : 'Pausar Monitoramento'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Menu Ajuda */}
        <div className="relative">
          <button
            onClick={() => setOpenMenu(openMenu === 'ajuda' ? null : 'ajuda')}
            className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
              openMenu === 'ajuda' ? 'bg-slate-700 text-white' : 'hover:bg-slate-800 text-slate-300 hover:text-white'
            }`}
          >
            Ajuda
          </button>
          {openMenu === 'ajuda' && (
            <div className="absolute left-0 top-full mt-0.5 w-56 bg-slate-800 text-slate-200 border border-slate-700 rounded-md shadow-2xl py-1 text-xs z-50">
              <button
                onClick={() => { onOpenShortcuts(); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left"
              >
                <span className="flex items-center gap-2">
                  <HelpCircle size={13} />
                  Atalhos de Teclado
                </span>
                <span className="text-[10px] text-slate-400">F1</span>
              </button>

              <button
                onClick={() => { onOpenAbout(); setOpenMenu(null); }}
                className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-indigo-600 hover:text-white text-left"
              >
                <Info size={13} />
                Sobre o VagaFounder
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Indicador de Status Rápido no Menubar */}
      <div className="flex items-center gap-3 pr-2 text-[11px]">
        {isScanning ? (
          <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
            <RefreshCw size={11} className="animate-spin" />
            Sincronizando...
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 desktop-pulse"></span>
            Pronto
          </span>
        )}
      </div>
    </div>
  );
};
