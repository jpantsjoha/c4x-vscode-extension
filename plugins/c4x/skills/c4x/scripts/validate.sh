#!/bin/sh
# Check C4X without MCP: syntax, model and every lint rule, failing on any finding.
# Usage: validate.sh <file.c4x | file.md> ...   (works from any directory)
# Looks for c4x-lint in this order: next to this script, in a repository checkout
# that holds this skill, $C4X_LINT, ./tools and ./cli of the current directory, then PATH.
if [ "$#" -eq 0 ]; then
  echo "usage: validate.sh <file.c4x | file.md> ..." >&2
  exit 2
fi
here=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
for candidate in "$here/c4x-lint.cjs" "$here/../../../cli/c4x-lint.cjs" "$C4X_LINT" ./tools/c4x-lint.cjs ./cli/c4x-lint.cjs; do
  if [ -n "$candidate" ] && [ -f "$candidate" ]; then
    exec node "$candidate" --max-severity info "$@"
  fi
done
if command -v c4x-lint >/dev/null 2>&1; then
  exec c4x-lint --max-severity info "$@"
fi
cat >&2 <<MSG
c4x-lint not found. Install it one of these ways, then run this script again:
  - copy cli/c4x-lint.cjs from the C4X repository to tools/c4x-lint.cjs (see docs/C4X-LINT-CLI.md);
  - set C4X_LINT to the path of c4x-lint.cjs;
  - put a command named c4x-lint on PATH.
MSG
exit 2
