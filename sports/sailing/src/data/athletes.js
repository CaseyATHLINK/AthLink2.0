/* Per-athlete attribute registry for sailing — a single pass over all events
   builds ATHLETE_ATTRS (gender / birth year / most-recent class, by canonName).
   Reorg step 4: split out of App.jsx. MUTABLE module state: buildAthleteAttrs
   reassigns ATHLETE_ATTRS internally, so App.jsx reads it via an ESM live binding
   (no setter needed) and calls buildAthleteAttrs(events) for the side effect; its
   useMemo([events]) still drives re-renders. Verbatim from App.jsx. */

import { dateKey } from "../util/date.js";
import { canonName, pascalSlug } from "../util/name.js";
import { genderCatOf, lockedGenderOf } from "../util/gender.js";
import { IOC_ISO } from "../util/flag.js";

// ── Per-athlete attribute memory (gender, birth year, recent class) ──────────
// Single pass over all events. For each athlete (by canonName), we remember:
//   gender    — the most-frequently-stated single gender across all their entries
//   birthYear — most-frequently-stated birth year
//   recentCls/recentSub — class of their most recent competition
// A person's own gender is a stable trait, so once stated anywhere it is applied
// everywhere that athlete appears (including events whose PDF omitted gender).
export let ATHLETE_ATTRS=new Map();
export function buildAthleteAttrs(evList){
  const m=new Map();
  for(const ev of (evList||[])){
    if(ev.status==="Draft") continue;
    const dk=dateKey(ev.date); // "" = undated; never allowed to claim recency
    for(const e of (ev.entries||[])){
      const gc=genderCatOf(e); // resolves real fields + legacy div
      // helm + crew, each with their own stated gender where derivable
      const pairs=[[e.helm,e.birth_year,gc.gender,"helm"],[e.crew,e.crew_birth_year,gc.gender,"crew"]];
      // When an entry's div implies a single gender (M/F), it applies to both
      // members; "Mix" does not pin either individual, so skip it for the registry.
      for(const [nm,by,g,which] of pairs){
        if(!nm) continue; const k=canonName(nm); if(!k) continue;
        let o=m.get(k); if(!o){o={gender:{},birthYear:{},recentDK:"",recentCls:null,recentSub:null};m.set(k,o);}
        if(g&&g!=="Mix") o.gender[g]=(o.gender[g]||0)+1;
        if(by) o.birthYear[by]=(o.birthYear[by]||0)+1;
        // Undated events may seed recentCls (better than nothing) but any DATED
        // event beats them; among dated events the latest date wins.
        if(dk?dk>=o.recentDK:!o.recentDK&&!o.recentCls){o.recentDK=dk;o.recentCls=ev.cls;o.recentSub=ev.subclass||null;}
      }
    }
  }
  const out=new Map();
  const top=obj=>{const e=Object.entries(obj);return e.length?e.sort((a,b)=>b[1]-a[1])[0][0]:null;};
  for(const [k,o] of m){
    out.set(k,{gender:top(o.gender),birthYear:o.birthYear&&top(o.birthYear)?parseInt(top(o.birthYear)):null,recentCls:o.recentCls,recentSub:o.recentSub});
  }
  ATHLETE_ATTRS=out;
  return out;
}
// Remembered gender for a single athlete name (or null).
export function rememberedGender(name){
  const a=ATHLETE_ATTRS.get(canonName(name)); return a?.gender||null;
}
// Resolve the gender to SHOW for an entry, given a specific viewpoint:
//   - singlehanded / solo: the helm's remembered/ stated gender
//   - doublehanded: combine helm + crew remembered genders → M / F / Mix
// Falls back to whatever the entry itself states.
export function resolvedEntryGender(e,doublehanded){
  // A gender-locked class/division (e.g. 49erFX = women) is authoritative for the
  // whole boat and overrides any stated OR remembered gender — the latter can be
  // stale/wrong (a mis-parsed source carried over from another event).
  const locked=lockedGenderOf(e&&(e.div||e.cls||""));
  if(locked) return locked;
  const stated=genderCatOf(e).gender;
  if(doublehanded&&e.crew){
    const gh=rememberedGender(e.helm)||(stated&&stated!=="Mix"?stated:null);
    const gc=rememberedGender(e.crew)||(stated&&stated!=="Mix"?stated:null);
    if(gh&&gc) return gh===gc?gh:"Mix";
    if(stated) return stated;          // fall back to the entry's own div if we can't pin both
    return gh||gc||null;
  }
  // Solo (or no crew): prefer the person's remembered gender, else stated.
  return rememberedGender(e.helm)||stated||null;
}

/* ── Public athlete usernames (name_key ⇄ username) ───────────────────────
   Loaded from the athlete_usernames table; default is FirstnameLastname. The
   registry is module-level mutable state: readers use the ESM live binding,
   applyAthleteUsernames() reassigns it (module-internal), and App.jsx mutates
   the maps in place for optimistic username edits. Falls back to
   PascalCase(name) for any not-yet-loaded name so URLs work without the table. */
const uNameKey=(s)=>String(s||"").trim().toLowerCase();
export let ATHLETE_USERNAMES={byKey:new Map(),byUser:new Map()};
export function applyAthleteUsernames(rows){
  const byKey=new Map(),byUser=new Map();
  (rows||[]).forEach(r=>{ if(!r||!r.username) return;
    byKey.set(r.name_key,r.username);
    byUser.set(String(r.username).toLowerCase(),r.display_name||r.name_key);
  });
  ATHLETE_USERNAMES={byKey,byUser};
}
export const usernameForName=(name)=>ATHLETE_USERNAMES.byKey.get(uNameKey(name))||pascalSlug(name);
export const nameForUsername=(u)=>ATHLETE_USERNAMES.byUser.get(String(u||"").toLowerCase())||null;

/* ── Athlete-derivation helpers + seed metadata (moved from App.jsx, reorg
   step 4). META is a small hand-seeded name→nationality table; the three
   builders derive nationality / birth-year / home-country from event
   entries. Verbatim. */
export const META={
  "Bunyamin Klongsamoot":{nat:"THA"},"Kan Kachachuen":{nat:"THA"},
  "Chatree Makmul":{nat:"THA"},"Manintorn Leelas":{nat:"THA"},
  "Mihiro Okada":{nat:"JPN"},"Iwao Yasuda":{nat:"JPN"},
  "Yuto Tsutsumi":{nat:"JPN"},"Taishi Goto":{nat:"JPN"},
};

export function athleteNat(name,evList){
  const counts={};
  for(const ev of evList){
    const e=ev.entries.find(x=>x.helm===name||x.crew===name);
    if(e?.nat){counts[e.nat]=(counts[e.nat]||0)+1;}
  }
  if(!Object.keys(counts).length) return META[name]?.nat||"";
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}

// Most-frequently-seen birth year for an athlete (as helm or crew), or null.
export function athleteBirthYear(name,evList){
  const counts={};
  for(const ev of (evList||[])){
    for(const e of (ev.entries||[])){
      let by=null;
      if(e.helm===name) by=e.birth_year;
      else if(e.crew===name) by=e.crew_birth_year;
      if(by){counts[by]=(counts[by]||0)+1;}
    }
  }
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  return top?parseInt(top[0]):null;
}

// Build name -> home ISO-A2 (most frequent nationality seen anywhere in the data)
export function buildHomeCountry(evList){
  const tally={};
  for(const ev of evList){
    for(const e of (ev.entries||[])){
      const ioc=e.nat||""; if(!ioc) continue;
      const iso=IOC_ISO[ioc]||""; if(!iso) continue;
      for(const nm of [e.helm,e.crew]){
        if(!nm) continue;
        (tally[nm]||(tally[nm]={}));
        tally[nm][iso]=(tally[nm][iso]||0)+1;
      }
    }
  }
  // seed with META nationality (weak weight) so known athletes still resolve
  for(const nm in META){
    const iso=IOC_ISO[META[nm]?.nat||""]||""; if(!iso) continue;
    (tally[nm]||(tally[nm]={})); if(!tally[nm][iso]) tally[nm][iso]=0.5;
  }
  const home={};
  for(const nm in tally){
    home[nm]=Object.entries(tally[nm]).sort((a,b)=>b[1]-a[1])[0][0];
  }
  return home;
}
