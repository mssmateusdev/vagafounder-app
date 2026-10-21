import React from 'react';
import { X, Briefcase, ExternalLink, ShieldCheck, Cpu } from 'lucide-react';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenLink: (url: string) => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, onOpenLink }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-md bg-slate-900 text-slate-100 rounded-xl border border-slate-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <h3 className="text-sm font-bold text-white">Sobre o VagaFounder</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-500 flex items-center justify-center text-white shadow-xl shadow-indigo-600/30">
            <Briefcase size={28} className="stroke-[2.5]" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">VagaFounder Desktop</h2>
            <p className="text-xs text-emerald-400 font-semibold">Versão 1.1.1 (Build Nativa Windows x64)</p>
            <p className="text-[11px] text-slate-400 mt-1">por MateusDeveloper</p>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed px-2">
            Monitor desktop de alta performance para detecção e acompanhamento contínuo de vagas nas maiores plataformas do Brasil (Gupy, LinkedIn, Indeed, Vagas, Trabalha Brasil, InfoJobs e Catho).
          </p>

          <div className="grid grid-cols-2 gap-2 text-left text-xs bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2">
              <Cpu size={14} className="text-indigo-400 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400">Motor Backend</div>
                <div className="font-semibold text-slate-200">Rust + Tauri v2</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
              <div>
                <div className="text-[10px] text-slate-400">Distribuição</div>
                <div className="font-semibold text-slate-200">Nativo Win32 (.exe)</div>
              </div>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-center gap-3">
            <button
              onClick={() => onOpenLink('https://github.com/mssmateusdev/vagafounder-app')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors cursor-pointer"
            >
              <ExternalLink size={13} />
              Repositório GitHub
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
