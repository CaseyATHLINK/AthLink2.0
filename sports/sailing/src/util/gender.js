/* Division + gender/age-category parsing for sailing — pure helpers shared by
   manual import, edit-results, and the results page. Reorg step 4: split out of
   App.jsx. No app-state deps. Verbatim from App.jsx. */

// ── Division (gender / age) helpers — shared by manual import, edit results,
//    and the results page. Stored as a normalized token set on entry.div. ──
export const DIV_COLOR={M:"#1f6fd6",F:"#e8455f",Mix:"#8b5cf6",Jr:"#4caf50"};
export const DIV_LABEL={M:"Male",F:"Female",Mix:"Mixed",Jr:"Junior"};
// Allowed gender bases (one of) plus optional Jr.
export function parseDiv(div){
  // returns {gender:"M"|"F"|"Mix"|null, jr:bool}
  const t=(div||"").toString();
  let gender=null;
  if(/\bmix/i.test(t)||/\bX\b/i.test(t)) gender="Mix";
  else if(/\bf(emale)?\b/i.test(t)||/\bgirl/i.test(t)||/\bwomen/i.test(t)) gender="F";
  else if(/\bm(ale)?\b/i.test(t)||/\bboy/i.test(t)||/\bmen\b/i.test(t)) gender="M";
  const jr=/\bjr\b|\bjun/i.test(t)||/junior/i.test(t)||/youth/i.test(t)||/\bU1[0-9]\b/i.test(t);
  return {gender,jr};
}
export function divTokens(div){
  const {gender,jr}=parseDiv(div);
  const out=[]; if(gender)out.push(gender); if(jr)out.push("Jr"); return out;
}
export function divToString(tokens){
  // canonical storage e.g. "F Jr"
  const g=tokens.find(t=>t!=="Jr"); const jr=tokens.includes("Jr");
  return [g,jr?"Jr":null].filter(Boolean).join(" ");
}

/* ── gender + age-category (real fields, with legacy-div fallback) ─────────
   Entries now carry real `gender` ('M'|'F'|'Mix') and `category` ('U17','Jr'…)
   fields from parser v5. Older events stored both inside the free `div` string,
   so genderCatOf() prefers the real fields and falls back to parsing div. */
export function normGender(raw){
  const s=String(raw||"").toLowerCase().replace(/[^a-z]/g,"");
  if(!s) return "";
  if(["m","male","man","men","boy","boys"].includes(s)) return "M";
  if(["f","female","woman","women","w","girl","girls","lady","ladies"].includes(s)) return "F";
  if(["mix","mixed","x","mf","fm"].includes(s)) return "Mix";
  return "";
}
export function normCategory(raw){
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
// Some boat classes / divisions are locked to ONE gender, which is more
// authoritative than any stated or remembered value (a source can mis-label a
// sailor, and a stale gender can carry over from another event). 49erFX is the
// women's skiff, so every 49erFX sailor is female — regardless of what the
// results sheet said. Returns "F" | "M" | "" (no lock). Deliberately does NOT
// lock "open" classes (a bare "49er", "470", "Nacra 17", ILCA…): those aren't
// single-gender, so their members keep their stated/remembered gender.
export function lockedGenderOf(label){
  const s=String(label||"").toLowerCase();
  if(!s) return "";
  // Women-only: the 49er FX skiff, plus explicit women's labels.
  if(/49er\s*fx|\bfx\b|\bwomen\b|\bwomens\b|\bgirls?\b|\bladies\b|\bfemale\b/.test(s)) return "F";
  // Men-only: explicit men's labels only (never a bare "49er"/"open").
  if(/\bmens?\b|\bboys?\b|\bmale\b/.test(s)) return "M";
  return "";
}
// Resolve the gender + category to display for an entry, preferring real fields.
export function genderCatOf(e){
  if(!e) return {gender:"",category:""};
  let gender=normGender(e.gender);
  let category=normCategory(e.category);
  if(!gender||!category){
    const {gender:dg,jr}=parseDiv(e.div||"");
    if(!gender&&dg) gender=dg;
    if(!category&&jr) category="Jr";
  }
  // A gender-locked class/division is authoritative — it overrides a stated
  // value (e.g. a 49erFX sheet that mistakenly marked its crews "M").
  const lk=lockedGenderOf(e.div||e.cls||"");
  if(lk) gender=lk;
  return {gender,category};
}

export const GENDER_COLOR={M:"#2d6cc9",F:"#c2477f",Mix:"#7c3aed"};
