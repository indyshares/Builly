export type CmsFieldType =
  | 'short_text'
  | 'long_text'
  | 'rich_text'
  | 'number'
  | 'currency'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'url'
  | 'email'
  | 'phone'
  | 'single_select'
  | 'multi_select'
  | 'image'
  | 'gallery'
  | 'file'
  | 'color'
  | 'icon'
  | 'relation'
  | 'repeater_group'
  | 'json';

export type CmsRecordStatus = 'draft' | 'published' | 'archived' | 'trash';

export interface CmsFieldOption {
  value: string;
  label: string;
}

export interface CmsFieldValidation {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  patternMessage?: string;
  currencyCode?: string;
  maxItems?: number;
  maxFileSizeMb?: number;
  allowedMimePrefixes?: string[];
}

export interface CmsRelationFieldConfig {
  relationshipId?: string;
  targetContentTypeId: string;
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_many';
  allowedTargetStatuses?: CmsRecordStatus[];
  displayFieldKey?: string;
  maxSelections?: number;
}

export interface CmsRepeaterSubField {
  key: string;
  label: string;
  type: 'short_text' | 'long_text' | 'url' | 'number' | 'boolean' | 'image';
  required?: boolean;
}

export interface CmsFieldDefinition {
  fieldId: string; // Immutable stable ID
  key: string; // Machine-safe identifier used as Sheets column header
  label: string;
  type: CmsFieldType;
  description?: string;
  placeholder?: string;
  required: boolean;
  unique?: boolean;
  defaultValue?: unknown;
  validation?: CmsFieldValidation;
  options?: CmsFieldOption[];
  group: string; // e.g. 'General', 'Media', 'Details', 'SEO & Routing'
  order: number;
  searchable?: boolean;
  listVisible?: boolean;
  publiclyExposed?: boolean; // Defaults to true
  isSystem?: boolean; // Protected system-core field in built-in types
  relationConfig?: CmsRelationFieldConfig;
  repeaterFields?: CmsRepeaterSubField[];
  schemaVersion: number;
}

export interface CmsContentTypeSchema {
  id: string; // e.g. 'post', 'project', 'ct_case_study'
  slug: string; // e.g. 'posts', 'projects'
  singularLabel: string;
  pluralLabel: string;
  description: string;
  icon: string; // Lucide icon key
  isBuiltIn: boolean;
  enabled: boolean;
  titleFieldKey: string;
  routable: boolean;
  routeBasePath: string; // e.g. '/posts', '/projects'
  publiclyPublishable: boolean;
  schemaVersion: number;
  sheetTableId: string; // Stable Sheets tab name e.g. 'CMS_REC_POST'
  fields: CmsFieldDefinition[];
  attachedTaxonomyIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CmsTaxonomy {
  id: string; // e.g. 'category', 'tag', 'project_category'
  key: string;
  label: string;
  singularLabel: string;
  description?: string;
  hierarchical: boolean;
  isBuiltIn: boolean;
  contentTypeIds: string[]; // Content types where this taxonomy is available
  archiveBasePath?: string; // e.g. '/category', '/tag'
  createdAt: string;
  updatedAt: string;
}

export interface CmsTerm {
  termId: string;
  taxonomyId: string;
  name: string;
  slug: string;
  description?: string;
  parentTermId?: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CmsRecordTermMapping {
  id: string;
  recordId: string;
  contentTypeId: string;
  taxonomyId: string;
  termId: string;
}

export interface CmsRelationshipDef {
  id: string;
  name: string;
  key: string;
  sourceTypeId: string;
  fieldKey: string;
  targetTypeId: string;
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_many';
  required: boolean;
  allowedTargetStatuses: CmsRecordStatus[];
  onDelete: 'restrict' | 'detach' | 'cascade';
  displayFieldKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CmsRecordRelation {
  id: string;
  relationshipId: string;
  sourceRecordId: string;
  sourceTypeId: string;
  fieldKey: string;
  targetRecordId: string;
  targetTypeId: string;
  sortOrder: number;
}

export interface CmsRichContentDoc {
  docId: string;
  recordId: string;
  fieldKey: string;
  driveFileId?: string;
  format: 'html-safe' | 'markdown';
  content: string;
  updatedAt: string;
}

export interface CmsContentRecord {
  recordId: string;
  contentTypeId: string;
  status: CmsRecordStatus;
  slug: string;
  title: string;
  fields: Record<string, unknown>; // Includes unknown preserved columns for schema safety
  richContentRefs: Record<string, string>; // fieldKey -> Drive fileId or docId
  termIdsByTaxonomy: Record<string, string[]>; // taxonomyId -> termId[]
  relationIdsByField: Record<string, string[]>; // relationFieldKey -> targetRecordId[]
  revision: number;
  schemaVersion: number;
  sortOrder: number;
  scheduledAt?: string;
  authorLabel?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  trashedAt?: string;
}

export type CmsCollectionFilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'in'
  | 'gt'
  | 'lt'
  | 'is_empty'
  | 'is_not_empty';

export interface CmsCollectionFieldFilter {
  id: string;
  fieldKey: string;
  operator: CmsCollectionFilterOperator;
  value?: string | number | boolean | string[];
}

export interface CmsCollectionQuery {
  contentTypeId: string;
  statusFilter?: 'published_only' | 'all_non_trash' | 'draft' | 'archived';
  fieldFilters?: CmsCollectionFieldFilter[];
  taxonomyFilter?: {
    taxonomyId: string;
    termIds: string[];
    includeDescendants?: boolean;
  };
  relationFilter?: {
    fieldKey: string;
    targetRecordId: string;
  };
  search?: string;
  sortBy?: string; // 'sortOrder' | 'publishedAt' | 'updatedAt' | 'createdAt' | 'title' | `fields.${key}`
  sortDirection?: 'asc' | 'desc';
  limit?: number; // Max 50
  offset?: number;
  expandDepth?: number; // Capped at 2
  emptyBehavior?: 'message' | 'hide' | 'fallback';
  emptyMessage?: string;
}

export interface CmsCollectionQueryResult {
  records: CmsContentRecord[];
  totalCount: number;
  filteredCount: number;
  hasMore: boolean;
  expandedRelationsByRecord: Record<string, Record<string, CmsContentRecord[]>>;
  fromCache: boolean;
  warnings: string[];
}

export interface CmsMigrationLogEntry {
  id: string;
  timestamp: string;
  contentTypeId: string;
  fromVersion: number;
  toVersion: number;
  summary: string;
  actor: string;
}

export interface CmsOperationalLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  action: string;
  detail: string;
}

export interface CmsStorageHealth {
  cmsFolderDriveId?: string;
  richContentFolderDriveId?: string;
  manifestDriveFileId?: string;
  lastCmsSyncAt?: string;
  lastCmsPullAt?: string;
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  lastError?: string | null;
  syncedTabNames: string[];
}

export interface CmsSettings {
  defaultStatusForNewRecords: 'draft' | 'published';
  requirePublishedRelationsForPublic: boolean;
  maxQueryLimit: number;
  maxRelationExpansionDepth: number;
  enableArchiveRoutes: boolean;
  enableTaxonomyRoutes: boolean;
}

export interface CmsDocument {
  schemaVersion: number;
  revision: number;
  contentTypes: CmsContentTypeSchema[];
  records: CmsContentRecord[];
  taxonomies: CmsTaxonomy[];
  terms: CmsTerm[];
  relationships: CmsRelationshipDef[];
  richDocs: Record<string, CmsRichContentDoc>; // docId -> doc
  migrationLog: CmsMigrationLogEntry[];
  operationalLogs: CmsOperationalLogEntry[];
  storageHealth: CmsStorageHealth;
  settings: CmsSettings;
  // Form Integration & Unified Inbox
  forms?: CmsFormDefinition[];
  inboxSubmissions?: InboxSubmission[];
  inboxCategories?: InboxCategory[];
  inboxNotes?: InboxNote[];
  inboxActivities?: InboxActivity[];
}

export type FormFieldType =
  | 'text'
  | 'email'
  | 'phone'
  | 'textarea'
  | 'number'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'file';

export interface CmsFormField {
  fieldId: string;
  key: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  options?: string[]; // for select, radio
  order: number;
}

export interface CmsFormDestination {
  dataSourceType: 'google_sheets';
  driveFolderId?: string;
  spreadsheetId?: string;
  worksheetName: string; // e.g. 'CONTACT_SUBMISSIONS'
}

export interface CmsFormSettings {
  submitButtonText: string;
  successAction: 'message' | 'redirect';
  successMessage: string;
  redirectUrl?: string;
  allowFileUploads?: boolean;
  maxFileSizeMb?: number;
}

export interface CmsFormDefinition {
  formId: string;
  name: string;
  description?: string;
  categoryId: string; // references InboxCategory.category_id
  status: 'active' | 'archived' | 'draft';
  fields: CmsFormField[];
  destination: CmsFormDestination;
  fieldMappings: Record<string, string>; // formFieldKey -> sheetColumn
  settings: CmsFormSettings;
  createdAt: string;
  updatedAt: string;
}

export interface InboxCategory {
  category_id: string;
  owner_account_id?: string;
  site_id?: string;
  name: string;
  description: string;
  color: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface InboxSubmission {
  inbox_item_id: string;
  submission_id: string;
  owner_account_id?: string;
  site_id: string;
  form_id: string;
  form_name_snapshot: string;
  category_id: string;
  destination_data_source_id?: string;
  destination_spreadsheet_id?: string;
  destination_worksheet_id: string;
  read_status: 'unread' | 'read';
  read_at?: string | null;
  starred: boolean;
  archived: boolean;
  spam_status: 'ham' | 'spam';
  submitted_at: string;
  source_page: string;
  created_at: string;
  updated_at: string;
  fields: Record<string, any>;
  uploaded_files?: Array<{ name: string; url: string; size: string }>;
}

export interface InboxNote {
  note_id: string;
  inbox_item_id: string;
  author_id: string;
  author_name?: string;
  note_content: string;
  created_at: string;
  updated_at: string;
}

export interface InboxActivity {
  activity_id: string;
  inbox_item_id: string;
  action: string;
  previous_value?: string;
  new_value?: string;
  actor_id: string;
  created_at: string;
}

export interface CarouselConfig {
  mode: 'cms-collection' | 'static-slides' | 'media-gallery' | 'selected-records';
  slidesPerViewDesktop: number; // 1..4
  slidesPerViewTablet: number; // 1..3
  slidesPerViewMobile: number; // 1..2
  gapPx: number;
  autoplay: boolean;
  autoplayIntervalMs: number;
  pauseOnHover: boolean;
  loop: boolean;
  showArrows: boolean;
  showDots: boolean;
  showProgress?: boolean;
  transitionStyle: 'slide' | 'fade';
  selectedRecordIds?: string[];
  mediaAssetIds?: string[];
}

export interface CmsGeneratedRoute {
  fullPath: string;
  kind: 'cms-archive' | 'cms-single' | 'taxonomy-archive';
  contentTypeId: string;
  recordId?: string;
  taxonomyId?: string;
  termId?: string;
  title: string;
}
