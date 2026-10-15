import React, { useEffect, useState } from 'react';
import { 
  X, 
  Building2, 
  MapPin, 
  Clock, 
  ExternalLink, 
  Bookmark, 
  CheckCircle2, 
  Loader2, 
  AlertCircle,
  FileText,
  Sparkles,
  DollarSign,
  Trophy,
  Gift
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { invoke } from '@tauri-apps/api/core';
import type { Job } from '../types';

interface JobDetailsModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
  isFavorite: boolean;
  isApplied: boolean;
  onToggleFavorite: (jobId: string) => void;
  onToggleApplied: (jobId: string) => void;
  onOpenLink: (url: string) => void;
  formatLocation: (location: string, modality?: string) => string;
  onSendToKanban?: (job: Job) => void;
}

export const JobDetailsModal: React.FC<JobDetailsModalProps> = ({
  job,
  isOpen,
  onClose,
  isFavorite,
  isApplied,
  onToggleFavorite,
  onToggleApplied,
  onOpenLink,
  formatLocation,
  onSendToKanban,
}) => {
  const [description, setDescription] = useState<string | null>(job?.description || null);
  const [isLoadingDesc, setIsLoadingDesc] = useState<boolean>(false);
  const [descError, setDescError] = useState<string | null>(null);

  // Fechar com a tecla ESC
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Travar o scroll da página enquanto o modal estiver aberto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Carregar descrição sob demanda ou do cache
  useEffect(() => {
    if (!job || !isOpen) {
      setDescription(null);
      setIsLoadingDesc(false);
      setDescError(null);
      return;
    }

    if (job.description && job.description.trim().length > 0) {
      setDescription(job.description);
      setIsLoadingDesc(false);
      setDescError(null);
      return;
    }

    // Se a vaga não tiver descrição no lote inicial (LinkedIn ou Indeed), busca no Rust
    let isCancelled = false;
    async function fetchDesc() {
      if (!job) return;
      setIsLoadingDesc(true);
      setDescError(null);
      try {
        const fetched = await invoke<string>('get_job_description', {
          id: job.id,
          url: job.url,
          source: job.source,
        });
        if (!isCancelled && fetched) {
          setDescription(fetched);
        }
      } catch (err: any) {
        if (!isCancelled) {
          setDescError(err?.toString() || 'Descrição completa indisponível no momento.');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingDesc(false);
        }
      }
    }

    fetchDesc();

    return () => {
      isCancelled = true;
    };
  }, [job?.id, isOpen]);

  if (!isOpen || !job) return null;

  // Badge da fonte
  const renderSourceBadge = (source: string) => {
    const s = (source || '').toLowerCase();
    if (s.includes('gupy')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
          Gupy
        </span>
      );
    }
    if (s.includes('linkedin')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#0A66C2]/10 dark:bg-[#0A66C2]/20 text-[#0A66C2] dark:text-[#388be8] border border-[#0A66C2]/20 dark:border-[#0A66C2]/40">
          <span className="w-1.5 h-1.5 rounded-full bg-[#0A66C2]"></span>
          LinkedIn
        </span>
      );
    }
    if (s.includes('indeed')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-[#003A9B]/10 dark:bg-[#003A9B]/25 text-[#003A9B] dark:text-[#528de8] border border-[#003A9B]/25 dark:border-[#003A9B]/40">
          <span className="w-1.5 h-1.5 rounded-full bg-[#003A9B]"></span>
          Indeed
        </span>
      );
    }
    if (s.includes('vagas')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600"></span>
          Vagas.com
        </span>
      );
    }
    if (s.includes('trabalha')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
          Trabalha Brasil
        </span>
      );
    }
    if (s.includes('infojobs')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-600"></span>
          InfoJobs
        </span>
      );
    }
    if (s.includes('catho')) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
          <span className="w-1.5 h-1.5 rounded-full bg-sky-600"></span>
          Catho
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-bold bg-slate-100 dark:bg-[#1e1f22] text-slate-700 dark:text-[#dbdee1] border border-slate-200 dark:border-[#383a40]">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
        {source}
      </span>
    );
  };

  // Verifica se o texto possui tags HTML
  const hasHtml = Boolean(description && /<[a-z][\s\S]*>/i.test(description));

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-5 transition-all animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div 
        className="max-w-2xl w-full max-h-[90vh] bg-white dark:bg-[#2b2d31] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-[#383a40] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-modal-title"
      >
        {/* ---------------- CABEÇALHO DO MODAL ---------------- */}
        <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-[#383a40] flex items-start justify-between gap-4 shrink-0 bg-gradient-to-b from-slate-50/80 to-white dark:from-[#2b2d31] dark:to-[#2b2d31]">
          <div className="space-y-2.5 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {renderSourceBadge(job.source)}
              <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${
                job.type.includes('Aprendiz')
                  ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                  : job.type.includes('RH')
                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                  : job.type.includes('Suporte')
                  ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800'
                  : job.type.includes('Estágio')
                  ? 'bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800'
                  : job.type.includes('Auxiliar')
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                  : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
              }`}>
                {job.type}
              </span>
              {isApplied && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded">
                  <CheckCircle2 size={12} className="stroke-[2.5]" />
                  Já me candidatei
                </span>
              )}
            </div>

            {/* Título completo da vaga sem truncamento */}
            <h2 id="job-modal-title" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-[#f2f3f5] leading-snug">
              {job.title}
            </h2>

            {/* Metadados: Empresa, Localidade e Data */}
            <div className="flex items-center gap-y-1.5 gap-x-4 flex-wrap text-xs text-slate-600 dark:text-[#dbdee1] font-medium">
              <div className="flex items-center gap-1.5 text-slate-900 dark:text-[#f2f3f5] font-semibold">
                <Building2 size={14} className="text-slate-400 shrink-0" />
                <span>{job.company}</span>
              </div>

              <div className="flex items-center gap-1 text-slate-600 dark:text-[#dbdee1]">
                <MapPin size={13} className="text-indigo-500 shrink-0" />
                <span>{formatLocation(job.location, job.modality)}</span>
              </div>

              <div className="flex items-center gap-1 text-slate-500 dark:text-[#949ba4]">
                <Clock size={13} className="text-slate-400 shrink-0" />
                <span>
                  {formatDistanceToNow(new Date(job.publishedAt), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            </div>

            {/* Destaque de Salário e Benefícios Extraídos */}
            {(job.salary || (job.benefits && job.benefits.length > 0)) && (
              <div className="flex items-center gap-2 flex-wrap pt-1">
                {job.salary && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 px-2.5 py-0.5 rounded-lg">
                    <DollarSign size={12} className="stroke-[2.5]" />
                    {job.salary}
                  </span>
                )}
                {job.benefits && job.benefits.map((b, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-[#dbdee1] bg-slate-100 dark:bg-[#1e1f22] border border-slate-200 dark:border-[#383a40] px-2 py-0.5 rounded-md">
                    <Gift size={11} className="text-indigo-500" />
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-[#f2f3f5] hover:bg-slate-100 dark:hover:bg-[#35373c] p-2 rounded-xl transition-colors cursor-pointer shrink-0"
            title="Fechar (ESC)"
            aria-label="Fechar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* ---------------- CORPO SCROLLÁVEL DO MODAL ---------------- */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 dark:text-[#f2f3f5] flex items-center gap-2">
              <FileText size={16} className="text-indigo-500" />
              <span>Sobre a Vaga / Descrição</span>
            </h3>
            {job.source && (
              <span className="text-[11px] text-slate-400 dark:text-[#949ba4] font-medium flex items-center gap-1">
                <Sparkles size={12} className="text-amber-500" />
                Coletado via {job.source.toUpperCase()}
              </span>
            )}
          </div>

          {/* Estado de Carregamento da Descrição */}
          {isLoadingDesc && (
            <div className="py-12 flex flex-col items-center justify-center space-y-3 bg-slate-50/60 dark:bg-[#1e1f22]/60 rounded-xl border border-slate-100 dark:border-[#383a40]">
              <Loader2 size={28} className="animate-spin text-indigo-500" />
              <p className="text-xs font-semibold text-slate-600 dark:text-[#dbdee1]">
                Carregando descrição completa diretamente da plataforma...
              </p>
              <div className="w-48 h-1.5 bg-slate-200 dark:bg-[#383a40] rounded-full overflow-hidden">
                <div className="w-1/2 h-full bg-indigo-500 rounded-full animate-pulse"></div>
              </div>
            </div>
          )}

          {/* Erro ou Descrição Não Disponível */}
          {!isLoadingDesc && descError && (
            <div className="bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 rounded-xl p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
                <AlertCircle size={15} />
                <span>Aviso sobre os detalhes</span>
              </div>
              <p className="text-amber-700 dark:text-amber-300/90 leading-relaxed">
                {descError}
              </p>
              <div className="pt-1">
                <button
                  onClick={() => onOpenLink(job.url)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 underline cursor-pointer"
                >
                  Abrir link oficial da vaga no navegador para ver o anúncio original completo
                  <ExternalLink size={12} />
                </button>
              </div>
            </div>
          )}

          {/* Conteúdo da Descrição Formatado */}
          {!isLoadingDesc && description && (
            <div className="bg-slate-50/50 dark:bg-[#1e1f22] rounded-xl p-4 sm:p-5 border border-slate-200/80 dark:border-[#383a40]">
              {hasHtml ? (
                <div 
                  className="text-xs sm:text-sm text-slate-700 dark:text-[#dbdee1] leading-relaxed space-y-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5 [&>p]:mb-2 [&>strong]:font-bold [&>b]:font-bold"
                  dangerouslySetInnerHTML={{ __html: description }}
                />
              ) : (
                <div className="whitespace-pre-line text-xs sm:text-sm text-slate-700 dark:text-[#dbdee1] leading-relaxed font-normal">
                  {description}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ---------------- RODAPÉ DO MODAL ---------------- */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 dark:bg-[#232428] border-t border-slate-200/80 dark:border-[#383a40] flex items-center justify-between flex-wrap gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-[#383a40] bg-white dark:bg-[#2b2d31] text-slate-700 dark:text-[#dbdee1] hover:bg-slate-100 dark:hover:bg-[#35373c] text-xs font-semibold transition-all cursor-pointer"
            >
              Fechar
            </button>

            <button
              onClick={() => onToggleFavorite(job.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isFavorite 
                  ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-800 text-amber-600 dark:text-amber-400' 
                  : 'bg-white dark:bg-[#2b2d31] border-slate-200 dark:border-[#383a40] text-slate-600 dark:text-[#dbdee1] hover:text-amber-600 hover:bg-amber-50/50'
              }`}
              title={isFavorite ? "Remover dos favoritos" : "Salvar vaga"}
            >
              <Bookmark size={14} className={isFavorite ? 'fill-amber-500' : ''} />
              <span>{isFavorite ? 'Salva' : 'Favoritar'}</span>
            </button>

            <button
              onClick={() => onToggleApplied(job.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                isApplied 
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold' 
                  : 'bg-white dark:bg-[#2b2d31] border-slate-200 dark:border-[#383a40] text-slate-600 dark:text-[#dbdee1] hover:text-emerald-700 hover:bg-emerald-50/50'
              }`}
              title={isApplied ? "Remover candidatura" : "Marcar como já me candidatei"}
            >
              <CheckCircle2 size={14} className={isApplied ? 'fill-emerald-100 text-emerald-600' : ''} />
              <span>{isApplied ? 'Candidatado' : 'Já me candidatei'}</span>
            </button>

            {onSendToKanban && (
              <button
                onClick={() => onSendToKanban(job)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-all cursor-pointer"
                title="Adicionar esta vaga ao seu Funil de Candidaturas (Kanban)"
              >
                <Trophy size={14} className="text-amber-500" />
                <span>Adicionar ao Funil</span>
              </button>
            )}
          </div>

          <button
            onClick={() => onOpenLink(job.url)}
            className="group/btn relative inline-flex items-center justify-center gap-2 py-2 px-5 bg-gradient-to-r from-emerald-600 via-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all cursor-pointer border border-emerald-500/40"
            title="Abrir página oficial de inscrição no seu navegador"
          >
            <span>Candidatar-se na Plataforma Oficial</span>
            <ExternalLink size={15} className="stroke-[2.2] group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />
          </button>
        </div>
      </div>
    </div>
  );
};
