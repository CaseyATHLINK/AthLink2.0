#!/usr/bin/env bash
# AthLink pre-push test gate.
#
# Runs the deterministic localhost checks for whatever changed (frontend and/or
# backend) and prints a single PASS / FAIL verdict. Used two ways:
#   1. As a Claude Code **Stop hook** (see .claude/settings.json) so it fires
#      automatically when any session finishes making changes — it then emits a
#      JSON {"decision":"block",...} so the assistant relays the verdict to Casey.
#   2. By hand or by the `athlink-tester` subagent: just run it.
#
# It never fails your shell (always exits 0); it reports, it doesn't abort.
#
# Env overrides (for testing): ESBUILD_BIN=/path/to/esbuild ; PREPUSH_FORCE=front,back
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO" || exit 0

# ---------------------------------------------------------------------------
# Read hook stdin (if invoked as a hook) and bail out if we are already
# continuing from a previous Stop hook — prevents an infinite stop->report loop.
# ---------------------------------------------------------------------------
HOOK_JSON=""
if [ ! -t 0 ]; then HOOK_JSON="$(cat 2>/dev/null)"; fi
if [ -n "$HOOK_JSON" ] && command -v python3 >/dev/null 2>&1; then
  stop_active="$(printf '%s' "$HOOK_JSON" | python3 -c 'import sys,json
try: d=json.load(sys.stdin)
except Exception: d={}
print(str(d.get("stop_hook_active", False)).lower())' 2>/dev/null)"
  [ "$stop_active" = "true" ] && exit 0
fi

# ---------------------------------------------------------------------------
# Detect what changed (working tree: staged, unstaged, untracked).
# ---------------------------------------------------------------------------
FRONT=0; BACK=0
if [ -n "${PREPUSH_FORCE:-}" ]; then
  case "$PREPUSH_FORCE" in *front*|*both*) FRONT=1;; esac
  case "$PREPUSH_FORCE" in *back*|*both*) BACK=1;; esac
else
  CHANGED="$(git status --porcelain 2>/dev/null | sed 's/^...//; s/.* -> //')"
  printf '%s\n' "$CHANGED" | grep -qE '^src/'        && FRONT=1
  printf '%s\n' "$CHANGED" | grep -qE '^api/.*\.py$' && BACK=1
fi
# Nothing testable changed -> stay silent so normal chit-chat turns aren't noisy.
[ "$FRONT" -eq 0 ] && [ "$BACK" -eq 0 ] && exit 0

REPORT=""
HARD_FAIL=0
REVIEW=0
add(){ REPORT="${REPORT}${1}"$'\n'; }

# ---------------------------------------------------------------------------
# Frontend checks
# ---------------------------------------------------------------------------
if [ "$FRONT" -eq 1 ]; then
  ESB="${ESBUILD_BIN:-}"
  if [ -z "$ESB" ]; then
    if [ -x "$REPO/node_modules/.bin/esbuild" ]; then ESB="$REPO/node_modules/.bin/esbuild"
    elif command -v esbuild >/dev/null 2>&1; then ESB="esbuild"
    else ESB="npx --yes esbuild"; fi
  fi
  ESB_OUT="$($ESB src/App.jsx --loader:.jsx=jsx --bundle \
    --external:react --external:react-dom --external:lucide-react \
    --external:recharts --format=esm --outfile=/dev/null 2>&1)"
  if [ $? -eq 0 ]; then
    add "PASS  frontend esbuild: clean"
  else
    HARD_FAIL=1
    add "FAIL  frontend esbuild error:"
    add "$(printf '%s' "$ESB_OUT" | head -15)"
  fi
  add "NOTE  TDZ: esbuild can't catch use-before-declare (the white-screen vector)."
  add "      Eyeball any new useEffect / importerHost / _orgHost / _orgMode ordering."
  add "      Then confirm localhost:5173 renders (start dev server if it's down)."
fi

# ---------------------------------------------------------------------------
# Backend checks (parser). NB: localhost can't test these — the dev /api proxy
# hits the LIVE Vercel parser, so the harness is the authoritative local test.
# ---------------------------------------------------------------------------
if [ "$BACK" -eq 1 ]; then
  for f in api/parse_pdf.py api/validate.py api/ai_filter.py; do
    [ -f "$f" ] || continue
    if python3 -c "import ast; ast.parse(open('$f').read())" 2>/dev/null; then
      add "PASS  ${f##*/} syntax ok"
    else
      HARD_FAIL=1; add "FAIL  ${f##*/} syntax error"
    fi
  done
  if [ -f tools/test_parser.py ]; then
    H_OUT="$(python3 tools/test_parser.py --diff 2>&1)"
    if printf '%s' "$H_OUT" | grep -q 'No changes'; then
      add "PASS  parser harness: all fixtures unchanged vs baseline"
    elif printf '%s' "$H_OUT" | grep -q 'Changes detected'; then
      REVIEW=1
      add "REVIEW  parser harness CHANGED vs baseline — confirm intended (not a regression):"
      add "$(printf '%s' "$H_OUT" | grep -E 'CHANGED|->|^=|\.pdf' | head -24)"
      add "      If intended, refresh baseline ONLY on Casey's go-ahead: python3 tools/test_parser.py --json"
    else
      REVIEW=1; add "REVIEW  parser harness unexpected output:"; add "$(printf '%s' "$H_OUT" | tail -12)"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Verdict
# ---------------------------------------------------------------------------
if   [ $HARD_FAIL -eq 1 ]; then VERDICT="FAIL"
elif [ $REVIEW    -eq 1 ]; then VERDICT="PASS (review items)"
else VERDICT="PASS"; fi

SUMMARY="AthLink pre-push gate — ${VERDICT}
${REPORT}"
mkdir -p "$REPO/.claude" 2>/dev/null
printf '%s\n' "$SUMMARY" > "$REPO/.claude/last_test_result.txt" 2>/dev/null || true
printf '%s\n' "$SUMMARY" >&2

# As a Stop hook: force the assistant to relay the verdict (guarded above).
if [ -n "$HOOK_JSON" ] && command -v python3 >/dev/null 2>&1; then
  REASON="${SUMMARY}
Relay this verdict to Casey now, conclusion first. If FAIL, say what to fix and do NOT push. If PASS, say it's safe and offer to push to Vercel (he just says \"push\")."
  printf '%s' "$REASON" | python3 -c 'import sys,json; print(json.dumps({"decision":"block","reason":sys.stdin.read()}))'
fi
exit 0
