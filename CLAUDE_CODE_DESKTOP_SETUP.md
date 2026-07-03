# Transitioning AthLink from Cowork to Claude Code Desktop
_Written 3 July 2026_

Goal: Claude Code Desktop app (the "Code" tab, same app as Cowork) becomes the
primary driver for AthLink — vibe code → test → push, in one loop, with no
handoff back to you for the push step. Cowork stays for everything outside
this repo.

## 0. What's already true — don't redo this

Checked the repo before writing this. You're not starting cold:

- **Claude Code CLI has already run here.** `.claude/settings.local.json`
  already allowlists `git commit`, `git push`, `ssh-keygen`, `gh auth` — a
  prior session already generated an SSH key and used it to push. The "Cowork
  can't push, Claude Code can" gap is already closed on your machine.
- **The test gate is already wired.** `.claude/agents/athlink-tester.md` +
  the Stop hook in `.claude/settings.json` (running `tools/pre_push_test.sh`)
  fire automatically in any Claude Code session, terminal or Desktop app.
- **You already have 7 feature branches in flight**: `athlete-claim-flow`,
  `athlete-owner-editing`, `athlete-profile-polish`, `design-sync-setup`,
  `liquid-glass-buttons`, `monorepo-migration`, `parser-confidence-gate` (plus
  `main`). This IS the parallel-task pattern the sync-before-push rule exists
  for — it's already happening, this setup just makes it safe by construction.

## 1. Make the Desktop app your daily driver

1. Open the Claude Desktop app (the app you're in right now) → **Code** tab.
2. Add AthLink2.0 as a project, pointed at `~/Desktop/AthLink2.0`.
3. Open a session on `main` first. Confirm it's reading `CLAUDE.md` (it should
   reference AthLink specifics unprompted). First time it needs to run the
   Stop hook, approve it — one-time per machine.
4. Run `npm run dev` (in the Desktop app's built-in terminal, or your own) so
   the app-preview pane can show `localhost:5173` live — this replaces the
   manual "take a screenshot of localhost" step from the Cowork loop.

## 2. Give each in-flight branch its own worktree

Right now all 7 branches share one working directory, so switching between
them means `git checkout`, which risks stepping on uncommitted changes from
whichever task touched that file last. Worktrees fix this — one physical
folder per branch, one `.git` history shared underneath:

```bash
cd ~/Desktop/AthLink2.0
git worktree add ../AthLink2.0-athlete-claim-flow athlete-claim-flow
git worktree add ../AthLink2.0-parser-confidence-gate parser-confidence-gate
# ...repeat for whichever branches you're actively driving with an agent
```

Open each `../AthLink2.0-<branch>` folder as its own Code tab/session in the
Desktop app. Now two sessions genuinely cannot collide on disk. Remove a
worktree once its branch merges: `git worktree remove ../AthLink2.0-<branch>`.

You don't need a worktree for a branch nobody's actively driving right now —
only for the ones with a live agent session against them.

## 3. Use `/push` instead of a bare `git push`

Already built into the repo as `.claude/commands/push.md`. When you say
"push" in any Claude Code session (terminal or Desktop), it now:

1. Fetches `origin`.
2. Rebases this branch's changes onto the latest remote HEAD, resolving any
   conflict in favor of the most recently pushed work (so one task's push can
   never revert another's).
3. Runs `tools/pre_push_test.sh` — same gate as before.
4. On FAIL: stops, shows what broke.
5. On PASS: pushes. Parser/risky changes go to their feature branch (for a
   Vercel preview) rather than straight to `main`.

This is the one meaningful behavior change: previously the agent could edit
and test but handed you a `git push` command to run yourself. Now, on your
own machine, the same agent runs it end to end. Nothing pushes without you
saying "push" first — that gate hasn't moved.

## 4. Verify a branch before merging to main

For anything touching `api/parse_pdf.py` or other parser logic: push to the
feature branch, let Vercel build a preview deploy, test against that preview
URL (not localhost — the local `/api` proxy always hits the currently-live
parser, never your branch's), then merge to `main`. `/push` already routes
risky changes this way by default.

## 5. Where Cowork still fits

Keep using this chat for:
- Anything outside `~/Desktop/AthLink2.0` — Deltatrim, recruiting, cross-venture planning.
- Anything touching the Obsidian vault (`AIOS`) — Claude Code Desktop has no
  access to it, and code should stay out of the vault anyway per your own rule.
- Quick one-offs where opening a full Code session is overkill.

## 6. Cheat sheet

| You want to... | Do this |
|---|---|
| Start working on AthLink | Open Desktop app → Code tab → pick the project/worktree for that branch |
| See the live app while iterating | `npm run dev`, watch the app-preview pane |
| Push | Say "push" — `/push` handles sync + test + push |
| Work two tasks at once | One worktree + one Code session per branch |
| Verify a parser change | Push to branch → check the Vercel preview URL, not localhost |
| Plan/write docs, non-AthLink work | Cowork (here) |
