/* Host registries (associations / clubs / federations) for sailing — the
   DEFAULT_* seeds + the runtime-merged registries and their lookups.
   Reorg step 4: first data/ module. Runtime-mutable module state — reads are
   ESM live bindings; all mutation (applyDbHosts / addHostLocal / removeHostLocal)
   happens INSIDE this module, so App.jsx only reads + calls (its setHostsVersion
   useState still drives re-renders; behaviour unchanged). Verbatim from App.jsx. */

import { SB_URL, SB_KEY, authHeaders } from "@athlink/core";

// ── Associations: each portal is one association ──
// ── Hosts (associations, clubs, federations) ────────────────────────────────
// Hosts own/co-own events. Three types:
//   association — locked to one boat class (has `cls`)
//   club        — any class (no `cls`)
//   federation  — governing body of a country; auto-collaborates on every event
//                 hosted in its country (`country`), across all classes.
// These DEFAULT_* arrays are the always-present seeds; hosts added via dev mode
// are stored in Supabase (`hosts` table) and merged in at runtime.
export const DEFAULT_ASSOCIATIONS=[
  {id:"hk-29er",     type:"association", scope:"HK",  cls:"29er",     name:"Hong Kong 29er Class Association"},
  {id:"hk-ilca",     type:"association", scope:"HK",  cls:"ilca",     name:"Hong Kong ILCA"},
  {id:"hk-optimist", type:"association", scope:"HK",  cls:"optimist", name:"Hong Kong Optimist Dinghy Association"},
  {id:"int-29er",    type:"association", scope:"INT", cls:"29er",     name:"International 29er Class Association"},
  {id:"int-ilca",    type:"association", scope:"INT", cls:"ilca",     name:"International Laser Class Association"},
  {id:"int-optimist",type:"association", scope:"INT", cls:"optimist", name:"International Optimist Dinghy Association"},
  {id:"int-49er",    type:"association", scope:"INT", cls:"49er",     name:"International 49er Class Association"},
];
export const DEFAULT_CLUBS=[
  {id:"rhkyc", type:"club", scope:"HK", name:"Royal Hong Kong Yacht Club"},
];
export const DEFAULT_FEDERATIONS=[
  {id:"hksf", type:"federation", scope:"HK", country:"HKG", name:"Hong Kong Sailing Federation"},
];
// Mutable runtime registries (defaults + DB-added). Rebuilt by applyDbHosts.
export let ASSOCIATIONS=[...DEFAULT_ASSOCIATIONS];
export let CLUBS=[...DEFAULT_CLUBS];
export let FEDERATIONS=[...DEFAULT_FEDERATIONS];
// Merge DB host rows on top of the defaults (by id; defaults always win on id clash).
export function applyDbHosts(rows){
  const norm=t=>(rows||[]).filter(r=>r.type===t).map(r=>({
    id:r.id, type:r.type, scope:r.scope||"HK", name:r.name,
    ...(r.cls?{cls:r.cls}:{}), ...(r.country?{country:r.country}:{}),
    ...(r.slug?{slug:r.slug}:{}),
    ...(r.logo_url?{logo_url:r.logo_url}:{}),          // recolored host/association logo (bucket url)
    ...(r.dossier?{dossier:r.dossier}:{}),             // host auto-grab research dossier (migration 0012)
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
export function addHostLocal(h){
  const arr=h.type==="association"?ASSOCIATIONS:h.type==="club"?CLUBS:FEDERATIONS;
  if(!arr.some(x=>x.id===h.id)) arr.unshift(h);
}
export function removeHostLocal(id){
  ASSOCIATIONS=ASSOCIATIONS.filter(a=>a.id!==id);
  CLUBS=CLUBS.filter(c=>c.id!==id);
  FEDERATIONS=FEDERATIONS.filter(f=>f.id!==id);
}
export const assocById=id=>ASSOCIATIONS.find(a=>a.id===id);
export const clubById=id=>CLUBS.find(c=>c.id===id);
export const fedById=id=>FEDERATIONS.find(f=>f.id===id);
export const isClubId=id=>!!clubById(id);
export const isFedId=id=>!!fedById(id);
// Resolve any host id (association, club OR federation) to its record / name.
export const hostById=id=>assocById(id)||clubById(id)||fedById(id)||null;

/* ── Host trust REST (host_members / host_invites / host_audit) ── */
export async function hostRest(path,opts={},tok){
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
export const fetchHostMembers=(hostId,tok)=>hostRest(`host_members?host_id=eq.${encodeURIComponent(hostId)}&select=*&order=created_at.asc`,{},tok);
// Every membership for the current user (to compute their editable hosts).
export const fetchMyMemberships=(userId,tok)=>hostRest(`host_members?user_id=eq.${userId}&select=*`,{},tok);
export const fetchHostInvites=(hostId,tok)=>hostRest(`host_invites?host_id=eq.${encodeURIComponent(hostId)}&select=*&order=created_at.desc`,{},tok);
export const fetchHostAudit=(hostId,tok)=>hostRest(`host_audit?host_id=eq.${encodeURIComponent(hostId)}&select=*&order=ts.desc&limit=50`,{},tok);
export const fetchInviteByToken=(token,tok)=>hostRest(`host_invites?token=eq.${encodeURIComponent(token)}&select=*`,{},tok);

export async function logHostAudit(hostId,actorId,action,targetId,detail,tok){
  return hostRest("host_audit",{method:"POST",body:JSON.stringify({host_id:hostId,actor_user_id:actorId,action,target_user_id:targetId||null,detail:detail||null})},tok);
}
export function randToken(){
  // url-safe random token
  const a=new Uint8Array(18); (window.crypto||window.msCrypto).getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
// Human-typable short code: 8 chars from an unambiguous uppercase alphabet
// (no 0/O, 1/I/L, etc.) — safe to read aloud, type, and copy.
export function randShortCode(){
  const alphabet="ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const a=new Uint8Array(8); (window.crypto||window.msCrypto).getRandomValues(a);
  return Array.from(a,b=>alphabet[b%alphabet.length]).join("");
}

/* ── Host / association portal logos (host-logos bucket) ──────────────────────
   A host (federation, club, OR class association) can upload its own logo in the
   Edit page. The uploader lets the user square-crop/centre the image, then the
   background is removed ONCE at upload time (KEEPING the logo's original colours)
   and the transparent PNG is stored in the public `host-logos` bucket
   (migrations/0011). The transform is baked in here — never at render — so the
   single stored asset renders consistently in the directory thumbnail and the
   portal header. Associations reuse this exact path: an association IS a class-
   locked host, so its uploaded logo is its "class logo" — no separate subsystem. */
export const HOST_LOGO_BUCKET="host-logos";
// Remove the (assumed roughly-uniform) background from a logo while KEEPING its
// original colours. Samples the four corners of the DRAWN image to estimate the
// background colour, makes pixels within tolerance of it transparent, and feathers
// the transition band so edges don't alias. `src` is a square canvas (from the
// cropper); with contain-fit the logo is letterboxed on transparent padding, so
// we must sample the corners of the opaque region — NOT the canvas corners, which
// are now transparent padding. Returns a PNG Blob on transparent. Deterministic;
// runs client-side.
export function removeLogoBackground(src){
  const W=src.width, H=src.height;
  const ctx=src.getContext("2d");
  const id=ctx.getImageData(0,0,W,H); const d=id.data;
  // Opaque bounding box of the drawn image. Sampling the canvas corners would hit
  // the transparent letterbox padding (alpha 0) and find no background, so the
  // logo's own background (e.g. a white box behind a wide club logo) would survive.
  let minX=W,minY=H,maxX=-1,maxY=-1;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){ if(d[(y*W+x)*4+3]>10){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; } }
  if(maxX<minX||maxY<minY) return new Promise(res=>src.toBlob(res,"image/png")); // fully transparent
  const bw=maxX-minX+1, bh=maxY-minY+1;
  // Estimate background colour from a small patch inside each corner of the opaque
  // box (averaged over still-opaque pixels there).
  const P=Math.max(2,Math.round(Math.min(bw,bh)*0.06));
  let sr=0,sg=0,sb=0,cnt=0;
  const acc=(x,y)=>{if(x<0||y<0||x>=W||y>=H)return;const i=(y*W+x)*4; if(d[i+3]>10){sr+=d[i];sg+=d[i+1];sb+=d[i+2];cnt++;}};
  for(let y=0;y<P;y++)for(let x=0;x<P;x++){acc(minX+x,minY+y);acc(maxX-x,minY+y);acc(minX+x,maxY-y);acc(maxX-x,maxY-y);}
  if(!cnt) return new Promise(res=>src.toBlob(res,"image/png")); // already transparent
  const bgR=sr/cnt,bgG=sg/cnt,bgB=sb/cnt;
  // Euclidean RGB distance to the background: inside NEAR → fully transparent;
  // between NEAR and FAR → feather; beyond FAR → keep opaque at original colour.
  const NEAR=48, FAR=112;
  for(let p=0;p<d.length;p+=4){
    if(d[p+3]===0) continue;                 // leave letterbox padding transparent
    const dist=Math.sqrt((d[p]-bgR)**2+(d[p+1]-bgG)**2+(d[p+2]-bgB)**2);
    if(dist<=NEAR) d[p+3]=0;
    else if(dist<FAR) d[p+3]=Math.round(d[p+3]*((dist-NEAR)/(FAR-NEAR)));
    // else: keep original RGBA untouched
  }
  ctx.putImageData(id,0,0);
  return new Promise(res=>src.toBlob(res,"image/png"));
}
// Upload an already-processed logo PNG Blob (background removed, original colours
// kept) to `host-logos` under a `<host slug>/` prefix; returns its public URL
// (or null on any failure — never throws, mirroring the other upload helpers).
export async function uploadHostLogo(blob,host,tok){
  if(!SB_URL||!blob||!host) return null;   // no token → anon write (dev view; RLS from migration 0013 decides)
  const slug=String(host.id||"host").replace(/[^a-z0-9-]+/gi,"-").toLowerCase()||"host";
  const path=`${slug}/${Date.now()}.png`;
  try{
    const r=await fetch(`${SB_URL}/storage/v1/object/${HOST_LOGO_BUCKET}/${path}`,{method:"POST",
      headers:{"apikey":SB_KEY,"Authorization":`Bearer ${tok||SB_KEY}`,"Content-Type":"image/png","x-upsert":"true"},
      body:blob});
    if(!r.ok){console.error("uploadHostLogo",r.status,await r.text().catch(()=>""));return null;}
    return `${SB_URL}/storage/v1/object/public/${HOST_LOGO_BUCKET}/${path}`;
  }catch(e){console.error("uploadHostLogo network",e);return null;}
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
export const fetchCustomClasses=(tok)=>hostRest("custom_classes?select=*",{},tok);
export async function insertCustomClass(cc,userId,tok){
  return hostRest("custom_classes",{method:"POST",
    headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
    body:JSON.stringify({id:cc.id,canonical:cc.canonical,short:cc.short,full:cc.full,color:cc.color,created_by:userId})},tok);
}
// Write-behind queue for custom classes that couldn't be persisted yet.
export const PENDING_CC_KEY="athlink_pending_custom_classes";
export function readPendingCustomClasses(){
  try{const a=JSON.parse(localStorage.getItem(PENDING_CC_KEY)||"[]");return Array.isArray(a)?a:[];}catch{return[];}
}
export function queuePendingCustomClass(cc){
  try{
    const q=readPendingCustomClasses().filter(p=>p.canonical!==cc.canonical);
    q.push({id:cc.id,canonical:cc.canonical,short:cc.short,full:cc.full,color:cc.color});
    localStorage.setItem(PENDING_CC_KEY,JSON.stringify(q));
  }catch(e){console.error("queuePendingCustomClass",e);}
}
export function dropPendingCustomClass(canonical){
  try{
    const q=readPendingCustomClasses().filter(p=>p.canonical!==canonical);
    localStorage.setItem(PENDING_CC_KEY,JSON.stringify(q));
  }catch(e){console.error("dropPendingCustomClass",e);}
}

// Fetch invite by dedicated short_code column (exact, case-insensitive)
export const fetchInviteByShortCode=(code,tok)=>hostRest(`host_invites?short_code=eq.${encodeURIComponent(code.toUpperCase())}&select=*`,{},tok);
// Mark invite used (single-use enforcement)
export const markInviteUsed=(token,userId,tok)=>hostRest(`host_invites?token=eq.${encodeURIComponent(token)}`,{method:"PATCH",body:JSON.stringify({used_at:new Date().toISOString(),used_by:userId})},tok);

/* ── Host auto-grab: localhost mock ───────────────────────────────────────────
   /api/research_host and the /api/sailing/parse_pdf probe are NEW endpoints — they only
   exist on a Vercel preview deploy, so on localhost:5173 they 404. Flip
   MOCK_RESEARCH to true to smoke-test the signup research card + discovery view
   WITHOUT a deploy. It MUST default to false — with it false, real calls hit the
   live endpoints. mockResearchIdentity(name,kind,countryHint) mirrors the
   research_host.py identity-mode response shape exactly. */
export const MOCK_RESEARCH=false;
export function mockResearchIdentity(name,kind,countryHint){
  const nm=(name||"").trim();
  const c=(countryHint&&countryHint.length===3?countryHint:"HKG").toUpperCase();
  return {ok:true,mode:"identity",found:true,
    official_name:nm||"Sample Sailing Club",
    acronym:(nm||"SSC").split(/\s+/).map(w=>w[0]||"").join("").toUpperCase().slice(0,5),
    website:"https://example.org",country:c,
    classes:kind==="association"?["ILCA"]:["ILCA","Optimist","29er"],
    blurb:`${nm||"The organisation"} organises sailing competitions.`,
    competitions:[
      {name:`${c} National Championship 2025`,year:2025,class:"ILCA",url:"https://example.org/nats-2025.pdf"},
      {name:`${c} Youth Series 2024`,year:2024,class:"Optimist",url:"https://example.org/youth-2024.htm"},
      {name:`${c} Winter Regatta 2024`,year:2024,class:"29er",url:null},
    ],
    sources:["https://example.org"]};
}
// Mirrors research_host.py competitions-mode: a longer list, each with a `kind`.
export function mockResearchCompetitions(name,kind,countryHint,site){
  const c=(countryHint&&countryHint.length===3?countryHint:"HKG").toUpperCase();
  const cls=["ILCA","Optimist","29er","49er"];
  // Derive a domain from the seed site (if any) so different pasted sites yield
  // distinguishable mock competitions + URLs.
  let dom="example.org";
  try{ if(site) dom=new URL(/^https?:\/\//i.test(site)?site:("https://"+site)).hostname.replace(/^www\./,""); }catch{}
  const comps=[];
  for(let y=2025;y>=2021;y--){
    cls.slice(0,3).forEach((cl,i)=>comps.push({
      name:`${c} ${cl} Championship ${y}`,year:y,class:cl,
      url:(y%2===0)?`https://${dom}/${cl.toLowerCase()}-${y}.pdf`:(i===2?null:`https://${dom}/${cl.toLowerCase()}-${y}.htm`),
      kind:(y%2===0)?"pdf":"html"}));
  }
  return {ok:true,mode:"competitions",found:true,official_name:name.trim(),
    website:`https://${dom}`,country:c,competitions:comps,sources:[`https://${dom}`]};
}
// Mirrors a /api/sailing/parse_pdf {url} parse response (single-fleet). The 29er rows come
// back low-confidence so the smoke test exercises the needs-review path too.
export function mockParse(row){
  const low=/29er/i.test(row?.name||row?.class||"");
  return {ok:true,name:row?.name||"Competition",date:row?.year?`01/06/${row.year}`:"",multi:false,
    entries:[{helm:"Alpha Sailor",crew:"",sail:"101",nat:"HKG",pdf_rank:1,races:[1]},
             {helm:"Bravo Sailor",crew:"",sail:"102",nat:"RSA",pdf_rank:2,races:[2]},
             {helm:"Charlie Sailor",crew:"",sail:"103",nat:"GBR",pdf_rank:3,races:[3]}],
    discards:1,ai_parsed:false,detected_class:row?.class||"",detected_host:"",
    low_confidence:low,confidence:low?0.4:0.9,
    confidence_reasons:low?["only 3 entries parsed (rows likely dropped)"]:["looks clean"]};
}
// Mirrors the /api/sailing/parse_pdf probe response.
export function mockProbe(url){
  if(!url) return {ok:true,reachable:false};
  const isPdf=/\.pdf(\?|$)/i.test(url), isHtml=/\.html?(\?|$)/i.test(url);
  return {ok:true,reachable:true,
    family:isPdf?"sailwave":isHtml?"sailwave-html-native":"unknown",
    input_type:isPdf?"pdf-text":isHtml?"html":"pdf-text",
    parseable:isPdf||isHtml,
    content_type:isPdf?"application/pdf":"text/html",bytes:isPdf?48213:31002};
}

// Host display name for an id (used by attribution UI).
export const assocName=id=>hostById(id)?.name||id;

/* ── Event ↔ host-country derivation (moved from App.jsx, reorg step 4) ──
   assocFlag + SCOPE_COUNTRY are module-internal; the rest are re-imported
   by App.jsx. Depend only on hostById + FEDERATIONS above. Verbatim. */
const assocFlag=scope=>scope==="HK"?"🇭🇰":"";
// scope → governing country code (extend as more countries are added)
const SCOPE_COUNTRY={HK:"HKG"};
// The country an event is "hosted in": its own country code, else its owner's scope country.
export const eventCountryCode=ev=>{
  if(ev.country) return String(ev.country).toUpperCase();
  return SCOPE_COUNTRY[hostById(ev.owner)?.scope]||"";
};
// Federations that govern an event (auto-collaborators): owner is a host in the
// federation's country, OR the event's host country matches the federation's.
export const governingFeds=ev=>{
  const ownerCountry=SCOPE_COUNTRY[hostById(ev.owner)?.scope];
  const cc=eventCountryCode(ev);
  return FEDERATIONS.filter(f=>(ownerCountry&&ownerCountry===f.country)||(cc&&cc===f.country));
};
// All hosts that own/co-own an event, INCLUDING auto-collaborating federations.
export const eventAssocs=ev=>[...new Set([ev.owner,...(ev.collabs||[]),...governingFeds(ev).map(f=>f.id)].filter(Boolean))];

// Dedup fingerprint: normalised name + date + class + sorted sail-number set.
// Two imports of the same regatta (by different hosts) collide here so we can
// link them instead of creating duplicates.
export const eventFingerprint=ev=>{
  const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
  const sails=[...new Set((ev.entries||[]).map(e=>norm(e.sail)).filter(Boolean))].sort();
  return [norm(ev.name),norm(ev.date),norm(ev.cls||ev.class),sails.join(",")].join("|");
};
// Where a host's globe is oriented (IOC code): its explicitly-set country, else
// the most common country across the events it owns/co-owns. Used ONLY for the
// "where they compete" globe/footprint and overridable form prefills — NEVER for
// a flag next to the host's name. A host with no explicit country and no events
// has no orientation (null); we never assume one from `scope` (no default HKG).
export const hostLocation=(hostId,evList)=>{
  const h=hostById(hostId);
  if(h?.country) return String(h.country).toUpperCase();
  const counts={};
  (evList||[]).forEach(ev=>{
    if(!eventAssocs(ev).includes(hostId)&&ev.owner!==hostId) return;
    const cc=eventCountryCode(ev); if(cc) counts[cc]=(counts[cc]||0)+1;
  });
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];
  return top?top[0]:null;
};
