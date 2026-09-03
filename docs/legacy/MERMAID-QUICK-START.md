# Quick Start: Viewing Mermaid Diagrams

## Method 1: Mermaid Live Editor (Easiest - No Installation)

### Step-by-Step:

1. **Open Mermaid Live Editor**
   - Go to: https://mermaid.live/
   - (No signup or installation required)

2. **Copy Mermaid Code from ARCHITECTURE.md**
   - Open `docs/ARCHITECTURE.md` in your editor
   - Find any diagram starting with ````mermaid`
   - Copy the code between ``mermaid` and ``

   **Example - First Diagram:**

   ```mermaid
   graph TB
       subgraph "Client Layer"
           WEB[Web Dashboard<br/>Next.js 14<br/>Port 3000]
           API_CLIENTS[API Clients<br/>REST/OpenAI Compatible]
           MOBILE[Mobile Apps<br/>SDK Integration]
       end
       ...
   ```

3. **Paste into Mermaid Live Editor**
   - Paste the copied code into the left panel
   - The diagram will render automatically in the right panel

4. **Export the Diagram**
   - Click **"Download PNG"** or **"Download SVG"** button
   - Save to your `docs/images/` folder

---

## Method 2: GitHub/GitLab (Automatic Rendering)

### Step-by-Step:

1. **View on GitHub**
   - Open `docs/ARCHITECTURE.md` on GitHub
   - All Mermaid diagrams render automatically!
   - No action needed - just scroll through the file

2. **GitLab or Bitbucket**
   - Similar to GitHub, Mermaid renders automatically
   - Just view the markdown file in the repository

**Note:** This method is view-only, but perfect for documentation!

---

## Method 3: VS Code with Extension

### Step-by-Step:

1. **Install Mermaid Extension**
   - Open VS Code
   - Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)
   - Search for: **"Mermaid Preview"** by vstirbu
   - Click **Install**

2. **Open ARCHITECTURE.md**
   - Open `docs/ARCHITECTURE.md` in VS Code

3. **Preview Diagram**
   - Click the **"Open Preview"** button (top right of editor)
   - Or press: `Cmd+Shift+V` (Mac) / `Ctrl+Shift+V` (Windows/Linux)
   - Mermaid diagrams will render in the preview

4. **Export from Preview**
   - Right-click on rendered diagram
   - Select **"Copy Image"** or use browser export options

**Alternative Extension:**

- **"Markdown Preview Mermaid Support"** by bierner
- Automatically renders Mermaid in markdown preview

---

## Method 4: Mermaid CLI (Command Line)

### Step-by-Step:

1. **Install Mermaid CLI**

   ```bash
   npm install -g @mermaid-js/mermaid-cli
   ```

2. **Extract Mermaid Code to File**

   ```bash
   cd docs

   # Extract first diagram (you can do this manually too)
   # Create a file: architecture-main.mmd
   # Copy the mermaid code from ARCHITECTURE.md
   ```

3. **Create Mermaid File**
   - Create `docs/architecture-main.mmd`
   - Copy the mermaid code block content (without the ```mermaid markers)

   **Example content:**

   ```
   graph TB
       subgraph "Client Layer"
           WEB[Web Dashboard<br/>Next.js 14<br/>Port 3000]
           API_CLIENTS[API Clients<br/>REST/OpenAI Compatible]
           MOBILE[Mobile Apps<br/>SDK Integration]
       end
       ...
   ```

4. **Generate PNG**

   ```bash
   mmdc -i architecture-main.mmd -o images/architecture-main.png
   ```

5. **Generate SVG (Better Quality)**
   ```bash
   mmdc -i architecture-main.mmd -o images/architecture-main.svg
   ```

---

## Method 5: Online Mermaid Viewer Tools

### Option A: Mermaid.js.org Live Editor

1. Go to: https://mermaid.live/
2. Paste Mermaid code
3. Export image

### Option B: Mermaid Chart (New Editor)

1. Go to: https://www.mermaidchart.com/
2. Sign up (free)
3. Import or paste code
4. Export/download

### Option C: Kroki (Multiple Diagram Types)

1. Go to: https://kroki.io/
2. Select "Mermaid" format
3. Paste code
4. Get image URL or download

---

## Quick Reference: Diagram Locations in ARCHITECTURE.md

The `docs/ARCHITECTURE.md` file contains **14 Mermaid diagrams**. Here are the main ones:

1. **High-Level Architecture** (Lines ~21-100)
   - Complete system overview
   - All layers and components

2. **Frontend Layer** (Lines ~145-165)
   - Web application components

3. **API Gateway Layer** (Lines ~170-210)
   - Middleware stack and routes

4. **Data Layer Architecture** (Lines ~275-305)
   - Database schema overview

5. **Blockchain Integration** (Lines ~310-365)
   - Hyperledger Fabric network

6. **Chat Completion Request Flow** (Sequence Diagram)
   - End-to-end request lifecycle

7. **Blockchain Recording Flow** (Sequence Diagram)
   - Transaction recording process

8. **Deployment Architecture** (Development & Production)
   - Infrastructure layouts

9. **Security Architecture**
   - Authentication & authorization

10. **Data Sanitization Pipeline**
    - PII/PHI detection flow

11. **Provider Integration Pattern**
    - AI provider abstraction

12. **Middleware Chain Pattern**
    - Request processing flow

13. **Network Topology**
    - Network architecture

---

## Recommended Method by Use Case

| Use Case            | Recommended Method             |
| ------------------- | ------------------------------ |
| Quick viewing       | Mermaid Live Editor (Method 1) |
| Documentation       | GitHub/GitLab view (Method 2)  |
| Development         | VS Code Extension (Method 3)   |
| Automation/CI       | Mermaid CLI (Method 4)         |
| High quality export | Mermaid CLI SVG (Method 4)     |

---

## Troubleshooting

### Diagram Not Rendering?

- Check for syntax errors in Mermaid code
- Ensure proper code block markers (``mermaid` and ``)
- Try a different viewer/editor

### Can't Copy Code?

- Make sure you copy **between** the ````` markers
- Don't include the ``mermaid` or closing `` lines
- Use your editor's "Select All" feature within the code block

### Export Quality Issues?

- Use SVG format for best quality (infinite scaling)
- PNG is fine for web/documents
- Increase resolution in CLI: `mmdc -i file.mmd -o file.png -w 2000`

---

## Pro Tips

1. **Multiple Diagrams**: The ARCHITECTURE.md has 14+ diagrams - extract each one individually
2. **SVG > PNG**: SVG files are smaller and scalable - prefer SVG when possible
3. **GitHub**: If you push to GitHub, diagrams render automatically - great for documentation!
4. **VS Code**: The preview updates live as you edit - perfect for diagram tweaking
5. **Browser Extension**: Install "Mermaid Diagrams" browser extension for viewing in GitHub

---

## Need Help?

- **Mermaid Documentation**: https://mermaid.js.org/
- **Syntax Guide**: https://mermaid.js.org/intro/syntax-reference.html
- **Examples**: https://mermaid.js.org/ecosystem/tutorials.html
