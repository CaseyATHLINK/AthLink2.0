/* Scout portal — a scout's private workspace over the public results data:
   watchlist binders, saved clips, scouting notes + rubric, results-only
   discovery (on fire / streaks / beat-the-forecast / on the radar) and a weekly
   digest inbox. Plus one shared control the rest of the app embeds: SaveButton
   (bookmark a result/event/athlete). Pinned results render inline in App.jsx's
   results lists (pin icon per row + "Pinned" section) via data/scout.js.

   Data layer: data/scout.js (Supabase CRUD, all failure-tolerant) + the pure
   analytics in data/scoutMetrics.js. Ratings come from the shared engine in
   charts.jsx (getAthleteRatings) — computed once here and threaded down. Light
   theme, App.jsx CSS classes + inline styles; all local classes namespaced
   `sc-` and injected via one <style> block so nothing collides with App.jsx. */

import React from "react";
import ReactDOM from "react-dom";
import { Telescope, Bookmark, BookmarkCheck, Plus, X, Trash2, Pencil, Check,
  Flame, ListChecks, CalendarClock, Sparkles, Radar, TrendingUp, TrendingDown,
  ChevronDown, ChevronRight, Search, ExternalLink, FolderPlus,
  FileText, Printer, Columns3, Share, CalendarPlus,
  LoaderCircle as Loader2 } from "lucide-react";
import { canonName } from "../util/name.js";
import { dateKey, formatDate } from "../util/date.js";
import { isUpcomingEvent } from "../data/scoring.js";
import { usernameForName } from "../data/athletes.js";
import { iocFlag } from "../util/flag.js";
import { nuggetFor } from "../util/class.js";
import { aiComplete } from "@athlink/core";
import { ratingEngine, InfoHint } from "./charts.jsx";
import { ConfirmModal } from "./atoms.jsx";
import {
  scoutOwnerId, fetchBinders, createBinder, ensureDefaultBinder, renameBinder, deleteBinder,
  fetchClips, addClip, removeClip, moveClip,
  fetchBindersShared, fetchClipsShared, binderNS, binderLabel, DEFAULT_BINDER_NAME,
  logActivity, fetchDigestPrefs, upsertDigestPref,
} from "../data/scout.js";
import {
  athleteIndex, metricsForAthlete, universalMetrics, validDk, onFire, streaks, radar, beatForecast, digestFor,
} from "../data/scoutMetrics.js";

/* ── tiny formatting helpers ─────────────────────────────────────────────── */
const fmtR      = r  => (r==null?"—":Math.round(r));
const fmtDelta  = d  => (d==null?"—":`${d>=0?"+":"−"}${Math.abs(Math.round(d))}`);
const fmtPct    = p  => (p==null?"—":`${Math.round(p*100)}%`);
const fmtSigned = p  => (p==null?"—":`${p>=0?"+":"−"}${Math.abs(Math.round(p*100))}%`);
const pctLabel  = p  => (p==null?"—":`${Math.round(p*100)}th`);
// Streak kind → human phrase, e.g. streak({kind:"top3",len:5}) → "5 top-3s running".
function streakPhrase(kind,len){
  const noun = kind==="podium"?"podium":kind==="top3"?"top-3":"top-10%";
  const plural = kind==="top10pct"?`${noun} finishes`:`${noun}${len===1?"":"s"}`;
  return `${len} ${plural} running`;
}
// Derive an athlete's display casing + latest nat/class from their index spine.
function athleteFace(spine){
  if(!spine||!spine.length) return {disp:"",nat:null,classes:[]};
  const helm=spine.find(s=>s.role==="helm");
  const last=spine[spine.length-1];
  const disp = helm?.entry.helm || last.entry.helm || last.entry.crew || "";
  // most-recent nat the athlete carried under the role they were credited by
  let nat=null;
  for(let i=spine.length-1;i>=0;i--){ const n=spine[i].entry.nat; if(n){nat=n;break;} }
  const classes=[]; const seen=new Set();
  spine.forEach(s=>{const c=s.ev.cls; if(c&&!seen.has(c)){seen.add(c);classes.push(c);}});
  return {disp,nat,classes};
}
// ordinal-ish medal label for a pinned result, e.g. "2nd of 38".
function rankOfFleet(rank,fleet){
  if(rank==null) return "—";
  const s=["th","st","nd","rd"],v=rank%100,ord=rank+(s[(v-20)%10]||s[v]||s[0]);
  return fleet?`${ord} of ${fleet}`:ord;
}
const medalColor = rank => rank===1?"var(--gold)":rank===2?"#7d8a98":rank===3?"#a86a32":"var(--navy)";

// Tiny SVG sparkline of a rating history's .r series (last ~15 points).
// `baseline` adds Stocks-style dashes at the window's starting rating, and
// `fill` shades under the line with a soft gradient like the Stocks previews.
let _sparkGrad=0;
function Sparkline({history,w=88,h=22,baseline=false,fill=false}){
  const gid=React.useRef("scspark"+(++_sparkGrad)).current;
  const pts=(history||[]).filter(p=>p&&typeof p.r==="number").slice(-15);
  if(pts.length<2) return <svg width={w} height={h} aria-hidden="true"/>;
  const rs=pts.map(p=>p.r), lo=Math.min(...rs), hi=Math.max(...rs), span=Math.max(1,hi-lo);
  const stepX=w/(pts.length-1);
  const coords=pts.map((p,i)=>[i*stepX,h-2-((p.r-lo)/span)*(h-4)]);
  const d=coords.map(c=>`${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const up=rs[rs.length-1]>=rs[0];
  const col=up?"#2e9e5b":"#c0392b";
  const last=coords[coords.length-1];
  const baseY=coords[0][1];
  return(
    <svg width={w} height={h} style={{display:"block"}} aria-hidden="true">
      {fill&&(
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={col} stopOpacity=".28"/>
              <stop offset="100%" stopColor={col} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polygon points={`0,${h} ${d} ${w},${h}`} fill={`url(#${gid})`}/>
        </>
      )}
      {baseline&&<line x1="0" y1={baseY} x2={w} y2={baseY} stroke={col} strokeOpacity=".55" strokeWidth="1" strokeDasharray="2.5 2.5"/>}
      <polyline points={d} fill="none" stroke={col} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
      <circle cx={last[0]} cy={last[1]} r="1.9" fill={col}/>
    </svg>
  );
}

// Signed rating-delta chip (green up / red down / grey flat).
function DeltaChip({d,size=12}){
  if(d==null||Math.abs(d)<0.5) return <span style={{fontSize:size,color:"var(--mut)",fontVariantNumeric:"tabular-nums"}}>±0</span>;
  const up=d>0, col=up?"#2e9e5b":"#c0392b";
  const Ic=up?TrendingUp:TrendingDown;
  return(
    <span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:size,fontWeight:800,color:col,fontVariantNumeric:"tabular-nums"}}>
      <Ic size={size+1}/>{fmtDelta(d)}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Stocks-style watchlist pieces — Apple Stocks structure in AthLink's light
   liquid-glass skin: ticker rows (name / baseline sparkline / rating + delta
   chip) on the left, a detail pane (big rating, range tabs, gradient area
   chart with hover scrub, stats grid, recent results as "news") on the right.
   ════════════════════════════════════════════════════════════════════════ */

// Chart ranges are anchored on the DATASET's latest result (dk), consistent
// with the rest of the portal's "last N days of the dataset" convention.
const CHART_RANGES=[["1m","1M",1],["3m","3M",3],["6m","6M",6],["ytd","YTD",0],["1y","1Y",12],["2y","2Y",24],["all","ALL",Infinity]];
function dkMonthsBack(latestDk,months){
  const y=+latestDk.slice(0,4),mo=+latestDk.slice(4,6)-1,d=+latestDk.slice(6,8);
  const t=new Date(Date.UTC(y,mo,d)); t.setUTCMonth(t.getUTCMonth()-months);
  return `${t.getUTCFullYear()}${String(t.getUTCMonth()+1).padStart(2,"0")}${String(t.getUTCDate()).padStart(2,"0")}`;
}
function filterHistory(history,rangeKey){
  const h=(history||[]).filter(p=>p&&typeof p.r==="number"&&p.dk);
  if(h.length<2) return h;
  const latest=String(h[h.length-1].dk);
  const def=CHART_RANGES.find(x=>x[0]===rangeKey);
  let cut="";
  if(def&&def[2]!==Infinity) cut=rangeKey==="ytd"?latest.slice(0,4)+"0101":dkMonthsBack(latest,def[2]);
  const out=h.filter(p=>!cut||String(p.dk)>=cut);
  return out.length>=2?out:h.slice(-2);   // Stocks always draws something
}
const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmtDk=(dk,long)=>long?`${MONTHS[+String(dk).slice(4,6)-1]} ${String(dk).slice(2,4)}`:`${+String(dk).slice(6,8)} ${MONTHS[+String(dk).slice(4,6)-1]}`;

// Rounded solid delta chip, Stocks-style (green up / red down / grey flat).
function RatingChip({d,size="sm"}){
  const flat=d==null||Math.abs(d)<0.5;
  const bg=flat?"#9aa3ad":d>0?"#2e9e5b":"#c0392b";
  const label=d==null?"—":flat?"±0":`${d>0?"+":"−"}${Math.abs(Math.round(d))}`;
  return <span className={"sk-chip"+(size==="lg"?" lg":"")} style={{background:bg}}>{label}</span>;
}

/* The big detail chart: gradient area, dashed range-start reference line,
   horizontal gridlines with right-side labels, x date labels, and a hover
   scrub (crosshair + dot + floating "rating · event · date" readout). Width
   tracks the container via ResizeObserver so text stays crisp. */
let _skGrad=0;
function StocksChart({points,h=300}){
  const gid=React.useRef("skchart"+(++_skGrad)).current;
  const wrapRef=React.useRef(null);
  const [w,setW]=React.useState(680);
  const [hov,setHov]=React.useState(null);
  React.useEffect(()=>{
    const el=wrapRef.current; if(!el||typeof ResizeObserver==="undefined") return;
    const ro=new ResizeObserver(es=>{const cw=es[0]?.contentRect?.width;if(cw>60)setW(cw);});
    ro.observe(el); return()=>ro.disconnect();
  },[]);
  const pts=points||[];
  if(pts.length<2) return(
    <div ref={wrapRef} style={{height:h,display:"grid",placeItems:"center",color:"var(--mut)",fontSize:13}}>
      Not enough rated results in this range.
    </div>
  );
  const padL=6,padR=52,padT=12,padB=26;
  const iw=Math.max(60,w-padL-padR), ih=h-padT-padB;
  const rs=pts.map(p=>p.r);
  const base=pts[0].r;
  let lo=Math.min(...rs),hi=Math.max(...rs);
  const span0=Math.max(1,hi-lo); lo-=span0*0.1; hi+=span0*0.1;
  const span=hi-lo;
  const dayN=dk=>{const s=String(dk);return Date.UTC(+s.slice(0,4),+s.slice(4,6)-1,+s.slice(6,8))/86400000;};
  const x0=dayN(pts[0].dk), x1=Math.max(x0+1,dayN(pts[pts.length-1].dk));
  const X=p=>padL+((dayN(p.dk)-x0)/(x1-x0))*iw;
  const Y=r=>padT+ih-((r-lo)/span)*ih;
  const up=rs[rs.length-1]>=base;
  const col=up?"#2e9e5b":"#c0392b";
  const line=pts.map(p=>`${X(p).toFixed(1)},${Y(p.r).toFixed(1)}`).join(" ");
  const area=`${X(pts[0]).toFixed(1)},${(padT+ih).toFixed(1)} ${line} ${X(pts[pts.length-1]).toFixed(1)},${(padT+ih).toFixed(1)}`;
  const yTicks=[0.12,0.4,0.68,0.96].map(f=>lo+span*f);
  const long=(x1-x0)>200;
  const nLab=Math.min(5,pts.length);
  const labIdx=[...new Set(Array.from({length:nLab},(_,i)=>Math.round(i*(pts.length-1)/Math.max(1,nLab-1))))];
  const onMove=e=>{
    const r=e.currentTarget.getBoundingClientRect();
    const mx=e.clientX-r.left;
    let best=0,bd=1e9;
    pts.forEach((p,i)=>{const d=Math.abs(X(p)-mx);if(d<bd){bd=d;best=i;}});
    setHov(best);
  };
  const hp=hov!=null?pts[hov]:null;
  return(
    <div ref={wrapRef} style={{position:"relative"}}>
      <svg width={w} height={h} style={{display:"block"}} onMouseMove={onMove} onMouseLeave={()=>setHov(null)}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={col} stopOpacity=".30"/>
            <stop offset="100%" stopColor={col} stopOpacity="0"/>
          </linearGradient>
        </defs>
        {yTicks.map((t,i)=>(
          <g key={i}>
            <line x1={padL} y1={Y(t)} x2={padL+iw} y2={Y(t)} stroke="var(--line)" strokeWidth="1"/>
            <text x={padL+iw+8} y={Y(t)+4} fontSize="11" fill="var(--mut)" fontFamily="'Barlow',sans-serif" style={{fontVariantNumeric:"tabular-nums"}}>{Math.round(t)}</text>
          </g>
        ))}
        <line x1={padL} y1={Y(base)} x2={padL+iw} y2={Y(base)} stroke={col} strokeOpacity=".5" strokeWidth="1" strokeDasharray="3 3.5"/>
        <polygon points={area} fill={`url(#${gid})`}/>
        <polyline points={line} fill="none" stroke={col} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
        {labIdx.map(i=>(
          <text key={i} x={Math.min(padL+iw-14,Math.max(padL+6,X(pts[i])))} y={h-8} fontSize="11" fill="var(--mut)" textAnchor="middle" fontFamily="'Barlow',sans-serif">{fmtDk(pts[i].dk,long)}</text>
        ))}
        {hp&&(
          <g>
            <line x1={X(hp)} y1={padT} x2={X(hp)} y2={padT+ih} stroke="var(--mut)" strokeOpacity=".55" strokeWidth="1"/>
            <circle cx={X(hp)} cy={Y(hp.r)} r="4" fill={col} stroke="#fff" strokeWidth="1.5"/>
          </g>
        )}
      </svg>
      {hp&&(
        <div className="sk-scrub" style={{left:Math.min(Math.max(X(hp)-90,0),Math.max(0,w-190))}}>
          <b style={{fontVariantNumeric:"tabular-nums"}}>{Math.round(hp.r)}</b>
          <span>{hp.evName||"Rated event"}</span>
          <span style={{color:"var(--mut)"}}>{rankOfFleet(hp.rank,hp.fleet)} · {fmtDk(hp.dk)}</span>
        </div>
      )}
    </div>
  );
}

// One .ics download so "Add to Calendar" works everywhere without integration.
function downloadIcs(evName,dk){
  const d=String(dk).slice(0,8);
  const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//AthLink//Scout//EN","BEGIN:VEVENT",
    `UID:${d}-${Math.random().toString(36).slice(2)}@athlink.win`,`DTSTAMP:${d}T000000Z`,
    `DTSTART;VALUE=DATE:${d}`,`SUMMARY:${String(evName||"Regatta").replace(/[\n,;]/g," ")}`,
    "END:VEVENT","END:VCALENDAR"].join("\r\n");
  const url=URL.createObjectURL(new Blob([ics],{type:"text/calendar"}));
  const a=document.createElement("a");
  a.href=url; a.download=String(evName||"event").replace(/[^\w]+/g,"-").slice(0,60)+".ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),4000);
}

/* One watchlist row — Stocks list anatomy: bold name + muted class/nat line,
   baseline sparkline centre, rating over a solid delta chip right. */
function WatchRow({clip,events,ratings,selected,onSelect,onRemove,compareMode,cmpSelected,cmpDisabled,onToggleCmp}){
  const name=clip.athlete_key||clip.title||"";
  const savedDisp=clip.snapshot?.athlete||clip.title||"";
  const spine=React.useMemo(()=>athleteIndex(events).get(canonName(name))||[],[events,name]);
  const face=React.useMemo(()=>athleteFace(spine),[spine]);
  const m=React.useMemo(()=>metricsForAthlete(name,events,ratings),[name,events,ratings]);
  const rec=ratings&&ratings.get?ratings.get(canonName(name)):null;
  const disp=face.disp||savedDisp||name;
  const sub=[face.classes.slice(0,2).map(c=>nuggetFor(c,null).label).join(" · "),face.nat].filter(Boolean).join(" · ");
  const cmpKey=clip.athlete_key||clip.title||"";
  const click=()=>{ if(compareMode){ if(!cmpDisabled||cmpSelected) onToggleCmp(cmpKey); } else onSelect(name); };
  return(
    <div className={"sk-row"+(selected&&!compareMode?" on":"")+(compareMode&&cmpSelected?" cmp":"")} onClick={click}
      draggable={!compareMode}
      onDragStart={e=>{ e.dataTransfer.setData("text/athlink-athlete",String(clip.id)); e.dataTransfer.effectAllowed="move"; }}
      title={compareMode?undefined:"Drag onto a sidebar folder to file"}>
      {compareMode&&(
        <span className="sk-cbx" style={{background:cmpSelected?"var(--accent)":"#fff",borderColor:cmpSelected?"var(--accent)":"var(--line)",opacity:(cmpDisabled&&!cmpSelected)?.4:1}}>
          {cmpSelected&&<Check size={11} color="#fff"/>}
        </span>
      )}
      <div className="sk-row-id">
        <div className="sk-row-name">{disp}{face.nat&&<span style={{marginLeft:6,fontWeight:400}}>{iocFlag(face.nat)}</span>}</div>
        <div className="sk-row-sub">{sub||"—"}</div>
      </div>
      <div className="sk-row-spark"><Sparkline history={rec?.history} w={74} h={28} baseline fill/></div>
      <div className="sk-row-px">
        <div className="sk-row-price">{fmtR(m?.ratingNow)}</div>
        <RatingChip d={m?.delta30}/>
      </div>
      {!compareMode&&(
        <button type="button" className="sk-row-x" title="Remove from watchlist"
          onClick={e=>{e.stopPropagation();onRemove(clip);}}><X size={12}/></button>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   SaveButton — Instagram-style bookmark control embedded across the app
   (result rows, event headers, athlete profiles, discovery rows).

   Tap = INSTANT save into the namespace's default folder: the icon fills
   optimistically, then a transient liquid-glass popover confirms "Saved to
   <folder> · Change folder" (folder list + inline "+ New folder"). If the DB
   rejects the write (RLS 0015: scout writes need a signed-in session) the fill
   ROLLS BACK and a visible error shows — no more fake saves. Tap again =
   unsave. Press-and-hold opens the folder picker directly. Signed out →
   onRequireAuth() (sign-in prompt) instead of pretending to save.

   Athlete saves file into the 'athletes' folder namespace, result/event/
   upcoming saves into 'results' — the two namespaces never mix.

   Hydration goes through the shared per-owner caches in data/scout.js, so a
   100-row event table costs two fetches, not two hundred, and fill states are
   truthful on mount. Styles inject once into <head> (buttons render far from
   ScoutPortal's <style> block). ═══════════════════════════════════════════ */
let _saveCssIn=false;
function ensureSaveCss(){
  if(_saveCssIn||typeof document==="undefined") return;
  const el=document.createElement("style");
  el.textContent=SAVE_CSS;
  document.head.appendChild(el);
  _saveCssIn=true;
}

export function SaveButton({owner,events,kind="result",athleteKey,eventId,entryId,title,snapshot,size,onSaved,onRequireAuth}){
  const sm = size==="sm";
  const ns = kind==="athlete"?"athletes":"results";
  const targetKey = athleteKey?canonName(athleteKey):null;
  const displayName = title||athleteKey||"";

  const [binders,setBinders]=React.useState([]);
  const [clips,setClips]=React.useState([]);         // this target's clips
  const [busy,setBusy]=React.useState(false);
  const [pop,setPop]=React.useState(null);           // null | "toast" | "picker"
  const [err,setErr]=React.useState(null);
  const [newName,setNewName]=React.useState("");
  const wrapRef=React.useRef(null);
  const timerRef=React.useRef(null);                 // toast/error auto-dismiss
  const pressRef=React.useRef({t:null,fired:false}); // long-press bookkeeping

  const nsBinders=binders.filter(b=>binderNS(b)===ns);
  const saved=clips.length>0;
  const curBinder=saved?nsBinders.find(b=>String(b.id)===String(clips[0].binder_id))||null:null;

  // Does an existing clip row belong to this button's target?
  const isMine=React.useCallback(c=>{
    if(kind==="athlete") return c.kind==="athlete"&&canonName(c.athlete_key||"")===targetKey;
    if(c.kind==="athlete"||eventId==null) return false;
    if(String(c.event_id)!==String(eventId)) return false;
    // an event-header save (entryId null) must not light up because one of the
    // event's RESULT rows is saved, and vice versa.
    return entryId==null ? c.entry_id==null : String(c.entry_id)===String(entryId);
  },[kind,targetKey,eventId,entryId]);

  // Hydrate from the shared caches; re-runs whenever the owner (auth) changes
  // so per-button state can never go stale across sign-in/out.
  const hydrate=React.useCallback(async()=>{
    if(!owner){ setBinders([]); setClips([]); return []; }
    const [bs,cs]=await Promise.all([fetchBindersShared(owner),fetchClipsShared(owner)]);
    setBinders(bs); setClips(cs.filter(isMine));
    return bs;
  },[owner,isMine]);
  React.useEffect(()=>{ ensureSaveCss(); setPop(null); setErr(null); hydrate(); },[hydrate]);

  // Popover lifetime: outside click / Escape close; toast+error auto-expire.
  React.useEffect(()=>{
    if(!pop&&!err) return;
    const down=e=>{ if(wrapRef.current&&!wrapRef.current.contains(e.target)){ setPop(null); setErr(null); } };
    const key=e=>{ if(e.key==="Escape"){ setPop(null); setErr(null); } };
    document.addEventListener("mousedown",down);
    document.addEventListener("keydown",key);
    return()=>{ document.removeEventListener("mousedown",down); document.removeEventListener("keydown",key); };
  },[pop,err]);
  React.useEffect(()=>()=>{ clearTimeout(timerRef.current); clearTimeout(pressRef.current.t); },[]);
  const arm=(fn,ms)=>{ clearTimeout(timerRef.current); timerRef.current=setTimeout(fn,ms); };
  // The folder picker IS the save confirmation: it opens the same instant the
  // button is tapped (no round-trip lag), its header flips "Saving…" → "Saved
  // to <folder>", and it self-dismisses unless the pointer is over it.
  const openPicker=(ms=5000)=>{ setErr(null); setPop("picker"); arm(()=>setPop(p=>p==="picker"?null:p),ms); };
  const flashErr=msg=>{ setPop(null); setErr(msg); arm(()=>setErr(null),3500); };

  async function doSave(){
    // Optimistic fill first (Instagram principle), reconciled honestly below.
    const optimistic={id:"tmp_"+Date.now(),kind,athlete_key:targetKey,event_id:eventId??null,entry_id:entryId??null,binder_id:null};
    setClips([optimistic]);
    try{
      const [def,cs]=await Promise.all([ensureDefaultBinder(owner,ns),fetchClipsShared(owner)]);
      const existing=cs.filter(isMine);
      if(existing.length){ setClips(existing); return; }  // saved earlier (stale button) — adopt, never duplicate
      if(!def){ setClips([]); flashErr("Couldn't save — try again"); return; }
      const real=await addClip(owner,def.id,{kind,athlete_key:targetKey,event_id:eventId,entry_id:entryId,
        title:displayName||null,
        snapshot:{...(snapshot||{}),...(displayName?{title:displayName}:{}),...(kind==="athlete"&&displayName?{athlete:displayName}:{})}});
      if(real){
        setClips([real]);
        fetchBindersShared(owner).then(bs=>setBinders(bs));   // picker needs fresh folders
        if(kind==="athlete") logActivity(owner,targetKey,"added_watchlist");
        else if(kind==="result") logActivity(owner,targetKey,"saved_result");
        onSaved&&onSaved();
      }else{
        setClips([]); flashErr("Couldn't save — try again");
      }
    }catch{ setClips([]); flashErr("Couldn't save — try again"); }
  }

  async function doUnsave(){
    const gone=clips;
    setClips([]); setPop(null);
    try{
      const real=gone.filter(c=>!String(c.id).startsWith("tmp_"));
      const rs=await Promise.all(real.map(c=>removeClip(c.id)));
      // sbDel returns the deleted rows; [] = RLS zero-row no-op = silent failure.
      if(real.length&&!rs.every(r=>Array.isArray(r)&&r.length>0)){
        setClips(gone); flashErr("Couldn't remove — try again");
      }else onSaved&&onSaved();
    }catch{ setClips(gone); flashErr("Couldn't remove — try again"); }
  }

  async function onTap(e){
    e.stopPropagation();
    if(pressRef.current.fired){ pressRef.current.fired=false; return; }  // long-press consumed this tap
    if(busy) return;
    if(!owner){ onRequireAuth&&onRequireAuth(); return; }
    setBusy(true);
    try{
      if(saved) await doUnsave();
      else { openPicker(); await doSave(); }   // picker up BEFORE the network round-trip
    }
    finally{ setBusy(false); }
  }

  // Press-and-hold (450ms) = open the folder picker directly (saving first if
  // needed, like Instagram's long-press).
  function pressStart(){
    if(!owner) return;
    pressRef.current.fired=false;
    clearTimeout(pressRef.current.t);
    pressRef.current.t=setTimeout(async()=>{
      pressRef.current.fired=true;
      if(busy) return;
      setBusy(true);
      try{ openPicker(8000); if(!saved) await doSave(); }
      finally{ setBusy(false); }
    },450);
  }
  const pressEnd=()=>clearTimeout(pressRef.current.t);

  async function fileTo(binderId){
    if(busy) return;
    const cur=clips[0];
    if(!cur||String(cur.id).startsWith("tmp_")) return;         // still settling
    if(String(cur.binder_id)===String(binderId)){ setPop(null); return; }
    setBusy(true);
    try{
      const r=await moveClip(cur.id,binderId);
      if(Array.isArray(r)&&r.length){
        setClips([{...cur,binder_id:binderId}]);
        arm(()=>setPop(null),1100);            // brief "Saved to <new folder>" confirm, then close
        onSaved&&onSaved();
      }
      else flashErr("Couldn't move — try again");
    }catch{ flashErr("Couldn't move — try again"); }
    setBusy(false);
  }
  async function fileToNew(){
    const nm=newName.trim();
    if(!nm||busy) return;
    setBusy(true);
    try{
      const b=await createBinder(owner,nm,ns);
      if(b){ setBinders(bs=>[...bs,b]); setNewName(""); setBusy(false); await fileTo(b.id); return; }
      flashErr("Couldn't create folder");
    }catch{ flashErr("Couldn't create folder"); }
    setBusy(false);
  }

  const popEl=(err||pop)?(
    <div className={"sc-pop"+(err?" sc-pop-err":"")} onClick={e=>e.stopPropagation()}
      onPointerEnter={()=>clearTimeout(timerRef.current)}
      onPointerLeave={()=>{ if(pop==="picker") arm(()=>setPop(p=>p==="picker"?null:p),2500); }}>
      {err
        ? <div className="sc-pop-row" style={{color:"#c0392b",fontWeight:700}}>{err}</div>
        : <>
            <div className="sc-pop-head sc-pop-status">
              {saved
                ? <><BookmarkCheck size={13} color="var(--accent)" style={{flex:"none"}}/>{curBinder?`Saved to ${binderLabel(curBinder)}`:"Saving…"}</>
                : "Save to folder"}
            </div>
            <div className="sc-pop-list">
              {nsBinders.map(b=>{
                const on=curBinder&&String(b.id)===String(curBinder.id);
                return(
                  <button key={b.id} type="button" className={"sc-pop-item"+(on?" on":"")} disabled={busy} onClick={()=>fileTo(b.id)}>
                    {on?<BookmarkCheck size={14} style={{flex:"none"}}/>:<Bookmark size={14} style={{flex:"none"}}/>}
                    <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"left"}}>{binderLabel(b)}</span>
                    {on&&<Check size={13} style={{flex:"none"}}/>}
                  </button>
                );
              })}
              {nsBinders.length===0&&<div style={{fontSize:12,color:"var(--mut)",padding:"4px 8px 6px"}}>No folders yet — name one below.</div>}
            </div>
            <div className="sc-pop-new">
              <input value={newName} onChange={e=>setNewName(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter") fileToNew(); }} placeholder="New folder…"/>
              <button type="button" onClick={fileToNew} disabled={!newName.trim()||busy} title="Create folder"><Plus size={15}/></button>
            </div>
            {saved&&!String(clips[0].id).startsWith("tmp_")&&(
              <button type="button" className="sc-pop-removebtn" disabled={busy}
                onClick={async()=>{ setBusy(true); try{ await doUnsave(); } finally{ setBusy(false); } }}>
                <Trash2 size={13}/>Remove from saved
              </button>
            )}
          </>}
    </div>
  ):null;

  const holdTitle=saved?"Saved — tap to remove, hold to change folder":"Save — hold to pick a folder";

  if(kind==="athlete"){
    const label = saved?"Watching":"Watch";
    const Ic = saved?BookmarkCheck:Bookmark;
    return(
      <span ref={wrapRef} className="sc-savewrap sc-savewrap-l" onClick={e=>e.stopPropagation()}>
        <button type="button" onClick={onTap} disabled={busy}
          onPointerDown={pressStart} onPointerUp={pressEnd} onPointerLeave={pressEnd}
          onContextMenu={e=>{ if(pressRef.current.fired) e.preventDefault(); }}
          title={saved?"Watching — tap to remove, hold to change folder":"Add to watchlist"}
          style={{display:"inline-flex",alignItems:"center",gap:sm?0:6,padding:sm?"5px 6px":"5px 12px",
            borderRadius:980,cursor:busy?"default":"pointer",border:0,fontWeight:700,fontSize:12.5,
            fontFamily:"'Barlow',sans-serif",transition:".15s",whiteSpace:"nowrap",
            background:saved?"rgba(10,132,255,.16)":"var(--grouped)",
            color:saved?"var(--accent)":"var(--mut)",
            boxShadow:saved?"inset 0 0 0 .5px rgba(10,132,255,.4)":"inset 0 0 0 .5px var(--line)"}}>
          <Ic size={14}/>{!sm&&label}
        </button>
        {popEl}
      </span>
    );
  }

  const Ic = saved?BookmarkCheck:Bookmark;
  return(
    <span ref={wrapRef} className="sc-savewrap" onClick={e=>e.stopPropagation()}>
      <button type="button" onClick={onTap} disabled={busy} title={holdTitle}
        onPointerDown={pressStart} onPointerUp={pressEnd} onPointerLeave={pressEnd}
        onContextMenu={e=>{ if(pressRef.current.fired) e.preventDefault(); }}
        style={{display:"grid",placeItems:"center",width:sm?26:30,height:sm?26:30,borderRadius:8,
          border:0,cursor:"pointer",transition:".15s",
          background:saved?"rgba(10,132,255,.14)":"transparent",
          color:saved?"var(--accent)":"var(--mut)"}}
        onMouseEnter={e=>{ if(!saved) e.currentTarget.style.background="var(--grouped)"; }}
        onMouseLeave={e=>{ if(!saved) e.currentTarget.style.background="transparent"; }}>
        <Ic size={16}/>
      </button>
      {popEl}
    </span>
  );
}

/* Popover styles injected once into <head> — SaveButton renders all over
   App.jsx, far from ScoutPortal's scoped <style> block. */
const SAVE_CSS=`
.sc-savewrap{position:relative;display:inline-flex;}
.sc-savewrap .sc-pop{position:absolute;top:calc(100% + 7px);right:0;z-index:120;min-width:230px;max-width:min(272px,calc(100vw - 24px));padding:8px;
  background:linear-gradient(160deg,rgba(255,255,255,.86),rgba(255,255,255,.68));
  backdrop-filter:blur(36px) saturate(210%);-webkit-backdrop-filter:blur(36px) saturate(210%);
  border-radius:15px;
  box-shadow:inset 0 1.5px 0 rgba(255,255,255,.9),inset 0 0 0 1px rgba(255,255,255,.5),0 4px 10px -4px rgba(10,60,120,.12),0 18px 44px -14px rgba(10,40,90,.35);
  animation:sc-popin .18s cubic-bezier(.2,.9,.3,1.2) both;}
.sc-pop-status{display:flex;align-items:center;gap:6px;color:var(--navy);font-size:11px;}
.sc-savewrap-l .sc-pop{right:auto;left:0;}
@keyframes sc-popin{from{opacity:0;transform:translateY(-4px) scale(.98);}to{opacity:1;transform:none;}}
.sc-pop-err{min-width:0;white-space:nowrap;background:rgba(255,243,242,.92);}
.sc-pop-row{display:flex;align-items:center;gap:8px;padding:5px 7px;font-size:12.5px;color:var(--ink);}
.sc-pop-link{border:0;background:none;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;padding:2px 4px;white-space:nowrap;font-family:'Barlow',sans-serif;}
.sc-pop-head{font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--mut);padding:5px 8px 4px;}
.sc-pop-list{max-height:200px;overflow:auto;}
.sc-pop-item{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;border-radius:8px;padding:7px 8px;cursor:pointer;font-size:13px;color:var(--ink);transition:.12s;font-family:inherit;}
.sc-pop-item:hover{background:rgba(10,132,255,.08);}
.sc-pop-item.on{color:var(--accent);font-weight:700;}
.sc-pop-new{display:flex;gap:6px;padding:6px 4px 2px;border-top:1px solid var(--line);margin-top:4px;}
.sc-pop-new input{flex:1;min-width:0;border:1px solid var(--line);border-radius:7px;padding:5px 8px;font-size:12.5px;outline:none;background:rgba(255,255,255,.92);color:var(--ink);font-family:inherit;}
.sc-pop-new button{display:grid;place-items:center;width:28px;height:28px;border-radius:7px;border:0;background:var(--accent);color:#fff;cursor:pointer;flex:none;}
.sc-pop-new button:disabled{opacity:.5;cursor:default;}
.sc-pop-removebtn{display:flex;align-items:center;gap:6px;width:100%;border:0;background:none;border-radius:8px;padding:7px 8px;margin-top:2px;cursor:pointer;font-size:12px;font-weight:700;color:#c0392b;transition:.12s;font-family:'Barlow',sans-serif;}
.sc-pop-removebtn:hover{background:rgba(192,57,43,.08);}
`;

/* HighlightsStrip / PinPicker REMOVED: pinned results now live inline in the
   results lists (App.jsx) — a pin icon on each row + a "Pinned" section at the
   top, backed by the same pinned_results table (data/scout.js pin API). */

/* ══════════════════════════════════════════════════════════════════════════
   ScoutLocked — gate shown at /scout to non-scout viewers. Liquid-glass panel
   (matches .sc-panel language) inviting them to sign up as a Scout.
   ════════════════════════════════════════════════════════════════════════ */
export function ScoutLocked({onSignUp}){
  return (
    <div style={{minHeight:"52vh",display:"grid",placeItems:"center",padding:"32px 16px"}}>
      <div style={{width:"100%",maxWidth:440,textAlign:"center",padding:"38px 30px 34px",
        background:"rgba(255,255,255,0.85)",backdropFilter:"blur(30px) saturate(190%)",WebkitBackdropFilter:"blur(30px) saturate(190%)",
        borderRadius:16,boxShadow:"inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.4),0 10px 30px -12px rgba(0,0,0,.18)"}}>
        <div style={{fontSize:44,lineHeight:1,marginBottom:14}}>🔭</div>
        <h2 style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:24,color:"var(--ink)",lineHeight:1.15,margin:"0 0 10px"}}>Scout tools are for scouts</h2>
        <p style={{fontSize:14,color:"var(--mut)",lineHeight:1.55,margin:"0 0 22px"}}>Watchlists, results-only analytics, printable reports and the Discover feed are part of the Scout workspace.</p>
        <button type="button" onClick={onSignUp}
          style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:7,border:0,cursor:"pointer",
            borderRadius:980,padding:"12px 26px",fontSize:14,fontWeight:800,fontFamily:"'Barlow',sans-serif",color:"#fff",
            background:"linear-gradient(135deg,rgba(10,132,255,.95),rgba(10,132,255,.82))",backdropFilter:"blur(18px) saturate(180%)",WebkitBackdropFilter:"blur(18px) saturate(180%)",
            boxShadow:"0 10px 30px -8px rgba(10,132,255,.55),inset 0 1px 0 rgba(255,255,255,.4)",transition:".15s"}}>
          Sign up as a Scout</button>
        <div style={{fontSize:12,color:"var(--mut)",marginTop:14}}>Already a scout? Sign in with your scout account.</div>
      </div>
    </div>
  );
}

/* ── collapsible discovery section ───────────────────────────────────────── */
function Section({icon:Ic,title,count,hint,defaultOpen=true,children}){
  const [open,setOpen]=React.useState(defaultOpen);
  return(
    <div className="sc-panel" style={{marginBottom:12}}>
      <button type="button" onClick={()=>setOpen(o=>!o)} className="sc-sechead">
        {open?<ChevronDown size={15}/>:<ChevronRight size={15}/>}
        <Ic size={15} color="var(--accent)"/>
        <span style={{fontWeight:800,fontSize:14}}>{title}</span>
        {count!=null&&<span className="sc-count">{count}</span>}
        {hint&&<span onClick={e=>e.stopPropagation()} style={{display:"inline-flex"}}><InfoHint text={hint}/></span>}
      </button>
      {open&&<div style={{padding:"2px 6px 8px"}}>{children}</div>}
    </div>
  );
}

// A single discovery row: flag, name link, the stat, and a watch toggle.
function DiscoverRow({owner,events,nat,name,onPick,children,onSaved}){
  return(
    <div className="sc-drow">
      {nat&&<span style={{fontSize:15,lineHeight:1,flex:"none"}}>{iocFlag(nat)}</span>}
      <span className="sc-link" style={{fontWeight:700,fontSize:13.5,color:"var(--ink)",flex:"none",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
        onClick={()=>onPick&&onPick(name)} title={name}>{name}</span>
      <span style={{flex:1,minWidth:0,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>{children}</span>
      <SaveButton owner={owner} events={events} kind="athlete" athleteKey={name} size="sm" onSaved={onSaved}/>
    </div>
  );
}

/* ── one labelled metric row inside the athlete detail panel ─────────────── */
function StatRow({label,value,hint,tone}){
  const col = tone==="good"?"#2e9e5b":tone==="bad"?"#c0392b":"var(--ink)";
  return(
    <div className="sc-statrow">
      <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:12,color:"var(--mut)",fontWeight:600}}>
        {label}{hint&&<InfoHint text={hint}/>}
      </span>
      <span style={{fontSize:13,fontWeight:700,color:value==="—"?"var(--mut)":col,fontVariantNumeric:"tabular-nums",textAlign:"right"}}>{value}</span>
    </div>
  );
}

/* ── shared metric descriptors ───────────────────────────────────────────────
   One source of truth for the 11 results-only metrics: the detail panel, the
   scout report and the compare grid all read `label`/`value(m)` from here so the
   numbers can never drift between views. `cmp` returns a comparable number (or
   null) + `dir` ("hi"/"lo" = which way is better) so Compare can bold the best
   value per row. `tone(m)` mirrors the detail panel's good/bad colouring. */
const METRIC_ROWS=[
  {key:"steadiness", label:"Steadiness",
    value:m=>m?.consistency?`${m.consistency.steadiness}/100`:"—",
    cmp:m=>m?.consistency?m.consistency.steadiness:null, dir:"hi",
    tone:m=>m?.consistency&&m.consistency.steadiness>=70?"good":undefined},
  {key:"blowup", label:"Blow-up rate",
    value:m=>fmtPct(m?.blowupRate), cmp:m=>m?.blowupRate??null, dir:"lo",
    tone:m=>m?.blowupRate!=null?(m.blowupRate<=0.08?"good":m.blowupRate>=0.2?"bad":undefined):undefined},
  {key:"flags", label:"Start-line flags",
    value:m=>fmtPct(m?.startRisk?.flagRate), cmp:m=>m?.startRisk?.flagRate??null, dir:"lo",
    tone:m=>m?.startRisk?.flagRate!=null?(m.startRisk.flagRate<=0.02?"good":m.startRisk.flagRate>=0.08?"bad":undefined):undefined},
  {key:"bullet", label:"Bullet rate",
    value:m=>fmtPct(m?.startRisk?.bulletRate), cmp:m=>m?.startRisk?.bulletRate??null, dir:"hi",
    tone:m=>m?.startRisk?.bulletRate>=0.15?"good":undefined},
  {key:"learner", label:"Regatta learner",
    value:m=>fmtSigned(m?.regattaLearner), cmp:m=>m?.regattaLearner??null, dir:"lo",
    tone:m=>m?.regattaLearner!=null?(m.regattaLearner<0?"good":m.regattaLearner>0.05?"bad":undefined):undefined},
  {key:"slow", label:"Slow starter",
    value:m=>fmtSigned(m?.slowStarter), cmp:m=>m?.slowStarter??null, dir:"lo",
    tone:m=>m?.slowStarter!=null?(m.slowStarter>0.08?"bad":undefined):undefined},
  {key:"travel", label:"Travels well",
    value:m=>m?.travel?`${fmtPct(m.travel.homePct)} home · ${fmtPct(m.travel.awayPct)} away`:"—",
    cmp:m=>m?.travel?(m.travel.homePct-m.travel.awayPct):null, dir:"hi", // away ≤ home ⇒ diff ≥0 ⇒ better traveller
    tone:m=>m?.travel?(m.travel.awayPct<=m.travel.homePct?"good":undefined):undefined},
  {key:"bigstage", label:"Big-stage delta",
    value:m=>fmtSigned(m?.pressureDelta), cmp:m=>m?.pressureDelta??null, dir:"lo",
    tone:m=>m?.pressureDelta!=null?(m.pressureDelta<0?"good":m.pressureDelta>0.05?"bad":undefined):undefined},
  {key:"pairing", label:"Pairing stability",
    value:m=>m?.pairings?.stability!=null?fmtPct(m.pairings.stability):"—",
    cmp:m=>m?.pairings?.stability??null, dir:"hi", tone:()=>undefined},
  {key:"cohort", label:"Cohort percentile",
    value:m=>m?.cohortPercentile?`${pctLabel(m.cohortPercentile.percentile)} of ${m.cohortPercentile.peers}`:"—",
    cmp:m=>m?.cohortPercentile?m.cohortPercentile.percentile:null, dir:"hi",
    tone:m=>m?.cohortPercentile&&m.cohortPercentile.percentile>=0.8?"good":undefined},
  {key:"streak", label:"Current streak",
    value:m=>m?.streak?streakPhrase(m.streak.kind,m.streak.len):"—",
    cmp:m=>m?.streak?m.streak.len:null, dir:"hi", tone:m=>m?.streak?"good":undefined},
];
const METRIC_HINTS={
  steadiness:"How consistent their race-to-race finishing is within a regatta (0–100; higher = steadier). Below ~3 events it stays blank.",
  blowup:"Share of races finishing in the worst 10% of the fleet — the wheels-come-off races.",
  flags:"OCS / UFD / BFD rate — how often they're over early or black-flagged at the start.",
  bullet:"Share of races won outright — first place.",
  learner:"Do they get faster across a regatta? Average of (last-third finish % − first-third finish %); negative = warms up, closes stronger.",
  slow:"First-race finish % minus their event average. Positive = the opening race tends to be worse than the rest.",
  travel:"Finish % at their home (most-sailed) venue vs everywhere else. Away better-or-equal to home is the mark of a traveller.",
  bigstage:"Finish % in their largest fleets vs their smallest. Negative = they step up when the fleet is deep.",
  pairing:"Doublehanded only: share of paired events sailed with their single most-frequent partner.",
  cohort:"Where their rating ranks among athletes born the same year (100th = top of their age group).",
  streak:"Their active run of strong finishes across consecutive events, newest-first.",
};

/* ── universal stats grid (scout athlete card) ────────────────────────────────
   Nine sport-agnostic metrics on the finish-percentile primitive
   P=(N−r)/(N−1)×100 — see universalMetrics() in data/scoutMetrics.js.
   Reading order: level (beat/top-10/podium) → now (form/consistency/season
   best) → ceiling+volume (best finish/events-yr/starts). */
const fmtRate=v=>v==null?"—":`${Math.round(v*100)}%`;
const UNI_ROWS=[
  {key:"beat", label:"Beat rate",
    value:u=>u?.beatRate==null?"—":`Beats ${Math.round(u.beatRate)}%`,
    tone:u=>u?.beatRate==null?undefined:u.beatRate>=75?"good":u.beatRate<40?"bad":undefined,
    hint:"Average share of the field they finish ahead of (last 24 months of results)."},
  {key:"top10", label:"Top-10 rate",
    value:u=>fmtRate(u?.top10Rate),
    tone:u=>u?.top10Rate!=null&&u.top10Rate>=0.5?"good":undefined,
    hint:"How often they finish top-10 (top quarter in fields under 20). Last 24 months."},
  {key:"podium", label:"Podium rate",
    value:u=>fmtRate(u?.podiumRate),
    tone:u=>u?.podiumRate!=null&&u.podiumRate>=0.25?"good":undefined,
    hint:"Share of career events finished in the top 3."},
  {key:"form", label:"Form trend",
    value:u=>u?.formTrend==null?"—":`${u.formTrend>=0?"+":"−"}${Math.abs(Math.round(u.formTrend))} pts`,
    tone:u=>u?.formTrend==null?undefined:u.formTrend>=3?"good":u.formTrend<=-3?"bad":undefined,
    hint:"Average finish percentile, last 12 months vs the 12 before. Positive = climbing."},
  {key:"consist", label:"Consistency",
    value:u=>u?.consistency==null?"—":`${u.consistency}/100`,
    tone:u=>u?.consistency==null?undefined:u.consistency>=75?"good":u.consistency<50?"bad":undefined,
    hint:"How tightly their finishes cluster (100 = metronome, low = boom-or-bust). Last 24 months."},
  {key:"sbest", label:"Season best",
    value:u=>u?.seasonBest?rankOfFleet(u.seasonBest.rank,u.seasonBest.fleet):"—",
    tone:u=>u?.seasonBest&&u.seasonBest.rank<=3?"good":undefined,
    hint:"Best finish in the last 12 months — their current ceiling."},
  {key:"pbest", label:"Best finish",
    value:u=>u?.bestFinish?`${rankOfFleet(u.bestFinish.rank,u.bestFinish.fleet)}${u.bestFinish.year?` · ${u.bestFinish.year}`:""}`:"—",
    tone:u=>u?.bestFinish&&u.bestFinish.rank===1?"good":undefined,
    hint:"Career-best finish, field size included so a club win can't masquerade as a championship."},
  {key:"epy", label:"Events / year",
    value:u=>u?`${u.eventsPerYear}/yr`:"—",
    tone:u=>u&&u.eventsPerYear>=8?"good":undefined,
    hint:"Competitions in the trailing 12 months — competitive mileage, and how much data backs this card."},
  {key:"starts", label:"Career starts",
    value:u=>u?`${u.starts}${u.sinceYear?` · since ${u.sinceYear}`:""}`:"—",
    hint:"Total ranked events on record."},
];

/* ══════════════════════════════════════════════════════════════════════════
   Athlete detail panel — universal stats + recent results + AI overview.
   (Notes UI removed 2026-07-20 on Casey's call — to be re-thought later; the
   scout_notes table + data helpers stay for when it comes back.)
   ════════════════════════════════════════════════════════════════════════ */
function StocksDetail({owner,events,ratings,name,clips,onPick,onOpenEvent,aiCache,setAiCache}){
  const spine=React.useMemo(()=>athleteIndex(events).get(canonName(name))||[],[events,name]);
  const face=React.useMemo(()=>athleteFace(spine),[spine]);
  const m=React.useMemo(()=>metricsForAthlete(name,events,ratings),[name,events,ratings]);
  const uni=React.useMemo(()=>universalMetrics(name,events),[name,events]);
  const rec=ratings&&ratings.get?ratings.get(canonName(name)):null;
  const [showReport,setShowReport]=React.useState(false);
  const dispName=face.disp||name;

  // Stocks anatomy: range tabs + range-scoped delta headline + share.
  const [range,setRange]=React.useState("1y");
  const chartPts=React.useMemo(()=>filterHistory(rec?.history,range),[rec,range]);
  const rangeDelta=chartPts.length>=2?chartPts[chartPts.length-1].r-chartPts[0].r:null;
  const RANGE_LABEL={"1m":"Past Month","3m":"Past 3 Months","6m":"Past 6 Months",ytd:"Year to Date","1y":"Past Year","2y":"Past 2 Years",all:"All Time"};
  const recent=React.useMemo(()=>[...spine].sort((a,b)=>String(b.dk).localeCompare(String(a.dk))).slice(0,8),[spine]);
  const dkDate=dk=>dk?formatDate(`${+String(dk).slice(6,8)}/${+String(dk).slice(4,6)}/${String(dk).slice(0,4)}`):"";
  const deltaFor=s=>{const h=rec?.history?.find(p=>p.evId===s.ev.id);return h?h.delta:null;};

  // "Earnings Report · Add to Calendar" → the athlete's next upcoming entry.
  const nextRace=React.useMemo(()=>{
    const k=canonName(name); let best=null;
    for(const ev of (events||[])){
      if(!ev||ev.status==="Draft"||!isUpcomingEvent(ev)) continue;
      const inIt=(ev.entries||[]).some(e=>canonName(e.helm||"")===k||canonName(e.crew||"")===k);
      if(!inIt) continue;
      const dk=dateKey(ev.date)||"";
      if(!best||String(dk)<String(best.dk)) best={evName:ev.name,evId:ev.id,dk,date:ev.date};
    }
    return best;
  },[events,name]);

  const [shareNote,setShareNote]=React.useState(null);
  async function share(){
    const url=`${window.location.origin}/${usernameForName(dispName)||""}`;
    const text=`${dispName} on AthLink — rating ${fmtR(m?.ratingNow)} (${fmtDelta(m?.delta30)} past 30 days)`;
    if(navigator.share){
      try{ await navigator.share({title:`${dispName} · AthLink`,text,url}); return; }
      catch(e){ if(e&&e.name==="AbortError") return; /* fall through to copy */ }
    }
    try{ await navigator.clipboard.writeText(url); setShareNote("Link copied"); }
    catch{ setShareNote(url); }
    setTimeout(()=>setShareNote(null),2200);
  }

  // AI overview
  const cached=aiCache[canonName(name)];
  const [aiBusy,setAiBusy]=React.useState(false);

  async function runAI(){
    if(aiBusy) return;
    setAiBusy(true);
    try{
      const recent=spine.slice(-5).map(s=>`${s.ev.name}: ${s.rank}/${s.fleet}`).join("; ");
      const bits=[];
      if(m){
        if(m.ratingNow!=null) bits.push(`rating ${Math.round(m.ratingNow)}±${Math.round(m.rd||0)}`);
        if(m.delta90!=null) bits.push(`90-day trend ${fmtDelta(m.delta90)}`);
        if(m.consistency) bits.push(`steadiness ${m.consistency.steadiness}/100`);
        if(m.startRisk) bits.push(`flag rate ${fmtPct(m.startRisk.flagRate)}, bullet rate ${fmtPct(m.startRisk.bulletRate)}`);
        if(m.travel) bits.push(`home finish ${fmtPct(m.travel.homePct)} vs away ${fmtPct(m.travel.awayPct)}`);
        if(m.streak) bits.push(streakPhrase(m.streak.kind,m.streak.len));
      }
      const prompt=`Write a concise 2-3 sentence scouting summary of the sailor ${face.disp||name}. `+
        `Metrics: ${bits.join("; ")||"limited data"}. Recent results: ${recent||"none"}. `+
        `Be specific and plain-spoken; note strengths and watch-outs. Do not invent facts beyond these.`;
      const res=await aiComplete("overview",prompt);
      const text=(res&&res.ok&&res.text)?res.text.trim():"Couldn't generate a summary right now.";
      setAiCache(c=>({...c,[canonName(name)]:text}));
    }catch{ setAiCache(c=>({...c,[canonName(name)]:"Couldn't generate a summary right now."})); }
    setAiBusy(false);
  }

  return(
    <div className="sc-panel sk-detail">
      {/* ── header: identity + share / report / watch ── */}
      <div className="sk-head">
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
            <span className="sc-link sk-title" onClick={()=>onPick&&onPick(name)}>{dispName}</span>
            {face.nat&&<span style={{fontSize:20,lineHeight:1}}>{iocFlag(face.nat)}</span>}
            {face.classes.slice(0,3).map(c=>{const ng=nuggetFor(c);return <span key={c} style={{background:ng.color,color:"#fff",borderRadius:980,padding:"1px 9px",fontWeight:700,fontSize:11,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>;})}
          </div>
          <div style={{fontSize:12,color:"var(--mut)",marginTop:4}}>AthLink skill rating{m?` · ${m.events} rated events · ${m.races} races`:" · not enough results yet"}</div>
        </div>
        <div className="sk-actions">
          <button type="button" className="sk-iconbtn" title="Share" onClick={share}><Share size={15}/></button>
          <button type="button" className="sk-iconbtn" title="Printable scout report" onClick={()=>setShowReport(true)}><FileText size={15}/></button>
          <SaveButton owner={owner} events={events} kind="athlete" athleteKey={name} title={dispName}/>
        </div>
      </div>
      {shareNote&&<div className="sk-sharenote">{shareNote}</div>}

      {/* ── rating headline, Stocks price-line style ── */}
      <div className="sk-pxline">
        <span className="sk-bigpx">{fmtR(m?.ratingNow)}</span>
        {m?.rd!=null&&<span style={{fontSize:13,color:"var(--mut)"}}>±{Math.round(m.rd)}</span>}
        <span style={{fontSize:17,fontWeight:800,fontFamily:"'Barlow',sans-serif",fontVariantNumeric:"tabular-nums",
          color:rangeDelta==null||Math.abs(rangeDelta)<0.5?"var(--mut)":rangeDelta>0?"#2e9e5b":"#c0392b"}}>{fmtDelta(rangeDelta)}</span>
        <span style={{fontSize:12,color:"var(--mut)",fontWeight:600}}>{RANGE_LABEL[range]}</span>
        <span style={{marginLeft:"auto",display:"inline-flex",gap:10,alignItems:"center",fontSize:11.5}}>
          <span style={{color:"var(--mut)"}}>30d <DeltaChip d={m?.delta30}/></span>
          <span style={{color:"var(--mut)"}}>90d <DeltaChip d={m?.delta90}/></span>
          <span style={{color:"var(--mut)"}}>1y <DeltaChip d={m?.delta365}/></span>
        </span>
      </div>

      {/* ── "Earnings Report · Add to Calendar" → next upcoming entry ── */}
      {nextRace&&(
        <div className="sk-upc">
          <CalendarClock size={15} color="var(--accent)" style={{flex:"none"}}/>
          <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
            Racing next: <b className="sc-link" onClick={()=>onOpenEvent&&onOpenEvent(nextRace.evId)}>{nextRace.evName}</b>
            {nextRace.date?` · ${formatDate(nextRace.date)}`:""}
          </span>
          <button type="button" className="sk-cal" onClick={()=>downloadIcs(nextRace.evName,nextRace.dk)}>
            <CalendarPlus size={14}/>Add to Calendar
          </button>
        </div>
      )}

      {/* ── range tabs + big chart ── */}
      <div className="sk-ranges">
        {CHART_RANGES.map(([k,label])=>(
          <button key={k} type="button" className={range===k?"on":""} onClick={()=>setRange(k)}>{label}</button>
        ))}
      </div>
      <StocksChart points={chartPts}/>

      {/* ── stats grid (Open/High/Low anatomy → nine universal, sport-agnostic
          metrics; every ratio gated on a minimum event count so a 2-start
          athlete can't show a flattering 100%) ── */}
      <div className="sk-sech">The numbers</div>
      <div className="sk-stats">
        {UNI_ROWS.map(row=>{
          const tone=row.tone?row.tone(uni):undefined;
          return(
            <div key={row.key} className="sk-stat">
              <span className="sk-stat-l">{row.label}{row.hint&&<InfoHint text={row.hint}/>}</span>
              <span className="sk-stat-v" style={tone?{color:tone==="good"?"#2e9e5b":"#c0392b"}:undefined}>{row.value(uni)}</span>
            </div>
          );
        })}
      </div>

      <div className="sk-bottom">
        {/* recent results as the "news" list */}
        <div style={{minWidth:0}}>
          <div className="sk-sech">Recent results</div>
          {recent.length===0
            ? <Muted>No rated results yet.</Muted>
            : recent.map((s,i)=>(
                <div key={i} className="sk-news" onClick={()=>onOpenEvent&&onOpenEvent(s.ev.id)}>
                  <div style={{flex:1,minWidth:0}}>
                    <div className="sk-news-t">{s.ev.name}</div>
                    <div className="sk-news-s">{dkDate(s.dk)}{s.ev.cls?` · ${nuggetFor(s.ev.cls,s.ev.subclass).label}`:""}</div>
                  </div>
                  <span className="sk-news-r" style={{color:medalColor(s.rank)}}>{rankOfFleet(s.rank,s.fleet)}</span>
                  <DeltaChip d={deltaFor(s)}/>
                </div>
              ))}

          {/* AI overview */}
          <div style={{marginTop:16,paddingTop:12,borderTop:"1px solid var(--line)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <Sparkles size={13} color="var(--accent)"/>
              <span className="sk-sech" style={{margin:0}}>AI overview</span>
            </div>
            {cached
              ? <p style={{margin:0,fontSize:12.5,lineHeight:1.6,color:"var(--ink)"}}>{cached}</p>
              : <button type="button" className="btn ghost" style={{fontSize:12.5,padding:"7px 14px"}} onClick={runAI} disabled={aiBusy}>
                  {aiBusy?<Loader2 size={14} className="sc-spin"/>:<Sparkles size={14}/>}{aiBusy?"Thinking…":"Summarise this athlete"}
                </button>}
            {cached&&<button type="button" onClick={runAI} disabled={aiBusy} style={{marginTop:8,border:0,background:"none",color:"var(--accent)",fontSize:11.5,fontWeight:700,cursor:"pointer",padding:0}}>{aiBusy?"Thinking…":"Regenerate"}</button>}
          </div>
        </div>
      </div>

      {showReport&&(
        <ScoutReport name={name} face={face} m={m} rec={rec} spine={spine}
          clips={clips} onClose={()=>setShowReport(false)}/>
      )}
    </div>
  );
}

// One saved result/event/upcoming/link row in the "Saved results" tab:
// kind chip, event title (click-through), athlete + finish context for results,
// date, a move-to-folder menu (results-namespace binders only) and remove.
function SavedRow({clip,events,binders,onOpenEvent,onMove,onRemove}){
  const evById=React.useMemo(()=>{const m=new Map();(events||[]).forEach(e=>m.set(String(e.id),e));return m;},[events]);
  const ev=clip.event_id!=null?evById.get(String(clip.event_id)):null;
  const snap=clip.snapshot||{};
  const title=snap.evName||ev?.name||clip.title||snap.title||(clip.kind==="link"?clip.url:"Saved item");
  const date=ev?.date||snap.evDate||null;
  const kindLabel={result:"Result",event:"Event",upcoming:"Upcoming",link:"Link",snapshot:"Snapshot"}[clip.kind]||"Clip";
  const context=clip.kind==="result"&&(snap.athlete||clip.title)
    ? `${snap.athlete||clip.title}${snap.rank!=null?` · ${rankOfFleet(snap.rank,snap.fleet)}`:""}`
    : null;
  const [menu,setMenu]=React.useState(false);
  const menuRef=React.useRef(null);
  React.useEffect(()=>{
    if(!menu) return;
    const fn=e=>{ if(menuRef.current&&!menuRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener("mousedown",fn);
    return()=>document.removeEventListener("mousedown",fn);
  },[menu]);
  const open=()=>{
    if(clip.url){ window.open(clip.url,"_blank","noopener"); return; }
    if(clip.event_id!=null&&onOpenEvent) onOpenEvent(clip.event_id);
  };
  const canOpen=clip.url||clip.event_id!=null;
  return(
    <div className="sc-cliprow" draggable
      onDragStart={e=>{ e.dataTransfer.setData("text/athlink-result",String(clip.id)); e.dataTransfer.effectAllowed="move"; }}
      title="Drag onto a sidebar folder to file">
      <span style={{fontSize:9.5,fontWeight:800,letterSpacing:".05em",textTransform:"uppercase",color:"var(--accent)",flex:"none",width:64}}>{kindLabel}</span>
      <span style={{flex:1,minWidth:0}}>
        <span className={canOpen?"sc-link":""} onClick={canOpen?open:undefined}
          style={{display:"block",fontSize:13,fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</span>
        {context&&<span style={{display:"block",fontSize:11.5,color:"var(--mut)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{context}</span>}
      </span>
      {date&&<span style={{fontSize:11.5,color:"var(--mut)",flex:"none"}}>{formatDate(date)}</span>}
      {clip.url&&<ExternalLink size={13} color="var(--mut)" style={{flex:"none"}}/>}
      <span ref={menuRef} className="sc-savewrap" style={{flex:"none"}}>
        <button type="button" className="sc-minibtn" title="Move to folder" onClick={()=>setMenu(m=>!m)}>
          <FolderPlus size={12}/>Folder
        </button>
        {menu&&(
          <div className="sc-pop" onClick={e=>e.stopPropagation()}>
            <div className="sc-pop-head">Move to folder</div>
            <div className="sc-pop-list">
              {binders.length===0&&<div style={{fontSize:12,color:"var(--mut)",padding:"4px 8px 6px"}}>No folders yet — create one in the sidebar.</div>}
              {binders.map(b=>{
                const on=String(clip.binder_id)===String(b.id);
                return(
                  <button key={b.id} type="button" className={"sc-pop-item"+(on?" on":"")}
                    onClick={()=>{ setMenu(false); if(!on) onMove(clip,b.id); }}>
                    {on?<BookmarkCheck size={14} style={{flex:"none"}}/>:<Bookmark size={14} style={{flex:"none"}}/>}
                    <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"left"}}>{binderLabel(b)}</span>
                    {on&&<Check size={13} style={{flex:"none"}}/>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </span>
      <button type="button" onClick={()=>onRemove(clip)} title="Remove"
        style={{border:0,background:"none",color:"var(--mut)",cursor:"pointer",padding:2,flex:"none"}}
        onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="var(--mut)"}><X size={14}/></button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ScoutReport — a clean, printable/exportable one-athlete dossier. Renders full
   over the viewport as a fixed overlay; Print/Save-PDF calls window.print(). A
   scoped @media print rule (in SCOUT_CSS, .sc-report-root) hides everything but
   the report itself so only the dossier hits the page. Monochrome-friendly:
   avoids colour dependence, uses hairlines + weight for hierarchy.
   ════════════════════════════════════════════════════════════════════════ */
function ScoutReport({name,face,m,rec,spine,clips,onClose}){
  React.useEffect(()=>{
    const onKey=e=>{ if(e.key==="Escape") onClose(); };
    document.addEventListener("keydown",onKey);
    document.body.classList.add("sc-print-lock");
    return()=>{ document.removeEventListener("keydown",onKey); document.body.classList.remove("sc-print-lock"); };
  },[onClose]);

  const genDate=formatDate(new Date().toLocaleDateString("en-GB"));
  // recent results, newest-first, last ~8
  const recent=React.useMemo(()=>[...spine].sort((a,b)=>String(b.dk).localeCompare(String(a.dk))).slice(0,8),[spine]);
  // evidence clips referencing this athlete (any kind carrying its athlete_key)
  const myClips=React.useMemo(()=>(clips||[]).filter(c=>canonName(c.athlete_key||"")===canonName(name)),[clips,name]);
  const dkDate=dk=>dk?formatDate(`${+dk.slice(6,8)}/${+dk.slice(4,6)}/${dk.slice(0,4)}`):"";

  return ReactDOM.createPortal(
    <div className="sc-report-root" onClick={onClose}>
      <div className="sc-report-sheet" onClick={e=>e.stopPropagation()}>
        {/* toolbar — hidden in print */}
        <div className="sc-report-bar">
          <button type="button" className="btn cta" style={{fontSize:12.5,padding:"7px 15px"}} onClick={()=>window.print()}>
            <Printer size={14}/>Print / Save PDF
          </button>
          <button type="button" className="btn ghost" style={{fontSize:12.5,padding:"7px 14px"}} onClick={onClose}>
            <X size={14}/>Close
          </button>
        </div>

        <div className="sc-report">
          {/* masthead */}
          <div className="sc-rep-head">
            <div>
              <div className="sc-rep-mark">AthLink</div>
              <div className="sc-rep-kicker">Scout report</div>
            </div>
            <div className="sc-rep-gen">Generated {genDate}</div>
          </div>

          {/* identity */}
          <div className="sc-rep-name">
            {face.disp||name}
            {face.nat&&<span style={{fontSize:20,marginLeft:8}}>{iocFlag(face.nat)}</span>}
          </div>
          <div className="sc-rep-sub">
            {face.classes.length?face.classes.map(c=>nuggetFor(c).label).join(" · "):"—"}
            {face.nat?` · ${face.nat}`:""}
            {m?` · ${m.events} rated events · ${m.races} races`:""}
          </div>

          {/* rating headline + sparkline */}
          <div className="sc-rep-rating">
            <div style={{display:"flex",alignItems:"baseline",gap:12,flexWrap:"wrap"}}>
              <span className="sc-rep-big">{fmtR(m?.ratingNow)}</span>
              {m?.rd!=null&&<span className="sc-rep-rd">±{Math.round(m.rd)}</span>}
              <span className="sc-rep-deltas">
                <span>30d <b>{fmtDelta(m?.delta30)}</b></span>
                <span>90d <b>{fmtDelta(m?.delta90)}</b></span>
              </span>
            </div>
            <div className="sc-rep-spark"><Sparkline history={rec?.history} w={180} h={40}/></div>
          </div>

          {/* metrics grid */}
          <div className="sc-rep-section-h">Results-only metrics</div>
          <div className="sc-rep-metrics">
            {METRIC_ROWS.map(row=>(
              <div key={row.key} className="sc-rep-metric">
                <span className="sc-rep-mlabel">{row.label}</span>
                <span className="sc-rep-mval">{row.value(m)}</span>
              </div>
            ))}
          </div>

          {/* recent results */}
          <div className="sc-rep-section-h">Recent results</div>
          {recent.length===0
            ? <div className="sc-rep-empty">No rated results.</div>
            : <table className="sc-rep-table">
                <thead><tr><th>Event</th><th>Date</th><th style={{textAlign:"right"}}>Finish</th></tr></thead>
                <tbody>
                  {recent.map((s,i)=>(
                    <tr key={i}>
                      <td>{s.ev.name}{s.ev.cls?<span className="sc-rep-tcls"> · {nuggetFor(s.ev.cls,s.ev.subclass).label}</span>:""}</td>
                      <td>{dkDate(s.dk)}</td>
                      <td style={{textAlign:"right",fontVariantNumeric:"tabular-nums"}}>{rankOfFleet(s.rank,s.fleet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>}

          {/* saved evidence */}
          <div className="sc-rep-section-h">Saved evidence</div>
          {myClips.length===0
            ? <div className="sc-rep-empty">No saved clips for this athlete.</div>
            : <ul className="sc-rep-evid">
                {myClips.map((c,i)=>{
                  const snap=c.snapshot||{};
                  const t=c.title||snap.evName||snap.title||(c.kind==="link"?c.url:"Saved item");
                  const d=snap.evDate||null;
                  return <li key={i}><span>{t}</span>{d&&<span className="sc-rep-edate">{formatDate(d)}</span>}</li>;
                })}
              </ul>}

          <div className="sc-rep-foot">Generated with AthLink · results-only analytics</div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   CompareModal — 2–3 watched athletes side-by-side. Athletes are columns,
   metrics are rows; the best value in each row is bolded + accented. Sparkline
   sits atop each column. Escape/backdrop closes (caller resets selection).
   ════════════════════════════════════════════════════════════════════════ */
function CompareModal({owner,events,ratings,names,onClose,onPick}){
  React.useEffect(()=>{
    const onKey=e=>{ if(e.key==="Escape") onClose(); };
    document.addEventListener("keydown",onKey);
    return()=>document.removeEventListener("keydown",onKey);
  },[onClose]);

  const cols=React.useMemo(()=>names.map(name=>{
    const spine=athleteIndex(events).get(canonName(name))||[];
    return {name, face:athleteFace(spine),
      m:metricsForAthlete(name,events,ratings),
      rec:ratings&&ratings.get?ratings.get(canonName(name)):null};
  }),[names,events,ratings]);

  // headline rows (rating + 30d delta) plus the shared METRIC_ROWS.
  const rows=[
    {key:"rating", label:"Rating", value:c=>fmtR(c.m?.ratingNow), cmp:c=>c.m?.ratingNow??null, dir:"hi"},
    {key:"d30", label:"30-day delta", value:c=>fmtDelta(c.m?.delta30), cmp:c=>c.m?.delta30??null, dir:"hi"},
    ...METRIC_ROWS.map(r=>({key:r.key,label:r.label,value:c=>r.value(c.m),cmp:c=>r.cmp(c.m),dir:r.dir})),
  ];

  // index of the best column for each row (null if no comparable values or a tie).
  function bestIdx(row){
    const vals=cols.map(c=>row.cmp(c));
    const nums=vals.map((v,i)=>({v,i})).filter(o=>o.v!=null&&!Number.isNaN(o.v));
    if(nums.length<2) return -1;
    const target=row.dir==="hi"?Math.max(...nums.map(o=>o.v)):Math.min(...nums.map(o=>o.v));
    const winners=nums.filter(o=>o.v===target);
    if(winners.length!==1) return -1;            // no highlight on ties
    // display-level tie (e.g. −1.8% vs −2.3% both shown "−2%") reads as arbitrary — skip too
    const wi=winners[0].i, ws=row.value(cols[wi]);
    return nums.some(o=>o.i!==wi&&row.value(cols[o.i])===ws)?-1:wi;
  }

  return(
    <div className="ov" onClick={onClose} style={{zIndex:130}}>
      <div className="modal sc-cmp-modal" onClick={e=>e.stopPropagation()} style={{maxWidth:820}}>
        <div className="mhead" style={{padding:"16px 22px"}}>
          <Columns3 size={17}/><h3 style={{flex:1}}>Compare</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div className="sc-cmp-scroll">
          <table className="sc-cmp-table">
            <thead>
              <tr>
                <th className="sc-cmp-corner"/>
                {cols.map(c=>(
                  <th key={c.name} className="sc-cmp-athhead">
                    <span className="sc-link" onClick={()=>onPick&&onPick(c.name)}
                      style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:14.5,color:"var(--ink)"}}>
                      <span style={{maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.face.disp||c.name}</span>
                      {c.face.nat&&<span style={{fontSize:14,flex:"none"}}>{iocFlag(c.face.nat)}</span>}
                    </span>
                    <div style={{marginTop:6}}><Sparkline history={c.rec?.history} w={116} h={26}/></div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row=>{
                const bi=bestIdx(row);
                return(
                  <tr key={row.key}>
                    <td className="sc-cmp-rlabel">{row.label}</td>
                    {cols.map((c,i)=>{
                      const win=i===bi;
                      return(
                        <td key={c.name} className="sc-cmp-cell"
                          style={win?{color:"var(--accent)",fontWeight:800}:undefined}>
                          {row.value(c)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   ScoutPortal — the workspace root.
   ════════════════════════════════════════════════════════════════════════ */
export default function ScoutPortal({events,auth,onPick,onOpenEvent,hostById,onRequireAuth}){
  const owner=React.useMemo(()=>scoutOwnerId(auth),[auth]);   // null when signed out
  const ratings=React.useMemo(()=>ratingEngine.getAthleteRatings(events),[events]);

  const [bump,setBump]=React.useState(0);            // re-fetch trigger
  const [binders,setBinders]=React.useState([]);
  const [clips,setClips]=React.useState([]);
  const [digestPrefs,setDigestPrefs]=React.useState([]);
  const [loading,setLoading]=React.useState(true);

  const [tab,setTab]=React.useState("home");         // home | discover | saved (Instagram structure)
  const [savedSub,setSavedSub]=React.useState("athletes"); // saved tab: athletes | results
  const [selBinder,setSelBinder]=React.useState("all");       // athletes ns: "all" | binder id
  const [selResBinder,setSelResBinder]=React.useState("all"); // results ns:  "all" | binder id
  const [detailName,setDetailName]=React.useState(null);
  const [aiCache,setAiCache]=React.useState({});
  const [sortMode,setSortMode]=React.useState(()=>{ try{return localStorage.getItem("sc-sort")||"movers";}catch{return "movers";} });
  const [compareMode,setCompareMode]=React.useState(false);
  const [compareSel,setCompareSel]=React.useState([]);   // canon keys? no — display names
  const [showCompare,setShowCompare]=React.useState(false);
  React.useEffect(()=>{ try{localStorage.setItem("sc-sort",sortMode);}catch{} },[sortMode]);
  React.useEffect(()=>{ ensureSaveCss(); },[]);   // sc-pop styles for SavedRow menus
  const [confirm,setConfirm]=React.useState(null);
  const [newAthBinder,setNewAthBinder]=React.useState("");
  const [newResBinder,setNewResBinder]=React.useState("");
  const [renaming,setRenaming]=React.useState(null); // {id,name,ns}
  const [wq,setWq]=React.useState("");               // watchlist filter query
  const [dropTarget,setDropTarget]=React.useState(null); // folder id a dragged athlete row hovers

  const reload=React.useCallback(async()=>{
    if(!owner){ setBinders([]); setClips([]); setDigestPrefs([]); setLoading(false); return; }
    const [bs,cs,dp]=await Promise.all([fetchBinders(owner),fetchClips(owner),fetchDigestPrefs(owner)]);
    setBinders(bs); setClips(cs); setDigestPrefs(dp); setLoading(false);
  },[owner]);
  // Full-screen loader only on first load / owner change; bump-triggered
  // refetches run in the background so open popovers/toasts don't get
  // unmounted mid-save by the loading branch swapping the tab out.
  React.useEffect(()=>{ setLoading(true); },[owner]);
  React.useEffect(()=>{ reload(); },[reload,bump]);

  // The two folder namespaces, kept strictly apart in the sidebar + tabs:
  // athlete binders hold kind='athlete' clips; results binders hold the rest.
  const athBinders=binders.filter(b=>binderNS(b)==="athletes");
  const resBinders=binders.filter(b=>binderNS(b)==="results");
  const athClips=clips.filter(c=>c.kind==="athlete");
  const resClips=clips.filter(c=>c.kind!=="athlete");
  const countAth=id=>athClips.filter(c=>id==="all"?true:String(c.binder_id)===String(id)).length;
  const countRes=id=>resClips.filter(c=>id==="all"?true:String(c.binder_id)===String(id)).length;

  // clips for the selected athlete binder
  const binderClips=athClips.filter(c=>selBinder==="all"?true:String(c.binder_id)===String(selBinder));
  // watched athletes, deduped by canon key (the same athlete saved under two
  // name variants must never render as two cards — clips arrive created_at
  // desc, so the first hit is the newest), ordered by the chosen sort.
  // "Movers" = |30-day rating move| desc; "Recent" = most-recently added; "A–Z".
  const watchAthletes=React.useMemo(()=>{
    const seen=new Set(); const list=[];
    for(const c of binderClips){
      const k=canonName(c.athlete_key||c.title||"");
      if(!k||seen.has(k)) continue;
      seen.add(k); list.push(c);
    }
    const nameOf=c=>{const spine=athleteIndex(events).get(canonName(c.athlete_key||c.title||""))||[];return (athleteFace(spine).disp||c.snapshot?.athlete||c.title||c.athlete_key||"").toLowerCase();};
    const d30Of=c=>{const m=metricsForAthlete(c.athlete_key||c.title||"",events,ratings);return m?.delta30??0;};
    const addedAt=c=>{const t=c.created_at?Date.parse(c.created_at):NaN;return Number.isNaN(t)?0:t;};
    const arr=[...list];
    if(sortMode==="az") arr.sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
    else if(sortMode==="recent") arr.sort((a,b)=>addedAt(b)-addedAt(a));
    else arr.sort((a,b)=>Math.abs(d30Of(b))-Math.abs(d30Of(a))); // movers
    return arr;
  },[binderClips,sortMode,events,ratings]);
  // saved results/events for the selected results binder, newest event first
  // (falling back to save time when the clip carries no event date).
  const evById=React.useMemo(()=>{const m=new Map();(events||[]).forEach(e=>m.set(String(e.id),e));return m;},[events]);
  const savedRows=React.useMemo(()=>{
    const rows=resClips.filter(c=>selResBinder==="all"?true:String(c.binder_id)===String(selResBinder));
    const dkOf=c=>{
      const ev=c.event_id!=null?evById.get(String(c.event_id)):null;
      const d=ev?.date||c.snapshot?.evDate;
      const dk=d?dateKey(d):"";
      if(dk) return dk;
      const t=c.created_at?new Date(c.created_at):null;
      return t&&!Number.isNaN(t.getTime())?`${t.getUTCFullYear()}${String(t.getUTCMonth()+1).padStart(2,"0")}${String(t.getUTCDate()).padStart(2,"0")}`:"";
    };
    return [...rows].sort((a,b)=>String(dkOf(b)).localeCompare(String(dkOf(a))));
  },[resClips,selResBinder,evById]);
  // watchlist rows surviving the filter box, and the row the detail pane shows
  // (explicit selection if it's still visible, else the first row — the pane is
  // always populated, Stocks-style).
  const filteredWatch=React.useMemo(()=>{
    const q=wq.trim().toLowerCase();
    if(!q) return watchAthletes;
    return watchAthletes.filter(c=>{
      const spine=athleteIndex(events).get(canonName(c.athlete_key||c.title||""))||[];
      const disp=(athleteFace(spine).disp||c.snapshot?.athlete||c.title||c.athlete_key||"").toLowerCase();
      return disp.includes(q);
    });
  },[watchAthletes,wq,events]);
  const selName=React.useMemo(()=>{
    const names=filteredWatch.map(c=>c.athlete_key||c.title||"");
    if(detailName&&names.some(n=>canonName(n)===canonName(detailName))) return detailName;
    return names[0]||null;
  },[filteredWatch,detailName]);
  // every watched athlete (across all binders) as canon keys — used by discovery watch state + digest
  const watchedKeys=React.useMemo(()=>new Set(athClips.map(c=>canonName(c.athlete_key||"")).filter(Boolean)),[athClips]);

  async function makeBinder(ns){
    const nm=(ns==="results"?newResBinder:newAthBinder).trim(); if(!nm) return;
    const b=await createBinder(owner,nm,ns);
    if(b){
      setBinders(bs=>[...bs,b]);
      setTab("saved"); setSavedSub(ns==="results"?"results":"athletes");
      if(ns==="results"){ setNewResBinder(""); setSelResBinder(b.id); }
      else{ setNewAthBinder(""); setSelBinder(b.id); }
    }
  }
  async function doRename(){
    if(!renaming||!renaming.name.trim()) return;
    await renameBinder(renaming.id,renaming.name.trim(),renaming.ns);
    setRenaming(null); setBump(b=>b+1);
  }
  function askDelete(b){
    setConfirm({title:"Delete folder?",message:`"${binderLabel(b)}" and its saved items will be removed. This can't be undone.`,confirmLabel:"Delete folder",
      onConfirm:async()=>{ await deleteBinder(b.id);
        if(String(selBinder)===String(b.id)) setSelBinder("all");
        if(String(selResBinder)===String(b.id)) setSelResBinder("all");
        setBump(x=>x+1); }});
  }
  // Optimistic removes with an honest reconcile: if the DELETE came back as an
  // RLS zero-row no-op, refetch so the row visibly comes back.
  async function removeAthlete(clip){
    setClips(cs=>cs.filter(c=>c.id!==clip.id));
    const r=await removeClip(clip.id);
    if(!(Array.isArray(r)&&r.length)) setBump(b=>b+1);
  }
  async function removeSaved(clip){
    setClips(cs=>cs.filter(c=>c.id!==clip.id));
    const r=await removeClip(clip.id);
    if(!(Array.isArray(r)&&r.length)) setBump(b=>b+1);
  }
  async function moveSaved(clip,binderId){
    const prev=clips;
    setClips(cs=>cs.map(c=>c.id===clip.id?{...c,binder_id:binderId}:c));
    const r=await moveClip(clip.id,binderId);
    if(!(Array.isArray(r)&&r.length)) setClips(prev);
  }
  // Drag-and-drop filing: an athlete row dropped on a sidebar folder.
  async function dropOnFolder(clipId,binderId){
    setDropTarget(null);
    const clip=clips.find(c=>String(c.id)===String(clipId));
    if(!clip||String(clip.binder_id)===String(binderId)) return;
    await moveSaved(clip,binderId);
  }

  /* ── discovery data (memoised on events/ratings) ── */
  const [radarThreshold,setRadarThreshold]=React.useState(1400);
  const disc=React.useMemo(()=>({
    fire:onFire(events,ratings,{days:30,minEvents:2}).slice(0,12),
    strk:streaks(events,{minLen:2}).slice(0,14),
    beat:beatForecast(events,ratings,{days:90,minFleet:8}).slice(0,14),
  }),[events,ratings]);
  const radarRows=React.useMemo(()=>radar(events,ratings,{threshold:radarThreshold,days:60}).slice(0,14),[events,ratings,radarThreshold]);

  const [discQuery,setDiscQuery]=React.useState("");
  const [discCls,setDiscCls]=React.useState(null);
  const allNames=React.useMemo(()=>{
    const idx=athleteIndex(events); const out=[];
    idx.forEach((spine,k)=>{ const f=athleteFace(spine); out.push({key:k,disp:f.disp,nat:f.nat,classes:f.classes}); });
    return out.sort((a,b)=>a.disp.localeCompare(b.disp));
  },[events]);
  const searchHits=React.useMemo(()=>{
    const q=discQuery.trim().toLowerCase();
    if(!q&&!discCls) return [];
    return allNames.filter(a=>(!q||a.disp.toLowerCase().includes(q))&&(!discCls||a.classes.includes(discCls))).slice(0,30);
  },[allNames,discQuery,discCls]);
  const classOptions=React.useMemo(()=>{const s=new Set();allNames.forEach(a=>a.classes.forEach(c=>s.add(c)));return [...s];},[allNames]);

  /* ── home feed (digest + suggestions) ── */
  const latestDk=React.useMemo(()=>{
    // validDk: one mm/dd-formatted event date would otherwise anchor every
    // window a year into the future and zero the whole feed.
    let l=""; (events||[]).forEach(ev=>{const dk=dateKey(ev.date); if(dk&&validDk(dk)&&dk>l) l=dk;});
    return l;
  },[events]);
  const sinceDk=React.useMemo(()=>{
    if(!latestDk) return "";
    const y=+latestDk.slice(0,4),mo=+latestDk.slice(4,6)-1,d=+latestDk.slice(6,8);
    const t=new Date(Date.UTC(y,mo,d)); t.setUTCDate(t.getUTCDate()-7);
    return `${t.getUTCFullYear()}${String(t.getUTCMonth()+1).padStart(2,"0")}${String(t.getUTCDate()).padStart(2,"0")}`;
  },[latestDk]);
  const digest=React.useMemo(()=>digestFor(events,ratings,{watchedKeys,sinceDk}),[events,ratings,watchedKeys,sinceDk]);
  const digestBinderId=selBinder==="all"?null:selBinder;
  const curFreq=React.useMemo(()=>{
    const p=digestPrefs.find(x=>String(x.binder_id||"")===String(digestBinderId||""));
    return p?.frequency||"weekly";
  },[digestPrefs,digestBinderId]);
  async function setFreq(freq){
    setDigestPrefs(ps=>{const rest=ps.filter(x=>String(x.binder_id||"")!==String(digestBinderId||""));return [...rest,{binder_id:digestBinderId,frequency:freq,kind:"watchlist"}];});
    await upsertDigestPref(owner,digestBinderId,{frequency:freq});
  }
  // Suggested competitions, algorithm v1 (Instagram-feed style): recent events
  // in the classes this scout's watched athletes sail (class affinity), that
  // they haven't saved and that none of their athletes raced — those already
  // surface under "Your athletes". Affinity-scored, newest first, capped at 6.
  const suggested=React.useMemo(()=>{
    if(!watchedKeys.size||!latestDk) return [];
    const idx=athleteIndex(events);
    const aff=new Map();
    watchedKeys.forEach(k=>{(idx.get(k)||[]).forEach(s=>{const c=s.ev.cls; if(c) aff.set(c,(aff.get(c)||0)+1);});});
    if(!aff.size) return [];
    const savedEvIds=new Set(resClips.map(c=>String(c.event_id)));
    const cutoff=dkMonthsBack(latestDk,12);
    const watchedRaced=ev=>(ev.entries||[]).some(e=>watchedKeys.has(canonName(e.helm||""))||watchedKeys.has(canonName(e.crew||"")));
    return (events||[])
      .filter(ev=>ev&&ev.status!=="Draft"&&ev.cls&&aff.has(ev.cls))
      .filter(ev=>{const dk=dateKey(ev.date); return dk&&dk>=cutoff;})
      .filter(ev=>!savedEvIds.has(String(ev.id))&&!watchedRaced(ev))
      .map(ev=>({ev,score:aff.get(ev.cls),dk:dateKey(ev.date)}))
      .sort((a,b)=>b.score-a.score||String(b.dk).localeCompare(String(a.dk)))
      .slice(0,6);
  },[events,watchedKeys,resClips,latestDk]);

  const TABS=[["home","Home"],["discover","Discover"],["saved","Saved"]];

  // Signed out (dev mode can reach the portal without a session): the workspace
  // is owner-private under RLS 0015, so there is nothing to load — prompt for
  // sign-in instead of showing an empty workspace that silently drops writes.
  if(!owner) return(
    <div className="wrap sec" style={{paddingTop:16}}>
      <style>{SCOUT_CSS}</style>
      <div style={{minHeight:"46vh",display:"grid",placeItems:"center",padding:"32px 16px"}}>
        <div className="sc-panel" style={{width:"100%",maxWidth:440,textAlign:"center",padding:"38px 30px 34px"}}>
          <div style={{fontSize:40,lineHeight:1,marginBottom:12}}>🔭</div>
          <h2 style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:22,color:"var(--ink)",margin:"0 0 8px"}}>Sign in to open your workspace</h2>
          <p style={{fontSize:13.5,color:"var(--mut)",lineHeight:1.55,margin:"0 0 20px"}}>Your watchlist, saved results and notes are private to your scout account — sign in and they'll be right here.</p>
          <button type="button" className="btn cta" style={{fontSize:13.5,padding:"10px 24px"}} onClick={()=>onRequireAuth&&onRequireAuth()}>Sign in</button>
        </div>
      </div>
    </div>
  );

  // one sidebar group per namespace: heading, "All" row, folders, inline
  // create. Folder rows are DROP TARGETS: dragging a watchlist athlete (or a
  // saved result) onto one files it there. Clicking navigates to Saved with
  // the right sub-view.
  const sideGroup=(nsKey,heading,allLabel,AllIcon,groupBinders,sel,setSel,count,newVal,setNewVal,subKey)=>(
    <>
      <div className="sc-side-h">{heading}</div>
      <button type="button" className={"sc-binder"+(tab==="saved"&&savedSub===subKey&&sel==="all"?" on":"")}
        onClick={()=>{setSel("all");setTab("saved");setSavedSub(subKey);}}>
        <AllIcon size={14}/><span style={{flex:1,textAlign:"left"}}>{allLabel}</span><span className="sc-count">{count("all")}</span>
      </button>
      {groupBinders.map(b=>(
        <div key={b.id} className="sc-binder-wrap">
          {renaming&&renaming.id===b.id
            ? <div style={{display:"flex",gap:5,padding:"3px 6px",width:"100%"}}>
                <input autoFocus value={renaming.name} onChange={e=>setRenaming(r=>({...r,name:e.target.value}))}
                  onKeyDown={e=>{if(e.key==="Enter")doRename();if(e.key==="Escape")setRenaming(null);}}
                  style={{flex:1,minWidth:0,border:"1px solid var(--accent)",borderRadius:7,padding:"4px 7px",fontSize:12.5,outline:"none",background:"#fff",color:"var(--ink)"}}/>
                <button type="button" onClick={doRename} style={{border:0,background:"var(--accent)",color:"#fff",borderRadius:6,width:26,display:"grid",placeItems:"center",cursor:"pointer"}}><Check size={13}/></button>
              </div>
            : <>
                <button type="button"
                  className={"sc-binder"+(tab==="saved"&&savedSub===subKey&&String(sel)===String(b.id)?" on":"")+(String(dropTarget)===String(b.id)?" drop":"")}
                  onClick={()=>{setSel(b.id);setTab("saved");setSavedSub(subKey);}}
                  onDragOver={e=>{ if([...e.dataTransfer.types].includes(nsKey==="athletes"?"text/athlink-athlete":"text/athlink-result")){ e.preventDefault(); e.dataTransfer.dropEffect="move"; setDropTarget(b.id); } }}
                  onDragLeave={()=>setDropTarget(t=>String(t)===String(b.id)?null:t)}
                  onDrop={e=>{ e.preventDefault(); const id=e.dataTransfer.getData(nsKey==="athletes"?"text/athlink-athlete":"text/athlink-result"); if(id) dropOnFolder(id,b.id); }}>
                  <Bookmark size={14}/><span style={{flex:1,textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{binderLabel(b)}</span>
                  <span className="sc-count">{count(b.id)}</span>
                </button>
                <div className="sc-binder-actions">
                  <button type="button" title="Rename" onClick={()=>setRenaming({id:b.id,name:binderLabel(b),ns:nsKey})}><Pencil size={12}/></button>
                  <button type="button" title="Delete" onClick={()=>askDelete(b)}><Trash2 size={12}/></button>
                </div>
              </>}
        </div>
      ))}
      <div className="sc-newfolder">
        <input value={newVal} onChange={e=>setNewVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")makeBinder(nsKey);}} placeholder="New folder…"/>
        <button type="button" onClick={()=>makeBinder(nsKey)} disabled={!newVal.trim()} title="Create folder"><FolderPlus size={15}/></button>
      </div>
    </>
  );

  return(
    // wider than the default wrap: the Stocks-style split view needs room for
    // the chart pane next to the ticker list.
    <div className="wrap sec" style={{paddingTop:16,maxWidth:1500}}>
      <style>{SCOUT_CSS}</style>

      {/* page header */}
      <div style={{display:"flex",alignItems:"center",gap:11,margin:"4px 0 16px"}}>
        <div style={{display:"grid",placeItems:"center",width:40,height:40,borderRadius:12,background:"var(--sky)",color:"var(--navy)",flex:"none"}}>
          <Telescope size={22}/>
        </div>
        <div>
          <h2 className="page-title" style={{fontSize:26}}>Scout</h2>
          <p className="page-sub" style={{margin:"2px 0 0"}}>Your private watchlist and results-only talent radar.</p>
        </div>
      </div>

      <div className="sc-layout">
        {/* ── sidebar: folders, grouped by namespace (athletes / results) ── */}
        <aside className="sc-side">
          <div className="sc-panel" style={{padding:"8px 8px 10px"}}>
            {sideGroup("athletes","Athletes","All watched",Bookmark,athBinders,selBinder,setSelBinder,countAth,newAthBinder,setNewAthBinder,"athletes")}
            <div style={{borderTop:"1px solid var(--line)",margin:"10px 2px 2px"}}/>
            {sideGroup("results","Results & events","All saved",FileText,resBinders,selResBinder,setSelResBinder,countRes,newResBinder,setNewResBinder,"results")}
          </div>
        </aside>

        {/* ── main ── */}
        <main style={{minWidth:0}}>
          {/* tabs */}
          <div className="seg sc-tabs" style={{marginBottom:14}}>
            {TABS.map(([id,label])=>(
              <button key={id} className={tab===id?"on":""} onClick={()=>setTab(id)}>{label}</button>
            ))}
          </div>

          {loading
            ? <div className="sc-panel" style={{padding:"40px 20px",textAlign:"center",color:"var(--mut)"}}><Loader2 size={22} className="sc-spin"/><div style={{marginTop:8,fontSize:13}}>Loading your workspace…</div></div>
            : <>
              {/* ============ HOME — Instagram-style feed ============ */}
              {tab==="home"&&(
                watchedKeys.size===0
                  ? <EmptyHome onDiscover={()=>setTab("discover")}/>
                  : <>
                    <div className="sc-panel" style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",marginBottom:12,flexWrap:"wrap"}}>
                      <CalendarClock size={16} color="var(--accent)"/>
                      <span style={{fontWeight:800,fontSize:14}}>Your week</span>
                      <span style={{flex:1,fontSize:11.5,color:"var(--mut)"}}>What your athletes did, where they race next, and competitions worth a look.</span>
                      <div className="seg sc-freq">
                        {[["weekly","Weekly"],["daily","Daily"]].map(([id,label])=>(
                          <button key={id} className={curFreq===id?"on":""} onClick={()=>setFreq(id)}>{label}</button>
                        ))}
                      </div>
                    </div>

                    <Section icon={Sparkles} title="Your athletes" count={digest.newResults.length} hint="Results your watched athletes posted in the last 7 days of the dataset.">
                      {digest.newResults.length===0?<Muted>No new results from your athletes this week.</Muted>:digest.newResults.map((r,i)=>(
                        <div key={i} className="sc-drow sc-link" onClick={()=>onOpenEvent&&onOpenEvent(r.evId)}>
                          <span style={{fontWeight:700,fontSize:13.5,color:"var(--ink)",flex:"none",maxWidth:170,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</span>
                          <span style={{flex:1,minWidth:0,fontSize:12,color:"var(--mut)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.evName}</span>
                          <span style={{fontSize:12,fontWeight:700,color:"var(--navy)",fontVariantNumeric:"tabular-nums",flex:"none"}}>{r.rank}{r.fleet?`/${r.fleet}`:""}</span>
                          <span style={{flex:"none"}}><DeltaChip d={r.delta}/></span>
                        </div>
                      ))}
                    </Section>

                    <Section icon={CalendarClock} title="Racing next" count={digest.upcoming.length} hint="Upcoming entry lists your watched athletes appear on.">
                      {digest.upcoming.length===0?<Muted>None of your athletes have an upcoming entry.</Muted>:digest.upcoming.map((r,i)=>(
                        <div key={i} className="sc-drow sc-link" onClick={()=>onOpenEvent&&onOpenEvent(r.evId)}>
                          <span style={{fontWeight:700,fontSize:13.5,color:"var(--ink)",flex:"none",maxWidth:170,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</span>
                          <span style={{flex:1,minWidth:0,fontSize:12,color:"var(--mut)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.evName}</span>
                          <span style={{fontSize:11.5,color:"var(--mut)",flex:"none"}}>{r.dk?formatDate(`${+r.dk.slice(6,8)}/${+r.dk.slice(4,6)}/${r.dk.slice(0,4)}`):""}</span>
                        </div>
                      ))}
                    </Section>

                    <Section icon={Flame} title="Suggested competitions" count={suggested.length} hint="Recent events in the classes you scout, picked from who you watch. Save one to follow it.">
                      {suggested.length===0?<Muted>Watch a few athletes and suggestions will appear here.</Muted>:suggested.map(({ev})=>{
                        const ng=nuggetFor(ev.cls,ev.subclass);
                        return(
                          <div key={ev.id} className="sc-drow">
                            <span style={{background:ng.color,color:"#fff",borderRadius:980,padding:"1px 8px",fontWeight:700,fontSize:10,fontFamily:"'Barlow',sans-serif",flex:"none"}}>{ng.label}</span>
                            <span className="sc-link" style={{flex:1,minWidth:0,fontSize:13,fontWeight:700,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                              onClick={()=>onOpenEvent&&onOpenEvent(ev.id)}>{ev.name}</span>
                            <span style={{fontSize:11.5,color:"var(--mut)",flex:"none"}}>{ev.date?formatDate(ev.date):""}</span>
                            <span style={{fontSize:11.5,color:"var(--mut)",flex:"none"}}>{(ev.entries||[]).length} boats</span>
                            {/* no bump onSaved: a refetch would recompute the feed and unmount
                                this row (and its folder popover) mid-save — Instagram keeps the
                                post in the feed; the exclusion applies on the next visit */}
                            <SaveButton size="sm" owner={owner} events={events} kind={isUpcomingEvent(ev)?"upcoming":"event"} eventId={ev.id} title={ev.name}
                              snapshot={{evName:ev.name,evDate:ev.date,cls:ev.cls}} onRequireAuth={onRequireAuth}/>
                          </div>
                        );
                      })}
                    </Section>

                    <Section icon={TrendingUp} title="Movers" count={digest.movers.length} hint="Your watched athletes' 30-day rating moves, biggest swing first.">
                      {digest.movers.length===0?<Muted>No rating moves in the last month.</Muted>:digest.movers.map((r,i)=>(
                        <DiscoverRow key={r.name} owner={owner} events={events} nat={null} name={r.name} onPick={onPick}>
                          <DeltaChip d={r.delta30}/><span style={{fontSize:11.5,color:"var(--mut)"}}>over 30 days</span>
                        </DiscoverRow>
                      ))}
                    </Section>
                  </>
              )}

              {/* ============ SAVED — athletes (Stocks split) | competitions ============ */}
              {tab==="saved"&&(
                <>
                  <div className="seg sc-sortseg" style={{marginBottom:12}}>
                    {[["athletes",`Athletes (${countAth("all")})`],["results",`Competitions (${countRes("all")})`]].map(([id,label])=>(
                      <button key={id} className={savedSub===id?"on":""} onClick={()=>setSavedSub(id)}>{label}</button>
                    ))}
                  </div>
                  {savedSub==="athletes"&&(
                  <>
                  {watchAthletes.length===0
                    ? <EmptyWatchlist/>
                    : <div className="sk-split">
                        {/* left: ticker list */}
                        <div className="sc-panel sk-list">
                          <div className="sk-listhead">
                            <div className="srch sk-search">
                              <Search size={14} color="var(--mut)"/>
                              <input value={wq} onChange={e=>setWq(e.target.value)} placeholder="Filter watchlist…"/>
                            </div>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
                              <div className="seg sc-sortseg">
                                {[["movers","Movers"],["recent","Recent"],["az","A–Z"]].map(([id,label])=>(
                                  <button key={id} className={sortMode===id?"on":""} onClick={()=>setSortMode(id)}>{label}</button>
                                ))}
                              </div>
                              <span style={{flex:1}}/>
                              <button type="button" className={"sc-cmpbtn"+(compareMode?" on":"")}
                                onClick={()=>{ setCompareMode(v=>!v); setCompareSel([]); }}
                                title={compareMode?"Exit compare":"Select athletes to compare"}>
                                <Columns3 size={13}/>{compareMode?"Done":"Compare"}
                              </button>
                            </div>
                          </div>
                          <div className="sk-rows">
                            {filteredWatch.length===0&&<Muted>No matches in this folder.</Muted>}
                            {filteredWatch.map(clip=>{
                              const nm=clip.athlete_key||clip.title||"";
                              return(
                                <WatchRow key={clip.id} clip={clip} events={events} ratings={ratings}
                                  selected={!!selName&&canonName(selName)===canonName(nm)}
                                  onSelect={setDetailName} onRemove={removeAthlete}
                                  compareMode={compareMode} cmpSelected={compareSel.includes(nm)}
                                  cmpDisabled={compareSel.length>=3}
                                  onToggleCmp={n=>setCompareSel(s=>s.includes(n)?s.filter(x=>x!==n):(s.length>=3?s:[...s,n]))}/>
                              );
                            })}
                          </div>
                        </div>
                        {/* right: Stocks-style detail pane */}
                        <div style={{minWidth:0}}>
                          {selName&&(
                            <StocksDetail owner={owner} events={events} ratings={ratings} name={selName}
                              clips={clips} onPick={onPick} onOpenEvent={onOpenEvent}
                              aiCache={aiCache} setAiCache={setAiCache}/>
                          )}
                        </div>
                      </div>}

                  {/* floating Compare N launcher (liquid-glass) */}
                  {compareMode&&compareSel.length>=2&&(
                    <button type="button" className="sc-cmpfloat" onClick={()=>setShowCompare(true)}>
                      <Columns3 size={16}/>Compare {compareSel.length}
                    </button>
                  )}
                  {showCompare&&compareSel.length>=2&&(
                    <CompareModal owner={owner} events={events} ratings={ratings} names={compareSel} onPick={onPick}
                      onClose={()=>{ setShowCompare(false); }}/>
                  )}
                  </>)}

                  {savedSub==="results"&&(
                    savedRows.length===0
                      ? <EmptySaved/>
                      : <div className="sc-panel" style={{padding:"6px 8px 8px"}}>
                          <div style={{fontSize:10.5,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",color:"var(--mut)",padding:"7px 8px"}}>
                            Saved results & events{selResBinder!=="all"&&(()=>{const b=resBinders.find(x=>String(x.id)===String(selResBinder));return b?` — ${binderLabel(b)}`:"";})()}
                          </div>
                          {savedRows.map(clip=>(
                            <SavedRow key={clip.id} clip={clip} events={events} binders={resBinders}
                              onOpenEvent={onOpenEvent} onMove={moveSaved} onRemove={removeSaved}/>
                          ))}
                        </div>
                  )}
                </>
              )}

              {/* ============ DISCOVER ============ */}
              {tab==="discover"&&(
                <>
                  <div className="sc-panel" style={{padding:"12px",marginBottom:12}}>
                    <div className="srch" style={{marginBottom:searchHits.length||discQuery||discCls?10:0}}>
                      <Search size={16} color="var(--mut)"/>
                      <input value={discQuery} onChange={e=>setDiscQuery(e.target.value)} placeholder="Search every athlete by name…"/>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {classOptions.map(c=>{const ng=nuggetFor(c);const on=discCls===c;return(
                        <button key={c} type="button" onClick={()=>setDiscCls(on?null:c)}
                          style={{border:0,cursor:"pointer",borderRadius:980,padding:"4px 11px",fontSize:11.5,fontWeight:700,fontFamily:"'Barlow',sans-serif",transition:".12s",
                            background:on?ng.color:"var(--grouped)",color:on?"#fff":"var(--mut)"}}>{ng.label}</button>);})}
                    </div>
                    {(discQuery||discCls)&&(
                      <div style={{marginTop:10,display:"flex",flexDirection:"column"}}>
                        {searchHits.length===0
                          ? <p style={{fontSize:12.5,color:"var(--mut)",padding:"6px 4px",margin:0}}>No athletes match.</p>
                          : searchHits.map(a=>(
                              <DiscoverRow key={a.key} owner={owner} events={events} nat={a.nat} name={a.disp} onPick={onPick} onSaved={()=>setBump(b=>b+1)}>
                                <span style={{fontSize:12,color:"var(--mut)",display:"flex",gap:4,flexWrap:"wrap"}}>
                                  {a.classes.slice(0,2).map(c=>{const ng=nuggetFor(c);return <span key={c} style={{background:ng.color,color:"#fff",borderRadius:980,padding:"1px 7px",fontSize:10,fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>;})}
                                  <button type="button" className="sc-minibtn" onClick={()=>onPick&&onPick(a.disp)} style={{marginLeft:2}}><ExternalLink size={11}/>Profile</button>
                                </span>
                              </DiscoverRow>
                            ))}
                      </div>
                    )}
                  </div>

                  <Section icon={Flame} title="On fire" count={disc.fire.length} hint="Biggest skill-rating gains over the last 30 days of the dataset. Momentum, not absolute level.">
                    {disc.fire.length===0?<Muted>No standout gains in the recent window.</Muted>:disc.fire.map((r,i)=>(
                      <DiscoverRow key={i} owner={owner} events={events} nat={null} name={r.name} onPick={onPick} onSaved={()=>setBump(b=>b+1)}>
                        <DeltaChip d={r.delta}/>
                        <span style={{fontSize:12,color:"var(--mut)",fontVariantNumeric:"tabular-nums"}}>{fmtR(r.ratingNow)} rating · {r.events} event{r.events===1?"":"s"}</span>
                      </DiscoverRow>
                    ))}
                  </Section>

                  <Section icon={ListChecks} title="Streaks" count={disc.strk.length} hint="Athletes on an active run of strong finishes across consecutive events.">
                    {disc.strk.length===0?<Muted>No active streaks right now.</Muted>:disc.strk.map((r,i)=>(
                      <DiscoverRow key={i} owner={owner} events={events} nat={null} name={r.name} onPick={onPick} onSaved={()=>setBump(b=>b+1)}>
                        <span style={{fontSize:12.5,fontWeight:700,color:"var(--navy)"}}>{streakPhrase(r.kind,r.len)}</span>
                        {r.lastEvName&&<span style={{fontSize:11.5,color:"var(--mut)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>· latest: {r.lastEvName}</span>}
                      </DiscoverRow>
                    ))}
                  </Section>

                  <Section icon={TrendingUp} title="Beat the forecast" count={disc.beat.length} hint="Breakouts: sailors who finished far better than their pre-event rating expected, in fleets of 8+.">
                    {disc.beat.length===0?<Muted>No standout upsets in the recent window.</Muted>:disc.beat.map((r,i)=>(
                      <DiscoverRow key={i} owner={owner} events={events} nat={null} name={r.name} onPick={onPick} onSaved={()=>setBump(b=>b+1)}>
                        <span style={{fontSize:12.5,color:"var(--ink)",fontVariantNumeric:"tabular-nums"}}>
                          expected <b>{r.expected}{ordSuffix(r.expected)}</b> → finished <b style={{color:"#2e9e5b"}}>{r.actual}{ordSuffix(r.actual)}</b>
                        </span>
                        {r.evName&&<span className="sc-link" style={{fontSize:11.5,color:"var(--accent)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} onClick={()=>onOpenEvent&&onOpenEvent(r.evId)}>{r.evName}</span>}
                      </DiscoverRow>
                    ))}
                  </Section>

                  <Section icon={Radar} title="On the radar" count={radarRows.length} hint="Athletes whose skill rating just crossed the threshold you set, in the last 60 days of the dataset.">
                    <div style={{display:"flex",alignItems:"center",gap:8,padding:"4px 8px 10px",fontSize:12,color:"var(--mut)"}}>
                      <span>Rating threshold</span>
                      <input type="number" value={radarThreshold} step={25} onChange={e=>setRadarThreshold(+e.target.value||1400)}
                        style={{width:80,border:"1px solid var(--line)",borderRadius:7,padding:"4px 8px",fontSize:12.5,outline:"none",background:"#fff",color:"var(--ink)",fontVariantNumeric:"tabular-nums"}}/>
                    </div>
                    {radarRows.length===0?<Muted>Nobody crossed {radarThreshold} in the recent window.</Muted>:radarRows.map((r,i)=>(
                      <DiscoverRow key={i} owner={owner} events={events} nat={null} name={r.name} onPick={onPick} onSaved={()=>setBump(b=>b+1)}>
                        <span style={{fontSize:12.5,color:"var(--ink)",fontVariantNumeric:"tabular-nums"}}>crossed {radarThreshold} · now <b>{fmtR(r.ratingNow)}</b></span>
                      </DiscoverRow>
                    ))}
                  </Section>
                </>
              )}
            </>}
        </main>
      </div>

      <ConfirmModal state={confirm} onClose={()=>setConfirm(null)}/>
    </div>
  );
}

// ordinal suffix for a bare number (14 → "th").
function ordSuffix(n){const s=["th","st","nd","rd"],v=n%100;return s[(v-20)%10]||s[v]||s[0];}
const Muted=({children})=><p style={{fontSize:12.5,color:"var(--mut)",padding:"8px 10px",margin:0}}>{children}</p>;

function EmptySaved(){
  return(
    <div className="sc-panel" style={{padding:"40px 24px",textAlign:"center"}}>
      <div style={{display:"grid",placeItems:"center",width:52,height:52,borderRadius:16,background:"var(--sky)",color:"var(--navy)",margin:"0 auto 14px"}}>
        <FileText size={26}/>
      </div>
      <h3 style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:18,margin:"0 0 6px",color:"var(--ink)"}}>No saved results yet</h3>
      <p style={{fontSize:13.5,lineHeight:1.6,color:"var(--mut)",maxWidth:420,margin:"0 auto"}}>
        Tap the <Bookmark size={13} style={{verticalAlign:"-2px"}}/> bookmark on any result row or event header across AthLink
        and it lands here instantly — then file it into a folder if you want.
      </p>
    </div>
  );
}

function EmptyHome({onDiscover}){
  return(
    <div className="sc-panel" style={{padding:"40px 24px",textAlign:"center"}}>
      <div style={{display:"grid",placeItems:"center",width:52,height:52,borderRadius:16,background:"var(--sky)",color:"var(--navy)",margin:"0 auto 14px"}}>
        <Telescope size={26}/>
      </div>
      <h3 style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:18,margin:"0 0 6px",color:"var(--ink)"}}>Your feed starts with a watchlist</h3>
      <p style={{fontSize:13.5,lineHeight:1.6,color:"var(--mut)",maxWidth:420,margin:"0 auto 18px"}}>
        Watch a few athletes and this page becomes your weekly brief — their new results,
        where they race next, and competitions worth a look.
      </p>
      <button type="button" className="btn cta" style={{fontSize:13,padding:"9px 20px"}} onClick={onDiscover}><Search size={14}/>Browse Discover</button>
    </div>
  );
}

function EmptyWatchlist(){
  return(
    <div className="sc-panel" style={{padding:"40px 24px",textAlign:"center"}}>
      <div style={{display:"grid",placeItems:"center",width:52,height:52,borderRadius:16,background:"var(--sky)",color:"var(--navy)",margin:"0 auto 14px"}}>
        <Bookmark size={26}/>
      </div>
      <h3 style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:18,margin:"0 0 6px",color:"var(--ink)"}}>Nothing watched yet</h3>
      <p style={{fontSize:13.5,lineHeight:1.6,color:"var(--mut)",maxWidth:420,margin:"0 auto"}}>
        Tap the <Bookmark size={13} style={{verticalAlign:"-2px"}}/> bookmark on any athlete, result or event across AthLink to add it here.
        Use <b>Discover</b> to surface athletes on the rise, then keep private notes on each one.
      </p>
    </div>
  );
}

/* ── scoped styles (all `sc-`; injected once) ────────────────────────────── */
const SCOUT_CSS=`
.sc-layout{display:grid;grid-template-columns:236px 1fr;gap:16px;align-items:start;}
.sc-side{position:sticky;top:12px;}
.sc-panel{background:rgba(255,255,255,0.85);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border:0;border-radius:16px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.06);}
.sc-side-h{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);padding:6px 8px 6px;}
.sc-newfolder{display:flex;gap:5px;padding:6px 6px 2px;margin-top:2px;}
.sc-newfolder input{flex:1;min-width:0;border:1px solid var(--line);border-radius:7px;padding:6px 8px;font-size:12.5px;outline:none;background:#fff;color:var(--ink);font-family:inherit;}
.sc-newfolder button{display:grid;place-items:center;width:30px;flex:none;border-radius:7px;border:0;background:var(--accent);color:#fff;cursor:pointer;}
.sc-newfolder button:disabled{opacity:.5;cursor:default;}
.sc-binder-wrap{position:relative;display:flex;align-items:center;}
.sc-binder{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;border-radius:9px;padding:7px 9px;font-size:13px;font-weight:600;color:var(--mut);cursor:pointer;transition:.13s;font-family:inherit;}
.sc-binder:hover{background:var(--grouped);color:var(--navy);}
.sc-binder.on{background:rgba(10,132,255,.12);color:var(--navy);box-shadow:inset 0 0 0 .5px rgba(10,132,255,.28);}
.sc-binder.drop{background:rgba(10,132,255,.2);color:var(--navy);box-shadow:inset 0 0 0 1.5px var(--accent);}
.sk-row[draggable=true]{cursor:grab;}
.sk-row[draggable=true]:active{cursor:grabbing;}
.sc-binder-wrap:hover .sc-binder-actions{opacity:1;}
.sc-binder-actions{position:absolute;right:6px;display:flex;gap:2px;opacity:0;transition:.13s;pointer-events:auto;}
.sc-binder-actions button{border:0;background:rgba(255,255,255,.85);color:var(--mut);width:22px;height:22px;border-radius:6px;display:grid;place-items:center;cursor:pointer;transition:.12s;}
.sc-binder-actions button:hover{color:var(--navy);background:#fff;}
.sc-count{font-size:11px;font-weight:800;color:var(--mut);font-variant-numeric:tabular-nums;background:var(--grouped);border-radius:980px;padding:1px 7px;min-width:20px;text-align:center;flex:none;}
.sc-tabs{background:var(--grouped);border-radius:980px;padding:3px;display:inline-flex;max-width:100%;overflow-x:auto;scrollbar-width:none;}
.sc-tabs::-webkit-scrollbar{display:none;}
.sc-tabs button{white-space:nowrap;flex:none;}
.sc-freq{background:var(--grouped);border-radius:980px;padding:2px;display:inline-flex;flex:none;}
.sc-freq button{padding:5px 14px;font-size:12px;}
.sc-sechead{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:11px 12px;cursor:pointer;color:var(--ink);font-family:inherit;transition:.12s;border-radius:16px;}
.sc-sechead:hover{background:rgba(10,132,255,.04);}
.sc-minibtn{display:inline-flex;align-items:center;gap:4px;border:0;background:var(--grouped);color:var(--mut);border-radius:980px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;transition:.12s;font-family:'Barlow',sans-serif;}
.sc-minibtn:hover{background:rgba(10,132,255,.14);color:var(--accent);}
.sc-cliprow{display:flex;align-items:center;gap:9px;padding:8px 8px;border-radius:9px;transition:.12s;}
.sc-cliprow:hover{background:var(--grouped);}
.sc-drow{display:flex;align-items:center;gap:9px;padding:8px 10px;border-radius:9px;transition:.12s;}
.sc-drow:hover{background:var(--grouped);}
.sc-statrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid var(--line);}
.sc-statrow:last-child{border-bottom:0;}
.sc-link{cursor:pointer;transition:color .12s;}
.sc-link:hover{color:var(--accent)!important;}
.sc-spin{animation:sc-rot 1s linear infinite;}
@keyframes sc-rot{to{transform:rotate(360deg);}}

/* ── watchlist toolbar: sort + compare ── */
.sc-sortseg{background:var(--grouped);border-radius:980px;padding:2px;display:inline-flex;}
.sc-sortseg button{padding:5px 13px;font-size:12px;}
.sc-cmpbtn{display:inline-flex;align-items:center;gap:6px;border:0;background:var(--grouped);color:var(--mut);border-radius:980px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;transition:.13s;font-family:'Barlow',sans-serif;box-shadow:inset 0 0 0 .5px var(--line);}
.sc-cmpbtn:hover{color:var(--accent);}
.sc-cmpbtn.on{background:rgba(10,132,255,.16);color:var(--accent);box-shadow:inset 0 0 0 .5px rgba(10,132,255,.4);}

/* ── Stocks-style watchlist: split view, ticker rows, detail pane ── */
.sk-split{display:grid;grid-template-columns:322px minmax(0,1fr);gap:14px;align-items:start;}
.sk-list{padding:10px 8px 8px;position:sticky;top:12px;display:flex;flex-direction:column;max-height:calc(100vh - 88px);}
.sk-listhead{padding:0 4px 8px;border-bottom:1px solid var(--line);}
.sk-listhead>div{flex-wrap:wrap;}
.sk-listhead .sc-sortseg button{padding:4px 9px;font-size:11.5px;}
.sk-listhead .sc-cmpbtn{padding:5px 10px;font-size:11.5px;}
.sk-search{display:flex;align-items:center;gap:7px;background:var(--grouped);border-radius:10px;padding:7px 10px;}
.sk-search input{flex:1;min-width:0;border:0;background:none;outline:none;font-size:13px;color:var(--ink);font-family:inherit;}
.sk-rows{overflow-y:auto;min-height:0;padding-top:4px;}
.sk-row{display:flex;align-items:center;gap:9px;padding:9px 9px;border-radius:11px;cursor:pointer;transition:.12s;position:relative;}
.sk-row+.sk-row{margin-top:1px;}
.sk-row::after{content:"";position:absolute;left:9px;right:9px;bottom:-1px;height:1px;background:var(--line);}
.sk-row:last-child::after{display:none;}
.sk-row:hover{background:var(--grouped);}
.sk-row.on{background:rgba(10,132,255,.12);box-shadow:inset 0 0 0 .5px rgba(10,132,255,.28);}
.sk-row.on::after,.sk-row:hover::after{opacity:0;}
.sk-row.cmp{background:rgba(10,132,255,.07);}
.sk-cbx{width:19px;height:19px;flex:none;border-radius:6px;border:1.5px solid var(--line);display:grid;place-items:center;transition:.12s;}
.sk-row-id{flex:1;min-width:0;}
.sk-row-name{font-family:'Barlow',sans-serif;font-weight:800;font-size:14.5px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2;}
.sk-row-sub{font-size:11px;color:var(--mut);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.sk-row-spark{flex:none;}
.sk-row-px{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex:none;min-width:62px;}
.sk-row-price{font-family:'Barlow',sans-serif;font-weight:800;font-size:14.5px;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1.1;}
.sk-chip{display:inline-block;min-width:52px;text-align:center;padding:2px 7px;border-radius:7px;color:#fff;font-weight:700;font-size:12px;font-family:'Barlow',sans-serif;font-variant-numeric:tabular-nums;line-height:1.35;}
.sk-chip.lg{min-width:64px;font-size:14px;padding:3px 9px;}
.sk-row-x{position:absolute;top:6px;right:6px;display:grid;place-items:center;width:18px;height:18px;border-radius:6px;border:0;background:rgba(255,255,255,.9);color:var(--mut);cursor:pointer;opacity:0;transition:.12s;box-shadow:inset 0 0 0 .5px var(--line);}
.sk-row:hover .sk-row-x{opacity:1;}
.sk-row-x:hover{color:#c0392b;}

.sk-detail{padding:16px 18px 18px;position:relative;}
.sk-head{display:flex;align-items:flex-start;gap:10px;}
.sk-title{font-family:'Barlow',sans-serif;font-weight:800;font-size:28px;color:var(--ink);line-height:1.05;}
.sk-actions{display:flex;align-items:center;gap:7px;flex:none;}
.sk-iconbtn{display:grid;place-items:center;width:32px;height:32px;border-radius:980px;border:0;cursor:pointer;background:var(--grouped);color:var(--navy);box-shadow:inset 0 0 0 .5px var(--line);transition:.13s;}
.sk-iconbtn:hover{color:var(--accent);background:rgba(10,132,255,.1);}
.sk-sharenote{position:absolute;top:54px;right:18px;z-index:30;background:rgba(255,255,255,.85);backdrop-filter:blur(22px) saturate(190%);-webkit-backdrop-filter:blur(22px) saturate(190%);border-radius:10px;padding:7px 12px;font-size:12px;font-weight:700;color:var(--navy);box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 10px 26px -10px rgba(0,0,0,.25);}
.sk-pxline{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:10px 0 4px;}
.sk-bigpx{font-family:'Barlow',sans-serif;font-weight:800;font-size:36px;color:var(--navy);font-variant-numeric:tabular-nums;line-height:1;}
.sk-upc{display:flex;align-items:center;gap:9px;margin:10px 0 2px;padding:9px 12px;border-radius:12px;background:rgba(10,132,255,.07);font-size:12.5px;color:var(--ink);}
.sk-upc b{font-weight:700;}
.sk-cal{display:inline-flex;align-items:center;gap:6px;flex:none;border:0;cursor:pointer;border-radius:980px;padding:6px 13px;font-size:12px;font-weight:700;font-family:'Barlow',sans-serif;color:var(--accent);background:rgba(10,132,255,.12);transition:.13s;}
.sk-cal:hover{background:rgba(10,132,255,.2);}
.sk-ranges{display:inline-flex;gap:2px;background:var(--grouped);border-radius:980px;padding:3px;margin:12px 0 6px;max-width:100%;overflow-x:auto;scrollbar-width:none;}
.sk-ranges::-webkit-scrollbar{display:none;}
.sk-ranges button{border:0;background:none;padding:5px 13px;border-radius:980px;font-weight:700;font-size:12px;color:var(--mut);cursor:pointer;white-space:nowrap;flex:none;font-family:'Barlow',sans-serif;transition:.13s;}
.sk-ranges button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.14);}
.sk-scrub{position:absolute;top:2px;display:flex;flex-direction:column;gap:1px;pointer-events:none;background:rgba(255,255,255,.88);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border-radius:9px;padding:6px 10px;font-size:11px;color:var(--ink);box-shadow:inset 0 0 0 .5px var(--line),0 8px 20px -8px rgba(0,0,0,.2);max-width:188px;}
.sk-scrub b{font-size:13px;}
.sk-scrub span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sk-sech{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);margin:16px 0 6px;}
.sk-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:0 22px;}
.sk-stat{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--line);font-size:12.5px;min-width:0;}
.sk-stat-l{display:inline-flex;align-items:center;gap:5px;color:var(--mut);font-weight:600;white-space:nowrap;}
.sk-stat-v{font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sk-bottom{display:block;max-width:660px;margin-top:4px;}
.sk-news{display:flex;align-items:center;gap:10px;padding:8px 6px;border-radius:9px;cursor:pointer;transition:.12s;border-bottom:1px solid var(--line);}
.sk-news:hover{background:var(--grouped);}
.sk-news:last-of-type{border-bottom:0;}
.sk-news-t{font-size:12.5px;font-weight:700;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.sk-news-s{font-size:11px;color:var(--mut);margin-top:1px;}
.sk-news-r{font-size:12px;font-weight:800;font-family:'Barlow',sans-serif;font-variant-numeric:tabular-nums;flex:none;}
.sc-cmpfloat{position:sticky;bottom:18px;float:right;display:inline-flex;align-items:center;gap:7px;margin-top:8px;
  border:0;cursor:pointer;border-radius:980px;padding:11px 20px;font-size:13.5px;font-weight:800;font-family:'Barlow',sans-serif;color:#fff;
  background:linear-gradient(135deg,rgba(10,132,255,.95),rgba(10,132,255,.82));backdrop-filter:blur(18px) saturate(180%);-webkit-backdrop-filter:blur(18px) saturate(180%);
  box-shadow:0 10px 30px -8px rgba(10,132,255,.55),inset 0 1px 0 rgba(255,255,255,.4);transition:.15s;z-index:60;}
.sc-cmpfloat:hover{transform:translateY(-1px);box-shadow:0 14px 36px -8px rgba(10,132,255,.6),inset 0 1px 0 rgba(255,255,255,.45);}

/* ── compare modal ── */
.sc-cmp-scroll{max-height:72vh;overflow:auto;padding:6px 14px 16px;}
.sc-cmp-table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;}
.sc-cmp-corner{width:150px;}
.sc-cmp-athhead{padding:8px 10px;text-align:center;border-bottom:1px solid var(--line);vertical-align:top;min-width:130px;}
.sc-cmp-rlabel{font-size:12px;color:var(--mut);font-weight:600;padding:9px 10px 9px 4px;white-space:nowrap;border-bottom:1px solid var(--line);position:sticky;left:0;background:var(--card);}
.sc-cmp-cell{font-size:13px;font-weight:700;color:var(--ink);text-align:center;padding:9px 10px;border-bottom:1px solid var(--line);}
.sc-cmp-table tbody tr:last-child .sc-cmp-cell,.sc-cmp-table tbody tr:last-child .sc-cmp-rlabel{border-bottom:0;}

/* ── scout report (screen overlay + print isolation) ── */
.sc-report-root{position:fixed;inset:0;z-index:200;background:rgba(20,28,40,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);overflow:auto;padding:24px 16px;display:flex;justify-content:center;align-items:flex-start;}
.sc-report-sheet{width:100%;max-width:720px;background:#fff;border-radius:14px;box-shadow:0 30px 80px -20px rgba(0,0,0,.5);overflow:hidden;}
.sc-report-bar{display:flex;gap:8px;justify-content:flex-end;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--grouped);}
.sc-report{padding:30px 40px 34px;color:#111;font-family:'Barlow','Inter',system-ui,sans-serif;}
.sc-rep-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:16px;}
.sc-rep-mark{font-family:'Barlow',sans-serif;font-weight:800;font-size:22px;letter-spacing:-.02em;color:#111;}
.sc-rep-kicker{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#555;margin-top:2px;}
.sc-rep-gen{font-size:11px;color:#666;}
.sc-rep-name{font-family:'Barlow',sans-serif;font-weight:800;font-size:26px;line-height:1.1;color:#111;}
.sc-rep-sub{font-size:12.5px;color:#555;margin-top:4px;}
.sc-rep-rating{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;margin:18px 0 6px;padding:12px 0;border-top:1px solid #e2e2e2;border-bottom:1px solid #e2e2e2;}
.sc-rep-big{font-family:'Barlow',sans-serif;font-weight:800;font-size:38px;line-height:1;color:#111;font-variant-numeric:tabular-nums;}
.sc-rep-rd{font-size:13px;color:#777;}
.sc-rep-deltas{display:inline-flex;gap:16px;font-size:12px;color:#666;}
.sc-rep-deltas b{color:#111;font-variant-numeric:tabular-nums;}
.sc-rep-section-h{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#888;margin:22px 0 9px;}
.sc-rep-metrics{display:grid;grid-template-columns:1fr 1fr;gap:0 26px;}
.sc-rep-metric{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid #ededed;font-size:12.5px;}
.sc-rep-mlabel{color:#555;}
.sc-rep-mval{font-weight:700;color:#111;font-variant-numeric:tabular-nums;text-align:right;}
.sc-rep-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.sc-rep-table th{text-align:left;font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#999;padding:0 0 6px;border-bottom:1px solid #ddd;}
.sc-rep-table td{padding:7px 0;border-bottom:1px solid #ededed;color:#222;vertical-align:top;}
.sc-rep-tcls{color:#888;}
.sc-rep-notes{display:flex;flex-direction:column;gap:10px;}
.sc-rep-note{border:1px solid #e4e4e4;border-radius:9px;padding:9px 12px;}
.sc-rep-rubric{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:5px;}
.sc-rep-score{font-size:10.5px;font-weight:700;color:#333;background:#f1f1f1;border-radius:980px;padding:1px 9px;font-family:'Barlow',sans-serif;}
.sc-rep-score b{color:#000;}
.sc-rep-nbody{font-size:12.5px;line-height:1.55;color:#222;white-space:pre-wrap;}
.sc-rep-ndate{font-size:10.5px;color:#999;margin-top:5px;}
.sc-rep-evid{margin:0;padding:0;list-style:none;}
.sc-rep-evid li{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;color:#222;padding:6px 0;border-bottom:1px solid #ededed;}
.sc-rep-edate{color:#999;flex:none;}
.sc-rep-empty{font-size:12.5px;color:#999;padding:2px 0 4px;}
.sc-rep-foot{margin-top:26px;padding-top:12px;border-top:1px solid #ddd;font-size:10.5px;color:#999;text-align:center;letter-spacing:.02em;}

@media(max-width:1080px){
  .sk-stats{grid-template-columns:1fr 1fr;}
  .sk-bottom{grid-template-columns:1fr;}
}
@media(max-width:860px){
  .sc-layout{grid-template-columns:1fr;}
  .sc-side{position:static;}
  .sk-split{grid-template-columns:1fr;}
  .sk-list{position:static;max-height:380px;}
  .sk-stats{grid-template-columns:1fr;}
  .sk-title{font-size:23px;}
  .sk-bigpx{font-size:30px;}
  .sc-rep-metrics{grid-template-columns:1fr;}
  .sc-report{padding:22px 20px 26px;}
}

/* print: isolate the report — hide the whole app, show only the sheet */
@media print{
  body.sc-print-lock>*:not(.sc-report-root){display:none!important;}
  body.sc-print-lock .sc-report-root{display:block!important;position:static!important;background:none!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;padding:0!important;overflow:visible!important;}
  body.sc-print-lock .sc-report-sheet{position:static!important;box-shadow:none!important;border-radius:0!important;max-width:none!important;}
  body.sc-print-lock .sc-report-bar{display:none!important;}
  body.sc-print-lock .sc-report{padding:0 6px!important;}
}
`;
