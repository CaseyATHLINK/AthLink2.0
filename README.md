# AthLink MVP

A working prototype of the AthLink core loop: import a regatta's results →
auto-build a verified profile for every sailor (helm + crew) → merge across
events → claim to track. Pre-loaded with the real 2023 29er Asian Championship.

---

## How to run it on your computer (no coding needed)

You need **Node.js** installed once. Then it's two commands.

### 1. Install Node.js (one time)
Go to https://nodejs.org and download the "LTS" version. Install it like any
normal app. This gives your computer the ability to run JavaScript projects.

### 2. Open this folder in a terminal
- **Mac:** open the Terminal app, type `cd ` (with a space), then drag this
  `athlink` folder onto the terminal window and press Enter.
- **Windows:** open this folder, click the address bar, type `cmd`, press Enter.

### 3. Run these two commands
```
npm install
npm run dev
```

The first command downloads what the app needs (takes a minute the first time).
The second starts it. You'll see a line like:

```
  ➜  Local:   http://localhost:5173/
```

Hold Ctrl (Cmd on Mac) and click that link, or paste it into your browser.
The app is now running. To stop it, press Ctrl + C in the terminal.

---

## Using it with Claude Code

This folder is a normal code project, so Claude Code can work on it directly.

1. Install Claude Code: https://code.claude.com/docs/en/overview
2. In the terminal, make sure you're inside this `athlink` folder (step 2 above).
3. Type `claude` and press Enter.
4. Claude Code will read `CLAUDE.md` (the context file in this folder) so it
   knows the product, the decisions so far, and what to build next. Just talk
   to it in plain English: "add a date-of-birth field to profiles," etc.

---

## What's where

- `src/App.jsx` — the entire app (UI + scoring engine + data). This is the file
  to edit or hand to a developer.
- `CLAUDE.md` — project context and decisions, so any Claude (or developer)
  picks up where we left off.
- everything else — standard React/Vite plumbing you can ignore.
