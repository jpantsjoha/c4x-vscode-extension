import * as dagre from 'dagre';
import { C4Element, C4Rel, C4View, C4Boundary } from '../model/C4Model';

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
const LAYOUT_SPACING_PRESETS: Record<LayoutSpacingPreset, LayoutSpacing> = {
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
  points: Point[];
  relationship: C4Rel;
}

export interface Point {
  x: number;
  y: number;
}

export class DagreLayoutEngine {
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
      case 'DeploymentNode': return { width: 300, height: 200 };
      default: return { width: 260, height: 140 };
    }
  }

  /**
   * Layout the view using a recursive strategy to support nested directions and manual positioning.
   */
  layoutSync(view: C4View): LayoutResult {
    // 1. Build a Unified Hierarchy (Nodes + Boundaries)
    // We treat Boundaries as "Cluster Nodes" that contain other nodes.
    const hierarchy = this.buildHierarchy(view);

    // 2. Recursive Layout (Bottom-Up)
    // This calculates sizes for clusters based on their inner layout.
    // And determines relative positions of children within their parent.
    // Node/rank separations come from the `c4x.layout.spacing` preset.
    this.layoutRecursive(hierarchy, view.relationships, resolveLayoutSpacing());

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
    this.preventOverlapsAndClipLabels(elements, view.relationships, this.buildAncestorMap(view));

    // 4.5.5. Honor manual boundary geometry ($x/$y/$w/$h) authored on subgraphs.
    // This must run before auto-wrapping so that a manual position shifts the
    // boundary frame and its descendants together, and manual sizes act as
    // minima that are clamped to contain children.
    this.applyBoundaryManualGeometry(elements, boundaries);

    // 4.6. Adjust boundaries to wrap their nested elements
    if (boundaries && boundaries.length > 0) {
      this.adjustBoundariesToContainChildren(elements, boundaries);
    }

    // 4.7. Re-wrap nested element groups around manually positioned descendants
    this.rewrapNestedGroups(elements, view);

    // 4.8. Normalize origin: re-wrapping can push a parent container left of
    // or above the canvas origin (child.x - pad < 0). The SVG viewBox and the
    // webview payload validator both require non-negative coordinates.
    this.normalizeOrigin(elements, boundaries);

    // 5. Route Relationships
    // For the final diagram, we need edge points.
    // Since we composited the layout, we don't have a single global graph with all points.
    // We can use a final global Dagre pass with "fixed" node positions to route edges?
    // OR we can just draw straight lines for now (simpler for V1 of strict nested).
    // Dagre's edge routing is nice. 
    // Let's try to run a "Routing Only" pass on the valid global graph?
    // That involves creating a graph with nodes at fixed positions.
    const relationships = this.routeEdges(view.relationships, elements);

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

    return {
      elements,
      relationships,
      boundaries,
      // Adaptive breathing room on each dimension: 30px for small diagrams
      // (< 5 elements), 50px otherwise (was a flat 50px — audit finding:
      // excessive canvas white space)
      width: width + resolveCanvasPadding(elements.length),
      height: height + resolveCanvasPadding(elements.length)
    };
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

  private preventOverlapsAndClipLabels(elements: PositionedElement[], relationships: C4Rel[], ancestors?: Map<string, Set<string>>): void {
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

          const isOverlapping = el.x < lblMaxX + labelPadding &&
                                lblMinX - labelPadding < el.x + el.width &&
                                el.y < lblMaxY + labelPadding &&
                                lblMinY - labelPadding < el.y + el.height;

          if (isOverlapping && !isLocked(el)) {
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
  private rewrapNestedGroups(elements: PositionedElement[], view: C4View): void {
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
      if (!subtreeHasManualPosition(element)) {
        return;
      }
      const parent = byId.get(element.id);
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
          maxY = Math.max(maxY, positioned.y + positioned.height + pad);
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

    for (const b of boundaries) {
      const metadata = b.boundary.metadata;
      if (!metadata) {
        continue;
      }

      if (metadata.x !== undefined) {
        const x = parseFloat(metadata.x);
        if (Number.isFinite(x)) {
          const dx = x - b.x;
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
          const dy = y - b.y;
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

  private adjustBoundariesToContainChildren(elements: PositionedElement[], boundaries: PositionedBoundary[]): void {
    const boundaryById = new Map(boundaries.map(b => [b.id, b]));

    boundaries.forEach(b => {
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
        return;
      }

      const paddingX = 40;
      const paddingTop = 60; // Space for label/header
      const paddingBottom = 40;

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

  private buildHierarchy(view: C4View): HierarchyNode {
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
      // Apply standard size
      const size = this.getStandardElementSize(elem);
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

  private layoutRecursive(node: HierarchyNode, allRelationships: C4Rel[], spacing: LayoutSpacing) {
    // 1. Layout Children First (Bottom-Up)
    node.children.forEach(child => {
      if (child.isGroup) {
        this.layoutRecursive(child, allRelationships, spacing);
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
        if (node.boundary || node.element) {
          // Add Header space
          child.relY += 40;
        }
      });

      if (node.boundary || node.element) {
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

  private routeEdges(rels: C4Rel[], elements: PositionedElement[]): RoutedRelationship[] {
    // Simple direct routing for v1 of Recursive Layout
    // Ideally we would do orthogonal routing here.
    const elMap = new Map<string, PositionedElement>();
    elements.forEach(e => elMap.set(e.id, e));

    return rels.map(rel => {
      const src = elMap.get(rel.from);
      const dst = elMap.get(rel.to);
      if (!src || !dst) { return { id: rel.id, relationship: rel, points: [] }; }

      // Center-to-Center
      const p1 = { x: src.x + src.width / 2, y: src.y + src.height / 2 };
      const p2 = { x: dst.x + dst.width / 2, y: dst.y + dst.height / 2 };

      return {
        id: rel.id,
        relationship: rel,
        points: [p1, p2]
      };
    });
  }

  /**
   * Async layout wrapper for compatibility with existing code
   * Dagre layout is actually synchronous, this just wraps it in a Promise
   */
  async layout(view: C4View): Promise<LayoutResult> {
    return this.layoutSync(view);
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
