import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { LegacyMigrationWizard } from '../../components/console/LegacyMigrationWizard';
import { INITIAL_SITE } from '../../data/initialSite';
import { storageService } from '../storageService';
import { LegacyMigrationPlan, OrganizationRecord, ProjectRecord } from '../../types/workspace';

const sampleOrg: OrganizationRecord = {
  org_id: 'org_mig_1',
  owner_id: 'owner_mig_1',
  name: 'Northstar Studio',
  org_slug: 'northstar-studio',
  drive_folder_id: 'drv_org_1',
  status: 'active',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const sampleProject: ProjectRecord = {
  project_id: 'prj_mig_1',
  org_id: 'org_mig_1',
  owner_id: 'owner_mig_1',
  name: 'Portfolio Flagship',
  project_slug: 'portfolio-flagship',
  description: '',
  drive_folder_id: 'drv_prj_1',
  status: 'active',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const samplePlan: LegacyMigrationPlan = {
  ok: true,
  workspaceConnected: true,
  driveInspected: true,
  organizations: [{ org_id: sampleOrg.org_id, name: sampleOrg.name, org_slug: sampleOrg.org_slug }],
  projects: [
    {
      project_id: sampleProject.project_id,
      org_id: sampleProject.org_id,
      name: sampleProject.name,
      project_slug: sampleProject.project_slug,
      drive_folder_id: sampleProject.drive_folder_id,
    },
  ],
  unattachedSites: [
    {
      siteId: 'site_unattached_1',
      siteSlug: 'creative-director',
      siteName: 'Creative Director',
      status: 'published',
      activePublishVersion: 'v1.0.0',
      hasReservedSlug: false,
    },
  ],
  legacyResourcesCount: 1,
  legacyResourceIds: ['wres_legacy_1'],
  driveLegacy: {
    buillyRootFolders: [{ id: 'drv_root_1', name: 'Builly' }],
    legacyRegistryFile: { id: 'drv_reg_1', name: 'indyshares-pages-registry.json' },
    legacyCmsFolder: null,
    legacySiteFolders: [],
  },
  spreadsheetPartitions: [
    {
      sourceSpreadsheetId: 'ss_old_1',
      sourceSpreadsheetTitle: 'Combined Legacy Workbook',
      sourceTab: 'PORTFOLIO_PROJECTS',
      domain: 'cms',
      targetDatasetKey: 'PortfolioProjects',
      targetSpreadsheetTitle: 'CMS — PortfolioProjects',
      estimatedRowCount: 14,
      alreadyMigrated: false,
    },
    {
      sourceSpreadsheetId: 'ss_old_1',
      sourceSpreadsheetTitle: 'Combined Legacy Workbook',
      sourceTab: 'CONTACT_SUBMISSIONS',
      domain: 'inbox',
      targetDatasetKey: 'Submissions',
      targetSpreadsheetTitle: 'Inbox — Submissions',
      estimatedRowCount: 6,
      alreadyMigrated: false,
    },
  ],
  localDraftSummary: {
    siteName: 'Creative Draft',
    portfolioSlug: 'creative-director',
  },
  ambiguities: [],
  hasPendingMigration: true,
};

describe('Phase 6 Legacy Browser Draft Cleanup & Migration Wizard UI', () => {
  const store = new Map<string, string>();
  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;

  beforeEach(async () => {
    store.clear();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      key: (idx: number) => Array.from(store.keys())[idx] ?? null,
      get length() {
        return store.size;
      },
    };
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
  });

  it('copies legacy browser draft safely into Project storage and clears only stale legacy keys on confirmation', () => {
    store.set(
      'indyshares_portfolio_site_v2',
      JSON.stringify({
        ...INITIAL_SITE,
        id: 'site_legacy_local',
        name: 'Legacy Studio',
        portfolioSlug: 'legacy-studio',
      })
    );
    store.set('indyshares_google_workspace_v2', JSON.stringify({ spreadsheetLinked: false }));

    expect(storageService.inspectLegacyDraft()).toEqual({
      exists: true,
      siteName: 'Legacy Studio',
      siteSlug: 'legacy-studio',
    });

    const imported = storageService.importLegacyDraftToProject('prj_target_iso');
    expect(imported?.name).toBe('Legacy Studio');
    expect(storageService.hasProjectDraft('prj_target_iso')).toBe(true);

    // Explicitly clearing stale legacy keys preserves the newly isolated project draft
    storageService.clearLegacyBrowserDrafts();
    expect(storageService.inspectLegacyDraft().exists).toBe(false);
    expect(storageService.hasProjectDraft('prj_target_iso')).toBe(true);
    expect(storageService.loadSite('prj_target_iso').portfolioSlug).toBe('legacy-studio');
  });

  it('renders LegacyMigrationWizard in English and Thai with inventory stats and spreadsheet partition table', async () => {
    for (const lang of ['en', 'th'] as const) {
      await i18n.changeLanguage(lang);
      const html = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <LegacyMigrationWizard
            accessToken="tok"
            activeOrgId={sampleOrg.org_id}
            activeProjectId={sampleProject.project_id}
            organizations={[sampleOrg]}
            projects={[sampleProject]}
            initialPlan={samplePlan}
            onMigrated={async () => {}}
          />
        </I18nextProvider>
      );

      expect(html).toContain(
        lang === 'th'
          ? 'ตัวช่วยย้ายข้อมูลและแยกสเปรดชีตเดิมเข้าโปรเจกต์'
          : 'Legacy Workspace'
      );
      expect(html).toContain('PORTFOLIO_PROJECTS');
      expect(html).toContain('CONTACT_SUBMISSIONS');
      expect(html).toContain('/creative-director');
      expect(html).not.toContain('console.migration.');
    }
  });
});
