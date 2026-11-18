export interface BuilderUiPrefs {
  leftOpen: boolean;
  rightOpen: boolean;
  leftWidth: number;
  rightWidth: number;
  focusMode: boolean;
  accordionStates: Record<string, boolean>;
  libraryViewMode: 'grid' | 'list';
}

const UI_PREFS_STORAGE_KEY = 'builly_builder_ui_prefs_v1';

export const LEFT_PANEL_MIN = 252;
export const LEFT_PANEL_MAX = 340;
export const LEFT_PANEL_DEFAULT = 276;

export const RIGHT_PANEL_MIN = 348;
export const RIGHT_PANEL_MAX = 460;
export const RIGHT_PANEL_DEFAULT = 372;

export const DEFAULT_BUILDER_UI_PREFS: BuilderUiPrefs = {
  leftOpen: true,
  rightOpen: true,
  leftWidth: LEFT_PANEL_DEFAULT,
  rightWidth: RIGHT_PANEL_DEFAULT,
  focusMode: false,
  accordionStates: {
    layout: true,
    alignment: true,
  },
  libraryViewMode: 'grid',
};

export function clampLeftWidth(width: number): number {
  if (!Number.isFinite(width)) return LEFT_PANEL_DEFAULT;
  return Math.min(LEFT_PANEL_MAX, Math.max(LEFT_PANEL_MIN, Math.round(width)));
}

export function clampRightWidth(width: number): number {
  if (!Number.isFinite(width)) return RIGHT_PANEL_DEFAULT;
  return Math.min(RIGHT_PANEL_MAX, Math.max(RIGHT_PANEL_MIN, Math.round(width)));
}

export function loadBuilderUiPrefs(): BuilderUiPrefs {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { ...DEFAULT_BUILDER_UI_PREFS };
  }
  try {
    const raw = window.localStorage.getItem(UI_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BUILDER_UI_PREFS };
    const parsed = JSON.parse(raw) as Partial<BuilderUiPrefs>;
    return {
      leftOpen: typeof parsed.leftOpen === 'boolean' ? parsed.leftOpen : DEFAULT_BUILDER_UI_PREFS.leftOpen,
      rightOpen: typeof parsed.rightOpen === 'boolean' ? parsed.rightOpen : DEFAULT_BUILDER_UI_PREFS.rightOpen,
      leftWidth: typeof parsed.leftWidth === 'number' ? clampLeftWidth(parsed.leftWidth) : LEFT_PANEL_DEFAULT,
      rightWidth: typeof parsed.rightWidth === 'number' ? clampRightWidth(parsed.rightWidth) : RIGHT_PANEL_DEFAULT,
      focusMode: typeof parsed.focusMode === 'boolean' ? parsed.focusMode : false,
      accordionStates:
        parsed.accordionStates && typeof parsed.accordionStates === 'object'
          ? { ...DEFAULT_BUILDER_UI_PREFS.accordionStates, ...parsed.accordionStates }
          : { ...DEFAULT_BUILDER_UI_PREFS.accordionStates },
      libraryViewMode: parsed.libraryViewMode === 'list' ? 'list' : 'grid',
    };
  } catch {
    return { ...DEFAULT_BUILDER_UI_PREFS };
  }
}

export function saveBuilderUiPrefs(prefs: BuilderUiPrefs): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or restricted context errors cleanly
  }
}

export function updateAccordionUiPref(sectionId: string, open: boolean): void {
  const current = loadBuilderUiPrefs();
  saveBuilderUiPrefs({
    ...current,
    accordionStates: {
      ...current.accordionStates,
      [sectionId]: open,
    },
  });
}
