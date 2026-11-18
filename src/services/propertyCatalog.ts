import { DeviceMode, ElementNode, ElementStyles } from '../types/builder';
import { resolveParentEffectiveDisplay, resolveStylesForBreakpoint } from './responsiveStyleModel';

export type StyleGroupId =
  | 'layout'
  | 'alignment'
  | 'sizing'
  | 'spacing'
  | 'typography'
  | 'background'
  | 'border'
  | 'effects'
  | 'overflow'
  | 'positioning'
  | 'transform'
  | 'transition'
  | 'custom';

export interface PropertyCatalogEntry {
  prop: keyof Omit<ElementStyles, 'rawDeclarations' | 'backgroundLayers'>;
  cssProperty: string;
  label: string;
  group: StyleGroupId;
  tab: 'style' | 'advanced';
  keywords: string[];
  description?: string;
}

export const STYLE_PROP_TO_CSS: Record<
  Exclude<keyof ElementStyles, 'rawDeclarations' | 'backgroundLayers' | 'backgroundGradient'>,
  string
> = {
  // Layout
  display: 'display',
  boxSizing: 'box-sizing',
  aspectRatio: 'aspect-ratio',
  columnCount: 'column-count',
  columnWidth: 'column-width',
  columnRule: 'column-rule',
  contain: 'contain',
  contentVisibility: 'content-visibility',

  // Flex Container
  flexDirection: 'flex-direction',
  flexWrap: 'flex-wrap',
  justifyContent: 'justify-content',
  alignItems: 'align-items',
  alignContent: 'align-content',
  gap: 'gap',
  rowGap: 'row-gap',
  columnGap: 'column-gap',

  // Flex & Grid Item
  alignSelf: 'align-self',
  justifySelf: 'justify-self',
  placeSelf: 'place-self',
  order: 'order',
  flexGrow: 'flex-grow',
  flexShrink: 'flex-shrink',
  flexBasis: 'flex-basis',
  flex: 'flex',

  // Grid Container & Placement
  gridColumns: 'grid-template-columns',
  gridTemplateRows: 'grid-template-rows',
  gridTemplateAreas: 'grid-template-areas',
  gridAutoFlow: 'grid-auto-flow',
  gridAutoColumns: 'grid-auto-columns',
  gridAutoRows: 'grid-auto-rows',
  justifyItems: 'justify-items',
  placeItems: 'place-items',
  placeContent: 'place-content',
  gridColumn: 'grid-column',
  gridRow: 'grid-row',
  gridColumnStart: 'grid-column-start',
  gridColumnEnd: 'grid-column-end',
  gridRowStart: 'grid-row-start',
  gridRowEnd: 'grid-row-end',

  // Sizing
  width: 'width',
  minWidth: 'min-width',
  maxWidth: 'max-width',
  height: 'height',
  minHeight: 'min-height',
  maxHeight: 'max-height',
  inlineSize: 'inline-size',
  minInlineSize: 'min-inline-size',
  maxInlineSize: 'max-inline-size',
  blockSize: 'block-size',
  minBlockSize: 'min-block-size',
  maxBlockSize: 'max-block-size',

  // Spacing
  margin: 'margin',
  marginTop: 'margin-top',
  marginRight: 'margin-right',
  marginBottom: 'margin-bottom',
  marginLeft: 'margin-left',
  marginInline: 'margin-inline',
  marginBlock: 'margin-block',
  padding: 'padding',
  paddingTop: 'padding-top',
  paddingRight: 'padding-right',
  paddingBottom: 'padding-bottom',
  paddingLeft: 'padding-left',
  paddingInline: 'padding-inline',
  paddingBlock: 'padding-block',

  // Typography
  fontFamily: 'font-family',
  fontSize: 'font-size',
  fontWeight: 'font-weight',
  fontStyle: 'font-style',
  fontStretch: 'font-stretch',
  lineHeight: 'line-height',
  letterSpacing: 'letter-spacing',
  wordSpacing: 'word-spacing',
  textAlign: 'text-align',
  textAlignLast: 'text-align-last',
  verticalAlign: 'vertical-align',
  textIndent: 'text-indent',
  textTransform: 'text-transform',
  textColor: 'color',
  textDecorationLine: 'text-decoration-line',
  textDecorationStyle: 'text-decoration-style',
  textDecorationColor: 'text-decoration-color',
  textDecorationThickness: 'text-decoration-thickness',
  textUnderlineOffset: 'text-underline-offset',
  textShadow: 'text-shadow',
  whiteSpace: 'white-space',
  overflowWrap: 'overflow-wrap',
  wordBreak: 'word-break',
  hyphens: 'hyphens',
  lineClamp: '-webkit-line-clamp',
  direction: 'direction',
  writingMode: 'writing-mode',

  // Background
  backgroundColor: 'background-color',
  backgroundImage: 'background-image',
  backgroundSize: 'background-size',
  backgroundPosition: 'background-position',
  backgroundRepeat: 'background-repeat',
  backgroundAttachment: 'background-attachment',
  backgroundOrigin: 'background-origin',
  backgroundClip: 'background-clip',
  backgroundBlendMode: 'background-blend-mode',

  // Border & Outline
  borderWidth: 'border-width',
  borderStyle: 'border-style',
  borderColor: 'border-color',
  borderTopWidth: 'border-top-width',
  borderTopStyle: 'border-top-style',
  borderTopColor: 'border-top-color',
  borderRightWidth: 'border-right-width',
  borderRightStyle: 'border-right-style',
  borderRightColor: 'border-right-color',
  borderBottomWidth: 'border-bottom-width',
  borderBottomStyle: 'border-bottom-style',
  borderBottomColor: 'border-bottom-color',
  borderLeftWidth: 'border-left-width',
  borderLeftStyle: 'border-left-style',
  borderLeftColor: 'border-left-color',
  borderInlineWidth: 'border-inline-width',
  borderInlineStyle: 'border-inline-style',
  borderInlineColor: 'border-inline-color',
  borderBlockWidth: 'border-block-width',
  borderBlockStyle: 'border-block-style',
  borderBlockColor: 'border-block-color',
  borderRadius: 'border-radius',
  borderTopLeftRadius: 'border-top-left-radius',
  borderTopRightRadius: 'border-top-right-radius',
  borderBottomRightRadius: 'border-bottom-right-radius',
  borderBottomLeftRadius: 'border-bottom-left-radius',
  outlineWidth: 'outline-width',
  outlineStyle: 'outline-style',
  outlineColor: 'outline-color',
  outlineOffset: 'outline-offset',

  // Effects
  boxShadow: 'box-shadow',
  opacity: 'opacity',
  filter: 'filter',
  backdropFilter: 'backdrop-filter',
  mixBlendMode: 'mix-blend-mode',
  isolation: 'isolation',
  clipPath: 'clip-path',

  // Overflow & Media
  overflow: 'overflow',
  overflowX: 'overflow-x',
  overflowY: 'overflow-y',
  overscrollBehavior: 'overscroll-behavior',
  scrollBehavior: 'scroll-behavior',
  scrollSnapType: 'scroll-snap-type',
  scrollSnapAlign: 'scroll-snap-align',
  scrollSnapStop: 'scroll-snap-stop',
  resize: 'resize',
  objectFit: 'object-fit',
  objectPosition: 'object-position',

  // Positioning
  position: 'position',
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
  inset: 'inset',
  insetInline: 'inset-inline',
  insetBlock: 'inset-block',
  zIndex: 'z-index',

  // Transform
  transform: 'transform',
  transformOrigin: 'transform-origin',
  transformBox: 'transform-box',
  perspective: 'perspective',

  // Transition & Animation
  transition: 'transition',
  transitionProperty: 'transition-property',
  transitionDuration: 'transition-duration',
  transitionDelay: 'transition-delay',
  transitionTimingFunction: 'transition-timing-function',
  animation: 'animation',
  animationName: 'animation-name',
  animationDuration: 'animation-duration',
  animationDelay: 'animation-delay',
  animationTimingFunction: 'animation-timing-function',
  animationIterationCount: 'animation-iteration-count',
  animationDirection: 'animation-direction',
  animationFillMode: 'animation-fill-mode',
  animationPlayState: 'animation-play-state',

  // Interaction
  cursor: 'cursor',
  pointerEvents: 'pointer-events',
  userSelect: 'user-select',
};

export interface ElementLayoutContext {
  effectiveDisplay: string;
  parentEffectiveDisplay: string;
  isFlexContainer: boolean;
  isGridContainer: boolean;
  isBlockContainer: boolean;
  isHiddenDisplay: boolean;
  isFlexItem: boolean;
  isGridItem: boolean;
  isContainerElement: boolean;
  isMediaElement: boolean;
  isTextElement: boolean;
  isInteractiveElement: boolean;
}

export function getDefaultDisplayForNode(node: ElementNode): string {
  if (node.styles?.display) return node.styles.display;
  switch (node.type) {
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

export function getElementLayoutContext(
  element: ElementNode,
  parentElement: ElementNode | null,
  breakpoint: DeviceMode
): ElementLayoutContext {
  const effectiveStyles = resolveStylesForBreakpoint(element, breakpoint);
  const effectiveDisplay = (effectiveStyles.display || getDefaultDisplayForNode(element)).trim();
  const parentEffectiveDisplay = resolveParentEffectiveDisplay(parentElement, breakpoint);

  const isFlexContainer = effectiveDisplay === 'flex' || effectiveDisplay === 'inline-flex';
  const isGridContainer = effectiveDisplay === 'grid' || effectiveDisplay === 'inline-grid';
  const isHiddenDisplay = effectiveDisplay === 'none';
  const isBlockContainer = !isFlexContainer && !isGridContainer && !isHiddenDisplay;

  const isFlexItem =
    Boolean(parentElement) &&
    (parentEffectiveDisplay === 'flex' || parentEffectiveDisplay === 'inline-flex');
  const isGridItem =
    Boolean(parentElement) &&
    (parentEffectiveDisplay === 'grid' || parentEffectiveDisplay === 'inline-grid');

  const isContainerElement =
    element.type === 'container' ||
    element.type === 'flex-row' ||
    element.type === 'grid-2col' ||
    element.type === 'project-card' ||
    element.type === 'repeater';

  const isMediaElement = element.type === 'image' || element.type === 'video';
  const isTextElement =
    element.type === 'heading' ||
    element.type === 'text' ||
    element.type === 'button' ||
    isContainerElement;
  const isInteractiveElement = element.type === 'button';

  return {
    effectiveDisplay,
    parentEffectiveDisplay,
    isFlexContainer,
    isGridContainer,
    isBlockContainer,
    isHiddenDisplay,
    isFlexItem,
    isGridItem,
    isContainerElement,
    isMediaElement,
    isTextElement,
    isInteractiveElement,
  };
}

export interface StyleSectionDescriptor {
  id: StyleGroupId;
  title: string;
  tab: 'style' | 'advanced';
  keywords: string[];
}

export const STYLE_SECTIONS_METADATA: StyleSectionDescriptor[] = [
  {
    id: 'layout',
    title: 'Layout',
    tab: 'style',
    keywords: ['display', 'flex', 'grid', 'block', 'inline', 'box-sizing', 'aspect-ratio', 'columns', 'visibility', 'contain'],
  },
  {
    id: 'alignment',
    title: 'Alignment',
    tab: 'style',
    keywords: [
      'text-align',
      'vertical-align',
      'justify-content',
      'align-items',
      'align-content',
      'justify-items',
      'place-items',
      'place-content',
      'align-self',
      'justify-self',
      'place-self',
      'flex-direction',
      'flex-wrap',
      'flex-grow',
      'flex-shrink',
      'flex-basis',
      'order',
      'grid-template-columns',
      'grid-template-rows',
      'grid-template-areas',
      'grid-auto-flow',
      'grid-column',
      'grid-row',
      'gap',
      'row-gap',
      'column-gap',
    ],
  },
  {
    id: 'sizing',
    title: 'Sizing',
    tab: 'style',
    keywords: [
      'width',
      'height',
      'min-width',
      'max-width',
      'min-height',
      'max-height',
      'aspect-ratio',
      'inline-size',
      'block-size',
      'clamp',
      'calc',
    ],
  },
  {
    id: 'spacing',
    title: 'Spacing & Box Model',
    tab: 'style',
    keywords: ['margin', 'padding', 'box model', 'margin-inline', 'margin-block', 'padding-inline', 'padding-block', 'auto'],
  },
  {
    id: 'typography',
    title: 'Typography',
    tab: 'style',
    keywords: [
      'font-family',
      'font-size',
      'font-weight',
      'font-style',
      'font-stretch',
      'line-height',
      'letter-spacing',
      'word-spacing',
      'color',
      'text-transform',
      'text-decoration',
      'text-shadow',
      'text-indent',
      'white-space',
      'word-break',
      'overflow-wrap',
      'hyphens',
      'line-clamp',
      'direction',
      'writing-mode',
    ],
  },
  {
    id: 'background',
    title: 'Background',
    tab: 'style',
    keywords: [
      'background-color',
      'background-image',
      'gradient',
      'linear-gradient',
      'radial-gradient',
      'conic-gradient',
      'background-size',
      'background-position',
      'background-repeat',
      'background-attachment',
      'background-origin',
      'background-clip',
      'background-blend-mode',
    ],
  },
  {
    id: 'border',
    title: 'Border & Outline',
    tab: 'style',
    keywords: [
      'border',
      'border-width',
      'border-style',
      'border-color',
      'border-radius',
      'outline',
      'outline-width',
      'outline-style',
      'outline-color',
      'outline-offset',
    ],
  },
  {
    id: 'effects',
    title: 'Effects & Filters',
    tab: 'style',
    keywords: [
      'box-shadow',
      'opacity',
      'filter',
      'blur',
      'brightness',
      'contrast',
      'grayscale',
      'saturate',
      'backdrop-filter',
      'mix-blend-mode',
      'isolation',
      'clip-path',
    ],
  },
  {
    id: 'overflow',
    title: 'Overflow & Media Fit',
    tab: 'style',
    keywords: [
      'overflow',
      'overflow-x',
      'overflow-y',
      'overscroll-behavior',
      'scroll-behavior',
      'scroll-snap',
      'resize',
      'object-fit',
      'object-position',
    ],
  },
  {
    id: 'positioning',
    title: 'Positioning & Stacking',
    tab: 'advanced',
    keywords: ['position', 'static', 'relative', 'absolute', 'fixed', 'sticky', 'top', 'right', 'bottom', 'left', 'inset', 'z-index'],
  },
  {
    id: 'transform',
    title: 'Transform',
    tab: 'advanced',
    keywords: ['transform', 'translate', 'rotate', 'scale', 'skew', 'transform-origin', 'perspective'],
  },
  {
    id: 'transition',
    title: 'Transition & Animation',
    tab: 'advanced',
    keywords: ['transition', 'animation', 'cubic-bezier', 'keyframes', 'duration', 'delay', 'reduced-motion'],
  },
  {
    id: 'custom',
    title: 'Custom CSS & Attributes',
    tab: 'advanced',
    keywords: ['custom css', 'raw', 'variables', 'aria', 'role', 'id', 'class', 'important'],
  },
];

export function sectionMatchesSearch(section: StyleSectionDescriptor, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (section.title.toLowerCase().includes(q)) return true;
  return section.keywords.some((kw) => kw.includes(q));
}
