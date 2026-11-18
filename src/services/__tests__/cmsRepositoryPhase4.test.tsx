import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { INITIAL_SITE } from '../../data/initialSite';
import { ProjectCmsPage } from '../../pages/modules/ProjectCmsPage';
import { ALL_PROJECT_MODULES } from '../../types/workspace';
import { cmsRepository, getProjectCmsStorageKey } from '../cms/cmsRepository';
import { storageService } from '../storageService';

describe('Phase 4: Unified CMS Repository & Standalone Project CMS Module', () => {
  const store = new Map<string, string>();
  const prevLocalStorage = (globalThis as Record<string, unknown>).localStorage;

  beforeEach(() => {
    store.clear();
    cmsRepository.clearCache();
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
  });

  afterEach(() => {
    cmsRepository.clearCache();
    (globalThis as Record<string, unknown>).localStorage = prevLocalStorage;
  });

  it('keeps standalone CMS repository and Builder storageService synchronized via the same records', () => {
    const projectId = 'prj_cms_sync';
    const subscriber = vi.fn();
    const unsubscribe = cmsRepository.subscribe(projectId, subscriber);

    try {
      // 1. Standalone CMS creates and publishes a record BEFORE Builder has saved any draft
      const createRes = cmsRepository.saveRecord(projectId, {
        contentTypeId: 'post',
        status: 'published',
        slug: 'architectural-notes',
        fields: {
          title: 'Architectural Notes',
          excerpt: 'Shared CMS repository across Builder and Console',
          body: '<p>Single source of truth</p>',
        },
        termIdsByTaxonomy: {},
        relationIdsByField: {},
      });

      expect(createRes.error).toBeUndefined();
      expect(createRes.record?.title).toBe('Architectural Notes');
      expect(getProjectCmsStorageKey(projectId)).toBe('builly_project_cms:prj_cms_sync');
      expect(subscriber).toHaveBeenCalledTimes(1);

      // 2. Opening Visual Builder loads that exact record in site.cms
      const loadedSite = storageService.loadSite(projectId);
      const matchInBuilder = loadedSite.cms?.records.find(
        (r) => r.recordId === createRes.record?.recordId
      );
      expect(matchInBuilder).toBeDefined();
      expect(matchInBuilder?.title).toBe('Architectural Notes');
      expect(matchInBuilder?.status).toBe('published');

      // 3. Updating CMS inside Visual Builder reflects immediately in cmsRepository
      const builderEditedRes = cmsRepository.saveRecord(projectId, {
        recordId: createRes.record!.recordId,
        contentTypeId: 'post',
        status: 'published',
        slug: 'architectural-notes',
        fields: {
          title: 'Architectural Notes (Revised in Builder)',
          excerpt: 'Updated from contextual modal',
          body: '<p>Updated body</p>',
        },
        termIdsByTaxonomy: {},
        relationIdsByField: {},
      });
      expect(builderEditedRes.error).toBeUndefined();

      const standaloneAfterBuilderEdit = cmsRepository.getCms(projectId);
      const updatedRecord = standaloneAfterBuilderEdit.records.find(
        (r) => r.recordId === createRes.record?.recordId
      );
      expect(updatedRecord?.title).toBe('Architectural Notes (Revised in Builder)');
      expect(subscriber).toHaveBeenCalledTimes(2);
    } finally {
      unsubscribe();
    }
  });

  it('enforces CMS record validation rules and isolates records between projects', () => {
    // Required title must fail validation
    const invalidRes = cmsRepository.saveRecord('prj_one', {
      contentTypeId: 'post',
      status: 'published',
      slug: '',
      fields: {
        title: '   ',
      },
      termIdsByTaxonomy: {},
      relationIdsByField: {},
    });
    expect(invalidRes.error).toBeTruthy();

    // Valid save in prj_one must never leak into prj_two
    const savedOne = cmsRepository.saveRecord('prj_one', {
      contentTypeId: 'post',
      status: 'draft',
      slug: 'only-in-project-one',
      fields: { title: 'Only in Project One' },
      termIdsByTaxonomy: {},
      relationIdsByField: {},
    });
    expect(savedOne.error).toBeUndefined();

    const cmsTwo = cmsRepository.getCms('prj_two');
    expect(cmsTwo.records.some((r) => r.slug === 'only-in-project-one')).toBe(false);

    // Non-destructive legacy draft import copies legacy CMS data into target project
    const legacyWithCustomRecord = {
      ...INITIAL_SITE,
      name: 'Legacy Brand',
      cms: {
        ...cmsRepository.getCms('legacy_seed'),
        revision: 9,
      },
    };
    storageService.saveSiteDraft(legacyWithCustomRecord);
    const imported = storageService.importLegacyDraftToProject('prj_imported');
    expect(imported?.cms?.revision).toBe(9);
    expect(cmsRepository.getCms('prj_imported').revision).toBe(9);
  });

  it('renders standalone ProjectCmsPage cleanly in English and Thai', async () => {
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
      project_id: 'prj_standalone_cms',
      org_id: 'org_1',
      owner_id: 'owner_1',
      name: 'Headless Editorial Hub',
      project_slug: 'editorial-hub',
      description: 'Standalone CMS repository',
      drive_folder_id: '',
      status: 'active' as const,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const modules = ALL_PROJECT_MODULES.map((m) => ({
      id: `mod_${m}`,
      project_id: project.project_id,
      module_key: m,
      enabled: m === 'builder' ? 0 : 1,
      config_json: '{}',
      updated_at: '2026-01-01T00:00:00Z',
    }));

    cmsRepository.saveRecord(project.project_id, {
      contentTypeId: 'post',
      status: 'published',
      slug: 'standalone-cms-guide',
      fields: { title: 'Standalone CMS Guide', excerpt: 'Ready for Builder & API' },
      termIdsByTaxonomy: {},
      relationIdsByField: {},
    });

    await i18n.changeLanguage('en');
    const enHtml = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ProjectCmsPage
          organization={org}
          project={project}
          modules={modules}
          sites={[]}
          accessToken=""
          ownerId="owner_1"
          googleWorkspaceConnected={false}
          googleWorkspaceNeedsReauth={false}
          authBusy={false}
          onNavigate={vi.fn()}
          onSignOut={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nextProvider>
    );

    expect(enHtml).toContain('Headless Editorial Hub');
    expect(enHtml).toContain('Project Content &amp; Schemas');
    expect(enHtml).toContain('Standalone CMS Guide');
    // Builder module disabled -> Launch Builder button omitted cleanly
    expect(enHtml).not.toContain('Launch Builder');

    await i18n.changeLanguage('th');
    const thHtml = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ProjectCmsPage
          organization={org}
          project={project}
          modules={modules}
          sites={[]}
          accessToken=""
          ownerId="owner_1"
          googleWorkspaceConnected={false}
          googleWorkspaceNeedsReauth={false}
          authBusy={false}
          onNavigate={vi.fn()}
          onSignOut={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nextProvider>
    );

    expect(thHtml).toContain('เนื้อหาและโครงสร้างข้อมูลโปรเจกต์ (CMS)');
    expect(thHtml).toContain('Standalone CMS Guide');
    await i18n.changeLanguage('en');
  });
});
