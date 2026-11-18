import { describe, expect, it, vi } from 'vitest';
import { handleConsoleApiRequest } from '../routes/consoleApi';
import {
  handleSheetsEnsureSpreadsheet,
  handleSheetsReadValues,
  handleSheetsWriteValues,
} from '../routes/sheets';
import { encryptSecret } from '../security/encryption';
import { ensureProjectDriveTree } from '../services/driveProvisioner';
import { validateSiteSlug } from '../services/siteRegistryService';
import {
  ALL_PROJECT_MODULES,
  completeOnboarding,
  createOrganization,
  createProject,
  createSiteInProject,
  getConsoleBootstrap,
  HierarchyServiceError,
  inspectOnboardingState,
  OrganizationRecord,
  ProjectModuleRecord,
  ProjectRecord,
  SiteRecord,
  updateProjectModules,
  updateSiteInProject,
  WorkspaceResourceRecord,
} from '../services/workspaceHierarchyService';
import { StoredCredentialRow, VerifiedSession, WorkerEnv } from '../types';

interface MockMemberRow {
  member_id: string;
  org_id: string;
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  status: 'active' | 'invited' | 'removed';
  created_at: string;
  updated_at: string;
}

interface MockSiteRegistryRow {
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
  updated_at: string;
}

interface MockIdempotencyRow {
  operation_key: string;
  owner_id: string;
  operation_type: string;
  result_json: string;
  created_at: string;
}

function createInMemoryMockD1() {
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

  const executeQuery = (sql: string, params: unknown[]) => {
    const q = sql.replace(/\s+/g, ' ').trim();

    if (q.startsWith('PRAGMA')) {
      return { results: [] };
    }

    if (q.includes('FROM console_operation_idempotency')) {
      const [key, ownerId] = params as [string, string];
      const row = idempotency.find((r) => r.operation_key === key && r.owner_id === ownerId);
      return { results: row ? [row] : [] };
    }

    if (q.startsWith('INSERT OR IGNORE INTO console_operation_idempotency')) {
      const [key, ownerId, resultJson, createdAt] = params as [
        string,
        string,
        string,
        string,
      ];
      if (!idempotency.some((r) => r.operation_key === key)) {
        idempotency.push({
          operation_key: key,
          owner_id: ownerId,
          operation_type: 'console_op',
          result_json: resultJson,
          created_at: createdAt,
        });
      }
      return { results: [] };
    }

    if (q.includes('SELECT COUNT(*) AS cnt FROM organization_members')) {
      const [userId] = params as [string];
      const cnt = members.filter((m) => m.user_id === userId && m.status === 'active').length;
      return { results: [{ cnt }] };
    }

    if (q.includes("SELECT COUNT(*) AS cnt FROM organizations WHERE owner_id = ? AND status = 'active'")) {
      const [ownerId] = params as [string];
      const cnt = organizations.filter((o) => o.owner_id === ownerId && o.status === 'active').length;
      return { results: [{ cnt }] };
    }

    if (q.includes("SELECT COUNT(*) AS cnt FROM projects WHERE org_id = ? AND status = 'active'")) {
      const [orgId] = params as [string];
      const cnt = projects.filter((p) => p.org_id === orgId && p.status === 'active').length;
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

    if (q.includes('FROM organizations o INNER JOIN organization_members m') && q.includes('WHERE o.org_id = ?')) {
      const [orgId, userId] = params as [string, string];
      const m = members.find((x) => x.org_id === orgId && x.user_id === userId && x.status === 'active');
      const o = organizations.find((x) => x.org_id === orgId && x.status === 'active');
      if (!m || !o) return { results: [] };
      return { results: [{ ...o, member_role: m.role }] };
    }

    if (q.includes('FROM organizations o INNER JOIN organization_members m') && q.includes('WHERE m.user_id = ?')) {
      const [userId] = params as [string];
      const rows = organizations
        .filter((o) => o.status === 'active')
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
      const p = projects.find((x) => x.project_id === projectId && x.status === 'active');
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

    if (q.includes('FROM workspace_credentials WHERE owner_id = ?')) {
      const [ownerId] = params as [string];
      const row = credentials.find((c) => c.owner_id === ownerId);
      return { results: row ? [row] : [] };
    }

    if (q.includes('FROM organizations WHERE org_id = ?')) {
      const [orgId] = params as [string];
      return { results: organizations.filter((o) => o.org_id === orgId) };
    }

    if (q.includes('SELECT drive_file_id FROM workspace_resources WHERE org_id = ? AND project_id IS NULL')) {
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
          (r) =>
            r.project_id === projectId &&
            r.status === 'active' &&
            kinds.has(r.resource_kind)
        ),
      };
    }

    if (
      q.includes(
        "SELECT spreadsheet_id FROM workspace_resources WHERE project_id = ? AND resource_kind IN"
      ) ||
      q.includes(
        "SELECT spreadsheet_id FROM workspace_resources WHERE project_id = ? AND resource_kind ="
      )
    ) {
      const [projectId] = params as [string];
      const kindMatch = q.match(/resource_kind = '([^']+)'/);
      const targetKind = kindMatch ? kindMatch[1] : 'cms_spreadsheet';
      return {
        results: resources.filter(
          (r) =>
            r.project_id === projectId &&
            r.resource_kind === targetKind &&
            r.status === 'active'
        ),
      };
    }

    if (q.includes('SELECT COUNT(*) AS cnt FROM site_dataset_resources') || q.includes('SELECT COUNT(*) AS cnt FROM site_form_destinations')) {
      return { results: [{ cnt: 0 }] };
    }

    if (q.includes('FROM site_form_destinations WHERE site_id = ?')) {
      const [siteId] = params as [string];
      return { results: formDestinations.filter((d) => d.site_id === siteId) };
    }

    if (q.includes('FROM form_submission_idempotency WHERE site_id = ?')) {
      const [siteId] = params as [string];
      return { results: formIdempotency.filter((l) => l.site_id === siteId) };
    }

    if (q.includes('FROM sites WHERE project_id = ?')) {
      const [projectId] = params as [string];
      return { results: sites.filter((s) => s.project_id === projectId) };
    }

    if (q.includes('FROM site_release_history WHERE site_id = ?')) {
      const [siteId] = params as [string];
      return { results: siteReleaseHistory.filter((r) => r.site_id === siteId) };
    }

    if (q.includes('FROM site_registry WHERE owner_id = ? AND (project_id IS NULL OR project_id = \'\')')) {
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

    if (q.includes('SELECT org_id FROM organizations WHERE owner_id = ? AND org_slug = ?')) {
      const [ownerId, slug] = params as [string, string];
      return {
        results: organizations.filter((o) => o.owner_id === ownerId && o.org_slug === slug),
      };
    }

    if (q.includes('SELECT project_id FROM projects WHERE org_id = ? AND project_slug = ?')) {
      const [orgId, slug] = params as [string, string];
      return {
        results: projects.filter((p) => p.org_id === orgId && p.project_slug === slug),
      };
    }

    if (q.includes('FROM projects WHERE org_id IN')) {
      return { results: projects.filter((p) => params.includes(p.org_id) && p.status === 'active') };
    }

    if (q.includes('FROM sites WHERE org_id IN')) {
      return { results: sites.filter((s) => params.includes(s.org_id)) };
    }

    if (q.includes('FROM workspace_resources WHERE org_id IN')) {
      return { results: resources.filter((r) => params.includes(r.org_id)) };
    }

    if (q.includes('FROM project_modules WHERE project_id IN')) {
      return { results: projectModules.filter((m) => params.includes(m.project_id)) };
    }

    if (q.includes('SELECT * FROM project_modules WHERE project_id = ?')) {
      const [projectId] = params as [string];
      return { results: projectModules.filter((m) => m.project_id === projectId) };
    }

    if (q.startsWith('INSERT INTO organizations')) {
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
      return { results: [] };
    }

    if (q.startsWith('INSERT INTO organization_members')) {
      const [member_id, org_id, user_id, email, created_at, updated_at] = params as string[];
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
      return { results: [] };
    }

    if (q.startsWith('INSERT INTO projects')) {
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
      return { results: [] };
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

    if (q.startsWith('UPDATE site_registry SET site_name = ?, site_slug = ?')) {
      const [siteName, siteSlug, updatedAt, siteId, ownerId] = params as string[];
      const row = siteRegistry.find((r) => r.site_id === siteId && r.owner_id === ownerId);
      if (row) {
        row.site_name = siteName;
        row.site_slug = siteSlug;
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith('INSERT OR IGNORE INTO sites')) {
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
      return { results: [] };
    }

    if (q.startsWith('INSERT INTO sites')) {
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
      return { results: [] };
    }

    if (q.startsWith('UPDATE sites SET site_name = ?, site_slug = ?')) {
      const [siteName, siteSlug, updatedAt, siteId] = params as string[];
      const row = sites.find((s) => s.site_id === siteId);
      if (row) {
        row.site_name = siteName;
        row.site_slug = siteSlug;
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

    if (q.startsWith('UPDATE projects SET drive_folder_id = ?')) {
      const [folderId, updatedAt, projectId] = params as string[];
      const row = projects.find((p) => p.project_id === projectId);
      if (row) {
        row.drive_folder_id = folderId;
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith('INSERT INTO workspace_resources') && q.includes('ON CONFLICT(org_id, project_id, resource_kind, resource_key)')) {
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
        created_at,
        updated_at,
      ] = params as string[];
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
          status: status as WorkspaceResourceRecord['status'],
          updated_at,
        };
      } else {
        resources.push({
          resource_id,
          owner_id,
          org_id,
          project_id,
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

    if (q.startsWith('UPDATE workspace_resources SET drive_file_id')) {
      const [d1, , s1, , p1, , title, status, updatedAt, resourceId] = params as string[];
      const row = resources.find((r) => r.resource_id === resourceId);
      if (row) {
        if (d1) row.drive_file_id = d1;
        if (s1) row.spreadsheet_id = s1;
        if (p1) row.parent_folder_id = p1;
        row.title = title;
        row.status = status as WorkspaceResourceRecord['status'];
        row.updated_at = updatedAt;
      }
      return { results: [] };
    }

    if (q.startsWith('INSERT INTO workspace_resources (')) {
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
      return { results: [] };
    }

    if (q.startsWith('INSERT OR IGNORE INTO workspace_resources')) {
      const [
        resource_id,
        owner_id,
        org_id,
        project_id,
        resource_key,
        spreadsheet_id,
        title,
        created_at,
        updated_at,
      ] = params as string[];
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
    tables: {
      organizations,
      members,
      projects,
      projectModules,
      sites,
      resources,
      siteRegistry,
      credentials,
      formDestinations,
      formIdempotency,
      siteReleaseHistory,
    },
  };
}

function createEnv(db: WorkerEnv['DB']): WorkerEnv {
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
  };
}

describe('Workspace Hierarchy Service & Console API (Phase 1)', () => {
  const ownerA: VerifiedSession = { ownerId: 'user_alice', email: 'alice@studio.com' };
  const ownerB: VerifiedSession = { ownerId: 'user_bob', email: 'bob@agency.com' };

  it('rejects all reserved system slugs in validateSiteSlug', () => {
    for (const reserved of ['console', 'orgs', 'projects', 'builder', 'workspace', 's', 'api']) {
      const check = validateSiteSlug(reserved);
      expect(check.valid).toBe(false);
      expect(check.code).toBe('RESERVED_SITE_SLUG');
    }
    expect(validateSiteSlug('studio-alpha').valid).toBe(true);
  });

  it('inspects unattached legacy D1 sites and reports ambiguities without mutating state', async () => {
    const mock = createInMemoryMockD1();
    mock.tables.siteRegistry.push(
      {
        site_id: 'site_one',
        site_slug: 'alpha-works',
        custom_domain: null,
        owner_id: ownerA.ownerId,
        org_id: null,
        project_id: null,
        site_name: 'Alpha Works',
        status: 'published',
        active_publish_version: 'v1',
        active_build_id: 'b1',
        publish_manifest_drive_file_id: 'm1',
        runtime_config_drive_file_id: 'r1',
        integrity_hash: 'h1',
        schema_version: 1,
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        site_id: 'site_two',
        site_slug: 'beta-works',
        custom_domain: null,
        owner_id: ownerA.ownerId,
        org_id: null,
        project_id: null,
        site_name: 'Beta Works',
        status: 'published',
        active_publish_version: 'v2',
        active_build_id: 'b2',
        publish_manifest_drive_file_id: 'm2',
        runtime_config_drive_file_id: 'r2',
        integrity_hash: 'h2',
        schema_version: 1,
        updated_at: '2026-01-02T00:00:00.000Z',
      }
    );

    const env = createEnv(mock.db);
    const bootstrapBefore = await getConsoleBootstrap(env, ownerA);
    expect(bootstrapBefore.needsOnboarding).toBe(true);
    expect(bootstrapBefore.unattachedLegacySites).toHaveLength(2);

    const inspection = await inspectOnboardingState(env, ownerA, {
      portfolioSlug: 'different-local-draft',
      siteName: 'Local Draft Site',
    });

    expect(inspection.requiresUserConfirmation).toBe(true);
    expect(inspection.ambiguities.map((a) => a.code)).toContain('MULTIPLE_LEGACY_SITES');
    expect(inspection.ambiguities.map((a) => a.code)).toContain('LOCAL_AND_REMOTE_SLUG_MISMATCH');
    expect(mock.tables.organizations).toHaveLength(0);
    expect(mock.tables.siteRegistry.every((s) => s.project_id === null)).toBe(true);
  });

  it('completes onboarding atomically, attaches legacy sites safely, and deduplicates retries via Idempotency-Key', async () => {
    const mock = createInMemoryMockD1();
    mock.tables.siteRegistry.push({
      site_id: 'site_legacy_1',
      site_slug: 'alice-portfolio',
      custom_domain: null,
      owner_id: ownerA.ownerId,
      org_id: null,
      project_id: null,
      site_name: 'Alice Portfolio',
      status: 'published',
      active_publish_version: 'v3',
      active_build_id: 'b3',
      publish_manifest_drive_file_id: 'm3',
      runtime_config_drive_file_id: 'r3',
      integrity_hash: 'h3',
      schema_version: 1,
      updated_at: '2026-01-03T00:00:00.000Z',
    });

    const env = createEnv(mock.db);
    const first = await completeOnboarding(env, ownerA, {
      operationKey: 'onboard_key_1',
      organizationName: 'Alice Design Lab',
      projectName: 'Flagship Brand',
      attachSiteIds: ['site_legacy_1'],
    });

    expect(first.deduplicated).toBe(false);
    expect((first as { attachedSitesCount: number }).attachedSitesCount).toBe(1);
    expect(mock.tables.organizations).toHaveLength(1);
    expect(mock.tables.projects).toHaveLength(1);
    expect(mock.tables.projectModules).toHaveLength(ALL_PROJECT_MODULES.length);
    expect(mock.tables.siteRegistry[0].org_id).toBe((first as { organization: OrganizationRecord }).organization.org_id);
    expect(mock.tables.siteRegistry[0].project_id).toBe((first as { project: ProjectRecord }).project.project_id);
    expect(mock.tables.sites).toHaveLength(1);
    expect(mock.tables.sites[0].site_slug).toBe('alice-portfolio');
    expect(mock.tables.sites[0].status).toBe('published');

    // Retry with same operationKey must deduplicate without creating duplicate Org/Project
    const retry = await completeOnboarding(env, ownerA, {
      operationKey: 'onboard_key_1',
      organizationName: 'Alice Design Lab',
      projectName: 'Flagship Brand',
      attachSiteIds: ['site_legacy_1'],
    });

    expect(retry.deduplicated).toBe(true);
    expect(mock.tables.organizations).toHaveLength(1);
    expect(mock.tables.projects).toHaveLength(1);
  });

  it('enforces RBAC cross-tenant isolation, module toggles, and reserved/duplicate site slug guards', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);

    const orgRes = await createOrganization(env, ownerA, { name: 'Studio A', operationKey: 'org_1' });
    const orgId = (orgRes as { organization: OrganizationRecord }).organization.org_id;

    const projRes = await createProject(env, ownerA, orgId, {
      name: 'Client Portal',
      operationKey: 'prj_1',
    });
    const projectId = (projRes as { project: ProjectRecord }).project.project_id;

    // Cross-account user B cannot create a project or site or toggle modules in Org A
    await expect(
      createProject(env, ownerB, orgId, { name: 'Hijack Project' })
    ).rejects.toBeInstanceOf(HierarchyServiceError);

    await expect(
      updateProjectModules(env, ownerB, projectId, [{ moduleKey: 'cms', enabled: false }])
    ).rejects.toThrow(/do not have access/i);

    // Owner A toggles CMS module off
    const modUpdate = await updateProjectModules(env, ownerA, projectId, [
      { moduleKey: 'cms', enabled: false },
    ]);
    const cmsMod = modUpdate.modules.find((m) => m.module_key === 'cms');
    expect(cmsMod?.enabled).toBe(0);

    // Reserved slug rejected on Site create
    await expect(
      createSiteInProject(env, ownerA, projectId, { siteName: 'Console', siteSlug: 'console' })
    ).rejects.toThrow(/reserved/i);

    // Valid Site creation succeeds
    const createdSite = await createSiteInProject(env, ownerA, projectId, {
      siteName: 'Client Microsite',
      siteSlug: 'client-microsite',
    });
    const siteId = (createdSite as { site: SiteRecord }).site.site_id;

    // Duplicate slug rejected across accounts
    const orgB = await createOrganization(env, ownerB, { name: 'Agency B' });
    const projB = await createProject(
      env,
      ownerB,
      (orgB as { organization: OrganizationRecord }).organization.org_id,
      { name: 'B Site' }
    );
    await expect(
      createSiteInProject(
        env,
        ownerB,
        (projB as { project: ProjectRecord }).project.project_id,
        { siteName: 'Copycat', siteSlug: 'client-microsite' }
      )
    ).rejects.toThrow(/already in use/i);

    // Reserved slug rejected on Site rename
    await expect(
      updateSiteInProject(env, ownerA, siteId, { siteSlug: 'orgs' })
    ).rejects.toThrow(/reserved/i);
  });

  it('handles HTTP /api/console/bootstrap and /api/console/organizations authentication via handleConsoleApiRequest', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) {
        return Response.json({ id: ownerA.ownerId, email: ownerA.email });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const unauthRes = await handleConsoleApiRequest(
        new Request('https://worker.example/api/console/bootstrap'),
        env,
        '/api/console/bootstrap'
      );
      expect(unauthRes?.status).toBe(401);

      const bootRes = await handleConsoleApiRequest(
        new Request('https://worker.example/api/console/bootstrap', {
          headers: { Authorization: 'Bearer valid_jwt' },
        }),
        env,
        '/api/console/bootstrap'
      );
      expect(bootRes?.status).toBe(200);
      const bootJson = (await bootRes?.json()) as { needsOnboarding: boolean };
      expect(bootJson.needsOnboarding).toBe(true);

      const createOrgRes = await handleConsoleApiRequest(
        new Request('https://worker.example/api/console/organizations', {
          method: 'POST',
          headers: {
            Authorization: 'Bearer valid_jwt',
            'Content-Type': 'application/json',
            'Idempotency-Key': 'http_org_1',
          },
          body: JSON.stringify({ name: 'HTTP Org' }),
        }),
        env,
        '/api/console/organizations'
      );
      expect(createOrgRes?.status).toBe(201);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('Drive Provisioner & Server-Side Google Workspace Proxy (Phase 2)', () => {
  const ownerA: VerifiedSession = { ownerId: 'user_alice', email: 'alice@studio.com' };
  const ownerB: VerifiedSession = { ownerId: 'user_bob', email: 'bob@agency.com' };

  async function seedConnectedCredential(
    mock: ReturnType<typeof createInMemoryMockD1>,
    env: WorkerEnv,
    owner: VerifiedSession
  ) {
    const enc = await encryptSecret('secret_google_refresh_token', env.TOKEN_ENCRYPTION_KEY);
    mock.tables.credentials.push({
      owner_id: owner.ownerId,
      google_subject: `sub_${owner.ownerId}`,
      google_email: owner.email,
      google_name: 'Alice Studio',
      google_avatar: '',
      granted_scopes: JSON.stringify(['https://www.googleapis.com/auth/drive.file']),
      encrypted_refresh_token: enc.ciphertext,
      encryption_iv: enc.iv,
      status: 'connected',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
  }

  it('provisions Builly/{orgSlug}/{projectSlug} folders idempotently and reuses persisted IDs without duplicates', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);

    const orgRes = await createOrganization(env, ownerA, { name: 'Acme Studio' });
    const orgId = (orgRes as { organization: OrganizationRecord }).organization.org_id;
    const projRes = await createProject(env, ownerA, orgId, { name: 'Brand Portal' });
    const projectId = (projRes as { project: ProjectRecord }).project.project_id;

    let folderCounter = 0;
    const createdFolders: Array<{ id: string; name: string; parent: string }> = [];
    const jsonFiles = new Map<string, { id: string; name: string; parent: string; body: string }>();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'server_only_google_access_token' });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
        return Response.json({ files: [] });
      }
      if (url === 'https://www.googleapis.com/drive/v3/files?fields=id' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}')) as { name: string; parents?: string[] };
        folderCounter++;
        const id = `fld_${folderCounter}_${body.name}`;
        createdFolders.push({ id, name: body.name, parent: body.parents?.[0] || 'root' });
        return Response.json({ id });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/fld_')) {
        const id = url.split('/files/')[1].split('?')[0];
        const exists = createdFolders.some((f) => f.id === id);
        return exists
          ? Response.json({ id, trashed: false, mimeType: 'application/vnd.google-apps.folder' })
          : Response.json({ error: 'Not found' }, { status: 404 });
      }
      if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        const fileId = `file_json_${jsonFiles.size + 1}`;
        const raw = String(init?.body || '');
        jsonFiles.set(fileId, { id: fileId, name: 'site-draft.json', parent: 'unknown', body: raw });
        return Response.json({ id: fileId, name: 'site-draft.json', modifiedTime: '2026-01-05T00:00:00.000Z' });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const firstRun = await ensureProjectDriveTree(env, ownerA, projectId);
      expect(firstRun.createdFoldersCount).toBe(11);
      expect(firstRun.folders.config_draft).toBeTruthy();
      expect(firstRun.folders.data_cms).toBeTruthy();
      expect(firstRun.folders.assets_root).toBeTruthy();
      expect(firstRun.folders.exports_root).toBeTruthy();

      const folderCountAfterFirst = createdFolders.length;
      const secondRun = await ensureProjectDriveTree(env, ownerA, projectId);
      expect(secondRun.createdFoldersCount).toBe(0);
      expect(createdFolders.length).toBe(folderCountAfterFirst);
      expect(secondRun.folders).toEqual(firstRun.folders);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('enforces RBAC 403 and zero token exposure on /api/console/projects/:projectId/drive/* routes', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);

    const orgRes = await createOrganization(env, ownerA, { name: 'Alpha Org' });
    const orgId = (orgRes as { organization: OrganizationRecord }).organization.org_id;
    const projRes = await createProject(env, ownerA, orgId, { name: 'Alpha Project' });
    const projectId = (projRes as { project: ProjectRecord }).project.project_id;

    let folderSeq = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) {
        const auth = (init?.headers as Record<string, string>)?.Authorization || '';
        return auth.includes('bob_jwt')
          ? Response.json({ id: ownerB.ownerId, email: ownerB.email })
          : Response.json({ id: ownerA.ownerId, email: ownerA.email });
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'TOP_SECRET_GOOGLE_ACCESS_TOKEN' });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
        return Response.json({ files: [] });
      }
      if (url === 'https://www.googleapis.com/drive/v3/files?fields=id' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}')) as { name: string };
        folderSeq++;
        return Response.json({ id: `fld_${folderSeq}_${body.name}` });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/fld_')) {
        const id = url.split('/files/')[1].split('?')[0];
        return Response.json({ id, trashed: false, mimeType: 'application/vnd.google-apps.folder' });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/foreign_file')) {
        return Response.json({ id: 'foreign_file', name: 'secret.json', parents: ['other_folder'] });
      }
      if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        return Response.json({
          id: 'file_draft_1',
          name: 'site-draft.json',
          modifiedTime: '2026-01-05T00:00:00.000Z',
        });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    try {
      // Cross-account user Bob cannot provision Alice's Project Drive
      const bobRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/drive/provision`, {
          method: 'POST',
          headers: { Authorization: 'Bearer bob_jwt' },
        }),
        env,
        `/api/console/projects/${projectId}/drive/provision`
      );
      expect(bobRes?.status).toBe(403);

      // Owner Alice provisions and writes JSON draft inside Project folder
      const aliceWriteRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/drive/json`, {
          method: 'POST',
          headers: {
            Authorization: 'Bearer alice_jwt',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            folderKind: 'config_draft',
            fileName: 'site-draft.json',
            payload: { title: 'Draft 1' },
          }),
        }),
        env,
        `/api/console/projects/${projectId}/drive/json`
      );
      expect(aliceWriteRes?.status).toBe(200);
      const writeText = await aliceWriteRes!.text();
      expect(writeText).not.toContain('TOP_SECRET_GOOGLE_ACCESS_TOKEN');
      expect(writeText).not.toContain('secret_google_refresh_token');

      // Reading an arbitrary fileId outside the project's folders is blocked (403)
      const foreignReadRes = await handleConsoleApiRequest(
        new Request(
          `https://worker.example/api/console/projects/${projectId}/drive/json?fileId=foreign_file`,
          {
            method: 'GET',
            headers: { Authorization: 'Bearer alice_jwt' },
          }
        ),
        env,
        `/api/console/projects/${projectId}/drive/json`
      );
      expect(foreignReadRes?.status).toBe(403);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('proxies Google Sheets provisioning, reads, and writes server-side scoped by Project RBAC', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);

    const orgRes = await createOrganization(env, ownerA, { name: 'Sheets Org' });
    const orgId = (orgRes as { organization: OrganizationRecord }).organization.org_id;
    const projRes = await createProject(env, ownerA, orgId, { name: 'CMS Hub' });
    const projectId = (projRes as { project: ProjectRecord }).project.project_id;

    let folderSeq = 0;
    let createSheetCalls = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/v1/user')) {
        const auth = (init?.headers as Record<string, string>)?.Authorization || '';
        return auth.includes('bob_jwt')
          ? Response.json({ id: ownerB.ownerId, email: ownerB.email })
          : Response.json({ id: ownerA.ownerId, email: ownerA.email });
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'SERVER_SHEETS_TOKEN' });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
        return Response.json({ files: [] });
      }
      if (url === 'https://www.googleapis.com/drive/v3/files?fields=id' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body || '{}')) as { name: string };
        folderSeq++;
        return Response.json({ id: `fld_${folderSeq}_${body.name}` });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/fld_')) {
        const id = url.split('/files/')[1].split('?')[0];
        return Response.json({ id, trashed: false, mimeType: 'application/vnd.google-apps.folder' });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/sheet_cms_1') && init?.method === 'PATCH') {
        return Response.json({ id: 'sheet_cms_1', parents: ['data_cms'] });
      }
      if (url === 'https://sheets.googleapis.com/v4/spreadsheets' && init?.method === 'POST') {
        createSheetCalls++;
        return Response.json({
          spreadsheetId: 'sheet_cms_1',
          spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_cms_1/edit',
          properties: { title: 'CMS Posts' },
        });
      }
      if (url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/sheet_cms_1?fields=')) {
        return Response.json({
          spreadsheetId: 'sheet_cms_1',
          spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet_cms_1/edit',
          properties: { title: 'CMS Posts' },
          sheets: [{ properties: { title: 'POSTS' } }],
        });
      }
      if (url.includes('/values:batchGet')) {
        return Response.json({ valueRanges: [{ range: 'POSTS!A1:B2', values: [['id', 'Title']] }] });
      }
      if (url.includes('/values:batchUpdate')) {
        return Response.json({ totalUpdatedRows: 2 });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const ensure1 = await handleSheetsEnsureSpreadsheet(
        new Request('https://worker.example/api/sheets/spreadsheets/ensure', {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            domainKind: 'cms',
            datasetKey: 'posts',
            title: 'CMS Posts',
            tabs: ['POSTS'],
          }),
        }),
        env
      );
      expect(ensure1.status).toBe(201);
      expect(createSheetCalls).toBe(1);

      // Repeat call reuses the registered spreadsheet without creating a duplicate
      const ensure2 = await handleSheetsEnsureSpreadsheet(
        new Request('https://worker.example/api/sheets/spreadsheets/ensure', {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            domainKind: 'cms',
            datasetKey: 'posts',
            title: 'CMS Posts',
            tabs: ['POSTS'],
          }),
        }),
        env
      );
      expect(ensure2.status).toBe(200);
      expect(createSheetCalls).toBe(1);

      const readRes = await handleSheetsReadValues(
        new Request('https://worker.example/api/sheets/values/read', {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, spreadsheetId: 'sheet_cms_1', ranges: ['POSTS!A1:B2'] }),
        }),
        env
      );
      expect(readRes.status).toBe(200);
      const readText = await readRes.text();
      expect(readText).not.toContain('SERVER_SHEETS_TOKEN');

      const bobWriteRes = await handleSheetsWriteValues(
        new Request('https://worker.example/api/sheets/values/write', {
          method: 'POST',
          headers: { Authorization: 'Bearer bob_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            spreadsheetId: 'sheet_cms_1',
            data: [{ range: 'POSTS!A1', values: [['x']] }],
          }),
        }),
        env
      );
      expect(bobWriteRes.status).toBe(403);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Phase 4: enforces Project RBAC on GET/POST /api/console/projects/:projectId/cms, saves manifest to Data/CMS, and keeps OAuth secrets out of responses', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);

    const orgRes = await createOrganization(env, ownerA, { name: 'CMS Org' });
    const orgId = (orgRes as { organization: OrganizationRecord }).organization.org_id;
    const projRes = await createProject(env, ownerA, orgId, {
      name: 'CMS Core Project',
    });
    const projectId = (projRes as { project: ProjectRecord }).project.project_id;

    let manifestReads = 0;
    let folderSeq = 0;
    const savedManifestStore: { current: unknown } = { current: null };
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';

      if (url.endsWith('/auth/v1/user')) {
        const auth = (init?.headers as Record<string, string>)?.Authorization || '';
        if (auth === 'Bearer alice_jwt') {
          return Response.json({ id: ownerA.ownerId, email: ownerA.email });
        }
        return Response.json({ id: 'owner_b', email: 'bob@example.com' });
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({
          access_token: 'SERVER_CMS_ACCESS_TOKEN',
          expires_in: 3600,
        });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
        return Response.json({ files: [] });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?fields=id') && method === 'POST') {
        folderSeq += 1;
        return Response.json({ id: `drv_cms_folder_${folderSeq}` });
      }
      if (
        url.includes('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart') &&
        method === 'POST'
      ) {
        const bodyText = String(init?.body || '');
        const parts = bodyText.split('\r\n\r\n');
        const jsonPart = parts[2]?.split('\r\n--')[0];
        if (jsonPart) {
          savedManifestStore.current = JSON.parse(jsonPart);
        }
        return Response.json({
          id: 'drv_cms_manifest_file_1',
          name: 'cms-manifest.json',
          modifiedTime: '2026-04-01T12:00:00Z',
        });
      }
      if (
        url === 'https://www.googleapis.com/drive/v3/files/drv_cms_manifest_file_1?alt=media'
      ) {
        manifestReads += 1;
        return Response.json(savedManifestStore.current || {});
      }
      if (url === 'https://sheets.googleapis.com/v4/spreadsheets' && method === 'POST') {
        return Response.json({ spreadsheetId: 'sheet_proj_cms_1' });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/sheet_proj_cms_1')) {
        return Response.json({ id: 'sheet_proj_cms_1' });
      }
      if (url.includes('/values:batchUpdate')) {
        return Response.json({ totalUpdatedRows: 3 });
      }
      if (url.includes('/values:batchClear')) {
        return Response.json({ clearedRanges: [] });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    try {
      // Unprivileged user Bob is rejected with 403
      const bobGet = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/cms`, {
          method: 'GET',
          headers: { Authorization: 'Bearer bob_jwt' },
        }),
        env,
        `/api/console/projects/${projectId}/cms`
      );
      expect(bobGet?.status).toBe(403);

      // Alice saves CMS manifest + Sheets tables to isolated Data/CMS folder
      const saveRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/cms/save`, {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document: {
              schemaVersion: 1,
              revision: 4,
              contentTypes: [{ id: 'post', pluralLabel: 'Posts' }],
              records: [{ recordId: 'rec_1', title: 'Server Synced Post', slug: 'server-post' }],
              taxonomies: [],
              terms: [],
              relationships: [],
              richDocs: {},
            },
            syncSheets: true,
            title: 'Builly CMS — CMS Core Project',
            tables: [{ title: 'CMS_REC_POST', headers: ['record_id', 'title'], rows: [['rec_1', 'Server Synced Post']] }],
          }),
        }),
        env,
        `/api/console/projects/${projectId}/cms/save`
      );
      expect(saveRes?.status).toBe(200);
      const saveText = await saveRes!.text();
      expect(saveText).not.toContain('SERVER_CMS_ACCESS_TOKEN');
      expect(saveText).not.toContain('REFRESH_SECRET_ALICE_CMS');
      const saveJson = JSON.parse(saveText) as {
        manifestFileId: string;
        spreadsheetId: string;
        tabsSynced: string[];
      };
      expect(saveJson.manifestFileId).toBe('drv_cms_manifest_file_1');
      expect(saveJson.spreadsheetId).toBe('sheet_proj_cms_1');
      expect(saveJson.tabsSynced).toEqual(['CMS_REC_POST']);

      // Alice reads back saved Project CMS from Drive manifest
      const getRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/cms`, {
          method: 'GET',
          headers: { Authorization: 'Bearer alice_jwt' },
        }),
        env,
        `/api/console/projects/${projectId}/cms`
      );
      expect(getRes?.status).toBe(200);
      const getJson = (await getRes!.json()) as {
        found: boolean;
        document: { cmsRevision?: number; records?: Array<{ title: string }> };
      };
      expect(getJson.found).toBe(true);
      expect(manifestReads).toBe(1);
      expect(getJson.document.records?.[0]?.title).toBe('Server Synced Post');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Phase 5: Project Inbox endpoints enforce RBAC, pull live Sheets submissions, and sync Inbox state without leaking tokens', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);

    const orgRes = (await createOrganization(env, ownerA, { name: 'Inbox Org' })) as {
      organization: OrganizationRecord;
    };
    const projRes = (await createProject(env, ownerA, orgRes.organization.org_id, {
      name: 'Lead Capture App',
    })) as { project: ProjectRecord };
    const projectId = projRes.project.project_id;
    const siteRes = (await createSiteInProject(env, ownerA, projectId, {
      siteName: 'Lead Site',
      siteSlug: 'lead-capture-site',
    })) as { site: SiteRecord };

    mock.tables.formDestinations.push({
      id: 'dest_1',
      site_id: siteRes.site.site_id,
      form_id: 'contact_main',
      form_name: 'Contact Us',
      category_id: 'cat_inquiry',
      destination_spreadsheet_id: 'sheet_dest_leads_1',
      destination_worksheet_name: 'CONTACT_SUBMISSIONS',
      inbox_registry_spreadsheet_id: '',
      status: 'active',
      updated_at: '2026-04-02T00:00:00Z',
    });

    const originalFetch = globalThis.fetch;
    let folderSeq = 0;
    const savedStateStore: { current: unknown } = { current: null };

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';

      if (url.endsWith('/auth/v1/user')) {
        const auth = (init?.headers as Record<string, string>)?.Authorization || '';
        return auth === 'Bearer alice_jwt'
          ? Response.json({ id: ownerA.ownerId, email: ownerA.email })
          : Response.json({ id: 'owner_b', email: 'bob@example.com' });
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'SERVER_INBOX_ACCESS_TOKEN', expires_in: 3600 });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
        return Response.json({ files: [] });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?fields=id') && method === 'POST') {
        folderSeq += 1;
        return Response.json({ id: `drv_inb_folder_${folderSeq}` });
      }
      if (url.includes('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')) {
        const bodyText = String(init?.body || '');
        const parts = bodyText.split('\r\n\r\n');
        const jsonPart = parts[2]?.split('\r\n--')[0];
        if (jsonPart) savedStateStore.current = JSON.parse(jsonPart);
        return Response.json({ id: 'drv_inbox_state_1', name: 'inbox-state.json' });
      }
      if (url === 'https://www.googleapis.com/drive/v3/files/drv_inbox_state_1?alt=media') {
        return Response.json(savedStateStore.current || {});
      }
      if (url === 'https://sheets.googleapis.com/v4/spreadsheets' && method === 'POST') {
        return Response.json({ spreadsheetId: 'sheet_proj_inbox_reg_1' });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/sheet_proj_inbox_reg_1')) {
        return Response.json({ id: 'sheet_proj_inbox_reg_1' });
      }
      if (url.includes('/values:batchUpdate')) {
        return Response.json({ totalUpdatedRows: 2 });
      }
      if (
        url.includes('https://sheets.googleapis.com/v4/spreadsheets/sheet_dest_leads_1/values/')
      ) {
        return Response.json({
          values: [
            ['submission_id', 'submitted_at', 'name', 'email', 'phone', 'message', 'source_page'],
            ['sub_live_99', '2026-04-02T09:30:00Z', 'Suda', 'suda@example.com', '0812345678', 'Hello Builly!', '/contact'],
          ],
        });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const bobRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/inbox`, {
          method: 'GET',
          headers: { Authorization: 'Bearer bob_jwt' },
        }),
        env,
        `/api/console/projects/${projectId}/inbox`
      );
      expect(bobRes?.status).toBe(403);

      const syncRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/inbox/sync`, {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inboxState: {
              forms: [{ form_id: 'contact_main', name: 'Contact Us' }],
              inboxCategories: [],
              inboxSubmissions: [
                {
                  inbox_item_id: 'inb_1',
                  submission_id: 'sub_triaged_1',
                  read_status: 'read',
                  submitted_at: '2026-04-01T08:00:00Z',
                },
              ],
              inboxNotes: [],
              inboxActivities: [],
            },
            syncSheets: true,
            title: 'Builly Inbox — Lead Capture',
            tables: [{ title: 'INBOX_REGISTRY', headers: ['id'], rows: [['inb_1']] }],
          }),
        }),
        env,
        `/api/console/projects/${projectId}/inbox/sync`
      );
      expect(syncRes?.status).toBe(200);
      const syncText = await syncRes!.text();
      expect(syncText).not.toContain('SERVER_INBOX_ACCESS_TOKEN');
      const syncJson = JSON.parse(syncText) as { spreadsheetId: string; stateFileId: string };
      expect(syncJson.stateFileId).toBe('drv_inbox_state_1');
      expect(syncJson.spreadsheetId).toBe('sheet_proj_inbox_reg_1');

      const getRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/inbox`, {
          method: 'GET',
          headers: { Authorization: 'Bearer alice_jwt' },
        }),
        env,
        `/api/console/projects/${projectId}/inbox`
      );
      expect(getRes?.status).toBe(200);
      const getJson = (await getRes!.json()) as {
        savedState: { inboxSubmissions: Array<{ submission_id: string }> };
        remoteSubmissions: Array<{ submission_id: string; fields: { full_name: string; email: string } }>;
      };
      expect(getJson.savedState.inboxSubmissions[0]?.submission_id).toBe('sub_triaged_1');
      expect(getJson.remoteSubmissions).toHaveLength(1);
      expect(getJson.remoteSubmissions[0]?.submission_id).toBe('sub_live_99');
      expect(getJson.remoteSubmissions[0]?.fields.email).toBe('suda@example.com');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Phase 5: Project Assets endpoints reject unsafe SVGs, upload clean SVGs into Drive category folders, and delete them cleanly', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);

    const orgRes = (await createOrganization(env, ownerA, { name: 'Assets Org' })) as {
      organization: OrganizationRecord;
    };
    const projRes = (await createProject(env, ownerA, orgRes.organization.org_id, {
      name: 'Brand Kit',
    })) as { project: ProjectRecord };
    const projectId = projRes.project.project_id;

    const originalFetch = globalThis.fetch;
    let folderSeq = 0;
    const manifestStore: { current: { assets: Array<Record<string, unknown>> } | null } = {
      current: null,
    };
    const trashedIds: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';

      if (url.endsWith('/auth/v1/user')) {
        return Response.json({ id: ownerA.ownerId, email: ownerA.email });
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'SERVER_ASSETS_ACCESS_TOKEN', expires_in: 3600 });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
        return Response.json({
          files: manifestStore.current
            ? [{ id: 'drv_assets_manifest_1', name: 'assets-manifest.json' }]
            : [],
        });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?fields=id') && method === 'POST') {
        folderSeq += 1;
        return Response.json({ id: `drv_ast_folder_${folderSeq}` });
      }
      if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
        const rawBody =
          typeof init?.body === 'string'
            ? init.body
            : new TextDecoder().decode(init?.body as Uint8Array);
        if (rawBody.includes('assets-manifest.json')) {
          const parts = rawBody.split('\r\n\r\n');
          const jsonPart = parts[2]?.split('\r\n--')[0];
          if (jsonPart) {
            manifestStore.current = JSON.parse(jsonPart) as {
              assets: Array<Record<string, unknown>>;
            };
          }
          return Response.json({ id: 'drv_assets_manifest_1', name: 'assets-manifest.json' });
        }
        return Response.json({ id: 'drv_uploaded_icon_1', name: 'spark.svg' });
      }
      if (url === 'https://www.googleapis.com/drive/v3/files/drv_assets_manifest_1?alt=media') {
        return Response.json(manifestStore.current || { assets: [] });
      }
      if (
        url === 'https://www.googleapis.com/drive/v3/files/drv_uploaded_icon_1' &&
        method === 'PATCH'
      ) {
        trashedIds.push('drv_uploaded_icon_1');
        return Response.json({ id: 'drv_uploaded_icon_1', trashed: true });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const unsafeRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/assets/upload`, {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'xss.svg',
            mimeType: 'image/svg+xml',
            category: 'icons',
            svgMarkup: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
          }),
        }),
        env,
        `/api/console/projects/${projectId}/assets/upload`
      );
      expect(unsafeRes?.status).toBe(400);
      const unsafeJson = (await unsafeRes!.json()) as { code: string };
      expect(unsafeJson.code).toBe('UNSAFE_SVG_REJECTED');

      const uploadRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/assets/upload`, {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'spark.svg',
            mimeType: 'image/svg+xml',
            category: 'icons',
            svgMarkup: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>',
          }),
        }),
        env,
        `/api/console/projects/${projectId}/assets/upload`
      );
      expect(uploadRes?.status).toBe(201);
      const uploadJson = (await uploadRes!.json()) as {
        asset: { id: string; driveFileId: string; driveFolder: string };
      };
      expect(uploadJson.asset.driveFileId).toBe('drv_uploaded_icon_1');
      expect(uploadJson.asset.driveFolder).toContain('/Assets/Icons');

      const delRes = await handleConsoleApiRequest(
        new Request(
          `https://worker.example/api/console/projects/${projectId}/assets/${uploadJson.asset.id}`,
          {
            method: 'DELETE',
            headers: { Authorization: 'Bearer alice_jwt' },
          }
        ),
        env,
        `/api/console/projects/${projectId}/assets/${uploadJson.asset.id}`
      );
      expect(delRes?.status).toBe(200);
      expect(trashedIds).toEqual(['drv_uploaded_icon_1']);
      expect(manifestStore.current?.assets).toHaveLength(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('Phase 5: Project Publishing routes list project-scoped D1 release history and archive exports to Drive Exports/', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);

    const orgRes = (await createOrganization(env, ownerA, { name: 'Release Org' })) as {
      organization: OrganizationRecord;
    };
    const projRes = (await createProject(env, ownerA, orgRes.organization.org_id, {
      name: 'Marketing Hub',
    })) as { project: ProjectRecord };
    const projectId = projRes.project.project_id;
    const siteRes = (await createSiteInProject(env, ownerA, projectId, {
      siteName: 'Marketing Site',
      siteSlug: 'marketing-hub',
    })) as { site: SiteRecord };

    mock.tables.siteReleaseHistory.push({
      id: 'rel_hist_1',
      site_id: siteRes.site.site_id,
      site_slug: 'marketing-hub',
      owner_id: ownerA.ownerId,
      publish_version: 'v1.0.2',
      build_id: 'bld_2',
      runtime_config_drive_file_id: 'drv_snap_2',
      publish_manifest_drive_file_id: 'drv_man_2',
      integrity_hash: 'sha256_abc',
      schema_version: 2,
      commit_message: 'Hero typo fix',
      created_at: '2026-04-02T14:00:00Z',
    });

    const originalFetch = globalThis.fetch;
    let folderSeq = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';
      if (url.endsWith('/auth/v1/user')) {
        return Response.json({ id: ownerA.ownerId, email: ownerA.email });
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'SERVER_EXP_ACCESS_TOKEN', expires_in: 3600 });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
        return Response.json({ files: [] });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?fields=id') && method === 'POST') {
        folderSeq += 1;
        return Response.json({ id: `drv_exp_folder_${folderSeq}` });
      }
      if (url.includes('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')) {
        return Response.json({ id: 'drv_export_file_1', name: 'marketing-hub-v1-export.json' });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    try {
      const relRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/releases`, {
          method: 'GET',
          headers: { Authorization: 'Bearer alice_jwt' },
        }),
        env,
        `/api/console/projects/${projectId}/releases`
      );
      expect(relRes?.status).toBe(200);
      const relJson = (await relRes!.json()) as {
        releases: Array<{ publish_version: string; commit_message: string }>;
      };
      expect(relJson.releases).toHaveLength(1);
      expect(relJson.releases[0].publish_version).toBe('v1.0.2');

      const expRes = await handleConsoleApiRequest(
        new Request(`https://worker.example/api/console/projects/${projectId}/exports`, {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'marketing-hub-v1-export.json',
            manifest: { publishVersion: 'v1.0.2', siteSlug: 'marketing-hub' },
          }),
        }),
        env,
        `/api/console/projects/${projectId}/exports`
      );
      expect(expRes?.status).toBe(200);
      const expText = await expRes!.text();
      expect(expText).not.toContain('SERVER_EXP_ACCESS_TOKEN');
      const expJson = JSON.parse(expText) as { fileId: string; fileName: string };
      expect(expJson.fileId).toBe('drv_export_file_1');
      expect(mock.tables.resources.some((r) => r.resource_kind === 'export_archive')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('enforces server-side limits of 10 active Organizations per account and 10 active Projects per Organization', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);

    let firstOrgId = '';
    for (let i = 1; i <= 10; i++) {
      const res = (await createOrganization(env, ownerA, {
        name: `Org ${i}`,
      })) as { organization: OrganizationRecord };
      if (i === 1) firstOrgId = res.organization.org_id;
    }

    await expect(
      createOrganization(env, ownerA, { name: 'Org 11 Overflow' })
    ).rejects.toThrowError(/Organization limit reached/i);

    for (let p = 1; p <= 10; p++) {
      await createProject(env, ownerA, firstOrgId, { name: `Project ${p}` });
    }

    await expect(
      createProject(env, ownerA, firstOrgId, { name: 'Project 11 Overflow' })
    ).rejects.toThrowError(/Project limit reached/i);
  });

  it('Phase 6 Migration Plan, Non-Destructive Partitioned Execute, Reconciliation, and Owner-Confirmed Cleanup', async () => {
    const mock = createInMemoryMockD1();
    const env = createEnv(mock.db);
    await seedConnectedCredential(mock, env, ownerA);

    const orgRes = (await createOrganization(env, ownerA, { name: 'Acme Studio' })) as {
      organization: OrganizationRecord;
    };
    const orgId = orgRes.organization.org_id;
    const projRes = (await createProject(env, ownerA, orgId, { name: 'Primary Brand' })) as {
      project: ProjectRecord;
    };
    const projectId = projRes.project.project_id;

    // Seed unattached legacy site_registry & legacy combined spreadsheet resource
    mock.tables.siteRegistry.push({
      site_id: 'site_legacy_portfolio',
      site_slug: 'studio-work',
      custom_domain: null,
      owner_id: ownerA.ownerId,
      org_id: null,
      project_id: null,
      site_name: 'Studio Work',
      status: 'published',
      active_publish_version: 'v1.0.0',
      active_build_id: 'bld_old',
      publish_manifest_drive_file_id: 'drv_man_old',
      runtime_config_drive_file_id: 'drv_snap_old',
      integrity_hash: 'hash_old',
      schema_version: 1,
      updated_at: '2026-03-10T00:00:00Z',
    });

    mock.tables.resources.push({
      resource_id: 'wres_legacy_sheet_1',
      owner_id: ownerA.ownerId,
      org_id: orgId,
      project_id: null,
      site_id: null,
      resource_kind: 'legacy_sheet',
      resource_key: 'ss_legacy_combined_1',
      drive_file_id: 'ss_legacy_combined_1',
      spreadsheet_id: 'ss_legacy_combined_1',
      parent_folder_id: '',
      title: 'Legacy Combined Workbook',
      status: 'legacy',
      created_at: '2026-03-10T00:00:00Z',
      updated_at: '2026-03-10T00:00:00Z',
    });

    const originalFetch = globalThis.fetch;
    let driveSeq = 0;
    let sheetSeq = 0;
    const writtenTargetRanges: string[] = [];

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = init?.method || 'GET';

      if (url.endsWith('/auth/v1/user')) {
        return Response.json({ id: ownerA.ownerId, email: ownerA.email });
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return Response.json({ access_token: 'SERVER_MIG_ACCESS_TOKEN', expires_in: 3600 });
      }
      if (url.includes("name%20%3D%20'Builly'")) {
        return Response.json({ files: [{ id: 'drv_root_builly', name: 'Builly' }] });
      }
      if (url.includes("'drv_root_builly'%20in%20parents%20and%20trashed%20%3D%20false")) {
        return Response.json({
          files: [
            {
              id: 'drv_legacy_reg_json',
              name: 'indyshares-pages-registry.json',
              mimeType: 'application/json',
            },
          ],
        });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/drv_legacy_reg_json?alt=media')) {
        return Response.json({ pages: [{ slug: 'home', title: 'Home' }] });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files/drv_')) {
        return Response.json({ id: 'drv_ok', mimeType: 'application/vnd.google-apps.folder', trashed: false });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?q=')) {
        return Response.json({ files: [] });
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/files?fields=id') && method === 'POST') {
        driveSeq += 1;
        return Response.json({ id: `drv_mig_folder_${driveSeq}` });
      }
      if (url.includes('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart')) {
        return Response.json({ id: 'drv_backup_file_1', name: 'legacy-pages-registry-backup.json' });
      }
      if (url.includes('/v4/spreadsheets/ss_legacy_combined_1?fields=')) {
        return Response.json({
          spreadsheetId: 'ss_legacy_combined_1',
          properties: { title: 'Legacy Combined Workbook' },
          sheets: [
            { properties: { title: 'POSTS', gridProperties: { rowCount: 3 } } },
            { properties: { title: 'CONTACT_SUBMISSIONS', gridProperties: { rowCount: 2 } } },
          ],
        });
      }
      if (url.includes('/v4/spreadsheets/ss_legacy_combined_1/values/') && url.includes('POSTS')) {
        return Response.json({
          values: [
            ['record_id', 'title', 'status'],
            ['rec_post_1', 'Launch Post', 'published'],
            ['rec_post_2', 'Second Post', 'draft'],
          ],
        });
      }
      if (
        url.includes('/v4/spreadsheets/ss_legacy_combined_1/values/') &&
        url.includes('CONTACT_SUBMISSIONS')
      ) {
        return Response.json({
          values: [
            ['submission_id', 'email', 'message'],
            ['sub_1', 'client@example.com', 'Hello from legacy form'],
          ],
        });
      }
      if (url === 'https://sheets.googleapis.com/v4/spreadsheets' && method === 'POST') {
        sheetSeq += 1;
        return Response.json({ spreadsheetId: `ss_part_${sheetSeq}` });
      }
      if (url.includes('https://www.googleapis.com/drive/v3/files/ss_part_') && method === 'PATCH') {
        return Response.json({ id: 'ss_part', parents: ['drv_parent'] });
      }
      if (url.includes('/values/') && method === 'PUT') {
        writtenTargetRanges.push(url);
        return Response.json({ updatedRows: 3 });
      }
      return Response.json({}, { status: 404 });
    }) as unknown as typeof fetch;

    try {
      // Step 1: Read-only Migration Plan
      const planRes = await handleConsoleApiRequest(
        new Request('https://worker.example/api/console/migration/plan', {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetOrgId: orgId }),
        }),
        env,
        '/api/console/migration/plan'
      );
      expect(planRes?.status).toBe(200);
      const planJson = (await planRes!.json()) as {
        hasPendingMigration: boolean;
        unattachedSites: Array<{ siteId: string }>;
        spreadsheetPartitions: Array<{
          sourceSpreadsheetId: string;
          sourceTab: string;
          domain: 'cms' | 'inbox';
          targetDatasetKey: string;
        }>;
      };
      expect(planJson.hasPendingMigration).toBe(true);
      expect(planJson.unattachedSites).toHaveLength(1);
      expect(planJson.spreadsheetPartitions).toHaveLength(2);
      expect(planJson.spreadsheetPartitions.find((p) => p.sourceTab === 'POSTS')?.domain).toBe('cms');
      expect(
        planJson.spreadsheetPartitions.find((p) => p.sourceTab === 'CONTACT_SUBMISSIONS')?.domain
      ).toBe('inbox');

      // Step 2: Execute Idempotent Migration & Partitioning
      const execBody = {
        operationKey: 'mig_op_phase6_1',
        targetOrgId: orgId,
        strategy: 'attach_to_project',
        targetProjectId: projectId,
        attachSiteIds: ['site_legacy_portfolio'],
        partitionSpreadsheets: planJson.spreadsheetPartitions.map((p) => ({
          sourceSpreadsheetId: p.sourceSpreadsheetId,
          sourceTab: p.sourceTab,
          domain: p.domain,
          targetDatasetKey: p.targetDatasetKey,
        })),
        copyLegacyDriveConfigs: true,
      };
      const execRes = await handleConsoleApiRequest(
        new Request('https://worker.example/api/console/migration/execute', {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify(execBody),
        }),
        env,
        '/api/console/migration/execute'
      );
      expect(execRes?.status).toBe(200);
      const execText = await execRes!.text();
      expect(execText).not.toContain('SERVER_MIG_ACCESS_TOKEN');
      const execJson = JSON.parse(execText) as {
        attachedSitesCount: number;
        partitionedDatasets: Array<{ datasetKey: string; rowCount: number }>;
        legacyBackupFiles: Array<{ backupFileName: string }>;
        reconciliation: { passed: boolean; checks: Array<{ status: string }> };
      };
      expect(execJson.attachedSitesCount).toBe(1);
      expect(execJson.partitionedDatasets).toHaveLength(2);
      expect(execJson.partitionedDatasets.find((d) => d.datasetKey === 'Posts')?.rowCount).toBe(2);
      expect(
        execJson.partitionedDatasets.find((d) => d.datasetKey === 'Submissions')?.rowCount
      ).toBe(1);
      expect(execJson.legacyBackupFiles[0]?.backupFileName).toBe('legacy-pages-registry-backup.json');
      expect(execJson.reconciliation.passed).toBe(true);
      expect(writtenTargetRanges).toHaveLength(2);
      expect(mock.tables.siteRegistry[0].project_id).toBe(projectId);

      // Step 2b: Idempotency replay does not duplicate writes
      const replayRes = await handleConsoleApiRequest(
        new Request('https://worker.example/api/console/migration/execute', {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify(execBody),
        }),
        env,
        '/api/console/migration/execute'
      );
      const replayJson = (await replayRes!.json()) as { deduplicated: boolean };
      expect(replayJson.deduplicated).toBe(true);
      expect(writtenTargetRanges).toHaveLength(2);

      // Step 3: Cleanup fails without explicit owner confirmation
      const badCleanup = await handleConsoleApiRequest(
        new Request('https://worker.example/api/console/migration/cleanup', {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetOrgId: orgId,
            confirmOwnerReviewed: false,
            reconciliationPassed: true,
          }),
        }),
        env,
        '/api/console/migration/cleanup'
      );
      expect(badCleanup?.status).toBe(400);

      // Step 4: Confirmed Cleanup archives legacy D1 pointers safely
      const okCleanup = await handleConsoleApiRequest(
        new Request('https://worker.example/api/console/migration/cleanup', {
          method: 'POST',
          headers: { Authorization: 'Bearer alice_jwt', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operationKey: 'clean_op_phase6_1',
            targetOrgId: orgId,
            confirmOwnerReviewed: true,
            reconciliationPassed: true,
            archiveLegacyResourceIds: ['wres_legacy_sheet_1'],
          }),
        }),
        env,
        '/api/console/migration/cleanup'
      );
      expect(okCleanup?.status).toBe(200);
      const cleanJson = (await okCleanup!.json()) as {
        archivedResourcesCount: number;
        remainingLegacySitesCount: number;
        driveBackupsPreserved: boolean;
      };
      expect(cleanJson.archivedResourcesCount).toBe(1);
      expect(cleanJson.remainingLegacySitesCount).toBe(0);
      expect(cleanJson.driveBackupsPreserved).toBe(true);
      expect(
        mock.tables.resources.find((r) => r.resource_id === 'wres_legacy_sheet_1')?.status
      ).toBe('archived');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});



