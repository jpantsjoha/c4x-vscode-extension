> Deprecated: This initialization checklist is archived. Use Makefile targets (`make setup`, `make build`, `make test`) and see `docs/README.md` for current setup.

# 🎯 C4X Extension — Project Initialization Checklist

**Purpose**: This checklist ensures all prerequisites and foundational tasks are completed before starting development.

**Status**: 🔴 Not Started | 🟡 In Progress | 🟢 Complete

---

## Pre-Development Setup

### Environment Setup
- [ ] **Node.js** installed (v18+ LTS recommended)
  - Verify: `node --version` (should be v18.x or higher)
- [ ] **pnpm** installed globally
  - Install: `npm install -g pnpm`
  - Verify: `pnpm --version` (v8.x or higher)
- [ ] **Visual Studio Code** installed (latest stable)
  - Verify: `code --version`
- [ ] **Git** installed and configured
  - Verify: `git --version`
  - Configure: `git config --global user.name "Your Name"`
  - Configure: `git config --global user.email "your@email.com"`

### VS Code Extensions (Development)
- [ ] **ESLint** extension installed
- [ ] **Prettier** extension installed
- [ ] **TypeScript + JavaScript Language Features** (built-in, ensure enabled)
- [ ] **Extension Test Runner** (for debugging)

### Accounts & Access
- [ ] **GitHub Account** (for repository)
- [ ] **Azure DevOps Marketplace Account** (for publishing)
  - Sign up: <https://marketplace.visualstudio.com/>
  - Create publisher: <https://marketplace.visualstudio.com/manage>
  - Generate Personal Access Token (PAT) with `Marketplace > Publish` scope
- [ ] **NPM Account** (optional, for package publishing)

### Development Tools
- [ ] **vsce** (VS Code Extension CLI) installed globally
  - Install: `npm install -g @vscode/vsce`
  - Verify: `vsce --version`
- [ ] **TypeScript** installed globally (optional, can use local)
  - Install: `npm install -g typescript`
  - Verify: `tsc --version`

---

## Repository Initialization (M0 Day 1)

### Git Repository Setup
- [ ] Initialize Git repository
  ```bash
  git init
  git add .
  git commit -m "Initial commit: C4X extension scaffolding"
  ```
- [ ] Create `.gitignore` (Node, VS Code, build artifacts)
  ```
  node_modules/
  out/
  dist/
  *.vsix
  .vscode-test/
  .DS_Store
  *.log
  .env
  ```
- [ ] Create GitHub repository (public or private)
- [ ] Add remote and push
  ```bash
  git remote add origin https://github.com/YOUR_USERNAME/c4x-vscode-extension.git
  git branch -M main
  git push -u origin main
  ```

### Project Structure Setup
- [ ] Create folder structure:
  ```
  /
  ├── .github/workflows/     # CI/CD pipelines
  ├── .vscode/               # VS Code workspace settings
  ├── assets/                # Icons, images
  ├── docs/                  # Documentation
  ├── examples/              # Sample C4X files
  ├── extension/             # VS Code extension entry point
  │   ├── src/
  │   │   ├── commands/
  │   │   ├── providers/
  │   │   ├── webview/
  │   │   ├── test/
  │   │   └── extension.ts
  │   ├── package.json
  │   └── tsconfig.json
  ├── packages/              # Monorepo packages
  │   ├── c4x-parser/
  │   ├── structurizr-parser/
  │   ├── plantuml-c4-parser/
  │   ├── layout/
  │   ├── render/
  │   └── md-plugin/
  ├── .gitignore
  ├── .prettierrc
  ├── .eslintrc.json
  ├── pnpm-workspace.yaml
  ├── package.json           # Root package.json (workspace scripts)
  ├── tsconfig.json          # Root TypeScript config
  ├── README.md
  ├── CONTRIBUTING.md
  ├── LICENSE
  └── CHANGELOG.md
  ```

### Workspace Configuration
- [ ] Create `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - 'packages/*'
    - 'extension'
  ```
- [ ] Create root `package.json`:
  ```json
  {
    "name": "c4x-workspace",
    "version": "0.0.0",
    "private": true,
    "scripts": {
      "build": "pnpm -r build",
      "test": "pnpm -r test",
      "lint": "eslint . --ext .ts",
      "format": "prettier --write \"**/*.{ts,json,md}\"",
      "watch": "pnpm -r --parallel watch",
      "package": "cd extension && vsce package",
      "clean": "pnpm -r exec rm -rf dist out node_modules"
    },
    "devDependencies": {
      "@typescript-eslint/eslint-plugin": "^6.0.0",
      "@typescript-eslint/parser": "^6.0.0",
      "eslint": "^8.50.0",
      "prettier": "^3.0.0",
      "typescript": "^5.2.0"
    }
  }
  ```
- [ ] Create root `tsconfig.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "commonjs",
      "lib": ["ES2022"],
      "strict": true,
      "esModuleInterop": true,
      "skipLibCheck": true,
      "forceConsistentCasingInFileNames": true,
      "declaration": true,
      "declarationMap": true,
      "sourceMap": true,
      "outDir": "./out"
    },
    "exclude": ["node_modules", "out", "dist"]
  }
  ```

### Extension Manifest Setup
- [ ] Create `extension/package.json`:
  ```json
  {
    "name": "c4x",
    "displayName": "C4X — C4 Model Diagrams",
    "description": "Fast, beautiful C4 architecture diagrams in VS Code. Like Mermaid, but for C4.",
    "version": "1.0.0",
    "publisher": "YOUR_PUBLISHER_NAME",
    "license": "MIT",
    "repository": {
      "type": "git",
      "url": "https://github.com/YOUR_USERNAME/c4x-vscode-extension"
    },
    "engines": {
      "vscode": "^1.80.0"
    },
    "categories": [
      "Programming Languages",
      "Visualization",
      "Other"
    ],
    "keywords": [
      "c4",
      "c4model",
      "architecture",
      "diagram",
      "structurizr",
      "plantuml",
      "mermaid"
    ],
    "activationEvents": [
      "onLanguage:c4x",
      "onLanguage:c4dsl",
      "onCommand:c4x.openPreview"
    ],
    "main": "./out/extension.js",
    "contributes": {
      "languages": [
        {
          "id": "c4x",
          "aliases": ["C4X", "c4x"],
          "extensions": [".c4x"],
          "configuration": "./language-configuration.json"
        }
      ],
      "commands": [
        {
          "command": "c4x.openPreview",
          "title": "C4X: Open Preview",
          "icon": "$(open-preview)"
        }
      ],
      "configuration": {
        "title": "C4X",
        "properties": {
          "c4x.theme": {
            "type": "string",
            "enum": ["auto", "classic", "modern", "muted", "hc"],
            "default": "auto",
            "description": "Theme for C4 diagrams"
          },
          "c4x.preview.liveUpdate": {
            "type": "boolean",
            "default": true,
            "description": "Enable live preview updates on file change"
          }
        }
      }
    },
    "scripts": {
      "vscode:prepublish": "pnpm run build",
      "build": "tsc -p ./",
      "watch": "tsc -watch -p ./",
      "test": "node ./out/test/runTest.js"
    },
    "devDependencies": {
      "@types/vscode": "^1.80.0",
      "@types/node": "^18.0.0",
      "@vscode/test-electron": "^2.3.0",
      "typescript": "^5.2.0"
    }
  }
  ```

### Linting & Formatting Setup
- [ ] Create `.eslintrc.json`:
  ```json
  {
    "root": true,
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
      "ecmaVersion": 2022,
      "sourceType": "module"
    },
    "plugins": ["@typescript-eslint"],
    "extends": [
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended"
    ],
    "rules": {
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
  ```
- [ ] Create `.prettierrc`:
  ```json
  {
    "semi": true,
    "trailingComma": "es5",
    "singleQuote": false,
    "printWidth": 100,
    "tabWidth": 2
  }
  ```

### VS Code Workspace Settings
- [ ] Create `.vscode/settings.json`:
  ```json
  {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "eslint.validate": ["typescript"],
    "typescript.tsdk": "node_modules/typescript/lib"
  }
  ```
- [ ] Create `.vscode/launch.json` (for debugging):
  ```json
  {
    "version": "0.2.0",
    "configurations": [
      {
        "name": "Run Extension",
        "type": "extensionHost",
        "request": "launch",
        "args": ["--extensionDevelopmentPath=${workspaceFolder}/extension"],
        "outFiles": ["${workspaceFolder}/extension/out/**/*.js"],
        "preLaunchTask": "${defaultBuildTask}"
      },
      {
        "name": "Extension Tests",
        "type": "extensionHost",
        "request": "launch",
        "args": [
          "--extensionDevelopmentPath=${workspaceFolder}/extension",
          "--extensionTestsPath=${workspaceFolder}/extension/out/test/suite/index"
        ],
        "outFiles": ["${workspaceFolder}/extension/out/test/**/*.js"],
        "preLaunchTask": "${defaultBuildTask}"
      }
    ]
  }
  ```
- [ ] Create `.vscode/tasks.json` (build tasks):
  ```json
  {
    "version": "2.0.0",
    "tasks": [
      {
        "type": "npm",
        "script": "watch",
        "problemMatcher": "$tsc-watch",
        "isBackground": true,
        "presentation": {
          "reveal": "never"
        },
        "group": {
          "kind": "build",
          "isDefault": true
        }
      }
    ]
  }
  ```

### Documentation Setup
- [ ] Create `README.md` (project overview)
- [ ] Create `CONTRIBUTING.md` (contribution guidelines)
- [ ] Create `LICENSE` (MIT recommended)
- [ ] Create `CHANGELOG.md` (version history)
- [ ] Create `docs/ARCHITECTURE.md` (high-level design)
- [ ] Create `docs/C4X-SYNTAX.md` (DSL specification)

### CI/CD Pipeline Setup
- [ ] Create `.github/workflows/ci.yml`:
  ```yaml
  name: CI

  on:
    push:
      branches: [main, develop]
    pull_request:
      branches: [main, develop]

  jobs:
    test:
      strategy:
        matrix:
          os: [ubuntu-latest, windows-latest, macos-latest]
          node-version: [18.x]
      runs-on: ${{ matrix.os }}
      steps:
        - uses: actions/checkout@v3
        - uses: pnpm/action-setup@v2
          with:
            version: 8
        - uses: actions/setup-node@v3
          with:
            node-version: ${{ matrix.node-version }}
            cache: 'pnpm'
        - run: pnpm install --frozen-lockfile
        - run: pnpm run lint
        - run: pnpm run build
        - run: pnpm run test
        - run: pnpm run package
  ```

### Dependencies Installation
- [ ] Install root dependencies:
  ```bash
  pnpm install
  ```
- [ ] Verify installation:
  ```bash
  pnpm run lint
  pnpm run build
  ```

---

## Smoke Test (M0 Day 2)

### Extension Activation Test
- [ ] Open extension project in VS Code
- [ ] Press `F5` to launch Extension Development Host
- [ ] Verify extension activates (check Output > Log)
- [ ] Open command palette (`Ctrl+Shift+P`)
- [ ] Search for "C4X: Open Preview"
- [ ] Verify command appears and executes (even if basic)

### Build Test
- [ ] Run `pnpm run build` (should succeed)
- [ ] Run `pnpm run lint` (should pass)
- [ ] Run `pnpm run test` (should pass, even if just placeholder tests)
- [ ] Run `pnpm run package` (should create `.vsix` file)

### Git Test
- [ ] Commit initial scaffolding:
  ```bash
  git add .
  git commit -m "feat: initial project scaffolding (M0)"
  git push origin main
  ```
- [ ] Verify CI pipeline runs on GitHub Actions
- [ ] Verify CI passes (green checkmark)

---

## Agent Onboarding

### VSCode Extension Expert Agent
- [ ] Review `AGENT-SPECS.md` (VSCode Expert section)
- [ ] Assign first review task: validate extension manifest (`extension/package.json`)
- [ ] Schedule weekly sync (Mondays, 30 min)

### Product Owner Agent
- [ ] Review `AGENT-SPECS.md` (Product Owner section)
- [ ] Review `EXECUTION-PLAN.md` (milestones & timeline)
- [ ] Define success metrics dashboard (track installs, ratings, issues)
- [ ] Schedule weekly sync (Mondays, 30 min)

---

## Pre-Development Checklist Summary

### Environment ✅
- [ ] Node.js v18+ installed
- [ ] pnpm v8+ installed
- [ ] VS Code installed with required extensions
- [ ] Git configured
- [ ] vsce CLI installed

### Accounts ✅
- [ ] GitHub account ready
- [ ] Azure Marketplace publisher account created
- [ ] Personal Access Token generated

### Repository ✅
- [ ] Git repository initialized
- [ ] GitHub repository created
- [ ] Folder structure created
- [ ] Configuration files created (tsconfig, eslint, prettier)
- [ ] Extension manifest created
- [ ] CI/CD pipeline configured

### Documentation ✅
- [ ] README.md created
- [ ] CONTRIBUTING.md created
- [ ] LICENSE created
- [ ] CHANGELOG.md created
- [ ] Architecture docs created

### Smoke Test ✅
- [ ] Extension activates in development mode
- [ ] Build succeeds
- [ ] Tests pass
- [ ] CI pipeline passes

### Agents ✅
- [ ] VSCode Extension Expert onboarded
- [ ] Product Owner onboarded
- [ ] Weekly sync scheduled

---

## Next Steps

Once this checklist is complete, proceed to **M0: Project Scaffolding** in [EXECUTION-PLAN.md](./EXECUTION-PLAN.md).

**Status**: 🟢 Ready to start M0!

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
**Maintained By**: Lead Architect (Claude)
