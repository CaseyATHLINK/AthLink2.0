/* Footprint modal views for sailing — FootprintModal (athlete/host globe +
   rival web + progress tabs) and RegattaFootprintModal (who-is-racing country
   breakdown). Reorg step 4: views/ module, mirroring sports/golf/src/views/.
   Verbatim from App.jsx. */

import React from "react";
import { X, ChevronRight, Flag, Globe, TrendingUp } from "lucide-react";
import { formatDate, dateKey } from "../util/date.js";
import { IOC_ISO, isoFlag } from "../util/flag.js";
import { nuggetFor } from "../util/class.js";
import { ErrorBoundary, WebIcon } from "./atoms.jsx";
import { GLOBE_NAMES, SailingGlobe, FootprintLegend } from "./globe.jsx";
import { AthleteWeb, YearNuggets, ProgressChart } from "./charts.jsx";

/* ── FootprintModal: dark popup · big globe · sticky country spotlight ──────── */
export function FootprintModal({name,ag,countryCounts,onClose,hostMode=false,titleSuffix="Globe",webProps=null,initialTab="footprint",years=[],selYears=null,yrKey="",classByYear=null,onPickYear,onPickAll}){
  const [sel,setSel]=React.useState(null); // selected ISO (sticky)
  const [ftab,setFtab]=React.useState(webProps?initialTab:"footprint"); // footprint(globe) | web | progress
  const [webSel,setWebSel]=React.useState(null); // athlete selected inside the web
  const [deselectKey,setDeselectKey]=React.useState(0); // bump to clear the web selection
  const [progSel,setProgSel]=React.useState(null); // selected progress point (for the deselect button)
  const [progDeselectKey,setProgDeselectKey]=React.useState(0); // bump to clear the progress selection
  // Country list respects the selected years (undated kept only when all years selected).
  // The globe uses the parent's countryCounts, which is already selection-filtered.
  const selSet=React.useMemo(()=>yrKey?new Set(selYears):null,[yrKey]);
  const histF=React.useMemo(()=>{
    if(!selSet)return ag.history||[];
    return (ag.history||[]).filter(h=>{const dk=dateKey(h.ev.date);if(!dk)return false;return selSet.has(+dk.slice(0,4));});
  },[ag,selSet]);
  const showNuggets=!!webProps&&years.length>0;
  const groups=React.useMemo(()=>{
    const m={};
    histF.forEach(h=>{
      const ioc=h.ev.country||"";const iso=IOC_ISO[ioc]||"";
      const cname=GLOBE_NAMES[iso]||ioc||"Unknown";const key=iso||ioc||"ZZ";
      if(!m[key])m[key]={iso,cname,items:[]};
      m[key].items.push(h);
    });
    return Object.values(m).sort((a,b)=>a.cname.localeCompare(b.cname));
  },[histF]);

  return(
    <div className="ov" onClick={onClose}>
      <div className="modal wide" onClick={e=>e.stopPropagation()}
        style={{maxWidth:1000,background:"linear-gradient(160deg,rgba(13,35,64,0.82),rgba(9,26,49,0.82))",border:"1px solid rgba(120,160,210,.22)"}}>
        <div className="mhead" style={{background:"rgba(8,22,42,.6)"}}>
          <h3>{name} — {ftab==="web"?"Athlete web":ftab==="progress"?"Progress":titleSuffix}</h3>
          {((ftab==="footprint"&&sel)||(ftab==="web"&&webSel)||(ftab==="progress"&&progSel!=null))&&
            <button className="btn ghost" style={{background:"rgba(255,255,255,.1)",color:"#dcecf8",border:"1px solid rgba(255,255,255,.18)",fontSize:12,padding:"5px 11px",marginRight:8}}
              onClick={()=>{if(ftab==="web")setDeselectKey(k=>k+1);else if(ftab==="progress")setProgDeselectKey(k=>k+1);else setSel(null);}}>Deselect</button>}
          {webProps&&<div style={{display:"flex",gap:4}}>
            {[["footprint","Globe",Globe],["web","Web",WebIcon],["progress","Progress",TrendingUp]].map(([k,lab,Ico])=>(
              <button key={k} onClick={()=>setFtab(k)}
                style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,letterSpacing:".02em",
                  border:"1px solid rgba(120,160,210,.3)",borderRadius:980,padding:"4px 12px",cursor:"pointer",transition:"all .2s ease",
                  boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)",
                  background:ftab===k?"rgba(146,180,222,.34)":"rgba(120,160,210,.16)",color:ftab===k?"#fff":"#cfe0f2"}}>
                <Ico size={12}/>{lab}
              </button>
            ))}
          </div>}
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        {/* Shared year nuggets — govern Globe · Web · Progress together (floating, not a banner) */}
        {showNuggets&&<div style={{padding:"12px 18px 4px",display:"flex",justifyContent:"center"}}>
          <YearNuggets years={years} selYears={selYears} classByYear={classByYear} onPick={onPickYear} onAll={onPickAll}/>
        </div>}
        {ftab==="web"
        ? <div style={{height:540}}><AthleteWeb {...webProps} enlarged height={540} dark onSelectionChange={setWebSel} deselectKey={deselectKey} selYears={selYears} yrKey={yrKey}/></div>
        : ftab==="progress"
        ? <div style={{height:540}}><ProgressChart name={name} events={webProps?webProps.events:[]} history={ag.history} selYears={selYears} yrKey={yrKey} enlarged height={540} w={600} onOpenEvent={webProps?webProps.onOpenEvent:undefined} onPick={webProps?webProps.onPick:undefined} onSelectionChange={setProgSel} deselectKey={progDeselectKey}/></div>
        : <div style={{display:"flex",flexWrap:"wrap"}} onClick={()=>setSel(null)}>
          <div style={{flex:"1 1 440px",minWidth:300,padding:18}} onClick={e=>e.stopPropagation()}>
            <SailingGlobe countryData={countryCounts} height={460} pulseIso={sel} dark bare/>
            <FootprintLegend/>
          </div>
          <div style={{flex:"1 1 360px",minWidth:280,maxHeight:520,overflowY:"auto",borderLeft:"1px solid rgba(120,160,210,.18)",padding:"8px 0"}}
               onClick={e=>{if(e.target===e.currentTarget)setSel(null);}}>
            {groups.map(g=>(
              <div key={g.cname}>
                <div style={{position:"sticky",top:0,padding:"9px 14px 7px",zIndex:1,display:"flex"}}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:8,
                     background:"rgba(120,160,210,.16)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
                     border:"1px solid rgba(120,160,210,.3)",
                     borderRadius:980,padding:"5px 13px",color:"#eaf3fc",fontWeight:700,
                     fontFamily:"'Barlow',sans-serif",fontSize:13,letterSpacing:".02em",
                     boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)"}}>
                    <span style={{fontSize:16,lineHeight:1}}>{g.iso?[...g.iso].map(ch=>String.fromCodePoint(0x1F1E6+ch.charCodeAt(0)-65)).join(""):""}</span>
                    {g.cname}
                    <span style={{color:"#9fc4ec",fontWeight:800,fontVariantNumeric:"tabular-nums"}}>{g.items.length}</span>
                  </span>
                </div>
                {g.items.map((h,i)=>{
                  const active=sel&&sel===g.iso;
                  return(
                  <div key={i}
                    onMouseEnter={()=>setSel(g.iso||null)}
                    onClick={e=>{e.stopPropagation();setSel(g.iso||null);}}
                    style={{margin:"7px 12px",padding:"11px 14px",borderRadius:11,cursor:"pointer",transition:"all .15s",
                      background:active?"rgba(90,150,215,.22)":"rgba(120,160,210,.08)",
                      border:"1px solid "+(active?"rgba(120,180,235,.55)":"rgba(120,160,210,.16)")}}>
                    <div style={{fontWeight:700,color:"#eaf3fc",fontSize:14,marginBottom:3}}>{h.ev.name}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:"4px 12px",fontSize:12.5,color:"#9fbdd9"}}>
                      {!hostMode&&<span style={{color:h.row.rank<=3?"#ffd86b":"#cfe0f2",fontWeight:700}}>
                        {h.row.rank}<span style={{color:"#9fbdd9",fontWeight:500}}> of {h.fleet} boats</span></span>}
                      {hostMode&&<span style={{color:"#cfe0f2",fontWeight:600}}>{h.fleet} boats</span>}
                      {h.countries>0&&<span>{h.countries} countr{h.countries===1?"y":"ies"}</span>}
                      <span>{formatDate(h.ev.date)}</span>
                      {h.ev.cls?(()=>{const ng=nuggetFor(h.ev.cls,h.ev.subclass);return(
                        <span style={{background:ng.color,color:"#fff",borderRadius:980,padding:"2px 10px",fontWeight:700,fontSize:11.5,fontFamily:"'Barlow',sans-serif",letterSpacing:".01em",boxShadow:"inset 0 1px 0 rgba(255,255,255,.3)"}}>{ng.label}</span>
                      );})():(h.ev.class?<span style={{background:"rgba(120,160,210,.2)",color:"#cfe0f2",borderRadius:980,padding:"2px 10px",fontWeight:600,fontSize:11.5}}>{h.ev.class}</span>:null)}
                    </div>
                  </div>);
                })}
              </div>
            ))}
            {groups.length===0&&<div style={{padding:24,color:"#9fbdd9",fontSize:13}}>No competitions recorded yet.</div>}
          </div>
        </div>}
      </div>
    </div>
  );
}

/* ── RegattaFootprintModal: who's racing — countries → # of sailors ───────── */
export function RegattaFootprintModal({event,onClose,homeCountry={},onPickAthlete}){
  const [sel,setSel]=React.useState(null);            // spotlit ISO (globe)
  const [openSet,setOpenSet]=React.useState(()=>new Set());  // expanded country keys
  const hostIso=React.useMemo(()=>IOC_ISO[event.country]||(event.country&&event.country.length===2?event.country.toUpperCase():""),[event]);
  const {natCounts,groups}=React.useMemo(()=>{
    const counts={},gmap={};
    const isoForSailor=(entryIso,name)=>homeCountry[name]||entryIso||"";
    (event.entries||[]).forEach(e=>{
      const entryIso=IOC_ISO[e.nat||""]||"";
      const add=(name,role)=>{
        if(!name)return;
        const iso=isoForSailor(entryIso,name);
        const key=iso||"ZZ";
        const cname=GLOBE_NAMES[iso]||"Unknown";
        if(!gmap[key])gmap[key]={key,iso,cname,sailors:[]};
        gmap[key].sailors.push({name,role});
        if(iso)counts[iso]=(counts[iso]||0)+1;
      };
      add(e.helm,"Helm");
      add(e.crew,"Crew");
    });
    // names alphabetical within each country
    Object.values(gmap).forEach(g=>g.sailors.sort((x,y)=>x.name.localeCompare(y.name)));
    // alphabetical by country name, Unknown last
    const groups=Object.values(gmap).sort((a,b)=>{
      if(a.key==="ZZ")return 1; if(b.key==="ZZ")return -1;
      return a.cname.localeCompare(b.cname);
    });
    return{natCounts:counts,groups};
  },[event,homeCountry]);
  const totalSailors=groups.reduce((a,g)=>a+g.sailors.length,0);
  const toggle=key=>setOpenSet(prev=>{const n=new Set(prev);n.has(key)?n.delete(key):n.add(key);return n;});
  const allOpen=groups.length>0&&groups.every(g=>openSet.has(g.key));
  const toggleAll=()=>setOpenSet(allOpen?new Set():new Set(groups.map(g=>g.key)));
  return(
    <div className="ov" onClick={onClose}>
      <div className="modal wide" onClick={e=>e.stopPropagation()}
        style={{maxWidth:1000,background:"linear-gradient(160deg,rgba(13,35,64,0.82),rgba(9,26,49,0.82))",border:"1px solid rgba(120,160,210,.22)"}}>
        <div className="mhead" style={{background:"rgba(8,22,42,.6)"}}>
          <Flag size={18}/><h3>{event.name}</h3>
          {sel&&<button className="btn ghost" style={{background:"rgba(255,255,255,.1)",color:"#dcecf8",border:"1px solid rgba(255,255,255,.18)",fontSize:12,padding:"5px 11px",marginRight:8}} onClick={()=>setSel(null)}>Deselect</button>}
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <ErrorBoundary resetKey={event.id} fallback={<div style={{padding:24,color:"#9fbdd9",fontSize:13}}>Couldn't render this competition's map.</div>}>
        <div style={{display:"flex",flexWrap:"wrap"}} onClick={()=>setSel(null)}>
          <div style={{flex:"1 1 440px",minWidth:300,padding:18}} onClick={e=>e.stopPropagation()}>
            <SailingGlobe countryData={natCounts} height={460} pulseIso={sel} dark countLabel="athlete" hostIso={hostIso} rankShade markersHostOnly/>
            <FootprintLegend label="Athletes / country" showHost={!!hostIso} rank maxCount={Object.values(natCounts).reduce((a,b)=>Math.max(a,b),0)}/>
          </div>
          <div style={{flex:"1 1 360px",minWidth:280,maxHeight:520,overflowY:"auto",borderLeft:"1px solid rgba(120,160,210,.18)",padding:"8px 0"}}
               onClick={e=>{if(e.target===e.currentTarget)setSel(null);}}>
            <div style={{display:"flex",alignItems:"center",gap:10,padding:"6px 18px 10px"}}>
              <span style={{color:"#9fbdd9",fontSize:12.5,fontWeight:600}}>{groups.length} countr{groups.length!==1?"ies":"y"} · {totalSailors} athlete{totalSailors!==1?"s":""}</span>
              {groups.length>0&&<button onClick={e=>{e.stopPropagation();toggleAll();}}
                style={{marginLeft:"auto",background:"rgba(120,160,210,.14)",color:"#cfe0f2",border:"1px solid rgba(120,160,210,.28)",borderRadius:7,fontSize:11.5,fontWeight:600,padding:"4px 10px",cursor:"pointer"}}>
                {allOpen?"Collapse all":"Expand all"}</button>}
            </div>
            {groups.map(g=>{
              const active=sel&&sel===g.iso;
              const isOpen=openSet.has(g.key);
              const isHost=hostIso&&g.iso===hostIso;
              return(
              <div key={g.key}
                style={{margin:"7px 12px",borderRadius:11,transition:"all .15s",overflow:"hidden",
                  background:active?"rgba(90,150,215,.22)":"rgba(120,160,210,.08)",
                  border:"1px solid "+(active?"rgba(120,180,235,.55)":isHost?"rgba(242,192,55,.5)":"rgba(120,160,210,.16)")}}>
                <div
                  onMouseEnter={()=>setSel(g.iso||null)}
                  onClick={e=>{e.stopPropagation();setSel(g.iso||null);toggle(g.key);}}
                  style={{display:"flex",alignItems:"center",gap:8,padding:"11px 14px",cursor:"pointer"}}>
                  <ChevronRight size={14} color="#9fbdd9" style={{flex:"none",transform:isOpen?"rotate(90deg)":"none",transition:".15s"}}/>
                  <span style={{fontSize:17}}>{isoFlag(g.iso)}</span>
                  <span style={{fontWeight:700,color:"#eaf3fc",fontSize:14,fontFamily:"'Barlow',sans-serif"}}>{g.cname}</span>
                  {isHost&&<span style={{fontSize:9.5,fontWeight:700,color:"#f2c037",background:"rgba(242,192,55,.14)",border:"1px solid rgba(242,192,55,.4)",borderRadius:5,padding:"1px 6px",letterSpacing:".03em"}}>HOST</span>}
                  <span style={{marginLeft:"auto",color:"#7fa8d4",fontWeight:700,fontSize:13}}>{g.sailors.length} athlete{g.sailors.length!==1?"s":""}</span>
                </div>
                {isOpen&&g.sailors.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:"5px 7px",padding:"0 14px 12px 32px"}}>
                  {g.sailors.map((sa,i)=>(
                    <span key={i} role="button" tabIndex={0}
                      onClick={e=>{e.stopPropagation();onPickAthlete&&onPickAthlete(sa.name);}}
                      style={{fontSize:12,color:"#cfe0f2",background:"rgba(120,160,210,.13)",borderRadius:6,padding:"2px 8px",cursor:"pointer",transition:"background .12s"}}
                      onMouseEnter={e=>e.currentTarget.style.background="rgba(120,180,235,.32)"}
                      onMouseLeave={e=>e.currentTarget.style.background="rgba(120,160,210,.13)"}>
                      {sa.name}{sa.role==="Crew"?<span style={{color:"#8aa8cc"}}> · crew</span>:null}</span>
                  ))}
                </div>}
              </div>);
            })}
            {groups.length===0&&<div style={{padding:24,color:"#9fbdd9",fontSize:13}}>No entries recorded.</div>}
          </div>
        </div>
        </ErrorBoundary>
      </div>
    </div>
  );
}
