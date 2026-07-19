/* Scout portal Supabase data layer — CRUD for the scouting workspace tables
   created in migrations/0014_scout_portal.sql (binders, clips, notes, pinned
   result highlights, the append-only activity ledger, and digest prefs).
   Mirrors data/profiles.js: thin async wrappers over sbGet/sbPost/sbPatch/sbDel
   from @athlink/core, tolerant of failure (return []/null, never throw). Owner
   is TEXT = auth.uid() — since 0015_role_rls_hardening scout_* writes require
   an authenticated session and rows are owner-private, so there is NO anon
   owner anymore: scoutOwnerId returns null when signed out and every helper
   no-ops on a null owner. All filter values are URL-encoded like the core
   helpers. Writes go out under the user JWT (setSbUserToken in @athlink/core). */

import { sbGet, sbPost, sbPatch, sbDel, SB_URL, SB_KEY, authHeaders } from "@athlink/core";

const enc = encodeURIComponent;

// Owner key: the auth uid, or null when signed out. RLS (0015) rejects writes
// and hides rows for any other identity, so minting local anon ids would only
// fake saves that the DB silently drops — callers must treat null as
// "sign in first". (Legacy localStorage anon ids are ignored; their rows are
// invisible under RLS anyway.)
export function scoutOwnerId(auth){
  return auth?.user?.id||null;
}

/* ── binder namespaces ─────────────────────────────────────────────────────────
   Binders live in one of two disjoint folder namespaces:
     'athletes' → watchlist folders (kind='athlete' clips only)
     'results'  → saved results/events folders (result/event/upcoming/link clips)
   Stored in scout_binders.kind (migration 0016). #125 originally shipped the
   split as a "res::" prefix on the name (that session had no Supabase write
   access); 0016 backfilled those rows onto the column. binderNS/binderLabel
   keep reading the prefix as a fallback for stragglers — a stale pre-0016 tab
   still writes "res::<name>" with the column defaulting to 'athletes'. User
   input stays sanitised so a typed "res::" can't cross namespaces (or get
   mangled by a 0016 re-run). */
const RES_PREFIX="res::";
export const binderNS   = b  => b?.kind==="results"||(b?.name||"").startsWith(RES_PREFIX)?"results":"athletes";
export const binderLabel= b  => (b?.name||"").startsWith(RES_PREFIX)?b.name.slice(RES_PREFIX.length):(b?.name||"");
const cleanName=name=>{
  let n=String(name||"").trim();
  while(n.startsWith(RES_PREFIX)) n=n.slice(RES_PREFIX.length).trim();
  return n;
};
export const DEFAULT_BINDER_NAME={athletes:"My watchlist",results:"Saved results"};

/* ── binders (scout_binders) — a scout's folders, per namespace ────────────── */
export async function fetchBinders(owner){
  if(!owner) return [];
  return (await sbGet(`scout_binders?owner=eq.${enc(owner)}&select=id,name,kind,sort_order,created_at&order=sort_order.asc,created_at.asc`))||[];
}
export async function createBinder(owner,name,ns="athletes"){
  if(!owner||!String(name||"").trim()) return null;
  const r=await sbPost("scout_binders",{owner,name:cleanName(name),kind:ns});
  const row=r?.[0]||null;
  if(row) invalidateScoutCaches();
  return row;
}
// Default binder for a namespace, single-flight per owner+ns: concurrent
// first-save toggles share one creation, and an existing binder is reused —
// the DB has no unique(owner,name), so idempotency has to live here.
const _defBinder={};
export function ensureDefaultBinder(owner,ns="athletes"){
  if(!owner) return Promise.resolve(null);
  const key=`${owner}|${ns}`;
  if(!_defBinder[key]) _defBinder[key]=(async()=>{
    const ex=(await fetchBinders(owner)).filter(b=>binderNS(b)===ns);
    const hit=ex.find(b=>binderLabel(b)===DEFAULT_BINDER_NAME[ns])||ex[0];
    if(hit) return hit;
    const b=await createBinder(owner,DEFAULT_BINDER_NAME[ns],ns);
    if(!b) delete _defBinder[key];                 // failed create → allow retry
    return b;
  })().catch(e=>{ delete _defBinder[key]; throw e; });
  return _defBinder[key];
}
export async function renameBinder(id,name,ns="athletes"){
  const r=await sbPatch("scout_binders",`id=eq.${enc(id)}`,{name:cleanName(name),kind:ns});
  if(Array.isArray(r)&&r.length) invalidateScoutCaches();
  return r;
}
export async function deleteBinder(id){
  const r=await sbDel("scout_binders",`id=eq.${enc(id)}`);
  if(Array.isArray(r)&&r.length) invalidateScoutCaches();
  return r;
}

/* ── clips (scout_clips) — polymorphic saved items inside a binder ───────────
   Writes return honestly: addClip → the created row or null; removeClip /
   moveClip → the affected rows ([] means RLS filtered the request to zero rows,
   i.e. a silent failure the caller must surface). Successful writes invalidate
   the shared read caches below. */
export async function fetchClips(owner){
  if(!owner) return [];
  return (await sbGet(`scout_clips?owner=eq.${enc(owner)}&select=*&order=created_at.desc`))||[];
}
export async function addClip(owner,binderId,{kind,athlete_key,event_id,entry_id,url,title,snapshot}={}){
  if(!owner) return null;
  const r=await sbPost("scout_clips",{owner,binder_id:binderId||null,kind,
    athlete_key:athlete_key||null,event_id:event_id||null,entry_id:entry_id||null,
    url:url||null,title:title||null,snapshot:snapshot||{}});
  const row=r?.[0]||null;
  if(row) invalidateScoutCaches();
  return row;
}
export async function removeClip(id){
  const r=await sbDel("scout_clips",`id=eq.${enc(id)}`);
  if(Array.isArray(r)&&r.length) invalidateScoutCaches();
  return r;
}
export async function moveClip(id,binderId){
  const r=await sbPatch("scout_clips",`id=eq.${enc(id)}`,{binder_id:binderId||null});
  if(Array.isArray(r)&&r.length) invalidateScoutCaches();
  return r;
}

/* ── shared read caches ────────────────────────────────────────────────────────
   Every SaveButton on a page hydrates its binders + "is this saved?" state; a
   100-row results table must not fire 200 fetches. These share one in-flight
   promise per owner (short TTL), invalidated by any successful scout write, so
   fill states stay truthful without per-button network cost. */
const TTL=15000;
let _clipsCache={owner:null,promise:null,at:0};
let _bindersCache={owner:null,promise:null,at:0};
export function fetchClipsShared(owner){
  if(!owner) return Promise.resolve([]);
  if(_clipsCache.owner===owner&&_clipsCache.promise&&Date.now()-_clipsCache.at<TTL) return _clipsCache.promise;
  _clipsCache={owner,promise:fetchClips(owner),at:Date.now()};
  return _clipsCache.promise;
}
export function fetchBindersShared(owner){
  if(!owner) return Promise.resolve([]);
  if(_bindersCache.owner===owner&&_bindersCache.promise&&Date.now()-_bindersCache.at<TTL) return _bindersCache.promise;
  _bindersCache={owner,promise:fetchBinders(owner),at:Date.now()};
  return _bindersCache.promise;
}
export function invalidateScoutCaches(){
  _clipsCache={owner:null,promise:null,at:0};
  _bindersCache={owner:null,promise:null,at:0};
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
