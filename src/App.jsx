import React, { useState, useMemo, useEffect } from "react";
import {
  Anchor, Trophy, Search, BadgeCheck, Upload, ChevronRight, MapPin,
  Calendar, Users, Waves, ArrowLeft, Flag, Loader2, Sparkles, Link2,
  X, FileText, ClipboardPaste, AlertCircle, Pencil, Trash2, Plus, Minus,
  CheckCircle, Clock, Eye, Home, Globe
} from "lucide-react";

/* ── Scoring codes ────────────────────────────────────────────────────────
   NEVER_DISCARD: cannot be dropped even if it would improve the score
   VARIABLE:      the PDF already provides the numeric value (RDG, SCP, STP, DPI, ZFP etc.)
                  — treat the stored value as-is for points, use fleet+1 for discard ranking
                  when no explicit number is stored
   PENALTY:       score = fleet + 1
   ────────────────────────────────────────────────────────────────────── */
const NEVER_DISCARD=new Set(["DNE"]);

// Codes where the PDF provides an explicit numeric value that we already stored
// For discard comparison we still treat them as fleet+1 unless an explicit number was parsed
const CODE_WEIGHT={
  // Hard fleet+1
  OCS:1,UFD:1,BFD:1,DSQ:1,DNF:1,DNC:1,DNS:1,RET:1,NSC:1,
  // Also fleet+1 for discard purposes (variable numeric for net scoring)
  SCP:1,STP:1,DPI:1,ZFP:1,TAL:1,
  // RDG: redress — the number is already stored as a numeric value by the parser
  // We do NOT score it as fleet+1; whatever number came in is used
  RDG:0,
};

const isCode=c=>typeof c==="string";
const isPenaltyCode=c=>isCode(c)&&CODE_WEIGHT[c]!==undefined&&CODE_WEIGHT[c]===1;

/* ── IOC → ISO flag ───────────────────────────────────────────────────── */
const IOC_ISO={
  AFG:'AF',ALB:'AL',ALG:'DZ',AND:'AD',ANG:'AO',ANT:'AG',ARG:'AR',ARM:'AM',
  ARU:'AW',ASA:'AS',AUS:'AU',AUT:'AT',AZE:'AZ',BAH:'BS',BAN:'BD',BAR:'BB',
  BDI:'BI',BEL:'BE',BEN:'BJ',BER:'BM',BHU:'BT',BIH:'BA',BIZ:'BZ',BLR:'BY',
  BOL:'BO',BOT:'BW',BRA:'BR',BRN:'BH',BRU:'BN',BUL:'BG',BUR:'BF',CAF:'CF',
  CAM:'KH',CAN:'CA',CAY:'KY',CGO:'CG',CHA:'TD',CHI:'CL',CHN:'CN',CIV:'CI',
  CMR:'CM',COD:'CD',COK:'CK',COL:'CO',COM:'KM',CPV:'CV',CRC:'CR',CRO:'HR',
  CUB:'CU',CYP:'CY',CZE:'CZ',DEN:'DK',DJI:'DJ',DMA:'DM',DOM:'DO',ECU:'EC',
  EGY:'EG',ERI:'ER',ESA:'SV',ESP:'ES',EST:'EE',ETH:'ET',FIJ:'FJ',FIN:'FI',
  FRA:'FR',FSM:'FM',GAB:'GA',GAM:'GM',GBR:'GB',GBS:'GW',GEO:'GE',GEQ:'GQ',
  GER:'DE',GHA:'GH',GRE:'GR',GRN:'GD',GUA:'GT',GUI:'GN',GUM:'GU',GUY:'GY',
  HAI:'HT',HKG:'HK',HON:'HN',HUN:'HU',INA:'ID',IND:'IN',IRI:'IR',IRL:'IE',
  IRQ:'IQ',ISL:'IS',ISR:'IL',ISV:'VI',ITA:'IT',IVB:'VG',JAM:'JM',JOR:'JO',
  JPN:'JP',KAZ:'KZ',KEN:'KE',KGZ:'KG',KIR:'KI',KOR:'KR',KOS:'XK',KSA:'SA',
  KUW:'KW',LAO:'LA',LAT:'LV',LBA:'LY',LBR:'LR',LCA:'LC',LES:'LS',LIB:'LB',
  LIE:'LI',LTU:'LT',LUX:'LU',MAD:'MG',MAR:'MA',MAS:'MY',MAW:'MW',MDA:'MD',
  MDV:'MV',MEX:'MX',MGL:'MN',MHL:'MH',MKD:'MK',MLI:'ML',MLT:'MT',MNE:'ME',
  MON:'MC',MOZ:'MZ',MRI:'MU',MTN:'MR',MYA:'MM',NAM:'NA',NCA:'NI',NED:'NL',
  NEP:'NP',NGR:'NG',NIG:'NE',NOR:'NO',NRU:'NR',NZL:'NZ',OMA:'OM',PAK:'PK',
  PAN:'PA',PAR:'PY',PER:'PE',PHI:'PH',PLE:'PS',PLW:'PW',PNG:'PG',POL:'PL',
  POR:'PT',PRK:'KP',PUR:'PR',QAT:'QA',ROC:'TW',RSA:'ZA',ROU:'RO',RUS:'RU',
  RWA:'RW',SAM:'WS',SEN:'SN',SEY:'SC',SGP:'SG',SKN:'KN',SLE:'SL',SLO:'SI',
  SMR:'SM',SOL:'SB',SOM:'SO',SRB:'RS',SRI:'LK',SSD:'SS',STP:'ST',SUD:'SD',
  SUI:'CH',SUR:'SR',SVK:'SK',SWE:'SE',SWZ:'SZ',SYR:'SY',TAN:'TZ',TGA:'TO',
  THA:'TH',TJK:'TJ',TKM:'TM',TLS:'TL',TOG:'TG',TPE:'TW',TTO:'TT',TUN:'TN',
  TUR:'TR',TUV:'TV',UAE:'AE',UGA:'UG',UKR:'UA',URU:'UY',USA:'US',UZB:'UZ',
  VAN:'VU',VEN:'VE',VIE:'VN',VIN:'VC',YEM:'YE',ZAM:'ZM',ZIM:'ZW',
};
function isoFlag(iso){
  try{
    if(!iso||iso.length!==2) return '';
    const a=iso.toUpperCase();
    if(!/^[A-Z]{2}$/.test(a)) return '';
    return [...a].map(c=>String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-65)).join('');
  }catch{return '';}
}
function iocFlag(code){
  if(!code) return '';
  const iso=IOC_ISO[code.toUpperCase()];
  if(!iso) return '';
  return [...iso].map(c=>String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-65)).join('');
}

/* ── Shared display helpers ───────────────────────────────────────────────
   CountryTag: flag + code shown together (global standard).
   VerifyBadge: blue badge if verified, grey badge if not — icon only.        */
function CountryTag({code,size=14,style={}}){
  if(!code) return null;
  const fl=iocFlag(code);
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,...style}}>{fl&&<span style={{fontSize:size+2,lineHeight:1}}>{fl}</span>}{code}</span>;
}
function VerifyBadge({verified,size=14,title}){
  // verified -> blue, unverified -> grey. Badge icon only.
  const col=verified?"#0d8ecf":"#9fb2c8";
  return <BadgeCheck size={size} color={col} aria-label={verified?"Verified":"Unverified"}
    title={title||(verified?"Verified athlete":"Unverified")} style={{flex:"none"}}/>;
}

// Toggleable M / F / Mix / Jr selector. value = "F Jr" style string; onChange(string).
// Rules: at most one gender (M/F/Mix); Jr is an independent add-on.
function DivisionToggle({value,onChange,size="sm",noMix=false}){
  const tokens=divTokens(value);
  let gender=tokens.find(t=>t!=="Jr")||null;
  if(noMix&&gender==="Mix") gender=null; // single-handed: Mix not applicable
  const jr=tokens.includes("Jr");
  const set=(g,j)=>onChange(divToString([g,j?"Jr":null].filter(Boolean)));
  const btn=(key,label)=>{
    const isJr=key==="Jr";
    const on=isJr?jr:gender===key;
    const col=DIV_COLOR[key];
    return <button key={key} type="button"
      onClick={e=>{e.stopPropagation();isJr?set(gender,!jr):set(gender===key?null:key,jr);}}
      style={{border:"1px solid "+(on?col:"var(--line)"),background:on?col:"transparent",color:on?"#fff":"var(--mut)",
        borderRadius:6,fontSize:size==="sm"?10:11.5,fontWeight:700,fontFamily:"'Barlow',sans-serif",
        padding:size==="sm"?"2px 6px":"3px 8px",cursor:"pointer",lineHeight:1.3,transition:".12s"}}>{label}</button>;
  };
  return <div style={{display:"inline-flex",gap:4,flexWrap:"wrap"}}>
    {btn("M","M")}{btn("F","F")}{!noMix&&btn("Mix","Mix")}{btn("Jr","Jr")}</div>;
}

// Compact inline nationality input: type an IOC code (e.g. HKG); once valid it
// confirms with the flag + country name. Suggests matches as you type.
function NatInput({value,onChange}){
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

// Small read-only division nugget(s) for the results page.
function DivNugget({div}){
  const tokens=divTokens(div);
  if(!tokens.length) return null;
  return <span style={{display:"inline-flex",gap:3}}>
    {tokens.map(t=><span key={t} style={{background:DIV_COLOR[t],color:"#fff",borderRadius:4,fontSize:9.5,fontWeight:700,
      fontFamily:"'Barlow',sans-serif",padding:"1px 5px",letterSpacing:".02em"}} title={DIV_LABEL[t]}>{t}</span>)}
  </span>;
}

// Class nugget dropdown for manual import (looks like the class nuggets used elsewhere).
function ClassPicker({value,onChange}){
  const opts=[["29er","29er"],["ilca","ILCA"],["optimist","Optimist"],["49er","49er"]];
  return <div style={{display:"inline-flex",gap:6,flexWrap:"wrap"}}>
    {opts.map(([id,label])=>{
      const on=value===id;
      return <button key={id} type="button" onClick={()=>onChange(id)}
        style={{border:"1px solid "+(on?classColor(id):"var(--line)"),background:on?classColor(id):"transparent",
          color:on?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Barlow',sans-serif",
          padding:"5px 11px",cursor:"pointer",transition:".12s"}}>{label}</button>;
    })}
  </div>;
}

/* ── date helpers ─────────────────────────────────────────────────────── */
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function formatDate(str){
  if(!str||str==="—") return str||"—";
  const m=str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){const d=parseInt(m[1]),mo=parseInt(m[2])-1,y=m[3];if(mo>=0&&mo<=11) return `${d} ${MON[mo]} ${y}`;}
  return str;
}

/* ── static data ──────────────────────────────────────────────────────── */
const META={
  "Bunyamin Klongsamoot":{nat:"THA"},"Kan Kachachuen":{nat:"THA"},
  "Chatree Makmul":{nat:"THA"},"Manintorn Leelas":{nat:"THA"},
  "Mihiro Okada":{nat:"JPN"},"Iwao Yasuda":{nat:"JPN"},
  "Yuto Tsutsumi":{nat:"JPN"},"Taishi Goto":{nat:"JPN"},
};
// ── Base classes (used for colour coding) ──
const CLASSES=[
  {id:"29er",    short:"29er"},
  {id:"ilca",    short:"ILCA"},
  {id:"optimist",short:"Optimist"},
  {id:"49er",    short:"49er"},
];

// ── Associations: each portal is one association ──
// scope: "HK" (Hong Kong) or "INT" (International). cls: base class for colour.
const ASSOCIATIONS=[
  {id:"hk-29er",     scope:"HK",  cls:"29er",     name:"Hong Kong 29er Class Association"},
  {id:"hk-ilca",     scope:"HK",  cls:"ilca",     name:"Hong Kong ILCA"},
  {id:"hk-optimist", scope:"HK",  cls:"optimist", name:"Hong Kong Optimist Dinghy Association"},
  {id:"int-29er",    scope:"INT", cls:"29er",     name:"International 29er Class Association"},
  {id:"int-ilca",    scope:"INT", cls:"ilca",     name:"International Laser Class Association"},
  {id:"int-optimist",scope:"INT", cls:"optimist", name:"International Optimist Dinghy Association"},
  {id:"int-49er",    scope:"INT", cls:"49er",     name:"International 49er Class Association"},
];
const assocById=id=>ASSOCIATIONS.find(a=>a.id===id);
const assocName=id=>assocById(id)?.name||id;
// Association → ISO country flag (HK gets a flag; International gets none)
const assocFlag=scope=>scope==="HK"?"🇭🇰":"";
// All associations that own/co-own an event
const eventAssocs=ev=>[ev.owner,...(ev.collabs||[])].filter(Boolean);

// ── Sub-classes (per-event) for ILCA and Optimist ──
// ILCA: 3 rigs, varying shades of blue (ILCA 7 darkest → ILCA 4 lightest).
// Optimist: 3 fleets, ranked high→low performance, black → grey.
const SUBCLASSES={
  ilca:[
    {id:"ilca7", label:"ILCA 7", color:"#16456e"},
    {id:"ilca6", label:"ILCA 6", color:"#2E78C8"},
    {id:"ilca4", label:"ILCA 4", color:"#6db3ef"},
  ],
  optimist:[
    {id:"opti",       label:"Optimist",              color:"#2b2b2b"},
    {id:"opti-int",   label:"Optimist Intermediate", color:"#6b6b6b"},
    {id:"opti-green", label:"Optimist Green",        color:"#a3a3a3"},
  ],
};
const subById=(cls,id)=>(SUBCLASSES[cls]||[]).find(s=>s.id===id);
// Nugget label + colour for an event (subclass overrides base class)
const nuggetFor=(cls,subclass)=>{
  const s=subById(cls,subclass);
  if(s) return{label:s.label,color:s.color};
  const c=CLASSES.find(c=>c.id===cls);
  return{label:c?.short||cls,color:classColor(cls)};
};

// Global class colour coding (used by calendar circles)
// Canonical class colours (refer to them by these names):
//   29er  -> "29er red"      (#E84855)
//   ILCA  -> "ILCA blue"     (#2E78C8, lightened so it's distinct from Optimist black)
//   Optimist -> "Optimist black" (#3D3D3D)
//   49er  -> "49er green"    (#5FAF4E)
const CLASS_COLOR={"29er":"#E84855","49er":"#5FAF4E","ilca":"#2E78C8","optimist":"#3D3D3D"};
const classColor=(cls)=>CLASS_COLOR[(cls||"").toLowerCase()]||"#5b6b80";
// Class colour at a given alpha (for translucent buttons that go solid on hover).
const classColorA=(cls,a)=>{
  const hex=classColor(cls).replace("#","");
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
};

// Sub-class picker (ILCA 4/6/7, Optimist fleets) — only shown for ILCA/Optimist events.
function SubclassPicker({cls,value,onChange}){
  const opts=SUBCLASSES[cls];
  if(!opts) return null;
  return <div style={{display:"inline-flex",gap:6,flexWrap:"wrap"}}>
    {opts.map(s=>{
      const on=value===s.id;
      return <button key={s.id} type="button" onClick={()=>onChange(on?null:s.id)}
        style={{border:"1px solid "+(on?s.color:"var(--line)"),background:on?s.color:"transparent",
          color:on?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Barlow',sans-serif",
          padding:"5px 11px",cursor:"pointer",transition:".12s"}}>{s.label}</button>;
    })}
  </div>;
}

// Collaboration picker — tickbox reveals a type-to-search dropdown of other
// associations of the same class. Multiple collaborators allowed.
function CollabPicker({cls,owner,value,onChange}){
  const[on,setOn]=React.useState((value||[]).length>0);
  const[q,setQ]=React.useState("");
  const[focus,setFocus]=React.useState(false);
  const selected=value||[];
  const candidates=ASSOCIATIONS.filter(a=>a.id!==owner&&!selected.includes(a.id));
  const filtered=candidates.filter(a=>!q||a.name.toLowerCase().includes(q.toLowerCase()));
  return <div style={{marginTop:6}}>
    <label style={{display:"inline-flex",alignItems:"center",gap:7,cursor:"pointer",fontSize:13,color:"var(--navy)",fontWeight:600}}>
      <input type="checkbox" checked={on} onChange={e=>{setOn(e.target.checked);if(!e.target.checked)onChange([]);}}/>
      Collaborated with another association
    </label>
    {on&&<div style={{marginTop:8}}>
      {selected.length>0&&<div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
        {selected.map(id=><span key={id} style={{display:"inline-flex",alignItems:"center",gap:6,background:"var(--sky)",color:"var(--navy)",borderRadius:7,fontSize:12,fontWeight:600,padding:"4px 8px"}}>
          {assocName(id)}
          <button type="button" onClick={()=>onChange(selected.filter(x=>x!==id))} style={{border:0,background:"none",cursor:"pointer",color:"var(--navy)",display:"flex",padding:0}}><X size={12}/></button>
        </span>)}
      </div>}
      <div style={{position:"relative",maxWidth:380}}>
        <input value={q} onChange={e=>{setQ(e.target.value);setFocus(true);}} onFocus={()=>setFocus(true)}
          onBlur={()=>setTimeout(()=>setFocus(false),150)}
          placeholder="Search associations to add…"
          style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/>
        {focus&&filtered.length>0&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"1px solid var(--line)",borderRadius:10,boxShadow:"0 12px 28px -12px rgba(0,0,0,.25)",zIndex:20,overflow:"hidden"}}>
          {filtered.map(a=><div key={a.id} onMouseDown={()=>{onChange([...selected,a.id]);setQ("");}}
            style={{padding:"9px 12px",cursor:"pointer",fontSize:13,borderBottom:"1px solid #f0f4f8"}}
            onMouseEnter={e=>e.currentTarget.style.background="var(--sky)"} onMouseLeave={e=>e.currentTarget.style.background="#fff"}>{a.name}</div>)}
        </div>}
        {focus&&filtered.length===0&&<div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,background:"#fff",border:"1px solid var(--line)",borderRadius:10,padding:"9px 12px",fontSize:12.5,color:"var(--mut)",zIndex:20}}>No matching associations</div>}
      </div>
      <p style={{fontSize:11.5,color:"var(--mut)",marginTop:6}}>Collaborated events appear in both associations' portals.</p>
    </div>}
  </div>;
}


// ── Division (gender / age) helpers — shared by manual import, edit results,
//    and the results page. Stored as a normalized token set on entry.div. ──
const DIV_COLOR={M:"#1f6fd6",F:"#e8455f",Mix:"#8b5cf6",Jr:"#4caf50"};
const DIV_LABEL={M:"Male",F:"Female",Mix:"Mixed",Jr:"Junior"};
// Allowed gender bases (one of) plus optional Jr.
function parseDiv(div){
  // returns {gender:"M"|"F"|"Mix"|null, jr:bool}
  const t=(div||"").toString();
  let gender=null;
  if(/\bmix/i.test(t)||/\bX\b/i.test(t)) gender="Mix";
  else if(/\bf(emale)?\b/i.test(t)||/\bgirl/i.test(t)||/\bwomen/i.test(t)) gender="F";
  else if(/\bm(ale)?\b/i.test(t)||/\bboy/i.test(t)||/\bmen\b/i.test(t)) gender="M";
  const jr=/\bjr\b|\bjun/i.test(t)||/junior/i.test(t)||/youth/i.test(t)||/\bU1[0-9]\b/i.test(t);
  return {gender,jr};
}
function divTokens(div){
  const {gender,jr}=parseDiv(div);
  const out=[]; if(gender)out.push(gender); if(jr)out.push("Jr"); return out;
}
function divToString(tokens){
  // canonical storage e.g. "F Jr"
  const g=tokens.find(t=>t!=="Jr"); const jr=tokens.includes("Jr");
  return [g,jr?"Jr":null].filter(Boolean).join(" ");
}

// Strip stray markdown / leading heading / duplicated name from AI summaries
const cleanAISummary=(t)=>{
  let s=(t||"").trim();
  s=s.replace(/^\s*#{1,6}\s.*?(\n|$)/,"");          // drop leading "# Heading" line
  s=s.replace(/\*\*(.*?)\*\*/g,"$1").replace(/[*_`#]/g,"");
  s=s.replace(/^\s*[-•]\s+/gm,"");
  return s.replace(/\n{2,}/g,"\n").trim();
};
// Demo events removed — all data now comes from Supabase per association.

/* ── scoring engine ───────────────────────────────────────────────────────
   Rules:
   - DNE can NEVER be discarded
   - All other penalty codes score as fleet+1 for both net and discard ranking
   - RDG/SCP/STP/DPI: the stored value (already a number from the PDF) is used
     for net scoring; for discard ranking they compete as fleet+1 unless already a number
   - Discards applied to the N worst scores (by point value), DNE excluded
   ────────────────────────────────────────────────────────────────────── */
function scoreEvent(ev){
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
  return{rows,fleet,races:Math.max(...ev.entries.map(e=>e.races.length))};
}

function scorePreview(ev){
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

// ── Canonical name key — collapses case, accents, hyphens, punctuation & word
//    order. Two names sharing a canon key are treated as the SAME athlete.
function canonName(nm){
  let s=(nm||"").toLowerCase();
  s=s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  s=s.replace(/ø/g,"o").replace(/ł/g,"l").replace(/đ/g,"d").replace(/ß/g,"ss").replace(/æ/g,"ae").replace(/œ/g,"oe").replace(/þ/g,"th");
  s=s.replace(/-/g," ").replace(/[^a-z0-9\s]/g," ");
  return s.trim().split(/\s+/).filter(Boolean).sort().join(" ");
}
// Stable identity for an event (to detect duplicate imports of the same comp).
function eventKey(ev){
  return `${(ev.name||"").trim().toLowerCase()}|${(ev.date||"").trim()}|${ev.cls||""}|${ev.subclass||""}`;
}

function aggregate(name,evList){
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
    history.push({ev,row:{...row,nat:e.nat||""},role,partner,fleet:s.fleet});
  }
  history.sort((a,b)=>new Date(b.ev.date)-new Date(a.ev.date));
  return{history,wins,podiums,best:best===Infinity?null:best,events:history.length};
}

// Derive athlete's primary nationality from their result history
function athleteNat(name,evList){
  const counts={};
  for(const ev of evList){
    const e=ev.entries.find(x=>x.helm===name||x.crew===name);
    if(e?.nat){counts[e.nat]=(counts[e.nat]||0)+1;}
  }
  if(!Object.keys(counts).length) return META[name]?.nat||"";
  return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];
}

// Build name -> home ISO-A2 (most frequent nationality seen anywhere in the data)
function buildHomeCountry(evList){
  const tally={};
  for(const ev of evList){
    for(const e of (ev.entries||[])){
      const ioc=e.nat||""; if(!ioc) continue;
      const iso=IOC_ISO[ioc]||""; if(!iso) continue;
      for(const nm of [e.helm,e.crew]){
        if(!nm) continue;
        (tally[nm]||(tally[nm]={}));
        tally[nm][iso]=(tally[nm][iso]||0)+1;
      }
    }
  }
  // seed with META nationality (weak weight) so known athletes still resolve
  for(const nm in META){
    const iso=IOC_ISO[META[nm]?.nat||""]||""; if(!iso) continue;
    (tally[nm]||(tally[nm]={})); if(!tally[nm][iso]) tally[nm][iso]=0.5;
  }
  const home={};
  for(const nm in tally){
    home[nm]=Object.entries(tally[nm]).sort((a,b)=>b[1]-a[1])[0][0];
  }
  return home;
}

const avatarColor=name=>{
  const c=["#163a63","#1f4e80","#2a6aa0","#0d6ea0","#264d73","#1a5e8a","#2b557d"];
  let h=0;for(let i=0;i<name.length;i++) h=name.charCodeAt(i)+((h<<5)-h);
  return c[Math.abs(h)%c.length];
};
const initials=n=>n.split(" ").map(w=>w[0]).slice(0,2).join("");

/* ── Supabase ─────────────────────────────────────────────────────────── */
const SB_URL=import.meta.env.VITE_SUPABASE_URL;
const SB_KEY=import.meta.env.VITE_SUPABASE_ANON_KEY;
const sbH=(SB_URL&&SB_KEY)?{"apikey":SB_KEY,"Authorization":`Bearer ${SB_KEY}`,"Content-Type":"application/json","Prefer":"return=representation"}:null;
const sbGet=async p=>{
  if(!sbH) return null;
  try{
    const r=await fetch(`${SB_URL}/rest/v1/${p}`,{headers:sbH});
    if(!r.ok){const err=await r.text();console.error("Supabase GET error",r.status,err);return null;}
    return r.json();
  }catch(e){console.error("Supabase GET network error",e);return null;}
};
const sbPost=async(t,b)=>{
  if(!sbH) return null;
  try{
    const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:"POST",headers:sbH,body:JSON.stringify(b)});
    if(!r.ok){const err=await r.text();console.error("Supabase POST error",r.status,err,JSON.stringify(b).slice(0,200));return null;}
    return r.json();
  }catch(e){console.error("Supabase POST network error",e);return null;}
};
const sbPatch=async(t,f,b)=>{if(!sbH) return;await fetch(`${SB_URL}/rest/v1/${t}?${f}`,{method:"PATCH",headers:sbH,body:JSON.stringify(b)});};
const sbDel=async(t,f)=>{if(!sbH) return;await fetch(`${SB_URL}/rest/v1/${t}?${f}`,{method:"DELETE",headers:{...sbH,"Prefer":""}});};

/* ── Auth (Supabase GoTrue) — minimal, no extra deps ─────────────────────── */
const AUTH_BASE=SB_URL?`${SB_URL}/auth/v1`:null;
const authHeaders=tok=>({"apikey":SB_KEY,"Content-Type":"application/json",...(tok?{"Authorization":`Bearer ${tok}`}:{})});
async function authSignUp(email,password){
  const r=await fetch(`${AUTH_BASE}/signup`,{method:"POST",headers:authHeaders(),body:JSON.stringify({email,password})});
  const d=await r.json(); if(!r.ok) throw new Error(d.msg||d.error_description||d.error||"Sign-up failed"); return d;
}
async function authSignIn(email,password){
  const r=await fetch(`${AUTH_BASE}/token?grant_type=password`,{method:"POST",headers:authHeaders(),body:JSON.stringify({email,password})});
  const d=await r.json(); if(!r.ok) throw new Error(d.msg||d.error_description||d.error||"Sign-in failed"); return d;
}
async function authUser(tok){
  const r=await fetch(`${AUTH_BASE}/user`,{headers:authHeaders(tok)});
  if(!r.ok) return null; return r.json();
}
// profiles table: {user_id (uuid, pk), role, display_name, class_id, athlete_name}
async function fetchProfile(userId,tok){
  if(!sbH) return null;
  try{
    const r=await fetch(`${SB_URL}/rest/v1/profiles?user_id=eq.${userId}&select=*`,{headers:authHeaders(tok)});
    if(!r.ok) return null; const rows=await r.json(); return rows[0]||null;
  }catch{return null;}
}
async function upsertProfile(profile,tok){
  if(!sbH) return null;
  const r=await fetch(`${SB_URL}/rest/v1/profiles`,{method:"POST",
    headers:{...authHeaders(tok),"Prefer":"resolution=merge-duplicates,return=representation"},
    body:JSON.stringify(profile)});
  if(!r.ok) return null; const rows=await r.json(); return rows[0]||null;
}

// Run schema migration for nat column (idempotent)
async function ensureSchema(){
  if(!sbH) return;
  // We attempt a HEAD request on entries with nat filter; if it fails, column doesn't exist
  // Actually we just try to patch with nat:null — Supabase will ignore unknown columns gracefully
  // The safest approach is to include nat in all INSERT payloads and let Supabase handle it
  // If the column is missing, inserts still work (extra field silently ignored) until column added
}

function dbToApp(ev){
  return{id:ev.id,name:ev.name,cls:ev.class,doublehanded:ev.doublehanded,
    venue:ev.venue||"—",country:ev.country||"",date:ev.date||"—",discards:ev.discards,
    scoring:ev.scoring||"",source:ev.source||"Imported",status:ev.status||"Final",
    owner:ev.owner||null,collabs:Array.isArray(ev.collabs)?ev.collabs:(ev.collabs?JSON.parse(ev.collabs):[]),
    subclass:ev.subclass||null,
    entries:(ev.entries||[]).map(e=>({_dbId:e.id,sail:e.sail||"—",nat:e.nat||"",div:e.division||"",
      helm:e.helm_name,crew:e.crew_name||"",races:e.races||[],race_codes:e.race_codes||null,pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null}))};
}
async function saveEventToDb(ev){
  if(!sbH){console.warn("saveEventToDb: no Supabase connection");return null;}
  const evPayload={
    name:ev.name, class:ev.cls, doublehanded:!!ev.doublehanded,
    venue:ev.venue||null, country:ev.country||null, date:ev.date||null,
    discards:ev.discards||1, scoring:ev.scoring||null,
    source:ev.source||null, status:ev.status||"Final",
    owner:ev.owner||null, collabs:ev.collabs||[], subclass:ev.subclass||null,
  };
  const ins=await sbPost("events",evPayload);
  if(!ins?.[0]?.id){
    console.error("saveEventToDb: event insert failed for",ev.name);
    return null;
  }
  const eventId=ins[0].id;
  // Insert entries one by one so a single bad row doesn't kill the whole batch
  const entryErrors=[];
  for(const e of ev.entries){
    const entryPayload={
      event_id:eventId,
      sail:e.sail||"—",
      nat:e.nat||null,
      division:e.div||null,
      helm_name:e.helm||"",
      crew_name:e.crew||null,
      races:Array.isArray(e.races)?e.races:[],
      race_codes:e.race_codes||null,
      pdf_rank:e.pdf_rank||null,
      pdf_net:e.pdf_net||null,
    };
    const r=await sbPost("entries",entryPayload);
    if(!r?.[0]?.id) entryErrors.push(e.helm);
  }
  if(entryErrors.length) console.warn("saveEventToDb: failed entries:",entryErrors);
  else console.log("saveEventToDb: saved",ev.entries.length,"entries for",ev.name);
  return ins;
}
async function updateEventStatus(evId,status){
  await sbPatch("events",`id=eq.${evId}`,{status});
}

/* ── manual form ─────────────────────────────────────────────────────── */
const defRow=n=>({helm:"",crew:"",sail:"",nat:"",div:"",scores:Array(n).fill("")});
const emptyForm=()=>({name:"",cls:"29er",subclass:null,collabs:[],club:"",country:"",date:"",discards:1,numRaces:5,rows:[defRow(5),defRow(5),defRow(5)]});

/* ── HTML (Sailwave) parser ────────────────────────────────────────────────
   Parses the standard Sailwave HTML results format directly in the browser.
   No server round-trip needed.
   ──────────────────────────────────────────────────────────────────────── */
const SCORE_CODES_SET=new Set(["DNF","DNC","DNS","OCS","DSQ","BFD","UFD","RET","RDG","DGM","DNE","SCP","NSC","PRP","TAL","ZFP","STP","DPI","TP5","TPP","TPN","NSC"]);

function parseHtmlScore(raw){
  if(!raw) return null;
  const s=raw.trim().replace(/\xa0/g,' ').replace(/&nbsp;/g,' ').trim();
  if(!s||s==='-'||s==='—') return null;
  const inner=s.replace(/^\(|\)$/g,'');
  const parts=inner.split(/[\s\[\]]+/).filter(Boolean);
  let num=null,code=null;
  for(const p of parts){
    const up=p.replace(/[^A-Z]/g,'').toUpperCase();
    if(SCORE_CODES_SET.has(up)){code=up;}
    else{const ns=p.replace(/[^\d.]/g,'');if(ns){const n=parseFloat(ns);if(!isNaN(n))num=n===Math.floor(n)?Math.floor(n):Math.round(n*100)/100;}}
  }
  if(num!==null) return num;
  if(code) return code;
  return null;
}
// Returns [score, codeAnnotation] — for cells like "(41 UFD)" → [41, "UFD"]
function parseHtmlScoreWithCode(raw){
  if(!raw) return [null,null];
  const s=raw.trim().replace(/\xa0/g,' ').replace(/&nbsp;/g,' ').trim();
  if(!s||s==='-'||s==='—') return [null,null];
  const inner=s.replace(/^\(|\)$/g,'');
  const parts=inner.split(/[\s\[\]]+/).filter(Boolean);
  let num=null,code=null;
  for(const p of parts){
    const up=p.replace(/[^A-Z]/g,'').toUpperCase();
    if(SCORE_CODES_SET.has(up)){code=up;}
    else{const ns=p.replace(/[^\d.]/g,'');if(ns){const n=parseFloat(ns);if(!isNaN(n))num=n===Math.floor(n)?Math.floor(n):Math.round(n*100)/100;}}
  }
  if(num!==null) return [num,code];
  if(code) return [code,null];
  return [null,null];
}

function parseHtmlDate(text){
  const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
  // "as of HH:MM on Month Day, Year"
  let m=text.match(/as\s+of\s+[\d:]+\s+on\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
  if(m){const mo=months[m[1].slice(0,3).toLowerCase()];if(mo)return`${String(parseInt(m[2])).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${m[3]}`;}
  // "As of DD MON YYYY"
  m=text.match(/as\s+of\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if(m){const mo=months[m[2].slice(0,3).toLowerCase()];if(mo)return`${String(parseInt(m[1])).padStart(2,'0')}/${String(mo).padStart(2,'0')}/${m[3]}`;}
  return '';
}

function parseHtml(htmlString){
  try{
    // Sailwave HTML files are ISO-8859-1 encoded. The string received from
    // FileReader.text() may already be mangled if read as UTF-8.
    // Fix: re-encode common latin-1 sequences back to proper unicode.
    const fixEncoding=(s)=>s
      .replace(/\u00c3\u00b8/g,'ø').replace(/\u00c3\u00b1/g,'ñ')
      .replace(/\u00c3\u00a9/g,'é').replace(/\u00c3\u00a0/g,'à')
      .replace(/\u00c3\u00a8/g,'è').replace(/\u00c3\u00bc/g,'ü')
      .replace(/\u00c3\u00b6/g,'ö').replace(/\u00c3\u00a4/g,'ä')
      .replace(/\u00c3\u00bf/g,'ÿ').replace(/\u00c3\u00ab/g,'ë')
      .replace(/\u00c3\u00af/g,'ï').replace(/\u00c3\u00ae/g,'î')
      .replace(/\u00c3\u00aa/g,'ê').replace(/\u00c3\u00a2/g,'â')
      .replace(/\u00c3\u00b4/g,'ô').replace(/\u00c3\u00bb/g,'û')
      .replace(/\u00c3\u0081/g,'Á').replace(/\u00c3\u0089/g,'É')
      .replace(/\u00c3\u008d/g,'Í').replace(/\u00c3\u0093/g,'Ó')
      .replace(/\u00c3\u009a/g,'Ú').replace(/\u00c3\u00a1/g,'á')
      .replace(/\u00c3\u00ad/g,'í').replace(/\u00c3\u00b3/g,'ó')
      .replace(/\u00c3\u00ba/g,'ú').replace(/\u00c3\u00b2/g,'ò')
      .replace(/\u00c3\u009c/g,'Ü').replace(/\u00c3\u0096/g,'Ö')
      .replace(/\u00c3\u0084/g,'Ä').replace(/\u00c3\u00b5/g,'õ')
      .replace(/\u00c3\u00a5/g,'å').replace(/\u00c3\u0085/g,'Å')
      .replace(/\u00c3\u00a6/g,'æ').replace(/\u00c3\u0086/g,'Æ')
      .replace(/\u00c3\u00b8/g,'ø').replace(/\u00c3\u0098/g,'Ø')
      .replace(/\u00c5\u00a1/g,'š').replace(/\u00c5\u00bd/g,'Ž')
      .replace(/\u00c4\u0099/g,'ę').replace(/\u00c4\u0085/g,'ą')
      .replace(/\u00c5\u00bc/g,'ż').replace(/\u00c5\u00ba/g,'ź')
      .replace(/\u00c5\u0082/g,'ł').replace(/\u00c5\u009b/g,'ś')
      .replace(/\u00c4\u0087/g,'ć').replace(/\u00c5\u0084/g,'ń');
    // Also handle the file being read as latin-1 by TextDecoder approach
    const fixLatin=(s)=>{
      // Replace replacement chars from UTF-8 misread of latin-1
      // \xf8=ø, \xf1=ñ, \xe9=é, \xfc=ü, \xf6=ö, \xe4=ä, \xe5=å etc.
      return s.replace(/\ufffd/g,(match,offset)=>{
        // Can't recover from replacement chars without original bytes; just return as-is
        return match;
      });
    };
    const fixedHtml=fixEncoding(htmlString);
    const parser=new DOMParser();
    const doc=parser.parseFromString(fixedHtml,'text/html');
    const title=doc.querySelector('h1')?.textContent?.trim()||'Imported Regatta';
    const bodyText=doc.body?.textContent||'';
    const evDate=parseHtmlDate(bodyText);
    // Extract discards
    let discards=1;
    const discardMatch=bodyText.match(/Discards?\s*:\s*(\d+)/i);
    if(discardMatch) discards=parseInt(discardMatch[1]);

    const fleetGroups=[];
    // Each fleet has a summarytitle h3 + a summarytable
    const fleetHeaders=doc.querySelectorAll('.summarytitle, h3.summarytitle');
    const fleetTables=doc.querySelectorAll('.summarytable');

    // If no summarytable class, grab all tables
    const tables=fleetTables.length?fleetTables:doc.querySelectorAll('table');

    tables.forEach((tbl,tblIdx)=>{
      const fleetName=fleetHeaders[tblIdx]?.textContent?.trim()||'';
      const thead=tbl.querySelector('thead');
      const tbody=tbl.querySelector('tbody');
      if(!thead||!tbody) return;

      // Build column index map from header
      const headers=[...thead.querySelectorAll('th,td')].map(th=>th.textContent.trim().toLowerCase().replace(/[\s\n_()/']+/g,''));
      const colIdx={};
      headers.forEach((h,i)=>{
        if(['rank','rk','pos','pl'].includes(h)) colIdx.rank??=i;
        else if(['helmname','helm','helmsname'].includes(h)) colIdx.helm??=i;
        else if(['crewname','crew','crewsname'].includes(h)) colIdx.crew??=i;
        else if(['sailno','sail','sailnumber'].includes(h)) colIdx.sail??=i;
        else if(['nat','nationality','country'].includes(h)) colIdx.nat??=i;
        else if(['division','div','fleet'].includes(h)) colIdx.div??=i;
        else if(['nett','net','netpts'].includes(h)) colIdx.net??=i;
        else if(['total','totalpts'].includes(h)) colIdx.total??=i;
      });
      // Race columns: look for col class="race" or headers matching F1,R1,F2...
      const raceCols=[];
      headers.forEach((h,i)=>{
        if(/^[rfq]\d{1,2}$/.test(h)||/^race\s*\d+$/i.test(h)) raceCols.push(i);
      });
      // Also check colgroup
      if(!raceCols.length){
        const cols=[...tbl.querySelectorAll('col')];
        cols.forEach((col,i)=>{if(col.className==='race') raceCols.push(i);});
      }

      if(!colIdx.helm&&!colIdx.sail) return;
      if(!raceCols.length) return;

      const entries=[];
      tbody.querySelectorAll('tr.summaryrow,tr').forEach(tr=>{
        const cells=[...tr.querySelectorAll('td')];
        if(cells.length<3) return;
        const get=idx=>(idx!=null&&idx<cells.length)?cells[idx].textContent.trim():'';

        // nat from flag image title attribute
        let nat='';
        if(colIdx.nat!=null){
          const img=cells[colIdx.nat]?.querySelector('img');
          nat=img?.title||img?.alt||get(colIdx.nat);
          nat=nat.trim().toUpperCase();
          if(!/^[A-Z]{3}$/.test(nat)) nat='';
        }

        const sail=get(colIdx.sail)||'—';
        const helm=get(colIdx.helm)||'';
        if(!helm) return;
        const crew=get(colIdx.crew)||'';
        const div=get(colIdx.div)||'';

        let pdfRank=null;
        const rankRaw=get(colIdx.rank).replace(/(st|nd|rd|th)$/i,'');
        if(rankRaw) pdfRank=parseInt(rankRaw)||null;

        let pdfNet=null;
        const netRaw=get(colIdx.net);
        if(netRaw){const n=parseFloat(netRaw);if(!isNaN(n))pdfNet=n===Math.floor(n)?Math.floor(n):Math.round(n*100)/100;}

        const raceResults=raceCols.map(ci=>parseHtmlScoreWithCode(cells[ci]?.textContent));
        const races=raceResults.map(([sc])=>sc).filter(v=>v!==null);
        const race_codes=raceResults.filter(([sc])=>sc!==null).map(([,cd])=>cd||null);
        if(!races.length) return;

        entries.push({helm,crew,sail,nat,div,races,race_codes,pdf_rank:pdfRank,pdf_net:pdfNet});
      });

      if(entries.length) fleetGroups.push({name:fleetName,entries,discards});
    });

    if(!fleetGroups.length) return{ok:false,error:'No results table found in this HTML file.'};

    // Merge Gold/Silver/Bronze fleets
    const gsb=fleetGroups.filter(g=>/gold|silver|bronze|emerald/i.test(g.name));
    const other=fleetGroups.filter(g=>!/gold|silver|bronze|emerald/i.test(g.name));
    if(gsb.length&&!other.length){
      const merged=[];const seen=new Set();
      for(const g of gsb){for(const e of g.entries){const k=e.helm.toLowerCase()+e.sail;if(!seen.has(k)){seen.add(k);merged.push(e);}}}
      return{ok:true,multi:false,name:title,discards,date:evDate,entries:merged};
    }
    if(fleetGroups.length===1) return{ok:true,multi:false,name:title,discards:fleetGroups[0].discards,date:evDate,entries:fleetGroups[0].entries};
    return{ok:true,multi:true,name:title,date:evDate,fleets:fleetGroups.map(g=>({name:g.name,entries:g.entries,discards:g.discards,count:g.entries.length}))};
  }catch(err){
    return{ok:false,error:'HTML parse error: '+err.message};
  }
}


/* ── Calendar grid helper ─────────────────────────────────────────────── */
function buildCalGrid(year, month, evList){
  // Returns 6 rows × 7 cols of {date, isCurrentMonth, isToday, events[]}
  const today=new Date();
  const firstDay=new Date(year,month,1).getDay(); // 0=Sun
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  // Previous month fill
  const prevDays=new Date(year,month,0).getDate();
  for(let i=firstDay-1;i>=0;i--){
    cells.push({day:prevDays-i,month:month-1<0?11:month-1,year:month-1<0?year-1:year,other:true,events:[]});
  }
  // Current month
  for(let d=1;d<=daysInMonth;d++){
    const isToday=today.getFullYear()===year&&today.getMonth()===month&&today.getDate()===d;
    const dayEvs=evList.filter(ev=>{
      const p=ev.date.split('/');
      if(p.length!==3) return false;
      return parseInt(p[0])===d&&parseInt(p[1])-1===month&&parseInt(p[2])===year;
    });
    cells.push({day:d,month,year,other:false,today:isToday,events:dayEvs});
  }
  // Next month fill
  let next=1;
  while(cells.length%7!==0) cells.push({day:next++,month:month+1>11?0:month+1,year:month+1>11?year+1:year,other:true,events:[]});
  // Split into rows
  const rows=[];for(let i=0;i<cells.length;i+=7)rows.push(cells.slice(i,i+7));
  return rows;
}

/* ── CalendarBody: month-grid day view + year overview, with pie-split circles ── */
// Build a conic-gradient style for a day circle split by class (pie).
function classPie(comps){
  if(!comps||!comps.length) return null;
  // count per class, preserve order of first appearance
  const order=[]; const counts={};
  comps.forEach(ev=>{const c=ev.cls;if(!(c in counts)){counts[c]=0;order.push(c);}counts[c]++;});
  const total=comps.length;
  if(order.length===1) return {background:classColor(order[0])};
  let acc=0; const segs=[];
  order.forEach(c=>{const start=acc/total*360;acc+=counts[c];const endd=acc/total*360;segs.push(`${classColor(c)} ${start}deg ${endd}deg`);});
  return {background:`conic-gradient(${segs.join(",")})`};
}

function CalendarBody({events,allEvents,year,month,setYear,setMonth,viewMode,setViewMode,onPick,eventLabel}){
  const today=React.useMemo(()=>new Date(),[]);
  const DAYS=React.useMemo(()=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],[]);
  // Scroll refs
  const yearScrollRef=React.useRef(null);
  const monthScrollRef=React.useRef(null);
  // Prevent programmatic scroll from triggering IO update loop
  const progScrollRef=React.useRef(false);   // true while doing programmatic scroll
  const fromScrollRef=React.useRef(false);   // (legacy) true when IO just set year/month
  const navTargetRef=React.useRef(true);     // true when a nav button / year-click set the target → scroll to it
  const scrollTimerRef=React.useRef(null);
  // Always-fresh refs for scroll handlers (avoid stale closures)
  const yrRef=React.useRef(year); yrRef.current=year;
  const moRef=React.useRef({year,month}); moRef.current={year,month};

  // ── Year view: scroll to current year whenever we enter it
  React.useEffect(()=>{
    if(viewMode!=="year"||!yearScrollRef.current) return;
    const el=yearScrollRef.current.querySelector(`[data-yr="${year}"]`);
    if(el){
      progScrollRef.current=true;
      el.scrollIntoView({block:"start",behavior:"instant"});
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current=setTimeout(()=>{progScrollRef.current=false;},200);
    }
  },[viewMode,year]); // year dep so < > nav buttons scroll correctly

  // ── Year view: update header year as user scrolls
  React.useEffect(()=>{
    if(viewMode!=="year"||!yearScrollRef.current) return;
    const c=yearScrollRef.current;
    const onScroll=()=>{
      if(progScrollRef.current) return;
      const cr=c.getBoundingClientRect();
      for(const el of c.querySelectorAll("[data-yr]")){
        if(el.getBoundingClientRect().bottom>cr.top+10){
          const yr=parseInt(el.dataset.yr);
          if(!isNaN(yr)&&yr!==yrRef.current) setYear(yr);
          break;
        }
      }
    };
    c.addEventListener("scroll",onScroll,{passive:true});
    return()=>c.removeEventListener("scroll",onScroll);
  },[viewMode]);

  // ── Month view: scroll to a month ONLY when the change came from a nav button
  //    or the year picker (navTargetRef), never from the user's own scrolling.
  React.useEffect(()=>{
    if(viewMode!=="month"||!monthScrollRef.current) return;
    if(!navTargetRef.current){navTargetRef.current=true;return;} // change came from scrolling → skip, re-arm
    const el=monthScrollRef.current.querySelector(`[data-ym="${year}-${month}"]`);
    if(el){
      progScrollRef.current=true;
      clearTimeout(scrollTimerRef.current);
      el.scrollIntoView({block:"start",behavior:"instant"});
      scrollTimerRef.current=setTimeout(()=>{progScrollRef.current=false;},250);
    }
  },[year,month,viewMode]);

  // ── Month view: update the header as the user scrolls (rAF-throttled, read-only).
  React.useEffect(()=>{
    if(viewMode!=="month"||!monthScrollRef.current) return;
    const c=monthScrollRef.current;
    let ticking=false;
    const read=()=>{
      ticking=false;
      if(progScrollRef.current) return;            // ignore our own programmatic scroll
      const cr=c.getBoundingClientRect();
      const anchor=cr.top+8;
      let pick=null;
      for(const el of c.querySelectorAll("[data-ym]")){
        const r=el.getBoundingClientRect();
        if(r.top<=anchor&&r.bottom>anchor){pick=el;break;}
        if(r.top>anchor){pick=pick||el;break;}     // fallback: first below the anchor
      }
      if(!pick) return;
      const [ys,ms]=pick.dataset.ym.split("-");
      const y=parseInt(ys),m=parseInt(ms);
      const cur=moRef.current;
      if(!isNaN(y)&&!isNaN(m)&&(y!==cur.year||m!==cur.month)){
        navTargetRef.current=false;                // header update from scroll, don't re-scroll
        setYear(y);setMonth(m);
      }
    };
    const onScroll=()=>{ if(!ticking){ticking=true;requestAnimationFrame(read);} };
    c.addEventListener("scroll",onScroll,{passive:true});
    return()=>c.removeEventListener("scroll",onScroll);
  },[viewMode]);

  // ── Fixed render range: Jan 1990 → Dec (currentYear + 3). Stable across data
  //    and filter changes, so the month list never re-renders mid-scroll (which
  //    was causing the scroll-up jumpiness). Re-derives only when the year rolls.
  const lo=1990;
  const hi=today.getFullYear()+3;
  const yearList=[];for(let y=lo;y<=hi;y++)yearList.push(y);
  // Month list (memoized stable ref) — declared before any early return so hook
  // order stays constant across year/month views.
  const allMonths=React.useMemo(()=>{
    const out=[];
    for(let y=lo;y<=hi;y++) for(let m=0;m<12;m++) out.push({year:y,month:m});
    return out;
  },[lo,hi]);

  // ── YEAR VIEW
  if(viewMode==="year"){
    const openMonth=(y,mi)=>{setYear(y);setMonth(mi);setViewMode("month");};
    return(
      <div className="cal-year-scroll" ref={yearScrollRef}>
        {yearList.map(y=>(
          <div key={y} className="cal-year-block" data-yr={y}>
            <div className="cal-year-label">{y}</div>
            <div className="cal-year-grid">
              {MON.map((mn,mi)=>(
                <div key={mi} className="cal-mini" onClick={()=>openMonth(y,mi)}>
                  <div className="cal-mini-name">{mn}</div>
                  <div className="cal-mini-dow">{["S","M","T","W","T","F","S"].map((d,k)=><span key={k}>{d}</span>)}</div>
                  <div className="cal-mini-grid">
                    {buildCalGrid(y,mi,events).flat().map((c,ci)=>{
                      const comps=c.other?[]:c.events;
                      const isT=!c.other&&today.getFullYear()===y&&today.getMonth()===mi&&today.getDate()===c.day;
                      const pie=comps.length?classPie(comps):null;
                      const st=pie?{...pie,color:"#fff",fontWeight:700}
                              :isT?{background:"var(--accent)",color:"#fff",fontWeight:700}:{};
                      return<span key={ci} className={"cal-mini-day"+(c.other?" o":"")} style={st}>{c.day}</span>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── MONTH VIEW — continuous scroll (Apple Calendar style)

  return(
    <div className="cal-month-scroll" ref={monthScrollRef}>
      <CalMonthList months={allMonths} events={events} onPick={onPick} eventLabel={eventLabel} today={today} DAYS={DAYS}/>
    </div>
  );
}

// Memoized so the (480-month) grid only re-renders when events change — NOT on
// every scroll-driven year/month header update. This is what keeps scroll smooth.
// Custom comparator ignores onPick/eventLabel identity (they're stable in intent,
// just re-created each parent render) so scrolling never forces a 480-grid rebuild.
const CalMonthList=React.memo(function CalMonthList({months,events,onPick,eventLabel,today,DAYS}){
  // keep latest callbacks without re-rendering on their identity change
  const cbRef=React.useRef({onPick,eventLabel});
  cbRef.current={onPick,eventLabel};
  return months.map(({year:y,month:m})=>(
    <div key={`${y}-${m}`} data-ym={`${y}-${m}`} className="cal-month-block">
      <div className="cal-month-lbl">{MON[m]} {y}</div>
      <div className="cal-grid">{DAYS.map(d=><div key={d} className="cal-dow">{d}</div>)}</div>
      <div className="cal-grid">
        {buildCalGrid(y,m,events).flat().map((cell,i)=>{
          const comps=cell.other?[]:cell.events;
          const pie=comps.length?classPie(comps):null;
          const isT=!cell.other&&today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===cell.day;
          return(
            <div key={i} className={`cal-cell${cell.other?" other-month":""}${isT?" today":""}`}>
              <div className="cal-cell-num" style={pie?{...pie,color:"#fff"}:isT?{background:"var(--accent)",color:"#fff"}:{}}>{cell.day}</div>
              {comps.map(ev=>(
                <div key={ev.id} className="cal-cell-ev" style={{background:classColor(ev.cls)}} title={ev.name} onClick={()=>cbRef.current.onPick(ev)}>
                  {cbRef.current.eventLabel?cbRef.current.eventLabel(ev):ev.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  ));
},(prev,next)=>prev.months===next.months&&prev.events===next.events&&prev.today===next.today&&prev.DAYS===next.DAYS);

/* ── World SVG map fallback (no API key required) ───────────────────── */
function WorldSVGMap({countryData}){
  // Uses a simple SVG world map with country ISO codes
  // Country outlines via Natural Earth embedded as simplified paths
  // We use a data-viz approach: colored circles on lat/lon positions
  const COUNTRY_COORDS={
    HK:[114.1,22.3],GB:[-1.5,52.4],AU:[133.8,-25.3],NZ:[172.5,-40.9],
    FR:[2.2,46.2],DE:[10.4,51.2],IT:[12.6,42.5],ES:[-3.7,40.4],
    NL:[5.3,52.1],DK:[9.6,56.3],SE:[15.2,59.3],NO:[8.5,60.5],
    FI:[25.7,61.9],JP:[138.3,36.2],CN:[104.2,35.9],KR:[127.8,36.5],
    SG:[103.8,1.4],TH:[100.5,13.7],AR:[-64.0,-34.0],BR:[-51.9,-14.2],
    CL:[-71.5,-35.7],US:[-95.7,37.1],CA:[-96.8,60.1],MX:[-102.5,23.6],
    IE:[-8.2,53.4],PT:[-8.2,39.4],BE:[4.5,50.5],CH:[8.2,46.8],
    AT:[14.5,47.5],PL:[19.1,52.1],CZ:[15.5,49.8],HU:[19.5,47.2],
    HR:[15.2,45.1],SI:[14.9,46.1],GR:[21.8,38.7],TR:[35.2,39.0],
    IL:[34.9,31.0],ZA:[25.1,-29.0],EG:[30.0,26.8],NG:[8.7,9.1],
    RU:[105.3,61.5],UA:[31.4,49.0],EE:[25.0,58.7],LV:[24.9,57.0],
    LT:[23.9,55.9],SK:[19.5,48.7],RS:[21.0,44.0],ME:[19.3,42.8],
    CY:[33.1,35.1],MT:[14.4,35.9],IS:[-18.1,65.0],NOR:[8.5,60.5],
    BRA:[-51.9,-14.2],ARG:[-64.0,-34.0],
  };
  const maxCount=Math.max(...Object.values(countryData),1);
  // Simple equirectangular projection
  const W=640,H=320;
  const toXY=(lng,lat)=>[(lng+180)*(W/360),(90-lat)*(H/180)];
  return(
    <div style={{background:"#0d1b2a",borderRadius:14,overflow:"hidden",position:"relative"}}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:"auto",display:"block"}}>
        {/* Ocean background */}
        <rect width={W} height={H} fill="#0d1b2a"/>
        {/* Grid lines */}
        {[-60,-30,0,30,60].map(lat=>{
          const y=(90-lat)*(H/180);
          return<line key={lat} x1={0} y1={y} x2={W} y2={y} stroke="#1a2e44" strokeWidth={0.5}/>;
        })}
        {[-120,-60,0,60,120].map(lng=>{
          const x=(lng+180)*(W/360);
          return<line key={lng} x1={x} y1={0} x2={x} y2={H} stroke="#1a2e44" strokeWidth={0.5}/>;
        })}
        {/* Country dots */}
        {Object.entries(countryData).map(([iso,count])=>{
          const coords=COUNTRY_COORDS[iso];
          if(!coords) return null;
          const [x,y]=toXY(coords[0],coords[1]);
          const intensity=count/maxCount;
          const r=8+intensity*14;
          const opacity=0.5+intensity*0.5;
          return(
            <g key={iso}>
              <circle cx={x} cy={y} r={r+4} fill={`rgba(220,50,50,${opacity*0.3})`}/>
              <circle cx={x} cy={y} r={r} fill={`rgba(220,50,50,${opacity})`}/>
              <title>{iso}: {count} competition{count!==1?"s":""}</title>
            </g>
          );
        })}
        {/* Labels for competed countries */}
        {Object.entries(countryData).map(([iso,count])=>{
          const coords=COUNTRY_COORDS[iso];
          if(!coords) return null;
          const [x,y]=toXY(coords[0],coords[1]);
          return<text key={iso+"l"} x={x} y={y+24} textAnchor="middle" fill="#9fbdd9" fontSize={9} fontWeight={700}>{iso}</text>;
        })}
      </svg>
      <div style={{padding:"8px 14px 10px",display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
        {Object.entries(countryData).sort((a,b)=>b[1]-a[1]).map(([iso,count])=>(
          <span key={iso} style={{fontSize:11,color:"#9fbdd9",display:"flex",alignItems:"center",gap:4}}>
            <span style={{width:8,height:8,borderRadius:"50%",background:`rgba(220,50,50,${0.5+count/Math.max(...Object.values(countryData),1)*0.5})`,display:"inline-block"}}/>
            {iso} ({count})
          </span>
        ))}
      </div>
    </div>
  );
}


/* ── SailingGlobe v4 + FootprintModal — self-contained (no Mapbox, no API key) ─
   Tiered red shading by # competitions · sticky country spotlight · dark popup. */
const GLOBE_COUNTRIES=[{"i":"FJ","r":[[[180,-16.1],[179.4,-16.8],[178.6,-16.6],[179.4,-16.4],[180,-16.1]],[[178.1,-17.5],[178.7,-17.6],[177.9,-18.3],[177.3,-17.7],[178.1,-17.5]]]},{"i":"TZ","r":[[[33.9,-0.9],[37.7,-3.1],[39.2,-4.7],[38.8,-6.5],[39.5,-7.1],[39.3,-8.0],[39.5,-9.1],[40.3,-10.3],[39.5,-10.9],[37.8,-11.3],[36.8,-11.6],[35.3,-11.4],[34.3,-10.2],[33.7,-9.4],[32.2,-8.9],[31.2,-8.6],[30.7,-8.3],[29.6,-6.5],[29.5,-5.4],[29.8,-4.5],[30.5,-3.6],[30.7,-3.0],[30.5,-2.4],[30.8,-2.3],[30.4,-1.1],[31.9,-1.0],[33.9,-0.9]]]},{"i":"EH","r":[[[-8.7,27.7],[-8.7,27.4],[-12.0,25.9],[-12.9,23.3],[-12.9,21.3],[-17.1,21.0],[-17.0,21.4],[-14.6,21.9],[-13.9,23.7],[-12.0,26.0],[-11.4,26.9],[-10.2,26.9],[-9.4,27.1],[-8.8,27.7],[-8.7,27.7]]]},{"i":"CA","r":[[[-122.8,49],[-123.0,49.0],[-124.9,50.0],[-125.6,50.4],[-127.4,50.8],[-128.0,51.7],[-127.9,52.3],[-129.1,52.8],[-129.3,53.6],[-130.5,54.3],[-130.5,54.8],[-130.0,55.3],[-130.0,55.9],[-131.7,56.6],[-132.7,57.7],[-133.4,58.4],[-134.3,58.9],[-134.9,59.3],[-135.5,59.8],[-136.5,59.5],[-137.5,58.9],[-138.3,59.6],[-139.0,60],[-140.0,60.3],[-141.0,60.3],[-141.0,66.0],[-141.0,69.7],[-139.1,69.5],[-137.5,69.0],[-136.5,68.9],[-135.6,69.3],[-134.4,69.6],[-132.9,69.5],[-131.4,69.9],[-129.8,70.2],[-129.1,69.8],[-128.4,70.0],[-128.1,70.5],[-127.4,70.4],[-125.8,69.5],[-124.4,70.2],[-124.3,69.4],[-123.1,69.6],[-122.7,69.9],[-121.5,69.8],[-119.9,69.4],[-117.6,69.0],[-116.2,68.8],[-115.2,68.9],[-113.9,68.4],[-115.3,67.9],[-113.5,67.7],[-110.8,67.8],[-109.9,68.0],[-108.9,67.4],[-107.8,67.9],[-108.8,68.3],[-108.2,68.7],[-107.0,68.7],[-106.2,68.8],[-105.3,68.6],[-104.3,68.0],[-103.2,68.1],[-101.5,67.6],[-99.9,67.8],[-98.4,67.8],[-98.6,68.4],[-97.7,68.6],[-96.1,68.2],[-96.1,67.3],[-95.5,68.1],[-94.7,68.1],[-94.2,69.1],[-95.3,69.7],[-96.5,70.1],[-96.4,71.2],[-95.2,71.9],[-93.9,71.8],[-92.9,71.3],[-91.5,70.2],[-92.4,69.7],[-90.5,69.5],[-90.6,68.5],[-89.2,69.3],[-88.0,68.6],[-88.3,67.9],[-87.4,67.2],[-86.3,67.9],[-85.6,68.8],[-85.5,69.9],[-84.1,69.8],[-82.6,69.7],[-81.3,69.2],[-81.2,68.7],[-82.0,68.1],[-81.3,67.6],[-81.4,67.1],[-83.3,66.4],[-84.7,66.3],[-85.8,66.6],[-86.1,66.1],[-87.0,65.2],[-87.3,64.8],[-88.5,64.1],[-89.9,64.0],[-90.7,63.6],[-90.8,63.0],[-91.9,62.8],[-93.2,62.0],[-94.2,60.9],[-94.6,60.1],[-94.7,58.9],[-93.2,58.8],[-92.8,57.8],[-92.3,57.1],[-90.9,57.3],[-89.0,56.9],[-88.0,56.5],[-87.3,56.0],[-86.1,55.7],[-85.0,55.3],[-83.4,55.2],[-82.3,55.1],[-82.4,54.3],[-82.1,53.3],[-81.4,52.2],[-79.9,51.2],[-79.1,51.5],[-78.6,52.6],[-79.1,54.1],[-79.8,54.7],[-78.2,55.1],[-77.1,55.8],[-76.5,56.5],[-76.6,57.2],[-77.3,58.1],[-78.5,58.8],[-77.3,59.9],[-77.8,60.8],[-78.1,62.3],[-77.4,62.6],[-75.7,62.3],[-74.7,62.2],[-73.8,62.4],[-72.9,62.1],[-71.7,61.5],[-71.4,61.1],[-69.6,61.1],[-69.6,60.2],[-69.3,59.0],[-68.4,58.8],[-67.6,58.2],[-66.2,58.8],[-65.2,59.9],[-64.6,60.3],[-63.8,59.4],[-62.5,58.2],[-61.4,57.0],[-61.8,56.3],[-60.5,55.8],[-59.6,55.2],[-58.0,54.9],[-57.3,54.6],[-56.9,53.8],[-56.2,53.6],[-55.8,53.3],[-55.7,52.1],[-56.4,51.8],[-57.1,51.4],[-58.8,51.1],[-60.0,50.2],[-61.7,50.1],[-63.9,50.3],[-65.4,50.3],[-66.4,50.2],[-67.2,49.5],[-68.5,49.1],[-70.0,47.7],[-71.1,46.8],[-70.3,47.0],[-68.7,48.3],[-66.6,49.1],[-65.1,49.2],[-64.2,48.7],[-65.1,48.1],[-64.8,47.0],[-64.5,46.2],[-63.2,45.7],[-61.5,45.9],[-60.5,47.0],[-60.4,46.3],[-59.8,45.9],[-61.0,45.3],[-63.3,44.7],[-64.2,44.3],[-65.4,43.5],[-66.1,43.6],[-66.2,44.5],[-64.4,45.3],[-66.0,45.3],[-67.1,45.1],[-67.8,45.7],[-67.8,47.1],[-68.2,47.4],[-68.9,47.2],[-69.2,47.4],[-70.0,46.7],[-70.3,45.9],[-70.7,45.5],[-71.1,45.3],[-71.4,45.3],[-71.5,45.0],[-73.3,45.0],[-74.9,45.0],[-75.3,44.8],[-76.4,44.1],[-76.5,44.0],[-76.8,43.6],[-77.7,43.6],[-78.7,43.6],[-79.2,43.5],[-79.0,43.3],[-78.9,43.0],[-78.9,42.9],[-80.2,42.4],[-81.3,42.2],[-82.4,41.7],[-82.7,41.7],[-83.0,41.8],[-83.1,42.0],[-83.1,42.1],[-82.9,42.4],[-82.4,43.0],[-82.1,43.6],[-82.3,44.4],[-82.6,45.3],[-83.6,45.8],[-83.5,46.0],[-83.6,46.1],[-83.9,46.1],[-84.1,46.3],[-84.1,46.5],[-84.3,46.4],[-84.6,46.4],[-84.5,46.5],[-84.8,46.6],[-84.9,46.9],[-85.7,47.2],[-86.5,47.6],[-87.4,47.9],[-88.4,48.3],[-89.3,48.0],[-89.6,48.0],[-90.8,48.3],[-91.6,48.1],[-92.6,48.5],[-93.6,48.6],[-94.3,48.7],[-94.6,48.8],[-94.8,49.4],[-95.2,49.4],[-95.2,49],[-97.2,49.0],[-100.7,49],[-104.0,49.0],[-107.0,49],[-110.0,49],[-113,49],[-116.0,49],[-117.0,49],[-120,49],[-122.8,49]],[[-84.0,62.5],[-81.9,62.9],[-83.1,62.2],[-84.0,62.5]],[[-79.8,72.8],[-80.8,73.7],[-78.1,73.7],[-76.3,72.8],[-78.4,72.9],[-79.8,72.8]],[[-93.6,75.0],[-95.6,74.7],[-96.3,75.4],[-94.0,75.3],[-93.6,75.0]],[[-96.8,78.8],[-95.8,78.1],[-98.1,78.1],[-98.6,78.9],[-96.8,78.8]],[[-88.2,74.4],[-92.4,74.8],[-92.9,75.9],[-96.0,76.4],[-96.7,77.2],[-93.6,76.8],[-90.7,76.4],[-89.8,75.8],[-87.8,75.6],[-84.8,75.7],[-81.1,75.7],[-79.8,74.9],[-81.9,74.4],[-86.1,74.4],[-88.2,74.4]],[[-111.3,78.2],[-110.2,77.7],[-113.5,77.7],[-111.3,78.2]],[[-111.0,78.8],[-110.9,78.4],[-112.5,78.6],[-111.0,78.8]],[[-55.6,51.3],[-56.8,49.8],[-55.5,49.9],[-54.9,49.3],[-53.5,49.2],[-53.1,48.7],[-52.6,47.5],[-53.5,46.6],[-54.0,47.6],[-55.4,46.9],[-55.3,47.4],[-57.3,47.6],[-59.4,47.9],[-59.2,48.5],[-57.4,50.7],[-55.9,51.6],[-55.6,51.3]],[[-83.9,65.1],[-81.6,64.5],[-80.8,64.1],[-81.0,63.4],[-83.1,64.1],[-85.5,63.1],[-87.2,63.5],[-86.2,64.8],[-85.2,65.7],[-84.5,65.4],[-83.9,65.1]],[[-78.8,72.4],[-75.6,72.2],[-74.1,71.3],[-71.2,70.9],[-67.9,70.1],[-68.8,68.7],[-64.9,67.8],[-61.9,66.9],[-63.9,65.0],[-66.7,66.4],[-68.1,65.7],[-65.7,64.6],[-64.7,63.4],[-66.3,62.9],[-67.4,62.9],[-66.2,61.9],[-71.0,62.9],[-71.9,63.7],[-74.8,64.7],[-77.7,64.2],[-77.9,65.3],[-74.0,65.5],[-73.9,66.3],[-72.9,67.7],[-74.8,68.6],[-76.2,69.1],[-78.2,69.8],[-79.5,69.9],[-84.9,70.0],[-88.7,70.4],[-88.5,71.2],[-90.2,72.2],[-88.4,73.5],[-86.6,73.2],[-84.9,73.3],[-80.6,72.7],[-78.8,72.4]],[[-94.5,74.1],[-90.5,73.9],[-93.2,72.8],[-95.4,72.1],[-96.0,73.4],[-94.5,74.1]],[[-122.9,76.1],[-121.2,76.9],[-117.6,77.5],[-116.3,76.9],[-118.0,76.5],[-121.5,75.9],[-122.9,76.1]],[[-132.7,54.0],[-132.0,53.0],[-131.6,52.2],[-132.5,53.1],[-133.2,53.9],[-132.7,54.0]],[[-105.5,79.3],[-100.8,78.8],[-99.7,77.9],[-102.9,78.3],[-104.2,78.7],[-105.5,79.3]],[[-123.5,48.5],[-125.7,48.8],[-126.9,49.5],[-128.1,50.0],[-128.4,50.8],[-126.7,50.4],[-125.4,50.0],[-123.9,49.1],[-123.5,48.5]],[[-121.5,74.4],[-117.6,74.2],[-115.5,73.5],[-119.2,72.5],[-120.5,71.4],[-123.6,71.3],[-125.5,72.3],[-123.9,73.7],[-121.5,74.4]],[[-107.8,75.8],[-105.9,76.0],[-106.3,75.0],[-112.2,74.4],[-113.9,74.7],[-116.3,75.0],[-116.3,76.2],[-112.6,76.1],[-109.1,75.5],[-109.6,76.8],[-108.2,76.2],[-107.8,75.8]],[[-106.5,73.1],[-104.8,71.7],[-102.8,70.5],[-101.1,69.6],[-102.1,69.1],[-104.2,68.9],[-107.1,69.1],[-111.5,68.6],[-113.9,69.0],[-116.1,69.2],[-116.7,70.1],[-113.7,70.2],[-114.3,70.6],[-117.9,70.5],[-116.1,71.3],[-119.4,71.6],[-117.9,72.7],[-114.2,73.1],[-112.4,73.0],[-109.9,73.0],[-108.2,71.7],[-108.4,73.1],[-106.5,73.1]],[[-100.4,72.7],[-100.4,73.8],[-97.4,73.8],[-98.1,73.0],[-96.7,71.7],[-99.3,71.4],[-102.5,72.5],[-100.4,72.7]],[[-106.6,73.6],[-104.5,73.4],[-106.9,73.5],[-106.6,73.6]],[[-98.5,76.7],[-97.7,75.7],[-99.8,74.9],[-100.9,75.6],[-102.6,76.3],[-100.0,76.6],[-98.5,76.7]],[[-96.0,80.6],[-94.3,81.0],[-92.4,81.3],[-89.5,80.5],[-87.0,79.7],[-87.2,79.0],[-90.8,78.2],[-94.0,78.8],[-93.1,79.4],[-96.1,79.7],[-96.0,80.6]],[[-91.6,81.9],[-88.9,82.1],[-85.5,82.7],[-83.2,82.3],[-81.1,83.0],[-76.2,83.2],[-72.8,83.2],[-68.5,83.1],[-63.7,82.9],[-61.9,82.4],[-66.8,81.7],[-65.5,81.5],[-69.5,80.6],[-73.2,79.6],[-76.9,79.3],[-76.2,79.0],[-76.3,78.2],[-78.4,77.5],[-79.6,77.0],[-77.9,76.8],[-83.2,76.5],[-87.6,76.4],[-89.6,77.0],[-88.3,77.9],[-85.0,77.5],[-88.0,78.4],[-85.4,79.0],[-86.5,79.7],[-84.2,80.2],[-81.8,80.5],[-87.6,80.5],[-90.2,81.3],[-91.6,81.9]],[[-75.2,67.4],[-77.0,67.1],[-76.8,68.1],[-75.1,68.0],[-75.2,67.4]],[[-96.3,69.5],[-96.3,68.8],[-98.4,69.0],[-98.9,69.7],[-97.2,69.9],[-96.3,69.5]],[[-64.5,49.9],[-62.9,49.7],[-61.8,49.1],[-63.6,49.4],[-64.5,49.9]],[[-64.0,47.0],[-62.9,46.4],[-62.5,46.0],[-64.1,46.4],[-64.0,47.0]]]},{"i":"US","r":[[[-122.8,49],[-117.0,49],[-113,49],[-107.0,49],[-100.7,49],[-95.2,49],[-94.8,49.4],[-94.3,48.7],[-92.6,48.5],[-90.8,48.3],[-89.3,48.0],[-87.4,47.9],[-85.7,47.2],[-84.8,46.6],[-84.6,46.4],[-84.1,46.5],[-83.9,46.1],[-83.5,46.0],[-82.6,45.3],[-82.1,43.6],[-82.9,42.4],[-83.1,42.0],[-82.7,41.7],[-81.3,42.2],[-78.9,42.9],[-79.0,43.3],[-78.7,43.6],[-76.8,43.6],[-76.4,44.1],[-74.9,45.0],[-71.5,45.0],[-71.1,45.3],[-70.3,45.9],[-69.2,47.4],[-68.2,47.4],[-67.8,45.7],[-67.0,44.8],[-69.1,44.0],[-70.6,43.1],[-70.8,42.3],[-70.1,41.8],[-69.9,41.9],[-70.6,41.5],[-71.9,41.3],[-72.9,41.2],[-72.2,41.1],[-73.3,40.6],[-74.0,40.8],[-74.0,40.4],[-74.9,38.9],[-75.2,39.2],[-75.3,39.0],[-75.1,38.4],[-75.9,37.2],[-75.7,37.9],[-76.3,39.1],[-76.3,38.1],[-76.3,37.9],[-76.0,36.9],[-75.7,35.6],[-77.4,34.5],[-78.6,33.9],[-79.2,33.2],[-80.9,32.0],[-81.5,30.7],[-81.0,29.2],[-80.5,28.0],[-80.1,26.2],[-80.4,25.2],[-81.2,25.2],[-81.7,25.9],[-82.7,27.5],[-82.7,28.6],[-83.7,29.9],[-85.1,29.6],[-85.8,30.2],[-87.5,30.3],[-89.2,30.3],[-89.4,29.9],[-89.2,29.3],[-89.8,29.3],[-90.9,29.1],[-92.5,29.6],[-93.8,29.7],[-95.6,28.7],[-97.1,27.8],[-97.4,26.7],[-97.1,25.9],[-98.2,26.1],[-99.3,26.8],[-100.1,28.1],[-101.0,29.4],[-102.5,29.8],[-103.9,29.3],[-104.7,30.1],[-105.6,31.1],[-106.5,31.8],[-108.2,31.3],[-111.0,31.3],[-114.8,32.5],[-116.0,32.6],[-117.3,33.0],[-118.4,33.7],[-119.1,34.1],[-120.4,34.4],[-120.7,35.2],[-122.5,37.6],[-123.0,38.1],[-123.9,39.8],[-124.2,41.1],[-124.5,42.8],[-124.0,44.6],[-124.1,46.9],[-124.7,48.2],[-123.1,48.0],[-122.3,47.4],[-122.8,49]],[[-155.4,20.1],[-155.1,19.9],[-154.8,19.5],[-155.5,19.1],[-155.9,19.1],[-156.1,19.7],[-155.9,20.0],[-155.9,20.3],[-155.4,20.1]],[[-153.2,58.0],[-152.1,57.6],[-154.0,56.7],[-154.7,57.5],[-153.2,58.0]],[[-141.0,69.7],[-141.0,66.0],[-140.0,60.3],[-138.3,59.6],[-136.5,59.5],[-134.9,59.3],[-133.4,58.4],[-131.7,56.6],[-130.0,55.3],[-130.5,54.8],[-131.1,55.2],[-132.3,56.4],[-134.1,58.1],[-136.6,58.2],[-139.9,59.5],[-142.6,60.1],[-145.9,60.5],[-148.2,60.7],[-148.6,59.9],[-150.6,59.4],[-151.9,59.7],[-150.3,61.0],[-151.9,60.7],[-154.0,59.4],[-154.2,58.1],[-156.3,57.4],[-158.1,56.5],[-159.6,55.6],[-161.2,55.4],[-163.1,54.7],[-164.9,54.6],[-162.9,55.3],[-160.6,56.0],[-158.7,57.0],[-157.7,57.6],[-157.0,58.9],[-158.5,58.8],[-159.7,58.9],[-160.4,59.1],[-162.0,58.7],[-161.9,59.6],[-163.8,59.8],[-165.3,60.5],[-166.1,61.5],[-164.9,62.6],[-163.8,63.2],[-162.3,63.5],[-160.8,63.8],[-161.5,64.4],[-161.4,64.8],[-162.8,64.3],[-165.0,64.4],[-166.8,65.1],[-166.7,66.1],[-163.7,66.6],[-161.7,66.1],[-163.7,67.1],[-165.4,68.0],[-166.2,68.9],[-163.2,69.4],[-161.9,70.3],[-159.0,70.9],[-156.6,71.4],[-154.3,70.7],[-152.2,70.8],[-150.7,70.4],[-147.6,70.2],[-144.9,70.0],[-142.1,69.9],[-141.0,69.7]],[[-171.7,63.8],[-170.5,63.7],[-168.7,63.3],[-169.5,63.0],[-170.7,63.4],[-171.8,63.4],[-171.7,63.8]]]},{"i":"KZ","r":[[[87.4,49.2],[85.8,48.5],[85.2,47.0],[82.5,45.5],[80.0,44.9],[80.2,42.9],[79.6,42.5],[77.7,43.0],[75.6,42.9],[73.6,43.1],[71.8,42.8],[71.0,42.3],[69.1,41.4],[68.3,40.7],[66.7,41.2],[66.0,42.0],[64.9,43.7],[62.0,43.5],[60.2,44.8],[58.5,45.6],[56.0,41.3],[54.8,42.0],[52.9,42.1],[52.4,42.0],[52.5,42.8],[50.9,44.0],[50.3,44.6],[51.3,45.2],[53.0,45.3],[53.0,46.9],[51.2,47.0],[49.1,46.4],[48.7,47.1],[47.3,47.7],[47.0,49.2],[47.5,50.5],[48.7,50.6],[52.3,51.7],[55.7,50.6],[58.4,51.1],[59.9,50.8],[61.6,51.3],[60.9,52.4],[61.7,53.0],[61.4,54.0],[65.7,54.6],[69.1,55.4],[71.2,54.1],[73.5,54.0],[74.4,53.5],[76.5,54.2],[80.0,50.9],[81.9,50.8],[83.9,50.9],[85.1,50.1],[86.8,49.8],[87.4,49.2]]]},{"i":"UZ","r":[[[56.0,41.3],[58.5,45.6],[60.2,44.8],[62.0,43.5],[64.9,43.7],[66.0,42.0],[66.7,41.2],[68.3,40.7],[69.1,41.4],[71.0,42.3],[70.4,41.5],[71.9,41.4],[71.8,40.1],[70.6,40.2],[70.7,41.0],[69.0,40.1],[67.7,39.6],[68.2,38.9],[67.8,37.1],[66.5,37.4],[65.2,38.4],[63.5,39.4],[61.9,41.1],[60.5,41.2],[60.0,42.2],[57.8,42.2],[57.1,41.3],[56.0,41.3]]]},{"i":"PG","r":[[[141.0,-2.6],[144.6,-3.9],[145.8,-4.9],[147.6,-6.1],[147.0,-6.7],[148.1,-8.0],[149.3,-9.1],[150.0,-9.7],[150.8,-10.3],[150.0,-10.7],[148.9,-10.3],[147.1,-9.5],[146.0,-8.1],[143.9,-7.9],[143.4,-9.0],[142.1,-9.2],[141.0,-5.9],[141.0,-2.6]],[[152.6,-3.7],[153.1,-4.5],[152.6,-4.2],[152.0,-3.5],[150.7,-2.7],[151.5,-2.8],[152.2,-3.2],[152.6,-3.7]],[[151.3,-5.8],[150.2,-6.3],[148.9,-6.0],[148.4,-5.4],[149.8,-5.5],[150.1,-5.0],[150.8,-5.5],[151.6,-4.8],[152.1,-4.1],[152.3,-4.9],[151.5,-5.6],[151.3,-5.8]],[[154.8,-5.3],[155.5,-6.2],[155.9,-6.8],[155.2,-6.5],[154.5,-5.1],[154.8,-5.3]]]},{"i":"ID","r":[[[141.0,-2.6],[141.0,-9.1],[139.1,-8.1],[137.6,-8.4],[138.7,-7.3],[137.9,-5.4],[135.2,-4.5],[133.4,-4.0],[132.8,-3.7],[132.0,-2.8],[133.8,-2.5],[132.2,-2.2],[130.9,-1.4],[131.9,-0.7],[134.0,-0.8],[134.4,-2.8],[136.3,-2.3],[138.3,-1.7],[139.9,-2.4],[141.0,-2.6]],[[125.0,-8.9],[125.1,-9.4],[123.6,-10.4],[123.6,-9.9],[125.0,-8.9]],[[117.9,4.1],[118.0,2.3],[119.0,0.9],[117.5,0.1],[116.6,-1.5],[116.1,-4.0],[114.9,-4.1],[113.8,-3.4],[112.1,-3.5],[111.0,-3.0],[110.1,-1.6],[109.1,-0.5],[109.1,1.3],[109.8,1.3],[111.2,1.0],[112.4,1.4],[113.8,1.2],[115.1,2.8],[115.9,4.3],[117.9,4.1]],[[129.4,-2.8],[130.8,-3.9],[129.2,-3.4],[127.9,-3.4],[129.4,-2.8]],[[127.9,2.2],[128.6,1.5],[128.6,0.3],[128.0,-0.3],[128.1,-0.9],[127.4,1.0],[127.9,2.2]],[[122.9,0.9],[125.1,1.6],[124.4,0.4],[122.7,0.4],[120.2,0.2],[120.9,-1.4],[123.3,-0.6],[122.8,-0.9],[121.5,-1.9],[122.3,-3.5],[123.2,-5.3],[122.2,-5.3],[121.7,-4.9],[121.6,-4.2],[121.0,-2.6],[120.4,-4.1],[119.8,-5.7],[119.7,-4.5],[119.1,-3.5],[119.2,-2.1],[119.8,0.2],[120.9,1.3],[122.9,0.9]],[[120.3,-10.3],[119.9,-9.4],[120.8,-10.0],[120.3,-10.3]],[[121.3,-8.5],[122.9,-8.1],[121.3,-8.9],[119.9,-8.4],[121.3,-8.5]],[[118.3,-8.4],[119.1,-8.7],[117.3,-9.0],[117.1,-8.5],[117.9,-8.1],[118.3,-8.4]],[[108.5,-6.4],[110.5,-6.9],[112.6,-6.9],[114.5,-7.8],[114.6,-8.8],[112.6,-8.4],[110.6,-8.1],[108.7,-7.6],[106.5,-7.4],[105.4,-6.9],[107.3,-6.0],[108.5,-6.4]],[[104.4,-1.1],[104.9,-2.3],[106.1,-3.1],[105.8,-5.9],[103.9,-5.0],[102.2,-3.6],[100.9,-2.1],[99.3,0.2],[98.6,1.8],[97.2,3.3],[95.4,5.0],[95.9,5.4],[98.4,4.3],[99.7,3.2],[101.7,2.1],[103.1,0.6],[103.4,-0.7],[104.4,-1.1]]]},{"i":"AR","r":[[[-68.6,-52.6],[-67.8,-53.9],[-65.0,-54.7],[-66.5,-55.2],[-67.6,-54.9],[-68.6,-52.6]],[[-57.6,-30.2],[-58.1,-32.0],[-58.3,-33.3],[-58.5,-34.4],[-57.4,-36.0],[-56.8,-36.9],[-59.2,-38.7],[-62.3,-38.8],[-62.3,-40.2],[-62.7,-41.0],[-64.7,-40.8],[-65.0,-42.1],[-63.8,-42.0],[-64.4,-42.9],[-65.3,-44.5],[-66.5,-45.0],[-67.6,-46.3],[-65.6,-47.2],[-67.2,-48.7],[-68.7,-50.3],[-68.8,-51.8],[-68.6,-52.3],[-71.9,-52.0],[-72.3,-50.7],[-73.3,-50.4],[-72.6,-48.9],[-72.4,-47.7],[-71.6,-45.6],[-71.2,-44.8],[-71.8,-44.2],[-71.9,-43.4],[-71.7,-42.1],[-71.7,-39.8],[-70.8,-38.6],[-71.1,-36.7],[-70.4,-35.2],[-69.8,-33.3],[-70.5,-31.4],[-70.0,-29.4],[-69.0,-27.5],[-68.6,-26.5],[-68.4,-24.5],[-67.0,-23.0],[-66.3,-21.8],[-64.4,-22.8],[-62.8,-22.0],[-60.8,-23.9],[-58.8,-24.8],[-57.6,-25.6],[-57.6,-27.4],[-55.7,-27.4],[-54.6,-25.7],[-53.6,-26.1],[-54.5,-27.5],[-56.3,-28.9],[-57.6,-30.2]]]},{"i":"CL","r":[[[-68.6,-52.6],[-67.6,-54.9],[-67.3,-55.3],[-68.6,-55.6],[-70.0,-55.2],[-72.3,-54.5],[-74.7,-52.8],[-72.4,-53.7],[-70.6,-53.6],[-69.3,-52.5],[-68.6,-52.6]],[[-69.6,-17.6],[-69.0,-19.0],[-68.8,-20.4],[-67.8,-22.9],[-67.0,-23.0],[-68.4,-24.5],[-68.6,-26.5],[-69.0,-27.5],[-70.0,-29.4],[-70.5,-31.4],[-69.8,-33.3],[-70.4,-35.2],[-71.1,-36.7],[-70.8,-38.6],[-71.7,-39.8],[-71.7,-42.1],[-71.9,-43.4],[-71.8,-44.2],[-71.2,-44.8],[-71.6,-45.6],[-72.4,-47.7],[-72.6,-48.9],[-73.3,-50.4],[-72.3,-50.7],[-71.9,-52.0],[-68.6,-52.3],[-69.9,-52.5],[-71.0,-53.8],[-72.6,-53.5],[-73.7,-52.8],[-75.3,-51.6],[-75.5,-50.4],[-75.2,-47.7],[-75.6,-46.6],[-74.4,-44.1],[-72.7,-42.4],[-73.7,-43.4],[-74.0,-41.8],[-73.2,-39.3],[-73.6,-37.2],[-72.6,-35.5],[-71.4,-32.4],[-71.4,-30.1],[-70.9,-27.6],[-70.4,-23.6],[-70.2,-19.8],[-69.9,-18.1],[-69.6,-17.6]]]},{"i":"CD","r":[[[29.3,-4.5],[29.4,-5.9],[30.2,-7.1],[30.7,-8.3],[29.0,-8.4],[28.4,-9.2],[28.5,-10.8],[28.6,-12.0],[29.6,-12.2],[28.9,-13.2],[28.2,-12.3],[27.2,-11.6],[25.8,-11.8],[24.8,-11.2],[24.3,-11.0],[23.5,-10.9],[22.4,-11.0],[22.2,-9.9],[21.8,-8.9],[21.7,-7.9],[20.5,-7.3],[20.1,-6.9],[19.4,-7.2],[19.0,-8.0],[18.1,-8.0],[17.1,-7.5],[16.6,-6.6],[13.4,-5.9],[12.7,-6.0],[12.2,-5.8],[12.5,-5.2],[13.0,-4.8],[13.6,-4.5],[14.2,-4.8],[15.2,-4.3],[16.0,-3.5],[16.4,-1.7],[17.5,-0.7],[17.7,-0.1],[17.8,0.9],[18.1,2.4],[18.5,3.5],[18.9,4.7],[20.3,4.7],[21.7,4.2],[22.7,4.6],[23.3,4.6],[24.8,4.9],[25.3,5.2],[26.4,5.2],[27.4,5.2],[28.4,4.3],[29.2,4.4],[30.0,4.2],[30.8,3.5],[31.2,2.2],[30.5,1.6],[29.9,0.6],[29.6,-0.6],[29.3,-1.6],[29.1,-2.3],[29.3,-3.3],[29.3,-4.5]]]},{"i":"SO","r":[[[41.6,-1.7],[41.0,2.8],[42.1,4.2],[43.7,5.0],[47.8,8.0],[48.9,9.5],[48.9,11.0],[48.9,11.4],[49.3,11.4],[50.3,11.7],[51.1,12.0],[51.0,11.2],[50.8,10.3],[50.1,8.1],[48.6,5.3],[46.6,2.9],[44.1,1.1],[42.0,-0.9],[41.6,-1.7]]]},{"i":"KE","r":[[[39.2,-4.7],[37.7,-3.1],[33.9,-0.9],[34.2,0.5],[35.0,1.9],[34.5,3.6],[34.6,4.8],[35.8,5.3],[36.2,4.4],[38.1,3.6],[38.7,3.6],[39.6,3.4],[40.8,4.3],[41.9,3.9],[41.0,-0.9],[40.9,-2.1],[40.3,-2.6],[39.8,-3.7],[39.2,-4.7]]]},{"i":"SD","r":[[[24.6,8.2],[23.5,9.0],[23.6,9.7],[23.0,10.7],[22.9,11.4],[22.5,12.3],[21.9,12.6],[22.3,13.4],[22.5,14.1],[22.6,14.9],[23.9,15.6],[23.9,20],[25,22],[32.9,22],[37.2,21.0],[37.1,19.8],[37.9,18.4],[37.9,17.4],[36.9,17.0],[36.3,14.8],[36.3,13.6],[35.3,12.1],[34.7,10.9],[34.0,9.6],[34.0,9.5],[33.8,10.0],[33.2,10.7],[33.2,12.2],[32.7,12.0],[32.3,11.7],[31.9,10.5],[30.8,9.7],[29.6,10.1],[29.0,9.6],[28.0,9.4],[27.1,9.6],[26.5,9.6],[25.8,10.4],[24.8,9.8],[24.2,8.7],[24.6,8.2]]]},{"i":"TD","r":[[[23.8,19.6],[23.0,15.7],[22.3,14.3],[22.2,13.8],[22.0,13.0],[22.3,12.6],[22.5,11.7],[22.9,11.1],[21.7,10.6],[20.1,9.0],[18.8,9.0],[18.4,8.3],[16.7,7.5],[16.3,7.8],[15.3,7.4],[15.1,8.4],[14.5,9.0],[14.2,10.0],[14.9,10.0],[14.9,10.9],[14.9,12.2],[14.6,13.3],[14.0,14.0],[14.0,15.7],[15.3,17.9],[15.9,20.4],[15.5,21.0],[14.9,22.9],[19.8,21.5],[23.8,19.6]]]},{"i":"HT","r":[[[-71.7,19.7],[-71.7,18.8],[-71.7,18.3],[-72.4,18.2],[-73.5,18.2],[-74.5,18.3],[-73.4,18.5],[-72.3,18.7],[-72.8,19.5],[-73.2,19.9],[-71.7,19.7]]]},{"i":"DO","r":[[[-71.7,18.0],[-71.9,18.6],[-71.6,19.2],[-71.6,19.9],[-70.2,19.6],[-69.8,19.3],[-69.3,19.0],[-68.3,18.6],[-69.2,18.4],[-70.0,18.4],[-70.5,18.2],[-71.0,18.3],[-71.7,17.8],[-71.7,18.0]]]},{"i":"RU","r":[[[49.1,46.4],[48.6,45.8],[47.7,45.6],[46.7,44.6],[47.6,43.7],[47.5,43.0],[48.6,41.8],[48.0,41.4],[47.8,41.2],[47.4,41.2],[46.7,41.8],[46.4,41.9],[45.8,42.1],[45.5,42.5],[44.5,42.7],[43.9,42.6],[43.8,42.7],[42.4,43.2],[40.9,43.4],[40.1,43.6],[40.0,43.4],[38.7,44.3],[37.5,44.7],[36.7,45.2],[37.4,45.4],[38.2,46.2],[37.7,46.6],[39.1,47.0],[39.1,47.3],[38.2,47.1],[38.3,47.5],[38.8,47.8],[39.7,47.9],[39.9,48.2],[39.7,48.8],[40.1,49.3],[40.1,49.6],[38.6,49.9],[38.0,49.9],[37.4,50.4],[36.6,50.2],[35.4,50.6],[35.4,50.8],[35.0,51.2],[34.2,51.3],[34.1,51.6],[34.4,51.8],[33.8,52.3],[32.7,52.2],[32.4,52.3],[32.2,52.1],[31.8,52.1],[31.5,52.7],[31.3,53.1],[31.5,53.2],[32.3,53.1],[32.7,53.4],[32.4,53.6],[31.7,53.8],[31.8,54.0],[31.4,54.2],[30.8,54.8],[31.0,55.1],[30.9,55.6],[29.9,55.8],[29.4,55.7],[29.2,55.9],[28.2,56.2],[27.9,56.8],[27.8,57.2],[27.3,57.5],[27.7,57.8],[27.4,58.7],[28.1,59.3],[28.0,59.5],[29.1,60.0],[28.1,60.5],[30.2,61.8],[31.1,62.4],[31.5,62.9],[30.0,63.6],[30.4,64.2],[29.5,64.9],[30.2,65.8],[29.1,66.9],[30.0,67.7],[28.4,68.4],[28.6,69.1],[29.4,69.2],[31.1,69.6],[32.1,69.9],[33.8,69.3],[36.5,69.1],[40.3,67.9],[41.1,67.5],[41.1,66.8],[40.0,66.3],[38.4,66.0],[33.9,66.8],[33.2,66.6],[34.8,65.9],[34.9,65.4],[34.9,64.4],[36.2,64.1],[37.0,63.8],[37.1,64.3],[36.5,64.8],[37.2,65.1],[39.6,64.5],[40.4,64.8],[39.8,65.5],[42.1,66.5],[43.0,66.4],[43.9,66.1],[44.5,66.8],[43.7,67.4],[44.2,68.0],[43.5,68.6],[46.2,68.2],[46.8,67.7],[45.6,67.6],[45.6,67.0],[46.3,66.7],[47.9,66.9],[48.1,67.5],[50.2,68.0],[53.7,68.9],[54.5,68.8],[53.5,68.2],[54.7,68.1],[55.4,68.4],[57.3,68.5],[58.8,68.9],[59.9,68.3],[61.1,68.9],[60.0,69.5],[60.5,69.8],[63.5,69.5],[64.9,69.2],[68.5,68.1],[69.2,68.6],[68.2,69.1],[68.1,69.4],[66.9,69.5],[67.3,69.9],[66.7,70.7],[66.7,71.0],[68.5,71.9],[69.2,72.8],[69.9,73.0],[72.6,72.8],[72.8,72.2],[71.8,71.4],[72.5,71.1],[72.8,70.4],[72.6,69.0],[73.7,68.4],[73.2,67.7],[71.3,66.3],[72.4,66.2],[72.8,66.5],[73.9,66.8],[74.2,67.3],[75.1,67.8],[74.5,68.3],[74.9,69.0],[73.8,69.1],[73.6,69.6],[74.4,70.6],[73.1,71.4],[74.9,72.1],[74.7,72.8],[75.2,72.9],[75.7,72.3],[75.3,71.3],[76.4,71.2],[75.9,71.9],[77.6,72.3],[79.7,72.3],[81.5,71.8],[80.6,72.6],[80.5,73.6],[82.2,73.8],[84.7,73.8],[86.8,73.9],[86.0,74.5],[87.2,75.1],[88.3,75.1],[90.3,75.6],[92.9,75.8],[93.2,76.0],[95.9,76.1],[96.7,75.9],[98.9,76.4],[100.8,76.4],[101.0,76.9],[102.0,77.3],[104.4,77.7],[106.1,77.4],[104.7,77.1],[107.0,77.0],[107.2,76.5],[108.2,76.7],[111.1,76.7],[113.3,76.2],[114.1,75.8],[113.9,75.3],[112.8,75.0],[110.2,74.5],[109.4,74.2],[110.6,74.0],[112.1,73.8],[113.0,74.0],[113.5,73.3],[114.0,73.6],[115.6,73.8],[118.8,73.6],[119.0,73.1],[123.2,73.0],[123.3,73.7],[125.4,73.6],[127.0,73.6],[128.6,73.0],[129.1,72.4],[128.5,72.0],[129.7,71.2],[131.3,70.8],[132.3,71.8],[133.9,71.4],[135.6,71.7],[137.5,71.3],[138.2,71.6],[139.9,71.5],[139.1,72.4],[140.5,72.8],[149.5,72.2],[150.4,71.6],[153.0,70.8],[157.0,71.0],[159.0,70.9],[159.8,70.5],[159.7,69.7],[160.9,69.4],[162.3,69.6],[164.1,69.7],[165.9,69.5],[167.8,69.6],[169.6,68.7],[170.8,69.0],[170.0,69.7],[170.5,70.1],[173.6,69.8],[175.7,69.9],[178.6,69.4],[180,69.0],[180,65.0],[178.7,64.5],[177.4,64.6],[178.3,64.1],[178.9,63.3],[179.4,63.0],[179.5,62.6],[179.2,62.3],[177.4,62.5],[174.6,61.8],[173.7,61.7],[172.2,61.0],[170.7,60.3],[170.3,59.9],[168.9,60.6],[166.3,59.8],[165.8,60.2],[164.9,59.7],[163.5,59.9],[163.2,59.2],[162.0,58.2],[162.1,57.8],[163.2,57.6],[163.1,56.2],[162.1,56.1],[161.7,55.3],[162.1,54.9],[160.4,54.3],[160.0,53.2],[158.5,53.0],[158.2,51.9],[156.8,51.0],[156.4,51.7],[156.0,53.2],[155.4,55.4],[155.9,56.8],[156.8,57.4],[156.8,57.8],[158.4,58.1],[160.2,59.3],[161.9,60.3],[163.7,61.1],[164.5,62.6],[163.3,62.5],[162.7,61.6],[160.1,60.5],[159.3,61.8],[156.7,61.4],[154.2,59.8],[155.0,59.1],[152.8,58.9],[151.3,58.8],[151.3,59.5],[149.8,59.7],[148.5,59.2],[145.5,59.3],[142.2,59.0],[139.0,57.1],[135.1,54.7],[136.7,54.6],[137.2,54.0],[138.2,53.8],[138.8,54.3],[139.9,54.2],[141.3,53.1],[141.4,52.2],[140.6,51.2],[140.5,50.0],[140.1,48.4],[138.6,47.0],[138.2,46.3],[136.9,45.1],[135.5,44.0],[134.9,43.4],[133.5,42.8],[132.9,42.8],[132.3,43.3],[130.9,42.6],[130.8,42.2],[130.6,42.4],[130.6,42.9],[131.1,42.9],[131.3,44.1],[131.0,45.0],[131.9,45.3],[133.1,45.1],[133.8,46.1],[134.1,47.2],[134.5,47.6],[135.0,48.5],[133.4,48.2],[132.5,47.8],[131.0,47.8],[130.6,48.7],[129.4,49.4],[127.7,49.8],[127.3,50.7],[126.9,51.4],[126.6,51.8],[125.9,52.8],[125.1,53.2],[123.6,53.5],[122.2,53.4],[121.0,53.3],[120.2,52.8],[120.7,52.5],[120.7,52.0],[120.2,51.6],[119.3,50.6],[119.3,50.1],[117.9,49.5],[116.7,49.9],[115.5,49.8],[115.0,50.1],[114.4,50.2],[112.9,49.5],[111.6,49.4],[110.7,49.1],[109.4,49.3],[108.5,49.3],[107.9,49.8],[106.9,50.3],[105.9,50.4],[104.6,50.3],[103.7,50.1],[102.3,50.5],[102.1,51.3],[100.9,51.5],[100.0,51.6],[98.9,52.0],[97.8,51.0],[98.2,50.4],[97.3,49.7],[95.8,50.0],[94.8,50.0],[94.1,50.5],[93.1,50.5],[92.2,50.8],[90.7,50.3],[88.8,49.5],[87.8,49.3],[87.4,49.2],[86.8,49.8],[85.5,49.7],[85.1,50.1],[84.4,50.3],[83.9,50.9],[83.4,51.1],[81.9,50.8],[80.6,51.4],[80.0,50.9],[77.8,53.4],[76.5,54.2],[76.9,54.5],[74.4,53.5],[73.4,53.5],[73.5,54.0],[72.2,54.4],[71.2,54.1],[70.9,55.2],[69.1,55.4],[68.2,55.0],[65.7,54.6],[65.2,54.4],[61.4,54.0],[61.0,53.7],[61.7,53.0],[60.7,52.7],[60.9,52.4],[60.0,52.0],[61.6,51.3],[61.3,50.8],[59.9,50.8],[59.6,50.5],[58.4,51.1],[56.8,51.0],[55.7,50.6],[54.5,51.0],[52.3,51.7],[50.8,51.7],[48.7,50.6],[48.6,49.9],[47.5,50.5],[46.8,49.4],[47.0,49.2],[46.5,48.4],[47.3,47.7],[48.1,47.7],[48.7,47.1],[48.6,46.6],[49.1,46.4]],[[93.8,81.0],[97.9,80.7],[99.9,78.9],[95.0,79.0],[92.5,80.1],[93.8,81.0]],[[102.8,79.3],[105.1,78.3],[101.3,79.2],[102.8,79.3]],[[138.8,76.1],[145.1,75.6],[140.6,74.8],[137.0,75.3],[138.8,76.1]],[[148.2,75.3],[149.6,74.7],[146.1,75.2],[148.2,75.3]],[[139.9,73.4],[142.1,73.9],[143.6,73.2],[140.0,73.3],[139.9,73.4]],[[44.8,80.6],[48.3,80.8],[49.1,80.8],[51.5,80.7],[49.8,80.4],[48.8,80.2],[46.5,80.2],[44.8,80.6]],[[22.7,54.3],[19.7,54.4],[21.3,55.2],[22.8,54.9],[22.7,54.3]],[[53.5,73.7],[55.6,75.1],[61.2,76.3],[66.2,76.8],[68.9,76.5],[64.6,75.7],[58.5,74.3],[55.4,72.4],[57.5,70.7],[53.7,70.8],[51.6,71.5],[52.5,72.2],[54.4,73.6],[53.5,73.7]],[[142.9,53.7],[143.2,51.8],[144.7,49.0],[142.6,47.9],[143.5,46.1],[142.1,46.0],[142.0,47.8],[142.1,49.6],[141.6,51.9],[142.6,53.8],[142.7,54.4],[142.9,53.7]],[[-174.9,67.2],[-174.3,66.3],[-171.9,66.9],[-170.9,65.5],[-172.6,64.5],[-173.9,64.3],[-176.0,64.9],[-177.2,65.5],[-178.9,65.7],[-179.9,65.9],[-180,65.0],[-177.6,68.2],[-174.9,67.2]],[[-178.7,70.9],[-180,71.5],[-179.0,71.6],[-177.7,71.1],[-178.7,70.9]],[[33.4,46.0],[34.4,46.0],[34.9,45.8],[35.0,45.7],[36.5,45.5],[35.2,44.9],[33.3,44.6],[32.5,45.3],[33.6,45.9],[33.4,46.0]]]},{"i":"BS","r":[[[-78.2,25.2],[-77.5,24.3],[-77.8,23.7],[-78.4,24.6],[-78.2,25.2]]]},{"i":"FK","r":[[[-61.2,-51.9],[-59.1,-51.5],[-57.8,-51.5],[-59.4,-52.2],[-60.7,-52.3],[-61.2,-51.9]]]},{"i":"NO","r":[[[15.1,79.7],[17.0,80.1],[21.5,79.0],[18.5,77.8],[17.1,76.8],[13.8,77.4],[13.2,78.0],[10.4,79.7],[13.7,79.7],[15.1,79.7]],[[31.1,69.6],[28.6,69.1],[27.7,70.2],[25.7,69.1],[23.7,68.9],[21.2,69.4],[20.0,69.1],[18.0,68.6],[16.8,68.0],[15.1,66.2],[13.9,64.4],[12.6,64.1],[12.0,61.8],[12.3,60.1],[11.0,58.9],[8.4,58.3],[5.7,58.6],[5.0,62.0],[8.6,63.5],[12.4,65.9],[16.4,68.6],[21.4,70.3],[24.5,71.0],[28.2,71.2],[30.0,70.2],[31.1,69.6]],[[27.4,80.1],[23.0,79.4],[19.9,79.8],[17.4,80.3],[21.9,80.4],[25.4,80.4],[27.4,80.1]],[[24.7,77.9],[20.7,77.7],[20.8,78.3],[23.3,78.1],[24.7,77.9]]]},{"i":"GL","r":[[[-46.8,82.6],[-39.9,83.2],[-35.1,83.6],[-20.8,82.7],[-26.5,82.3],[-31.4,82.0],[-24.8,81.8],[-22.1,81.7],[-20.6,81.5],[-12.8,81.7],[-16.3,80.6],[-20.0,80.2],[-18.9,79.4],[-19.7,77.6],[-20.0,76.9],[-19.8,76.1],[-20.7,75.2],[-21.6,74.2],[-20.8,73.5],[-23.6,73.3],[-22.3,72.2],[-24.8,72.3],[-22.1,71.5],[-23.5,70.5],[-25.5,71.4],[-26.4,70.2],[-22.3,70.1],[-27.7,68.5],[-31.8,68.1],[-34.2,66.7],[-37.0,65.9],[-39.8,65.5],[-40.7,64.1],[-42.8,62.7],[-42.9,61.1],[-44.8,60.0],[-48.3,60.9],[-49.9,62.4],[-52.1,64.3],[-53.7,66.1],[-54.0,67.2],[-51.5,68.7],[-50.9,69.9],[-52.6,69.4],[-54.7,69.6],[-54.4,70.8],[-51.4,70.6],[-54.0,71.5],[-55.8,71.7],[-55.3,73.0],[-57.3,74.7],[-58.6,75.5],[-63.4,76.2],[-68.5,76.1],[-71.4,77.0],[-66.8,77.4],[-73.3,78.0],[-69.4,78.9],[-65.3,79.8],[-67.2,80.5],[-62.2,81.3],[-60.3,82.0],[-54.1,82.2],[-50.4,82.4],[-46.6,82.0],[-46.9,82.2],[-46.8,82.6]]]},{"i":"TF","r":[[[68.9,-48.6],[70.5,-49.1],[70.3,-49.7],[68.7,-49.2],[68.9,-48.6]]]},{"i":"TL","r":[[[125.0,-8.9],[125.9,-8.4],[127.0,-8.3],[127.0,-8.7],[125.1,-9.4],[125.0,-8.9]]]},{"i":"ZA","r":[[[16.3,-28.6],[17.2,-28.4],[17.8,-28.9],[19.0,-29.0],[19.9,-24.8],[20.8,-25.9],[20.9,-26.8],[22.1,-26.3],[22.8,-25.5],[23.7,-25.4],[25.0,-25.7],[25.8,-25.2],[26.5,-24.6],[27.1,-23.6],[29.4,-22.1],[30.3,-22.3],[31.2,-22.3],[31.9,-24.4],[31.8,-25.8],[31.0,-25.7],[30.7,-26.4],[31.3,-27.3],[32.1,-26.7],[32.6,-27.5],[32.2,-28.8],[31.3,-29.4],[30.6,-30.4],[28.9,-32.2],[27.5,-33.2],[25.9,-33.7],[25.2,-33.8],[23.6,-33.8],[22.6,-33.9],[20.7,-34.4],[19.6,-34.8],[18.9,-34.4],[18.4,-34.1],[18.3,-33.3],[18.2,-32.4],[17.6,-30.7],[17.1,-29.9],[16.3,-28.6]]]},{"i":"LS","r":[[[29.0,-29.0],[29.0,-29.7],[28.3,-30.2],[27.7,-30.6],[27.5,-29.2],[28.5,-28.6],[29.0,-29.0]]]},{"i":"MX","r":[[[-117.1,32.5],[-114.7,32.7],[-113.3,32.0],[-109.0,31.3],[-108.2,31.8],[-106.1,31.4],[-105.0,30.6],[-104.5,29.6],[-103.1,29.0],[-101.7,29.8],[-100.5,28.7],[-99.5,27.5],[-99.0,26.4],[-97.5,25.8],[-97.5,25.0],[-97.8,22.9],[-97.7,21.9],[-97.2,20.6],[-96.3,19.3],[-94.8,18.6],[-93.5,18.4],[-92.0,18.7],[-90.8,19.3],[-90.5,20.7],[-89.6,21.3],[-87.7,21.5],[-86.8,21.3],[-87.4,20.3],[-87.4,19.5],[-87.8,18.3],[-88.3,18.5],[-88.8,17.9],[-89.2,18.0],[-90.1,17.8],[-91.0,17.3],[-91.1,16.9],[-90.6,16.5],[-90.5,16.1],[-92.2,15.3],[-92.2,14.8],[-93.4,15.6],[-94.7,16.2],[-96.1,15.8],[-97.3,15.9],[-98.9,16.6],[-100.8,17.2],[-101.9,17.9],[-103.5,18.3],[-105.0,19.3],[-105.7,20.4],[-105.5,20.8],[-105.3,21.4],[-105.7,22.3],[-106.9,23.8],[-108.4,25.2],[-109.4,25.8],[-109.8,26.7],[-110.6,27.9],[-111.8,28.5],[-112.3,29.3],[-113.2,30.8],[-113.9,31.6],[-114.8,31.8],[-114.8,30.9],[-114.3,29.8],[-113.4,28.8],[-113.1,28.4],[-112.8,27.8],[-112.2,27.2],[-111.3,25.7],[-110.7,24.8],[-110.2,24.3],[-109.4,23.4],[-109.9,22.8],[-110.3,23.4],[-111.7,24.5],[-112.1,25.5],[-112.8,26.3],[-113.6,26.6],[-114.5,27.1],[-115.0,27.8],[-114.2,28.1],[-114.9,29.3],[-115.9,30.2],[-116.7,31.6],[-117.1,32.5]]]},{"i":"UY","r":[[[-57.6,-30.2],[-56.0,-30.9],[-54.6,-31.5],[-53.2,-32.7],[-53.4,-33.8],[-54.9,-35.0],[-56.2,-34.9],[-57.8,-34.5],[-58.3,-33.3],[-58.1,-32.0],[-57.6,-30.2]]]},{"i":"BR","r":[[[-53.4,-33.8],[-53.7,-33.2],[-53.2,-32.7],[-53.8,-32.0],[-54.6,-31.5],[-55.6,-30.9],[-56.0,-30.9],[-57.0,-30.1],[-57.6,-30.2],[-56.3,-28.9],[-55.2,-27.9],[-54.5,-27.5],[-53.6,-26.9],[-53.6,-26.1],[-54.1,-25.5],[-54.6,-25.7],[-54.4,-25.2],[-54.3,-24.6],[-54.3,-24.0],[-54.7,-23.8],[-55.0,-24.0],[-55.4,-24.0],[-55.5,-23.6],[-55.6,-22.7],[-55.8,-22.4],[-56.5,-22.1],[-56.9,-22.3],[-57.9,-22.1],[-57.9,-20.7],[-58.2,-20.2],[-57.9,-20.0],[-57.9,-19.4],[-57.7,-19.0],[-57.5,-18.2],[-57.7,-17.6],[-58.3,-17.3],[-58.4,-16.9],[-58.2,-16.3],[-60.2,-16.3],[-60.5,-15.1],[-60.3,-15.1],[-60.3,-14.6],[-60.5,-14.4],[-60.5,-13.8],[-61.1,-13.5],[-61.7,-13.5],[-62.1,-13.2],[-62.8,-13.0],[-63.2,-12.6],[-64.3,-12.5],[-65.4,-11.6],[-65.3,-10.9],[-65.4,-10.5],[-65.3,-9.8],[-66.6,-9.9],[-67.2,-10.3],[-68.0,-10.7],[-68.3,-11.0],[-68.8,-11.0],[-69.5,-11.0],[-70.1,-11.1],[-70.5,-11.0],[-70.5,-9.5],[-71.3,-10.1],[-72.2,-10.1],[-72.6,-9.5],[-73.2,-9.5],[-73.0,-9.0],[-73.6,-8.4],[-74.0,-7.5],[-73.7,-7.3],[-73.7,-6.9],[-73.1,-6.6],[-73.2,-6.1],[-73.0,-5.7],[-72.9,-5.3],[-71.7,-4.6],[-70.9,-4.4],[-70.8,-4.3],[-69.9,-4.3],[-69.4,-1.6],[-69.4,-1.1],[-69.6,-0.5],[-70.0,-0.2],[-70.0,0.5],[-69.5,0.7],[-69.3,0.6],[-69.2,1.0],[-69.8,1.1],[-69.8,1.7],[-67.9,1.7],[-67.5,2.0],[-67.3,1.7],[-67.1,1.1],[-66.9,1.3],[-66.3,0.7],[-65.5,0.8],[-65.4,1.1],[-64.6,1.3],[-64.2,1.5],[-64.1,1.9],[-63.4,2.2],[-63.4,2.4],[-64.3,2.5],[-64.4,3.1],[-64.4,3.8],[-64.8,4.1],[-64.6,4.1],[-63.9,4.0],[-63.1,3.8],[-62.8,4.0],[-62.1,4.2],[-61.0,4.5],[-60.6,4.9],[-60.7,5.2],[-60.2,5.2],[-60.0,5.0],[-60.1,4.6],[-59.8,4.4],[-59.5,4.0],[-59.8,3.6],[-60.0,2.8],[-59.7,2.2],[-59.6,1.8],[-59.0,1.3],[-58.5,1.3],[-58.4,1.5],[-58.1,1.5],[-57.7,1.7],[-57.3,1.9],[-56.8,1.9],[-56.5,1.9],[-56.0,1.8],[-55.9,2.0],[-56.1,2.2],[-56.0,2.5],[-55.6,2.4],[-55.1,2.5],[-54.5,2.3],[-54.1,2.1],[-53.8,2.4],[-53.6,2.3],[-53.4,2.1],[-52.9,2.1],[-52.6,2.5],[-52.2,3.2],[-51.7,4.2],[-51.3,4.2],[-51.1,3.7],[-50.5,1.9],[-50.0,1.7],[-49.9,1.0],[-50.7,0.2],[-50.4,-0.1],[-48.6,-0.2],[-48.6,-1.2],[-47.8,-0.6],[-46.6,-0.9],[-44.9,-1.6],[-44.4,-2.1],[-44.6,-2.7],[-43.4,-2.4],[-41.5,-2.9],[-40.0,-2.9],[-38.5,-3.7],[-37.2,-4.8],[-36.5,-5.1],[-35.6,-5.1],[-35.2,-5.5],[-34.9,-6.7],[-34.7,-7.3],[-35.1,-9.0],[-35.6,-9.6],[-37.0,-11.0],[-37.7,-12.2],[-38.4,-13.0],[-38.7,-13.1],[-39.0,-13.8],[-38.9,-15.7],[-39.2,-17.2],[-39.3,-17.9],[-39.6,-18.3],[-39.8,-19.6],[-40.8,-20.9],[-40.9,-21.9],[-41.8,-22.4],[-42.0,-23.0],[-43.1,-23.0],[-44.6,-23.4],[-45.4,-23.8],[-46.5,-24.1],[-47.6,-24.9],[-48.5,-25.9],[-48.6,-26.6],[-48.5,-27.2],[-48.7,-28.2],[-48.9,-28.7],[-49.6,-29.2],[-50.7,-31.0],[-51.6,-31.8],[-52.3,-32.2],[-52.7,-33.2],[-53.4,-33.8]]]},{"i":"BO","r":[[[-69.5,-11.0],[-68.3,-11.0],[-67.2,-10.3],[-65.3,-9.8],[-65.3,-10.9],[-64.3,-12.5],[-62.8,-13.0],[-61.7,-13.5],[-60.5,-13.8],[-60.3,-14.6],[-60.5,-15.1],[-58.2,-16.3],[-58.3,-17.3],[-57.5,-18.2],[-57.9,-19.4],[-58.2,-20.2],[-59.1,-19.4],[-61.8,-19.6],[-62.3,-21.1],[-62.8,-22.0],[-64.4,-22.8],[-66.3,-21.8],[-67.8,-22.9],[-68.8,-20.4],[-69.0,-19.0],[-69.6,-17.6],[-69.4,-15.7],[-69.3,-15.0],[-68.9,-13.6],[-68.7,-12.6],[-69.5,-11.0]]]},{"i":"PE","r":[[[-69.9,-4.3],[-70.9,-4.4],[-72.9,-5.3],[-73.2,-6.1],[-73.7,-6.9],[-74.0,-7.5],[-73.0,-9.0],[-72.6,-9.5],[-71.3,-10.1],[-70.5,-11.0],[-69.5,-11.0],[-68.9,-12.9],[-68.9,-14.5],[-69.2,-15.3],[-69.0,-16.5],[-69.9,-18.1],[-71.4,-17.8],[-73.4,-16.4],[-76.0,-14.6],[-76.3,-13.5],[-78.1,-10.4],[-79.4,-7.9],[-80.5,-6.5],[-80.9,-5.7],[-81.1,-4.0],[-80.2,-3.8],[-80.4,-4.4],[-79.6,-4.5],[-78.6,-4.5],[-77.8,-3.0],[-75.5,-1.6],[-75.4,-0.2],[-74.4,-0.5],[-73.7,-1.3],[-72.3,-2.4],[-71.4,-2.3],[-70.0,-2.7],[-70.4,-3.8],[-69.9,-4.3]]]},{"i":"CO","r":[[[-66.9,1.3],[-67.3,1.7],[-67.9,1.7],[-69.8,1.1],[-69.3,0.6],[-70.0,0.5],[-69.6,-0.5],[-69.4,-1.6],[-70.4,-3.8],[-70.0,-2.7],[-71.4,-2.3],[-72.3,-2.4],[-73.7,-1.3],[-74.4,-0.5],[-75.4,-0.2],[-76.3,0.4],[-77.4,0.4],[-77.9,0.8],[-79.0,1.7],[-78.7,2.3],[-77.9,2.7],[-77.1,3.8],[-77.3,4.7],[-77.3,5.8],[-77.9,7.2],[-77.4,7.6],[-77.5,8.5],[-76.8,8.6],[-75.7,9.4],[-75.5,10.6],[-74.3,11.1],[-73.4,11.2],[-72.2,12.0],[-71.4,12.4],[-71.3,11.8],[-72.2,11.1],[-72.9,10.5],[-73.3,9.2],[-72.7,8.6],[-72.4,8.0],[-72.4,7.4],[-72.0,7.0],[-70.1,7.0],[-69.0,6.2],[-67.7,6.3],[-67.5,5.6],[-67.8,4.5],[-67.3,3.5],[-67.8,2.8],[-67.2,2.3],[-66.9,1.3]]]},{"i":"PA","r":[[[-77.4,8.7],[-77.2,7.9],[-77.8,7.7],[-78.2,7.5],[-78.2,8.3],[-78.6,8.7],[-79.6,8.9],[-80.2,8.3],[-80.5,8.1],[-80.3,7.4],[-80.9,7.2],[-81.2,7.6],[-81.7,8.1],[-82.4,8.3],[-82.9,8.1],[-82.9,8.4],[-82.9,8.8],[-82.9,9.1],[-82.5,9.6],[-82.2,9.0],[-81.7,9.0],[-80.9,8.9],[-79.9,9.3],[-79.0,9.6],[-78.5,9.4],[-77.7,8.9],[-77.4,8.7]]]},{"i":"CR","r":[[[-82.5,9.6],[-82.9,9.1],[-82.9,8.8],[-82.9,8.4],[-83.5,8.4],[-83.6,8.8],[-83.9,9.3],[-84.6,9.6],[-85.0,10.1],[-85.1,9.6],[-85.7,9.9],[-85.8,10.4],[-85.9,10.9],[-85.6,11.2],[-84.7,11.1],[-84.2,10.8],[-83.7,10.9],[-83.0,10.0],[-82.5,9.6]]]},{"i":"NI","r":[[[-83.7,10.9],[-84.2,10.8],[-84.7,11.1],[-85.6,11.2],[-86.1,11.4],[-86.7,12.1],[-87.7,12.9],[-87.4,12.9],[-87.0,13.0],[-86.7,13.3],[-86.5,13.8],[-86.1,14.0],[-85.7,14.0],[-85.2,14.4],[-85.1,14.6],[-84.8,14.8],[-84.4,14.6],[-84.0,14.7],[-83.5,15.0],[-83.2,14.9],[-83.2,14.3],[-83.5,13.6],[-83.5,12.9],[-83.6,12.3],[-83.7,11.6],[-83.8,11.1],[-83.7,10.9]]]},{"i":"HN","r":[[[-83.1,15.0],[-83.6,14.9],[-84.2,14.7],[-84.6,14.7],[-84.9,14.8],[-85.1,14.6],[-85.5,14.1],[-85.8,13.8],[-86.3,13.8],[-86.8,13.8],[-86.9,13.3],[-87.3,13.0],[-87.8,13.4],[-87.9,13.9],[-88.5,13.8],[-88.8,14.1],[-89.4,14.4],[-89.2,14.9],[-88.7,15.3],[-88.1,15.7],[-87.6,15.9],[-87.4,15.8],[-86.4,15.8],[-86.0,16.0],[-85.4,15.9],[-85.0,16.0],[-84.4,15.8],[-83.8,15.4],[-83.1,15.0]]]},{"i":"SV","r":[[[-89.4,14.4],[-88.8,14.1],[-88.5,13.8],[-87.9,13.9],[-87.8,13.4],[-88.5,13.2],[-89.3,13.5],[-90.1,13.7],[-89.7,14.1],[-89.6,14.4],[-89.4,14.4]]]},{"i":"GT","r":[[[-92.2,14.5],[-92.1,15.1],[-91.7,16.1],[-90.4,16.4],[-90.7,16.7],[-91.5,17.3],[-91.0,17.8],[-89.1,17.8],[-89.2,15.9],[-88.6,15.7],[-88.2,15.7],[-89.2,15.1],[-89.1,14.7],[-89.6,14.4],[-89.7,14.1],[-90.1,13.7],[-91.2,13.9],[-92.2,14.5]]]},{"i":"BZ","r":[[[-89.1,17.8],[-89.0,18.0],[-88.5,18.5],[-88.3,18.4],[-88.1,18.1],[-88.2,17.5],[-88.2,17.0],[-88.6,16.3],[-88.9,15.9],[-89.2,17.0],[-89.1,17.8]]]},{"i":"VE","r":[[[-60.7,5.2],[-61.0,4.5],[-62.8,4.0],[-63.9,4.0],[-64.8,4.1],[-64.4,3.1],[-63.4,2.4],[-64.1,1.9],[-64.6,1.3],[-65.5,0.8],[-66.9,1.3],[-67.4,2.6],[-67.3,3.3],[-67.6,3.8],[-67.7,5.2],[-67.3,6.1],[-68.3,6.2],[-69.4,6.1],[-70.7,7.1],[-72.2,7.3],[-72.5,7.6],[-72.4,8.4],[-72.8,9.1],[-73.0,9.7],[-72.6,10.8],[-72.0,11.6],[-71.4,11.5],[-71.6,11.0],[-72.1,9.9],[-71.3,9.1],[-71.4,10.2],[-70.2,11.4],[-69.9,12.2],[-68.9,11.4],[-68.2,10.6],[-66.2,10.6],[-64.9,10.1],[-64.3,10.6],[-61.9,10.7],[-62.4,9.9],[-60.8,9.4],[-60.2,8.6],[-60.6,7.8],[-60.3,7.0],[-61.2,6.7],[-61.4,6.0],[-60.7,5.2]]]},{"i":"GY","r":[[[-56.5,1.9],[-57.3,1.9],[-58.1,1.5],[-58.5,1.3],[-59.6,1.8],[-60.0,2.8],[-59.5,4.0],[-60.1,4.6],[-60.2,5.2],[-61.4,6.0],[-61.2,6.7],[-60.3,7.0],[-60.6,7.8],[-59.1,8.0],[-58.5,6.8],[-57.5,6.3],[-57.3,5.1],[-57.9,4.6],[-57.6,3.3],[-57.2,2.8],[-56.5,1.9]]]},{"i":"SR","r":[[[-54.5,2.3],[-55.6,2.4],[-56.1,2.2],[-56.0,1.8],[-57.2,2.8],[-57.6,3.3],[-57.9,4.6],[-57.3,5.1],[-55.9,5.8],[-55.0,6.0],[-54.5,4.9],[-54.0,3.6],[-54.3,2.7],[-54.5,2.3]]]},{"i":"FR","r":[[[-51.7,4.2],[-52.6,2.5],[-53.4,2.1],[-53.8,2.4],[-54.5,2.3],[-54.2,3.2],[-54.4,4.2],[-54.0,5.8],[-52.9,5.4],[-51.7,4.2]],[[6.2,49.5],[8.1,49.0],[7.5,47.6],[6.7,47.5],[6.0,46.7],[6.5,46.4],[6.8,45.7],[6.7,45.0],[7.5,44.1],[6.5,43.1],[3.1,43.1],[1.8,42.3],[0.3,42.6],[-1.9,43.4],[-1.2,46.0],[-3.0,47.6],[-4.6,48.7],[-1.6,48.6],[-1.0,49.3],[1.6,50.9],[2.7,50.8],[3.6,50.4],[4.8,50.0],[5.9,49.4],[6.2,49.5]],[[8.7,42.6],[9.6,42.2],[8.8,41.6],[8.7,42.6]]]},{"i":"EC","r":[[[-75.4,-0.2],[-75.5,-1.6],[-77.8,-3.0],[-78.6,-4.5],[-79.6,-4.5],[-80.4,-4.4],[-80.2,-3.8],[-79.8,-2.7],[-80.4,-2.7],[-80.8,-2.0],[-80.6,-0.9],[-80.0,0.4],[-79.5,1.0],[-77.9,0.8],[-77.4,0.4],[-76.3,0.4],[-75.4,-0.2]]]},{"i":"JM","r":[[[-77.6,18.5],[-76.4,18.2],[-76.9,17.9],[-77.8,17.9],[-78.2,18.5],[-77.6,18.5]]]},{"i":"CU","r":[[[-82.3,23.2],[-80.6,23.1],[-79.3,22.4],[-78.0,22.3],[-76.5,21.2],[-75.6,21.0],[-74.9,20.7],[-74.3,20.1],[-75.6,19.9],[-77.8,19.9],[-77.5,20.7],[-78.5,21.0],[-79.3,21.6],[-80.5,22.0],[-82.2,22.4],[-82.8,22.7],[-83.9,22.2],[-84.5,21.8],[-84.4,22.2],[-83.8,22.8],[-82.5,23.1],[-82.3,23.2]]]},{"i":"ZW","r":[[[31.2,-22.3],[30.3,-22.3],[29.4,-22.1],[28.0,-21.5],[27.7,-20.5],[26.2,-19.3],[25.6,-18.5],[26.4,-17.8],[27.0,-17.9],[28.5,-16.5],[28.9,-16.0],[30.3,-15.5],[31.2,-15.9],[31.9,-16.3],[32.8,-16.7],[32.7,-18.7],[32.8,-19.7],[32.5,-20.4],[31.2,-22.3]]]},{"i":"BW","r":[[[29.4,-22.1],[27.1,-23.6],[26.5,-24.6],[25.8,-25.2],[25.0,-25.7],[23.7,-25.4],[22.8,-25.5],[22.1,-26.3],[20.9,-26.8],[20.8,-25.9],[19.9,-24.8],[20.9,-21.8],[21.7,-18.2],[23.6,-18.3],[24.5,-17.9],[25.3,-17.7],[25.9,-18.7],[27.3,-20.4],[27.7,-20.9],[28.8,-21.6],[29.4,-22.1]]]},{"i":"NA","r":[[[19.9,-24.8],[19.0,-29.0],[17.8,-28.9],[17.2,-28.4],[16.3,-28.6],[15.2,-27.1],[14.7,-25.4],[14.4,-22.7],[13.9,-21.7],[12.8,-19.7],[11.8,-18.1],[12.2,-17.1],[13.5,-17.0],[14.2,-17.4],[19.0,-17.8],[23.2,-17.5],[24.7,-17.4],[25.1,-17.7],[24.2,-17.9],[23.2,-17.9],[20.9,-18.3],[19.9,-21.8],[19.9,-24.8]]]},{"i":"SN","r":[[[-16.7,13.6],[-17.6,14.7],[-16.7,15.6],[-16.1,16.5],[-15.1,16.6],[-14.1,16.3],[-12.8,15.3],[-12.1,14.0],[-11.6,13.1],[-11.5,12.4],[-12.2,12.5],[-12.5,12.3],[-13.7,12.6],[-15.8,12.5],[-16.7,12.4],[-15.9,13.1],[-15.5,13.3],[-14.7,13.3],[-13.8,13.5],[-14.4,13.6],[-15.1,13.9],[-15.6,13.6],[-16.7,13.6]]]},{"i":"ML","r":[[[-11.5,12.4],[-11.6,13.1],[-12.1,14.0],[-11.8,14.8],[-11.3,15.4],[-10.1,15.3],[-9.6,15.5],[-5.3,16.2],[-6.0,20.6],[-4.9,25.0],[1.8,20.6],[2.7,19.9],[3.2,19.1],[4.3,16.9],[3.6,15.6],[1.4,15.3],[0.4,14.9],[-0.5,15.1],[-2.0,14.6],[-3.0,13.8],[-3.5,13.3],[-4.3,13.2],[-5.2,11.7],[-5.5,11.0],[-5.8,10.2],[-6.2,10.5],[-6.7,10.4],[-7.6,10.1],[-8.0,10.2],[-8.3,10.8],[-8.6,10.8],[-8.4,11.4],[-8.9,12.1],[-9.3,12.3],[-9.9,12.1],[-10.6,11.9],[-11.0,12.2],[-11.5,12.1],[-11.5,12.4]]]},{"i":"MR","r":[[[-17.1,21.0],[-12.9,21.3],[-12.9,23.3],[-12.0,25.9],[-8.7,27.4],[-6.5,25.0],[-5.5,16.3],[-5.5,15.5],[-9.7,15.3],[-10.7,15.1],[-11.7,15.4],[-12.2,14.6],[-13.4,16.0],[-14.6,16.6],[-15.6,16.4],[-16.5,16.1],[-16.3,17.2],[-16.3,19.1],[-16.3,20.1],[-17.1,21.0]]]},{"i":"BJ","r":[[[2.7,6.3],[1.6,6.8],[1.5,9.3],[1.1,10.2],[0.9,11.0],[1.4,11.5],[2.2,11.9],[2.8,12.2],[3.6,11.3],[3.6,10.3],[3.2,9.4],[2.7,8.5],[2.7,6.3]]]},{"i":"NE","r":[[[14.9,22.9],[15.5,21.0],[15.9,20.4],[15.3,17.9],[14.0,15.7],[14.0,14.0],[14.6,13.3],[14.2,12.8],[14.0,12.5],[13.1,13.6],[11.5,13.3],[10.7,13.2],[9.5,12.9],[7.8,13.3],[6.8,13.1],[5.4,13.9],[4.1,13.5],[3.7,12.6],[2.8,12.2],[2.2,11.9],[1.0,12.9],[0.4,14.0],[0.4,14.9],[1.4,15.3],[3.6,15.6],[4.3,16.9],[5.7,19.6],[12.0,23.5],[14.1,22.5],[14.9,22.9]]]},{"i":"NG","r":[[[2.7,6.3],[2.7,8.5],[3.2,9.4],[3.6,10.3],[3.6,11.3],[3.7,12.6],[4.1,13.5],[5.4,13.9],[6.8,13.1],[7.8,13.3],[9.5,12.9],[10.7,13.2],[11.5,13.3],[13.1,13.6],[14.0,12.5],[14.6,12.1],[14.4,11.6],[13.3,10.2],[13.0,9.4],[12.2,8.3],[11.8,7.4],[11.1,6.6],[10.1,7.0],[9.2,6.4],[8.5,4.8],[7.1,4.5],[5.9,4.3],[5.0,5.6],[3.6,6.3],[2.7,6.3]]]},{"i":"CM","r":[[[14.5,12.9],[15.0,11.6],[15.5,10.0],[14.6,9.9],[14.0,9.5],[15.0,8.8],[15.4,7.7],[14.8,6.4],[14.5,5.5],[14.5,4.7],[15.0,3.9],[15.9,3.0],[16.0,2.3],[15.1,2.0],[13.1,2.3],[12.4,2.2],[11.3,2.3],[9.8,3.1],[8.9,3.9],[8.5,4.5],[8.8,5.5],[9.5,6.5],[10.5,7.1],[11.7,7.0],[12.1,7.8],[12.8,8.7],[13.2,9.6],[13.6,10.8],[14.5,11.9],[14.2,12.5],[14.5,12.9]]]},{"i":"TG","r":[[[0.9,11.0],[1.1,10.2],[1.5,9.3],[1.6,6.8],[1.1,5.9],[0.6,6.9],[0.7,8.3],[0.4,9.5],[-0.0,10.7],[0.9,11.0]]]},{"i":"GH","r":[[[0.0,11.0],[0.4,10.2],[0.5,8.7],[0.5,7.4],[0.8,6.3],[-0.5,5.3],[-2.0,4.7],[-2.8,5.4],[-3.0,7.4],[-2.8,9.6],[-2.9,11.0],[-0.8,10.9],[0.0,11.0]]]},{"i":"CI","r":[[[-8.0,10.2],[-7.6,10.1],[-6.7,10.4],[-6.2,10.5],[-5.8,10.2],[-5.0,10.2],[-4.3,9.6],[-3.5,9.9],[-2.6,8.2],[-3.2,6.3],[-2.9,5.0],[-4.0,5.2],[-5.8,5.0],[-7.5,4.3],[-7.6,5.2],[-7.6,5.7],[-8.3,6.2],[-8.4,6.9],[-8.4,7.7],[-8.2,8.1],[-8.2,8.5],[-8.1,9.4],[-8.2,10.1],[-8.0,10.2]]]},{"i":"GN","r":[[[-13.7,12.6],[-12.5,12.3],[-12.2,12.5],[-11.5,12.4],[-11.3,12.1],[-10.9,12.2],[-10.2,11.8],[-9.6,12.2],[-9.1,12.3],[-8.8,11.8],[-8.6,11.1],[-8.4,10.9],[-8.3,10.5],[-8.2,10.1],[-8.1,9.4],[-8.2,8.5],[-8.2,8.1],[-8.4,7.7],[-8.9,7.3],[-9.4,7.5],[-9.8,8.5],[-10.2,8.4],[-10.5,8.7],[-10.6,9.3],[-11.1,10.0],[-12.2,9.9],[-12.6,9.6],[-13.2,8.9],[-14.1,9.9],[-14.6,10.2],[-14.8,10.9],[-14.7,11.5],[-14.1,11.7],[-13.7,11.8],[-13.7,12.2],[-13.7,12.6]]]},{"i":"GW","r":[[[-16.7,12.4],[-15.8,12.5],[-13.7,12.6],[-13.8,12.1],[-13.9,11.7],[-14.4,11.5],[-15.1,11.0],[-16.1,11.5],[-16.3,12.0],[-16.7,12.4]]]},{"i":"LR","r":[[[-8.4,7.7],[-8.4,6.9],[-8.3,6.2],[-7.6,5.7],[-7.6,5.2],[-8.0,4.4],[-9.9,5.6],[-11.4,6.8],[-11.1,7.4],[-10.2,8.4],[-9.8,8.5],[-9.4,7.5],[-8.9,7.3],[-8.4,7.7]]]},{"i":"SL","r":[[[-13.2,8.9],[-12.6,9.6],[-12.2,9.9],[-11.1,10.0],[-10.6,9.3],[-10.5,8.7],[-10.2,8.4],[-11.1,7.4],[-11.4,6.8],[-12.4,7.3],[-13.1,8.2],[-13.2,8.9]]]},{"i":"BF","r":[[[-5.4,10.4],[-5.2,11.4],[-4.4,12.5],[-4.0,13.5],[-3.1,13.5],[-2.2,14.2],[-1.1,15.0],[-0.3,14.9],[0.3,14.4],[1.0,13.3],[2.2,12.6],[1.9,11.6],[1.2,11.1],[0.0,11.0],[-0.8,10.9],[-2.9,11.0],[-2.8,9.6],[-4.0,9.9],[-4.8,9.8],[-5.4,10.4]]]},{"i":"CF","r":[[[27.4,5.2],[26.4,5.2],[25.3,5.2],[24.8,4.9],[23.3,4.6],[22.7,4.6],[21.7,4.2],[20.3,4.7],[18.9,4.7],[18.5,3.5],[17.1,3.7],[16.0,2.3],[15.9,3.0],[15.0,3.9],[14.5,4.7],[14.5,5.5],[14.8,6.4],[16.1,7.5],[16.5,7.7],[18.0,7.9],[18.9,8.6],[19.1,9.1],[21.0,9.5],[22.2,11.0],[23.0,10.7],[23.6,9.7],[23.5,9.0],[24.6,8.2],[25.1,7.5],[26.2,6.5],[27.2,5.6],[27.4,5.2]]]},{"i":"CG","r":[[[18.5,3.5],[18.1,2.4],[17.8,0.9],[17.7,-0.1],[17.5,-0.7],[16.4,-1.7],[16.0,-3.5],[15.2,-4.3],[14.2,-4.8],[13.6,-4.5],[13.0,-4.8],[12.3,-4.6],[11.1,-4.0],[11.5,-2.8],[12.5,-2.4],[13.1,-2.4],[14.3,-2.0],[14.3,-0.6],[14.3,1.2],[13.3,1.3],[13.1,2.3],[15.1,2.0],[16.0,2.3],[17.1,3.7],[18.5,3.5]]]},{"i":"GA","r":[[[11.3,2.3],[12.4,2.2],[13.1,2.3],[13.3,1.3],[14.3,1.2],[14.3,-0.6],[14.3,-2.0],[13.1,-2.4],[12.5,-2.4],[11.5,-2.8],[11.1,-4.0],[9.4,-2.1],[8.8,-0.8],[9.3,0.3],[9.8,1.1],[11.3,2.3]]]},{"i":"GQ","r":[[[9.6,2.3],[11.3,1.1],[9.5,1.0],[9.6,2.3]]]},{"i":"ZM","r":[[[30.7,-8.3],[31.6,-8.8],[32.8,-9.2],[33.5,-10.5],[33.1,-11.6],[33.0,-12.8],[33.2,-14.0],[30.3,-15.5],[28.9,-16.0],[28.5,-16.5],[27.0,-17.9],[26.4,-17.8],[25.1,-17.7],[24.7,-17.4],[23.2,-17.5],[21.9,-16.1],[24.0,-12.9],[24.1,-12.2],[24.0,-11.2],[24.3,-11.0],[24.8,-11.2],[25.8,-11.8],[27.2,-11.6],[28.2,-12.3],[28.9,-13.2],[29.6,-12.2],[28.6,-12.0],[28.5,-10.8],[28.4,-9.2],[29.0,-8.4],[30.7,-8.3]]]},{"i":"MW","r":[[[32.8,-9.2],[33.9,-9.7],[34.6,-11.5],[34.6,-13.6],[35.3,-13.9],[35.8,-15.9],[35.0,-16.8],[34.3,-15.5],[34.5,-14.6],[33.8,-14.5],[32.7,-13.7],[33.3,-12.4],[33.3,-10.8],[33.2,-9.7],[32.8,-9.2]]]},{"i":"MZ","r":[[[34.6,-11.5],[36.5,-11.7],[37.5,-11.6],[38.4,-11.3],[40.3,-10.3],[40.4,-11.8],[40.6,-14.2],[40.5,-15.4],[39.5,-16.7],[37.4,-17.6],[35.9,-18.8],[34.8,-19.8],[35.2,-21.3],[35.4,-22.1],[35.5,-23.1],[35.6,-23.7],[35.0,-24.5],[33.0,-25.4],[32.7,-26.1],[32.8,-26.7],[32.0,-26.3],[31.8,-25.5],[31.7,-23.7],[32.2,-21.1],[32.7,-20.3],[32.6,-19.4],[32.8,-18.0],[32.3,-16.4],[31.6,-16.1],[30.3,-15.9],[30.2,-14.8],[33.8,-14.5],[34.5,-14.6],[34.3,-15.5],[35.0,-16.8],[35.8,-15.9],[35.3,-13.9],[34.6,-13.6],[34.6,-11.5]]]},{"i":"SZ","r":[[[32.1,-26.7],[31.3,-27.3],[30.7,-26.4],[31.0,-25.7],[31.8,-25.8],[32.1,-26.7]]]},{"i":"AO","r":[[[13.0,-4.8],[12.5,-5.2],[12.2,-5.8],[12.3,-4.6],[13.0,-4.8]],[[12.3,-6.1],[13.0,-6.0],[16.3,-5.9],[16.9,-7.2],[17.5,-8.1],[18.5,-7.8],[19.2,-7.7],[20.0,-7.1],[20.6,-6.9],[21.7,-7.3],[21.9,-8.3],[21.9,-9.5],[22.2,-11.1],[22.8,-11.0],[23.9,-10.9],[23.9,-11.7],[23.9,-12.6],[21.9,-12.9],[22.6,-16.9],[21.4,-17.9],[18.3,-17.3],[14.1,-17.4],[12.8,-16.9],[11.7,-17.3],[11.8,-15.8],[12.2,-14.4],[12.7,-13.1],[13.6,-12.0],[13.7,-10.7],[13.1,-9.8],[12.9,-9.0],[12.9,-7.6],[12.2,-6.3],[12.3,-6.1]]]},{"i":"BI","r":[[[30.5,-2.4],[30.7,-3.0],[30.5,-3.6],[29.8,-4.5],[29.3,-3.3],[29.6,-2.9],[30.5,-2.4]]]},{"i":"IL","r":[[[35.7,32.7],[35.2,32.5],[35.2,31.8],[34.9,31.4],[35.4,31.1],[34.8,29.8],[34.3,31.2],[34.6,31.5],[34.8,32.1],[35.1,33.1],[35.5,33.1],[35.8,33.3],[35.7,32.7]]]},{"i":"LB","r":[[[35.8,33.3],[35.5,33.1],[35.5,33.9],[36.0,34.6],[36.6,34.2],[35.8,33.3]]]},{"i":"MG","r":[[[49.5,-12.5],[50.1,-13.6],[50.5,-15.2],[50.2,-16.0],[49.7,-15.7],[49.8,-16.9],[49.4,-18.0],[48.5,-20.5],[47.5,-23.8],[46.3,-25.2],[44.8,-25.3],[43.8,-24.5],[43.3,-22.8],[43.4,-21.3],[43.9,-20.8],[44.5,-19.4],[44.0,-18.3],[44.3,-16.9],[44.9,-16.2],[45.9,-15.8],[46.9,-15.2],[48.0,-14.1],[48.3,-13.8],[48.9,-12.5],[49.5,-12.5]]]},{"i":"GM","r":[[[-16.7,13.6],[-15.4,13.9],[-14.7,13.6],[-14.0,13.8],[-14.3,13.3],[-15.1,13.5],[-15.7,13.3],[-16.8,13.2],[-16.7,13.6]]]},{"i":"TN","r":[[[9.5,30.3],[8.4,32.5],[7.6,33.3],[8.1,34.7],[8.2,36.4],[9.5,37.3],[10.2,36.7],[11.1,36.9],[10.6,35.9],[10.8,34.8],[10.3,33.8],[11.1,33.3],[11.4,32.4],[10.6,31.8],[10.1,31.0],[9.5,30.3]]]},{"i":"DZ","r":[[[-8.7,27.4],[-8.7,27.7],[-7.1,29.6],[-5.2,30.0],[-3.7,30.9],[-3.1,31.7],[-1.3,32.3],[-1.4,32.9],[-1.8,34.5],[-1.2,35.7],[0.5,36.3],[3.2,36.8],[5.3,36.7],[7.3,37.1],[8.4,36.9],[8.4,35.5],[7.5,34.1],[8.4,32.7],[9.1,32.1],[9.8,29.4],[9.7,28.1],[9.6,27.1],[9.3,26.1],[9.9,24.9],[10.8,24.6],[12.0,23.5],[5.7,19.6],[3.2,19.1],[2.7,19.9],[1.8,20.6],[-4.9,25.0],[-8.7,27.4]]]},{"i":"JO","r":[[[35.5,32.4],[36.8,32.3],[39.2,32.2],[37.0,31.5],[37.7,30.3],[36.7,29.9],[36.1,29.2],[34.9,29.5],[35.4,31.5],[35.5,32.4]]]},{"i":"AE","r":[[[51.6,24.2],[51.8,24.0],[53.4,24.2],[54.7,24.8],[56.1,26.1],[56.4,24.9],[55.8,24.3],[55.5,23.9],[55.2,23.1],[55.0,22.5],[51.6,24.0],[51.6,24.2]]]},{"i":"QA","r":[[[50.8,24.8],[51.0,26.0],[51.6,25.8],[51.4,24.6],[50.8,24.8]]]},{"i":"KW","r":[[[48.0,30.0],[48.1,29.3],[47.7,28.5],[46.6,29.1],[48.0,30.0]]]},{"i":"IQ","r":[[[39.2,32.2],[41.0,34.4],[41.3,36.4],[42.3,37.2],[43.9,37.3],[44.8,37.2],[46.1,35.7],[45.6,34.7],[46.1,33.0],[47.8,31.7],[48.0,31.0],[48.6,29.9],[47.3,30.1],[44.7,29.2],[40.4,31.9],[39.2,32.2]]]},{"i":"OM","r":[[[55.2,22.7],[55.5,23.5],[56.0,24.1],[55.9,24.9],[56.8,24.2],[58.1,23.7],[59.2,23.0],[59.8,22.5],[59.4,21.7],[58.9,21.1],[58.0,20.5],[57.7,19.7],[57.7,18.9],[56.6,18.6],[56.3,17.9],[55.3,17.6],[54.8,17.0],[53.6,16.7],[52.8,17.3],[55.0,20.0],[55.2,22.7]]]},{"i":"KH","r":[[[102.6,12.2],[103.0,14.2],[105.2,14.3],[106.5,14.6],[107.6,13.5],[105.8,11.6],[105.2,10.9],[103.5,10.6],[102.6,12.2]]]},{"i":"TH","r":[[[105.2,14.3],[103.0,14.2],[102.6,12.2],[100.8,12.6],[100.1,13.4],[99.5,10.8],[99.2,9.2],[100.3,8.3],[101.0,6.9],[102.1,6.2],[101.2,5.7],[100.3,6.6],[99.7,6.8],[99.0,7.9],[98.3,7.8],[98.3,9.0],[99.0,11.0],[99.2,12.8],[99.1,13.8],[98.2,15.1],[98.9,16.2],[97.9,17.6],[97.8,18.6],[99.0,19.8],[100.1,20.4],[100.6,19.5],[101.0,18.4],[102.1,18.1],[103.0,18.0],[104.0,18.2],[104.8,16.4],[105.5,14.7],[105.2,14.3]]]},{"i":"LA","r":[[[107.4,14.2],[106.0,13.9],[105.5,14.7],[104.8,16.4],[104.0,18.2],[103.0,18.0],[102.1,18.1],[101.0,18.4],[100.6,19.5],[100.1,20.4],[101.2,21.4],[101.8,21.2],[102.2,22.5],[103.2,20.8],[104.8,19.9],[103.9,19.3],[105.9,17.5],[107.3,15.9],[107.4,14.2]]]},{"i":"MM","r":[[[100.1,20.4],[99.0,19.8],[97.8,18.6],[97.9,17.6],[98.9,16.2],[98.2,15.1],[99.1,13.8],[99.2,12.8],[99.0,11.0],[98.5,10.7],[98.4,12.0],[98.1,13.6],[97.6,16.1],[96.5,16.4],[94.8,15.8],[94.5,17.3],[93.5,19.4],[93.1,19.9],[92.3,21.5],[92.7,22.0],[93.1,22.7],[93.3,24.1],[94.6,24.7],[95.2,26.0],[96.4,27.3],[97.1,27.7],[97.3,28.3],[98.2,27.7],[98.7,26.7],[97.7,25.1],[98.7,24.1],[99.5,22.9],[100.0,21.7],[101.2,21.8],[100.3,20.8],[100.1,20.4]]]},{"i":"VN","r":[[[104.3,10.5],[106.2,11.0],[107.5,12.3],[107.4,14.2],[107.3,15.9],[105.9,17.5],[103.9,19.3],[104.8,19.9],[103.2,20.8],[102.2,22.5],[103.5,22.7],[105.3,23.4],[106.7,22.8],[107.0,21.8],[106.7,20.7],[105.7,19.1],[107.4,16.7],[108.9,15.3],[109.2,11.7],[107.2,10.4],[105.2,8.6],[105.1,9.9],[104.3,10.5]]]},{"i":"KP","r":[[[130.6,42.4],[130.8,42.2],[130.0,41.9],[129.7,40.9],[129.0,40.5],[128.0,40.0],[127.5,39.3],[127.8,39.1],[128.2,38.4],[127.1,38.3],[126.2,37.8],[125.7,37.9],[125.3,37.7],[125.0,37.9],[125.0,38.5],[125.1,38.8],[125.3,39.6],[124.3,39.9],[126.2,41.1],[127.3,41.5],[128.1,42.0],[130.0,43.0],[130.6,42.4]]]},{"i":"KR","r":[[[126.2,37.7],[126.7,37.8],[127.8,38.3],[128.3,38.6],[129.5,36.8],[129.1,35.1],[127.4,34.5],[126.4,34.9],[126.1,36.7],[126.2,37.7]]]},{"i":"MN","r":[[[87.8,49.3],[90.7,50.3],[93.1,50.5],[94.8,50.0],[97.3,49.7],[97.8,51.0],[100.0,51.6],[102.1,51.3],[103.7,50.1],[105.9,50.4],[107.9,49.8],[109.4,49.3],[111.6,49.4],[114.4,50.2],[115.5,49.8],[116.2,49.1],[115.7,47.7],[117.3,47.7],[118.9,47.7],[119.7,46.7],[117.4,46.7],[116.0,45.7],[113.5,44.8],[111.9,45.1],[111.7,44.1],[111.1,43.4],[109.2,42.5],[106.1,42.1],[104.5,41.9],[101.8,42.5],[99.5,42.5],[96.3,42.7],[95.3,44.2],[93.5,45.0],[90.9,45.3],[91.0,46.9],[88.9,48.1],[87.8,49.3]]]},{"i":"IN","r":[[[97.3,28.3],[97.1,27.7],[96.4,27.3],[95.2,26.0],[94.6,24.7],[93.3,24.1],[93.1,22.7],[92.7,22.0],[91.9,23.6],[91.2,23.5],[91.9,24.1],[91.8,25.1],[89.9,25.3],[89.4,26.0],[88.2,25.8],[88.3,24.9],[88.7,24.2],[88.9,22.9],[88.9,21.7],[87.0,21.5],[86.5,20.2],[83.9,18.3],[82.2,17.0],[81.7,16.3],[80.3,15.9],[80.2,13.8],[79.9,12.1],[79.3,10.3],[79.2,9.2],[77.9,8.3],[76.6,8.9],[75.7,11.3],[74.9,12.7],[74.4,14.6],[73.1,17.9],[72.8,20.4],[71.2,20.8],[69.2,22.1],[69.3,22.8],[68.8,24.4],[70.8,25.2],[70.2,26.5],[70.6,28.0],[72.8,29.0],[74.4,31.0],[75.3,32.3],[74.1,33.4],[74.2,34.7],[76.9,34.7],[78.9,34.3],[79.2,33.0],[78.5,32.6],[79.7,30.9],[80.5,29.7],[81.1,28.4],[83.3,27.4],[85.3,26.7],[87.2,26.4],[88.2,26.8],[88.1,27.9],[88.8,27.3],[89.7,26.7],[91.2,26.8],[92.1,27.5],[92.5,27.9],[94.6,29.3],[96.1,29.5],[96.2,28.4],[97.3,28.3]]]},{"i":"BD","r":[[[92.7,22.0],[92.3,21.5],[92.1,21.2],[91.8,22.2],[90.5,22.8],[90.3,21.8],[89.7,21.9],[89.0,22.1],[88.5,23.6],[88.1,24.5],[88.9,25.2],[88.6,26.4],[89.8,26.0],[90.9,25.1],[92.4,25.0],[91.5,24.1],[91.7,23.0],[92.1,23.6],[92.7,22.0]]]},{"i":"BT","r":[[[91.7,27.8],[92.0,26.8],[90.4,26.9],[88.8,27.1],[89.5,28.0],[90.7,28.1],[91.7,27.8]]]},{"i":"NP","r":[[[88.1,27.9],[88.2,26.8],[87.2,26.4],[85.3,26.7],[83.3,27.4],[81.1,28.4],[80.5,29.7],[81.5,30.4],[83.3,29.5],[84.2,28.8],[85.8,28.2],[88.1,27.9]]]},{"i":"PK","r":[[[77.8,35.5],[75.8,34.5],[73.7,34.3],[74.5,32.8],[74.4,31.7],[73.5,30.0],[71.8,27.9],[69.5,26.9],[70.3,25.7],[71.0,24.4],[68.2,23.7],[67.1,24.7],[64.5,25.2],[61.5,25.1],[63.3,26.8],[62.8,27.4],[61.8,28.7],[60.9,29.8],[63.6,29.5],[64.4,29.6],[66.3,29.9],[66.9,31.3],[67.8,31.6],[68.9,31.6],[69.3,32.5],[70.3,33.4],[70.9,34.0],[71.1,34.7],[71.5,35.7],[71.8,36.5],[74.1,36.8],[75.2,37.1],[76.2,35.9],[77.8,35.5]]]},{"i":"AF","r":[[[66.5,37.4],[67.8,37.1],[68.9,37.3],[69.5,37.6],[70.3,37.7],[70.8,38.5],[71.2,38.0],[71.4,37.1],[72.2,36.9],[73.3,37.5],[75.0,37.4],[74.6,37.0],[72.9,36.7],[71.3,36.1],[71.6,35.2],[71.2,34.3],[69.9,34.0],[69.7,33.1],[69.3,31.9],[68.6,31.7],[67.7,31.3],[66.4,30.7],[65.0,29.5],[64.1,29.3],[62.5,29.3],[61.8,30.7],[60.9,31.5],[60.5,33.0],[60.5,33.7],[61.2,35.7],[63.0,35.4],[64.0,36.0],[64.7,37.1],[65.7,37.7],[66.5,37.4]]]},{"i":"TJ","r":[[[67.8,37.1],[68.2,38.9],[67.7,39.6],[69.0,40.1],[70.7,41.0],[70.6,40.2],[70.6,39.9],[69.5,39.5],[71.8,39.3],[73.9,38.5],[74.9,38.4],[75.0,37.4],[73.3,37.5],[72.2,36.9],[71.4,37.1],[71.2,38.0],[70.8,38.5],[70.3,37.7],[69.5,37.6],[68.9,37.3],[67.8,37.1]]]},{"i":"KG","r":[[[71.0,42.3],[71.8,42.8],[73.6,43.1],[75.6,42.9],[77.7,43.0],[79.6,42.5],[80.1,42.1],[78.2,41.2],[76.5,40.4],[74.8,40.4],[74.0,39.7],[71.8,39.3],[69.5,39.5],[70.6,39.9],[71.8,40.1],[71.9,41.4],[70.4,41.5],[71.0,42.3]]]},{"i":"TM","r":[[[52.5,41.8],[54.1,42.3],[55.5,41.3],[57.1,41.3],[57.8,42.2],[60.0,42.2],[60.5,41.2],[61.9,41.1],[63.5,39.4],[65.2,38.4],[66.5,37.4],[65.7,37.7],[64.7,37.1],[64.0,36.0],[63.0,35.4],[61.2,35.7],[60.4,36.5],[58.4,37.5],[56.6,38.1],[55.5,38.0],[53.9,37.2],[53.9,39.0],[53.4,40.0],[52.9,40.9],[54.7,41.0],[53.7,42.1],[52.8,41.1],[52.5,41.8]]]},{"i":"IR","r":[[[48.6,29.9],[48.0,31.0],[47.8,31.7],[46.1,33.0],[45.6,34.7],[46.1,35.7],[44.8,37.2],[44.2,38.0],[44.1,39.4],[45.0,39.3],[46.1,38.7],[47.7,39.5],[48.4,39.3],[48.6,38.3],[49.2,37.6],[50.8,36.9],[53.8,37.0],[54.8,37.4],[56.2,37.9],[57.3,38.0],[59.2,37.4],[61.1,36.5],[60.8,34.4],[61.0,33.5],[60.9,32.2],[61.7,31.4],[60.9,29.8],[61.8,28.7],[62.8,27.4],[63.3,26.8],[61.5,25.1],[58.5,25.6],[57.0,27.0],[55.7,27.0],[53.5,26.8],[51.5,27.9],[50.1,30.1],[48.9,30.3],[48.6,29.9]]]},{"i":"SY","r":[[[35.7,32.7],[35.8,32.9],[36.1,33.8],[36.4,34.6],[35.9,35.4],[36.4,36.0],[36.7,36.8],[38.2,36.9],[39.5,36.7],[41.2,37.1],[41.8,36.6],[41.4,35.6],[38.8,33.4],[35.7,32.7]]]},{"i":"AM","r":[[[46.5,38.8],[45.7,39.3],[45.3,39.5],[44.8,39.7],[43.7,40.3],[43.6,41.1],[45.2,41.0],[45.4,40.6],[45.6,39.9],[46.5,39.5],[46.5,38.8]]]},{"i":"SE","r":[[[11.0,58.9],[12.3,60.1],[12.0,61.8],[12.6,64.1],[13.9,64.4],[15.1,66.2],[16.8,68.0],[18.0,68.6],[20.0,69.1],[22.0,68.6],[23.6,66.4],[22.2,65.7],[21.4,64.4],[17.8,62.7],[17.8,60.6],[17.9,59.0],[16.4,57.0],[14.7,56.2],[12.9,55.4],[11.8,57.4],[11.0,58.9]]]},{"i":"BY","r":[[[28.2,56.2],[29.4,55.7],[30.9,55.6],[30.8,54.8],[31.8,54.0],[32.4,53.6],[32.3,53.1],[31.3,53.1],[31.8,52.1],[30.9,52.0],[30.6,51.3],[29.3,51.4],[28.6,51.4],[27.5,51.6],[25.3,51.9],[24.0,51.6],[23.5,52.0],[23.8,52.7],[23.5,53.5],[24.5,53.9],[25.8,54.8],[26.5,55.6],[28.2,56.2]]]},{"i":"UA","r":[[[31.8,52.1],[32.4,52.3],[33.8,52.3],[34.1,51.6],[35.0,51.2],[35.4,50.6],[37.4,50.4],[38.6,49.9],[40.1,49.3],[39.9,48.2],[38.8,47.8],[38.2,47.1],[36.8,46.7],[35.0,46.3],[34.9,45.8],[34.4,46.0],[33.4,46.0],[31.7,46.3],[30.7,46.6],[29.6,45.3],[28.7,45.3],[28.5,45.6],[28.9,46.3],[29.1,46.5],[29.8,46.3],[29.8,46.5],[29.6,46.9],[29.1,47.5],[28.7,48.1],[27.5,48.5],[26.6,48.2],[25.9,48.0],[24.9,47.7],[23.8,48.0],[22.7,47.9],[22.1,48.4],[22.6,49.1],[22.5,49.5],[23.9,50.4],[23.5,51.6],[24.6,51.9],[26.3,51.8],[28.2,51.6],[29.0,51.6],[30.2,51.4],[30.6,51.8],[31.8,52.1]]]},{"i":"PL","r":[[[23.5,53.9],[23.8,53.1],[23.2,52.5],[23.5,51.6],[23.9,50.4],[22.5,49.5],[22.6,49.1],[20.9,49.3],[19.8,49.2],[18.9,49.4],[18.4,50.0],[17.6,50.4],[16.7,50.2],[16.2,50.7],[15.0,51.1],[14.7,52.1],[14.1,53.0],[14.1,53.8],[16.4,54.5],[18.6,54.7],[19.7,54.4],[22.7,54.3],[23.5,53.9]]]},{"i":"AT","r":[[[17.0,48.1],[16.3,47.7],[16.2,46.9],[15.1,46.7],[13.8,46.5],[12.2,47.1],[11.0,46.8],[9.9,46.9],[9.6,47.3],[9.9,47.6],[10.5,47.6],[12.1,47.7],[12.9,47.5],[12.9,48.3],[13.6,48.9],[14.9,49.0],[16.0,48.7],[17.0,48.6],[17.0,48.1]]]},{"i":"HU","r":[[[22.1,48.4],[22.7,47.9],[21.6,47.0],[20.2,46.1],[18.8,45.9],[18.5,45.8],[16.9,46.4],[16.4,46.8],[16.5,47.5],[16.9,47.7],[17.5,47.9],[18.7,47.9],[19.2,48.1],[19.8,48.2],[20.5,48.6],[21.9,48.3],[22.1,48.4]]]},{"i":"MD","r":[[[26.6,48.2],[27.5,48.5],[28.7,48.1],[29.1,47.5],[29.6,46.9],[29.8,46.5],[29.8,46.3],[29.1,46.5],[28.9,46.3],[28.5,45.6],[28.1,45.9],[28.1,46.8],[27.2,47.8],[26.6,48.2]]]},{"i":"RO","r":[[[28.2,45.5],[29.1,45.5],[29.6,45.0],[28.8,44.9],[28.0,43.8],[26.1,43.9],[24.1,43.7],[22.9,43.8],[22.5,44.4],[22.5,44.7],[21.6,44.8],[20.9,45.4],[20.2,46.1],[21.6,47.0],[22.7,47.9],[23.8,48.0],[24.9,47.7],[25.9,48.0],[26.6,48.2],[27.2,47.8],[28.1,46.8],[28.1,45.9],[28.2,45.5]]]},{"i":"LT","r":[[[26.5,55.6],[25.8,54.8],[24.5,53.9],[23.2,54.2],[22.7,54.6],[22.3,55.0],[21.1,56.0],[23.9,56.3],[25.0,56.2],[26.5,55.6]]]},{"i":"LV","r":[[[27.3,57.5],[27.9,56.8],[27.1,55.8],[25.5,56.1],[24.9,56.4],[22.2,56.3],[21.1,56.8],[22.5,57.8],[24.1,57.0],[25.2,58.0],[26.5,57.5],[27.3,57.5]]]},{"i":"EE","r":[[[28.0,59.5],[28.1,59.3],[27.7,57.8],[26.5,57.5],[25.2,58.0],[24.4,58.4],[23.4,58.6],[24.6,59.5],[26.9,59.4],[28.0,59.5]]]},{"i":"DE","r":[[[14.1,53.8],[14.1,53.0],[14.7,52.1],[15.0,51.1],[14.3,51.1],[13.3,50.7],[12.2,50.3],[12.5,49.5],[13.6,48.9],[12.9,48.3],[12.9,47.5],[12.1,47.7],[10.5,47.6],[9.9,47.6],[8.5,47.8],[7.5,47.6],[8.1,49.0],[6.2,49.5],[6.0,50.1],[6.0,51.9],[6.8,52.2],[6.9,53.5],[7.9,53.7],[8.8,54.0],[8.5,55.0],[9.9,55.0],[11.0,54.4],[12.0,54.2],[13.6,54.1],[14.1,53.8]]]},{"i":"BG","r":[[[22.7,44.2],[23.3,43.9],[25.6,43.7],[27.2,44.2],[28.6,43.7],[27.7,42.6],[27.1,42.1],[26.1,41.3],[24.5,41.6],[23.0,41.3],[22.4,42.3],[22.4,42.6],[23.0,43.2],[22.4,44.0],[22.7,44.2]]]},{"i":"GR","r":[[[26.3,35.3],[24.7,34.9],[23.5,35.3],[24.2,35.4],[25.8,35.4],[26.3,35.3]],[[23.0,41.3],[24.5,41.6],[26.1,41.3],[26.6,41.6],[26.1,40.8],[24.9,40.9],[24.4,40.1],[23.3,40.0],[22.6,40.3],[23.4,39.2],[23.5,38.5],[24.0,37.7],[23.4,37.4],[23.2,36.4],[21.7,36.8],[21.1,38.3],[20.2,39.3],[20.6,40.1],[21.0,40.6],[21.7,40.9],[22.6,41.1],[23.0,41.3]]]},{"i":"TR","r":[[[44.8,37.2],[43.9,37.3],[42.3,37.2],[40.7,37.1],[38.7,36.7],[37.1,36.6],[36.7,36.3],[36.1,35.8],[36.2,36.7],[34.7,36.8],[32.5,36.1],[30.6,36.7],[29.7,36.1],[27.6,36.7],[26.3,38.2],[26.2,39.5],[28.8,40.5],[31.1,41.1],[33.5,42.0],[36.9,41.3],[39.5,41.1],[41.6,41.5],[43.6,41.1],[43.7,40.3],[44.8,39.7],[44.4,38.3],[44.8,37.2]],[[26.1,41.8],[28.0,42.0],[29.0,41.3],[27.6,41.0],[26.4,40.2],[26.1,40.8],[26.6,41.6],[26.1,41.8]]]},{"i":"AL","r":[[[21.0,40.8],[20.7,40.4],[20.2,39.6],[20.0,39.9],[19.3,40.7],[19.5,41.7],[19.4,41.9],[19.7,42.7],[20.1,42.6],[20.5,42.2],[20.6,41.9],[20.6,41.1],[21.0,40.8]]]},{"i":"HR","r":[[[16.6,46.5],[17.6,46.0],[18.8,45.9],[19.4,45.2],[18.6,45.1],[17.0,45.2],[16.3,45.0],[15.8,44.8],[16.5,44.0],[17.3,43.4],[18.6,42.6],[18.5,42.5],[16.9,43.2],[15.2,44.2],[14.9,44.7],[14.3,45.2],[13.7,45.1],[13.7,45.5],[14.6,45.6],[15.3,45.5],[15.7,45.8],[16.6,46.5]]]},{"i":"CH","r":[[[9.6,47.5],[9.5,47.1],[10.4,46.9],[9.9,46.3],[9.0,46.0],[8.3,46.2],[7.3,45.8],[6.5,46.4],[6.0,46.7],[6.7,47.5],[7.5,47.6],[8.5,47.8],[9.6,47.5]]]},{"i":"BE","r":[[[6.2,50.8],[5.8,50.1],[4.8,50.0],[3.6,50.4],[2.7,50.8],[3.3,51.3],[5.0,51.5],[6.2,50.8]]]},{"i":"NL","r":[[[6.9,53.5],[6.8,52.2],[6.0,51.9],[5.6,51.0],[4.0,51.3],[3.3,51.3],[4.7,53.1],[6.9,53.5]]]},{"i":"PT","r":[[[-9.0,41.9],[-8.3,42.3],[-7.4,41.8],[-6.7,41.9],[-6.9,41.1],[-7.0,40.2],[-7.5,39.6],[-7.4,38.4],[-7.2,37.8],[-7.5,37.1],[-8.4,37.0],[-8.7,37.7],[-9.3,38.4],[-9.4,39.4],[-9.0,40.2],[-8.8,41.2],[-9.0,41.9]]]},{"i":"ES","r":[[[-7.5,37.1],[-7.2,37.8],[-7.4,38.4],[-7.5,39.6],[-7.0,40.2],[-6.9,41.1],[-6.7,41.9],[-7.4,41.8],[-8.3,42.3],[-9.0,41.9],[-9.4,43.0],[-6.8,43.6],[-4.3,43.4],[-1.9,43.4],[0.3,42.6],[1.8,42.3],[3.0,41.9],[0.8,41.0],[0.1,40.1],[0.1,38.7],[-0.7,37.6],[-2.1,36.7],[-4.4,36.7],[-5.4,35.9],[-6.2,36.4],[-7.5,37.1]]]},{"i":"IE","r":[[[-6.2,53.9],[-6.8,52.3],[-10.0,51.8],[-9.7,53.9],[-7.6,55.1],[-7.6,54.1],[-6.2,53.9]]]},{"i":"NC","r":[[[165.8,-21.1],[167.1,-22.2],[166.2,-22.1],[164.8,-21.1],[164.0,-20.1],[165.0,-20.5],[165.8,-21.1]]]},{"i":"SB","r":[[[161.7,-9.6],[160.8,-8.9],[160.9,-8.3],[161.7,-9.6]],[[159.6,-8.0],[159.9,-8.5],[158.6,-7.8],[158.4,-7.3],[159.6,-8.0]]]},{"i":"NZ","r":[[[176.9,-40.1],[176.0,-41.3],[175.1,-41.4],[175.2,-40.5],[173.8,-39.5],[174.6,-38.8],[174.7,-37.4],[174.3,-36.5],[173.1,-35.2],[173.0,-34.5],[174.3,-35.3],[175.3,-37.2],[175.8,-36.8],[176.8,-37.9],[178.0,-37.6],[178.3,-38.6],[177.2,-39.1],[177.0,-39.9],[176.9,-40.1]],[[169.7,-43.6],[171.1,-42.5],[171.9,-41.5],[172.8,-40.5],[173.2,-41.3],[174.2,-41.3],[173.9,-42.2],[172.7,-43.4],[172.3,-43.9],[171.2,-44.9],[169.8,-46.4],[168.4,-46.6],[166.7,-46.2],[167.0,-45.1],[168.9,-43.9],[169.7,-43.6]]]},{"i":"AU","r":[[[147.7,-40.8],[148.4,-42.1],[147.9,-43.2],[146.9,-43.6],[146.0,-43.5],[145.3,-42.0],[144.7,-40.7],[146.4,-41.1],[147.7,-40.8]],[[126.1,-32.2],[124.2,-33.0],[123.7,-33.9],[122.2,-34.0],[120.6,-33.9],[119.3,-34.5],[118.5,-34.7],[117.3,-35.0],[115.6,-34.4],[115.0,-33.6],[115.7,-33.3],[115.8,-32.2],[115.2,-30.6],[115.0,-29.5],[114.6,-28.5],[114.0,-27.3],[113.3,-26.1],[113.4,-25.6],[114.2,-26.3],[113.7,-25.0],[113.4,-24.4],[113.7,-23.6],[113.7,-22.5],[114.2,-22.5],[115.5,-21.5],[116.7,-20.7],[117.4,-20.7],[118.8,-20.3],[119.3,-20.0],[120.9,-19.7],[121.7,-18.7],[122.3,-17.8],[123.0,-16.4],[123.9,-17.1],[123.8,-16.1],[124.4,-15.6],[125.2,-14.7],[125.7,-14.2],[126.1,-14.1],[127.1,-13.8],[128.4,-14.9],[129.6,-15.0],[129.9,-13.6],[130.2,-13.1],[131.2,-12.2],[132.6,-12.1],[131.8,-11.3],[133.0,-11.4],[134.4,-12.0],[135.3,-12.2],[136.3,-12.0],[137.0,-12.4],[136.3,-13.3],[136.1,-13.7],[135.4,-14.7],[136.3,-15.6],[137.6,-16.2],[138.6,-16.8],[139.3,-17.4],[140.9,-17.4],[141.3,-16.4],[141.7,-15.0],[141.6,-14.3],[141.7,-12.9],[141.7,-12.4],[142.1,-11.3],[142.5,-10.7],[142.9,-11.8],[143.2,-12.3],[143.6,-13.4],[143.9,-14.5],[144.9,-14.6],[145.3,-15.4],[145.6,-16.8],[146.2,-17.8],[146.4,-19.0],[148.2,-20.0],[148.7,-20.6],[149.7,-22.3],[150.5,-22.6],[150.9,-23.5],[152.1,-24.5],[153.1,-26.1],[153.1,-27.3],[153.5,-29.0],[153.1,-30.4],[152.9,-31.6],[151.7,-33.0],[151.0,-34.3],[150.3,-35.7],[149.9,-37.1],[149.4,-37.8],[147.4,-38.2],[146.3,-39.0],[144.9,-38.4],[144.5,-38.1],[142.7,-38.5],[141.6,-38.3],[140.0,-37.4],[139.6,-36.1],[138.1,-35.6],[138.2,-34.4],[136.8,-35.3],[137.5,-34.1],[137.8,-32.9],[136.4,-34.1],[135.2,-34.5],[134.6,-33.2],[134.3,-32.6],[132.3,-32.0],[129.5,-31.6],[127.1,-32.3],[126.1,-32.2]]]},{"i":"LK","r":[[[81.8,7.5],[81.2,6.2],[79.9,6.8],[80.1,9.8],[81.3,8.6],[81.8,7.5]]]},{"i":"CN","r":[[[109.5,18.2],[108.6,19.4],[110.2,20.1],[111.0,19.7],[110.3,18.7],[109.5,18.2]],[[80.3,42.3],[80.2,42.9],[80.9,43.2],[80.0,44.9],[81.9,45.3],[82.5,45.5],[83.2,47.3],[85.2,47.0],[85.7,47.5],[85.8,48.5],[86.6,48.5],[87.4,49.2],[87.8,49.3],[88.0,48.6],[88.9,48.1],[90.3,47.7],[91.0,46.9],[90.6,45.7],[90.9,45.3],[92.1,45.1],[93.5,45.0],[94.7,44.4],[95.3,44.2],[95.8,43.3],[96.3,42.7],[97.5,42.7],[99.5,42.5],[100.8,42.7],[101.8,42.5],[103.3,41.9],[104.5,41.9],[105.0,41.6],[106.1,42.1],[107.7,42.5],[109.2,42.5],[110.4,42.9],[111.1,43.4],[111.8,43.7],[111.7,44.1],[111.3,44.5],[111.9,45.1],[112.4,45.0],[113.5,44.8],[114.5,45.3],[116.0,45.7],[116.7,46.4],[117.4,46.7],[118.9,46.8],[119.7,46.7],[119.8,47.0],[118.9,47.7],[118.1,48.1],[117.3,47.7],[116.3,47.9],[115.7,47.7],[115.5,48.1],[116.2,49.1],[116.7,49.9],[117.9,49.5],[119.3,50.1],[119.3,50.6],[120.2,51.6],[120.7,52.0],[120.7,52.5],[120.2,52.8],[121.0,53.3],[122.2,53.4],[123.6,53.5],[125.1,53.2],[125.9,52.8],[126.6,51.8],[126.9,51.4],[127.3,50.7],[127.7,49.8],[129.4,49.4],[130.6,48.7],[131.0,47.8],[132.5,47.8],[133.4,48.2],[135.0,48.5],[134.5,47.6],[134.1,47.2],[133.8,46.1],[133.1,45.1],[131.9,45.3],[131.0,45.0],[131.3,44.1],[131.1,42.9],[130.6,42.9],[130.6,42.4],[130.0,43.0],[129.6,42.4],[128.1,42.0],[128.2,41.5],[127.3,41.5],[126.9,41.8],[126.2,41.1],[125.1,40.6],[124.3,39.9],[122.9,39.6],[122.1,39.2],[121.1,38.9],[121.6,39.4],[121.4,39.8],[122.2,40.4],[121.6,40.9],[120.8,40.6],[119.6,39.9],[119.0,39.3],[118.0,39.2],[117.5,38.7],[118.1,38.1],[118.9,37.9],[118.9,37.4],[119.7,37.2],[120.8,37.9],[121.7,37.5],[122.4,37.5],[122.5,36.9],[121.1,36.7],[120.6,36.1],[119.7,35.6],[119.2,34.9],[120.2,34.4],[120.6,33.4],[121.2,32.5],[121.9,31.7],[121.9,30.9],[121.3,30.7],[121.5,30.1],[122.1,29.8],[121.9,29.0],[121.7,28.2],[121.1,28.1],[120.4,27.1],[119.6,25.7],[118.7,24.5],[117.3,23.6],[115.9,22.8],[114.8,22.7],[114.2,22.2],[113.8,22.5],[113.2,22.1],[111.8,21.6],[110.8,21.4],[110.4,20.3],[109.9,20.3],[109.6,21.0],[109.9,21.4],[108.5,21.7],[108.1,21.6],[107.0,21.8],[106.6,22.2],[106.7,22.8],[105.8,23.0],[105.3,23.4],[104.5,22.8],[103.5,22.7],[102.7,22.7],[102.2,22.5],[101.7,22.3],[101.8,21.2],[101.3,21.2],[101.2,21.4],[101.2,21.8],[100.4,21.6],[100.0,21.7],[99.2,22.1],[99.5,22.9],[98.9,23.1],[98.7,24.1],[97.6,23.9],[97.7,25.1],[98.7,25.9],[98.7,26.7],[98.7,27.5],[98.2,27.7],[97.9,28.3],[97.3,28.3],[96.2,28.4],[96.6,28.8],[96.1,29.5],[95.4,29.0],[94.6,29.3],[93.4,28.6],[92.5,27.9],[91.7,27.8],[91.3,28.0],[90.7,28.1],[90.0,28.3],[89.5,28.0],[88.8,27.3],[88.7,28.1],[88.1,27.9],[87.0,28.0],[85.8,28.2],[85.0,28.6],[84.2,28.8],[83.9,29.3],[83.3,29.5],[82.3,30.1],[81.5,30.4],[81.1,30.2],[79.7,30.9],[78.7,31.5],[78.5,32.6],[79.2,32.5],[79.2,33.0],[78.8,33.5],[78.9,34.3],[77.8,35.5],[76.2,35.9],[75.9,36.7],[75.2,37.1],[75.0,37.4],[74.8,38.0],[74.9,38.4],[74.3,38.6],[73.9,38.5],[73.7,39.4],[74.0,39.7],[73.8,39.9],[74.8,40.4],[75.5,40.6],[76.5,40.4],[76.9,41.1],[78.2,41.2],[78.5,41.6],[80.1,42.1],[80.3,42.3]]]},{"i":"TW","r":[[[121.8,24.4],[120.7,22.0],[120.1,23.6],[121.5,25.3],[121.8,24.4]]]},{"i":"IT","r":[[[10.4,46.9],[11.2,46.9],[12.4,46.8],[13.7,46.0],[13.1,45.7],[12.4,44.9],[12.6,44.1],[14.0,42.8],[15.9,42.0],[15.9,41.5],[17.5,40.9],[18.5,40.2],[17.7,40.3],[16.4,39.8],[17.1,38.9],[16.1,38.0],[15.7,38.2],[16.1,39.0],[15.4,40.0],[14.7,40.6],[13.6,41.2],[12.1,41.7],[10.5,42.9],[9.7,44.0],[8.4,44.2],[7.4,43.7],[7.0,44.3],[7.1,45.3],[6.8,46.0],[7.8,45.8],[8.5,46.0],[9.2,46.4],[10.4,46.5],[10.4,46.9]],[[14.8,38.1],[15.2,37.4],[15.1,36.6],[13.8,37.1],[12.6,38.1],[14.8,38.1]],[[8.7,40.9],[9.8,40.5],[9.2,39.2],[8.4,39.2],[8.2,41.0],[8.7,40.9]]]},{"i":"DK","r":[[[9.9,55.0],[8.5,55.0],[8.1,56.5],[8.5,57.1],[9.8,57.4],[10.5,57.2],[10.4,56.6],[10.7,56.1],[9.6,55.5],[9.9,55.0]],[[12.4,56.1],[12.1,54.8],[10.9,55.8],[12.4,56.1]]]},{"i":"GB","r":[[[-6.2,53.9],[-7.6,54.1],[-7.6,55.1],[-5.7,54.6],[-6.2,53.9]],[[-3.1,53.4],[-2.9,54.0],[-3.6,54.6],[-5.1,55.1],[-5.0,55.8],[-5.6,56.3],[-5.8,57.8],[-4.2,58.6],[-4.1,57.6],[-2.0,57.7],[-3.1,56.0],[-2.0,55.8],[-0.4,54.5],[0.5,52.9],[1.6,52.1],[1.4,51.3],[-0.8,50.8],[-3.0,50.7],[-4.5,50.3],[-5.8,50.2],[-3.4,51.4],[-5.0,51.6],[-4.2,52.3],[-4.6,53.5],[-3.1,53.4]]]},{"i":"IS","r":[[[-14.5,66.5],[-13.6,65.1],[-17.8,63.7],[-20.0,63.6],[-21.8,64.4],[-22.2,65.1],[-24.3,65.6],[-22.1,66.4],[-19.1,66.3],[-16.2,66.5],[-14.5,66.5]]]},{"i":"AZ","r":[[[46.4,41.9],[47.4,41.2],[48.0,41.4],[49.1,41.3],[50.1,40.5],[49.6,40.2],[49.2,39.0],[48.9,38.3],[48.0,38.8],[48.1,39.6],[46.5,38.8],[46.0,39.6],[45.9,40.2],[45.6,40.8],[45.0,41.2],[46.0,41.1],[46.6,41.2],[46.4,41.9]],[[46.1,38.7],[45.0,39.3],[45.0,39.7],[45.7,39.5],[46.1,38.7]]]},{"i":"GE","r":[[[40.0,43.4],[40.9,43.4],[43.8,42.7],[44.5,42.7],[45.8,42.1],[46.1,41.7],[46.5,41.1],[45.2,41.4],[43.6,41.1],[41.6,41.5],[41.5,42.6],[40.3,43.1],[40.0,43.4]]]},{"i":"PH","r":[[[120.8,12.7],[121.2,13.4],[121.3,12.2],[120.8,12.7]],[[122.6,10.0],[122.9,10.9],[123.3,10.3],[124.0,10.3],[123.3,9.3],[122.4,9.7],[122.6,10.0]],[[126.4,8.4],[126.5,7.2],[125.8,7.3],[125.7,6.0],[124.2,6.2],[124.2,7.4],[123.3,7.4],[122.1,6.9],[122.3,8.0],[123.5,8.7],[124.6,8.5],[125.5,9.0],[126.2,9.3],[126.4,8.4]],[[118.5,9.3],[117.7,9.1],[119.0,10.4],[119.7,10.6],[118.5,9.3]],[[122.3,18.2],[122.5,17.1],[121.7,15.9],[121.7,14.3],[122.7,14.3],[123.9,13.2],[124.1,12.5],[122.9,13.6],[122.0,13.8],[120.6,13.9],[121.0,14.5],[120.6,14.4],[119.9,15.4],[120.3,16.0],[120.7,18.5],[121.9,18.2],[122.3,18.2]],[[122.0,11.4],[122.5,11.6],[123.1,11.2],[122.0,10.4],[122.0,11.4]],[[125.5,12.2],[125.0,11.3],[125.3,10.4],[124.8,10.8],[124.3,11.5],[124.9,11.8],[125.2,12.5],[125.5,12.2]]]},{"i":"MY","r":[[[100.1,6.5],[101.1,6.2],[101.8,5.8],[102.4,6.1],[103.4,4.9],[103.3,3.7],[103.5,2.8],[104.2,1.6],[103.5,1.2],[101.4,2.8],[100.7,3.9],[100.2,5.3],[100.1,6.5]],[[117.9,4.1],[115.9,4.3],[115.1,2.8],[113.8,1.2],[112.4,1.4],[111.2,1.0],[109.8,1.3],[110.4,1.7],[111.4,2.7],[113.0,3.1],[114.2,4.5],[114.9,4.3],[115.4,5.0],[116.2,6.1],[117.1,6.9],[117.7,6.0],[119.2,5.4],[118.4,5.0],[117.9,4.1]]]},{"i":"BN","r":[[[115.5,5.4],[115.3,4.3],[114.7,4.0],[114.6,4.9],[115.5,5.4]]]},{"i":"SI","r":[[[13.8,46.5],[15.1,46.7],[16.2,46.9],[16.6,46.5],[15.7,45.8],[15.3,45.5],[14.6,45.6],[13.7,45.5],[13.7,46.0],[13.8,46.5]]]},{"i":"FI","r":[[[28.6,69.1],[30.0,67.7],[30.2,65.8],[30.4,64.2],[31.5,62.9],[30.2,61.8],[28.1,60.5],[26.3,60.4],[22.9,59.8],[21.3,60.7],[21.1,62.6],[22.4,63.8],[25.4,65.1],[23.9,66.0],[23.5,67.9],[20.6,69.1],[22.4,68.8],[24.7,68.6],[26.2,69.8],[29.0,69.8],[28.6,69.1]]]},{"i":"SK","r":[[[22.6,49.1],[22.1,48.4],[20.8,48.6],[20.2,48.3],[19.7,48.3],[18.8,48.1],[17.9,47.8],[17.0,48.1],[17.0,48.6],[17.5,48.8],[17.9,49.0],[18.2,49.3],[18.6,49.5],[18.9,49.4],[19.8,49.2],[20.9,49.3],[22.6,49.1]]]},{"i":"CZ","r":[[[15.0,51.1],[16.2,50.7],[16.7,50.2],[17.6,50.4],[18.4,50.0],[18.6,49.5],[18.2,49.3],[17.9,49.0],[17.5,48.8],[17.0,48.6],[16.0,48.7],[14.9,49.0],[13.6,48.9],[12.5,49.5],[12.2,50.3],[13.3,50.7],[14.3,51.1],[15.0,51.1]]]},{"i":"ER","r":[[[36.4,14.4],[36.8,16.3],[37.2,17.3],[38.4,18.0],[39.3,15.9],[41.2,14.5],[42.3,13.3],[43.1,12.7],[42.4,12.5],[41.6,13.5],[40.9,14.1],[39.3,14.5],[38.5,14.5],[37.6,14.2],[36.4,14.4]]]},{"i":"JP","r":[[[141.9,39.2],[141.0,37.1],[140.8,35.8],[139.0,34.7],[135.8,33.5],[135.1,34.6],[132.2,33.9],[132.0,33.1],[130.7,31.0],[130.4,32.3],[129.4,33.3],[130.9,34.2],[132.6,35.4],[135.7,35.5],[137.4,36.8],[139.4,38.2],[139.9,40.6],[141.4,41.4],[141.9,39.2]],[[144.6,44.0],[145.5,43.3],[143.2,42.0],[141.1,41.6],[139.8,42.6],[141.4,43.4],[142.0,45.6],[143.9,44.2],[144.6,44.0]],[[132.4,33.5],[133.5,33.9],[134.6,34.1],[134.2,33.2],[133.3,33.3],[132.4,33.0],[132.4,33.5]]]},{"i":"PY","r":[[[-58.2,-20.2],[-57.9,-22.1],[-56.5,-22.1],[-55.6,-22.7],[-55.4,-24.0],[-54.7,-23.8],[-54.3,-24.6],[-54.6,-25.7],[-55.7,-27.4],[-57.6,-27.4],[-57.6,-25.6],[-58.8,-24.8],[-60.8,-23.9],[-62.3,-21.1],[-61.8,-19.6],[-59.1,-19.4],[-58.2,-20.2]]]},{"i":"YE","r":[[[52.0,19.0],[53.1,16.7],[52.2,15.9],[51.2,15.2],[48.7,14.0],[47.9,14.0],[46.7,13.4],[45.6,13.3],[45.1,13.0],[44.5,12.7],[43.5,12.6],[43.3,13.8],[42.9,14.8],[42.8,15.3],[42.8,15.9],[43.2,16.7],[43.4,17.6],[44.1,17.4],[45.4,17.3],[46.7,17.3],[47.5,17.1],[49.1,18.6],[52.0,19.0]]]},{"i":"SA","r":[[[35.0,29.4],[36.5,29.5],[37.5,30.0],[38.0,30.5],[39.0,32.0],[40.4,31.9],[44.7,29.2],[47.5,29.0],[48.4,28.6],[49.3,27.5],[50.2,26.7],[50.1,25.9],[50.5,25.3],[50.8,24.8],[51.4,24.6],[51.6,24.0],[55.0,22.5],[55.7,22.0],[52.0,19.0],[48.2,18.2],[47.0,16.9],[46.4,17.2],[45.2,17.4],[43.8,17.3],[43.1,17.1],[42.8,16.3],[42.3,17.1],[41.8,17.8],[40.9,19.5],[39.8,20.3],[39.0,22.0],[38.5,23.7],[37.5,24.3],[37.2,25.1],[36.6,25.8],[35.6,27.4],[34.6,28.1],[34.8,29.0],[35.0,29.4]]]},{"i":"AQ","r":[[[-48.7,-78.0],[-46.7,-77.8],[-43.9,-78.5],[-43.4,-79.5],[-44.9,-80.3],[-48.4,-80.8],[-52.9,-81.0],[-54.0,-80.2],[-51.0,-79.6],[-49.9,-78.8],[-48.7,-78.0]],[[-66.3,-80.3],[-61.9,-80.4],[-60.6,-79.6],[-59.9,-80.5],[-62.3,-80.9],[-65.7,-80.6],[-66.3,-80.3]],[[-73.9,-71.3],[-73.2,-71.2],[-71.8,-70.7],[-71.7,-69.5],[-70.3,-68.9],[-69.5,-69.6],[-68.7,-70.5],[-68.3,-71.4],[-68.8,-72.2],[-71.1,-72.5],[-71.9,-72.1],[-74.2,-72.4],[-75.0,-71.7],[-73.9,-71.3]],[[-102.3,-71.9],[-101.7,-71.7],[-99.0,-71.9],[-96.8,-72.0],[-97.0,-72.4],[-99.4,-72.4],[-101.8,-72.3],[-102.3,-71.9]],[[-122.6,-73.7],[-122.4,-73.3],[-119.9,-73.7],[-119.3,-73.8],[-121.6,-74.0],[-122.6,-73.7]],[[-127.3,-73.5],[-126.6,-73.2],[-124.0,-73.9],[-125.9,-73.7],[-127.3,-73.5]],[[-163.7,-78.6],[-163.1,-78.2],[-160.2,-78.7],[-159.2,-79.5],[-162.4,-79.3],[-163.1,-78.9],[-163.7,-78.6]],[[180,-84.7],[180,-90],[-180,-90],[-180,-84.7],[-179.9,-84.7],[-179.1,-84.1],[-177.3,-84.5],[-177.1,-84.4],[-176.1,-84.1],[-175.9,-84.1],[-175.8,-84.1],[-174.4,-84.5],[-173.1,-84.1],[-172.9,-84.1],[-170.0,-83.9],[-169.0,-84.1],[-168.5,-84.2],[-167.0,-84.6],[-164.2,-84.8],[-161.9,-85.1],[-158.1,-85.4],[-155.2,-85.1],[-150.9,-85.3],[-148.5,-85.6],[-145.9,-85.3],[-143.1,-85.0],[-142.9,-84.6],[-146.8,-84.5],[-150.1,-84.3],[-150.9,-83.9],[-153.6,-83.7],[-153.4,-83.2],[-153.0,-82.8],[-152.7,-82.5],[-152.9,-82.0],[-154.5,-81.8],[-155.3,-81.4],[-156.8,-81.1],[-154.4,-81.2],[-152.1,-81.0],[-150.6,-81.3],[-148.9,-81.0],[-147.2,-80.7],[-146.4,-80.3],[-146.8,-79.9],[-148.1,-79.7],[-149.5,-79.4],[-151.6,-79.3],[-153.4,-79.2],[-155.3,-79.1],[-156.0,-78.7],[-157.3,-78.4],[-158.1,-78.0],[-158.4,-76.9],[-157.9,-77.0],[-157.0,-77.3],[-155.3,-77.2],[-153.7,-77.1],[-152.9,-77.5],[-151.3,-77.4],[-150.0,-77.2],[-148.7,-76.9],[-147.6,-76.6],[-146.1,-76.5],[-146.1,-76.1],[-146.5,-75.7],[-146.2,-75.4],[-144.9,-75.2],[-144.3,-75.5],[-142.8,-75.3],[-141.6,-75.1],[-140.2,-75.1],[-138.9,-75.0],[-137.5,-74.7],[-136.4,-74.5],[-135.2,-74.3],[-134.4,-74.4],[-133.7,-74.4],[-132.3,-74.3],[-130.9,-74.5],[-129.6,-74.5],[-128.2,-74.3],[-126.9,-74.4],[-125.4,-74.5],[-124.0,-74.5],[-122.6,-74.5],[-121.1,-74.5],[-119.7,-74.5],[-118.7,-74.2],[-117.5,-74.0],[-116.2,-74.2],[-115.0,-74.1],[-113.9,-73.7],[-113.3,-74.0],[-112.9,-74.4],[-112.3,-74.7],[-111.3,-74.4],[-110.1,-74.8],[-108.7,-74.9],[-107.6,-75.2],[-106.1,-75.1],[-104.9,-74.9],[-103.4,-75.0],[-102.0,-75.1],[-100.6,-75.3],[-100.1,-74.9],[-100.8,-74.5],[-101.3,-74.2],[-102.5,-74.1],[-103.1,-73.7],[-103.3,-73.4],[-103.7,-72.6],[-102.9,-72.8],[-101.6,-72.8],[-100.3,-72.8],[-99.1,-72.9],[-98.1,-73.2],[-97.7,-73.6],[-96.3,-73.6],[-95.0,-73.5],[-93.7,-73.3],[-92.4,-73.2],[-91.4,-73.4],[-90.1,-73.3],[-89.2,-72.6],[-88.4,-73.0],[-87.3,-73.2],[-86.0,-73.1],[-85.2,-73.5],[-83.9,-73.5],[-82.7,-73.6],[-81.5,-73.9],[-80.7,-73.5],[-80.3,-73.1],[-79.3,-73.5],[-77.9,-73.4],[-76.9,-73.6],[-76.2,-74.0],[-74.9,-73.9],[-73.9,-73.7],[-72.8,-73.4],[-71.6,-73.3],[-70.2,-73.1],[-68.9,-73.0],[-68.0,-72.8],[-67.4,-72.5],[-67.1,-72.0],[-67.3,-71.6],[-67.6,-71.2],[-67.9,-70.9],[-68.2,-70.5],[-68.5,-70.1],[-68.5,-69.7],[-68.4,-69.3],[-68.0,-69.0],[-67.6,-68.5],[-67.4,-68.1],[-67.6,-67.7],[-67.7,-67.3],[-67.3,-66.9],[-66.7,-66.6],[-66.1,-66.2],[-65.4,-65.9],[-64.6,-65.6],[-64.2,-65.2],[-63.6,-64.9],[-63.0,-64.6],[-62.0,-64.6],[-61.4,-64.3],[-60.7,-64.1],[-59.9,-64.0],[-59.2,-63.7],[-58.6,-63.4],[-57.8,-63.3],[-57.2,-63.5],[-57.6,-63.9],[-58.6,-64.2],[-59.0,-64.4],[-59.8,-64.2],[-60.6,-64.3],[-61.3,-64.5],[-62.0,-64.8],[-62.5,-65.1],[-62.6,-65.5],[-62.6,-65.9],[-62.1,-66.2],[-62.8,-66.4],[-63.7,-66.5],[-64.3,-66.8],[-64.9,-67.2],[-65.5,-67.6],[-65.7,-68.0],[-65.3,-68.4],[-64.8,-68.7],[-64.0,-68.9],[-63.2,-69.2],[-62.8,-69.6],[-62.6,-70.0],[-62.3,-70.4],[-61.8,-70.7],[-61.5,-71.1],[-61.4,-72.0],[-61.1,-72.4],[-61.0,-72.8],[-60.7,-73.2],[-60.8,-73.7],[-61.4,-74.1],[-62.0,-74.4],[-63.3,-74.6],[-63.7,-74.9],[-64.4,-75.3],[-65.9,-75.6],[-67.2,-75.8],[-68.4,-76.0],[-69.8,-76.2],[-70.6,-76.6],[-72.2,-76.7],[-74.0,-76.6],[-75.6,-76.7],[-77.2,-76.7],[-76.9,-77.1],[-75.4,-77.3],[-74.3,-77.6],[-73.7,-77.9],[-74.8,-78.2],[-76.5,-78.1],[-77.9,-78.4],[-78.0,-78.8],[-78.0,-79.2],[-76.8,-79.5],[-76.6,-79.9],[-75.4,-80.3],[-73.2,-80.4],[-71.4,-80.7],[-70.0,-81.0],[-68.2,-81.3],[-65.7,-81.5],[-63.3,-81.7],[-61.6,-82.0],[-59.7,-82.4],[-58.7,-82.8],[-58.2,-83.2],[-57.0,-82.9],[-55.4,-82.6],[-53.6,-82.3],[-51.5,-82.0],[-49.8,-81.7],[-47.3,-81.7],[-44.8,-81.8],[-42.8,-82.1],[-42.2,-81.7],[-40.8,-81.4],[-38.2,-81.3],[-36.3,-81.1],[-34.4,-80.9],[-32.3,-80.8],[-30.1,-80.6],[-28.5,-80.3],[-29.3,-80.0],[-29.7,-79.6],[-29.7,-79.3],[-31.6,-79.3],[-33.7,-79.5],[-35.6,-79.5],[-35.9,-79.1],[-35.8,-78.3],[-35.3,-78.1],[-33.9,-77.9],[-32.2,-77.7],[-31.0,-77.4],[-29.8,-77.1],[-28.9,-76.7],[-27.5,-76.5],[-26.2,-76.4],[-25.5,-76.3],[-23.9,-76.2],[-22.5,-76.1],[-21.2,-75.9],[-20.0,-75.7],[-18.9,-75.4],[-17.5,-75.1],[-16.6,-74.8],[-15.7,-74.5],[-15.4,-74.1],[-16.5,-73.9],[-16.1,-73.5],[-15.4,-73.1],[-14.4,-73.0],[-13.3,-72.7],[-12.3,-72.4],[-11.5,-72.0],[-11.0,-71.5],[-10.3,-71.3],[-9.1,-71.3],[-8.6,-71.7],[-7.4,-71.7],[-7.4,-71.3],[-6.9,-70.9],[-5.8,-71.0],[-5.5,-71.4],[-4.3,-71.5],[-3.0,-71.3],[-1.8,-71.2],[-0.7,-71.2],[-0.2,-71.6],[0.9,-71.3],[1.9,-71.1],[3.0,-71.0],[4.1,-70.9],[5.2,-70.6],[6.3,-70.5],[7.1,-70.2],[7.7,-69.9],[8.5,-70.1],[9.5,-70.0],[10.2,-70.5],[10.8,-70.8],[12.0,-70.6],[12.4,-70.2],[13.4,-70.0],[14.7,-70.0],[15.1,-70.4],[15.9,-70.0],[17.0,-69.9],[18.2,-69.9],[19.3,-69.9],[20.4,-70.0],[21.5,-70.1],[21.9,-70.4],[22.6,-70.7],[23.7,-70.5],[24.8,-70.5],[26.0,-70.5],[27.1,-70.5],[28.1,-70.3],[29.2,-70.2],[30.0,-69.9],[31.0,-69.8],[32.0,-69.7],[32.8,-69.4],[33.3,-68.8],[33.9,-68.5],[34.9,-68.7],[35.3,-69.0],[36.2,-69.2],[37.2,-69.2],[37.9,-69.5],[38.6,-69.8],[39.7,-69.5],[40.0,-69.1],[40.9,-68.9],[42.0,-68.6],[42.9,-68.5],[44.1,-68.3],[44.9,-68.1],[45.7,-67.8],[46.5,-67.6],[47.4,-67.7],[48.3,-67.4],[49.0,-67.1],[49.9,-67.1],[50.8,-66.9],[50.9,-66.5],[51.8,-66.2],[52.6,-66.1],[53.6,-65.9],[54.5,-65.8],[55.4,-65.9],[56.4,-66.0],[57.2,-66.2],[57.3,-66.7],[58.1,-67.0],[58.7,-67.3],[59.9,-67.4],[60.6,-67.7],[61.4,-68.0],[62.4,-68.0],[63.2,-67.8],[64.1,-67.4],[65.0,-67.6],[66.0,-67.7],[66.9,-67.9],[67.9,-67.9],[68.9,-67.9],[69.7,-69.0],[69.7,-69.2],[69.6,-69.7],[68.6,-69.9],[67.8,-70.3],[67.9,-70.7],[69.1,-70.7],[68.9,-71.1],[68.4,-71.4],[67.9,-71.9],[68.7,-72.2],[69.9,-72.3],[71.0,-72.1],[71.6,-71.7],[71.9,-71.3],[72.5,-71.0],[73.1,-70.7],[73.3,-70.4],[73.9,-69.9],[74.5,-69.8],[75.6,-69.7],[76.6,-69.6],[77.6,-69.5],[78.1,-69.1],[78.4,-68.7],[79.1,-68.3],[80.1,-68.1],[80.9,-67.9],[81.5,-67.5],[82.1,-67.4],[82.8,-67.2],[83.8,-67.3],[84.7,-67.2],[85.7,-67.1],[86.8,-67.2],[87.5,-66.9],[88.0,-66.2],[88.4,-66.5],[88.8,-67.0],[89.7,-67.2],[90.6,-67.2],[91.6,-67.1],[92.6,-67.2],[93.5,-67.2],[94.2,-67.1],[95.0,-67.2],[95.8,-67.4],[96.7,-67.2],[97.8,-67.2],[98.7,-67.1],[99.7,-67.2],[100.4,-66.9],[100.9,-66.6],[101.6,-66.3],[102.8,-65.6],[103.5,-65.7],[104.2,-66.0],[104.9,-66.3],[106.2,-66.9],[107.2,-67.0],[108.1,-67.0],[109.2,-66.8],[110.2,-66.7],[111.1,-66.4],[111.7,-66.1],[112.9,-66.1],[113.6,-65.9],[114.4,-66.1],[114.9,-66.4],[115.6,-66.7],[116.7,-66.7],[117.4,-66.9],[118.6,-67.2],[119.8,-67.3],[120.9,-67.2],[121.7,-66.9],[122.3,-66.6],[123.2,-66.5],[124.1,-66.6],[125.2,-66.7],[126.1,-66.6],[127.0,-66.6],[127.9,-66.7],[128.8,-66.8],[129.7,-66.6],[130.8,-66.4],[131.8,-66.4],[132.9,-66.4],[133.9,-66.3],[134.8,-66.2],[135.0,-65.7],[135.1,-65.3],[135.7,-65.6],[135.9,-66.0],[136.2,-66.4],[136.6,-66.8],[137.5,-67.0],[138.6,-66.9],[139.9,-66.9],[140.8,-66.8],[142.1,-66.8],[143.1,-66.8],[144.4,-66.8],[145.5,-66.9],[146.2,-67.2],[146.0,-67.6],[146.6,-67.9],[147.7,-68.1],[148.8,-68.4],[150.1,-68.6],[151.5,-68.7],[152.5,-68.9],[153.6,-68.9],[154.3,-68.6],[155.2,-68.8],[155.9,-69.1],[156.8,-69.4],[158.0,-69.5],[159.2,-69.6],[159.7,-70.0],[160.8,-70.2],[161.6,-70.6],[162.7,-70.7],[163.8,-70.7],[164.9,-70.8],[166.1,-70.8],[167.3,-70.8],[168.4,-71.0],[169.5,-71.2],[170.5,-71.4],[171.2,-71.7],[171.1,-72.1],[170.6,-72.4],[170.1,-72.9],[169.8,-73.2],[169.3,-73.7],[168.0,-73.8],[167.4,-74.2],[166.1,-74.4],[165.6,-74.8],[165.0,-75.1],[164.2,-75.5],[163.8,-75.9],[163.6,-76.2],[163.5,-76.7],[163.5,-77.1],[164.1,-77.5],[164.3,-77.8],[164.7,-78.2],[166.6,-78.3],[167.0,-78.8],[165.2,-78.9],[163.7,-79.1],[161.8,-79.2],[160.9,-79.7],[160.7,-80.2],[160.3,-80.6],[159.8,-80.9],[161.1,-81.3],[161.6,-81.7],[162.5,-82.1],[163.7,-82.4],[165.1,-82.7],[166.6,-83.0],[168.9,-83.3],[169.4,-83.8],[172.3,-84.0],[172.5,-84.1],[173.2,-84.4],[176.0,-84.2],[178.3,-84.5],[180,-84.7]]]},{"i":"","r":[[[32.7,35.1],[32.9,35.4],[34.6,35.7],[34.0,35.1],[33.7,35.0],[33.5,35.0],[33.4,35.2],[32.9,35.1],[32.7,35.1]]]},{"i":"MA","r":[[[-2.2,35.2],[-1.7,33.9],[-1.1,32.7],[-2.6,32.1],[-3.6,31.6],[-4.9,30.5],[-6.1,29.7],[-8.7,28.8],[-8.8,27.7],[-9.4,27.1],[-10.2,26.9],[-11.4,26.9],[-12.0,26.0],[-13.9,23.7],[-14.6,21.9],[-17.0,21.4],[-17.0,21.9],[-16.3,22.7],[-16.0,23.7],[-15.1,24.5],[-14.8,25.6],[-13.8,26.6],[-13.1,27.7],[-11.7,28.1],[-10.4,29.1],[-9.8,31.2],[-9.3,32.6],[-7.7,33.7],[-6.2,35.1],[-5.2,35.8],[-3.6,35.4],[-2.2,35.2]]]},{"i":"EG","r":[[[36.9,22],[29.0,22],[25,25.7],[24.7,30.0],[24.8,31.1],[26.5,31.6],[28.5,31.0],[29.7,31.2],[31.0,31.6],[32.0,30.9],[33.0,31.0],[34.3,31.2],[34.8,29.8],[34.6,29.1],[34.2,27.8],[33.6,28.0],[32.4,29.9],[32.7,28.7],[34.1,26.1],[34.8,25.0],[35.5,23.8],[36.7,22.2],[36.9,22]]]},{"i":"LY","r":[[[25,22],[23.9,20],[19.8,21.5],[14.9,22.9],[13.6,23.0],[11.6,24.1],[10.3,24.4],[9.9,25.4],[9.7,26.5],[9.8,27.7],[9.9,29.0],[9.5,30.3],[10.1,31.0],[10.6,31.8],[11.4,32.4],[12.7,32.8],[13.9,32.7],[15.7,31.4],[18.0,30.8],[19.6,30.5],[19.8,31.8],[20.9,32.7],[22.9,32.6],[23.6,32.2],[24.9,31.9],[24.8,31.1],[24.7,30.0],[25,25.7],[25,22]]]},{"i":"ET","r":[[[47.8,8.0],[43.7,5.0],[42.1,4.2],[41.2,3.9],[39.9,3.8],[38.9,3.5],[38.4,3.6],[36.9,4.4],[35.8,4.8],[35.3,5.5],[34.3,6.8],[33.6,7.7],[33.3,8.4],[34.0,8.7],[34.3,10.6],[34.8,11.3],[35.9,12.6],[36.4,14.4],[37.9,15.0],[39.1,14.7],[40.0,14.5],[41.2,13.8],[42.0,12.9],[42,12.1],[41.7,11.4],[42.3,11.0],[42.8,10.9],[42.9,10.0],[43.7,9.2],[47.8,8.0]]]},{"i":"DJ","r":[[[42.4,12.5],[43.1,12.7],[43.3,12.0],[43.1,11.5],[42.6,11.1],[41.8,11.1],[41.7,11.6],[42.4,12.5]]]},{"i":"","r":[[[48.9,11.4],[48.9,10.0],[48.5,8.8],[46.9,8.0],[43.3,9.5],[42.6,10.6],[43.1,11.5],[43.7,10.9],[44.6,10.4],[46.6,10.8],[48.0,11.2],[48.9,11.4]]]},{"i":"UG","r":[[[33.9,-0.9],[30.8,-1.0],[29.8,-1.4],[29.6,-0.6],[29.9,0.6],[30.5,1.6],[31.2,2.2],[30.8,3.5],[31.2,3.8],[32.7,3.8],[34.0,4.2],[34.6,3.1],[34.7,1.2],[33.9,0.1],[33.9,-0.9]]]},{"i":"RW","r":[[[30.4,-1.1],[30.8,-2.3],[30.5,-2.4],[29.6,-2.9],[29.1,-2.3],[29.3,-1.6],[29.8,-1.4],[30.4,-1.1]]]},{"i":"BA","r":[[[18.6,42.6],[17.3,43.4],[16.5,44.0],[15.8,44.8],[16.3,45.0],[17.0,45.2],[18.6,45.1],[19.0,44.9],[19.1,44.4],[19.5,43.6],[19.0,43.4],[18.6,42.6]]]},{"i":"MK","r":[[[22.4,42.3],[23.0,41.3],[22.6,41.1],[21.7,40.9],[20.6,41.1],[20.6,41.9],[20.7,41.8],[21.4,42.2],[21.9,42.3],[22.4,42.3]]]},{"i":"RS","r":[[[18.8,45.9],[19.6,46.2],[20.8,45.7],[21.5,45.2],[22.1,44.5],[22.7,44.6],[22.7,44.2],[22.5,43.6],[22.6,42.9],[22.5,42.5],[21.9,42.3],[21.5,42.3],[21.8,42.7],[21.4,42.9],[21.1,43.1],[20.8,43.3],[20.5,42.9],[20.3,42.9],[19.6,43.2],[19.2,43.5],[19.6,44.0],[19.4,44.9],[19.0,44.9],[19.1,45.5],[18.8,45.9]]]},{"i":"ME","r":[[[20.1,42.6],[19.7,42.7],[19.4,41.9],[18.9,42.3],[18.6,42.6],[19.0,43.4],[19.5,43.4],[20.0,43.1],[20.3,42.8],[20.1,42.6]]]},{"i":"XK","r":[[[20.6,41.9],[20.3,42.3],[20.3,42.8],[20.6,43.2],[21.0,43.1],[21.3,42.9],[21.6,42.7],[21.7,42.4],[21.6,42.2],[20.8,42.1],[20.6,41.9]]]},{"i":"SS","r":[[[30.8,3.5],[29.7,4.6],[28.7,4.5],[28.0,4.4],[27.2,5.6],[26.2,6.5],[25.1,7.5],[24.6,8.2],[24.2,8.7],[24.8,9.8],[25.8,10.4],[26.5,9.6],[27.1,9.6],[28.0,9.4],[29.0,9.6],[29.6,10.1],[30.8,9.7],[31.9,10.5],[32.3,11.7],[32.7,12.0],[33.2,12.2],[33.2,10.7],[33.8,10.0],[34.0,9.5],[33.8,8.4],[33.0,7.8],[34.1,7.2],[34.7,6.6],[34.6,4.8],[33.4,3.8],[31.9,3.6],[30.8,3.5]]]},{"i":"SG","r":[[[103.97,1.33],[103.82,1.27],[103.65,1.33],[103.71,1.42],[103.82,1.45],[103.91,1.42],[103.96,1.39],[104.0,1.37],[103.97,1.33]]]},{"i":"HK","r":[[[114.02,22.51],[114.05,22.54],[114.1,22.55],[114.12,22.56],[114.19,22.56],[114.23,22.55],[114.27,22.54],[114.29,22.5],[114.28,22.46],[114.33,22.44],[114.34,22.4],[114.29,22.37],[114.29,22.33],[114.27,22.3],[114.14,22.35],[114.03,22.38],[113.94,22.36],[113.9,22.4],[113.9,22.43],[114.01,22.48],[114.02,22.51]],[[114.23,22.21],[114.21,22.2],[114.14,22.27],[114.13,22.29],[114.19,22.3],[114.25,22.26],[114.24,22.23],[114.23,22.21]],[[114.0,22.21],[113.88,22.21],[113.85,22.22],[113.84,22.24],[113.88,22.28],[114.04,22.33],[114.0,22.28],[114.0,22.21]]]}];
const GLOBE_CENT={"AF":[66,33],"AL":[20,41],"DZ":[2.6,28],"AD":[1.5,42.5],"AO":[17.8,-11.2],"AG":[-61.8,17.1],"AR":[-64,-34],"AM":[45,40],"AW":[-69.9,12.5],"AS":[-170.7,-14.3],"AU":[134,-25],"AT":[14.5,47.6],"AZ":[47.5,40.4],"BS":[-77.4,24.2],"BD":[90.4,23.7],"BB":[-59.5,13.2],"BI":[29.9,-3.4],"BE":[4.5,50.6],"BJ":[2.3,9.6],"BM":[-64.8,32.3],"BT":[90.4,27.5],"BA":[17.8,44],"BZ":[-88.5,17.2],"BY":[27.9,53.7],"BO":[-64.7,-16.7],"BW":[24.7,-22.2],"BR":[-51.9,-10.8],"BH":[50.6,26],"BN":[114.7,4.5],"BG":[25.2,42.7],"BF":[-1.7,12.3],"CF":[20.9,6.6],"KH":[105,12.7],"CA":[-106,56],"KY":[-80.9,19.3],"CG":[15.8,-0.8],"TD":[18.7,15.4],"CL":[-71.5,-35.7],"CN":[104,35.9],"CI":[-5.5,7.6],"CM":[12.7,5.7],"CD":[23.6,-2.9],"CK":[-159.8,-21.2],"CO":[-73.1,3.9],"KM":[43.9,-11.6],"CV":[-23.6,16],"CR":[-84.2,9.9],"HR":[15.2,45.1],"CU":[-77.8,21.6],"CY":[33.4,35.1],"CZ":[15.5,49.8],"DK":[9.5,56.3],"DJ":[42.6,11.7],"DM":[-61.4,15.4],"DO":[-70.5,18.9],"EC":[-78.2,-1.4],"EG":[30,26.8],"ER":[39.8,15.3],"SV":[-88.9,13.8],"ES":[-3.6,40.2],"EE":[25.5,58.6],"ET":[39.6,8.6],"FJ":[178,-17.8],"FI":[26,64.5],"FR":[2.5,46.6],"FM":[150.5,6.9],"GA":[11.8,-0.6],"GM":[-15.4,13.4],"GB":[-2.4,54.2],"GW":[-15,12],"GE":[43.4,42.2],"GQ":[10.3,1.6],"DE":[10.4,51.2],"GH":[-1.2,7.9],"GR":[22.9,39.1],"GD":[-61.7,12.1],"GT":[-90.4,15.7],"GN":[-10.9,10.4],"GU":[144.8,13.4],"GY":[-58.9,4.8],"HT":[-72.7,19],"HK":[114.1,22.4],"HN":[-86.6,14.8],"HU":[19.4,47.2],"ID":[114,-2],"IN":[79.6,22.9],"IR":[54.3,32.4],"IE":[-8,53.2],"IQ":[43.7,33.2],"IS":[-18.6,64.9],"IL":[35,31.5],"VI":[-64.8,18.3],"IT":[12.6,42.5],"VG":[-64.6,18.4],"JM":[-77.3,18.1],"JO":[36.8,31.3],"JP":[138,37.5],"KZ":[67.3,48],"KE":[37.9,0.5],"KG":[74.8,41.5],"KI":[173,1.4],"KR":[127.8,36.4],"XK":[20.9,42.6],"SA":[45.1,23.9],"KW":[47.6,29.3],"LA":[103.8,18.5],"LV":[24.9,56.9],"LY":[18,27],"LR":[-9.4,6.5],"LC":[-61,13.9],"LS":[28.2,-29.6],"LB":[35.9,33.9],"LI":[9.5,47.1],"LT":[23.9,55.2],"LU":[6.1,49.8],"MG":[46.7,-19.4],"MA":[-7.1,31.8],"MY":[109.7,3.8],"MW":[34.3,-13.2],"MD":[28.4,47],"MV":[73.2,3.7],"MX":[-102.5,23.6],"MN":[103.8,46.8],"MH":[171.2,7.1],"MK":[21.7,41.6],"ML":[-3.5,17.6],"MT":[14.4,35.9],"ME":[19.3,42.7],"MC":[7.4,43.7],"MZ":[35.5,-17.3],"MU":[57.6,-20.3],"MR":[-10.9,20.3],"MM":[96,21.9],"NA":[18.5,-22.1],"NI":[-85,12.9],"NL":[5.3,52.1],"NP":[84.1,28.3],"NG":[8.1,9.6],"NE":[8.1,17.6],"NO":[9,61.5],"NR":[166.9,-0.5],"NZ":[172,-41.8],"OM":[56.1,21.5],"PK":[69.3,30.4],"PA":[-80.1,8.5],"PY":[-58.4,-23.4],"PE":[-75,-9.2],"PH":[122.9,11.8],"PS":[35.3,31.9],"PW":[134.6,7.5],"PG":[143.9,-6.5],"PL":[19.4,52],"PT":[-8.1,39.6],"KP":[127.5,40.3],"PR":[-66.5,18.2],"QA":[51.2,25.3],"TW":[121,23.8],"ZA":[24.7,-29],"RO":[24.9,45.8],"RU":[97.7,61.5],"RW":[29.9,-1.9],"WS":[-172.1,-13.7],"SN":[-14.5,14.5],"SC":[55.5,-4.7],"SG":[103.8,1.4],"KN":[-62.7,17.3],"SL":[-11.8,8.5],"SI":[14.8,46.1],"SM":[12.5,43.9],"SB":[160.2,-9.6],"SO":[46.2,5.2],"RS":[20.8,44],"LK":[80.7,7.9],"SS":[31.3,7.3],"ST":[6.6,0.2],"SD":[30.2,16],"CH":[8.2,46.8],"SR":[-56,4],"SK":[19.5,48.7],"SE":[15.3,62.2],"SZ":[31.5,-26.5],"SY":[38.5,35],"TZ":[34.9,-6.4],"TO":[-175.2,-21.2],"TH":[101,15.1],"TJ":[71.3,38.9],"TM":[59.6,39.1],"TL":[125.7,-8.8],"TG":[0.8,8.6],"TT":[-61.3,10.5],"TN":[9.6,34.1],"TR":[35.2,39],"TV":[178.7,-7.5],"AE":[54,23.9],"UG":[32.4,1.4],"UA":[31.2,49],"UY":[-55.8,-32.5],"US":[-98.5,39.8],"UZ":[63.1,41.4],"VU":[166.9,-15.4],"VE":[-66.6,6.4],"VN":[106.3,16.2],"VC":[-61.2,13.2],"YE":[47.6,15.6],"ZM":[27.8,-13.1],"ZW":[29.2,-19]};
const GLOBE_NAMES={"AF":"Afghanistan","AL":"Albania","DZ":"Algeria","AD":"Andorra","AO":"Angola","AG":"Antigua & Barbuda","AR":"Argentina","AM":"Armenia","AW":"Aruba","AS":"American Samoa","AU":"Australia","AT":"Austria","AZ":"Azerbaijan","BS":"Bahamas","BD":"Bangladesh","BB":"Barbados","BI":"Burundi","BE":"Belgium","BJ":"Benin","BM":"Bermuda","BT":"Bhutan","BA":"Bosnia","BZ":"Belize","BY":"Belarus","BO":"Bolivia","BW":"Botswana","BR":"Brazil","BH":"Bahrain","BN":"Brunei","BG":"Bulgaria","BF":"Burkina Faso","CF":"Central African Rep.","KH":"Cambodia","CA":"Canada","KY":"Cayman Islands","CG":"Congo","TD":"Chad","CL":"Chile","CN":"China","CI":"C\u00f4te d'Ivoire","CM":"Cameroon","CD":"DR Congo","CK":"Cook Islands","CO":"Colombia","KM":"Comoros","CV":"Cape Verde","CR":"Costa Rica","HR":"Croatia","CU":"Cuba","CY":"Cyprus","CZ":"Czech Republic","DK":"Denmark","DJ":"Djibouti","DM":"Dominica","DO":"Dominican Republic","EC":"Ecuador","EG":"Egypt","ER":"Eritrea","SV":"El Salvador","ES":"Spain","EE":"Estonia","ET":"Ethiopia","FJ":"Fiji","FI":"Finland","FR":"France","FM":"Micronesia","GA":"Gabon","GM":"Gambia","GB":"Great Britain","GW":"Guinea-Bissau","GE":"Georgia","GQ":"Equatorial Guinea","DE":"Germany","GH":"Ghana","GR":"Greece","GD":"Grenada","GT":"Guatemala","GN":"Guinea","GU":"Guam","GY":"Guyana","HT":"Haiti","HK":"Hong Kong","HN":"Honduras","HU":"Hungary","ID":"Indonesia","IN":"India","IR":"Iran","IE":"Ireland","IQ":"Iraq","IS":"Iceland","IL":"Israel","VI":"US Virgin Islands","IT":"Italy","VG":"British Virgin Islands","JM":"Jamaica","JO":"Jordan","JP":"Japan","KZ":"Kazakhstan","KE":"Kenya","KG":"Kyrgyzstan","KI":"Kiribati","KR":"South Korea","XK":"Kosovo","SA":"Saudi Arabia","KW":"Kuwait","LA":"Laos","LV":"Latvia","LY":"Libya","LR":"Liberia","LC":"Saint Lucia","LS":"Lesotho","LB":"Lebanon","LI":"Liechtenstein","LT":"Lithuania","LU":"Luxembourg","MG":"Madagascar","MA":"Morocco","MY":"Malaysia","MW":"Malawi","MD":"Moldova","MV":"Maldives","MX":"Mexico","MN":"Mongolia","MH":"Marshall Islands","MK":"North Macedonia","ML":"Mali","MT":"Malta","ME":"Montenegro","MC":"Monaco","MZ":"Mozambique","MU":"Mauritius","MR":"Mauritania","MM":"Myanmar","NA":"Namibia","NI":"Nicaragua","NL":"Netherlands","NP":"Nepal","NG":"Nigeria","NE":"Niger","NO":"Norway","NR":"Nauru","NZ":"New Zealand","OM":"Oman","PK":"Pakistan","PA":"Panama","PY":"Paraguay","PE":"Peru","PH":"Philippines","PS":"Palestine","PW":"Palau","PG":"Papua New Guinea","PL":"Poland","PT":"Portugal","KP":"North Korea","PR":"Puerto Rico","QA":"Qatar","TW":"Chinese Taipei","ZA":"South Africa","RO":"Romania","RU":"Russia","RW":"Rwanda","WS":"Samoa","SN":"Senegal","SC":"Seychelles","SG":"Singapore","KN":"St Kitts & Nevis","SL":"Sierra Leone","SI":"Slovenia","SM":"San Marino","SB":"Solomon Islands","SO":"Somalia","RS":"Serbia","LK":"Sri Lanka","SS":"South Sudan","ST":"S\u00e3o Tom\u00e9","SD":"Sudan","CH":"Switzerland","SR":"Suriname","SK":"Slovakia","SE":"Sweden","SZ":"Eswatini","SY":"Syria","TZ":"Tanzania","TO":"Tonga","TH":"Thailand","TJ":"Tajikistan","TM":"Turkmenistan","TL":"Timor-Leste","TG":"Togo","TT":"Trinidad & Tobago","TN":"Tunisia","TR":"Turkey","TV":"Tuvalu","AE":"UAE","UG":"Uganda","UA":"Ukraine","UY":"Uruguay","US":"United States","UZ":"Uzbekistan","VU":"Vanuatu","VE":"Venezuela","VN":"Vietnam","VC":"St Vincent","YE":"Yemen","ZM":"Zambia","ZW":"Zimbabwe"};
const TINY_ISO=new Set(["HK","SG","MT","MC","SM","LI","BH","SC","MV","BB","GD","LC","VC","KN","DM","AG","BM","KY","AW","GU"]);
// tiered shading: 1 = light red, 2–3 = darker, 4+ = darkest
const TIER_COLORS=["#f0a79e","#d24a3e","#921508"];
function tierColor(count){return count>=4?TIER_COLORS[2]:count>=2?TIER_COLORS[1]:TIER_COLORS[0];}
function tierLabel(count){return count>=4?"4+":count>=2?"2–3":"1";}

class ErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={err:false};}
  static getDerivedStateFromError(){return{err:true};}
  componentDidCatch(e,info){console.error("Globe/render error caught:",e,info);}
  componentDidUpdate(prev){if(prev.resetKey!==this.props.resetKey&&this.state.err)this.setState({err:false});}
  render(){
    if(this.state.err) return this.props.fallback||(
      <div style={{padding:16,color:"#9fbdd9",fontSize:13,textAlign:"center"}}>Couldn't render this view.</div>);
    return this.props.children;
  }
}

function SailingGlobe({countryData,height=330,pulseIso=null,dark=false,mini=false,bare=false,countLabel="regatta",hostIso=null,rankShade=false,markersHostOnly=false}){
  const canvasRef=React.useRef(null);
  const wrapRef=React.useRef(null);
  const stateRef=React.useRef({lon:0,lat:-12,zoom:1,auto:true,drag:false,px:0,py:0,vlon:0.16,pinch:0,tlon:null,tlat:null,lastPulse:undefined});
  const pulseRef=React.useRef(pulseIso); pulseRef.current=pulseIso;
  const [tip,setTip]=React.useState(null);

  const data=React.useMemo(()=>countryData||{},[countryData]);
  const isoSet=React.useMemo(()=>new Set(GLOBE_COUNTRIES.map(c=>c.i)),[]);
  const tinyEntries=React.useMemo(()=>Object.keys(data)
    .filter(iso=>GLOBE_CENT[iso]&&(TINY_ISO.has(iso)||!isoSet.has(iso)))
    .map(iso=>({iso,count:data[iso],lon:GLOBE_CENT[iso][0],lat:GLOBE_CENT[iso][1],name:GLOBE_NAMES[iso]||iso})),[data,isoSet]);

  // rank-based red shading: lightest = fewest, darkest = most (competition globe)
  const maxCount=React.useMemo(()=>Object.values(data).reduce((a,b)=>Math.max(a,b),0),[data]);
  const shadeFor=React.useCallback((count)=>{
    if(!rankShade) return tierColor(count);
    if(!count||maxCount<=0) return TIER_COLORS[0];
    // interpolate light(#f0a79e) -> dark(#7a0d04) by relative count, return HEX
    const t=maxCount<=1?1:(count-1)/(maxCount-1);
    const lerp=(a,b)=>Math.round(a+(b-a)*t);
    const hx=v=>v.toString(16).padStart(2,'0');
    const r=lerp(0xf0,0x7a),g=lerp(0xa7,0x0d),b=lerp(0x9e,0x04);
    return `#${hx(r)}${hx(g)}${hx(b)}`;
  },[rankShade,maxCount]);

  // every shaded country (+host) gets a centroid marker for the glow/ring pass
  const markerEntries=React.useMemo(()=>{
    const out=[],seen=new Set();
    const push=(iso,count)=>{if(!iso||seen.has(iso)||!GLOBE_CENT[iso])return;seen.add(iso);
      out.push({iso,count,lon:GLOBE_CENT[iso][0],lat:GLOBE_CENT[iso][1],name:GLOBE_NAMES[iso]||iso});};
    Object.keys(data).forEach(iso=>push(iso,data[iso]));
    if(hostIso)push(hostIso,data[hostIso]||0);
    return out;
  },[data,hostIso]);

  // Live refs so the canvas effect mounts ONCE and never tears down on data change
  const drawRef=React.useRef({});
  drawRef.current={data,tinyEntries,markerEntries,hostIso,dark,mini,shadeFor,markersHostOnly};

  // Recenter on the busiest country when the data set itself changes
  const dataKey=React.useMemo(()=>Object.keys(data).sort().join(",")+"|"+maxCount,[data,maxCount]);
  React.useEffect(()=>{
    const keys=Object.keys(data); if(!keys.length) return;
    const top=keys.reduce((a,b)=>data[b]>data[a]?b:a,keys[0]);
    const cc=GLOBE_CENT[top]; if(cc){stateRef.current.lon=-cc[0];stateRef.current.lat=Math.max(-35,Math.min(35,-cc[1]*0.4-6));}
  },[dataKey]);

  React.useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext('2d');
    let raf,W,H,baseR,R,cx,cy,dpr=Math.min(2,window.devicePixelRatio||1);
    const size=()=>{const w=wrapRef.current.clientWidth,h=height;W=w;H=h;canvas.width=w*dpr;canvas.height=h*dpr;
      canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
      baseR=Math.min(W,H)/2-16;cx=W/2;cy=H/2;};
    size();
    const D=Math.PI/180;
    const project=(lon,lat,s)=>{const la=lat*D,lo=(lon+s.lon)*D,p0=s.lat*D,cl=Math.cos(la),sl=Math.sin(la);
      const cosc=Math.sin(p0)*sl+Math.cos(p0)*cl*Math.cos(lo);
      return{x:cx+R*(cl*Math.sin(lo)),y:cy-R*(Math.cos(p0)*sl-Math.sin(p0)*cl*Math.cos(lo)),vis:cosc>=0};};
    const runs=(ring,s)=>{const out=[];let cur=null;
      for(const [lon,lat] of ring){const p=project(lon,lat,s);
        if(!p.vis){if(cur&&cur.length>1)out.push(cur);cur=null;continue;}if(!cur)cur=[];cur.push(p);}
      if(cur&&cur.length>1)out.push(cur);return out;};

    const draw=()=>{
      const D2=drawRef.current;
      const data=D2.data,tinyEntries=D2.tinyEntries,hostIso=D2.hostIso,dark=D2.dark,shadeFor=D2.shadeFor;
      const ocean=dark?'#081a33':'#0e2c50';
      const land=dark?'#16365c':'#d9e6f2';
      const s=stateRef.current;R=baseR*s.zoom;
      const pulse=pulseRef.current;
      if(pulse!==s.lastPulse){s.lastPulse=pulse;
        if(pulse&&GLOBE_CENT[pulse]){const c=GLOBE_CENT[pulse];s.tlon=-c[0];s.tlat=Math.max(-45,Math.min(45,-c[1]*0.55));s.auto=false;}
        else{s.tlon=null;s.tlat=null;}}
      if(s.tlon!=null){let dl=((s.tlon-s.lon+540)%360)-180;s.lon+=dl*0.14;s.lat+=(s.tlat-s.lat)*0.14;}
      else if(s.auto&&!s.drag&&s.zoom<1.15)s.lon+=s.vlon;

      ctx.clearRect(0,0,W,H);
      const atm=ctx.createRadialGradient(cx,cy,baseR*0.92,cx,cy,baseR*1.16);
      atm.addColorStop(0,'rgba(120,170,220,0.20)');atm.addColorStop(1,'rgba(120,170,220,0)');
      ctx.fillStyle=atm;ctx.beginPath();ctx.arc(cx,cy,baseR*1.16,0,7);ctx.fill();

      ctx.save();ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.clip();
      ctx.fillStyle=ocean;ctx.fillRect(cx-R,cy-R,R*2,R*2);
      const shg=ctx.createRadialGradient(cx-R*0.3,cy-R*0.35,R*0.1,cx,cy,R);
      shg.addColorStop(0,dark?'rgba(40,90,150,0.45)':'rgba(60,110,165,0.35)');shg.addColorStop(1,'rgba(8,28,52,0)');
      ctx.fillStyle=shg;ctx.fillRect(cx-R,cy-R,R*2,R*2);

      ctx.strokeStyle='rgba(180,205,235,0.08)';ctx.lineWidth=1;
      for(let lat=-60;lat<=60;lat+=30){ctx.beginPath();let st=false;for(let lon=-180;lon<=180;lon+=4){const p=project(lon,lat,s);if(!p.vis){st=false;continue;}st?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);st=true;}ctx.stroke();}
      for(let lon=-180;lon<180;lon+=30){ctx.beginPath();let st=false;for(let lat=-90;lat<=90;lat+=4){const p=project(lon,lat,s);if(!p.vis){st=false;continue;}st?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);st=true;}ctx.stroke();}

      for(const c of GLOBE_COUNTRIES){
        const isHost=hostIso&&c.i===hostIso;
        const competing=data[c.i]>0;
        ctx.fillStyle=isHost?'#ffcf2e':(competing?shadeFor(data[c.i]):land);
        ctx.beginPath();let any=false;
        for(const ring of c.r)for(const run of runs(ring,s)){any=true;ctx.moveTo(run[0].x,run[0].y);for(let i=1;i<run.length;i++)ctx.lineTo(run[i].x,run[i].y);ctx.closePath();}
        if(any)ctx.fill();
        ctx.strokeStyle=isHost?'rgba(180,130,0,0.9)':(competing?'rgba(120,20,12,0.55)':(dark?'rgba(150,185,225,0.30)':'rgba(20,58,99,0.45)'));
        ctx.lineWidth=(isHost||competing)?0.9:0.7;
        for(const ring of c.r)for(const run of runs(ring,s)){ctx.beginPath();ctx.moveTo(run[0].x,run[0].y);for(let i=1;i<run.length;i++)ctx.lineTo(run[i].x,run[i].y);ctx.stroke();}
      }

      // Marker + glow + ring on EVERY shaded country (and the host), so small
      // countries like Hong Kong are visible without zooming and large ones
      // get a clear locator dot too. Compact radius so it doesn't smother things.
      const markerEntries=D2.markerEntries||[];
      const hostOnly=D2.markersHostOnly;
      markerEntries.forEach(e=>{
        const p=project(e.lon,e.lat,s);if(!p.vis){e._sx=null;return;}
        const isHostM=hostIso&&e.iso===hostIso;
        // keep hover hit-area for every country, but only DRAW the host marker
        if(hostOnly&&!isHostM){e._sx=p.x;e._sy=p.y;e._sr=Math.max(R*0.05,14);return;}
        const col=isHostM?'#ffcf2e':shadeFor(e.count);
        const core=Math.max(3.5,Math.min(6,R*0.012));        // compact solid dot
        const halo=core*2.6;                                 // tighter glow
        const g=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,halo);
        g.addColorStop(0,col);g.addColorStop(0.34,col);
        g.addColorStop(0.66,col+'66');g.addColorStop(1,col+'00');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,halo,0,7);ctx.fill();
        ctx.fillStyle=col;ctx.beginPath();ctx.arc(p.x,p.y,core,0,7);ctx.fill();
        ctx.lineWidth=1.4;ctx.strokeStyle=isHostM?'#7a5600':'rgba(255,255,255,0.7)';
        ctx.beginPath();ctx.arc(p.x,p.y,core,0,7);ctx.stroke();
        e._sx=p.x;e._sy=p.y;e._sr=Math.max(halo,11);
      });

      if(s.zoom>=1.6){
        ctx.font='600 10px DM Sans, system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        for(const c of GLOBE_COUNTRIES){const cc=GLOBE_CENT[c.i];const nm=GLOBE_NAMES[c.i];if(!cc||!nm)continue;
          const p=project(cc[0],cc[1],s);if(!p.vis)continue;const competing=data[c.i]>0;
          ctx.lineWidth=2.4;ctx.strokeStyle=competing?'rgba(255,235,232,0.9)':(dark?'rgba(8,24,45,0.85)':'rgba(247,251,255,0.85)');ctx.strokeText(nm,p.x,p.y);
          ctx.fillStyle=competing?'#6e140c':(dark?'#cfe0f2':'#163a63');ctx.fillText(nm,p.x,p.y);}
      }
      ctx.restore();

      // spotlight pulse + glow + name label (any zoom)
      if(pulse&&GLOBE_CENT[pulse]){
        const c=GLOBE_CENT[pulse];const p=project(c[0],c[1],s);
        if(p.vis){
          const ph=(performance.now()%1400)/1400;
          // soft persistent glow so the selected country is easy to spot
          const gl=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,34);
          gl.addColorStop(0,'rgba(255,210,80,0.55)');gl.addColorStop(0.5,'rgba(255,180,60,0.22)');gl.addColorStop(1,'rgba(255,180,60,0)');
          ctx.fillStyle=gl;ctx.beginPath();ctx.arc(p.x,p.y,34,0,7);ctx.fill();
          ctx.beginPath();ctx.arc(p.x,p.y,9+ph*30,0,7);ctx.strokeStyle=`rgba(233,60,50,${(1-ph)*0.9})`;ctx.lineWidth=3;ctx.stroke();
          ctx.beginPath();ctx.arc(p.x,p.y,6,0,7);ctx.fillStyle='#e93c32';ctx.fill();ctx.lineWidth=1.6;ctx.strokeStyle='#fff';ctx.stroke();
          const nm=GLOBE_NAMES[pulse]||pulse;
          ctx.font='700 12px DM Sans, system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
          ctx.lineWidth=3;ctx.strokeStyle='rgba(8,20,40,0.9)';ctx.strokeText(nm,p.x,p.y+12);
          ctx.fillStyle='#ffe3df';ctx.fillText(nm,p.x,p.y+12);
        }
      }
      raf=requestAnimationFrame(draw);
    };
    draw();

    const pt=ev=>{const r=canvas.getBoundingClientRect();const t=ev.touches?ev.touches[0]:ev;return{x:t.clientX-r.left,y:t.clientY-r.top};};
    // window-level drag listeners are bound ONLY while a drag is active, so
    // multiple globe instances on screen never interfere with each other.
    const winMove=ev=>{const s=stateRef.current;if(!s.drag)return;const q=pt(ev);
      s.lon+=(q.x-s.px)*0.4/s.zoom;s.lat=Math.max(-82,Math.min(82,s.lat+(q.y-s.py)*0.4/s.zoom));s.px=q.x;s.py=q.y;setTip(null);};
    const winUp=()=>{const s=stateRef.current;s.drag=false;
      window.removeEventListener('mousemove',winMove);window.removeEventListener('mouseup',winUp);
      setTimeout(()=>{if(!s.drag&&!pulseRef.current)s.auto=true;},2500);};
    const down=ev=>{const s=stateRef.current;const q=pt(ev);s.drag=true;s.auto=false;s.tlon=null;s.tlat=null;s.px=q.x;s.py=q.y;
      window.addEventListener('mousemove',winMove);window.addEventListener('mouseup',winUp);};
    // hover detection only (no drag) — bound to the canvas itself
    const hover=ev=>{const s=stateRef.current;if(s.drag)return;const q=pt(ev);
      let f=null;for(const e of (drawRef.current.markerEntries||[])){if(e._sx==null)continue;if(Math.hypot(q.x-e._sx,q.y-e._sy)<=e._sr){f=e;break;}}
      if(f){canvas.style.cursor='pointer';setTip({x:f._sx,y:f._sy,name:f.name,count:f.count});}else{canvas.style.cursor='grab';setTip(null);}};
    const wheel=ev=>{ev.preventDefault();const s=stateRef.current;s.auto=false;s.zoom=Math.max(1,Math.min(4.5,s.zoom*(ev.deltaY<0?1.12:0.89)));setTip(null);};
    const dist=t=>Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY);
    const tstart=ev=>{const s=stateRef.current;if(ev.touches.length===2){s.pinch=dist(ev.touches);s.drag=false;s.auto=false;}else{const q=pt(ev);s.drag=true;s.auto=false;s.tlon=null;s.tlat=null;s.px=q.x;s.py=q.y;}};
    const tmove=ev=>{const s=stateRef.current;if(ev.touches.length===2&&s.pinch){const d=dist(ev.touches);s.zoom=Math.max(1,Math.min(4.5,s.zoom*d/s.pinch));s.pinch=d;setTip(null);}
      else if(s.drag){const q=pt(ev);s.lon+=(q.x-s.px)*0.4/s.zoom;s.lat=Math.max(-82,Math.min(82,s.lat+(q.y-s.py)*0.4/s.zoom));s.px=q.x;s.py=q.y;setTip(null);}};
    const tend=()=>{const s=stateRef.current;s.pinch=0;s.drag=false;setTimeout(()=>{if(!s.drag&&!pulseRef.current)s.auto=true;},2500);};
    const ro=new ResizeObserver(size);ro.observe(wrapRef.current);
    canvas.addEventListener('mousedown',down);canvas.addEventListener('mousemove',hover);canvas.addEventListener('mouseleave',()=>setTip(null));
    if(!mini)canvas.addEventListener('wheel',wheel,{passive:false});
    canvas.addEventListener('touchstart',tstart,{passive:true});canvas.addEventListener('touchmove',tmove,{passive:true});canvas.addEventListener('touchend',tend);
    return()=>{cancelAnimationFrame(raf);ro.disconnect();
      canvas.removeEventListener('mousedown',down);canvas.removeEventListener('mousemove',hover);
      window.removeEventListener('mousemove',winMove);window.removeEventListener('mouseup',winUp);
      canvas.removeEventListener('wheel',wheel);
      canvas.removeEventListener('touchstart',tstart);canvas.removeEventListener('touchmove',tmove);canvas.removeEventListener('touchend',tend);};
  },[height,dark,mini]);

  const total=Object.values(data).reduce((a,b)=>a+b,0);
  const nC=Object.keys(data).length;
  return(
    <div ref={wrapRef} style={bare?{position:'relative',width:'100%'}:{position:'relative',width:'100%',borderRadius:14,overflow:'hidden',
         background:dark?'radial-gradient(120% 120% at 30% 18%,#0d2745 0%,#06122a 75%)':'radial-gradient(120% 120% at 30% 18%,#163a63 0%,#0a1f3a 72%)',
         border:'1px solid rgba(160,195,230,0.14)'}}>
      <canvas ref={canvasRef} style={{display:'block',cursor:'grab',touchAction:'none'}}/>
      {tip&&(<div style={{position:'absolute',left:tip.x,top:tip.y-14,transform:'translate(-50%,-100%)',
             background:'rgba(8,24,45,0.95)',color:'#ffe9e6',padding:'6px 10px',borderRadius:8,fontSize:12,fontWeight:600,
             whiteSpace:'nowrap',pointerEvents:'none',border:'1px solid rgba(220,90,80,0.5)',boxShadow:'0 4px 14px rgba(0,0,0,0.4)'}}>
          {tip.name} · {tip.count} {countLabel}{tip.count!==1?'s':''}</div>)}
      {!mini&&!bare&&<div style={{position:'absolute',left:12,bottom:10,color:'#9fbdd9',fontSize:11,letterSpacing:0.3,pointerEvents:'none'}}>
        {nC} countr{nC!==1?'ies':'y'} · {total} {countLabel}{total!==1?'s':''} · scroll to zoom · drag to spin</div>}
    </div>
  );
}

function FootprintLegend({label="Competitions / country",showHost=false,rank=false,maxCount=0}={}){
  if(rank){
    return(<div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",fontSize:11.5,color:"#9fbdd9",padding:"10px 4px 2px"}}>
      <span style={{fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",fontSize:10.5}}>{label}</span>
      <span style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:10.5}}>Fewer</span>
        <span style={{width:120,height:11,borderRadius:6,background:"linear-gradient(90deg,#f0a79e,#7a0d04)",boxShadow:"0 0 0 1px rgba(255,255,255,.15)"}}/>
        <span style={{fontSize:10.5}}>More{maxCount>0?` (max ${maxCount})`:""}</span>
      </span>
      {showHost&&<span style={{display:"flex",alignItems:"center",gap:6}}>
        <span style={{width:13,height:13,borderRadius:"50%",background:"#f2c037",boxShadow:"0 0 0 1px rgba(255,255,255,.15)"}}/>Host country</span>}
    </div>);
  }
  const items=[["1",TIER_COLORS[0]],["2–3",TIER_COLORS[1]],["4+",TIER_COLORS[2]]];
  if(showHost)items.push(["Host country","#f2c037"]);
  return(<div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",fontSize:11.5,color:"#9fbdd9",padding:"10px 4px 2px"}}>
    <span style={{fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",fontSize:10.5}}>{label}</span>
    {items.map(([lab,col])=>(<span key={lab} style={{display:"flex",alignItems:"center",gap:6}}>
      <span style={{width:13,height:13,borderRadius:"50%",background:col,boxShadow:"0 0 0 1px rgba(255,255,255,.15)"}}/>{lab}</span>))}
  </div>);
}

/* ── FootprintModal: dark popup · big globe · sticky country spotlight ──────── */
function FootprintModal({name,ag,countryCounts,onClose}){
  const [sel,setSel]=React.useState(null); // selected ISO (sticky)
  const groups=React.useMemo(()=>{
    const m={};
    ag.history.forEach(h=>{
      const ioc=h.ev.country||"";const iso=IOC_ISO[ioc]||"";
      const cname=GLOBE_NAMES[iso]||ioc||"Unknown";const key=iso||ioc||"ZZ";
      if(!m[key])m[key]={iso,cname,items:[]};
      m[key].items.push(h);
    });
    return Object.values(m).sort((a,b)=>a.cname.localeCompare(b.cname));
  },[ag]);

  return(
    <div className="ov" onClick={onClose}>
      <div className="modal wide" onClick={e=>e.stopPropagation()}
        style={{maxWidth:1000,background:"linear-gradient(160deg,#0d2340,#091a31)",border:"1px solid rgba(120,160,210,.22)"}}>
        <div className="mhead" style={{background:"rgba(8,22,42,.6)"}}>
          <Flag size={18}/><h3>{name} — Competition footprint</h3>
          {sel&&<button className="btn ghost" style={{background:"rgba(255,255,255,.1)",color:"#dcecf8",border:"1px solid rgba(255,255,255,.18)",fontSize:12,padding:"5px 11px",marginRight:8}} onClick={()=>setSel(null)}>Deselect</button>}
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{display:"flex",flexWrap:"wrap"}} onClick={()=>setSel(null)}>
          <div style={{flex:"1 1 440px",minWidth:300,padding:18}} onClick={e=>e.stopPropagation()}>
            <SailingGlobe countryData={countryCounts} height={460} pulseIso={sel} dark/>
            <FootprintLegend/>
          </div>
          <div style={{flex:"1 1 360px",minWidth:280,maxHeight:520,overflowY:"auto",borderLeft:"1px solid rgba(120,160,210,.18)",padding:"8px 0"}}
               onClick={e=>{if(e.target===e.currentTarget)setSel(null);}}>
            {groups.map(g=>(
              <div key={g.cname}>
                <div style={{position:"sticky",top:0,background:"rgba(13,40,70,.96)",backdropFilter:"blur(4px)",color:"#dcecf8",fontWeight:700,
                     fontFamily:"'Barlow',sans-serif",fontSize:13,letterSpacing:".04em",padding:"7px 18px",
                     display:"flex",alignItems:"center",gap:8,zIndex:1,borderBottom:"1px solid rgba(120,160,210,.14)"}}>
                  <span style={{fontSize:16}}>{g.iso?[...g.iso].map(ch=>String.fromCodePoint(0x1F1E6+ch.charCodeAt(0)-65)).join(""):""}</span>{g.cname}
                  <span style={{marginLeft:"auto",color:"#7fa8d4",fontWeight:600}}>{g.items.length}</span>
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
                      <span style={{color:h.row.rank<=3?"#ffd86b":"#cfe0f2",fontWeight:700}}>
                        #{h.row.rank}<span style={{color:"#9fbdd9",fontWeight:500}}> of {h.fleet} boats</span></span>
                      <span>{formatDate(h.ev.date)}</span>
                      {h.ev.class?<span style={{background:"rgba(120,160,210,.2)",color:"#cfe0f2",borderRadius:5,padding:"1px 7px",fontWeight:600,fontSize:11.5}}>{h.ev.class}</span>:null}
                    </div>
                  </div>);
                })}
              </div>
            ))}
            {groups.length===0&&<div style={{padding:24,color:"#9fbdd9",fontSize:13}}>No competitions recorded yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}


/* ── RegattaFootprintModal: who's racing — countries → # of sailors ───────── */
function RegattaFootprintModal({event,onClose,homeCountry={},onPickAthlete}){
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
        style={{maxWidth:1000,background:"linear-gradient(160deg,#0d2340,#091a31)",border:"1px solid rgba(120,160,210,.22)"}}>
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

/* ── IOC country list for dropdown ───────────────────────────────────── */
const COUNTRIES=[
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

function CountrySelect({value,onChange,placeholder="Select country..."}){
  const[open,setOpen]=React.useState(false);
  const[q,setQ]=React.useState("");
  const sel=COUNTRIES.find(c=>c.code===value);
  const filtered=q?COUNTRIES.filter(c=>c.code.includes(q.toUpperCase())||c.name.toLowerCase().includes(q.toLowerCase())):COUNTRIES;
  const ref=React.useRef();
  React.useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);
  },[]);
  return(
    <div style={{position:"relative"}} ref={ref}>
      <div onClick={()=>setOpen(o=>!o)} style={{border:"1px solid var(--line)",borderRadius:7,padding:"7px 10px",fontSize:13,background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:8,userSelect:"none"}}>
        {sel?<>{iocFlag(sel.code)} <b>{sel.code}</b> {sel.name}</>:<span style={{color:"var(--mut)"}}>{placeholder}</span>}
        <ChevronRight size={12} style={{marginLeft:"auto",transform:open?"rotate(-90deg)":"rotate(90deg)",transition:".15s"}}/>
      </div>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 4px)",left:0,right:0,zIndex:90,background:"#fff",border:"1px solid var(--line)",borderRadius:10,boxShadow:"0 12px 30px -10px rgba(0,0,0,.2)",maxHeight:220,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          <div style={{padding:"8px 10px",borderBottom:"1px solid var(--line)"}}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search country..." style={{width:"100%",border:0,outline:0,font:"inherit",fontSize:13,color:"var(--ink)"}}/>
          </div>
          <div style={{overflowY:"auto",flex:1}}>
            {filtered.slice(0,80).map(co=>(
              <div key={co.code} onClick={()=>{onChange(co.code);setOpen(false);setQ("");}}
                style={{padding:"8px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontSize:13,background:co.code===value?"var(--sky)":"#fff",transition:".1s"}}
                onMouseEnter={e=>e.currentTarget.style.background="var(--sky)"}
                onMouseLeave={e=>e.currentTarget.style.background=co.code===value?"var(--sky)":"#fff"}>
                <span>{iocFlag(co.code)}</span>
                <b style={{color:"var(--navy)",minWidth:36}}>{co.code}</b>
                <span style={{color:"var(--mut)"}}>{co.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


/* ═════════════════════════════════════════════════════════════════════ */
/* -- Sign-in / sign-up modal -- */
function SignInModal({onClose,onAuthed}){
  const [mode,setMode]=React.useState("signin");
  const [email,setEmail]=React.useState("");
  const [pw,setPw]=React.useState("");
  const [role,setRole]=React.useState("athlete");
  const [classId,setClassId]=React.useState("29er");
  const [name,setName]=React.useState("");
  const [busy,setBusy]=React.useState(false);
  const [err,setErr]=React.useState("");
  const [info,setInfo]=React.useState("");
  const submit=async()=>{
    setErr("");setInfo("");setBusy(true);
    try{
      if(!AUTH_BASE) throw new Error("Auth not configured (missing Supabase env vars).");
      if(mode==="signup"){
        const d=await authSignUp(email.trim(),pw);
        const tok=d.access_token||d.session?.access_token;
        const user=d.user||d;
        if(!tok){ setInfo("Account created. Check your email to confirm, then sign in."); setMode("signin"); setBusy(false); return; }
        await upsertProfile({user_id:user.id,role,display_name:name||email.split("@")[0],
          class_id:role==="association"?classId:null,athlete_name:role==="athlete"?(name||null):null},tok);
        onAuthed({token:tok,user,profile:{role,display_name:name,class_id:role==="association"?classId:null,athlete_name:role==="athlete"?name:null}});
      } else {
        const d=await authSignIn(email.trim(),pw);
        const tok=d.access_token;const user=d.user;
        const prof=await fetchProfile(user.id,tok)||{role:"guest"};
        onAuthed({token:tok,user,profile:prof});
      }
    }catch(e){ setErr(e.message||"Something went wrong."); }
    finally{ setBusy(false); }
  };
  const F={width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"9px 11px",font:"inherit",fontSize:13.5,background:"#fff",outline:"none",marginBottom:10};
  return(
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
        <div className="mhead"><Link2 size={17}/><h3>{mode==="signin"?"Sign in":"Create account"}</h3>
          <button className="x" onClick={onClose}><X size={16}/></button></div>
        <div style={{padding:"18px 20px"}}>
          {mode==="signup"&&(
            <>
              <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:6}}>I am a...</label>
              <div style={{display:"flex",gap:8,marginBottom:12}}>
                {[["athlete","Athlete"],["association","Association"]].map(([id,lab])=>(
                  <button key={id} onClick={()=>setRole(id)}
                    style={{flex:1,border:"1px solid "+(role===id?"var(--accent)":"var(--line)"),background:role===id?"var(--sky)":"#fff",
                      color:role===id?"var(--navy)":"var(--mut)",borderRadius:8,padding:"8px",fontWeight:600,fontSize:13,cursor:"pointer"}}>{lab}</button>
                ))}
              </div>
              {role==="association"&&(
                <div style={{marginBottom:10}}>
                  <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:6}}>Class you manage</label>
                  <ClassPicker value={classId} onChange={setClassId}/>
                </div>
              )}
              <input style={F} placeholder={role==="association"?"Association / your name":"Your full name (as in results)"} value={name} onChange={e=>setName(e.target.value)}/>
            </>
          )}
          <input style={F} type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}/>
          <input style={F} type="password" placeholder="Password" value={pw} onChange={e=>setPw(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter")submit();}}/>
          {err&&<div style={{color:"#c0392b",fontSize:12.5,marginBottom:10}}>{err}</div>}
          {info&&<div style={{color:"var(--accent)",fontSize:12.5,marginBottom:10}}>{info}</div>}
          <button className="btn cta" style={{width:"100%",justifyContent:"center"}} disabled={busy||!email||!pw} onClick={submit}>
            {busy?<Loader2 size={15} className="spin"/>:null}{mode==="signin"?"Sign in":"Create account"}</button>
          <p style={{fontSize:12.5,color:"var(--mut)",textAlign:"center",marginTop:12}}>
            {mode==="signin"?<>No account? <button onClick={()=>{setMode("signup");setErr("");}} style={{border:0,background:"none",color:"var(--accent)",fontWeight:600,cursor:"pointer"}}>Create one</button></>
              :<>Have an account? <button onClick={()=>{setMode("signin");setErr("");}} style={{border:0,background:"none",color:"var(--accent)",fontWeight:600,cursor:"pointer"}}>Sign in</button></>}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AthLinkMVP(){
  const[events,setEvents]=useState([]);
  const[auth,setAuth]=useState(null);
  const[showSignIn,setShowSignIn]=useState(false);
  const[accountOpen,setAccountOpen]=useState(false);
  // ── DEVELOPER VIEW ──────────────────────────────────────────────────────
  // Lets Casey edit the platform pre-launch without signing in. Forces full
  // (association) access. Enable with ?dev=1 in the URL or Ctrl/Cmd+Shift+D;
  // persists in localStorage. REMOVE / set DEV_VIEW_ENABLED=false at publish.
  const DEV_VIEW_ENABLED=true;
  const[devMode,setDevMode]=useState(()=>{
    try{
      if(!DEV_VIEW_ENABLED) return false;
      if(typeof window!=="undefined"&&new URLSearchParams(window.location.search).get("dev")==="1"){localStorage.setItem("athlink_dev","1");return true;}
      return localStorage.getItem("athlink_dev")==="1";
    }catch{return false;}
  });
  useEffect(()=>{
    if(!DEV_VIEW_ENABLED) return;
    const onKey=(e)=>{ if((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key==="D"||e.key==="d")){
      e.preventDefault();
      setDevMode(d=>{const nv=!d;try{localStorage.setItem("athlink_dev",nv?"1":"0");}catch{};return nv;});
    }};
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[]);
  const effectiveRole=devMode?"association":(auth?.profile?.role||"guest");
  const role=effectiveRole;
  const canEditRole=effectiveRole==="association";
  const canEditProfileOf=(nm)=>devMode||(effectiveRole==="athlete"&&auth?.profile?.athlete_name&&auth.profile.athlete_name.toLowerCase()===String(nm||"").toLowerCase());
  useEffect(()=>{
    if(!AUTH_BASE) return;
    try{
      const raw=localStorage.getItem("athlink_auth");
      if(!raw) return;
      const saved=JSON.parse(raw);
      (async()=>{
        const u=await authUser(saved.token);
        if(u){ const prof=await fetchProfile(u.id,saved.token)||saved.profile||{role:"guest"}; setAuth({token:saved.token,user:u,profile:prof}); }
        else localStorage.removeItem("athlink_auth");
      })();
    }catch{}
  },[]);
  const onAuthed=(a2)=>{ setAuth(a2); setShowSignIn(false);
    try{localStorage.setItem("athlink_auth",JSON.stringify({token:a2.token,profile:a2.profile}));}catch{} };
  const signOut=()=>{ setAuth(null); setAccountOpen(false); try{localStorage.removeItem("athlink_auth");}catch{} };
  const[portal,setPortal]=useState(null);
  const[view,setView]=useState({name:"portals"});
  const[navStack,setNavStack]=useState([]); // universal back-button history
  const[q,setQ]=useState("");const[filter,setFilter]=useState("all");

  // ── Merge duplicate athlete profiles ───────────────────────
  // Renames every entry of `duplicate` → `primary` (persisted), then removes any
  // entry that became an exact duplicate within the same event (same person +
  // same sail + same results), so no profile shows the same competition twice.
  const mergeAthletes=async(primary,duplicate)=>{
    if(primary===duplicate) return;
    // Persist name change for each affected entry
    events.forEach(ev=>ev.entries.forEach(e=>{
      if(!e._dbId) return;
      const patch={};
      if(e.helm===duplicate) patch.helm_name=primary;
      if(e.crew===duplicate) patch.crew_name=primary;
      if(Object.keys(patch).length) sbPatch("entries",`id=eq.${e._dbId}`,patch);
    }));
    setEvents(prev=>prev.map(ev=>{
      // 1. rename
      let entries=ev.entries.map(e=>({
        ...e,
        helm:e.helm===duplicate?primary:e.helm,
        crew:e.crew===duplicate?primary:e.crew,
      }));
      // 2. drop within-event duplicate entries (same sig); delete the dupes in DB
      const seen=new Set();
      entries=entries.filter(e=>{
        const sig=`${e.helm}|${e.crew}|${e.sail}|${(e.races||[]).join(",")}`;
        if(seen.has(sig)){ if(e._dbId) sbDel("entries",`id=eq.${e._dbId}`); return false; }
        seen.add(sig); return true;
      });
      return{...ev,entries};
    }));
  };
  // Merge an entire group's names into the primary (first = most competitions)
  const mergeGroup=async(names)=>{
    const[primary,...dupes]=names;
    for(const d of dupes) await mergeAthletes(primary,d);
  };
  const[athleteSmart,setAthleteSmart]=useState(null); // {label, fn} parsed NL athlete filter
  const[athleteSmartLoading,setAthleteSmartLoading]=useState(false);
  const[homeQ,setHomeQ]=useState(""); // search on home portals page
  const[note,setNote]=useState(null);
  const[open,setOpen]=useState(false);
  const[tab,setTab]=useState("pdf");
  const[mf,setMf]=useState(emptyForm());
  const manualCalc=useMemo(()=>{
    const maxPer=Array.from({length:mf.numRaces},(_,j)=>{
      let mx=0;mf.rows.forEach(r=>{const s=(r.scores[j]||"").trim();if(/^\d+$/.test(s))mx=Math.max(mx,parseInt(s));});return mx;
    });
    return mf.rows.map(row=>{
      const pts=Array.from({length:mf.numRaces},(_,j)=>{
        const s=(row.scores[j]||"").trim();if(!s)return null;
        if(/^\d+$/.test(s))return parseInt(s);return maxPer[j]>0?maxPer[j]:null;
      }).filter(v=>v!==null);
      if(!pts.length)return{total:null,net:null};
      const total=pts.reduce((a,b)=>a+b,0);
      const disc=Math.min(mf.discards,Math.max(0,pts.length-1));
      const sorted=[...pts].sort((a,b)=>b-a);
      const dropped=sorted.slice(0,disc).reduce((a,b)=>a+b,0);
      return{total,net:total-dropped};
    });
  },[mf]);
  const[pdfLoading,setPdfLoading]=useState(false);
  const[pdfError,setPdfError]=useState("");
  const[importStep,setImportStep]=useState("upload");
  const[fleetChoices,setFleetChoices]=useState([]);
  const[pdfMeta,setPdfMeta]=useState(null);
  const[previewEv,setPreviewEv]=useState(null);
  const[previewEdit,setPreviewEdit]=useState(null);
  // Multi-file import: each pending result = {id,name,status:'ok'|'error'|'parsing',
  //   error, previewEv, subclass, collabs}. activePending = index being edited.
  const[pending,setPending]=useState([]);
  const[activePending,setActivePending]=useState(0);
  const[previewEditVal,setPreviewEditVal]=useState("");
  const[editCell,setEditCell]=useState(null);
  const[editVal,setEditVal]=useState("");
  const[editEvMeta,setEditEvMeta]=useState(null);
  const[deleteConfirm,setDeleteConfirm]=useState(null); // {id, name, pos}
  const[evFilter,setEvFilter]=useState("");     // AI filter query for events list
  const[evFilterActive,setEvFilterActive]=useState(null); // parsed filter fn + label
  const[evFilterLoading,setEvFilterLoading]=useState(false);
  const[profileFilter,setProfileFilter]=useState("");  // AI filter input for profile history
  const[profileFilterChips,setProfileFilterChips]=useState([]); // cumulative AND-ed filters
  const[profileFilterLoading,setProfileFilterLoading]=useState(false);
  const[footprintOpen,setFootprintOpen]=useState(false);
  const[regattaFootprint,setRegattaFootprint]=useState(null);
  const[evSuggestions,setEvSuggestions]=useState([]);
  const[evSugLoading,setEvSugLoading]=useState(false);
  const[evSugTimer,setEvSugTimer]=useState(null);
  const[profileSuggestions,setProfileSuggestions]=useState([]);
  const[profileSugLoading,setProfileSugLoading]=useState(false);
  const[profileSugTimer,setProfileSugTimer]=useState(null);
  // Global search
  const[gSearch,setGSearch]=useState("");
  // Calendar
  const[showCalendar,setShowCalendar]=useState(false);
  const[calClsSet,setCalClsSet]=useState(new Set()); // empty = All
  const[calQ,setCalQ]=useState("");
  const[calYear,setCalYear]=useState(new Date().getFullYear());
  const[calMonth,setCalMonth]=useState(new Date().getMonth()); // 0-indexed
  const[calViewMode,setCalViewMode]=useState("year");
  const[showSailorCal,setShowSailorCal]=useState(false);
  const[sailorCalName,setSailorCalName]=useState("");
  const[sailorCalClsSet,setSailorCalClsSet]=useState(new Set());
  const[sailorCalYear,setSailorCalYear]=useState(new Date().getFullYear());
  const[sailorCalMonth,setSailorCalMonth]=useState(new Date().getMonth());
  const[sailorCalViewMode,setSailorCalViewMode]=useState("year");
  const[gSearchOpen,setGSearchOpen]=useState(false);
  const[gSearchResults,setGSearchResults]=useState([]);

  useEffect(()=>{
    (async()=>{
      if(!sbH){
        console.warn("No Supabase credentials — no events to show");
        setEvents([]);
        return;
      }
      console.log("Loading from Supabase:", SB_URL);
      const data=await sbGet("events?select=*,entries(*)&order=created_at.desc");
      if(data===null){
        console.error("Supabase load failed — check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
        setEvents([]);
        return;
      }
      console.log("Loaded",data.length,"events from Supabase");
      setEvents(data.map(dbToApp));
    })();
  },[]);

  /* ── derived ──────────────────────────────────────────────── */
  const isClassPortal=typeof portal==="string"&&portal.startsWith("class:");
  const portalCls=isClassPortal?portal.slice(6):null; // base class id for a class portal
  // Dev mode can edit everything. Otherwise associations edit their own portals
  // (not the read-only global class portals).
  const canEdit=devMode||(canEditRole&&!isClassPortal);
  const assoc=ASSOCIATIONS.find(a=>a.id===portal);
  // Collapse duplicate imports of the same competition (same name+date+class+
  // subclass), keeping the row with the most entries. Non-destructive (display).
  const dedupEvents=list=>{
    const byKey=new Map();
    for(const ev of list){
      const k=eventKey(ev);
      const cur=byKey.get(k);
      if(!cur||(ev.entries?.length||0)>(cur.entries?.length||0)) byKey.set(k,ev);
    }
    return[...byKey.values()];
  };
  const classEvents=useMemo(()=>{
    if(!portal) return [];
    const scoped=isClassPortal
      ? events.filter(e=>e.cls===portalCls)            // global class portal
      : events.filter(e=>eventAssocs(e).includes(portal)); // association portal
    return dedupEvents(scoped);
  },[events,portal,isClassPortal,portalCls]);
  const homeCountry=useMemo(()=>buildHomeCountry(events),[events]);
  // Pick the best display variant for a canonical group: the raw name that
  // appears in the most events (ties → the more "normal" mixed-case spelling).
  const displayNameFor=useMemo(()=>{
    const counts={};                  // canonKey -> {rawName: eventCount}
    events.forEach(ev=>{
      const seen=new Set();
      ev.entries.forEach(e=>[e.helm,e.crew].forEach(nm=>{
        if(!nm) return; const k=canonName(nm); if(!k) return;
        const id=k+"|"+nm; if(seen.has(id)) return; seen.add(id);
        (counts[k]=counts[k]||{})[nm]=(counts[k]?.[nm]||0)+1;
      }));
    });
    const best={};
    Object.entries(counts).forEach(([k,variants])=>{
      best[k]=Object.entries(variants).sort((a,b)=>{
        if(b[1]!==a[1]) return b[1]-a[1];               // most events first
        const am=/[a-z]/.test(a[0])&&/[A-Z]/.test(a[0]); // prefer mixed-case
        const bm=/[a-z]/.test(b[0])&&/[A-Z]/.test(b[0]);
        if(am!==bm) return am?-1:1;
        return a[0].localeCompare(b[0]);
      })[0][0];
    });
    return k=>best[k]||null;
  },[events]);
  const dispName=nm=>displayNameFor(canonName(nm))||nm;

  // Build the (deduped) athlete list for a set of events — one entry per
  // canonical identity, shown under its best display name. Non-destructive.
  const buildPeople=evs=>{
    const map=new Map();              // canonKey -> {name, cls}
    evs.forEach(ev=>ev.entries.forEach(e=>{
      [e.helm,e.crew].forEach(nm=>{
        if(!nm) return; const k=canonName(nm); if(!k||map.has(k)) return;
        map.set(k,{name:displayNameFor(k)||nm,cls:ev.cls});
      });
    }));
    return[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  };
  const people=useMemo(()=>buildPeople(classEvents),[classEvents,displayNameFor]);
  const allPeople=useMemo(()=>buildPeople(events),[events,displayNameFor]);

  // ── Duplicate detection (review pile) ───────────────────────
  // Exact canonical matches (word order / case / accents / hyphens / punctuation)
  // are ALREADY collapsed in every view via displayNameFor — non-destructive, no
  // DB writes. The Duplicates tab only surfaces NEAR matches (spelling differs by
  // 1–2 chars) which a human must confirm. 3+ char differences are not shown.
  const lev=(a,b)=>{
    const m=a.length,n=b.length;
    if(!m) return n; if(!n) return m;
    let prevRow=Array.from({length:n+1},(_,j)=>j);
    for(let i=1;i<=m;i++){
      const cur=[i];
      for(let j=1;j<=n;j++) cur[j]=Math.min(prevRow[j]+1,cur[j-1]+1,prevRow[j-1]+(a[i-1]===b[j-1]?0:1));
      prevRow=cur;
    }
    return prevRow[n];
  };
  const regCount=nm=>{const t=canonName(nm);return events.filter(ev=>ev.entries.some(e=>canonName(e.helm)===t||canonName(e.crew)===t)).length;};
  const athleteHostAssocs=nm=>{
    const t=canonName(nm),s=new Set();
    events.forEach(ev=>{ if(ev.entries.some(e=>canonName(e.helm)===t||canonName(e.crew)===t)) eventAssocs(ev).forEach(a=>s.add(a)); });
    return s;
  };

  const dupGroups=useMemo(()=>{
    // distinct canonical keys (already display-deduped) → find near neighbours
    const keys=[...new Set(allPeople.map(p=>canonName(p.name)).filter(Boolean))];
    const groups=[];
    for(let i=0;i<keys.length;i++){
      const a=keys[i];
      for(let j=i+1;j<keys.length;j++){
        const b=keys[j];
        if(Math.abs(a.length-b.length)>2) continue;
        if(Math.min(a.length,b.length)<4) continue;
        const dist=lev(a,b);
        if(dist>0&&dist<=2){
          const na=displayNameFor(a),nb=displayNameFor(b);
          if(na&&nb) groups.push({names:[na,nb].sort((x,y)=>regCount(y)-regCount(x)),kind:"near",key:[a,b].sort().join("~")});
        }
      }
    }
    return groups;
  },[allPeople,displayNameFor,events]);

  const myAssoc=auth?.profile?.class_id||null;
  const[dismissedDups2,setDismissedDups2]=useState(new Set()); // keys the user resolved this session
  const visibleDupGroups=useMemo(()=>{
    let g=dupGroups.filter(x=>!dismissedDups2.has(x.key));
    if(myAssoc) g=g.filter(x=>x.names.some(nm=>athleteHostAssocs(nm).has(myAssoc)));
    return g;
  },[dupGroups,dismissedDups2,myAssoc,events]);

  const previewScored=useMemo(()=>previewEv?scorePreview(previewEv):null,[previewEv]);
  const previewMaxRaces=useMemo(()=>{
    if(!previewEv?.entries?.length) return 0;
    return Math.max(...previewEv.entries.map(e=>(e.races||[]).length),1);
  },[previewEv]);

  const cls=assoc?CLASSES.find(c=>c.id===assoc.cls):(isClassPortal?CLASSES.find(c=>c.id===portalCls):null);
  const portalName=assoc?assoc.name:(isClassPortal?`${CLASSES.find(c=>c.id===portalCls)?.short||portalCls} — All Results`:"");
  const isGlobal=!portal;
  const currentPeople=isGlobal?allPeople:people;
  const athleteTitle=isGlobal?"All Athletes":`${portalName} Athletes`;
  const evLoc=ev=>[ev.country].filter(Boolean).join(" · ");
  const manualReady=!!mf.rows.filter(r=>r.helm.trim()).length;

  /* ── navigation ───────────────────────────────────────────── */
  // ── Navigation with universal history ───────────────────────
  const pushNav=()=>setNavStack(s=>[...s.slice(-19),{portal,view}]);
  const go=v=>{pushNav();setView(v);setQ("");setAthleteSmart(null);window.scrollTo(0,0);};
  const goHome=()=>{pushNav();setPortal(null);setView({name:"portals"});setQ("");setAthleteSmart(null);window.scrollTo(0,0);};
  const enterPortal=id=>{pushNav();setPortal(id);setView({name:"events"});setQ("");setAthleteSmart(null);window.scrollTo(0,0);};
  const navBack=()=>{
    setNavStack(s=>{
      if(!s.length) return s;
      const prev=s[s.length-1];
      setPortal(prev.portal??null);
      setView(prev.view||{name:"portals"});
      setQ("");setAthleteSmart(null);window.scrollTo(0,0);
      return s.slice(0,-1);
    });
  };
  const navLabelFor=(snap)=>{
    if(!snap) return "Back";
    const v=snap.view||{};
    const pName=id=>{const a=ASSOCIATIONS.find(x=>x.id===id);if(a)return a.name;if(typeof id==="string"&&id.startsWith("class:"))return`${CLASSES.find(c=>c.id===id.slice(6))?.short||""} — All Results`;return null;};
    if(v.name==="portals") return "Sailing";
    if(v.name==="athletes") return snap.portal?`${pName(snap.portal)||""} Athletes`:"All Athletes";
    if(v.name==="events") return pName(snap.portal)||"Competitions";
    if(v.name==="event"){const ev=events.find(e=>e.id===v.id);return ev?ev.name:"Competition";}
    if(v.name==="profile") return v.id||"Profile";
    return "Back";
  };

  /* ── event ops ────────────────────────────────────────────── */
  const deleteEvent=(evId,evName,e)=>{
    e.stopPropagation();
    const rect=e.currentTarget.getBoundingClientRect();
    setDeleteConfirm({id:evId,name:evName,x:rect.right,y:rect.bottom});
  };
  const confirmDelete=async()=>{
    if(!deleteConfirm) return;
    const target=events.find(ev=>ev.id===deleteConfirm.id);
    // Delete this event AND every duplicate row of the same competition, so no
    // ghost copy survives on the global class page or another association.
    const victims=target?events.filter(ev=>eventKey(ev)===eventKey(target)):events.filter(ev=>ev.id===deleteConfirm.id);
    for(const v of victims) await sbDel("events",`id=eq.${v.id}`);
    const ids=new Set(victims.map(v=>v.id));
    setEvents(p=>p.filter(ev=>!ids.has(ev.id)));
    setDeleteConfirm(null);
  };
  const confirmDraft=async(evId)=>{
    await updateEventStatus(evId,"Final");
    setEvents(p=>p.map(ev=>ev.id===evId?{...ev,status:"Final"}:ev));
    setNote({name:"Results confirmed",matched:0,created:0,msg:"Event is now official."});
    setTimeout(()=>setNote(null),4000);
  };

  /* ── AI smart filter ─────────────────────────────────────── */
  const buildFilterPrompt=(query,context)=>
    `You are a sailing results filter engine. The user has described a filter in natural language.
Return ONLY a JSON object (no markdown, no explanation) with two fields:
  "label": short human-readable description of the filter (max 8 words)
  "code": a JavaScript arrow function body string that takes an event object "ev" and returns true/false.
    The event object has: ev.name (string), ev.date (dd/mm/yyyy string), ev.entries (array of {helm,crew,sail,nat,div}),
    and scoreEvent(ev).fleet (number of boats), scoreEvent(ev).races (number of races).
    You can use these fields in the code. The code must be valid JS for use in new Function("ev","scoreEvent","return "+code).
Context: ${context}
Query: "${query}"`;

  const runEvFilter=async()=>{
    if(!evFilter.trim()){setEvFilterActive(null);return;}
    setEvFilterLoading(true);
    try{
      const res=await fetch("/api/ai_filter",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt:buildFilterPrompt(evFilter,`Class: ${assoc?.name||"unknown"}, Events: ${classEvents.length}`),max_tokens:300})
      });
      const data=await res.json();
      if(!data.ok) throw new Error(data.error||"API error");
      const text=data.text;
      const clean=text.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      const fn=new Function("ev","scoreEvent","return "+parsed.code);
      setEvFilterActive({label:parsed.label,fn});
    }catch(err){
      // Fallback: simple client-side text search
      const ql=evFilter.toLowerCase();
      const fn=(ev)=>ev.name.toLowerCase().includes(ql)||
        ev.entries.some(e=>e.helm.toLowerCase().includes(ql)||e.crew.toLowerCase().includes(ql))||
        (ev.country||"").toLowerCase().includes(ql);
      setEvFilterActive({label:`"${evFilter}"`,fn});
    }finally{setEvFilterLoading(false);}
  };

  const runProfileFilter=async()=>{
    const q=profileFilter.trim();
    if(!q){return;}
    setProfileFilterLoading(true);
    try{
      const res=await fetch("/api/ai_filter",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          prompt:`You convert a natural-language sailing-results filter into one or more conditions.
A query may contain SEVERAL conditions (e.g. "finished top 15 in the world championships" = a placing condition AND an event-type condition). Split them.
Return ONLY a JSON array (no markdown). Each element: {"label": short human label (max 6 words), "code": a JS arrow-function BODY string operating on item "h"}.
"h" has: h.ev (event with .name string, .date "dd/mm/yyyy", .country), h.row.rank (number), h.row.net, h.fleet (number), h.role ('Helm'|'Crew'), h.partner.
Code must be valid for new Function("h","scoreEvent","return "+code). Match event types by checking h.ev.name (case-insensitive). Example: "top 15 in worlds" => [{"label":"Top 15","code":"h.row.rank<=15"},{"label":"World Championship","code":"/world/i.test(h.ev.name)"}].
Query: "${q}"`,
          max_tokens:400
        })
      });
      const data=await res.json();
      if(!data.ok) throw new Error(data.error||"API error");
      const clean=data.text.replace(/```json|```/g,"").trim();
      let parsed=JSON.parse(clean);
      if(!Array.isArray(parsed)) parsed=[parsed];
      const chips=parsed.filter(x=>x&&x.code).map(x=>({label:x.label||"Filter",fn:new Function("h","scoreEvent","return "+x.code)}));
      if(chips.length) setProfileFilterChips(prev=>[...prev,...chips]);
      setProfileFilter("");
    }catch(err){
      setProfileFilterChips(prev=>[...prev,{label:"Filter error",fn:()=>true}]);
    }finally{setProfileFilterLoading(false);}
  };

  // Smart athlete search: NL query -> predicate over an athlete summary object.
  const runAthleteSmart=async(query,peopleList,evList)=>{
    const qq=(query||"").trim();
    if(!qq){setAthleteSmart(null);return;}
    // Plain country/name terms don't need AI — let the substring filter handle them.
    setAthleteSmartLoading(true);
    try{
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          prompt:`You convert a natural-language athlete search into a JS predicate.
Return ONLY a JSON object (no markdown): {"label": short label (max 7 words), "code": arrow-function BODY operating on athlete "a"}.
"a" has: a.name (string), a.iso (ISO-2 country like "GB","HK"), a.country (full country name), a.events (number of regattas), a.best (best finish rank number or null), a.podiums, a.wins, and a.results = array of {name (event name), rank, fleet, year}.
Code must be valid for new Function("a","return "+code) and return true/false.
Examples:
"Hong Kong" => {"label":"Hong Kong athletes","code":"a.country==='Hong Kong'||a.iso==='HK'"}
"top 15 in the world championships" => {"label":"Top 15 at a Worlds","code":"a.results.some(r=>/world/i.test(r.name)&&r.rank<=15)"}
"won a national championship" => {"label":"National title","code":"a.results.some(r=>/national/i.test(r.name)&&r.rank===1)"}
Query: "${qq}"`,
          max_tokens:300})});
      const data=await res.json();
      if(!data.ok) throw new Error(data.error||"API error");
      const clean=data.text.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      const fn=new Function("a","return "+parsed.code);
      setAthleteSmart({label:parsed.label||qq,fn});
    }catch(err){
      setAthleteSmart(null);
    }finally{setAthleteSmartLoading(false);}
  };

  // Build the athlete summary object the predicate runs against.
  const athleteSummaryFor=(name,evList)=>{
    const ag=aggregate(name,evList);
    const iso=IOC_ISO[athleteNat(name,evList)]||"";
    return {
      name, iso, country: GLOBE_NAMES[iso]||"",
      events: ag.events, best: ag.best||null, podiums: ag.podiums, wins: ag.wins,
      results: ag.history.map(h=>({name:h.ev.name,rank:h.row.rank,fleet:h.fleet,year:parseInt(h.ev.date?.split('/')?.[2])||null}))
    };
  };

  /* ── AI suggestions (debounced) ─────────────────────────── */
  const fetchEvSuggestions=async(q)=>{
    if(!q.trim()||q.length<3){setEvSuggestions([]);return;}
    setEvSugLoading(true);
    try{
      const eventCtx=classEvents.slice(0,5).map(e=>`"${e.name}" (${scoreEvent(e).fleet} boats)`).join(", ");
      const prompt=`You are a sailing results filter suggestion engine. Given a partial query, suggest 4 short filter query completions.
Return ONLY a JSON array of 4 strings (no markdown). Each string is a complete natural-language filter query.
Context: class=${assoc?.name||"unknown"}, recent events: ${eventCtx}
Partial query: "${q}"`;
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt,max_tokens:200})});
      const data=await res.json();
      if(data.ok){
        const clean=data.text.replace(/\`\`\`json|\`\`\`/g,"").trim();
        const arr=JSON.parse(clean);
        setEvSuggestions(Array.isArray(arr)?arr.slice(0,4):[]);
      }
    }catch{setEvSuggestions([]);}
    finally{setEvSugLoading(false);}
  };

  const fetchProfileSuggestions=async(q)=>{
    if(!q.trim()||q.length<3){setProfileSuggestions([]);return;}
    setProfileSugLoading(true);
    try{
      const prompt=`Suggest 4 short sailing result filter queries for an athlete profile.
Return ONLY a JSON array of 4 strings. Each is a complete filter query.
Partial query: "${q}"`;
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt,max_tokens:150})});
      const data=await res.json();
      if(data.ok){
        const clean=data.text.replace(/\`\`\`json|\`\`\`/g,"").trim();
        const arr=JSON.parse(clean);
        setProfileSuggestions(Array.isArray(arr)?arr.slice(0,4):[]);
      }
    }catch{setProfileSuggestions([]);}
    finally{setProfileSugLoading(false);}
  };

  /* ── Global search ───────────────────────────────────────── */
  const runGlobalSearch=(q)=>{
    if(!q.trim()){setGSearchResults([]);return;}
    const ql=q.toLowerCase();
    const results=[];
    // Athletes — nav into the owner association of one of their events
    allPeople.filter(p=>p.name.toLowerCase().includes(ql)).slice(0,5).forEach(p=>{
      const ev=events.find(e=>e.entries.some(en=>en.helm===p.name||en.crew===p.name));
      results.push({type:"athlete",label:p.name,sub:CLASSES.find(cl=>cl.id===p.cls)?.short||"",nav:{type:"profile",assoc:ev?.owner||null,id:p.name}});
    });
    // Events — nav into the event's owner association portal
    events.filter(ev=>ev.name.toLowerCase().includes(ql)).slice(0,4).forEach(ev=>{
      results.push({type:"event",label:ev.name,sub:formatDate(ev.date),nav:{type:"event",assoc:ev.owner||null,id:ev.id}});
    });
    // Global class portals
    CLASSES.filter(c=>c.short.toLowerCase().includes(ql)).forEach(c=>{
      results.push({type:"portal",label:`${c.short} — All Results`,sub:"Global class portal",nav:{type:"portal",assoc:"class:"+c.id}});
    });
    // Association portals
    ASSOCIATIONS.filter(a=>a.name.toLowerCase().includes(ql)||a.cls.toLowerCase().includes(ql)).forEach(a=>{
      results.push({type:"portal",label:a.name,sub:"Association portal",nav:{type:"portal",assoc:a.id}});
    });
    // Nav shortcuts
    if("home all classes portals sailing associations".includes(ql))
      results.push({type:"nav",label:"Sailing — Home",sub:"Navigate",nav:{type:"home"}});
    if("all athletes".includes(ql)||ql.includes("athlete"))
      results.push({type:"nav",label:"All Athletes",sub:"Navigate",nav:{type:"athletes"}});
    setGSearchResults(results.slice(0,10));
  };

  const[editResultsEv,setEditResultsEv]=useState(null); // full edit mode for existing event
  const[hoverRow,setHoverRow]=useState(null); // {evId,helm} currently hovered
  const[hoverSummaries,setHoverSummaries]=useState({}); // key=helm → summary text
  const[profileSummaries,setProfileSummaries]=useState({}); // key=name → full profile blurb
  const[eventSummaries,setEventSummaries]=useState({}); // key=event.id → competition blurb
  const[eventSummaryOpen,setEventSummaryOpen]=useState({}); // key=event.id → revealed?

  const SPONSOR_LENS=`Write for a prospective SPONSOR/INVESTOR evaluating an athlete. The reader needs to judge how impressive a result is RELATIVE TO THE LEVEL of the competition. A mid-fleet finish at a World/Olympic-level event can be more valuable than a win at a small regional one. Focus on: the competition's reputation and level (international championship vs national vs club/regional), the depth/strength of the fleet, and what a strong or weak placing there would signify for an athlete's trajectory. Be specific and factual; no marketing fluff, no markdown, no headings.`;

  const fetchEventSummary=async(ev)=>{
    if(eventSummaries[ev.id]!==undefined) return;
    setEventSummaries(m=>({...m,[ev.id]:null}));
    try{
      const sc=scoreEvent(ev);
      const yr=ev.date?.split('/')?.[2]||"";
      const prompt=`${SPONSOR_LENS}
In 2-4 sentences, summarize this sailing competition for a sponsor deciding what an athlete's result here is worth. If you recognize this specific event, use what you know about its reputation, history and typical fleet strength. If you are not certain, infer the likely level from its name (e.g. "World Championship", "Europeans", "Nationals", club regatta) and say so cautiously — do not invent specific facts. End with one sentence on how to read an athlete's placing here.
Event name: "${ev.name}". Boat class: ${ev.cls}. Year: ${yr}. Host country: ${ev.country||"unknown"}. Fleet size: ${sc.fleet} boats. Races sailed: ${sc.races}.`;
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt,max_tokens:220})});
      const data=await res.json();
      if(data.ok) setEventSummaries(m=>({...m,[ev.id]:cleanAISummary(data.text)}));
      else setEventSummaries(m=>({...m,[ev.id]:""}));
    }catch{setEventSummaries(m=>({...m,[ev.id]:""}));}
  };

  const execGSearch=(r)=>{
    // Close search UI immediately
    setGSearch("");setGSearchOpen(false);setGSearchResults([]);
    const n=r.nav;
    if(n.type==="portal"){
      // enterPortal sets portal+view in one batch — no defer needed
      enterPortal(n.assoc);
    } else if(n.type==="home"){
      goHome();
    } else if(n.type==="athletes"){
      pushNav();
      setPortal(null);
      setTimeout(()=>setView({name:"athletes"}),0);
    } else if(n.type==="profile"){
      if(n.assoc&&n.assoc!==portal){
        pushNav();
        setPortal(n.assoc);
        setTimeout(()=>setView({name:"profile",id:n.id}),0);
      } else {
        go({name:"profile",id:n.id});
      }
    } else if(n.type==="event"){
      if(n.assoc&&n.assoc!==portal){
        pushNav();
        setPortal(n.assoc);
        setTimeout(()=>setView({name:"event",id:n.id}),0);
      } else {
        go({name:"event",id:n.id});
      }
    }
    window.scrollTo(0,0);
  };

  const fetchHoverSummary=async(name,ag,crew)=>{
    const key=crew?`${name}+${crew}`:name;
    if(hoverSummaries[key]!==undefined) return; // cached
    // Immediately set loading state so we don't double-fetch
    setHoverSummaries(h=>({...h,[key]:null}));
    try{
      const best=ag.best?"#"+ag.best:"unknown";
      const evs=ag.events;const pods=ag.podiums;const wins=ag.wins;
      let prompt;
      if(crew){
        const agCrew=aggregate(crew,events);
        prompt=`Write 2 short sentences (max 35 words total) about this sailing team's combined achievements. Be specific and factual.
Helm: ${name} (${evs} regattas, best: ${best}, ${pods} podiums, ${wins} race wins).
Crew: ${crew} (${agCrew.events} regattas, best: ${agCrew.best?"#"+agCrew.best:"unknown"}).`;
      } else {
        prompt=`Write 2 short sentences (max 30 words total) about this athlete. Be specific and factual.
Athlete: ${name}. Regattas: ${evs}. Best result: ${best}. Podiums: ${pods}. Race wins: ${wins}.`;
      }
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt,max_tokens:80})});
      const data=await res.json();
      if(data.ok) setHoverSummaries(h=>({...h,[key]:cleanAISummary(data.text)}));
      else setHoverSummaries(h=>({...h,[key]:""}));
    }catch{setHoverSummaries(h=>({...h,[key]:""}));}
  };

  // Signature of an athlete's result set — changes only when a competition is
  // added/removed, so a cached overview can be reused until then.
  const profileSig=(name,ag)=>{
    const ids=ag.history.map(h=>`${(h.ev.name||"").toLowerCase()}|${h.ev.date}`).sort().join(";");
    return `${name}::${ag.events}::${ids}`;
  };
  const fetchFullProfileSummary=async(name,ag)=>{
    if(profileSummaries[name]!==undefined) return;
    const sig=profileSig(name,ag);
    // Reuse a persisted overview if the athlete's results haven't changed.
    try{
      const raw=localStorage.getItem("athlink_bio_"+name);
      if(raw){
        const cached=JSON.parse(raw);
        if(cached.sig===sig){ setProfileSummaries(h=>({...h,[name]:cached.text})); return; }
      }
    }catch{}
    setProfileSummaries(h=>({...h,[name]:null})); // loading
    try{
      const countries=new Set(ag.history.map(h=>h.ev.country).filter(Boolean));
      const years=new Set(ag.history.map(h=>h.ev.date?.split('/')?.[2]).filter(Boolean));
      const partners=[...new Set(ag.history.map(h=>h.partner).filter(Boolean))].slice(0,3);
      const prompt=`${SPONSOR_LENS}
Write a 2-3 sentence athlete bio for a sponsorship profile, in third person.
STRICT RULES: Do NOT output any title, heading, markdown, or "#". Do NOT begin with the athlete's name. Mention the name at most once, naturally inside a sentence. Plain prose only — no bullet points, no bold. Use only the data provided. Be specific and factual. Where possible, frame results by the level of the events (e.g. a strong finish at an international championship vs a regional one).
Name: ${name}.
Regattas: ${ag.events}. Best result: ${ag.best?"#"+ag.best:"unknown"}. Podiums: ${ag.podiums}. Race wins: ${ag.wins}.
Countries competed in: ${[...countries].join(', ')||'unknown'}.
Active years: ${[...years].sort().join(', ')||'unknown'}.
Regular partners: ${partners.join(', ')||'unknown'}.
Event names (for level context): ${ag.history.slice(0,8).map(h=>h.ev.name).join('; ')||'unknown'}.`;
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prompt,max_tokens:120})});
      const data=await res.json();
      if(data.ok){
        const text=cleanAISummary(data.text);
        setProfileSummaries(h=>({...h,[name]:text}));
        try{localStorage.setItem("athlink_bio_"+name,JSON.stringify({sig,text}));}catch{}
      }
      else setProfileSummaries(h=>({...h,[name]:""}));
    }catch{setProfileSummaries(h=>({...h,[name]:""}));}
  };


  const openCalendarAt=(dateStr)=>{
    const p=dateStr?.split('/');
    if(!p||p.length!==3) return;
    const mo=parseInt(p[1])-1;const yr=parseInt(p[2]);
    if(isNaN(mo)||isNaN(yr)) return;
    setCalMonth(mo);setCalYear(yr);setShowCalendar(true);
  };
  const openSailorCalAt=(dateStr,name)=>{
    const p=dateStr?.split('/');
    if(!p||p.length!==3) return;
    setSailorCalMonth(parseInt(p[1])-1);setSailorCalYear(parseInt(p[2]));
    setSailorCalName(name);setSailorCalClsSet(new Set());setShowSailorCal(true);
  };

  const saveEvMeta=async()=>{
    if(!editEvMeta) return;
    const{id,name,date,country,discards}=editEvMeta;
    await sbPatch("events",`id=eq.${id}`,{name,date,country:country||null,discards:parseInt(discards)||1});
    setEvents(p=>p.map(ev=>ev.id===id?{...ev,name,date,country,discards:parseInt(discards)||1}:ev));
    setEditEvMeta(null);
  };

  const openEditResults=(ev)=>{
    // Load existing event into the previewEv state for full editing
    const prev={
      ...ev,
      venue:ev.country||"",
      entries:ev.entries.map(e=>({...e})),
    };
    setPreviewEv(prev);
    setMf(f=>({...f,cls:ev.cls,subclass:ev.subclass||null,collabs:ev.collabs||[]}));
    setEditResultsEv(ev.id); // flag: this is an edit, not a new import
    setOpen(true);
    setImportStep("preview");
  };

  const saveEditedResults=async(asDraft)=>{
    if(!previewEv||!editResultsEv) return;
    const status=asDraft?"Draft":"Final";
    const ev={...previewEv,status,country:(previewEv.venue||"").toUpperCase()||previewEv.country||"",
      subclass:mf.subclass||null,collabs:mf.collabs||[]};
    // Update event metadata
    await sbPatch("events",`id=eq.${editResultsEv}`,{
      name:ev.name,date:ev.date,country:ev.country||null,
      discards:ev.discards,status,subclass:ev.subclass,collabs:ev.collabs,
    });
    // Update entries (delete old, insert new)
    if(sbH){
      await sbDel("entries",`event_id=eq.${editResultsEv}`);
      await sbPost("entries",ev.entries.map(e=>({
        event_id:editResultsEv,sail:e.sail,nat:e.nat||null,
        division:e.div,helm_name:e.helm,crew_name:e.crew||null,
        races:e.races,race_codes:e.race_codes||null,
        pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null,
      })));
    }
    setEvents(p=>p.map(existing=>existing.id===editResultsEv?{...ev,id:editResultsEv}:existing));
    setEditResultsEv(null);
    closeImport();
    setNote({name:ev.name,matched:0,created:0,msg:status==="Draft"?"Saved as draft.":"Results updated."});
    setTimeout(()=>setNote(null),4000);
  };

  /* ── PDF / import flow ────────────────────────────────────── */
  const resetImport=()=>{
    setPdfLoading(false);setPdfError("");setImportStep("upload");
    setFleetChoices([]);setPdfMeta(null);setPreviewEv(null);setPreviewEdit(null);
    setPending([]);setActivePending(0);
  };
  const closeImport=()=>{setOpen(false);resetImport();setTab("pdf");};

  // Snapshot current editor (previewEv + class/subclass/collab) into the active pending slot.
  const syncActivePending=()=>{
    setPending(prev=>prev.map((p,i)=>i===activePending?{...p,previewEv,subclass:mf.subclass,collabs:mf.collabs}:p));
  };
  // Switch to another pending result tab.
  const switchPending=idx=>{
    if(idx===activePending||idx<0||idx>=pending.length) return;
    setPending(prev=>{
      const next=prev.map((p,i)=>i===activePending?{...p,previewEv,subclass:mf.subclass,collabs:mf.collabs}:p);
      const target=next[idx];
      if(target?.previewEv){
        setPreviewEv(target.previewEv);
        setMf(f=>({...f,subclass:target.subclass||null,collabs:target.collabs||[]}));
      }
      return next;
    });
    setActivePending(idx);
  };
  // Merge all pending tabs that share a fleetGroupId into one combined tab.
  const combineFleetGroup=(groupId)=>{
    const groupItems=pending.filter(p=>p.fleetGroupId===groupId);
    if(groupItems.length<2) return;
    const allEntries=groupItems.flatMap(p=>p.previewEv?.entries||[]);
    const seen=new Set();
    const merged=allEntries.filter(e=>{const k=(e.helm||"").toLowerCase()+(e.sail||"");if(seen.has(k))return false;seen.add(k);return true;});
    merged.sort((a,b)=>(a.pdf_rank??9999)-(b.pdf_rank??9999));
    const baseName=groupItems[0].fleetGroupBaseName||groupItems[0].previewEv?.name?.split(" — ")[0]||"Imported Competition";
    const maxDisc=groupItems[0].fleetGroupDiscards||Math.max(...groupItems.map(p=>p.previewEv?.discards||1));
    const combinedPreview={...groupItems[0].previewEv,name:baseName,discards:maxDisc,entries:merged,ai_parsed:false};
    const combinedItem={id:"combined_"+groupId,name:baseName,status:"ok",error:null,previewEv:combinedPreview,subclass:groupItems[0].subclass,collabs:groupItems[0].collabs};
    const newPending=[...pending.filter(p=>p.fleetGroupId!==groupId),combinedItem];
    const newIdx=newPending.length-1;
    setPending(newPending);
    setActivePending(newIdx);
    setPreviewEv(combinedPreview);
    setMf(f=>({...f,subclass:combinedItem.subclass||null,collabs:combinedItem.collabs||[]}));
  };

  const buildPreviewFromFleet=(pdfName,pdfDate,fleet)=>{
    const ev={
      id:"imp_"+Date.now(),
      name:pdfName+(fleet.name?` — ${fleet.name}`:""),
      cls:portal,
      doublehanded:fleet.entries.some(e=>e.crew),
      venue:"",country:"",
      date:pdfDate||"",
      discards:fleet.discards||1,
      scoring:'Appendix A',
      source:"PDF import",status:"Draft",
      entries:fleet.entries.map((e,i)=>({
        _previewKey:`${i}_${e.helm}`,
        sail:e.sail||"—",nat:e.nat||"",div:e.div||"",
        helm:e.helm||"",crew:e.crew||"",
        races:(e.races||[]),
        race_codes:e.race_codes||null,pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null,
      })),
    };
    setPreviewEv(ev);setImportStep("preview");
  };

  // Parse a single file → {ok, name, date, entries, discards, multi, fleets, error}
  const parseOneFile=async file=>{
    if(file.name.toLowerCase().endsWith(".html")||file.type==="text/html"){
      try{
        const buf=await file.arrayBuffer();
        const html=new TextDecoder('iso-8859-1').decode(buf);
        const data=parseHtml(html);
        if(!data.ok) return{ok:false,error:data.error||"Could not parse this HTML file."};
        return data;
      }catch(err){return{ok:false,error:"HTML parse failed: "+err.message};}
    }
    try{
      const res=await fetch("/api/parse_pdf",{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      const data=await res.json();
      if(!data.ok) return{ok:false,error:data.error||"Could not parse this file."};
      return data;
    }catch{return{ok:false,error:"Upload failed. Check api/parse_pdf.py is deployed."};}
  };

  // Build a previewEv object from parsed fleet data (no state side-effects).
  const previewFromData=(name,date,fleet,aiParsed=false)=>{
    const sh=(assoc?.cls)==="ilca"||(assoc?.cls)==="optimist";
    return{
      id:"imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
      name:(fleet.name?`${name} — ${fleet.name}`:name)||"Imported Competition",
      cls:assoc?.cls||"29er",doublehanded:!sh,venue:"",country:"",
      date:date||"",discards:fleet.discards||1,scoring:"Appendix A",
      source:"Imported",status:"Final",
      ai_parsed:aiParsed||false,
      entries:(fleet.entries||[]).map(e=>({
        helm:e.helm||"",crew:sh?"":(e.crew||""),sail:e.sail||"—",nat:e.nat||"",div:e.div||"",
        races:e.races||[],race_codes:e.race_codes||null,pdf_rank:e.pdf_rank??null,pdf_net:e.pdf_net??null,
      })),
    };
  };

  // ── MULTI-FILE: parse all chosen files into the pending list ──
  const handleFiles=async fileList=>{
    const files=[...(fileList||[])];
    if(!files.length) return;
    setPdfError("");setPdfLoading(true);
    // seed placeholders
    const seed=files.map((f,i)=>({id:"pf_"+Date.now()+"_"+i,name:f.name,status:"parsing",error:null,previewEv:null,subclass:null,collabs:[]}));
    setPending(seed);setActivePending(0);setImportStep("preview");
    const results=[];
    for(let i=0;i<files.length;i++){
      const data=await parseOneFile(files[i]);
      if(!data.ok){
        results.push({...seed[i],status:"error",error:data.error});
      }else if(data.multi&&data.fleets?.length){
        // multi-fleet file → expand each fleet into its own pending tab, tagged with a groupId
        const groupId="fg_"+Date.now()+"_"+i;
        const groupDisc=Math.max(...data.fleets.map(f=>f.discards||1));
        data.fleets.forEach((fl,fi)=>{
          results.push({id:seed[i].id+"_f"+fi,name:`${files[i].name} · ${fl.name||"Fleet "+(fi+1)}`,status:"ok",error:null,
            previewEv:previewFromData(data.name,data.date||"",fl),subclass:null,collabs:[],
            fleetGroupId:groupId,fleetGroupBaseName:data.name,fleetGroupDiscards:groupDisc});
        });
      }else{
        results.push({...seed[i],status:"ok",previewEv:previewFromData(data.name,data.date||"",{name:"",entries:data.entries,discards:data.discards},data.ai_parsed||false)});
      }
    }
    setPending(results);setActivePending(0);
    const firstOk=results.findIndex(r=>r.status==="ok");
    if(firstOk>=0){setActivePending(firstOk);setPreviewEv(results[firstOk].previewEv);}
    setPdfLoading(false);
  };

  const handlePdf=async file=>{
    if(!file) return;
    return handleFiles([file]);
  };
  const selectFleet=fleet=>buildPreviewFromFleet(pdfMeta.name,pdfMeta.date,fleet);
  const updPMeta=(k,v)=>setPreviewEv(ev=>({...ev,[k]:v}));
  const updPEntry=(idx,k,v)=>setPreviewEv(ev=>({...ev,entries:ev.entries.map((e,i)=>i===idx?{...e,[k]:v}:e)}));

  const startPreviewEdit=(type,idx,raceIdx,val)=>{
    setPreviewEdit({type,idx,raceIdx});
    setPreviewEditVal(val===null||val===undefined?"":String(val));
  };
  const commitPreviewEdit=()=>{
    if(!previewEdit) return;
    const{type,idx,raceIdx}=previewEdit;
    setPreviewEv(ev=>{
      const entries=[...ev.entries];
      if(type==="score"){
        const raw=previewEditVal.trim().toUpperCase();
        let nv;
        if(!raw){nv=null;}
        else if(/^\d+(\.\d+)?$/.test(raw)){nv=parseFloat(raw);if(nv===Math.floor(nv))nv=Math.floor(nv);}
        else nv=raw;
        const races=[...(entries[idx].races||[])];
        while(races.length<=raceIdx) races.push(null);
        races[raceIdx]=nv;entries[idx]={...entries[idx],races};
      }else if(type==="helm") entries[idx]={...entries[idx],helm:previewEditVal};
      else if(type==="crew") entries[idx]={...entries[idx],crew:previewEditVal};
      else if(type==="sail") entries[idx]={...entries[idx],sail:previewEditVal||"—"};
      return{...ev,entries};
    });
    setPreviewEdit(null);
  };

  const importPreview=async(asDraft)=>{
    if(!previewEv) return;
    const status=asDraft?"Draft":"Final";
    const ev={...previewEv,status,
      cls:previewEv.cls||assoc?.cls||"29er",
      subclass:mf.subclass||previewEv.subclass||null,
      owner:portal&&!isClassPortal?portal:(previewEv.owner||null),
      collabs:mf.collabs||previewEv.collabs||[],
      venue:previewEv.venue||"",
      country:(previewEv.venue||"").toUpperCase()||previewEv.country||"",
      date:previewEv.date||"",
      doublehanded:previewEv.entries.some(e=>e.crew&&e.crew.trim()),
    };
    ev.entries=ev.entries.map(e=>({...e,races:(e.races||[]).filter(r=>r!==null&&r!==undefined&&r!==""),}));
    const existing=new Set();events.forEach(e=>e.entries.forEach(en=>{existing.add(en.helm);if(en.crew)existing.add(en.crew);}));
    const incoming=new Set();ev.entries.forEach(en=>{incoming.add(en.helm);if(en.crew)incoming.add(en.crew);});
    let matched=0,created=0;incoming.forEach(n=>existing.has(n)?matched++:created++);
    // Optimistic: drop the event into the list and close the popup immediately
    setEvents(p=>[ev,...p.filter(x=>x.id!==ev.id)]);
    setNote({name:ev.name,matched,created,msg:asDraft?"Saved as draft — confirm when ready.":null});
    setTimeout(()=>setNote(null),7000);
    // Multi-file: remove this published tab; advance to the next pending one, or close.
    if(pending.length){
      const remaining=pending.filter((_,i)=>i!==activePending);
      if(remaining.length){
        setPending(remaining);
        const nextIdx=Math.min(activePending,remaining.length-1);
        const firstOk=remaining[nextIdx]?.status==="ok"?nextIdx:remaining.findIndex(r=>r.status==="ok");
        setActivePending(firstOk<0?0:firstOk);
        const t=remaining[firstOk<0?0:firstOk];
        if(t?.previewEv){setPreviewEv(t.previewEv);setMf(f=>({...f,subclass:t.subclass||null,collabs:t.collabs||[]}));}
      } else {
        closeImport();
      }
    } else {
      closeImport();
    }
    // Persist in the background; swap in the DB copy (with real ids) once saved
    try{
      const saved=await saveEventToDb(ev);
      if(saved?.[0]?.id){
        const fresh=await sbGet(`events?select=*,entries(*)&id=eq.${saved[0].id}`);
        if(fresh?.[0]) setEvents(p=>p.map(x=>x.id===ev.id?dbToApp(fresh[0]):x));
      } else {
        console.error("importPreview: Supabase save failed — kept in memory only (will not persist on reload)");
      }
    }catch(err){console.error("importPreview: background save error",err);}
  };

  /* ── inline score editing ─────────────────────────────────── */
  const VALID_CODES=["DNF","DNC","DNS","OCS","DSQ","BFD","UFD","RET","SCP","STP","DPI","DNE","NSC","TAL","ZFP","RDG"];
  const startEdit=(evId,sail,helm,raceIdx,val)=>{setEditCell({evId,sail,helm,raceIdx});setEditVal(String(val));};
  const commitEdit=async()=>{
    if(!editCell) return;
    const raw=editVal.trim().toUpperCase();let nv;
    if(/^\d+(\.\d+)?$/.test(raw)){nv=parseFloat(raw);if(nv===Math.floor(nv))nv=Math.floor(nv);if(nv<1){setEditCell(null);return;}}
    else if(VALID_CODES.includes(raw)) nv=raw;
    else{setEditCell(null);return;}
    const{evId,sail,helm,raceIdx}=editCell;
    const entry=events.find(e=>e.id===evId)?.entries.find(e=>e.sail===sail&&e.helm===helm);
    if(entry?._dbId){const u=[...entry.races];u[raceIdx]=nv;await sbPatch("entries",`id=eq.${entry._dbId}`,{races:u});}
    setEvents(prev=>prev.map(ev=>{
      if(ev.id!==evId) return ev;
      return{...ev,entries:ev.entries.map(e=>{
        if(e.sail!==sail||e.helm!==helm) return e;
        const r=[...e.races];r[raceIdx]=nv;return{...e,races:r};
      })};
    }));
    setEditCell(null);
  };

  /* ── manual entry ops ─────────────────────────────────────── */
  const updMeta=(k,v)=>setMf(f=>({...f,[k]:v}));
  const updRow=(i,k,v)=>setMf(f=>({...f,rows:f.rows.map((r,ri)=>ri===i?{...r,[k]:v}:r)}));
  const updScore=(i,j,v)=>setMf(f=>({...f,rows:f.rows.map((r,ri)=>ri===i?{...r,scores:r.scores.map((s,si)=>si===j?v:s)}:r)}));
  const addRow=()=>setMf(f=>({...f,rows:[...f.rows,defRow(f.numRaces)]}));
  const delRow=i=>setMf(f=>({...f,rows:f.rows.filter((_,ri)=>ri!==i)}));
  const setNumRaces=n=>setMf(f=>({...f,numRaces:n,rows:f.rows.map(r=>({...r,scores:Array(n).fill("").map((_,i)=>r.scores[i]||"")}))}));
  const buildManualEvent=()=>{
    const rows=mf.rows.filter(r=>r.helm.trim());if(!rows.length)return null;
    const disc=Math.min(mf.discards,Math.max(0,mf.numRaces-1));
    const evCls=assoc?.cls||mf.cls||"29er";
    const sh=evCls==="ilca"||evCls==="optimist";
    return{id:"imp_"+Date.now(),name:mf.name||"Imported Regatta",cls:evCls,
      subclass:mf.subclass||null,owner:portal||null,collabs:mf.collabs||[],
      doublehanded:!sh&&rows.some(r=>r.crew.trim()),venue:mf.club||"—",country:mf.club||mf.country||"",
      date:mf.date||"",discards:disc,scoring:'Appendix A',
      source:"Manual import",status:"Final",
      entries:rows.map(r=>({helm:r.helm.trim(),crew:sh?"":r.crew.trim(),sail:r.sail.trim()||"—",nat:(r.nat||"").trim(),div:(r.div||"").trim(),
        races:r.scores.map(s=>s.trim()).filter(Boolean).map(s=>/^\d+(\.\d+)?$/.test(s)?parseFloat(s):s.toUpperCase())}))};
  };
  const doImportManual=async()=>{
    const ev=buildManualEvent();if(!ev)return;
    const existing=new Set();events.forEach(e=>e.entries.forEach(en=>{existing.add(en.helm);if(en.crew)existing.add(en.crew);}));
    const incoming=new Set();ev.entries.forEach(en=>{incoming.add(en.helm);if(en.crew)incoming.add(en.crew);});
    let matched=0,created=0;incoming.forEach(n=>existing.has(n)?matched++:created++);
    await saveEventToDb(ev);setEvents(p=>[ev,...p]);
    setNote({name:ev.name,matched,created});setOpen(false);setMf(emptyForm());
    setTimeout(()=>setNote(null),6500);
  };

  /* ── sail display helper ───────────────────────────────────── */
  const sailDisplay=(nat,sail)=>{
    if(!nat) return sail;
    const flag=iocFlag(nat);
    return`${flag} ${nat} ${sail}`;
  };

  /* ═════════════════════════════════════════════════════════════ */
  return(
  <div className="al-root">
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
    .al-root{--navy:#163a63;--navy2:#1f4e80;--accent:#0d8ecf;--accent2:#2ba3df;--sky:#dcecf8;--paper:#f3f7fb;--ink:#14213a;--mut:#5b6b80;--line:#d9e3ef;--card:#fff;--gold:#c8920b;font-family:'DM Sans',sans-serif;color:var(--ink);background:var(--paper);min-height:100vh;-webkit-font-smoothing:antialiased;}
    .al-root *{box-sizing:border-box;}
    .disp{font-family:'Barlow',sans-serif;}
    .wrap{max-width:1000px;margin:0 auto;padding:0 22px;}
    .topbar{background:var(--navy);color:#fff;position:sticky;top:0;z-index:60;}
    .topin{max-width:1000px;margin:0 auto;padding:12px 22px;display:flex;align-items:center;gap:14px;}
    .brand{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;flex:none;}
    .topname{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;}
    .topsite{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;color:#fff;letter-spacing:.01em;}
    .nav{display:flex;gap:6px;margin-left:auto;}
    .nav button{font-family:'Barlow',sans-serif;font-weight:600;font-size:14px;color:#bcd2e8;background:none;border:0;padding:7px 13px;border-radius:8px;cursor:pointer;transition:.15s;}
    .nav button:hover{color:#fff;background:rgba(255,255,255,.08);}
    .nav button.on{color:#fff;background:var(--accent);}
    .nav button.sm{color:#9fbdd9;font-size:13px;}
    .nav button.sm:hover{color:#fff;}
    .strip{background:linear-gradient(140deg,#1b4470,#143358);color:#cfe0f1;padding:28px 0 22px;}
    .strip h1{font-family:'Barlow',sans-serif;color:#fff;font-size:28px;font-weight:800;margin:0 0 14px;}
    .pillbar{display:flex;gap:20px;flex-wrap:wrap;}
    .pill{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#9fbdd9;}
    .pill b{color:#fff;font-family:'Barlow',sans-serif;font-size:19px;}
    .sec{padding:24px 0 60px;}
    .seclabel{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);margin:0 0 14px;display:flex;align-items:center;gap:8px;}
    .ev{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:12px;cursor:pointer;transition:.18s;display:flex;align-items:center;gap:14px;animation:rise .5s both;}
    .ev:hover{border-color:#b9cee4;transform:translateY(-2px);box-shadow:0 12px 30px -16px rgba(22,58,99,.55);}
    .ev.draft{opacity:.75;border-style:dashed;}
    .evicon{width:44px;height:44px;border-radius:11px;background:var(--sky);color:var(--navy);display:grid;place-items:center;flex:none;}
    .evicon-date{width:48px;height:48px;border-radius:11px;background:var(--sky);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;gap:0;}
    .evicon-date .eid{font-family:'Barlow',sans-serif;font-weight:800;font-size:20px;color:var(--navy);line-height:1;}
    .evicon-date .eim{font-size:9px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;line-height:1.2;}
    .evicon-year{display:flex;flex-direction:column;align-items:center;gap:0;}
    .evicon-year span{font-size:9px;font-weight:700;color:var(--mut);letter-spacing:.02em;line-height:1.3;font-family:'Barlow',sans-serif;}
    .evname{font-family:'Barlow',sans-serif;font-weight:700;font-size:17px;margin:0 0 3px;}
    .evmeta{font-size:13px;color:var(--mut);display:flex;gap:12px;flex-wrap:wrap;align-items:center;}
    .evmeta span{display:flex;align-items:center;gap:5px;}
    .draftbadge{font-size:11px;font-weight:700;color:#7a4a0a;background:#fdecd6;padding:4px 9px;border-radius:20px;}
    .cls{font-family:'Barlow',sans-serif;font-weight:700;font-size:12px;color:#fff;background:var(--navy2);padding:4px 10px;border-radius:7px;flex:none;}
    .delbtn{background:none;border:0;color:#c0392b;cursor:pointer;padding:6px;border-radius:7px;display:grid;place-items:center;opacity:.45;transition:.15s;flex:none;}
    .delbtn:hover{opacity:1;background:#fbe7e4;}
    .panel{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:auto;}
    table{width:100%;border-collapse:collapse;font-size:13px;min-width:680px;}
    thead th{background:var(--navy);color:#fff;font-family:'Barlow',sans-serif;font-weight:600;text-align:center;padding:11px 5px;font-size:12px;}
    thead th.l{text-align:left;padding-left:18px;}
    tbody td{padding:8px 5px;text-align:center;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;}
    tbody td.l{text-align:left;padding-left:18px;}
    tbody td.editable{cursor:text;}tbody td.editable:hover{background:#eef4fb;}
    tbody tr:last-child td{border-bottom:0;}
    .rk{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;width:40px;}
    tbody tr.row-hover{background:#f0f6fc;transition:background .2s;}
    .hover-summary{font-size:11.5px;color:var(--mut);font-style:italic;margin-top:3px;max-width:340px;animation:rise .2s both;}
    .hover-summary.loading{opacity:.6;}
    .summary-row td{padding:0;}
    .team-summary{display:flex;gap:9px;align-items:flex-start;margin:0 0 13px;padding:11px 15px;
      background:linear-gradient(135deg,rgba(13,142,207,.08),rgba(22,58,99,.05));border:1px solid var(--line);
      border-left:3px solid var(--accent);border-radius:11px;font-size:13px;line-height:1.5;color:var(--ink);
      transform-origin:top center;animation:summaryPop .42s cubic-bezier(.34,1.5,.5,1) both;}
    .team-summary.loading{color:var(--mut);font-style:italic;}
    @keyframes summaryPop{0%{opacity:0;transform:translateY(-9px) scaleY(.5);}55%{opacity:1;transform:translateY(2px) scaleY(1.05);}100%{opacity:1;transform:translateY(0) scaleY(1);}}
    /* Calendar — year/month views */
    .cal-title-btn{font-family:'Barlow',sans-serif;font-weight:700;font-size:18px;color:var(--navy);background:none;border:0;cursor:pointer;padding:5px 12px;border-radius:9px;min-width:150px;transition:.12s;}
    .cal-title-btn:hover{background:var(--sky);}
    .cal-fade{animation:calFade .26s ease both;}
    @keyframes calFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
    @keyframes calMorph{0%{opacity:0;transform:scale(.55);transform-origin:center top;}60%{opacity:1;}100%{opacity:1;transform:scale(1);}}
    .cal-year-scroll{flex:1;overflow-y:auto;padding:16px 18px;animation:calFade .26s ease both;}
    .cal-year-block{margin-bottom:28px;}
    .cal-year-label{font-family:'Barlow',sans-serif;font-weight:800;font-size:23px;color:var(--navy);margin:0 0 14px;}
    .cal-year-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px;}
    .cal-mini{cursor:pointer;border:1px solid transparent;border-radius:12px;padding:9px;transition:.13s;}
    .cal-mini:hover{background:#fff;border-color:var(--line);box-shadow:0 8px 22px -12px rgba(22,58,99,.4);transform:translateY(-2px);}
    .cal-mini-name{font-family:'Barlow',sans-serif;font-weight:700;font-size:13px;color:var(--accent);margin-bottom:6px;}
    .cal-mini-dow{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:3px;}
    .cal-mini-dow span{font-size:8px;color:var(--mut);text-align:center;font-weight:700;}
    .cal-mini-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;}
    .cal-mini-day{font-size:9px;text-align:center;color:var(--ink);width:15px;height:15px;line-height:15px;border-radius:50%;margin:0 auto;}
    .cal-mini-day.o{color:#cbd5e1;}
    .cal-legend{display:flex;align-items:center;gap:13px;flex-wrap:wrap;font-size:11px;color:var(--mut);}
    .cal-legend .lg{display:flex;align-items:center;gap:5px;}
    .cal-legend .dot{width:11px;height:11px;border-radius:50%;}
    .rk.p1{color:var(--gold);}.rk.p2{color:#7d8a98;}.rk.p3{color:#a86a32;}
    .boat{display:flex;align-items:center;gap:10px;}
    .av{width:30px;height:30px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none;font-family:'Barlow',sans-serif;}
    .cn{font-size:11.5px;color:var(--mut);}
    .namelink{color:var(--accent);font-weight:600;cursor:pointer;}.namelink:hover{text-decoration:underline;}
    .disc{color:var(--mut);}.code{color:#c0392b;font-weight:600;font-size:11px;}
    .net{font-family:'Barlow',sans-serif;font-weight:700;color:var(--navy);}
    .sailcol{font-size:12px;color:var(--mut);white-space:nowrap;}
    .vchip{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--accent);font-weight:600;}
    .divtag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;white-space:nowrap;}
    .divtag.male{color:#1a5e8a;background:#d9edf7;}
    .divtag.female{color:#8a1a3c;background:#f7d9e3;}
    .divtag.mixed{color:#5a1a8a;background:#ead9f7;}
    .divtag.junior{color:#0a6b41;background:#d4f0e0;}
    .cellinput{width:44px;text-align:center;border:1.5px solid var(--accent);border-radius:5px;padding:3px;font:inherit;font-size:13px;outline:none;background:#fff;color:var(--ink);}
    .agrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:13px;}
    .acard{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;cursor:pointer;transition:.18s;animation:rise .5s both;}
    .acard:hover{border-color:#b9cee4;transform:translateY(-2px);box-shadow:0 12px 28px -16px rgba(22,58,99,.55);}
    .achead{display:flex;align-items:center;gap:11px;margin-bottom:12px;}
    .achead>.av{flex:none;}
    .achead .vb-spacer{margin-left:auto;}
    .achead .av{width:42px;height:42px;font-size:14px;}
    .acn{font-family:'Barlow',sans-serif;font-weight:800;font-size:16.5px;line-height:1.12;color:var(--ink);}
    .acstat{display:flex;gap:16px;font-size:10.5px;color:var(--mut);border-top:1px solid var(--line);padding-top:11px;align-items:center;opacity:.72;}
    .acstat b{display:block;font-family:'Barlow',sans-serif;font-size:14px;color:var(--mut);font-weight:700;}
    .toolbar{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap;}
    .srch{flex:1;min-width:200px;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:9px 13px;}
    .srch input{border:0;outline:0;font:inherit;font-size:14px;width:100%;background:none;color:var(--ink);}
    .seg{display:flex;background:#fff;border:1px solid var(--line);border-radius:10px;padding:3px;}
    .seg button{font:inherit;font-size:13px;font-weight:600;border:0;background:none;color:var(--mut);padding:6px 12px;border-radius:7px;cursor:pointer;}
    .seg button.on{background:var(--navy);color:#fff;}
    .btn{font-family:'Barlow',sans-serif;font-weight:600;font-size:14px;border:0;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:10px 16px;transition:.15s;}
    .btn.cta{background:var(--accent);color:#fff;}.btn.cta:hover{background:var(--accent2);}
    .btn.ghost{background:#fff;border:1px solid var(--line);color:var(--ink);}.btn.ghost:hover{border-color:#b9cee4;}
    .btn.sky{background:var(--sky);color:var(--navy);border:0;}.btn.sky:hover{background:#c8dcf0;}
    .btn.amber{background:#fdecd6;color:#7a4a0a;border:1px solid #e8921a;}.btn.amber:hover{background:#fde0b8;}
    .btn.green{background:#d4f0e0;color:#0a6b41;border:1px solid #2ecc71;}.btn.green:hover{background:#c0e8d4;}
    .btn:disabled{opacity:.5;cursor:default;}
    .phead{background:linear-gradient(135deg,#1b4470,#143358);border-radius:18px;padding:26px;color:#fff;display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;}
    .phead .av{width:74px;height:74px;font-size:26px;border:3px solid rgba(255,255,255,.22);}
    .pname{font-family:'Barlow',sans-serif;font-weight:800;font-size:28px;margin:0;line-height:1;}
    .pflag{font-size:28px;line-height:1;margin-right:4px;}
    .pmeta{color:#bcd2e8;font-size:14px;margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;}
    .pmeta span{display:flex;align-items:center;gap:5px;}
    .pstats{display:flex;gap:28px;margin-top:18px;flex-wrap:wrap;}
    .pstats .v{font-family:'Barlow',sans-serif;font-weight:800;font-size:25px;}
    .pstats .k{font-size:11px;color:#9fbdd9;letter-spacing:.05em;text-transform:uppercase;}
    .claimbox{margin-left:auto;text-align:right;}
    .vbox{background:rgba(13,142,207,.16);border:1px solid rgba(13,142,207,.5);border-radius:12px;padding:12px 16px;color:#dcecf8;font-size:13px;max-width:240px;}
    .vbox b{color:#fff;display:flex;align-items:center;gap:6px;font-family:'Barlow',sans-serif;}
    .histrow{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:15px 18px;margin-bottom:11px;display:flex;align-items:center;gap:16px;animation:rise .45s both;}
    .hrk{font-family:'Barlow',sans-serif;font-weight:800;font-size:22px;width:58px;text-align:center;flex:none;color:var(--navy);}
    .hrk.p1{color:var(--gold);}.hrk.p2{color:#7d8a98;}.hrk.p3{color:#a86a32;}
    .hrk small{display:block;font-size:10px;color:var(--mut);font-weight:600;}
    .rolechip{font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:5px;text-transform:uppercase;font-family:'Barlow',sans-serif;}
    .rolechip.helm{color:#fff;background:var(--navy2);}.rolechip.crew{color:var(--navy2);background:var(--sky);}
    .miniraces{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;}
    .rc{width:24px;height:24px;border-radius:6px;background:#f0f2f5;color:#2c3e50;font-size:10px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums;}
    .rc.c{background:#fbe3e0;color:#c0392b;}
    .rc.d{background:#f0f2f5;color:#8a99aa;}
    .rc.g1{background:#f5e8b4;color:#8a6200;}
    .rc.g2{background:#d4e8f5;color:#1a5e8a;}
    .rc.g3{background:#f5d4d4;color:#8a1a1a;}
    /* Home */
    .home-hero{background:linear-gradient(140deg,#1b4470,#143358);padding:36px 0 0;}
    .home-hero h1{font-family:'Barlow',sans-serif;color:#fff;font-size:36px;font-weight:800;margin:0 0 6px;}
    .home-hero p{color:#bcd2e8;font-size:15px;margin:0 0 20px;}
    .home-search{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:9px 14px;max-width:380px;margin-bottom:20px;}
    .home-search input{border:0;outline:0;font:inherit;font-size:14px;background:none;color:#fff;width:100%;}
    .home-search input::placeholder{color:#9fbdd9;}
    .home-tabs{display:flex;gap:0;}
    .home-tabs button{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;border:0;background:none;color:#9fbdd9;padding:12px 20px;border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer;transition:.15s;}
    .home-tabs button.on{color:#fff;border-bottom-color:#fff;}
    .home-tabs button:hover:not(.on){color:#d0e4f4;}
    .classes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}
    .class-card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px;cursor:pointer;transition:.18s;animation:rise .5s both;}
    .class-card:hover{border-color:#b9cee4;transform:translateY(-3px);box-shadow:0 16px 36px -16px rgba(22,58,99,.6);}
    .class-tag{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);background:var(--sky);padding:4px 11px;border-radius:6px;display:inline-block;margin-bottom:14px;}
    .class-name{font-family:'Barlow',sans-serif;font-weight:700;font-size:19px;margin:0 0 14px;line-height:1.25;color:var(--ink);}
    .class-stats{display:flex;gap:20px;font-size:12px;color:var(--mut);margin-bottom:18px;}
    .class-stats b{display:block;font-family:'Barlow',sans-serif;font-size:20px;color:var(--ink);font-weight:700;}
    /* Draft banner */
    .draft-banner{background:#fef3e2;border:1px solid #e8921a;border-radius:12px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:14px;}
    .draft-banner p{margin:0;font-size:14px;color:#7a4a0a;flex:1;}
    .draft-banner strong{display:block;font-family:'Barlow',sans-serif;font-size:15px;margin-bottom:2px;}
    /* Fleet picker */
    .fleet-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin:16px 0;}
    .fleet-card{background:var(--card);border:1.5px solid var(--line);border-radius:12px;padding:16px;cursor:pointer;transition:.15s;text-align:center;}
    .fleet-card:hover{border-color:var(--accent);background:var(--sky);}
    .fleet-card .fname{font-family:'Barlow',sans-serif;font-weight:700;font-size:16px;color:var(--navy);margin-bottom:4px;}
    .fleet-card .fcount{font-size:13px;color:var(--mut);}
    /* Preview modal */
    .preview-meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;}
    .preview-meta.wide{grid-template-columns:2fr 1fr 1fr 1fr;}
    .preview-meta label{font-size:11px;color:var(--mut);display:block;margin-bottom:3px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;}
    .preview-meta input{width:100%;border:1px solid var(--line);border-radius:7px;padding:7px 10px;font:inherit;font-size:13px;background:#fff;outline:none;}
    .preview-meta input:focus{border-color:var(--accent);}
    .preview-meta input.pmissing{border-color:#e8921a;background:#fffbec;}
    .pmissing-hint{font-size:11px;color:#e8921a;margin-bottom:10px;display:flex;align-items:center;gap:5px;}
    .preview-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px;max-height:52vh;}
    .pe-input{width:100%;border:0;border-bottom:1.5px solid var(--accent);background:#fffbec;font:inherit;font-size:12px;text-align:center;padding:3px 2px;outline:none;}
    /* Modal */
    .notice{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:60;background:var(--navy);color:#fff;border-radius:13px;padding:14px 20px;display:flex;gap:13px;align-items:center;box-shadow:0 20px 50px -18px rgba(0,0,0,.6);animation:rise .4s both;max-width:92%;}
    .notice b{font-family:'Barlow',sans-serif;}
    .notice .ico{background:var(--accent);color:#fff;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex:none;}
    .back{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:14px;color:var(--navy2);background:none;border:0;cursor:pointer;margin-bottom:16px;padding:0;}
    .back:hover{color:var(--accent);}
    .foot{font-size:12px;color:var(--mut);text-align:center;padding:30px 0;}
    .ov{position:fixed;inset:0;background:rgba(16,33,58,.55);z-index:70;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;animation:fade .2s both;}
    .modal{background:var(--paper);width:100%;max-width:900px;border-radius:18px;overflow:hidden;box-shadow:0 30px 70px -20px rgba(0,0,0,.5);animation:rise .3s both;}
    .modal.wide{max-width:1140px;}
    .mhead{background:var(--navy);color:#fff;padding:18px 22px;display:flex;align-items:center;gap:10px;}
    .mhead h3{font-family:'Barlow',sans-serif;font-weight:700;font-size:19px;margin:0;flex:1;}
    .mhead .x{background:rgba(255,255,255,.12);border:0;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:grid;place-items:center;}
    .mhead .x:hover{background:rgba(255,255,255,.22);}
    .mtabs{display:flex;gap:6px;padding:14px 22px 0;}
    .mtabs button{font-family:'Barlow',sans-serif;font-weight:600;font-size:14px;border:0;background:none;color:var(--mut);padding:9px 14px;border-radius:9px 9px 0 0;cursor:pointer;display:flex;align-items:center;gap:7px;}
    .mtabs button.on{color:var(--navy);background:#fff;border:1px solid var(--line);border-bottom:0;}
    .mbody{padding:22px 28px 28px;max-height:88vh;overflow-y:auto;}
    .prev.ok{background:#d8f0e3;color:#0a6b41;border-radius:10px;padding:12px 14px;font-size:13px;margin-top:12px;}
    .prev.err{background:#fbe7e4;color:#a8362a;border-radius:10px;padding:12px 14px;font-size:13px;margin-top:12px;}
    .mfoot{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}
    .meta-grid.three{grid-template-columns:1fr 1fr 1fr;}
    .meta-grid label{font-size:12px;color:var(--mut);display:block;margin-bottom:3px;font-weight:600;}
    .meta-grid input{width:100%;border:1px solid var(--line);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;color:var(--ink);background:#fff;outline:none;}
    .meta-grid input:focus{border-color:var(--accent);}
    .race-ctrl{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
    .race-ctrl span{font-size:13px;color:var(--mut);font-weight:600;}
    .stepper{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:var(--ink);}
    .stepper button{width:28px;height:28px;border:1px solid var(--line);border-radius:7px;background:#fff;cursor:pointer;display:grid;place-items:center;color:var(--navy);transition:.1s;}
    .stepper button:hover{background:var(--sky);}
    .rtable-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;}
    .rtable{width:100%;border-collapse:collapse;font-size:12.5px;}
    .rtable thead th{background:var(--navy);color:#fff;font-family:'Barlow',sans-serif;font-weight:600;padding:8px 4px;text-align:center;font-size:11px;white-space:nowrap;}
    .rtable thead th.l{text-align:left;padding-left:8px;}
    .rtable thead th.calc{background:#1a4a7a;}
    .rtable tbody td{border-bottom:1px solid var(--line);padding:0;}
    .rtable tbody tr:last-child td{border-bottom:0;}
    .rtable tbody td input{width:100%;border:0;outline:none;font:inherit;font-size:12.5px;padding:7px 5px;background:transparent;color:var(--ink);}
    .rtable tbody td input:focus{background:#eef4fb;}
    .rtable tbody td.del-td{width:28px;text-align:center;border-left:1px solid var(--line);}
    .rtable tbody td.calc-td{background:#f0f5fb;text-align:center;padding:0 6px;font-variant-numeric:tabular-nums;}
    @keyframes rise{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
    @keyframes fade{from{opacity:0;}to{opacity:1;}}
    .scorecell{display:inline-flex;flex-direction:column;align-items:center;gap:1px;line-height:1.15;}
    .scorecell .snum{font-variant-numeric:tabular-nums;}
    .scorecell .scode{font-size:8px;font-weight:800;color:#e74c3c;letter-spacing:.04em;text-transform:uppercase;}

    .spin{animation:spin 1s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}
    /* Calendar — Apple Calendar style */
    .cal-modal{background:var(--paper);width:100%;max-width:1020px;border-radius:18px;overflow:hidden;box-shadow:0 30px 70px -20px rgba(0,0,0,.5);animation:rise .3s both;max-height:92vh;display:flex;flex-direction:column;}
    .cal-head{background:var(--navy);color:#fff;padding:14px 20px;display:flex;align-items:center;gap:10px;flex:none;}
    .cal-head h3{font-family:'Barlow',sans-serif;font-weight:700;font-size:18px;margin:0;flex:1;}
    .cal-head .x{background:none;border:0;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;display:grid;place-items:center;opacity:.85;transition:.12s;}
    .cal-head .x:hover{opacity:1;background:rgba(255,255,255,.14);}
    .cal-body{padding:0;overflow-y:auto;flex:1;display:flex;flex-direction:column;}
    .cal-toolbar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line);flex:none;flex-wrap:wrap;}
    .cal-nav{display:flex;align-items:center;gap:4px;}
    .cal-nav button{border:1px solid var(--line);background:#fff;border-radius:7px;width:30px;height:30px;cursor:pointer;display:grid;place-items:center;color:var(--navy);transition:.1s;}
    .cal-nav button:hover{background:var(--sky);}
    .cal-month-title{font-family:'Barlow',sans-serif;font-weight:700;font-size:18px;color:var(--navy);min-width:160px;text-align:center;}
    .cal-today-btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 13px;font:inherit;font-size:12px;font-weight:600;color:var(--navy);cursor:pointer;transition:.1s;}
    .cal-today-btn:hover{background:var(--sky);}
    .cal-grid-wrap{flex:1;overflow-y:auto;}
    .cal-month-scroll{flex:1;overflow-y:auto;}
    .cal-month-block{border-bottom:2px solid var(--line);}
    .cal-month-lbl{font-family:'Barlow',sans-serif;font-weight:800;font-size:15px;color:var(--navy);padding:8px 12px 6px;position:sticky;top:0;background:var(--paper);z-index:2;border-bottom:1px solid var(--line);}
    .cal-scroll{flex:1;overflow-y:auto;scroll-behavior:smooth;}
    .cal-month-block{border-bottom:8px solid var(--paper);}
    .cal-month-sticky{position:sticky;top:0;z-index:5;background:var(--paper);font-family:'Barlow',sans-serif;font-weight:800;font-size:16px;color:var(--navy);padding:10px 16px 8px;border-bottom:1px solid var(--line);}
    .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);border-left:1px solid var(--line);}
    .cal-dow{background:var(--navy);color:#bcd2e8;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:8px 4px;border-right:1px solid rgba(255,255,255,.1);}
    .cal-cell{border-right:1px solid var(--line);border-bottom:1px solid var(--line);min-height:100px;padding:6px;position:relative;background:#fff;transition:.1s;}
    .cal-cell.other-month{background:#f8fafc;}
    .cal-cell.today{background:#f0f7ff;}
    .cal-cell-num{font-family:'Barlow',sans-serif;font-weight:700;font-size:13px;color:var(--mut);margin-bottom:4px;width:24px;height:24px;display:grid;place-items:center;border-radius:50%;}
    .cal-cell-num.today-circle{background:var(--accent);color:#fff;}
    .cal-cell-ev{background:var(--accent);color:#fff;border-radius:4px;padding:2px 6px;font-size:10px;font-weight:700;cursor:pointer;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:.1s;}
    .cal-cell-ev:hover{opacity:.85;transform:translateY(-1px);}
    .cal-cell-ev.cls-29er{background:#163a63;}
    .cal-cell-ev.cls-ilca{background:#1a7a4a;}
    .cal-cell-ev.cls-optimist{background:#7a4a1a;}
    .cal-filters{display:flex;gap:8px;align-items:center;flex:1;flex-wrap:wrap;}
    .cal-ev{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:12px 16px;margin-bottom:8px;cursor:pointer;transition:.15s;display:flex;align-items:center;gap:14px;}
    .cal-ev:hover{border-color:#b9cee4;box-shadow:0 6px 20px -10px rgba(22,58,99,.4);transform:translateY(-1px);}
    .cal-ev-date{min-width:44px;text-align:center;background:var(--sky);border-radius:8px;padding:6px 4px;}
    .cal-ev-date .ced{font-family:'Barlow',sans-serif;font-weight:800;font-size:20px;color:var(--navy);line-height:1;}
    .cal-ev-date .cem{font-size:10px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;}
    .cal-ev-name{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;color:var(--ink);}
    .cal-ev-meta{font-size:12px;color:var(--mut);margin-top:2px;}
    /* Global search */
    .gsrch-wrap{flex:1;position:relative;}
    .gsrch{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.18);border-radius:10px;padding:7px 12px;transition:.2s;}
    .gsrch:focus-within{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.4);}
    .gsrch input{border:0;outline:0;font:inherit;font-size:13px;background:none;color:#fff;width:100%;}
    .gsrch input::placeholder{color:#9fbdd9;}
    .gsrch-drop{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 16px 40px -12px rgba(0,0,0,.28);z-index:50;overflow:hidden;animation:rise .15s both;}
    .gsrch-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:.12s;}
    .gsrch-item:hover{background:var(--sky);}
    .gsrch-item:not(:last-child){border-bottom:1px solid #f0f4f8;}
    .gsrch-item .gi-icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex:none;}
    .gsrch-item .gi-label{font-weight:600;font-size:13px;color:var(--ink);}
    .gsrch-item .gi-sub{font-size:11px;color:var(--mut);}
    /* Suggestions dropdown */
    .sug-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 30px -10px rgba(0,0,0,.18);z-index:40;overflow:hidden;animation:rise .12s both;}
    .sug-item{padding:9px 14px;cursor:pointer;font-size:13px;color:var(--ink);display:flex;align-items:center;gap:8px;transition:.1s;}
    .sug-item:hover{background:var(--sky);}
    .sug-item:not(:last-child){border-bottom:1px solid #f5f7fa;}
    .ai-srch-wrap{position:relative;flex:1;}
    /* Delete confirm */
    .del-confirm{position:fixed;z-index:80;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:0 12px 32px -10px rgba(0,0,0,.3);min-width:220px;animation:rise .15s both;}
    .del-confirm p{margin:0 0 10px;font-size:13px;color:var(--ink);font-weight:600;}
    .del-confirm .del-name{color:var(--navy);font-family:'Barlow',sans-serif;}
    .del-confirm-btns{display:flex;gap:8px;}
    /* AI search */
    .ai-srch{display:flex;align-items:center;gap:8px;background:#fff;border:1.5px solid var(--line);border-radius:10px;overflow:hidden;padding-left:12px;transition:.2s;}
    .ai-srch:focus-within{border-color:var(--accent);}
    .ai-srch input{flex:1;border:0;outline:0;font:inherit;font-size:13px;padding:9px 10px 9px 0;background:none;color:var(--ink);}
    .ai-srch input::placeholder{color:#9fb2c8;}
    .filter-chip{display:inline-flex;align-items:center;gap:6px;background:#eef4fb;border:1px solid #b9cee4;border-radius:20px;padding:4px 10px 4px 12px;font-size:12px;font-weight:600;color:var(--navy);margin-bottom:12px;}
    .filter-chip button{border:0;background:none;cursor:pointer;color:var(--mut);padding:0;display:flex;align-items:center;line-height:1;}
    .filter-chip button:hover{color:#c0392b;}
  `}</style>

  {/* ── TOPBAR ── */}
  <div className="topbar"><div className="topin">
    <div className="brand" onClick={goHome}><Link2 size={15}/></div>
    <span className="topsite" style={{cursor:"pointer"}} onClick={goHome}>Sailing</span>
    {navStack.length>0&&(
      <button onClick={navBack} title="Go back"
        style={{display:"inline-flex",alignItems:"center",gap:5,maxWidth:200,background:"rgba(255,255,255,.12)",color:"#fff",border:"1px solid rgba(255,255,255,.18)",borderRadius:8,padding:"6px 11px",fontSize:12.5,fontWeight:600,cursor:"pointer",marginLeft:4,whiteSpace:"nowrap",overflow:"hidden"}}>
        <ArrowLeft size={14} style={{flex:"none"}}/>
        <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{navLabelFor(navStack[navStack.length-1])}</span>
      </button>
    )}
    <div className="gsrch-wrap" onClick={e=>e.stopPropagation()}>
      <div className="gsrch">
        <Search size={14} color="#9fbdd9"/>
        <input
          placeholder="Search athletes, events, pages..."
          value={gSearch}
          onChange={e=>{setGSearch(e.target.value);setGSearchOpen(true);runGlobalSearch(e.target.value);}}
          onFocus={()=>setGSearchOpen(true)}
          onBlur={()=>setTimeout(()=>setGSearchOpen(false),150)}
          onKeyDown={e=>{
            if(e.key==="Escape"){setGSearch("");setGSearchOpen(false);}
            if(e.key==="Enter"&&gSearchResults.length){execGSearch(gSearchResults[0]);}
          }}
        />
        {gSearch&&<button style={{border:0,background:"none",cursor:"pointer",color:"#9fbdd9",padding:0,display:"flex"}} onClick={()=>{setGSearch("");setGSearchOpen(false);setGSearchResults([]);}}><X size={14}/></button>}
      </div>
      {gSearchOpen&&gSearchResults.length>0&&(
        <div className="gsrch-drop">
          {gSearchResults.map((r,i)=>(
            <div key={i} className="gsrch-item" onMouseDown={()=>execGSearch(r)}>
              <div className="gi-icon" style={{background:r.type==="athlete"?"#e8f4ff":r.type==="event"?"#f0f4ff":r.type==="portal"?"var(--sky)":"#f0f8f0"}}>
                {r.type==="athlete"?<Users size={14} color="#1a5e8a"/>:r.type==="event"?<Anchor size={14} color="#1a3e8a"/>:r.type==="portal"?<Waves size={14} color="var(--navy)"/>:<ChevronRight size={14} color="#0a6b41"/>}
              </div>
              <div>
                <div className="gi-label">{r.label}</div>
                <div className="gi-sub">{r.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    <nav className="nav">
      {DEV_VIEW_ENABLED&&devMode&&(
        <button onClick={()=>{setDevMode(false);try{localStorage.setItem("athlink_dev","0");}catch{}}}
          title="Developer view is ON — click to turn off (or Ctrl/Cmd+Shift+D)"
          style={{display:"inline-flex",alignItems:"center",gap:5,background:"#7c3aed",color:"#fff",border:0,borderRadius:7,fontWeight:700,fontSize:11,letterSpacing:".04em",padding:"4px 9px",cursor:"pointer"}}>
          <Pencil size={11}/>DEV
        </button>
      )}
      {portal&&<button className={view.name==="events"?"on":""} onClick={()=>go({name:"events"})}>Competitions</button>}
      {portal&&<button className={(view.name==="athletes"||view.name==="profile")?"on":""} onClick={()=>go({name:"athletes"})}>{cls?.short||"Class"} Athletes</button>}
      {auth
        ? <div style={{position:"relative"}}>
            <button onClick={()=>setAccountOpen(o=>!o)} style={{display:"inline-flex",alignItems:"center",gap:6}}>
              <span style={{width:24,height:24,borderRadius:"50%",background:"var(--accent)",color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>{(auth.profile?.display_name||auth.user?.email||"?").slice(0,1).toUpperCase()}</span>
              <span style={{textTransform:"capitalize"}}>{role}</span>
            </button>
            {accountOpen&&(<div style={{position:"absolute",right:0,top:"calc(100% + 6px)",background:"#fff",border:"1px solid var(--line)",borderRadius:10,boxShadow:"0 12px 30px -10px rgba(0,0,0,.25)",padding:8,minWidth:180,zIndex:80}}>
              <div style={{padding:"6px 10px",fontSize:12,color:"var(--mut)"}}>{auth.user?.email}</div>
              {role==="association"&&auth.profile?.class_id&&<div style={{padding:"2px 10px 8px",fontSize:12,color:"var(--mut)"}}>Manages: <b style={{color:"var(--navy)"}}>{(CLASSES.find(c=>c.id===auth.profile.class_id)?.short)||auth.profile.class_id}</b></div>}
              <button onClick={signOut} style={{width:"100%",textAlign:"left",border:0,background:"none",padding:"8px 10px",fontSize:13,cursor:"pointer",color:"var(--ink)",borderRadius:6}}>Sign out</button>
            </div>)}
          </div>
        : <button onClick={()=>setShowSignIn(true)}>Sign in</button>}
    </nav>
  </div></div>
  {showSignIn&&<SignInModal onClose={()=>setShowSignIn(false)} onAuthed={onAuthed}/>}
  {gSearchOpen&&<div style={{position:"fixed",inset:0,zIndex:45}} onClick={()=>setGSearchOpen(false)}/>}

  {/* ── HOME HERO (no portal) ── */}
  {!portal&&(
    <div className="home-hero">
      <div className="wrap">
        <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
          <h1 className="disp" style={{margin:0}}>Sailing</h1>
          <button className="btn sky" style={{fontSize:13,padding:"7px 13px"}} onClick={()=>{setCalClsSet(new Set());setShowCalendar(true);}}>
            <Calendar size={15}/>Calendar
          </button>
        </div>
        <p style={{marginTop:6}}>Results, athlete profiles and class standings for competitive sailing</p>
        <div className="home-tabs">
          <button className={view.name==="portals"?"on":""} onClick={()=>go({name:"portals"})}>Class Portals</button>
          <button className={(view.name==="athletes"||view.name==="profile")?"on":""} onClick={()=>go({name:"athletes"})}>All Athletes</button>
        </div>
      </div>
    </div>
  )}

  {/* ── HOME: Association portals grid ── */}
  {!portal&&view.name==="portals"&&(()=>{
    const matchA=a=>!homeQ||a.name.toLowerCase().includes(homeQ.toLowerCase())||a.cls.toLowerCase().includes(homeQ.toLowerCase());
    const renderCard=(a,i)=>{
      const ce=events.filter(e=>eventAssocs(e).includes(a.id));
      const cp=new Set();ce.forEach(ev=>ev.entries.forEach(e=>{if(e.helm)cp.add(e.helm);if(e.crew)cp.add(e.crew);}));
      const col=classColor(a.cls);
      const short=CLASSES.find(c=>c.id===a.cls)?.short||a.cls;
      return(<div className="class-card" key={a.id} style={{animationDelay:`${i*70}ms`}} onClick={()=>enterPortal(a.id)}>
        <span className="cls" style={{background:col,marginBottom:8,display:"inline-block"}}>{short}</span>
        <p className="class-name">{a.name}</p>
        <div className="class-stats"><div><b>{ce.length}</b>competitions</div><div><b>{cp.size}</b>athletes</div></div>
        <button className="btn cta" style={{width:"100%",justifyContent:"center"}} onClick={e=>{e.stopPropagation();enterPortal(a.id);}}>Enter portal <ChevronRight size={16}/></button>
      </div>);
    };
    const hk=ASSOCIATIONS.filter(a=>a.scope==="HK").filter(matchA);
    const intl=ASSOCIATIONS.filter(a=>a.scope==="INT").filter(matchA);
    return(
    <div className="wrap sec">
      <div className="toolbar" style={{marginBottom:14}}>
        <div className="srch">
          <Search size={16} color="#9fb2c8"/>
          <input placeholder="Search class associations…" value={homeQ} onChange={e=>setHomeQ(e.target.value)}/>
        </div>
      </div>
      {/* Global class portals — total results per class, across all associations */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:26}}>
        {CLASSES.map(c=>{
          const n=events.filter(e=>e.cls===c.id).length;
          const solid=classColor(c.id);
          return(
            <button key={c.id} onClick={()=>enterPortal("class:"+c.id)}
              style={{border:`1.5px solid ${classColorA(c.id,.45)}`,borderRadius:11,background:classColorA(c.id,.16),color:solid,cursor:"pointer",
                padding:"14px 12px",display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                fontFamily:"'Barlow',sans-serif",transition:".15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background=solid;e.currentTarget.style.color="#fff";e.currentTarget.style.borderColor=solid;}}
              onMouseLeave={e=>{e.currentTarget.style.background=classColorA(c.id,.16);e.currentTarget.style.color=solid;e.currentTarget.style.borderColor=classColorA(c.id,.45);}}>
              <span style={{fontWeight:800,fontSize:16,letterSpacing:".01em"}}>{c.short}</span>
              <span style={{fontSize:11,opacity:.85,fontWeight:600}}>{n} competition{n!==1?"s":""}</span>
            </button>
          );
        })}
      </div>
      {hk.length>0&&<>
        <p className="seclabel"><span style={{fontSize:16,marginRight:2}}>🇭🇰</span>Hong Kong Sailing Associations</p>
        <div className="classes-grid" style={{marginBottom:32}}>{hk.map(renderCard)}</div>
      </>}
      {intl.length>0&&<>
        <p className="seclabel"><Globe size={14}/>International Sailing Associations</p>
        <div className="classes-grid">{intl.map(renderCard)}</div>
      </>}
    </div>
    );
  })()}

  {/* ── PORTAL: Events list ── */}
  {portal&&view.name==="events"&&(
    <>
      <div className="strip"><div className="wrap">
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
          <h1 className="disp">{portalName}</h1>
          <button className="btn sky" style={{fontSize:13,padding:"7px 13px",marginTop:4}} onClick={()=>{setCalClsSet(cls?new Set([cls.id]):new Set());setShowCalendar(true);}}>
            <Calendar size={15}/>Calendar
          </button>
        </div>
        <div className="pillbar">
          <div className="pill"><Trophy size={16}/><b>{classEvents.length}</b> competitions</div>
          <div className="pill" style={{cursor:"pointer"}} onClick={()=>go({name:"athletes"})}><Users size={16}/><b>{people.length}</b> athletes</div>
        </div>
      </div></div>
      <div className="wrap sec">
        <button className="back" onClick={goHome}><ArrowLeft size={16}/>Sailing</button>
        <div className="toolbar" style={{marginBottom:8}}>
          <p className="seclabel" style={{margin:0,flex:1}}><Waves size={14}/>Results</p>
          {canEdit&&<button className="btn cta" onClick={()=>setOpen(true)}><Upload size={16}/>Import a competition</button>}
        </div>
        {evFilterActive&&(
          <div style={{marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div className="filter-chip">
              <Sparkles size={11}/>{evFilterActive.label}
              <button onClick={()=>{setEvFilterActive(null);setEvFilter("");}}><X size={13}/></button>
            </div>
          </div>
        )}
        <div style={{marginBottom:12}}>
          <div className="ai-srch-wrap">
            <div className="ai-srch">
              <Sparkles size={13} color={evFilterLoading?"#0d8ecf":"#9fb2c8"}/>
              <input
                placeholder="Smart filter — e.g. more than 30 boats, or Emily Polson"
                value={evFilter}
                onChange={e=>{
                  setEvFilter(e.target.value);
                  clearTimeout(evSugTimer);
                  setEvSugTimer(setTimeout(()=>fetchEvSuggestions(e.target.value),500));
                }}
                onKeyDown={e=>{
                  if(e.key==="Enter"){setEvSuggestions([]);runEvFilter();}
                  if(e.key==="Escape"){setEvFilter("");setEvSuggestions([]);setEvFilterActive(null);}
                }}
                onFocus={()=>{if(evFilter.length>=3)fetchEvSuggestions(evFilter);}}
              />
              {evFilterLoading&&<Loader2 size={13} className="spin" color="#0d8ecf"/>}
              {evFilter&&<button style={{border:0,background:"none",cursor:"pointer",color:"#9fb2c8",padding:0,display:"flex"}} onClick={()=>{setEvFilter("");setEvSuggestions([]);setEvFilterActive(null);}}><X size={13}/></button>}
            </div>
            {evSuggestions.length>0&&(
              <div className="sug-drop">
                {evSuggestions.map((s,i)=>(
                  <div key={i} className="sug-item" onClick={()=>{setEvFilter(s);setEvSuggestions([]);setTimeout(runEvFilter,50);}}>
                    <Sparkles size={11} color="#0d8ecf"/>{s}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
        {(()=>{
          const allFiltered=(evFilterActive
            ?classEvents.filter(ev=>{try{return evFilterActive.fn(ev,scoreEvent);}catch{return true;}})
            :classEvents)
            .slice().sort((a,b)=>{
              const da=a.date?.split('/').reverse().join('')||'';
              const db=b.date?.split('/').reverse().join('')||'';
              return db.localeCompare(da);
            });
          // Build items with year dividers
          const evItems=[];let lastYear=null;
          allFiltered.forEach((ev,i)=>{
            const yr=ev.date?.split('/')?.[2]||null;
            if(yr&&yr!==lastYear){evItems.push({type:'divider',year:yr});lastYear=yr;}
            evItems.push({type:'ev',ev,i});
          });
          const filtered=allFiltered;
          return(<>
            {evItems.map((item,idx)=>{
              if(item.type==='divider') return(
                <div key={"yr"+item.year} style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0 8px"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"var(--mut)",letterSpacing:".1em",fontFamily:"'Barlow',sans-serif"}}>{item.year}</span>
                  <div style={{flex:1,height:1,background:"var(--line)"}}/>
                </div>
              );
              const{ev,i}=item;
              const s=scoreEvent(ev);const isDraft=ev.status==="Draft";
              return(<div className={`ev${isDraft?" draft":""}`} key={ev.id} style={{animationDelay:`${i*60}ms`}} onClick={()=>go({name:"event",id:ev.id})}>
{(()=>{
                  const dp=ev.date?.split('/');
                  const hasDate=dp&&dp.length===3&&dp[0]&&dp[2];
                  return(<div style={{display:"flex",alignItems:"center",gap:6}}>
                    {hasDate&&<div className="evicon-year">
                      {dp[2].split('').map((ch,ci)=><span key={ci}>{ch}</span>)}
                    </div>}
                    {hasDate
                      ?<div className="evicon-date">
                          <span className="eid">{dp[0]}</span>
                          <span className="eim">{MON[parseInt(dp[1])-1]||""}</span>
                        </div>
                      :<div className="evicon"><Anchor size={20}/></div>}
                  </div>);
                })()}
                <div style={{flex:1,minWidth:0}}>
                  <p className="evname">{ev.name}</p>
                  <div className="evmeta">
                    <span><MapPin size={13}/>{ev.country?<CountryTag code={ev.country}/>:"—"}</span>
                    <span><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--accent)",textDecoration:"underline dotted"}} title="Open calendar" onClick={()=>openCalendarAt(ev.date)}>{formatDate(ev.date)}</span></span>
                    <span><Users size={13}/>{s.fleet} boats · {s.races} races</span>
                  </div>
                </div>
                {isDraft&&<span className="draftbadge"><Clock size={11}/> Draft</span>}
                {(()=>{const n=nuggetFor(ev.cls,ev.subclass);return <span className="cls" style={{background:n.color}}>{n.label}</span>;})()}
                <button className="delbtn" onClick={e=>deleteEvent(ev.id,ev.name,e)}><Trash2 size={16}/></button>
                <ChevronRight size={18} color="#9fb2c8"/>
              </div>);
            })}
            {filtered.length===0&&classEvents.length>0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No results match this filter. <button style={{border:0,background:"none",color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setEvFilterActive(null);setEvFilter("");}}>Clear filter</button></p>}
            {classEvents.length===0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No competitions yet. Import one to get started.</p>}
          </>);
        })()}
      </div>
    </>
  )}

  {/* ── PORTAL: Event detail ── */}
  {portal&&view.name==="event"&&(()=>{
    const ev=events.find(e=>e.id===view.id);if(!ev) return null;
    const s=scoreEvent(ev);const isDraft=ev.status==="Draft";
    return(<ErrorBoundary resetKey={ev.id} fallback={
      <div className="wrap sec" style={{paddingTop:26}}>
        <button className="back" onClick={()=>go({name:"events"})}><ArrowLeft size={16}/>All competitions</button>
        <div style={{padding:"40px 0",color:"var(--mut)"}}>Couldn't render this competition. <button className="btn ghost" style={{marginLeft:8,fontSize:13,padding:"5px 12px"}} onClick={()=>go({name:"events"})}>Go back</button></div>
      </div>}>
      <div className="wrap sec" style={{paddingTop:26}}>
      <button className="back" onClick={()=>go({name:"events"})}><ArrowLeft size={16}/>All competitions</button>
      {isDraft&&(
        <div className="draft-banner">
          <Clock size={22} color="#e8921a"/>
          <div style={{flex:1}}>
            <strong>Draft results — not yet official</strong>
            <p style={{fontSize:13}}>These results are provisional and excluded from athlete profiles until confirmed.</p>
          </div>
          <button className="btn green" onClick={()=>confirmDraft(ev.id)}><CheckCircle size={16}/>Confirm Results</button>
        </div>
      )}
      {(()=>{
        const hostIso=IOC_ISO[ev.country]||(ev.country&&ev.country.length===2?ev.country.toUpperCase():"");
        return(
        <div style={{display:"flex",alignItems:"stretch",gap:16,marginBottom:16}}>
          {hostIso&&(
            <div onClick={()=>setRegattaFootprint(ev)} title="Who's racing — click to expand"
              style={{width:118,flex:"none",cursor:"pointer",display:"flex",flexDirection:"column",justifyContent:"center"}}>
              <SailingGlobe countryData={{[hostIso]:1}} height={118} dark mini bare hostIso={hostIso}/>
            </div>
          )}
          <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",justifyContent:"center"}}>
            <h1 className="disp" style={{fontSize:24,margin:0}}>{ev.name}</h1>
            <div className="evmeta" style={{marginTop:8}}>
              <span><MapPin size={13}/>{ev.country?<CountryTag code={ev.country}/>:"—"}</span>
              <span><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--accent)",textDecoration:"underline dotted"}} title="Open calendar" onClick={()=>openCalendarAt(ev.date)}>{formatDate(ev.date)}</span></span>
              {(()=>{const n=nuggetFor(ev.cls,ev.subclass);return <span className="cls" style={{background:n.color}}>{n.label}</span>;})()}
            </div>
            {eventAssocs(ev).length>0&&(
              <div style={{marginTop:7,fontSize:12.5,color:"var(--mut)",display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                <Anchor size={12} style={{flex:"none"}}/>
                <span>Organized by {eventAssocs(ev).map((aid,i)=><React.Fragment key={aid}>
                  {i>0&&<span style={{color:"var(--mut)"}}> & </span>}
                  <b style={{color:"var(--accent)",fontWeight:600,cursor:"pointer"}} onClick={()=>enterPortal(aid)}>{assocName(aid)}</b>
                </React.Fragment>)}</span>
              </div>
            )}
          </div>
          <div style={{flex:"none",display:"flex",flexDirection:"column",justifyContent:"center",gap:8}}>
            {canEdit&&<button className="btn ghost" style={{fontSize:12,padding:"6px 12px",justifyContent:"flex-start"}} onClick={()=>openEditResults(ev)}><Pencil size={13}/>Edit results</button>}
          </div>
        </div>);
      })()}
      {/* Revealable, sponsor-focused competition summary */}
      <div style={{marginBottom:16}}>
        <button onClick={()=>{const open=!eventSummaryOpen[ev.id];setEventSummaryOpen(m=>({...m,[ev.id]:open}));if(open)fetchEventSummary(ev);}}
          style={{display:"inline-flex",alignItems:"center",gap:7,background:"var(--sky)",color:"var(--navy)",border:"0",borderRadius:9,
            fontSize:12.5,fontWeight:600,fontFamily:"'Barlow',sans-serif",padding:"7px 13px",cursor:"pointer"}}>
          <Sparkles size={14}/>About this competition
          <ChevronRight size={14} style={{transform:eventSummaryOpen[ev.id]?"rotate(90deg)":"none",transition:".15s"}}/>
        </button>
        {eventSummaryOpen[ev.id]&&(
          <div style={{marginTop:10,background:"var(--navy)",borderRadius:12,padding:"14px 16px",animation:"calFade .26s both"}}>
            <p className="seclabel" style={{color:"#9fbdd9",margin:"0 0 6px",fontSize:11}}><Sparkles size={12}/>Competition overview</p>
            {eventSummaries[ev.id]===null
              ? <div style={{color:"#9fbdd9",fontSize:13,fontStyle:"italic",opacity:.75,display:"flex",alignItems:"center",gap:6}}><Loader2 size={13} className="spin"/>Researching this competition…</div>
              : eventSummaries[ev.id]
                ? <p style={{color:"#dce8f8",fontSize:13.5,lineHeight:1.55,margin:0}}>{eventSummaries[ev.id]}</p>
                : <p style={{color:"#9fbdd9",fontSize:13,fontStyle:"italic",margin:0}}>Add ANTHROPIC_API_KEY to Vercel env vars to enable AI summaries.</p>}
            <p style={{color:"#6f93b8",fontSize:10.5,margin:"9px 0 0",fontStyle:"italic"}}>AI-generated from the event's level and fleet; verify specifics independently.</p>
          </div>
        )}
      </div>
      <div className="panel"><table>
        <thead><tr>
          <th>Pos</th><th className="l">Boat</th><th className="l">Sail #</th>
          {Array.from({length:s.races}).map((_,i)=><th key={i}>R{i+1}</th>)}
          <th>Net</th>
        </tr></thead>
        <tbody>{s.rows.map(r=>(
          <React.Fragment key={r.sail+r.helm}>
          <tr className={hoverRow?.evId===ev.id&&hoverRow?.helm===r.helm?"row-hover":""}
            onMouseEnter={()=>{
              setHoverRow({evId:ev.id,helm:r.helm});
              const ag=aggregate(r.helm,events);
              fetchHoverSummary(r.helm,ag,r.crew||null);
            }}
            onMouseLeave={()=>setHoverRow(null)}>
            <td className={`rk ${r.rank<=3?"p"+r.rank:""}`}>{r.rank}</td>
            <td className="l"><div className="boat">
              <div className="av" style={{background:avatarColor(r.helm)}}>{initials(r.helm)}</div>
              <div>
                <div className="namelink" onClick={()=>go({name:"profile",id:r.helm,fromEvent:ev.id})}>{r.helm}</div>
                <div className="cn">{r.crew&&<>with <span className="namelink" onClick={()=>go({name:"profile",id:r.crew,fromEvent:ev.id})}>{r.crew}</span></>}{r.div&&<span style={{marginLeft:r.crew?8:0,display:"inline-flex",verticalAlign:"middle"}}><DivNugget div={r.div}/></span>}</div>
              </div>
            </div></td>
            <td className="l sailcol">{r.nat?<>{iocFlag(r.nat)} {r.nat} {r.sail}</>:r.sail}</td>
            {Array.from({length:s.races}).map((_,i)=>{
              const c=r.races[i];
              if(c===undefined) return<td key={i} className="disc">–</td>;
              const codeLabel=r.race_codes?.[i]||null;
              const displayNum=isCode(c)?c:r.discardSet.has(i)?`(${c})`:c;
              return<td key={i} className={isCode(c)?"code":r.discardSet.has(i)?"disc":""}>
                {codeLabel&&!isCode(c)
                  ?<div className="scorecell"><span className="snum">{displayNum}</span><span className="scode">{codeLabel}</span></div>
                  :displayNum}
              </td>;
            })}
            <td className="net">{r.net}</td>
          </tr>
          {hoverRow?.evId===ev.id&&hoverRow?.helm===r.helm&&(()=>{
            const k=r.crew?`${r.helm}+${r.crew}`:r.helm;const v=hoverSummaries[k];
            return(<tr className="summary-row"><td colSpan={s.races+4} style={{padding:0,border:0,background:"none"}}>
              <div className={`team-summary${v===null?" loading":""}`}>
                <Sparkles size={14} style={{flex:"none",marginTop:1,color:"var(--accent)"}}/>
                <span>{v===null?"Generating team summary…":(v===undefined||v==="")?"AI summary unavailable.":v}</span>
              </div></td></tr>);
          })()}
          </React.Fragment>
        ))}</tbody>
      </table></div>
      <p style={{fontSize:12,color:"var(--mut)",marginTop:12,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><span>( ) = discard · red = penalty code</span></p>
    </div></ErrorBoundary>);
  })()}

  {/* ── ATHLETES (portal + global) ── */}
  {(portal||(!portal&&(view.name==="athletes"||view.name==="profile")))&&view.name==="athletes"&&(
    <div className="wrap sec" style={{paddingTop:26}}>
      {portal&&<button className="back" onClick={()=>go({name:"events"})}><ArrowLeft size={16}/>{portalName}</button>}
      <div style={{display:"flex",alignItems:"baseline",gap:16,marginBottom:4,flexWrap:"wrap"}}>
        <h1 className="disp" style={{fontSize:25,margin:0}}>{athleteTitle} <span style={{fontSize:17,fontWeight:400,color:"var(--mut)"}}>{currentPeople.length}</span></h1>
        {portal&&<button className="btn sky" style={{fontSize:13,padding:"6px 12px"}} onClick={()=>{setPortal(null);go({name:"athletes"});}}>
          <Users size={14}/>All Athletes</button>}
      </div>
      <p style={{color:"var(--mut)",fontSize:14,margin:"0 0 18px"}}>One profile per athlete, built automatically from results.</p>
      <div className="toolbar">
        <div className="srch" style={{position:"relative"}}>
          {athleteSmartLoading?<Loader2 size={16} className="spin" color="#0d8ecf"/>:<Search size={16} color="#9fb2c8"/>}
          <input placeholder="Search athletes — name, country, or e.g. top 15 in the world championships"
            value={q} onChange={e=>setQ(e.target.value)}
            onKeyDown={e=>{
              if(e.key==="Enter"&&q.trim()) runAthleteSmart(q,currentPeople,isGlobal?events:classEvents);
              if(e.key==="Escape"){setQ("");setAthleteSmart(null);}
            }}/>
          {(q||athleteSmart)&&<button style={{border:0,background:"none",cursor:"pointer",color:"#9fb2c8",padding:0,display:"flex"}} onClick={()=>{setQ("");setAthleteSmart(null);}}><X size={15}/></button>}
        </div>
        <div className="seg">{(()=>{
          // Associations always see both tabs (so you can toggle back to All even
          // after clearing every duplicate). Non-association users see no tabs.
          const tabs=canEdit?["all","duplicates"]:["all"];
          if(tabs.length<2) return null;
          return tabs.map(f=>(
            <button key={f} className={filter===f?"on":""} onClick={()=>setFilter(f)}>
              <span style={{display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1.15}}>
                <span>{f[0].toUpperCase()+f.slice(1)}</span>
                <span style={{fontSize:9.5,fontWeight:600,opacity:.45,marginTop:1}}>{f==="duplicates"?visibleDupGroups.length:currentPeople.length}</span>
              </span>
            </button>
          ));
        })()}</div>
        {canEdit&&filter==="duplicates"&&visibleDupGroups.length>0&&(
          <button className="btn cta" style={{fontSize:13,padding:"7px 13px",whiteSpace:"nowrap"}} onClick={()=>{
            const keys=visibleDupGroups.map(g=>g.key);
            visibleDupGroups.forEach(g=>mergeGroup(g.names));
            setDismissedDups2(prev=>{const s=new Set(prev);keys.forEach(k=>s.add(k));return s;});
          }}>
            <Users size={14}/>Merge all
          </button>
        )}
      </div>
      {athleteSmart&&(
        <div className="filter-chip" style={{marginBottom:14}}>
          <Sparkles size={11}/>{athleteSmart.label}
          <button onClick={()=>{setAthleteSmart(null);setQ("");}}><X size={13}/></button>
        </div>
      )}
      {filter==="duplicates"&&canEdit&&(
        <div>
          <p style={{fontSize:13,color:"var(--mut)",marginBottom:16}}>Profiles whose names are close but differ in spelling — these need a human check. (Names that differ only by word order, capitals, accents, hyphens or stray punctuation are merged automatically.) Merging keeps the profile with more competitions and moves the other's results into it.</p>
          {(()=>{
            const dq=q.trim().toLowerCase();
            const shown=visibleDupGroups
              .filter(g=>!dq||g.names.some(nm=>nm.toLowerCase().includes(dq)));
            if(!shown.length) return <p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>{dq?"No duplicates match your search.":"No duplicates to review."}</p>;
            const MiniCard=({name,dim})=>{
              const ag=aggregate(name,events);
              const nat=athleteNat(name,events);
              return(
                <div className="acard" style={{flex:1,minWidth:0,opacity:dim?.75:1,cursor:"pointer"}} onClick={()=>go({name:"profile",id:name})}>
                  <div className="achead">
                    <div className="av" style={{background:avatarColor(name)}}>{initials(name)}</div>
                    <div style={{minWidth:0}}>
                      <div className="acn">{nat?<span style={{fontSize:17}}>{iocFlag(nat)}</span>:null} {name}</div>
                      <div className="cn" style={{marginTop:2}}>{nat?(ag.events>1?"Multi-event":""):""}</div>
                    </div>
                  </div>
                  <div className="acstat">
                    <div><b>{ag.events}</b>competitions</div><div><b>{ag.best?"#"+ag.best:"—"}</b>best</div>
                  </div>
                </div>
              );
            };
            return shown.map((g)=>{
              const key=g.key;
              const primary=g.names[0];
              const other=g.names[g.names.length-1];
              return(
                <div key={key} style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:14,padding:"16px",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",
                      color:"#b8860b",background:"#fdf6e3",borderRadius:6,padding:"3px 9px"}}>
                      <AlertCircle size={12}/>Review — spelling differs
                    </span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                    <MiniCard name={primary}/>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flex:"none"}}>
                      <ArrowLeft size={22} color="var(--accent)"/>
                      <span style={{fontSize:10,color:"var(--mut)",fontWeight:600,whiteSpace:"nowrap"}}>merge into</span>
                    </div>
                    <MiniCard name={other} dim/>
                  </div>
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
                    <button className="btn ghost" style={{fontSize:13,padding:"6px 14px"}}
                      onClick={()=>setDismissedDups2(prev=>{const s=new Set(prev);s.add(key);return s;})}>Don't merge</button>
                    <button className="btn cta" style={{fontSize:13,padding:"6px 14px"}}
                      onClick={()=>{mergeGroup(g.names);setDismissedDups2(prev=>{const s=new Set(prev);s.add(key);return s;});}}>
                      <Users size={14}/>Merge
                    </button>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
      {filter!=="duplicates"&&(()=>{
        const evScope=isGlobal?events:classEvents;
        const qlc=q.trim().toLowerCase();
        const shown=currentPeople
          .filter(p=>true)
          .filter(p=>{
            if(athleteSmart){
              try{ if(!athleteSmart.fn(athleteSummaryFor(p.name,evScope))) return false; }catch{}
            } else if(qlc){
              // live substring match on name OR country while no smart filter is set
              const nat=athleteNat(p.name,evScope);
              const cname=(GLOBE_NAMES[IOC_ISO[nat]]||nat||"").toLowerCase();
              if(!p.name.toLowerCase().includes(qlc)&&!cname.includes(qlc)) return false;
            }
            return true;
          });
        // group by nationality, country groups alphabetical, names alphabetical within
        const byCountry={};
        shown.forEach(p=>{
          const nat=athleteNat(p.name,isGlobal?events:classEvents);
          const key=nat||"ZZZ";
          if(!byCountry[key])byCountry[key]={nat,cname:GLOBE_NAMES[IOC_ISO[nat]]||nat||"Unknown",people:[]};
          byCountry[key].people.push(p);
        });
        const groups=Object.values(byCountry).sort((a,b)=>a.cname.localeCompare(b.cname));
        groups.forEach(g=>g.people.sort((a,b)=>a.name.localeCompare(b.name)));
        if(!shown.length) return <p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No athletes match.</p>;
        let gi=0;
        return groups.map(g=>(
          <div key={g.cname} style={{marginBottom:22}}>
            <div style={{display:"flex",alignItems:"center",gap:9,margin:"4px 0 11px"}}>
              <span style={{fontSize:18}}>{g.nat?iocFlag(g.nat):""}</span>
              <span style={{fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:15,color:"var(--navy)"}}>{g.cname}</span>
              <span style={{fontSize:12,color:"var(--mut)",fontWeight:600}}>{g.people.length}</span>
              <div style={{flex:1,height:1,background:"var(--line)"}}/>
            </div>
            <div className="agrid">
              {g.people.map(p=>{
                const ag=aggregate(p.name,isGlobal?events:classEvents);
                const nat=athleteNat(p.name,isGlobal?events:classEvents);
                const clsLabel=isGlobal?CLASSES.find(c=>c.id===p.cls)?.short:cls?.short;
                return(<div className="acard" key={p.name} style={{animationDelay:`${(gi++)*16}ms`}} onClick={()=>go({name:"profile",id:p.name})}>
                  <div className="achead">
                    <div className="av" style={{background:avatarColor(p.name)}}>{initials(p.name)}</div>
                    <div style={{minWidth:0}}>
                      <div className="acn">{nat?<span style={{fontSize:17}}>{iocFlag(nat)}</span>:null} {p.name}</div>
                      <div className="cn" style={{marginTop:2}}>{nat?(ag.events>1?"Multi-event":(clsLabel||"")):(clsLabel||"")}{!nat&&ag.events>1?" · multi-event":""}</div>
                    </div>
                  </div>
                  <div className="acstat">
                    <div><b>{ag.events}</b>competitions</div><div><b>{ag.best?"#"+ag.best:"—"}</b>best</div>
                  </div>
                </div>);
              })}
            </div>
          </div>
        ));
      })()}
    </div>
  )}

  {/* ── PROFILE ── */}
  {(portal||(!portal&&(view.name==="athletes"||view.name==="profile")))&&view.name==="profile"&&(()=>{
    const name=view.id;
    const p=currentPeople.find(x=>x.name===name)||{name};
    const ag=aggregate(name,events);
    const nat=athleteNat(name,events);
    return(<ErrorBoundary resetKey={name} fallback={
      <div className="wrap sec" style={{paddingTop:22}}>
        <button className="back" onClick={()=>go({name:"athletes"})}><ArrowLeft size={16}/>{athleteTitle}</button>
        <div style={{padding:"40px 0",color:"var(--mut)"}}>Couldn't render this profile. <button className="btn ghost" style={{marginLeft:8,fontSize:13,padding:"5px 12px"}} onClick={()=>go({name:"athletes"})}>Go back</button></div>
      </div>}>
      <div className="wrap sec" style={{paddingTop:22}}>
      {view.fromRegatta
        ? (()=>{const rev=events.find(e=>e.id===view.fromRegatta);return rev?<button className="back" onClick={()=>{go({name:"event",id:view.fromRegatta});setTimeout(()=>setRegattaFootprint(rev),0);}}><ArrowLeft size={16}/>{rev.name} — Who's racing</button>:null;})()
        : view.fromEvent
        ? (()=>{const fev=events.find(e=>e.id===view.fromEvent);return fev?<button className="back" onClick={()=>go({name:"event",id:view.fromEvent})}><ArrowLeft size={16}/>{fev.name}</button>:null;})()
        : <button className="back" onClick={()=>go({name:"athletes"})}><ArrowLeft size={16}/>{athleteTitle}</button>
      }
      {(()=>{
        // compute footprint + overview once, used by both the globe (right) and the strip (below)
        const countryCounts={};
        ag.history.forEach(h=>{
          const country=h.ev.country;
          if(country){const iso=IOC_ISO[country];if(iso)countryCounts[iso]=(countryCounts[iso]||0)+1;}
        });
        const hasFootprint=Object.keys(countryCounts).length>0;
        if(ag.events>0&&profileSummaries[name]===undefined) fetchFullProfileSummary(name,ag);
        const summary=profileSummaries[name];
        return(<>
          <div className="phead">
            <div style={{display:"flex",gap:20,alignItems:"flex-start",flex:1,minWidth:260}}>
              <div className="av" style={{background:avatarColor(name)}}>{initials(name)}</div>
              <div style={{flex:1,minWidth:0}}>
                <h1 className="pname disp" style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span>{nat&&<span className="pflag">{iocFlag(nat)}</span>}{name}</span>
                  <button className="btn sky" style={{fontSize:12,padding:"5px 10px",fontWeight:600}} onClick={()=>{setSailorCalName(name);setSailorCalClsSet(new Set());setShowSailorCal(true);}}>
                    <Calendar size={13}/>Calendar
                  </button>
                </h1>
                <div className="pmeta">
                  {p.cls?<span><Anchor size={14}/>{CLASSES.find(c=>c.id===p.cls)?.short||p.cls}</span>:null}
                  {(()=>{
                    const recent=ag.history[0]?.row;
                    if(!recent?.sail||recent.sail==="—") return null;
                    const sailNat=ag.history[0]?.row?.nat||nat;
                    return<span style={{fontWeight:600}}>{sailNat?<>{sailNat} </>:""}{recent.sail}</span>;
                  })()}
                </div>
                <div className="pstats">
                  <div><div className="v disp">{ag.events}</div><div className="k">Competitions</div></div>
                  <div><div className="v disp">{ag.best?"#"+ag.best:"—"}</div><div className="k">Best result</div></div>
                  <div><div className="v disp">{ag.podiums}</div><div className="k">Podiums</div></div>
                  <div><div className="v disp">{ag.wins}</div><div className="k">Race wins</div></div>
                </div>
                {/* Athlete overview — directly under the stats, left of the globe */}
                {ag.events>0&&(
                  <div style={{marginTop:16}}>
                    <p className="seclabel" style={{color:"#9fbdd9",margin:"0 0 6px",fontSize:11}}><Sparkles size={12}/>Athlete overview</p>
                    {summary===null
                      ?<div style={{color:"#9fbdd9",fontSize:13,fontStyle:"italic",opacity:.7,display:"flex",alignItems:"center",gap:6}}><Loader2 size={13} className="spin"/>Generating overview…</div>
                      :summary
                        ?<p style={{color:"#dce8f8",fontSize:13.5,lineHeight:1.55,margin:0}}>{summary}</p>
                        :<p style={{color:"#9fbdd9",fontSize:13,fontStyle:"italic",margin:0}}>
                          {profileSummaries[name]===""?"Add ANTHROPIC_API_KEY to Vercel env vars to enable AI overview.":"No data available yet."}
                        </p>}
                  </div>
                )}
              </div>
            </div>

            {/* Competition footprint — frameless globe on the right, click to expand */}
            {ag.events>0&&hasFootprint&&(
              <div style={{flex:"0 0 260px",maxWidth:"100%",cursor:"pointer"}} onClick={()=>setFootprintOpen(true)} title="Click to expand">
                <p className="seclabel" style={{color:"#9fbdd9",margin:"0 0 4px",fontSize:11}}><Globe size={12}/>Competition footprint</p>
                <div style={{position:"relative"}}>
                  <SailingGlobe countryData={countryCounts} height={220} dark bare/>
                  <div style={{position:"absolute",top:4,right:6,background:"rgba(8,24,45,.72)",color:"#dcecf8",fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:6,pointerEvents:"none"}}>Click to expand ⤢</div>
                </div>
              </div>
            )}
          </div>

          {/* expanded footprint popup */}
          {footprintOpen&&hasFootprint&&(
            <FootprintModal name={name} ag={ag} countryCounts={countryCounts} onClose={()=>setFootprintOpen(false)}/>
          )}
        </>);
      })()}
      <div style={{marginTop:22}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
          <p className="seclabel" style={{margin:0}}><Trophy size={14}/>Result history</p>
          <div className="ai-srch-wrap" style={{flex:1,minWidth:220,maxWidth:420}}>
            <div className="ai-srch">
              <Sparkles size={13} color={profileFilterLoading?"#0d8ecf":"#9fb2c8"}/>
              <input
                placeholder="Filter results — e.g. top 3 finishes, or 2023 events"
                value={profileFilter}
                onChange={e=>{
                  setProfileFilter(e.target.value);
                  clearTimeout(profileSugTimer);
                  setProfileSugTimer(setTimeout(()=>fetchProfileSuggestions(e.target.value),500));
                }}
                onKeyDown={e=>{
                  if(e.key==="Enter"){setProfileSuggestions([]);runProfileFilter();}
                  if(e.key==="Escape"){setProfileFilter("");setProfileSuggestions([]);}
                }}
              />
              {profileFilterLoading&&<Loader2 size={13} className="spin" color="#0d8ecf"/>}
              {profileFilter&&<button style={{border:0,background:"none",cursor:"pointer",color:"#9fb2c8",padding:0,display:"flex"}} onClick={()=>{setProfileFilter("");setProfileSuggestions([]);}}><X size={13}/></button>}
            </div>
            {profileSuggestions.length>0&&(
              <div className="sug-drop">
                {profileSuggestions.map((s,i)=>(
                  <div key={i} className="sug-item" onClick={()=>{setProfileFilter(s);setProfileSuggestions([]);setTimeout(()=>runProfileFilter(),50);}}>
                    <Sparkles size={11} color="#0d8ecf"/>{s}
                  </div>
                ))}
              </div>
            )}
          </div>
          {profileFilterChips.map((c,ci)=>(
            <div className="filter-chip" key={ci}>
              <Sparkles size={11}/>{c.label}
              <button onClick={()=>setProfileFilterChips(prev=>prev.filter((_,j)=>j!==ci))}><X size={13}/></button>
            </div>
          ))}
          {profileFilterChips.length>1&&(
            <button onClick={()=>setProfileFilterChips([])} style={{border:0,background:"none",color:"var(--mut)",fontSize:11.5,cursor:"pointer",textDecoration:"underline"}}>Clear all</button>
          )}
        </div>
        {(()=>{
          // recency order (newest first), mirroring the class-association layout
          const rows=(profileFilterChips.length
              ? ag.history.filter(h=>profileFilterChips.every(c=>{try{return c.fn(h,scoreEvent);}catch{return true;}}))
              : ag.history)
            .slice().sort((a,b)=>{
              const da=a.ev.date?.split('/').reverse().join('')||'';
              const db=b.ev.date?.split('/').reverse().join('')||'';
              return db.localeCompare(da);
            });
          return rows.map((h,i)=>{
            const dp=h.ev.date?.split('/');
            const hasDate=dp&&dp.length===3&&dp[0]&&dp[2];
            return(
            <div className="ev" key={h.ev.id+i} style={{animationDelay:`${i*60}ms`}} onClick={()=>go({name:"event",id:h.ev.id})}>
              <div className={`hrk ${h.row.rank<=3?"p"+h.row.rank:""}`} style={{flex:"none"}}>#{h.row.rank}<small>of {h.fleet}</small></div>
              {hasDate
                ?<div className="evicon-date"><span className="eid">{dp[0]}</span><span className="eim">{MON[parseInt(dp[1])-1]||""}</span></div>
                :<div className="evicon"><Anchor size={20}/></div>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
                  <p className="evname" style={{margin:0}}>{h.ev.name}</p>
                  <span className={"rolechip "+h.role.toLowerCase()}>{h.role}</span>
                </div>
                <div className="evmeta" style={{marginTop:3}}>
                  <span><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--accent)",textDecoration:"underline dotted"}} onClick={(e)=>{e.stopPropagation();openSailorCalAt(h.ev.date,name);}}>{formatDate(h.ev.date)}</span></span>
                  <span><MapPin size={13}/>{h.ev.country?<CountryTag code={h.ev.country}/>:evLoc(h.ev)}</span>
                  {h.partner?<span><Users size={13}/>with <span className="namelink" onClick={(e)=>{e.stopPropagation();go({name:"profile",id:h.partner});}}>{h.partner}</span></span>:null}
                </div>
                <div className="miniraces">{h.row.races.map((rc2,j)=>{
                  const cls2=isCode(rc2)?"c":h.row.discardSet.has(j)?"d":rc2===1?"g1":rc2===2?"g2":rc2===3?"g3":"";
                  return<div key={j} className={`rc ${cls2}`}>{isCode(rc2)?rc2.slice(0,2):rc2}</div>;
                })}</div>
              </div>
              {(()=>{const cl=CLASSES.find(cl=>cl.id===h.ev.cls);return cl?<span className="cls" style={{background:classColor(h.ev.cls)}}>{cl.short}</span>:null;})()}
              <ChevronRight size={18} color="#9fb2c8"/>
            </div>);
          });
        })()}
        {ag.history.length===0&&<p style={{color:"var(--mut)",fontSize:14}}>No confirmed results found.</p>}
      </div>
    </div></ErrorBoundary>);
  })()}

  {/* ══ IMPORT MODAL ══════════════════════════════════════════ */}
  {open&&(
    <div className="ov" onClick={importStep==="preview"?undefined:closeImport}>
      <div className={`modal${importStep==="preview"?" wide":""}`} onClick={e=>e.stopPropagation()}>
        <div className="mhead">
          {importStep==="picker"&&<button className="x" onClick={()=>setImportStep("upload")} style={{marginRight:4}}><ArrowLeft size={16}/></button>}
          {importStep==="preview"&&!editResultsEv&&<button className="x" onClick={()=>{setPending([]);setActivePending(0);setPreviewEv(null);setImportStep(fleetChoices.length?"picker":"upload");}} style={{marginRight:4}}><ArrowLeft size={16}/></button>}
          {importStep==="preview"&&editResultsEv&&<button className="x" onClick={()=>{closeImport();setEditResultsEv(null);}} style={{marginRight:4}}><ArrowLeft size={16}/></button>}
          <Upload size={18}/>
          <h3>{importStep==="picker"?"Select fleet":importStep==="preview"?"Preview & edit results":"Import a competition"}</h3>
          <button className="x" onClick={closeImport}><X size={16}/></button>
        </div>

        {importStep==="upload"&&(<>
          <div className="mtabs">
            <button className={tab==="pdf"?"on":""} onClick={()=>setTab("pdf")}><FileText size={15}/>Upload PDF / HTML</button>
            <button className={tab==="manual"?"on":""} onClick={()=>setTab("manual")}><ClipboardPaste size={15}/>Manual entry</button>
          </div>
          <div className="mbody">
            {tab==="pdf"&&(<>
              <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 14px",lineHeight:1.55}}>Upload one or more results files (PDF or Sailwave HTML) — supports Sailwave, Manage2sail and more. You can select several at once; each gets its own editable tab. Multi-fleet files split into a tab per fleet.</p>
              <label className="btn cta" style={{cursor:"pointer"}}>
                {pdfLoading?<><Loader2 size={16} className="spin"/>Parsing…</>:<><Upload size={16}/>Choose Files</>}
                <input type="file" multiple accept="application/pdf,.html,text/html" style={{display:"none"}} disabled={pdfLoading} onChange={e=>handleFiles(e.target.files)}/>
              </label>
              {pdfError&&<div className="prev err" style={{marginTop:14}}><AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:5}}/>{pdfError}</div>}
            </>)}
            {tab==="manual"&&(<>
              {(()=>{const evCls=assoc?.cls||mf.cls;return(<>
              <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:200}}>
                  <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600}}>Event name</label>
                  <input value={mf.name} onChange={e=>updMeta("name",e.target.value)} placeholder="2025 29er Asian Championship" style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/>
                </div>
              </div>
              {SUBCLASSES[evCls]&&<div style={{marginBottom:12}}>
                <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600}}>Class type</label>
                <SubclassPicker cls={evCls} value={mf.subclass} onChange={v=>updMeta("subclass",v)}/>
              </div>}
              {/* Host country, date and discards on one row */}
              <div className="meta-grid three" style={{marginBottom:14}}>
                <div><label>Host Country</label><CountrySelect value={mf.club||""} onChange={v=>updMeta("club",v)}/></div>
                <div><label>Date</label>
                  <input value={mf.date} onChange={e=>updMeta("date",e.target.value)} placeholder="dd/mm/yyyy" maxLength={10}/>
                  {mf.date?.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)&&<span style={{fontSize:11.5,color:"var(--accent)",fontWeight:600,display:"block",marginTop:3}}>{formatDate(mf.date)}</span>}
                </div>
                <div><label>Discards</label><input type="number" min="0" max="10" value={mf.discards} onChange={e=>updMeta("discards",Math.max(0,parseInt(e.target.value)||0))}/></div>
              </div>
              <CollabPicker cls={evCls} owner={portal} value={mf.collabs} onChange={v=>updMeta("collabs",v)}/>
              </>);})()}
              <div className="race-ctrl">
                <span>Number of races</span>
                <div className="stepper">
                  <button onClick={()=>mf.numRaces>1&&setNumRaces(mf.numRaces-1)}><Minus size={13}/></button>
                  <span>{mf.numRaces}</span>
                  <button onClick={()=>mf.numRaces<20&&setNumRaces(mf.numRaces+1)}><Plus size={13}/></button>
                </div>
              </div>
              <div className="rtable-wrap">
                <table className="rtable">
                  <thead><tr>
                    <th className="l" style={{minWidth:110}}>Helm Name</th>
                    {!((assoc?.cls||mf.cls)==="ilca"||(assoc?.cls||mf.cls)==="optimist")&&<th className="l" style={{minWidth:110}}>Crew Name</th>}
                    <th style={{minWidth:46}}>Nat</th>
                    <th style={{minWidth:46}}>Sail</th>
                    <th style={{minWidth:140}}>Div</th>
                    {Array.from({length:mf.numRaces}).map((_,i)=><th key={i} style={{minWidth:34}}>R{i+1}</th>)}
                    <th className="calc" style={{minWidth:38}}>Total</th>
                    <th className="calc" style={{minWidth:38}}>Net</th>
                    <th style={{width:26}}></th>
                  </tr></thead>
                  <tbody>
                    {mf.rows.map((row,i)=>(
                      <tr key={i}>
                        <td className="l"><input value={row.helm} onChange={e=>updRow(i,"helm",e.target.value)} placeholder="Helm name"/></td>
                        {!((assoc?.cls||mf.cls)==="ilca"||(assoc?.cls||mf.cls)==="optimist")&&<td className="l"><input value={row.crew} onChange={e=>updRow(i,"crew",e.target.value)} placeholder="Crew name"/></td>}
                        <td><NatInput value={row.nat||""} onChange={v=>updRow(i,"nat",v)}/></td>
                        <td><input value={row.sail} onChange={e=>updRow(i,"sail",e.target.value)} placeholder="···" style={{textAlign:"center"}}/></td>
                        <td style={{padding:"4px 6px"}}><DivisionToggle value={row.div} onChange={v=>updRow(i,"div",v)} noMix={(assoc?.cls||mf.cls)==="ilca"||(assoc?.cls||mf.cls)==="optimist"}/></td>
                        {Array.from({length:mf.numRaces}).map((_,j)=>(
                          <td key={j}><input value={row.scores[j]||""} onChange={e=>updScore(i,j,e.target.value)} placeholder="–" style={{textAlign:"center"}}/></td>
                        ))}
                        <td className="calc-td" style={{fontSize:12,color:"var(--mut)",fontWeight:600}}>{manualCalc[i]?.total??<span style={{opacity:.3}}>—</span>}</td>
                        <td className="calc-td" style={{fontSize:12,color:"var(--navy)",fontWeight:700}}>{manualCalc[i]?.net??<span style={{opacity:.3}}>—</span>}</td>
                        <td className="del-td"><button style={{background:"none",border:0,color:"#c0392b",cursor:"pointer",padding:4,opacity:.55}} onClick={()=>delRow(i)}><X size={13}/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <button className="btn ghost" style={{fontSize:13,padding:"7px 12px"}} onClick={addRow}><Plus size={14}/>Add boat</button>
                <span style={{fontSize:11.5,color:"var(--mut)"}}>Codes: DNF DSQ UFD BFD DNC DNS OCS RET SCP STP DPI DNE NSC ZFP RDG</span>
              </div>
              <div className="mfoot">
                <button className="btn ghost" onClick={closeImport}>Cancel</button>
                <button className="btn cta" disabled={!manualReady} onClick={doImportManual}><Upload size={16}/>Import competition</button>
              </div>
            </>)}
          </div>
        </>)}

        {importStep==="picker"&&(
          <div className="mbody">
            <p style={{fontSize:14,color:"var(--mut)",margin:"0 0 4px"}}>Multiple fleets found in <strong style={{color:"var(--ink)"}}>{pdfMeta?.name}</strong>. Select which fleet to import, or combine all into one overall results page:</p>
            <div className="fleet-grid">
              {/* Overall Results option — merges all fleets, preserves PDF ranks */}
              <div className="fleet-card" style={{borderColor:"var(--accent)",background:"#f0f8ff"}} onClick={()=>{
                // Merge all fleets: combine entries, sort by pdf_rank if available
                const allEntries=[...fleetChoices.flatMap(f=>f.entries)];
                // Deduplicate by helm+sail
                const seen=new Set();
                const merged=allEntries.filter(e=>{const k=e.helm.toLowerCase()+e.sail;if(seen.has(k))return false;seen.add(k);return true;});
                // Sort by pdf_rank if available
                merged.sort((a,b)=>(a.pdf_rank??9999)-(b.pdf_rank??9999));
                const maxDisc=Math.max(...fleetChoices.map(f=>f.discards||1));
                buildPreviewFromFleet(pdfMeta.name,pdfMeta.date,{name:"",entries:merged,discards:maxDisc});
              }}>
                <div className="fname" style={{color:"var(--accent)"}}>🏆 Overall Results</div>
                <div className="fcount">{fleetChoices.reduce((s,f)=>s+f.count,0)} boats total · all {fleetChoices.length} fleets combined</div>
              </div>
              {fleetChoices.map((fleet,i)=>(
                <div key={i} className="fleet-card" onClick={()=>selectFleet(fleet)}>
                  <div className="fname">{fleet.name||"Unnamed fleet"}</div>
                  <div className="fcount">{fleet.count} boats · {fleet.discards} discard{fleet.discards!==1?"s":""}</div>
                </div>
              ))}
            </div>
            <div className="mfoot"><button className="btn ghost" onClick={closeImport}>Cancel</button></div>
          </div>
        )}

        {importStep==="preview"&&(pending.length>0||previewEv)&&(()=>{
          const scored=previewScored;
          const maxR=previewMaxRaces;
          const active=pending[activePending];
          const isError=active&&active.status==="error";
          const missingCells=previewEv&&previewEv.entries.some(e=>!e.helm||(e.races||[]).length<maxR);
          // Effective class for the table comes from the previewEv itself when set
          // by the per-result selector, else the portal association's class.
          const evCls=(previewEv?.cls)||assoc?.cls||"29er";
          const singleHanded=evCls==="ilca"||evCls==="optimist";
          // Detect fleet groups in pending (same fleetGroupId = same multi-fleet source file)
          const fleetGroupIds=[...new Set(pending.filter(p=>p.fleetGroupId).map(p=>p.fleetGroupId))];
          return(<div className="mbody">
            {/* ── Pending result tabs (multi-file import) ── */}
            {pending.length>1&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,borderBottom:"1px solid var(--line)",paddingBottom:10}}>
                {pending.map((p,i)=>(
                  <button key={p.id} onClick={()=>switchPending(i)}
                    style={{display:"inline-flex",alignItems:"center",gap:6,maxWidth:200,border:"1px solid "+(i===activePending?"var(--accent)":"var(--line)"),
                      background:i===activePending?"var(--accent)":(p.status==="error"?"#fdeceA":"#fff"),color:i===activePending?"#fff":(p.status==="error"?"#b3261e":"var(--navy)"),
                      borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap",overflow:"hidden"}}>
                    {p.status==="error"?<AlertCircle size={12} style={{flex:"none"}}/>:p.status==="parsing"?<Loader2 size={12} className="spin" style={{flex:"none"}}/>:<FileText size={12} style={{flex:"none"}}/>}
                    <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{p.previewEv?.name||p.name}</span>
                  </button>
                ))}
                {/* Combine fleets button — shown per fleet group */}
                {fleetGroupIds.map(gid=>{
                  const gItems=pending.filter(p=>p.fleetGroupId===gid);
                  if(gItems.length<2) return null;
                  return(
                    <button key={gid} onClick={()=>combineFleetGroup(gid)}
                      title={`Merge all ${gItems.length} fleets into one combined result`}
                      style={{display:"inline-flex",alignItems:"center",gap:5,border:"1px dashed var(--accent)",background:"#f0f8ff",color:"var(--accent)",
                        borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                      <Trophy size={12} style={{flex:"none"}}/>Combine {gItems.length} fleets → one result
                    </button>
                  );
                })}
              </div>
            )}
            {/* ── Unparseable file notice ── */}
            {isError&&(
              <div className="prev err" style={{marginBottom:12}}>
                <AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:6}}/>
                <b>Couldn't parse "{active.name}".</b> {active.error||""} Try exporting this result in a different format (Sailwave <b>HTML</b> or a text-based <b>PDF</b>) and uploading again.
                <div style={{marginTop:10}}>
                  <button className="btn ghost" style={{fontSize:12,padding:"5px 11px"}} onClick={()=>{
                    const remaining=pending.filter((_,i)=>i!==activePending);
                    setPending(remaining);
                    if(!remaining.length){closeImport();return;}
                    const ni=Math.min(activePending,remaining.length-1);setActivePending(ni);
                    const t=remaining[ni];if(t?.previewEv){setPreviewEv(t.previewEv);setMf(f=>({...f,subclass:t.subclass||null,collabs:t.collabs||[]}));}
                  }}>Dismiss this file</button>
                </div>
              </div>
            )}
            {!isError&&previewEv&&(<>
            <div className="preview-meta wide" style={{marginBottom:8}}>
              {previewEv?.ai_parsed&&<div style={{gridColumn:"1/-1",marginBottom:6,display:"flex",alignItems:"center",gap:6,background:"#f0f4ff",border:"1px solid #c5d3f8",borderRadius:7,padding:"5px 10px"}}>
                <Sparkles size={13} style={{color:"#3b5bdb",flex:"none"}}/>
                <span style={{fontSize:12,fontWeight:600,color:"#3b5bdb"}}>AI parsed</span>
                <span style={{fontSize:11,color:"#6278b5"}}>— This result was parsed by Gemini AI. Review all cells before publishing.</span>
              </div>}
              <div><label>Event name</label><input value={previewEv.name||""} onChange={e=>updPMeta("name",e.target.value)} className={!previewEv.name?"pmissing":""} placeholder="Event name"/></div>
              <div><label>Date</label><input value={previewEv.date||""} onChange={e=>updPMeta("date",e.target.value)} className={!previewEv.date?"pmissing":""} placeholder="dd/mm/yyyy"/></div>
              <div><label>Host Country</label><CountrySelect value={previewEv.venue||""} onChange={v=>updPMeta("venue",v)}/></div>
              <div><label>Discards</label><input type="number" min="0" max="20" value={previewEv.discards||1} onChange={e=>updPMeta("discards",parseInt(e.target.value)||1)}/></div>
            </div>
            {/* ── Per-result class type selector (reshapes the table) ── */}
            <div style={{marginBottom:10}}>
              <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600}}>Boat class</label>
              <div style={{display:"inline-flex",gap:6,flexWrap:"wrap"}}>
                {CLASSES.map(c=>{
                  const on=evCls===c.id;
                  return <button key={c.id} type="button" onClick={()=>{updPMeta("cls",c.id);updMeta("subclass",null);}}
                    style={{border:"1px solid "+(on?classColor(c.id):"var(--line)"),background:on?classColor(c.id):"transparent",
                      color:on?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:"5px 11px",cursor:"pointer"}}>{c.short}</button>;
                })}
              </div>
            </div>
            {SUBCLASSES[evCls]&&<div style={{marginBottom:10}}>
              <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600}}>Class type</label>
              <SubclassPicker cls={evCls} value={mf.subclass} onChange={v=>updMeta("subclass",v)}/>
            </div>}
            <div style={{marginBottom:10}}>
              <CollabPicker cls={evCls} owner={editResultsEv?previewEv.owner:portal} value={mf.collabs} onChange={v=>updMeta("collabs",v)}/>
            </div>
            {missingCells&&<p className="pmissing-hint"><AlertCircle size={13}/>Amber cells have missing data — click to edit before publishing.</p>}</>)}
            {!isError&&previewEv&&(<>
            <div className="preview-table-wrap">
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12.5px",minWidth:560}}>
                <thead>
                  <tr>
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 6px",textAlign:"center",fontSize:11}}>Pos</th>
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 8px",textAlign:"left",fontSize:11}}>Helm</th>
                    {!singleHanded&&<th style={{background:"var(--navy)",color:"#fff",padding:"9px 6px",textAlign:"left",fontSize:11}}>Crew</th>}
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 5px",textAlign:"left",fontSize:11}}>Sail</th>
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 6px",textAlign:"center",fontSize:11,minWidth:150}}>Div</th>
                    {Array.from({length:maxR}).map((_,i)=><th key={i} style={{background:"var(--navy)",color:"#fff",padding:"9px 4px",textAlign:"center",fontSize:11,minWidth:34}}>R{i+1}</th>)}
                    <th style={{background:"#1a4a7a",color:"#fff",padding:"9px 6px",textAlign:"center",fontSize:11}}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {previewEv.entries.map((entry,idx)=>{
                    const scoredRow=scored?.rows.find(r=>r.helm===entry.helm&&r.sail===entry.sail);
                    const rank=scoredRow?.rank;const net=scoredRow?.net;
                    return(<tr key={idx} style={{borderBottom:"1px solid var(--line)"}}>
                      <td style={{textAlign:"center",padding:"8px 5px",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:14,color:rank===1?"var(--gold)":rank===2?"#7d8a98":rank===3?"#a86a32":"var(--ink)"}}>{rank||"—"}</td>
                      <td style={{padding:"4px 6px",minWidth:110}}>
                        {previewEdit?.type==="helm"&&previewEdit.idx===idx
                          ?<input className="pe-input" autoFocus value={previewEditVal} onChange={e=>setPreviewEditVal(e.target.value)} onBlur={commitPreviewEdit} onKeyDown={e=>{if(e.key==="Enter")commitPreviewEdit();if(e.key==="Escape")setPreviewEdit(null);}}/>
                          :<div onClick={()=>startPreviewEdit("helm",idx,0,entry.helm)} style={{cursor:"text",padding:"4px 2px",borderRadius:4,minHeight:24,background:!entry.helm?"#fffbec":"transparent",border:!entry.helm?"1.5px solid #e8921a":"1.5px solid transparent",fontSize:12,fontWeight:600,color:"var(--ink)"}}>{entry.helm||<span style={{color:"#e8921a",fontStyle:"italic"}}>missing</span>}</div>}
                      </td>
                      {!singleHanded&&<td style={{padding:"4px 6px",minWidth:100}}>
                        {previewEdit?.type==="crew"&&previewEdit.idx===idx
                          ?<input className="pe-input" autoFocus value={previewEditVal} onChange={e=>setPreviewEditVal(e.target.value)} onBlur={commitPreviewEdit} onKeyDown={e=>{if(e.key==="Enter")commitPreviewEdit();if(e.key==="Escape")setPreviewEdit(null);}}/>
                          :<div onClick={()=>startPreviewEdit("crew",idx,0,entry.crew)} style={{cursor:"text",padding:"4px 2px",borderRadius:4,minHeight:24,fontSize:12,color:"var(--mut)"}}>{entry.crew||<span style={{fontStyle:"italic",opacity:.4}}>—</span>}</div>}
                      </td>}
                      <td style={{padding:"4px 4px",textAlign:"left",minWidth:80,fontSize:12,color:"var(--mut)"}}>
                        {previewEdit?.type==="sail"&&previewEdit.idx===idx
                          ?<input className="pe-input" autoFocus value={previewEditVal} onChange={e=>setPreviewEditVal(e.target.value)} onBlur={commitPreviewEdit} onKeyDown={e=>{if(e.key==="Enter")commitPreviewEdit();if(e.key==="Escape")setPreviewEdit(null);}}/>
                          :<div onClick={()=>startPreviewEdit("sail",idx,0,entry.sail)} style={{cursor:"text",padding:"4px 2px",borderRadius:4,minHeight:24}}>
                            {entry.nat?<>{iocFlag(entry.nat)} {entry.nat} </>:""}{entry.sail||"—"}
                          </div>}
                      </td>
                      <td style={{padding:"4px 6px",textAlign:"center"}}>
                        <DivisionToggle value={entry.div} onChange={v=>updPEntry(idx,"div",v)} noMix={singleHanded}/>
                      </td>
                      {Array.from({length:maxR}).map((_,raceIdx)=>{
                        const score=(entry.races||[])[raceIdx];
                        const isMissing=score===null||score===undefined||score==="";
                        const isEditing=previewEdit?.type==="score"&&previewEdit.idx===idx&&previewEdit.raceIdx===raceIdx;
                        const isDisc=scoredRow?.discardSet?.has(raceIdx);
                        return(<td key={raceIdx} style={{padding:"4px 2px",textAlign:"center",minWidth:34,background:isMissing?"#fffbec":"transparent",border:isMissing?"1.5px solid #e8921a":"1.5px solid transparent",cursor:"text"}}>
                          {isEditing
                            ?<input className="pe-input" autoFocus style={{width:38}} value={previewEditVal} onChange={e=>setPreviewEditVal(e.target.value)} onBlur={commitPreviewEdit} onKeyDown={e=>{if(e.key==="Enter")commitPreviewEdit();if(e.key==="Escape")setPreviewEdit(null);}}/>
                            :<div onClick={()=>startPreviewEdit("score",idx,raceIdx,score)} style={{fontSize:12,color:isMissing?"#e8921a":isCode(score)?"#c0392b":isDisc?"var(--mut)":"var(--ink)",fontStyle:isMissing?"italic":"normal"}}>
                              {isMissing?"?":(isCode(score)?score:isDisc?`(${score})`:score)}
                            </div>}
                        </td>);
                      })}
                      <td style={{textAlign:"center",padding:"8px 6px",fontFamily:"'Barlow',sans-serif",fontWeight:700,color:"var(--navy)",fontSize:13}}>{net!==undefined?net:"—"}</td>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>
            <p style={{fontSize:11.5,color:"var(--mut)",margin:"8px 0 0"}}>Scores in ( ) are discards · red = penalty · click any cell to edit · Net updates live</p>
            <div className="mfoot" style={{marginTop:14}}>
              <button className="btn ghost" onClick={()=>{closeImport();setEditResultsEv(null);}}>Cancel</button>
              <button className="btn amber" onClick={()=>editResultsEv?saveEditedResults(true):importPreview(true)}><Clock size={16}/>Save as Draft</button>
              <button className="btn cta" onClick={()=>editResultsEv?saveEditedResults(false):importPreview(false)}><CheckCircle size={16}/>{editResultsEv?"Save changes":(pending.length>1?"Publish this result":"Confirm & Publish")}</button>
            </div>
            </>)}
          </div>);
        })()}
      </div>
    </div>
  )}

  {/* ── RACE CALENDAR MODAL ── */}
  {showCalendar&&(()=>{
    const calEvs=events.filter(ev=>calClsSet.size===0||calClsSet.has(ev.cls));
    const prevMonth=()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);};
    const nextMonth=()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);};
    const goToday=()=>{const n=new Date();setCalYear(n.getFullYear());setCalMonth(n.getMonth());};
    const toggleCls=(id)=>{
      if(id==="all"){setCalClsSet(new Set());return;}
      setCalClsSet(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
    };
    return(
      <div className="ov" onClick={()=>setShowCalendar(false)}>
        <div className="cal-modal" onClick={e=>e.stopPropagation()}>
          <div className="cal-head">
            <Calendar size={18}/>
            <h3>Calendar</h3>
            <button className="x" onClick={()=>setShowCalendar(false)}><X size={16}/></button>
          </div>
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button onClick={()=>{calViewMode==="year"?setCalYear(y=>y-1):prevMonth();}}><ChevronRight size={14} style={{transform:"rotate(180deg)"}}/></button>
              <button className="cal-title-btn" onClick={()=>setCalViewMode(v=>v==="year"?"month":"year")}>{calViewMode==="year"?calYear:`${MON[calMonth]} ${calYear}`}</button>
              <button onClick={()=>{calViewMode==="year"?setCalYear(y=>y+1):nextMonth();}}><ChevronRight size={14}/></button>
            </div>
            <button className="cal-today-btn" onClick={()=>{goToday();setCalViewMode("month");}}>Today</button>
            <div className="cal-filters">
              <div className="seg">
                <button className={calClsSet.size===0?"on":""} onClick={()=>toggleCls("all")}
                  style={calClsSet.size===0?{background:"var(--navy)",color:"#fff"}:{}}>All</button>
                {CLASSES.map(({id,short})=>{
                  const on=calClsSet.has(id);
                  return<button key={id} className={on?"on":""} onClick={()=>toggleCls(id)}
                    style={on?{background:classColor(id),color:"#fff"}:{color:classColor(id)}}>{short}</button>;
                })}
              </div>
            </div>
          </div>
          <div className="cal-legend" style={{padding:"8px 16px",borderBottom:"1px solid var(--line)",flex:"none"}}>
            <span style={{fontWeight:700,letterSpacing:".05em",textTransform:"uppercase",fontSize:10.5,color:"var(--mut)"}}>Class</span>
            {CLASSES.map(cl=><span key={cl.id} className="lg"><span className="dot" style={{background:classColor(cl.id)}}/>{cl.short}</span>)}
          </div>
          <CalendarBody events={calEvs} allEvents={events} year={calYear} month={calMonth}
            setYear={setCalYear} setMonth={setCalMonth} viewMode={calViewMode} setViewMode={setCalViewMode}
            onPick={(ev)=>{setShowCalendar(false);setPortal(ev.owner||null);go({name:"event",id:ev.id});}}/>
        </div>
      </div>
    );
  })()}

  {/* ── SAILOR CALENDAR MODAL ── */}
  {showSailorCal&&(()=>{
    const baseEvs=events.filter(ev=>ev.entries.some(e=>e.helm===sailorCalName||e.crew===sailorCalName));
    const sailorEvs=baseEvs.filter(ev=>sailorCalClsSet.size===0||sailorCalClsSet.has(ev.cls));
    const prevM=()=>{if(sailorCalMonth===0){setSailorCalMonth(11);setSailorCalYear(y=>y-1);}else setSailorCalMonth(m=>m-1);};
    const nextM=()=>{if(sailorCalMonth===11){setSailorCalMonth(0);setSailorCalYear(y=>y+1);}else setSailorCalMonth(m=>m+1);};
    const goTodayS=()=>{const n=new Date();setSailorCalYear(n.getFullYear());setSailorCalMonth(n.getMonth());};
    const toggleSCls=(id)=>{
      if(id==="all"){setSailorCalClsSet(new Set());return;}
      setSailorCalClsSet(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
    };
    return(
      <div className="ov" onClick={()=>setShowSailorCal(false)}>
        <div className="cal-modal" onClick={e=>e.stopPropagation()}>
          <div className="cal-head">
            <Calendar size={18}/>
            <h3>{sailorCalName} — Calendar</h3>
            <button className="x" onClick={()=>setShowSailorCal(false)}><X size={16}/></button>
          </div>
          <div className="cal-toolbar">
            <div className="cal-nav">
              <button onClick={()=>{sailorCalViewMode==="year"?setSailorCalYear(y=>y-1):prevM();}}><ChevronRight size={14} style={{transform:"rotate(180deg)"}}/></button>
              <button className="cal-title-btn" onClick={()=>setSailorCalViewMode(v=>v==="year"?"month":"year")}>{sailorCalViewMode==="year"?sailorCalYear:`${MON[sailorCalMonth]} ${sailorCalYear}`}</button>
              <button onClick={()=>{sailorCalViewMode==="year"?setSailorCalYear(y=>y+1):nextM();}}><ChevronRight size={14}/></button>
            </div>
            <button className="cal-today-btn" onClick={()=>{goTodayS();setSailorCalViewMode("month");}}>Today</button>
            <div className="cal-filters">
              <div className="seg">
                <button className={sailorCalClsSet.size===0?"on":""} onClick={()=>toggleSCls("all")}
                  style={sailorCalClsSet.size===0?{background:"var(--navy)",color:"#fff"}:{}}>All</button>
                {CLASSES.map(({id,short})=>{
                  const on=sailorCalClsSet.has(id);
                  return<button key={id} className={on?"on":""} onClick={()=>toggleSCls(id)}
                    style={on?{background:classColor(id),color:"#fff"}:{color:classColor(id)}}>{short}</button>;
                })}
              </div>
            </div>
          </div>
          <div className="cal-legend" style={{padding:"8px 16px",borderBottom:"1px solid var(--line)",flex:"none"}}>
            <span style={{fontWeight:700,letterSpacing:".05em",textTransform:"uppercase",fontSize:10.5,color:"var(--mut)"}}>Class</span>
            {CLASSES.map(cl=><span key={cl.id} className="lg"><span className="dot" style={{background:classColor(cl.id)}}/>{cl.short}</span>)}
          </div>
          <CalendarBody events={sailorEvs} allEvents={baseEvs} year={sailorCalYear} month={sailorCalMonth}
            setYear={setSailorCalYear} setMonth={setSailorCalMonth} viewMode={sailorCalViewMode} setViewMode={setSailorCalViewMode}
            onPick={(ev)=>{setShowSailorCal(false);setPortal(ev.owner||null);go({name:"event",id:ev.id});}}
            eventLabel={(ev)=>{const e=ev.entries.find(e=>e.helm===sailorCalName||e.crew===sailorCalName);const s=scoreEvent(ev);const row=e?s.rows.find(r=>r.helm===e.helm&&r.sail===e.sail):null;return (row?`#${row.rank} `:"")+ev.name;}}/>
        </div>
      </div>
    );
  })()}

  {regattaFootprint&&(
    <ErrorBoundary resetKey={regattaFootprint.id}
      fallback={<div className="ov" onClick={()=>setRegattaFootprint(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440,padding:24,textAlign:"center"}}><p style={{margin:"0 0 14px",color:"var(--ink)",fontWeight:600}}>Couldn't open this regatta's map.</p><button className="btn cta" onClick={()=>setRegattaFootprint(null)}>Close</button></div></div>}>
      <RegattaFootprintModal event={regattaFootprint} homeCountry={homeCountry} onClose={()=>setRegattaFootprint(null)}
        onPickAthlete={(nm)=>{const evId=regattaFootprint.id;setRegattaFootprint(null);setPortal(regattaFootprint.cls);go({name:"profile",id:nm,fromRegatta:evId});}}/>
    </ErrorBoundary>
  )}

  {deleteConfirm&&(
    <div style={{position:"fixed",inset:0,zIndex:75}} onClick={()=>setDeleteConfirm(null)}>
      <div className="del-confirm" style={{top:Math.min(deleteConfirm.y+4,window.innerHeight-120),left:Math.max(deleteConfirm.x-230,8)}} onClick={e=>e.stopPropagation()}>
        <p>Remove <span className="del-name">"{deleteConfirm.name}"</span>?</p>
        <div className="del-confirm-btns">
          <button className="btn ghost" style={{flex:1,fontSize:12,padding:"6px 10px"}} onClick={()=>setDeleteConfirm(null)}>Cancel</button>
          <button className="btn" style={{flex:1,fontSize:12,padding:"6px 10px",background:"#e74c3c",color:"#fff"}} onClick={confirmDelete}><Trash2 size={13}/>Delete</button>
        </div>
      </div>
    </div>
  )}

  {editEvMeta&&(
    <div className="ov" onClick={()=>setEditEvMeta(null)}>
      <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
        <div className="mhead"><Pencil size={17}/><h3>Edit event details</h3><button className="x" onClick={()=>setEditEvMeta(null)}><X size={16}/></button></div>
        <div className="mbody">
          <div className="meta-grid" style={{gridTemplateColumns:"1fr"}}>
            <div><label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Event name</label>
            <input value={editEvMeta.name} onChange={e=>setEditEvMeta(m=>({...m,name:e.target.value}))} style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/></div>
          </div>
          <div className="meta-grid three" style={{marginTop:10}}>
            <div><label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Date</label>
            <input value={editEvMeta.date} onChange={e=>setEditEvMeta(m=>({...m,date:e.target.value}))} placeholder="dd/mm/yyyy" style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/></div>
            <div><label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Host Country</label>
            <CountrySelect value={editEvMeta.country||""} onChange={v=>setEditEvMeta(m=>({...m,country:v}))}/></div>
            <div><label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Discards</label>
            <input type="number" min="0" max="20" value={editEvMeta.discards} onChange={e=>setEditEvMeta(m=>({...m,discards:e.target.value}))} style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/></div>
          </div>
          <div className="mfoot" style={{marginTop:16}}>
            <button className="btn ghost" onClick={()=>setEditEvMeta(null)}>Cancel</button>
            <button className="btn cta" onClick={saveEvMeta}><CheckCircle size={15}/>Save changes</button>
          </div>
        </div>
      </div>
    </div>
  )}

  {note&&(<div className="notice"><div className="ico"><Sparkles size={18}/></div>
    <div><b>{note.name}</b>
    <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>
      {note.msg||`Matched ${note.matched} athletes · ${note.created} new profiles created`}
    </div></div></div>)}
  <div className="foot">Powered by AthLink</div>
  </div>
  );
}
