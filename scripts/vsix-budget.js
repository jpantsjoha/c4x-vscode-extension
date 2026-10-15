'use strict';
// The shipping artefact's ceiling: the package target is <= 2.5 MB as a VSIX —
// decimal megabytes, the unit README uses, so 2,500,000 bytes.
// It is a different measure from the raw-bundle figure esbuild.config.js alerts on.
//
// Asserted in the two places that hold the artefact: scripts/test-vsix-smoke.js
// (the package job, on three operating systems) and
// scripts/validate-public-content.js --vsix (make validate-public-artifact, inside
// make check-full). The second also binds README's published package size to the
// same file, so the figure cannot drift from the artefact (#203).
const fs = require('fs');

const VSIX_BUDGET_BYTES = 2_500_000;
const README_PACKAGE_CLAIM = /^- \*\*No second runtime\.\*\* The package is about ([0-9]+\.[0-9]{2}) MB/m;

function megabytes(bytes) {
  return (bytes / 1_000_000).toFixed(2);
}

/**
 * Findings for the artefact at vsixPath. With readmePath, README's package-size
 * sentence must state the artefact's size to two decimals. Empty means within
 * budget and, if asked, that README agrees with the file.
 */
function vsixFindings(vsixPath, readmePath) {
  const findings = [];
  const size = fs.statSync(vsixPath).size;
  if (size > VSIX_BUDGET_BYTES) findings.push(`package-size-${size}-bytes-exceeds-${VSIX_BUDGET_BYTES}`);
  if (readmePath) {
    const claim = fs.readFileSync(readmePath, 'utf8').match(README_PACKAGE_CLAIM);
    if (!claim) findings.push('readme-package-size-claim-missing');
    else if (claim[1] !== megabytes(size)) findings.push(`readme-says-${claim[1]}-MB-but-the-package-is-${megabytes(size)}-MB`);
  }
  return findings;
}

module.exports = { VSIX_BUDGET_BYTES, README_PACKAGE_CLAIM, megabytes, vsixFindings };
