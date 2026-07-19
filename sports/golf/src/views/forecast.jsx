/* Fleet forecast for upcoming competitions — Monte-Carlo "who will win?" over an
   entry list, powered by the @athlink/rating forecast layer (ratingAsOf +
   simulateFleet via the shared ratingEngine instance from charts.jsx, so the
   ratings cache is computed once). Rendered by the event page when an event has
   entries but nothing sailed yet (scoreEvent races===0). Deterministic per event
   (PRNG seeded by the event id) so the page never flickers between renders. */

import React from "react";
import { ArrowLeft, TrendingUp, Calendar } from "lucide-react";
import { formatDate, dateKey } from "../util/date.js";
import { canonName, ordinalOf } from "../util/name.js";
import { iocFlag } from "../util/flag.js";
import { nuggetFor } from "../util/class.js";
import { isUpcomingEvent } from "../data/scoring.js";
import { ratingEngine, InfoHint } from "./charts.jsx";

const FORECAST_HINT="We simulate this competition thousands of times. Each run draws every entrant's true skill from their rating and its uncertainty band, adds round-day luck, and ranks the field — so an athlete with a wide band spreads across many finishes while a proven one clusters tight. Win / Podium / Top 10 are how often each player landed there; 'likely finish' is the middle two-thirds of their simulated results. New or unrated entrants start at 1200 with the widest band. Ratings come from official results and are never altered by the forecast.";

// FNV-1a — stable per-event PRNG seed so a forecast is reproducible.
const hashSeed=s=>{let h=2166136261;for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};

// Entry list -> simulateFleet entrants. A boat's skill is the mean of its rated
// members as of the event date (RD idle-grown to it); doubt is the RMS of member
// RDs — two unknowns stay unknown, they don't average into false confidence.
function entrantsOf(ev,events){
  const ratings=ratingEngine.getAthleteRatings(events);
  const dk=dateKey(ev.date)||"";
  const seen=new Set();
  return (ev.entries||[]).flatMap((e,i)=>{
    const members=[e.helm,e.crew].filter(Boolean);
    if(!members.length)return [];
    const key=members.map(canonName).join("|")+"|"+(e.sail||i);
    if(seen.has(key))return [];             // duplicate entry rows never race twice
    seen.add(key);
    const rr=members.map(m=>ratingEngine.ratingAsOf(ratings.get(canonName(m))||null,dk));
    return [{key,helm:e.helm,crew:e.crew||null,name:members.join(" / "),sail:e.sail||"",nat:e.nat||"",
      r:rr.reduce((a,x)=>a+x.r,0)/rr.length,
      rd:Math.sqrt(rr.reduce((a,x)=>a+x.rd*x.rd,0)/rr.length),
      provisional:rr.every(x=>x.provisional)}];
  });
}

const pct=p=>p>=0.995?"100%":p>=0.10?`${Math.round(p*100)}%`:p>=0.01?`${(p*100).toFixed(1)}%`:p>0?"<1%":"—";

// Tiny finish-distribution histogram (top contenders only): bars over positions,
// clipped past P84+2 so a long tail of near-zeros doesn't flatten the shape.
function DistSpark({dist,p84}){
  const upto=Math.min(dist.length,Math.max(10,p84+2));
  const shown=dist.slice(0,upto);
  const max=Math.max(...shown,1e-9);
  const W=86,H=20,bw=W/upto;
  return(<svg width={W} height={H} style={{display:"block"}} aria-hidden="true">
    {shown.map((v,i)=>{const h=Math.max(v>0?1:0,(v/max)*(H-2));
      return <rect key={i} x={i*bw+0.5} y={H-h} width={Math.max(bw-1,1)} height={h} rx={1}
        fill={i<3?"rgba(13,142,207,.85)":"rgba(13,142,207,.38)"}/>;})}
  </svg>);
}

export function FleetForecast({ev,events,onPick,boatCell}){
  const [showAll,setShowAll]=React.useState(false);
  const sim=React.useMemo(()=>{
    const entrants=entrantsOf(ev,events);
    if(entrants.length<2)return null;
    return ratingEngine.simulateFleet(entrants,{seed:hashSeed(ev.id)});
  },[ev,events]);
  if(!sim)return null;
  const N=sim.rows.length;
  const rows=showAll?sim.rows:sim.rows.slice(0,12);
  const rangeOf=r=>r.p16===r.p84?ordinalOf(r.p16):`${ordinalOf(r.p16)}–${ordinalOf(r.p84)}`;
  const bar=(p,color)=>(<div style={{display:"flex",alignItems:"center",gap:6,minWidth:74}}>
    <div style={{flex:"none",width:34,textAlign:"right",fontVariantNumeric:"tabular-nums",fontWeight:700}}>{pct(p)}</div>
    <div style={{flex:1,height:5,borderRadius:3,background:"rgba(13,142,207,.12)",overflow:"hidden"}}>
      <div style={{width:`${Math.max(p*100,p>0?2:0)}%`,height:"100%",borderRadius:3,background:color}}/>
    </div>
  </div>);
  return(
    <div className="panel" style={{marginBottom:16}}>
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"14px 16px 4px"}}>
        <TrendingUp size={16} color="var(--acc, #0d8ecf)"/>
        <span style={{fontWeight:800,fontSize:14.5}}>Field forecast</span>
        <InfoHint text={FORECAST_HINT}/>
        <span style={{marginLeft:"auto",fontSize:11.5,color:"var(--mut)"}}>{sim.iters.toLocaleString()} simulated rounds · {N} players</span>
      </div>
      <table>
        <thead><tr>
          <th title="Median simulated finish">Pred.</th>
          <th className="l">Athlete</th>
          <th className="l">ID</th>
          <th className="l" title="Skill rating ± uncertainty going into this event">Rating</th>
          <th className="l">Win</th>
          <th className="l">Podium</th>
          <th className="l">Top 10</th>
          <th className="l" title="Middle two-thirds of simulated finishes">Likely finish</th>
          <th className="l" title="Distribution of simulated finishing places">Spread</th>
        </tr></thead>
        <tbody>{rows.map((r,i)=>(
          <tr key={r.key}>
            <td className={`rk ${r.p50<=3?"p"+r.p50:""}`}>{r.p50}</td>
            <td className="l">
              {boatCell?boatCell(r):(<>
                <span className="namelink" onClick={()=>onPick&&onPick(r.helm)}>{r.helm}</span>
                {r.crew&&<span style={{color:"var(--mut)"}}> / <span className="namelink" onClick={()=>onPick&&onPick(r.crew)}>{r.crew}</span></span>}
              </>)}
            </td>
            <td className="l sailcol">{r.nat?<>{iocFlag(r.nat)} {r.nat} {r.sail}</>:r.sail}</td>
            <td className="l" style={{whiteSpace:"nowrap"}}>
              <b style={{fontVariantNumeric:"tabular-nums"}}>{Math.round(r.r)}</b>
              <span style={{color:"var(--mut)",fontSize:11.5}}> ±{Math.round(r.rd)}</span>
              {r.provisional&&<span title="No rated results yet — seeded at 1200 with the widest band" style={{marginLeft:5,fontSize:9.5,fontWeight:800,letterSpacing:".05em",color:"#b8860b",textTransform:"uppercase"}}>new</span>}
            </td>
            <td className="l">{bar(r.win,"#0d8ecf")}</td>
            <td className="l">{bar(r.podium,"rgba(13,142,207,.7)")}</td>
            <td className="l">{bar(r.top10,"rgba(13,142,207,.45)")}</td>
            <td className="l" style={{whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>{rangeOf(r)}</td>
            <td className="l">{i<8?<DistSpark dist={r.dist} p84={r.p84}/>:null}</td>
          </tr>
        ))}</tbody>
      </table>
      {N>12&&(
        <div style={{padding:"8px 16px 12px"}}>
          <button className="btn ghost" style={{fontSize:12,padding:"5px 12px"}} onClick={()=>setShowAll(v=>!v)}>
            {showAll?"Show top 12":`Show all ${N} players`}
          </button>
        </div>)}
      <p style={{color:"var(--mut)",fontSize:11,margin:"0 16px 12px",fontStyle:"italic"}}>
        Forecast from current skill ratings — it updates as new results come in, and settles nothing: that's what the racing is for.
      </p>
    </div>
  );
}

/* Page shell for an upcoming competition: simple header (the results page's
   owner/claim machinery doesn't apply before results exist) + the forecast. */
export function UpcomingEventForecast({ev,events,onBack,onPick}){
  const ng=ev.cls?nuggetFor(ev.cls,ev.subclass):null;
  const nEntries=(ev.entries||[]).length;
  return(
    <div className="wrap sec" style={{paddingTop:18}}>
      <button className="back" onClick={onBack}><ArrowLeft size={16}/>Back</button>
      <div style={{margin:"6px 0 14px"}}>
        <h2 style={{margin:0,fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:24,lineHeight:1.15}}>{ev.name}</h2>
        <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          {ng&&<span style={{background:ng.color,color:"#fff",borderRadius:980,padding:"2px 10px",fontWeight:700,fontSize:11.5,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>}
          {ev.date&&<span style={{color:"var(--mut)",fontSize:13}}>{formatDate(ev.date)}</span>}
          {ev.venue&&<span style={{color:"var(--mut)",fontSize:13}}>{ev.venue}</span>}
          <span style={{background:"rgba(232,146,26,.14)",color:"#b8860b",borderRadius:980,padding:"2px 10px",fontWeight:700,fontSize:11.5}}>Upcoming · {nEntries} entered · no results yet</span>
        </div>
      </div>
      <FleetForecast ev={ev} events={events} onPick={onPick}/>
    </div>
  );
}

/* Profile strip: the upcoming competitions this athlete is entered in, each with
   their own forecast line. Same deterministic sim as FleetForecast (seeded by
   event id), memoised — so profiles stay cheap and never flicker. */
export function UpcomingStrip({name,events,onOpen}){
  const key=canonName(name);
  const rows=React.useMemo(()=>{
    const ups=(events||[]).filter(ev=>ev.status!=="Draft"&&isUpcomingEvent(ev)&&
      (ev.entries||[]).some(e=>canonName(e.helm)===key||(e.crew&&canonName(e.crew)===key)));
    return ups.map(ev=>{
      let me=null;
      try{
        const entrants=entrantsOf(ev,events);
        if(entrants.length>=2){
          const sim=ratingEngine.simulateFleet(entrants,{seed:hashSeed(ev.id)});
          me=sim.rows.find(r=>canonName(r.helm)===key||(r.crew&&canonName(r.crew)===key))||null;
        }
      }catch{/* forecast is decoration — the chip still shows without it */}
      return{ev,me};
    }).sort((a,b)=>dateKey(a.ev.date).localeCompare(dateKey(b.ev.date)));
  },[events,key]);
  if(!rows.length)return null;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:8,margin:"0 0 16px"}}>
      {rows.map(({ev,me})=>(
        <div key={ev.id} onClick={()=>onOpen&&onOpen(ev.id)} title="Open the entry list & fleet forecast"
          style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",cursor:"pointer",
            background:"rgba(232,146,26,.09)",borderRadius:14,padding:"9px 14px",
            boxShadow:"inset 0 0 0 1px rgba(232,146,26,.28)"}}>
          <Calendar size={14} color="#b8860b" style={{flex:"none"}}/>
          <span style={{fontSize:10.5,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",color:"#b8860b",flex:"none"}}>Upcoming</span>
          <span style={{fontSize:13,fontWeight:700,color:"var(--ink)",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.name}</span>
          {ev.date&&<span style={{fontSize:12,color:"var(--mut)",flex:"none"}}>{formatDate(ev.date)}</span>}
          {me&&(
            <span style={{marginLeft:"auto",fontSize:12,color:"var(--mut)",flex:"none",fontVariantNumeric:"tabular-nums"}}>
              forecast: <b style={{color:"var(--ink)"}}>{pct(me.podium)}</b> podium · likely {me.p16===me.p84?ordinalOf(me.p16):`${ordinalOf(me.p16)}–${ordinalOf(me.p84)}`} of {ev.entries.length}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
