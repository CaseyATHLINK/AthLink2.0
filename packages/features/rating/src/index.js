/* @athlink/rating — Glicko-lite skill ratings + rating-aware rival cohort.
   Universal engine: the sport injects its ranking + identity helpers, so golf
   (or any sport) reuses it by binding its own scoreEvent/canonName. Extracted
   VERBATIM from sports/sailing/src/App.jsx — logic unchanged, only wrapped in a
   factory that closes over the injected deps.

   Injected deps:
     scoreEvent(ev)     -> { rows: [{ helm, crew, rank, ... }] }  (sport ranking; PDF is truth)
     canonName(raw)     -> canonical athlete key (dedupes name spellings)
     dateKey(dateStr)   -> sortable "YYYYMMDD" string, or falsy when undated
     monthsBetween(a,b) -> months between two dateKeys

   Public API (returned by makeRatingEngine):
     computeAthleteRatings(events) -> Map(canon -> { r, rd, lastDk, history[] })
     getAthleteRatings(events)     -> cached computeAthleteRatings (WeakMap by events identity)
     computeRivalCohort(name, events, N=15) -> { focal, rivals[], clsCount, natCount, focalEvData, ... }
     projectRating(history, months=12) -> { points:[{m,r,rd,cone,lo,hi}], slope, rate, base } | null
     ratingAsOf(athlete, dk)       -> { r, rd, provisional } (RD idle-grown to dk; null athlete = fresh seed)
     simulateFleet(entrants, opts) -> { iters, rows:[{...entrant, win, podium, top10, expFinish, p16, p50, p84, dist[]}] } | null
*/
export function makeRatingEngine({ scoreEvent, canonName, dateKey, monthsBetween }) {
  /* === Rating engine (Glicko-lite Elo) ========================================
     ONE global rating per athlete (class is context, not modelled). Each athlete
     has a rating R and an uncertainty RD; new athletes start at R=1200, RD=350.
     A regatta is ONE rated contest: ratings update once per event, events in
     chronological dateKey order (undated events are excluded — they can't be
     ordered). Within an event it's a multiplayer Elo pass computed from a snapshot
     of pre-event ratings (never sequentially). RD grows with idle time and on a
     class switch, shrinks a touch each rated event. PDF is ground truth — ranks
     are READ from scoreEvent rows (tie-aware), never re-ranked here. */
  const RATING_START=1200, RD_START=240, RD_MIN=45, RD_MAX=300; // new-athlete seed + RD bounds (tighter: less doubt to start, and can settle lower)
  const RATING_SCALE=400;        // Elo logistic scale (spread at which a 10x expected-score edge sits)
  const K_BASE=32;               // per-event K at RD_MIN; scales UP with RD (more uncertain ⇒ bigger swing)
  const RD_DECAY_C=12;           // RD growth per idle month: sqrt(RD^2 + C^2 * monthsIdle), capped at RD_MAX (idle re-widens more slowly)
  const RD_EVENT_SHRINK=0.90;    // RD multiplier per rated event (confidence grows ~3x faster than the old 0.97), floored at RD_MIN
  const CLS_SWITCH_RD_BUMP=35;   // added to RD (capped) the first time an athlete rates in a new class (smaller re-widening)
  // Lazy per-events-array rating cache. Keyed by the events array reference so a
  // given dataset is computed at most once; a new array (new import/filter) recomputes.
  let RATINGS_CACHE=new WeakMap();
  // Compute one global rating history per athlete from an events array.
  // Returns Map(canon -> {r, rd, lastDk, history:[{dk,date,evId,evName,cls,subclass,rank,fleet,r,rd,delta}]}).
  function computeAthleteRatings(events){
    const out=new Map();                    // canon -> {r, rd, lastDk, lastClsSet:Set, history:[]}
    const list=(events||[])
      .filter(ev=>ev&&ev.status!=="Draft"&&dateKey(ev.date))   // dated, non-Draft only
      .map(ev=>({ev,dk:dateKey(ev.date)}))
      .sort((a,b)=>a.dk.localeCompare(b.dk)||String(a.ev.id||"").localeCompare(String(b.ev.id||"")));
    for(const {ev,dk} of list){
      let rows;
      // unscoreable ⇒ skip for rating; races===0 (an entry list with nothing sailed
      // yet — an upcoming event) would read as a fleet-wide tie, so skip those too.
      try{ const sc=scoreEvent(ev); if(sc.races===0) continue; rows=sc.rows; }catch{ continue; }
      const fleet=rows.length;
      // participant list: canon -> best (lowest) rank; same-boat pairs tracked as mates
      const rankOf=new Map();               // canon -> best rank this event
      const mates=new Map();                // canon -> Set(canon) sharing a boat (never compared)
      rows.forEach(r=>{
        if(r.rank==null) return;
        const hk=canonName(r.helm),ck=canonName(r.crew);
        const keys=[hk,ck].filter(Boolean);
        keys.forEach(k=>{const cur=rankOf.get(k);if(cur==null||r.rank<cur)rankOf.set(k,r.rank);});
        if(hk&&ck&&hk!==ck){
          (mates.get(hk)||mates.set(hk,new Set()).get(hk)).add(ck);
          (mates.get(ck)||mates.set(ck,new Set()).get(ck)).add(hk);
        }
      });
      const parts=[...rankOf.keys()];
      const N=parts.length;
      if(N<2) continue;                     // need ≥2 to compare
      // ── pre-update: grow RD for idle time + class switch, snapshot R/RD ──
      const cls=ev.cls||null;
      const preR=new Array(N), preRD=new Array(N), rec=new Array(N);
      for(let i=0;i<N;i++){
        const k=parts[i];
        let a=out.get(k);
        if(!a){a={r:RATING_START,rd:RD_START,lastDk:"",lastClsSet:new Set(),history:[]};out.set(k,a);}
        // idle-time RD growth since this athlete's last rated event
        if(a.lastDk){
          const idle=Math.abs(monthsBetween(a.lastDk,dk));
          if(idle>0) a.rd=Math.min(RD_MAX,Math.sqrt(a.rd*a.rd+RD_DECAY_C*RD_DECAY_C*idle));
        }
        // first time rating in this class ⇒ bump RD (more uncertain in unfamiliar fleet)
        if(cls&&!a.lastClsSet.has(cls)) a.rd=Math.min(RD_MAX,a.rd+CLS_SWITCH_RD_BUMP);
        preR[i]=a.r; preRD[i]=a.rd; rec[i]=a;
      }
      // ── multiplayer Elo, all deltas from the SAME pre-event snapshot ──
      const rankArr=parts.map(k=>rankOf.get(k));
      const delta=new Array(N).fill(0);
      for(let i=0;i<N;i++){
        const Ri=preR[i], ki=parts[i], mi=mates.get(ki);
        let acc=0, cmp=0;
        for(let j=0;j<N;j++){
          if(j===i) continue;
          if(mi&&mi.has(parts[j])) continue;           // same-boat: partners never compared
          const S = rankArr[i]<rankArr[j]?1 : (rankArr[i]===rankArr[j]?0.5:0);
          const E = 1/(1+Math.pow(10,(preR[j]-Ri)/RATING_SCALE));
          acc += (S-E); cmp++;
        }
        if(cmp>0){
          const Ki=Math.min(K_BASE*4,Math.max(K_BASE,K_BASE*(preRD[i]/RD_MIN)));
          delta[i]=Ki*acc/(N-1);
        }
      }
      // ── apply simultaneously, shrink RD, append history ──
      for(let i=0;i<N;i++){
        const a=rec[i];
        a.r=preR[i]+delta[i];
        a.rd=Math.max(RD_MIN,preRD[i]*RD_EVENT_SHRINK);
        a.lastDk=dk;
        if(cls) a.lastClsSet.add(cls);
        a.history.push({dk,date:ev.date,evId:ev.id,evName:ev.name,cls:ev.cls,subclass:ev.subclass||null,
          rank:rankOf.get(parts[i]),fleet,r:a.r,rd:a.rd,delta:delta[i]});
      }
    }
    // slim the returned shape (drop internal lastClsSet)
    const ret=new Map();
    out.forEach((a,k)=>ret.set(k,{r:a.r,rd:a.rd,lastDk:a.lastDk,history:a.history}));
    return ret;
  }
  // Lazy accessor — compute once per events-array identity. Null/undefined ⇒ empty
  // Map without touching the WeakMap (which would throw on a non-object key).
  function getAthleteRatings(events){
    if(!events) return new Map();
    const hit=RATINGS_CACHE.get(events);
    if(hit) return hit;
    const dev=(typeof import.meta!=="undefined")&&import.meta.env&&import.meta.env.DEV;
    if(dev) console.time("athlink ratings");
    const res=computeAthleteRatings(events);
    if(dev) console.timeEnd("athlink ratings");
    RATINGS_CACHE.set(events,res);
    return res;
  }

  const GAP_K=5;          // steepness of placement-gap decay: prox_e = exp(-GAP_K * gap)
  const ALPHA=1;          // exponent on the decayed-Jaccard co-appearance term
  const BETA=1;           // exponent on the placement-proximity term
  const PROX_FLOOR=0.15;  // proximity when no shared event has both ranks (heavy damping, never fake closeness)
  const MIN_SHARED=2;     // min RAW shared events to qualify as a rival (relaxed to 1 if <5 athletes qualify)
  const RIVAL_HALF_LIFE_M=24;   // months for a shared event's co-appearance weight to halve
  const RATING_PROX_SIGMA=200;  // rating-gap scale: ratingProx = exp(-|ΔR|/SIGMA)
  const GAMMA=1;                // exponent on the rating-proximity term
  const ACTIVITY_HALF_LIFE_M=30;// rival's own recency: months since their last dated event to halve activity
  const UNDATED_W=0.25;         // weight of an undated event in decayed co-appearance counts
  /* ── Rival cohort — single source of truth for "real rivals" ─────────────────
     Shared by AthleteWeb (rival web) and ProgressChart so both views measure
     against the IDENTICAL cohort: canonName keys, Draft events skipped, helm+crew
     both counted. Rivals rank by the combined rivalry score described above —
     decayedJaccard^ALPHA × proximity^BETA × ratingProx^GAMMA × activity
     (recency-weighted co-appearance × placement closeness × rating closeness ×
     the rival's own activity) — with ≥MIN_SHARED RAW shared events to qualify
     (relaxed when <5 qualify), top-N, raw-shared then name tiebreaks. `corr` on
     each rival carries the rivalry score; `shared` stays the RAW integer count for
     display + the eligibility test. Also returns focalEvData: the per-event rank
     maps built ONCE here (ranks READ from scoreEvent rows — PDF-truth, tie-aware)
     and reused by the web's proximity, head-to-head and partner-split views. */

  function computeRivalCohort(name,events,N=15){
    const focal=canonName(name);
    const disp=new Map();                 // canon -> display name
    const shared=new Map();               // canon -> RAW # events shared with focal (display + eligibility)
    const sharedW=new Map();              // canon -> time-decayed shared count (co-appearance term)
    const totals=new Map();               // canon -> RAW total events appeared in (unchanged, returned as-is)
    const totalsW=new Map();              // canon -> time-decayed total events (for decayed Jaccard union)
    const rivalLastDk=new Map();          // canon -> most recent dated event key (for activity term)
    const focalEvData=[];                 // per focal event: {ev, present, rankOf, N(fleet), focalRank, partnerKey, partnerName, mates}
    const clsCount=new Map();             // canon -> Map(classId -> # shared events in that class)
    const natCount=new Map();             // canon -> Map(nat -> count)
    const bump=(map,k,v)=>{if(!v)return;let m=map.get(k);if(!m){m=new Map();map.set(k,m);}m.set(v,(m.get(v)||0)+1);};
    const remember=raw=>{const k=canonName(raw);if(!k)return null;if(!disp.has(k))disp.set(k,raw);return k;};
    // "now" = the dataset's own latest dated event, so decay is relative to the
    // data, not wall-clock (datasets can be fully historical).
    let nowDk="";
    (events||[]).forEach(ev=>{if(ev.status==="Draft")return;const dk=dateKey(ev.date);if(dk&&dk>nowDk)nowDk=dk;});
    let focalTotalW=0;                     // time-decayed count of the focal's own events
    (events||[]).forEach(ev=>{
      if(ev.status==="Draft")return;
      const dk=dateKey(ev.date);
      const w=dk?Math.pow(0.5,Math.abs(monthsBetween(dk,nowDk))/RIVAL_HALF_LIFE_M):UNDATED_W;
      const present=new Set();
      (ev.entries||[]).forEach(e=>{[e.helm,e.crew].forEach(raw=>{const k=remember(raw);if(k){present.add(k);bump(natCount,k,e.nat);}});});
      present.forEach(k=>{
        totals.set(k,(totals.get(k)||0)+1);
        totalsW.set(k,(totalsW.get(k)||0)+w);
        if(dk){const cur=rivalLastDk.get(k);if(cur==null||dk>cur)rivalLastDk.set(k,dk);}
      });
      if(!present.has(focal))return;
      focalTotalW+=w;
      // Rank map built ONCE per focal event — ranks READ from scoreEvent rows
      // (PDF-truth, tie-aware), reused for proximity + head-to-head + partner split.
      const rankOf=new Map();             // canon -> best (lowest) rank in this event
      const mates=new Set();              // canons who shared the focal's boat here (partners, not rivals)
      let fleetN=0,focalRank=null,partnerKey="",partnerName="";
      try{
        const sc=scoreEvent(ev);
        if(sc.races===0)throw null;   // upcoming (nothing sailed): co-appearance only — the
                                      // all-tied placeholder ranks must never read as closeness
        fleetN=sc.rows.length;
        let focalRow=null;
        sc.rows.forEach(r=>{
          const hk=canonName(r.helm),ck=canonName(r.crew);
          if(hk===focal||ck===focal){
            const other=hk===focal?ck:hk;
            if(other&&other!==focal)mates.add(other);
            if(r.rank!=null&&(focalRank==null||r.rank<focalRank)){focalRank=r.rank;focalRow=r;}
          }
          if(r.rank==null)return;
          [hk,ck].forEach(k=>{if(!k)return;const cur=rankOf.get(k);if(cur==null||r.rank<cur)rankOf.set(k,r.rank);});
        });
        if(focalRow){
          const pRaw=canonName(focalRow.helm)===focal?focalRow.crew:focalRow.helm;
          partnerKey=canonName(pRaw)||"";partnerName=pRaw||"";
        }
      }catch{/* unscoreable event: still counts for co-appearance, never for closeness */}
      focalEvData.push({ev,present,rankOf,N:fleetN,focalRank,partnerKey,partnerName,mates});
      present.forEach(k=>{if(k!==focal){shared.set(k,(shared.get(k)||0)+1);sharedW.set(k,(sharedW.get(k)||0)+w);bump(clsCount,k,ev.cls);}});
    });
    const focalEvents=focalEvData.map(d=>d.present);   // back-compat: [Set(canon)] events the focal sailed
    // Decayed Jaccard (0–1): time-weighted shared / time-weighted union. Fallback
    // convention mirrors the old corrOf — use the rival's own weighted total, or
    // the weighted shared count when it's absent.
    const corrOf=(k,shW)=>{const u=focalTotalW+(totalsW.get(k)||shW)-shW;return u>0?shW/u:0;};
    // Rating proximity (0–1): exp(-|ΔR|/SIGMA) from the global rating engine. A
    // missing rating (all-undated career) reads as neutral 0.5, never closeness/distance.
    const ratings=getAthleteRatings(events);
    const focalRating=ratings.get(focal);
    const ratingProxOf=k=>{
      const rr=ratings.get(k);
      if(!focalRating||!rr) return 0.5;
      return Math.exp(-Math.abs(focalRating.r-rr.r)/RATING_PROX_SIGMA);
    };
    // Activity (0–1): 0.5^(months since the rival's last dated event / half-life).
    // No dated event ⇒ neutral 0.5 (don't fabricate retirement or recency).
    const activityOf=k=>{
      const ld=rivalLastDk.get(k);
      if(!ld||!nowDk) return 0.5;
      return Math.pow(0.5,Math.abs(monthsBetween(ld,nowDk))/ACTIVITY_HALF_LIFE_M);
    };
    // Placement proximity (0–1): mean of exp(-GAP_K*gap) over shared events where
    // both have ranks and they weren't in the same boat. Missing/partner events
    // are skipped — missing data must never read as either huge gap or closeness.
    const proxOf=k=>{
      let sum=0,n=0;
      focalEvData.forEach(d=>{
        if(!d.present.has(k)||d.mates.has(k))return;
        const rr=d.rankOf.get(k);
        if(d.focalRank==null||rr==null)return;
        sum+=Math.exp(-GAP_K*Math.abs(d.focalRank-rr)/Math.max(d.N-1,1));n++;
      });
      return{prox:n>0?sum/n:PROX_FLOOR,ranked:n};
    };
    // Combined rivalry = decayed co-appearance × placement proximity × rating
    // closeness × the rival's activity. `shared` stays the RAW integer count.
    const scored=[...shared.entries()].map(([k,sh])=>{
      const{prox,ranked}=proxOf(k);
      const corr=Math.pow(corrOf(k,sharedW.get(k)||0),ALPHA)
                *Math.pow(prox,BETA)
                *Math.pow(ratingProxOf(k),GAMMA)
                *activityOf(k);
      return{key:k,name:disp.get(k)||k,shared:sh,ranked,corr};
    });
    let eligible=scored.filter(s=>s.shared>=MIN_SHARED);
    if(eligible.length<5)eligible=scored;   // young profiles: relax to 1 shared so the web isn't empty
    const rivals=eligible
      .sort((a,b)=>b.corr-a.corr||b.shared-a.shared||a.name.localeCompare(b.name))
      .slice(0,N);                          // rank by rivalry, tie-break raw shared, then name
    return{focal,disp,focalEvents,totals,rivals,clsCount,natCount,focalEvData};
  }
  /* === Forecast layer ==========================================================
     Prediction on top of the engine: projectRating extends one athlete's rating
     a year into the future (damped recent trend inside a widening uncertainty
     cone); simulateFleet Monte-Carlos an entry list into win/podium/top-10
     probabilities and finish ranges. Deterministic (seeded PRNG) so a forecast
     is stable across renders and testable. Pure functions of engine output. */
  const TREND_WINDOW_M=12;   // months of history the trend slope is fitted on
  const TREND_MIN_PTS=3;     // fewer rated events than this in-window ⇒ flat projection
  const TREND_TAU_M=6;       // damping: slope decays exp(-t/TAU) into the future (momentum fades)
  const TREND_SLOPE_CAP=40;  // |slope| cap in pts/month — two hot regattas are not destiny
  const RATE_WINDOW_M=24;    // months used to estimate the athlete's events-per-month rate
  const RW_SIGMA=28;         // random-walk rating drift (pts) per expected future event: unknown
                             // future results widen the cone even for a busy athlete
  const PERF_SIGMA=202;      // per-athlete race-day noise. Chosen so the pairwise Gaussian CDF
                             // matches the Elo logistic over the practical 100–400 gap range and
                             // simulated head-to-heads reproduce the expectation table
                             // (gap 100 ⇒ ~64%, 200 ⇒ ~76%, 400 ⇒ ~91%) at tight RD.
  // Project one athlete's rating `months` ahead of their last rated event.
  // Trend: OLS slope over the trailing TREND_WINDOW_M months, damped so it
  // flattens out (r(t) = r + slope·TAU·(1−e^(−t/TAU))). Cone: RD stepped month
  // by month assuming the athlete keeps racing at their historical rate (idle
  // growth + expected-event shrink), plus RW_SIGMA drift per expected event.
  function projectRating(history,months=12){
    const h=(history||[]).filter(p=>p&&p.dk);
    if(!h.length)return null;
    const last=h[h.length-1];
    const recent=h.filter(p=>Math.abs(monthsBetween(p.dk,last.dk))<=TREND_WINDOW_M);
    let slope=0;
    if(recent.length>=TREND_MIN_PTS){
      const xs=recent.map(p=>-Math.abs(monthsBetween(p.dk,last.dk)));  // months before last (≤0)
      const ys=recent.map(p=>p.r);
      const mx=xs.reduce((a,b)=>a+b,0)/xs.length, my=ys.reduce((a,b)=>a+b,0)/ys.length;
      let num=0,den=0;
      xs.forEach((x,i)=>{num+=(x-mx)*(ys[i]-my);den+=(x-mx)*(x-mx);});
      if(den>0)slope=Math.max(-TREND_SLOPE_CAP,Math.min(TREND_SLOPE_CAP,num/den));
    }
    const rate=h.filter(p=>Math.abs(monthsBetween(p.dk,last.dk))<=RATE_WINDOW_M).length/RATE_WINDOW_M;
    const points=[];
    let rd=last.rd;
    for(let m=1;m<=months;m++){
      rd=Math.min(RD_MAX,Math.sqrt(rd*rd+RD_DECAY_C*RD_DECAY_C));       // one month of idle growth…
      rd=Math.max(RD_MIN,rd*Math.pow(RD_EVENT_SHRINK,rate));            // …offset by expected racing
      const r=last.r+slope*TREND_TAU_M*(1-Math.exp(-m/TREND_TAU_M));
      const cone=Math.sqrt(rd*rd+RW_SIGMA*RW_SIGMA*rate*m);
      points.push({m,r,rd,cone,lo:r-cone,hi:r+cone});
    }
    return{points,slope,rate,base:{r:last.r,rd:last.rd,dk:last.dk}};
  }
  // Rating "as of" a date: the stored RD is as-of the athlete's last rated
  // event, so idle-grow it to dk before predicting. Unknown athlete ⇒ fresh
  // seed, flagged provisional (shown, never hidden — honest about the guess).
  function ratingAsOf(a,dk){
    if(!a)return{r:RATING_START,rd:RD_START,provisional:true};
    let rd=a.rd;
    if(a.lastDk&&dk){
      const idle=Math.abs(monthsBetween(a.lastDk,dk));
      if(idle>0)rd=Math.min(RD_MAX,Math.sqrt(rd*rd+RD_DECAY_C*RD_DECAY_C*idle));
    }
    return{r:a.r,rd,provisional:false};
  }
  // mulberry32 — tiny seeded PRNG so forecasts are deterministic per event.
  function makeRng(seed){let a=seed>>>0;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
  // Monte-Carlo a fleet: each iteration samples every entrant's true skill from
  // N(r, rd) — uncertainty bands feed straight in, so wide-band athletes spread
  // over many finishes — plus N(0, PERF_SIGMA) race-day noise, then ranks the
  // fleet. Tallies win/podium/top-10 rates, mean finish, the 68% finish interval
  // (p16–p84), and the full finish distribution per entrant.
  // entrants: [{key, name, r, rd, ...}] (extra fields pass through to rows).
  function simulateFleet(entrants,{iters=0,seed=20260714}={}){
    const N=(entrants||[]).length;
    if(N<2)return null;
    const n=iters||Math.max(2000,Math.min(10000,Math.floor(2e6/N)));  // adaptive: big fleets sim fewer iters
    const rng=makeRng(seed);
    const gauss=()=>{let u=0,v=0;while(u===0)u=rng();while(v===0)v=rng();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);};
    const counts=entrants.map(()=>new Float64Array(N));   // entrant -> finish-position histogram
    const perf=new Float64Array(N), order=new Array(N);
    for(let it=0;it<n;it++){
      for(let i=0;i<N;i++){const e=entrants[i];perf[i]=e.r+e.rd*gauss()+PERF_SIGMA*gauss();order[i]=i;}
      order.sort((a,b)=>perf[b]-perf[a]);
      for(let pos=0;pos<N;pos++)counts[order[pos]][pos]++;
    }
    const rows=entrants.map((e,i)=>{
      const c=counts[i];
      let pod=0,top10=0,cum=0,mean=0,p16=0,p50=0,p84=0;
      for(let pos=0;pos<N;pos++){
        const f=c[pos];mean+=f*(pos+1);
        if(pos<3)pod+=f;
        if(pos<10)top10+=f;
        cum+=f;
        if(!p16&&cum>=n*0.16)p16=pos+1;
        if(!p50&&cum>=n*0.50)p50=pos+1;
        if(!p84&&cum>=n*0.84)p84=pos+1;
      }
      return{...e,win:c[0]/n,podium:pod/n,top10:top10/n,expFinish:mean/n,p16,p50,p84,dist:Array.from(c,f=>f/n)};
    }).sort((a,b)=>b.win-a.win||a.expFinish-b.expFinish);
    return{iters:n,rows};
  }
  return { computeAthleteRatings, getAthleteRatings, computeRivalCohort, projectRating, ratingAsOf, simulateFleet };
}
