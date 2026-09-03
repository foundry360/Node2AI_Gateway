#!/bin/bash

# Node2AI Architecture Diagram Generator
# This script generates visual diagrams from PlantUML and Mermaid source files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS_DIR="$SCRIPT_DIR"
OUTPUT_DIR="$DOCS_DIR/images"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}📊 Node2AI Architecture Diagram Generator${NC}"
echo ""

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Check for PlantUML
if command -v plantuml &> /dev/null; then
    echo -e "${GREEN}✓${NC} PlantUML found"
    
    echo -e "${YELLOW}Generating PlantUML diagrams...${NC}"
    
    if [ -f "$DOCS_DIR/ARCHITECTURE.puml" ]; then
        echo "  → Generating from ARCHITECTURE.puml..."
        plantuml -tpng -o "$OUTPUT_DIR" "$DOCS_DIR/ARCHITECTURE.puml" 2>/dev/null || \
        plantuml -tpng "$DOCS_DIR/ARCHITECTURE.puml" -output "$OUTPUT_DIR" 2>/dev/null || \
        echo "    ⚠️  Could not generate PNG, trying SVG..."
        plantuml -tsvg -o "$OUTPUT_DIR" "$DOCS_DIR/ARCHITECTURE.puml" 2>/dev/null || \
        plantuml -tsvg "$DOCS_DIR/ARCHITECTURE.puml" -output "$OUTPUT_DIR" 2>/dev/null || \
        echo "    ⚠️  Could not generate SVG"
        
        if [ -f "$OUTPUT_DIR/ARCHITECTURE.png" ] || [ -f "$OUTPUT_DIR/Node2AI_Complete_Architecture.png" ]; then
            echo -e "  ${GREEN}✓${NC} PNG diagram generated"
        fi
        if [ -f "$OUTPUT_DIR/ARCHITECTURE.svg" ] || [ -f "$OUTPUT_DIR/Node2AI_Complete_Architecture.svg" ]; then
            echo -e "  ${GREEN}✓${NC} SVG diagram generated"
        fi
    fi
else
    echo -e "${YELLOW}⚠${NC} PlantUML not found"
    echo "  Install with:"
    echo "    - macOS: brew install plantuml"
    echo "    - Linux: sudo apt-get install plantuml"
    echo "    - Docker: docker run -d -p 8080:8080 plantuml/plantuml-server:jetty"
fi

# Check for Mermaid CLI
if command -v mmdc &> /dev/null; then
    echo -e "${GREEN}✓${NC} Mermaid CLI found"
    echo -e "${YELLOW}Generating Mermaid diagrams...${NC}"
    
    # Extract Mermaid diagrams from ARCHITECTURE.md
    if [ -f "$DOCS_DIR/ARCHITECTURE.md" ]; then
        echo "  → Extracting Mermaid diagrams from ARCHITECTURE.md..."
        
        # Create temporary directory for Mermaid files
        MERMAID_TMP="$OUTPUT_DIR/mermaid_temp"
        mkdir -p "$MERMAID_TMP"
        
        # Extract mermaid code blocks (simplified extraction)
        awk '/```mermaid/,/```/' "$DOCS_DIR/ARCHITECTURE.md" | \
        sed 's/```mermaid//g' | \
        sed 's/```//g' | \
        awk '/graph|sequenceDiagram|flowchart/{flag=1} flag; /```/{flag=0}' > "$MERMAID_TMP/diagram1.mmd" || true
        
        if [ -s "$MERMAID_TMP/diagram1.mmd" ]; then
            mmdc -i "$MERMAID_TMP/diagram1.mmd" -o "$OUTPUT_DIR/mermaid-diagram1.png" 2>/dev/null && \
            echo -e "  ${GREEN}✓${NC} Mermaid diagram 1 generated" || \
            echo -e "  ${YELLOW}⚠${NC} Could not generate Mermaid diagram"
        fi
        
        rm -rf "$MERMAID_TMP"
    fi
else
    echo -e "${YELLOW}⚠${NC} Mermaid CLI (mmdc) not found"
    echo "  Install with: npm install -g @mermaid-js/mermaid-cli"
fi

# Check for online services
echo ""
echo -e "${BLUE}Alternative Options:${NC}"
echo ""
echo "1. PlantUML Online:"
echo "   → Copy content from docs/ARCHITECTURE.puml"
echo "   → Paste at: http://www.plantuml.com/plantuml/uml/"
echo ""
echo "2. Mermaid Live Editor:"
echo "   → Extract mermaid code blocks from docs/ARCHITECTURE.md"
echo "   → Paste at: https://mermaid.live/"
echo ""
echo "3. VS Code Extensions:"
echo "   → PlantUML extension: vscode-plantuml"
echo "   → Mermaid Preview extension"
echo ""

if [ -d "$OUTPUT_DIR" ] && [ "$(ls -A $OUTPUT_DIR 2>/dev/null)" ]; then
    echo -e "${GREEN}✓${NC} Diagrams generated in: $OUTPUT_DIR"
    ls -lh "$OUTPUT_DIR"
else
    echo -e "${YELLOW}⚠${NC} No diagrams generated. Please install required tools or use online services."
fi

echo ""
echo -e "${GREEN}Done!${NC}"

