/* Sailing scoring engine — the core net/discard calculator and its code
   constants. Reorg step 4: split out of App.jsx (its most interconnected piece;
   also injected into @athlink/rating via makeRatingEngine). Pure — no app-state
   deps. Verbatim from App.jsx. */

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
