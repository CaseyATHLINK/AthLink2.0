/* Scout portal analytics — pure, results-only metrics over the app's loaded
   `events` array. No fetches, no weather/external data. Indexes are built once
   per call and memoised in a WeakMap keyed by the events array identity (same
   trick as the rating engine's getAthleteRatings), so repeated reads on a stable
   dataset are cheap. All functions skip Draft events and upcoming entry lists
   (isUpcomingEvent) wherever results are required. Athlete identity is canonName;
   an athlete is credited as helm AND/OR crew, exactly like computeAthleteRatings.

   The `ratings` param throughout is the Map from ratingEngine.getAthleteRatings(events)
   — injected by the caller (App). We take it as an argument rather than importing
   the shared instance from views/charts.jsx, because charts.jsx imports data/
   modules (scoring.js) and pulling it back into data/ would form an import cycle. */

import { scoreEvent, isUpcomingEvent } from "./scoring.js";
import { canonName } from "../util/name.js";
import { dateKey, monthsBetween } from "../util/date.js";

/* ── thresholds / minimums ─────────────────────────────────────────────────
   Data-quality gates: a metric returns null rather than a noisy value below its
   floor. Tuned so a couple of regattas can't manufacture a signal. */
const MIN_EVENTS=3;        // events with results before per-athlete metrics resolve
const MIN_RACES=6;         // races across those events before race-level metrics resolve
const BLOWUP_BAND=0.9;     // race percentile ≥ this ⇒ "blow-up" (worst-10% finish)
const STEADY_SCALE=0.35;   // stdev→0-100 map: score=100·(1−min(1,stdev/SCALE))

const CACHE=new WeakMap(); // events array identity -> {index, evStats}

/* Per-event compute cache: scoreEvent rows + per-race points, memoised so the
   spine and every metric share one pass. Skips Draft + upcoming. */
function eventStats(events){
  const hit=CACHE.get(events);
  if(hit) return hit;
  const evStats=new Map();   // ev -> {fleet, dk, rows, raceCount, racePct:[[pct per entry] per race], entryPct:Map(rowIdx→finishPct)}
  for(const ev of (events||[])){
    if(!ev||ev.status==="Draft") continue;
    if(isUpcomingEvent(ev)) continue;
    let sc; try{ sc=scoreEvent(ev); }catch{ continue; }
    const fleet=sc.fleet;
    if(!(fleet>=2)) continue;
    const dk=dateKey(ev.date);
    // per-race percentile: rank entries by that race's point value (letter codes
    // and missing scores = fleet+1), percentile = (rank-1)/(fleet-1) so best→0.
    const races=sc.races;
    const racePct=[]; // racePct[raceIdx] = Map(entryIndex → pct)
    for(let ri=0; ri<races; ri++){
      const vals=ev.entries.map((e,ei)=>{
        const raw=(e.races||[])[ri];
        const v=(typeof raw==="number")?raw:(fleet+1); // codes/missing → fleet+1
        return {ei,v};
      });
      const sorted=[...vals].sort((a,b)=>a.v-b.v);
      const rankOf=new Map();
      let prev=null,prevRank=0;
      sorted.forEach((o,i)=>{ // tie-aware standard competition rank
        if(prev!=null&&o.v===prev){rankOf.set(o.ei,prevRank);}
        else{rankOf.set(o.ei,i+1);prevRank=i+1;}
        prev=o.v;
      });
      const m=new Map();
      vals.forEach(({ei})=>m.set(ei,(rankOf.get(ei)-1)/Math.max(1,fleet-1)));
      racePct.push(m);
    }
    evStats.set(ev,{ev,fleet,dk,rows:sc.rows,raceCount:races,racePct});
  }
  const out={evStats};
  CACHE.set(events,out);
  return out;
}

/* Map an entry's per-race letter codes to a normalised set. race_codes is the
   parallel letter array; races[] may also carry a string code directly. */
function raceCodesOf(entry){
  const codes=entry?.race_codes;
  const races=entry?.races||[];
  const out=[];
  const n=Math.max(races.length,Array.isArray(codes)?codes.length:0);
  for(let i=0;i<n;i++){
    let c=Array.isArray(codes)?codes[i]:null;
    if(!c && typeof races[i]==="string") c=races[i];
    out.push(c?String(c).toUpperCase():null);
  }
  return out;
}

const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const stdev=a=>{if(a.length<2)return null;const m=mean(a);return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0)/a.length);};
const pctile=(sorted,p)=>{ // p in [0,1] over a pre-sorted numeric array; null if empty
  if(!sorted.length) return null;
  const idx=Math.min(sorted.length-1,Math.max(0,Math.round(p*(sorted.length-1))));
  return sorted[idx];
};

/**
 * athleteIndex — shared spine: canon → [{ev,entry,rank,fleet,dk,role}] sorted by dk asc.
 * @returns {Map<string,Array<{ev,entry,rank:number,fleet:number,dk:string,role:'helm'|'crew'}>>}
 */
export function athleteIndex(events){
  const {evStats}=eventStats(events);
  const cacheHit=CACHE.get(events);
  if(cacheHit && cacheHit.index) return cacheHit.index;
  const index=new Map();
  const push=(k,rec)=>{if(!k)return;(index.get(k)||index.set(k,[]).get(k)).push(rec);};
  evStats.forEach(({ev,fleet,dk,rows})=>{
    // rank READ from scoreEvent rows (PDF truth, tie-aware). Credit helm + crew.
    rows.forEach(r=>{
      if(r.rank==null) return;
      const entry=ev.entries.find(e=>e.helm===r.helm&&e.crew===r.crew&&e.sail===r.sail)||r;
      const hk=canonName(r.helm), ck=canonName(r.crew);
      if(hk) push(hk,{ev,entry,rank:r.rank,fleet,dk,role:"helm"});
      if(ck&&ck!==hk) push(ck,{ev,entry,rank:r.rank,fleet,dk,role:"crew"});
    });
  });
  index.forEach(list=>list.sort((a,b)=>String(a.dk).localeCompare(String(b.dk))));
  if(cacheHit) cacheHit.index=index;
  return index;
}

// entry finish percentile within its event (rank 1 → 0, last → 1).
const finishPct=(rank,fleet)=>fleet>1?(rank-1)/(fleet-1):0;

// per-race percentile series for one entry within one event (from evStats).
function entryRacePcts(st,entry){
  const ei=st.ev.entries.indexOf(entry);
  if(ei<0) return [];
  return st.racePct.map(m=>m.get(ei)).filter(v=>v!=null);
}

// trailing rating delta over `windowMonths` by dk, from a rating history[].
function ratingDelta(history,windowMonths){
  const h=(history||[]).filter(p=>p&&p.dk);
  if(h.length<1) return null;
  const last=h[h.length-1];
  const from=h.filter(p=>Math.abs(monthsBetween(p.dk,last.dk))<=windowMonths);
  if(from.length<1) return null;
  // baseline = pre-value of the earliest in-window event (its r minus its delta),
  // i.e. the rating going INTO the window; delta = last.r − that baseline.
  const base=from[0].r-(from[0].delta||0);
  return last.r-base;
}

/**
 * metricsForAthlete — full results-only scouting profile for one athlete.
 * @returns {null|object} null if unknown; each sub-metric null when below its data floor.
 */
export function metricsForAthlete(name,events,ratings){
  const key=canonName(name);
  const {evStats}=eventStats(events);
  const idx=athleteIndex(events);
  const spine=idx.get(key);
  if(!spine||!spine.length) return null;
  const rec=ratings&&ratings.get?ratings.get(key):null;
  const history=rec?.history||[];

  // gather per-event percentile detail
  const perEvent=spine.map(s=>{
    const st=evStats.get(s.ev);
    const racePcts=st?entryRacePcts(st,s.entry):[];
    const codes=raceCodesOf(s.entry);
    return {...s, st, racePcts, codes, eventPct:finishPct(s.rank,s.fleet)};
  });
  const totalRaces=perEvent.reduce((n,e)=>n+e.racePcts.length,0);
  const enoughEvents=perEvent.length>=MIN_EVENTS;
  const enoughRaces=totalRaces>=MIN_RACES;

  // ── ratings ──
  const ratingNow=rec?rec.r:null, rd=rec?rec.rd:null;
  const delta30=history.length?ratingDelta(history,1):null;
  const delta90=history.length?ratingDelta(history,3):null;
  const delta365=history.length?ratingDelta(history,12):null;

  // ── consistency: mean per-event stdev of race percentile; steadiness 0-100 ──
  let consistency=null;
  if(enoughEvents&&enoughRaces){
    const evStdevs=perEvent.map(e=>stdev(e.racePcts)).filter(v=>v!=null);
    const m=mean(evStdevs);
    if(m!=null) consistency={stdev:m,steadiness:Math.round(100*(1-Math.min(1,m/STEADY_SCALE)))};
  }

  // ── blowupRate: share of races in the worst-10% band OR letter-coded ──
  let blowupRate=null;
  if(enoughRaces){
    let bad=0,tot=0;
    perEvent.forEach(e=>{
      e.racePcts.forEach(p=>{tot++;if(p>=BLOWUP_BAND)bad++;});
    });
    blowupRate=tot?bad/tot:null;
  }

  // ── startRisk: flag/bullet/breakdown/absentee rates ──
  let startRisk=null;
  if(enoughRaces){
    let flag=0,bullet=0,breakdown=0,absent=0,tot=0;
    perEvent.forEach(e=>{
      const races=e.entry.races||[];
      const codes=e.codes;
      const n=Math.max(races.length,codes.length);
      for(let i=0;i<n;i++){
        tot++;
        const c=codes[i];
        if(c==="UFD"||c==="BFD"||c==="OCS") flag++;
        if(c==="DNF"||c==="RET") breakdown++;
        if(c==="DNC") absent++;
        if(typeof races[i]==="number"&&races[i]===1) bullet++;
      }
    });
    startRisk=tot?{flagRate:flag/tot,bulletRate:bullet/tot,breakdownRate:breakdown/tot,absenteeism:absent/tot}:null;
  }

  // ── regattaLearner: mean(last-third pct − first-third pct) over multi-race events ──
  let regattaLearner=null;
  {
    const diffs=[];
    perEvent.forEach(e=>{
      const p=e.racePcts;
      if(p.length<3) return;
      const t=Math.floor(p.length/3);
      const first=mean(p.slice(0,t)), last=mean(p.slice(p.length-t));
      if(first!=null&&last!=null) diffs.push(last-first);
    });
    if(diffs.length>=2) regattaLearner=mean(diffs);
  }

  // ── slowStarter: mean(first-race pct − event mean pct) ──
  let slowStarter=null;
  {
    const diffs=[];
    perEvent.forEach(e=>{
      const p=e.racePcts;
      if(p.length<2) return;
      const em=mean(p);
      if(em!=null) diffs.push(p[0]-em);
    });
    if(diffs.length>=2) slowStarter=mean(diffs);
  }

  // ── travel: modal venue vs elsewhere mean finish pct (≥2 events each side) ──
  let travel=null;
  {
    const byVenue=new Map();
    perEvent.forEach(e=>{const v=e.ev.venue||"—";(byVenue.get(v)||byVenue.set(v,[]).get(v)).push(e.eventPct);});
    let home=null,homeN=0;
    byVenue.forEach((arr,v)=>{if(arr.length>homeN){homeN=arr.length;home=v;}});
    if(home){
      const homeArr=byVenue.get(home);
      const awayArr=[];perEvent.forEach(e=>{if((e.ev.venue||"—")!==home)awayArr.push(e.eventPct);});
      if(homeArr.length>=2&&awayArr.length>=2){
        const hp=mean(homeArr), ap=mean(awayArr);
        travel={homeVenue:home,homeShare:homeArr.length/perEvent.length,homePct:hp,awayPct:ap};
      }
    }
  }

  // ── pressureDelta: mean pct at fleet≥P75 vs fleet≤P25 of their fleets ──
  let pressureDelta=null;
  if(perEvent.length>=4){
    const fleets=perEvent.map(e=>e.fleet).sort((a,b)=>a-b);
    const p75=pctile(fleets,0.75), p25=pctile(fleets,0.25);
    if(p75!=null&&p25!=null&&p75>p25){
      const big=perEvent.filter(e=>e.fleet>=p75).map(e=>e.eventPct);
      const small=perEvent.filter(e=>e.fleet<=p25).map(e=>e.eventPct);
      if(big.length&&small.length) pressureDelta=mean(big)-mean(small); // negative = elevates on big stage
    }
  }

  // ── pairings (doublehanded only): per-partner + stability ──
  let pairings=null;
  {
    const dhEvents=perEvent.filter(e=>e.ev.doublehanded);
    if(dhEvents.length){
      const byPartner=new Map();
      dhEvents.forEach(e=>{
        const partnerRaw=e.role==="helm"?e.entry.crew:e.entry.helm;
        const pk=canonName(partnerRaw);
        if(!pk) return;
        const rec=byPartner.get(pk)||{partner:partnerRaw,events:0,pcts:[]};
        rec.events++; rec.pcts.push(e.eventPct); byPartner.set(pk,rec);
      });
      if(byPartner.size){
        const list=[...byPartner.values()].map(r=>({partner:r.partner,events:r.events,meanPct:mean(r.pcts)}))
          .sort((a,b)=>b.events-a.events);
        const topEvents=list.length?list[0].events:0;
        const totalPaired=list.reduce((s,r)=>s+r.events,0);
        pairings={partners:list,stability:totalPaired?topEvents/totalPaired:null};
      }
    }
  }

  // ── classCarryover: per class timeline ──
  let classCarryover=null;
  {
    const byCls=new Map();
    perEvent.forEach(e=>{
      const c=e.ev.cls||"—";
      const rec=byCls.get(c)||{cls:c,events:0,firstDk:null,lastDk:null,pcts:[]};
      rec.events++; rec.pcts.push(e.eventPct);
      if(rec.firstDk==null||String(e.dk)<rec.firstDk) rec.firstDk=e.dk;
      if(rec.lastDk==null||String(e.dk)>rec.lastDk) rec.lastDk=e.dk;
      byCls.set(c,rec);
    });
    classCarryover=[...byCls.values()].map(r=>({cls:r.cls,events:r.events,firstDk:r.firstDk,lastDk:r.lastDk,meanPct:mean(r.pcts)}))
      .sort((a,b)=>String(a.firstDk).localeCompare(String(b.firstDk)));
  }

  // ── cohortPercentile: rating rank within same birth_year athletes with ratings ──
  let cohortPercentile=null;
  {
    const by=birthYearOf(spine);
    if(by!=null&&ratingNow!=null&&ratings){
      const peers=[];
      idx.forEach((list,k)=>{
        const r=ratings.get?ratings.get(k):null;
        if(!r) return;
        if(birthYearOf(list)===by) peers.push(r.r);
      });
      if(peers.length>=2){
        peers.sort((a,b)=>a-b);
        const below=peers.filter(v=>v<ratingNow).length;
        cohortPercentile={birthYear:by,peers:peers.length,percentile:below/(peers.length-1)};
      }
    }
  }

  // ── streak: current consecutive-event streak (most impressive band) ──
  const streak=streakForSpine(perEvent);

  return {ratingNow,rd,delta30,delta90,delta365,consistency,blowupRate,startRisk,
    regattaLearner,slowStarter,travel,pressureDelta,pairings,classCarryover,cohortPercentile,streak,
    events:perEvent.length,races:totalRaces};
}

// birth_year for an athlete: helm entries carry birth_year, crew entries carry
// crew_birth_year — pick by the role the spine record was credited under.
function birthYearOf(spine){
  for(const s of spine){
    const y=s.role==="crew"?s.entry.crew_birth_year:s.entry.birth_year;
    if(y!=null&&y!=="") return +y;
  }
  return null;
}

// current trailing streak of increasingly-strict placement bands, newest-first.
function streakForSpine(perEvent){
  if(!perEvent.length) return null;
  const desc=[...perEvent].sort((a,b)=>String(b.dk).localeCompare(String(a.dk)));
  const bands=[
    {kind:"top3",ok:e=>e.rank<=3},
    {kind:"podium",ok:e=>e.rank<=3},
    {kind:"top10pct",ok:e=>e.eventPct<=0.1},
  ];
  let best=null;
  for(const b of bands){
    let len=0;
    for(const e of desc){ if(b.ok(e)) len++; else break; }
    if(len>=2&&(!best||len>best.len)) best={kind:b.kind,len};
  }
  return best;
}

/**
 * onFire — biggest rating gains within the trailing `days` window (by dk, using
 * the dataset's latest dk as "now"). @returns {Array<{name,delta,ratingNow,events,cls}>}
 */
export function onFire(events,ratings,{days=30,cls=null,minEvents=2}={}){
  if(!ratings) return [];
  const idx=athleteIndex(events);
  const nowDk=latestDk(events);
  if(!nowDk) return [];
  const months=days/30;
  const out=[];
  idx.forEach((spine,key)=>{
    const rec=ratings.get?ratings.get(key):null;
    if(!rec) return;
    const h=(rec.history||[]).filter(p=>p&&p.dk);
    const inWin=h.filter(p=>Math.abs(monthsBetween(p.dk,nowDk))<=months);
    const clsHits=cls?inWin.filter(p=>p.cls===cls):inWin;
    if(clsHits.length<minEvents) return;
    const base=inWin[0].r-(inWin[0].delta||0);
    const delta=rec.r-base;
    const dispName=spine.find(s=>s.role==="helm")?.entry.helm||spine[0].entry.helm||spine[0].entry.crew||key;
    out.push({name:dispName,delta,ratingNow:rec.r,events:clsHits.length,cls:cls||clsHits[clsHits.length-1]?.cls||null});
  });
  return out.sort((a,b)=>b.delta-a.delta);
}

/**
 * streaks — all athletes with a current active placement streak, most impressive first.
 * @returns {Array<{name,kind,len,lastEvName}>}
 */
export function streaks(events,{minLen=2}={}){
  const {evStats}=eventStats(events);
  const idx=athleteIndex(events);
  const out=[];
  idx.forEach((spine,key)=>{
    const perEvent=spine.map(s=>({...s,eventPct:finishPct(s.rank,s.fleet)}));
    const st=streakForSpine(perEvent);
    if(!st||st.len<minLen) return;
    const newest=[...spine].sort((a,b)=>String(b.dk).localeCompare(String(a.dk)))[0];
    const dispName=spine.find(s=>s.role==="helm")?.entry.helm||spine[0].entry.helm||spine[0].entry.crew||key;
    out.push({name:dispName,kind:st.kind,len:st.len,lastEvName:newest?.ev.name||null});
  });
  const order={top3:3,podium:2,top10pct:1};
  return out.sort((a,b)=>b.len-a.len||(order[b.kind]||0)-(order[a.kind]||0));
}

/**
 * radar — athletes whose rating crossed `threshold` upward within trailing `days`.
 * @returns {Array<{name,crossedDk,ratingNow,before,after}>}
 */
export function radar(events,ratings,{threshold=1400,days=60}={}){
  if(!ratings) return [];
  const idx=athleteIndex(events);
  const nowDk=latestDk(events);
  if(!nowDk) return [];
  const months=days/30;
  const out=[];
  idx.forEach((spine,key)=>{
    const rec=ratings.get?ratings.get(key):null;
    if(!rec) return;
    const h=(rec.history||[]).filter(p=>p&&p.dk);
    for(let i=0;i<h.length;i++){
      const before=h[i].r-(h[i].delta||0), after=h[i].r;
      if(before<threshold&&after>=threshold&&Math.abs(monthsBetween(h[i].dk,nowDk))<=months){
        const dispName=spine.find(s=>s.role==="helm")?.entry.helm||spine[0].entry.helm||spine[0].entry.crew||key;
        out.push({name:dispName,crossedDk:h[i].dk,ratingNow:rec.r,before,after});
        break;
      }
    }
  });
  return out.sort((a,b)=>String(b.crossedDk).localeCompare(String(a.crossedDk)));
}

/**
 * beatForecast — breakout detector: finishers who beat their pre-event rating seed
 * by ≥15% of fleet, within trailing `days`. expected = seed rank by PRE-event
 * rating; actual = pdf_rank; beat = (expected−actual)/fleet.
 * @returns {Array<{name,evName,evId,dk,expected,actual,fleet,beat}>}
 */
export function beatForecast(events,ratings,{days=90,minFleet=8}={}){
  if(!ratings) return [];
  const {evStats}=eventStats(events);
  const nowDk=latestDk(events);
  if(!nowDk) return [];
  const months=days/30;
  // pre-event rating lookup: for (canon,evId), r − delta from that history item.
  const preRByEv=new Map(); // canon -> Map(evId -> preR)
  ratings.forEach&&ratings.forEach((rec,k)=>{
    const m=new Map();
    (rec.history||[]).forEach(p=>{if(p.evId!=null)m.set(p.evId,p.r-(p.delta||0));});
    preRByEv.set(k,m);
  });
  const preRFor=(k,evId)=>{
    const m=preRByEv.get(k);
    const v=m?m.get(evId):undefined;
    return (v==null)?1200:v; // no history for this event ⇒ fresh-seed default
  };
  const out=[];
  evStats.forEach(({ev,fleet,dk,rows})=>{
    if(fleet<minFleet) return;
    if(!dk||Math.abs(monthsBetween(dk,nowDk))>months) return;
    // pre-event seed r per entry (helm's key; entries are boats)
    const seed=rows.map(r=>{
      const hk=canonName(r.helm);
      return {r,preR:preRFor(hk,ev.id),hk};
    });
    seed.forEach(({r,preR,hk})=>{
      if(r.rank==null) return;
      const expected=1+seed.filter(o=>o.preR>preR).length; // seed rank (higher r = better seed)
      const actual=r.rank;
      const beat=(expected-actual)/fleet;
      if(beat>=0.15){
        const dispName=r.helm||r.crew||hk;
        out.push({name:dispName,evName:ev.name,evId:ev.id,dk,expected,actual,fleet,beat});
      }
    });
  });
  return out.sort((a,b)=>b.beat-a.beat);
}

/**
 * digestFor — watchlist-scoped update bundle since `sinceDk`.
 * @returns {{newResults:Array,upcoming:Array,movers:Array}}
 */
export function digestFor(events,ratings,{watchedKeys,sinceDk}={}){
  const watched=watchedKeys instanceof Set?watchedKeys:new Set(watchedKeys||[]);
  const idx=athleteIndex(events);
  const newResults=[], movers=[];
  const since=sinceDk||"";
  watched.forEach(key=>{
    const spine=idx.get(key);
    const rec=ratings&&ratings.get?ratings.get(key):null;
    const dispName=spine?(spine.find(s=>s.role==="helm")?.entry.helm||spine[0].entry.helm||spine[0].entry.crew||key):key;
    // new results since sinceDk
    (spine||[]).forEach(s=>{
      if(since&&String(s.dk)<=since) return;
      const h=rec?.history?.find(p=>p.evId===s.ev.id);
      newResults.push({name:dispName,evName:s.ev.name,evId:s.ev.id,dk:s.dk,rank:s.rank,fleet:s.fleet,delta:h?h.delta:null});
    });
    // trailing 30-day rating mover
    if(rec){
      const d30=ratingDelta(rec.history,1);
      if(d30!=null&&Math.abs(d30)>0.0001) movers.push({name:dispName,delta30:d30});
    }
  });
  // upcoming: watched athletes appearing in upcoming (entry-list) events
  const upcoming=[];
  for(const ev of (events||[])){
    if(!ev||ev.status==="Draft") continue;
    if(!isUpcomingEvent(ev)) continue;
    (ev.entries||[]).forEach(e=>{
      [ {n:e.helm}, {n:e.crew} ].forEach(({n})=>{
        const k=canonName(n);
        if(k&&watched.has(k)) upcoming.push({name:n,evName:ev.name,evId:ev.id,dk:dateKey(ev.date)});
      });
    });
  }
  newResults.sort((a,b)=>String(b.dk).localeCompare(String(a.dk)));
  movers.sort((a,b)=>Math.abs(b.delta30)-Math.abs(a.delta30));
  return {newResults,upcoming,movers};
}

// dataset's latest dated event key — "now" for windowed metrics (demo-data safe).
function latestDk(events){
  let now="";
  for(const ev of (events||[])){
    if(!ev||ev.status==="Draft") continue;
    const dk=dateKey(ev.date);
    if(dk&&dk>now) now=dk;
  }
  return now;
}
