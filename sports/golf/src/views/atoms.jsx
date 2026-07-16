/* Presentational atoms for sailing — small leaf components (flags, badges,
   nuggets, pickers, background) shared across the views. Reorg step 4: first
   views/ module, mirroring sports/golf/src/views/. Verbatim from App.jsx. */

import React, { useState, useEffect, useRef } from "react";
import { AlertCircle, Trash2, CheckCircle, BadgeCheck, Loader2 } from "lucide-react";
import { iocFlag } from "../util/flag.js";
import { classColor, classLabel } from "../util/class.js";
import { DIV_COLOR, DIV_LABEL, GENDER_COLOR, divTokens, genderCatOf } from "../util/gender.js";
import { resolvedEntryGender } from "../data/athletes.js";

/* ── Shared display helpers ───────────────────────────────────────────────
   CountryTag: flag + code shown together (global standard).
   VerifyBadge: blue badge if verified, grey badge if not — icon only.        */
export function CountryTag({code,size=14,style={}}){
  if(!code) return null;
  const fl=iocFlag(code);
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,...style}}>{fl&&<span style={{fontSize:size+2,lineHeight:1}}>{fl}</span>}{code}</span>;
}
/* ── ConfirmModal: in-app replacement for window.confirm (liquid-glass) ──────
   Render when `state` is set; state = {title?, message, confirmLabel?, danger?, onConfirm}. */
export function ConfirmModal({state,onClose}){
  // Show a spinner on the confirm button while its (often async, DB-writing)
  // onConfirm runs, so the user gets feedback instead of a dead-looking button.
  const [busy,setBusy]=useState(false);
  if(!state) return null;
  const {title="Are you sure?",message,confirmLabel="Confirm",danger=true,onConfirm}=state;
  const doConfirm=async()=>{
    if(busy) return;
    setBusy(true);
    try{ await onConfirm?.(); }
    catch(err){ console.error("ConfirmModal onConfirm failed",err); }
    finally{ setBusy(false); onClose(); }
  };
  return(
    <div className="ov" onClick={busy?undefined:onClose} style={{zIndex:120}}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400,overflow:"visible"}}>
        <div className="mhead" style={{padding:"16px 22px"}}>
          <AlertCircle size={18}/><h3 style={{flex:1}}>{title}</h3>
        </div>
        <div style={{padding:"18px 22px 22px"}}>
          <p style={{margin:"0 0 18px",fontSize:14,lineHeight:1.5,color:"var(--ink)",whiteSpace:"pre-line"}}>{message}</p>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button className="btn ghost" style={{fontSize:13}} disabled={busy} onClick={onClose}>Cancel</button>
            <button className="btn" style={{fontSize:13,background:danger?"#e74c3c":"var(--accent)",color:"#fff",
              boxShadow:"inset 0 1px 0 rgba(255,255,255,.3),0 1px 3px rgba(0,0,0,.18)"}}
              disabled={busy} onClick={doConfirm}>{busy?<Loader2 size={14} className="spin"/>:(danger?<Trash2 size={14}/>:<CheckCircle size={14}/>)}{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
export function VerifyBadge({verified,size=14,title}){
  // verified -> blue, unverified -> grey. Badge icon only.
  const col=verified?"#0d8ecf":"#9fb2c8";
  return <BadgeCheck size={size} color={col} aria-label={verified?"Verified":"Unverified"}
    title={title||(verified?"Verified athlete":"Unverified")} style={{flex:"none"}}/>;
}

// Toggleable gender + age-category selector. value = "M U17" / "F Jr" style
// string; onChange(string). Rules: at most one gender (M/F/Mix); one age token
// alongside it. The age token is whatever the entry actually carries (U17, U18,
// Jr…) — NOT hardcoded to Jr — so a parsed U17 boat shows "U17" here, not "Jr".
export function DivisionToggle({value,onChange,size="sm",noMix=false}){
  const parts=String(value||"").trim().split(/\s+/).filter(Boolean);
  const isGender=t=>/^(m|f|mix)$/i.test(t);
  let gender=parts.find(isGender)||null;
  if(gender) gender=/mix/i.test(gender)?"Mix":gender.toUpperCase();
  if(noMix&&gender==="Mix") gender=null; // single-handed: Mix not applicable
  const cat=parts.find(t=>!isGender(t))||null;   // U17 / U18 / Jr / Mst …
  const set=(g,c)=>onChange([g,c].filter(Boolean).join(" "));
  const chip=(key,label,on,col,onClick,title)=>
    <button key={key} type="button" title={title}
      onClick={e=>{e.stopPropagation();onClick();}}
      style={{border:"1px solid "+(on?col:"var(--line)"),background:on?col:"transparent",color:on?"#fff":"var(--mut)",
        borderRadius:6,fontSize:size==="sm"?10:11.5,fontWeight:700,fontFamily:"'Barlow',sans-serif",
        padding:size==="sm"?"2px 6px":"3px 8px",cursor:"pointer",lineHeight:1.3,transition:".12s"}}>{label}</button>;
  const gBtn=key=>chip(key,key,gender===key,DIV_COLOR[key],()=>set(gender===key?null:key,cat),DIV_LABEL[key]);
  // Age chip: shows the real category token (falls back to Jr when none is set,
  // as the default add-on). Non-Jr bands (U17…) reuse the Jr colour.
  const ageBtn=chip("age",cat||"Jr",!!cat,DIV_COLOR[cat]||DIV_COLOR.Jr,
    ()=>set(gender,cat?null:"Jr"),cat?("Age category: "+cat):"Junior");
  return <div style={{display:"inline-flex",gap:4,flexWrap:"wrap"}}>
    {gBtn("M")}{gBtn("F")}{!noMix&&gBtn("Mix")}{ageBtn}</div>;
}

// Small read-only division nugget(s) for the results page.
export function DivNugget({div}){
  const tokens=divTokens(div);
  if(!tokens.length) return null;
  return <span style={{display:"inline-flex",gap:3}}>
    {tokens.map(t=><span key={t} style={{background:DIV_COLOR[t],color:"#fff",borderRadius:4,fontSize:9.5,fontWeight:700,
      fontFamily:"'Barlow',sans-serif",padding:"1px 5px",letterSpacing:".02em"}} title={DIV_LABEL[t]}>{t}</span>)}
  </span>;
}

// Division nugget dropdown for manual import (looks like the division nuggets used elsewhere).
export function ClassPicker({value,onChange}){
  const opts=[["mens","Men's"],["womens","Women's"],["amateur","Amateur"],["senior","Senior"]];
  return <div style={{display:"inline-flex",gap:6,flexWrap:"wrap"}}>
    {opts.map(([id,label])=>{
      const on=value===id;
      return <button key={id} type="button" onClick={()=>onChange(id)}
        style={{border:"1px solid "+(on?classColor(id):"var(--line)"),background:on?classColor(id):"transparent",
          color:on?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Barlow',sans-serif",
          padding:"5px 11px",cursor:"pointer",transition:".12s"}}>{label}</button>;
    })}
  </div>;
}

// Host-card class pills. Shows the classes (main OR custom) a host has events in,
// resolved via classLabel/classColor. Caps the row at 4 pills; any extras collapse
// into a "+N" pill that reveals them in a small popover (keeps the row one line).
export function HostClassPills({classIds}){
  const[open,setOpen]=React.useState(false);
  const ref=React.useRef();
  React.useEffect(()=>{
    const fn=e=>{if(ref.current&&!ref.current.contains(e.target))setOpen(false);};
    document.addEventListener("mousedown",fn);return()=>document.removeEventListener("mousedown",fn);
  },[]);
  const ids=classIds||[];
  const MAX=3;
  const shown=ids.slice(0,MAX);
  const extra=ids.slice(MAX);
  // When there are extras, fan the pills into an overlapping stack so they stay on
  // one row in line with the host pill: most-popular (first) sits at the back/bottom,
  // each later pill overlaps the one before it, and the "+N" pill rides on top at the
  // right. DOM order = paint order, so the +N lands in front and the back pill's left
  // edge still peeks out. A paper-coloured ring separates the overlapping pills.
  const stacked=extra.length>0;
  const OVER=-12; // overlap in px between adjacent pills when stacked
  // Separator ring uses the card's own background token (--mat-reg), so it reads as
  // the thumbnail surface showing between pills and shifts with the background colour.
  const ring={boxShadow:"0 0 0 2px var(--mat-reg),inset 0 1px 0 rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.18)"};
  return(
    <div ref={ref} style={{display:"flex",gap:stacked?0:4,alignItems:"center",flexWrap:"nowrap",justifyContent:"flex-end",position:"relative"}}>
      {shown.map((id,i)=><span key={id} className="cls"
        style={{background:classColor(id),...(stacked?{marginLeft:i===0?0:OVER,...ring}:{})}}>{classLabel(id)}</span>)}
      {extra.length>0&&(<>
        <span onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} className="cls"
          title="Show more classes" style={{background:"#2c3444",cursor:"pointer",marginLeft:OVER,...ring}}>+{extra.length}</span>
        {open&&(
          <div onClick={e=>e.stopPropagation()}
            style={{position:"absolute",top:"calc(100% + 6px)",right:0,zIndex:90,background:"var(--card)",border:"1px solid var(--line)",borderRadius:10,boxShadow:"0 12px 30px -10px rgba(0,0,0,.25)",padding:8,display:"flex",flexWrap:"wrap",gap:4,maxWidth:220,justifyContent:"flex-end"}}>
            {extra.map(id=><span key={id} className="cls" style={{background:classColor(id)}}>{classLabel(id)}</span>)}
          </div>
        )}
      </>)}
    </div>
  );
}

// Interactive background: soft navy balls drifting & bouncing, pushed away by the cursor.
// Navy family matched to the header; low-res + blurred = smooth, cheap, muted.
export function LiquidBackground(){
  const ref=React.useRef(null);
  const mouse=React.useRef({x:-9999,y:-9999,active:false});
  useEffect(()=>{
    const canvas=ref.current; if(!canvas) return;
    const ctx=canvas.getContext("2d"); if(!ctx) return;
    // Accessibility + battery: skip the animation entirely under reduced-motion,
    // and run fewer balls on phones.
    if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const BALL_COUNT=window.innerWidth<=700?8:13;
    const SCALE=0.24; let W=1,H=1,raf=0;
    const balls=[];
    // Navy header family (dark -> mid blue).
    const palette=[[19,49,78],[31,78,128],[15,40,70],[40,92,150],[23,58,98],[28,70,120]];
    function resize(){
      W=Math.max(1,Math.round(window.innerWidth*SCALE));
      H=Math.max(1,Math.round(window.innerHeight*SCALE));
      canvas.width=W; canvas.height=H;
      if(balls.length===0){
        const base=Math.max(W,H);
        for(let i=0;i<BALL_COUNT;i++) balls.push({x:Math.random()*W,y:Math.random()*H,
          vx:(Math.random()-0.5)*W*0.0018,vy:(Math.random()-0.5)*H*0.0018,
          r:base*(0.22+Math.random()*0.24),c:i%palette.length});
      }
    }
    resize();
    const onResize=()=>resize();
    const onMove=e=>{const cx=("touches"in e&&e.touches[0])?e.touches[0].clientX:e.clientX;const cy=("touches"in e&&e.touches[0])?e.touches[0].clientY:e.clientY;mouse.current.x=cx*SCALE;mouse.current.y=cy*SCALE;mouse.current.active=true;};
    const onLeave=()=>{mouse.current.active=false;};
    window.addEventListener("resize",onResize);
    window.addEventListener("pointermove",onMove,{passive:true});
    window.addEventListener("pointerleave",onLeave);
    function frame(){
      ctx.clearRect(0,0,W,H); ctx.globalCompositeOperation="lighter";
      const mx=mouse.current.x,my=mouse.current.y,R=Math.max(W,H)*0.32;
      for(const b of balls){
        // mouse repulsion (push the balls away)
        if(mouse.current.active){
          const dx=b.x-mx,dy=b.y-my,d2=dx*dx+dy*dy;
          if(d2<R*R){const d=Math.sqrt(d2)||1,f=(1-d/R);b.vx+=(dx/d)*f*0.6;b.vy+=(dy/d)*f*0.6;}
        }
        b.x+=b.vx; b.y+=b.vy; b.vx*=0.985; b.vy*=0.985;
        // gentle drift floor + bounce off edges
        const sp=Math.hypot(b.vx,b.vy), minSp=W*0.0006;
        if(sp<minSp){const a=Math.random()*6.283;b.vx+=Math.cos(a)*minSp;b.vy+=Math.sin(a)*minSp;}
        if(b.x<0&&b.vx<0)b.vx=-b.vx; if(b.x>W&&b.vx>0)b.vx=-b.vx;
        if(b.y<0&&b.vy<0)b.vy=-b.vy; if(b.y>H&&b.vy>0)b.vy=-b.vy;
        const c=palette[b.c], g=ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
        g.addColorStop(0,`rgba(${c[0]},${c[1]},${c[2]},0.42)`);
        g.addColorStop(0.6,`rgba(${c[0]},${c[1]},${c[2]},0.12)`);
        g.addColorStop(1,`rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,6.283); ctx.fill();
      }
      raf=requestAnimationFrame(frame);
    }
    frame();
    return ()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",onResize);window.removeEventListener("pointermove",onMove);window.removeEventListener("pointerleave",onLeave);};
  },[]);
  return <canvas ref={ref} className="al-liquid" aria-hidden="true"/>;
}
// Magnetic hover: the label eases toward the cursor and springs back — the "warp around the cursor" feel.
export function MagneticItem({children,onClick,className,strength=0.35}){
  const ref=React.useRef(null);
  const onMove=e=>{const el=ref.current;if(!el)return;const r=el.getBoundingClientRect();el.style.transform=`translate(${(e.clientX-(r.left+r.width/2))*strength}px,${(e.clientY-(r.top+r.height/2))*strength}px)`;};
  const reset=()=>{if(ref.current)ref.current.style.transform="translate(0,0)";};
  return <button type="button" className={className} onClick={onClick} onMouseMove={onMove} onMouseLeave={reset}>
    <span ref={ref} style={{display:"inline-block",transition:"transform .28s cubic-bezier(.2,.9,.2,1)",willChange:"transform"}}>{children}</span>
  </button>;
}
// Gender + category nuggets shown on every result page + the preview.
// `doublehanded` lets the nugget combine helm+crew remembered genders → Mixed.
export function ResultNuggets({entry,size="md",doublehanded=false}){
  const {category}=genderCatOf(entry);
  const gender=resolvedEntryGender(entry,doublehanded);
  if(!gender&&!category) return null;   // no tag → show nothing (no dash)
  const fs=size==="sm"?9.5:10.5;
  const pad=size==="sm"?"1px 5px":"2px 6px";
  return <span style={{display:"inline-flex",gap:3,alignItems:"center",flexWrap:"wrap"}}>
    {gender&&<span style={{background:GENDER_COLOR[gender]||"var(--mut)",color:"#fff",borderRadius:980,fontSize:fs,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:pad,letterSpacing:".02em",boxShadow:"inset 0 1px 0 rgba(255,255,255,.45),0 1px 2px rgba(0,0,0,.12)"}} title={gender==="Mix"?"Mixed":gender==="F"?"Female":"Male"}>{gender}</span>}
    {category&&<span style={{background:"#0f8a7e",color:"#fff",borderRadius:980,fontSize:fs,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:pad,letterSpacing:".02em",boxShadow:"inset 0 1px 0 rgba(255,255,255,.45),0 1px 2px rgba(0,0,0,.12)"}} title={"Age category: "+category}>{category}</span>}
  </span>;
}

/* Spider-web icon (lucide has none) — radial spokes + two octagon rings. */
export function WebIcon({size=12}){
  return(<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{flex:"none"}}>
    <path d="M12 3.5 L12 20.5 M3.5 12 L20.5 12 M6 6 L18 18 M18 6 L6 18"/>
    <path d="M20 12 L17.66 17.66 L12 20 L6.34 17.66 L4 12 L6.34 6.34 L12 4 L17.66 6.34 Z"/>
    <path d="M16.5 12 L15.18 15.18 L12 16.5 L8.82 15.18 L7.5 12 L8.82 8.82 L12 7.5 L15.18 8.82 Z"/>
  </svg>);
}

export class ErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={err:false};}
  static getDerivedStateFromError(){return{err:true};}
  componentDidCatch(e,info){console.error("Globe/render error caught:",e,info);}
  componentDidUpdate(prev){if(prev.resetKey!==this.props.resetKey&&this.state.err)this.setState({err:false});}
  render(){
    if(this.state.err) return this.props.fallback||(
      <div style={{padding:16,color:"#9fbdd9",fontSize:13,textAlign:"center"}}>Couldn't render this view.</div>);
    return this.props.children;
  }
}

/* Host logo, rendered tight to its artwork. The stored PNG is a square canvas with
   the logo letterboxed on transparent padding (baked at upload — see removeLogoBackground
   in data/hosts.js). Displayed raw at a tall height, that padding reads as a big empty gap
   above the title. So we measure the opaque bounding box once (via a CORS Image → canvas
   alpha scan) and crop to it: the wrapper is the artwork's size, the image is scaled/offset
   so only the artwork shows. If the pixel read fails (e.g. missing CORS header taints the
   canvas), we fall back to the plain contained image — same, just with padding still visible.
   Sizing is CSS-driven via `className` (default .hdr-logo, a clamp() height): the wrapper's
   height comes from CSS and its width follows through aspect-ratio, so the logo shrinks with
   the rest of the header. The crop is expressed in PERCENTAGES of the wrapper (not fixed px),
   so it stays correct at every size. */
export function HostLogo({src,className="hdr-logo"}){
  const [crop,setCrop]=React.useState(null); // {minX,minY,aw,ah,nw,nh}
  React.useEffect(()=>{
    setCrop(null);
    if(!src) return;
    let alive=true;
    const im=new Image(); im.crossOrigin="anonymous";
    im.onload=()=>{
      if(!alive) return;
      try{
        const nw=im.naturalWidth,nh=im.naturalHeight; if(!nw||!nh) return;
        const c=document.createElement("canvas"); c.width=nw; c.height=nh;
        const cx=c.getContext("2d"); cx.drawImage(im,0,0);
        const d=cx.getImageData(0,0,nw,nh).data;
        let minX=nw,minY=nh,maxX=-1,maxY=-1;
        for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){ if(d[(y*nw+x)*4+3]>8){ if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; } }
        if(maxX<minX||maxY<minY) return;                 // fully transparent → leave uncropped
        setCrop({minX,minY,aw:maxX-minX+1,ah:maxY-minY+1,nw,nh});
      }catch(e){/* tainted canvas → leave uncropped */}
    };
    im.src=src;
    return()=>{alive=false;};
  },[src]);
  if(!crop){
    // Fallback (couldn't read pixels): uncropped, contained — height from the CSS class.
    return(
      <div className={className} style={{marginBottom:10,display:"flex",alignItems:"flex-end",justifyContent:"flex-start"}}>
        <img src={src} alt="" style={{height:"100%",width:"auto",maxWidth:"100%",objectFit:"contain",display:"block"}}/>
      </div>
    );
  }
  const {minX,minY,aw,ah,nw,nh}=crop;
  return(
    <div className={className} style={{aspectRatio:`${aw} / ${ah}`,marginBottom:10,overflow:"hidden",position:"relative"}}>
      <img src={src} alt="" style={{position:"absolute",left:`${-(minX/aw)*100}%`,top:`${-(minY/ah)*100}%`,width:`${(nw/aw)*100}%`,height:`${(nh/ah)*100}%`,maxWidth:"none",display:"block"}}/>
    </div>
  );
}
