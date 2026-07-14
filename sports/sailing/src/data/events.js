/* Supabase event read/write + duplicate-dismissal persistence — extracted
   from App.jsx (reorg step 4). Builds on @athlink/core primitives; dbToApp
   maps a DB row to the app event shape (re-exported by App.jsx for
   apps/web Landing.jsx). Verbatim. */

import { SB_URL, sbH, sbGet, sbPost, sbPatch, sbDel } from "@athlink/core";

// Reviewed duplicate pairs (see migrations/0006). Read to seed the hidden set;
// save so a "merge"/"don't merge" decision sticks across reloads and devices.
export const fetchDupDismissals=()=>sbGet("dup_dismissals?select=key");
export async function saveDupDismissals(keys){
  if(!sbH||!keys||!keys.length) return;
  try{await fetch(`${SB_URL}/rest/v1/dup_dismissals`,{method:"POST",
    headers:{...sbH,"Prefer":"resolution=ignore-duplicates"},
    body:JSON.stringify(keys.map(k=>({key:k})))});}
  catch(e){console.error("saveDupDismissals",e);}
}


// Run schema migration for nat column (idempotent)
export async function ensureSchema(){
  if(!sbH) return;
  // We attempt a HEAD request on entries with nat filter; if it fails, column doesn't exist
  // Actually we just try to patch with nat:null — Supabase will ignore unknown columns gracefully
  // The safest approach is to include nat in all INSERT payloads and let Supabase handle it
  // If the column is missing, inserts still work (extra field silently ignored) until column added
}

export function dbToApp(ev){
  return{id:ev.id,name:ev.name,cls:ev.class,doublehanded:ev.doublehanded,
    venue:ev.venue||"—",country:ev.country||"",date:ev.date||"—",discards:ev.discards,
    scoring:ev.scoring||"",source:ev.source||"Imported",status:ev.status||"Final",
    owner:ev.owner||null,collabs:Array.isArray(ev.collabs)?ev.collabs:(ev.collabs?JSON.parse(ev.collabs):[]),
    owner_confirmed:ev.owner_confirmed!==false,imported_by:ev.imported_by||null,
    organizer_name:ev.organizer_name||null,fingerprint:ev.fingerprint||null,
    sources:Array.isArray(ev.sources)?ev.sources:(ev.sources?JSON.parse(ev.sources):[]),
    subclass:ev.subclass||null,
    entries:(ev.entries||[]).map(e=>({_dbId:e.id,sail:e.sail||"—",nat:e.nat||"",div:e.division||"",
      gender:e.gender||"",category:e.category||"",
      helm:e.helm_name,crew:e.crew_name||"",races:e.races||[],race_codes:e.race_codes||null,pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null,
      birth_year:e.birth_year??null,crew_birth_year:e.crew_birth_year??null}))};
}
export async function saveEventToDb(ev){
  if(!sbH){console.warn("saveEventToDb: no Supabase connection");return null;}
  const evPayload={
    name:ev.name, class:ev.cls, doublehanded:!!ev.doublehanded,
    venue:ev.venue||null, country:ev.country||null, date:ev.date||null,
    discards:ev.discards||1, scoring:ev.scoring||null,
    source:ev.source||null, status:ev.status||"Final",
    owner:ev.owner||null, collabs:ev.collabs||[], subclass:ev.subclass||null,
    owner_confirmed:ev.owner_confirmed!==false, imported_by:ev.imported_by||null,
    organizer_name:ev.organizer_name||null, fingerprint:ev.fingerprint||null,
    sources:ev.sources||[],
  };
  const ins=await sbPost("events",evPayload);
  if(!ins?.[0]?.id){
    console.error("saveEventToDb: event insert failed for",ev.name);
    return null;
  }
  const eventId=ins[0].id;
  const entryErrors=await insertEntries(eventId,ev.entries);
  if(entryErrors.length) console.warn("saveEventToDb: failed entries:",entryErrors);
  else console.log("saveEventToDb: saved",ev.entries.length,"entries for",ev.name);
  return ins;
}
// Insert entries one by one so a single bad row doesn't kill the whole batch.
// Returns the helm names of any rows that failed.
async function insertEntries(eventId,entries){
  const entryErrors=[];
  for(const e of entries||[]){
    const entryPayload={
      event_id:eventId,
      sail:e.sail||"—",
      nat:e.nat||null,
      division:e.div||null,
      gender:e.gender||null,
      category:e.category||null,
      helm_name:e.helm||"",
      crew_name:e.crew||null,
      races:Array.isArray(e.races)?e.races:[],
      race_codes:e.race_codes||null,
      pdf_rank:e.pdf_rank||null,
      pdf_net:e.pdf_net||null,
      birth_year:e.birth_year||null,
      crew_birth_year:e.crew_birth_year||null,
    };
    const r=await sbPost("entries",entryPayload);
    if(!r?.[0]?.id) entryErrors.push(e.helm);
  }
  return entryErrors;
}
// Attach imported results to an ALREADY-PUBLISHED event (an announced upcoming
// competition): patch the event row in place — keeping its id/URL and its
// announced owner/collabs — and swap the entry-list rows for the result rows.
export async function replaceEventResultsInDb(evId,ev){
  if(!sbH){console.warn("replaceEventResultsInDb: no Supabase connection");return null;}
  await sbPatch("events",`id=eq.${evId}`,{
    name:ev.name, class:ev.cls, doublehanded:!!ev.doublehanded,
    venue:ev.venue||null, country:ev.country||null, date:ev.date||null,
    discards:ev.discards||1, scoring:ev.scoring||null,
    source:ev.source||null, status:ev.status||"Final",
    subclass:ev.subclass||null, fingerprint:ev.fingerprint||null,
    sources:ev.sources||[],
  });
  await sbDel("entries",`event_id=eq.${evId}`);
  const entryErrors=await insertEntries(evId,ev.entries);
  if(entryErrors.length) console.warn("replaceEventResultsInDb: failed entries:",entryErrors);
  else console.log("replaceEventResultsInDb: attached",ev.entries.length,"result rows to",ev.name);
  return evId;
}
export async function updateEventStatus(evId,status){
  await sbPatch("events",`id=eq.${evId}`,{status});
}
