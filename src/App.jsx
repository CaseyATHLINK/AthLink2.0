import { useState, useMemo } from "react";
import {
  Anchor, Trophy, Search, BadgeCheck, Upload, ChevronRight, MapPin,
  Calendar, Users, Waves, ArrowLeft, Flag, Loader2, Sparkles, Link2, Clock,
  X, FileText, ClipboardPaste, AlertCircle, Pencil
} from "lucide-react";

const PENALTY = ["DNF","DNC","DNS","OCS","DSQ","BFD","UFD","RET","RDG","DGM","DNE"];
const isCode = (c) => typeof c === "string";

const META = {
  "Bunyamin Klongsamoot":{nat:"THA"},"Kan Kachachuen":{nat:"THA"},
  "Chatree Makmul":{nat:"THA"},"Manintorn Leelas":{nat:"THA"},
  "Mihiro Okada":{nat:"JPN"},"Iwao Yasuda":{nat:"JPN"},
  "Yuto Tsutsumi":{nat:"JPN"},"Taishi Goto":{nat:"JPN"},
};

/* ---- 2023 Asian Championship (uploaded Sailwave PDF) ---- */
const REAL_2023 = {
  id:"29asia23", name:"2023 29er Asian Championship",
  cls:"29er", doublehanded:true, venue:"Hong Kong", date:"Feb 2023",
  discards:2, scoring:"Appendix A · Low Point · 2 discards",
  source:"Sailwave · HK Sailing", status:"Provisional as of 10:26, 22 Feb 2023",
  entries:[
    {sail:"3053",div:"Female Junior",helm:"Emily Polson",crew:"Tiffany Mak",races:[1,1,1,2,1,1,1,3,2,5]},
    {sail:"2751",div:"Male",helm:"Cameron Law",crew:"Christopher Lam",races:[2,3,2,1,2,2,2,1,1,4]},
    {sail:"2840",div:"Male",helm:"Jayden Fung",crew:"Jack Dingemans",races:[3,8,6,3,5,6,4,4,3,1]},
    {sail:"1946",div:"Male",helm:"Bunyamin Klongsamoot",crew:"Kan Kachachuen",races:[4,4,3,4,8,3,7,5,7,2]},
    {sail:"2750",div:"Female",helm:"Jamie Tsang",crew:"Cheuk Wing Mak",races:[10,2,5,6,3,8,3,2,8,8]},
    {sail:"2412",div:"",helm:"Ethan Kong",crew:"Aaron Dampier",races:[5,7,"DSQ",5,4,4,5,9,4,9]},
    {sail:"2943",div:"Female",helm:"Bertille Voets",crew:"Tomoe Thiry",races:[8,6,7,7,6,5,9,11,5,3]},
    {sail:"3016",div:"Female Junior",helm:"Piper Attwood",crew:"Annabelle Sampson",races:[7,10,4,8,7,7,6,10,6,7]},
    {sail:"500",div:"Male Junior",helm:"Mihiro Okada",crew:"Iwao Yasuda",races:[9,9,9,9,9,9,10,8,9,10]},
    {sail:"2752",div:"Female Junior",helm:"Yalei Su",crew:"Hei Man Lam",races:["DNF","DNC","DNC","DNC","DNC","DNC",11,6,10,6]},
    {sail:"2146",div:"Male",helm:"Chatree Makmul",crew:"Manintorn Leelas",races:[6,5,8,"DNF","DNC","DNC","DNC","DNC","DNC","DNC"]},
    {sail:"49",div:"Male Junior",helm:"Raphael Mak",crew:"William Chen",races:[11,"RET","DNC","DNC","DNC","DNC",8,7,12,"DNF"]},
    {sail:"2026",div:"Male",helm:"Kuan Lik Jun",crew:"Wong Yiu Hoi",races:["DNF","DNC","DNC","DNF","DNC","DNC","UFD",12,11,11]},
    {sail:"2718",div:"Male Junior",helm:"Skyler Lam",crew:"Nathan Hon",races:["DNC","DNC","DNC","DNF","DNC","DNC","DNC","DNC","DNC","DNC"]},
    {sail:"2165",div:"Male",helm:"Yang Yi Zheng",crew:"Jeremy Choy",races:["DNC","DNC","DNC","DNC","DNC","DNC","DNC","DNC","DNC","DNC"]},
  ],
};

/* ---- 2024 Asian Championship (uploaded Sailwave PDF, 18 boats, 14 races) ---- */
const REAL_2024 = {
  id:"29asia24", name:"2024 29er Asian Championship",
  cls:"29er", doublehanded:true, venue:"Hong Kong", date:"Feb 2024",
  discards:2, scoring:"Appendix A · Low Point · 2 discards",
  source:"Sailwave · HK Sailing", status:"Final as of 11:08, 8 Feb 2024",
  entries:[
    {sail:"3084",div:"Female",helm:"Emily Polson",crew:"Tiffany Mak",races:[1,1,1,1,1,4,2,4,1,1,4,3,1,3]},
    {sail:"3054",div:"Male",helm:"Cameron Law",crew:"Christopher Lam",races:[2,2,2,2,2,3,1,1,3,2,5,2,2,1]},
    {sail:"3140",div:"Male",helm:"Yuto Tsutsumi",crew:"Taishi Goto",races:[4,3,4,5,"DSQ",5,3,2,4,3,"UFD",1,3,2]},
    {sail:"2750",div:"Female",helm:"Jamie Tsang",crew:"Cheuk Wing Mak",races:[5,4,7,3,5,2,4,3,2,4,3,5,4,5]},
    {sail:"2846",div:"Male Junior",helm:"Raphael Mak",crew:"Louis Polson",races:[6,6,3,6,4,1,5,5,5,5,1,4,5,4]},
    {sail:"2411",div:"Mix",helm:"Chloe Kong",crew:"Ethan Kong",races:[3,5,5,4,7,7,6,8,7,8,6,7,8,"UFD"]},
    {sail:"2876",div:"Male",helm:"Casey Law",crew:"Conrad Lunsden",races:[10,9,11,12,3,6,8,7,6,6,2,6,6,7]},
    {sail:"2521",div:"Mix",helm:"Ayden Pang",crew:"Tomoe Thiry",races:[7,7,12,7,6,8,7,6,8,7,7,8,7,6]},
    {sail:"777",div:"Female",helm:"Ka Lam Chen",crew:"Ka Yi Chen",races:[12,12,6,11,10,10,10,"DNF",9,"DNF",8,12,10,13]},
    {sail:"2752",div:"Male",helm:"Yan Cheuk Ng",crew:"Cheung Fu Wan",races:[13,10,8,8,9,11,9,"DNC","DNC","DNC","DNF",13,11,8]},
    {sail:"2222",div:"Female Junior",helm:"Kristen Hwang",crew:"Bernice Pang",races:[11,11,9,9,8,9,12,"DNC","DNC","DNC","DNC",10,14,12]},
    {sail:"287",div:"Male Junior",helm:"Sung Chak Kyle Lee",crew:"Shun Yan Rex Law",races:[14,8,10,10,11,13,13,"DNC","DNC","DNC","DNS",16,9,11]},
    {sail:"2412",div:"Male",helm:"Chap Pang Wong",crew:"Sheungching Yau",races:[15,15,15,14,12,14,14,9,"DNF","DNC","DNC",11,13,10]},
    {sail:"261",div:"Female Junior",helm:"Shing Yin Aria Hon",crew:"McCarley Wong",races:[8,13,"DNF",15,13,15,15,"DNF","DNC","DNC","DNC",14,12,9]},
    {sail:"2613",div:"Male Junior",helm:"Jaden Lau",crew:"Kaden Chan",races:[9,14,13,13,14,12,11,"DNF","DNF","DNF","DNF",15,"DNF",14]},
    {sail:"284",div:"Mix Junior",helm:"Keira Slaughter",crew:"Alfred Fong",races:[16,"DNF","UFD",16,15,16,16,"DNC","DNC","DNC","DNC","DNF","DNF",15]},
    {sail:"2749",div:"Male Junior",helm:"Skyler Lam",crew:"William Chen",races:["DNC","DNC","DNC","DNC","DNC","DNC","DNC","DNF","DNC","DNC","DNC",9,15,16]},
    {sail:"2655",div:"Mix Junior",helm:"Sebastian Chun",crew:"Kaitlyn Lee",races:[17,"DNF",14,17,"DNF","DNF","DNF","DNC","DNC","DNC","DNC","DNF","DNF","DNF"]},
  ],
};

const SAMPLE_TEXT = `RHKYC 29er Spring Series 2024
venue: Royal Hong Kong Yacht Club
date: Apr 2024
class: 29er
discards: 1
Emily Polson / Tiffany Mak / 3084 / 1 1 2 1 1 2
Cameron Law / Christopher Lam / 3054 / 2 2 1 2 2 1
Yuto Tsutsumi / Taishi Goto / 3140 / 3 4 3 3 4 3
Raphael Mak / Louis Polson / 2846 / 4 3 5 4 3 4
Casey Law / Conrad Lunsden / 2876 / 5 5 4 5 5 6
Ayden Pang / Tomoe Thiry / 2521 / 6 6 6 6 6 5
Jamie Tsang / Cheuk Wing Mak / 2750 / 7 7 7 7 7 7
Chloe Kong / Ethan Kong / 2411 / 8 8 8 DNF 8 8`;

/* ---- Parser: text block -> event (for manual import) ---- */
function parsePaste(text) {
  const lines = text.split("\n").map(l=>l.trim()).filter(Boolean);
  if(!lines.length) return {ok:false,error:"Nothing to parse yet."};
  const meta={venue:"",date:"",cls:"",discards:1};
  const entries=[]; let name="";
  for(const line of lines){
    const m=line.match(/^(venue|date|class|discards|name)\s*:\s*(.+)$/i);
    if(m){
      const k=m[1].toLowerCase(),v=m[2].trim();
      if(k==="venue") meta.venue=v; else if(k==="date") meta.date=v;
      else if(k==="class") meta.cls=v; else if(k==="name") name=v;
      else if(k==="discards") meta.discards=Math.max(0,parseInt(v)||0);
      continue;
    }
    if(line.includes("/")){
      const parts=line.split("/").map(p=>p.trim());
      if(parts.length<4) return{ok:false,error:`Need 4 "/" fields: Helm / Crew / Sail / scores — "${line.slice(0,40)}"`};
      const[helm,crew,sail,scoreStr]=parts;
      const races=scoreStr.split(/\s+/).filter(Boolean).map(t=>/^\d+$/.test(t)?parseInt(t):t.toUpperCase());
      if(!helm) return{ok:false,error:"A boat is missing a helm name."};
      if(!races.length) return{ok:false,error:`No scores found for ${helm}.`};
      entries.push({helm,crew,sail:sail||"—",div:"",races});
    } else if(!name){name=line;}
  }
  if(!entries.length) return{ok:false,error:"No boats found. Add lines like:  Helm / Crew / Sail / 1 2 3"};
  const maxR=Math.max(...entries.map(e=>e.races.length));
  return{ok:true,event:{
    id:"imp_"+Date.now(),name:name||"Imported Regatta",
    cls:meta.cls||"—",doublehanded:entries.some(e=>e.crew),
    venue:meta.venue||"—",date:meta.date||"Imported",
    discards:Math.min(meta.discards,Math.max(0,maxR-1)),
    scoring:`Low Point · ${Math.min(meta.discards,Math.max(0,maxR-1))} discard(s)`,
    source:"Imported",status:"Final",entries,
  }};
}

/* ---- Heuristic Sailwave text parser (for PDF extraction) ---- */
function parseSailwaveText(rawText) {
  try{
    const sm=rawText.match(/Sailed:\s*(\d+),\s*Discards:\s*(\d+).*?Entries:\s*(\d+)/i);
    if(!sm) return{ok:false,error:"No Sailwave header found (Sailed/Discards/Entries)."};
    const numRaces=parseInt(sm[1]),numDisc=parseInt(sm[2]);
    // Extract first line as regatta name
    const firstLine=(rawText.split('\n')[0]||"").trim().slice(0,80)||"Imported Regatta";
    // Match ordinal rows: 1st 2nd ... up to 40th
    const rowRe=/\b(\d{1,2}(?:st|nd|rd|th))\b(.+?)(?=\b\d{1,2}(?:st|nd|rd|th)\b|Sailwave|$)/gis;
    const entries=[]; let m;
    while((m=rowRe.exec(rawText))!==null&&entries.length<50){
      const seg=m[2];
      // collect all numeric and penalty tokens
      const tokens=(seg.match(/\b(?:\d+\.?\d*|DNF|DNC|DNS|OCS|DSQ|BFD|UFD|RET|RDG)\b/gi)||[]);
      if(tokens.length<numRaces+2) continue;
      const raceTokens=tokens.slice(-(numRaces+2),-2);
      const races=raceTokens.map(t=>/^\d/.test(t)?Math.round(parseFloat(t)):t.toUpperCase());
      if(races.length!==numRaces) continue;
      // sail number: first 3–5 digit number
      const sailM=seg.match(/\b(\d{2,5})\b/);
      const sail=sailM?sailM[1]:"—";
      // names: strip numbers/codes/punct, split at comma
      const nameBlock=seg.replace(/\b(?:\d+\.?\d*|DNF|DNC|DNS|OCS|DSQ|BFD|UFD|RET|RDG|29er|ILCA|Male|Female|Junior|Mix)\b/gi,"").replace(/[()]/g,"").replace(/\s+/g," ").trim();
      const nameParts=nameBlock.split(",").map(n=>n.trim().replace(/\s+/g," ")).filter(n=>n.length>1&&!/^\d+$/.test(n));
      const helm=nameParts[0]||"Unknown";
      const crew=nameParts[1]||"";
      entries.push({sail,div:"",helm,crew,races});
    }
    if(entries.length<3) return{ok:false,error:`Only found ${entries.length} boats. Try Manual import, or send the PDF in chat.`};
    return{ok:true,event:{
      id:"imp_"+Date.now(),name:firstLine,
      cls:"29er",doublehanded:entries.some(e=>e.crew),
      venue:"—",date:"Imported",discards:numDisc,
      scoring:`Low Point · ${numDisc} discard(s)`,
      source:"PDF import",status:"Provisional",entries,
    }};
  }catch(e){return{ok:false,error:"Parse error: "+e.message};}
}

/* ---- pdf.js loader ---- */
let _pdfjs=null;
function loadPdfJs(){
  if(_pdfjs) return Promise.resolve(_pdfjs);
  return new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload=()=>{
      const lib=window.pdfjsLib;
      if(!lib) return rej(new Error("pdf.js unavailable"));
      lib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      _pdfjs=lib; res(lib);
    };
    s.onerror=()=>rej(new Error("Could not load pdf.js"));
    document.body.appendChild(s);
  });
}

/* ---- Scoring engine: Low Point, N discards ---- */
function scoreEvent(ev){
  const fleet=ev.entries.length, pen=fleet+1, disc=ev.discards;
  const rows=ev.entries.map(e=>{
    const pts=e.races.map(c=>isCode(c)?pen:c);
    const order=pts.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
    const discardSet=new Set(order.slice(0,disc).map(o=>o.i));
    const total=pts.reduce((a,b)=>a+b,0);
    const dropped=order.slice(0,disc).reduce((a,b)=>a+b.v,0);
    return{...e,pts,total,net:total-dropped,discardSet};
  });
  rows.sort((a,b)=>a.net-b.net||a.total-b.total);
  let prev=null,prevRank=0;
  rows.forEach((r,i)=>{
    if(prev&&r.net===prev.net&&r.total===prev.total) r.rank=prevRank;
    else{r.rank=i+1;prevRank=r.rank;}
    prev=r;
  });
  return{rows,fleet,races:Math.max(...ev.entries.map(e=>e.races.length))};
}

function aggregate(name,events){
  const history=[]; let wins=0,podiums=0,best=Infinity;
  for(const ev of events){
    const e=ev.entries.find(x=>x.helm===name||x.crew===name);
    if(!e) continue;
    const s=scoreEvent(ev);
    const row=s.rows.find(r=>r.helm===e.helm&&r.crew===e.crew&&r.sail===e.sail);
    const role=e.helm===name?"Helm":"Crew";
    const partner=role==="Helm"?e.crew:e.helm;
    row.races.forEach(c=>{if(c===1) wins++;});
    if(row.rank<=3) podiums++;
    if(row.rank<best) best=row.rank;
    history.push({ev,row,role,partner,fleet:s.fleet});
  }
  history.sort((a,b)=>new Date(b.ev.date)-new Date(a.ev.date));
  return{history,wins,podiums,best:best===Infinity?null:best,events:history.length};
}

const avatarColor=(name)=>{
  const c=["#163a63","#1f4e80","#2a6aa0","#0d6ea0","#264d73","#1a5e8a","#2b557d"];
  let h=0; for(let i=0;i<name.length;i++) h=name.charCodeAt(i)+((h<<5)-h);
  return c[Math.abs(h)%c.length];
};
const initials=n=>n.split(" ").map(w=>w[0]).slice(0,2).join("");

/* ================================================================ */
export default function AthLinkMVP(){
  /* --- core state --- */
  const[events,setEvents]=useState([REAL_2023,REAL_2024]);
  const[verified,setVerified]=useState({});
  const[q,setQ]=useState(""); const[filter,setFilter]=useState("all");
  const[note,setNote]=useState(null);
  /* --- import modal --- */
  const[open,setOpen]=useState(false);
  const[tab,setTab]=useState("pdf");
  const[paste,setPaste]=useState("");
  const[parsedPdf,setParsedPdf]=useState(null);
  const[pdfError,setPdfError]=useState("");
  const[pdfLoading,setPdfLoading]=useState(false);
  /* --- result editor --- */
  const[editCell,setEditCell]=useState(null); // {evId,sail,helm,raceIdx}
  const[editVal,setEditVal]=useState("");
  /* --- navigation --- */
  const[view,setView]=useState({name:"events"});

  const parsedFromPaste=useMemo(()=>paste.trim()?parsePaste(paste):null,[paste]);

  const people=useMemo(()=>{
    const map=new Map();
    events.forEach(ev=>ev.entries.forEach(e=>{
      [e.helm,e.crew].forEach(nm=>{if(nm&&!map.has(nm)) map.set(nm,{name:nm,nat:META[nm]?.nat,ws:null});});
    }));
    return[...map.values()];
  },[events]);

  const go=(v)=>{setView(v);window.scrollTo(0,0);};

  /* ---- import handler (manual) ---- */
  const doImport=()=>{
    if(!parsedFromPaste?.ok) return;
    const ev=parsedFromPaste.event;
    const existing=new Set();
    events.forEach(e=>e.entries.forEach(en=>{existing.add(en.helm);if(en.crew) existing.add(en.crew);}));
    const incoming=new Set();
    ev.entries.forEach(en=>{incoming.add(en.helm);if(en.crew) incoming.add(en.crew);});
    let matched=0,created=0;
    incoming.forEach(n=>existing.has(n)?matched++:created++);
    setEvents(p=>[...p,ev]);
    setNote({name:ev.name,matched,created});
    setOpen(false);setPaste("");setTab("pdf");
    setTimeout(()=>setNote(null),6500);
  };

  /* ---- import handler (pdf) ---- */
  const doImportPdf=()=>{
    if(!parsedPdf) return;
    const existing=new Set();
    events.forEach(e=>e.entries.forEach(en=>{existing.add(en.helm);if(en.crew) existing.add(en.crew);}));
    const incoming=new Set();
    parsedPdf.entries.forEach(en=>{incoming.add(en.helm);if(en.crew) incoming.add(en.crew);});
    let matched=0,created=0;
    incoming.forEach(n=>existing.has(n)?matched++:created++);
    setEvents(p=>[...p,parsedPdf]);
    setNote({name:parsedPdf.name,matched,created});
    setOpen(false);setParsedPdf(null);setPdfError("");setTab("pdf");
    setTimeout(()=>setNote(null),6500);
  };

  const handlePdf=async(file)=>{
    if(!file) return;
    setPdfLoading(true);setParsedPdf(null);setPdfError("");
    try{
      const lib=await loadPdfJs();
      const buf=await file.arrayBuffer();
      const doc=await lib.getDocument({data:buf}).promise;
      let text="";
      for(let i=1;i<=doc.numPages;i++){
        const page=await doc.getPage(i);
        const content=await page.getTextContent();
        text+=content.items.map(it=>it.str).join(" ")+"\n";
      }
      const result=parseSailwaveText(text);
      if(result.ok) setParsedPdf(result.event);
      else setPdfError(result.error);
    }catch(e){
      setPdfError("Couldn't read this PDF in the browser. Send it in chat for an instant clean import.");
    }finally{setPdfLoading(false);}
  };

  /* ---- result editor ---- */
  const startEdit=(evId,sail,helm,raceIdx,currentVal)=>{
    setEditCell({evId,sail,helm,raceIdx});
    setEditVal(String(currentVal));
  };
  const commitEdit=()=>{
    if(!editCell) return;
    const raw=editVal.trim().toUpperCase();
    let newVal;
    if(/^\d+$/.test(raw)){newVal=parseInt(raw);if(newVal<1){setEditCell(null);return;}}
    else if(PENALTY.includes(raw)){newVal=raw;}
    else{setEditCell(null);return;}
    const{evId,sail,helm,raceIdx}=editCell;
    setEvents(prev=>prev.map(ev=>{
      if(ev.id!==evId) return ev;
      return{...ev,entries:ev.entries.map(e=>{
        if(e.sail!==sail||e.helm!==helm) return e;
        const r=[...e.races]; r[raceIdx]=newVal;
        return{...e,races:r};
      })};
    }));
    setEditCell(null);
  };

  return(
    <div className="al-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@500;600;700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        .al-root{--navy:#163a63;--navy2:#1f4e80;--accent:#0d8ecf;--accent2:#2ba3df;
          --sky:#dcecf8;--paper:#f3f7fb;--ink:#14213a;--mut:#5b6b80;--line:#d9e3ef;--card:#fff;--gold:#c8920b;
          font-family:'DM Sans',sans-serif;color:var(--ink);background:var(--paper);min-height:100vh;-webkit-font-smoothing:antialiased;}
        .al-root *{box-sizing:border-box;}
        .disp{font-family:'Barlow',sans-serif;}
        .wrap{max-width:1000px;margin:0 auto;padding:0 22px;}
        .topbar{background:var(--navy);color:#fff;position:sticky;top:0;z-index:30;}
        .topin{max-width:1000px;margin:0 auto;padding:12px 22px;display:flex;align-items:center;gap:26px;}
        .brand{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;flex:none;}
        .nav{display:flex;gap:6px;margin-left:auto;}
        .nav button{font-family:'Barlow',sans-serif;font-weight:600;font-size:15px;color:#bcd2e8;background:none;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;transition:.15s;}
        .nav button:hover{color:#fff;background:rgba(255,255,255,.08);}
        .nav button.on{color:#fff;background:var(--accent);}
        .strip{background:linear-gradient(140deg,#1b4470,#143358);color:#cfe0f1;padding:28px 0 24px;}
        .strip h1{font-family:'Barlow',sans-serif;color:#fff;font-size:30px;font-weight:800;margin:0 0 16px;letter-spacing:-.01em;line-height:1.05;}
        .pillbar{display:flex;gap:20px;flex-wrap:wrap;}
        .pill{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#9fbdd9;}
        .pill b{color:#fff;font-family:'Barlow',sans-serif;font-size:19px;}
        .sec{padding:26px 0 60px;}
        .seclabel{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--mut);margin:0 0 14px;display:flex;align-items:center;gap:8px;}
        .ev{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px 20px;margin-bottom:13px;cursor:pointer;transition:.18s;display:flex;align-items:center;gap:16px;animation:rise .5s both;}
        .ev:hover{border-color:#b9cee4;transform:translateY(-2px);box-shadow:0 12px 30px -16px rgba(22,58,99,.55);}
        .evicon{width:46px;height:46px;border-radius:11px;background:var(--sky);color:var(--navy);display:grid;place-items:center;flex:none;}
        .evname{font-family:'Barlow',sans-serif;font-weight:700;font-size:18px;margin:0 0 3px;}
        .evmeta{font-size:13px;color:var(--mut);display:flex;gap:14px;flex-wrap:wrap;align-items:center;}
        .evmeta span{display:flex;align-items:center;gap:5px;}
        .badge{font-size:11px;font-weight:700;color:var(--navy2);background:var(--sky);padding:4px 9px;border-radius:20px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;}
        .badge.imp{color:#0a7a48;background:#d8f0e3;}
        .cls{font-family:'Barlow',sans-serif;font-weight:700;font-size:13px;color:#fff;background:var(--navy2);padding:4px 11px;border-radius:7px;flex:none;letter-spacing:.02em;}
        .panel{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:auto;}
        table{width:100%;border-collapse:collapse;font-size:13px;min-width:680px;}
        thead th{background:var(--navy);color:#fff;font-family:'Barlow',sans-serif;font-weight:600;text-align:center;padding:11px 5px;font-size:12.5px;}
        thead th.l{text-align:left;padding-left:18px;}
        tbody td{padding:10px 5px;text-align:center;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;}
        tbody td.l{text-align:left;padding-left:18px;}
        tbody td.editable{cursor:text;}
        tbody td.editable:hover{background:#eef4fb;}
        tbody tr:last-child td{border-bottom:0;}
        .rk{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;width:40px;}
        .rk.p1{color:var(--gold);}.rk.p2{color:#7d8a98;}.rk.p3{color:#a86a32;}
        .boat{display:flex;align-items:center;gap:10px;}
        .av{width:30px;height:30px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none;font-family:'Barlow',sans-serif;}
        .cn{font-size:11.5px;color:var(--mut);}
        .namelink{color:var(--accent);font-weight:600;cursor:pointer;}.namelink:hover{text-decoration:underline;}
        .disc{color:var(--mut);}.code{color:#c0392b;font-weight:600;font-size:11.5px;}
        .net{font-family:'Barlow',sans-serif;font-weight:700;color:var(--navy);}
        .vchip{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--accent);font-weight:600;}
        .divtag{font-size:10px;font-weight:700;letter-spacing:.03em;color:var(--navy2);background:var(--sky);padding:2px 7px;border-radius:5px;}
        .cellinput{width:44px;text-align:center;border:1.5px solid var(--accent);border-radius:5px;padding:3px 2px;font-family:inherit;font-size:13px;outline:none;background:#fff;color:var(--ink);}
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
        .btn{font-family:'Barlow',sans-serif;font-weight:600;font-size:15px;border:0;border-radius:10px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:10px 17px;transition:.15s;}
        .btn.cta{background:var(--accent);color:#fff;}.btn.cta:hover{background:var(--accent2);}
        .btn.ghost{background:#fff;border:1px solid var(--line);color:var(--ink);}.btn.ghost:hover{border-color:#b9cee4;}
        .btn:disabled{opacity:.5;cursor:default;}
        .phead{background:linear-gradient(135deg,#1b4470,#143358);border-radius:18px;padding:26px;color:#fff;display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;}
        .phead .av{width:74px;height:74px;font-size:26px;border:3px solid rgba(255,255,255,.22);}
        .pname{font-family:'Barlow',sans-serif;font-weight:800;font-size:28px;margin:0;line-height:1;}
        .pmeta{color:#bcd2e8;font-size:14px;margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;}
        .pmeta span{display:flex;align-items:center;gap:5px;}
        .pstats{display:flex;gap:28px;margin-top:18px;flex-wrap:wrap;}
        .pstats .v{font-family:'Barlow',sans-serif;font-weight:800;font-size:25px;}
        .pstats .k{font-size:11px;color:#9fbdd9;letter-spacing:.05em;text-transform:uppercase;}
        .claimbox{margin-left:auto;text-align:right;}
        .wsid{font-size:12px;color:#9fbdd9;margin-top:6px;max-width:200px;}
        .vbox{background:rgba(13,142,207,.16);border:1px solid rgba(13,142,207,.5);border-radius:12px;padding:12px 16px;color:#dcecf8;font-size:13px;max-width:240px;}
        .vbox b{color:#fff;display:flex;align-items:center;gap:6px;font-family:'Barlow',sans-serif;}
        .histrow{background:var(--card);border:1px solid var(--line);border-radius:13px;padding:15px 18px;margin-bottom:11px;display:flex;align-items:center;gap:16px;animation:rise .45s both;}
        .hrk{font-family:'Barlow',sans-serif;font-weight:800;font-size:22px;width:58px;text-align:center;flex:none;color:var(--navy);}
        .hrk.p1{color:var(--gold);}.hrk.p2{color:#7d8a98;}.hrk.p3{color:#a86a32;}
        .hrk small{display:block;font-size:10px;color:var(--mut);font-weight:600;}
        .rolechip{font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 7px;border-radius:5px;text-transform:uppercase;font-family:'Barlow',sans-serif;}
        .rolechip.helm{color:#fff;background:var(--navy2);}
        .rolechip.crew{color:var(--navy2);background:var(--sky);}
        .miniraces{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;}
        .rc{width:24px;height:24px;border-radius:6px;background:var(--sky);color:var(--navy);font-size:10px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums;}
        .rc.c{background:#fbe3e0;color:#c0392b;}.rc.d{background:#eef2f7;color:var(--mut);}.rc.w{background:var(--accent);color:#fff;}
        .notice{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:60;background:var(--navy);color:#fff;border-radius:13px;padding:14px 20px;display:flex;gap:13px;align-items:center;box-shadow:0 20px 50px -18px rgba(0,0,0,.6);animation:rise .4s both;max-width:92%;}
        .notice b{font-family:'Barlow',sans-serif;}
        .notice .ico{background:var(--accent);color:#fff;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex:none;}
        .back{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:14px;color:var(--navy2);background:none;border:0;cursor:pointer;margin-bottom:16px;padding:0;}
        .back:hover{color:var(--accent);}
        .prov{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:#9a6b1f;background:#f6ecd6;padding:4px 10px;border-radius:20px;font-weight:600;}
        .foot{font-size:12px;color:var(--mut);text-align:center;padding:30px 0;}
        .ov{position:fixed;inset:0;background:rgba(16,33,58,.55);z-index:70;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto;animation:fade .2s both;}
        .modal{background:var(--paper);width:100%;max-width:600px;border-radius:18px;overflow:hidden;box-shadow:0 30px 70px -20px rgba(0,0,0,.5);animation:rise .3s both;}
        .mhead{background:var(--navy);color:#fff;padding:18px 22px;display:flex;align-items:center;gap:10px;}
        .mhead h3{font-family:'Barlow',sans-serif;font-weight:700;font-size:19px;margin:0;flex:1;}
        .mhead .x{background:rgba(255,255,255,.12);border:0;color:#fff;width:32px;height:32px;border-radius:8px;cursor:pointer;display:grid;place-items:center;}
        .mhead .x:hover{background:rgba(255,255,255,.22);}
        .mtabs{display:flex;gap:6px;padding:14px 22px 0;}
        .mtabs button{font-family:'Barlow',sans-serif;font-weight:600;font-size:14px;border:0;background:none;color:var(--mut);padding:9px 14px;border-radius:9px 9px 0 0;cursor:pointer;display:flex;align-items:center;gap:7px;}
        .mtabs button.on{color:var(--navy);background:#fff;border:1px solid var(--line);border-bottom:0;}
        .mbody{padding:18px 22px 22px;}
        .hint{background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;font-size:12.5px;color:var(--mut);line-height:1.55;margin-bottom:12px;}
        .hint code{background:var(--sky);color:var(--navy);padding:1px 6px;border-radius:5px;font-size:12px;}
        textarea{width:100%;min-height:170px;border:1px solid var(--line);border-radius:10px;padding:12px;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;line-height:1.5;color:var(--ink);background:#fff;resize:vertical;outline:none;}
        textarea:focus{border-color:var(--accent);}
        .prev{margin-top:12px;border-radius:10px;padding:12px 14px;font-size:13px;}
        .prev.ok{background:#d8f0e3;color:#0a6b41;}.prev.err{background:#fbe7e4;color:#a8362a;}
        .mfoot{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;}
        .link{background:none;border:0;color:var(--accent);font:inherit;font-weight:600;cursor:pointer;padding:0;}
        @keyframes rise{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
        @keyframes fade{from{opacity:0;}to{opacity:1;}}
        .spin{animation:spin 1s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}
      `}</style>

      {/* TOPBAR */}
      <div className="topbar"><div className="topin">
        <div className="brand" onClick={()=>go({name:"events"})} title="AthLink"><Link2 size={15}/></div>
        <nav className="nav">
          <button className={view.name==="events"?"on":""} onClick={()=>go({name:"events"})}>Regattas</button>
          <button className={view.name==="athletes"||view.name==="profile"?"on":""} onClick={()=>go({name:"athletes"})}>Athletes</button>
        </nav>
      </div></div>

      {/* ===== EVENTS ===== */}
      {view.name==="events"&&(<>
        <div className="strip"><div className="wrap">
          <h1 className="disp">Hong Kong 29er Class Association</h1>
          <div className="pillbar">
            <div className="pill"><Trophy size={16}/><b>{events.length}</b> regattas</div>
            <div className="pill"><Users size={16}/><b>{people.length}</b> sailors</div>
            <div className="pill"><Anchor size={16}/><b>{events.reduce((a,e)=>a+e.entries.length,0)}</b> boats</div>
          </div>
        </div></div>
        <div className="wrap sec">
          <div className="toolbar">
            <p className="seclabel" style={{margin:0,flex:1}}><Waves size={14}/> Results</p>
            <button className="btn cta" onClick={()=>setOpen(true)}><Upload size={16}/> Import a regatta</button>
          </div>
          {events.map((ev,i)=>{
            const s=scoreEvent(ev);
            return(
              <div className="ev" key={ev.id} style={{animationDelay:`${i*70}ms`}} onClick={()=>go({name:"event",id:ev.id})}>
                <div className="evicon"><Anchor size={22}/></div>
                <div style={{flex:1,minWidth:0}}>
                  <p className="evname">{ev.name}</p>
                  <div className="evmeta">
                    <span><MapPin size={13}/>{ev.venue}</span>
                    <span><Calendar size={13}/>{ev.date}</span>
                    <span><Users size={13}/>{s.fleet} boats · {s.races} races</span>
                  </div>
                </div>
                <span className={"badge"+(ev.source==="Imported"||ev.source==="PDF import"?" imp":"")}><BadgeCheck size={12}/>{ev.source}</span>
                <span className="cls">{ev.cls}</span>
                <ChevronRight size={20} color="#9fb2c8"/>
              </div>
            );
          })}
        </div>
      </>)}

      {/* ===== SINGLE EVENT ===== */}
      {view.name==="event"&&(()=>{
        const ev=events.find(e=>e.id===view.id);
        const s=scoreEvent(ev);
        return(
          <div className="wrap sec" style={{paddingTop:26}}>
            <button className="back" onClick={()=>go({name:"events"})}><ArrowLeft size={16}/> All regattas</button>
            <h1 className="disp" style={{fontSize:25,margin:"0 0 6px"}}>{ev.name}</h1>
            <div className="evmeta" style={{marginBottom:10}}>
              <span><MapPin size={13}/>{ev.venue}</span>
              <span><Calendar size={13}/>{ev.date}</span>
              <span><Flag size={13}/>{ev.cls} · {ev.scoring}</span>
            </div>
            <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
              <span className="vchip"><BadgeCheck size={13}/>Source: {ev.source}</span>
              <span className="prov"><Clock size={12}/>{ev.status}</span>
              <span style={{fontSize:12,color:"var(--mut)",marginLeft:"auto",display:"flex",alignItems:"center",gap:5}}>
                <Pencil size={12}/>Click a score to edit
              </span>
            </div>
            <div className="panel"><table>
              <thead><tr>
                <th>Pos</th><th className="l">Boat</th><th>Sail</th>
                {Array.from({length:s.races}).map((_,i)=><th key={i}>R{i+1}</th>)}
                <th>Net</th>
              </tr></thead>
              <tbody>
                {s.rows.map(r=>(
                  <tr key={r.sail+r.helm}>
                    <td className={`rk ${r.rank<=3?"p"+r.rank:""}`}>{r.rank}</td>
                    <td className="l"><div className="boat">
                      <div className="av" style={{background:avatarColor(r.helm)}}>{initials(r.helm)}</div>
                      <div>
                        <div className="namelink" onClick={()=>go({name:"profile",id:r.helm})}>{r.helm}</div>
                        <div className="cn">{r.crew?<>with <span className="namelink" onClick={()=>go({name:"profile",id:r.crew})}>{r.crew}</span></>:"single-handed"}{r.div?<span className="divtag" style={{marginLeft:8}}>{r.div}</span>:null}</div>
                      </div>
                    </div></td>
                    <td className="cn">{r.sail}</td>
                    {Array.from({length:s.races}).map((_,i)=>{
                      const c=r.races[i];
                      const isEditing=editCell&&editCell.evId===ev.id&&editCell.sail===r.sail&&editCell.helm===r.helm&&editCell.raceIdx===i;
                      if(isEditing) return(
                        <td key={i}>
                          <input className="cellinput" autoFocus value={editVal}
                            onChange={e=>setEditVal(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={e=>{if(e.key==="Enter") commitEdit(); if(e.key==="Escape") setEditCell(null);}}
                          />
                        </td>
                      );
                      if(c===undefined) return<td key={i} className="disc">–</td>;
                      return(
                        <td key={i}
                          className={"editable "+(isCode(c)?"code":r.discardSet.has(i)?"disc":"")}
                          onClick={()=>startEdit(ev.id,r.sail,r.helm,i,c)}
                          title="Click to edit"
                        >
                          {isCode(c)?c:r.discardSet.has(i)?`(${c})`:c}
                        </td>
                      );
                    })}
                    <td className="net">{r.net}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <p style={{fontSize:12,color:"var(--mut)",marginTop:12}}>
              ( ) = discard · red = penalty (fleet + 1 = {s.fleet+1}) · edits update rankings and profiles instantly
            </p>
          </div>
        );
      })()}

      {/* ===== ATHLETES ===== */}
      {view.name==="athletes"&&(
        <div className="wrap sec" style={{paddingTop:26}}>
          <h1 className="disp" style={{fontSize:26,margin:"0 0 4px"}}>Athletes</h1>
          <p style={{color:"var(--mut)",fontSize:14,margin:"0 0 18px"}}>
            One profile per sailor, auto-built from results across every event.
          </p>
          <div className="toolbar">
            <div className="srch"><Search size={16} color="#9fb2c8"/><input placeholder="Search sailors…" value={q} onChange={e=>setQ(e.target.value)}/></div>
            <div className="seg">{["all","verified","unverified"].map(f=>(
              <button key={f} className={filter===f?"on":""} onClick={()=>setFilter(f)}>{f[0].toUpperCase()+f.slice(1)}</button>
            ))}</div>
          </div>
          <div className="agrid">
            {people
              .filter(p=>q?p.name.toLowerCase().includes(q.toLowerCase()):true)
              .filter(p=>filter==="all"?true:filter==="verified"?verified[p.name]:!verified[p.name])
              .map((p,i)=>{
                const ag=aggregate(p.name,events);
                return(
                  <div className="acard" key={p.name} style={{animationDelay:`${i*28}ms`}} onClick={()=>go({name:"profile",id:p.name})}>
                    <div className="achead">
                      <div className="av" style={{background:avatarColor(p.name)}}>{initials(p.name)}</div>
                      <div><div className="acn">{p.name}</div>
                        <div className="cn" style={{marginTop:2}}>{p.nat||"29er"}{ag.events>1?" · multi-event":""}</div></div>
                    </div>
                    <div className="acstat">
                      <div><b>{ag.events}</b>regattas</div>
                      <div><b>{ag.best?"#"+ag.best:"—"}</b>best</div>
                      <div style={{marginLeft:"auto",alignSelf:"center"}}>
                        {verified[p.name]?<span className="vchip"><BadgeCheck size={13}/> Verified</span>:<span style={{fontSize:11.5,color:"var(--mut)"}}>Unverified</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* ===== PROFILE ===== */}
      {view.name==="profile"&&(()=>{
        const name=view.id;
        const p=people.find(x=>x.name===name)||{name};
        const ag=aggregate(name,events);
        const isV=verified[name];
        return(
          <div className="wrap sec" style={{paddingTop:22}}>
            <button className="back" onClick={()=>go({name:"athletes"})}><ArrowLeft size={16}/> Athletes</button>
            <div className="phead">
              <div className="av" style={{background:avatarColor(name)}}>{initials(name)}</div>
              <div style={{flex:1,minWidth:200}}>
                <h1 className="pname disp">{name}</h1>
                <div className="pmeta"><span><Anchor size={14}/>29er</span>{p.nat?<span><Flag size={14}/>{p.nat}</span>:null}</div>
                <div className="pstats">
                  <div><div className="v disp">{ag.events}</div><div className="k">Regattas</div></div>
                  <div><div className="v disp">{ag.best?"#"+ag.best:"—"}</div><div className="k">Best result</div></div>
                  <div><div className="v disp">{ag.podiums}</div><div className="k">Podiums</div></div>
                  <div><div className="v disp">{ag.wins}</div><div className="k">Race wins</div></div>
                </div>
              </div>
              <div className="claimbox">
                {isV?(
                  <div className="vbox"><b><BadgeCheck size={16}/>Verified profile</b>
                    <div style={{marginTop:5}}>Tracking {ag.events} regatta{ag.events>1?"s":""} in one record.</div></div>
                ):(
                  <>
                    <button className="btn cta" onClick={()=>setVerified({...verified,[name]:true})}><BadgeCheck size={16}/>Verify this profile</button>
                    <div className="wsid">{p.ws?`World Sailing ID ${p.ws}`:"No World Sailing ID — matched by name + sail number"}</div>
                  </>
                )}
              </div>
            </div>
            <div style={{marginTop:22}}>
              <p className="seclabel"><Trophy size={14}/>Result history</p>
              {ag.history.map((h,i)=>(
                <div className="histrow" key={h.ev.id} style={{animationDelay:`${i*70}ms`}}>
                  <div className={`hrk ${h.row.rank<=3?"p"+h.row.rank:""}`}>#{h.row.rank}<small>of {h.fleet}</small></div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
                      <span className="disp" style={{fontWeight:700,fontSize:16,cursor:"pointer"}} onClick={()=>go({name:"event",id:h.ev.id})}>{h.ev.name}</span>
                      <span className={"rolechip "+h.role.toLowerCase()}>{h.role}</span>
                    </div>
                    <div className="cn" style={{marginTop:3}}>
                      {h.ev.date} · net {h.row.net}{h.partner?<> · with <span className="namelink" onClick={()=>go({name:"profile",id:h.partner})}>{h.partner}</span></>:""}
                    </div>
                    <div className="miniraces">
                      {h.row.races.map((c,j)=>(
                        <div key={j} className={`rc ${isCode(c)?"c":c===1?"w":h.row.discardSet.has(j)?"d":""}`}>{isCode(c)?c.slice(0,2):c}</div>
                      ))}
                    </div>
                  </div>
                  <span className="vchip"><BadgeCheck size={13}/>Verified result</span>
                </div>
              ))}
            </div>
            {!isV&&(
              <p style={{fontSize:13,color:"var(--mut)",marginTop:14,display:"flex",gap:7,alignItems:"center"}}>
                <Sparkles size={15} color="var(--accent)"/>Built automatically from regatta results. Verifying lets {name.split(" ")[0]} confirm and own this record.
              </p>
            )}
          </div>
        );
      })()}

      {/* ===== IMPORT MODAL ===== */}
      {open&&(
        <div className="ov" onClick={()=>setOpen(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="mhead"><Upload size={18}/><h3>Import a regatta</h3><button className="x" onClick={()=>setOpen(false)}><X size={16}/></button></div>
            <div className="mtabs">
              <button className={tab==="pdf"?"on":""} onClick={()=>setTab("pdf")}><FileText size={15}/>Upload PDF</button>
              <button className={tab==="manual"?"on":""} onClick={()=>setTab("manual")}><ClipboardPaste size={15}/>Manual import</button>
            </div>
            <div className="mbody">
              {tab==="pdf"?(
                <>
                  <label className="btn cta" style={{cursor:"pointer",marginBottom:4}}>
                    {pdfLoading?<><Loader2 size={16} className="spin"/>Reading PDF…</>:<><Upload size={16}/>Import file from computer</>}
                    <input type="file" accept="application/pdf" style={{display:"none"}} disabled={pdfLoading} onChange={e=>handlePdf(e.target.files?.[0])}/>
                  </label>
                  {pdfError&&<div className="prev err" style={{marginTop:14}}><AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:5}}/>{pdfError} <button className="link" onClick={()=>setTab("manual")}>Try manual import →</button></div>}
                  {parsedPdf&&(
                    <div style={{marginTop:14}}>
                      <div className="prev ok"><b>{parsedPdf.name}</b> — {parsedPdf.entries.length} boats, {Math.max(...parsedPdf.entries.map(e=>e.races.length))} races, {parsedPdf.discards} discards. Ready to import.</div>
                      <div className="mfoot">
                        <button className="btn ghost" onClick={()=>{setParsedPdf(null);setPdfError("");}}>Cancel</button>
                        <button className="btn cta" onClick={doImportPdf}><Upload size={16}/>Import regatta</button>
                      </div>
                    </div>
                  )}
                </>
              ):(
                <>
                  <div className="hint">
                    First line = regatta name. Optional: <code>venue:</code> <code>date:</code> <code>class:</code> <code>discards:</code>.
                    Then one boat per line: <code>Helm / Crew / Sail / scores</code>
                    <div style={{marginTop:8}}><button className="link" onClick={()=>setPaste(SAMPLE_TEXT)}>Load a sample →</button></div>
                  </div>
                  <textarea value={paste} onChange={e=>setPaste(e.target.value)} placeholder={"Spring Nationals 2024\nvenue: Aberdeen\nclass: ILCA 6\ndiscards: 1\nCameron Law / Christopher Lam / 3054 / 1 2 1 DNF 3"}/>
                  {parsedFromPaste&&(
                    parsedFromPaste.ok
                      ?<div className="prev ok"><b>{parsedFromPaste.event.name}</b> — {parsedFromPaste.event.entries.length} boats, {Math.max(...parsedFromPaste.event.entries.map(e=>e.races.length))} races, {parsedFromPaste.event.discards} discard{parsedFromPaste.event.discards===1?"":"s"}.</div>
                      :<div className="prev err"><AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:5}}/>{parsedFromPaste.error}</div>
                  )}
                  <div className="mfoot">
                    <button className="btn ghost" onClick={()=>setOpen(false)}>Cancel</button>
                    <button className="btn cta" disabled={!parsedFromPaste?.ok} onClick={doImport}><Upload size={16}/>Import regatta</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {note&&(
        <div className="notice">
          <div className="ico"><Sparkles size={18}/></div>
          <div><b>{note.name} imported</b>
            <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>Matched {note.matched} sailors · {note.created} new profiles created</div></div>
        </div>
      )}

      <div className="foot">Powered by AthLink</div>
    </div>
  );
}
