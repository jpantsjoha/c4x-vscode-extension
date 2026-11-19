.PHONY: setup install build test lint lint-file lint-c4x clean package vsix typecheck quick-check check check-full verify-mcp validate-toolchain
.PHONY: verify-npm test-npm test-unit test-integration test-e2e test-mcp test-cli test-perf test-vsix-smoke test-vsix-uat test-all coverage coverage-all cve-scan
.PHONY: test-live verify-docs pre-commit help dev demo doctor format validate e2e

# Complete setup (first time)
setup: ## [Setup] First-time setup: install, build, compile tests, enable Git hooks
	@echo "🚀 Setting up C4X development environment..."
	@echo "📦 Installing dependencies..."
	pnpm install
	@echo "🔨 Building extension..."
	pnpm run build
	@echo "🧪 Compiling tests..."
	pnpm run test:compile
	@echo "✅ Setup complete! Run 'make test' to run tests, 'make package' to create VSIX"

# Install dependencies
install: ## [Setup] Install dependencies (pnpm install)
	@echo "📦 Installing dependencies..."
	pnpm install

# Build extension
build: ## [Develop] Build the extension (esbuild bundle and PEG.js parser)
	@echo "🔨 Building extension..."
	pnpm run build

# Compile TypeScript without running tests
typecheck: ## [Develop] Compile source and tests without running them
	@echo "🔎 Type-checking source and tests..."
	pnpm run test:compile


# Validate pinned toolchain consistency
validate-toolchain: ## [Check] Check that Node, pnpm and VS Code pins agree across files
	@echo "🛠️  Validating toolchain pins..."
	pnpm run validate:toolchain

# Verify the tracked, self-contained MCP server is current and functional
verify-mcp: ## [Check] Check the tracked MCP bundle is current
	@echo "🔌 Verifying C4X MCP bundle freshness..."
	pnpm run verify:mcp

verify-npm: ## [Check] Audit the npm package `c4x`: manifest rules and the dry-run pack list equal the allowlist
	@echo "📦 Auditing the npm package (npm pack --dry-run)..."
	node scripts/npm-package.js audit

test-npm: ## [Test] Pack the npm package, install it from the tarball, start the server, render, run the bundle contract on it
	@echo "📦 Smoke-testing the packed npm package..."
	node scripts/test-npm-package.js

test-mcp: ## [Test] MCP handshake, tool and resource tests
	@echo "🔌 Running C4X MCP protocol tests..."
	pnpm run test:mcp

# Functional test of the tracked c4x-lint bundle, run alone from a scratch directory
test-cli: ## [Test] c4x-lint bundle functional tests
	@echo "📐 Running c4x-lint bundle tests..."
	pnpm run test:cli

# C4 notation lint over the diagrams this repository publishes (#216). Runs the
# tracked bundle, so verify-mcp must pass first for the result to mean anything.
# At the default --max-severity error, only syntax and model errors fail: every
# notation rule defaults to info. Override either variable to widen the gate,
# e.g. make lint-c4x C4X_LINT_MAX_SEVERITY=warning
C4X_LINT_PATHS ?= samples '*.md' 'docs/*.md' docs/marketplace docs/reference
C4X_LINT_MAX_SEVERITY ?= error
lint-c4x: ## [Develop] Lint the repository C4X diagrams with the notation rules
	@echo "📐 Linting C4X diagrams (c4x-lint, --max-severity $(C4X_LINT_MAX_SEVERITY))..."
	node cli/c4x-lint.cjs $(C4X_LINT_PATHS) --max-severity $(C4X_LINT_MAX_SEVERITY) --quiet

# The C4X reference (#354): docs/reference/c4x-reference.{json,md} and the schema, generated from the
# grammar, the model builder, the style resolver and the lint catalogue.
reference: ## [Develop] Regenerate docs/reference/c4x-reference.{json,md} and its schema
	pnpm run generate:reference

verify-reference: ## [Check] Fail when the committed C4X reference differs from a fresh run
	pnpm run verify:reference

# Fast local development gate
quick-check: typecheck lint test-unit verify-mcp test-mcp verify-npm test-npm test-cli lint-c4x verify-reference validate-toolchain ## [Check] Fast loop: typecheck, lint, unit, MCP, CLI, C4X lint, toolchain
	@echo "✅ Quick checks passed!"

# Standard pull-request gate. The unit tier runs once, under c8, so the
# coverage gate and the per-directory floors (#367) cost one run, not two.
check: typecheck lint test-unit-coverage verify-mcp test-mcp verify-npm test-npm test-cli lint-c4x verify-reference validate-toolchain verify-docs build ## [Check] Pull-request gate: quick-check with the unit tier under coverage floors, plus documentation checks and a build
	@echo "✅ Standard checks passed!"



# Live generation gate. Set C4X_REQUIRE_LIVE=1 to fail without a working key.
# Every other gate mocks the model, which is how a retired image model shipped.
test-live: ## [Test] Live Gemini generation gate (needs GEMINI_API_KEY; skips without it)
	@echo "🌐 Live generation gate (real Gemini API calls)..."
	pnpm run test:live

check-full: check test coverage coverage-all test-e2e test-perf test-vsix-smoke test-live package cve-scan ## [Check] Release gate: check plus every tier, live Gemini, package and audit
	@echo "✅ Full checks passed!"

# A release-level invocation cannot claim success by skipping the live check.
check-full: export C4X_REQUIRE_LIVE=1

# Audit the complete lockfile, including build dependencies bundled into MCP.
#
# Accepted advisory exceptions (package.json "pnpm.auditConfig.ignoreGhsas").
# Each GHSA listed there is ignored individually; any other HIGH/CRITICAL
# advisory still fails this target. Never add an id without a dated entry here.
#
#   GHSA-fc5q-39xc-vjpf (picomatch <=4.0.7, ReDoS), accepted 2026-11-18 by the
#   maintainer, expires 2026-12-18 (#537). Build tooling only (vsce and
#   markdownlint-cli); no patched version exists. Remove it and pin an override
#   once a patched picomatch is published.
#
#   The dates are machine-enforced: scripts/audit-exceptions.json carries
#   each exception's expiry, and cve-scan fails once it has passed
#   (scripts/check-audit-exceptions.js).
#
#   Removed 2026-11-13: GHSA-vfj7-8cjw-p6xm (braces 3.0.3), accepted 2026-10-08
#   to expire 2026-11-07. GitHub withdrew the advisory on 2026-10-23 as not
#   practically exploitable, and pnpm audit no longer reports it (#281).
cve-scan: ## [Check] Audit dependencies; high and critical findings fail
	@echo "🔒 Auditing dependencies (HIGH/CRITICAL block release)..."
	node scripts/check-audit-exceptions.js
	pnpm audit --audit-level=high


# Run tests
test: ## [Test] Extension-host suite in a real VS Code (needs a display on Linux)
	@echo "🧪 Running tests..."
	pnpm run test:compile
	pnpm test

# Test phases
test-unit: ## [Test] Unit tests, no VS Code
	@echo "🧪 Running unit tests..."
	pnpm run test:compile
	pnpm run test:unit

test-integration: ## [Test] Extension loading test in a real VS Code
	@echo "🔗 Running integration tests..."
	pnpm run test:compile
	pnpm run test:integration

test-e2e: ## [Test] Playwright browser suite against the real preview client
	@echo "🌐 Running end-to-end tests..."
	pnpm run test:e2e

test-perf: ## [Test] Performance budgets
	@echo "⚡ Running performance benchmarks..."
	pnpm run bench

test-vsix-smoke: ## [Test] Package, install into a clean profile, activate, render
	@echo "📦 Running clean packaged-VSIX smoke test..."
	pnpm run test:vsix-smoke

# Installed-VSIX acceptance journey (#79): drives the packaged VSIX in an
# isolated profile through Playwright's Electron driver -- edit, save, undo,
# discard, conflict, restart, Markdown CodeLens, exports, keyboard. Writes a
# receipt and screenshots to .tmp/installed-uat/<timestamp> (or
# C4X_UAT_OUTPUT_DIR). Not in any composite gate. Linux needs a display:
#   xvfb-run -a -s "-screen 0 1920x1080x24" make test-vsix-uat
test-vsix-uat: ## [Test] Installed-VSIX acceptance journey (opt-in, not in any gate)
	@echo "🧭 Running the installed-VSIX acceptance journey..."
	pnpm run test:vsix-uat

test-all: ## [Test] Unit, MCP, integration, e2e, performance and VSIX smoke in turn
	@echo "🧪 Running all test phases (unit, MCP, integration, e2e, perf, vsix-smoke)..."
	$(MAKE) test-unit
	$(MAKE) test-mcp
	$(MAKE) test-integration
	$(MAKE) test-e2e
	$(MAKE) test-perf
	$(MAKE) test-vsix-smoke

# One unit run under c8: the Tier A gate, then the per-directory floors.
test-unit-coverage: ## [Test] Unit tier under coverage, with the Tier A gate and per-directory floors
	@echo "🧪 Running unit tests under coverage..."
	pnpm run test:compile
	pnpm run coverage

coverage: ## [Test] Unit-tier coverage with enforced floors
	@echo "📈 Generating test coverage report..."
	pnpm run coverage

# Merged whole-extension coverage: unit tier + extension-host tier, one c8
# temp directory, reported over src/** only.
coverage-all: ## [Test] Merged unit and extension-host coverage over src
	@echo "📈 Generating merged whole-extension coverage report..."
	pnpm run coverage:all

# Run linter
lint: ## [Develop] Run ESLint
	@echo "🔍 Linting code..."
	pnpm run lint

# Advisory IDE-hook entry point. C4X_LINT_FILE is validated by the adapter.
lint-file: ## [Develop] Lint one file: make lint-file C4X_LINT_FILE=path
	@test -n "$(C4X_LINT_FILE)" || { echo "C4X_LINT_FILE is required" >&2; exit 2; }
	pnpm exec eslint "$(C4X_LINT_FILE)" --no-error-on-unmatched-pattern

# Verify documentation (Markdown lint + C4X syntax check)
verify-docs: ## [Check] Markdown lint, C4X examples, links and section READMEs, doc claims
	@echo "📝 Verifying documentation..."
	pnpm run validate:docs
	@echo "🔗 Checking links and section READMEs..."
	node scripts/check-links.js
	@echo "🐍 Running strict C4X syntax check..."
	python3 scripts/check_c4x_syntax.py $$(find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/_agents/*" -not -path "*/.claude/*" -not -path "*/.tmp/*")

# Clean build artifacts
clean: ## [Maintain] Remove dist, out and node_modules
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist out node_modules

# Package VSIX
package: build ## [Release] Build c4x-*.vsix for the registries
	@echo "📦 Packaging VSIX..."
	pnpm run package
	@echo "✅ VSIX file created! Check the root directory for c4x-*.vsix"

.PHONY:

# Alias for package (create VSIX)
vsix: package ## [Release] Alias for package






# Pre-commit checks (3m pattern: make, measure, monitor)
pre-commit: check ## [Check] Same gate the commit hook runs (alias of check)
	@echo "✅ Pre-commit checks passed!"

# New entry points. validate and e2e are aliases; format is ESLint's auto-fix.
dev: ## [Develop] Rebuild on every change (watch mode); press F5 in VS Code to run
	pnpm run watch

validate: check ## [Check] Alias for check

e2e: test-e2e ## [Test] Alias for test-e2e

format: ## [Develop] Auto-fix what ESLint can (the repository has no separate formatter)
	pnpm exec eslint src mcp --fix

demo: build ## [Develop] Build, then open a sample diagram in an Extension Development Host (no cloud account or key)
	@if command -v code >/dev/null 2>&1; then \
		code --extensionDevelopmentPath="$(CURDIR)" samples/visual-layout/c1-refined-metadata.c4x; \
	else \
		echo "The 'code' command is not on PATH. Open this folder in VS Code, press F5 (see run_instruction.md), then open samples/visual-layout/c1-refined-metadata.c4x and run 'C4X: Open Preview'."; \
	fi

# Preflight: reports required and optional tools; names each gate that skips without one.
doctor: ## [Setup] Report every required and optional tool and each gate that skips without it
	@./scripts/doctor.sh

# Overlaps, by design: check = pre-commit = validate; package = vsix; test runs the extension
# host while test-unit runs no VS Code; test-e2e = e2e.
help: ## [Setup] This list
	@echo "C4X Extension - make targets (make doctor first on a new machine)"
	@for group in Setup Develop Check Test Release Maintain; do \
		echo ""; echo "$$group"; \
		awk -v g="$$group" -F':.*## ' '/^[a-zA-Z0-9_-]+:.*## \[/ { split($$2, a, "] "); if (substr(a[1], 2) == g) printf "  make %-24s %s\n", $$1, a[2] }' $(MAKEFILE_LIST); \
	done
	@echo ""
	@echo "First time: make doctor, make setup, make quick-check, make demo"
