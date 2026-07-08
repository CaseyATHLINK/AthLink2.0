/* Form / picker input components for sailing — nationality, date, class,
   collaboration, and country selectors. Reorg step 4: views/ module, mirroring
   sports/golf/src/views/. COUNTRIES + INTL_OPTION + csFlag live here too (used
   only by these inputs). Verbatim from App.jsx. */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { Calendar, ChevronRight, Search } from "lucide-react";
import { MON } from "../util/date.js";
import { iocFlag, IOC_ISO } from "../util/flag.js";
import { classColor, classLabel, SUBCLASSES } from "../util/class.js";
import { ASSOCIATIONS, CLUBS } from "../data/hosts.js";

// Compact inline nationality input: type an IOC code (e.g. HKG); once valid it
// confirms with the flag + country name. Suggests matches as you type.
export function NatInput({value,onChange}){
  const [open,setOpen]=React.useState(false);
  const ref=React.useRef();
  React.useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);
  },[]);
  const v=(value||"").toUpperCase();
  const valid=!!IOC_ISO[v];
  const matches=v?COUNTRIES.filter(c=>c.code.startsWith(v)||c.name.toUpperCase().startsWith(v)).slice(0,6):[];
  return(
    <div style={{position:"relative"}} ref={ref}>
      <input value={value||""} onChange={e=>{onChange(e.target.value.toUpperCase());setOpen(true);}}
        onFocus={()=>setOpen(true)} placeholder="HKG" maxLength={3}
        style={{textAlign:"center",width:"100%"}}/>
      {valid&&!open&&<span style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",fontSize:13,pointerEvents:"none"}}>{iocFlag(v)}</span>}
      {open&&matches.length>0&&(
        <div style={{position:"absolute",top:"calc(100% + 3px)",left:0,zIndex:95,background:"#fff",border:"1px solid var(--line)",
          borderRadius:8,boxShadow:"0 10px 24px -10px rgba(0,0,0,.25)",minWidth:170,overflow:"hidden"}}>
          {matches.map(c=>(
            <div key={c.code} onMouseDown={()=>{onChange(c.code);setOpen(false);}}
              style={{padding:"6px 9px",cursor:"pointer",display:"flex",alignItems:"center",gap:7,fontSize:12.5}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--sky)"}
              onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
              <span>{iocFlag(c.code)}</span><b style={{color:"var(--navy)",minWidth:32}}>{c.code}</b>
              <span style={{color:"var(--mut)"}}>{c.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Date field with a persistent DD/MM/YYYY mask hint + a mini-calendar popover.
//  • value/onChange: a "DD/MM/YYYY" string (same contract as the plain input it replaces).
//  • markedDays: { "d/m/yyyy": [competitionName,…] } for the importing host — days that
//    already have competitions are dotted (dotColor) and carry a title tooltip. Reference
//    only; picking a marked day is allowed.
//  • className: forwarded to the <input> so ".pmissing" styling still works.
export function DateField({value,onChange,markedDays={},dotColor="var(--navy2)",className=""}){
  const[open,setOpen]=React.useState(false);
  const ref=React.useRef();
  const parsed=React.useMemo(()=>{
    const m=(value||"").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m?{d:+m[1],mo:+m[2]-1,y:+m[3]}:null;
  },[value]);
  const now=new Date();
  const[vMonth,setVMonth]=React.useState(parsed?parsed.mo:now.getMonth());
  const[vYear,setVYear]=React.useState(parsed?parsed.y:now.getFullYear());
  React.useEffect(()=>{
    if(!open) return;
    if(parsed){setVMonth(parsed.mo);setVYear(parsed.y);}
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);
  },[open]); // eslint-disable-line
  // Mon-first grid: JS getDay() is Sun=0 → shift so Monday is column 0.
  const firstDow=(new Date(vYear,vMonth,1).getDay()+6)%7;
  const daysInMonth=new Date(vYear,vMonth+1,0).getDate();
  const cells=[];
  for(let i=0;i<firstDow;i++) cells.push(null);
  for(let d=1;d<=daysInMonth;d++) cells.push(d);
  const prevMonth=()=>{if(vMonth===0){setVMonth(11);setVYear(y=>y-1);}else setVMonth(m=>m-1);};
  const nextMonth=()=>{if(vMonth===11){setVMonth(0);setVYear(y=>y+1);}else setVMonth(m=>m+1);};
  const pick=(d)=>{onChange(`${d}/${vMonth+1}/${vYear}`);setOpen(false);};
  return(
    <div style={{position:"relative"}} ref={ref}>
      <div style={{position:"relative",display:"flex",alignItems:"center"}}>
        <input value={value||""} onChange={e=>onChange(e.target.value)} className={className}
          placeholder="dd/mm/yyyy" maxLength={10} style={{paddingRight:74}}/>
        <span aria-hidden style={{position:"absolute",right:34,pointerEvents:"none",fontSize:10.5,fontWeight:700,
          letterSpacing:".03em",color:"var(--mut)",opacity:.7}}>DD/MM/YYYY</span>
        <button type="button" title="Pick a date" onClick={()=>setOpen(o=>!o)}
          style={{position:"absolute",right:5,display:"inline-flex",alignItems:"center",justifyContent:"center",
            width:26,height:26,border:0,borderRadius:7,background:open?"var(--accent)":"transparent",
            color:open?"#fff":"var(--mut)",cursor:"pointer",transition:".12s"}}>
          <Calendar size={15}/>
        </button>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 6px)",left:0,zIndex:130,width:252,background:"var(--card)",
          border:"1px solid var(--line)",borderRadius:12,boxShadow:"0 18px 44px -14px rgba(0,0,0,.32)",padding:"10px 12px 12px"}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
            {["Mo","Tu","We","Th","Fr","Sa","Su"].map(d=>(
              <div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:"var(--mut)",padding:"2px 0"}}>{d}</div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {cells.map((d,i)=>{
              if(d==null) return <div key={i}/>;
              const key=`${d}/${vMonth+1}/${vYear}`;
              const comps=markedDays[key]||null;
              const sel=parsed&&parsed.d===d&&parsed.mo===vMonth&&parsed.y===vYear;
              return(
                <button key={i} type="button" onClick={()=>pick(d)}
                  title={comps?comps.join(", "):undefined}
                  style={{position:"relative",height:30,border:"1px solid "+(sel?"var(--accent)":"transparent"),
                    background:sel?"var(--accent)":"transparent",color:sel?"#fff":"var(--ink)",borderRadius:7,
                    fontSize:12.5,fontWeight:sel?700:500,cursor:"pointer",transition:".1s"}}
                  onMouseEnter={e=>{if(!sel)e.currentTarget.style.background="var(--sky)";}}
                  onMouseLeave={e=>{if(!sel)e.currentTarget.style.background="transparent";}}>
                  {d}
                  {comps&&<span style={{position:"absolute",bottom:3,left:"50%",transform:"translateX(-50%)",
                    width:5,height:5,borderRadius:"50%",background:sel?"#fff":dotColor}}/>}
                </button>
              );
            })}
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginTop:9,paddingTop:9,borderTop:"1px solid var(--line)"}}>
            <button type="button" onClick={prevMonth} title="Previous month"
              style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,border:"1px solid var(--line)",background:"var(--card)",borderRadius:7,cursor:"pointer",color:"var(--mut)"}}>
              <ChevronRight size={14} style={{transform:"rotate(180deg)"}}/>
            </button>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,fontSize:12.5,fontWeight:700,color:"var(--ink)"}}>
              <span>{MON[vMonth]}</span>
              <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
                <button type="button" onClick={()=>setVYear(y=>y-1)} title="Previous year"
                  style={{border:0,background:"none",color:"var(--mut)",cursor:"pointer",fontWeight:700,fontSize:13,padding:"0 2px"}}>‹</button>
                {vYear}
                <button type="button" onClick={()=>setVYear(y=>y+1)} title="Next year"
                  style={{border:0,background:"none",color:"var(--mut)",cursor:"pointer",fontWeight:700,fontSize:13,padding:"0 2px"}}>›</button>
              </span>
            </div>
            <button type="button" onClick={nextMonth} title="Next month"
              style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:26,height:26,border:"1px solid var(--line)",background:"var(--card)",borderRadius:7,cursor:"pointer",color:"var(--mut)"}}>
              <ChevronRight size={14}/>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Custom-class dropdown — sits beside the four main class buttons. Lists every
// custom class (global, not host-scoped) plus an "Add new class" action that
// prompts for a name, creates it (auto-assigned muted colour) and selects it.
// value = current evCls; selected style applies when it's a custom class.
export function CustomClassPicker({classes,value,disabled,onSelect,onAdd}){
  const[open,setOpen]=React.useState(false);
  const[adding,setAdding]=React.useState(false);  // in-app "New class name" modal
  const[name,setName]=React.useState("");
  const ref=React.useRef();
  React.useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);
  },[]);
  const sel=classes.find(c=>c.id===value);
  // A "custom:" value with no live registry entry (e.g. an event saved before
  // refresh) still counts as a selected custom class — resolve it via classLabel.
  const isCustomVal=typeof value==="string"&&value.startsWith("custom:");
  const on=!!sel||isCustomVal;
  const closeAdd=()=>{setAdding(false);setName("");};
  // Same create-or-dedup logic as before — onAdd normalises + reuses/creates.
  const submitAdd=()=>{
    const id=onAdd(name);
    if(id)onSelect(id);
    closeAdd();
  };
  return(
    <div style={{position:"relative"}} ref={ref}>
      <button type="button" disabled={disabled} onClick={()=>{if(!disabled)setOpen(o=>!o);}}
        style={{border:"1px solid "+(on?classColor(value):"var(--line)"),background:on?classColor(value):"transparent",
          color:on?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:"5px 11px",
          cursor:disabled?"not-allowed":"pointer",opacity:disabled?.35:1,display:"inline-flex",alignItems:"center",gap:6}}>
        {sel?sel.short:(isCustomVal?classLabel(value):"+ Other class")}
        <ChevronRight size={12} style={{transform:open?"rotate(-90deg)":"rotate(90deg)",transition:".15s"}}/>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,zIndex:90,minWidth:180,background:"var(--card)",border:"1px solid var(--line)",borderRadius:10,boxShadow:"0 12px 30px -10px rgba(0,0,0,.2)",maxHeight:260,overflow:"auto"}}>
          {!classes.length&&<div style={{padding:"8px 12px",fontSize:12,color:"var(--mut)"}}>No custom classes yet</div>}
          {classes.map(c=>(
            <div key={c.id} onClick={()=>{onSelect(c.id);setOpen(false);}}
              style={{padding:"8px 12px",cursor:"pointer",fontSize:12.5,fontWeight:600,color:"var(--ink)",display:"flex",alignItems:"center",gap:8,background:c.id===value?"var(--sky)":"transparent",transition:".1s"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--sky)"}
              onMouseLeave={e=>e.currentTarget.style.background=c.id===value?"var(--sky)":"transparent"}>
              <span style={{width:10,height:10,borderRadius:3,background:c.color,flex:"none"}}/>{c.short}
            </div>
          ))}
          <div onClick={()=>{setAdding(true);setName("");setOpen(false);}}
            style={{padding:"8px 12px",cursor:"pointer",fontSize:12.5,fontWeight:700,color:"var(--accent)",borderTop:"1px solid var(--line)",transition:".1s"}}
            onMouseEnter={e=>e.currentTarget.style.background="var(--sky)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            + Add new class
          </div>
        </div>
      )}
      {adding&&(
        <div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)closeAdd();}}
          style={{position:"fixed",inset:0,background:"rgba(8,20,40,.55)",zIndex:120,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"80px 16px",overflow:"auto"}}>
          <div style={{background:"#fff",borderRadius:14,maxWidth:380,width:"100%",boxShadow:"0 24px 60px -20px rgba(0,0,0,.4)"}}>
            <div style={{background:"var(--navy)",color:"#fff",padding:"14px 18px",borderRadius:"14px 14px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <strong style={{fontSize:15}}>New class name</strong>
              <button type="button" onClick={closeAdd} style={{border:0,background:"rgba(255,255,255,.15)",color:"#fff",borderRadius:8,padding:6,cursor:"pointer",display:"flex"}}><X size={15}/></button>
            </div>
            <div style={{padding:18,display:"flex",flexDirection:"column",gap:14}}>
              <input autoFocus value={name} onChange={e=>setName(e.target.value)}
                onKeyDown={e=>{if(e.key==="Enter"&&name.trim())submitAdd();if(e.key==="Escape")closeAdd();}}
                placeholder="e.g. 2.4 mR"
                style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"9px 11px",font:"inherit",fontSize:13,outline:"none"}}/>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button type="button" onClick={closeAdd}
                  style={{border:"1px solid var(--line)",background:"#fff",color:"var(--mut)",borderRadius:8,padding:"7px 14px",fontSize:13,fontWeight:600,cursor:"pointer"}}>Cancel</button>
                <button type="button" disabled={!name.trim()} onClick={submitAdd}
                  style={{border:0,background:name.trim()?"var(--accent)":"var(--line)",color:"#fff",borderRadius:8,padding:"7px 16px",fontSize:13,fontWeight:700,cursor:name.trim()?"pointer":"not-allowed"}}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Collaboration picker — tickbox reveals a type-to-search dropdown of other
// hosts. `kind` selects the pool: "association" → only associations,
// "club" → only clubs. Both pickers share ONE `value` (collabs) array; each
// only displays/edits its own kind and preserves the other kind's entries.
// One search field over a host pool (associations or clubs). Shared chips above.
export function CollabSearchField({pool,owner,selected,onAdd,onRemove,placeholder,noMatch,heading}){
  const[q,setQ]=React.useState("");
  const[focus,setFocus]=React.useState(false);
  const candidates=pool.filter(a=>a.id!==owner&&!selected.includes(a.id));
  const filtered=candidates.filter(a=>!q||a.name.toLowerCase().includes(q.toLowerCase()));
  return <div style={{flex:1,minWidth:210}}>
    <p style={{fontSize:11,color:"var(--mut)",fontWeight:700,letterSpacing:".04em",textTransform:"uppercase",margin:"0 0 5px"}}>{heading}</p>
    {selected.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
      {selected.map(id=><span key={id} style={{display:"inline-flex",alignItems:"center",gap:6,background:"var(--sky)",color:"var(--navy)",borderRadius:7,fontSize:12,fontWeight:600,padding:"4px 8px"}}>
        {assocName(id)}
        <button type="button" onClick={()=>onRemove(id)} style={{border:0,background:"none",cursor:"pointer",color:"var(--navy)",display:"flex",padding:0}}><X size={12}/></button>
      </span>)}
    </div>}
    <div style={{position:"relative"}}>
      <input value={q} onChange={e=>{setQ(e.target.value);setFocus(true);}} onFocus={()=>setFocus(true)}
        onBlur={()=>setTimeout(()=>setFocus(false),150)} placeholder={placeholder}
        style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/>
      {focus&&filtered.length>0&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"1px solid var(--line)",borderRadius:10,boxShadow:"0 12px 28px -12px rgba(0,0,0,.25)",zIndex:20,overflow:"hidden"}}>
        {filtered.map(a=><div key={a.id} onMouseDown={()=>{onAdd(a.id);setQ("");}}
          style={{padding:"9px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid #f0f4f8"}}
          onMouseEnter={e=>e.currentTarget.style.background="var(--sky)"} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{a.name}</div>)}
      </div>}
      {focus&&filtered.length===0&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"1px solid var(--line)",borderRadius:10,padding:"9px 12px",fontSize:12.5,color:"var(--mut)",zIndex:20}}>{noMatch}</div>}
    </div>
  </div>;
}

// Combined collaboration picker: one checkbox reveals an association search box
// and a club search box side by side. Both feed the SAME collabs array; each box
// only shows/edits its own host type. An event may collaborate with any mix.
export function CollabPicker({owner,value,onChange}){
  const all=value||[];
  const assocIds=React.useMemo(()=>new Set(ASSOCIATIONS.map(x=>x.id)),[]);
  const clubIds=React.useMemo(()=>new Set(CLUBS.map(x=>x.id)),[]);
  const selAssoc=all.filter(id=>assocIds.has(id));
  const selClub=all.filter(id=>clubIds.has(id));
  const[on,setOn]=React.useState(all.length>0);
  const addId=id=>onChange([...all,id]);
  const removeId=id=>onChange(all.filter(x=>x!==id));
  return <div style={{marginTop:6}}>
    <label style={{display:"inline-flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:13,color:"var(--navy)",fontWeight:600}}>
      <input type="checkbox" checked={on} onChange={e=>{setOn(e.target.checked);if(!e.target.checked)onChange([]);}}/>
      Collab with association or club
    </label>
    {on&&<>
      <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:8}}>
        <CollabSearchField pool={ASSOCIATIONS} owner={owner} selected={selAssoc} onAdd={addId} onRemove={removeId}
          heading="Associations" placeholder="Search associations…" noMatch="No matching associations"/>
        <CollabSearchField pool={CLUBS} owner={owner} selected={selClub} onAdd={addId} onRemove={removeId}
          heading="Clubs" placeholder="Search clubs…" noMatch="No matching clubs"/>
      </div>
      <p style={{fontSize:11.5,color:"var(--mut)",marginTop:6}}>Collaborated competitions appear on every host's page.</p>
    </>}
  </div>;
}

/* ── IOC country list for dropdown ───────────────────────────────────── */
export const COUNTRIES=[
  {code:"HKG",name:"Hong Kong"},{code:"NZL",name:"New Zealand"},{code:"GBR",name:"Great Britain"},
  {code:"AUS",name:"Australia"},{code:"USA",name:"United States"},{code:"FRA",name:"France"},
  {code:"GER",name:"Germany"},{code:"ITA",name:"Italy"},{code:"ESP",name:"Spain"},
  {code:"NED",name:"Netherlands"},{code:"DEN",name:"Denmark"},{code:"SWE",name:"Sweden"},
  {code:"NOR",name:"Norway"},{code:"FIN",name:"Finland"},{code:"JPN",name:"Japan"},
  {code:"CHN",name:"China"},{code:"KOR",name:"South Korea"},{code:"SGP",name:"Singapore"},
  {code:"THA",name:"Thailand"},{code:"MAS",name:"Malaysia"},{code:"INA",name:"Indonesia"},
  {code:"PHI",name:"Philippines"},{code:"IND",name:"India"},{code:"PAK",name:"Pakistan"},
  {code:"SRI",name:"Sri Lanka"},{code:"BAN","name":"Bangladesh"},{code:"ARG",name:"Argentina"},
  {code:"BRA",name:"Brazil"},{code:"CHI",name:"Chile"},{code:"COL",name:"Colombia"},
  {code:"URU",name:"Uruguay"},{code:"PER",name:"Peru"},{code:"ECU",name:"Ecuador"},
  {code:"CAN",name:"Canada"},{code:"MEX",name:"Mexico"},{code:"CRC",name:"Costa Rica"},
  {code:"IRL",name:"Ireland"},{code:"POR",name:"Portugal"},{code:"BEL",name:"Belgium"},
  {code:"SUI",name:"Switzerland"},{code:"AUT",name:"Austria"},{code:"POL",name:"Poland"},
  {code:"CZE",name:"Czech Republic"},{code:"HUN",name:"Hungary"},{code:"CRO",name:"Croatia"},
  {code:"SLO",name:"Slovenia"},{code:"ROU",name:"Romania"},{code:"BUL",name:"Bulgaria"},
  {code:"GRE",name:"Greece"},{code:"TUR",name:"Turkey"},{code:"ISR",name:"Israel"},
  {code:"RSA",name:"South Africa"},{code:"MAR",name:"Morocco"},{code:"EGY",name:"Egypt"},
  {code:"KEN",name:"Kenya"},{code:"NGR",name:"Nigeria"},{code:"GHA",name:"Ghana"},
  {code:"UAE",name:"United Arab Emirates"},{code:"KSA",name:"Saudi Arabia"},{code:"QAT",name:"Qatar"},
  {code:"BRN",name:"Bahrain"},{code:"OMA",name:"Oman"},{code:"KUW",name:"Kuwait"},
  {code:"IRI",name:"Iran"},{code:"IRQ",name:"Iraq"},{code:"SYR",name:"Syria"},
  {code:"RUS",name:"Russia"},{code:"UKR",name:"Ukraine"},{code:"EST",name:"Estonia"},
  {code:"LAT",name:"Latvia"},{code:"LTU",name:"Lithuania"},{code:"SVK",name:"Slovakia"},
  {code:"SRB",name:"Serbia"},{code:"MNE",name:"Montenegro"},{code:"BIH",name:"Bosnia"},
  {code:"MKD",name:"North Macedonia"},{code:"ALB",name:"Albania"},{code:"CYP",name:"Cyprus"},
  {code:"MLT",name:"Malta"},{code:"ISL",name:"Iceland"},{code:"LIE",name:"Liechtenstein"},
  {code:"LUX",name:"Luxembourg"},{code:"AND",name:"Andorra"},{code:"MON",name:"Monaco"},
  {code:"SMR",name:"San Marino"},{code:"IVB",name:"British Virgin Islands"},
  {code:"ANT",name:"Antigua & Barbuda"},{code:"BAR",name:"Barbados"},{code:"JAM",name:"Jamaica"},
  {code:"TTO",name:"Trinidad & Tobago"},{code:"CUB",name:"Cuba"},{code:"DOM",name:"Dominican Republic"},
  {code:"PUR",name:"Puerto Rico"},{code:"CAY",name:"Cayman Islands"},{code:"BER",name:"Bermuda"},
  {code:"ISV",name:"US Virgin Islands"},{code:"FIJ",name:"Fiji"},{code:"PNG",name:"Papua New Guinea"},
  {code:"SAM",name:"Samoa"},{code:"TGA",name:"Tonga"},{code:"ASA",name:"American Samoa"},
  {code:"NZL",name:"New Zealand"},{code:"NRU",name:"Nauru"},
];

// intl=true prepends an "International" (non-country) option, value "INT".
export const INTL_OPTION={code:"INT",name:"International"};
export const csFlag=code=>code==="INT"?"🌐":iocFlag(code);

export function CountrySelect({value,onChange,placeholder="Select country...",intl=false,fullWidth=false}){
  const[open,setOpen]=React.useState(false);
  const[q,setQ]=React.useState("");
  const OPTS=intl?[INTL_OPTION,...COUNTRIES]:COUNTRIES;
  const sel=OPTS.find(c=>c.code===value);
  const filtered=q?OPTS.filter(c=>c.code.includes(q.toUpperCase())||c.name.toLowerCase().includes(q.toLowerCase())):OPTS;
  const ref=React.useRef();
  React.useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);
  },[]);
  return(
    <div style={{position:"relative",...(fullWidth?{width:"100%"}:{})}} ref={ref}>
      <div onClick={()=>setOpen(o=>!o)} style={{border:"1px solid var(--line)",borderRadius:7,padding:"9px 12px",fontSize:13,background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:8,userSelect:"none"}}>
        {sel?<>{csFlag(sel.code)} {sel.code!=="INT"&&<b>{sel.code}</b>} {sel.name}</>:<span style={{color:"var(--mut)"}}>{placeholder}</span>}
        <ChevronRight size={12} style={{marginLeft:"auto",transform:open?"rotate(-90deg)":"rotate(90deg)",transition:".15s"}}/>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:90,background:"#fff",border:"1px solid var(--line)",borderRadius:10,boxShadow:"0 12px 30px -10px rgba(0,0,0,.2)",maxHeight:220,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid var(--line)"}}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Type a country…" style={{width:"100%",border:0,outline:0,font:"inherit",fontSize:13,color:"var(--ink)"}}/>
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {filtered.slice(0,80).map(co=>(
              <div key={co.code} onClick={()=>{onChange(co.code);setOpen(false);setQ("");}}
                style={{padding:"8px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontSize:13,background:co.code===value?"var(--sky)":"#fff",transition:".1s"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--sky)"}
                onMouseLeave={e=>e.currentTarget.style.background=co.code===value?"var(--sky)":"#fff"}>
                <span>{csFlag(co.code)}</span>
                {co.code!=="INT"&&<b style={{color:"var(--navy)",minWidth:36}}>{co.code}</b>}
                <span style={{color:"var(--mut)"}}>{co.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-class picker (ILCA 4/6/7, Optimist fleets, 49er / 49er FX) — shown for any class with SUBCLASSES.
// Hover-reveal: renders the parent class button; when the class has SUBCLASSES and is
// selected (or hovered/focused), a pill row of subclass options is revealed inline just
// below the button. Picking one selects it and collapses the reveal; mouse-out closes
// after ~200ms (cancelled on re-enter) so users can travel into the popover. Keeps the
// same onChange contract as the old SubclassPicker (writes mf.subclass) so publish is
// untouched. `classBtn` is the already-styled parent-class button element.
export function SubclassHover({cls,value,onChange,classBtn,active}){
  const opts=SUBCLASSES[cls];
  const[hover,setHover]=React.useState(false);
  const timer=React.useRef(null);
  if(!opts) return classBtn;   // no subclasses → just the plain class button
  const open=active&&(hover||!!value);   // reveal only for the active class row
  const enter=()=>{if(timer.current){clearTimeout(timer.current);timer.current=null;}setHover(true);};
  const leave=()=>{if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setHover(false),200);};
  return(
    <div style={{position:"relative",display:"inline-block"}}
      onMouseEnter={enter} onMouseLeave={leave} onFocusCapture={enter} onBlurCapture={leave}>
      {classBtn}
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 5px)",left:0,zIndex:95,display:"inline-flex",gap:6,flexWrap:"wrap",
          background:"var(--card)",border:"1px solid var(--line)",borderRadius:9,padding:"7px 8px",
          boxShadow:"0 12px 30px -10px rgba(0,0,0,.22)",whiteSpace:"nowrap"}}>
          {opts.map(s=>{
            const on=value===s.id;
            return <button key={s.id} type="button"
              onClick={()=>{onChange(on?null:s.id);if(timer.current)clearTimeout(timer.current);setHover(false);}}
              style={{border:"1px solid "+(on?s.color:"var(--line)"),background:on?s.color:"transparent",
                color:on?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Barlow',sans-serif",
                padding:"5px 11px",cursor:"pointer",transition:".12s"}}>{s.label}</button>;
          })}
        </div>
      )}
    </div>
  );
}

/* ── Searchable host attribution combobox ──────────────────────────────
   value = host id (attribute to a host on AthLink) or null (nothing /
   Other host). The "Other host — not listed" row carries sentinel
   HOST_OTHER; picking it sets _orgHost to null and reveals the free-text
   organizer-name input (rendered here, only in that case).
   onChange(id|null) writes _orgHost. orgName/onOrgName drive _orgName. */
export const HOST_OTHER="__other__";
export function HostPicker({hosts,value,onChange,orgName,onOrgName}){
  const[open,setOpen]=React.useState(false);
  const[q,setQ]=React.useState("");
  const[other,setOther]=React.useState(false);
  const sel=hosts.find(h=>h.id===value);
  const filtered=q?hosts.filter(h=>(h.name||"").toLowerCase().includes(q.toLowerCase())):hosts;
  const ref=React.useRef();
  React.useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);
  },[]);
  // keep cosmetic "other" flag in sync if a real host gets selected elsewhere
  React.useEffect(()=>{if(value)setOther(false);},[value]);
  // Selecting the Other-host sentinel: clear the real host id, mark "other",
  // and drop any previously attributed host name. A real host clears _orgName.
  const pick=id=>{
    if(id===HOST_OTHER){setOther(true);onChange(null);}
    else{setOther(false);onChange(id);onOrgName("");}
    setOpen(false);setQ("");
  };
  return(<>
    <div style={{position:"relative",flex:"1 1 180px",minWidth:180}} ref={ref}>
      <div onClick={()=>setOpen(o=>!o)} style={{border:"1px solid var(--line)",borderRadius:8,padding:"7px 9px",fontSize:12.5,background:"var(--card)",color:"var(--ink)",cursor:"pointer",display:"flex",alignItems:"center",gap:8,userSelect:"none"}}>
        {sel?<span>{sel.name}</span>:other?<span>Other host — not listed</span>:<span style={{color:"var(--mut)"}}>Select host</span>}
        <ChevronRight size={12} style={{marginLeft:"auto",transform:open?"rotate(-90deg)":"rotate(90deg)",transition:".15s",flex:"none"}}/>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:90,background:"var(--card)",border:"1px solid var(--line)",borderRadius:10,boxShadow:"0 12px 30px -10px rgba(0,0,0,.2)",maxHeight:240,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid var(--line)"}}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search hosts..." style={{width:"100%",border:0,outline:0,font:"inherit",fontSize:12.5,color:"var(--ink)",background:"transparent"}}/>
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            <div onClick={()=>pick(HOST_OTHER)}
              style={{padding:"8px 12px",cursor:"pointer",fontSize:12.5,fontWeight:600,color:"var(--navy)",borderBottom:"1px solid var(--line)",background:other&&!value?"var(--sky)":"transparent",transition:".1s"}}
              onMouseEnter={e=>e.currentTarget.style.background="var(--sky)"}
              onMouseLeave={e=>e.currentTarget.style.background=other&&!value?"var(--sky)":"transparent"}>
              Other host — not listed
            </div>
            {filtered.map(h=>(
              <div key={h.id} onClick={()=>pick(h.id)}
                style={{padding:"8px 12px",cursor:"pointer",fontSize:12.5,color:"var(--ink)",background:h.id===value?"var(--sky)":"transparent",transition:".1s"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--sky)"}
                onMouseLeave={e=>e.currentTarget.style.background=h.id===value?"var(--sky)":"transparent"}>
                {h.name}
              </div>
            ))}
            {!filtered.length&&<div style={{padding:"8px 12px",fontSize:12,color:"var(--mut)"}}>No matching hosts</div>}
          </div>
        </div>
      )}
    </div>
    {other&&!value&&(
      <input placeholder="…or type the organizer's name" value={orgName||""}
        onChange={e=>onOrgName(e.target.value)}
        style={{flex:"1 1 180px",minWidth:160,padding:"7px 9px",borderRadius:8,border:"1px solid var(--line)",background:"var(--card)",color:"var(--ink)",fontSize:12.5}}/>
    )}
  </>);
}
