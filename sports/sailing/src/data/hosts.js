/* Host registries (associations / clubs / federations) for sailing — the
   DEFAULT_* seeds + the runtime-merged registries and their lookups.
   Reorg step 4: first data/ module. Runtime-mutable module state — reads are
   ESM live bindings; all mutation (applyDbHosts / addHostLocal / removeHostLocal)
   happens INSIDE this module, so App.jsx only reads + calls (its setHostsVersion
   useState still drives re-renders; behaviour unchanged). Verbatim from App.jsx. */

import { SB_URL, SB_KEY, authHeaders } from "@athlink/core";

// ── Associations: each portal is one association ──
// ── Hosts (associations, clubs, federations) ────────────────────────────────
// Hosts own/co-own events. Three types:
//   association — locked to one boat class (has `cls`)
//   club        — any class (no `cls`)
//   federation  — governing body of a country; auto-collaborates on every event
//                 hosted in its country (`country`), across all classes.
// These DEFAULT_* arrays are the always-present seeds; hosts added via dev mode
// are stored in Supabase (`hosts` table) and merged in at runtime.
export const DEFAULT_ASSOCIATIONS=[
  {id:"hk-29er",     type:"association", scope:"HK",  cls:"29er",     name:"Hong Kong 29er Class Association"},
  {id:"hk-ilca",     type:"association", scope:"HK",  cls:"ilca",     name:"Hong Kong ILCA"},
  {id:"hk-optimist", type:"association", scope:"HK",  cls:"optimist", name:"Hong Kong Optimist Dinghy Association"},
  {id:"int-29er",    type:"association", scope:"INT", cls:"29er",     name:"International 29er Class Association"},
  {id:"int-ilca",    type:"association", scope:"INT", cls:"ilca",     name:"International Laser Class Association"},
  {id:"int-optimist",type:"association", scope:"INT", cls:"optimist", name:"International Optimist Dinghy Association"},
  {id:"int-49er",    type:"association", scope:"INT", cls:"49er",     name:"International 49er Class Association"},
];
export const DEFAULT_CLUBS=[
  {id:"rhkyc", type:"club", scope:"HK", name:"Royal Hong Kong Yacht Club"},
];
export const DEFAULT_FEDERATIONS=[
  {id:"hksf", type:"federation", scope:"HK", country:"HKG", name:"Hong Kong Sailing Federation"},
];
// Mutable runtime registries (defaults + DB-added). Rebuilt by applyDbHosts.
export let ASSOCIATIONS=[...DEFAULT_ASSOCIATIONS];
export let CLUBS=[...DEFAULT_CLUBS];
export let FEDERATIONS=[...DEFAULT_FEDERATIONS];
// Merge DB host rows on top of the defaults (by id; defaults always win on id clash).
export function applyDbHosts(rows){
  const norm=t=>(rows||[]).filter(r=>r.type===t).map(r=>({
    id:r.id, type:r.type, scope:r.scope||"HK", name:r.name,
    ...(r.cls?{cls:r.cls}:{}), ...(r.country?{country:r.country}:{}),
    ...(r.slug?{slug:r.slug}:{}),
    ...(r.logo_url?{logo_url:r.logo_url}:{}),          // recolored host/association logo (bucket url)
    ...(r.dossier?{dossier:r.dossier}:{}),             // host auto-grab research dossier (migration 0012)
  }));
  // DB rows are the source of truth: defaults seed first, DB overwrites on id clash.
  // (Seeded once via hosts_seed_migration.sql; defaults remain only as an
  //  emergency fallback if the hosts table is empty / unreachable.)
  const merge=(defs,extra)=>{const m=new Map();[...defs,...extra].forEach(h=>m.set(h.id,h));return[...m.values()];};
  ASSOCIATIONS=merge(DEFAULT_ASSOCIATIONS,norm("association"));
  CLUBS=merge(DEFAULT_CLUBS,norm("club"));
  FEDERATIONS=merge(DEFAULT_FEDERATIONS,norm("federation"));
}
// Optimistically add a single host to the runtime registry (before/while it
// persists to the DB) so its portal appears immediately.
export function addHostLocal(h){
  const arr=h.type==="association"?ASSOCIATIONS:h.type==="club"?CLUBS:FEDERATIONS;
  if(!arr.some(x=>x.id===h.id)) arr.unshift(h);
}
export function removeHostLocal(id){
  ASSOCIATIONS=ASSOCIATIONS.filter(a=>a.id!==id);
  CLUBS=CLUBS.filter(c=>c.id!==id);
  FEDERATIONS=FEDERATIONS.filter(f=>f.id!==id);
}
export const assocById=id=>ASSOCIATIONS.find(a=>a.id===id);
export const clubById=id=>CLUBS.find(c=>c.id===id);
export const fedById=id=>FEDERATIONS.find(f=>f.id===id);
export const isClubId=id=>!!clubById(id);
export const isFedId=id=>!!fedById(id);
// Resolve any host id (association, club OR federation) to its record / name.
export const hostById=id=>assocById(id)||clubById(id)||fedById(id)||null;

/* ── Host trust REST (host_members / host_invites / host_audit) ── */
export async function hostRest(path,opts={},tok){
  if(!SB_URL||!SB_KEY) return null;
  try{
    const r=await fetch(`${SB_URL}/rest/v1/${path}`,{
      ...opts,
      headers:{...authHeaders(tok),"Prefer":opts.method&&opts.method!=="GET"?"return=representation":undefined,...(opts.headers||{})},
    });
    if(!r.ok){console.error("hostRest error",r.status,await r.text().catch(()=>""));return null;}
    const txt=await r.text(); return txt?JSON.parse(txt):[];
  }catch(e){console.error("hostRest network error",e);return null;}
}
// All membership rows for a host (active + pending), newest first.
export const fetchHostMembers=(hostId,tok)=>hostRest(`host_members?host_id=eq.${encodeURIComponent(hostId)}&select=*&order=created_at.asc`,{},tok);
// Every membership for the current user (to compute their editable hosts).
export const fetchMyMemberships=(userId,tok)=>hostRest(`host_members?user_id=eq.${userId}&select=*`,{},tok);
export const fetchHostInvites=(hostId,tok)=>hostRest(`host_invites?host_id=eq.${encodeURIComponent(hostId)}&select=*&order=created_at.desc`,{},tok);
export const fetchHostAudit=(hostId,tok)=>hostRest(`host_audit?host_id=eq.${encodeURIComponent(hostId)}&select=*&order=ts.desc&limit=50`,{},tok);
export const fetchInviteByToken=(token,tok)=>hostRest(`host_invites?token=eq.${encodeURIComponent(token)}&select=*`,{},tok);
