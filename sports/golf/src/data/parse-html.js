/* Sailwave HTML results parser — extracted from App.jsx (reorg step 4).
   Pure browser-side parse of the standard Sailwave HTML export into the
   app event shape; only parseHtml is public (helpers + SCORE_CODES_SET are
   module-internal). Verbatim. */

import { normGender, normCategory } from "../util/gender.js";

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

export function parseHtml(htmlString){
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
