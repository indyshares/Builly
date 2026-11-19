import { WorkerEnv } from '../types';
import {
  DRIVE_FOLDER_MIME,
  ensureMarkerFolder,
  findBuillyRootCandidates,
  findDriveChildren,
  getDriveFileMeta,
  readDriveJsonWithConcurrency,
  verifyDriveParent,
  writeCanonicalDriveJson,
} from './driveCanonicalClient';
import { generateOperationId } from './operationJournalService';
import { BuillyTransactionError } from './transactionErrors';

export const ACCOUNT_MANIFEST_FILENAME = 'account-manifest.json';
export const ORGANIZATIONS_INDEX_FILENAME = 'organizations-index.json';
export const RESOURCE_REGISTRY_FILENAME = 'resource-registry.json';
export const ORGANIZATION_MANIFEST_FILENAME = 'organization.json';
export const PROJECTS_INDEX_FILENAME = 'projects-index.json';
export const PROJECT_MANIFEST_FILENAME = 'project.json';
export const PROJECT_MODULES_FILENAME = 'modules.json';
export const PROJECT_CONFIG_FILENAME = 'project-config.json';
export const SITE_MANIFEST_FILENAME = 'site.json';
export const SITE_CONFIG_FILENAME = 'site-config.json';

export interface AccountManifestDoc {
  schema_version: 1;
  builly_account_id: string;
  root_folder_id: string;
  system_folder_id: string;
  operations_folder_id: string;
  organizations_folder_id: string;
  organization_ids: string[];
  revision: number;
  last_operation_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationsIndexEntry {
  organization_id: string;
  name: string;
  slug: string;
  status: 'active' | 'archived' | 'deleted';
  folder_id: string;
  projects_folder_id: string;
  manifest_file_id: string;
  revision: number;
  updated_at: string;
}

export interface OrganizationsIndexDoc {
  schema_version: 1;
  builly_account_id: string;
  organizations: OrganizationsIndexEntry[];
  revision: number;
  last_operation_id: string;
  updated_at: string;
}

export interface CanonicalResourceRegistryEntry {
  resource_id: string;
  owner_type: 'account' | 'organization' | 'project' | 'site';
  owner_id: string;
  org_id: string;
  project_id: string | null;
  site_id: string | null;
  resource_type: string;
  resource_key: string;
  drive_file_id: string;
  spreadsheet_id: string;
  parent_folder_id: string;
  title: string;
  mime_type: string;
  schema_version: number;
  status: 'active' | 'legacy' | 'archived' | 'deleted';
  revision: number;
  updated_at: string;
}

export interface ResourceRegistryDoc {
  schema_version: 1;
  builly_account_id: string;
  resources: CanonicalResourceRegistryEntry[];
  revision: number;
  last_operation_id: string;
  updated_at: string;
}

export interface OrganizationManifestDoc {
  schema_version: 1;
  organization_id: string;
  owner_account_id: string;
  name: string;
  slug: string;
  status: 'active' | 'archived' | 'deleted';
  folder_id: string;
  projects_folder_id: string;
  projects_index_file_id: string;
  revision: number;
  last_operation_id: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectsIndexEntry {
  project_id: string;
  name: string;
  slug: string;
  status: 'active' | 'archived' | 'deleted';
  folder_id: string;
  manifest_file_id: string;
  revision: number;
  updated_at: string;
}

export interface OrganizationProjectsIndexDoc {
  schema_version: 1;
  organization_id: string;
  projects: ProjectsIndexEntry[];
  revision: number;
  last_operation_id: string;
  updated_at: string;
}

export interface ProjectManifestDoc {
  schema_version: 1;
  project_id: string;
  organization_id: string;
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'archived' | 'deleted';
  folder_id: string;
  config_folder_id: string;
  config_draft_folder_id: string;
  config_published_folder_id: string;
  sites_folder_id: string;
  data_folder_id: string;
  data_cms_folder_id: string;
  data_inbox_folder_id: string;
  assets_folder_id: string;
  exports_folder_id: string;
  enabled_module_keys: string[];
  revision: number;
  last_operation_id: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectModulesManifestDoc {
  schema_version: 1;
  project_id: string;
  modules: Record<string, { enabled: boolean; config_ref?: string }>;
  revision: number;
  last_operation_id: string;
  updated_at: string;
}

export interface SiteManifestDoc {
  schema_version: 1;
  site_id: string;
  project_id: string;
  organization_id: string;
  site_slug: string;
  site_name: string;
  custom_domain: string | null;
  status: 'draft' | 'published' | 'suspended' | 'archived';
  active_publish_version_id: string | null;
  active_build_id: string;
  site_config_file_id: string;
  published_folder_id: string;
  folder_id: string;
  revision: number;
  last_operation_id: string;
  created_at: string;
  updated_at: string;
}

export interface AccountDriveBootstrapResult {
  rootFolderId: string;
  systemFolderId: string;
  operationsFolderId: string;
  organizationsFolderId: string;
  accountManifestFileId: string;
  accountManifest: AccountManifestDoc;
  organizationsIndexFileId: string;
  organizationsIndex: OrganizationsIndexDoc;
  resourceRegistryFileId: string;
  resourceRegistry: ResourceRegistryDoc;
}

async function readStoredAccountResourceId(
  db: D1Database,
  ownerId: string,
  resourceKind: string
): Promise<string> {
  try {
    const row = await db
      .prepare(
        `SELECT drive_file_id FROM workspace_resources
         WHERE owner_id = ? AND resource_kind = ? AND status = 'active'
         ORDER BY updated_at DESC LIMIT 1`
      )
      .bind(ownerId, resourceKind)
      .first<{ drive_file_id: string }>();
    return row?.drive_file_id || '';
  } catch {
    return '';
  }
}

export async function bootstrapAccountDrive(
  env: WorkerEnv,
  accessToken: string,
  ownerId: string,
  options?: {
    selectedRootFolderId?: string;
    operationId?: string;
  }
): Promise<AccountDriveBootstrapResult> {
  const operationId = options?.operationId || generateOperationId('op_boot');
  const nowIso = new Date().toISOString();

  // 1. Discover Builly root using trusted appProperties + 'root' in parents
  let rootFolderId = options?.selectedRootFolderId?.trim() || '';
  if (!rootFolderId) {
    rootFolderId = await readStoredAccountResourceId(env.DB, ownerId, 'builly_root');
  }

  if (rootFolderId) {
    try {
      const meta = await getDriveFileMeta(accessToken, rootFolderId, operationId);
      if (meta.trashed || meta.mimeType !== DRIVE_FOLDER_MIME) {
        rootFolderId = '';
      }
    } catch {
      rootFolderId = '';
    }
  }

  if (!rootFolderId) {
    const candidates = await findBuillyRootCandidates(accessToken, operationId);
    if (candidates.length > 1) {
      throw new BuillyTransactionError(
        'DUPLICATE_RESOURCE_CANDIDATES',
        'Multiple "Builly" root folders were found in your Google Drive. Select the canonical root folder to continue.',
        {
          operationId,
          details: {
            needsReconciliation: true,
            candidates: candidates.map((c) => ({ id: c.id, name: c.name, parents: c.parents })),
          },
        }
      );
    }
    if (candidates.length === 1) {
      rootFolderId = candidates[0].id;
    } else {
      const createdRoot = await ensureMarkerFolder(accessToken, {
        parentId: 'root',
        name: 'Builly',
        operationId,
        appProperties: {
          builly_root: 'true',
          operation_id: operationId,
          resource_id: ownerId,
          resource_type: 'builly_root',
          schema_version: '1',
        },
      });
      rootFolderId = createdRoot.folder.id;
    }
  }

  // 2. Ensure System/, System/Operations/, Organizations/ inside verified Builly root
  const systemFolder = await ensureMarkerFolder(accessToken, {
    parentId: rootFolderId,
    name: 'System',
    operationId,
    appProperties: {
      operation_id: operationId,
      resource_id: `${ownerId}:system`,
      resource_type: 'system_folder',
      schema_version: '1',
    },
  });

  const operationsFolder = await ensureMarkerFolder(accessToken, {
    parentId: systemFolder.folder.id,
    name: 'Operations',
    operationId,
    appProperties: {
      operation_id: operationId,
      resource_id: `${ownerId}:operations`,
      resource_type: 'operations_folder',
      schema_version: '1',
    },
  });

  const organizationsFolder = await ensureMarkerFolder(accessToken, {
    parentId: rootFolderId,
    name: 'Organizations',
    operationId,
    appProperties: {
      operation_id: operationId,
      resource_id: `${ownerId}:organizations`,
      resource_type: 'organizations_folder',
      schema_version: '1',
    },
  });

  // 3. Load or initialize System/account-manifest.json
  let accountManifestFileId = '';
  let accountManifest: AccountManifestDoc | null = null;
  const manifestMatches = await findDriveChildren(accessToken, {
    parentId: systemFolder.folder.id,
    name: ACCOUNT_MANIFEST_FILENAME,
    operationId,
  });
  if (manifestMatches.length > 1) {
    throw new BuillyTransactionError(
      'DUPLICATE_RESOURCE_CANDIDATES',
      'Multiple account-manifest.json files found in System folder.',
      {
        operationId,
        details: {
          parentId: systemFolder.folder.id,
          needsReconciliation: true,
          candidates: manifestMatches.map((m) => ({ id: m.id, name: m.name, parents: m.parents })),
        },
      }
    );
  }
  if (manifestMatches.length === 1) {
    accountManifestFileId = manifestMatches[0].id;
    const read = await readDriveJsonWithConcurrency<AccountManifestDoc>(
      accessToken,
      accountManifestFileId,
      operationId
    );
    accountManifest = read.data;
  } else {
    accountManifest = {
      schema_version: 1,
      builly_account_id: ownerId,
      root_folder_id: rootFolderId,
      system_folder_id: systemFolder.folder.id,
      operations_folder_id: operationsFolder.folder.id,
      organizations_folder_id: organizationsFolder.folder.id,
      organization_ids: [],
      revision: 1,
      last_operation_id: operationId,
      created_at: nowIso,
      updated_at: nowIso,
    };
    const saved = await writeCanonicalDriveJson(accessToken, {
      parentId: systemFolder.folder.id,
      fileName: ACCOUNT_MANIFEST_FILENAME,
      payload: accountManifest as unknown as Record<string, unknown>,
      operationId,
      appProperties: {
        operation_id: operationId,
        resource_id: ownerId,
        resource_type: 'account_manifest',
        schema_version: '1',
      },
    });
    accountManifestFileId = saved.fileId;
  }

  // 4. Load or initialize System/organizations-index.json
  let organizationsIndexFileId = '';
  let organizationsIndex: OrganizationsIndexDoc | null = null;
  const orgIdxMatches = await findDriveChildren(accessToken, {
    parentId: systemFolder.folder.id,
    name: ORGANIZATIONS_INDEX_FILENAME,
    operationId,
  });
  if (orgIdxMatches.length > 1) {
    throw new BuillyTransactionError(
      'DUPLICATE_RESOURCE_CANDIDATES',
      'Multiple organizations-index.json files found in System folder.',
      {
        operationId,
        details: {
          parentId: systemFolder.folder.id,
          needsReconciliation: true,
          candidates: orgIdxMatches.map((m) => ({ id: m.id, name: m.name, parents: m.parents })),
        },
      }
    );
  }
  if (orgIdxMatches.length === 1) {
    organizationsIndexFileId = orgIdxMatches[0].id;
    const read = await readDriveJsonWithConcurrency<OrganizationsIndexDoc>(
      accessToken,
      organizationsIndexFileId,
      operationId
    );
    organizationsIndex = read.data;
  } else {
    organizationsIndex = {
      schema_version: 1,
      builly_account_id: ownerId,
      organizations: [],
      revision: 1,
      last_operation_id: operationId,
      updated_at: nowIso,
    };
    const saved = await writeCanonicalDriveJson(accessToken, {
      parentId: systemFolder.folder.id,
      fileName: ORGANIZATIONS_INDEX_FILENAME,
      payload: organizationsIndex as unknown as Record<string, unknown>,
      operationId,
      appProperties: {
        operation_id: operationId,
        resource_id: `${ownerId}:organizations_index`,
        resource_type: 'organizations_index',
        schema_version: '1',
      },
    });
    organizationsIndexFileId = saved.fileId;
  }

  // 5. Load or initialize System/resource-registry.json
  let resourceRegistryFileId = '';
  let resourceRegistry: ResourceRegistryDoc | null = null;
  const regMatches = await findDriveChildren(accessToken, {
    parentId: systemFolder.folder.id,
    name: RESOURCE_REGISTRY_FILENAME,
    operationId,
  });
  if (regMatches.length > 1) {
    throw new BuillyTransactionError(
      'DUPLICATE_RESOURCE_CANDIDATES',
      'Multiple resource-registry.json files found in System folder.',
      {
        operationId,
        details: {
          parentId: systemFolder.folder.id,
          needsReconciliation: true,
          candidates: regMatches.map((m) => ({ id: m.id, name: m.name, parents: m.parents })),
        },
      }
    );
  }
  if (regMatches.length === 1) {
    resourceRegistryFileId = regMatches[0].id;
    const read = await readDriveJsonWithConcurrency<ResourceRegistryDoc>(
      accessToken,
      resourceRegistryFileId,
      operationId
    );
    resourceRegistry = read.data;
  } else {
    resourceRegistry = {
      schema_version: 1,
      builly_account_id: ownerId,
      resources: [],
      revision: 1,
      last_operation_id: operationId,
      updated_at: nowIso,
    };
    const saved = await writeCanonicalDriveJson(accessToken, {
      parentId: systemFolder.folder.id,
      fileName: RESOURCE_REGISTRY_FILENAME,
      payload: resourceRegistry as unknown as Record<string, unknown>,
      operationId,
      appProperties: {
        operation_id: operationId,
        resource_id: `${ownerId}:resource_registry`,
        resource_type: 'resource_registry',
        schema_version: '1',
      },
    });
    resourceRegistryFileId = saved.fileId;
  }

  return {
    rootFolderId,
    systemFolderId: systemFolder.folder.id,
    operationsFolderId: operationsFolder.folder.id,
    organizationsFolderId: organizationsFolder.folder.id,
    accountManifestFileId,
    accountManifest,
    organizationsIndexFileId,
    organizationsIndex,
    resourceRegistryFileId,
    resourceRegistry,
  };
}

export async function upsertCanonicalResourceRegistryEntry(
  accessToken: string,
  params: {
    systemFolderId: string;
    registryFileId?: string;
    ownerAccountId: string;
    operationId: string;
    entry: Omit<CanonicalResourceRegistryEntry, 'revision' | 'updated_at'>;
  }
): Promise<{ fileId: string; registry: ResourceRegistryDoc }> {
  let fileId = params.registryFileId || '';
  let current: ResourceRegistryDoc | null = null;
  let currentEtag: string | undefined;

  if (fileId) {
    await verifyDriveParent(accessToken, fileId, params.systemFolderId, params.operationId);
    const read = await readDriveJsonWithConcurrency<ResourceRegistryDoc>(
      accessToken,
      fileId,
      params.operationId
    );
    current = read.data;
    currentEtag = read.meta.etag;
  } else {
    const matches = await findDriveChildren(accessToken, {
      parentId: params.systemFolderId,
      name: RESOURCE_REGISTRY_FILENAME,
      operationId: params.operationId,
    });
    if (matches.length > 1) {
      throw new BuillyTransactionError(
        'DUPLICATE_RESOURCE_CANDIDATES',
        'Multiple resource-registry.json files found.',
        {
          operationId: params.operationId,
          details: {
            needsReconciliation: true,
            candidates: matches.map((m) => ({ id: m.id, name: m.name, parents: m.parents })),
          },
        }
      );
    }
    if (matches.length === 1) {
      fileId = matches[0].id;
      const read = await readDriveJsonWithConcurrency<ResourceRegistryDoc>(
        accessToken,
        fileId,
        params.operationId
      );
      current = read.data;
      currentEtag = read.meta.etag;
    }
  }

  const nowIso = new Date().toISOString();
  const baseList = current?.resources || [];
  const idx = baseList.findIndex(
    (r) =>
      r.resource_id === params.entry.resource_id ||
      (r.org_id === params.entry.org_id &&
        r.project_id === params.entry.project_id &&
        r.resource_type === params.entry.resource_type &&
        r.resource_key === params.entry.resource_key)
  );

  const nextResources = [...baseList];
  if (idx >= 0) {
    nextResources[idx] = {
      ...nextResources[idx],
      ...params.entry,
      resource_id: nextResources[idx].resource_id,
      revision: (nextResources[idx].revision || 0) + 1,
      updated_at: nowIso,
    };
  } else {
    nextResources.push({
      ...params.entry,
      revision: 1,
      updated_at: nowIso,
    });
  }

  const expectedRevision = current ? current.revision : undefined;
  const nextDoc: ResourceRegistryDoc = {
    schema_version: 1,
    builly_account_id: params.ownerAccountId,
    resources: nextResources,
    revision: current ? current.revision + 1 : 1,
    last_operation_id: params.operationId,
    updated_at: nowIso,
  };

  const saved = await writeCanonicalDriveJson(accessToken, {
    parentId: params.systemFolderId,
    fileName: RESOURCE_REGISTRY_FILENAME,
    payload: nextDoc as unknown as Record<string, unknown>,
    knownFileId: fileId || undefined,
    expectedRevision,
    expectedEtag: currentEtag,
    operationId: params.operationId,
    appProperties: {
      operation_id: params.operationId,
      resource_id: `${params.ownerAccountId}:resource_registry`,
      resource_type: 'resource_registry',
      schema_version: '1',
    },
  });

  return { fileId: saved.fileId, registry: nextDoc };
}
