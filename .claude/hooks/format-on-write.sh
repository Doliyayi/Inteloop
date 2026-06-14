#!/usr/bin/env bash
# Format the file just written/edited with Prettier, if installed.
# Reads Claude Code hook JSON from stdin.

set -u

FILE=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j.tool_input&&j.tool_input.file_path||"")}catch(e){}})' 2>/dev/null || true)

[ -z "${FILE:-}" ] && exit 0
[ -f "$FILE" ] || exit 0

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.css|*.md|*.yml|*.yaml)
    if [ -x "$(pwd)/node_modules/.bin/prettier" ]; then
      "$(pwd)/node_modules/.bin/prettier" --write --log-level=warn "$FILE" >/dev/null 2>&1 || true
    fi
    ;;
esac

exit 0
