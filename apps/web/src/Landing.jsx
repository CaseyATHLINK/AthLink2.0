/* AthLink front-door landing. Self-styled (does NOT sit inside ThemeRoot, so the
   Fraunces serif accents survive the .al-ds font override). Design tokens come
   from @athlink/design-system tokens.css (:root). Sport-agnostic: the sport cards
   are driven by the sports registry passed in as `sports`. */
import React, { useState, useEffect, useRef } from "react";
import {
  Menu, Sparkles, ArrowRight, Copy, Check, X,
  Upload, Database, BarChart3, Globe2, Share2, Clock, ShieldCheck, Trophy,
} from "lucide-react";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400..600;1,6..72,400..600&display=swap');
.al-landing{--c29:#E84855;--cilca:#2E78C8;--c49:#5FAF4E;--copt:#3D3D3D;--serif:'Newsreader',ui-serif,Georgia,serif;
  font-family:var(--sans,-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Segoe UI',Roboto,system-ui,sans-serif);
  font-optical-sizing:auto;
  color:var(--ink);-webkit-font-smoothing:antialiased;letter-spacing:-.01em;line-height:1.5;
  background:linear-gradient(165deg,#d5deee 0%,#dfe8f5 45%,#e6eaf3 100%);background-attachment:fixed;min-height:100vh;position:relative;z-index:0;isolation:isolate;}
.al-landing *{box-sizing:border-box;margin:0;padding:0;}
.al-landing a{text-decoration:none;color:inherit;}
.al-landing .wrap{max-width:1080px;margin:0 auto;padding:0 24px;}
.al-landing .grad{background:linear-gradient(100deg,var(--navy2),var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent;}

.al-liquid{position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;filter:blur(30px) saturate(115%);opacity:.42;}

.topbar2{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 20px;pointer-events:none;transition:transform .42s cubic-bezier(.2,.85,.2,1),opacity .42s;}
.topbar2.hidden{transform:translateY(-140%);opacity:0;}
.topbar2>*{pointer-events:auto;}
.tb-brand{display:inline-flex;align-items:center;gap:0;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:980px;padding:6px 14px 6px 6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 24px -12px rgba(0,0,0,.28);flex:none;cursor:pointer;transition:transform .15s;}
.tb-brand:hover{transform:translateY(-1px);}
.tb-logo{width:32px;height:32px;border-radius:980px;background:var(--accent);color:#fff;display:grid;place-items:center;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.4);}
.tb-divider{width:1px;height:18px;background:rgba(0,0,0,.12);flex:none;margin:0 4px 0 10px;}
.tb-sport{font-weight:800;font-size:16px;color:var(--navy);letter-spacing:-.02em;padding:5px 4px 5px 6px;}
/* Brand lockup = A icon + "AthLink" in SF Pro (system font stack). */
.tb-mark{width:26px;height:26px;border-radius:7px;display:block;flex:none;}
.tb-word{font-weight:800;font-size:19px;color:var(--navy);letter-spacing:-.03em;padding:0 6px 0 9px;}
.hero-lockup{display:flex;align-items:center;justify-content:center;gap:16px;margin:0 auto 30px;filter:drop-shadow(0 6px 22px rgba(0,0,0,.28));}
.hero-mark{height:60px;width:auto;display:block;}
.hero-word{font-weight:800;font-size:54px;color:#fff;letter-spacing:-.04em;line-height:1;}
.foot-mark{width:26px;height:26px;border-radius:7px;display:block;flex:none;}
@media (max-width:640px){.hero-mark{height:40px;} .hero-word{font-size:38px;} .hero-lockup{gap:12px;margin-bottom:22px;}}
.tb-center{flex:1;display:flex;justify-content:center;min-width:0;pointer-events:none;}
.menupill{pointer-events:auto;position:relative;width:100%;max-width:460px;min-width:0;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:25px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 26px -12px rgba(0,0,0,.3);transition:background .34s ease;}
.mp-bar{display:flex;align-items:center;gap:8px;padding:6px 7px;}
.mp-burger{flex:none;width:38px;height:38px;border-radius:980px;border:0;background:var(--mat-reg);backdrop-filter:blur(20px) saturate(190%);color:var(--navy);display:grid;place-items:center;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.58),inset 0 1px 0 rgba(255,255,255,.68),0 1px 2px rgba(0,0,0,.07);}
.mp-search{flex:1;min-width:0;display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.45);border-radius:980px;padding:8px 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.55);}
.mp-search input{flex:1;min-width:0;border:0;background:none;outline:0;font:inherit;font-size:13.5px;color:var(--ink);}
.mp-search input::placeholder{color:var(--mut);}
.mp-answer{margin:0 10px;padding:11px 4px 13px;border-top:.5px solid rgba(60,60,67,.14);font-size:13.5px;line-height:1.5;color:var(--navy);}
.mp-answer b{color:var(--accent);}
.mp-panel{max-height:0;overflow:hidden;opacity:0;display:flex;flex-direction:column;gap:1px;padding:0 12px;transition:max-height .34s cubic-bezier(.33,0,.2,1),opacity .3s,padding .34s cubic-bezier(.33,0,.2,1);}
.menupill.open .mp-panel{max-height:300px;opacity:1;padding:2px 12px 13px;}
.mp-link{align-self:flex-start;border:0;background:none;cursor:pointer;font-weight:700;font-size:18px;color:var(--ink);padding:8px 6px;transition:color .15s;}
.mp-link:hover{color:var(--accent);}

.btn{font:inherit;font-weight:600;font-size:15px;border:0;border-radius:980px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:12px 22px;letter-spacing:-.01em;transition:transform .18s cubic-bezier(.4,0,.2,1),filter .18s,background .18s,box-shadow .18s;white-space:nowrap;}
.btn.cta{background:var(--accent);color:#fff;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.30),inset 0 1px 0 rgba(255,255,255,.45),0 1px 3px rgba(10,132,255,.35);}
.btn.cta:hover{background:var(--accent2);}
.btn.ghost{background:var(--mat-reg);backdrop-filter:blur(28px) saturate(195%);color:var(--ink);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.62),inset 0 1px 0 rgba(255,255,255,.72),0 1px 2px rgba(0,0,0,.10);}
.btn:hover{transform:translateY(-2px) scale(1.02);filter:brightness(1.05);}
.btn:active{transform:translateY(0) scale(.98);}

.hero{position:relative;overflow:hidden;color:#fff;border-radius:0 0 36px 36px;background:radial-gradient(120% 120% at 20% 0%,#1a4372 0%,#12263f 45%,#0a1c31 100%);}
.hero-liquid{position:absolute;inset:0;width:100%;height:100%;filter:blur(30px) saturate(135%);opacity:.7;}
.hero-veil{position:absolute;inset:0;background:radial-gradient(80% 60% at 80% 20%,rgba(10,132,255,.22),transparent 60%);}
.al-landing .hero-inner{position:relative;z-index:2;padding:200px 24px 150px;text-align:center;}
.hero h1{font-size:70px;line-height:1.0;font-weight:800;letter-spacing:-.04em;max-width:15ch;margin:0 auto 20px;}
.hero h1 .g{background:linear-gradient(100deg,#bfe0ff,#7cb4ff);-webkit-background-clip:text;background-clip:text;color:transparent;}
.hero .sub{font-family:var(--serif);font-style:normal;font-weight:500;font-size:27px;line-height:1.4;margin:0 auto 44px;background:linear-gradient(100deg,#d3e8ff,#8fbcff);-webkit-background-clip:text;background-clip:text;color:transparent;}

.portals{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;}
.pcard{width:280px;text-align:left;background:var(--mat-reg);backdrop-filter:blur(36px) saturate(195%);-webkit-backdrop-filter:blur(36px) saturate(195%);border-radius:16px;padding:22px 24px;cursor:pointer;transition:.18s;color:var(--ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.65),inset 0 0 0 .5px rgba(255,255,255,.35),0 10px 30px -14px rgba(0,0,0,.5);}
.pcard:hover{transform:translateY(-5px) scale(1.012);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.9),0 26px 50px -20px rgba(0,0,0,.55);}
.pcard .ptop{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
.pcard .pname{font-weight:800;font-size:26px;letter-spacing:-.03em;color:var(--navy);}
.pcard .pstats{display:flex;gap:24px;}
.pcard .pstats b{display:block;font-size:22px;color:var(--navy);font-weight:800;letter-spacing:-.02em;line-height:1;}
.pcard .pstats span{font-size:12px;color:var(--mut);}
.pcard.soon{opacity:.9;cursor:default;}
.pcard.soon:hover{transform:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.65),inset 0 0 0 .5px rgba(255,255,255,.35),0 10px 30px -14px rgba(0,0,0,.5);}
.pill-live{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:#0a7a3f;background:rgba(52,199,89,.18);padding:4px 10px;border-radius:980px;}
.pill-soon{font-size:10.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:var(--mut);background:rgba(91,107,128,.16);padding:4px 10px;border-radius:980px;}

.al-landing section{padding:88px 0;}
.seclabel{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--accent);margin-bottom:16px;}
.sec-h{font-size:44px;line-height:1.06;font-weight:800;letter-spacing:-.03em;color:var(--navy);}
.center{text-align:center;}
.sec-lead{font-size:19px;line-height:1.55;color:var(--mut);max-width:60ch;margin-top:20px;font-weight:400;}
.sec-lead.center{margin-left:auto;margin-right:auto;}

.mission{text-align:center;}
.mtext{font-size:27px;line-height:1.5;font-weight:400;color:#33425e;max-width:820px;margin:0 auto;letter-spacing:-.015em;text-align:center;}
.em{font-family:var(--serif);font-style:normal;font-weight:500;font-size:1.14em;background:linear-gradient(100deg,var(--navy2),var(--accent));-webkit-background-clip:text;background-clip:text;color:transparent;}
.vision-wrap{max-width:920px;margin:0 auto;}
.vision-tag{font-size:34px;font-weight:800;letter-spacing:-.03em;color:var(--navy);text-align:center;margin-bottom:26px;}

.tabs{display:inline-flex;gap:4px;padding:5px;border-radius:980px;margin:34px auto 8px;background:rgba(255,255,255,.5);backdrop-filter:blur(28px) saturate(195%);box-shadow:inset 0 1px 0 rgba(255,255,255,.75),inset 0 0 0 .5px rgba(255,255,255,.45),0 4px 14px -8px rgba(0,0,0,.14);}
.tabs button{font:inherit;font-size:15px;font-weight:700;border:0;background:none;color:var(--mut);padding:10px 26px;border-radius:980px;cursor:pointer;transition:.16s;}
.tabs button:hover{color:var(--navy);}
.tabs button.on{background:rgba(255,255,255,.95);color:var(--navy);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 8px -2px rgba(0,0,0,.16);}
.panel-fade{animation:al-fade .35s ease;}
@keyframes al-fade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}

.frow{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;margin-top:64px;}
.frow:first-child{margin-top:44px;}
.frow.flip .ftext{order:2;} .frow.flip .fshot{order:1;}
.fnum{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;background:var(--sky);color:var(--accent);font-weight:800;font-size:14px;margin-bottom:16px;}
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

.nuggets{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:34px 0 0;}
.nugget{border-radius:16px;padding:20px 14px;text-align:center;backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 0 .5px rgba(255,255,255,.4);}
.nugget .nn{font-size:22px;font-weight:800;letter-spacing:-.01em;}
.nugget .nc{font-size:12.5px;font-weight:700;margin-top:4px;opacity:.85;}
.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin:24px auto 0;max-width:480px;}
.stat{text-align:center;padding:22px 12px;}
.stat .n{font-size:46px;font-weight:800;letter-spacing:-.03em;color:var(--navy);line-height:1;}
.stat .l{font-size:14px;color:var(--mut);margin-top:10px;font-weight:500;}

.contactw{max-width:720px;margin:0 auto;text-align:center;}
.al-landing footer{padding:52px 0 44px;}
.foot{display:flex;justify-content:space-between;align-items:flex-start;gap:40px;flex-wrap:wrap;}
.foot .tag{font-size:14px;color:var(--mut);margin-top:12px;max-width:32ch;line-height:1.5;}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:20px;letter-spacing:-.03em;color:var(--navy);}
.brand .mark{width:26px;height:26px;border-radius:8px;background:var(--accent);color:#fff;display:grid;place-items:center;}
.foot-links{display:flex;gap:56px;flex-wrap:wrap;}
.foot-col h5{font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--navy);margin-bottom:12px;}
.foot-col a{display:block;font-size:14.5px;color:var(--mut);margin-bottom:9px;cursor:pointer;transition:color .15s;}
.foot-col a:hover{color:var(--accent);}
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

@media(max-width:900px){
  .hero h1{font-size:44px;} .hero .sub{font-size:22px;} .sec-h{font-size:32px;} .mtext{font-size:22px;} .vision-tag{font-size:26px;}
  .frow,.frow.flip{grid-template-columns:1fr;gap:22px;} .frow.flip .ftext{order:1;} .frow.flip .fshot{order:2;}
  .stats,.nuggets{grid-template-columns:repeat(2,1fr);} .tb-sport{display:none;} .menupill{max-width:none;}
}
`;

const HOSTS = [
  { n: 1, title: "AI results parsing", pain: "retyping every PDF by hand", value: "PDF in, results out.", desc: "Drop a competition PDF, photo, or results link into Import. Claude AI reads places, classes, and sail numbers, then you review and publish. The PDF stays the single source of truth.", img: "/landing/host-1.png", Icon: Upload },
  { n: 2, title: "One standardized results database", pain: "results scattered across formats and dead pages", value: "Every result, one format.", desc: "All your events in a single clean, standardized database that is searchable, consistent, and permanent. No more PDFs buried on a club website nobody can find.", img: "/landing/host-2.png", Icon: Database },
  { n: 3, title: "Standings that build themselves", pain: "maintaining league tables in spreadsheets", value: "Zero admin.", desc: "Season standings and class rankings compute automatically from every event you post. No spreadsheets, no manual re-ranking, always up to date.", img: "/landing/host-3.png", Icon: BarChart3 },
];
const ATHLETES = [
  { n: 1, title: "Your career, mapped", pain: "no way to show where you've competed", value: "The globe.", desc: "An interactive globe of every venue and country you've raced. Your international footprint at a glance, the moment someone opens your profile.", img: "/landing/athlete-1.png", Icon: Globe2 },
  { n: 2, title: "See who you've raced", pain: "your competitive network is invisible", value: "The web.", desc: "A living force-directed web of the athletes you've competed against most. Your rivals, mapped by shared competitions and colour-coded by class.", img: "/landing/athlete-2.png", Icon: Share2 },
  { n: 3, title: "Every result since day one", pain: "early results forgotten and lost", value: "Nothing lost.", desc: "Your record reaches back to your very first competition. The whole arc of your career in one place, growing automatically every time a host posts a result.", img: "/landing/athlete-3.png", Icon: Clock },
];
const SPONSORS = [
  { n: 1, title: "AI that scouts for you", pain: "too many athletes to track by hand", value: "Never miss a rising star.", desc: "AI summaries and signals across every profile surface the best emerging athletes automatically. Sponsor-lens overviews judge each result by the level of the field.", img: "/landing/sponsor-1.png", Icon: Sparkles },
  { n: 2, title: "100% verified. Zero fakes.", pain: "fake accounts and inflated claims", value: "Vetted at the source.", desc: "Every result is vetted by the host that ran the event. No self-reported records, no fake athlete accounts, just verified results traceable to the original PDF.", img: "/landing/sponsor-2.png", Icon: ShieldCheck },
  { n: 3, title: "Rank by results, not hype", pain: "hard to compare athletes objectively", value: "Level-adjusted rankings.", desc: "Rank athletes by results weighted for the strength of the field. A mid-fleet finish at a World Championship outranks a win at a club race. Find the best, fast.", img: "/landing/sponsor-3.png", Icon: Trophy },
];

const EMAIL = "casey@athlink.win";

function searchAnswer(raw) {
  const q = (raw || "").toLowerCase().trim();
  if (!q) return "";
  if (q.includes("contact") || q.includes("email") || q.includes("reach")) return `Email <b>${EMAIL}</b>, or use the Contact button below.`;
  if (q.includes("sport")) return "<b>1 live</b> now (Sailing), with Golf coming soon.";
  if (q.includes("athlete") || q.includes("profile")) return "<b>1,775</b> athlete profiles, built automatically from results.";
  if (q.includes("competition") || q.includes("event") || q.includes("regatta")) return "<b>47</b> competitions parsed across the four classes.";
  if (q.includes("class")) return "Four Olympic-track classes: <b>29er, ILCA, 49er, Optimist</b>.";
  if (q.includes("mission") || q.includes("vision")) return "To become the <b>ultimate data centre</b> for global sport.";
  return "Try: contact, how many sports, athletes, competitions, classes.";
}

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

function FeatureRow({ f, flip }) {
  const [ok, setOk] = useState(true);
  const Icon = f.Icon;
  return (
    <div className={"frow" + (flip ? " flip" : "")}>
      <div className="ftext">
        <span className="fnum">{f.n}</span>
        <h3>{f.title}</h3>
        <span className="pain"><b>Solves:</b>&nbsp;{f.pain}</span>
        <div className="value">{f.value}</div>
        <p>{f.desc}</p>
      </div>
      <div className="fshot">
        <div className="shot">
          <div className="chrome">
            <i style={{ background: "#ff5f57" }} /><i style={{ background: "#febc2e" }} /><i style={{ background: "#28c840" }} />
            <span className="url" />
          </div>
          {ok
            ? <img src={f.img} alt={f.title} onError={() => setOk(false)} />
            : <div className="ph"><Icon className="cam" size={30} strokeWidth={1.6} /><div className="cap">{f.title}</div></div>}
        </div>
      </div>
    </div>
  );
}

export default function Landing({ sports = [] }) {
  const [tab, setTab] = useState("hosts");
  const [menuOpen, setMenuOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const bgRef = useRef(null);
  const heroRef = useRef(null);

  useLiquid(bgRef, { scoped: false, count: 13, alpha: 0.42, palette: [[36, 58, 86], [44, 74, 110], [30, 50, 78], [52, 86, 128], [38, 64, 96], [46, 78, 118]] });
  useLiquid(heroRef, { scoped: true, count: 11, alpha: 0.5, palette: [[31, 78, 128], [40, 92, 150], [23, 58, 98], [54, 120, 190], [28, 70, 120], [46, 104, 168]] });

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => { const y = window.scrollY; setNavHidden(y > lastY && y > 90); lastY = y; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toTop = () => window.scrollTo({ top: 0, behavior: "smooth" });
  const openContact = (e) => { if (e) e.preventDefault(); setMenuOpen(false); setContactOpen(true); };
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

  const answer = searchFocus ? searchAnswer(query) : "";
  const rows = { hosts: HOSTS, athletes: ATHLETES, sponsors: SPONSORS }[tab];
  const goSailing = () => { window.location.hash = "#/sailing"; };

  return (
    <div className="al-landing">
      <style>{CSS}</style>
      <canvas ref={bgRef} className="al-liquid" aria-hidden="true" />

      {/* TOP BAR */}
      <div className={"topbar2" + (navHidden ? " hidden" : "")}>
        <div className="tb-brand" title="Back to top" onClick={toTop}>
          <img className="tb-mark" src="/brand/icon-app.png" alt="" aria-hidden="true" />
          <span className="tb-word">AthLink</span>
        </div>
        <div className="tb-center">
          <div className={"menupill" + (menuOpen ? " open" : "")}>
            <div className="mp-bar">
              <button className="mp-burger" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
                {menuOpen ? <X size={17} /> : <Menu size={17} />}
              </button>
              <div className="mp-search">
                <Sparkles size={14} color="var(--accent)" />
                <input
                  placeholder="ask me anything"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocus(true)}
                  onBlur={() => setTimeout(() => setSearchFocus(false), 150)}
                />
              </div>
            </div>
            {answer && <div className="mp-answer" dangerouslySetInnerHTML={{ __html: answer }} />}
            <div className="mp-panel">
              <a className="mp-link" href="#mission" onClick={() => setMenuOpen(false)}>Mission</a>
              <a className="mp-link" href="#ecosystem" onClick={() => setMenuOpen(false)}>Who it's for</a>
              <a className="mp-link" href="#classes" onClick={() => setMenuOpen(false)}>Classes</a>
              <a className="mp-link" onClick={openContact}>Contact</a>
            </div>
          </div>
        </div>
        <div style={{ flex: "none", width: 44 }} />
      </div>

      {/* HERO */}
      <header className="hero">
        <canvas ref={heroRef} className="hero-liquid" aria-hidden="true" />
        <div className="hero-veil" />
        <div className="wrap hero-inner">
          <div className="hero-lockup">
            <img className="hero-mark" src="/brand/icon-white.png" alt="" aria-hidden="true" />
            <span className="hero-word">AthLink</span>
          </div>
          <h1>The ultimate <span className="g">datacentre</span> for sports results</h1>
          <p className="sub">Recording legacy of the future.</p>
          <div className="portals">
            <div className="pcard" onClick={goSailing}>
              <div className="ptop"><span className="pname">Sailing</span><span className="pill-live">Live</span></div>
              <div className="pstats"><div><b>47</b><span>competitions</span></div><div><b>1,775</b><span>athletes</span></div></div>
            </div>
            <div className="pcard soon">
              <div className="ptop"><span className="pname">Golf</span><span className="pill-soon">Soon</span></div>
              <div className="pstats"><div><b>&mdash;</b><span>competitions</span></div><div><b>&mdash;</b><span>athletes</span></div></div>
            </div>
          </div>
        </div>
      </header>

      {/* MISSION */}
      <section className="mission" id="mission">
        <div className="wrap">
          <div className="seclabel">Our mission</div>
          <p className="mtext">At AthLink, our mission is to become the <span className="em">ultimate data centre</span> for global sport: verifying every result, empowering every athlete, and giving sponsors the trusted foundation they need to back the next generation of champions.</p>
        </div>
      </section>

      {/* VISION */}
      <section style={{ paddingTop: 0 }}>
        <div className="wrap vision-wrap">
          <div className="seclabel center">Our vision</div>
          <div className="vision-tag"><span className="grad">LinkedIn</span> for athletes and sponsors</div>
          <p className="mtext">Revolutionizing sports sponsorship by <span className="em">connecting athletes with brands through AI-driven matchmaking</span>, empowering athletes to reach their potential and enabling companies to find authentic ambassadors.</p>
        </div>
      </section>

      {/* ECOSYSTEM */}
      <section id="ecosystem">
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
          {rows.map((f, i) => <FeatureRow key={f.title} f={f} flip={i % 2 === 1} />)}
        </div>
      </section>

      {/* TRACTION / CLASSES */}
      <section className="center" id="classes">
        <div className="wrap">
          <div className="seclabel">100% real data</div>
          <h2 className="sec-h center">Every profile is verified by top organizations</h2>
          <p className="sec-lead center">Currently partnering with the Hong Kong Sailing Federation, the organization that produces Olympic-track sailors.</p>
          <div className="nuggets">
            <div className="nugget" style={{ background: "rgba(232,72,85,.13)", color: "var(--c29)" }}><div className="nn">29er</div><div className="nc">14 competitions</div></div>
            <div className="nugget" style={{ background: "rgba(46,120,200,.13)", color: "var(--cilca)" }}><div className="nn">ILCA</div><div className="nc">12 competitions</div></div>
            <div className="nugget" style={{ background: "rgba(61,61,61,.11)", color: "var(--copt)" }}><div className="nn">OPTI</div><div className="nc">12 competitions</div></div>
            <div className="nugget" style={{ background: "rgba(95,175,78,.14)", color: "var(--c49)" }}><div className="nn">49er</div><div className="nc">9 competitions</div></div>
          </div>
          <div className="stats">
            <div className="stat"><div className="n">47</div><div className="l">Competitions parsed</div></div>
            <div className="stat"><div className="n">1,775</div><div className="l">Athlete profiles built</div></div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact">
        <div className="wrap contactw">
          <div className="seclabel center">Get in touch</div>
          <h2 className="sec-h center">Put your results on AthLink</h2>
          <p className="sec-lead center">Run a class, a club, or a federation? Get your competitions into the database and your athletes into the network.</p>
          <div className="portals" style={{ marginTop: 34 }}>
            <button className="btn cta" onClick={openContact}>Contact us</button>
            <button className="btn ghost" onClick={goSailing}>Enter a portal</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer>
        <div className="wrap">
          <div className="foot">
            <div>
              <div className="brand"><img className="foot-mark" src="/brand/icon-app.png" alt="" aria-hidden="true" />AthLink</div>
              <p className="tag">The ultimate datacentre for sports results. LinkedIn for athletes and sponsors.</p>
            </div>
            <div className="foot-links">
              <div className="foot-col"><h5>Portals</h5><a onClick={goSailing}>Sailing</a><a>Golf</a></div>
              <div className="foot-col"><h5>Platform</h5><a href="#ecosystem">Who it's for</a><a href="#classes">Classes</a></div>
              <div className="foot-col"><h5>Company</h5><a>About</a><a onClick={openContact}>Contact</a></div>
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
