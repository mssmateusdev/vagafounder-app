import React from 'react';
import { 
  Activity, 
  Pause, 
  RefreshCw, 
  Keyboard
} from 'lucide-react';
import type { MonitorStatus } from '../types';

interface DesktopStatusBarProps {
  monitorStatus: MonitorStatus | null;
  totalJobs: number;
  kanbanCount: number;
  favoritesCount: number;
  appliedCount: number;
  isScanning: boolean;
  nextCheckMinutes: string | null;
  onOpenShortcuts: () => void;
  onSync: () => void;
}

export const DesktopStatusBar: React.FC<DesktopStatusBarProps> = ({
  monitorStatus,
  totalJobs,
  kanbanCount,
  favoritesCount,
  appliedCount,
  isScanning,
  nextCheckMinutes,
  onOpenShortcuts,
  onSync
}) => {
  const isPaused = monitorStatus?.paused ?? false;

  return (
    <footer className="h-6 w-full bg-slate-900 border-t border-slate-800 text-slate-400 text-[11px] flex items-center justify-between px-3 select-none z-30 shrink-0 font-medium">
      {/* Esquerda: Status do Motor em Segundo Plano */}
      <div className="flex items-center gap-3">
        <button
          onClick={onSync}
          disabled={isScanning}
          className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer group"
          title="Clique para sincronizar agora (F5)"
        >
          {isScanning ? (
            <>
              <RefreshCw size={11} className="animate-spin text-amber-400" />
              <span className="text-amber-400 font-semibold">Varrendo 7 plataformas...</span>
            </>
          ) : isPaused ? (
            <>
              <Pause size={11} className="text-amber-400" />
              <span className="text-amber-400">Monitor Pausado</span>
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-emerald-400 desktop-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
              <span className="text-emerald-400 font-semibold">Motor Ativo</span>
              <span className="text-slate-500 font-normal">
                {nextCheckMinutes ? `(próxima: ${nextCheckMinutes})` : '(a cada 15 min)'}
              </span>
            </>
          )}
        </button>

        <span className="text-slate-700">|</span>

        {/* Status das Fontes */}
        <div className="hidden md:flex items-center gap-1.5 text-slate-400">
          <Activity size={11} className="text-indigo-400" />
          <span>7 Fontes Conectadas</span>
          <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1 rounded">
            100% OK
          </span>
        </div>
      </div>

      {/* Centro: Contadores em Tempo Real */}
      <div className="hidden sm:flex items-center gap-3 text-slate-300">
        <span className="flex items-center gap-1">
          <span className="text-slate-400">Vagas:</span>
          <span className="font-semibold text-white">{totalJobs}</span>
        </span>
        <span className="text-slate-700">•</span>
        <span className="flex items-center gap-1">
          <span className="text-slate-400">Funil:</span>
          <span className="font-semibold text-emerald-400">{kanbanCount}</span>
        </span>
        <span className="text-slate-700">•</span>
        <span className="flex items-center gap-1">
          <span className="text-slate-400">Favoritas:</span>
          <span className="font-semibold text-amber-400">{favoritesCount}</span>
        </span>
        <span className="text-slate-700">•</span>
        <span className="flex items-center gap-1">
          <span className="text-slate-400">Inscrito:</span>
          <span className="font-semibold text-indigo-400">{appliedCount}</span>
        </span>
      </div>

      {/* Direita: Atalhos Rápidos */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenShortcuts}
          className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Ver todos os atalhos de teclado (F1)"
        >
          <Keyboard size={11} className="text-indigo-400" />
          <span className="hidden lg:inline text-[10px] bg-slate-800 px-1.5 py-0.2 rounded border border-slate-700 text-slate-300">
            F1 Atalhos
          </span>
        </button>

        <span className="text-slate-700 hidden lg:inline">|</span>

        <span className="text-[10px] text-slate-500 hidden xl:inline">
          F5 Sincronizar • Ctrl+K Buscar • Espaço Detalhes
        </span>
      </div>
    </footer>
  );
};
