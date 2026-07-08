/* Host admin modal views for sailing — members/invites/audit, logo cropper +
   host editor, and the auto-grab discovery modal (LogoCropper is internal to
   HostEditModal). Reorg step 4: views/ module, mirroring
   sports/golf/src/views/. Verbatim from App.jsx. */

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { AlertCircle, BadgeCheck, CheckCircle, ChevronRight, ClipboardPaste, Clock, FileText, Link2, Loader2, Settings, Trash2, Upload, X } from "lucide-react";
import { dateKey } from "../util/date.js";
import { pascalSlug } from "../util/name.js";
import { iocFlag, IOC_ISO } from "../util/flag.js";
import { canonClass, classColor, classColorA, classLabel } from "../util/class.js";
import { hostRest, fetchHostMembers, fetchHostInvites, fetchHostAudit, logHostAudit, randToken, randShortCode, removeLogoBackground, MOCK_RESEARCH, mockResearchCompetitions, mockProbe } from "../data/hosts.js";
import { fetchProfileNames } from "../data/profiles.js";
import { SailingGlobe } from "./globe.jsx";

/* ═══════════════════════════════════════════════════════════════════════
   Host members / trust management modal
   ───────────────────────────────────────────────────────────────────────
   - Claim: first signed-in user with no members becomes Owner (pending verify)
   - Member list with role badges + active/pending status
   - Grant / Deny pending requests
   - Promote to Owner / Demote to Editor
   - Revoke membership (can't remove the last Owner; only Owner can remove Owner)
   - Create single-use, 7-day invite links
   - Audit trail
   ═══════════════════════════════════════════════════════════════════════ */
export function HostMembersModal({hostId,hostName,auth,myMembership,pendingClaims=[],pendingEventClaims=[],canVouch=false,onDecideClaim,onDecideEventClaim,onClose,onChanged,embedded=false,canManage=false}){
  const tok=auth?.token; const uid=auth?.user?.id;
  const[members,setMembers]=React.useState(null);
  const[invites,setInvites]=React.useState([]);
  const[audit,setAudit]=React.useState([]);
  const[memberNames,setMemberNames]=React.useState({});
  const[memberUsernames,setMemberUsernames]=React.useState({});
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");
  const[newInvite,setNewInvite]=React.useState(null); // {url,role}
  const[inviteRole,setInviteRole]=React.useState("editor");
  const[tab,setTab]=React.useState("members"); // members | claims | audit
  const[claimBusy,setClaimBusy]=React.useState(null); // claim id being decided

  const iAmOwner=(myMembership?.role==="owner"&&myMembership?.status==="active")||canManage;
  const iAmMember=(!!myMembership&&myMembership.status==="active")||canManage;
  const ownerCount=(members||[]).filter(m=>m.role==="owner"&&m.status==="active").length;

  const load=React.useCallback(async()=>{
    const[m,inv,a]=await Promise.all([
      fetchHostMembers(hostId,tok),
      fetchHostInvites(hostId,tok),
      fetchHostAudit(hostId,tok),
    ]);
    setMembers(m||[]); setInvites(inv||[]); setAudit(a||[]);
    const ids=[...new Set([...(m||[]).map(x=>x.user_id),...(a||[]).flatMap(x=>[x.actor_user_id,x.target_user_id])])].filter(Boolean);
    if(ids.length){ const {names,usernames}=await fetchProfileNames(ids,tok); setMemberNames(names); setMemberUsernames(usernames); }
  },[hostId,tok]);
  const displayName=(id)=>id?(memberNames[id]||`User ${id.slice(0,8)}`):"—";
  const usernameOf=(id)=>id?(memberUsernames[id]||null):null;
  React.useEffect(()=>{ load(); },[load]);

  const refresh=async()=>{ await load(); onChanged&&onChanged(); };

  // ── Claim host as first Owner ──
  const claim=async()=>{
    setErr("");setBusy(true);
    try{
      const r=await hostRest("host_members",{method:"POST",body:JSON.stringify({
        host_id:hostId,user_id:uid,role:"owner",status:"active",verified:false})},tok);
      if(!r) throw new Error("Couldn't claim this host.");
      await logHostAudit(hostId,uid,"claim",uid,"first owner",tok);
      await refresh();
    }catch(e){setErr(e.message||"Claim failed.");}
    finally{setBusy(false);}
  };

  // ── Grant / Deny a pending request ──
  const grant=async(m)=>{
    setBusy(true);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"PATCH",body:JSON.stringify({status:"active"})},tok);
    await logHostAudit(hostId,uid,"grant",m.user_id,m.role,tok);
    await refresh();setBusy(false);
  };
  const deny=async(m)=>{
    setBusy(true);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"DELETE"},tok);
    await logHostAudit(hostId,uid,"deny",m.user_id,null,tok);
    await refresh();setBusy(false);
  };
  // ── Promote / Demote ──
  const setMemberRole=async(m,role)=>{
    if(role!=="owner"&&m.role==="owner"&&ownerCount<=1){setErr("Can't demote the last owner.");return;}
    setBusy(true);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"PATCH",body:JSON.stringify({role})},tok);
    await logHostAudit(hostId,uid,role==="owner"?"promote":"demote",m.user_id,role,tok);
    await refresh();setBusy(false);
  };
  // ── Revoke ──
  const revoke=async(m)=>{
    if(m.role==="owner"&&!iAmOwner){setErr("Only an owner can remove another owner.");return;}
    if(m.role==="owner"&&ownerCount<=1){setErr("Can't remove the last owner.");return;}
    setBusy(true);
    await hostRest(`host_members?id=eq.${m.id}`,{method:"DELETE"},tok);
    await logHostAudit(hostId,uid,"revoke",m.user_id,m.role,tok);
    await refresh();setBusy(false);
  };
  // ── Create invite link (single use, 7 days) ──
  const createInvite=async()=>{
    setErr("");setBusy(true);
    try{
      const token=randToken();
      const shortCode=randShortCode();
      const expires=new Date(Date.now()+7*24*3600*1000).toISOString();
      const r=await hostRest("host_invites",{method:"POST",body:JSON.stringify({
        token,short_code:shortCode,host_id:hostId,role:inviteRole,created_by:uid,expires_at:expires})},tok);
      if(!r) throw new Error("Couldn't create invite.");
      await logHostAudit(hostId,uid,"invite",null,inviteRole,tok);
      const url=`${window.location.origin}${window.location.pathname}?invite=${token}`;
      setNewInvite({url,role:inviteRole,shortCode});
      await load();
    }catch(e){setErr(e.message||"Invite failed.");}
    finally{setBusy(false);}
  };
  const revokeInvite=async(t)=>{
    setBusy(true);
    await hostRest(`host_invites?token=eq.${encodeURIComponent(t)}`,{method:"DELETE"},tok);
    await load();setBusy(false);
  };
  const copy=(txt)=>{try{navigator.clipboard.writeText(txt);}catch{}};

  const shortId=(id)=>id?id.slice(0,8):"—";
  const RoleBadge=({role})=><span style={{fontSize:10,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",
    color:role==="owner"?"#7a5600":"var(--navy)",background:role==="owner"?"rgba(255,200,40,.22)":"var(--sky)",
    borderRadius:980,padding:"2px 9px"}}>{role}</span>;

  const pending=(members||[]).filter(m=>m.status==="pending");
  const active=(members||[]).filter(m=>m.status==="active");
  const noMembers=members!==null&&members.length===0;

  const body=(
        <div style={{padding:embedded?0:"18px 24px 24px",display:"flex",flexDirection:"column",gap:16}}>
          {err&&<div style={{background:"rgba(200,50,50,.1)",border:"1px solid rgba(200,50,50,.3)",borderRadius:10,padding:"9px 13px",fontSize:12.5,color:"#c0392b"}}>{err}</div>}

          {members===null&&<div style={{display:"flex",alignItems:"center",gap:8,color:"var(--mut)",fontSize:13}}><Loader2 size={15} className="spin"/>Loading members…</div>}

          {/* ── Claim panel (no members yet, I'm not a member) ── */}
          {noMembers&&!myMembership&&(
            <div style={{textAlign:"center",padding:"10px 0"}}>
              <p style={{margin:"0 0 6px",fontWeight:700,fontSize:15,color:"var(--navy)"}}>This host has no owner yet</p>
              <p style={{margin:"0 0 16px",fontSize:13,color:"var(--mut)",lineHeight:1.5}}>
                Claim <b>{hostName}</b> to become its first Owner. Your access will be activated once the AthLink team verifies your account.
              </p>
              <button className="btn cta liquidGlass-wrapper" style={{justifyContent:"center"}} disabled={busy} onClick={claim}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={15} className="spin"/>:<BadgeCheck size={15}/>}Claim as Owner</div>
              </button>
            </div>
          )}

          {/* ── My pending status ── */}
          {myMembership?.status==="pending"&&(
            <div style={{background:"rgba(255,149,0,.08)",border:"1px solid rgba(255,149,0,.3)",borderRadius:12,padding:"12px 15px",fontSize:13,color:"#a85c00"}}>
              <Clock size={14} style={{verticalAlign:"-2px",marginRight:6}}/>
              Your request to join is pending approval from an owner.
            </div>
          )}
          {myMembership&&myMembership.status==="active"&&!myMembership.verified&&!canManage&&(
            <div style={{background:"rgba(10,132,255,.07)",border:"1px solid rgba(10,132,255,.2)",borderRadius:12,padding:"12px 15px",fontSize:13,color:"var(--navy)"}}>
              You're an active <b>{myMembership.role}</b>, pending AthLink verification before import/edit access is enabled.
            </div>
          )}

          {/* ── Tabs (active members or managers) ── */}
          {iAmMember&&(<>
            <div className="seg" style={{alignSelf:"flex-start"}}>
              <button className={tab==="members"?"on":""} onClick={()=>setTab("members")}>Members</button>
              <button className={tab==="claims"?"on":""} onClick={()=>setTab("claims")}>Profile claims{pendingClaims.length>0?` (${pendingClaims.length})`:""}</button>
              <button className={tab==="eventclaims"?"on":""} onClick={()=>setTab("eventclaims")}>Competition claims{pendingEventClaims.length>0?` (${pendingEventClaims.length})`:""}</button>
              <button className={tab==="audit"?"on":""} onClick={()=>setTab("audit")}>Audit log</button>
            </div>

            {tab==="members"&&(<>
              {/* Pending requests */}
              {pending.length>0&&(
                <div>
                  <p className="seclabel" style={{margin:"0 0 8px"}}>Pending requests</p>
                  {pending.map(m=>(
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 0",borderBottom:"1px solid var(--line)"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{displayName(m.user_id)}{usernameOf(m.user_id)&&<span style={{marginLeft:6,fontSize:12,color:"var(--mut)",fontWeight:500}}>@{usernameOf(m.user_id)}</span>}</div>
                        <div style={{fontSize:11.5,color:"var(--mut)"}}>requested {m.role}</div>
                      </div>
                      <button className="btn green" style={{fontSize:12,padding:"5px 11px"}} disabled={busy} onClick={()=>grant(m)}><CheckCircle size={13}/>Grant</button>
                      <button className="btn ghost" style={{fontSize:12,padding:"5px 11px"}} disabled={busy} onClick={()=>deny(m)}>Deny</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Active members */}
              <div>
                <p className="seclabel" style={{margin:"0 0 8px"}}>Members</p>
                {active.map(m=>{
                  const isMe=m.user_id===uid;
                  return(
                    <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--line)"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{displayName(m.user_id)}{usernameOf(m.user_id)&&<span style={{marginLeft:6,fontSize:12,color:"var(--mut)",fontWeight:500}}>@{usernameOf(m.user_id)}</span>}{isMe?" (you)":""}{!m.verified&&<span style={{marginLeft:6,fontSize:10.5,color:"#a85c00",fontWeight:700}}>unverified</span>}</div>
                      </div>
                      <RoleBadge role={m.role}/>
                      {!isMe&&(
                        <>
                          {m.role==="editor"
                            ? <button className="btn ghost" style={{fontSize:11.5,padding:"4px 9px"}} disabled={busy} onClick={()=>setMemberRole(m,"owner")}>Make owner</button>
                            : (iAmOwner&&ownerCount>1&&<button className="btn ghost" style={{fontSize:11.5,padding:"4px 9px"}} disabled={busy} onClick={()=>setMemberRole(m,"editor")}>Make editor</button>)}
                          {!(m.role==="owner"&&(!iAmOwner||ownerCount<=1))&&(
                            <button className="delbtn" title="Remove" disabled={busy} onClick={()=>revoke(m)}><Trash2 size={15}/></button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Invites */}
              <div>
                <p className="seclabel" style={{margin:"0 0 8px"}}>Invite a co-admin</p>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <div className="seg">
                    <button className={inviteRole==="editor"?"on":""} onClick={()=>setInviteRole("editor")}>Editor</button>
                    <button className={inviteRole==="owner"?"on":""} onClick={()=>setInviteRole("owner")}>Owner</button>
                  </div>
                  <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"7px 13px"}} disabled={busy} onClick={createInvite}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Link2 size={14}/>Create invite link</div>
                  </button>
                </div>
                {newInvite&&(
                  <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:8,background:"var(--sky)",borderRadius:10,padding:"10px 13px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10.5,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:"var(--mut)",marginBottom:3}}>Invite link</div>
                        <input readOnly value={newInvite.url} style={{width:"100%",border:0,background:"none",font:"inherit",fontSize:11.5,color:"var(--navy)",outline:"none"}} onClick={e=>e.target.select()}/>
                      </div>
                      <button className="btn ghost" style={{fontSize:12,padding:"5px 11px",whiteSpace:"nowrap"}} onClick={()=>copy(newInvite.url)}><ClipboardPaste size={13}/>Copy link</button>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,borderTop:"1px solid var(--line)",paddingTop:8}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10.5,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:"var(--mut)",marginBottom:2}}>Short code</div>
                        <span style={{fontFamily:"monospace",fontSize:15,fontWeight:700,letterSpacing:".12em",color:"var(--navy)"}}>{newInvite.shortCode}</span>
                      </div>
                      <button className="btn ghost" style={{fontSize:12,padding:"5px 11px",whiteSpace:"nowrap"}} onClick={()=>copy(newInvite.shortCode||"")}><ClipboardPaste size={13}/>Copy code</button>
                    </div>
                  </div>
                )}
                {invites.filter(i=>!i.used_at&&new Date(i.expires_at)>new Date()).length>0&&(
                  <div style={{marginTop:10}}>
                    {invites.filter(i=>!i.used_at&&new Date(i.expires_at)>new Date()).map(i=>(
                      <div key={i.token} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,color:"var(--mut)",padding:"5px 0"}}>
                        <Link2 size={12}/>
                        <span style={{flex:1}}>{i.role} · expires {new Date(i.expires_at).toLocaleDateString()}</span>
                        <span style={{fontFamily:"monospace",fontWeight:700,fontSize:12,letterSpacing:".06em",color:"var(--navy)",marginRight:2}}>{i.short_code||"—"}</span>
                        <button className="btn ghost" style={{fontSize:11,padding:"3px 9px"}} onClick={()=>copy(`${window.location.origin}${window.location.pathname}?invite=${i.token}`)}>Copy link</button>
                        <button className="btn ghost" style={{fontSize:11,padding:"3px 9px"}} disabled={!i.short_code} onClick={()=>copy(i.short_code||"")}>Copy code</button>
                        <button className="delbtn" title="Revoke invite" onClick={()=>revokeInvite(i.token)}><X size={13}/></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>)}

            {tab==="claims"&&(
              <div>
                <p style={{fontSize:12.5,color:"var(--mut)",margin:"0 0 12px",lineHeight:1.5}}>
                  Athletes who've claimed a profile that appears in <b>{hostName}</b>'s results. Approving vouches for them and adds a verified badge.
                </p>
                {!canVouch&&<div style={{background:"rgba(255,149,0,.08)",border:"1px solid rgba(255,149,0,.3)",borderRadius:10,padding:"9px 13px",fontSize:12.5,color:"#a85c00",marginBottom:10}}>Your account must be verified before you can vouch for athletes.</div>}
                {pendingClaims.length===0&&<p style={{fontSize:13,color:"var(--mut)"}}>No pending profile claims for this host's athletes.</p>}
                {pendingClaims.map(c=>(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--line)"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:700,color:"var(--ink)"}}>{c.profile_name}</div>
                      <div style={{fontSize:11.5,color:"var(--mut)"}}>claimed by user {c.user_id?.slice(0,8)} · {new Date(c.created_at).toLocaleDateString()}</div>
                    </div>
                    <button className="btn green" style={{fontSize:12,padding:"5px 11px"}} disabled={!canVouch||claimBusy===c.id}
                      onClick={async()=>{setClaimBusy(c.id);await onDecideClaim(c,true);setClaimBusy(null);}}>
                      {claimBusy===c.id?<Loader2 size={13} className="spin"/>:<CheckCircle size={13}/>}Approve
                    </button>
                    <button className="btn ghost" style={{fontSize:12,padding:"5px 11px"}} disabled={!canVouch||claimBusy===c.id}
                      onClick={async()=>{setClaimBusy(c.id);await onDecideClaim(c,false);setClaimBusy(null);}}>Deny</button>
                  </div>
                ))}
              </div>
            )}

            {tab==="eventclaims"&&(
              <div>
                <p style={{fontSize:12.5,color:"var(--mut)",margin:"0 0 12px",lineHeight:1.5}}>
                  Competitions contributed by another host and attributed to <b>{hostName}</b> as organizer. Approving confirms <b>{hostName}</b> ran the event — it then appears in this portal.
                </p>
                {!canVouch&&<div style={{background:"rgba(255,149,0,.08)",border:"1px solid rgba(255,149,0,.3)",borderRadius:10,padding:"9px 13px",fontSize:12.5,color:"#a85c00",marginBottom:10}}>Your account must be verified before you can approve competition claims.</div>}
                {pendingEventClaims.length===0&&<p style={{fontSize:13,color:"var(--mut)"}}>No pending competition claims for this host.</p>}
                {pendingEventClaims.map(c=>(
                  <div key={c.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid var(--line)"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:700,color:"var(--ink)"}}>{c._eventName||"(event)"}</div>
                      <div style={{fontSize:11.5,color:"var(--mut)"}}>claimed by user {c.user_id?.slice(0,8)}{c.ts?` · ${new Date(c.ts).toLocaleDateString()}`:""}{c.detail?` · ${c.detail}`:""}</div>
                    </div>
                    <button className="btn green" style={{fontSize:12,padding:"5px 11px"}} disabled={!canVouch||claimBusy===c.id}
                      onClick={async()=>{setClaimBusy(c.id);await onDecideEventClaim(c,true);setClaimBusy(null);}}>
                      {claimBusy===c.id?<Loader2 size={13} className="spin"/>:<CheckCircle size={13}/>}Approve
                    </button>
                    <button className="btn ghost" style={{fontSize:12,padding:"5px 11px"}} disabled={!canVouch||claimBusy===c.id}
                      onClick={async()=>{setClaimBusy(c.id);await onDecideEventClaim(c,false);setClaimBusy(null);}}>Deny</button>
                  </div>
                ))}
              </div>
            )}

            {tab==="audit"&&(
              <div>
                {audit.length===0&&<p style={{fontSize:13,color:"var(--mut)"}}>No actions logged yet.</p>}
                {audit.map(a=>(
                  <div key={a.id} style={{display:"flex",gap:10,padding:"7px 0",borderBottom:"1px solid var(--line)",fontSize:12.5}}>
                    <span style={{fontWeight:700,color:"var(--navy)",minWidth:64,textTransform:"capitalize"}}>{a.action}</span>
                    <span style={{flex:1,color:"var(--mut)"}}>
                      by {displayName(a.actor_user_id)}{a.target_user_id?` → ${displayName(a.target_user_id)}`:""}{a.detail?` · ${a.detail}`:""}
                    </span>
                    <span style={{color:"var(--mut)",whiteSpace:"nowrap"}}>{new Date(a.ts).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
          </>)}
        </div>
  );
  if(embedded) return body;
  return(
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:560}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <BadgeCheck size={18}/>
          <h3 style={{flex:1}}>{hostName} — Members</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        {body}
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════════════════
   Host portal edit modal — tabbed: Details (name + location + globe) and
   Members (embedded member management). Owners/editors/dev use this to rename
   the host, set its location (→ globe by the title), and manage co-admins.
   ═══════════════════════════════════════════════════════════════════════ */
// Square pan + zoom cropper for host logos. The user drags to reposition and
// zooms so the logo sits centred; on "Use logo" it renders the visible square to
// a canvas and hands it back (onApply) — the modal then background-removes +
// uploads it. Viewport matches the globe column (200px); output is 512px.
export function LogoCropper({src,onCancel,onApply,busy}){
  const VP=200, OUT=512;
  const[nat,setNat]=React.useState(null);      // {w,h} once the image has loaded
  const[zoom,setZoom]=React.useState(1);
  const[off,setOff]=React.useState({x:0,y:0}); // pan offset from centre, viewport px
  const imgRef=React.useRef(null);
  const drag=React.useRef(null);
  React.useEffect(()=>{
    const i=new Image();
    i.onload=()=>{imgRef.current=i;setNat({w:i.naturalWidth,h:i.naturalHeight});};
    i.src=src;
    return ()=>{imgRef.current=null;};
  },[src]);
  const baseScale=nat?VP/Math.max(nat.w,nat.h):1;   // contain-fit: whole image fits, longer dim fills viewport
  const dScale=baseScale*zoom;
  const dispW=nat?nat.w*dScale:VP, dispH=nat?nat.h*dScale:VP;
  // Clamp pan for a given zoom. When a dimension is smaller than the viewport
  // (contain-fit letterboxing), lock it centred (range 0); once zoomed past
  // "cover" in that axis, clamp so no empty gap shows.
  const clampFor=(o,z)=>{
    if(!nat) return o;
    const ds=baseScale*z, dw=nat.w*ds, dh=nat.h*ds;
    const rx=Math.max(0,(dw-VP)/2), ry=Math.max(0,(dh-VP)/2);
    return {x:Math.max(-rx,Math.min(rx,o.x)), y:Math.max(-ry,Math.min(ry,o.y))};
  };
  const onDown=(e)=>{if(busy)return;e.preventDefault();drag.current={sx:e.clientX,sy:e.clientY,ox:off.x,oy:off.y};
    try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}};
  const onMove=(e)=>{if(!drag.current)return;
    setOff(clampFor({x:drag.current.ox+(e.clientX-drag.current.sx),y:drag.current.oy+(e.clientY-drag.current.sy)},zoom));};
  const onUp=()=>{drag.current=null;};
  const changeZoom=(z)=>{setZoom(z);setOff(o=>clampFor(o,z));};
  const apply=()=>{
    const img=imgRef.current; if(!img||!nat) return;
    const ds=baseScale*zoom;
    const x0=(VP-nat.w*ds)/2+off.x, y0=(VP-nat.h*ds)/2+off.y;   // image top-left in viewport coords
    const sx=(0-x0)/ds, sy=(0-y0)/ds, sSize=VP/ds;              // source rect (natural px) for the viewport window
    const c=document.createElement("canvas"); c.width=OUT; c.height=OUT;
    const g=c.getContext("2d"); g.imageSmoothingEnabled=true; g.imageSmoothingQuality="high";
    g.drawImage(img, sx, sy, sSize, sSize, 0,0,OUT,OUT);
    onApply(c);
  };
  const cropBtn={borderRadius:980,padding:"8px 12px",font:"inherit",fontSize:13,fontWeight:700,cursor:busy?"default":"pointer",flex:1,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6};
  return(
    <div style={{width:VP}}>
      <div style={{position:"relative",width:VP,height:VP,borderRadius:16,overflow:"hidden",
          background:"rgba(31,78,128,.06)",border:"1px solid rgba(31,78,128,.16)",touchAction:"none",cursor:busy?"default":"grab"}}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}>
        {nat
          ? <img src={src} alt="" draggable={false}
              style={{position:"absolute",width:dispW,height:dispH,left:(VP-dispW)/2+off.x,top:(VP-dispH)/2+off.y,userSelect:"none",pointerEvents:"none"}}/>
          : <div style={{position:"absolute",inset:0,display:"grid",placeItems:"center"}}><Loader2 size={18} className="spin" style={{color:"var(--navy2)"}}/></div>}
      </div>
      <input type="range" min="1" max="4" step="0.01" value={zoom} disabled={busy||!nat}
        onChange={e=>changeZoom(parseFloat(e.target.value))}
        style={{width:VP,marginTop:10,accentColor:"var(--navy2)",cursor:busy?"default":"pointer"}}/>
      <div style={{display:"flex",gap:8,marginTop:8}}>
        <button type="button" disabled={busy} onClick={onCancel}
          style={{...cropBtn,background:"rgba(255,255,255,.6)",border:"1px solid rgba(31,78,128,.16)",color:"var(--navy)"}}>Cancel</button>
        <button type="button" disabled={busy||!nat} onClick={apply}
          style={{...cropBtn,background:"var(--navy2)",border:"1px solid var(--navy2)",color:"#fff"}}>
          {busy?<Loader2 size={13} className="spin"/>:null}Use logo</button>
      </div>
    </div>
  );
}

export function HostEditModal({host,onSave,onSaveSlug,onUploadLogo,onClose,canManage,membersProps}){
  const[tab,setTab]=React.useState("details");
  const[name,setName]=React.useState(host?.name||"");
  const[country,setCountry]=React.useState(host?.country||"");
  const[slug,setSlug]=React.useState(host?.slug||pascalSlug(host?.name||""));
  const[slugErr,setSlugErr]=React.useState("");
  const[busy,setBusy]=React.useState(false);
  // Logo: `logo` holds the pending public URL (or null when removed); compared
  // against host.logo_url on save so we only send the key when it actually changed
  // (avoids clobbering). `cropSrc` is the object URL of a just-picked file being
  // cropped — while set, the cropper is shown in place of the preview.
  const[logo,setLogo]=React.useState(host?.logo_url||null);
  const[logoBusy,setLogoBusy]=React.useState(false);
  const[logoErr,setLogoErr]=React.useState("");
  const[cropSrc,setCropSrc]=React.useState(null);
  const iso=IOC_ISO[(country||"").toUpperCase()]||"";
  const onPickLogo=(e)=>{
    const file=e.target.files&&e.target.files[0]; e.target.value=""; // allow re-picking same file
    if(!file) return;
    if(!file.type.startsWith("image/")){setLogoErr("Please choose an image file (PNG or JPG).");return;}
    if(file.size>5*1024*1024){setLogoErr("Image is too large — keep it under 5 MB.");return;}
    setLogoErr("");
    setCropSrc(prev=>{ if(prev) URL.revokeObjectURL(prev); return URL.createObjectURL(file); });
  };
  const cancelCrop=()=>{ setCropSrc(prev=>{ if(prev) URL.revokeObjectURL(prev); return null; }); };
  // Cropper hands back a square canvas: background-remove (keep colours) → upload.
  const applyCrop=async(canvas)=>{
    setLogoErr(""); setLogoBusy(true);
    let url=null;
    try{ const blob=await removeLogoBackground(canvas); if(blob) url=await onUploadLogo?.(blob); }
    catch(err){ console.error("applyCrop",err); }
    setLogoBusy(false);
    if(!url){ setLogoErr("Couldn't upload — sign in and try again."); return; }  // don't wipe existing logo
    setLogo(url);
    cancelCrop();
  };
  const barStyle={width:"100%",border:"0",borderRadius:980,padding:"13px 18px",font:"inherit",fontSize:15,outline:"none",
    background:"rgba(255,255,255,.55)",backdropFilter:"blur(28px) saturate(195%)",WebkitBackdropFilter:"blur(28px) saturate(195%)",
    boxShadow:"inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.5),0 1px 3px rgba(0,0,0,.05)",transition:"box-shadow .16s"};
  const save=async()=>{
    setBusy(true); setSlugErr("");
    const patch={name:name.trim()||host.name,country:(country||"").toUpperCase()||null};
    if((logo||null)!==(host?.logo_url||null)) patch.logo_url=logo||null;  // only when changed
    await onSave(patch);
    // Public slug (URL). Saved separately so a "taken" clash can be reported.
    if(onSaveSlug&&(slug||"").trim()&&slug.trim()!==(host?.slug||pascalSlug(host?.name||""))){
      const r=await onSaveSlug(host.id,slug.trim());
      if(r&&r.error){setSlugErr(r.error);setBusy(false);return;}
    }
    setBusy(false); onClose();
  };
  return(
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:860}}>
        <div className="mhead" style={{padding:"20px 28px"}}>
          <Settings size={20}/><h3 style={{flex:1}}>Edit page</h3>
          <button className="x" onClick={onClose}><X size={16}/></button>
        </div>
        {canManage&&(
          <div className="seg" style={{margin:"18px 28px 0"}}>
            <button className={tab==="details"?"on":""} onClick={()=>setTab("details")}>Details</button>
            <button className={tab==="members"?"on":""} onClick={()=>setTab("members")}>Members</button>
          </div>
        )}
        <div style={{padding:"22px 28px 28px"}}>
          {tab==="details"&&(
            <div style={{display:"flex",gap:24,alignItems:"flex-start"}}>
              {/* Globe left — top aligns with name bar, bottom aligns with the buttons */}
              <div style={{flex:"0 0 200px"}}>
                {iso
                  ? <SailingGlobe countryData={{[iso]:1}} height={200} dark mini bare hostIso={iso}/>
                  : <div style={{width:200,height:200,borderRadius:16,background:"rgba(31,78,128,.06)",border:"1px dashed rgba(31,78,128,.25)",display:"grid",placeItems:"center",color:"var(--mut)",fontSize:12,textAlign:"center",padding:16}}>Enter a location code to show a globe</div>}
                {/* Logo uploader — square crop/centre, then background removed
                    (original colours kept) at upload time. Managers only. */}
                {canManage&&(
                  <div style={{marginTop:16}}>
                    <label style={{fontSize:12,fontWeight:700,color:"var(--mut)",display:"block",marginBottom:6}}>Logo</label>
                    {cropSrc
                      ? <LogoCropper src={cropSrc} busy={logoBusy} onCancel={cancelCrop} onApply={applyCrop}/>
                      : (<>
                          <label style={{display:"grid",placeItems:"center",width:200,height:200,borderRadius:16,overflow:"hidden",position:"relative",transition:".16s",
                              cursor:logoBusy?"default":"pointer",
                              background:logo?"rgba(31,78,128,.04)":"rgba(31,78,128,.06)",
                              border:logo?"1px solid rgba(31,78,128,.16)":"1px dashed rgba(31,78,128,.25)"}}>
                            {logoBusy
                              ? <Loader2 size={18} className="spin" style={{color:"var(--navy2)"}}/>
                              : logo
                                ? <img src={logo} alt="" style={{maxWidth:"86%",maxHeight:"86%",objectFit:"contain",background:"transparent"}}/>
                                : <span style={{color:"var(--mut)",fontSize:12,textAlign:"center",padding:12,lineHeight:1.45}}>Add logo<br/><span style={{fontSize:11,opacity:.8}}>PNG or JPG · background removed</span></span>}
                            <input type="file" accept="image/*" disabled={logoBusy} onChange={onPickLogo}
                              style={{position:"absolute",inset:0,opacity:0,cursor:"inherit"}}/>
                          </label>
                          {logo&&!logoBusy&&(
                            <button type="button" onClick={()=>{setLogo(null);setLogoErr("");}}
                              style={{marginTop:8,background:"none",border:0,padding:0,cursor:"pointer",color:"var(--mut)",fontSize:12,fontWeight:600}}>Remove logo</button>
                          )}
                        </>)}
                    {logoErr&&<div style={{fontSize:12,color:"#c0392b",marginTop:6,fontWeight:600,width:200}}>{logoErr}</div>}
                  </div>
                )}
              </div>
              {/* Right column: name → location (tight) → buttons (pushed to bottom = globe bottom) */}
              <div style={{flex:1,minWidth:0,minHeight:200,display:"flex",flexDirection:"column"}}>
                <div>
                  <label style={{fontSize:12,fontWeight:700,color:"var(--mut)",display:"block",marginBottom:6}}>Name</label>
                  <input value={name} onChange={e=>setName(e.target.value)} style={barStyle}/>
                </div>
                <div style={{marginTop:14}}>
                  <label style={{fontSize:12,fontWeight:700,color:"var(--mut)",display:"block",marginBottom:6}}>Public link <span style={{fontWeight:400}}>(username)</span></label>
                  <div style={{...barStyle,display:"flex",alignItems:"center",padding:0,overflow:"hidden"}}>
                    <span style={{padding:"13px 2px 13px 18px",fontSize:15,color:"var(--mut)",whiteSpace:"nowrap"}}>athlink.win/</span>
                    <input value={slug}
                      onChange={e=>{setSlug(e.target.value.replace(/[^A-Za-z0-9]/g,"").slice(0,30));setSlugErr("");}}
                      placeholder="HKSF"
                      style={{flex:1,minWidth:0,border:0,outline:"none",background:"transparent",font:"inherit",fontSize:15,padding:"13px 18px 13px 0"}}/>
                  </div>
                  {slugErr&&<div style={{fontSize:12,color:"#c0392b",marginTop:6,fontWeight:600}}>{slugErr}</div>}
                </div>
                <div style={{marginTop:14}}>
                  <label style={{fontSize:12,fontWeight:700,color:"var(--mut)",display:"block",marginBottom:6}}>Location <span style={{fontWeight:400}}>(IOC country code)</span></label>
                  <div style={{position:"relative"}}>
                    <input value={country} onChange={e=>setCountry(e.target.value.toUpperCase().slice(0,3))} placeholder="HKG" maxLength={3} style={{...barStyle,paddingRight:46}}/>
                    {iso&&<span style={{position:"absolute",right:18,top:"50%",transform:"translateY(-50%)",fontSize:17,pointerEvents:"none"}}>{iocFlag(country)}</span>}
                  </div>
                </div>
                <div style={{display:"flex",gap:10,marginTop:"auto",paddingTop:18}}>
                  <button className="btn ghost" style={{flex:1,justifyContent:"center"}} onClick={onClose}>Cancel</button>
                  <button className="btn cta liquidGlass-wrapper" style={{flex:2,justifyContent:"center"}} disabled={busy} onClick={save}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={15} className="spin"/>:<CheckCircle size={15}/>}Save changes</div>
                  </button>
                </div>
              </div>
            </div>
          )}
          {tab==="members"&&canManage&&membersProps&&(
            <HostMembersModal {...membersProps} embedded canManage/>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Host auto-grab — competition discovery + bulk-import view
   ───────────────────────────────────────────────────────────────────────
   Opened from the portal (header pill / post-signup CTA). Extends the host's
   dossier with competitions-mode research, probes each URL for parseability,
   dedups against events already on AthLink, and lets a verified host select
   past competitions to bulk-import. Import itself (Phase C) runs through
   onImport. Selection + needs-review persist into hosts.dossier via onSaveDossier.
   ═══════════════════════════════════════════════════════════════════════ */
export const _hg_norm=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
export const hgCompKey=c=>`${_hg_norm(c.name)}|${c.year||""}|${c.class?canonClass(c.class):""}`;
// Simple bounded promise pool — runs `tasks` (thunks) at most `conc` at a time.
export async function hgRunPool(tasks,conc){
  let i=0;
  const run=async()=>{ while(i<tasks.length){ const idx=i++; try{await tasks[idx]();}catch{} } };
  await Promise.all(Array.from({length:Math.min(conc,tasks.length)},run));
}
export function HostDiscoveryModal({host,events=[],auth,canImport,devMode,onSaveDossier,onClaimEvent,onImport,
    seedSites=null,importStatuses={},importSummary=null,needsReview=[],openReviewInitially=false,onReviewItem,onClose}){
  const dossier=host?.dossier||{};
  const[comps,setComps]=React.useState(()=>[...(dossier.competitions||[])]);
  const[probes,setProbes]=React.useState({});       // compKey → 'loading' | probe result
  const[extending,setExtending]=React.useState(false);
  const[selected,setSelected]=React.useState(()=>new Set(dossier.pending_import||[]));
  const[reviewOpen,setReviewOpen]=React.useState(!!openReviewInitially);
  const firstSave=React.useRef(true);
  const running=!!importSummary?.running;

  // Match a discovered competition against events already on AthLink (fuzzy name
  // + year from dateKey + class). Conservative: a class disagreement rejects the
  // match, so at worst a true dup shows as importable (fingerprint dedup at
  // import time is the backstop) rather than being wrongly hidden.
  const matchedEventFor=React.useCallback((c)=>{
    const cn=_hg_norm(c.name); if(!cn) return null;
    const cy=c.year?String(c.year):""; const cc=c.class?canonClass(c.class):"";
    return events.find(ev=>{
      const en=_hg_norm(ev.name); if(!en) return false;
      const nameHit=en===cn||(cn.length>=6&&(en.includes(cn)||cn.includes(en)));
      if(!nameHit) return false;
      const ey=(dateKey(ev.date)||"").slice(0,4);
      if(cy&&ey&&cy!==ey) return false;
      const ec=ev.cls?canonClass(ev.cls):"";
      if(cc&&ec&&cc!==ec) return false;
      return true;
    })||null;
  },[events]);

  // On open: extend the dossier via competitions-mode research, then probe every
  // URL (max 3 concurrent). Everything is best-effort. When opened from the
  // "Scrape website" tab, research each pasted site (seedSites); otherwise research
  // once by host name (+ any stored website).
  React.useEffect(()=>{ let cancelled=false;
    (async()=>{
      let list=[...(dossier.competitions||[])];
      const sites=(seedSites&&seedSites.length)
        ? seedSites
        : (list.length<20 ? [host.dossier?.identity?.website||""] : []);
      if(sites.length){
        setExtending(true);
        const cc=async(website)=>{
          try{
            let d;
            if(MOCK_RESEARCH) d=mockResearchCompetitions(host.name,host.type,host.country,website);
            else{
              const r=await fetch("/api/research_host",{method:"POST",headers:{"Content-Type":"application/json"},
                body:JSON.stringify({name:host.name,type:host.type,
                  country_hint:(host.country||"").length===3?host.country:"",
                  website:website||"",mode:"competitions"})});
              d=await r.json();
            }
            if(d&&d.ok&&Array.isArray(d.competitions)){
              const seen=new Set(list.map(hgCompKey));
              d.competitions.forEach(c=>{ const k=hgCompKey(c); if(!seen.has(k)){ seen.add(k); list.push(c); } });
            }
          }catch{ /* best-effort */ }
        };
        await hgRunPool(sites.map(s=>()=>cc(s)),3);
        if(!cancelled) setExtending(false);
      }
      if(cancelled) return;
      setComps(list);
      const tasks=list.filter(c=>c.url&&!matchedEventFor(c)).map(c=>async()=>{
        const k=hgCompKey(c);
        setProbes(p=>({...p,[k]:'loading'}));
        let res;
        try{
          if(MOCK_RESEARCH) res=mockProbe(c.url);
          else{ const r=await fetch("/api/sailing/parse_pdf",{method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({probe:true,url:c.url})}); res=await r.json(); }
        }catch{ res={ok:true,reachable:false}; }
        if(!cancelled) setProbes(p=>({...p,[k]:res}));
      });
      await hgRunPool(tasks,3);
    })();
    return ()=>{cancelled=true;};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  // Persist selection + extended list into hosts.dossier (debounced; skip mount).
  React.useEffect(()=>{
    if(firstSave.current){ firstSave.current=false; return; }
    if(MOCK_RESEARCH) return;   // smoke test: never write mock data to a real host
    const t=setTimeout(()=>{
      onSaveDossier?.({...dossier,competitions:comps,pending_import:[...selected]});
    },700);
    return ()=>clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selected,comps]);

  const statusOf=(c)=>{
    const ev=matchedEventFor(c);
    if(ev) return {kind:"claim",ev};
    if(!c.url) return {kind:"needfile"};
    const pr=probes[hgCompKey(c)];
    if(pr==='loading'||pr===undefined) return {kind:"checking"};
    if(pr.reachable===false) return {kind:"needfile"};
    if(pr.parseable===false) return {kind:"unsupported"};
    return {kind:"ready"};
  };
  const readyKeys=comps.filter(c=>statusOf(c).kind==="ready").map(hgCompKey);
  const selReady=readyKeys.filter(k=>selected.has(k));
  const allReadySelected=readyKeys.length>0&&selReady.length===readyKeys.length;
  const toggle=(k)=>setSelected(prev=>{ const n=new Set(prev); n.has(k)?n.delete(k):n.add(k); return n; });
  const toggleAll=()=>setSelected(prev=>{
    if(allReadySelected){ const n=new Set(prev); readyKeys.forEach(k=>n.delete(k)); return n; }
    const n=new Set(prev); readyKeys.forEach(k=>n.add(k)); return n;
  });
  const startImport=()=>{
    const rows=comps.filter(c=>statusOf(c).kind==="ready"&&selected.has(hgCompKey(c)));
    if(rows.length) onImport?.(rows);
  };

  // Group by year desc; undated last.
  const groups=React.useMemo(()=>{
    const m=new Map();
    comps.forEach(c=>{ const y=c.year||0; if(!m.has(y)) m.set(y,[]); m.get(y).push(c); });
    return [...m.entries()].sort((a,b)=>b[0]-a[0]);
  },[comps]);

  const badge=(st)=>{
    if(st.kind==="claim") return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,color:"var(--accent)"}}><BadgeCheck size={13}/>Already on AthLink</span>;
    if(st.kind==="checking") return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"var(--mut)"}}><Loader2 size={12} className="spin"/>Checking…</span>;
    if(st.kind==="needfile") return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"var(--mut)"}} title="No reachable results file — upload the PDF via Import."><FileText size={12}/>Needs the file</span>;
    if(st.kind==="unsupported") return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,color:"var(--mut)"}}><AlertCircle size={12}/>Unsupported format</span>;
    return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,color:"#2e9e5b"}}><CheckCircle size={12}/>Ready to import</span>;
  };
  // Live import-status chip (overrides the probe badge once import starts).
  const importChip=(s)=>{
    const map={
      queued:{t:"Queued",c:"var(--mut)",ic:<Clock size={12}/>},
      fetching:{t:"Fetching…",c:"var(--mut)",ic:<Loader2 size={12} className="spin"/>},
      parsing:{t:"Reading…",c:"var(--mut)",ic:<Loader2 size={12} className="spin"/>},
      parsed:{t:"Ready to review",c:"#2e9e5b",ic:<CheckCircle size={12}/>},
      imported:{t:"Imported",c:"#2e9e5b",ic:<CheckCircle size={12}/>},
      exists:{t:"Already existed",c:"var(--mut)",ic:<BadgeCheck size={12}/>},
      needsreview:{t:"Needs review",c:"#8a6400",ic:<AlertCircle size={12}/>},
      failed:{t:"Failed",c:"#b23b3b",ic:<AlertCircle size={12}/>},
    };
    const m=map[s]||map.queued;
    return <span style={{display:"inline-flex",alignItems:"center",gap:4,fontSize:11,fontWeight:600,color:m.c}}>{m.ic}{m.t}</span>;
  };
  const domainOf=u=>{ try{ return new URL(u).hostname.replace(/^www\./,""); }catch{ return ""; } };

  return(
    <div style={{position:"fixed",inset:0,zIndex:120,background:"rgba(12,24,44,.5)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",
      display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"5vh 16px 40px",overflowY:"auto"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"min(760px,100%)",background:"var(--paper)",borderRadius:20,border:"1px solid var(--line)",
        boxShadow:"0 30px 80px rgba(12,24,44,.35)",overflow:"hidden"}}>
        {/* Header */}
        <div style={{background:"linear-gradient(180deg,var(--navy2),var(--navy))",color:"#fff",padding:"18px 20px",position:"relative"}}>
          <button onClick={onClose} aria-label="Close" style={{position:"absolute",top:14,right:14,width:30,height:30,borderRadius:"50%",border:0,
            background:"rgba(255,255,255,.16)",color:"#fff",cursor:"pointer",display:"grid",placeItems:"center"}}><X size={16}/></button>
          <p style={{fontSize:11,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",opacity:.85,margin:0}}>Here's what we found</p>
          <h3 style={{margin:"3px 0 0",fontSize:20,fontWeight:800}}>Import {host?.name}'s past results</h3>
          <p style={{margin:"6px 0 0",fontSize:12.5,opacity:.9,lineHeight:1.45}}>We researched the web for competitions you've run. Pick the ones to bring onto AthLink — each is checked for whether we can read its results.</p>
        </div>

        {needsReview.length>0&&(
          <button onClick={()=>setReviewOpen(o=>!o)} style={{width:"100%",textAlign:"left",border:0,borderBottom:"1px solid var(--line)",cursor:"pointer",
            background:"rgba(200,146,11,.09)",padding:"11px 20px",fontSize:12.5,color:"#8a6400",display:"flex",alignItems:"center",gap:8}}>
            <AlertCircle size={15}/><b>{needsReview.length}</b> parse{needsReview.length>1?"s":""} need your review
            <span style={{marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:4}}>{reviewOpen?"Back to competitions":"Review"}<ChevronRight size={14} style={{transform:reviewOpen?"rotate(180deg)":"none"}}/></span>
          </button>
        )}
        {importSummary&&(importSummary.total>0)&&(
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 20px",borderBottom:"1px solid var(--line)",fontSize:12.5,color:"var(--navy)",background:"rgba(13,142,207,.05)"}}>
            {running?<Loader2 size={14} className="spin"/>:<CheckCircle size={14} color="#2e9e5b"/>}
            <b>{importSummary.done}</b> of <b>{importSummary.total}</b> processed{running?"…":" — done"}. You can close this; it resumes where you left off.
          </div>
        )}

        {/* Needs-review list */}
        {reviewOpen?(
          <div style={{maxHeight:"56vh",overflowY:"auto",padding:"4px 0"}}>
            {needsReview.length===0&&<p style={{textAlign:"center",color:"var(--mut)",fontSize:13,padding:"36px 20px"}}>Nothing needs review.</p>}
            {needsReview.map((it,i)=>(
              <div key={it.key||i} style={{display:"flex",alignItems:"center",gap:11,padding:"11px 20px",borderTop:"1px solid var(--line)"}}>
                <AlertCircle size={16} color="#c8920b" style={{flex:"none"}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13.5,fontWeight:600,color:"var(--navy)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.name}</div>
                  <div style={{fontSize:11,color:"var(--mut)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(it.reasons&&it.reasons.length)?it.reasons.join("; "):"Low-confidence parse — review before publishing."}</div>
                </div>
                <button className="btn cta" style={{fontSize:12,padding:"6px 12px",flex:"none"}} onClick={()=>onReviewItem?.(it)}>Review &amp; publish</button>
              </div>
            ))}
          </div>
        ):(<>
        {/* Select-all + count */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 20px",borderBottom:"1px solid var(--line)"}}>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,color:"var(--ink)",cursor:readyKeys.length&&!running?"pointer":"default",opacity:readyKeys.length?1:.5}}>
            <input type="checkbox" checked={allReadySelected} disabled={!readyKeys.length||running} onChange={toggleAll}/>
            Select all ready ({readyKeys.length})
          </label>
          {extending&&<span style={{marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:6,fontSize:12,color:"var(--mut)"}}><Loader2 size={13} className="spin"/>Finding more…</span>}
        </div>

        {/* Rows grouped by year */}
        <div style={{maxHeight:"52vh",overflowY:"auto",padding:"4px 0"}}>
          {comps.length===0&&!extending&&(
            <p style={{textAlign:"center",color:"var(--mut)",fontSize:13,padding:"36px 20px"}}>No past competitions found yet.</p>
          )}
          {groups.map(([year,rows])=>(
            <div key={year}>
              <p style={{fontSize:11,fontWeight:800,letterSpacing:".05em",color:"var(--mut)",padding:"10px 20px 4px",margin:0}}>{year||"Undated"}</p>
              {rows.map((c,i)=>{
                const k=hgCompKey(c); const st=statusOf(c); const on=selected.has(k);
                const impSt=importStatuses[k];
                const selectable=st.kind==="ready"&&!running&&!impSt;
                return(
                  <div key={k+i} style={{display:"flex",alignItems:"center",gap:11,padding:"9px 20px",borderTop:"1px solid var(--line)"}}>
                    <input type="checkbox" checked={on&&(selectable||!!impSt)} disabled={!selectable} onChange={()=>toggle(k)}
                      style={{flex:"none",cursor:selectable?"pointer":"not-allowed"}}/>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        <span style={{fontSize:13.5,fontWeight:600,color:"var(--navy)",overflow:"hidden",textOverflow:"ellipsis"}}>{c.name}</span>
                        {c.class&&<span style={{fontSize:10.5,fontWeight:600,padding:"1px 7px",borderRadius:980,color:classColor(c.class),background:classColorA(c.class,.12),border:`1px solid ${classColorA(c.class,.3)}`}}>{classLabel(c.class)}</span>}
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:9,margin:"3px 0 0",fontSize:11,color:"var(--mut)"}}>
                        {c.url&&<a href={c.url} target="_blank" rel="noreferrer noopener" style={{color:"var(--mut)",textDecoration:"none",display:"inline-flex",alignItems:"center",gap:4,maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                          <img alt="" width={12} height={12} src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domainOf(c.url))}&sz=32`} onError={e=>{e.currentTarget.style.display="none";}}/>{domainOf(c.url)}</a>}
                        {impSt?importChip(impSt):badge(st)}
                      </div>
                    </div>
                    {st.kind==="claim"&&(
                      <button className="btn ghost" style={{fontSize:12,padding:"5px 11px",flex:"none"}} onClick={()=>onClaimEvent?.(st.ev)}>Claim it</button>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        </>)}

        {/* Footer / import bar */}
        {!reviewOpen&&(
        <div style={{borderTop:"1px solid var(--line)",padding:"14px 20px",background:"rgba(255,255,255,.6)"}}>
          {!canImport?(
            <div>
              <button className="btn cta" disabled style={{width:"100%",justifyContent:"center",opacity:.55,cursor:"not-allowed"}}>
                <Clock size={15}/>Ready to import — pending verification
              </button>
              <p style={{fontSize:11.5,color:"var(--mut)",textAlign:"center",margin:"8px 0 0",lineHeight:1.45}}>
                An AthLink admin verifies new hosts before bulk imports go live. Your selection is saved{devMode?" (dev view bypasses this gate)":""}.
              </p>
            </div>
          ):(
            <button className="btn cta liquidGlass-wrapper" disabled={!selReady.length||running} onClick={startImport}
              style={{width:"100%",justifyContent:"center",...(selReady.length&&!running?{}:{opacity:.55,cursor:"not-allowed"})}}>
              <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/>
              <div className="liquidGlass-text">{running?<><Loader2 size={16} className="spin"/>Reading results…</>:<><Upload size={16}/>Import {selReady.length} selected</>}</div>
            </button>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
