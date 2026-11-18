import React, { useState, useMemo } from 'react';
import {
  Inbox,
  Mail,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Settings2,
  Send,
  ExternalLink,
  Table,
  Check,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import {
  ElementNode,
  GoogleWorkspaceState,
  SheetsTab,
  SiteDocument,
} from '../../../types/builder';
import {
  CmsDocument,
  CmsFormDefinition,
  CmsFormField,
  FormFieldType,
  InboxCategory,
} from '../../../types/cms';
import { BUILT_IN_FORM_TEMPLATES } from '../../../data/cmsDefaults';

interface FormCmsInspectorSectionProps {
  element: ElementNode;
  site?: SiteDocument;
  workspace: GoogleWorkspaceState;
  onUpdateElement: (updated: ElementNode) => void;
  onUpdateCms?: (updater: (prev: CmsDocument) => CmsDocument) => void;
  onUpdateWorkspaceTabs?: (tabs: SheetsTab[]) => void;
  onSubmitForm?: (
    formId: string,
    values: Record<string, any>,
    sourcePage?: string
  ) => Promise<boolean | void> | boolean | void;
  onOpenCmsInbox?: () => void;
  inputHeightClass: string;
}

type FormInspectorTab = 'fields' | 'mapping' | 'settings' | 'test';

const FIELD_TYPES: { type: FormFieldType; label: string }[] = [
  { type: 'text', label: 'Short Text' },
  { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone Number' },
  { type: 'textarea', label: 'Long Text / Message' },
  { type: 'number', label: 'Number' },
  { type: 'select', label: 'Dropdown Select' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'radio', label: 'Radio Choice' },
  { type: 'file', label: 'File Upload (Drive)' },
];

export const FormCmsInspectorSection: React.FC<FormCmsInspectorSectionProps> = ({
  element,
  site,
  workspace,
  onUpdateElement,
  onUpdateCms,
  onUpdateWorkspaceTabs,
  onSubmitForm,
  onOpenCmsInbox,
  inputHeightClass,
}) => {
  const [activeTab, setActiveTab] = useState<FormInspectorTab>('fields');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const cmsForms: CmsFormDefinition[] = useMemo(() => site?.cms?.forms || [], [site?.cms?.forms]);
  const categories: InboxCategory[] = useMemo(
    () => site?.cms?.inboxCategories || [],
    [site?.cms?.inboxCategories]
  );

  // Identify current linked form
  const currentFormId = element.content?.formId || cmsForms[0]?.formId || 'form_contact_01';
  const currentForm = useMemo(
    () => cmsForms.find((f) => f.formId === currentFormId) || cmsForms[0],
    [cmsForms, currentFormId]
  );

  // Unread submissions count across inbox
  const unreadCount = useMemo(() => {
    return (site?.cms?.inboxSubmissions || []).filter(
      (s) => s.read_status === 'unread' && !s.archived && s.spam_status !== 'spam'
    ).length;
  }, [site?.cms?.inboxSubmissions]);

  // Selected spreadsheet worksheet tab
  const destinationSheetName = currentForm?.destination?.worksheetName || 'CONTACT_SUBMISSIONS';
  const destinationTab = useMemo(() => {
    return (workspace.spreadsheet?.tabs || []).find(
      (t) => t.name.toLowerCase() === destinationSheetName.toLowerCase()
    );
  }, [workspace.spreadsheet?.tabs, destinationSheetName]);

  const destinationHeaders = useMemo(() => destinationTab?.columns || [], [destinationTab]);

  // Check missing columns in worksheet
  const missingColumns = useMemo(() => {
    if (!currentForm) return [];
    const mappings = currentForm.fieldMappings || {};
    const missing: { fieldKey: string; column: string; label: string }[] = [];
    currentForm.fields.forEach((f) => {
      const col = mappings[f.key] || f.key;
      if (!destinationHeaders.includes(col)) {
        missing.push({ fieldKey: f.key, column: col, label: f.label });
      }
    });
    return missing;
  }, [currentForm, destinationHeaders]);

  // Helper to update current form in CMS document
  const handleUpdateCurrentForm = (updater: (prev: CmsFormDefinition) => CmsFormDefinition) => {
    if (!currentForm || !onUpdateCms) return;
    onUpdateCms((prevCms) => {
      const forms = prevCms.forms || [];
      const updatedForms = forms.map((f) => (f.formId === currentForm.formId ? updater(f) : f));
      return {
        ...prevCms,
        forms: updatedForms,
      };
    });
  };

  // Switch linked form
  const handleSelectForm = (newFormId: string) => {
    onUpdateElement({
      ...element,
      content: {
        ...element.content,
        formId: newFormId,
      },
    });
  };

  // Create brand new form
  const handleCreateNewForm = () => {
    if (!onUpdateCms) return;
    const newFormId = `form_${Date.now()}`;
    const newForm: CmsFormDefinition = {
      formId: newFormId,
      name: `Custom Form ${cmsForms.length + 1}`,
      description: 'Form created from visual builder inspector',
      categoryId: categories[0]?.category_id || 'cat_inquiry',
      status: 'active',
      fields: [
        {
          fieldId: `f_${Date.now()}_1`,
          key: 'full_name',
          label: 'Full Name',
          type: 'text',
          placeholder: 'Your name',
          required: true,
          order: 1,
        },
        {
          fieldId: `f_${Date.now()}_2`,
          key: 'email',
          label: 'Email Address',
          type: 'email',
          placeholder: 'you@example.com',
          required: true,
          order: 2,
        },
        {
          fieldId: `f_${Date.now()}_3`,
          key: 'message',
          label: 'Message',
          type: 'textarea',
          placeholder: 'How can we help?',
          required: true,
          order: 3,
        },
      ],
      destination: {
        dataSourceType: 'google_sheets',
        worksheetName: 'CONTACT_SUBMISSIONS',
      },
      fieldMappings: {
        full_name: 'full_name',
        email: 'email',
        message: 'message',
      },
      settings: {
        submitButtonText: 'Send Inquiry',
        successAction: 'message',
        successMessage: 'Thank you! Your message has been received.',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onUpdateCms((prev) => ({
      ...prev,
      forms: [...(prev.forms || []), newForm],
    }));

    onUpdateElement({
      ...element,
      content: {
        ...element.content,
        formId: newFormId,
        text: newForm.settings.submitButtonText,
      },
    });
  };

  // Apply template
  const handleApplyTemplate = (templateId: string) => {
    const tpl = BUILT_IN_FORM_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl || !currentForm) return;

    handleUpdateCurrentForm((prev) => ({
      ...prev,
      name: tpl.name,
      description: tpl.description,
      categoryId: tpl.categoryId,
      destination: {
        ...prev.destination,
        worksheetName: tpl.worksheetName,
      },
      fields: JSON.parse(JSON.stringify(tpl.fields)),
      fieldMappings: { ...tpl.fieldMappings },
      settings: {
        ...prev.settings,
        submitButtonText: tpl.submitButtonText,
        successMessage: tpl.successMessage,
      },
      updatedAt: new Date().toISOString(),
    }));

    onUpdateElement({
      ...element,
      content: {
        ...element.content,
        text: tpl.submitButtonText,
      },
    });

    setSelectedTemplateId('');
  };

  // Field operations
  const handleAddField = () => {
    if (!currentForm) return;
    const count = (currentForm.fields || []).length + 1;
    const newField: CmsFormField = {
      fieldId: `f_${Date.now()}`,
      key: `field_${count}`,
      label: `Field ${count}`,
      type: 'text',
      placeholder: '',
      required: false,
      order: count,
    };

    handleUpdateCurrentForm((prev) => ({
      ...prev,
      fields: [...prev.fields, newField],
      fieldMappings: {
        ...prev.fieldMappings,
        [newField.key]: newField.key,
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleUpdateField = (fieldId: string, updates: Partial<CmsFormField>) => {
    handleUpdateCurrentForm((prev) => {
      const oldField = prev.fields.find((f) => f.fieldId === fieldId);
      const updatedFields = prev.fields.map((f) => (f.fieldId === fieldId ? { ...f, ...updates } : f));
      let updatedMappings = { ...prev.fieldMappings };

      // If key changed, update mapping key
      if (updates.key && oldField && updates.key !== oldField.key) {
        const targetCol = updatedMappings[oldField.key] || oldField.key;
        delete updatedMappings[oldField.key];
        updatedMappings[updates.key] = targetCol;
      }

      return {
        ...prev,
        fields: updatedFields,
        fieldMappings: updatedMappings,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleDeleteField = (fieldId: string) => {
    handleUpdateCurrentForm((prev) => {
      const fieldToDelete = prev.fields.find((f) => f.fieldId === fieldId);
      const nextFields = prev.fields.filter((f) => f.fieldId !== fieldId);
      const nextMappings = { ...prev.fieldMappings };
      if (fieldToDelete) {
        delete nextMappings[fieldToDelete.key];
      }
      return {
        ...prev,
        fields: nextFields,
        fieldMappings: nextMappings,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    if (!currentForm) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= currentForm.fields.length) return;

    const list = [...currentForm.fields];
    const item = list.splice(index, 1)[0];
    list.splice(targetIdx, 0, item);

    // renumber orders
    const reordered = list.map((f, idx) => ({ ...f, order: idx + 1 }));
    handleUpdateCurrentForm((prev) => ({
      ...prev,
      fields: reordered,
      updatedAt: new Date().toISOString(),
    }));
  };

  // Destination Worksheet updates
  const handleSetWorksheet = (name: string) => {
    handleUpdateCurrentForm((prev) => ({
      ...prev,
      destination: {
        ...prev.destination,
        worksheetName: name,
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleUpdateMapping = (fieldKey: string, targetCol: string) => {
    handleUpdateCurrentForm((prev) => ({
      ...prev,
      fieldMappings: {
        ...prev.fieldMappings,
        [fieldKey]: targetCol,
      },
      updatedAt: new Date().toISOString(),
    }));
  };

  // Add missing columns to Google Sheets Tab
  const handleAddColumnToSheet = (colName: string) => {
    if (!onUpdateWorkspaceTabs) return;
    const currentTabs = workspace.spreadsheet?.tabs || [];
    const targetTab = currentTabs.find(
      (t) => t.name.toLowerCase() === destinationSheetName.toLowerCase()
    );

    if (targetTab) {
      if (targetTab.columns.includes(colName)) return;
      const nextColumns = [...targetTab.columns, colName];
      const nextRows = targetTab.rows.map((row) => ({ ...row, [colName]: row[colName] ?? '' }));
      const updatedTabs = currentTabs.map((t) =>
        t.name.toLowerCase() === destinationSheetName.toLowerCase()
          ? { ...t, columns: nextColumns, rows: nextRows }
          : t
      );
      onUpdateWorkspaceTabs(updatedTabs);
    } else {
      // Create new tab with submission_id, submitted_at, and this column
      const newTab: SheetsTab = {
        name: destinationSheetName,
        description: `Submissions for ${currentForm?.name || destinationSheetName}`,
        columns: ['submission_id', 'submitted_at', 'status', colName],
        rows: [],
      };
      onUpdateWorkspaceTabs([...currentTabs, newTab]);
    }
  };

  const handleAddAllMissingColumns = () => {
    if (!onUpdateWorkspaceTabs || missingColumns.length === 0) return;
    const currentTabs = workspace.spreadsheet?.tabs || [];
    const targetTab = currentTabs.find(
      (t) => t.name.toLowerCase() === destinationSheetName.toLowerCase()
    );

    const newColNames = missingColumns.map((m) => m.column);

    if (targetTab) {
      const distinctCols = newColNames.filter((c) => !targetTab.columns.includes(c));
      if (distinctCols.length === 0) return;
      const nextColumns = [...targetTab.columns, ...distinctCols];
      const nextRows = targetTab.rows.map((row) => {
        const nextRow = { ...row };
        distinctCols.forEach((c) => {
          if (!(c in nextRow)) nextRow[c] = '';
        });
        return nextRow;
      });
      const updatedTabs = currentTabs.map((t) =>
        t.name.toLowerCase() === destinationSheetName.toLowerCase()
          ? { ...t, columns: nextColumns, rows: nextRows }
          : t
      );
      onUpdateWorkspaceTabs(updatedTabs);
    } else {
      const newTab: SheetsTab = {
        name: destinationSheetName,
        description: `Submissions for ${currentForm?.name || destinationSheetName}`,
        columns: ['submission_id', 'submitted_at', 'status', ...newColNames],
        rows: [],
      };
      onUpdateWorkspaceTabs([...currentTabs, newTab]);
    }
  };

  // Test form submission
  const handleRunTestSubmission = async () => {
    if (!currentForm || !onSubmitForm) return;
    setIsTesting(true);
    setTestResult(null);

    // Build dummy test payload
    const testData: Record<string, any> = {};
    currentForm.fields.forEach((f) => {
      switch (f.type) {
        case 'email':
          testData[f.key] = 'alex.test@studio.example';
          break;
        case 'phone':
          testData[f.key] = '+1 (555) 234-5678';
          break;
        case 'number':
          testData[f.key] = 3;
          break;
        case 'textarea':
          testData[f.key] =
            'Test message dispatched from Visual Builder Property Panel to verify sheet columns and inbox registry.';
          break;
        case 'select':
          testData[f.key] = f.options?.[0] || 'Option 1';
          break;
        case 'checkbox':
          testData[f.key] = true;
          break;
        case 'radio':
          testData[f.key] = f.options?.[0] || 'Choice A';
          break;
        default:
          testData[f.key] = `Test ${f.label}`;
          break;
      }
    });

    try {
      await onSubmitForm(currentForm.formId, testData, 'Visual Builder Test Mode');
      setTestResult({
        success: true,
        message: `Test record saved into ${destinationSheetName} and added to Unified Inbox.`,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err?.message || 'Failed to submit test payload.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="space-y-4 pt-1 border-t border-slate-200">
      {/* Header & Unified Inbox status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
            <Inbox className="w-3.5 h-3.5" />
          </div>
          <div>
            <span className="text-xs font-bold text-slate-900 block leading-tight">
              CMS Form & Inbox
            </span>
            <span className="text-[10px] text-slate-500">
              Form-to-Sheets & Centralized Inbox
            </span>
          </div>
        </div>

        {onOpenCmsInbox && (
          <button
            type="button"
            onClick={onOpenCmsInbox}
            className="px-2 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-700 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
            title="Open Unified CMS Inbox"
          >
            <Mail className="w-3 h-3" />
            <span>Inbox</span>
            {unreadCount > 0 && (
              <span className="px-1 py-0.2 bg-blue-600 text-white rounded-full text-[9px] font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Form Selector & New Form / Templates */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label className="font-semibold text-slate-700">Connected CMS Form</label>
          <button
            type="button"
            onClick={handleCreateNewForm}
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>New Form</span>
          </button>
        </div>

        <select
          value={currentForm?.formId || ''}
          onChange={(e) => handleSelectForm(e.target.value)}
          className={`w-full px-2 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-800 ${inputHeightClass}`}
        >
          {cmsForms.map((f) => (
            <option key={f.formId} value={f.formId}>
              {f.name} ({f.fields?.length || 0} fields)
            </option>
          ))}
          {cmsForms.length === 0 && <option value="">No Forms Created</option>}
        </select>

        {/* Template Selector dropdown */}
        <div className="pt-1 flex items-center gap-2">
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            className="flex-1 px-2 py-1 bg-white border border-slate-200 rounded text-[11px] text-slate-600"
          >
            <option value="">Apply built-in template...</option>
            {BUILT_IN_FORM_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedTemplateId}
            onClick={() => handleApplyTemplate(selectedTemplateId)}
            className="px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 disabled:opacity-50 text-[11px] font-semibold rounded text-slate-700 cursor-pointer disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Sub-tabs Navigation */}
      <div className="grid grid-cols-4 gap-1 p-0.5 bg-slate-100 rounded-lg text-[11px] font-semibold text-slate-600">
        <button
          type="button"
          onClick={() => setActiveTab('fields')}
          className={`py-1.5 rounded-md text-center transition-colors ${
            activeTab === 'fields' ? 'bg-white text-blue-600 shadow-xs' : 'hover:text-slate-900'
          }`}
        >
          Fields ({currentForm?.fields?.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('mapping')}
          className={`py-1.5 rounded-md text-center transition-colors relative ${
            activeTab === 'mapping' ? 'bg-white text-blue-600 shadow-xs' : 'hover:text-slate-900'
          }`}
        >
          Sheets
          {missingColumns.length > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 absolute top-1 right-1" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('settings')}
          className={`py-1.5 rounded-md text-center transition-colors ${
            activeTab === 'settings' ? 'bg-white text-blue-600 shadow-xs' : 'hover:text-slate-900'
          }`}
        >
          Settings
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('test')}
          className={`py-1.5 rounded-md text-center transition-colors ${
            activeTab === 'test' ? 'bg-white text-blue-600 shadow-xs' : 'hover:text-slate-900'
          }`}
        >
          Test
        </button>
      </div>

      {/* TAB 1: FORM FIELDS */}
      {activeTab === 'fields' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Form Input Fields</span>
            <button
              type="button"
              onClick={handleAddField}
              className="px-2 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" />
              <span>Add Field</span>
            </button>
          </div>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {(currentForm?.fields || []).map((field, index) => (
              <div
                key={field.fieldId}
                className="bg-white border border-slate-200 rounded-lg p-2.5 space-y-2 shadow-2xs hover:border-slate-300 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => handleMoveField(index, 'up')}
                      className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-500"
                      title="Move Up"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={index === (currentForm?.fields.length || 0) - 1}
                      onClick={() => handleMoveField(index, 'down')}
                      className="p-1 hover:bg-slate-100 disabled:opacity-30 rounded text-slate-500"
                      title="Move Down"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    <span className="font-mono text-[10px] text-slate-400">#{index + 1}</span>
                  </div>

                  <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => handleUpdateField(field.fieldId, { required: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-0"
                    />
                    <span>Required</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => handleDeleteField(field.fieldId)}
                    className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition-colors"
                    title="Delete Field"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                      Label
                    </label>
                    <input
                      type="text"
                      value={field.label}
                      onChange={(e) => handleUpdateField(field.fieldId, { label: e.target.value })}
                      className={`w-full px-2 py-1 text-xs border border-slate-200 rounded ${inputHeightClass}`}
                      placeholder="Field Label"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                      Field Key
                    </label>
                    <input
                      type="text"
                      value={field.key}
                      onChange={(e) =>
                        handleUpdateField(field.fieldId, {
                          key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                        })
                      }
                      className={`w-full px-2 py-1 text-xs font-mono border border-slate-200 rounded ${inputHeightClass}`}
                      placeholder="field_key"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                      Type
                    </label>
                    <select
                      value={field.type}
                      onChange={(e) =>
                        handleUpdateField(field.fieldId, {
                          type: e.target.value as FormFieldType,
                        })
                      }
                      className={`w-full px-2 py-1 text-xs border border-slate-200 rounded ${inputHeightClass}`}
                    >
                      {FIELD_TYPES.map((t) => (
                        <option key={t.type} value={t.type}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                      Placeholder
                    </label>
                    <input
                      type="text"
                      value={field.placeholder || ''}
                      onChange={(e) =>
                        handleUpdateField(field.fieldId, { placeholder: e.target.value })
                      }
                      className={`w-full px-2 py-1 text-xs border border-slate-200 rounded ${inputHeightClass}`}
                      placeholder="Hint text..."
                    />
                  </div>
                </div>

                {/* Options for Select and Radio */}
                {(field.type === 'select' || field.type === 'radio') && (
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 block mb-0.5">
                      Options (comma-separated)
                    </label>
                    <input
                      type="text"
                      value={(field.options || []).join(', ')}
                      onChange={(e) =>
                        handleUpdateField(field.fieldId, {
                          options: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className={`w-full px-2 py-1 text-xs border border-slate-200 rounded ${inputHeightClass}`}
                      placeholder="Option 1, Option 2, Option 3"
                    />
                  </div>
                )}
              </div>
            ))}

            {(currentForm?.fields || []).length === 0 && (
              <div className="p-4 text-center border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs">
                No fields defined. Click &ldquo;Add Field&rdquo; or apply a built-in template.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SHEETS DESTINATION & MAPPING */}
      {activeTab === 'mapping' && (
        <div className="space-y-3">
          {/* Drive & Spreadsheet Data Source Context */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 inline-flex items-center gap-1">
                <FolderOpen className="w-3 h-3 text-slate-400" />
                Drive Folder:
              </span>
              <span className="font-mono font-semibold text-slate-700 truncate max-w-[140px]">
                {workspace.driveFolder?.name || 'Builly Site Folder'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 inline-flex items-center gap-1">
                <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                Spreadsheet:
              </span>
              <span className="font-mono font-semibold text-slate-700 truncate max-w-[140px]">
                {workspace.spreadsheet?.name || 'Connected Workbook'}
              </span>
            </div>
          </div>

          {/* Target Worksheet Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Google Sheets Worksheet
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={destinationSheetName}
                onChange={(e) => handleSetWorksheet(e.target.value)}
                className={`flex-1 px-2.5 py-1.5 text-xs font-mono border border-slate-200 rounded ${inputHeightClass}`}
                placeholder="e.g. CONTACT_SUBMISSIONS"
              />
              {workspace.spreadsheet?.tabs && workspace.spreadsheet.tabs.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleSetWorksheet(e.target.value);
                  }}
                  className="px-2 py-1.5 text-xs border border-slate-200 rounded bg-white text-slate-600"
                >
                  <option value="">Tabs...</option>
                  {workspace.spreadsheet.tabs.map((tab) => (
                    <option key={tab.name} value={tab.name}>
                      {tab.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
              <span>
                {destinationTab
                  ? `✓ Worksheet found (${destinationTab.columns.length} columns, ${destinationTab.rows.length} rows)`
                  : '⚠ Worksheet will be created on first sync'}
              </span>
            </div>
          </div>

          {/* Missing Columns Banner & Auto-sync */}
          {missingColumns.length > 0 && (
            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
              <div className="flex items-start gap-1.5 text-amber-800 text-[11px]">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  <strong>{missingColumns.length} field(s)</strong> do not exist as columns in{' '}
                  <code className="font-mono">{destinationSheetName}</code>.
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddAllMissingColumns}
                className="w-full py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add All Missing Columns to Sheet</span>
              </button>
            </div>
          )}

          {/* Mapping Table */}
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-700 block">
              Field to Sheet Column Mapping
            </span>
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 bg-white">
              {(currentForm?.fields || []).map((field) => {
                const mappedCol = currentForm?.fieldMappings?.[field.key] || field.key;
                const isPresent = destinationHeaders.includes(mappedCol);

                return (
                  <div key={field.fieldId} className="p-2 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900 block truncate">{field.label}</span>
                      <span className="font-mono text-[10px] text-slate-400 block truncate">
                        {field.key}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={mappedCol}
                        onChange={(e) => handleUpdateMapping(field.key, e.target.value)}
                        className="w-28 px-1.5 py-1 text-xs font-mono border border-slate-200 rounded"
                        placeholder="col_name"
                      />

                      {isPresent ? (
                        <span
                          className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"
                          title="Column exists in sheet"
                        >
                          <Check className="w-3 h-3" />
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddColumnToSheet(mappedCol)}
                          className="px-1.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded text-[10px] font-semibold shrink-0"
                          title="Add column to sheet header"
                        >
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SUBMISSION SETTINGS & CATEGORY */}
      {activeTab === 'settings' && (
        <div className="space-y-3">
          {/* Submit Button Text */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Submit Button Label
            </label>
            <input
              type="text"
              value={currentForm?.settings?.submitButtonText || element.content?.text || 'Send Inquiry'}
              onChange={(e) => {
                const val = e.target.value;
                handleUpdateCurrentForm((prev) => ({
                  ...prev,
                  settings: { ...prev.settings, submitButtonText: val },
                  updatedAt: new Date().toISOString(),
                }));
                onUpdateElement({
                  ...element,
                  content: { ...element.content, text: val },
                });
              }}
              className={`w-full px-2.5 py-1.5 border border-slate-200 rounded ${inputHeightClass}`}
            />
          </div>

          {/* Inbox Category */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Default Inbox Category
            </label>
            <select
              value={currentForm?.categoryId || ''}
              onChange={(e) =>
                handleUpdateCurrentForm((prev) => ({
                  ...prev,
                  categoryId: e.target.value,
                  updatedAt: new Date().toISOString(),
                }))
              }
              className={`w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs bg-white ${inputHeightClass}`}
            >
              {categories.map((cat) => (
                <option key={cat.category_id} value={cat.category_id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-slate-500 mt-0.5 block">
              Submissions from this form will automatically route to this category.
            </span>
          </div>

          {/* Success Action */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              Submission Feedback Action
            </label>
            <div className="flex gap-4 mb-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="successAction"
                  checked={currentForm?.settings?.successAction !== 'redirect'}
                  onChange={() =>
                    handleUpdateCurrentForm((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, successAction: 'message' },
                      updatedAt: new Date().toISOString(),
                    }))
                  }
                  className="text-blue-600 focus:ring-0"
                />
                <span>Display Message</span>
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="successAction"
                  checked={currentForm?.settings?.successAction === 'redirect'}
                  onChange={() =>
                    handleUpdateCurrentForm((prev) => ({
                      ...prev,
                      settings: { ...prev.settings, successAction: 'redirect' },
                      updatedAt: new Date().toISOString(),
                    }))
                  }
                  className="text-blue-600 focus:ring-0"
                />
                <span>Redirect URL</span>
              </label>
            </div>

            {currentForm?.settings?.successAction === 'redirect' ? (
              <input
                type="text"
                value={currentForm?.settings?.redirectUrl || ''}
                onChange={(e) =>
                  handleUpdateCurrentForm((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, redirectUrl: e.target.value },
                    updatedAt: new Date().toISOString(),
                  }))
                }
                placeholder="https://... or /thank-you"
                className={`w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs ${inputHeightClass}`}
              />
            ) : (
              <textarea
                value={
                  currentForm?.settings?.successMessage ||
                  'Thank you! Your message has been sent successfully.'
                }
                onChange={(e) =>
                  handleUpdateCurrentForm((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, successMessage: e.target.value },
                    updatedAt: new Date().toISOString(),
                  }))
                }
                rows={2}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs"
              />
            )}
          </div>

          {/* File Uploads Toggle */}
          <div className="pt-1">
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={!!currentForm?.settings?.allowFileUploads}
                onChange={(e) =>
                  handleUpdateCurrentForm((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, allowFileUploads: e.target.checked },
                    updatedAt: new Date().toISOString(),
                  }))
                }
                className="rounded border-slate-300 text-blue-600 focus:ring-0"
              />
              <span>Allow Drive File Uploads</span>
            </label>
            {currentForm?.settings?.allowFileUploads && (
              <div className="mt-2 pl-5">
                <label className="text-[11px] font-medium text-[var(--builder-text-secondary)] block mb-1">
                  Max File Size (MB)
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={currentForm?.settings?.maxFileSizeMb ?? ''}
                  placeholder="10"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      handleUpdateCurrentForm((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          maxFileSizeMb: undefined,
                        },
                        updatedAt: new Date().toISOString(),
                      }));
                      return;
                    }
                    const parsed = parseInt(val, 10);
                    if (Number.isFinite(parsed) && parsed > 0) {
                      handleUpdateCurrentForm((prev) => ({
                        ...prev,
                        settings: {
                          ...prev.settings,
                          maxFileSizeMb: parsed,
                        },
                        updatedAt: new Date().toISOString(),
                      }));
                    }
                  }}
                  onBlur={() => {
                    if (!currentForm?.settings?.maxFileSizeMb) {
                      handleUpdateCurrentForm((prev) => ({
                        ...prev,
                        settings: { ...prev.settings, maxFileSizeMb: 10 },
                        updatedAt: new Date().toISOString(),
                      }));
                    }
                  }}
                  className="w-28 h-[38px] px-2.5 text-sm font-mono tabular-nums border border-[var(--builder-border)] rounded-[7px] bg-white focus:outline-none focus:border-[var(--builder-primary)]"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: TEST & VERIFICATION */}
      {activeTab === 'test' && (
        <div className="space-y-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
            <span className="font-semibold text-slate-800 block">Form Pipeline Diagnostics</span>
            <p className="text-slate-500 text-[11px]">
              Trigger a test submission with simulated fields to verify that data routes to{' '}
              <span className="font-mono font-semibold text-slate-700">
                {destinationSheetName}
              </span>{' '}
              and logs into the Unified Inbox.
            </p>

            <button
              type="button"
              disabled={isTesting || !onSubmitForm}
              onClick={handleRunTestSubmission}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors shadow-xs"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording Submission...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Test Submission</span>
                </>
              )}
            </button>
          </div>

          {testResult && (
            <div
              className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                testResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              )}
              <div className="flex-1 text-[11px] leading-relaxed">
                <span className="font-semibold block mb-0.5">
                  {testResult.success ? 'Submission Successful' : 'Submission Error'}
                </span>
                <span>{testResult.message}</span>
              </div>
            </div>
          )}

          {onOpenCmsInbox && (
            <button
              type="button"
              onClick={onOpenCmsInbox}
              className="w-full py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors"
            >
              <Inbox className="w-3.5 h-3.5 text-blue-600" />
              <span>Open Unified Inbox ({unreadCount} unread)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
