/* Scout portal Supabase data layer — CRUD for the scouting workspace tables
   created in migrations/0014_scout_portal.sql (binders, clips, notes, pinned
   result highlights, the append-only activity ledger, and digest prefs).
   Mirrors data/profiles.js: thin async wrappers over sbGet/sbPost/sbPatch/sbDel
   from @athlink/core, tolerant of failure (return []/null, never throw). Owner
   is TEXT — auth.uid() when signed in, else a per-browser anon id (0013/0014
   app-gated stance). All filter values are URL-encoded like the core helpers. */

import { sbGet, sbPost, sbPatch, sbDel, SB_URL, SB_KEY, authHeaders } from "@athlink/core";

const enc = encodeURIComponent;

// Owner key: auth uid when signed in, else a per-browser anon id persisted in
// localStorage ("anon_<rand>", minted on first use). Synchronous. Falls back to
// a volatile anon id if localStorage is unavailable (private mode / SSR).
export function scoutOwnerId(auth){
  const uid=auth?.user?.id;
  if(uid) return uid;
  try{
    let id=localStorage.getItem("athlink_scout_owner");
    if(!id){id="anon_"+Math.random().toString(36).slice(2)+Date.now().toString(36);localStorage.setItem("athlink_scout_owner",id);}
    return id;
  }catch{ return "anon_"+Math.random().toString(36).slice(2); }
}

/* ── binders (scout_binders) — a scout's watchlist folders ─────────────────── */
export async function fetchBinders(owner){
  return (await sbGet(`scout_binders?owner=eq.${enc(owner)}&select=id,name,sort_order,created_at&order=sort_order.asc,created_at.asc`))||[];
}
export async function createBinder(owner,name){
  const r=await sbPost("scout_binders",{owner,name});
  return r?.[0]||null;
}
// Default binder, single-flight per owner: concurrent first-watch toggles share
// one creation, and an existing binder is reused — the DB has no unique(owner,name),
// so idempotency has to live here.
const _defBinder={};
export function ensureDefaultBinder(owner){
  if(!_defBinder[owner]) _defBinder[owner]=(async()=>{
    const ex=await fetchBinders(owner);
    const hit=ex.find(b=>b.name==="My watchlist")||ex[0];
    if(hit) return hit;
    const b=await createBinder(owner,"My watchlist");
    if(!b) delete _defBinder[owner];               // failed create → allow retry
    return b;
  })().catch(e=>{ delete _defBinder[owner]; throw e; });
  return _defBinder[owner];
}
export async function renameBinder(id,name){
  return sbPatch("scout_binders",`id=eq.${enc(id)}`,{name});
}
export async function deleteBinder(id){
  return sbDel("scout_binders",`id=eq.${enc(id)}`);
}

/* ── clips (scout_clips) — polymorphic saved items inside a binder ─────────── */
export async function fetchClips(owner){
  return (await sbGet(`scout_clips?owner=eq.${enc(owner)}&select=*&order=created_at.desc`))||[];
}
export async function addClip(owner,binderId,{kind,athlete_key,event_id,entry_id,url,title,snapshot}={}){
  const r=await sbPost("scout_clips",{owner,binder_id:binderId||null,kind,
    athlete_key:athlete_key||null,event_id:event_id||null,entry_id:entry_id||null,
    url:url||null,title:title||null,snapshot:snapshot||{}});
  return r?.[0]||null;
}
export async function removeClip(id){
  return sbDel("scout_clips",`id=eq.${enc(id)}`);
}
export async function moveClip(id,binderId){
  return sbPatch("scout_clips",`id=eq.${enc(id)}`,{binder_id:binderId||null});
}

/* ── notes (scout_notes) — scouting observations + rubric scores ──────────── */
export async function fetchNotes(owner){
  return (await sbGet(`scout_notes?owner=eq.${enc(owner)}&select=*&order=created_at.desc`))||[];
}
export async function addNote(owner,{athlete_key,event_id,body,rubric}={}){
  const r=await sbPost("scout_notes",{owner,athlete_key,event_id:event_id||null,
    body:body||"",rubric:rubric||{}});
  return r?.[0]||null;
}
export async function updateNote(id,{body,rubric}={}){
  const patch={updated_at:new Date().toISOString()};
  if(body!==undefined) patch.body=body;
  if(rubric!==undefined) patch.rubric=rubric;
  return sbPatch("scout_notes",`id=eq.${enc(id)}`,patch);
}
export async function deleteNote(id){
  return sbDel("scout_notes",`id=eq.${enc(id)}`);
}

/* ── pinned_results — owner-pinned results shown at the top of a profile's /
   host's results list. Free-form ordering: sort_order is any int (asc), no
   slot cap (migration 0015 dropped the 0-2 check + unique slot constraint).
   A new pin goes ABOVE existing ones (sort_order = min-1); reorderPins
   rewrites the whole sequence 0..n-1 after a drag.
   Reads are public; WRITES run under the caller's session token — the RLS
   owner-write policy (0015_role_rls_hardening) only lets the verified owner
   (approved athlete claim / verified host member / admin) touch pins, so the
   anon-key sbPost/sbPatch/sbDel wrappers can't be used here. ───────────────── */
async function pinWrite(path,opts,tok){
  if(!SB_URL||!SB_KEY) return null;
  try{
    const r=await fetch(`${SB_URL}/rest/v1/${path}`,{...opts,
      headers:{...authHeaders(tok),Prefer:"return=representation",...(opts.headers||{})}});
    if(!r.ok){console.error("pinned_results write error",r.status,await r.text().catch(()=>""));return null;}
    const txt=await r.text(); return txt?JSON.parse(txt):[];
  }catch(e){console.error("pinned_results write network error",e);return null;}
}
export async function fetchPins(ownerKind,ownerKey){
  return (await sbGet(`pinned_results?owner_kind=eq.${enc(ownerKind)}&owner_key=eq.${enc(ownerKey)}&select=*&order=sort_order.asc,created_at.asc`))||[];
}
export async function addPin(ownerKind,ownerKey,{entry_id,event_id,snapshot,sort_order=0}={},tok){
  const r=await pinWrite("pinned_results",{method:"POST",body:JSON.stringify({owner_kind:ownerKind,owner_key:ownerKey,
    sort_order,entry_id:entry_id||null,event_id:event_id||null,snapshot:snapshot||{}})},tok);
  return r?.[0]||null;
}
export async function removePin(id,tok){
  return pinWrite(`pinned_results?id=eq.${enc(id)}`,{method:"DELETE"},tok);
}
export async function reorderPins(orderedIds,tok){
  await Promise.all((orderedIds||[]).map((id,i)=>pinWrite(`pinned_results?id=eq.${enc(id)}`,{method:"PATCH",body:JSON.stringify({sort_order:i})},tok)));
}

/* ── activity ledger (scout_activity) — fire-and-forget append; never throws,
   never await-blocks the caller. kind ∈ viewed_profile|saved_result|added_watchlist. */
export function logActivity(actor,athleteKey,kind){
  try{
    Promise.resolve(sbPost("scout_activity",{actor:actor||null,athlete_key:athleteKey,kind})).catch(()=>{});
  }catch{/* swallow — telemetry must never break a caller */}
}

/* ── digest prefs (scout_digest_prefs) — per-binder (or global, binder null). */
export async function fetchDigestPrefs(owner){
  return (await sbGet(`scout_digest_prefs?owner=eq.${enc(owner)}&select=*&order=created_at.asc`))||[];
}
export async function upsertDigestPref(owner,binderId,{kind,frequency,filters}={}){
  const r=await sbPost("scout_digest_prefs",{owner,binder_id:binderId||null,
    kind:kind||"watchlist",frequency:frequency||"weekly",filters:filters||{}});
  return r?.[0]||null;
}
