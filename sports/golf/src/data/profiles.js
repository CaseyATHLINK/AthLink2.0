/* Athlete-side Supabase data layer for sailing — account/profile admin, athlete
   & event claims, athlete-profile extras, and media uploads. Reorg step 4:
   split out of App.jsx alongside data/hosts.js. Pure data-access helpers; all
   REST goes through hostRest (see ./hosts.js). Verbatim from App.jsx. */

import { hostRest } from "./hosts.js";
import { SB_URL, SB_KEY } from "@athlink/core";

// Dev: every UNVERIFIED membership across all hosts (pending-approval queue).
export const fetchUnverifiedMembers=(tok)=>hostRest("host_members?verified=eq.false&select=*&order=created_at.desc",{},tok);
// Dev: every profile row (for the all-profiles cleanup panel). Requires the
// admin SELECT policy (dev_admin_select_migration.sql) + being signed in as
// your admin account — otherwise RLS returns only your own row.
export const fetchAllProfiles=(tok)=>hostRest("profiles?select=*&order=created_at.desc",{},tok);
// Dev: every host_members row (to show which hosts each profile belongs to).
export const fetchAllMembers=(tok)=>hostRest("host_members?select=*",{},tok);
// Dev: hard-delete a profile and all its host memberships + claims.
export async function devDeleteProfile(userId,tok){
  await hostRest(`host_members?user_id=eq.${userId}`,{method:"DELETE"},tok);
  await hostRest(`athlete_claims?user_id=eq.${userId}`,{method:"DELETE"},tok);
  await hostRest(`profiles?user_id=eq.${userId}`,{method:"DELETE"},tok);
}
// Resolve a set of user_ids to display names + account usernames. Reads profiles
// (first/last/display_name/username); falls back to the public_profiles view,
// then a short id. Returns {names:{user_id:name}, usernames:{user_id:username}}.
export async function fetchProfileNames(ids,tok){
  const uniq=[...new Set((ids||[]).filter(Boolean))];
  if(!uniq.length) return {names:{},usernames:{}};
  const inList="("+uniq.map(encodeURIComponent).join(",")+")";
  const out={}; const unames={};
  // Try the full profiles table first (RLS may scope this).
  let rows=await hostRest(`profiles?user_id=in.${inList}&select=user_id,first_name,last_name,display_name,username`,{},tok);
  // Fall back to the public_profiles view for any ids not resolved.
  const got=new Set((rows||[]).map(r=>r.user_id));
  const missing=uniq.filter(id=>!got.has(id));
  let pub=[];
  if(missing.length&&!fetchProfileNames._noPublicView){
    const pin="("+missing.map(encodeURIComponent).join(",")+")";
    const res=await hostRest(`public_profiles?user_id=in.${pin}&select=user_id,display_name`,{},tok);
    if(res===null) fetchProfileNames._noPublicView=true; // view missing → stop retrying
    else pub=res||[];
  }
  const nameOf=(r)=>{
    const full=`${r.first_name||""} ${r.last_name||""}`.trim();
    return full||r.display_name||r.username||null;
  };
  (rows||[]).forEach(r=>{const n=nameOf(r); if(n) out[r.user_id]=n; if(r.username) unames[r.user_id]=r.username;});
  (pub||[]).forEach(r=>{if(!out[r.user_id]&&r.display_name) out[r.user_id]=r.display_name;});
  uniq.forEach(id=>{if(!out[id]) out[id]=`User ${id.slice(0,8)}`;});
  return {names:out,usernames:unames};
}

/* ── Athlete claims (athlete_claims) ──────────────────────────────────────────
   Athletes claim their auto-built profile; any verified host admin whose events
   that athlete appears in can approve. Approved claims show a verified badge. */
export const fetchAllClaims=(tok)=>hostRest("athlete_claims?select=*",{},tok);
export const fetchMyClaims=(userId,tok)=>hostRest(`athlete_claims?user_id=eq.${userId}&select=*`,{},tok);
export async function createClaim(profileName,userId,tok){
  return hostRest("athlete_claims",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify({profile_name:profileName,user_id:userId,status:"pending"})},tok);
}
export async function decideClaim(claimId,approve,vouchUserId,hostId,tok){
  return hostRest(`athlete_claims?id=eq.${claimId}`,{method:"PATCH",body:JSON.stringify({
    status:approve?"approved":"denied",vouched_by:approve?vouchUserId:null,host_id:approve?hostId:null,
    decided_at:new Date().toISOString()})},tok);
}

/* ── Athlete profile extras (athlete_profiles) ────────────────────────────────
   Owner-editable presentation fields (bio, instagram, nationality override,
   photo) layered over the auto-built profile. Keyed by normalised name
   (lower+trim). Read is public; write is gated to the verified owner by RLS
   (see migrations/0004_athlete_profiles.sql). */
export const profileNameKey=(name)=>String(name||"").trim().toLowerCase();
export const fetchAllAthleteProfiles=(tok)=>hostRest("athlete_profiles?select=*",{},tok);
export async function upsertAthleteProfile(name,patch,userId,tok){
  const row={name_key:profileNameKey(name),display_name:name,...patch,updated_by:userId,updated_at:new Date().toISOString()};
  return hostRest("athlete_profiles",{method:"POST",
    headers:{"Prefer":"resolution=merge-duplicates,return=representation"},
    body:JSON.stringify(row)},tok);
}
// Upload an athlete headshot to the public `athlete-photos` bucket; returns its
// public URL or null. Path: <name slug>/<timestamp>.<ext>.
export async function uploadAthletePhoto(file,name,tok){
  if(!SB_URL||!file) return null;   // no token → anon write (dev view; RLS from migration 0013 decides)
  const type=file.type||"image/jpeg";
  const ext=type.includes("png")?"png":type.includes("webp")?"webp":type.includes("gif")?"gif":"jpg";
  const slug=profileNameKey(name).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"athlete";
  const path=`${slug}/${Date.now()}.${ext}`;
  try{
    const r=await fetch(`${SB_URL}/storage/v1/object/athlete-photos/${path}`,{method:"POST",
      headers:{"apikey":SB_KEY,"Authorization":`Bearer ${tok||SB_KEY}`,"Content-Type":type,"x-upsert":"true"},
      body:file});
    if(!r.ok){console.error("uploadAthletePhoto",r.status,await r.text().catch(()=>""));return null;}
    return `${SB_URL}/storage/v1/object/public/athlete-photos/${path}`;
  }catch(e){console.error("uploadAthletePhoto network",e);return null;}
}
// Upload a gallery media file (image OR video) to the public `athlete-media`
// bucket under a `<slug>/` prefix. Returns {url,type} or null. The bucket allows
// image + video MIME and a larger size cap than athlete-photos (see
// migrations/0010_athlete_media_bucket.sql); type is inferred from the MIME.
export const ATHLETE_MEDIA_BUCKET="athlete-media";
export async function uploadAthleteMedia(file,name,tok){
  if(!SB_URL||!file) return null;   // no token → anon write (dev view; RLS from migration 0013 decides)
  const mime=file.type||"application/octet-stream";
  const isVideo=mime.startsWith("video/");
  const extMap={"image/png":"png","image/webp":"webp","image/gif":"gif","image/jpeg":"jpg","video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm"};
  const ext=extMap[mime]||(isVideo?"mp4":"jpg");
  const slug=profileNameKey(name).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"athlete";
  const path=`${slug}/${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`;
  try{
    const r=await fetch(`${SB_URL}/storage/v1/object/${ATHLETE_MEDIA_BUCKET}/${path}`,{method:"POST",
      headers:{"apikey":SB_KEY,"Authorization":`Bearer ${tok||SB_KEY}`,"Content-Type":mime,"x-upsert":"true"},
      body:file});
    if(!r.ok){console.error("uploadAthleteMedia",r.status,await r.text().catch(()=>""));return null;}
    return {url:`${SB_URL}/storage/v1/object/public/${ATHLETE_MEDIA_BUCKET}/${path}`,type:isVideo?"video":"image"};
  }catch(e){console.error("uploadAthleteMedia network",e);return null;}
}

/* ── Event claims (event_claims) ──────────────────────────────────────────────
   A host claims an externally-contributed event (one imported by another host
   and attributed to them as organizer). Any verified admin of the attributed
   host can approve; on approval the event's owner flips to that host and
   owner_confirmed becomes true, so it surfaces in their portal. Mirrors the
   athlete-claim flow. */
export const fetchAllEventClaims=(tok)=>hostRest("event_claims?select=*",{},tok);
export async function createEventClaim(eventId,hostId,userId,detail,tok){
  return hostRest("event_claims",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify({event_id:eventId,host_id:hostId||null,user_id:userId,status:"pending",detail:detail||null})},tok);
}
export async function decideEventClaim(claimId,approve,vouchUserId,hostId,tok){
  return hostRest(`event_claims?id=eq.${claimId}`,{method:"PATCH",body:JSON.stringify({
    status:approve?"approved":"denied",vouched_by:approve?vouchUserId:null,host_id:approve?hostId:null,
    decided_at:new Date().toISOString()})},tok);
}
