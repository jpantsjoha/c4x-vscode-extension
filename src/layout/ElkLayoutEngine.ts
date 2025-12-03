import ELK, { ElkNode, ElkExtendedEdge, ElkShape, ElkPoint } from 'elkjs';
import { C4Element, C4Rel, C4View } from '../model/C4Model';

export interface LayoutResult {
  elements: PositionedElement[];
  relationships: RoutedRelationship[];
  width: number;
  height: number;
}

export interface PositionedElement extends ElkShape {
  id: string;
  element: C4Element;
}

export interface RoutedRelationship {
  id: string;
  points: ElkPoint[];
  relationship: C4Rel;
}

export class ElkLayoutEngine {
  private elk = new ELK();

  async layout(view: C4View): Promise<LayoutResult> {
    const graph: ElkNode = {
      id: 'root',
      // eslint-disable-next-line @typescript-eslint/naming-convention
      layoutOptions: {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.spacing.nodeNode': '80',
        'elk.layered.spacing.nodeNodeBetweenLayers': '100',
        'elk.edgeRouting': 'ORTHOGONAL',
      },
      children: view.elements.map(elem => this.toElkNode(elem)),
      edges: view.relationships.map(rel => this.toElkEdge(rel)),
    };

    const result = await this.elk.layout(graph);

    return {
      elements: (result.children || []).map((node: ElkNode) => ({
        ...node,
        id: node.id,
        element: view.elements.find(e => e.id === node.id)!,
      })) as PositionedElement[],
      relationships: (result.edges || []).map((edge: ElkExtendedEdge) => ({
        id: edge.id,
        points: (edge.sections && edge.sections[0].bendPoints) || [],
        relationship: view.relationships.find(r => r.id === edge.id)!,
      })),
      width: result.width || 0,
      height: result.height || 0,
    };
  }

  private toElkNode(element: C4Element): ElkNode {
    const labelLines = element.label.split('<br/>');
    const width = Math.max(...labelLines.map(line => line.length * 8)) + 40;
    const height = labelLines.length * 20 + 40;

    return {
      id: element.id,
      width,
      height,
      labels: [{ text: element.label }],
    };
  }

  private toElkEdge(relationship: C4Rel): ElkExtendedEdge {
    return {
      id: relationship.id,
      sources: [relationship.from],
      targets: [relationship.to],
    };
  }
}

export const elkLayoutEngine = new ElkLayoutEngine();
