#!/usr/bin/env bash
# Run the test suite at end of turn, but only if test files exist and deps are installed.
# Output is summarised so we don't flood the conversation.

set -u

[ -d node_modules ] || exit 0

TEST_COUNT=$(find src tests -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" -o -name "*.spec.tsx" \) 2>/dev/null | wc -l | tr -d ' ')

[ "${TEST_COUNT:-0}" = "0" ] && exit 0

pnpm test:run --silent 2>&1 | tail -25
exit 0
