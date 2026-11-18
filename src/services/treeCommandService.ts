import {
  DropPosition,
  ElementNode,
  LibraryItem,
  PageDocument,
  SiteDocument,
  TreeMoveOperation,
} from '../types/builder';
import {
  canNestElement,
  isContainerElementType,
  isRepeaterTemplateChild,
} from '../data/elementRegistry';
import { resolvePageSlotComponent } from './componentLibraryService';

export type RegionKind = 'header' | 'page' | 'footer';

export interface NodeLocationInfo {
  node: ElementNode;
  parent: ElementNode | null;
  index: number;
  ancestors: ElementNode[]; // nearest parent last, root first
  depth: number;
}

export interface RegionTreeContext {
  region: RegionKind;
  root: ElementNode;
}

export interface ResolvedDestination {
  parent: ElementNode;
  index: number;
  operation: TreeMoveOperation;
}

export interface DropValidationResult {
  valid: boolean;
  isNoOp?: boolean;
  reason?: string;
  region?: RegionKind;
  destinationParentId?: string;
  destinationParentName?: string;
  destinationIndex?: number;
  normalizedIndex?: number;
}

export interface MoveTargetOption {
  id: string;
  name: string;
  depth: number;
  isCurrentParent?: boolean;
  allowed: boolean;
  reason?: string;
}

export interface NodeMoveTargets {
  parent: { id: string; name: string; index: number; siblingCount: number } | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canMoveTop: boolean;
  canMoveBottom: boolean;
  canMoveOutOneLevel: boolean;
  outParentName: string | null;
  ancestors: { id: string; name: string; depth: number; insertIndex: number }[];
  containers: MoveTargetOption[];
  siblings: { id: string; name: string; index: number; isSelf: boolean }[];
}

export function containsNodeId(root: ElementNode | null | undefined, targetId: string): boolean {
  if (!root) return false;
  if (root.id === targetId) return true;
  return Boolean(root.children?.some((c) => containsNodeId(c, targetId)));
}

export function findNodeParentAndIndex(
  root: ElementNode | null | undefined,
  targetId: string,
  ancestors: ElementNode[] = []
): NodeLocationInfo | null {
  if (!root) return null;
  if (root.id === targetId) {
    return {
      node: root,
      parent: ancestors.length > 0 ? ancestors[ancestors.length - 1] : null,
      index:
        ancestors.length > 0
          ? ancestors[ancestors.length - 1].children?.findIndex((c) => c.id === targetId) ?? -1
          : -1,
      ancestors,
      depth: ancestors.length,
    };
  }
  const children = root.children || [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.id === targetId) {
      return {
        node: child,
        parent: root,
        index: i,
        ancestors: [...ancestors, root],
        depth: ancestors.length + 1,
      };
    }
    const nested = findNodeParentAndIndex(child, targetId, [...ancestors, root]);
    if (nested) return nested;
  }
  return null;
}

export function getRegionContextForNode(
  site: SiteDocument,
  activePage: PageDocument | null,
  nodeId: string
): RegionTreeContext | null {
  if (!activePage) return null;
  const headerSlot = resolvePageSlotComponent(activePage, site, 'header');
  if (headerSlot.definition && containsNodeId(headerSlot.definition.rootElement, nodeId)) {
    return { region: 'header', root: headerSlot.definition.rootElement };
  }
  if (containsNodeId(activePage.rootElement, nodeId)) {
    return { region: 'page', root: activePage.rootElement };
  }
  const footerSlot = resolvePageSlotComponent(activePage, site, 'footer');
  if (footerSlot.definition && containsNodeId(footerSlot.definition.rootElement, nodeId)) {
    return { region: 'footer', root: footerSlot.definition.rootElement };
  }
  return null;
}

export function resolveDropDestination(
  root: ElementNode,
  targetNodeId: string,
  position: DropPosition
): ResolvedDestination | null {
  const loc = findNodeParentAndIndex(root, targetNodeId);
  if (!loc) return null;

  if (position === 'before' || position === 'after') {
    if (!loc.parent) return null; // cannot insert before/after root itself
    return {
      parent: loc.parent,
      index: position === 'before' ? loc.index : loc.index + 1,
      operation: position === 'before' ? 'move-before' : 'move-after',
    };
  }

  return {
    parent: loc.node,
    index: position === 'inside-first' ? 0 : loc.node.children?.length || 0,
    operation: 'move-inside',
  };
}

export function validateTreeMove(
  site: SiteDocument,
  activePage: PageDocument | null,
  params: {
    nodeIds: string[];
    destinationParentId: string;
    destinationIndex: number;
    expectedDocumentRevision?: number;
  }
): DropValidationResult {
  const { nodeIds, destinationParentId, destinationIndex } = params;
  if (!activePage) {
    return { valid: false, reason: 'No active page selected.' };
  }
  if (!nodeIds.length) {
    return { valid: false, reason: 'No element selected to move.' };
  }

  if (
    params.expectedDocumentRevision !== undefined &&
    activePage.revision !== undefined &&
    params.expectedDocumentRevision !== activePage.revision
  ) {
    return {
      valid: false,
      reason: 'Page revision changed in another operation. Please retry.',
    };
  }

  const destCtx = getRegionContextForNode(site, activePage, destinationParentId);
  if (!destCtx) {
    return { valid: false, reason: 'Drop target does not exist on the active page.' };
  }

  const destLoc = findNodeParentAndIndex(destCtx.root, destinationParentId);
  if (!destLoc) {
    return { valid: false, reason: 'Destination container could not be resolved.' };
  }

  const destParent = destLoc.node;
  if (destParent.locked) {
    return { valid: false, reason: `"${destParent.name}" is locked.` };
  }
  if (destParent.componentRef?.mode === 'linked') {
    return {
      valid: false,
      reason: `Cannot move elements inside linked component "${destParent.name}".`,
    };
  }

  // Validate every node in the move group (all-or-nothing)
  const sourceLocs: NodeLocationInfo[] = [];
  for (const id of nodeIds) {
    if (id === destCtx.root.id) {
      return { valid: false, reason: 'Region root containers cannot be moved.' };
    }
    const srcCtx = getRegionContextForNode(site, activePage, id);
    if (!srcCtx || srcCtx.region !== destCtx.region) {
      return {
        valid: false,
        reason: 'Elements cannot be moved across Header, Page Content, and Footer shells.',
      };
    }
    const srcLoc = findNodeParentAndIndex(destCtx.root, id);
    if (!srcLoc || !srcLoc.parent) {
      return { valid: false, reason: 'Moved element was not found.' };
    }
    if (srcLoc.node.locked) {
      return { valid: false, reason: `"${srcLoc.node.name}" is locked and cannot be moved.` };
    }
    if (isRepeaterTemplateChild(srcLoc.parent)) {
      return {
        valid: false,
        reason: 'Repeater item template cannot be extracted directly into the page tree.',
      };
    }
    if (id === destinationParentId || containsNodeId(srcLoc.node, destinationParentId)) {
      return {
        valid: false,
        reason: 'Cannot move an element inside itself or its own descendant.',
      };
    }
    const nestCheck = canNestElement(destParent, srcLoc.node.type, destLoc.depth);
    if (!nestCheck.allowed) {
      return { valid: false, reason: nestCheck.reason };
    }
    sourceLocs.push(srcLoc);
  }

  // Normalize destination index after removing source nodes from destination parent
  const removedBeforeInSameParent = sourceLocs.filter(
    (s) => s.parent?.id === destinationParentId && s.index < destinationIndex
  ).length;
  const destChildCountAfterRemoval =
    (destParent.children?.length || 0) -
    sourceLocs.filter((s) => s.parent?.id === destinationParentId).length;
  const normalizedIndex = Math.max(
    0,
    Math.min(destChildCountAfterRemoval, destinationIndex - removedBeforeInSameParent)
  );

  // Detect pure no-op when single node stays at exact same index in same parent
  if (
    sourceLocs.length === 1 &&
    sourceLocs[0].parent?.id === destinationParentId &&
    sourceLocs[0].index === normalizedIndex
  ) {
    return {
      valid: false,
      isNoOp: true,
      reason: 'Element is already in this position.',
      region: destCtx.region,
      destinationParentId,
      destinationParentName: destParent.name,
      destinationIndex,
      normalizedIndex,
    };
  }

  return {
    valid: true,
    region: destCtx.region,
    destinationParentId,
    destinationParentName: destParent.name,
    destinationIndex,
    normalizedIndex,
  };
}

export function validateTreeInsert(
  site: SiteDocument,
  activePage: PageDocument | null,
  params: {
    elementType: string;
    destinationParentId: string;
    destinationIndex: number;
    sourceItem?: LibraryItem;
  }
): DropValidationResult {
  if (!activePage) {
    return { valid: false, reason: 'Create a Home page first before inserting elements.' };
  }
  const destCtx = getRegionContextForNode(site, activePage, params.destinationParentId);
  if (!destCtx) {
    return { valid: false, reason: 'Insertion target container does not exist.' };
  }
  const destLoc = findNodeParentAndIndex(destCtx.root, params.destinationParentId);
  if (!destLoc) {
    return { valid: false, reason: 'Insertion target container could not be resolved.' };
  }

  if (
    params.sourceItem &&
    (params.sourceItem.type === 'header-template' ||
      params.sourceItem.type === 'footer-template')
  ) {
    return {
      valid: false,
      reason: 'Apply Header or Footer templates via Region Design / Preset or Page Layout.',
    };
  }

  const nestCheck = canNestElement(destLoc.node, params.elementType, destLoc.depth);
  if (!nestCheck.allowed) {
    return { valid: false, reason: nestCheck.reason };
  }

  const clampedIndex = Math.max(
    0,
    Math.min(destLoc.node.children?.length || 0, params.destinationIndex)
  );

  return {
    valid: true,
    region: destCtx.region,
    destinationParentId: destLoc.node.id,
    destinationParentName: destLoc.node.name,
    destinationIndex: clampedIndex,
    normalizedIndex: clampedIndex,
  };
}

export function executeTreeMove(
  root: ElementNode,
  nodeIds: string[],
  destinationParentId: string,
  rawDestinationIndex: number
): ElementNode {
  const idSet = new Set(nodeIds);
  const extracted: ElementNode[] = [];
  let removedBeforeInDest = 0;

  const extractRec = (current: ElementNode): ElementNode => {
    if (!current.children || current.children.length === 0) return current;
    const nextChildren: ElementNode[] = [];
    for (let i = 0; i < current.children.length; i++) {
      const child = current.children[i];
      if (idSet.has(child.id)) {
        extracted.push(child);
        if (current.id === destinationParentId && i < rawDestinationIndex) {
          removedBeforeInDest++;
        }
      } else {
        nextChildren.push(extractRec(child));
      }
    }
    return { ...current, children: nextChildren };
  };

  const treeWithoutMoved = extractRec(root);
  if (extracted.length === 0) return root;

  const insertRec = (current: ElementNode): ElementNode => {
    if (current.id === destinationParentId) {
      const baseChildren = current.children ? [...current.children] : [];
      const insertAt = Math.max(
        0,
        Math.min(baseChildren.length, rawDestinationIndex - removedBeforeInDest)
      );
      baseChildren.splice(insertAt, 0, ...extracted);
      return { ...current, children: baseChildren };
    }
    if (!current.children) return current;
    return { ...current, children: current.children.map(insertRec) };
  };

  return insertRec(treeWithoutMoved);
}

export function executeTreeInsert(
  root: ElementNode,
  newNode: ElementNode,
  destinationParentId: string,
  destinationIndex: number
): ElementNode {
  const insertRec = (current: ElementNode): ElementNode => {
    if (current.id === destinationParentId) {
      const baseChildren = current.children ? [...current.children] : [];
      const idx = Math.max(0, Math.min(baseChildren.length, destinationIndex));
      baseChildren.splice(idx, 0, newNode);
      return { ...current, children: baseChildren };
    }
    if (!current.children) return current;
    return { ...current, children: current.children.map(insertRec) };
  };
  return insertRec(root);
}

export function getMoveTargetsForNode(
  root: ElementNode | null | undefined,
  nodeId: string
): NodeMoveTargets | null {
  if (!root || root.id === nodeId) return null;
  const loc = findNodeParentAndIndex(root, nodeId);
  if (!loc || !loc.parent) return null;

  const siblings = (loc.parent.children || []).map((c, idx) => ({
    id: c.id,
    name: c.name,
    index: idx,
    isSelf: c.id === nodeId,
  }));

  const siblingCount = siblings.length;
  const canMoveUp = loc.index > 0;
  const canMoveDown = loc.index < siblingCount - 1;
  const canMoveTop = loc.index > 0;
  const canMoveBottom = loc.index < siblingCount - 1;

  // Ancestors strictly above current parent (so user can move out 1 or multiple levels)
  const ancestorLevels: { id: string; name: string; depth: number; insertIndex: number }[] = [];
  for (let i = loc.ancestors.length - 2; i >= 0; i--) {
    const ancestor = loc.ancestors[i];
    const childAncestor = loc.ancestors[i + 1];
    const childIdx = ancestor.children?.findIndex((c) => c.id === childAncestor.id) ?? -1;
    const nestCheck = canNestElement(ancestor, loc.node.type, i);
    if (nestCheck.allowed) {
      ancestorLevels.push({
        id: ancestor.id,
        name: ancestor.name,
        depth: i,
        insertIndex: childIdx >= 0 ? childIdx + 1 : ancestor.children?.length || 0,
      });
    }
  }

  const containers: MoveTargetOption[] = [];
  const walkContainers = (current: ElementNode, depth: number) => {
    if (current.id === nodeId || containsNodeId(loc.node, current.id)) {
      return; // skip self and descendants to prevent cycles
    }
    if (isContainerElementType(current.type)) {
      const check = canNestElement(current, loc.node.type, depth);
      containers.push({
        id: current.id,
        name: current.name,
        depth,
        isCurrentParent: current.id === loc.parent?.id,
        allowed: check.allowed,
        reason: check.reason,
      });
    }
    current.children?.forEach((c) => walkContainers(c, depth + 1));
  };
  walkContainers(root, 0);

  return {
    parent: {
      id: loc.parent.id,
      name: loc.parent.name,
      index: loc.index,
      siblingCount,
    },
    canMoveUp,
    canMoveDown,
    canMoveTop,
    canMoveBottom,
    canMoveOutOneLevel: ancestorLevels.length > 0,
    outParentName: ancestorLevels.length > 0 ? ancestorLevels[0].name : null,
    ancestors: ancestorLevels,
    containers,
    siblings,
  };
}
