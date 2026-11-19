#!/usr/bin/env bash
# Preflight: reports every tool the gates use, what to install when one is missing,
# and each gate that skips or fails without an optional tool.
# Exit 1 only when a REQUIRED tool is missing or at the wrong version.
set -u
cd "$(dirname "$0")/.."
bad=0
ok()   { printf '  ok      %-26s %s\n' "$1" "$2"; }
miss() { printf '  MISSING %-26s %s\n' "$1" "$2"; }
warn() { printf '  SKIPS   %-26s %s\n' "$1" "$2"; }

echo "Required"
want_node=$(tr -d 'v \n' < .nvmrc)
have_node=$(node -p 'process.versions.node' 2>/dev/null || echo none)
if [ "$have_node" = "$want_node" ]; then ok "node $want_node" "matches .nvmrc"
else miss "node $want_node" "found $have_node. Install: nvm install && nvm use (reads .nvmrc)"; bad=1; fi

want_pnpm=$(node -p "require('./package.json').packageManager.split('@')[1]" 2>/dev/null || echo "")
have_pnpm=$(pnpm --version 2>/dev/null || echo none)
if [ "$have_pnpm" = "$want_pnpm" ]; then ok "pnpm $want_pnpm" "matches packageManager"
else miss "pnpm $want_pnpm" "found $have_pnpm. Install: corepack enable && corepack prepare pnpm@$want_pnpm --activate"; bad=1; fi

for tool in git make; do
  if command -v "$tool" >/dev/null 2>&1; then ok "$tool" "$(command -v "$tool")"
  else miss "$tool" "install it with your package manager (xcode-select --install on macOS)"; bad=1; fi
done

if [ -d node_modules ]; then ok "node_modules" "installed"
else miss "node_modules" "run: pnpm install --frozen-lockfile"; bad=1; fi

echo "Optional (a gate that needs one fails or skips without it)"
if command -v python3 >/dev/null 2>&1; then ok "python3" "make verify-docs (strict C4X syntax check)"
else warn "python3" "make verify-docs and make check fail. Install Python 3"; fi

if command -v code >/dev/null 2>&1; then ok "code CLI" "make demo opens the Extension Development Host"
else warn "code CLI" "make demo prints instructions instead of launching. Install: VS Code, Command Palette > Shell Command: Install 'code' command"; fi

if [ "$(uname -s)" = "Linux" ]; then
  if command -v xvfb-run >/dev/null 2>&1; then ok "xvfb-run" "make test (extension host) and make test-vsix-uat"
  else warn "xvfb-run" "make test and make test-vsix-uat need a display on Linux. Install: apt install xvfb"; fi
fi

# playwright.config.ts sets headless: true, which the runner (@playwright/test) serves with
# chromium-headless-shell, not full chromium. Ask the runner's own registry where that build must be.
pw_exe=""
[ -d node_modules/@playwright/test ] && pw_exe=$(node -e "
const pw = require.resolve('playwright/package.json', { paths: [require.resolve('@playwright/test')] });
const core = require.resolve('playwright-core/package.json', { paths: [pw] });
const { registry } = require(require('path').dirname(core) + '/lib/server/registry/index.js');
console.log(registry.findExecutable('chromium-headless-shell').executablePath() || '');" 2>/dev/null || true)
if [ -n "$pw_exe" ] && [ -e "$pw_exe" ]; then ok "Playwright chromium-headless-shell" "$pw_exe"
elif [ -n "$pw_exe" ]; then warn "Playwright chromium-headless-shell" "make test-e2e fails: $pw_exe is missing. Install with the e2e runner: node ./node_modules/@playwright/test/cli.js install chromium-headless-shell"
else warn "Playwright chromium-headless-shell" "cannot tell until node_modules is installed; then run make doctor again"; fi

if command -v unzip >/dev/null 2>&1; then ok "unzip" "make validate-public-artifact, make check-full"
else warn "unzip" "make validate-public-artifact and make check-full fail. Install it with your package manager"; fi

if [ -n "${GEMINI_API_KEY:-}${GEMINI_API_KEY_FALLBACK:-}" ]; then ok "GEMINI_API_KEY" "make test-live runs against the real API"
elif [ "${C4X_REQUIRE_LIVE:-}" = "1" ]; then miss "GEMINI_API_KEY" "C4X_REQUIRE_LIVE=1: make test-live and make check-full fail"; bad=1
else warn "GEMINI_API_KEY" "make test-live skips live generation (make check-full sets C4X_REQUIRE_LIVE=1 and fails instead). Export the key in your shell; never write it to a file"; fi

node_major=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$node_major" -ge 22 ] 2>/dev/null; then ok "Node >= 22" "make conformance-dogfood"
else warn "Node >= 22" "make conformance-dogfood fails on Node $have_node (dependency-cruiser 18). Put a Node 22 first on PATH"; fi

if [ -d .githooks ]; then
  hp=$(git config core.hooksPath 2>/dev/null || true)
  if [ "$hp" = ".githooks" ]; then ok "git hooks" "core.hooksPath = .githooks"
  elif [ -n "$hp" ] && grep -q '\.githooks' "$hp/pre-commit" 2>/dev/null; then ok "git hooks" "$hp chains to .githooks"
  else warn "git hooks" "commit and push gates do not run. Fix: make setup"; fi
fi

echo
if [ "$bad" -eq 0 ]; then echo "doctor: required tools present. SKIPS lines name gates that will not run as written."
else echo "doctor: a required tool is missing (see MISSING above)."; fi
exit "$bad"
