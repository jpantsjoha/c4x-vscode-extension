# Activity 01: Repository Initialization

**Status**: 🟢 Complete
**Estimated Time**: 30 minutes
**Prerequisites**: Git installed, GitHub account configured
**Agent Assignable**: ✅ Yes (Fully Autonomous)

---

## 🎯 Problem Statement

We need to initialize a Git repository for the C4X extension with proper version control, ignore patterns, and GitHub repository setup. This forms the foundation for all development work.

**Why This Matters**: Without proper Git setup, we risk committing sensitive files, losing branch protection, and creating an unorganized development workflow.

---

## 📋 Objectives

1. Initialize local Git repository
2. Configure `.gitignore` for Node.js and VS Code extension development
3. Create initial project structure (empty folders)
4. Make initial commit
5. Create GitHub repository
6. Configure branch protection rules
7. Set up GitHub labels for issue tracking

---

## 🔨 Step-by-Step Implementation

### Step 1: Initialize Git Repository

```bash
cd /Users/jp/Library/Mobile\ Documents/com~apple~CloudDocs/Documents/workspaces/c4model-vscode-extension

# Initialize git if not already initialized
git init

# Ensure we're on main branch
git branch -M main
```

**Expected Output**:
```
Initialized empty Git repository in /path/to/c4model-vscode-extension/.git/
```

---

### Step 2: Create `.gitignore`

Create `.gitignore` file with the following content:

```gitignore
# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Build output
dist/
out/
*.vsix

# IDE
.vscode/settings.json
.vscode/launch.json
.idea/

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local

# Test coverage
coverage/
.nyc_output/

# Logs
logs/
*.log

# Temp files
*.tmp
*.temp
.cache/
```

**Command**:
```bash
cat > .gitignore << 'EOF'
# Node.js
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*

# Build output
dist/
out/
*.vsix

# IDE
.vscode/settings.json
.vscode/launch.json
.idea/

# OS
.DS_Store
Thumbs.db

# Environment
.env
.env.local
.env.*.local

# Test coverage
coverage/
.nyc_output/

# Logs
logs/
*.log

# Temp files
*.tmp
*.temp
.cache/
EOF
```

---

### Step 3: Create Initial Project Structure

```bash
# Create source directories
mkdir -p src/webview/content
mkdir -p src/commands
mkdir -p src/parser
mkdir -p src/layout
mkdir -p src/render
mkdir -p src/model

# Create test directories
mkdir -p test/suite
mkdir -p test/fixtures

# Create GitHub templates
mkdir -p .github/workflows
mkdir -p .github/ISSUE_TEMPLATE
```

**Verify Structure**:
```bash
tree -L 3 -d
```

**Expected Output**:
```
.
├── .github
│   ├── ISSUE_TEMPLATE
│   └── workflows
├── src
│   ├── commands
│   ├── layout
│   ├── model
│   ├── parser
│   ├── render
│   └── webview
│       └── content
└── test
    ├── fixtures
    └── suite
```

---

### Step 4: Create `.gitattributes` (Optional but Recommended)

```bash
cat > .gitattributes << 'EOF'
# Auto detect text files and perform LF normalization
* text=auto

# TypeScript files
*.ts text eol=lf
*.tsx text eol=lf

# JavaScript files
*.js text eol=lf
*.jsx text eol=lf

# JSON files
*.json text eol=lf

# Markdown files
*.md text eol=lf

# Shell scripts
*.sh text eol=lf

# Windows scripts
*.bat text eol=crlf
*.ps1 text eol=crlf
EOF
```

---

### Step 5: Initial Commit

```bash
# Stage all files
git add .

# Create initial commit
git commit -m "Initial commit: Repository structure

- Initialize Git repository
- Add .gitignore for Node.js and VS Code extension
- Create project directory structure
- Add .gitattributes for cross-platform compatibility

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Expected Output**:
```
[main (root-commit) abc1234] Initial commit: Repository structure
 2 files changed, 50 insertions(+)
 create mode 100644 .gitattributes
 create mode 100644 .gitignore
```

---

### Step 6: Create GitHub Repository

**Option A: Using GitHub CLI (Recommended)**

```bash
# Create GitHub repository
gh repo create c4model-vscode-extension \
  --public \
  --description "Make C4 diagrams as easy as Mermaid in VS Code" \
  --source=. \
  --remote=origin \
  --push

# Verify remote is set
git remote -v
```

**Expected Output**:
```
✓ Created repository USERNAME/c4model-vscode-extension on GitHub
✓ Added remote origin
✓ Pushed commits to origin
origin	git@github.com:USERNAME/c4model-vscode-extension.git (fetch)
origin	git@github.com:USERNAME/c4model-vscode-extension.git (push)
```

**Option B: Using GitHub Web UI**

1. Go to https://github.com/new
2. Repository name: `c4model-vscode-extension`
3. Description: "Make C4 diagrams as easy as Mermaid in VS Code"
4. Public repository
5. Click "Create repository"

Then link local repo:
```bash
git remote add origin git@github.com:USERNAME/c4model-vscode-extension.git
git push -u origin main
```

---

### Step 7: Configure Branch Protection Rules

**Using GitHub CLI**:

```bash
# Enable branch protection for main
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_pull_request_reviews='{"required_approving_review_count":1}' \
  --field enforce_admins=false \
  --field required_status_checks='{"strict":true,"contexts":["build","test"]}' \
  --field restrictions=null
```

**Using GitHub Web UI**:

1. Go to repository settings → Branches
2. Add rule for `main` branch
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require approvals (1)
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
4. Save changes

---

### Step 8: Create GitHub Labels

```bash
# Create standard labels
gh label create "bug" --description "Something isn't working" --color "d73a4a"
gh label create "feature" --description "New feature or request" --color "0075ca"
gh label create "enhancement" --description "Improvement to existing feature" --color "a2eeef"
gh label create "technical-debt" --description "Code quality improvements" --color "fbca04"
gh label create "documentation" --description "Improvements or additions to documentation" --color "0075ca"
gh label create "good first issue" --description "Good for newcomers" --color "7057ff"
gh label create "help wanted" --description "Extra attention is needed" --color "008672"
gh label create "question" --description "Further information is requested" --color "d876e3"
gh label create "wontfix" --description "This will not be worked on" --color "ffffff"

# Create phase labels
gh label create "phase-0-planning" --description "Planning phase" --color "c5def5"
gh label create "phase-1-scaffolding" --description "M0: Scaffolding" --color "c5def5"
gh label create "phase-2-parser" --description "M1: C4X-DSL Parser" --color "c5def5"
gh label create "phase-3-markdown" --description "M2: Markdown Integration" --color "c5def5"
gh label create "phase-4-structurizr" --description "M3: Structurizr DSL" --color "c5def5"
gh label create "phase-5-plantuml" --description "M4: PlantUML C4" --color "c5def5"
gh label create "phase-6-polish" --description "M5: Polish & QA" --color "c5def5"
```

---

## ✅ Acceptance Criteria

**Before marking this activity complete, verify ALL of the following**:

- [ ] Git repository initialized (`.git/` folder exists)
- [ ] `.gitignore` file exists with Node.js and VS Code patterns
- [ ] `.gitattributes` file exists with line ending rules
- [ ] Project structure created (src/, test/, .github/)
- [ ] Initial commit created with descriptive message
- [ ] GitHub repository created and linked
- [ ] Main branch pushed to remote (`git log origin/main` shows commits)
- [ ] Branch protection enabled on `main` (requires PR, 1 approval)
- [ ] GitHub labels created (13 labels total: bug, feature, enhancement, technical-debt, documentation, good first issue, help wanted, question, wontfix, phase-0 through phase-6)

---

## 🧪 Testing & Validation

### Test 1: Verify Git is Initialized

```bash
# Check git status
git status

# Expected output (if no uncommitted changes):
# On branch main
# nothing to commit, working tree clean
```

### Test 2: Verify .gitignore Works

```bash
# Create a test file that should be ignored
touch node_modules/.test
mkdir -p dist && touch dist/test.js

# Check git status - these should NOT appear
git status

# Expected: No mention of node_modules/ or dist/
```

### Test 3: Verify GitHub Connection

```bash
# Test remote connection
git remote -v

# Expected output:
# origin	git@github.com:USERNAME/c4model-vscode-extension.git (fetch)
# origin	git@github.com:USERNAME/c4model-vscode-extension.git (push)

# Test push access
git push origin main --dry-run

# Expected: Everything up-to-date (or would push commits)
```

### Test 4: Verify Branch Protection

```bash
# Check branch protection status
gh api repos/:owner/:repo/branches/main/protection | jq '.required_pull_request_reviews.required_approving_review_count'

# Expected output: 1
```

### Test 5: Verify Labels

```bash
# List all labels
gh label list

# Expected: 13 labels including bug, feature, phase-0-planning through phase-6-polish
```

---

## 🚨 Troubleshooting

### Issue: `gh` command not found

**Solution**:
```bash
# Install GitHub CLI
brew install gh  # macOS
# OR
sudo apt install gh  # Linux

# Authenticate
gh auth login
```

### Issue: Permission denied (publickey) when pushing

**Solution**:
```bash
# Check SSH keys
ssh -T git@github.com

# If no keys, generate one
ssh-keygen -t ed25519 -C "your_email@example.com"

# Add to GitHub
cat ~/.ssh/id_ed25519.pub
# Copy output and add to https://github.com/settings/keys
```

### Issue: Branch protection API returns 404

**Solution**: Ensure the branch exists on remote first:
```bash
git push -u origin main
```

Then retry branch protection configuration.

### Issue: Labels already exist

**Solution**: Use `--force` flag to update existing labels:
```bash
gh label create "bug" --description "..." --color "..." --force
```

---

## 🤖 Agent Handoff Points

### Trigger Code Review Agent

After completing this activity, invoke `/review-code` to validate:
- Repository structure follows VS Code extension best practices
- `.gitignore` is comprehensive
- Branch protection rules are appropriate

**Command**:
```
/review-code Check repository structure and Git configuration for Phase 1 Activity 01
```

### Trigger QA Agent

Invoke QA agent to verify:
- All acceptance criteria met
- All tests passed

**Manual Check**: Run through all acceptance criteria checkboxes above.

---

## 📊 Progress Tracking

**Status**: 🟢 Complete

**Completed**:
- All acceptance criteria checked ✅
- Code Review Agent approved
- QA validation passed
- Next activity (02-extension-manifest.md) can proceed

---

## 📚 References

- [Git Documentation](https://git-scm.com/doc)
- [GitHub CLI Manual](https://cli.github.com/manual/)
- [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [TDR-010: Contribution Guidelines](../../../adrs/TDR-010-contribution-guidelines.md)

---

**Activity Owner**: Any autonomous agent or contributor
**Last Updated**: 2025-10-19
**Next Activity**: [02-extension-manifest.md](./02-extension-manifest.md)
