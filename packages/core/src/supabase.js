/* Shared Supabase access — thin REST + GoTrue fetch wrappers (no SDK dep).
   Lifted from the sailing app so every sport talks to the DB the same way.
   IMPORTANT: VITE_SUPABASE_URL must be the base URL with NO trailing /rest/v1/. */

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const baseHeaders = (SB_URL && SB_KEY)
  ? { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" }
  : null;

export const sbConfigured = !!baseHeaders;

export async function sbGet(path) {
  if (!baseHeaders) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: baseHeaders });
    if (!r.ok) { console.error("Supabase GET error", r.status, await r.text()); return null; }
    return r.json();
  } catch (e) { console.error("Supabase GET network error", e); return null; }
}

export async function sbPost(table, body) {
  if (!baseHeaders) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: "POST", headers: baseHeaders, body: JSON.stringify(body) });
    if (!r.ok) { console.error("Supabase POST error", r.status, await r.text()); return null; }
    return r.json();
  } catch (e) { console.error("Supabase POST network error", e); return null; }
}

export async function sbPatch(table, filter, body) {
  if (!baseHeaders) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: "PATCH", headers: baseHeaders, body: JSON.stringify(body) });
    if (!r.ok) { console.error("Supabase PATCH error", r.status, await r.text()); return null; }
    const txt = await r.text(); return txt ? JSON.parse(txt) : [];
  } catch (e) { console.error("Supabase PATCH network error", e); return null; }
}

export async function sbDel(table, filter) {
  if (!baseHeaders) return;
  await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, { method: "DELETE", headers: { ...baseHeaders, Prefer: "" } });
}

/* ── Auth (Supabase GoTrue) ── */
const AUTH_BASE = SB_URL ? `${SB_URL}/auth/v1` : null;
const authHeaders = (tok) => ({ apikey: SB_KEY, "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) });

export async function authSignUp(email, password) {
  const r = await fetch(`${AUTH_BASE}/signup`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ email, password }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.msg || d.error_description || d.error || "Sign-up failed"); return d;
}
export async function authSignIn(email, password) {
  const r = await fetch(`${AUTH_BASE}/token?grant_type=password`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ email, password }) });
  const d = await r.json(); if (!r.ok) throw new Error(d.msg || d.error_description || d.error || "Sign-in failed"); return d;
}
export async function authUser(tok) {
  const r = await fetch(`${AUTH_BASE}/user`, { headers: authHeaders(tok) });
  if (!r.ok) return null; return r.json();
}
