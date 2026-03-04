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
	python3 scripts/check_c4x_syntax.py $$(find . -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*")

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
	@echo ""
	@echo "Maintenance:"
	@echo "  make clean      - Remove build artifacts (dist, out, node_modules)"
	@echo "  make pre-commit - Run all checks (lint + build + test)"
	@echo ""
	@echo "Quick Start:"
	@echo "  1. make setup        (first time only)"
	@echo "  2. make test         (validate everything works)"
	@echo "  3. make package      (create VSIX for marketplace)"
