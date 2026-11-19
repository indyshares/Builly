import { useEffect, useState } from 'react';
import { DeviceMode } from '../types/builder';

export interface BreakpointMeta {
  id: DeviceMode;
  label: string;
  shortLabel: string;
  min?: number;
  max?: number;
  previewWidth: number;
  rangeDescription: string;
}

export const BREAKPOINTS: Record<DeviceMode, BreakpointMeta> = {
  desktop: {
    id: 'desktop',
    label: 'Desktop (Base)',
    shortLabel: 'Desktop',
    min: 1024,
    previewWidth: 1280,
    rangeDescription: '1024px and wider',
  },
  tablet: {
    id: 'tablet',
    label: 'Tablet',
    shortLabel: 'Tablet',
    min: 768,
    max: 1023,
    previewWidth: 768,
    rangeDescription: '768px – 1023px',
  },
  mobile: {
    id: 'mobile',
    label: 'Mobile',
    shortLabel: 'Mobile',
    max: 767,
    previewWidth: 375,
    rangeDescription: 'Up to 767px',
  },
};

export function resolveEditorViewportMode(width: number): DeviceMode {
  if (width < 768) return 'mobile';
  if (width < 1024) return 'tablet';
  return 'desktop';
}

export interface EditorViewportState {
  viewportMode: DeviceMode;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
}

export function useEditorViewport(): EditorViewportState {
  const getSnapshot = (): EditorViewportState => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1440;
    const h = typeof window !== 'undefined' ? window.innerHeight : 900;
    return {
      viewportMode: resolveEditorViewportMode(w),
      width: w,
      height: h,
      orientation: w >= h ? 'landscape' : 'portrait',
    };
  };

  const [viewport, setViewport] = useState<EditorViewportState>(getSnapshot);

  useEffect(() => {
    const handleResize = () => {
      setViewport(getSnapshot());
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return viewport;
}

export const RESERVED_SYSTEM_SLUGS: ReadonlySet<string> = new Set([
  'console',
  'orgs',
  'projects',
  'workspace',
  'connect-workspace',
  'builder',
  'editor',
  'app',
  'login',
  'auth',
  'signup',
  'admin',
  'dashboard',
  'preview',
  'settings',
  'api',
  'assets',
  'static',
  'public',
  's',
  'privacy',
  'terms',
]);

export function validatePortfolioSlug(raw: string): { valid: boolean; normalized: string; error?: string } {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return { valid: false, normalized, error: 'Portfolio slug cannot be empty.' };
  }
  if (RESERVED_SYSTEM_SLUGS.has(normalized)) {
    return { valid: false, normalized, error: `"${normalized}" is a reserved system route.` };
  }
  if (normalized.length < 3 || normalized.length > 48) {
    return { valid: false, normalized, error: 'Slug must be 3–48 characters.' };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized)) {
    return { valid: false, normalized, error: 'Use lowercase letters, numbers, and single hyphens only.' };
  }
  return { valid: true, normalized };
}
