#!/usr/bin/env node
// Static safety net for the decomposed sailing frontend (and any workspace module).
//
// Catches the two bug classes the esbuild/Vite build does NOT flag:
//   1. no-undef      — an identifier referenced but never imported/declared becomes
//                      a global reference → runtime ReferenceError.
//   2. bad-import    — `import { x } from './m'` where m doesn't export x → silently
//                      undefined at runtime, no build error.
//
// Usage:  node tools/check-modules.mjs           # checks the sailing modules + auth pkg
//         node tools/check-modules.mjs <file...>  # checks specific files
//
// Requires @babel/parser + @babel/traverse (already in the workspace via Vite).
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Resolve babel from wherever pnpm put it.
function loadBabel() {
  const bases = [
    join(ROOT, "node_modules/.pnpm/node_modules"),
    join(ROOT, "node_modules"),
  ];
  for (const b of bases) {
    try {
      const req = createRequire(b + "/");
      const parser = req("@babel/parser");
      const t = req("@babel/traverse");
      return { parser, traverse: t.default || t };
    } catch { /* try next */ }
  }
  // last resort: scan the pnpm store
  const store = join(ROOT, "node_modules/.pnpm");
  if (existsSync(store)) {
    const p = readdirSync(store).find((d) => d.startsWith("@babel+parser@"));
    const tr = readdirSync(store).find((d) => d.startsWith("@babel+traverse@"));
    if (p && tr) {
      const parser = createRequire(join(store, p, "node_modules") + "/")("@babel/parser");
      const tmod = createRequire(join(store, tr, "node_modules") + "/")("@babel/traverse");
      return { parser, traverse: tmod.default || tmod };
    }
  }
  console.error("check-modules: could not load @babel/parser — run `pnpm install` first.");
  process.exit(2);
}
const { parser, traverse } = loadBabel();

const PLUGINS = ["jsx", "classProperties", "optionalChaining", "nullishCoalescingOperator", "objectRestSpread"];
const parse = (code) => parser.parse(code, { sourceType: "module", plugins: PLUGINS });

const GLOBALS = new Set([
  "Object","Array","String","Number","Boolean","Math","JSON","Date","RegExp","Map","Set","WeakMap","WeakSet",
  "Promise","Symbol","Proxy","Reflect","Error","TypeError","RangeError","Function","BigInt",
  "parseInt","parseFloat","isNaN","isFinite","encodeURIComponent","decodeURIComponent","encodeURI","decodeURI",
  "Infinity","NaN","undefined","globalThis","structuredClone","queueMicrotask","Intl","escape","unescape",
  "window","document","navigator","location","history","console","fetch","Headers","Request","Response",
  "AbortController","AbortSignal","FormData","URL","URLSearchParams","Blob","File","FileReader","Image","Audio",
  "XMLHttpRequest","WebSocket","EventSource","localStorage","sessionStorage","crypto","atob","btoa",
  "setTimeout","clearTimeout","setInterval","clearInterval","requestAnimationFrame","cancelAnimationFrame",
  "requestIdleCallback","getComputedStyle","matchMedia","alert","confirm","prompt","performance","screen",
  "HTMLElement","Node","Element","Event","CustomEvent","MutationObserver","IntersectionObserver","ResizeObserver",
  "DOMParser","TextEncoder","TextDecoder","Uint8Array","Uint8ClampedArray","Int8Array","Uint16Array","Int16Array",
  "Uint32Array","Int32Array","Float32Array","Float64Array","ArrayBuffer","DataView","Path2D","process",
]);

// ---- known @athlink/* → package entry ----
const WORKSPACE = {
  "@athlink/core": "packages/core",
  "@athlink/rating": "packages/features/rating",
  "@athlink/auth": "packages/features/auth",
  "@athlink/design-system": "packages/design-system",
  "@athlink/sport-kit": "packages/sport-kit",
};
function workspaceEntry(spec) {
  const dir = WORKSPACE[spec];
  if (!dir || !existsSync(join(ROOT, dir, "package.json"))) return null;
  const pkg = JSON.parse(readFileSync(join(ROOT, dir, "package.json"), "utf8"));
  let main = pkg.main || (pkg.exports && pkg.exports["."]) || "index.js";
  if (typeof main !== "string") main = main.import || main.default || "index.js";
  return join(ROOT, dir, main);
}
function resolveSpec(fromFile, spec) {
  if (spec.startsWith("@athlink/")) return workspaceEntry(spec);
  if (!spec.startsWith(".")) return null; // bare npm — skip
  const base = resolve(dirname(fromFile), spec);
  for (const ext of ["", ".js", ".jsx", ".mjs", "/index.js", "/index.jsx"]) {
    if (existsSync(base + ext)) { try { readFileSync(base + ext); return base + ext; } catch { /* dir */ } }
  }
  return null;
}

const exportCache = new Map();
function collectExports(file, seen = new Set()) {
  if (!file) return null;
  if (exportCache.has(file)) return exportCache.get(file);
  if (seen.has(file)) return new Set();
  seen.add(file);
  let ast;
  try { ast = parse(readFileSync(file, "utf8")); } catch { return null; }
  const names = new Set();
  traverse(ast, {
    ExportNamedDeclaration(path) {
      const d = path.node.declaration;
      if (d) {
        if (d.declarations) for (const decl of d.declarations) {
          if (decl.id.type === "Identifier") names.add(decl.id.name);
        }
        if (d.id) names.add(d.id.name);
      }
      if (path.node.specifiers?.length) {
        for (const s of path.node.specifiers) if (s.exported?.name) names.add(s.exported.name);
      }
    },
    ExportAllDeclaration(path) {
      const tgt = resolveSpec(file, path.node.source.value);
      const e = collectExports(tgt, seen);
      if (e) for (const n of e) names.add(n);
    },
    ExportDefaultDeclaration() { names.add("default"); },
  });
  exportCache.set(file, names);
  return names;
}

function checkFile(rel) {
  const file = resolve(ROOT, rel);
  let ast;
  try { ast = parse(readFileSync(file, "utf8")); }
  catch (e) { return [`parse error: ${e.message}`]; }
  const problems = [];
  // no-undef
  traverse(ast, { Program(p) {
    for (const name of Object.keys(p.scope.globals)) if (!GLOBALS.has(name)) problems.push(`undefined reference '${name}'`);
  }});
  // import-resolution
  traverse(ast, { ImportDeclaration(path) {
    const spec = path.node.source.value;
    if (!spec.startsWith(".") && !spec.startsWith("@athlink/")) return;
    const tgt = resolveSpec(file, spec);
    if (!tgt) { problems.push(`unresolved module '${spec}'`); return; }
    const exports = collectExports(tgt);
    if (!exports) { problems.push(`cannot read exports of '${spec}'`); return; }
    for (const s of path.node.specifiers) {
      if (s.type === "ImportSpecifier" && !exports.has(s.imported.name)) problems.push(`'${s.imported.name}' not exported by '${spec}'`);
      if (s.type === "ImportDefaultSpecifier" && !exports.has("default")) problems.push(`no default export in '${spec}'`);
    }
  }});
  return problems;
}

// ---- file list ----
let files = process.argv.slice(2);
if (!files.length) {
  const S = "sports/sailing/src";
  const dirFiles = (sub, exts) => existsSync(join(ROOT, S, sub))
    ? readdirSync(join(ROOT, S, sub)).filter((f) => exts.some((e) => f.endsWith(e))).map((f) => `${S}/${sub}/${f}`)
    : [];
  files = [
    `${S}/App.jsx`,
    ...dirFiles("util", [".js"]),
    ...dirFiles("data", [".js"]),
    ...dirFiles("views", [".jsx", ".js"]),
    "packages/features/auth/src/index.jsx",
    "packages/features/rating/src/index.js",
  ].filter((f) => existsSync(join(ROOT, f)));
}

let bad = 0;
for (const rel of files) {
  const problems = checkFile(rel);
  if (problems.length) { bad++; console.log(`✗ ${rel}\n    - ${problems.join("\n    - ")}`); }
  else console.log(`✓ ${rel}`);
}
console.log(bad ? `\ncheck-modules: ${bad} file(s) with problems` : `\ncheck-modules: all ${files.length} modules clean`);
process.exit(bad ? 1 : 0);
