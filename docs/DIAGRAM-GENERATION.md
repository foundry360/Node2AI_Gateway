# Generating Visual Architecture Diagrams

This guide explains how to generate visual diagram images from the Node2AI architecture documentation.

## Quick Start

Run the automated script:

```bash
cd docs
./generate-diagrams.sh
```

This will generate PNG/SVG files in the `docs/images/` directory.

## Manual Generation Methods

### Method 1: PlantUML (Recommended)

**Install PlantUML:**

```bash
# macOS
brew install plantuml

# Linux (Ubuntu/Debian)
sudo apt-get install plantuml

# Using Java (if plantuml package not available)
wget http://sourceforge.net/projects/plantuml/files/plantuml.jar/download -O plantuml.jar
java -jar plantuml.jar ARCHITECTURE.puml
```

**Generate Diagram:**

```bash
cd docs
plantuml -tpng ARCHITECTURE.puml
# Output: ARCHITECTURE.png

# For SVG (scalable vector graphics)
plantuml -tsvg ARCHITECTURE.puml
# Output: ARCHITECTURE.svg
```

**Online Option:**

1. Open: http://www.plantuml.com/plantuml/uml/
2. Copy content from `docs/ARCHITECTURE.puml`
3. Paste and click "Submit"
4. Download the generated image

### Method 2: Mermaid CLI

**Install Mermaid CLI:**

```bash
npm install -g @mermaid-js/mermaid-cli
```

**Generate from Markdown:**

The `ARCHITECTURE.md` file contains multiple Mermaid diagrams. To extract and generate them:

```bash
# Install dependencies
npm install -g @mermaid-js/mermaid-cli

# Generate from extracted mermaid code
mmdc -i diagram.mmd -o diagram.png
```

**Online Option:**

1. Open: https://mermaid.live/
2. Extract mermaid code blocks from `ARCHITECTURE.md`
3. Paste into the editor
4. Click "Download PNG" or "Download SVG"

### Method 3: VS Code Extensions

**Install Extensions:**

1. **PlantUML** (by jebbs)
   - Extension ID: `jebbs.plantuml`
   - Usage: Open `.puml` file, press `Alt+D` to preview

2. **Mermaid Preview** (by vstirbu)
   - Extension ID: `vstirbu.vscode-mermaid-preview`
   - Usage: Open markdown with mermaid code blocks, click preview

3. **Markdown Preview Mermaid Support** (by bierner)
   - Extension ID: `bierner.markdown-mermaid`
   - Usage: Preview markdown files with embedded mermaid diagrams

## Docker Option

### PlantUML Server (Docker)

Run PlantUML in a container:

```bash
docker run -d -p 8080:8080 plantuml/plantuml-server:jetty
```

Then access: http://localhost:8080/

### Mermaid CLI (Docker)

```bash
docker run --rm -v $(pwd):/data minlag/mermaid-cli \
  mmdc -i /data/docs/diagram.mmd -o /data/docs/images/diagram.png
```

## Output Formats

### PNG (Raster Image)

- Best for: Presentations, documents, web pages
- Quality: Fixed resolution
- File size: Larger than SVG

### SVG (Vector Image)

- Best for: Scalable graphics, print quality, web
- Quality: Infinite scaling
- File size: Smaller, scalable

### PDF (Document)

```bash
# PlantUML to PDF
plantuml -tpdf ARCHITECTURE.puml
```

## Recommended Tools

### Desktop Applications

1. **Draw.io / diagrams.net**
   - Free, web-based or desktop
   - Supports importing PlantUML
   - Export: PNG, SVG, PDF

2. **Visual Studio Code**
   - Extensions for both PlantUML and Mermaid
   - Live preview
   - Export capabilities

3. **IntelliJ IDEA / WebStorm**
   - Built-in PlantUML support
   - Diagram generation

### Online Tools

1. **PlantUML Online**: http://www.plantuml.com/plantuml/uml/
2. **Mermaid Live Editor**: https://mermaid.live/
3. **Kroki** (Supports multiple formats): https://kroki.io/

## File Locations

- **Source Files:**
  - `docs/ARCHITECTURE.md` - Main documentation with Mermaid diagrams
  - `docs/ARCHITECTURE.puml` - Standalone PlantUML diagram file

- **Generated Images:**
  - `docs/images/` - Generated PNG/SVG files (created by script)

## Troubleshooting

### PlantUML Issues

**Java not found:**

```bash
# Install Java
brew install openjdk  # macOS
sudo apt-get install openjdk-11-jdk  # Linux
```

**Font issues:**

```bash
# Install fonts
brew install fontconfig  # macOS
sudo apt-get install fonts-dejavu  # Linux
```

### Mermaid CLI Issues

**Node.js version:**

```bash
# Ensure Node.js 16+ is installed
node --version
npm install -g @mermaid-js/mermaid-cli
```

**Puppeteer issues (for PNG generation):**

```bash
# Install Chromium dependencies
sudo apt-get install chromium-browser  # Linux
```

## Integration with Documentation

### Adding Diagrams to README

```markdown
![Node2AI Architecture](docs/images/ARCHITECTURE.png)
```

### GitHub/GitLab Rendering

Both GitHub and GitLab render Mermaid diagrams directly in Markdown:

````markdown
```mermaid
graph TB
  A --> B
```
````

````

No image generation needed for these platforms!

## Best Practices

1. **Use SVG for diagrams** - Better quality and smaller file sizes
2. **Keep source files** - `.puml` and `.mmd` files for future edits
3. **Version control** - Commit source files, not generated images (add to `.gitignore`)
4. **Automate** - Use the `generate-diagrams.sh` script in CI/CD
5. **Document** - Keep this guide updated with new diagram types

## CI/CD Integration

Add to `.github/workflows/docs.yml`:

```yaml
- name: Generate Architecture Diagrams
  run: |
    brew install plantuml
    cd docs
    ./generate-diagrams.sh
    git add images/*.png images/*.svg
    git commit -m "docs: Update architecture diagrams"
````
