import dagre from 'dagre';
import { C4Element, C4Rel, C4View, C4Boundary } from '../model/C4Model';

export interface PositionedBoundary {
  id: string;
  boundary: C4Boundary;
  x: number;
  y: number;
  width: number;
  height: number;
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
    this.layoutRecursive(hierarchy, view.relationships);

    // 3. Flatten and Calculate Absolute Positions
    const elements: PositionedElement[] = [];
    const boundaries: PositionedBoundary[] = [];

    this.flattenHierarchy(hierarchy, 0, 0, elements, boundaries);

    // 4. Manual Positioning Overrides (Post-Layout Nudge)
    // We apply this AFTER flattening to respect global coordinates if provided, 
    // or relative optimizations could be done here.
    // For now, if metadata $x and $y exist, we override.
    elements.forEach(el => {
      if (el.element.metadata) {
        if (el.element.metadata.x) { el.x = parseFloat(el.element.metadata.x); }
        if (el.element.metadata.y) { el.y = parseFloat(el.element.metadata.y); }
      }
    });

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

    return {
      elements,
      relationships,
      boundaries,
      width: width + 100,
      height: height + 100
    };
  }

  // --- Internal Hierarchy Helper Classes ---

  private buildHierarchy(view: C4View): HierarchyNode {
    // Root Node
    const root: HierarchyNode = {
      id: 'root',
      children: [],
      isGroup: true,
      direction: 'TB', // Default global direction
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
    // Boundaries in C4View are flat lists of IDs.
    // We need to move the corresponding Nodes into the BoundaryNode.
    if (view.boundaries) {
      view.boundaries.forEach(b => {
        const boundaryNode: HierarchyNode = {
          id: b.id,
          boundary: b,
          isGroup: true,
          children: [],
          direction: b.direction as 'TB' | 'LR' || 'TB', // Default to TB if undefined
          width: 0, height: 0
        };

        b.elements.forEach(elemId => {
          const elemNode = nodeMap.get(elemId);
          if (elemNode) {
            // Move to boundary
            if (elemNode.parent) {
              // Remove from old parent
              elemNode.parent.children = elemNode.parent.children.filter(c => c !== elemNode);
            } else {
              // Was top level
              const idx = topLevelElements.indexOf(elemNode);
              if (idx >= 0) { topLevelElements.splice(idx, 1); }
            }
            elemNode.parent = boundaryNode;
            boundaryNode.children.push(elemNode);
          }
        });
        nodeMap.set(b.id, boundaryNode);

        // Setup relationships: Boundaries are top level unless nested?
        // As per current model, boundaries are top level groupings.
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

  private layoutRecursive(node: HierarchyNode, allRelationships: C4Rel[]) {
    // 1. Layout Children First (Bottom-Up)
    node.children.forEach(child => {
      if (child.isGroup) {
        this.layoutRecursive(child, allRelationships);
      }
    });

    // 2. Layout Self
    if (node.isGroup) {
      // Create a graph for this group
      const g = new dagre.graphlib.Graph({ compound: true });
      const dir = node.direction || 'TB';

      g.setGraph({
        rankdir: dir,
        nodesep: 60,
        ranksep: 80,
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
