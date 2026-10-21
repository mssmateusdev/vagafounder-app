import React, { useEffect, useRef } from 'react';
import { 
  ExternalLink, 
  Bookmark, 
  CheckCircle2, 
  Copy, 
  Building2, 
  EyeOff, 
  Maximize2,
  Trophy
} from 'lucide-react';
import type { Job } from '../types';

export interface ContextMenuState {
  x: number;
  y: number;
  job: Job;
}

interface DesktopContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  isFavorite: boolean;
  isApplied: boolean;
  onToggleFavorite: (id: string) => void;
  onToggleApplied: (id: string) => void;
  onOpenLink: (url: string) => void;
  onOpenDetails: (job: Job) => void;
  onFilterCompany: (company: string) => void;
  onDismissJob: (id: string) => void;
  onSendToKanban: (job: Job) => void;
  onCopyLink: (url: string) => void;
}

export const DesktopContextMenu: React.FC<DesktopContextMenuProps> = ({
  menu,
  onClose,
  isFavorite,
  isApplied,
  onToggleFavorite,
  onToggleApplied,
  onOpenLink,
  onOpenDetails,
  onFilterCompany,
  onDismissJob,
  onSendToKanban,
  onCopyLink
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!menu) return null;

  // Ajustar posição para não transbordar a janela
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const menuWidth = 240;
  const menuHeight = 310;

  const posX = menu.x + menuWidth > screenWidth ? Math.max(10, screenWidth - menuWidth - 10) : menu.x;
  const posY = menu.y + menuHeight > screenHeight ? Math.max(10, screenHeight - menuHeight - 10) : menu.y;

  return (
    <div
      ref={menuRef}
      style={{ top: `${posY}px`, left: `${posX}px` }}
      className="fixed z-50 w-60 bg-slate-900/95 dark:bg-[#1e1f22]/98 backdrop-blur-md text-slate-200 border border-slate-700/80 rounded-lg shadow-2xl py-1 text-xs select-none animate-in fade-in zoom-in-95 duration-100"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Cabeçalho do menu com resumo da vaga */}
      <div className="px-3 py-1.5 border-b border-slate-800 text-[11px]">
        <div className="font-semibold text-white truncate">{menu.job.title}</div>
        <div className="text-slate-400 truncate">{menu.job.company}</div>
      </div>

      <div className="py-1">
        <button
          onClick={() => { onOpenLink(menu.job.url); onClose(); }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <ExternalLink size={13} className="text-emerald-400" />
            Abrir Candidatura
          </span>
          <span className="text-[10px] text-slate-400">Enter</span>
        </button>

        <button
          onClick={() => { onOpenDetails(menu.job); onClose(); }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Maximize2 size={13} className="text-indigo-400" />
            Visualizar Detalhes
          </span>
          <span className="text-[10px] text-slate-400">Espaço</span>
        </button>

        <button
          onClick={() => { onSendToKanban(menu.job); onClose(); }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-emerald-600 hover:text-white text-left transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Trophy size={13} className="text-amber-400" />
            Enviar para o Funil (Kanban)
          </span>
        </button>
      </div>

      <div className="border-t border-slate-800 my-1"></div>

      <div className="py-1">
        <button
          onClick={() => { onToggleFavorite(menu.job.id); onClose(); }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <Bookmark size={13} className={isFavorite ? "text-amber-400 fill-amber-400" : "text-slate-400"} />
            {isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
          </span>
          <span className="text-[10px] text-slate-400">F</span>
        </button>

        <button
          onClick={() => { onToggleApplied(menu.job.id); onClose(); }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-600 hover:text-white text-left transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2">
            <CheckCircle2 size={13} className={isApplied ? "text-indigo-400 fill-indigo-400/20" : "text-slate-400"} />
            {isApplied ? 'Remover de Inscrito' : 'Marcar como Inscrito'}
          </span>
        </button>

        <button
          onClick={() => { onCopyLink(menu.job.url); onClose(); }}
          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-indigo-600 hover:text-white text-left transition-colors cursor-pointer"
        >
          <Copy size={13} className="text-slate-400" />
          Copiar Link da Vaga
        </button>
      </div>

      <div className="border-t border-slate-800 my-1"></div>

      <div className="py-1">
        <button
          onClick={() => { onFilterCompany(menu.job.company); onClose(); }}
          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-indigo-600 hover:text-white text-left transition-colors cursor-pointer"
        >
          <Building2 size={13} className="text-slate-400" />
          Filtrar por esta Empresa
        </button>

        <button
          onClick={() => { onDismissJob(menu.job.id); onClose(); }}
          className="w-full px-3 py-1.5 flex items-center gap-2 hover:bg-rose-600 hover:text-white text-left transition-colors cursor-pointer"
        >
          <EyeOff size={13} className="text-rose-400" />
          Ocultar esta Vaga
        </button>
      </div>
    </div>
  );
};
