#!/bin/bash

# Define the base directory (root of the repo)
REPO_ROOT="$(dirname "$0")/.."
SCRIPT_PATH="$REPO_ROOT/scripts/verify_c4x.js"

# Ensure the verification script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "Error: Verification script not found at $SCRIPT_PATH"
    exit 1
fi

# Ensure the project is built (check for out/src/model/C4ModelBuilder.js)
BUILDER_CHECK="$REPO_ROOT/out/src/model/C4ModelBuilder.js"
if [ ! -f "$BUILDER_CHECK" ]; then
    echo "⚠️  Project build not found. Attempting to build..."
    cd "$REPO_ROOT" && npm run build
    if [ $? -ne 0 ]; then
        echo "❌ Build failed. Cannot run verification."
        exit 1
    fi
fi

# Function to run verification
run_verification() {
    # If no args, find all md files
    if [ "$#" -eq 0 ]; then
        echo "Finding all markdown files in $REPO_ROOT..."
        # Use -exec to handle filenames with spaces correctly
        find "$REPO_ROOT" -type f -name "*.md" \
            -not -path "*/node_modules/*" \
            -not -path "*/out/*" \
            -not -path "*/dist/*" \
            -not -path "*/.github/*" \
            -not -path "*/.vscode/*" \
            -not -path "*/.vscode-test/*" \
            -exec node "$SCRIPT_PATH" "{}" +
    else
        # Pass provided args directly
        node "$SCRIPT_PATH" "$@"
    fi
}

run_verification "$@"
