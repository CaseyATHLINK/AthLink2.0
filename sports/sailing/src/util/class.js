/* Boat-class registry + display helpers for sailing. Extracted VERBATIM
   from App.jsx (reorg step 4). The custom-class registry is runtime-mutable
   module state: reads are ESM live bindings, writes go through
   setCustomClassRegistry(); App.jsx keeps a useState mirror purely to trigger
   React re-renders (behaviour unchanged). */

// The four built-in classes.
export const CLASSES=[
  {id:"29er",    short:"29er"},
  {id:"ilca",    short:"ILCA"},
  {id:"optimist",short:"OPTI",full:"Optimist"},
  {id:"49er",    short:"49er"},
];

// Locked class colours (CLAUDE.md) + custom-class palette.
export const CLASS_COLOR={"29er":"#E84855","49er":"#5FAF4E","ilca":"#E2231A","optimist":"#000000"};
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

// ── Sub-classes (per-event) for ILCA, Optimist and 49er ──
// ILCA: 3 rigs, varying shades of red (ILCA 7 darkest → ILCA 4 lightest), matching the ILCA logo red.
// Optimist: 3 fleets, ranked high→low performance, black → grey (top fleet matches the Optimist logo black).
// 49er: 2 fleets that race separately — 49er (men, green) and 49er FX (women, blue, matching the 49er FX logo).
export const SUBCLASSES={
  ilca:[
    {id:"ilca7", label:"ILCA 7", color:"#8E1519"},
    {id:"ilca6", label:"ILCA 6", color:"#E2231A"},
    {id:"ilca4", label:"ILCA 4", color:"#F2867F"},
  ],
  optimist:[
    {id:"opti",       label:"Optimist",              short:"OPTI",       color:"#000000"},
    {id:"opti-int",   label:"Optimist Intermediate", short:"OPTI Inter", color:"#6b6b6b"},
    {id:"opti-green", label:"Optimist Green",        short:"OPTI Green", color:"#a3a3a3"},
  ],
  "49er":[
    {id:"49er",    label:"49er",    short:"49er",    color:"#5FAF4E"},
    {id:"49er-fx", label:"49er FX", short:"49er FX", color:"#1B87C9"},
  ],
};
export const subById=(cls,id)=>(SUBCLASSES[cls]||[]).find(s=>s.id===id);
// Nugget label + colour for an event (subclass overrides base class)
export const nuggetFor=(cls,subclass)=>{
  const s=subById(cls,subclass);
  if(s) return{label:s.short||s.label,full:s.label,color:s.color};
  const c=CLASSES.find(c=>c.id===cls)||customClassById(cls);
  return{label:classLabel(cls),full:c?.full||classLabel(cls),color:classColor(cls)};
};

// Infer a boat class id from a fleet/competition label (for multi-class imports).
export function classFromFleetName(name){
  const s=String(name||"").toLowerCase();
  if(/49er/.test(s)) return "49er";
  if(/29er/.test(s)) return "29er";
  if(/\bilca\b|laser/.test(s)) return "ilca";
  if(/opti/.test(s)) return "optimist";
  return null;
}
