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
   * Increased sizes for better visual appearance matching official C4 diagrams
   * @see examples/SystemContext.png for reference sizing
   */
  private getStandardElementSize(element: C4Element): { width: number; height: number } {
    switch (element.type) {
      case 'Person':
        return { width: 200, height: 160 }; // Taller for person icon + text
      case 'SoftwareSystem':
        return { width: 260, height: 140 }; // Wider for longer labels
      case 'Container':
        return { width: 240, height: 130 }; // Slightly smaller than systems
      case 'Component':
        return { width: 220, height: 120 }; // Smallest for components
      case 'DeploymentNode':
        // Nodes are containers/clusters, size determined by children usually.
        // But if empty, give it a default size.
        return { width: 300, height: 200 };
      default:
        return { width: 260, height: 140 }; // Default to Software System size
    }
  }

  /**
   * Synchronous layout - Dagre layout is actually synchronous
   * Used for Markdown rendering where async is not supported
   */
  layoutSync(view: C4View): LayoutResult {
    // Create a new directed graph with compound support
    const g = new dagre.graphlib.Graph({ compound: true });

    // Set graph configuration with improved spacing for text labels
    g.setGraph({
      rankdir: 'TB',           // Top to bottom
      nodesep: 100,            // Horizontal spacing
      ranksep: 120,            // Vertical spacing
      marginx: 80,             // Margins
      marginy: 80,             // Margins
      edgesep: 20,             // Spacing between edge labels
    });

    // Default node configuration
    g.setDefaultEdgeLabel(() => ({}));

    // Map to store all elements (including nested ones) for lookup
    const elementMap = new Map<string, C4Element>();

    // Helper to recursively add elements to graph
    const processElement = (elem: C4Element, parentId?: string) => {
      elementMap.set(elem.id, elem);

      // Determine if this is a cluster (has children)
      const isCluster = elem.children && elem.children.length > 0;

      if (isCluster) {
        g.setNode(elem.id, {
          label: elem.label,
          clusterLabelPos: 'top',
          style: 'fill: none; stroke: #333; stroke-width: 1.5px;',
          paddingTop: 80,     // Increased padding for better label separation
          paddingBottom: 50,
          paddingLeft: 40,
          paddingRight: 40
        });

        // Recursively process children
        elem.children!.forEach(child => processElement(child, elem.id));
      } else {
        const { width, height } = this.getStandardElementSize(elem);
        g.setNode(elem.id, {
          label: elem.label,
          width,
          height,
        });
      }

      // Set parent relationship
      if (parentId) {
        g.setParent(elem.id, parentId);
      }
    };

    // 1. Process all elements (recursive)
    view.elements.forEach(elem => processElement(elem));

    // 2. Add Legacy Boundaries (Clusters) 
    // Note: Legacy boundaries overlap with the "parent" concept. 
    // If an element is already parented by a Node, it shouldn't be parented by a Boundary?
    // We assume boundaries are at the top level or compatible.
    if (view.boundaries) {
      view.boundaries.forEach(boundary => {
        g.setNode(boundary.id, {
          label: boundary.label,
          clusterLabelPos: 'bottom',
          style: 'fill: none; stroke: #333; stroke-width: 1.5px; stroke-dasharray: 5, 5;',
          paddingTop: 60,
          paddingBottom: 50,
          paddingLeft: 40,
          paddingRight: 40
        });

        // Set parent for elements inside this boundary
        // Only if they don't already have a parent (from nesting)
        boundary.elements.forEach(elemId => {
          if (!g.parent(elemId)) {
            g.setParent(elemId, boundary.id);
          }
        });
      });
    }

    // 3. Add Edges
    view.relationships.forEach(rel => {
      // Ensure both ends exist in the graph (safety check)
      if (g.node(rel.from) && g.node(rel.to)) {
        g.setEdge(rel.from, rel.to, {
          label: rel.label || '',
        });
      }
    });

    // Run layout algorithm (synchronous)
    dagre.layout(g);

    // Flatten elements list for rendering (Parents first)
    const flattenedElements: PositionedElement[] = [];
    const flattenAndPosition = (elem: C4Element) => {
      const node = g.node(elem.id);
      // Safety check: node might not exist if filtered out?
      if (node) {
        flattenedElements.push({
          id: elem.id,
          element: elem,
          x: node.x - node.width / 2,
          y: node.y - node.height / 2,
          width: node.width,
          height: node.height,
        });
      }
      
      if (elem.children) {
        elem.children.forEach(child => flattenAndPosition(child));
      }
    };

    view.elements.forEach(elem => flattenAndPosition(elem));

    // Extract positioned boundaries (clusters)
    let boundaries: PositionedBoundary[] | undefined;
    if (view.boundaries && view.boundaries.length > 0) {
      boundaries = view.boundaries.map(boundary => {
        const node = g.node(boundary.id);
        return {
          id: boundary.id,
          boundary,
          x: node.x - node.width / 2,
          y: node.y - node.height / 2,
          width: node.width,
          height: node.height,
        };
      });
    }

    // Extract routed relationships
    const relationships: RoutedRelationship[] = view.relationships.map(rel => {
      // Check existence
      if (!g.hasEdge(rel.from, rel.to)) {
          return { id: rel.id, points: [], relationship: rel };
      }
      const edge = g.edge(rel.from, rel.to);
      const points: Point[] = edge.points || [];

      return {
        id: rel.id,
        points,
        relationship: rel,
      };
    });

    // Calculate total dimensions
    const graphAttrs = g.graph();
    const width = (graphAttrs.width || 0) + 160;  // Add margins
    const height = (graphAttrs.height || 0) + 160; // Add margins

    return {
      elements: flattenedElements,
      relationships,
      boundaries,
      width,
      height,
    };
  }

  /**
   * Async layout wrapper for compatibility with existing code
   * Dagre layout is actually synchronous, this just wraps it in a Promise
   */
  async layout(view: C4View): Promise<LayoutResult> {
    return this.layoutSync(view);
  }

}

export const dagreLayoutEngine = new DagreLayoutEngine();
