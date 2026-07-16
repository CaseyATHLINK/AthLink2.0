/* Division registry + display helpers for golf. Mirrors sailing's class.js
   (golf's "class" machinery drives divisions: Men's, Women's, Amateur, Senior).
   The custom-division registry is runtime-mutable module state: reads are ESM
   live bindings, writes go through setCustomClassRegistry(); App.jsx keeps a
   useState mirror purely to trigger React re-renders (behaviour unchanged). */

// The four built-in golf divisions (same data shape as sailing's classes).
export const CLASSES=[
  {id:"mens",   short:"Men's",  full:"Men's Division"},
  {id:"womens", short:"Women's",full:"Women's Division"},
  {id:"amateur",short:"AM",     full:"Amateur"},
  {id:"senior", short:"SEN",    full:"Senior"},
];

// Division colours — muted navy-palette tones only (CLAUDE.md: no aggressive
// highlight colours) + custom-division palette.
export const CLASS_COLOR={"mens":"#1f4e80","womens":"#409cff","amateur":"#5b6b80","senior":"#3D3D3D"};
export const CUSTOM_CLASS_PALETTE=["#1f4e80","#0d8ecf","#5b6b80"];

// Pure helpers.
export const canonClass=name=>String(name||"").toLowerCase().replace(/[^a-z0-9]/g,"");
export const prettifyClassSlug=(slug)=>{
  const s=String(slug||"").trim();
  if(!s) return "Custom class";
  return s.replace(/([a-z])([0-9])/gi,"$1 $2").replace(/([0-9])([a-z])/gi,"$1 $2").toUpperCase();
};

// ── Custom-class runtime registry (module-owned mutable state) ──
// Reads via the live binding below; writes MUST go through setCustomClassRegistry.
export let CUSTOM_CLASSES=[];
export function setCustomClassRegistry(next){ CUSTOM_CLASSES = Array.isArray(next) ? next : []; }

// Readers (see the live registry above).
export const customClassById=id=>CUSTOM_CLASSES.find(c=>c.id===id)||null;
export const classLabel=(clsId)=>{
  const main=CLASSES.find(c=>c.id===clsId);
  if(main) return main.short||main.full||clsId;
  const cc=customClassById(clsId);
  if(cc) return cc.short||cc.full||clsId;
  if(typeof clsId==="string"&&clsId.startsWith("custom:")) return prettifyClassSlug(clsId.slice(7));
  return clsId;
};

export const classColor=(cls)=>CLASS_COLOR[(cls||"").toLowerCase()]||customClassById(cls)?.color||"#5b6b80";
export const classColorA=(cls,a)=>{
  const hex=classColor(cls).replace("#","");
  const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
};

// ── Sub-divisions (per-event) ──
// Golf has no seed sub-divisions (sailing used these for ILCA rigs / Optimist
// fleets / 49er FX). The machinery stays intact — add a division entry here to
// light up the inline sub-division picker again.
export const SUBCLASSES={};
export const subById=(cls,id)=>(SUBCLASSES[cls]||[]).find(s=>s.id===id);
// Nugget label + colour for an event (subdivision overrides base division)
export const nuggetFor=(cls,subclass)=>{
  const s=subById(cls,subclass);
  if(s) return{label:s.short||s.label,full:s.label,color:s.color};
  const c=CLASSES.find(c=>c.id===cls)||customClassById(cls);
  return{label:classLabel(cls),full:c?.full||classLabel(cls),color:classColor(cls)};
};

// Infer a division id from a field/competition label (for multi-division imports).
export function classFromFleetName(name){
  const s=String(name||"").toLowerCase();
  if(/\bwomen|\bladies|\bfemale|\bfx\b/.test(s)) return "womens";
  if(/\bmen|\bmale\b/.test(s)) return "mens";
  if(/\bsenior|\bveteran|\bmasters?\b/.test(s)) return "senior";
  if(/\bamateur|\bam\b/.test(s)) return "amateur";
  return null;
}
