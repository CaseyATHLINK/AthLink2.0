/* Athlete-name + display helpers — pure, no deps. Verbatim from App.jsx
   (reorg step 4 decomposition). canonName collapses case/accents/word-order. */

// ── Canonical name key — collapses case, accents, hyphens, punctuation & word
//    order. Two names sharing a canon key are treated as the SAME athlete.
export function canonName(nm){
  let s=(nm||"").toLowerCase();
  s=s.normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  s=s.replace(/ø/g,"o").replace(/ł/g,"l").replace(/đ/g,"d").replace(/ß/g,"ss").replace(/æ/g,"ae").replace(/œ/g,"oe").replace(/þ/g,"th");
  s=s.replace(/-/g," ").replace(/[^a-z0-9\s]/g," ");
  return s.trim().split(/\s+/).filter(Boolean).sort().join(" ");
}
// Stable identity for an event (to detect duplicate imports of the same comp).
export function eventKey(ev){
  return `${(ev.name||"").trim().toLowerCase()}|${(ev.date||"").trim()}|${ev.cls||""}|${ev.subclass||""}`;
}

export function ordinalOf(n){const s=["th","st","nd","rd"],v=n%100;return n+(s[(v-20)%10]||s[v]||s[0]);}

export const initials=n=>n.split(" ").map(w=>w[0]).slice(0,2).join("");

export const pascalSlug=(s)=>String(s||"").replace(/[^A-Za-z0-9]+/g," ").trim()
  .split(/\s+/).filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join("");

// Deterministic avatar background colour derived from a display name (navy palette).
export const avatarColor=name=>{
  const c=["#163a63","#1f4e80","#2a6aa0","#0d6ea0","#264d73","#1a5e8a","#2b557d"];
  let h=0;for(let i=0;i<name.length;i++) h=name.charCodeAt(i)+((h<<5)-h);
  return c[Math.abs(h)%c.length];
};
