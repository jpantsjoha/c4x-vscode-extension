/**
 * Label collision detection and positioning for relationship labels.
 *
 * Tracks placed labels and finds non-overlapping positions for new ones.
 */

interface LabelRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export class LabelCollisionTracker {
    private positions: LabelRect[] = [];

    /** Clear all tracked labels (call at the start of each diagram build). */
    reset(): void {
        this.positions = [];
    }

    /** Check if a rectangle overlaps with any previously registered label. */
    checkCollision(x: number, y: number, width: number, height: number): boolean {
        return this.positions.some(pos =>
            x < pos.x + pos.width &&
            x + width > pos.x &&
            y < pos.y + pos.height &&
            y + height > pos.y
        );
    }

    /**
     * Find a non-overlapping position for a label, trying several offsets.
     * Returns the first position that does not collide, or the original
     * position as a last resort.
     */
    findNonOverlappingPosition(baseX: number, baseY: number, width: number, height: number): { x: number; y: number } {
        const offsets = [
            { x: 0, y: 0 },           // Original position
            { x: 0, y: -25 },         // Above
            { x: 0, y: 25 },          // Below
            { x: -30, y: 0 },         // Left
            { x: 30, y: 0 },          // Right
            { x: -20, y: -20 },       // Top-left
            { x: 20, y: -20 },        // Top-right
            { x: -20, y: 20 },        // Bottom-left
            { x: 20, y: 20 },         // Bottom-right
        ];

        for (const offset of offsets) {
            const testX = baseX + offset.x;
            const testY = baseY + offset.y;

            if (!this.checkCollision(testX - width / 2, testY - height / 2, width, height)) {
                return { x: testX, y: testY };
            }
        }

        // If all positions collide, use original position (last resort)
        return { x: baseX, y: baseY };
    }

    /** Register a label position so future labels avoid it. */
    registerPosition(x: number, y: number, width: number, height: number): void {
        this.positions.push({
            x: x - width / 2,
            y: y - height / 2,
            width,
            height
        });
    }
}
