/* Sport-explainer (spm-) view components for sailing — per-class equipment
   holograms + course diagrams, config-driven via SPORT_MODELS (49er / 29er /
   ILCA / Optimist geometry in metres), rendered as dependency-free pseudo-3D
   canvases. Reorg step 4: views/ module, mirroring sports/golf/src/views/.
   Verbatim from App.jsx. */

import React from "react";
import { classLabel, CLASS_COLOR } from "../util/class.js";

/* ═══════════════ SPORT EXPLAINER (spm-) — per-class equipment hologram + course diagram ═══════════════
   Config-driven via SPORT_MODELS: add a class entry and <SportShowcase clsId=…/> renders it with zero
   component changes. Rendering is dependency-free pseudo-3D: [x,y,z] polys → rotate → perspective → SVG. */
const SPM_TAU=Math.PI*2;
const spmReducedMotion=()=>typeof window!=="undefined"&&!!window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Shared rAF driver: one loop per component, paused when offscreen (IntersectionObserver) or tab hidden. */
function useSpmLoop(hostRef,step,reduced){
  const stepRef=React.useRef(step);stepRef.current=step;
  React.useEffect(()=>{
    if(reduced)return;
    let raf=0,vis=true,last=performance.now();
    const frame=now=>{raf=0;const dt=Math.min(64,now-last);last=now;stepRef.current(dt,now);sync();};
    const sync=()=>{const should=vis&&!document.hidden;
      if(should&&!raf)raf=requestAnimationFrame(frame);
      else if(!should&&raf){cancelAnimationFrame(raf);raf=0;}};
    const io=new IntersectionObserver(es=>{vis=!!(es[0]&&es[0].isIntersecting);if(vis)last=performance.now();sync();},{rootMargin:"90px"});
    if(hostRef.current)io.observe(hostRef.current);
    const onVis=()=>{if(!document.hidden)last=performance.now();sync();};
    document.addEventListener("visibilitychange",onVis);
    sync();
    return()=>{io.disconnect();document.removeEventListener("visibilitychange",onVis);if(raf)cancelAnimationFrame(raf);};
  },[reduced]);
}

/* ── Shared boat-geometry helpers ────────────────────────────────────────────────────────────────
   spmHull — loft a ROUNDED hull from stations [x, halfBeam, gunwaleY, keelY]: each cross-section runs
     keel→gunwale on a quarter-cosine so the bottom is flat-ish, the bilge rounds softly and the topsides
     rise (no hard boxy chine). Adds a deck cap + gunwale/keel lines; `caps` closes blunt pram ends.
   spmSail — cambered sail surface from a luff curve + a leech curve (same length) + per-height camber.
     A PIN/POINTED head falls out automatically when the top luff & leech points coincide; a square/fat
     head when they differ. Bellies to PORT (+z) on starboard tack, like the original 49er sails.
   spmBounds/spmFit — normalise any class to a common on-screen size: every boat is displayed at the
     49er's height regardless of real length (this is a display, so relative sizing doesn't matter). */
function spmHull(fill,line,stations,opts){
  opts=opts||{};
  // profile = [zFrac,yFrac] from keel(0,0) → gunwale(1,1). Default = smooth quarter-cosine (rounded bilge);
  // pass a boxy profile (flat bottom, hard chine, vertical sides) for a pram like the Optimist.
  const P=opts.profile||[[0,0],[0.454,0.109],[0.760,0.351],[0.941,0.661],[1,1]];
  const sect=st=>P.map(pf=>[st[0],st[3]+(st[2]-st[3])*pf[1],st[1]*pf[0]]);
  const prof=stations.map(sect);
  for(let i=0;i<prof.length-1;i++){const A=prof[i],B=prof[i+1];
    for(const s of[1,-1])for(let k=0;k<P.length-1;k++)
      fill("hull",k<2?"hullBottom":"hullSide",[[A[k][0],A[k][1],A[k][2]*s],[B[k][0],B[k][1],B[k][2]*s],[B[k+1][0],B[k+1][1],B[k+1][2]*s],[A[k+1][0],A[k+1][1],A[k+1][2]*s]]);
  }
  for(let i=0;i<stations.length-1;i++){const a=stations[i],b=stations[i+1];
    fill("hull","deck",[[a[0],a[2],a[1]],[b[0],b[2],b[1]],[b[0],b[2],-b[1]],[a[0],a[2],-a[1]]]);}
  if(opts.caps)for(const p of[prof[0],prof[prof.length-1]])
    fill("hull","hullSide",p.map(q=>[q[0],q[1],q[2]]).concat(p.slice().reverse().map(q=>[q[0],q[1],-q[2]])));
  for(const s of[1,-1])line("hull","edge",stations.map(st=>[st[0],st[2],st[1]*s]),1.1);
  line("hull","edge",stations.map(st=>[st[0],st[3],0]),0.6);
  if(opts.chine!=null)for(const s of[1,-1])line("hull","edge",stations.map((st,i)=>{const p=prof[i][opts.chine];return[p[0],p[1],p[2]*s];}),0.6);
}
function spmSail(fill,line,part,luff,leech,camz){
  const n=luff.length,mid=luff.map((p,i)=>[(p[0]+leech[i][0])/2,(p[1]+leech[i][1])/2,camz[i]]);
  for(let i=0;i<n-1;i++){
    fill(part,"sail",[luff[i],luff[i+1],mid[i+1],mid[i]]);
    fill(part,"sail",[mid[i],mid[i+1],leech[i+1],leech[i]]);
  }
  line(part,"seam",leech,0.7);                                    // leech (the roach curve)
  for(let i=1;i<n-1;i++)line(part,"seam",[luff[i],mid[i],leech[i]],0.6); // battens
  line(part,"seam",[luff[0],mid[0],leech[0]],0.6);               // foot
  line(part,"seam",[luff[n-1],mid[n-1],leech[n-1]],0.7);         // head (degenerate → invisible on a pin head)
}
function spmBounds(polys){let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for(const p of polys)for(const q of p.pts){if(q[0]<x0)x0=q[0];if(q[0]>x1)x1=q[0];if(q[1]<y0)y0=q[1];if(q[1]>y1)y1=q[1];}
  return{x0,x1,y0,y1,cx:(x0+x1)/2,cy:(y0+y1)/2,h:y1-y0};}
function spmFit(polys,target){
  const b=spmBounds(polys),k=target.h/b.h;                        // uniform scale so this boat fills the target height
  return polys.map(p=>({...p,pts:p.pts.map(q=>[target.cx+(q[0]-b.cx)*k,target.cy+(q[1]-b.cy)*k,q[2]*k])}));
}

/* 49er geometry in metres. Axes: x fore/aft (bow +), y up, z athwartships. Real class proportions:
   hull 4.99 m, hull beam ~1.7 m flaring to 2.90 m across the wings, mast ~8.1 m, bowsprit (retracted),
   square-top main 16.1 m² + jib 5.1 m². */
function build49erGeometry(){
  const polys=[];
  const fill=(part,cls,pts)=>polys.push({part,cls,kind:"fill",pts});
  const line=(part,cls,pts,w)=>polys.push({part,cls,kind:"line",pts,w});
  // Rounded hull — flat-ish bottom, soft bilges, low topsides. Stations [x, halfBeam, gunwaleY, keelY].
  spmHull(fill,line,[
    [ 2.50,0.03,0.50,0.32],
    [ 2.05,0.22,0.47,0.17],
    [ 1.45,0.42,0.45,0.10],
    [ 0.75,0.62,0.44,0.075],
    [ 0.00,0.78,0.435,0.065],
    [-0.80,0.85,0.43,0.065],
    [-1.62,0.86,0.43,0.085],
    [-2.25,0.80,0.435,0.12],
    [-2.49,0.66,0.45,0.17],
  ]);
  line("hull","edge",[[-2.49,0.45,0.66],[-2.49,0.17,0.36],[-2.49,0.17,-0.36],[-2.49,0.45,-0.66]],1); // open transom
  for(const s of[1,-1]){ // wings/racks — rounded rim, long and clearly angled up outboard, trampoline hints
    const rim=[[0.95,0.48,0.62*s],[0.58,0.56,1.17*s],[0.34,0.63,1.44*s],[0.00,0.70,1.56*s],[-1.55,0.73,1.58*s],[-2.04,0.73,1.54*s],[-2.27,0.68,1.39*s],[-2.35,0.58,1.10*s],[-2.35,0.51,0.85*s]];
    fill("hull","wing",rim.concat([[-2.35,0.46,0.84*s],[0.95,0.46,0.62*s]]));
    line("hull","wingEdge",rim,1.3);
    line("hull","seam",[[0.30,0.48,0.68*s],[-0.60,0.71,1.56*s]],0.5);
    line("hull","seam",[[-0.70,0.47,0.79*s],[-1.70,0.72,1.57*s]],0.5);
  }
  // daggerboard — straight parallel-edged board, raked slightly aft
  fill("daggerboard","foil",[[0.62,0.06,0],[0.30,0.06,0],[0.16,-1.05,0],[0.48,-1.05,0]]);
  fill("rudder","foil",[[-2.52,0.52,0],[-2.72,0.52,0],[-2.80,-0.42,0],[-2.87,-0.86,0],[-2.78,-0.97,0],[-2.66,-0.72,0],[-2.59,-0.18,0]]);
  line("rudder","spar",[[-2.60,0.58,0],[-1.55,0.72,0]],1.5); // tiller
  line("mast","mast",[[0.30,0.45,0],[0.26,2.20,0],[0.18,4.20,0],[0.05,6.40,0],[-0.12,8.55,0]],2.2);
  line("mast","spar",[[0.30,0.85,0],[-1.70,0.94,0.45]],1.7); // boom, eased out to port (starboard tack)
  for(const s of[1,-1]){ // standing rigging per the 49er owner's manual (Ovington):
    // two spreader pairs — lower at the mast joint, upper at the hounds; CAP SHROUDS run
    // masthead → over both spreader tips → chainplates; PRIMARY SHROUDS hounds → chainplates;
    // D1 lowers to inner chainplates; twin trapeze wires from the hounds keyplates.
    line("mast","spar",[[0.225,3.35,0],[0.17,3.37,0.48*s]],1.1);  // lower spreaders
    line("mast","spar",[[0.115,5.55,0],[0.07,5.57,0.36*s]],1.1);  // upper spreaders
    line(null,"wire",[[0.10,0.47,0.78*s],[0.17,3.37,0.48*s],[0.07,5.57,0.36*s],[-0.12,8.55,0]],0.8); // cap shroud
    line(null,"wire",[[0.12,0.47,0.66*s],[0.16,5.60,0.02*s]],0.7);  // primary shroud
    line(null,"wire",[[0.16,0.47,0.42*s],[0.225,3.35,0.03*s]],0.6); // D1 lower
    line(null,"trap",[[0.16,5.60,0],[-0.60,0.71,1.56*s]],0.9);      // trapeze wire down to the wing rim
  }
  line(null,"spar",[[2.46,0.50,0],[3.35,0.54,0]],1.6);    // bowsprit, gennaker flying
  line(null,"wire",[[2.42,0.52,0],[0.16,5.60,0]],0.8);    // forestay
  // gennaker — 38 m² asymmetric kite flying entirely on the PORT side: tack on the bowsprit
  // tip, head at the masthead, clew sheeted back beside the port shroud/chainplate.
  const KL=[[3.35,0.55,0.00],[3.90,2.60,0.85],[3.45,5.10,1.15],[2.25,7.35,0.85],[-0.05,8.40,0.15]]; // flying luff
  const KE=[[0.05,0.95,0.66],[0.80,3.10,0.95],[0.92,5.00,1.00],[0.55,6.90,0.62],[-0.05,8.40,0.15]]; // leech to the port clew
  const KZ=[1.20,1.85,2.05,1.35,0.15];
  const KM=KL.map((p,i)=>[(p[0]+KE[i][0])/2+0.30,(p[1]+KE[i][1])/2,KZ[i]]);                         // cambered middle
  for(let i=0;i<4;i++){
    fill("gennaker","kite",[KL[i],KL[i+1],KM[i+1],KM[i]]);
    fill("gennaker","kite",[KM[i],KM[i+1],KE[i+1],KE[i]]);
  }
  line("gennaker","wire",KL,1.1);                                        // luff
  line("gennaker","seam",KE,0.7);                                        // leech
  for(let i=1;i<4;i++)line("gennaker","seam",[KL[i],KM[i],KE[i]],0.6);   // horizontal panel seams
  line("gennaker","seam",[KL[0],[1.70,0.72,0.48],KE[0]],0.7);            // foot
  // Sails are modelled as CAMBERED 3D SURFACES on STARBOARD TACK — every sail bellies out to
  // PORT (+z). Each sail = luff/mid/leech curves at several heights, panelled into strips, so
  // nothing is flat or mirror-symmetric about the centreline.
  // mainsail — square top, roached leech, full-length battens
  const ML=[[0.29,0.92,0],[0.25,2.20,0],[0.17,4.20,0],[0.05,6.40,0],[-0.10,8.45,0]];                  // luff on the mast
  const ME=[[-1.68,0.95,0.45],[-1.85,2.30,0.56],[-1.72,4.40,0.50],[-1.40,6.50,0.34],[-0.92,8.22,0.12]]; // leech, eased to port
  const MZ=[0.40,0.58,0.52,0.34,0.10];
  const MM=ML.map((p,i)=>[(p[0]+ME[i][0])/2,(p[1]+ME[i][1])/2,MZ[i]]);                                 // cambered middle
  for(let i=0;i<4;i++){
    fill("mainsail","sail",[ML[i],ML[i+1],MM[i+1],MM[i]]);
    fill("mainsail","sail",[MM[i],MM[i+1],ME[i+1],ME[i]]);
  }
  line("mainsail","seam",[ML[4],MM[4],ME[4]],1);                          // flat square head
  line("mainsail","seam",ME,0.8);                                        // leech
  for(let i=1;i<4;i++)line("mainsail","seam",[ML[i],MM[i],ME[i]],0.7);    // battens
  line("mainsail","seam",[ML[0],MM[0],ME[0]],0.7);                       // foot
  // jib — luff along the forestay, clew sheeted to port
  const JL=[[2.30,0.62,0],[1.72,1.95,0],[1.16,3.10,0],[0.62,4.55,0]];
  const JE=[[-0.42,0.85,0.34],[-0.25,2.00,0.30],[0.10,3.25,0.22],[0.62,4.55,0]];
  const JZ=[0.40,0.37,0.23,0];
  const JM=JL.map((p,i)=>[(p[0]+JE[i][0])/2,(p[1]+JE[i][1])/2,JZ[i]]);
  for(let i=0;i<3;i++){
    fill("jib","sail",[JL[i],JL[i+1],JM[i+1],JM[i]]);
    fill("jib","sail",[JM[i],JM[i+1],JE[i+1],JE[i]]);
  }
  line("jib","seam",JE,0.7);                                             // leech
  for(let i=1;i<3;i++)line("jib","seam",[JL[i],JM[i],JE[i]],0.6);        // seams
  line("jib","seam",[JL[0],[0.95,0.70,0.20],JE[0]],0.6);                 // foot
  return polys;
}

/* 29er geometry in metres — the 49er's little sister. hull 4.45 m, beam 1.77 m (NO wings/racks),
   fractional mast ~6.25 m, semi square-top main 8.7 m² + jib 3.7 m², asymmetric gennaker ~17 m² on a
   retractable bowsprit, open transom, plumb bow, SINGLE trapeze. Same axes/technique as build49erGeometry. */
function build29erGeometry(){
  const polys=[];
  const fill=(part,cls,pts)=>polys.push({part,cls,kind:"fill",pts});
  const line=(part,cls,pts,w)=>polys.push({part,cls,kind:"line",pts,w});
  // Rounded hull — the 49er's narrower sister: fine plumb bow, NO wings, low topsides, flat-ish bottom.
  spmHull(fill,line,[
    [ 2.22,0.03,0.46,0.27],
    [ 1.82,0.20,0.44,0.15],
    [ 1.28,0.40,0.42,0.09],
    [ 0.66,0.58,0.41,0.06],
    [ 0.00,0.72,0.405,0.05],
    [-0.72,0.79,0.40,0.05],
    [-1.52,0.80,0.40,0.07],
    [-2.10,0.73,0.405,0.11],
    [-2.23,0.58,0.42,0.15],
  ]);
  line("hull","edge",[[-2.23,0.42,0.58],[-2.23,0.15,0.32],[-2.23,0.15,-0.32],[-2.23,0.42,-0.58]],1); // open transom
  fill("daggerboard","foil",[[0.55,0.05,0],[0.26,0.05,0],[0.14,-1.02,0],[0.42,-1.02,0]]);
  fill("rudder","foil",[[-2.26,0.46,0],[-2.44,0.46,0],[-2.52,-0.42,0],[-2.58,-0.82,0],[-2.50,-0.92,0],[-2.40,-0.68,0],[-2.34,-0.18,0]]);
  line("rudder","spar",[[-2.34,0.52,0],[-1.42,0.62,0]],1.5); // tiller
  line("mast","mast",[[0.26,0.40,0],[0.22,2.10,0],[0.12,4.10,0],[-0.02,6.42,0]],2.1);
  line("mast","spar",[[0.26,0.80,0],[-1.55,0.88,0.42]],1.6); // boom, eased to port (starboard tack)
  line(null,"wire",[[2.16,0.46,0],[0.08,4.55,0]],0.7);                      // forestay
  for(const s of[1,-1])line(null,"wire",[[0.04,0.42,0.60*s],[0.10,4.55,0.02*s]],0.6); // shrouds (stayed rig)
  // SINGLE trapeze wire — the crew flies outboard off it (vs the 49er's twin trap + wings)
  line("trapeze","trap",[[0.10,4.55,0],[-0.30,0.42,-0.82]],1.6);
  line("trapeze","trap",[[-0.36,0.58,-0.76],[-0.24,0.58,-0.88]],2.4);       // trapeze handle
  line(null,"spar",[[2.16,0.44,0],[2.95,0.48,0]],1.5);                      // retractable bowsprit
  // gennaker ~17 m² asymmetric kite, flying to PORT (+z) — big and powerful
  const KL=[[2.95,0.50,0.00],[3.40,2.05,0.75],[3.05,4.10,1.00],[1.95,5.90,0.72],[-0.04,6.35,0.12]];
  const KE=[[0.04,0.86,0.58],[0.70,2.55,0.84],[0.80,4.05,0.86],[0.46,5.50,0.52],[-0.04,6.35,0.12]];
  const KZ=[1.05,1.62,1.78,1.14,0.12];
  const KM=KL.map((p,i)=>[(p[0]+KE[i][0])/2+0.28,(p[1]+KE[i][1])/2,KZ[i]]);
  for(let i=0;i<4;i++){
    fill("gennaker","kite",[KL[i],KL[i+1],KM[i+1],KM[i]]);
    fill("gennaker","kite",[KM[i],KM[i+1],KE[i+1],KE[i]]);
  }
  line("gennaker","wire",KL,1.0);
  line("gennaker","seam",KE,0.6);
  for(let i=1;i<4;i++)line("gennaker","seam",[KL[i],KM[i],KE[i]],0.5);
  line("gennaker","seam",[KL[0],[1.55,0.62,0.42],KE[0]],0.6);
  // mainsail — PIN-HEAD main with a big roached leech + battens (NOT a square top): luff & leech meet at the head
  const head=[-0.06,6.42,0.02];
  spmSail(fill,line,"mainsail",
    [[0.24,0.82,0],[0.20,2.15,0],[0.12,3.75,0],[0.02,5.25,0],head],
    [[-1.52,0.90,0.42],[-1.74,2.45,0.54],[-1.60,4.10,0.48],[-1.06,5.45,0.30],head],
    [0.40,0.56,0.50,0.32,0.04]);
  // jib — 3.7 m², luff on the forestay, clew to port; pin head where luff meets leech
  spmSail(fill,line,"jib",
    [[2.10,0.54,0],[1.55,1.75,0],[1.02,2.85,0],[0.50,4.10,0]],
    [[-0.34,0.78,0.30],[-0.16,1.90,0.26],[0.14,3.00,0.18],[0.50,4.10,0]],
    [0.34,0.32,0.20,0]);
  return polys;
}

/* ILCA (Laser) geometry — the Olympic single-hander. hull 4.19 m, beam 1.39 m, low freeboard, UNSTAYED
   two-piece mast ~5.5 m with gentle aft rake, single 7.06 m² sail with a SLEEVED luff that wraps the mast.
   NO forestay, NO shrouds, NO spreaders — the absence of rigging wires is the identifying feature. */
function buildIlcaGeometry(){
  const polys=[];
  const fill=(part,cls,pts)=>polys.push({part,cls,kind:"fill",pts});
  const line=(part,cls,pts,w)=>polys.push({part,cls,kind:"line",pts,w});
  // Low, rounded, legendary one-design hull — narrow, soft bilges, low freeboard, small cockpit.
  spmHull(fill,line,[
    [ 2.09,0.03,0.35,0.20],
    [ 1.72,0.16,0.34,0.11],
    [ 1.22,0.34,0.335,0.055],
    [ 0.64,0.50,0.33,0.03],
    [ 0.02,0.62,0.33,0.02],
    [-0.60,0.67,0.33,0.02],
    [-1.24,0.66,0.335,0.035],
    [-1.80,0.56,0.345,0.07],
    [-2.10,0.42,0.36,0.12],
  ]);
  line("hull","edge",[[-2.10,0.36,0.42],[-2.10,0.12,0.24],[-2.10,0.12,-0.24],[-2.10,0.36,-0.42]],0.9); // small transom
  fill("daggerboard","foil",[[0.42,0.05,0],[0.14,0.05,0],[0.04,-1.02,0],[0.30,-1.02,0]]);
  line("daggerboard","spar",[[0.28,0.34,0],[0.22,0.62,0]],2.2);            // daggerboard handle above deck
  fill("rudder","foil",[[-2.12,0.38,0],[-2.30,0.38,0],[-2.36,-0.48,0],[-2.30,-0.84,0],[-2.22,-0.88,0],[-2.16,-0.52,0],[-2.12,-0.10,0]]);
  line("rudder","spar",[[-2.20,0.44,0],[-1.30,0.56,0]],1.6);              // aluminium tiller
  line("rudder","spar",[[-1.30,0.56,0],[0.12,0.94,0.36]],1.1);            // long tiller EXTENSION — steer while hiking
  // free-standing two-piece mast with gentle aft rake/bend — NO stays hold it up
  line("mast","mast",[[0.12,0.33,0],[0.06,2.10,0],[-0.03,4.00,0],[-0.16,5.88,0]],2.3);
  line("boom","spar",[[0.14,0.66,0],[-1.86,0.74,0.42]],1.7);              // boom
  line("boom","spar",[[0.06,0.34,0],[-0.58,0.66,0.14]],1.3);              // vang/kicker strut holds the boom down
  // mainsail — the ONLY sail: PIN-HEAD triangular sail, sleeve luff wraps the curved mast, roach + battens
  const head=[-0.17,5.88,0.02];
  spmSail(fill,line,"mainsail",
    [[0.12,0.68,0],[0.05,2.10,0],[-0.04,3.75,0],[-0.13,5.00,0],head],
    [[-1.84,0.80,0.42],[-2.02,2.40,0.56],[-1.80,4.05,0.48],[-1.20,5.05,0.30],head],
    [0.44,0.60,0.52,0.32,0.04]);
  return polys;
}

/* Optimist geometry — the world's biggest junior class. hull 2.36 m × 1.12 m, flat BLUNT pram bow (the
   silhouette), single 3.3 m² FOUR-SIDED sprit sail, unstayed mast ~2.3 m, a diagonal SPRIT spar from the
   mast base to the sail's peak, boom along the foot, flat rocker, big open cockpit with air bags. Modelled
   visibly SMALL and boxy — same camera, honest scale, so it looks tiny and charming next to a 49er. */
function buildOptimistGeometry(){
  const polys=[];
  const fill=(part,cls,pts)=>polys.push({part,cls,kind:"fill",pts});
  const line=(part,cls,pts,w)=>polys.push({part,cls,kind:"line",pts,w});
  // BOXY pram hull — flat bottom, hard chine, near-vertical topsides, wide FLAT blunt bow; capped ends.
  spmHull(fill,line,[
    [ 1.15,0.36,0.30,0.08],   // wide flat bow transom
    [ 0.88,0.46,0.295,0.04],
    [ 0.44,0.54,0.29,0.015],
    [ 0.00,0.56,0.285,0.00],
    [-0.48,0.56,0.285,0.00],
    [-0.88,0.52,0.29,0.03],
    [-1.18,0.44,0.30,0.07],   // stern transom
  ],{profile:[[0,0],[0.7,0],[0.95,0.08],[1,0.45],[1,1]],caps:true,chine:3});
  // three buoyancy air bags in the big open cockpit (7th part, like the 49er's seven)
  fill("buoyancy","wing",[[0.84,0.31,0.28],[0.44,0.31,0.28],[0.44,0.35,0.10],[0.84,0.35,0.10]]);      // bow bag
  fill("buoyancy","wing",[[0.20,0.30,0.44],[-0.54,0.30,0.44],[-0.54,0.34,0.28],[0.20,0.34,0.28]]);    // port side bag
  fill("buoyancy","wing",[[0.20,0.30,-0.44],[-0.54,0.30,-0.44],[-0.54,0.34,-0.28],[0.20,0.34,-0.28]]); // starboard side bag
  // big rectangular daggerboard, amidships-forward
  fill("daggerboard","foil",[[0.22,0.05,0],[-0.08,0.05,0],[-0.10,-0.92,0],[0.20,-0.92,0]]);
  line("daggerboard","spar",[[0.20,0.29,0],[0.20,0.53,0]],2.2);            // handle above deck
  fill("rudder","foil",[[-1.20,0.27,0],[-1.36,0.27,0],[-1.40,-0.60,0],[-1.34,-0.80,0],[-1.28,-0.76,0],[-1.24,-0.38,0],[-1.20,-0.03,0]]);
  line("rudder","spar",[[-1.26,0.33,0],[-0.52,0.43,0]],1.5);              // tiller
  // unstayed mast ~2.0 m, stepped well forward (the sprit + boom are the hoverable spars)
  line(null,"mast",[[0.58,0.29,0],[0.56,1.10,0],[0.54,1.90,0]],2.0);
  // FOUR-SIDED sprit MAINSAIL, per the official Optimist sail plan — corners TACK (bottom-front, on the mast),
  // THROAT (top of the luff on the mast), PEAK (the HIGH top corner, aft, held aloft by the sprit) and CLEW
  // (bottom-aft on the boom). Edges LUFF, HEAD (throat→peak), LEECH (the long peak→clew edge), FOOT. The SPRIT
  // runs from MID-MAST up to the PEAK. Rendered as a bilinear cambered quad (u: luff→leech, v: foot→head).
  const Tk=[0.55,0.50,0],Th=[0.52,1.82,0],Pk=[-0.08,2.55,0.08],Cl=[-1.05,0.48,0.34];
  line("sprit","spar",[[0.53,1.26,0],Pk],1.7);                            // sprit: mid-mast → peak (top corner)
  line("boom","spar",[Tk,Cl],1.6);                                        // boom along the foot
  line("boom","wire",[[-0.48,0.50,0.18],[-0.48,0.92,0.10]],0.7);          // bridle mainsheet hint
  const sp=(u,v)=>{const w=[(1-u)*(1-v),(1-u)*v,u*v,u*(1-v)],C=[Tk,Th,Pk,Cl];
    return[w[0]*C[0][0]+w[1]*C[1][0]+w[2]*C[2][0]+w[3]*C[3][0],
           w[0]*C[0][1]+w[1]*C[1][1]+w[2]*C[2][1]+w[3]*C[3][1],
           w[0]*C[0][2]+w[1]*C[1][2]+w[2]*C[2][2]+w[3]*C[3][2]+Math.sin(Math.PI*u)*Math.sin(Math.PI*v)*0.40];};
  const NU=3,NV=3;
  for(let i=0;i<NU;i++)for(let j=0;j<NV;j++)
    fill("spritsail","sail",[sp(i/NU,j/NV),sp((i+1)/NU,j/NV),sp((i+1)/NU,(j+1)/NV),sp(i/NU,(j+1)/NV)]);
  const arc=fn=>{const a=[];for(let k=0;k<=5;k++)a.push(fn(k/5));return a;};
  line("spritsail","seam",arc(t=>sp(0,t)),0.7);                          // luff (tack → throat, on the mast)
  line("spritsail","seam",arc(t=>sp(t,1)),0.8);                          // head (throat → peak)
  line("spritsail","seam",arc(t=>sp(1,1-t)),0.8);                        // leech (peak → clew) — the long edge
  line("spritsail","seam",arc(t=>sp(t,0)),0.7);                          // foot (tack → clew)
  line("spritsail","seam",arc(t=>sp(0.5,t)),0.5);                        // mid seam
  line("spritsail","seam",arc(t=>sp(t,0.5)),0.5);                        // mid batten
  return polys;
}

/* Rotate-Y (yaw) + rotate-X (fixed 12° camera tilt + user pitch), perspective-project, painter-sort. */
function spmProjectAll(polys,yaw,pitchDeg){
  const W=520,H=430,cx=W/2,cyc=H/2+4,D=17,F=15,S=48,YC=3.75,XC=0.6;
  const pit=((12+pitchDeg)*Math.PI)/180;
  const cyw=Math.cos(yaw),syw=Math.sin(yaw),cp=Math.cos(pit),sp=Math.sin(pit);
  const out=[];
  for(let i=0;i<polys.length;i++){
    const P=polys[i],n=P.pts.length,cam=[];
    let d="",zsum=0;
    for(let k=0;k<n;k++){
      const x0=P.pts[k][0]-XC,y0=P.pts[k][1]-YC,z0=P.pts[k][2];
      const xr=x0*cyw+z0*syw,zr=-x0*syw+z0*cyw;
      const y2=y0*cp-zr*sp,z2=y0*sp+zr*cp;
      const f=(F/(D-z2))*S;
      d+=(k?"L":"M")+(cx+xr*f).toFixed(1)+","+(cyc-y2*f).toFixed(1);
      zsum+=z2;
      if(k<3)cam.push([xr,y2,z2]);
    }
    if(P.kind==="fill")d+="Z";
    let light=.5;
    if(P.kind==="fill"&&cam.length===3){
      const ux=cam[1][0]-cam[0][0],uy=cam[1][1]-cam[0][1],uz=cam[1][2]-cam[0][2];
      const vx=cam[2][0]-cam[0][0],vy=cam[2][1]-cam[0][1],vz=cam[2][2]-cam[0][2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
      light=Math.min(1,.18+.82*Math.abs(nz/(Math.hypot(nx,ny,nz)||1)));
    }
    out.push({i,d,part:P.part,cls:P.cls,kind:P.kind,w:P.w,depth:zsum/n,light});
  }
  out.sort((a,b)=>a.depth-b.depth);
  return out;
}

const spmNavy=(t,a)=>{const m=(lo,hi)=>Math.round(lo+(hi-lo)*t);return"rgba("+m(15,74)+","+m(42,140)+","+m(74,205)+","+a+")";};
/* Colours tuned for the app's LIGHT page background — the models render frameless. */
function spmPaint(cls,light,hot){
  switch(cls){
    case"hullSide":return{fill:spmNavy(light,1),stroke:hot?"#0a84ff":"rgba(140,200,255,.4)",sw:hot?1.4:.7,fo:1};
    case"hullBottom":return{fill:spmNavy(light*.55,1),stroke:"rgba(140,200,255,.25)",sw:.6,fo:1};
    case"deck":return{fill:spmNavy(.25+light*.5,1),stroke:hot?"#0a84ff":"rgba(140,200,255,.3)",sw:hot?1.3:.6,fo:1};
    case"wing":return{fill:spmNavy(light,.6),stroke:hot?"#0a84ff":"rgba(31,78,128,.6)",sw:hot?1.5:.9,fo:.5};
    case"foil":return{fill:spmNavy(.3+light*.4,.9),stroke:hot?"#0a84ff":"rgba(31,78,128,.55)",sw:hot?1.6:.8,fo:.92};
    // sails shade panel-by-panel with the surface normal (light) so the camber reads in 3D
    case"sail":{const m=(lo,hi)=>Math.round(lo+(hi-lo)*light);return{fill:"rgb("+m(9,58)+","+m(38,120)+","+m(86,196)+")",stroke:hot?"#0a84ff":"rgba(13,35,60,.6)",sw:hot?1.5:.9,fo:hot?.62:.30+.22*light};}
    case"kite":{const m=(lo,hi)=>Math.round(lo+(hi-lo)*light);return{fill:"rgb("+m(16,66)+","+m(54,132)+","+m(110,210)+")",stroke:hot?"#0a84ff":"rgba(13,35,60,.5)",sw:hot?1.4:.8,fo:hot?.55:.26+.20*light};}
    default:return{fill:spmNavy(light,1),stroke:"rgba(140,200,255,.35)",sw:.7,fo:1};
  }
}
function spmLinePaint(cls,hot){
  if(hot)return{col:"#0a84ff",glow:"rgba(10,132,255,.35)",go:.8};
  switch(cls){
    case"mast":return{col:"rgba(19,49,78,.9)",glow:"rgba(10,132,255,.25)",go:.25};
    case"spar":return{col:"rgba(19,49,78,.72)",glow:"rgba(10,132,255,.2)",go:.2};
    case"wire":return{col:"rgba(31,78,128,.5)",glow:"rgba(10,132,255,.16)",go:.12};
    case"trap":return{col:"rgba(10,132,255,.6)",glow:"rgba(10,132,255,.22)",go:.16};
    case"seam":return{col:"rgba(31,78,128,.32)",glow:"rgba(10,132,255,.15)",go:0};
    default:return{col:"rgba(150,200,245,.7)",glow:"rgba(10,132,255,.2)",go:.15};
  }
}

/* Course models live in each class's SPORT_MODELS[*].course config (520×430 viewBox, wind from the
   top): layout{windXY,dots,lines} + a raw waypoints polyline + a sprite key. CourseDiagram is generic —
   it smooths the waypoints, animates one boat around them, and draws the marks/lines from the config.
   Top-down hull sprites (bow points up, −y): shared vocabulary so class identity comes from shape, not
   from forking the component. Each = {scale, hull path, optional centreline spine + deck dot}. */
const SPM_SPRITES={
  // skiff — the winged 49er hull (wing flares = the ±5.3 bulges). Kept byte-for-byte from the original.
  skiff:{scale:1.78,hull:"M0,-8.5 C2.4,-5.5 3.1,-2.5 3.1,0.5 L3.1,1.6 C5.3,1.9 5.3,5.6 3.1,5.9 L3.1,6.8 L-3.1,6.8 L-3.1,5.9 C-5.3,5.6 -5.3,1.9 -3.1,1.6 L-3.1,0.5 C-3.1,-2.5 -2.4,-5.5 0,-8.5 Z",spine:[[0,-6.5],[0,5.5]],dot:[0,0.5,1.2]},
  // slim skiff — the 29er: same fine bow, NO wing bulges, narrower gunwale, open transom.
  skiffSlim:{scale:1.7,hull:"M0,-8.4 C2.1,-5.4 2.7,-2.4 2.7,0.6 L2.7,6.7 L-2.7,6.7 L-2.7,0.6 C-2.7,-2.4 -2.1,-5.4 0,-8.4 Z",spine:[[0,-6.4],[0,5.4]],dot:[0,0.5,1.1]},
  // dinghy — the ILCA: slim, sharply pointed bow, gently rounded small transom, no wings.
  dinghy:{scale:1.55,hull:"M0,-8 C1.7,-4.8 2.2,-1.8 2.2,1.2 L2,6.2 C2,6.9 -2,6.9 -2,6.2 L-2.2,1.2 C-2.2,-1.8 -1.7,-4.8 0,-8 Z",spine:[[0,-6],[0,5]],dot:[0,0.6,1]},
  // pram — the Optimist: short, boxy, FLAT blunt bow (top edge), rounded stern; visibly the smallest.
  pram:{scale:1.35,hull:"M-2.2,-4.4 Q-2.5,-4.7 -2,-4.7 L2,-4.7 Q2.5,-4.7 2.2,-4.4 L2.5,3.9 Q2.5,4.9 0,5 Q-2.5,4.9 -2.5,3.9 Z",spine:[[0,-3.8],[0,4]],dot:[0,0.2,1]},
};
function spmSmooth(pts,iters){ // Chaikin corner-cutting — turns the waypoint polyline into a smooth track
  let p=pts;
  for(let n=0;n<iters;n++){
    const q=[p[0]];
    for(let i=0;i<p.length-1;i++){
      const a=p[i],b=p[i+1];
      q.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25]);
      q.push([a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);
    }
    q.push(p[p.length-1]);
    p=q;
  }
  return p;
}
function spmResample(pts,n){
  const d=[0];let tot=0;
  for(let i=1;i<pts.length;i++){tot+=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]);d.push(tot);}
  const out=[];let j=0;
  for(let k=0;k<n;k++){
    const target=(tot*k)/(n-1);
    while(j<pts.length-2&&d[j+1]<target)j++;
    const seg=d[j+1]-d[j]||1,t=(target-d[j])/seg;
    out.push([pts[j][0]+(pts[j+1][0]-pts[j][0])*t,pts[j][1]+(pts[j+1][1]-pts[j][1])*t]);
  }
  return out;
}
function spmBuildCourse(waypoints){
  // waypoints: the class's raw polyline (from SPORT_MODELS[*].course.waypoints). Same pipeline for every
  // class — Chaikin ×3 smooth → resample 320 → windowed tangent headings → unwrapped rotation.
  const pts=waypoints||[];
  const smooth=spmResample(spmSmooth(pts,3),320);
  const n=smooth.length;
  // Heading = the SMOOTH path's own tangent, averaged over a window so the boat turns
  // gently and always points where it's actually going (nose leads, trail follows).
  const heads=smooth.map((p,i)=>{
    const a=smooth[Math.max(0,i-5)],b=smooth[Math.min(n-1,i+5)];
    return Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+90;
  });
  for(let i=1;i<n;i++){ // unwrap so rotation is continuous (no 360° flip at the wrap point)
    while(heads[i]-heads[i-1]>180)heads[i]-=360;
    while(heads[i]-heads[i-1]<-180)heads[i]+=360;
  }
  return{pts:smooth,heads};
}
function spmBoatAt(course,t){
  const path=course.pts,n=path.length,f=Math.min(n-1.001,Math.max(0,t*(n-1)));
  const i=Math.floor(f),fr=f-i,a=path[i],b=path[Math.min(n-1,i+1)];
  const ang=course.heads
    ?course.heads[i]+(course.heads[Math.min(n-1,i+1)]-course.heads[i])*fr // interpolate the smooth heading
    :Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+90;
  return{x:a[0]+(b[0]-a[0])*fr,y:a[1]+(b[1]-a[1])*fr,
    ang,idx:i,
    op:t<.03?t/.03:t>.96?Math.max(0,(1-t)/.04):1};
}

/* Mark-rounding waypoint helpers — every rounding leaves the mark to PORT (mark on the boat's LEFT), as a
   tight arc, NEVER a full loop. spmLee = leeward hairpin (run down → beat up): enter west, under the mark,
   exit east (CCW). spmWin = windward hairpin (beat up → run down): enter east, over the top, exit west (CCW).
   spmRnd = a gentler <180° rounding (reach / gate / finish) — it sits the boat on the mark's starboard side
   so the mark stays to port. All in the 520×430 course space, wind from the top. Spread into `waypoints`. */
const spmLee=(mx,my)=>[[mx-7,my-13],[mx-9,my+5],[mx,my+13],[mx+9,my+5],[mx+7,my-14]];
const spmWin=(mx,my)=>[[mx+7,my+13],[mx+9,my-5],[mx,my-13],[mx-9,my-5],[mx-7,my+13]];
const spmRnd=(prev,M,next,R)=>{
  const n=v=>{const d=Math.hypot(v[0],v[1])||1;return[v[0]/d,v[1]/d];};
  const di=n([M[0]-prev[0],M[1]-prev[1]]),dO=n([next[0]-M[0],next[1]-M[1]]);
  const b=[di[0]+dO[0],di[1]+dO[1]],bl=Math.hypot(b[0],b[1]);
  const st=bl<0.35?[-di[1],di[0]]:[-b[1]/bl,b[0]/bl];   // starboard of travel → boat sits here, mark to port
  R=R||15;const ax=M[0]+R*st[0],ay=M[1]+R*st[1];
  return[[ax-di[0]*R,ay-di[1]*R],[ax,ay],[ax+dO[0]*R,ay+dO[1]*R]];
};
/* Gate rounding — sail DOWN BETWEEN the two gate marks first, cross the gate line between them, then round
   the RIGHT-hand mark (rx) to PORT (mark on the LEFT), up its outside. lx/rx = gate marks' x, my = gate y. */
const spmGate=(lx,rx,my)=>{const ent=(lx+3*rx)/4;return[[ent,my-16],[ent+3,my+5],[rx-2,my+13],[rx+11,my+6],[rx+7,my-13]];};

/* Display all classes at the SAME on-screen size (the 49er's) regardless of real-world length — this is
   a display, so relative sizing doesn't matter. spmFit scales each boat to the 49er's bounding height. */
const SPM_FIT_TARGET=spmBounds(build49erGeometry());
export const SPORT_MODELS={
  "49er":{
    equipment:{
      name:"49er",
      geometry:build49erGeometry,
      parts:[
        {id:"hull",name:"Hull",blurb:"Carries the crew and creates the platform; shaped to plane (skim) across the water at high speed."},
        {id:"daggerboard",name:"Daggerboard",blurb:"The underwater fin that stops the boat slipping sideways and stabilises it, converting the sails' side-force into forward drive."},
        {id:"rudder",name:"Rudder",blurb:"The steering blade at the back; small movements at 20+ knots make big course changes."},
        {id:"mast",name:"Mast",blurb:"The 8-metre carbon spar that holds the sails up; bends to depower them in strong wind."},
        {id:"mainsail",name:"Mainsail",blurb:"The engine. Its distinctive square top gives huge power; trimming it (via the mainsheet) controls the boat's speed and balance."},
        {id:"jib",name:"Jib",blurb:"The front sail; drives the boat and steers airflow onto the mainsail, doubling its efficiency."},
        {id:"gennaker",name:"Gennaker",blurb:"The 38 m² downwind sail flown from the bowsprit — it more than doubles the sail area and powers 20-knot-plus runs."},
      ],
    },
    course:{
      title:"How a race works",
      loopSeconds:24,
      explainer:[
        "Course: Start – 1 – 2s/2p – 1 – Finish, tacking upwind and gybing downwind.",
        "Average race: about 30 minutes.",
        "Top speed: 24 knots (~44 km/h) — one of the fastest Olympic boats.",
      ],
      marks:[
        {id:"wind",label:"Wind",desc:"The course is set so the first leg is straight into the wind."},
        {id:"windward",label:"Mark 1 — windward",desc:"The top buoy. Boats beat upwind to it, round it, then turn downwind."},
        {id:"gate",label:"Leeward gate (2s / 2p)",desc:"Two buoys at the bottom of the course — round either one, then head back upwind."},
        {id:"startfinish",label:"Start & finish line",desc:"Races start and finish on the same line, between the committee vessels."},
      ],
      sprite:"skiff",
      layout:{
        windXY:[260,26],
        dots:[
          {id:"windward",label:"1",xy:[260,64],ldx:16,ldy:5},
          {id:"gate",label:"2s",xy:[180,306],ldx:-19,ldy:5},
          {id:"gate",label:"2p",xy:[340,306],ldx:19,ldy:5},
        ],
        lines:[{id:"startfinish",label:"START & FINISH",a:[150,390],b:[370,390]}],
      },
      // Every mark rounded to PORT (mark on the boat's LEFT): windward mark 1 with a tight CCW turn, leeward
      // gate 2s with a CCW turn under the mark — no full loops.
      waypoints:[[258,394],[258,374],[210,332],[304,244],[214,166],[292,104],[272,88],...spmWin(260,64),[286,150],[224,214],[292,272],[300,294],...spmGate(180,340,306),[302,236],[218,166],[290,104],[272,88],...spmWin(260,64),[286,150],[228,236],[302,330],[304,380],[300,406]],
    },
  },

  "29er":{
    equipment:{
      name:"29er",
      geometry:()=>spmFit(build29erGeometry(),SPM_FIT_TARGET),
      parts:[
        {id:"hull",name:"Hull",blurb:"Planing skiff hull with no racks — the two crew hike from the gunwale to keep it flat."},
        {id:"mainsail",name:"Mainsail",blurb:"The engine: a semi square-top main that powers the boat both upwind and down."},
        {id:"jib",name:"Jib",blurb:"The front sail; it feeds clean airflow onto the main and helps the boat point higher."},
        {id:"gennaker",name:"Gennaker",blurb:"The ~17 m² asymmetric kite, flown from a retractable bowsprit for fast planing runs."},
        {id:"trapeze",name:"Trapeze",blurb:"A single wire the crew clips onto and hangs right out over the water to hold the boat flat."},
        {id:"daggerboard",name:"Daggerboard",blurb:"The underwater fin that stops the boat sliding sideways and turns side-force into drive."},
        {id:"rudder",name:"Rudder",blurb:"The steering blade at the stern; tiny inputs at speed swing the bow fast."},
      ],
    },
    course:{
      title:"How a race works",
      loopSeconds:24,
      explainer:[
        "Course L2: Start – 1 – 2s/2p – 1 – 2p – Finish — windward/leeward with a leeward gate, then a short reach to a separate finish.",
        "Average race: about 30 minutes.",
        "Sailed by two; the crew flies on a single trapeze (not the 49er's twin).",
        "Top speed: 15+ knots.",
      ],
      marks:[
        {id:"wind",label:"Wind",desc:"The course is set so the first leg is straight into the wind."},
        {id:"windward",label:"Mark 1 — windward",desc:"The top buoy. Boats beat upwind to it, round it, then turn back downwind."},
        {id:"gate",label:"Leeward gate (2s / 2p)",desc:"Two buoys at the bottom — round either, then either beat back up or peel off to finish."},
        {id:"start",label:"Start line",desc:"The fleet starts together on this line at the bottom of the course."},
        {id:"finish",label:"Reaching finish",desc:"On the last lap, boats reach across from the port gate mark (2p) to a separate finish line off to the side."},
      ],
      sprite:"skiffSlim",
      layout:{
        windXY:[260,26],
        dots:[
          {id:"windward",label:"1",xy:[260,60],ldx:16,ldy:5},
          {id:"gate",label:"2s",xy:[210,300],ldx:-19,ldy:5},
          {id:"gate",label:"2p",xy:[300,300],ldx:19,ldy:5},
        ],
        lines:[
          {id:"start",label:"START",a:[195,400],b:[315,400]},
          {id:"finish",label:"FINISH",a:[389,376],b:[416,330]},
        ],
      },
      // Every mark rounded to PORT (mark on the LEFT). The final 2p rounding is a tight CCW turn with 2p on
      // the left, then a straight reach to the finish — no full loop around the mark.
      waypoints:[[255,396],[254,376],[208,332],[300,242],[212,164],[288,104],[270,86],...spmWin(260,60),[286,150],[222,214],[286,270],[277,292],...spmGate(210,300,300),[300,234],[216,164],[288,104],[270,86],...spmWin(260,60),[284,150],[230,232],[300,280],...spmRnd([300,280],[300,300],[402,352],16),[402,352]],
    },
  },

  "ilca":{
    equipment:{
      name:"ILCA",
      geometry:()=>spmFit(buildIlcaGeometry(),SPM_FIT_TARGET),
      parts:[
        {id:"hull",name:"Hull",blurb:"The low, simple, one-design hull raced identically the world over — pure athlete against athlete."},
        {id:"mainsail",name:"Mainsail",blurb:"The only sail; its sleeved luff slides straight over the mast, so there is no forestay at all."},
        {id:"mast",name:"Mast",blurb:"A free-standing two-piece spar held up by nothing — no stays, no shrouds, no spreaders."},
        {id:"boom",name:"Boom",blurb:"Held down by the vang (kicker) strut; together they flatten the sail to depower it in a breeze."},
        {id:"daggerboard",name:"Daggerboard",blurb:"The fin that grips the water; its handle stands above deck so the athlete can trim its depth."},
        {id:"rudder",name:"Rudder",blurb:"Steered by a long tiller extension the athlete holds while hiking flat out over the side."},
      ],
    },
    course:{
      title:"How a race works",
      loopSeconds:27,
      explainer:[
        "Trapezoid course — outer loop O: Start – 1 – 2 – 3s/3p – 2 – 3s/3p – Finish (the inner loop I drops the extra lap).",
        "Average race: about 45–50 minutes.",
        "One athlete, hiking hard — no crew, no trapeze.",
        "The world's most-sailed Olympic single-hander.",
      ],
      marks:[
        {id:"wind",label:"Wind",desc:"The course is set so the first leg is a beat straight into the wind."},
        {id:"windward",label:"Mark 1 — windward",desc:"Top-right corner of the trapezoid; boats beat up to it, then reach off across the top."},
        {id:"offset",label:"Mark 2 — reaching mark",desc:"Top-left corner. The leg from 1 to 2 is a fast ~60° reach across the top of the course."},
        {id:"gate",label:"Leeward gate (3s / 3p)",desc:"Bottom-left gate. Round either mark; on the inner loop (I) boats finish sooner instead of lapping again."},
        {id:"start",label:"Start line",desc:"Set in the lower middle of the trapezoid; the fleet starts together here."},
        {id:"finish",label:"Finish line",desc:"A separate line off to the side, reached on a short leg after the final gate rounding."},
      ],
      sprite:"dinghy",
      layout:{
        windXY:[280,26],
        dots:[
          {id:"windward",label:"1",xy:[350,70],ldx:16,ldy:5},
          {id:"offset",label:"2",xy:[150,110],ldx:-18,ldy:5},
          {id:"gate",label:"3s",xy:[150,315],ldx:-18,ldy:5},
          {id:"gate",label:"3p",xy:[208,300],ldx:18,ldy:5},
        ],
        lines:[
          {id:"start",label:"START",a:[218,392],b:[318,392]},
          {id:"finish",label:"FINISH",a:[404,280],b:[411,336]},
        ],
      },
      // Every mark rounded to PORT (mark on the LEFT). Mark 2 (both roundings) and gate mark 3p are tight CCW
      // turns with the mark on the left — no full loops.
      waypoints:[[268,388],[266,368],[326,296],[236,208],[336,126],[352,90],...spmRnd([352,90],[350,70],[150,110],15),[300,90],[210,106],...spmRnd([210,106],[150,110],[178,300],15),[176,190],[188,286],...spmGate(150,208,305),[176,235],[150,150],[150,118],...spmWin(150,110),[176,190],[190,286],...spmGate(150,208,305),[280,306],[406,306]],
    },
  },

  "optimist":{
    equipment:{
      name:"Optimist",
      geometry:()=>spmFit(buildOptimistGeometry(),SPM_FIT_TARGET),
      parts:[
        {id:"hull",name:"Hull",blurb:"The flat-bowed pram box, about 2.3 m long — small, stable and almost unsinkable."},
        {id:"spritsail",name:"Mainsail",blurb:"A five-sided sprit-rigged mainsail, unique among these classes; the whole rig packs inside the little hull."},
        {id:"sprit",name:"Sprit",blurb:"The diagonal spar that pushes the sail's top peak up and out, giving the sail its shape."},
        {id:"boom",name:"Boom",blurb:"Runs along the foot of the sail; a bridle spreads the mainsheet load across it."},
        {id:"daggerboard",name:"Daggerboard",blurb:"A big rectangular blade that stops the little boat slipping sideways."},
        {id:"rudder",name:"Rudder",blurb:"The steering blade at the stern, worked by a short tiller."},
        {id:"buoyancy",name:"Buoyancy bags",blurb:"Three air bags fill the open cockpit so the boat floats high even when swamped."},
      ],
    },
    course:{
      title:"How a race works",
      loopSeconds:28,
      explainer:[
        "IODA trapezoid: Start – 1 – 2 – 3 – Finish — two upwind legs, one reach and one long run.",
        "About 45-minute races; the first beat is nearly half the race.",
        "The boat almost every Olympic athlete started in.",
      ],
      marks:[
        {id:"wind",label:"Wind",desc:"The course is set so the first leg is a long beat straight into the wind."},
        {id:"windward",label:"Mark 1 — windward",desc:"Top-right corner; the long first beat to it is nearly half the whole race."},
        {id:"offset",label:"Mark 2 — reaching mark",desc:"Top-left corner. The single reach of the course runs across the top from 1 to 2."},
        {id:"leeward",label:"Mark 3 — leeward gate (3a/3b)",desc:"Bottom-left, reached by the long downwind run; boats round it, then beat the short final leg up to the finish."},
        {id:"start",label:"Start line",desc:"The fleet starts here at the bottom-right and beats up the right-hand side to mark 1."},
        {id:"finish",label:"Finish line",desc:"Set up by mark 2 (IODA course): the final short beat from mark 3 crosses the finish near the top-left."},
      ],
      sprite:"pram",
      layout:{
        windXY:[335,26],
        dots:[
          {id:"windward",label:"1",xy:[355,70],ldx:16,ldy:5},
          {id:"offset",label:"2",xy:[150,120],ldx:-18,ldy:5},
          {id:"leeward",label:"3",xy:[152,355],ldx:-18,ldy:5},
        ],
        lines:[
          {id:"start",label:"START",a:[298,378],b:[390,366]},
          {id:"finish",label:"FINISH",a:[108,122],b:[162,122]},
        ],
      },
      // IODA course (Rajt-1-2-3a/3b-Cél): Start bottom-right → beat to 1 (top-right) → reach to 2 (top-left)
      // → run to 3 (bottom-left) → beat to finish (by mark 2). Every mark rounded to PORT (mark on the left).
      waypoints:[[342,372],[338,352],[304,298],[374,206],[318,118],[352,88],...spmRnd([352,88],[355,70],[150,120],15),[300,88],[210,114],...spmRnd([210,114],[150,120],[150,300],15),[150,200],[151,300],[147,343],...spmLee(152,355),[186,272],[130,206],[150,168],[134,140],[134,116]],
    },
  },
};

export function EquipmentModel3D({cfg,onInfo,onActive}){
  const geo=React.useMemo(()=>cfg.geometry(),[cfg]);
  const[reduced]=React.useState(spmReducedMotion);
  const stRef=React.useRef({yaw:-0.7,pitch:0,vyaw:0,drag:null,idleAt:-1e9,hover:null});
  const[frame,setFrame]=React.useState(()=>spmProjectAll(geo,-0.7,0));
  const[active,setActive]=React.useState(null);
  const wrapRef=React.useRef(null);

  useSpmLoop(wrapRef,(dt,now)=>{
    const s=stRef.current;
    if(!s.drag&&!s.hover){ // rotation pauses while a part is hovered/selected
      if(s.vyaw){s.yaw+=s.vyaw*dt;s.vyaw*=Math.pow(0.93,dt/16.7);if(Math.abs(s.vyaw)<2e-5)s.vyaw=0;}
      if(now-s.idleAt>3000)s.yaw+=(SPM_TAU/24000)*dt; // one revolution / 24 s
    }
    setFrame(spmProjectAll(geo,s.yaw,s.pitch));
  },reduced);

  const setPart=p=>{
    stRef.current.hover=p;
    setActive(p);
    if(onActive)onActive(p); // let a parent (e.g. the home rotator) pause while a part is selected
    if(onInfo){const part=p?cfg.parts.find(x=>x.id===p):null;onInfo(part?{t:part.name,d:part.blurb}:null);}
  };
  const hoverAt=e=>{
    const part=(e.target.dataset&&e.target.dataset.part)||null;
    setPart(part);
  };
  const onDown=e=>{
    stRef.current.drag={x:e.clientX,y:e.clientY,id:e.pointerId,claimed:false,moved:false,mt:performance.now()};
  };
  const onMove=e=>{
    const s=stRef.current,d=s.drag;
    if(d&&d.id===e.pointerId&&!reduced){
      const dx=e.clientX-d.x,dy=e.clientY-d.y;
      if(!d.claimed){
        const ax=Math.abs(dx),ay=Math.abs(dy);
        if(e.pointerType==="touch"){ // only claim horizontal-dominant gestures; let the page scroll otherwise
          if(ax>8&&ax>ay*1.2){d.claimed=true;try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){/* noop */}}
          else if(ay>12&&ay>ax){s.drag=null;return;}
        }else if(ax>3||ay>3){
          d.claimed=true;
          // capture the pointer so dragging keeps working outside the model's bounds until release
          try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){/* noop */}
        }
      }
      if(d.claimed){ // full 360° freedom: yaw + unclamped pitch (trackball feel)
        const now=performance.now(),mdt=Math.max(8,now-d.mt);d.mt=now;d.moved=true;
        s.yaw+=dx*0.0065;s.vyaw=(dx*0.0065)/mdt;
        s.pitch+=dy*0.32;
        d.x=e.clientX;d.y=e.clientY;
        setPart(null);
        return;
      }
    }
    if(e.pointerType!=="touch")hoverAt(e);
  };
  const onUp=e=>{
    const s=stRef.current,d=s.drag;
    if(d&&d.id===e.pointerId){
      s.drag=null;s.idleAt=performance.now();
      if(!d.moved){ // tap = select part; tap elsewhere dismisses
        const part=(e.target.dataset&&e.target.dataset.part)||null;
        setPart(part);
      }
    }
  };
  const onLeave=e=>{if(e.pointerType!=="touch"&&!stRef.current.drag)setPart(null);};

  return(
    <div ref={wrapRef} className="spm-holo">
      <svg viewBox="0 0 520 430" style={{display:"block",width:"100%",cursor:reduced?"default":"grab",touchAction:"pan-y"}}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={onLeave}>
        {frame.map(p=>{
          const hot=!!active&&p.part===active;
          const dim=!!active&&!hot; // dim everything but the selected part so it pinpoints clearly
          if(p.kind==="fill"){
            const c=spmPaint(p.cls,p.light,hot);
            return<path key={p.i} d={p.d} fill={c.fill} fillOpacity={c.fo} stroke={c.stroke} strokeWidth={c.sw}
              strokeLinejoin="round" opacity={dim?0.16:1} data-part={p.part||undefined}/>;
          }
          const L=spmLinePaint(p.cls,hot);
          return(<g key={p.i} opacity={dim?0.14:1}>
            {(hot||L.go>0)&&<path d={p.d} fill="none" stroke={L.glow} strokeWidth={(p.w||1)*3.6} strokeLinecap="round" opacity={L.go}/>}
            <path d={p.d} fill="none" stroke={L.col} strokeWidth={hot?(p.w||1)*1.6:(p.w||1)} strokeLinecap="round" data-part={p.part||undefined}/>
          </g>);
        })}
        {frame.filter(p=>p.part&&p.kind==="line").map(p=>( // generous invisible hit paths so thin lines are hoverable
          <path key={"h"+p.i} d={p.d} fill="none" stroke="#000" strokeOpacity="0" strokeWidth="15"
            data-part={p.part} style={{pointerEvents:"stroke"}}/>
        ))}
      </svg>
    </div>
  );
}

export function CourseDiagram({cfg,onInfo}){
  const[reduced]=React.useState(spmReducedMotion);
  const course=React.useMemo(()=>spmBuildCourse(cfg.waypoints),[cfg]);
  const[clock,setClock]=React.useState(1600); // start a little into the lap so the boat is visible at once
  const[mark,setMark]=React.useState(null);
  const wrapRef=React.useRef(null);
  useSpmLoop(wrapRef,dt=>setClock(c=>c+dt),reduced);
  const T=(cfg.loopSeconds||24)*1000,L=cfg.layout||{};
  const report=m=>{ // hover text goes to the shared bottom info line, never over the diagram
    if(!onInfo)return;
    if(m){const mk=(cfg.marks||[]).find(x=>x.id===m);onInfo(mk?{t:mk.label,d:mk.desc}:null);}
    else onInfo({t:cfg.title,d:(cfg.explainer||[]).join(" ")});
  };
  const onMove=e=>{const m=(e.target.dataset&&e.target.dataset.mark)||null;if(m!==mark){setMark(m);report(m);}};
  const hi=id=>mark===id;
  const t=reduced?0.30:(clock/T)%1;
  const s=spmBoatAt(course,t);
  const back=Math.max(0,s.idx-72); // fading contrail over the last ~25% of track
  const seg=(from,to)=>course.pts.slice(from,to+1).map(p=>p[0].toFixed(1)+","+p[1].toFixed(1)).join(" ");
  const i1=back+Math.floor((s.idx-back)/3),i2=back+Math.floor(2*(s.idx-back)/3);
  // committee vessels sit at both ends of every start / finish line
  const rcBoat="M0,-7 C2,-4 2.6,-1 2.6,2 L2.6,6 L-2.6,6 L-2.6,2 C-2.6,-1 -2,-4 0,-7 Z";
  const wx=(L.windXY&&L.windXY[0])||260,wy=(L.windXY&&L.windXY[1])||26;
  const sp=SPM_SPRITES[cfg.sprite]||SPM_SPRITES.skiff; // top-down hull for this class
  return(
    <div ref={wrapRef} className="spm-holo" onPointerEnter={()=>report(null)} onPointerLeave={()=>{setMark(null);if(onInfo)onInfo(null);}}>
      <svg viewBox="0 0 520 430" style={{display:"block",width:"100%"}} onPointerMove={onMove}>
        <g>
          <text x={wx} y="16" textAnchor="middle" fill={hi("wind")?"#0a84ff":"#33425e"} fontSize="15" fontWeight="800" letterSpacing="2">WIND</text>
          <path d={`M${wx},22 L${wx},50 M${wx-9},41 L${wx},51 L${wx+9},41`} stroke={hi("wind")?"#0a84ff":"rgba(19,49,78,.75)"} strokeWidth="2.4" fill="none" strokeLinecap="round"/>
          <circle cx={wx} cy={wy+8} r="22" fill="transparent" data-mark="wind"/>
        </g>
        {(L.lines||[]).map((ln,k)=>{ // start / finish line(s): dashed, committee glyph each end, label below
          const mid=(ln.a[0]+ln.b[0])/2,ly=Math.max(ln.a[1],ln.b[1])+26;
          return(<g key={"ln"+k}>
            <line x1={ln.a[0]} y1={ln.a[1]} x2={ln.b[0]} y2={ln.b[1]}
              stroke={hi(ln.id)?"#0a84ff":"rgba(6,99,196,.8)"} strokeWidth={hi(ln.id)?2.4:1.7} strokeDasharray="6 7"/>
            <g transform={"translate("+ln.a[0]+","+ln.a[1]+") scale(1.2)"}><path d={rcBoat} fill="rgba(19,49,78,.7)" stroke="rgba(19,49,78,.85)" strokeWidth=".6"/></g>
            <g transform={"translate("+ln.b[0]+","+ln.b[1]+") scale(1.2)"}><path d={rcBoat} fill="rgba(19,49,78,.7)" stroke="rgba(19,49,78,.85)" strokeWidth=".6"/></g>
            <text x={mid} y={ly} textAnchor="middle" fill={hi(ln.id)?"#0a84ff":"rgba(51,66,94,.85)"} fontSize="13.5" fontWeight="700" letterSpacing="1.5">{ln.label}</text>
            <line x1={ln.a[0]} y1={ln.a[1]} x2={ln.b[0]} y2={ln.b[1]} stroke="#000" strokeOpacity="0" strokeWidth="22" data-mark={ln.id}/>
          </g>);
        })}
        {(L.dots||[]).map((d,k)=>( // rounding marks (a gate = two dots sharing one id)
          <g key={"dot"+k}>
            <circle cx={d.xy[0]} cy={d.xy[1]} r="14" className="spm-halo" fill="rgba(10,132,255,.28)"/>
            <circle cx={d.xy[0]} cy={d.xy[1]} r="7.5" fill={hi(d.id)?"#0663c4":"#0a78e8"} stroke="rgba(19,49,78,.5)" strokeWidth="1.2"/>
            <text x={d.xy[0]+(d.ldx||0)*1.5} y={d.xy[1]+(d.ldy||0)+1} textAnchor="middle" fill={hi(d.id)?"#0a84ff":"rgba(51,66,94,.95)"} fontSize="18" fontWeight="800">{d.label}</text>
            <circle cx={d.xy[0]} cy={d.xy[1]} r="20" fill="transparent" data-mark={d.id}/>
          </g>
        ))}
        <g opacity={s.op}>
          {s.idx-back>4&&<g fill="none" strokeLinecap="round">
            <polyline points={seg(back,i1)} stroke="rgba(10,132,255,.20)" strokeWidth="3"/>
            <polyline points={seg(i1,i2)} stroke="rgba(10,132,255,.40)" strokeWidth="3"/>
            <polyline points={seg(i2,s.idx)} stroke="rgba(10,132,255,.62)" strokeWidth="3.2"/>
          </g>}
          <g transform={"translate("+s.x.toFixed(1)+","+s.y.toFixed(1)+") rotate("+s.ang.toFixed(1)+") scale("+sp.scale+")"}>
            <path d={sp.hull} fill="rgba(9,111,214,.95)" stroke="rgba(13,35,60,.9)" strokeWidth=".9" strokeLinejoin="round"/>
            {sp.spine&&<line x1={sp.spine[0][0]} y1={sp.spine[0][1]} x2={sp.spine[1][0]} y2={sp.spine[1][1]} stroke="rgba(255,255,255,.85)" strokeWidth=".8"/>}
            {sp.dot&&<circle cx={sp.dot[0]} cy={sp.dot[1]} r={sp.dot[2]} fill="rgba(255,255,255,.95)"/>}
          </g>
        </g>
      </svg>
    </div>
  );
}

/* The two models side by side + one shared info line underneath — hover text lands here,
   at the very bottom, so nothing ever covers the diagrams. */
export function SpmDuo({cfg,compact,onActive}){
  const[info,setInfo]=React.useState(null);
  return(
    <div className={`spm-duo${compact?" spm-duo--home":""}`}>
      <div className={`spm-duorow${compact?" spm-duorow--home":""}`}>
        <EquipmentModel3D cfg={cfg.equipment} onInfo={setInfo} onActive={onActive}/>
        <CourseDiagram cfg={cfg.course} onInfo={setInfo}/>
      </div>
      <div className="spm-info">
        {info
          ?(<><b>{info.t}</b><span> — {info.d}</span></>)
          :(<span className="spm-info-hint"><span className="spm-hint-mouse">Drag the boat to spin it · hover any part or course mark for details</span><span className="spm-hint-touch">Drag the boat to spin it · tap any part for details</span></span>)}
      </div>
    </div>
  );
}

export function SportShowcase({clsId,compact,onActive}){
  const cfg=SPORT_MODELS[clsId];
  if(!cfg)return null;
  return(
    <div className={`spm-sec${compact?" spm-sec--home":""}`}>
      <SpmDuo cfg={cfg} compact={compact} onActive={onActive}/>
    </div>
  );
}

/* Home-page rotation: cycle 49er → 29er → ILCA → Optimist, one class every 5 s, with a soft crossfade.
   Only ONE model is mounted at a time (no hidden models left animating). Rotation pauses while the user
   is interacting (pointer over either model, mid-drag, or a part selected), while the tab is hidden, and
   under prefers-reduced-motion — resuming 5 s after interaction ends. Class portals do NOT use this;
   they render a fixed SpmDuo. Defined AFTER SportShowcase + its data deps (SPORT_MODELS, classLabel,
   CLASS_COLOR) so there is no temporal-dead-zone reference. */
const SPM_ROTATION=["49er","29er","ilca","optimist"];
export function HomeShowcaseRotator(){
  const[reduced]=React.useState(spmReducedMotion);
  const[idx,setIdx]=React.useState(0);
  const[fade,setFade]=React.useState(1);
  const stRef=React.useRef({interacting:false,partSel:false,lastAt:-1e9,fadeTimer:0});
  const idxRef=React.useRef(0);idxRef.current=idx;
  // paused while: reduced motion, tab hidden, pointer interacting, a part selected, or <5 s since the last touch
  const busy=()=>{const s=stRef.current;return reduced||(typeof document!=="undefined"&&document.hidden)||s.interacting||s.partSel||(performance.now()-s.lastAt<5000);};
  const goTo=React.useCallback(n=>{ // fade out → swap class → fade in (~300 ms opacity crossfade)
    setFade(0);
    stRef.current.fadeTimer=window.setTimeout(()=>{setIdx(n);setFade(1);},300);
  },[]);
  React.useEffect(()=>{
    if(reduced)return;
    // advance once the current class's boat finishes its lap (loopSeconds ≈ 20-28 s), not on a fixed 5 s tick
    let alive=true,timer=0;
    const lap=i=>{const c=SPORT_MODELS[SPM_ROTATION[i]];return((c&&c.course&&c.course.loopSeconds)||22)*1000;};
    const tick=()=>{
      if(!alive)return;
      if(busy()){timer=window.setTimeout(tick,1600);return;} // paused (hover/drag/hidden) → recheck soon
      const next=(idxRef.current+1)%SPM_ROTATION.length;
      goTo(next);
      timer=window.setTimeout(tick,lap(next));
    };
    timer=window.setTimeout(tick,lap(idxRef.current));
    return()=>{alive=false;if(timer)window.clearTimeout(timer);if(stRef.current.fadeTimer)window.clearTimeout(stRef.current.fadeTimer);};
  },[reduced,goTo]);
  const mark=()=>{stRef.current.lastAt=performance.now();};
  const onEnter=()=>{stRef.current.interacting=true;mark();};
  const onLeave=()=>{stRef.current.interacting=false;mark();};
  const onDown=()=>{stRef.current.interacting=true;mark();};
  const onActive=p=>{stRef.current.partSel=!!p;if(p)mark();};
  const jump=k=>{mark();if(k!==idxRef.current)goTo(k);}; // pip click = jump + counts as interaction
  const cur=SPM_ROTATION[idx];
  return(
    <div className="spm-rotator"
      onPointerEnter={onEnter} onPointerLeave={onLeave}
      onPointerDown={onDown} onPointerUp={mark} onPointerCancel={onLeave} onPointerMove={mark}>
      <div className="spm-rotbar">
        <span className="spm-rotlabel">{classLabel(cur)}</span>
        <span className="spm-rotpips">
          {SPM_ROTATION.map((c,k)=>(
            <button key={c} type="button" className={"spm-rotpip"+(k===idx?" on":"")}
              style={k===idx?{background:CLASS_COLOR[c]||"var(--accent)",borderColor:CLASS_COLOR[c]||"var(--accent)"}:undefined}
              onClick={()=>jump(k)} aria-label={classLabel(c)} title={classLabel(c)}/>
          ))}
        </span>
      </div>
      <div className="spm-rotstage" style={{opacity:fade}}>
        <SportShowcase key={cur} clsId={cur} compact onActive={onActive}/>
      </div>
    </div>
  );
}
