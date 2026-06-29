#!/usr/bin/env node
/* Scaffold a new sport from sports/_template and wire it into the shell.
   Usage: pnpm create-sport <id> ["Display Name"]
   Example: pnpm create-sport golf "Golf"
   After running: `pnpm install`, then `pnpm dev`. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [, , idArg, nameArg] = process.argv;

if (!idArg || !/^[a-z][a-z0-9-]*$/.test(idArg)) {
  console.error('Usage: pnpm create-sport <id> ["Display Name"]   (id = lowercase, e.g. "golf")');
  process.exit(1);
}
const id = idArg;
const name = nameArg || id.charAt(0).toUpperCase() + id.slice(1);
const dest = path.join(root, "sports", id);

if (fs.existsSync(dest)) {
  console.error(`sports/${id} already exists — aborting.`);
  process.exit(1);
}

// 1. Copy the template.
fs.cpSync(path.join(root, "sports", "_template"), dest, { recursive: true });

// 2. Replace placeholders in every file.
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else {
      let txt = fs.readFileSync(p, "utf8");
      txt = txt.replaceAll("__SPORT_ID__", id).replaceAll("__SPORT_NAME__", name);
      fs.writeFileSync(p, txt);
    }
  }
};
walk(dest);

// 3. Set the package name.
const pkgPath = path.join(dest, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.name = `@athlink/sport-${id}`;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

// 4. Register in the shell (apps/web/src/sports.js) — no hand-editing required.
const regPath = path.join(root, "apps", "web", "src", "sports.js");
let reg = fs.readFileSync(regPath, "utf8");
const marker = "  // __SPORTS_REGISTRY__";
const entry =
`  {
    id: "${id}",
    name: "${name}",
    tagline: "Competitions & athlete profiles",
    Portal: React.lazy(() =>
      import("@athlink/sport-${id}").then((m) => ({ default: m.default.Portal }))
    ),
  },
`;
reg = reg.replace(marker, entry + marker);
fs.writeFileSync(regPath, reg);

// 5. Add the dependency to the shell package.json.
const webPkgPath = path.join(root, "apps", "web", "package.json");
const webPkg = JSON.parse(fs.readFileSync(webPkgPath, "utf8"));
webPkg.dependencies[`@athlink/sport-${id}`] = "workspace:*";
webPkg.dependencies = Object.fromEntries(Object.entries(webPkg.dependencies).sort());
fs.writeFileSync(webPkgPath, JSON.stringify(webPkg, null, 2) + "\n");

console.log(`\n✓ Created sports/${id}  (@athlink/sport-${id})`);
console.log(`✓ Registered "${name}" in the shell landing + router`);
console.log(`\nNext:`);
console.log(`  1. pnpm install            # link the new package`);
console.log(`  2. pnpm dev                # open #/${id} to see your portal`);
console.log(`  3. Add to CODEOWNERS:  /sports/${id}/**   @your-github-handle`);
console.log(`  4. Build in sports/${id}/src — import UI from @athlink/design-system\n`);
