import { SiteDocument } from '../types/builder';
import { CmsDocument } from '../types/cms';
import { escapeSheetFormulaCell } from './cms/cmsValidation';
import { ensurePortfolioDriveFolder } from './drivePageRegistryService';
import { resolvePageFullPath } from './pageService';
import {
  PublishedRuntimeSnapshot,
  PublishManifest,
} from './runtime/publishedSnapshotContract';

export interface PartitionedSpreadsheetSpec {
  domain: 'cms' | 'inbox' | 'system';
  datasetKey: string;
  spreadsheetTitle: string;
  worksheetTitle: string;
  headers: string[];
  rows: string[][];
}

export interface PartitionPlan {
  siteSlug: string;
  operationId: string;
  cmsDatasets: PartitionedSpreadsheetSpec[];
  inboxDatasets: PartitionedSpreadsheetSpec[];
  systemDatasets: PartitionedSpreadsheetSpec[];
  skippedDisabledContentTypes: string[];
}

export interface ProvisionedResourceEntry {
  resourceId: string;
  domain: 'cms' | 'inbox' | 'system';
  datasetKey: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  worksheetName: string;
  rowsWritten: number;
  status: 'verified' | 'partial_error';
  error?: string;
}

export interface DrivePublishUploadResult {
  folderId: string;
  publishedFolderId: string;
  runtimeConfigDriveFileId: string;
  manifestDriveFileId: string;
  verifiedReadback: boolean;
}

async function driveJsonRequest<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Google Workspace API (${res.status}): ${errText.slice(0, 220)}`);
  }
  return res.json() as Promise<T>;
}

async function ensureFolderPath(
  accessToken: string,
  rootFolderId: string,
  segments: string[]
): Promise<string> {
  let parentId = rootFolderId;
  for (const rawSeg of segments) {
    const seg = rawSeg.trim();
    if (!seg) continue;
    const escaped = seg.replace(/'/g, "\\'");
    const q = encodeURIComponent(
      `'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    );
    const list = await driveJsonRequest<{ files?: { id: string }[] }>(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
      accessToken
    );
    if (list.files?.[0]?.id) {
      parentId = list.files[0].id;
      continue;
    }
    const created = await driveJsonRequest<{ id: string }>(
      'https://www.googleapis.com/drive/v3/files?fields=id',
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: seg,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        }),
      }
    );
    parentId = created.id;
  }
  return parentId;
}

async function findFileInFolder(
  accessToken: string,
  folderId: string,
  fileName: string
): Promise<string | null> {
  const escaped = fileName.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${folderId}' in parents and name = '${escaped}' and trashed = false`
  );
  const res = await driveJsonRequest<{ files?: { id: string }[] }>(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    accessToken
  );
  return res.files?.[0]?.id || null;
}

async function upsertJsonFileInFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  payload: unknown
): Promise<string> {
  const existingId = await findFileInFolder(accessToken, folderId, fileName);
  const metadata = existingId
    ? { name: fileName }
    : { name: fileName, mimeType: 'application/json', parents: [folderId] };
  const boundary = `builly_json_${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(payload, null, 2)}\r\n--${boundary}--`;

  const url = existingId
    ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id`
    : 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';

  const res = await driveJsonRequest<{ id: string }>(url, accessToken, {
    method: existingId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  return res.id;
}

/**
 * Inspects the active SiteDocument + CmsDocument and produces a non-destructive partitioning plan:
 * - Separate spreadsheets per enabled & actively used CMS content type (skips disabled/empty types)
 * - Separate spreadsheets for Inbox domain (Submissions, SubmissionFields, InboxCategories, InboxNotes, InboxActivity)
 * - Separate spreadsheets for System registry (Sites, SiteDomains, SheetResources, DriveFolders, SyncJobs, AuditEvents)
 */
export function buildPartitionPlan(site: SiteDocument, cms?: CmsDocument): PartitionPlan {
  const siteSlug = (site.portfolioSlug || 'default-site').toLowerCase();
  const operationId = `part_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const cmsDatasets: PartitionedSpreadsheetSpec[] = [];
  const skippedDisabledContentTypes: string[] = [];

  if (cms) {
    for (const ct of cms.contentTypes) {
      const records = cms.records.filter((r) => r.contentTypeId === ct.id && r.status !== 'trash');
      if (!ct.enabled || (!ct.isBuiltIn && records.length === 0)) {
        skippedDisabledContentTypes.push(ct.id);
        continue;
      }
      const fieldKeys = ct.fields.map((f) => f.key);
      const headers = [
        'record_id',
        'site_id',
        'status',
        'slug',
        'title',
        'created_at',
        'updated_at',
        'published_at',
        'sort_order',
        ...fieldKeys,
      ];
      const rows = records.map((rec) => [
        rec.recordId,
        site.id,
        rec.status,
        rec.slug,
        escapeSheetFormulaCell(rec.title),
        rec.createdAt,
        rec.updatedAt,
        rec.publishedAt || '',
        String(rec.sortOrder ?? 0),
        ...fieldKeys.map((fk) => {
          const val = rec.fields[fk];
          if (val === undefined || val === null) return '';
          if (typeof val === 'object') return escapeSheetFormulaCell(JSON.stringify(val));
          return escapeSheetFormulaCell(String(val));
        }),
      ]);

      cmsDatasets.push({
        domain: 'cms',
        datasetKey: `cms_${ct.id}`,
        spreadsheetTitle: `${ct.pluralLabel || ct.slug} (${siteSlug})`,
        worksheetTitle: ct.sheetTableId || `CMS_REC_${ct.id.toUpperCase()}`,
        headers,
        rows,
      });
    }

    if ((cms.terms || []).length > 0 || (cms.taxonomies || []).length > 0) {
      cmsDatasets.push({
        domain: 'cms',
        datasetKey: 'cms_taxonomies',
        spreadsheetTitle: `Categories & Tags (${siteSlug})`,
        worksheetTitle: 'TAXONOMY_TERMS',
        headers: ['term_id', 'taxonomy_id', 'name', 'slug', 'parent_term_id', 'sort_order'],
        rows: (cms.terms || []).map((t) => [
          t.termId,
          t.taxonomyId,
          escapeSheetFormulaCell(t.name),
          t.slug,
          t.parentTermId || '',
          String(t.sortOrder ?? 0),
        ]),
      });
    }
  }

  const submissions = cms?.inboxSubmissions || [];
  const submissionFieldRows: string[][] = [];
  submissions.forEach((sub) => {
    Object.entries(sub.fields || {}).forEach(([k, v]) => {
      submissionFieldRows.push([
        sub.submission_id,
        sub.inbox_item_id,
        escapeSheetFormulaCell(k),
        escapeSheetFormulaCell(typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')),
        sub.submitted_at,
      ]);
    });
  });

  const inboxDatasets: PartitionedSpreadsheetSpec[] = [
    {
      domain: 'inbox',
      datasetKey: 'inbox_submissions',
      spreadsheetTitle: `Submissions (${siteSlug})`,
      worksheetTitle: 'SUBMISSIONS',
      headers: [
        'inbox_item_id',
        'submission_id',
        'site_id',
        'form_id',
        'form_name_snapshot',
        'category_id',
        'read_status',
        'starred',
        'archived',
        'spam_status',
        'submitted_at',
        'source_page',
      ],
      rows: submissions.map((s) => [
        s.inbox_item_id,
        s.submission_id,
        s.site_id,
        s.form_id,
        escapeSheetFormulaCell(s.form_name_snapshot),
        s.category_id,
        s.read_status,
        String(Boolean(s.starred)),
        String(Boolean(s.archived)),
        s.spam_status,
        s.submitted_at,
        escapeSheetFormulaCell(s.source_page),
      ]),
    },
    {
      domain: 'inbox',
      datasetKey: 'inbox_submission_fields',
      spreadsheetTitle: `SubmissionFields (${siteSlug})`,
      worksheetTitle: 'SUBMISSION_FIELDS',
      headers: ['submission_id', 'inbox_item_id', 'field_key', 'field_value', 'submitted_at'],
      rows: submissionFieldRows,
    },
    {
      domain: 'inbox',
      datasetKey: 'inbox_categories',
      spreadsheetTitle: `InboxCategories (${siteSlug})`,
      worksheetTitle: 'INBOX_CATEGORIES',
      headers: ['category_id', 'site_id', 'name', 'description', 'color', 'is_default', 'created_at'],
      rows: (cms?.inboxCategories || []).map((c) => [
        c.category_id,
        c.site_id || site.id,
        escapeSheetFormulaCell(c.name),
        escapeSheetFormulaCell(c.description),
        c.color,
        String(Boolean(c.is_default)),
        c.created_at,
      ]),
    },
    {
      domain: 'inbox',
      datasetKey: 'inbox_notes',
      spreadsheetTitle: `InboxNotes (${siteSlug})`,
      worksheetTitle: 'INBOX_NOTES',
      headers: ['note_id', 'inbox_item_id', 'author_id', 'note_content', 'created_at', 'updated_at'],
      rows: (cms?.inboxNotes || []).map((n) => [
        n.note_id,
        n.inbox_item_id,
        n.author_id,
        escapeSheetFormulaCell(n.note_content),
        n.created_at,
        n.updated_at,
      ]),
    },
    {
      domain: 'inbox',
      datasetKey: 'inbox_activity',
      spreadsheetTitle: `InboxActivity (${siteSlug})`,
      worksheetTitle: 'INBOX_ACTIVITY',
      headers: ['activity_id', 'inbox_item_id', 'action', 'previous_value', 'new_value', 'actor_id', 'created_at'],
      rows: (cms?.inboxActivities || []).map((a) => [
        a.activity_id,
        a.inbox_item_id,
        a.action,
        escapeSheetFormulaCell(a.previous_value || ''),
        escapeSheetFormulaCell(a.new_value || ''),
        a.actor_id,
        a.created_at,
      ]),
    },
  ];

  const nowIso = new Date().toISOString();
  const systemDatasets: PartitionedSpreadsheetSpec[] = [
    {
      domain: 'system',
      datasetKey: 'system_sites',
      spreadsheetTitle: 'Sites',
      worksheetTitle: 'SITES',
      headers: ['site_id', 'site_slug', 'site_name', 'active_release_version', 'status', 'updated_at'],
      rows: [
        [
          site.id,
          siteSlug,
          escapeSheetFormulaCell(site.name),
          site.activeReleaseVersion || '',
          site.activeReleaseVersion ? 'published' : 'draft',
          nowIso,
        ],
      ],
    },
    {
      domain: 'system',
      datasetKey: 'system_sheet_resources',
      spreadsheetTitle: 'SheetResources',
      worksheetTitle: 'SHEET_RESOURCES',
      headers: [
        'resource_id',
        'site_id',
        'domain',
        'dataset_key',
        'spreadsheet_id',
        'worksheet_name',
        'schema_version',
        'status',
        'updated_at',
      ],
      rows: [],
    },
    {
      domain: 'system',
      datasetKey: 'system_sync_jobs',
      spreadsheetTitle: 'SyncJobs',
      worksheetTitle: 'SYNC_JOBS',
      headers: ['operation_id', 'site_id', 'operation_type', 'status', 'detail', 'created_at'],
      rows: [
        [operationId, site.id, 'partition_plan', 'planned', `Prepared ${cmsDatasets.length} CMS + ${inboxDatasets.length} Inbox spreadsheets`, nowIso],
      ],
    },
  ];

  return {
    siteSlug,
    operationId,
    cmsDatasets,
    inboxDatasets,
    systemDatasets,
    skippedDisabledContentTypes,
  };
}

/**
 * Saves immutable Published Configuration Snapshot (`runtime-config.json` + `publish-manifest.json`)
 * directly into Google Drive under `Builly/Sites/{site-slug}/Config/Published/{buildId}/`
 * and verifies readback before returning real Drive File IDs.
 */
export async function publishSnapshotToGoogleDrive(params: {
  accessToken: string;
  driveFolderId?: string;
  snapshot: PublishedRuntimeSnapshot;
  manifest: PublishManifest;
}): Promise<DrivePublishUploadResult> {
  const { accessToken, snapshot, manifest } = params;
  const rootFolderId = await ensurePortfolioDriveFolder(accessToken, params.driveFolderId);
  const publishedFolderId = await ensureFolderPath(accessToken, rootFolderId, [
    'Sites',
    snapshot.siteSlug || 'default-site',
    'Config',
    'Published',
    snapshot.buildId,
  ]);

  const runtimeConfigDriveFileId = await upsertJsonFileInFolder(
    accessToken,
    publishedFolderId,
    'runtime-config.json',
    snapshot
  );

  const finalManifest: PublishManifest = {
    ...manifest,
    runtimeConfigDriveFileId,
  };

  const manifestDriveFileId = await upsertJsonFileInFolder(
    accessToken,
    publishedFolderId,
    'publish-manifest.json',
    finalManifest
  );

  // Verify readback of immutable snapshot before declaring success
  const verifyRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(runtimeConfigDriveFileId)}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!verifyRes.ok) {
    throw new Error(`Published snapshot readback verification failed (${verifyRes.status}).`);
  }
  const readBack = (await verifyRes.json()) as { buildId?: string; integrityHash?: string };
  const verifiedReadback = readBack.buildId === snapshot.buildId;
  if (!verifiedReadback) {
    throw new Error('Published snapshot readback integrity mismatch.');
  }

  return {
    folderId: rootFolderId,
    publishedFolderId,
    runtimeConfigDriveFileId,
    manifestDriveFileId,
    verifiedReadback,
  };
}

/**
 * Syncs editable Builder Draft config into the target partitioned layout
 * `Builly/Sites/{site-slug}/Config/Draft/` without deleting legacy files.
 */
export async function syncDraftConfigToPartitionedDrive(params: {
  accessToken: string;
  site: SiteDocument;
  driveFolderId?: string;
}): Promise<{ folderId: string; draftFolderId: string; syncedFiles: string[] }> {
  const { accessToken, site } = params;
  const rootFolderId = await ensurePortfolioDriveFolder(accessToken, params.driveFolderId);
  const slug = site.portfolioSlug || 'default-site';
  const draftFolderId = await ensureFolderPath(accessToken, rootFolderId, [
    'Sites',
    slug,
    'Config',
    'Draft',
  ]);
  const pagesFolderId = await ensureFolderPath(accessToken, draftFolderId, ['pages']);
  const syncedFiles: string[] = [];

  await upsertJsonFileInFolder(accessToken, draftFolderId, 'site.config.json', {
    id: site.id,
    name: site.name,
    portfolioSlug: site.portfolioSlug,
    activePageId: site.activePageId,
    activeReleaseVersion: site.activeReleaseVersion,
    pageRegistryRevision: site.pageRegistryRevision ?? 1,
    updatedAt: new Date().toISOString(),
  });
  syncedFiles.push('site.config.json');

  await upsertJsonFileInFolder(accessToken, draftFolderId, 'theme.json', {
    activeThemeId: site.activeThemeId,
    themeConfig: site.themeConfig,
    customThemes: site.customThemes,
    themeCustomizations: site.themeCustomizations,
  });
  syncedFiles.push('theme.json');

  await upsertJsonFileInFolder(accessToken, draftFolderId, 'components.json', {
    globalComponents: site.globalComponents,
    libraryItems: site.libraryItems,
  });
  syncedFiles.push('components.json');

  await upsertJsonFileInFolder(accessToken, draftFolderId, 'cms-bindings.json', {
    contentTypes: site.cms?.contentTypes || [],
    taxonomies: site.cms?.taxonomies || [],
    relationships: site.cms?.relationships || [],
    settings: site.cms?.settings,
  });
  syncedFiles.push('cms-bindings.json');

  await upsertJsonFileInFolder(accessToken, draftFolderId, 'forms.json', {
    forms: site.cms?.forms || [],
  });
  syncedFiles.push('forms.json');

  for (const page of site.pages) {
    const cleanPath = resolvePageFullPath(page, site.pages)
      .replace(/^\/+/, '')
      .replace(/\//g, '__') || 'home';
    const fileName = `${cleanPath}.json`;
    await upsertJsonFileInFolder(accessToken, pagesFolderId, fileName, page);
    syncedFiles.push(`pages/${fileName}`);
  }

  return { folderId: rootFolderId, draftFolderId, syncedFiles };
}

/**
 * Provisions separated Google Spreadsheets under `Builly/Data/CMS/{site}`,
 * `Builly/Data/Inbox/{site}`, and `Builly/Data/System` with deterministic ordering
 * and partial-failure tracking. Never modifies or deletes legacy workbooks.
 */
export async function provisionPartitionedSpreadsheets(params: {
  accessToken: string;
  site: SiteDocument;
  driveFolderId?: string;
}): Promise<{
  operationId: string;
  resources: ProvisionedResourceEntry[];
  errors: string[];
}> {
  const { accessToken, site } = params;
  const plan = buildPartitionPlan(site, site.cms);
  const rootFolderId = await ensurePortfolioDriveFolder(accessToken, params.driveFolderId);

  const cmsFolderId = await ensureFolderPath(accessToken, rootFolderId, ['Data', 'CMS', plan.siteSlug]);
  const inboxFolderId = await ensureFolderPath(accessToken, rootFolderId, ['Data', 'Inbox', plan.siteSlug]);
  const systemFolderId = await ensureFolderPath(accessToken, rootFolderId, ['Data', 'System']);

  const folderByDomain = {
    cms: cmsFolderId,
    inbox: inboxFolderId,
    system: systemFolderId,
  } as const;

  const allSpecs = [...plan.cmsDatasets, ...plan.inboxDatasets, ...plan.systemDatasets];
  const resources: ProvisionedResourceEntry[] = [];
  const errors: string[] = [];

  for (const spec of allSpecs) {
    const targetFolderId = folderByDomain[spec.domain];
    try {
      let spreadsheetId = await findFileInFolder(accessToken, targetFolderId, spec.spreadsheetTitle);
      let spreadsheetUrl = '';

      if (!spreadsheetId) {
        const created = await driveJsonRequest<{
          spreadsheetId: string;
          spreadsheetUrl: string;
        }>('https://sheets.googleapis.com/v4/spreadsheets', accessToken, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: { title: spec.spreadsheetTitle },
            sheets: [{ properties: { title: spec.worksheetTitle, gridProperties: { frozenRowCount: 1 } } }],
          }),
        });
        spreadsheetId = created.spreadsheetId;
        spreadsheetUrl = created.spreadsheetUrl;

        await fetch(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
            spreadsheetId
          )}?addParents=${encodeURIComponent(targetFolderId)}&fields=id`,
          { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` } }
        ).catch(() => undefined);
      } else {
        spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
      }

      if (spec.datasetKey === 'system_sheet_resources') {
        spec.rows = resources.map((r) => [
          r.resourceId,
          site.id,
          r.domain,
          r.datasetKey,
          r.spreadsheetId,
          r.worksheetName,
          '1',
          r.status,
          new Date().toISOString(),
        ]);
      }

      const values = [spec.headers, ...spec.rows];
      await driveJsonRequest(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          spreadsheetId
        )}/values/${encodeURIComponent(`'${spec.worksheetTitle}'!A1`)}?valueInputOption=RAW`,
        accessToken,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values }),
        }
      );

      resources.push({
        resourceId: `res_${spec.datasetKey}`,
        domain: spec.domain,
        datasetKey: spec.datasetKey,
        spreadsheetId,
        spreadsheetUrl,
        worksheetName: spec.worksheetTitle,
        rowsWritten: spec.rows.length,
        status: 'verified',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Provisioning failed';
      errors.push(`${spec.domain}/${spec.spreadsheetTitle}: ${msg}`);
      resources.push({
        resourceId: `res_${spec.datasetKey}`,
        domain: spec.domain,
        datasetKey: spec.datasetKey,
        spreadsheetId: '',
        spreadsheetUrl: '',
        worksheetName: spec.worksheetTitle,
        rowsWritten: 0,
        status: 'partial_error',
        error: msg,
      });
    }
  }

  return { operationId: plan.operationId, resources, errors };
}
