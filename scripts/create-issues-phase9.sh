#!/bin/bash
# scripts/create-issues-phase9.sh
# Creates Phase 9 issues on the public repo

REPO="jpantsjoha/c4x-vscode-extension"

echo "🚀 Creating Phase 9 issues in $REPO..."

# Feature: Manual Positioning
gh issue create --repo $REPO \
  --title "Phase 9: Manual Positioning Layout Hints" \
  --body "As a user, I want to control the exact position of elements to fix 'disorderly' layouts.

**Requirements:**
- Support relative positioning syntax (e.g. \`System A left_of System B\`)
- Support coordinate hints in metadata?
- Fix node overlapping in complex graphs" \
  --label "enhancement" --label "layout" --label "phase-9"

# Feature: Direction Control
gh issue create --repo $REPO \
  --title "Phase 9: Nested Subgraph Direction Control" \
  --body "As a user, I want to mix layout directions (TB/LR) within subgraphs.

**Requirements:**
- Allow \`direction LR\` inside a subgraph even if parent is \`TB\`.
- Ensure rendering engine respects nested directionality." \
  --label "enhancement" --label "layout" --label "phase-9"

# Feature: Grid Layout
gh issue create --repo $REPO \
  --title "Phase 9: Grid Layout Option" \
  --body "As a user, I want a strict grid layout mode to align elements neatly.

**Requirements:**
- Add \`layout: grid\` option.
- Force nodes into rows/columns." \
  --label "enhancement" --label "layout" --label "phase-9"

echo "✅ Phase 9 issues created!"
