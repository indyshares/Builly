import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ElementNode, LibraryItemType } from '../../types/builder';
import { BookmarkPlus, X } from 'lucide-react';

interface SaveLibraryModalProps {
  isOpen: boolean;
  targetNode: ElementNode | null;
  defaultType?: LibraryItemType;
  onClose: () => void;
  onSave: (params: {
    type: LibraryItemType;
    name: string;
    description: string;
    category: string;
    supportsLinkedInstances: boolean;
  }) => void;
}

const TYPE_OPTIONS: { id: LibraryItemType; labelKey: string; hintKey: string }[] = [
  {
    id: 'component',
    labelKey: 'modals.saveLibrary.types.component',
    hintKey: 'modals.saveLibrary.hints.component',
  },
  {
    id: 'section-template',
    labelKey: 'modals.saveLibrary.types.sectionTemplate',
    hintKey: 'modals.saveLibrary.hints.sectionTemplate',
  },
  {
    id: 'header-template',
    labelKey: 'modals.saveLibrary.types.headerTemplate',
    hintKey: 'modals.saveLibrary.hints.headerTemplate',
  },
  {
    id: 'footer-template',
    labelKey: 'modals.saveLibrary.types.footerTemplate',
    hintKey: 'modals.saveLibrary.hints.footerTemplate',
  },
  {
    id: 'navigation-template',
    labelKey: 'modals.saveLibrary.types.navigationTemplate',
    hintKey: 'modals.saveLibrary.hints.navigationTemplate',
  },
];

export const SaveLibraryModal: React.FC<SaveLibraryModalProps> = ({
  isOpen,
  targetNode,
  defaultType = 'component',
  onClose,
  onSave,
}) => {
  const { t } = useTranslation();
  const [itemType, setItemType] = useState<LibraryItemType>(defaultType);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Custom');
  const [supportsLinked, setSupportsLinked] = useState(true);

  useEffect(() => {
    if (!isOpen || !targetNode) return;
    setItemType(defaultType);
    setName(targetNode.name || 'Custom Block');
    setDescription('');
    setCategory(
      defaultType === 'header-template'
        ? 'Headers'
        : defaultType === 'footer-template'
        ? 'Footers'
        : defaultType === 'navigation-template'
        ? 'Navigation'
        : 'Custom'
    );
    setSupportsLinked(defaultType === 'component');
  }, [isOpen, targetNode, defaultType]);

  if (!isOpen || !targetNode) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({
      type: itemType,
      name: name.trim(),
      description: description.trim(),
      category: category.trim() || 'Custom',
      supportsLinkedInstances: itemType === 'component' && supportsLinked,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-2xl max-w-md w-full border border-slate-200 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <BookmarkPlus className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">{t('modals.saveLibrary.title')}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1 text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
            {t('modals.saveLibrary.sourceLabel')}{' '}
            <strong className="text-slate-900">{targetNode.name}</strong>{' '}
            <span className="font-mono text-[11px] text-slate-500">({targetNode.type})</span>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              {t('modals.saveLibrary.itemTypeLabel')}
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setItemType(opt.id)}
                  className={`min-h-[38px] px-2.5 py-1.5 rounded-lg border text-left text-xs font-semibold transition-colors ${
                    itemType === opt.id
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {t(TYPE_OPTIONS.find((o) => o.id === itemType)?.hintKey || '')}
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('modals.saveLibrary.nameLabel')}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[38px] text-xs px-3 py-1.5 border border-slate-200 rounded-lg bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('modals.saveLibrary.categoryLabel')}
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t('modals.saveLibrary.categoryPlaceholder')}
                className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                {t('modals.saveLibrary.descriptionLabel')}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t('modals.saveLibrary.descriptionPlaceholder')}
                className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
              />
            </div>
          </div>

          {itemType === 'component' && (
            <label className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={supportsLinked}
                onChange={(e) => setSupportsLinked(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600"
              />
              <span>{t('modals.saveLibrary.allowLinked')}</span>
            </label>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="min-h-[38px] px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
          >
            {t('modals.saveLibrary.submitBtn')}
          </button>
        </div>
      </form>
    </div>
  );
};
