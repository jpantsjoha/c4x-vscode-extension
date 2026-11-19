import * as dagre from 'dagre';
import { C4Element, C4Rel, C4View, C4Boundary } from '../model/C4Model';
import { routeAroundObstacles, findReversePairIds, BIDIRECTIONAL_EDGE_OFFSET, type Box } from '../render/EdgeRouter';
import type { C4Theme } from '../themes/Theme';
import { ClassicTheme } from '../themes/ClassicTheme';
import { isBundledSpriteId, resolveElementStyle, type ElementStyleContext } from '../render/elementStyle';
import { layoutElementText, TEXT_METRICS } from '../render/textLayout';
import { shapeMinSize, shapeTextBox } from '../render/shapeGeometry';
import { boundaryBottomPadding, boundaryLabelInkBox, boundaryLabelMinWidth } from '../render/boundaryLabel';
import {
  DEPLOYMENT_GROUP_MARGIN,
  deploymentIconSlot,
  deploymentLabelInkBox,
  deploymentLabelLineCount,
  deploymentLabelMinWidth,
  deploymentLabelReserve,
  deploymentLabelText,
  deploymentTypeLabel,
  infrastructureTextBox,
  isInfrastructureNode,
  usesDeploymentNotation,
  type DeploymentLabelText,
} from '../render/deploymentNotation';

type LayoutWarningReporter = (message: string) => void;

let outputChannel: { appendLine(message: string): void } | undefined;

function reportLayoutWarning(message: string): void {
  try {
    // Keep this layout module usable by standalone unit tests and scripts, where
    // the VS Code runtime module is intentionally unavailable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as {
      window?: { createOutputChannel?(name: string): { appendLine(line: string): void } };
    };
    outputChannel ??= vscode.window?.createOutputChannel?.('C4X');
    outputChannel?.appendLine(message);
  } catch {
    // The extension host owns the output channel. Standalone callers retain the
    // layout fallback without a VS Code runtime to report to.
  }
}

export type LayoutSpacingPreset = 'compact' | 'balanced' | 'spacious';

export interface LayoutSpacing {
  nodesep: number;
  ranksep: number;
}

/**
 * nodesep/ranksep (px) per `c4x.layout.spacing` preset. `balanced` matches the
 * historical hardcoded values (60/80), so the default layout is unchanged.
 */
export const LAYOUT_SPACING_PRESETS: Readonly<Record<LayoutSpacingPreset, LayoutSpacing>> = {
  compact: { nodesep: 40, ranksep: 60 },
  balanced: { nodesep: 60, ranksep: 80 },
  spacious: { nodesep: 90, ranksep: 120 },
};

/**
 * Resolve the `c4x.layout.spacing` setting into concrete dagre separations,
 * defaulting to `balanced` when the VS Code configuration API is unavailable
 * (standalone unit tests and scripts) or the configured value is unrecognised.
 */
export function resolveLayoutSpacing(): LayoutSpacing {
  let preset: string | undefined;
  try {
    // Keep this layout module usable by standalone unit tests and scripts, where
    // the VS Code runtime module is intentionally unavailable.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vscode = require('vscode') as {
      workspace?: { getConfiguration?(section?: string): { get<T>(key: string): T | undefined } };
    };
    preset = vscode.workspace?.getConfiguration?.('c4x')?.get<string>('layout.spacing');
  } catch {
    // No VS Code runtime to read configuration from: use the default preset.
  }
  return LAYOUT_SPACING_PRESETS[preset as LayoutSpacingPreset] ?? LAYOUT_SPACING_PRESETS.balanced;
}

/**
 * Adaptive bounding-box padding (px) added to the final diagram canvas size:
 * small diagrams (< 5 elements) get 30px so they do not float in white space,
 * larger ones keep the historical 50px. Deterministic and configuration-free —
 * same spirit as the `tighten` multiplier in layoutRecursive.
 */
/** Options for one layout pass. */
export interface LayoutOptions {
  /**
   * The theme the result will be drawn with. Its font decides where element
   * text wraps and so how tall a box must be (#340). Defaults to the current
   * theme, as SvgBuilder does, or classic where no theme manager is available.
   */
  theme?: C4Theme;
  /**
   * Let boxes grow in height for wrapped text (#340). Defaults to true, and
   * growth still applies only to a diagram with no saved geometry (see
   * hasSavedGeometry). False gives the pre-#340 sizes; tests compare the two.
   */
  growText?: boolean;
  /**
   * Node and rank separations. Defaults to the `c4x.layout.spacing` setting;
   * headless callers pass the default preset explicitly (#353, #352).
   */
  spacing?: LayoutSpacing;
}

/**
 * True when the view carries any saved geometry: an element with `$x`, `$y`
 * or `locked` (inline, or merged from the sidecar layout file before layout),
 * or a boundary with `$x`, `$y`, `$w` or `$h`. In such a diagram no box grows
 * for wrapped text (#340 review): every size is the standard one, so the
 * layout is exactly the growth-free layout and no saved position, frame edge
 * or gap can change. Long text is cut to the box with an ellipsis and the full
 * text in a tooltip instead.
 */
export function hasSavedGeometry(view: Pick<C4View, 'elements' | 'boundaries'>): boolean {
  const saved = (metadata: Record<string, string | undefined> | undefined, keys: string[]): boolean =>
    !!metadata && keys.some(key => metadata[key] !== undefined);
  const walk = (elements: C4Element[]): boolean => elements.some(element =>
    saved(element.metadata as Record<string, string | undefined> | undefined, ['x', 'y', 'locked'])
    || (!!element.children && walk(element.children)));
  return walk(view.elements)
    || (view.boundaries ?? []).some(b => saved(b.metadata as Record<string, string | undefined> | undefined, ['x', 'y', 'w', 'h']));
}

/** The theme SvgBuilder would draw with when given none. */
function defaultLayoutTheme(): C4Theme {
  try {
    // Loaded lazily: the theme manager reads VS Code settings, and this layout
    // module also runs in standalone scripts without the VS Code runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { themeManager } = require('../themes/ThemeManager') as { themeManager: { getCurrentTheme(): C4Theme } };
    return themeManager.getCurrentTheme();
  } catch {
    return ClassicTheme;
  }
}

export function resolveCanvasPadding(elementCount: number): number {
  return elementCount < 5 ? 30 : 50;
}

export interface PositionedBoundary {
  id: string;
  boundary: C4Boundary;
  x: number;
  y: number;
  width: number;
  height: number;
  /** True when $x was explicitly authored and must not be overwritten by auto-wrapping. */
  manualX?: boolean;
  /** True when $y was explicitly authored and must not be overwritten by auto-wrapping. */
  manualY?: boolean;
  /** Explicit $w value, when present, acts as a minimum that is clamped to fit children. */
  manualWidth?: number;
  /** Explicit $h value, when present, acts as a minimum that is clamped to fit children. */
  manualHeight?: number;
}

export interface LayoutResult {
  elements: PositionedElement[];
  relationships: RoutedRelationship[];
  boundaries?: PositionedBoundary[];
  width: number;
  height: number;
}

export interface PositionedElement {
  id: string;
  element: C4Element;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoutedRelationship {
  id: string;
  /**
   * The drawn polyline (#419): first point on the source element's border,
   * last on the target's, routed around unrelated elements, bidirectional
   * offset applied. Empty when an endpoint is not in the view.
   */
  points: Point[];
  relationship: C4Rel;
}

export interface Point {
  x: number;
  y: number;
}

/** Layouts made with text growth that made some leaf taller than its base size (#340, #323). */
const grewText = new WeakMap<object, boolean>();

export class DagreLayoutEngine {
  /** Side padding between a boundary frame and its contents (step 4.6). */
  private static readonly boundaryPaddingX = 40;
  /** Top padding of a boundary frame: room for its label (step 4.6). */
  private static readonly boundaryPaddingTop = 60;

  /**
   * Deployment nodes drawn with a bottom-left label row in this layout (#326):
   * element id -> the row's text and icon slot. Set per layout; empty unless
   * the theme has `deploymentNotation`.
   */
  private deploymentRows = new Map<string, { text: DeploymentLabelText; iconSlot: number; reserve: number }>();

  constructor(private readonly reportWarning: LayoutWarningReporter = reportLayoutWarning) {}

  /**
   * Get standard C4 Model element sizes according to c4model.com specifications
   */
  private getStandardElementSize(element: C4Element): { width: number; height: number } {
    switch (element.type) {
      case 'Person': return { width: 200, height: 160 };
      case 'SoftwareSystem': return { width: 260, height: 140 };
      case 'Container': return { width: 240, height: 130 };
      case 'Component': return { width: 220, height: 120 };
      // An infrastructure node (#326) is a single service box, container sized.
      case 'DeploymentNode': return isInfrastructureNode(element) ? { width: 240, height: 140 } : { width: 300, height: 200 };
      default: return { width: 260, height: 140 };
    }
  }

  /**
   * The size an element has before text growth: its type's standard box, raised
   * to the minimum its resolved shape needs so text stays inside the outline
   * (#323). The theme rectangle, box, rounded box and cylinder add no minimum,
   * so diagrams without a named shape keep their layout.
   */
  private getBaseSize(element: C4Element, theme: C4Theme, styles: ElementStyleContext): { width: number; height: number } {
    const size = this.getStandardElementSize(element);
    if (element.children && element.children.length > 0) {
      return size; // a group's size comes from its children
    }
    const style = resolveElementStyle(element, theme, styles, { isKnownSprite: isBundledSpriteId });
    // A deployment node in the notation (#326) draws its icon beside or under its text, not top centre.
    const notation = usesDeploymentNotation(theme, element, style.outline);
    const min = shapeMinSize(style.outline, !notation && !!(style.iconLayout && style.icon));
    return { width: Math.max(size.width, min.width), height: Math.max(size.height, min.height) };
  }

  /**
   * Size of a leaf element: its base size, taller when its wrapped text needs
   * more room (#340). Width never changes. Text that fits on one line keeps the
   * base size, so diagrams whose text fits lay out exactly as before. Growth is
   * bounded by the text caps in layoutElementText (label 3 lines, technology 2,
   * description 6), and applies only to a diagram with no saved geometry
   * (hasSavedGeometry). A named shape's text area is its inner box (#323), so
   * its growth is solved against the box at the grown height.
   */
  private getElementSize(element: C4Element, theme: C4Theme, styles: ElementStyleContext): { width: number; height: number } {
    const size = this.getBaseSize(element, theme, styles);
    if (element.children && element.children.length > 0) {
      return size; // a group's size comes from its children
    }
    const style = resolveElementStyle(element, theme, styles, { isKnownSprite: isBundledSpriteId });
    const named = style.outline === 'person' || style.outline === 'bucket' || style.outline === 'folder'
      || style.outline === 'webBrowser' || style.outline === 'terminal';
    // Deployment notation (#326): label row bottom left, or text above a centred icon.
    const notation = usesDeploymentNotation(theme, element, style.outline);
    const infrastructure = notation && isInfrastructureNode(element);
    const labelRow = notation && !infrastructure ? { iconSlot: deploymentIconSlot(style.icon) } : undefined;
    let height = size.height;
    // The box's chrome (head, lid, tab, bar) can change with height: iterate to a fixed point.
    for (let pass = 0; pass < 4; pass++) {
      const text = layoutElementText({
        x: 0,
        y: 0,
        width: size.width,
        height,
        textBox: named ? shapeTextBox(style.outline, 0, 0, size.width, height)
          : infrastructure ? infrastructureTextBox(0, 0, size.width, height) : undefined,
        iconLayout: !notation && !!(style.iconLayout && style.icon),
        cylinder: style.outline === 'cylinder',
        fontFamily: theme.styles.fontFamily,
        label: element.label,
        technology: element.technology,
        typeLabel: theme.showElementType ? deploymentTypeLabel(element) : undefined,
        description: element.description,
        ...(labelRow ? { labelRow } : {}),
      }, TEXT_METRICS);
      const next = Math.max(size.height, text.requiredHeight);
      if (next <= height) { break; }
      height = next;
    }
    return { width: size.width, height };
  }

  /**
   * True when a layout made with growth has a leaf taller than its standard size:
   * the same answer as wouldGrowText for that view and theme, read off the
   * layout instead of laying the text out again (#340 review 5, render cost).
   */
  layoutGrewText(layout: LayoutResult): boolean {
    return grewText.get(layout) === true;
  }

  /**
   * True when laying `view` out with growth would make some box taller than its
   * standard size (#340): no saved geometry, and some leaf's wrapped text needs
   * more than its standard height. The preview tells the webview, which then
   * asks for the standard-size layout before edit mode starts.
   */
  wouldGrowText(view: C4View, options: LayoutOptions = {}): boolean {
    if (options.growText === false || hasSavedGeometry(view)) {
      return false;
    }
    const theme = options.theme ?? defaultLayoutTheme();
    const styles: ElementStyleContext = { rules: view.elementStyles ?? [], accentSlots: {} };
    const walk = (elements: C4Element[]): boolean => elements.some(element =>
      (element.children && element.children.length > 0)
        ? walk(element.children)
        : this.getElementSize(element, theme, styles).height > this.getBaseSize(element, theme, styles).height);
    return walk(view.elements);
  }

  /**
   * Layout the view using a recursive strategy to support nested directions and manual positioning.
   */
  layoutSync(view: C4View, options: LayoutOptions = {}): LayoutResult {
    const theme = options.theme ?? defaultLayoutTheme();
    // Shapes (icon, cylinder) come from the theme and the view's element styles.
    const styles: ElementStyleContext = { rules: view.elementStyles ?? [], accentSlots: {} };

    // 1. Build a Unified Hierarchy (Nodes + Boundaries)
    // We treat Boundaries as "Cluster Nodes" that contain other nodes.
    // Boxes grow for wrapped text only when nothing in the diagram is pinned or
    // framed by hand: Dagre then places everything from the grown sizes.
    const grow = options.growText !== false && !hasSavedGeometry(view);
    let grew = false;
    // Nested deployment nodes with a bottom-left label row (#326).
    this.deploymentRows = this.collectDeploymentRows(view, theme, styles);
    const hierarchy = this.buildHierarchy(view, element => {
      if (!grow) {
        return this.getBaseSize(element, theme, styles);
      }
      const size = this.getElementSize(element, theme, styles);
      if (size.height > this.getBaseSize(element, theme, styles).height) {
        grew = true;
      }
      return size;
    });

    // 2. Recursive Layout (Bottom-Up)
    // This calculates sizes for clusters based on their inner layout.
    // And determines relative positions of children within their parent.
    // Node/rank separations come from the `c4x.layout.spacing` preset.
    this.layoutRecursive(hierarchy, view.relationships, options.spacing ?? resolveLayoutSpacing(), theme);

    // 3. Flatten and Calculate Absolute Positions
    const elements: PositionedElement[] = [];
    const boundaries: PositionedBoundary[] = [];

    this.flattenHierarchy(hierarchy, 0, 0, elements, boundaries);

    // 4. Manual Positioning Overrides (Post-Layout Nudge)
    // We apply this AFTER flattening to respect global coordinates if provided, 
    // or relative optimizations could be done here.
    // For now, if metadata $x and $y exist, we override.
    elements.forEach(el => {
      const metadata = el.element.metadata;
      if (!metadata) {
        return;
      }

      if (metadata.x !== undefined) {
        const x = parseFloat(metadata.x);
        if (Number.isFinite(x)) {
          el.x = x;
        } else {
          this.reportWarning('C4X layout: ignored non-finite $x metadata; using the computed layout coordinate.');
        }
      }

      if (metadata.y !== undefined) {
        const y = parseFloat(metadata.y);
        if (Number.isFinite(y)) {
          el.y = y;
        } else {
          this.reportWarning('C4X layout: ignored non-finite $y metadata; using the computed layout coordinate.');
        }
      }
    });

    // 4.5. Overlap Prevention & Coordinate Nudging
    this.preventOverlapsAndClipLabels(elements, view.relationships, this.buildAncestorMap(view), !!theme.deploymentNotation);

    // 4.5.5. Honor manual boundary geometry ($x/$y/$w/$h) authored on subgraphs.
    // This must run before auto-wrapping so that a manual position shifts the
    // boundary frame and its descendants together, and manual sizes act as
    // minima that are clamped to contain children.
    this.applyBoundaryManualGeometry(elements, boundaries);

    // 4.6. Adjust boundaries to wrap their nested elements
    if (boundaries && boundaries.length > 0) {
      this.adjustBoundariesToContainChildren(elements, boundaries, theme);
    }

    // 4.7. Re-wrap nested element groups around manually positioned descendants
    // (and, in the deployment notation, around any descendant the nudge moved, #326)
    this.rewrapNestedGroups(elements, view, !!theme.deploymentNotation);

    // 4.8. Normalize origin: re-wrapping can push a parent container left of
    // or above the canvas origin (child.x - pad < 0). The SVG viewBox and the
    // webview payload validator both require non-negative coordinates.
    this.normalizeOrigin(elements, boundaries);

    // Calculate bounding box
    let width = 0;
    let height = 0;
    elements.forEach(el => {
      width = Math.max(width, el.x + el.width);
      height = Math.max(height, el.y + el.height);
    });
    boundaries.forEach(b => {
      width = Math.max(width, b.x + b.width);
      height = Math.max(height, b.y + b.height);
    });
    // Adaptive breathing room on each dimension: 30px for small diagrams
    // (< 5 elements), 50px otherwise (was a flat 50px — audit finding:
    // excessive canvas white space)
    const canvasWidth = width + resolveCanvasPadding(elements.length);
    const canvasHeight = height + resolveCanvasPadding(elements.length);

    // 5. Route Relationships (#419): every edge gets the polyline that is
    // drawn, from the source border to the target border, around unrelated
    // boxes, inside the canvas. Node positions are final at this point.
    const relationships = this.routeEdges(view.relationships, elements, { width: canvasWidth, height: canvasHeight }, boundaries, theme);

    const result: LayoutResult = {
      elements,
      relationships,
      boundaries,
      width: canvasWidth,
      height: canvasHeight
    };
    grewText.set(result, grew);
    return result;
  }

  /**
   * Nested deployment nodes the notation draws with a bottom-left label row
   * (#326): every DeploymentNode with children whose outline is the theme
   * rectangle or a box, when the theme has `deploymentNotation`. Infrastructure
   * nodes are leaves and never listed. The reserve is filled in by
   * layoutRecursive once the node's width is known.
   */
  private collectDeploymentRows(view: C4View, theme: C4Theme, styles: ElementStyleContext): Map<string, { text: DeploymentLabelText; iconSlot: number; reserve: number }> {
    const rows = new Map<string, { text: DeploymentLabelText; iconSlot: number; reserve: number }>();
    if (!theme.deploymentNotation) {
      return rows;
    }
    const walk = (elements: C4Element[]): void => {
      for (const element of elements) {
        if (element.children && element.children.length > 0) {
          const style = resolveElementStyle(element, theme, styles, { isKnownSprite: isBundledSpriteId });
          if (usesDeploymentNotation(theme, element, style.outline) && !isInfrastructureNode(element)) {
            const iconSlot = deploymentIconSlot(style.icon);
            rows.set(element.id, { text: deploymentLabelText(element, theme), iconSlot, reserve: deploymentLabelReserve(2, iconSlot) });
          }
          walk(element.children);
        }
      }
    };
    walk(view.elements);
    return rows;
  }

  /**
   * Map each element id to the set of its ancestor ids in the view hierarchy.
   * Used to exempt intentional parent→child containment (nested deployment
   * nodes) from overlap nudging — an ancestor's box is SUPPOSED to enclose
   * its descendants.
   */
  private buildAncestorMap(view: C4View): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    const walk = (elements: C4Element[], ancestors: Set<string>): void => {
      for (const element of elements) {
        map.set(element.id, new Set(ancestors));
        if (element.children && element.children.length > 0) {
          walk(element.children, new Set([...ancestors, element.id]));
        }
      }
    };
    walk(view.elements, new Set());
    return map;
  }

  private preventOverlapsAndClipLabels(elements: PositionedElement[], relationships: C4Rel[], ancestors?: Map<string, Set<string>>, labelsInsideGroups = false): void {
    const padding = 30; // Minimum distance between elements
    const labelPadding = 15; // Minimum distance between elements and labels
    const maxIterations = 50;
    let hasMovement = true;
    let iteration = 0;

    // Helper to check if an element is locked
    const isLocked = (el: PositionedElement) => el.element.metadata?.locked === 'true';
    // Elements with explicit $x/$y are user-pinned: the nudger must not move
    // them, otherwise rendered positions diverge from what was saved to
    // source (the "overlap resets after save" UAT/audit finding). Locked
    // elements are pinned by the same rule.
    const isPinned = (el: PositionedElement) =>
      isLocked(el) || el.element.metadata?.x !== undefined || el.element.metadata?.y !== undefined;
    // Ancestor/descendant pairs overlap by design (containment), never nudge them.
    const isContainmentPair = (a: PositionedElement, b: PositionedElement): boolean =>
      ancestors?.get(a.id)?.has(b.id) === true || ancestors?.get(b.id)?.has(a.id) === true;

    while (hasMovement && iteration < maxIterations) {
      hasMovement = false;
      iteration++;

      // 1. Resolve element-element overlaps
      for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
          const el1 = elements[i];
          const el2 = elements[j];

          if (isContainmentPair(el1, el2)) {
            continue;
          }

          // Check for overlap with padding
          const isOverlapping = el1.x < el2.x + el2.width + padding &&
                                el2.x < el1.x + el1.width + padding &&
                                el1.y < el2.y + el2.height + padding &&
                                el2.y < el1.y + el1.height + padding;

          if (isOverlapping) {
            const el1Pinned = isPinned(el1);
            const el2Pinned = isPinned(el2);

            if (el1Pinned && el2Pinned) {
              // Both pinned (locked or user-positioned): respect the saved
              // coordinates exactly, even when they overlap.
              continue;
            }

            // Centers
            const c1x = el1.x + el1.width / 2;
            const c1y = el1.y + el1.height / 2;
            const c2x = el2.x + el2.width / 2;
            const c2y = el2.y + el2.height / 2;

            let dx = c2x - c1x;
            let dy = c2y - c1y;

            if (dx === 0 && dy === 0) {
              dx = 1;
              dy = 0;
            }

            // Overlaps along axes
            const overlapX = (el1.width / 2 + el2.width / 2 + padding) - Math.abs(dx);
            const overlapY = (el1.height / 2 + el2.height / 2 + padding) - Math.abs(dy);

            let pushX = 0;
            let pushY = 0;

            if (overlapX < overlapY) {
              pushX = (dx >= 0 ? 1 : -1) * overlapX;
            } else {
              pushY = (dy >= 0 ? 1 : -1) * overlapY;
            }

            // Apply displacement: pinned elements never move; only
            // auto-positioned elements are nudged out of the way.
            if (el1Pinned) {
              el2.x = Math.max(20, el2.x + pushX);
              el2.y = Math.max(20, el2.y + pushY);
            } else if (el2Pinned) {
              el1.x = Math.max(20, el1.x - pushX);
              el1.y = Math.max(20, el1.y - pushY);
            } else {
              // Move both
              el1.x = Math.max(20, el1.x - pushX / 2);
              el1.y = Math.max(20, el1.y - pushY / 2);
              el2.x = Math.max(20, el2.x + pushX / 2);
              el2.y = Math.max(20, el2.y + pushY / 2);
            }
            hasMovement = true;
          }
        }
      }

      // 2. Resolve element-label overlaps to prevent clipping labels
      // For each relationship, estimate the label position (midpoint between src and dst)
      const elMap = new Map<string, PositionedElement>();
      elements.forEach(el => elMap.set(el.id, el));

      relationships.forEach(rel => {
        const src = elMap.get(rel.from);
        const dst = elMap.get(rel.to);
        if (!src || !dst) return;

        // Label center is estimated midpoint
        const labelX = (src.x + src.width / 2 + dst.x + dst.width / 2) / 2;
        const labelY = (src.y + src.height / 2 + dst.y + dst.height / 2) / 2 - 6;

        // Estimate label size
        const prefix = rel.order ? `${rel.order}: ` : '';
        const labelText = prefix + (rel.label || '').trim();
        const fontSize = 12;
        const estimatedCharWidth = fontSize * 0.6;
        const labelWidth = labelText.length * estimatedCharWidth;
        const labelHeight = 14;

        const halfLW = labelWidth / 2;
        const halfLH = labelHeight / 2;

        const lblMinX = labelX - halfLW;
        const lblMaxX = labelX + halfLW;
        const lblMinY = labelY - halfLH;
        const lblMaxY = labelY + halfLH;

        // Check if any element overlaps with this label box
        elements.forEach(el => {
          // If the element is src or dst, we don't nudge it away from its own relationship label midpoint.
          if (el.id === src.id || el.id === dst.id) {
            return;
          }
          // Deployment notation (#326): neither a node that holds other nodes
          // nor anything inside one is pushed by a label estimate. Moving a
          // node's box alone pulls it off its children; moving a child makes
          // its parent re-wrap into its siblings. The renderer places the
          // label clear of node outlines and label rows instead.
          if (labelsInsideGroups && ((el.element.children?.length ?? 0) > 0 || (ancestors?.get(el.id)?.size ?? 0) > 0)) {
            return;
          }

          const isOverlapping = el.x < lblMaxX + labelPadding &&
                                lblMinX - labelPadding < el.x + el.width &&
                                el.y < lblMaxY + labelPadding &&
                                lblMinY - labelPadding < el.y + el.height;

          if (isOverlapping && !isPinned(el)) {
            // Push element away from label center
            const elCenterX = el.x + el.width / 2;
            const elCenterY = el.y + el.height / 2;

            let dx = elCenterX - labelX;
            let dy = elCenterY - labelY;

            if (dx === 0 && dy === 0) {
              dx = 1;
              dy = 0;
            }

            const overlapX = (el.width / 2 + halfLW + labelPadding) - Math.abs(dx);
            const overlapY = (el.height / 2 + halfLH + labelPadding) - Math.abs(dy);

            let pushX = 0;
            let pushY = 0;

            if (overlapX < overlapY) {
              pushX = (dx >= 0 ? 1 : -1) * overlapX;
            } else {
              pushY = (dy >= 0 ? 1 : -1) * overlapY;
            }

            el.x = Math.max(20, el.x + pushX);
            el.y = Math.max(20, el.y + pushY);
            hasMovement = true;
          }
        });
      });
    }

    // The loop above balances two competing forces — separating elements from
    // each other, and pushing elements away from relationship labels. On a
    // densely connected view (the OAuth dynamic sample: 12 relationships over
    // 4 nodes) they fight, the loop exits at maxIterations without converging,
    // and the label forces can leave two elements sitting on top of each other.
    //
    // Element overlap is a hard defect — two boxes drawn over one another.
    // Label crowding is cosmetic. So separation gets the last word.
    this.separateOverlappingElements(elements, ancestors);
  }

  /**
   * Guarantee the hard invariant that no two elements overlap, with no label
   * forces to fight against. Pinned pairs are left exactly as authored: an
   * explicit $x/$y is the user's decision and outranks tidiness.
   */
  private separateOverlappingElements(elements: PositionedElement[], ancestors?: Map<string, Set<string>>): void {
    const padding = 30;
    const maxIterations = 50;
    const isLocked = (el: PositionedElement) => el.element.metadata?.locked === 'true';
    const isPinned = (el: PositionedElement) =>
      isLocked(el) || el.element.metadata?.x !== undefined || el.element.metadata?.y !== undefined;
    const isContainmentPair = (a: PositionedElement, b: PositionedElement): boolean =>
      ancestors?.get(a.id)?.has(b.id) === true || ancestors?.get(b.id)?.has(a.id) === true;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let moved = false;

      for (let i = 0; i < elements.length; i++) {
        for (let j = i + 1; j < elements.length; j++) {
          const el1 = elements[i];
          const el2 = elements[j];
          if (isContainmentPair(el1, el2)) {
            continue;
          }

          // Bare geometric overlap only — no padding here, so this pass never
          // undoes the loop's spacing work, it only fixes real collisions.
          const overlapX = Math.min(el1.x + el1.width, el2.x + el2.width) - Math.max(el1.x, el2.x);
          const overlapY = Math.min(el1.y + el1.height, el2.y + el2.height) - Math.max(el1.y, el2.y);
          if (overlapX <= 0 || overlapY <= 0) {
            continue;
          }

          const el1Pinned = isPinned(el1);
          const el2Pinned = isPinned(el2);
          if (el1Pinned && el2Pinned) {
            continue;
          }

          // Separate along the axis needing the smaller correction.
          const c1 = el1.y + el1.height / 2;
          const c2 = el2.y + el2.height / 2;
          const c1x = el1.x + el1.width / 2;
          const c2x = el2.x + el2.width / 2;
          let pushX = 0;
          let pushY = 0;
          if (overlapX < overlapY) {
            pushX = (c2x >= c1x ? 1 : -1) * (overlapX + padding);
          } else {
            pushY = (c2 >= c1 ? 1 : -1) * (overlapY + padding);
          }

          if (el1Pinned) {
            el2.x = Math.max(20, el2.x + pushX);
            el2.y = Math.max(20, el2.y + pushY);
          } else if (el2Pinned) {
            el1.x = Math.max(20, el1.x - pushX);
            el1.y = Math.max(20, el1.y - pushY);
          } else {
            el1.x = Math.max(20, el1.x - pushX / 2);
            el1.y = Math.max(20, el1.y - pushY / 2);
            el2.x = Math.max(20, el2.x + pushX / 2);
            el2.y = Math.max(20, el2.y + pushY / 2);
          }
          moved = true;
        }
      }

      if (!moved) {
        return;
      }
    }
  }

  /**
   * Translate all positioned geometry so no x/y is negative. Re-wrapping
   * nested groups around manually positioned descendants can push a parent
   * container left of or above the canvas origin (child.x - pad < 0);
   * negative coordinates are rejected by the webview payload validator and
   * would be clipped by the SVG viewBox.
   */
  private normalizeOrigin(elements: PositionedElement[], boundaries: PositionedBoundary[]): void {
    let minX = 0;
    let minY = 0;
    for (const el of elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
    }
    for (const b of boundaries) {
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
    }
    if (minX === 0 && minY === 0) {
      return;
    }
    const dx = -minX;
    const dy = -minY;
    for (const el of elements) {
      el.x += dx;
      el.y += dy;
    }
    for (const b of boundaries) {
      b.x += dx;
      b.y += dy;
    }
  }

  /**
   * Re-wrap nested element groups (deployment nodes, nested containers) around
   * their descendants after manual positioning. Group boxes are sized by the
   * automatic layout; once a child is moved by $x/$y (or dragged in the
   * editor), the parent's box no longer encloses it and the diagram reads as
   * "broken out". Bottom-up, each group that has any manually positioned
   * member is expanded to the union of its own rect and its descendants'
   * rects (plus header/padding), so containment always reads correctly.
   * Groups with no manual positioning keep their computed geometry exactly
   * (auto-layout output is unchanged).
   */
  private rewrapNestedGroups(elements: PositionedElement[], view: C4View, always = false): void {
    const byId = new Map(elements.map(el => [el.id, el]));    const headerPad = 40; // space for the group label (mirrors layoutRecursive)
    const pad = 30;       // side/bottom breathing room

    const hasManualPosition = (el: C4Element): boolean =>
      el.metadata?.x !== undefined || el.metadata?.y !== undefined;
    const subtreeHasManualPosition = (el: C4Element): boolean =>
      hasManualPosition(el) || (el.children ?? []).some(subtreeHasManualPosition);

    const rewrap = (element: C4Element): void => {
      (element.children ?? []).forEach(rewrap);
      if (!element.children || element.children.length === 0) {
        return;
      }
      if (!always && !subtreeHasManualPosition(element)) {
        return;
      }
      const parent = byId.get(element.id);
      // A bottom-left label row (#326) is reserved under the children, not on top.
      const bottomPad = this.deploymentRows.get(element.id)?.reserve ?? pad;
      if (!parent) {
        return;
      }
      let minX = parent.x;
      let minY = parent.y;
      let maxX = parent.x + parent.width;
      let maxY = parent.y + parent.height;
      const include = (el: C4Element): void => {
        const positioned = byId.get(el.id);
        if (positioned) {
          minX = Math.min(minX, positioned.x - pad);
          minY = Math.min(minY, positioned.y - headerPad);
          maxX = Math.max(maxX, positioned.x + positioned.width + pad);
          maxY = Math.max(maxY, positioned.y + positioned.height + bottomPad);
        }
        (el.children ?? []).forEach(include);
      };
      element.children.forEach(include);
      parent.x = minX;
      parent.y = minY;
      parent.width = maxX - minX;
      parent.height = maxY - minY;
    };

    view.elements.forEach(rewrap);
  }

  private applyBoundaryManualGeometry(elements: PositionedElement[], boundaries: PositionedBoundary[]): void {
    if (boundaries.length === 0) {
      return;
    }

    const boundaryById = new Map(boundaries.map(b => [b.id, b]));
    const elementById = new Map(elements.map(el => [el.id, el]));

    // Build a top-down view of boundary containment. A child id may be a nested
    // boundary or a plain element.
    const childBoundaries = new Map<string, PositionedBoundary[]>();
    const childElements = new Map<string, PositionedElement[]>();
    for (const b of boundaries) {
      const nested: PositionedBoundary[] = [];
      const leafs: PositionedElement[] = [];
      for (const childId of b.boundary.elements) {
        const childBoundary = boundaryById.get(childId);
        if (childBoundary) {
          nested.push(childBoundary);
        } else {
          const childElement = elementById.get(childId);
          if (childElement) {
            leafs.push(childElement);
          }
        }
      }
      childBoundaries.set(b.id, nested);
      childElements.set(b.id, leafs);
    }

    // An authored $x/$y is an absolute coordinate, not an offset. A descendant
    // that carries one has already been placed at exactly that point in step 4,
    // so shifting it again by its parent frame's delta would move it somewhere
    // the author never asked for — the child escapes the frame on the next
    // render even though the editor showed it inside. Pinned descendants are
    // therefore left alone, and step 4.6 grows the frame to contain them.
    const hasFiniteMetadata = (value: string | undefined): boolean =>
      value !== undefined && Number.isFinite(parseFloat(value));
    const elementPinnedX = (el: PositionedElement): boolean => hasFiniteMetadata(el.element.metadata?.x);
    const elementPinnedY = (el: PositionedElement): boolean => hasFiniteMetadata(el.element.metadata?.y);
    const boundaryPinnedX = (b: PositionedBoundary): boolean => hasFiniteMetadata(b.boundary.metadata?.x);
    const boundaryPinnedY = (b: PositionedBoundary): boolean => hasFiniteMetadata(b.boundary.metadata?.y);

    // Shift every descendant (leaf elements and nested boundaries) by the same
    // delta so a manually positioned boundary moves as a rigid frame — except
    // descendants pinned by their own authored coordinate.
    const shiftBoundary = (b: PositionedBoundary, dx: number, dy: number): void => {
      const applyX = dx !== 0 && !boundaryPinnedX(b);
      const applyY = dy !== 0 && !boundaryPinnedY(b);
      if (applyX) { b.x += dx; }
      if (applyY) { b.y += dy; }
      for (const el of childElements.get(b.id) ?? []) {
        if (applyX && !elementPinnedX(el)) { el.x += dx; }
        if (applyY && !elementPinnedY(el)) { el.y += dy; }
      }
      for (const child of childBoundaries.get(b.id) ?? []) {
        shiftBoundary(child, applyX ? dx : 0, applyY ? dy : 0);
      }
    };

    // An authored $x/$y names the frame's DISPLAYED top-left, so the contents
    // move by the distance from where the frame would be painted without it:
    // the origin step 4.6 wraps around the contents, not the raw cluster
    // origin from the recursive layout. The editor drags from the painted
    // frame; measuring from the raw origin moved the contents by the
    // difference on the first pin (#346). A pinned descendant (frame or node)
    // is painted at its own coordinate, so that is what it contributes.
    const wrappedOrigin = (b: PositionedBoundary): { x: number; y: number } => {
      let minX = Infinity;
      let minY = Infinity;
      for (const el of childElements.get(b.id) ?? []) {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
      }
      for (const child of childBoundaries.get(b.id) ?? []) {
        const origin = wrappedOrigin(child);
        minX = Math.min(minX, boundaryPinnedX(child) ? parseFloat(child.boundary.metadata!.x!) : origin.x);
        minY = Math.min(minY, boundaryPinnedY(child) ? parseFloat(child.boundary.metadata!.y!) : origin.y);
      }
      if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
        return { x: b.x, y: b.y };
      }
      return {
        x: minX - DagreLayoutEngine.boundaryPaddingX,
        y: minY - DagreLayoutEngine.boundaryPaddingTop,
      };
    };

    for (const b of boundaries) {
      const metadata = b.boundary.metadata;
      if (!metadata) {
        continue;
      }
      const origin = wrappedOrigin(b);

      if (metadata.x !== undefined) {
        const x = parseFloat(metadata.x);
        if (Number.isFinite(x)) {
          const dx = x - origin.x;
          b.x = x;
          b.manualX = true;
          for (const el of childElements.get(b.id) ?? []) {
            if (!elementPinnedX(el)) { el.x += dx; }
          }
          for (const child of childBoundaries.get(b.id) ?? []) {
            shiftBoundary(child, dx, 0);
          }
        } else {
          this.reportWarning('C4X layout: ignored non-finite $x metadata on boundary; using the computed layout coordinate.');
        }
      }

      if (metadata.y !== undefined) {
        const y = parseFloat(metadata.y);
        if (Number.isFinite(y)) {
          const dy = y - origin.y;
          b.y = y;
          b.manualY = true;
          for (const el of childElements.get(b.id) ?? []) {
            if (!elementPinnedY(el)) { el.y += dy; }
          }
          for (const child of childBoundaries.get(b.id) ?? []) {
            shiftBoundary(child, 0, dy);
          }
        } else {
          this.reportWarning('C4X layout: ignored non-finite $y metadata on boundary; using the computed layout coordinate.');
        }
      }

      if (metadata.w !== undefined) {
        const w = parseFloat(metadata.w);
        if (Number.isFinite(w) && w >= 0) {
          b.manualWidth = w;
        } else {
          this.reportWarning('C4X layout: ignored non-finite $w metadata on boundary; using the computed layout size.');
        }
      }

      if (metadata.h !== undefined) {
        const h = parseFloat(metadata.h);
        if (Number.isFinite(h) && h >= 0) {
          b.manualHeight = h;
        } else {
          this.reportWarning('C4X layout: ignored non-finite $h metadata on boundary; using the computed layout size.');
        }
      }
    }
  }

  private adjustBoundariesToContainChildren(elements: PositionedElement[], boundaries: PositionedBoundary[], theme: C4Theme): void {
    const boundaryById = new Map(boundaries.map(b => [b.id, b]));

    // Process child-first: a parent frame must measure its nested child frames
    // only after those children have re-wrapped around their own contents.
    // flattenHierarchy pushes boundaries parent-first (pre-order), so a single
    // pass over that list sized each parent against its child's STALE frame —
    // a child that grew around a moved node hung outside its saved parent.
    // Depth is the number of ancestors, from the parent relation the engine
    // already has; the sort is stable, so siblings keep their pre-order.
    const parentOf = new Map<string, string>();
    for (const b of boundaries) {
      for (const childId of b.boundary.elements) {
        if (boundaryById.has(childId)) {
          parentOf.set(childId, b.id);
        }
      }
    }
    const nestingDepth = (b: PositionedBoundary): number => {
      let depth = 0;
      let ancestor = parentOf.get(b.id);
      while (ancestor !== undefined) {
        depth++;
        ancestor = parentOf.get(ancestor);
      }
      return depth;
    };
    const ordered = [...boundaries].sort((a, b) => nestingDepth(b) - nestingDepth(a));

    ordered.forEach(b => {
      // Collect leaf elements and nested boundary frames that belong to this boundary.
      const children: Array<PositionedElement | PositionedBoundary> = [];
      for (const childId of b.boundary.elements) {
        const childBoundary = boundaryById.get(childId);
        if (childBoundary) {
          children.push(childBoundary);
        } else {
          const childElement = elements.find(el => el.id === childId);
          if (childElement) {
            children.push(childElement);
          }
        }
      }

      if (children.length === 0) {
        // Nothing to contain: honour explicit sizes as-is, otherwise leave the
        // empty computed frame alone.
        if (b.manualWidth !== undefined) {
          b.width = b.manualWidth;
        }
        if (b.manualHeight !== undefined) {
          b.height = b.manualHeight;
        }
        // An empty frame still has to hold a bottom-left label (#324).
        const labelMinWidth = boundaryLabelMinWidth(theme, b.boundary.label, b.boundary.boundaryType);
        if (labelMinWidth > 0) {
          b.width = Math.max(b.width, labelMinWidth);
          b.height = Math.max(b.height, boundaryBottomPadding(theme, b.boundary.boundaryType));
        }
        return;
      }

      const paddingX = DagreLayoutEngine.boundaryPaddingX;
      const paddingTop = DagreLayoutEngine.boundaryPaddingTop; // Space for label/header
      // Room under the children for a bottom-left label (#324); 40 otherwise.
      const paddingBottom = boundaryBottomPadding(theme, b.boundary.boundaryType);

      // Compute the bounding box of the children in the boundary's coordinate
      // space. If the boundary has a manual position, b.x/b.y are already fixed
      // and the children were shifted to match.
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      children.forEach(child => {
        minX = Math.min(minX, child.x);
        minY = Math.min(minY, child.y);
        maxX = Math.max(maxX, child.x + child.width);
        maxY = Math.max(maxY, child.y + child.height);
      });

      // Position first: preserve manual overrides, otherwise auto-wrap to the
      // child bounding box.
      if (!b.manualX) {
        b.x = minX - paddingX;
      }
      if (!b.manualY) {
        b.y = minY - paddingTop;
      }

      // Size is then measured from the frame's ACTUAL origin out to the far
      // edge of the children — not from the child bounding box extent.
      //
      // Measuring the extent only works when the origin auto-wraps, because
      // then b.x === minX - paddingX and the two agree. Once the origin is
      // pinned by $x/$y, or a child is pinned away from the group, the gap
      // between the frame origin and the nearest child is real space the frame
      // has to span. Ignoring it sized the frame too small and children spilled
      // out of the right and bottom edges after save, even though the editor
      // had shown them inside.
      const requiredWidth = (maxX + paddingX) - b.x;
      const requiredHeight = (maxY + paddingBottom) - b.y;

      // Explicit $w/$h are minima, always clamped up so a manual frame can
      // never clip its contents.
      b.width = b.manualWidth !== undefined
        ? Math.max(b.manualWidth, requiredWidth)
        : requiredWidth;
      // A bottom-left label is never wider than its frame (#324); 0 for every other theme.
      b.width = Math.max(b.width, boundaryLabelMinWidth(theme, b.boundary.label, b.boundary.boundaryType));
      b.height = b.manualHeight !== undefined
        ? Math.max(b.manualHeight, requiredHeight)
        : requiredHeight;
    });
  }

  // --- Internal Hierarchy Helper Classes ---

  /**
   * Choose the root layout direction.
   *
   * Priority order:
   * 1. Explicit user direction from a `graph TB|LR|…` directive  → use it.
   * 2. Auto-detect based on top-level element count:
   *    - <= 4 top-level elements → LR (horizontal, easier to read for small diagrams)
   *    - >  4 top-level elements → TB (vertical, avoids wide scrolling)
   */
  autoDetectDirection(view: C4View): 'TB' | 'BT' | 'LR' | 'RL' {
    if (view.direction) {
      return view.direction;
    }
    // Count top-level elements only (not children of boundaries)
    const topLevelCount = view.elements.length;
    return topLevelCount <= 4 ? 'LR' : 'TB';
  }

  private buildHierarchy(view: C4View, sizeOf: (element: C4Element) => { width: number; height: number }): HierarchyNode {
    const rootDirection = this.autoDetectDirection(view);

    // Root Node
    const root: HierarchyNode = {
      id: 'root',
      children: [],
      isGroup: true,
      direction: rootDirection,
      width: 0,
      height: 0
    };

    const nodeMap = new Map<string, HierarchyNode>();

    // 1. Create Element Nodes
    const processElement = (elem: C4Element) => {
      const node: HierarchyNode = {
        id: elem.id,
        element: elem,
        children: [],
        isGroup: !!(elem.children && elem.children.length > 0),
        width: 0, height: 0
      };
      // Standard size, raised to the shape's minimum, taller for wrapped text (#340, #323)
      const size = sizeOf(elem);
      node.width = size.width;
      node.height = size.height;

      nodeMap.set(elem.id, node);

      if (elem.children) {
        elem.children.forEach(child => {
          const childNode = processElement(child);
          childNode.parent = node;
          node.children.push(childNode);
        });
      } else {
        // It's a leaf, add to root if not already added? 
        // Wait, processElement returns the node, parent handles push.
      }
      return node;
    };

    const topLevelElements = view.elements.map(processElement);

    // 2. process Boundaries (Clusters)
    // Boundaries in C4View are flat lists of IDs. We first create every
    // boundary node so nested boundaries can be looked up regardless of source
    // order, then wire children and promote only top-level boundaries to root.
    if (view.boundaries) {
      const nestedBoundaryIds = new Set<string>();

      // Pass 1: create boundary nodes and register them in the map.
      view.boundaries.forEach(b => {
        const boundaryNode: HierarchyNode = {
          id: b.id,
          boundary: b,
          isGroup: true,
          children: [],
          direction: b.direction as 'TB' | 'LR' || 'TB', // Default to TB if undefined
          width: 0, height: 0
        };
        nodeMap.set(b.id, boundaryNode);
      });

      // Pass 2: move each boundary's declared children into the boundary node.
      view.boundaries.forEach(b => {
        const boundaryNode = nodeMap.get(b.id);
        if (!boundaryNode) { return; }

        b.elements.forEach(elemId => {
          const childNode = nodeMap.get(elemId);
          if (!childNode) { return; }

          // Remove the child from its previous location.
          if (childNode.parent) {
            childNode.parent.children = childNode.parent.children.filter(c => c !== childNode);
          } else {
            const idx = topLevelElements.indexOf(childNode);
            if (idx >= 0) { topLevelElements.splice(idx, 1); }
          }

          childNode.parent = boundaryNode;
          boundaryNode.children.push(childNode);

          if (childNode.boundary) {
            nestedBoundaryIds.add(childNode.id);
          }
        });
      });

      // Pass 3: only boundaries that are not nested inside another boundary are
      // top-level children of the root diagram.
      view.boundaries.forEach(b => {
        if (nestedBoundaryIds.has(b.id)) { return; }
        const boundaryNode = nodeMap.get(b.id);
        if (!boundaryNode) { return; }
        boundaryNode.parent = root;
        root.children.push(boundaryNode);
      });
    }

    // Add remaining top level elements to root
    topLevelElements.forEach(el => {
      el.parent = root;
      root.children.push(el);
    });

    return root;
  }

  private layoutRecursive(node: HierarchyNode, allRelationships: C4Rel[], spacing: LayoutSpacing, theme: C4Theme) {
    // 1. Layout Children First (Bottom-Up)
    node.children.forEach(child => {
      if (child.isGroup) {
        this.layoutRecursive(child, allRelationships, spacing, theme);
      }
    });

    // 2. Layout Self
    if (node.isGroup) {
      // Create a graph for this group
      const g = new dagre.graphlib.Graph({ compound: true });
      const dir = node.direction || 'TB';

      // Adaptive tightening (audit P1-4): groups with few children (<=3) use
      // 75% of the preset separation so small diagrams don't float in white
      // space. Deterministic: depends only on the child count and the preset.
      const tighten = node.children.length <= 3 ? 0.75 : 1;

      g.setGraph({
        rankdir: dir,
        nodesep: Math.round(spacing.nodesep * tighten),
        ranksep: Math.round(spacing.ranksep * tighten),
        marginx: 40,
        marginy: 40
      });
      g.setDefaultEdgeLabel(() => ({}));

      // Add children nodes
      const childrenIds = new Set<string>();
      node.children.forEach(child => {
        childrenIds.add(child.id);
        g.setNode(child.id, {
          width: child.width,
          height: child.height
        });
      });

      // Add relationships relevant to THIS group
      // Relationship is relevant if:
      // A) Both ends are direct children of this group
      // B) One end is a child, other is "External" -> Proxy?
      // For simple "Nested Layout", we only consider edges strictly BETWEEN children of this group.
      // Because edges crossing boundaries are handled by parents or eventually global?
      // Actually, if we want 'rankdir' to affect ordering, we usually care about siblings.

      // MAPPING: If a relationship connects A -> B, and A is in Group1, B is in Group2.
      // In Group1 layout, B is unknown. No edge.
      // In Root layout, Group1 -> Group2.
      // This requires "Edge Promotion".

      // removed relevantRels unused var

      // We iterate all global relationships.
      // If 'from' is a descendant of ChildA, and 'to' is a descendant of ChildB (both children of current Node)
      // Then we add edge ChildA -> ChildB.

      allRelationships.forEach(rel => {
        const childSource = this.findDirectChildAncestor(node, rel.from, node.children);
        const childTarget = this.findDirectChildAncestor(node, rel.to, node.children);

        if (childSource && childTarget && childSource !== childTarget) {
          // This relationship implies an edge between two children of THIS node
          g.setEdge(childSource.id, childTarget.id);
        }
      });

      dagre.layout(g);

      // Update children's relative positions & Calculate Group Size
      const details = g.graph();
      node.width = (details.width || 0); // + padding? Dagre includes margins
      node.height = (details.height || 0);
      // A bottom-left boundary label is never wider than its frame (#324): the
      // parent places siblings by this width, so it must already include the label.
      if (node.boundary) {
        node.width = Math.max(node.width, boundaryLabelMinWidth(theme, node.boundary.label, node.boundary.boundaryType));
      }

      // Deployment notation (#326): a nested node's label row sits under its
      // children. The node is at least as wide as the row on one line (children
      // centred), and its bottom margin becomes the row's reserve.
      const row = node.element ? this.deploymentRows.get(node.id) : undefined;
      let rowShiftX = 0;
      if (row) {
        const minWidth = deploymentLabelMinWidth(theme, row.text, row.iconSlot);
        if (minWidth > node.width) {
          rowShiftX = (minWidth - node.width) / 2;
          node.width = minWidth;
        }
        row.reserve = deploymentLabelReserve(deploymentLabelLineCount(theme, row.text, row.iconSlot, node.width), row.iconSlot);
      }

      node.children.forEach(child => {
        const n = g.node(child.id);
        child.relX = n.x - n.width / 2; // Dagre centers nodes, we want top-left relative?
        // No, keep center relative to parent center?
        // Let's standardise on Top-Left relative to Parent Top-Left.
        // Dagre 0,0 is Top-Left of the graph.
        // n.x is Center.
        // So Left = n.x - width/2.
        child.relX = n.x - n.width / 2;
        child.relY = n.y - n.height / 2;

        // If the group has a Label (Boundary/Node), we might need to offset content?
        // The graph margins handle some, but if we render a Label text, we need space.
        if (row) {
          child.relX += rowShiftX;
        } else if (node.boundary || node.element) {
          // Add Header space
          child.relY += 40;
        }
      });

      if (row) {
        node.height = node.height - DEPLOYMENT_GROUP_MARGIN + row.reserve;
      } else if (node.boundary || node.element) {
        node.height += 40; // Expand for Label
      }
    }
  }

  private findDirectChildAncestor(parentNode: HierarchyNode, searchId: string, directChildren: HierarchyNode[]): HierarchyNode | undefined {
    // Find which of 'directChildren' contains 'searchId' (or lies on path to it)
    // Since we don't have explicit parent pointers easily accessible in this direction without a map,
    // But we built the tree.
    // Optimisation: We can just check the map.
    // But we need to know if the ancestor checks out.
    // Let's assume we have a global map? 
    // Actually, we can just search:
    for (const child of directChildren) {
      if (this.containsId(child, searchId)) { return child; }
    }
    return undefined;
  }

  private containsId(node: HierarchyNode, id: string): boolean {
    if (node.id === id) { return true; }
    if (node.children) {
      return node.children.some(c => this.containsId(c, id));
    }
    return false;
  }

  private flattenHierarchy(node: HierarchyNode, x: number, y: number,
    elements: PositionedElement[], boundaries: PositionedBoundary[]) {

    const absX = x + (node.relX || 0);
    const absY = y + (node.relY || 0);

    if (node.element) {
      elements.push({
        id: node.id,
        element: node.element,
        x: absX,
        y: absY,
        width: node.width,
        height: node.height
      });
    } else if (node.boundary) {
      boundaries.push({
        id: node.id,
        boundary: node.boundary,
        x: absX,
        y: absY,
        width: node.width,
        height: node.height
      });
    }

    node.children.forEach(child => {
      this.flattenHierarchy(child, absX, absY, elements, boundaries);
    });
  }

  /**
   * Route every relationship (#419). The obstacles of an edge are the leaf
   * elements other than its endpoints and their descendants: a line may cross
   * a boundary or a parent frame (deployment node, container with
   * components) to reach a nested element, but never an unrelated box.
   * Bidirectional pairs are routed with their lane offset, so `points` is
   * exactly the polyline SvgBuilder draws.
   */
  private routeEdges(rels: C4Rel[], elements: PositionedElement[], bounds: { width: number; height: number }, boundaries: PositionedBoundary[], theme: C4Theme): RoutedRelationship[] {
    const elMap = new Map<string, PositionedElement>();
    elements.forEach(e => elMap.set(e.id, e));

    // Positioned descendants of every element, from the model hierarchy.
    const descendants = new Map<string, Set<string>>();
    const collect = (element: C4Element): Set<string> => {
      const cached = descendants.get(element.id);
      if (cached) { return cached; }
      const set = new Set<string>();
      descendants.set(element.id, set);
      for (const child of element.children ?? []) {
        if (elMap.has(child.id)) { set.add(child.id); }
        collect(child).forEach(id => set.add(id));
      }
      return set;
    };
    elements.forEach(e => collect(e.element));
    const leaves = elements.filter(e => (descendants.get(e.id)?.size ?? 0) === 0);
    const box = (e: PositionedElement): Box => ({ x: e.x, y: e.y, width: e.width, height: e.height });
    // A bottom-left boundary label is ink no line may cross (#324); a top-left
    // label has no box, so those themes route exactly as before.
    const labelBoxes: Box[] = [];
    for (const b of boundaries) {
      const ink = boundaryLabelInkBox(theme, { x: b.x, y: b.y, width: b.width, height: b.height, label: b.boundary.label, boundaryType: b.boundary.boundaryType });
      if (ink) { labelBoxes.push(ink); }
    }
    // A nested deployment node's label row (#326) is ink too, except for an
    // edge that starts or ends at that node.
    const rowBoxes: Array<{ id: string; box: Box }> = [];
    for (const e of elements) {
      const row = this.deploymentRows.get(e.id);
      if (row && (descendants.get(e.id)?.size ?? 0) > 0) {
        rowBoxes.push({ id: e.id, box: deploymentLabelInkBox(theme, box(e), row.text, row.iconSlot) });
      }
    }

    // Bidirectional pairs (#140): each direction is routed with its lane
    // offset, so the offset line is what is checked against boxes and canvas.
    const pairs = findReversePairIds(rels.map(rel => ({ id: rel.id, relationship: rel })));

    return rels.map(rel => {
      const src = elMap.get(rel.from);
      const dst = elMap.get(rel.to);
      if (!src || !dst) { return { id: rel.id, relationship: rel, points: [] }; }

      const excluded = new Set<string>([src.id, dst.id]);
      descendants.get(src.id)?.forEach(id => excluded.add(id));
      descendants.get(dst.id)?.forEach(id => excluded.add(id));
      const obstacles = [
        ...leaves.filter(e => !excluded.has(e.id)).map(box),
        ...labelBoxes,
        ...rowBoxes.filter(r => r.id !== src.id && r.id !== dst.id).map(r => r.box),
      ];

      return {
        id: rel.id,
        relationship: rel,
        points: src === dst ? [] : routeAroundObstacles(box(src), box(dst), obstacles, {
          bounds,
          laneOffset: pairs.has(rel.id) ? BIDIRECTIONAL_EDGE_OFFSET : 0,
        })
      };
    });
  }

  /**
   * Async layout wrapper for compatibility with existing code
   * Dagre layout is actually synchronous, this just wraps it in a Promise
   */
  async layout(view: C4View, options: LayoutOptions = {}): Promise<LayoutResult> {
    return this.layoutSync(view, options);
  }
}

interface HierarchyNode {
  id: string;
  children: HierarchyNode[];
  parent?: HierarchyNode;
  isGroup: boolean;
  element?: C4Element;
  boundary?: C4Boundary;

  // Layout props
  direction?: string;
  width: number;
  height: number;
  relX?: number; // Relative to parent
  relY?: number;
}

export const dagreLayoutEngine = new DagreLayoutEngine();
