import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { ProjectDashboardPage } from '../../pages/ProjectDashboardPage';
import { ProjectAssetsPage } from '../../pages/modules/ProjectAssetsPage';
import { ProjectInboxPage, mergeRemoteInboxIntoCms } from '../../pages/modules/ProjectInboxPage';
import { ProjectPublishingPage } from '../../pages/modules/ProjectPublishingPage';
import { ProjectSettingsPage } from '../../pages/modules/ProjectSettingsPage';
import { ProjectVersionsPage } from '../../pages/modules/ProjectVersionsPage';
import { assetRepository } from '../assetRepository';
import { cmsRepository } from '../cms/cmsRepository';
import { storageService } from '../storageService';
import {
  ALL_PROJECT_MODULES,
  OrganizationRecord,
  ProjectModuleRecord,
  ProjectRecord,
  SiteRecord,
} from '../../types/workspace';

const mockOrg: OrganizationRecord = {
  org_id: 'org_test_1',
  owner_id: 'owner_test_1',
  name: 'Northstar Studio',
  org_slug: 'northstar-studio',
  drive_folder_id: 'drv_org_1',
  status: 'active',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const mockProject: ProjectRecord = {
  project_id: 'prj_test_1',
  org_id: 'org_test_1',
  owner_id: 'owner_test_1',
  name: 'Agency Platform',
  project_slug: 'agency-platform',
  description: 'Client delivery workspace',
  drive_folder_id: 'drv_prj_1',
  status: 'active',
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
};

const mockModules: ProjectModuleRecord[] = ALL_PROJECT_MODULES.map((key, idx) => ({
  id: `mod_${idx}`,
  project_id: mockProject.project_id,
  module_key: key,
  enabled: 1,
  config_json: '{}',
  updated_at: '2026-04-01T00:00:00Z',
}));

const mockSites: SiteRecord[] = [
  {
    site_id: 'site_test_1',
    project_id: mockProject.project_id,
    org_id: mockOrg.org_id,
    owner_id: mockOrg.owner_id,
    site_slug: 'northstar-agency',
    site_name: 'Northstar Agency',
    custom_domain: null,
    status: 'published',
    active_publish_version: 'v1.0.0',
    active_build_id: 'bld_1',
    drive_config_folder_id: '',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
];

describe('Phase 5 Shared Asset Repository, Inbox Merge, & Standalone Module UIs', () => {
  const store = new Map<string, string>();
  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;

  beforeEach(async () => {
    store.clear();
    assetRepository.clearCache();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    await i18n.changeLanguage('en');
  });

  afterEach(() => {
    assetRepository.clearCache();
    (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
  });

  it('isolates Project assets via assetRepository and synchronizes edits with storageService drafts', () => {
    const assetsA = assetRepository.addAsset('prj_alpha', {
      id: 'ast_alpha_1',
      name: 'hero-banner.png',
      url: 'data:image/png;base64,AAA',
      size: '42 KB',
      type: 'image',
      mimeType: 'image/png',
      category: 'images',
      altText: 'Hero Banner',
      driveFileId: 'drv_alpha_1',
      createdAt: '2026-04-02',
    });
    expect(assetsA.some((a) => a.id === 'ast_alpha_1')).toBe(true);

    // Project Beta stays strictly isolated from Project Alpha
    const loadedBeta = storageService.loadSite('prj_beta');
    expect(loadedBeta.mediaAssets.some((a) => a.id === 'ast_alpha_1')).toBe(false);

    // Loading Project Alpha reconciles with assetRepository
    const loadedAlpha = storageService.loadSite('prj_alpha');
    expect(loadedAlpha.mediaAssets.some((a) => a.id === 'ast_alpha_1')).toBe(true);

    // Deleting via assetRepository propagates to storageService.loadSite on next read
    assetRepository.deleteAsset('prj_alpha', 'ast_alpha_1');
    const afterDelete = storageService.loadSite('prj_alpha');
    expect(afterDelete.mediaAssets.some((a) => a.id === 'ast_alpha_1')).toBe(false);
  });

  it('merges remote Google Sheets form submissions non-destructively without overwriting local triage', () => {
    const baseCms = cmsRepository.getCms('prj_inbox_merge_unit');
    const triagedDoc = {
      ...baseCms,
      inboxSubmissions: [
        {
          inbox_item_id: 'inb_existing',
          submission_id: 'sub_1',
          site_id: 'site_1',
          form_id: 'contact',
          form_name_snapshot: 'Contact Form',
          category_id: 'cat_inquiry',
          destination_spreadsheet_id: 'sheet_1',
          destination_worksheet_id: 'CONTACT_SUBMISSIONS',
          read_status: 'read' as const,
          starred: true,
          archived: false,
          spam_status: 'ham' as const,
          submitted_at: '2026-04-01T10:00:00Z',
          source_page: '/',
          fields: { full_name: 'Alice', email: 'alice@example.com' },
          created_at: '2026-04-01T10:00:00Z',
          updated_at: '2026-04-01T11:00:00Z',
        },
      ],
    };

    const merged = mergeRemoteInboxIntoCms(triagedDoc, {
      remoteSubmissions: [
        // Duplicate of sub_1 should keep read_status === 'read' and starred === true
        {
          inbox_item_id: 'inb_sheet_sub_1',
          submission_id: 'sub_1',
          site_id: 'site_1',
          form_id: 'contact',
          form_name_snapshot: 'Contact Form',
          category_id: 'cat_inquiry',
          destination_spreadsheet_id: 'sheet_1',
          destination_worksheet_id: 'CONTACT_SUBMISSIONS',
          submitted_at: '2026-04-01T10:00:00Z',
          source_page: '/',
          fields: { full_name: 'Alice', email: 'alice@example.com' },
        },
        // New remote submission should be appended
        {
          inbox_item_id: 'inb_sheet_sub_2',
          submission_id: 'sub_2',
          site_id: 'site_1',
          form_id: 'contact',
          form_name_snapshot: 'Contact Form',
          category_id: 'cat_inquiry',
          destination_spreadsheet_id: 'sheet_1',
          destination_worksheet_id: 'CONTACT_SUBMISSIONS',
          submitted_at: '2026-04-02T09:00:00Z',
          source_page: '/pricing',
          fields: { full_name: 'Somchai', email: 'somchai@example.com' },
        },
      ],
    });

    expect(merged.addedCount).toBe(1);
    expect(merged.nextCms.inboxSubmissions).toHaveLength(2);
    const existing = merged.nextCms.inboxSubmissions?.find((s) => s.submission_id === 'sub_1');
    expect(existing?.read_status).toBe('read');
    expect(existing?.starred).toBe(true);
    expect(merged.nextCms.inboxSubmissions?.[0]?.submission_id).toBe('sub_2');
  });

  it('renders all 5 standalone modules and ProjectDashboardPage cleanly in English and Thai with zero raw translation keys', async () => {
    const noop = () => {};
    const asyncNoop = async () => {};

    for (const lang of ['en', 'th'] as const) {
      await i18n.changeLanguage(lang);

      const inboxHtml = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <ProjectInboxPage
            organization={mockOrg}
            project={mockProject}
            modules={mockModules}
            sites={mockSites}
            accessToken="tok"
            googleWorkspaceConnected={true}
            googleWorkspaceNeedsReauth={false}
            authBusy={false}
            onNavigate={noop}
            onSignOut={asyncNoop}
          />
        </I18nextProvider>
      );
      expect(inboxHtml).toContain(lang === 'th' ? 'กล่องข้อความและฟอร์ม (Inbox)' : 'Form Inbox');
      expect(inboxHtml).not.toContain('console.inbox.');

      const assetsHtml = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <ProjectAssetsPage
            organization={mockOrg}
            project={mockProject}
            modules={mockModules}
            accessToken="tok"
            googleWorkspaceConnected={true}
            googleWorkspaceNeedsReauth={false}
            authBusy={false}
            onNavigate={noop}
            onSignOut={asyncNoop}
          />
        </I18nextProvider>
      );
      expect(assetsHtml).toContain(
        lang === 'th' ? 'คลังไฟล์สื่อและสตูดิโอเวกเตอร์' : 'Project Assets'
      );
      expect(assetsHtml).not.toContain('console.assets.');
      expect(assetsHtml).not.toContain('assetLibrary.');

      const pubHtml = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <ProjectPublishingPage
            organization={mockOrg}
            project={mockProject}
            modules={mockModules}
            sites={mockSites}
            accessToken="tok"
            googleWorkspaceConnected={true}
            googleWorkspaceNeedsReauth={false}
            authBusy={false}
            onRefreshBootstrap={asyncNoop}
            onNavigate={noop}
            onSignOut={asyncNoop}
          />
        </I18nextProvider>
      );
      expect(pubHtml).toContain(
        lang === 'th' ? 'การเผยแพร่เว็บไซต์และส่งออกซอร์สโค้ด' : 'Site Publishing'
      );
      expect(pubHtml).toContain('/s/northstar-agency');
      expect(pubHtml).not.toContain('console.publishing.');

      const versionsHtml = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <ProjectVersionsPage
            organization={mockOrg}
            project={mockProject}
            modules={mockModules}
            sites={mockSites}
            accessToken="tok"
            authBusy={false}
            onRefreshBootstrap={asyncNoop}
            onNavigate={noop}
            onSignOut={asyncNoop}
          />
        </I18nextProvider>
      );
      expect(versionsHtml).toContain(
        lang === 'th' ? 'ประวัติเวอร์ชันและการย้อนกลับ' : 'Release History'
      );
      expect(versionsHtml).not.toContain('console.versions.');

      const settingsHtml = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <ProjectSettingsPage
            organization={mockOrg}
            project={mockProject}
            modules={mockModules}
            resources={[]}
            accessToken="tok"
            googleWorkspaceConnected={true}
            googleWorkspaceNeedsReauth={false}
            togglingModuleKey={null}
            provisioningDrive={false}
            authBusy={false}
            onToggleModule={asyncNoop}
            onProvisionDrive={asyncNoop}
            onRefreshBootstrap={asyncNoop}
            onNavigate={noop}
            onSignOut={asyncNoop}
          />
        </I18nextProvider>
      );
      expect(settingsHtml).toContain(lang === 'th' ? 'ตั้งค่าโปรเจกต์' : 'Project Settings');
      expect(settingsHtml).not.toContain('console.settings.');

      const dashboardHtml = renderToStaticMarkup(
        <I18nextProvider i18n={i18n}>
          <ProjectDashboardPage
            organization={mockOrg}
            project={mockProject}
            modules={mockModules}
            sites={mockSites}
            resources={[]}
            googleWorkspaceConnected={true}
            googleWorkspaceNeedsReauth={false}
            togglingModuleKey={null}
            provisioningDrive={false}
            savingSite={false}
            driveNotice={null}
            actionError={null}
            authBusy={false}
            onDismissError={noop}
            onToggleModule={asyncNoop}
            onProvisionDrive={asyncNoop}
            onAddSite={async () => true}
            onUpdateSite={async () => true}
            onNavigate={noop}
            onSignOut={asyncNoop}
          />
        </I18nextProvider>
      );
      expect(dashboardHtml).toContain(lang === 'th' ? 'เปิดโมดูล' : 'Open Module');
      expect(dashboardHtml).not.toContain('console.dashboard.openModuleBtn');
    }
  });
});
