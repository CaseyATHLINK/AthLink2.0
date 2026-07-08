/* Universal auth feature (reorg step 3, closed in step 4) — extracted VERBATIM
   from sports/sailing/src/App.jsx. Profile fetch/upsert + Google OAuth kick-off
   build on @athlink/core auth primitives and are sport-agnostic. The multi-step
   SignInModal gets its sport-specific pickers/branding/host-data helpers by
   DEPENDENCY INJECTION: makeSignInModal({...deps}) destructures them into
   identically-named closure vars, so the component body is unchanged; each
   sport binds it once (sailing: sports/sailing/src/views/auth.jsx). */

import React, { useState, useEffect, useRef } from "react";
import { AlertCircle, ArrowLeft, BadgeCheck, CheckCircle, ChevronRight, Clock, Link2, Loader2, Plus, Search, X } from "lucide-react";
import { SB_URL, SB_KEY, sbH, AUTH_BASE, authHeaders, sbGet, authSignUp, authSignIn } from "@athlink/core";

// profiles table: {user_id (uuid, pk), role, display_name, class_id, athlete_name}
export async function fetchProfile(userId,tok){
  if(!sbH) return null;
  try{
    const r=await fetch(`${SB_URL}/rest/v1/profiles?user_id=eq.${userId}&select=*`,{headers:authHeaders(tok)});
    if(!r.ok) return null; const rows=await r.json(); return rows[0]||null;
  }catch{return null;}
}
export async function upsertProfile(profile,tok){
  if(!sbH) return null;
  const r=await fetch(`${SB_URL}/rest/v1/profiles`,{method:"POST",
    headers:{...authHeaders(tok),"Prefer":"resolution=merge-duplicates,return=representation"},
    body:JSON.stringify(profile)});
  if(!r.ok){ const txt=await r.text().catch(()=>""); console.error("upsertProfile",r.status,txt); upsertProfile._lastError=txt||`HTTP ${r.status}`; return null; }
  upsertProfile._lastError=null; const rows=await r.json(); return rows[0]||null;
}
// Kick off Google OAuth — redirects to Google then back to the app.
// On return, the URL hash contains the session; AthLinkMVP picks it up on mount.
export function authGoogleOAuth(){
  if(!SB_URL||!SB_KEY) return;
  const redirectTo=encodeURIComponent(window.location.origin+window.location.pathname);
  window.location.href=`${SB_URL}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`;
}

export function makeSignInModal(deps){
const {ClassPicker,CountrySelect,classColor,classColorA,classLabel,iocFlag,hostById,hostRest,fetchInviteByShortCode,fetchInviteByToken,markInviteUsed,MOCK_RESEARCH,mockResearchIdentity}=deps;

/* ═══════════════════════════════════════════════════════════════════════
   Multi-step Sign-in / Sign-up modal
   ───────────────────────────────────────────────────────────────────────
   Sign-in path:  email+pw → done (or Google OAuth redirect)
   Sign-up path:  Step 1 credentials → Step 2 role → Step 3 details → done
   Google OAuth:  redirect → on return, check profile → if none → Step 2+3
   Guardian path: athlete under 16 → guardian email collected → pending note
   ═══════════════════════════════════════════════════════════════════════ */


function SignInModal({onClose,onAuthed,googleOnboarding,clubs=[],associations=[],federations=[],onCreateHost,onClaimHost,pendingInviteToken=null}){
  /* ── mode: "signin" | "signup" ── */
  // If arriving from Google OAuth with no profile yet, jump straight to role-pick
  const[mode,setMode]=React.useState(googleOnboarding?"signup":"signin");
  /* ── multi-step signup state ── */
  // Steps: 1=credentials 2=role 3=name(first/last)+athlete-extras 4=host "Find my club"
  const[step,setStep]=React.useState(googleOnboarding?2:1);
  /* step 1 */
  const[email,setEmail]=React.useState("");
  const[pw,setPw]=React.useState("");
  /* step 2 */
  const[role,setRole]=React.useState("athlete"); // athlete|association|club|federation
  /* step 3 — name (ALL roles use first + last now) */
  const[firstName,setFirstName]=React.useState("");
  const[lastName,setLastName]=React.useState("");
  const[birthYear,setBirthYear]=React.useState("");
  const[guardianEmail,setGuardianEmail]=React.useState("");
  /* step 4 — host "Find my club/association/federation" */
  const[hostSearch,setHostSearch]=React.useState("");
  const[selectedHostId,setSelectedHostId]=React.useState(null); // existing host being claimed
  const[addingNew,setAddingNew]=React.useState(false);          // new-host form open
  const[newHostName,setNewHostName]=React.useState("");
  const[classId,setClassId]=React.useState("29er");             // association only
  const[hostCountry,setHostCountry]=React.useState("HKG");      // IOC code, or "INT" for International (all host kinds)
  const[hostWebsite,setHostWebsite]=React.useState("");         // official results site (optional)
  // Derive the legacy HK|INT scope + the stored country from the unified country field.
  const hostScopeVal=hostCountry==="HKG"?"HK":"INT";            // HK org shows in HK section, else International
  const hostCountryVal=hostCountry==="INT"?null:hostCountry;    // "INT" = no specific country
  /* step 4 — host auto-grab ("Is this you?" research card) */
  const[research,setResearch]=React.useState(null);             // shaped identity dossier (found) or null
  const[researching,setResearching]=React.useState(false);      // lookup in flight
  const[researchDismissed,setResearchDismissed]=React.useState(false); // "Not us" → permanent for this signup
  const[confirmedDossier,setConfirmedDossier]=React.useState(null);    // stashed on "Yes, that's us"
  const researchedNameRef=React.useRef("");                     // last name we fired a lookup for (refire guard)
  const researchAbortRef=React.useRef(null);                    // AbortController → ignore stale responses
  /* shared */
  const[busy,setBusy]=React.useState(false);
  const[err,setErr]=React.useState("");
  const[info,setInfo]=React.useState("");
  /* invite redemption state */
  const[resolvedInvite,setResolvedInvite]=React.useState(null);  // fetched invite row (from link)
  const[inviteCodeInput,setInviteCodeInput]=React.useState("");   // 8-char code user types
  const[localInviteCtx,setLocalInviteCtx]=React.useState(null);  // {inv,token} from code lookup
  const[inviteCodeErr,setInviteCodeErr]=React.useState("");
  const[inviteCodeBusy,setInviteCodeBusy]=React.useState(false);

  // Invite mode: either link token or code-based context is present
  const isInviteMode=!!(pendingInviteToken||localInviteCtx);

  // On mount: if arriving via invite link, pre-fetch the invite row (anon key)
  React.useEffect(()=>{
    if(!pendingInviteToken) return;
    setMode("signup"); setStep(1);
    (async()=>{
      const rows=await fetchInviteByToken(pendingInviteToken,null);
      const inv=rows&&rows[0];
      if(inv&&!inv.used_at&&new Date(inv.expires_at)>new Date()) setResolvedInvite(inv);
    })();
  },[pendingInviteToken]);

  const curYear=new Date().getFullYear();
  const athleteAge=birthYear&&/^\d{4}$/.test(birthYear)?curYear-parseInt(birthYear):null;
  const isMinor=athleteAge!==null&&athleteAge<16;

  const fullNameStr=`${firstName.trim()} ${lastName.trim()}`.trim();
  const fallbackName=fullNameStr||email.split("@")[0];
  const isHost=role!=="athlete";

  // Which existing hosts to show in the "Find my ___" search, by role.
  const hostPool=role==="club"?clubs:role==="federation"?federations:associations;
  const hostKind=role==="club"?"club":role==="federation"?"federation":"association";
  const filteredHosts=hostPool.filter(h=>!hostSearch.trim()||h.name.toLowerCase().includes(hostSearch.toLowerCase()));

  /* ── helpers ── */
  const resetToSignin=()=>{setMode("signin");setStep(1);setErr("");setInfo("");};

  const step1Valid=mode==="signin"?(email.trim()&&pw):(email.trim()&&pw.length>=8);
  const step3Valid=firstName.trim()&&lastName.trim()&&(role==="athlete"?(isMinor?guardianEmail.trim():true):true);
  const step4Valid=addingNew?newHostName.trim():!!selectedHostId;

  /* ── host auto-grab: best-effort web research → "Is this you?" card ──
     Fires ONE lookup per distinct name (guarded by researchedNameRef, exactly
     like the preview enrichment effect's item._enriched guard), on 800ms
     typing-stop debounce OR name-field blur. Stale responses are ignored via an
     AbortController. Signup NEVER blocks on this — every failure is silent. */
  const runResearch=(raw)=>{
    const nm=(raw||"").trim();
    if(!addingNew||researchDismissed||nm.length<4) return;
    if(researchedNameRef.current===nm) return;          // already looked up this exact name
    researchedNameRef.current=nm;
    setConfirmedDossier(null);                           // name changed → prior confirmation is stale
    try{researchAbortRef.current?.abort();}catch{}       // drop any in-flight lookup
    const ac=new AbortController(); researchAbortRef.current=ac;
    setResearching(true); setResearch(null);
    (async()=>{
      const hint=(hostCountry&&hostCountry!=="INT"&&hostCountry.length===3)?hostCountry:"";
      try{
        let d;
        if(MOCK_RESEARCH){ d=mockResearchIdentity(nm,hostKind,hint); }
        else{
          const r=await fetch("/api/research_host",{method:"POST",
            headers:{"Content-Type":"application/json"},signal:ac.signal,
            body:JSON.stringify({name:nm,type:hostKind,country_hint:hint,
              website:hostWebsite.trim()||"",mode:"identity"})});
          d=await r.json();
        }
        if(ac.signal.aborted) return;                    // superseded by a newer name
        setResearch(d&&d.ok&&d.found?d:null);            // only show a confident hit
      }catch(e){ if(e?.name!=="AbortError") setResearch(null); }  // silent — never break signup
      finally{ if(!ac.signal.aborted) setResearching(false); }
    })();
  };
  React.useEffect(()=>{
    if(!addingNew||researchDismissed) return;
    const nm=newHostName.trim();
    if(nm.length<4){ setResearch(null); researchedNameRef.current=""; return; }
    if(researchedNameRef.current===nm) return;
    const t=setTimeout(()=>runResearch(nm),800);
    return ()=>clearTimeout(t);
  },[newHostName,addingNew,researchDismissed,hostKind]);
  // "Yes, that's us" → stash the dossier for the hosts insert + pre-fill fields.
  const acceptResearch=()=>{
    if(!research) return;
    setConfirmedDossier({
      identity:{official_name:research.official_name||null,acronym:research.acronym||null,
        website:research.website||null,country:research.country||null,
        classes:research.classes||[],blurb:research.blurb||null},
      competitions:research.competitions||[],
      sources:research.sources||[],
      fetched_at:new Date().toISOString(),
      confirmed:true,
    });
    if(research.country) setHostCountry(research.country);           // pre-fill the country field
    if(research.website&&!hostWebsite.trim()) setHostWebsite(research.website);  // pre-fill results site
  };
  // "Not us" → dismiss permanently for this signup; everything stays manual.
  const dismissResearch=()=>{ setResearchDismissed(true); setResearch(null); setConfirmedDossier(null); };

  /* ── apply invite code (step 4 fast-path) ── */
  const applyInviteCode=async()=>{
    const code=inviteCodeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
    if(code.length<8){setInviteCodeErr("Enter the full 8-character code from your invitation.");return;}
    setInviteCodeBusy(true);setInviteCodeErr("");
    try{
      const rows=await fetchInviteByShortCode(code,null);
      if(rows&&rows.length>0){
        const inv=rows[0];
        if(inv.used_at){setInviteCodeErr("This invite code has already been used.");return;}
        if(new Date(inv.expires_at)<new Date()){setInviteCodeErr("This invite code has expired.");return;}
        setLocalInviteCtx({inv,token:inv.token});
      } else {
        setInviteCodeErr("That code wasn't found. Check it and try again, or ask for the invite link instead.");
      }
    }catch{
      setInviteCodeErr("Couldn't validate that code. Please try again.");
    }finally{setInviteCodeBusy(false);}
  };

  /* ── sign-in submit ── */
  const doSignIn=async()=>{
    setErr("");setBusy(true);
    try{
      if(!AUTH_BASE) throw new Error("Auth not configured.");
      const d=await authSignIn(email.trim(),pw);
      const tok=d.access_token;const user=d.user;
      const prof=await fetchProfile(user.id,tok)||{role:"guest"};
      onAuthed({token:tok,user,profile:prof});
    }catch(e){setErr(e.message||"Sign-in failed.");}
    finally{setBusy(false);}
  };

  /* ── final sign-up submit ── */
  // Athletes finish at step 3; hosts finish at step 4 (after Find-my-club).
  const doSignUp=async()=>{
    setErr("");setBusy(true);
    try{
      if(!AUTH_BASE) throw new Error("Auth not configured.");
      // Obtain a session: Google path already has one; email path signs up now.
      let tok,user;
      if(googleOnboarding){
        tok=googleOnboarding.token; user=googleOnboarding.user;
      } else {
        const d=await authSignUp(email.trim(),pw);
        tok=d.access_token||d.session?.access_token;
        user=d.user||d;
        if(!tok){
          setInfo("Account created — check your email to confirm, then sign in.");
          resetToSignin();setBusy(false);return;
        }
      }

      // ── Write the profile row (all roles capture first/last now) ──
      const profilePayload={user_id:user.id,role,
        display_name:fallbackName,
        class_id:role==="association"?classId:null,
        athlete_name:role==="athlete"?fullNameStr||null:null,
        first_name:firstName.trim()||null,
        last_name:lastName.trim()||null};
      if(role==="athlete"&&birthYear) profilePayload.birth_year=parseInt(birthYear);
      if(role==="athlete"&&isMinor&&guardianEmail.trim()){profilePayload.guardian_pending=true;profilePayload.guardian_email=guardianEmail.trim();}
      await upsertProfile(profilePayload,tok);

      // ── Athlete: minor guardian path or straight in ──
      if(role==="athlete"){
        if(isMinor&&guardianEmail.trim()){
          setInfo(`Guardian consent email sent to ${guardianEmail.trim()}. Profile activates once approved.`);
          setTimeout(onClose,5000);setBusy(false);return;
        }
        onAuthed({token:tok,user,profile:profilePayload});return;
      }

      // ── Invite path: link token or code → immediate verified access ──
      const activeInvRow=resolvedInvite||localInviteCtx?.inv;
      if(activeInvRow){
        // Re-validate with the user's token (RLS-safe) before committing.
        let inv=activeInvRow;
        const recheck=await fetchInviteByToken(inv.token,tok);
        if(recheck&&recheck[0]) inv=recheck[0];
        if(!inv||inv.used_at||new Date(inv.expires_at)<new Date())
          throw new Error("This invitation is no longer valid. Ask your host admin to send a new one.");
        // Profile role mirrors the host type (club / association / federation).
        const hostRows=await sbGet(`hosts?id=eq.${encodeURIComponent(inv.host_id)}&select=type`);
        const hostType=hostRows?.[0]?.type||hostById(inv.host_id)?.type||"club";
        profilePayload.role=hostType;
        delete profilePayload.birth_year; delete profilePayload.guardian_pending; delete profilePayload.guardian_email;
        profilePayload.athlete_name=null; profilePayload.class_id=hostType==="association"?(hostById(inv.host_id)?.cls||null):null;
        await upsertProfile(profilePayload,tok);
        // Create membership: verified:true, active — immediate full access.
        await hostRest("host_members",{method:"POST",
          headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
          body:JSON.stringify({host_id:inv.host_id,user_id:user.id,role:inv.role,status:"active",verified:true})},tok);
        await markInviteUsed(inv.token,user.id,tok);
        onAuthed({token:tok,user,profile:{...profilePayload,role:hostType}});
        return;
      }

      // ── Host: claim existing OR create new → pending Owner (guest access) ──
      let hostId=selectedHostId;
      if(addingNew){
        const created=await onCreateHost?.({
          type:hostKind,scope:hostScopeVal,name:newHostName.trim(),
          cls:hostKind==="association"?classId:null,
          country:hostCountryVal,
          website:hostWebsite.trim()||null,     // official results site (scopes discovery)
          dossier:confirmedDossier||null,       // host auto-grab: confirmed "Is this you?" research
        },tok);
        if(!created?.id) throw new Error("Couldn't create the host page.");
        hostId=created.id;
      }
      if(!hostId) throw new Error("Please select or add a host.");
      // Register the user as Owner, status active but verified=false (gated → guest UX).
      await onClaimHost?.(hostId,user.id,tok);

      // Sign them in as their (pending) profile; UI stays guest-level until verified.
      onAuthed({token:tok,user,profile:profilePayload,pendingHostId:hostId});
    }catch(e){setErr(e.message||"Sign-up failed.");}
    finally{setBusy(false);}
  };

  /* ── Google OAuth ── */
  const doGoogle=()=>{
    if(!SB_URL||!SB_KEY){setErr("Auth not configured.");return;}
    authGoogleOAuth();
  };

  /* ── input style ── */
  const F={width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"11px 13px",
    font:"inherit",fontSize:14,background:"rgba(255,255,255,.82)",outline:"none",
    transition:"box-shadow .15s",marginBottom:0};
  const FW=(extra={})=>({...F,...extra});
  const Label=({children})=><p style={{fontSize:11.5,fontWeight:700,color:"var(--mut)",letterSpacing:".05em",textTransform:"uppercase",margin:"0 0 6px"}}>{children}</p>;

  /* ── role option cards ── */
  const RoleCard=({id,label,desc,icon})=>{
    const on=role===id;
    return(
      <button type="button" onClick={()=>setRole(id)}
        style={{flex:"1 1 140px",border:"1.5px solid "+(on?"var(--accent)":"var(--line)"),
          background:on?"rgba(10,132,255,.08)":"rgba(255,255,255,.6)",
          backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
          borderRadius:14,padding:"14px 12px",cursor:"pointer",textAlign:"left",transition:".15s",
          boxShadow:on?"0 0 0 3px var(--halo)":"none"}}>
        <div style={{fontSize:22,marginBottom:6}}>{icon}</div>
        <div style={{fontWeight:700,fontSize:14,color:on?"var(--accent)":"var(--navy)"}}>{label}</div>
        <div style={{fontSize:12,color:"var(--mut)",marginTop:3,lineHeight:1.4}}>{desc}</div>
      </button>
    );
  };

  /* ── progress bar (athletes = 3 steps, hosts = 4) ── */
  const totalSteps=isInviteMode?2:isHost?4:3;
  const pct=mode==="signup"?Math.round(((step-1)/(totalSteps-1))*100):0;

  return(
    <div className="ov" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}
        style={{maxWidth:440,overflow:"visible"}}>

        {/* ── Header ── */}
        <div className="mhead" style={{flexDirection:"column",alignItems:"stretch",gap:0,padding:"20px 24px 0"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{flex:1}}>
              <p style={{margin:0,fontSize:11,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:"rgba(255,255,255,.55)"}}>
                {isInviteMode&&mode==="signup"?(step===1?"Accept invitation":"Your details"):mode==="signin"?"Welcome back":step===1?"Create account":step===2?"Who are you?":step===3?"Your name":hostKind==="club"?"Find your club":hostKind==="federation"?"Find your federation":"Find your association"}
              </p>
              <h3 style={{marginTop:2}}>
                {isInviteMode&&mode==="signup"?(step===1?"Create your account":"Complete your profile"):mode==="signin"?"Sign in to AthLink":step===1?"Get started":step===2?"Choose your role":step===3?(isHost?"Your details":"Almost done"):"Link your club"}
              </h3>
            </div>
            <button className="x" onClick={onClose}><X size={16}/></button>
          </div>
          {/* progress bar — only during signup after step 1 */}
          {mode==="signup"&&(
            <div style={{marginTop:14,height:3,borderRadius:3,background:"rgba(255,255,255,.18)",overflow:"hidden"}}>
              <div style={{height:"100%",width:`${pct}%`,background:"rgba(255,255,255,.75)",borderRadius:3,transition:"width .4s cubic-bezier(.4,0,.2,1)"}}/>
            </div>
          )}
          <div style={{height:20}}/>
        </div>

        {/* ── Body ── */}
        <div style={{padding:"12px 24px 26px",display:"flex",flexDirection:"column",gap:15}}>

          {err&&<div style={{background:"rgba(200,50,50,.1)",border:"1px solid rgba(200,50,50,.3)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#c0392b",display:"flex",alignItems:"center",gap:8}}><AlertCircle size={14} style={{flex:"none"}}/>{err}</div>}
          {info&&<div style={{background:"rgba(10,132,255,.08)",border:"1px solid rgba(10,132,255,.2)",borderRadius:10,padding:"10px 14px",fontSize:13,color:"var(--accent)"}}>{info}</div>}

          {/* ── Invite banner: LINK invites only (code invites show their own banner at step 4) ── */}
          {(resolvedInvite||pendingInviteToken)&&!localInviteCtx&&mode==="signup"&&(
            <div style={{background:"rgba(80,180,100,.1)",border:"1px solid rgba(80,180,100,.35)",borderRadius:12,padding:"12px 15px",display:"flex",alignItems:"flex-start",gap:10}}>
              <BadgeCheck size={16} style={{flex:"none",marginTop:1,color:"#3a9e55"}}/>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:"#2a7a3e",marginBottom:2}}>You have an invitation</div>
                {resolvedInvite
                  ? <div style={{fontSize:12.5,color:"#3a7048",lineHeight:1.45}}>
                      Joining as <b>{resolvedInvite.role}</b>. Create your account below — you'll have immediate host access once done.
                    </div>
                  : <div style={{fontSize:12.5,color:"#3a7048",lineHeight:1.45}}>
                      Complete sign-up below to accept your invitation and get host access.
                    </div>}
              </div>
            </div>
          )}

          {/* ════ SIGN-IN ════ */}
          {mode==="signin"&&(<>
            {/* Google */}
            <button type="button" onClick={doGoogle} disabled={busy}
              style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                border:"1px solid var(--line)",borderRadius:10,padding:"11px",background:"rgba(255,255,255,.82)",
                backdropFilter:"blur(20px)",cursor:"pointer",fontSize:14,fontWeight:600,color:"var(--navy)",transition:".15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.96)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.82)"}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
              Continue with Google
            </button>

            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,height:1,background:"var(--line)"}}/>
              <span style={{fontSize:11.5,fontWeight:700,color:"var(--mut)",letterSpacing:".04em"}}>OR</span>
              <div style={{flex:1,height:1,background:"var(--line)"}}/>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div><Label>Email</Label>
                <input style={FW()} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
              </div>
              <div><Label>Password</Label>
                <input style={FW()} type="password" placeholder="••••••••" value={pw} onChange={e=>setPw(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}
                  onKeyDown={e=>{if(e.key==="Enter"&&email&&pw)doSignIn();}}/>
              </div>
            </div>

            <button className="btn cta liquidGlass-wrapper" style={{width:"100%",justifyContent:"center"}}
              disabled={busy||!email.trim()||!pw} onClick={doSignIn}>
              <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busy?<Loader2 size={15} className="spin"/>:null}Sign in</div>
            </button>

            <p style={{fontSize:13,color:"var(--mut)",textAlign:"center",margin:0}}>
              No account?{" "}
              <button type="button" onClick={()=>{setMode("signup");setStep(1);setErr("");}}
                style={{border:0,background:"none",color:"var(--accent)",fontWeight:700,cursor:"pointer",fontSize:13}}>
                Create one
              </button>
            </p>
          </>)}

          {/* ════ SIGN-UP STEP 1: credentials ════ */}
          {mode==="signup"&&step===1&&(<>
            <button type="button" onClick={doGoogle} disabled={busy}
              style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:10,
                border:"1px solid var(--line)",borderRadius:10,padding:"11px",background:"rgba(255,255,255,.82)",
                backdropFilter:"blur(20px)",cursor:"pointer",fontSize:14,fontWeight:600,color:"var(--navy)",transition:".15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.96)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.82)"}>
              <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="none" d="M0 0h48v48H0z"/></svg>
              Continue with Google
            </button>

            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,height:1,background:"var(--line)"}}/>
              <span style={{fontSize:11.5,fontWeight:700,color:"var(--mut)",letterSpacing:".04em"}}>OR</span>
              <div style={{flex:1,height:1,background:"var(--line)"}}/>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div><Label>Email</Label>
                <input style={FW()} type="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
              </div>
              <div><Label>Password <span style={{fontWeight:400,textTransform:"none",fontSize:10.5}}>(min 8 characters)</span></Label>
                <input style={FW()} type="password" placeholder="Choose a password" value={pw} onChange={e=>setPw(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}
                  onKeyDown={e=>{if(e.key==="Enter"&&step1Valid)setStep(2);}}/>
              </div>
            </div>

            <button className="btn cta liquidGlass-wrapper" style={{width:"100%",justifyContent:"center"}}
              disabled={busy||!step1Valid} onClick={()=>{setErr("");setStep(isInviteMode?3:2);}}>
              <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Continue <ChevronRight size={16}/></div>
            </button>

            <p style={{fontSize:13,color:"var(--mut)",textAlign:"center",margin:0}}>
              Already have an account?{" "}
              <button type="button" onClick={resetToSignin}
                style={{border:0,background:"none",color:"var(--accent)",fontWeight:700,cursor:"pointer",fontSize:13}}>
                Sign in
              </button>
            </p>
          </>)}

          {/* ════ SIGN-UP STEP 2: role ════ */}
          {mode==="signup"&&step===2&&(<>
            <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
              <RoleCard id="athlete" label="Athlete" icon="🏆" desc="Build your profile from your results."/>
              <RoleCard id="association" label="Association" icon="⚓" desc="Manage results for your class association."/>
              <RoleCard id="club" label="Club" icon="🌊" desc="Host competitions for your yacht club."/>
              <RoleCard id="federation" label="Federation" icon="🏳️" desc="Govern your national sailing federation."/>
            </div>

            <div style={{display:"flex",gap:10}}>
              <button className="btn ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>setStep(1)}>
                <ArrowLeft size={15}/>Back
              </button>
              <button className="btn cta liquidGlass-wrapper" style={{flex:2,justifyContent:"center"}} disabled={busy} onClick={()=>{setErr("");setStep(3);}}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Continue <ChevronRight size={16}/></div>
              </button>
            </div>
          </>)}

          {/* ════ SIGN-UP STEP 3: name (all roles) + athlete extras ════ */}
          {mode==="signup"&&step===3&&(<>
            <div style={{display:"flex",gap:10}}>
              <div style={{flex:1}}>
                <Label>First name</Label>
                <input style={FW()} placeholder="Casey" value={firstName} onChange={e=>setFirstName(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
              </div>
              <div style={{flex:1}}>
                <Label>Last name</Label>
                <input style={FW()} placeholder="Smith" value={lastName} onChange={e=>setLastName(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
              </div>
            </div>

            {/* Athlete-only extras — never shown in invite mode (host co-admin) */}
            {role==="athlete"&&!isInviteMode&&(<>
              <p style={{fontSize:12,color:"var(--mut)",margin:"-4px 0 0",lineHeight:1.5}}>
                Use your name <b>exactly as it appears in results</b> — this is how AthLink links your profile to your race history.
              </p>
              <div>
                <Label>Year of birth</Label>
                <input style={FW({maxWidth:140})} type="number" placeholder="e.g. 2003" min="1930" max={curYear}
                  value={birthYear} onChange={e=>setBirthYear(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
                {athleteAge!==null&&<span style={{marginLeft:10,fontSize:13,color:"var(--mut)",fontWeight:600}}>Age {athleteAge}</span>}
              </div>
              {isMinor&&(
                <div style={{background:"rgba(255,149,0,.08)",border:"1px solid rgba(255,149,0,.3)",borderRadius:12,padding:"14px 16px"}}>
                  <p style={{margin:"0 0 10px",fontSize:13,fontWeight:700,color:"#a85c00",display:"flex",alignItems:"center",gap:7}}>
                    <Clock size={14}/>Guardian approval required
                  </p>
                  <p style={{margin:"0 0 10px",fontSize:12.5,color:"#a85c00",lineHeight:1.5}}>
                    Athletes under 16 need a parent or guardian to approve their profile before it goes live. Enter their email and we'll send an approval link.
                  </p>
                  <Label>Guardian email</Label>
                  <input style={FW()} type="email" placeholder="parent@example.com" value={guardianEmail}
                    onChange={e=>setGuardianEmail(e.target.value)}
                    onFocus={e=>e.target.style.boxShadow="0 0 0 4px rgba(255,149,0,.3)"} onBlur={e=>e.target.style.boxShadow="none"}/>
                </div>
              )}
            </>)}

            <div style={{display:"flex",gap:10}}>
              <button className="btn ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>setStep(isInviteMode?1:2)}>
                <ArrowLeft size={15}/>Back
              </button>
              {/* Athlete finishes here; host advances to step 4; invite mode finishes here */}
              {(role==="athlete"||isInviteMode)
                ? <button className="btn cta liquidGlass-wrapper" style={{flex:2,justifyContent:"center"}} disabled={busy||!step3Valid} onClick={doSignUp}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">
                    {busy?<Loader2 size={15} className="spin"/>:null}
                    {isInviteMode?"Accept invitation":isMinor?"Send guardian approval":"Create account"}
                    </div>
                  </button>
                : <button className="btn cta liquidGlass-wrapper" style={{flex:2,justifyContent:"center"}} disabled={busy||!step3Valid} onClick={()=>{setErr("");setStep(4);}}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Continue <ChevronRight size={16}/></div>
                  </button>}
            </div>
          </>)}

          {/* ════ SIGN-UP STEP 4: "Find my club/association/federation" (hosts) ════ */}
          {mode==="signup"&&step===4&&isHost&&(<>

            {/* ── Invite code fast-path (top of step 4) ── */}
            {!localInviteCtx&&!addingNew&&(
              <div style={{background:"rgba(10,132,255,.05)",border:"1px solid rgba(10,132,255,.18)",borderRadius:12,padding:"13px 15px"}}>
                <p style={{margin:"0 0 9px",fontWeight:700,fontSize:13,color:"var(--navy)",display:"flex",alignItems:"center",gap:7}}>
                  <Link2 size={14}/>Got an invite code?
                </p>
                <div style={{display:"flex",gap:8}}>
                  <input style={{flex:1,border:"1px solid var(--line)",borderRadius:8,padding:"9px 12px",font:"inherit",fontSize:13.5,
                    letterSpacing:".08em",textTransform:"uppercase",outline:"none",fontFamily:"monospace",background:"rgba(255,255,255,.85)"}}
                    placeholder="XXXXXXXX" maxLength={8} value={inviteCodeInput}
                    onChange={e=>{ setInviteCodeInput(e.target.value.toUpperCase().replace(/[^A-Za-z0-9]/g,"")); setInviteCodeErr(""); }}
                    onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}
                    onKeyDown={async e=>{ if(e.key==="Enter"&&inviteCodeInput.length>=6) await applyInviteCode(); }}/>
                  <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"9px 14px",whiteSpace:"nowrap"}}
                    disabled={inviteCodeBusy||inviteCodeInput.length<6} onClick={applyInviteCode}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{inviteCodeBusy?<Loader2 size={13} className="spin"/>:null}Apply</div>
                  </button>
                </div>
                {inviteCodeErr&&<p style={{margin:"7px 0 0",fontSize:12,color:"#c0392b"}}>{inviteCodeErr}</p>}
              </div>
            )}
            {/* Accepted code: show success and skip the search UI */}
            {localInviteCtx&&(
              <div style={{background:"rgba(80,180,100,.1)",border:"1px solid rgba(80,180,100,.35)",borderRadius:12,padding:"13px 15px",display:"flex",alignItems:"center",gap:10}}>
                <CheckCircle size={16} style={{flex:"none",color:"#3a9e55"}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:"#2a7a3e"}}>Invite code accepted</div>
                  <div style={{fontSize:12.5,color:"#3a7048",marginTop:2}}>Joining as <b>{localInviteCtx.inv.role}</b>. Submit below to create your account with immediate access.</div>
                </div>
                <button className="btn ghost" style={{fontSize:11.5,padding:"4px 9px"}} onClick={()=>{setLocalInviteCtx(null);setInviteCodeInput("");}}>Change</button>
              </div>
            )}

            {!addingNew&&!localInviteCtx&&(<>
              <p style={{fontSize:13,color:"var(--mut)",margin:0,lineHeight:1.5}}>
                Search for your {hostKind} below and select it to request ownership. Can't find it? Add it.
              </p>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <div style={{flex:1,position:"relative"}}>
                  <Search size={15} color="#9fb2c8" style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)"}}/>
                  <input style={FW({paddingLeft:34})} placeholder={`Search ${hostKind}s…`} value={hostSearch}
                    onChange={e=>{setHostSearch(e.target.value);setSelectedHostId(null);}}
                    onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
                </div>
                <button className="btn ghost" style={{fontSize:13,padding:"10px 13px",whiteSpace:"nowrap"}} onClick={()=>{setAddingNew(true);setNewHostName(hostSearch);setSelectedHostId(null);}}>
                  <Plus size={15}/>Add a {hostKind}
                </button>
              </div>

              {/* Results list */}
              <div style={{maxHeight:240,overflowY:"auto",display:"flex",flexDirection:"column",gap:6,margin:"2px 0"}}>
                {filteredHosts.length===0&&(
                  <div style={{textAlign:"center",padding:"18px 0",color:"var(--mut)",fontSize:13}}>
                    No {hostKind}s found.{" "}
                    <button onClick={()=>{setAddingNew(true);setNewHostName(hostSearch);}} style={{border:0,background:"none",color:"var(--accent)",fontWeight:700,cursor:"pointer",fontSize:13}}>Add "{hostSearch||"new "+hostKind}"</button>
                  </div>
                )}
                {filteredHosts.map(h=>{
                  const on=selectedHostId===h.id;
                  return(
                    <button key={h.id} type="button" onClick={()=>setSelectedHostId(h.id)}
                      style={{display:"flex",alignItems:"center",gap:10,textAlign:"left",
                        border:"1.5px solid "+(on?"var(--accent)":"var(--line)"),
                        background:on?"rgba(10,132,255,.08)":"rgba(255,255,255,.6)",
                        borderRadius:12,padding:"11px 13px",cursor:"pointer",transition:".12s"}}>
                      <span style={{fontSize:18}}>{hostKind==="club"?"🌊":hostKind==="federation"?"🏳️":"⚓"}</span>
                      <span style={{flex:1,minWidth:0}}>
                        <span style={{display:"block",fontWeight:700,fontSize:13.5,color:on?"var(--accent)":"var(--navy)"}}>{h.name}</span>
                        <span style={{fontSize:11.5,color:"var(--mut)"}}>{h.scope==="INT"?"International":"Hong Kong"}</span>
                      </span>
                      {on&&<CheckCircle size={17} color="var(--accent)"/>}
                    </button>
                  );
                })}
              </div>
            </>)}

            {/* New host form */}
            {addingNew&&(<>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2}}>
                <button className="cal-back" style={{color:"var(--accent)"}} onClick={()=>{setAddingNew(false);}}><ArrowLeft size={14}/>Back to search</button>
              </div>
              <div>
                <Label>{hostKind==="club"?"Club":hostKind==="federation"?"Federation":"Association"} name</Label>
                <input style={FW()} placeholder={hostKind==="club"?"e.g. Aberdeen Boat Club":"Name"} value={newHostName}
                  onChange={e=>setNewHostName(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"}
                  onBlur={e=>{e.target.style.boxShadow="none";runResearch(e.target.value);}}/>
                {/* ── Host auto-grab: "Looking you up…" shimmer ── */}
                {researching&&!research&&!confirmedDossier&&(
                  <p className="hostResearchShimmer" style={{fontSize:12,color:"var(--mut)",margin:"8px 2px 0",display:"flex",alignItems:"center",gap:7}}>
                    <Search size={12}/>Looking you up…
                  </p>
                )}
                {/* ── Host auto-grab: "Is this you?" card ── */}
                {research&&!confirmedDossier&&(
                  <div style={{marginTop:10,width:"100%",boxSizing:"border-box",borderRadius:16,border:"1px solid var(--line)",
                    background:"rgba(255,255,255,.75)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
                    boxShadow:"0 10px 34px rgba(12,24,44,.13)",overflow:"hidden"}}>
                    <div style={{padding:"14px 15px"}}>
                      <p style={{fontSize:11,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:"var(--accent)",margin:"0 0 9px"}}>Is this you?</p>
                      <div style={{display:"flex",alignItems:"flex-start",gap:11}}>
                        {research.website&&(
                          <img alt="" width={30} height={30} style={{borderRadius:8,flex:"none",marginTop:1,background:"rgba(255,255,255,.6)"}}
                            src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent((research.website||"").replace(/^https?:\/\//,"").split("/")[0])}&sz=64`}
                            onError={e=>{e.currentTarget.style.display="none";}}/>
                        )}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"baseline",gap:7,flexWrap:"wrap"}}>
                            <span style={{fontWeight:700,fontSize:14.5,color:"var(--navy)"}}>{research.official_name||newHostName.trim()}</span>
                            {research.acronym&&<span style={{fontSize:12,color:"var(--mut)"}}>({research.acronym})</span>}
                          </div>
                          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",margin:"5px 0 0",fontSize:12,color:"var(--mut)"}}>
                            {research.country&&<span style={{display:"inline-flex",alignItems:"center",gap:4}}>{iocFlag(research.country)}<b style={{color:"var(--navy)",fontWeight:600}}>{research.country}</b></span>}
                            {research.website&&<a href={research.website} target="_blank" rel="noreferrer noopener" onClick={e=>e.stopPropagation()} style={{color:"var(--accent)",textDecoration:"none",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{(research.website||"").replace(/^https?:\/\//,"").replace(/\/$/,"")}</a>}
                          </div>
                          {!!(research.classes&&research.classes.length)&&(
                            <div style={{display:"flex",flexWrap:"wrap",gap:6,margin:"9px 0 0"}}>
                              {research.classes.slice(0,6).map((c,i)=>(
                                <span key={i} style={{fontSize:11,fontWeight:600,padding:"2px 8px",borderRadius:980,color:classColor(c),background:classColorA(c,.12),border:`1px solid ${classColorA(c,.3)}`}}>{classLabel(c)}</span>
                              ))}
                            </div>
                          )}
                          {research.blurb&&<p style={{fontSize:12.5,color:"var(--ink)",lineHeight:1.45,margin:"10px 0 0"}}>{research.blurb}</p>}
                          {!!(research.competitions&&research.competitions.length)&&(
                            <div style={{margin:"10px 0 0"}}>
                              <p style={{fontSize:10.5,fontWeight:700,letterSpacing:".05em",textTransform:"uppercase",color:"var(--mut)",margin:"0 0 4px"}}>Recent competitions</p>
                              {research.competitions.slice(0,3).map((c,i)=>(
                                <p key={i} style={{fontSize:12,color:"var(--mut)",margin:"2px 0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                                  {c.name}{c.year?<span style={{opacity:.7}}> · {c.year}</span>:null}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:8,margin:"13px 0 0"}}>
                        <button type="button" className="btn cta" style={{flex:1,justifyContent:"center",fontSize:13}} onClick={acceptResearch}>
                          <CheckCircle size={14}/>Yes, that's us
                        </button>
                        <button type="button" className="btn ghost" style={{justifyContent:"center",fontSize:13}} onClick={dismissResearch}>Not us</button>
                      </div>
                    </div>
                  </div>
                )}
                {/* ── Host auto-grab: confirmed banner ── */}
                {confirmedDossier&&(
                  <div style={{marginTop:10,display:"flex",alignItems:"center",gap:9,padding:"10px 13px",borderRadius:12,
                    background:"rgba(45,120,200,.07)",border:"1px solid rgba(45,120,200,.2)",fontSize:12.5,color:"var(--navy)"}}>
                    <CheckCircle size={15} color="var(--accent)" style={{flex:"none"}}/>
                    <span style={{flex:1,minWidth:0}}>Using <b>{confirmedDossier.identity.official_name||newHostName.trim()}</b>{confirmedDossier.identity.country?` · ${confirmedDossier.identity.country}`:""}. You can import their past results after signing up.</span>
                    <button type="button" className="cal-back" style={{color:"var(--mut)",flex:"none"}} onClick={()=>{setConfirmedDossier(null);researchedNameRef.current="";}}>Undo</button>
                  </div>
                )}
              </div>
              <div>
                <Label>Country / region</Label>
                <CountrySelect intl fullWidth value={hostCountry} onChange={setHostCountry} placeholder="Type a country…"/>
              </div>
              <div>
                <Label>Results website <span style={{textTransform:"none",fontWeight:500,color:"var(--mut)"}}>(optional)</span></Label>
                <input style={FW()} type="url" inputMode="url" placeholder="e.g. sailing.org.hk"
                  value={hostWebsite} onChange={e=>setHostWebsite(e.target.value)}
                  onFocus={e=>e.target.style.boxShadow="0 0 0 4px var(--halo)"} onBlur={e=>e.target.style.boxShadow="none"}/>
                <p style={{fontSize:11.5,color:"var(--mut)",margin:"6px 2px 0",lineHeight:1.45}}>The official site that hosts your results. We'll source past competitions from here instead of searching the whole web.</p>
              </div>
              {hostKind==="association"&&(
                <div><Label>Boat class</Label><ClassPicker value={classId} onChange={setClassId}/></div>
              )}
            </>)}

            {/* Pending-approval note — only for ownership claims, NOT invite-code joins (those are instant) */}
            {!localInviteCtx&&(
              <div style={{background:"rgba(10,132,255,.06)",border:"1px solid rgba(10,132,255,.16)",borderRadius:12,padding:"12px 14px",fontSize:12.5,color:"var(--navy)",lineHeight:1.5}}>
                <b>Heads up:</b> your ownership request is reviewed by the AthLink team. Until it's approved you'll browse as a guest — you'll get full host access once we verify you.
              </div>
            )}

            <div style={{display:"flex",gap:10}}>
              <button className="btn ghost" style={{flex:1,justifyContent:"center"}} onClick={()=>{addingNew?setAddingNew(false):setStep(3);}}>
                <ArrowLeft size={15}/>Back
              </button>
              <button className="btn cta liquidGlass-wrapper" style={{flex:2,justifyContent:"center"}} disabled={busy||!(localInviteCtx||step4Valid)} onClick={doSignUp}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">
                {busy?<Loader2 size={15} className="spin"/>:<BadgeCheck size={15}/>}
                {localInviteCtx?"Accept invitation & create account":addingNew?`Create ${hostKind} & request ownership`:"Request ownership"}
                </div>
              </button>
            </div>
          </>)}

        </div>
      </div>
    </div>
  );
}

return SignInModal;
}
