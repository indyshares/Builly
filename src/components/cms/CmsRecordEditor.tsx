import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CmsContentRecord, CmsContentTypeSchema, CmsDocument, CmsFieldDefinition } from '../../types/cms';
import {
  ensureUniqueRecordSlug,
  sanitizeCmsSlug,
  validateCmsRecord,
} from '../../services/cms/cmsValidation';
import { X, Save, AlertCircle, Check, Image as ImageIcon, Calendar, Hash, Globe, Tag } from 'lucide-react';

interface CmsRecordEditorProps {
  cms: CmsDocument;
  contentType: CmsContentTypeSchema;
  recordToEdit: CmsContentRecord | null;
  onSave: (record: CmsContentRecord) => void;
  onClose: () => void;
  showToast: (msg: string) => void;
}

export const CmsRecordEditor: React.FC<CmsRecordEditorProps> = ({
  cms,
  contentType,
  recordToEdit,
  onSave,
  onClose,
  showToast,
}) => {
  const { t } = useTranslation();
  const primaryTitleKey = contentType.titleFieldKey || 'title';
  const primaryTitleField = useMemo(
    () => (contentType.fields || []).find((f) => f.key === primaryTitleKey),
    [contentType.fields, primaryTitleKey]
  );

  const initialTitle =
    recordToEdit?.title ||
    String(recordToEdit?.fields?.[primaryTitleKey] ?? recordToEdit?.fields?.title ?? '');

  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(recordToEdit?.slug || '');
  const [status, setStatus] = useState<CmsContentRecord['status']>(recordToEdit?.status || 'draft');
  const [fields, setFields] = useState<Record<string, any>>(() => ({
    ...(recordToEdit?.fields || {}),
    ...(initialTitle ? { [primaryTitleKey]: initialTitle } : {}),
  }));
  const [termIdsByTaxonomy, setTermIdsByTaxonomy] = useState<Record<string, string[]>>(
    recordToEdit?.termIdsByTaxonomy || {}
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [generalErrors, setGeneralErrors] = useState<string[]>([]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setFields((prev) => ({
      ...prev,
      [primaryTitleKey]: val,
      ...((contentType.fields || []).some((f) => f.key === 'title') ? { title: val } : {}),
    }));
    if (fieldErrors[primaryTitleKey] || fieldErrors.title) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[primaryTitleKey];
        delete next.title;
        return next;
      });
    }
  };

  const handleFieldChange = (key: string, val: any) => {
    setFields((prev) => ({ ...prev, [key]: val }));
    if (key === primaryTitleKey) {
      setTitle(String(val ?? ''));
    }
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleSave = () => {
    const recordId = recordToEdit?.recordId || 'rec_' + Math.random().toString(36).substring(2, 9);
    const trimmedTitle = title.trim();
    const syncedFields: Record<string, any> = {
      ...fields,
      [primaryTitleKey]: trimmedTitle,
    };
    if ((contentType.fields || []).some((f) => f.key === 'title') && !syncedFields.title) {
      syncedFields.title = trimmedTitle;
    }

    const cleanUserSlug = sanitizeCmsSlug(slug);
    const slugSeed = sanitizeCmsSlug(trimmedTitle) ? trimmedTitle : contentType.slug || 'item';
    const finalSlug =
      cleanUserSlug ||
      ensureUniqueRecordSlug(slugSeed, contentType.id, cms.records, recordToEdit?.recordId);

    const record: CmsContentRecord = {
      recordId,
      contentTypeId: contentType.id,
      title: trimmedTitle,
      slug: finalSlug,
      status,
      fields: syncedFields,
      schemaVersion: contentType.schemaVersion || 1,
      sortOrder: recordToEdit?.sortOrder || 1,
      richContentRefs: recordToEdit?.richContentRefs || {},
      termIdsByTaxonomy,
      relationIdsByField: recordToEdit?.relationIdsByField || {},
      authorLabel: recordToEdit?.authorLabel || 'Editor',
      createdAt: recordToEdit?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: recordToEdit?.publishedAt,
      trashedAt: recordToEdit?.trashedAt,
      revision: recordToEdit ? (recordToEdit.revision || 1) + 1 : 1,
    };

    const validation = validateCmsRecord(contentType, record, cms.records);
    if (!validation.valid) {
      setFieldErrors(validation.fieldErrors);
      setGeneralErrors(validation.generalErrors);
      showToast(t('cms.recordEditor.validationToast'));
      return;
    }

    setFieldErrors({});
    setGeneralErrors([]);
    onSave(record);
  };

  const allErrorMessages = [
    ...Object.values(fieldErrors),
    ...generalErrors,
  ];
  const titleError = fieldErrors[primaryTitleKey] || fieldErrors.title;
  const slugError = generalErrors.find((e) => e.toLowerCase().includes('slug'));

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex flex-col justify-end sm:justify-center p-0 sm:p-4 select-none">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92dvh] flex flex-col overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {recordToEdit
                ? t('cms.recordEditor.editTitle', { type: contentType.singularLabel })
                : t('cms.recordEditor.newTitle', { type: contentType.singularLabel })}
            </h3>
            <p className="text-xs text-slate-500">
              {t('cms.recordEditor.schemaPrefix', { id: contentType.id })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>{t('cms.recordEditor.saveRecord')}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="p-2 hover:bg-slate-200/70 rounded-lg text-slate-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Validation Errors */}
        {allErrorMessages.length > 0 && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 space-y-1">
            <div className="font-semibold flex items-center gap-1">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{t('cms.recordEditor.validationTitle')}</span>
            </div>
            <ul className="list-disc pl-5 space-y-0.5">
              {allErrorMessages.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="cms-record-title" className="text-xs font-semibold text-slate-700 block mb-1">
                {primaryTitleField?.label || t('cms.recordEditor.titleLabel')}{' '}
                {primaryTitleField?.required !== false && <span className="text-red-500">*</span>}
              </label>
              <input
                id="cms-record-title"
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder={t('cms.recordEditor.titlePlaceholder')}
                aria-invalid={Boolean(titleError)}
                className={`w-full px-3 py-2 border rounded-lg text-sm font-medium ${
                  titleError
                    ? 'border-red-500 ring-1 ring-red-200 bg-red-50/30'
                    : 'border-slate-200'
                }`}
              />
              {titleError && (
                <p className="mt-1 text-[11px] font-medium text-red-600">{titleError}</p>
              )}
            </div>
            <div>
              <label htmlFor="cms-record-slug" className="text-xs font-semibold text-slate-700 block mb-1">
                {t('cms.recordEditor.slugLabel')}
              </label>
              <input
                id="cms-record-slug"
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  if (generalErrors.length > 0) setGeneralErrors([]);
                }}
                placeholder={t('cms.recordEditor.slugPlaceholder')}
                aria-invalid={Boolean(slugError)}
                className={`w-full px-3 py-2 border rounded-lg text-xs font-mono ${
                  slugError
                    ? 'border-red-500 ring-1 ring-red-200 bg-red-50/30'
                    : 'border-slate-200'
                }`}
              />
              {slugError && (
                <p className="mt-1 text-[11px] font-medium text-red-600">{slugError}</p>
              )}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              {t('cms.recordEditor.statusLabel')}
            </label>
            <div className="flex gap-2">
              {(['draft', 'published', 'archived'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatus(st)}
                  className={`min-h-[36px] px-4 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors ${
                    status === st
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st === 'draft'
                    ? t('cms.recordEditor.statusDraft')
                    : st === 'published'
                    ? t('cms.recordEditor.statusPublished')
                    : t('cms.recordEditor.statusArchived')}
                </button>
              ))}
            </div>
          </div>

          {/* Taxonomies assignment */}
          {(contentType.attachedTaxonomyIds || []).length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-200">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                {t('cms.recordEditor.taxonomiesHeading')}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {contentType.attachedTaxonomyIds.map((taxId) => {
                  const tax = cms.taxonomies.find((t) => t.id === taxId);
                  const terms = cms.terms.filter((t) => t.taxonomyId === taxId);
                  if (!tax) return null;
                  const assigned = termIdsByTaxonomy[taxId] || [];

                  return (
                    <div key={taxId} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                      <span className="text-xs font-semibold text-slate-800 block">{tax.label}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {terms.map((term) => {
                          const isSelected = assigned.includes(term.termId);
                          return (
                            <button
                              key={term.termId}
                              type="button"
                              onClick={() => {
                                const nextAssigned = isSelected
                                  ? assigned.filter((id) => id !== term.termId)
                                  : [...assigned, term.termId];
                                setTermIdsByTaxonomy((prev) => ({ ...prev, [taxId]: nextAssigned }));
                              }}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                isSelected
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              {term.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Schema Fields */}
          <div className="space-y-4 pt-2 border-t border-slate-200">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {t('cms.recordEditor.customFieldsHeading')}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(contentType.fields || [])
                .filter((f) => f.key !== primaryTitleKey && f.key !== 'title' && f.key !== 'slug')
                .map((field) => {
                  const val = fields[field.key] ?? '';
                  const fErr = fieldErrors[field.key];
                  const inputBorder = fErr
                    ? 'border-red-500 ring-1 ring-red-200 bg-red-50/30'
                    : 'border-slate-200';

                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="text-xs font-semibold text-slate-700 block">
                        {field.label} {field.required && <span className="text-red-500">*</span>}
                        <span className="text-[10px] font-mono text-slate-400 ml-1.5">({field.key})</span>
                      </label>

                      {field.type === 'long_text' || field.type === 'rich_text' ? (
                        <textarea
                          rows={3}
                          value={val}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          aria-invalid={Boolean(fErr)}
                          className={`w-full p-2.5 border rounded-lg text-xs ${inputBorder}`}
                        />
                      ) : field.type === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={Boolean(val)}
                          onChange={(e) => handleFieldChange(field.key, e.target.checked)}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                      ) : field.type === 'single_select' && (field.options?.length || 0) > 0 ? (
                        <select
                          value={String(val)}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          aria-invalid={Boolean(fErr)}
                          className={`w-full px-3 py-2 border rounded-lg text-xs bg-white ${inputBorder}`}
                        >
                          <option value="">-- Select --</option>
                          {field.options!.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      ) : field.type === 'number' || field.type === 'currency' ? (
                        <input
                          type="number"
                          value={val}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === '') {
                              handleFieldChange(field.key, '');
                            } else {
                              const parsed = parseFloat(raw);
                              handleFieldChange(field.key, Number.isFinite(parsed) ? parsed : '');
                            }
                          }}
                          aria-invalid={Boolean(fErr)}
                          className={`w-full px-3 py-2 border rounded-lg text-xs font-mono ${inputBorder}`}
                        />
                      ) : (
                        <input
                          type={field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text'}
                          value={val}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          aria-invalid={Boolean(fErr)}
                          className={`w-full px-3 py-2 border rounded-lg text-xs ${inputBorder}`}
                        />
                      )}
                      {fErr && <p className="text-[11px] font-medium text-red-600">{fErr}</p>}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
          >
            {t('cms.recordEditor.saveRecord')}
          </button>
        </div>
      </div>
    </div>
  );
};
