#!/bin/bash

# C4X Screenshot Preparation Script
# Opens VS Code with the correct layout for taking marketplace screenshots.

# Function to open a screenshot scenario
open_scenario() {
    local scenario_name=$1
    local file_path=$2
    
    echo "📸 Preparing Scenario: $scenario_name"
    echo "Opening $file_path..."
    
    # Open the file
    code "$file_path"
    
    # Wait for it to open
    sleep 1
    
    # Trigger the C4X preview command (requires user to have the extension installed/debug running)
    echo "👉 Action required: Press 'Ctrl+K V' (or Cmd+K V) to open the preview."
    echo "👉 Action required: Arrange the editor and preview side-by-side (Split Right)."
    echo "👉 Action required: Take the screenshot."
    echo "Press Enter to continue to the next scenario..."
    read
}

# Scenario 1: C4X Syntax
open_scenario "1. C4X Syntax & Preview" "samples/system-context/banking-system.c4x"

# Scenario 2: PlantUML Support
open_scenario "2. PlantUML Support" "samples/system-context/banking-system.puml"

# Scenario 3: Container Diagram (for Themes)
open_scenario "3. Container Diagram & Themes" "samples/container/ecommerce-containers.c4x"

echo "✅ All scenarios prepared. You can now process the screenshots."
