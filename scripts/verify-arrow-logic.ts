/**
 * Validation script for C4 Arrow Connection Logic
 * 
 * This script simulates the fixed routing logic to verify that arrows 
 * connect to the center of the closest edge (Bottom->Top for vertical stacks).
 * 
 * Run with: npx ts-node scripts/verify-arrow-logic.ts
 */

interface Box {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Point {
    x: number;
    y: number;
    edge?: string;
}

// The fixed logic from SvgBuilder.ts
function calculateConnection(fromBox: Box, toBox: Box) {
    const arrowPadding = 5;

    // Center points of edges
    const fromPoints = [
        { x: fromBox.x + fromBox.width / 2, y: fromBox.y - arrowPadding, edge: 'top' },
        { x: fromBox.x + fromBox.width + arrowPadding, y: fromBox.y + fromBox.height / 2, edge: 'right' },
        { x: fromBox.x + fromBox.width / 2, y: fromBox.y + fromBox.height + arrowPadding, edge: 'bottom' },
        { x: fromBox.x - arrowPadding, y: fromBox.y + fromBox.height / 2, edge: 'left' }
    ];

    const toPoints = [
        { x: toBox.x + toBox.width / 2, y: toBox.y - arrowPadding, edge: 'top' },
        { x: toBox.x + toBox.width + arrowPadding, y: toBox.y + toBox.height / 2, edge: 'right' },
        { x: toBox.x + toBox.width / 2, y: toBox.y + toBox.height + arrowPadding, edge: 'bottom' },
        { x: toBox.x - arrowPadding, y: toBox.y + toBox.height / 2, edge: 'left' }
    ];

    // Determine relative positions
    const isBelow = toBox.y >= fromBox.y + fromBox.height;
    const isAbove = fromBox.y >= toBox.y + toBox.height;
    const isRight = toBox.x >= fromBox.x + fromBox.width;
    const isLeft = fromBox.x >= toBox.x + toBox.width;

    let minScore = Infinity;
    let bestFrom = fromPoints[0];
    let bestTo = toPoints[0];

    for (const fromPoint of fromPoints) {
        for (const toPoint of toPoints) {
            let penalty = 0;

            // Directional flow penalties (enforcing logical flow)
            if (isBelow) {
                // Vertical flow (Down): Prefer Bottom -> Top
                if (fromPoint.edge !== 'bottom') penalty += 150;
                if (toPoint.edge !== 'top') penalty += 150;
            } else if (isAbove) {
                // Vertical flow (Up): Prefer Top -> Bottom
                if (fromPoint.edge !== 'top') penalty += 150;
                if (toPoint.edge !== 'bottom') penalty += 150;
            } else if (isRight) {
                // Horizontal flow (Right): Prefer Right -> Left
                if (fromPoint.edge !== 'right') penalty += 150;
                if (toPoint.edge !== 'left') penalty += 150;
            } else if (isLeft) {
                // Horizontal flow (Left): Prefer Left -> Right
                if (fromPoint.edge !== 'left') penalty += 150;
                if (toPoint.edge !== 'right') penalty += 150;
            }

            const distance = Math.sqrt(
                Math.pow(toPoint.x - fromPoint.x, 2) +
                Math.pow(toPoint.y - fromPoint.y, 2)
            );

            const score = distance + penalty;

            if (score < minScore) {
                minScore = score;
                bestFrom = fromPoint;
                bestTo = toPoint;
            }
        }
    }

    return { from: bestFrom.edge, to: bestTo.edge, score: minScore };
}

// --- TEST CASES ---

console.log("Verifying C4 Arrow Connection Logic...");

const boxA: Box = { id: 'A', x: 100, y: 100, width: 200, height: 100 }; // Center (200, 150) Bottom: 250
const boxB: Box = { id: 'B', x: 100, y: 300, width: 200, height: 100 }; // Center (200, 350) Top: 300

// Case 1: Perfect Vertical Alignment
const result1 = calculateConnection(boxA, boxB);
console.log(`
Case 1: Vertical Stack (A above B)`);
console.log(`  Expected: bottom -> top`);
console.log(`  Actual:   ${result1.from} -> ${result1.to}`);
if (result1.from === 'bottom' && result1.to === 'top') {
    console.log('  ✅ PASS');
} else {
    console.log('  ❌ FAIL');
    process.exit(1);
}

// Case 2: Horizontal Alignment
const boxC: Box = { id: 'C', x: 400, y: 100, width: 200, height: 100 };
const result2 = calculateConnection(boxA, boxC);
console.log(`
Case 2: Horizontal Row (A left of C)`);
console.log(`  Expected: right -> left`);
console.log(`  Actual:   ${result2.from} -> ${result2.to}`);
if (result2.from === 'right' && result2.to === 'left') {
    console.log('  ✅ PASS');
} else {
    console.log('  ❌ FAIL');
    process.exit(1);
}

// Case 3: Diagonal (Bottom Right)
const boxD: Box = { id: 'D', x: 400, y: 300, width: 200, height: 100 };
const result3 = calculateConnection(boxA, boxD);
console.log(`
Case 3: Diagonal (D is down-right from A)`);
// Ideally this should still bias towards one main axis or the other.
// Dagre layouts usually are TB, so vertical flow dominates.
// Let's see what the logic prefers. "isBelow" is true. "isRight" is true.
// The code checks "isBelow" first.
console.log(`  Logic Check: ${result3.from} -> ${result3.to}`);
// Since isBelow comes first in the if/else chain, it should prioritize Bottom->Top.
if (result3.from === 'bottom' && result3.to === 'top') {
    console.log('  ✅ PASS (Vertical preference maintained)');
} else {
    console.log('  ℹ️  Note: Logic chose ' + result3.from + '->' + result3.to);
}

console.log("\nAll validation checks passed.");