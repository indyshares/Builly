import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CmsContentTypeSchema, CmsDocument, CmsFieldDefinition, CmsFieldType } from '../../types/cms';
import { analyzeSchemaEvolution } from '../../services/cms/cmsValidation';
import { Plus, Trash2, Edit2, Layers, AlertCircle, X, Check, Shield } from 'lucide-react';

interface CmsContentTypeBuilderProps {
  cms: CmsDocument;
  onUpdateCms: (nextCms: CmsDocument) => void;
  showToast: (msg: string) => void;
}

const ALL_FIELD_TYPES: { id: CmsFieldType; label: string }[] = [
  { id: 'short_text', label: 'Short Text' },
  { id: 'long_text', label: 'Long Text' },
  { id: 'rich_text', label: 'Rich Text' },
  { id: 'number', label: 'Number' },
  { id: 'currency', label: 'Currency' },
  { id: 'boolean', label: 'Boolean (Toggle)' },
  { id: 'date', label: 'Date' },
  { id: 'datetime', label: 'Date & Time' },
  { id: 'url', label: 'URL Link' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone Number' },
  { id: 'single_select', label: 'Single Select' },
  { id: 'multi_select', label: 'Multi Select' },
  { id: 'image', label: 'Image Asset' },
  { id: 'gallery', label: 'Image Gallery' },
  { id: 'file', label: 'File Asset' },
  { id: 'color', label: 'Color Swatch' },
  { id: 'icon', label: 'Icon' },
  { id: 'relation', label: 'Relation' },
  { id: 'repeater_group', label: 'Repeater Group' },
  { id: 'json', label: 'JSON Data' },
];

export const CmsContentTypeBuilder: React.FC<CmsContentTypeBuilderProps> = ({
  cms,
  onUpdateCms,
  showToast,
}) => {
  const { t } = useTranslation();
  const [selectedTypeId, setSelectedTypeId] = useState<string>(cms.contentTypes[0]?.id || 'post');
  const [isNewTypeModalOpen, setIsNewTypeModalOpen] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeId, setNewTypeId] = useState('');
  const [isFieldModalOpen, setIsFieldModalOpen] = useState(false);
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [fieldName, setFieldName] = useState('');
  const [fieldKey, setFieldKey] = useState('');
  const [fieldType, setFieldType] = useState<CmsFieldType>('short_text');
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldGroup, setFieldGroup] = useState('Content');

  const currentType = cms.contentTypes.find((ct) => ct.id === selectedTypeId) || cms.contentTypes[0];

  const handleCreateContentType = () => {
    if (!newTypeName.trim()) {
      showToast(t('cms.types.nameRequired'));
      return;
    }
    const rawId = (newTypeId || newTypeName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const id = rawId || `custom_${Date.now().toString(36)}`;

    if (cms.contentTypes.some((ct) => ct.id === id)) {
      showToast(t('cms.types.idExists'));
      return;
    }

    const newSchema: CmsContentTypeSchema = {
      id,
      slug: `${id}s`,
      singularLabel: newTypeName.trim(),
      pluralLabel: `${newTypeName.trim()}s`,
      description: t('cms.types.customSchemaDesc'),
      icon: 'FileText',
      isBuiltIn: false,
      enabled: true,
      titleFieldKey: 'title',
      routable: true,
      routeBasePath: `/${id}s`,
      publiclyPublishable: true,
      schemaVersion: 1,
      sheetTableId: `CMS_REC_${id.toUpperCase()}`,
      attachedTaxonomyIds: [],
      fields: [
        { fieldId: 'f_title', key: 'title', label: 'Title', type: 'short_text', required: true, group: 'General', order: 1, schemaVersion: 1 },
        { fieldId: 'f_slug', key: 'slug', label: 'URL Slug', type: 'short_text', required: true, group: 'General', order: 2, schemaVersion: 1 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onUpdateCms({
      ...cms,
      contentTypes: [...cms.contentTypes, newSchema],
    });
    setSelectedTypeId(id);
    setIsNewTypeModalOpen(false);
    showToast(t('cms.types.createdToast', { name: newSchema.singularLabel }));
  };

  const handleOpenAddField = () => {
    setEditingFieldKey(null);
    setFieldName('');
    setFieldKey('');
    setFieldType('short_text');
    setFieldRequired(false);
    setFieldGroup('Content');
    setIsFieldModalOpen(true);
  };

  const handleOpenEditField = (f: CmsFieldDefinition) => {
    setEditingFieldKey(f.key);
    setFieldName(f.label);
    setFieldKey(f.key);
    setFieldType(f.type);
    setFieldRequired(Boolean(f.required));
    setFieldGroup(f.group || 'Content');
    setIsFieldModalOpen(true);
  };

  const handleSaveField = () => {
    if (!fieldName.trim()) {
      showToast(t('cms.types.fieldLabelRequired'));
      return;
    }
    const rawKey = (fieldKey || fieldName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const key = rawKey || `field_${Date.now().toString(36)}`;

    const existingField = currentType.fields.find(f => f.key === editingFieldKey);
    const nextVersion = (currentType.schemaVersion || 1) + 1;
    const newDef: CmsFieldDefinition = {
      fieldId: existingField?.fieldId || 'f_' + Math.random().toString(36).substring(2, 8),
      key,
      label: fieldName.trim(),
      type: fieldType,
      required: fieldRequired,
      group: fieldGroup,
      order: existingField?.order || currentType.fields.length + 1,
      schemaVersion: nextVersion,
    };

    const nextFields = editingFieldKey
      ? currentType.fields.map((f) => (f.key === editingFieldKey ? newDef : f))
      : [...currentType.fields, newDef];

    const evolution = analyzeSchemaEvolution(currentType, { ...currentType, fields: nextFields }, cms.records);

    const updatedType: CmsContentTypeSchema = {
      ...currentType,
      fields: nextFields,
      schemaVersion: nextVersion,
      updatedAt: new Date().toISOString(),
    };

    const nextContentTypes = cms.contentTypes.map((ct) => (ct.id === currentType.id ? updatedType : ct));
    const nextMigrationLog = [
      {
        id: 'mig_' + Math.random().toString(36).substring(2, 8),
        timestamp: new Date().toISOString(),
        contentTypeId: currentType.id,
        fromVersion: currentType.schemaVersion || 1,
        toVersion: nextVersion,
        summary: `Field "${key}" (${fieldType}) added/updated. Safe: ${!evolution.hasBreakingChanges}`,
        actor: 'Admin Editor',
      },
      ...(cms.migrationLog || []),
    ];

    onUpdateCms({
      ...cms,
      contentTypes: nextContentTypes,
      migrationLog: nextMigrationLog,
    });
    setIsFieldModalOpen(false);
    showToast(editingFieldKey ? t('cms.types.fieldUpdatedToast') : t('cms.types.fieldAddedToast'));
  };

  const handleDeleteField = (key: string) => {
    if (key === 'title' || key === 'slug' || key === currentType.titleFieldKey) {
      showToast(t('cms.types.coreFieldsProtectedToast'));
      return;
    }
    const nextFields = currentType.fields.filter((f) => f.key !== key);
    const updatedType: CmsContentTypeSchema = {
      ...currentType,
      fields: nextFields,
      updatedAt: new Date().toISOString(),
    };
    onUpdateCms({
      ...cms,
      contentTypes: cms.contentTypes.map((ct) => (ct.id === currentType.id ? updatedType : ct)),
    });
    showToast(t('cms.types.deletedFieldToast', { key }));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">{t('cms.types.heading')}</h3>
          <p className="text-xs text-slate-500">
            {t('cms.types.subheading')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewTypeName('');
            setNewTypeId('');
            setIsNewTypeModalOpen(true);
          }}
          className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>{t('cms.types.newCustomTypeBtn')}</span>
        </button>
      </div>

      {/* Content Type Selector Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-3">
        {cms.contentTypes.map((ct) => (
          <button
            key={ct.id}
            type="button"
            onClick={() => setSelectedTypeId(ct.id)}
            className={`min-h-[38px] px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              selectedTypeId === ct.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{ct.pluralLabel}</span>
            {ct.isBuiltIn && (
              <span className="text-[9px] px-1 bg-slate-800 text-slate-300 rounded font-mono">
                {t('cms.types.builtInBadge')}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Current Schema Overview */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900">{t('cms.types.schemaTitle', { label: currentType?.singularLabel })}</h4>
              <span className="text-xs text-slate-500 font-mono">{t('cms.types.idLabel', { id: currentType?.id })}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{currentType?.description}</p>
          </div>
          <button
            type="button"
            onClick={handleOpenAddField}
            className="min-h-[36px] px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t('cms.types.addFieldBtn')}</span>
          </button>
        </div>

        {/* Fields Table */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 grid grid-cols-4 text-xs font-semibold text-slate-700">
            <span>{t('cms.types.colFieldLabel')}</span>
            <span>{t('cms.types.colKeyColumn')}</span>
            <span>{t('cms.types.colType')}</span>
            <span className="text-right">{t('cms.types.colActions')}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {(currentType?.fields || []).map((f) => (
              <div key={f.key} className="px-4 py-3 grid grid-cols-4 items-center text-xs hover:bg-slate-50/60">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <span>{f.label}</span>
                  {f.required && <span className="text-red-500" title={t('cms.types.requiredFieldTitle')}>*</span>}
                </div>
                <div className="font-mono text-slate-600">{f.key}</div>
                <div>
                  <span className="px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-mono text-[11px]">
                    {f.type}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEditField(f)}
                    className="p-1.5 hover:bg-slate-200/70 rounded text-slate-600"
                    title={t('cms.types.editFieldTitle')}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {f.key !== 'title' && f.key !== 'slug' && f.key !== currentType.titleFieldKey && (
                    <button
                      type="button"
                      onClick={() => handleDeleteField(f.key)}
                      className="p-1.5 hover:bg-red-50 rounded text-red-600"
                      title={t('cms.types.deleteFieldTitle')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* New Content Type Modal */}
      {isNewTypeModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">{t('cms.types.newTypeModalTitle')}</h4>
              <button onClick={() => setIsNewTypeModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('cms.types.singularNameLabel')}</label>
                <input
                  type="text"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  placeholder={t('cms.types.singularNamePlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('cms.types.typeIdLabel')}</label>
                <input
                  type="text"
                  value={newTypeId}
                  onChange={(e) => setNewTypeId(e.target.value)}
                  placeholder={t('cms.types.typeIdPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsNewTypeModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleCreateContentType}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
              >
                {t('cms.types.createTypeBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Field Editor Modal */}
      {isFieldModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">
                {editingFieldKey ? t('cms.types.editFieldModalTitle') : t('cms.types.addFieldModalTitle')}
              </h4>
              <button onClick={() => setIsFieldModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('cms.types.fieldLabel')}</label>
                <input
                  type="text"
                  value={fieldName}
                  onChange={(e) => setFieldName(e.target.value)}
                  placeholder={t('cms.types.fieldLabelPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('cms.types.fieldKeyLabel')}</label>
                <input
                  type="text"
                  value={fieldKey}
                  onChange={(e) => setFieldKey(e.target.value)}
                  placeholder={t('cms.types.fieldKeyPlaceholder')}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">{t('cms.types.fieldTypeLabel')}</label>
                <select
                  value={fieldType}
                  onChange={(e) => setFieldType(e.target.value as CmsFieldType)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs bg-white"
                >
                  {ALL_FIELD_TYPES.map((ft) => (
                    <option key={ft.id} value={ft.id}>
                      {ft.label} ({ft.id})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="fReq"
                  checked={fieldRequired}
                  onChange={(e) => setFieldRequired(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600"
                />
                <label htmlFor="fReq" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  {t('cms.types.requiredValidation')}
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsFieldModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleSaveField}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold"
              >
                {t('cms.types.saveFieldBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
