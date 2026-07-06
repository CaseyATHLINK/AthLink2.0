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
# Env overrides (for testing): PREPUSH_BUILD_CMD="..." ; PREPUSH_FORCE=front,back
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
CHANGED="$(git status --porcelain 2>/dev/null | sed 's/^...//; s/.* -> //')"
if [ -n "${PREPUSH_FORCE:-}" ]; then
  case "$PREPUSH_FORCE" in *front*|*both*) FRONT=1;; esac
  case "$PREPUSH_FORCE" in *back*|*both*) BACK=1;; esac
else
  # Frontend lives in the monorepo workspaces after the migration; the legacy
  # top-level src/ is kept for backward-compat. Match any of them.
  printf '%s\n' "$CHANGED" | grep -qE '^(src|apps/[^/]+/src|sports/[^/]+/src|packages/[^/]+/src)/' && FRONT=1
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
  # Fast frontend gate: esbuild-bundle each CHANGED js/jsx frontend file with
  # react + the @athlink/* workspace packages marked external. Catches syntax /
  # JSX / broken-local-import errors (the white-screen vector) in well under a
  # second. Points at the real monorepo paths — the old check hard-coded
  # `src/App.jsx`, which no longer exists post-migration, so it silently no-op'd.
  #
  # This is deliberately NOT the full production build: `pnpm --filter
  # @athlink/web build` takes minutes (too slow to run on every Stop-hook turn)
  # and is already run authoritatively by Vercel CI on push. Run it locally
  # before a merge if you want the full workspace-resolved build.
  ESB="${ESBUILD_BIN:-}"
  # A candidate must actually run: pnpm's find-able .bin entries can be node
  # shims pointing at the native Mach-O binary, which node can't execute.
  esb_ok(){ "$1" --version >/dev/null 2>&1; }
  if [ -z "$ESB" ]; then
    for c in "$REPO/node_modules/.bin/esbuild" \
             "$REPO/node_modules/.pnpm/node_modules/.bin/esbuild" \
             "$REPO/apps/web/node_modules/.bin/esbuild" \
             "$REPO/.ds-sync/node_modules/.bin/esbuild"; do
      [ -x "$c" ] && esb_ok "$c" && ESB="$c" && break
    done
  fi
  if [ -z "$ESB" ]; then
    while IFS= read -r c; do
      esb_ok "$c" && ESB="$c" && break
    done < <(find "$REPO" -path '*/node_modules/.bin/esbuild' -type f 2>/dev/null)
  fi
  [ -z "$ESB" ] && command -v esbuild >/dev/null 2>&1 && ESB="esbuild"
  [ -z "$ESB" ] && ESB="npx --yes esbuild"

  FILES="$(printf '%s\n' "$CHANGED" | grep -E '^(src|apps/[^/]+/src|sports/[^/]+/src|packages/[^/]+/src)/.*\.(jsx?|tsx?)$' || true)"
  if [ -z "$FILES" ]; then
    add "PASS  frontend: changed files need no bundle check"
  else
    while IFS= read -r f; do
      [ -n "$f" ] && [ -f "$f" ] || continue
      OUT="$($ESB "$f" --bundle --format=esm --outfile=/dev/null \
        --loader:.jsx=jsx --loader:.js=jsx --loader:.css=empty \
        --external:react --external:react-dom --external:lucide-react \
        --external:recharts --external:d3-force --external:"@athlink/*" 2>&1)"
      if [ $? -eq 0 ]; then
        add "PASS  esbuild: $f"
      else
        HARD_FAIL=1
        add "FAIL  esbuild $f:"
        add "$(printf '%s' "$OUT" | head -15)"
      fi
    done <<< "$FILES"
  fi
  add "NOTE  esbuild can't catch TDZ / use-before-declare (the white-screen vector)."
  add "      Eyeball any new useEffect / importerHost / _orgHost / _orgMode ordering,"
  add "      then confirm localhost:5173 renders. Full build runs on Vercel CI at push."
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
