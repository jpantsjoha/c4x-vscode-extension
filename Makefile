.PHONY: setup install build test lint lint-file clean package vsix typecheck quick-check check check-full verify-mcp validate-toolchain
.PHONY: test-unit test-integration test-e2e test-mcp test-perf test-vsix-smoke test-all coverage cve-scan

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

# Validate skills, workflows, adapters, hooks, and canonical command references

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

# Fast local development gate
quick-check: typecheck lint test-unit verify-mcp test-mcp validate-toolchain
	@echo "✅ Quick checks passed!"

# Standard pull-request gate
check: quick-check verify-docs build
	@echo "✅ Standard checks passed!"


# Live generation gate. Set C4X_REQUIRE_LIVE=1 to fail without a working key.
# Every other gate mocks the model, which is how a retired image model shipped.
test-live:
	@echo "🌐 Live generation gate (real Gemini API calls)..."
	pnpm run test:live

check-full: check test coverage test-e2e test-perf test-vsix-smoke test-live package cve-scan
	@echo "✅ Full checks passed!"

# A release-level invocation cannot claim success by skipping the live check.
check-full: export C4X_REQUIRE_LIVE=1

# Audit the complete lockfile, including build dependencies bundled into MCP.
cve-scan:
	@echo "🔒 Auditing dependencies (HIGH/CRITICAL block release)..."
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

# Validate the shipping artifact against the private/public metadata boundary.
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
	@echo "  make quick-check - Typecheck + lint + unit/MCP tests"
	@echo "  make check      - Quick checks + documentation + build"
	@echo "  make check-full - Standard checks + host/browser/performance/coverage + clean VSIX + live + audit"
	@echo "  make verify-mcp - Verify the tracked MCP bundle is current"
	@echo "  make test       - Run default test suite"
	@echo "  make test-unit  - Run unit tests"
	@echo "  make test-integration - Run integration tests"
	@echo "  make test-e2e   - Run end-to-end tests"
	@echo "  make test-mcp   - Run MCP handshake, tool, and resource tests"
	@echo "  make test-perf  - Run performance benchmarks"
	@echo "  make test-live       - Live Gemini generation gate (needs GEMINI_API_KEY)"
	@echo "  make test-vsix-smoke - Package, install, activate, and smoke-test a clean VSIX"
	@echo "  make test-all   - Run unit + MCP + integration + e2e + perf + vsix-smoke"
	@echo "  make coverage   - Generate coverage report"
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
