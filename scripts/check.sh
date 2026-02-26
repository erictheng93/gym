#!/bin/bash
# scripts/check.sh — Smart health check for Claude Code PostToolUse hook
# Detects file type and module, runs ESLint + TypeScript + related tests
# Always exits 0 so stdout becomes Claude's context for auto-fixing

# Read hook JSON from stdin
INPUT=$(cat)

# Parse file_path using bun (handles JSON escaping and Windows paths)
FILE_PATH=$(echo "$INPUT" | bun -e 'const t=await Bun.stdin.text();try{const d=JSON.parse(t);console.log((d.tool_input?.file_path||"").replace(/\\/g,"/"))}catch{}')

# Exit silently for non-file operations
[ -z "$FILE_PATH" ] && exit 0

# Only check code files (.ts, .tsx, .js, .jsx, .vue)
case "${FILE_PATH##*.}" in
  ts|tsx|js|jsx|vue) ;;
  *) exit 0 ;;
esac

# Determine project root and module
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

case "$FILE_PATH" in
  *backend*) MODULE_DIR="$PROJECT_ROOT/backend" ;;
  *frontend*) MODULE_DIR="$PROJECT_ROOT/frontend" ;;
  *) exit 0 ;;
esac

ERRORS=0

# --- 1. ESLint single file ---
LINT_OUT=$(cd "$MODULE_DIR" && bunx eslint "$FILE_PATH" 2>&1); LINT_RC=$?
if [ $LINT_RC -ne 0 ] && [ -n "$LINT_OUT" ]; then
  echo "=== ESLint errors ==="
  echo "$LINT_OUT"
  ERRORS=1
fi

# --- 2. TypeScript typecheck ---
TS_OUT=$(cd "$MODULE_DIR" && bun run typecheck 2>&1); TS_RC=$?
if [ $TS_RC -ne 0 ]; then
  echo "=== TypeScript errors ==="
  echo "$TS_OUT"
  ERRORS=1
fi

# --- 3. Find and run related test file ---
EXT="${FILE_PATH##*.}"
BASENAME=$(basename "$FILE_PATH" ".$EXT")
FILE_DIR=$(dirname "$FILE_PATH")

TEST_FILE=""

# If the file itself is a test file, run it directly
if echo "$FILE_PATH" | grep -qE '\.(test|spec)\.[^.]+$'; then
  TEST_FILE="$FILE_PATH"
else
  # Search same directory
  for sfx in .test.ts .spec.ts .test.tsx .spec.tsx; do
    [ -f "$FILE_DIR/${BASENAME}${sfx}" ] && TEST_FILE="$FILE_DIR/${BASENAME}${sfx}" && break
  done
  # Backend: also check tests/ directory
  if [ -z "$TEST_FILE" ]; then
    for sfx in .test.ts .spec.ts; do
      [ -f "$MODULE_DIR/tests/${BASENAME}${sfx}" ] && TEST_FILE="$MODULE_DIR/tests/${BASENAME}${sfx}" && break
    done
  fi
fi

if [ -n "$TEST_FILE" ]; then
  TEST_OUT=$(cd "$MODULE_DIR" && bunx vitest run "$TEST_FILE" 2>&1); TEST_RC=$?
  if [ $TEST_RC -ne 0 ]; then
    echo "=== Test failures ==="
    echo "$TEST_OUT" | tail -50
    ERRORS=1
  fi
fi

# Summary
if [ $ERRORS -ne 0 ]; then
  echo ""
  echo "❌ check.sh: errors found — please fix automatically"
fi

# Always exit 0 so stdout becomes Claude context
exit 0
