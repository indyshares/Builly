import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ElementNode,
  InsertionPlacement,
  PageDocument,
  SiteDocument,
} from '../../types/builder';
import {
  getMoveTargetsForNode,
  getRegionContextForNode,
} from '../../services/treeCommandService';
import { isContainerElementType } from '../../data/elementRegistry';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  CornerLeftUp,
  FolderInput,
  Move,
  Plus,
  X,
} from 'lucide-react';

interface MoveTargetPickerModalProps {
  isOpen: boolean;
  node: ElementNode | null;
  site: SiteDocument;
  activePage: PageDocument | null;
  onClose: () => void;
  onCommitTreeMove: (
    nodeIds: string[],
    destinationParentId: string,
    destinationIndex: number
  ) => void;
  onSetInsertionTarget?: (nodeId: string, placement: InsertionPlacement) => void;
  onOpenElementsToInsert?: () => void;
}

export const MoveTargetPickerModal: React.FC<MoveTargetPickerModalProps> = ({
  isOpen,
  node,
  site,
  activePage,
  onClose,
  onCommitTreeMove,
  onSetInsertionTarget,
  onOpenElementsToInsert,
}) => {
  const { t } = useTranslation();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const regionCtx = useMemo(() => {
    if (!isOpen || !node) return null;
    return getRegionContextForNode(site, activePage, node.id);
  }, [isOpen, node, site, activePage]);

  const targets = useMemo(() => {
    if (!regionCtx || !node) return null;
    return getMoveTargetsForNode(regionCtx.root, node.id);
  }, [regionCtx, node]);

  if (!isOpen || !node || !targets || !targets.parent) return null;

  const currentParent = targets.parent;
  const isContainer = isContainerElementType(node.type);

  const commitAndClose = (destParentId: string, destIndex: number) => {
    onCommitTreeMove([node.id], destParentId, destIndex);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-target-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[88dvh] border border-slate-200 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Move className="w-4 h-4 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <h3
                id="move-target-modal-title"
                className="text-sm font-bold text-slate-900 truncate"
              >
                {t('modals.movePicker.title', { name: node.name })}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                {t('modals.movePicker.positionInfo', {
                  parent: currentParent.name,
                  pos: currentParent.index + 1,
                  total: currentParent.siblingCount,
                })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('modals.movePicker.closeAria')}
            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-200/50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 1. Reorder Among Siblings */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-800">
              {t('modals.movePicker.reorderIn', { parent: currentParent.name })}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              <button
                type="button"
                disabled={!targets.canMoveUp}
                onClick={() =>
                  commitAndClose(currentParent.id, Math.max(0, currentParent.index - 1))
                }
                className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>{t('modals.movePicker.moveUp')}</span>
              </button>
              <button
                type="button"
                disabled={!targets.canMoveDown}
                onClick={() =>
                  commitAndClose(currentParent.id, currentParent.index + 2)
                }
                className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5"
              >
                <ArrowDown className="w-3.5 h-3.5" />
                <span>{t('modals.movePicker.moveDown')}</span>
              </button>
              <button
                type="button"
                disabled={!targets.canMoveTop}
                onClick={() => commitAndClose(currentParent.id, 0)}
                className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5"
              >
                <ArrowUpToLine className="w-3.5 h-3.5" />
                <span>{t('modals.movePicker.top')}</span>
              </button>
              <button
                type="button"
                disabled={!targets.canMoveBottom}
                onClick={() =>
                  commitAndClose(currentParent.id, currentParent.siblingCount)
                }
                className="min-h-[40px] px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-semibold text-slate-700 flex items-center justify-center gap-1.5"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                <span>{t('modals.movePicker.bottom')}</span>
              </button>
            </div>
          </div>

          {/* 2. Move Out / Ancestors */}
          {targets.ancestors.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800">
                {t('modals.movePicker.moveOutHeading')}
              </div>
              <div className="space-y-1.5">
                {targets.ancestors.map((anc, idx) => (
                  <button
                    key={anc.id}
                    type="button"
                    onClick={() => commitAndClose(anc.id, anc.insertIndex)}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-lg border text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                      idx === 0
                        ? 'border-blue-300 bg-blue-50/70 hover:bg-blue-100/70 text-blue-950 font-semibold'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-medium'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <CornerLeftUp className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="truncate">
                        {idx === 0
                          ? t('modals.movePicker.moveOutOne', { name: anc.name })
                          : t('modals.movePicker.moveToAncestor', { name: anc.name })}
                      </span>
                    </span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0">
                      {t('modals.movePicker.depth', { depth: anc.depth })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 3. Move Before / After Specific Sibling */}
          {targets.siblings.length > 1 && (
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-800">
                {t('modals.movePicker.relativeHeading')}
              </div>
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-44 overflow-y-auto">
                {targets.siblings.map((sib) => (
                  <div
                    key={sib.id}
                    className={`px-3 py-2 flex items-center justify-between gap-2 text-xs ${
                      sib.isSelf ? 'bg-blue-50/60' : 'bg-white'
                    }`}
                  >
                    <span
                      className={`truncate ${
                        sib.isSelf ? 'font-bold text-blue-800' : 'text-slate-700'
                      }`}
                    >
                      {sib.index + 1}. {sib.name}{' '}
                      {sib.isSelf ? t('modals.movePicker.currentTag') : ''}
                    </span>
                    {!sib.isSelf && (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => commitAndClose(currentParent.id, sib.index)}
                          className="min-h-[30px] px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700"
                        >
                          {t('modals.movePicker.before')}
                        </button>
                        <button
                          type="button"
                          onClick={() => commitAndClose(currentParent.id, sib.index + 1)}
                          className="min-h-[30px] px-2 py-1 rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700"
                        >
                          {t('modals.movePicker.after')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Move Into Container */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <FolderInput className="w-3.5 h-3.5 text-slate-500" />
              <span>{t('modals.movePicker.moveIntoHeading')}</span>
            </div>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 max-h-52 overflow-y-auto">
              {targets.containers.map((container) => (
                <button
                  key={container.id}
                  type="button"
                  disabled={!container.allowed || container.isCurrentParent}
                  onClick={() => commitAndClose(container.id, 9999)}
                  style={{ paddingLeft: `${12 + container.depth * 14}px` }}
                  className="w-full min-h-[40px] pr-3 py-2 text-left text-xs flex items-center justify-between gap-2 hover:bg-slate-50 disabled:opacity-45 disabled:hover:bg-white transition-colors"
                >
                  <span className="truncate font-medium text-slate-800">{container.name}</span>
                  <span className="text-[10px] text-slate-500 shrink-0 max-w-[180px] truncate">
                    {container.isCurrentParent
                      ? t('modals.movePicker.currentParent')
                      : !container.allowed
                      ? container.reason || t('modals.movePicker.incompatible')
                      : t('modals.movePicker.moveInside')}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 5. Quick Insertion Target Switcher */}
          {onSetInsertionTarget && (
            <div className="space-y-2 pt-2 border-t border-slate-200">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5 text-slate-500" />
                <span>{t('modals.movePicker.quickInsertHeading', { name: node.name })}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onSetInsertionTarget(node.id, 'before-selected');
                    onClose();
                    onOpenElementsToInsert?.();
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  {t('modals.movePicker.insertBefore')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSetInsertionTarget(node.id, 'after-selected');
                    onClose();
                    onOpenElementsToInsert?.();
                  }}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  {t('modals.movePicker.insertAfter')}
                </button>
                {isContainer && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetInsertionTarget(node.id, 'into-selected');
                      onClose();
                      onOpenElementsToInsert?.();
                    }}
                    className="min-h-[36px] px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-xs font-semibold text-blue-800"
                  >
                    {t('modals.movePicker.insertInside')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
