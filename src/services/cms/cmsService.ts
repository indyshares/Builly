import { SiteDocument } from '../../types/builder';
import {
  CmsContentRecord,
  CmsContentTypeSchema,
  CmsDocument,
  CmsFieldDefinition,
  CmsOperationalLogEntry,
  CmsRecordStatus,
  CmsRelationshipDef,
  CmsRichContentDoc,
  CmsTaxonomy,
  CmsTerm,
} from '../../types/cms';
import { createInitialCmsDocument } from '../../data/cmsDefaults';
import { invalidateCmsQueryCache } from './cmsQueryEngine';
import {
  ensureUniqueRecordSlug,
  sanitizeCmsKey,
  sanitizeCmsSlug,
  sanitizeRichHtml,
  validateCmsRecord,
  wouldTermCreateCycle,
} from './cmsValidation';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
}

function appendOpLog(
  logs: CmsOperationalLogEntry[],
  level: CmsOperationalLogEntry['level'],
  action: string,
  detail: string
): CmsOperationalLogEntry[] {
  const entry: CmsOperationalLogEntry = {
    id: makeId('log'),
    timestamp: new Date().toISOString(),
    level,
    action,
    detail,
  };
  return [entry, ...logs].slice(0, 60);
}

function bumpCms(
  cms: CmsDocument,
  patch: Partial<CmsDocument>,
  log?: { level: CmsOperationalLogEntry['level']; action: string; detail: string }
): CmsDocument {
  invalidateCmsQueryCache();
  return {
    ...cms,
    ...patch,
    revision: (cms.revision || 1) + 1,
    operationalLogs: log
      ? appendOpLog(cms.operationalLogs || [], log.level, log.action, log.detail)
      : cms.operationalLogs || [],
  };
}

export function migrateSiteCms(site: SiteDocument): SiteDocument {
  if (site.cms && Array.isArray(site.cms.contentTypes) && site.cms.contentTypes.length > 0) {
    // Ensure all built-in schemas exist if older state is missing newer built-ins
    const defaults = createInitialCmsDocument();
    const existingIds = new Set(site.cms.contentTypes.map((ct) => ct.id));
    const missingBuiltIns = defaults.contentTypes.filter((ct) => !existingIds.has(ct.id));
    const existingTaxIds = new Set((site.cms.taxonomies || []).map((t) => t.id));
    const missingTaxes = defaults.taxonomies.filter((t) => !existingTaxIds.has(t.id));

    if (
      missingBuiltIns.length === 0 &&
      missingTaxes.length === 0 &&
      site.cms.settings &&
      site.cms.forms &&
      site.cms.inboxCategories
    ) {
      return site;
    }

    return {
      ...site,
      cms: {
        ...defaults,
        ...site.cms,
        contentTypes: [...site.cms.contentTypes, ...missingBuiltIns],
        taxonomies: [...(site.cms.taxonomies || []), ...missingTaxes],
        terms: site.cms.terms || defaults.terms,
        relationships: site.cms.relationships || defaults.relationships,
        richDocs: site.cms.richDocs || {},
        forms: site.cms.forms || defaults.forms,
        inboxSubmissions: site.cms.inboxSubmissions || defaults.inboxSubmissions,
        inboxCategories: site.cms.inboxCategories || defaults.inboxCategories,
        inboxNotes: site.cms.inboxNotes || defaults.inboxNotes,
        inboxActivities: site.cms.inboxActivities || defaults.inboxActivities,
        migrationLog: site.cms.migrationLog || [],
        operationalLogs: site.cms.operationalLogs || defaults.operationalLogs,
        storageHealth: site.cms.storageHealth || defaults.storageHealth,
        settings: { ...defaults.settings, ...(site.cms.settings || {}) },
      },
    };
  }

  return {
    ...site,
    cms: createInitialCmsDocument(),
  };
}

export interface CmsMutationResult {
  cms: CmsDocument;
  record?: CmsContentRecord;
  error?: string;
  fieldErrors?: Record<string, string>;
  conflictRevision?: number;
}

export function saveCmsRecord(
  cms: CmsDocument,
  input: {
    recordId?: string;
    contentTypeId: string;
    status: CmsRecordStatus;
    slug: string;
    fields: Record<string, unknown>;
    termIdsByTaxonomy: Record<string, string[]>;
    relationIdsByField: Record<string, string[]>;
    sortOrder?: number;
    scheduledAt?: string;
    expectedRevision?: number;
  }
): CmsMutationResult {
  const schema = cms.contentTypes.find((ct) => ct.id === input.contentTypeId);
  if (!schema) {
    return { cms, error: `Content Type "${input.contentTypeId}" does not exist.` };
  }

  const nowIso = new Date().toISOString();
  const existing = input.recordId
    ? cms.records.find((r) => r.recordId === input.recordId)
    : undefined;

  if (existing && input.expectedRevision !== undefined && existing.revision !== input.expectedRevision) {
    return {
      cms,
      error: `Revision conflict: record was updated to revision ${existing.revision} elsewhere.`,
      conflictRevision: existing.revision,
    };
  }

  // Merge preserved unknown fields + sanitize rich text fields
  const mergedFields: Record<string, unknown> = {
    ...(existing?.fields || {}),
    ...input.fields,
  };
  const nextRichDocs: Record<string, CmsRichContentDoc> = { ...(cms.richDocs || {}) };
  const nextRichRefs: Record<string, string> = { ...(existing?.richContentRefs || {}) };

  const recordId = existing?.recordId || makeId('rec');

  schema.fields.forEach((f) => {
    if (f.type === 'rich_text') {
      const rawHtml = String(mergedFields[f.key] ?? '');
      const cleanHtml = sanitizeRichHtml(rawHtml);
      mergedFields[f.key] = cleanHtml;
      const docId = nextRichRefs[f.key] || `rich_${recordId}_${f.key}`;
      nextRichRefs[f.key] = docId;
      nextRichDocs[docId] = {
        docId,
        recordId,
        fieldKey: f.key,
        driveFileId: nextRichDocs[docId]?.driveFileId,
        format: 'html-safe',
        content: cleanHtml,
        updatedAt: nowIso,
      };
    }
  });

  const derivedTitle = String(
    mergedFields[schema.titleFieldKey] ||
      mergedFields.title ||
      mergedFields.name ||
      mergedFields.headline ||
      mergedFields.question ||
      existing?.title ||
      'Untitled Record'
  ).trim();

  const cleanSlug =
    sanitizeCmsSlug(input.slug) ||
    ensureUniqueRecordSlug(derivedTitle, schema.id, cms.records, existing?.recordId);

  const candidate: CmsContentRecord = {
    recordId,
    contentTypeId: schema.id,
    status: input.status,
    slug: cleanSlug,
    title: derivedTitle,
    fields: mergedFields,
    richContentRefs: nextRichRefs,
    termIdsByTaxonomy: input.termIdsByTaxonomy || {},
    relationIdsByField: input.relationIdsByField || {},
    revision: existing ? existing.revision + 1 : 1,
    schemaVersion: schema.schemaVersion,
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? cms.records.length + 1,
    scheduledAt: input.scheduledAt,
    authorLabel: existing?.authorLabel || 'Portfolio Owner',
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
    publishedAt:
      input.status === 'published'
        ? existing?.publishedAt || nowIso
        : existing?.publishedAt,
    trashedAt: input.status === 'trash' ? existing?.trashedAt || nowIso : undefined,
  };

  const validation = validateCmsRecord(schema, candidate, cms.records);
  if (!validation.valid) {
    return {
      cms,
      error:
        validation.generalErrors[0] ||
        Object.values(validation.fieldErrors)[0] ||
        'Please fix the highlighted validation errors.',
      fieldErrors: validation.fieldErrors,
    };
  }

  const nextRecords = existing
    ? cms.records.map((r) => (r.recordId === recordId ? candidate : r))
    : [candidate, ...cms.records];

  const nextCms = bumpCms(
    cms,
    { records: nextRecords, richDocs: nextRichDocs },
    {
      level: 'info',
      action: existing ? 'record_updated' : 'record_created',
      detail: `${schema.singularLabel} "${candidate.title}" (${candidate.status}) saved at rev ${candidate.revision}.`,
    }
  );

  return { cms: nextCms, record: candidate };
}

export function transitionCmsRecordStatus(
  cms: CmsDocument,
  recordId: string,
  targetStatus: CmsRecordStatus
): CmsMutationResult {
  const existing = cms.records.find((r) => r.recordId === recordId);
  if (!existing) return { cms, error: 'Record not found.' };
  const schema = cms.contentTypes.find((ct) => ct.id === existing.contentTypeId);
  if (targetStatus === 'published' && schema) {
    const check = validateCmsRecord(schema, { ...existing, status: 'published' }, cms.records);
    if (!check.valid) {
      return {
        cms,
        error:
          check.generalErrors[0] ||
          Object.values(check.fieldErrors)[0] ||
          'Record failed validation required for publishing.',
        fieldErrors: check.fieldErrors,
      };
    }
  }

  const nowIso = new Date().toISOString();
  const updated: CmsContentRecord = {
    ...existing,
    status: targetStatus,
    revision: existing.revision + 1,
    updatedAt: nowIso,
    publishedAt: targetStatus === 'published' ? existing.publishedAt || nowIso : existing.publishedAt,
    trashedAt: targetStatus === 'trash' ? nowIso : undefined,
  };

  return {
    cms: bumpCms(
      cms,
      { records: cms.records.map((r) => (r.recordId === recordId ? updated : r)) },
      {
        level: 'info',
        action: 'record_status_changed',
        detail: `"${updated.title}" moved to ${targetStatus}.`,
      }
    ),
    record: updated,
  };
}

export function duplicateCmsRecord(
  cms: CmsDocument,
  recordId: string,
  options: { copyRelations?: boolean } = { copyRelations: true }
): CmsMutationResult {
  const src = cms.records.find((r) => r.recordId === recordId);
  if (!src) return { cms, error: 'Source record not found.' };
  const schema = cms.contentTypes.find((ct) => ct.id === src.contentTypeId);
  if (!schema) return { cms, error: 'Content type schema missing.' };

  const newId = makeId('rec');
  const nowIso = new Date().toISOString();
  const copyTitle = `${src.title} (Copy)`;
  const copySlug = ensureUniqueRecordSlug(`${src.slug}-copy`, src.contentTypeId, cms.records);
  const copyFields = JSON.parse(JSON.stringify(src.fields));
  if (schema.titleFieldKey) copyFields[schema.titleFieldKey] = copyTitle;

  const nextRichDocs = { ...(cms.richDocs || {}) };
  const copyRichRefs: Record<string, string> = {};
  Object.entries(src.richContentRefs || {}).forEach(([fieldKey, oldDocId]) => {
    const oldDoc = nextRichDocs[oldDocId];
    if (oldDoc) {
      const newDocId = `rich_${newId}_${fieldKey}`;
      copyRichRefs[fieldKey] = newDocId;
      nextRichDocs[newDocId] = {
        ...oldDoc,
        docId: newDocId,
        recordId: newId,
        driveFileId: undefined,
        updatedAt: nowIso,
      };
    }
  });

  const cloned: CmsContentRecord = {
    ...JSON.parse(JSON.stringify(src)),
    recordId: newId,
    status: 'draft',
    slug: copySlug,
    title: copyTitle,
    fields: copyFields,
    richContentRefs: copyRichRefs,
    relationIdsByField: options.copyRelations ? { ...src.relationIdsByField } : {},
    revision: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    publishedAt: undefined,
    trashedAt: undefined,
  };

  return {
    cms: bumpCms(
      cms,
      { records: [cloned, ...cms.records], richDocs: nextRichDocs },
      {
        level: 'info',
        action: 'record_duplicated',
        detail: `Duplicated "${src.title}" into draft "${copyTitle}".`,
      }
    ),
    record: cloned,
  };
}

export function findIncomingRecordReferences(
  cms: CmsDocument,
  targetRecordId: string
): { recordId: string; title: string; fieldKey: string }[] {
  const refs: { recordId: string; title: string; fieldKey: string }[] = [];
  cms.records.forEach((rec) => {
    if (rec.recordId === targetRecordId || rec.status === 'trash') return;
    Object.entries(rec.relationIdsByField || {}).forEach(([fieldKey, ids]) => {
      if (ids.includes(targetRecordId)) {
        refs.push({ recordId: rec.recordId, title: rec.title, fieldKey });
      }
    });
  });
  return refs;
}

export function deleteCmsRecordPermanently(
  cms: CmsDocument,
  recordId: string,
  options: { detachReferences?: boolean } = {}
): CmsMutationResult {
  const target = cms.records.find((r) => r.recordId === recordId);
  if (!target) return { cms, error: 'Record not found.' };

  const incoming = findIncomingRecordReferences(cms, recordId);
  if (incoming.length > 0 && !options.detachReferences) {
    return {
      cms,
      error: `Cannot permanently delete "${target.title}": referenced by ${incoming.length} record(s) (${incoming
        .slice(0, 2)
        .map((r) => r.title)
        .join(', ')}). Confirm detach or unlink first.`,
    };
  }

  const nextRichDocs = { ...(cms.richDocs || {}) };
  Object.values(target.richContentRefs || {}).forEach((docId) => {
    delete nextRichDocs[docId];
  });

  const nextRecords = cms.records
    .filter((r) => r.recordId !== recordId)
    .map((r) => {
      const nextRelMap: Record<string, string[]> = {};
      let changed = false;
      Object.entries(r.relationIdsByField || {}).forEach(([fk, ids]) => {
        const filtered = ids.filter((id) => id !== recordId);
        if (filtered.length !== ids.length) changed = true;
        nextRelMap[fk] = filtered;
      });
      return changed ? { ...r, relationIdsByField: nextRelMap } : r;
    });

  return {
    cms: bumpCms(
      cms,
      { records: nextRecords, richDocs: nextRichDocs },
      {
        level: 'warning',
        action: 'record_deleted_permanently',
        detail: `Permanently deleted "${target.title}".`,
      }
    ),
  };
}

export interface BulkActionResult {
  cms: CmsDocument;
  succeededIds: string[];
  failed: { recordId: string; title: string; reason: string }[];
}

export function bulkActionCmsRecords(
  cms: CmsDocument,
  recordIds: string[],
  action: 'publish' | 'draft' | 'archive' | 'trash' | 'restore' | 'delete_permanently'
): BulkActionResult {
  let workingCms = cms;
  const succeededIds: string[] = [];
  const failed: { recordId: string; title: string; reason: string }[] = [];

  for (const id of recordIds) {
    const rec = workingCms.records.find((r) => r.recordId === id);
    const title = rec?.title || id;

    if (!rec) {
      failed.push({ recordId: id, title, reason: 'Record missing.' });
      continue;
    }

    if (action === 'delete_permanently') {
      const res = deleteCmsRecordPermanently(workingCms, id, { detachReferences: false });
      if (res.error) {
        failed.push({ recordId: id, title, reason: res.error });
      } else {
        workingCms = res.cms;
        succeededIds.push(id);
      }
    } else {
      const targetStatus: CmsRecordStatus =
        action === 'publish'
          ? 'published'
          : action === 'archive'
          ? 'archived'
          : action === 'trash'
          ? 'trash'
          : 'draft';
      const res = transitionCmsRecordStatus(workingCms, id, targetStatus);
      if (res.error) {
        failed.push({ recordId: id, title, reason: res.error });
      } else {
        workingCms = res.cms;
        succeededIds.push(id);
      }
    }
  }

  return { cms: workingCms, succeededIds, failed };
}

export function createCustomContentType(
  cms: CmsDocument,
  input: {
    singularLabel: string;
    pluralLabel: string;
    slug?: string;
    description?: string;
    icon?: string;
    routable?: boolean;
  }
): { cms: CmsDocument; schema?: CmsContentTypeSchema; error?: string } {
  const cleanPlural = input.pluralLabel.trim();
  const cleanSingular = input.singularLabel.trim();
  if (!cleanSingular || !cleanPlural) {
    return { cms, error: 'Singular and plural labels are required.' };
  }

  const baseId = sanitizeCmsKey(cleanSingular) || 'custom_type';
  let typeId = `ct_${baseId}`;
  let suffix = 2;
  while (cms.contentTypes.some((ct) => ct.id === typeId)) {
    typeId = `ct_${baseId}_${suffix++}`;
  }

  const cleanSlug = sanitizeCmsSlug(input.slug || cleanPlural) || baseId;
  const nowIso = new Date().toISOString();
  const titleField: CmsFieldDefinition = {
    fieldId: makeId('fld'),
    key: 'title',
    label: 'Title',
    type: 'short_text',
    required: true,
    isSystem: true,
    group: 'General',
    order: 1,
    searchable: true,
    listVisible: true,
    publiclyExposed: true,
    schemaVersion: 1,
  };

  const schema: CmsContentTypeSchema = {
    id: typeId,
    slug: cleanSlug,
    singularLabel: cleanSingular,
    pluralLabel: cleanPlural,
    description: input.description?.trim() || `${cleanPlural} custom collection`,
    icon: input.icon || 'Database',
    isBuiltIn: false,
    enabled: true,
    titleFieldKey: 'title',
    routable: input.routable ?? true,
    routeBasePath: `/${cleanSlug}`,
    publiclyPublishable: true,
    schemaVersion: 1,
    sheetTableId: `CMS_REC_${typeId.toUpperCase()}`,
    fields: [titleField],
    attachedTaxonomyIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const nextCms = bumpCms(
    cms,
    {
      contentTypes: [...cms.contentTypes, schema],
      migrationLog: [
        {
          id: makeId('mig'),
          timestamp: nowIso,
          contentTypeId: schema.id,
          fromVersion: 0,
          toVersion: 1,
          summary: `Created custom content type "${schema.pluralLabel}".`,
          actor: 'Portfolio Owner',
        },
        ...(cms.migrationLog || []),
      ],
    },
    {
      level: 'info',
      action: 'content_type_created',
      detail: `Created custom content type "${schema.pluralLabel}" (${schema.sheetTableId}).`,
    }
  );

  return { cms: nextCms, schema };
}

export function updateContentTypeSchema(
  cms: CmsDocument,
  nextSchema: CmsContentTypeSchema,
  migrationSummary?: string
): CmsDocument {
  const prev = cms.contentTypes.find((ct) => ct.id === nextSchema.id);
  const nowIso = new Date().toISOString();
  const nextVersion = prev ? prev.schemaVersion + 1 : nextSchema.schemaVersion || 1;
  const updated: CmsContentTypeSchema = {
    ...nextSchema,
    schemaVersion: nextVersion,
    updatedAt: nowIso,
  };

  return bumpCms(
    cms,
    {
      contentTypes: cms.contentTypes.map((ct) => (ct.id === nextSchema.id ? updated : ct)),
      migrationLog: [
        {
          id: makeId('mig'),
          timestamp: nowIso,
          contentTypeId: updated.id,
          fromVersion: prev?.schemaVersion ?? 0,
          toVersion: nextVersion,
          summary: migrationSummary || `Updated schema for ${updated.pluralLabel} (v${nextVersion}).`,
          actor: 'Portfolio Owner',
        },
        ...(cms.migrationLog || []),
      ],
    },
    {
      level: 'info',
      action: 'schema_updated',
      detail: `Schema "${updated.pluralLabel}" bumped to v${nextVersion}.`,
    }
  );
}

export function deleteCustomContentType(
  cms: CmsDocument,
  contentTypeId: string
): { cms: CmsDocument; error?: string } {
  const target = cms.contentTypes.find((ct) => ct.id === contentTypeId);
  if (!target) return { cms, error: 'Content type not found.' };
  if (target.isBuiltIn) {
    return { cms, error: 'Built-in content types cannot be deleted (you can disable them instead).' };
  }

  return {
    cms: bumpCms(
      cms,
      {
        contentTypes: cms.contentTypes.filter((ct) => ct.id !== contentTypeId),
        records: cms.records.filter((r) => r.contentTypeId !== contentTypeId),
        relationships: cms.relationships.filter(
          (rel) => rel.sourceTypeId !== contentTypeId && rel.targetTypeId !== contentTypeId
        ),
      },
      {
        level: 'warning',
        action: 'content_type_deleted',
        detail: `Deleted custom content type "${target.pluralLabel}".`,
      }
    ),
  };
}

export function createTaxonomy(
  cms: CmsDocument,
  input: {
    label: string;
    singularLabel: string;
    hierarchical: boolean;
    contentTypeIds: string[];
    description?: string;
  }
): { cms: CmsDocument; taxonomy?: CmsTaxonomy; error?: string } {
  const key = sanitizeCmsKey(input.label);
  if (!key) return { cms, error: 'Taxonomy label is required.' };
  if (cms.taxonomies.some((t) => t.id === key || t.key === key)) {
    return { cms, error: `A taxonomy with key "${key}" already exists.` };
  }

  const nowIso = new Date().toISOString();
  const taxonomy: CmsTaxonomy = {
    id: key,
    key,
    label: input.label.trim(),
    singularLabel: input.singularLabel.trim() || input.label.trim(),
    description: input.description?.trim(),
    hierarchical: input.hierarchical,
    isBuiltIn: false,
    contentTypeIds: input.contentTypeIds,
    archiveBasePath: `/${sanitizeCmsSlug(input.label) || key}`,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const nextContentTypes = cms.contentTypes.map((ct) =>
    input.contentTypeIds.includes(ct.id) && !ct.attachedTaxonomyIds.includes(taxonomy.id)
      ? { ...ct, attachedTaxonomyIds: [...ct.attachedTaxonomyIds, taxonomy.id] }
      : ct
  );

  return {
    cms: bumpCms(
      cms,
      { taxonomies: [...cms.taxonomies, taxonomy], contentTypes: nextContentTypes },
      {
        level: 'info',
        action: 'taxonomy_created',
        detail: `Created taxonomy "${taxonomy.label}".`,
      }
    ),
    taxonomy,
  };
}

export function upsertCmsTerm(
  cms: CmsDocument,
  input: {
    termId?: string;
    taxonomyId: string;
    name: string;
    slug?: string;
    description?: string;
    parentTermId?: string | null;
  }
): { cms: CmsDocument; term?: CmsTerm; error?: string } {
  const tax = cms.taxonomies.find((t) => t.id === input.taxonomyId);
  if (!tax) return { cms, error: 'Taxonomy not found.' };
  const cleanName = input.name.trim();
  if (!cleanName) return { cms, error: 'Term name is required.' };

  const termId = input.termId || makeId('term');
  if (tax.hierarchical && input.parentTermId && wouldTermCreateCycle(termId, input.parentTermId, cms.terms)) {
    return { cms, error: 'Selected parent term would create a hierarchy loop.' };
  }

  let cleanSlug = sanitizeCmsSlug(input.slug || cleanName) || 'term';
  const siblingSlugs = new Set(
    cms.terms
      .filter((t) => t.taxonomyId === input.taxonomyId && t.termId !== termId)
      .map((t) => t.slug.toLowerCase())
  );
  if (siblingSlugs.has(cleanSlug)) {
    let n = 2;
    while (siblingSlugs.has(`${cleanSlug}-${n}`)) n++;
    cleanSlug = `${cleanSlug}-${n}`;
  }

  const nowIso = new Date().toISOString();
  const existing = cms.terms.find((t) => t.termId === termId);
  const term: CmsTerm = {
    termId,
    taxonomyId: input.taxonomyId,
    name: cleanName,
    slug: cleanSlug,
    description: input.description?.trim(),
    parentTermId: tax.hierarchical ? input.parentTermId || null : null,
    sortOrder: existing?.sortOrder ?? cms.terms.filter((t) => t.taxonomyId === input.taxonomyId).length,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const nextTerms = existing
    ? cms.terms.map((t) => (t.termId === termId ? term : t))
    : [...cms.terms, term];

  return {
    cms: bumpCms(
      cms,
      { terms: nextTerms },
      {
        level: 'info',
        action: existing ? 'term_updated' : 'term_created',
        detail: `${tax.singularLabel} "${term.name}" saved.`,
      }
    ),
    term,
  };
}

export function deleteCmsTermSafely(
  cms: CmsDocument,
  termId: string,
  strategy: { mode: 'detach' | 'replace'; replacementTermId?: string }
): { cms: CmsDocument; error?: string } {
  const target = cms.terms.find((t) => t.termId === termId);
  if (!target) return { cms, error: 'Term not found.' };
  if (strategy.mode === 'replace' && (!strategy.replacementTermId || strategy.replacementTermId === termId)) {
    return { cms, error: 'Choose a valid replacement term.' };
  }

  // Reparent child terms cleanly to grandparent
  const nextTerms = cms.terms
    .filter((t) => t.termId !== termId)
    .map((t) => (t.parentTermId === termId ? { ...t, parentTermId: target.parentTermId || null } : t));

  const nextRecords = cms.records.map((rec) => {
    const existingIds = rec.termIdsByTaxonomy[target.taxonomyId] || [];
    if (!existingIds.includes(termId)) return rec;
    const replaced =
      strategy.mode === 'replace' && strategy.replacementTermId
        ? Array.from(
            new Set(
              existingIds.map((id) => (id === termId ? strategy.replacementTermId! : id))
            )
          )
        : existingIds.filter((id) => id !== termId);
    return {
      ...rec,
      termIdsByTaxonomy: {
        ...rec.termIdsByTaxonomy,
        [target.taxonomyId]: replaced,
      },
    };
  });

  return {
    cms: bumpCms(
      cms,
      { terms: nextTerms, records: nextRecords },
      {
        level: 'warning',
        action: 'term_deleted',
        detail: `Deleted term "${target.name}" (${strategy.mode}).`,
      }
    ),
  };
}

export function upsertRelationshipDef(
  cms: CmsDocument,
  rel: CmsRelationshipDef
): CmsDocument {
  const exists = cms.relationships.some((r) => r.id === rel.id);
  const nextRelationships = exists
    ? cms.relationships.map((r) => (r.id === rel.id ? rel : r))
    : [...cms.relationships, rel];

  return bumpCms(
    cms,
    { relationships: nextRelationships },
    {
      level: 'info',
      action: exists ? 'relationship_updated' : 'relationship_created',
      detail: `Relationship "${rel.name}" (${rel.sourceTypeId}.${rel.fieldKey} -> ${rel.targetTypeId}) saved.`,
    }
  );
}

export function findCmsAssetReferences(
  cms: CmsDocument | undefined,
  assetId: string,
  assetUrl: string
): { recordId: string; title: string; contentTypeId: string }[] {
  if (!cms) return [];
  const matches: { recordId: string; title: string; contentTypeId: string }[] = [];
  cms.records.forEach((rec) => {
    if (rec.status === 'trash') return;
    const hit = Object.values(rec.fields).some((val) => {
      if (typeof val === 'string') {
        return val === assetUrl || val === assetId;
      }
      if (Array.isArray(val)) {
        return val.some((item) => item === assetUrl || item === assetId);
      }
      return false;
    });
    if (hit) {
      matches.push({
        recordId: rec.recordId,
        title: rec.title,
        contentTypeId: rec.contentTypeId,
      });
    }
  });
  return matches;
}

export function exportCmsBackupJson(cms: CmsDocument): string {
  return JSON.stringify(
    {
      format: 'indyshares-cms-backup',
      exportedAt: new Date().toISOString(),
      cms,
    },
    null,
    2
  );
}

export function parseCmsBackupJson(rawJson: string): { cms?: CmsDocument; error?: string } {
  try {
    const parsed = JSON.parse(rawJson);
    const candidate: CmsDocument = parsed.cms || parsed;
    if (!candidate || !Array.isArray(candidate.contentTypes) || !Array.isArray(candidate.records)) {
      return { error: 'Invalid CMS backup file: missing contentTypes or records arrays.' };
    }
    invalidateCmsQueryCache();
    return { cms: candidate };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'Could not parse JSON backup file.',
    };
  }
}
