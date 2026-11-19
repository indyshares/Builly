export type OrganizationRole = 'owner' | 'admin' | 'editor' | 'viewer';

export type ProjectModuleKey =
  | 'builder'
  | 'cms'
  | 'inbox'
  | 'assets'
  | 'publishing'
  | 'versions'
  | 'settings';

export const ALL_PROJECT_MODULES: readonly ProjectModuleKey[] = [
  'builder',
  'cms',
  'inbox',
  'assets',
  'publishing',
  'versions',
  'settings',
];

export interface OrganizationRecord {
  org_id: string;
  owner_id: string;
  name: string;
  org_slug: string;
  drive_folder_id: string;
  status: 'active' | 'archived';
  canonical_revision?: number;
  last_operation_id?: string;
  drive_manifest_file_id?: string;
  created_at: string;
  updated_at: string;
  role?: OrganizationRole;
}

export interface ProjectRecord {
  project_id: string;
  org_id: string;
  owner_id: string;
  name: string;
  project_slug: string;
  description: string;
  drive_folder_id: string;
  status: 'active' | 'archived';
  canonical_revision?: number;
  last_operation_id?: string;
  drive_manifest_file_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectModuleRecord {
  id: string;
  project_id: string;
  module_key: ProjectModuleKey;
  enabled: number;
  config_json: string;
  updated_at: string;
}

export interface SiteRecord {
  site_id: string;
  project_id: string;
  org_id: string;
  owner_id: string;
  site_slug: string;
  site_name: string;
  custom_domain: string | null;
  status: 'draft' | 'published' | 'suspended';
  active_publish_version: string;
  active_build_id: string;
  drive_config_folder_id: string;
  canonical_revision?: number;
  last_operation_id?: string;
  drive_manifest_file_id?: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceResourceRecord {
  resource_id: string;
  owner_id: string;
  org_id: string;
  project_id: string | null;
  site_id: string | null;
  resource_kind: string;
  resource_key: string;
  drive_file_id: string;
  spreadsheet_id: string;
  parent_folder_id: string;
  title: string;
  status: 'active' | 'legacy' | 'archived';
  canonical_revision?: number;
  last_operation_id?: string;
  created_at: string;
  updated_at: string;
}

export interface DatasetSpreadsheetRef {
  datasetKey: string;
  spreadsheetId: string;
  title: string;
}

export interface OnboardingLocalContext {
  siteId?: string;
  siteName?: string;
  portfolioSlug?: string;
  spreadsheetId?: string;
  spreadsheetName?: string;
  driveFolderId?: string;
  hasCustomPages?: boolean;
  pageCount?: number;
}

export interface OnboardingAmbiguity {
  code:
    | 'MULTIPLE_BUILLY_ROOT_FOLDERS'
    | 'LOCAL_AND_REMOTE_SLUG_MISMATCH'
    | 'MULTIPLE_LEGACY_SITES'
    | 'RESERVED_LEGACY_SLUG'
    | 'DRIVE_INSPECTION_UNAVAILABLE';
  message: string;
  candidates?: Array<{ id: string; label: string; slug?: string }>;
}

export interface OnboardingInspectionResult {
  existingOrganizationsCount: number;
  googleWorkspace: {
    connected: boolean;
    needsReauth: boolean;
    accountEmail: string;
  };
  unattachedRegistrySites: Array<{
    siteId: string;
    siteSlug: string;
    siteName: string;
    status: string;
    activePublishVersion: string;
    hasReservedSlug: boolean;
  }>;
  unattachedDatasetsCount: number;
  unattachedFormDestinationsCount: number;
  driveDiscovery: {
    inspected: boolean;
    rootFolders: Array<{ id: string; name: string }>;
    siteFolders: Array<{ id: string; name: string; parentFolderId: string }>;
    hasLegacyRegistryFile: boolean;
    legacyRegistryFileId?: string;
    hasLegacyCmsFolder: boolean;
    legacyCmsFolderId?: string;
    error?: string;
  };
  localDraftSummary: OnboardingLocalContext | null;
  suggestedOrgName: string;
  suggestedProjectName: string;
  proposedAttachments: Array<{
    kind: 'registry_site' | 'drive_root' | 'local_site_draft' | 'linked_spreadsheet';
    id: string;
    label: string;
    detail: string;
  }>;
  ambiguities: OnboardingAmbiguity[];
  requiresUserConfirmation: boolean;
}

export interface CompleteOnboardingInput {
  operationKey?: string;
  organizationName: string;
  projectName?: string;
  projectDescription?: string;
  enabledModules?: ProjectModuleKey[];
  attachSiteIds?: string[];
  driveRootFolderId?: string;
  legacySpreadsheetId?: string;
  legacySpreadsheetName?: string;
  localDraftSite?: {
    siteId?: string;
    siteSlug: string;
    siteName: string;
  };
}

export interface CompleteOnboardingResponse {
  ok: boolean;
  deduplicated?: boolean;
  organization: OrganizationRecord;
  project: ProjectRecord;
  attachedSitesCount: number;
}

export interface ConsoleBootstrapResponse {
  account: {
    ownerId: string;
    email: string;
  };
  needsOnboarding: boolean;
  googleWorkspace: {
    connected: boolean;
    needsReauth: boolean;
    account: {
      email: string;
      displayName: string;
      avatarUrl: string;
      googleSubject: string;
    } | null;
    grantedScopes: string[];
    updatedAt: string | null;
  };
  organizations: OrganizationRecord[];
  projects: ProjectRecord[];
  modules: ProjectModuleRecord[];
  sites: SiteRecord[];
  resources: WorkspaceResourceRecord[];
  unattachedLegacySites: Array<{
    siteId: string;
    siteSlug: string;
    siteName: string;
    status: string;
    activePublishVersion: string;
  }>;
  pendingRepairsCount?: number;
  needsReconciliationCount?: number;
  needsReconciliationOps?: Array<{
    operationId: string;
    operationType: string;
    updatedAt: string;
    error?: { code: string; message: string; retryable: boolean };
  }>;
  readOnly?: boolean;
  stale?: boolean;
  unavailable?: boolean;
  needsReconnect?: boolean;
  lastSyncedAt?: string | null;
  outageReason?: string | null;
}

export type OperationStatus =
  | 'pending'
  | 'in_progress'
  | 'retryable'
  | 'needs_reconciliation'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface OperationStepRecord {
  key: string;
  status: 'pending' | 'completed' | 'failed' | 'needs_reconciliation';
  resource_id?: string;
  drive_file_id?: string;
  parent_id?: string;
  attempts?: number;
  verified_at?: string;
  detail?: string;
}

export interface OperationJournalRecord {
  schema_version: 1;
  operation_id: string;
  operation_type: string;
  account_id: string;
  scope_key: string;
  payload_hash: string;
  status: OperationStatus;
  target: Record<string, string | undefined>;
  steps: OperationStepRecord[];
  discovered_ids: Record<string, string>;
  result?: unknown;
  error?: { code: string; message: string; retryable: boolean };
  fencing_token?: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectionRepairRecord {
  repair_id: string;
  owner_id: string;
  resource_type: string;
  resource_id: string;
  operation_id: string;
  canonical_revision: number;
  drive_file_id: string;
  attempts: number;
  status: 'pending' | 'completed' | 'failed';
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface D1RebuildSummary {
  ok: boolean;
  rootFolderId: string;
  organizationsRebuilt: number;
  projectsRebuilt: number;
  sitesRebuilt: number;
  publishedArtifactsRebuilt: number;
  resourcesRebuilt: number;
  rebuiltAt: string;
}

export interface OperationRecoveryResult {
  ok: boolean;
  operationId: string;
  status: OperationStatus;
  reconstructedFromMarkers?: boolean;
  message?: string;
}

export type ProjectDriveFolderKind =
  | 'project_root'
  | 'config_root'
  | 'config_draft'
  | 'config_published'
  | 'data_root'
  | 'data_cms'
  | 'data_inbox'
  | 'assets_root'
  | 'exports_root';

export interface ProjectDriveFileEntry {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export interface ProjectDriveProvisionResponse {
  ok: boolean;
  rootFolderId: string;
  orgFolderId: string;
  projectFolderId: string;
  folders: Record<ProjectDriveFolderKind, string>;
  resources: WorkspaceResourceRecord[];
  createdFoldersCount: number;
}

export interface LegacySpreadsheetPartition {
  sourceSpreadsheetId: string;
  sourceSpreadsheetTitle: string;
  sourceTab: string;
  domain: 'cms' | 'inbox';
  targetDatasetKey: string;
  targetSpreadsheetTitle: string;
  estimatedRowCount: number;
  alreadyMigrated: boolean;
}

export interface LegacyMigrationPlan {
  ok: boolean;
  workspaceConnected: boolean;
  driveInspected: boolean;
  driveError?: string;
  organizations: Array<{ org_id: string; name: string; org_slug: string }>;
  projects: Array<{
    project_id: string;
    org_id: string;
    name: string;
    project_slug: string;
    drive_folder_id: string;
  }>;
  unattachedSites: Array<{
    siteId: string;
    siteSlug: string;
    siteName: string;
    status: string;
    activePublishVersion: string;
    hasReservedSlug: boolean;
  }>;
  legacyResourcesCount: number;
  legacyResourceIds: string[];
  driveLegacy: {
    buillyRootFolders: Array<{ id: string; name: string }>;
    legacyRegistryFile: { id: string; name: string } | null;
    legacyCmsFolder: { id: string; name: string } | null;
    legacySiteFolders: Array<{ id: string; name: string; parentFolderId: string }>;
  };
  spreadsheetPartitions: LegacySpreadsheetPartition[];
  localDraftSummary: OnboardingLocalContext | null;
  ambiguities: Array<{ code: string; message: string }>;
  hasPendingMigration: boolean;
}

export interface MigrationVerificationCheck {
  id: string;
  label: string;
  category: 'sites' | 'drive' | 'sheets' | 'local';
  status: 'pass' | 'warning';
  detail: string;
  sourceCount?: number;
  migratedCount?: number;
}

export interface LegacyMigrationExecuteInput {
  operationKey?: string;
  targetOrgId: string;
  strategy: 'attach_to_project' | 'create_new_project';
  targetProjectId?: string;
  newProjectName?: string;
  attachSiteIds: string[];
  partitionSpreadsheets?: Array<{
    sourceSpreadsheetId: string;
    sourceTab: string;
    domain: 'cms' | 'inbox';
    targetDatasetKey: string;
  }>;
  copyLegacyDriveConfigs?: boolean;
  localDraftSite?: { siteId?: string; siteSlug: string; siteName: string } | null;
}

export interface LegacyMigrationExecuteResult {
  ok: boolean;
  deduplicated?: boolean;
  targetOrgId: string;
  targetProjectId: string;
  project: ProjectRecord;
  attachedSitesCount: number;
  partitionedDatasets: Array<{
    domain: 'cms' | 'inbox';
    datasetKey: string;
    sourceSpreadsheetId: string;
    sourceTab: string;
    targetSpreadsheetId: string;
    parentFolderId: string;
    rowCount: number;
  }>;
  legacyBackupFiles: Array<{
    sourceName: string;
    backupFileId: string;
    backupFileName: string;
  }>;
  reconciliation: {
    passed: boolean;
    verifiedAt: string;
    checks: MigrationVerificationCheck[];
  };
}

export interface LegacyMigrationCleanupResult {
  ok: boolean;
  deduplicated?: boolean;
  archivedResourcesCount: number;
  remainingLegacySitesCount: number;
  driveBackupsPreserved: boolean;
  completedAt: string;
}


