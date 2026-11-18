import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageDocument } from '../../types/builder';
import { AlertTriangle, Home, Trash2, X } from 'lucide-react';

export type DeleteChildMode = 'promote' | 'reparent' | 'delete';

interface PageDeleteConfirmModalProps {
  isOpen: boolean;
  page: PageDocument | null;
  allPages: PageDocument[];
  onClose: () => void;
  onConfirmDelete: (
    pageId: string,
    childMode: DeleteChildMode,
    targetParentId?: string | null
  ) => void;
  onSetHomePage?: (newHomePageId: string) => void;
}

export const PageDeleteConfirmModal: React.FC<PageDeleteConfirmModalProps> = ({
  isOpen,
  page,
  allPages,
  onClose,
  onConfirmDelete,
  onSetHomePage,
}) => {
  const { t } = useTranslation();
  const [childMode, setChildMode] = useState<DeleteChildMode>('promote');
  const [targetParentId, setTargetParentId] = useState<string>('');
  const [replacementHomeId, setReplacementHomeId] = useState<string>('');

  const childPages = useMemo(() => {
    if (!page) return [];
    return allPages.filter((p) => p.parentPageId === page.id);
  }, [allPages, page]);

  const otherPages = useMemo(() => {
    if (!page) return [];
    return allPages.filter((p) => p.id !== page.id);
  }, [allPages, page]);

  const validReparentTargets = useMemo(() => {
    if (!page) return [];
    const childIds = new Set(childPages.map((c) => c.id));
    return allPages.filter(
      (p) => p.id !== page.id && !childIds.has(p.id) && !p.parentPageId
    );
  }, [allPages, page, childPages]);

  if (!isOpen || !page) return null;

  const isHome = Boolean(page.isHome);
  const isPublished = (page.status || 'published') === 'published';
  const hasChildren = childPages.length > 0;

  return (
    <div className="fixed inset-0 z-[75] bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <h3 className="text-sm font-bold text-slate-900 truncate">
              {t('modals.pageDelete.title', { name: page.name })}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('modals.pageDelete.closeAria')}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isHome ? (
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2.5 text-xs text-amber-950">
              <div className="font-semibold flex items-center gap-1.5">
                <Home className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{t('modals.pageDelete.homeWarningTitle')}</span>
              </div>
              <p className="text-[11px] text-amber-900 leading-relaxed">
                {t('modals.pageDelete.homeWarningDesc')}{' '}
                {otherPages.length > 0
                  ? t('modals.pageDelete.homeWarningOthers')
                  : t('modals.pageDelete.homeWarningNone')}
              </p>

              {otherPages.length > 0 && onSetHomePage && (
                <div className="flex items-center gap-2 pt-1">
                  <select
                    value={replacementHomeId || otherPages[0].id}
                    onChange={(e) => setReplacementHomeId(e.target.value)}
                    className="flex-1 min-h-[38px] text-xs px-2.5 py-1.5 border border-amber-300 rounded-md bg-white text-slate-900"
                  >
                    {otherPages.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.slug})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      const target = replacementHomeId || otherPages[0].id;
                      onSetHomePage(target);
                    }}
                    className="min-h-[38px] px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-md whitespace-nowrap"
                  >
                    {t('modals.pageDelete.setAsHome')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2 text-xs text-slate-700 leading-relaxed">
                <p>
                  {t('modals.pageDelete.removeIntro')} <strong>{page.name}</strong> (
                  <code className="font-mono text-slate-900">{page.slug}</code>){' '}
                  {t('modals.pageDelete.removeOutro')}
                </p>
                {(isPublished || page.navigation?.visible !== false) && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-950 text-[11px] space-y-1">
                    {isPublished && <div>{t('modals.pageDelete.publishedBullet')}</div>}
                    {page.navigation?.visible !== false && (
                      <div>{t('modals.pageDelete.navVisibleBullet')}</div>
                    )}
                  </div>
                )}
              </div>

              {hasChildren && (
                <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 space-y-2.5">
                  <div className="text-xs font-semibold text-slate-900 tabular-nums">
                    {t('modals.pageDelete.childrenHeading', { count: childPages.length })}
                  </div>

                  <div className="space-y-2 text-xs text-slate-700">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="childDeleteMode"
                        checked={childMode === 'promote'}
                        onChange={() => setChildMode('promote')}
                        className="mt-0.5"
                      />
                      <span>{t('modals.pageDelete.promoteChildren')}</span>
                    </label>

                    {validReparentTargets.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="childDeleteMode"
                            checked={childMode === 'reparent'}
                            onChange={() => {
                              setChildMode('reparent');
                              if (!targetParentId && validReparentTargets[0]) {
                                setTargetParentId(validReparentTargets[0].id);
                              }
                            }}
                            className="mt-0.5"
                          />
                          <span>{t('modals.pageDelete.reparentChildren')}</span>
                        </label>
                        {childMode === 'reparent' && (
                          <select
                            value={targetParentId || validReparentTargets[0]?.id || ''}
                            onChange={(e) => setTargetParentId(e.target.value)}
                            className="w-full min-h-[38px] text-xs px-2.5 py-1.5 border border-slate-300 rounded-md bg-white ml-5"
                          >
                            {validReparentTargets.map((pt) => (
                              <option key={pt.id} value={pt.id}>
                                {pt.name} ({pt.slug})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    <label className="flex items-start gap-2 cursor-pointer text-red-700">
                      <input
                        type="radio"
                        name="childDeleteMode"
                        checked={childMode === 'delete'}
                        onChange={() => setChildMode('delete')}
                        className="mt-0.5"
                      />
                      <span>{t('modals.pageDelete.deleteChildren')}</span>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={isHome}
            onClick={() => {
              onConfirmDelete(
                page.id,
                childMode,
                childMode === 'reparent'
                  ? targetParentId || validReparentTargets[0]?.id || null
                  : null
              );
              onClose();
            }}
            className="min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t('modals.pageDelete.deleteBtn')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
