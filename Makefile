.PHONY: setup install build test lint lint-file lint-c4x clean package vsix typecheck quick-check check check-full verify-mcp validate-toolchain
.PHONY: test-unit test-integration test-e2e test-mcp test-cli test-perf test-vsix-smoke test-vsix-uat test-all coverage coverage-all cve-scan
.PHONY: test-live verify-docs pre-commit help

# Complete setup (first time)
setup:
	@echo "🚀 Setting up C4X development environment..."
	@echo "📦 Installing dependencies..."
	pnpm install
	@echo "🔨 Building extension..."
	pnpm run build
	@echo "🧪 Compiling tests..."
	pnpm run test:compile
	@echo "✅ Setup complete! Run 'make test' to run tests, 'make package' to create VSIX"

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	pnpm install

# Build extension
build:
	@echo "🔨 Building extension..."
	pnpm run build

# Compile TypeScript without running tests
typecheck:
	@echo "🔎 Type-checking source and tests..."
	pnpm run test:compile


# Validate pinned toolchain consistency
validate-toolchain:
	@echo "🛠️  Validating toolchain pins..."
	pnpm run validate:toolchain

# Verify the tracked, self-contained MCP server is current and functional
verify-mcp:
	@echo "🔌 Verifying C4X MCP bundle freshness..."
	pnpm run verify:mcp

test-mcp:
	@echo "🔌 Running C4X MCP protocol tests..."
	pnpm run test:mcp

# Functional test of the tracked c4x-lint bundle, run alone from a scratch directory
test-cli:
	@echo "📐 Running c4x-lint bundle tests..."
	pnpm run test:cli

# C4 notation lint over the diagrams this repository publishes (#216). Runs the
# tracked bundle, so verify-mcp must pass first for the result to mean anything.
# At the default --max-severity error, only syntax and model errors fail: every
# notation rule defaults to info. Override either variable to widen the gate,
# e.g. make lint-c4x C4X_LINT_MAX_SEVERITY=warning
C4X_LINT_PATHS ?= samples '*.md' 'docs/*.md' docs/marketplace
C4X_LINT_MAX_SEVERITY ?= error
lint-c4x:
	@echo "📐 Linting C4X diagrams (c4x-lint, --max-severity $(C4X_LINT_MAX_SEVERITY))..."
	node cli/c4x-lint.cjs $(C4X_LINT_PATHS) --max-severity $(C4X_LINT_MAX_SEVERITY) --quiet

# Fast local development gate
quick-check: typecheck lint test-unit verify-mcp test-mcp test-cli lint-c4x validate-toolchain
	@echo "✅ Quick checks passed!"

# Standard pull-request gate
check: quick-check verify-docs build
	@echo "✅ Standard checks passed!"


# Live generation gate. Set C4X_REQUIRE_LIVE=1 to fail without a working key.
# Every other gate mocks the model, which is how a retired image model shipped.
test-live:
	@echo "🌐 Live generation gate (real Gemini API calls)..."
	pnpm run test:live

check-full: check test coverage coverage-all test-e2e test-perf test-vsix-smoke test-live package cve-scan
	@echo "✅ Full checks passed!"

# A release-level invocation cannot claim success by skipping the live check.
check-full: export C4X_REQUIRE_LIVE=1

# Audit the complete lockfile, including build dependencies bundled into MCP.
#
# Accepted advisory exceptions (package.json "pnpm.auditConfig.ignoreGhsas").
# Each GHSA listed there is ignored individually; any other HIGH/CRITICAL
# advisory still fails this target. Never add an id without a dated entry here.
#
#   GHSA-vfj7-8cjw-p6xm  braces 3.0.3, high (stack-exhaustion DoS on deeply
#     nested patterns). Accepted 2026-10-08 by the maintainer;
#     REVIEW BY 2026-11-07, then renew with a new date or remove.
#     The date is machine-enforced: scripts/audit-exceptions.json carries it,
#     and cve-scan fails once it has passed (scripts/check-audit-exceptions.js).
#     Reason: dev/publish tooling only, reached through
#     ovsx > @vscode/vsce 3.x > secretlint 10 > globby > fast-glob > micromatch;
#     never bundled or shipped (pnpm audit --prod is clean) and fed only this
#     repository's own file globs. No patched braces exists (latest 3.0.3,
#     checked 2026-10-09). Revisit when braces publishes a fix, or ovsx moves
#     to @vscode/vsce 4 (which drops the secretlint > globby chain; ovsx 1.2.0
#     still requires ^3.7.1), or secretlint 10.x drops globby. Then delete the
#     id from package.json and this entry.
cve-scan:
	@echo "🔒 Auditing dependencies (HIGH/CRITICAL block release)..."
	node scripts/check-audit-exceptions.js
	pnpm audit --audit-level=high


# Run tests
test:
	@echo "🧪 Running tests..."
	pnpm run test:compile
	pnpm test

# Test phases
test-unit:
	@echo "🧪 Running unit tests..."
	pnpm run test:compile
	pnpm run test:unit

test-integration:
	@echo "🔗 Running integration tests..."
	pnpm run test:compile
	pnpm run test:integration

test-e2e:
	@echo "🌐 Running end-to-end tests..."
	pnpm run test:e2e

test-perf:
	@echo "⚡ Running performance benchmarks..."
	pnpm run bench

test-vsix-smoke:
	@echo "📦 Running clean packaged-VSIX smoke test..."
	pnpm run test:vsix-smoke

# Installed-VSIX acceptance journey (#79): drives the packaged VSIX in an
# isolated profile through Playwright's Electron driver -- edit, save, undo,
# discard, conflict, restart, Markdown CodeLens, exports, keyboard. Writes a
# receipt and screenshots to .tmp/installed-uat/<timestamp> (or
# C4X_UAT_OUTPUT_DIR). Not in any composite gate. Linux needs a display:
#   xvfb-run -a -s "-screen 0 1920x1080x24" make test-vsix-uat
test-vsix-uat:
	@echo "🧭 Running the installed-VSIX acceptance journey..."
	pnpm run test:vsix-uat

test-all:
	@echo "🧪 Running all test phases (unit, MCP, integration, e2e, perf, vsix-smoke)..."
	$(MAKE) test-unit
	$(MAKE) test-mcp
	$(MAKE) test-integration
	$(MAKE) test-e2e
	$(MAKE) test-perf
	$(MAKE) test-vsix-smoke

coverage:
	@echo "📈 Generating test coverage report..."
	pnpm run coverage

# Merged whole-extension coverage: unit tier + extension-host tier, one c8
# temp directory, reported over src/** only.
coverage-all:
	@echo "📈 Generating merged whole-extension coverage report..."
	pnpm run coverage:all

# Run linter
lint:
	@echo "🔍 Linting code..."
	pnpm run lint

# Advisory IDE-hook entry point. C4X_LINT_FILE is validated by the adapter.
lint-file:
	@test -n "$(C4X_LINT_FILE)" || { echo "C4X_LINT_FILE is required" >&2; exit 2; }
	pnpm exec eslint "$(C4X_LINT_FILE)" --no-error-on-unmatched-pattern

# Verify documentation (Markdown lint + C4X syntax check)
verify-docs:
	@echo "📝 Verifying documentation..."
	pnpm run validate:docs
	@echo "🐍 Running strict C4X syntax check..."
	python3 scripts/check_c4x_syntax.py $$(find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/_agents/*" -not -path "*/.claude/*" -not -path "*/.tmp/*")

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist out node_modules

# Package VSIX
package: build
	@echo "📦 Packaging VSIX..."
	pnpm run package
	@echo "✅ VSIX file created! Check the root directory for c4x-*.vsix"

.PHONY:

# Alias for package (create VSIX)
vsix: package






# Pre-commit checks (3m pattern: make, measure, monitor)
pre-commit: quick-check verify-docs build
	@echo "✅ Pre-commit checks passed!"

# Help target
help:
	@echo "C4X Extension - Makefile Targets"
	@echo ""
	@echo "Setup & Installation:"
	@echo "  make setup      - Complete first-time setup (install + build + compile tests)"
	@echo "  make install    - Install dependencies only"
	@echo ""
	@echo "Development:"
	@echo "  make build      - Build extension (compiles TypeScript + PEG.js parser)"
	@echo "  make typecheck  - Compile source and tests without executing them"
	@echo "  make quick-check - Typecheck + lint + unit/MCP/CLI tests + C4X lint"
	@echo "  make check      - Quick checks + documentation + build"
	@echo "  make check-full - Standard checks + host/browser/performance/coverage + clean VSIX + live + audit"
	@echo "  make verify-mcp - Verify the tracked MCP bundle is current"
	@echo "  make test       - Run default test suite"
	@echo "  make test-unit  - Run unit tests"
	@echo "  make test-integration - Run integration tests"
	@echo "  make test-e2e   - Run end-to-end tests"
	@echo "  make test-mcp   - Run MCP handshake, tool, and resource tests"
	@echo "  make test-cli   - Run the c4x-lint bundle functional tests"
	@echo "  make lint-c4x   - Lint the repository's C4X diagrams (notation rules, headless)"
	@echo "  make test-perf  - Run performance benchmarks"
	@echo "  make test-live       - Live Gemini generation gate (needs GEMINI_API_KEY)"
	@echo "  make test-vsix-smoke - Package, install, activate, and smoke-test a clean VSIX"
	@echo "  make test-vsix-uat   - Drive the installed VSIX through the #79 acceptance journey"
	@echo "  make test-all   - Run unit + MCP + integration + e2e + perf + vsix-smoke"
	@echo "  make coverage   - Generate coverage report (unit tier)"
	@echo "  make coverage-all - Merged unit + extension-host coverage over src/**"
	@echo "  make lint       - Run ESLint"
	@echo "  make verify-docs - Verify documentation (markdown lint + C4X syntax)"
	@echo "  make cve-scan   - Audit dependencies; HIGH/CRITICAL findings fail"
	@echo ""
	@echo "Publishing:"
	@echo "  make package    - Create VSIX file for marketplace"
	@echo "  make vsix       - Alias for 'make package'"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean      - Remove build artifacts (dist, out, node_modules)"
	@echo "  make pre-commit - Run all checks (quick-check + docs + build)"
	@echo ""
	@echo ""
	@echo "Quick Start:"
	@echo "  1. make setup        (first time only)"
	@echo "  2. make quick-check  (validate code locally)"
	@echo "  3. make package      (create VSIX for marketplace)"
