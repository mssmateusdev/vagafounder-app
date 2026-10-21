import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcutGroups = [
    {
      title: 'Navegação e Sistema',
      items: [
        { key: 'F5 ou Ctrl+R', desc: 'Sincronizar e varrer vagas agora' },
        { key: 'F1', desc: 'Abrir este guia de atalhos' },
        { key: 'Ctrl + K ou /', desc: 'Focar na barra de busca' },
        { key: 'Ctrl + B', desc: 'Recolher / Expandir barra lateral' },
        { key: 'Alt + T', desc: 'Alternar Tema Claro / Escuro' },
        { key: 'Esc', desc: 'Fechar modais, menus e detalhes' },
      ],
    },
    {
      title: 'Ações na Lista de Vagas',
      items: [
        { key: '↓ e ↑', desc: 'Navegar para a vaga seguinte / anterior' },
        { key: 'Espaço', desc: 'Abrir janela de detalhes da vaga selecionada' },
        { key: 'Enter', desc: 'Abrir link de candidatura no navegador padrão' },
        { key: 'F', desc: 'Adicionar / remover dos Favoritos' },
        { key: 'Botão Direito', desc: 'Menu de contexto desktop com ações rápidas' },
      ],
    },
    {
      title: 'Modos de Visualização',
      items: [
        { key: 'Alt + 1', desc: 'Visualização em Modo Tabela Compacta' },
        { key: 'Alt + 2', desc: 'Visualização em Modo Cards' },
        { key: 'Alt + 3', desc: 'Visualização em Modo Dividido (Split-View)' },
      ],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="w-full max-w-xl bg-slate-900 text-slate-100 rounded-xl border border-slate-700 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Keyboard size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Atalhos de Teclado Desktop</h3>
              <p className="text-[11px] text-slate-400">Produtividade instantânea sem tirar as mãos do teclado</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-5 text-xs">
          {shortcutGroups.map((group, idx) => (
            <div key={idx} className="space-y-2">
              <h4 className="text-[11px] font-bold text-indigo-400 uppercase tracking-wider px-1">
                {group.title}
              </h4>
              <div className="bg-slate-950/50 rounded-lg border border-slate-800 divide-y divide-slate-800/80">
                {group.items.map((item, itemIdx) => (
                  <div key={itemIdx} className="flex items-center justify-between px-3.5 py-2">
                    <span className="text-slate-300">{item.desc}</span>
                    <kbd className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 text-[11px] font-mono shadow-xs">
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-400">
          <span>Pressione <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 font-mono">Esc</kbd> para sair</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
