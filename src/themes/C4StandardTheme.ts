/**
 * C4 Standard Theme - Official Structurizr / C4-PlantUML Visual Convention
 *
 * Filled boxes with white text, matching the most widely recognized C4
 * model rendering style used by Structurizr, C4-PlantUML, and c4model.com.
 *
 * Colors are imported from the shared c4-palette so that the AI visual
 * prompt builder (PromptBuilder.ts) uses the exact same hex values.
 *
 * @see https://c4model.com
 * @see https://structurizr.com
 */

import { C4Theme } from './Theme';
import {
    C4_PERSON_FILL,
    C4_PERSON_STROKE,
    C4_SYSTEM_FILL,
    C4_SYSTEM_STROKE,
    C4_EXTERNAL_FILL,
    C4_EXTERNAL_STROKE,
    C4_CONTAINER_FILL,
    C4_CONTAINER_STROKE,
    C4_COMPONENT_FILL,
    C4_COMPONENT_STROKE,
    C4_NODE_FILL,
    C4_NODE_STROKE,
    C4_BOUNDARY_TEXT,
    C4_TEXT_WHITE,
    C4_TEXT_DARK,
    C4_ARROW_STROKE,
    C4_ARROW_TEXT,
    C4_BACKGROUND,
} from './c4-palette';

export const C4StandardTheme: C4Theme = {
    name: 'c4-standard',
    displayName: 'C4 Standard',
    description: 'Filled boxes matching Structurizr / C4-PlantUML defaults',
    colors: {
        // Person - dark blue fill, white text
        person: {
            fill: C4_PERSON_FILL,
            stroke: C4_PERSON_STROKE,
            text: C4_TEXT_WHITE,
        },
        // Internal Software System - blue fill, white text
        softwareSystem: {
            fill: C4_SYSTEM_FILL,
            stroke: C4_SYSTEM_STROKE,
            text: C4_TEXT_WHITE,
        },
        // External System - grey fill, white text
        externalSystem: {
            fill: C4_EXTERNAL_FILL,
            stroke: C4_EXTERNAL_STROKE,
            text: C4_TEXT_WHITE,
        },
        // Container - medium blue fill, white text
        container: {
            fill: C4_CONTAINER_FILL,
            stroke: C4_CONTAINER_STROKE,
            text: C4_TEXT_WHITE,
        },
        // Component - light blue fill, dark text
        component: {
            fill: C4_COMPONENT_FILL,
            stroke: C4_COMPONENT_STROKE,
            text: C4_TEXT_DARK,
        },
        // Deployment Node - white fill, grey border
        deploymentNode: {
            fill: C4_NODE_FILL,
            stroke: C4_NODE_STROKE,
            text: C4_BOUNDARY_TEXT,
        },
        // External variants - grey fill, white text
        externalPerson: {
            fill: C4_EXTERNAL_FILL,
            stroke: C4_EXTERNAL_STROKE,
            text: C4_TEXT_WHITE,
        },
        externalContainer: {
            fill: C4_EXTERNAL_FILL,
            stroke: C4_EXTERNAL_STROKE,
            text: C4_TEXT_WHITE,
        },
        externalComponent: {
            fill: C4_EXTERNAL_FILL,
            stroke: C4_EXTERNAL_STROKE,
            text: C4_TEXT_WHITE,
        },
        // Relationships / arrows
        relationship: {
            stroke: C4_ARROW_STROKE,
            text: C4_ARROW_TEXT,
        },
        background: C4_BACKGROUND,
    },
    styles: {
        borderRadius: 10,           // Rounded corners (standard C4 convention)
        borderWidth: 2,             // Visible border
        fontSize: 14,
        fontFamily: 'Arial, sans-serif',
        shadowEnabled: false,       // No decorative shadows
    },
};
