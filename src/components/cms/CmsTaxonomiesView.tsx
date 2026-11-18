import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CmsDocument, CmsTaxonomy, CmsTerm } from '../../types/cms';
import { wouldTermCreateCycle } from '../../services/cms/cmsValidation';
import { Plus, Trash2, Edit2, FolderTree, AlertCircle, X, Check } from 'lucide-react';

interface CmsTaxonomiesViewProps {
  cms: CmsDocument;
  onUpdateCms: (nextCms: CmsDocument) => void;
  showToast: (msg: string) => void;
}

export const CmsTaxonomiesView: React.FC<CmsTaxonomiesViewProps> = ({
  cms,
  onUpdateCms,
  showToast,
}) => {
  const { t } = useTranslation();
  const [selectedTaxId, setSelectedTaxId] = useState<string>(cms.taxonomies[0]?.id || 'category');
  const [editingTerm, setEditingTerm] = useState<CmsTerm | null>(null);
  const [isTermModalOpen, setIsTermModalOpen] = useState(false);
  const [termName, setTermName] = useState('');
  const [termSlug, setTermSlug] = useState('');
  const [termParentId, setTermParentId] = useState<string | null>(null);
  const [safeDeleteTermId, setSafeDeleteTermId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<'detach' | 'replace'>('detach');
  const [replaceTargetTermId, setReplaceTargetTermId] = useState<string>('');

  const currentTax = cms.taxonomies.find((t) => t.id === selectedTaxId) || cms.taxonomies[0];
  const terms = (cms.terms || []).filter((t) => t.taxonomyId === selectedTaxId);

  const handleOpenCreateTerm = () => {
    setEditingTerm(null);
    setTermName('');
    setTermSlug('');
    setTermParentId(null);
    setIsTermModalOpen(true);
  };

  const handleOpenEditTerm = (term: CmsTerm) => {
    setEditingTerm(term);
    setTermName(term.name);
    setTermSlug(term.slug);
    setTermParentId(term.parentTermId || null);
    setIsTermModalOpen(true);
  };

  const handleSaveTerm = () => {
    if (!termName.trim()) {
      showToast(t('cms.taxonomies.nameRequired'));
      return;
    }
    const slug = (termSlug || termName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (termParentId && editingTerm) {
      if (wouldTermCreateCycle(editingTerm.termId, termParentId, cms.terms)) {
        showToast(t('cms.taxonomies.cycleError'));
        return;
      }
    }

    const nowIso = new Date().toISOString();
    let nextTerms = [...cms.terms];
    if (editingTerm) {
      nextTerms = nextTerms.map((tItem) =>
        tItem.termId === editingTerm.termId
          ? { ...tItem, name: termName.trim(), slug, parentTermId: termParentId, updatedAt: nowIso }
          : tItem
      );
    } else {
      const newTerm: CmsTerm = {
        termId: 'term_' + Math.random().toString(36).substring(2, 8),
        taxonomyId: selectedTaxId,
        name: termName.trim(),
        slug,
        parentTermId: termParentId,
        sortOrder: terms.length + 1,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      nextTerms.push(newTerm);
    }

    onUpdateCms({ ...cms, terms: nextTerms });
    setIsTermModalOpen(false);
    showToast(editingTerm ? t('cms.taxonomies.updatedToast') : t('cms.taxonomies.createdToast'));
  };

  const handleConfirmDeleteTerm = () => {
    if (!safeDeleteTermId) return;
    const termToDelete = safeDeleteTermId;
    const nextTerms = cms.terms.filter((tItem) => tItem.termId !== termToDelete);

    // Update record term associations
    const nextRecords = cms.records.map((rec) => {
      const taxTerms = rec.termIdsByTaxonomy[currentTax.id] || [];
      if (!taxTerms.includes(termToDelete)) return rec;

      let updatedTaxTerms = taxTerms.filter((id) => id !== termToDelete);
      if (deleteMode === 'replace' && replaceTargetTermId) {
        if (!updatedTaxTerms.includes(replaceTargetTermId)) {
          updatedTaxTerms.push(replaceTargetTermId);
        }
      }
      return {
        ...rec,
        termIdsByTaxonomy: {
          ...rec.termIdsByTaxonomy,
          [currentTax.id]: updatedTaxTerms,
        },
      };
    });

    onUpdateCms({ ...cms, terms: nextTerms, records: nextRecords });
    setSafeDeleteTermId(null);
    showToast(t('cms.taxonomies.deletedToast'));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">{t('cms.taxonomies.heading')}</h3>
          <p className="text-xs text-slate-500">
            {t('cms.taxonomies.subheading')}
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenCreateTerm}
          className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{t('cms.taxonomies.addTermTo', { label: currentTax?.label })}</span>
        </button>
      </div>

      {/* Taxonomy Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
        {cms.taxonomies.map((tax) => (
          <button
            key={tax.id}
            type="button"
            onClick={() => setSelectedTaxId(tax.id)}
            className={`min-h-[38px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              selectedTaxId === tax.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>{tax.label}</span>
            <span className="text-[10px] font-mono opacity-85">
              ({(cms.terms || []).filter((tItem) => tItem.taxonomyId === tax.id).length})
            </span>
          </button>
        ))}
      </div>

      {/* Terms Table / Tree */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-700">
          <span>{t('cms.taxonomies.colTermNameSlug')}</span>
          <span>{t('cms.taxonomies.colActions')}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {terms.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              {t('cms.taxonomies.emptyTerms', { label: currentTax?.label })}
            </div>
          ) : (
            terms.map((term) => {
              const parentTerm = cms.terms.find((tItem) => tItem.termId === term.parentTermId);
              const assignedCount = cms.records.filter((r) =>
                (r.termIdsByTaxonomy[currentTax.id] || []).includes(term.termId)
              ).length;

              return (
                <div key={term.termId} className="px-4 py-3 flex items-center justify-between gap-4 hover:bg-slate-50/60">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{term.name}</span>
                      {parentTerm && (
                        <span className="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-medium">
                          ↳ {parentTerm.name}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 font-mono">
                      <span>slug: {term.slug}</span>
                      <span>·</span>
                      <span className="tabular-nums">{t('cms.taxonomies.assignedRecords', { count: assignedCount })}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOpenEditTerm(term)}
                      className="p-1.5 hover:bg-slate-200/70 rounded text-slate-600"
                      title={t('cms.taxonomies.editTerm')}
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSafeDeleteTermId(term.termId)}
                      className="p-1.5 hover:bg-red-50 rounded text-red-600"
                      title={t('cms.taxonomies.deleteTerm')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Term Modal */}
      {isTermModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">
                {editingTerm ? t('cms.taxonomies.editTerm') : t('cms.taxonomies.newTermTitle', { label: currentTax?.label })}
              </h4>
              <button onClick={() => setIsTermModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('cms.taxonomies.termNameLabel')}</label>
                <input
                  type="text"
                  value={termName}
                  onChange={(e) => setTermName(e.target.value)}
                  placeholder={t('cms.taxonomies.termNamePlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('cms.recordEditor.slugLabel').replace(' *', '')}</label>
                <input
                  type="text"
                  value={termSlug}
                  onChange={(e) => setTermSlug(e.target.value)}
                  placeholder={t('cms.taxonomies.slugPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              {currentTax?.hierarchical && (
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">{t('cms.taxonomies.parentTermLabel')}</label>
                  <select
                    value={termParentId || ''}
                    onChange={(e) => setTermParentId(e.target.value || null)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
                  >
                    <option value="">{t('cms.taxonomies.noneTopLevel')}</option>
                    {terms
                      .filter((tItem) => !editingTerm || tItem.termId !== editingTerm.termId)
                      .map((tItem) => (
                        <option key={tItem.termId} value={tItem.termId}>
                          {tItem.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsTermModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveTerm}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
              >
                {t('cms.taxonomies.saveTerm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Delete Modal */}
      {safeDeleteTermId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">{t('cms.taxonomies.safeDeleteTitle')}</h4>
                <p className="text-xs text-slate-500">
                  {t('cms.taxonomies.safeDeleteSubtitle')}
                </p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                <input
                  type="radio"
                  name="delMode"
                  checked={deleteMode === 'detach'}
                  onChange={() => setDeleteMode('detach')}
                  className="mt-0.5"
                />
                <div>
                  <span className="font-semibold text-slate-900 block">{t('cms.taxonomies.detachTitle')}</span>
                  <span className="text-slate-500">{t('cms.taxonomies.detachDesc')}</span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                <input
                  type="radio"
                  name="delMode"
                  checked={deleteMode === 'replace'}
                  onChange={() => setDeleteMode('replace')}
                  className="mt-0.5"
                />
                <div>
                  <span className="font-semibold text-slate-900 block">{t('cms.taxonomies.replaceTitle')}</span>
                  <span className="text-slate-500">{t('cms.taxonomies.replaceDesc')}</span>
                </div>
              </label>

              {deleteMode === 'replace' && (
                <div className="pl-6">
                  <select
                    value={replaceTargetTermId}
                    onChange={(e) => setReplaceTargetTermId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
                  >
                    <option value="">{t('cms.taxonomies.selectReplacement')}</option>
                    {terms
                      .filter((tItem) => tItem.termId !== safeDeleteTermId)
                      .map((tItem) => (
                        <option key={tItem.termId} value={tItem.termId}>
                          {tItem.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSafeDeleteTermId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTerm}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold"
              >
                {t('cms.taxonomies.confirmDelete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
