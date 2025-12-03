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
  private getStandardElementSize(elementType: string): { width: number; height: number } {
    switch (elementType) {
      case 'Person':
        return { width: 200, height: 160 }; // Taller for person icon + text
      case 'Software System':
        return { width: 260, height: 140 }; // Wider for longer labels
      case 'Container':
        return { width: 240, height: 130 }; // Slightly smaller than systems
      case 'Component':
        return { width: 220, height: 120 }; // Smallest for components
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

    // 1. Add Boundaries (Clusters) first
    if (view.boundaries) {
      view.boundaries.forEach(boundary => {
        g.setNode(boundary.id, {
          label: boundary.label,
          clusterLabelPos: 'bottom',
          style: 'fill: none; stroke: #333; stroke-width: 1.5px; stroke-dasharray: 5, 5;',
          // Add padding for the cluster
          paddingTop: 40,
          paddingBottom: 40,
          paddingLeft: 30,
          paddingRight: 30
        });
      });
    }

    // 2. Add Nodes and set Parents
    view.elements.forEach(elem => {
      const { width, height } = this.getStandardElementSize(elem.type);

      g.setNode(elem.id, {
        label: elem.label,
        width,
        height,
      });

      // If element belongs to a boundary, set it as parent
      if (view.boundaries) {
        const parentBoundary = view.boundaries.find(b => b.elements.includes(elem.id));
        if (parentBoundary) {
          g.setParent(elem.id, parentBoundary.id);
        }
      }
    });

    // 3. Add Edges
    view.relationships.forEach(rel => {
      g.setEdge(rel.from, rel.to, {
        label: rel.label || '',
      });
    });

    // Run layout algorithm (synchronous)
    dagre.layout(g);

    // Extract positioned elements
    const elements: PositionedElement[] = view.elements.map(elem => {
      const node = g.node(elem.id);
      return {
        id: elem.id,
        element: elem,
        x: node.x - node.width / 2,
        y: node.y - node.height / 2,
        width: node.width,
        height: node.height,
      };
    });

    // Extract positioned boundaries (clusters)
    let boundaries: PositionedBoundary[] | undefined;
    if (view.boundaries && view.boundaries.length > 0) {
      boundaries = view.boundaries.map(boundary => {
        const node = g.node(boundary.id);
        // Dagre gives center x,y for clusters too, need to convert to top-left
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
      const edge = g.edge(rel.from, rel.to);

      // Dagre provides edge points as {x, y} coordinates
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
      elements,
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
