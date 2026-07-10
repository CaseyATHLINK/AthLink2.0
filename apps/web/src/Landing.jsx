/* AthLink front-door landing. Self-styled (does NOT sit inside ThemeRoot). All
   type is Apple-native: SF Pro body + New York (ui-serif) accents. Design tokens
   come from @athlink/design-system tokens.css (:root). Sport-agnostic: the sport
   cards are driven by the sports registry passed in as `sports`.
   Layout (2026-07 redesign): search-first hero → partner belt → feature tabs
   (with live globe + athlete-web demos) → mission/vision + live stats → contact. */
import React, { useState, useEffect, useRef } from "react";
import {
  Search, Sparkles, ArrowRight, Copy, Check, X, Loader2,
  Upload, Database, BarChart3, Globe2, Share2, Clock, ShieldCheck, Trophy,
  User, Landmark, Flag, TrendingUp, MousePointerClick,
} from "lucide-react";

const CSS = `
.al-landing{--c29:#E62A22;--cilca:#2E78C8;--c49:#5FAF4E;--copt:#3D3D3D;--serif:'New York',ui-serif,Georgia,serif;
  font-family:var(--sans,-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Segoe UI',Roboto,system-ui,sans-serif);
  font-optical-sizing:auto;
  color:var(--ink);-webkit-font-smoothing:antialiased;letter-spacing:-.01em;line-height:1.5;
  background:linear-gradient(165deg,#d5deee 0%,#dfe8f5 45%,#e6eaf3 100%);background-attachment:fixed;min-height:100vh;position:relative;z-index:0;isolation:isolate;}
.al-landing *{box-sizing:border-box;margin:0;padding:0;}
.al-landing a{text-decoration:none;color:inherit;}
.al-landing .wrap{max-width:1080px;margin:0 auto;padding:0 24px;}
.al-landing .grad{background:linear-gradient(100deg,var(--navy2),var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent;}

.al-liquid{position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;filter:blur(30px) saturate(115%);opacity:.42;}

/* ── Top bar — mirrors the sailing home nav (brand pill left, glass link pill
   centre) so landing↔sport-home feels like one site. ── */
.topbar2{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;pointer-events:none;transition:transform .42s cubic-bezier(.2,.85,.2,1),opacity .42s;}
.topbar2.hidden{transform:translateY(-140%);opacity:0;}
.topbar2>*{pointer-events:auto;}
.tb-brand{display:inline-flex;align-items:center;gap:0;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:980px;padding:6px 14px 6px 6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 24px -12px rgba(0,0,0,.28);flex:none;cursor:pointer;transition:transform .15s;}
.tb-brand:hover{transform:translateY(-1px);}
.tb-mark{width:28px;height:28px;border-radius:50%;display:block;flex:none;}
.tb-word{font-weight:800;font-size:19px;color:var(--navy);letter-spacing:-.04em;padding:0 6px 0 5px;}
.tb-center{position:absolute;left:50%;transform:translateX(-50%);display:flex;pointer-events:auto;}
.tb-nav{display:inline-flex;align-items:center;gap:2px;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:980px;padding:5px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 26px -12px rgba(0,0,0,.3);}
.tb-link{font:inherit;font-size:14px;font-weight:700;color:var(--navy);border:0;background:none;border-radius:980px;padding:9px 18px;cursor:pointer;transition:background .16s;white-space:nowrap;}
.tb-link:hover{background:rgba(255,255,255,.85);}
.tb-spacer{width:34px;flex:none;}
.hero-lockup{display:flex;align-items:center;justify-content:center;gap:10px;margin:0 auto 26px;filter:drop-shadow(0 6px 22px rgba(0,0,0,.28));}
.hero-mark{height:52px;width:auto;display:block;}
.hero-word{font-weight:800;font-size:46px;color:#fff;letter-spacing:-.04em;line-height:1;}
.foot-mark{width:28px;height:28px;border-radius:7px;display:block;flex:none;}
@media (max-width:760px){.tb-center{display:none;} .hero-mark{height:38px;} .hero-word{font-size:34px;} .hero-lockup{gap:8px;margin-bottom:20px;}}

.btn{font:inherit;font-weight:600;font-size:15px;border:0;border-radius:980px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:12px 22px;letter-spacing:-.01em;transition:transform .18s cubic-bezier(.4,0,.2,1),filter .18s,background .18s,box-shadow .18s;white-space:nowrap;}
.btn.cta{background:var(--accent);color:#fff;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.30),inset 0 1px 0 rgba(255,255,255,.45),0 1px 3px rgba(10,132,255,.35);}
.btn.cta:hover{background:var(--accent2);}
.btn.ghost{background:var(--mat-reg);backdrop-filter:blur(28px) saturate(195%);color:var(--ink);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.62),inset 0 1px 0 rgba(255,255,255,.72),0 1px 2px rgba(0,0,0,.10);}
.btn:hover{transform:translateY(-2px) scale(1.02);filter:brightness(1.05);}
.btn:active{transform:translateY(0) scale(.98);}

/* ── Hero (search-first) ── */
.hero{position:relative;overflow:hidden;color:#fff;border-radius:0 0 36px 36px;background:radial-gradient(120% 120% at 20% 0%,#1a4372 0%,#12263f 45%,#0a1c31 100%);}
.hero-liquid{position:absolute;inset:0;width:100%;height:100%;filter:blur(30px) saturate(135%);opacity:.7;}
.hero-veil{position:absolute;inset:0;background:radial-gradient(80% 60% at 80% 20%,rgba(10,132,255,.22),transparent 60%);}
.al-landing .hero-inner{position:relative;z-index:2;padding:170px 24px 120px;text-align:center;}
.hero h1{font-size:62px;line-height:1.02;font-weight:800;letter-spacing:-.04em;max-width:16ch;margin:0 auto 34px;}
.hero h1 .g{background:linear-gradient(100deg,#bfe0ff,#7cb4ff);-webkit-background-clip:text;background-clip:text;color:transparent;}
.hsearch{position:relative;max-width:620px;margin:0 auto;}
.hs-bar{display:flex;align-items:center;gap:11px;background:rgba(255,255,255,.15);backdrop-filter:blur(28px) saturate(185%);-webkit-backdrop-filter:blur(28px) saturate(185%);border-radius:980px;padding:15px 24px;box-shadow:inset 0 1px 0 rgba(255,255,255,.3),inset 0 0 0 .5px rgba(255,255,255,.22),0 20px 44px -18px rgba(0,0,0,.5);transition:box-shadow .2s;}
.hs-bar:focus-within{box-shadow:inset 0 1px 0 rgba(255,255,255,.35),inset 0 0 0 1px rgba(160,205,250,.5),0 20px 44px -18px rgba(0,0,0,.55);}
.hs-bar input{flex:1;min-width:0;border:0;background:none;outline:0;font:inherit;font-size:17px;color:#fff;letter-spacing:-.01em;}
.hs-bar input::placeholder{color:rgba(220,236,248,.62);}
/* Light glass dropdown — same translucency/blur family as the hero search bar,
   dark text at full contrast, rows highlighting with a subtle sky tint. */
.hs-drop{position:absolute;top:calc(100% + 10px);left:0;right:0;z-index:8;background:rgba(255,255,255,.72);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:18px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.5),0 26px 60px -18px rgba(0,0,0,.42);overflow:hidden;text-align:left;padding:6px;color:var(--ink);}
.hs-row{display:flex;align-items:center;gap:11px;padding:11px 14px;border-radius:12px;cursor:pointer;color:var(--navy);font-weight:600;font-size:14.5px;transition:background .14s;}
.hs-row:hover{background:rgba(13,142,207,.12);}
.hs-row .sub{color:var(--mut);font-weight:500;font-size:12.5px;margin-left:auto;flex:none;}
.hs-type{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:8px;background:rgba(13,142,207,.12);color:var(--accent);flex:none;}
.hs-empty{padding:14px 16px;color:var(--mut);font-size:13.5px;}
.hero-portals{display:flex;gap:14px;justify-content:center;margin-top:34px;flex-wrap:wrap;}
.pbtn{display:inline-flex;align-items:center;gap:10px;font:inherit;font-weight:800;font-size:16.5px;letter-spacing:-.02em;color:var(--navy);background:var(--mat-reg,rgba(255,255,255,.7));backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border:0;border-radius:980px;padding:13px 24px;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.4),0 12px 30px -14px rgba(0,0,0,.5);transition:transform .16s,box-shadow .16s;}
.pbtn:hover{transform:translateY(-3px);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.9),0 22px 44px -18px rgba(0,0,0,.55);}
.pbtn.soon,.pbtn.soon:hover{opacity:.62;cursor:default;transform:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.4),0 12px 30px -14px rgba(0,0,0,.5);}
.pill-live{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#0a7a3f;background:rgba(52,199,89,.22);padding:4px 10px;border-radius:980px;}
.pill-soon{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);background:rgba(91,107,128,.16);padding:4px 10px;border-radius:980px;}

.al-landing section{padding:84px 0;}
.seclabel{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:16px;}
.sec-h{font-size:44px;line-height:1.06;font-weight:800;letter-spacing:-.03em;color:var(--navy);}
.center{text-align:center;}
.sec-lead{font-size:19px;line-height:1.55;color:var(--mut);max-width:60ch;margin-top:20px;font-weight:400;}
.sec-lead.center{margin-left:auto;margin-right:auto;}

/* ── Partner conveyor belt ── */
.beltsec{padding:56px 0 40px;}
.beltwrap{overflow:hidden;margin-top:28px;-webkit-mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent);mask-image:linear-gradient(90deg,transparent,#000 10%,#000 90%,transparent);}
.belt{display:flex;align-items:center;gap:64px;width:max-content;animation:al-belt 30s linear infinite;padding:8px 32px 12px;}
.beltwrap:hover .belt{animation-play-state:paused;}
@keyframes al-belt{from{transform:translateX(-50%);}to{transform:translateX(0);}}
/* Bare logos — no chips, no names. Recoloured to a single navy so every mark
   sits in the palette (source PNGs have transparency, so the filter works). */
.blogo{height:52px;width:auto;display:block;flex:none;filter:brightness(0) saturate(100%) invert(18%) sepia(34%) saturate(1710%) hue-rotate(184deg) brightness(94%) contrast(92%);opacity:.88;}

/* ── Feature tabs + rows (no numbered frames) ── */
.tabs{display:inline-flex;gap:4px;padding:5px;border-radius:980px;margin:34px auto 8px;background:rgba(255,255,255,.5);backdrop-filter:blur(28px) saturate(195%);box-shadow:inset 0 1px 0 rgba(255,255,255,.75),inset 0 0 0 .5px rgba(255,255,255,.45),0 4px 14px -8px rgba(0,0,0,.14);}
.tabs button{font:inherit;font-size:15px;font-weight:700;border:0;background:none;color:var(--mut);padding:10px 26px;border-radius:980px;cursor:pointer;transition:.16s;}
.tabs button:hover{color:var(--navy);}
.tabs button.on{background:rgba(255,255,255,.95);color:var(--navy);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 8px -2px rgba(0,0,0,.16);}
.panel-fade{animation:al-fade .35s ease;}
@keyframes al-fade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}

.frow{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;margin-top:64px;}
.frow:first-child{margin-top:44px;}
.frow.flip .ftext{order:2;} .frow.flip .fshot{order:1;}
.ftext h3{font-size:28px;font-weight:800;letter-spacing:-.028em;color:var(--navy);line-height:1.1;}
.pain{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#a8492f;background:rgba(232,72,53,.09);border-radius:980px;padding:6px 13px;margin:14px 0;}
.pain b{font-weight:800;color:#8f3a22;}
.value{font-size:15px;font-weight:800;color:var(--accent);letter-spacing:-.01em;margin-bottom:6px;}
.ftext p{font-size:16px;line-height:1.6;color:var(--mut);max-width:44ch;}
.shot{position:relative;border-radius:14px;overflow:hidden;box-shadow:0 22px 50px -22px rgba(17,40,66,.55),inset 0 0 0 .5px rgba(255,255,255,.55);background:#fff;}
.shot .chrome{display:flex;align-items:center;gap:8px;padding:11px 14px;background:linear-gradient(180deg,#f6f8fb,#eef2f7);border-bottom:.5px solid rgba(60,60,67,.12);}
.shot .chrome i{width:11px;height:11px;border-radius:50%;flex:none;}
.shot .chrome .url{margin-left:8px;flex:1;height:19px;border-radius:980px;background:rgba(255,255,255,.85);box-shadow:inset 0 0 0 .5px rgba(60,60,67,.12);}
.shot img{display:block;width:100%;height:auto;}
.ph{aspect-ratio:16/10;display:grid;place-items:center;gap:12px;text-align:center;padding:24px;background:rgba(255,255,255,.72);backdrop-filter:blur(20px);}
.ph .cam{color:var(--accent);opacity:.45;}
.ph .cap{font-size:14px;font-weight:700;color:var(--navy2);}
/* Live interactive demo frame (globe / athlete web) — navy stage like the app */
.demoframe{position:relative;border-radius:14px;overflow:hidden;background:radial-gradient(120% 120% at 20% 0%,#1a4372 0%,#12263f 55%,#0a1c31 100%);box-shadow:0 22px 50px -22px rgba(17,40,66,.6),inset 0 0 0 .5px rgba(255,255,255,.22);min-height:320px;display:flex;align-items:center;justify-content:center;}
.demoframe>div{width:100%;}
.demo-hint{position:absolute;top:10px;right:14px;font-size:10.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9fc4ec;background:rgba(9,26,48,.55);backdrop-filter:blur(8px);border-radius:980px;padding:4px 11px;pointer-events:none;z-index:3;}
.demo-load{display:flex;flex-direction:column;align-items:center;gap:10px;color:#9fc4ec;font-size:13px;padding:40px 0;}

/* ── Stats strip ── */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:52px auto 0;max-width:720px;}
.stat{text-align:center;padding:26px 12px;border-radius:18px;background:rgba(255,255,255,.5);backdrop-filter:blur(24px) saturate(190%);box-shadow:inset 0 1px 0 rgba(255,255,255,.65),inset 0 0 0 .5px rgba(255,255,255,.4),0 8px 22px -14px rgba(0,0,0,.16);}
.stat .n{font-size:44px;font-weight:800;letter-spacing:-.03em;color:var(--navy);line-height:1;font-variant-numeric:tabular-nums;}
.stat .l{font-size:14px;color:var(--mut);margin-top:10px;font-weight:500;}

.mission{text-align:center;}
.mtext{font-size:27px;line-height:1.5;font-weight:600;color:#2a3a56;max-width:820px;margin:0 auto;letter-spacing:-.015em;text-align:center;}
.em{font-family:var(--serif);font-style:normal;font-weight:700;font-size:1.14em;background:linear-gradient(100deg,var(--navy2),var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent;}
.vision-wrap{max-width:920px;margin:0 auto;}
.vision-tag{font-size:34px;font-weight:800;letter-spacing:-.03em;color:var(--navy);text-align:center;margin-bottom:26px;}

/* ── Contact quotes — frameless, body (sans) font ── */
.quotes{display:grid;grid-template-columns:1fr 1fr;gap:44px;max-width:880px;margin:0 auto 44px;}
.quote{text-align:left;padding:6px 4px;}
.quote p{font-size:21px;line-height:1.45;font-weight:700;color:var(--navy);letter-spacing:-.02em;}
.quote .who{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--mut);font-weight:700;margin-top:14px;}
.contactw{max-width:760px;margin:0 auto;text-align:center;}

.al-landing footer{padding:52px 0 44px;}
.foot{display:flex;justify-content:space-between;align-items:flex-start;gap:40px;flex-wrap:wrap;}
.foot .tag{font-size:14px;color:var(--mut);margin-top:12px;max-width:32ch;line-height:1.5;}
.brand{display:flex;align-items:center;gap:7px;font-weight:800;font-size:20px;letter-spacing:-.03em;color:var(--navy);}
.foot-links{display:flex;gap:56px;flex-wrap:wrap;}
.foot-col h5{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--navy);margin-bottom:12px;}
.foot-col a{display:block;font-size:14.5px;color:var(--mut);margin-bottom:9px;cursor:pointer;transition:color .15s;}
.foot-col a:hover{color:var(--accent);}
.foot-col .dead{display:block;font-size:14.5px;color:var(--mut);margin-bottom:9px;opacity:.6;cursor:default;}
.foot-base{margin-top:40px;padding-top:22px;border-top:.5px solid rgba(60,60,67,.14);display:flex;justify-content:space-between;font-size:13px;color:var(--mut);flex-wrap:wrap;gap:10px;}

.overlay{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;background:rgba(17,40,66,.34);backdrop-filter:blur(6px);padding:24px;}
.modal{width:100%;max-width:420px;background:var(--mat-thick);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border-radius:22px;padding:30px 28px;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 30px 70px -24px rgba(0,0,0,.5);animation:al-pop .22s cubic-bezier(.2,.85,.2,1);}
@keyframes al-pop{from{opacity:0;transform:scale(.94) translateY(8px);}to{opacity:1;transform:none;}}
.modal h3{font-size:22px;font-weight:800;letter-spacing:-.02em;color:var(--navy);margin-bottom:6px;}
.modal p{font-size:14px;color:var(--mut);margin-bottom:20px;}
.email-row{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.6);border-radius:14px;padding:12px 14px;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6);}
.email-row .em-addr{flex:1;text-align:left;font-size:16px;font-weight:700;color:var(--navy);letter-spacing:-.01em;}
.email-row .copy{border:0;cursor:pointer;font:inherit;font-size:13px;font-weight:700;color:#fff;background:var(--accent);border-radius:980px;padding:8px 16px;display:inline-flex;align-items:center;gap:6px;transition:.15s;}
.email-row .copy:hover{background:var(--accent2);}
.email-row .copy.done{background:#34c759;}
.modal .close{margin-top:18px;border:0;background:none;cursor:pointer;font:inherit;font-size:13px;font-weight:600;color:var(--mut);}
.modal .close:hover{color:var(--navy);}

.spin{animation:al-spin 1s linear infinite;}
@keyframes al-spin{to{transform:rotate(360deg);}}

@media(max-width:900px){
  .hero h1{font-size:42px;} .sec-h{font-size:32px;} .mtext{font-size:22px;} .vision-tag{font-size:26px;}
  .frow,.frow.flip{grid-template-columns:1fr;gap:22px;} .frow.flip .ftext{order:1;} .frow.flip .fshot{order:2;}
  .stats{grid-template-columns:1fr;max-width:340px;} .quotes{grid-template-columns:1fr;gap:26px;}
}
`;

/* Feature rows. demo:"globe"|"web" renders the live interactive component
   instead of a screenshot/GIF; gif:true marks a slot awaiting a real GIF
   (falls back to the current PNG screenshot as the placeholder). */
const HOSTS = [
  { title: "AI results parsing", pain: "retyping every PDF by hand", value: "PDF in, results out.", desc: "Drop a competition PDF, photo, or results link into Import. Claude AI reads places, classes, and sail numbers, then you review and publish. The PDF stays the single source of truth.", img: "/landing/host-1.png", gif: true, Icon: Upload },
  { title: "One standardized results database", pain: "results scattered across formats and dead pages", value: "Every result, one format.", desc: "All your events in a single clean, standardized database that is searchable, consistent, and permanent. No more PDFs buried on a club website nobody can find.", img: "/landing/host-2.png", gif: true, Icon: Database },
  { title: "Rankings that build themselves", pain: "maintaining league tables in spreadsheets", value: "Zero admin.", desc: "Season standings and class rankings compute automatically from every event you post — pick which competitions count and watch the ranking update. No spreadsheets, no manual re-ranking.", img: "/landing/host-3.png", gif: true, Icon: BarChart3 },
];
const ATHLETES = [
  { title: "Your career, mapped", pain: "no way to show where you've competed", value: "The globe.", desc: "An interactive globe of every venue and country you've raced. Your international footprint at a glance, the moment someone opens your profile. Go on — drag it.", demo: "globe", Icon: Globe2 },
  { title: "See who you've raced", pain: "your competitive network is invisible", value: "The web.", desc: "A living force-directed web of the athletes you've competed against most. Your rivals, mapped by shared competitions and colour-coded by class. Drag the nodes around.", demo: "web", Icon: Share2 },
  { title: "Track your progress", pain: "no way to see if you're actually improving", value: "Your trajectory, charted.", desc: "AthLink charts your progress across your whole career — and measures it by how you performed against your rivals, the athletes you actually race, not just your raw finishing place. Watch your trajectory climb as you start beating a stronger field.", demo: "progress", Icon: TrendingUp },
];
const SPONSORS = [
  { title: "Interactive models", pain: "athlete CVs tell you nothing at a glance", value: "Understand an athlete in seconds.", desc: "Every profile comes with quick interactive explainers — the globe, the rivals web, the progress chart — that let you understand an athlete in seconds by playing with the data instead of reading a CV.", demo: "web", Icon: MousePointerClick },
  { title: "100% verified. Zero fakes.", pain: "fake accounts and inflated claims", value: "Vetted at the source.", desc: "Every result is vetted by the host that ran the event. No self-reported records, no fake athlete accounts, just verified results traceable to the original PDF.", img: "/landing/sponsor-2.png", gif: true, Icon: ShieldCheck },
  { title: "Ranked, not just results", pain: "hard to compare athletes objectively", value: "Level-adjusted rankings.", desc: "Rank athletes by results weighted for the strength of the field. Add or remove the competitions that count and watch relative positions change. Find the best, fast.", img: "/landing/sponsor-3.png", gif: true, Icon: Trophy },
];

const EMAIL = "casey@athlink.win";
const DEMO_ATHLETE = "Casey Law";

/* ── Supabase (anon, read-only) — live stats + hero search suggestions ── */
const SB = import.meta.env.VITE_SUPABASE_URL;
const SK = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sbHeaders = SB && SK ? { apikey: SK, Authorization: `Bearer ${SK}` } : null;
async function sbRows(path) {
  if (!sbHeaders) return null;
  try {
    const r = await fetch(`${SB}/rest/v1/${path}`, { headers: sbHeaders });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
async function sbCount(table) {
  if (!sbHeaders) return null;
  try {
    const r = await fetch(`${SB}/rest/v1/${table}?select=id`, {
      method: "HEAD", headers: { ...sbHeaders, Prefer: "count=exact", Range: "0-0" },
    });
    const cr = r.headers.get("content-range");
    const n = cr ? parseInt(cr.split("/")[1], 10) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}
/* Events the demo athlete sailed (2-step: entry rows → events with ALL entries,
   which the web needs to find co-competitors). Capped, cached per session. */
async function fetchAthleteEvents(name) {
  const q = encodeURIComponent(`*${name}*`);
  const rows = await sbRows(`entries?select=event_id&or=(helm_name.ilike.${q},crew_name.ilike.${q})`);
  if (!rows || !rows.length) return [];
  const ids = [...new Set(rows.map((r) => r.event_id).filter(Boolean))].slice(0, 40);
  if (!ids.length) return [];
  const evs = await sbRows(`events?select=*,entries(*)&id=in.(${ids.join(",")})`);
  return Array.isArray(evs) ? evs : [];
}

/* SPA navigation into a sport app (same event contract as Shell.jsx). */
const goPath = (path) => { window.history.pushState(null, "", path); window.dispatchEvent(new Event("locationchange")); window.scrollTo(0, 0); };

function useLiquid(ref, { scoped, count, alpha, palette }) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const SCALE = 0.24;
    let W = 1, H = 1, raf = 0;
    const balls = [];
    const mouse = { x: -9999, y: -9999, active: false };
    const rectOf = () => (scoped && canvas.parentElement)
      ? canvas.parentElement.getBoundingClientRect()
      : { width: window.innerWidth, height: window.innerHeight, left: 0, top: 0 };
    const resize = () => {
      const r = rectOf();
      W = Math.max(1, Math.round(r.width * SCALE));
      H = Math.max(1, Math.round(r.height * SCALE));
      canvas.width = W; canvas.height = H;
      if (balls.length === 0) {
        const base = Math.max(W, H);
        for (let i = 0; i < count; i++) balls.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * W * 0.0018, vy: (Math.random() - 0.5) * H * 0.0018,
          r: base * (0.22 + Math.random() * 0.24), c: i % palette.length,
        });
      }
    };
    resize();
    const host = (scoped && canvas.parentElement) ? canvas.parentElement : window;
    const onMove = (e) => { const r = rectOf(); mouse.x = (e.clientX - r.left) * SCALE; mouse.y = (e.clientY - r.top) * SCALE; mouse.active = true; };
    const onLeave = () => { mouse.active = false; };
    window.addEventListener("resize", resize);
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave);
    const frame = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = "lighter";
      const R = Math.max(W, H) * 0.32;
      for (const b of balls) {
        if (mouse.active) {
          const dx = b.x - mouse.x, dy = b.y - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < R * R) { const d = Math.sqrt(d2) || 1, f = 1 - d / R; b.vx += (dx / d) * f * 0.6; b.vy += (dy / d) * f * 0.6; }
        }
        b.x += b.vx; b.y += b.vy; b.vx *= 0.985; b.vy *= 0.985;
        const sp = Math.hypot(b.vx, b.vy), minSp = W * 0.0006;
        if (sp < minSp) { const a = Math.random() * 6.283; b.vx += Math.cos(a) * minSp; b.vy += Math.sin(a) * minSp; }
        if (b.x < 0 && b.vx < 0) b.vx = -b.vx; if (b.x > W && b.vx > 0) b.vx = -b.vx;
        if (b.y < 0 && b.vy < 0) b.vy = -b.vy; if (b.y > H && b.vy > 0) b.vy = -b.vy;
        const c = palette[b.c], g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r), a0 = alpha;
        g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a0})`);
        g.addColorStop(0.6, `rgba(${c[0]},${c[1]},${c[2]},${a0 * 0.3})`);
        g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fill();
      }
      raf = requestAnimationFrame(frame);
    };
    frame();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);
}

/* Keeps a demo crash from killing the whole landing page. */
class DemoBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: false }; }
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e) { console.error("Landing demo error:", e); }
  render() {
    if (this.state.err) return <div className="demo-load">Couldn't load the live demo.</div>;
    return this.props.children;
  }
}

/* Lazy-loads the sailing module + the demo athlete's events the first time the
   Athletes tab opens; cached for the rest of the session. */
function useSailingDemo(active) {
  const [demo, setDemo] = useState(null);
  useEffect(() => {
    if (!active || demo) return;
    let dead = false;
    (async () => {
      try {
        const [mod, rows] = await Promise.all([
          import("@athlink/sport-sailing"),
          fetchAthleteEvents(DEMO_ATHLETE),
        ]);
        if (dead) return;
        const events = rows.map(mod.dbToApp);
        const counts = {};
        events.forEach((ev) => { const iso = mod.IOC_ISO[ev.country]; if (iso) counts[iso] = (counts[iso] || 0) + 1; });
        setDemo(events.length ? { mod, events, counts } : { err: true });
      } catch (e) { console.error("landing demo load", e); if (!dead) setDemo({ err: true }); }
    })();
    return () => { dead = true; };
  }, [active, demo]);
  return demo;
}

function DemoPane({ kind, demo }) {
  if (!demo) return (
    <div className="demoframe"><div className="demo-load"><Loader2 className="spin" size={20} /><span>Loading live demo…</span></div></div>
  );
  if (demo.err) return (
    <div className="demoframe"><div className="demo-load">Couldn't load the live demo.</div></div>
  );
  const { mod, events, counts } = demo;
  const Globe = mod.SailingGlobe, Web = mod.AthleteWeb;
  return (
    <div className="demoframe">
      <span className="demo-hint">Live — try it</span>
      <DemoBoundary>
        {kind === "globe"
          ? <Globe countryData={counts} height={320} dark bare />
          : kind === "progress"
            ? <ProgressDemo mod={mod} events={events} />
            : <Web name={DEMO_ATHLETE} events={events} height={320} dark />}
      </DemoBoundary>
    </div>
  );
}

// Rendered INSIDE DemoBoundary so building the history (aggregate) or the chart
// itself can never crash the page — a throw just shows the boundary fallback.
// ProgressChart is light-themed (no dark mode), so it sits on a light card.
function ProgressDemo({ mod, events }) {
  const history = mod.aggregate(DEMO_ATHLETE, events).history;
  return (
    <div style={{ width: "100%", padding: 18 }}>
      <div style={{ background: "rgba(255,255,255,.96)", borderRadius: 12, padding: "16px 14px", boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.5)" }}>
        <mod.ProgressChart name={DEMO_ATHLETE} events={events} history={history} selYears={null} yrKey="" height={280} w={460} />
      </div>
    </div>
  );
}

function FeatureRow({ f, flip, demo }) {
  const [ok, setOk] = useState(true);
  const Icon = f.Icon;
  return (
    <div className={"frow" + (flip ? " flip" : "")}>
      <div className="ftext">
        <h3>{f.title}</h3>
        <span className="pain"><b>Solves:</b>&nbsp;{f.pain}</span>
        <div className="value">{f.value}</div>
        <p>{f.desc}</p>
      </div>
      <div className="fshot">
        {f.demo
          ? <DemoPane kind={f.demo} demo={demo} />
          : (
            <div className="shot">
              <div className="chrome">
                <i style={{ background: "#ff5f57" }} /><i style={{ background: "#febc2e" }} /><i style={{ background: "#28c840" }} />
                <span className="url" />
              </div>
              {ok && f.img
                ? <img src={f.img} alt={f.title} onError={() => setOk(false)} />
                : <div className="ph"><Icon className="cam" size={30} strokeWidth={1.6} /><div className="cap">{f.title}</div></div>}
            </div>
          )}
      </div>
    </div>
  );
}

/* ── Hero search: near-instant anon lookups across athletes, hosts, competitions.
   Fires from the FIRST character with a short debounce; every term's result is
   cached for the session so retyping/backspacing is instant, and Enter can
   await the same fetch instead of racing it. ── */
const SEARCH_CACHE = new Map(); // term -> results[]
async function fetchSuggestions(term) {
  if (!term || !sbHeaders) return [];
  if (SEARCH_CACHE.has(term)) return SEARCH_CACHE.get(term);
  const enc = encodeURIComponent(`*${term}*`);
  const [aths, hosts, evs] = await Promise.all([
    sbRows(`athlete_usernames?select=username,display_name&or=(display_name.ilike.${enc},username.ilike.${enc})&limit=5`),
    sbRows(`hosts?select=id,name,slug&name=ilike.${enc}&limit=3`),
    sbRows(`events?select=id,name,date&name=ilike.${enc}&limit=3`),
  ]);
  const out = [];
  (aths || []).forEach((a) => out.push({ type: "athlete", Icon: User, label: a.display_name || a.username, path: `/${a.username}` }));
  (hosts || []).forEach((h) => out.push({ type: "host", Icon: Landmark, label: h.name, path: `/${h.slug || h.id}` }));
  (evs || []).forEach((e) => out.push({ type: "competition", Icon: Flag, label: e.name, sub: e.date || "", path: `/event/${e.id}` }));
  const res = out.slice(0, 9);
  SEARCH_CACHE.set(term, res);
  return res;
}
/* ── In-memory search index — prefetched ONCE so hero suggestions filter
   synchronously on every keystroke (like the sailing app's global search),
   instead of a debounced network round-trip per term. The network path above
   stays as the fallback while this hasn't resolved (or if it fails). ── */
let SEARCH_INDEX = null;         // { athletes:[], hosts:[], events:[] } once loaded
let SEARCH_INDEX_PROMISE = null; // in-flight prefetch (dedup across focus/mount)
function prefetchSearchIndex() {
  if (SEARCH_INDEX || SEARCH_INDEX_PROMISE || !sbHeaders) return SEARCH_INDEX_PROMISE;
  SEARCH_INDEX_PROMISE = (async () => {
    const [aths, hosts, evs] = await Promise.all([
      sbRows(`athlete_usernames?select=username,display_name&order=display_name.asc&limit=5000`),
      sbRows(`hosts?select=id,name,slug&order=name.asc&limit=1000`),
      sbRows(`events?select=id,name,date&order=date.desc&limit=3000`),
    ]);
    SEARCH_INDEX = {
      athletes: (aths || []).map((a) => ({ type: "athlete", Icon: User, label: a.display_name || a.username, path: `/${a.username}`, q: `${a.display_name || ""} ${a.username || ""}`.toLowerCase() })),
      hosts: (hosts || []).map((h) => ({ type: "host", Icon: Landmark, label: h.name, path: `/${h.slug || h.id}`, q: (h.name || "").toLowerCase() })),
      events: (evs || []).map((e) => ({ type: "competition", Icon: Flag, label: e.name, sub: e.date || "", path: `/event/${e.id}`, q: (e.name || "").toLowerCase() })),
    };
    return SEARCH_INDEX;
  })();
  return SEARCH_INDEX_PROMISE;
}
// Synchronous contains-match against the prefetched index (athletes → hosts →
// competitions, capped ~9). Returns null when the index isn't ready yet.
function filterIndex(term) {
  if (!SEARCH_INDEX) return null;
  const t = term.toLowerCase();
  const hit = (arr, n) => arr.filter((x) => x.q.includes(t)).slice(0, n);
  return [...hit(SEARCH_INDEX.athletes, 5), ...hit(SEARCH_INDEX.hosts, 3), ...hit(SEARCH_INDEX.events, 3)].slice(0, 9);
}
function useHeroSearch(q) {
  const [res, setRes] = useState(null); // null = idle, [] = no hits
  useEffect(() => {
    const term = q.trim();
    if (!term) { setRes(null); return; }
    // Instant path: filter the prefetched index synchronously (zero debounce/await).
    const local = filterIndex(term);
    if (local) { setRes(local); return; }
    // Fallback: index not loaded yet (or unavailable) → the debounced network path.
    if (!sbHeaders) { setRes(null); return; }
    if (SEARCH_CACHE.has(term)) { setRes(SEARCH_CACHE.get(term)); return; }
    let dead = false;
    const t = setTimeout(async () => {
      const out = await fetchSuggestions(term);
      if (!dead) setRes(out);
    }, 90);
    return () => { dead = true; clearTimeout(t); };
  }, [q]);
  return res;
}

export default function Landing({ sports = [] }) {
  const [tab, setTab] = useState("hosts");
  const [contactOpen, setContactOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const [q, setQ] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [stats, setStats] = useState({ hosts: 11, events: 55, athletes: 2246 }); // live-count fallbacks
  const bgRef = useRef(null);
  const heroRef = useRef(null);
  const results = useHeroSearch(q);
  const demo = useSailingDemo(tab === "athletes" || tab === "sponsors");

  useLiquid(bgRef, { scoped: false, count: 13, alpha: 0.42, palette: [[36, 58, 86], [44, 74, 110], [30, 50, 78], [52, 86, 128], [38, 64, 96], [46, 78, 118]] });
  useLiquid(heroRef, { scoped: true, count: 11, alpha: 0.5, palette: [[31, 78, 128], [40, 92, 150], [23, 58, 98], [54, 120, 190], [28, 70, 120], [46, 104, 168]] });

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => { const y = window.scrollY; setNavHidden(y > lastY && y > 90); lastY = y; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Live platform stats (anon count queries; silently keeps fallbacks offline).
  useEffect(() => {
    (async () => {
      const [h, e, a] = await Promise.all([sbCount("hosts"), sbCount("events"), sbCount("athlete_usernames")]);
      setStats((s) => ({ hosts: h ?? s.hosts, events: e ?? s.events, athletes: a ?? s.athletes }));
    })();
  }, []);

  // Prefetch the search index once on mount so the very first keystroke is instant.
  useEffect(() => { prefetchSearchIndex(); }, []);

  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  // Smooth-scroll to a section WITHOUT writing a #fragment into the URL.
  const scrollToId = (id) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: "smooth" }); };
  const openContact = (e) => { if (e) e.preventDefault(); setContactOpen(true); };
  const copyEmail = () => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1600); };
    const legacy = () => {
      const ta = document.createElement("textarea");
      ta.value = EMAIL; ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.top = "-9999px"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, EMAIL.length);
      try { document.execCommand("copy"); } catch (_) { /* noop */ }
      document.body.removeChild(ta); done();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(EMAIL).then(done).catch(legacy);
    } else { legacy(); }
  };

  const rows = { hosts: HOSTS, athletes: ATHLETES, sponsors: SPONSORS }[tab];
  const goSailing = () => goPath("/sailing");
  const onSearchKey = async (e) => {
    if (e.key === "Escape") { setQ(""); e.target.blur(); }
    if (e.key !== "Enter") return;
    // Enter resolves suggestions for the CURRENT term (cache-backed, so instant
    // when the dropdown already shows them) and opens the top match. Never reads
    // the rendered results directly — they can still belong to the previous
    // keystroke — and never races the debounce into the sailing home.
    const term = q.trim();
    if (term) {
      const out = filterIndex(term) ?? await fetchSuggestions(term);
      if (out.length) { goPath(out[0].path); return; }
    }
    goSailing();
  };
  const belt = ["/partners/rhkyc.png", "/partners/hksf.png", "/partners/abc.png"];
  const beltRow = [...belt, ...belt, ...belt]; // one half of the loop

  return (
    <div className="al-landing">
      <style>{CSS}</style>
      <canvas ref={bgRef} className="al-liquid" aria-hidden="true" />

      {/* TOP BAR — same pill grammar as the sport homes */}
      <div className={"topbar2" + (navHidden ? " hidden" : "")}>
        <div className="tb-brand" title="Back to top" onClick={toTop}>
          <img className="tb-mark" src="/brand/icon-app-circle.png" alt="" aria-hidden="true" />
          <span className="tb-word">AthLink</span>
        </div>
        <div className="tb-center">
          <nav className="tb-nav">
            <button className="tb-link" onClick={() => scrollToId("trusted")}>Collaborators</button>
            <button className="tb-link" onClick={() => scrollToId("ecosystem")}>Who it's for</button>
            <button className="tb-link" onClick={() => scrollToId("mission")}>Mission</button>
            <button className="tb-link" onClick={openContact}>Contact</button>
          </nav>
        </div>
        <div className="tb-spacer" />
      </div>

      {/* HERO — search-first */}
      <header className="hero">
        <canvas ref={heroRef} className="hero-liquid" aria-hidden="true" />
        <div className="hero-veil" />
        <div className="wrap hero-inner">
          <div className="hero-lockup">
            <img className="hero-mark" src="/brand/icon-white.png" alt="" aria-hidden="true" />
            <span className="hero-word">AthLink</span>
          </div>
          <h1>The ultimate <span className="g">data centre</span> for sports results</h1>
          <div className="hsearch">
            <div className="hs-bar">
              <Search size={19} style={{ flex: "none", opacity: .75 }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onFocus={() => setSearchFocus(true)}
                onBlur={() => setTimeout(() => setSearchFocus(false), 180)}
                onKeyDown={onSearchKey}
                placeholder="Search any athlete, club, country or competition…"
                aria-label="Search AthLink"
              />
            </div>
            {searchFocus && results && (
              <div className="hs-drop">
                {results.length === 0 && <div className="hs-empty">No matches yet — try an athlete, club or competition name.</div>}
                {results.map((r, i) => (
                  <div className="hs-row" key={i} onMouseDown={(e) => { e.preventDefault(); goPath(r.path); }}>
                    <span className="hs-type"><r.Icon size={13} /></span>
                    {r.label}
                    {r.sub && <span className="sub">{r.sub}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="hero-portals">
            <button className="pbtn" onClick={goSailing}>Sailing<span className="pill-live">Live</span><ArrowRight size={16} /></button>
            <button className="pbtn soon" disabled aria-disabled="true">Golf<span className="pill-soon">Coming soon</span></button>
            <button className="pbtn soon" disabled aria-disabled="true">Rowing<span className="pill-soon">Coming soon</span></button>
          </div>
        </div>
      </header>

      {/* COLLABORATORS */}
      <section className="beltsec center" id="trusted">
        <div className="wrap">
          <h2 className="sec-h center">Organizations we collaborate with</h2>
        </div>
        <div className="beltwrap" aria-hidden="true">
          <div className="belt">
            {[...beltRow, ...beltRow].map((src, i) => (
              <img className="blogo" src={src} alt="" key={i} />
            ))}
          </div>
        </div>
      </section>

      {/* ECOSYSTEM / FEATURES */}
      <section id="ecosystem" style={{ paddingTop: 40 }}>
        <div className="wrap center">
          <div className="seclabel">Built by elite athletes</div>
          <h2 className="sec-h center">Making data actually interesting</h2>
          <div className="tabs">
            <button className={tab === "hosts" ? "on" : ""} onClick={() => setTab("hosts")}>Hosts</button>
            <button className={tab === "athletes" ? "on" : ""} onClick={() => setTab("athletes")}>Athletes</button>
            <button className={tab === "sponsors" ? "on" : ""} onClick={() => setTab("sponsors")}>Sponsors</button>
          </div>
        </div>
        <div className="wrap panel-fade" key={tab}>
          {rows.map((f, i) => <FeatureRow key={f.title} f={f} flip={i % 2 === 1} demo={demo} />)}
        </div>
      </section>

      {/* MISSION */}
      <section className="mission" id="mission">
        <div className="wrap">
          <div className="seclabel">Our mission</div>
          <p className="mtext">At AthLink, our mission is to become the <span className="em">ultimate data centre</span> for global sport: verifying every result, empowering every athlete, and giving sponsors the trusted foundation they need to back the next generation of champions.</p>
        </div>
      </section>

      {/* VISION + LIVE STATS */}
      <section style={{ paddingTop: 0 }}>
        <div className="wrap vision-wrap">
          <div className="seclabel center">Our vision</div>
          <div className="vision-tag"><span className="grad">LinkedIn</span> for athletes and sponsors</div>
          <p className="mtext">Revolutionizing sports sponsorship by <span className="em">connecting athletes with brands through AI-driven matchmaking</span>, empowering athletes to reach their potential and enabling companies to find authentic ambassadors.</p>
          <div className="stats">
            <div className="stat"><div className="n">{stats.hosts.toLocaleString()}</div><div className="l">Hosts &amp; associations</div></div>
            <div className="stat"><div className="n">{stats.events.toLocaleString()}</div><div className="l">Competitions on the platform</div></div>
            <div className="stat"><div className="n">{stats.athletes.toLocaleString()}</div><div className="l">Athlete profiles built</div></div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ paddingTop: 24 }}>
        <div className="wrap">
          <div className="quotes">
            <div className="quote">
              <p>"This has saved me so many hours of organising files."</p>
              <div className="who"><Landmark size={14} />Hong Kong Sailing Federation</div>
            </div>
            <div className="quote">
              <p>"This is so crucial. I've never had a platform that housed all of my results for me."</p>
              <div className="who"><User size={14} />Competing athlete</div>
            </div>
          </div>
          <div className="contactw">
            <h2 className="sec-h center">Put your results on AthLink</h2>
            <p className="sec-lead center">Run a class, club, or federation? Get your competitions into the database and your athletes into the network — let us help you.</p>
            <div style={{ display: "flex", gap: 14, justifyContent: "center", marginTop: 34, flexWrap: "wrap" }}>
              <button className="btn cta" onClick={openContact}>Contact us</button>
              <button className="btn ghost" onClick={() => goPath("/sailing?signup=1")}>Create a profile</button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="wrap">
          <div className="foot">
            <div>
              <div className="brand"><img className="foot-mark" src="/brand/icon-app.png" alt="" aria-hidden="true" />AthLink</div>
              <p className="tag">The ultimate data centre for sports results. LinkedIn for athletes and sponsors.</p>
            </div>
            <div className="foot-links">
              <div className="foot-col"><h5>Portals</h5><a onClick={goSailing}>Sailing</a><span className="dead">Golf — coming soon</span></div>
              <div className="foot-col"><h5>Platform</h5><a onClick={() => scrollToId("trusted")}>Collaborators</a><a onClick={() => scrollToId("ecosystem")}>Who it's for</a></div>
              <div className="foot-col"><h5>Company</h5><a onClick={() => scrollToId("mission")}>Mission</a><a onClick={openContact}>Contact</a></div>
            </div>
          </div>
          <div className="foot-base"><span>© 2026 AthLink</span><span>athlink.win</span></div>
        </div>
      </footer>

      {/* CONTACT MODAL */}
      {contactOpen && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setContactOpen(false); }}>
          <div className="modal">
            <h3>Get in touch</h3>
            <p>Drop us a line and we'll get your results on AthLink.</p>
            <div className="email-row">
              <span className="em-addr">{EMAIL}</span>
              <button className={"copy" + (copied ? " done" : "")} onClick={copyEmail}>
                {copied ? <><Check size={14} />Copied</> : <><Copy size={14} />Copy</>}
              </button>
            </div>
            <button className="close" onClick={() => setContactOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
