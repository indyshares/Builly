import { ELEMENT_REGISTRY, ElementDefinition } from './elementRegistry';
import { ElementFamily, ElementNode } from '../types/builder';

export interface CatalogItem {
  type: string;
  family: ElementFamily;
  name: string;
  description: string;
  icon: string;
  defaultNode: () => ElementNode;
}

export const ELEMENT_CATALOG: CatalogItem[] = ELEMENT_REGISTRY.map((def: ElementDefinition) => ({
  type: def.elementType,
  family: def.family,
  name: def.name,
  description: def.description,
  icon: def.icon,
  defaultNode: def.defaultNode,
}));

export { ELEMENT_REGISTRY, canNestElement, isContainerElementType } from './elementRegistry';
