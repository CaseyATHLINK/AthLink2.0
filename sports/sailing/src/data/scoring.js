/* Sailing scoring engine — the core net/discard calculator and its code
   constants. Reorg step 4: split out of App.jsx (its most interconnected piece;
   also injected into @athlink/rating via makeRatingEngine). Pure — no app-state
   deps. Verbatim from App.jsx. */

import { dateKey } from "../util/date.js";
import { canonName, eventKey, ordinalOf } from "../util/name.js";
import { genderCatOf } from "../util/gender.js";
import { resolvedEntryGender } from "./athletes.js";

/* ── Scoring codes ────────────────────────────────────────────────────────
   NEVER_DISCARD: cannot be dropped even if it would improve the score
   VARIABLE:      the PDF already provides the numeric value (RDG, SCP, STP, DPI, ZFP etc.)
                  — treat the stored value as-is for points, use fleet+1 for discard ranking
                  when no explicit number is stored
   PENALTY:       score = fleet + 1
   ────────────────────────────────────────────────────────────────────── */
export const NEVER_DISCARD=new Set(["DNE"]);

// Codes where the PDF provides an explicit numeric value that we already stored
// For discard comparison we still treat them as fleet+1 unless an explicit number was parsed
export const CODE_WEIGHT={
  // Hard fleet+1
  OCS:1,UFD:1,BFD:1,DSQ:1,DNF:1,DNC:1,DNS:1,RET:1,NSC:1,
  // Also fleet+1 for discard purposes (variable numeric for net scoring)
  SCP:1,STP:1,DPI:1,ZFP:1,TAL:1,
  // RDG: redress — the number is already stored as a numeric value by the parser
  // We do NOT score it as fleet+1; whatever number came in is used
  RDG:0,
};

export const isCode=c=>typeof c==="string";
export const isPenaltyCode=c=>isCode(c)&&CODE_WEIGHT[c]!==undefined&&CODE_WEIGHT[c]===1;

/* ── scoring engine ───────────────────────────────────────────────────────
   Rules:
   - DNE can NEVER be discarded
   - All other penalty codes score as fleet+1 for both net and discard ranking
   - RDG/SCP/STP/DPI: the stored value (already a number from the PDF) is used
     for net scoring; for discard ranking they compete as fleet+1 unless already a number
   - Discards applied to the N worst scores (by point value), DNE excluded
   ────────────────────────────────────────────────────────────────────── */
export function scoreEvent(ev){
  const fleet=ev.entries.length, pen=fleet+1, disc=ev.discards;

  const rows=ev.entries.map(e=>{
    // Convert each raw score to a numeric point value for net scoring
    const pts=e.races.map(c=>{
      if(!isCode(c)) return(c||pen);
      return pen; // all penalty codes = fleet+1 for calculation purposes
    });

    // For discard ranking: DNE can never be discarded; everything else
    // sorted by point weight descending, top N become discards
    const weights=pts.map((v,i)=>{
      const raw=e.races[i];
      if(isCode(raw)&&NEVER_DISCARD.has(raw)) return -Infinity;
      return v;
    });
    const order=weights.map((w,i)=>({w,i})).sort((a,b)=>b.w-a.w);
    const discardSet=new Set(order.slice(0,disc).filter(o=>o.w>-Infinity).map(o=>o.i));

    const numPts=pts.map(v=>v);
    const total=numPts.reduce((a,b)=>a+b,0);
    const dropped=numPts.reduce((s,v,i)=>discardSet.has(i)?s+v:s,0);
    const calcNet=total-dropped;

    // Use PDF-sourced rank/net when available (they are always correct).
    // Fall back to our calculation only for manually-entered events or
    // PDFs where the rank column wasn't parseable.
    const rank = e.pdf_rank ?? null;
    const net  = e.pdf_net  ?? calcNet;

    return{...e,pts:numPts,total,net,calcNet,discardSet,rank};
  });

  // Sort by PDF rank when available, otherwise by calculated net
  const hasPdfRank = rows.some(r=>r.rank!==null);
  if(hasPdfRank){
    rows.sort((a,b)=>(a.rank??9999)-(b.rank??9999));
  } else {
    rows.sort((a,b)=>a.net-b.net||a.total-b.total);
    let prev=null,prevRank=0;
    rows.forEach((r,i)=>{
      if(prev&&r.net===prev.net&&r.total===prev.total) r.rank=prevRank;
      else{r.rank=i+1;prevRank=r.rank;}
      prev=r;
    });
  }
  const countries=new Set(ev.entries.map(e=>(e.nat||"").trim().toUpperCase()).filter(Boolean)).size;
  return{rows,fleet,races:Math.max(...ev.entries.map(e=>e.races.length)),countries};
}

export function scorePreview(ev){
  if(!ev?.entries?.length) return null;
  const maxR=Math.max(...ev.entries.map(e=>(e.races||[]).length),1);
  const clean={...ev,entries:ev.entries.map(e=>({
    ...e,
    races:Array.from({length:maxR},(_,i)=>{
      const v=(e.races||[])[i];
      return(v===null||v===undefined||v==='')?"DNF":v;
    })
  }))};
  return scoreEvent(clean);
}

export function aggregate(name,evList){
  const history=[];let wins=0,podiums=0,best=Infinity;
  const target=canonName(name);
  const seenComp=new Set(); // dedupe identical competition rows (duplicate imports)
  for(const ev of evList){
    if(ev.status==="Draft") continue;
    const e=ev.entries.find(x=>canonName(x.helm)===target||canonName(x.crew)===target);
    if(!e) continue;
    const s=scoreEvent(ev);
    const row=s.rows.find(r=>r.helm===e.helm&&r.crew===e.crew&&r.sail===e.sail);
    if(!row) continue;
    // Signature: same competition + same finishing line for this athlete → same result.
    const sig=`${eventKey(ev)}|${e.sail||""}|${row.rank}|${row.net}|${(row.races||[]).join(",")}`;
    if(seenComp.has(sig)) continue;
    seenComp.add(sig);
    const role=canonName(e.helm)===target?"Helm":"Crew";
    const partner=role==="Helm"?e.crew:e.helm;
    row.races.forEach(c=>{if(c===1) wins++;});
    if(row.rank<=3) podiums++;
    if(row.rank<best) best=row.rank;
    history.push({ev,row:{...row,nat:e.nat||""},role,partner,fleet:s.fleet,countries:s.countries});
  }
  // Sort newest-first via a robust YYYYMMDD key (dates are DD/MM/YYYY; new Date()
  // misreads that, which previously left history[0] = wrong "most recent").
  history.sort((a,b)=>dateKey(b.ev.date).localeCompare(dateKey(a.ev.date)));
  return{history,wins,podiums,best:best===Infinity?null:best,events:history.length};
}

/* ── Outstanding-achievement (division podium) detection (moved from App.jsx,
   reorg step 4). MIN_DIVISION_SIZE + divisionDisplayName are module-internal;
   only outstandingAchievementFor is re-imported by App.jsx. Verbatim. */
const MIN_DIVISION_SIZE=4; // a division needs at least this many entries to count (tunable)
function divisionDisplayName(code){
  if(!code) return "";
  const m=String(code).match(/^U(\d{1,2})$/i); if(m) return "Under-"+m[1];
  if(code==="Jr") return "Junior";
  if(code==="Mst") return "Masters";
  if(code==="F") return "Female";
  if(code==="M") return "Male";
  if(code==="Mix") return "Mixed";
  return String(code); // unknown code: show as-is, never guess
}
// h = an ag.history row. Returns {rank, divisionLabel, label, title} | null.
// Two independent axes: age category and gender. One badge per row — best
// division rank wins, tie prefers category; runner-up goes in the tooltip.
export function outstandingAchievementFor(h,athleteName){
  const ev=h?.ev, entries=ev?.entries;
  if(!entries||entries.length<MIN_DIVISION_SIZE) return null;
  const overall=h.row?.rank;
  if(!(overall>=1)) return null;
  const target=canonName(athleteName);
  const own=entries.find(e=>canonName(e.helm)===target||canonName(e.crew)===target);
  if(!own) return null;
  const dh=!!ev.doublehanded;
  const ownCat=genderCatOf(own).category;
  const ownGen=resolvedEntryGender(own,dh);
  const axes=[];
  if(ownCat) axes.push({axis:"category",code:ownCat,of:e=>genderCatOf(e).category});
  if(ownGen) axes.push({axis:"gender",code:ownGen,of:e=>resolvedEntryGender(e,dh)});
  if(!axes.length) return null;
  // Official overall order: scoreEvent rows are sorted by official rank (PDF
  // ground truth first); unranked rows keep their official array order.
  let rows;
  try{rows=scoreEvent(ev).rows;}catch{return null;}
  const isOwn=r=>r.helm===own.helm&&r.crew===own.crew&&r.sail===own.sail;
  const hits=[];
  for(const {axis,code,of} of axes){
    const div=rows.filter(r=>of(r)===code);
    if(div.length<MIN_DIVISION_SIZE||div.length>=rows.length) continue; // must be a strict, real subset
    const pos=div.findIndex(isOwn)+1;
    if(pos<1||pos>3) continue;          // division podium only
    if(pos>=overall) continue;          // must beat the overall rank chip
    hits.push({axis,code,rank:pos});
  }
  if(!hits.length) return null;
  hits.sort((a,b)=>a.rank-b.rank||(a.axis==="category"?-1:1)); // best rank; tie → age category
  const best=hits[0], second=hits[1];
  const divisionLabel=`${ordinalOf(best.rank)} ${divisionDisplayName(best.code)}`;
  const label=`Outstanding Achievement: ${divisionLabel}`;
  const title=second?`${label} · also ${ordinalOf(second.rank)} ${divisionDisplayName(second.code)}`:label;
  return{rank:best.rank,divisionLabel,label,title};
}
