# C4X - Project Gemini Context

**Vision**: To make C4 architectural diagrams as easy, fast, and accessible as Mermaid.js within VS Code, without the heavy dependencies of Java or external servers.

**Intent**: This project is a production-grade VS Code extension designed for software architects, technical writers, and engineering leaders who need to visualize complex systems clearly and efficiently. It prioritizes performance, offline capability, and visual quality compliant with the official C4 Model.

---

## 🛠️ Developer Instructions

This repository uses a `Makefile` to standardize common development tasks. Ensure you have `pnpm` installed.

### 1. Setup (First Time)

Initialize the development environment, install dependencies, and compile the codebase.

```bash
make setup
```

### 2. Build

Compile the TypeScript source code and generate the parser.

```bash
make build
```

### 3. Lint

Check the codebase for style and quality issues.

```bash
make lint
```

### 4. Test

Run the comprehensive test suite (Unit, Integration, and Visual Validation).

```bash
make test
```

### 5. Package

Create the `.vsix` file for distribution or local installation.

```bash
make package
```

---

## 📂 Repository Structure

* `src/`: Core extension source code (TypeScript).
* `src/parser/`: Parsers for C4X, PlantUML, and Structurizr DSLs.
* `src/render/`: SVG rendering engine and theme system.
* `test/`: Comprehensive test suite.
* `docs/`: Documentation and examples.
* `samples/`: Example diagram files for testing and demonstration.

---

*This file provides context for AI agents and contributors working on the C4X project.*
