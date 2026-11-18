import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceMode, ElementNode } from '../../types/builder';
import {
  CarouselConfig,
  CmsCollectionQuery,
  CmsContentRecord,
  CmsDocument,
} from '../../types/cms';
import {
  executeCmsQuery,
  resolveCmsRecordUrl,
} from '../../services/cms/cmsQueryEngine';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Calendar,
  Hash,
  Pause,
  Play,
} from 'lucide-react';

interface CmsFilterState {
  activeTermByType: Record<string, string | null>;
  activePageByType: Record<string, number>;
  setFilterTerm: (contentTypeId: string, termId: string | null) => void;
  setPageNumber: (contentTypeId: string, page: number) => void;
}

const CmsSurfaceContext = createContext<CmsFilterState | null>(null);

export const CmsSurfaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTermByType, setActiveTermByType] = useState<Record<string, string | null>>({});
  const [activePageByType, setActivePageByType] = useState<Record<string, number>>({});

  const value = useMemo<CmsFilterState>(
    () => ({
      activeTermByType,
      activePageByType,
      setFilterTerm: (contentTypeId, termId) => {
        setActiveTermByType((prev) => ({ ...prev, [contentTypeId]: termId }));
        setActivePageByType((prev) => ({ ...prev, [contentTypeId]: 1 }));
      },
      setPageNumber: (contentTypeId, page) => {
        setActivePageByType((prev) => ({ ...prev, [contentTypeId]: Math.max(1, page) }));
      },
    }),
    [activeTermByType, activePageByType]
  );

  return <CmsSurfaceContext.Provider value={value}>{children}</CmsSurfaceContext.Provider>;
};

function getRecordImage(record: CmsContentRecord): string {
  const keys = ['cover_image', 'featured_image', 'banner_image', 'image', 'photo', 'avatar'];
  for (const k of keys) {
    const val = record.fields[k];
    if (typeof val === 'string' && val.trim()) return val;
  }
  return '';
}

function getRecordSummary(record: CmsContentRecord): string {
  const keys = ['summary', 'excerpt', 'caption', 'quote', 'tagline', 'description', 'bio', 'answer'];
  for (const k of keys) {
    const val = record.fields[k];
    if (typeof val === 'string' && val.trim()) return val;
  }
  return '';
}

function getRecordMetaLine(cms: CmsDocument | undefined, record: CmsContentRecord): string {
  const parts: string[] = [];
  if (typeof record.fields.year === 'string' && record.fields.year) parts.push(record.fields.year);
  if (typeof record.fields.client === 'string' && record.fields.client) parts.push(record.fields.client);
  if (typeof record.fields.role_company === 'string' && record.fields.role_company) parts.push(record.fields.role_company);
  if (typeof record.fields.author_name === 'string' && record.fields.author_name && record.fields.author_name !== record.title) {
    parts.push(record.fields.author_name);
  }
  if (typeof record.fields.location === 'string' && record.fields.location) parts.push(record.fields.location);
  if (typeof record.fields.event_date === 'string' && record.fields.event_date) {
    parts.push(record.fields.event_date.replace('T', ' '));
  }
  if (parts.length === 0 && cms) {
    const firstTaxTerms = Object.values(record.termIdsByTaxonomy || {}).flat();
    const names = firstTaxTerms
      .map((tid) => cms.terms.find((t) => t.termId === tid)?.name)
      .filter(Boolean) as string[];
    if (names.length > 0) return names.slice(0, 2).join(' · ');
  }
  return parts.join(' · ');
}

interface WidgetRenderProps {
  node: ElementNode;
  cms?: CmsDocument;
  isEditor: boolean;
  deviceMode: DeviceMode;
  reduceMotionPreview?: boolean;
  currentRecord?: CmsContentRecord;
  onNavigatePage?: (slug: string) => void;
  onSelectElement?: (id: string, e: React.MouseEvent) => void;
}

export const CmsCollectionGridOrList: React.FC<WidgetRenderProps> = ({
  node,
  cms,
  isEditor,
  deviceMode,
  currentRecord,
  onNavigatePage,
  onSelectElement,
}) => {
  const surfaceCtx = useContext(CmsSurfaceContext);
  const baseQuery: CmsCollectionQuery = node.content?.cmsQuery || {
    contentTypeId: node.type === 'post-list' ? 'post' : 'project',
    statusFilter: 'published_only',
    limit: 6,
  };

  const activeTermId = surfaceCtx?.activeTermByType[baseQuery.contentTypeId] || null;
  const activePage = surfaceCtx?.activePageByType[baseQuery.contentTypeId] || 1;
  const limit = baseQuery.limit || 6;

  // Merge active interactive filter & pagination cleanly
  const effectiveQuery: CmsCollectionQuery = useMemo(() => {
    const q: CmsCollectionQuery = {
      ...baseQuery,
      statusFilter: isEditor ? baseQuery.statusFilter || 'published_only' : 'published_only',
      offset: (activePage - 1) * limit,
    };

    if (activeTermId && cms) {
      const term = cms.terms.find((t) => t.termId === activeTermId);
      if (term) {
        q.taxonomyFilter = {
          taxonomyId: term.taxonomyId,
          termIds: [term.termId],
          includeDescendants: true,
        };
      }
    }

    // Related content contextual matching when currentRecord is provided
    if (node.type === 'related-content' && currentRecord && cms) {
      const relKeys = Object.keys(currentRecord.relationIdsByField || {});
      const matchedRelIds = relKeys.flatMap((k) => currentRecord.relationIdsByField[k] || []);
      if (matchedRelIds.length > 0) {
        q.fieldFilters = q.fieldFilters;
      }
    }

    return q;
  }, [baseQuery, isEditor, activePage, limit, activeTermId, cms, node.type, currentRecord]);

  const queryRes = useMemo(
    () =>
      executeCmsQuery(cms, effectiveQuery, {
        mode: isEditor ? 'editor' : 'public_build',
      }),
    [cms, effectiveQuery, isEditor]
  );

  // If related-content and currentRecord has direct relations matching target contentTypeId, prioritize those
  const records = useMemo(() => {
    if (node.type === 'related-content' && currentRecord && cms) {
      const directRelIds = new Set(
        Object.values(currentRecord.relationIdsByField || {}).flat()
      );
      const direct = cms.records.filter(
        (r) =>
          directRelIds.has(r.recordId) &&
          r.recordId !== currentRecord.recordId &&
          (isEditor || r.status === 'published')
      );
      if (direct.length > 0) return direct.slice(0, limit);
      return queryRes.records.filter((r) => r.recordId !== currentRecord.recordId);
    }
    return queryRes.records;
  }, [node.type, currentRecord, cms, isEditor, limit, queryRes.records]);

  if (records.length === 0) {
    if (baseQuery.emptyBehavior === 'hide' && !isEditor) return null;
    return (
      <div
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text-muted)',
          borderRadius: 'var(--theme-radius)',
        }}
        className="p-6 border border-dashed text-center text-xs"
      >
        {baseQuery.emptyMessage || 'No matching CMS records found.'}
      </div>
    );
  }

  const isList = node.type === 'post-list';
  const gridColsClass =
    isList
      ? 'flex flex-col gap-4'
      : deviceMode === 'mobile'
      ? 'grid grid-cols-1 gap-4'
      : deviceMode === 'tablet'
      ? 'grid grid-cols-2 gap-5'
      : 'grid grid-cols-1 sm:grid-cols-2 gap-6';

  return (
    <div className="space-y-4 w-full">
      {node.type === 'related-content' && node.content?.text && (
        <h3
          style={{ color: 'var(--color-heading)', fontFamily: 'var(--font-display)' }}
          className="text-lg font-bold tracking-tight"
        >
          {node.content.text}
        </h3>
      )}

      <div className={gridColsClass}>
        {records.map((rec) => {
          const img = getRecordImage(rec);
          const summary = getRecordSummary(rec);
          const meta = getRecordMetaLine(cms, rec);
          const targetUrl = resolveCmsRecordUrl(cms, rec);

          return (
            <article
              key={rec.recordId}
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                borderRadius: 'var(--theme-radius)',
              }}
              className={`border overflow-hidden transition-colors flex ${
                isList ? 'flex-col sm:flex-row items-stretch' : 'flex-col'
              }`}
            >
              {img && (
                <div
                  className={`overflow-hidden shrink-0 ${
                    isList ? 'w-full sm:w-52 aspect-video sm:aspect-auto' : 'w-full aspect-video'
                  }`}
                >
                  <img
                    src={img}
                    alt={rec.title}
                    className="w-full h-full object-cover block"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}
              <div className="p-5 flex-1 flex flex-col justify-between gap-3 min-w-0">
                <div className="space-y-1.5">
                  {meta && (
                    <div
                      style={{ color: 'var(--color-accent)' }}
                      className="text-[11px] font-semibold uppercase tracking-wider truncate"
                    >
                      {meta}
                    </div>
                  )}
                  <h4
                    style={{
                      color: 'var(--color-heading)',
                      fontFamily: 'var(--font-display)',
                    }}
                    className="text-base font-bold leading-snug"
                  >
                    {rec.title}
                  </h4>
                  {summary && (
                    <p
                      style={{ color: 'var(--color-text-muted)' }}
                      className="text-xs leading-relaxed line-clamp-3 m-0"
                    >
                      {summary}
                    </p>
                  )}
                </div>

                {targetUrl !== '#' && (
                  <div>
                    <a
                      href={isEditor ? undefined : targetUrl}
                      onClick={(e) => {
                        if (isEditor) {
                          e.preventDefault();
                          onSelectElement?.(node.id, e);
                          return;
                        }
                        if (onNavigatePage && targetUrl.startsWith('/')) {
                          e.preventDefault();
                          onNavigatePage(targetUrl);
                        }
                      }}
                      style={{ color: 'var(--color-link)' }}
                      className="inline-flex items-center gap-1 text-xs font-semibold no-underline hover:underline"
                    >
                      <span>View Details</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};

interface CarouselSlideItem {
  id: string;
  title: string;
  kicker?: string;
  subtitle?: string;
  imageSrc?: string;
  url?: string;
  ctaLabel?: string;
}

export const CmsCarouselWidget: React.FC<WidgetRenderProps> = ({
  node,
  cms,
  isEditor,
  deviceMode,
  reduceMotionPreview,
  onNavigatePage,
  onSelectElement,
}) => {
  const cfg: CarouselConfig = node.content?.carouselConfig || {
    mode: node.type === 'custom-carousel' ? 'static-slides' : node.type === 'media-carousel' ? 'media-gallery' : 'cms-collection',
    slidesPerViewDesktop: node.type === 'post-slider' || node.type === 'slide-carousel' ? 1 : 3,
    slidesPerViewTablet: node.type === 'post-slider' || node.type === 'slide-carousel' ? 1 : 2,
    slidesPerViewMobile: 1,
    gapPx: node.type === 'post-slider' || node.type === 'slide-carousel' ? 0 : 16,
    autoplay: false,
    autoplayIntervalMs: 5000,
    pauseOnHover: true,
    loop: true,
    showArrows: true,
    showDots: true,
    showProgress: true,
    transitionStyle: 'slide',
  };

  const slidesPerView =
    deviceMode === 'mobile'
      ? Math.max(1, cfg.slidesPerViewMobile || 1)
      : deviceMode === 'tablet'
      ? Math.max(1, cfg.slidesPerViewTablet || 2)
      : Math.max(1, cfg.slidesPerViewDesktop || 3);

  const slides: CarouselSlideItem[] = useMemo(() => {
    if (
      (node.type === 'custom-carousel' || node.type === 'media-carousel' || cfg.mode === 'static-slides' || cfg.mode === 'media-gallery') &&
      (node.content?.items?.length || 0) > 0
    ) {
      return (node.content?.items || []).map((itm) => ({
        id: itm.id,
        title: itm.title,
        kicker: itm.subtitle,
        subtitle: itm.description,
        imageSrc: itm.imageSrc,
        url: itm.url,
      }));
    }

    const defaultType =
      node.type === 'slide-carousel'
        ? 'slide'
        : node.type === 'post-slider'
        ? 'post'
        : 'project';

    const query: CmsCollectionQuery = node.content?.cmsQuery || {
      contentTypeId: defaultType,
      statusFilter: 'published_only',
      sortBy: 'sortOrder',
      sortDirection: 'asc',
      limit: 8,
    };

    const res = executeCmsQuery(cms, query, {
      mode: isEditor ? 'editor' : 'public_build',
    });

    return res.records.map((rec) => ({
      id: rec.recordId,
      title: String(rec.fields.headline || rec.title),
      kicker: String(rec.fields.kicker || getRecordMetaLine(cms, rec) || ''),
      subtitle: getRecordSummary(rec),
      imageSrc: getRecordImage(rec),
      url: String(rec.fields.cta_url || resolveCmsRecordUrl(cms, rec)),
      ctaLabel: String(rec.fields.cta_label || 'Explore'),
    }));
  }, [node.type, node.content, cfg.mode, cms, isEditor]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isUserPaused, setIsUserPaused] = useState(false);
  const pointerStartX = useRef<number | null>(null);

  const maxIndex = Math.max(0, slides.length - slidesPerView);

  useEffect(() => {
    if (currentIndex > maxIndex) setCurrentIndex(0);
  }, [maxIndex, currentIndex]);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const shouldAutoplay =
    cfg.autoplay &&
    !isEditor &&
    !reduceMotionPreview &&
    !prefersReducedMotion &&
    !isPaused &&
    !isUserPaused &&
    slides.length > slidesPerView;

  useEffect(() => {
    if (!shouldAutoplay) return;
    const timer = window.setInterval(() => {
      setCurrentIndex((prev) => (prev >= maxIndex ? (cfg.loop ? 0 : maxIndex) : prev + 1));
    }, Math.max(2000, cfg.autoplayIntervalMs || 5000));
    return () => window.clearInterval(timer);
  }, [shouldAutoplay, cfg.autoplayIntervalMs, cfg.loop, maxIndex]);

  const goPrev = () => {
    setCurrentIndex((prev) => (prev <= 0 ? (cfg.loop ? maxIndex : 0) : prev - 1));
  };

  const goNext = () => {
    setCurrentIndex((prev) => (prev >= maxIndex ? (cfg.loop ? 0 : maxIndex) : prev + 1));
  };

  if (slides.length === 0) {
    return (
      <div
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-surface)',
          color: 'var(--color-text-muted)',
          borderRadius: 'var(--theme-radius)',
        }}
        className="p-6 border border-dashed text-center text-xs"
      >
        {node.content?.cmsQuery?.emptyMessage || 'No slides or records available for this carousel.'}
      </div>
    );
  }

  const visibleSlides = slides.slice(currentIndex, currentIndex + slidesPerView);
  const isHeroSlider = node.type === 'post-slider' || node.type === 'slide-carousel';

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label={node.name || 'Content Carousel'}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goPrev();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          goNext();
        }
      }}
      onMouseEnter={() => cfg.pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => cfg.pauseOnHover && setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      onPointerDown={(e) => {
        pointerStartX.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (pointerStartX.current === null) return;
        const delta = e.clientX - pointerStartX.current;
        pointerStartX.current = null;
        if (Math.abs(delta) > 40) {
          if (delta < 0) goNext();
          else goPrev();
        }
      }}
      className="w-full space-y-3 focus:outline-none select-none"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${slidesPerView}, minmax(0, 1fr))`,
          gap: `${cfg.gapPx ?? 16}px`,
        }}
      >
        {visibleSlides.map((slide) => (
          <div
            key={slide.id}
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              borderRadius: 'var(--theme-radius)',
            }}
            className="border overflow-hidden flex flex-col"
          >
            {slide.imageSrc && (
              <div
                className={`w-full overflow-hidden ${
                  isHeroSlider ? 'aspect-[21/9]' : 'aspect-video'
                }`}
              >
                <img
                  src={slide.imageSrc}
                  alt={slide.title}
                  className="w-full h-full object-cover block pointer-events-none"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}
            <div className="p-5 flex-1 flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                {slide.kicker && (
                  <div
                    style={{ color: 'var(--color-accent)' }}
                    className="text-[11px] font-semibold uppercase tracking-wider"
                  >
                    {slide.kicker}
                  </div>
                )}
                <h4
                  style={{
                    color: 'var(--color-heading)',
                    fontFamily: 'var(--font-display)',
                  }}
                  className={`${isHeroSlider ? 'text-xl sm:text-2xl' : 'text-base'} font-bold leading-snug`}
                >
                  {slide.title}
                </h4>
                {slide.subtitle && (
                  <p
                    style={{ color: 'var(--color-text-muted)' }}
                    className="text-xs leading-relaxed line-clamp-2 m-0"
                  >
                    {slide.subtitle}
                  </p>
                )}
              </div>

              {slide.url && slide.url !== '#' && (
                <div>
                  <a
                    href={isEditor ? undefined : slide.url}
                    onClick={(e) => {
                      if (isEditor) {
                        e.preventDefault();
                        onSelectElement?.(node.id, e);
                        return;
                      }
                      if (onNavigatePage && slide.url?.startsWith('/')) {
                        e.preventDefault();
                        onNavigatePage(slide.url);
                      }
                    }}
                    style={{ color: 'var(--color-link)' }}
                    className="inline-flex items-center gap-1 text-xs font-semibold no-underline hover:underline"
                  >
                    <span>{slide.ctaLabel || 'Open'}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Controls Bar */}
      {(cfg.showArrows || cfg.showDots) && slides.length > slidesPerView && (
        <div className="flex items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1.5">
            {cfg.showArrows && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  aria-label="Previous slide"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-heading)',
                  }}
                  className="min-h-[36px] min-w-[36px] rounded-md border flex items-center justify-center hover:opacity-80 transition-opacity"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  aria-label="Next slide"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'var(--color-surface)',
                    color: 'var(--color-heading)',
                  }}
                  className="min-h-[36px] min-w-[36px] rounded-md border flex items-center justify-center hover:opacity-80 transition-opacity"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
            {cfg.autoplay && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsUserPaused((p) => !p);
                }}
                aria-label={isUserPaused ? 'Resume autoplay' : 'Pause autoplay'}
                style={{
                  borderColor: 'var(--color-border)',
                  backgroundColor: 'var(--color-surface)',
                  color: 'var(--color-text-muted)',
                }}
                className="min-h-[36px] min-w-[36px] rounded-md border flex items-center justify-center"
              >
                {isUserPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          {cfg.showDots && (
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Slide pagination">
              {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  role="tab"
                  aria-selected={currentIndex === idx}
                  aria-label={`Slide ${idx + 1}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  style={{
                    backgroundColor:
                      currentIndex === idx ? 'var(--color-primary)' : 'var(--color-border)',
                  }}
                  className="h-2 rounded-full transition-all"
                >
                  <span className="sr-only">Slide {idx + 1}</span>
                  <span
                    className={`block h-2 ${currentIndex === idx ? 'w-5' : 'w-2'}`}
                  />
                </button>
              ))}
            </div>
          )}

          <div
            style={{ color: 'var(--color-text-muted)' }}
            className="text-[11px] font-mono tabular-nums"
          >
            {currentIndex + 1} / {maxIndex + 1}
          </div>
        </div>
      )}
    </div>
  );
};

export const CmsTaxonomyWidget: React.FC<WidgetRenderProps> = ({
  node,
  cms,
  isEditor,
  onNavigatePage,
  onSelectElement,
}) => {
  const surfaceCtx = useContext(CmsSurfaceContext);
  const taxId = node.content?.taxonomyId || 'project_category';
  const tax = cms?.taxonomies.find((t) => t.id === taxId);
  const terms = (cms?.terms || []).filter((t) => t.taxonomyId === taxId);
  const targetTypeId =
    node.content?.repeaterCollection || tax?.contentTypeIds[0] || 'project';
  const activeTermId = surfaceCtx?.activeTermByType[targetTypeId] || null;

  if (!tax || terms.length === 0) {
    return (
      <div
        style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)' }}
        className="p-3 border border-dashed rounded text-xs"
      >
        No terms configured for taxonomy "{taxId}".
      </div>
    );
  }

  if (node.type === 'taxonomy-filter') {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b pb-3" style={{ borderColor: 'var(--color-divider)' }}>
        <button
          type="button"
          onClick={(e) => {
            if (isEditor) {
              onSelectElement?.(node.id, e);
              return;
            }
            surfaceCtx?.setFilterTerm(targetTypeId, null);
          }}
          style={{
            color: !activeTermId ? 'var(--color-primary)' : 'var(--color-text-muted)',
            borderColor: !activeTermId ? 'var(--color-primary)' : 'transparent',
          }}
          className="min-h-[36px] px-2 py-1 text-xs font-semibold border-b-2 transition-colors"
        >
          {node.content?.text || 'All'}
        </button>
        {terms.map((term) => {
          const isActive = activeTermId === term.termId;
          return (
            <button
              key={term.termId}
              type="button"
              onClick={(e) => {
                if (isEditor) {
                  onSelectElement?.(node.id, e);
                  return;
                }
                surfaceCtx?.setFilterTerm(targetTypeId, isActive ? null : term.termId);
              }}
              style={{
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-muted)',
                borderColor: isActive ? 'var(--color-primary)' : 'transparent',
              }}
              className="min-h-[36px] px-2 py-1 text-xs font-medium border-b-2 transition-colors"
            >
              {term.name}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {node.content?.text && (
        <div
          style={{ color: 'var(--color-heading)', fontFamily: 'var(--font-display)' }}
          className="text-xs font-bold uppercase tracking-wider"
        >
          {node.content.text}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {terms.map((term) => {
          const archivePath = `${(tax.archiveBasePath || `/${tax.key}`).replace(/\/+$/, '')}/${term.slug}`;
          return (
            <a
              key={term.termId}
              href={isEditor ? undefined : archivePath}
              onClick={(e) => {
                if (isEditor) {
                  e.preventDefault();
                  onSelectElement?.(node.id, e);
                  return;
                }
                if (onNavigatePage) {
                  e.preventDefault();
                  onNavigatePage(archivePath);
                }
              }}
              style={{ color: 'var(--color-link)' }}
              className="text-xs font-medium no-underline hover:underline"
            >
              {term.name}
            </a>
          );
        })}
      </div>
    </div>
  );
};

export const CmsUtilityWidget: React.FC<WidgetRenderProps> = ({
  node,
  cms,
  isEditor,
  onSelectElement,
}) => {
  const surfaceCtx = useContext(CmsSurfaceContext);

  if (node.type === 'content-counter') {
    const query: CmsCollectionQuery = node.content?.cmsQuery || {
      contentTypeId: 'project',
      statusFilter: 'published_only',
      limit: 50,
    };
    const res = executeCmsQuery(cms, query, {
      mode: isEditor ? 'editor' : 'public_build',
    });
    return (
      <div
        style={{ color: 'var(--color-text-muted)' }}
        className="flex items-center gap-2 text-xs font-mono tabular-nums"
      >
        <Hash className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
        <span>
          <strong style={{ color: 'var(--color-heading)' }}>{res.filteredCount}</strong>{' '}
          {node.content?.text || 'Published Entries'}
        </span>
      </div>
    );
  }

  // cms-pagination
  const targetTypeId = node.content?.repeaterCollection || 'project';
  const perPage = Math.max(1, node.content?.repeaterLimit || 6);
  const currentPage = surfaceCtx?.activePageByType[targetTypeId] || 1;
  const totalRes = executeCmsQuery(
    cms,
    { contentTypeId: targetTypeId, statusFilter: 'published_only', limit: 50 },
    { mode: isEditor ? 'editor' : 'public_build' }
  );
  const totalPages = Math.max(1, Math.ceil(totalRes.filteredCount / perPage));

  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <button
        type="button"
        disabled={currentPage <= 1 && !isEditor}
        onClick={(e) => {
          if (isEditor) {
            onSelectElement?.(node.id, e);
            return;
          }
          surfaceCtx?.setPageNumber(targetTypeId, currentPage - 1);
        }}
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
          backgroundColor: 'var(--color-surface)',
        }}
        className="min-h-[36px] px-3 py-1.5 border rounded-md text-xs font-semibold disabled:opacity-40"
      >
        Previous
      </button>
      <span
        style={{ color: 'var(--color-text-muted)' }}
        className="text-xs font-mono tabular-nums"
      >
        Page {currentPage} of {totalPages}
      </span>
      <button
        type="button"
        disabled={currentPage >= totalPages && !isEditor}
        onClick={(e) => {
          if (isEditor) {
            onSelectElement?.(node.id, e);
            return;
          }
          surfaceCtx?.setPageNumber(targetTypeId, currentPage + 1);
        }}
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
          backgroundColor: 'var(--color-surface)',
        }}
        className="min-h-[36px] px-3 py-1.5 border rounded-md text-xs font-semibold disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
};
