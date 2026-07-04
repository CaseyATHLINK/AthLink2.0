import React, { useState, useMemo, useEffect } from "react";
import { forceSimulation, forceManyBody, forceLink, forceCollide, forceX, forceY } from "d3-force";
import {
  Anchor, Trophy, Search, BadgeCheck, Upload, ChevronRight, MapPin,
  Calendar, Users, Waves, ArrowLeft, Flag, Loader2, Sparkles, Link2,
  X, FileText, ClipboardPaste, AlertCircle, Pencil, Trash2, Plus, Minus,
  CheckCircle, Clock, Eye, Home, Globe, Menu, User, LayoutGrid, Settings, Instagram
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
/* ── ConfirmModal: in-app replacement for window.confirm (liquid-glass) ──────
   Render when `state` is set; state = {title?, message, confirmLabel?, danger?, onConfirm}. */
function ConfirmModal({state,onClose}){
  if(!state) return null;
  const {title="Are you sure?",message,confirmLabel="Confirm",danger=true,onConfirm}=state;
  return(
    <div className="ov" onClick={onClose} style={{zIndex:120}}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400,overflow:"visible"}}>
        <div className="mhead" style={{padding:"16px 22px"}}>
          <AlertCircle size={18}/><h3 style={{flex:1}}>{title}</h3>
        </div>
        <div style={{padding:"18px 22px 22px"}}>
          <p style={{margin:"0 0 18px",fontSize:14,lineHeight:1.5,color:"var(--ink)",whiteSpace:"pre-line"}}>{message}</p>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn ghost" style={{fontSize:13}} onClick={onClose}>Cancel</button>
            <button className="btn" style={{fontSize:13,background:danger?"#e74c3c":"var(--accent)",color:"#fff",
              boxShadow:"inset 0 1px 0 rgba(255,255,255,.3),0 1px 3px rgba(0,0,0,.18)"}}
              onClick={()=>{onClose();onConfirm&&onConfirm();}}>{danger?<Trash2 size={14}/>:<CheckCircle size={14}/>}{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
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
// Sortable YYYYMMDD key from a dd/mm/yyyy-ish date string. Zero-pads 1-digit
// day/month (naive split-reverse-join mis-sorts "5/6/2024" vs "20/11/2024") and
// tolerates ranges like "12-15/06/2024" (uses the last complete d/m/yyyy found).
// Returns "" for missing/unparseable dates — callers must treat "" as "no date",
// NOT as "most recent" (the old code let the "—" placeholder outrank all digits).
function dateKey(str){
  const s=String(str||"");
  const re=/(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  let m,last=null;
  while((m=re.exec(s))) last=m;
  return last?last[3]+last[2].padStart(2,"0")+last[1].padStart(2,"0"):"";
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
  {id:"optimist",short:"OPTI",full:"Optimist"},
  {id:"49er",    short:"49er"},
];
// ── Custom boat classes (runtime registry, mirrors the host pattern) ──
// Beyond the four main CLASSES above. Each: {id, short, full, color, canonical}.
// In-memory only for now — seeded empty; DB persistence comes later.
// Accepted upload types for the import pop-up (file input `accept` + drop zone).
const IMPORT_ACCEPT=".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.xls,.csv,.html,.htm,.blw";
let CUSTOM_CLASSES=[];
// In-memory (session-scoped) snapshot of an unfinished import batch. Restored when
// the import pop-up is reopened within the same page session; cleared on successful
// publish/save-draft and when a fresh import batch starts. NOT persisted — page
// reload clears it by design (CLAUDE.md forbids dev-view localStorage/sessionStorage).
let IMPORT_DRAFT=null;
const customClassById=id=>CUSTOM_CLASSES.find(c=>c.id===id)||null;
// Normalise a class name → canonical key for dedup (lowercase, strip non-alphanumerics).
const canonClass=name=>String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
// Muted navy-palette colours auto-assigned to custom classes (no aggressive highlights).
const CUSTOM_CLASS_PALETTE=["#1f4e80","#0d8ecf","#5b6b80"];
// Best-effort readable text from a custom-class canonical slug, used only when no
// registry entry exists (e.g. after a refresh — custom classes are in-memory).
// Adds spaces at letter/number boundaries and uppercases; never the bare slug.
const prettifyClassSlug=(slug)=>{
  const s=String(slug||"").trim();
  if(!s) return "Custom class";
  return s.replace(/([a-z])([0-9])/gi,"$1 $2").replace(/([0-9])([a-z])/gi,"$1 $2").toUpperCase();
};
// Single source of truth for displaying ANY class id:
//   • main class  → its short/full from CLASSES
//   • custom class in the live registry → its stored (readable) short
//   • orphaned "custom:<slug>" id (no entry) → prefix stripped + prettified
// Never returns the literal "custom:" prefix.
const classLabel=(clsId)=>{
  const main=CLASSES.find(c=>c.id===clsId);
  if(main) return main.short||main.full||clsId;
  const cc=customClassById(clsId);
  if(cc) return cc.short||cc.full||clsId;
  if(typeof clsId==="string"&&clsId.startsWith("custom:")) return prettifyClassSlug(clsId.slice(7));
  return clsId;
};

// ── Associations: each portal is one association ──
// ── Hosts (associations, clubs, federations) ────────────────────────────────
// Hosts own/co-own events. Three types:
//   association — locked to one boat class (has `cls`)
//   club        — any class (no `cls`)
//   federation  — governing body of a country; auto-collaborates on every event
//                 hosted in its country (`country`), across all classes.
// These DEFAULT_* arrays are the always-present seeds; hosts added via dev mode
// are stored in Supabase (`hosts` table) and merged in at runtime.
const DEFAULT_ASSOCIATIONS=[
  {id:"hk-29er",     type:"association", scope:"HK",  cls:"29er",     name:"Hong Kong 29er Class Association"},
  {id:"hk-ilca",     type:"association", scope:"HK",  cls:"ilca",     name:"Hong Kong ILCA"},
  {id:"hk-optimist", type:"association", scope:"HK",  cls:"optimist", name:"Hong Kong Optimist Dinghy Association"},
  {id:"int-29er",    type:"association", scope:"INT", cls:"29er",     name:"International 29er Class Association"},
  {id:"int-ilca",    type:"association", scope:"INT", cls:"ilca",     name:"International Laser Class Association"},
  {id:"int-optimist",type:"association", scope:"INT", cls:"optimist", name:"International Optimist Dinghy Association"},
  {id:"int-49er",    type:"association", scope:"INT", cls:"49er",     name:"International 49er Class Association"},
];
const DEFAULT_CLUBS=[
  {id:"rhkyc", type:"club", scope:"HK", name:"Royal Hong Kong Yacht Club"},
];
const DEFAULT_FEDERATIONS=[
  {id:"hksf", type:"federation", scope:"HK", country:"HKG", name:"Hong Kong Sailing Federation"},
];
// Mutable runtime registries (defaults + DB-added). Rebuilt by applyDbHosts.
let ASSOCIATIONS=[...DEFAULT_ASSOCIATIONS];
let CLUBS=[...DEFAULT_CLUBS];
let FEDERATIONS=[...DEFAULT_FEDERATIONS];
// Merge DB host rows on top of the defaults (by id; defaults always win on id clash).
function applyDbHosts(rows){
  const norm=t=>(rows||[]).filter(r=>r.type===t).map(r=>({
    id:r.id, type:r.type, scope:r.scope||"HK", name:r.name,
    ...(r.cls?{cls:r.cls}:{}), ...(r.country?{country:r.country}:{}),
    ...(r.slug?{slug:r.slug}:{}),
  }));
  // DB rows are the source of truth: defaults seed first, DB overwrites on id clash.
  // (Seeded once via hosts_seed_migration.sql; defaults remain only as an
  //  emergency fallback if the hosts table is empty / unreachable.)
  const merge=(defs,extra)=>{const m=new Map();[...defs,...extra].forEach(h=>m.set(h.id,h));return[...m.values()];};
  ASSOCIATIONS=merge(DEFAULT_ASSOCIATIONS,norm("association"));
  CLUBS=merge(DEFAULT_CLUBS,norm("club"));
  FEDERATIONS=merge(DEFAULT_FEDERATIONS,norm("federation"));
}
// Optimistically add a single host to the runtime registry (before/while it
// persists to the DB) so its portal appears immediately.
function addHostLocal(h){
  const arr=h.type==="association"?ASSOCIATIONS:h.type==="club"?CLUBS:FEDERATIONS;
  if(!arr.some(x=>x.id===h.id)) arr.unshift(h);
}
function removeHostLocal(id){
  ASSOCIATIONS=ASSOCIATIONS.filter(a=>a.id!==id);
  CLUBS=CLUBS.filter(c=>c.id!==id);
  FEDERATIONS=FEDERATIONS.filter(f=>f.id!==id);
}
const assocById=id=>ASSOCIATIONS.find(a=>a.id===id);
const clubById=id=>CLUBS.find(c=>c.id===id);
const fedById=id=>FEDERATIONS.find(f=>f.id===id);
const isClubId=id=>!!clubById(id);
const isFedId=id=>!!fedById(id);
// Resolve any host id (association, club OR federation) to its record / name.
const hostById=id=>assocById(id)||clubById(id)||fedById(id)||null;

/* ── Clean-URL slugs & path <-> state mapping ─────────────────────────────
   Fully-flat scheme so links read cleanly and share well:
     /                     → AthLink landing (all sports) — handled by the shell
     /sailing              → sailing home (all portals)
     /<Host>               → that host's competitions   e.g. /HongKongSailingFederation
     /<Host>/athletes      → that host's athletes
     /<Athlete>            → an athlete profile          e.g. /CaseyLaw
     /athletes             → all athletes
     /ranking              → season ranking
     /event/<id>           → one competition
     /class/<clsId>[/athletes] → the per-class "all results" portal
   Resolution priority for a single segment: reserved word > host > athlete.
   Slugs are PascalCase, punctuation-stripped; matching is case-insensitive. */
const pascalSlug=(s)=>String(s||"").replace(/[^A-Za-z0-9]+/g," ").trim()
  .split(/\s+/).filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join("");
const slugKey=(s)=>pascalSlug(s).toLowerCase();
// A host's public slug: the editable hosts.slug if set, else PascalCase(name).
const hostSlug=(host)=>{const h=(host&&host.id)?host:hostById(host);
  return h?(h.slug||pascalSlug(h.name)):"";};
const hostBySlug=(slug)=>{const k=String(slug||"").toLowerCase();
  return [...ASSOCIATIONS,...CLUBS,...FEDERATIONS]
    .find(h=>(h.slug&&h.slug.toLowerCase()===k)||slugKey(h.name)===k)||null;};

/* ── Public athlete usernames (name_key ⇄ username) ────────────────────────
   Loaded from the athlete_usernames table; default is FirstnameLastname. The
   registry is a module-level mutable map so the routing helpers below (module
   scope) can read it. Falls back to PascalCase(name) for any not-yet-loaded
   name so URLs still work before/without the table. */
const uNameKey=(s)=>String(s||"").trim().toLowerCase();
let ATHLETE_USERNAMES={byKey:new Map(),byUser:new Map()};
function applyAthleteUsernames(rows){
  const byKey=new Map(),byUser=new Map();
  (rows||[]).forEach(r=>{ if(!r||!r.username) return;
    byKey.set(r.name_key,r.username);
    byUser.set(String(r.username).toLowerCase(),r.display_name||r.name_key);
  });
  ATHLETE_USERNAMES={byKey,byUser};
}
const usernameForName=(name)=>ATHLETE_USERNAMES.byKey.get(uNameKey(name))||pascalSlug(name);
const nameForUsername=(u)=>ATHLETE_USERNAMES.byUser.get(String(u||"").toLowerCase())||null;
const collectAthleteNames=(events)=>{const s=new Set();
  (events||[]).forEach(ev=>(ev.entries||[]).forEach(e=>{
    [e&&e.helm,e&&e.crew,e&&e.name,e&&e.helm_name,e&&e.crew_name].forEach(n=>{if(n)s.add(n);});
  }));return s;};
// Current {portal,view} → the path it should live at.
const stateToPath=(portal,view)=>{
  const v=view||{name:"portals"};
  if(v.name==="profile") return "/"+usernameForName(v.id||"");
  if(v.name==="event")   return "/competition/"+encodeURIComponent(v.id||"");
  if(v.name==="competitions") return v.cls?"/class/"+encodeURIComponent(v.cls):"/competitions";
  if(v.name==="hosts")   return "/hosts";
  if(v.name==="ranking") return "/rankings";
  const isClassPortal=portal&&String(portal).startsWith("class:");
  if(v.name==="athletes"){
    if(portal&&!isClassPortal) return "/"+hostSlug(portal)+"/athletes";
    if(isClassPortal) return "/class/"+encodeURIComponent(String(portal).slice(6))+"/athletes";
    if(v.cls) return "/class/"+encodeURIComponent(v.cls)+"/athletes";
    return "/athletes";
  }
  // events / portals home
  if(isClassPortal) return "/class/"+encodeURIComponent(String(portal).slice(6));
  if(portal) return "/"+hostSlug(portal);
  return "/sailing";
};
// A path → the {portal,view} it represents, or null if it resolves to nothing.
const pathToState=(pathname,athleteNames)=>{
  const seg=decodeURIComponent(pathname||"/").split("/").filter(Boolean);
  const s0=(seg[0]||"").toLowerCase();
  if(seg.length===0||s0==="sailing") return {portal:null,view:{name:"portals"}};
  if(s0==="athletes") return {portal:null,view:{name:"athletes"}};
  if(s0==="hosts")    return {portal:null,view:{name:"hosts"}};
  if(s0==="competitions") return {portal:null,view:{name:"competitions"}};
  if(s0==="ranking"||s0==="rankings")  return {portal:null,view:{name:"ranking"}};
  // "/competition/<id>" is canonical; "/event/<id>" kept as an alias so old shared links never break.
  if(s0==="event"||s0==="competition") return {portal:null,view:{name:"event",id:seg[1]}};
  if(s0==="class"){
    // Class is a filter, not a door: /class/<id> = Competitions filtered to that
    // class; /class/<id>/athletes = the global Athletes page under the same lens.
    const isAth=(seg[2]||"").toLowerCase()==="athletes";
    return {portal:null,view:{name:isAth?"athletes":"competitions",cls:seg[1]||""}};
  }
  const host=hostBySlug(seg[0]);
  if(host){
    const isAth=(seg[1]||"").toLowerCase()==="athletes";
    return {portal:host.id,view:{name:isAth?"athletes":"events"}};
  }
  // Athlete: match the registered username first, then fall back to a
  // PascalCase scan of loaded names (covers any not yet in the table).
  const byUser=nameForUsername(seg[0]);
  if(byUser) return {portal:null,view:{name:"profile",id:byUser}};
  if(athleteNames){
    const k=slugKey(seg[0]); let found=null;
    athleteNames.forEach(n=>{if(!found&&slugKey(n)===k)found=n;});
    if(found) return {portal:null,view:{name:"profile",id:found}};
  }
  return null;
};
const assocName=id=>hostById(id)?.name||id;
// Association → ISO country flag (HK gets a flag; International gets none)
const assocFlag=scope=>scope==="HK"?"🇭🇰":"";
// scope → governing country code (extend as more countries are added)
const SCOPE_COUNTRY={HK:"HKG"};
// The country an event is "hosted in": its own country code, else its owner's scope country.
const eventCountryCode=ev=>{
  if(ev.country) return String(ev.country).toUpperCase();
  return SCOPE_COUNTRY[hostById(ev.owner)?.scope]||"";
};
// Federations that govern an event (auto-collaborators): owner is a host in the
// federation's country, OR the event's host country matches the federation's.
const governingFeds=ev=>{
  const ownerCountry=SCOPE_COUNTRY[hostById(ev.owner)?.scope];
  const cc=eventCountryCode(ev);
  return FEDERATIONS.filter(f=>(ownerCountry&&ownerCountry===f.country)||(cc&&cc===f.country));
};
// All hosts that own/co-own an event, INCLUDING auto-collaborating federations.
const eventAssocs=ev=>[...new Set([ev.owner,...(ev.collabs||[]),...governingFeds(ev).map(f=>f.id)].filter(Boolean))];

// Dedup fingerprint: normalised name + date + class + sorted sail-number set.
// Two imports of the same regatta (by different hosts) collide here so we can
// link them instead of creating duplicates.
const eventFingerprint=ev=>{
  const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const sails=[...new Set((ev.entries||[]).map(e=>norm(e.sail)).filter(Boolean))].sort();
  return [norm(ev.name),norm(ev.date),norm(ev.cls||ev.class),sails.join(",")].join("|");
};
// A host's display location (IOC code): its explicitly-set country, else the
// most common country across the events it owns/co-owns. evList is all events.
const hostLocation=(hostId,evList)=>{
  const h=hostById(hostId);
  if(h?.country) return String(h.country).toUpperCase();
  const counts={};
  (evList||[]).forEach(ev=>{
    if(!eventAssocs(ev).includes(hostId)&&ev.owner!==hostId) return;
    const cc=eventCountryCode(ev); if(cc) counts[cc]=(counts[cc]||0)+1;
  });
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  if(top) return top[0];
  return SCOPE_COUNTRY[h?.scope]||null;
};

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
    {id:"opti",       label:"Optimist",              short:"OPTI",       color:"#2b2b2b"},
    {id:"opti-int",   label:"Optimist Intermediate", short:"OPTI Inter", color:"#6b6b6b"},
    {id:"opti-green", label:"Optimist Green",        short:"OPTI Green", color:"#a3a3a3"},
  ],
};
const subById=(cls,id)=>(SUBCLASSES[cls]||[]).find(s=>s.id===id);
// Nugget label + colour for an event (subclass overrides base class)
const nuggetFor=(cls,subclass)=>{
  const s=subById(cls,subclass);
  if(s) return{label:s.short||s.label,full:s.label,color:s.color};
  const c=CLASSES.find(c=>c.id===cls)||customClassById(cls);
  return{label:classLabel(cls),full:c?.full||classLabel(cls),color:classColor(cls)};
};

// Global class colour coding (used by calendar circles)
// Canonical class colours (refer to them by these names):
//   29er  -> "29er red"      (#E84855)
//   ILCA  -> "ILCA blue"     (#2E78C8, lightened so it's distinct from Optimist black)
//   Optimist -> "Optimist black" (#3D3D3D)
//   49er  -> "49er green"    (#5FAF4E)
const CLASS_COLOR={"29er":"#E84855","49er":"#5FAF4E","ilca":"#2E78C8","optimist":"#3D3D3D"};
const classColor=(cls)=>CLASS_COLOR[(cls||"").toLowerCase()]||customClassById(cls)?.color||"#5b6b80";
// Class colour at a given alpha (for translucent buttons that go solid on hover).
const classColorA=(cls,a)=>{
  const hex=classColor(cls).replace("#","");
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
};

// Sub-class picker (ILCA 4/6/7, Optimist fleets) — only shown for ILCA/Optimist events.
// Hover-reveal: renders the parent class button; when the class has SUBCLASSES and is
// selected (or hovered/focused), a pill row of subclass options is revealed inline just
// below the button. Picking one selects it and collapses the reveal; mouse-out closes
// after ~200ms (cancelled on re-enter) so users can travel into the popover. Keeps the
// same onChange contract as the old SubclassPicker (writes mf.subclass) so publish is
// untouched. `classBtn` is the already-styled parent-class button element.
function SubclassHover({cls,value,onChange,classBtn,active}){
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

// Date field with a persistent DD/MM/YYYY mask hint + a mini-calendar popover.
//  • value/onChange: a "DD/MM/YYYY" string (same contract as the plain input it replaces).
//  • markedDays: { "d/m/yyyy": [competitionName,…] } for the importing host — days that
//    already have competitions are dotted (dotColor) and carry a title tooltip. Reference
//    only; picking a marked day is allowed.
//  • className: forwarded to the <input> so ".pmissing" styling still works.
function DateField({value,onChange,markedDays={},dotColor="var(--navy2)",className=""}){
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
function CustomClassPicker({classes,value,disabled,onSelect,onAdd}){
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

// Host-card class pills. Shows the classes (main OR custom) a host has events in,
// resolved via classLabel/classColor. Caps the row at 4 pills; any extras collapse
// into a "+N" pill that reveals them in a small popover (keeps the row one line).
function HostClassPills({classIds}){
  const[open,setOpen]=React.useState(false);
  const ref=React.useRef();
  React.useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);
  },[]);
  const ids=classIds||[];
  const MAX=3;
  const shown=ids.slice(0,MAX);
  const extra=ids.slice(MAX);
  // When there are extras, fan the pills into an overlapping stack so they stay on
  // one row in line with the host pill: most-popular (first) sits at the back/bottom,
  // each later pill overlaps the one before it, and the "+N" pill rides on top at the
  // right. DOM order = paint order, so the +N lands in front and the back pill's left
  // edge still peeks out. A paper-coloured ring separates the overlapping pills.
  const stacked=extra.length>0;
  const OVER=-12; // overlap in px between adjacent pills when stacked
  // Separator ring uses the card's own background token (--mat-reg), so it reads as
  // the thumbnail surface showing between pills and shifts with the background colour.
  const ring={boxShadow:"0 0 0 2px var(--mat-reg),inset 0 1px 0 rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.18)"};
  return(
    <div ref={ref} style={{display:"flex",gap:stacked?0:4,alignItems:"center",flexWrap:"nowrap",justifyContent:"flex-end",position:"relative"}}>
      {shown.map((id,i)=><span key={id} className="cls"
        style={{background:classColor(id),...(stacked?{marginLeft:i===0?0:OVER,...ring}:{})}}>{classLabel(id)}</span>)}
      {extra.length>0&&(<>
        <span onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} className="cls"
          title="Show more classes" style={{background:"#2c3444",cursor:"pointer",marginLeft:OVER,...ring}}>+{extra.length}</span>
        {open&&(
          <div onClick={e=>e.stopPropagation()}
            style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:90,background:"var(--card)",border:"1px solid var(--line)",borderRadius:10,boxShadow:"0 12px 30px -10px rgba(0,0,0,.25)",padding:8,display:"flex",flexWrap:"wrap",gap:4,maxWidth:220,justifyContent:"flex-end"}}>
            {extra.map(id=><span key={id} className="cls" style={{background:classColor(id)}}>{classLabel(id)}</span>)}
          </div>
        )}
      </>)}
    </div>
  );
}

// Collaboration picker — tickbox reveals a type-to-search dropdown of other
// hosts. `kind` selects the pool: "association" → only associations,
// "club" → only clubs. Both pickers share ONE `value` (collabs) array; each
// only displays/edits its own kind and preserves the other kind's entries.
// One search field over a host pool (associations or clubs). Shared chips above.
function CollabSearchField({pool,owner,selected,onAdd,onRemove,placeholder,noMatch,heading}){
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
function CollabPicker({owner,value,onChange}){
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

/* ── gender + age-category (real fields, with legacy-div fallback) ─────────
   Entries now carry real `gender` ('M'|'F'|'Mix') and `category` ('U17','Jr'…)
   fields from parser v5. Older events stored both inside the free `div` string,
   so genderCatOf() prefers the real fields and falls back to parsing div. */
function normGender(raw){
  const s=String(raw||"").toLowerCase().replace(/[^a-z]/g,"");
  if(!s) return "";
  if(["m","male","man","men","boy","boys"].includes(s)) return "M";
  if(["f","female","woman","women","w","girl","girls","lady","ladies"].includes(s)) return "F";
  if(["mix","mixed","x","mf","fm"].includes(s)) return "Mix";
  return "";
}
function normCategory(raw){
  const s=String(raw||"").trim(); if(!s) return "";
  const low=s.toLowerCase();
  if(["open","overall","main","all","mixed","m","f","-","—"].includes(low)) return "";
  if(/\b(gold|silver|bronze|emerald|sapphire)\b/.test(low)) return "";
  let m=low.match(/\bu[\s-]?(\d{1,2})\b/); if(m) return "U"+m[1];
  m=low.match(/\bunder[\s-]?(\d{1,2})\b/); if(m) return "U"+m[1];
  if(/\b(junior|jr|youth|cadet)\b/.test(low)) return "Jr";
  if(/\b(master|veteran|senior)s?\b/.test(low)) return "Mst";
  return s.length<=14?s.slice(0,12):"";
}
// Resolve the gender + category to display for an entry, preferring real fields.
function genderCatOf(e){
  if(!e) return {gender:"",category:""};
  let gender=normGender(e.gender);
  let category=normCategory(e.category);
  if(!gender||!category){
    const {gender:dg,jr}=parseDiv(e.div||"");
    if(!gender&&dg) gender=dg;
    if(!category&&jr) category="Jr";
  }
  return {gender,category};
}
// Infer a boat class id from a fleet/competition label (for multi-class imports).
function classFromFleetName(name){
  const s=String(name||"").toLowerCase();
  if(/49er/.test(s)) return "49er";
  if(/29er/.test(s)) return "29er";
  if(/\bilca\b|laser/.test(s)) return "ilca";
  if(/opti/.test(s)) return "optimist";
  return null;
}
// Interactive background: soft navy balls drifting & bouncing, pushed away by the cursor.
// Navy family matched to the header; low-res + blurred = smooth, cheap, muted.
function LiquidBackground(){
  const ref=React.useRef(null);
  const mouse=React.useRef({x:-9999,y:-9999,active:false});
  useEffect(()=>{
    const canvas=ref.current; if(!canvas) return;
    const ctx=canvas.getContext("2d"); if(!ctx) return;
    const SCALE=0.24; let W=1,H=1,raf=0;
    const balls=[];
    // Navy header family (dark -> mid blue).
    const palette=[[19,49,78],[31,78,128],[15,40,70],[40,92,150],[23,58,98],[28,70,120]];
    function resize(){
      W=Math.max(1,Math.round(window.innerWidth*SCALE));
      H=Math.max(1,Math.round(window.innerHeight*SCALE));
      canvas.width=W; canvas.height=H;
      if(balls.length===0){
        const base=Math.max(W,H);
        for(let i=0;i<13;i++) balls.push({x:Math.random()*W,y:Math.random()*H,
          vx:(Math.random()-0.5)*W*0.0018,vy:(Math.random()-0.5)*H*0.0018,
          r:base*(0.22+Math.random()*0.24),c:i%palette.length});
      }
    }
    resize();
    const onResize=()=>resize();
    const onMove=e=>{const cx=("touches"in e&&e.touches[0])?e.touches[0].clientX:e.clientX;const cy=("touches"in e&&e.touches[0])?e.touches[0].clientY:e.clientY;mouse.current.x=cx*SCALE;mouse.current.y=cy*SCALE;mouse.current.active=true;};
    const onLeave=()=>{mouse.current.active=false;};
    window.addEventListener("resize",onResize);
    window.addEventListener("pointermove",onMove,{passive:true});
    window.addEventListener("pointerleave",onLeave);
    function frame(){
      ctx.clearRect(0,0,W,H); ctx.globalCompositeOperation="lighter";
      const mx=mouse.current.x,my=mouse.current.y,R=Math.max(W,H)*0.32;
      for(const b of balls){
        // mouse repulsion (push the balls away)
        if(mouse.current.active){
          const dx=b.x-mx,dy=b.y-my,d2=dx*dx+dy*dy;
          if(d2<R*R){const d=Math.sqrt(d2)||1,f=(1-d/R);b.vx+=(dx/d)*f*0.6;b.vy+=(dy/d)*f*0.6;}
        }
        b.x+=b.vx; b.y+=b.vy; b.vx*=0.985; b.vy*=0.985;
        // gentle drift floor + bounce off edges
        const sp=Math.hypot(b.vx,b.vy), minSp=W*0.0006;
        if(sp<minSp){const a=Math.random()*6.283;b.vx+=Math.cos(a)*minSp;b.vy+=Math.sin(a)*minSp;}
        if(b.x<0&&b.vx<0)b.vx=-b.vx; if(b.x>W&&b.vx>0)b.vx=-b.vx;
        if(b.y<0&&b.vy<0)b.vy=-b.vy; if(b.y>H&&b.vy>0)b.vy=-b.vy;
        const c=palette[b.c], g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
        g.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},0.42)`);
        g.addColorStop(0.6,`rgba(${c[0]},${c[1]},${c[2]},0.12)`);
        g.addColorStop(1,`rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,6.283); ctx.fill();
      }
      raf=requestAnimationFrame(frame);
    }
    frame();
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",onResize);window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerleave",onLeave);};
  },[]);
  return <canvas ref={ref} className="al-liquid" aria-hidden="true"/>;
}
const GENDER_COLOR={M:"#2d6cc9",F:"#c2477f",Mix:"#7c3aed"};
// Magnetic hover: the label eases toward the cursor and springs back — the "warp around the cursor" feel.
function MagneticItem({children,onClick,className,strength=0.35}){
  const ref=React.useRef(null);
  const onMove=e=>{const el=ref.current;if(!el)return;const r=el.getBoundingClientRect();el.style.transform=`translate(${(e.clientX-(r.left+r.width/2))*strength}px,${(e.clientY-(r.top+r.height/2))*strength}px)`;};
  const reset=()=>{if(ref.current)ref.current.style.transform="translate(0,0)";};
  return <button type="button" className={className} onClick={onClick} onMouseMove={onMove} onMouseLeave={reset}>
    <span ref={ref} style={{display:"inline-block",transition:"transform .28s cubic-bezier(.2,.9,.2,1)",willChange:"transform"}}>{children}</span>
  </button>;
}
// Gender + category nuggets shown on every result page + the preview.
// `doublehanded` lets the nugget combine helm+crew remembered genders → Mixed.
function ResultNuggets({entry,size="md",doublehanded=false}){
  const {category}=genderCatOf(entry);
  const gender=resolvedEntryGender(entry,doublehanded);
  if(!gender&&!category) return null;   // no tag → show nothing (no dash)
  const fs=size==="sm"?9.5:10.5;
  const pad=size==="sm"?"1px 5px":"2px 6px";
  return <span style={{display:"inline-flex",gap:3,alignItems:"center",flexWrap:"wrap"}}>
    {gender&&<span style={{background:GENDER_COLOR[gender]||"var(--mut)",color:"#fff",borderRadius:980,fontSize:fs,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:pad,letterSpacing:".02em",boxShadow:"inset 0 1px 0 rgba(255,255,255,.45),0 1px 2px rgba(0,0,0,.12)"}} title={gender==="Mix"?"Mixed":gender==="F"?"Female":"Male"}>{gender}</span>}
    {category&&<span style={{background:"#0f8a7e",color:"#fff",borderRadius:980,fontSize:fs,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:pad,letterSpacing:".02em",boxShadow:"inset 0 1px 0 rgba(255,255,255,.45),0 1px 2px rgba(0,0,0,.12)"}} title={"Age category: "+category}>{category}</span>}
  </span>;
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
  const countries=new Set(ev.entries.map(e=>(e.nat||"").trim().toUpperCase()).filter(Boolean)).size;
  return{rows,fleet,races:Math.max(...ev.entries.map(e=>e.races.length)),countries};
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
    history.push({ev,row:{...row,nat:e.nat||""},role,partner,fleet:s.fleet,countries:s.countries});
  }
  // Sort newest-first via a robust YYYYMMDD key (dates are DD/MM/YYYY; new Date()
  // misreads that, which previously left history[0] = wrong "most recent").
  history.sort((a,b)=>dateKey(b.ev.date).localeCompare(dateKey(a.ev.date)));
  return{history,wins,podiums,best:best===Infinity?null:best,events:history.length};
}

// ── Per-athlete attribute memory (gender, birth year, recent class) ──────────
// Single pass over all events. For each athlete (by canonName), we remember:
//   gender    — the most-frequently-stated single gender across all their entries
//   birthYear — most-frequently-stated birth year
//   recentCls/recentSub — class of their most recent competition
// A person's own gender is a stable trait, so once stated anywhere it is applied
// everywhere that athlete appears (including events whose PDF omitted gender).
let ATHLETE_ATTRS=new Map();
function buildAthleteAttrs(evList){
  const m=new Map();
  for(const ev of (evList||[])){
    if(ev.status==="Draft") continue;
    const dk=dateKey(ev.date); // "" = undated; never allowed to claim recency
    for(const e of (ev.entries||[])){
      const gc=genderCatOf(e); // resolves real fields + legacy div
      // helm + crew, each with their own stated gender where derivable
      const pairs=[[e.helm,e.birth_year,gc.gender,"helm"],[e.crew,e.crew_birth_year,gc.gender,"crew"]];
      // When an entry's div implies a single gender (M/F), it applies to both
      // members; "Mix" does not pin either individual, so skip it for the registry.
      for(const [nm,by,g,which] of pairs){
        if(!nm) continue; const k=canonName(nm); if(!k) continue;
        let o=m.get(k); if(!o){o={gender:{},birthYear:{},recentDK:"",recentCls:null,recentSub:null};m.set(k,o);}
        if(g&&g!=="Mix") o.gender[g]=(o.gender[g]||0)+1;
        if(by) o.birthYear[by]=(o.birthYear[by]||0)+1;
        // Undated events may seed recentCls (better than nothing) but any DATED
        // event beats them; among dated events the latest date wins.
        if(dk?dk>=o.recentDK:!o.recentDK&&!o.recentCls){o.recentDK=dk;o.recentCls=ev.cls;o.recentSub=ev.subclass||null;}
      }
    }
  }
  const out=new Map();
  const top=obj=>{const e=Object.entries(obj);return e.length?e.sort((a,b)=>b[1]-a[1])[0][0]:null;};
  for(const [k,o] of m){
    out.set(k,{gender:top(o.gender),birthYear:o.birthYear&&top(o.birthYear)?parseInt(top(o.birthYear)):null,recentCls:o.recentCls,recentSub:o.recentSub});
  }
  ATHLETE_ATTRS=out;
  return out;
}
// Remembered gender for a single athlete name (or null).
function rememberedGender(name){
  const a=ATHLETE_ATTRS.get(canonName(name)); return a?.gender||null;
}
// Resolve the gender to SHOW for an entry, given a specific viewpoint:
//   - singlehanded / solo: the helm's remembered/ stated gender
//   - doublehanded: combine helm + crew remembered genders → M / F / Mix
// Falls back to whatever the entry itself states.
function resolvedEntryGender(e,doublehanded){
  const stated=genderCatOf(e).gender;
  if(doublehanded&&e.crew){
    const gh=rememberedGender(e.helm)||(stated&&stated!=="Mix"?stated:null);
    const gc=rememberedGender(e.crew)||(stated&&stated!=="Mix"?stated:null);
    if(gh&&gc) return gh===gc?gh:"Mix";
    if(stated) return stated;          // fall back to the entry's own div if we can't pin both
    return gh||gc||null;
  }
  // Solo (or no crew): prefer the person's remembered gender, else stated.
  return rememberedGender(e.helm)||stated||null;
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

// Most-frequently-seen birth year for an athlete (as helm or crew), or null.
function athleteBirthYear(name,evList){
  const counts={};
  for(const ev of (evList||[])){
    for(const e of (ev.entries||[])){
      let by=null;
      if(e.helm===name) by=e.birth_year;
      else if(e.crew===name) by=e.crew_birth_year;
      if(by){counts[by]=(counts[by]||0)+1;}
    }
  }
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  return top?parseInt(top[0]):null;
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
const sbPatch=async(t,f,b)=>{
  if(!sbH) return null;
  try{
    const r=await fetch(`${SB_URL}/rest/v1/${t}?${f}`,{method:"PATCH",headers:sbH,body:JSON.stringify(b)});
    if(!r.ok){const err=await r.text();console.error("Supabase PATCH error",r.status,err);return null;}
    const txt=await r.text(); return txt?JSON.parse(txt):[];
  }catch(e){console.error("Supabase PATCH network error",e);return null;}
};
const sbDel=async(t,f)=>{if(!sbH) return;await fetch(`${SB_URL}/rest/v1/${t}?${f}`,{method:"DELETE",headers:{...sbH,"Prefer":""}});};
// Reviewed duplicate pairs (see migrations/0006). Read to seed the hidden set;
// save so a "merge"/"don't merge" decision sticks across reloads and devices.
const fetchDupDismissals=()=>sbGet("dup_dismissals?select=key");
async function saveDupDismissals(keys){
  if(!sbH||!keys||!keys.length) return;
  try{await fetch(`${SB_URL}/rest/v1/dup_dismissals`,{method:"POST",
    headers:{...sbH,"Prefer":"resolution=ignore-duplicates"},
    body:JSON.stringify(keys.map(k=>({key:k})))});}
  catch(e){console.error("saveDupDismissals",e);}
}

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
  if(!r.ok){ const txt=await r.text().catch(()=>""); console.error("upsertProfile",r.status,txt); upsertProfile._lastError=txt||`HTTP ${r.status}`; return null; }
  upsertProfile._lastError=null; const rows=await r.json(); return rows[0]||null;
}
// Kick off Google OAuth — redirects to Google then back to the app.
// On return, the URL hash contains the session; AthLinkMVP picks it up on mount.
function authGoogleOAuth(){
  if(!SB_URL||!SB_KEY) return;
  const redirectTo=encodeURIComponent(window.location.origin+window.location.pathname);
  window.location.href=`${SB_URL}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`;
}

/* ── Host trust (host_members / host_invites / host_audit) ────────────────────
   All calls are token-scoped (RLS enforced). Helpers return parsed rows or null. */
async function hostRest(path,opts={},tok){
  if(!SB_URL||!SB_KEY) return null;
  try{
    const r=await fetch(`${SB_URL}/rest/v1/${path}`,{
      ...opts,
      headers:{...authHeaders(tok),"Prefer":opts.method&&opts.method!=="GET"?"return=representation":undefined,...(opts.headers||{})},
    });
    if(!r.ok){console.error("hostRest error",r.status,await r.text().catch(()=>""));return null;}
    const txt=await r.text(); return txt?JSON.parse(txt):[];
  }catch(e){console.error("hostRest network error",e);return null;}
}
// All membership rows for a host (active + pending), newest first.
const fetchHostMembers=(hostId,tok)=>hostRest(`host_members?host_id=eq.${encodeURIComponent(hostId)}&select=*&order=created_at.asc`,{},tok);
// Every membership for the current user (to compute their editable hosts).
const fetchMyMemberships=(userId,tok)=>hostRest(`host_members?user_id=eq.${userId}&select=*`,{},tok);
const fetchHostInvites=(hostId,tok)=>hostRest(`host_invites?host_id=eq.${encodeURIComponent(hostId)}&select=*&order=created_at.desc`,{},tok);
const fetchHostAudit=(hostId,tok)=>hostRest(`host_audit?host_id=eq.${encodeURIComponent(hostId)}&select=*&order=ts.desc&limit=50`,{},tok);
const fetchInviteByToken=(token,tok)=>hostRest(`host_invites?token=eq.${encodeURIComponent(token)}&select=*`,{},tok);
// Dev: every UNVERIFIED membership across all hosts (pending-approval queue).
const fetchUnverifiedMembers=(tok)=>hostRest("host_members?verified=eq.false&select=*&order=created_at.desc",{},tok);
// Dev: every profile row (for the all-profiles cleanup panel). Requires the
// admin SELECT policy (dev_admin_select_migration.sql) + being signed in as
// your admin account — otherwise RLS returns only your own row.
const fetchAllProfiles=(tok)=>hostRest("profiles?select=*&order=created_at.desc",{},tok);
// Dev: every host_members row (to show which hosts each profile belongs to).
const fetchAllMembers=(tok)=>hostRest("host_members?select=*",{},tok);
// Dev: hard-delete a profile and all its host memberships + claims.
async function devDeleteProfile(userId,tok){
  await hostRest(`host_members?user_id=eq.${userId}`,{method:"DELETE"},tok);
  await hostRest(`athlete_claims?user_id=eq.${userId}`,{method:"DELETE"},tok);
  await hostRest(`profiles?user_id=eq.${userId}`,{method:"DELETE"},tok);
}
// Resolve a set of user_ids to display names + account usernames. Reads profiles
// (first/last/display_name/username); falls back to the public_profiles view,
// then a short id. Returns {names:{user_id:name}, usernames:{user_id:username}}.
async function fetchProfileNames(ids,tok){
  const uniq=[...new Set((ids||[]).filter(Boolean))];
  if(!uniq.length) return {names:{},usernames:{}};
  const inList="("+uniq.map(encodeURIComponent).join(",")+")";
  const out={}; const unames={};
  // Try the full profiles table first (RLS may scope this).
  let rows=await hostRest(`profiles?user_id=in.${inList}&select=user_id,first_name,last_name,display_name,username`,{},tok);
  // Fall back to the public_profiles view for any ids not resolved.
  const got=new Set((rows||[]).map(r=>r.user_id));
  const missing=uniq.filter(id=>!got.has(id));
  let pub=[];
  if(missing.length&&!fetchProfileNames._noPublicView){
    const pin="("+missing.map(encodeURIComponent).join(",")+")";
    const res=await hostRest(`public_profiles?user_id=in.${pin}&select=user_id,display_name`,{},tok);
    if(res===null) fetchProfileNames._noPublicView=true; // view missing → stop retrying
    else pub=res||[];
  }
  const nameOf=(r)=>{
    const full=`${r.first_name||""} ${r.last_name||""}`.trim();
    return full||r.display_name||r.username||null;
  };
  (rows||[]).forEach(r=>{const n=nameOf(r); if(n) out[r.user_id]=n; if(r.username) unames[r.user_id]=r.username;});
  (pub||[]).forEach(r=>{if(!out[r.user_id]&&r.display_name) out[r.user_id]=r.display_name;});
  uniq.forEach(id=>{if(!out[id]) out[id]=`User ${id.slice(0,8)}`;});
  return {names:out,usernames:unames};
}
async function logHostAudit(hostId,actorId,action,targetId,detail,tok){
  return hostRest("host_audit",{method:"POST",body:JSON.stringify({host_id:hostId,actor_user_id:actorId,action,target_user_id:targetId||null,detail:detail||null})},tok);
}
function randToken(){
  // url-safe random token
  const a=new Uint8Array(18); (window.crypto||window.msCrypto).getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
// Human-typable short code: 8 chars from an unambiguous uppercase alphabet
// (no 0/O, 1/I/L, etc.) — safe to read aloud, type, and copy.
function randShortCode(){
  const alphabet="ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const a=new Uint8Array(8); (window.crypto||window.msCrypto).getRandomValues(a);
  return Array.from(a,b=>alphabet[b%alphabet.length]).join("");
}

/* ── Athlete claims (athlete_claims) ──────────────────────────────────────────
   Athletes claim their auto-built profile; any verified host admin whose events
   that athlete appears in can approve. Approved claims show a verified badge. */
const fetchAllClaims=(tok)=>hostRest("athlete_claims?select=*",{},tok);
const fetchMyClaims=(userId,tok)=>hostRest(`athlete_claims?user_id=eq.${userId}&select=*`,{},tok);
async function createClaim(profileName,userId,tok){
  return hostRest("athlete_claims",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify({profile_name:profileName,user_id:userId,status:"pending"})},tok);
}
async function decideClaim(claimId,approve,vouchUserId,hostId,tok){
  return hostRest(`athlete_claims?id=eq.${claimId}`,{method:"PATCH",body:JSON.stringify({
    status:approve?"approved":"denied",vouched_by:approve?vouchUserId:null,host_id:approve?hostId:null,
    decided_at:new Date().toISOString()})},tok);
}

/* ── Athlete profile extras (athlete_profiles) ────────────────────────────────
   Owner-editable presentation fields (bio, instagram, nationality override,
   photo) layered over the auto-built profile. Keyed by normalised name
   (lower+trim). Read is public; write is gated to the verified owner by RLS
   (see migrations/0004_athlete_profiles.sql). */
const profileNameKey=(name)=>String(name||"").trim().toLowerCase();
const fetchAllAthleteProfiles=(tok)=>hostRest("athlete_profiles?select=*",{},tok);
async function upsertAthleteProfile(name,patch,userId,tok){
  const row={name_key:profileNameKey(name),display_name:name,...patch,updated_by:userId,updated_at:new Date().toISOString()};
  return hostRest("athlete_profiles",{method:"POST",
    headers:{"Prefer":"resolution=merge-duplicates,return=representation"},
    body:JSON.stringify(row)},tok);
}
// Upload an athlete headshot to the public `athlete-photos` bucket; returns its
// public URL or null. Path: <name slug>/<timestamp>.<ext>.
async function uploadAthletePhoto(file,name,tok){
  if(!SB_URL||!file||!tok) return null;   // storage write needs a signed-in token
  const type=file.type||"image/jpeg";
  const ext=type.includes("png")?"png":type.includes("webp")?"webp":type.includes("gif")?"gif":"jpg";
  const slug=profileNameKey(name).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"athlete";
  const path=`${slug}/${Date.now()}.${ext}`;
  try{
    const r=await fetch(`${SB_URL}/storage/v1/object/athlete-photos/${path}`,{method:"POST",
      headers:{"apikey":SB_KEY,"Authorization":`Bearer ${tok}`,"Content-Type":type,"x-upsert":"true"},
      body:file});
    if(!r.ok){console.error("uploadAthletePhoto",r.status,await r.text().catch(()=>""));return null;}
    return `${SB_URL}/storage/v1/object/public/athlete-photos/${path}`;
  }catch(e){console.error("uploadAthletePhoto network",e);return null;}
}
// Upload a gallery media file (image OR video) to the public `athlete-media`
// bucket under a `<slug>/` prefix. Returns {url,type} or null. The bucket allows
// image + video MIME and a larger size cap than athlete-photos (see
// migrations/0010_athlete_media_bucket.sql); type is inferred from the MIME.
const ATHLETE_MEDIA_BUCKET="athlete-media";
async function uploadAthleteMedia(file,name,tok){
  if(!SB_URL||!file||!tok) return null;   // storage write needs a signed-in token
  const mime=file.type||"application/octet-stream";
  const isVideo=mime.startsWith("video/");
  const extMap={"image/png":"png","image/webp":"webp","image/gif":"gif","image/jpeg":"jpg","video/mp4":"mp4","video/quicktime":"mov","video/webm":"webm"};
  const ext=extMap[mime]||(isVideo?"mp4":"jpg");
  const slug=profileNameKey(name).replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"")||"athlete";
  const path=`${slug}/${Date.now()}-${Math.random().toString(36).slice(2,7)}.${ext}`;
  try{
    const r=await fetch(`${SB_URL}/storage/v1/object/${ATHLETE_MEDIA_BUCKET}/${path}`,{method:"POST",
      headers:{"apikey":SB_KEY,"Authorization":`Bearer ${tok}`,"Content-Type":mime,"x-upsert":"true"},
      body:file});
    if(!r.ok){console.error("uploadAthleteMedia",r.status,await r.text().catch(()=>""));return null;}
    return {url:`${SB_URL}/storage/v1/object/public/${ATHLETE_MEDIA_BUCKET}/${path}`,type:isVideo?"video":"image"};
  }catch(e){console.error("uploadAthleteMedia network",e);return null;}
}

/* ── Custom boat classes (custom_classes) ─────────────────────────────────────
   Persisted mirror of the in-memory CUSTOM_CLASSES registry. Read is public
   (anon SELECT allowed by RLS) so logged-out viewers still get labels/colours;
   insert is gated to verified hosts or admins (see migrations/0002).
   hostRest returns null on ANY failure (RLS, network) without throwing, so
   callers MUST check for null — a .catch alone never fires. Writes that fail
   (or happen while signed out, e.g. dev-mode imports) are queued in
   localStorage and re-tried on the next signed-in load, so a class can no
   longer be silently lost between sessions. */
const fetchCustomClasses=(tok)=>hostRest("custom_classes?select=*",{},tok);
async function insertCustomClass(cc,userId,tok){
  return hostRest("custom_classes",{method:"POST",
    headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify({id:cc.id,canonical:cc.canonical,short:cc.short,full:cc.full,color:cc.color,created_by:userId})},tok);
}
// Write-behind queue for custom classes that couldn't be persisted yet.
const PENDING_CC_KEY="athlink_pending_custom_classes";
function readPendingCustomClasses(){
  try{const a=JSON.parse(localStorage.getItem(PENDING_CC_KEY)||"[]");return Array.isArray(a)?a:[];}catch{return[];}
}
function queuePendingCustomClass(cc){
  try{
    const q=readPendingCustomClasses().filter(p=>p.canonical!==cc.canonical);
    q.push({id:cc.id,canonical:cc.canonical,short:cc.short,full:cc.full,color:cc.color});
    localStorage.setItem(PENDING_CC_KEY,JSON.stringify(q));
  }catch(e){console.error("queuePendingCustomClass",e);}
}
function dropPendingCustomClass(canonical){
  try{
    const q=readPendingCustomClasses().filter(p=>p.canonical!==canonical);
    localStorage.setItem(PENDING_CC_KEY,JSON.stringify(q));
  }catch(e){console.error("dropPendingCustomClass",e);}
}

/* ── Event claims (event_claims) ──────────────────────────────────────────────
   A host claims an externally-contributed event (one imported by another host
   and attributed to them as organizer). Any verified admin of the attributed
   host can approve; on approval the event's owner flips to that host and
   owner_confirmed becomes true, so it surfaces in their portal. Mirrors the
   athlete-claim flow. */
const fetchAllEventClaims=(tok)=>hostRest("event_claims?select=*",{},tok);
async function createEventClaim(eventId,hostId,userId,detail,tok){
  return hostRest("event_claims",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify({event_id:eventId,host_id:hostId||null,user_id:userId,status:"pending",detail:detail||null})},tok);
}
async function decideEventClaim(claimId,approve,vouchUserId,hostId,tok){
  return hostRest(`event_claims?id=eq.${claimId}`,{method:"PATCH",body:JSON.stringify({
    status:approve?"approved":"denied",vouched_by:approve?vouchUserId:null,host_id:approve?hostId:null,
    decided_at:new Date().toISOString()})},tok);
}

// Fetch invite by dedicated short_code column (exact, case-insensitive)
const fetchInviteByShortCode=(code,tok)=>hostRest(`host_invites?short_code=eq.${encodeURIComponent(code.toUpperCase())}&select=*`,{},tok);
// Mark invite used (single-use enforcement)
const markInviteUsed=(token,userId,tok)=>hostRest(`host_invites?token=eq.${encodeURIComponent(token)}`,{method:"PATCH",body:JSON.stringify({used_at:new Date().toISOString(),used_by:userId})},tok);

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
    owner_confirmed:ev.owner_confirmed!==false,imported_by:ev.imported_by||null,
    organizer_name:ev.organizer_name||null,fingerprint:ev.fingerprint||null,
    sources:Array.isArray(ev.sources)?ev.sources:(ev.sources?JSON.parse(ev.sources):[]),
    subclass:ev.subclass||null,
    entries:(ev.entries||[]).map(e=>({_dbId:e.id,sail:e.sail||"—",nat:e.nat||"",div:e.division||"",
      gender:e.gender||"",category:e.category||"",
      helm:e.helm_name,crew:e.crew_name||"",races:e.races||[],race_codes:e.race_codes||null,pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null,
      birth_year:e.birth_year??null,crew_birth_year:e.crew_birth_year??null}))};
}
async function saveEventToDb(ev){
  if(!sbH){console.warn("saveEventToDb: no Supabase connection");return null;}
  const evPayload={
    name:ev.name, class:ev.cls, doublehanded:!!ev.doublehanded,
    venue:ev.venue||null, country:ev.country||null, date:ev.date||null,
    discards:ev.discards||1, scoring:ev.scoring||null,
    source:ev.source||null, status:ev.status||"Final",
    owner:ev.owner||null, collabs:ev.collabs||[], subclass:ev.subclass||null,
    owner_confirmed:ev.owner_confirmed!==false, imported_by:ev.imported_by||null,
    organizer_name:ev.organizer_name||null, fingerprint:ev.fingerprint||null,
    sources:ev.sources||[],
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
      gender:e.gender||null,
      category:e.category||null,
      helm_name:e.helm||"",
      crew_name:e.crew||null,
      races:Array.isArray(e.races)?e.races:[],
      race_codes:e.race_codes||null,
      pdf_rank:e.pdf_rank||null,
      pdf_net:e.pdf_net||null,
      birth_year:e.birth_year||null,
      crew_birth_year:e.crew_birth_year||null,
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
      const headers=[...thead.querySelectorAll('th,td')].map(th=>th.textContent.trim().toLowerCase().replace(/[\s\n_()/'#.]+/g,''));
      const colIdx={};
      headers.forEach((h,i)=>{
        if(['rank','rk','pos','pl'].includes(h)) colIdx.rank??=i;
        else if(['helmname','helm','helmsname'].includes(h)) colIdx.helm??=i;
        else if(['crewname','crew','crewsname'].includes(h)) colIdx.crew??=i;
        else if(['sailno','sail','sailnumber'].includes(h)) colIdx.sail??=i;
        else if(['nat','nationality','country','sailprefix','prefix','natletter'].includes(h)) colIdx.nat??=i;
        else if(['division','div','category','agegroup','agecategory','agecat','group'].includes(h)) colIdx.category??=i;
        else if(['fleet','class','dinghyclass','dinghyclass/fleet','fleet/class','boatclass'].includes(h)) colIdx.div??=i;
        else if(['gender','sex','boatgender','gender(skipper)','genderskipper','helmgender','skippergender'].includes(h)) colIdx.gender??=i;
        else if(['crewgender','gender(crew)','gendercrew'].includes(h)) colIdx.crewgender??=i;
        else if(['nett','net','netpts'].includes(h)) colIdx.net??=i;
        else if(['total','totalpts'].includes(h)) colIdx.total??=i;
        else if(['yob','yearofbirth','birthyear','born','dob'].includes(h)) colIdx.yob??=i;
        else if(['crewyob','crewyearofbirth','crewbirthyear','crewborn'].includes(h)) colIdx.crewyob??=i;
        else if(['age','optiage','helmage','years'].includes(h)) colIdx.age??=i;
        else if(['crewage'].includes(h)) colIdx.crewage??=i;
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
        // Gender: boat/skipper column, else combine helm + crew gender columns.
        let gender=normGender(get(colIdx.gender));
        if(colIdx.crewgender!=null){
          const hg=normGender(get(colIdx.gender)),cg=normGender(get(colIdx.crewgender));
          gender=(hg&&cg)?(hg===cg?hg:"Mix"):(hg||cg||"");
        }
        const category=normCategory(get(colIdx.category));

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

        // Birth year: prefer an explicit YOB column; else derive from age + event year.
        const evYear=(()=>{const m=(evDate||'').match(/(20\d{2}|19\d{2})/)||bodyText.slice(0,400).match(/(20\d{2}|19\d{2})/);return m?parseInt(m[1]):null;})();
        const yobOf=(yobIdx,ageIdx)=>{
          const yraw=yobIdx!=null?get(yobIdx):'';
          const ym=String(yraw).match(/\b(19[3-9]\d|20[0-2]\d)\b/);
          if(ym) return parseInt(ym[1]);
          const araw=ageIdx!=null?get(ageIdx):'';
          const am=String(araw).match(/\b(\d{1,2})\b/);
          if(am&&evYear){const a=parseInt(am[1]);if(a>=5&&a<=99)return evYear-a;}
          return null;
        };
        const birth_year=yobOf(colIdx.yob,colIdx.age);
        const crew_birth_year=yobOf(colIdx.crewyob,colIdx.crewage);
        entries.push({helm,crew,sail,nat,div,gender,category,races,race_codes,pdf_rank:pdfRank,pdf_net:pdfNet,birth_year,crew_birth_year});
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
          if(!isNaN(yr)){ yrRef.current=yr; const lbl=document.getElementById("cal-cur-label"); if(lbl) lbl.textContent=String(yr); }
          break;
        }
      }
    };
    c.addEventListener("scroll",onScroll,{passive:true});
    return()=>c.removeEventListener("scroll",onScroll);
  },[viewMode]);

  // ── Month view: scroll to a month ONLY on first entry into month view, or when
  //    the change came from the year picker. NEVER re-scroll on scroll-driven
  //    updates — that was the source of the year-jump jerkiness.
  const didInitScrollRef=React.useRef(false);
  React.useEffect(()=>{
    if(viewMode!=="month"){didInitScrollRef.current=false;return;}
    if(!monthScrollRef.current) return;
    // Only auto-scroll when explicitly targeted (year-picker / nav), or once on enter.
    if(didInitScrollRef.current&&!navTargetRef.current){navTargetRef.current=true;return;}
    const el=monthScrollRef.current.querySelector(`[data-ym="${year}-${month}"]`);
    if(el){
      progScrollRef.current=true;
      clearTimeout(scrollTimerRef.current);
      el.scrollIntoView({block:"start",behavior:"instant"});
      scrollTimerRef.current=setTimeout(()=>{progScrollRef.current=false;},250);
    }
    didInitScrollRef.current=true;
    navTargetRef.current=false; // subsequent year/month changes are scroll-driven → no re-scroll
  },[year,month,viewMode]);

  // ── Month view: track the visible month WITHOUT triggering React re-renders or
  //    scroll-to effects. We update a ref (used as the year-toggle target) and set
  //    a tiny header label via direct DOM write — keeps the wheel perfectly smooth.
  React.useEffect(()=>{
    if(viewMode!=="month"||!monthScrollRef.current) return;
    const c=monthScrollRef.current;
    let ticking=false;
    const read=()=>{
      ticking=false;
      const cr=c.getBoundingClientRect();
      const anchor=cr.top+8;
      let pick=null;
      for(const el of c.querySelectorAll("[data-ym]")){
        const r=el.getBoundingClientRect();
        if(r.top<=anchor&&r.bottom>anchor){pick=el;break;}
        if(r.top>anchor){pick=pick||el;break;}
      }
      if(!pick) return;
      const [ys,ms]=pick.dataset.ym.split("-");
      const y=parseInt(ys),m=parseInt(ms);
      if(!isNaN(y)&&!isNaN(m)){
        moRef.current={year:y,month:m}; yrRef.current=y;   // remember for year-toggle target
        const lbl=document.getElementById("cal-cur-label");
        if(lbl) lbl.textContent=`${MON[m]} ${y}`;
      }
    };
    const onScroll=()=>{ if(!ticking){ticking=true;requestAnimationFrame(read);} };
    c.addEventListener("scroll",onScroll,{passive:true});
    read();
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
  return months.map(({year:y,month:m})=>{
    const monthCount=events.filter(ev=>{const dp=(ev.date||"").split("/");return dp.length===3&&parseInt(dp[1])-1===m&&parseInt(dp[2])===y;}).length;
    return(
    <div key={`${y}-${m}`} data-ym={`${y}-${m}`} className="cal-month-block">
      <div className="cal-month-lbl">{MON[m]} {y}{monthCount>0?<span style={{fontWeight:600,color:"var(--mut)",fontSize:13,marginLeft:8}}>· {monthCount} competition{monthCount!==1?"s":""}</span>:null}</div>
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
  );});
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

/* Spider-web icon (lucide has none) — radial spokes + two octagon rings. */
function WebIcon({size=12}){
  return(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{flex:"none"}}>
    <path d="M12 3.5 L12 20.5 M3.5 12 L20.5 12 M6 6 L18 18 M18 6 L6 18"/>
    <path d="M20 12 L17.66 17.66 L12 20 L6.34 17.66 L4 12 L6.34 6.34 L12 4 L17.66 6.34 Z"/>
    <path d="M16.5 12 L15.18 15.18 L12 16.5 L8.82 15.18 L7.5 12 L8.82 8.82 L12 7.5 L15.18 8.82 Z"/>
  </svg>);
}

/* === AthleteWeb: force-directed "web" of co-competitors ======================
   Each node is an athlete the focal athlete has raced against. Rivals are
   ranked and sized by a Jaccard correlation on a 0–1 scale:
       corr = shared / (focalTotal + rivalTotal − shared)
   i.e. shared competitions over the union of both athletes' competition sets.
   Jaccard (over shared/min) damps one-event wonders — a newcomer whose only 2
   comps were with the focal isn't a "perfect 1.0" — and damps mega-active
   athletes who co-appear with everyone by sheer volume. Raw shared count stays
   on the node for human-readable display. Edges connect any two shown athletes
   who appeared in the same event (weight = times together). Limited to the
   top 15 co-competitors. Drag nodes; hover to spotlight a node and its
   connections; click to pin (sidebar shows shared comps + connections);
   double-click to open that athlete's profile.
   Self-contained 2D canvas (matches SailingGlobe) + d3-force physics. */
function AthleteWeb({name,events,height=220,dark=true,onPick,onOpen,onOpenEvent,onSelectionChange,deselectKey=0,enlarged=false}){
  const canvasRef=React.useRef(null);
  const wrapRef=React.useRef(null);
  const simRef=React.useRef(null);
  const onPickRef=React.useRef(onPick);
  const onOpenRef=React.useRef(onOpen);
  const onOpenEventRef=React.useRef(onOpenEvent);
  const onSelChangeRef=React.useRef(onSelectionChange);
  React.useEffect(()=>{onPickRef.current=onPick;onOpenRef.current=onOpen;onOpenEventRef.current=onOpenEvent;onSelChangeRef.current=onSelectionChange;},[onPick,onOpen,onOpenEvent,onSelectionChange]);
  const stateRef=React.useRef({w:260,h:height,dpr:1,nodes:[],links:[],hover:null,sel:null,drag:null,maxShared:1,down:null,scale:1,ox:0,oy:0,pan:null});

  // Build {nodes, links} from all events, centred on the focal athlete.
  const graph=React.useMemo(()=>{
    const focal=canonName(name);
    const disp=new Map();                 // canon -> display name
    const shared=new Map();               // canon -> # events shared with focal
    const totals=new Map();               // canon -> total events appeared in (for Jaccard union)
    const focalEvents=[];                 // [Set(canon)] events the focal sailed
    const clsCount=new Map();             // canon -> Map(classId -> # shared events in that class)
    const natCount=new Map();             // canon -> Map(nat -> count)
    const bump=(map,k,v)=>{if(!v)return;let m=map.get(k);if(!m){m=new Map();map.set(k,m);}m.set(v,(m.get(v)||0)+1);};
    const modeOf=m=>{if(!m)return null;let best=null,bc=-1;m.forEach((c,k)=>{if(c>bc){bc=c;best=k;}});return best;};
    const remember=raw=>{const k=canonName(raw);if(!k)return null;if(!disp.has(k))disp.set(k,raw);return k;};
    (events||[]).forEach(ev=>{
      if(ev.status==="Draft")return;
      const present=new Set();
      (ev.entries||[]).forEach(e=>{[e.helm,e.crew].forEach(raw=>{const k=remember(raw);if(k){present.add(k);bump(natCount,k,e.nat);}});});
      present.forEach(k=>totals.set(k,(totals.get(k)||0)+1));
      if(!present.has(focal))return;
      focalEvents.push(present);
      present.forEach(k=>{if(k!==focal){shared.set(k,(shared.get(k)||0)+1);bump(clsCount,k,ev.cls);}});
    });
    // Jaccard correlation (0–1): shared / union of the two competition sets.
    const focalTotal=focalEvents.length;
    const corrOf=(k,sh)=>{const u=focalTotal+(totals.get(k)||sh)-sh;return u>0?sh/u:0;};
    const top=[...shared.entries()].map(([k,sh])=>[k,sh,corrOf(k,sh)])
      .sort((a,b)=>b[2]-a[2]||b[1]-a[1]).slice(0,15);   // rank by corr, tie-break raw shared
    const keep=new Set(top.map(([k])=>k)); keep.add(focal);
    const maxShared=top.length?Math.max(...top.map(t=>t[1])):1;
    const maxCorr=top.length?top[0][2]:1;
    // node class = the boat class they shared MOST competitions with the focal in (drives node colour)
    const nodes=[{id:focal,name:disp.get(focal)||name,cls:ATHLETE_ATTRS.get(focal)?.recentCls||null,nat:modeOf(natCount.get(focal)),shared:maxShared,corr:maxCorr||1,focal:true}];
    top.forEach(([k,c,q])=>nodes.push({id:k,name:disp.get(k)||k,cls:modeOf(clsCount.get(k)),nat:modeOf(natCount.get(k)),shared:c,corr:q,focal:false}));
    const ew=new Map();
    focalEvents.forEach(present=>{
      const arr=[...present].filter(k=>keep.has(k));
      for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
        const a=arr[i],b=arr[j];const key=a<b?a+"|"+b:b+"|"+a;
        ew.set(key,(ew.get(key)||0)+1);
      }
    });
    const links=[...ew.entries()].map(([key,w])=>{const p=key.split("|");return{source:p[0],target:p[1],w};});
    return{nodes,links,maxShared,maxCorr:maxCorr||1,focal,count:top.length};
  },[name,events]);

  // selected node (lifted to React state so the enlarged sidebar can render it)
  const [selNode,setSelNode]=React.useState(null);
  React.useEffect(()=>{onSelChangeRef.current&&onSelChangeRef.current(selNode);},[selNode]);
  // external "Deselect" (from the popup header) clears the current selection
  React.useEffect(()=>{const st=stateRef.current;st.sel=null;setSelNode(null);st.draw&&st.draw();},[deselectKey]);
  // select a node programmatically (sidebar "connections" chips)
  const selectById=(id)=>{
    const st=stateRef.current;const n=st.byId?.get(id);if(!n)return;
    st.sel=n;setSelNode({id:n.id,name:n.name,shared:n.shared,cls:n.cls,nat:n.nat});
    st.draw&&st.draw();
  };
  // who the selected athlete is connected to in the visible web (edge weight desc)
  const selConnections=React.useMemo(()=>{
    if(!selNode)return [];
    const byId=new Map(graph.nodes.map(n=>[n.id,n]));
    return graph.links
      .filter(l=>l.source===selNode.id||l.target===selNode.id)
      .map(l=>({n:byId.get(l.source===selNode.id?l.target:l.source),w:l.w}))
      .filter(x=>x.n)
      .sort((a,b)=>b.w-a.w);
  },[selNode,graph]);
  // the competitions the focal + selected athlete both sailed
  const sharedComps=React.useMemo(()=>{
    if(!selNode)return [];
    const focal=graph.focal,target=selNode.id,out=[];
    (events||[]).forEach(ev=>{
      if(ev.status==="Draft")return;
      const present=new Set();
      (ev.entries||[]).forEach(e=>[e.helm,e.crew].forEach(raw=>{const k=canonName(raw);if(k)present.add(k);}));
      if(present.has(focal)&&present.has(target))out.push(ev);
    });
    return out.sort((a,b)=>String(b.date||"").localeCompare(String(a.date||"")));
  },[selNode,events,graph.focal]);

  React.useEffect(()=>{
    const cv=canvasRef.current,wrap=wrapRef.current;
    if(!cv||!wrap||graph.nodes.length<=1)return;
    const st=stateRef.current;
    const ctx=cv.getContext("2d");
    const sizeCanvas=()=>{
      const w=wrap.clientWidth||260,h=height,dpr=window.devicePixelRatio||1;
      cv.width=w*dpr;cv.height=h*dpr;cv.style.width=w+"px";cv.style.height=h+"px";
      st.w=w;st.h=h;st.dpr=dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    sizeCanvas();
    const nodes=graph.nodes.map(n=>({...n}));
    const byId=new Map(nodes.map(n=>[n.id,n]));
    const links=graph.links.map(l=>({...l}));
    st.nodes=nodes;st.links=links;st.byId=byId;st.maxShared=graph.maxShared;st.maxCorr=graph.maxCorr;st.hover=null;st.sel=null;st.scale=1;st.ox=0;st.oy=0;st.pan=null;
    setSelNode(null);
    const focalNode=byId.get(graph.focal);
    if(focalNode){focalNode.fx=st.w/2;focalNode.fy=st.h/2;}
    // scatter rivals radially: bigger (more-correlated) start nearer the focal,
    // smaller start further out, with random jitter so the layout looks organic.
    nodes.forEach(n=>{if(n.focal)return;const ratio=(n.corr||0)/(graph.maxCorr||1);
      const ang=Math.random()*Math.PI*2,dist=(enlarged?144:55)+(1-ratio)*(enlarged?414:104)+(Math.random()-.5)*(enlarged?90:26);
      n.x=st.w/2+Math.cos(ang)*dist;n.y=st.h/2+Math.sin(ang)*dist;});
    // Sizing is relative to the focal node: the MOST-CORRELATED rival (Jaccard)
    // is 80% of the focal's size, everyone else scales linearly by their
    // correlation vs. that top rival. No rival is ever bigger than focal.
    const F=enlarged?12.6:7.65;               // focal radius (50% smaller, +20%, then +50%)
    const rad=d=>{if(d.focal)return F;
      const ratio=(d.corr||0)/(st.maxCorr||1);
      return Math.max(enlarged?3.3:1.95,F*0.8*ratio);};   // top rival = 80% of focal
    st.rad=rad;
    const lerpText=(n,strong,sx,sy)=>{
      ctx.font=(strong?"700 ":"600 ")+(strong?12:10.5)+"px -apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif";
      const t=n.name,tw=ctx.measureText(t).width,x=sx,y=sy-rad(n)*st.scale-6;
      ctx.fillStyle="rgba(8,24,45,.82)";
      const px=6,h=15,bx=x-tw/2-px,by=y-h+3,bw=tw+px*2;
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(bx,by,bw,h,5);else ctx.rect(bx,by,bw,h);
      ctx.fill();
      ctx.fillStyle=strong?"#ffffff":"#dcecf8";ctx.textAlign="center";ctx.textBaseline="alphabetic";
      ctx.fillText(t,x,y);
    };
    // a node shows its label when it's the focal/active node, or — in the
    // enlarged view — once zoom makes it big enough (larger nodes reveal first).
    // enlarged: label every node. mini: only label the node under the cursor.
    const labelFor=(n,active)=>enlarged||(active&&n.id===active.id);
    const draw=()=>{
      const s=st.scale,active=st.sel||st.hover;
      ctx.save();
      ctx.setTransform(st.dpr,0,0,st.dpr,0,0);
      ctx.clearRect(0,0,st.w,st.h);
      const nbr=new Set();
      if(active)links.forEach(l=>{const a=l.source.id,t=l.target.id;if(a===active.id)nbr.add(t);else if(t===active.id)nbr.add(a);});
      // world-space layer — nodes + links pan & zoom together
      ctx.save();
      ctx.translate(st.ox,st.oy);ctx.scale(s,s);
      links.forEach(l=>{
        const a=l.source,b=l.target;if(a.x==null||b.x==null)return;
        const on=active&&(a.id===active.id||b.id===active.id);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
        ctx.lineWidth=Math.min(2.4,.4+l.w*.35)/s;
        ctx.strokeStyle=on?"rgba(13,142,207,.85)":active?"rgba(150,175,205,.05)":"rgba(150,175,205,.16)";
        ctx.stroke();
      });
      nodes.forEach(n=>{
        if(n.x==null)return;
        const c=rad(n),dim=active&&n.id!==active.id&&!nbr.has(n.id);
        const col=n.focal?"#ffcf2e":classColor(n.cls);
        ctx.globalAlpha=dim?.15:1;
        ctx.fillStyle=col;ctx.beginPath();ctx.arc(n.x,n.y,c,0,7);ctx.fill();
        ctx.lineWidth=((n.focal||(active&&n.id===active.id))?1.6:1.1)/s;ctx.strokeStyle="#fff";ctx.stroke();
        ctx.globalAlpha=1;
      });
      ctx.restore();
      // screen-space labels — constant size, never scale with zoom
      nodes.forEach(n=>{
        if(n.x==null||!labelFor(n,active))return;
        const dim=active&&n.id!==active.id&&!nbr.has(n.id);
        ctx.globalAlpha=dim?.2:1;
        lerpText(n,n.focal||(active&&n.id===active.id),n.x*s+st.ox,n.y*s+st.oy);
        ctx.globalAlpha=1;
      });
      ctx.restore();
    };
    st.draw=draw;
    const sim=forceSimulation(nodes)
      .velocityDecay(enlarged?.62:.58)        // higher damping = relaxed, fluid motion (less bounce)
      // link distance is driven by correlation: more-correlated nodes sit
      // closer to the focal, less-correlated ones further out. Focal links hold
      // the radial structure; rival-rival links stay weak so they don't clump.
      .force("link",forceLink(links).id(d=>d.id)
        .distance(l=>{const a=l.source,b=l.target,other=a.focal?b:(b.focal?a:null);
          if(other){const ratio=(other.corr||0)/(st.maxCorr||1);return (enlarged?126:47)+(1-ratio)*(enlarged?414:104);}
          return enlarged?270:91;})
        .strength(l=>(l.source.focal||l.target.focal)?(enlarged?.5:.45):.04))
      .force("charge",forceManyBody().strength(enlarged?-270:-60).distanceMax(enlarged?1100:390))
      .force("collide",forceCollide(d=>rad(d)+(enlarged?10:7)).strength(.6))
      .force("x",forceX(()=>st.w/2).strength(enlarged?.04:.05))
      .force("y",forceY(()=>st.h/2).strength(enlarged?.04:.05))
      // soft walls — any node dragged/pushed outside the frame eases back in
      .force("bounds",a=>{const m=enlarged?22:12;nodes.forEach(n=>{if(n.fx!=null||n.x==null)return;
        if(n.x<m)n.vx+=(m-n.x)*a*0.6;else if(n.x>st.w-m)n.vx+=(st.w-m-n.x)*a*0.6;
        if(n.y<m)n.vy+=(m-n.y)*a*0.6;else if(n.y>st.h-m)n.vy+=(st.h-m-n.y)*a*0.6;});})
      .on("tick",draw);
    simRef.current=sim;

    const pos=ev=>{const r=cv.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};};
    const toWorld=p=>({x:(p.x-st.ox)/st.scale,y:(p.y-st.oy)/st.scale});
    const hit=p=>{const w=toWorld(p);let best=null,bd=1e9;nodes.forEach(n=>{if(n.x==null)return;const dx=n.x-w.x,dy=n.y-w.y,d=dx*dx+dy*dy,r=rad(n)+6/st.scale;if(d<=r*r&&d<bd){bd=d;best=n;}});return best;};
    const onDown=e=>{const p=pos(e);const n=hit(p);st.down={p,n,moved:false,t:Date.now()};
      if(n){const w=toWorld(p);st.drag=n;n.fx=w.x;n.fy=w.y;sim.alphaTarget(.3).restart();}
      else if(enlarged){st.pan={x:p.x,y:p.y,ox:st.ox,oy:st.oy};cv.style.cursor="grabbing";}};
    const onMove=e=>{
      const p=pos(e);
      if(st.drag){st.down&&(st.down.moved=true);const w=toWorld(p);st.drag.fx=w.x;st.drag.fy=w.y;return;}
      if(st.pan){st.down&&(st.down.moved=true);st.ox=st.pan.ox+(p.x-st.pan.x);st.oy=st.pan.oy+(p.y-st.pan.y);draw();return;}
      const n=hit(p);
      if(n!==st.hover){st.hover=n;cv.style.cursor=n?"pointer":(enlarged?"grab":"default");draw();}
    };
    const endDrag=()=>{if(st.drag){if(!st.drag.focal){st.drag.fx=null;st.drag.fy=null;}st.drag=null;sim.alphaTarget(0);sim.alpha(.55).restart();}st.pan=null;};
    const onUp=()=>{
      const d=st.down;endDrag();
      if(d&&d.n&&!d.moved){
        if(enlarged){const ns=st.sel&&st.sel.id===d.n.id?null:d.n;st.sel=ns;setSelNode(ns?{id:ns.id,name:ns.name,shared:ns.shared,cls:ns.cls,nat:ns.nat}:null);draw();}
        else if(onOpenRef.current){onOpenRef.current();}
      }
      else if(d&&!d.n&&!d.moved&&enlarged){st.sel=null;setSelNode(null);draw();} // click empty space → clear selection
      st.down=null;cv.style.cursor=enlarged?"grab":"default";
    };
    const onDbl=e=>{const n=hit(pos(e));if(n&&!n.focal&&onPickRef.current)onPickRef.current(n.name);};
    const onLeave=()=>{if(!st.drag&&!st.pan){st.hover=null;draw();}};
    const onWheel=e=>{if(!enlarged)return;e.preventDefault();const p=pos(e);
      const f=Math.exp(-e.deltaY*0.0016),ns=Math.min(6,Math.max(.6,st.scale*f));
      const wx=(p.x-st.ox)/st.scale,wy=(p.y-st.oy)/st.scale;
      st.scale=ns;st.ox=p.x-wx*ns;st.oy=p.y-wy*ns;draw();};
    cv.addEventListener("pointerdown",onDown);
    window.addEventListener("pointermove",onMove);
    window.addEventListener("pointerup",onUp);
    cv.addEventListener("dblclick",onDbl);
    cv.addEventListener("pointerleave",onLeave);
    if(enlarged)cv.addEventListener("wheel",onWheel,{passive:false});
    const onResize=()=>{sizeCanvas();sim.force("x",forceX(()=>st.w/2).strength(enlarged?.05:.055)).force("y",forceY(()=>st.h/2).strength(enlarged?.05:.055));if(focalNode){focalNode.fx=st.w/2;focalNode.fy=st.h/2;}sim.alpha(.3).restart();};
    window.addEventListener("resize",onResize);
    return()=>{sim.stop();cv.removeEventListener("pointerdown",onDown);window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp);cv.removeEventListener("dblclick",onDbl);cv.removeEventListener("pointerleave",onLeave);cv.removeEventListener("wheel",onWheel);window.removeEventListener("resize",onResize);};
  },[graph,height,enlarged]);

  if(graph.nodes.length<=1)
    return(<div ref={wrapRef} style={{height,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",color:"#9fbdd9",fontSize:12,padding:"0 16px",lineHeight:1.5}}>Not enough shared competitions yet to build a web.</div>);
  // Colour key for the nodes: focal (gold) + every boat class present among the rivals
  // (dynamic — only classes actually on screen), coloured to match the node fills.
  const legend=(()=>{
    const out=[{id:"__focal",label:"This athlete",color:"#ffcf2e"}];
    const seen=new Set();
    graph.nodes.forEach(n=>{if(n.focal)return;const key=(n.cls||"").toLowerCase();if(seen.has(key))return;seen.add(key);
      out.push({id:key||"__none",label:n.cls?classLabel(n.cls):"Other",color:classColor(n.cls)});});
    return out;
  })();
  const canvasPane=(
    <div ref={wrapRef} style={{position:"relative",width:"100%",height}}>
      <canvas ref={canvasRef} style={{display:"block",width:"100%",height,touchAction:"none"}}/>
      <div style={{position:"absolute",top:8,left:8,display:"flex",flexDirection:"column",gap:4,pointerEvents:"none",
        background:"rgba(8,24,45,.5)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",
        border:"1px solid rgba(120,160,210,.22)",borderRadius:9,padding:"7px 10px"}}>
        {legend.map(l=>(
          <div key={l.id} style={{display:"flex",alignItems:"center",gap:7,fontSize:enlarged?11.5:10,color:"#dcecf8",fontWeight:600,lineHeight:1}}>
            <span style={{width:enlarged?11:9,height:enlarged?11:9,borderRadius:"50%",background:l.color,flex:"none",boxShadow:"0 0 0 1px rgba(255,255,255,.4)"}}/>{l.label}
          </div>
        ))}
      </div>
      <div style={{position:"absolute",bottom:4,left:0,right:0,textAlign:"center",fontSize:10,color:"#7fa0c0",pointerEvents:"none"}}>{enlarged?`Top ${graph.count} rivals · click a node · scroll to zoom · drag to pan`:`Top 15 Rivals`}</div>
    </div>
  );
  if(!enlarged)return canvasPane;
  // shared competitions grouped by host country (mirrors the globe's footprint list)
  const sharedGroups=(()=>{const m={};sharedComps.forEach(ev=>{const ioc=ev.country||"";const iso=IOC_ISO[ioc]||"";const cname=GLOBE_NAMES[iso]||ioc||"Unknown";const key=iso||ioc||"ZZ";if(!m[key])m[key]={iso,cname,items:[]};m[key].items.push(ev);});return Object.values(m).sort((a,b)=>a.cname.localeCompare(b.cname));})();
  const sidebar=!selNode
    ? <div style={{padding:"22px 18px",color:"#9fbdd9",fontSize:13,lineHeight:1.6}}>Click a node to see the competitions you shared with that athlete — grouped by country. Click a competition to open its results.</div>
    : (<div style={{padding:"4px 0"}}>
        <div style={{padding:"14px 16px 12px",borderBottom:"1px solid rgba(120,160,210,.16)"}}>
          <h3 onClick={()=>onPickRef.current&&onPickRef.current(selNode.name)} title="Open profile"
            style={{margin:0,fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:19,color:"#eaf3fc",cursor:"pointer",
              display:"inline-flex",alignItems:"center",gap:9,lineHeight:1.15}}>
            {selNode.name}{selNode.nat&&<span style={{fontSize:19,lineHeight:1}}>{iocFlag(selNode.nat)}</span>}
          </h3>
          <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {selNode.cls&&(()=>{const ng=nuggetFor(selNode.cls);return <span style={{background:ng.color,color:"#fff",borderRadius:980,padding:"2px 10px",fontWeight:700,fontSize:11.5,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>;})()}
            <span style={{color:"#9fc4ec",fontWeight:800,fontSize:13,fontVariantNumeric:"tabular-nums"}}>{sharedComps.length} shared competition{sharedComps.length===1?"":"s"}</span>
          </div>
          {selConnections.length>0&&(
            <div style={{marginTop:11}}>
              <div style={{fontSize:10.5,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"#7fa0c0",marginBottom:6}}>Connected to</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {selConnections.map(({n,w})=>(
                  <button key={n.id} onClick={()=>selectById(n.id)} title={`${w} competition${w===1?"":"s"} together — view`}
                    style={{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid rgba(120,160,210,.3)",
                      background:"rgba(120,160,210,.12)",color:"#dcecf8",borderRadius:980,padding:"3px 10px",
                      fontFamily:"inherit",fontSize:11.5,fontWeight:700,cursor:"pointer",lineHeight:1.4}}>
                    <span style={{width:7,height:7,borderRadius:"50%",flex:"none",
                      background:n.focal?"#ffcf2e":classColor(n.cls),boxShadow:"0 0 0 1px rgba(255,255,255,.35)"}}/>
                    {n.name}<span style={{color:"#9fc4ec",fontWeight:800}}>{w}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {sharedGroups.map(g=>(
          <div key={g.cname}>
            <div style={{position:"sticky",top:0,padding:"9px 14px 7px",zIndex:1,display:"flex"}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(120,160,210,.16)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",border:"1px solid rgba(120,160,210,.3)",borderRadius:980,padding:"5px 13px",color:"#eaf3fc",fontWeight:700,fontFamily:"'Barlow',sans-serif",fontSize:13,letterSpacing:".02em",boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)"}}>
                <span style={{fontSize:16,lineHeight:1}}>{g.iso?isoFlag(g.iso):""}</span>{g.cname}
                <span style={{color:"#9fc4ec",fontWeight:800}}>{g.items.length}</span>
              </span>
            </div>
            {g.items.map((ev,i)=>{const ng=ev.cls?nuggetFor(ev.cls,ev.subclass):null;return(
              <div key={i} onClick={()=>onOpenEventRef.current&&onOpenEventRef.current(ev.id)} title="Open results"
                style={{margin:"7px 12px",padding:"10px 12px",borderRadius:10,cursor:"pointer",transition:"all .15s",
                  background:"rgba(120,160,210,.08)",border:"1px solid rgba(120,160,210,.16)"}}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(90,150,215,.2)";e.currentTarget.style.borderColor="rgba(120,180,235,.5)";}}
                onMouseLeave={e=>{e.currentTarget.style.background="rgba(120,160,210,.08)";e.currentTarget.style.borderColor="rgba(120,160,210,.16)";}}>
                <div style={{fontWeight:700,color:"#eaf3fc",fontSize:13.5,marginBottom:3}}>{ev.name}</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:"4px 10px",fontSize:12,color:"#9fbdd9",alignItems:"center"}}>
                  <span>{formatDate(ev.date)}</span>
                  {ng&&<span style={{background:ng.color,color:"#fff",borderRadius:980,padding:"2px 9px",fontWeight:700,fontSize:11,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>}
                </div>
              </div>);})}
          </div>
        ))}
        {sharedComps.length===0&&<div style={{padding:16,color:"#9fbdd9",fontSize:12}}>No shared competitions found.</div>}
      </div>);
  return(
    <div style={{display:"flex",width:"100%",height}}>
      <div style={{flex:"0 0 70%",height}}>{canvasPane}</div>
      <div style={{flex:"0 0 30%",height,overflowY:"auto",borderLeft:"1px solid rgba(120,160,210,.18)"}}>{sidebar}</div>
    </div>
  );
}

function SailingGlobe({countryData,height=330,pulseIso=null,dark=false,mini=false,bare=false,countLabel="competition",hostIso=null,rankShade=false,markersHostOnly=false}){
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
    const size=()=>{if(!wrapRef.current)return;const w=wrapRef.current.clientWidth||0,h=height;if(!w)return;W=w;H=h;canvas.width=w*dpr;canvas.height=h*dpr;
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
      // Wrapper may have 0 width on first paint (hidden tab / pre-layout) —
      // size() bails without setting W/H/baseR/cx/cy, and NaN maths here would
      // throw in createRadialGradient and take down the whole profile via the
      // ErrorBoundary. Retry sizing until layout settles instead of crashing.
      if(!Number.isFinite(baseR)||!(W>0)){size();if(!Number.isFinite(baseR)||!(W>0)){raf=requestAnimationFrame(draw);return;}}
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
function FootprintModal({name,ag,countryCounts,onClose,hostMode=false,titleSuffix="Globe",webProps=null,initialTab="footprint"}){
  const [sel,setSel]=React.useState(null); // selected ISO (sticky)
  const [ftab,setFtab]=React.useState(webProps?initialTab:"footprint"); // footprint(globe) | web
  const [webSel,setWebSel]=React.useState(null); // athlete selected inside the web
  const [deselectKey,setDeselectKey]=React.useState(0); // bump to clear the web selection
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
        style={{maxWidth:1000,background:"linear-gradient(160deg,rgba(13,35,64,0.82),rgba(9,26,49,0.82))",border:"1px solid rgba(120,160,210,.22)"}}>
        <div className="mhead" style={{background:"rgba(8,22,42,.6)"}}>
          <Flag size={18}/><h3>{name} — {ftab==="web"?"Athlete web":titleSuffix}</h3>
          {((ftab==="footprint"&&sel)||(ftab==="web"&&webSel))&&
            <button className="btn ghost" style={{background:"rgba(255,255,255,.1)",color:"#dcecf8",border:"1px solid rgba(255,255,255,.18)",fontSize:12,padding:"5px 11px",marginRight:8}}
              onClick={()=>{if(ftab==="web")setDeselectKey(k=>k+1);else setSel(null);}}>Deselect</button>}
          {webProps&&<div style={{display:"flex",gap:4}}>
            {[["footprint","Globe",Globe],["web","Web",WebIcon]].map(([k,lab,Ico])=>(
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
        {ftab==="web"
        ? <div style={{height:540}}><AthleteWeb {...webProps} enlarged height={540} dark onSelectionChange={setWebSel} deselectKey={deselectKey}/></div>
        : <div style={{display:"flex",flexWrap:"wrap"}} onClick={()=>setSel(null)}>
          <div style={{flex:"1 1 440px",minWidth:300,padding:18}} onClick={e=>e.stopPropagation()}>
            <SailingGlobe countryData={countryCounts} height={460} pulseIso={sel} dark/>
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

/* ── Searchable host attribution combobox ──────────────────────────────
   value = host id (attribute to a host on AthLink) or null (nothing /
   Other host). The "Other host — not listed" row carries sentinel
   HOST_OTHER; picking it sets _orgHost to null and reveals the free-text
   organizer-name input (rendered here, only in that case).
   onChange(id|null) writes _orgHost. orgName/onOrgName drive _orgName. */
const HOST_OTHER="__other__";
function HostPicker({hosts,value,onChange,orgName,onOrgName}){
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


/* ═══════════════════════════════════════════════════════════════════════
   Multi-step Sign-in / Sign-up modal
   ───────────────────────────────────────────────────────────────────────
   Sign-in path:  email+pw → done (or Google OAuth redirect)
   Sign-up path:  Step 1 credentials → Step 2 role → Step 3 details → done
   Google OAuth:  redirect → on return, check profile → if none → Step 2+3
   Guardian path: athlete under 16 → guardian email collected → pending note
   ═══════════════════════════════════════════════════════════════════════ */
function SignInModal({onClose,onAuthed,googleOnboarding,clubs=[],associations=[],federations=[],onCreateHost,onClaimHost,pendingInviteToken=null}){
  /* ── mode: "signin" | "signup" ── */
  // If arriving from Google OAuth with no profile yet, jump straight to role-pick
  const[mode,setMode]=React.useState(googleOnboarding?"signup":"signin");
  /* ── multi-step signup state ── */
  // Steps: 1=credentials 2=role 3=name(first/last)+athlete-extras 4=host "Find my club"
  const[step,setStep]=React.useState(googleOnboarding?2:1);
  /* step 1 */
  const[email,setEmail]=React.useState("");
  const[pw,setPw]=React.useState("");
  /* step 2 */
  const[role,setRole]=React.useState("athlete"); // athlete|association|club|federation
  /* step 3 — name (ALL roles use first + last now) */
  const[firstName,setFirstName]=React.useState("");
  const[lastName,setLastName]=React.useState("");
  const[birthYear,setBirthYear]=React.useState("");
  const[guardianEmail,setGuardianEmail]=React.useState("");
  /* step 4 — host "Find my club/association/federation" */
  const[hostSearch,setHostSearch]=React.useState("");
  const[selectedHostId,setSelectedHostId]=React.useState(null); // existing host being claimed
  const[addingNew,setAddingNew]=React.useState(false);          // new-host form open
  const[newHostName,setNewHostName]=React.useState("");
  const[newHostScope,setNewHostScope]=React.useState("HK");     // HK | INT
  const[classId,setClassId]=React.useState("29er");             // association only
  const[hostCountry,setHostCountry]=React.useState("HKG");      // federation only
  /* shared */
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");
  const[info,setInfo]=React.useState("");
  /* invite redemption state */
  const[resolvedInvite,setResolvedInvite]=React.useState(null);  // fetched invite row (from link)
  const[inviteCodeInput,setInviteCodeInput]=React.useState("");   // 8-char code user types
  const[localInviteCtx,setLocalInviteCtx]=React.useState(null);  // {inv,token} from code lookup
  const[inviteCodeErr,setInviteCodeErr]=React.useState("");
  const[inviteCodeBusy,setInviteCodeBusy]=React.useState(false);

  // Invite mode: either link token or code-based context is present
  const isInviteMode=!!(pendingInviteToken||localInviteCtx);

  // On mount: if arriving via invite link, pre-fetch the invite row (anon key)
  React.useEffect(()=>{
    if(!pendingInviteToken) return;
    setMode("signup"); setStep(1);
    (async()=>{
      const rows=await fetchInviteByToken(pendingInviteToken,null);
      const inv=rows&&rows[0];
      if(inv&&!inv.used_at&&new Date(inv.expires_at)>new Date()) setResolvedInvite(inv);
    })();
  },[pendingInviteToken]);

  const curYear=new Date().getFullYear();
  const athleteAge=birthYear&&/^\d{4}$/.test(birthYear)?curYear-parseInt(birthYear):null;
  const isMinor=athleteAge!==null&&athleteAge<16;

  const fullNameStr=`${firstName.trim()} ${lastName.trim()}`.trim();
  const fallbackName=fullNameStr||email.split("@")[0];
  const isHost=role!=="athlete";

  // Which existing hosts to show in the "Find my ___" search, by role.
  const hostPool=role==="club"?clubs:role==="federation"?federations:associations;
  const hostKind=role==="club"?"club":role==="federation"?"federation":"association";
  const filteredHosts=hostPool.filter(h=>!hostSearch.trim()||h.name.toLowerCase().includes(hostSearch.toLowerCase()));

  /* ── helpers ── */
  const resetToSignin=()=>{setMode("signin");setStep(1);setErr("");setInfo("");};

  const step1Valid=mode==="signin"?(email.trim()&&pw):(email.trim()&&pw.length>=8);
  const step3Valid=firstName.trim()&&lastName.trim()&&(role==="athlete"?(isMinor?guardianEmail.trim():true):true);
  const step4Valid=addingNew?newHostName.trim():!!selectedHostId;

  /* ── apply invite code (step 4 fast-path) ── */
  const applyInviteCode=async()=>{
    const code=inviteCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(code.length<8){setInviteCodeErr("Enter the full 8-character code from your invitation.");return;}
    setInviteCodeBusy(true);setInviteCodeErr("");
    try{
      const rows=await fetchInviteByShortCode(code,null);
      if(rows&&rows.length>0){
        const inv=rows[0];
        if(inv.used_at){setInviteCodeErr("This invite code has already been used.");return;}
        if(new Date(inv.expires_at)<new Date()){setInviteCodeErr("This invite code has expired.");return;}
        setLocalInviteCtx({inv,token:inv.token});
      } else {
        setInviteCodeErr("That code wasn't found. Check it and try again, or ask for the invite link instead.");
      }
    }catch{
      setInviteCodeErr("Couldn't validate that code. Please try again.");
    }finally{setInviteCodeBusy(false);}
  };

  /* ── sign-in submit ── */
  const doSignIn=async()=>{
    setErr("");setBusy(true);
    try{
      if(!AUTH_BASE) throw new Error("Auth not configured.");
      const d=await authSignIn(email.trim(),pw);
      const tok=d.access_token;const user=d.user;
      const prof=await fetchProfile(user.id,tok)||{role:"guest"};
      onAuthed({token:tok,user,profile:prof});
    }catch(e){setErr(e.message||"Sign-in failed.");}
    finally{setBusy(false);}
  };

  /* ── final sign-up submit ── */
  // Athletes finish at step 3; hosts finish at step 4 (after Find-my-club).
  const doSignUp=async()=>{
    setErr("");setBusy(true);
    try{
      if(!AUTH_BASE) throw new Error("Auth not configured.");
      // Obtain a session: Google path already has one; email path signs up now.
      let tok,user;
      if(googleOnboarding){
        tok=googleOnboarding.token; user=googleOnboarding.user;
      } else {
        const d=await authSignUp(email.trim(),pw);
        tok=d.access_token||d.session?.access_token;
        user=d.user||d;
        if(!tok){
          setInfo("Account created — check your email to confirm, then sign in.");
          resetToSignin();setBusy(false);return;
        }
      }

      // ── Write the profile row (all roles capture first/last now) ──
      const profilePayload={user_id:user.id,role,
        display_name:fallbackName,
        class_id:role==="association"?classId:null,
        athlete_name:role==="athlete"?fullNameStr||null:null,
        first_name:firstName.trim()||null,
        last_name:lastName.trim()||null};
      if(role==="athlete"&&birthYear) profilePayload.birth_year=parseInt(birthYear);
      if(role==="athlete"&&isMinor&&guardianEmail.trim()){profilePayload.guardian_pending=true;profilePayload.guardian_email=guardianEmail.trim();}
      await upsertProfile(profilePayload,tok);

      // ── Athlete: minor guardian path or straight in ──
      if(role==="athlete"){
        if(isMinor&&guardianEmail.trim()){
          setInfo(`Guardian consent email sent to ${guardianEmail.trim()}. Profile activates once approved.`);
          setTimeout(onClose,5000);setBusy(false);return;
        }
        onAuthed({token:tok,user,profile:profilePayload});return;
      }

      // ── Invite path: link token or code → immediate verified access ──
      const activeInvRow=resolvedInvite||localInviteCtx?.inv;
      if(activeInvRow){
        // Re-validate with the user's token (RLS-safe) before committing.
        let inv=activeInvRow;
        const recheck=await fetchInviteByToken(inv.token,tok);
        if(recheck&&recheck[0]) inv=recheck[0];
        if(!inv||inv.used_at||new Date(inv.expires_at)<new Date())
          throw new Error("This invitation is no longer valid. Ask your host admin to send a new one.");
        // Profile role mirrors the host type (club / association / federation).
        const hostRows=await sbGet(`hosts?id=eq.${encodeURIComponent(inv.host_id)}&select=type`);
        const hostType=hostRows?.[0]?.type||hostById(inv.host_id)?.type||"club";
        profilePayload.role=hostType;
        delete profilePayload.birth_year; delete profilePayload.guardian_pending; delete profilePayload.guardian_email;
        profilePayload.athlete_name=null; profilePayload.class_id=hostType==="association"?(hostById(inv.host_id)?.cls||null):null;
        await upsertProfile(profilePayload,tok);
        // Create membership: verified:true, active — immediate full access.
        await hostRest("host_members",{method:"POST",
          headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
          body:JSON.stringify({host_id:inv.host_id,user_id:user.id,role:inv.role,status:"active",verified:true})},tok);
        await markInviteUsed(inv.token,user.id,tok);
        onAuthed({token:tok,user,profile:{...profilePayload,role:hostType}});
        return;
      }

      // ── Host: claim existing OR create new → pending Owner (guest access) ──
      let hostId=selectedHostId;
      if(addingNew){
        const created=await onCreateHost?.({
          type:hostKind,scope:newHostScope,name:newHostName.trim(),
          cls:hostKind==="association"?classId:null,
          country:hostKind==="federation"?(hostCountry||"HKG").toUpperCase():null,
        },tok);
        if(!created?.id) throw new Error("Couldn't create the host page.");
        hostId=created.id;
      }
      if(!hostId) throw new Error("Please select or add a host.");
      // Register the user as Owner, status active but verified=false (gated → guest UX).
      await onClaimHost?.(hostId,user.id,tok);

      // Sign them in as their (pending) profile; UI stays guest-level until verified.
      onAuthed({token:tok,user,profile:profilePayload,pendingHostId:hostId});
    }catch(e){setErr(e.message||"Sign-up failed.");}
    finally{setBusy(false);}
  };

  /* ── Google OAuth ── */
  const doGoogle=()=>{
    if(!SB_URL||!SB_KEY){setErr("Auth not configured.");return;}
    authGoogleOAuth();
  };

  /* ── input style ── */
  const F={width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"11px 13px",
    font:"inherit",fontSize:14,background:"rgba(255,255,255,.82)",outline:"none",
    transition:"box-shadow .15s",marginBottom:0};
  const FW=(extra={})=>({...F,...extra});
  const Label=({children})=><p style={{fontSize:11.5,fontWeight:700,color:"var(--mut)",letterSpacing:".05em",textTransform:"uppercase",margin:"0 0 6px"}}>{children}</p>;

  /* ── role option cards ── */
  const RoleCard=({id,label,desc,icon})=>{
    const on=role===id;
    return(
      <button type="button" onClick={()=>setRole(id)}
        style={{flex:"1 1 140px",border:"1.5px solid "+(on?"var(--accent)":"var(--line)"),
          background:on?"rgba(10,132,255,.08)":"rgba(255,255,255,.6)",
          backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
          borderRadius:14,padding:"14px 12px",cursor:"pointer",textAlign:"left",transition:".15s",
          boxShadow:on?"0 0 0 3px var(--halo)":"none"}}>
        <div style={{fontSize:22,marginBottom:6}}>{icon}</div>
        <div style={{fontWeight:700,fontSize:14,color:on?"var(--accent)":"var(--navy)"}}>{label}</div>
        <div style={{fontSize:12,color:"var(--mut)",marginTop:3,lineHeight:1.4}}>{desc}</div>
      </button>
    );
  };

  /* ── progress bar (athletes = 3 steps, hosts = 4) ── */
  const totalSteps=isInviteMode?2:isHost?4:3;
  const pct=mode==="signup"?Math.round(((step-1)/(totalSteps-1))*100):0;

  return(
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}
        style={{maxWidth:440,overflow:"visible"}}>

        {/* ── Header ── */}
        <div className="mhead" style={{flexDirection:"column",alignItems:"stretch",gap:0,padding:"20px 24px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1}}>
              <p style={{margin:0,fontSize:11,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"rgba(255,255,255,.55)"}}>
                {isInviteMode&&mode==="signup"?(step===1?"Accept invitation":"Your details"):mode==="signin"?"Welcome back":step===1?"Create account":step===2?"Who are you?":step===3?"Your name":hostKind==="club"?"Find your club":hostKind==="federation"?"Find your federation":"Find your association"}
              </p>
              <h3 style={{marginTop:2}}>
                {isInviteMode&&mode==="signup"?(step===1?"Create your account":"Complete your profile"):mode==="signin"?"Sign in to AthLink":step===1?"Get started":step===2?"Choose your role":step===3?(isHost?"Your details":"Almost done"):"Link your club"}
              </h3>
            </div>
            <button className="x" onClick={onClose}><X size={16}/></button>
          </div>
          {/* progress bar — only during signup after step 1 */}
          {mode==="signup"&&(
            <div style={{marginTop:14,height:3,borderRadius:3,background:"rgba(255,255,255,.18)",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:"rgba(255,255,255,.75)",borderRadius:3,transition:"width .4s cubic-bezier(.4,0,.2,1)"}}/>
            </div>
          )}
          <div style={{height:20}}/>
        </div>

        {/* ── Body ── */}
        <div style={{padding:"12px 24px 26px",display:"flex",flexDirection:"column",gap:15}}>

          {err&&<div style={{background:"rgba(200,50,50,.1)",border:"1px solid rgba(200,50,50,.3)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#c0392b",display:"flex",alignItems:"center",gap:8}}><AlertCircle size={14} style={{flex:"none"}}/>{err}</div>}
          {info&&<div style={{background:"rgba(10,132,255,.08)",border:"1px solid rgba(10,132,255,.2)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"var(--accent)"}}>{info}</div>}

          {/* ── Invite banner: LINK invites only (code invites show their own banner at step 4) ── */}
          {(resolvedInvite||pendingInviteToken)&&!localInviteCtx&&mode==="signup"&&(
            <div style={{background:"rgba(80,180,100,.1)",border:"1px solid rgba(80,180,100,.35)",borderRadius:12,padding:"12px 15px",display:"flex",alignItems:"flex-start",gap:10}}>
              <BadgeCheck size={16} style={{flex:"none",marginTop:1,color:"#3a9e55"}}/>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:"#2a7a3e",marginBottom:2}}>You have an invitation</div>
                {resolvedInvite
                  ? <div style={{fontSize:12.5,color:"#3a7048",lineHeight:1.45}}>
                      Joining as <b>{resolvedInvite.role}</b>. Create your account below — you'll have immediate host access once done.
                    </div>
                  : <div style={{fontSize:12.5,color:"#3a7048",lineHeight:1.45}}>
                      Complete sign-up below to accept your invitation and get host access.
                    </div>}
              </div>
            </div>
          )}

          {/* ════ SIGN-IN ════ */}
          {mode==="signin"&&(<>
            {/* Google */}
            <button type="button" onClick={doGoogle} disabled={busy}
              style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                border:"1px solid var(--line)",borderRadius:10,padding:"11px",background:"rgba(255,255,255,.82)",
                backdropFilter:"blur(20px)",cursor:"pointer",fontSize:14,fontWeight:600,color:"var(--navy)",transition:".15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.96)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.82)"}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
              Continue with Google
            </button>

            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,height:1,background:"var(--line)"}}/>
              <span style={{fontSize:11.5,fontWeight:700,color:"var(--mut)",letterSpacing:".04em"}}>OR</span>
              <div style={{flex:1,height:1,background:"var(--line)"}}/>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div><Label>Email</Label>
                <input style={FW()} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
              </div>
              <div><Label>Password</Label>
                <input style={FW()} type="password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}
                  onKeyDown={e=>{if(e.key==="Enter"&&email&&pw)doSignIn();}}/>
              </div>
            </div>

            <button className="btn cta liquidGlass-wrapper" style={{width:"100%",justifyContent:"center"}}
              disabled={busy||!email.trim()||!pw} onClick={doSignIn}>
              <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={15} className="spin"/>:null}Sign in</div>
            </button>

            <p style={{fontSize:13,color:"var(--mut)",textAlign:"center",margin:0}}>
              No account?{" "}
              <button type="button" onClick={()=>{setMode("signup");setStep(1);setErr("");}}
                style={{border:0,background:"none",color:"var(--accent)",fontWeight:700,cursor:"pointer",fontSize:13}}>
                Create one
              </button>
            </p>
          </>)}

          {/* ════ SIGN-UP STEP 1: credentials ════ */}
          {mode==="signup"&&step===1&&(<>
            <button type="button" onClick={doGoogle} disabled={busy}
              style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                border:"1px solid var(--line)",borderRadius:10,padding:"11px",background:"rgba(255,255,255,.82)",
                backdropFilter:"blur(20px)",cursor:"pointer",fontSize:14,fontWeight:600,color:"var(--navy)",transition:".15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.96)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.82)"}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
              Continue with Google
            </button>

            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,height:1,background:"var(--line)"}}/>
              <span style={{fontSize:11.5,fontWeight:700,color:"var(--mut)",letterSpacing:".04em"}}>OR</span>
              <div style={{flex:1,height:1,background:"var(--line)"}}/>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div><Label>Email</Label>
                <input style={FW()} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
              </div>
              <div><Label>Password <span style={{fontWeight:400,textTransform:"none",fontSize:10.5}}>(min 8 characters)</span></Label>
                <input style={FW()} type="password" placeholder="Choose a password" value={pw} onChange={e=>setPw(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}
                  onKeyDown={e=>{if(e.key==="Enter"&&step1Valid)setStep(2);}}/>
              </div>
            </div>

            <button className="btn cta liquidGlass-wrapper" style={{width:"100%",justifyContent:"center"}}
              disabled={busy||!step1Valid} onClick={()=>{setErr("");setStep(isInviteMode?3:2);}}>
              <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Continue <ChevronRight size={16}/></div>
            </button>

            <p style={{fontSize:13,color:"var(--mut)",textAlign:"center",margin:0}}>
              Already have an account?{" "}
              <button type="button" onClick={resetToSignin}
                style={{border:0,background:"none",color:"var(--accent)",fontWeight:700,cursor:"pointer",fontSize:13}}>
                Sign in
              </button>
            </p>
          </>)}

          {/* ════ SIGN-UP STEP 2: role ════ */}
          {mode==="signup"&&step===2&&(<>
            <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
              <RoleCard id="athlete" label="Athlete" icon="🏆" desc="Build your profile from your results."/>
              <RoleCard id="association" label="Association" icon="⚓" desc="Manage results for your class association."/>
              <RoleCard id="club" label="Club" icon="🌊" desc="Host competitions for your yacht club."/>
              <RoleCard id="federation" label="Federation" icon="🏳️" desc="Govern your national sailing federation."/>
            </div>

            <div style={{display:"flex",gap:10}}>
              <button className="btn ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>setStep(1)}>
                <ArrowLeft size={15}/>Back
              </button>
              <button className="btn cta liquidGlass-wrapper" style={{flex:2,justifyContent:"center"}} disabled={busy} onClick={()=>{setErr("");setStep(3);}}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Continue <ChevronRight size={16}/></div>
              </button>
            </div>
          </>)}

          {/* ════ SIGN-UP STEP 3: name (all roles) + athlete extras ════ */}
          {mode==="signup"&&step===3&&(<>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}>
                <Label>First name</Label>
                <input style={FW()} placeholder="Casey" value={firstName} onChange={e=>setFirstName(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
              </div>
              <div style={{flex:1}}>
                <Label>Last name</Label>
                <input style={FW()} placeholder="Smith" value={lastName} onChange={e=>setLastName(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
              </div>
            </div>

            {/* Athlete-only extras — never shown in invite mode (host co-admin) */}
            {role==="athlete"&&!isInviteMode&&(<>
              <p style={{fontSize:12,color:"var(--mut)",margin:"-4px 0 0",lineHeight:1.5}}>
                Use your name <b>exactly as it appears in results</b> — this is how AthLink links your profile to your race history.
              </p>
              <div>
                <Label>Year of birth</Label>
                <input style={FW({maxWidth:140})} type="number" placeholder="e.g. 2003" min="1930" max={curYear}
                  value={birthYear} onChange={e=>setBirthYear(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
                {athleteAge!==null&&<span style={{marginLeft:10,fontSize:13,color:"var(--mut)",fontWeight:600}}>Age {athleteAge}</span>}
              </div>
              {isMinor&&(
                <div style={{background:"rgba(255,149,0,.08)",border:"1px solid rgba(255,149,0,.3)",borderRadius:12,padding:"14px 16px"}}>
                  <p style={{margin:"0 0 10px",fontSize:13,fontWeight:700,color:"#a85c00",display:"flex",alignItems:"center",gap:7}}>
                    <Clock size={14}/>Guardian approval required
                  </p>
                  <p style={{margin:"0 0 10px",fontSize:12.5,color:"#a85c00",lineHeight:1.5}}>
                    Athletes under 16 need a parent or guardian to approve their profile before it goes live. Enter their email and we'll send an approval link.
                  </p>
                  <Label>Guardian email</Label>
                  <input style={FW()} type="email" placeholder="parent@example.com" value={guardianEmail}
                    onChange={e=>setGuardianEmail(e.target.value)}
                    onFocus={e=>e.target.style.boxShadow="0 0 0 4px rgba(255,149,0,.3)"} onBlur={e=>e.target.style.boxShadow="none"}/>
                </div>
              )}
            </>)}

            <div style={{display:"flex",gap:10}}>
              <button className="btn ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>setStep(isInviteMode?1:2)}>
                <ArrowLeft size={15}/>Back
              </button>
              {/* Athlete finishes here; host advances to step 4; invite mode finishes here */}
              {(role==="athlete"||isInviteMode)
                ? <button className="btn cta liquidGlass-wrapper" style={{flex:2,justifyContent:"center"}} disabled={busy||!step3Valid} onClick={doSignUp}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">
                    {busy?<Loader2 size={15} className="spin"/>:null}
                    {isInviteMode?"Accept invitation":isMinor?"Send guardian approval":"Create account"}
                    </div>
                  </button>
                : <button className="btn cta liquidGlass-wrapper" style={{flex:2,justifyContent:"center"}} disabled={busy||!step3Valid} onClick={()=>{setErr("");setStep(4);}}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Continue <ChevronRight size={16}/></div>
                  </button>}
            </div>
          </>)}

          {/* ════ SIGN-UP STEP 4: "Find my club/association/federation" (hosts) ════ */}
          {mode==="signup"&&step===4&&isHost&&(<>

            {/* ── Invite code fast-path (top of step 4) ── */}
            {!localInviteCtx&&!addingNew&&(
              <div style={{background:"rgba(10,132,255,.05)",border:"1px solid rgba(10,132,255,.18)",borderRadius:12,padding:"13px 15px"}}>
                <p style={{margin:"0 0 9px",fontWeight:700,fontSize:13,color:"var(--navy)",display:"flex",alignItems:"center",gap:7}}>
                  <Link2 size={14}/>Got an invite code?
                </p>
                <div style={{display:"flex",gap:8}}>
                  <input style={{flex:1,border:"1px solid var(--line)",borderRadius:8,padding:"9px 12px",font:"inherit",fontSize:13.5,
                    letterSpacing:".08em",textTransform:"uppercase",outline:"none",fontFamily:"monospace",background:"rgba(255,255,255,.85)"}}
                    placeholder="XXXXXXXX" maxLength={8} value={inviteCodeInput}
                    onChange={e=>{ setInviteCodeInput(e.target.value.toUpperCase().replace(/[^A-Za-z0-9]/g,"")); setInviteCodeErr(""); }}
                    onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}
                    onKeyDown={async e=>{ if(e.key==="Enter"&&inviteCodeInput.length>=6) await applyInviteCode(); }}/>
                  <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"9px 14px",whiteSpace:"nowrap"}}
                    disabled={inviteCodeBusy||inviteCodeInput.length<6} onClick={applyInviteCode}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{inviteCodeBusy?<Loader2 size={13} className="spin"/>:null}Apply</div>
                  </button>
                </div>
                {inviteCodeErr&&<p style={{margin:"7px 0 0",fontSize:12,color:"#c0392b"}}>{inviteCodeErr}</p>}
              </div>
            )}
            {/* Accepted code: show success and skip the search UI */}
            {localInviteCtx&&(
              <div style={{background:"rgba(80,180,100,.1)",border:"1px solid rgba(80,180,100,.35)",borderRadius:12,padding:"13px 15px",display:"flex",alignItems:"center",gap:10}}>
                <CheckCircle size={16} style={{flex:"none",color:"#3a9e55"}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#2a7a3e"}}>Invite code accepted</div>
                  <div style={{fontSize:12.5,color:"#3a7048",marginTop:2}}>Joining as <b>{localInviteCtx.inv.role}</b>. Submit below to create your account with immediate access.</div>
                </div>
                <button className="btn ghost" style={{fontSize:11.5,padding:"4px 9px"}} onClick={()=>{setLocalInviteCtx(null);setInviteCodeInput("");}}>Change</button>
              </div>
            )}

            {!addingNew&&!localInviteCtx&&(<>
              <p style={{fontSize:13,color:"var(--mut)",margin:0,lineHeight:1.5}}>
                Search for your {hostKind} below and select it to request ownership. Can't find it? Add it.
              </p>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div style={{flex:1,position:"relative"}}>
                  <Search size={15} color="#9fb2c8" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)"}}/>
                  <input style={FW({paddingLeft:34})} placeholder={`Search ${hostKind}s…`} value={hostSearch}
                    onChange={e=>{setHostSearch(e.target.value);setSelectedHostId(null);}}
                    onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
                </div>
                <button className="btn ghost" style={{fontSize:13,padding:"10px 13px",whiteSpace:"nowrap"}} onClick={()=>{setAddingNew(true);setNewHostName(hostSearch);setSelectedHostId(null);}}>
                  <Plus size={15}/>Add a {hostKind}
                </button>
              </div>

              {/* Results list */}
              <div style={{maxHeight:240,overflowY:"auto",display:"flex",flexDirection:"column",gap:6,margin:"2px 0"}}>
                {filteredHosts.length===0&&(
                  <div style={{textAlign:"center",padding:"18px 0",color:"var(--mut)",fontSize:13}}>
                    No {hostKind}s found.{" "}
                    <button onClick={()=>{setAddingNew(true);setNewHostName(hostSearch);}} style={{border:0,background:"none",color:"var(--accent)",fontWeight:700,cursor:"pointer",fontSize:13}}>Add "{hostSearch||"new "+hostKind}"</button>
                  </div>
                )}
                {filteredHosts.map(h=>{
                  const on=selectedHostId===h.id;
                  return(
                    <button key={h.id} type="button" onClick={()=>setSelectedHostId(h.id)}
                      style={{display:"flex",alignItems:"center",gap:10,textAlign:"left",
                        border:"1.5px solid "+(on?"var(--accent)":"var(--line)"),
                        background:on?"rgba(10,132,255,.08)":"rgba(255,255,255,.6)",
                        borderRadius:12,padding:"11px 13px",cursor:"pointer",transition:".12s"}}>
                      <span style={{fontSize:18}}>{hostKind==="club"?"🌊":hostKind==="federation"?"🏳️":"⚓"}</span>
                      <span style={{flex:1,minWidth:0}}>
                        <span style={{display:"block",fontWeight:700,fontSize:13.5,color:on?"var(--accent)":"var(--navy)"}}>{h.name}</span>
                        <span style={{fontSize:11.5,color:"var(--mut)"}}>{h.scope==="INT"?"International":"Hong Kong"}</span>
                      </span>
                      {on&&<CheckCircle size={17} color="var(--accent)"/>}
                    </button>
                  );
                })}
              </div>
            </>)}

            {/* New host form */}
            {addingNew&&(<>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                <button className="cal-back" style={{color:"var(--accent)"}} onClick={()=>{setAddingNew(false);}}><ArrowLeft size={14}/>Back to search</button>
              </div>
              <div>
                <Label>{hostKind==="club"?"Club":hostKind==="federation"?"Federation":"Association"} name</Label>
                <input style={FW()} placeholder={hostKind==="club"?"e.g. Aberdeen Boat Club":"Name"} value={newHostName}
                  onChange={e=>setNewHostName(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
              </div>
              <div>
                <Label>Region</Label>
                <div className="seg" style={{alignSelf:"flex-start"}}>
                  <button className={newHostScope==="HK"?"on":""} onClick={()=>setNewHostScope("HK")}>Hong Kong</button>
                  <button className={newHostScope==="INT"?"on":""} onClick={()=>setNewHostScope("INT")}>International</button>
                </div>
              </div>
              {hostKind==="association"&&(
                <div><Label>Boat class</Label><ClassPicker value={classId} onChange={setClassId}/></div>
              )}
              {hostKind==="federation"&&(
                <div><Label>Governing country (IOC code)</Label>
                  <input style={FW({maxWidth:120,textTransform:"uppercase"})} placeholder="HKG" maxLength={3}
                    value={hostCountry} onChange={e=>setHostCountry(e.target.value.toUpperCase().slice(0,3))}
                    onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
                </div>
              )}
            </>)}

            {/* Pending-approval note — only for ownership claims, NOT invite-code joins (those are instant) */}
            {!localInviteCtx&&(
              <div style={{background:"rgba(10,132,255,.06)",border:"1px solid rgba(10,132,255,.16)",borderRadius:12,padding:"12px 14px",fontSize:12.5,color:"var(--navy)",lineHeight:1.5}}>
                <b>Heads up:</b> your ownership request is reviewed by the AthLink team. Until it's approved you'll browse as a guest — you'll get full host access once we verify you.
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <button className="btn ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>{addingNew?setAddingNew(false):setStep(3);}}>
                <ArrowLeft size={15}/>Back
              </button>
              <button className="btn cta liquidGlass-wrapper" style={{flex:2,justifyContent:"center"}} disabled={busy||!(localInviteCtx||step4Valid)} onClick={doSignUp}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">
                {busy?<Loader2 size={15} className="spin"/>:<BadgeCheck size={15}/>}
                {localInviteCtx?"Accept invitation & create account":addingNew?`Create ${hostKind} & request ownership`:"Request ownership"}
                </div>
              </button>
            </div>
          </>)}

        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Host members / trust management modal
   ───────────────────────────────────────────────────────────────────────
   - Claim: first signed-in user with no members becomes Owner (pending verify)
   - Member list with role badges + active/pending status
   - Grant / Deny pending requests
   - Promote to Owner / Demote to Editor
   - Revoke membership (can't remove the last Owner; only Owner can remove Owner)
   - Create single-use, 7-day invite links
   - Audit trail
   ═══════════════════════════════════════════════════════════════════════ */
function HostMembersModal({hostId,hostName,auth,myMembership,pendingClaims=[],pendingEventClaims=[],canVouch=false,onDecideClaim,onDecideEventClaim,onClose,onChanged,embedded=false,canManage=false}){
  const tok=auth?.token; const uid=auth?.user?.id;
  const[members,setMembers]=React.useState(null);
  const[invites,setInvites]=React.useState([]);
  const[audit,setAudit]=React.useState([]);
  const[memberNames,setMemberNames]=React.useState({});
  const[memberUsernames,setMemberUsernames]=React.useState({});
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");
  const[newInvite,setNewInvite]=React.useState(null); // {url,role}
  const[inviteRole,setInviteRole]=React.useState("editor");
  const[tab,setTab]=React.useState("members"); // members | claims | audit
  const[claimBusy,setClaimBusy]=React.useState(null); // claim id being decided

  const iAmOwner=(myMembership?.role==="owner"&&myMembership?.status==="active")||canManage;
  const iAmMember=(!!myMembership&&myMembership.status==="active")||canManage;
  const ownerCount=(members||[]).filter(m=>m.role==="owner"&&m.status==="active").length;

  const load=React.useCallback(async()=>{
    const[m,inv,a]=await Promise.all([
      fetchHostMembers(hostId,tok),
      fetchHostInvites(hostId,tok),
      fetchHostAudit(hostId,tok),
    ]);
    setMembers(m||[]); setInvites(inv||[]); setAudit(a||[]);
    const ids=[...new Set([...(m||[]).map(x=>x.user_id),...(a||[]).flatMap(x=>[x.actor_user_id,x.target_user_id])])].filter(Boolean);
    if(ids.length){ const {names,usernames}=await fetchProfileNames(ids,tok); setMemberNames(names); setMemberUsernames(usernames); }
  },[hostId,tok]);
  const displayName=(id)=>id?(memberNames[id]||`User ${id.slice(0,8)}`):"—";
  const usernameOf=(id)=>id?(memberUsernames[id]||null):null;
  React.useEffect(()=>{ load(); },[load]);

  const refresh=async()=>{ await load(); onChanged&&onChanged(); };

  // ── Claim host as first Owner ──
  const claim=async()=>{
    setErr("");setBusy(true);
    try{
      const r=await hostRest("host_members",{method:"POST",body:JSON.stringify({
        host_id:hostId,user_id:uid,role:"owner",status:"active",verified:false})},tok);
      if(!r) throw new Error("Couldn't claim this host.");
      await logHostAudit(hostId,uid,"claim",uid,"first owner",tok);
      await refresh();
    }catch(e){setErr(e.message||"Claim failed.");}
    finally{setBusy(false);}
  };

  // ── Grant / Deny a pending request ──
  const grant=async(m)=>{
    setBusy(true);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"PATCH",body:JSON.stringify({status:"active"})},tok);
    await logHostAudit(hostId,uid,"grant",m.user_id,m.role,tok);
    await refresh();setBusy(false);
  };
  const deny=async(m)=>{
    setBusy(true);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"DELETE"},tok);
    await logHostAudit(hostId,uid,"deny",m.user_id,null,tok);
    await refresh();setBusy(false);
  };
  // ── Promote / Demote ──
  const setMemberRole=async(m,role)=>{
    if(role!=="owner"&&m.role==="owner"&&ownerCount<=1){setErr("Can't demote the last owner.");return;}
    setBusy(true);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"PATCH",body:JSON.stringify({role})},tok);
    await logHostAudit(hostId,uid,role==="owner"?"promote":"demote",m.user_id,role,tok);
    await refresh();setBusy(false);
  };
  // ── Revoke ──
  const revoke=async(m)=>{
    if(m.role==="owner"&&!iAmOwner){setErr("Only an owner can remove another owner.");return;}
    if(m.role==="owner"&&ownerCount<=1){setErr("Can't remove the last owner.");return;}
    setBusy(true);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"DELETE"},tok);
    await logHostAudit(hostId,uid,"revoke",m.user_id,m.role,tok);
    await refresh();setBusy(false);
  };
  // ── Create invite link (single use, 7 days) ──
  const createInvite=async()=>{
    setErr("");setBusy(true);
    try{
      const token=randToken();
      const shortCode=randShortCode();
      const expires=new Date(Date.now()+7*24*3600*1000).toISOString();
      const r=await hostRest("host_invites",{method:"POST",body:JSON.stringify({
        token,short_code:shortCode,host_id:hostId,role:inviteRole,created_by:uid,expires_at:expires})},tok);
      if(!r) throw new Error("Couldn't create invite.");
      await logHostAudit(hostId,uid,"invite",null,inviteRole,tok);
      const url=`${window.location.origin}${window.location.pathname}?invite=${token}`;
      setNewInvite({url,role:inviteRole,shortCode});
      await load();
    }catch(e){setErr(e.message||"Invite failed.");}
    finally{setBusy(false);}
  };
  const revokeInvite=async(t)=>{
    setBusy(true);
    await hostRest(`host_invites?token=eq.${encodeURIComponent(t)}`,{method:"DELETE"},tok);
    await load();setBusy(false);
  };
  const copy=(txt)=>{try{navigator.clipboard.writeText(txt);}catch{}};

  const shortId=(id)=>id?id.slice(0,8):"—";
  const RoleBadge=({role})=><span style={{fontSize:10,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",
    color:role==="owner"?"#7a5600":"var(--navy)",background:role==="owner"?"rgba(255,200,40,.22)":"var(--sky)",
    borderRadius:980,padding:"2px 9px"}}>{role}</span>;

  const pending=(members||[]).filter(m=>m.status==="pending");
  const active=(members||[]).filter(m=>m.status==="active");
  const noMembers=members!==null&&members.length===0;

  const body=(
        <div style={{padding:embedded?0:"18px 24px 24px",display:"flex",flexDirection:"column",gap:16}}>
          {err&&<div style={{background:"rgba(200,50,50,.1)",border:"1px solid rgba(200,50,50,.3)",borderRadius:10,padding:"9px 13px",fontSize:12.5,color:"#c0392b"}}>{err}</div>}

          {members===null&&<div style={{display:"flex",alignItems:"center",gap:8,color:"var(--mut)",fontSize:13}}><Loader2 size={15} className="spin"/>Loading members…</div>}

          {/* ── Claim panel (no members yet, I'm not a member) ── */}
          {noMembers&&!myMembership&&(
            <div style={{textAlign:"center",padding:"10px 0"}}>
              <p style={{margin:"0 0 6px",fontWeight:700,fontSize:15,color:"var(--navy)"}}>This host has no owner yet</p>
              <p style={{margin:"0 0 16px",fontSize:13,color:"var(--mut)",lineHeight:1.5}}>
                Claim <b>{hostName}</b> to become its first Owner. Your access will be activated once the AthLink team verifies your account.
              </p>
              <button className="btn cta liquidGlass-wrapper" style={{justifyContent:"center"}} disabled={busy} onClick={claim}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={15} className="spin"/>:<BadgeCheck size={15}/>}Claim as Owner</div>
              </button>
            </div>
          )}

          {/* ── My pending status ── */}
          {myMembership?.status==="pending"&&(
            <div style={{background:"rgba(255,149,0,.08)",border:"1px solid rgba(255,149,0,.3)",borderRadius:12,padding:"12px 15px",fontSize:13,color:"#a85c00"}}>
              <Clock size={14} style={{verticalAlign:"-2px",marginRight:6}}/>
              Your request to join is pending approval from an owner.
            </div>
          )}
          {myMembership&&myMembership.status==="active"&&!myMembership.verified&&!canManage&&(
            <div style={{background:"rgba(10,132,255,.07)",border:"1px solid rgba(10,132,255,.2)",borderRadius:12,padding:"12px 15px",fontSize:13,color:"var(--navy)"}}>
              You're an active <b>{myMembership.role}</b>, pending AthLink verification before import/edit access is enabled.
            </div>
          )}

          {/* ── Tabs (active members or managers) ── */}
          {iAmMember&&(<>
            <div className="seg" style={{alignSelf:"flex-start"}}>
              <button className={tab==="members"?"on":""} onClick={()=>setTab("members")}>Members</button>
              <button className={tab==="claims"?"on":""} onClick={()=>setTab("claims")}>Profile claims{pendingClaims.length>0?` (${pendingClaims.length})`:""}</button>
              <button className={tab==="eventclaims"?"on":""} onClick={()=>setTab("eventclaims")}>Competition claims{pendingEventClaims.length>0?` (${pendingEventClaims.length})`:""}</button>
              <button className={tab==="audit"?"on":""} onClick={()=>setTab("audit")}>Audit log</button>
            </div>

            {tab==="members"&&(<>
              {/* Pending requests */}
              {pending.length>0&&(
                <div>
                  <p className="seclabel" style={{margin:"0 0 8px"}}>Pending requests</p>
                  {pending.map(m=>(
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--line)"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{displayName(m.user_id)}{usernameOf(m.user_id)&&<span style={{marginLeft:6,fontSize:12,color:"var(--mut)",fontWeight:500}}>@{usernameOf(m.user_id)}</span>}</div>
                        <div style={{fontSize:11.5,color:"var(--mut)"}}>requested {m.role}</div>
                      </div>
                      <button className="btn green" style={{fontSize:12,padding:"5px 11px"}} disabled={busy} onClick={()=>grant(m)}><CheckCircle size={13}/>Grant</button>
                      <button className="btn ghost" style={{fontSize:12,padding:"5px 11px"}} disabled={busy} onClick={()=>deny(m)}>Deny</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Active members */}
              <div>
                <p className="seclabel" style={{margin:"0 0 8px"}}>Members</p>
                {active.map(m=>{
                  const isMe=m.user_id===uid;
                  return(
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--line)"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{displayName(m.user_id)}{usernameOf(m.user_id)&&<span style={{marginLeft:6,fontSize:12,color:"var(--mut)",fontWeight:500}}>@{usernameOf(m.user_id)}</span>}{isMe?" (you)":""}{!m.verified&&<span style={{marginLeft:6,fontSize:10.5,color:"#a85c00",fontWeight:700}}>unverified</span>}</div>
                      </div>
                      <RoleBadge role={m.role}/>
                      {!isMe&&(
                        <>
                          {m.role==="editor"
                            ? <button className="btn ghost" style={{fontSize:11.5,padding:"4px 9px"}} disabled={busy} onClick={()=>setMemberRole(m,"owner")}>Make owner</button>
                            : (iAmOwner&&ownerCount>1&&<button className="btn ghost" style={{fontSize:11.5,padding:"4px 9px"}} disabled={busy} onClick={()=>setMemberRole(m,"editor")}>Make editor</button>)}
                          {!(m.role==="owner"&&(!iAmOwner||ownerCount<=1))&&(
                            <button className="delbtn" title="Remove" disabled={busy} onClick={()=>revoke(m)}><Trash2 size={15}/></button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Invites */}
              <div>
                <p className="seclabel" style={{margin:"0 0 8px"}}>Invite a co-admin</p>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <div className="seg">
                    <button className={inviteRole==="editor"?"on":""} onClick={()=>setInviteRole("editor")}>Editor</button>
                    <button className={inviteRole==="owner"?"on":""} onClick={()=>setInviteRole("owner")}>Owner</button>
                  </div>
                  <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"7px 13px"}} disabled={busy} onClick={createInvite}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Link2 size={14}/>Create invite link</div>
                  </button>
                </div>
                {newInvite&&(
                  <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8,background:"var(--sky)",borderRadius:10,padding:"10px 13px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10.5,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:"var(--mut)",marginBottom:3}}>Invite link</div>
                        <input readOnly value={newInvite.url} style={{width:"100%",border:0,background:"none",font:"inherit",fontSize:11.5,color:"var(--navy)",outline:"none"}} onClick={e=>e.target.select()}/>
                      </div>
                      <button className="btn ghost" style={{fontSize:12,padding:"5px 11px",whiteSpace:"nowrap"}} onClick={()=>copy(newInvite.url)}><ClipboardPaste size={13}/>Copy link</button>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,borderTop:"1px solid var(--line)",paddingTop:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10.5,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:"var(--mut)",marginBottom:2}}>Short code</div>
                        <span style={{fontFamily:"monospace",fontSize:15,fontWeight:700,letterSpacing:".12em",color:"var(--navy)"}}>{newInvite.shortCode}</span>
                      </div>
                      <button className="btn ghost" style={{fontSize:12,padding:"5px 11px",whiteSpace:"nowrap"}} onClick={()=>copy(newInvite.shortCode||"")}><ClipboardPaste size={13}/>Copy code</button>
                    </div>
                  </div>
                )}
                {invites.filter(i=>!i.used_at&&new Date(i.expires_at)>new Date()).length>0&&(
                  <div style={{marginTop:10}}>
                    {invites.filter(i=>!i.used_at&&new Date(i.expires_at)>new Date()).map(i=>(
                      <div key={i.token} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--mut)",padding:"5px 0"}}>
                        <Link2 size={12}/>
                        <span style={{flex:1}}>{i.role} · expires {new Date(i.expires_at).toLocaleDateString()}</span>
                        <span style={{fontFamily:"monospace",fontWeight:700,fontSize:12,letterSpacing:".06em",color:"var(--navy)",marginRight:2}}>{i.short_code||"—"}</span>
                        <button className="btn ghost" style={{fontSize:11,padding:"3px 9px"}} onClick={()=>copy(`${window.location.origin}${window.location.pathname}?invite=${i.token}`)}>Copy link</button>
                        <button className="btn ghost" style={{fontSize:11,padding:"3px 9px"}} disabled={!i.short_code} onClick={()=>copy(i.short_code||"")}>Copy code</button>
                        <button className="delbtn" title="Revoke invite" onClick={()=>revokeInvite(i.token)}><X size={13}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>)}

            {tab==="claims"&&(
              <div>
                <p style={{fontSize:12.5,color:"var(--mut)",margin:"0 0 12px",lineHeight:1.5}}>
                  Athletes who've claimed a profile that appears in <b>{hostName}</b>'s results. Approving vouches for them and adds a verified badge.
                </p>
                {!canVouch&&<div style={{background:"rgba(255,149,0,.08)",border:"1px solid rgba(255,149,0,.3)",borderRadius:10,padding:"9px 13px",fontSize:12.5,color:"#a85c00",marginBottom:10}}>Your account must be verified before you can vouch for athletes.</div>}
                {pendingClaims.length===0&&<p style={{fontSize:13,color:"var(--mut)"}}>No pending profile claims for this host's athletes.</p>}
                {pendingClaims.map(c=>(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--line)"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:700,color:"var(--ink)"}}>{c.profile_name}</div>
                      <div style={{fontSize:11.5,color:"var(--mut)"}}>claimed by user {c.user_id?.slice(0,8)} · {new Date(c.created_at).toLocaleDateString()}</div>
                    </div>
                    <button className="btn green" style={{fontSize:12,padding:"5px 11px"}} disabled={!canVouch||claimBusy===c.id}
                      onClick={async()=>{setClaimBusy(c.id);await onDecideClaim(c,true);setClaimBusy(null);}}>
                      {claimBusy===c.id?<Loader2 size={13} className="spin"/>:<CheckCircle size={13}/>}Approve
                    </button>
                    <button className="btn ghost" style={{fontSize:12,padding:"5px 11px"}} disabled={!canVouch||claimBusy===c.id}
                      onClick={async()=>{setClaimBusy(c.id);await onDecideClaim(c,false);setClaimBusy(null);}}>Deny</button>
                  </div>
                ))}
              </div>
            )}

            {tab==="eventclaims"&&(
              <div>
                <p style={{fontSize:12.5,color:"var(--mut)",margin:"0 0 12px",lineHeight:1.5}}>
                  Competitions contributed by another host and attributed to <b>{hostName}</b> as organizer. Approving confirms <b>{hostName}</b> ran the event — it then appears in this portal.
                </p>
                {!canVouch&&<div style={{background:"rgba(255,149,0,.08)",border:"1px solid rgba(255,149,0,.3)",borderRadius:10,padding:"9px 13px",fontSize:12.5,color:"#a85c00",marginBottom:10}}>Your account must be verified before you can approve competition claims.</div>}
                {pendingEventClaims.length===0&&<p style={{fontSize:13,color:"var(--mut)"}}>No pending competition claims for this host.</p>}
                {pendingEventClaims.map(c=>(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--line)"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:700,color:"var(--ink)"}}>{c._eventName||"(event)"}</div>
                      <div style={{fontSize:11.5,color:"var(--mut)"}}>claimed by user {c.user_id?.slice(0,8)}{c.ts?` · ${new Date(c.ts).toLocaleDateString()}`:""}{c.detail?` · ${c.detail}`:""}</div>
                    </div>
                    <button className="btn green" style={{fontSize:12,padding:"5px 11px"}} disabled={!canVouch||claimBusy===c.id}
                      onClick={async()=>{setClaimBusy(c.id);await onDecideEventClaim(c,true);setClaimBusy(null);}}>
                      {claimBusy===c.id?<Loader2 size={13} className="spin"/>:<CheckCircle size={13}/>}Approve
                    </button>
                    <button className="btn ghost" style={{fontSize:12,padding:"5px 11px"}} disabled={!canVouch||claimBusy===c.id}
                      onClick={async()=>{setClaimBusy(c.id);await onDecideEventClaim(c,false);setClaimBusy(null);}}>Deny</button>
                  </div>
                ))}
              </div>
            )}

            {tab==="audit"&&(
              <div>
                {audit.length===0&&<p style={{fontSize:13,color:"var(--mut)"}}>No actions logged yet.</p>}
                {audit.map(a=>(
                  <div key={a.id} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:"1px solid var(--line)",fontSize:12.5}}>
                    <span style={{fontWeight:700,color:"var(--navy)",minWidth:64,textTransform:"capitalize"}}>{a.action}</span>
                    <span style={{flex:1,color:"var(--mut)"}}>
                      by {displayName(a.actor_user_id)}{a.target_user_id?` → ${displayName(a.target_user_id)}`:""}{a.detail?` · ${a.detail}`:""}
                    </span>
                    <span style={{color:"var(--mut)",whiteSpace:"nowrap"}}>{new Date(a.ts).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </div>
  );
  if(embedded) return body;
  return(
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:560}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <BadgeCheck size={18}/>
          <h3 style={{flex:1}}>{hostName} — Members</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        {body}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Dev-only "Pending approvals" panel
   ───────────────────────────────────────────────────────────────────────
   Lists every unverified host_members row across all hosts. For each:
   - Approve  → set verified=true (host gains full access)
   - Delete   → remove membership; if it was a newly-created host with no
                results and no other members, delete the portal too
   - Reassign → move the membership to a different host (wrong-club fix)
   ═══════════════════════════════════════════════════════════════════════ */
function DevApprovalsModal({auth,hosts,nameForHost,eventCountFor,memberCountFor,onApprove,onDelete,onReassign,onClose}){
  const tok=auth?.token;
  const[rows,setRows]=React.useState(null);
  const[names,setNames]=React.useState({});
  const[busyId,setBusyId]=React.useState(null);
  const[reassignFor,setReassignFor]=React.useState(null); // membership row being reassigned
  const[reassignSearch,setReassignSearch]=React.useState("");

  const load=React.useCallback(async()=>{
    const r=await fetchUnverifiedMembers(tok);
    setRows(r||[]);
    const {names}=await fetchProfileNames((r||[]).map(x=>x.user_id),tok);
    setNames(names);
  },[tok]);
  React.useEffect(()=>{load();},[load]);

  const nameFor=(id)=>id?(names[id]||`User ${id.slice(0,8)}`):"—";

  const[confirm,setConfirm]=React.useState(null);
  const doApprove=async(m)=>{setBusyId(m.id);await onApprove(m);await load();setBusyId(null);};
  const doDelete=(m)=>setConfirm({
    title:"Delete request?",
    message:`Delete ${nameFor(m.user_id)}'s ${m.role} request for "${nameForHost(m.host_id)}"?`,
    confirmLabel:"Delete",
    onConfirm:async()=>{setBusyId(m.id);await onDelete(m);await load();setBusyId(null);}});
  const doReassign=async(m,newHostId)=>{
    setBusyId(m.id);await onReassign(m,newHostId);setReassignFor(null);setReassignSearch("");await load();setBusyId(null);
  };

  const reassignOptions=(hosts||[]).filter(h=>!reassignSearch.trim()||h.name.toLowerCase().includes(reassignSearch.toLowerCase()));

  return(<>
    <ConfirmModal state={confirm} onClose={()=>setConfirm(null)}/>
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <BadgeCheck size={18}/>
          <h3 style={{flex:1}}>Pending approvals <span style={{fontWeight:400,opacity:.6,fontSize:14}}>(dev)</span></h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{padding:"18px 24px 24px"}}>
          {rows===null&&<div style={{display:"flex",alignItems:"center",gap:8,color:"var(--mut)",fontSize:13}}><Loader2 size={15} className="spin"/>Loading…</div>}
          {rows!==null&&rows.length===0&&<p style={{fontSize:13,color:"var(--mut)",margin:0}}>No pending host approvals.</p>}
          {(rows||[]).map(m=>{
            const evCount=eventCountFor(m.host_id);
            const memCount=memberCountFor?memberCountFor(m.host_id):null;
            const isReassigning=reassignFor===m.id;
            return(
              <div key={m.id} style={{borderBottom:"1px solid var(--line)",padding:"12px 0"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13.5,fontWeight:700,color:"var(--ink)"}}>{nameForHost(m.host_id)}</div>
                    <div style={{fontSize:12,color:"var(--mut)"}}>
                      {nameFor(m.user_id)} · {m.role} · requested {new Date(m.created_at).toLocaleDateString()}
                      {" · "}<span style={{color:evCount>0?"var(--mut)":"#c8860a"}}>{evCount} result{evCount===1?"":"s"}</span>
                    </div>
                  </div>
                  <button className="btn green" style={{fontSize:12,padding:"5px 11px"}} disabled={busyId===m.id} onClick={()=>doApprove(m)}>
                    {busyId===m.id?<Loader2 size={13} className="spin"/>:<CheckCircle size={13}/>}Approve
                  </button>
                  <button className="btn ghost" style={{fontSize:12,padding:"5px 11px"}} disabled={busyId===m.id} onClick={()=>{setReassignFor(isReassigning?null:m.id);setReassignSearch("");}}>
                    <Pencil size={12}/>Reassign
                  </button>
                  <button className="delbtn" title="Delete request" disabled={busyId===m.id} onClick={()=>doDelete(m)}><Trash2 size={15}/></button>
                </div>
                {isReassigning&&(
                  <div style={{marginTop:10,background:"var(--grouped)",borderRadius:10,padding:"10px 12px"}}>
                    <p style={{margin:"0 0 7px",fontSize:12,color:"var(--mut)",fontWeight:600}}>Move this request to a different host:</p>
                    <input style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 11px",font:"inherit",fontSize:13,marginBottom:8,outline:"none"}}
                      placeholder="Search hosts…" value={reassignSearch} onChange={e=>setReassignSearch(e.target.value)}/>
                    <div style={{maxHeight:160,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                      {reassignOptions.map(h=>(
                        <button key={h.id} disabled={h.id===m.host_id} onClick={()=>doReassign(m,h.id)}
                          style={{textAlign:"left",border:"1px solid var(--line)",background:h.id===m.host_id?"var(--grouped)":"#fff",
                            borderRadius:8,padding:"7px 10px",fontSize:12.5,cursor:h.id===m.host_id?"default":"pointer",
                            color:h.id===m.host_id?"var(--mut)":"var(--navy)",fontWeight:600}}>
                          {h.name} <span style={{fontWeight:400,color:"var(--mut)"}}>· {h.type}{h.id===m.host_id?" (current)":""}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </>);
}

/* ═══════════════════════════════════════════════════════════════════════
   Dev-only "All profiles" panel
   ───────────────────────────────────────────────────────────────────────
   Lists every profile row across all hosts (for test cleanup). For each:
   - shows name / email-less id / role / host memberships / created date
   - Delete → removes the profile + its memberships + claims (hard delete)
   Filter to quickly find empty test accounts.
   ═══════════════════════════════════════════════════════════════════════ */
function DevProfilesModal({auth,nameForHost,hosts=[],onClose}){
  const tok=auth?.token;
  const[profiles,setProfiles]=React.useState(null);
  const[members,setMembers]=React.useState([]);
  const[busyId,setBusyId]=React.useState(null);
  const[q,setQ]=React.useState("");
  const[onlyEmpty,setOnlyEmpty]=React.useState(false);
  const[editId,setEditId]=React.useState(null);      // profile being reassigned
  const[addHost,setAddHost]=React.useState("");       // host id to add membership to
  const[addRole,setAddRole]=React.useState("editor");

  const load=React.useCallback(async()=>{
    const[p,m]=await Promise.all([fetchAllProfiles(tok),fetchAllMembers(tok)]);
    setProfiles(p||[]); setMembers(m||[]);
  },[tok]);
  React.useEffect(()=>{load();},[load]);

  const membersFor=(uid)=>members.filter(m=>m.user_id===uid);
  const nameOf=(p)=>`${p.first_name||""} ${p.last_name||""}`.trim()||p.display_name||(p.username?"@"+p.username:null)||`User ${String(p.user_id).slice(0,8)}`;

  const[confirm,setConfirm]=React.useState(null);
  const del=(p)=>setConfirm({
    title:"Delete profile?",
    message:`Delete profile "${nameOf(p)}" and all its memberships?\n\nThis cannot be undone.`,
    confirmLabel:"Delete",
    onConfirm:async()=>{setBusyId(p.user_id);await devDeleteProfile(p.user_id,tok);await load();setBusyId(null);}});
  // ── Reassign helpers (persisted to host_members) ──
  const patchMember=async(m,patch)=>{
    setBusyId(m.user_id);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"PATCH",body:JSON.stringify(patch)},tok);
    await load(); setBusyId(null);
  };
  const removeMember=async(m)=>{
    setBusyId(m.user_id);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"DELETE"},tok);
    await load(); setBusyId(null);
  };
  const addMembership=async(p)=>{
    if(!addHost) return;
    setBusyId(p.user_id);
    await hostRest("host_members",{method:"POST",body:JSON.stringify({
      host_id:addHost,user_id:p.user_id,role:addRole,status:"active",verified:true})},tok);
    setAddHost(""); await load(); setBusyId(null);
  };

  const rows=(profiles||[]).filter(p=>{
    const mem=membersFor(p.user_id);
    if(onlyEmpty&&mem.length>0) return false;
    if(!q.trim()) return true;
    const hay=`${nameOf(p)} ${p.username||""} ${p.role||""} ${mem.map(m=>nameForHost(m.host_id)).join(" ")}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return(<>
    <ConfirmModal state={confirm} onClose={()=>setConfirm(null)}/>
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:680}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <Users size={18}/>
          <h3 style={{flex:1}}>All profiles <span style={{fontWeight:400,opacity:.6,fontSize:14}}>(dev)</span></h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{padding:"16px 24px 24px"}}>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:180,position:"relative"}}>
              <Search size={14} color="#9fb2c8" style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)"}}/>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search profiles…"
                style={{width:"100%",border:"1px solid var(--line)",borderRadius:9,padding:"8px 11px 8px 32px",font:"inherit",fontSize:13,outline:"none",background:"rgba(255,255,255,.85)"}}/>
            </div>
            <span style={{fontSize:12,color:"var(--mut)",fontWeight:600}}>{rows.length} shown</span>
          </div>
          {profiles===null&&<div style={{display:"flex",alignItems:"center",gap:8,color:"var(--mut)",fontSize:13}}><Loader2 size={15} className="spin"/>Loading profiles…</div>}
          {profiles!==null&&rows.length===0&&<p style={{fontSize:13,color:"var(--mut)",margin:0}}>No profiles match.</p>}
          <div style={{maxHeight:"60vh",overflowY:"auto"}}>
            {rows.map(p=>{
              const mem=membersFor(p.user_id);
              const editing=editId===p.user_id;
              return(
                <div key={p.user_id} style={{padding:"11px 0",borderBottom:"1px solid var(--line)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:700,color:"var(--ink)"}}>{nameOf(p)}{p.username&&<span style={{marginLeft:6,fontSize:11.5,color:"var(--mut)",fontWeight:600}}>@{p.username}</span>}</div>
                      <div style={{fontSize:11.5,color:"var(--mut)",marginTop:2}}>
                        <span style={{textTransform:"capitalize"}}>{p.role||"guest"}</span>
                        {mem.length>0&&<> · {mem.map(m=>`${nameForHost(m.host_id)} (${m.role}${m.verified?"":", unverified"})`).join(", ")}</>}
                        {p.created_at?<> · {new Date(p.created_at).toLocaleDateString()}</>:null}
                      </div>
                    </div>
                    <button className="btn ghost" style={{fontSize:12,padding:"6px 10px",...(editing?{background:"var(--accent)",color:"#fff"}:{})}} onClick={()=>{setEditId(editing?null:p.user_id);setAddHost("");}}>
                      <Pencil size={12}/>Reassign
                    </button>
                    <button className="delbtn" title="Delete profile" disabled={busyId===p.user_id} onClick={()=>del(p)}>
                      {busyId===p.user_id?<Loader2 size={15} className="spin"/>:<Trash2 size={15}/>}
                    </button>
                  </div>
                  {editing&&(
                    <div style={{marginTop:10,background:"var(--grouped)",borderRadius:10,padding:"10px 12px"}}>
                      {/* Existing memberships: change role, verify, remove */}
                      {mem.length===0&&<div style={{fontSize:12,color:"var(--mut)",marginBottom:8}}>No memberships yet.</div>}
                      {mem.map(m=>(
                        <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}>
                          <span style={{fontSize:12.5,fontWeight:600,color:"var(--navy)",flex:1,minWidth:120}}>{nameForHost(m.host_id)}</span>
                          <div className="seg" style={{fontSize:11}}>
                            <button className={m.role==="owner"?"on":""} onClick={()=>patchMember(m,{role:"owner"})}>Owner</button>
                            <button className={m.role==="editor"?"on":""} onClick={()=>patchMember(m,{role:"editor"})}>Editor</button>
                          </div>
                          <button className="btn ghost" style={{fontSize:11.5,padding:"5px 9px",...(m.verified?{color:"#2e9e5b"}:{})}} onClick={()=>patchMember(m,{verified:!m.verified})}>
                            {m.verified?<><CheckCircle size={12}/>Verified</>:<><Clock size={12}/>Unverified</>}
                          </button>
                          <button className="delbtn" title="Remove from host" onClick={()=>removeMember(m)}><Trash2 size={13}/></button>
                        </div>
                      ))}
                      {/* Add membership to a different host */}
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:6,paddingTop:10,borderTop:"1px solid var(--line)"}}>
                        <select value={addHost} onChange={e=>setAddHost(e.target.value)}
                          style={{flex:1,minWidth:140,border:"1px solid var(--line)",borderRadius:8,padding:"7px 9px",font:"inherit",fontSize:12.5,background:"#fff"}}>
                          <option value="">Add to host…</option>
                          {hosts.filter(h=>!mem.some(m=>m.host_id===h.id)).map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
                        </select>
                        <div className="seg" style={{fontSize:11}}>
                          <button className={addRole==="owner"?"on":""} onClick={()=>setAddRole("owner")}>Owner</button>
                          <button className={addRole==="editor"?"on":""} onClick={()=>setAddRole("editor")}>Editor</button>
                        </div>
                        <button className="btn cta liquidGlass-wrapper" style={{fontSize:12,padding:"6px 11px"}} disabled={!addHost||busyId===p.user_id} onClick={()=>addMembership(p)}>
                          <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Plus size={13}/>Add</div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  </>);
}

/* ═══════════════════════════════════════════════════════════════════════
   Guided athlete-claim modal — surfaces auto-built profiles whose name is
   similar to the signed-in athlete, each expandable to a mini result
   preview, with a one-tap "This is me — claim". A fallback button opens the
   full all-athletes page for manual search. Uses existing data only
   (people list + aggregate) — no new storage.
   ═══════════════════════════════════════════════════════════════════════ */
function ClaimProfileModal({myName="",people=[],events=[],alreadyClaimed=null,onClaim,onSearchAll,onClose}){
  const[q,setQ]=React.useState(myName||"");
  const[openName,setOpenName]=React.useState(null);
  const[busy,setBusy]=React.useState(null);
  const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
  const myTokens=norm(myName).split(" ").filter(Boolean);
  const qn=norm(q);
  const scored=React.useMemo(()=>{
    const qTokens=qn.split(" ").filter(Boolean);
    return people.map(p=>{
      const pn=norm(p.name);
      const pTokens=pn.split(" ").filter(Boolean);
      let score=0;
      for(const t of qTokens){ if(pTokens.includes(t))score+=2; else if(t.length>=3&&pn.includes(t))score+=1; }
      for(const t of myTokens){ if(pTokens.includes(t))score+=0.5; }
      return{name:p.name,score};
    })
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name))
    .slice(0,40);
  },[qn,people]);
  const claim=async(name)=>{ setBusy(name); try{await onClaim(name);}finally{setBusy(null);} };
  return(
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:560}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <BadgeCheck size={18}/>
          <h3 style={{flex:1}}>Claim your profile</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{padding:"14px 24px 24px"}}>
          {alreadyClaimed
            ? <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 4px",lineHeight:1.45}}>You've already claimed <b style={{color:"var(--navy)"}}>{alreadyClaimed}</b>. You can only claim one profile.</p>
            : <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 12px",lineHeight:1.45}}>Find the auto-built profile that's you, preview the results, and claim it. A verified host admin from a competition you sailed will confirm it.</p>}
          {!alreadyClaimed&&<>
          <div style={{position:"relative",marginBottom:14}}>
            <Search size={14} color="#9fb2c8" style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)"}}/>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Type your name…"
              style={{width:"100%",border:"1px solid var(--line)",borderRadius:9,padding:"9px 11px 9px 32px",font:"inherit",fontSize:13.5,outline:"none",background:"rgba(255,255,255,.85)"}}/>
          </div>
          <div style={{maxHeight:"52vh",overflowY:"auto",margin:"0 -4px"}}>
            {qn&&scored.length===0&&<p style={{fontSize:13,color:"var(--mut)",margin:"6px 4px"}}>No profiles match "{q}". Try a different spelling, or search the full list below.</p>}
            {!qn&&scored.length===0&&<p style={{fontSize:13,color:"var(--mut)",margin:"6px 4px"}}>Type your name to find your profile.</p>}
            {scored.map(({name})=>{
              const open=openName===name;
              const ag=open?aggregate(name,events):null;
              const recent=ag?.history?.[0];
              const attrs=ATHLETE_ATTRS.get(canonName(name));
              const nug=attrs?.recentCls?nuggetFor(attrs.recentCls,attrs.recentSub):null;
              return(
                <div key={name} style={{padding:"0 4px",borderBottom:"1px solid var(--line)"}}>
                  <div onClick={()=>setOpenName(open?null:name)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 6px",cursor:"pointer"}}>
                    <div className="av" style={{background:avatarColor(name),width:34,height:34,fontSize:13,flex:"none"}}>{initials(name)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:"var(--ink)",display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>{name}{nug&&<span className="cls" style={{background:nug.color,fontSize:10,padding:"1px 8px"}}>{nug.label}</span>}</div>
                    </div>
                    <ChevronRight size={15} color="#9fb2c8" style={{flex:"none",transform:open?"rotate(90deg)":"none",transition:".15s"}}/>
                  </div>
                  {open&&(
                    <div style={{padding:"2px 8px 12px 50px"}}>
                      {ag.events>0?(<>
                        <div style={{display:"flex",gap:16,marginBottom:8}}>
                          <span style={{fontSize:12.5,color:"var(--mut)"}}><b style={{color:"var(--navy)",fontSize:14}}>{ag.events}</b> comps</span>
                          <span style={{fontSize:12.5,color:"var(--mut)"}}><b style={{color:"var(--navy)",fontSize:14}}>{ag.best?"#"+ag.best:"—"}</b> best</span>
                          <span style={{fontSize:12.5,color:"var(--mut)"}}><b style={{color:"var(--navy)",fontSize:14}}>{ag.podiums}</b> podiums</span>
                        </div>
                        {recent&&<div style={{fontSize:12,color:"var(--mut)",marginBottom:10,display:"flex",alignItems:"center",gap:6}}><Trophy size={12} style={{flex:"none"}}/>Latest: {recent.ev.name} · {recent.ev.date} · #{recent.row.rank}</div>}
                      </>):<div style={{fontSize:12.5,color:"var(--mut)",marginBottom:10}}>No competition results on this profile yet.</div>}
                      <button className="btn cta liquidGlass-wrapper" disabled={busy===name} onClick={()=>claim(name)} style={{fontSize:13}}>
                        <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy===name?<Loader2 size={14} className="spin"/>:<BadgeCheck size={14}/>}This is me — claim</div>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>}
          <button className="btn ghost" onClick={onSearchAll} style={{marginTop:16,width:"100%",fontSize:13,padding:"9px 12px"}}>
            <Search size={13}/>{alreadyClaimed?"Browse all athletes":"Search the full athlete list instead"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Verified-owner profile edit modal — lets the approved owner (or dev) set
   the presentation extras that aren't derived from PDFs: photo, display
   name, nationality, bio, and an Instagram link. Results stay PDF-sourced.
   Photo uploads go to the public `athlete-photos` storage bucket.
   ═══════════════════════════════════════════════════════════════════════ */
// Google-style circular photo cropper: drag to reposition + zoom slider, then
// renders the visible circle to a square canvas and returns a JPEG blob.
// initialSrc may be a File or an existing image URL; a "Change image" button
// lets the user swap in a different file without leaving the cropper.
function PhotoCropper({initialSrc=null,onCancel,onConfirm}){
  const V=288, OUT=512;
  const[src,setSrc]=React.useState(initialSrc); // File | url string | null
  const[img,setImg]=React.useState(null);
  const[base,setBase]=React.useState(1);
  const[scale,setScale]=React.useState(1);
  const[off,setOff]=React.useState({x:0,y:0});
  const[busy,setBusy]=React.useState(false);
  const drag=React.useRef(null);
  const fileRef=React.useRef(null);
  React.useEffect(()=>{
    if(!src){setImg(null);return;}
    const isFile=typeof src!=="string";
    const url=isFile?URL.createObjectURL(src):src;
    const im=new Image();
    if(!isFile) im.crossOrigin="anonymous";   // allow canvas export of stored photos
    im.onload=()=>{
      const b=Math.max(V/im.naturalWidth,V/im.naturalHeight);
      setImg(im);setBase(b);setScale(1);
      setOff({x:(V-im.naturalWidth*b)/2,y:(V-im.naturalHeight*b)/2});
    };
    im.onerror=()=>setImg(null);
    im.src=url;
    return()=>{ if(isFile) URL.revokeObjectURL(url); };
  },[src]);
  const eff=base*scale;
  const dispW=img?img.naturalWidth*eff:0;
  const dispH=img?img.naturalHeight*eff:0;
  const clamp=(o)=>({x:Math.min(0,Math.max(V-dispW,o.x)),y:Math.min(0,Math.max(V-dispH,o.y))});
  React.useEffect(()=>{ if(img) setOff(o=>clamp(o)); /* re-clamp on zoom */ },[scale,img]);// eslint-disable-line
  const pt=e=>e.touches?e.touches[0]:e;
  const onDown=e=>{if(!img)return;const p=pt(e);drag.current={sx:p.clientX,sy:p.clientY,ox:off.x,oy:off.y};};
  const onMove=e=>{if(!drag.current)return;const p=pt(e);setOff(clamp({x:drag.current.ox+(p.clientX-drag.current.sx),y:drag.current.oy+(p.clientY-drag.current.sy)}));};
  const onUp=()=>{drag.current=null;};
  const pickFile=e=>{const f=e.target.files?.[0];e.target.value="";if(f)setSrc(f);};
  const confirm=()=>{
    if(!img)return; setBusy(true);
    try{
      const c=document.createElement("canvas");c.width=OUT;c.height=OUT;
      const ctx=c.getContext("2d");
      const sSize=V/eff, sx=(-off.x)/eff, sy=(-off.y)/eff;
      ctx.drawImage(img,sx,sy,sSize,sSize,0,0,OUT,OUT);
      c.toBlob(b=>onConfirm(b),"image/jpeg",0.9);
    }catch(e){console.error("crop export",e);setBusy(false);onConfirm(null);}
  };
  return(
    <div className="ov" style={{zIndex:120}} onClick={onCancel}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:360}}>
        <div className="mhead" style={{padding:"16px 22px"}}><Upload size={16}/><h3 style={{flex:1}}>Position photo</h3><button className="x" onClick={onCancel}><X size={16}/></button></div>
        <div style={{padding:"18px 22px 22px",display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
            style={{position:"relative",width:V,height:V,borderRadius:"50%",overflow:"hidden",cursor:img?"grab":"default",background:"#0b1f38",boxShadow:"inset 0 0 0 2px rgba(255,255,255,.45)",touchAction:"none",userSelect:"none",display:"grid",placeItems:"center"}}>
            {img
              ? <img src={img.src} alt="" draggable={false} style={{position:"absolute",left:off.x,top:off.y,width:dispW,height:dispH,maxWidth:"none",pointerEvents:"none"}}/>
              : <span style={{color:"#9fbdd9",fontSize:12.5,padding:"0 30px",textAlign:"center"}}>Choose an image below</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,width:"100%",margin:"16px 0 4px",opacity:img?1:.4}}>
            <span style={{fontSize:11,fontWeight:700,color:"var(--mut)"}}>ZOOM</span>
            <input type="range" min="1" max="4" step="0.01" disabled={!img} value={scale} onChange={e=>setScale(parseFloat(e.target.value))} style={{flex:1}}/>
          </div>
          <p style={{fontSize:11.5,color:"var(--mut)",margin:"4px 0 0"}}>Drag to reposition · slide to zoom</p>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{display:"none"}}/>
          <button className="btn ghost" onClick={()=>fileRef.current&&fileRef.current.click()} style={{marginTop:12,fontSize:12.5,padding:"7px 13px"}}><Upload size={13}/>Change image</button>
          <div style={{display:"flex",gap:10,width:"100%",marginTop:12}}>
            <button className="btn cta liquidGlass-wrapper" disabled={busy||!img} onClick={confirm} style={{flex:1}}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={14} className="spin"/>:<CheckCircle size={14}/>}Use photo</div></button>
            <button className="btn ghost" onClick={onCancel} style={{padding:"0 16px"}}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Athlete media gallery — popup opened from the profile (button between
   Calendar and Instagram). Shows photos + uploaded videos. The verified owner
   (or dev) can add, caption, remove, and save; visitors get a read-only gallery
   with a click-to-expand lightbox. Files upload to the athlete-photos bucket
   via uploadMedia; the array persists to athlete_profiles.media via onSaveMedia.
   ═══════════════════════════════════════════════════════════════════════ */
const MAX_MEDIA_MB=50;
function MediaModal({name,media,canEdit,uploadMedia,onSaveMedia,onClose}){
  const[items,setItems]=React.useState(Array.isArray(media)?media:[]);
  const[uploading,setUploading]=React.useState(false);
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");
  const[light,setLight]=React.useState(null); // index in lightbox, or null
  const dirty=JSON.stringify(items)!==JSON.stringify(Array.isArray(media)?media:[]);

  const onPick=async(e)=>{
    const files=Array.from(e.target.files||[]); e.target.value="";
    if(!files.length) return;
    setErr(""); setUploading(true);
    const added=[];
    for(const f of files){
      if(f.size>MAX_MEDIA_MB*1024*1024){setErr(`"${f.name}" is over ${MAX_MEDIA_MB}MB — please upload a smaller file.`);continue;}
      const res=await uploadMedia(f);
      if(res&&res.url) added.push({url:res.url,type:res.type||"image",caption:""});
      else setErr("Upload failed — make sure you're signed in and try again.");
    }
    if(added.length) setItems(prev=>[...prev,...added]);
    setUploading(false);
  };
  const setCaption=(i,v)=>setItems(prev=>prev.map((it,j)=>j===i?{...it,caption:v.slice(0,140)}:it));
  const remove=(i)=>setItems(prev=>prev.filter((_,j)=>j!==i));
  const save=async()=>{ setBusy(true); try{ await onSaveMedia(name,items); onClose(); }catch(e){console.error("media save",e);setErr("Couldn't save. Try again.");setBusy(false);} };

  const tile={position:"relative",borderRadius:12,overflow:"hidden",background:"var(--grouped,#eef3f9)",aspectRatio:"1 / 1",cursor:"pointer"};
  const mediaFit={width:"100%",height:"100%",objectFit:"cover",display:"block"};
  return(<>
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:720}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <LayoutGrid size={18}/>
          <h3 style={{flex:1}}>{name} — Media</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{padding:"18px 24px 24px"}}>
          {canEdit&&(
            <div style={{marginBottom:14,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <label className="btn cta liquidGlass-wrapper" style={{cursor:uploading?"default":"pointer"}}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/>
                <div className="liquidGlass-text">{uploading?<Loader2 size={14} className="spin"/>:<Upload size={14}/>}{uploading?"Uploading…":"Add photos or videos"}</div>
                <input type="file" accept="image/*,video/*" multiple disabled={uploading} style={{display:"none"}} onChange={onPick}/>
              </label>
              <span style={{fontSize:11.5,color:"var(--mut)"}}>Images & video, up to {MAX_MEDIA_MB}MB each.</span>
            </div>
          )}
          {err&&<div style={{fontSize:12.5,color:"#c0392b",margin:"0 0 12px"}}>{err}</div>}
          {items.length===0
            ? <div style={{padding:"38px 0",textAlign:"center",color:"var(--mut)",fontSize:13.5}}>{canEdit?"No media yet — add photos or videos to showcase your sailing.":"No media yet."}</div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {items.map((it,i)=>(
                  <div key={i}>
                    <div style={tile} onClick={()=>setLight(i)}>
                      {it.type==="video"
                        ? <><video src={it.url} style={mediaFit} muted playsInline preload="metadata"/>
                            <div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",pointerEvents:"none"}}>
                              <span style={{width:38,height:38,borderRadius:"50%",background:"rgba(8,24,45,.62)",color:"#fff",display:"grid",placeItems:"center",fontSize:15,paddingLeft:3}}>▶</span>
                            </div></>
                        : <img src={it.url} alt={it.caption||""} style={mediaFit}/>}
                      {canEdit&&<button onClick={e=>{e.stopPropagation();remove(i);}} title="Remove"
                        style={{position:"absolute",top:6,right:6,width:26,height:26,borderRadius:980,border:0,background:"rgba(8,24,45,.66)",color:"#fff",display:"grid",placeItems:"center",cursor:"pointer"}}><Trash2 size={13}/></button>}
                    </div>
                    {canEdit
                      ? <input value={it.caption||""} onChange={e=>setCaption(i,e.target.value)} placeholder="Caption (optional)"
                          style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"6px 8px",font:"inherit",fontSize:12,marginTop:6,outline:"none",background:"rgba(255,255,255,.9)"}}/>
                      : (it.caption?<div style={{fontSize:12,color:"var(--mut)",marginTop:6,lineHeight:1.4}}>{it.caption}</div>:null)}
                  </div>
                ))}
              </div>}
          {canEdit&&(
            <div style={{display:"flex",gap:10,marginTop:18}}>
              <button className="btn cta liquidGlass-wrapper" disabled={busy||uploading||!dirty} onClick={save} style={{flex:1}}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={14} className="spin"/>:<CheckCircle size={14}/>}Save changes</div>
              </button>
              <button className="btn ghost" onClick={onClose} style={{padding:"0 18px"}}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
    {light!=null&&items[light]&&(
      <div className="ov" style={{zIndex:120,background:"rgba(6,18,36,.86)"}} onClick={()=>setLight(null)}>
        <div onClick={e=>e.stopPropagation()} style={{maxWidth:"92vw",maxHeight:"88vh",position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
          <button className="x" onClick={()=>setLight(null)} style={{position:"absolute",top:-6,right:-6,zIndex:2}}><X size={18}/></button>
          {items.length>1&&<button onClick={()=>setLight((light-1+items.length)%items.length)} title="Previous"
            style={{position:"absolute",left:-52,top:"50%",transform:"translateY(-50%)",width:40,height:40,borderRadius:980,border:0,background:"rgba(255,255,255,.16)",color:"#fff",cursor:"pointer",fontSize:18}}>‹</button>}
          {items[light].type==="video"
            ? <video src={items[light].url} controls autoPlay playsInline style={{maxWidth:"92vw",maxHeight:"80vh",borderRadius:12,background:"#000"}}/>
            : <img src={items[light].url} alt={items[light].caption||""} style={{maxWidth:"92vw",maxHeight:"80vh",borderRadius:12,objectFit:"contain"}}/>}
          {items.length>1&&<button onClick={()=>setLight((light+1)%items.length)} title="Next"
            style={{position:"absolute",right:-52,top:"50%",transform:"translateY(-50%)",width:40,height:40,borderRadius:980,border:0,background:"rgba(255,255,255,.16)",color:"#fff",cursor:"pointer",fontSize:18}}>›</button>}
          {items[light].caption&&<div style={{color:"#dce8f8",fontSize:13,textAlign:"center",maxWidth:640}}>{items[light].caption}</div>}
        </div>
      </div>
    )}
  </>);
}

function AthleteEditModal({name,profile,onSaveExtras,onRename,onSaveUsername,uploadPhoto,onClose}){
  const parts=(name||"").trim().split(/\s+/);
  const[first,setFirst]=React.useState(parts.length>1?parts.slice(0,-1).join(" "):(parts[0]||""));
  const[last,setLast]=React.useState(parts.length>1?parts[parts.length-1]:"");
  const[username,setUsername]=React.useState(usernameForName(name));
  const[uErr,setUErr]=React.useState("");
  const[bio,setBio]=React.useState(profile?.bio||"");
  const[insta,setInsta]=React.useState(profile?.instagram_url||"");
  const[nat,setNat]=React.useState(profile?.nat_override||"");
  const[photo,setPhoto]=React.useState(profile?.photo_url||"");
  const[cropOpen,setCropOpen]=React.useState(false);
  const[uploading,setUploading]=React.useState(false);
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");
  const field={width:"100%",border:"1px solid var(--line)",borderRadius:9,padding:"9px 11px",font:"inherit",fontSize:13.5,outline:"none",background:"rgba(255,255,255,.9)"};
  const lbl={fontSize:11.5,fontWeight:700,color:"var(--mut)",textTransform:"uppercase",letterSpacing:".03em",margin:"0 0 5px"};

  const onCropped=async(blob)=>{
    setCropOpen(false); if(!blob){setErr("Couldn't process that image — try another.");return;}
    setUploading(true);
    const url=await uploadPhoto(blob);
    setUploading(false);
    if(url) setPhoto(url); else setErr("Photo upload failed — make sure you're signed in.");
  };
  const normIg=(v)=>{
    let ig=(v||"").trim(); if(!ig) return null;
    if(ig.startsWith("@")) return `https://instagram.com/${ig.slice(1)}`;
    if(/^https?:\/\//i.test(ig)) return ig;
    if(/instagram\.com/i.test(ig)) return `https://${ig}`;
    return `https://instagram.com/${ig.replace(/^\/+/,"")}`;
  };
  const save=async()=>{
    setBusy(true); setErr(""); setUErr("");
    const newName=`${first} ${last}`.trim()||name;
    const patch={bio:bio.trim()||null,instagram_url:normIg(insta),nat_override:(nat||"").trim().toUpperCase()||null,photo_url:photo||null};
    try{
      if(newName!==name) await onRename(name,newName);   // rename follows ownership + migrates extras key
      await onSaveExtras(newName,patch);
      // Public username (URL). Save last so it keys off the final name.
      if(onSaveUsername&&(username||"").trim()&&username.trim()!==usernameForName(newName)){
        const r=await onSaveUsername(newName,username.trim());
        if(r&&r.error){setUErr(r.error);setBusy(false);return;}
      }
      onClose(newName);
    }catch(e){console.error("athlete edit save",e);setErr("Couldn't save changes. Try again.");setBusy(false);}
  };
  return(<>
    {cropOpen&&<PhotoCropper initialSrc={photo||null} onCancel={()=>setCropOpen(false)} onConfirm={onCropped}/>}
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <Pencil size={17}/>
          <h3 style={{flex:1}}>Edit profile</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{padding:"18px 24px 24px"}}>
          {/* Photo (click to edit/crop) with small label, name fields to the right */}
          <div style={{display:"flex",gap:16,marginBottom:16,alignItems:"flex-start"}}>
            <div style={{flex:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
              <div onClick={()=>!uploading&&setCropOpen(true)} title="Click to edit photo"
                style={{width:96,height:96,borderRadius:"50%",overflow:"hidden",cursor:uploading?"default":"pointer"}}>
                {uploading
                  ? <div className="av" style={{width:96,height:96,background:"var(--navy)"}}><Loader2 size={22} className="spin"/></div>
                  : photo
                    ? <img src={photo} alt="" style={{width:96,height:96,objectFit:"cover",display:"block"}}/>
                    : <div className="av" style={{width:96,height:96,fontSize:30,background:avatarColor(name)}}>{initials(name)}</div>}
              </div>
              <button type="button" onClick={()=>!uploading&&setCropOpen(true)} style={{border:0,background:"none",cursor:"pointer",fontSize:10.5,fontWeight:700,color:"var(--accent)",padding:0,letterSpacing:".02em"}}>click to edit</button>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <p style={lbl}>First name</p>
              <input value={first} onChange={e=>setFirst(e.target.value)} style={{...field,marginBottom:11}}/>
              <p style={lbl}>Last name</p>
              <input value={last} onChange={e=>setLast(e.target.value)} style={field}/>
            </div>
          </div>
          {/* Public username — drives the profile URL (athlink.win/<username>) */}
          <div style={{marginBottom:14}}>
            <p style={lbl}>Profile link (username)</p>
            <div style={{display:"flex",alignItems:"center",gap:0,...field,padding:0,overflow:"hidden"}}>
              <span style={{padding:"9px 2px 9px 11px",fontSize:13.5,color:"var(--mut)",whiteSpace:"nowrap"}}>athlink.win/</span>
              <input value={username}
                onChange={e=>{setUsername(e.target.value.replace(/[^A-Za-z0-9]/g,"").slice(0,30));setUErr("");}}
                placeholder="CaseyLaw"
                style={{flex:1,minWidth:0,border:0,outline:"none",background:"transparent",font:"inherit",fontSize:13.5,padding:"9px 11px 9px 0"}}/>
            </div>
            {uErr
              ? <div style={{fontSize:12,color:"#c0392b",marginTop:5,fontWeight:600}}>{uErr}</div>
              : <div style={{fontSize:11,color:"var(--mut)",marginTop:4}}>Letters and numbers only. This is your shareable link.</div>}
          </div>
          {/* Nationality — dropdown, on the row below the photo */}
          <div style={{marginBottom:14}}>
            <p style={lbl}>Nationality</p>
            <CountrySelect value={nat} onChange={setNat} placeholder="Select country (overrides sail-number guess)"/>
          </div>
          {/* Instagram */}
          <div style={{marginBottom:14}}>
            <p style={lbl}>Instagram</p>
            <input value={insta} onChange={e=>setInsta(e.target.value)} placeholder="@handle or full link" style={field}/>
          </div>
          {/* Bio */}
          <div style={{marginBottom:8}}>
            <p style={lbl}>Bio</p>
            <textarea value={bio} onChange={e=>setBio(e.target.value.slice(0,600))} rows={4} placeholder="A short bio (optional)" style={{...field,resize:"vertical",lineHeight:1.5}}/>
            <div style={{fontSize:11,color:"var(--mut)",textAlign:"right",marginTop:2}}>{bio.length}/600</div>
          </div>
          {err&&<div style={{fontSize:12.5,color:"#c0392b",margin:"4px 0 10px"}}>{err}</div>}
          <div style={{display:"flex",gap:10,marginTop:10}}>
            <button className="btn cta liquidGlass-wrapper" disabled={busy||uploading} onClick={save} style={{flex:1}}>
              <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={14} className="spin"/>:<CheckCircle size={14}/>}Save changes</div>
            </button>
            <button className="btn ghost" onClick={onClose} style={{padding:"0 18px"}}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </>);
}

/* ═══════════════════════════════════════════════════════════════════════
   Host portal edit modal — tabbed: Details (name + location + globe) and
   Members (embedded member management). Owners/editors/dev use this to rename
   the host, set its location (→ globe by the title), and manage co-admins.
   ═══════════════════════════════════════════════════════════════════════ */
function HostEditModal({host,onSave,onSaveSlug,onClose,canManage,membersProps}){
  const[tab,setTab]=React.useState("details");
  const[name,setName]=React.useState(host?.name||"");
  const[country,setCountry]=React.useState(host?.country||"");
  const[slug,setSlug]=React.useState(host?.slug||pascalSlug(host?.name||""));
  const[slugErr,setSlugErr]=React.useState("");
  const[busy,setBusy]=React.useState(false);
  const iso=IOC_ISO[(country||"").toUpperCase()]||"";
  const barStyle={width:"100%",border:"0",borderRadius:980,padding:"13px 18px",font:"inherit",fontSize:15,outline:"none",
    background:"rgba(255,255,255,.55)",backdropFilter:"blur(28px) saturate(195%)",WebkitBackdropFilter:"blur(28px) saturate(195%)",
    boxShadow:"inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.5),0 1px 3px rgba(0,0,0,.05)",transition:"box-shadow .16s"};
  const save=async()=>{
    setBusy(true); setSlugErr("");
    await onSave({name:name.trim()||host.name,country:(country||"").toUpperCase()||null});
    // Public slug (URL). Saved separately so a "taken" clash can be reported.
    if(onSaveSlug&&(slug||"").trim()&&slug.trim()!==(host?.slug||pascalSlug(host?.name||""))){
      const r=await onSaveSlug(host.id,slug.trim());
      if(r&&r.error){setSlugErr(r.error);setBusy(false);return;}
    }
    setBusy(false); onClose();
  };
  return(
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:860}}>
        <div className="mhead" style={{padding:"20px 28px"}}>
          <Settings size={20}/><h3 style={{flex:1}}>Edit page</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        {canManage&&(
          <div className="seg" style={{margin:"18px 28px 0"}}>
            <button className={tab==="details"?"on":""} onClick={()=>setTab("details")}>Details</button>
            <button className={tab==="members"?"on":""} onClick={()=>setTab("members")}>Members</button>
          </div>
        )}
        <div style={{padding:"22px 28px 28px"}}>
          {tab==="details"&&(
            <div style={{display:"flex",gap:24,alignItems:"flex-start"}}>
              {/* Globe left — top aligns with name bar, bottom aligns with the buttons */}
              <div style={{flex:"0 0 200px"}}>
                {iso
                  ? <SailingGlobe countryData={{[iso]:1}} height={200} dark mini bare hostIso={iso}/>
                  : <div style={{width:200,height:200,borderRadius:16,background:"rgba(31,78,128,.06)",border:"1px dashed rgba(31,78,128,.25)",display:"grid",placeItems:"center",color:"var(--mut)",fontSize:12,textAlign:"center",padding:16}}>Enter a location code to show a globe</div>}
              </div>
              {/* Right column: name → location (tight) → buttons (pushed to bottom = globe bottom) */}
              <div style={{flex:1,minWidth:0,minHeight:200,display:"flex",flexDirection:"column"}}>
                <div>
                  <label style={{fontSize:12,fontWeight:700,color:"var(--mut)",display:"block",marginBottom:6}}>Name</label>
                  <input value={name} onChange={e=>setName(e.target.value)} style={barStyle}/>
                </div>
                <div style={{marginTop:14}}>
                  <label style={{fontSize:12,fontWeight:700,color:"var(--mut)",display:"block",marginBottom:6}}>Public link <span style={{fontWeight:400}}>(username)</span></label>
                  <div style={{...barStyle,display:"flex",alignItems:"center",padding:0,overflow:"hidden"}}>
                    <span style={{padding:"13px 2px 13px 18px",fontSize:15,color:"var(--mut)",whiteSpace:"nowrap"}}>athlink.win/</span>
                    <input value={slug}
                      onChange={e=>{setSlug(e.target.value.replace(/[^A-Za-z0-9]/g,"").slice(0,30));setSlugErr("");}}
                      placeholder="HKSF"
                      style={{flex:1,minWidth:0,border:0,outline:"none",background:"transparent",font:"inherit",fontSize:15,padding:"13px 18px 13px 0"}}/>
                  </div>
                  {slugErr&&<div style={{fontSize:12,color:"#c0392b",marginTop:6,fontWeight:600}}>{slugErr}</div>}
                </div>
                <div style={{marginTop:14}}>
                  <label style={{fontSize:12,fontWeight:700,color:"var(--mut)",display:"block",marginBottom:6}}>Location <span style={{fontWeight:400}}>(IOC country code)</span></label>
                  <div style={{position:"relative"}}>
                    <input value={country} onChange={e=>setCountry(e.target.value.toUpperCase().slice(0,3))} placeholder="HKG" maxLength={3} style={{...barStyle,paddingRight:46}}/>
                    {iso&&<span style={{position:"absolute",right:18,top:"50%",transform:"translateY(-50%)",fontSize:17,pointerEvents:"none"}}>{iocFlag(country)}</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:10,marginTop:"auto",paddingTop:18}}>
                  <button className="btn ghost" style={{flex:1,justifyContent:"center"}} onClick={onClose}>Cancel</button>
                  <button className="btn cta liquidGlass-wrapper" style={{flex:2,justifyContent:"center"}} disabled={busy} onClick={save}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={15} className="spin"/>:<CheckCircle size={15}/>}Save changes</div>
                  </button>
                </div>
              </div>
            </div>
          )}
          {tab==="members"&&canManage&&membersProps&&(
            <HostMembersModal {...membersProps} embedded canManage/>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AthLinkMVP(){
  const[events,setEvents]=useState([]);
  const[showDevProfiles,setShowDevProfiles]=useState(false);    // dev-only all-profiles panel
  const[showHostEdit,setShowHostEdit]=useState(false);          // host portal edit modal
  const[hostsVersion,setHostsVersion]=useState(0);  // bump to re-render after host registry changes
  const reloadHosts=async()=>{
    const rows=await sbGet("hosts?select=*");
    if(rows) applyDbHosts(rows);
    setHostsVersion(v=>v+1);
  };
  // ── Custom boat classes (global, in-memory) ──
  // State mirrors the module-level CUSTOM_CLASSES registry so the UI re-renders.
  const[customClasses,setCustomClasses]=useState(CUSTOM_CLASSES);
  const[classNote,setClassNote]=useState(null); // {name} — toast when a custom class couldn't be persisted
  // Persist a custom class to the DB, verifying the write actually landed.
  // hostRest resolves null on failure (never rejects), so the result must be
  // checked — the old fire-and-forget .catch silently lost classes. Failures
  // (and signed-out adds, e.g. dev mode) go to the localStorage queue and are
  // re-tried on the next signed-in load.
  const persistCustomClass=async(cc)=>{
    if(!(auth?.user?.id&&auth?.token)){queuePendingCustomClass(cc);return;}
    const res=await insertCustomClass(cc,auth.user.id,auth.token); // [] = duplicate (fine), null = failed
    if(res===null){queuePendingCustomClass(cc);setClassNote({name:cc.short});}
    else dropPendingCustomClass(cc.canonical);
  };
  // Add (or reuse) a custom class by name. Dedups on canonical key; returns the
  // class id so the caller can select it. Persists to custom_classes so it
  // survives reloads and appears for everyone (queued + retried if it can't be
  // written right now).
  const addCustomClass=(name)=>{
    const nm=String(name||"").trim();
    if(!nm) return null;
    const canonical=canonClass(nm);
    if(!canonical) return null;
    const existing=CUSTOM_CLASSES.find(c=>c.canonical===canonical);
    if(existing) return existing.id;
    const color=CUSTOM_CLASS_PALETTE[CUSTOM_CLASSES.length%CUSTOM_CLASS_PALETTE.length];
    const cc={id:`custom:${canonical}`,short:nm,full:nm,color,canonical};
    CUSTOM_CLASSES=[...CUSTOM_CLASSES,cc];
    setCustomClasses(CUSTOM_CLASSES);
    persistCustomClass(cc);
    return cc.id;
  };
  const[auth,setAuth]=useState(null);
  const[showSignIn,setShowSignIn]=useState(false);
  const[accountOpen,setAccountOpen]=useState(false);
  const[myMemberships,setMyMemberships]=useState([]);  // host_members rows for the signed-in user
  const[showMembers,setShowMembers]=useState(false);   // members-management panel open
  const[inviteRedeemed,setInviteRedeemed]=useState(null); // {hostId,status} after redeeming an invite link
  const[allClaims,setAllClaims]=useState([]);          // every athlete_claims row (for badges + admin review)
  const[allEventClaims,setAllEventClaims]=useState([]);// every event_claims row (host claims on contributed events)
  const[claimNote,setClaimNote]=useState(null);        // toast after submitting a claim
  const[showClaimModal,setShowClaimModal]=useState(false); // guided claim modal open
  const[athleteProfiles,setAthleteProfiles]=useState({});  // name_key -> athlete_profiles row (owner extras)
  const[showAthEdit,setShowAthEdit]=useState(null);        // profile name being edited by its owner
  const[showMedia,setShowMedia]=useState(null);            // profile name whose media gallery is open
  const[savingResults,setSavingResults]=useState(null);    // "draft" | "publish" while the preview save runs
  const[pendingHostNotice,setPendingHostNotice]=useState(null); // hostId — shows "pending approval" toast after host signup
  const[pendingInviteToken,setPendingInviteToken]=useState(null); // raw token from ?invite= URL param
  const[showDevApprovals,setShowDevApprovals]=useState(false);  // dev-only pending-approvals panel
  const[showUsername,setShowUsername]=useState(false);          // username-creation modal
  const[usernameInput,setUsernameInput]=useState("");
  const[usernameBusy,setUsernameBusy]=useState(false);
  const[usernameErr,setUsernameErr]=useState("");
  const[navSearchOpen,setNavSearchOpen]=useState(false); // top-bar nav pill flipped into search mode
  const[barHidden,setBarHidden]=useState(false);  // hide topbar on scroll-down
  const[portalMenuOpen,setPortalMenuOpen]=useState(false); // in-portal sidebar menu
  // ── DEVELOPER VIEW ──────────────────────────────────────────────────────
  // Lets Casey edit the platform without signing in. Forces full (association)
  // access. ALWAYS starts OFF on every page load — dev view is strictly opt-in
  // per session via Ctrl/Cmd+Shift+D. No URL param, no localStorage, so nobody
  // ever lands in dev mode by accident (or by keeping a stale ?dev=1 link).
  const DEV_VIEW_ENABLED=true;
  const ADMIN_EMAIL="casey@athlink.win";
  const isAdminUser=(auth?.user?.email||"").toLowerCase()===ADMIN_EMAIL;
  const devEligible=DEV_VIEW_ENABLED||isAdminUser;
  const[devMode,setDevMode]=useState(false); // never auto-on — keyboard shortcut only
  useEffect(()=>{
    if(!devEligible){ setDevMode(false); return; }
    const onKey=(e)=>{ if((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key==="D"||e.key==="d")){
      e.preventDefault();
      setDevMode(d=>!d);
    }};
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[devEligible]);
  const effectiveRole=devMode?"association":(auth?.profile?.role||"guest");
  const role=effectiveRole;
  const canEditRole=effectiveRole==="association";
  // A profile is "verified-claimed" if any approved claim exists for that name.
  const profileVerified=(nm)=>allClaims.some(c=>c.status==="approved"&&c.profile_name?.toLowerCase()===String(nm||"").toLowerCase());
  // The signed-in user's claim row for a given profile name (or null).
  const myClaimFor=(nm)=>auth?.user?.id?allClaims.find(c=>c.user_id===auth.user.id&&c.profile_name?.toLowerCase()===String(nm||"").toLowerCase())||null:null;
  const canEditProfileOf=(nm)=>devMode
    ||(effectiveRole==="athlete"&&auth?.profile?.athlete_name&&auth.profile.athlete_name.toLowerCase()===String(nm||"").toLowerCase())
    ||(!!myClaimFor(nm)&&myClaimFor(nm).status==="approved");
  // googleOnboarding: {token, user} — set when a Google sign-in returns with no profile yet
  const[googleOnboarding,setGoogleOnboarding]=useState(null);
  useEffect(()=>{
    if(!AUTH_BASE) return;
    // ── Detect Supabase OAuth return (access_token in URL hash) ──────────────
    const hash=window.location.hash;
    if(hash&&hash.includes("access_token")){
      const params=new URLSearchParams(hash.replace(/^#/,""));
      const tok=params.get("access_token");
      // Clean the hash from the URL immediately
      window.history.replaceState(null,"",window.location.pathname+window.location.search);
      if(tok){
        (async()=>{
          try{
            const u=await authUser(tok);
            if(!u) return;
            const prof=await fetchProfile(u.id,tok);
            if(prof){
              // Returning Google user with an existing profile → sign straight in
              onAuthed({token:tok,user:u,profile:prof});
            } else {
              // New Google user — needs role/name onboarding
              setGoogleOnboarding({token:tok,user:u});
              setShowSignIn(true);
            }
          }catch(e){console.error("OAuth return error:",e);}
        })();
        return; // skip localStorage restore below
      }
    }
    // ── Restore persisted session ─────────────────────────────────────────────
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
  // Load memberships for a specific auth object (used right after sign-in,
  // where the reloadMemberships closure would still hold the old/null auth).
  const loadMembershipsFor=async(a2)=>{
    if(!a2?.user?.id||!a2?.token){setMyMemberships([]);return;}
    const rows=await fetchMyMemberships(a2.user.id,a2.token);
    if(rows) setMyMemberships(rows);
  };
  const onAuthed=(a2)=>{ setAuth(a2); setShowSignIn(false); setGoogleOnboarding(null);
    if(a2.pendingHostId) setPendingHostNotice(a2.pendingHostId);
    try{localStorage.setItem("athlink_auth",JSON.stringify({token:a2.token,profile:a2.profile}));}catch{}
    loadMembershipsFor(a2); };
  const signOut=()=>{ setAuth(null); setAccountOpen(false); setMyMemberships([]); try{localStorage.removeItem("athlink_auth");}catch{} };
  // Save host portal edits (name + location). Persists to the hosts table and
  // updates the in-memory registry so the change shows immediately.
  const saveHost=async(hostId,patch)=>{
    // Update local registry immediately (optimistic).
    const h=hostById(hostId);
    if(h){ if(patch.name!=null)h.name=patch.name; if("country"in patch)h.country=patch.country; }
    setHostsVersion(v=>v+1);
    // Persist. PATCH alone silently no-ops if the row was never inserted
    // (the 11 defaults aren't in the hosts table until seeded), so UPSERT:
    // a PATCH that affects 0 rows is followed by an INSERT carrying the full record.
    try{
      const patched=await sbPatch("hosts",`id=eq.${encodeURIComponent(hostId)}`,patch);
      const hit=Array.isArray(patched)&&patched.length>0;
      if(!hit&&h){
        const row={id:h.id,type:h.type,scope:h.scope||"HK",name:h.name,
          ...(h.cls?{cls:h.cls}:{}),...(h.country?{country:h.country}:{})};
        await sbPost("hosts",row);
      }
    }catch(e){console.error("saveHost persist",e);}
  };
  // ── Save a username to the user's profile (unique, lowercase, alnum + underscore) ──
  const saveUsername=async()=>{
    const u=usernameInput.trim().toLowerCase().replace(/[^a-z0-9_]/g,"");
    if(u.length<3){setUsernameErr("Usernames are at least 3 characters (letters, numbers, underscore).");return;}
    if(!auth?.user?.id||!auth?.token){setUsernameErr("Please sign in again.");return;}
    setUsernameBusy(true);setUsernameErr("");
    try{
      // Availability check is best-effort (RLS may block reading others' rows).
      // The DB unique index is the real guard, so a blocked check is non-fatal.
      try{
        const existing=await hostRest(`profiles?username=eq.${encodeURIComponent(u)}&select=user_id`,{},auth.token);
        if(existing&&existing.length>0&&existing[0].user_id!==auth.user.id){
          setUsernameErr("That username is taken. Try another.");setUsernameBusy(false);return;
        }
      }catch{}
      const saved=await upsertProfile({user_id:auth.user.id,username:u},auth.token);
      if(saved===null){
        const e=upsertProfile._lastError||"";
        if(/username/i.test(e)&&/column|schema|does not exist|find/i.test(e))
          setUsernameErr("The username field isn't set up yet — run profiles_username_migration.sql in Supabase.");
        else if(/duplicate|unique/i.test(e))
          setUsernameErr("That username is taken. Try another.");
        else
          setUsernameErr("Couldn't save: "+(e?e.slice(0,120):"unknown error")+".");
        setUsernameBusy(false);return;
      }
      setAuth(a=>a?{...a,profile:{...a.profile,username:u}}:a);
      try{const raw=localStorage.getItem("athlink_auth");if(raw){const s=JSON.parse(raw);s.profile={...(s.profile||{}),username:u};localStorage.setItem("athlink_auth",JSON.stringify(s));}}catch{}
      setShowUsername(false);setUsernameInput("");
    }catch(e){setUsernameErr("Couldn't save that username — please try again.");}
    finally{setUsernameBusy(false);}
  };

  // ── Signup host callbacks (create new host / register pending owner) ──
  // Creates a host row in `hosts` and adds it to the local registry; returns {id}.
  const createHostFromSignup=async(spec,tok)=>{
    const name=(spec.name||"").trim(); if(!name) return null;
    const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,32)||"host";
    const id=slug+"-"+Math.random().toString(36).slice(2,6);
    const payload={id,type:spec.type,scope:spec.scope||"HK",name,
      cls:spec.type==="association"?spec.cls:null,
      country:spec.type==="federation"?(spec.country||"HKG").toUpperCase():null};
    // Persist to DB (use the user's token so RLS allows it if configured), then registry.
    try{ await sbPost("hosts",payload); }catch(e){ console.error("createHostFromSignup",e); }
    addHostLocal({id,type:spec.type,scope:spec.scope||"HK",name,
      ...(spec.type==="association"?{cls:spec.cls}:{}),
      ...(spec.type==="federation"?{country:(spec.country||"HKG").toUpperCase()}:{})});
    setHostsVersion(v=>v+1);
    await reloadHosts();
    return {id};
  };
  // Registers the signing-up user as Owner of a host, ACTIVE but verified=false
  // (so the app treats them as guest until an admin flips verified=true).
  const claimHostFromSignup=async(hostId,userId,tok)=>{
    await hostRest("host_members",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
      body:JSON.stringify({host_id:hostId,user_id:userId,role:"owner",status:"active",verified:false})},tok);
    await logHostAudit(hostId,userId,"claim",userId,"signup — pending verification",tok);
  };

  // ── Dev approvals: approve / delete / reassign pending host memberships ──
  const devApproveMember=async(m)=>{
    await hostRest(`host_members?id=eq.${m.id}`,{method:"PATCH",body:JSON.stringify({verified:true,status:"active"})},auth.token);
    await logHostAudit(m.host_id,auth.user.id,"verify",m.user_id,"dev approval",auth.token);
    await reloadMemberships();
  };
  const devDeleteMember=async(m)=>{
    // Always remove the membership.
    await hostRest(`host_members?id=eq.${m.id}`,{method:"DELETE"},auth.token);
    await logHostAudit(m.host_id,auth.user.id,"revoke",m.user_id,"dev delete",auth.token);
    // If the host has no results AND no other members, delete the portal too.
    const others=await hostRest(`host_members?host_id=eq.${encodeURIComponent(m.host_id)}&select=id`,{},auth.token);
    const evCount=events.filter(e=>eventAssocs(e).includes(m.host_id)).length;
    const isDefault=[...DEFAULT_ASSOCIATIONS,...DEFAULT_CLUBS,...DEFAULT_FEDERATIONS].some(h=>h.id===m.host_id);
    if((others||[]).length===0&&evCount===0&&!isDefault){
      removeHostLocal(m.host_id);setHostsVersion(v=>v+1);
      try{await sbDel("hosts","id=eq."+encodeURIComponent(m.host_id));}catch(e){console.error("devDeleteMember portal delete",e);}
    }
    await reloadMemberships();
  };
  const devReassignMember=async(m,newHostId)=>{
    await hostRest(`host_members?id=eq.${m.id}`,{method:"PATCH",body:JSON.stringify({host_id:newHostId})},auth.token);
    await logHostAudit(newHostId,auth.user.id,"reassign",m.user_id,`from ${m.host_id}`,auth.token);
    // If the old host is now orphaned (newly-created, no results, no members), clean it up.
    const others=await hostRest(`host_members?host_id=eq.${encodeURIComponent(m.host_id)}&select=id`,{},auth.token);
    const evCount=events.filter(e=>eventAssocs(e).includes(m.host_id)).length;
    const isDefault=[...DEFAULT_ASSOCIATIONS,...DEFAULT_CLUBS,...DEFAULT_FEDERATIONS].some(h=>h.id===m.host_id);
    if((others||[]).length===0&&evCount===0&&!isDefault){
      removeHostLocal(m.host_id);setHostsVersion(v=>v+1);
      try{await sbDel("hosts","id=eq."+encodeURIComponent(m.host_id));}catch(e){console.error("devReassignMember cleanup",e);}
    }
    await reloadMemberships();
  };

  // ── Load the signed-in user's host memberships whenever auth changes ──
  const reloadMemberships=React.useCallback(async()=>{
    if(!auth?.user?.id||!auth?.token){setMyMemberships([]);return;}
    const rows=await fetchMyMemberships(auth.user.id,auth.token);
    if(rows) setMyMemberships(rows);
  },[auth]);
  useEffect(()=>{ reloadMemberships(); },[reloadMemberships]);

  // ── Load all athlete claims (for verified badges + admin review) ──
  const reloadClaims=React.useCallback(async()=>{
    if(!auth?.token){setAllClaims([]);return;}
    const rows=await fetchAllClaims(auth.token);
    if(rows) setAllClaims(rows);
  },[auth]);
  useEffect(()=>{ reloadClaims(); },[reloadClaims]);

  // ── Load owner-set athlete profile extras (public read; anon ok) ──
  const reloadAthleteProfiles=React.useCallback(async()=>{
    const rows=await fetchAllAthleteProfiles(auth?.token);
    if(rows){const m={};rows.forEach(r=>{m[r.name_key]=r;});setAthleteProfiles(m);}
  },[auth]);
  useEffect(()=>{ reloadAthleteProfiles(); },[reloadAthleteProfiles]);

  // ── Load persisted custom boat classes (public read; merge into the registry) ──
  // DB rows are authoritative for their canonical key (they replace any locally
  // synthesized entry so everyone sees the creator's exact label/colour). Runs
  // for anon viewers too — custom_classes has public SELECT — so logged-out
  // pages never show grey nuggets. When signed in, any queued writes that
  // previously failed (or were made while signed out) are re-tried here.
  useEffect(()=>{
    (async()=>{
      const rows=await fetchCustomClasses(auth?.token);
      if(Array.isArray(rows)&&rows.length){
        const db=new Map(rows.filter(r=>r.canonical).map(r=>[r.canonical,{id:r.id,short:r.short,full:r.full||r.short,color:r.color,canonical:r.canonical}]));
        CUSTOM_CLASSES=[...db.values(),...CUSTOM_CLASSES.filter(c=>!db.has(c.canonical))];
        setCustomClasses(CUSTOM_CLASSES);
        rows.forEach(r=>dropPendingCustomClass(r.canonical)); // already in DB — no retry needed
      }
      if(auth?.user?.id&&auth?.token){
        for(const cc of readPendingCustomClasses()) await persistCustomClass(cc);
      }
    })();
  },[auth]);
  // ── Safety net: never show a grey "unrecognized" nugget ──
  // Any event that references a custom:<slug> id with no registry entry (legacy
  // rows whose insert was lost before the write-behind queue existed) gets a
  // synthesized entry — prettified label + palette colour. In-memory only: the
  // DB write path stays with the real creator flow above.
  useEffect(()=>{
    const missing=new Map();
    events.forEach(ev=>{
      const id=ev.cls;
      if(typeof id!=="string"||!id.startsWith("custom:")) return;
      const canonical=id.slice(7);
      if(!canonical||missing.has(canonical)||CUSTOM_CLASSES.some(c=>c.canonical===canonical)) return;
      const color=CUSTOM_CLASS_PALETTE[(CUSTOM_CLASSES.length+missing.size)%CUSTOM_CLASS_PALETTE.length];
      const nm=prettifyClassSlug(canonical);
      missing.set(canonical,{id,short:nm,full:nm,color,canonical});
    });
    if(missing.size){ CUSTOM_CLASSES=[...CUSTOM_CLASSES,...missing.values()]; setCustomClasses(CUSTOM_CLASSES); }
  },[events,customClasses]);
  // Extras row for a profile name (or null).
  const athleteProfileOf=(nm)=>athleteProfiles[profileNameKey(nm)]||null;
  // Can the signed-in user edit this profile's extras? Verified owner, or dev.
  const isProfileOwner=(nm)=>devMode||(myClaimFor(nm)?.status==="approved");
  // Persist extras for a profile name, then refresh.
  const saveAthleteExtras=async(nm,patch)=>{
    if(!auth?.user?.id||!auth?.token) return;
    await upsertAthleteProfile(nm,patch,auth.user.id,auth.token);
    await reloadAthleteProfiles();
  };
  // Persist the athlete's media gallery (array of {url,type,caption}), then refresh.
  const saveAthleteMedia=async(nm,media)=>{
    if(!auth?.user?.id||!auth?.token) return;
    await upsertAthleteProfile(nm,{media:media||[]},auth.user.id,auth.token);
    await reloadAthleteProfiles();
  };
  // Owner/dev rename: rename entries everywhere, keep the approved claim pointing
  // at the new name (so the owner keeps edit rights), and migrate the extras row.
  const renameOwnedAthlete=async(oldName,newName)=>{
    const nn=(newName||"").trim(); if(!nn||nn===oldName) return;
    const mine=myClaimFor(oldName);
    const extras=athleteProfileOf(oldName);
    await renameAthlete(oldName,nn);
    if(mine&&mine.status==="approved"){
      try{await hostRest(`athlete_claims?id=eq.${mine.id}`,{method:"PATCH",body:JSON.stringify({profile_name:nn})},auth.token);}catch(e){console.error("rename: claim follow",e);}
      await reloadClaims();
    }
    if(extras&&auth?.user?.id){
      await upsertAthleteProfile(nn,{bio:extras.bio,instagram_url:extras.instagram_url,nat_override:extras.nat_override,photo_url:extras.photo_url,media:extras.media||[]},auth.user.id,auth.token);
      await reloadAthleteProfiles();
    }
  };

  // ── Public username / host-slug editing (the URL identity) ──────────────────
  // Distinct from profiles.username (login handle). Athlete usernames live in
  // athlete_usernames; host slugs in hosts.slug. Case preserved (CaseyLaw, HKSF);
  // uniqueness is case-insensitive and spans BOTH athletes and hosts.
  const[usernamesVersion,setUsernamesVersion]=useState(0); // bump → routing re-reads the map
  const USERNAME_RESERVED=new Set(["sailing","athletes","ranking","rankings","event","competition","competitions","clubs","class","classes","api","sailti","host","hosts","athlete","profile","landing"]);
  const validateUsername=(u)=>{
    const s=String(u||"").trim();
    if(!/^[A-Za-z0-9]{3,30}$/.test(s)) return {ok:false,msg:"3–30 characters, letters and numbers only (no spaces or symbols)."};
    if(USERNAME_RESERVED.has(s.toLowerCase())) return {ok:false,msg:"That word is reserved — pick another."};
    return {ok:true,value:s};
  };
  // Free across athletes AND hosts (case-insensitive), ignoring the row we own.
  const usernameAvailable=async(desired,{selfNameKey=null,selfHostId=null}={})=>{
    const q=encodeURIComponent(desired); // ilike w/o wildcards = case-insensitive equality
    const au=await sbGet(`athlete_usernames?username=ilike.${q}&select=name_key`);
    if(au&&au.some(r=>r.name_key!==selfNameKey)) return false;
    const hs=await sbGet(`hosts?slug=ilike.${q}&select=id`);
    if(hs&&hs.some(r=>r.id!==selfHostId)) return false;
    return true;
  };
  const saveAthleteUsername=async(name,desired)=>{
    const v=validateUsername(desired); if(!v.ok) return {error:v.msg};
    if(!auth?.user?.id||!auth?.token) return {error:"Please sign in again."};
    const nk=profileNameKey(name);
    if((ATHLETE_USERNAMES.byKey.get(nk)||"")===v.value) return {ok:true,username:v.value};
    if(!(await usernameAvailable(v.value,{selfNameKey:nk}))) return {error:"That username is taken. Try another."};
    const body={name_key:nk,username:v.value,display_name:name,is_custom:true,updated_by:auth.user.id,updated_at:new Date().toISOString()};
    const res=await hostRest("athlete_usernames",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify(body)},auth.token);
    if(!res) return {error:"Couldn't save — you may not be the verified owner of this profile."};
    const old=ATHLETE_USERNAMES.byKey.get(nk); if(old) ATHLETE_USERNAMES.byUser.delete(old.toLowerCase());
    ATHLETE_USERNAMES.byKey.set(nk,v.value); ATHLETE_USERNAMES.byUser.set(v.value.toLowerCase(),name);
    setUsernamesVersion(x=>x+1);
    if(view.name==="profile"&&profileNameKey(view.id)===nk) window.history.replaceState(null,"","/"+v.value);
    return {ok:true,username:v.value};
  };
  const saveHostSlug=async(hostId,desired)=>{
    const v=validateUsername(desired); if(!v.ok) return {error:v.msg};
    if(!auth?.token) return {error:"Please sign in again."};
    const h=hostById(hostId); if(!h) return {error:"Host not found."};
    if((h.slug||"")===v.value) return {ok:true,slug:v.value};
    if(!(await usernameAvailable(v.value,{selfHostId:hostId}))) return {error:"That username is taken. Try another."};
    const res=await hostRest(`hosts?id=eq.${encodeURIComponent(hostId)}`,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify({slug:v.value})},auth.token);
    if(!res) return {error:"Couldn't save — you may not have permission."};
    h.slug=v.value; setHostsVersion(x=>x+1);
    if(portal===hostId) window.history.replaceState(null,"",stateToPath(portal,view));
    return {ok:true,slug:v.value};
  };

  // ── Load all event claims (host claims on externally-contributed events) ──
  const reloadEventClaims=React.useCallback(async()=>{
    if(!auth?.token){setAllEventClaims([]);return;}
    const rows=await fetchAllEventClaims(auth.token);
    if(rows) setAllEventClaims(rows);
  },[auth]);
  useEffect(()=>{ reloadEventClaims(); },[reloadEventClaims]);

  // ── Host admin claims an externally-contributed event for their host ──
  const submitEventClaim=async(eventId,hostId)=>{
    if(!auth?.user?.id||!auth?.token){setShowSignIn(true);return;}
    const r=await createEventClaim(eventId,hostId,auth.user.id,null,auth.token);
    if(r){setNote({name:"",matched:0,created:0,msg:"Competition claim submitted — a verified admin can approve it in the host's Manage panel."});setTimeout(()=>setNote(null),7000);await reloadEventClaims();}
  };

  // ── Athlete submits a claim on their auto-built profile ──
  const submitClaim=async(profileName)=>{
    if(!auth?.user?.id||!auth?.token){setShowSignIn(true);return;}
    const r=await createClaim(profileName,auth.user.id,auth.token);
    if(r){setClaimNote({name:profileName,status:"pending"});setTimeout(()=>setClaimNote(null),6000);await reloadClaims();}
  };

  // ── Host admin approves/denies an athlete claim ──
  // On APPROVE, auto-deny every OTHER pending claim on the same profile name:
  // only one person can own a profile, so siblings can't stay open.
  const resolveClaim=async(claim,approve,hostId)=>{
    await decideClaim(claim.id,approve,auth.user.id,hostId,auth.token);
    if(approve){
      const lower=String(claim.profile_name||"").toLowerCase();
      const siblings=allClaims.filter(c=>c.id!==claim.id&&c.status==="pending"&&c.profile_name?.toLowerCase()===lower);
      for(const s of siblings){
        try{await decideClaim(s.id,false,auth.user.id,hostId,auth.token);}catch(e){console.error("sibling claim auto-deny",e);}
      }
    }
    await reloadClaims();
  };

  // ── Detect invite link on mount ──
  // Strips ?invite= from URL immediately, stores token in state.
  // SignInModal handles the full redemption flow.
  // If user is ALREADY signed in when they click the link, redeem directly.
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const token=params.get("invite");
    if(!token) return;
    const clean=new URL(window.location.href); clean.searchParams.delete("invite");
    window.history.replaceState(null,"",clean.pathname+(clean.search||""));
    setPendingInviteToken(token);
    setShowSignIn(true); // open signup modal
  },[]);

  // ── Detect ?signup=1 on mount (landing page "Create a profile" button) ──
  // Strips the param and opens the sign-in/sign-up modal.
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get("signup")!=="1") return;
    const clean=new URL(window.location.href); clean.searchParams.delete("signup");
    window.history.replaceState(null,"",clean.pathname+(clean.search||""));
    setShowSignIn(true);
  },[]);

  // If already signed in when invite arrives, redeem directly without going through signup
  useEffect(()=>{
    if(!pendingInviteToken||!auth?.user?.id||!auth?.token) return;
    (async()=>{
      const rows=await fetchInviteByToken(pendingInviteToken,auth.token);
      const inv=rows&&rows[0];
      if(!inv){setInviteRedeemed({status:"invalid"});setPendingInviteToken(null);return;}
      if(inv.used_at){setInviteRedeemed({status:"used"});setPendingInviteToken(null);return;}
      if(new Date(inv.expires_at)<new Date()){setInviteRedeemed({status:"expired"});setPendingInviteToken(null);return;}
      // Already signed in — create membership directly, mark used
      await hostRest("host_members",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
        body:JSON.stringify({host_id:inv.host_id,user_id:auth.user.id,role:inv.role,status:"active",verified:true})},auth.token);
      await markInviteUsed(pendingInviteToken,auth.user.id,auth.token);
      // Upgrade profile role to the host type if they were a guest/athlete
      const hostType=hostById(inv.host_id)?.type||"club";
      if(auth.profile?.role!==hostType){
        const newProf={...(auth.profile||{}),user_id:auth.user.id,role:hostType};
        await upsertProfile(newProf,auth.token);
        setAuth(a=>a?{...a,profile:{...a.profile,role:hostType}}:a);
      }
      setInviteRedeemed({status:"joined",hostId:inv.host_id,role:inv.role});
      setPendingInviteToken(null);
      await reloadMemberships();
    })();
  },[pendingInviteToken,auth]);
  const[portal,setPortal]=useState(null);
  const[view,setView]=useState({name:"portals"});
  const[navStack,setNavStack]=useState([]); // universal back-button history
  const[urlReady,setUrlReady]=useState(false); // true once the initial deep-link has been resolved → forward URL sync active
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
  // Dev: rename an athlete everywhere (persists to every entry where they appear).
  const renameAthlete=async(oldName,newName)=>{
    const nn=(newName||"").trim(); if(!nn||nn===oldName) return;
    await mergeAthletes(nn,oldName);
  };
  const[athleteSmart,setAthleteSmart]=useState(null); // {label, fn} parsed NL athlete filter
  const[athleteSmartLoading,setAthleteSmartLoading]=useState(false);
  const[compQ,setCompQ]=useState(""); // filter on the global Competitions page
  const[hostQ,setHostQ]=useState(""); // filter on the global Hosts page
  const[note,setNote]=useState(null);
  const[open,setOpen]=useState(false);
  const[tab,setTab]=useState("ai");  // "ai" | "manual"
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
  const[liveUrl,setLiveUrl]=useState("");               // AI parser: paste a results link
  const[parseLog,setParseLog]=useState([]);             // [{name,status,notes:[]}] thinking stream
  const[parseProgress,setParseProgress]=useState({done:0,total:0});
  const[importStep,setImportStep]=useState("upload");
  // Drag-and-drop upload state. dragDepth is a counter: dragenter/dragleave fire on
  // child elements too, so a bare boolean flickers — count nested enters/leaves and
  // treat depth>0 as "dragging over the zone".
  const[dragDepth,setDragDepth]=useState(0);
  const[fleetChoices,setFleetChoices]=useState([]);
  const[pdfMeta,setPdfMeta]=useState(null);
  const[previewEv,setPreviewEv]=useState(null);
  const[previewEdit,setPreviewEdit]=useState(null);
  // Multi-file import: each pending result = {id,name,status:'ok'|'error'|'parsing',
  //   error, previewEv, subclass, collabs}. activePending = index being edited.
  const[pending,setPending]=useState([]);
  const[activePending,setActivePending]=useState(0);
  const[previewEditVal,setPreviewEditVal]=useState("");
  // Web-lookup enrichment suggestions, keyed by pending-item id →
  //   {date,country,source,dismissed}. Populated best-effort by the enrichment
  //   effect when a parsed preview still lacks a date/country. UI-only, never
  //   auto-applied — the user clicks Apply per value.
  const[enrichSug,setEnrichSug]=useState({});
  const[editCell,setEditCell]=useState(null);
  const[editVal,setEditVal]=useState("");
  const[editEvMeta,setEditEvMeta]=useState(null);
  const[deleteConfirm,setDeleteConfirm]=useState(null); // {id, name, pos}
  const[evFilter,setEvFilter]=useState("");     // AI filter query for events list
  const[evFilterActive,setEvFilterActive]=useState(null); // (legacy single) kept for compatibility
  const[evFilterChips,setEvFilterChips]=useState([]);      // cumulative AND-ed event filters
  const[evFilterLoading,setEvFilterLoading]=useState(false);
  const[profileFilter,setProfileFilter]=useState("");  // AI filter input for profile history
  const[profileFilterChips,setProfileFilterChips]=useState([]); // cumulative AND-ed filters
  const[profileFilterLoading,setProfileFilterLoading]=useState(false);
  const[footprintOpen,setFootprintOpen]=useState(false);
  const[profileTab,setProfileTab]=useState("footprint");
  const[hostFootprintOpen,setHostFootprintOpen]=useState(false);
  const[confirmState,setConfirmState]=useState(null); // in-app confirm dialog (replaces window.confirm)
  const[editingAthName,setEditingAthName]=useState(null); // {orig} when renaming on the profile page
  const[athNameFirst,setAthNameFirst]=useState("");
  const[athNameLast,setAthNameLast]=useState("");
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
  const[calScopePortal,setCalScopePortal]=useState(null); // null = global; else portal id for popup scope
  // Ranking page
  const[rankCls,setRankCls]=useState("29er");
  const[rankMode,setRankMode]=useState("cumulative"); // "cumulative" (every race) | "position" (regatta placings)
  const[rankCountry,setRankCountry]=useState(""); // country lens on the Rankings page ("" = all)
  const[rankDiscards,setRankDiscards]=useState(0);    // configurable; default 0
  const[rankSourceOpen,setRankSourceOpen]=useState(null);   // collapsed by default
  const[rankSelected,setRankSelected]=useState(()=>{
    try{const s=localStorage.getItem("athlink_rank_selected");return s?new Set(JSON.parse(s)):new Set();}catch{return new Set();}
  });
  useEffect(()=>{try{localStorage.setItem("athlink_rank_selected",JSON.stringify([...rankSelected]));}catch{}},[rankSelected]);
  const[rankExpanded,setRankExpanded]=useState(()=>new Set());
  const toggleRankCell=k=>setRankExpanded(prev=>{const n=new Set(prev);n.has(k)?n.delete(k):n.add(k);return n;});
  // Current-year federation competitions of a class (default selection)
  const defaultRankIds=clsId=>{const yr=String(new Date().getFullYear());
    return events.filter(e=>e.cls===clsId&&e.status!=="Draft"&&governingFeds(e).length>0&&/(\d{4})/.test(e.date||"")&&(e.date||"").match(/(\d{4})/)[1]===yr).map(e=>e.id);};
  // On first visit to a class's ranking, auto-select its current-year federation comps
  // (unless the user already has a selection for that class — selections are remembered).
  const rankDefaultedRef=React.useRef(new Set());
  useEffect(()=>{
    if(view.name!=="ranking"||!events.length) return;
    if(rankDefaultedRef.current.has(rankCls)) return;
    rankDefaultedRef.current.add(rankCls);
    setRankSelected(prev=>{
      const hasThisClass=[...prev].some(id=>events.find(e=>e.id===id&&e.cls===rankCls));
      if(hasThisClass) return prev;
      const def=defaultRankIds(rankCls);
      return def.length?new Set([...prev,...def]):prev;
    });
  },[view.name,rankCls,events]);
  // Dev-mode host creation
  const[showAddHost,setShowAddHost]=useState(false);
  const[newHost,setNewHost]=useState({type:"club",scope:"HK",name:"",cls:"29er",country:"HKG"});
  const[addingHost,setAddingHost]=useState(false);
  const saveNewHost=async()=>{
    const name=(newHost.name||"").trim();
    if(!name) return;
    const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,32)||"host";
    const id=slug+"-"+Math.random().toString(36).slice(2,6);
    const payload={
      id, type:newHost.type, scope:newHost.scope, name,
      cls:newHost.type==="association"?newHost.cls:null,
      country:newHost.type==="federation"?(newHost.country||"HKG").toUpperCase():null,
    };
    // Registry-shaped object (cls/country only where relevant)
    const host={id,type:newHost.type,scope:newHost.scope,name,
      ...(newHost.type==="association"?{cls:newHost.cls}:{}),
      ...(newHost.type==="federation"?{country:(newHost.country||"HKG").toUpperCase()}:{})};
    // Optimistic: portal appears immediately
    addHostLocal(host);
    setHostsVersion(v=>v+1);
    setShowAddHost(false);
    setNewHost({type:"club",scope:"HK",name:"",cls:"29er",country:"HKG"});
    setNote({name,matched:0,created:0,msg:`${payload.type} portal created.`});
    setTimeout(()=>setNote(null),5000);
    // Persist in the background; reconcile from DB on success
    try{
      const r=await sbPost("hosts",payload);
      if(r) await reloadHosts();
      else console.error("saveNewHost: Supabase save failed — host won't survive reload (run hosts_migration.sql).");
    }catch(err){console.error("saveNewHost: background save error",err);}
  };
  const deleteHost=(id,name,e)=>{
    if(e)e.stopPropagation();
    if(!devMode) return;
    setConfirmState({
      title:"Delete host?",
      message:`Delete host/portal "${name}"?\n\nThis removes the portal only — imported results stay intact and will simply no longer be grouped under this host.`,
      confirmLabel:"Delete",
      onConfirm:async()=>{
        removeHostLocal(id);
        setHostsVersion(v=>v+1);
        if(portal===id){setPortal(null);setView({name:"portals"});}
        try{await sbDel("hosts","id=eq."+encodeURIComponent(id));}catch(err){console.error("deleteHost: DB delete error",err);}
      }});
  };
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
      // Load hosts (with slugs) + the public athlete-username registry BEFORE
      // events, so the clean-URL resolvers can map slugs/usernames on first paint.
      const hostRows=await sbGet("hosts?select=*");
      if(hostRows){applyDbHosts(hostRows);setHostsVersion(v=>v+1);}
      const uRows=await sbGet("athlete_usernames?select=name_key,username,display_name");
      if(uRows){applyAthleteUsernames(uRows);}
      setEvents(data.map(dbToApp));
    })();
  },[]);

  /* ── derived ──────────────────────────────────────────────── */
  const isClassPortal=typeof portal==="string"&&portal.startsWith("class:");
  const portalCls=isClassPortal?portal.slice(6):null; // base class id for a class portal
  // Membership of the CURRENT portal for the signed-in user (if any).
  const myPortalMembership=React.useMemo(
    ()=>myMemberships.find(m=>m.host_id===portal&&m.status==="active")||null,
    [myMemberships,portal]
  );
  const isPortalOwner=myPortalMembership?.role==="owner";
  // Does the signed-in user have ANY unverified host membership? (account badge)
  const hasPendingHostMembership=myMemberships.some(m=>!m.verified);
  // Athlete who hasn't claimed their auto-built profile yet → show a nudge to
  // claim it (and an avatar dot). Skip for hosts and dev mode.
  const myAthleteClaim=auth?.user?.id?allClaims.find(c=>c.user_id===auth.user.id):null;
  const showClaimNudge=!!auth&&role==="athlete"&&!devMode&&!myAthleteClaim&&!myMemberships.some(m=>m.verified);
  // A pending (unverified) host owner of THIS portal — sees guest UX everywhere
  // except a "pending approval" banner on their own portal page.
  const isPendingHostHere=!isClassPortal&&!!myPortalMembership&&!myPortalMembership.verified;
  // Write access: dev mode, OR an active + VERIFIED member of this (non-class) portal.
  const canEdit=devMode||(!isClassPortal&&!!myPortalMembership&&myPortalMembership.verified);
  // Manage members: dev, OR a VERIFIED member. Unverified (pending) owners are
  // treated as guests until the AthLink team approves them.
  const canManageMembers=devMode||(!isClassPortal&&!!myPortalMembership&&myPortalMembership.verified);
  const assoc=ASSOCIATIONS.find(a=>a.id===portal);
  const club=CLUBS.find(c=>c.id===portal);
  const fed=FEDERATIONS.find(f=>f.id===portal);
  const host=assoc||club||fed;
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
  // Rebuild the per-athlete attribute memory (gender/birth-year/recent class)
  // whenever events change. Downstream gender chips read ATHLETE_ATTRS.
  useMemo(()=>buildAthleteAttrs(events),[events]);
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

  // ── Host competition footprint (for the clickable title globe) ──
  // countryCounts (ISO → # competitions) drives the globe; hostHistory feeds the
  // popup list in the same shape FootprintModal expects from an athlete.
  const hostCountryCounts=useMemo(()=>{
    if(!portal) return {};
    const m={};
    classEvents.forEach(ev=>{const iso=IOC_ISO[eventCountryCode(ev)||""]||"";if(iso)m[iso]=(m[iso]||0)+1;});
    // For host portals, always include the host's home location so the globe has a marker.
    // Class portals have no single home — the spread itself is the footprint.
    if(!isClassPortal){
      const hc=hostLocation(portal,events); const hiso=hc?IOC_ISO[String(hc).toUpperCase()]:null;
      if(hiso&&!m[hiso]) m[hiso]=0;
    }
    return m;
  },[portal,isClassPortal,classEvents,events]);
  const hostHistory=useMemo(()=>classEvents.map(ev=>{
    const sc=(()=>{try{return scoreEvent(ev);}catch{return null;}})();
    return {ev:{...ev,class:nuggetFor(ev.cls,ev.subclass).label},row:{rank:0},fleet:sc?sc.fleet:(ev.entries?.length||0),
      countries:new Set(ev.entries.flatMap(e=>[e.nat]).filter(Boolean)).size};
  }).sort((a,b)=>dateKey(b.ev.date).localeCompare(dateKey(a.ev.date))),[classEvents]);

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
  // Exact raw-name count — used to choose the merge primary so the most-used
  // first/last name ORDER wins (regCount is order-blind because it uses canon).
  const rawNameCount=nm=>events.filter(ev=>ev.entries.some(e=>e.helm===nm||e.crew===nm)).length;
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
          if(na&&nb) groups.push({names:[na,nb].sort((x,y)=>rawNameCount(y)-rawNameCount(x)||regCount(y)-regCount(x)),kind:"near",key:[a,b].sort().join("~")});
        }
      }
    }
    return groups;
  },[allPeople,displayNameFor,events]);

  const myAssoc=auth?.profile?.class_id||null;
  // Persist "don't merge" dismissals across reloads (localStorage).
  const[dismissedDups2,setDismissedDups2]=useState(()=>{
    try{const s=localStorage.getItem("athlink_dismissed_dups");return s?new Set(JSON.parse(s)):new Set();}catch{return new Set();}
  });
  useEffect(()=>{try{localStorage.setItem("athlink_dismissed_dups",JSON.stringify([...dismissedDups2]));}catch{}},[dismissedDups2]);
  // Seed from the server too, so decisions persist across reloads AND devices.
  useEffect(()=>{(async()=>{
    const rows=await fetchDupDismissals();
    if(Array.isArray(rows)&&rows.length) setDismissedDups2(prev=>{const s=new Set(prev);rows.forEach(r=>r.key&&s.add(r.key));return s;});
  })();},[]);
  // True if a name competes in the given class (canonical match).
  const nameInClass=(nm,clsId)=>{const t=canonName(nm);return events.some(e=>e.cls===clsId&&e.entries.some(en=>canonName(en.helm)===t||canonName(en.crew)===t));};
  const visibleDupGroups=useMemo(()=>{
    const dupClsId=isClassPortal?portalCls:(assoc?.cls||null); // class scope of the current portal, if any
    let g=dupGroups.filter(x=>!dismissedDups2.has(x.key));
    // Within a class-scoped portal, only show duplicates whose athletes belong to THAT class.
    if(dupClsId) g=g.filter(x=>x.names.some(nm=>nameInClass(nm,dupClsId)));
    if(myAssoc) g=g.filter(x=>x.names.some(nm=>athleteHostAssocs(nm).has(myAssoc)));
    return g;
  },[dupGroups,dismissedDups2,myAssoc,events,portal,isClassPortal,portalCls]);

  const previewScored=useMemo(()=>previewEv?scorePreview(previewEv):null,[previewEv]);
  const previewMaxRaces=useMemo(()=>{
    if(!previewEv?.entries?.length) return 0;
    return Math.max(...previewEv.entries.map(e=>(e.races||[]).length),1);
  },[previewEv]);

  const cls=assoc?(CLASSES.find(c=>c.id===assoc.cls)||customClassById(assoc.cls)):(isClassPortal?(CLASSES.find(c=>c.id===portalCls)||customClassById(portalCls)):null);
  const portalName=host?host.name:(isClassPortal?`All ${classLabel(portalCls)} Results`:"");
  const isGlobal=!portal;
  const currentPeople=isGlobal?allPeople:people;
  const athleteTitle=isGlobal?(view.name==="athletes"&&view.cls?`${classLabel(view.cls)} Athletes`:"All Athletes"):(cls?`${cls.short} Athletes`:`${portalName} Athletes`);
  // Precompute every athlete's card stats in ONE pass (events count, best rank,
  // nationality, most-recent class/subclass). Avoids calling aggregate()/athleteNat()
  // — each O(events) — once per card, which was making All Athletes very slow.
  const statScope=isGlobal?events:classEvents;
  const cardStats=useMemo(()=>{
    const m=new Map();
    for(const ev of statScope){
      if(ev.status==="Draft") continue;
      const s=scoreEvent(ev);
      const dk=dateKey(ev.date); // "" = undated; never allowed to claim recency
      for(const row of s.rows){
        [row.helm,row.crew].forEach(nm=>{
          if(!nm) return;const k=canonName(nm);if(!k) return;
          let o=m.get(k);if(!o){o={evset:new Set(),best:Infinity,nat:{},recentDK:"",recentCls:null,recentSub:null};m.set(k,o);}
          const sig=`${eventKey(ev)}|${row.sail||""}|${row.rank}|${row.net}|${(row.races||[]).join(",")}`;
          if(!o.evset.has(sig)){o.evset.add(sig);if(row.rank&&row.rank<o.best)o.best=row.rank;}
          if(row.nat)o.nat[row.nat]=(o.nat[row.nat]||0)+1;
          if(dk?dk>=o.recentDK:!o.recentDK&&!o.recentCls){o.recentDK=dk;o.recentCls=ev.cls;o.recentSub=ev.subclass||null;}
        });
      }
    }
    const out=new Map();
    for(const[k,o]of m){
      const nat=Object.keys(o.nat).length?Object.entries(o.nat).sort((a,b)=>b[1]-a[1])[0][0]:(META[displayNameFor(k)]?.nat||"");
      out.set(k,{events:o.evset.size,best:o.best===Infinity?null:o.best,nat,recentCls:o.recentCls,recentSub:o.recentSub});
    }
    return out;
  },[statScope]);
  const statOf=nm=>cardStats.get(canonName(nm))||{events:0,best:null,nat:"",recentCls:null,recentSub:null};
  // Global Athletes lenses — class + country carried in the view (class deep-links via /class/<id>/athletes)
  const athCls=(isGlobal&&view.name==="athletes")?(view.cls||null):null;
  const athCountry=(isGlobal&&view.name==="athletes")?(view.country||null):null;
  const athClsSet=useMemo(()=>{
    if(!athCls) return null;
    const s2=new Set();
    events.forEach(ev=>{if(ev.status==="Draft"||ev.cls!==athCls)return;(ev.entries||[]).forEach(e=>{if(e.helm)s2.add(canonName(e.helm));if(e.crew)s2.add(canonName(e.crew));});});
    return s2;
  },[events,athCls]);
  const lensPeople=(athClsSet||athCountry)
    ?currentPeople.filter(p=>(!athClsSet||athClsSet.has(canonName(p.name)))&&(!athCountry||statOf(p.name).nat===athCountry))
    :currentPeople;
  // Progressive reveal so the page paints immediately and fills in as you scroll.
  const[athLimit,setAthLimit]=useState(120);
  const athSentinelRef=React.useRef(null);
  useEffect(()=>{setAthLimit(120);},[isGlobal,portal,view.name,filter,q,athleteSmart]);
  useEffect(()=>{
    if(view.name!=="athletes") return;
    const el=athSentinelRef.current;if(!el) return;
    const io=new IntersectionObserver(es=>{if(es[0].isIntersecting) setAthLimit(l=>l+120);},{rootMargin:"600px"});
    io.observe(el);return()=>io.disconnect();
  },[view.name,athLimit,filter,q]);
  const evLoc=ev=>[ev.country].filter(Boolean).join(" · ");
  const manualReady=!!mf.rows.filter(r=>r.helm.trim()).length;

  /* ── navigation ───────────────────────────────────────────── */
  // ── Navigation with universal history ───────────────────────
  const pushNav=()=>setNavStack(s=>[...s.slice(-19),{portal,view}]);
  const go=v=>{pushNav();setView(v);setQ("");setAthleteSmart(null);window.scrollTo(0,0);};
  const goHome=()=>{pushNav();setPortal(null);setView({name:"portals"});setQ("");setAthleteSmart(null);setEvFilterChips([]);setEvFilter("");window.scrollTo(0,0);};
  const enterPortal=id=>{pushNav();setPortal(id);setView({name:"events"});setQ("");setAthleteSmart(null);setEvFilterChips([]);setEvFilter("");window.scrollTo(0,0);};
  // Top-bar primary nav: always leaves any portal scope — the 3 doors are global.
  const goTop=(name,extra)=>{pushNav();setPortal(null);setView({name,...(extra||{})});setQ("");setAthleteSmart(null);setEvFilterChips([]);setEvFilter("");window.scrollTo(0,0);};
  // Which of the 4 nav doors the current page lives behind (drives the .on state).
  const navOn=view.name==="ranking"?"ranking"
    :(view.name==="competitions"||view.name==="event")?"competitions"
    :(view.name==="hosts"||(portal&&!String(portal).startsWith("class:")))?"hosts"
    :((view.name==="athletes"&&!portal)||view.name==="profile")?"athletes"
    :null;
  // Jump straight to a host's athletes (nav "Athletes › by host" submenu).
  const enterPortalAthletes=id=>{pushNav();setPortal(id);setView({name:"athletes"});setQ("");setAthleteSmart(null);window.scrollTo(0,0);};
  // Jump to the ranking page with a class preselected (nav "Rankings › by class").
  const goRankingClass=id=>{pushNav();setPortal(null);setRankCls(id);setRankSourceOpen(null);setRankExpanded(new Set());setView({name:"ranking"});setQ("");setAthleteSmart(null);window.scrollTo(0,0);};
  // Hosts + competition counts + home country — feeds the nav mega-menus and the Hosts page.
  const navHosts=(()=>{
    const pub=events.filter(ev=>ev.status!=="Draft");
    return [
      ...FEDERATIONS.map(h=>({...h,htype:"federation"})),
      ...CLUBS.map(h=>({...h,htype:"club"})),
      ...ASSOCIATIONS.map(h=>({...h,htype:"association"})),
    ].map(h=>({...h,n:pub.filter(ev=>eventAssocs(ev).includes(h.id)).length,loc:hostLocation(h.id,events)||""}))
     .sort((a,b)=>b.n-a.n);
  })();
  const hostCountries=[...new Set(navHosts.map(h=>h.loc).filter(Boolean))]
    .sort((a,b)=>(GLOBE_NAMES[IOC_ISO[a]]||a).localeCompare(GLOBE_NAMES[IOC_ISO[b]]||b));
  // Floating top bar: hide on scroll-down, reveal on scroll-up. Reset to shown on page change.
  useEffect(()=>{
    let lastY=window.scrollY;
    const onScroll=()=>{
      const y=window.scrollY;
      if(y>lastY+6&&y>90){setBarHidden(true);setNavSearchOpen(false);}
      else if(y<lastY-6){setBarHidden(false);}
      lastY=y;
    };
    window.addEventListener("scroll",onScroll,{passive:true});
    return()=>window.removeEventListener("scroll",onScroll);
  },[]);
  useEffect(()=>{setBarHidden(false);setNavSearchOpen(false);},[view.name,portal]);

  /* ── Clean-URL sync (shareable links + native back/forward) ───────────────
     stateToPath / pathToState (module scope) define the mapping. This block is
     the only place that touches window.history for in-app navigation. */
  // 1) On load, resolve the incoming path once the data needed for it exists.
  useEffect(()=>{
    if(urlReady) return;
    const path=window.location.pathname;
    const seg=decodeURIComponent(path).split("/").filter(Boolean);
    const s0=(seg[0]||"").toLowerCase();
    const RESERVED=["","sailing","athletes","ranking","rankings","event","competition","competitions","hosts","class"];
    // Athlete slugs can only be resolved after events (hence names) have loaded.
    const needsAthlete=seg.length>0&&!RESERVED.includes(s0)&&!hostBySlug(seg[0]);
    if(needsAthlete&&events.length===0) return; // wait for events, effect re-runs on load
    const st=pathToState(path,collectAthleteNames(events));
    if(st){setPortal(st.portal);setView(st.view);}
    window.history.replaceState(null,"",stateToPath(st?st.portal:null,st?st.view:{name:"portals"}));
    setUrlReady(true);
  },[events,urlReady]);
  // Safety net: enable forward sync even if data never arrives.
  useEffect(()=>{const t=setTimeout(()=>setUrlReady(true),8000);return()=>clearTimeout(t);},[]);
  // 2) Forward: reflect every view change into the path.
  useEffect(()=>{
    if(!urlReady) return;
    const path=stateToPath(portal,view);
    if(path!==window.location.pathname){
      window.history.pushState(null,"",path);
      window.dispatchEvent(new Event("locationchange")); // let the shell re-sync
    }
  },[portal,view,urlReady]);
  // 3) Back/forward buttons: restore state from the URL (no push — guard above skips it).
  useEffect(()=>{
    const onPop=()=>{
      const st=pathToState(window.location.pathname,collectAthleteNames(events));
      setPortal(st?st.portal:null);
      setView(st?st.view:{name:"portals"});
      setNavStack(s=>s.slice(0,-1));
      setQ("");setAthleteSmart(null);window.scrollTo(0,0);
    };
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[events]);
  // 4) Browser tab title ⇄ current page. Each page reads as its own entity name
  //    (e.g. "Hong Kong Sailing Federation", an athlete name, an event) so tabs
  //    and history are legible; the sailing home / unknown falls back to AthLink.
  useEffect(()=>{
    const v=view||{name:"portals"};
    const hostName=id=>{const h=hostById(id); if(h) return h.name; if(typeof id==="string"&&id.startsWith("class:")) return classLabel(id.slice(6)); return null;};
    let t;
    if(v.name==="profile")      t=v.id||"Athlete";
    else if(v.name==="event"){  const ev=events.find(e=>e.id===v.id); t=ev?ev.name:"Competition"; }
    else if(v.name==="ranking") t="Rankings";
    else if(v.name==="competitions") t=v.cls?`${classLabel(v.cls)} — Competitions`:"Competitions";
    else if(v.name==="hosts") t="Hosts";
    else if(v.name==="athletes")t=portal?`${hostName(portal)||"Sailing"} — Athletes`:(v.cls?`${classLabel(v.cls)} — Athletes`:"Athletes");
    else if(v.name==="events")  t=hostName(portal)||"AthLink"; // named portal, else sailing home
    else                        t="AthLink"; // portals home
    document.title=t||"AthLink";
  },[portal,view,events]);

  const navBack=()=>{
    // Drive the in-app Back button through real browser history so it stays in
    // lock-step with the native back button; fall back to home on a cold deep-link.
    if(navStack.length){window.history.back();return;}
    setPortal(null);setView({name:"portals"});setQ("");setAthleteSmart(null);window.scrollTo(0,0);
  };
  const navLabelFor=(snap)=>{
    if(!snap) return "Back";
    const v=snap.view||{};
    const pName=id=>{const a=ASSOCIATIONS.find(x=>x.id===id);if(a)return a.name;if(typeof id==="string"&&id.startsWith("class:"))return`All ${classLabel(id.slice(6))} Results`;return null;};
    if(v.name==="portals") return "Sailing";
    if(v.name==="competitions") return "Competitions";
    if(v.name==="hosts") return "Hosts";
    if(v.name==="ranking") return "Rankings";
    if(v.name==="athletes") return snap.portal?`${pName(snap.portal)||""} Athletes`:"All Athletes";
    if(v.name==="events") return pName(snap.portal)||"Competitions";
    if(v.name==="event"){const ev=events.find(e=>e.id===v.id);return ev?ev.name:"Competition";}
    if(v.name==="profile") return v.id||"Profile";
    return "Back";
  };

  /* ── event ops ────────────────────────────────────────────── */
  const deleteEvent=(evId,evName,e)=>{
    e.stopPropagation();
    if(!canEdit) return;   // guests have no delete access (dev mode / editors only)
    const rect=e.currentTarget.getBoundingClientRect();
    setDeleteConfirm({id:evId,name:evName,x:rect.right,y:rect.bottom});
  };
  const confirmDelete=async()=>{
    if(!deleteConfirm||!canEdit) return;
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
    setNote({name:"Results confirmed",matched:0,created:0,msg:"Competition is now official."});
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
    const q=evFilter.trim();
    if(!q){return;}
    setEvFilterLoading(true);setEvSuggestions([]);
    try{
      const res=await fetch("/api/ai_filter",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({task:"filter",prompt:buildFilterPrompt(q,`Portal: ${host?.name||"unknown"}, Events: ${classEvents.length}`),max_tokens:300})
      });
      const data=await res.json();
      if(!data.ok) throw new Error(data.error||"API error");
      const clean=data.text.replace(/```json|```/g,"").trim();
      let parsed=JSON.parse(clean);
      // Accept a single {label,code} or an array of them — push each as a chip.
      if(!Array.isArray(parsed)) parsed=[parsed];
      const chips=parsed.filter(x=>x&&x.code).map(x=>({label:x.label||q,fn:new Function("ev","scoreEvent","return "+x.code)}));
      if(chips.length) setEvFilterChips(prev=>[...prev,...chips]);
      setEvFilter("");
    }catch(err){
      // Fallback: simple client-side text search as a single chip
      const ql=q.toLowerCase();
      const fn=(ev)=>ev.name.toLowerCase().includes(ql)||
        ev.entries.some(e=>e.helm.toLowerCase().includes(ql)||e.crew.toLowerCase().includes(ql))||
        (ev.country||"").toLowerCase().includes(ql);
      setEvFilterChips(prev=>[...prev,{label:`"${q}"`,fn}]);
      setEvFilter("");
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
          task:"filter",
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
          task:"filter",
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
Context: portal=${host?.name||"unknown"}, recent events: ${eventCtx}
Partial query: "${q}"`;
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({task:"filter",prompt,max_tokens:200})});
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
        body:JSON.stringify({task:"filter",prompt,max_tokens:150})});
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
      const _attrs=ATHLETE_ATTRS.get(canonName(p.name));
      const _showCls=_attrs?.recentCls||p.cls;
      results.push({type:"athlete",label:p.name,sub:_showCls?classLabel(_showCls):"",nav:{type:"profile",assoc:ev?.owner||null,id:p.name}});
    });
    // Events — nav into the event's owner association portal
    events.filter(ev=>ev.name.toLowerCase().includes(ql)).slice(0,4).forEach(ev=>{
      results.push({type:"event",label:ev.name,sub:formatDate(ev.date),nav:{type:"event",assoc:ev.owner||null,id:ev.id}});
    });
    // Global class portals
    CLASSES.filter(c=>c.short.toLowerCase().includes(ql)||(c.full||"").toLowerCase().includes(ql)).forEach(c=>{
      results.push({type:"portal",label:`${c.short} — all competitions`,sub:"Class",nav:{type:"competitions",cls:c.id}});
    });
    // Club portals
    CLUBS.filter(c=>c.name.toLowerCase().includes(ql)).forEach(c=>{
      results.push({type:"portal",label:c.name,sub:"Club",nav:{type:"portal",assoc:c.id}});
    });
    // Federation portals
    FEDERATIONS.filter(f=>f.name.toLowerCase().includes(ql)).forEach(f=>{
      results.push({type:"portal",label:f.name,sub:"Federation",nav:{type:"portal",assoc:f.id}});
    });
    // Association portals
    ASSOCIATIONS.filter(a=>a.name.toLowerCase().includes(ql)||(a.cls||"").toLowerCase().includes(ql)).forEach(a=>{
      results.push({type:"portal",label:a.name,sub:"Association",nav:{type:"portal",assoc:a.id}});
    });
    // Nav shortcuts
    if("home all classes portals sailing associations".includes(ql))
      results.push({type:"nav",label:"Sailing — Home",sub:"Navigate",nav:{type:"home"}});
    if("all athletes".includes(ql)||ql.includes("athlete"))
      results.push({type:"nav",label:"Athletes",sub:"Navigate",nav:{type:"athletes"}});
    setGSearchResults(results.slice(0,10));
  };

  const[editResultsEv,setEditResultsEv]=useState(null); // full edit mode for existing event
  const[hoverRow,setHoverRow]=useState(null); // {evId,helm,y} currently hovered
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
        body:JSON.stringify({task:"overview",prompt,max_tokens:220})});
      const data=await res.json();
      if(data.ok) setEventSummaries(m=>({...m,[ev.id]:cleanAISummary(data.text)}));
      else setEventSummaries(m=>({...m,[ev.id]:""}));
    }catch{setEventSummaries(m=>({...m,[ev.id]:""}));}
  };

  const execGSearch=(r)=>{
    // Close search UI immediately
    setGSearch("");setGSearchOpen(false);setGSearchResults([]);setNavSearchOpen(false);
    const n=r.nav;
    if(n.type==="portal"){
      // enterPortal sets portal+view in one batch — no defer needed
      enterPortal(n.assoc);
    } else if(n.type==="competitions"){
      goTop("competitions",n.cls?{cls:n.cls}:undefined);
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
      // First & most-recent event years (for "started together" / trajectory context).
      const sorted=ag.history.slice().sort((a,b)=>dateKey(a.ev.date).localeCompare(dateKey(b.ev.date)));
      const firstYr=sorted[0]?.ev.date?.split('/')?.[2]||"";
      let prompt;
      if(crew){
        const agCrew=aggregate(crew,events);
        // Events both sailed together (shared regattas with this partner).
        const together=ag.history.filter(h=>h.partner&&canonName(h.partner)===canonName(crew));
        const firstTog=together.slice().sort((a,b)=>dateKey(a.ev.date).localeCompare(dateKey(b.ev.date)))[0];
        const togLine=together.length?`Sailed together in ${together.length} regatta(s) since ${firstTog?.ev.date?.split('/')?.[2]||"?"}; best together #${Math.min(...together.map(h=>h.row.rank))}.`:"First/few events as a pair.";
        prompt=`Write a SHORT scouting blurb for a sailing PAIR (helm+crew): 2 sentences, MAX 38 words. Cover (a) when they started sailing together and how they've performed as a pair, (b) any standout milestone by either sailor, and (c) how they stack up against similar-calibre competition. Factual, no markdown, no heading. Always refer to each sailor by their FULL name exactly as "${name}" and "${crew}" (first and last together) — never just a first name or just a last name.
Helm: ${name} (${evs} regattas since ${firstYr||"?"}, best ${best}, ${pods} podiums, ${wins} race wins).
Crew: ${crew} (${agCrew.events} regattas, best ${agCrew.best?"#"+agCrew.best:"unknown"}).
Together: ${togLine}`;
      } else {
        // Comparison context: peers who finished near them in their events.
        const peerNote=ag.history.slice(0,5).map(h=>`${h.ev.name}: #${h.row.rank}/${h.fleet}`).join('; ');
        prompt=`Write a SHORT scouting blurb for a SINGLE-HANDED sailor: 2 sentences, MAX 32 words. Focus mainly on how they performed RELATIVE TO COMPETITORS OF SIMILAR CALIBRE — i.e. where they placed within the fleet at their events, and against peers who finished near them. Factual, no markdown, no heading. Always refer to the athlete by their FULL name exactly as "${name}" (first and last together) — never just the first name or just the last name.
Athlete: ${name} (since ${firstYr||"?"}). Best ${best}, ${pods} podiums, ${wins} race wins. Placings: ${peerNote||"unknown"}.`;
      }
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({task:"hover",prompt,max_tokens:90})});
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
      const raw=localStorage.getItem("athlink_bio_v2_"+name);  // v2: full-name prompt
      if(raw){
        const cached=JSON.parse(raw);
        if(cached.sig===sig){ setProfileSummaries(h=>({...h,[name]:cached.text})); return; }
      }
    }catch{}
    setProfileSummaries(h=>({...h,[name]:null})); // loading
    try{
      const years=[...new Set(ag.history.map(h=>h.ev.date?.split('/')?.[2]).filter(Boolean))].sort();
      // Class journey: class per year, to spot when they started / moved classes.
      const clsByYear={};
      ag.history.forEach(h=>{const y=h.ev.date?.split('/')?.[2];if(y)(clsByYear[y]=clsByYear[y]||new Set()).add((nuggetFor(h.ev.cls,h.ev.subclass).full)||h.ev.cls);});
      const journey=Object.keys(clsByYear).sort().map(y=>`${y}: ${[...clsByYear[y]].join('/')}`).join('; ');
      const recent=ag.history[0];
      const recentLine=recent?`Most recent: ${recent.ev.name} (${recent.ev.date?.split('/')?.[2]||''}), finished #${recent.row.rank} of ${recent.fleet}.`:"";
      const prompt=`Write a SHORT athlete bio: 2 sentences, MAX 45 words total, third person. Focus on the athlete's JOURNEY — when they started competing, any class change, the class they've excelled in, and where they place now. Do NOT list every stat. No heading, no markdown, no "#", do not begin with the name. Whenever you refer to the athlete, use their FULL name exactly as "${name}" (first and last together) — never just the first name or just the last name on its own.
Name: ${name}. Active years: ${years.join(', ')||'unknown'}. Class-by-year: ${journey||'unknown'}. Best result: ${ag.best?"#"+ag.best:"unknown"}. Podiums: ${ag.podiums}. ${recentLine}`;
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({task:"overview",prompt,max_tokens:110})});
      const data=await res.json();
      if(data.ok){
        const text=cleanAISummary(data.text);
        setProfileSummaries(h=>({...h,[name]:text}));
        try{localStorage.setItem("athlink_bio_v2_"+name,JSON.stringify({sig,text}));}catch{}
      }
      else setProfileSummaries(h=>({...h,[name]:""}));
    }catch{setProfileSummaries(h=>({...h,[name]:""}));}
  };


  const openCalendarAt=(dateStr)=>{
    const p=dateStr?.split('/');
    if(!p||p.length!==3) return;
    const mo=parseInt(p[1])-1;const yr=parseInt(p[2]);
    if(isNaN(mo)||isNaN(yr)) return;
    setCalScopePortal(portal||null);
    setCalMonth(mo);setCalYear(yr);setShowCalendar(true);
  };
  // Open the calendar popup, scoped to a given portal (null = global/all events).
  const openCalendar=(scopePortal)=>{
    setCalScopePortal(scopePortal??null);
    setShowCalendar(true);
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
      // Seed the organizer/host picker from the existing event so it reflects
      // (and can change) the current host, and the change actually persists.
      _orgMode: ev.owner?"external":"self",
      _orgHost: ev.owner||null,
      _orgName: ev.organizer_name||null,
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
    // Resolve the (possibly changed) organizer host from the picker, mirroring
    // the import flow, so host re-assignment on an existing event persists.
    const importerHost=(portal&&!isClassPortal)?portal:null;
    const selfOrganized=(previewEv._orgMode||"self")!=="external" && !!importerHost;
    const attributedHost=selfOrganized?importerHost:(previewEv._orgHost||null);
    const doublehanded=previewEv.entries.some(e=>e.crew&&e.crew.trim());
    const ev={...previewEv,status,country:(previewEv.venue||"").toUpperCase()||previewEv.country||"",
      subclass:mf.subclass||null,collabs:mf.collabs||[],cls:mf.cls||previewEv.cls,
      owner:attributedHost||null,
      organizer_name:attributedHost?null:(previewEv._orgName||previewEv.organizer_name||null),
      doublehanded};
    // Update event metadata
    await sbPatch("events",`id=eq.${editResultsEv}`,{
      name:ev.name,date:ev.date,country:ev.country||null,
      discards:ev.discards,status,subclass:ev.subclass,collabs:ev.collabs,
      cls:ev.cls,owner:ev.owner,organizer_name:ev.organizer_name,doublehanded:ev.doublehanded,
    });
    // Update entries (delete old, insert new)
    if(sbH){
      await sbDel("entries",`event_id=eq.${editResultsEv}`);
      await sbPost("entries",ev.entries.map(e=>({
        event_id:editResultsEv,sail:e.sail,nat:e.nat||null,
        division:e.div,gender:e.gender||null,category:e.category||null,helm_name:e.helm,crew_name:e.crew||null,
        races:e.races,race_codes:e.race_codes||null,
        pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null,
      })));
    }
    delete ev._orgMode; delete ev._orgHost; delete ev._orgName;
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
    setLiveUrl("");setParseLog([]);setParseProgress({done:0,total:0});
  };
  // ── Import-draft persistence (in-memory, session-scoped) ──
  // The import pop-up is inline JSX gated on `open` (not a separately-mounted
  // component), so there's no modal-mount lifecycle for lazy useState initializers.
  // Instead we snapshot the live batch into the module-scope IMPORT_DRAFT holder on
  // close and restore it synchronously in the same click that reopens (before the
  // modal renders → no flicker). Cleared on successful publish/save-draft and when a
  // fresh batch starts. NOT persisted to storage — a page reload clears it by design.
  const clearImportDraft=()=>{IMPORT_DRAFT=null;};
  const snapshotImportDraft=()=>{
    // Nothing meaningful to keep? (no parsed batch / no preview) → drop any old draft.
    if(editResultsEv||(!pending.length&&!previewEv)){IMPORT_DRAFT=null;return;}
    // Fold the active editor (previewEv + subclass/collabs live in mf) into its slot.
    const snapPending=pending.map((p,i)=>i===activePending?{...p,previewEv,subclass:mf.subclass,collabs:mf.collabs}:p);
    IMPORT_DRAFT={pending:snapPending,activePending,previewEv,mf,importStep,tab,fleetChoices,pdfMeta};
  };
  const restoreImportDraft=()=>{
    const d=IMPORT_DRAFT;if(!d) return false;
    setPending(d.pending||[]);setActivePending(d.activePending||0);
    setPreviewEv(d.previewEv||null);setMf(d.mf||emptyForm());
    setImportStep(d.importStep||"upload");setTab(d.tab||"ai");
    setFleetChoices(d.fleetChoices||[]);setPdfMeta(d.pdfMeta||null);
    return true;
  };
  // Open the import pop-up for a NEW import; restore an in-progress batch if one was
  // stashed on the previous close.
  const openImport=()=>{
    setEditResultsEv(null);
    if(!restoreImportDraft()){resetImport();setTab("ai");}
    setOpen(true);
  };
  const closeImport=()=>{setOpen(false);snapshotImportDraft();resetImport();setTab("ai");};

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
  // Remove a single pending result from the import (without discarding the rest).
  const removePending=idx=>{
    const remaining=pending.filter((_,i)=>i!==idx);
    if(!remaining.length){closeImport();return;}
    setPending(remaining);
    const ni=Math.min(idx<=activePending?activePending-1:activePending,remaining.length-1);
    const safe=Math.max(0,ni);
    setActivePending(safe);
    const t=remaining[safe];
    if(t?.previewEv){setPreviewEv(t.previewEv);setMf(f=>({...f,subclass:t.subclass||null,collabs:t.collabs||[]}));}
    else setPreviewEv(null);
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
        gender:e.gender||"",category:e.category||"",
        helm:e.helm||"",crew:e.crew||"",
        races:(e.races||[]),
        race_codes:e.race_codes||null,pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null,
      })),
    };
    setPreviewEv(ev);setImportStep("preview");
  };

  // Parse a single file → {ok, name, date, entries, discards, multi, fleets, notes, error}
  const parseOneFile=async(file,mode="ai")=>{
    const isHtml=file.name.toLowerCase().endsWith(".html")||file.type==="text/html";
    // Server parser handles PDF, HTML and images, and carries the full format
    // support (fleet splitting, crew columns, Sailti, sail-number headers…), so
    // send everything there first. For HTML, fall back to the in-browser parser
    // only if the server is unreachable or can't read the page.
    try{
      const res=await fetch(`/api/parse_pdf?mode=${mode}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      const data=await res.json();
      if(data.ok) return data;
      if(!isHtml){
        let err=data.error||"Could not parse this file.";
        // B: when the built-in parser doesn't recognise a PDF, point to the AI parser.
        if(mode==="rule"&&/not found|unsupported|unknown|couldn'?t|supported:/i.test(err))
          err=err.replace(/\s*For other formats use Manual entry\.?/i,"")
              +" — switch to the AI parser tab (it reads odd or non-standard layouts), or use Manual entry.";
        return{ok:false,error:err};
      }
      // server reachable but couldn't read the HTML → try the browser parser below
    }catch{
      if(!isHtml) return{ok:false,error:"Upload failed. Check api/parse_pdf.py is deployed."};
    }
    if(isHtml){
      try{
        const buf=await file.arrayBuffer();
        const html=new TextDecoder('iso-8859-1').decode(buf);
        const data=parseHtml(html);
        if(!data.ok) return{ok:false,error:data.error||"Could not parse this HTML file."};
        return{...data,notes:data.notes||["Parsed the HTML in your browser."]};
      }catch(err){return{ok:false,error:"HTML parse failed: "+err.message};}
    }
    return{ok:false,error:"Could not parse this file."};
  };

  // ── Paged AI parse (PDF only): split into per-page calls so each finishes
  //    under the Hobby 10s function cap, then stitch the entries together.
  //    onProgress(done,total) drives the per-page UI. Returns the same shape
  //    as parseOneFile: {ok, name, date, entries, discards, ai_parsed, notes}. ──
  const parseOnePdfPaged=async(file,onProgress)=>{
    // 0) Built-in parser FIRST (no AI). It reads every page in one fast pass and,
    //    when it confidently recognises the format, returns complete results
    //    sub-second — so multi-page Sailwave/Manage2sail/SailingResults never hit
    //    the slow per-page AI path (which is also lossy: large tables get
    //    truncated when echoed back through the model). Only fall through to AI
    //    when the built-in parser can't read it or scores low confidence.
    try{
      onProgress&&onProgress(0,1);
      const ruled=await parseOneFile(file,"rule");
      const hasFlat=ruled&&Array.isArray(ruled.entries)&&ruled.entries.length>0;
      const hasFleets=ruled&&ruled.multi&&Array.isArray(ruled.fleets)&&ruled.fleets.length>0;
      if(ruled&&ruled.ok&&(hasFlat||hasFleets)&&!ruled.low_confidence){
        onProgress&&onProgress(1,1);
        return {...ruled,ai_parsed:false};
      }
    }catch{ /* fall through to per-page AI below */ }

    // 1) page count (instant, server-side via pypdf)
    let pageCount=1;
    try{
      const cres=await fetch(`/api/parse_pdf?count=1`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      const cdata=await cres.json();
      if(cdata.ok&&cdata.page_count) pageCount=Math.max(1,cdata.page_count|0);
    }catch{ /* fall back to a single whole-file AI call below */ }

    // Single-page PDF: nothing to chunk — one normal AI call.
    if(pageCount<=1){
      onProgress&&onProgress(0,1);
      const d=await parseOneFile(file,"ai");
      onProgress&&onProgress(1,1);
      return d;
    }

    // 2) parse each page on its OWN request, strictly SEQUENTIAL with one retry.
    //    (Firing pages concurrently tripped Anthropic's per-minute rate limit,
    //    so only the final page survived — hence "last page only".)
    onProgress&&onProgress(0,pageCount);
    const pageResults=new Array(pageCount).fill(null);
    const pageErrors=[];
    const fetchPage=async(pi)=>{
      const r=await fetch(`/api/parse_pdf?page=${pi}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      return r.json();
    };
    for(let pi=0;pi<pageCount;pi++){
      let d=null,err="page failed";
      for(let attempt=0;attempt<2;attempt++){
        try{
          d=await fetchPage(pi);
          if(d&&d.ok&&Array.isArray(d.entries)) break;
          err=(d&&d.error)||"page failed"; d=null;
        }catch(e){ err="network/timeout"; d=null; }
        if(attempt===0) await new Promise(r=>setTimeout(r,8000)); // backoff long enough for a provider rate-limit window to clear
      }
      if(d) pageResults[pi]={entries:d.entries,name:d.name,date:d.date,discards:d.discards,division:d.division||""};
      else pageErrors.push({page:pi+1,error:err});
      onProgress&&onProgress(pi+1,pageCount);
    }

    // 3) group pages into DIVISIONS by their section heading. A page that
    //    repeats the current heading — or carries none (a continuation page) —
    //    stitches onto the current division; a NEW heading opens a new one.
    //    If no page returns a heading at all, everything lands in one group,
    //    degrading safely to a single stitched table (the old behaviour).
    const rowKey=e=>`${String(e.sail||"").replace(/\s+/g,"").toLowerCase()}|${(e.helm||"").toLowerCase()}|${(e.crew||"").toLowerCase()}`;
    const groups=[]; let name="",date="",discards=1,cur=null,curDiv="";
    pageResults.forEach(pr=>{
      if(!pr) return;
      if(pr.name&&!name) name=pr.name;
      if(pr.date&&!date) date=pr.date;
      if(pr.discards) discards=Math.max(discards,pr.discards|0);
      const div=String(pr.division||"").trim();
      const sameDiv=div&&curDiv&&div.toLowerCase()===curDiv.toLowerCase();
      if(!cur||(div&&!sameDiv)){
        cur={division:div,entries:[],keys:new Set(),discards:pr.discards||1};
        groups.push(cur);
      }
      if(div) curDiv=div;
      (pr.entries||[]).forEach(e=>{
        const k=rowKey(e);
        if(cur.keys.has(k)) return;              // dedupe page overlap within a division
        cur.keys.add(k); cur.entries.push(e);
      });
      cur.discards=Math.max(cur.discards||1,pr.discards||1);
    });
    const divs=groups.filter(g=>g.entries.length);

    // 4) subset-collapse: keep only SUPERSET divisions. Drop any division whose
    //    sailors are ≥90% contained in a strictly larger one (e.g. "Girls U16" ⊂
    //    "Girls U18"). Genuinely distinct divisions (different gender/class)
    //    barely overlap, so the high ratio uniquely flags a real subset.
    const containedIn=(a,b)=>{ if(!a.keys.size) return false; let n=0; a.keys.forEach(k=>{if(b.keys.has(k))n++;}); return n/a.keys.size>=0.9; };
    const dropped=[];
    const keep=divs.filter((g,gi)=>{
      const hasSuper=divs.some((h,hi)=>hi!==gi&&h.entries.length>g.entries.length&&containedIn(g,h));
      if(hasSuper){ dropped.push(g.division||`${g.entries.length} rows`); return false; }
      return true;
    });

    if(!keep.length){
      const firstErr=pageErrors.length?pageErrors[0].error:"";
      return{ok:false,error:pageErrors.length
        ?`AI parser couldn't read this PDF (${pageErrors.length}/${pageCount} pages failed). Reason: ${firstErr}. Try the built-in parser, or a Sailwave/Manage2sail export.`
        :"AI parser returned no entries."};
    }
    const total=keep.reduce((n,g)=>n+g.entries.length,0);
    const notes=[keep.length>1
      ?`AI-parsed ${pageCount} pages → ${keep.length} divisions, ${total} competitors.`
      :`AI-parsed ${pageCount} pages → ${total} competitors.`];
    if(dropped.length) notes.push(`Collapsed ${dropped.length} subset division(s) into their superset: ${dropped.join(", ")}.`);
    if(pageErrors.length) notes.push(`⚠ ${pageErrors.length} page(s) failed (${pageErrors.map(x=>x.page).join(", ")}) — review for gaps before publishing.`);
    const evName=name||file.name.replace(/\.pdf$/i,"");
    if(keep.length===1)
      return{ok:true,multi:false,name:evName,date,discards,entries:keep[0].entries,ai_parsed:true,notes,partial:pageErrors.length>0};
    return{ok:true,multi:true,name:evName,date,discards,ai_parsed:true,notes,partial:pageErrors.length>0,
      fleets:keep.map(g=>({name:g.division||"Division",entries:g.entries,discards:g.discards||discards}))};
  };

  // Fetch + parse a live results link server-side (browser can't, due to CORS).
  const parseLink=async(url,mode="ai")=>{
    try{
      const res=await fetch(`/api/parse_pdf?mode=${mode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,mode})});
      const data=await res.json();
      if(!data.ok) return{ok:false,error:data.error||"Could not parse that link."};
      return data;
    }catch{return{ok:false,error:"Couldn't reach the parser. Check api/parse_pdf.py is deployed."};}
  };

  // Build a previewEv object from parsed fleet data (no state side-effects).
  // Match a parser-detected host name to a runtime host (case-insensitive,
  // punctuation ignored). Tries an exact normalised match, then containment
  // either way (so "RHKYC" ↔ "Royal Hong Kong Yacht Club" still resolves).
  const _normHostName=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"");
  const matchDetectedHost=name=>{
    const n=_normHostName(name); if(n.length<3) return null;
    const all=[...ASSOCIATIONS,...CLUBS,...FEDERATIONS];
    let h=all.find(x=>_normHostName(x.name)===n);
    if(h) return h.id;
    h=all.find(x=>{const hn=_normHostName(x.name);return hn.length>=3&&(hn.includes(n)||n.includes(hn));});
    return h?h.id:null;
  };
  // Build the organizer-attribution fields from a detected host name. Matched →
  // attribute to that host (+ prefill its country); unmatched → "Another
  // organizer" with the detected name as free text.
  const orgFromDetectedHost=name=>{
    const nm=String(name||"").trim();
    if(!nm) return {};
    const matchedId=matchDetectedHost(nm);
    const importerHost=(portal&&!isClassPortal)?portal:null;
    if(matchedId){
      const code=hostLocation(matchedId,events);
      if(matchedId===importerHost) return {_orgMode:"self",...(code?{venue:code}:{})};
      return {_orgMode:"external",_orgHost:matchedId,...(code?{venue:code}:{})};
    }
    return {_orgMode:"external",_orgName:nm};
  };

  const previewFromData=(name,date,fleet,aiParsed=false,detectedClass="",detectedHost="")=>{
    const lockedCls=assoc?.cls;                          // association portals lock to their class
    const dhFromEntries=(fleet.entries||[]).some(e=>e.crew&&String(e.crew).trim());
    const inferred=classFromFleetName(fleet.name||name);
    // Resolve the parser's detected_class: a known main-class id is used as-is;
    // an unrecognised name (e.g. "2.4 mR") becomes/reuses a custom class id.
    let detCls="";
    if(detectedClass)
      detCls=CLASSES.some(c=>c.id===detectedClass)?detectedClass:(addCustomClass(detectedClass)||"");
    const cls=lockedCls||inferred||detCls||(dhFromEntries?"29er":"optimist");
    const sh=cls==="ilca"||cls==="optimist";
    return{
      id:"imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
      name:(fleet.name?`${name} — ${fleet.name}`:name)||"Imported Competition",
      cls,doublehanded:!sh,venue:"",country:"",
      date:date||"",discards:fleet.discards||1,scoring:"Appendix A",
      source:"Imported",status:"Final",
      ai_parsed:aiParsed||false,
      entries:(fleet.entries||[]).map(e=>({
        helm:e.helm||"",crew:sh?"":(e.crew||""),sail:e.sail||"—",nat:e.nat||"",div:e.div||"",
        gender:e.gender||"",category:e.category||"",
        races:e.races||[],race_codes:e.race_codes||null,pdf_rank:e.pdf_rank??null,pdf_net:e.pdf_net??null,
        birth_year:e.birth_year??null,crew_birth_year:sh?null:(e.crew_birth_year??null),
      })),
      // Organizer/country prefill from detected_host — applied last so it can
      // override venue:"". Identical across sibling fleets → they start synced.
      ...orgFromDetectedHost(detectedHost),
    };
  };

  // ── MULTI-FILE: parse all chosen files into the pending list ──
  // Drag-and-drop: same code path as the file input's onChange (handleFiles). Depth
  // counter guards against dragleave firing when the pointer crosses child elements.
  const onDragEnter=e=>{e.preventDefault();e.stopPropagation();if(!pdfLoading)setDragDepth(d=>d+1);};
  const onDragOver=e=>{e.preventDefault();e.stopPropagation();};
  const onDragLeave=e=>{e.preventDefault();e.stopPropagation();setDragDepth(d=>Math.max(0,d-1));};
  const onDropFiles=(e,mode)=>{
    e.preventDefault();e.stopPropagation();setDragDepth(0);
    if(pdfLoading) return;
    const files=e.dataTransfer?.files;
    if(files&&files.length) handleFiles(files,mode);
  };
  const handleFiles=async(fileList,mode="ai")=>{
    const files=[...(fileList||[])];
    if(!files.length) return;
    setPdfError("");setPdfLoading(true);
    setParseProgress({done:0,total:files.length});
    setParseLog(files.map(f=>({name:f.name,status:"parsing",notes:[mode==="ai"?"Sending to the AI parser…":"Reading with the built-in parser…"]})));
    const seed=files.map((f,i)=>({id:"pf_"+Date.now()+"_"+i,name:f.name,status:"parsing",error:null,previewEv:null,subclass:null,collabs:[]}));
    setPending(seed);setActivePending(0);
    // Parse files concurrently (was sequential). Total time ≈ slowest file, not the sum.
    // Cap concurrency so a large batch doesn't fire dozens of simultaneous AI calls.
    let done=0;
    const handleOne=async(i)=>{
      const f=files[i];
      const isPdf=f.name.toLowerCase().endsWith(".pdf")||f.type==="application/pdf";
      let data;
      if(mode==="ai"&&isPdf){
        // Flow: built-in (rule) parser → per-page Claude for multi-page scans.
        // parseOnePdfPaged tries the rule parser FIRST (handles Sailwave /
        // Manage2sail / Sailti instantly, all pages, exact names), does ONE
        // whole-file Claude call for single-page unknowns, and only chunks
        // page-by-page for MULTI-PAGE image/unknown PDFs — where a single
        // whole-file pass silently returns just page 1 (each page is often its
        // own division). Most files finish in the rule parser with no AI at all.
        setParseLog(prev=>prev.map((l,li)=>li===i?{...l,status:"parsing",notes:["Reading with the built-in parser…"]}:l));
        data=await parseOnePdfPaged(f,(p,t)=>{
          setParseLog(prev=>prev.map((l,li)=>li===i
            ?{...l,status:"parsing",notes:[t>1?`AI reading page ${Math.min(p+1,t)} of ${t}…`:"Sending to the AI parser…"]}
            :l));
        });
      }else{
        data=await parseOneFile(f,mode);
      }
      // Flag-image nationalities: when the rule parser found a Nat column but it
      // was empty (flags, not text), read them with one small AI call and merge
      // by SAIL NUMBER (never by row order — so a flag can't land on the wrong
      // boat). Best-effort: a failure leaves the result with blank nat.
      if(data.ok&&data.nat_from_flags&&isPdf){
        try{
          setParseLog(prev=>prev.map((l,li)=>li===i?{...l,status:"parsing",notes:["Reading nationalities from flags…"]}:l));
          const nr=await fetch(`/api/parse_pdf?nat=1`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:f});
          const nd=await nr.json();
          if(nd.ok&&nd.nats&&Object.keys(nd.nats).length){
            const norm=v=>String(v||"").replace(/\s+/g,"").toLowerCase();
            const apply=ents=>(ents||[]).forEach(e=>{const code=nd.nats[norm(e.sail)];if(code&&!(e.nat||"").trim())e.nat=code;});
            if(data.entries) apply(data.entries);
            if(data.fleets) data.fleets.forEach(fl=>apply(fl.entries));
          }
        }catch(e){ /* best-effort — keep the parsed result without nationalities */ }
      }
      let rows;
      if(!data.ok){
        rows=[{...seed[i],status:"error",error:data.error}];
        setParseLog(prev=>prev.map((l,li)=>li===i?{...l,status:"error",notes:[data.error]}:l));
      }else if(data.multi&&data.fleets?.length){
        const groupId="fg_"+Date.now()+"_"+i;
        const groupDisc=Math.max(...data.fleets.map(f=>f.discards||1));
        rows=data.fleets.map((fl,fi)=>({id:seed[i].id+"_f"+fi,name:`${files[i].name} · ${fl.name||"Fleet "+(fi+1)}`,status:"ok",error:null,
          previewEv:previewFromData(data.name,data.date||"",fl,data.ai_parsed||false,data.detected_class||"",data.detected_host||""),subclass:null,collabs:[],
          fleetGroupId:groupId,fleetGroupBaseName:data.name,fleetGroupDiscards:groupDisc}));
        setParseLog(prev=>prev.map((l,li)=>li===i?{...l,status:"ok",notes:[...(data.notes||[]),`Split into ${data.fleets.length} fleets.`]}:l));
      }else{
        rows=[{...seed[i],status:"ok",previewEv:previewFromData(data.name,data.date||"",{name:"",entries:data.entries,discards:data.discards},data.ai_parsed||false,data.detected_class||"",data.detected_host||"")}];
        setParseLog(prev=>prev.map((l,li)=>li===i?{...l,status:"ok",notes:data.notes||["Done."]}:l));
      }
      done++; setParseProgress({done,total:files.length});
      return rows;
    };
    const perFile=new Array(files.length);
    let next=0;
    const worker=async()=>{ while(next<files.length){ const i=next++; perFile[i]=await handleOne(i); } };
    await Promise.all(Array.from({length:Math.min(3,files.length)},worker));
    const results=perFile.flat();
    setPending(results);setActivePending(0);
    const firstOk=results.findIndex(r=>r.status==="ok");
    if(firstOk>=0){setActivePending(firstOk);setPreviewEv(results[firstOk].previewEv);setImportStep("preview");}
    // If every file errored, stay on the upload screen so the error list is visible.
    setPdfLoading(false);
  };

  // ── LIVE LINK: fetch + parse a results URL server-side, add to pending ──
  const handleLink=async(url,mode="ai")=>{
    const u=(url||"").trim();
    if(!u) return;
    setPdfError("");setPdfLoading(true);
    setParseProgress({done:0,total:1});
    setParseLog([{name:u,status:"parsing",notes:["Fetching the page server-side…"]}]);
    const data=await parseLink(u,mode);
    if(!data.ok){
      setPending([{id:"link_"+Date.now(),name:u,status:"error",error:data.error,previewEv:null,subclass:null,collabs:[]}]);
      setParseLog([{name:u,status:"error",notes:[data.error]}]);
      setActivePending(0);setParseProgress({done:1,total:1});setPdfLoading(false);
      return;
    }
    const results=[];
    if(data.multi&&data.fleets?.length){
      const groupId="fg_link_"+Date.now();
      const groupDisc=Math.max(...data.fleets.map(f=>f.discards||1));
      data.fleets.forEach((fl,fi)=>{
        results.push({id:groupId+"_f"+fi,name:`${data.name||"Link"} · ${fl.name||"Fleet "+(fi+1)}`,status:"ok",error:null,
          previewEv:previewFromData(data.name,data.date||"",fl,data.ai_parsed||false,data.detected_class||"",data.detected_host||""),subclass:null,collabs:[],
          fleetGroupId:groupId,fleetGroupBaseName:data.name,fleetGroupDiscards:groupDisc});
      });
    }else{
      results.push({id:"link_"+Date.now(),name:data.name||u,status:"ok",error:null,
        previewEv:previewFromData(data.name,data.date||"",{name:"",entries:data.entries,discards:data.discards},data.ai_parsed||false,data.detected_class||"",data.detected_host||""),subclass:null,collabs:[]});
    }
    setPending(results);
    const firstOk=results.findIndex(r=>r.status==="ok");
    if(firstOk>=0){setActivePending(firstOk);setPreviewEv(results[firstOk].previewEv);setImportStep("preview");}
    setParseLog([{name:u,status:"ok",notes:data.notes||["Parsed."]}]);
    setParseProgress({done:1,total:1});setPdfLoading(false);
  };

  const handlePdf=async file=>{
    if(!file) return;
    return handleFiles([file]);
  };
  const selectFleet=fleet=>buildPreviewFromFleet(pdfMeta.name,pdfMeta.date,fleet);
  const updPMeta=(k,v)=>setPreviewEv(ev=>({...ev,[k]:v}));
  const updPEntry=(idx,k,v)=>setPreviewEv(ev=>({...ev,entries:ev.entries.map((e,i)=>i===idx?{...e,[k]:v}:e)}));
  // Update a SHARED field (Host Country, Date, Organizer) on the active preview
  // AND every sibling tab from the same source file (fleetGroupId) — edit once,
  // applied to all fleets of that file. Other fields stay per-tab via updPMeta.
  const updSharedMeta=(k,v)=>{
    setPreviewEv(ev=>ev?{...ev,[k]:v}:ev);            // active (live editor)
    const gid=pending[activePending]?.fleetGroupId;
    if(!gid) return;                                  // single-file → nothing to sync
    setPending(prev=>prev.map((p,i)=>
      (i!==activePending&&p.fleetGroupId===gid&&p.previewEv)
        ? {...p,previewEv:{...p.previewEv,[k]:v}}
        : p));
  };
  // Collab (association/club) is stored per-fleet in `mf`/pending, not previewEv.
  // Sync it across every sibling fleet of the same source file — set once, applied
  // to all fleets of that event (same behaviour as Host Country / Date above).
  const updSharedCollabs=(v)=>{
    updMeta("collabs",v);                              // active editor (mf)
    const gid=pending[activePending]?.fleetGroupId;
    if(!gid) return;                                   // single-file → nothing to sync
    setPending(prev=>prev.map(p=>p.fleetGroupId===gid?{...p,collabs:v}:p));
  };
  // Resolve the host driving the preview: the self-organizing importer, else
  // the manually attributed AthLink host (detected, or picked in the organiser
  // controls). Re-derives whenever _orgMode/_orgHost change, so a later manual
  // organiser pick flows through the same auto-fill effect below.
  const _pvImporterHost=(portal&&!isClassPortal)?portal:null;
  const _pvResolvedHost=previewEv
    ?((((previewEv._orgMode||"self")!=="external")&&_pvImporterHost)?_pvImporterHost:(previewEv._orgHost||null))
    :null;
  // Inheritance rule: a competition inherits the organiser host's home country
  // as the DEFAULT Host Country when the document printed none — always
  // overridable in the preview. Only fill when both the field (venue) AND any
  // document-parsed country are empty, so we never clobber a value the user
  // typed or one the parser read off the document.
  useEffect(()=>{
    if(!_pvResolvedHost||!previewEv||previewEv.venue||previewEv.country) return;
    const code=hostLocation(_pvResolvedHost,events);
    if(code) updSharedMeta("venue",code);   // keep auto-filled country synced across sibling fleets
  },[_pvResolvedHost,previewEv?.venue,previewEv?.country]);
  // ── Web-lookup enrichment ──────────────────────────────────────────────
  // After a file parse lands (pending item → ok) and the preview STILL lacks a
  // date and/or a Host Country (AFTER the host-country inheritance above), fire
  // ONE best-effort /api/enrich lookup for that item. Runs once per item
  // (guarded by item._enriched), never auto-applies — it only stores a
  // low-confidence suggestion the strip below the fields can offer.
  useEffect(()=>{
    const item=pending[activePending];
    if(!item||item.status!=="ok"||!item.previewEv||item._enriched) return;
    const pv=item.previewEv;
    const missing=[];
    if(!String(pv.date||"").trim())  missing.push("date");
    if(!String(pv.venue||"").trim()) missing.push("country");   // venue = Host Country field
    if(!missing.length) return;
    const nm=String(pv.name||"").trim();
    if(!nm) return;
    // Resolve organiser name (attributed host, else free-text) + a 4-digit year
    // from the date or the name — extra signal to pin the exact event.
    const host=hostById(_pvResolvedHost)?.name||pv._orgName||"";
    const ym=String(pv.date||"").match(/(\d{4})/)||nm.match(/\b(20\d{2})\b/);
    const year=ym?ym[1]:"";
    const cls=pv.cls?classLabel(pv.cls):"";
    // Mark enriched immediately so re-renders can't refire the request.
    setPending(prev=>prev.map(p=>p.id===item.id?{...p,_enriched:true}:p));
    (async()=>{
      try{
        const r=await fetch("/api/enrich",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({name:nm,cls,year,host,missing})});
        const d=await r.json();
        if(!d||!d.ok) return;                                  // provider error → show nothing
        if(!d.date&&!d.country) return;                        // no confident answer → show nothing
        setEnrichSug(s=>({...s,[item.id]:{date:d.date||null,country:d.country||null,source:d.source||null,dismissed:false}}));
      }catch{ /* enrichment is optional — never break the preview */ }
    })();
  },[pending,activePending,_pvResolvedHost]);
  // Build the DivisionToggle string from an entry's real gender + category.
  const divFromEntry=(e)=>{
    const g=normGender(e.gender)||parseDiv(e.div||"").gender||"";
    const jr=normCategory(e.category)==="Jr"||parseDiv(e.div||"").jr;
    return [g,jr?"Jr":null].filter(Boolean).join(" ");
  };
  // Toggle in preview writes the REAL gender + category fields (preserves U17 etc.).
  const applyPreviewDiv=(idx,v)=>{
    const g=/mix/i.test(v)?"Mix":/\bF\b/.test(v)?"F":/\bM\b/.test(v)?"M":"";
    const jr=/\bJr\b/.test(v);
    setPreviewEv(ev=>({...ev,entries:ev.entries.map((e,i)=>{
      if(i!==idx) return e;
      let category=e.category||"";
      if(jr&&!category) category="Jr"; else if(!jr&&category==="Jr") category="";
      return {...e,div:v,gender:g,category};
    })}));
  };

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
    // Source ≠ organizer. Importing makes you the CONTRIBUTOR (imported_by);
    // you only become the ORGANIZER (owner) when you assert you ran it.
    const importerHost=(portal&&!isClassPortal)?portal:null;
    const selfOrganized=(previewEv._orgMode||"self")!=="external" && !!importerHost;
    const attributedHost=selfOrganized?importerHost:(previewEv._orgHost||null);
    const ev={...previewEv,status,
      cls:previewEv.cls||assoc?.cls||"29er",
      subclass:mf.subclass||previewEv.subclass||null,
      owner:attributedHost||null,
      owner_confirmed:selfOrganized,
      imported_by:importerHost,
      organizer_name:selfOrganized?null:(attributedHost?null:(previewEv._orgName||null)),
      collabs:mf.collabs||previewEv.collabs||[],
      venue:previewEv.venue||"",
      country:(previewEv.venue||"").toUpperCase()||previewEv.country||"",
      date:previewEv.date||"",
      doublehanded:previewEv.entries.some(e=>e.crew&&e.crew.trim()),
    };
    ev.entries=ev.entries.map(e=>({...e,races:(e.races||[]).filter(r=>r!==null&&r!==undefined&&r!==""),}));
    delete ev._orgMode; delete ev._orgHost; delete ev._orgName;
    ev.fingerprint=eventFingerprint(ev);
    ev.sources=[...new Set([...(previewEv.sources||[]),importerHost].filter(Boolean))];
    // Phase B — dedup on import. If this competition already exists (same
    // fingerprint: name + date + class + sail-number set), don't create a
    // duplicate. Link this contributor as an extra source, backfill any blank
    // metadata, and — if they assert they organized it and the existing record
    // has no confirmed organizer — transfer confirmed ownership to them. Only
    // dedups when there's a real sail set (guards against blank/draft collisions).
    const fpSails=(ev.fingerprint||"").split("|")[3];
    const dup=fpSails?events.find(x=>x.id!==ev.id&&eventFingerprint(x)===ev.fingerprint):null;
    if(dup){
      const mergedSources=[...new Set([...(dup.sources||[]),...(ev.sources||[])])];
      const patch={sources:mergedSources};
      if(!dup.date&&ev.date) patch.date=ev.date;
      if(!dup.venue&&ev.venue) patch.venue=ev.venue;
      if(!dup.country&&ev.country) patch.country=ev.country;
      if(selfOrganized&&dup.owner_confirmed===false){patch.owner=importerHost;patch.owner_confirmed=true;patch.imported_by=dup.imported_by||importerHost;}
      setEvents(p=>p.map(x=>x.id===dup.id?{...x,...patch}:x));
      const who=hostById(importerHost)?.name||"your contribution";
      clearImportDraft();   // this result is filed — drop it from any stashed draft
      setNote({name:dup.name,matched:0,created:0,msg:`Already on AthLink — linked ${who} as an additional source (no duplicate created).`});
      setTimeout(()=>setNote(null),7000);
      if(pending.length){
        const remaining=pending.filter((_,i)=>i!==activePending);
        if(remaining.length){
          setPending(remaining);
          const nextIdx=Math.min(activePending,remaining.length-1);
          const firstOk=remaining[nextIdx]?.status==="ok"?nextIdx:remaining.findIndex(r=>r.status==="ok");
          setActivePending(firstOk<0?0:firstOk);
          const t=remaining[firstOk<0?0:firstOk];
          if(t?.previewEv){setPreviewEv(t.previewEv);setMf(f=>({...f,subclass:t.subclass||null,collabs:t.collabs||[]}));}
        } else { closeImport(); }
      } else { closeImport(); }
      const isSaved=!String(dup.id).startsWith("imp_")&&!String(dup.id).startsWith("fg_");
      if(isSaved){(async()=>{try{await sbPatch("events",`id=eq.${dup.id}`,patch);}catch(err){console.error("importPreview dedup patch failed",err);}})();}
      return;
    }
    const existing=new Set();events.forEach(e=>e.entries.forEach(en=>{existing.add(en.helm);if(en.crew)existing.add(en.crew);}));
    const incoming=new Set();ev.entries.forEach(en=>{incoming.add(en.helm);if(en.crew)incoming.add(en.crew);});
    let matched=0,created=0;incoming.forEach(n=>existing.has(n)?matched++:created++);
    // Optimistic: drop the event into the list and close the popup immediately
    setEvents(p=>[ev,...p.filter(x=>x.id!==ev.id)]);
    clearImportDraft();   // this result is filed — drop it from any stashed draft
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
    // Persist in the background; swap in the DB copy (with real ids) once saved.
    // DETACHED (not awaited) so importPreview resolves as soon as the optimistic
    // UI above is done — the Publish/Draft button's loading state then clears
    // immediately instead of hanging on the DB round-trip.
    (async()=>{
      try{
        const saved=await saveEventToDb(ev);
        if(saved?.[0]?.id){
          // If this contribution was attributed to ANOTHER real host as organizer
          // (external, unconfirmed), file an event claim so it surfaces in that
          // host's "Event claims" tab for a verified admin to confirm.
          if(!selfOrganized&&attributedHost&&hostById(attributedHost)&&attributedHost!==importerHost&&auth?.user?.id){
            try{await createEventClaim(saved[0].id,attributedHost,auth.user.id,`Attributed at import by ${hostById(importerHost)?.name||"a contributor"}`,auth.token);await reloadEventClaims();}
            catch(e){console.error("importPreview: auto event-claim failed",e);}
          }
          const fresh=await sbGet(`events?select=*,entries(*)&id=eq.${saved[0].id}`);
          if(fresh?.[0]){
            const dbEv=dbToApp(fresh[0]);
            setEvents(p=>p.map(x=>x.id===ev.id?dbEv:x));
            // If the user is currently viewing this just-imported event, keep the
            // view pointed at the new DB id so the page doesn't go blank.
            setView(v=>(v.name==="event"&&v.id===ev.id)?{...v,id:dbEv.id}:v);
          }
        } else {
          console.error("importPreview: Supabase save failed — kept in memory only (will not persist on reload)");
        }
      }catch(err){console.error("importPreview: background save error",err);}
    })();
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
    return{id:"imp_"+Date.now(),name:mf.name||"Imported Competition",cls:evCls,
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
    clearImportDraft();setNote({name:ev.name,matched,created});setOpen(false);setMf(emptyForm());
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
  <svg xmlns="http://www.w3.org/2000/svg" style={{display:'none'}} aria-hidden="true">
    <filter id="glass-distortion" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="turbulence"/>
      <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="8" xChannelSelector="R" yChannelSelector="G" result="displacement"/>
      <feGaussianBlur in="displacement" stdDeviation="0.5" result="blur"/>
      <feBlend in="SourceGraphic" in2="blur" mode="normal"/>
    </filter>
  </svg>
  <LiquidBackground/>
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@600;700;800&display=swap');
    .al-root{
      --navy:#13314e;--navy2:#1f4e80;--accent:#0a84ff;--accent2:#409cff;--sky:#e8f1fc;
      --paper:#eef3fb;--ink:#1d1d1f;--mut:rgba(44,52,68,0.86);--line:rgba(60,60,67,0.12);
      --card:#ffffff;--gold:#c8920b;--link:#0a4fb0;
      --mat-thin:rgba(255,255,255,0.40);--mat-reg:rgba(255,255,255,0.55);--mat-thick:rgba(250,251,253,0.85);
      --mat-dark:rgba(17,40,66,0.58);--grouped:rgba(118,118,128,0.10);--halo:rgba(10,132,255,0.20);
      --radius:16px;
      font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Segoe UI',Roboto,system-ui,sans-serif;
      color:var(--ink);min-height:100vh;-webkit-font-smoothing:antialiased;font-optical-sizing:auto;letter-spacing:-.01em;
      position:relative;z-index:0;isolation:isolate;
      background:linear-gradient(165deg,#d5deee 0%,#dfe8f5 45%,#e6eaf3 100%);
      background-attachment:fixed;}
    .al-liquid{position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;filter:blur(28px) saturate(125%);opacity:.55;}
    .al-root *{box-sizing:border-box;}
    /* SF Pro everywhere — overrides the inline Barlow/DM Sans refs to get the platform feel */
    .al-root *:not(svg):not(svg *){font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Segoe UI',Roboto,system-ui,sans-serif !important;}
    .disp{font-weight:700;letter-spacing:-.022em;}
    .wrap{max-width:1000px;margin:0 auto;padding:0 22px;}
    .topbar{background:var(--mat-dark);backdrop-filter:blur(44px) saturate(195%);-webkit-backdrop-filter:blur(44px) saturate(195%);color:#fff;position:sticky;top:0;z-index:60;border-bottom:1px solid rgba(255,255,255,.08);}
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
    .strip{background:none;color:var(--ink);padding:18px 0 18px;}
    .strip h1{font-family:'Barlow',sans-serif;color:var(--ink);font-size:28px;font-weight:800;margin:0 0 14px;}
    /* ── Standardized page header (back on top, then title) ── */
    .page-head{padding-top:8px;margin-bottom:18px;}
    .page-title{font-family:'Barlow',sans-serif;color:var(--ink);font-size:28px;font-weight:800;margin:0;letter-spacing:-.022em;line-height:1.1;}
    .page-sub{color:var(--mut);font-size:14px;margin:6px 0 0;}
    /* ── Calendar liquid-glass header ── */
    .cal-head-glass{background:rgba(255,255,255,.55);backdrop-filter:blur(40px) saturate(200%);-webkit-backdrop-filter:blur(40px) saturate(200%);border-radius:22px;padding:16px 20px;box-shadow:inset 0 1.5px 0 rgba(255,255,255,.8),inset 0 0 0 .5px rgba(255,255,255,.5),0 10px 30px -14px rgba(0,0,0,.22);}
    .cal-viewtoggle{display:inline-flex;align-items:center;gap:6px;font-family:'Barlow',sans-serif;font-weight:700;font-size:13px;color:var(--navy);background:var(--mat-reg);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);border:0;border-radius:980px;padding:7px 14px;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 1px 0 rgba(255,255,255,.7),0 1px 2px rgba(0,0,0,.07);transition:.15s;}
    .cal-viewtoggle:hover{background:var(--navy);color:#fff;}
    .cal-cls-box{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.5);backdrop-filter:blur(24px) saturate(190%);-webkit-backdrop-filter:blur(24px) saturate(190%);border-radius:980px;padding:5px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.45);}
    .cal-cls-mini{border:1px solid var(--line);background:rgba(255,255,255,.4);border-radius:980px;padding:5px 13px;font-size:12.5px;font-weight:700;font-family:'Barlow',sans-serif;color:var(--mut);cursor:pointer;transition:.16s cubic-bezier(.2,.85,.2,1);}
    .cal-cls-mini:hover{transform:translateY(-1px) scale(1.05);filter:brightness(1.05);}
    .cal-cls-mini.on{box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 3px 10px -4px rgba(0,0,0,.25);}
    .cal-toggle-pill{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.6);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;border-radius:980px;padding:9px 18px;font-family:'Barlow',sans-serif;font-weight:800;font-size:16px;color:var(--navy);cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.75),inset 0 0 0 .5px rgba(255,255,255,.45),0 4px 14px -6px rgba(0,0,0,.16);transition:.22s cubic-bezier(.2,.85,.2,1);}
    .cal-toggle-pill:hover{background:rgba(255,255,255,.82);transform:translateY(-2px) scale(1.04);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.9),0 12px 28px -10px rgba(0,0,0,.22);}
    .pillbar{display:flex;gap:20px;flex-wrap:wrap;}
    .pill{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--mut);}
    .pill b{color:var(--navy);font-family:'Barlow',sans-serif;font-size:19px;}
    .sec{padding:24px 0 60px;}
    .seclabel{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#33425e;margin:0 0 14px;display:flex;align-items:center;gap:8px;}
    .ev{background:var(--mat-reg);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border:0;border-radius:var(--radius);padding:18px 20px;margin-bottom:12px;cursor:pointer;transition:.18s;display:flex;align-items:center;gap:14px;animation:rise .5s both;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 .5px rgba(255,255,255,.35),0 1px 2px rgba(0,0,0,.05);}
    .ev:hover{transform:translateY(-3px) scale(1.008);box-shadow:inset 0 1px 0 rgba(255,255,255,.85),inset 0 0 0 .5px rgba(255,255,255,.5),0 18px 40px -16px rgba(0,0,0,.28);}
    .ev.draft{opacity:.72;}
    .evicon{width:44px;height:44px;border-radius:13px;background:var(--sky);color:var(--navy);display:grid;place-items:center;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.6);}
    .evicon-date{width:48px;height:48px;border-radius:12px;background:var(--sky);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;gap:0;}
    .evicon-date .eid{font-family:'Barlow',sans-serif;font-weight:800;font-size:20px;color:var(--navy);line-height:1;}
    .evicon-date .eim{font-size:9px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;line-height:1.2;}
    .evicon-year{display:flex;flex-direction:column;align-items:center;gap:0;}
    .evicon-year span{font-size:9px;font-weight:700;color:var(--mut);letter-spacing:.02em;line-height:1.3;font-family:'Barlow',sans-serif;}
    .evname{font-family:'Barlow',sans-serif;font-weight:700;font-size:17px;margin:0 0 3px;}
    .evmeta{font-size:13px;color:var(--mut);display:flex;gap:12px;flex-wrap:wrap;align-items:center;}
    .evmeta span{display:flex;align-items:center;gap:5px;}
    .draftbadge{font-size:11px;font-weight:700;color:#7a4a0a;background:#fdecd6;padding:4px 9px;border-radius:20px;}
    .cls{font-family:'Barlow',sans-serif;font-weight:700;font-size:12px;color:#fff;background:var(--navy2);padding:4px 10px;border-radius:980px;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.12);}
    .delbtn{background:rgba(255,255,255,.5);backdrop-filter:blur(18px) saturate(185%);-webkit-backdrop-filter:blur(18px) saturate(185%);border:0;color:#c0392b;cursor:pointer;padding:7px;border-radius:980px;display:grid;place-items:center;opacity:.72;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.55),inset 0 1px 0 rgba(255,255,255,.65),0 1px 2px rgba(0,0,0,.06);transition:.15s;flex:none;}
    .delbtn:hover{opacity:1;background:rgba(251,231,228,.88);box-shadow:inset 0 0 0 .5px rgba(192,57,43,.30),0 2px 8px -2px rgba(192,57,43,.25);}
    .panel{background:rgba(255,255,255,0.85);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border:0;border-radius:var(--radius);overflow:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.06);}
    table{width:100%;border-collapse:collapse;font-size:13px;min-width:680px;}
    thead th{background:linear-gradient(180deg,rgba(31,78,128,.92),rgba(19,49,78,.94));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:#fff;font-family:'Barlow',sans-serif;font-weight:600;text-align:center;padding:11px 5px;font-size:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.12);}
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
      background:rgba(10,132,255,.08);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;
      border-radius:14px;font-size:13px;line-height:1.5;color:var(--ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 3px 0 0 var(--accent);
      transform-origin:top center;animation:summaryPop .42s cubic-bezier(.34,1.5,.5,1) both;}
    .row-ai-tooltip{position:fixed;left:50%;transform:translateX(-50%);z-index:90;
      width:min(540px,88vw);pointer-events:none;
      background:rgba(12,30,55,0.82);backdrop-filter:blur(32px) saturate(200%);-webkit-backdrop-filter:blur(32px) saturate(200%);
      border-radius:16px;padding:13px 16px;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 3px 0 0 var(--accent),0 24px 48px -16px rgba(0,0,0,.55);
      display:flex;gap:10px;align-items:flex-start;
      font-size:13px;line-height:1.55;color:#dce8f8;
      animation:rise .18s both;}
    .row-ai-tooltip.loading{color:#7fa8cc;font-style:italic;}
    .team-summary.loading{color:var(--mut);font-style:italic;}
    @keyframes summaryPop{0%{opacity:0;transform:translateY(-9px) scaleY(.5);}55%{opacity:1;transform:translateY(2px) scaleY(1.05);}100%{opacity:1;transform:translateY(0) scaleY(1);}}
    /* Calendar — year/month views */
    .cal-title-btn{font-family:'Barlow',sans-serif;font-weight:700;font-size:18px;color:var(--navy);background:none;border:0;cursor:pointer;padding:6px 14px;border-radius:980px;min-width:150px;transition:.15s;}
    .cal-title-btn:hover{background:var(--grouped);}
    .cal-fade{animation:calFade .26s ease both;}
    @keyframes calFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
    @keyframes calMorph{0%{opacity:0;transform:scale(.55);transform-origin:center top;}60%{opacity:1;}100%{opacity:1;transform:scale(1);}}
    .cal-year-scroll{flex:1;overflow-y:auto;padding:16px 18px;animation:calFade .26s ease both;}
    .cal-year-block{margin-bottom:28px;}
    .cal-year-label{font-family:'Barlow',sans-serif;font-weight:800;font-size:23px;color:var(--navy);margin:0 0 14px;}
    .cal-year-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px;}
    .cal-mini{cursor:pointer;border:0;border-radius:16px;padding:9px;transition:.16s;}
    .cal-mini:hover{background:var(--mat-reg);backdrop-filter:blur(30px) saturate(195%);-webkit-backdrop-filter:blur(30px) saturate(195%);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 8px 22px -12px rgba(0,0,0,.25);transform:translateY(-2px);}
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
    .av{width:30px;height:30px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none;font-family:'Barlow',sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),inset 0 0 0 1px rgba(255,255,255,.18);}
    .cn{font-size:11.5px;color:var(--mut);}
    .namelink{color:var(--link);font-weight:700;cursor:pointer;text-decoration:none;}.namelink:hover{color:#063a85;}
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
    .acard{background:rgba(255,255,255,0.80);backdrop-filter:blur(30px) saturate(195%);-webkit-backdrop-filter:blur(30px) saturate(195%);border:0;border-radius:16px;padding:16px;cursor:pointer;transition:.18s;animation:rise .5s both;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.06);}
    .acard:hover{transform:translateY(-4px) scale(1.015);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.92),0 20px 40px -18px rgba(0,0,0,.28);}
    .achead{display:flex;align-items:center;gap:11px;margin-bottom:12px;}
    .achead>.av{flex:none;}
    .achead .vb-spacer{margin-left:auto;}
    .achead .av{width:42px;height:42px;font-size:14px;}
    .acn{font-family:'Barlow',sans-serif;font-weight:800;font-size:16.5px;line-height:1.12;color:var(--ink);}
    .acstat{display:flex;gap:16px;font-size:10.5px;color:var(--mut);border-top:1px solid var(--line);padding-top:11px;align-items:center;}
    .acstat b{display:block;font-family:'Barlow',sans-serif;font-size:14px;color:var(--ink);font-weight:800;}
    .toolbar{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap;}
    .srch{flex:1;min-width:200px;display:flex;align-items:center;gap:8px;background:var(--mat-reg);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border:0;border-radius:12px;padding:10px 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 .5px rgba(255,255,255,.35);transition:background .16s,box-shadow .16s;}
    .srch:hover,.srch:focus-within{background:rgba(255,255,255,0.66);box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 0 0 4px var(--halo);}
    .srch input{border:0;outline:0;font:inherit;font-size:14px;width:100%;background:none;color:var(--ink);}
    .seg{display:inline-flex;background:rgba(255,255,255,.42);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;border-radius:980px;padding:5px;gap:2px;box-shadow:inset 0 1px 0 rgba(255,255,255,.75),inset 0 0 0 .5px rgba(255,255,255,.45),0 4px 14px -8px rgba(0,0,0,.14);}
    .seg button{font:inherit;font-family:'Barlow',sans-serif;font-size:13px;font-weight:700;border:0;background:none;color:var(--mut);padding:8px 18px;border-radius:980px;cursor:pointer;transition:.16s cubic-bezier(.2,.85,.2,1);white-space:nowrap;}
    .seg button:hover{color:var(--navy);}
    .seg button.on{background:rgba(255,255,255,.92);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);color:var(--navy);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 8px -2px rgba(0,0,0,.16);}
    .btn{font-weight:600;font-size:14px;border:0;border-radius:980px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;transition:transform .18s cubic-bezier(.4,0,.2,1),filter .18s,background .18s,box-shadow .18s;letter-spacing:-.01em;}
    /* ── Crisp-edge buttons: original (un-blurred) tints + a hairline ring in
       each variant's own hue and a faint separation shadow for definition.
       No displacement distortion on the solid tints — keeps them sharp. ── */
    .btn.cta{background:var(--accent);color:#fff;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.30),inset 0 1px 0 rgba(255,255,255,.45),0 1px 3px rgba(10,132,255,.35);}.btn.cta:hover{background:var(--accent2);}
    .btn.ghost{background:var(--mat-reg);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;color:var(--ink);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.62),inset 0 1px 0 rgba(255,255,255,.72),0 1px 2px rgba(0,0,0,.10);}.btn.ghost:hover{background:rgba(255,255,255,.85);}
    .btn.sky{background:rgba(10,132,255,.20);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);color:var(--navy);border:0;box-shadow:inset 0 0 0 .5px rgba(10,132,255,.45),inset 0 1px 0 rgba(255,255,255,.5),0 1px 2px rgba(0,0,0,.08);}.btn.sky:hover{background:rgba(10,132,255,.28);}
    .btn.amber{background:rgba(255,149,0,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#a85c00;border:0;box-shadow:inset 0 0 0 .5px rgba(255,149,0,.42),inset 0 1px 0 rgba(255,255,255,.45),0 1px 2px rgba(0,0,0,.07);}.btn.amber:hover{background:rgba(255,149,0,.24);}
    .btn.green{background:rgba(52,199,89,.18);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#0a7a3f;border:0;box-shadow:inset 0 0 0 .5px rgba(52,199,89,.45),inset 0 1px 0 rgba(255,255,255,.45),0 1px 2px rgba(0,0,0,.07);}.btn.green:hover{background:rgba(52,199,89,.28);}
    .btn:hover{transform:translateY(-2px) scale(1.025);filter:brightness(1.06);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 12px 28px -10px rgba(0,0,0,.22);}
    .btn:active{transform:translateY(0) scale(.975);filter:brightness(.99);}
    .btn:disabled{opacity:.45;cursor:default;transform:none;filter:none;}
    .phead{background:linear-gradient(135deg,rgba(31,78,128,.95),rgba(19,49,78,.96));backdrop-filter:blur(38px) saturate(185%);-webkit-backdrop-filter:blur(38px) saturate(185%);border-radius:22px;padding:26px;color:#fff;display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 10px 30px -16px rgba(0,0,0,.4);}
    .phead .av{width:74px;height:74px;font-size:26px;border:3px solid rgba(255,255,255,.22);}
    .globe-wrap .expand-tip{opacity:0;transition:opacity .15s;}
    .globe-wrap:hover .expand-tip{opacity:1;}
    .pname{font-family:'Barlow',sans-serif;font-weight:800;font-size:28px;margin:0;line-height:1;}
    .pflag{font-size:28px;line-height:1;margin-right:4px;}
    .pmeta{color:#bcd2e8;font-size:14px;margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;}
    .pmeta span{display:flex;align-items:center;gap:5px;}
    .pstats{display:flex;gap:28px;margin-top:18px;flex-wrap:wrap;}
    .pstats .v{font-family:'Barlow',sans-serif;font-weight:800;font-size:25px;}
    .pstats .k{font-size:11px;color:#9fbdd9;letter-spacing:.05em;text-transform:uppercase;}
    .claimbox{margin-left:auto;text-align:right;}
    .vbox{background:rgba(10,132,255,.16);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;border-radius:16px;padding:12px 16px;color:#eaf3ff;font-size:13px;max-width:240px;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),inset 0 0 0 .5px rgba(255,255,255,.18);}
    .vbox b{color:#fff;display:flex;align-items:center;gap:6px;font-family:'Barlow',sans-serif;}
    .histrow{background:var(--mat-reg);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border:0;border-radius:13px;padding:15px 18px;margin-bottom:11px;display:flex;align-items:center;gap:16px;animation:rise .45s both;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 .5px rgba(255,255,255,.3),0 1px 2px rgba(0,0,0,.05);}
    .hrk{font-family:'Barlow',sans-serif;font-weight:800;font-size:22px;width:58px;text-align:center;flex:none;color:var(--navy);}
    .hrk.p1{color:#a87d00;}.hrk.p2{color:#1f6fb2;}.hrk.p3{color:#b23a3a;}
    .hrk small{display:block;font-size:10px;color:var(--mut);font-weight:600;}
    .rolechip{font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:980px;text-transform:uppercase;font-family:'Barlow',sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,.35);}
    .rolechip.helm{color:#fff;background:var(--navy2);}.rolechip.crew{color:var(--navy2);background:var(--sky);}
    .miniraces{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;}
    .rc{width:24px;height:24px;border-radius:8px;background:rgba(118,118,128,.1);color:#2c3e50;font-size:10px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums;}
    .rc.c{background:#fbe3e0;color:#c0392b;}
    .rc.d{background:#f0f2f5;color:#8a99aa;}
    .rc.g1{background:#fbe7a6;color:#7a5600;border:1.5px solid #c79a16;}
    .rc.g2{background:#bfe0fb;color:#0d5a96;border:1.5px solid #2a86d6;}
    .rc.g3{background:#fbcaca;color:#9a2222;border:1.5px solid #d65050;}
    /* Home */
    .home-hero{background:none;color:var(--ink);padding:8px 0 0;}
    .home-hero h1{font-family:'Barlow',sans-serif;color:var(--ink);font-size:36px;font-weight:800;margin:0 0 6px;}
    .home-hero p{color:var(--mut);font-size:15px;margin:0 0 20px;}
    /* Search-first hero — one large glass search spanning athletes + competitions + clubs.
       z-index sits above the click-away overlay (55) so the field stays interactive. */
    .hero-srch{position:relative;z-index:56;display:flex;align-items:center;gap:10px;max-width:640px;margin:20px 0 8px;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:980px;padding:14px 20px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.4),0 8px 26px -14px rgba(0,0,0,.25);transition:box-shadow .16s,background .16s;}
    .hero-srch:focus-within{background:rgba(255,255,255,.74);box-shadow:inset 0 1px 0 rgba(255,255,255,.75),0 0 0 4px var(--halo),0 8px 26px -14px rgba(0,0,0,.25);}
    .hero-srch input{flex:1;min-width:0;border:0;background:none;outline:0;font:inherit;font-size:16px;color:var(--ink);}
    .hero-srch input::placeholder{color:var(--mut);}
    .hero-drop{position:absolute;top:calc(100% + 8px);left:0;right:0;background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:16px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:6px;max-height:380px;overflow:auto;z-index:5;}
    /* Breadth strip — quiet chips + cards under the hero */
    .strip-chips{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 30px;}
    .strip-chip{display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:13.5px;font-weight:700;color:var(--navy);border:0;background:var(--mat-reg);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border-radius:980px;padding:9px 16px;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 1px 0 rgba(255,255,255,.7),0 1px 2px rgba(0,0,0,.08);transition:.16s;}
    .strip-chip:hover{transform:translateY(-2px);background:rgba(255,255,255,.85);}
    .strip-chip .dot{width:9px;height:9px;border-radius:50%;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.35);}
    .strip-chip .cnt{font-weight:600;font-size:12px;color:var(--mut);}
    /* Lens chips — the progressive class filter on results pages */
    .lens-chip{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:12.5px;font-weight:700;color:var(--mut);border:0;background:rgba(255,255,255,.45);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);border-radius:980px;padding:7px 13px;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.55),inset 0 1px 0 rgba(255,255,255,.6);transition:.15s;}
    .lens-chip:hover{color:var(--navy);background:rgba(255,255,255,.7);}
    .lens-chip.on{background:rgba(255,255,255,.92);color:var(--navy);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 8px -2px rgba(0,0,0,.16);}
    .lens-chip .dot{width:8px;height:8px;border-radius:50%;flex:none;}
    .lens-chip .cnt{font-weight:600;font-size:11.5px;color:var(--mut);}
    /* Nav mega-menus — hover panels under the 4 doors */
    .np-item{position:relative;}
    .np-drop{position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%) translateY(-6px);min-width:232px;background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:16px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:12px;opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;z-index:70;}
    .np-drop::before{content:"";position:absolute;top:-12px;left:0;right:0;height:12px;}
    .np-item:hover .np-drop,.np-item:focus-within .np-drop{opacity:1;pointer-events:auto;transform:translateX(-50%);}
    .nd-label{margin:2px 4px 8px;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);}
    .nd-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 2px 10px;}
    .nd-chip{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12.5px;font-weight:700;color:var(--navy);border:0;background:rgba(255,255,255,.6);border-radius:980px;padding:6px 12px;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),0 1px 2px rgba(0,0,0,.06);transition:.14s;}
    .nd-chip:hover{background:#fff;transform:translateY(-1px);}
    .nd-chip .dot{width:8px;height:8px;border-radius:50%;flex:none;}
    .nd-row{display:flex;align-items:center;gap:8px;width:100%;font:inherit;font-size:13px;font-weight:600;color:var(--ink);border:0;background:none;border-radius:10px;padding:8px 10px;cursor:pointer;text-align:left;transition:background .12s;white-space:nowrap;}
    .nd-row:hover{background:rgba(255,255,255,.78);}
    .nd-cnt{margin-left:auto;font-size:11.5px;font-weight:600;color:var(--mut);padding-left:10px;}
    .nd-subwrap{position:relative;}
    .nd-sub{position:absolute;left:calc(100% + 6px);top:-8px;min-width:256px;max-height:330px;overflow:auto;background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:14px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:8px;opacity:0;pointer-events:none;transition:opacity .16s ease;z-index:71;}
    .nd-sub::before{content:"";position:absolute;left:-8px;top:0;bottom:0;width:8px;}
    .nd-subwrap:hover .nd-sub{opacity:1;pointer-events:auto;}
    /* Glass select — the country/host dropdowns on list pages */
    .lens-selwrap{position:relative;display:inline-flex;align-items:center;}
    .lens-select{font:inherit;font-size:12.5px;font-weight:700;color:var(--navy);border:0;background:rgba(255,255,255,.6);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);border-radius:980px;padding:7px 30px 7px 14px;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 1px 0 rgba(255,255,255,.7),0 1px 2px rgba(0,0,0,.08);-webkit-appearance:none;appearance:none;outline:none;max-width:230px;text-overflow:ellipsis;}
    .lens-select:hover{background:rgba(255,255,255,.85);}
    .lens-selchev{position:absolute;right:11px;pointer-events:none;color:var(--mut);transform:rotate(90deg);}
    .strip-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px;margin-bottom:32px;}
    .strip-card{background:var(--mat-reg);backdrop-filter:blur(30px) saturate(195%);-webkit-backdrop-filter:blur(30px) saturate(195%);border-radius:16px;padding:16px;cursor:pointer;transition:.18s;box-shadow:inset 0 1px 0 rgba(255,255,255,.65),inset 0 0 0 .5px rgba(255,255,255,.35),0 1px 2px rgba(0,0,0,.05);animation:rise .5s both;}
    .strip-card:hover{transform:translateY(-4px) scale(1.012);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.9),0 20px 40px -18px rgba(0,0,0,.28);}
    .strip-card .sc-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;}
    .strip-card .sc-date{font-size:12px;font-weight:600;color:var(--mut);}
    .strip-card .sc-name{margin:0;font-size:15px;font-weight:700;color:var(--ink);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .strip-card .sc-sub{margin:6px 0 0;font-size:12.5px;color:var(--mut);}
    .home-search{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:9px 14px;max-width:380px;margin-bottom:20px;}
    .home-search input{border:0;outline:0;font:inherit;font-size:14px;background:none;color:#fff;width:100%;}
    .home-search input::placeholder{color:#9fbdd9;}
    .home-tabs{display:flex;gap:0;}    .home-tabs button{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;border:0;background:none;color:#9fbdd9;padding:12px 20px;border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer;transition:.15s;}
    .home-tabs button.on{color:#fff;border-bottom-color:#fff;}
    .home-tabs button:hover:not(.on){color:#d0e4f4;}
    .pagetabs{background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-bottom:1px solid var(--line);box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}
    .pagetabs .wrap{display:flex;gap:0;flex-wrap:wrap;}
    .pagetabs button{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;border:0;background:none;color:var(--mut);padding:13px 18px;border-bottom:2.5px solid transparent;margin-bottom:-1px;cursor:pointer;transition:.15s;}
    .pagetabs button.on{color:var(--navy);border-bottom-color:var(--accent);}
    .pagetabs button:hover:not(.on){color:var(--navy);}
    /* ── Floating top bar ── */
    .topbar2{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 20px;pointer-events:none;transition:transform .42s cubic-bezier(.2,.85,.2,1),opacity .42s;}
    .topbar2.hidden{transform:translateY(-135%);opacity:0;}
    .topbar2>*{pointer-events:auto;}
    .tb-brand{display:inline-flex;align-items:center;gap:0;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:980px;padding:6px 8px 6px 6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 24px -12px rgba(0,0,0,.28);flex:none;}
    .tb-logo{width:32px;height:32px;border-radius:980px;overflow:hidden;display:grid;place-items:center;flex:none;cursor:pointer;transition:.15s;}
    .tb-logo img{width:100%;height:100%;display:block;border-radius:inherit;}
    .tb-logo:hover{transform:scale(1.06);box-shadow:0 4px 12px -3px rgba(22,58,99,.5);}
    .tb-divider{width:1px;height:18px;background:rgba(0,0,0,.12);flex:none;margin:0 4px 0 10px;}
    .tb-sport{font-family:'Barlow',sans-serif;font-weight:800;font-size:16px;color:var(--navy);letter-spacing:-.01em;cursor:pointer;padding:5px 11px 5px 6px;border-radius:980px;transition:.15s;}
    .tb-sport:hover{background:rgba(19,49,78,.10);}
    .tb-center{flex:1;display:flex;justify-content:center;min-width:0;pointer-events:none;}
    /* Fixed 25px radius (≈ half the closed bar height, so it reads as a capsule when
       closed). Height-independent: as the panel elongates only the body grows — the
       top half keeps its exact shape, no radius reflow, no stretch-and-snap. */
    .menupill{pointer-events:auto;position:relative;width:100%;max-width:440px;min-width:0;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:25px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 26px -12px rgba(0,0,0,.3);transition:background .34s ease;}
    .menupill.navmode{width:auto;}
    .menupill.searching{background:rgba(255,255,255,.70);}
    /* 3-item primary nav — seg-control idiom inside the glass capsule */
    .np-bar{display:flex;align-items:center;gap:2px;padding:5px;}
    .np-link{font:inherit;font-size:14px;font-weight:700;border:0;background:none;color:var(--mut);padding:9px 18px;border-radius:980px;cursor:pointer;transition:.16s cubic-bezier(.2,.85,.2,1);white-space:nowrap;letter-spacing:-.01em;}
    .np-link:hover{color:var(--navy);}
    .np-link.on{background:rgba(255,255,255,.92);color:var(--navy);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 8px -2px rgba(0,0,0,.16);}
    .np-srchbtn{flex:none;width:36px;height:36px;margin-left:2px;border-radius:980px;border:0;background:var(--mat-reg);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);color:var(--navy);display:grid;place-items:center;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.58),inset 0 1px 0 rgba(255,255,255,.68),0 1px 2px rgba(0,0,0,.07);transition:.15s;}
    .np-srchbtn:hover{background:rgba(255,255,255,.85);}
    .mp-bar{display:flex;align-items:center;gap:8px;padding:6px 7px;}
    .mp-search{flex:1;min-width:0;display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.45);border-radius:980px;padding:8px 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.55);}
    .mp-star{color:var(--accent);flex:none;}
    .mp-search input{flex:1;min-width:0;border:0;background:none;outline:0;font:inherit;font-size:13.5px;color:var(--ink);}
    .mp-search input::placeholder{color:var(--mut);}
    .mp-clear{flex:none;border:0;background:none;cursor:pointer;color:var(--mut);display:flex;padding:0;}
    .mp-drop{position:absolute;top:calc(100% + 8px);left:0;right:0;background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:16px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:6px;max-height:340px;overflow:auto;z-index:5;}
    .tb-right{flex:none;}
    /* Dev tools strip — replaces the retired hamburger's dev links */
    .devstrip{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:59;display:flex;gap:6px;}
    .devstrip button{display:inline-flex;align-items:center;gap:5px;background:rgba(124,58,237,.16);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);color:#7c3aed;border:0;border-radius:980px;font-weight:700;font-size:11px;padding:5px 11px;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.4);}
    .devstrip button:hover{background:rgba(124,58,237,.26);}
    /* Breadcrumb — quiet "you are here" text above entity pages */
    .crumbs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;font-weight:600;color:var(--mut);padding:14px 2px 0;}
    .crumbs .c-link{font:inherit;font-weight:600;border:0;background:none;padding:0;color:var(--mut);cursor:pointer;transition:color .15s;}
    .crumbs .c-link:hover{color:var(--accent);}
    .crumbs .c-sep{opacity:.55;flex:none;}
    .crumbs .c-cur{color:var(--navy);font-weight:700;}
    .crumbs .c-root{color:var(--mut);}
    .tb-profile{width:44px;height:44px;border-radius:980px;border:0;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);color:var(--navy);display:grid;place-items:center;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 1px 0 rgba(255,255,255,.72),0 8px 24px -12px rgba(0,0,0,.28);transition:.18s;}
    .tb-profile:hover{background:rgba(255,255,255,.74);transform:translateY(-1px);}
    .tb-acct{position:absolute;right:0;top:calc(100% + 8px);background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:14px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:8px;min-width:200px;z-index:80;}
    @media(max-width:640px){.np-link{font-size:12.5px;padding:8px 10px;}.np-srchbtn{width:32px;height:32px;}}
    @media(max-width:560px){.tb-sport{display:none;}.menupill{max-width:none;}.tb-divider{display:none;}}
    .classes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}
    .class-card{background:var(--mat-reg);backdrop-filter:blur(36px) saturate(195%);-webkit-backdrop-filter:blur(36px) saturate(195%);border:0;border-radius:16px;padding:24px;cursor:pointer;transition:.18s;animation:rise .5s both;box-shadow:inset 0 1px 0 rgba(255,255,255,.65),inset 0 0 0 .5px rgba(255,255,255,.35),0 1px 2px rgba(0,0,0,.05);}
    .class-card:hover{transform:translateY(-5px) scale(1.012);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.9),inset 0 0 0 .5px rgba(255,255,255,.55),0 24px 48px -20px rgba(0,0,0,.34);}
    .class-tag{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);background:rgba(10,132,255,.12);padding:4px 11px;border-radius:7px;display:inline-block;margin-bottom:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}
    .class-name{font-family:'Barlow',sans-serif;font-weight:700;font-size:19px;margin:0 0 14px;line-height:1.25;color:var(--ink);}
    .class-stats{display:flex;gap:20px;font-size:12px;color:var(--mut);margin-bottom:18px;}
    .class-stats b{display:block;font-family:'Barlow',sans-serif;font-size:20px;color:var(--ink);font-weight:700;}
    /* Draft banner */
    .draft-banner{background:rgba(255,149,0,.12);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;border-radius:16px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 0 .5px rgba(232,146,26,.3);}
    .draft-banner p{margin:0;font-size:14px;color:#7a4a0a;flex:1;}
    .draft-banner strong{display:block;font-family:'Barlow',sans-serif;font-size:15px;margin-bottom:2px;}
    /* Fleet picker */
    .fleet-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin:16px 0;}
    .fleet-card{background:var(--mat-reg);backdrop-filter:blur(30px) saturate(195%);-webkit-backdrop-filter:blur(30px) saturate(195%);border:0;border-radius:16px;padding:16px;cursor:pointer;transition:.16s;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 .5px rgba(255,255,255,.3),0 1px 2px rgba(0,0,0,.05);}
    .fleet-card:hover{transform:translateY(-2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.75),0 0 0 1.5px var(--halo),0 10px 26px -14px rgba(0,0,0,.22);}
    .fleet-card .fname{font-family:'Barlow',sans-serif;font-weight:700;font-size:16px;color:var(--navy);margin-bottom:4px;}
    .fleet-card .fcount{font-size:13px;color:var(--mut);}
    /* Preview modal */
    .preview-meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;}
    .preview-meta.wide{grid-template-columns:2fr 1fr 1fr 1fr;}
    .preview-meta label{font-size:11px;color:var(--mut);display:block;margin-bottom:3px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;}
    .preview-meta input{width:100%;border:0;border-radius:12px;padding:8px 11px;font:inherit;font-size:13px;background:var(--grouped);outline:none;transition:box-shadow .15s;}
    .preview-meta input:focus{box-shadow:0 0 0 4px var(--halo);}
    .preview-meta input.pmissing{box-shadow:0 0 0 1.5px #e8921a;background:rgba(255,149,0,.08);}
    .pmissing-hint{font-size:11px;color:#e8921a;margin-bottom:10px;display:flex;align-items:center;gap:5px;}
    .preview-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px;max-height:52vh;}
    .pe-input{width:100%;border:0;border-bottom:1.5px solid var(--accent);background:#fffbec;font:inherit;font-size:12px;text-align:center;padding:3px 2px;outline:none;}
    /* Modal */
    .notice{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:60;background:var(--mat-dark);backdrop-filter:blur(44px) saturate(195%);-webkit-backdrop-filter:blur(44px) saturate(195%);color:#fff;border-radius:980px;padding:14px 22px;display:flex;gap:13px;align-items:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 20px 50px -18px rgba(0,0,0,.6);animation:rise .4s both;max-width:92%;}
    .notice b{font-family:'Barlow',sans-serif;}
    .notice .ico{background:var(--accent);color:#fff;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex:none;}
    .back{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13.5px;color:var(--navy2);background:var(--mat-reg);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);border:0;cursor:pointer;margin-bottom:10px;padding:7px 14px;border-radius:980px;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 1px 0 rgba(255,255,255,.7),0 1px 2px rgba(0,0,0,.08);transition:.15s;}
    .back:hover{background:rgba(255,255,255,.85);}
    .back:hover{color:var(--accent);}
    /* portal-pill shares the exact .btn.ghost glass material (same blur, shine
       and hairline edge) so nav pills and buttons read as one family. */
    .portal-pill{display:inline-flex;align-items:center;gap:7px;justify-content:flex-start;min-width:140px;background:var(--mat-reg);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;border-radius:980px;padding:9px 18px;font-size:13.5px;font-weight:700;color:var(--navy);cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.62),inset 0 1px 0 rgba(255,255,255,.72),0 4px 14px -6px rgba(0,0,0,.14);transition:.22s cubic-bezier(.2,.85,.2,1);}
    .portal-pill:hover{background:rgba(255,255,255,.85);transform:translateY(-2px) scale(1.05);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.7),inset 0 1.5px 0 rgba(255,255,255,.9),0 12px 28px -10px rgba(0,0,0,.22);}
    .foot{font-size:12px;color:var(--mut);text-align:center;padding:30px 0;}
    .ov{position:fixed;inset:0;background:rgba(0,0,0,.3);backdrop-filter:blur(4px) saturate(140%);-webkit-backdrop-filter:blur(4px) saturate(140%);z-index:70;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;animation:fade .2s both;}
    .modal{background:rgba(252,253,255,0.88);backdrop-filter:blur(56px) saturate(210%);-webkit-backdrop-filter:blur(56px) saturate(210%);width:100%;max-width:900px;border-radius:22px;overflow:hidden;box-shadow:inset 0 1.5px 0 rgba(255,255,255,.8),inset 0 0 0 .5px rgba(255,255,255,.5),0 40px 90px -28px rgba(0,0,0,.45),0 0 0 .5px rgba(60,60,67,.08);animation:rise .3s both;}
    .modal.wide{max-width:1140px;}
    .mhead{background:linear-gradient(135deg,rgba(31,78,128,.78),rgba(19,49,78,.84));backdrop-filter:blur(44px) saturate(195%);-webkit-backdrop-filter:blur(44px) saturate(195%);color:#fff;padding:18px 22px;display:flex;align-items:center;gap:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);border-radius:22px 22px 0 0;}
    .mhead h3{font-family:'Barlow',sans-serif;font-weight:700;font-size:19px;margin:0;flex:1;}
    .x{background:rgba(255,255,255,.16);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);border:0;color:#fff;width:32px;height:32px;border-radius:980px;cursor:pointer;display:grid;place-items:center;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.3),inset 0 1px 0 rgba(255,255,255,.25);transition:.15s;flex:none;padding:0;}
    .x:hover{background:rgba(255,255,255,.26);}
    .mhead .x{background:rgba(255,255,255,.14);border:0;color:#fff;width:34px;height:34px;border-radius:980px;cursor:pointer;display:grid;place-items:center;transition:.15s;}
    .mhead .x:hover{background:rgba(255,255,255,.26);transform:scale(1.05);}
    .mtabs{display:flex;gap:6px;padding:14px 22px 0;}
    .mtabs button{font-family:'Barlow',sans-serif;font-weight:600;font-size:14px;border:0;background:none;color:var(--mut);padding:9px 14px;border-radius:9px 9px 0 0;cursor:pointer;display:flex;align-items:center;gap:7px;}
    .mtabs button.on{color:var(--navy);background:#fff;border:1px solid var(--line);border-bottom:0;}
    .mbody{padding:22px 28px 28px;max-height:88vh;overflow-y:auto;}
    .prev.ok{background:#d8f0e3;color:#0a6b41;border-radius:10px;padding:12px 14px;font-size:13px;margin-top:12px;}
    .prev.err{background:#fbe7e4;color:#a8362a;border-radius:10px;padding:12px 14px;font-size:13px;margin-top:12px;}
    .mfoot{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;}
    /* Floating save/publish bar — pinned to the bottom of the modal's scroll
       container (.mbody) so it stays visible while the preview scrolls. Liquid-glass
       material consistent with .draft-banner. */
    .import-actionbar{position:sticky;bottom:0;left:0;right:0;z-index:40;display:flex;gap:10px;justify-content:flex-end;align-items:center;
      margin:16px -28px -28px;padding:14px 28px;border-top:1px solid var(--line);
      background:rgba(252,253,255,0.72);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}
    /* Reclaim space beneath the sticky bar so the last table rows aren't hidden. */
    .mbody.has-actionbar{padding-bottom:0;}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}
    .meta-grid.three{grid-template-columns:1fr 1fr 1fr;}
    .meta-grid label{font-size:12px;color:var(--mut);display:block;margin-bottom:3px;font-weight:600;}
    .meta-grid input{width:100%;border:0;border-radius:12px;padding:9px 12px;font:inherit;font-size:13px;color:var(--ink);background:var(--grouped);outline:none;transition:box-shadow .15s;}
    .meta-grid input:focus{box-shadow:0 0 0 4px var(--halo);}
    .race-ctrl{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
    .race-ctrl span{font-size:13px;color:var(--mut);font-weight:600;}
    .stepper{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:var(--ink);}
    .stepper button{width:30px;height:30px;border:0;border-radius:980px;background:var(--grouped);cursor:pointer;display:grid;place-items:center;color:var(--accent);transition:.15s;}
    .stepper button:hover{background:rgba(10,132,255,.16);transform:scale(1.06);}
    .rtable-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;}
    .rtable{width:100%;border-collapse:collapse;font-size:12.5px;}
    .rtable thead th{background:linear-gradient(180deg,rgba(31,78,128,.92),rgba(19,49,78,.94));color:#fff;font-family:'Barlow',sans-serif;font-weight:600;padding:8px 4px;text-align:center;font-size:11px;white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.12);}
    .rtable thead th.l{text-align:left;padding-left:8px;}
    .rtable thead th.calc{background:linear-gradient(180deg,rgba(46,120,200,.9),rgba(31,78,128,.92));}
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
    .cal-modal{background:rgba(252,253,255,0.88);backdrop-filter:blur(56px) saturate(210%);-webkit-backdrop-filter:blur(56px) saturate(210%);width:100%;max-width:1020px;border-radius:22px;overflow:hidden;box-shadow:inset 0 1.5px 0 rgba(255,255,255,.8),inset 0 0 0 .5px rgba(255,255,255,.5),0 40px 90px -28px rgba(0,0,0,.45),0 0 0 .5px rgba(60,60,67,.08);animation:rise .3s both;max-height:92vh;display:flex;flex-direction:column;}
    .cal-head{background:linear-gradient(135deg,rgba(31,78,128,.78),rgba(19,49,78,.84));backdrop-filter:blur(44px) saturate(195%);-webkit-backdrop-filter:blur(44px) saturate(195%);color:#fff;padding:14px 20px;display:flex;align-items:flex-start;gap:10px;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);}
    .cal-head h3{font-family:'Barlow',sans-serif;font-weight:800;font-size:22px;margin:0;}
    .cal-head .x{background:rgba(255,255,255,.12);border:0;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;display:grid;place-items:center;opacity:.85;transition:.12s;flex:none;}
    .cal-head .x:hover{opacity:1;background:rgba(255,255,255,.22);}
    .cal-back{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.16);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);border:0;color:#dbe9f8;font-weight:600;font-size:13px;cursor:pointer;padding:7px 13px;border-radius:980px;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.28),inset 0 1px 0 rgba(255,255,255,.22);transition:.15s;}
    .cal-back:hover{color:#fff;}
    .cal-body{padding:0;overflow-y:auto;flex:1;display:flex;flex-direction:column;}
    .cal-toolbar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.4);flex:none;flex-wrap:wrap;background:rgba(255,255,255,.28);}
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
    .cal-cell-ev{background:var(--accent);color:#fff;border-radius:8px;padding:2px 6px;font-size:10px;font-weight:700;cursor:pointer;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:.12s;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);}
    .cal-cell-ev:hover{filter:brightness(1.08);transform:translateY(-1px);}
    .cal-cell-ev.cls-29er{background:#E84855;}
    .cal-cell-ev.cls-ilca{background:#2E78C8;}
    .cal-cell-ev.cls-49er{background:#5FAF4E;}
    .cal-cell-ev.cls-optimist{background:#3D3D3D;}
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
    .ai-srch{display:flex;align-items:center;gap:8px;background:var(--mat-reg);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border:0;border-radius:12px;overflow:hidden;padding-left:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 .5px rgba(255,255,255,.35);transition:.2s;}
    .ai-srch:focus-within{box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 0 0 4px var(--halo);}
    .ai-srch input{flex:1;border:0;outline:0;font:inherit;font-size:13px;padding:9px 10px 9px 0;background:none;color:var(--ink);}
    .ai-srch input::placeholder{color:#9fb2c8;}
    .filter-chip{display:inline-flex;align-items:center;gap:6px;background:#eef4fb;border:1px solid #b9cee4;border-radius:20px;padding:4px 10px 4px 12px;font-size:12px;font-weight:600;color:var(--navy);}
    .filter-chip button{border:0;background:none;cursor:pointer;color:var(--mut);padding:0;display:flex;align-items:center;line-height:1;}
    .filter-chip button:hover{color:#c0392b;}
    /* ── Apple WWDC25 liquid-glass effect (lucasromerodb/liquid-glass-effect-macos), adapted for dark navy ── */
    .liquidGlass-wrapper{position:relative;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;border:none;box-shadow:0 6px 6px rgba(0,0,0,0.25),0 0 20px rgba(0,0,0,0.12);transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s,filter .18s;}
    .liquidGlass-effect{position:absolute;z-index:0;inset:0;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);filter:url(#glass-distortion);overflow:hidden;isolation:isolate;border-radius:inherit;}
    .liquidGlass-tint{z-index:1;position:absolute;inset:0;background:rgba(255,255,255,0.10);border-radius:inherit;}
    .liquidGlass-shine{position:absolute;inset:0;z-index:2;overflow:hidden;border-radius:inherit;box-shadow:inset 2px 2px 1px 0 rgba(255,255,255,0.45),inset -1px -1px 1px 1px rgba(255,255,255,0.3);}
    .liquidGlass-text{position:relative;z-index:3;color:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;}
    .liquidGlass-wrapper:hover{transform:scale(1.02) translateY(-1px);}
    .liquidGlass-wrapper:active{transform:scale(0.98);}
    .liquidGlass-wrapper:disabled{opacity:0.45;cursor:not-allowed;transform:none;}
  `}</style>

  {/* ── FLOATING TOP BAR (no frame; glass pills that hide on scroll-down) ── */}
  <div className={`topbar2${barHidden?" hidden":""}`}>
    {/* left: two targets on one pill — logo → AthLink landing (shell); "Sailing" → sailing home. */}
    <div className="tb-brand">
      <span className="tb-logo" title="Back to AthLink — all sports"
        onClick={()=>{window.history.pushState(null,"","/");window.dispatchEvent(new Event("locationchange"));}}><img src="/brand/icon-app-circle.png" alt="AthLink"/></span>
      <span className="tb-divider"/>
      <span className="tb-sport" title="Sailing home" onClick={goHome}>Sailing</span>
    </div>
    {/* center: 3-item primary nav — Athletes · Competitions · Rankings — with an
        expanding search in the utility slot. No hamburger on desktop by design. */}
    <div className="tb-center">
      <div className={`menupill${navSearchOpen?" searching":" navmode"}`} onClick={e=>e.stopPropagation()}>
        {navSearchOpen
          ? <div className="mp-bar">
              <div className="mp-search">
                <Sparkles size={14} className="mp-star"/>
                <input autoFocus placeholder="Search athletes, competitions & clubs…" value={gSearch}
                  onChange={e=>{setGSearch(e.target.value);setGSearchOpen(true);runGlobalSearch(e.target.value);}}
                  onFocus={()=>setGSearchOpen(true)}
                  onBlur={()=>setTimeout(()=>setGSearchOpen(false),150)}
                  onKeyDown={e=>{if(e.key==="Escape"){setGSearch("");setGSearchOpen(false);setNavSearchOpen(false);}if(e.key==="Enter"&&gSearchResults.length){execGSearch(gSearchResults[0]);}}}/>
                <button className="mp-clear" title="Close search" onClick={()=>{setGSearch("");setGSearchOpen(false);setGSearchResults([]);setNavSearchOpen(false);}}><X size={13}/></button>
              </div>
            </div>
          : <div className="np-bar">
              {/* Athletes — by class / by country / by host */}
              <div className="np-item">
                <button className={`np-link${navOn==="athletes"?" on":""}`} onClick={()=>goTop("athletes")}>Athletes</button>
                <div className="np-drop">
                  <p className="nd-label">By class</p>
                  <div className="nd-chips">
                    {CLASSES.map(c=>(
                      <button key={c.id} className="nd-chip" onClick={()=>goTop("athletes",{cls:c.id})}>
                        <span className="dot" style={{background:classColor(c.id)}}/>{c.short}
                      </button>
                    ))}
                  </div>
                  <button className="nd-row" onClick={()=>goTop("athletes")}><Globe size={14} style={{flex:"none",color:"var(--navy2)"}}/>By country</button>
                  <div className="nd-subwrap">
                    <button className="nd-row" onClick={()=>goTop("hosts")}><Waves size={14} style={{flex:"none",color:"var(--navy2)"}}/>By host<ChevronRight size={13} style={{marginLeft:"auto",opacity:.6}}/></button>
                    <div className="nd-sub">
                      {navHosts.map(h=>(
                        <button key={h.id} className="nd-row" onClick={()=>enterPortalAthletes(h.id)}>{h.name}<span className="nd-cnt">{h.n}</span></button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Competitions — by class / by country / by host */}
              <div className="np-item">
                <button className={`np-link${navOn==="competitions"?" on":""}`} onClick={()=>goTop("competitions")}>Competitions</button>
                <div className="np-drop">
                  <p className="nd-label">By class</p>
                  <div className="nd-chips">
                    {CLASSES.map(c=>(
                      <button key={c.id} className="nd-chip" onClick={()=>goTop("competitions",{cls:c.id})}>
                        <span className="dot" style={{background:classColor(c.id)}}/>{c.short}
                      </button>
                    ))}
                  </div>
                  <button className="nd-row" onClick={()=>goTop("competitions")}><Globe size={14} style={{flex:"none",color:"var(--navy2)"}}/>By country</button>
                  <div className="nd-subwrap">
                    <button className="nd-row" onClick={()=>goTop("hosts")}><Waves size={14} style={{flex:"none",color:"var(--navy2)"}}/>By host<ChevronRight size={13} style={{marginLeft:"auto",opacity:.6}}/></button>
                    <div className="nd-sub">
                      {navHosts.map(h=>(
                        <button key={h.id} className="nd-row" onClick={()=>enterPortal(h.id)}>{h.name}<span className="nd-cnt">{h.n}</span></button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Hosts — by type / by country */}
              <div className="np-item">
                <button className={`np-link${navOn==="hosts"?" on":""}`} onClick={()=>goTop("hosts")}>Hosts</button>
                <div className="np-drop">
                  <p className="nd-label">By type</p>
                  {[["federation","Federations"],["club","Clubs"],["association","Associations"]].map(([t,label])=>(
                    <button key={t} className="nd-row" onClick={()=>goTop("hosts",{type:t})}>{label}<span className="nd-cnt">{navHosts.filter(h=>h.htype===t).length}</span></button>
                  ))}
                  <div className="nd-subwrap">
                    <button className="nd-row" onClick={()=>goTop("hosts")}><Globe size={14} style={{flex:"none",color:"var(--navy2)"}}/>By country<ChevronRight size={13} style={{marginLeft:"auto",opacity:.6}}/></button>
                    <div className="nd-sub">
                      {hostCountries.map(cc=>(
                        <button key={cc} className="nd-row" onClick={()=>goTop("hosts",{country:cc})}>
                          <span style={{fontSize:15,flex:"none"}}>{iocFlag(cc)}</span>{GLOBE_NAMES[IOC_ISO[cc]]||cc}
                          <span className="nd-cnt">{navHosts.filter(h=>h.loc===cc).length}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Rankings — by class / by country */}
              <div className="np-item">
                <button className={`np-link${navOn==="ranking"?" on":""}`} onClick={()=>goTop("ranking")}>Rankings</button>
                <div className="np-drop">
                  <p className="nd-label">By class</p>
                  <div className="nd-chips">
                    {CLASSES.map(c=>(
                      <button key={c.id} className="nd-chip" onClick={()=>goRankingClass(c.id)}>
                        <span className="dot" style={{background:classColor(c.id)}}/>{c.short}
                      </button>
                    ))}
                  </div>
                  <button className="nd-row" onClick={()=>goTop("ranking")}><Globe size={14} style={{flex:"none",color:"var(--navy2)"}}/>By country</button>
                </div>
              </div>
              <button className="np-srchbtn" title="Search" onClick={()=>setNavSearchOpen(true)}><Search size={16}/></button>
            </div>}
        {navSearchOpen&&gSearchOpen&&gSearchResults.length>0&&(
          <div className="mp-drop">
            {gSearchResults.map((r,i)=>(
              <div key={i} className="gsrch-item" onMouseDown={()=>execGSearch(r)}>
                <div className="gi-icon" style={{background:r.type==="athlete"?"#e8f4ff":r.type==="event"?"#f0f4ff":r.type==="portal"?"var(--sky)":"#f0f8f0"}}>
                  {r.type==="athlete"?<Users size={14} color="#1a5e8a"/>:r.type==="event"?<Anchor size={14} color="#1a3e8a"/>:r.type==="portal"?<Waves size={14} color="var(--navy)"/>:<ChevronRight size={14} color="#0a6b41"/>}
                </div>
                <div><div className="gi-label">{r.label}</div><div className="gi-sub">{r.sub}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    {/* right: profile → sign in / sign up */}
    <div className="tb-right">
      {auth
        ? <div style={{position:"relative"}}>
            <button className="tb-profile" onClick={()=>setAccountOpen(o=>!o)} title={role} style={{position:"relative"}}>
              <span style={{fontSize:14,fontWeight:800}}>{(auth.profile?.display_name||auth.user?.email||"?").slice(0,1).toUpperCase()}</span>
              {hasPendingHostMembership&&<span style={{position:"absolute",top:-2,right:-2,width:12,height:12,borderRadius:"50%",background:"#f5a623",border:"2px solid #fff"}} title="Host approval pending"/>}
              {showClaimNudge&&!hasPendingHostMembership&&<span style={{position:"absolute",top:-2,right:-2,width:12,height:12,borderRadius:"50%",background:"var(--accent)",border:"2px solid #fff"}} title="Claim your athlete profile"/>}
            </button>
            {accountOpen&&(<div className="tb-acct">
              {(()=>{
                const fullName=`${auth.profile?.first_name||""} ${auth.profile?.last_name||""}`.trim()||auth.profile?.display_name||null;
                // Host portals this user belongs to (verified) — shown as their identity instead of a generic role.
                const myHostNames=myMemberships.filter(m=>m.verified).map(m=>hostById(m.host_id)?.name).filter(Boolean);
                const myHostId=myMemberships.filter(m=>m.verified).map(m=>m.host_id)[0]||null;
                const myAthleteName=auth.profile?.athlete_name||fullName;
                // Clicking the name jumps to the athlete's own profile, or their host portal.
                const goToMe=()=>{
                  setAccountOpen(false);
                  if(role==="athlete"&&myAthleteName){go({name:"profile",id:myAthleteName});}
                  else if(myHostId){enterPortal(myHostId);}
                  else if(myAthleteName){go({name:"profile",id:myAthleteName});}
                };
                const canGoToMe=(role==="athlete"&&!!myAthleteName)||!!myHostId;
                return(<>
                  {fullName&&(canGoToMe
                    ? <button onClick={goToMe} title="Go to my profile" style={{display:"block",width:"100%",textAlign:"left",border:0,background:"none",cursor:"pointer",padding:"6px 10px 1px",fontSize:13.5,fontWeight:700,color:"var(--accent)"}}>{fullName}</button>
                    : <div style={{padding:"6px 10px 1px",fontSize:13.5,fontWeight:700,color:"var(--navy)"}}>{fullName}</div>)}
                  <div style={{padding:fullName?"0 10px 6px":"6px 10px",fontSize:12,color:"var(--mut)"}}>{auth.user?.email}</div>
                  {devMode
                    ? <div style={{padding:"0 10px 8px",fontSize:12,color:"var(--mut)"}}>Role: <b style={{color:"var(--navy)"}}>Developer</b></div>
                    : myHostNames.length>0
                      ? <div style={{padding:"0 10px 8px",fontSize:12,color:"var(--mut)"}}>{myHostNames.length>1?"Hosts":"Host"}: <b style={{color:"var(--navy)"}}>{myHostNames.join(", ")}</b></div>
                      : role==="athlete"
                        ? <div style={{padding:"0 10px 8px",fontSize:12,color:"var(--mut)",textTransform:"capitalize"}}><b style={{color:"var(--navy)"}}>Athlete</b></div>
                        : null}
                </>);
              })()}
              {/* Username reminder — gentle nudge, only if they haven't set one */}
              {!auth.profile?.username&&!devMode&&(
                <div style={{margin:"2px 8px 6px",padding:"9px 11px",background:"rgba(10,132,255,.07)",border:"1px solid rgba(10,132,255,.18)",borderRadius:9,fontSize:11.5,color:"var(--navy)",lineHeight:1.45}}>
                  <div style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                    <User size={13} style={{flex:"none",marginTop:1,color:"var(--accent)"}}/>
                    <span>Add a username so people can find and tell you apart from others with the same name.</span>
                  </div>
                  <button onClick={()=>{setAccountOpen(false);setShowUsername(true);}} style={{marginTop:7,width:"100%",border:0,background:"var(--accent)",color:"#fff",borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Create username</button>
                </div>
              )}
              {auth.profile?.username&&<div style={{padding:"0 10px 8px",fontSize:12,color:"var(--mut)"}}>Username: <b style={{color:"var(--navy)"}}>@{auth.profile.username}</b></div>}
              {/* Claim-your-profile nudge — athletes who haven't claimed yet */}
              {showClaimNudge&&(
                <div style={{margin:"2px 8px 6px",padding:"9px 11px",background:"rgba(10,132,255,.07)",border:"1px solid rgba(10,132,255,.18)",borderRadius:9,fontSize:11.5,color:"var(--navy)",lineHeight:1.45}}>
                  <div style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                    <BadgeCheck size={13} style={{flex:"none",marginTop:1,color:"var(--accent)"}}/>
                    <span>Claim your athlete profile to verify your results and get a verified badge.</span>
                  </div>
                  <button onClick={()=>{setAccountOpen(false);setShowClaimModal(true);}} style={{marginTop:7,width:"100%",border:0,background:"var(--accent)",color:"#fff",borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Claim your profile</button>
                </div>
              )}
              {hasPendingHostMembership&&(
                <div style={{margin:"2px 8px 8px",padding:"8px 10px",background:"rgba(255,149,0,.1)",border:"1px solid rgba(255,149,0,.3)",borderRadius:8,fontSize:11.5,color:"#a85c00",lineHeight:1.45,display:"flex",gap:7,alignItems:"flex-start"}}>
                  <Clock size={13} style={{flex:"none",marginTop:1}}/>
                  <span>Your host setup is pending AthLink approval. You're browsing as a guest until verified.</span>
                </div>
              )}
              <button onClick={signOut} style={{width:"100%",textAlign:"left",border:0,background:"none",padding:"8px 10px",fontSize:13,cursor:"pointer",color:"var(--ink)",borderRadius:8}}>Sign out</button>
            </div>)}
          </div>
        : <button className="tb-profile" onClick={()=>setShowSignIn(true)} title="Sign in / sign up"><User size={18}/></button>}
    </div>
  </div>
  {/* Dev tools moved out of the retired hamburger — a small strip under the top bar. */}
  {devMode&&(
    <div className="devstrip">
      <button onClick={()=>setShowDevApprovals(true)}>Pending approvals</button>
      <button onClick={()=>setShowDevProfiles(true)}>All profiles</button>
      <button onClick={()=>setShowAddHost(true)}><Plus size={11}/>Add host</button>
      <button onClick={()=>setDevMode(false)}><Pencil size={11}/>Dev view ON — turn off</button>
    </div>
  )}
  <div style={{height:74}}/>
  {showSignIn&&<SignInModal onClose={()=>{setShowSignIn(false);setGoogleOnboarding(null);setPendingInviteToken(null);}} onAuthed={onAuthed} googleOnboarding={googleOnboarding}
    clubs={CLUBS} associations={ASSOCIATIONS} federations={FEDERATIONS}
    onCreateHost={createHostFromSignup} onClaimHost={claimHostFromSignup}
    pendingInviteToken={pendingInviteToken}/>}
  {showMembers&&host&&!isClassPortal&&(()=>{
    // Athlete names appearing in this host's events (for vouching scope)
    const hostEvents=events.filter(e=>eventAssocs(e).includes(portal));
    const hostAthleteNames=new Set();
    hostEvents.forEach(ev=>ev.entries.forEach(en=>{if(en.helm)hostAthleteNames.add(en.helm);if(en.crew)hostAthleteNames.add(en.crew);}));
    const pendingClaimsHere=allClaims.filter(c=>c.status==="pending"&&[...hostAthleteNames].some(n=>n.toLowerCase()===c.profile_name?.toLowerCase()));
    const pendingEventClaimsHere=allEventClaims.filter(c=>c.status==="pending"&&c.host_id===portal).map(c=>({...c,_eventName:(events.find(e=>e.id===c.event_id)||{}).name||"(event)"}));
    return(
    <HostMembersModal hostId={portal} hostName={host.name} auth={auth} myMembership={myPortalMembership}
      pendingClaims={pendingClaimsHere} pendingEventClaims={pendingEventClaimsHere} canVouch={devMode||(!!myPortalMembership&&myPortalMembership.verified)} canManage={canManageMembers}
      onDecideClaim={(claim,approve)=>resolveClaim(claim,approve,portal)}
      onDecideEventClaim={async(claim,approve)=>{
        await decideEventClaim(claim.id,approve,auth.user.id,portal,auth.token);
        if(approve){
          const patch={owner:portal,owner_confirmed:true,organizer_name:null};
          setEvents(p=>p.map(x=>x.id===claim.event_id?{...x,...patch}:x));
          try{await sbPatch("events",`id=eq.${claim.event_id}`,patch);}catch(e){console.error("event claim approve patch",e);}
        }
        await reloadEventClaims();
      }}
      onClose={()=>setShowMembers(false)} onChanged={reloadMemberships}/>
    );
  })()}
  {inviteRedeemed&&(
    <div className="notice"><div className="ico"><BadgeCheck size={18}/></div>
      <div><b>{inviteRedeemed.status==="joined"?"You're in!":inviteRedeemed.status==="used"?"Invite already used":inviteRedeemed.status==="expired"?"Invite expired":"Invalid invite"}</b>
      <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>
        {inviteRedeemed.status==="joined"?`You've joined as ${inviteRedeemed.role||"a host member"} — full access is active.`:
         inviteRedeemed.status==="used"?"That invite link has already been redeemed.":
         inviteRedeemed.status==="expired"?"That invite link is past its 7-day window.":
         "That invite link isn't valid."}
      </div></div>
      <button className="x" style={{marginLeft:8}} onClick={()=>setInviteRedeemed(null)}><X size={15}/></button>
    </div>
  )}
  {claimNote&&(
    <div className="notice"><div className="ico"><BadgeCheck size={18}/></div>
      <div><b>Claim submitted</b>
      <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>Your claim on <b>{claimNote.name}</b> is pending — a verified host admin will review it.</div></div>
      <button className="x" style={{marginLeft:8}} onClick={()=>setClaimNote(null)}><X size={15}/></button>
    </div>
  )}
  {classNote&&(
    <div className="notice"><div className="ico"><AlertCircle size={18}/></div>
      <div><b>Class not saved yet</b>
      <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>"<b>{classNote.name}</b>" couldn't be written to the database — it will be retried automatically next time you load AthLink signed in.</div></div>
      <button className="x" style={{marginLeft:8}} onClick={()=>setClassNote(null)}><X size={15}/></button>
    </div>
  )}
  {showClaimModal&&(()=>{
    const myName=auth?.profile?.athlete_name||`${auth?.profile?.first_name||""} ${auth?.profile?.last_name||""}`.trim()||auth?.profile?.display_name||"";
    const mine=auth?.user?.id?allClaims.find(c=>c.user_id===auth.user.id&&c.status!=="denied"):null;
    return <ClaimProfileModal
      myName={myName} people={allPeople} events={events}
      alreadyClaimed={mine?mine.profile_name:null}
      onClaim={async(name)=>{await submitClaim(name);setShowClaimModal(false);}}
      onSearchAll={()=>{setShowClaimModal(false);go({name:"athletes"});}}
      onClose={()=>setShowClaimModal(false)}/>;
  })()}
  {showAthEdit&&(()=>{
    const nm=showAthEdit;
    return <AthleteEditModal
      name={nm} profile={athleteProfileOf(nm)}
      onSaveExtras={saveAthleteExtras} onRename={renameOwnedAthlete} onSaveUsername={saveAthleteUsername}
      uploadPhoto={(file)=>uploadAthletePhoto(file,nm,auth?.token)}
      onClose={(finalName)=>{setShowAthEdit(null); if(typeof finalName==="string"&&finalName&&finalName!==nm) go({name:"profile",id:finalName});}}/>;
  })()}
  {showMedia&&(()=>{
    const nm=showMedia;
    return <MediaModal
      name={nm} media={athleteProfileOf(nm)?.media||[]} canEdit={isProfileOwner(nm)}
      uploadMedia={(file)=>uploadAthleteMedia(file,nm,auth?.token)} onSaveMedia={saveAthleteMedia}
      onClose={()=>setShowMedia(null)}/>;
  })()}
  {showDevApprovals&&devMode&&(
    <DevApprovalsModal auth={auth} hosts={[...ASSOCIATIONS,...CLUBS,...FEDERATIONS]}
      nameForHost={(id)=>hostById(id)?.name||id}
      eventCountFor={(id)=>events.filter(e=>eventAssocs(e).includes(id)).length}
      onApprove={devApproveMember} onDelete={devDeleteMember} onReassign={devReassignMember}
      onClose={()=>setShowDevApprovals(false)}/>
  )}
  {showDevProfiles&&devMode&&(
    <DevProfilesModal auth={auth} nameForHost={(id)=>hostById(id)?.name||id} hosts={[...ASSOCIATIONS,...CLUBS,...FEDERATIONS]} onClose={()=>setShowDevProfiles(false)}/>
  )}
  {showHostEdit&&portal&&!isClassPortal&&hostById(portal)&&(()=>{
    const hostEvents=events.filter(e=>eventAssocs(e).includes(portal));
    const hostAthleteNames=new Set();
    hostEvents.forEach(ev=>ev.entries.forEach(en=>{if(en.helm)hostAthleteNames.add(en.helm);if(en.crew)hostAthleteNames.add(en.crew);}));
    const pendingClaimsHere=allClaims.filter(c=>c.status==="pending"&&[...hostAthleteNames].some(n=>n.toLowerCase()===c.profile_name?.toLowerCase()));
    const pendingEventClaimsHere=allEventClaims.filter(c=>c.status==="pending"&&c.host_id===portal).map(c=>({...c,_eventName:(events.find(e=>e.id===c.event_id)||{}).name||"(event)"}));
    return(
    <HostEditModal host={hostById(portal)} canManage={canManageMembers}
      onSave={(patch)=>saveHost(portal,patch)} onSaveSlug={saveHostSlug}
      membersProps={{hostId:portal,hostName:hostById(portal).name,auth,myMembership:myPortalMembership,
        pendingClaims:pendingClaimsHere,pendingEventClaims:pendingEventClaimsHere,canVouch:devMode||(!!myPortalMembership&&myPortalMembership.verified),
        onDecideClaim:(claim,approve)=>resolveClaim(claim,approve,portal),
        onDecideEventClaim:async(claim,approve)=>{
          await decideEventClaim(claim.id,approve,auth.user.id,portal,auth.token);
          if(approve){const patch={owner:portal,owner_confirmed:true,organizer_name:null};setEvents(p=>p.map(x=>x.id===claim.event_id?{...x,...patch}:x));try{await sbPatch("events",`id=eq.${claim.event_id}`,patch);}catch(e){console.error("event claim approve patch",e);}}
          await reloadEventClaims();
        },
        onClose:()=>setShowHostEdit(false),onChanged:reloadMemberships}}
      onClose={()=>setShowHostEdit(false)}/>
    );
  })()}
  {pendingHostNotice&&(
    <div className="notice"><div className="ico"><Clock size={18}/></div>
      <div><b>Setup complete — pending approval</b>
      <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>Your request to manage <b>{hostById(pendingHostNotice)?.name||"your host"}</b> is in. You'll browse as a guest until the AthLink team verifies you.</div></div>
      <button className="x" style={{marginLeft:8}} onClick={()=>setPendingHostNotice(null)}><X size={15}/></button>
    </div>
  )}
  {showUsername&&auth&&(
    <div className="ov" onClick={()=>setShowUsername(false)}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <User size={18}/><h3 style={{flex:1}}>Create a username</h3>
          <button className="x" onClick={()=>setShowUsername(false)}><X size={16}/></button>
        </div>
        <div style={{padding:"18px 24px 24px",display:"flex",flexDirection:"column",gap:14}}>
          <p style={{margin:0,fontSize:13,color:"var(--mut)",lineHeight:1.5}}>
            A username gives you a unique handle so people can find you and tell you apart from others with the same name.
          </p>
          {usernameErr&&<div style={{background:"rgba(200,50,50,.1)",border:"1px solid rgba(200,50,50,.3)",borderRadius:10,padding:"9px 13px",fontSize:12.5,color:"#c0392b"}}>{usernameErr}</div>}
          <div style={{display:"flex",alignItems:"center",gap:0,border:"1px solid var(--line)",borderRadius:10,background:"rgba(255,255,255,.85)",overflow:"hidden"}}>
            <span style={{padding:"11px 4px 11px 13px",color:"var(--mut)",fontSize:15,fontWeight:700}}>@</span>
            <input autoFocus value={usernameInput}
              onChange={e=>{setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""));setUsernameErr("");}}
              onKeyDown={e=>{if(e.key==="Enter"&&usernameInput.trim().length>=3)saveUsername();}}
              placeholder="your_handle" maxLength={24}
              style={{flex:1,border:0,background:"none",outline:"none",font:"inherit",fontSize:14,padding:"11px 13px 11px 2px"}}/>
          </div>
          <button className="btn cta liquidGlass-wrapper" style={{width:"100%",justifyContent:"center"}} disabled={usernameBusy||usernameInput.trim().length<3} onClick={saveUsername}>
            <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{usernameBusy?<Loader2 size={15} className="spin"/>:<CheckCircle size={15}/>}Save username</div>
          </button>
        </div>
      </div>
    </div>
  )}
  {(gSearchOpen||navSearchOpen)&&<div style={{position:"fixed",inset:0,zIndex:55}} onClick={()=>{setGSearchOpen(false);setNavSearchOpen(false);}}/>}

  {/* ── Breadcrumb wayfinding — entity pages only (top-level pages carry their own
      titles; the top bar has no back button by rule, so this is the "you are here"). ── */}
  {(()=>{
    const isCls=portal&&String(portal).startsWith("class:");
    const crumbs=[];
    if(view.name==="competitions"&&view.cls){
      crumbs.push({label:"Competitions",go:()=>goTop("competitions")},{label:classLabel(view.cls)});
    }else if(view.name==="athletes"&&!portal&&view.cls){
      crumbs.push({label:"Athletes",go:()=>goTop("athletes")},{label:classLabel(view.cls)});
    }else if(view.name==="event"){
      const ev=events.find(e=>e.id===view.id);
      crumbs.push({label:"Competitions",go:()=>goTop("competitions")},{label:ev?ev.name:"Competition"});
    }else if(view.name==="profile"){
      crumbs.push({label:"Athletes",go:()=>goTop("athletes")},{label:view.id||"Athlete"});
    }else if(isCls){
      const cls=classLabel(String(portal).slice(6));
      crumbs.push({label:"Classes"});
      if(view.name==="athletes") crumbs.push({label:cls,go:()=>{pushNav();setView({name:"events"});window.scrollTo(0,0);}},{label:"Athletes"});
      else crumbs.push({label:cls});
    }else if(portal){
      const h=hostById(portal);
      crumbs.push({label:"Hosts",go:()=>goTop("hosts")});
      if(view.name==="athletes") crumbs.push({label:h?.name||"Club",go:()=>{pushNav();setView({name:"events"});window.scrollTo(0,0);}},{label:"Athletes"});
      else crumbs.push({label:h?.name||"Club"});
    }
    if(!crumbs.length) return null;
    return(
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c,i)=>(
            <React.Fragment key={i}>
              {i>0&&<ChevronRight size={13} className="c-sep"/>}
              {c.go
                ? <button className="c-link" onClick={c.go}>{c.label}</button>
                : <span className={i===crumbs.length-1?"c-cur":"c-root"}>{c.label}</span>}
            </React.Fragment>
          ))}
        </nav>
      </div>
    );
  })()}

  {/* ── HOME HERO — search-first: one action, spanning athletes + competitions + clubs ── */}
  {!portal&&view.name==="portals"&&(
    <div className="home-hero">
      <div className="wrap">
        <h1 className="disp" style={{margin:0}}>Sailing</h1>
        <p style={{marginTop:6,marginBottom:0}}>Results, athlete profiles and class standings for competitive sailing</p>
        <div className="hero-srch" onClick={e=>e.stopPropagation()}>
          <Search size={19} color="#9fb2c8" style={{flex:"none"}}/>
          <input placeholder="Search athletes, competitions & clubs…" value={gSearch}
            onChange={e=>{setGSearch(e.target.value);setGSearchOpen(true);runGlobalSearch(e.target.value);}}
            onFocus={()=>setGSearchOpen(true)}
            onBlur={()=>setTimeout(()=>setGSearchOpen(false),150)}
            onKeyDown={e=>{if(e.key==="Escape"){setGSearch("");setGSearchOpen(false);}if(e.key==="Enter"&&gSearchResults.length){execGSearch(gSearchResults[0]);}}}/>
          {gSearch&&<button className="mp-clear" onClick={()=>{setGSearch("");setGSearchOpen(false);setGSearchResults([]);}}><X size={15}/></button>}
          {!navSearchOpen&&gSearchOpen&&gSearchResults.length>0&&(
            <div className="hero-drop">
              {gSearchResults.map((r,i)=>(
                <div key={i} className="gsrch-item" onMouseDown={()=>execGSearch(r)}>
                  <div className="gi-icon" style={{background:r.type==="athlete"?"#e8f4ff":r.type==="event"?"#f0f4ff":r.type==="portal"?"var(--sky)":"#f0f8f0"}}>
                    {r.type==="athlete"?<Users size={14} color="#1a5e8a"/>:r.type==="event"?<Anchor size={14} color="#1a3e8a"/>:r.type==="portal"?<Waves size={14} color="var(--navy)"/>:<ChevronRight size={14} color="#0a6b41"/>}
                  </div>
                  <div><div className="gi-label">{r.label}</div><div className="gi-sub">{r.sub}</div></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )}

  {/* (Calendar is now a popup modal — see RACE CALENDAR MODAL below) */}

  {/* ── HOME: breadth strip — class chips, recent competitions, featured athletes.
      Quiet proof the catalog is deep; the two old grids (class buttons + HK/INT
      host matrix) are gone — clubs are reached via search and Competitions. ── */}
  {!portal&&view.name==="portals"&&(()=>{
    const published=events.filter(ev=>ev.status!=="Draft");
    const recent=published.slice().sort((a,b)=>{
      const da=a.date?.split('/').reverse().join('')||'';
      const db=b.date?.split('/').reverse().join('')||'';
      return db.localeCompare(da);
    }).slice(0,4);
    // Most-active athletes across all published competitions — breadth, not a ranking.
    const counts=new Map();
    published.forEach(ev=>ev.entries.forEach(en=>{[en.helm,en.crew].forEach(nm=>{if(!nm)return;const k=canonName(nm);if(k)counts.set(k,(counts.get(k)||0)+1);});}));
    const featured=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,n])=>({
      key:k,name:displayNameFor(k)||k,cls:ATHLETE_ATTRS.get(k)?.recentCls||null,n
    }));
    return(
    <div className="wrap sec">
      <div className="strip-chips">
        {CLASSES.map(c=>{
          const n=published.filter(e=>e.cls===c.id).length;
          return(
            <button key={c.id} className="strip-chip" onClick={()=>goTop("competitions",{cls:c.id})}>
              <span className="dot" style={{background:classColor(c.id)}}/>{c.short}<span className="cnt">{n}</span>
            </button>
          );
        })}
        <button className="strip-chip" onClick={()=>goTop("competitions")}>All competitions<ChevronRight size={13}/></button>
      </div>
      <p className="seclabel">Recent competitions</p>
      <div className="strip-cards">
        {recent.map(ev=>{
          const host=hostById(ev.owner)?.name||ev.organizer_name||"";
          const n=nuggetFor(ev.cls,ev.subclass);
          return(
          <div key={ev.id} className="strip-card" onClick={()=>go({name:"event",id:ev.id})}>
            <div className="sc-top"><span className="sc-date">{formatDate(ev.date)}</span><span className="cls" style={{background:n.color}}>{n.label}</span></div>
            <p className="sc-name">{ev.name}</p>
            {host&&<p className="sc-sub">{host}</p>}
          </div>);
        })}
      </div>
      <p className="seclabel">Featured athletes</p>
      <div className="strip-cards">
        {featured.map(a=>(
          <div key={a.key} className="strip-card" onClick={()=>go({name:"profile",id:a.name})}>
            <div className="sc-top">
              <span className="av" style={{background:"var(--navy2)",width:34,height:34,fontSize:12}}>{a.name.split(/\s+/).map(w=>w[0]).filter(Boolean).slice(0,2).join("").toUpperCase()}</span>
              {a.cls&&(()=>{const n=nuggetFor(a.cls);return <span className="cls" style={{background:n.color}}>{n.label}</span>;})()}
            </div>
            <p className="sc-name">{a.name}</p>
            <p className="sc-sub">{a.n} competition{a.n!==1?"s":""}</p>
          </div>
        ))}
      </div>
    </div>
    );
  })()}

  {/* ── COMPETITIONS: global list — every published competition across all hosts ── */}
  {!portal&&view.name==="competitions"&&(()=>{
    const q=compQ.trim().toLowerCase();
    const published=events.filter(ev=>ev.status!=="Draft");
    const lens=view.cls||null; // class filter — carried in the view so /class/<id> deep-links
    const cLens=view.country||null; // country filter (competition's host country)
    // Chip row: the 4 main classes plus any custom classes that actually have competitions
    const customIds=[...new Set(published.map(e=>e.cls).filter(Boolean))].filter(id=>!CLASSES.some(c=>c.id===id));
    const chipDefs=[...CLASSES.map(c=>({id:c.id,label:c.short})),...customIds.map(id=>({id,label:classLabel(id)}))];
    const compCountries=[...new Set(published.map(ev=>eventCountryCode(ev)).filter(Boolean))]
      .sort((x,y)=>(GLOBE_NAMES[IOC_ISO[x]]||x).localeCompare(GLOBE_NAMES[IOC_ISO[y]]||y));
    const inLens=published.filter(ev=>(!lens||ev.cls===lens)&&(!cLens||eventCountryCode(ev)===cLens));
    const list=inLens
      .filter(ev=>!q
        ||(ev.name||"").toLowerCase().includes(q)
        ||classLabel(ev.cls||"").toLowerCase().includes(q)
        ||(hostById(ev.owner)?.name||ev.organizer_name||"").toLowerCase().includes(q))
      .slice().sort((a,b)=>{
        const da=a.date?.split('/').reverse().join('')||'';
        const db=b.date?.split('/').reverse().join('')||'';
        return db.localeCompare(da);
      });
    const evItems=[];let lastYear=null;
    list.forEach((ev,i)=>{
      const yr=ev.date?.split('/')?.[2]||null;
      if(yr&&yr!==lastYear){evItems.push({type:'divider',year:yr});lastYear=yr;}
      evItems.push({type:'ev',ev,i});
    });
    return(
    <div className="wrap sec">
      <div className="page-head" style={{display:"flex",alignItems:"flex-end",gap:14,flexWrap:"wrap"}}>
        <div style={{flex:"1 1 auto",minWidth:0}}>
          <h1 className="page-title">{lens?`${classLabel(lens)} competitions`:"Competitions"}</h1>
          <p className="page-sub">{inLens.length} competition{inLens.length!==1?"s":""}{(lens||cLens)?"":" across all clubs and classes"}</p>
        </div>
        <button className="btn ghost" style={{fontSize:13,padding:"8px 14px",flex:"none"}} onClick={()=>openCalendar(null)}><Calendar size={15}/>Calendar</button>
      </div>
      <div className="toolbar" style={{marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
        <div className="srch" style={{flex:1}}>
          <Search size={16} color="#9fb2c8"/>
          <input placeholder="Search competitions, classes & clubs…" value={compQ} onChange={e=>setCompQ(e.target.value)}/>
        </div>
      </div>
      <div className="strip-chips" style={{margin:"0 0 14px"}}>
        <button className={`lens-chip${!lens?" on":""}`} onClick={()=>setView(v=>({...v,name:"competitions",cls:undefined}))}>All</button>
        {chipDefs.map(c=>{
          const n=published.filter(e=>e.cls===c.id).length;
          if(!n) return null;
          return(
            <button key={c.id} className={`lens-chip${lens===c.id?" on":""}`} onClick={()=>setView(v=>({...v,name:"competitions",cls:v.cls===c.id?undefined:c.id}))}>
              <span className="dot" style={{background:nuggetFor(c.id).color}}/>{c.label}<span className="cnt">{n}</span>
            </button>
          );
        })}
        <span className="lens-selwrap">
          <select className="lens-select" value={cLens||""} onChange={e=>setView(v=>({...v,country:e.target.value||undefined}))}>
            <option value="">All countries</option>
            {compCountries.map(cc=>(<option key={cc} value={cc}>{iocFlag(cc)} {GLOBE_NAMES[IOC_ISO[cc]]||cc}</option>))}
          </select>
          <ChevronRight size={13} className="lens-selchev"/>
        </span>
        <span className="lens-selwrap">
          <select className="lens-select" value="" onChange={e=>{if(e.target.value)enterPortal(e.target.value);}}>
            <option value="">By host…</option>
            {navHosts.map(h=>(<option key={h.id} value={h.id}>{h.name}</option>))}
          </select>
          <ChevronRight size={13} className="lens-selchev"/>
        </span>
      </div>
      {evItems.map(item=>{
        if(item.type==='divider') return(
          <div key={"yr"+item.year} style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0 8px"}}>
            <span style={{fontSize:12,fontWeight:700,color:"var(--mut)",letterSpacing:".1em"}}>{item.year}</span>
            <div style={{flex:1,height:1,background:"var(--line)"}}/>
          </div>
        );
        const{ev,i}=item;
        const s=scoreEvent(ev);
        const hostName=hostById(ev.owner)?.name||ev.organizer_name||null;
        return(<div className="ev" key={ev.id} style={{animationDelay:`${Math.min(i,12)*50}ms`}} onClick={()=>go({name:"event",id:ev.id})}>
          {(()=>{
            const dp=ev.date?.split('/');
            const hasDate=dp&&dp.length===3&&dp[0]&&dp[2];
            return(<div style={{display:"flex",alignItems:"center",gap:6}}>
              {hasDate&&<div className="evicon-year">{dp[2].split('').map((ch,ci)=><span key={ci}>{ch}</span>)}</div>}
              {hasDate
                ?<div className="evicon-date"><span className="eid">{dp[0]}</span><span className="eim">{MON[parseInt(dp[1])-1]||""}</span></div>
                :<div className="evicon"><Anchor size={20}/></div>}
            </div>);
          })()}
          <div style={{flex:1,minWidth:0}}>
            <p className="evname">{ev.name}</p>
            <div className="evmeta">
              {hostName&&<span><Waves size={13}/>{hostName}</span>}
              <span><MapPin size={13}/>{ev.country?<CountryTag code={ev.country}/>:"—"}</span>
              <span><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--link)",fontWeight:600}} title="Open calendar" onClick={e=>{e.stopPropagation();openCalendarAt(ev.date);}}>{formatDate(ev.date)}</span></span>
              <span><Users size={13}/>{s.fleet} boats · {s.races} races</span>
            </div>
          </div>
          {(()=>{const n=nuggetFor(ev.cls,ev.subclass);return <span className="cls" style={{background:n.color}}>{n.label}</span>;})()}
          <ChevronRight size={18} color="#9fb2c8"/>
        </div>);
      })}
      {list.length===0&&published.length>0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No competitions match{q?" this search":""}{lens?` in ${classLabel(lens)}`:""}. <button style={{border:0,background:"none",color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setCompQ("");setView({name:"competitions"});}}>Clear</button></p>}
      {published.length===0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No competitions yet.</p>}
      {/* Clubs — browse point (clubs are not a top-level door; they live here + in search) */}
      {(()=>{
        const hosts=[...FEDERATIONS,...CLUBS,...ASSOCIATIONS].map(h=>({
          ...h,n:published.filter(ev=>eventAssocs(ev).includes(h.id)).length
        })).filter(h=>h.n>0).sort((a,b)=>b.n-a.n);
        if(!hosts.length) return null;
        return(<>
          <p className="seclabel" style={{marginTop:34}}>Clubs & organisations</p>
          <div className="strip-chips">
            {hosts.map(h=>(
              <button key={h.id} className="strip-chip" onClick={()=>enterPortal(h.id)}>
                {h.name}<span className="cnt">{h.n}</span>
              </button>
            ))}
          </div>
        </>);
      })()}
    </div>
    );
  })()}

  {/* ── HOSTS: global directory — federations, clubs and associations ── */}
  {!portal&&view.name==="hosts"&&(()=>{
    const q=hostQ.trim().toLowerCase();
    const tLens=view.type||null, cLens=view.country||null;
    const list=navHosts
      .filter(h=>!tLens||h.htype===tLens)
      .filter(h=>!cLens||h.loc===cLens)
      .filter(h=>!q||h.name.toLowerCase().includes(q));
    const published=events.filter(ev=>ev.status!=="Draft");
    return(
    <div className="wrap sec">
      <div className="page-head">
        <h1 className="page-title">Hosts</h1>
        <p className="page-sub">{navHosts.length} federations, clubs and associations on AthLink</p>
      </div>
      <div className="toolbar" style={{marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
        <div className="srch" style={{flex:1}}>
          <Search size={16} color="#9fb2c8"/>
          <input placeholder="Search hosts…" value={hostQ} onChange={e=>setHostQ(e.target.value)}/>
        </div>
      </div>
      <div className="strip-chips" style={{margin:"0 0 16px"}}>
        <button className={`lens-chip${!tLens?" on":""}`} onClick={()=>setView(v=>({...v,type:undefined}))}>All</button>
        {[["federation","Federations"],["club","Clubs"],["association","Associations"]].map(([t,label])=>(
          <button key={t} className={`lens-chip${tLens===t?" on":""}`} onClick={()=>setView(v=>({...v,type:v.type===t?undefined:t}))}>{label}<span className="cnt">{navHosts.filter(h=>h.htype===t).length}</span></button>
        ))}
        <span className="lens-selwrap">
          <select className="lens-select" value={cLens||""} onChange={e=>setView(v=>({...v,country:e.target.value||undefined}))}>
            <option value="">All countries</option>
            {hostCountries.map(cc=>(<option key={cc} value={cc}>{iocFlag(cc)} {GLOBE_NAMES[IOC_ISO[cc]]||cc}</option>))}
          </select>
          <ChevronRight size={13} className="lens-selchev"/>
        </span>
      </div>
      <div className="classes-grid">
        {list.map((h,i)=>{
          const typeLabel=h.htype==="federation"?"Federation":h.htype==="club"?"Club":"Association";
          const pub=published.filter(ev=>eventAssocs(ev).includes(h.id));
          const ppl=new Set();pub.forEach(ev=>ev.entries.forEach(e=>{if(e.helm)ppl.add(canonName(e.helm));if(e.crew)ppl.add(canonName(e.crew));}));
          const ids=Array.from(new Set(pub.map(e=>e.cls).filter(Boolean)));
          const main=CLASSES.filter(c=>ids.includes(c.id)).map(c=>c.id);
          const clsIds=[...main,...ids.filter(id=>!main.includes(id))];
          return(
          <div className="class-card" key={h.id} style={{animationDelay:`${Math.min(i,10)*60}ms`}} onClick={()=>enterPortal(h.id)}>
            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8,marginBottom:14,minHeight:24}}>
              <span style={{display:"inline-block",fontSize:10,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"#5b6b80",border:"1px solid rgba(91,107,128,.5)",borderRadius:980,padding:"3px 10px",background:"transparent",whiteSpace:"nowrap"}}>{typeLabel}</span>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end",alignItems:"center",flex:"1 1 0",minWidth:0}}>
                <HostClassPills classIds={clsIds}/>
              </div>
            </div>
            <p className="class-name">{h.loc?<span style={{marginRight:6}}>{iocFlag(h.loc)}</span>:null}{h.name}</p>
            <div className="class-stats" style={{marginBottom:0}}><div><b>{h.n}</b>competitions</div><div><b>{ppl.size}</b>athletes</div></div>
          </div>);
        })}
      </div>
      {list.length===0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No hosts match. <button style={{border:0,background:"none",color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setHostQ("");setView({name:"hosts"});}}>Clear</button></p>}
    </div>
    );
  })()}

  {/* ── HOME: Ranking ── */}
  {!portal&&view.name==="ranking"&&(()=>{
    const yearOf=ev=>{const m=(ev.date||"").match(/(\d{4})/);return m?m[1]:null;};
    const dateKey=ev=>{const m=(ev.date||"").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?`${m[3]}${m[2].padStart(2,"0")}${m[1].padStart(2,"0")}`:"00000000";};
    const mode=arr=>{const c={};arr.forEach(v=>c[v]=(c[v]||0)+1);const t=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];return t?t[0]:null;};
    const genderOf=div=>{const d=String(div||"").trim().toLowerCase();if(["m","men","male","boy","boys"].includes(d))return"M";if(["f","w","women","female","girl","girls"].includes(d))return"F";return null;};
    const dh=rankCls==="29er"||rankCls==="49er";
    // Class events (non-draft, deduped), split into federation-governed vs international
    const clsEvents=dedupEvents(events.filter(e=>e.cls===rankCls&&e.status!=="Draft"));
    const fedEvents=clsEvents.filter(e=>governingFeds(e).length>0).sort((a,b)=>dateKey(b).localeCompare(dateKey(a)));
    const intEvents=clsEvents.filter(e=>governingFeds(e).length===0).sort((a,b)=>dateKey(b).localeCompare(dateKey(a)));
    const sourceEvents=rankSourceOpen==="federation"?fedEvents:rankSourceOpen==="international"?intEvents:[];
    // Group the open source's events by year (desc) for the picker
    const byYear={};sourceEvents.forEach(e=>{const y=yearOf(e)||"—";(byYear[y]||(byYear[y]=[])).push(e);});
    const years=Object.keys(byYear).sort().reverse();
    // Selected competitions become columns (date asc)
    const comps=clsEvents.filter(e=>rankSelected.has(e.id)).sort((a,b)=>dateKey(a).localeCompare(dateKey(b)));
    // ── Selection-series engine (verified vs HKSF 2025 29er sheet) ────────
    // Unit = boat (crew pair for 29er/49er, else solo). Every boat that sails
    // ANY selected regatta is scored across ALL of them; absence from a regatta
    // scores a DNC for each of that regatta's races.
    //   DNC value  = that regatta's entries + 1 (Appendix A, per-regatta).
    //   Cumulative = one long series of every race; discards drop the worst races.
    //   Position   = sum of each regatta's finishing place; discards drop the worst.
    //   Tiebreak   = best result in the most recent regatta.
    // PDF stays ground truth — per-race points/ranks come from scoreEvent.
    const compMeta={};                                  // ev.id -> {fleetN, dncVal, raceCount}
    const byComp=new Map();
    comps.forEach(ev=>{
      const sc=scoreEvent(ev);
      const raceCount=sc.rows.reduce((m,r)=>Math.max(m,(r.races||[]).length),0)||1;
      const fleetN=ev.entries.length||sc.rows.length||1;
      compMeta[ev.id]={fleetN,dncVal:fleetN+1,raceCount};
      sc.rows.forEach(r=>{
        const cell={net:r.net,rank:r.rank,races:r.races||[],race_codes:r.race_codes||null,sail:r.sail,pts:r.pts||[]};
        if(dh){
          const hk=canonName(r.helm||""),ck=canonName(r.crew||"");
          const key=[hk,ck].filter(Boolean).sort().join("|")||hk||ck;if(!key) return;
          if(!byComp.has(key)) byComp.set(key,{type:"team",helm:"",crew:"",perComp:{},genders:[],divs:[]});
          const t=byComp.get(key);
          if(r.helm) t.helm=displayNameFor(hk)||r.helm;
          if(r.crew) t.crew=displayNameFor(ck)||r.crew;
          t.perComp[ev.id]=cell;
          const gc=genderCatOf(r);if(gc.gender)t.genders.push(gc.gender);if(gc.category)t.divs.push(gc.category);
        }else{
          const nm=r.helm;if(!nm) return;const k=canonName(nm);if(!k) return;
          if(!byComp.has(k)) byComp.set(k,{type:"solo",name:displayNameFor(k)||nm,perComp:{},genders:[],divs:[]});
          const a=byComp.get(k);a.perComp[ev.id]=cell;
          const gc=genderCatOf(r);if(gc.gender)a.genders.push(gc.gender);if(gc.category)a.divs.push(gc.category);
        }
      });
    });
    const disc=Math.max(0,rankDiscards|0);
    const lastComp=comps[comps.length-1]||null;
    let rows=[...byComp.entries()].map(([k,a])=>{
      const per={};                       // ev.id -> {contrib, rank, dnc}
      const seriesRaces=[];               // flat race-score list (cumulative)
      comps.forEach(c=>{
        const m=compMeta[c.id],pc=a.perComp[c.id];
        if(pc){
          const raceScores=(pc.pts&&pc.pts.length)?pc.pts.slice():[];
          per[c.id]={rank:pc.rank,dnc:false,
            contrib:rankMode==="position"?(pc.rank??m.dncVal):raceScores.reduce((s,v)=>s+v,0)};
          if(rankMode!=="position") raceScores.forEach(v=>seriesRaces.push(v));
        }else{
          per[c.id]={rank:null,dnc:true,
            contrib:rankMode==="position"?m.dncVal:m.dncVal*m.raceCount};
          if(rankMode!=="position") for(let i=0;i<m.raceCount;i++) seriesRaces.push(m.dncVal);
        }
      });
      let total;
      if(rankMode==="position"){
        const vals=comps.map(c=>per[c.id].contrib).sort((x,y)=>y-x);
        const d=Math.min(disc,Math.max(0,vals.length-1));
        total=vals.slice(d).reduce((s,v)=>s+v,0);
      }else{
        const vals=seriesRaces.slice().sort((x,y)=>y-x);
        const d=Math.min(disc,Math.max(0,vals.length-1));
        total=vals.slice(d).reduce((s,v)=>s+v,0);
      }
      const lastRes=lastComp?(per[lastComp.id]?.rank??compMeta[lastComp.id]?.dncVal??9999):9999;
      const gender=a.genders.length?mode(a.genders):null;
      const division=a.divs.length?mode(a.divs):null;
      return{key:k,type:a.type,name:a.name,helm:a.helm,crew:a.crew,perComp:a.perComp,per,total,lastRes,
        count:comps.filter(c=>a.perComp[c.id]).length,gender,division};
    });
    // Lowest total wins; tiebreak = best result in the most recent regatta, then name.
    rows.sort((a,b)=>a.total-b.total||a.lastRes-b.lastRes||(a.name||a.helm||"").localeCompare(b.name||b.helm||""));
    // Country lens (helm nationality) — re-ranked within the filtered view.
    const natOfRow=r=>{const k=canonName(dh?(r.helm||""):(r.name||""));return (cardStats.get(k)||{}).nat||"";};
    const rankCountries=[...new Set(rows.map(natOfRow).filter(Boolean))]
      .sort((x,y)=>(GLOBE_NAMES[IOC_ISO[x]]||x).localeCompare(GLOBE_NAMES[IOC_ISO[y]]||y));
    if(rankCountry) rows=rows.filter(r=>natOfRow(r)===rankCountry);
    rows.forEach((r,i)=>r.rankNum=i+1);
    const podium=n=>n===1?"#e3b341":n===2?"#9aa6b2":n===3?"#c08457":"var(--navy)";
    const clsShort=classLabel(rankCls);
    // Cumulative tallies across the selected competitions (updates as comps change)
    const rankAthleteCount=(()=>{
      const set=new Set();
      comps.forEach(ev=>scoreEvent(ev).rows.forEach(r=>{
        if(r.helm){const k=canonName(r.helm);if(k)set.add(k);}
        if(r.crew){const k=canonName(r.crew);if(k)set.add(k);}
      }));
      return set.size;
    })();
    const Nug=({children,color})=><span style={{display:"inline-block",fontSize:10,fontWeight:700,color:"#fff",background:color||"var(--mut)",borderRadius:5,padding:"2px 6px",marginRight:4}}>{children}</span>;
    return(
      <div className="wrap sec" style={{paddingTop:16}}>
        <div className="page-head">
          <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
          <h1 className="page-title">Rankings</h1>
          <p className="page-sub">{comps.length} competition{comps.length!==1?"s":""} · {rankAthleteCount} athlete{rankAthleteCount!==1?"s":""} in the {clsShort} series</p>
        </div>
        {/* Lenses — class chips + country select, same idiom as every other list page */}
        <div className="strip-chips" style={{margin:"0 0 14px"}}>
          {CLASSES.map(c=>(
            <button key={c.id} className={`lens-chip${rankCls===c.id?" on":""}`} onClick={()=>{setRankCls(c.id);setRankSourceOpen(null);setRankExpanded(new Set());}}>
              <span className="dot" style={{background:classColor(c.id)}}/>{c.short}
            </button>
          ))}
          <span className="lens-selwrap">
            <select className="lens-select" value={rankCountry} onChange={e=>setRankCountry(e.target.value)}>
              <option value="">All countries</option>
              {rankCountries.map(cc=>(<option key={cc} value={cc}>{iocFlag(cc)} {GLOBE_NAMES[IOC_ISO[cc]]||cc}</option>))}
            </select>
            <ChevronRight size={13} className="lens-selchev"/>
          </span>
        </div>
        {/* Source nuggets */}
        <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          {[["federation","Federation",fedEvents.length],["international","International",intEvents.length]].map(([id,label,n])=>{
            const on=rankSourceOpen===id;
            return<button key={id} onClick={()=>setRankSourceOpen(o=>o===id?null:id)}
              style={{border:"0",background:on?"var(--accent)":"rgba(255,255,255,0.62)",color:on?"#fff":"var(--navy)",
                backdropFilter:"blur(22px) saturate(190%)",WebkitBackdropFilter:"blur(22px) saturate(190%)",
                boxShadow:on?"inset 0 1px 0 rgba(255,255,255,.4),0 1px 3px rgba(10,132,255,.3)":"inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.5)",
                borderRadius:980,padding:"8px 15px",fontSize:13,fontWeight:700,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,transition:".15s"}}>
              {label}<span style={{fontSize:11,opacity:.75,fontWeight:600}}>{n}</span>{on?<ChevronRight size={14} style={{transform:"rotate(90deg)"}}/>:<ChevronRight size={14}/>}
            </button>;
          })}
        </div>
        {/* Result picker for the open source */}
        {rankSourceOpen&&<div style={{marginBottom:16}}>
          {years.length===0&&<p style={{fontSize:13,color:"var(--mut)",margin:0}}>No {clsShort} {rankSourceOpen==="federation"?"federation":"international"} competitions yet.</p>}
          {years.map(y=>(
            <div key={y} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"5px 0"}}>
              <span style={{fontSize:12,fontWeight:800,color:"var(--mut)",letterSpacing:".04em",minWidth:38}}>{y}</span>
              {byYear[y].map(ev=>{
                const sel=rankSelected.has(ev.id);
                return<button key={ev.id} onClick={()=>setRankSelected(prev=>{const n=new Set(prev);n.has(ev.id)?n.delete(ev.id):n.add(ev.id);return n;})}
                  title={ev.name}
                  style={{border:"1px solid "+(sel?classColor(rankCls):classColorA(rankCls,.45)),background:sel?classColor(rankCls):`linear-gradient(${classColorA(rankCls,.18)},${classColorA(rankCls,.18)}),rgba(255,255,255,0.80)`,color:sel?"#fff":classColor(rankCls),
                    backdropFilter:"blur(18px) saturate(185%)",WebkitBackdropFilter:"blur(18px) saturate(185%)",boxShadow:"inset 0 1px 0 rgba(255,255,255,.6)",
                    borderRadius:980,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",maxWidth:260,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"inline-flex",alignItems:"center",gap:5,transition:".12s"}}
                  onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.06)"}
                  onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                  {sel?<CheckCircle size={12}/>:<Plus size={12}/>}{ev.name}
                </button>;
              })}
            </div>
          ))}
        </div>}
        {comps.length===0
          ?<p style={{color:"var(--mut)",fontSize:14,padding:"24px 0"}}>Select one or more competitions above to build the {clsShort} ranking. Selected regattas combine into one series — lowest total wins.</p>
          :<>
          {/* When the source pickers are collapsed, show the selected competitions as removable nuggets */}
          {!rankSourceOpen&&<div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:12}}>
            {comps.map(c=>(
              <button key={c.id} onClick={()=>setRankSelected(prev=>{const n=new Set(prev);n.delete(c.id);return n;})} title="Remove from ranking"
                style={{border:"1px solid "+classColor(rankCls),background:classColor(rankCls),color:"#fff",borderRadius:980,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",maxWidth:260,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"inline-flex",alignItems:"center",gap:5,boxShadow:"inset 0 1px 0 rgba(255,255,255,.35)",transition:".12s"}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.08)"}
                onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                {c.name}<X size={12}/>
              </button>
            ))}
          </div>}
          {/* Ranking controls: mode toggle + discard stepper (verified engine) */}
          <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",marginBottom:14}}>
            <div style={{display:"inline-flex",borderRadius:980,overflow:"hidden",border:"1px solid var(--line)"}}>
              {[["cumulative","Cumulative"],["position","Position"]].map(([id,label])=>{
                const on=rankMode===id;
                return<button key={id} onClick={()=>setRankMode(id)} title={id==="cumulative"?"Weighs every race across the combined series":"Weighs each competition's finishing place equally"}
                  style={{border:"0",background:on?"var(--navy)":"rgba(255,255,255,.7)",color:on?"#fff":"var(--navy)",padding:"7px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",transition:".12s"}}>{label}</button>;
              })}
            </div>
            <div style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:700,color:"var(--navy)"}}>
              Discards
              <button onClick={()=>setRankDiscards(d=>Math.max(0,d-1))} title="Fewer discards" style={{width:26,height:26,borderRadius:8,border:"1px solid var(--line)",background:"rgba(255,255,255,.8)",cursor:"pointer",fontWeight:800,color:"var(--navy)"}}>–</button>
              <span style={{minWidth:16,textAlign:"center"}}>{rankDiscards}</span>
              <button onClick={()=>setRankDiscards(d=>d+1)} title="More discards" style={{width:26,height:26,borderRadius:8,border:"1px solid var(--line)",background:"rgba(255,255,255,.8)",cursor:"pointer",fontWeight:800,color:"var(--navy)"}}>+</button>
            </div>
            <span style={{fontSize:11.5,color:"var(--mut)"}}>{rankMode==="cumulative"?"Combined series · every race counts · DNC = entries+1":"Sum of competition placings · DNC = entries+1"}</span>
          </div>
          <div className="panel" style={{overflowX:"auto"}}>
            <table>
              <thead>
                <tr>
                  <th style={{width:48}}>Rank</th>
                  <th className="l">{dh?"Team":"Athlete"}</th>
                  {comps.map((c,i)=><th key={c.id} title={c.name} style={{maxWidth:130}}><div style={{maxWidth:130,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",margin:"0 auto"}}>{c.name}</div></th>)}
                  <th>Total</th>
                  <th>Div</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r=>{
                  const expanded=comps.filter(c=>rankExpanded.has(`${r.key}|${c.id}`)&&r.perComp[c.id]);
                  return(<React.Fragment key={r.key}>
                    <tr>
                      <td className={"rk"+(r.rankNum===1?" p1":r.rankNum===2?" p2":r.rankNum===3?" p3":"")}>{r.rankNum}</td>
                      <td className="l" style={{whiteSpace:"nowrap"}}>
                        {dh
                          ?<div style={{lineHeight:1.35}}>
                            <div><span className="namelink" onClick={()=>r.helm&&go({name:"profile",id:r.helm})}>{r.helm||"—"}</span> <span style={{fontSize:10,color:"var(--mut)",fontWeight:700}}>HELM</span></div>
                            {r.crew&&<div><span className="namelink" onClick={()=>go({name:"profile",id:r.crew})}>{r.crew}</span> <span style={{fontSize:10,color:"var(--mut)",fontWeight:700}}>CREW</span></div>}
                          </div>
                          :<span className="namelink" onClick={()=>go({name:"profile",id:r.name})}>{r.name}</span>}
                      </td>
                      {comps.map(c=>{
                        const pc=r.perComp[c.id];const pcell=r.per[c.id];
                        const shown=rankMode==="position"?(pcell.dnc?compMeta[c.id].dncVal:(pcell.rank??"–")):pcell.contrib;
                        const ek=`${r.key}|${c.id}`;const open=rankExpanded.has(ek);
                        return <td key={c.id}>
                          <button onClick={()=>pc&&toggleRankCell(ek)} title={pcell.dnc?"DNC — absent from this competition (entries+1)":"Tap for race detail"}
                            style={{border:"1px solid "+(open?"var(--accent)":"transparent"),background:open?"var(--sky)":"transparent",color:pcell.dnc?"var(--mut)":"var(--navy)",borderRadius:6,padding:"3px 8px",fontWeight:600,cursor:pc?"pointer":"default",fontSize:13,fontStyle:pcell.dnc?"italic":"normal"}}>{shown}{pcell.dnc?" DNC":""}</button>
                        </td>;
                      })}
                      <td style={{fontWeight:800}}>{r.total}</td>
                      <td style={{whiteSpace:"nowrap"}}>
                        {r.gender&&<Nug color={r.gender==="F"?"#c2477f":"#2d6cc9"}>{r.gender}</Nug>}
                        {r.division&&<Nug>{r.division}</Nug>}
                        {!r.gender&&!r.division&&<span style={{color:"#c8d4e0"}}>—</span>}
                      </td>
                    </tr>
                    {expanded.map(c=>{
                      const pc=r.perComp[c.id];
                      return(<tr key={r.key+c.id} style={{background:"#f3f8fd"}}>
                        <td/><td colSpan={3+comps.length} style={{padding:"8px 14px",textAlign:"left"}}>
                          <div style={{fontSize:12.5,color:"var(--navy)"}}>
                            <strong>{c.name}</strong> — finished #{pc.rank??"–"} {pc.sail&&pc.sail!=="—"?`(${pc.sail})`:""}
                            <div style={{marginTop:5,display:"flex",flexWrap:"wrap",gap:6}}>
                              {(pc.races||[]).map((raw,ri)=>{const code=pc.race_codes?.[ri];return<span key={ri} style={{background:"#fff",border:"1px solid var(--line)",borderRadius:6,padding:"2px 7px",fontSize:11.5}}><span style={{color:"var(--mut)"}}>R{ri+1}</span> <span style={{fontWeight:600,color:code?"#c0392b":"var(--navy)"}}>{raw==null?"":String(raw)}{code?` ${code}`:""}</span></span>;})}
                              <span style={{fontWeight:700}}>Net {pc.net}</span>
                            </div>
                          </div>
                        </td>
                      </tr>);
                    })}
                  </React.Fragment>);
                })}
              </tbody>
            </table>
          </div>
        </>}
      </div>
    );
  })()}

  {/* ── PORTAL: Events list ── */}
  {portal&&view.name==="events"&&(
    <ErrorBoundary resetKey={portal+(view.name||"")} fallback={
      <div className="wrap sec" style={{paddingTop:18}}>
        <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
        <div style={{padding:"40px 0",color:"var(--mut)"}}>Couldn't render these results. <button className="btn ghost" style={{marginLeft:8,fontSize:13,padding:"5px 12px"}} onClick={()=>{setEvFilterChips([]);setEvFilter("");goHome();}}>Back home</button></div>
      </div>}>
    <>
      <div className="strip"><div className="wrap">
        <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
          <div style={{minWidth:0,display:"flex",gap:18,alignItems:"center"}}>
            {(()=>{
              // Item 7: globe for BOTH association/club/federation portals AND class portals.
              let hiso=null;
              if(isClassPortal){
                const top=Object.entries(hostCountryCounts).sort((a,b)=>b[1]-a[1])[0];
                hiso=top?top[0]:null;
              } else {
                const hc=hostLocation(portal,events);
                hiso=hc?IOC_ISO[String(hc).toUpperCase()]:null;
              }
              if(!hiso) return null;
              return(<div style={{width:150,height:150,flex:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} title="Where they compete — click to expand" onClick={()=>setHostFootprintOpen(true)}>
                <SailingGlobe countryData={hostCountryCounts} height={150} dark mini bare hostIso={isClassPortal?null:hiso}/>
              </div>);
            })()}
            <div style={{minWidth:0,alignSelf:"center"}}>
            {/* Item 4: OWNER/role badge sits ABOVE the title, left-aligned. */}
            {!isClassPortal&&myPortalMembership&&myPortalMembership.verified&&(
              <div style={{marginBottom:8}}>
                <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:800,letterSpacing:".05em",textTransform:"uppercase",
                  color:"#6b3fa0",background:"rgba(124,77,196,.13)",border:"1px solid rgba(124,77,196,.34)",borderRadius:980,padding:"3px 11px",whiteSpace:"nowrap"}}>
                  <BadgeCheck size={12} style={{flex:"none"}}/>{myPortalMembership.role}
                </span>
              </div>
            )}
            <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
              <h1 className="page-title">{portalName}</h1>
            </div>
            <div className="pillbar" style={{marginTop:12}}>
              <div className="pill"><Trophy size={16}/><b>{classEvents.length}</b> competitions</div>
              <div className="pill" style={{cursor:"pointer"}} onClick={()=>go({name:"athletes"})}><Users size={16}/><b>{people.length}</b> athletes</div>
            </div>
            </div>
          </div>
          {/* ── In-portal pill buttons — Item 6: vertically centered against the globe/title block ── */}
          <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"stretch",flex:"none",alignSelf:"center"}}>
            <MagneticItem className="portal-pill" onClick={()=>go({name:"athletes"})} strength={0.28}>
              <Users size={14} style={{flex:"none"}}/> Athletes
            </MagneticItem>
            <MagneticItem className="portal-pill" onClick={()=>openCalendar(portal||null)} strength={0.28}>
              <Calendar size={14} style={{flex:"none"}}/> Calendar
            </MagneticItem>
            {fed&&<MagneticItem className="portal-pill" onClick={()=>{pushNav();setPortal(null);setView({name:"ranking"});setQ("");setAthleteSmart(null);window.scrollTo(0,0);}} strength={0.28}>
              <Trophy size={14} style={{flex:"none"}}/> Rankings
            </MagneticItem>}
            {canManageMembers&&!isClassPortal&&<MagneticItem className="portal-pill" onClick={()=>setShowHostEdit(true)} strength={0.28}>
              <Settings size={14} style={{flex:"none"}}/> Edit page
            </MagneticItem>}
          </div>
        </div>
      </div></div>
      <div className="wrap sec" style={{paddingTop:0}}>
        {isPendingHostHere&&(
          <div style={{display:"flex",alignItems:"center",gap:12,background:"rgba(255,149,0,.09)",border:"1px solid rgba(255,149,0,.32)",borderRadius:14,padding:"14px 18px",marginBottom:18}}>
            <Clock size={20} color="#c8860a" style={{flex:"none"}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,color:"#a85c00",fontSize:14}}>Your club is pending approval</div>
              <div style={{fontSize:13,color:"#a85c00",marginTop:2,lineHeight:1.5}}>
                Thanks for setting up {host?.name}. The AthLink team is reviewing your ownership request — until it's approved you'll browse as a guest. We'll notify you once you're verified.
              </div>
            </div>
          </div>
        )}
        {fed&&(()=>{
          const feAssoc=ASSOCIATIONS.filter(a=>a.scope===fed.scope);
          if(!feAssoc.length) return null;
          return <div style={{marginBottom:22}}>
            <p className="seclabel" style={{marginBottom:8}}><Anchor size={14}/>Associations under {fed.name}</p>
            <div className="classes-grid">
              {feAssoc.map(a=>{
                const ce=events.filter(e=>eventAssocs(e).includes(a.id));
                const col=classColor(a.cls);const short=classLabel(a.cls);
                return <div className="class-card" key={a.id} style={{cursor:"pointer"}} onClick={()=>enterPortal(a.id)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:14,minHeight:24}}>
                    <span style={{display:"inline-block",fontSize:10,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"var(--mut)",border:"1px solid rgba(91,107,128,.5)",borderRadius:980,padding:"3px 10px"}}>Association</span>
                    <span className="cls" style={{background:col}}>{short}</span>
                  </div>
                  <p className="class-name">{a.name}</p>
                  <div className="class-stats" style={{marginBottom:0}}><div><b>{ce.length}</b>competitions</div></div>
                </div>;
              })}
            </div>
          </div>;
        })()}
        {evFilterChips.length>0&&(
          <div style={{marginBottom:8,display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
            {evFilterChips.map((c,ci)=>(
              <div className="filter-chip" key={ci}>
                <Sparkles size={11}/>{c.label}
                <button onClick={()=>setEvFilterChips(prev=>prev.filter((_,j)=>j!==ci))}><X size={13}/></button>
              </div>
            ))}
            {evFilterChips.length>1&&(
              <button onClick={()=>setEvFilterChips([])} style={{border:0,background:"none",color:"var(--mut)",fontSize:11.5,cursor:"pointer",textDecoration:"underline"}}>Clear all</button>
            )}
          </div>
        )}
        <div style={{marginBottom:12,display:"flex",gap:10,alignItems:"stretch"}}>
          <div className="ai-srch-wrap" style={{flex:1,minWidth:0}}>
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
                  if(e.key==="Escape"){setEvFilter("");setEvSuggestions([]);}
                }}
                onFocus={()=>{if(evFilter.length>=3)fetchEvSuggestions(evFilter);}}
              />
              {evFilterLoading&&<Loader2 size={13} className="spin" color="#0d8ecf"/>}
              {evFilter&&<button style={{border:0,background:"none",cursor:"pointer",color:"#9fb2c8",padding:0,display:"flex"}} onClick={()=>{setEvFilter("");setEvSuggestions([]);}}><X size={13}/></button>}
            </div>
            {evSuggestions.length>0&&(<>
              <div style={{position:"fixed",inset:0,zIndex:1}} onClick={()=>setEvSuggestions([])}/>
              <div className="sug-drop" style={{zIndex:2}}>
                {evSuggestions.map((s,i)=>(
                  <div key={i} className="sug-item" onClick={()=>{setEvFilter(s);setEvSuggestions([]);setTimeout(runEvFilter,50);}}>
                    <Sparkles size={11} color="#0d8ecf"/>{s}
                  </div>
                ))}
              </div>
            </>)}
          </div>
          {canEdit&&<button className="btn cta liquidGlass-wrapper" style={{whiteSpace:"nowrap",flex:"none"}} onClick={openImport}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Upload size={16}/>Import a competition</div></button>}
        </div>
        {(()=>{
          const allFiltered=(evFilterChips.length
            ?classEvents.filter(ev=>evFilterChips.every(c=>{try{return c.fn(ev,scoreEvent);}catch{return true;}}))
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
                    <span><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--link)",fontWeight:600}} title="Open calendar" onClick={()=>openCalendarAt(ev.date)}>{formatDate(ev.date)}</span></span>
                    <span><Users size={13}/>{s.fleet} boats · {s.races} races{s.countries>0?` · ${s.countries} countr${s.countries===1?"y":"ies"}`:""}</span>
                  </div>
                </div>
                {isDraft&&<span className="draftbadge"><Clock size={11}/> Draft</span>}
                {(()=>{const n=nuggetFor(ev.cls,ev.subclass);return <span className="cls" style={{background:n.color}}>{n.label}</span>;})()}
                {canEdit&&<button className="delbtn" onClick={e=>deleteEvent(ev.id,ev.name,e)}><Trash2 size={16}/></button>}
                <ChevronRight size={18} color="#9fb2c8"/>
              </div>);
            })}
            {filtered.length===0&&classEvents.length>0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No results match {evFilterChips.length>1?"these filters":"this filter"}. <button style={{border:0,background:"none",color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setEvFilterChips([]);setEvFilter("");}}>Clear {evFilterChips.length>1?"filters":"filter"}</button></p>}
            {classEvents.length===0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No competitions yet. Import one to get started.</p>}
          </>);
        })()}
      </div>
    </>
    </ErrorBoundary>
  )}

  {/* ── PORTAL: Event detail ── */}
  {view.name==="event"&&(()=>{
    // NOTE: not gated on `portal` — events are viewable globally (deep link,
    // refresh, or Back from an athlete profile all arrive with portal=null).
    const ev=events.find(e=>e.id===view.id);
    const notFound=(msg)=>(<div className="wrap sec" style={{paddingTop:18}}>
      <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
      <div style={{padding:"40px 0",color:"var(--mut)"}}>{msg} <button className="btn ghost" style={{marginLeft:8,fontSize:13,padding:"5px 12px"}} onClick={()=>go({name:"events"})}>Back to competitions</button></div>
    </div>);
    if(!ev) return notFound("This competition couldn't be found — it may have just been updated or removed.");
    let s=null;try{s=scoreEvent(ev);}catch(err){console.error("event page: scoreEvent failed",err);}
    if(!s) return notFound("Couldn't read this competition's scores.");
    const isDraft=ev.status==="Draft";
    return(<ErrorBoundary resetKey={ev.id} fallback={
      <div className="wrap sec" style={{paddingTop:18}}>
        <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
        <div style={{padding:"40px 0",color:"var(--mut)"}}>Couldn't render this competition. <button className="btn ghost" style={{marginLeft:8,fontSize:13,padding:"5px 12px"}} onClick={()=>go({name:"events"})}>Go back</button></div>
      </div>}>
      <div className="wrap sec" style={{paddingTop:18}}>
      <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
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
            <h1 className="page-title" style={{fontSize:26}}>{ev.name}</h1>
            <div className="evmeta" style={{marginTop:8}}>
              <span><MapPin size={13}/>{ev.country?<CountryTag code={ev.country}/>:"—"}</span>
              <span><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--link)",fontWeight:600}} title="Open calendar" onClick={()=>openCalendarAt(ev.date)}>{formatDate(ev.date)}</span></span>
              {(()=>{const n=nuggetFor(ev.cls,ev.subclass);return <span className="cls" style={{background:n.color}}>{n.label}</span>;})()}
            </div>
            {eventAssocs(ev).length>0&&(
              <div style={{marginTop:7,fontSize:12.5,color:"var(--mut)",display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                <Anchor size={12} style={{flex:"none"}}/>
                <span>Organized by {eventAssocs(ev).map((aid,i)=><React.Fragment key={aid}>
                  {i>0&&<span style={{color:"var(--mut)"}}> & </span>}
                  <b style={{color:"var(--link)",fontWeight:600,cursor:"pointer"}} onClick={()=>enterPortal(aid)}>{assocName(aid)}</b>
                </React.Fragment>)}</span>
              </div>
            )}
            {(ev.imported_by||ev.organizer_name||ev.owner_confirmed===false)&&(()=>{
              const contributor=ev.imported_by&&hostById(ev.imported_by)?.name;
              const isMineUnconfirmed=ev.owner===portal&&ev.owner_confirmed===false&&!isClassPortal;
              const verifiedHere=!!myPortalMembership&&myPortalMembership.verified&&!isClassPortal&&hostById(portal);
              const externalByName=!ev.owner&&!!ev.organizer_name;
              const canClaimHere=verifiedHere&&ev.owner!==portal&&(externalByName||ev.owner_confirmed===false);
              const alreadyClaimed=allEventClaims.some(c=>c.event_id===ev.id&&c.host_id===portal&&c.status==="pending");
              return(
              <div style={{marginTop:7,fontSize:11.5,color:"var(--mut)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span>
                  {contributor&&<>Contributed by <b style={{fontWeight:600}}>{contributor}</b></>}
                  {ev.organizer_name&&<>{contributor?" · ":""}Organized by <b style={{fontWeight:600}}>{ev.organizer_name}</b> (external)</>}
                  {ev.owner_confirmed===false&&ev.owner&&<>{(contributor||ev.organizer_name)?" · ":""}attributed to <b style={{fontWeight:600}}>{assocName(ev.owner)}</b>, awaiting confirmation</>}
                </span>
                {isMineUnconfirmed&&(
                  <button className="btn green" style={{fontSize:11.5,padding:"4px 10px"}} onClick={async()=>{
                    const patch={owner_confirmed:true};
                    setEvents(p=>p.map(x=>x.id===ev.id?{...x,...patch}:x));
                    try{await sbPatch("events",`id=eq.${ev.id}`,patch);}catch(e){console.error("confirm organizer patch",e);}
                  }}><CheckCircle size={12}/>Confirm {hostById(portal).name} organized this</button>
                )}
                {!isMineUnconfirmed&&canClaimHere&&(alreadyClaimed
                  ? <span style={{fontStyle:"italic"}}>Claim pending review for {hostById(portal).name}.</span>
                  : <button className="btn ghost" style={{fontSize:11.5,padding:"4px 10px"}} onClick={()=>submitEventClaim(ev.id,portal)}><Anchor size={12}/>Claim this event for {hostById(portal).name}</button>)}
              </div>);
            })()}
          </div>
          <div style={{flex:"none",display:"flex",flexDirection:"column",justifyContent:"center",gap:8}}>
            {canEdit&&<button className="btn ghost" style={{fontSize:12,padding:"6px 12px",justifyContent:"flex-start"}} onClick={()=>openEditResults(ev)}><Pencil size={13}/>Edit results</button>}
          </div>
        </div>);
      })()}
      {/* Revealable, sponsor-focused competition summary */}
      <div style={{marginBottom:16}}>
        <button onClick={()=>{const open=!eventSummaryOpen[ev.id];setEventSummaryOpen(m=>({...m,[ev.id]:open}));if(open)fetchEventSummary(ev);}}
          style={{display:"inline-flex",alignItems:"center",gap:7,background:"rgba(10,132,255,.12)",backdropFilter:"blur(18px) saturate(185%)",WebkitBackdropFilter:"blur(18px) saturate(185%)",color:"var(--navy)",border:"0",borderRadius:980,boxShadow:"inset 0 1px 0 rgba(255,255,255,.5)",
            fontSize:12.5,fontWeight:600,fontFamily:"'Barlow',sans-serif",padding:"7px 14px",cursor:"pointer"}}>
          <Sparkles size={14}/>About this competition
          <ChevronRight size={14} style={{transform:eventSummaryOpen[ev.id]?"rotate(90deg)":"none",transition:".15s"}}/>
        </button>
        {eventSummaryOpen[ev.id]&&(
          <div style={{marginTop:10,background:"rgba(17,40,66,0.55)",backdropFilter:"blur(28px) saturate(180%)",WebkitBackdropFilter:"blur(28px) saturate(180%)",borderRadius:16,padding:"14px 16px",boxShadow:"inset 0 1px 0 rgba(255,255,255,.16)",animation:"calFade .26s both"}}>
            <p className="seclabel" style={{color:"#9fbdd9",margin:"0 0 6px",fontSize:11}}><Sparkles size={12}/>Competition overview</p>
            {eventSummaries[ev.id]===null
              ? <div style={{color:"#9fbdd9",fontSize:13,fontStyle:"italic",opacity:.75,display:"flex",alignItems:"center",gap:6}}><Loader2 size={13} className="spin"/>Researching this competition…</div>
              : eventSummaries[ev.id]
                ? <p style={{color:"#dce8f8",fontSize:13.5,lineHeight:1.55,margin:0}}>{eventSummaries[ev.id]}</p>
                : <p style={{color:"#9fbdd9",fontSize:13,fontStyle:"italic",margin:0}}>Add ANTHROPIC_API_KEY to Vercel env vars to enable AI summaries.</p>}
            <p style={{color:"#6f93b8",fontSize:10.5,margin:"9px 0 0",fontStyle:"italic"}}>AI-generated from the competition's level and fleet; verify specifics independently.</p>
          </div>
        )}
      </div>
      <div className="panel"><table>
        <thead><tr>
          <th>Pos</th><th className="l">Boat</th><th aria-label="Gender / Division"></th><th className="l">Sail #</th>
          {Array.from({length:s.races}).map((_,i)=><th key={i}>R{i+1}</th>)}
          <th>Net</th>
        </tr></thead>
        <tbody>{s.rows.map(r=>(
          <React.Fragment key={r.sail+r.helm}>
          <tr className={hoverRow?.evId===ev.id&&hoverRow?.helm===r.helm?"row-hover":""}
            onMouseEnter={e=>{
              const rect=e.currentTarget.getBoundingClientRect();
              setHoverRow({evId:ev.id,helm:r.helm,crew:r.crew||null,y:rect.top+rect.height/2});
              const ag=aggregate(r.helm,events);
              fetchHoverSummary(r.helm,ag,r.crew||null);
            }}
            onMouseLeave={()=>setHoverRow(null)}>
            <td className={`rk ${r.rank<=3?"p"+r.rank:""}`}>{r.rank}</td>
            <td className="l"><div className="boat">
              {ev.doublehanded&&r.crew
                ? <div style={{position:"relative",width:48,height:30,flex:"none"}}>
                    {(()=>{const cp=athleteProfileOf(r.crew)?.photo_url;return cp
                      ? <img className="av" src={cp} alt="" style={{position:"absolute",left:18,top:0,objectFit:"cover",boxShadow:"0 0 0 2px #fff"}}/>
                      : <div className="av" style={{position:"absolute",left:18,top:0,background:avatarColor(r.crew),boxShadow:"0 0 0 2px #fff"}}>{initials(r.crew)}</div>;})()}
                    {(()=>{const hp=athleteProfileOf(r.helm)?.photo_url;return hp
                      ? <img className="av" src={hp} alt="" style={{position:"absolute",left:0,top:0,zIndex:2,objectFit:"cover",boxShadow:"0 0 0 2px #fff"}}/>
                      : <div className="av" style={{position:"absolute",left:0,top:0,zIndex:2,background:avatarColor(r.helm),boxShadow:"0 0 0 2px #fff"}}>{initials(r.helm)}</div>;})()}
                  </div>
                : (()=>{const hp=athleteProfileOf(r.helm)?.photo_url;return hp
                    ? <img className="av" src={hp} alt="" style={{objectFit:"cover"}}/>
                    : <div className="av" style={{background:avatarColor(r.helm)}}>{initials(r.helm)}</div>;})()}
              <div>
                <div className="namelink" onClick={()=>go({name:"profile",id:r.helm,fromEvent:ev.id})}>{r.helm}</div>
                {r.crew&&<div className="cn">with <span className="namelink" onClick={()=>go({name:"profile",id:r.crew,fromEvent:ev.id})}>{r.crew}</span></div>}
              </div>
            </div></td>
            <td style={{textAlign:"center",whiteSpace:"nowrap"}}><ResultNuggets entry={r} doublehanded={!!ev.doublehanded}/></td>
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
          </React.Fragment>
        ))}</tbody>
      </table></div>
      <p style={{fontSize:12,color:"var(--mut)",marginTop:12,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><span>( ) = discard · red = penalty code</span></p>
      {hoverRow?.evId===ev.id&&(()=>{
        const k=hoverRow.crew?`${hoverRow.helm}+${hoverRow.crew}`:hoverRow.helm;
        const v=hoverSummaries[hoverRow.helm]??hoverSummaries[k];
        const topPx=Math.min(Math.max((hoverRow.y||0)+14,80),window.innerHeight-120);
        return(
          <div className={`row-ai-tooltip${v===null?" loading":""}`}
            style={{top:topPx}}>
            <Sparkles size={14} style={{flex:"none",marginTop:2,color:"var(--accent)"}}/>
            <span>{v===null?"Generating scout summary…":(v===undefined||v==="")?"AI summary unavailable.":v}</span>
          </div>
        );
      })()}
    </div></ErrorBoundary>);
  })()}

  {/* ── ATHLETES (portal + global) ── */}
  {(portal||(!portal&&(view.name==="athletes"||view.name==="profile")))&&view.name==="athletes"&&(
    <div className="wrap sec" style={{paddingTop:16}}>
      <div className="page-head">
        <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
        <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",width:"100%"}}>
          <h1 className="page-title">{athleteTitle} <span style={{fontSize:18,fontWeight:400,color:"var(--mut)"}}>{lensPeople.length}</span></h1>
          {portal&&<button className="portal-pill" style={{marginLeft:"auto"}} onClick={()=>{setPortal(null);go({name:"athletes"});}}>
            <Users size={14} style={{flex:"none"}}/>All Athletes</button>}
        </div>
        <p className="page-sub">One profile per athlete, built automatically from results.</p>
      </div>
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
                <span style={{fontSize:9.5,fontWeight:600,opacity:.45,marginTop:1}}>{f==="duplicates"?visibleDupGroups.length:lensPeople.length}</span>
              </span>
            </button>
          ));
        })()}</div>
        {canEdit&&filter==="duplicates"&&visibleDupGroups.length>0&&(
          <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"7px 13px",whiteSpace:"nowrap"}} onClick={()=>{
            const keys=visibleDupGroups.map(g=>g.key);
            visibleDupGroups.forEach(g=>mergeGroup(g.names));
            setDismissedDups2(prev=>{const s=new Set(prev);keys.forEach(k=>s.add(k));return s;});
            saveDupDismissals(keys);
          }}>
            <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Users size={14}/>Merge all</div>
          </button>
        )}
      </div>
      {/* Lenses — class chips + country + host (mirrors the Athletes nav menu) */}
      {isGlobal&&(()=>{
        const clsSets={};
        events.forEach(ev=>{if(ev.status==="Draft"||!ev.cls)return;const s2=clsSets[ev.cls]||(clsSets[ev.cls]=new Set());(ev.entries||[]).forEach(e=>{if(e.helm)s2.add(canonName(e.helm));if(e.crew)s2.add(canonName(e.crew));});});
        const customIds=Object.keys(clsSets).filter(id=>!CLASSES.some(c=>c.id===id));
        const chipDefs=[...CLASSES.map(c=>({id:c.id,label:c.short})),...customIds.map(id=>({id,label:classLabel(id)}))];
        const natSet=new Set();cardStats.forEach(v=>{if(v.nat)natSet.add(v.nat);});
        const natList=[...natSet].sort((x,y)=>(GLOBE_NAMES[IOC_ISO[x]]||x).localeCompare(GLOBE_NAMES[IOC_ISO[y]]||y));
        return(
        <div className="strip-chips" style={{margin:"0 0 14px"}}>
          <button className={`lens-chip${!athCls?" on":""}`} onClick={()=>setView(v=>({...v,cls:undefined}))}>All</button>
          {chipDefs.map(c=>{
            const n=clsSets[c.id]?clsSets[c.id].size:0;
            if(!n) return null;
            return(
            <button key={c.id} className={`lens-chip${athCls===c.id?" on":""}`} onClick={()=>setView(v=>({...v,cls:v.cls===c.id?undefined:c.id}))}>
              <span className="dot" style={{background:nuggetFor(c.id).color}}/>{c.label}<span className="cnt">{n}</span>
            </button>);
          })}
          <span className="lens-selwrap">
            <select className="lens-select" value={athCountry||""} onChange={e=>setView(v=>({...v,country:e.target.value||undefined}))}>
              <option value="">All countries</option>
              {natList.map(cc=>(<option key={cc} value={cc}>{iocFlag(cc)} {GLOBE_NAMES[IOC_ISO[cc]]||cc}</option>))}
            </select>
            <ChevronRight size={13} className="lens-selchev"/>
          </span>
          <span className="lens-selwrap">
            <select className="lens-select" value="" onChange={e=>{if(e.target.value)enterPortalAthletes(e.target.value);}}>
              <option value="">By host…</option>
              {navHosts.map(h=>(<option key={h.id} value={h.id}>{h.name}</option>))}
            </select>
            <ChevronRight size={13} className="lens-selchev"/>
          </span>
        </div>);
      })()}
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
              const attrs=ATHLETE_ATTRS.get(canonName(name));
              const nug=attrs?.recentCls?nuggetFor(attrs.recentCls,attrs.recentSub):null;
              const recent=ag.history[0]?.ev;            // most recent competition (history is newest-first)
              const recentYr=recent?.date?.split('/')?.[2]||"";
              return(
                <div className="acard" style={{flex:1,minWidth:0,opacity:dim?.75:1,cursor:"pointer"}} onClick={()=>go({name:"profile",id:name})}>
                  <div className="achead">
                    <div className="av" style={{background:avatarColor(name)}}>{initials(name)}</div>
                    <div style={{minWidth:0,flex:1}}>
                      <div className="acn">{nat?<span style={{fontSize:17}}>{iocFlag(nat)}</span>:null} {name}</div>
                      {nug&&<span className="cls" style={{background:nug.color,fontSize:9.5,padding:"1px 7px",marginTop:3,display:"inline-block"}}>{nug.label}</span>}
                    </div>
                  </div>
                  {recent&&<div style={{fontSize:11,color:"var(--mut)",margin:"0 0 8px",display:"flex",alignItems:"center",gap:5,minWidth:0}}><Trophy size={11} style={{flex:"none"}}/><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{recent.name}{recentYr?` · ${recentYr}`:""}</span></div>}
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
                      onClick={()=>{setDismissedDups2(prev=>{const s=new Set(prev);s.add(key);return s;});saveDupDismissals([key]);}}>Don't merge</button>
                    <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"6px 14px"}}
                      onClick={()=>{mergeGroup(g.names);setDismissedDups2(prev=>{const s=new Set(prev);s.add(key);return s;});saveDupDismissals([key]);}}>
                      <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Users size={14}/>Merge</div>
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
        const shown=lensPeople
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
          const nat=statOf(p.name).nat;
          const key=nat||"ZZZ";
          if(!byCountry[key])byCountry[key]={nat,cname:GLOBE_NAMES[IOC_ISO[nat]]||nat||"Unknown",people:[]};
          byCountry[key].people.push(p);
        });
        const groups=Object.values(byCountry).sort((a,b)=>a.cname.localeCompare(b.cname));
        groups.forEach(g=>g.people.sort((a,b)=>a.name.localeCompare(b.name)));
        if(!shown.length) return <p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No athletes match.</p>;
        let gi=0,rendered=0;                       // cap total cards rendered for fast paint
        const out=[];
        for(const g of groups){
          if(rendered>=athLimit) break;
          const slice=g.people.slice(0,Math.max(0,athLimit-rendered));rendered+=slice.length;
          out.push(
          <div key={g.cname} style={{marginBottom:22}}>
            <div style={{display:"flex",alignItems:"center",gap:9,margin:"4px 0 11px"}}>
              <span style={{fontSize:18}}>{g.nat?iocFlag(g.nat):""}</span>
              <span style={{fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:15,color:"var(--navy)"}}>{g.cname}</span>
              <span style={{fontSize:12,color:"var(--mut)",fontWeight:600}}>{g.people.length}</span>
              <div style={{flex:1,height:1,background:"var(--line)"}}/>
            </div>
            <div className="agrid">
              {slice.map(p=>{
                const st=statOf(p.name);
                const nat=st.nat;
                // Boat-class nugget = most-recent competition's class (ILCA 6 etc. if subclass present)
                const nug=st.recentCls?nuggetFor(st.recentCls,st.recentSub):null;
                return(<div className="acard" key={p.name} style={{animationDelay:`${(Math.min(gi++,40))*12}ms`}} onClick={()=>go({name:"profile",id:p.name})}>
                  <div className="achead">
                    <div className="av" style={{background:avatarColor(p.name)}}>{initials(p.name)}</div>
                    <div style={{minWidth:0,flex:1}}>
                      <div className="acn">{nat?<span style={{fontSize:17}}>{iocFlag(nat)}</span>:null} {p.name}</div>
                    </div>
                  </div>
                  <div className="acstat">
                    <div><b>{st.events}</b>competitions</div><div><b>{st.best?"#"+st.best:"—"}</b>best</div>
                    {nug&&<span className="cls" style={{background:nug.color,fontSize:9.5,marginLeft:"auto"}}>{nug.label}</span>}
                  </div>
                </div>);
              })}
            </div>
          </div>);
        }
        out.push(<div key="__sentinel" ref={athSentinelRef} style={{height:1}}/>);
        return out;
      })()}
    </div>
  )}

  {/* ── PROFILE ── */}
  {(portal||(!portal&&(view.name==="athletes"||view.name==="profile")))&&view.name==="profile"&&(()=>{
    const name=view.id;
    const p=currentPeople.find(x=>x.name===name)||{name};
    const ag=aggregate(name,events);
    const extras=athleteProfileOf(name);                 // owner-set photo/bio/instagram/nat
    const nat=extras?.nat_override||athleteNat(name,events);
    const birthYear=athleteBirthYear(name,events);
    const age=birthYear?(new Date().getFullYear()-birthYear):null;
    return(<ErrorBoundary resetKey={name} fallback={
      <div className="wrap sec" style={{paddingTop:22}}>
        <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
        <div style={{padding:"40px 0",color:"var(--mut)"}}>Couldn't render this profile. <button className="btn ghost" style={{marginLeft:8,fontSize:13,padding:"5px 12px"}} onClick={()=>go({name:"athletes"})}>Go back</button></div>
      </div>}>
      <div className="wrap sec" style={{paddingTop:22}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
        <button className="back" onClick={navBack} style={{marginBottom:0}}><ArrowLeft size={16}/>Back</button>
        {!devMode&&(()=>{
          // Claim-my-profile control. Rules: one claim per user, one claim per
          // profile (denied claims don't count). Any host the athlete competed
          // under can later verify it.
          const lower=(name||"").toLowerCase();
          const uid=auth?.user?.id;
          // Multiple people may have PENDING claims on a profile; only one can be approved.
          const approvedOwner=allClaims.find(c=>c.profile_name?.toLowerCase()===lower&&c.status==="approved");
          const myClaimHere=uid?allClaims.find(c=>c.profile_name?.toLowerCase()===lower&&c.user_id===uid&&c.status!=="denied"):null;
          const myClaimAnywhere=uid?allClaims.find(c=>c.user_id===uid&&c.status!=="denied"):null;
          const pill={marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,fontWeight:700,padding:"7px 13px",borderRadius:980};
          // Guests (signed out) see no claim control at all — keep guest view clean.
          if(!auth) return null;
          // Verified owner of THIS profile → no button (the badge by the name says it).
          if(myClaimHere&&myClaimHere.status==="approved") return null;
          // My own pending claim here.
          if(myClaimHere) return <span style={{...pill,background:"rgba(255,149,0,.14)",color:"#a85c00",boxShadow:"inset 0 0 0 .5px rgba(255,149,0,.4)"}}><Clock size={14}/>Claim pending verification</span>;
          // Someone else is already the verified owner → can't claim.
          if(approvedOwner) return <span style={{...pill,background:"var(--grouped)",color:"var(--mut)"}} title="This profile already has a verified owner."><BadgeCheck size={14}/>Claimed</span>;
          // I already hold a claim on a different profile → one profile per user.
          if(myClaimAnywhere) return <span style={{...pill,background:"var(--grouped)",color:"var(--mut)"}} title="You can only claim one profile.">You've already claimed {myClaimAnywhere.profile_name}</span>;
          return <button className="btn cta liquidGlass-wrapper" style={{marginLeft:"auto"}} onClick={()=>submitClaim(name)}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><BadgeCheck size={15}/>Claim my profile</div></button>;
        })()}
        {isProfileOwner(name)&&<button className="btn ghost" style={{marginLeft:"auto",fontSize:12.5,padding:"7px 13px"}} onClick={()=>setShowAthEdit(name)}><Pencil size={13}/>Edit profile</button>}
      </div>
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
              {/* Left column: photo (50% bigger), then a compact Calendar and Instagram beneath it */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:9,flex:"none"}}>
                {extras?.photo_url
                  ? <img className="av" src={extras.photo_url} alt={name} style={{width:111,height:111,objectFit:"cover"}}/>
                  : <div className="av" style={{background:avatarColor(name),width:111,height:111,fontSize:38}}>{initials(name)}</div>}
                <button style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,width:111,padding:"7px 0",fontSize:12,fontWeight:700,letterSpacing:".02em",marginTop:14,
                  borderRadius:980,cursor:"pointer",transition:"all .2s ease",
                  border:"1px solid rgba(120,160,210,.3)",boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)",
                  background:"rgba(120,160,210,.16)",color:"#cfe0f2"}} onClick={()=>{setSailorCalName(name);setSailorCalClsSet(new Set());setShowSailorCal(true);}}>
                  <Calendar size={13} style={{flex:"none"}}/>Calendar
                </button>
                {((extras?.media?.length>0)||isProfileOwner(name))&&<button style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,width:111,padding:"7px 0",fontSize:12,fontWeight:700,letterSpacing:".02em",
                  borderRadius:980,cursor:"pointer",transition:"all .2s ease",
                  border:"1px solid rgba(120,160,210,.3)",boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)",
                  background:"rgba(120,160,210,.16)",color:"#cfe0f2"}} onClick={()=>setShowMedia(name)}>
                  <LayoutGrid size={13} style={{flex:"none"}}/>Media{extras?.media?.length>0?` (${extras.media.length})`:""}
                </button>}
                {extras?.instagram_url&&<a href={extras.instagram_url} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,width:111,padding:"7px 0",fontSize:12,fontWeight:700,letterSpacing:".02em",
                  borderRadius:980,cursor:"pointer",transition:"all .2s ease",textDecoration:"none",
                  border:"1px solid rgba(120,160,210,.3)",boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)",
                  background:"rgba(120,160,210,.16)",color:"#cfe0f2"}}>
                  <Instagram size={13} style={{flex:"none"}}/>Instagram
                </a>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <h1 className="pname disp" style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    {nat&&<span className="pflag">{iocFlag(nat)}</span>}{name}
                    {profileVerified(name)&&<VerifyBadge verified size={20} title="Verified athlete — claimed & vouched"/>}
                  </span>
                </h1>
                <div className="pmeta">
                  {(()=>{
                    const attrs=ATHLETE_ATTRS.get(canonName(name));
                    const rc=attrs?.recentCls; const rs=attrs?.recentSub;
                    const nug=rc?nuggetFor(rc,rs):(p.cls?nuggetFor(p.cls,null):null);
                    const g=attrs?.gender;
                    return(<>
                      {nug?<span><span className="cls" style={{background:nug.color,fontSize:10.5,padding:"2px 9px"}}>{nug.label}</span></span>:null}
                      {g&&<span><span style={{background:GENDER_COLOR[g]||"var(--mut)",color:"#fff",borderRadius:980,fontSize:10.5,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:"2px 9px"}} title={g==="Mix"?"Mixed":g==="F"?"Female":"Male"}>{g==="Mix"?"Mixed":g==="F"?"Female":"Male"}</span></span>}
                    </>);
                  })()}
                  {age!=null&&<span style={{fontWeight:600}}>Age {age}</span>}
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
                {/* Owner-written bio (verified athlete's own words) */}
                {extras?.bio&&<p style={{color:"#dce8f8",fontSize:13.5,lineHeight:1.55,margin:"16px 0 0",whiteSpace:"pre-wrap"}}>{extras.bio}</p>}
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

            {/* Footprint globe / Athlete web — toggled, with a shrink/reveal swap */}
            {ag.events>0&&hasFootprint&&(
              <div className="globe-wrap" style={{flex:"0 0 260px",maxWidth:"100%"}}>
                <div style={{display:"flex",gap:4,justifyContent:"center",marginBottom:6}}>
                  {[["footprint","Globe",Globe],["web","Web",WebIcon]].map(([k,lab,Ico])=>(
                    <button key={k} onClick={()=>setProfileTab(k)}
                      style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,letterSpacing:".02em",
                        border:"1px solid rgba(120,160,210,.3)",borderRadius:980,padding:"4px 12px",cursor:"pointer",transition:"all .2s ease",
                        boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)",
                        background:profileTab===k?"rgba(146,180,222,.34)":"rgba(120,160,210,.16)",color:profileTab===k?"#fff":"#cfe0f2"}}>
                      <Ico size={12}/>{lab}
                    </button>
                  ))}
                </div>
                <div style={{position:"relative",height:220,overflow:"hidden"}}>
                  <div onClick={()=>setFootprintOpen(true)} title="Click to expand"
                    style={{position:"absolute",inset:0,cursor:"pointer",transition:"opacity .35s ease,transform .35s ease",
                      opacity:profileTab==="footprint"?1:0,transform:profileTab==="footprint"?"scale(1)":"scale(.82)",
                      pointerEvents:profileTab==="footprint"?"auto":"none"}}>
                    <SailingGlobe countryData={countryCounts} height={220} dark bare/>
                    <div className="expand-tip" style={{position:"absolute",top:4,right:6,background:"rgba(8,24,45,.72)",color:"#dcecf8",fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:6,pointerEvents:"none"}}>Click to expand ⤢</div>
                  </div>
                  <div style={{position:"absolute",inset:0,transition:"opacity .35s ease,transform .35s ease",
                      opacity:profileTab==="web"?1:0,transform:profileTab==="web"?"scale(1)":"scale(.82)",
                      pointerEvents:profileTab==="web"?"auto":"none"}}>
                    {profileTab==="web"&&<AthleteWeb name={name} events={events} height={220} dark onOpen={()=>setFootprintOpen(true)} onPick={nm=>go({name:"profile",id:nm})}/>}
                    <div className="expand-tip" style={{position:"absolute",top:4,right:6,background:"rgba(8,24,45,.72)",color:"#dcecf8",fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:6,pointerEvents:"none"}}>Click a node to open ⤢</div>
                  </div>
                </div>
                {/* Caption sits below the globe (not over it) so it clears the sphere + glow. */}
                {profileTab==="footprint"&&<div style={{textAlign:"center",fontSize:10,color:"#7fa0c0",marginTop:10}}>Competition footprint</div>}
              </div>
            )}
          </div>

          {/* expanded footprint popup */}
          {footprintOpen&&hasFootprint&&(
            <FootprintModal name={name} ag={ag} countryCounts={countryCounts} onClose={()=>setFootprintOpen(false)}
              initialTab={profileTab==="web"?"web":"footprint"}
              webProps={{name,events,onPick:nm=>{setFootprintOpen(false);go({name:"profile",id:nm});},onOpenEvent:id=>{setFootprintOpen(false);go({name:"event",id});}}}/>
          )}
        </>);
      })()}
      <div style={{marginTop:22}}>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:10}}>
          <div className="ai-srch-wrap" style={{width:"100%"}}>
            <div className="ai-srch">
              <Sparkles size={13} color={profileFilterLoading?"#0d8ecf":"#9fb2c8"}/>
              <input
                placeholder="Filter results — e.g. top 3 finishes, or 2023 competitions"
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
            {profileSuggestions.length>0&&(<>
              <div style={{position:"fixed",inset:0,zIndex:1}} onClick={()=>setProfileSuggestions([])}/>
              <div className="sug-drop" style={{zIndex:2}}>
                {profileSuggestions.map((s,i)=>(
                  <div key={i} className="sug-item" onClick={()=>{setProfileFilter(s);setProfileSuggestions([]);setTimeout(()=>runProfileFilter(),50);}}>
                    <Sparkles size={11} color="#0d8ecf"/>{s}
                  </div>
                ))}
              </div>
            </>)}
          </div>
          {profileFilterChips.length>0&&(
            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8}}>
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
          // Group into year sections with dividers (same look as the host results list).
          const items=[]; let lastYear=null;
          rows.forEach((h,i)=>{
            const yr=h.ev.date?.split('/')?.[2]||"—";
            if(yr!==lastYear){items.push({type:'divider',year:yr});lastYear=yr;}
            items.push({type:'row',h,i});
          });
          return items.map((item)=>{
            if(item.type==='divider') return(
              <div key={"yr"+item.year} style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0 8px"}}>
                <span style={{fontSize:12,fontWeight:700,color:"var(--mut)",letterSpacing:".1em",fontFamily:"'Barlow',sans-serif"}}>{item.year}</span>
                <div style={{flex:1,height:1,background:"var(--line)"}}/>
              </div>
            );
            const{h,i}=item;
            return(
            <div className="ev" key={h.ev.id+i} style={{animationDelay:`${i*60}ms`}} onClick={()=>go({name:"event",id:h.ev.id})}>
              <div className={`hrk ${h.row.rank<=3?"p"+h.row.rank:""}`} style={{flex:"none"}}>{h.row.rank}<small>of {h.fleet}</small></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
                  <p className="evname" style={{margin:0}}>{h.ev.name}</p>
                  <span className={"rolechip "+h.role.toLowerCase()}>{h.role}</span>
                </div>
                <div className="evmeta" style={{marginTop:3}}>
                  <span><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--link)",fontWeight:600}} onClick={(e)=>{e.stopPropagation();openSailorCalAt(h.ev.date,name);}}>{formatDate(h.ev.date)}</span></span>
                  <span><MapPin size={13}/>{h.ev.country?<CountryTag code={h.ev.country}/>:evLoc(h.ev)}{h.countries>1?<span style={{color:"var(--mut)",marginLeft:6}}>· {h.countries} countries</span>:null}</span>
                  {h.partner?<span><Users size={13}/>with <span className="namelink" onClick={(e)=>{e.stopPropagation();go({name:"profile",id:h.partner});}}>{h.partner}</span></span>:null}
                </div>
                <div className="miniraces">{h.row.races.map((rc2,j)=>{
                  const cls2=isCode(rc2)?"c":h.row.discardSet.has(j)?"d":rc2===1?"g1":rc2===2?"g2":rc2===3?"g3":"";
                  return<div key={j} className={`rc ${cls2}`}>{isCode(rc2)?rc2.slice(0,2):rc2}</div>;
                })}</div>
              </div>
              {(()=>{const n=nuggetFor(h.ev.cls,h.ev.subclass);return n?<span className="cls" style={{background:n.color}}>{n.label}</span>:null;})()}
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
          {pdfLoading&&importStep==="preview"&&(
            <span style={{display:"inline-flex",alignItems:"center",gap:7,marginLeft:10,color:"var(--accent)",fontSize:12.5,fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>
              <Loader2 size={15} className="spin"/>
              {parseProgress.total>1?`Parsing ${parseProgress.done}/${parseProgress.total}…`:"Parsing…"}
            </span>
          )}
          <button className="x" onClick={closeImport}><X size={16}/></button>
        </div>

        {importStep==="upload"&&(<>
          <div className="mtabs">
            <button className={tab==="ai"?"on":""} onClick={()=>setTab("ai")}><Sparkles size={15}/>AI parser</button>
            <button className={tab==="manual"?"on":""} onClick={()=>setTab("manual")}><ClipboardPaste size={15}/>Manual entry</button>
          </div>
          {(()=>{const dropMode=tab==="rule"?"rule":"ai";const dropActive=tab!=="manual"&&dragDepth>0&&!pdfLoading;return(
          <div className="mbody" style={{position:"relative"}}
            onDragEnter={tab!=="manual"?onDragEnter:undefined}
            onDragOver={tab!=="manual"?onDragOver:undefined}
            onDragLeave={tab!=="manual"?onDragLeave:undefined}
            onDrop={tab!=="manual"?(e=>onDropFiles(e,dropMode)):undefined}>
            {dropActive&&(
              <div style={{position:"absolute",inset:10,zIndex:60,borderRadius:14,border:"2px dashed var(--accent)",
                background:"var(--sky)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:10,color:"var(--navy)",pointerEvents:"none"}}>
                <Upload size={28} color="var(--accent)"/>
                <span style={{fontSize:15,fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>Drop files to {dropMode==="rule"?"parse":"import"}</span>
              </div>
            )}
            {tab==="rule"&&(<>
              <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 14px",lineHeight:1.55}}>For known formats — <strong style={{color:"var(--ink)"}}>Sailwave</strong>, Sailwave HTML, <strong style={{color:"var(--ink)"}}>Manage2sail</strong>, SailingResults.net and Clubspot. Fast and exact, no AI. Select one or more PDF/HTML files; multi-fleet files split into a tab per fleet. If a file isn't recognised, switch to the AI parser.</p>
              <label className="btn cta" style={{cursor:"pointer"}}>
                {pdfLoading?<><Loader2 size={16} className="spin"/>Parsing…</>:<><Upload size={16}/>Choose files</>}
                <input type="file" multiple accept={IMPORT_ACCEPT} style={{display:"none"}} disabled={pdfLoading} onChange={e=>handleFiles(e.target.files,"rule")}/>
              </label>
              <span style={{fontSize:12,color:"var(--mut)",marginLeft:10}}>…or drag &amp; drop files anywhere here</span>
              {pdfError&&<div className="prev err" style={{marginTop:14}}><AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:5}}/>{pdfError}</div>}
            </>)}
            {tab==="ai"&&(<>
              <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 14px",lineHeight:1.55}}>The catch-all. Drop in <strong style={{color:"var(--ink)"}}>anything</strong> — odd PDFs, photos or screenshots of a results sheet, or a whole batch at once. Known formats are read by the built-in parser; the rest go to <strong style={{color:"var(--ink)"}}>Claude AI</strong>. Review every AI-parsed result before publishing.</p>
              <label className="btn cta" style={{cursor:"pointer"}}>
                {pdfLoading?<><Loader2 size={16} className="spin"/>Working…</>:<><Sparkles size={16}/>Choose files</>}
                <input type="file" multiple accept={IMPORT_ACCEPT} style={{display:"none"}} disabled={pdfLoading} onChange={e=>handleFiles(e.target.files,"ai")}/>
              </label>
              <span style={{fontSize:12,color:"var(--mut)",marginLeft:10}}>…or drag &amp; drop files anywhere here</span>
              <div style={{margin:"16px 0 6px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,height:1,background:"var(--line)"}}/>
                <span style={{fontSize:11,fontWeight:700,letterSpacing:".06em",color:"var(--mut)",textTransform:"uppercase"}}>or paste a results link</span>
                <div style={{flex:1,height:1,background:"var(--line)"}}/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <div style={{flex:1,display:"flex",alignItems:"center",gap:8,border:"1px solid var(--line)",borderRadius:9,padding:"0 11px",background:"#fff"}}>
                  <Link2 size={15} color="#9fb2c8" style={{flex:"none"}}/>
                  <input value={liveUrl} onChange={e=>setLiveUrl(e.target.value)} disabled={pdfLoading}
                    onKeyDown={e=>{if(e.key==="Enter"&&liveUrl.trim()&&!pdfLoading)handleLink(liveUrl,"ai");}}
                    placeholder="https://… Manage2sail / Clubspot / Sailwave results page"
                    style={{flex:1,border:0,outline:"none",font:"inherit",fontSize:13,padding:"10px 0",background:"transparent"}}/>
                </div>
                <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"9px 15px",flex:"none"}} disabled={pdfLoading||!liveUrl.trim()} onClick={()=>handleLink(liveUrl,"ai")}>
                  <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{pdfLoading?<Loader2 size={15} className="spin"/>:<>Fetch &amp; parse</>}</div>
                </button>
              </div>
              <p style={{fontSize:11.5,color:"var(--mut)",margin:"8px 0 0",lineHeight:1.5}}>Parsing the page's source is usually more accurate than a PDF. The link is fetched on our server (your browser can't, due to cross-origin rules).</p>
              {pdfError&&<div className="prev err" style={{marginTop:14}}><AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:5}}/>{pdfError}</div>}
            </>)}
            {(tab==="rule"||tab==="ai")&&(pdfLoading||parseLog.length>0)&&(
              <div style={{marginTop:16,border:"1px solid var(--line)",borderRadius:11,background:"#f7fafd",padding:"13px 15px"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:parseProgress.total>0?9:0}}>
                  {pdfLoading?<Loader2 size={14} className="spin" color="var(--accent)"/>:<CheckCircle size={14} color="#0f8a7e"/>}
                  <span style={{fontSize:12.5,fontWeight:700,color:"var(--navy)",fontFamily:"'Barlow',sans-serif"}}>
                    {pdfLoading?(tab==="ai"?"AI is reading your files…":"Parsing…"):"Finished"}
                  </span>
                  {parseProgress.total>0&&<span style={{marginLeft:"auto",fontSize:11.5,color:"var(--mut)",fontWeight:600}}>{parseProgress.done}/{parseProgress.total}</span>}
                </div>
                {parseProgress.total>0&&(
                  <div style={{height:6,borderRadius:4,background:"#e3edf6",overflow:"hidden",marginBottom:11}}>
                    <div style={{height:"100%",width:`${Math.round((parseProgress.done/Math.max(parseProgress.total,1))*100)}%`,background:"linear-gradient(90deg,var(--accent),#0f8a7e)",borderRadius:4,transition:"width .3s ease"}}/>
                  </div>
                )}
                <div style={{display:"flex",flexDirection:"column",gap:7,maxHeight:190,overflowY:"auto"}}>
                  {parseLog.map((l,li)=>(
                    <div key={li} style={{fontSize:12,lineHeight:1.5}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        {l.status==="parsing"?<Loader2 size={12} className="spin" color="var(--accent)" style={{flex:"none"}}/>
                          :l.status==="error"?<AlertCircle size={12} color="#c0392b" style={{flex:"none"}}/>
                          :l.status==="ok"?<CheckCircle size={12} color="#0f8a7e" style={{flex:"none"}}/>
                          :<Clock size={12} color="#9fb2c8" style={{flex:"none"}}/>}
                        <span style={{fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.name}</span>
                      </div>
                      {(l.notes||[]).length>0&&(
                        <div style={{paddingLeft:18,color:l.status==="error"?"#c0392b":"var(--mut)"}}>
                          {l.notes.map((n,ni)=><div key={ni} style={{display:"flex",gap:5}}><span style={{opacity:.5}}>›</span><span>{n}</span></div>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {tab==="manual"&&(<>
              {(()=>{const evCls=assoc?.cls||mf.cls;return(<>
              <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:200}}>
                  <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600}}>Competition name</label>
                  <input value={mf.name} onChange={e=>updMeta("name",e.target.value)} placeholder="2025 29er Asian Championship" style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/>
                </div>
              </div>
              {SUBCLASSES[evCls]&&<div style={{marginBottom:12}}>
                <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600}}>Class type</label>
                <div style={{display:"inline-flex",gap:6,flexWrap:"wrap"}}>
                  {SUBCLASSES[evCls].map(s=>{
                    const on=mf.subclass===s.id;
                    return <button key={s.id} type="button" onClick={()=>updMeta("subclass",on?null:s.id)}
                      style={{border:"1px solid "+(on?s.color:"var(--line)"),background:on?s.color:"transparent",
                        color:on?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Barlow',sans-serif",
                        padding:"5px 11px",cursor:"pointer",transition:".12s"}}>{s.label}</button>;
                  })}
                </div>
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
              <CollabPicker owner={portal} value={mf.collabs} onChange={v=>updMeta("collabs",v)}/>
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
                <button className="btn cta liquidGlass-wrapper" disabled={!manualReady} onClick={doImportManual}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Upload size={16}/>Import competition</div></button>
              </div>
            </>)}
          </div>);})()}
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
          // Associations may only host their own class; clubs (and edit mode) host any.
          const classLocked=!!assoc&&!editResultsEv;
          // Detect fleet groups in pending (same fleetGroupId = same multi-fleet source file)
          const fleetGroupIds=[...new Set(pending.filter(p=>p.fleetGroupId).map(p=>p.fleetGroupId))];
          // Days on which the importing host already has competitions — reference/collision
          // info for the date picker. Keyed by the event's DD/MM/YYYY date → competition names.
          // Scope to the resolved host (self-organizing importer, else attributed host); if
          // none is resolved yet, no dots are shown.
          const _dpHost=_pvResolvedHost;
          const markedDays=(()=>{
            if(!_dpHost) return {};
            const out={};
            events.forEach(ev=>{
              if(!ev.date) return;
              const isHosts=ev.owner===_dpHost||(ev.collabs||[]).includes(_dpHost)||ev.imported_by===_dpHost;
              if(!isHosts) return;
              const m=String(ev.date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
              if(!m) return;
              const key=`${+m[1]}/${+m[2]}/${+m[3]}`;
              (out[key]=out[key]||[]).push(ev.name||"Competition");
            });
            return out;
          })();
          return(<div className="mbody has-actionbar">
            {/* ── Pending result tabs (multi-file import) ── */}
            {pending.length>1&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,borderBottom:"1px solid var(--line)",paddingBottom:10}}>
                {pending.map((p,i)=>(
                  <span key={p.id}
                    style={{display:"inline-flex",alignItems:"center",gap:6,maxWidth:220,border:"1px solid "+(i===activePending?"var(--accent)":"var(--line)"),
                      background:i===activePending?"var(--accent)":(p.status==="error"?"#fdeceA":"#fff"),color:i===activePending?"#fff":(p.status==="error"?"#b3261e":"var(--navy)"),
                      borderRadius:8,padding:"6px 6px 6px 10px",fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden"}}>
                    <button onClick={()=>switchPending(i)} title="Edit this result"
                      style={{display:"inline-flex",alignItems:"center",gap:6,maxWidth:170,background:"none",border:0,padding:0,margin:0,cursor:"pointer",color:"inherit",font:"inherit",fontWeight:600,overflow:"hidden"}}>
                      {p.status==="error"?<AlertCircle size={12} style={{flex:"none"}}/>:p.status==="parsing"?<Loader2 size={12} className="spin" style={{flex:"none"}}/>:<FileText size={12} style={{flex:"none"}}/>}
                      <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{p.previewEv?.name||p.name}</span>
                    </button>
                    <button onClick={()=>removePending(i)} title="Remove this result from the import"
                      style={{flex:"none",display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,borderRadius:5,border:0,cursor:"pointer",
                        background:i===activePending?"rgba(255,255,255,.22)":"transparent",color:i===activePending?"#fff":"#9aa7b6"}}>
                      <X size={12}/>
                    </button>
                  </span>
                ))}
                {/* Combine fleets button — shown per fleet group */}
                {fleetGroupIds.map(gid=>{
                  const gItems=pending.filter(p=>p.fleetGroupId===gid);
                  if(gItems.length<2) return null;
                  // Event title = longest common prefix of the fleet names, trimmed
                  // of any trailing separator (e.g. "29er World Championship — 1-Gold"
                  // + "… — 2-Silver" → "29er World Championship").
                  const names=gItems.map(p=>p.previewEv?.name||p.name||"");
                  let base=names[0]||"";
                  for(const n of names){let k=0;while(k<base.length&&k<n.length&&base[k]===n[k])k++;base=base.slice(0,k);}
                  base=base.replace(/[\s–—\-—–:,#]+$/,"").trim()||"this competition";
                  return(
                    <button key={gid} onClick={()=>combineFleetGroup(gid)}
                      title={`Merge all ${gItems.length} fleets of ${base} into one combined result`}
                      style={{display:"inline-flex",alignItems:"center",gap:5,border:"1px dashed var(--accent)",background:"#f0f8ff",color:"var(--accent)",
                        borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                      <Trophy size={12} style={{flex:"none"}}/>Combine all “{base}” fleets
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
                <span style={{fontSize:11,color:"#6278b5"}}>— This result was parsed by Claude AI. Review all cells before publishing.</span>
              </div>}
              <div><label>Competition name</label><input value={previewEv.name||""} onChange={e=>updPMeta("name",e.target.value)} className={!previewEv.name?"pmissing":""} placeholder="Competition name"/></div>
              <div><label>Date</label><DateField value={previewEv.date||""} onChange={v=>updSharedMeta("date",v)} className={!previewEv.date?"pmissing":""} markedDays={markedDays} dotColor={classColor(evCls)||"var(--navy2)"}/></div>
              <div><label>Host Country</label><CountrySelect value={previewEv.venue||""} onChange={v=>updSharedMeta("venue",v)}/></div>
              <div><label>Discards</label><input type="number" min="0" max="20" value={previewEv.discards||1} onChange={e=>updPMeta("discards",parseInt(e.target.value)||1)}/></div>
            </div>
            {/* ── Web-lookup suggestion strip: low-confidence date/country found
                 online for a document that printed none. Never auto-applied —
                 Apply writes through updSharedMeta (same setter as the manual
                 inputs, so fleet-tab sync keeps working). Dismissible. ── */}
            {(()=>{
              const sug=active&&enrichSug[active.id];
              if(!sug||sug.dismissed) return null;
              // Only offer a value the field still lacks (and that was found).
              const showDate=sug.date&&!String(previewEv.date||"").trim();
              const showCty=sug.country&&!String(previewEv.venue||"").trim();
              if(!showDate&&!showCty) return null;
              let domain="";
              try{domain=sug.source?new URL(sug.source).hostname.replace(/^www\./,""):"";}catch{domain="";}
              const dismiss=()=>setEnrichSug(s=>({...s,[active.id]:{...s[active.id],dismissed:true}}));
              return(
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10,fontSize:12,
                  color:"var(--navy2)",background:"var(--sky)",backdropFilter:"blur(20px) saturate(160%)",WebkitBackdropFilter:"blur(20px) saturate(160%)",
                  border:"0",borderRadius:12,padding:"8px 12px",boxShadow:"inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 0 .5px rgba(31,78,128,.18)"}}>
                  <Search size={13} style={{flex:"none",opacity:.75}}/>
                  <span>Web lookup <span style={{opacity:.7}}>(unconfirmed)</span>:</span>
                  {showDate&&(
                    <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                      <b style={{fontWeight:700}}>{sug.date}</b>
                      <button type="button" onClick={()=>updSharedMeta("date",sug.date)}
                        style={{border:"1px solid var(--navy2)",background:"transparent",color:"var(--navy2)",borderRadius:6,fontSize:11,fontWeight:600,padding:"2px 8px",cursor:"pointer"}}>Apply</button>
                    </span>
                  )}
                  {showDate&&showCty&&<span style={{opacity:.5}}>·</span>}
                  {showCty&&(
                    <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                      <b style={{fontWeight:700}}>{sug.country}</b>
                      <button type="button" onClick={()=>updSharedMeta("venue",sug.country)}
                        style={{border:"1px solid var(--navy2)",background:"transparent",color:"var(--navy2)",borderRadius:6,fontSize:11,fontWeight:600,padding:"2px 8px",cursor:"pointer"}}>Apply</button>
                    </span>
                  )}
                  {domain&&<span style={{opacity:.6}}>— from {domain}</span>}
                  <button type="button" onClick={dismiss} title="Dismiss"
                    style={{marginLeft:"auto",flex:"none",display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:5,border:0,background:"transparent",color:"var(--navy2)",cursor:"pointer",opacity:.7}}>
                    <X size={13}/>
                  </button>
                </div>
              );
            })()}
            {/* ── Two-column: boat classes (left) · organiser controls (right) ── */}
            <div style={{display:"flex",gap:20,flexWrap:"wrap",alignItems:"flex-start",marginBottom:10}}>
              {/* LEFT — per-result class selector (reshapes the table). Subclass options
                  (ILCA/Optimist) are revealed on hover/focus of the parent class button. */}
              <div style={{flex:"1 1 300px",minWidth:260}}>
                <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600}}>Boat class{classLocked&&<span style={{fontWeight:500,opacity:.7}}> — fixed to {assoc.name}'s class</span>}</label>
                <div style={{display:"inline-flex",gap:6,flexWrap:"wrap"}}>
                  {CLASSES.map(c=>{
                    const on=evCls===c.id;
                    const disabled=classLocked&&c.id!==assoc.cls;
                    const btn=<button type="button" disabled={disabled}
                      onClick={()=>{if(disabled)return;updPMeta("cls",c.id);updMeta("subclass",null);}}
                      style={{border:"1px solid "+(on?classColor(c.id):"var(--line)"),background:on?classColor(c.id):"transparent",
                        color:on?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:"5px 11px",
                        cursor:disabled?"not-allowed":"pointer",opacity:disabled?.35:1}}>{c.short}</button>;
                    return SUBCLASSES[c.id]
                      ? <SubclassHover key={c.id} cls={c.id} value={mf.subclass} active={on&&!disabled}
                          onChange={v=>updMeta("subclass",v)} classBtn={btn}/>
                      : <React.Fragment key={c.id}>{btn}</React.Fragment>;
                  })}
                  <CustomClassPicker classes={customClasses} value={evCls} disabled={classLocked}
                    onSelect={id=>{updPMeta("cls",id);updMeta("subclass",null);}}
                    onAdd={name=>addCustomClass(name)}/>
                </div>
              </div>
              {/* RIGHT — organiser controls (self-organized / host picker / free-text) */}
              {!editResultsEv&&(()=>{
                const importerHost=(portal&&!isClassPortal)?portal:null;
                const orgMode=previewEv._orgMode||"self";
                const external=!importerHost||orgMode==="external";
                const allHosts=[...ASSOCIATIONS,...CLUBS,...FEDERATIONS];
                return <div style={{flex:"1 1 260px",minWidth:260}}>
                  <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600}}>Organizer</label>
                  {importerHost&&<div style={{display:"inline-flex",gap:6,marginBottom:external?8:0,flexWrap:"wrap"}}>
                    {[["self",`We organized this — ${hostById(importerHost)?.name||"this host"}`],["external","Another organizer"]].map(([m,lbl])=>(
                      <button key={m} type="button" onClick={()=>updSharedMeta("_orgMode",m)}
                        style={{border:"1px solid "+(orgMode===m?"var(--navy)":"var(--line)"),background:orgMode===m?"var(--navy)":"transparent",
                          color:orgMode===m?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:"5px 11px",cursor:"pointer"}}>{lbl}</button>
                    ))}
                  </div>}
                  {external&&<div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                    <HostPicker hosts={allHosts} value={previewEv._orgHost||null}
                      onChange={id=>{updSharedMeta("_orgHost",id||null);if(id)updSharedMeta("_orgName","");}}
                      orgName={previewEv._orgName||""} onOrgName={v=>updSharedMeta("_orgName",v)}/>
                  </div>}
                  <p style={{fontSize:11.5,color:"var(--mut)",marginTop:6}}>
                    {external
                      ?"This competition will be filed as externally contributed — it stays off your page and the organizer can claim it later."
                      :"You'll be recorded as the organizer; the competition appears on your page."}
                  </p>
                </div>;
              })()}
            </div>
            <div style={{marginBottom:10}}>
              <CollabPicker owner={editResultsEv?previewEv.owner:portal} value={mf.collabs} onChange={v=>updSharedCollabs(v)}/>
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
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 6px",textAlign:"center",fontSize:11,minWidth:160}}>Gender / Div</th>
                    {Array.from({length:maxR}).map((_,i)=><th key={i} style={{background:"var(--navy)",color:"#fff",padding:"9px 4px",textAlign:"center",fontSize:11,minWidth:34}}>R{i+1}</th>)}
                    <th style={{background:"#1a4a7a",color:"#fff",padding:"9px 6px",textAlign:"center",fontSize:11}}>Net</th>
                    <th style={{background:"var(--navy)",width:32,padding:"9px 4px"}} aria-label=""></th>
                  </tr>
                </thead>
                <tbody>
                  {previewEv.entries
                    .map((entry,idx)=>{const scoredRow=scored?.rows.find(r=>r.helm===entry.helm&&r.sail===entry.sail);return{entry,idx,scoredRow,rank:scoredRow?.rank,net:scoredRow?.net};})
                    .sort((a,b)=>{if(a.rank==null&&b.rank==null)return a.idx-b.idx;if(a.rank==null)return 1;if(b.rank==null)return -1;return a.rank-b.rank;})
                    .map(({entry,idx,scoredRow,rank,net})=>{
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
                        <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"center"}}>
                          <DivisionToggle value={divFromEntry(entry)} onChange={v=>applyPreviewDiv(idx,v)} noMix={singleHanded}/>
                        </div>
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
                      <td style={{textAlign:"center",padding:"4px 2px",width:32}}>
                        <button type="button" title="Remove this athlete"
                          onClick={()=>setPreviewEv(ev=>({...ev,entries:ev.entries.filter((_,i)=>i!==idx)}))}
                          style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,padding:0,border:"1px solid transparent",borderRadius:6,background:"transparent",color:"var(--mut)",cursor:"pointer",transition:".12s"}}
                          onMouseEnter={e=>{e.currentTarget.style.color="#c0392b";e.currentTarget.style.background="rgba(192,57,43,.08)";e.currentTarget.style.borderColor="rgba(192,57,43,.25)";}}
                          onMouseLeave={e=>{e.currentTarget.style.color="var(--mut)";e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}>
                          <Trash2 size={13}/>
                        </button>
                      </td>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>
            <p style={{fontSize:11.5,color:"var(--mut)",margin:"8px 0 0"}}>Scores in ( ) are discards · red = penalty · click any cell to edit · Net updates live</p>
            <div className="import-actionbar">
              <button className="btn ghost" disabled={!!savingResults} onClick={async()=>{if(savingResults)return;setSavingResults("draft");try{await (editResultsEv?saveEditedResults(true):importPreview(true));}finally{setSavingResults(null);}}}>{savingResults==="draft"?<Loader2 size={16} className="spin"/>:<Clock size={16}/>}Save as Draft</button>
              <button className="btn cta liquidGlass-wrapper" disabled={!!savingResults} onClick={async()=>{if(savingResults)return;setSavingResults("publish");try{await (editResultsEv?saveEditedResults(false):importPreview(false));}finally{setSavingResults(null);}}}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{savingResults==="publish"?<Loader2 size={16} className="spin"/>:<CheckCircle size={16}/>}{editResultsEv?"Save changes":(pending.length>1?"Publish this result":"Confirm & Publish")}</div></button>
            </div>
            </>)}
          </div>);
        })()}
      </div>
    </div>
  )}

  {/* ── RACE CALENDAR MODAL ── */}
  {showCalendar&&(()=>{
    // Scope to a portal when opened from one, else all events.
    const sp=calScopePortal;
    const isClsScope=typeof sp==="string"&&sp.startsWith("class:");
    const scopeName=!sp?"Global"
      :isClsScope?`All ${classLabel(sp.slice(6))} Results`
      :(hostById(sp)?.name||"Global");
    const scopeEvents=!sp?events
      :isClsScope?events.filter(ev=>ev.cls===sp.slice(6))
      :events.filter(ev=>{
          // Your portal shows events you ORGANIZED (and that organizer status is
          // confirmed) plus events you co-organize. Externally-contributed events
          // (where you're only imported_by, or an unconfirmed attributed owner)
          // stay out of the portal and live in global calendar/search until claimed.
          if(ev.owner===sp) return ev.owner_confirmed!==false;
          return (ev.collabs||[]).includes(sp)||governingFeds(ev).map(f=>f.id).includes(sp);
        });
    const calEvs=scopeEvents.filter(ev=>calClsSet.size===0||calClsSet.has(ev.cls));
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
          {/* Header: back button above the title; x vertically centered */}
          <div className="cal-head" style={{alignItems:"center"}}>
            <div style={{flex:1,minWidth:0}}>
              <button className="cal-back" onClick={()=>setShowCalendar(false)}><ArrowLeft size={15}/>Back</button>
              <h3 style={{marginTop:6}}>{scopeName} Calendar</h3>
            </div>
            <button className="x" onClick={()=>setShowCalendar(false)}><X size={16}/></button>
          </div>
          {/* Toolbar: month/day toggle + competition count + floating class pills */}
          <div className="cal-toolbar">
            <button className="cal-viewtoggle" onClick={()=>setCalViewMode(v=>v==="year"?"month":"year")} title={calViewMode==="year"?"Switch to month view":"Switch to year view"}>
              {calViewMode==="year"?<LayoutGrid size={13}/>:<Calendar size={13}/>}
              <span id="cal-cur-label">{calViewMode==="year"?String(calYear):`${MON[calMonth]} ${calYear}`}</span>
            </button>
            <span style={{fontSize:13,fontWeight:700,color:"var(--navy)",fontFamily:"'Barlow',sans-serif"}}>
              {calEvs.length} competition{calEvs.length!==1?"s":""}{calClsSet.size>0?" shown":""}
            </span>
            <div className="cal-cls-box" style={{marginLeft:"auto"}}>
              <button className={`cal-cls-mini${calClsSet.size===0?" on":""}`} onClick={()=>toggleCls("all")}
                style={calClsSet.size===0?{background:"var(--navy)",color:"#fff",borderColor:"var(--navy)"}:{}}>All</button>
              {CLASSES.map(({id,short})=>{const on=calClsSet.has(id);return(
                <button key={id} className={`cal-cls-mini${on?" on":""}`} onClick={()=>toggleCls(id)}
                  style={on?{background:classColor(id),color:"#fff",borderColor:classColor(id)}:{color:classColor(id),borderColor:classColorA(id,.5)}}>{short}</button>);})}
            </div>
          </div>
          <CalendarBody events={calEvs} allEvents={scopeEvents} year={calYear} month={calMonth}
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
          <div className="cal-head" style={{alignItems:"center"}}>
            <div style={{flex:1,minWidth:0}}>
              <button className="cal-back" onClick={()=>setShowSailorCal(false)}><ArrowLeft size={15}/>Back</button>
              <h3 style={{marginTop:6}}>{sailorCalName} — Calendar</h3>
            </div>
            <button className="x" onClick={()=>setShowSailorCal(false)}><X size={16}/></button>
          </div>
          <div className="cal-toolbar">
            <button className="cal-viewtoggle" onClick={()=>setSailorCalViewMode(v=>v==="year"?"month":"year")} title={sailorCalViewMode==="year"?"Switch to month view":"Switch to year view"}>
              {sailorCalViewMode==="year"?<LayoutGrid size={13}/>:<Calendar size={13}/>}
              <span id="cal-cur-label">{sailorCalViewMode==="year"?String(sailorCalYear):`${MON[sailorCalMonth]} ${sailorCalYear}`}</span>
            </button>
            <span style={{fontSize:13,fontWeight:700,color:"var(--navy)",fontFamily:"'Barlow',sans-serif"}}>
              {sailorEvs.length} competition{sailorEvs.length!==1?"s":""}{sailorCalClsSet.size>0?" shown":""}
            </span>
            <div className="cal-cls-box" style={{marginLeft:"auto"}}>
              <button className={`cal-cls-mini${sailorCalClsSet.size===0?" on":""}`} onClick={()=>toggleSCls("all")}
                style={sailorCalClsSet.size===0?{background:"var(--navy)",color:"#fff",borderColor:"var(--navy)"}:{}}>All</button>
              {CLASSES.map(({id,short})=>{const on=sailorCalClsSet.has(id);return(
                <button key={id} className={`cal-cls-mini${on?" on":""}`} onClick={()=>toggleSCls(id)}
                  style={on?{background:classColor(id),color:"#fff",borderColor:classColor(id)}:{color:classColor(id),borderColor:classColorA(id,.5)}}>{short}</button>);})}
            </div>
          </div>
          <CalendarBody events={sailorEvs} allEvents={baseEvs} year={sailorCalYear} month={sailorCalMonth}
            setYear={setSailorCalYear} setMonth={setSailorCalMonth} viewMode={sailorCalViewMode} setViewMode={setSailorCalViewMode}
            onPick={(ev)=>{setShowSailorCal(false);setPortal(ev.owner||null);go({name:"event",id:ev.id});}}
            eventLabel={(ev)=>{const e=ev.entries.find(e=>e.helm===sailorCalName||e.crew===sailorCalName);const s=scoreEvent(ev);const row=e?s.rows.find(r=>r.helm===e.helm&&r.sail===e.sail):null;return (row?`#${row.rank} `:"")+ev.name;}}/>
        </div>
      </div>
    );
  })()}

  {hostFootprintOpen&&portal&&(
    <ErrorBoundary resetKey={portal} fallback={<div className="ov" onClick={()=>setHostFootprintOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440,padding:24,textAlign:"center"}}><p style={{margin:"0 0 14px",fontWeight:600}}>Couldn't open this host's map.</p><button className="btn cta liquidGlass-wrapper" onClick={()=>setHostFootprintOpen(false)}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Close</div></button></div></div>}>
      <FootprintModal name={portalName} ag={{history:hostHistory}} countryCounts={hostCountryCounts} hostMode titleSuffix="Competitions" onClose={()=>setHostFootprintOpen(false)}/>
    </ErrorBoundary>
  )}
  {regattaFootprint&&(
    <ErrorBoundary resetKey={regattaFootprint.id}
      fallback={<div className="ov" onClick={()=>setRegattaFootprint(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440,padding:24,textAlign:"center"}}><p style={{margin:"0 0 14px",color:"var(--ink)",fontWeight:600}}>Couldn't open this competition's map.</p><button className="btn cta liquidGlass-wrapper" onClick={()=>setRegattaFootprint(null)}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Close</div></button></div></div>}>
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
        <div className="mhead"><Pencil size={17}/><h3>Edit competition details</h3><button className="x" onClick={()=>setEditEvMeta(null)}><X size={16}/></button></div>
        <div className="mbody">
          <div className="meta-grid" style={{gridTemplateColumns:"1fr"}}>
            <div><label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Competition name</label>
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
            <button className="btn cta liquidGlass-wrapper" onClick={saveEvMeta}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><CheckCircle size={15}/>Save changes</div></button>
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
  {showAddHost&&(
    <div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAddHost(false);}} style={{position:"fixed",inset:0,background:"rgba(8,20,40,.55)",zIndex:90,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"60px 16px",overflow:"auto"}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:460,width:"100%",boxShadow:"0 24px 60px -20px rgba(0,0,0,.4)"}}>
        <div style={{background:"var(--navy)",color:"#fff",padding:"16px 20px",borderRadius:"14px 14px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <strong style={{fontSize:16}}>Add a host</strong>
          <button onClick={()=>setShowAddHost(false)} style={{border:0,background:"rgba(255,255,255,.15)",color:"#fff",borderRadius:8,padding:6,cursor:"pointer",display:"flex"}}><X size={16}/></button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:5}}>Type</label>
            <div style={{display:"flex",gap:6}}>
              {[["association","Association"],["club","Club"],["federation","Federation"]].map(([v,l])=>(
                <button key={v} type="button" onClick={()=>setNewHost(h=>({...h,type:v}))}
                  style={{flex:1,border:"1px solid "+(newHost.type===v?"var(--accent)":"var(--line)"),background:newHost.type===v?"var(--accent)":"#fff",color:newHost.type===v?"#fff":"var(--navy)",borderRadius:8,padding:"7px 8px",fontSize:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:5}}>Name</label>
            <input value={newHost.name} onChange={e=>setNewHost(h=>({...h,name:e.target.value}))} placeholder="e.g. Aberdeen Boat Club"
              style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"9px 11px",font:"inherit",fontSize:13,outline:"none"}}/>
          </div>
          <div style={{display:"flex",gap:12}}>
            <div style={{flex:1}}>
              <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:5}}>Region</label>
              <div style={{display:"flex",gap:6}}>
                {[["HK","Hong Kong"],["INT","International"]].map(([v,l])=>(
                  <button key={v} type="button" onClick={()=>setNewHost(h=>({...h,scope:v}))}
                    style={{flex:1,border:"1px solid "+(newHost.scope===v?"var(--accent)":"var(--line)"),background:newHost.scope===v?"var(--sky)":"#fff",color:"var(--navy)",borderRadius:8,padding:"7px 8px",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>{l}</button>
                ))}
              </div>
            </div>
            {newHost.type==="association"&&<div style={{flex:1}}>
              <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:5}}>Boat class</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                {CLASSES.map(c=>(
                  <button key={c.id} type="button" onClick={()=>setNewHost(h=>({...h,cls:c.id}))}
                    style={{border:"1px solid "+(newHost.cls===c.id?classColor(c.id):"var(--line)"),background:newHost.cls===c.id?classColor(c.id):"#fff",color:newHost.cls===c.id?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,padding:"5px 9px",cursor:"pointer"}}>{c.short}</button>
                ))}
                <CustomClassPicker classes={customClasses}
                  value={CLASSES.some(c=>c.id===newHost.cls)?null:newHost.cls}
                  onSelect={id=>setNewHost(h=>({...h,cls:id}))}
                  onAdd={name=>addCustomClass(name)}/>
              </div>
            </div>}
            {newHost.type==="federation"&&<div style={{flex:1}}>
              <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:5}}>Governing country (IOC)</label>
              <input value={newHost.country} onChange={e=>setNewHost(h=>({...h,country:e.target.value.toUpperCase().slice(0,3)}))} placeholder="HKG" maxLength={3}
                style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"9px 11px",font:"inherit",fontSize:13,outline:"none",textTransform:"uppercase"}}/>
            </div>}
          </div>
          {newHost.type==="federation"&&<p style={{fontSize:11.5,color:"var(--mut)",margin:0}}>Federations auto-collaborate on every competition hosted in their country.</p>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:4}}>
            <button className="btn ghost" style={{fontSize:13,padding:"8px 14px"}} onClick={()=>setShowAddHost(false)}>Cancel</button>
            <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"8px 16px"}} disabled={!newHost.name.trim()||addingHost} onClick={saveNewHost}>
              <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{addingHost?<><Loader2 size={15} className="spin"/>Saving…</>:<>Add host</>}</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )}
  <ConfirmModal state={confirmState} onClose={()=>setConfirmState(null)}/>
  <div className="foot">Powered by AthLink</div>
  </div>
  );
}

/* ── Landing-page embeds ─────────────────────────────────────────────────────
   The all-sports landing (apps/web/src/Landing.jsx) reuses the interactive
   globe + athlete web as live demos, and needs the DB→app event mapper plus
   the IOC→ISO country map to feed them. Re-exported via manifest.jsx. */
export { SailingGlobe, AthleteWeb, dbToApp, IOC_ISO };
