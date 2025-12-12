import { C4ViewType } from '../parser';

export type C4ElementType = 'Person' | 'SoftwareSystem' | 'Container' | 'Component' | 'DeploymentNode';

export type RelType = 'uses' | 'async' | 'sync';

export interface C4Element {
    id: string;
    label: string;
    type: C4ElementType;
    tags?: string[];
    technology?: string;
    description?: string;
    sprite?: string;
    children?: C4Element[];
    metadata?: Record<string, string>;
}

export interface C4Rel {
    id: string;
    from: string;
    to: string;
    label: string;
    technology?: string;
    relType: RelType;
    order?: number; // Sequence order for dynamic diagrams
}

export interface C4Boundary {
    id: string;
    label: string;
    direction?: string;
    elements: string[]; // IDs of elements within this boundary
}

export interface C4View {
    type: C4ViewType;
    elements: C4Element[];
    relationships: C4Rel[];
    boundaries?: C4Boundary[];
}

export interface C4Model {
    workspace: string;
    views: C4View[];
}
