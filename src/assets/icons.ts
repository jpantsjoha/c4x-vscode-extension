// Common SVG paths for C4 Model Sprites
// Viewbox assumed to be 0 0 100 100 for normalization unless specified

import { GCP_SPRITES } from './gcp-icons';
import { AZURE_SPRITES } from './azure-icons';
import { AWS_SPRITES } from './aws-icons';

export interface Sprite {
    body: string;
    viewBox?: string;
    preserveColor?: boolean;
}

export const SPRITES: Record<string, string | Sprite> = {
    ...GCP_SPRITES,
    ...AZURE_SPRITES,
    ...AWS_SPRITES,
    // User / Person (Standard C4)
    'person': '<circle cx="50" cy="25" r="15" fill="currentColor"/><path d="M 25 80 Q 25 45 50 45 Q 75 45 75 80 Z" fill="currentColor"/>',
    'user': '<circle cx="50" cy="25" r="15" fill="currentColor"/><path d="M 25 80 Q 25 45 50 45 Q 75 45 75 80 Z" fill="currentColor"/>',
    
    // Database (Cylinder)
    'database': '<path d="M20,30 L20,70 A30,15 0 0,0 80,70 L80,30 A30,15 0 0,0 20,30 A30,15 0 0,0 80,30 A30,15 0 0,0 20,30 Z M20,30 A30,15 0 0,1 80,30" fill="none" stroke="currentColor" stroke-width="8"/>',
    'db': '<path d="M20,30 L20,70 A30,15 0 0,0 80,70 L80,30 A30,15 0 0,0 20,30 A30,15 0 0,0 80,30 A30,15 0 0,0 20,30 Z M20,30 A30,15 0 0,1 80,30" fill="none" stroke="currentColor" stroke-width="8"/>',

    // Cloud (AWS-ish)
    'cloud': '<path d="M25,60 A15,15 0 0,1 25,30 A20,20 0 0,1 55,30 A15,15 0 0,1 55,60 Z" stroke="currentColor" stroke-width="5" fill="none" transform="scale(1.5) translate(-15, 0)"/>',
    // 'aws' is now in AWS_SPRITES, but we can override or ensure fallback
    
    // Server / Node
    'node': '<rect x="20" y="20" width="60" height="60" rx="5" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="30" cy="30" r="3" fill="currentColor"/><circle cx="30" cy="45" r="3" fill="currentColor"/>',
    'server': '<rect x="20" y="20" width="60" height="60" rx="5" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="30" cy="30" r="3" fill="currentColor"/><circle cx="30" cy="45" r="3" fill="currentColor"/>',

    // Docker
    'container': '<path d="M10,50 L30,50 L30,70 L10,70 Z M35,50 L55,50 L55,70 L35,70 Z M60,50 L80,50 L80,70 L60,70 Z M35,25 L55,25 L55,45 L35,45 Z" fill="currentColor"/>',
    'docker': '<path d="M10,50 L30,50 L30,70 L10,70 Z M35,50 L55,50 L55,70 L35,70 Z M60,50 L80,50 L80,70 L60,70 Z M35,25 L55,25 L55,45 L35,45 Z" fill="currentColor"/>',
    
    // Fallback/Generic
    'component': '<rect x="25" y="25" width="50" height="50" fill="none" stroke="currentColor" stroke-width="5"/><rect x="15" y="35" width="20" height="10" fill="currentColor"/><rect x="15" y="55" width="20" height="10" fill="currentColor"/>'
};

/**
 * Smart sprite lookup.
 * 1. Exact match
 * 2. Vendor prefix match (aws-s3 -> s3)
 * 3. Suffix match (simple-storage-service-s3 -> s3)
 */
export function getSprite(name?: string): string | Sprite | undefined {
    if (!name) {return undefined;}
    const key = name.toLowerCase();
    
    // 1. Exact match
    if (SPRITES[key]) {
        return SPRITES[key];
    }

    // 2. Try adding vendor prefixes if user typed simplified name like "s3"
    const vendors = ['aws', 'azure', 'gcp', 'google'];
    for (const vendor of vendors) {
        if (SPRITES[`${vendor}-${key}`]) {
            return SPRITES[`${vendor}-${key}`];
        }
    }

    // 3. Fuzzy match / Suffix search (expensive but convenient)
    // Find key that ends with "-key" or is "*-key"
    const suffix = `-${key}`;
    const found = Object.keys(SPRITES).find(k => k.endsWith(suffix));
    if (found) {
        return SPRITES[found];
    }

    return undefined;
}
