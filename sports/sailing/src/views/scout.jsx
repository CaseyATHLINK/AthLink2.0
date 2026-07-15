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
  ChevronDown, ChevronRight, StickyNote, Search, ExternalLink, FolderPlus,
  FileText, Printer, Columns3, ArrowUpDown,
  LoaderCircle as Loader2 } from "lucide-react";
import { canonName } from "../util/name.js";
import { dateKey, formatDate } from "../util/date.js";
import { iocFlag } from "../util/flag.js";
import { nuggetFor } from "../util/class.js";
import { aiComplete } from "@athlink/core";
import { ratingEngine, InfoHint } from "./charts.jsx";
import { ConfirmModal } from "./atoms.jsx";
import {
  scoutOwnerId, fetchBinders, createBinder, ensureDefaultBinder, renameBinder, deleteBinder,
  fetchClips, addClip, removeClip,
  fetchNotes, addNote, updateNote, deleteNote,
  logActivity, fetchDigestPrefs, upsertDigestPref,
} from "../data/scout.js";
import {
  athleteIndex, metricsForAthlete, onFire, streaks, radar, beatForecast, digestFor,
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
function Sparkline({history,w=88,h=22}){
  const pts=(history||[]).filter(p=>p&&typeof p.r==="number").slice(-15);
  if(pts.length<2) return <svg width={w} height={h} aria-hidden="true"/>;
  const rs=pts.map(p=>p.r), lo=Math.min(...rs), hi=Math.max(...rs), span=Math.max(1,hi-lo);
  const stepX=w/(pts.length-1);
  const coords=pts.map((p,i)=>[i*stepX,h-2-((p.r-lo)/span)*(h-4)]);
  const d=coords.map(c=>`${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(" ");
  const up=rs[rs.length-1]>=rs[0];
  const col=up?"#2e9e5b":"#c0392b";
  const last=coords[coords.length-1];
  return(
    <svg width={w} height={h} style={{display:"block"}} aria-hidden="true">
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
   SaveButton — bookmark control embedded across the app (result rows, event
   headers, athlete profiles). Self-contained; lazy-loads binders/clips only on
   first interaction so a 100-row event table never fires 100 fetches on mount.
   ════════════════════════════════════════════════════════════════════════ */
export function SaveButton({owner,events,kind="result",athleteKey,eventId,entryId,title,snapshot,size,onSaved}){
  const sm = size==="sm";
  const [ready,setReady]=React.useState(false);      // lazily hydrated once
  const [binders,setBinders]=React.useState([]);
  const [clips,setClips]=React.useState([]);         // this athlete/target's clips
  const [busy,setBusy]=React.useState(false);
  const [open,setOpen]=React.useState(false);        // popover (non-athlete kinds)
  const [newName,setNewName]=React.useState("");
  const wrapRef=React.useRef(null);

  const targetKey = athleteKey?canonName(athleteKey):null;

  // Lazy hydrate binders + existing clips for this target. Idempotent.
  const hydrate=React.useCallback(async()=>{
    const [bs,cs]=await Promise.all([fetchBinders(owner),fetchClips(owner)]);
    setBinders(bs);
    setClips(cs.filter(c=>{
      if(kind==="athlete") return c.kind==="athlete" && canonName(c.athlete_key||"")===targetKey;
      if(eventId!=null) return String(c.event_id)===String(eventId) && (entryId==null||String(c.entry_id)===String(entryId));
      return false;
    }));
    setReady(true);
    return bs;
  },[owner,kind,targetKey,eventId,entryId]);

  // Close popover on outside click.
  React.useEffect(()=>{
    if(!open) return;
    const fn=e=>{ if(wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown",fn);
    return()=>document.removeEventListener("mousedown",fn);
  },[open]);

  const saved = clips.length>0;

  // athlete kind — a single toggle pill (Watch / Watching).
  async function toggleWatch(e){
    e.stopPropagation();
    if(busy) return;
    setBusy(true);
    try{
      let bs = ready?binders:await hydrate();
      if(saved){
        const gone=clips[0];
        setClips([]);                                  // optimistic
        await removeClip(gone.id);
      }else{
        let binderId = bs[0]?.id || null;
        if(!binderId){ const b=await ensureDefaultBinder(owner); binderId=b?.id||null; if(b) setBinders([b]); }
        const optimistic={id:"tmp_"+Date.now(),kind:"athlete",athlete_key:athleteKey,binder_id:binderId};
        setClips([optimistic]);                        // optimistic
        const real=await addClip(owner,binderId,{kind:"athlete",athlete_key:athleteKey,title:title||athleteKey,snapshot:snapshot||{}});
        if(real) setClips([real]);
        logActivity(owner,targetKey,"added_watchlist");
      }
      onSaved&&onSaved();
    }catch{/* silent — bookmarking must never break a row */}
    setBusy(false);
  }

  if(kind==="athlete"){
    const label = saved?"Watching":"Watch";
    const Ic = saved?BookmarkCheck:Bookmark;
    return(
      <button type="button" onClick={toggleWatch} disabled={busy}
        title={saved?"Remove from watchlist":"Add to watchlist"}
        onMouseEnter={()=>{ if(!ready) hydrate(); }}
        style={{display:"inline-flex",alignItems:"center",gap:sm?0:6,padding:sm?"5px 6px":"5px 12px",
          borderRadius:980,cursor:busy?"default":"pointer",border:0,fontWeight:700,fontSize:12.5,
          fontFamily:"'Barlow',sans-serif",transition:".15s",whiteSpace:"nowrap",
          background:saved?"rgba(10,132,255,.16)":"var(--grouped)",
          color:saved?"var(--accent)":"var(--mut)",
          boxShadow:saved?"inset 0 0 0 .5px rgba(10,132,255,.4)":"inset 0 0 0 .5px var(--line)"}}>
        <Ic size={14}/>{!sm&&label}
      </button>
    );
  }

  // non-athlete kinds — icon button opening a binder-picker popover.
  async function onIcon(e){
    e.stopPropagation();
    if(!ready) await hydrate();
    setOpen(o=>!o);
  }
  async function saveTo(binderId){
    if(busy) return;
    setBusy(true);
    try{
      const optimistic={id:"tmp_"+Date.now(),kind,event_id:eventId,entry_id:entryId,binder_id:binderId};
      setClips(c=>[...c,optimistic]);
      const real=await addClip(owner,binderId,{kind,athlete_key:athleteKey,event_id:eventId,entry_id:entryId,title,snapshot:snapshot||{}});
      if(real) setClips(c=>c.map(x=>x===optimistic?real:x));
      if(kind==="result") logActivity(owner,targetKey,"saved_result");
      onSaved&&onSaved();
      setOpen(false);
    }catch{/* silent */}
    setBusy(false);
  }
  async function saveToNew(){
    const nm=newName.trim(); if(!nm) return;
    const b=await createBinder(owner,nm);
    if(b){ setBinders(bs=>[...bs,b]); setNewName(""); saveTo(b.id); }
  }

  const Ic = saved?BookmarkCheck:Bookmark;
  return(
    <span ref={wrapRef} style={{position:"relative",display:"inline-flex"}} onClick={e=>e.stopPropagation()}>
      <button type="button" onClick={onIcon} title={saved?"Saved — manage":"Save to a binder"}
        style={{display:"grid",placeItems:"center",width:sm?26:30,height:sm?26:30,borderRadius:8,
          border:0,cursor:"pointer",transition:".15s",
          background:saved?"rgba(10,132,255,.14)":"transparent",
          color:saved?"var(--accent)":"var(--mut)"}}
        onMouseEnter={e=>{ if(!saved) e.currentTarget.style.background="var(--grouped)"; }}
        onMouseLeave={e=>{ if(!saved) e.currentTarget.style.background="transparent"; }}>
        <Ic size={16}/>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:90,minWidth:200,
          background:"var(--card)",border:"1px solid var(--line)",borderRadius:12,padding:6,
          boxShadow:"0 14px 34px -12px rgba(0,0,0,.28)"}}>
          <div style={{fontSize:10.5,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:"var(--mut)",padding:"5px 8px 3px"}}>Save to</div>
          {binders.length===0&&<div style={{fontSize:12,color:"var(--mut)",padding:"4px 8px 8px"}}>No binders yet — make one below.</div>}
          {binders.map(b=>{
            const inHere=clips.some(c=>String(c.binder_id)===String(b.id));
            return(
              <button key={b.id} type="button" onClick={()=>saveTo(b.id)} disabled={busy||inHere}
                style={{display:"flex",alignItems:"center",gap:8,width:"100%",textAlign:"left",border:0,
                  background:"transparent",borderRadius:8,padding:"7px 8px",cursor:inHere?"default":"pointer",
                  fontSize:13,color:inHere?"var(--accent)":"var(--ink)",transition:".12s"}}
                onMouseEnter={e=>{ if(!inHere) e.currentTarget.style.background="var(--grouped)"; }}
                onMouseLeave={e=>{ e.currentTarget.style.background="transparent"; }}>
                {inHere?<BookmarkCheck size={14}/>:<Bookmark size={14}/>}
                <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</span>
              </button>
            );
          })}
          <div style={{display:"flex",gap:6,padding:"6px 6px 4px",borderTop:"1px solid var(--line)",marginTop:4}}>
            <input value={newName} onChange={e=>setNewName(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter") saveToNew(); }} placeholder="New binder…"
              style={{flex:1,minWidth:0,border:"1px solid var(--line)",borderRadius:7,padding:"5px 8px",
                fontSize:12.5,outline:"none",background:"#fff",color:"var(--ink)"}}/>
            <button type="button" onClick={saveToNew} disabled={!newName.trim()}
              style={{display:"grid",placeItems:"center",width:28,height:28,borderRadius:7,border:0,
                background:"var(--accent)",color:"#fff",cursor:newName.trim()?"pointer":"default",opacity:newName.trim()?1:.5}}>
              <Plus size={15}/>
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

/* HighlightsStrip / PinPicker REMOVED: pinned results now live inline in the
   results lists (App.jsx) — a pin icon on each row + a "Pinned" section at the
   top, backed by the same pinned_results table (data/scout.js pin API). */

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

/* ══════════════════════════════════════════════════════════════════════════
   Athlete detail panel — "The numbers" + notes timeline + AI overview.
   ════════════════════════════════════════════════════════════════════════ */
const RUBRIC=[["starts","Starts"],["speed","Speed"],["handling","Boat handling"],["tactics","Tactics"],["attitude","Attitude"]];

function DetailPanel({owner,events,ratings,name,notes,clips,onClose,onPick,onNotesChanged,aiCache,setAiCache}){
  const spine=React.useMemo(()=>athleteIndex(events).get(canonName(name))||[],[events,name]);
  const face=React.useMemo(()=>athleteFace(spine),[spine]);
  const m=React.useMemo(()=>metricsForAthlete(name,events,ratings),[name,events,ratings]);
  const rec=ratings&&ratings.get?ratings.get(canonName(name)):null;
  const myNotes=React.useMemo(()=>notes.filter(n=>canonName(n.athlete_key||"")===canonName(name)),[notes,name]);
  const [showReport,setShowReport]=React.useState(false);

  // note composer state
  const [body,setBody]=React.useState("");
  const [rubric,setRubric]=React.useState({});
  const [editing,setEditing]=React.useState(null);   // note id being edited
  const [savingNote,setSavingNote]=React.useState(false);

  // AI overview
  const cached=aiCache[canonName(name)];
  const [aiBusy,setAiBusy]=React.useState(false);

  React.useEffect(()=>{ setBody(""); setRubric({}); setEditing(null); },[name]);

  function cycle(k){ setRubric(r=>{ const v=(r[k]||0); const nv=v>=5?0:v+1; const nx={...r}; if(nv===0) delete nx[k]; else nx[k]=nv; return nx; }); }

  async function saveNote(){
    const b=body.trim(); if(!b && !Object.keys(rubric).length) return;
    setSavingNote(true);
    try{
      if(editing){
        await updateNote(editing,{body:b,rubric});
      }else{
        const latestEv=spine.length?spine[spine.length-1].ev.id:null;
        await addNote(owner,{athlete_key:name,event_id:latestEv,body:b,rubric});
      }
      setBody(""); setRubric({}); setEditing(null);
      onNotesChanged&&await onNotesChanged();
    }catch{/* silent */}
    setSavingNote(false);
  }
  function startEdit(n){ setEditing(n.id); setBody(n.body||""); setRubric(n.rubric||{}); }
  async function removeNote(id){ await deleteNote(id); onNotesChanged&&await onNotesChanged(); if(editing===id){setEditing(null);setBody("");setRubric({});} }

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
    <div className="sc-panel sc-detail">
      <div style={{display:"flex",alignItems:"flex-start",gap:10,padding:"14px 16px 10px",borderBottom:"1px solid var(--line)"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span className="sc-link" onClick={()=>onPick&&onPick(name)}
              style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:20,color:"var(--ink)",lineHeight:1.1}}>{face.disp||name}</span>
            {face.nat&&<span style={{fontSize:18,lineHeight:1}}>{iocFlag(face.nat)}</span>}
            {face.classes.slice(0,3).map(c=>{const ng=nuggetFor(c);return <span key={c} style={{background:ng.color,color:"#fff",borderRadius:980,padding:"1px 9px",fontWeight:700,fontSize:11,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>;})}
          </div>
          <div style={{fontSize:11.5,color:"var(--mut)",marginTop:4}}>{m?`${m.events} rated events · ${m.races} races`:"Not enough results yet"}</div>
        </div>
        <button type="button" onClick={()=>setShowReport(true)} title="Open a printable scout report"
          style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:980,border:0,cursor:"pointer",
            fontWeight:700,fontSize:12.5,fontFamily:"'Barlow',sans-serif",whiteSpace:"nowrap",flex:"none",transition:".15s",
            background:"var(--grouped)",color:"var(--navy)",boxShadow:"inset 0 0 0 .5px var(--line)"}}>
          <FileText size={14}/>Report
        </button>
        <SaveButton owner={owner} events={events} kind="athlete" athleteKey={name}/>
        <button type="button" onClick={onClose} title="Close"
          style={{display:"grid",placeItems:"center",width:30,height:30,borderRadius:8,border:0,background:"var(--grouped)",color:"var(--mut)",cursor:"pointer",flex:"none"}}><X size={16}/></button>
      </div>
      {showReport&&(
        <ScoutReport name={name} face={face} m={m} rec={rec} spine={spine}
          notes={myNotes} clips={clips} onClose={()=>setShowReport(false)}/>
      )}

      <div className="sc-detail-grid">
        {/* LEFT — the numbers */}
        <div style={{padding:"12px 16px",borderRight:"1px solid var(--line)"}}>
          <div style={{fontSize:10.5,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",color:"var(--mut)",marginBottom:8}}>The numbers</div>
          <div style={{display:"flex",alignItems:"baseline",gap:10,marginBottom:10,flexWrap:"wrap"}}>
            <span style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:26,color:"var(--navy)",fontVariantNumeric:"tabular-nums"}}>{fmtR(m?.ratingNow)}</span>
            {m?.rd!=null&&<span style={{fontSize:12,color:"var(--mut)"}}>±{Math.round(m.rd)}</span>}
            <span style={{display:"inline-flex",gap:10,alignItems:"center",marginLeft:"auto",fontSize:11.5}}>
              <span style={{color:"var(--mut)"}}>30d <DeltaChip d={m?.delta30}/></span>
              <span style={{color:"var(--mut)"}}>90d <DeltaChip d={m?.delta90}/></span>
              <span style={{color:"var(--mut)"}}>1y <DeltaChip d={m?.delta365}/></span>
            </span>
          </div>
          {METRIC_ROWS.map(row=>(
            <StatRow key={row.key} label={row.label} hint={METRIC_HINTS[row.key]}
              value={row.value(m)} tone={row.tone(m)}/>
          ))}

          {/* AI overview */}
          <div style={{marginTop:14,paddingTop:12,borderTop:"1px solid var(--line)"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <Sparkles size={13} color="var(--accent)"/>
              <span style={{fontSize:10.5,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",color:"var(--mut)"}}>AI overview</span>
            </div>
            {cached
              ? <p style={{margin:0,fontSize:12.5,lineHeight:1.6,color:"var(--ink)"}}>{cached}</p>
              : <button type="button" className="btn ghost" style={{fontSize:12.5,padding:"7px 14px"}} onClick={runAI} disabled={aiBusy}>
                  {aiBusy?<Loader2 size={14} className="sc-spin"/>:<Sparkles size={14}/>}{aiBusy?"Thinking…":"Summarise this athlete"}
                </button>}
            {cached&&<button type="button" onClick={runAI} disabled={aiBusy} style={{marginTop:8,border:0,background:"none",color:"var(--accent)",fontSize:11.5,fontWeight:700,cursor:"pointer",padding:0}}>{aiBusy?"Thinking…":"Regenerate"}</button>}
          </div>
        </div>

        {/* RIGHT — notes */}
        <div style={{padding:"12px 16px",minWidth:0}}>
          <div style={{fontSize:10.5,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",color:"var(--mut)",marginBottom:8}}>Notes</div>
          <div style={{background:"var(--grouped)",borderRadius:12,padding:"10px 12px",marginBottom:12}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
              {RUBRIC.map(([k,label])=>{
                const v=rubric[k]||0;
                return(
                  <button key={k} type="button" onClick={()=>cycle(k)} title="Tap to score 1–5"
                    style={{display:"inline-flex",alignItems:"center",gap:5,border:0,cursor:"pointer",borderRadius:980,
                      padding:"3px 9px",fontSize:11,fontWeight:700,fontFamily:"'Barlow',sans-serif",transition:".12s",
                      background:v?"var(--accent)":"rgba(255,255,255,.7)",color:v?"#fff":"var(--mut)",
                      boxShadow:v?"none":"inset 0 0 0 .5px var(--line)"}}>
                    {label}{v?<span style={{fontVariantNumeric:"tabular-nums"}}>{v}</span>:""}
                  </button>
                );
              })}
            </div>
            <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder={editing?"Edit note…":"Add a scouting note…"}
              rows={3} style={{width:"100%",resize:"vertical",border:"1px solid var(--line)",borderRadius:9,padding:"8px 10px",
                fontSize:13,lineHeight:1.5,outline:"none",background:"#fff",color:"var(--ink)",fontFamily:"inherit"}}/>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:8}}>
              {editing&&<button type="button" className="btn ghost" style={{fontSize:12,padding:"6px 12px"}} onClick={()=>{setEditing(null);setBody("");setRubric({});}}>Cancel</button>}
              <button type="button" className="btn cta" style={{fontSize:12.5,padding:"7px 15px"}} onClick={saveNote} disabled={savingNote||(!body.trim()&&!Object.keys(rubric).length)}>
                {savingNote?<Loader2 size={14} className="sc-spin"/>:<Check size={14}/>}{editing?"Save":"Add note"}
              </button>
            </div>
          </div>

          {myNotes.length===0
            ? <p style={{fontSize:12.5,color:"var(--mut)",lineHeight:1.5,margin:"6px 2px"}}>No notes yet. Score the rubric and jot what you see — it stays private to you.</p>
            : <div style={{display:"flex",flexDirection:"column",gap:9}}>
                {myNotes.map(n=>(
                  <div key={n.id} style={{background:"#fff",border:"1px solid var(--line)",borderRadius:11,padding:"10px 12px"}}>
                    {n.rubric&&Object.keys(n.rubric).length>0&&(
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:6}}>
                        {RUBRIC.filter(([k])=>n.rubric[k]).map(([k,label])=>(
                          <span key={k} style={{display:"inline-flex",gap:4,alignItems:"center",background:"var(--grouped)",borderRadius:980,padding:"1px 8px",fontSize:10.5,fontWeight:700,color:"var(--navy)",fontFamily:"'Barlow',sans-serif"}}>
                            {label}<b style={{color:"var(--accent)",fontVariantNumeric:"tabular-nums"}}>{n.rubric[k]}</b>
                          </span>
                        ))}
                      </div>
                    )}
                    {n.body&&<p style={{margin:0,fontSize:13,lineHeight:1.55,color:"var(--ink)",whiteSpace:"pre-wrap"}}>{n.body}</p>}
                    <div style={{display:"flex",alignItems:"center",gap:10,marginTop:7,fontSize:11,color:"var(--mut)"}}>
                      <span>{n.created_at?formatDate(new Date(n.created_at).toLocaleDateString("en-GB")):""}</span>
                      <span style={{flex:1}}/>
                      <button type="button" onClick={()=>startEdit(n)} title="Edit" style={{border:0,background:"none",color:"var(--mut)",cursor:"pointer",display:"inline-flex",padding:2}}><Pencil size={13}/></button>
                      <button type="button" onClick={()=>removeNote(n.id)} title="Delete" style={{border:0,background:"none",color:"#c0392b",cursor:"pointer",display:"inline-flex",padding:2}}><Trash2 size={13}/></button>
                    </div>
                  </div>
                ))}
              </div>}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Watchlist tab — athlete cards for kind='athlete' clips + clippings list.
   ════════════════════════════════════════════════════════════════════════ */
function AthleteCard({owner,events,ratings,clip,note,onOpenDetail,onPick,onRemove,
  compareMode,selected,onToggleSelect,selectDisabled}){
  const name=clip.athlete_key||clip.title||"";
  const spine=React.useMemo(()=>athleteIndex(events).get(canonName(name))||[],[events,name]);
  const face=React.useMemo(()=>athleteFace(spine),[spine]);
  const rec=ratings&&ratings.get?ratings.get(canonName(name)):null;
  const m=React.useMemo(()=>metricsForAthlete(name,events,ratings),[name,events,ratings]);
  const evidence=spine.length;

  const clickCard=compareMode?(()=>{ if(!selectDisabled||selected) onToggleSelect(name); }):undefined;
  return(
    <div className={"sc-card"+(compareMode?" sc-card-sel":"")+(selected?" on":"")}
      onClick={clickCard} style={compareMode?{cursor:(selectDisabled&&!selected)?"default":"pointer"}:undefined}>
      {compareMode&&(
        <span className="sc-cbx" aria-hidden="true"
          style={{background:selected?"var(--accent)":"#fff",borderColor:selected?"var(--accent)":"var(--line)",
            opacity:(selectDisabled&&!selected)?.4:1}}>
          {selected&&<Check size={12} color="#fff"/>}
        </span>
      )}
      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <span className={compareMode?"":"sc-link"} onClick={compareMode?undefined:(()=>onOpenDetail(name))}
            style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:16,color:"var(--ink)",lineHeight:1.15,display:"inline-flex",alignItems:"center",gap:7}}>
            <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{face.disp||name}</span>
            {face.nat&&<span style={{fontSize:15,lineHeight:1,flex:"none"}}>{iocFlag(face.nat)}</span>}
          </span>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5}}>
            {face.classes.slice(0,3).map(c=>{const ng=nuggetFor(c);return <span key={c} style={{background:ng.color,color:"#fff",borderRadius:980,padding:"1px 8px",fontWeight:700,fontSize:10,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>;})}
          </div>
        </div>
        <button type="button" onClick={e=>{e.stopPropagation();onRemove(clip);}} title="Remove from binder"
          style={{border:0,background:"none",color:"var(--mut)",cursor:"pointer",padding:3,flex:"none"}}
          onMouseEnter={e=>e.currentTarget.style.color="#c0392b"} onMouseLeave={e=>e.currentTarget.style.color="var(--mut)"}><X size={15}/></button>
      </div>

      <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10}}>
        <span style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:20,color:"var(--navy)",fontVariantNumeric:"tabular-nums"}}>{fmtR(m?.ratingNow)}</span>
        <DeltaChip d={m?.delta30}/>
        <span style={{marginLeft:"auto"}}><Sparkline history={rec?.history}/></span>
      </div>

      {note?.body&&(
        <div style={{marginTop:9,display:"flex",gap:6,fontSize:11.5,color:"var(--mut)",lineHeight:1.4}}>
          <StickyNote size={12} style={{flex:"none",marginTop:1}}/>
          <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{note.body}</span>
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:11,paddingTop:9,borderTop:"1px solid var(--line)"}}>
        <span style={{fontSize:11,color:"var(--mut)",fontWeight:600}}>{evidence} event{evidence===1?"":"s"} of evidence</span>
        <span style={{flex:1}}/>
        <button type="button" className="sc-minibtn" disabled={compareMode} style={compareMode?{opacity:.4,pointerEvents:"none"}:undefined} onClick={e=>{e.stopPropagation();onOpenDetail(name);}}><StickyNote size={12}/>Notes</button>
        <button type="button" className="sc-minibtn" disabled={compareMode} style={compareMode?{opacity:.4,pointerEvents:"none"}:undefined} onClick={e=>{e.stopPropagation();onPick(name);}}><ExternalLink size={12}/>Profile</button>
      </div>
    </div>
  );
}

// A clippings row for non-athlete clips (result/event/upcoming/link).
function ClippingRow({clip,events,onOpenEvent,onRemove}){
  const evById=React.useMemo(()=>{const m=new Map();(events||[]).forEach(e=>m.set(String(e.id),e));return m;},[events]);
  const ev=clip.event_id!=null?evById.get(String(clip.event_id)):null;
  const snap=clip.snapshot||{};
  const title=clip.title||ev?.name||snap.evName||snap.title||(clip.kind==="link"?clip.url:"Saved item");
  const date=ev?.date||snap.evDate||null;
  const kindLabel={result:"Result",event:"Event",upcoming:"Upcoming",link:"Link",snapshot:"Snapshot"}[clip.kind]||"Clip";
  const open=()=>{
    if(clip.url){ window.open(clip.url,"_blank","noopener"); return; }
    if(clip.event_id!=null&&onOpenEvent) onOpenEvent(clip.event_id);
  };
  const canOpen=clip.url||clip.event_id!=null;
  return(
    <div className="sc-cliprow">
      <span style={{fontSize:9.5,fontWeight:800,letterSpacing:".05em",textTransform:"uppercase",color:"var(--accent)",flex:"none",width:64}}>{kindLabel}</span>
      <span className={canOpen?"sc-link":""} onClick={canOpen?open:undefined}
        style={{flex:1,minWidth:0,fontSize:13,fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</span>
      {date&&<span style={{fontSize:11.5,color:"var(--mut)",flex:"none"}}>{formatDate(date)}</span>}
      {clip.url&&<ExternalLink size={13} color="var(--mut)" style={{flex:"none"}}/>}
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
function ScoutReport({name,face,m,rec,spine,notes,clips,onClose}){
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

          {/* scout notes */}
          <div className="sc-rep-section-h">Scout notes</div>
          {notes.length===0
            ? <div className="sc-rep-empty">No notes recorded.</div>
            : <div className="sc-rep-notes">
                {notes.map(n=>(
                  <div key={n.id} className="sc-rep-note">
                    {n.rubric&&Object.keys(n.rubric).length>0&&(
                      <div className="sc-rep-rubric">
                        {RUBRIC.filter(([k])=>n.rubric[k]).map(([k,label])=>(
                          <span key={k} className="sc-rep-score">{label} <b>{n.rubric[k]}</b></span>
                        ))}
                      </div>
                    )}
                    {n.body&&<div className="sc-rep-nbody">{n.body}</div>}
                    {n.created_at&&<div className="sc-rep-ndate">{formatDate(new Date(n.created_at).toLocaleDateString("en-GB"))}</div>}
                  </div>
                ))}
              </div>}

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
export default function ScoutPortal({events,auth,onPick,onOpenEvent,hostById}){
  const owner=React.useMemo(()=>scoutOwnerId(auth),[auth]);
  const ratings=React.useMemo(()=>ratingEngine.getAthleteRatings(events),[events]);

  const [bump,setBump]=React.useState(0);            // re-fetch trigger
  const [binders,setBinders]=React.useState([]);
  const [clips,setClips]=React.useState([]);
  const [notes,setNotes]=React.useState([]);
  const [digestPrefs,setDigestPrefs]=React.useState([]);
  const [loading,setLoading]=React.useState(true);

  const [tab,setTab]=React.useState("watchlist");    // watchlist | discover | week
  const [selBinder,setSelBinder]=React.useState("all"); // "all" | binder id
  const [detailName,setDetailName]=React.useState(null);
  const [aiCache,setAiCache]=React.useState({});
  const [sortMode,setSortMode]=React.useState(()=>{ try{return localStorage.getItem("sc-sort")||"movers";}catch{return "movers";} });
  const [compareMode,setCompareMode]=React.useState(false);
  const [compareSel,setCompareSel]=React.useState([]);   // canon keys? no — display names
  const [showCompare,setShowCompare]=React.useState(false);
  React.useEffect(()=>{ try{localStorage.setItem("sc-sort",sortMode);}catch{} },[sortMode]);
  const [confirm,setConfirm]=React.useState(null);
  const [newBinder,setNewBinder]=React.useState("");
  const [renaming,setRenaming]=React.useState(null); // {id,name}

  const reload=React.useCallback(async()=>{
    const [bs,cs,ns,dp]=await Promise.all([fetchBinders(owner),fetchClips(owner),fetchNotes(owner),fetchDigestPrefs(owner)]);
    setBinders(bs); setClips(cs); setNotes(ns); setDigestPrefs(dp); setLoading(false);
  },[owner]);
  React.useEffect(()=>{ setLoading(true); reload(); },[reload,bump]);

  // clip → its display athlete key; count athlete clips per binder for sidebar.
  const athClips=clips.filter(c=>c.kind==="athlete");
  const countFor=id=>athClips.filter(c=>id==="all"?true:String(c.binder_id)===String(id)).length;

  // clips for the selected binder
  const binderClips=clips.filter(c=>selBinder==="all"?true:String(c.binder_id)===String(selBinder));
  const clippings=binderClips.filter(c=>c.kind!=="athlete");
  // watched athletes, ordered by the chosen sort. "Movers" = |30-day rating
  // move| desc (biggest swing first); "Recent" = most-recently added; "A–Z".
  const watchAthletes=React.useMemo(()=>{
    const list=binderClips.filter(c=>c.kind==="athlete");
    const nameOf=c=>{const spine=athleteIndex(events).get(canonName(c.athlete_key||c.title||""))||[];return (athleteFace(spine).disp||c.athlete_key||c.title||"").toLowerCase();};
    const d30Of=c=>{const m=metricsForAthlete(c.athlete_key||c.title||"",events,ratings);return m?.delta30??0;};
    const addedAt=c=>{const t=c.created_at?Date.parse(c.created_at):NaN;return Number.isNaN(t)?0:t;};
    const arr=[...list];
    if(sortMode==="az") arr.sort((a,b)=>nameOf(a).localeCompare(nameOf(b)));
    else if(sortMode==="recent") arr.sort((a,b)=>addedAt(b)-addedAt(a));
    else arr.sort((a,b)=>Math.abs(d30Of(b))-Math.abs(d30Of(a))); // movers
    return arr;
  },[binderClips,sortMode,events,ratings]);
  // latest note per athlete
  const latestNote=name=>{const k=canonName(name);return notes.find(n=>canonName(n.athlete_key||"")===k)||null;};
  // every watched athlete (across all binders) as canon keys — used by discovery watch state + digest
  const watchedKeys=React.useMemo(()=>new Set(athClips.map(c=>canonName(c.athlete_key||"")).filter(Boolean)),[athClips]);

  async function makeBinder(){
    const nm=newBinder.trim(); if(!nm) return;
    const b=await createBinder(owner,nm);
    if(b){ setBinders(bs=>[...bs,b]); setNewBinder(""); setSelBinder(b.id); }
  }
  async function doRename(){
    if(!renaming||!renaming.name.trim()) return;
    await renameBinder(renaming.id,renaming.name.trim());
    setRenaming(null); setBump(b=>b+1);
  }
  function askDelete(b){
    setConfirm({title:"Delete binder?",message:`"${b.name}" and its saved items will be removed. This can't be undone.`,confirmLabel:"Delete binder",
      onConfirm:async()=>{ await deleteBinder(b.id); if(String(selBinder)===String(b.id)) setSelBinder("all"); setBump(x=>x+1); }});
  }
  async function removeAthlete(clip){ setClips(cs=>cs.filter(c=>c.id!==clip.id)); await removeClip(clip.id); }

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

  /* ── digest / this-week ── */
  const sinceDk=React.useMemo(()=>{
    // latest dk across all events minus 7 days
    let latest=""; (events||[]).forEach(ev=>{const dk=dateKey(ev.date); if(dk&&dk>latest) latest=dk;});
    if(!latest) return "";
    const y=+latest.slice(0,4),mo=+latest.slice(4,6)-1,d=+latest.slice(6,8);
    const t=new Date(Date.UTC(y,mo,d)); t.setUTCDate(t.getUTCDate()-7);
    return `${t.getUTCFullYear()}${String(t.getUTCMonth()+1).padStart(2,"0")}${String(t.getUTCDate()).padStart(2,"0")}`;
  },[events]);
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

  const refreshNotes=React.useCallback(async()=>{ const ns=await fetchNotes(owner); setNotes(ns); },[owner]);

  const TABS=[["watchlist","Watchlist"],["discover","Discover"],["week","This week"]];

  return(
    <div className="wrap sec" style={{paddingTop:16}}>
      <style>{SCOUT_CSS}</style>

      {/* page header */}
      <div style={{display:"flex",alignItems:"center",gap:11,margin:"4px 0 16px"}}>
        <div style={{display:"grid",placeItems:"center",width:40,height:40,borderRadius:12,background:"var(--sky)",color:"var(--navy)",flex:"none"}}>
          <Telescope size={22}/>
        </div>
        <div>
          <h2 className="page-title" style={{fontSize:26}}>Scout</h2>
          <p className="page-sub" style={{margin:"2px 0 0"}}>Your private watchlist, notes and results-only talent radar.</p>
        </div>
      </div>

      <div className="sc-layout">
        {/* ── sidebar: binders ── */}
        <aside className="sc-side">
          <div className="sc-panel" style={{padding:"8px 8px 10px"}}>
            <div style={{fontSize:10.5,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",color:"var(--mut)",padding:"6px 8px 8px"}}>Binders</div>
            <button type="button" className={"sc-binder"+(selBinder==="all"?" on":"")} onClick={()=>setSelBinder("all")}>
              <Bookmark size={14}/><span style={{flex:1,textAlign:"left"}}>All watched</span><span className="sc-count">{countFor("all")}</span>
            </button>
            {binders.map(b=>(
              <div key={b.id} className="sc-binder-wrap">
                {renaming&&renaming.id===b.id
                  ? <div style={{display:"flex",gap:5,padding:"3px 6px",width:"100%"}}>
                      <input autoFocus value={renaming.name} onChange={e=>setRenaming(r=>({...r,name:e.target.value}))}
                        onKeyDown={e=>{if(e.key==="Enter")doRename();if(e.key==="Escape")setRenaming(null);}}
                        style={{flex:1,minWidth:0,border:"1px solid var(--accent)",borderRadius:7,padding:"4px 7px",fontSize:12.5,outline:"none",background:"#fff",color:"var(--ink)"}}/>
                      <button type="button" onClick={doRename} style={{border:0,background:"var(--accent)",color:"#fff",borderRadius:6,width:26,display:"grid",placeItems:"center",cursor:"pointer"}}><Check size={13}/></button>
                    </div>
                  : <>
                      <button type="button" className={"sc-binder"+(String(selBinder)===String(b.id)?" on":"")} onClick={()=>setSelBinder(b.id)}>
                        <Bookmark size={14}/><span style={{flex:1,textAlign:"left",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</span>
                        <span className="sc-count">{countFor(b.id)}</span>
                      </button>
                      <div className="sc-binder-actions">
                        <button type="button" title="Rename" onClick={()=>setRenaming({id:b.id,name:b.name})}><Pencil size={12}/></button>
                        <button type="button" title="Delete" onClick={()=>askDelete(b)}><Trash2 size={12}/></button>
                      </div>
                    </>}
              </div>
            ))}
            <div style={{display:"flex",gap:5,padding:"8px 6px 2px",marginTop:4,borderTop:"1px solid var(--line)"}}>
              <input value={newBinder} onChange={e=>setNewBinder(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")makeBinder();}} placeholder="New binder…"
                style={{flex:1,minWidth:0,border:"1px solid var(--line)",borderRadius:7,padding:"6px 8px",fontSize:12.5,outline:"none",background:"#fff",color:"var(--ink)"}}/>
              <button type="button" onClick={makeBinder} disabled={!newBinder.trim()} title="Create binder"
                style={{display:"grid",placeItems:"center",width:30,flex:"none",borderRadius:7,border:0,background:"var(--accent)",color:"#fff",cursor:newBinder.trim()?"pointer":"default",opacity:newBinder.trim()?1:.5}}><FolderPlus size={15}/></button>
            </div>
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
              {/* ============ WATCHLIST ============ */}
              {tab==="watchlist"&&(
                <>
                  {detailName&&(
                    <DetailPanel owner={owner} events={events} ratings={ratings} name={detailName} notes={notes} clips={clips}
                      onClose={()=>setDetailName(null)} onPick={onPick} onNotesChanged={refreshNotes}
                      aiCache={aiCache} setAiCache={setAiCache}/>
                  )}
                  {watchAthletes.length===0&&clippings.length===0
                    ? <EmptyWatchlist/>
                    : <>
                        {watchAthletes.length>0&&(
                          <>
                            {/* toolbar: sort + compare */}
                            <div className="sc-wtools">
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
                            <div className="sc-cardgrid" style={{marginBottom:clippings.length?16:0}}>
                              {watchAthletes.map(clip=>{
                                const nm=clip.athlete_key||clip.title||"";
                                const sel=compareSel.includes(nm);
                                return(
                                  <AthleteCard key={clip.id} owner={owner} events={events} ratings={ratings} clip={clip}
                                    note={latestNote(clip.athlete_key)} onOpenDetail={setDetailName} onPick={onPick} onRemove={removeAthlete}
                                    compareMode={compareMode} selected={sel} selectDisabled={compareSel.length>=3}
                                    onToggleSelect={n=>setCompareSel(s=>s.includes(n)?s.filter(x=>x!==n):(s.length>=3?s:[...s,n]))}/>
                                );
                              })}
                            </div>
                          </>
                        )}
                        {clippings.length>0&&(
                          <div className="sc-panel" style={{padding:"6px 8px 8px"}}>
                            <div style={{fontSize:10.5,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",color:"var(--mut)",padding:"7px 8px"}}>Clippings</div>
                            {clippings.map(clip=>(
                              <ClippingRow key={clip.id} clip={clip} events={events} onOpenEvent={onOpenEvent}
                                onRemove={async(c)=>{setClips(cs=>cs.filter(x=>x.id!==c.id));await removeClip(c.id);}}/>
                            ))}
                          </div>
                        )}
                      </>}

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

              {/* ============ THIS WEEK ============ */}
              {tab==="week"&&(
                <>
                  <div className="sc-panel" style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",marginBottom:12,flexWrap:"wrap"}}>
                    <CalendarClock size={16} color="var(--accent)"/>
                    <span style={{fontWeight:800,fontSize:14}}>Your digest</span>
                    <span style={{flex:1,fontSize:11.5,color:"var(--mut)"}}>Email delivery coming — this inbox always has the latest.</span>
                    <div className="seg sc-freq">
                      {[["weekly","Weekly"],["daily","Daily"]].map(([id,label])=>(
                        <button key={id} className={curFreq===id?"on":""} onClick={()=>setFreq(id)}>{label}</button>
                      ))}
                    </div>
                  </div>

                  {watchedKeys.size===0
                    ? <div className="sc-panel" style={{padding:"32px 20px",textAlign:"center",color:"var(--mut)"}}>
                        <CalendarClock size={26} style={{opacity:.5}}/>
                        <p style={{margin:"10px 0 0",fontSize:13.5,lineHeight:1.5,maxWidth:360,marginInline:"auto"}}>Watch a few athletes and their new results, upcoming races and rating moves will land here.</p>
                      </div>
                    : <>
                        <Section icon={Sparkles} title="New results" count={digest.newResults.length} hint="Results for your watched athletes that landed in the last 7 days of the dataset.">
                          {digest.newResults.length===0?<Muted>No new results this week.</Muted>:digest.newResults.map((r,i)=>(
                            <div key={i} className="sc-drow sc-link" onClick={()=>onOpenEvent&&onOpenEvent(r.evId)}>
                              <span style={{fontWeight:700,fontSize:13.5,color:"var(--ink)",flex:"none",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</span>
                              <span style={{flex:1,minWidth:0,fontSize:12,color:"var(--mut)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.evName}</span>
                              <span style={{fontSize:12,fontWeight:700,color:"var(--navy)",fontVariantNumeric:"tabular-nums",flex:"none"}}>{r.rank}{r.fleet?`/${r.fleet}`:""}</span>
                              <span style={{flex:"none"}}><DeltaChip d={r.delta}/></span>
                            </div>
                          ))}
                        </Section>
                        <Section icon={CalendarClock} title="Racing next" count={digest.upcoming.length} hint="Upcoming entry lists your watched athletes appear on.">
                          {digest.upcoming.length===0?<Muted>None of your watched athletes have an upcoming entry.</Muted>:digest.upcoming.map((r,i)=>(
                            <div key={i} className="sc-drow sc-link" onClick={()=>onOpenEvent&&onOpenEvent(r.evId)}>
                              <span style={{fontWeight:700,fontSize:13.5,color:"var(--ink)",flex:"none",maxWidth:150,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.name}</span>
                              <span style={{flex:1,minWidth:0,fontSize:12,color:"var(--mut)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.evName}</span>
                              <span style={{fontSize:11.5,color:"var(--mut)",flex:"none"}}>{r.dk?formatDate(`${+r.dk.slice(6,8)}/${+r.dk.slice(4,6)}/${r.dk.slice(0,4)}`):""}</span>
                            </div>
                          ))}
                        </Section>
                        <Section icon={TrendingUp} title="Movers" count={digest.movers.length} hint="Your watched athletes' 30-day rating moves, biggest swing first.">
                          {digest.movers.length===0?<Muted>No rating moves in the last month.</Muted>:digest.movers.map((r,i)=>(
                            <DiscoverRow key={i} owner={owner} events={events} nat={null} name={r.name} onPick={onPick} onSaved={()=>setBump(b=>b+1)}>
                              <DeltaChip d={r.delta30}/><span style={{fontSize:11.5,color:"var(--mut)"}}>over 30 days</span>
                            </DiscoverRow>
                          ))}
                        </Section>
                      </>}
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
.sc-binder-wrap{position:relative;display:flex;align-items:center;}
.sc-binder{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;border-radius:9px;padding:7px 9px;font-size:13px;font-weight:600;color:var(--mut);cursor:pointer;transition:.13s;font-family:inherit;}
.sc-binder:hover{background:var(--grouped);color:var(--navy);}
.sc-binder.on{background:rgba(10,132,255,.12);color:var(--navy);box-shadow:inset 0 0 0 .5px rgba(10,132,255,.28);}
.sc-binder-wrap:hover .sc-binder-actions{opacity:1;}
.sc-binder-actions{position:absolute;right:6px;display:flex;gap:2px;opacity:0;transition:.13s;pointer-events:auto;}
.sc-binder-actions button{border:0;background:rgba(255,255,255,.85);color:var(--mut);width:22px;height:22px;border-radius:6px;display:grid;place-items:center;cursor:pointer;transition:.12s;}
.sc-binder-actions button:hover{color:var(--navy);background:#fff;}
.sc-count{font-size:11px;font-weight:800;color:var(--mut);font-variant-numeric:tabular-nums;background:var(--grouped);border-radius:980px;padding:1px 7px;min-width:20px;text-align:center;flex:none;}
.sc-tabs{background:var(--grouped);border-radius:980px;padding:3px;display:inline-flex;}
.sc-freq{background:var(--grouped);border-radius:980px;padding:2px;display:inline-flex;flex:none;}
.sc-freq button{padding:5px 14px;font-size:12px;}
.sc-sechead{display:flex;align-items:center;gap:8px;width:100%;border:0;background:none;padding:11px 12px;cursor:pointer;color:var(--ink);font-family:inherit;transition:.12s;border-radius:16px;}
.sc-sechead:hover{background:rgba(10,132,255,.04);}
.sc-cardgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(248px,1fr));gap:12px;}
.sc-card{background:rgba(255,255,255,.9);border-radius:15px;padding:14px 15px;box-shadow:inset 0 0 0 .5px var(--line),0 1px 2px rgba(0,0,0,.05);transition:box-shadow .15s,transform .15s;}
.sc-card:hover{box-shadow:inset 0 0 0 .5px rgba(10,132,255,.35),0 8px 22px -10px rgba(0,0,0,.18);transform:translateY(-1px);}
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
.sc-detail{margin-bottom:16px;overflow:hidden;}
.sc-detail-grid{display:grid;grid-template-columns:1fr 1fr;}
.sc-spin{animation:sc-rot 1s linear infinite;}
@keyframes sc-rot{to{transform:rotate(360deg);}}

/* ── watchlist toolbar: sort + compare ── */
.sc-wtools{display:flex;align-items:center;gap:10px;margin:0 0 12px;flex-wrap:wrap;}
.sc-sortseg{background:var(--grouped);border-radius:980px;padding:2px;display:inline-flex;}
.sc-sortseg button{padding:5px 13px;font-size:12px;}
.sc-cmpbtn{display:inline-flex;align-items:center;gap:6px;border:0;background:var(--grouped);color:var(--mut);border-radius:980px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;transition:.13s;font-family:'Barlow',sans-serif;box-shadow:inset 0 0 0 .5px var(--line);}
.sc-cmpbtn:hover{color:var(--accent);}
.sc-cmpbtn.on{background:rgba(10,132,255,.16);color:var(--accent);box-shadow:inset 0 0 0 .5px rgba(10,132,255,.4);}
.sc-card-sel{position:relative;}
.sc-card-sel.on{box-shadow:inset 0 0 0 1.5px var(--accent),0 8px 22px -10px rgba(0,0,0,.18);}
.sc-cbx{position:absolute;top:11px;right:12px;width:20px;height:20px;border-radius:6px;border:1.5px solid var(--line);display:grid;place-items:center;transition:.12s;z-index:2;}
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

@media(max-width:860px){
  .sc-layout{grid-template-columns:1fr;}
  .sc-side{position:static;}
  .sc-detail-grid{grid-template-columns:1fr;}
  .sc-detail-grid>div{border-right:0!important;border-bottom:1px solid var(--line);}
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
