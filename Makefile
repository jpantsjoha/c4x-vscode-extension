.PHONY: setup install build test lint clean package vsix typecheck quick-check check check-full validate-harness verify-mcp validate-toolchain
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
validate-harness:
	@echo "🧭 Validating agent harness..."
	node scripts/validate-agent-harness.js

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
quick-check: typecheck lint test-unit validate-harness verify-mcp test-mcp validate-toolchain
	@echo "✅ Quick checks passed!"

# Standard pull-request gate
check: quick-check verify-docs build
	@echo "✅ Standard checks passed!"

# Release-level gate (cve-scan is report-only: findings surface but do not fail the gate)
check-full: check test coverage test-vsix-smoke package cve-scan
	@echo "✅ Full checks passed!"

# CVE scan via osv-scanner (preferred) with pnpm audit fallback.
# Report-only: exits 0 regardless of findings to surface advisories without blocking
# until the known high advisories in devDependencies are resolved (TDR-007).
# To make this a hard gate, replace '|| true' with '&& echo "Clean"'.
cve-scan:
	@echo "🔒 Running CVE scan (report-only)..."
	@if command -v osv-scanner >/dev/null 2>&1; then \
	  echo "  Using osv-scanner v$$(osv-scanner --version 2>&1 | head -1 | awk '{print $$3}') against pnpm-lock.yaml"; \
	  osv-scanner scan --lockfile pnpm-lock.yaml 2>&1 || true; \
	else \
	  echo "  osv-scanner not found; falling back to pnpm audit (report-only)"; \
	  pnpm audit --prod 2>&1 || true; \
	fi
	@echo "ℹ️  CVE scan complete (report-only — see TDR-007 for triage status)"

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

# Verify documentation (Markdown lint + C4X syntax check)
verify-docs:
	@echo "📝 Verifying documentation..."
	pnpm run validate:docs
	@echo "🐍 Running strict C4X syntax check..."
	python3 scripts/check_c4x_syntax.py $$(find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/.tmp/*")

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist out node_modules

# Package VSIX
package: build
	@echo "📦 Packaging VSIX..."
	pnpm run package
	@echo "✅ VSIX file created! Check the root directory for c4x-*.vsix"

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
	@echo "  make quick-check - Typecheck + lint + unit/MCP tests + harness validation"
	@echo "  make check      - Quick checks + documentation + build"
	@echo "  make check-full - Standard checks + extension tests + coverage + package"
	@echo "  make validate-harness - Validate skills, workflows, adapters, hooks, and commands"
	@echo "  make verify-mcp - Verify the tracked MCP bundle is current"
	@echo "  make test       - Run default test suite"
	@echo "  make test-unit  - Run unit tests"
	@echo "  make test-integration - Run integration tests"
	@echo "  make test-e2e   - Run end-to-end tests"
	@echo "  make test-mcp   - Run MCP handshake, tool, and resource tests"
	@echo "  make test-perf  - Run performance benchmarks"
	@echo "  make test-vsix-smoke - Package, install, activate, and smoke-test a clean VSIX"
	@echo "  make test-all   - Run unit + MCP + integration + e2e + perf + vsix-smoke"
	@echo "  make coverage   - Generate coverage report"
	@echo "  make lint       - Run ESLint"
	@echo "  make verify-docs - Verify documentation (markdown lint + C4X syntax)"
	@echo "  make cve-scan   - Run CVE scan via osv-scanner (report-only, no gate)"
	@echo ""
	@echo "Publishing:"
	@echo "  make package    - Create VSIX file for marketplace"
	@echo "  make vsix       - Alias for 'make package'"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean      - Remove build artifacts (dist, out, node_modules)"
	@echo "  make pre-commit - Run all checks (quick-check + docs + build)"
	@echo ""
	@echo "Quick Start:"
	@echo "  1. make setup        (first time only)"
	@echo "  2. make quick-check  (validate code locally)"
	@echo "  3. make package      (create VSIX for marketplace)"
