import { requireSession } from '../middleware/requireSession';
import {
  handleListProjectDriveFiles,
  handleProvisionProjectDrive,
  handleReadProjectDriveJson,
  handleWriteProjectDriveJson,
} from './drive';
import {
  handleGetProjectCms,
  handleSaveProjectCms,
} from './projectCms';
import {
  handleGetProjectInbox,
  handleSyncProjectInbox,
} from './projectInbox';
import {
  handleDeleteProjectAsset,
  handleGetProjectAssetContent,
  handleListProjectAssets,
  handleUploadProjectAsset,
} from './projectAssets';
import {
  handleListProjectReleases,
  handleSaveProjectExport,
} from './projectPublishing';
import {
  handleMigrationCleanup,
  handleMigrationExecute,
  handleMigrationPlan,
} from './projectMigration';
import {
  archiveOrganization,
  archiveProject,
  completeOnboarding,
  createOrganization,
  createProject,
  createSiteInProject,
  deleteOrganization,
  deleteProject,
  getConsoleBootstrap,
  HierarchyServiceError,
  inspectOnboardingState,
  OnboardingLocalContext,
  ProjectModuleKey,
  updateOrganization,
  updateProject,
  updateProjectModules,
  updateSiteInProject,
} from '../services/workspaceHierarchyService';
import {
  listAccountOperationsFromD1,
  readOperationFromD1,
} from '../services/operationJournalService';
import {
  listPendingProjectionRepairs,
  processProjectionRepairQueue,
  rebuildD1FromDrive,
  recoverOperationFromDrive,
} from '../services/projectionRepairService';
import { BuillyTransactionError } from '../services/transactionErrors';
import { WorkerEnv } from '../types';

function errorJson(err: unknown): Response {
  if (err instanceof BuillyTransactionError) {
    return Response.json(err.toSafeJson(), { status: err.status });
  }
  if (err instanceof HierarchyServiceError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  const message = err instanceof Error ? err.message : 'Workspace hierarchy request failed.';
  return Response.json({ error: message, code: 'HIERARCHY_INTERNAL_ERROR' }, { status: 500 });
}

export async function handleConsoleApiRequest(
  request: Request,
  env: WorkerEnv,
  pathname: string
): Promise<Response | null> {
  if (!pathname.startsWith('/api/console/')) {
    return null;
  }

  const { session, errorResponse } = await requireSession(request, env);
  if (errorResponse || !session) return errorResponse!;

  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() || undefined;

  try {
    if (pathname === '/api/console/bootstrap' && request.method === 'GET') {
      const data = await getConsoleBootstrap(env, session);
      return Response.json(data);
    }

    if (pathname === '/api/console/onboarding/inspect' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        localContext?: OnboardingLocalContext | null;
      };
      const inspection = await inspectOnboardingState(env, session, body.localContext || null);
      return Response.json(inspection);
    }

    if (pathname === '/api/console/onboarding/complete' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as Parameters<
        typeof completeOnboarding
      >[2];
      const result = await completeOnboarding(env, session, {
        ...body,
        operationId: body.operationId || body.operationKey || idempotencyKey,
        operationKey: body.operationKey || idempotencyKey,
      });
      return Response.json(result, { status: result.deduplicated ? 200 : 201 });
    }

    if (pathname === '/api/console/rebuild-projection' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { selectedRootFolderId?: string };
      const summary = await rebuildD1FromDrive(env, session, {
        selectedRootFolderId: body.selectedRootFolderId,
      });
      return Response.json(summary);
    }

    if (pathname === '/api/console/repair-queue' && request.method === 'GET') {
      const repairs = await listPendingProjectionRepairs(env.DB, session.ownerId);
      return Response.json({ ok: true, repairs });
    }

    if (pathname === '/api/console/repair-queue/process' && request.method === 'POST') {
      const res = await processProjectionRepairQueue(env, session);
      return Response.json({ ok: true, ...res });
    }

    if (pathname === '/api/console/operations' && request.method === 'GET') {
      const operations = await listAccountOperationsFromD1(env.DB, session.ownerId, 40);
      return Response.json({ ok: true, operations });
    }

    const opRecoverMatch = pathname.match(/^\/api\/console\/operations\/([^/]+)\/recover$/);
    if (opRecoverMatch && request.method === 'POST') {
      const opId = decodeURIComponent(opRecoverMatch[1]);
      const body = (await request.json().catch(() => ({}))) as { selectedRootFolderId?: string };
      const result = await recoverOperationFromDrive(env, session, opId, {
        selectedRootFolderId: body.selectedRootFolderId,
      });
      return Response.json(result);
    }

    const opGetMatch = pathname.match(/^\/api\/console\/operations\/([^/]+)$/);
    if (opGetMatch && request.method === 'GET') {
      const opId = decodeURIComponent(opGetMatch[1]);
      const record = await readOperationFromD1(env.DB, session.ownerId, opId);
      if (!record) {
        return Response.json(
          { error: `Operation "${opId}" not found.`, code: 'RESOURCE_NOT_FOUND' },
          { status: 404 }
        );
      }
      return Response.json({ ok: true, operation: record.journal });
    }

    if (pathname === '/api/console/migration/plan' && request.method === 'POST') {
      return await handleMigrationPlan(request, env, session);
    }

    if (pathname === '/api/console/migration/execute' && request.method === 'POST') {
      return await handleMigrationExecute(request, env, session, idempotencyKey);
    }

    if (pathname === '/api/console/migration/cleanup' && request.method === 'POST') {
      return await handleMigrationCleanup(request, env, session, idempotencyKey);
    }

    if (pathname === '/api/console/organizations' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as {
        name?: string;
        operationKey?: string;
        operationId?: string;
      };
      const result = await createOrganization(env, session, {
        name: body.name || '',
        operationId: body.operationId || body.operationKey || idempotencyKey,
        operationKey: body.operationKey || idempotencyKey,
      });
      return Response.json(result, { status: result.deduplicated ? 200 : 201 });
    }

    const orgArchiveMatch = pathname.match(/^\/api\/console\/organizations\/([^/]+)\/archive$/);
    if (orgArchiveMatch && (request.method === 'POST' || request.method === 'PATCH')) {
      const orgId = decodeURIComponent(orgArchiveMatch[1]);
      const body = (await request.json().catch(() => ({}))) as {
        expectedRevision?: number;
        operationId?: string;
      };
      const result = await archiveOrganization(env, session, orgId, {
        expectedRevision: body.expectedRevision,
        operationId: body.operationId || idempotencyKey,
      });
      return Response.json(result);
    }

    const orgUpdateMatch = pathname.match(/^\/api\/console\/organizations\/([^/]+)$/);
    if (orgUpdateMatch) {
      const orgId = decodeURIComponent(orgUpdateMatch[1]);
      if (request.method === 'PATCH') {
        const body = (await request.json().catch(() => ({}))) as {
          name?: string;
          expectedRevision?: number;
          operationId?: string;
        };
        const result = await updateOrganization(env, session, orgId, {
          ...body,
          operationId: body.operationId || idempotencyKey,
        });
        return Response.json(result);
      }
      if (request.method === 'DELETE') {
        const body = (await request.json().catch(() => ({}))) as {
          confirmPermanentDelete?: boolean;
          operationId?: string;
        };
        const result = await deleteOrganization(env, session, orgId, {
          confirmPermanentDelete: body.confirmPermanentDelete,
          operationId: body.operationId || idempotencyKey,
        });
        return Response.json(result);
      }
    }

    const orgProjectsMatch = pathname.match(/^\/api\/console\/organizations\/([^/]+)\/projects$/);
    if (orgProjectsMatch && request.method === 'POST') {
      const orgId = decodeURIComponent(orgProjectsMatch[1]);
      const body = (await request.json().catch(() => ({}))) as {
        name?: string;
        description?: string;
        enabledModules?: ProjectModuleKey[];
        operationKey?: string;
        operationId?: string;
      };
      const result = await createProject(env, session, orgId, {
        name: body.name || '',
        description: body.description,
        enabledModules: body.enabledModules,
        operationId: body.operationId || body.operationKey || idempotencyKey,
        operationKey: body.operationKey || idempotencyKey,
      });
      return Response.json(result, { status: result.deduplicated ? 200 : 201 });
    }

    const projectArchiveMatch = pathname.match(/^\/api\/console\/projects\/([^/]+)\/archive$/);
    if (projectArchiveMatch && (request.method === 'POST' || request.method === 'PATCH')) {
      const projectId = decodeURIComponent(projectArchiveMatch[1]);
      const body = (await request.json().catch(() => ({}))) as {
        expectedRevision?: number;
        operationId?: string;
      };
      const result = await archiveProject(env, session, projectId, {
        expectedRevision: body.expectedRevision,
        operationId: body.operationId || idempotencyKey,
      });
      return Response.json(result);
    }

    const projectUpdateMatch = pathname.match(/^\/api\/console\/projects\/([^/]+)$/);
    if (projectUpdateMatch) {
      const projectId = decodeURIComponent(projectUpdateMatch[1]);
      if (request.method === 'PATCH') {
        const body = (await request.json().catch(() => ({}))) as {
          name?: string;
          description?: string;
          expectedRevision?: number;
          operationId?: string;
        };
        const result = await updateProject(env, session, projectId, {
          ...body,
          operationId: body.operationId || idempotencyKey,
        });
        return Response.json(result);
      }
      if (request.method === 'DELETE') {
        const body = (await request.json().catch(() => ({}))) as {
          confirmPermanentDelete?: boolean;
          operationId?: string;
        };
        const result = await deleteProject(env, session, projectId, {
          confirmPermanentDelete: body.confirmPermanentDelete,
          operationId: body.operationId || idempotencyKey,
        });
        return Response.json(result);
      }
    }

    const projectModulesMatch = pathname.match(/^\/api\/console\/projects\/([^/]+)\/modules$/);
    if (projectModulesMatch && request.method === 'PATCH') {
      const projectId = decodeURIComponent(projectModulesMatch[1]);
      const body = (await request.json().catch(() => ({}))) as {
        modules?: Array<{ moduleKey: ProjectModuleKey; enabled: boolean }>;
        expectedRevision?: number;
        operationId?: string;
      };
      const result = await updateProjectModules(env, session, projectId, body.modules || [], {
        expectedRevision: body.expectedRevision,
        operationId: body.operationId || idempotencyKey,
      });
      return Response.json(result);
    }

    const projectSitesMatch = pathname.match(/^\/api\/console\/projects\/([^/]+)\/sites$/);
    if (projectSitesMatch && request.method === 'POST') {
      const projectId = decodeURIComponent(projectSitesMatch[1]);
      const body = (await request.json().catch(() => ({}))) as {
        siteName?: string;
        siteSlug?: string;
        operationKey?: string;
        operationId?: string;
      };
      const result = await createSiteInProject(env, session, projectId, {
        siteName: body.siteName || '',
        siteSlug: body.siteSlug || '',
        operationId: body.operationId || body.operationKey || idempotencyKey,
        operationKey: body.operationKey || idempotencyKey,
      });
      return Response.json(result, { status: result.deduplicated ? 200 : 201 });
    }

    const projectDriveProvisionMatch = pathname.match(
      /^\/api\/console\/projects\/([^/]+)\/drive\/provision$/
    );
    if (projectDriveProvisionMatch && request.method === 'POST') {
      const projectId = decodeURIComponent(projectDriveProvisionMatch[1]);
      return await handleProvisionProjectDrive(request, env, projectId);
    }

    const projectDriveFilesMatch = pathname.match(
      /^\/api\/console\/projects\/([^/]+)\/drive\/files$/
    );
    if (projectDriveFilesMatch && request.method === 'GET') {
      const projectId = decodeURIComponent(projectDriveFilesMatch[1]);
      return await handleListProjectDriveFiles(request, env, projectId);
    }

    const projectDriveJsonMatch = pathname.match(
      /^\/api\/console\/projects\/([^/]+)\/drive\/json$/
    );
    if (projectDriveJsonMatch) {
      const projectId = decodeURIComponent(projectDriveJsonMatch[1]);
      if (request.method === 'GET') {
        return await handleReadProjectDriveJson(request, env, projectId);
      }
      if (request.method === 'POST') {
        return await handleWriteProjectDriveJson(request, env, projectId);
      }
    }

    const projectCmsMatch = pathname.match(
      /^\/api\/console\/projects\/([^/]+)\/cms(\/save)?$/
    );
    if (projectCmsMatch) {
      const projectId = decodeURIComponent(projectCmsMatch[1]);
      const isSaveSuffix = Boolean(projectCmsMatch[2]);
      if (!isSaveSuffix && request.method === 'GET') {
        return await handleGetProjectCms(request, env, session, projectId);
      }
      if (request.method === 'POST' || request.method === 'PUT') {
        return await handleSaveProjectCms(request, env, session, projectId);
      }
    }

    const projectInboxMatch = pathname.match(
      /^\/api\/console\/projects\/([^/]+)\/inbox(\/sync)?$/
    );
    if (projectInboxMatch) {
      const projectId = decodeURIComponent(projectInboxMatch[1]);
      const isSyncSuffix = Boolean(projectInboxMatch[2]);
      if (!isSyncSuffix && request.method === 'GET') {
        return await handleGetProjectInbox(request, env, session, projectId);
      }
      if (request.method === 'POST' || request.method === 'PUT') {
        return await handleSyncProjectInbox(request, env, session, projectId);
      }
    }

    const projectAssetsMatch = pathname.match(
      /^\/api\/console\/projects\/([^/]+)\/assets(\/upload)?$/
    );
    if (projectAssetsMatch) {
      const projectId = decodeURIComponent(projectAssetsMatch[1]);
      const isUploadSuffix = Boolean(projectAssetsMatch[2]);
      if (!isUploadSuffix && request.method === 'GET') {
        return await handleListProjectAssets(request, env, session, projectId);
      }
      if (isUploadSuffix && request.method === 'POST') {
        return await handleUploadProjectAsset(request, env, session, projectId);
      }
    }

    const projectAssetContentMatch = pathname.match(
      /^\/api\/console\/projects\/([^/]+)\/assets\/([^/]+)\/content$/
    );
    if (projectAssetContentMatch && request.method === 'GET') {
      const projectId = decodeURIComponent(projectAssetContentMatch[1]);
      const driveFileId = decodeURIComponent(projectAssetContentMatch[2]);
      return await handleGetProjectAssetContent(request, env, session, projectId, driveFileId);
    }

    const projectAssetItemMatch = pathname.match(
      /^\/api\/console\/projects\/([^/]+)\/assets\/([^/]+)$/
    );
    if (projectAssetItemMatch && request.method === 'DELETE') {
      const projectId = decodeURIComponent(projectAssetItemMatch[1]);
      const assetId = decodeURIComponent(projectAssetItemMatch[2]);
      return await handleDeleteProjectAsset(request, env, session, projectId, assetId);
    }

    const projectReleasesMatch = pathname.match(
      /^\/api\/console\/projects\/([^/]+)\/releases$/
    );
    if (projectReleasesMatch && request.method === 'GET') {
      const projectId = decodeURIComponent(projectReleasesMatch[1]);
      return await handleListProjectReleases(request, env, session, projectId);
    }

    const projectExportsMatch = pathname.match(
      /^\/api\/console\/projects\/([^/]+)\/exports$/
    );
    if (projectExportsMatch && request.method === 'POST') {
      const projectId = decodeURIComponent(projectExportsMatch[1]);
      return await handleSaveProjectExport(request, env, session, projectId);
    }

    const siteUpdateMatch = pathname.match(/^\/api\/console\/sites\/([^/]+)$/);
    if (siteUpdateMatch && request.method === 'PATCH') {
      const siteId = decodeURIComponent(siteUpdateMatch[1]);
      const body = (await request.json().catch(() => ({}))) as {
        siteName?: string;
        siteSlug?: string;
        expectedRevision?: number;
        operationId?: string;
      };
      const result = await updateSiteInProject(env, session, siteId, {
        ...body,
        operationId: body.operationId || idempotencyKey,
      });
      return Response.json(result);
    }

    return Response.json({ error: 'Console API endpoint not found.' }, { status: 404 });
  } catch (err) {
    return errorJson(err);
  }
}
