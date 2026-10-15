import React, { useState } from 'react';
import { 
  Building2, 
  MapPin, 
  ExternalLink, 
  Trash2, 
  ChevronRight, 
  ChevronLeft, 
  Plus, 
  DollarSign, 
  Edit3, 
  X,
  Trophy
} from 'lucide-react';
import type { KanbanApplication, KanbanStage } from '../types';

interface KanbanBoardProps {
  applications?: KanbanApplication[];
  apps?: KanbanApplication[];
  onUpdateApplication?: (app: KanbanApplication) => void;
  onUpdateApp?: (app: KanbanApplication) => void;
  onDeleteApplication?: (id: string) => void;
  onDeleteApp?: (id: string) => void;
  onAddApplication?: (app: Omit<KanbanApplication, 'id' | 'appliedAt' | 'updatedAt'>) => void;
  onAddApp?: (app: Omit<KanbanApplication, 'id' | 'appliedAt' | 'updatedAt'>) => void;
  onOpenLink: (url: string) => void;
  isDark?: boolean;
}

const STAGES: { id: KanbanStage; title: string; desc: string; color: string; bg: string; border: string; darkBg: string }[] = [
  { 
    id: 'wishlist', 
    title: 'Interesse', 
    desc: 'Vagas que pretendo me candidatar', 
    color: 'text-blue-700 dark:text-blue-400', 
    bg: 'bg-blue-50/80', 
    border: 'border-blue-200 dark:border-[#383a40]',
    darkBg: 'dark:bg-[#2b2d31]/80'
  },
  { 
    id: 'applied', 
    title: 'Inscrito', 
    desc: 'Currículo já enviado', 
    color: 'text-indigo-700 dark:text-indigo-400', 
    bg: 'bg-indigo-50/80', 
    border: 'border-indigo-200 dark:border-[#383a40]',
    darkBg: 'dark:bg-[#2b2d31]/80'
  },
  { 
    id: 'interview', 
    title: 'Entrevista / Teste', 
    desc: 'Em contato ou processo seletivo', 
    color: 'text-amber-700 dark:text-amber-400', 
    bg: 'bg-amber-50/80', 
    border: 'border-amber-200 dark:border-[#383a40]',
    darkBg: 'dark:bg-[#2b2d31]/80'
  },
  { 
    id: 'waiting', 
    title: 'Aguardando Retorno', 
    desc: 'Feedback da empresa', 
    color: 'text-purple-700 dark:text-purple-400', 
    bg: 'bg-purple-50/80', 
    border: 'border-purple-200 dark:border-[#383a40]',
    darkBg: 'dark:bg-[#2b2d31]/80'
  },
  { 
    id: 'offer', 
    title: 'Aprovado / Proposta', 
    desc: 'Ofertas e conquistas', 
    color: 'text-emerald-700 dark:text-emerald-400', 
    bg: 'bg-emerald-50/80', 
    border: 'border-emerald-200 dark:border-[#383a40]',
    darkBg: 'dark:bg-[#2b2d31]/80'
  },
];

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  applications: rawApplications,
  apps,
  onUpdateApplication: rawOnUpdate,
  onUpdateApp,
  onDeleteApplication: rawOnDelete,
  onDeleteApp,
  onAddApplication: rawOnAdd,
  onAddApp,
  onOpenLink,
}) => {
  const applications = rawApplications || apps || [];
  const onUpdateApplication = rawOnUpdate || onUpdateApp || (() => {});
  const onDeleteApplication = rawOnDelete || onDeleteApp || (() => {});
  const onAddApplication = rawOnAdd || onAddApp || (() => {});

  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNotes, setTempNotes] = useState<string>('');
  const [isAddingCustom, setIsAddingCustom] = useState<boolean>(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customCompany, setCustomCompany] = useState('');
  const [customLocation, setCustomLocation] = useState('Recife / Remoto');
  const [customSalary, setCustomSalary] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customStage, setCustomStage] = useState<KanbanStage>('wishlist');

  const stageOrder: KanbanStage[] = ['wishlist', 'applied', 'interview', 'waiting', 'offer'];

  const moveStage = (app: KanbanApplication, direction: 'prev' | 'next') => {
    const currentIndex = stageOrder.indexOf(app.stage);
    const nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex >= 0 && nextIndex < stageOrder.length) {
      onUpdateApplication({
        ...app,
        stage: stageOrder[nextIndex],
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleSaveNotes = (app: KanbanApplication) => {
    onUpdateApplication({
      ...app,
      notes: tempNotes,
      updatedAt: new Date().toISOString(),
    });
    setEditingNotesId(null);
  };

  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() || !customCompany.trim()) return;
    onAddApplication({
      jobId: `custom-${Date.now()}`,
      title: customTitle.trim(),
      company: customCompany.trim(),
      location: customLocation.trim() || 'Recife',
      salary: customSalary.trim() || undefined,
      url: customUrl.trim(),
      source: 'manual',
      stage: customStage,
      notes: 'Candidatura adicionada manualmente',
    });
    setCustomTitle('');
    setCustomCompany('');
    setCustomSalary('');
    setCustomUrl('');
    setIsAddingCustom(false);
  };

  return (
    <div className="space-y-6">
      {/* Header do Funil */}
      <div className="flex items-center justify-between flex-wrap gap-4 bg-white dark:bg-[#2b2d31] p-5 rounded-2xl border border-slate-200 dark:border-[#383a40] shadow-sm">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Trophy size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-[#f2f3f5]">
                Funil de Candidaturas
              </h2>
              <p className="text-xs text-slate-500 dark:text-[#949ba4]">
                Acompanhe o status e a evolução de cada oportunidade de emprego
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold px-3 py-1.5 bg-slate-100 dark:bg-[#1e1f22] text-slate-700 dark:text-[#dbdee1] rounded-xl border border-slate-200 dark:border-[#383a40]">
            {applications.length} vaga{applications.length !== 1 ? 's' : ''} no funil
          </span>

          <button
            onClick={() => setIsAddingCustom(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>Adicionar Vaga Externa</span>
          </button>
        </div>
      </div>

      {/* Modal / Form para Adicionar Vaga Manual */}
      {isAddingCustom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-white dark:bg-[#2b2d31] w-full max-w-md rounded-2xl border border-slate-200 dark:border-[#383a40] p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm text-slate-900 dark:text-[#f2f3f5]">Adicionar Candidatura Manual</h3>
              <button 
                onClick={() => setIsAddingCustom(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-[#f2f3f5] cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateCustom} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-[#dbdee1] block mb-1">Título do Cargo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Auxiliar Administrativo, Estágio em TI..."
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#1e1f22] border border-slate-200 dark:border-[#383a40] rounded-xl outline-none focus:border-indigo-500 text-slate-900 dark:text-[#f2f3f5]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-[#dbdee1] block mb-1">Nome da Empresa *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Empresa ABC Ltda"
                  value={customCompany}
                  onChange={(e) => setCustomCompany(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#1e1f22] border border-slate-200 dark:border-[#383a40] rounded-xl outline-none focus:border-indigo-500 text-slate-900 dark:text-[#f2f3f5]"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-[#dbdee1] block mb-1">Local / Modalidade</label>
                <input
                  type="text"
                  placeholder="Ex: Recife, PE (Híbrido) ou Remoto"
                  value={customLocation}
                  onChange={(e) => setCustomLocation(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#1e1f22] border border-slate-200 dark:border-[#383a40] rounded-xl outline-none focus:border-indigo-500 text-slate-900 dark:text-[#f2f3f5]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-[#dbdee1] block mb-1">Salário Previsto</label>
                  <input
                    type="text"
                    placeholder="Ex: R$ 1.800,00"
                    value={customSalary}
                    onChange={(e) => setCustomSalary(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#1e1f22] border border-slate-200 dark:border-[#383a40] rounded-xl outline-none focus:border-indigo-500 text-slate-900 dark:text-[#f2f3f5]"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-[#dbdee1] block mb-1">Etapa Inicial</label>
                  <select
                    value={customStage}
                    onChange={(e) => setCustomStage(e.target.value as KanbanStage)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#1e1f22] border border-slate-200 dark:border-[#383a40] rounded-xl outline-none focus:border-indigo-500 text-slate-900 dark:text-[#f2f3f5] cursor-pointer"
                  >
                    <option value="wishlist">Interesse</option>
                    <option value="applied">Inscrito</option>
                    <option value="interview">Entrevista</option>
                    <option value="waiting">Aguardando</option>
                    <option value="offer">Proposta</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-[#dbdee1] block mb-1">Link de Inscrição / Vaga</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-[#1e1f22] border border-slate-200 dark:border-[#383a40] rounded-xl outline-none focus:border-indigo-500 text-slate-900 dark:text-[#f2f3f5]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-[#383a40] text-xs font-medium text-slate-600 dark:text-[#949ba4] hover:bg-slate-50 dark:hover:bg-[#35373c] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-xs font-bold text-white shadow-xs cursor-pointer"
                >
                  Salvar Candidatura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grid de Colunas Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 items-start">
        {STAGES.map((col) => {
          const colApps = applications.filter((a) => a.stage === col.id);
          const colIndex = stageOrder.indexOf(col.id);

          return (
            <div
              key={col.id}
              className={`rounded-2xl border ${col.border} ${col.bg} ${col.darkBg} p-3.5 flex flex-col gap-3 min-h-[480px] shadow-2xs`}
            >
              {/* Cabeçalho da Coluna */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-[#383a40]">
                <div className="min-w-0">
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${col.color} truncate`}>
                    {col.title}
                  </h3>
                  <p className="text-[10px] text-slate-500 dark:text-[#949ba4] truncate">{col.desc}</p>
                </div>
                <span className="w-5 h-5 rounded-full bg-white dark:bg-[#1e1f22] text-[11px] font-bold text-slate-700 dark:text-[#dbdee1] border border-slate-200 dark:border-[#383a40] flex items-center justify-center shrink-0">
                  {colApps.length}
                </span>
              </div>

              {/* Lista de Cards da Coluna */}
              <div className="space-y-3 flex-1 overflow-y-auto max-h-[650px] pr-0.5">
                {colApps.length === 0 ? (
                  <div className="py-8 text-center border-2 border-dashed border-slate-200 dark:border-[#383a40] rounded-xl">
                    <p className="text-[11px] text-slate-400 dark:text-[#949ba4] italic">
                      Nenhuma vaga nesta etapa
                    </p>
                  </div>
                ) : (
                  colApps.map((app) => (
                    <div
                      key={app.id}
                      className="bg-white dark:bg-[#313338] rounded-xl border border-slate-200/90 dark:border-[#3f4147] p-3.5 shadow-xs hover:shadow-md hover:dark:bg-[#35373c]/80 transition-all space-y-2.5 group"
                    >
                      {/* Título & Link */}
                      <div className="flex items-start justify-between gap-1.5">
                        <h4 
                          className="font-bold text-xs text-slate-900 dark:text-[#f2f3f5] line-clamp-2 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
                          onClick={() => app.url && onOpenLink(app.url)}
                          title="Abrir vaga"
                        >
                          {app.title}
                        </h4>

                        {app.url && (
                          <button
                            onClick={() => onOpenLink(app.url)}
                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-0.5 cursor-pointer shrink-0"
                            title="Abrir página oficial"
                          >
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </div>

                      {/* Empresa e Local */}
                      <div className="space-y-1 text-[11px] text-slate-500 dark:text-[#949ba4]">
                        <div className="flex items-center gap-1.5 truncate">
                          <Building2 size={12} className="shrink-0 text-slate-400" />
                          <span className="truncate font-medium text-slate-700 dark:text-[#dbdee1]">{app.company}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin size={12} className="shrink-0 text-indigo-500" />
                          <span className="truncate">{app.location}</span>
                        </div>
                      </div>

                      {/* Salário & Benefícios */}
                      {app.salary && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          <DollarSign size={10} className="stroke-[2.5]" />
                          <span>{app.salary}</span>
                        </div>
                      )}

                      {/* Anotações */}
                      <div className="pt-1 border-t border-slate-100 dark:border-[#383a40]">
                        {editingNotesId === app.id ? (
                          <div className="space-y-1.5">
                            <textarea
                              value={tempNotes}
                              onChange={(e) => setTempNotes(e.target.value)}
                              placeholder="Adicionar anotação (ex: entrevista dia 18, falar com recrutador)..."
                              rows={2}
                              className="w-full text-[11px] p-2 bg-slate-50 dark:bg-[#1e1f22] border border-slate-200 dark:border-[#383a40] rounded-lg outline-none focus:border-indigo-500 text-slate-900 dark:text-[#f2f3f5]"
                            />
                            <div className="flex justify-end gap-1">
                              <button
                                onClick={() => setEditingNotesId(null)}
                                className="px-2 py-0.5 text-[10px] rounded border border-slate-200 dark:border-[#383a40] text-slate-600 dark:text-[#949ba4]"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleSaveNotes(app)}
                                className="px-2 py-0.5 text-[10px] rounded bg-indigo-600 text-white font-bold"
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div 
                            onClick={() => {
                              setEditingNotesId(app.id);
                              setTempNotes(app.notes || '');
                            }}
                            className="group/notes flex items-center justify-between text-[11px] text-slate-400 dark:text-[#949ba4] hover:text-slate-600 dark:hover:text-[#dbdee1] cursor-pointer py-0.5"
                            title="Clique para editar anotações desta vaga"
                          >
                            <span className="truncate italic">
                              {app.notes ? app.notes : 'Adicionar notas...'}
                            </span>
                            <Edit3 size={11} className="opacity-0 group-hover/notes:opacity-100 transition-opacity ml-1 shrink-0" />
                          </div>
                        )}
                      </div>

                      {/* Ações: Mover Etapa e Excluir */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-[#383a40]">
                        <div className="flex items-center gap-1">
                          <button
                            disabled={colIndex === 0}
                            onClick={() => moveStage(app, 'prev')}
                            title="Mover para etapa anterior"
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer"
                          >
                            <ChevronLeft size={13} />
                          </button>
                          <button
                            disabled={colIndex === stageOrder.length - 1}
                            onClick={() => moveStage(app, 'next')}
                            title="Avançar para próxima etapa"
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer"
                          >
                            <ChevronRight size={13} />
                          </button>
                        </div>

                        <button
                          onClick={() => onDeleteApplication(app.id)}
                          title="Remover do funil"
                          className="p-1 text-slate-300 hover:text-rose-600 dark:text-slate-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
