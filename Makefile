.PHONY: setup install build test lint clean package vsix
 .PHONY: test-unit test-integration test-e2e test-perf test-all coverage

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

test-all:
	@echo "🧪 Running all test phases (unit, integration, e2e, perf)..."
	$(MAKE) test-unit
	$(MAKE) test-integration
	$(MAKE) test-e2e
	$(MAKE) test-perf

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
	python3 scripts/check_c4x_syntax.py $$(find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/_agents/*" -not -path "*/.claude/*")

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

# Sync to public repo
sync:
	@if [ -z "$(DEST)" ]; then echo "Usage: make sync DEST=../path-to-public-repo"; exit 1; fi
	@echo "🚀 Syncing to public repo: $(DEST)"
	@./scripts/publish-to-public.sh "$(DEST)"

# Pause iCloud sync (prevents ETIMEDOUT on node_modules file reads)
icloud-pause:
	@echo "⏸️  Pausing iCloud Drive sync processes..."
	@killall bird 2>/dev/null && echo "  Stopped: bird" || echo "  bird not running"
	@killall cloudd 2>/dev/null && echo "  Stopped: cloudd" || echo "  cloudd not running"
	@echo "✅ iCloud paused. Processes will restart automatically or run 'make icloud-resume'"

# Resume iCloud sync
icloud-resume:
	@echo "▶️  Resuming iCloud Drive sync..."
	@killall -CONT bird 2>/dev/null || true
	@launchctl kickstart -k gui/$$(id -u)/com.apple.bird 2>/dev/null || true
	@launchctl kickstart -k gui/$$(id -u)/com.apple.cloudd 2>/dev/null || true
	@echo "✅ iCloud resumed"

# Package with iCloud paused (prevents ETIMEDOUT)
package-safe: icloud-pause build
	@echo "📦 Packaging VSIX (iCloud paused)..."
	pnpm run package
	@echo "✅ VSIX created. Resuming iCloud..."
	@$(MAKE) icloud-resume

# Package via /tmp to completely bypass iCloud filesystem (most reliable)
# Uses include-only copy to avoid iCloud-dehydrated files causing mmap timeouts
package-local:
	@echo "📦 Copying to /tmp/c4x-build for packaging (bypasses iCloud)..."
	@rm -rf /tmp/c4x-build && mkdir -p /tmp/c4x-build
	@cp package.json pnpm-lock.yaml tsconfig.json esbuild.config.js .vscodeignore README.md CHANGELOG.md LICENSE /tmp/c4x-build/
	@cp -R src syntaxes /tmp/c4x-build/
	@mkdir -p /tmp/c4x-build/assets/marketplace && cp assets/marketplace/icon.png /tmp/c4x-build/assets/marketplace/
	@test -d snippets && cp -R snippets /tmp/c4x-build/ || true
	@cd /tmp/c4x-build && pnpm install --frozen-lockfile --prefer-offline 2>/dev/null && pnpm run package
	@cp /tmp/c4x-build/c4x-*.vsix .
	@rm -rf /tmp/c4x-build
	@echo "✅ VSIX created: $$(ls c4x-*.vsix)"
	@ls -lh c4x-*.vsix

# Pre-commit checks (3m pattern: make, measure, monitor)
pre-commit: lint verify-docs build test
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
	@echo "  make test       - Run default test suite"
	@echo "  make test-unit  - Run unit tests"
	@echo "  make test-integration - Run integration tests"
	@echo "  make test-e2e   - Run end-to-end tests"
	@echo "  make test-perf  - Run performance benchmarks"
	@echo "  make test-all   - Run unit + integration + e2e + perf"
	@echo "  make coverage   - Generate coverage report"
	@echo "  make lint       - Run ESLint"
	@echo "  make verify-docs - Verify documentation (markdown lint + C4X syntax)"
	@echo ""
	@echo "Publishing:"
	@echo "  make package    - Create VSIX file for marketplace"
	@echo "  make vsix       - Alias for 'make package'"
	@echo "  make sync DEST=../public-repo - Sync to public repo"
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean      - Remove build artifacts (dist, out, node_modules)"
	@echo "  make pre-commit - Run all checks (lint + build + test)"
	@echo ""
	@echo "iCloud Drive:"
	@echo "  make icloud-pause  - Kill bird/cloudd to prevent ETIMEDOUT on node_modules"
	@echo "  make icloud-resume - Restart iCloud sync processes"
	@echo "  make package-safe  - Pause iCloud, build VSIX, resume iCloud"
	@echo "  make package-local - Copy to /tmp, build VSIX, copy back (most reliable)"
	@echo ""
	@echo "Quick Start:"
	@echo "  1. make setup        (first time only)"
	@echo "  2. make test         (validate everything works)"
	@echo "  3. make package      (create VSIX for marketplace)"
