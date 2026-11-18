import { DynamicBinding } from '../../types/builder';
import {
  CmsCollectionFieldFilter,
  CmsCollectionQuery,
  CmsCollectionQueryResult,
  CmsContentRecord,
  CmsContentTypeSchema,
  CmsDocument,
} from '../../types/cms';
import { collectDescendantTermIds } from './cmsValidation';

export type CmsExecutionMode = 'editor' | 'public_build';

const MAX_CACHE_ENTRIES = 120;
const queryResultCache = new Map<string, CmsCollectionQueryResult>();

export function invalidateCmsQueryCache(): void {
  queryResultCache.clear();
}

function stableQueryKey(
  cmsRevision: number,
  mode: CmsExecutionMode,
  query: CmsCollectionQuery,
  extraKey = ''
): string {
  return `${cmsRevision}:${mode}:${extraKey}:${JSON.stringify(query)}`;
}

function getFieldValue(record: CmsContentRecord, fieldKey: string): unknown {
  if (fieldKey === 'title' || fieldKey === '$title') return record.title;
  if (fieldKey === 'slug' || fieldKey === '$slug') return record.slug;
  if (fieldKey === 'status') return record.status;
  if (fieldKey === 'sortOrder') return record.sortOrder;
  if (fieldKey === 'createdAt') return record.createdAt;
  if (fieldKey === 'updatedAt') return record.updatedAt;
  if (fieldKey === 'publishedAt' || fieldKey === '$publishedAt') return record.publishedAt || '';
  if (fieldKey.startsWith('fields.')) {
    return record.fields[fieldKey.slice(7)];
  }
  if (record.relationIdsByField[fieldKey]) {
    return record.relationIdsByField[fieldKey];
  }
  return record.fields[fieldKey];
}

function matchesFieldFilter(record: CmsContentRecord, filter: CmsCollectionFieldFilter): boolean {
  const raw = getFieldValue(record, filter.fieldKey);
  const target = filter.value;

  switch (filter.operator) {
    case 'is_empty':
      return (
        raw === undefined ||
        raw === null ||
        String(raw).trim() === '' ||
        (Array.isArray(raw) && raw.length === 0)
      );
    case 'is_not_empty':
      return !(
        raw === undefined ||
        raw === null ||
        String(raw).trim() === '' ||
        (Array.isArray(raw) && raw.length === 0)
      );
    case 'eq':
      return String(raw ?? '').toLowerCase() === String(target ?? '').toLowerCase();
    case 'neq':
      return String(raw ?? '').toLowerCase() !== String(target ?? '').toLowerCase();
    case 'contains':
      if (Array.isArray(raw)) {
        return raw.some((v) => String(v).toLowerCase().includes(String(target ?? '').toLowerCase()));
      }
      return String(raw ?? '')
        .toLowerCase()
        .includes(String(target ?? '').toLowerCase());
    case 'in': {
      const list = Array.isArray(target)
        ? target.map((v) => String(v).toLowerCase())
        : String(target ?? '')
            .split(',')
            .map((v) => v.trim().toLowerCase())
            .filter(Boolean);
      if (Array.isArray(raw)) {
        return raw.some((v) => list.includes(String(v).toLowerCase()));
      }
      return list.includes(String(raw ?? '').toLowerCase());
    }
    case 'gt': {
      const nRaw = Number(raw);
      const nTarget = Number(target);
      if (Number.isFinite(nRaw) && Number.isFinite(nTarget)) return nRaw > nTarget;
      return String(raw ?? '') > String(target ?? '');
    }
    case 'lt': {
      const nRaw = Number(raw);
      const nTarget = Number(target);
      if (Number.isFinite(nRaw) && Number.isFinite(nTarget)) return nRaw < nTarget;
      return String(raw ?? '') < String(target ?? '');
    }
    default:
      return true;
  }
}

export function sanitizePublicRecord(
  record: CmsContentRecord,
  schema: CmsContentTypeSchema | undefined
): CmsContentRecord {
  if (!schema) return record;
  const hiddenKeys = new Set(
    schema.fields.filter((f) => f.publiclyExposed === false).map((f) => f.key)
  );
  if (hiddenKeys.size === 0) return record;
  const nextFields: Record<string, unknown> = {};
  Object.entries(record.fields).forEach(([k, v]) => {
    if (!hiddenKeys.has(k)) nextFields[k] = v;
  });
  return { ...record, fields: nextFields };
}

function expandRelationsForRecord(
  cms: CmsDocument,
  record: CmsContentRecord,
  depthRemaining: number,
  visitedIds: Set<string>,
  mode: CmsExecutionMode
): Record<string, CmsContentRecord[]> {
  if (depthRemaining <= 0) return {};
  const result: Record<string, CmsContentRecord[]> = {};
  const schema = cms.contentTypes.find((ct) => ct.id === record.contentTypeId);
  const relationFields = (schema?.fields || []).filter((f) => f.type === 'relation');

  relationFields.forEach((rf) => {
    const targetIds = record.relationIdsByField[rf.key] || [];
    if (targetIds.length === 0) return;

    const allowedStatuses =
      mode === 'public_build' || cms.settings.requirePublishedRelationsForPublic
        ? new Set(['published'])
        : new Set(rf.relationConfig?.allowedTargetStatuses || ['published', 'draft']);

    const resolvedTargets: CmsContentRecord[] = [];
    targetIds.forEach((tid) => {
      if (visitedIds.has(tid)) return; // Cycle guard
      const targetRec = cms.records.find((r) => r.recordId === tid);
      if (!targetRec) return;
      if (!allowedStatuses.has(targetRec.status)) return;
      const targetSchema = cms.contentTypes.find((ct) => ct.id === targetRec.contentTypeId);
      const safeRec =
        mode === 'public_build' ? sanitizePublicRecord(targetRec, targetSchema) : targetRec;
      resolvedTargets.push(safeRec);

      if (depthRemaining > 1) {
        const nextVisited = new Set(visitedIds);
        nextVisited.add(tid);
        expandRelationsForRecord(cms, safeRec, depthRemaining - 1, nextVisited, mode);
      }
    });

    if (resolvedTargets.length > 0) {
      result[rf.key] = resolvedTargets;
    }
  });

  return result;
}

export function executeCmsQuery(
  cms: CmsDocument | undefined,
  query: CmsCollectionQuery,
  options: { mode?: CmsExecutionMode } = {}
): CmsCollectionQueryResult {
  const mode: CmsExecutionMode = options.mode || 'editor';
  if (!cms) {
    return {
      records: [],
      totalCount: 0,
      filteredCount: 0,
      hasMore: false,
      expandedRelationsByRecord: {},
      fromCache: false,
      warnings: ['CMS repository is not initialized.'],
    };
  }

  const cacheKey = stableQueryKey(cms.revision, mode, query);
  const cached = queryResultCache.get(cacheKey);
  if (cached) {
    return { ...cached, fromCache: true };
  }

  const warnings: string[] = [];
  const schema = cms.contentTypes.find((ct) => ct.id === query.contentTypeId);
  if (!schema) {
    return {
      records: [],
      totalCount: 0,
      filteredCount: 0,
      hasMore: false,
      expandedRelationsByRecord: {},
      fromCache: false,
      warnings: [`Content Type "${query.contentTypeId}" was not found.`],
    };
  }

  if (mode === 'public_build' && (!schema.enabled || !schema.publiclyPublishable)) {
    return {
      records: [],
      totalCount: 0,
      filteredCount: 0,
      hasMore: false,
      expandedRelationsByRecord: {},
      fromCache: false,
      warnings: [`Content Type "${schema.pluralLabel}" is disabled or not publicly publishable.`],
    };
  }

  const allOfType = cms.records.filter((r) => r.contentTypeId === schema.id);

  // Strict status constraint
  const effectiveStatusFilter =
    mode === 'public_build' ? 'published_only' : query.statusFilter || 'published_only';

  let list = allOfType.filter((rec) => {
    if (effectiveStatusFilter === 'published_only') return rec.status === 'published';
    if (effectiveStatusFilter === 'all_non_trash') return rec.status !== 'trash';
    if (effectiveStatusFilter === 'draft') return rec.status === 'draft';
    if (effectiveStatusFilter === 'archived') return rec.status === 'archived';
    return rec.status === 'published';
  });

  // Field filters
  if (query.fieldFilters && query.fieldFilters.length > 0) {
    list = list.filter((rec) => query.fieldFilters!.every((f) => matchesFieldFilter(rec, f)));
  }

  // Taxonomy filter (supporting descendant terms when hierarchical)
  if (query.taxonomyFilter && query.taxonomyFilter.termIds.length > 0) {
    const { taxonomyId, termIds, includeDescendants = true } = query.taxonomyFilter;
    const tax = cms.taxonomies.find((t) => t.id === taxonomyId);
    const expandedTermIds =
      tax?.hierarchical && includeDescendants
        ? new Set(collectDescendantTermIds(taxonomyId, termIds, cms.terms))
        : new Set(termIds);

    list = list.filter((rec) => {
      const attached = rec.termIdsByTaxonomy[taxonomyId] || [];
      return attached.some((tid) => expandedTermIds.has(tid));
    });
  }

  // Relation filter
  if (query.relationFilter && query.relationFilter.targetRecordId) {
    const { fieldKey, targetRecordId } = query.relationFilter;
    list = list.filter((rec) => {
      const relIds = rec.relationIdsByField[fieldKey] || [];
      return relIds.includes(targetRecordId);
    });
  }

  // Search across searchable fields + title + slug
  const q = (query.search || '').trim().toLowerCase();
  if (q) {
    const searchableKeys = schema.fields
      .filter((f) => f.searchable !== false && (mode !== 'public_build' || f.publiclyExposed !== false))
      .map((f) => f.key);
    list = list.filter((rec) => {
      if (rec.title.toLowerCase().includes(q) || rec.slug.toLowerCase().includes(q)) return true;
      return searchableKeys.some((k) =>
        String(rec.fields[k] ?? '')
          .toLowerCase()
          .includes(q)
      );
    });
  }

  // Sort
  const sortBy = query.sortBy || 'sortOrder';
  const dir = query.sortDirection === 'desc' ? -1 : 1;
  list = [...list].sort((a, b) => {
    const va = getFieldValue(a, sortBy) ?? '';
    const vb = getFieldValue(b, sortBy) ?? '';
    if (typeof va === 'number' && typeof vb === 'number') {
      return (va - vb) * dir;
    }
    const sa = String(va).toLowerCase();
    const sb = String(vb).toLowerCase();
    if (sa < sb) return -1 * dir;
    if (sa > sb) return 1 * dir;
    return 0;
  });

  const filteredCount = list.length;
  const maxLimit = Math.min(50, Math.max(1, cms.settings.maxQueryLimit || 50));
  const limit = Math.min(maxLimit, Math.max(1, query.limit ?? 12));
  const offset = Math.max(0, query.offset ?? 0);
  const sliced = list.slice(offset, offset + limit);

  const safeRecords =
    mode === 'public_build' ? sliced.map((r) => sanitizePublicRecord(r, schema)) : sliced;

  const expandDepth = Math.min(
    cms.settings.maxRelationExpansionDepth || 2,
    Math.max(0, query.expandDepth ?? 1)
  );
  const expandedRelationsByRecord: Record<string, Record<string, CmsContentRecord[]>> = {};
  safeRecords.forEach((rec) => {
    expandedRelationsByRecord[rec.recordId] = expandRelationsForRecord(
      cms,
      rec,
      expandDepth,
      new Set([rec.recordId]),
      mode
    );
  });

  const result: CmsCollectionQueryResult = {
    records: safeRecords,
    totalCount: allOfType.filter((r) => r.status !== 'trash').length,
    filteredCount,
    hasMore: offset + limit < filteredCount,
    expandedRelationsByRecord,
    fromCache: false,
    warnings,
  };

  if (queryResultCache.size >= MAX_CACHE_ENTRIES) {
    const firstKey = queryResultCache.keys().next().value;
    if (firstKey) queryResultCache.delete(firstKey);
  }
  queryResultCache.set(cacheKey, result);
  return result;
}

export function resolveCmsRecordUrl(
  cms: CmsDocument | undefined,
  record: CmsContentRecord
): string {
  const schema = cms?.contentTypes.find((ct) => ct.id === record.contentTypeId);
  if (!schema || !schema.routable) return '#';
  const base = (schema.routeBasePath || `/${schema.slug}`).replace(/\/+$/, '');
  return `${base}/${record.slug}`;
}

export function resolveCmsDynamicFieldValue(
  cms: CmsDocument | undefined,
  binding: DynamicBinding,
  contextRecord?: CmsContentRecord,
  mode: CmsExecutionMode = 'editor'
): unknown {
  if (!cms) return undefined;

  let targetRecord = contextRecord;
  if (!targetRecord && binding.recordId) {
    targetRecord = cms.records.find((r) => r.recordId === binding.recordId);
  }
  if (!targetRecord) {
    const typeId = binding.contentTypeId || binding.tab || 'project';
    const res = executeCmsQuery(
      cms,
      {
        contentTypeId: typeId,
        statusFilter: mode === 'public_build' ? 'published_only' : 'all_non_trash',
        limit: 1,
        sortBy: 'sortOrder',
        sortDirection: 'asc',
      },
      { mode }
    );
    targetRecord = res.records[0];
  }

  if (!targetRecord) return undefined;
  const schema = cms.contentTypes.find((ct) => ct.id === targetRecord!.contentTypeId);
  const safeRecord =
    mode === 'public_build' ? sanitizePublicRecord(targetRecord, schema) : targetRecord;

  const field = binding.field;
  if (field === '$title') return safeRecord.title;
  if (field === '$slug') return safeRecord.slug;
  if (field === '$url') return resolveCmsRecordUrl(cms, safeRecord);
  if (field === '$publishedAt') return safeRecord.publishedAt || safeRecord.updatedAt;
  if (field === '$taxonomy_labels') {
    const allTermIds = Object.values(safeRecord.termIdsByTaxonomy || {}).flat();
    return allTermIds
      .map((tid) => cms.terms.find((t) => t.termId === tid)?.name)
      .filter(Boolean)
      .join(' · ');
  }
  if (field.startsWith('$terms.')) {
    const taxId = field.slice(7);
    const termIds = safeRecord.termIdsByTaxonomy[taxId] || [];
    return termIds
      .map((tid) => cms.terms.find((t) => t.termId === tid)?.name)
      .filter(Boolean)
      .join(', ');
  }

  // Relation traversal e.g. "services.title" or "related_project.cover_image"
  if (field.includes('.')) {
    const [relFieldKey, subField] = field.split('.', 2);
    const targetIds = safeRecord.relationIdsByField[relFieldKey] || [];
    if (targetIds.length === 0) return '';
    const values = targetIds
      .map((tid) => cms.records.find((r) => r.recordId === tid))
      .filter((r): r is CmsContentRecord => {
        if (!r) return false;
        if (mode === 'public_build') return r.status === 'published';
        return r.status !== 'trash';
      })
      .map((r) => {
        if (subField === '$url') return resolveCmsRecordUrl(cms, r);
        if (subField === 'title' || subField === '$title') return r.title;
        return r.fields[subField];
      })
      .filter((v) => v !== undefined && v !== null && String(v).trim() !== '');
    return values.length <= 1 ? values[0] : values.join(', ');
  }

  // Rich content reference fallback
  if (safeRecord.richContentRefs[field]) {
    const doc = cms.richDocs[safeRecord.richContentRefs[field]];
    if (doc?.content) return doc.content;
  }

  return safeRecord.fields[field] ?? (field === schema?.titleFieldKey ? safeRecord.title : undefined);
}
