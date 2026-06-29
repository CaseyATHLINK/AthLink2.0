/* The contract every sport implements. The shell discovers each sport's
   manifest and renders its routes. Keep this the single source of truth for
   what a "sport" must provide. Defined in JS + JSDoc to match the repo (no TS). */

/**
 * @typedef {Object} SportManifest
 * @property {string} id            Unique slug, e.g. "golf". Used in the URL (/golf).
 * @property {string} name          Display name, e.g. "Golf".
 * @property {string} [tagline]     One line shown on the landing card.
 * @property {React.ComponentType} [icon]  lucide-react icon component.
 * @property {string} [accentToken] A design-system CSS var name, e.g. "--accent". NOT a hex.
 * @property {React.ComponentType} Portal  The sport's root component (its homepage + internal nav).
 * @property {Object} [parser]      Optional parser config: how this sport's results are ingested.
 */

/**
 * Identity helper — wraps a manifest so we can validate/extend centrally later.
 * @param {SportManifest} manifest
 * @returns {SportManifest}
 */
export function defineSport(manifest) {
  const missing = ["id", "name", "Portal"].filter((k) => !manifest[k]);
  if (missing.length) {
    console.error(`[sport-kit] manifest "${manifest.id || "?"}" is missing: ${missing.join(", ")}`);
  }
  return manifest;
}
