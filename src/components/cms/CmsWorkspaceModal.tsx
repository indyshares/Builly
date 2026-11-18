import React, { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CmsContentRecord, CmsDocument } from '../../types/cms';
import { GoogleWorkspaceState } from '../../types/builder';
import { CmsTaxonomiesView } from './CmsTaxonomiesView';
import { CmsContentTypeBuilder } from './CmsContentTypeBuilder';
import { CmsRecordEditor } from './CmsRecordEditor';
import { CmsInboxView } from './CmsInboxView';
import {
  bulkActionCmsRecords,
  duplicateCmsRecord,
  saveCmsRecord,
  transitionCmsRecordStatus,
} from '../../services/cms/cmsService';
import { BuillyLogo } from '../common/BuillyLogo';
import { LanguageSwitcher } from '../common/LanguageSwitcher';
import {
  BookOpen,
  Layers,
  FolderTree,
  Settings,
  Plus,
  Search,
  Trash2,
  Copy,
  Edit2,
  RefreshCw,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  X,
  FileSpreadsheet,
  Cloud,
  Inbox,
} from 'lucide-react';

interface CmsWorkspaceModalProps {
  isOpen: boolean;
  siteCms: CmsDocument;
  workspace: GoogleWorkspaceState;
  initialViewMode?: CmsViewMode;
  onUpdateCms: (nextCms: CmsDocument) => void;
  onSyncToWorkspace: () => void;
  onPullFromWorkspace: () => void;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export type CmsViewMode = 'overview' | 'content' | 'inbox' | 'taxonomies' | 'types' | 'settings';

export const CmsWorkspaceModal: React.FC<CmsWorkspaceModalProps> = ({
  isOpen,
  siteCms,
  workspace,
  initialViewMode,
  onUpdateCms,
  onSyncToWorkspace,
  onPullFromWorkspace,
  onClose,
  showToast,
}) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<CmsViewMode>(initialViewMode || 'overview');

  useEffect(() => {
    if (isOpen && initialViewMode) {
      setViewMode(initialViewMode);
    }
  }, [isOpen, initialViewMode]);
  const [selectedContentTypeId, setSelectedContentTypeId] = useState<string>(
    siteCms.contentTypes[0]?.id || 'post'
  );
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [editingRecord, setEditingRecord] = useState<CmsContentRecord | null>(null);
  const [isRecordEditorOpen, setIsRecordEditorOpen] = useState(false);

  const currentContentType = useMemo(
    () => siteCms.contentTypes.find((ct) => ct.id === selectedContentTypeId) || siteCms.contentTypes[0],
    [siteCms.contentTypes, selectedContentTypeId]
  );

  const filteredRecords = useMemo(() => {
    return (siteCms.records || []).filter((rec) => {
      if (rec.contentTypeId !== selectedContentTypeId) return false;
      if (statusFilter !== 'all' && rec.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = rec.title.toLowerCase().includes(q);
        const matchSlug = rec.slug.toLowerCase().includes(q);
        if (!matchTitle && !matchSlug) return false;
      }
      return true;
    });
  }, [siteCms.records, selectedContentTypeId, statusFilter, searchQuery]);

  const unreadInboxCount = useMemo(() => {
    return (siteCms.inboxSubmissions || []).filter(
      (s) => s.read_status === 'unread' && !s.archived && s.spam_status !== 'spam'
    ).length;
  }, [siteCms.inboxSubmissions]);

  if (!isOpen) return null;

  const handleSaveRecord = (record: CmsContentRecord) => {
    const isEditing = Boolean(editingRecord);
    const res = saveCmsRecord(siteCms, {
      recordId: isEditing ? record.recordId : undefined,
      contentTypeId: record.contentTypeId,
      status: record.status,
      slug: record.slug,
      fields: record.fields,
      termIdsByTaxonomy: record.termIdsByTaxonomy,
      relationIdsByField: record.relationIdsByField,
      sortOrder: record.sortOrder,
      scheduledAt: record.scheduledAt,
      expectedRevision: editingRecord?.revision,
    });

    if (res.error) {
      showToast(res.error);
      return;
    }

    onUpdateCms(res.cms);
    setIsRecordEditorOpen(false);
    setEditingRecord(null);
    showToast(t('cms.content.savedToast', { title: res.record?.title || record.title }));
  };

  const handleDeleteRecord = (recordId: string) => {
    const res = transitionCmsRecordStatus(siteCms, recordId, 'trash');
    if (res.error) {
      showToast(res.error);
      return;
    }
    onUpdateCms(res.cms);
    setSelectedRecordIds((prev) => prev.filter((id) => id !== recordId));
    showToast(t('cms.content.deletedToast'));
  };

  const handleDuplicateRecord = (record: CmsContentRecord) => {
    const res = duplicateCmsRecord(siteCms, record.recordId);
    if (res.error) {
      showToast(res.error);
      return;
    }
    onUpdateCms(res.cms);
    showToast(t('cms.content.duplicatedToast', { title: record.title }));
  };

  const handleBulkDelete = () => {
    if (selectedRecordIds.length === 0) return;
    const res = bulkActionCmsRecords(siteCms, selectedRecordIds, 'trash');
    onUpdateCms(res.cms);
    setSelectedRecordIds([]);
    showToast(t('cms.content.bulkDeletedToast', { count: res.succeededIds.length }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col p-2 sm:p-6 select-none">
      <div className="bg-white rounded-xl shadow-2xl flex-1 flex flex-col overflow-hidden border border-slate-200">
        {/* Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <BuillyLogo mode="responsive" theme="dark" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold tracking-tight truncate">{t('cms.title')}</h2>
              <p className="text-[11px] text-slate-300 truncate">
                {t('cms.subtitle')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher size="sm" theme="dark" />
            <button
              type="button"
              onClick={onSyncToWorkspace}
              className="min-h-[36px] px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('cms.syncToSheets')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body Layout (Nav Rail + Content Area) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Nav Rail */}
          <aside className="w-56 bg-slate-50 border-r border-slate-200 p-3 space-y-1 shrink-0 hidden md:block">
            {(
              [
                { id: 'overview', label: t('cms.nav.overview'), icon: BookOpen },
                { id: 'inbox', label: t('cms.nav.inbox', 'Inbox'), icon: Inbox, badge: unreadInboxCount },
                { id: 'content', label: t('cms.nav.content'), icon: Layers },
                { id: 'taxonomies', label: t('cms.nav.taxonomies'), icon: FolderTree },
                { id: 'types', label: t('cms.nav.types'), icon: Layers },
                { id: 'settings', label: t('cms.nav.settings'), icon: Settings },
              ] as Array<{
                id: CmsViewMode;
                label: string;
                icon: React.ComponentType<{ className?: string }>;
                badge?: number;
              }>
            ).map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                type="button"
                onClick={() => setViewMode(id)}
                className={`w-full min-h-[40px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-2.5 transition-colors text-left ${
                  viewMode === id
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-200/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="ml-auto bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </aside>

          {/* Viewport Content Area */}
          {viewMode === 'inbox' ? (
            <CmsInboxView siteCms={siteCms} onUpdateCms={onUpdateCms} showToast={showToast} />
          ) : (
            <main className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/50">
            {viewMode === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{t('cms.overview.heading')}</h3>
                  <p className="text-xs text-slate-500">
                    {t('cms.overview.subheading')}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1 shadow-xs">
                    <span className="text-xs text-slate-500 font-medium">
                      {t('cms.overview.contentTypes')}
                    </span>
                    <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
                      {siteCms.contentTypes.length}
                    </div>
                  </div>
                  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1 shadow-xs">
                    <span className="text-xs text-slate-500 font-medium">
                      {t('cms.overview.totalRecords')}
                    </span>
                    <div className="text-2xl font-bold font-mono text-blue-600 tabular-nums">
                      {siteCms.records.length}
                    </div>
                  </div>
                  <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-1 shadow-xs">
                    <span className="text-xs text-slate-500 font-medium">
                      {t('cms.overview.publishedEntries')}
                    </span>
                    <div className="text-2xl font-bold font-mono text-emerald-600 tabular-nums">
                      {siteCms.records.filter((r) => r.status === 'published').length}
                    </div>
                  </div>
                </div>

                {/* Quick Content Type Summary */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-900">
                    {t('cms.overview.countsHeading')}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {siteCms.contentTypes.map((ct) => {
                      const count = siteCms.records.filter((r) => r.contentTypeId === ct.id).length;
                      return (
                        <div key={ct.id} className="px-5 py-3 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-900 block">{ct.pluralLabel}</span>
                            <span className="text-slate-500 font-mono text-[11px]">{ct.routeBasePath}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono tabular-nums text-slate-600 font-semibold">
                              {t('cms.overview.recordsCount', { count })}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedContentTypeId(ct.id);
                                setViewMode('content');
                              }}
                              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-700 font-semibold"
                            >
                              {t('cms.overview.manage')}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'content' && (
              <div className="space-y-4">
                {/* Content Type Selector & Filters */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {siteCms.contentTypes.map((ct) => (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => setSelectedContentTypeId(ct.id)}
                        className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold transition-colors ${
                          selectedContentTypeId === ct.id
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {ct.pluralLabel} ({siteCms.records.filter((r) => r.contentTypeId === ct.id).length})
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingRecord(null);
                      setIsRecordEditorOpen(true);
                    }}
                    className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('cms.content.addItem', { type: currentContentType?.singularLabel })}</span>
                  </button>
                </div>

                {/* Search & Status Filters */}
                <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
                  <div className="relative flex-1 w-full sm:max-w-xs">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('cms.content.searchPlaceholder')}
                      className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white"
                    >
                      <option value="all">{t('cms.content.allStatuses')}</option>
                      <option value="published">{t('cms.recordEditor.statusPublished')}</option>
                      <option value="draft">{t('cms.recordEditor.statusDraft')}</option>
                      <option value="archived">{t('cms.recordEditor.statusArchived')}</option>
                    </select>

                    {selectedRecordIds.length > 0 && (
                      <button
                        type="button"
                        onClick={handleBulkDelete}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{t('cms.content.bulkDelete', { count: selectedRecordIds.length })}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Records Table */}
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 grid grid-cols-12 text-xs font-semibold text-slate-700">
                    <div className="col-span-6">{t('cms.content.colTitleSlug')}</div>
                    <div className="col-span-3">{t('cms.content.colStatus')}</div>
                    <div className="col-span-3 text-right">{t('cms.content.colActions')}</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {filteredRecords.length === 0 ? (
                      <div className="p-12 text-center text-xs text-slate-500">
                        {t('cms.content.noRecords', { type: currentContentType?.pluralLabel })}
                      </div>
                    ) : (
                      filteredRecords.map((rec) => (
                        <div key={rec.recordId} className="px-4 py-3 grid grid-cols-12 items-center text-xs hover:bg-slate-50/60">
                          <div className="col-span-6 space-y-0.5 min-w-0 pr-4">
                            <span className="font-bold text-slate-900 block truncate">{rec.title}</span>
                            <span className="text-slate-500 font-mono text-[11px] block truncate">/{rec.slug}</span>
                          </div>
                          <div className="col-span-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                                rec.status === 'published'
                                  ? 'bg-emerald-50 text-emerald-800'
                                  : rec.status === 'draft'
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {rec.status === 'published'
                                ? t('cms.recordEditor.statusPublished')
                                : rec.status === 'draft'
                                ? t('cms.recordEditor.statusDraft')
                                : t('cms.recordEditor.statusArchived')}
                            </span>
                          </div>
                          <div className="col-span-3 flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleDuplicateRecord(rec)}
                              className="p-1.5 hover:bg-slate-200/70 rounded text-slate-600"
                              title={t('common.duplicate')}
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRecord(rec);
                                setIsRecordEditorOpen(true);
                              }}
                              className="p-1.5 hover:bg-slate-200/70 rounded text-slate-600"
                              title={t('common.edit')}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRecord(rec.recordId)}
                              className="p-1.5 hover:bg-red-50 rounded text-red-600"
                              title={t('common.delete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {viewMode === 'taxonomies' && (
              <CmsTaxonomiesView cms={siteCms} onUpdateCms={onUpdateCms} showToast={showToast} />
            )}

            {viewMode === 'types' && (
              <CmsContentTypeBuilder cms={siteCms} onUpdateCms={onUpdateCms} showToast={showToast} />
            )}

            {viewMode === 'settings' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{t('cms.settings.heading')}</h3>
                  <p className="text-xs text-slate-500">
                    {t('cms.settings.subheading')}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          {t('cms.settings.sheetsSyncTitle')}
                        </h4>
                        <p className="text-xs text-slate-500">{t('cms.settings.sheetsSyncDesc')}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onSyncToWorkspace}
                      className="w-full min-h-[40px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold"
                    >
                      {t('cms.settings.syncBtn')}
                    </button>
                  </div>

                  <div className="p-6 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
                        <Cloud className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">
                          {t('cms.settings.drivePullTitle')}
                        </h4>
                        <p className="text-xs text-slate-500">{t('cms.settings.drivePullDesc')}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={onPullFromWorkspace}
                      className="w-full min-h-[40px] px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold"
                    >
                      {t('cms.settings.pullBtn')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>
        )}
        </div>
      </div>

      {/* Record Editor Modal */}
      {isRecordEditorOpen && currentContentType && (
        <CmsRecordEditor
          cms={siteCms}
          contentType={currentContentType}
          recordToEdit={editingRecord}
          onSave={handleSaveRecord}
          onClose={() => setIsRecordEditorOpen(false)}
          showToast={showToast}
        />
      )}
    </div>
  );
};
