import {
  DeviceMode,
  ElementNode,
  ElementStyles,
  NonDefaultPseudoState,
  PseudoStateKey,
  PseudoStylesMap,
} from '../types/builder';

export type StyleOrigin = 'desktop' | 'tablet' | 'mobile' | 'unset';

export interface ResolvedStyleMeta<K extends keyof ElementStyles> {
  value: ElementStyles[K];
  origin: StyleOrigin;
  isOverriddenOnCurrent: boolean;
  inheritedFrom: 'desktop' | 'tablet' | null;
}

function getStyleBucket(
  node: ElementNode,
  breakpoint: DeviceMode,
  pseudoState: PseudoStateKey
): Partial<ElementStyles> | undefined {
  if (pseudoState === 'default') {
    if (breakpoint === 'desktop') return node.styles;
    return node.responsiveStyles?.[breakpoint];
  }
  if (breakpoint === 'desktop') {
    return node.pseudoStyles?.[pseudoState];
  }
  return node.responsivePseudoStyles?.[breakpoint]?.[pseudoState];
}

function mergeStyleLayer(target: ElementStyles, layer?: Partial<ElementStyles>) {
  if (!layer) return;
  const { rawDeclarations: layerRaw, ...rest } = layer;
  Object.assign(target, rest);
  if (layerRaw && Object.keys(layerRaw).length > 0) {
    target.rawDeclarations = {
      ...(target.rawDeclarations || {}),
      ...layerRaw,
    };
  }
}

/**
 * Resolves effective styles for the target website preview breakpoint and pseudo-state using
 * Desktop (base) -> Tablet -> Mobile cascade.
 */
export function resolveStylesForBreakpoint(
  node: ElementNode,
  breakpoint: DeviceMode,
  pseudoState: PseudoStateKey = 'default'
): ElementStyles {
  const base: ElementStyles = {};
  mergeStyleLayer(base, getStyleBucket(node, 'desktop', pseudoState));
  if (breakpoint === 'tablet') {
    mergeStyleLayer(base, getStyleBucket(node, 'tablet', pseudoState));
  } else if (breakpoint === 'mobile') {
    mergeStyleLayer(base, getStyleBucket(node, 'tablet', pseudoState));
    mergeStyleLayer(base, getStyleBucket(node, 'mobile', pseudoState));
  }
  return base;
}

/**
 * Resolves only the pseudo-state delta layer (for CSS compilation of `:hover`, `:focus`, etc.)
 * at a given breakpoint, cascading desktop pseudo -> tablet pseudo -> mobile pseudo.
 */
export function resolvePseudoDeltaForBreakpoint(
  node: ElementNode,
  breakpoint: DeviceMode,
  pseudoState: NonDefaultPseudoState
): Partial<ElementStyles> {
  return resolveStylesForBreakpoint(node, breakpoint, pseudoState);
}

/**
 * Determines where a single style property's effective value comes from at a given breakpoint and pseudo-state.
 */
export function getStyleSource<K extends keyof ElementStyles>(
  node: ElementNode,
  prop: K,
  breakpoint: DeviceMode,
  pseudoState: PseudoStateKey = 'default'
): ResolvedStyleMeta<K> {
  const desktopVal = getStyleBucket(node, 'desktop', pseudoState)?.[prop];
  const tabletVal = getStyleBucket(node, 'tablet', pseudoState)?.[prop];
  const mobileVal = getStyleBucket(node, 'mobile', pseudoState)?.[prop];

  if (breakpoint === 'desktop') {
    return {
      value: desktopVal,
      origin: desktopVal !== undefined ? 'desktop' : 'unset',
      isOverriddenOnCurrent: false,
      inheritedFrom: null,
    };
  }

  if (breakpoint === 'tablet') {
    if (tabletVal !== undefined) {
      return {
        value: tabletVal,
        origin: 'tablet',
        isOverriddenOnCurrent: true,
        inheritedFrom: null,
      };
    }
    return {
      value: desktopVal,
      origin: desktopVal !== undefined ? 'desktop' : 'unset',
      isOverriddenOnCurrent: false,
      inheritedFrom: desktopVal !== undefined ? 'desktop' : null,
    };
  }

  // Mobile breakpoint
  if (mobileVal !== undefined) {
    return {
      value: mobileVal,
      origin: 'mobile',
      isOverriddenOnCurrent: true,
      inheritedFrom: null,
    };
  }
  if (tabletVal !== undefined) {
    return {
      value: tabletVal,
      origin: 'tablet',
      isOverriddenOnCurrent: false,
      inheritedFrom: 'tablet',
    };
  }
  return {
    value: desktopVal,
    origin: desktopVal !== undefined ? 'desktop' : 'unset',
    isOverriddenOnCurrent: false,
    inheritedFrom: desktopVal !== undefined ? 'desktop' : null,
  };
}

function applyStyleUpdates(
  current: Partial<ElementStyles>,
  updates: Partial<ElementStyles>
): Partial<ElementStyles> {
  const next: Partial<ElementStyles> = { ...current };
  (Object.keys(updates) as (keyof ElementStyles)[]).forEach((key) => {
    const val = updates[key];
    if (key === 'rawDeclarations') {
      if (!val || Object.keys(val).length === 0) {
        delete next.rawDeclarations;
      } else {
        next.rawDeclarations = val as Record<string, string>;
      }
      return;
    }
    if (val === undefined || val === '') {
      delete next[key];
    } else {
      (next as Record<string, unknown>)[key] = val;
    }
  });
  return next;
}

/**
 * Updates one or more style properties for the specified breakpoint & pseudo-state
 * without overwriting base desktop styles when editing tablet or mobile.
 */
export function setStylesForBreakpoint(
  node: ElementNode,
  updates: Partial<ElementStyles>,
  breakpoint: DeviceMode,
  pseudoState: PseudoStateKey = 'default'
): ElementNode {
  if (pseudoState === 'default') {
    if (breakpoint === 'desktop') {
      return {
        ...node,
        styleSchemaVersion: 2,
        styles: applyStyleUpdates(node.styles || {}, updates) as ElementStyles,
      };
    }

    const updatedBp = applyStyleUpdates(node.responsiveStyles?.[breakpoint] || {}, updates);
    const nextResponsive = {
      ...(node.responsiveStyles || {}),
      [breakpoint]: updatedBp,
    };
    if (Object.keys(updatedBp).length === 0) {
      delete nextResponsive[breakpoint];
    }
    return {
      ...node,
      styleSchemaVersion: 2,
      responsiveStyles: Object.keys(nextResponsive).length > 0 ? nextResponsive : undefined,
    };
  }

  // Non-default pseudo-state
  if (breakpoint === 'desktop') {
    const updatedPseudo = applyStyleUpdates(node.pseudoStyles?.[pseudoState] || {}, updates);
    const nextPseudoStyles: PseudoStylesMap = {
      ...(node.pseudoStyles || {}),
      [pseudoState]: updatedPseudo,
    };
    if (Object.keys(updatedPseudo).length === 0) {
      delete nextPseudoStyles[pseudoState];
    }
    return {
      ...node,
      styleSchemaVersion: 2,
      pseudoStyles: Object.keys(nextPseudoStyles).length > 0 ? nextPseudoStyles : undefined,
    };
  }

  const currentBpPseudoMap: PseudoStylesMap = {
    ...(node.responsivePseudoStyles?.[breakpoint] || {}),
  };
  const updatedPseudo = applyStyleUpdates(currentBpPseudoMap[pseudoState] || {}, updates);
  if (Object.keys(updatedPseudo).length === 0) {
    delete currentBpPseudoMap[pseudoState];
  } else {
    currentBpPseudoMap[pseudoState] = updatedPseudo;
  }

  const nextRespPseudo = {
    ...(node.responsivePseudoStyles || {}),
    [breakpoint]: currentBpPseudoMap,
  };
  if (Object.keys(currentBpPseudoMap).length === 0) {
    delete nextRespPseudo[breakpoint];
  }

  return {
    ...node,
    styleSchemaVersion: 2,
    responsivePseudoStyles:
      Object.keys(nextRespPseudo).length > 0 ? nextRespPseudo : undefined,
  };
}

/**
 * Clears a single property override at a responsive breakpoint (or pseudo-state property on desktop).
 */
export function resetStyleForBreakpoint(
  node: ElementNode,
  prop: keyof ElementStyles,
  breakpoint: DeviceMode,
  pseudoState: PseudoStateKey = 'default'
): ElementNode {
  return setStylesForBreakpoint(node, { [prop]: undefined }, breakpoint, pseudoState);
}

/**
 * Clears a group of style properties at the specified breakpoint & pseudo-state.
 */
export function resetStyleGroupForBreakpoint(
  node: ElementNode,
  props: (keyof ElementStyles)[],
  breakpoint: DeviceMode,
  pseudoState: PseudoStateKey = 'default'
): ElementNode {
  const clearPatch: Partial<ElementStyles> = {};
  props.forEach((p) => {
    clearPatch[p] = undefined;
  });
  return setStylesForBreakpoint(node, clearPatch, breakpoint, pseudoState);
}

/**
 * Clears all style overrides for a given breakpoint (both default and pseudo-states).
 */
export function resetAllOverridesForBreakpoint(
  node: ElementNode,
  breakpoint: 'tablet' | 'mobile'
): ElementNode {
  const nextResponsive = { ...(node.responsiveStyles || {}) };
  delete nextResponsive[breakpoint];

  const nextRespPseudo = { ...(node.responsivePseudoStyles || {}) };
  delete nextRespPseudo[breakpoint];

  return {
    ...node,
    responsiveStyles: Object.keys(nextResponsive).length > 0 ? nextResponsive : undefined,
    responsivePseudoStyles:
      Object.keys(nextRespPseudo).length > 0 ? nextRespPseudo : undefined,
  };
}

/**
 * Copies resolved or authored styles from one breakpoint to another.
 */
export function copyBreakpointStyles(
  node: ElementNode,
  fromBp: DeviceMode,
  toBp: 'tablet' | 'mobile'
): ElementNode {
  if (fromBp === toBp) return node;
  const sourceResolved = resolveStylesForBreakpoint(node, fromBp, 'default');
  const nextNode = setStylesForBreakpoint(node, sourceResolved, toBp, 'default');
  return nextNode;
}

/**
 * Sets or removes a preserved raw CSS declaration (`--var` or unknown property) at breakpoint/pseudo-state.
 */
export function setRawDeclarationForBreakpoint(
  node: ElementNode,
  cssProp: string,
  cssValue: string | undefined,
  breakpoint: DeviceMode,
  pseudoState: PseudoStateKey = 'default'
): ElementNode {
  const key = cssProp.trim();
  if (!key) return node;
  const bucket = getStyleBucket(node, breakpoint, pseudoState);
  const currentRaw = { ...(bucket?.rawDeclarations || {}) };
  if (cssValue === undefined || cssValue.trim() === '') {
    delete currentRaw[key];
  } else {
    currentRaw[key] = cssValue.trim();
  }
  return setStylesForBreakpoint(
    node,
    { rawDeclarations: Object.keys(currentRaw).length > 0 ? currentRaw : undefined },
    breakpoint,
    pseudoState
  );
}

/**
 * Counts how many properties are explicitly overridden for a breakpoint (default + pseudo states).
 */
export function countBreakpointOverrides(
  node: ElementNode,
  breakpoint: DeviceMode
): number {
  if (breakpoint === 'desktop') return 0;
  let count = 0;

  const map = node.responsiveStyles?.[breakpoint];
  if (map) {
    Object.entries(map).forEach(([k, v]) => {
      if (k === 'rawDeclarations' && v && typeof v === 'object') {
        count += Object.keys(v).length;
      } else if (v !== undefined && v !== '') {
        count++;
      }
    });
  }

  const pseudoMap = node.responsivePseudoStyles?.[breakpoint];
  if (pseudoMap) {
    Object.values(pseudoMap).forEach((pStyles) => {
      if (!pStyles) return;
      Object.entries(pStyles).forEach(([k, v]) => {
        if (k === 'rawDeclarations' && v && typeof v === 'object') {
          count += Object.keys(v).length;
        } else if (v !== undefined && v !== '') {
          count++;
        }
      });
    });
  }

  return count;
}

export function isHiddenAtBreakpoint(node: ElementNode, breakpoint: DeviceMode): boolean {
  if (node.hidden) return true;
  if (breakpoint === 'desktop' && node.advanced?.hideOnDesktop) return true;
  if (breakpoint === 'tablet' && node.advanced?.hideOnTablet) return true;
  if (breakpoint === 'mobile' && node.advanced?.hideOnMobile) return true;
  return false;
}

/**
 * Resolves the effective CSS `display` value of a parent element at the active breakpoint
 * so child elements know whether Flex Item or Grid Item controls apply.
 */
export function resolveParentEffectiveDisplay(
  parentNode: ElementNode | null,
  breakpoint: DeviceMode
): string {
  if (!parentNode) return 'block';
  const resolved = resolveStylesForBreakpoint(parentNode, breakpoint, 'default');
  if (resolved.display) return resolved.display.trim();

  switch (parentNode.type) {
    case 'button':
      return 'inline-flex';
    case 'container':
    case 'flex-row':
    case 'project-card':
    case 'repeater':
      return 'flex';
    case 'grid-2col':
      return 'grid';
    default:
      return 'block';
  }
}
