#!/bin/bash

# =============================================================================
# C4X Public Repo Sync Script
# =============================================================================
# This script syncs the "Core Codebase" from this private repo to a 
# separate public repository folder. It ensures no private history or 
# internal files are leaked.
#
# Usage: ./scripts/publish-to-public.sh ../path-to-public-repo
# =============================================================================

set -e

SOURCE_DIR=$(pwd)
DEST_DIR=$1

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

if [ -z "$DEST_DIR" ]; then
    echo -e "${RED}Error: Destination directory required.${NC}"
    echo "Usage: ./scripts/publish-to-public.sh <path-to-public-repo>"
    exit 1
fi

if [ ! -d "$DEST_DIR/.git" ]; then
    echo -e "${RED}Error: Destination is not a git repository.${NC}"
    echo "Please clone/init your public repo at $DEST_DIR first."
    exit 1
fi

echo -e "${BLUE}🚀 Starting Sync to Public Repo: $DEST_DIR${NC}"

# -----------------------------------------------------------------------------
# 1. Define the Allowlist (What goes public)
# -----------------------------------------------------------------------------
# Using rsync with an include/exclude list is safer than cp
# We exclude everything by default (*) and only include specific patterns

rsync -avm --delete \
    --include='src/***' \
    --include='assets/***' \
    --include='snippets/***' \
    --include='syntaxes/***' \
    --include='samples/***' \
    --include='test/***' \
    --include='scripts/***' \
    --exclude='scripts/publish-to-public.sh' \
    --exclude='scripts/create-issues-phase9.sh' \
    --include='docs/' \
    --include='docs/images/***' \
    --include='docs/marketplace/***' \
    --include='docs/c4x-syntax.md' \
    --include='docs/USER-GUIDE.md' \
    --include='docs/GEMINI_GUIDE.md' \
    --include='docs/FAQ.md' \
    --include='docs/TROUBLESHOOTING.md' \
    --include='docs/STATUS.md' \
    --include='docs/ROADMAP.md' \
    --include='docs/QUICK-START.md' \
    --include='docs/EXAMPLES-PLANTUML.md' \
    --include='docs/EXAMPLES.md' \
    --include='ABOUT.md' \
    --include='GEMINI.md' \
    --include='EXAMPLES.md' \
    --include='EXAMPLES-PLANTUML.md' \
    --include='package.json' \
    --include='tsconfig.json' \
    --include='esbuild.config.js' \
    --include='playwright.config.ts' \
    --include='Makefile' \
    --include='.eslintrc.json' \
    --include='.markdownlint.json' \
    --include='language-configuration.json' \
    --include='README.md' \
    --include='LICENSE' \
    --include='CHANGELOG.md' \
    --include='CONTRIBUTING.md' \
    --include='c4x-*.vsix' \
    --exclude='publish-vsce.md' \
    --include='.gitignore' \
    --include='.vscodeignore' \
    --include='.vscode/extensions.json' \
    --include='.vscode/launch.json' \
    --include='.vscode/tasks.json' \
    --include='.github/***' \
    --exclude='*' \
    "$SOURCE_DIR/" "$DEST_DIR/"

echo -e "${BLUE}📂 Files synced.${NC}"

# -----------------------------------------------------------------------------
# 2. Optional: Create/Copy Gemini Context File
# -----------------------------------------------------------------------------
# If you want to publish a specific markdown file about the AI generation
if [ -f "$SOURCE_DIR/GEMINI_CONTEXT.md" ]; then
    cp "$SOURCE_DIR/GEMINI_CONTEXT.md" "$DEST_DIR/"
    echo -e "${BLUE}🤖 GEMINI_CONTEXT.md copied.${NC}"
fi

# -----------------------------------------------------------------------------
# 3. Public-ify README.md (Replace private repo URLs)
# -----------------------------------------------------------------------------
if [ -f "$DEST_DIR/README.md" ]; then
    echo -e "${BLUE}🔄 Updating README.md URLs for public repo...${NC}"
    # Replace private repo name with public repo name
    # c4model-vscode-extension -> c4x-vscode-extension
    perl -i -pe 's/c4model-vscode-extension/c4x-vscode-extension/g' "$DEST_DIR/README.md"
    
    # Replace publisher ID if present
    # c4x-contributors -> jpantsjoha
    perl -i -pe 's/c4x-contributors/jpantsjoha/g' "$DEST_DIR/README.md"
    
    echo -e "${BLUE}✅ README.md updated.${NC}"
fi

# -----------------------------------------------------------------------------
# 4. Global Scrub: Replace private repo references in ALL Markdown files
# -----------------------------------------------------------------------------
echo -e "${BLUE}🧹 Scrubbing private repo references from Markdown files...${NC}"

# Find all Markdown files in the destination
find "$DEST_DIR" -type f -name "*.md" | while read -r file; do
    # Replace references to the private repo name
    if grep -q "c4model-vscode-extension" "$file"; then
        echo "  - Cleaning: $(basename "$file")"
        perl -i -pe 's/c4model-vscode-extension/c4x-vscode-extension/g' "$file"
    fi
done

echo -e "${BLUE}✅ Scrub complete.${NC}"

# -----------------------------------------------------------------------------
# 5. Git Status in Destination
# -----------------------------------------------------------------------------
echo -e "${BLUE}📊 Status of Public Repo:${NC}"
cd "$DEST_DIR"
git status

echo -e "${GREEN}✅ Sync Complete!${NC}"
echo "Review the changes in '$DEST_DIR' and commit/push when ready."
