import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';

interface WorkspaceConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  isBusy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const WorkspaceConfirmModal: React.FC<WorkspaceConfirmModalProps> = ({
  isOpen,
  title,
  description,
  details = [],
  confirmLabel,
  cancelLabel,
  isDanger = false,
  isBusy = false,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const resolvedConfirm = confirmLabel || t('common.confirm');
  const resolvedCancel = cancelLabel || t('common.cancel');

  return (
    <div className="fixed inset-0 z-[70] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle
              className={`w-4 h-4 shrink-0 ${
                isDanger ? 'text-red-600' : 'text-amber-600'
              }`}
            />
            <h4 className="text-sm font-bold text-slate-900 truncate">{title}</h4>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            aria-label={t('common.close')}
            className="p-1 text-slate-400 hover:text-slate-700 rounded disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-700 leading-relaxed">{description}</p>

          {details.length > 0 && (
            <ul className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1 text-[11px] font-mono text-slate-700">
              {details.map((item, i) => (
                <li key={i} className="truncate">
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={isBusy}
            onClick={onCancel}
            className="min-h-[38px] px-3.5 py-1.5 rounded-md text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-40"
          >
            {resolvedCancel}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={onConfirm}
            className={`min-h-[38px] px-4 py-1.5 rounded-md text-xs font-semibold text-white disabled:opacity-50 ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            {isBusy ? t('common.processing') : resolvedConfirm}
          </button>
        </div>
      </div>
    </div>
  );
};
