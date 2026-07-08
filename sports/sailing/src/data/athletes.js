/* Per-athlete attribute registry for sailing — a single pass over all events
   builds ATHLETE_ATTRS (gender / birth year / most-recent class, by canonName).
   Reorg step 4: split out of App.jsx. MUTABLE module state: buildAthleteAttrs
   reassigns ATHLETE_ATTRS internally, so App.jsx reads it via an ESM live binding
   (no setter needed) and calls buildAthleteAttrs(events) for the side effect; its
   useMemo([events]) still drives re-renders. Verbatim from App.jsx. */

import { dateKey } from "../util/date.js";
import { canonName } from "../util/name.js";
import { genderCatOf } from "../util/gender.js";

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
