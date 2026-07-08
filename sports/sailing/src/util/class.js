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
