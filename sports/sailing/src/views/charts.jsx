/* Rating-derived chart views for sailing — AthleteWeb (force-directed rival
   web, d3-force) and ProgressChart (skill-rating career curve), plus their
   private helpers (modeOfCountMap, YearNuggets, InfoHint, monoPath) and the
   sport-bound rating engine instance (makeRatingEngine ← @athlink/rating).
   Reorg step 4: views/ module, mirroring sports/golf/src/views/. Verbatim
   from App.jsx. */

import React from "react";
import { forceSimulation, forceManyBody, forceLink, forceCollide, forceX, forceY } from "d3-force";
import { makeRatingEngine } from "@athlink/rating";
import { formatDate, dateKey, monthsBetween } from "../util/date.js";
import { canonName, ordinalOf } from "../util/name.js";
import { IOC_ISO, isoFlag, iocFlag } from "../util/flag.js";
import { classColor, classLabel, nuggetFor } from "../util/class.js";
import { ATHLETE_ATTRS } from "../data/athletes.js";
import { scoreEvent } from "../data/scoring.js";

/* Rating engine (Glicko-lite skill ratings + rating-aware rival cohort) now lives
   in @athlink/rating — the first universal feature package. Sailing injects its own
   ranking + identity helpers (scoreEvent/canonName/dateKey/monthsBetween are hoisted
   functions defined above); another sport binds its own. Logic is unchanged. */
export const ratingEngine = makeRatingEngine({ scoreEvent, canonName, dateKey, monthsBetween });   // shared instance (one ratings cache) — forecast.jsx reuses it
const { getAthleteRatings, computeRivalCohort, projectRating } = ratingEngine;

/* === AthleteWeb: force-directed "web" of rivals ==============================
   Each node is an athlete the focal athlete has raced against. Rivals are
   ranked and sized by a combined rivalry score on a 0–1 scale:
       rivalry = decayedJaccard^ALPHA × proximity^BETA × ratingProx^GAMMA × activity
   decayedJaccard = sharedW / (focalTotalW + rivalTotalW − sharedW) — the raw
   Jaccard, but every shared/total event is time-weighted: a meeting's weight
   halves every RIVAL_HALF_LIFE_M months (undated events count UNDATED_W), so
   old rivalries fade and recent ones dominate. Co-appearance still damps
   one-event wonders and mega-active athletes who co-appear with everyone.
   proximity = mean over shared events of exp(−GAP_K × |rankGap| / (fleet−1)) —
   how close the two actually finish. Ranks are read from scoreEvent (PDF is
   ground truth, never re-ranked). Events where either rank is missing, or
   where the two sailed the SAME boat (partners), count for co-appearance but
   never for closeness; zero ranked meetings ⇒ proximity = PROX_FLOOR.
   ratingProx = exp(−|R_focal − R_rival| / RATING_PROX_SIGMA) from the global
   rating engine (getAthleteRatings) — two athletes at a similar skill level are
   truer rivals than a champion and a back-marker who merely raced often. If
   either has no rating (all-undated career) it's a neutral 0.5, never read as
   closeness or distance.
   activity = 0.5^(monthsSince(rival's last dated event)/ACTIVITY_HALF_LIFE_M) —
   pulls retired athletes out of the current orbit; a rival with no dated event
   gets a neutral 0.5. "now" is the dataset's own max dateKey, not wall-clock,
   so historical datasets decay relative to their own latest event.
   Distance from the focal athlete truthfully encodes this score via a SPRING:
   each rival's focal link has a rest-length derived from its rank vs. the top
   rival (stronger rival ⇒ bigger node ⇒ shorter spring ⇒ closer), so the layout
   settles with bigger nodes near the centre but stays fluid — springs stretch,
   sway and can be dragged, rather than being pinned to a rigid orbit shell.
   Raw integer shared count stays on the node for human-readable display AND for
   the MIN_SHARED eligibility test (both on RAW counts, not weighted). Edges
   connect any two shown athletes who appeared in the same event (weight = times
   together). Limited to the top 15 rivals with ≥MIN_SHARED shared events
   (relaxed to 1 for young profiles). Drag nodes; hover to spotlight a node and
   its connections; click to pin (sidebar shows head-to-head + shared comps);
   double-click to open that athlete's profile.
   Self-contained 2D canvas (matches SailingGlobe) + d3-force physics. */
function modeOfCountMap(m){if(!m)return null;let best=null,bc=-1;m.forEach((c,k)=>{if(c>bc){bc=c;best=k;}});return best;}

export function AthleteWeb({name,events,height=220,dark=true,onPick,onOpen,onOpenEvent,onSelectionChange,deselectKey=0,enlarged=false,selYears=null,yrKey=""}){
  const canvasRef=React.useRef(null);
  const wrapRef=React.useRef(null);
  const simRef=React.useRef(null);
  const onPickRef=React.useRef(onPick);
  const onOpenRef=React.useRef(onOpen);
  const onOpenEventRef=React.useRef(onOpenEvent);
  const onSelChangeRef=React.useRef(onSelectionChange);
  React.useEffect(()=>{onPickRef.current=onPick;onOpenRef.current=onOpen;onOpenEventRef.current=onOpenEvent;onSelChangeRef.current=onSelectionChange;},[onPick,onOpen,onOpenEvent,onSelectionChange]);
  const stateRef=React.useRef({w:260,h:height,dpr:1,nodes:[],links:[],hover:null,sel:null,drag:null,maxShared:1,down:null,scale:1,ox:0,oy:0,pan:null});

  // Build {nodes, links} from all events, centred on the focal athlete.
  // Cohort comes from computeRivalCohort — the same set ProgressChart scores
  // against — along with focalEvData, the per-event rank maps reused by the
  // sidebar's head-to-head + shared-competition memos below.
  const graph=React.useMemo(()=>{
    // Same selected-year filter the Globe/Progress use (undated events kept only when all years selected).
    const sel=yrKey?new Set(selYears):null;
    const evs=sel?(events||[]).filter(ev=>{const dk=dateKey(ev.date);if(!dk)return false;return sel.has(+dk.slice(0,4));}):events;
    const{focal,disp,rivals,clsCount,natCount,focalEvData}=computeRivalCohort(name,evs,15);
    const keep=new Set(rivals.map(r=>r.key)); keep.add(focal);
    const maxShared=rivals.length?Math.max(...rivals.map(r=>r.shared)):1;
    const maxCorr=rivals.length?rivals[0].corr:1;
    // node class = the boat class they shared MOST competitions with the focal in (drives node colour)
    const nodes=[{id:focal,name:disp.get(focal)||name,cls:ATHLETE_ATTRS.get(focal)?.recentCls||null,nat:modeOfCountMap(natCount.get(focal)),shared:maxShared,corr:maxCorr||1,focal:true}];
    rivals.forEach(r=>nodes.push({id:r.key,name:r.name,cls:modeOfCountMap(clsCount.get(r.key)),nat:modeOfCountMap(natCount.get(r.key)),shared:r.shared,corr:r.corr,ranked:r.ranked,focal:false}));
    const ew=new Map();
    focalEvData.forEach(({present})=>{
      const arr=[...present].filter(k=>keep.has(k));
      for(let i=0;i<arr.length;i++)for(let j=i+1;j<arr.length;j++){
        const a=arr[i],b=arr[j];const key=a<b?a+"|"+b:b+"|"+a;
        ew.set(key,(ew.get(key)||0)+1);
      }
    });
    const links=[...ew.entries()].map(([key,w])=>{const p=key.split("|");return{source:p[0],target:p[1],w};});
    return{nodes,links,maxShared,maxCorr:maxCorr||1,focal,count:rivals.length,focalEvData};
  },[name,events,yrKey]);

  // selected node (lifted to React state so the enlarged sidebar can render it)
  const [selNode,setSelNode]=React.useState(null);
  React.useEffect(()=>{onSelChangeRef.current&&onSelChangeRef.current(selNode);},[selNode]);
  // external "Deselect" (from the popup header) clears the current selection
  React.useEffect(()=>{const st=stateRef.current;st.sel=null;setSelNode(null);st.draw&&st.draw();},[deselectKey]);
  // the competitions the focal + selected athlete both sailed, with both
  // placements (from the rank maps already built in the graph memo)
  const sharedComps=React.useMemo(()=>{
    if(!selNode)return [];
    const target=selNode.id;
    return graph.focalEvData
      .filter(d=>d.present.has(target))
      .map(d=>({ev:d.ev,focalRank:d.focalRank,rivalRank:d.rankOf.get(target)??null,sameBoat:d.mates.has(target)}))
      .sort((a,b)=>dateKey(b.ev.date).localeCompare(dateKey(a.ev.date)));
  },[selNode,graph]);
  // head-to-head record vs the selected athlete — overall and split by the
  // focal athlete's partner in each event. Only events where BOTH have ranks
  // and the two weren't in the same boat count; missing data never fabricates
  // a win, a loss, or closeness.
  const headToHead=React.useMemo(()=>{
    if(!selNode)return null;
    const target=selNode.id;
    let w=0,l=0,t=0,gapSum=0,n=0;
    const byPartner=new Map();            // partnerKey -> {name,w,l,t,n}
    graph.focalEvData.forEach(d=>{
      if(!d.present.has(target)||d.mates.has(target))return;
      const rr=d.rankOf.get(target);
      if(d.focalRank==null||rr==null)return;
      const res=d.focalRank<rr?"w":(d.focalRank>rr?"l":"t");
      if(res==="w")w++;else if(res==="l")l++;else t++;
      gapSum+=rr-d.focalRank;n++;
      const pk=d.partnerKey||"__solo";
      let g=byPartner.get(pk);
      if(!g){g={name:d.partnerKey?d.partnerName:"Solo",w:0,l:0,t:0,n:0};byPartner.set(pk,g);}
      g[res]++;g.n++;
    });
    return{n,w,l,t,avgGap:n>0?gapSum/n:0,
      partners:[...byPartner.values()].sort((a,b)=>b.n-a.n||a.name.localeCompare(b.name))};
  },[selNode,graph]);

  React.useEffect(()=>{
    const cv=canvasRef.current,wrap=wrapRef.current;
    if(!cv||!wrap||graph.nodes.length<=1)return;
    const st=stateRef.current;
    const ctx=cv.getContext("2d");
    const sizeCanvas=()=>{
      const w=wrap.clientWidth||260,h=height,dpr=window.devicePixelRatio||1;
      cv.width=w*dpr;cv.height=h*dpr;cv.style.width=w+"px";cv.style.height=h+"px";
      st.w=w;st.h=h;st.dpr=dpr;ctx.setTransform(dpr,0,0,dpr,0,0);
    };
    sizeCanvas();
    const nodes=graph.nodes.map(n=>({...n}));
    const byId=new Map(nodes.map(n=>[n.id,n]));
    const links=graph.links.map(l=>({...l}));
    st.nodes=nodes;st.links=links;st.byId=byId;st.maxShared=graph.maxShared;st.maxCorr=graph.maxCorr;st.hover=null;st.sel=null;st.scale=1;st.ox=0;st.oy=0;st.pan=null;
    setSelNode(null);
    const focalNode=byId.get(graph.focal);
    if(focalNode){focalNode.fx=st.w/2;focalNode.fy=st.h/2;}
    // truthful-orbit target radius: distance from the focal encodes the rival
    // score (higher score ⇒ strictly closer). sqrt spreads the top cluster apart.
    const RMIN=enlarged?140:46, RMAX=enlarged?250:104;   // truthful-orbit range (mini h=220 / enlarged h=540)
    nodes.forEach(n=>{if(n.focal)return;
      const ratio=(n.corr||0)/(graph.maxCorr||1);        // 1 = top rival, → 0 = weakest
      n.targetR=RMIN+(1-Math.sqrt(ratio))*(RMAX-RMIN);   // sqrt spreads the top cluster apart
    });
    // scatter rivals radially at their target orbit, with random jitter so the
    // layout looks organic.
    nodes.forEach(n=>{if(n.focal)return;
      const ang=Math.random()*Math.PI*2,dist=n.targetR+(Math.random()-.5)*(enlarged?60:18);
      n.x=st.w/2+Math.cos(ang)*dist;n.y=st.h/2+Math.sin(ang)*dist;});
    // Sizing is relative to the focal node: the MOST-CORRELATED rival (Jaccard)
    // is 80% of the focal's size, everyone else scales linearly by their
    // correlation vs. that top rival. No rival is ever bigger than focal.
    const F=enlarged?12.6:7.65;               // focal radius (50% smaller, +20%, then +50%)
    const rad=d=>{if(d.focal)return F;
      const ratio=(d.corr||0)/(st.maxCorr||1);
      return Math.max(enlarged?3.3:1.95,F*0.8*ratio);};   // top rival = 80% of focal
    st.rad=rad;
    const lerpText=(n,strong,sx,sy)=>{
      ctx.font=(strong?"700 ":"600 ")+(strong?12:10.5)+"px -apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif";
      const t=n.name,tw=ctx.measureText(t).width,x=sx,y=sy-rad(n)*st.scale-6;
      ctx.fillStyle="rgba(8,24,45,.82)";
      const px=6,h=15,bx=x-tw/2-px,by=y-h+3,bw=tw+px*2;
      ctx.beginPath();
      if(ctx.roundRect)ctx.roundRect(bx,by,bw,h,5);else ctx.rect(bx,by,bw,h);
      ctx.fill();
      ctx.fillStyle=strong?"#ffffff":"#dcecf8";ctx.textAlign="center";ctx.textBaseline="alphabetic";
      ctx.fillText(t,x,y);
    };
    // a node shows its label when it's the focal/active node, or — in the
    // enlarged view — once zoom makes it big enough (larger nodes reveal first).
    // enlarged: label every node. mini: only label the node under the cursor.
    const labelFor=(n,active)=>enlarged||(active&&n.id===active.id);
    const draw=()=>{
      const s=st.scale,active=st.sel||st.hover;
      ctx.save();
      ctx.setTransform(st.dpr,0,0,st.dpr,0,0);
      ctx.clearRect(0,0,st.w,st.h);
      const nbr=new Set();
      if(active)links.forEach(l=>{const a=l.source.id,t=l.target.id;if(a===active.id)nbr.add(t);else if(t===active.id)nbr.add(a);});
      // world-space layer — nodes + links pan & zoom together
      ctx.save();
      ctx.translate(st.ox,st.oy);ctx.scale(s,s);
      links.forEach(l=>{
        const a=l.source,b=l.target;if(a.x==null||b.x==null)return;
        const on=active&&(a.id===active.id||b.id===active.id);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);
        ctx.lineWidth=Math.min(2.4,.4+l.w*.35)/s;
        ctx.strokeStyle=on?"rgba(13,142,207,.85)":active?"rgba(150,175,205,.05)":"rgba(150,175,205,.16)";
        ctx.stroke();
      });
      nodes.forEach(n=>{
        if(n.x==null)return;
        const c=rad(n),dim=active&&n.id!==active.id&&!nbr.has(n.id);
        const col=n.focal?"#ffcf2e":classColor(n.cls);
        ctx.globalAlpha=dim?.15:1;
        ctx.fillStyle=col;ctx.beginPath();ctx.arc(n.x,n.y,c,0,7);ctx.fill();
        ctx.lineWidth=((n.focal||(active&&n.id===active.id))?1.6:1.1)/s;ctx.strokeStyle="#fff";ctx.stroke();
        ctx.globalAlpha=1;
      });
      ctx.restore();
      // screen-space labels — constant size, never scale with zoom
      nodes.forEach(n=>{
        if(n.x==null||!labelFor(n,active))return;
        const dim=active&&n.id!==active.id&&!nbr.has(n.id);
        ctx.globalAlpha=dim?.2:1;
        lerpText(n,n.focal||(active&&n.id===active.id),n.x*s+st.ox,n.y*s+st.oy);
        ctx.globalAlpha=1;
      });
      ctx.restore();
    };
    st.draw=draw;
    const sim=forceSimulation(nodes)
      .velocityDecay(.5)                       // lighter damping = fluid, springy motion (nodes give and settle)
      // Focal↔rival distance is a SPRING, not a rigid orbit shell: each rival's
      // link rest-length encodes its rivalry score (bigger/stronger rival ⇒
      // bigger node ⇒ shorter spring ⇒ closer to the focal), but the spring can
      // stretch, sway and be dragged, so the web stays fluid and flexible.
      // Rival↔rival links stay weak so the ring spaces out without clumping.
      .force("link",forceLink(links).id(d=>d.id)
        .distance(l=>{const a=l.source,b=l.target,other=a.focal?b:(b.focal?a:null);
          if(other){const ratio=(other.corr||0)/(st.maxCorr||1);return (enlarged?126:47)+(1-ratio)*(enlarged?414:104);}
          return enlarged?270:91;})
        .strength(l=>(l.source.focal||l.target.focal)?.3:.04))
      .force("charge",forceManyBody().strength(enlarged?-270:-60).distanceMax(enlarged?1100:390))
      .force("collide",forceCollide(d=>rad(d)+(enlarged?10:7)).strength(.6))
      .force("x",forceX(()=>st.w/2).strength(enlarged?.04:.05))
      .force("y",forceY(()=>st.h/2).strength(enlarged?.04:.05))
      // soft walls — any node dragged/pushed outside the frame eases back in
      .force("bounds",a=>{const m=enlarged?22:12;nodes.forEach(n=>{if(n.fx!=null||n.x==null)return;
        if(n.x<m)n.vx+=(m-n.x)*a*0.6;else if(n.x>st.w-m)n.vx+=(st.w-m-n.x)*a*0.6;
        if(n.y<m)n.vy+=(m-n.y)*a*0.6;else if(n.y>st.h-m)n.vy+=(st.h-m-n.y)*a*0.6;});})
      .on("tick",draw);
    simRef.current=sim;

    const pos=ev=>{const r=cv.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};};
    const toWorld=p=>({x:(p.x-st.ox)/st.scale,y:(p.y-st.oy)/st.scale});
    const hit=p=>{const w=toWorld(p);let best=null,bd=1e9;nodes.forEach(n=>{if(n.x==null)return;const dx=n.x-w.x,dy=n.y-w.y,d=dx*dx+dy*dy,r=rad(n)+6/st.scale;if(d<=r*r&&d<bd){bd=d;best=n;}});return best;};
    const onDown=e=>{const p=pos(e);const n=hit(p);st.down={p,n,moved:false,t:Date.now()};
      if(n){const w=toWorld(p);st.drag=n;n.fx=w.x;n.fy=w.y;sim.alphaTarget(.3).restart();}
      else if(enlarged){st.pan={x:p.x,y:p.y,ox:st.ox,oy:st.oy};cv.style.cursor="grabbing";}};
    const onMove=e=>{
      const p=pos(e);
      if(st.drag){st.down&&(st.down.moved=true);const w=toWorld(p);st.drag.fx=w.x;st.drag.fy=w.y;return;}
      if(st.pan){st.down&&(st.down.moved=true);st.ox=st.pan.ox+(p.x-st.pan.x);st.oy=st.pan.oy+(p.y-st.pan.y);draw();return;}
      const n=hit(p);
      if(n!==st.hover){st.hover=n;cv.style.cursor=n?"pointer":(enlarged?"grab":"default");draw();}
    };
    const endDrag=()=>{if(st.drag){if(!st.drag.focal){st.drag.fx=null;st.drag.fy=null;}st.drag=null;sim.alphaTarget(0);sim.alpha(.55).restart();}st.pan=null;};
    const onUp=()=>{
      const d=st.down;endDrag();
      if(d&&d.n&&!d.moved){
        if(enlarged){const ns=st.sel&&st.sel.id===d.n.id?null:d.n;st.sel=ns;setSelNode(ns?{id:ns.id,name:ns.name,shared:ns.shared,cls:ns.cls,nat:ns.nat}:null);draw();}
        else if(onOpenRef.current){onOpenRef.current();}
      }
      else if(d&&!d.n&&!d.moved&&enlarged){st.sel=null;setSelNode(null);draw();} // click empty space → clear selection
      st.down=null;cv.style.cursor=enlarged?"grab":"default";
    };
    const onDbl=e=>{const n=hit(pos(e));if(n&&!n.focal&&onPickRef.current)onPickRef.current(n.name);};
    const onLeave=()=>{if(!st.drag&&!st.pan){st.hover=null;draw();}};
    const onWheel=e=>{if(!enlarged)return;e.preventDefault();const p=pos(e);
      const f=Math.exp(-e.deltaY*0.0016),ns=Math.min(6,Math.max(.6,st.scale*f));
      const wx=(p.x-st.ox)/st.scale,wy=(p.y-st.oy)/st.scale;
      st.scale=ns;st.ox=p.x-wx*ns;st.oy=p.y-wy*ns;draw();};
    cv.addEventListener("pointerdown",onDown);
    window.addEventListener("pointermove",onMove);
    window.addEventListener("pointerup",onUp);
    cv.addEventListener("dblclick",onDbl);
    cv.addEventListener("pointerleave",onLeave);
    if(enlarged)cv.addEventListener("wheel",onWheel,{passive:false});
    const onResize=()=>{sizeCanvas();sim.force("x",forceX(()=>st.w/2).strength(enlarged?.05:.055)).force("y",forceY(()=>st.h/2).strength(enlarged?.05:.055));if(focalNode){focalNode.fx=st.w/2;focalNode.fy=st.h/2;}sim.alpha(.3).restart();};
    window.addEventListener("resize",onResize);
    return()=>{sim.stop();cv.removeEventListener("pointerdown",onDown);window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerup",onUp);cv.removeEventListener("dblclick",onDbl);cv.removeEventListener("pointerleave",onLeave);cv.removeEventListener("wheel",onWheel);window.removeEventListener("resize",onResize);};
  },[graph,height,enlarged]);

  if(graph.nodes.length<=1)
    return(<div ref={wrapRef} style={{height,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",color:"#9fbdd9",fontSize:12,padding:"0 16px",lineHeight:1.5}}>Not enough shared competitions yet to build a web.</div>);
  // Colour key for the nodes: focal (gold) + every boat class present among the rivals
  // (dynamic — only classes actually on screen), coloured to match the node fills.
  const legend=(()=>{
    const out=[{id:"__focal",label:"This athlete",color:"#ffcf2e"}];
    const seen=new Set();
    graph.nodes.forEach(n=>{if(n.focal)return;const key=(n.cls||"").toLowerCase();if(seen.has(key))return;seen.add(key);
      out.push({id:key||"__none",label:n.cls?classLabel(n.cls):"Other",color:classColor(n.cls)});});
    return out;
  })();
  const canvasPane=(
    <div ref={wrapRef} style={{position:"relative",width:"100%",height}}>
      <canvas ref={canvasRef} style={{display:"block",width:"100%",height,touchAction:"none"}}/>
      {/* Foot bar: frameless class legend (enlarged only) sitting next to the caption */}
      <div style={{position:"absolute",bottom:4,left:0,right:0,display:"flex",justifyContent:"center",alignItems:"center",gap:12,flexWrap:"wrap",padding:"0 12px",fontSize:10,color:"#7fa0c0",pointerEvents:"none"}}>
        {enlarged&&legend.map(l=>(
          <span key={l.id} style={{display:"inline-flex",alignItems:"center",gap:5,fontWeight:600,color:"#cfe0f2"}}>
            <span style={{width:9,height:9,borderRadius:"50%",background:l.color,flex:"none",boxShadow:"0 0 0 1px rgba(255,255,255,.4)"}}/>{l.label}
          </span>
        ))}
        <span>{enlarged?`Top ${graph.count} rivals · click a node · scroll to zoom · drag to pan`:`Top 15 rivals · closer = stronger rival`}</span>
      </div>
    </div>
  );
  if(!enlarged)return canvasPane;
  // shared competitions grouped by host country (mirrors the globe's footprint list)
  const sidebar=!selNode
    ? <div style={{padding:"22px 18px",color:"#9fbdd9",fontSize:13,lineHeight:1.6}}>Click a node to see your head-to-head record against that athlete — overall, split by your partner, and across every shared competition. Click a competition to open its results.</div>
    : (<div style={{padding:"4px 0"}}>
        <div style={{padding:"14px 16px 12px",borderBottom:"1px solid rgba(120,160,210,.16)"}}>
          <h3 onClick={()=>onPickRef.current&&onPickRef.current(selNode.name)} title="Open profile"
            style={{margin:0,fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:19,color:"#eaf3fc",cursor:"pointer",
              display:"inline-flex",alignItems:"center",gap:9,lineHeight:1.15}}>
            {selNode.name}{selNode.nat&&<span style={{fontSize:19,lineHeight:1}}>{iocFlag(selNode.nat)}</span>}
          </h3>
          <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            {selNode.cls&&(()=>{const ng=nuggetFor(selNode.cls);return <span style={{background:ng.color,color:"#fff",borderRadius:980,padding:"2px 10px",fontWeight:700,fontSize:11.5,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>;})()}
            <span style={{color:"#9fc4ec",fontWeight:800,fontSize:13,fontVariantNumeric:"tabular-nums"}}>{sharedComps.length} shared competition{sharedComps.length===1?"":"s"}</span>
          </div>
        </div>
        {headToHead&&(headToHead.n>0?(
          <div style={{padding:"13px 16px 14px",borderBottom:"1px solid rgba(120,160,210,.16)"}}>
            <div style={{fontSize:10.5,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"#7fa0c0",marginBottom:4,display:"flex",alignItems:"center",gap:6}}>Head-to-head<InfoHint text="Your rivals are the athletes you've raced most in the selected years — ranked by how often you meet and how close your finishes are. Bigger, closer nodes race you more often. Events you sailed together in don't count toward this record."/></div>
            <div style={{fontSize:11,color:"#7fa0c0",lineHeight:1.4,marginBottom:8}}>How {name} ranked up against {selNode.name} in common competitions.</div>
            <div style={{display:"flex",alignItems:"baseline",gap:10,flexWrap:"wrap"}}>
              <span style={{fontWeight:800,fontSize:22,lineHeight:1,color:"#eaf3fc",fontVariantNumeric:"tabular-nums",fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Display',system-ui,sans-serif"}}>
                {headToHead.w}–{headToHead.l}{headToHead.t>0?`–${headToHead.t}`:""}
              </span>
              <span style={{fontSize:11.5,color:"#9fbdd9",lineHeight:1.35}}>
                {headToHead.avgGap===0?"dead even on average":`${name} finished ${Math.abs(headToHead.avgGap).toFixed(1)} place${Math.abs(headToHead.avgGap).toFixed(1)==="1.0"?"":"s"} ${headToHead.avgGap>0?"ahead":"behind"} on average`}
              </span>
            </div>
            {headToHead.partners.length>0&&(
              <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:5}}>
                {headToHead.partners.map(p=>(
                  <div key={p.name} style={{display:"flex",alignItems:"center",gap:8,fontSize:11.5,color:"#dcecf8"}}>
                    <span style={{fontWeight:700,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name==="Solo"?"Solo":`With ${p.name}`}</span>
                    <span style={{fontWeight:800,fontVariantNumeric:"tabular-nums",color:p.w>p.l?"#ffcf2e":"#dcecf8"}}>{p.w}–{p.l}{p.t>0?`–${p.t}`:""}</span>
                    <span style={{color:"#7fa0c0",fontVariantNumeric:"tabular-nums"}}>{p.n} comp{p.n===1?"":"s"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ):(
          <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(120,160,210,.16)",color:"#9fbdd9",fontSize:11.5,lineHeight:1.5}}>
            No ranked head-to-head results with this athlete yet.
          </div>
        ))}
        {/* shared competitions, newest first, each prefixed with the host-country flag */}
        {sharedComps.map((sc,i)=>{const ev=sc.ev;const ng=ev.cls?nuggetFor(ev.cls,ev.subclass):null;
          const iso=IOC_ISO[ev.country||""]||"";
          const won=!sc.sameBoat&&sc.focalRank!=null&&sc.rivalRank!=null&&sc.focalRank<sc.rivalRank;
          return(
          <div key={i} onClick={()=>onOpenEventRef.current&&onOpenEventRef.current(ev.id)} title="Open results"
            style={{margin:"7px 12px",padding:"10px 12px",borderRadius:10,cursor:"pointer",transition:"all .15s",
              background:"rgba(120,160,210,.08)",border:"1px solid rgba(120,160,210,.16)"}}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(90,150,215,.2)";e.currentTarget.style.borderColor="rgba(120,180,235,.5)";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(120,160,210,.08)";e.currentTarget.style.borderColor="rgba(120,160,210,.16)";}}>
            <div style={{fontWeight:700,color:"#eaf3fc",fontSize:13.5,marginBottom:3,display:"flex",alignItems:"center",gap:7}}>
              {iso&&<span style={{fontSize:15,lineHeight:1,flex:"none"}}>{isoFlag(iso)}</span>}
              <span style={{minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{ev.name}</span>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"4px 10px",fontSize:12,color:"#9fbdd9",alignItems:"center"}}>
              <span>{formatDate(ev.date)}</span>
              {ng&&<span style={{background:ng.color,color:"#fff",borderRadius:980,padding:"2px 9px",fontWeight:700,fontSize:11,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>}
              {sc.sameBoat
                ?<span style={{color:"#9fc4ec",fontWeight:700,fontSize:11.5}}>Sailed together{sc.focalRank!=null?` · ${sc.focalRank}`:""}</span>
                :<span style={{fontVariantNumeric:"tabular-nums",fontWeight:800,fontSize:11.5}}>
                  <span style={{color:won?"#ffcf2e":"#dcecf8"}}>{sc.focalRank!=null?sc.focalRank:"—"}</span>
                  <span style={{fontWeight:600,color:"#7fa0c0"}}>{" vs "}</span>
                  <span style={{color:"#dcecf8"}}>{sc.rivalRank!=null?sc.rivalRank:"—"}</span>
                </span>}
            </div>
          </div>);})}
        {sharedComps.length===0&&<div style={{padding:16,color:"#9fbdd9",fontSize:12}}>No shared competitions found.</div>}
      </div>);
  return(
    <div style={{display:"flex",width:"100%",height}}>
      <div style={{flex:"0 0 70%",height}}>{canvasPane}</div>
      <div style={{flex:"0 0 30%",height,overflowY:"auto",borderLeft:"1px solid rgba(120,160,210,.18)"}}>{sidebar}</div>
    </div>
  );
}

/* ── YearNuggets — small selectable per-year chips (replaces the range slider) ─
   Multi-select: click a year to isolate it, click more to add, "All" resets.
   Each nugget's ring is a conic gradient of the boat classes raced that year
   (e.g. 4 Optimist + 3 29er → 4/7 black, 3/7 red), so the chip carries its own
   class context. selYears=null means all years. Floats under the frames. */
export function YearNuggets({years,selYears,classByYear,onPick,onAll}){
  const sel=selYears&&selYears.length?new Set(selYears):null;   // null = all years
  const isAll=!sel;
  const ringFor=y=>{
    const m=classByYear&&classByYear.get(y);
    if(!m||!m.size)return "rgba(140,170,205,.6)";
    const total=[...m.values()].reduce((s,v)=>s+v,0);
    const segs=[...m.entries()].sort((a,b)=>b[1]-a[1]);
    let acc=0;const stops=[];
    segs.forEach(([cls,cnt])=>{const a=acc/total*360,b=(acc+cnt)/total*360;acc+=cnt;
      const col=cls==="__none"?"#8aa0bb":classColor(cls);stops.push(`${col} ${a}deg ${b}deg`);});
    return `conic-gradient(${stops.join(",")})`;
  };
  return(
    <div className="ynugs">
      <button type="button" className={"ynug-all"+(isAll?" on":"")} onClick={()=>onAll&&onAll()}>All</button>
      {years.map(y=>{
        const on=isAll||sel.has(y);
        return(
          <button type="button" key={y} className={"ynug"+(on?" on":"")} style={{background:ringFor(y)}} onClick={()=>onPick&&onPick(y)} title={String(y)}>
            <span className="ynug-in">{"'"+String(y).slice(2)}</span>
          </button>);
      })}
    </div>
  );
}

/* ── InfoHint — small "i" badge that reveals an explanatory popover on hover ── */
export function InfoHint({text}){
  const [open,setOpen]=React.useState(false);
  return(
    <span style={{position:"relative",display:"inline-flex",alignItems:"center",verticalAlign:"middle"}}
      onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
      <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:14,height:14,borderRadius:"50%",border:"1px solid rgba(127,160,192,.7)",color:"#9fbdd9",fontSize:9,fontWeight:700,fontStyle:"italic",fontFamily:"Georgia,serif",cursor:"help",flex:"none"}}>i</span>
      {open&&<span style={{position:"absolute",top:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",width:236,zIndex:30,
        background:"rgba(8,24,45,.97)",border:"1px solid rgba(120,160,210,.4)",borderRadius:9,padding:"9px 12px",
        fontSize:11,fontWeight:500,lineHeight:1.5,color:"#cfe0f2",boxShadow:"0 6px 22px rgba(0,0,0,.5)",pointerEvents:"none",
        fontStyle:"normal",fontFamily:"-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,sans-serif",letterSpacing:0,textTransform:"none",textAlign:"left",whiteSpace:"normal"}}>{text}</span>}
    </span>
  );
}

/* ── Skill-rating career progress ────────────────────────────────────────────
   Plots the focal athlete's skill rating over time — a DERIVED metric from the
   global rating engine (getAthleteRatings), never a re-read of results. Each
   dot is one rated competition; the line connects actual post-event ratings
   (p.r) with NO smoothing. Ranks shown in tooltips/sidebar are always READ from
   scoreEvent(ev).rows (PDF is ground truth); only the rating is computed.
   The shaded band is the rating's uncertainty (r±rd). It is drawn from actual
   points only — RD is NOT interpolated inside idle gaps, so the band visibly
   widens across a long lay-off (RD had grown by the next event), which is the
   honest signal, not an artefact. Year-nuggets pick which competitions show
   (the rating history itself is global and unaffected by selection). In the
   enlarged view a chip row overlays a rival's rating curve (dashed, no band)
   for direct comparison; clicking a dot opens a per-competition sidebar with
   the athlete's result and the rival cohort who sailed that same competition. */
const PROGRESS_RIVAL_HINT="Think of this as a skill score, like a chess rating. Every athlete starts at 1200. Beat athletes rated above you and your score climbs; finish behind athletes rated below you and it drops — winning against stronger fleets counts for more. The shaded area shows how confident the score is: it's wide when someone competes rarely, and tightens the more they compete. Placings come straight from the official results and are never altered. The dashed line past the last competition is a 1-year forecast: it continues the athlete's recent trajectory (fading toward flat, since momentum never lasts) inside a cone that widens the further out we guess.";
// Monotone cubic (Fritsch–Carlson) path through EXACTLY the given points — curves
// the segments without ever overshooting a neighbouring point (the honesty
// constraint). points=[[x,y],…] → "M…C…" string. <3 points → straight segments.
// Declared at module scope, above ProgressChart, so it's defined before use (no TDZ).
function monoPath(points){
  const n=points.length;
  if(n<2)return n?`M${points[0][0]},${points[0][1]}`:"";
  if(n<3)return `M${points.map(p=>`${p[0]},${p[1]}`).join("L")}`;
  const xs=points.map(p=>p[0]), ys=points.map(p=>p[1]);
  const dx=[],dy=[],slope=[];
  for(let i=0;i<n-1;i++){const h=xs[i+1]-xs[i];dx[i]=h;dy[i]=ys[i+1]-ys[i];slope[i]=h!==0?dy[i]/h:0;}
  const m=new Array(n);
  m[0]=slope[0]; m[n-1]=slope[n-2];
  for(let i=1;i<n-1;i++){
    if(slope[i-1]*slope[i]<=0)m[i]=0;
    else{const w1=2*dx[i]+dx[i-1], w2=dx[i]+2*dx[i-1];m[i]=(w1+w2)/(w1/slope[i-1]+w2/slope[i]);}
  }
  let d=`M${xs[0]},${ys[0]}`;
  for(let i=0;i<n-1;i++){
    const h=dx[i];
    const c1x=xs[i]+h/3,     c1y=ys[i]+m[i]*h/3;
    const c2x=xs[i+1]-h/3,   c2y=ys[i+1]-m[i+1]*h/3;
    d+=`C${c1x},${c1y} ${c2x},${c2y} ${xs[i+1]},${ys[i+1]}`;
  }
  return d;
}
export function ProgressChart({name,events,history,selYears=null,yrKey="",height=220,w=260,enlarged=false,onOpenEvent,onPick,onSelectionChange,deselectKey=0}){
  const [tip,setTip]=React.useState(null);       // {x,y,lines:[..]}  (inline hover)
  const [selPt,setSelPt]=React.useState(null);   // selected competition index (enlarged sidebar)
  const [rivalKey,setRivalKey]=React.useState(null); // active overlay rival canon key (enlarged only)
  const sel=React.useMemo(()=>yrKey?new Set(selYears):null,[yrKey]);  // null = all years
  // Focal rating history — filtered to the selected years, chronological already.
  const data=React.useMemo(()=>{
    const hist=getAthleteRatings(events).get(canonName(name))?.history||[];
    const pts=hist.filter(p=>!(sel&&!sel.has(+p.dk.slice(0,4))));
    return{pts};
  },[name,events,sel]);
  // Top-5 rival chips + top-15 cohort for the sidebar — memoised once (NOT per dot).
  const cohort5=React.useMemo(()=>enlarged?computeRivalCohort(name,events,5):null,[name,events,enlarged]);
  const cohort15=React.useMemo(()=>enlarged?computeRivalCohort(name,events,15):null,[name,events,enlarged]);
  const [showFc,setShowFc]=React.useState(true);   // 1-yr forecast overlay toggle (enlarged only)
  // 12-month projection — damped recent trend inside a widening uncertainty cone
  // (projectRating). Hidden when the year window excludes the athlete's latest
  // rated year: projecting forward off a filtered-away past would mislead.
  const proj=React.useMemo(()=>{
    if(!enlarged)return null;
    const hist=getAthleteRatings(events).get(canonName(name))?.history||[];
    if(!hist.length)return null;
    if(sel&&!sel.has(+hist[hist.length-1].dk.slice(0,4)))return null;
    return projectRating(hist,12);
  },[name,events,sel,enlarged]);
  // Active overlay rival's rating history, clipped to the same selected years.
  const overlayPts=React.useMemo(()=>{
    if(!rivalKey)return null;
    const h=getAthleteRatings(events).get(rivalKey)?.history||[];
    return h.filter(p=>!(sel&&!sel.has(+p.dk.slice(0,4))));
  },[rivalKey,events,sel]);
  React.useEffect(()=>{setSelPt(null);setRivalKey(null);},[yrKey,name]);  // clear selection + overlay when the window/athlete changes
  React.useEffect(()=>{if(deselectKey)setSelPt(null);},[deselectKey]);    // external deselect (popup header)
  React.useEffect(()=>{onSelectionChange&&onSelectionChange(selPt);},[selPt]); // report selection for the deselect button
  const S=w/260;                                             // scales the line / dot geometry with the chart width
  const glowId="pgGlow"+Math.round(w), softId="pgSoft"+Math.round(w);
  const AX=9.5;                                              // axis label size — fixed, matching the Rating/Competition legend
  // Title removed (popup chrome already titles the view); its old 24px allowance
  // is folded into plot breathing room rather than being reclaimed as blank space.
  const titleBlock=0, captionBlock=enlarged?26:0, legendBlock=enlarged?30:0, chipBlock=enlarged?30:0;
  const CH=Math.max(70,height-titleBlock-captionBlock-legendBlock-chipBlock-6);
  const M=enlarged?{l:52,r:20,t:16,b:28}:{l:40,r:12,t:10,b:18}; // mode-dependent gutters so nothing hugs the borders
  const plotW=w-M.l-M.r, plotH=CH-M.t-M.b;
  const showTip=(e,lines)=>{const host=e.currentTarget.ownerSVGElement.parentElement.getBoundingClientRect();const r=e.currentTarget.getBoundingClientRect();
    setTip({x:Math.min(Math.max(r.left-host.left+r.width/2,60),host.width-60),y:r.top-host.top,lines});};
  const fmtDelta=d=>`${d>=0?"+":"−"}${Math.abs(Math.round(d))}`;   // signed, rounded: +12 / −8 / +0
  const pts=data.pts;
  let body;
  if(pts.length<3){
    body=<div style={{height:CH,display:"flex",alignItems:"center",justifyContent:"center",textAlign:"center",color:"#7fa0c0",fontSize:12,padding:"0 18px"}}>Not enough rated competitions in this period yet to chart a skill rating.</div>;
  }else{
    // ── Y domain: [min(r−rd), max(r+rd)] over visible pts (+ overlay r's when
    // active), padded 5%, then rounded OUTWARD to a multiple of 50.
    // ── X window first (year gridlines + labels come from it, and the overlay
    // is CLIPPED to it — off-window rival points are dropped, never clamped
    // into a false pile-up at the chart edge, and never stretch the y-domain).
    const yearsSel=sel?[...sel].sort((a,b)=>a-b):null;
    const y0=yearsSel?yearsSel[0]:+pts[0].dk.slice(0,4);
    const y1=yearsSel?yearsSel[yearsSel.length-1]:+pts[pts.length-1].dk.slice(0,4);
    const tsOf=p=>Date.UTC(+p.dk.slice(0,4),+p.dk.slice(4,6)-1,+p.dk.slice(6,8));
    // 1-yr forecast (enlarged + toggled on): the x-window stretches 12 months past
    // the last rated event so the cone has room; addM is a UTC-safe month adder.
    const fc=showFc&&proj?proj:null;
    const addM=(dk,m)=>{const y=+dk.slice(0,4),mo=+dk.slice(4,6)-1+m;return Date.UTC(y+Math.floor(mo/12),((mo%12)+12)%12,+dk.slice(6,8));};
    const fcEndTs=fc?addM(fc.base.dk,12):0;
    const t0=Date.UTC(y0,0,1), t1=Math.max(Date.UTC(y1,11,31),fcEndTs), span=Math.max(1,t1-t0);
    const oShow=overlayPts?overlayPts.filter(p=>{const t=tsOf(p);return t>=t0&&t<=t1;}):null;
    let lo=Infinity, hi=-Infinity;
    pts.forEach(p=>{lo=Math.min(lo,p.r-p.rd);hi=Math.max(hi,p.r+p.rd);});
    if(oShow)oShow.forEach(p=>{lo=Math.min(lo,p.r);hi=Math.max(hi,p.r);});
    if(fc)fc.points.forEach(p=>{lo=Math.min(lo,p.lo);hi=Math.max(hi,p.hi);});
    const padAmt=Math.max(10,(hi-lo)*0.05);
    lo=Math.floor((lo-padAmt)/50)*50; hi=Math.ceil((hi+padAmt)/50)*50;
    if(hi<=lo)hi=lo+50;
    const ySpan=hi-lo;
    const yOf=r=>M.t+plotH*(1-(r-lo)/ySpan);
    // 3–4 round tick values: step ≈ span/3 snapped to 50/100/200 (…), floor to a
    // multiple of the step so labels land on round numbers within the domain.
    const rawStep=ySpan/4;
    const nice=[50,100,150,200,250,500,1000];
    const step=nice.find(s=>s>=rawStep)||Math.ceil(rawStep/100)*100;
    const ticks=[]; for(let v=Math.ceil(lo/step)*step; v<=hi+0.5; v+=step)ticks.push(v);
    const xForTs=ts=>M.l+plotW*(ts-t0)/span;
    const xOf=p=>Math.min(Math.max(xForTs(tsOf(p)),M.l),w-M.r);
    const yEnd=fc?Math.max(y1,new Date(fcEndTs).getUTCFullYear()):y1;   // last gridline year incl. forecast
    const nY=yEnd-y0+1, every=nY>12?3:nY>7?2:1;
    // Rating line + uncertainty band (band = actual points only, never interpolated in gaps).
    // Monotone-cubic curves pass EXACTLY through every point — no value smoothing.
    const lineXY=pts.map(p=>[xOf(p),yOf(p.r)]);
    const linePath=monoPath(lineXY);
    // Band: upper edge L→R, then lower edge R→L, one closed path. monoPath emits an
    // "M…" prefix; strip the second one and prepend an "L" so both edges join cleanly.
    const bandUpPath=monoPath(pts.map(p=>[xOf(p),yOf(p.r+p.rd)]));
    const bandLoPath=monoPath(pts.map(p=>[xOf(p),yOf(p.r-p.rd)]).reverse());
    const bandPath=`${bandUpPath}L${bandLoPath.slice(1)}Z`;
    const overlayPath=oShow&&oShow.length?monoPath(oShow.map(p=>[xOf(p),yOf(p.r)])):null;
    // Forecast geometry: dashed damped-trend line inside its widening cone, both
    // ANCHORED at the last rated event (the cone opens from today's band edge, so
    // history and forecast join without a jump). Same monoPath, same honesty rules.
    let fcLinePath=null,fcConePath=null,fcEnd=null,fcAnchorX=0;
    if(fc){
      const aP=pts[pts.length-1];
      const fnodes=[{ts:tsOf(aP),r:aP.r,lo:aP.r-aP.rd,hi:aP.r+aP.rd},
        ...fc.points.map(p=>({ts:addM(fc.base.dk,p.m),r:p.r,lo:p.lo,hi:p.hi}))];
      const xF=n=>Math.min(Math.max(xForTs(n.ts),M.l),w-M.r);
      fcAnchorX=xF(fnodes[0]);
      fcLinePath=monoPath(fnodes.map(n=>[xF(n),yOf(n.r)]));
      const fcUp=monoPath(fnodes.map(n=>[xF(n),yOf(n.hi)]));
      const fcLo=monoPath(fnodes.map(n=>[xF(n),yOf(n.lo)]).reverse());
      fcConePath=`${fcUp}L${fcLo.slice(1)}Z`;
      fcEnd=fnodes[fnodes.length-1];
    }
    body=(
      <svg width="100%" height={CH} viewBox={`0 0 ${w} ${CH}`} style={{display:"block"}}>
        <defs>
          <filter id={glowId} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation={1.8*S} result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          {/* soft blur (no source merge) → the moving contrail reads as a diffuse glow */}
          <filter id={softId} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation={3.4*S}/>
          </filter>
        </defs>
        {/* faint horizontal gridlines at each y tick, under everything */}
        {ticks.map(v=>
          <line key={"g"+v} x1={M.l} y1={yOf(v)} x2={w-M.r} y2={yOf(v)} stroke="rgba(220,236,248,.06)" strokeWidth={S}/>)}
        {/* y axis: skill-rating ticks at round values */}
        <text transform={`rotate(-90 ${enlarged?14:10} ${M.t+plotH/2})`} x={enlarged?14:10} y={M.t+plotH/2} textAnchor="middle" fontSize={AX} fill="#7fa0c0">Skill rating</text>
        {ticks.map(v=>
          <text key={v} x={M.l-4} y={yOf(v)+3} textAnchor="end" fontSize={AX} fill="#7fa0c0">{v}</text>)}
        <line x1={M.l} y1={M.t+plotH} x2={w-M.r} y2={M.t+plotH} stroke="rgba(220,236,248,.18)" strokeWidth={S}/>
        {/* start·1200 anchor: dashed reference line only when 1200 sits in-domain */}
        {1200>=lo&&1200<=hi&&(<g>
          <line x1={M.l} y1={yOf(1200)} x2={w-M.r} y2={yOf(1200)} stroke="rgba(220,236,248,.25)" strokeWidth={S} strokeDasharray="3 3"/>
          <text x={w-M.r} y={yOf(1200)-3} textAnchor="end" fontSize={8.5} fill="#7fa0c0">start · 1200</text>
        </g>)}
        {/* x axis: a gridline + label per year (thinned if the window is wide) */}
        {Array.from({length:nY},(_,i)=>y0+i).map((Y,idx)=>{
          const gx=xForTs(Date.UTC(Y,0,1));
          const cx=Math.min(Math.max(xForTs(Date.UTC(Y,5,15)),M.l),w-M.r);
          const show=(idx%every===0)||Y===yEnd;
          return(<g key={Y}>
            {Y>y0&&<line x1={gx} y1={M.t} x2={gx} y2={M.t+plotH} stroke="rgba(220,236,248,.07)" strokeWidth={S}/>}
            {show&&<text x={cx} y={CH-(enlarged?8:4)} textAnchor="middle" fontSize={AX} fill="#7fa0c0">{Y}</text>}
          </g>);
        })}
        {/* uncertainty band, under everything */}
        <path d={bandPath} fill="rgba(52,169,230,.13)" stroke="none"/>
        {/* 1-yr forecast: widening cone + dashed damped-trend line, anchored at the
            last rated event. Lighter than history so predicted never reads as fact. */}
        {fcConePath&&<path d={fcConePath} fill="rgba(52,169,230,.07)" stroke="rgba(111,196,239,.30)" strokeWidth={S} strokeDasharray={`${3*S} ${3*S}`}/>}
        {fcLinePath&&<path d={fcLinePath} fill="none" stroke="#6fc4ef" strokeWidth={1.8*S} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${6*S} ${5*S}`} opacity=".9"/>}
        {fcEnd&&(<g>
          <line x1={fcAnchorX} y1={M.t} x2={fcAnchorX} y2={M.t+plotH} stroke="rgba(220,236,248,.14)" strokeWidth={S} strokeDasharray="2 4"/>
          <text x={fcAnchorX+4} y={M.t+9} fontSize={8.5} fill="#7fa0c0">forecast →</text>
          <text x={Math.min(Math.max(xForTs(fcEnd.ts),M.l),w-M.r)-4} y={yOf(fcEnd.r)-8} textAnchor="end" fontSize={9.5} fontWeight="700" fill="#8fd0f5">in 1 yr ≈ {Math.round(fcEnd.r)} ±{Math.round((fcEnd.hi-fcEnd.lo)/2)}</text>
        </g>)}
        {/* rival overlay: dashed muted line, no band, no dots, no glow */}
        {overlayPath&&<path d={overlayPath} fill="none" stroke="#8fa8c4" strokeWidth={1.6*S} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={`${5*S} ${4*S}`}/>}
        {/* the rating line: always shown, with a slow soft glow gliding left → right */}
        <path d={linePath} fill="none" stroke="#34a9e6" strokeWidth={2.1*S} strokeLinejoin="round" strokeLinecap="round" filter={`url(#${glowId})`}/>
        <path className="pg-pulse" pathLength="1" d={linePath} fill="none" stroke="#a9e0ff" strokeWidth={3.4*S} strokeLinejoin="round" strokeLinecap="round" filter={`url(#${softId})`}/>
        {/* per-competition dots ringed in their boat-class colour */}
        {pts.map((p,i)=>{const on=enlarged&&selPt===i;const cc=classColor(p.cls);return(
          <circle key={i} cx={xOf(p)} cy={yOf(p.r)} r={(on?4.6:2.4)*S} fill={on?cc:"#fff"} stroke={on?"#fff":cc} strokeWidth={(on?2:1.4)*S} style={{cursor:"pointer"}}
            onClick={enlarged?()=>setSelPt(i===selPt?null:i):undefined}
            onMouseEnter={enlarged?undefined:e=>showTip(e,[p.evName,formatDate(p.date),`Rating ${Math.round(p.r)} (${fmtDelta(p.delta)})`,`${ordinalOf(p.rank)} of ${p.fleet} overall`])}
            onMouseLeave={enlarged?undefined:()=>setTip(null)}/>);})}
      </svg>);
  }
  const chartCol=(
    <div style={{position:"relative",display:"flex",flexDirection:"column",width:"100%",height,paddingBottom:enlarged?6:0,boxSizing:"border-box"}}>
      {enlarged&&<div style={{flex:"none",display:"flex",justifyContent:"center",alignItems:"center",gap:6,color:"#9fbdd9",fontSize:13,lineHeight:1.35,margin:"3px 12px 6px"}}>
        <span>How {name}'s skill rating has developed over time.</span>
        <InfoHint text={PROGRESS_RIVAL_HINT}/>
        {proj&&<button onClick={()=>setShowFc(v=>!v)} title="Toggle the 1-year rating projection"
          style={{border:"1px solid "+(showFc?"var(--accent)":"rgba(120,160,210,.32)"),background:showFc?"rgba(13,142,207,.22)":"rgba(120,160,210,.1)",
            color:showFc?"#cfe9fa":"#9fbdd9",borderRadius:980,padding:"2px 10px",fontSize:11,fontWeight:700,cursor:"pointer",lineHeight:1.3,marginLeft:4}}>
          1-yr forecast</button>}
      </div>}
      {enlarged&&cohort5&&cohort5.rivals.length>0&&(
        <div style={{flex:"none",display:"flex",alignItems:"center",gap:8,justifyContent:"center",flexWrap:"wrap",margin:"0 12px 6px"}}>
          <span style={{fontSize:11,fontWeight:700,color:"#7fa0c0",letterSpacing:".02em"}}>Compare with rival:</span>
          {cohort5.rivals.map(r=>{const active=rivalKey===r.key;const cc=classColor(modeOfCountMap(cohort5.clsCount.get(r.key)));return(
            <button key={r.key} onClick={()=>setRivalKey(active?null:r.key)} title={`Overlay ${r.name}'s rating line`}
              style={{display:"inline-flex",alignItems:"center",gap:6,border:"1px solid "+(active?"var(--accent)":"rgba(120,160,210,.32)"),background:active?"var(--accent)":"rgba(120,160,210,.1)",
                color:active?"#fff":"#cfe0f2",borderRadius:980,padding:"3px 11px",fontSize:11.5,fontWeight:700,cursor:"pointer",lineHeight:1.2}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:cc,flex:"none"}}/>{r.name}</button>);})}
        </div>)}
      {body}
      {enlarged&&<div style={{flex:"none",display:"flex",gap:16,justifyContent:"center",alignItems:"center",marginTop:10,flexWrap:"wrap"}}>
        <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,color:"#cfe0f2",fontWeight:600}}><span style={{width:17,height:3,borderRadius:2,background:"#34a9e6",boxShadow:"0 0 5px #34a9e6"}}/>Rating</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,color:"#cfe0f2",fontWeight:600}}><span style={{width:9,height:9,borderRadius:"50%",background:"#fff",boxShadow:"0 0 0 1.5px var(--accent)"}}/>Competition</span>
        <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,color:"#cfe0f2",fontWeight:600}}><span style={{width:17,height:9,borderRadius:3,background:"rgba(52,169,230,.25)"}}/>Uncertainty</span>
        {proj&&showFc&&<span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,color:"#cfe0f2",fontWeight:600}}><span style={{width:17,height:0,borderTop:"2px dashed #6fc4ef"}}/>1-yr forecast</span>}
      </div>}
      {tip&&!enlarged&&(
        <div style={{position:"absolute",left:tip.x,top:Math.max(titleBlock,tip.y),transform:"translate(-50%,-100%)",pointerEvents:"none",zIndex:5,
          background:"rgba(8,24,45,.94)",border:"1px solid rgba(120,160,210,.35)",borderRadius:8,padding:"6px 9px",maxWidth:200,boxShadow:"0 4px 14px rgba(0,0,0,.4)"}}>
          {tip.lines.map((l,i)=><div key={i} style={{fontSize:i?9.5:10,fontWeight:i?500:700,color:i?"#a9c4de":"#fff",whiteSpace:i?"nowrap":"normal"}}>{l}</div>)}
        </div>)}
    </div>);
  if(!enlarged)return chartCol;
  // enlarged: chart + per-competition sidebar (click a dot to populate)
  const sp=selPt!=null?pts[selPt]:null;
  const sidebar=!sp
    ? <div style={{padding:"22px 18px",color:"#9fbdd9",fontSize:13,lineHeight:1.6}}>Click a point on the line to see this competition's result — the athlete's rating after it and the rivals who sailed it.</div>
    : (()=>{
        // Build the rank lookup from the SELECTED event only (scoreEvent, PDF-truth,
        // tie-aware best rank per canon). Partners (helm/crew of the focal's row)
        // are flagged same-boat exactly as the old sidebar did.
        const focalKey=canonName(name);
        const ev=(events||[]).find(e=>e.id===sp.evId);
        const rankOf=new Map();          // canon -> best (lowest) rank in this event
        const mates=new Set();
        if(ev){try{
          scoreEvent(ev).rows.forEach(r=>{
            const hk=canonName(r.helm),ck=canonName(r.crew);
            if(hk===focalKey||ck===focalKey){const other=hk===focalKey?ck:hk;if(other&&other!==focalKey)mates.add(other);}
            if(r.rank>=1)[hk,ck].forEach(k=>{if(k){const prev=rankOf.get(k);if(prev===undefined||r.rank<prev)rankOf.set(k,r.rank);}});
          });
        }catch{/* unscoreable — leave rankOf empty */}}
        // Cohort members (top-15) who sailed THIS competition, with their placement.
        const trues=[]; const partners=[];
        (cohort15?cohort15.rivals:[]).forEach(r=>{
          const rk=rankOf.get(r.key); if(rk===undefined)return;    // didn't sail this comp
          if(mates.has(r.key))partners.push({key:r.key,name:r.name,rank:rk});
          else trues.push({key:r.key,name:r.name,rank:rk});
        });
        trues.sort((a,b)=>a.rank-b.rank);
        const idx=trues.findIndex(r=>r.rank>sp.rank);
        const ordered=idx<0?[...trues,{focal:true}]:[...trues.slice(0,idx),{focal:true},...trues.slice(idx)];
        const rowStyle=hl=>({margin:"4px 12px",padding:"8px 12px",borderRadius:9,display:"flex",alignItems:"center",gap:10,
          background:hl?"rgba(13,142,207,.2)":"rgba(120,160,210,.08)",border:"1px solid "+(hl?"rgba(90,180,235,.6)":"rgba(120,160,210,.16)")});
        const rankBadge=(n,hl)=><span style={{flex:"none",width:24,textAlign:"right",fontWeight:800,fontSize:12.5,fontVariantNumeric:"tabular-nums",color:hl?"#eaf3fc":"#9fc4ec"}}>{n}</span>;
        const nameCell=(nm,bold)=><span style={{flex:1,minWidth:0,fontWeight:bold?800:700,fontSize:12.5,color:"#eaf3fc",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{nm}</span>;
        const rows=ordered.map(r=> r.focal
          ? <div key="__you" style={rowStyle(true)}>{rankBadge(sp.rank,true)}{nameCell(name,true)}<span style={{fontSize:10,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:"#7fd0ff",flex:"none"}}>You</span></div>
          : <div key={r.key} onClick={()=>onPick&&onPick(r.name)} title={onPick?"Open profile":undefined} style={{...rowStyle(false),cursor:onPick?"pointer":"default"}}>{rankBadge(r.rank,false)}{nameCell(r.name)}<span style={{fontSize:10.5,fontWeight:700,color:sp.rank<r.rank?"#ffcf2e":sp.rank===r.rank?"#9fbdd9":"#c98b8b",flex:"none"}}>{sp.rank<r.rank?"beat":sp.rank===r.rank?"tie":"lost"}</span></div>);
        partners.forEach(r=>rows.push(
          <div key={r.key} onClick={()=>onPick&&onPick(r.name)} title={onPick?"Open profile":undefined} style={{...rowStyle(false),cursor:onPick?"pointer":"default"}}>{rankBadge(r.rank,false)}{nameCell(r.name)}<span style={{fontSize:10.5,fontWeight:700,color:"#9fc4ec",flex:"none"}}>same boat</span></div>));
        return(<div style={{padding:"4px 0"}}>
          <div style={{padding:"14px 16px 12px",borderBottom:"1px solid rgba(120,160,210,.16)"}}>
            <div onClick={()=>onOpenEvent&&onOpenEvent(sp.evId)} title={onOpenEvent?"Open results":undefined} style={{fontWeight:700,fontSize:15.5,color:"#eaf3fc",cursor:onOpenEvent?"pointer":"default",lineHeight:1.2}}>{sp.evName}</div>
            <div style={{marginTop:7,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
              {sp.cls&&(()=>{const ng=nuggetFor(sp.cls,sp.subclass);return <span style={{background:ng.color,color:"#fff",borderRadius:980,padding:"2px 10px",fontWeight:700,fontSize:11.5,fontFamily:"'Barlow',sans-serif"}}>{ng.label}</span>;})()}
              <span style={{color:"#9fbdd9",fontSize:12}}>{formatDate(sp.date)}</span>
            </div>
            <div style={{marginTop:8,fontSize:12,color:"#cfe0f2"}}>Rating <b>{Math.round(sp.r)}</b> ({fmtDelta(sp.delta)})</div>
            <div style={{marginTop:4,fontSize:12,color:"#cfe0f2"}}>Your result: <b>{ordinalOf(sp.rank)}</b> of <b>{sp.fleet}</b></div>
          </div>
          <div style={{padding:"11px 16px 4px",fontSize:10.5,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"#7fa0c0"}}>Rivals here</div>
          {rows}
        </div>);
      })();
  return(
    <div style={{display:"flex",width:"100%",height}}>
      <div style={{flex:"0 0 64%",height}}>{chartCol}</div>
      <div style={{flex:"0 0 36%",height,overflowY:"auto",borderLeft:"1px solid rgba(120,160,210,.18)"}}>{sidebar}</div>
    </div>
  );
}
