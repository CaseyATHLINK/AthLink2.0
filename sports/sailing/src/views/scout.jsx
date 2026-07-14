/* Scout portal — a scout's private workspace over the public results data:
   watchlist binders, saved clips, scouting notes + rubric, results-only
   discovery (on fire / streaks / beat-the-forecast / on the radar) and a weekly
   digest inbox. Plus two shared controls the rest of the app embeds: SaveButton
   (bookmark a result/event/athlete) and HighlightsStrip (public pinned results).

   Data layer: data/scout.js (Supabase CRUD, all failure-tolerant) + the pure
   analytics in data/scoutMetrics.js. Ratings come from the shared engine in
   charts.jsx (getAthleteRatings) — computed once here and threaded down. Light
   theme, App.jsx CSS classes + inline styles; all local classes namespaced
   `sc-` and injected via one <style> block so nothing collides with App.jsx. */

import React from "react";
import { Telescope, Bookmark, BookmarkCheck, Plus, X, Trash2, Pencil, Check,
  Flame, ListChecks, CalendarClock, Sparkles, Radar, TrendingUp, TrendingDown,
  ChevronDown, ChevronRight, StickyNote, Pin, Search, ExternalLink, FolderPlus,
  LoaderCircle as Loader2 } from "lucide-react";
import { canonName } from "../util/name.js";
import { dateKey, formatDate } from "../util/date.js";
import { iocFlag } from "../util/flag.js";
import { nuggetFor } from "../util/class.js";
import { aiComplete } from "@athlink/core";
import { ratingEngine, InfoHint } from "./charts.jsx";
import { ConfirmModal } from "./atoms.jsx";
import {
  scoutOwnerId, fetchBinders, createBinder, renameBinder, deleteBinder,
  fetchClips, addClip, removeClip,
  fetchNotes, addNote, updateNote, deleteNote,
  fetchPins, setPin, clearPin,
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
        if(!binderId){ const b=await createBinder(owner,"My watchlist"); binderId=b?.id||null; if(b) setBinders([b]); }
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

/* ══════════════════════════════════════════════════════════════════════════
   HighlightsStrip — public "Result Highlights" (max 3 pins) for athlete + host
   pages. Read-only for visitors; owner sees empty "+ Pin" slots and a picker.
   ════════════════════════════════════════════════════════════════════════ */
export function HighlightsStrip({ownerKind,ownerKey,events,canEdit,onOpenEvent}){
  const [pins,setPins]=React.useState(null);         // null = loading
  const [picker,setPicker]=React.useState(null);     // slot index being filled
  const evById=React.useMemo(()=>{const m=new Map();(events||[]).forEach(e=>m.set(String(e.id),e));return m;},[events]);

  React.useEffect(()=>{
    let alive=true;
    fetchPins(ownerKind,ownerKey).then(p=>{ if(alive) setPins(p||[]); });
    return()=>{alive=false;};
  },[ownerKind,ownerKey]);

  if(pins===null) return null;
  const hasAny=pins.length>0;
  if(!hasAny && !canEdit) return null;                // visitors see nothing when empty

  const bySlot=new Map(pins.map(p=>[p.sort_order,p]));
  const slots=[0,1,2];

  // Resolve a pin to display data: prefer the live event, fall back to snapshot.
  function resolve(pin){
    const ev=pin.event_id!=null?evById.get(String(pin.event_id)):null;
    const snap=pin.snapshot||{};
    if(ev){
      // entry-scoped (athlete) pin carries a rank in the snapshot; host pins omit it
      return {evName:ev.name, evDate:ev.date, cls:ev.cls, subclass:ev.subclass,
        rank:snap.rank??null, fleet:snap.fleet??(ev.entries||[]).length, venue:ev.country||snap.venue||null, evId:ev.id};
    }
    return {evName:snap.evName||"Result", evDate:snap.evDate||null, cls:snap.cls||null, subclass:snap.subclass||null,
      rank:snap.rank??null, fleet:snap.fleet??null, venue:snap.venue||null, evId:pin.event_id};
  }

  async function doClear(slot){
    setPins(ps=>ps.filter(p=>p.sort_order!==slot));   // optimistic
    await clearPin(ownerKind,ownerKey,slot);
  }
  async function doPin(slot,payload){
    const optimistic={sort_order:slot,event_id:payload.event_id,entry_id:payload.entry_id,snapshot:payload.snapshot};
    setPins(ps=>[...ps.filter(p=>p.sort_order!==slot),optimistic].sort((a,b)=>a.sort_order-b.sort_order));
    setPicker(null);
    await setPin(ownerKind,ownerKey,slot,{entry_id:payload.entry_id,event_id:payload.event_id,snapshot:payload.snapshot});
    const fresh=await fetchPins(ownerKind,ownerKey);
    setPins(fresh||[]);
  }

  return(
    <div style={{margin:"0 0 18px"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:9}}>
        <Pin size={13} color="var(--accent)"/>
        <span style={{fontSize:10.5,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"var(--mut)"}}>Result Highlights</span>
      </div>
      <div className="sc-hl-grid">
        {slots.map(slot=>{
          const pin=bySlot.get(slot);
          if(!pin){
            if(!canEdit) return null;
            return(
              <button key={slot} type="button" onClick={()=>setPicker(slot)} className="sc-hl-add">
                <Plus size={16}/><span>Pin a result</span>
              </button>
            );
          }
          const d=resolve(pin);
          const ng=d.cls?nuggetFor(d.cls,d.subclass):null;
          return(
            <div key={slot} className="sc-hl-card">
              {canEdit&&(
                <button type="button" className="sc-hl-x" title="Unpin" onClick={()=>doClear(slot)}><X size={13}/></button>
              )}
              {d.rank!=null&&(
                <div style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:18,color:medalColor(d.rank),lineHeight:1,marginBottom:6,fontVariantNumeric:"tabular-nums"}}>
                  {rankOfFleet(d.rank,d.fleet)}
                </div>
              )}
              <div className="sc-link" onClick={()=>d.evId!=null&&onOpenEvent&&onOpenEvent(d.evId)}
                style={{fontWeight:700,fontSize:13.5,color:"var(--ink)",marginBottom:5,lineHeight:1.25}}>
                {d.evName}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"4px 8px",alignItems:"center",fontSize:11.5,color:"var(--mut)"}}>
                {d.evDate&&<span>{formatDate(d.evDate)}</span>}
                {ng&&<span style={{background:ng.color,color:"#fff",borderRadius:980,padding:"1px 8px",fontWeight:700,fontSize:10.5,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>}
                {d.venue&&<span>{d.venue}</span>}
              </div>
            </div>
          );
        })}
      </div>
      {picker!=null&&(
        <PinPicker ownerKind={ownerKind} ownerKey={ownerKey} events={events} slot={picker}
          onClose={()=>setPicker(null)} onPin={doPin}/>
      )}
    </div>
  );
}

// Modal listing pinnable candidates for a slot.
function PinPicker({ownerKind,ownerKey,events,slot,onClose,onPin}){
  const candidates=React.useMemo(()=>{
    if(ownerKind==="athlete"){
      const idx=athleteIndex(events);
      const spine=idx.get(canonName(ownerKey))||[];
      return spine.map(s=>({
        evId:s.ev.id, evName:s.ev.name, evDate:s.ev.date, cls:s.ev.cls, subclass:s.ev.subclass,
        rank:s.rank, fleet:s.fleet, venue:s.ev.country||null, entry_id:s.entry?.id??null,
        pct:s.fleet>1?(s.rank-1)/(s.fleet-1):0,
      })).sort((a,b)=>a.pct-b.pct);            // best-percentile first
    }
    // host — whole-event pins
    return (events||[])
      .filter(ev=>ev.status!=="Draft"&&String(ev.owner)===String(ownerKey))
      .map(ev=>({evId:ev.id, evName:ev.name, evDate:ev.date, cls:ev.cls, subclass:ev.subclass,
        rank:null, fleet:(ev.entries||[]).length, venue:ev.country||null, entry_id:null,
        dk:dateKey(ev.date)}))
      .sort((a,b)=>String(b.dk).localeCompare(String(a.dk)));
  },[ownerKind,ownerKey,events]);

  function pick(c){
    onPin(slot,{event_id:c.evId,entry_id:c.entry_id,
      snapshot:{evName:c.evName,evDate:c.evDate,cls:c.cls,subclass:c.subclass,rank:c.rank,fleet:c.fleet,venue:c.venue,athlete:ownerKind==="athlete"?ownerKey:null}});
  }
  return(
    <div className="ov" onClick={onClose} style={{zIndex:120}}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:560}}>
        <div className="mhead" style={{padding:"16px 22px"}}>
          <Pin size={17}/><h3 style={{flex:1}}>Pin a result</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{maxHeight:"60vh",overflow:"auto",padding:"8px 10px 14px"}}>
          {candidates.length===0&&<p style={{color:"var(--mut)",fontSize:13,padding:"16px 12px"}}>No results available to pin yet.</p>}
          {candidates.map((c,i)=>{
            const ng=c.cls?nuggetFor(c.cls,c.subclass):null;
            return(
              <button key={i} type="button" onClick={()=>pick(c)}
                style={{display:"flex",alignItems:"center",gap:10,width:"100%",textAlign:"left",border:0,
                  background:"transparent",borderRadius:10,padding:"10px 12px",cursor:"pointer",transition:".12s"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--grouped)"}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                {c.rank!=null&&<span style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:15,color:medalColor(c.rank),width:52,flex:"none",fontVariantNumeric:"tabular-nums"}}>{rankOfFleet(c.rank,c.fleet)}</span>}
                <span style={{flex:1,minWidth:0}}>
                  <span style={{display:"block",fontWeight:700,fontSize:13.5,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.evName}</span>
                  <span style={{display:"flex",gap:"3px 8px",flexWrap:"wrap",alignItems:"center",fontSize:11.5,color:"var(--mut)",marginTop:2}}>
                    {c.evDate&&<span>{formatDate(c.evDate)}</span>}
                    {ng&&<span style={{background:ng.color,color:"#fff",borderRadius:980,padding:"1px 7px",fontWeight:700,fontSize:10,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>}
                    {c.venue&&<span>{c.venue}</span>}
                  </span>
                </span>
                <Pin size={14} color="var(--accent)" style={{flex:"none"}}/>
              </button>
            );
          })}
        </div>
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

/* ══════════════════════════════════════════════════════════════════════════
   Athlete detail panel — "The numbers" + notes timeline + AI overview.
   ════════════════════════════════════════════════════════════════════════ */
const RUBRIC=[["starts","Starts"],["speed","Speed"],["handling","Boat handling"],["tactics","Tactics"],["attitude","Attitude"]];

function DetailPanel({owner,events,ratings,name,notes,onClose,onPick,onNotesChanged,aiCache,setAiCache}){
  const spine=React.useMemo(()=>athleteIndex(events).get(canonName(name))||[],[events,name]);
  const face=React.useMemo(()=>athleteFace(spine),[spine]);
  const m=React.useMemo(()=>metricsForAthlete(name,events,ratings),[name,events,ratings]);
  const myNotes=React.useMemo(()=>notes.filter(n=>canonName(n.athlete_key||"")===canonName(name)),[notes,name]);

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

  const startRisk=m?.startRisk;
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
        <SaveButton owner={owner} events={events} kind="athlete" athleteKey={name}/>
        <button type="button" onClick={onClose} title="Close"
          style={{display:"grid",placeItems:"center",width:30,height:30,borderRadius:8,border:0,background:"var(--grouped)",color:"var(--mut)",cursor:"pointer",flex:"none"}}><X size={16}/></button>
      </div>

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
          <StatRow label="Steadiness" hint="How consistent their race-to-race finishing is within a regatta (0–100; higher = steadier). Below ~3 events it stays blank."
            value={m?.consistency?`${m.consistency.steadiness}/100`:"—"} tone={m?.consistency&&m.consistency.steadiness>=70?"good":undefined}/>
          <StatRow label="Blow-up rate" hint="Share of races finishing in the worst 10% of the fleet — the wheels-come-off races."
            value={fmtPct(m?.blowupRate)} tone={m?.blowupRate!=null?(m.blowupRate<=0.08?"good":m.blowupRate>=0.2?"bad":undefined):undefined}/>
          <StatRow label="Start-line flags" hint="OCS / UFD / BFD rate — how often they're over early or black-flagged at the start."
            value={fmtPct(startRisk?.flagRate)} tone={startRisk?.flagRate!=null?(startRisk.flagRate<=0.02?"good":startRisk.flagRate>=0.08?"bad":undefined):undefined}/>
          <StatRow label="Bullet rate" hint="Share of races won outright — first place."
            value={fmtPct(startRisk?.bulletRate)} tone={startRisk?.bulletRate>=0.15?"good":undefined}/>
          <StatRow label="Regatta learner" hint="Do they get faster across a regatta? Average of (last-third finish % − first-third finish %); negative = warms up, closes stronger."
            value={fmtSigned(m?.regattaLearner)} tone={m?.regattaLearner!=null?(m.regattaLearner<0?"good":m.regattaLearner>0.05?"bad":undefined):undefined}/>
          <StatRow label="Slow starter" hint="First-race finish % minus their event average. Positive = the opening race tends to be worse than the rest."
            value={fmtSigned(m?.slowStarter)} tone={m?.slowStarter!=null?(m.slowStarter>0.08?"bad":undefined):undefined}/>
          <StatRow label="Travels well" hint="Finish % at their home (most-sailed) venue vs everywhere else. Away better-or-equal to home is the mark of a traveller."
            value={m?.travel?`${fmtPct(m.travel.homePct)} home · ${fmtPct(m.travel.awayPct)} away`:"—"}
            tone={m?.travel?(m.travel.awayPct<=m.travel.homePct?"good":undefined):undefined}/>
          <StatRow label="Big-stage delta" hint="Finish % in their largest fleets vs their smallest. Negative = they step up when the fleet is deep."
            value={fmtSigned(m?.pressureDelta)} tone={m?.pressureDelta!=null?(m.pressureDelta<0?"good":m.pressureDelta>0.05?"bad":undefined):undefined}/>
          <StatRow label="Pairing stability" hint="Doublehanded only: share of paired events sailed with their single most-frequent partner."
            value={m?.pairings?.stability!=null?fmtPct(m.pairings.stability):"—"}/>
          <StatRow label="Cohort percentile" hint="Where their rating ranks among athletes born the same year (100th = top of their age group)."
            value={m?.cohortPercentile?`${pctLabel(m.cohortPercentile.percentile)} of ${m.cohortPercentile.peers}`:"—"}
            tone={m?.cohortPercentile&&m.cohortPercentile.percentile>=0.8?"good":undefined}/>
          <StatRow label="Current streak" hint="Their active run of strong finishes across consecutive events, newest-first."
            value={m?.streak?streakPhrase(m.streak.kind,m.streak.len):"—"} tone={m?.streak?"good":undefined}/>

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
function AthleteCard({owner,events,ratings,clip,note,onOpenDetail,onPick,onRemove}){
  const name=clip.athlete_key||clip.title||"";
  const spine=React.useMemo(()=>athleteIndex(events).get(canonName(name))||[],[events,name]);
  const face=React.useMemo(()=>athleteFace(spine),[spine]);
  const rec=ratings&&ratings.get?ratings.get(canonName(name)):null;
  const m=React.useMemo(()=>metricsForAthlete(name,events,ratings),[name,events,ratings]);
  const evidence=spine.length;

  return(
    <div className="sc-card">
      <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
        <div style={{flex:1,minWidth:0}}>
          <span className="sc-link" onClick={()=>onOpenDetail(name)}
            style={{fontFamily:"'Barlow',sans-serif",fontWeight:800,fontSize:16,color:"var(--ink)",lineHeight:1.15,display:"inline-flex",alignItems:"center",gap:7}}>
            <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{face.disp||name}</span>
            {face.nat&&<span style={{fontSize:15,lineHeight:1,flex:"none"}}>{iocFlag(face.nat)}</span>}
          </span>
          <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:5}}>
            {face.classes.slice(0,3).map(c=>{const ng=nuggetFor(c);return <span key={c} style={{background:ng.color,color:"#fff",borderRadius:980,padding:"1px 8px",fontWeight:700,fontSize:10,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>;})}
          </div>
        </div>
        <button type="button" onClick={()=>onRemove(clip)} title="Remove from binder"
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
        <button type="button" className="sc-minibtn" onClick={()=>onOpenDetail(name)}><StickyNote size={12}/>Notes</button>
        <button type="button" className="sc-minibtn" onClick={()=>onPick(name)}><ExternalLink size={12}/>Profile</button>
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
  const watchAthletes=binderClips.filter(c=>c.kind==="athlete");
  const clippings=binderClips.filter(c=>c.kind!=="athlete");
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
                    <DetailPanel owner={owner} events={events} ratings={ratings} name={detailName} notes={notes}
                      onClose={()=>setDetailName(null)} onPick={onPick} onNotesChanged={refreshNotes}
                      aiCache={aiCache} setAiCache={setAiCache}/>
                  )}
                  {watchAthletes.length===0&&clippings.length===0
                    ? <EmptyWatchlist/>
                    : <>
                        {watchAthletes.length>0&&(
                          <div className="sc-cardgrid" style={{marginBottom:clippings.length?16:0}}>
                            {watchAthletes.map(clip=>(
                              <AthleteCard key={clip.id} owner={owner} events={events} ratings={ratings} clip={clip}
                                note={latestNote(clip.athlete_key)} onOpenDetail={setDetailName} onPick={onPick} onRemove={removeAthlete}/>
                            ))}
                          </div>
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
.sc-hl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}
.sc-hl-card{position:relative;background:rgba(255,255,255,.9);border-radius:13px;padding:12px 13px;box-shadow:inset 0 0 0 .5px var(--line),0 1px 2px rgba(0,0,0,.05);}
.sc-hl-add{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:88px;border:1.5px dashed var(--line);border-radius:13px;background:none;color:var(--mut);cursor:pointer;font-size:12px;font-weight:700;font-family:'Barlow',sans-serif;transition:.14s;}
.sc-hl-add:hover{border-color:var(--accent);color:var(--accent);background:rgba(10,132,255,.04);}
.sc-hl-x{position:absolute;top:7px;right:7px;border:0;background:var(--grouped);color:var(--mut);width:22px;height:22px;border-radius:7px;display:grid;place-items:center;cursor:pointer;transition:.12s;}
.sc-hl-x:hover{background:#fbe3e0;color:#c0392b;}
.sc-spin{animation:sc-rot 1s linear infinite;}
@keyframes sc-rot{to{transform:rotate(360deg);}}
@media(max-width:860px){
  .sc-layout{grid-template-columns:1fr;}
  .sc-side{position:static;}
  .sc-detail-grid{grid-template-columns:1fr;}
  .sc-detail-grid>div{border-right:0!important;border-bottom:1px solid var(--line);}
  .sc-hl-grid{grid-template-columns:1fr;}
}
`;
