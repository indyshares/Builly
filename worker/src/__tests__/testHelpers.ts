import { vi } from 'vitest';
import { encryptSecret } from '../security/encryption';
import {
  OrganizationRecord,
  ProjectModuleRecord,
  ProjectRecord,
  SiteRecord,
  WorkspaceResourceRecord,
} from '../services/workspaceHierarchyService';
import { StoredCredentialRow, VerifiedSession, WorkerEnv } from '../types';

export interface MockMemberRow {
  member_id: string;
  org_id: string;
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'active' | 'invited' | 'removed';
  created_at: string;
  updated_at: string;
}

export interface MockSiteRegistryRow {
  site_id: string;
  site_slug: string;
  custom_domain: string | null;
  owner_id: string;
  org_id: string | null;
  project_id: string | null;
  site_name: string;
  status: 'draft' | 'published' | 'suspended';
  active_publish_version: string;
  active_build_id: string;
  publish_manifest_drive_file_id: string;
  runtime_config_drive_file_id: string;
  integrity_hash: string;
  schema_version: number;
  canonical_revision?: number;
  indexed_at?: string;
  last_verified_at?: string;
  projection_status?: string;
  last_operation_id?: string;
  updated_at: string;
}

export interface MockIdempotencyRow {
  operation_key: string;
  owner_id: string;
  operation_type: string;
  payload_hash?: string;
  result_json: string;
  created_at: string;
}

export interface MockOperationProjectionRow {
  operation_id: string;
  owner_id: string;
  operation_type: string;
  scope_key: string;
  payload_hash: string;
  status: string;
  target_json: string;
  steps_json: string;
  result_json: string;
  drive_journal_file_id: string;
  error_code: string;
  error_message: string;
  fencing_token: number;
  lease_expires_at: number;
  created_at: string;
  updated_at: string;
}

export interface MockProjectionRepairRow {
  repair_id: string;
  owner_id: string;
  resource_type: string;
  resource_id: string;
  operation_id: string;
  canonical_revision: number;
  drive_file_id: string;
  payload_json: string;
  attempts: number;
  status: 'pending' | 'reconciling' | 'completed' | 'failed';
  last_error: string;
  created_at: string;
  updated_at: string;
}

export interface MockManagementCacheRow {
  cache_key: string;
  owner_id: string;
  resource_type: string;
  resource_id: string;
  canonical_revision: number;
  payload_json: string;
  fetched_at: string;
  expires_at: string;
  last_synced_at: string;
}

export interface MockPublicArtifactRow {
  site_id: string;
  publish_version: string;
  build_id: string;
  integrity_hash: string;
  snapshot_json: string;
  drive_file_id: string;
  indexed_at: string;
}

export function createInMemoryMockD1() {
  const organizations: OrganizationRecord[] = [];
  const members: MockMemberRow[] = [];
  const projects: ProjectRecord[] = [];
  const projectModules: ProjectModuleRecord[] = [];
  const sites: SiteRecord[] = [];
  const resources: WorkspaceResourceRecord[] = [];
  const siteRegistry: MockSiteRegistryRow[] = [];
  const idempotency: MockIdempotencyRow[] = [];
  const credentials: StoredCredentialRow[] = [];
  const formDestinations: Array<Record<string, unknown>> = [];
  const formIdempotency: Array<Record<string, unknown>> = [];
  const siteReleaseHistory: Array<Record<string, unknown>> = [];
  const siteDatasetResources: Array<Record<string, unknown>> = [];
  const runtimeRateLimits: Array<{ bucket_key: string; window_start: number; count: number }> = [];
  const operationsProjection: MockOperationProjectionRow[] = [];
  const projectionRepairQueue: MockProjectionRepairRow[] = [];
  const managementCache: MockManagementCacheRow[] = [];
  const publicRuntimeArtifacts: MockPublicArtifactRow[] = [];

  const failMatchers: Array<{ pattern: RegExp; remaining: number; message: string }> = [];

  const maybeInjectFailure = (q: string) => {
    for (let i = 0; i < failMatchers.length; i++) {
      const rule = failMatchers[i];
      if (rule.remaining !== 0 && rule.pattern.test(q)) {
        if (rule.remaining > 0) rule.remaining -= 1;
        throw new Error(rule.message);
      }
    }
  };

  const executeQuery = (sql: string, params: unknown[]) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    maybeInjectFailure(q);

    if (q.startsWith('PRAGMA')) {
      return { results: [] };
    }

    // --- operations_projection ---
    if (q.startsWith('INSERT INTO operations_projection')) {
      const [
        operation_id,
        owner_id,
        operation_type,
        scope_key,
        payload_hash,
        status,
        target_json,
        steps_json,
        result_json,
        drive_journal_file_id,
        error_code,
        error_message,
        fencing_token,
        lease_expires_at,
        created_at,
        updated_at,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        number,
        number,
        string,
        string,
      ];
      const idx = operationsProjection.findIndex((o) => o.operation_id === operation_id);
      if (idx >= 0) {
        operationsProjection[idx] = {
          ...operationsProjection[idx],
          status,
          target_json,
          steps_json,
          result_json,
          drive_journal_file_id: drive_journal_file_id || operationsProjection[idx].drive_journal_file_id,
          error_code,
          error_message,
          fencing_token,
          lease_expires_at,
          updated_at,
        };
      } else {
        operationsProjection.push({
          operation_id,
          owner_id,
          operation_type,
          scope_key,
          payload_hash,
          status,
          target_json,
          steps_json,
          result_json,
          drive_journal_file_id,
          error_code,
          error_message,
          fencing_token,
          lease_expires_at,
          created_at,
          updated_at,
        });
      }
      return { results: [] };
    }

    if (q.includes('FROM operations_projection WHERE operation_id = ? AND owner_id = ?')) {
      const [opId, ownerId] = params as [string, string];
      const row = operationsProjection.find((o) => o.operation_id === opId && o.owner_id === ownerId);
      return { results: row ? [row] : [] };
    }

    if (q.includes('FROM operations_projection WHERE owner_id = ? ORDER BY updated_at DESC')) {
      const [ownerId, limit] = params as [string, number];
      const rows = operationsProjection
        .filter((o) => o.owner_id === ownerId)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, limit || 40);
      return { results: rows };
    }

    // --- projection_repair_queue ---
    if (q.startsWith('INSERT INTO projection_repair_queue')) {
      const [
        repair_id,
        owner_id,
        resource_type,
        resource_id,
        operation_id,
        canonical_revision,
        drive_file_id,
        payload_json,
        last_error,
        created_at,
        updated_at,
      ] = params as [string, string, string, string, string, number, string, string, string, string, string];
      projectionRepairQueue.push({
        repair_id,
        owner_id,
        resource_type,
        resource_id,
        operation_id,
        canonical_revision,
        drive_file_id,
        payload_json,
        attempts: 0,
        status: 'pending',
        last_error,
        created_at,
        updated_at,
      });
      return { results: [] };
    }

    if (q.includes("FROM projection_repair_queue WHERE operation_id = ? AND owner_id = ? AND status IN ('pending', 'failed')")) {
      const [opId, ownerId] = params as [string, string];
      const row = projectionRepairQueue.find(
        (r) => r.operation_id === opId && r.owner_id === ownerId && (r.status === 'pending' || r.status === 'failed')
      );
      return { results: row ? [row] : [] };
    }

    if (q.includes("FROM projection_repair_queue WHERE owner_id = ? AND status IN ('pending', 'failed')")) {
      const [ownerId] = params as [string];
      return {
        results: projectionRepairQueue
          .filter((r) => r.owner_id === ownerId && (r.status === 'pending' || r.status === 'failed'))
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      };
    }

    if (q.startsWith('UPDATE projection_repair_queue SET status =')) {
      if (q.includes('WHERE repair_id = ? AND owner_id = ?')) {
        const [updatedAt, repairId, ownerId] = params as [string, string, string];
        const row = projectionRepairQueue.find((r) => r.repair_id === repairId && r.owner_id === ownerId);
        if (row) {
          row.status = 'completed';
          row.attempts += 1;
          row.last_error = '';
          row.updated_at = updatedAt;
        }
      } else if (q.includes('WHERE operation_id = ? AND owner_id = ?')) {
        const [updatedAt, opId, ownerId] = params as [string, string, string];
        for (const row of projectionRepairQueue) {
          if (row.operation_id === opId && row.owner_id === ownerId) {
            row.status = 'completed';
            row.last_error = '';
            row.updated_at = updatedAt;
          }
        }
      }
      return { results: [] };
    }

    // --- management_cache ---
    if (q.startsWith('INSERT INTO management_cache')) {
      const [
        cache_key,
        owner_id,
        resource_type,
        resource_id,
        canonical_revision,
        payload_json,
        fetched_at,
        expires_at,
        last_synced_at,
      ] = params as [string, string, string, string, number, string, string, string, string];
      const idx = managementCache.findIndex((c) => c.cache_key === cache_key);
      const entry: MockManagementCacheRow = {
        cache_key,
        owner_id,
        resource_type,
        resource_id,
        canonical_revision,
        payload_json,
        fetched_at,
        expires_at,
        last_synced_at,
      };
      if (idx >= 0) managementCache[idx] = entry;
      else managementCache.push(entry);
      return { results: [] };
    }

    if (q.includes('FROM management_cache WHERE cache_key = ? AND owner_id = ?')) {
      const [cacheKey, ownerId] = params as [string, string];
      const row = managementCache.find((c) => c.cache_key === cacheKey && c.owner_id === ownerId);
      return { results: row ? [row] : [] };
    }

    if (q.startsWith('DELETE FROM management_cache WHERE cache_key = ? AND owner_id = ?')) {
      const [cacheKey, ownerId] = params as [string, string];
      for (let i = managementCache.length - 1; i >= 0; i--) {
        if (managementCache[i].cache_key === cacheKey && managementCache[i].owner_id === ownerId) {
          managementCache.splice(i, 1);
        }
      }
      return { results: [] };
    }

    if (q.startsWith('DELETE FROM management_cache WHERE owner_id = ?')) {
      const [ownerId] = params as [string];
      for (let i = managementCache.length - 1; i >= 0; i--) {
        if (managementCache[i].owner_id === ownerId) managementCache.splice(i, 1);
      }
      return { results: [] };
    }

    // --- public_runtime_artifacts ---
    if (q.startsWith('INSERT INTO public_runtime_artifacts')) {
      const [site_id, publish_version, build_id, integrity_hash, snapshot_json, drive_file_id, indexed_at] =
        params as [string, string, string, string, string, string, string];
      const idx = publicRuntimeArtifacts.findIndex(
        (a) => a.site_id === site_id && a.publish_version === publish_version
      );
      const next: MockPublicArtifactRow = {
        site_id,
        publish_version,
        build_id,
        integrity_hash,
        snapshot_json,
        drive_file_id,
        indexed_at,
      };
      if (idx >= 0) publicRuntimeArtifacts[idx] = next;
      else publicRuntimeArtifacts.push(next);
      return { results: [] };
    }

    if (q.includes('FROM public_runtime_artifacts WHERE site_id = ? AND publish_version = ?')) {
      const [siteId, pubVer] = params as [string, string];
      const row = publicRuntimeArtifacts.find(
        (a) => a.site_id === siteId && a.publish_version === pubVer
      );
      return { results: row ? [row] : [] };
    }

    // --- console_operation_idempotency ---
    if (q.includes('FROM console_operation_idempotency')) {
      const [key, ownerId] = params as [string, string];
      const row = idempotency.find((r) => r.operation_key === key && r.owner_id === ownerId);
      return { results: row ? [row] : [] };
    }

    if (q.startsWith('INSERT OR IGNORE INTO console_operation_idempotency')) {
      if (params.length >= 6) {
        const [key, ownerId, opType, payloadHash, resultJson, createdAt] = params as string[];
        if (!idempotency.some((r) => r.operation_key === key)) {
          idempotency.push({
            operation_key: key,
            owner_id: ownerId,
            operation_type: opType,
            payload_hash: payloadHash,
            result_json: resultJson,
            created_at: createdAt,
          });
        }
      } else {
        const [key, ownerId, resultJson, createdAt] = params as string[];
        if (!idempotency.some((r) => r.operation_key === key)) {
          idempotency.push({
            operation_key: key,
            owner_id: ownerId,
            operation_type: 'console_op',
            result_json: resultJson,
            created_at: createdAt,
          });
        }
      }
      return { results: [] };
    }

    // --- counts ---
    if (q.includes('SELECT COUNT(*) AS cnt FROM organization_members')) {
      const [userId] = params as [string];
      const cnt = members.filter((m) => m.user_id === userId && m.status === 'active').length;
      return { results: [{ cnt }] };
    }

    if (q.includes("SELECT COUNT(*) AS cnt FROM organizations WHERE owner_id = ? AND status IN ('active', 'archived')")) {
      const [ownerId] = params as [string];
      const cnt = organizations.filter(
        (o) => o.owner_id === ownerId && (o.status === 'active' || o.status === 'archived')
      ).length;
      return { results: [{ cnt }] };
    }

    if (q.includes("SELECT COUNT(*) AS cnt FROM organizations WHERE owner_id = ? AND status = 'active'")) {
      const [ownerId] = params as [string];
      const cnt = organizations.filter((o) => o.owner_id === ownerId && o.status === 'active').length;
      return { results: [{ cnt }] };
    }

    if (q.includes("SELECT COUNT(*) AS cnt FROM projects WHERE org_id = ? AND status IN ('active', 'archived')")) {
      const [orgId] = params as [string];
      const cnt = projects.filter(
        (p) => p.org_id === orgId && (p.status === 'active' || p.status === 'archived')
      ).length;
      return { results: [{ cnt }] };
    }

    if (q.includes("SELECT COUNT(*) AS cnt FROM projects WHERE org_id = ? AND status = 'active'")) {
      const [orgId] = params as [string];
      const cnt = projects.filter((p) => p.org_id === orgId && p.status === 'active').length;
      return { results: [{ cnt }] };
    }

    if (q.includes('SELECT COUNT(*) AS cnt FROM projects WHERE org_id = ?')) {
      const [orgId] = params as [string];
      const cnt = projects.filter((p) => p.org_id === orgId).length;
      return { results: [{ cnt }] };
    }

    if (q.includes("SELECT COUNT(*) AS cnt FROM site_registry WHERE project_id = ? AND status = 'published'")) {
      const [projectId] = params as [string];
      const cnt = siteRegistry.filter(
        (r) => r.project_id === projectId && r.status === 'published'
      ).length;
      return { results: [{ cnt }] };
    }

    if (
      q.includes(
        "SELECT COUNT(*) AS cnt FROM site_registry WHERE owner_id = ? AND (project_id IS NULL OR project_id = '')"
      )
    ) {
      const [ownerId] = params as [string];
      const cnt = siteRegistry.filter(
        (r) => r.owner_id === ownerId && (!r.project_id || r.project_id === '')
      ).length;
      return { results: [{ cnt }] };
    }

    if (q.includes('SELECT COUNT(*) AS cnt FROM site_dataset_resources')) {
      const [ownerId] = params as [string];
      const cnt = siteDatasetResources.filter((d) => d.owner_id === ownerId).length;
      return { results: [{ cnt }] };
    }

    if (q.includes('SELECT COUNT(*) AS cnt FROM site_form_destinations')) {
      const [ownerId] = params as [string];
      const cnt = formDestinations.filter((d) => d.owner_id === ownerId).length;
      return { results: [{ cnt }] };
    }

    // --- membership / RBAC joins ---
    if (q.includes('FROM organizations o INNER JOIN organization_members m') && q.includes('WHERE o.org_id = ?')) {
      const [orgId, userId] = params as [string, string];
      const requireActive = q.includes("o.status = 'active'");
      const m = members.find((x) => x.org_id === orgId && x.user_id === userId && x.status === 'active');
      const o = organizations.find(
        (x) => x.org_id === orgId && (!requireActive || x.status === 'active')
      );
      if (!m || !o) return { results: [] };
      return { results: [{ ...o, member_role: m.role }] };
    }

    if (q.includes('FROM organizations o INNER JOIN organization_members m') && q.includes('WHERE m.user_id = ?')) {
      const [userId] = params as [string];
      const rows = organizations
        .map((o) => {
          const m = members.find(
            (x) => x.org_id === o.org_id && x.user_id === userId && x.status === 'active'
          );
          return m ? { ...o, role: m.role } : null;
        })
        .filter(Boolean);
      return { results: rows };
    }

    if (q.includes('FROM projects p INNER JOIN organization_members m') && q.includes('WHERE p.project_id = ?')) {
      const [projectId, userId] = params as [string, string];
      const requireActive = q.includes("p.status = 'active'");
      const p = projects.find(
        (x) => x.project_id === projectId && (!requireActive || x.status === 'active')
      );
      if (!p) return { results: [] };
      const m = members.find(
        (x) => x.org_id === p.org_id && x.user_id === userId && x.status === 'active'
      );
      if (!m) return { results: [] };
      return { results: [{ ...p, member_role: m.role }] };
    }

    if (q.includes('FROM sites s INNER JOIN organization_members m') && q.includes('WHERE s.site_id = ?')) {
      const [siteId, userId] = params as [string, string];
      const s = sites.find((x) => x.site_id === siteId);
      if (!s) return { results: [] };
      const m = members.find(
        (x) => x.org_id === s.org_id && x.user_id === userId && x.status === 'active'
      );
      if (!m) return { results: [] };
      return { results: [{ ...s, member_role: m.role }] };
    }

    // --- credentials ---
    if (q.includes('FROM workspace_credentials WHERE owner_id = ?')) {
      const [ownerId] = params as [string];
      const row = credentials.find((c) => c.owner_id === ownerId);
      return { results: row ? [row] : [] };
    }

    if (q.startsWith('INSERT INTO workspace_credentials')) {
      const [owner_id, google_subject, google_email, google_name, google_avatar, granted_scopes, encrypted_refresh_token, encryption_iv, created_at, updated_at] =
        params as string[];
      const idx = credentials.findIndex((c) => c.owner_id === owner_id);
      const next: StoredCredentialRow = {
        owner_id,
        google_subject,
        google_email,
        google_name,
        google_avatar,
        granted_scopes,
        encrypted_refresh_token,
        encryption_iv,
        status: 'connected',
        created_at,
        updated_at,
      };
      if (idx >= 0) credentials[idx] = next;
      else credentials.push(next);
      return { results: [] };
    }

    if (q.startsWith("UPDATE workspace_credentials SET status = 'needs_reauth'")) {
      const [updatedAt, ownerId] = params as [string, string];
      const row = credentials.find((c) => c.owner_id === ownerId);
      if (row) {
        row.status = 'needs_reauth';
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith('DELETE FROM workspace_credentials WHERE owner_id = ?')) {
      const [ownerId] = params as [string];
      for (let i = credentials.length - 1; i >= 0; i--) {
        if (credentials[i].owner_id === ownerId) credentials.splice(i, 1);
      }
      return { results: [] };
    }

    // --- organizations ---
    if (q.startsWith('SELECT') && q.includes('FROM organizations WHERE org_id = ?')) {
      const [orgId] = params as [string];
      return { results: organizations.filter((o) => o.org_id === orgId) };
    }

    if (q.includes('SELECT org_id FROM organizations WHERE owner_id = ? AND org_slug = ?')) {
      const [ownerId, slug] = params as [string, string];
      return { results: organizations.filter((o) => o.owner_id === ownerId && o.org_slug === slug) };
    }

    if (q.startsWith('INSERT INTO organizations')) {
      if (params.length === 10) {
        const [
          org_id,
          owner_id,
          name,
          org_slug,
          drive_folder_id,
          projected_at,
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        ] = params as string[];
        organizations.push({
          org_id,
          owner_id,
          name,
          org_slug,
          drive_folder_id,
          status: 'active',
          canonical_revision: 1,
          projected_at,
          projection_status: 'synced',
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        });
      } else if (params.length >= 12) {
        const [
          org_id,
          owner_id,
          name,
          org_slug,
          drive_folder_id,
          status,
          canonical_revision,
          projected_at,
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        ] = params as [string, string, string, string, string, OrganizationRecord['status'], number, string, string, string, string, string];
        organizations.push({
          org_id,
          owner_id,
          name,
          org_slug,
          drive_folder_id,
          status,
          canonical_revision,
          projected_at,
          projection_status: 'synced',
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        });
      } else {
        const [org_id, owner_id, name, org_slug, drive_folder_id, created_at, updated_at] = params as string[];
        organizations.push({
          org_id,
          owner_id,
          name,
          org_slug,
          drive_folder_id,
          status: 'active',
          created_at,
          updated_at,
        });
      }
      return { results: [] };
    }

    if (q.startsWith('UPDATE organizations SET name = ?')) {
      const [name, canonicalRev, projectedAt, opId, manFileId, updatedAt, orgId] = params as [
        string,
        number,
        string,
        string,
        string,
        string,
        string,
      ];
      const row = organizations.find((o) => o.org_id === orgId);
      if (row) {
        row.name = name;
        row.canonical_revision = canonicalRev;
        row.projected_at = projectedAt;
        row.projection_status = 'synced';
        row.last_operation_id = opId;
        row.drive_manifest_file_id = manFileId;
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith("UPDATE organizations SET status = 'archived'")) {
      const [canonicalRev, opId, updatedAt, orgId] = params as [number, string, string, string];
      const row = organizations.find((o) => o.org_id === orgId);
      if (row) {
        row.status = 'archived';
        row.canonical_revision = canonicalRev;
        row.last_operation_id = opId;
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith('UPDATE organizations SET drive_folder_id = ?')) {
      const [folderId, updatedAt, orgId] = params as string[];
      const row = organizations.find((o) => o.org_id === orgId);
      if (row) {
        row.drive_folder_id = folderId;
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith('DELETE FROM organizations WHERE org_id = ? AND owner_id = ?')) {
      const [orgId, ownerId] = params as [string, string];
      for (let i = organizations.length - 1; i >= 0; i--) {
        if (organizations[i].org_id === orgId && organizations[i].owner_id === ownerId) {
          organizations.splice(i, 1);
        }
      }
      return { results: [] };
    }

    if (q.startsWith('DELETE FROM organizations WHERE owner_id = ?')) {
      const [ownerId] = params as [string];
      const deletedOrgIds = new Set(
        organizations.filter((o) => o.owner_id === ownerId).map((o) => o.org_id)
      );
      for (let i = organizations.length - 1; i >= 0; i--) {
        if (organizations[i].owner_id === ownerId) organizations.splice(i, 1);
      }
      // Simulate ON DELETE CASCADE
      for (let i = members.length - 1; i >= 0; i--) {
        if (deletedOrgIds.has(members[i].org_id)) members.splice(i, 1);
      }
      const deletedProjIds = new Set(
        projects.filter((p) => deletedOrgIds.has(p.org_id)).map((p) => p.project_id)
      );
      for (let i = projects.length - 1; i >= 0; i--) {
        if (deletedOrgIds.has(projects[i].org_id)) projects.splice(i, 1);
      }
      for (let i = projectModules.length - 1; i >= 0; i--) {
        if (deletedProjIds.has(projectModules[i].project_id)) projectModules.splice(i, 1);
      }
      for (let i = sites.length - 1; i >= 0; i--) {
        if (deletedOrgIds.has(sites[i].org_id)) sites.splice(i, 1);
      }
      return { results: [] };
    }

    // --- organization_members ---
    if (q.startsWith('INSERT INTO organization_members')) {
      const [member_id, org_id, user_id, email, created_at, updated_at] = params as string[];
      if (!members.some((m) => m.org_id === org_id && m.user_id === user_id)) {
        members.push({
          member_id,
          org_id,
          user_id,
          email,
          role: 'owner',
          status: 'active',
          created_at,
          updated_at,
        });
      }
      return { results: [] };
    }

    // --- projects ---
    if (q.includes('SELECT project_id FROM projects WHERE org_id = ? AND project_slug = ?')) {
      const [orgId, slug] = params as [string, string];
      return { results: projects.filter((p) => p.org_id === orgId && p.project_slug === slug) };
    }

    if (q.includes('FROM projects WHERE org_id IN')) {
      return { results: projects.filter((p) => params.includes(p.org_id)) };
    }

    if (q.startsWith('INSERT INTO projects')) {
      if (params.length === 12) {
        const [
          project_id,
          org_id,
          owner_id,
          name,
          project_slug,
          description,
          drive_folder_id,
          projected_at,
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        ] = params as string[];
        projects.push({
          project_id,
          org_id,
          owner_id,
          name,
          project_slug,
          description,
          drive_folder_id,
          status: 'active',
          canonical_revision: 1,
          projected_at,
          projection_status: 'synced',
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        });
      } else if (params.length >= 13) {
        const [
          project_id,
          org_id,
          owner_id,
          name,
          project_slug,
          description,
          drive_folder_id,
          status,
          canonical_revision,
          projected_at,
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        ] = params as [string, string, string, string, string, string, string, ProjectRecord['status'], number, string, string, string, string, string];
        projects.push({
          project_id,
          org_id,
          owner_id,
          name,
          project_slug,
          description,
          drive_folder_id,
          status,
          canonical_revision,
          projected_at,
          projection_status: 'synced',
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        });
      } else {
        const [project_id, org_id, owner_id, name, project_slug, description, created_at, updated_at] =
          params as string[];
        projects.push({
          project_id,
          org_id,
          owner_id,
          name,
          project_slug,
          description,
          drive_folder_id: '',
          status: 'active',
          created_at,
          updated_at,
        });
      }
      return { results: [] };
    }

    if (q.startsWith('UPDATE projects SET name = ?')) {
      const [name, description, canonicalRev, projectedAt, opId, manFileId, updatedAt, projectId] =
        params as [string, string, number, string, string, string, string, string];
      const row = projects.find((p) => p.project_id === projectId);
      if (row) {
        row.name = name;
        row.description = description;
        row.canonical_revision = canonicalRev;
        row.projected_at = projectedAt;
        row.projection_status = 'synced';
        row.last_operation_id = opId;
        row.drive_manifest_file_id = manFileId;
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith("UPDATE projects SET status = 'archived'")) {
      const [canonicalRev, opId, updatedAt, projectId] = params as [number, string, string, string];
      const row = projects.find((p) => p.project_id === projectId);
      if (row) {
        row.status = 'archived';
        row.canonical_revision = canonicalRev;
        row.last_operation_id = opId;
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith('UPDATE projects SET drive_folder_id = ?')) {
      const [folderId, updatedAt, projectId] = params as string[];
      const row = projects.find((p) => p.project_id === projectId);
      if (row) {
        row.drive_folder_id = folderId;
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith('DELETE FROM projects WHERE project_id = ?')) {
      const [projectId] = params as [string];
      for (let i = projects.length - 1; i >= 0; i--) {
        if (projects[i].project_id === projectId) projects.splice(i, 1);
      }
      for (let i = projectModules.length - 1; i >= 0; i--) {
        if (projectModules[i].project_id === projectId) projectModules.splice(i, 1);
      }
      for (let i = sites.length - 1; i >= 0; i--) {
        if (sites[i].project_id === projectId) sites.splice(i, 1);
      }
      return { results: [] };
    }

    // --- project_modules ---
    if (q.includes('FROM project_modules WHERE project_id IN')) {
      return { results: projectModules.filter((m) => params.includes(m.project_id)) };
    }

    if (q.includes('FROM project_modules WHERE project_id = ?') && q.includes("module_key = 'publishing'")) {
      const [projectId] = params as [string];
      return {
        results: projectModules.filter(
          (m) => m.project_id === projectId && m.module_key === 'publishing'
        ),
      };
    }

    if (q.includes('SELECT * FROM project_modules WHERE project_id = ?')) {
      const [projectId] = params as [string];
      return { results: projectModules.filter((m) => m.project_id === projectId) };
    }

    if (q.startsWith('INSERT INTO project_modules')) {
      const [id, project_id, module_key, enabled, updated_at] = params as [
        string,
        string,
        ProjectModuleRecord['module_key'],
        number,
        string,
      ];
      const idx = projectModules.findIndex(
        (m) => m.project_id === project_id && m.module_key === module_key
      );
      if (idx >= 0) {
        projectModules[idx] = { ...projectModules[idx], enabled, updated_at };
      } else {
        projectModules.push({ id, project_id, module_key, enabled, config_json: '{}', updated_at });
      }
      return { results: [] };
    }

    // --- workspace_resources ---
    if (q.includes("SELECT drive_file_id FROM workspace_resources WHERE owner_id = ? AND resource_kind = ? AND status = 'active'")) {
      const [ownerId, kind] = params as [string, string];
      const matches = resources
        .filter((r) => r.owner_id === ownerId && r.resource_kind === kind && r.status === 'active')
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return { results: matches.slice(0, 1) };
    }

    if (q.includes("SELECT drive_file_id FROM workspace_resources WHERE org_id = ? AND project_id IS NULL")) {
      const [orgId] = params as [string];
      const kindMatch = q.match(/resource_kind = '([^']+)'/);
      const kind = kindMatch ? kindMatch[1] : '';
      return {
        results: resources.filter(
          (r) =>
            r.org_id === orgId &&
            r.project_id === null &&
            r.resource_kind === kind &&
            r.resource_key === 'default'
        ),
      };
    }

    if (q.includes('SELECT resource_id FROM workspace_resources WHERE org_id = ? AND project_id IS NULL')) {
      const [orgId, kind, key] = params as [string, string, string];
      return {
        results: resources.filter(
          (r) =>
            r.org_id === orgId &&
            r.project_id === null &&
            r.resource_kind === kind &&
            r.resource_key === key
        ),
      };
    }

    if (q.includes("SELECT owner_id FROM workspace_resources WHERE project_id = ? AND (spreadsheet_id = ? OR drive_file_id = ?)")) {
      const [projectId, ssId, dfId] = params as [string, string, string];
      return {
        results: resources.filter(
          (r) =>
            r.project_id === projectId &&
            (r.spreadsheet_id === ssId || r.drive_file_id === dfId) &&
            r.status !== 'archived'
        ),
      };
    }

    if (q.includes('FROM workspace_resources wr LEFT JOIN organization_members m')) {
      const [userId, ssId, dfId, ownerId] = params as string[];
      if (params.length === 4) {
        return {
          results: resources.filter((r) => {
            const isMember = members.some(
              (m) => m.org_id === r.org_id && m.user_id === userId && m.status === 'active'
            );
            return (
              (r.spreadsheet_id === ssId || r.drive_file_id === dfId) &&
              (r.owner_id === ownerId || isMember) &&
              r.status !== 'archived'
            );
          }),
        };
      }
      const [uId, fileId, oId] = params as [string, string, string];
      return {
        results: resources.filter((r) => {
          const isMember = members.some(
            (m) => m.org_id === r.org_id && m.user_id === uId && m.status === 'active'
          );
          return r.drive_file_id === fileId && (r.owner_id === oId || isMember);
        }),
      };
    }

    if (q.includes('FROM workspace_resources WHERE project_id = ? AND resource_kind = ? AND resource_key = ?')) {
      const [projectId, kind, key] = params as [string, string, string];
      return {
        results: resources.filter(
          (r) =>
            r.project_id === projectId &&
            r.resource_kind === kind &&
            r.resource_key === key &&
            r.status === 'active'
        ),
      };
    }

    if (
      q.includes(
        'FROM workspace_resources WHERE project_id = ? AND resource_kind IN (?, ?) AND resource_key = ?'
      )
    ) {
      const [projectId, k1, k2, key] = params as [string, string, string, string];
      return {
        results: resources.filter(
          (r) =>
            r.project_id === projectId &&
            (r.resource_kind === k1 || r.resource_kind === k2) &&
            r.resource_key === key &&
            r.status === 'active'
        ),
      };
    }

    if (
      q.includes("FROM workspace_resources WHERE project_id = ? AND status = 'active' AND resource_kind IN")
    ) {
      const [projectId] = params as [string];
      const inMatch = q.match(/resource_kind IN \(([^)]+)\)/);
      const kinds = new Set(
        (inMatch?.[1] || '')
          .split(',')
          .map((s) => s.trim().replace(/^'|'$/g, ''))
          .filter(Boolean)
      );
      return {
        results: resources.filter(
          (r) => r.project_id === projectId && r.status === 'active' && kinds.has(r.resource_kind)
        ),
      };
    }

    if (q.includes("FROM workspace_resources WHERE project_id = ? AND resource_kind IN") && q.includes("status = 'active'")) {
      const [projectId] = params as [string];
      const inMatch = q.match(/resource_kind IN \(([^)]+)\)/);
      const kinds = new Set(
        (inMatch?.[1] || '')
          .split(',')
          .map((s) => s.trim().replace(/^'|'$/g, ''))
          .filter(Boolean)
      );
      return {
        results: resources.filter(
          (r) => r.project_id === projectId && r.status === 'active' && kinds.has(r.resource_kind)
        ),
      };
    }

    if (q.includes("SELECT drive_file_id FROM workspace_resources WHERE project_id = ? AND resource_kind = 'cms_manifest'")) {
      const [projectId] = params as [string];
      return {
        results: resources.filter(
          (r) =>
            r.project_id === projectId &&
            r.resource_kind === 'cms_manifest' &&
            r.resource_key === 'default' &&
            r.status === 'active'
        ),
      };
    }

    if (q.includes("SELECT drive_file_id FROM workspace_resources WHERE project_id = ? AND resource_kind = 'inbox_state'")) {
      const [projectId] = params as [string];
      return {
        results: resources.filter(
          (r) =>
            r.project_id === projectId &&
            r.resource_kind === 'inbox_state' &&
            r.resource_key === 'default' &&
            r.status === 'active'
        ),
      };
    }

    if (
      q.includes("SELECT spreadsheet_id FROM workspace_resources WHERE project_id = ? AND resource_kind IN") ||
      q.includes("SELECT spreadsheet_id FROM workspace_resources WHERE project_id = ? AND resource_kind =")
    ) {
      const [projectId] = params as [string];
      const kindMatch = q.match(/resource_kind = '([^']+)'/);
      const targetKind = kindMatch ? kindMatch[1] : 'cms_spreadsheet';
      return {
        results: resources.filter(
          (r) => r.project_id === projectId && r.resource_kind === targetKind && r.status === 'active'
        ),
      };
    }

    if (q.includes('SELECT drive_file_id, resource_kind FROM workspace_resources WHERE project_id = ?')) {
      const [projectId] = params as [string];
      return {
        results: resources.filter(
          (r) => r.project_id === projectId && r.drive_file_id !== '' && r.status === 'active'
        ),
      };
    }

    if (q.includes('SELECT * FROM workspace_resources WHERE project_id = ?')) {
      const [projectId] = params as [string];
      return {
        results: resources.filter((r) => r.project_id === projectId && r.status !== 'archived'),
      };
    }

    if (q.includes('FROM workspace_resources WHERE org_id IN')) {
      return { results: resources.filter((r) => params.includes(r.org_id)) };
    }

    if (q.startsWith("SELECT resource_id FROM workspace_resources WHERE org_id = ? AND status = 'legacy'")) {
      const [orgId] = params as [string];
      return {
        results: resources.filter((r) => r.org_id === orgId && r.status === 'legacy'),
      };
    }

    if (q.startsWith("UPDATE workspace_resources SET status = 'archived'")) {
      const [updatedAt, resourceId, orgId] = params as [string, string, string];
      const row = resources.find(
        (r) => r.resource_id === resourceId && r.org_id === orgId && r.status === 'legacy'
      );
      if (row) {
        row.status = 'archived';
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith('INSERT OR REPLACE INTO workspace_resources')) {
      const [
        resource_id,
        owner_id,
        org_id,
        project_id,
        site_id,
        resource_kind,
        resource_key,
        drive_file_id,
        spreadsheet_id,
        parent_folder_id,
        title,
        status,
        canonical_revision,
        last_operation_id,
        created_at,
        updated_at,
      ] = params as [
        string,
        string,
        string,
        string | null,
        string | null,
        string,
        string,
        string,
        string,
        string,
        string,
        WorkspaceResourceRecord['status'],
        number,
        string,
        string,
        string,
      ];
      const idx = resources.findIndex(
        (r) =>
          r.resource_id === resource_id ||
          (r.org_id === org_id &&
            r.project_id === project_id &&
            r.resource_kind === resource_kind &&
            r.resource_key === resource_key)
      );
      const next: WorkspaceResourceRecord = {
        resource_id,
        owner_id,
        org_id,
        project_id: project_id || null,
        site_id: site_id || null,
        resource_kind,
        resource_key,
        drive_file_id,
        spreadsheet_id,
        parent_folder_id,
        title,
        status,
        canonical_revision,
        last_operation_id,
        created_at,
        updated_at,
      };
      if (idx >= 0) resources[idx] = next;
      else resources.push(next);
      return { results: [] };
    }

    if (
      q.startsWith('INSERT INTO workspace_resources') &&
      q.includes('ON CONFLICT(org_id, project_id, resource_kind, resource_key)')
    ) {
      let resource_id: string,
        owner_id: string,
        org_id: string,
        project_id: string | null,
        site_id: string | null,
        resource_kind: string,
        resource_key: string,
        drive_file_id: string,
        spreadsheet_id: string,
        parent_folder_id: string,
        title: string,
        status: WorkspaceResourceRecord['status'],
        created_at: string,
        updated_at: string;

      if (params.length >= 16) {
        const [
          rId,
          oId,
          ogId,
          pId,
          sId,
          rk,
          rKey,
          dfId,
          ssId,
          pfId,
          ttl,
          st,
          _rev,
          _op,
          cAt,
          uAt,
        ] = params as string[];
        resource_id = rId;
        owner_id = oId;
        org_id = ogId;
        project_id = pId;
        site_id = sId;
        resource_kind = rk;
        resource_key = rKey;
        drive_file_id = dfId;
        spreadsheet_id = ssId;
        parent_folder_id = pfId;
        title = ttl;
        status = st as WorkspaceResourceRecord['status'];
        created_at = cAt;
        updated_at = uAt;
      } else if (params.length === 10) {
        // completeOnboarding / createProject folderRows (10 bound params)
        const [rId, oId, ogId, pId, rk, dfId, pfId, ttl, cAt, uAt] = params as string[];
        resource_id = rId;
        owner_id = oId;
        org_id = ogId;
        project_id = pId;
        site_id = null;
        resource_kind = rk;
        resource_key = 'default';
        drive_file_id = dfId;
        spreadsheet_id = '';
        parent_folder_id = pfId;
        title = ttl;
        status = 'active';
        created_at = cAt;
        updated_at = uAt;
      } else {
        const [rId, oId, ogId, pId, sId, rk, rKey, dfId, ssId, pfId, ttl, st, cAt, uAt] =
          params as string[];
        resource_id = rId;
        owner_id = oId;
        org_id = ogId;
        project_id = pId;
        site_id = sId;
        resource_kind = rk;
        resource_key = rKey;
        drive_file_id = dfId;
        spreadsheet_id = ssId;
        parent_folder_id = pfId;
        title = ttl;
        status = st as WorkspaceResourceRecord['status'];
        created_at = cAt;
        updated_at = uAt;
      }

      const idx = resources.findIndex(
        (r) =>
          r.org_id === org_id &&
          r.project_id === project_id &&
          r.resource_kind === resource_kind &&
          r.resource_key === resource_key
      );
      if (idx >= 0) {
        resources[idx] = {
          ...resources[idx],
          drive_file_id: drive_file_id || resources[idx].drive_file_id,
          spreadsheet_id: spreadsheet_id || resources[idx].spreadsheet_id,
          parent_folder_id: parent_folder_id || resources[idx].parent_folder_id,
          title,
          status,
          updated_at,
        };
      } else {
        resources.push({
          resource_id,
          owner_id,
          org_id,
          project_id: project_id || null,
          site_id: site_id || null,
          resource_kind,
          resource_key,
          drive_file_id,
          spreadsheet_id,
          parent_folder_id,
          title,
          status,
          created_at,
          updated_at,
        });
      }
      return { results: [] };
    }

    if (q.startsWith('UPDATE workspace_resources SET drive_file_id')) {
      const [d1, , s1, , p1, , title, status, rev, opId, updatedAt, resourceId] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        number,
        string,
        string,
        string,
      ];
      const row = resources.find((r) => r.resource_id === resourceId);
      if (row) {
        if (d1) row.drive_file_id = d1;
        if (s1) row.spreadsheet_id = s1;
        if (p1) row.parent_folder_id = p1;
        row.title = title;
        row.status = status as WorkspaceResourceRecord['status'];
        row.canonical_revision = rev;
        row.last_operation_id = opId;
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith('INSERT INTO workspace_resources (')) {
      if (q.includes("'builly_root', 'default'") && params.length === 7) {
        // rebuildD1FromDrive root row
        const [resource_id, owner_id, drive_file_id, rev, opId, created_at, updated_at] = params as [
          string,
          string,
          string,
          number,
          string,
          string,
          string,
        ];
        resources.push({
          resource_id,
          owner_id,
          org_id: 'account',
          project_id: null,
          site_id: null,
          resource_kind: 'builly_root',
          resource_key: 'default',
          drive_file_id,
          spreadsheet_id: '',
          parent_folder_id: 'root',
          title: 'Builly',
          status: 'active',
          canonical_revision: rev,
          last_operation_id: opId,
          created_at,
          updated_at,
        });
        return { results: [] };
      }
      if (params.length >= 15) {
        const [
          resource_id,
          owner_id,
          org_id,
          site_id,
          resource_kind,
          resource_key,
          drive_file_id,
          spreadsheet_id,
          parent_folder_id,
          title,
          status,
          rev,
          opId,
          created_at,
          updated_at,
        ] = params as [
          string,
          string,
          string,
          string | null,
          string,
          string,
          string,
          string,
          string,
          string,
          WorkspaceResourceRecord['status'],
          number,
          string,
          string,
          string,
        ];
        resources.push({
          resource_id,
          owner_id,
          org_id,
          project_id: null,
          site_id: site_id || null,
          resource_kind,
          resource_key,
          drive_file_id,
          spreadsheet_id,
          parent_folder_id,
          title,
          status,
          canonical_revision: rev,
          last_operation_id: opId,
          created_at,
          updated_at,
        });
      } else {
        const [
          resource_id,
          owner_id,
          org_id,
          site_id,
          resource_kind,
          resource_key,
          drive_file_id,
          spreadsheet_id,
          parent_folder_id,
          title,
          status,
          created_at,
          updated_at,
        ] = params as string[];
        resources.push({
          resource_id,
          owner_id,
          org_id,
          project_id: null,
          site_id: site_id || null,
          resource_kind,
          resource_key,
          drive_file_id,
          spreadsheet_id,
          parent_folder_id,
          title,
          status: status as WorkspaceResourceRecord['status'],
          created_at,
          updated_at,
        });
      }
      return { results: [] };
    }

    if (q.startsWith('INSERT OR IGNORE INTO workspace_resources')) {
      if (q.includes("'builly_root', 'default'") && params.length === 6) {
        const [resource_id, owner_id, org_id, drive_file_id, last_operation_id, created_at, updated_at] = [
          params[0],
          params[1],
          params[2],
          params[3],
          params[4],
          params[5],
          params[5],
        ] as string[];
        if (!resources.some((r) => r.org_id === org_id && r.resource_kind === 'builly_root')) {
          resources.push({
            resource_id,
            owner_id,
            org_id,
            project_id: null,
            site_id: null,
            resource_kind: 'builly_root',
            resource_key: 'default',
            drive_file_id,
            spreadsheet_id: '',
            parent_folder_id: 'root',
            title: 'Builly',
            status: 'active',
            last_operation_id,
            created_at,
            updated_at,
          });
        }
        return { results: [] };
      }
      if (q.includes("'org_root', 'default'") && params.length === 8) {
        const [resource_id, owner_id, org_id, drive_file_id, parent_folder_id, title, last_op, created_at, updated_at] =
          [params[0], params[1], params[2], params[3], params[4], params[5], params[6], params[7], params[7]] as string[];
        if (!resources.some((r) => r.org_id === org_id && r.resource_kind === 'org_root')) {
          resources.push({
            resource_id,
            owner_id,
            org_id,
            project_id: null,
            site_id: null,
            resource_kind: 'org_root',
            resource_key: 'default',
            drive_file_id,
            spreadsheet_id: '',
            parent_folder_id,
            title,
            status: 'active',
            last_operation_id: last_op,
            created_at,
            updated_at,
          });
        }
        return { results: [] };
      }
      if (params.length === 9 && q.includes("'default'")) {
        // completeOnboarding top-level folderMappings
        const [resource_id, owner_id, org_id, kind, drive_file_id, parent_folder_id, title, created_at, updated_at] =
          params as string[];
        if (!resources.some((r) => r.org_id === org_id && r.project_id === null && r.resource_kind === kind)) {
          resources.push({
            resource_id,
            owner_id,
            org_id,
            project_id: null,
            site_id: null,
            resource_kind: kind,
            resource_key: 'default',
            drive_file_id,
            spreadsheet_id: '',
            parent_folder_id,
            title,
            status: 'active',
            created_at,
            updated_at,
          });
        }
        return { results: [] };
      }
      if (params.length === 10 && q.includes("'default'")) {
        // completeOnboarding project folders
        const [
          resource_id,
          owner_id,
          org_id,
          project_id,
          kind,
          drive_file_id,
          parent_folder_id,
          title,
          created_at,
          updated_at,
        ] = params as string[];
        if (!resources.some((r) => r.org_id === org_id && r.project_id === project_id && r.resource_kind === kind)) {
          resources.push({
            resource_id,
            owner_id,
            org_id,
            project_id,
            site_id: null,
            resource_kind: kind,
            resource_key: 'default',
            drive_file_id,
            spreadsheet_id: '',
            parent_folder_id,
            title,
            status: 'active',
            created_at,
            updated_at,
          });
        }
        return { results: [] };
      }
      const [resource_id, owner_id, org_id, project_id, resource_key, spreadsheet_id, title, created_at, updated_at] =
        params as string[];
      resources.push({
        resource_id,
        owner_id,
        org_id,
        project_id: project_id || null,
        site_id: null,
        resource_kind: q.includes("'builly_root'") ? 'builly_root' : 'legacy_sheet',
        resource_key: q.includes("'builly_root'") ? 'default' : resource_key,
        drive_file_id: q.includes("'builly_root'") ? resource_key : '',
        spreadsheet_id: q.includes("'builly_root'") ? '' : spreadsheet_id,
        parent_folder_id: '',
        title: title || 'Resource',
        status: q.includes("'legacy'") ? 'legacy' : 'active',
        created_at,
        updated_at,
      });
      return { results: [] };
    }

    if (q.startsWith('DELETE FROM workspace_resources WHERE project_id = ?')) {
      const [projectId] = params as [string];
      for (let i = resources.length - 1; i >= 0; i--) {
        if (resources[i].project_id === projectId) resources.splice(i, 1);
      }
      return { results: [] };
    }

    if (q.startsWith('DELETE FROM workspace_resources WHERE org_id = ?')) {
      const [orgId] = params as [string];
      for (let i = resources.length - 1; i >= 0; i--) {
        if (resources[i].org_id === orgId) resources.splice(i, 1);
      }
      return { results: [] };
    }

    if (q.startsWith('DELETE FROM workspace_resources WHERE owner_id = ?')) {
      const [ownerId] = params as [string];
      for (let i = resources.length - 1; i >= 0; i--) {
        if (resources[i].owner_id === ownerId) resources.splice(i, 1);
      }
      return { results: [] };
    }

    // --- sites & site_registry ---
    if (q.includes('FROM site_form_destinations WHERE site_id = ? AND form_id = ?')) {
      const [siteId, formId] = params as [string, string];
      return {
        results: formDestinations.filter(
          (d) => d.site_id === siteId && d.form_id === formId && d.status === 'active'
        ),
      };
    }

    if (q.includes('FROM site_form_destinations WHERE site_id = ?')) {
      const [siteId] = params as [string];
      return { results: formDestinations.filter((d) => d.site_id === siteId) };
    }

    if (q.includes('FROM form_submission_idempotency WHERE site_id = ?')) {
      const [siteId] = params as [string];
      return { results: formIdempotency.filter((l) => l.site_id === siteId) };
    }

    if (q.includes('FROM site_dataset_resources')) {
      const [siteId, datasetKey] = params as [string, string];
      return {
        results: siteDatasetResources.filter(
          (d) => d.site_id === siteId && d.dataset_key === datasetKey && d.status === 'active'
        ),
      };
    }

    if (q.includes('FROM sites WHERE project_id = ?')) {
      const [projectId] = params as [string];
      return { results: sites.filter((s) => s.project_id === projectId) };
    }

    if (q.includes('FROM site_release_history WHERE site_slug = ? AND owner_id = ? AND publish_version = ?')) {
      const [slug, ownerId, ver] = params as [string, string, string];
      return {
        results: siteReleaseHistory.filter(
          (r) => r.site_slug === slug && r.owner_id === ownerId && r.publish_version === ver
        ),
      };
    }

    if (q.includes('FROM site_release_history WHERE site_id = ?')) {
      const [siteId] = params as [string];
      return { results: siteReleaseHistory.filter((r) => r.site_id === siteId) };
    }

    if (q.startsWith('INSERT INTO site_release_history')) {
      const [
        id,
        site_id,
        site_slug,
        owner_id,
        publish_version,
        build_id,
        runtime_config_drive_file_id,
        publish_manifest_drive_file_id,
        integrity_hash,
        schema_version,
        commit_message,
        created_at,
      ] = params as [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        number,
        string,
        string,
      ];
      siteReleaseHistory.push({
        id,
        site_id,
        site_slug,
        owner_id,
        publish_version,
        build_id,
        runtime_config_drive_file_id,
        publish_manifest_drive_file_id,
        integrity_hash,
        schema_version,
        commit_message,
        created_at,
      });
      return { results: [] };
    }

    if (q.includes("FROM site_registry WHERE owner_id = ? AND (project_id IS NULL OR project_id = '')")) {
      const [ownerId] = params as [string];
      return {
        results: siteRegistry.filter(
          (r) => r.owner_id === ownerId && (!r.project_id || r.project_id === '')
        ),
      };
    }

    if (q.includes('FROM site_registry WHERE site_id = ? AND owner_id = ?')) {
      const [siteId, ownerId] = params as [string, string];
      return {
        results: siteRegistry.filter((r) => r.site_id === siteId && r.owner_id === ownerId),
      };
    }

    if (q.includes('FROM site_registry WHERE lower(custom_domain) = ? AND status =')) {
      const [host] = params as [string];
      return {
        results: siteRegistry.filter(
          (r) => (r.custom_domain || '').toLowerCase() === host && r.status === 'published'
        ),
      };
    }

    if (q.includes("FROM site_registry WHERE site_slug = ? AND status = 'published'")) {
      const [slug] = params as [string];
      return { results: siteRegistry.filter((r) => r.site_slug === slug && r.status === 'published') };
    }

    if (q.includes('FROM site_registry WHERE site_slug = ? AND site_id != ?')) {
      const [slug, siteId] = params as [string, string];
      return { results: siteRegistry.filter((r) => r.site_slug === slug && r.site_id !== siteId) };
    }

    if (q.includes('FROM site_registry WHERE site_slug = ?')) {
      const [slug] = params as [string];
      return { results: siteRegistry.filter((r) => r.site_slug === slug) };
    }

    if (q.includes('FROM sites WHERE site_slug = ? AND site_id != ?')) {
      const [slug, siteId] = params as [string, string];
      return { results: sites.filter((s) => s.site_slug === slug && s.site_id !== siteId) };
    }

    if (q.includes('FROM sites WHERE site_slug = ?')) {
      const [slug] = params as [string];
      return { results: sites.filter((s) => s.site_slug === slug) };
    }

    if (q.includes('FROM sites WHERE org_id IN')) {
      return { results: sites.filter((s) => params.includes(s.org_id)) };
    }

    if (q.startsWith('INSERT INTO site_registry')) {
      // ownerPublish upsert OR rebuildD1FromDrive insert
      const [
        site_id,
        site_slug,
        custom_domain,
        owner_id,
        org_id,
        project_id,
        site_name,
        active_publish_version,
        active_build_id,
        publish_manifest_drive_file_id,
        runtime_config_drive_file_id,
        integrity_hash,
        schema_version_or_rev,
        ...rest
      ] = params as [
        string,
        string,
        string | null,
        string,
        string | null,
        string | null,
        string,
        string,
        string,
        string,
        string,
        string,
        number,
        ...unknown[],
      ];

      let schema_version = 1;
      let canonical_revision = 1;
      let indexed_at = '';
      let last_verified_at = '';
      let last_operation_id = '';
      let updated_at = '';

      if (q.includes('ON CONFLICT(site_id)')) {
        // ownerPublish: schema_version bound, then rev, indexed, verified, opId, updated
        schema_version = Number(schema_version_or_rev || 1);
        canonical_revision = Number(rest[0] || 1);
        indexed_at = String(rest[1] || '');
        last_verified_at = String(rest[2] || '');
        last_operation_id = String(rest[3] || '');
        updated_at = String(rest[4] || '');
      } else {
        // rebuildD1FromDrive: schema_version is hardcoded '1' in SQL
        canonical_revision = Number(schema_version_or_rev || 1);
        indexed_at = String(rest[0] || '');
        last_verified_at = String(rest[1] || '');
        last_operation_id = String(rest[2] || '');
        updated_at = String(rest[3] || '');
      }

      const idx = siteRegistry.findIndex((r) => r.site_id === site_id);
      const next: MockSiteRegistryRow = {
        site_id,
        site_slug,
        custom_domain,
        owner_id,
        org_id: org_id ?? (idx >= 0 ? siteRegistry[idx].org_id : null),
        project_id: project_id ?? (idx >= 0 ? siteRegistry[idx].project_id : null),
        site_name,
        status: 'published',
        active_publish_version,
        active_build_id,
        publish_manifest_drive_file_id,
        runtime_config_drive_file_id,
        integrity_hash,
        schema_version,
        canonical_revision,
        indexed_at,
        last_verified_at,
        projection_status: 'synced',
        last_operation_id,
        updated_at,
      };
      if (idx >= 0) siteRegistry[idx] = next;
      else siteRegistry.push(next);
      return { results: [] };
    }

    if (q.startsWith('UPDATE site_registry SET org_id = ?, project_id = ?')) {
      const [orgId, projectId, siteId, ownerId] = params as [string, string, string, string];
      const requireUnattached = q.includes('project_id IS NULL');
      const row = siteRegistry.find(
        (r) =>
          r.site_id === siteId &&
          r.owner_id === ownerId &&
          (!requireUnattached || !r.project_id || r.project_id === '')
      );
      if (row) {
        row.org_id = orgId;
        row.project_id = projectId;
      }
      return { results: [] };
    }

    if (q.startsWith('UPDATE site_registry SET site_name = ?, site_slug = ?')) {
      if (params.length >= 7) {
        const [siteName, siteSlug, canonicalRev, lastOpId, updatedAt, siteId, ownerId] =
          params as [string, string, number, string, string, string, string];
        const row = siteRegistry.find((r) => r.site_id === siteId && r.owner_id === ownerId);
        if (row) {
          row.site_name = siteName;
          row.site_slug = siteSlug;
          row.canonical_revision = canonicalRev;
          row.last_operation_id = lastOpId;
          row.updated_at = updatedAt;
        }
      } else {
        const [siteName, siteSlug, updatedAt, siteId, ownerId] = params as string[];
        const row = siteRegistry.find((r) => r.site_id === siteId && r.owner_id === ownerId);
        if (row) {
          row.site_name = siteName;
          row.site_slug = siteSlug;
          row.updated_at = updatedAt;
        }
      }
      return { results: [] };
    }

    if (q.startsWith('DELETE FROM site_registry WHERE project_id = ?')) {
      const [projectId] = params as [string];
      for (let i = siteRegistry.length - 1; i >= 0; i--) {
        if (siteRegistry[i].project_id === projectId) siteRegistry.splice(i, 1);
      }
      return { results: [] };
    }

    if (q.startsWith('DELETE FROM site_registry WHERE owner_id = ?')) {
      const [ownerId] = params as [string];
      for (let i = siteRegistry.length - 1; i >= 0; i--) {
        if (siteRegistry[i].owner_id === ownerId) siteRegistry.splice(i, 1);
      }
      return { results: [] };
    }

    if (q.startsWith('INSERT OR IGNORE INTO sites')) {
      if (params.length === 14) {
        // completeOnboarding attached registry site
        const [
          site_id,
          project_id,
          org_id,
          owner_id,
          site_slug,
          site_name,
          custom_domain,
          status,
          active_publish_version,
          active_build_id,
          drive_config_folder_id,
          projected_at,
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        ] = params as unknown[];
        void site_id;
        void updated_at;
        // Not reachable with 14 — handle exact 16 or 14 below
        void project_id;
        void org_id;
        void owner_id;
        void site_slug;
        void site_name;
        void custom_domain;
        void status;
        void active_publish_version;
        void active_build_id;
        void drive_config_folder_id;
        void projected_at;
        void last_operation_id;
        void drive_manifest_file_id;
        void created_at;
      }
      if (params.length === 16) {
        const [
          site_id,
          project_id,
          org_id,
          owner_id,
          site_slug,
          site_name,
          custom_domain,
          status,
          active_publish_version,
          active_build_id,
          drive_config_folder_id,
          projected_at,
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        ] = params as [
          string,
          string,
          string,
          string,
          string,
          string,
          string | null,
          SiteRecord['status'],
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        if (!sites.some((s) => s.site_id === site_id || s.site_slug === site_slug)) {
          sites.push({
            site_id,
            project_id,
            org_id,
            owner_id,
            site_slug,
            site_name,
            custom_domain,
            status,
            active_publish_version,
            active_build_id,
            drive_config_folder_id,
            canonical_revision: 1,
            projected_at,
            projection_status: 'synced',
            last_operation_id,
            drive_manifest_file_id,
            created_at,
            updated_at,
          });
        }
      } else {
        const [
          site_id,
          project_id,
          org_id,
          owner_id,
          site_slug,
          site_name,
          custom_domain,
          status,
          active_publish_version,
          active_build_id,
          created_at,
          updated_at,
        ] = params as [
          string,
          string,
          string,
          string,
          string,
          string,
          string | null,
          SiteRecord['status'],
          string,
          string,
          string,
          string,
        ];
        if (!sites.some((s) => s.site_id === site_id || s.site_slug === site_slug)) {
          sites.push({
            site_id,
            project_id,
            org_id,
            owner_id,
            site_slug,
            site_name,
            custom_domain,
            status,
            active_publish_version,
            active_build_id,
            drive_config_folder_id: '',
            created_at,
            updated_at,
          });
        }
      }
      return { results: [] };
    }

    if (q.startsWith('INSERT INTO sites')) {
      if (params.length >= 17) {
        // rebuildD1FromDrive
        const [
          site_id,
          project_id,
          org_id,
          owner_id,
          site_slug,
          site_name,
          custom_domain,
          status,
          active_publish_version,
          active_build_id,
          drive_config_folder_id,
          canonical_revision,
          projected_at,
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        ] = params as [
          string,
          string,
          string,
          string,
          string,
          string,
          string | null,
          SiteRecord['status'],
          string,
          string,
          string,
          number,
          string,
          string,
          string,
          string,
          string,
        ];
        sites.push({
          site_id,
          project_id,
          org_id,
          owner_id,
          site_slug,
          site_name,
          custom_domain,
          status,
          active_publish_version,
          active_build_id,
          drive_config_folder_id,
          canonical_revision,
          projected_at,
          projection_status: 'synced',
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        });
      } else if (params.length === 12) {
        // createSiteInProject
        const [
          site_id,
          project_id,
          org_id,
          owner_id,
          site_slug,
          site_name,
          drive_config_folder_id,
          projected_at,
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        ] = params as string[];
        if (sites.some((s) => s.site_slug === site_slug)) {
          throw new Error('UNIQUE constraint failed: sites.site_slug');
        }
        sites.push({
          site_id,
          project_id,
          org_id,
          owner_id,
          site_slug,
          site_name,
          custom_domain: null,
          status: 'draft',
          active_publish_version: '',
          active_build_id: '',
          drive_config_folder_id,
          canonical_revision: 1,
          projected_at,
          projection_status: 'synced',
          last_operation_id,
          drive_manifest_file_id,
          created_at,
          updated_at,
        });
      } else {
        const [site_id, project_id, org_id, owner_id, site_slug, site_name, created_at, updated_at] =
          params as string[];
        if (sites.some((s) => s.site_slug === site_slug)) {
          throw new Error('UNIQUE constraint failed: sites.site_slug');
        }
        sites.push({
          site_id,
          project_id,
          org_id,
          owner_id,
          site_slug,
          site_name,
          custom_domain: null,
          status: 'draft',
          active_publish_version: '',
          active_build_id: '',
          drive_config_folder_id: '',
          created_at,
          updated_at,
        });
      }
      return { results: [] };
    }

    if (q.startsWith('UPDATE sites SET site_name = ?, site_slug = ?, custom_domain = ?')) {
      // ownerPublish
      const [
        site_name,
        site_slug,
        custom_domain,
        active_publish_version,
        active_build_id,
        driveCond,
        driveVal,
        rev,
        projected_at,
        last_operation_id,
        updated_at,
        site_id,
        owner_id,
      ] = params as [
        string,
        string,
        string | null,
        string,
        string,
        string,
        string,
        number,
        string,
        string,
        string,
        string,
        string,
      ];
      const row = sites.find((s) => s.site_id === site_id && s.owner_id === owner_id);
      if (row) {
        row.site_name = site_name;
        row.site_slug = site_slug;
        row.custom_domain = custom_domain;
        row.status = 'published';
        row.active_publish_version = active_publish_version;
        row.active_build_id = active_build_id;
        if (driveCond) row.drive_config_folder_id = driveVal;
        row.canonical_revision = rev;
        row.projected_at = projected_at;
        row.projection_status = 'synced';
        row.last_operation_id = last_operation_id;
        row.updated_at = updated_at;
      }
      return { results: [] };
    }

    if (q.startsWith('UPDATE sites SET site_name = ?, site_slug = ?')) {
      if (params.length >= 7) {
        const [siteName, siteSlug, canonicalRev, projectedAt, opId, updatedAt, siteId] = params as [
          string,
          string,
          number,
          string,
          string,
          string,
          string,
        ];
        const row = sites.find((s) => s.site_id === siteId);
        if (row) {
          row.site_name = siteName;
          row.site_slug = siteSlug;
          row.canonical_revision = canonicalRev;
          row.projected_at = projectedAt;
          row.projection_status = 'synced';
          row.last_operation_id = opId;
          row.updated_at = updatedAt;
        }
      } else {
        const [siteName, siteSlug, updatedAt, siteId] = params as string[];
        const row = sites.find((s) => s.site_id === siteId);
        if (row) {
          row.site_name = siteName;
          row.site_slug = siteSlug;
          row.updated_at = updatedAt;
        }
      }
      return { results: [] };
    }

    // --- rate limits ---
    if (q.includes('FROM runtime_rate_limits WHERE bucket_key = ?')) {
      const [key] = params as [string];
      const row = runtimeRateLimits.find((r) => r.bucket_key === key);
      return { results: row ? [row] : [] };
    }
    if (q.startsWith('INSERT INTO runtime_rate_limits')) {
      const [key, win] = params as [string, number];
      const idx = runtimeRateLimits.findIndex((r) => r.bucket_key === key);
      if (idx >= 0) runtimeRateLimits[idx] = { bucket_key: key, window_start: win, count: 1 };
      else runtimeRateLimits.push({ bucket_key: key, window_start: win, count: 1 });
      return { results: [] };
    }
    if (q.startsWith('UPDATE runtime_rate_limits SET count = ?')) {
      const [count, key] = params as [number, string];
      const row = runtimeRateLimits.find((r) => r.bucket_key === key);
      if (row) row.count = count;
      return { results: [] };
    }

    return { results: [] };
  };

  const makeStatement = (sql: string, bound: unknown[] = []) => {
    const stmt = {
      bind(...args: unknown[]) {
        return makeStatement(sql, args);
      },
      async first<T>() {
        const res = executeQuery(sql, bound);
        return (res.results[0] as T) || null;
      },
      async all<T>() {
        return executeQuery(sql, bound) as { results: T[] };
      },
      async run() {
        executeQuery(sql, bound);
        return { success: true };
      },
    };
    return stmt;
  };

  const db = {
    prepare(sql: string) {
      return makeStatement(sql);
    },
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      const out = [];
      for (const s of statements) {
        out.push(await s.run());
      }
      return out;
    },
  };

  return {
    db: db as unknown as WorkerEnv['DB'],
    failNextStatementMatching(pattern: RegExp, message = 'D1_INJECTED_WRITE_FAILURE', times = 1) {
      failMatchers.push({ pattern, remaining: times, message });
    },
    clearFailures() {
      failMatchers.length = 0;
    },
    tables: {
      organizations,
      members,
      projects,
      projectModules,
      sites,
      resources,
      siteRegistry,
      idempotency,
      credentials,
      formDestinations,
      formIdempotency,
      siteReleaseHistory,
      siteDatasetResources,
      operationsProjection,
      projectionRepairQueue,
      managementCache,
      publicRuntimeArtifacts,
    },
  };
}

export function createTestEnv(db: WorkerEnv['DB'], overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    DB: db,
    GOOGLE_OAUTH_CLIENT_ID: 'test-client',
    GOOGLE_OAUTH_CLIENT_SECRET: 'test-secret',
    GOOGLE_OAUTH_REDIRECT_URI: 'https://worker.example/api/google/oauth/callback',
    GOOGLE_WORKSPACE_SCOPES: 'https://www.googleapis.com/auth/drive.file',
    TOKEN_ENCRYPTION_KEY: btoa('0123456789abcdef0123456789abcdef'),
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_ANON_KEY: 'anon',
    ALLOWED_FRONTEND_ORIGINS: 'http://localhost:3000',
    ...overrides,
  };
}

export async function seedConnectedCredential(
  mock: ReturnType<typeof createInMemoryMockD1>,
  env: WorkerEnv,
  owner: VerifiedSession,
  refreshToken = 'secret_google_refresh_token'
) {
  const enc = await encryptSecret(refreshToken, env.TOKEN_ENCRYPTION_KEY);
  const existingIdx = mock.tables.credentials.findIndex((c) => c.owner_id === owner.ownerId);
  const row: StoredCredentialRow = {
    owner_id: owner.ownerId,
    google_subject: `sub_${owner.ownerId}`,
    google_email: owner.email,
    google_name: owner.email.split('@')[0] || 'User',
    google_avatar: '',
    granted_scopes: JSON.stringify([
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/spreadsheets',
    ]),
    encrypted_refresh_token: enc.ciphertext,
    encryption_iv: enc.iv,
    status: 'connected',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
  if (existingIdx >= 0) mock.tables.credentials[existingIdx] = row;
  else mock.tables.credentials.push(row);
}

export interface MockDriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  trashed: boolean;
  appProperties: Record<string, string>;
  etag: string;
  modifiedTime: string;
  content?: string;
}

export interface MockSpreadsheet {
  spreadsheetId: string;
  title: string;
  sheets: string[];
  values: Record<string, unknown[][]>;
}

export interface FaultRule {
  match: (url: string, method: string, bodyText: string) => boolean;
  remaining?: number; // default 1
  status: number;
  responseBody?: unknown;
  sideEffectBeforeFail?: (helpers: { url: string; method: string; bodyText: string }) => void;
}

export function createStatefulGoogleAndAuthFetchMock(options?: {
  ownerA?: VerifiedSession;
  ownerB?: VerifiedSession;
  oauthToken?: string;
}) {
  const ownerA = options?.ownerA || { ownerId: 'user_alice', email: 'alice@studio.com' };
  const ownerB = options?.ownerB || { ownerId: 'user_bob', email: 'bob@agency.com' };
  const oauthToken = options?.oauthToken || 'SERVER_ONLY_GOOGLE_ACCESS_TOKEN';

  const driveFiles = new Map<string, MockDriveFile>();
  const sheetsStore = new Map<string, MockSpreadsheet>();
  const faultRules: FaultRule[] = [];
  const stats = {
    driveCreateCalls: 0,
    driveFolderCreateCalls: 0,
    driveUploadCalls: 0,
    sheetsCreateCalls: 0,
    oauthTokenCalls: 0,
  };

  let idSeq = 0;
  const nextId = (prefix: string) => {
    idSeq += 1;
    return `${prefix}_${idSeq}`;
  };

  const parseMultipart = (raw: string): { metadata?: Record<string, unknown>; payloadText?: string } => {
    const boundaryMatch = raw.match(/^--([^\r\n]+)/);
    if (!boundaryMatch) return {};
    const boundary = `--${boundaryMatch[1]}`;
    const parts = raw
      .split(boundary)
      .map((p) => p.trim())
      .filter((p) => p && p !== '--');

    let metadata: Record<string, unknown> | undefined;
    let payloadText: string | undefined;

    if (parts[0]) {
      const splitIdx = parts[0].indexOf('\r\n\r\n');
      if (splitIdx >= 0) {
        try {
          metadata = JSON.parse(parts[0].slice(splitIdx + 4)) as Record<string, unknown>;
        } catch {
          metadata = undefined;
        }
      }
    }
    if (parts[1]) {
      const splitIdx = parts[1].indexOf('\r\n\r\n');
      if (splitIdx >= 0) {
        payloadText = parts[1].slice(splitIdx + 4);
      }
    }
    return { metadata, payloadText };
  };

  const matchDriveQuery = (file: MockDriveFile, rawQ: string): boolean => {
    const q = decodeURIComponent(rawQ || '');
    if (q.includes('trashed = false') && file.trashed) return false;

    const parentMatches = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
    for (const p of parentMatches) {
      if (!file.parents.includes(p)) return false;
    }

    const nameMatch = q.match(/name = '((?:\\'|[^'])+)'/);
    if (nameMatch) {
      const targetName = nameMatch[1].replace(/\\'/g, "'");
      if (file.name !== targetName) return false;
    }

    const mimeMatch = q.match(/mimeType = '([^']+)'/);
    if (mimeMatch) {
      if (file.mimeType !== mimeMatch[1]) return false;
    }

    const propMatches = [
      ...q.matchAll(/appProperties has \{ key='([^']+)' and value='((?:\\'|[^'])+)' \}/g),
    ];
    for (const pm of propMatches) {
      const key = pm[1];
      const val = pm[2].replace(/\\'/g, "'");
      if (file.appProperties?.[key] !== val) return false;
    }

    return true;
  };

  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method || 'GET').toUpperCase();
    const bodyText =
      typeof init?.body === 'string'
        ? init.body
        : init?.body instanceof Uint8Array
        ? new TextDecoder().decode(init.body)
        : '';

    for (const rule of faultRules) {
      if ((rule.remaining ?? 1) > 0 && rule.match(url, method, bodyText)) {
        rule.remaining = (rule.remaining ?? 1) - 1;
        rule.sideEffectBeforeFail?.({ url, method, bodyText });
        return Response.json(rule.responseBody ?? { error: 'Injected fault' }, { status: rule.status });
      }
    }

    // --- Supabase Auth ---
    if (url.endsWith('/auth/v1/user')) {
      const auth = ((init?.headers as Record<string, string>)?.Authorization ||
        (init?.headers as Record<string, string>)?.authorization ||
        '') as string;
      if (!auth || auth.includes('invalid')) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (auth.includes('bob')) {
        return Response.json({ id: ownerB.ownerId, email: ownerB.email });
      }
      return Response.json({ id: ownerA.ownerId, email: ownerA.email });
    }

    // --- Google OAuth ---
    if (url === 'https://oauth2.googleapis.com/token') {
      stats.oauthTokenCalls += 1;
      return Response.json({ access_token: oauthToken, expires_in: 3600 });
    }
    if (url.startsWith('https://oauth2.googleapis.com/revoke')) {
      return Response.json({ ok: true });
    }

    // --- Drive Multipart Upload (Create / Update) ---
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      stats.driveUploadCalls += 1;
      const urlObj = new URL(url);
      const pathPart = urlObj.pathname.replace(/^\/upload\/drive\/v3\/files\/?/, '');
      const { metadata, payloadText } = parseMultipart(bodyText);

      if (method === 'PATCH' && pathPart) {
        const fileId = decodeURIComponent(pathPart);
        const existing = driveFiles.get(fileId);
        if (!existing) {
          return Response.json({ error: 'Not found' }, { status: 404 });
        }
        const headers = (init?.headers || {}) as Record<string, string>;
        const ifMatch = headers['If-Match'] || headers['if-match'];
        if (ifMatch && ifMatch !== existing.etag) {
          return Response.json({ error: 'Precondition Failed (ETag mismatch)' }, { status: 412 });
        }
        existing.name = (metadata?.name as string) || existing.name;
        existing.appProperties = {
          ...existing.appProperties,
          ...((metadata?.appProperties as Record<string, string>) || {}),
        };
        if (payloadText !== undefined) {
          existing.content = payloadText;
        }
        existing.etag = nextId('etag');
        existing.modifiedTime = new Date().toISOString();
        return Response.json(
          {
            id: existing.id,
            name: existing.name,
            mimeType: existing.mimeType,
            parents: existing.parents,
            modifiedTime: existing.modifiedTime,
            appProperties: existing.appProperties,
          },
          { headers: { ETag: existing.etag } }
        );
      }

      const id = nextId('drv_file');
      const etag = nextId('etag');
      const entry: MockDriveFile = {
        id,
        name: String(metadata?.name || 'untitled.json'),
        mimeType: String(metadata?.mimeType || 'application/json'),
        parents: Array.isArray(metadata?.parents) ? (metadata?.parents as string[]) : ['root'],
        trashed: false,
        appProperties: (metadata?.appProperties as Record<string, string>) || {},
        etag,
        modifiedTime: new Date().toISOString(),
        content: payloadText ?? '{}',
      };
      driveFiles.set(id, entry);
      return Response.json(
        {
          id: entry.id,
          name: entry.name,
          mimeType: entry.mimeType,
          parents: entry.parents,
          modifiedTime: entry.modifiedTime,
          appProperties: entry.appProperties,
        },
        { headers: { ETag: entry.etag } }
      );
    }

    // --- Drive Search ---
    if (url.startsWith('https://www.googleapis.com/drive/v3/files?')) {
      const urlObj = new URL(url);
      if (method === 'POST') {
        const body = JSON.parse(bodyText || '{}') as {
          name?: string;
          mimeType?: string;
          parents?: string[];
          appProperties?: Record<string, string>;
        };
        const isFolder = body.mimeType === 'application/vnd.google-apps.folder';
        stats.driveCreateCalls += 1;
        if (isFolder) stats.driveFolderCreateCalls += 1;

        const id = nextId(isFolder ? 'fld' : 'drv');
        const entry: MockDriveFile = {
          id,
          name: body.name || 'Untitled',
          mimeType: body.mimeType || 'application/vnd.google-apps.folder',
          parents: body.parents || ['root'],
          trashed: false,
          appProperties: body.appProperties || {},
          etag: nextId('etag'),
          modifiedTime: new Date().toISOString(),
        };
        driveFiles.set(id, entry);
        return Response.json(
          {
            id: entry.id,
            name: entry.name,
            mimeType: entry.mimeType,
            parents: entry.parents,
            appProperties: entry.appProperties,
          },
          { headers: { ETag: entry.etag } }
        );
      }

      const rawQ = urlObj.searchParams.get('q') || '';
      const matched = Array.from(driveFiles.values()).filter((f) => matchDriveQuery(f, rawQ));
      return Response.json({
        files: matched.map((f) => ({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          parents: f.parents,
          trashed: f.trashed,
          modifiedTime: f.modifiedTime,
          appProperties: f.appProperties,
        })),
      });
    }

    // --- Drive Single File Read / Update ---
    if (url.startsWith('https://www.googleapis.com/drive/v3/files/')) {
      const urlObj = new URL(url);
      const fileId = decodeURIComponent(urlObj.pathname.replace(/^\/drive\/v3\/files\//, ''));
      const file = driveFiles.get(fileId);

      if (method === 'PATCH') {
        if (!file) return Response.json({ error: 'Not found' }, { status: 404 });
        const patch = JSON.parse(bodyText || '{}') as {
          trashed?: boolean;
          appProperties?: Record<string, string>;
        };
        const addParents = urlObj.searchParams.get('addParents');
        if (addParents) {
          file.parents = Array.from(new Set([addParents]));
        }
        if (typeof patch.trashed === 'boolean') file.trashed = patch.trashed;
        if (patch.appProperties) {
          file.appProperties = { ...file.appProperties, ...patch.appProperties };
        }
        file.etag = nextId('etag');
        return Response.json(
          {
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            parents: file.parents,
            trashed: file.trashed,
            appProperties: file.appProperties,
          },
          { headers: { ETag: file.etag } }
        );
      }

      if (!file) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      if (urlObj.searchParams.get('alt') === 'media') {
        return new Response(file.content || '{}', {
          status: 200,
          headers: {
            'Content-Type': file.mimeType || 'application/json',
            ETag: file.etag,
          },
        });
      }
      return Response.json(
        {
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          parents: file.parents,
          trashed: file.trashed,
          modifiedTime: file.modifiedTime,
          appProperties: file.appProperties,
        },
        { headers: { ETag: file.etag } }
      );
    }

    // --- Google Sheets v4 API ---
    if (url === 'https://sheets.googleapis.com/v4/spreadsheets' && method === 'POST') {
      stats.sheetsCreateCalls += 1;
      const body = JSON.parse(bodyText || '{}') as {
        properties?: { title?: string };
        sheets?: Array<{ properties?: { title?: string } }>;
      };
      const ssId = nextId('ss');
      const title = body.properties?.title || 'Untitled Spreadsheet';
      const tabNames = (body.sheets || [])
        .map((s) => s.properties?.title || '')
        .filter(Boolean);
      const initialSheets = tabNames.length > 0 ? tabNames : ['Sheet1'];

      sheetsStore.set(ssId, {
        spreadsheetId: ssId,
        title,
        sheets: initialSheets,
        values: {},
      });
      driveFiles.set(ssId, {
        id: ssId,
        name: title,
        mimeType: 'application/vnd.google-apps.spreadsheet',
        parents: ['root'],
        trashed: false,
        appProperties: {},
        etag: nextId('etag'),
        modifiedTime: new Date().toISOString(),
      });

      return Response.json({ spreadsheetId: ssId, properties: { title } });
    }

    if (url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/')) {
      const urlObj = new URL(url);
      const restPath = urlObj.pathname.replace(/^\/v4\/spreadsheets\//, '');
      const ssIdRaw = restPath.split('/')[0].split(':')[0];
      const ssId = decodeURIComponent(ssIdRaw);
      const sheet = sheetsStore.get(ssId);
      if (!sheet) {
        return Response.json({ error: 'Spreadsheet not found' }, { status: 404 });
      }

      if (restPath.endsWith(':batchUpdate') && !restPath.includes('/values')) {
        const body = JSON.parse(bodyText || '{}') as {
          requests?: Array<{ addSheet?: { properties?: { title?: string } } }>;
        };
        for (const reqItem of body.requests || []) {
          const title = reqItem.addSheet?.properties?.title;
          if (title && !sheet.sheets.includes(title)) {
            sheet.sheets.push(title);
          }
        }
        return Response.json({ spreadsheetId: ssId });
      }

      if (restPath.includes('/values:batchGet')) {
        const ranges = urlObj.searchParams.getAll('ranges');
        return Response.json({
          spreadsheetId: ssId,
          valueRanges: ranges.map((r) => {
            const tab = r.split('!')[0].replace(/^'|'$/g, '').replace(/''/g, "'");
            return { range: r, values: sheet.values[tab] || [] };
          }),
        });
      }

      if (restPath.includes('/values:batchUpdate')) {
        const body = JSON.parse(bodyText || '{}') as {
          data?: Array<{ range: string; values: unknown[][] }>;
        };
        for (const item of body.data || []) {
          const tab = item.range.split('!')[0].replace(/^'|'$/g, '').replace(/''/g, "'");
          sheet.values[tab] = item.values || [];
        }
        return Response.json({ totalUpdatedRows: body.data?.length || 0 });
      }

      if (restPath.includes('/values:batchClear')) {
        return Response.json({ clearedRanges: [] });
      }

      if (restPath.includes('/values/') && restPath.endsWith(':append')) {
        const rangePart = decodeURIComponent(restPath.split('/values/')[1].replace(/:append$/, ''));
        const tab = rangePart.split('!')[0].replace(/^'|'$/g, '').replace(/''/g, "'");
        const body = JSON.parse(bodyText || '{}') as { values?: unknown[][] };
        sheet.values[tab] = [...(sheet.values[tab] || []), ...(body.values || [])];
        return Response.json({ updates: { updatedRows: (body.values || []).length } });
      }

      if (restPath.includes('/values/')) {
        const rangePart = decodeURIComponent(restPath.split('/values/')[1]);
        const tab = rangePart.split('!')[0].replace(/^'|'$/g, '').replace(/''/g, "'");
        if (method === 'PUT') {
          const body = JSON.parse(bodyText || '{}') as { values?: unknown[][] };
          sheet.values[tab] = body.values || [];
          return Response.json({ updatedRows: (body.values || []).length });
        }
        return Response.json({ range: rangePart, values: sheet.values[tab] || [] });
      }

      return Response.json({
        spreadsheetId: ssId,
        spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${ssId}`,
        properties: { title: sheet.title },
        sheets: sheet.sheets.map((t, i) => ({
          properties: {
            title: t,
            sheetId: i + 1,
            gridProperties: { rowCount: (sheet.values[t] || []).length + 1 },
          },
        })),
      });
    }

    return Response.json({}, { status: 404 });
  });

  return {
    fetch: fetchImpl as unknown as typeof fetch,
    driveFiles,
    sheetsStore,
    stats,
    addFaultRule(rule: FaultRule) {
      faultRules.push(rule);
    },
    clearFaultRules() {
      faultRules.length = 0;
    },
    tamperDriveJson(fileId: string, updater: (doc: Record<string, unknown>) => Record<string, unknown>) {
      const f = driveFiles.get(fileId);
      if (!f) throw new Error(`Mock Drive file not found: ${fileId}`);
      const parsed = JSON.parse(f.content || '{}') as Record<string, unknown>;
      const updated = updater(parsed);
      f.content = JSON.stringify(updated, null, 2);
      f.etag = nextId('etag_ext');
      f.modifiedTime = new Date().toISOString();
    },
    createFolderDirect(params: {
      name: string;
      parentId?: string;
      appProperties?: Record<string, string>;
    }): string {
      const id = nextId('fld_ext');
      driveFiles.set(id, {
        id,
        name: params.name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [params.parentId || 'root'],
        trashed: false,
        appProperties: params.appProperties || {},
        etag: nextId('etag'),
        modifiedTime: new Date().toISOString(),
      });
      return id;
    },
    createFileDirect(params: {
      name: string;
      parentId: string;
      content: string;
      mimeType?: string;
      appProperties?: Record<string, string>;
    }): string {
      const id = nextId('drv_ext');
      driveFiles.set(id, {
        id,
        name: params.name,
        mimeType: params.mimeType || 'application/json',
        parents: [params.parentId],
        trashed: false,
        appProperties: params.appProperties || {},
        etag: nextId('etag'),
        modifiedTime: new Date().toISOString(),
        content: params.content,
      });
      return id;
    },
  };
}
