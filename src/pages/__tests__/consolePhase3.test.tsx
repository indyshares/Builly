import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import { AuthProvider } from '../../features/identity/AuthContext';
import { peekPendingReturnTo } from '../../features/identity/authService';
import { LandingPage } from '../LandingPage';
import { ProjectDashboardPage } from '../ProjectDashboardPage';
import { INITIAL_SITE } from '../../data/initialSite';
import { getProjectDraftStorageKey, storageService } from '../../services/storageService';
import { ALL_PROJECT_MODULES } from '../../types/workspace';

describe('Phase 3: Console entry, Project Dashboard & isolated project drafts', () => {
  it('renders LandingPage cleanly inside AuthProvider + I18nextProvider', () => {
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <AuthProvider>
          <LandingPage onNavigate={vi.fn()} />
        </AuthProvider>
      </I18nextProvider>
    );
    expect(html).toContain('Build Your Website Freely');
    expect(html).toContain('Start Building');
  });

  it('renders ProjectDashboardPage cleanly in English and Thai without hook or missing-key issues', async () => {
    const org = {
      org_id: 'org_1',
      owner_id: 'owner_1',
      name: 'Acme Studio',
      org_slug: 'acme-studio',
      drive_folder_id: 'drv_org_1',
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const project = {
      project_id: 'prj_headless',
      org_id: 'org_1',
      owner_id: 'owner_1',
      name: 'Editorial Knowledge Base',
      project_slug: 'editorial-kb',
      description: 'Headless CMS and inquiry inbox without a public website.',
      drive_folder_id: '',
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const modules = ALL_PROJECT_MODULES.map((m) => ({
      id: `mod_${m}`,
      project_id: 'prj_headless',
      module_key: m,
      enabled: m === 'builder' || m === 'publishing' ? 0 : 1,
      config_json: '{}',
      updated_at: '2026-01-01T00:00:00Z',
    }));

    await i18n.changeLanguage('en');
    const enHtml = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ProjectDashboardPage
          organization={org}
          project={project}
          modules={modules}
          sites={[]}
          resources={[]}
          googleWorkspaceConnected={false}
          googleWorkspaceNeedsReauth={false}
          togglingModuleKey={null}
          provisioningDrive={false}
          savingSite={false}
          driveNotice={null}
          actionError={null}
          authBusy={false}
          onDismissError={vi.fn()}
          onToggleModule={vi.fn().mockResolvedValue(undefined)}
          onProvisionDrive={vi.fn().mockResolvedValue(undefined)}
          onAddSite={vi.fn().mockResolvedValue(true)}
          onUpdateSite={vi.fn().mockResolvedValue(true)}
          onNavigate={vi.fn()}
          onSignOut={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nextProvider>
    );

    expect(enHtml).toContain('Editorial Knowledge Base');
    expect(enHtml).toContain('Builly/acme-studio/editorial-kb/');
    expect(enHtml).toContain('5 / 7');
    expect(enHtml).toContain('No public Site attached yet');

    await i18n.changeLanguage('th');
    const thHtml = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ProjectDashboardPage
          organization={org}
          project={project}
          modules={modules}
          sites={[]}
          resources={[]}
          googleWorkspaceConnected={false}
          googleWorkspaceNeedsReauth={false}
          togglingModuleKey={null}
          provisioningDrive={false}
          savingSite={false}
          driveNotice={null}
          actionError={null}
          authBusy={false}
          onDismissError={vi.fn()}
          onToggleModule={vi.fn().mockResolvedValue(undefined)}
          onProvisionDrive={vi.fn().mockResolvedValue(undefined)}
          onAddSite={vi.fn().mockResolvedValue(true)}
          onUpdateSite={vi.fn().mockResolvedValue(true)}
          onNavigate={vi.fn()}
          onSignOut={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nextProvider>
    );

    expect(thHtml).toContain('โมดูลของโปรเจกต์');
    expect(thHtml).toContain('Editorial Knowledge Base');
    await i18n.changeLanguage('en');
  });

  it('isolates local drafts per projectId and imports legacy draft non-destructively', () => {
    const store = new Map<string, string>();
    const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };

    try {
      const legacySite = { ...INITIAL_SITE, name: 'Legacy Portfolio', portfolioSlug: 'legacy-site' };
      storageService.saveSiteDraft(legacySite);
      expect(storageService.inspectLegacyDraft()).toEqual({
        exists: true,
        siteName: 'Legacy Portfolio',
        siteSlug: 'legacy-site',
      });

      expect(getProjectDraftStorageKey('prj_alpha')).toBe('builly_project_draft:prj_alpha');
      expect(storageService.hasProjectDraft('prj_alpha')).toBe(false);

      // Saving draft in prj_beta must not alter prj_alpha or legacy draft
      const betaSite = { ...INITIAL_SITE, name: 'Beta Site', portfolioSlug: 'beta-site' };
      storageService.saveSiteDraft(betaSite, 'prj_beta');
      expect(storageService.loadSite('prj_beta').name).toBe('Beta Site');
      expect(storageService.loadSite('prj_alpha').name).toBe(INITIAL_SITE.name);
      expect(storageService.loadSite().name).toBe('Legacy Portfolio');

      // Explicit non-destructive import into prj_alpha copies legacy draft
      const imported = storageService.importLegacyDraftToProject('prj_alpha');
      expect(imported?.name).toBe('Legacy Portfolio');
      expect(storageService.hasProjectDraft('prj_alpha')).toBe(true);
      expect(storageService.loadSite('prj_alpha').name).toBe('Legacy Portfolio');
      expect(storageService.loadSite().name).toBe('Legacy Portfolio');
    } finally {
      (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
    }
  });

  it('defaults pending auth returnTo to /console in SSR/non-browser environments', () => {
    expect(peekPendingReturnTo()).toBe('/console');
  });
});
