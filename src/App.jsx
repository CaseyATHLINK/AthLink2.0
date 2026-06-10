import { useState, useMemo, useEffect } from "react";
import {
  Anchor, Trophy, Search, BadgeCheck, Upload, ChevronRight, MapPin,
  Calendar, Users, Waves, ArrowLeft, Flag, Loader2, Sparkles, Link2,
  X, FileText, ClipboardPaste, AlertCircle, Pencil, Trash2, Plus, Minus,
  CheckCircle, Clock, Eye, Home
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
function iocFlag(code){
  if(!code) return '';
  const iso=IOC_ISO[code.toUpperCase()];
  if(!iso) return '';
  return [...iso].map(c=>String.fromCodePoint(0x1F1E6+c.charCodeAt(0)-65)).join('');
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
const CLASSES=[
  {id:"29er",    name:"Hong Kong 29er Class Association",      short:"29er"},
  {id:"ilca",    name:"Hong Kong ILCA",                        short:"ILCA"},
  {id:"optimist",name:"Hong Kong Optimist Dinghy Association", short:"Optimist"},
];
const REAL_2023={
  id:"29asia23",name:"2023 29er Asian Championship",cls:"29er",doublehanded:true,
  venue:"RHKYC",country:"HKG",date:"22/02/2023",discards:2,
  scoring:"Appendix A · Low Point · 2 discards",
  source:"Sailwave · HK Sailing",status:"Provisional",
  entries:[
    {sail:"3053",nat:"HKG",div:"Female Junior",helm:"Emily Polson",crew:"Tiffany Mak",races:[1,1,1,2,1,1,1,3,2,5]},
    {sail:"2751",nat:"HKG",div:"Male",helm:"Cameron Law",crew:"Christopher Lam",races:[2,3,2,1,2,2,2,1,1,4]},
    {sail:"2840",nat:"HKG",div:"Male",helm:"Jayden Fung",crew:"Jack Dingemans",races:[3,8,6,3,5,6,4,4,3,1]},
    {sail:"1946",nat:"THA",div:"Male",helm:"Bunyamin Klongsamoot",crew:"Kan Kachachuen",races:[4,4,3,4,8,3,7,5,7,2]},
    {sail:"2750",nat:"HKG",div:"Female",helm:"Jamie Tsang",crew:"Cheuk Wing Mak",races:[10,2,5,6,3,8,3,2,8,8]},
    {sail:"2412",nat:"HKG",div:"",helm:"Ethan Kong",crew:"Aaron Dampier",races:[5,7,"DSQ",5,4,4,5,9,4,9]},
    {sail:"2943",nat:"HKG",div:"Female",helm:"Bertille Voets",crew:"Tomoe Thiry",races:[8,6,7,7,6,5,9,11,5,3]},
    {sail:"3016",nat:"AUS",div:"Female Junior",helm:"Piper Attwood",crew:"Annabelle Sampson",races:[7,10,4,8,7,7,6,10,6,7]},
    {sail:"500",nat:"JPN",div:"Male Junior",helm:"Mihiro Okada",crew:"Iwao Yasuda",races:[9,9,9,9,9,9,10,8,9,10]},
    {sail:"2752",nat:"HKG",div:"Female Junior",helm:"Yalei Su",crew:"Hei Man Lam",races:["DNF","DNC","DNC","DNC","DNC","DNC",11,6,10,6]},
    {sail:"2146",nat:"THA",div:"Male",helm:"Chatree Makmul",crew:"Manintorn Leelas",races:[6,5,8,"DNF","DNC","DNC","DNC","DNC","DNC","DNC"]},
    {sail:"49",nat:"HKG",div:"Male Junior",helm:"Raphael Mak",crew:"William Chen",races:[11,"RET","DNC","DNC","DNC","DNC",8,7,12,"DNF"]},
    {sail:"2026",nat:"HKG",div:"Male",helm:"Kuan Lik Jun",crew:"Wong Yiu Hoi",races:["DNF","DNC","DNC","DNF","DNC","DNC","UFD",12,11,11]},
    {sail:"2718",nat:"HKG",div:"Male Junior",helm:"Skyler Lam",crew:"Nathan Hon",races:["DNC","DNC","DNC","DNF","DNC","DNC","DNC","DNC","DNC","DNC"]},
    {sail:"2165",nat:"HKG",div:"Male",helm:"Yang Yi Zheng",crew:"Jeremy Choy",races:["DNC","DNC","DNC","DNC","DNC","DNC","DNC","DNC","DNC","DNC"]},
  ],
};
const REAL_2024={
  id:"29asia24",name:"2024 29er Asian Championship",cls:"29er",doublehanded:true,
  venue:"RHKYC",country:"HKG",date:"08/02/2024",discards:2,
  scoring:"Appendix A · Low Point · 2 discards",
  source:"Sailwave · HK Sailing",status:"Final",
  entries:[
    {sail:"3084",nat:"HKG",div:"Female",helm:"Emily Polson",crew:"Tiffany Mak",races:[1,1,1,1,1,4,2,4,1,1,4,3,1,3]},
    {sail:"3054",nat:"HKG",div:"Male",helm:"Cameron Law",crew:"Christopher Lam",races:[2,2,2,2,2,3,1,1,3,2,5,2,2,1]},
    {sail:"3140",nat:"JPN",div:"Male",helm:"Yuto Tsutsumi",crew:"Taishi Goto",races:[4,3,4,5,"DSQ",5,3,2,4,3,"UFD",1,3,2]},
    {sail:"2750",nat:"HKG",div:"Female",helm:"Jamie Tsang",crew:"Cheuk Wing Mak",races:[5,4,7,3,5,2,4,3,2,4,3,5,4,5]},
    {sail:"2846",nat:"HKG",div:"Male Junior",helm:"Raphael Mak",crew:"Louis Polson",races:[6,6,3,6,4,1,5,5,5,5,1,4,5,4]},
    {sail:"2411",nat:"HKG",div:"Mix",helm:"Chloe Kong",crew:"Ethan Kong",races:[3,5,5,4,7,7,6,8,7,8,6,7,8,"UFD"]},
    {sail:"2876",nat:"HKG",div:"Male",helm:"Casey Law",crew:"Conrad Lunsden",races:[10,9,11,12,3,6,8,7,6,6,2,6,6,7]},
    {sail:"2521",nat:"HKG",div:"Mix",helm:"Ayden Pang",crew:"Tomoe Thiry",races:[7,7,12,7,6,8,7,6,8,7,7,8,7,6]},
    {sail:"777",nat:"HKG",div:"Female",helm:"Ka Lam Chen",crew:"Ka Yi Chen",races:[12,12,6,11,10,10,10,"DNF",9,"DNF",8,12,10,13]},
    {sail:"2752",nat:"HKG",div:"Male",helm:"Yan Cheuk Ng",crew:"Cheung Fu Wan",races:[13,10,8,8,9,11,9,"DNC","DNC","DNC","DNF",13,11,8]},
    {sail:"2222",nat:"HKG",div:"Female Junior",helm:"Kristen Hwang",crew:"Bernice Pang",races:[11,11,9,9,8,9,12,"DNC","DNC","DNC","DNC",10,14,12]},
    {sail:"287",nat:"HKG",div:"Male Junior",helm:"Sung Chak Kyle Lee",crew:"Shun Yan Rex Law",races:[14,8,10,10,11,13,13,"DNC","DNC","DNC","DNS",16,9,11]},
    {sail:"2412",nat:"HKG",div:"Male",helm:"Chap Pang Wong",crew:"Sheungching Yau",races:[15,15,15,14,12,14,14,9,"DNF","DNC","DNC",11,13,10]},
    {sail:"261",nat:"HKG",div:"Female Junior",helm:"Shing Yin Aria Hon",crew:"McCarley Wong",races:[8,13,"DNF",15,13,15,15,"DNF","DNC","DNC","DNC",14,12,9]},
    {sail:"2613",nat:"HKG",div:"Male Junior",helm:"Jaden Lau",crew:"Kaden Chan",races:[9,14,13,13,14,12,11,"DNF","DNF","DNF","DNF",15,"DNF",14]},
    {sail:"284",nat:"HKG",div:"Mix Junior",helm:"Keira Slaughter",crew:"Alfred Fong",races:[16,"DNF","UFD",16,15,16,16,"DNC","DNC","DNC","DNC","DNF","DNF",15]},
    {sail:"2749",nat:"HKG",div:"Male Junior",helm:"Skyler Lam",crew:"William Chen",races:["DNC","DNC","DNC","DNC","DNC","DNC","DNC","DNF","DNC","DNC","DNC",9,15,16]},
    {sail:"2655",nat:"HKG",div:"Mix Junior",helm:"Sebastian Chun",crew:"Kaitlyn Lee",races:[17,"DNF",14,17,"DNF","DNF","DNF","DNC","DNC","DNC","DNC","DNF","DNF","DNF"]},
  ],
};

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

function aggregate(name,evList){
  const history=[];let wins=0,podiums=0,best=Infinity;
  for(const ev of evList){
    if(ev.status==="Draft") continue;
    const e=ev.entries.find(x=>x.helm===name||x.crew===name);
    if(!e) continue;
    const s=scoreEvent(ev);
    const row=s.rows.find(r=>r.helm===e.helm&&r.crew===e.crew&&r.sail===e.sail);
    if(!row) continue;
    const role=e.helm===name?"Helm":"Crew";
    const partner=role==="Helm"?e.crew:e.helm;
    row.races.forEach(c=>{if(c===1) wins++;});
    if(row.rank<=3) podiums++;
    if(row.rank<best) best=row.rank;
    // carry nat from entry onto the row for display
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
const sbGet=async p=>{if(!sbH) return null;const r=await fetch(`${SB_URL}/rest/v1/${p}`,{headers:sbH});return r.ok?r.json():null;};
const sbPost=async(t,b)=>{if(!sbH) return null;const r=await fetch(`${SB_URL}/rest/v1/${t}`,{method:"POST",headers:sbH,body:JSON.stringify(b)});return r.ok?r.json():null;};
const sbPatch=async(t,f,b)=>{if(!sbH) return;await fetch(`${SB_URL}/rest/v1/${t}?${f}`,{method:"PATCH",headers:sbH,body:JSON.stringify(b)});};
const sbDel=async(t,f)=>{if(!sbH) return;await fetch(`${SB_URL}/rest/v1/${t}?${f}`,{method:"DELETE",headers:{...sbH,"Prefer":""}});};

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
    entries:(ev.entries||[]).map(e=>({_dbId:e.id,sail:e.sail||"—",nat:e.nat||"",div:e.division||"",
      helm:e.helm_name,crew:e.crew_name||"",races:e.races||[],race_codes:e.race_codes||null,pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null}))};
}
async function saveEventToDb(ev){
  if(!sbH) return;
  const ins=await sbPost("events",{name:ev.name,class:ev.cls,doublehanded:ev.doublehanded,
    venue:ev.venue,country:ev.country||null,date:ev.date,discards:ev.discards,
    scoring:ev.scoring,source:ev.source,status:ev.status});
  if(!ins?.[0]?.id) return ins;
  await sbPost("entries",ev.entries.map(e=>({event_id:ins[0].id,sail:e.sail,nat:e.nat||null,
    division:e.div,helm_name:e.helm,crew_name:e.crew||null,races:e.races,race_codes:e.race_codes||null,pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null})));
  return ins;
}
async function updateEventStatus(evId,status){
  await sbPatch("events",`id=eq.${evId}`,{status});
}

/* ── manual form ─────────────────────────────────────────────────────── */
const defRow=n=>({helm:"",crew:"",sail:"",nat:"",div:"",scores:Array(n).fill("")});
const emptyForm=()=>({name:"",club:"",country:"",date:"",discards:1,numRaces:5,rows:[defRow(5),defRow(5),defRow(5)]});

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

        const races=raceCols.map(ci=>parseHtmlScore(cells[ci]?.textContent)).filter(v=>v!==null);
        if(!races.length) return;

        entries.push({helm,crew,sail,nat,div,races,pdf_rank:pdfRank,pdf_net:pdfNet});
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


/* ═════════════════════════════════════════════════════════════════════ */
export default function AthLinkMVP(){
  const[events,setEvents]=useState([]);
  const[portal,setPortal]=useState(null);
  const[view,setView]=useState({name:"portals"});
  const[verified,setVerified]=useState({});
  const[q,setQ]=useState("");const[filter,setFilter]=useState("all");
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
  const[previewEditVal,setPreviewEditVal]=useState("");
  const[editCell,setEditCell]=useState(null);
  const[editVal,setEditVal]=useState("");
  const[editEvMeta,setEditEvMeta]=useState(null);

  useEffect(()=>{
    (async()=>{
      if(!sbH){setEvents([REAL_2024,REAL_2023]);return;}
      const data=await sbGet("events?select=*,entries(*)&order=created_at.desc");
      if(!data){setEvents([REAL_2024,REAL_2023]);return;}
      if(data.length===0){
        await saveEventToDb(REAL_2023);await saveEventToDb(REAL_2024);
        const s=await sbGet("events?select=*,entries(*)&order=created_at.desc");
        setEvents((s||[]).map(dbToApp));
      }else setEvents(data.map(dbToApp));
    })();
  },[]);

  /* ── derived ──────────────────────────────────────────────── */
  const classEvents=useMemo(()=>portal?events.filter(e=>e.cls===portal):[],[events,portal]);
  const people=useMemo(()=>{
    const map=new Map();
    classEvents.forEach(ev=>ev.entries.forEach(e=>{
      [e.helm,e.crew].forEach(nm=>{if(nm&&!map.has(nm))map.set(nm,{name:nm,cls:ev.cls});});
    }));
    return[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  },[classEvents]);
  const allPeople=useMemo(()=>{
    const map=new Map();
    events.forEach(ev=>ev.entries.forEach(e=>{
      [e.helm,e.crew].forEach(nm=>{if(nm&&!map.has(nm))map.set(nm,{name:nm,cls:ev.cls});});
    }));
    return[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  },[events]);

  const previewScored=useMemo(()=>previewEv?scorePreview(previewEv):null,[previewEv]);
  const previewMaxRaces=useMemo(()=>{
    if(!previewEv?.entries?.length) return 0;
    return Math.max(...previewEv.entries.map(e=>(e.races||[]).length),1);
  },[previewEv]);

  const cls=CLASSES.find(c=>c.id===portal);
  const isGlobal=!portal;
  const currentPeople=isGlobal?allPeople:people;
  const athleteTitle=isGlobal?"All Athletes":`${cls?.short||""} Athletes`;
  const evLoc=ev=>[ev.country].filter(Boolean).join(" · ");
  const manualReady=!!mf.rows.filter(r=>r.helm.trim()).length;

  /* ── navigation ───────────────────────────────────────────── */
  const go=v=>{setView(v);setQ("");window.scrollTo(0,0);};
  const goHome=()=>{setPortal(null);go({name:"portals"});};
  const enterPortal=id=>{setPortal(id);go({name:"events"});};

  /* ── event ops ────────────────────────────────────────────── */
  const deleteEvent=async(evId,e)=>{
    e.stopPropagation();
    if(!window.confirm("Remove this regatta?")) return;
    await sbDel("events",`id=eq.${evId}`);
    setEvents(p=>p.filter(ev=>ev.id!==evId));
  };
  const confirmDraft=async(evId)=>{
    await updateEventStatus(evId,"Final");
    setEvents(p=>p.map(ev=>ev.id===evId?{...ev,status:"Final"}:ev));
    setNote({name:"Results confirmed",matched:0,created:0,msg:"Event is now official."});
    setTimeout(()=>setNote(null),4000);
  };

  const saveEvMeta=async()=>{
    if(!editEvMeta) return;
    const{id,name,date,country,discards}=editEvMeta;
    await sbPatch("events",`id=eq.${id}`,{name,date,country:country||null,discards:parseInt(discards)||1});
    setEvents(p=>p.map(ev=>ev.id===id?{...ev,name,date,country,discards:parseInt(discards)||1}:ev));
    setEditEvMeta(null);
  };

  /* ── PDF / import flow ────────────────────────────────────── */
  const resetImport=()=>{
    setPdfLoading(false);setPdfError("");setImportStep("upload");
    setFleetChoices([]);setPdfMeta(null);setPreviewEv(null);setPreviewEdit(null);
  };
  const closeImport=()=>{setOpen(false);resetImport();setTab("pdf");};

  const buildPreviewFromFleet=(pdfName,pdfDate,fleet)=>{
    const ev={
      id:"imp_"+Date.now(),
      name:pdfName+(fleet.name?` — ${fleet.name}`:""),
      cls:portal,
      doublehanded:fleet.entries.some(e=>e.crew),
      venue:"",country:"",
      date:pdfDate||"",
      discards:fleet.discards||1,
      scoring:`Low Point · ${fleet.discards||1} discard(s)`,
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

  const handlePdf=async file=>{
    if(!file) return;
    setPdfLoading(true);setPdfError("");
    // If HTML file, parse in-browser via parseHtml; otherwise send to api
    if(file.name.toLowerCase().endsWith(".html")||file.type==="text/html"){
      try{
        // Read as ArrayBuffer first so we can decode as ISO-8859-1 (Sailwave's encoding)
        const buf=await file.arrayBuffer();
        const html=new TextDecoder('iso-8859-1').decode(buf);
        const data=parseHtml(html);
        if(!data.ok){setPdfError(data.error||"Could not parse this HTML file.");setPdfLoading(false);return;}
        if(data.multi){
          setFleetChoices(data.fleets);setPdfMeta({name:data.name,date:data.date||""});setImportStep("picker");
        }else{
          buildPreviewFromFleet(data.name,data.date||"",{name:"",entries:data.entries,discards:data.discards});
        }
      }catch(err){setPdfError("HTML parse failed: "+err.message);}
      finally{setPdfLoading(false);}
      return;
    }
    try{
      const res=await fetch("/api/parse_pdf",{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      const data=await res.json();
      if(!data.ok){setPdfError(data.error||"Could not parse this PDF.");setPdfLoading(false);return;}
      if(data.multi){
        setFleetChoices(data.fleets);
        setPdfMeta({name:data.name,date:data.date||""});
        setImportStep("picker");
      }else{
        buildPreviewFromFleet(data.name,data.date||"",{name:"",entries:data.entries,discards:data.discards});
      }
    }catch{
      setPdfError("Upload failed. Check api/parse_pdf.py and requirements.txt are pushed to GitHub.");
    }finally{setPdfLoading(false);}
  };
  const selectFleet=fleet=>buildPreviewFromFleet(pdfMeta.name,pdfMeta.date,fleet);
  const updPMeta=(k,v)=>setPreviewEv(ev=>({...ev,[k]:v}));

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
      venue:previewEv.venue||"—",
      date:previewEv.date||"",
      doublehanded:previewEv.entries.some(e=>e.crew&&e.crew.trim()),
    };
    ev.entries=ev.entries.map(e=>({...e,races:(e.races||[]).filter(r=>r!==null&&r!==undefined&&r!==""),}));
    const existing=new Set();events.forEach(e=>e.entries.forEach(en=>{existing.add(en.helm);if(en.crew)existing.add(en.crew);}));
    const incoming=new Set();ev.entries.forEach(en=>{incoming.add(en.helm);if(en.crew)incoming.add(en.crew);});
    let matched=0,created=0;incoming.forEach(n=>existing.has(n)?matched++:created++);
    await saveEventToDb(ev);
    setEvents(p=>[ev,...p]);
    setNote({name:ev.name,matched,created,msg:asDraft?"Saved as draft — confirm when ready.":null});
    setTimeout(()=>setNote(null),7000);
    closeImport();
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
    return{id:"imp_"+Date.now(),name:mf.name||"Imported Regatta",cls:portal,
      doublehanded:rows.some(r=>r.crew.trim()),venue:mf.club||"—",country:mf.country||"",
      date:mf.date||"",discards:disc,scoring:`Low Point · ${disc} discard(s)`,
      source:"Manual import",status:"Final",
      entries:rows.map(r=>({helm:r.helm.trim(),crew:r.crew.trim(),sail:r.sail.trim()||"—",nat:"",div:r.div.trim(),
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
    .topbar{background:var(--navy);color:#fff;position:sticky;top:0;z-index:30;}
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
    .rk.p1{color:var(--gold);}.rk.p2{color:#7d8a98;}.rk.p3{color:#a86a32;}
    .boat{display:flex;align-items:center;gap:10px;}
    .av{width:30px;height:30px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none;font-family:'Barlow',sans-serif;}
    .cn{font-size:11.5px;color:var(--mut);}
    .namelink{color:var(--accent);font-weight:600;cursor:pointer;}.namelink:hover{text-decoration:underline;}
    .disc{color:var(--mut);}.code{color:#c0392b;font-weight:600;font-size:11px;}
    .net{font-family:'Barlow',sans-serif;font-weight:700;color:var(--navy);}
    .sailcol{font-size:12px;color:var(--mut);white-space:nowrap;}
    .vchip{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--accent);font-weight:600;}
    .divtag{font-size:10px;font-weight:700;color:var(--navy2);background:var(--sky);padding:2px 7px;border-radius:5px;}
    .cellinput{width:44px;text-align:center;border:1.5px solid var(--accent);border-radius:5px;padding:3px;font:inherit;font-size:13px;outline:none;background:#fff;color:var(--ink);}
    .agrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:13px;}
    .acard{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;cursor:pointer;transition:.18s;animation:rise .5s both;}
    .acard:hover{border-color:#b9cee4;transform:translateY(-2px);box-shadow:0 12px 28px -16px rgba(22,58,99,.55);}
    .achead{display:flex;align-items:center;gap:11px;margin-bottom:12px;}
    .achead .av{width:42px;height:42px;font-size:14px;}
    .acn{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;line-height:1.1;}
    .acstat{display:flex;gap:16px;font-size:12px;color:var(--mut);border-top:1px solid var(--line);padding-top:11px;align-items:center;}
    .acstat b{display:block;font-family:'Barlow',sans-serif;font-size:17px;color:var(--ink);font-weight:700;}
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
    .rc{width:24px;height:24px;border-radius:6px;background:var(--sky);color:var(--navy);font-size:10px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums;}
    .rc.c{background:#fbe3e0;color:#c0392b;}
    .rc.d{background:#eef2f7;color:var(--mut);text-decoration:line-through;}
    .rc.g1{background:#c8920b;color:#fff;}
    .rc.g2{background:#8a9bb0;color:#fff;}
    .rc.g3{background:#a86a32;color:#fff;}
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
    .modal{background:var(--paper);width:100%;max-width:700px;border-radius:18px;overflow:hidden;box-shadow:0 30px 70px -20px rgba(0,0,0,.5);animation:rise .3s both;}
    .modal.wide{max-width:940px;}
    .mhead{background:var(--navy);color:#fff;padding:18px 22px;display:flex;align-items:center;gap:10px;}
    .mhead h3{font-family:'Barlow',sans-serif;font-weight:700;font-size:19px;margin:0;flex:1;}
    .mhead .x{background:rgba(255,255,255,.12);border:0;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:grid;place-items:center;}
    .mhead .x:hover{background:rgba(255,255,255,.22);}
    .mtabs{display:flex;gap:6px;padding:14px 22px 0;}
    .mtabs button{font-family:'Barlow',sans-serif;font-weight:600;font-size:14px;border:0;background:none;color:var(--mut);padding:9px 14px;border-radius:9px 9px 0 0;cursor:pointer;display:flex;align-items:center;gap:7px;}
    .mtabs button.on{color:var(--navy);background:#fff;border:1px solid var(--line);border-bottom:0;}
    .mbody{padding:18px 22px 22px;max-height:80vh;overflow-y:auto;}
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
  `}</style>

  {/* ── TOPBAR ── */}
  <div className="topbar"><div className="topin">
    <div className="brand" onClick={goHome}><Link2 size={15}/></div>
    {portal
      ?<span className="topname">Hong Kong Sailing · {cls?.name}</span>
      :<span className="topsite">Hong Kong Sailing</span>}
    <nav className="nav">
      {portal&&<button className={view.name==="events"?"on":""} onClick={()=>go({name:"events"})}>Regattas</button>}
      {portal&&<button className={(view.name==="athletes"||view.name==="profile")?"on":""} onClick={()=>go({name:"athletes"})}>Athletes</button>}
    </nav>
  </div></div>

  {/* ── HOME HERO (no portal) ── */}
  {!portal&&(
    <div className="home-hero">
      <div className="wrap">
        <h1 className="disp">Hong Kong Sailing</h1>
        <p>Results, athlete profiles and class standings for Hong Kong competitive sailing</p>
        <div className="home-tabs">
          <button className={view.name==="portals"?"on":""} onClick={()=>go({name:"portals"})}>Class Portals</button>
          <button className={(view.name==="athletes"||view.name==="profile")?"on":""} onClick={()=>go({name:"athletes"})}>All Athletes</button>
        </div>
      </div>
    </div>
  )}

  {/* ── HOME: Class portals grid ── */}
  {!portal&&view.name==="portals"&&(
    <div className="wrap sec">
      <div className="toolbar" style={{marginBottom:18}}>
        <div className="srch">
          <Search size={16} color="#9fb2c8"/>
          <input placeholder="Search class associations…" value={homeQ} onChange={e=>setHomeQ(e.target.value)}/>
        </div>
      </div>
      <p className="seclabel"><Anchor size={14}/>Class Associations</p>
      <div className="classes-grid">
        {CLASSES.filter(c=>!homeQ||c.name.toLowerCase().includes(homeQ.toLowerCase())||c.short.toLowerCase().includes(homeQ.toLowerCase())).map((c,i)=>{
          const ce=events.filter(e=>e.cls===c.id);
          const cp=new Set();ce.forEach(ev=>ev.entries.forEach(e=>{if(e.helm)cp.add(e.helm);if(e.crew)cp.add(e.crew);}));
          return(<div className="class-card" key={c.id} style={{animationDelay:`${i*80}ms`}} onClick={()=>enterPortal(c.id)}>
            <span className="class-tag">{c.short}</span>
            <p className="class-name">{c.name}</p>
            <div className="class-stats"><div><b>{ce.length}</b>regattas</div><div><b>{cp.size}</b>athletes</div></div>
            <button className="btn cta" style={{width:"100%",justifyContent:"center"}} onClick={e=>{e.stopPropagation();enterPortal(c.id);}}>Enter portal <ChevronRight size={16}/></button>
          </div>);
        })}
      </div>
    </div>
  )}

  {/* ── PORTAL: Events list ── */}
  {portal&&view.name==="events"&&(
    <>
      <div className="strip"><div className="wrap">
        <h1 className="disp">{cls?.name}</h1>
        <div className="pillbar">
          <div className="pill"><Trophy size={16}/><b>{classEvents.length}</b> regattas</div>
          <div className="pill"><Users size={16}/><b>{people.length}</b> athletes</div>
        </div>
      </div></div>
      <div className="wrap sec">
        <button className="back" onClick={goHome}><ArrowLeft size={16}/>Hong Kong Sailing</button>
        <div className="toolbar">
          <p className="seclabel" style={{margin:0,flex:1}}><Waves size={14}/>Results</p>
          <button className="btn cta" onClick={()=>setOpen(true)}><Upload size={16}/>Import a regatta</button>
        </div>
        {classEvents.map((ev,i)=>{
          const s=scoreEvent(ev);const isDraft=ev.status==="Draft";
          return(<div className={`ev${isDraft?" draft":""}`} key={ev.id} style={{animationDelay:`${i*60}ms`}} onClick={()=>go({name:"event",id:ev.id})}>
            <div className="evicon"><Anchor size={20}/></div>
            <div style={{flex:1,minWidth:0}}>
              <p className="evname">{ev.name}</p>
              <div className="evmeta">
                <span><MapPin size={13}/>{evLoc(ev)||"—"}</span>
                <span><Calendar size={13}/>{formatDate(ev.date)}</span>
                <span><Users size={13}/>{s.fleet} boats · {s.races} races</span>
              </div>
            </div>
            {isDraft&&<span className="draftbadge"><Clock size={11}/> Draft</span>}
            <span className="cls">{ev.cls}</span>
            <button className="delbtn" onClick={e=>deleteEvent(ev.id,e)}><Trash2 size={16}/></button>
            <ChevronRight size={18} color="#9fb2c8"/>
          </div>);
        })}
        {classEvents.length===0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No regattas yet. Import one to get started.</p>}
      </div>
    </>
  )}

  {/* ── PORTAL: Event detail ── */}
  {portal&&view.name==="event"&&(()=>{
    const ev=events.find(e=>e.id===view.id);if(!ev) return null;
    const s=scoreEvent(ev);const isDraft=ev.status==="Draft";
    return(<div className="wrap sec" style={{paddingTop:26}}>
      <button className="back" onClick={()=>go({name:"events"})}><ArrowLeft size={16}/>All regattas</button>
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
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
        <h1 className="disp" style={{fontSize:24,margin:0}}>{ev.name}</h1>
        <button className="btn ghost" style={{fontSize:12,padding:"5px 10px"}} onClick={()=>setEditEvMeta({id:ev.id,name:ev.name,date:ev.date,country:ev.country||"",discards:ev.discards})}>
          <Pencil size={13}/>Edit
        </button>
      </div>
      <div className="evmeta" style={{marginBottom:16}}>
        <span><MapPin size={13}/>{evLoc(ev)||"—"}</span>
        <span><Calendar size={13}/>{formatDate(ev.date)}</span>
        <span><Anchor size={13}/>{ev.cls}</span>
        <span style={{fontSize:12,color:"var(--mut)",display:"flex",alignItems:"center",gap:5}}><Pencil size={12}/>Click a score to edit</span>
      </div>
      <div className="panel"><table>
        <thead><tr>
          <th>Pos</th><th className="l">Boat</th><th className="l">Sail / Nat</th>
          {Array.from({length:s.races}).map((_,i)=><th key={i}>R{i+1}</th>)}
          <th>Net</th>
        </tr></thead>
        <tbody>{s.rows.map(r=>(
          <tr key={r.sail+r.helm}>
            <td className={`rk ${r.rank<=3?"p"+r.rank:""}`}>{r.rank}</td>
            <td className="l"><div className="boat">
              <div className="av" style={{background:avatarColor(r.helm)}}>{initials(r.helm)}</div>
              <div>
                <div className="namelink" onClick={()=>go({name:"profile",id:r.helm,fromEvent:ev.id})}>{r.helm}</div>
                <div className="cn">{r.crew?<>with <span className="namelink" onClick={()=>go({name:"profile",id:r.crew,fromEvent:ev.id})}>{r.crew}</span></>:"single-handed"}{(()=>{
  if(!r.div) return null;
  const d=r.div.replace(/\d+-(?:Gold|Silver|Bronze|Emerald|Sapphire)\s*/i,'').trim();
  const isJunior=/junior|u17|u18|u19|u20/i.test(d);
  const gRaw=d.replace(/junior|u\d+/gi,'').trim();
  const gMap={'m':'Male','male':'Male','f':'Female','female':'Female',
    'mixed':'Mixed','mix':'Mixed','w':'Female','women':'Female','men':'Male'};
  const gender=gMap[gRaw.toLowerCase()]||gRaw;
  return(<>{gender&&<span className="divtag" style={{marginLeft:8}}>{gender}</span>}
    {isJunior&&<span className="divtag" style={{marginLeft:4,background:'#e8f4ff',color:'#1a5e8a'}}>Junior</span>}
  </>);
})()}</div>
              </div>
            </div></td>
            <td className="l sailcol">{r.nat?<>{iocFlag(r.nat)} {r.nat} {r.sail}</>:r.sail}</td>
            {Array.from({length:s.races}).map((_,i)=>{
              const c=r.races[i];
              const isE=editCell?.evId===ev.id&&editCell?.sail===r.sail&&editCell?.helm===r.helm&&editCell?.raceIdx===i;
              if(isE) return<td key={i}><input className="cellinput" autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{if(e.key==="Enter")commitEdit();if(e.key==="Escape")setEditCell(null);}}/></td>;
              if(c===undefined) return<td key={i} className="disc">–</td>;
              const codeLabel=r.race_codes?.[i]||null;
              const displayNum=isCode(c)?c:r.discardSet.has(i)?`(${c})`:c;
              return<td key={i} className={"editable "+(isCode(c)?"code":r.discardSet.has(i)?"disc":"")} onClick={()=>startEdit(ev.id,r.sail,r.helm,i,c)}>
                {codeLabel&&!isCode(c)
                  ?<div className="scorecell"><span className="snum">{displayNum}</span><span className="scode">{codeLabel}</span></div>
                  :displayNum}
              </td>;
            })}
            <td className="net">{r.net}</td>
          </tr>
        ))}</tbody>
      </table></div>
      <p style={{fontSize:12,color:"var(--mut)",marginTop:12}}>( ) = discard · red = penalty code · click a score to edit</p>
    </div>);
  })()}

  {/* ── ATHLETES (portal + global) ── */}
  {(portal||(!portal&&(view.name==="athletes"||view.name==="profile")))&&view.name==="athletes"&&(
    <div className="wrap sec" style={{paddingTop:26}}>
      {portal&&<button className="back" onClick={goHome}><ArrowLeft size={16}/>Hong Kong Sailing</button>}
      <div style={{display:"flex",alignItems:"baseline",gap:16,marginBottom:4,flexWrap:"wrap"}}>
        <h1 className="disp" style={{fontSize:25,margin:0}}>{athleteTitle}</h1>
        {portal&&<button className="btn sky" style={{fontSize:13,padding:"6px 12px"}} onClick={()=>{setPortal(null);go({name:"athletes"});}}>
          <Users size={14}/>All Athletes</button>}
      </div>
      <p style={{color:"var(--mut)",fontSize:14,margin:"0 0 18px"}}>One profile per sailor, built automatically from results.</p>
      <div className="toolbar">
        <div className="srch"><Search size={16} color="#9fb2c8"/><input placeholder="Search athletes…" value={q} onChange={e=>setQ(e.target.value)}/></div>
        <div className="seg">{["all","verified","unverified"].map(f=>(
          <button key={f} className={filter===f?"on":""} onClick={()=>setFilter(f)}>{f[0].toUpperCase()+f.slice(1)}</button>
        ))}</div>
      </div>
      <div className="agrid">
        {currentPeople.filter(p=>q?p.name.toLowerCase().includes(q.toLowerCase()):true)
          .filter(p=>filter==="all"?true:filter==="verified"?verified[p.name]:!verified[p.name])
          .map((p,i)=>{
            const ag=aggregate(p.name,isGlobal?events:classEvents);
            const nat=athleteNat(p.name,isGlobal?events:classEvents);
            const clsLabel=isGlobal?CLASSES.find(c=>c.id===p.cls)?.short:cls?.short;
            return(<div className="acard" key={p.name} style={{animationDelay:`${i*22}ms`}} onClick={()=>go({name:"profile",id:p.name})}>
              <div className="achead">
                <div className="av" style={{background:avatarColor(p.name)}}>{initials(p.name)}</div>
                <div>
                  <div className="acn">{nat?iocFlag(nat):""} {p.name}</div>
                  <div className="cn" style={{marginTop:2}}>{nat||clsLabel}{ag.events>1?" · multi-event":""}</div>
                </div>
              </div>
              <div className="acstat">
                <div><b>{ag.events}</b>regattas</div><div><b>{ag.best?"#"+ag.best:"—"}</b>best</div>
                <div style={{marginLeft:"auto",alignSelf:"center"}}>{verified[p.name]?<span className="vchip"><BadgeCheck size={13}/>Verified</span>:<span style={{fontSize:11.5,color:"var(--mut)"}}>Unverified</span>}</div>
              </div>
            </div>);
          })}
      </div>
    </div>
  )}

  {/* ── PROFILE ── */}
  {(portal||(!portal&&(view.name==="athletes"||view.name==="profile")))&&view.name==="profile"&&(()=>{
    const name=view.id;
    const p=currentPeople.find(x=>x.name===name)||{name};
    const ag=aggregate(name,events);
    const nat=athleteNat(name,events);
    const isV=verified[name];
    return(<div className="wrap sec" style={{paddingTop:22}}>
      {view.fromEvent
        ? (()=>{const fev=events.find(e=>e.id===view.fromEvent);return fev?<button className="back" onClick={()=>go({name:"event",id:view.fromEvent})}><ArrowLeft size={16}/>{fev.name}</button>:null;})()
        : <button className="back" onClick={()=>go({name:"athletes"})}><ArrowLeft size={16}/>{athleteTitle}</button>
      }
      <div className="phead">
        <div className="av" style={{background:avatarColor(name)}}>{initials(name)}</div>
        <div style={{flex:1,minWidth:200}}>
          <h1 className="pname disp">
            {nat&&<span className="pflag">{iocFlag(nat)}</span>}{name}
          </h1>
          <div className="pmeta">
            {nat?<span><Flag size={14}/>{nat}</span>:null}
            {p.cls?<span><Anchor size={14}/>{CLASSES.find(c=>c.id===p.cls)?.short||p.cls}</span>:null}
          </div>
          <div className="pstats">
            <div><div className="v disp">{ag.events}</div><div className="k">Regattas</div></div>
            <div><div className="v disp">{ag.best?"#"+ag.best:"—"}</div><div className="k">Best result</div></div>
            <div><div className="v disp">{ag.podiums}</div><div className="k">Podiums</div></div>
            <div><div className="v disp">{ag.wins}</div><div className="k">Race wins</div></div>
          </div>
        </div>
        <div className="claimbox">
          {isV?(<div className="vbox"><b><BadgeCheck size={16}/>Verified profile</b><div style={{marginTop:5}}>Tracking {ag.events} regatta{ag.events!==1?"s":""} in one record.</div></div>)
           :(<><button className="btn cta" onClick={()=>setVerified({...verified,[name]:true})}><BadgeCheck size={16}/>Verify this profile</button><div style={{fontSize:12,color:"#9fbdd9",marginTop:6}}>Matched by name + sail number</div></>)}
        </div>
      </div>
      <div style={{marginTop:22}}>
        <p className="seclabel"><Trophy size={14}/>Result history</p>
        {ag.history.map((h,i)=>(
          <div className="histrow" key={h.ev.id+i} style={{animationDelay:`${i*70}ms`}}>
            <div className={`hrk ${h.row.rank<=3?"p"+h.row.rank:""}`}>#{h.row.rank}<small>of {h.fleet}</small></div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
                <span className="disp" style={{fontWeight:700,fontSize:15}}>{h.ev.name}</span>
                <span className={"rolechip "+h.role.toLowerCase()}>{h.role}</span>

              </div>
              <div className="cn" style={{marginTop:3}}>{formatDate(h.ev.date)} · {evLoc(h.ev)} · net {h.row.net}{h.partner?<> · with <span className="namelink" onClick={()=>go({name:"profile",id:h.partner})}>{h.partner}</span></>:""}</div>
              <div className="miniraces">{h.row.races.map((rc2,j)=>{
                const cls2=isCode(rc2)?"c":h.row.discardSet.has(j)?"d":rc2===1?"g1":rc2===2?"g2":rc2===3?"g3":"";
                return<div key={j} className={`rc ${cls2}`}>{isCode(rc2)?rc2.slice(0,2):rc2}</div>;
              })}</div>
            </div>
            <span className="vchip"><BadgeCheck size={13}/>Verified</span>
          </div>
        ))}
        {ag.history.length===0&&<p style={{color:"var(--mut)",fontSize:14}}>No confirmed results found.</p>}
      </div>
    </div>);
  })()}

  {/* ══ IMPORT MODAL ══════════════════════════════════════════ */}
  {open&&(
    <div className="ov" onClick={importStep==="preview"?undefined:closeImport}>
      <div className={`modal${importStep==="preview"?" wide":""}`} onClick={e=>e.stopPropagation()}>
        <div className="mhead">
          {importStep==="picker"&&<button className="x" onClick={()=>setImportStep("upload")} style={{marginRight:4}}><ArrowLeft size={16}/></button>}
          {importStep==="preview"&&<button className="x" onClick={()=>setImportStep(fleetChoices.length?"picker":"upload")} style={{marginRight:4}}><ArrowLeft size={16}/></button>}
          <Upload size={18}/>
          <h3>{importStep==="picker"?"Select fleet":importStep==="preview"?"Preview & edit results":"Import a regatta"}</h3>
          <button className="x" onClick={closeImport}><X size={16}/></button>
        </div>

        {importStep==="upload"&&(<>
          <div className="mtabs">
            <button className={tab==="pdf"?"on":""} onClick={()=>setTab("pdf")}><FileText size={15}/>Upload PDF / HTML</button>
            <button className={tab==="manual"?"on":""} onClick={()=>setTab("manual")}><ClipboardPaste size={15}/>Manual entry</button>
          </div>
          <div className="mbody">
            {tab==="pdf"&&(<>
              <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 14px",lineHeight:1.55}}>Upload a results PDF or Sailwave HTML file — supports Sailwave, Manage2sail, SailingResults.net and more. Multi-fleet files will show a fleet picker.</p>
              <label className="btn cta" style={{cursor:"pointer"}}>
                {pdfLoading?<><Loader2 size={16} className="spin"/>Parsing…</>:<><Upload size={16}/>Choose PDF file</>}
                <input type="file" accept="application/pdf,.html,text/html" style={{display:"none"}} disabled={pdfLoading} onChange={e=>handlePdf(e.target.files?.[0])}/>
              </label>
              {pdfError&&<div className="prev err" style={{marginTop:14}}><AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:5}}/>{pdfError}</div>}
            </>)}
            {tab==="manual"&&(<>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Event name</label>
                <input value={mf.name} onChange={e=>updMeta("name",e.target.value)} placeholder="2025 29er Asian Championship" style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/>
              </div>
              <div className="meta-grid three">
                <div><label>Host Country</label><input value={mf.club} onChange={e=>updMeta("club",e.target.value)} placeholder="HKG"/></div>
                <div><label>Country</label><input value={mf.country} onChange={e=>updMeta("country",e.target.value)} placeholder="HKG"/></div>
                <div><label>Discards</label><input type="number" min="0" max="10" value={mf.discards} onChange={e=>updMeta("discards",Math.max(0,parseInt(e.target.value)||0))}/></div>
              </div>
              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Date</label>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <input value={mf.date} onChange={e=>updMeta("date",e.target.value)} placeholder="dd/mm/yyyy" maxLength={10} style={{width:140,border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/>
                  {mf.date?.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)&&<span style={{fontSize:13,color:"var(--accent)",fontWeight:600}}>{formatDate(mf.date)}</span>}
                </div>
              </div>
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
                    <th className="l" style={{minWidth:110}}>Crew Name</th>
                    <th style={{minWidth:46}}>Sail</th>
                    <th style={{minWidth:46}}>Nat</th>
                    <th style={{minWidth:56}}>Class</th>
                    {Array.from({length:mf.numRaces}).map((_,i)=><th key={i} style={{minWidth:34}}>R{i+1}</th>)}
                    <th className="calc" style={{minWidth:38}}>Total</th>
                    <th className="calc" style={{minWidth:38}}>Net</th>
                    <th style={{width:26}}></th>
                  </tr></thead>
                  <tbody>
                    {mf.rows.map((row,i)=>(
                      <tr key={i}>
                        <td className="l"><input value={row.helm} onChange={e=>updRow(i,"helm",e.target.value)} placeholder="Helm name"/></td>
                        <td className="l"><input value={row.crew} onChange={e=>updRow(i,"crew",e.target.value)} placeholder="Crew name"/></td>
                        <td><input value={row.sail} onChange={e=>updRow(i,"sail",e.target.value)} placeholder="···" style={{textAlign:"center"}}/></td>
                        <td><input value={row.nat||""} onChange={e=>updRow(i,"nat",e.target.value.toUpperCase())} placeholder="HKG" style={{textAlign:"center"}}/></td>
                        <td><input value={row.div} onChange={e=>updRow(i,"div",e.target.value)} placeholder="F Jr" style={{textAlign:"center"}}/></td>
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
                <button className="btn cta" disabled={!manualReady} onClick={doImportManual}><Upload size={16}/>Import regatta</button>
              </div>
            </>)}
          </div>
        </>)}

        {importStep==="picker"&&(
          <div className="mbody">
            <p style={{fontSize:14,color:"var(--mut)",margin:"0 0 4px"}}>Multiple fleets found in <strong style={{color:"var(--ink)"}}>{pdfMeta?.name}</strong>. Select which fleet to import:</p>
            <div className="fleet-grid">
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

        {importStep==="preview"&&previewEv&&(()=>{
          const scored=previewScored;
          const maxR=previewMaxRaces;
          const missingCells=previewEv.entries.some(e=>!e.helm||(e.races||[]).length<maxR);
          return(<div className="mbody">
            <div className="preview-meta wide" style={{marginBottom:8}}>
              <div><label>Event name</label><input value={previewEv.name||""} onChange={e=>updPMeta("name",e.target.value)} className={!previewEv.name?"pmissing":""} placeholder="Event name"/></div>
              <div><label>Date</label><input value={previewEv.date||""} onChange={e=>updPMeta("date",e.target.value)} className={!previewEv.date?"pmissing":""} placeholder="dd/mm/yyyy"/></div>
              <div><label>Host Country</label><input value={previewEv.venue||""} onChange={e=>updPMeta("venue",e.target.value)} className={!previewEv.venue?"pmissing":""} placeholder="HKG"/></div>
              <div><label>Discards</label><input type="number" min="0" max="20" value={previewEv.discards||1} onChange={e=>updPMeta("discards",parseInt(e.target.value)||1)}/></div>
            </div>
            {missingCells&&<p className="pmissing-hint"><AlertCircle size={13}/>Amber cells have missing data — click to edit before publishing.</p>}
            <div className="preview-table-wrap">
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12.5px",minWidth:560}}>
                <thead>
                  <tr>
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 6px",textAlign:"center",fontSize:11}}>Pos</th>
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 8px",textAlign:"left",fontSize:11}}>Helm</th>
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 6px",textAlign:"left",fontSize:11}}>Crew</th>
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 5px",textAlign:"left",fontSize:11}}>Sail</th>
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
                      <td style={{padding:"4px 6px",minWidth:100}}>
                        {previewEdit?.type==="crew"&&previewEdit.idx===idx
                          ?<input className="pe-input" autoFocus value={previewEditVal} onChange={e=>setPreviewEditVal(e.target.value)} onBlur={commitPreviewEdit} onKeyDown={e=>{if(e.key==="Enter")commitPreviewEdit();if(e.key==="Escape")setPreviewEdit(null);}}/>
                          :<div onClick={()=>startPreviewEdit("crew",idx,0,entry.crew)} style={{cursor:"text",padding:"4px 2px",borderRadius:4,minHeight:24,fontSize:12,color:"var(--mut)"}}>{entry.crew||<span style={{fontStyle:"italic",opacity:.4}}>—</span>}</div>}
                      </td>
                      <td style={{padding:"4px 4px",textAlign:"left",minWidth:80,fontSize:12,color:"var(--mut)"}}>
                        {previewEdit?.type==="sail"&&previewEdit.idx===idx
                          ?<input className="pe-input" autoFocus value={previewEditVal} onChange={e=>setPreviewEditVal(e.target.value)} onBlur={commitPreviewEdit} onKeyDown={e=>{if(e.key==="Enter")commitPreviewEdit();if(e.key==="Escape")setPreviewEdit(null);}}/>
                          :<div onClick={()=>startPreviewEdit("sail",idx,0,entry.sail)} style={{cursor:"text",padding:"4px 2px",borderRadius:4,minHeight:24}}>
                            {entry.nat?<>{iocFlag(entry.nat)} {entry.nat} </>:""}{entry.sail||"—"}
                          </div>}
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
              <button className="btn ghost" onClick={closeImport}>Cancel</button>
              <button className="btn amber" onClick={()=>importPreview(true)}><Clock size={16}/>Save as Draft</button>
              <button className="btn cta" onClick={()=>importPreview(false)}><CheckCircle size={16}/>Confirm & Publish</button>
            </div>
          </div>);
        })()}
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
            <input value={editEvMeta.country} onChange={e=>setEditEvMeta(m=>({...m,country:e.target.value.toUpperCase()}))} placeholder="HKG" style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/></div>
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
      {note.msg||`Matched ${note.matched} sailors · ${note.created} new profiles created`}
    </div></div></div>)}
  <div className="foot">Powered by AthLink</div>
  </div>
  );
}
