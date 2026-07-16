/* Profile / athlete / dev-admin modal views for sailing — claim, edit, media
   and the dev approval/profile admin panels (PhotoCropper is internal to
   AthleteEditModal). Reorg step 4: views/ module, mirroring
   sports/golf/src/views/. Verbatim from App.jsx. */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { BadgeCheck, CheckCircle, ChevronRight, Clock, LayoutGrid, Loader2, Pencil, Plus, Search, Trash2, Trophy, Upload, Users, X } from "lucide-react";
import { canonName, initials, avatarColor } from "../util/name.js";
import { nuggetFor } from "../util/class.js";
import { ATHLETE_ATTRS, usernameForName } from "../data/athletes.js";
import { hostRest } from "../data/hosts.js";
import { fetchUnverifiedMembers, fetchAllProfiles, fetchAllMembers, devDeleteProfile, fetchProfileNames } from "../data/profiles.js";
import { aggregate } from "../data/scoring.js";
import { ConfirmModal } from "./atoms.jsx";
import { CountrySelect } from "./forms.jsx";

/* ═══════════════════════════════════════════════════════════════════════
   Dev-only "Pending approvals" panel
   ───────────────────────────────────────────────────────────────────────
   Lists every unverified host_members row across all hosts. For each:
   - Approve  → set verified=true (host gains full access)
   - Delete   → remove membership; if it was a newly-created host with no
                results and no other members, delete the portal too
   - Reassign → move the membership to a different host (wrong-club fix)
   ═══════════════════════════════════════════════════════════════════════ */
export function DevApprovalsModal({auth,hosts,nameForHost,eventCountFor,memberCountFor,onApprove,onDelete,onReassign,onClose}){
  const tok=auth?.token;
  const[rows,setRows]=React.useState(null);
  const[names,setNames]=React.useState({});
  const[busyId,setBusyId]=React.useState(null);
  const[reassignFor,setReassignFor]=React.useState(null); // membership row being reassigned
  const[reassignSearch,setReassignSearch]=React.useState("");

  const load=React.useCallback(async()=>{
    const r=await fetchUnverifiedMembers(tok);
    setRows(r||[]);
    const {names}=await fetchProfileNames((r||[]).map(x=>x.user_id),tok);
    setNames(names);
  },[tok]);
  React.useEffect(()=>{load();},[load]);

  const nameFor=(id)=>id?(names[id]||`User ${id.slice(0,8)}`):"—";

  const[confirm,setConfirm]=React.useState(null);
  const doApprove=async(m)=>{setBusyId(m.id);await onApprove(m);await load();setBusyId(null);};
  const doDelete=(m)=>setConfirm({
    title:"Delete request?",
    message:`Delete ${nameFor(m.user_id)}'s ${m.role} request for "${nameForHost(m.host_id)}"?`,
    confirmLabel:"Delete",
    onConfirm:async()=>{setBusyId(m.id);await onDelete(m);await load();setBusyId(null);}});
  const doReassign=async(m,newHostId)=>{
    setBusyId(m.id);await onReassign(m,newHostId);setReassignFor(null);setReassignSearch("");await load();setBusyId(null);
  };

  const reassignOptions=(hosts||[]).filter(h=>!reassignSearch.trim()||h.name.toLowerCase().includes(reassignSearch.toLowerCase()));

  return(<>
    <ConfirmModal state={confirm} onClose={()=>setConfirm(null)}/>
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <BadgeCheck size={18}/>
          <h3 style={{flex:1}}>Pending approvals <span style={{fontWeight:400,opacity:.6,fontSize:14}}>(dev)</span></h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{padding:"18px 24px 24px"}}>
          {rows===null&&<div style={{display:"flex",alignItems:"center",gap:8,color:"var(--mut)",fontSize:13}}><Loader2 size={15} className="spin"/>Loading…</div>}
          {rows!==null&&rows.length===0&&<p style={{fontSize:13,color:"var(--mut)",margin:0}}>No pending host approvals.</p>}
          {(rows||[]).map(m=>{
            const evCount=eventCountFor(m.host_id);
            const memCount=memberCountFor?memberCountFor(m.host_id):null;
            const isReassigning=reassignFor===m.id;
            return(
              <div key={m.id} style={{borderBottom:"1px solid var(--line)",padding:"12px 0"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13.5,fontWeight:700,color:"var(--ink)"}}>{nameForHost(m.host_id)}</div>
                    <div style={{fontSize:12,color:"var(--mut)"}}>
                      {nameFor(m.user_id)} · {m.role} · requested {new Date(m.created_at).toLocaleDateString()}
                      {" · "}<span style={{color:evCount>0?"var(--mut)":"#c8860a"}}>{evCount} result{evCount===1?"":"s"}</span>
                    </div>
                  </div>
                  <button className="btn green" style={{fontSize:12,padding:"5px 11px"}} disabled={busyId===m.id} onClick={()=>doApprove(m)}>
                    {busyId===m.id?<Loader2 size={13} className="spin"/>:<CheckCircle size={13}/>}Approve
                  </button>
                  <button className="btn ghost" style={{fontSize:12,padding:"5px 11px"}} disabled={busyId===m.id} onClick={()=>{setReassignFor(isReassigning?null:m.id);setReassignSearch("");}}>
                    <Pencil size={12}/>Reassign
                  </button>
                  <button className="delbtn" title="Delete request" disabled={busyId===m.id} onClick={()=>doDelete(m)}><Trash2 size={15}/></button>
                </div>
                {isReassigning&&(
                  <div style={{marginTop:10,background:"var(--grouped)",borderRadius:10,padding:"10px 12px"}}>
                    <p style={{margin:"0 0 7px",fontSize:12,color:"var(--mut)",fontWeight:600}}>Move this request to a different host:</p>
                    <input style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 11px",font:"inherit",fontSize:13,marginBottom:8,outline:"none"}}
                      placeholder="Search hosts…" value={reassignSearch} onChange={e=>setReassignSearch(e.target.value)}/>
                    <div style={{maxHeight:160,overflowY:"auto",display:"flex",flexDirection:"column",gap:4}}>
                      {reassignOptions.map(h=>(
                        <button key={h.id} disabled={h.id===m.host_id} onClick={()=>doReassign(m,h.id)}
                          style={{textAlign:"left",border:"1px solid var(--line)",background:h.id===m.host_id?"var(--grouped)":"#fff",
                            borderRadius:8,padding:"7px 10px",fontSize:12.5,cursor:h.id===m.host_id?"default":"pointer",
                            color:h.id===m.host_id?"var(--mut)":"var(--navy)",fontWeight:600}}>
                          {h.name} <span style={{fontWeight:400,color:"var(--mut)"}}>· {h.type}{h.id===m.host_id?" (current)":""}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  </>);
}

/* ═══════════════════════════════════════════════════════════════════════
   Dev-only "All profiles" panel
   ───────────────────────────────────────────────────────────────────────
   Lists every profile row across all hosts (for test cleanup). For each:
   - shows name / email-less id / role / host memberships / created date
   - Delete → removes the profile + its memberships + claims (hard delete)
   Filter to quickly find empty test accounts.
   ═══════════════════════════════════════════════════════════════════════ */
export function DevProfilesModal({auth,nameForHost,hosts=[],onClose}){
  const tok=auth?.token;
  const[profiles,setProfiles]=React.useState(null);
  const[members,setMembers]=React.useState([]);
  const[busyId,setBusyId]=React.useState(null);
  const[q,setQ]=React.useState("");
  const[onlyEmpty,setOnlyEmpty]=React.useState(false);
  const[editId,setEditId]=React.useState(null);      // profile being reassigned
  const[addHost,setAddHost]=React.useState("");       // host id to add membership to
  const[addRole,setAddRole]=React.useState("editor");

  const load=React.useCallback(async()=>{
    const[p,m]=await Promise.all([fetchAllProfiles(tok),fetchAllMembers(tok)]);
    setProfiles(p||[]); setMembers(m||[]);
  },[tok]);
  React.useEffect(()=>{load();},[load]);

  const membersFor=(uid)=>members.filter(m=>m.user_id===uid);
  const nameOf=(p)=>`${p.first_name||""} ${p.last_name||""}`.trim()||p.display_name||(p.username?"@"+p.username:null)||`User ${String(p.user_id).slice(0,8)}`;

  const[confirm,setConfirm]=React.useState(null);
  const del=(p)=>setConfirm({
    title:"Delete profile?",
    message:`Delete profile "${nameOf(p)}" and all its memberships?\n\nThis cannot be undone.`,
    confirmLabel:"Delete",
    onConfirm:async()=>{setBusyId(p.user_id);await devDeleteProfile(p.user_id,tok);await load();setBusyId(null);}});
  // ── Reassign helpers (persisted to host_members) ──
  const patchMember=async(m,patch)=>{
    setBusyId(m.user_id);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"PATCH",body:JSON.stringify(patch)},tok);
    await load(); setBusyId(null);
  };
  const removeMember=async(m)=>{
    setBusyId(m.user_id);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"DELETE"},tok);
    await load(); setBusyId(null);
  };
  const addMembership=async(p)=>{
    if(!addHost) return;
    setBusyId(p.user_id);
    await hostRest("host_members",{method:"POST",body:JSON.stringify({
      host_id:addHost,user_id:p.user_id,role:addRole,status:"active",verified:true})},tok);
    setAddHost(""); await load(); setBusyId(null);
  };

  const rows=(profiles||[]).filter(p=>{
    const mem=membersFor(p.user_id);
    if(onlyEmpty&&mem.length>0) return false;
    if(!q.trim()) return true;
    const hay=`${nameOf(p)} ${p.username||""} ${p.role||""} ${mem.map(m=>nameForHost(m.host_id)).join(" ")}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  return(<>
    <ConfirmModal state={confirm} onClose={()=>setConfirm(null)}/>
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:680}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <Users size={18}/>
          <h3 style={{flex:1}}>All profiles <span style={{fontWeight:400,opacity:.6,fontSize:14}}>(dev)</span></h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{padding:"16px 24px 24px"}}>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:180,position:"relative"}}>
              <Search size={14} color="#9fb2c8" style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)"}}/>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search profiles…"
                style={{width:"100%",border:"1px solid var(--line)",borderRadius:9,padding:"8px 11px 8px 32px",font:"inherit",fontSize:13,outline:"none",background:"rgba(255,255,255,.85)"}}/>
            </div>
            <span style={{fontSize:12,color:"var(--mut)",fontWeight:600}}>{rows.length} shown</span>
          </div>
          {profiles===null&&<div style={{display:"flex",alignItems:"center",gap:8,color:"var(--mut)",fontSize:13}}><Loader2 size={15} className="spin"/>Loading profiles…</div>}
          {profiles!==null&&rows.length===0&&<p style={{fontSize:13,color:"var(--mut)",margin:0}}>No profiles match.</p>}
          <div style={{maxHeight:"60vh",overflowY:"auto"}}>
            {rows.map(p=>{
              const mem=membersFor(p.user_id);
              const editing=editId===p.user_id;
              return(
                <div key={p.user_id} style={{padding:"11px 0",borderBottom:"1px solid var(--line)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:700,color:"var(--ink)"}}>{nameOf(p)}{p.username&&<span style={{marginLeft:6,fontSize:11.5,color:"var(--mut)",fontWeight:600}}>@{p.username}</span>}</div>
                      <div style={{fontSize:11.5,color:"var(--mut)",marginTop:2}}>
                        <span style={{textTransform:"capitalize"}}>{p.role||"guest"}</span>
                        {mem.length>0&&<> · {mem.map(m=>`${nameForHost(m.host_id)} (${m.role}${m.verified?"":", unverified"})`).join(", ")}</>}
                        {p.created_at?<> · {new Date(p.created_at).toLocaleDateString()}</>:null}
                      </div>
                    </div>
                    <button className="btn ghost" style={{fontSize:12,padding:"6px 10px",...(editing?{background:"var(--accent)",color:"#fff"}:{})}} onClick={()=>{setEditId(editing?null:p.user_id);setAddHost("");}}>
                      <Pencil size={12}/>Reassign
                    </button>
                    <button className="delbtn" title="Delete profile" disabled={busyId===p.user_id} onClick={()=>del(p)}>
                      {busyId===p.user_id?<Loader2 size={15} className="spin"/>:<Trash2 size={15}/>}
                    </button>
                  </div>
                  {editing&&(
                    <div style={{marginTop:10,background:"var(--grouped)",borderRadius:10,padding:"10px 12px"}}>
                      {/* Existing memberships: change role, verify, remove */}
                      {mem.length===0&&<div style={{fontSize:12,color:"var(--mut)",marginBottom:8}}>No memberships yet.</div>}
                      {mem.map(m=>(
                        <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:8}}>
                          <span style={{fontSize:12.5,fontWeight:600,color:"var(--navy)",flex:1,minWidth:120}}>{nameForHost(m.host_id)}</span>
                          <div className="seg" style={{fontSize:11}}>
                            <button className={m.role==="owner"?"on":""} onClick={()=>patchMember(m,{role:"owner"})}>Owner</button>
                            <button className={m.role==="editor"?"on":""} onClick={()=>patchMember(m,{role:"editor"})}>Editor</button>
                          </div>
                          <button className="btn ghost" style={{fontSize:11.5,padding:"5px 9px",...(m.verified?{color:"#2e9e5b"}:{})}} onClick={()=>patchMember(m,{verified:!m.verified})}>
                            {m.verified?<><CheckCircle size={12}/>Verified</>:<><Clock size={12}/>Unverified</>}
                          </button>
                          <button className="delbtn" title="Remove from host" onClick={()=>removeMember(m)}><Trash2 size={13}/></button>
                        </div>
                      ))}
                      {/* Add membership to a different host */}
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:6,paddingTop:10,borderTop:"1px solid var(--line)"}}>
                        <select value={addHost} onChange={e=>setAddHost(e.target.value)}
                          style={{flex:1,minWidth:140,border:"1px solid var(--line)",borderRadius:8,padding:"7px 9px",font:"inherit",fontSize:12.5,background:"#fff"}}>
                          <option value="">Add to host…</option>
                          {hosts.filter(h=>!mem.some(m=>m.host_id===h.id)).map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
                        </select>
                        <div className="seg" style={{fontSize:11}}>
                          <button className={addRole==="owner"?"on":""} onClick={()=>setAddRole("owner")}>Owner</button>
                          <button className={addRole==="editor"?"on":""} onClick={()=>setAddRole("editor")}>Editor</button>
                        </div>
                        <button className="btn cta liquidGlass-wrapper" style={{fontSize:12,padding:"6px 11px"}} disabled={!addHost||busyId===p.user_id} onClick={()=>addMembership(p)}>
                          <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Plus size={13}/>Add</div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  </>);
}

/* ═══════════════════════════════════════════════════════════════════════
   Guided athlete-claim modal — surfaces auto-built profiles whose name is
   similar to the signed-in athlete, each expandable to a mini result
   preview, with a one-tap "This is me — claim". A fallback button opens the
   full all-athletes page for manual search. Uses existing data only
   (people list + aggregate) — no new storage.
   ═══════════════════════════════════════════════════════════════════════ */
export function ClaimProfileModal({myName="",people=[],events=[],alreadyClaimed=null,onClaim,onSearchAll,onClose}){
  const[q,setQ]=React.useState(myName||"");
  const[openName,setOpenName]=React.useState(null);
  const[busy,setBusy]=React.useState(null);
  const norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();
  const myTokens=norm(myName).split(" ").filter(Boolean);
  const qn=norm(q);
  const scored=React.useMemo(()=>{
    const qTokens=qn.split(" ").filter(Boolean);
    return people.map(p=>{
      const pn=norm(p.name);
      const pTokens=pn.split(" ").filter(Boolean);
      let score=0;
      for(const t of qTokens){ if(pTokens.includes(t))score+=2; else if(t.length>=3&&pn.includes(t))score+=1; }
      for(const t of myTokens){ if(pTokens.includes(t))score+=0.5; }
      return{name:p.name,score};
    })
    .filter(x=>x.score>0)
    .sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name))
    .slice(0,40);
  },[qn,people]);
  const claim=async(name)=>{ setBusy(name); try{await onClaim(name);}finally{setBusy(null);} };
  return(
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:560}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <BadgeCheck size={18}/>
          <h3 style={{flex:1}}>Claim your profile</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{padding:"14px 24px 24px"}}>
          {alreadyClaimed
            ? <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 4px",lineHeight:1.45}}>You've already claimed <b style={{color:"var(--navy)"}}>{alreadyClaimed}</b>. You can only claim one profile.</p>
            : <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 12px",lineHeight:1.45}}>Find the auto-built profile that's you, preview the results, and claim it. A verified host admin from a competition you played will confirm it.</p>}
          {!alreadyClaimed&&<>
          <div style={{position:"relative",marginBottom:14}}>
            <Search size={14} color="#9fb2c8" style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)"}}/>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Type your name…"
              style={{width:"100%",border:"1px solid var(--line)",borderRadius:9,padding:"9px 11px 9px 32px",font:"inherit",fontSize:13.5,outline:"none",background:"rgba(255,255,255,.85)"}}/>
          </div>
          <div style={{maxHeight:"52vh",overflowY:"auto",margin:"0 -4px"}}>
            {qn&&scored.length===0&&<p style={{fontSize:13,color:"var(--mut)",margin:"6px 4px"}}>No profiles match "{q}". Try a different spelling, or search the full list below.</p>}
            {!qn&&scored.length===0&&<p style={{fontSize:13,color:"var(--mut)",margin:"6px 4px"}}>Type your name to find your profile.</p>}
            {scored.map(({name})=>{
              const open=openName===name;
              const ag=open?aggregate(name,events):null;
              const recent=ag?.history?.[0];
              const attrs=ATHLETE_ATTRS.get(canonName(name));
              const nug=attrs?.recentCls?nuggetFor(attrs.recentCls,attrs.recentSub):null;
              return(
                <div key={name} style={{padding:"0 4px",borderBottom:"1px solid var(--line)"}}>
                  <div onClick={()=>setOpenName(open?null:name)} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 6px",cursor:"pointer"}}>
                    <div className="av" style={{background:avatarColor(name),width:34,height:34,fontSize:13,flex:"none"}}>{initials(name)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:"var(--ink)",display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>{name}{nug&&<span className="cls" style={{background:nug.color,fontSize:10,padding:"1px 8px"}}>{nug.label}</span>}</div>
                    </div>
                    <ChevronRight size={15} color="#9fb2c8" style={{flex:"none",transform:open?"rotate(90deg)":"none",transition:".15s"}}/>
                  </div>
                  {open&&(
                    <div style={{padding:"2px 8px 12px 50px"}}>
                      {ag.events>0?(<>
                        <div style={{display:"flex",gap:16,marginBottom:8}}>
                          <span style={{fontSize:12.5,color:"var(--mut)"}}><b style={{color:"var(--navy)",fontSize:14}}>{ag.events}</b> comps</span>
                          <span style={{fontSize:12.5,color:"var(--mut)"}}><b style={{color:"var(--navy)",fontSize:14}}>{ag.best?"#"+ag.best:"—"}</b> best</span>
                          <span style={{fontSize:12.5,color:"var(--mut)"}}><b style={{color:"var(--navy)",fontSize:14}}>{ag.podiums}</b> podiums</span>
                        </div>
                        {recent&&<div style={{fontSize:12,color:"var(--mut)",marginBottom:10,display:"flex",alignItems:"center",gap:6}}><Trophy size={12} style={{flex:"none"}}/>Latest: {recent.ev.name} · {recent.ev.date} · #{recent.row.rank}</div>}
                      </>):<div style={{fontSize:12.5,color:"var(--mut)",marginBottom:10}}>No competition results on this profile yet.</div>}
                      <button className="btn cta liquidGlass-wrapper" disabled={busy===name} onClick={()=>claim(name)} style={{fontSize:13}}>
                        <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy===name?<Loader2 size={14} className="spin"/>:<BadgeCheck size={14}/>}This is me — claim</div>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>}
          <button className="btn ghost" onClick={onSearchAll} style={{marginTop:16,width:"100%",fontSize:13,padding:"9px 12px"}}>
            <Search size={13}/>{alreadyClaimed?"Browse all athletes":"Search the full athlete list instead"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Verified-owner profile edit modal — lets the approved owner (or dev) set
   the presentation extras that aren't derived from PDFs: photo, display
   name, nationality, bio, and an Instagram link. Results stay PDF-sourced.
   Photo uploads go to the public `athlete-photos` storage bucket.
   ═══════════════════════════════════════════════════════════════════════ */
// Google-style circular photo cropper: drag to reposition + zoom slider, then
// renders the visible circle to a square canvas and returns a JPEG blob.
// initialSrc may be a File or an existing image URL; a "Change image" button
// lets the user swap in a different file without leaving the cropper.
export function PhotoCropper({initialSrc=null,onCancel,onConfirm}){
  const V=288, OUT=512;
  const[src,setSrc]=React.useState(initialSrc); // File | url string | null
  const[img,setImg]=React.useState(null);
  const[base,setBase]=React.useState(1);
  const[scale,setScale]=React.useState(1);
  const[off,setOff]=React.useState({x:0,y:0});
  const[busy,setBusy]=React.useState(false);
  const drag=React.useRef(null);
  const fileRef=React.useRef(null);
  React.useEffect(()=>{
    if(!src){setImg(null);return;}
    const isFile=typeof src!=="string";
    const url=isFile?URL.createObjectURL(src):src;
    const im=new Image();
    if(!isFile) im.crossOrigin="anonymous";   // allow canvas export of stored photos
    im.onload=()=>{
      const b=Math.max(V/im.naturalWidth,V/im.naturalHeight);
      setImg(im);setBase(b);setScale(1);
      setOff({x:(V-im.naturalWidth*b)/2,y:(V-im.naturalHeight*b)/2});
    };
    im.onerror=()=>setImg(null);
    im.src=url;
    return()=>{ if(isFile) URL.revokeObjectURL(url); };
  },[src]);
  const eff=base*scale;
  const dispW=img?img.naturalWidth*eff:0;
  const dispH=img?img.naturalHeight*eff:0;
  const clamp=(o)=>({x:Math.min(0,Math.max(V-dispW,o.x)),y:Math.min(0,Math.max(V-dispH,o.y))});
  React.useEffect(()=>{ if(img) setOff(o=>clamp(o)); /* re-clamp on zoom */ },[scale,img]);// eslint-disable-line
  const pt=e=>e.touches?e.touches[0]:e;
  const onDown=e=>{if(!img)return;const p=pt(e);drag.current={sx:p.clientX,sy:p.clientY,ox:off.x,oy:off.y};};
  const onMove=e=>{if(!drag.current)return;const p=pt(e);setOff(clamp({x:drag.current.ox+(p.clientX-drag.current.sx),y:drag.current.oy+(p.clientY-drag.current.sy)}));};
  const onUp=()=>{drag.current=null;};
  const pickFile=e=>{const f=e.target.files?.[0];e.target.value="";if(f)setSrc(f);};
  const confirm=()=>{
    if(!img)return; setBusy(true);
    try{
      const c=document.createElement("canvas");c.width=OUT;c.height=OUT;
      const ctx=c.getContext("2d");
      const sSize=V/eff, sx=(-off.x)/eff, sy=(-off.y)/eff;
      ctx.drawImage(img,sx,sy,sSize,sSize,0,0,OUT,OUT);
      c.toBlob(b=>onConfirm(b),"image/jpeg",0.9);
    }catch(e){console.error("crop export",e);setBusy(false);onConfirm(null);}
  };
  return(
    <div className="ov" style={{zIndex:120}} onClick={onCancel}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:360}}>
        <div className="mhead" style={{padding:"16px 22px"}}><Upload size={16}/><h3 style={{flex:1}}>Position photo</h3><button className="x" onClick={onCancel}><X size={16}/></button></div>
        <div style={{padding:"18px 22px 22px",display:"flex",flexDirection:"column",alignItems:"center"}}>
          <div onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onUp}
            onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
            style={{position:"relative",width:V,height:V,borderRadius:"50%",overflow:"hidden",cursor:img?"grab":"default",background:"#0b1f38",boxShadow:"inset 0 0 0 2px rgba(255,255,255,.45)",touchAction:"none",userSelect:"none",display:"grid",placeItems:"center"}}>
            {img
              ? <img src={img.src} alt="" draggable={false} style={{position:"absolute",left:off.x,top:off.y,width:dispW,height:dispH,maxWidth:"none",pointerEvents:"none"}}/>
              : <span style={{color:"#9fbdd9",fontSize:12.5,padding:"0 30px",textAlign:"center"}}>Choose an image below</span>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,width:"100%",margin:"16px 0 4px",opacity:img?1:.4}}>
            <span style={{fontSize:11,fontWeight:700,color:"var(--mut)"}}>ZOOM</span>
            <input type="range" min="1" max="4" step="0.01" disabled={!img} value={scale} onChange={e=>setScale(parseFloat(e.target.value))} style={{flex:1}}/>
          </div>
          <p style={{fontSize:11.5,color:"var(--mut)",margin:"4px 0 0"}}>Drag to reposition · slide to zoom</p>
          <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} style={{display:"none"}}/>
          <button className="btn ghost" onClick={()=>fileRef.current&&fileRef.current.click()} style={{marginTop:12,fontSize:12.5,padding:"7px 13px"}}><Upload size={13}/>Change image</button>
          <div style={{display:"flex",gap:10,width:"100%",marginTop:12}}>
            <button className="btn cta liquidGlass-wrapper" disabled={busy||!img} onClick={confirm} style={{flex:1}}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={14} className="spin"/>:<CheckCircle size={14}/>}Use photo</div></button>
            <button className="btn ghost" onClick={onCancel} style={{padding:"0 16px"}}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Athlete media gallery — popup opened from the profile (button between
   Calendar and Instagram). Shows photos + uploaded videos. The verified owner
   (or dev) can add, caption, remove, and save; visitors get a read-only gallery
   with a click-to-expand lightbox. Files upload to the athlete-photos bucket
   via uploadMedia; the array persists to athlete_profiles.media via onSaveMedia.
   ═══════════════════════════════════════════════════════════════════════ */
export const MAX_MEDIA_MB=50;
export function MediaModal({name,media,canEdit,uploadMedia,onSaveMedia,onClose}){
  const[items,setItems]=React.useState(Array.isArray(media)?media:[]);
  const[uploading,setUploading]=React.useState(false);
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");
  const[light,setLight]=React.useState(null); // index in lightbox, or null
  const dirty=JSON.stringify(items)!==JSON.stringify(Array.isArray(media)?media:[]);

  const onPick=async(e)=>{
    const files=Array.from(e.target.files||[]); e.target.value="";
    if(!files.length) return;
    setErr(""); setUploading(true);
    const added=[];
    for(const f of files){
      if(f.size>MAX_MEDIA_MB*1024*1024){setErr(`"${f.name}" is over ${MAX_MEDIA_MB}MB — please upload a smaller file.`);continue;}
      const res=await uploadMedia(f);
      if(res&&res.url) added.push({url:res.url,type:res.type||"image",caption:""});
      else setErr("Upload failed — make sure you're signed in and try again.");
    }
    if(added.length) setItems(prev=>[...prev,...added]);
    setUploading(false);
  };
  const setCaption=(i,v)=>setItems(prev=>prev.map((it,j)=>j===i?{...it,caption:v.slice(0,140)}:it));
  const remove=(i)=>setItems(prev=>prev.filter((_,j)=>j!==i));
  const save=async()=>{ setBusy(true); try{ await onSaveMedia(name,items); onClose(); }catch(e){console.error("media save",e);setErr("Couldn't save. Try again.");setBusy(false);} };

  const tile={position:"relative",borderRadius:12,overflow:"hidden",background:"var(--grouped,#eef3f9)",aspectRatio:"1 / 1",cursor:"pointer"};
  const mediaFit={width:"100%",height:"100%",objectFit:"cover",display:"block"};
  return(<>
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:720}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <LayoutGrid size={18}/>
          <h3 style={{flex:1}}>{name} — Media</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{padding:"18px 24px 24px"}}>
          {canEdit&&(
            <div style={{marginBottom:14,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <label className="btn cta liquidGlass-wrapper" style={{cursor:uploading?"default":"pointer"}}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/>
                <div className="liquidGlass-text">{uploading?<Loader2 size={14} className="spin"/>:<Upload size={14}/>}{uploading?"Uploading…":"Add photos or videos"}</div>
                <input type="file" accept="image/*,video/*" multiple disabled={uploading} style={{display:"none"}} onChange={onPick}/>
              </label>
              <span style={{fontSize:11.5,color:"var(--mut)"}}>Images & video, up to {MAX_MEDIA_MB}MB each.</span>
            </div>
          )}
          {err&&<div style={{fontSize:12.5,color:"#c0392b",margin:"0 0 12px"}}>{err}</div>}
          {items.length===0
            ? <div style={{padding:"38px 0",textAlign:"center",color:"var(--mut)",fontSize:13.5}}>{canEdit?"No media yet — add photos or videos to showcase your golf.":"No media yet."}</div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {items.map((it,i)=>(
                  <div key={i}>
                    <div style={tile} onClick={()=>setLight(i)}>
                      {it.type==="video"
                        ? <><video src={it.url} style={mediaFit} muted playsInline preload="metadata"/>
                            <div style={{position:"absolute",inset:0,display:"grid",placeItems:"center",pointerEvents:"none"}}>
                              <span style={{width:38,height:38,borderRadius:"50%",background:"rgba(8,24,45,.62)",color:"#fff",display:"grid",placeItems:"center",fontSize:15,paddingLeft:3}}>▶</span>
                            </div></>
                        : <img src={it.url} alt={it.caption||""} style={mediaFit}/>}
                      {canEdit&&<button onClick={e=>{e.stopPropagation();remove(i);}} title="Remove"
                        style={{position:"absolute",top:6,right:6,width:26,height:26,borderRadius:980,border:0,background:"rgba(8,24,45,.66)",color:"#fff",display:"grid",placeItems:"center",cursor:"pointer"}}><Trash2 size={13}/></button>}
                    </div>
                    {canEdit
                      ? <input value={it.caption||""} onChange={e=>setCaption(i,e.target.value)} placeholder="Caption (optional)"
                          style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"6px 8px",font:"inherit",fontSize:12,marginTop:6,outline:"none",background:"rgba(255,255,255,.9)"}}/>
                      : (it.caption?<div style={{fontSize:12,color:"var(--mut)",marginTop:6,lineHeight:1.4}}>{it.caption}</div>:null)}
                  </div>
                ))}
              </div>}
          {canEdit&&(
            <div style={{display:"flex",gap:10,marginTop:18}}>
              <button className="btn cta liquidGlass-wrapper" disabled={busy||uploading||!dirty} onClick={save} style={{flex:1}}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={14} className="spin"/>:<CheckCircle size={14}/>}Save changes</div>
              </button>
              <button className="btn ghost" onClick={onClose} style={{padding:"0 18px"}}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
    {light!=null&&items[light]&&(
      <div className="ov" style={{zIndex:120,background:"rgba(6,18,36,.86)"}} onClick={()=>setLight(null)}>
        <div onClick={e=>e.stopPropagation()} style={{maxWidth:"92vw",maxHeight:"88vh",position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
          <button className="x" onClick={()=>setLight(null)} style={{position:"absolute",top:-6,right:-6,zIndex:2}}><X size={18}/></button>
          {items.length>1&&<button onClick={()=>setLight((light-1+items.length)%items.length)} title="Previous"
            style={{position:"absolute",left:-52,top:"50%",transform:"translateY(-50%)",width:40,height:40,borderRadius:980,border:0,background:"rgba(255,255,255,.16)",color:"#fff",cursor:"pointer",fontSize:18}}>‹</button>}
          {items[light].type==="video"
            ? <video src={items[light].url} controls autoPlay playsInline style={{maxWidth:"92vw",maxHeight:"80vh",borderRadius:12,background:"#000"}}/>
            : <img src={items[light].url} alt={items[light].caption||""} style={{maxWidth:"92vw",maxHeight:"80vh",borderRadius:12,objectFit:"contain"}}/>}
          {items.length>1&&<button onClick={()=>setLight((light+1)%items.length)} title="Next"
            style={{position:"absolute",right:-52,top:"50%",transform:"translateY(-50%)",width:40,height:40,borderRadius:980,border:0,background:"rgba(255,255,255,.16)",color:"#fff",cursor:"pointer",fontSize:18}}>›</button>}
          {items[light].caption&&<div style={{color:"#dce8f8",fontSize:13,textAlign:"center",maxWidth:640}}>{items[light].caption}</div>}
        </div>
      </div>
    )}
  </>);
}

export function AthleteEditModal({name,profile,onSaveExtras,onRename,onSaveUsername,uploadPhoto,onClose}){
  const parts=(name||"").trim().split(/\s+/);
  const[first,setFirst]=React.useState(parts.length>1?parts.slice(0,-1).join(" "):(parts[0]||""));
  const[last,setLast]=React.useState(parts.length>1?parts[parts.length-1]:"");
  const[username,setUsername]=React.useState(usernameForName(name));
  const[uErr,setUErr]=React.useState("");
  const[bio,setBio]=React.useState(profile?.bio||"");
  const[insta,setInsta]=React.useState(profile?.instagram_url||"");
  const[nat,setNat]=React.useState(profile?.nat_override||"");
  const[photo,setPhoto]=React.useState(profile?.photo_url||"");
  const[cropOpen,setCropOpen]=React.useState(false);
  const[uploading,setUploading]=React.useState(false);
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");
  const field={width:"100%",border:"1px solid var(--line)",borderRadius:9,padding:"9px 11px",font:"inherit",fontSize:13.5,outline:"none",background:"rgba(255,255,255,.9)"};
  const lbl={fontSize:11.5,fontWeight:700,color:"var(--mut)",textTransform:"uppercase",letterSpacing:".03em",margin:"0 0 5px"};

  const onCropped=async(blob)=>{
    setCropOpen(false); if(!blob){setErr("Couldn't process that image — try another.");return;}
    setUploading(true);
    const url=await uploadPhoto(blob);
    setUploading(false);
    if(url) setPhoto(url); else setErr("Photo upload failed — make sure you're signed in.");
  };
  const normIg=(v)=>{
    let ig=(v||"").trim(); if(!ig) return null;
    if(ig.startsWith("@")) return `https://instagram.com/${ig.slice(1)}`;
    if(/^https?:\/\//i.test(ig)) return ig;
    if(/instagram\.com/i.test(ig)) return `https://${ig}`;
    return `https://instagram.com/${ig.replace(/^\/+/,"")}`;
  };
  const save=async()=>{
    setBusy(true); setErr(""); setUErr("");
    const newName=`${first} ${last}`.trim()||name;
    const patch={bio:bio.trim()||null,instagram_url:normIg(insta),nat_override:(nat||"").trim().toUpperCase()||null,photo_url:photo||null};
    try{
      if(newName!==name) await onRename(name,newName);   // rename follows ownership + migrates extras key
      await onSaveExtras(newName,patch);
      // Public username (URL). Save last so it keys off the final name.
      if(onSaveUsername&&(username||"").trim()&&username.trim()!==usernameForName(newName)){
        const r=await onSaveUsername(newName,username.trim());
        if(r&&r.error){setUErr(r.error);setBusy(false);return;}
      }
      onClose(newName);
    }catch(e){console.error("athlete edit save",e);setErr("Couldn't save changes. Try again.");setBusy(false);}
  };
  return(<>
    {cropOpen&&<PhotoCropper initialSrc={photo||null} onCancel={()=>setCropOpen(false)} onConfirm={onCropped}/>}
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <Pencil size={17}/>
          <h3 style={{flex:1}}>Edit profile</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        <div style={{padding:"18px 24px 24px"}}>
          {/* Photo (click to edit/crop) with small label, name fields to the right */}
          <div style={{display:"flex",gap:16,marginBottom:16,alignItems:"flex-start"}}>
            <div style={{flex:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:5}}>
              <div onClick={()=>!uploading&&setCropOpen(true)} title="Click to edit photo"
                style={{width:96,height:96,borderRadius:"50%",overflow:"hidden",cursor:uploading?"default":"pointer"}}>
                {uploading
                  ? <div className="av" style={{width:96,height:96,background:"var(--navy)"}}><Loader2 size={22} className="spin"/></div>
                  : photo
                    ? <img src={photo} alt="" style={{width:96,height:96,objectFit:"cover",display:"block"}}/>
                    : <div className="av" style={{width:96,height:96,fontSize:30,background:avatarColor(name)}}>{initials(name)}</div>}
              </div>
              <button type="button" onClick={()=>!uploading&&setCropOpen(true)} style={{border:0,background:"none",cursor:"pointer",fontSize:10.5,fontWeight:700,color:"var(--accent)",padding:0,letterSpacing:".02em"}}>click to edit</button>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <p style={lbl}>First name</p>
              <input value={first} onChange={e=>setFirst(e.target.value)} style={{...field,marginBottom:11}}/>
              <p style={lbl}>Last name</p>
              <input value={last} onChange={e=>setLast(e.target.value)} style={field}/>
            </div>
          </div>
          {/* Public username — drives the profile URL (athlink.win/<username>) */}
          <div style={{marginBottom:14}}>
            <p style={lbl}>Profile link (username)</p>
            <div style={{display:"flex",alignItems:"center",gap:0,...field,padding:0,overflow:"hidden"}}>
              <span style={{padding:"9px 2px 9px 11px",fontSize:13.5,color:"var(--mut)",whiteSpace:"nowrap"}}>athlink.win/</span>
              <input value={username}
                onChange={e=>{setUsername(e.target.value.replace(/[^A-Za-z0-9]/g,"").slice(0,30));setUErr("");}}
                placeholder="CaseyLaw"
                style={{flex:1,minWidth:0,border:0,outline:"none",background:"transparent",font:"inherit",fontSize:13.5,padding:"9px 11px 9px 0"}}/>
            </div>
            {uErr
              ? <div style={{fontSize:12,color:"#c0392b",marginTop:5,fontWeight:600}}>{uErr}</div>
              : <div style={{fontSize:11,color:"var(--mut)",marginTop:4}}>Letters and numbers only. This is your shareable link.</div>}
          </div>
          {/* Nationality — dropdown, on the row below the photo */}
          <div style={{marginBottom:14}}>
            <p style={lbl}>Nationality</p>
            <CountrySelect value={nat} onChange={setNat} placeholder="Select country (overrides sail-number guess)"/>
          </div>
          {/* Instagram */}
          <div style={{marginBottom:14}}>
            <p style={lbl}>Instagram</p>
            <input value={insta} onChange={e=>setInsta(e.target.value)} placeholder="@handle or full link" style={field}/>
          </div>
          {/* Bio */}
          <div style={{marginBottom:8}}>
            <p style={lbl}>Bio</p>
            <textarea value={bio} onChange={e=>setBio(e.target.value.slice(0,600))} rows={4} placeholder="A short bio (optional)" style={{...field,resize:"vertical",lineHeight:1.5}}/>
            <div style={{fontSize:11,color:"var(--mut)",textAlign:"right",marginTop:2}}>{bio.length}/600</div>
          </div>
          {err&&<div style={{fontSize:12.5,color:"#c0392b",margin:"4px 0 10px"}}>{err}</div>}
          <div style={{display:"flex",gap:10,marginTop:10}}>
            <button className="btn cta liquidGlass-wrapper" disabled={busy||uploading} onClick={save} style={{flex:1}}>
              <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={14} className="spin"/>:<CheckCircle size={14}/>}Save changes</div>
            </button>
            <button className="btn ghost" onClick={onClose} style={{padding:"0 18px"}}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  </>);
}
