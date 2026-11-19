import { ENV_CONFIG } from '../../config/env';
import { createOperationKey } from '../../features/console/workspaceHierarchyClient';
import { WorkerApiError } from '../../features/workspace-connection/workspaceApiClient';
import { BuildRelease, GoogleWorkspaceState, SiteDocument } from '../../types/builder';
import { compilerService } from '../compilerService';
import { getGoogleAccessToken } from '../googleAuthService';
import { publishSnapshotToGoogleDrive } from '../partitionedWorkspaceService';
import { storageService } from '../storageService';
import {
  buildPublishedRuntimeSnapshot,
  buildPublishManifest,
  PublishedRuntimeSnapshot,
  stripSecretsFromPublishedSnapshot,
  validateRuntimeSnapshotCompatibility,
} from './publishedSnapshotContract';

export interface SharedRuntimePublishOutcome {
  release: BuildRelease;
  snapshot: PublishedRuntimeSnapshot;
  publishTarget: 'cloudflare_drive' | 'google_drive' | 'local_staging';
  verifiedRemote: boolean;
  operationId?: string;
  revision?: number;
  projectionStatus?: string;
  warning?: string;
}

function resolveWorkerBaseUrl(): string {
  return ENV_CONFIG.workerApiUrl || '';
}

export async function publishSiteToSharedRuntime(params: {
  site: SiteDocument;
  workspace: GoogleWorkspaceState;
  commitMessage: string;
  selectedPageIds: string[];
  supabaseAccessToken?: string | null;
  orgId?: string;
  projectId?: string;
  expectedRevision?: number;
}): Promise<SharedRuntimePublishOutcome> {
  const { site, workspace, commitMessage, selectedPageIds, supabaseAccessToken, orgId, projectId, expectedRevision } =
    params;

  const baseRelease = compilerService.compileRelease(
    site,
    workspace,
    commitMessage,
    selectedPageIds
  );

  const snapshot = baseRelease.runtimeSnapshotJson
    ? (JSON.parse(baseRelease.runtimeSnapshotJson) as PublishedRuntimeSnapshot)
    : buildPublishedRuntimeSnapshot({ site, release: baseRelease, workspace });

  const compat = validateRuntimeSnapshotCompatibility(snapshot);
  if (!compat.compatible) {
    throw new Error(compat.reason || 'Published configuration is incompatible with Shared Runtime.');
  }

  const manifest = buildPublishManifest(snapshot, commitMessage);
  const workerBase = resolveWorkerBaseUrl();

  // Path 1: Worker + authenticated Builly session -> real Drive upload + D1 registry + cache purge
  if (supabaseAccessToken && (workerBase || ENV_CONFIG.isSupabaseConfigured)) {
    const operationId = createOperationKey('pub');
    try {
      const formDestinations = (site.cms?.forms || [])
        .filter((f) => f.status === 'active')
        .map((f) => ({
          formId: f.formId,
          formName: f.name,
          categoryId: f.categoryId,
          destinationSpreadsheetId:
            f.destination?.spreadsheetId || workspace.spreadsheet.id || '',
          destinationWorksheetName: f.destination?.worksheetName || 'CONTACT_SUBMISSIONS',
          inboxRegistrySpreadsheetId: workspace.spreadsheet.id || '',
          fieldMappings: f.fieldMappings || {},
          status: f.status,
        }))
        .filter((fd) => Boolean(fd.destinationSpreadsheetId));

      const datasetResources = workspace.spreadsheet.id
        ? (site.cms?.contentTypes || [])
            .filter((ct) => ct.enabled)
            .map((ct) => ({
              resourceId: `cms_${ct.id}`,
              domainKind: 'cms' as const,
              datasetKey: `cms_${ct.id}`,
              spreadsheetId: workspace.spreadsheet.id,
              worksheetName: ct.sheetTableId,
              schemaVersion: ct.schemaVersion,
            }))
        : [];

      const res = await fetch(
        `${workerBase}/api/owner/sites/${encodeURIComponent(site.portfolioSlug)}/publish`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${supabaseAccessToken}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': operationId,
          },
          body: JSON.stringify({
            operationId,
            ...(expectedRevision !== undefined ? { expectedRevision } : {}),
            siteId: site.id,
            siteSlug: site.portfolioSlug,
            siteName: site.name,
            ...(orgId ? { orgId } : {}),
            ...(projectId ? { projectId } : {}),
            commitMessage,
            driveFolderId: workspace.driveFolder.id || undefined,
            snapshot,
            manifest,
            formDestinations,
            datasetResources,
          }),
        }
      );

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const body = (await res.json()) as {
          runtimeConfigDriveFileId?: string;
          manifestDriveFileId?: string;
          integrityHash?: string;
          operationId?: string;
          revision?: number;
          projectionStatus?: string;
          error?: string;
          code?: string;
          retryable?: boolean;
          details?: Record<string, unknown>;
        };

        if (!res.ok) {
          throw new WorkerApiError(
            body.error || `Publish failed (${res.status}).`,
            res.status,
            body.code || 'PUBLISH_FAILED',
            {
              operationId: body.operationId || operationId,
              retryable: body.retryable,
              projectionStatus: body.projectionStatus,
              details: body.details,
            }
          );
        }

        const updatedRelease: BuildRelease = {
          ...baseRelease,
          driveFileId: body.runtimeConfigDriveFileId || baseRelease.driveFileId,
          artifact_url: body.runtimeConfigDriveFileId || baseRelease.artifact_url,
          manifest_url: body.manifestDriveFileId || baseRelease.manifest_url,
          manifestDriveFileId: body.manifestDriveFileId || baseRelease.manifestDriveFileId,
          publishTarget: 'cloudflare_drive',
        };
        return {
          release: updatedRelease,
          snapshot,
          publishTarget: 'cloudflare_drive',
          verifiedRemote: true,
          operationId: body.operationId || operationId,
          revision: body.revision,
          projectionStatus: body.projectionStatus,
          warning:
            body.projectionStatus === 'PROJECTION_REPAIR_PENDING'
              ? 'Published to Google Drive, pending D1 index repair.'
              : undefined,
        };
      }
    } catch (err) {
      if (err instanceof WorkerApiError) {
        throw err;
      }
      // Network/non-JSON fallback to direct Google OAuth Drive upload or local staging
    }
  }

  // Path 2: Client Google OAuth token connected -> upload directly to Drive Published/{buildId}
  const googleToken = getGoogleAccessToken();
  if (googleToken) {
    try {
      const uploaded = await publishSnapshotToGoogleDrive({
        accessToken: googleToken,
        driveFolderId: workspace.driveFolder.id || undefined,
        snapshot,
        manifest,
      });
      const updatedRelease: BuildRelease = {
        ...baseRelease,
        driveFileId: uploaded.runtimeConfigDriveFileId,
        artifact_url: uploaded.runtimeConfigDriveFileId,
        manifest_url: uploaded.manifestDriveFileId,
        manifestDriveFileId: uploaded.manifestDriveFileId,
        publishTarget: 'google_drive',
      };
      return {
        release: updatedRelease,
        snapshot,
        publishTarget: 'google_drive',
        verifiedRemote: uploaded.verifiedReadback,
      };
    } catch (err) {
      return {
        release: baseRelease,
        snapshot,
        publishTarget: 'local_staging',
        verifiedRemote: false,
        warning:
          err instanceof Error
            ? `Saved local release only (Drive upload unavailable: ${err.message}).`
            : 'Saved local release only.',
      };
    }
  }

  // Path 3: Offline / unconfigured local staging release (honest label, no fake Drive IDs)
  return {
    release: baseRelease,
    snapshot,
    publishTarget: 'local_staging',
    verifiedRemote: false,
  };
}

export async function rollbackSiteOnSharedRuntime(params: {
  siteSlug: string;
  targetVersion: string;
  supabaseAccessToken?: string | null;
}): Promise<{ ok: boolean; remoteSynced: boolean; operationId?: string; error?: string; code?: string }> {
  const { siteSlug, targetVersion, supabaseAccessToken } = params;
  const workerBase = resolveWorkerBaseUrl();
  if (!supabaseAccessToken || (!workerBase && !ENV_CONFIG.isSupabaseConfigured)) {
    return { ok: true, remoteSynced: false };
  }
  const operationId = createOperationKey('rb');
  try {
    const res = await fetch(
      `${workerBase}/api/owner/sites/${encodeURIComponent(siteSlug)}/rollback`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${supabaseAccessToken}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': operationId,
        },
        body: JSON.stringify({ targetVersion, operationId }),
      }
    );
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      code?: string;
      operationId?: string;
    };
    if (!res.ok) {
      return {
        ok: false,
        remoteSynced: false,
        operationId: data.operationId || operationId,
        code: data.code,
        error: data.error || `HTTP ${res.status}`,
      };
    }
    return { ok: true, remoteSynced: true, operationId: data.operationId || operationId };
  } catch (err) {
    return {
      ok: false,
      remoteSynced: false,
      operationId,
      error: err instanceof Error ? err.message : 'Rollback request failed.',
    };
  }
}

export async function loadPublicRuntimeSnapshot(
  siteSlug: string
): Promise<{
  found: boolean;
  source: 'cloudflare_worker' | 'local_published_release' | 'none';
  snapshot?: PublishedRuntimeSnapshot;
  error?: string;
}> {
  const normalizedSlug = siteSlug.trim().toLowerCase();
  const workerBase = resolveWorkerBaseUrl();

  // 1. Try Cloudflare Shared Runtime Worker API
  if (workerBase || typeof window !== 'undefined') {
    try {
      const res = await fetch(
        `${workerBase}/api/public/sites/${encodeURIComponent(normalizedSlug)}/runtime`,
        { headers: { Accept: 'application/json' } }
      );
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = (await res.json()) as { snapshot?: PublishedRuntimeSnapshot };
        if (data.snapshot) {
          const scrubbed = stripSecretsFromPublishedSnapshot(
            data.snapshot as PublishedRuntimeSnapshot & Record<string, unknown>
          );
          const compat = validateRuntimeSnapshotCompatibility(scrubbed);
          if (!compat.compatible) {
            return { found: false, source: 'cloudflare_worker', error: compat.reason };
          }
          return { found: true, source: 'cloudflare_worker', snapshot: scrubbed };
        }
      }
    } catch {
      // Fallback to local published release in dev/preview if Worker is not mounted
    }
  }

  // 2. Fallback strictly to EXPLICITLY PUBLISHED release in local staging (NEVER mutable draft pages!)
  try {
    const localSite = storageService.findLocalDraftBySiteSlug(normalizedSlug);
    if (localSite && localSite.portfolioSlug?.toLowerCase() === normalizedSlug) {
      const activeRelease =
        localSite.releases.find((r: BuildRelease) => r.version === localSite.activeReleaseVersion) ||
        localSite.releases.find((r: BuildRelease) => r.is_active || r.status === 'Active');

      if (activeRelease) {
        const snap = activeRelease.runtimeSnapshotJson
          ? (JSON.parse(activeRelease.runtimeSnapshotJson) as PublishedRuntimeSnapshot)
          : buildPublishedRuntimeSnapshot({ site: localSite, release: activeRelease });
        const scrubbed = stripSecretsFromPublishedSnapshot(
          snap as PublishedRuntimeSnapshot & Record<string, unknown>
        );
        return { found: true, source: 'local_published_release', snapshot: scrubbed };
      }
    }
  } catch {
    // Ignore storage read issues
  }

  return { found: false, source: 'none' };
}

export async function submitPublicRuntimeForm(params: {
  siteSlug: string;
  formId: string;
  fields: Record<string, unknown>;
  sourcePage: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  const workerBase = resolveWorkerBaseUrl();
  const idempotencyKey = `sub_${params.siteSlug}_${params.formId}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

  const res = await fetch(
    `${workerBase}/api/public/sites/${encodeURIComponent(
      params.siteSlug
    )}/forms/${encodeURIComponent(params.formId)}/submit`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        fields: params.fields,
        sourcePage: params.sourcePage,
      }),
    }
  );

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    return { ok: false, error: data.error || `Submission failed (${res.status}).` };
  }
  return { ok: true, message: data.message };
}
