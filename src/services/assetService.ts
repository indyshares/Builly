import { AssetCategory, MediaAsset } from '../types/builder';
import { ensurePortfolioDriveFolder } from './drivePageRegistryService';
import { ENV_CONFIG } from '../config/env';

export interface CuratedIconMeta {
  name: string;
  label: string;
  category: 'interface' | 'design' | 'engineering' | 'social' | 'commerce' | 'media';
  keywords: string[];
}

export const CURATED_ICON_SET: CuratedIconMeta[] = [
  { name: 'ArrowUpRight', label: 'Arrow Up Right', category: 'interface', keywords: ['link', 'external', 'open', 'cta'] },
  { name: 'ArrowRight', label: 'Arrow Right', category: 'interface', keywords: ['next', 'forward', 'cta'] },
  { name: 'ChevronRight', label: 'Chevron Right', category: 'interface', keywords: ['arrow', 'next', 'breadcrumb'] },
  { name: 'Check', label: 'Check', category: 'interface', keywords: ['done', 'verified', 'feature'] },
  { name: 'CheckCircle2', label: 'Check Circle', category: 'interface', keywords: ['success', 'complete', 'badge'] },
  { name: 'Plus', label: 'Plus', category: 'interface', keywords: ['add', 'new', 'create'] },
  { name: 'Search', label: 'Search', category: 'interface', keywords: ['find', 'filter', 'magnifier'] },
  { name: 'Menu', label: 'Menu', category: 'interface', keywords: ['hamburger', 'nav', 'drawer'] },
  { name: 'Home', label: 'Home', category: 'interface', keywords: ['house', 'root', 'start'] },
  { name: 'Mail', label: 'Mail', category: 'interface', keywords: ['email', 'contact', 'message'] },
  { name: 'Phone', label: 'Phone', category: 'interface', keywords: ['call', 'contact', 'tel'] },
  { name: 'MapPin', label: 'Map Pin', category: 'interface', keywords: ['location', 'address', 'city'] },
  { name: 'Calendar', label: 'Calendar', category: 'interface', keywords: ['date', 'schedule', 'event'] },
  { name: 'Clock', label: 'Clock', category: 'interface', keywords: ['time', 'duration', 'schedule'] },
  { name: 'Download', label: 'Download', category: 'interface', keywords: ['save', 'file', 'resume', 'cv'] },
  { name: 'ExternalLink', label: 'External Link', category: 'interface', keywords: ['url', 'web', 'open'] },
  { name: 'Star', label: 'Star', category: 'interface', keywords: ['rating', 'favorite', 'review'] },
  { name: 'Heart', label: 'Heart', category: 'interface', keywords: ['like', 'love', 'health'] },
  { name: 'Bookmark', label: 'Bookmark', category: 'interface', keywords: ['save', 'read'] },
  { name: 'Award', label: 'Award', category: 'interface', keywords: ['prize', 'certificate', 'honor'] },
  { name: 'ShieldCheck', label: 'Shield Check', category: 'interface', keywords: ['security', 'verified', 'trust'] },
  { name: 'Sparkles', label: 'Sparkles', category: 'design', keywords: ['highlight', 'featured', 'magic'] },
  { name: 'Palette', label: 'Palette', category: 'design', keywords: ['color', 'theme', 'art', 'studio'] },
  { name: 'PenTool', label: 'Pen Tool', category: 'design', keywords: ['vector', 'illustration', 'brand'] },
  { name: 'Layers', label: 'Layers', category: 'design', keywords: ['stack', 'ui', 'system'] },
  { name: 'LayoutGrid', label: 'Layout Grid', category: 'design', keywords: ['bento', 'grid', 'gallery'] },
  { name: 'Compass', label: 'Compass', category: 'design', keywords: ['direction', 'strategy', 'explore'] },
  { name: 'Figma', label: 'Figma', category: 'design', keywords: ['design', 'ui', 'prototype'] },
  { name: 'Frame', label: 'Frame', category: 'design', keywords: ['canvas', 'artboard', 'border'] },
  { name: 'Ruler', label: 'Ruler', category: 'design', keywords: ['measure', 'architecture', 'scale'] },
  { name: 'Eye', label: 'Eye', category: 'design', keywords: ['view', 'showcase', 'visibility'] },
  { name: 'Aperture', label: 'Aperture', category: 'media', keywords: ['camera', 'photo', 'lens'] },
  { name: 'Camera', label: 'Camera', category: 'media', keywords: ['photography', 'shoot', 'portrait'] },
  { name: 'Film', label: 'Film', category: 'media', keywords: ['video', 'reel', 'cinema'] },
  { name: 'Play', label: 'Play', category: 'media', keywords: ['video', 'audio', 'start'] },
  { name: 'Music', label: 'Music', category: 'media', keywords: ['audio', 'sound', 'track'] },
  { name: 'Mic', label: 'Microphone', category: 'media', keywords: ['podcast', 'voice', 'audio'] },
  { name: 'Image', label: 'Image', category: 'media', keywords: ['picture', 'gallery', 'photo'] },
  { name: 'Code2', label: 'Code', category: 'engineering', keywords: ['developer', 'software', 'ts'] },
  { name: 'Terminal', label: 'Terminal', category: 'engineering', keywords: ['cli', 'shell', 'backend'] },
  { name: 'Cpu', label: 'CPU', category: 'engineering', keywords: ['hardware', 'ai', 'compute'] },
  { name: 'Database', label: 'Database', category: 'engineering', keywords: ['data', 'sheets', 'storage'] },
  { name: 'Server', label: 'Server', category: 'engineering', keywords: ['cloud', 'infra', 'api'] },
  { name: 'Globe', label: 'Globe', category: 'engineering', keywords: ['web', 'international', 'site'] },
  { name: 'Zap', label: 'Zap', category: 'engineering', keywords: ['fast', 'performance', 'energy'] },
  { name: 'GitBranch', label: 'Git Branch', category: 'engineering', keywords: ['git', 'version', 'repo'] },
  { name: 'Box', label: 'Box', category: 'engineering', keywords: ['package', '3d', 'container'] },
  { name: 'Briefcase', label: 'Briefcase', category: 'commerce', keywords: ['work', 'job', 'portfolio', 'experience'] },
  { name: 'Building2', label: 'Building', category: 'commerce', keywords: ['company', 'studio', 'office'] },
  { name: 'GraduationCap', label: 'Graduation Cap', category: 'commerce', keywords: ['education', 'degree', 'school'] },
  { name: 'BookOpen', label: 'Book Open', category: 'commerce', keywords: ['article', 'essay', 'publication'] },
  { name: 'FileText', label: 'File Text', category: 'commerce', keywords: ['resume', 'document', 'case study'] },
  { name: 'BarChart3', label: 'Bar Chart', category: 'commerce', keywords: ['metrics', 'analytics', 'growth'] },
  { name: 'TrendingUp', label: 'Trending Up', category: 'commerce', keywords: ['roi', 'growth', 'impact'] },
  { name: 'Users', label: 'Users', category: 'commerce', keywords: ['team', 'clients', 'community'] },
  { name: 'User', label: 'User', category: 'commerce', keywords: ['profile', 'avatar', 'bio'] },
  { name: 'Quote', label: 'Quote', category: 'social', keywords: ['testimonial', 'review', 'quote'] },
  { name: 'MessageSquare', label: 'Message', category: 'social', keywords: ['chat', 'feedback', 'contact'] },
  { name: 'Send', label: 'Send', category: 'social', keywords: ['submit', 'contact', 'email'] },
  { name: 'Share2', label: 'Share', category: 'social', keywords: ['social', 'link', 'network'] },
  { name: 'Github', label: 'GitHub', category: 'social', keywords: ['repo', 'open source', 'code'] },
  { name: 'Linkedin', label: 'LinkedIn', category: 'social', keywords: ['career', 'network', 'profile'] },
  { name: 'Twitter', label: 'X / Twitter', category: 'social', keywords: ['social', 'posts'] },
  { name: 'Instagram', label: 'Instagram', category: 'social', keywords: ['photo', 'social', 'visual'] },
  { name: 'Youtube', label: 'YouTube', category: 'social', keywords: ['video', 'channel'] },
  { name: 'Dribbble', label: 'Dribbble', category: 'social', keywords: ['design', 'shots', 'portfolio'] },
];

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export interface SvgSanitizeResult {
  valid: boolean;
  sanitized?: string;
  error?: string;
}

/**
 * Validates and sanitizes an SVG string. Rejects scripts, event handlers, foreignObject,
 * external resource references, and unsafe URL schemes.
 */
export function sanitizeSvgMarkup(rawSvg: string): SvgSanitizeResult {
  const trimmed = (rawSvg || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'SVG markup is empty.' };
  }
  if (trimmed.length > 512 * 1024) {
    return { valid: false, error: 'SVG exceeds the 512 KB safety limit.' };
  }

  // Strip XML prolog / DOCTYPE / comments before parsing
  const withoutProlog = trimmed
    .replace(/<\?xml[\s\S]*?\?>/gi, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
    .trim();

  if (!/<svg[\s>]/i.test(withoutProlog)) {
    return { valid: false, error: 'File content does not contain a valid <svg> root element.' };
  }

  if (/<script\b/i.test(withoutProlog) || /<foreignObject\b/i.test(withoutProlog)) {
    return {
      valid: false,
      error: 'SVG rejected: <script> and <foreignObject> elements are disallowed for security.',
    };
  }

  if (/javascript\s*:|vbscript\s*:|data\s*:\s*text\/html/i.test(withoutProlog)) {
    return {
      valid: false,
      error: 'SVG rejected: active scriptable URI schemes are disallowed.',
    };
  }

  // Reject external http(s) references in href / xlink:href / src
  if (/(?:xlink:)?href\s*=\s*["']\s*https?:/i.test(withoutProlog)) {
    return {
      valid: false,
      error: 'SVG rejected: external HTTP references inside SVG are disallowed.',
    };
  }

  // Parse using DOMParser when in browser for strict attribute sanitization
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(withoutProlog, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      return { valid: false, error: 'Malformed SVG XML syntax.' };
    }

    const svgEl = doc.documentElement;
    if (!svgEl || svgEl.tagName.toLowerCase() !== 'svg') {
      return { valid: false, error: 'Root element must be <svg>.' };
    }

    const blockedTags = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video']);
    const walkAndClean = (el: Element) => {
      const children = Array.from(el.children);
      for (const child of children) {
        if (blockedTags.has(child.tagName.toLowerCase())) {
          child.remove();
          continue;
        }
        walkAndClean(child);
      }

      // Remove inline on* event handlers and unsafe hrefs
      for (const attr of Array.from(el.attributes)) {
        const nameLower = attr.name.toLowerCase();
        const val = attr.value.trim();
        if (nameLower.startsWith('on')) {
          el.removeAttribute(attr.name);
        } else if (
          (nameLower === 'href' || nameLower === 'xlink:href' || nameLower === 'src') &&
          (/^\s*(?:javascript|vbscript|data:text\/html)/i.test(val) || /^\s*https?:/i.test(val))
        ) {
          el.removeAttribute(attr.name);
        }
      }
    };

    walkAndClean(svgEl);

    if (!svgEl.getAttribute('xmlns')) {
      svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    }

    const serialized = new XMLSerializer().serializeToString(svgEl);
    return { valid: true, sanitized: serialized };
  }

  // Fallback regex strip for non-DOM environments
  const fallbackCleaned = withoutProlog
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim();
  return { valid: true, sanitized: fallbackCleaned };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Inspects file magic bytes (header signature) rather than trusting file extension alone.
 */
async function inspectFileContentType(
  file: File
): Promise<{ valid: boolean; detectedMime: string; category: AssetCategory; reason?: string }> {
  const headerSlice = await file.slice(0, 512).arrayBuffer();
  const bytes = new Uint8Array(headerSlice);

  const startsWith = (sig: number[], offset = 0) =>
    sig.every((b, idx) => bytes[offset + idx] === b);

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { valid: true, detectedMime: 'image/png', category: 'images' };
  }
  // JPEG: FF D8 FF
  if (startsWith([0xff, 0xd8, 0xff])) {
    return { valid: true, detectedMime: 'image/jpeg', category: 'images' };
  }
  // GIF87a / GIF89a
  if (startsWith([0x47, 0x49, 0x46, 0x38])) {
    return { valid: true, detectedMime: 'image/gif', category: 'images' };
  }
  // WebP: RIFF....WEBP
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return { valid: true, detectedMime: 'image/webp', category: 'images' };
  }
  // PDF: %PDF-
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { valid: true, detectedMime: 'application/pdf', category: 'documents' };
  }
  // WOFF2: wOF2
  if (startsWith([0x77, 0x4f, 0x46, 0x32])) {
    return { valid: true, detectedMime: 'font/woff2', category: 'fonts' };
  }
  // WOFF: wOFF
  if (startsWith([0x77, 0x4f, 0x46, 0x46])) {
    return { valid: true, detectedMime: 'font/woff', category: 'fonts' };
  }
  // WebM: 1A 45 DF A3
  if (startsWith([0x1a, 0x45, 0xdf, 0xa3])) {
    return { valid: true, detectedMime: 'video/webm', category: 'video-audio' };
  }
  // MP4 / MOV ftyp box
  if (startsWith([0x66, 0x74, 0x79, 0x70], 4)) {
    return { valid: true, detectedMime: 'video/mp4', category: 'video-audio' };
  }
  // MP3 ID3 or frame sync
  if (startsWith([0x49, 0x44, 0x33]) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
    return { valid: true, detectedMime: 'audio/mpeg', category: 'video-audio' };
  }
  // WAV: RIFF....WAVE
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x41, 0x56, 0x45], 8)) {
    return { valid: true, detectedMime: 'audio/wav', category: 'video-audio' };
  }

  // Check text header for SVG
  const textHeader = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  if (/<svg[\s>]/i.test(textHeader) || (/<\?xml/i.test(textHeader) && file.type.includes('svg'))) {
    return { valid: true, detectedMime: 'image/svg+xml', category: 'icons' };
  }

  return {
    valid: false,
    detectedMime: file.type || 'application/octet-stream',
    category: 'other',
    reason:
      'Unsupported or unrecognized file signature. Allowed formats: PNG, JPEG, WebP, GIF, sanitized SVG, MP4/WebM, MP3/WAV, WOFF/WOFF2, and PDF.',
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file bytes.'));
    reader.readAsDataURL(file);
  });
}

function measureImageDimensions(src: string): Promise<{ width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(undefined);
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

async function ensureSubfolderId(
  accessToken: string,
  parentId: string,
  folderName: string
): Promise<string> {
  const escaped = folderName.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
  );
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.ok) {
    const json = await res.json();
    if (json.files?.[0]?.id) return json.files[0].id;
  }

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  if (!createRes.ok) return parentId;
  const created = await createRes.json();
  return created.id || parentId;
}

async function uploadBlobToDrive(
  accessToken: string,
  rootFolderId: string | undefined,
  categoryFolder: string,
  fileName: string,
  mimeType: string,
  blob: Blob
): Promise<string | null> {
  try {
    const baseFolderId = await ensurePortfolioDriveFolder(accessToken, rootFolderId);
    const assetsFolderId = await ensureSubfolderId(accessToken, baseFolderId, 'Assets');
    const targetFolderId = await ensureSubfolderId(accessToken, assetsFolderId, categoryFolder);

    const metadata = {
      name: fileName,
      mimeType,
      parents: [targetFolderId],
    };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      }
    );
    if (!uploadRes.ok) return null;
    const json = await uploadRes.json();
    return json.id || null;
  } catch {
    return null;
  }
}

export async function processAndSaveUploadedAsset(params: {
  file: File;
  preferredCategory?: AssetCategory;
  licenseNote?: string;
  altText?: string;
  accessToken?: string | null;
  driveFolderId?: string;
}): Promise<{ asset?: MediaAsset; error?: string }> {
  const { file, preferredCategory, licenseNote, altText, accessToken, driveFolderId } = params;

  if (file.size === 0) {
    return { error: 'Cannot upload an empty file.' };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: `File exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} maximum upload size.` };
  }

  const inspection = await inspectFileContentType(file);
  if (!inspection.valid) {
    return { error: inspection.reason };
  }

  const category: AssetCategory = preferredCategory || inspection.category;
  const nowIso = new Date().toISOString();
  let finalUrl = '';
  let svgMarkup: string | undefined;
  let svgSanitized = false;
  let uploadBlob: Blob = file;
  let dimensions: { width: number; height: number } | undefined;

  if (inspection.detectedMime === 'image/svg+xml') {
    const rawText = await file.text();
    const sanitized = sanitizeSvgMarkup(rawText);
    if (!sanitized.valid || !sanitized.sanitized) {
      return { error: sanitized.error || 'SVG failed security sanitization.' };
    }
    svgMarkup = sanitized.sanitized;
    svgSanitized = true;
    finalUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
    uploadBlob = new Blob([svgMarkup], { type: 'image/svg+xml' });
  } else {
    finalUrl = await readFileAsDataUrl(file);
    if (inspection.detectedMime.startsWith('image/')) {
      dimensions = await measureImageDimensions(finalUrl);
    }
  }

  const folderLabelMap: Record<AssetCategory, string> = {
    images: 'Images',
    logos: 'Logos',
    icons: 'Icons',
    'video-audio': 'Media',
    fonts: 'Fonts',
    documents: 'Documents',
    other: 'Other',
  };

  let driveFileId = `local_asset_${Date.now()}`;
  if (accessToken) {
    const uploadedId = await uploadBlobToDrive(
      accessToken,
      driveFolderId,
      folderLabelMap[category],
      file.name,
      inspection.detectedMime,
      uploadBlob
    );
    if (uploadedId) driveFileId = uploadedId;
  }

  const asset: MediaAsset = {
    id: `ast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    url: finalUrl,
    size: formatBytes(file.size),
    bytes: file.size,
    type: inspection.detectedMime.split('/')[0] || 'file',
    mimeType: inspection.detectedMime,
    category,
    dimensions,
    altText: altText?.trim() || file.name.replace(/\.[^.]+$/, ''),
    svgSanitized,
    svgMarkup,
    sourceOrigin: 'upload',
    licenseNote: licenseNote?.trim() || 'User uploaded (verify usage rights)',
    tags: [category],
    driveFileId,
    driveFolder: `/${ENV_CONFIG.driveFolderName}/Assets/${folderLabelMap[category]}`,
    createdAt: nowIso.slice(0, 10),
    updatedAt: nowIso,
  };

  return { asset };
}

export interface AgentAssetCandidate {
  id: string;
  name: string;
  category: AssetCategory;
  svgMarkup: string;
  previewDataUrl: string;
  provenance: string;
  license: string;
  description: string;
}

/**
 * Generates sanitized, user-owned vector candidates (brand marks, emblems, architectural graphics)
 * that require explicit user approval before saving to Drive-backed Asset Library or inserting.
 */
export function generateAgentAssetCandidates(
  prompt: string,
  targetCategory: AssetCategory = 'logos'
): AgentAssetCandidate[] {
  const cleanPrompt = (prompt || 'Minimal Studio').trim();
  const initials = cleanPrompt
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || 'IS';

  const candidates: { title: string; desc: string; svg: string }[] =
    targetCategory === 'logos'
      ? [
          {
            title: `${cleanPrompt} — Geometric Monogram`,
            desc: 'Architectural square frame mark with crisp geometric initials.',
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="none"><rect x="8" y="8" width="104" height="104" rx="20" fill="#0F172A"/><rect x="18" y="18" width="84" height="84" rx="14" stroke="#38BDF8" stroke-width="2" opacity="0.45"/><text x="60" y="71" text-anchor="middle" font-family="sans-serif" font-size="38" font-weight="700" fill="#F8FAFC">${initials}</text></svg>`,
          },
          {
            title: `${cleanPrompt} — Precision Orbit Emblem`,
            desc: 'Minimalist dual-ring circular mark suitable for light and dark headers.',
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="none"><circle cx="60" cy="60" r="50" fill="#1E293B"/><circle cx="60" cy="60" r="36" stroke="#F8FAFC" stroke-width="3"/><circle cx="85" cy="35" r="8" fill="#2563EB"/><text x="60" y="69" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="#FFFFFF">${initials}</text></svg>`,
          },
          {
            title: `${cleanPrompt} — Studio Split Crest`,
            desc: 'Diagonal editorial divider emblem for creative studios.',
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120" fill="none"><rect x="10" y="10" width="100" height="100" rx="24" fill="#F8FAFC" stroke="#0F172A" stroke-width="4"/><path d="M26 94 L94 26" stroke="#2563EB" stroke-width="6" stroke-linecap="round"/><circle cx="40" cy="40" r="10" fill="#0F172A"/><circle cx="80" cy="80" r="10" fill="#2563EB"/></svg>`,
          },
        ]
      : [
          {
            title: `${cleanPrompt} — Isometric Grid Mark`,
            desc: 'Clean vector composition suitable for hero illustrations or icon badges.',
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120" fill="none"><rect width="160" height="120" rx="16" fill="#F1F5F9"/><path d="M80 20 L130 48 L80 76 L30 48 Z" fill="#2563EB" opacity="0.88"/><path d="M30 48 L80 76 L80 104 L30 76 Z" fill="#1E40AF"/><path d="M130 48 L80 76 L80 104 L130 76 Z" fill="#60A5FA"/></svg>`,
          },
          {
            title: `${cleanPrompt} — Editorial Horizon`,
            desc: 'Minimalist layered geometric vector motif.',
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120" fill="none"><rect width="160" height="120" rx="16" fill="#0F172A"/><circle cx="80" cy="54" r="28" fill="#F59E0B"/><path d="M16 92 Q80 62 144 92 L144 120 L16 120 Z" fill="#1E293B"/></svg>`,
          },
          {
            title: `${cleanPrompt} — Modular Frame Badge`,
            desc: 'Clean structural SVG badge ready for styling and color themes.',
            svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120" fill="none"><rect width="160" height="120" rx="16" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/><rect x="24" y="24" width="52" height="72" rx="8" fill="#0F172A"/><rect x="86" y="24" width="50" height="32" rx="8" fill="#3B82F6"/><rect x="86" y="64" width="50" height="32" rx="8" fill="#E2E8F0"/></svg>`,
          },
        ];

  return candidates.map((c, idx) => {
    const check = sanitizeSvgMarkup(c.svg);
    const safeSvg = check.valid && check.sanitized ? check.sanitized : '';
    return {
      id: `cand_${Date.now().toString(36)}_${idx}`,
      name: `${c.title}.svg`,
      category: targetCategory,
      svgMarkup: safeSvg,
      previewDataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(safeSvg)}`,
      provenance: 'Builly Vector Generator (Original SVG)',
      license: 'User-Owned / CC0 Original Generation',
      description: c.desc,
    };
  });
}

export function createAssetFromAgentCandidate(
  candidate: AgentAssetCandidate
): { asset?: MediaAsset; error?: string } {
  const sanitized = sanitizeSvgMarkup(candidate.svgMarkup);
  if (!sanitized.valid || !sanitized.sanitized) {
    return { error: sanitized.error || 'Candidate SVG failed validation.' };
  }
  const nowIso = new Date().toISOString();
  const bytes = new Blob([sanitized.sanitized], { type: 'image/svg+xml' }).size;
  return {
    asset: {
      id: `ast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      name: candidate.name,
      url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sanitized.sanitized)}`,
      size: formatBytes(bytes),
      bytes,
      type: 'image',
      mimeType: 'image/svg+xml',
      category: candidate.category,
      altText: candidate.description,
      svgSanitized: true,
      svgMarkup: sanitized.sanitized,
      sourceOrigin: 'agent-generated',
      licenseNote: `${candidate.provenance} · ${candidate.license}`,
      tags: [candidate.category, 'agent-approved'],
      driveFileId: `drv_agent_${Date.now()}`,
      driveFolder: `/${ENV_CONFIG.driveFolderName}/Assets/${
        candidate.category === 'logos' ? 'Logos' : 'Icons'
      }`,
      createdAt: nowIso.slice(0, 10),
      updatedAt: nowIso,
    },
  };
}
