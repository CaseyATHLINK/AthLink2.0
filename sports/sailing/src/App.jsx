import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from "react";
import { forceSimulation, forceManyBody, forceLink, forceCollide, forceX, forceY, forceRadial } from "d3-force";
import {
  Anchor, Trophy, Search, BadgeCheck, Upload, ChevronRight, MapPin,
  Calendar, Users, Waves, ArrowLeft, Flag, Loader2, Sparkles, Link2,
  X, FileText, ClipboardPaste, AlertCircle, Pencil, Trash2, Plus, Minus,
  CheckCircle, Clock, Eye, Home, Globe, Menu, User, LayoutGrid, Settings, Instagram,
  Award, TrendingUp, Pin, GripVertical, LogOut
} from "lucide-react";
import { SB_URL, SB_KEY, sbH, AUTH_BASE, authHeaders, sbGet, sbPost, sbPatch, sbDel, setSbUserToken, authSignUp, authSignIn, authUser, authRefresh } from "@athlink/core";
import { MON, formatDate, dateKey, monthsBetween } from "./util/date.js";
import { IOC_ISO, isoFlag, iocFlag } from "./util/flag.js";
import { canonName, eventKey, ordinalOf, initials, pascalSlug, avatarColor } from "./util/name.js";
import { CLASSES, CLASS_COLOR, CUSTOM_CLASSES, CUSTOM_CLASS_PALETTE, canonClass, prettifyClassSlug, customClassById, classLabel, classColor, classColorA, setCustomClassRegistry, SUBCLASSES, nuggetFor, classFromFleetName } from "./util/class.js";
import { DIV_COLOR, DIV_LABEL, parseDiv, divTokens, divToString, normGender, normCategory, genderCatOf, GENDER_COLOR } from "./util/gender.js";
import { ATHLETE_ATTRS, buildAthleteAttrs, resolvedEntryGender, ATHLETE_USERNAMES, applyAthleteUsernames, usernameForName, nameForUsername, META, athleteNat, athleteBirthYear, buildHomeCountry } from "./data/athletes.js";
import { DEFAULT_ASSOCIATIONS, DEFAULT_CLUBS, DEFAULT_FEDERATIONS, ASSOCIATIONS, CLUBS, FEDERATIONS, applyDbHosts, addHostLocal, removeHostLocal, assocById, clubById, fedById, hostById, assocName, hostRest, fetchHostMembers, fetchMyMemberships, fetchHostInvites, fetchHostAudit, fetchInviteByToken, logHostAudit, randToken, randShortCode, removeLogoBackground, uploadHostLogo, fetchCustomClasses, insertCustomClass, readPendingCustomClasses, queuePendingCustomClass, dropPendingCustomClass, fetchInviteByShortCode, markInviteUsed, MOCK_RESEARCH, mockResearchIdentity, mockResearchCompetitions, mockParse, mockProbe, eventCountryCode, governingFeds, eventAssocs, eventFingerprint, hostLocation } from "./data/hosts.js";
import { fetchUnverifiedMembers, fetchAllProfiles, fetchAllMembers, devDeleteProfile, fetchProfileNames, fetchAllClaims, createClaim, decideClaim, profileNameKey, fetchAllAthleteProfiles, upsertAthleteProfile, uploadAthletePhoto, uploadAthleteMedia, fetchAllEventClaims, createEventClaim, decideEventClaim } from "./data/profiles.js";
import { isCode, scoreEvent, scorePreview, aggregate, outstandingAchievementFor, isUpcomingEvent } from "./data/scoring.js";
import { parseHtml } from "./data/parse-html.js";
import { dbToApp, saveEventToDb, replaceEventResultsInDb, updateEventStatus, fetchDupDismissals, saveDupDismissals } from "./data/events.js";
import { CountryTag, ConfirmModal, VerifyBadge, DivisionToggle, ClassPicker, HostClassPills, LiquidBackground, MagneticItem, ResultNuggets, WebIcon, ErrorBoundary, HostLogo } from "./views/atoms.jsx";
import { NatInput, DateField, CustomClassPicker, CollabPicker, CountrySelect, ClassSelect, AddHostNugget } from "./views/forms.jsx";
import { CalendarBody } from "./views/calendar.jsx";
import { GLOBE_NAMES, SailingGlobe, FootprintLegend } from "./views/globe.jsx";
import { AthleteWeb, YearNuggets, ProgressChart, ratingEngine } from "./views/charts.jsx";
import { FleetForecast, UpcomingStrip } from "./views/forecast.jsx";
import { SPORT_MODELS, SpmDuo, HomeShowcaseRotator } from "./views/models.jsx";
import { FootprintModal, RegattaFootprintModal } from "./views/footprint.jsx";
import { ClaimProfileModal, AthleteEditModal, MediaModal, DevApprovalsModal, DevProfilesModal } from "./views/profile.jsx";
import { HostMembersModal, HostEditModal, HostDiscoveryModal, hgCompKey, hgRunPool, _hg_norm } from "./views/host.jsx";
import { SignInModal } from "./views/auth.jsx";
import ScoutPortal, { SaveButton, ScoutLocked } from "./views/scout.jsx";
import { scoutOwnerId, logActivity, fetchPins, addPin, removePin, reorderPins } from "./data/scout.js";
import { fetchProfile, upsertProfile, authGoogleOAuth, completePendingSignup, clearPendingSignup, ResetPasswordModal } from "@athlink/auth";





/* ── static data ──────────────────────────────────────────────────────── */
// ── Base classes (used for colour coding) ──

// Accepted upload types for the import pop-up (file input `accept` + drop zone).
const IMPORT_ACCEPT=".pdf,.png,.jpg,.jpeg,.webp,.heic,.xlsx,.xls,.csv,.html,.htm,.blw";
// In-memory (session-scoped) snapshot of an unfinished import batch. Restored when
// the import pop-up is reopened within the same page session; cleared on successful
// publish/save-draft and when a fresh import batch starts. NOT persisted — page
// reload clears it by design (CLAUDE.md forbids dev-view localStorage/sessionStorage).
let IMPORT_DRAFT=null;




/* ── Clean-URL slugs & path <-> state mapping ─────────────────────────────
   Fully-flat scheme so links read cleanly and share well:
     /                     → AthLink landing (all sports) — handled by the shell
     /sailing              → sailing home (all portals)
     /<Host>               → that host's competitions   e.g. /HongKongSailingFederation
     /<Host>/athletes      → that host's athletes
     /<Athlete>            → an athlete profile          e.g. /CaseyLaw
     /athletes             → all athletes
     /ranking              → season ranking
     /event/<id>           → one competition
     /class/<clsId>[/athletes] → the per-class "all results" portal
   Resolution priority for a single segment: reserved word > host > athlete.
   Slugs are PascalCase, punctuation-stripped; matching is case-insensitive. */
const slugKey=(s)=>pascalSlug(s).toLowerCase();
// A host's public slug: the editable hosts.slug if set, else PascalCase(name).
const hostSlug=(host)=>{const h=(host&&host.id)?host:hostById(host);
  return h?(h.slug||pascalSlug(h.name)):"";};
const hostBySlug=(slug)=>{const k=String(slug||"").toLowerCase();
  return [...ASSOCIATIONS,...CLUBS,...FEDERATIONS]
    .find(h=>(h.slug&&h.slug.toLowerCase()===k)||slugKey(h.name)===k)||null;};

const collectAthleteNames=(events)=>{const s=new Set();
  (events||[]).forEach(ev=>(ev.entries||[]).forEach(e=>{
    [e&&e.helm,e&&e.crew,e&&e.name,e&&e.helm_name,e&&e.crew_name].forEach(n=>{if(n)s.add(n);});
  }));return s;};
// Current {portal,view} → the path it should live at.
const stateToPath=(portal,view)=>{
  const v=view||{name:"portals"};
  if(v.name==="profile") return "/"+usernameForName(v.id||"");
  if(v.name==="event")   return "/competition/"+encodeURIComponent(v.id||"");
  if(v.name==="competitions") return v.cls?"/class/"+encodeURIComponent(v.cls):"/competitions";
  if(v.name==="hosts")   return "/hosts";
  if(v.name==="scout")   return "/scout";
  if(v.name==="ranking") return "/rankings";
  const isClassPortal=portal&&String(portal).startsWith("class:");
  if(v.name==="athletes"){
    if(portal&&!isClassPortal) return "/"+hostSlug(portal)+"/athletes";
    if(isClassPortal) return "/class/"+encodeURIComponent(String(portal).slice(6))+"/athletes";
    if(v.cls) return "/class/"+encodeURIComponent(v.cls)+"/athletes";
    return "/athletes";
  }
  // events / portals home
  if(isClassPortal) return "/class/"+encodeURIComponent(String(portal).slice(6));
  if(portal) return "/"+hostSlug(portal);
  return "/sailing";
};
// A path → the {portal,view} it represents, or null if it resolves to nothing.
const pathToState=(pathname,athleteNames)=>{
  const seg=decodeURIComponent(pathname||"/").split("/").filter(Boolean);
  const s0=(seg[0]||"").toLowerCase();
  if(seg.length===0||s0==="sailing") return {portal:null,view:{name:"portals"}};
  if(s0==="athletes") return {portal:null,view:{name:"athletes"}};
  if(s0==="hosts")    return {portal:null,view:{name:"hosts"}};
  if(s0==="scout")    return {portal:null,view:{name:"scout"}};
  if(s0==="competitions") return {portal:null,view:{name:"competitions"}};
  if(s0==="ranking"||s0==="rankings")  return {portal:null,view:{name:"ranking"}};
  // "/competition/<id>" is canonical; "/event/<id>" kept as an alias so old shared links never break.
  if(s0==="event"||s0==="competition") return {portal:null,view:{name:"event",id:seg[1]}};
  if(s0==="class"){
    // Class is a filter, not a door: /class/<id> = Competitions filtered to that
    // class; /class/<id>/athletes = the global Athletes page under the same lens.
    const isAth=(seg[2]||"").toLowerCase()==="athletes";
    return {portal:null,view:{name:isAth?"athletes":"competitions",cls:seg[1]||""}};
  }
  const host=hostBySlug(seg[0]);
  if(host){
    const isAth=(seg[1]||"").toLowerCase()==="athletes";
    return {portal:host.id,view:{name:isAth?"athletes":"events"}};
  }
  // Athlete: match the registered username first, then fall back to a
  // PascalCase scan of loaded names (covers any not yet in the table).
  const byUser=nameForUsername(seg[0]);
  if(byUser) return {portal:null,view:{name:"profile",id:byUser}};
  if(athleteNames){
    const k=slugKey(seg[0]); let found=null;
    athleteNames.forEach(n=>{if(!found&&slugKey(n)===k)found=n;});
    if(found) return {portal:null,view:{name:"profile",id:found}};
  }
  return null;
};
// Association → ISO country flag (HK gets a flag; International gets none)


// Global class colour coding (used by calendar circles)
// Canonical class colours (refer to them by these names):
//   29er  -> "29er red"      (#E84855)
//   ILCA  -> "ILCA red"      (#E2231A, matches the ILCA logo red; sub-rigs are dark→light shades of it)
//   Optimist -> "Optimist black" (#000000, matches the Optimist logo; lower fleets fade to grey)
//   49er  -> "49er green"    (#5FAF4E); women's sub-fleet "49er FX" -> "49er FX blue" (#1B87C9, matches the 49er FX logo)
// Class colour at a given alpha (for translucent buttons that go solid on hover).










// Strip stray markdown / leading heading / duplicated name from AI summaries
const cleanAISummary=(t)=>{
  let s=(t||"").trim();
  s=s.replace(/^\s*#{1,6}\s.*?(\n|$)/,"");          // drop leading "# Heading" line
  s=s.replace(/\*\*(.*?)\*\*/g,"$1").replace(/[*_`#]/g,"");
  s=s.replace(/^\s*[-•]\s+/gm,"");
  return s.replace(/\n{2,}/g,"\n").trim();
};
// Demo events removed — all data now comes from Supabase per association.





/* ── Outstanding Achievement (division podium) ────────────────────────────────
   A result can be excellent *within a division* yet buried by a mediocre
   overall position (3rd overall but 1st Under-18). Derived strictly from the
   official overall order — we only filter and count, never re-rank. */

// Derive athlete's primary nationality from their result history


/* ── Supabase + Auth (GoTrue) plumbing lives in @athlink/core (single source of
   truth); App.jsx imports it above and no longer redefines SB_URL/SB_KEY/sbH/
   sbGet/sbPost/sbPatch/sbDel/AUTH_BASE/authHeaders/authSignUp/authSignIn/authUser.
   Sailing-local Supabase helpers now live in data modules: event read/write +
   dup-dismissals in data/events.js, auth/profile in @athlink/auth. ── */

/* ── manual form ─────────────────────────────────────────────────────── */
const defRow=n=>({helm:"",crew:"",sail:"",nat:"",div:"",scores:Array(n).fill("")});
const emptyForm=()=>({name:"",cls:"29er",subclass:null,collabs:[],club:"",country:"",date:"",discards:1,numRaces:5,rows:[defRow(5),defRow(5),defRow(5)]});






















export default function AthLinkMVP(){
  const[events,setEvents]=useState([]);
  const[initialLoading,setInitialLoading]=useState(true); // true until the first Supabase load settles (drives the branded splash)
  const[showDevProfiles,setShowDevProfiles]=useState(false);    // dev-only all-profiles panel
  const[showHostEdit,setShowHostEdit]=useState(false);          // host portal edit modal
  const[showDiscovery,setShowDiscovery]=useState(false);        // host auto-grab: import-past-results view
  const[discoveryReview,setDiscoveryReview]=useState(false);    // open discovery straight into needs-review
  const[discoveryImport,setDiscoveryImport]=useState(null);     // {statuses:{key:st}, done, total, running}
  const[discoverySeed,setDiscoverySeed]=useState(null);         // scrape-tab: [urls] to research; null = research by host name
  const[scrapeText,setScrapeText]=useState("");                 // "Scrape website" import tab: pasted URLs
  const[hostsVersion,setHostsVersion]=useState(0);  // bump to re-render after host registry changes
  const reloadHosts=async()=>{
    const rows=await sbGet("hosts?select=*");
    if(rows) applyDbHosts(rows);
    setHostsVersion(v=>v+1);
  };
  // ── Custom boat classes (global, in-memory) ──
  // State mirrors the module-level CUSTOM_CLASSES registry so the UI re-renders.
  const[customClasses,setCustomClasses]=useState(CUSTOM_CLASSES);
  const[classNote,setClassNote]=useState(null); // {name} — toast when a custom class couldn't be persisted
  // Persist a custom class to the DB, verifying the write actually landed.
  // hostRest resolves null on failure (never rejects), so the result must be
  // checked — the old fire-and-forget .catch silently lost classes. Failures
  // (and signed-out adds, e.g. dev mode) go to the localStorage queue and are
  // re-tried on the next signed-in load.
  const persistCustomClass=async(cc)=>{
    if(!(auth?.user?.id&&auth?.token)){queuePendingCustomClass(cc);return;}
    const res=await insertCustomClass(cc,auth.user.id,auth.token); // [] = duplicate (fine), null = failed
    if(res===null){queuePendingCustomClass(cc);setClassNote({name:cc.short});}
    else dropPendingCustomClass(cc.canonical);
  };
  // Add (or reuse) a custom class by name. Dedups on canonical key; returns the
  // class id so the caller can select it. Persists to custom_classes so it
  // survives reloads and appears for everyone (queued + retried if it can't be
  // written right now).
  const addCustomClass=(name)=>{
    const nm=String(name||"").trim();
    if(!nm) return null;
    const canonical=canonClass(nm);
    if(!canonical) return null;
    const existing=CUSTOM_CLASSES.find(c=>c.canonical===canonical);
    if(existing) return existing.id;
    const color=CUSTOM_CLASS_PALETTE[CUSTOM_CLASSES.length%CUSTOM_CLASS_PALETTE.length];
    const cc={id:`custom:${canonical}`,short:nm,full:nm,color,canonical};
    setCustomClassRegistry([...CUSTOM_CLASSES,cc]);
    setCustomClasses(CUSTOM_CLASSES);
    persistCustomClass(cc);
    return cc.id;
  };
  const[auth,setAuth]=useState(null);
  // Keep the core REST wrappers on the signed-in JWT — RLS (0015) scopes writes
  // `to authenticated`, so sbPost/sbPatch must carry the user token, not the anon key.
  // Synchronous during render, NOT an effect: child effects (ScoutPortal reload,
  // SaveButton hydrate) run before parent effects, so an effect here would let the
  // first owner-scoped scout_* fetches go out on the anon key and read [] — the
  // "workspace looks empty right after sign-in" bug. Idempotent module assignment.
  setSbUserToken(auth?.token||null);
  // Keep the session alive: GoTrue access tokens expire in ~1h, after which every
  // write 401s. Refresh before expiry so long dev/host sessions don't silently
  // lose write access mid-edit. Rotated tokens are re-persisted.
  useEffect(()=>{
    if(!auth?.refresh) return;
    const id=setInterval(async()=>{
      try{
        const d=await authRefresh(auth.refresh);
        setAuth(a=>a?{...a,token:d.access_token,refresh:d.refresh_token||a.refresh}:a);
        try{const raw=localStorage.getItem("athlink_auth");if(raw){const s=JSON.parse(raw);s.token=d.access_token;s.refresh=d.refresh_token||s.refresh;localStorage.setItem("athlink_auth",JSON.stringify(s));}}catch{}
      }catch(e){ console.error("Session refresh failed",e); }
    }, 50*60*1000); // token lasts 60 min
    return ()=>clearInterval(id);
  },[auth?.refresh]);
  const[showSignIn,setShowSignIn]=useState(false);
  const[signupRole,setSignupRole]=useState(null); // preselected signup role from ?role= deep-link
  const[accountOpen,setAccountOpen]=useState(false);
  const[myMemberships,setMyMemberships]=useState([]);  // host_members rows for the signed-in user
  const[showMembers,setShowMembers]=useState(false);   // members-management panel open
  const[inviteRedeemed,setInviteRedeemed]=useState(null); // {hostId,status} after redeeming an invite link
  const[allClaims,setAllClaims]=useState([]);          // every athlete_claims row (for badges + admin review)
  const[allEventClaims,setAllEventClaims]=useState([]);// every event_claims row (host claims on contributed events)
  const[claimNote,setClaimNote]=useState(null);        // toast after submitting a claim
  const[showClaimModal,setShowClaimModal]=useState(false); // guided claim modal open
  // Shared "which button is mid-DB-write" flag so any async action can show a
  // spinner + guard against double-clicks. runBusy(id, fn) sets it for the run.
  const[busyAction,setBusyAction]=useState(null);
  const runBusy=async(id,fn)=>{
    if(busyAction) return;
    setBusyAction(id);
    try{ return await fn(); }
    catch(err){ console.error("runBusy["+id+"] failed",err); }
    finally{ setBusyAction(null); }
  };
  const[athleteProfiles,setAthleteProfiles]=useState({});  // name_key -> athlete_profiles row (owner extras)
  const[showAthEdit,setShowAthEdit]=useState(null);        // profile name being edited by its owner
  const[showMedia,setShowMedia]=useState(null);            // profile name whose media gallery is open
  const[savingResults,setSavingResults]=useState(null);    // "draft" | "publish" while the preview save runs
  const[pendingHostNotice,setPendingHostNotice]=useState(null); // hostId — shows "pending approval" toast after host signup
  const[pendingInviteToken,setPendingInviteToken]=useState(null); // raw token from ?invite= URL param
  const[showDevApprovals,setShowDevApprovals]=useState(false);  // dev-only pending-approvals panel
  const[showUsername,setShowUsername]=useState(false);          // username-creation modal
  const[usernameInput,setUsernameInput]=useState("");
  const[usernameBusy,setUsernameBusy]=useState(false);
  const[usernameErr,setUsernameErr]=useState("");
  const[navSearchOpen,setNavSearchOpen]=useState(false); // top-bar nav pill flipped into search mode
  const[navMenuOpen,setNavMenuOpen]=useState(false); // mobile: nav links collapsed into a menu
  const[barHidden,setBarHidden]=useState(false);  // hide topbar on scroll-down
  const[portalMenuOpen,setPortalMenuOpen]=useState(false); // in-portal sidebar menu
  // ── DEVELOPER VIEW ──────────────────────────────────────────────────────
  // Dev view lets Casey edit anything (any host / event / profile). Forces full
  // (association) access AND signs into a dedicated ADMIN account so the writes
  // are AUTHORISED at the DB — after the RLS hardening (#122) every write needs a
  // real session; the admin account satisfies is_athlink_admin(). Nothing secret
  // ships in the bundle: the "dev password" IS the admin account's password,
  // verified server-side by Supabase. ALWAYS starts OFF per page load.
  const DEV_VIEW_ENABLED=true;
  const ADMIN_EMAIL="casey@athlink.win";           // recognised as admin if signed in directly
  const DEV_ADMIN_EMAIL="dev-admin@athlink.win";   // the account dev view signs into
  const isAdminUser=[ADMIN_EMAIL,DEV_ADMIN_EMAIL].includes((auth?.user?.email||"").toLowerCase());
  const devEligible=DEV_VIEW_ENABLED||isAdminUser;
  const[devMode,setDevMode]=useState(false); // never auto-on — keyboard shortcut only
  useEffect(()=>{
    if(!devEligible){ setDevMode(false); return; }
    const onKey=(e)=>{ if((e.ctrlKey||e.metaKey)&&e.shiftKey&&(e.key==="D"||e.key==="d")){
      e.preventDefault();
      if(devMode){ setDevMode(false);                       // already on → toggle off
        if((auth?.user?.email||"").toLowerCase()===DEV_ADMIN_EMAIL) signOut(); // drop the hidden admin session so nothing lingers
        return; }
      if(isAdminUser){ setDevMode(true); return; }           // already the admin session → no re-prompt
      const pw=window.prompt("Enter dev mode password:");
      if(pw==null) return;                                   // cancelled → stay in guest mode
      (async()=>{
        try{
          const d=await authSignIn(DEV_ADMIN_EMAIL,pw);      // sign in as the admin account
          const u=await authUser(d.access_token);
          const prof=(u&&await fetchProfile(u.id,d.access_token))||{role:"association"};
          onAuthed({token:d.access_token,refresh:d.refresh_token,user:u,profile:prof});
          setDevMode(true);
        }catch(err){ window.alert("Wrong dev password."); }  // GoTrue rejected → stay guest
      })();
    }};
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[devEligible,devMode,isAdminUser]);
  const effectiveRole=devMode?"association":(auth?.profile?.role||"guest");
  const viewerTypeOf=r=>r==="athlete"?"athlete":r==="scout"?"scout":r==="club"||r==="association"||r==="federation"?"host":"guest"; // 3 viewer types: athlete|host|scout (everyone else browses as guest)
  const viewerType=viewerTypeOf(effectiveRole);
  const isScout=effectiveRole==="scout"||devMode; // scout workspace is scout-only; devMode keeps access for admin/testing
  const role=effectiveRole;
  const canEditRole=effectiveRole==="association";
  // A profile is "verified-claimed" if any approved claim exists for that name.
  const profileVerified=(nm)=>allClaims.some(c=>c.status==="approved"&&c.profile_name?.toLowerCase()===String(nm||"").toLowerCase());
  // The signed-in user's claim row for a given profile name (or null).
  const myClaimFor=(nm)=>auth?.user?.id?allClaims.find(c=>c.user_id===auth.user.id&&c.profile_name?.toLowerCase()===String(nm||"").toLowerCase())||null:null;
  const canEditProfileOf=(nm)=>devMode
    ||(effectiveRole==="athlete"&&auth?.profile?.athlete_name&&auth.profile.athlete_name.toLowerCase()===String(nm||"").toLowerCase())
    ||(!!myClaimFor(nm)&&myClaimFor(nm).status==="approved");
  // googleOnboarding: {token, user} — set when a Google sign-in returns with no profile yet
  const[googleOnboarding,setGoogleOnboarding]=useState(null);
  // recoverySession: {token, refresh, user} — set when a password-reset link returns
  const[recoverySession,setRecoverySession]=useState(null);
  // one-shot info banner for the sign-in modal (e.g. minor-athlete guardian notice)
  const[signInNotice,setSignInNotice]=useState("");
  useEffect(()=>{
    if(!AUTH_BASE) return;
    // ── Detect Supabase auth return (access_token in URL hash) ────────────────
    // Covers Google OAuth, email-confirmation links (type=signup) and
    // password-reset links (type=recovery) — GoTrue uses the same hash shape.
    const hash=window.location.hash;
    if(hash&&hash.includes("access_token")){
      const params=new URLSearchParams(hash.replace(/^#/,""));
      const tok=params.get("access_token");
      const refresh=params.get("refresh_token")||undefined;
      const linkType=params.get("type"); // "signup" | "recovery" | null (OAuth)
      // Clean the hash from the URL immediately
      window.history.replaceState(null,"",window.location.pathname+window.location.search);
      if(tok){
        (async()=>{
          try{
            const u=await authUser(tok);
            if(!u) return;
            if(linkType==="recovery"){ setRecoverySession({token:tok,refresh,user:u}); return; }
            const prof=await fetchProfile(u.id,tok);
            if(prof){
              // Returning user with an existing profile → sign straight in
              onAuthed({token:tok,refresh,user:u,profile:prof});
            } else {
              // No profile yet: an email signup whose details were stashed
              // pre-confirmation replays here; otherwise it's a first-time
              // Google user who still needs the role/name onboarding.
              const done=await completePendingSignup({user:u,tok},{
                onCreateHost:createHostFromSignup,onClaimHost:claimHostFromSignup,
                hostRest,fetchInviteByToken,markInviteUsed,hostById,
              }).catch(e=>{console.error("Pending signup replay:",e);return null;});
              if(done&&done.guardianPending){
                // Minor athlete: profile written but gated on guardian consent — mirror
                // the live-signup behaviour (no session) and say why.
                setSignInNotice(`Email confirmed. A guardian consent email was sent — your profile activates once it's approved.`);
                setShowSignIn(true);
              } else if(done){
                onAuthed({token:tok,refresh,user:u,profile:done.profile,...(done.pendingHostId?{pendingHostId:done.pendingHostId}:{})});
              } else {
                setGoogleOnboarding({token:tok,user:u});
                setShowSignIn(true);
              }
            }
          }catch(e){console.error("OAuth return error:",e);}
        })();
        return; // skip localStorage restore below
      }
    }
    // ── Restore persisted session ─────────────────────────────────────────────
    try{
      const raw=localStorage.getItem("athlink_auth");
      if(!raw) return;
      const saved=JSON.parse(raw);
      (async()=>{
        let token=saved.token, refresh=saved.refresh;
        let u=await authUser(token);
        if(!u&&refresh){ // access token expired → try refreshing before giving up
          try{ const d=await authRefresh(refresh); token=d.access_token; refresh=d.refresh_token||refresh; u=await authUser(token); }catch{}
        }
        if(u){
          const prof=await fetchProfile(u.id,token)||saved.profile||{role:"guest"};
          setAuth({token,refresh,user:u,profile:prof});
          try{localStorage.setItem("athlink_auth",JSON.stringify({token,refresh,profile:prof}));}catch{}
        } else localStorage.removeItem("athlink_auth");
      })();
    }catch{}
  },[]);
  // Load memberships for a specific auth object (used right after sign-in,
  // where the reloadMemberships closure would still hold the old/null auth).
  const loadMembershipsFor=async(a2)=>{
    if(!a2?.user?.id||!a2?.token){setMyMemberships([]);return;}
    const rows=await fetchMyMemberships(a2.user.id,a2.token);
    if(rows) setMyMemberships(rows);
  };
  const onAuthed=(a2)=>{ setAuth(a2); setShowSignIn(false); setGoogleOnboarding(null); setSignupRole(null); setSignInNotice(""); clearPendingSignup();
    if(a2.pendingHostId) setPendingHostNotice(a2.pendingHostId);
    try{localStorage.setItem("athlink_auth",JSON.stringify({token:a2.token,refresh:a2.refresh,profile:a2.profile}));}catch{}
    if(a2.profile?.role==="scout") goTop("scout"); // scouts land in the scout workspace; athletes/fans/hosts keep current behavior
    loadMembershipsFor(a2); };
  const signOut=()=>{ setAuth(null); setDevMode(false); setAccountOpen(false); setMyMemberships([]); try{localStorage.removeItem("athlink_auth");}catch{} };
  // Save host portal edits (name + location). Persists to the hosts table and
  // updates the in-memory registry so the change shows immediately.
  const saveHost=async(hostId,patch)=>{
    // Update local registry immediately (optimistic).
    const h=hostById(hostId);
    if(h){ if(patch.name!=null)h.name=patch.name; if("country"in patch)h.country=patch.country;
      if("logo_url"in patch){ if(patch.logo_url) h.logo_url=patch.logo_url; else delete h.logo_url; }
      if("dossier"in patch){ if(patch.dossier) h.dossier=patch.dossier; else delete h.dossier; } }
    setHostsVersion(v=>v+1);
    // Persist. PATCH alone silently no-ops if the row was never inserted
    // (the 11 defaults aren't in the hosts table until seeded), so UPSERT:
    // a PATCH that affects 0 rows is followed by an INSERT carrying the full record.
    try{
      const patched=await sbPatch("hosts",`id=eq.${encodeURIComponent(hostId)}`,patch);
      const hit=Array.isArray(patched)&&patched.length>0;
      if(!hit&&h){
        const row={id:h.id,type:h.type,scope:h.scope||"HK",name:h.name,
          ...(h.cls?{cls:h.cls}:{}),...(h.country?{country:h.country}:{}),
          ...(h.logo_url?{logo_url:h.logo_url}:{}),
          ...(h.dossier?{dossier:h.dossier}:{})};
        await sbPost("hosts",row);
      }
    }catch(e){console.error("saveHost persist",e);}
  };
  // (dismissHostGrab removed with the auto-grab invitation banner — hosts' home
  //  websites are no longer scraped automatically.)
  // Host auto-grab: open one OR MORE parsed results in the STANDARD import
  // preview/publish modal (identical to drag-drop). The host reviews and publishes
  // each — nothing is auto-committed, so there are no silent imports and no
  // duplicates (importPreview's fingerprint dedup guards publish).
  const openPreviewsInImport=(entries)=>{
    const ok=(entries||[]).filter(e=>e&&e.previewEv);
    if(!ok.length) return;
    setShowDiscovery(false); setDiscoveryImport(null);
    setEditResultsEv(null);
    // Reopening: restore any stashed queue first so these results JOIN it.
    if(!open&&!restoreImportDraft()) resetImport();
    setTab("ai"); setImportStep("upload");
    setActivePending(null); setPreviewEv(null);
    setPending(prev=>[...prev,...ok]);   // append to the hub queue — review each via its Review button
    setOpen(true);
  };
  // Bulk "import": parse each selected discovered competition (small pool, live
  // per-row status in the discovery modal), then route ALL parseable results into
  // the preview/publish modal so the host reviews + publishes each. If everything
  // fails, the discovery modal stays open showing the failures.
  const importDiscoveredCompetitions=async(rows,hostObj)=>{
    if(!rows?.length) return;
    const total=rows.length;
    const statuses={}; rows.forEach(r=>{statuses[hgCompKey(r)]="queued";});
    let done=0;
    setDiscoveryImport({statuses:{...statuses},done:0,total,running:true});
    const setStatus=(k,s)=>{ statuses[k]=s; setDiscoveryImport(d=>({...(d||{}),statuses:{...statuses}})); };
    const bump=()=>{ done++; setDiscoveryImport(d=>({...(d||{}),done,statuses:{...statuses}})); };
    const entries=[];
    const build=(data,row)=>{
      const stamp=Date.now()+"_"+Math.random().toString(36).slice(2,6);
      // Carry the source URL so importPreview records it as a source on publish.
      const withUrl=pv=>{ pv.sources=[...new Set([...(pv.sources||[]),row.url].filter(Boolean))]; return pv; };
      if(data.multi&&Array.isArray(data.fleets)&&data.fleets.length){
        const gid="fg_grab_"+stamp, gdisc=Math.max(...data.fleets.map(f=>f.discards||1));
        data.fleets.forEach((fl,fi)=>entries.push({id:gid+"_f"+fi,
          name:`${data.name||row.name} · ${fl.name||"Fleet "+(fi+1)}`,status:"ok",error:null,
          previewEv:withUrl(previewFromData(data.name||row.name,data.date||"",fl,!!data.ai_parsed,data.detected_class||row.class||"",data.detected_host||hostObj?.name||"")),
          subclass:null,collabs:[],fleetGroupId:gid,fleetGroupBaseName:data.name||row.name,fleetGroupDiscards:gdisc}));
      }else{
        entries.push({id:"grab_"+stamp,name:data.name||row.name,status:"ok",error:null,
          previewEv:withUrl(previewFromData(data.name||row.name,data.date||"",{name:"",entries:data.entries||[],discards:data.discards},!!data.ai_parsed,data.detected_class||row.class||"",data.detected_host||hostObj?.name||"")),
          subclass:null,collabs:[]});
      }
    };
    const worker=async(row)=>{
      const k=hgCompKey(row);
      try{
        setStatus(k,"parsing");
        const data=MOCK_RESEARCH?mockParse(row):await parseLink(row.url,"ai");
        if(!data||!data.ok){ setStatus(k,"failed"); bump(); return; }
        build(data,row); setStatus(k,"parsed"); bump();
      }catch(e){ console.error("[host-autograb] parse failed",e); setStatus(k,"failed"); bump(); }
    };
    await hgRunPool(rows.map(r=>()=>worker(r)),2);
    setDiscoveryImport(d=>({...(d||{}),running:false}));
    if(entries.length) openPreviewsInImport(entries);   // → review + publish
  };
  // Back-compat entry (needs-review item → preview). Delegates to the shared helper.
  const openReviewInImport=(item)=>{
    if(!item?.previewEv) return;
    openPreviewsInImport([{id:"nr_"+Date.now(),name:item.name||"Competition",status:"ok",error:null,previewEv:item.previewEv,subclass:null,collabs:[]}]);
  };
  // Fuzzy "is this competition already on AthLink?" — same conservative matcher
  // the discovery modal uses (name + year + class must not disagree).
  const eventAlreadyOnAthLink=(c)=>{
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
  };
  // ── Shared tail of discovery: turn researched competitions ({name,url,year,class})
  //    into import-queue nuggets — already imported → ticked off, no URL → failed,
  //    the rest parsed (2 at a time) into ready-to-review previews. `placeRows`
  //    decides how the initial rows enter the queue (append, or replace a site seed).
  const compsIntoQueue=async(comps,idPrefix,hostObj,placeRows)=>{
    const rows=comps.map((c,ci)=>{
      const base={id:idPrefix+"_c"+ci,name:c.name||"Competition",status:"parsing",error:null,previewEv:null,subclass:null,collabs:[]};
      if(eventAlreadyOnAthLink(c)) return {...base,status:"published",publishedMsg:"Already on AthLink",notes:[]};
      if(!c.url) return {...base,status:"error",error:"No results link found — upload its file above.",notes:["No results link found — upload its file above."]};
      return {...base,notes:["Reading the results page…"],_comp:c};
    });
    placeRows(rows);
    // Parse the readable ones (2 at a time) → ready-to-review queue items.
    await hgRunPool(rows.filter(r=>r._comp).map(row=>async()=>{
      const c=row._comp;
      let out;
      try{
        const data=MOCK_RESEARCH?mockParse({url:c.url,name:c.name,class:c.class}):await parseLink(c.url,"ai");
        if(!data||!data.ok) throw new Error(data?.error||"Couldn't read this results page.");
        const withUrl=pv=>{pv.sources=[...new Set([...(pv.sources||[]),c.url].filter(Boolean))];return pv;};
        if(data.multi&&Array.isArray(data.fleets)&&data.fleets.length){
          const gdisc=Math.max(...data.fleets.map(f=>f.discards||1));
          out=data.fleets.map((fl,fi)=>({id:row.id+"_f"+fi,name:`${data.name||c.name} · ${fl.name||"Fleet "+(fi+1)}`,status:"ok",error:null,
            previewEv:withUrl(previewFromData(data.name||c.name,data.date||"",fl,!!data.ai_parsed,data.detected_class||c.class||"",data.detected_host||hostObj?.name||"")),
            subclass:null,collabs:[],fleetGroupId:row.id,fleetGroupBaseName:data.name||c.name,fleetGroupDiscards:gdisc,notes:data.notes||["Parsed."]}));
        }else{
          out=[{id:row.id,name:data.name||c.name,status:"ok",error:null,notes:data.notes||["Parsed."],
            previewEv:withUrl(previewFromData(data.name||c.name,data.date||"",{name:"",entries:data.entries||[],discards:data.discards},!!data.ai_parsed,data.detected_class||c.class||"",data.detected_host||hostObj?.name||"")),
            subclass:null,collabs:[]}];
        }
      }catch(e){
        const msg=(e&&e.message)||"Couldn't read this results page.";
        out=[{...row,_comp:undefined,status:"error",error:msg,notes:[msg]}];
      }
      setPending(prev=>prev.flatMap(p=>p.id===row.id?out:[p]));
    }),2);
  };
  // ── Saved discoveries: feed hosts.dossier.competitions (researched earlier, with
  //    known result URLs) straight into the import queue — no re-scan of any site.
  const dossierIntoQueue=async()=>{
    const hostObj=(portal&&!isClassPortal)?hostById(portal):null;
    const comps=hostObj?.dossier?.competitions||[];
    if(!comps.length) return;
    const seen=new Set();
    const uniq=comps.filter(c=>{const k=hgCompKey(c); if(seen.has(k))return false; seen.add(k); return true;});
    const stamp=Date.now()+"_"+Math.random().toString(36).slice(2,6);
    await compsIntoQueue(uniq,"dossier_"+stamp,hostObj,rows=>setPending(prev=>[...prev,...rows]));
  };
  // ── "Import result database": research the pasted sites and feed every found
  //    competition through the SAME import queue as single results — no separate
  //    discovery pop-up. Each site appears as a scanning nugget, then expands into
  //    one nugget per competition: parsed → ready to review, already imported →
  //    ticked off, unreadable → failed with the reason. Runs inside the import
  //    modal, concurrently with any file/link parses.
  const discoverIntoQueue=async(urls)=>{
    const hostObj=(portal&&!isClassPortal)?hostById(portal):null;
    const stamp=Date.now()+"_"+Math.random().toString(36).slice(2,6);
    const siteSeeds=urls.map((u,i)=>({id:"site_"+stamp+"_"+i,name:u,status:"parsing",error:null,previewEv:null,subclass:null,collabs:[],
      notes:["Scanning this site for competitions…"]}));
    setPending(prev=>[...prev,...siteSeeds]);
    const fail=(id,msg)=>setPending(prev=>prev.map(p=>p.id===id?{...p,status:"error",error:msg,notes:[msg]}:p));
    const researchOne=async(i)=>{
      const url=urls[i], sid=siteSeeds[i].id;
      let comps=[];
      try{
        let d;
        if(MOCK_RESEARCH) d=mockResearchCompetitions(hostObj?.name||"",hostObj?.type||"club",hostObj?.country||"",url);
        else{
          const r=await fetch("/api/research_host",{method:"POST",headers:{"Content-Type":"application/json"},
            body:JSON.stringify({name:hostObj?.name||"",type:hostObj?.type||"club",
              country_hint:(hostObj?.country||"").length===3?hostObj.country:"",
              website:url,mode:"competitions"})});
          d=await r.json();
        }
        if(!d||!d.ok) throw new Error(d?.error||"Couldn't scan this site.");
        comps=Array.isArray(d.competitions)?d.competitions:[];
      }catch(e){ fail(sid,(e&&e.message)||"Couldn't scan this site."); return; }
      const seen=new Set();
      comps=comps.filter(c=>{const k=hgCompKey(c); if(seen.has(k))return false; seen.add(k); return true;});
      if(!comps.length){ fail(sid,"No competitions found on this site."); return; }
      // Expand the site's scanning nugget into one nugget per competition, in place.
      await compsIntoQueue(comps,sid,hostObj,rows=>setPending(prev=>prev.flatMap(p=>p.id===sid?rows:[p])));
    };
    await hgRunPool(urls.map((_,i)=>()=>researchOne(i)),2);
  };
  // ── Save a username to the user's profile (unique, lowercase, alnum + underscore) ──
  const saveUsername=async()=>{
    const u=usernameInput.trim().toLowerCase().replace(/[^a-z0-9_]/g,"");
    if(u.length<3){setUsernameErr("Usernames are at least 3 characters (letters, numbers, underscore).");return;}
    if(!auth?.user?.id||!auth?.token){setUsernameErr("Please sign in again.");return;}
    setUsernameBusy(true);setUsernameErr("");
    try{
      // Availability check is best-effort (RLS may block reading others' rows).
      // The DB unique index is the real guard, so a blocked check is non-fatal.
      try{
        const existing=await hostRest(`profiles?username=eq.${encodeURIComponent(u)}&select=user_id`,{},auth.token);
        if(existing&&existing.length>0&&existing[0].user_id!==auth.user.id){
          setUsernameErr("That username is taken. Try another.");setUsernameBusy(false);return;
        }
      }catch{}
      const saved=await upsertProfile({user_id:auth.user.id,username:u},auth.token);
      if(saved===null){
        const e=upsertProfile._lastError||"";
        if(/username/i.test(e)&&/column|schema|does not exist|find/i.test(e))
          setUsernameErr("The username field isn't set up yet — run profiles_username_migration.sql in Supabase.");
        else if(/duplicate|unique/i.test(e))
          setUsernameErr("That username is taken. Try another.");
        else
          setUsernameErr("Couldn't save: "+(e?e.slice(0,120):"unknown error")+".");
        setUsernameBusy(false);return;
      }
      setAuth(a=>a?{...a,profile:{...a.profile,username:u}}:a);
      try{const raw=localStorage.getItem("athlink_auth");if(raw){const s=JSON.parse(raw);s.profile={...(s.profile||{}),username:u};localStorage.setItem("athlink_auth",JSON.stringify(s));}}catch{}
      setShowUsername(false);setUsernameInput("");
    }catch(e){setUsernameErr("Couldn't save that username — please try again.");}
    finally{setUsernameBusy(false);}
  };

  // ── Signup host callbacks (create new host / register pending owner) ──
  // Creates a host row in `hosts` and adds it to the local registry; returns {id}.
  const createHostFromSignup=async(spec,tok)=>{
    const name=(spec.name||"").trim(); if(!name) return null;
    const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,32)||"host";
    const id=slug+"-"+Math.random().toString(36).slice(2,6);
    const country=spec.country?String(spec.country).toUpperCase():null;
    // Host auto-grab: fold the confirmed dossier + the typed results website into
    // hosts.dossier (migration 0012). Website goes under identity so discovery can
    // scope competition research to it. A signup that skipped research still
    // records the website (minimal, unconfirmed dossier).
    let dossier=spec.dossier||null;
    if(spec.website){
      dossier=dossier
        ?{...dossier,identity:{...(dossier.identity||{}),website:spec.website}}
        :{identity:{website:spec.website},confirmed:false};
    }
    const base={id,type:spec.type,scope:spec.scope||"HK",name,
      cls:spec.type==="association"?spec.cls:null,country};
    // Persist. The host row is ESSENTIAL (it's what makes the club/association/
    // federation appear in the directory); the dossier is best-effort. The
    // dossier column may not exist yet (migration 0012 pending) and PostgREST
    // rejects the WHOLE insert on an unknown column — which would silently drop
    // the new host. So try WITH dossier, and on failure retry WITHOUT it so the
    // host always gets created (dossier just isn't stored until 0012 lands).
    let ins=dossier?await sbPost("hosts",{...base,dossier}):null;
    if(!ins) ins=await sbPost("hosts",base);
    if(!ins) console.error("createHostFromSignup: hosts insert failed for",name);
    addHostLocal({id,type:spec.type,scope:spec.scope||"HK",name,
      ...(spec.type==="association"&&spec.cls?{cls:spec.cls}:{}),
      ...(country?{country}:{}),
      ...(dossier?{dossier}:{})});
    setHostsVersion(v=>v+1);
    await reloadHosts();
    return {id};
  };
  // Registers the signing-up user as Owner of a host, ACTIVE but verified=false
  // (so the app treats them as guest until an admin flips verified=true).
  const claimHostFromSignup=async(hostId,userId,tok)=>{
    await hostRest("host_members",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
      body:JSON.stringify({host_id:hostId,user_id:userId,role:"owner",status:"active",verified:false})},tok);
    await logHostAudit(hostId,userId,"claim",userId,"signup — pending verification",tok);
  };

  // ── Dev approvals: approve / delete / reassign pending host memberships ──
  const devApproveMember=async(m)=>{
    await hostRest(`host_members?id=eq.${m.id}`,{method:"PATCH",body:JSON.stringify({verified:true,status:"active"})},auth.token);
    await logHostAudit(m.host_id,auth.user.id,"verify",m.user_id,"dev approval",auth.token);
    await reloadMemberships();
  };
  const devDeleteMember=async(m)=>{
    // Always remove the membership.
    await hostRest(`host_members?id=eq.${m.id}`,{method:"DELETE"},auth.token);
    await logHostAudit(m.host_id,auth.user.id,"revoke",m.user_id,"dev delete",auth.token);
    // If the host has no results AND no other members, delete the portal too.
    const others=await hostRest(`host_members?host_id=eq.${encodeURIComponent(m.host_id)}&select=id`,{},auth.token);
    const evCount=events.filter(e=>eventAssocs(e).includes(m.host_id)).length;
    const isDefault=[...DEFAULT_ASSOCIATIONS,...DEFAULT_CLUBS,...DEFAULT_FEDERATIONS].some(h=>h.id===m.host_id);
    if((others||[]).length===0&&evCount===0&&!isDefault){
      removeHostLocal(m.host_id);setHostsVersion(v=>v+1);
      try{await sbDel("hosts","id=eq."+encodeURIComponent(m.host_id));}catch(e){console.error("devDeleteMember portal delete",e);}
    }
    await reloadMemberships();
  };
  const devReassignMember=async(m,newHostId)=>{
    await hostRest(`host_members?id=eq.${m.id}`,{method:"PATCH",body:JSON.stringify({host_id:newHostId})},auth.token);
    await logHostAudit(newHostId,auth.user.id,"reassign",m.user_id,`from ${m.host_id}`,auth.token);
    // If the old host is now orphaned (newly-created, no results, no members), clean it up.
    const others=await hostRest(`host_members?host_id=eq.${encodeURIComponent(m.host_id)}&select=id`,{},auth.token);
    const evCount=events.filter(e=>eventAssocs(e).includes(m.host_id)).length;
    const isDefault=[...DEFAULT_ASSOCIATIONS,...DEFAULT_CLUBS,...DEFAULT_FEDERATIONS].some(h=>h.id===m.host_id);
    if((others||[]).length===0&&evCount===0&&!isDefault){
      removeHostLocal(m.host_id);setHostsVersion(v=>v+1);
      try{await sbDel("hosts","id=eq."+encodeURIComponent(m.host_id));}catch(e){console.error("devReassignMember cleanup",e);}
    }
    await reloadMemberships();
  };

  // ── Load the signed-in user's host memberships whenever auth changes ──
  const reloadMemberships=React.useCallback(async()=>{
    if(!auth?.user?.id||!auth?.token){setMyMemberships([]);return;}
    const rows=await fetchMyMemberships(auth.user.id,auth.token);
    if(rows) setMyMemberships(rows);
  },[auth]);
  useEffect(()=>{ reloadMemberships(); },[reloadMemberships]);

  // ── Load all athlete claims (for verified badges + admin review) ──
  const reloadClaims=React.useCallback(async()=>{
    if(!auth?.token){setAllClaims([]);return;}
    const rows=await fetchAllClaims(auth.token);
    if(rows) setAllClaims(rows);
  },[auth]);
  useEffect(()=>{ reloadClaims(); },[reloadClaims]);

  // ── Load owner-set athlete profile extras (public read; anon ok) ──
  const reloadAthleteProfiles=React.useCallback(async()=>{
    const rows=await fetchAllAthleteProfiles(auth?.token);
    if(rows){const m={};rows.forEach(r=>{m[r.name_key]=r;});setAthleteProfiles(m);}
  },[auth]);
  useEffect(()=>{ reloadAthleteProfiles(); },[reloadAthleteProfiles]);

  // ── Load persisted custom boat classes (public read; merge into the registry) ──
  // DB rows are authoritative for their canonical key (they replace any locally
  // synthesized entry so everyone sees the creator's exact label/colour). Runs
  // for anon viewers too — custom_classes has public SELECT — so logged-out
  // pages never show grey nuggets. When signed in, any queued writes that
  // previously failed (or were made while signed out) are re-tried here.
  useEffect(()=>{
    (async()=>{
      const rows=await fetchCustomClasses(auth?.token);
      if(Array.isArray(rows)&&rows.length){
        const db=new Map(rows.filter(r=>r.canonical).map(r=>[r.canonical,{id:r.id,short:r.short,full:r.full||r.short,color:r.color,canonical:r.canonical}]));
        setCustomClassRegistry([...db.values(),...CUSTOM_CLASSES.filter(c=>!db.has(c.canonical))]);
        setCustomClasses(CUSTOM_CLASSES);
        rows.forEach(r=>dropPendingCustomClass(r.canonical)); // already in DB — no retry needed
      }
      if(auth?.user?.id&&auth?.token){
        for(const cc of readPendingCustomClasses()) await persistCustomClass(cc);
      }
    })();
  },[auth]);
  // ── Safety net: never show a grey "unrecognized" nugget ──
  // Any event that references a custom:<slug> id with no registry entry (legacy
  // rows whose insert was lost before the write-behind queue existed) gets a
  // synthesized entry — prettified label + palette colour. In-memory only: the
  // DB write path stays with the real creator flow above.
  useEffect(()=>{
    const missing=new Map();
    events.forEach(ev=>{
      const id=ev.cls;
      if(typeof id!=="string"||!id.startsWith("custom:")) return;
      const canonical=id.slice(7);
      if(!canonical||missing.has(canonical)||CUSTOM_CLASSES.some(c=>c.canonical===canonical)) return;
      const color=CUSTOM_CLASS_PALETTE[(CUSTOM_CLASSES.length+missing.size)%CUSTOM_CLASS_PALETTE.length];
      const nm=prettifyClassSlug(canonical);
      missing.set(canonical,{id,short:nm,full:nm,color,canonical});
    });
    if(missing.size){ setCustomClassRegistry([...CUSTOM_CLASSES,...missing.values()]); setCustomClasses(CUSTOM_CLASSES); }
  },[events,customClasses]);
  // Extras row for a profile name (or null).
  const athleteProfileOf=(nm)=>athleteProfiles[profileNameKey(nm)]||null;
  // Can the signed-in user edit this profile's extras? Verified owner, or dev.
  const isProfileOwner=(nm)=>devMode||(myClaimFor(nm)?.status==="approved");
  // Persist extras for a profile name, then refresh. Dev view saves without a
  // session: anon writes, updated_by null (RLS policy from migration 0013).
  const saveAthleteExtras=async(nm,patch)=>{
    if(!devMode&&(!auth?.user?.id||!auth?.token)) return;
    await upsertAthleteProfile(nm,patch,auth?.user?.id||null,auth?.token||null);
    await reloadAthleteProfiles();
  };
  // Persist the athlete's media gallery (array of {url,type,caption}), then refresh.
  const saveAthleteMedia=async(nm,media)=>{
    if(!devMode&&(!auth?.user?.id||!auth?.token)) return;
    await upsertAthleteProfile(nm,{media:media||[]},auth?.user?.id||null,auth?.token||null);
    await reloadAthleteProfiles();
  };
  // Owner/dev rename: rename entries everywhere, keep the approved claim pointing
  // at the new name (so the owner keeps edit rights), and migrate the extras row.
  const renameOwnedAthlete=async(oldName,newName)=>{
    const nn=(newName||"").trim(); if(!nn||nn===oldName) return;
    const mine=myClaimFor(oldName);
    const extras=athleteProfileOf(oldName);
    await renameAthlete(oldName,nn);
    if(mine&&mine.status==="approved"){
      try{await hostRest(`athlete_claims?id=eq.${mine.id}`,{method:"PATCH",body:JSON.stringify({profile_name:nn})},auth.token);}catch(e){console.error("rename: claim follow",e);}
      await reloadClaims();
    }
    if(extras&&(devMode||auth?.user?.id)){
      await upsertAthleteProfile(nn,{bio:extras.bio,instagram_url:extras.instagram_url,nat_override:extras.nat_override,photo_url:extras.photo_url,media:extras.media||[]},auth?.user?.id||null,auth?.token||null);
      await reloadAthleteProfiles();
    }
  };

  // ── Public username / host-slug editing (the URL identity) ──────────────────
  // Distinct from profiles.username (login handle). Athlete usernames live in
  // athlete_usernames; host slugs in hosts.slug. Case preserved (CaseyLaw, HKSF);
  // uniqueness is case-insensitive and spans BOTH athletes and hosts.
  const[usernamesVersion,setUsernamesVersion]=useState(0); // bump → routing re-reads the map
  const USERNAME_RESERVED=new Set(["sailing","athletes","ranking","rankings","event","competition","competitions","clubs","class","classes","api","sailti","host","hosts","athlete","profile","landing"]);
  const validateUsername=(u)=>{
    const s=String(u||"").trim();
    if(!/^[A-Za-z0-9]{3,30}$/.test(s)) return {ok:false,msg:"3–30 characters, letters and numbers only (no spaces or symbols)."};
    if(USERNAME_RESERVED.has(s.toLowerCase())) return {ok:false,msg:"That word is reserved — pick another."};
    return {ok:true,value:s};
  };
  // Free across athletes AND hosts (case-insensitive), ignoring the row we own.
  const usernameAvailable=async(desired,{selfNameKey=null,selfHostId=null}={})=>{
    const q=encodeURIComponent(desired); // ilike w/o wildcards = case-insensitive equality
    const au=await sbGet(`athlete_usernames?username=ilike.${q}&select=name_key`);
    if(au&&au.some(r=>r.name_key!==selfNameKey)) return false;
    const hs=await sbGet(`hosts?slug=ilike.${q}&select=id`);
    if(hs&&hs.some(r=>r.id!==selfHostId)) return false;
    return true;
  };
  const saveAthleteUsername=async(name,desired)=>{
    const v=validateUsername(desired); if(!v.ok) return {error:v.msg};
    if(!devMode&&(!auth?.user?.id||!auth?.token)) return {error:"Please sign in again."};
    const nk=profileNameKey(name);
    if((ATHLETE_USERNAMES.byKey.get(nk)||"")===v.value) return {ok:true,username:v.value};
    if(!(await usernameAvailable(v.value,{selfNameKey:nk}))) return {error:"That username is taken. Try another."};
    const body={name_key:nk,username:v.value,display_name:name,is_custom:true,updated_by:auth?.user?.id||null,updated_at:new Date().toISOString()};
    const res=await hostRest("athlete_usernames",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates,return=representation"},body:JSON.stringify(body)},auth?.token||null);
    if(!res) return {error:"Couldn't save — you may not be the verified owner of this profile."};
    const old=ATHLETE_USERNAMES.byKey.get(nk); if(old) ATHLETE_USERNAMES.byUser.delete(old.toLowerCase());
    ATHLETE_USERNAMES.byKey.set(nk,v.value); ATHLETE_USERNAMES.byUser.set(v.value.toLowerCase(),name);
    setUsernamesVersion(x=>x+1);
    if(view.name==="profile"&&profileNameKey(view.id)===nk) window.history.replaceState(null,"","/"+v.value);
    return {ok:true,username:v.value};
  };
  const saveHostSlug=async(hostId,desired)=>{
    const v=validateUsername(desired); if(!v.ok) return {error:v.msg};
    if(!devMode&&!auth?.token) return {error:"Please sign in again."};
    const h=hostById(hostId); if(!h) return {error:"Host not found."};
    if((h.slug||"")===v.value) return {ok:true,slug:v.value};
    if(!(await usernameAvailable(v.value,{selfHostId:hostId}))) return {error:"That username is taken. Try another."};
    const res=await hostRest(`hosts?id=eq.${encodeURIComponent(hostId)}`,{method:"PATCH",headers:{"Prefer":"return=representation"},body:JSON.stringify({slug:v.value})},auth?.token||null);
    if(!res) return {error:"Couldn't save — you may not have permission."};
    h.slug=v.value; setHostsVersion(x=>x+1);
    if(portal===hostId) window.history.replaceState(null,"",stateToPath(portal,view));
    return {ok:true,slug:v.value};
  };

  // ── Load all event claims (host claims on externally-contributed events) ──
  const reloadEventClaims=React.useCallback(async()=>{
    if(!auth?.token){setAllEventClaims([]);return;}
    const rows=await fetchAllEventClaims(auth.token);
    if(rows) setAllEventClaims(rows);
  },[auth]);
  useEffect(()=>{ reloadEventClaims(); },[reloadEventClaims]);

  // ── Host admin claims an externally-contributed event for their host ──
  const submitEventClaim=async(eventId,hostId)=>{
    if(!auth?.user?.id||!auth?.token){setShowSignIn(true);return;}
    const r=await createEventClaim(eventId,hostId,auth.user.id,null,auth.token);
    if(r){setNote({name:"",matched:0,created:0,msg:"Competition claim submitted — a verified admin can approve it in the host's Manage panel."});setTimeout(()=>setNote(null),7000);await reloadEventClaims();}
  };

  // ── Athlete submits a claim on their auto-built profile ──
  const submitClaim=async(profileName)=>{
    if(!auth?.user?.id||!auth?.token){setShowSignIn(true);return;}
    // Athlete accounts only, one live claim per user — mirrors RLS 0017 so a
    // stale UI can't fire an insert the DB would reject anyway.
    if(auth?.profile?.role!=="athlete") return;
    if(allClaims.some(c=>c.user_id===auth.user.id&&c.status!=="denied")) return;
    const r=await createClaim(profileName,auth.user.id,auth.token);
    if(r){setClaimNote({name:profileName,status:"pending"});setTimeout(()=>setClaimNote(null),6000);await reloadClaims();}
  };

  // ── Host admin approves/denies an athlete claim ──
  // On APPROVE, auto-deny every OTHER pending claim on the same profile name:
  // only one person can own a profile, so siblings can't stay open.
  const resolveClaim=async(claim,approve,hostId)=>{
    await decideClaim(claim.id,approve,auth.user.id,hostId,auth.token);
    if(approve){
      const lower=String(claim.profile_name||"").toLowerCase();
      const siblings=allClaims.filter(c=>c.id!==claim.id&&c.status==="pending"&&c.profile_name?.toLowerCase()===lower);
      for(const s of siblings){
        try{await decideClaim(s.id,false,auth.user.id,hostId,auth.token);}catch(e){console.error("sibling claim auto-deny",e);}
      }
    }
    await reloadClaims();
  };

  // ── Detect invite link on mount ──
  // Strips ?invite= from URL immediately, stores token in state.
  // SignInModal handles the full redemption flow.
  // If user is ALREADY signed in when they click the link, redeem directly.
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const token=params.get("invite");
    if(!token) return;
    const clean=new URL(window.location.href); clean.searchParams.delete("invite");
    window.history.replaceState(null,"",clean.pathname+(clean.search||""));
    setPendingInviteToken(token);
    setShowSignIn(true); // open signup modal
  },[]);

  // ── Detect ?signup=1 on mount (landing page "Create a profile" button) ──
  // Strips the param and opens the sign-in/sign-up modal.
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    if(params.get("signup")!=="1") return;
    const rl=params.get("role"); // athlete|scout|fan|host|club|association|federation
    const clean=new URL(window.location.href); clean.searchParams.delete("signup"); clean.searchParams.delete("role");
    window.history.replaceState(null,"",clean.pathname+(clean.search||""));
    if(rl) setSignupRole(rl);
    setShowSignIn(true);
  },[]);

  // If already signed in when invite arrives, redeem directly without going through signup
  useEffect(()=>{
    if(!pendingInviteToken||!auth?.user?.id||!auth?.token) return;
    (async()=>{
      const rows=await fetchInviteByToken(pendingInviteToken,auth.token);
      const inv=rows&&rows[0];
      if(!inv){setInviteRedeemed({status:"invalid"});setPendingInviteToken(null);return;}
      if(inv.used_at){setInviteRedeemed({status:"used"});setPendingInviteToken(null);return;}
      if(new Date(inv.expires_at)<new Date()){setInviteRedeemed({status:"expired"});setPendingInviteToken(null);return;}
      // Already signed in — create membership directly, mark used
      await hostRest("host_members",{method:"POST",headers:{"Prefer":"resolution=ignore-duplicates,return=representation"},
        body:JSON.stringify({host_id:inv.host_id,user_id:auth.user.id,role:inv.role,status:"active",verified:true})},auth.token);
      await markInviteUsed(pendingInviteToken,auth.user.id,auth.token);
      // Upgrade profile role to the host type if they were a guest/athlete
      const hostType=hostById(inv.host_id)?.type||"club";
      if(auth.profile?.role!==hostType){
        const newProf={...(auth.profile||{}),user_id:auth.user.id,role:hostType};
        await upsertProfile(newProf,auth.token);
        setAuth(a=>a?{...a,profile:{...a.profile,role:hostType}}:a);
      }
      setInviteRedeemed({status:"joined",hostId:inv.host_id,role:inv.role});
      setPendingInviteToken(null);
      await reloadMemberships();
    })();
  },[pendingInviteToken,auth]);
  const[portal,setPortal]=useState(null);
  const[view,setView]=useState({name:"portals"});
  const[navStack,setNavStack]=useState([]); // universal back-button history
  const[urlReady,setUrlReady]=useState(false); // true once the initial deep-link has been resolved → forward URL sync active
  const[q,setQ]=useState("");const[filter,setFilter]=useState("all");

  // ── Merge duplicate athlete profiles ───────────────────────
  // Renames every entry of `duplicate` → `primary` (persisted), then removes any
  // entry that became an exact duplicate within the same event (same person +
  // same sail + same results), so no profile shows the same competition twice.
  const mergeAthletes=async(primary,duplicate)=>{
    if(primary===duplicate) return;
    // Persist name change for each affected entry
    events.forEach(ev=>ev.entries.forEach(e=>{
      if(!e._dbId) return;
      const patch={};
      if(e.helm===duplicate) patch.helm_name=primary;
      if(e.crew===duplicate) patch.crew_name=primary;
      if(Object.keys(patch).length) sbPatch("entries",`id=eq.${e._dbId}`,patch);
    }));
    setEvents(prev=>prev.map(ev=>{
      // 1. rename
      let entries=ev.entries.map(e=>({
        ...e,
        helm:e.helm===duplicate?primary:e.helm,
        crew:e.crew===duplicate?primary:e.crew,
      }));
      // 2. drop within-event duplicate entries (same sig); delete the dupes in DB
      const seen=new Set();
      entries=entries.filter(e=>{
        const sig=`${e.helm}|${e.crew}|${e.sail}|${(e.races||[]).join(",")}`;
        if(seen.has(sig)){ if(e._dbId) sbDel("entries",`id=eq.${e._dbId}`); return false; }
        seen.add(sig); return true;
      });
      return{...ev,entries};
    }));
  };
  // Merge an entire group's names into the primary (first = most competitions)
  const mergeGroup=async(names)=>{
    const[primary,...dupes]=names;
    for(const d of dupes) await mergeAthletes(primary,d);
  };
  // Dev: rename an athlete everywhere (persists to every entry where they appear).
  const renameAthlete=async(oldName,newName)=>{
    const nn=(newName||"").trim(); if(!nn||nn===oldName) return;
    await mergeAthletes(nn,oldName);
  };
  const[athleteSmart,setAthleteSmart]=useState(null); // {label, fn} parsed NL athlete filter
  const[athleteSmartLoading,setAthleteSmartLoading]=useState(false);
  const[compQ,setCompQ]=useState(""); // filter on the global Competitions page
  const[hostQ,setHostQ]=useState(""); // filter on the global Hosts page
  const[note,setNote]=useState(null);
  const[open,setOpen]=useState(false);
  const[tab,setTab]=useState("ai");  // "ai" | "manual"
  const[mf,setMf]=useState(emptyForm());
  const manualCalc=useMemo(()=>{
    const maxPer=Array.from({length:mf.numRaces},(_,j)=>{
      let mx=0;mf.rows.forEach(r=>{const s=(r.scores[j]||"").trim();if(/^\d+$/.test(s))mx=Math.max(mx,parseInt(s));});return mx;
    });
    return mf.rows.map(row=>{
      const pts=Array.from({length:mf.numRaces},(_,j)=>{
        const s=(row.scores[j]||"").trim();if(!s)return null;
        if(/^\d+$/.test(s))return parseInt(s);return maxPer[j]>0?maxPer[j]:null;
      }).filter(v=>v!==null);
      if(!pts.length)return{total:null,net:null};
      const total=pts.reduce((a,b)=>a+b,0);
      const disc=Math.min(mf.discards,Math.max(0,pts.length-1));
      const sorted=[...pts].sort((a,b)=>b-a);
      const dropped=sorted.slice(0,disc).reduce((a,b)=>a+b,0);
      return{total,net:total-dropped};
    });
  },[mf]);
  const[pdfError,setPdfError]=useState("");
  const[liveUrl,setLiveUrl]=useState("");               // AI Entry: paste a results link
  const[importStep,setImportStep]=useState("upload");
  const[importKind,setImportKind]=useState("past");   // mhead tab: "past" results vs "upcoming" entry lists
  // Drag-and-drop upload state. dragDepth is a counter: dragenter/dragleave fire on
  // child elements too, so a bare boolean flickers — count nested enters/leaves and
  // treat depth>0 as "dragging over the zone".
  const[dragDepth,setDragDepth]=useState(0);
  const[fleetChoices,setFleetChoices]=useState([]);
  const[pdfMeta,setPdfMeta]=useState(null);
  const[previewEv,setPreviewEv]=useState(null);
  const[previewEdit,setPreviewEdit]=useState(null);
  // Import queue: each pending result = {id,name,status:'parsing'|'ok'|'error'|'published',
  //   error, previewEv, subclass, collabs, notes:[…], publishedMsg}. The import pop-up is
  //   the hub: parses append here (never replace), items are reviewed via their own
  //   editor tab and stay in the list — ticked off — once published.
  // activePending = the ID of the item open in the editor (null = on the hub list).
  //   IDs, not indexes: concurrent parses expand multi-fleet files in place, which
  //   shifts positions under an open editor.
  const[pending,setPending]=useState([]);
  const[activePending,setActivePending]=useState(null);
  // Busy = anything still parsing. Derived, so concurrent batches can't fight over
  // a boolean; used for spinners only — the hub NEVER locks uploads while parsing.
  const pdfLoading=pending.some(p=>p.status==="parsing");
  const[previewEditVal,setPreviewEditVal]=useState("");
  // Div-header rename popover: {x,y,rows:[{from,val}]} — rename a division tag
  // (e.g. "Jr" → "U18") across EVERY row of the active preview at once.
  const[divHdrEdit,setDivHdrEdit]=useState(null);
  // Web-lookup enrichment suggestions, keyed by pending-item id →
  //   {date,country,source,dismissed}. Populated best-effort by the enrichment
  //   effect when a parsed preview still lacks a date/country. UI-only, never
  //   auto-applied — the user clicks Apply per value.
  const[enrichSug,setEnrichSug]=useState({});
  const[editCell,setEditCell]=useState(null);
  const[editVal,setEditVal]=useState("");
  const[editEvMeta,setEditEvMeta]=useState(null);
  const[deleteConfirm,setDeleteConfirm]=useState(null); // {id, name, pos}
  const[evFilter,setEvFilter]=useState("");     // AI filter query for events list
  const[evFilterActive,setEvFilterActive]=useState(null); // (legacy single) kept for compatibility
  const[evFilterChips,setEvFilterChips]=useState([]);      // cumulative AND-ed event filters
  const[evFilterLoading,setEvFilterLoading]=useState(false);
  const[profileFilter,setProfileFilter]=useState("");  // AI filter input for profile history
  const[profileFilterChips,setProfileFilterChips]=useState([]); // cumulative AND-ed filters
  const[profileFilterLoading,setProfileFilterLoading]=useState(false);
  const[footprintOpen,setFootprintOpen]=useState(false);
  const[profileTab,setProfileTab]=useState("footprint");
  // Shared profile year selection {key:athleteName, years:[...]}; null = all years.
  // Keyed by athlete so switching profiles cleanly falls back to that athlete's full career.
  const[yearSel,setYearSel]=useState(null);
  const[hostFootprintOpen,setHostFootprintOpen]=useState(false);
  const[confirmState,setConfirmState]=useState(null); // in-app confirm dialog (replaces window.confirm)
  const[editingAthName,setEditingAthName]=useState(null); // {orig} when renaming on the profile page
  const[athNameFirst,setAthNameFirst]=useState("");
  const[athNameLast,setAthNameLast]=useState("");
  const[regattaFootprint,setRegattaFootprint]=useState(null);
  const[evSuggestions,setEvSuggestions]=useState([]);
  const[evSugLoading,setEvSugLoading]=useState(false);
  const[evSugTimer,setEvSugTimer]=useState(null);
  const[profileSuggestions,setProfileSuggestions]=useState([]);
  const[profileSugLoading,setProfileSugLoading]=useState(false);
  const[profileSugTimer,setProfileSugTimer]=useState(null);
  // Fast-suggestion plumbing (§5c): cancel the in-flight request on every new
  // keystroke (AbortController) so a slow earlier query never overwrites a newer
  // one, and cache completed suggestions per query so backspacing is instant.
  const evSugAbortRef=React.useRef(null);
  const evSugCacheRef=React.useRef(new Map());
  const profileSugAbortRef=React.useRef(null);
  const profileSugCacheRef=React.useRef(new Map());
  // Global search
  const[gSearch,setGSearch]=useState("");
  // Calendar
  const[showCalendar,setShowCalendar]=useState(false);
  const[calScopePortal,setCalScopePortal]=useState(null); // null = global; else portal id for popup scope
  // Ranking page
  const[rankCls,setRankCls]=useState("29er");
  const[rankMode,setRankMode]=useState("cumulative"); // "cumulative" (every race) | "position" (regatta placings)
  const[rankCountry,setRankCountry]=useState(""); // country lens on the Rankings page ("" = all)
  const[rankDiscards,setRankDiscards]=useState(0);    // configurable; default 0
  const[rankSourceOpen,setRankSourceOpen]=useState(null);   // collapsed by default
  const[rankSelected,setRankSelected]=useState(()=>{
    try{const s=localStorage.getItem("athlink_rank_selected");return s?new Set(JSON.parse(s)):new Set();}catch{return new Set();}
  });
  useEffect(()=>{try{localStorage.setItem("athlink_rank_selected",JSON.stringify([...rankSelected]));}catch{}},[rankSelected]);
  const[rankExpanded,setRankExpanded]=useState(()=>new Set());
  const toggleRankCell=k=>setRankExpanded(prev=>{const n=new Set(prev);n.has(k)?n.delete(k):n.add(k);return n;});
  // Current-year federation competitions of a class (default selection)
  const defaultRankIds=clsId=>{const yr=String(new Date().getFullYear());
    return events.filter(e=>e.cls===clsId&&e.status!=="Draft"&&governingFeds(e).length>0&&/(\d{4})/.test(e.date||"")&&(e.date||"").match(/(\d{4})/)[1]===yr).map(e=>e.id);};
  // On first visit to a class's ranking, auto-select its current-year federation comps
  // (unless the user already has a selection for that class — selections are remembered).
  const rankDefaultedRef=React.useRef(new Set());
  useEffect(()=>{
    if(view.name!=="ranking"||!events.length) return;
    if(rankDefaultedRef.current.has(rankCls)) return;
    rankDefaultedRef.current.add(rankCls);
    setRankSelected(prev=>{
      const hasThisClass=[...prev].some(id=>events.find(e=>e.id===id&&e.cls===rankCls));
      if(hasThisClass) return prev;
      const def=defaultRankIds(rankCls);
      return def.length?new Set([...prev,...def]):prev;
    });
  },[view.name,rankCls,events]);
  // Dev-mode host creation
  const[showAddHost,setShowAddHost]=useState(false);
  const[newHost,setNewHost]=useState({type:"club",scope:"HK",name:"",cls:"29er",country:"HKG"});
  const[addingHost,setAddingHost]=useState(false);
  const saveNewHost=async()=>{
    const name=(newHost.name||"").trim();
    if(!name) return;
    const slug=name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,"").slice(0,32)||"host";
    const id=slug+"-"+Math.random().toString(36).slice(2,6);
    const payload={
      id, type:newHost.type, scope:newHost.scope, name,
      cls:newHost.type==="association"?newHost.cls:null,
      country:newHost.type==="federation"?(newHost.country||"HKG").toUpperCase():null,
    };
    // Registry-shaped object (cls/country only where relevant)
    const host={id,type:newHost.type,scope:newHost.scope,name,
      ...(newHost.type==="association"?{cls:newHost.cls}:{}),
      ...(newHost.type==="federation"?{country:(newHost.country||"HKG").toUpperCase()}:{})};
    // Optimistic: portal appears immediately
    addHostLocal(host);
    setHostsVersion(v=>v+1);
    setShowAddHost(false);
    setNewHost({type:"club",scope:"HK",name:"",cls:"29er",country:"HKG"});
    setNote({name,matched:0,created:0,msg:`${payload.type} portal created.`});
    setTimeout(()=>setNote(null),5000);
    // Persist in the background; reconcile from DB on success
    try{
      const r=await sbPost("hosts",payload);
      if(r) await reloadHosts();
      else console.error("saveNewHost: Supabase save failed — host won't survive reload (run hosts_migration.sql).");
    }catch(err){console.error("saveNewHost: background save error",err);}
  };
  const deleteHost=(id,name,e)=>{
    if(e)e.stopPropagation();
    if(!devMode) return;
    setConfirmState({
      title:"Delete host?",
      message:`Delete host/portal "${name}"?\n\nThis removes the portal only — imported results stay intact and will simply no longer be grouped under this host.`,
      confirmLabel:"Delete",
      onConfirm:async()=>{
        removeHostLocal(id);
        setHostsVersion(v=>v+1);
        if(portal===id){setPortal(null);setView({name:"portals"});}
        try{await sbDel("hosts","id=eq."+encodeURIComponent(id));}catch(err){console.error("deleteHost: DB delete error",err);}
      }});
  };
  const[calClsSet,setCalClsSet]=useState(new Set()); // empty = All
  const[calQ,setCalQ]=useState("");
  const[calYear,setCalYear]=useState(new Date().getFullYear());
  const[calMonth,setCalMonth]=useState(new Date().getMonth()); // 0-indexed
  const[calViewMode,setCalViewMode]=useState("year");
  const[showSailorCal,setShowSailorCal]=useState(false);
  const[sailorCalName,setSailorCalName]=useState("");
  const[sailorCalClsSet,setSailorCalClsSet]=useState(new Set());
  const[sailorCalYear,setSailorCalYear]=useState(new Date().getFullYear());
  const[sailorCalMonth,setSailorCalMonth]=useState(new Date().getMonth());
  const[sailorCalViewMode,setSailorCalViewMode]=useState("year");
  const[gSearchOpen,setGSearchOpen]=useState(false);
  const[gSearchResults,setGSearchResults]=useState([]);

  useEffect(()=>{
    (async()=>{
     try{
      if(!sbH){
        console.warn("No Supabase credentials — no events to show");
        setEvents([]);
        return;
      }
      console.log("Loading from Supabase:", SB_URL);
      // Fetch events, hosts and the athlete-username registry IN PARALLEL. These
      // are independent queries; running them as a waterfall (as before) stacked
      // their latencies and left the screen blank for ~5s. We still APPLY hosts +
      // usernames before setEvents so the clean-URL resolvers can map
      // slugs/usernames on first paint.
      const [data,hostRows,uRows]=await Promise.all([
        sbGet("events?select=*,entries(*)&order=created_at.desc"),
        sbGet("hosts?select=*"),
        sbGet("athlete_usernames?select=name_key,username,display_name"),
      ]);
      if(data===null){
        console.error("Supabase load failed — check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
        setEvents([]);
        return;
      }
      console.log("Loaded",data.length,"events from Supabase");
      if(hostRows){applyDbHosts(hostRows);setHostsVersion(v=>v+1);}
      if(uRows){applyAthleteUsernames(uRows);}
      setEvents(data.map(dbToApp));
     } finally { setInitialLoading(false); }
    })();
  },[]);

  /* ── derived ──────────────────────────────────────────────── */
  // The athlete-directory / stats aggregations below are O(all events × all
  // entries) — ~300ms to rebuild on this dataset. They must NOT re-run
  // synchronously on every `events` mutation, or a bulk import (which changes
  // `events` twice per published fleet) freezes the UI for seconds at a time.
  // Deferring `events` for those memos lets React recompute them at low
  // priority: rapid successive imports collapse into ONE trailing recompute,
  // and interaction (clicks, typing, navigation) stays responsive. The
  // directory just shows the previous frame's data until the work lands.
  const evDir=useDeferredValue(events);
  const isClassPortal=typeof portal==="string"&&portal.startsWith("class:");
  const portalCls=isClassPortal?portal.slice(6):null; // base class id for a class portal
  // Membership of the CURRENT portal for the signed-in user (if any).
  const myPortalMembership=React.useMemo(
    ()=>myMemberships.find(m=>m.host_id===portal&&m.status==="active")||null,
    [myMemberships,portal]
  );
  const isPortalOwner=myPortalMembership?.role==="owner";
  // Does the signed-in user have ANY unverified host membership? (account badge)
  const hasPendingHostMembership=myMemberships.some(m=>!m.verified);
  // Athlete who hasn't claimed their auto-built profile yet → show a nudge to
  // claim it (and an avatar dot). Skip for hosts and dev mode.
  const myAthleteClaim=auth?.user?.id?allClaims.find(c=>c.user_id===auth.user.id):null;
  const showClaimNudge=!!auth&&role==="athlete"&&!devMode&&!myAthleteClaim&&!myMemberships.some(m=>m.verified);
  // A pending (unverified) host owner of THIS portal — sees guest UX everywhere
  // except a "pending approval" banner on their own portal page.
  const isPendingHostHere=!isClassPortal&&!!myPortalMembership&&!myPortalMembership.verified;
  // Write access: dev mode, OR an active + VERIFIED member of this (non-class) portal.
  const canEdit=devMode||(!isClassPortal&&!!myPortalMembership&&myPortalMembership.verified);
  // Manage members: dev, OR a VERIFIED member. Unverified (pending) owners are
  // treated as guests until the AthLink team approves them.
  const canManageMembers=devMode||(!isClassPortal&&!!myPortalMembership&&myPortalMembership.verified);
  const assoc=ASSOCIATIONS.find(a=>a.id===portal);
  const club=CLUBS.find(c=>c.id===portal);
  const fed=FEDERATIONS.find(f=>f.id===portal);
  const host=assoc||club||fed;
  // Collapse duplicate imports of the same competition (same name+date+class+
  // subclass), keeping the row with the most entries. Non-destructive (display).
  const dedupEvents=list=>{
    const byKey=new Map();
    for(const ev of list){
      const k=eventKey(ev);
      const cur=byKey.get(k);
      if(!cur||(ev.entries?.length||0)>(cur.entries?.length||0)) byKey.set(k,ev);
    }
    return[...byKey.values()];
  };
  const classEvents=useMemo(()=>{
    if(!portal) return [];
    const scoped=isClassPortal
      ? evDir.filter(e=>e.cls===portalCls)            // global class portal
      : evDir.filter(e=>eventAssocs(e).includes(portal)); // association portal
    return dedupEvents(scoped);
  },[evDir,portal,isClassPortal,portalCls]);
  const homeCountry=useMemo(()=>buildHomeCountry(evDir),[evDir]);
  // Rebuild the per-athlete attribute memory (gender/birth-year/recent class)
  // whenever events change. Downstream gender chips read ATHLETE_ATTRS.
  useMemo(()=>buildAthleteAttrs(evDir),[evDir]);
  // Pick the best display variant for a canonical group: the raw name that
  // appears in the most events (ties → the more "normal" mixed-case spelling).
  const displayNameFor=useMemo(()=>{
    const counts={};                  // canonKey -> {rawName: eventCount}
    events.forEach(ev=>{
      const seen=new Set();
      ev.entries.forEach(e=>[e.helm,e.crew].forEach(nm=>{
        if(!nm) return; const k=canonName(nm); if(!k) return;
        const id=k+"|"+nm; if(seen.has(id)) return; seen.add(id);
        (counts[k]=counts[k]||{})[nm]=(counts[k]?.[nm]||0)+1;
      }));
    });
    const best={};
    Object.entries(counts).forEach(([k,variants])=>{
      best[k]=Object.entries(variants).sort((a,b)=>{
        if(b[1]!==a[1]) return b[1]-a[1];               // most events first
        const am=/[a-z]/.test(a[0])&&/[A-Z]/.test(a[0]); // prefer mixed-case
        const bm=/[a-z]/.test(b[0])&&/[A-Z]/.test(b[0]);
        if(am!==bm) return am?-1:1;
        return a[0].localeCompare(b[0]);
      })[0][0];
    });
    return k=>best[k]||null;
  },[events]);
  const dispName=nm=>displayNameFor(canonName(nm))||nm;

  // Build the (deduped) athlete list for a set of events — one entry per
  // canonical identity, shown under its best display name. Non-destructive.
  const buildPeople=evs=>{
    const map=new Map();              // canonKey -> {name, cls}
    evs.forEach(ev=>ev.entries.forEach(e=>{
      [e.helm,e.crew].forEach(nm=>{
        if(!nm) return; const k=canonName(nm); if(!k||map.has(k)) return;
        map.set(k,{name:displayNameFor(k)||nm,cls:ev.cls});
      });
    }));
    return[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
  };
  const people=useMemo(()=>buildPeople(classEvents),[classEvents,displayNameFor]);
  const allPeople=useMemo(()=>buildPeople(evDir),[evDir,displayNameFor]);

  // ── Host competition footprint (for the clickable title globe) ──
  // countryCounts (ISO → # competitions) drives the globe; hostHistory feeds the
  // popup list in the same shape FootprintModal expects from an athlete.
  const hostCountryCounts=useMemo(()=>{
    if(!portal) return {};
    const m={};
    classEvents.forEach(ev=>{const iso=IOC_ISO[eventCountryCode(ev)||""]||"";if(iso)m[iso]=(m[iso]||0)+1;});
    // For host portals, always include the host's home location so the globe has a marker.
    // Class portals have no single home — the spread itself is the footprint.
    if(!isClassPortal){
      const hc=hostLocation(portal,events); const hiso=hc?IOC_ISO[String(hc).toUpperCase()]:null;
      if(hiso&&!m[hiso]) m[hiso]=0;
    }
    return m;
  },[portal,isClassPortal,classEvents,events]);
  const hostHistory=useMemo(()=>classEvents.map(ev=>{
    const sc=(()=>{try{return scoreEvent(ev);}catch{return null;}})();
    return {ev:{...ev,class:nuggetFor(ev.cls,ev.subclass).label},row:{rank:0},fleet:sc?sc.fleet:(ev.entries?.length||0),
      countries:new Set(ev.entries.flatMap(e=>[e.nat]).filter(Boolean)).size};
  }).sort((a,b)=>dateKey(b.ev.date).localeCompare(dateKey(a.ev.date))),[classEvents]);

  // ── Duplicate detection (review pile) ───────────────────────
  // Exact canonical matches (word order / case / accents / hyphens / punctuation)
  // are ALREADY collapsed in every view via displayNameFor — non-destructive, no
  // DB writes. The Duplicates tab only surfaces NEAR matches (spelling differs by
  // 1–2 chars) which a human must confirm. 3+ char differences are not shown.
  const lev=(a,b)=>{
    const m=a.length,n=b.length;
    if(!m) return n; if(!n) return m;
    let prevRow=Array.from({length:n+1},(_,j)=>j);
    for(let i=1;i<=m;i++){
      const cur=[i];
      for(let j=1;j<=n;j++) cur[j]=Math.min(prevRow[j]+1,cur[j-1]+1,prevRow[j-1]+(a[i-1]===b[j-1]?0:1));
      prevRow=cur;
    }
    return prevRow[n];
  };
  const regCount=nm=>{const t=canonName(nm);return events.filter(ev=>ev.entries.some(e=>canonName(e.helm)===t||canonName(e.crew)===t)).length;};
  // O(1) lookup version of regCount, precomputed once per `events` change. The manual-merge
  // search box was calling regCount() — an O(events) scan — inside a sort comparator on every
  // keystroke, which for a broad query (matching hundreds of names) froze the input for seconds.
  const regCountMap=useMemo(()=>{
    const m=new Map();
    for(const ev of events){
      const seen=new Set();
      for(const e of ev.entries){
        [e.helm,e.crew].forEach(nm=>{
          if(!nm) return;const t=canonName(nm);if(seen.has(t)) return;seen.add(t);
          m.set(t,(m.get(t)||0)+1);
        });
      }
    }
    return m;
  },[events]);
  const regCountFast=nm=>regCountMap.get(canonName(nm))||0;
  // Exact raw-name count — used to choose the merge primary so the most-used
  // first/last name ORDER wins (regCount is order-blind because it uses canon).
  const rawNameCount=nm=>events.filter(ev=>ev.entries.some(e=>e.helm===nm||e.crew===nm)).length;
  const athleteHostAssocs=nm=>{
    const t=canonName(nm),s=new Set();
    events.forEach(ev=>{ if(ev.entries.some(e=>canonName(e.helm)===t||canonName(e.crew)===t)) eventAssocs(ev).forEach(a=>s.add(a)); });
    return s;
  };

  // Nickname / abbreviation match on two canonical (sorted-token) keys: every
  // token identical except one pair, where the shorter is a prefix of the longer
  // — e.g. "chris lam" ⟷ "christopher lam". Levenshtein can't catch these (the
  // length gap is too big), so they were never surfaced for merging.
  const nickPair=(a,b)=>{
    const ta=a.split(" "),tb=b.split(" ");
    if(ta.length<2||tb.length<2) return false;            // need a surname for context
    const rem=new Map(); tb.forEach(t=>rem.set(t,(rem.get(t)||0)+1));
    const onlyA=[]; ta.forEach(t=>{const c=rem.get(t)||0; if(c>0) rem.set(t,c-1); else onlyA.push(t);});
    const onlyB=[...rem.entries()].flatMap(([t,c])=>Array(Math.max(0,c)).fill(t));
    if(onlyA.length!==1||onlyB.length!==1) return false;  // exactly one differing token each side
    const x=onlyA[0],y=onlyB[0];
    const short=x.length<=y.length?x:y, long=x.length<=y.length?y:x;
    return short.length>=3&&short!==long&&long.startsWith(short);
  };
  const dupGroups=useMemo(()=>{
    // This is an O(n²) Levenshtein sweep over EVERY athlete name — only the admin
    // "Duplicates" review tab consumes it. Computing it eagerly meant every event
    // publish (which changes `events`) re-ran it over the whole athlete set on the
    // main thread, freezing the UI for seconds during a bulk import. Compute it
    // only when that tab is actually open; the badge count fills in on open.
    if(!canEdit||filter!=="duplicates") return [];
    // distinct canonical keys (already display-deduped) → find near neighbours
    const keys=[...new Set(allPeople.map(p=>canonName(p.name)).filter(Boolean))];
    const groups=[];
    for(let i=0;i<keys.length;i++){
      const a=keys[i];
      for(let j=i+1;j<keys.length;j++){
        const b=keys[j];
        // Near-spelling match: Levenshtein ≤2 on similarly-sized keys.
        const near=Math.abs(a.length-b.length)<=2&&Math.min(a.length,b.length)>=4&&(()=>{const d=lev(a,b);return d>0&&d<=2;})();
        // Nickname/abbreviation match (same surname, first name shortened).
        const nick=!near&&nickPair(a,b);
        if(near||nick){
          const na=displayNameFor(a),nb=displayNameFor(b);
          if(na&&nb) groups.push({names:[na,nb].sort((x,y)=>rawNameCount(y)-rawNameCount(x)||regCount(y)-regCount(x)),kind:near?"near":"nick",key:[a,b].sort().join("~")});
        }
      }
    }
    return groups;
  },[allPeople,displayNameFor,evDir,canEdit,filter]);

  const myAssoc=auth?.profile?.class_id||null;
  // Persist "don't merge" dismissals across reloads (localStorage).
  const[dismissedDups2,setDismissedDups2]=useState(()=>{
    try{const s=localStorage.getItem("athlink_dismissed_dups");return s?new Set(JSON.parse(s)):new Set();}catch{return new Set();}
  });
  useEffect(()=>{try{localStorage.setItem("athlink_dismissed_dups",JSON.stringify([...dismissedDups2]));}catch{}},[dismissedDups2]);
  // Seed from the server too, so decisions persist across reloads AND devices.
  useEffect(()=>{(async()=>{
    const rows=await fetchDupDismissals();
    if(Array.isArray(rows)&&rows.length) setDismissedDups2(prev=>{const s=new Set(prev);rows.forEach(r=>r.key&&s.add(r.key));return s;});
  })();},[]);
  // True if a name competes in the given class (canonical match).
  const nameInClass=(nm,clsId)=>{const t=canonName(nm);return events.some(e=>e.cls===clsId&&e.entries.some(en=>canonName(en.helm)===t||canonName(en.crew)===t));};
  // Cards mid exit-animation: stay rendered (still matched by dismissedDups2) so the
  // fade/collapse can play instead of the list just snapping the next card into place.
  const[exitingDups,setExitingDups]=useState(new Set());
  const visibleDupGroups=useMemo(()=>{
    const dupClsId=isClassPortal?portalCls:(assoc?.cls||null); // class scope of the current portal, if any
    let g=dupGroups.filter(x=>!dismissedDups2.has(x.key)||exitingDups.has(x.key));
    // Within a class-scoped portal, only show duplicates whose athletes belong to THAT class.
    if(dupClsId) g=g.filter(x=>x.names.some(nm=>nameInClass(nm,dupClsId)));
    if(myAssoc) g=g.filter(x=>x.names.some(nm=>athleteHostAssocs(nm).has(myAssoc)));
    return g;
  },[dupGroups,dismissedDups2,exitingDups,myAssoc,events,portal,isClassPortal,portalCls]);

  // Manual merge — lets an admin pick ANY two profiles the auto-detector missed
  // (e.g. "Chris Lam" vs "Christopher Lam" when names diverge too far) and merge
  // them directly via mergeAthletes(). mmA = primary kept, mmB = folded in.
  const[mmA,setMmA]=useState(null);
  const[mmB,setMmB]=useState(null);
  const[mmActive,setMmActive]=useState(null); // which slot the picker is filling: "a"|"b"|null
  const[mmQ,setMmQ]=useState("");
  // Which flagged duplicate-review cards have had their merge direction flipped
  // by clicking the "merge into" arrow (default direction is g.names[0] ← g.names[last]).
  const[flippedDups,setFlippedDups]=useState(new Set());
  const dismissDupCard=(key,after)=>{
    setExitingDups(prev=>new Set(prev).add(key));
    after();
    setTimeout(()=>{
      setExitingDups(prev=>{const s=new Set(prev);s.delete(key);return s;});
    },380);
  };
  const doManualMerge=async()=>{
    if(!mmA||!mmB||canonName(mmA)===canonName(mmB)) return;
    await mergeAthletes(mmA,mmB);
    const key=[canonName(mmA),canonName(mmB)].sort().join("~");
    setDismissedDups2(prev=>{const s=new Set(prev);s.add(key);return s;});
    saveDupDismissals([key]);
    setMmA(null);setMmB(null);setMmActive(null);setMmQ("");
  };

  const previewScored=useMemo(()=>previewEv?scorePreview(previewEv):null,[previewEv]);
  const previewMaxRaces=useMemo(()=>{
    if(!previewEv?.entries?.length) return 0;
    return Math.max(...previewEv.entries.map(e=>(e.races||[]).length),1);
  },[previewEv]);

  const cls=assoc?(CLASSES.find(c=>c.id===assoc.cls)||customClassById(assoc.cls)):(isClassPortal?(CLASSES.find(c=>c.id===portalCls)||customClassById(portalCls)):null);
  const portalName=host?host.name:(isClassPortal?`All ${classLabel(portalCls)} Results`:"");
  const isGlobal=!portal;
  const currentPeople=isGlobal?allPeople:people;
  const athleteTitle=isGlobal?(view.name==="athletes"&&view.cls?`${classLabel(view.cls)} Athletes`:"All Athletes"):(cls?`${cls.short} Athletes`:`${portalName} Athletes`);
  // Precompute every athlete's card stats in ONE pass (events count, best rank,
  // nationality, most-recent class/subclass). Avoids calling aggregate()/athleteNat()
  // — each O(events) — once per card, which was making All Athletes very slow.
  const statScope=isGlobal?evDir:classEvents;
  const cardStats=useMemo(()=>{
    const m=new Map();
    for(const ev of statScope){
      if(ev.status==="Draft") continue;
      const s=scoreEvent(ev);
      const dk=dateKey(ev.date); // "" = undated; never allowed to claim recency
      for(const row of s.rows){
        [row.helm,row.crew].forEach(nm=>{
          if(!nm) return;const k=canonName(nm);if(!k) return;
          let o=m.get(k);if(!o){o={evset:new Set(),best:Infinity,nat:{},recentDK:"",recentCls:null,recentSub:null};m.set(k,o);}
          const sig=`${eventKey(ev)}|${row.sail||""}|${row.rank}|${row.net}|${(row.races||[]).join(",")}`;
          if(!o.evset.has(sig)){o.evset.add(sig);if(row.rank&&row.rank<o.best)o.best=row.rank;}
          if(row.nat)o.nat[row.nat]=(o.nat[row.nat]||0)+1;
          if(dk?dk>=o.recentDK:!o.recentDK&&!o.recentCls){o.recentDK=dk;o.recentCls=ev.cls;o.recentSub=ev.subclass||null;}
        });
      }
    }
    const out=new Map();
    for(const[k,o]of m){
      const nat=Object.keys(o.nat).length?Object.entries(o.nat).sort((a,b)=>b[1]-a[1])[0][0]:(META[displayNameFor(k)]?.nat||"");
      out.set(k,{events:o.evset.size,best:o.best===Infinity?null:o.best,nat,recentCls:o.recentCls,recentSub:o.recentSub});
    }
    return out;
  },[statScope]);
  const statOf=nm=>cardStats.get(canonName(nm))||{events:0,best:null,nat:"",recentCls:null,recentSub:null};
  // Global Athletes lenses — class + country carried in the view (class deep-links via /class/<id>/athletes)
  const athCls=(isGlobal&&view.name==="athletes")?(view.cls||null):null;
  const athCountry=(isGlobal&&view.name==="athletes")?(view.country||null):null;
  const athClsSet=useMemo(()=>{
    if(!athCls) return null;
    const s2=new Set();
    evDir.forEach(ev=>{if(ev.status==="Draft"||ev.cls!==athCls)return;(ev.entries||[]).forEach(e=>{if(e.helm)s2.add(canonName(e.helm));if(e.crew)s2.add(canonName(e.crew));});});
    return s2;
  },[evDir,athCls]);
  // Memoised so an active class/country lens doesn't produce a NEW filtered array
  // on every render — that fresh reference used to invalidate athleteGridContent's
  // memo on unrelated state changes (e.g. every keystroke/click in the import
  // modal), rebuilding the whole athlete grid each time.
  const lensPeople=useMemo(()=>(athClsSet||athCountry)
    ?currentPeople.filter(p=>(!athClsSet||athClsSet.has(canonName(p.name)))&&(!athCountry||statOf(p.name).nat===athCountry))
    :currentPeople
  ,[athClsSet,athCountry,currentPeople,cardStats]);
  // Progressive reveal so the page paints immediately and fills in as you scroll.
  const[athLimit,setAthLimit]=useState(120);
  const athSentinelRef=React.useRef(null);
  useEffect(()=>{setAthLimit(120);},[isGlobal,portal,view.name,filter,q,athleteSmart]);
  useEffect(()=>{
    if(view.name!=="athletes") return;
    const el=athSentinelRef.current;if(!el) return;
    const io=new IntersectionObserver(es=>{if(es[0].isIntersecting) setAthLimit(l=>l+120);},{rootMargin:"600px"});
    io.observe(el);return()=>io.disconnect();
  },[view.name,athLimit,filter,q]);
  const evLoc=ev=>[ev.country].filter(Boolean).join(" · ");
  const manualReady=!!mf.rows.filter(r=>r.helm.trim()).length;
  // Memoized so this (up to several hundred cards, each with a backdrop-filter blur) only
  // rebuilds when the underlying data/filters actually change — not on every unrelated
  // re-render (e.g. the floating top bar toggling on scroll), which was the "flashing" the
  // athlete thumbnails did while scrolling: the whole grid was being torn down and rebuilt
  // on every scroll-driven state update.
  const athleteGridContent=useMemo(()=>{
    if(filter==="duplicates") return null;
    const evScope=isGlobal?evDir:classEvents;
    const qlc=q.trim().toLowerCase();
    const shown=lensPeople
      .filter(p=>true)
      .filter(p=>{
        if(athleteSmart){
          try{ if(!athleteSmart.fn(athleteSummaryFor(p.name,evScope))) return false; }catch{}
        } else if(qlc){
          // live substring match on name OR country while no smart filter is set
          const nat=athleteNat(p.name,evScope);
          const cname=(GLOBE_NAMES[IOC_ISO[nat]]||nat||"").toLowerCase();
          if(!p.name.toLowerCase().includes(qlc)&&!cname.includes(qlc)) return false;
        }
        return true;
      });
    // group by nationality, country groups alphabetical, names alphabetical within
    const byCountry={};
    shown.forEach(p=>{
      const nat=statOf(p.name).nat;
      const key=nat||"ZZZ";
      if(!byCountry[key])byCountry[key]={nat,cname:GLOBE_NAMES[IOC_ISO[nat]]||nat||"Unknown",people:[]};
      byCountry[key].people.push(p);
    });
    const groups=Object.values(byCountry).sort((a,b)=>a.cname.localeCompare(b.cname));
    groups.forEach(g=>g.people.sort((a,b)=>a.name.localeCompare(b.name)));
    if(!shown.length) return <p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No athletes match.</p>;
    let gi=0,rendered=0;                       // cap total cards rendered for fast paint
    const out=[];
    for(const g of groups){
      if(rendered>=athLimit) break;
      const slice=g.people.slice(0,Math.max(0,athLimit-rendered));rendered+=slice.length;
      out.push(
      <div key={g.cname} style={{marginBottom:22}}>
        <div className="cgroup-head" style={{display:"flex",alignItems:"center",gap:9,margin:"4px 0 11px"}}>
          <span style={{fontSize:18}}>{g.nat?iocFlag(g.nat):""}</span>
          <span style={{fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:15,color:"var(--navy)"}}>{g.cname}</span>
          <span style={{fontSize:12,color:"var(--mut)",fontWeight:600}}>{g.people.length}</span>
          <div style={{flex:1,height:1,background:"var(--line)"}}/>
        </div>
        <div className="agrid">
          {slice.map(p=>{
            const st=statOf(p.name);
            const nat=st.nat;
            // Boat-class nugget = most-recent competition's class (ILCA 6 etc. if subclass present)
            const nug=st.recentCls?nuggetFor(st.recentCls,st.recentSub):null;
            return(<div className="acard" key={p.name} style={{animationDelay:`${(Math.min(gi++,40))*12}ms`}} onClick={()=>go({name:"profile",id:p.name})}>
              <div className="achead">
                <div className="av" style={{background:avatarColor(p.name)}}>{initials(p.name)}</div>
                <div style={{minWidth:0,flex:1}}>
                  <div className="acn">{nat?<span style={{fontSize:17}}>{iocFlag(nat)}</span>:null} {p.name}</div>
                </div>
              </div>
              <div className="acstat">
                <div><b>{st.events}</b>competitions</div><div><b>{st.best?"#"+st.best:"—"}</b>best</div>
                {nug&&<span className="cls" style={{background:nug.color,fontSize:9.5,marginLeft:"auto"}}>{nug.label}</span>}
              </div>
            </div>);
          })}
        </div>
      </div>);
    }
    out.push(<div key="__sentinel" ref={athSentinelRef} style={{height:1}}/>);
    return out;
  },[filter,isGlobal,evDir,classEvents,q,lensPeople,athleteSmart,cardStats,athLimit]);

  /* ── navigation ───────────────────────────────────────────── */
  // ── Navigation with universal history ───────────────────────
  const pushNav=()=>setNavStack(s=>[...s.slice(-19),{portal,view}]);
  const go=v=>{pushNav();setView(v);setQ("");setAthleteSmart(null);window.scrollTo(0,0);};
  const goHome=()=>{pushNav();setPortal(null);setView({name:"portals"});setQ("");setAthleteSmart(null);setEvFilterChips([]);setEvFilter("");window.scrollTo(0,0);};
  const enterPortal=id=>{pushNav();setPortal(id);setView({name:"events"});setQ("");setAthleteSmart(null);setEvFilterChips([]);setEvFilter("");window.scrollTo(0,0);};
  // Top-bar primary nav: always leaves any portal scope — the 3 doors are global.
  const goTop=(name,extra)=>{pushNav();setPortal(null);setView({name,...(extra||{})});setQ("");setAthleteSmart(null);setEvFilterChips([]);setEvFilter("");window.scrollTo(0,0);};
  // Which of the 4 nav doors the current page lives behind (drives the .on state).
  const navOn=view.name==="ranking"?"ranking"
    :view.name==="scout"?"scout"
    :(view.name==="competitions"||view.name==="event")?"competitions"
    :(view.name==="hosts"||(portal&&!String(portal).startsWith("class:")))?"hosts"
    :((view.name==="athletes"&&!portal)||view.name==="profile")?"athletes"
    :null;
  // Jump straight to a host's athletes (nav "Athletes › by host" submenu).
  const enterPortalAthletes=id=>{pushNav();setPortal(id);setView({name:"athletes"});setQ("");setAthleteSmart(null);window.scrollTo(0,0);};
  // Jump to the ranking page with a class preselected (nav "Rankings › by class").
  const goRankingClass=id=>{pushNav();setPortal(null);setRankCls(id);setRankSourceOpen(null);setRankExpanded(new Set());setView({name:"ranking"});setQ("");setAthleteSmart(null);window.scrollTo(0,0);};
  // Hosts + competition counts + home country — feeds the nav mega-menus and the Hosts page.
  const navHosts=(()=>{
    const pub=events.filter(ev=>ev.status!=="Draft");
    return [
      ...FEDERATIONS.map(h=>({...h,htype:"federation"})),
      ...CLUBS.map(h=>({...h,htype:"club"})),
      ...ASSOCIATIONS.map(h=>({...h,htype:"association"})),
    ].map(h=>({...h,n:pub.filter(ev=>eventAssocs(ev).includes(h.id)).length,
      // Flag/location next to the host name reads the EXPLICIT country only — never
      // derived from events or scope, so a country-less host shows no flag (Fix 2).
      loc:h.country?String(h.country).toUpperCase():""}))
     .sort((a,b)=>b.n-a.n);
  })();
  const hostCountries=[...new Set(navHosts.map(h=>h.loc).filter(Boolean))]
    .sort((a,b)=>(GLOBE_NAMES[IOC_ISO[a]]||a).localeCompare(GLOBE_NAMES[IOC_ISO[b]]||b));
  // Floating top bar: hide on scroll-down, reveal on scroll-up. Reset to shown on page change.
  // rAF-throttled — raw scroll events can fire many times per frame (esp. trackpad/momentum
  // scroll), and each one was triggering a full re-render of the whole page (incl. the
  // multi-hundred-card athlete grid, each with an expensive backdrop-filter blur), which is
  // what showed up as the thumbnails "flashing on and off" while scrolling.
  useEffect(()=>{
    let lastY=window.scrollY,ticking=false;
    const apply=()=>{
      ticking=false;
      const y=window.scrollY;
      if(y>lastY+6&&y>90){setBarHidden(true);setNavSearchOpen(false);setNavMenuOpen(false);}
      else if(y<lastY-6){setBarHidden(false);}
      lastY=y;
    };
    const onScroll=()=>{ if(!ticking){ticking=true;requestAnimationFrame(apply);} };
    window.addEventListener("scroll",onScroll,{passive:true});
    return()=>window.removeEventListener("scroll",onScroll);
  },[]);
  useEffect(()=>{setBarHidden(false);setNavSearchOpen(false);setNavMenuOpen(false);},[view.name,portal]);

  /* ── Clean-URL sync (shareable links + native back/forward) ───────────────
     stateToPath / pathToState (module scope) define the mapping. This block is
     the only place that touches window.history for in-app navigation. */
  // 1) On load, resolve the incoming path once the data needed for it exists.
  useEffect(()=>{
    if(urlReady) return;
    const path=window.location.pathname;
    const seg=decodeURIComponent(path).split("/").filter(Boolean);
    const s0=(seg[0]||"").toLowerCase();
    const RESERVED=["","sailing","athletes","ranking","rankings","event","competition","competitions","hosts","scout","class"];
    // Athlete slugs can only be resolved after events (hence names) have loaded.
    const needsAthlete=seg.length>0&&!RESERVED.includes(s0)&&!hostBySlug(seg[0]);
    if(needsAthlete&&events.length===0) return; // wait for events, effect re-runs on load
    const st=pathToState(path,collectAthleteNames(events));
    if(st){setPortal(st.portal);setView(st.view);}
    window.history.replaceState(null,"",stateToPath(st?st.portal:null,st?st.view:{name:"portals"}));
    setUrlReady(true);
  },[events,urlReady]);
  // Safety net: enable forward sync even if data never arrives.
  useEffect(()=>{const t=setTimeout(()=>setUrlReady(true),8000);return()=>clearTimeout(t);},[]);
  // 2) Forward: reflect every view change into the path.
  useEffect(()=>{
    if(!urlReady) return;
    const path=stateToPath(portal,view);
    if(path!==window.location.pathname){
      window.history.pushState(null,"",path);
      window.dispatchEvent(new Event("locationchange")); // let the shell re-sync
    }
  },[portal,view,urlReady]);
  // 3) Back/forward buttons: restore state from the URL (no push — guard above skips it).
  useEffect(()=>{
    const onPop=()=>{
      const st=pathToState(window.location.pathname,collectAthleteNames(events));
      setPortal(st?st.portal:null);
      setView(st?st.view:{name:"portals"});
      setNavStack(s=>s.slice(0,-1));
      setQ("");setAthleteSmart(null);window.scrollTo(0,0);
    };
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[events]);
  // 4) Browser tab title ⇄ current page. Each page reads as its own entity name
  //    (e.g. "Hong Kong Sailing Federation", an athlete name, an event) so tabs
  //    and history are legible; the sailing home / unknown falls back to AthLink.
  useEffect(()=>{
    const v=view||{name:"portals"};
    const hostName=id=>{const h=hostById(id); if(h) return h.name; if(typeof id==="string"&&id.startsWith("class:")) return classLabel(id.slice(6)); return null;};
    let t;
    if(v.name==="profile")      t=v.id||"Athlete";
    else if(v.name==="event"){  const ev=events.find(e=>e.id===v.id); t=ev?ev.name:"Competition"; }
    else if(v.name==="ranking") t="Rankings";
    else if(v.name==="competitions") t=v.cls?`${classLabel(v.cls)} — Competitions`:"Competitions";
    else if(v.name==="hosts") t="Hosts";
    else if(v.name==="scout") t="Scout · AthLink";
    else if(v.name==="athletes")t=portal?`${hostName(portal)||"Sailing"} — Athletes`:(v.cls?`${classLabel(v.cls)} — Athletes`:"Athletes");
    else if(v.name==="events")  t=hostName(portal)||"AthLink"; // named portal, else sailing home
    else                        t="AthLink"; // portals home
    document.title=t||"AthLink";
  },[portal,view,events]);

  // ── Scout activity ledger: log ONE "viewed_profile" per profile visit. The ref
  //    holds the last-logged athlete key so re-renders (hover, tab switches) don't
  //    re-fire; only a change of the viewed profile (or leaving it) logs again.
  const _viewedProfileRef=useRef(null);
  useEffect(()=>{
    if(view.name==="profile"&&view.id){
      const key=canonName(view.id);
      if(_viewedProfileRef.current!==key){
        _viewedProfileRef.current=key;
        logActivity(scoutOwnerId(auth),key,"viewed_profile");
      }
    } else _viewedProfileRef.current=null;
  },[view.name,view.id]);

  // ── Pinned results: owner-pinned rows lifted to a "Pinned" section at the top
  //    of the results lists. Array order == render order (fetch sorts by
  //    sort_order asc). One list per context: the open athlete profile and the
  //    open host portal.
  const[profilePins,setProfilePins]=useState([]);
  const[portalPins,setPortalPins]=useState([]);
  const[pinDrag,setPinDrag]=useState(null);           // index of the pinned row being dragged
  useEffect(()=>{
    setPinDrag(null);
    if(view.name!=="profile"||!view.id){setProfilePins([]);return;}
    let alive=true;
    fetchPins("athlete",canonName(view.id)).then(p=>{if(alive)setProfilePins(p||[]);});
    return()=>{alive=false;};
  },[view.name,view.id]);
  useEffect(()=>{
    setPinDrag(null);
    if(!portal){setPortalPins([]);return;}
    let alive=true;
    fetchPins("host",portal).then(p=>{if(alive)setPortalPins(p||[]);});
    return()=>{alive=false;};
  },[portal]);
  // Pin/unpin one result (keyed by event id). New pins go ABOVE existing ones —
  // "pin jumps it all the way to the top". Optimistic; rolls back on failure.
  // Writes carry the session token: RLS (0015_role_rls_hardening) only lets the
  // verified owner — approved athlete claim / verified host member / admin —
  // write pins, so anon writes are rejected server-side.
  const togglePinFor=(ownerKind,ownerKey,pins,setPins)=>async({event_id,entry_id=null,snapshot})=>{
    const existing=pins.find(p=>String(p.event_id)===String(event_id));
    if(existing){
      setPins(ps=>ps.filter(p=>p.id!==existing.id));
      if(String(existing.id).startsWith("tmp_")) return;   // never persisted
      // RLS-blocked deletes come back 200 with no rows — treat as failure too.
      const gone=await removePin(existing.id,auth?.token);
      if(gone==null||(Array.isArray(gone)&&gone.length===0))
        setPins(ps=>[existing,...ps.filter(p=>p.id!==existing.id)].sort((a,b)=>a.sort_order-b.sort_order));
    }else{
      const sort=(pins[0]?.sort_order??1)-1;
      const optimistic={id:"tmp_"+Date.now(),owner_kind:ownerKind,owner_key:ownerKey,event_id,entry_id,snapshot,sort_order:sort};
      setPins(ps=>[optimistic,...ps]);
      const real=await addPin(ownerKind,ownerKey,{event_id,entry_id,snapshot,sort_order:sort},auth?.token);
      setPins(ps=>real?ps.map(p=>p===optimistic?real:p):ps.filter(p=>p!==optimistic));
    }
  };
  // Drag-to-reorder within the Pinned section: reorder locally while dragging,
  // persist 0..n-1 on drop.
  const movePinLocal=(setPins,from,to)=>setPins(ps=>{
    if(from===to||from<0||to<0||from>=ps.length||to>=ps.length) return ps;
    const a=ps.slice();const[m]=a.splice(from,1);a.splice(to,0,m);return a;
  });
  const commitPinOrder=(pins,setPins)=>{
    setPins(ps=>ps.map((p,i)=>({...p,sort_order:i})));
    reorderPins(pins.map(p=>p.id).filter(id=>!String(id).startsWith("tmp_")),auth?.token);
  };

  const navBack=()=>{
    // Drive the in-app Back button through real browser history so it stays in
    // lock-step with the native back button; fall back to home on a cold deep-link.
    if(navStack.length){window.history.back();return;}
    setPortal(null);setView({name:"portals"});setQ("");setAthleteSmart(null);window.scrollTo(0,0);
  };
  const navLabelFor=(snap)=>{
    if(!snap) return "Back";
    const v=snap.view||{};
    const pName=id=>{const a=ASSOCIATIONS.find(x=>x.id===id);if(a)return a.name;if(typeof id==="string"&&id.startsWith("class:"))return`All ${classLabel(id.slice(6))} Results`;return null;};
    if(v.name==="portals") return "Sailing";
    if(v.name==="competitions") return "Competitions";
    if(v.name==="hosts") return "Hosts";
    if(v.name==="ranking") return "Rankings";
    if(v.name==="athletes") return snap.portal?`${pName(snap.portal)||""} Athletes`:"All Athletes";
    if(v.name==="events") return pName(snap.portal)||"Competitions";
    if(v.name==="event"){const ev=events.find(e=>e.id===v.id);return ev?ev.name:"Competition";}
    if(v.name==="profile") return v.id||"Profile";
    return "Back";
  };

  /* ── event ops ────────────────────────────────────────────── */
  const deleteEvent=(evId,evName,e)=>{
    e.stopPropagation();
    if(!canEdit) return;   // guests have no delete access (dev mode / editors only)
    const rect=e.currentTarget.getBoundingClientRect();
    setDeleteConfirm({id:evId,name:evName,x:rect.right,y:rect.bottom});
  };
  const confirmDelete=async()=>{
    if(!deleteConfirm||!canEdit) return;
    const target=events.find(ev=>ev.id===deleteConfirm.id);
    // Delete this event AND every duplicate row of the same competition, so no
    // ghost copy survives on the global class page or another association.
    const victims=target?events.filter(ev=>eventKey(ev)===eventKey(target)):events.filter(ev=>ev.id===deleteConfirm.id);
    const ids=new Set(victims.map(v=>v.id));
    // Optimistic: drop the rows from the UI + close the popover immediately, then
    // delete from the DB in the background so the click never blocks.
    setEvents(p=>p.filter(ev=>!ids.has(ev.id)));
    setDeleteConfirm(null);
    (async()=>{ for(const v of victims){ try{await sbDel("events",`id=eq.${v.id}`);}catch(err){console.error("confirmDelete: DB delete failed",err);} } })();
  };
  const confirmDraft=async(evId)=>{
    await updateEventStatus(evId,"Final");
    setEvents(p=>p.map(ev=>ev.id===evId?{...ev,status:"Final"}:ev));
    setNote({name:"Results confirmed",matched:0,created:0,msg:"Competition is now official."});
    setTimeout(()=>setNote(null),4000);
  };

  /* ── AI smart filter ─────────────────────────────────────── */
  const buildFilterPrompt=(query,context)=>
    `You are a sailing results filter engine. The user has described a filter in natural language.
Return ONLY a JSON object (no markdown, no explanation) with two fields:
  "label": short human-readable description of the filter (max 8 words)
  "code": a JavaScript arrow function body string that takes an event object "ev" and returns true/false.
    The event object has: ev.name (string), ev.date (dd/mm/yyyy string), ev.entries (array of {helm,crew,sail,nat,div}),
    and scoreEvent(ev).fleet (number of boats), scoreEvent(ev).races (number of races).
    You can use these fields in the code. The code must be valid JS for use in new Function("ev","scoreEvent","return "+code).
Context: ${context}
Query: "${query}"`;

  const runEvFilter=async()=>{
    const q=evFilter.trim();
    if(!q){return;}
    setEvFilterLoading(true);setEvSuggestions([]);
    try{
      const res=await fetch("/api/ai_filter",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({task:"filter",prompt:buildFilterPrompt(q,`Portal: ${host?.name||"unknown"}, Events: ${classEvents.length}`),max_tokens:300})
      });
      const data=await res.json();
      if(!data.ok) throw new Error(data.error||"API error");
      const clean=data.text.replace(/```json|```/g,"").trim();
      let parsed=JSON.parse(clean);
      // Accept a single {label,code} or an array of them — push each as a chip.
      if(!Array.isArray(parsed)) parsed=[parsed];
      const chips=parsed.filter(x=>x&&x.code).map(x=>({label:x.label||q,fn:new Function("ev","scoreEvent","return "+x.code)}));
      if(chips.length) setEvFilterChips(prev=>[...prev,...chips]);
      setEvFilter("");
    }catch(err){
      // Fallback: simple client-side text search as a single chip
      const ql=q.toLowerCase();
      const fn=(ev)=>ev.name.toLowerCase().includes(ql)||
        ev.entries.some(e=>e.helm.toLowerCase().includes(ql)||e.crew.toLowerCase().includes(ql))||
        (ev.country||"").toLowerCase().includes(ql);
      setEvFilterChips(prev=>[...prev,{label:`"${q}"`,fn}]);
      setEvFilter("");
    }finally{setEvFilterLoading(false);}
  };

  const runProfileFilter=async()=>{
    const q=profileFilter.trim();
    if(!q){return;}
    setProfileFilterLoading(true);
    try{
      const res=await fetch("/api/ai_filter",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          task:"filter",
          prompt:`You convert a natural-language sailing-results filter into one or more conditions.
A query may contain SEVERAL conditions (e.g. "finished top 15 in the world championships" = a placing condition AND an event-type condition). Split them.
Return ONLY a JSON array (no markdown). Each element: {"label": short human label (max 6 words), "code": a JS arrow-function BODY string operating on item "h"}.
"h" has: h.ev (event with .name string, .date "dd/mm/yyyy", .country), h.row.rank (number), h.row.net, h.fleet (number), h.role ('Helm'|'Crew'), h.partner.
Code must be valid for new Function("h","scoreEvent","return "+code). Match event types by checking h.ev.name (case-insensitive). Example: "top 15 in worlds" => [{"label":"Top 15","code":"h.row.rank<=15"},{"label":"World Championship","code":"/world/i.test(h.ev.name)"}].
Query: "${q}"`,
          max_tokens:400
        })
      });
      const data=await res.json();
      if(!data.ok) throw new Error(data.error||"API error");
      const clean=data.text.replace(/```json|```/g,"").trim();
      let parsed=JSON.parse(clean);
      if(!Array.isArray(parsed)) parsed=[parsed];
      const chips=parsed.filter(x=>x&&x.code).map(x=>({label:x.label||"Filter",fn:new Function("h","scoreEvent","return "+x.code)}));
      if(chips.length) setProfileFilterChips(prev=>[...prev,...chips]);
      setProfileFilter("");
    }catch(err){
      setProfileFilterChips(prev=>[...prev,{label:"Filter error",fn:()=>true}]);
    }finally{setProfileFilterLoading(false);}
  };

  // Smart athlete search: NL query -> predicate over an athlete summary object.
  const runAthleteSmart=async(query,peopleList,evList)=>{
    const qq=(query||"").trim();
    if(!qq){setAthleteSmart(null);return;}
    // Plain country/name terms don't need AI — let the substring filter handle them.
    setAthleteSmartLoading(true);
    try{
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          task:"filter",
          prompt:`You convert a natural-language athlete search into a JS predicate.
Return ONLY a JSON object (no markdown): {"label": short label (max 7 words), "code": arrow-function BODY operating on athlete "a"}.
"a" has: a.name (string), a.iso (ISO-2 country like "GB","HK"), a.country (full country name), a.events (number of regattas), a.best (best finish rank number or null), a.podiums, a.wins, and a.results = array of {name (event name), rank, fleet, year}.
Code must be valid for new Function("a","return "+code) and return true/false.
Examples:
"Hong Kong" => {"label":"Hong Kong athletes","code":"a.country==='Hong Kong'||a.iso==='HK'"}
"top 15 in the world championships" => {"label":"Top 15 at a Worlds","code":"a.results.some(r=>/world/i.test(r.name)&&r.rank<=15)"}
"won a national championship" => {"label":"National title","code":"a.results.some(r=>/national/i.test(r.name)&&r.rank===1)"}
Query: "${qq}"`,
          max_tokens:300})});
      const data=await res.json();
      if(!data.ok) throw new Error(data.error||"API error");
      const clean=data.text.replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(clean);
      const fn=new Function("a","return "+parsed.code);
      setAthleteSmart({label:parsed.label||qq,fn});
    }catch(err){
      setAthleteSmart(null);
    }finally{setAthleteSmartLoading(false);}
  };

  // Build the athlete summary object the predicate runs against.
  const athleteSummaryFor=(name,evList)=>{
    const ag=aggregate(name,evList);
    const iso=IOC_ISO[athleteNat(name,evList)]||"";
    return {
      name, iso, country: GLOBE_NAMES[iso]||"",
      events: ag.events, best: ag.best||null, podiums: ag.podiums, wins: ag.wins,
      results: ag.history.map(h=>({name:h.ev.name,rank:h.row.rank,fleet:h.fleet,year:parseInt(h.ev.date?.split('/')?.[2])||null}))
    };
  };

  /* ── AI suggestions (debounced) ─────────────────────────── */
  const fetchEvSuggestions=async(q)=>{
    if(!q.trim()||q.length<3){setEvSuggestions([]);return;}
    const key=q.trim().toLowerCase();
    // Cache hit → instant, no network (backspacing to a prior prefix is free).
    if(evSugCacheRef.current.has(key)){setEvSuggestions(evSugCacheRef.current.get(key));setEvSugLoading(false);return;}
    // Cancel any in-flight request so a slower older one can't clobber this.
    if(evSugAbortRef.current)evSugAbortRef.current.abort();
    const ctrl=new AbortController();evSugAbortRef.current=ctrl;
    setEvSugLoading(true);
    try{
      const eventCtx=classEvents.slice(0,5).map(e=>`"${e.name}" (${scoreEvent(e).fleet} boats)`).join(", ");
      const prompt=`You are a sailing results filter suggestion engine. Given a partial query, suggest 4 short filter query completions.
Return ONLY a JSON array of 4 strings (no markdown). Each string is a complete natural-language filter query.
Context: portal=${host?.name||"unknown"}, recent events: ${eventCtx}
Partial query: "${q}"`;
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        signal:ctrl.signal,
        body:JSON.stringify({task:"filter",prompt,max_tokens:200})});
      const data=await res.json();
      if(data.ok){
        const clean=data.text.replace(/\`\`\`json|\`\`\`/g,"").trim();
        const arr=JSON.parse(clean);
        const out=Array.isArray(arr)?arr.slice(0,4):[];
        evSugCacheRef.current.set(key,out);
        setEvSuggestions(out);
      }
    }catch(e){if(e?.name==="AbortError")return;setEvSuggestions([]);}
    finally{if(evSugAbortRef.current===ctrl){evSugAbortRef.current=null;setEvSugLoading(false);}}
  };

  const fetchProfileSuggestions=async(q)=>{
    if(!q.trim()||q.length<3){setProfileSuggestions([]);return;}
    const key=q.trim().toLowerCase();
    if(profileSugCacheRef.current.has(key)){setProfileSuggestions(profileSugCacheRef.current.get(key));setProfileSugLoading(false);return;}
    if(profileSugAbortRef.current)profileSugAbortRef.current.abort();
    const ctrl=new AbortController();profileSugAbortRef.current=ctrl;
    setProfileSugLoading(true);
    try{
      const prompt=`Suggest 4 short sailing result filter queries for an athlete profile.
Return ONLY a JSON array of 4 strings. Each is a complete filter query.
Partial query: "${q}"`;
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        signal:ctrl.signal,
        body:JSON.stringify({task:"filter",prompt,max_tokens:150})});
      const data=await res.json();
      if(data.ok){
        const clean=data.text.replace(/\`\`\`json|\`\`\`/g,"").trim();
        const arr=JSON.parse(clean);
        const out=Array.isArray(arr)?arr.slice(0,4):[];
        profileSugCacheRef.current.set(key,out);
        setProfileSuggestions(out);
      }
    }catch(e){if(e?.name==="AbortError")return;setProfileSuggestions([]);}
    finally{if(profileSugAbortRef.current===ctrl){profileSugAbortRef.current=null;setProfileSugLoading(false);}}
  };

  /* ── Global search ───────────────────────────────────────── */
  const runGlobalSearch=(q)=>{
    if(!q.trim()){setGSearchResults([]);return;}
    const ql=q.toLowerCase();
    const results=[];
    // Athletes — nav into the owner association of one of their events
    allPeople.filter(p=>p.name.toLowerCase().includes(ql)).slice(0,5).forEach(p=>{
      const ev=events.find(e=>e.entries.some(en=>en.helm===p.name||en.crew===p.name));
      const _attrs=ATHLETE_ATTRS.get(canonName(p.name));
      const _showCls=_attrs?.recentCls||p.cls;
      results.push({type:"athlete",label:p.name,sub:_showCls?classLabel(_showCls):"",nav:{type:"profile",assoc:ev?.owner||null,id:p.name}});
    });
    // Events — nav into the event's owner association portal
    events.filter(ev=>ev.name.toLowerCase().includes(ql)).slice(0,4).forEach(ev=>{
      results.push({type:"event",label:ev.name,sub:formatDate(ev.date),nav:{type:"event",assoc:ev.owner||null,id:ev.id}});
    });
    // Global class portals
    CLASSES.filter(c=>c.short.toLowerCase().includes(ql)||(c.full||"").toLowerCase().includes(ql)).forEach(c=>{
      results.push({type:"portal",label:`${c.short} — all competitions`,sub:"Class",nav:{type:"competitions",cls:c.id}});
    });
    // Club portals
    CLUBS.filter(c=>c.name.toLowerCase().includes(ql)).forEach(c=>{
      results.push({type:"portal",label:c.name,sub:"Club",nav:{type:"portal",assoc:c.id}});
    });
    // Federation portals
    FEDERATIONS.filter(f=>f.name.toLowerCase().includes(ql)).forEach(f=>{
      results.push({type:"portal",label:f.name,sub:"Federation",nav:{type:"portal",assoc:f.id}});
    });
    // Association portals
    ASSOCIATIONS.filter(a=>a.name.toLowerCase().includes(ql)||(a.cls||"").toLowerCase().includes(ql)).forEach(a=>{
      results.push({type:"portal",label:a.name,sub:"Association",nav:{type:"portal",assoc:a.id}});
    });
    // Nav shortcuts
    if("home all classes portals sailing associations".includes(ql))
      results.push({type:"nav",label:"Sailing — Home",sub:"Navigate",nav:{type:"home"}});
    if("all athletes".includes(ql)||ql.includes("athlete"))
      results.push({type:"nav",label:"Athletes",sub:"Navigate",nav:{type:"athletes"}});
    setGSearchResults(results.slice(0,10));
  };

  const[editResultsEv,setEditResultsEv]=useState(null); // full edit mode for existing event
  const[hoverRow,setHoverRow]=useState(null); // {evId,helm,y} currently hovered
  const[hoverSummaries,setHoverSummaries]=useState({}); // key=helm → summary text
  const[profileSummaries,setProfileSummaries]=useState({}); // key=name → full profile blurb
  const[eventSummaries,setEventSummaries]=useState({}); // key=event.id → competition blurb
  const[eventSummaryOpen,setEventSummaryOpen]=useState({}); // key=event.id → revealed?

  const SCOUT_LENS=`Write for a talent scout or sponsor evaluating an athlete. The reader needs to judge how impressive a result is RELATIVE TO THE LEVEL of the competition. A mid-fleet finish at a World/Olympic-level event can be more valuable than a win at a small regional one. Focus on: the competition's reputation and level (international championship vs national vs club/regional), the depth/strength of the fleet, and what a strong or weak placing there would signify for an athlete's trajectory. Be specific and factual; no marketing fluff, no markdown, no headings.`;

  // POST to the AI summary endpoint with a hard timeout. Throws on a non-2xx
  // response (e.g. a 504 HTML gateway page that res.json() would choke on) or a
  // timeout, so callers can log the real failure instead of silently rendering
  // a blank "no summary" tab. Returns parsed {ok,text,model}.
  const aiFilter=async(task,prompt,max_tokens)=>{
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),15000);
    try{
      const res=await fetch("/api/ai_filter",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({task,prompt,max_tokens}),signal:ctrl.signal});
      if(!res.ok) throw new Error(`ai_filter HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  };

  const fetchEventSummary=async(ev)=>{
    if(eventSummaries[ev.id]!==undefined) return;
    setEventSummaries(m=>({...m,[ev.id]:null}));
    try{
      const sc=scoreEvent(ev);
      const yr=ev.date?.split('/')?.[2]||"";
      const prompt=`${SCOUT_LENS}
In 2-4 sentences, summarize this sailing competition for a talent scout or sponsor deciding what an athlete's result here is worth. If you recognize this specific event, use what you know about its reputation, history and typical fleet strength. If you are not certain, infer the likely level from its name (e.g. "World Championship", "Europeans", "Nationals", club regatta) and say so cautiously — do not invent specific facts. End with one sentence on how to read an athlete's placing here.
Event name: "${ev.name}". Boat class: ${ev.cls}. Year: ${yr}. Host country: ${ev.country||"unknown"}. Fleet size: ${sc.fleet} boats. Races sailed: ${sc.races}.`;
      const data=await aiFilter("overview",prompt,220);
      if(data.ok) setEventSummaries(m=>({...m,[ev.id]:cleanAISummary(data.text)}));
      else setEventSummaries(m=>({...m,[ev.id]:""}));
    }catch(e){console.warn("fetchEventSummary failed:",e);setEventSummaries(m=>({...m,[ev.id]:""}));}
  };

  const execGSearch=(r)=>{
    // Close search UI immediately
    setGSearch("");setGSearchOpen(false);setGSearchResults([]);setNavSearchOpen(false);
    const n=r.nav;
    if(n.type==="portal"){
      // enterPortal sets portal+view in one batch — no defer needed
      enterPortal(n.assoc);
    } else if(n.type==="competitions"){
      goTop("competitions",n.cls?{cls:n.cls}:undefined);
    } else if(n.type==="home"){
      goHome();
    } else if(n.type==="athletes"){
      pushNav();
      setPortal(null);
      setTimeout(()=>setView({name:"athletes"}),0);
    } else if(n.type==="profile"){
      if(n.assoc&&n.assoc!==portal){
        pushNav();
        setPortal(n.assoc);
        setTimeout(()=>setView({name:"profile",id:n.id}),0);
      } else {
        go({name:"profile",id:n.id});
      }
    } else if(n.type==="event"){
      if(n.assoc&&n.assoc!==portal){
        pushNav();
        setPortal(n.assoc);
        setTimeout(()=>setView({name:"event",id:n.id}),0);
      } else {
        go({name:"event",id:n.id});
      }
    }
    window.scrollTo(0,0);
  };

  const fetchHoverSummary=async(name,ag,crew)=>{
    const key=crew?`${name}+${crew}`:name;
    if(hoverSummaries[key]!==undefined) return; // cached
    // Immediately set loading state so we don't double-fetch
    setHoverSummaries(h=>({...h,[key]:null}));
    try{
      const best=ag.best?"#"+ag.best:"unknown";
      const evs=ag.events;const pods=ag.podiums;const wins=ag.wins;
      // First & most-recent event years (for "started together" / trajectory context).
      const sorted=ag.history.slice().sort((a,b)=>dateKey(a.ev.date).localeCompare(dateKey(b.ev.date)));
      const firstYr=sorted[0]?.ev.date?.split('/')?.[2]||"";
      let prompt;
      if(crew){
        const agCrew=aggregate(crew,events);
        // Events both sailed together (shared regattas with this partner).
        const together=ag.history.filter(h=>h.partner&&canonName(h.partner)===canonName(crew));
        const firstTog=together.slice().sort((a,b)=>dateKey(a.ev.date).localeCompare(dateKey(b.ev.date)))[0];
        const togLine=together.length?`Sailed together in ${together.length} regatta(s) since ${firstTog?.ev.date?.split('/')?.[2]||"?"}; best together #${Math.min(...together.map(h=>h.row.rank))}.`:"First/few events as a pair.";
        prompt=`Write a SHORT scouting blurb for a sailing PAIR (helm+crew): 2 sentences, MAX 38 words. Cover (a) when they started sailing together and how they've performed as a pair, (b) any standout milestone by either sailor, and (c) how they stack up against similar-calibre competition. Factual, no markdown, no heading. Always refer to each sailor by their FULL name exactly as "${name}" and "${crew}" (first and last together) — never just a first name or just a last name.
Helm: ${name} (${evs} regattas since ${firstYr||"?"}, best ${best}, ${pods} podiums, ${wins} race wins).
Crew: ${crew} (${agCrew.events} regattas, best ${agCrew.best?"#"+agCrew.best:"unknown"}).
Together: ${togLine}`;
      } else {
        // Comparison context: peers who finished near them in their events.
        const peerNote=ag.history.slice(0,5).map(h=>`${h.ev.name}: #${h.row.rank}/${h.fleet}`).join('; ');
        prompt=`Write a SHORT scouting blurb for a SINGLE-HANDED sailor: 2 sentences, MAX 32 words. Focus mainly on how they performed RELATIVE TO COMPETITORS OF SIMILAR CALIBRE — i.e. where they placed within the fleet at their events, and against peers who finished near them. Factual, no markdown, no heading. Always refer to the athlete by their FULL name exactly as "${name}" (first and last together) — never just the first name or just the last name.
Athlete: ${name} (since ${firstYr||"?"}). Best ${best}, ${pods} podiums, ${wins} race wins. Placings: ${peerNote||"unknown"}.`;
      }
      const data=await aiFilter("hover",prompt,90);
      if(data.ok) setHoverSummaries(h=>({...h,[key]:cleanAISummary(data.text)}));
      else setHoverSummaries(h=>({...h,[key]:""}));
    }catch(e){console.warn("fetchHoverSummary failed:",e);setHoverSummaries(h=>({...h,[key]:""}));}
  };

  // Signature of an athlete's result set — changes only when a competition is
  // added/removed, so a cached overview can be reused until then.
  const profileSig=(name,ag)=>{
    const ids=ag.history.map(h=>`${(h.ev.name||"").toLowerCase()}|${h.ev.date}`).sort().join(";");
    return `${name}::${ag.events}::${ids}`;
  };
  const fetchFullProfileSummary=async(name,ag)=>{
    if(profileSummaries[name]!==undefined) return;
    const sig=profileSig(name,ag);
    // Reuse a persisted overview if the athlete's results haven't changed.
    try{
      const raw=localStorage.getItem("athlink_bio_v2_"+name);  // v2: full-name prompt
      if(raw){
        const cached=JSON.parse(raw);
        if(cached.sig===sig){ setProfileSummaries(h=>({...h,[name]:cached.text})); return; }
      }
    }catch{}
    setProfileSummaries(h=>({...h,[name]:null})); // loading
    try{
      const years=[...new Set(ag.history.map(h=>h.ev.date?.split('/')?.[2]).filter(Boolean))].sort();
      // Class journey: class per year, to spot when they started / moved classes.
      const clsByYear={};
      ag.history.forEach(h=>{const y=h.ev.date?.split('/')?.[2];if(y)(clsByYear[y]=clsByYear[y]||new Set()).add((nuggetFor(h.ev.cls,h.ev.subclass).full)||h.ev.cls);});
      const journey=Object.keys(clsByYear).sort().map(y=>`${y}: ${[...clsByYear[y]].join('/')}`).join('; ');
      const recent=ag.history[0];
      const recentLine=recent?`Most recent: ${recent.ev.name} (${recent.ev.date?.split('/')?.[2]||''}), finished #${recent.row.rank} of ${recent.fleet}.`:"";
      const prompt=`Write a SHORT athlete bio: 2 sentences, MAX 45 words total, third person. Focus on the athlete's JOURNEY — when they started competing, any class change, the class they've excelled in, and where they place now. Do NOT list every stat. No heading, no markdown, no "#", do not begin with the name. Whenever you refer to the athlete, use their FULL name exactly as "${name}" (first and last together) — never just the first name or just the last name on its own.
Name: ${name}. Active years: ${years.join(', ')||'unknown'}. Class-by-year: ${journey||'unknown'}. Best result: ${ag.best?"#"+ag.best:"unknown"}. Podiums: ${ag.podiums}. ${recentLine}`;
      const data=await aiFilter("overview",prompt,110);
      if(data.ok){
        const text=cleanAISummary(data.text);
        setProfileSummaries(h=>({...h,[name]:text}));
        try{localStorage.setItem("athlink_bio_v2_"+name,JSON.stringify({sig,text}));}catch{}
      }
      else setProfileSummaries(h=>({...h,[name]:""}));
    }catch(e){console.warn("fetchFullProfileSummary failed:",e);setProfileSummaries(h=>({...h,[name]:""}));}
  };


  const openCalendarAt=(dateStr)=>{
    const p=dateStr?.split('/');
    if(!p||p.length!==3) return;
    const mo=parseInt(p[1])-1;const yr=parseInt(p[2]);
    if(isNaN(mo)||isNaN(yr)) return;
    setCalScopePortal(portal||null);
    setCalMonth(mo);setCalYear(yr);setShowCalendar(true);
  };
  // Open the calendar popup, scoped to a given portal (null = global/all events).
  const openCalendar=(scopePortal)=>{
    setCalScopePortal(scopePortal??null);
    setShowCalendar(true);
  };
  const openSailorCalAt=(dateStr,name)=>{
    const p=dateStr?.split('/');
    if(!p||p.length!==3) return;
    setSailorCalMonth(parseInt(p[1])-1);setSailorCalYear(parseInt(p[2]));
    setSailorCalName(name);setSailorCalClsSet(new Set());setShowSailorCal(true);
  };

  const saveEvMeta=async()=>{
    if(!editEvMeta) return;
    const{id,name,date,country,discards}=editEvMeta;
    // RLS filters unauthorised PATCHes to zero rows (200 + empty body) — treat
    // that as a failure instead of pretending the edit stuck until refresh.
    const res=await sbPatch("events",`id=eq.${id}`,{name,date,country:country||null,discards:parseInt(discards)||1});
    if(!res||res.length===0){
      setConfirmState({title:"Couldn't save changes",message:"The database rejected this edit — make sure you're signed in with an account that can edit this competition, then try again.",confirmLabel:"OK",danger:false,onConfirm:()=>setConfirmState(null)});
      return;
    }
    setEvents(p=>p.map(ev=>ev.id===id?{...ev,name,date,country,discards:parseInt(discards)||1}:ev));
    setEditEvMeta(null);
  };

  const openEditResults=(ev)=>{
    // Load existing event into the previewEv state for full editing
    const prev={
      ...ev,
      venue:ev.country||"",
      entries:ev.entries.map(e=>({...e})),
      // Seed the organizer/host picker from the existing event so it reflects
      // (and can change) the current host, and the change actually persists.
      _orgMode: ev.owner?"external":"self",
      _orgHost: ev.owner||null,
      _orgName: ev.organizer_name||null,
    };
    setPreviewEv(prev);
    setMf(f=>({...f,cls:ev.cls,subclass:ev.subclass||null,collabs:ev.collabs||[]}));
    setEditResultsEv(ev.id); // flag: this is an edit, not a new import
    setOpen(true);
    setImportStep("preview");
  };

  const saveEditedResults=async(asDraft)=>{
    if(!previewEv||!editResultsEv) return;
    // Editing an upcoming event's entry list keeps it Upcoming — it only becomes
    // "Final" when real race scores are attached (see the results-attach path).
    const stillUpcoming=previewEv.status==="Upcoming"&&(previewEv.entries||[]).every(e=>!(e.races||[]).length);
    const status=asDraft?"Draft":(stillUpcoming?"Upcoming":"Final");
    // Resolve the (possibly changed) organizer host from the picker, mirroring
    // the import flow, so host re-assignment on an existing event persists.
    const importerHost=(portal&&!isClassPortal)?portal:null;
    const selfOrganized=(previewEv._orgMode||"self")!=="external" && !!importerHost;
    const attributedHost=selfOrganized?importerHost:(previewEv._orgHost||null);
    const doublehanded=previewEv.entries.some(e=>e.crew&&e.crew.trim());
    const ev={...previewEv,status,country:(previewEv.venue||"").toUpperCase()||previewEv.country||"",
      subclass:mf.subclass||null,collabs:mf.collabs||[],cls:mf.cls||previewEv.cls,
      owner:attributedHost||null,
      organizer_name:attributedHost?null:(previewEv._orgName||previewEv.organizer_name||null),
      doublehanded};
    // Update event metadata. RLS filters unauthorised PATCHes to zero rows
    // (200 + empty body) — bail out BEFORE touching entries and tell the user,
    // instead of showing a "Results updated." toast for an edit that never stuck.
    const patched=await sbPatch("events",`id=eq.${editResultsEv}`,{
      name:ev.name,date:ev.date,country:ev.country||null,
      discards:ev.discards,status,subclass:ev.subclass,collabs:ev.collabs,
      cls:ev.cls,owner:ev.owner,organizer_name:ev.organizer_name,doublehanded:ev.doublehanded,
    });
    if(!patched||patched.length===0){
      setConfirmState({title:"Couldn't save changes",message:"The database rejected this edit — make sure you're signed in with an account that can edit this competition, then try again.",confirmLabel:"OK",danger:false,onConfirm:()=>setConfirmState(null)});
      return;
    }
    // Update entries (delete old, insert new)
    if(sbH){
      await sbDel("entries",`event_id=eq.${editResultsEv}`);
      await sbPost("entries",ev.entries.map(e=>({
        event_id:editResultsEv,sail:e.sail,nat:e.nat||null,
        division:e.div,gender:e.gender||null,category:e.category||null,helm_name:e.helm,crew_name:e.crew||null,
        races:e.races,race_codes:e.race_codes||null,
        pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null,
      })));
    }
    delete ev._orgMode; delete ev._orgHost; delete ev._orgName;
    setEvents(p=>p.map(existing=>existing.id===editResultsEv?{...ev,id:editResultsEv}:existing));
    setEditResultsEv(null);
    closeImport();
    setNote({name:ev.name,matched:0,created:0,msg:status==="Draft"?"Saved as draft.":"Results updated."});
    setTimeout(()=>setNote(null),4000);
  };

  /* ── PDF / import flow ────────────────────────────────────── */
  const resetImport=()=>{
    setPdfError("");setImportStep("upload");setImportKind("past");
    setFleetChoices([]);setPdfMeta(null);setPreviewEv(null);setPreviewEdit(null);
    setPending([]);setActivePending(null);
    setLiveUrl("");
  };
  // ── Import-draft persistence (in-memory, session-scoped) ──
  // The import pop-up is inline JSX gated on `open` (not a separately-mounted
  // component), so there's no modal-mount lifecycle for lazy useState initializers.
  // Instead we snapshot the live batch into the module-scope IMPORT_DRAFT holder on
  // close and restore it synchronously in the same click that reopens (before the
  // modal renders → no flicker). Cleared on successful publish/save-draft and when a
  // fresh batch starts. NOT persisted to storage — a page reload clears it by design.
  const clearImportDraft=()=>{IMPORT_DRAFT=null;};
  const snapshotImportDraft=()=>{
    // Nothing meaningful to keep? (no unpublished items / no preview) → drop any old
    // draft. A queue that's ALL published is finished business — don't resurrect it.
    const hasLive=pending.some(p=>p.status!=="published");
    if(editResultsEv||(!hasLive&&!previewEv)){IMPORT_DRAFT=null;return;}
    // Fold the active editor (previewEv + subclass/collabs live in mf) into its slot.
    const snapPending=pending.map(p=>(p.id===activePending&&previewEv)?{...p,previewEv,subclass:mf.subclass,collabs:mf.collabs}:p);
    IMPORT_DRAFT={pending:snapPending,activePending,previewEv,mf,importStep,tab,importKind,fleetChoices,pdfMeta};
  };
  const restoreImportDraft=()=>{
    const d=IMPORT_DRAFT;if(!d) return false;
    setPending(d.pending||[]);setActivePending(d.activePending||null);
    setPreviewEv(d.previewEv||null);setMf(d.mf||emptyForm());
    setImportStep(d.importStep||"upload");setTab(d.tab||"ai");setImportKind(d.importKind||"past");
    setFleetChoices(d.fleetChoices||[]);setPdfMeta(d.pdfMeta||null);
    return true;
  };
  // Open the import pop-up for a NEW import; restore an in-progress batch if one was
  // stashed on the previous close.
  const openImport=()=>{
    setEditResultsEv(null);
    if(!restoreImportDraft()){resetImport();setTab("ai");}
    setOpen(true);
  };
  const closeImport=()=>{setOpen(false);snapshotImportDraft();resetImport();setTab("ai");};

  // Snapshot current editor (previewEv + class/subclass/collab) into the active pending slot.
  const syncActivePending=()=>{
    setPending(prev=>prev.map(p=>(p.id===activePending&&previewEv)?{...p,previewEv,subclass:mf.subclass,collabs:mf.collabs}:p));
  };
  // Open one queued result in its own editor tab (the hub's "Review" portal button).
  const openPendingEditor=id=>{
    const t=pending.find(p=>p.id===id);
    if(!t||!t.previewEv) return;
    syncActivePending();   // fold whatever editor was open back into its slot first
    setPreviewEv(t.previewEv);
    setMf(f=>({...f,subclass:t.subclass||null,collabs:t.collabs||[]}));
    setActivePending(id);
    setImportStep("preview");
  };
  // Close the editor tab back to the hub list, keeping the queue intact.
  const backToHub=()=>{
    syncActivePending();
    setActivePending(null);setPreviewEv(null);setImportStep("upload");
  };
  // Switch to another pending result tab (by id).
  const switchPending=id=>{
    if(id===activePending) return;
    openPendingEditor(id);
  };
  // Remove a single pending result from the queue (without discarding the rest).
  const removePending=id=>{
    const idx=pending.findIndex(p=>p.id===id);
    if(idx<0) return;
    const remaining=pending.filter(p=>p.id!==id);
    setPending(remaining);
    if(id===activePending){
      // Removed the open editor → jump to the next reviewable item, else back to the hub.
      const next=remaining.find(p=>p.status==="ok");
      if(next&&importStep==="preview"){
        setPreviewEv(next.previewEv);
        setMf(f=>({...f,subclass:next.subclass||null,collabs:next.collabs||[]}));
        setActivePending(next.id);
      }else{
        setActivePending(null);setPreviewEv(null);setImportStep("upload");
      }
    }
  };
  // Merge all pending tabs that share a fleetGroupId into one combined tab.
  // Only unpublished fleets combine — a fleet already ticked off stays published.
  const combineFleetGroup=(groupId)=>{
    const groupItems=pending.filter(p=>p.fleetGroupId===groupId&&p.status!=="published");
    if(groupItems.length<2) return;
    const allEntries=groupItems.flatMap(p=>p.previewEv?.entries||[]);
    const seen=new Set();
    const merged=allEntries.filter(e=>{const k=(e.helm||"").toLowerCase()+(e.sail||"");if(seen.has(k))return false;seen.add(k);return true;});
    merged.sort((a,b)=>(a.pdf_rank??9999)-(b.pdf_rank??9999));
    const baseName=groupItems[0].fleetGroupBaseName||groupItems[0].previewEv?.name?.split(" — ")[0]||"Imported Competition";
    const maxDisc=groupItems[0].fleetGroupDiscards||Math.max(...groupItems.map(p=>p.previewEv?.discards||1));
    const combinedPreview={...groupItems[0].previewEv,name:baseName,discards:maxDisc,entries:merged,ai_parsed:false};
    const combinedItem={id:"combined_"+groupId,name:baseName,status:"ok",error:null,previewEv:combinedPreview,subclass:groupItems[0].subclass,collabs:groupItems[0].collabs};
    const newPending=[...pending.filter(p=>p.fleetGroupId!==groupId||p.status==="published"),combinedItem];
    setPending(newPending);
    setActivePending(combinedItem.id);
    setPreviewEv(combinedPreview);
    setMf(f=>({...f,subclass:combinedItem.subclass||null,collabs:combinedItem.collabs||[]}));
  };

  const buildPreviewFromFleet=(pdfName,pdfDate,fleet)=>{
    const ev={
      id:"imp_"+Date.now(),
      name:pdfName+(fleet.name?` — ${fleet.name}`:""),
      cls:portal,
      doublehanded:fleet.entries.some(e=>e.crew),
      venue:"",country:"",
      date:pdfDate||"",
      discards:fleet.discards||1,
      scoring:'Appendix A',
      source:"PDF import",status:"Draft",
      entries:fleet.entries.map((e,i)=>({
        _previewKey:`${i}_${e.helm}`,
        sail:e.sail||"—",nat:e.nat||"",div:e.div||"",
        gender:e.gender||"",category:e.category||"",
        helm:e.helm||"",crew:e.crew||"",
        races:(e.races||[]),
        race_codes:e.race_codes||null,pdf_rank:e.pdf_rank||null,pdf_net:e.pdf_net||null,
      })),
    };
    setPreviewEv(ev);setImportStep("preview");
  };

  // Parse a single file → {ok, name, date, entries, discards, multi, fleets, notes, error}
  const parseOneFile=async(file,mode="ai")=>{
    // Entry lists are server-only: the in-browser HTML parser is results-shaped
    // (it would answer "No results table" and mask the real entries error).
    const isHtml=mode!=="entries"&&(file.name.toLowerCase().endsWith(".html")||file.type==="text/html");
    // Server parser handles PDF, HTML and images, and carries the full format
    // support (fleet splitting, crew columns, Sailti, sail-number headers…), so
    // send everything there first. For HTML, fall back to the in-browser parser
    // only if the server is unreachable or can't read the page.
    try{
      const res=await fetch(`/api/sailing/parse_pdf?mode=${mode}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      const data=await res.json();
      if(data.ok) return data;
      if(!isHtml){
        let err=data.error||"Could not parse this file.";
        // B: when the built-in parser doesn't recognise a PDF, point to the AI parser.
        if(mode==="rule"&&/not found|unsupported|unknown|couldn'?t|supported:/i.test(err))
          err=err.replace(/\s*For other formats use Manual entry\.?/i,"")
              +" — switch to the AI Entry tab (it reads odd or non-standard layouts), or use Manual entry.";
        return{ok:false,error:err};
      }
      // server reachable but couldn't read the HTML → try the browser parser below
    }catch{
      if(!isHtml) return{ok:false,error:"Upload failed. Check api/parse_pdf.py is deployed."};
    }
    if(isHtml){
      try{
        const buf=await file.arrayBuffer();
        const html=new TextDecoder('iso-8859-1').decode(buf);
        const data=parseHtml(html);
        if(!data.ok) return{ok:false,error:data.error||"Could not parse this HTML file."};
        return{...data,notes:data.notes||["Parsed the HTML in your browser."]};
      }catch(err){return{ok:false,error:"HTML parse failed: "+err.message};}
    }
    return{ok:false,error:"Could not parse this file."};
  };

  // ── Paged AI parse (PDF only): split into per-page calls so each finishes
  //    under the Hobby 10s function cap, then stitch the entries together.
  //    onProgress(done,total) drives the per-page UI. Returns the same shape
  //    as parseOneFile: {ok, name, date, entries, discards, ai_parsed, notes}. ──
  const parseOnePdfPaged=async(file,onProgress)=>{
    // 0) Built-in parser FIRST (no AI). It reads every page in one fast pass and,
    //    when it confidently recognises the format, returns complete results
    //    sub-second — so multi-page Sailwave/Manage2sail/SailingResults never hit
    //    the slow per-page AI path (which is also lossy: large tables get
    //    truncated when echoed back through the model). Only fall through to AI
    //    when the built-in parser can't read it or scores low confidence.
    try{
      onProgress&&onProgress(0,1);
      const ruled=await parseOneFile(file,"rule");
      const hasFlat=ruled&&Array.isArray(ruled.entries)&&ruled.entries.length>0;
      const hasFleets=ruled&&ruled.multi&&Array.isArray(ruled.fleets)&&ruled.fleets.length>0;
      if(ruled&&ruled.ok&&(hasFlat||hasFleets)&&!ruled.low_confidence){
        onProgress&&onProgress(1,1);
        return {...ruled,ai_parsed:false};
      }
    }catch{ /* fall through to per-page AI below */ }

    // 1) page count (instant, server-side via pypdf)
    let pageCount=1;
    try{
      const cres=await fetch(`/api/sailing/parse_pdf?count=1`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      const cdata=await cres.json();
      if(cdata.ok&&cdata.page_count) pageCount=Math.max(1,cdata.page_count|0);
    }catch{ /* fall back to a single whole-file AI call below */ }

    // Single-page PDF: nothing to chunk — one normal AI call.
    if(pageCount<=1){
      onProgress&&onProgress(0,1);
      const d=await parseOneFile(file,"ai");
      onProgress&&onProgress(1,1);
      return d;
    }

    // 2) parse each page on its OWN request, with BOUNDED CONCURRENCY (§4.3).
    //    The old design was strictly sequential because Anthropic's per-minute
    //    rate limit meant firing pages at once left only the last page alive.
    //    Gemini's limits are far higher, so we now run up to PAGE_CONCURRENCY
    //    pages at a time — a 9-page scan drops from ~90s to ~25s. Results are
    //    stored by page index, so order is preserved regardless of finish order.
    onProgress&&onProgress(0,pageCount);
    const pageResults=new Array(pageCount).fill(null);
    const pageErrors=[];
    const fetchPage=async(pi)=>{
      const r=await fetch(`/api/sailing/parse_pdf?page=${pi}`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:file});
      return r.json();
    };
    let doneP=0;
    const parseOnePage=async(pi)=>{
      let d=null,err="page failed";
      for(let attempt=0;attempt<2;attempt++){
        try{
          d=await fetchPage(pi);
          if(d&&d.ok&&Array.isArray(d.entries)) break;
          err=(d&&d.error)||"page failed"; d=null;
        }catch(e){ err="network/timeout"; d=null; }
        if(attempt===0) await new Promise(r=>setTimeout(r,8000)); // backoff for a rate-limit window
      }
      if(d) pageResults[pi]={entries:d.entries,name:d.name,date:d.date,discards:d.discards,division:d.division||""};
      else pageErrors.push({page:pi+1,error:err});
      onProgress&&onProgress(++doneP,pageCount);
    };
    const PAGE_CONCURRENCY=4;
    let nextPage=0;
    const pageWorker=async()=>{ while(nextPage<pageCount){ const pi=nextPage++; await parseOnePage(pi); } };
    await Promise.all(Array.from({length:Math.min(PAGE_CONCURRENCY,pageCount)},pageWorker));

    // 3) group pages into DIVISIONS by their section heading. A page that
    //    repeats the current heading — or carries none (a continuation page) —
    //    stitches onto the current division; a NEW heading opens a new one.
    //    If no page returns a heading at all, everything lands in one group,
    //    degrading safely to a single stitched table (the old behaviour).
    const rowKey=e=>`${String(e.sail||"").replace(/\s+/g,"").toLowerCase()}|${(e.helm||"").toLowerCase()}|${(e.crew||"").toLowerCase()}`;
    const groups=[]; let name="",date="",discards=1,cur=null,curDiv="";
    pageResults.forEach(pr=>{
      if(!pr) return;
      if(pr.name&&!name) name=pr.name;
      if(pr.date&&!date) date=pr.date;
      if(pr.discards) discards=Math.max(discards,pr.discards|0);
      const div=String(pr.division||"").trim();
      const sameDiv=div&&curDiv&&div.toLowerCase()===curDiv.toLowerCase();
      if(!cur||(div&&!sameDiv)){
        cur={division:div,entries:[],keys:new Set(),discards:pr.discards||1};
        groups.push(cur);
      }
      if(div) curDiv=div;
      (pr.entries||[]).forEach(e=>{
        const k=rowKey(e);
        if(cur.keys.has(k)) return;              // dedupe page overlap within a division
        cur.keys.add(k); cur.entries.push(e);
      });
      cur.discards=Math.max(cur.discards||1,pr.discards||1);
    });
    const divs=groups.filter(g=>g.entries.length);

    // 4) subset-collapse: keep only SUPERSET divisions. Drop any division whose
    //    sailors are ≥90% contained in a strictly larger one (e.g. "Girls U16" ⊂
    //    "Girls U18"). Genuinely distinct divisions (different gender/class)
    //    barely overlap, so the high ratio uniquely flags a real subset.
    const containedIn=(a,b)=>{ if(!a.keys.size) return false; let n=0; a.keys.forEach(k=>{if(b.keys.has(k))n++;}); return n/a.keys.size>=0.9; };
    const dropped=[];
    const keep=divs.filter((g,gi)=>{
      const hasSuper=divs.some((h,hi)=>hi!==gi&&h.entries.length>g.entries.length&&containedIn(g,h));
      if(hasSuper){ dropped.push(g.division||`${g.entries.length} rows`); return false; }
      return true;
    });

    if(!keep.length){
      const firstErr=pageErrors.length?pageErrors[0].error:"";
      return{ok:false,error:pageErrors.length
        ?`AI parser couldn't read this PDF (${pageErrors.length}/${pageCount} pages failed). Reason: ${firstErr}. Try the built-in parser, or a Sailwave/Manage2sail export.`
        :"AI parser returned no entries."};
    }
    const total=keep.reduce((n,g)=>n+g.entries.length,0);
    const notes=[keep.length>1
      ?`AI-parsed ${pageCount} pages → ${keep.length} divisions, ${total} competitors.`
      :`AI-parsed ${pageCount} pages → ${total} competitors.`];
    if(dropped.length) notes.push(`Collapsed ${dropped.length} subset division(s) into their superset: ${dropped.join(", ")}.`);
    if(pageErrors.length) notes.push(`⚠ ${pageErrors.length} page(s) failed (${pageErrors.map(x=>x.page).join(", ")}) — review for gaps before publishing.`);
    const evName=name||file.name.replace(/\.pdf$/i,"");
    if(keep.length===1)
      return{ok:true,multi:false,name:evName,date,discards,entries:keep[0].entries,ai_parsed:true,notes,partial:pageErrors.length>0};
    return{ok:true,multi:true,name:evName,date,discards,ai_parsed:true,notes,partial:pageErrors.length>0,
      fleets:keep.map(g=>({name:g.division||"Division",entries:g.entries,discards:g.discards||discards}))};
  };

  // Fetch + parse a live results link server-side (browser can't, due to CORS).
  const parseLink=async(url,mode="ai")=>{
    try{
      const res=await fetch(`/api/sailing/parse_pdf?mode=${mode}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url,mode})});
      const data=await res.json();
      if(!data.ok) return{ok:false,error:data.error||"Could not parse that link."};
      return data;
    }catch{return{ok:false,error:"Couldn't reach the parser. Check api/parse_pdf.py is deployed."};}
  };

  // Build a previewEv object from parsed fleet data (no state side-effects).
  // Match a parser-detected host name to a runtime host (case-insensitive,
  // punctuation ignored). Tries an exact normalised match, then containment
  // either way (so "RHKYC" ↔ "Royal Hong Kong Yacht Club" still resolves).
  const _normHostName=s=>String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"");
  const matchDetectedHost=name=>{
    const n=_normHostName(name); if(n.length<3) return null;
    const all=[...ASSOCIATIONS,...CLUBS,...FEDERATIONS];
    let h=all.find(x=>_normHostName(x.name)===n);
    if(h) return h.id;
    h=all.find(x=>{const hn=_normHostName(x.name);return hn.length>=3&&(hn.includes(n)||n.includes(hn));});
    return h?h.id:null;
  };
  // Build the organizer-attribution fields from a detected host name. Matched →
  // attribute to that host (+ prefill its country); unmatched → "Another
  // organizer" with the detected name as free text.
  const orgFromDetectedHost=name=>{
    const nm=String(name||"").trim();
    if(!nm) return {};
    const matchedId=matchDetectedHost(nm);
    const importerHost=(portal&&!isClassPortal)?portal:null;
    if(matchedId){
      const code=hostLocation(matchedId,events);
      if(matchedId===importerHost) return {_orgMode:"self",...(code?{venue:code}:{})};
      return {_orgMode:"external",_orgHost:matchedId,...(code?{venue:code}:{})};
    }
    return {_orgMode:"external",_orgName:nm};
  };

  const previewFromData=(name,date,fleet,aiParsed=false,detectedClass="",detectedHost="")=>{
    const lockedCls=assoc?.cls;                          // association portals lock to their class
    const dhFromEntries=(fleet.entries||[]).some(e=>e.crew&&String(e.crew).trim());
    const inferred=classFromFleetName(fleet.name||name);
    // Resolve the parser's detected_class: a known main-class id is used as-is;
    // an unrecognised name (e.g. "2.4 mR") becomes/reuses a custom class id.
    let detCls="";
    if(detectedClass)
      detCls=CLASSES.some(c=>c.id===detectedClass)?detectedClass:(addCustomClass(detectedClass)||"");
    const cls=lockedCls||inferred||detCls||(dhFromEntries?"29er":"optimist");
    const sh=cls==="ilca"||cls==="optimist";
    return{
      id:"imp_"+Date.now()+"_"+Math.random().toString(36).slice(2,7),
      name:(fleet.name?`${name} — ${fleet.name}`:name)||"Imported Competition",
      cls,doublehanded:!sh,venue:"",country:"",
      date:date||"",discards:fleet.discards||1,scoring:"Appendix A",
      source:"Imported",status:"Final",
      ai_parsed:aiParsed||false,
      entries:(fleet.entries||[]).map(e=>({
        helm:e.helm||"",crew:sh?"":(e.crew||""),sail:e.sail||"—",nat:e.nat||"",div:e.div||"",
        gender:e.gender||"",category:e.category||"",
        races:e.races||[],race_codes:e.race_codes||null,pdf_rank:e.pdf_rank??null,pdf_net:e.pdf_net??null,
        birth_year:e.birth_year??null,crew_birth_year:sh?null:(e.crew_birth_year??null),
      })),
      // Organizer/country prefill from detected_host — applied last so it can
      // override venue:"". Identical across sibling fleets → they start synced.
      ...orgFromDetectedHost(detectedHost),
    };
  };

  // Reshape a parsed preview into an UPCOMING entry list: no scores, no ranks, no
  // discards. status:"Upcoming" is what flips the preview editor and the publish
  // path into entry-list mode; the event page itself keys off the empty races.
  const toUpcomingPreview=pv=>({...pv,status:"Upcoming",source:"Entry list",discards:0,scoring:"",
    entries:(pv.entries||[]).map(e=>({...e,races:[],race_codes:null,pdf_rank:null,pdf_net:null}))});

  // ── MULTI-FILE: parse all chosen files into the pending list ──
  // Drag-and-drop: same code path as the file input's onChange (handleFiles). Depth
  // counter guards against dragleave firing when the pointer crosses child elements.
  // No pdfLoading gate: the hub accepts new files while earlier ones still parse.
  const onDragEnter=e=>{e.preventDefault();e.stopPropagation();setDragDepth(d=>d+1);};
  const onDragOver=e=>{e.preventDefault();e.stopPropagation();};
  const onDragLeave=e=>{e.preventDefault();e.stopPropagation();setDragDepth(d=>Math.max(0,d-1));};
  const onDropFiles=(e,mode)=>{
    e.preventDefault();e.stopPropagation();setDragDepth(0);
    const files=e.dataTransfer?.files;
    if(files&&files.length) handleFiles(files,mode);
  };
  const handleFiles=async(fileList,mode="ai")=>{
    const files=[...(fileList||[])];
    if(!files.length) return;
    setPdfError("");
    // APPEND to the hub queue — never clobber batches already parsing. The host can
    // keep adding files/links while earlier ones are still working.
    const stamp=Date.now()+"_"+Math.random().toString(36).slice(2,6);
    const entriesMode=mode==="entries";
    const seed=files.map((f,i)=>({id:"pf_"+stamp+"_"+i,name:f.name,status:"parsing",error:null,previewEv:null,subclass:null,collabs:[],
      ...(entriesMode?{kind:"upcoming"}:{}),
      notes:[entriesMode?"Reading the entry list with AI…":mode==="ai"?"Sending to the AI parser…":"Reading with the built-in parser…"]}));
    setPending(prev=>[...prev,...seed]);
    const note=(id,txt)=>setPending(prev=>prev.map(p=>p.id===id?{...p,notes:[txt]}:p));
    // Parse files concurrently. Total time ≈ slowest file, not the sum. Cap
    // concurrency so a large batch doesn't fire dozens of simultaneous AI calls.
    const handleOne=async(i)=>{
      const id=seed[i].id;
      let rows;
      try{
        const f=files[i];
        const isPdf=f.name.toLowerCase().endsWith(".pdf")||f.type==="application/pdf";
        let data;
        if(mode==="ai"&&isPdf){
          // Flow: built-in (rule) parser → per-page Claude for multi-page scans.
          // parseOnePdfPaged tries the rule parser FIRST (handles Sailwave /
          // Manage2sail / Sailti instantly, all pages, exact names), does ONE
          // whole-file Claude call for single-page unknowns, and only chunks
          // page-by-page for MULTI-PAGE image/unknown PDFs — where a single
          // whole-file pass silently returns just page 1 (each page is often its
          // own division). Most files finish in the rule parser with no AI at all.
          note(id,"Reading with the built-in parser…");
          data=await parseOnePdfPaged(f,(p,t)=>note(id,t>1?`AI reading page ${Math.min(p+1,t)} of ${t}…`:"Sending to the AI parser…"));
        }else{
          data=await parseOneFile(f,mode);
        }
        // Flag-image nationalities: when the rule parser found a Nat column but it
        // was empty (flags, not text), read them with one small AI call and merge
        // by SAIL NUMBER (never by row order — so a flag can't land on the wrong
        // boat). Best-effort: a failure leaves the result with blank nat.
        if(data.ok&&data.nat_from_flags&&isPdf){
          try{
            note(id,"Reading nationalities from flags…");
            const nr=await fetch(`/api/sailing/parse_pdf?nat=1`,{method:"POST",headers:{"Content-Type":"application/octet-stream"},body:files[i]});
            const nd=await nr.json();
            if(nd.ok&&nd.nats&&Object.keys(nd.nats).length){
              const norm=v=>String(v||"").replace(/\s+/g,"").toLowerCase();
              const apply=ents=>(ents||[]).forEach(e=>{const code=nd.nats[norm(e.sail)];if(code&&!(e.nat||"").trim())e.nat=code;});
              if(data.entries) apply(data.entries);
              if(data.fleets) data.fleets.forEach(fl=>apply(fl.entries));
            }
          }catch(e){ /* best-effort — keep the parsed result without nationalities */ }
        }
        if(!data.ok){
          rows=[{...seed[i],status:"error",error:data.error,notes:[data.error]}];
        }else if(data.multi&&data.fleets?.length){
          const groupId="fg_"+stamp+"_"+i;
          const groupDisc=Math.max(...data.fleets.map(f=>f.discards||1));
          rows=data.fleets.map((fl,fi)=>{
            let pv=previewFromData(data.name,data.date||"",fl,data.ai_parsed||false,data.detected_class||"",data.detected_host||"");
            if(entriesMode) pv=toUpcomingPreview(pv);
            return{id:seed[i].id+"_f"+fi,name:`${files[i].name} · ${fl.name||"Fleet "+(fi+1)}`,status:"ok",error:null,
            previewEv:pv,subclass:null,collabs:[],...(entriesMode?{kind:"upcoming"}:{}),
            fleetGroupId:groupId,fleetGroupBaseName:data.name,fleetGroupDiscards:groupDisc,
            notes:[...(data.notes||[]),`Split into ${data.fleets.length} fleets.`]};});
        }else{
          let pv=previewFromData(data.name,data.date||"",{name:"",entries:data.entries,discards:data.discards},data.ai_parsed||false,data.detected_class||"",data.detected_host||"");
          if(entriesMode) pv=toUpcomingPreview(pv);
          rows=[{...seed[i],status:"ok",notes:data.notes||["Done."],previewEv:pv}];
        }
      }catch(err){
        // §6: one bad file must never fail the whole batch. Any unexpected throw
        // becomes this file's own error row; siblings continue.
        const msg=(err&&err.message)?err.message:"Couldn't read this file — try exporting it as PDF, Excel, or HTML.";
        rows=[{...seed[i],status:"error",error:msg,notes:[msg]}];
      }
      // Swap the placeholder for its parsed row(s) in place — a multi-fleet file
      // expands to one row per fleet. Id-keyed, so parallel batches can't collide.
      setPending(prev=>prev.flatMap(p=>p.id===id?rows:[p]));
    };
    let next=0;
    const worker=async()=>{ while(next<files.length){ const i=next++; await handleOne(i); } };
    await Promise.all(Array.from({length:Math.min(3,files.length)},worker));
    // No auto-open: parsed results wait in the hub queue — the host opens each
    // via its Review button, in any order, whenever it suits them.
  };

  // ── LIVE LINK: fetch + parse a results URL server-side, append to the queue ──
  const handleLink=async(url,mode="ai")=>{
    const u=(url||"").trim();
    if(!u) return;
    setPdfError("");
    setLiveUrl("");   // clear the bar right away so the next link can be pasted while this one parses
    const id="link_"+Date.now()+"_"+Math.random().toString(36).slice(2,6);
    const entriesMode=mode==="entries";
    setPending(prev=>[...prev,{id,name:u,status:"parsing",error:null,previewEv:null,subclass:null,collabs:[],...(entriesMode?{kind:"upcoming"}:{}),
      notes:[entriesMode?"Fetching the entries page server-side…":"Fetching the page server-side…"]}]);
    const data=await parseLink(u,mode);
    let rows;
    if(!data.ok){
      rows=[{id,name:u,status:"error",error:data.error,previewEv:null,subclass:null,collabs:[],notes:[data.error]}];
    }else if(data.multi&&data.fleets?.length){
      const groupDisc=Math.max(...data.fleets.map(f=>f.discards||1));
      rows=data.fleets.map((fl,fi)=>{
        let pv=previewFromData(data.name,data.date||"",fl,data.ai_parsed||false,data.detected_class||"",data.detected_host||"");
        if(entriesMode) pv=toUpcomingPreview(pv);
        return{id:id+"_f"+fi,name:`${data.name||"Link"} · ${fl.name||"Fleet "+(fi+1)}`,status:"ok",error:null,
        previewEv:pv,subclass:null,collabs:[],...(entriesMode?{kind:"upcoming"}:{}),
        fleetGroupId:id,fleetGroupBaseName:data.name,fleetGroupDiscards:groupDisc,notes:data.notes||["Parsed."]};});
    }else{
      let pv=previewFromData(data.name,data.date||"",{name:"",entries:data.entries,discards:data.discards},data.ai_parsed||false,data.detected_class||"",data.detected_host||"");
      if(entriesMode) pv=toUpcomingPreview(pv);
      rows=[{id,name:data.name||u,status:"ok",error:null,notes:data.notes||["Parsed."],
        previewEv:pv,subclass:null,collabs:[],...(entriesMode?{kind:"upcoming"}:{})}];
    }
    // No auto-open — the result waits in the hub queue with a Review button.
    setPending(prev=>prev.flatMap(p=>p.id===id?rows:[p]));
  };

  const handlePdf=async file=>{
    if(!file) return;
    return handleFiles([file]);
  };
  const selectFleet=fleet=>buildPreviewFromFleet(pdfMeta.name,pdfMeta.date,fleet);
  const updPMeta=(k,v)=>setPreviewEv(ev=>({...ev,[k]:v}));
  const updPEntry=(idx,k,v)=>setPreviewEv(ev=>({...ev,entries:ev.entries.map((e,i)=>i===idx?{...e,[k]:v}:e)}));
  // Update a SHARED field (Host Country, Date, Organizer) on the active preview
  // AND every sibling tab from the same source file (fleetGroupId) — edit once,
  // applied to all fleets of that file. Other fields stay per-tab via updPMeta.
  const updSharedMeta=(k,v)=>{
    setPreviewEv(ev=>ev?{...ev,[k]:v}:ev);            // active (live editor)
    const gid=pending.find(p=>p.id===activePending)?.fleetGroupId;
    if(!gid) return;                                  // single-file → nothing to sync
    setPending(prev=>prev.map(p=>
      (p.id!==activePending&&p.fleetGroupId===gid&&p.previewEv)
        ? {...p,previewEv:{...p.previewEv,[k]:v}}
        : p));
  };
  // Collab (association/club) is stored per-fleet in `mf`/pending, not previewEv.
  // Sync it across every sibling fleet of the same source file — set once, applied
  // to all fleets of that event (same behaviour as Host Country / Date above).
  const updSharedCollabs=(v)=>{
    updMeta("collabs",v);                              // active editor (mf)
    const gid=pending.find(p=>p.id===activePending)?.fleetGroupId;
    if(!gid) return;                                   // single-file → nothing to sync
    setPending(prev=>prev.map(p=>p.fleetGroupId===gid?{...p,collabs:v}:p));
  };
  // Resolve the host driving the preview: the self-organizing importer, else
  // the manually attributed AthLink host (detected, or picked in the organiser
  // controls). Re-derives whenever _orgMode/_orgHost change, so a later manual
  // organiser pick flows through the same auto-fill effect below.
  const _pvImporterHost=(portal&&!isClassPortal)?portal:null;
  const _pvResolvedHost=previewEv
    ?((((previewEv._orgMode||"self")!=="external")&&_pvImporterHost)?_pvImporterHost:(previewEv._orgHost||null))
    :null;
  // Inheritance rule: a competition inherits the organiser host's home country
  // as the DEFAULT Host Country when the document printed none — always
  // overridable in the preview. Only fill when both the field (venue) AND any
  // document-parsed country are empty, so we never clobber a value the user
  // typed or one the parser read off the document.
  useEffect(()=>{
    if(!_pvResolvedHost||!previewEv||previewEv.venue||previewEv.country) return;
    const code=hostLocation(_pvResolvedHost,events);
    if(code) updSharedMeta("venue",code);   // keep auto-filled country synced across sibling fleets
  },[_pvResolvedHost,previewEv?.venue,previewEv?.country]);
  // ── Web-lookup enrichment ──────────────────────────────────────────────
  // After a file parse lands (pending item → ok) and the preview STILL lacks a
  // date and/or a Host Country (AFTER the host-country inheritance above), fire
  // ONE best-effort /api/enrich lookup for that item. Runs once per item
  // (guarded by item._enriched), never auto-applies — it only stores a
  // low-confidence suggestion the strip below the fields can offer.
  useEffect(()=>{
    const item=pending.find(p=>p.id===activePending);
    if(!item||item.status!=="ok"||!item.previewEv||item._enriched) return;
    const pv=item.previewEv;
    const missing=[];
    if(!String(pv.date||"").trim())  missing.push("date");
    if(!String(pv.venue||"").trim()) missing.push("country");   // venue = Host Country field
    if(!missing.length) return;
    const nm=String(pv.name||"").trim();
    if(!nm) return;
    // Resolve organiser name (attributed host, else free-text) + a 4-digit year
    // from the date or the name — extra signal to pin the exact event.
    const host=hostById(_pvResolvedHost)?.name||pv._orgName||"";
    const ym=String(pv.date||"").match(/(\d{4})/)||nm.match(/\b(20\d{2})\b/);
    const year=ym?ym[1]:"";
    const cls=pv.cls?classLabel(pv.cls):"";
    // Mark enriched immediately so re-renders can't refire the request.
    setPending(prev=>prev.map(p=>p.id===item.id?{...p,_enriched:true}:p));
    (async()=>{
      try{
        const r=await fetch("/api/enrich",{method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({name:nm,cls,year,host,missing})});
        const d=await r.json();
        if(!d||!d.ok) return;                                  // provider error → show nothing
        if(!d.date&&!d.country) return;                        // no confident answer → show nothing
        setEnrichSug(s=>({...s,[item.id]:{date:d.date||null,country:d.country||null,source:d.source||null,dismissed:false}}));
      }catch{ /* enrichment is optional — never break the preview */ }
    })();
  },[pending,activePending,_pvResolvedHost]);
  // Build the DivisionToggle string from an entry's real gender + category.
  // Carry the ACTUAL age band (U17/U18/Jr…), not a flattened Jr flag, so the
  // picker shows the real division.
  const divFromEntry=(e)=>{
    const g=normGender(e.gender)||parseDiv(e.div||"").gender||"";
    const cat=normCategory(e.category)||(parseDiv(e.div||"").jr?"Jr":"");
    return [g,cat].filter(Boolean).join(" ");
  };
  // Toggle in preview writes the REAL gender + category fields (preserves U17 etc.).
  const applyPreviewDiv=(idx,v)=>{
    const parts=String(v||"").trim().split(/\s+/).filter(Boolean);
    const isGender=t=>/^(m|f|mix)$/i.test(t);
    const gTok=parts.find(isGender)||"";
    const g=/mix/i.test(gTok)?"Mix":gTok.toUpperCase();
    const category=parts.find(t=>!isGender(t))||"";   // U17 / U18 / Jr / …
    setPreviewEv(ev=>({...ev,entries:ev.entries.map((e,i)=>
      i!==idx?e:{...e,div:v,gender:g,category})}));
  };
  // The division tag of one entry, exactly as the row's toggle displays it.
  const _divCatOf=(e)=>{
    const parts=String(divFromEntry(e)||"").split(/\s+/).filter(Boolean);
    return parts.find(t=>!/^(m|f|mix)$/i.test(t))||"";
  };
  // Rename a division tag across EVERY row of the active preview (Jr → U18 …).
  const renameDivToken=(from,to)=>{
    const t=String(to||"").trim().replace(/\s+/g,"");
    if(!t||t===from) return;
    setPreviewEv(ev=>({...ev,entries:ev.entries.map(e=>{
      if(_divCatOf(e)!==from) return e;
      const parts=String(divFromEntry(e)||"").split(/\s+/).filter(Boolean);
      const gTok=parts.find(x=>/^(m|f|mix)$/i.test(x))||"";
      const g=/mix/i.test(gTok)?"Mix":gTok.toUpperCase();
      return {...e,category:t,gender:g,div:[g,t].filter(Boolean).join(" ")};
    })}));
  };

  const startPreviewEdit=(type,idx,raceIdx,val)=>{
    setPreviewEdit({type,idx,raceIdx});
    setPreviewEditVal(val===null||val===undefined?"":String(val));
  };
  const commitPreviewEdit=()=>{
    if(!previewEdit) return;
    const{type,idx,raceIdx}=previewEdit;
    setPreviewEv(ev=>{
      const entries=[...ev.entries];
      if(type==="score"){
        const raw=previewEditVal.trim().toUpperCase();
        let nv;
        if(!raw){nv=null;}
        else if(/^\d+(\.\d+)?$/.test(raw)){nv=parseFloat(raw);if(nv===Math.floor(nv))nv=Math.floor(nv);}
        else nv=raw;
        const races=[...(entries[idx].races||[])];
        while(races.length<=raceIdx) races.push(null);
        races[raceIdx]=nv;entries[idx]={...entries[idx],races};
      }else if(type==="helm") entries[idx]={...entries[idx],helm:previewEditVal};
      else if(type==="crew") entries[idx]={...entries[idx],crew:previewEditVal};
      else if(type==="sail") entries[idx]={...entries[idx],sail:previewEditVal||"—"};
      return{...ev,entries};
    });
    setPreviewEdit(null);
  };

  // ── Announced-event matcher: does an imported RESULT correspond to an
  // upcoming competition we already published as an entry list? Same class +
  // similar name (token Jaccard ≥ .5) + dates within 45 days (when both known).
  // Used to ATTACH results to the announced event instead of duplicating it.
  const _nameTokens=s=>new Set(String(s||"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[^a-z0-9 ]+/g," ").split(/\s+/).filter(Boolean));
  const _dkTs=dk=>Date.UTC(+dk.slice(0,4),+dk.slice(4,6)-1,+dk.slice(6,8));
  const findUpcomingMatch=(cand)=>{
    const tks=_nameTokens(cand.name); if(!tks.size) return null;
    const dkNew=dateKey(cand.date)||"";
    let best=null,bestScore=0;
    events.forEach(x=>{
      if(x.status==="Draft"||!isUpcomingEvent(x)) return;
      if((x.cls||"")!==(cand.cls||"")) return;
      const xt=_nameTokens(x.name); if(!xt.size) return;
      let inter=0; xt.forEach(t=>{if(tks.has(t))inter++;});
      const jac=inter/(new Set([...xt,...tks]).size);
      if(jac<0.5) return;
      const dkOld=dateKey(x.date)||"";
      let boost=0;
      if(dkNew&&dkOld){
        const days=Math.abs(_dkTs(dkNew)-_dkTs(dkOld))/86400000;
        if(days>45) return;                 // same name but a different edition
        if(days<=10) boost=0.15;
      }
      if(jac+boost>bestScore){best=x;bestScore=jac+boost;}
    });
    return best;
  };

  // After a result is filed (published, drafted, or deduped): tick its queue item
  // off and drop back to the hub list — its editor tab closes automatically. The
  // legacy no-queue path (fleet picker) still closes the whole pop-up.
  const finishPublished=(msg)=>{
    if(activePending&&pending.some(p=>p.id===activePending)){
      // Keep the competition's display name on the ticked nugget; drop the heavy
      // entries payload (a published item is never reopened in the editor).
      const finalName=previewEv?.name||null;
      setPending(prev=>prev.map(p=>p.id===activePending?{...p,status:"published",publishedMsg:msg,name:finalName||p.previewEv?.name||p.name,previewEv:null}:p));
      setActivePending(null);setPreviewEv(null);setImportStep("upload");
    }else{
      closeImport();
    }
  };
  const importPreview=async(asDraft)=>{
    if(!previewEv) return;
    const isUpcomingPublish=previewEv.status==="Upcoming";
    const status=asDraft?"Draft":(isUpcomingPublish?"Upcoming":"Final");
    // Source ≠ organizer. Importing makes you the CONTRIBUTOR (imported_by);
    // you only become the ORGANIZER (owner) when you assert you ran it.
    const importerHost=(portal&&!isClassPortal)?portal:null;
    const selfOrganized=(previewEv._orgMode||"self")!=="external" && !!importerHost;
    const attributedHost=selfOrganized?importerHost:(previewEv._orgHost||null);
    const ev={...previewEv,status,
      cls:previewEv.cls||assoc?.cls||"29er",
      subclass:mf.subclass||previewEv.subclass||null,
      owner:attributedHost||null,
      owner_confirmed:selfOrganized,
      imported_by:importerHost,
      organizer_name:selfOrganized?null:(attributedHost?null:(previewEv._orgName||null)),
      collabs:mf.collabs||previewEv.collabs||[],
      venue:previewEv.venue||"",
      country:(previewEv.venue||"").toUpperCase()||previewEv.country||"",
      date:previewEv.date||"",
      doublehanded:previewEv.entries.some(e=>e.crew&&e.crew.trim()),
    };
    ev.entries=ev.entries.map(e=>({...e,races:(e.races||[]).filter(r=>r!==null&&r!==undefined&&r!==""),}));
    delete ev._orgMode; delete ev._orgHost; delete ev._orgName;
    ev.fingerprint=eventFingerprint(ev);
    ev.sources=[...new Set([...(previewEv.sources||[]),importerHost].filter(Boolean))];
    // Phase B — dedup on import. If this competition already exists (same
    // fingerprint: name + date + class + sail-number set), don't create a
    // duplicate. Link this contributor as an extra source, backfill any blank
    // metadata, and — if they assert they organized it and the existing record
    // has no confirmed organizer — transfer confirmed ownership to them. Only
    // dedups when there's a real sail set (guards against blank/draft collisions).
    const fpSails=(ev.fingerprint||"").split("|")[3];
    // When publishing RESULTS, an announced entry list with the same fingerprint is
    // NOT a duplicate — it's the same event awaiting its results (attach path below).
    const dup=fpSails?events.find(x=>x.id!==ev.id&&eventFingerprint(x)===ev.fingerprint&&(isUpcomingPublish||!isUpcomingEvent(x))):null;
    if(dup){
      const mergedSources=[...new Set([...(dup.sources||[]),...(ev.sources||[])])];
      const patch={sources:mergedSources};
      if(!dup.date&&ev.date) patch.date=ev.date;
      if(!dup.venue&&ev.venue) patch.venue=ev.venue;
      if(!dup.country&&ev.country) patch.country=ev.country;
      if(selfOrganized&&dup.owner_confirmed===false){patch.owner=importerHost;patch.owner_confirmed=true;patch.imported_by=dup.imported_by||importerHost;}
      setEvents(p=>p.map(x=>x.id===dup.id?{...x,...patch}:x));
      const who=hostById(importerHost)?.name||"your contribution";
      clearImportDraft();   // this result is filed — drop it from any stashed draft
      setNote({name:dup.name,matched:0,created:0,msg:`Already on AthLink — linked ${who} as an additional source (no duplicate created).`});
      setTimeout(()=>setNote(null),7000);
      finishPublished("Already on AthLink — linked as a source");
      const isSaved=!String(dup.id).startsWith("imp_")&&!String(dup.id).startsWith("fg_");
      if(isSaved){(async()=>{try{await sbPatch("events",`id=eq.${dup.id}`,patch);}catch(err){console.error("importPreview dedup patch failed",err);}})();}
      return;
    }
    // Phase B½ — attach to an announced upcoming competition. Publishing REAL
    // results that match an entry-list event we announced earlier UPDATES that
    // event in place (same id/URL — shared forecast links keep working) instead
    // of creating a duplicate. The announced owner/collabs are kept; results,
    // name, date and status replace the entry-list versions. The preview banner
    // lets the host opt out (_noAttach) and publish separately.
    const upMatch=(!asDraft&&!isUpcomingPublish&&!previewEv._noAttach)?findUpcomingMatch(ev):null;
    delete ev._noAttach;
    if(upMatch){
      const merged={...upMatch,
        name:ev.name,cls:ev.cls,subclass:ev.subclass||null,doublehanded:ev.doublehanded,
        venue:ev.venue||upMatch.venue,country:ev.country||upMatch.country,date:ev.date||upMatch.date,
        discards:ev.discards,scoring:ev.scoring,source:ev.source,status:"Final",
        fingerprint:ev.fingerprint,
        sources:[...new Set([...(upMatch.sources||[]),...(ev.sources||[])])],
        entries:ev.entries};
      setEvents(p=>p.map(x=>x.id===upMatch.id?merged:x));
      clearImportDraft();
      setNote({name:merged.name,matched:0,created:0,msg:"Results attached to your announced competition — its forecast page now shows the real results."});
      setTimeout(()=>setNote(null),7000);
      finishPublished("Results attached to announced event");
      const isSaved=!String(upMatch.id).startsWith("imp_")&&!String(upMatch.id).startsWith("fg_");
      if(isSaved){(async()=>{try{await replaceEventResultsInDb(upMatch.id,merged);}catch(err){console.error("importPreview: attach-results save failed",err);}})();}
      return;
    }
    const existing=new Set();events.forEach(e=>e.entries.forEach(en=>{existing.add(en.helm);if(en.crew)existing.add(en.crew);}));
    const incoming=new Set();ev.entries.forEach(en=>{incoming.add(en.helm);if(en.crew)incoming.add(en.crew);});
    let matched=0,created=0;incoming.forEach(n=>existing.has(n)?matched++:created++);
    // Optimistic: drop the event into the list and close the popup immediately
    setEvents(p=>[ev,...p.filter(x=>x.id!==ev.id)]);
    clearImportDraft();   // this result is filed — drop it from any stashed draft
    setNote({name:ev.name,matched,created,msg:asDraft?"Saved as draft — confirm when ready.":isUpcomingPublish?"Entry list published — the event page now shows the fleet forecast.":null});
    setTimeout(()=>setNote(null),7000);
    // The editor tab closes automatically; the item stays in the hub queue,
    // ticked off, so the host keeps a gauge of what's done vs still importing.
    finishPublished(asDraft?"Saved as draft":isUpcomingPublish?"Entry list published":"Published");
    // Persist in the background; swap in the DB copy (with real ids) once saved.
    // DETACHED (not awaited) so importPreview resolves as soon as the optimistic
    // UI above is done — the Publish/Draft button's loading state then clears
    // immediately instead of hanging on the DB round-trip.
    (async()=>{
      try{
        const saved=await saveEventToDb(ev);
        if(saved?.[0]?.id){
          // If this contribution was attributed to ANOTHER real host as organizer
          // (external, unconfirmed), file an event claim so it surfaces in that
          // host's "Event claims" tab for a verified admin to confirm.
          if(!selfOrganized&&attributedHost&&hostById(attributedHost)&&attributedHost!==importerHost&&auth?.user?.id){
            try{await createEventClaim(saved[0].id,attributedHost,auth.user.id,`Attributed at import by ${hostById(importerHost)?.name||"a contributor"}`,auth.token);await reloadEventClaims();}
            catch(e){console.error("importPreview: auto event-claim failed",e);}
          }
          const fresh=await sbGet(`events?select=*,entries(*)&id=eq.${saved[0].id}`);
          if(fresh?.[0]){
            const dbEv=dbToApp(fresh[0]);
            setEvents(p=>p.map(x=>x.id===ev.id?dbEv:x));
            // If the user is currently viewing this just-imported event, keep the
            // view pointed at the new DB id so the page doesn't go blank.
            setView(v=>(v.name==="event"&&v.id===ev.id)?{...v,id:dbEv.id}:v);
          }
        } else {
          console.error("importPreview: Supabase save failed — kept in memory only (will not persist on reload)");
        }
      }catch(err){console.error("importPreview: background save error",err);}
    })();
  };

  /* ── inline score editing ─────────────────────────────────── */
  const VALID_CODES=["DNF","DNC","DNS","OCS","DSQ","BFD","UFD","RET","SCP","STP","DPI","DNE","NSC","TAL","ZFP","RDG"];
  const startEdit=(evId,sail,helm,raceIdx,val)=>{setEditCell({evId,sail,helm,raceIdx});setEditVal(String(val));};
  const commitEdit=async()=>{
    if(!editCell) return;
    const raw=editVal.trim().toUpperCase();let nv;
    if(/^\d+(\.\d+)?$/.test(raw)){nv=parseFloat(raw);if(nv===Math.floor(nv))nv=Math.floor(nv);if(nv<1){setEditCell(null);return;}}
    else if(VALID_CODES.includes(raw)) nv=raw;
    else{setEditCell(null);return;}
    const{evId,sail,helm,raceIdx}=editCell;
    const entry=events.find(e=>e.id===evId)?.entries.find(e=>e.sail===sail&&e.helm===helm);
    if(entry?._dbId){const u=[...entry.races];u[raceIdx]=nv;await sbPatch("entries",`id=eq.${entry._dbId}`,{races:u});}
    setEvents(prev=>prev.map(ev=>{
      if(ev.id!==evId) return ev;
      return{...ev,entries:ev.entries.map(e=>{
        if(e.sail!==sail||e.helm!==helm) return e;
        const r=[...e.races];r[raceIdx]=nv;return{...e,races:r};
      })};
    }));
    setEditCell(null);
  };

  /* ── manual entry ops ─────────────────────────────────────── */
  const updMeta=(k,v)=>setMf(f=>({...f,[k]:v}));
  const updRow=(i,k,v)=>setMf(f=>({...f,rows:f.rows.map((r,ri)=>ri===i?{...r,[k]:v}:r)}));
  const updScore=(i,j,v)=>setMf(f=>({...f,rows:f.rows.map((r,ri)=>ri===i?{...r,scores:r.scores.map((s,si)=>si===j?v:s)}:r)}));
  const addRow=()=>setMf(f=>({...f,rows:[...f.rows,defRow(f.numRaces)]}));
  const delRow=i=>setMf(f=>({...f,rows:f.rows.filter((_,ri)=>ri!==i)}));
  const setNumRaces=n=>setMf(f=>({...f,numRaces:n,rows:f.rows.map(r=>({...r,scores:Array(n).fill("").map((_,i)=>r.scores[i]||"")}))}));
  const buildManualEvent=(upcoming=false)=>{
    const rows=mf.rows.filter(r=>r.helm.trim());if(!rows.length)return null;
    const disc=upcoming?0:Math.min(mf.discards,Math.max(0,mf.numRaces-1));
    const evCls=assoc?.cls||mf.cls||"29er";
    const sh=evCls==="ilca"||evCls==="optimist";
    return{id:"imp_"+Date.now(),name:mf.name||"Imported Competition",cls:evCls,
      subclass:mf.subclass||null,owner:portal||null,collabs:mf.collabs||[],
      doublehanded:!sh&&rows.some(r=>r.crew.trim()),venue:mf.club||"—",country:mf.club||mf.country||"",
      date:mf.date||"",discards:disc,scoring:upcoming?"":'Appendix A',
      source:upcoming?"Entry list":"Manual import",status:upcoming?"Upcoming":"Final",
      entries:rows.map(r=>({helm:r.helm.trim(),crew:sh?"":r.crew.trim(),sail:r.sail.trim()||"—",nat:(r.nat||"").trim(),div:(r.div||"").trim(),
        races:upcoming?[]:r.scores.map(s=>s.trim()).filter(Boolean).map(s=>/^\d+(\.\d+)?$/.test(s)?parseFloat(s):s.toUpperCase())}))};
  };
  const doImportManual=async(upcoming=false)=>{
    const ev=buildManualEvent(upcoming);if(!ev)return;
    // Manually-entered RESULTS that match an announced upcoming competition
    // attach to it (same rule as the AI import path) — no duplicate event.
    const upMatch=upcoming?null:findUpcomingMatch(ev);
    if(upMatch){
      const merged={...upMatch,name:ev.name,cls:ev.cls,subclass:ev.subclass||null,doublehanded:ev.doublehanded,
        venue:ev.venue||upMatch.venue,country:ev.country||upMatch.country,date:ev.date||upMatch.date,
        discards:ev.discards,scoring:ev.scoring,source:ev.source,status:"Final",entries:ev.entries};
      setEvents(p=>p.map(x=>x.id===upMatch.id?merged:x));
      clearImportDraft();setNote({name:merged.name,matched:0,created:0,msg:"Results attached to your announced competition."});
      setOpen(false);setMf(emptyForm());
      setTimeout(()=>setNote(null),6500);
      const isSaved=!String(upMatch.id).startsWith("imp_")&&!String(upMatch.id).startsWith("fg_");
      if(isSaved){try{await replaceEventResultsInDb(upMatch.id,merged);}catch(err){console.error("doImportManual: attach-results save failed",err);}}
      return;
    }
    const existing=new Set();events.forEach(e=>e.entries.forEach(en=>{existing.add(en.helm);if(en.crew)existing.add(en.crew);}));
    const incoming=new Set();ev.entries.forEach(en=>{incoming.add(en.helm);if(en.crew)incoming.add(en.crew);});
    let matched=0,created=0;incoming.forEach(n=>existing.has(n)?matched++:created++);
    // Optimistic: show the event + close the popup immediately, then persist in
    // the BACKGROUND so the UI never blocks on the DB round-trip. Swap in the
    // saved copy (with real ids) once it lands.
    setEvents(p=>[ev,...p]);
    clearImportDraft();setNote({name:ev.name,matched,created});setOpen(false);setMf(emptyForm());
    setTimeout(()=>setNote(null),6500);
    (async()=>{
      try{
        const saved=await saveEventToDb(ev);
        if(saved?.[0]?.id){
          const fresh=await sbGet(`events?select=*,entries(*)&id=eq.${saved[0].id}`);
          if(fresh?.[0]){
            const dbEv=dbToApp(fresh[0]);
            setEvents(p=>p.map(x=>x.id===ev.id?dbEv:x));
            setView(v=>(v.name==="event"&&v.id===ev.id)?{...v,id:dbEv.id}:v);
          }
        }
      }catch(err){ console.error("doImportManual: background save failed",err); }
    })();
  };

  /* ── sail display helper ───────────────────────────────────── */
  const sailDisplay=(nat,sail)=>{
    if(!nat) return sail;
    const flag=iocFlag(nat);
    return`${flag} ${nat} ${sail}`;
  };

  /* ═════════════════════════════════════════════════════════════ */
  return(
  <div className="al-root">
  {initialLoading&&(
    <div className="al-splash" role="status" aria-label="Loading AthLink">
      <img src="/brand/icon-white.png" alt="AthLink" className="al-splash-logo"/>
      <div className="al-splash-bar"><span/></div>
    </div>
  )}
  <svg xmlns="http://www.w3.org/2000/svg" style={{display:'none'}} aria-hidden="true">
    <filter id="glass-distortion" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox">
      <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="turbulence"/>
      <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="8" xChannelSelector="R" yChannelSelector="G" result="displacement"/>
      <feGaussianBlur in="displacement" stdDeviation="0.5" result="blur"/>
      <feBlend in="SourceGraphic" in2="blur" mode="normal"/>
    </filter>
  </svg>
  <LiquidBackground/>
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Barlow:wght@600;700;800&display=swap');
    /* Branded initial-load splash — shown while the first Supabase fetch settles
       so the app never reads as a broken blank white screen. */
    .al-splash{position:fixed;inset:0;z-index:300;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;
      background:radial-gradient(120% 120% at 50% 0%,#1f4e80 0%,#13314e 55%,#0e2137 100%);}
    .al-splash-logo{width:78px;height:78px;object-fit:contain;filter:drop-shadow(0 8px 24px rgba(0,0,0,.35));animation:al-splash-pulse 1.5s ease-in-out infinite;}
    .al-splash-bar{width:160px;height:4px;border-radius:980px;background:rgba(255,255,255,.18);overflow:hidden;}
    .al-splash-bar span{display:block;height:100%;width:40%;border-radius:980px;background:rgba(255,255,255,.88);animation:al-splash-slide 1.1s ease-in-out infinite;}
    @keyframes al-splash-pulse{0%,100%{transform:scale(1);opacity:.9;}50%{transform:scale(1.08);opacity:1;}}
    @keyframes al-splash-slide{0%{transform:translateX(-120%);}100%{transform:translateX(320%);}}
    .al-root{
      --navy:#13314e;--navy2:#1f4e80;--accent:#0a84ff;--accent2:#409cff;--sky:#e8f1fc;
      --paper:#eef3fb;--ink:#1d1d1f;--mut:rgba(44,52,68,0.86);--line:rgba(60,60,67,0.12);
      --card:#ffffff;--gold:#c8920b;--link:#0a4fb0;
      --mat-thin:rgba(255,255,255,0.40);--mat-reg:rgba(255,255,255,0.55);--mat-thick:rgba(250,251,253,0.85);
      --mat-dark:rgba(17,40,66,0.58);--grouped:rgba(118,118,128,0.10);--halo:rgba(10,132,255,0.20);
      --radius:16px;
      font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Segoe UI',Roboto,system-ui,sans-serif;
      color:var(--ink);min-height:100vh;-webkit-font-smoothing:antialiased;font-optical-sizing:auto;letter-spacing:-.01em;
      position:relative;z-index:0;isolation:isolate;
      background:linear-gradient(165deg,#d5deee 0%,#dfe8f5 45%,#e6eaf3 100%);
      background-attachment:fixed;}
    .al-liquid{position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;filter:blur(28px) saturate(125%);opacity:.55;}
    .al-root *{box-sizing:border-box;}
    /* SF Pro everywhere — overrides the inline Barlow/DM Sans refs to get the platform feel */
    .al-root *:not(svg):not(svg *){font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Segoe UI',Roboto,system-ui,sans-serif !important;}
    .disp{font-weight:700;letter-spacing:-.022em;}
    .wrap{max-width:1000px;margin:0 auto;padding:0 22px;}
    .topbar{background:var(--mat-dark);backdrop-filter:blur(44px) saturate(195%);-webkit-backdrop-filter:blur(44px) saturate(195%);color:#fff;position:sticky;top:0;z-index:60;border-bottom:1px solid rgba(255,255,255,.08);}
    .topin{max-width:1000px;margin:0 auto;padding:12px 22px;display:flex;align-items:center;gap:14px;}
    .brand{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:var(--accent);color:#fff;cursor:pointer;flex:none;}
    .topname{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;}
    .topsite{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;color:#fff;letter-spacing:.01em;}
    .nav{display:flex;gap:6px;margin-left:auto;}
    .nav button{font-family:'Barlow',sans-serif;font-weight:600;font-size:14px;color:#bcd2e8;background:none;border:0;padding:7px 13px;border-radius:8px;cursor:pointer;transition:.15s;}
    .nav button:hover{color:#fff;background:rgba(255,255,255,.08);}
    .nav button.on{color:#fff;background:var(--accent);}
    .nav button.sm{color:#9fbdd9;font-size:13px;}
    .nav button.sm:hover{color:#fff;}
    .strip{background:none;color:var(--ink);padding:18px 0 18px;}
    .strip h1{font-family:'Barlow',sans-serif;color:var(--ink);font-size:28px;font-weight:800;margin:0 0 14px;}
    /* ── Standardized page header (back on top, then title) ── */
    .page-head{padding-top:8px;margin-bottom:18px;}
    .page-title{font-family:'Barlow',sans-serif;color:var(--ink);font-size:28px;font-weight:800;margin:0;letter-spacing:-.022em;line-height:1.1;}
    .page-sub{color:var(--mut);font-size:14px;margin:6px 0 0;}
    /* ── Calendar liquid-glass header ── */
    .cal-head-glass{background:rgba(255,255,255,.55);backdrop-filter:blur(40px) saturate(200%);-webkit-backdrop-filter:blur(40px) saturate(200%);border-radius:22px;padding:16px 20px;box-shadow:inset 0 1.5px 0 rgba(255,255,255,.8),inset 0 0 0 .5px rgba(255,255,255,.5),0 10px 30px -14px rgba(0,0,0,.22);}
    .cal-viewtoggle{display:inline-flex;align-items:center;gap:6px;font-family:'Barlow',sans-serif;font-weight:700;font-size:13px;color:var(--navy);background:var(--mat-reg);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);border:0;border-radius:980px;padding:7px 14px;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 1px 0 rgba(255,255,255,.7),0 1px 2px rgba(0,0,0,.07);transition:.15s;}
    .cal-viewtoggle:hover{background:var(--navy);color:#fff;}
    .cal-cls-box{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.5);backdrop-filter:blur(24px) saturate(190%);-webkit-backdrop-filter:blur(24px) saturate(190%);border-radius:980px;padding:5px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.45);}
    .cal-cls-mini{border:1px solid var(--line);background:rgba(255,255,255,.4);border-radius:980px;padding:5px 13px;font-size:12.5px;font-weight:700;font-family:'Barlow',sans-serif;color:var(--mut);cursor:pointer;transition:.16s cubic-bezier(.2,.85,.2,1);}
    .cal-cls-mini:hover{transform:translateY(-1px) scale(1.05);filter:brightness(1.05);}
    .cal-cls-mini.on{box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 3px 10px -4px rgba(0,0,0,.25);}
    .cal-toggle-pill{display:inline-flex;align-items:center;gap:7px;background:rgba(255,255,255,.6);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;border-radius:980px;padding:9px 18px;font-family:'Barlow',sans-serif;font-weight:800;font-size:16px;color:var(--navy);cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.75),inset 0 0 0 .5px rgba(255,255,255,.45),0 4px 14px -6px rgba(0,0,0,.16);transition:.22s cubic-bezier(.2,.85,.2,1);}
    .cal-toggle-pill:hover{background:rgba(255,255,255,.82);transform:translateY(-2px) scale(1.04);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.9),0 12px 28px -10px rgba(0,0,0,.22);}
    .pillbar{display:flex;gap:20px;flex-wrap:wrap;}
    .pill{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--mut);}
    .pill b{color:var(--navy);font-family:'Barlow',sans-serif;font-size:19px;}
    .sec{padding:24px 0 60px;}
    .seclabel{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#33425e;margin:0 0 14px;display:flex;align-items:center;gap:8px;}
    .ev{background:var(--mat-reg);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border:0;border-radius:var(--radius);padding:18px 20px;margin-bottom:12px;cursor:pointer;transition:.18s;display:flex;align-items:center;gap:14px;animation:rise .5s both;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 .5px rgba(255,255,255,.35),0 1px 2px rgba(0,0,0,.05);}
    .ev:hover{transform:translateY(-3px) scale(1.008);box-shadow:inset 0 1px 0 rgba(255,255,255,.85),inset 0 0 0 .5px rgba(255,255,255,.5),0 18px 40px -16px rgba(0,0,0,.28);}
    /* Inline pin control (owners only) + pinned-row dressing */
    .pinbtn{border:0;background:none;color:var(--mut);width:24px;height:24px;border-radius:8px;display:inline-grid;place-items:center;cursor:pointer;transition:.15s;flex:none;padding:0;}
    .pinbtn:hover{background:var(--grouped);color:var(--accent);transform:rotate(-12deg);}
    .pinbtn.on{color:var(--accent);}
    .pinbadge{position:absolute;top:-7px;left:-7px;width:22px;height:22px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;box-shadow:0 2px 8px -2px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.35);z-index:2;pointer-events:none;}
    .pingrip{color:var(--mut);opacity:.5;cursor:grab;flex:none;display:inline-flex;margin-right:-6px;}
    .pingrip:active{cursor:grabbing;}
    .ev.draft{opacity:.72;}
    .evicon{width:44px;height:44px;border-radius:13px;background:var(--sky);color:var(--navy);display:grid;place-items:center;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.6);}
    .evicon-date{width:48px;height:48px;border-radius:12px;background:var(--sky);display:flex;flex-direction:column;align-items:center;justify-content:center;flex:none;gap:0;}
    .evicon-date .eid{font-family:'Barlow',sans-serif;font-weight:800;font-size:20px;color:var(--navy);line-height:1;}
    .evicon-date .eim{font-size:9px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.06em;line-height:1.2;}
    .evicon-year{display:flex;flex-direction:column;align-items:center;gap:0;}
    .evicon-year span{font-size:9px;font-weight:700;color:var(--mut);letter-spacing:.02em;line-height:1.3;font-family:'Barlow',sans-serif;}
    .evname{font-family:'Barlow',sans-serif;font-weight:700;font-size:17px;margin:0 0 3px;}
    .evmeta{font-size:13px;color:var(--mut);display:flex;gap:12px;flex-wrap:wrap;align-items:center;}
    .evmeta span{display:flex;align-items:center;gap:5px;}
    .draftbadge{font-size:11px;font-weight:700;color:#7a4a0a;background:#fdecd6;padding:4px 9px;border-radius:20px;}
    .cls{font-family:'Barlow',sans-serif;font-weight:700;font-size:12px;color:#fff;background:var(--navy2);padding:4px 10px;border-radius:980px;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.12);}
    .delbtn{background:rgba(255,255,255,.5);backdrop-filter:blur(18px) saturate(185%);-webkit-backdrop-filter:blur(18px) saturate(185%);border:0;color:#c0392b;cursor:pointer;padding:7px;border-radius:980px;display:grid;place-items:center;opacity:.72;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.55),inset 0 1px 0 rgba(255,255,255,.65),0 1px 2px rgba(0,0,0,.06);transition:.15s;flex:none;}
    .delbtn:hover{opacity:1;background:rgba(251,231,228,.88);box-shadow:inset 0 0 0 .5px rgba(192,57,43,.30),0 2px 8px -2px rgba(192,57,43,.25);}
    .panel{background:rgba(255,255,255,0.85);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border:0;border-radius:var(--radius);overflow:auto;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.06);}
    table{width:100%;border-collapse:collapse;font-size:13px;min-width:680px;}
    thead th{background:linear-gradient(180deg,rgba(31,78,128,.92),rgba(19,49,78,.94));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);color:#fff;font-family:'Barlow',sans-serif;font-weight:600;text-align:center;padding:11px 5px;font-size:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.12);}
    thead th.l{text-align:left;padding-left:18px;}
    tbody td{padding:8px 5px;text-align:center;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums;}
    tbody td.l{text-align:left;padding-left:18px;}
    tbody td.editable{cursor:text;}tbody td.editable:hover{background:#eef4fb;}
    tbody tr:last-child td{border-bottom:0;}
    .rk{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;width:40px;}
    tbody tr.row-hover{background:#f0f6fc;transition:background .2s;}
    .hover-summary{font-size:11.5px;color:var(--mut);font-style:italic;margin-top:3px;max-width:340px;animation:rise .2s both;}
    .hover-summary.loading{opacity:.6;}
    .summary-row td{padding:0;}
    .team-summary{display:flex;gap:9px;align-items:flex-start;margin:0 0 13px;padding:11px 15px;
      background:rgba(10,132,255,.08);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;
      border-radius:14px;font-size:13px;line-height:1.5;color:var(--ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 3px 0 0 var(--accent);
      transform-origin:top center;animation:summaryPop .42s cubic-bezier(.34,1.5,.5,1) both;}
    .row-ai-tooltip{position:fixed;left:50%;transform:translateX(-50%);z-index:90;
      width:min(540px,88vw);pointer-events:none;
      background:rgba(12,30,55,0.82);backdrop-filter:blur(32px) saturate(200%);-webkit-backdrop-filter:blur(32px) saturate(200%);
      border-radius:16px;padding:13px 16px;
      box-shadow:inset 0 1px 0 rgba(255,255,255,.14),inset 3px 0 0 var(--accent),0 24px 48px -16px rgba(0,0,0,.55);
      display:flex;gap:10px;align-items:flex-start;
      font-size:13px;line-height:1.55;color:#dce8f8;
      animation:rise .18s both;}
    .row-ai-tooltip.loading{color:#7fa8cc;font-style:italic;}
    .team-summary.loading{color:var(--mut);font-style:italic;}
    @keyframes summaryPop{0%{opacity:0;transform:translateY(-9px) scaleY(.5);}55%{opacity:1;transform:translateY(2px) scaleY(1.05);}100%{opacity:1;transform:translateY(0) scaleY(1);}}
    /* Calendar — year/month views */
    .cal-title-btn{font-family:'Barlow',sans-serif;font-weight:700;font-size:18px;color:var(--navy);background:none;border:0;cursor:pointer;padding:6px 14px;border-radius:980px;min-width:150px;transition:.15s;}
    .cal-title-btn:hover{background:var(--grouped);}
    .cal-fade{animation:calFade .26s ease both;}
    @keyframes calFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}
    @keyframes calMorph{0%{opacity:0;transform:scale(.55);transform-origin:center top;}60%{opacity:1;}100%{opacity:1;transform:scale(1);}}
    .cal-year-scroll{flex:1;overflow-y:auto;padding:16px 18px;animation:calFade .26s ease both;}
    .cal-year-block{margin-bottom:28px;}
    .cal-year-label{font-family:'Barlow',sans-serif;font-weight:800;font-size:23px;color:var(--navy);margin:0 0 14px;}
    .cal-year-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:18px;}
    .cal-mini{cursor:pointer;border:0;border-radius:16px;padding:9px;transition:.16s;}
    .cal-mini:hover{background:var(--mat-reg);backdrop-filter:blur(30px) saturate(195%);-webkit-backdrop-filter:blur(30px) saturate(195%);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 8px 22px -12px rgba(0,0,0,.25);transform:translateY(-2px);}
    .cal-mini-name{font-family:'Barlow',sans-serif;font-weight:700;font-size:13px;color:var(--accent);margin-bottom:6px;}
    .cal-mini-dow{display:grid;grid-template-columns:repeat(7,1fr);margin-bottom:3px;}
    .cal-mini-dow span{font-size:8px;color:var(--mut);text-align:center;font-weight:700;}
    .cal-mini-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;}
    .cal-mini-day{font-size:9px;text-align:center;color:var(--ink);width:15px;height:15px;line-height:15px;border-radius:50%;margin:0 auto;}
    .cal-mini-day.o{color:#cbd5e1;}
    .cal-legend{display:flex;align-items:center;gap:13px;flex-wrap:wrap;font-size:11px;color:var(--mut);}
    .cal-legend .lg{display:flex;align-items:center;gap:5px;}
    .cal-legend .dot{width:11px;height:11px;border-radius:50%;}
    .rk.p1{color:var(--gold);}.rk.p2{color:#7d8a98;}.rk.p3{color:#a86a32;}
    .boat{display:flex;align-items:center;gap:10px;}
    .av{width:30px;height:30px;border-radius:50%;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none;font-family:'Barlow',sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,.4),inset 0 0 0 1px rgba(255,255,255,.18);}
    .cn{font-size:11.5px;color:var(--mut);}
    .namelink{color:var(--link);font-weight:700;cursor:pointer;text-decoration:none;}.namelink:hover{color:#063a85;}
    .disc{color:var(--mut);}.code{color:#c0392b;font-weight:600;font-size:11px;}
    .net{font-family:'Barlow',sans-serif;font-weight:700;color:var(--navy);}
    .sailcol{font-size:12px;color:var(--mut);white-space:nowrap;}
    .vchip{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--accent);font-weight:600;}
    .divtag{font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;white-space:nowrap;}
    .divtag.male{color:#1a5e8a;background:#d9edf7;}
    .divtag.female{color:#8a1a3c;background:#f7d9e3;}
    .divtag.mixed{color:#5a1a8a;background:#ead9f7;}
    .divtag.junior{color:#0a6b41;background:#d4f0e0;}
    .cellinput{width:44px;text-align:center;border:1.5px solid var(--accent);border-radius:5px;padding:3px;font:inherit;font-size:13px;outline:none;background:#fff;color:var(--ink);}
    .agrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:13px;}
    .acard{background:rgba(255,255,255,0.80);backdrop-filter:blur(30px) saturate(195%);-webkit-backdrop-filter:blur(30px) saturate(195%);border:0;border-radius:16px;padding:16px;cursor:pointer;transition:.18s;animation:rise .5s both;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.06);
      /* Skip layout/paint for off-screen cards — with hundreds of cards each running an
         expensive backdrop-filter blur, the browser was repainting all of them on every
         scroll frame even the ones nowhere near the viewport, which is what caused the
         visible flashing while scrolling up/down. */
      content-visibility:auto;contain-intrinsic-size:auto 128px;}
    .acard:hover{transform:translateY(-4px) scale(1.015);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.92),0 20px 40px -18px rgba(0,0,0,.28);}
    .achead{display:flex;align-items:center;gap:11px;margin-bottom:12px;}
    .achead>.av{flex:none;}
    .achead .vb-spacer{margin-left:auto;}
    .achead .av{width:42px;height:42px;font-size:14px;}
    .acn{font-family:'Barlow',sans-serif;font-weight:800;font-size:16.5px;line-height:1.12;color:var(--ink);}
    .acstat{display:flex;gap:16px;font-size:10.5px;color:var(--mut);border-top:1px solid var(--line);padding-top:11px;align-items:center;}
    .acstat b{display:block;font-family:'Barlow',sans-serif;font-size:14px;color:var(--ink);font-weight:800;}
    .toolbar{display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap;}
    .srch{flex:1;min-width:200px;display:flex;align-items:center;gap:8px;background:var(--mat-reg);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border:0;border-radius:12px;padding:10px 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 .5px rgba(255,255,255,.35);transition:background .16s,box-shadow .16s;}
    .srch:hover,.srch:focus-within{background:rgba(255,255,255,0.66);box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 0 0 4px var(--halo);}
    .srch input{border:0;outline:0;font:inherit;font-size:14px;width:100%;background:none;color:var(--ink);}
    .seg{display:inline-flex;background:rgba(255,255,255,.42);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;border-radius:980px;padding:5px;gap:2px;box-shadow:inset 0 1px 0 rgba(255,255,255,.75),inset 0 0 0 .5px rgba(255,255,255,.45),0 4px 14px -8px rgba(0,0,0,.14);}
    .seg button{font:inherit;font-family:'Barlow',sans-serif;font-size:13px;font-weight:700;border:0;background:none;color:var(--mut);padding:8px 18px;border-radius:980px;cursor:pointer;transition:.16s cubic-bezier(.2,.85,.2,1);white-space:nowrap;}
    .seg button:hover{color:var(--navy);}
    .seg button.on{background:rgba(255,255,255,.92);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);color:var(--navy);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 8px -2px rgba(0,0,0,.16);}
    .btn{font-weight:600;font-size:14px;border:0;border-radius:980px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;transition:transform .18s cubic-bezier(.4,0,.2,1),filter .18s,background .18s,box-shadow .18s;letter-spacing:-.01em;}
    /* ── Crisp-edge buttons: original (un-blurred) tints + a hairline ring in
       each variant's own hue and a faint separation shadow for definition.
       No displacement distortion on the solid tints — keeps them sharp. ── */
    .btn.cta{background:var(--accent);color:#fff;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.30),inset 0 1px 0 rgba(255,255,255,.45),0 1px 3px rgba(10,132,255,.35);}.btn.cta:hover{background:var(--accent2);}
    .btn.ghost{background:var(--mat-reg);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;color:var(--ink);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.62),inset 0 1px 0 rgba(255,255,255,.72),0 1px 2px rgba(0,0,0,.10);}.btn.ghost:hover{background:rgba(255,255,255,.85);}
    .btn.sky{background:rgba(10,132,255,.20);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);color:var(--navy);border:0;box-shadow:inset 0 0 0 .5px rgba(10,132,255,.45),inset 0 1px 0 rgba(255,255,255,.5),0 1px 2px rgba(0,0,0,.08);}.btn.sky:hover{background:rgba(10,132,255,.28);}
    .btn.amber{background:rgba(255,149,0,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#a85c00;border:0;box-shadow:inset 0 0 0 .5px rgba(255,149,0,.42),inset 0 1px 0 rgba(255,255,255,.45),0 1px 2px rgba(0,0,0,.07);}.btn.amber:hover{background:rgba(255,149,0,.24);}
    .btn.green{background:rgba(52,199,89,.18);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#0a7a3f;border:0;box-shadow:inset 0 0 0 .5px rgba(52,199,89,.45),inset 0 1px 0 rgba(255,255,255,.45),0 1px 2px rgba(0,0,0,.07);}.btn.green:hover{background:rgba(52,199,89,.28);}
    .btn:hover{transform:translateY(-2px) scale(1.025);filter:brightness(1.06);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 12px 28px -10px rgba(0,0,0,.22);}
    .btn:active{transform:translateY(0) scale(.975);filter:brightness(.99);}
    .btn:disabled{opacity:.45;cursor:default;transform:none;filter:none;}
    .phead{background:linear-gradient(135deg,rgba(31,78,128,.95),rgba(19,49,78,.96));backdrop-filter:blur(38px) saturate(185%);-webkit-backdrop-filter:blur(38px) saturate(185%);border-radius:22px;padding:26px;color:#fff;display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 10px 30px -16px rgba(0,0,0,.4);}
    .phead .av{width:74px;height:74px;font-size:26px;border:3px solid rgba(255,255,255,.22);}
    .globe-wrap .expand-tip{opacity:0;transition:opacity .15s;}
    .globe-wrap:hover .expand-tip{opacity:1;}
    /* Year nuggets — per-year chips (same pill size as All) with a class-coloured ring */
    .ynugs{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;align-items:center;}
    .ynug{padding:2px;border:0;border-radius:980px;cursor:pointer;transition:transform .12s,filter .12s;background:rgba(140,170,205,.6);}
    .ynug:hover{transform:translateY(-1px);filter:brightness(1.1);}
    .ynug-in{display:block;border-radius:980px;padding:3px 10px;font-size:10.5px;line-height:1.1;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:.02em;background:#2b4d74;color:#bcd2ea;transition:.12s;}
    .ynug.on .ynug-in{background:#4a76ad;color:#fff;}
    .ynug-all{border:0;border-radius:980px;padding:5px 12px;font-size:10.5px;line-height:1.1;font-weight:800;letter-spacing:.02em;cursor:pointer;background:rgba(120,160,210,.16);color:#9fbdd9;transition:.12s;}
    .ynug-all:hover{filter:brightness(1.1);}
    .ynug-all.on{background:rgba(146,180,222,.34);color:#fff;}
    /* Progress trend line: always shown, with a slow soft glow gliding left → right.
       dasharray period (0.4+0.6) = pathLength(1), and the animation shifts by exactly
       one period, so the loop is seamless (no jump back to the start). */
    @keyframes pgPulse{from{stroke-dashoffset:1;}to{stroke-dashoffset:0;}}
    .pg-pulse{stroke-dasharray:0.4 0.6;animation:pgPulse 12s linear infinite;}
    @media(prefers-reduced-motion:reduce){.pg-pulse{display:none;}}
    .pname{font-family:'Barlow',sans-serif;font-weight:800;font-size:28px;margin:0;line-height:1;}
    .pflag{font-size:28px;line-height:1;margin-right:4px;}
    .pmeta{color:#bcd2e8;font-size:14px;margin-top:8px;display:flex;gap:14px;flex-wrap:wrap;}
    .pmeta span{display:flex;align-items:center;gap:5px;}
    .pstats{display:flex;gap:28px;margin-top:18px;flex-wrap:wrap;}
    .pstats .v{font-family:'Barlow',sans-serif;font-weight:800;font-size:25px;}
    .pstats .k{font-size:11px;color:#9fbdd9;letter-spacing:.05em;text-transform:uppercase;}
    .claimbox{margin-left:auto;text-align:right;}
    .vbox{background:rgba(10,132,255,.16);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;border-radius:16px;padding:12px 16px;color:#eaf3ff;font-size:13px;max-width:240px;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),inset 0 0 0 .5px rgba(255,255,255,.18);}
    .vbox b{color:#fff;display:flex;align-items:center;gap:6px;font-family:'Barlow',sans-serif;}
    .histrow{background:var(--mat-reg);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border:0;border-radius:13px;padding:15px 18px;margin-bottom:11px;display:flex;align-items:center;gap:16px;animation:rise .45s both;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 .5px rgba(255,255,255,.3),0 1px 2px rgba(0,0,0,.05);}
    .hrk{font-family:'Barlow',sans-serif;font-weight:800;font-size:22px;width:58px;text-align:center;flex:none;color:var(--navy);}
    .hrk.p1{color:#a87d00;}.hrk.p2{color:#1f6fb2;}.hrk.p3{color:#b23a3a;}
    .hrk small{display:block;font-size:10px;color:var(--mut);font-weight:600;}
    .oab{flex:none;display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:980px;
      background:linear-gradient(135deg,rgba(200,146,11,.16),rgba(22,58,99,.08));
      border:.5px solid rgba(200,146,11,.4);color:var(--gold);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 1px 2px rgba(0,0,0,.06);
      backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);}
    .oab svg{flex:none;}
    .oabv{font-size:12px;font-weight:700;color:var(--navy);white-space:nowrap;}
    @media(max-width:430px){.oabv{display:none;}.oab{padding:5px 7px;gap:0;}}
    .rolechip{font-size:10px;font-weight:700;letter-spacing:.04em;padding:2px 8px;border-radius:980px;text-transform:uppercase;font-family:'Barlow',sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,.35);}
    .rolechip.helm{color:#fff;background:var(--navy2);}.rolechip.crew{color:var(--navy2);background:var(--sky);}
    .miniraces{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;}
    .rc{width:24px;height:24px;border-radius:8px;background:rgba(118,118,128,.1);color:#2c3e50;font-size:10px;font-weight:700;display:grid;place-items:center;font-variant-numeric:tabular-nums;}
    .rc.c{background:#fbe3e0;color:#c0392b;}
    .rc.d{background:#f0f2f5;color:#8a99aa;}
    .rc.g1{background:#fbe7a6;color:#7a5600;border:1.5px solid #c79a16;}
    .rc.g2{background:#bfe0fb;color:#0d5a96;border:1.5px solid #2a86d6;}
    .rc.g3{background:#fbcaca;color:#9a2222;border:1.5px solid #d65050;}
    /* Compact miniraces for the Rankings cumulative cells: same .rc colour classes
       as the profile, smaller, flowing into at most 2 rows (grow horizontally). */
    .rank-mini{display:grid;grid-auto-flow:column;grid-template-rows:repeat(2,auto);gap:3px;justify-content:start;margin-top:0;}
    .rank-mini .rc{width:17px;height:17px;border-radius:5px;font-size:9px;}
    .rank-mini .rc.g1,.rank-mini .rc.g2,.rank-mini .rc.g3{border-width:1px;}
    /* Home */
    .home-hero{background:none;color:var(--ink);padding:8px 0 0;}
    .home-hero h1{font-family:'Barlow',sans-serif;color:var(--ink);font-size:36px;font-weight:800;margin:0 0 6px;}
    .home-hero p{color:var(--mut);font-size:15px;margin:0 0 20px;}
    /* Search-first hero — one large glass search spanning athletes + competitions + clubs.
       z-index sits above the click-away overlay (55) so the field stays interactive. */
    .hero-srch{position:relative;z-index:56;display:flex;align-items:center;gap:10px;max-width:640px;margin:20px 0 8px;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:980px;padding:14px 20px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.4),0 8px 26px -14px rgba(0,0,0,.25);transition:box-shadow .16s,background .16s;}
    .hero-srch:focus-within{background:rgba(255,255,255,.74);box-shadow:inset 0 1px 0 rgba(255,255,255,.75),0 0 0 4px var(--halo),0 8px 26px -14px rgba(0,0,0,.25);}
    .hero-srch input{flex:1;min-width:0;border:0;background:none;outline:0;font:inherit;font-size:16px;color:var(--ink);-webkit-appearance:none;appearance:none;border-radius:inherit;}
    .hero-srch input::placeholder{color:var(--mut);}
    .hero-drop{position:absolute;top:calc(100% + 8px);left:0;right:0;background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:16px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:6px;max-height:380px;overflow:auto;z-index:5;}
    /* Breadth strip — quiet chips + cards under the hero */
    .strip-chips{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 30px;}
    /* Forces the country/host selects onto their own row below the class chips
       (Fix 9b) — the strip-chips row gap gives a tight vertical gap between them. */
    .strip-break{flex-basis:100%;height:0;margin:0;padding:0;}
    .strip-chip{display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:13.5px;font-weight:700;color:var(--navy);border:0;background:var(--mat-reg);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border-radius:980px;padding:9px 16px;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 1px 0 rgba(255,255,255,.7),0 1px 2px rgba(0,0,0,.08);transition:.16s;}
    .strip-chip:hover{transform:translateY(-2px);background:rgba(255,255,255,.85);}
    .strip-chip .dot{width:9px;height:9px;border-radius:50%;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.35);}
    .strip-chip .cnt{font-weight:600;font-size:12px;color:var(--mut);}
    /* Lens chips — the progressive class filter on results pages */
    .lens-chip{display:inline-flex;align-items:center;gap:7px;font:inherit;font-size:12.5px;font-weight:700;color:var(--mut);border:0;background:rgba(255,255,255,.45);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);border-radius:980px;padding:7px 13px;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.55),inset 0 1px 0 rgba(255,255,255,.6);transition:.15s;}
    .lens-chip:hover{color:var(--navy);background:rgba(255,255,255,.7);}
    .lens-chip.on{background:rgba(255,255,255,.92);color:var(--navy);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 8px -2px rgba(0,0,0,.16);}
    .lens-chip .dot{width:8px;height:8px;border-radius:50%;flex:none;}
    .lens-chip .cnt{font-weight:600;font-size:11.5px;color:var(--mut);}
    /* Nav mega-menus — hover panels under the 4 doors */
    .np-item{position:relative;}
    .np-drop{position:absolute;top:calc(100% + 10px);left:50%;transform:translateX(-50%) translateY(-6px);min-width:232px;background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:16px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:12px;opacity:0;pointer-events:none;transition:opacity .18s ease,transform .18s ease;z-index:70;}
    .np-drop::before{content:"";position:absolute;top:-12px;left:0;right:0;height:12px;}
    /* Hover-only reveal. :has(:focus-visible) keeps keyboard (Tab) access without
       pinning on mouse-click — a mouse click never triggers :focus-visible, so the
       dropdown closes the moment the pointer leaves (no click-out needed). */
    .np-item:hover .np-drop,.np-item:has(:focus-visible) .np-drop{opacity:1;pointer-events:auto;transform:translateX(-50%);}
    .nd-label{margin:2px 4px 8px;font-size:10.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);}
    .nd-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 2px 10px;}
    .nd-chip{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12.5px;font-weight:700;color:var(--navy);border:0;background:rgba(255,255,255,.6);border-radius:980px;padding:6px 12px;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),0 1px 2px rgba(0,0,0,.06);transition:.14s;}
    .nd-chip:hover{background:#fff;transform:translateY(-1px);}
    .nd-chip .dot{width:8px;height:8px;border-radius:50%;flex:none;}
    .nd-row{display:flex;align-items:center;gap:8px;width:100%;font:inherit;font-size:13px;font-weight:600;color:var(--ink);border:0;background:none;border-radius:10px;padding:8px 10px;cursor:pointer;text-align:left;transition:background .12s;white-space:nowrap;}
    .nd-row:hover{background:rgba(255,255,255,.78);}
    .nd-cnt{margin-left:auto;font-size:11.5px;font-weight:600;color:var(--mut);padding-left:10px;}
    .nd-subwrap{position:relative;}
    .nd-sub{position:absolute;left:calc(100% + 6px);top:-8px;min-width:256px;max-height:330px;overflow:auto;background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:14px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:8px;opacity:0;pointer-events:none;transition:opacity .16s ease;z-index:71;}
    .nd-sub::before{content:"";position:absolute;left:-8px;top:0;bottom:0;width:8px;}
    .nd-subwrap:hover .nd-sub{opacity:1;pointer-events:auto;}
    /* Glass select — the country/host dropdowns on list pages */
    .lens-selwrap{position:relative;display:inline-flex;align-items:center;}
    .lens-select{font:inherit;font-size:12.5px;font-weight:700;color:var(--navy);border:0;background:rgba(255,255,255,.6);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);border-radius:980px;padding:7px 30px 7px 14px;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 1px 0 rgba(255,255,255,.7),0 1px 2px rgba(0,0,0,.08);-webkit-appearance:none;appearance:none;outline:none;max-width:230px;text-overflow:ellipsis;}
    .lens-select:hover{background:rgba(255,255,255,.85);}
    .lens-selchev{position:absolute;right:11px;pointer-events:none;color:var(--mut);transform:rotate(90deg);}
    .strip-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px;margin-bottom:32px;}
    .strip-card{background:var(--mat-reg);backdrop-filter:blur(30px) saturate(195%);-webkit-backdrop-filter:blur(30px) saturate(195%);border-radius:16px;padding:16px;cursor:pointer;transition:.18s;box-shadow:inset 0 1px 0 rgba(255,255,255,.65),inset 0 0 0 .5px rgba(255,255,255,.35),0 1px 2px rgba(0,0,0,.05);animation:rise .5s both;}
    .strip-card:hover{transform:translateY(-4px) scale(1.012);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.9),0 20px 40px -18px rgba(0,0,0,.28);}
    .strip-card .sc-top{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;}
    .strip-card .sc-date{font-size:12px;font-weight:600;color:var(--mut);}
    .strip-card .sc-name{margin:0;font-size:15px;font-weight:700;color:var(--ink);line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
    .strip-card .sc-sub{margin:6px 0 0;font-size:12.5px;color:var(--mut);}
    .home-search{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:9px 14px;max-width:380px;margin-bottom:20px;}
    .home-search input{border:0;outline:0;font:inherit;font-size:14px;background:none;color:#fff;width:100%;}
    .home-search input::placeholder{color:#9fbdd9;}
    .home-tabs{display:flex;gap:0;}    .home-tabs button{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;border:0;background:none;color:#9fbdd9;padding:12px 20px;border-bottom:2px solid transparent;margin-bottom:-2px;cursor:pointer;transition:.15s;}
    .home-tabs button.on{color:#fff;border-bottom-color:#fff;}
    .home-tabs button:hover:not(.on){color:#d0e4f4;}
    .pagetabs{background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-bottom:1px solid var(--line);box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}
    .pagetabs .wrap{display:flex;gap:0;flex-wrap:wrap;}
    .pagetabs button{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;border:0;background:none;color:var(--mut);padding:13px 18px;border-bottom:2.5px solid transparent;margin-bottom:-1px;cursor:pointer;transition:.15s;}
    .pagetabs button.on{color:var(--navy);border-bottom-color:var(--accent);}
    .pagetabs button:hover:not(.on){color:var(--navy);}
    /* ── Floating top bar ── */
    .topbar2{position:fixed;top:0;left:0;right:0;z-index:60;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 20px;pointer-events:none;transition:transform .42s cubic-bezier(.2,.85,.2,1),opacity .42s;}
    .topbar2.hidden{transform:translateY(-135%);opacity:0;}
    .topbar2>*{pointer-events:auto;}
    /* Brand pill — same capsule grammar as the landing .tb-brand + .tb-word so
       landing↔sailing reads as one component. Two click targets: icon → AthLink
       landing, "Sailing" → sailing home (divider between). */
    .tb-brand{display:inline-flex;align-items:center;gap:0;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:980px;padding:6px 14px 6px 6px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 24px -12px rgba(0,0,0,.28);flex:none;}
    .tb-logo{width:28px;height:28px;border-radius:980px;overflow:hidden;display:grid;place-items:center;flex:none;cursor:pointer;transition:.15s;}
    .tb-logo img{width:100%;height:100%;display:block;border-radius:inherit;}
    .tb-logo:hover{transform:scale(1.06);box-shadow:0 4px 12px -3px rgba(22,58,99,.5);}
    .tb-divider{width:1px;height:18px;background:rgba(0,0,0,.12);flex:none;margin:0 4px 0 10px;}
    /* SF Pro wordmark treatment matching landing .tb-word (19px/800/-.04em); no
       Barlow, no bg-pill padding so brand height == landing brand height (40px). */
    .tb-sport{font-weight:800;font-size:19px;color:var(--navy);letter-spacing:-.04em;cursor:pointer;padding:0 6px 0 5px;transition:color .15s;}
    .tb-sport:hover{color:var(--accent);}
    .tb-center{flex:1;display:flex;justify-content:center;min-width:0;pointer-events:none;}
    /* Fixed 25px radius (≈ half the closed bar height, so it reads as a capsule when
       closed). Height-independent: as the panel elongates only the body grows — the
       top half keeps its exact shape, no radius reflow, no stretch-and-snap. */
    .menupill{pointer-events:auto;position:relative;width:100%;max-width:440px;min-width:0;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:25px;box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 8px 26px -12px rgba(0,0,0,.3);transition:background .34s ease;}
    /* In nav mode the pill must size to its content; the 440px cap (meant for
       the search field) squeezed the flex row so the last item — the search
       button — spilled ~5px past the pill's right edge and read as detached. */
    .menupill.navmode{width:auto;max-width:none;border-radius:980px;}  /* full capsule in nav mode == landing .tb-nav */
    .menupill.searching{background:rgba(255,255,255,.70);}
    /* 3-item primary nav — seg-control idiom inside the glass capsule */
    .np-bar{display:flex;align-items:center;gap:2px;padding:5px;}
    .np-link{font:inherit;font-size:14px;font-weight:700;border:0;background:none;color:var(--mut);padding:9px 18px;border-radius:980px;cursor:pointer;transition:.16s cubic-bezier(.2,.85,.2,1);white-space:nowrap;}
    .np-link:hover{color:var(--navy);background:rgba(255,255,255,.85);}  /* hover treatment == landing .tb-link */
    .np-link.on{background:rgba(255,255,255,.92);color:var(--navy);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 8px -2px rgba(0,0,0,.16);}
    .np-srchbtn{flex:none;width:36px;height:36px;margin-left:2px;border-radius:980px;border:0;background:var(--mat-reg);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);color:var(--navy);display:grid;place-items:center;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.58),inset 0 1px 0 rgba(255,255,255,.68),0 1px 2px rgba(0,0,0,.07);transition:.15s;}
    .np-srchbtn:hover{background:rgba(255,255,255,.85);}
    /* Mobile: nav links collapse into a hamburger that opens a flat menu */
    .np-menubtn{display:none;flex:none;width:36px;height:36px;border-radius:980px;border:0;background:none;color:var(--navy);place-items:center;cursor:pointer;transition:.15s;padding:0;}
    .np-menubtn:hover{background:rgba(255,255,255,.5);}
    .np-menu{position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);min-width:220px;background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:16px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:6px;z-index:80;animation:fade .15s both;}
    .np-mrow{display:flex;align-items:center;gap:11px;width:100%;border:0;background:none;font:inherit;font-size:14px;font-weight:700;color:var(--navy);padding:11px 14px;border-radius:12px;cursor:pointer;transition:.12s;text-align:left;letter-spacing:-.01em;}
    .np-mrow svg{flex:none;color:var(--navy2);}
    .np-mrow:hover{background:rgba(255,255,255,.55);}
    .np-mrow.on{background:rgba(255,255,255,.92);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 2px 8px -2px rgba(0,0,0,.16);}
    .mp-bar{display:flex;align-items:center;gap:8px;padding:6px 7px;}
    .mp-search{flex:1;min-width:0;display:flex;align-items:center;gap:7px;background:rgba(255,255,255,.45);border-radius:980px;padding:8px 13px;box-shadow:inset 0 1px 0 rgba(255,255,255,.55);}
    .mp-star{color:var(--accent);flex:none;}
    .mp-search input{flex:1;min-width:0;border:0;background:none;outline:0;font:inherit;font-size:13.5px;color:var(--ink);-webkit-appearance:none;appearance:none;border-radius:inherit;}
    .mp-search input::placeholder{color:var(--mut);}
    .mp-clear{flex:none;border:0;background:none;cursor:pointer;color:var(--mut);display:flex;padding:0;}
    .mp-drop{position:absolute;top:calc(100% + 8px);left:0;right:0;background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:16px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:6px;max-height:340px;overflow:auto;z-index:5;}
    .tb-right{flex:none;}
    /* Dev tools strip — replaces the retired hamburger's dev links */
    .devstrip{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:59;display:flex;gap:6px;}
    .devstrip button{display:inline-flex;align-items:center;gap:5px;background:rgba(124,58,237,.16);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);color:#7c3aed;border:0;border-radius:980px;font-weight:700;font-size:11px;padding:5px 11px;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.4);}
    .devstrip button:hover{background:rgba(124,58,237,.26);}
    /* Breadcrumb — quiet "you are here" text above entity pages */
    .crumbs{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:13px;font-weight:600;color:var(--mut);padding:14px 2px 0;}
    .crumbs .c-link{font:inherit;font-weight:600;border:0;background:none;padding:0;color:var(--mut);cursor:pointer;transition:color .15s;}
    .crumbs .c-link:hover{color:var(--accent);}
    .crumbs .c-sep{opacity:.55;flex:none;}
    .crumbs .c-cur{color:var(--navy);font-weight:700;}
    .crumbs .c-root{color:var(--mut);}
    .tb-profile{width:44px;height:44px;border-radius:980px;border:0;background:rgba(255,255,255,.60);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);color:var(--navy);display:grid;place-items:center;cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 1px 0 rgba(255,255,255,.72),0 8px 24px -12px rgba(0,0,0,.28);transition:.18s;}
    .tb-profile:hover{background:rgba(255,255,255,.74);transform:translateY(-1px);}
    .tb-acct{position:absolute;right:0;top:calc(100% + 8px);background:var(--mat-thick);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-radius:14px;box-shadow:0 18px 44px -16px rgba(0,0,0,.32),inset 0 1px 0 rgba(255,255,255,.6);padding:8px;min-width:248px;max-width:300px;z-index:80;}
    .tb-acct .acct-head{display:flex;align-items:center;gap:10px;padding:6px 8px 10px;border-bottom:1px solid var(--line);margin-bottom:6px;}
    .tb-acct .acct-av{width:38px;height:38px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:800;font-size:15px;flex:none;}
    .tb-acct .acct-item{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:0;background:none;padding:9px 10px;font:inherit;font-size:13px;font-weight:600;color:var(--ink);border-radius:9px;cursor:pointer;transition:background .12s;}
    .tb-acct .acct-item:hover{background:rgba(10,132,255,.07);}
    .tb-acct .acct-item.danger{color:#c0392b;}
    .tb-acct .acct-item.danger:hover{background:rgba(200,50,50,.08);}
    @media(max-width:640px){.np-link{font-size:12.5px;padding:8px 10px;}.np-srchbtn{width:32px;height:32px;}}
    @media(max-width:560px){.tb-sport{display:none;}.menupill{max-width:none;}.tb-divider{display:none;}.np-bar .np-item{display:none;}.np-menubtn{display:grid;}}
    .classes-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;}
    .class-card{background:var(--mat-reg);backdrop-filter:blur(36px) saturate(195%);-webkit-backdrop-filter:blur(36px) saturate(195%);border:0;border-radius:16px;padding:24px;cursor:pointer;transition:.18s;animation:rise .5s both;box-shadow:inset 0 1px 0 rgba(255,255,255,.65),inset 0 0 0 .5px rgba(255,255,255,.35),0 1px 2px rgba(0,0,0,.05);}
    .class-card:hover{transform:translateY(-5px) scale(1.012);box-shadow:inset 0 1.5px 0 rgba(255,255,255,.9),inset 0 0 0 .5px rgba(255,255,255,.55),0 24px 48px -20px rgba(0,0,0,.34);}
    .class-tag{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--accent);background:rgba(10,132,255,.12);padding:4px 11px;border-radius:7px;display:inline-block;margin-bottom:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}
    .class-name{font-family:'Barlow',sans-serif;font-weight:700;font-size:19px;margin:0 0 14px;line-height:1.25;color:var(--ink);}
    .class-stats{display:flex;gap:20px;font-size:12px;color:var(--mut);margin-bottom:18px;}
    .class-stats b{display:block;font-family:'Barlow',sans-serif;font-size:20px;color:var(--ink);font-weight:700;}
    /* Draft banner */
    .draft-banner{background:rgba(255,149,0,.12);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;border-radius:16px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 0 .5px rgba(232,146,26,.3);}
    .draft-banner p{margin:0;font-size:14px;color:#7a4a0a;flex:1;}
    .draft-banner strong{display:block;font-family:'Barlow',sans-serif;font-size:15px;margin-bottom:2px;}
    /* Fleet picker */
    .fleet-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin:16px 0;}
    .fleet-card{background:var(--mat-reg);backdrop-filter:blur(30px) saturate(195%);-webkit-backdrop-filter:blur(30px) saturate(195%);border:0;border-radius:16px;padding:16px;cursor:pointer;transition:.16s;text-align:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 .5px rgba(255,255,255,.3),0 1px 2px rgba(0,0,0,.05);}
    .fleet-card:hover{transform:translateY(-2px);box-shadow:inset 0 1px 0 rgba(255,255,255,.75),0 0 0 1.5px var(--halo),0 10px 26px -14px rgba(0,0,0,.22);}
    .fleet-card .fname{font-family:'Barlow',sans-serif;font-weight:700;font-size:16px;color:var(--navy);margin-bottom:4px;}
    .fleet-card .fcount{font-size:13px;color:var(--mut);}
    /* Preview modal */
    .preview-meta{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;}
    /* One-row import header: name · host country · date · discards stepper · class dropdown */
    .preview-meta.wide{grid-template-columns:1.7fr 1.2fr 1.1fr auto minmax(118px,.9fr);align-items:end;}
    @media(max-width:860px){.preview-meta.wide{grid-template-columns:1fr 1fr;}}
    .preview-meta label{font-size:11px;color:var(--mut);display:block;margin-bottom:3px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;}
    /* Liquid-glass bar — the ONE material every preview control shares (inputs,
       country picker, class nugget, organizer chips) so shapes/colours line up. */
    .preview-meta input,.glassbar{width:100%;border:0;border-radius:12px;padding:0 12px;height:35px;box-sizing:border-box;font:inherit;font-size:13px;outline:none;transition:box-shadow .15s;
      background:rgba(255,255,255,.55);backdrop-filter:blur(24px) saturate(190%);-webkit-backdrop-filter:blur(24px) saturate(190%);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.5),0 1px 3px rgba(0,0,0,.05);}
    .preview-meta input:focus{box-shadow:inset 0 1px 0 rgba(255,255,255,.7),0 0 0 4px var(--halo);}
    .preview-meta input.pmissing{box-shadow:inset 0 0 0 1.5px #e8921a,0 1px 3px rgba(0,0,0,.05);background:rgba(255,149,0,.08);}
    .pmissing-hint{font-size:11px;color:#e8921a;margin-bottom:10px;display:flex;align-items:center;gap:5px;}
    .preview-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px;max-height:52vh;}
    .pe-input{width:100%;border:0;border-bottom:1.5px solid var(--accent);background:#fffbec;font:inherit;font-size:12px;text-align:center;padding:3px 2px;outline:none;}
    /* Modal */
    .notice{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:60;background:var(--mat-dark);backdrop-filter:blur(44px) saturate(195%);-webkit-backdrop-filter:blur(44px) saturate(195%);color:#fff;border-radius:980px;padding:14px 22px;display:flex;gap:13px;align-items:center;box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 20px 50px -18px rgba(0,0,0,.6);animation:rise .4s both;max-width:92%;}
    .notice b{font-family:'Barlow',sans-serif;}
    .notice .ico{background:var(--accent);color:#fff;width:34px;height:34px;border-radius:9px;display:grid;place-items:center;flex:none;}
    .back{display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13.5px;color:var(--navy2);background:var(--mat-reg);backdrop-filter:blur(20px) saturate(190%);-webkit-backdrop-filter:blur(20px) saturate(190%);border:0;cursor:pointer;margin-bottom:10px;padding:7px 14px;border-radius:980px;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.6),inset 0 1px 0 rgba(255,255,255,.7),0 1px 2px rgba(0,0,0,.08);transition:.15s;}
    .back:hover{background:rgba(255,255,255,.85);}
    .back:hover{color:var(--accent);}
    /* portal-pill shares the exact .btn.ghost glass material (same blur, shine
       and hairline edge) so nav pills and buttons read as one family. */
    .portal-pill{display:inline-flex;align-items:center;gap:7px;justify-content:flex-start;min-width:140px;background:var(--mat-reg);backdrop-filter:blur(28px) saturate(195%);-webkit-backdrop-filter:blur(28px) saturate(195%);border:0;border-radius:980px;padding:9px 18px;font-size:13.5px;font-weight:700;color:var(--navy);cursor:pointer;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.62),inset 0 1px 0 rgba(255,255,255,.72),0 4px 14px -6px rgba(0,0,0,.14);transition:.22s cubic-bezier(.2,.85,.2,1);}
    .portal-pill:hover{background:rgba(255,255,255,.85);transform:translateY(-2px) scale(1.05);box-shadow:inset 0 0 0 .5px rgba(255,255,255,.7),inset 0 1.5px 0 rgba(255,255,255,.9),0 12px 28px -10px rgba(0,0,0,.22);}
    .foot{font-size:12px;color:var(--mut);text-align:center;padding:30px 0;}
    .ov{position:fixed;inset:0;background:rgba(0,0,0,.3);backdrop-filter:blur(4px) saturate(140%);-webkit-backdrop-filter:blur(4px) saturate(140%);z-index:70;display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto;animation:fade .2s both;}
    .modal{background:rgba(252,253,255,0.88);backdrop-filter:blur(56px) saturate(210%);-webkit-backdrop-filter:blur(56px) saturate(210%);width:100%;max-width:900px;border-radius:22px;overflow:hidden;box-shadow:inset 0 1.5px 0 rgba(255,255,255,.8),inset 0 0 0 .5px rgba(255,255,255,.5),0 40px 90px -28px rgba(0,0,0,.45),0 0 0 .5px rgba(60,60,67,.08);animation:rise .3s both;}
    .modal.wide{max-width:1140px;}
    .mhead{background:linear-gradient(135deg,rgba(31,78,128,.78),rgba(19,49,78,.84));backdrop-filter:blur(44px) saturate(195%);-webkit-backdrop-filter:blur(44px) saturate(195%);color:#fff;padding:18px 22px;display:flex;align-items:center;gap:10px;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);border-radius:22px 22px 0 0;}
    .mhead h3{font-family:'Barlow',sans-serif;font-weight:700;font-size:19px;margin:0;flex:1;}
    .x{background:rgba(255,255,255,.16);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);border:0;color:#fff;width:32px;height:32px;border-radius:980px;cursor:pointer;display:grid;place-items:center;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.3),inset 0 1px 0 rgba(255,255,255,.25);transition:.15s;flex:none;padding:0;}
    .x:hover{background:rgba(255,255,255,.26);}
    .mhead .x{background:rgba(255,255,255,.14);border:0;color:#fff;width:34px;height:34px;border-radius:980px;cursor:pointer;display:grid;place-items:center;transition:.15s;}
    .mhead .x:hover{background:rgba(255,255,255,.26);transform:scale(1.05);}
    .mhead .mktab{font-family:'Barlow',sans-serif;font-weight:700;font-size:14.5px;border:0;color:rgba(255,255,255,.68);background:rgba(255,255,255,.1);padding:8px 16px;border-radius:980px;cursor:pointer;display:inline-flex;align-items:center;gap:7px;transition:.15s;white-space:nowrap;}
    .mhead .mktab:hover{background:rgba(255,255,255,.2);color:#fff;}
    .mhead .mktab.on{background:rgba(255,255,255,.92);color:var(--navy);box-shadow:0 2px 10px rgba(0,0,0,.18);}
    /* Liquid-glass segmented tabs (was flat white tab shapes). */
    .mtabs{display:flex;gap:8px;padding:16px 22px 0;}
    .mtabs button{font-family:'Barlow',sans-serif;font-weight:600;font-size:14px;border:0;color:var(--mut);padding:8px 16px;border-radius:980px;cursor:pointer;display:flex;align-items:center;gap:7px;
      background:rgba(255,255,255,.3);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);
      box-shadow:inset 0 0 0 .5px rgba(255,255,255,.4);transition:.15s;}
    .mtabs button:hover{background:rgba(255,255,255,.5);}
    .mtabs button.on{color:var(--navy);background:rgba(255,255,255,.85);
      box-shadow:inset 0 1px 0 rgba(255,255,255,.85),inset 0 0 0 .5px rgba(255,255,255,.6),0 2px 10px -2px rgba(8,30,60,.18);}
    .mbody{padding:22px 28px 28px;max-height:88vh;overflow-y:auto;}
    .prev.ok{background:#d8f0e3;color:#0a6b41;border-radius:10px;padding:12px 14px;font-size:13px;margin-top:12px;}
    .prev.err{background:#fbe7e4;color:#a8362a;border-radius:10px;padding:12px 14px;font-size:13px;margin-top:12px;}
    .mfoot{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;}
    /* Floating save/publish bar — pinned to the bottom of the modal's scroll
       container (.mbody) so it stays visible while the preview scrolls. Liquid-glass
       material consistent with .draft-banner. */
    .import-actionbar{position:sticky;bottom:14px;z-index:40;display:flex;gap:10px;justify-content:flex-end;align-items:center;
      margin:12px 0 0;padding:0;pointer-events:none;}
    .import-actionbar>*{pointer-events:auto;}
    .import-actionbar .btn{box-shadow:0 10px 26px -10px rgba(8,30,60,.45);}
    .import-actionbar .btn.ghost{background:rgba(252,253,255,.88);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);}
    /* Reclaim space beneath the sticky bar so the last table rows aren't hidden. */
    .mbody.has-actionbar{padding-bottom:0;}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}
    .meta-grid.three{grid-template-columns:1fr 1fr 1fr;}
    .meta-grid label{font-size:12px;color:var(--mut);display:block;margin-bottom:3px;font-weight:600;}
    .meta-grid input{width:100%;border:0;border-radius:12px;padding:9px 12px;font:inherit;font-size:13px;color:var(--ink);background:var(--grouped);outline:none;transition:box-shadow .15s;}
    .meta-grid input:focus{box-shadow:0 0 0 4px var(--halo);}
    .race-ctrl{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
    .race-ctrl span{font-size:13px;color:var(--mut);font-weight:600;}
    .stepper{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:700;color:var(--ink);}
    .stepper button{width:30px;height:30px;border:0;border-radius:980px;background:var(--grouped);cursor:pointer;display:grid;place-items:center;color:var(--accent);transition:.15s;}
    .stepper button:hover{background:rgba(10,132,255,.16);transform:scale(1.06);}
    .rtable-wrap{overflow:auto;border:1px solid var(--line);border-radius:10px;margin-bottom:10px;}
    .rtable{width:100%;border-collapse:collapse;font-size:12.5px;}
    .rtable thead th{background:linear-gradient(180deg,rgba(31,78,128,.92),rgba(19,49,78,.94));color:#fff;font-family:'Barlow',sans-serif;font-weight:600;padding:8px 4px;text-align:center;font-size:11px;white-space:nowrap;box-shadow:inset 0 1px 0 rgba(255,255,255,.12);}
    .rtable thead th.l{text-align:left;padding-left:8px;}
    .rtable thead th.calc{background:linear-gradient(180deg,rgba(46,120,200,.9),rgba(31,78,128,.92));}
    .rtable tbody td{border-bottom:1px solid var(--line);padding:0;}
    .rtable tbody tr:last-child td{border-bottom:0;}
    .rtable tbody td input{width:100%;border:0;outline:none;font:inherit;font-size:12.5px;padding:7px 5px;background:transparent;color:var(--ink);}
    .rtable tbody td input:focus{background:#eef4fb;}
    .rtable tbody td.del-td{width:28px;text-align:center;border-left:1px solid var(--line);}
    .rtable tbody td.calc-td{background:#f0f5fb;text-align:center;padding:0 6px;font-variant-numeric:tabular-nums;}
    @keyframes rise{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
    @keyframes fade{from{opacity:0;}to{opacity:1;}}
    .scorecell{display:inline-flex;flex-direction:column;align-items:center;gap:1px;line-height:1.15;}
    .scorecell .snum{font-variant-numeric:tabular-nums;}
    .scorecell .scode{font-size:8px;font-weight:800;color:#e74c3c;letter-spacing:.04em;text-transform:uppercase;}

    .spin{animation:spin 1s linear infinite;}@keyframes spin{to{transform:rotate(360deg);}}
    /* Host auto-grab: subtle "Looking you up…" text shimmer (no spinner). */
    .hostResearchShimmer{animation:hostResearchShimmer 1.3s ease-in-out infinite;}
    @keyframes hostResearchShimmer{0%,100%{opacity:.5;}50%{opacity:1;}}
    /* Calendar — Apple Calendar style */
    .cal-modal{background:rgba(252,253,255,0.88);backdrop-filter:blur(56px) saturate(210%);-webkit-backdrop-filter:blur(56px) saturate(210%);width:100%;max-width:1020px;border-radius:22px;overflow:hidden;box-shadow:inset 0 1.5px 0 rgba(255,255,255,.8),inset 0 0 0 .5px rgba(255,255,255,.5),0 40px 90px -28px rgba(0,0,0,.45),0 0 0 .5px rgba(60,60,67,.08);animation:rise .3s both;max-height:92vh;display:flex;flex-direction:column;}
    .cal-head{background:linear-gradient(135deg,rgba(31,78,128,.78),rgba(19,49,78,.84));backdrop-filter:blur(44px) saturate(195%);-webkit-backdrop-filter:blur(44px) saturate(195%);color:#fff;padding:14px 20px;display:flex;align-items:flex-start;gap:10px;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.16);}
    .cal-head h3{font-family:'Barlow',sans-serif;font-weight:800;font-size:22px;margin:0;}
    .cal-head .x{background:rgba(255,255,255,.12);border:0;color:#fff;width:34px;height:34px;border-radius:50%;cursor:pointer;display:grid;place-items:center;opacity:.85;transition:.12s;flex:none;}
    .cal-head .x:hover{opacity:1;background:rgba(255,255,255,.22);}
    .cal-back{display:inline-flex;align-items:center;gap:6px;background:rgba(255,255,255,.16);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);border:0;color:#dbe9f8;font-weight:600;font-size:13px;cursor:pointer;padding:7px 13px;border-radius:980px;box-shadow:inset 0 0 0 .5px rgba(255,255,255,.28),inset 0 1px 0 rgba(255,255,255,.22);transition:.15s;}
    .cal-back:hover{color:#fff;}
    .cal-body{padding:0;overflow-y:auto;flex:1;display:flex;flex-direction:column;}
    .cal-toolbar{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.4);flex:none;flex-wrap:wrap;background:rgba(255,255,255,.28);}
    .cal-nav{display:flex;align-items:center;gap:4px;}
    .cal-nav button{border:1px solid var(--line);background:#fff;border-radius:7px;width:30px;height:30px;cursor:pointer;display:grid;place-items:center;color:var(--navy);transition:.1s;}
    .cal-nav button:hover{background:var(--sky);}
    .cal-month-title{font-family:'Barlow',sans-serif;font-weight:700;font-size:18px;color:var(--navy);min-width:160px;text-align:center;}
    .cal-today-btn{border:1px solid var(--line);background:#fff;border-radius:8px;padding:5px 13px;font:inherit;font-size:12px;font-weight:600;color:var(--navy);cursor:pointer;transition:.1s;}
    .cal-today-btn:hover{background:var(--sky);}
    .cal-grid-wrap{flex:1;overflow-y:auto;}
    .cal-month-scroll{flex:1;overflow-y:auto;}
    .cal-month-block{border-bottom:2px solid var(--line);}
    .cal-month-lbl{font-family:'Barlow',sans-serif;font-weight:800;font-size:15px;color:var(--navy);padding:8px 12px 6px;position:sticky;top:0;background:var(--paper);z-index:2;border-bottom:1px solid var(--line);}
    .cal-scroll{flex:1;overflow-y:auto;scroll-behavior:smooth;}
    .cal-month-block{border-bottom:8px solid var(--paper);}
    .cal-month-sticky{position:sticky;top:0;z-index:5;background:var(--paper);font-family:'Barlow',sans-serif;font-weight:800;font-size:16px;color:var(--navy);padding:10px 16px 8px;border-bottom:1px solid var(--line);}
    .cal-grid{display:grid;grid-template-columns:repeat(7,1fr);border-left:1px solid var(--line);}
    .cal-dow{background:var(--navy);color:#bcd2e8;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-align:center;padding:8px 4px;border-right:1px solid rgba(255,255,255,.1);}
    .cal-cell{border-right:1px solid var(--line);border-bottom:1px solid var(--line);min-height:100px;padding:6px;position:relative;background:#fff;transition:.1s;}
    .cal-cell.other-month{background:#f8fafc;}
    .cal-cell.today{background:#f0f7ff;}
    .cal-cell-num{font-family:'Barlow',sans-serif;font-weight:700;font-size:13px;color:var(--mut);margin-bottom:4px;width:24px;height:24px;display:grid;place-items:center;border-radius:50%;}
    .cal-cell-num.today-circle{background:var(--accent);color:#fff;}
    .cal-cell-ev{background:var(--accent);color:#fff;border-radius:8px;padding:2px 6px;font-size:10px;font-weight:700;cursor:pointer;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:.12s;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);}
    .cal-cell-ev:hover{filter:brightness(1.08);transform:translateY(-1px);}
    .cal-cell-ev.cls-29er{background:#E62A22;}
    .cal-cell-ev.cls-ilca{background:#2E78C8;}
    .cal-cell-ev.cls-49er{background:#5FAF4E;}
    .cal-cell-ev.cls-optimist{background:#3D3D3D;}
    .cal-filters{display:flex;gap:8px;align-items:center;flex:1;flex-wrap:wrap;}
    .cal-ev{background:var(--card);border:1px solid var(--line);border-radius:11px;padding:12px 16px;margin-bottom:8px;cursor:pointer;transition:.15s;display:flex;align-items:center;gap:14px;}
    .cal-ev:hover{border-color:#b9cee4;box-shadow:0 6px 20px -10px rgba(22,58,99,.4);transform:translateY(-1px);}
    .cal-ev-date{min-width:44px;text-align:center;background:var(--sky);border-radius:8px;padding:6px 4px;}
    .cal-ev-date .ced{font-family:'Barlow',sans-serif;font-weight:800;font-size:20px;color:var(--navy);line-height:1;}
    .cal-ev-date .cem{font-size:10px;font-weight:700;color:var(--mut);text-transform:uppercase;letter-spacing:.05em;}
    .cal-ev-name{font-family:'Barlow',sans-serif;font-weight:700;font-size:15px;color:var(--ink);}
    .cal-ev-meta{font-size:12px;color:var(--mut);margin-top:2px;}
    /* Global search */
    .gsrch-wrap{flex:1;position:relative;}
    .gsrch{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.12);border:1.5px solid rgba(255,255,255,.18);border-radius:10px;padding:7px 12px;transition:.2s;}
    .gsrch:focus-within{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.4);}
    .gsrch input{border:0;outline:0;font:inherit;font-size:13px;background:none;color:#fff;width:100%;}
    .gsrch input::placeholder{color:#9fbdd9;}
    .gsrch-drop{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 16px 40px -12px rgba(0,0,0,.28);z-index:50;overflow:hidden;animation:rise .15s both;}
    .gsrch-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:.12s;}
    .gsrch-item:hover{background:var(--sky);}
    .gsrch-item:not(:last-child){border-bottom:1px solid #f0f4f8;}
    .gsrch-item .gi-icon{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;flex:none;}
    .gsrch-item .gi-label{font-weight:600;font-size:13px;color:var(--ink);}
    .gsrch-item .gi-sub{font-size:11px;color:var(--mut);}
    /* Suggestions dropdown */
    .sug-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 12px 30px -10px rgba(0,0,0,.18);z-index:40;overflow:hidden;animation:rise .12s both;}
    .sug-item{padding:9px 14px;cursor:pointer;font-size:13px;color:var(--ink);display:flex;align-items:center;gap:8px;transition:.1s;}
    .sug-item:hover{background:var(--sky);}
    .sug-item:not(:last-child){border-bottom:1px solid #f5f7fa;}
    .ai-srch-wrap{position:relative;flex:1;}
    /* Delete confirm */
    .del-confirm{position:fixed;z-index:80;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;box-shadow:0 12px 32px -10px rgba(0,0,0,.3);min-width:220px;animation:rise .15s both;}
    .del-confirm p{margin:0 0 10px;font-size:13px;color:var(--ink);font-weight:600;}
    .del-confirm .del-name{color:var(--navy);font-family:'Barlow',sans-serif;}
    .del-confirm-btns{display:flex;gap:8px;}
    /* AI search */
    .ai-srch{display:flex;align-items:center;gap:8px;background:var(--mat-reg);backdrop-filter:blur(34px) saturate(195%);-webkit-backdrop-filter:blur(34px) saturate(195%);border:0;border-radius:12px;overflow:hidden;padding-left:12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.6),inset 0 0 0 .5px rgba(255,255,255,.35);transition:.2s;}
    .ai-srch:focus-within{box-shadow:inset 0 1px 0 rgba(255,255,255,.65),0 0 0 4px var(--halo);}
    .ai-srch input{flex:1;border:0;outline:0;font:inherit;font-size:13px;padding:9px 10px 9px 0;background:none;color:var(--ink);}
    .ai-srch input::placeholder{color:#9fb2c8;}
    .filter-chip{display:inline-flex;align-items:center;gap:6px;background:#eef4fb;border:1px solid #b9cee4;border-radius:20px;padding:4px 10px 4px 12px;font-size:12px;font-weight:600;color:var(--navy);}
    .filter-chip button{border:0;background:none;cursor:pointer;color:var(--mut);padding:0;display:flex;align-items:center;line-height:1;}
    .filter-chip button:hover{color:#c0392b;}
    /* ── Apple WWDC25 liquid-glass effect (lucasromerodb/liquid-glass-effect-macos), adapted for dark navy ── */
    .liquidGlass-wrapper{position:relative;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;cursor:pointer;border:none;box-shadow:0 6px 6px rgba(0,0,0,0.25),0 0 20px rgba(0,0,0,0.12);transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s,filter .18s;}
    .liquidGlass-effect{position:absolute;z-index:0;inset:0;backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);filter:url(#glass-distortion);overflow:hidden;isolation:isolate;border-radius:inherit;}
    .liquidGlass-tint{z-index:1;position:absolute;inset:0;background:rgba(255,255,255,0.10);border-radius:inherit;}
    .liquidGlass-shine{position:absolute;inset:0;z-index:2;overflow:hidden;border-radius:inherit;box-shadow:inset 2px 2px 1px 0 rgba(255,255,255,0.45),inset -1px -1px 1px 1px rgba(255,255,255,0.3);}
    .liquidGlass-text{position:relative;z-index:3;color:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;}
    .liquidGlass-wrapper:hover{transform:scale(1.02) translateY(-1px);}
    .liquidGlass-wrapper:active{transform:scale(0.98);}
    .liquidGlass-wrapper:disabled{opacity:0.45;cursor:not-allowed;transform:none;}
    /* ── Sport explainer (spm-): per-class equipment hologram + course diagram ── */
    /* bottom margin reserves room for the absolutely-positioned .spm-info overlay
       (up to a few wrapped lines of hover text) so it never overlaps the next
       section ("Recent competitions" on the sailing home page). */
    .spm-sec{margin:26px 0 92px}
    /* home: tighter reserve below the models — the hover text hangs lower (see
       .spm-duo--home .spm-info) but sits closer to the "Results…" line beneath. */
    .spm-sec--home{margin-bottom:60px}
    /* class/competitions/portal/results pages: title/search/filters take 50%, the two
       models take 50% on the same row. align-items:end bottom-aligns the models to the
       header's last line — the reserved margin-bottom below the WHOLE GRID (not inside
       either grid item) is what keeps the hover info clear of the content beneath,
       without affecting that alignment or the row's height. */
    .spm-classgrid{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:stretch;margin-bottom:22px}
    .spm-classhead{min-width:0}
    /* the header column is the taller one; stretch makes .spm-duo match its height so
       the bottom-anchored .spm-info lands on the header's bottom baseline. Zero the
       trailing margin under the last header control so that baseline == filter/buttons. */
    .spm-classhead>*:last-child{margin-bottom:0!important}
    /* association/host portal header sits inside .strip (which adds its own 18px
       padding-bottom); trim the grid's own margin there so the content below the
       Athletes/Calendar buttons isn't pushed down twice. Global-class grid lives in
       .wrap.sec (no .strip) and keeps the 22px above. */
    .strip .spm-classgrid{margin-bottom:4px}
    /* The hover-info line is bottom-anchored and grows UPWARD. On the global-class page the
       header and the models are nearly the same height, so there's no clearance and the long
       3-line "How a race works" course blurb climbs up into the diagram. Reserve a fixed zone
       below the models (>= the 3-line text height) so the text sits under them, never over
       them. Self-scoping: this only makes the models column taller than the header on the
       global-class page; the association header is already taller, so its layout is unchanged. */
    .spm-classgrid .spm-duo{padding-bottom:62px}
    /* stacked (single column): no cross-column alignment to preserve, so let the info flow
       IN-FLOW below the models — it self-sizes to any wrap count (long text wraps to 4-5
       lines on a phone) and can never overlap the models or the results. */
    @media(max-width:1150px){.spm-classgrid{grid-template-columns:1fr}.spm-classgrid .spm-duo{padding-bottom:0}.spm-classgrid .spm-info{position:static;margin-top:10px}}
    /* ── Host portal header WITH an interactive model (spm-classgrid--host) ──
       Unlike the global-class / competitions grids above, this one must NEVER stack:
       the model belongs on the same row as the title at every width. Re-assert the
       two-column track (higher specificity than the stack rule above) and let BOTH
       columns shrink — the SVG models are width:100% so they scale down fluidly.
       Placed AFTER the max-width:1150px media block so it wins by source order. */
    .strip .spm-classgrid--host{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(10px,1.6vw,16px)}
    .spm-classgrid--host .spm-duo{padding-bottom:62px}                 /* keep overlay clearance (2-col, not stacked) */
    .spm-classgrid--host .spm-info{position:absolute;margin-top:0}
    /* ── Fluid header sizing — EVERY host portal header, model or not ──
       The whole header (title, globe, logo, stat pills, action pills) lives in .strip,
       so scope the clamp()s there. As the viewport narrows everything scales down
       together instead of wrapping or overflowing. */
    .strip .page-title{font-size:clamp(15px,2.3vw,28px)}
    .strip .pillbar{gap:clamp(9px,1.4vw,20px)}
    .strip .pill{font-size:clamp(11.5px,1.15vw,15px)}
    .strip .portal-pill{min-width:0;font-size:clamp(11px,1.05vw,13.5px);padding:9px clamp(11px,1.3vw,18px)}
    /* Header globe + logo: fluid heights so they shrink with the header. SailingGlobe
       fill=true reads .hdr-globe's height; the square aspect keeps the projection round.
       .hdr-logo drives the logo height in CSS (width follows via its aspect-ratio). */
    .hdr-globe{width:clamp(88px,12vw,150px);aspect-ratio:1}
    .hdr-logo{height:clamp(45px,6.9vw,84px)}
    .spm-duo{position:relative;min-width:0}
    .spm-duorow{display:flex;gap:0;justify-content:center;align-items:flex-start}
    /* pull the two boats together — their outer whitespace overlaps, closing the empty gap */
    .spm-duorow .spm-holo{flex:1 1 0;min-width:0;max-width:480px}
    .spm-duorow .spm-holo:first-child{margin-right:-6%}
    .spm-duorow .spm-holo:last-child{margin-left:-6%}
    /* Home showcase models shrink fluidly with the viewport — same effect as the host-page
       models, but 30% larger overall (the host's ~0.25vw rate scaled ×1.3 → ~0.325vw per holo,
       capped at 437px, floored at 143px so they stay legible). Replaces the old fixed 336px,
       which held full size until a hard mobile breakpoint. */
    .spm-duorow--home .spm-holo{max-width:clamp(143px,32.5vw,437px)}
    .spm-holo{position:relative} /* frameless — the models sit directly on the page */
    /* absolutely placed OVERLAY below the row — out of flow, so it never shifts the
       models or (on the grid pages) the header; callers reserve real space for it via
       margin-bottom on their own container (.spm-classgrid above, .spm-sec below). */
    .spm-info{position:absolute;bottom:0;left:0;right:0;font-size:12.5px;line-height:1.45;color:var(--mut);text-align:left}
    /* home isn't a grid, so there's no header to bottom-align to — hang the hover
       text below the models with a comfortable gap, then keep it close to "Results…". */
    .spm-duo--home .spm-info{top:100%;bottom:auto;margin-top:22px}
    .spm-info b{color:var(--ink);font-weight:700}
    .spm-info-hint{opacity:.75}
    .spm-halo{transform-box:fill-box;transform-origin:center;animation:spmPulse 2.4s ease-out infinite}
    @keyframes spmPulse{0%{transform:scale(.55);opacity:.75}70%{transform:scale(1.9);opacity:0}100%{transform:scale(1.9);opacity:0}}
    @media (prefers-reduced-motion:reduce){.spm-halo{animation:none;opacity:.35}}
    /* ── Home class rotation (spm-rot): crossfading model carousel + label + class pips ── */
    .spm-rotator{position:relative}
    .spm-rotstage{transition:opacity .3s ease}
    .spm-rotbar{display:flex;align-items:center;justify-content:center;gap:12px;margin:0 0 6px;position:relative;z-index:2}
    .spm-rotlabel{font-size:12.5px;font-weight:700;letter-spacing:.04em;color:var(--ink);min-width:52px;text-align:right}
    .spm-rotpips{display:inline-flex;align-items:center;gap:8px}
    .spm-rotpip{width:9px;height:9px;padding:0;border-radius:50%;border:1.5px solid rgba(31,78,128,.4);background:rgba(31,78,128,.18);cursor:pointer;transition:transform .2s ease,background .2s ease,border-color .2s ease}
    .spm-rotpip:hover{transform:scale(1.25)}
    .spm-rotpip.on{transform:scale(1.15)}
    @media (prefers-reduced-motion:reduce){.spm-rotstage,.spm-rotpip{transition:none}}
    @media(max-width:700px){.spm-rotbar{margin:0 0 2px}}

    /* ══════════ MOBILE OPTIMIZATION (≤700px unless noted) ══════════
       Additive layer only — desktop (≥701px) must render pixel-identical.
       Later-in-cascade rules win; !important appears ONLY where an inline
       style={{...}} in the JSX would otherwise beat the mobile override. */

    /* ── Touch affordances (any coarse-pointer device, any width) ── */
    .spm-hint-touch{display:none;}
    @media (pointer:coarse){
      .al-root button,.al-root select,.al-root input,.al-root .acard,.al-root .strip-card,
      .al-root .class-card,.al-root .ev,.al-root .histrow,.al-root .namelink,
      .al-root .strip-chip,.al-root .lens-chip{-webkit-tap-highlight-color:transparent;touch-action:manipulation;}
      .globe-wrap .expand-tip{display:none;}
      .row-ai-tooltip{display:none;}          /* hover-driven scout tooltip has no tap path */
      .spm-hint-mouse{display:none;}
      .spm-hint-touch{display:inline;}
    }
    @media (pointer:coarse) and (prefers-reduced-motion:no-preference){
      .acard:active,.strip-card:active,.class-card:active,.ev:active,.histrow:active,
      .strip-chip:active,.lens-chip:active,.cal-cls-mini:active,.filter-chip:active{transform:scale(.98);transition:transform .08s;}
    }

    /* ── duplicate-review card: swift exit on Merge/Don't merge instead of an abrupt jump ── */
    .dup-card{max-height:2000px;opacity:1;transform:scale(1) translateY(0);overflow:hidden;
      transition:opacity .22s ease,transform .22s ease,max-height .26s ease .1s,margin-bottom .26s ease .1s,padding .26s ease .1s;}
    .dup-card-exit{opacity:0;transform:scale(.97) translateY(-4px);max-height:0;margin-bottom:0;padding-top:0;padding-bottom:0;}
    .dup-flip{border-radius:8px;transition:background .15s,transform .12s;}
    .dup-flip:hover{background:var(--sky);}
    .dup-flip:active{transform:scale(.92);}

    @media (max-width:700px){
      /* ── §1 safe areas ── */
      .al-root{padding-bottom:env(safe-area-inset-bottom);}
      .foot{padding:24px 0 calc(24px + env(safe-area-inset-bottom));}
      .notice{bottom:calc(16px + env(safe-area-inset-bottom));max-width:calc(100% - 24px);}

      /* ── §2 global scale ── */
      .wrap{padding:0 14px;}
      .topin{padding:10px 14px;}
      .sec{padding:18px 0 44px;}
      .strip{padding:12px 0;}
      .page-head{margin-bottom:14px;}
      .page-title,.strip h1{font-size:clamp(21px,5.5vw,28px);}
      .home-hero h1{font-size:clamp(26px,8vw,36px);}
      .page-sub{font-size:13px;}
      .seclabel{margin:0 0 10px;}
      .cal-head-glass{padding:12px 14px;border-radius:18px;}
      .phead{padding:18px 16px;gap:14px;border-radius:18px;}
      .phead .av{width:88px!important;height:88px!important;font-size:30px!important;} /* profile photo is inline-sized to 111px */
      .pname,.pflag{font-size:clamp(20px,6vw,28px);}
      .pmeta{font-size:13px;gap:10px;}
      .pstats{gap:18px;margin-top:14px;}
      .pstats .v{font-size:19px;}
      .histrow{padding:12px 13px;gap:11px;margin-bottom:8px;}
      .hrk{width:40px;font-size:18px;}
      .mbody{padding:16px 16px 20px;}
      .import-actionbar{margin:12px 0 0;padding:0;bottom:10px;}
      .team-summary{padding:10px 12px;}
      .x{width:40px;height:40px;}
      .np-srchbtn,.np-menubtn{width:44px;height:44px;}
      .back{min-height:44px;}

      /* ── §3 athlete cards → compact rows (~8 per screen) ── */
      .agrid{grid-template-columns:1fr;gap:8px;}
      .acard{display:grid;grid-template-columns:40px minmax(0,1fr);column-gap:12px;row-gap:2px;align-items:center;padding:10px 12px;border-radius:14px;}
      .achead{display:contents;}
      .achead .av{width:40px;height:40px;font-size:13px;grid-row:1/span 2;}
      .achead>div{min-width:0;}
      .acn{font-size:16px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      .acstat{grid-column:2;border-top:0;padding-top:0;gap:5px;font-size:12.5px;flex-wrap:nowrap;min-width:0;overflow:hidden;}
      .acstat div{display:flex;align-items:baseline;gap:3px;white-space:nowrap;}
      .acstat b{display:inline;font-size:12.5px;}
      .acstat div+div::before{content:"·";margin-right:4px;color:var(--mut);}

      /* ── §10 country group headers ── */
      .cgroup-head{margin:2px 0 8px!important;gap:7px!important;}
      .cgroup-head span:first-child{font-size:15px!important;}
      .cgroup-head span:nth-child(2){font-size:13px!important;}

      /* ── §4 competition / featured cards → compact rows ── */
      .strip-cards{grid-template-columns:1fr;gap:8px;margin-bottom:22px;}
      .strip-card{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10px;row-gap:2px;align-items:center;padding:11px 13px;border-radius:14px;}
      .strip-card .sc-top{display:contents;}
      .strip-card .sc-top>*{grid-column:1;grid-row:2;justify-self:start;margin:0;}
      .strip-card .sc-top>.cls{grid-column:2;grid-row:1/span 3;justify-self:end;align-self:center;}
      .strip-card .sc-name{grid-column:1;grid-row:1;font-size:15.5px;line-height:1.25;margin:0;}
      .strip-card .sc-date{font-size:12.5px;}
      .strip-card .sc-sub{grid-column:1;grid-row:3;margin:0;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      /* event list rows (.ev) — drop the vertical year + redundant date/count lines */
      .ev{padding:12px 13px;gap:10px;margin-bottom:8px;}
      .evicon-year{display:none;}
      .evicon-date{width:44px;height:44px;}
      .evicon-date .eid{font-size:18px;}
      .evname{font-size:15.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
      .evmeta{font-size:12.5px;gap:9px;}
      .evmeta span.ev-cal,.evmeta span.ev-count{display:none;}

      /* ── §5 host / association cards → compact rows ── */
      .classes-grid{grid-template-columns:1fr;gap:8px;}
      .class-card{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:10px;row-gap:2px;align-items:center;padding:12px 13px;}
      .class-card>div:first-child{grid-column:2;grid-row:1/span 2;flex-direction:column;align-items:flex-end!important;justify-content:center;gap:5px!important;margin-bottom:0!important;max-width:40vw;}
      .class-card>div:first-child>*{flex:none!important;max-width:100%;min-width:0;}
      .class-card>div:first-child div{flex-wrap:wrap!important;row-gap:4px;justify-content:flex-end;}
      .class-card .cls{font-size:10.5px;padding:3px 8px;}
      .class-card .class-name{grid-column:1;grid-row:1;font-size:16px;margin:0;line-height:1.3;}
      .class-card .class-stats{grid-column:1;grid-row:2;gap:5px;font-size:12.5px;margin:0;}
      .class-card .class-stats div{display:flex;align-items:baseline;gap:3px;white-space:nowrap;}
      .class-card .class-stats b{display:inline;font-size:12.5px;}
      .class-card .class-stats div+div::before{content:"·";margin-right:4px;color:var(--mut);}
      .class-card>img{display:none;}

      /* ── §6 chip / control rows → one horizontally scrollable line each ── */
      .strip-chips,.pagetabs .wrap,.rank-src-row,.rank-sel-row,.rank-year-row,.rank-mode-row{
        display:flex;flex-wrap:nowrap!important;overflow-x:auto;-webkit-overflow-scrolling:touch;
        scrollbar-width:none;padding-bottom:2px;
        -webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 26px),transparent);
        mask-image:linear-gradient(90deg,#000 calc(100% - 26px),transparent);}
      .strip-chips::-webkit-scrollbar,.pagetabs .wrap::-webkit-scrollbar,.rank-src-row::-webkit-scrollbar,
      .rank-sel-row::-webkit-scrollbar,.rank-year-row::-webkit-scrollbar,.rank-mode-row::-webkit-scrollbar{display:none;}
      .strip-chips>*,.rank-src-row>*,.rank-sel-row>*,.rank-year-row>*,.rank-mode-row>*{flex:none;white-space:nowrap;}
      .strip-break{display:none;} /* Fix 9b's row-break: selects stay inline in the one-line scroll rail */
      .pagetabs button{flex:none;white-space:nowrap;min-height:44px;}
      .strip-chip,.lens-chip,.filter-chip,.cal-cls-mini,.nd-chip,.lens-select{min-height:44px;}
      .seg button{min-height:44px;}
      .rank-src-row button,.rank-year-row button,.rank-sel-row button,.rank-mode-row button{min-height:44px;}
      .rank-disc-btn{width:44px!important;height:44px!important;}
      .rank-src-row{margin-bottom:8px!important;}
      .rank-mode-row{gap:10px!important;margin-bottom:10px!important;align-items:center;}
      .rank-year-row{padding:4px 0!important;}

      /* ── §7 results & rankings tables — sticky rank + name columns ── */
      .panel{-webkit-overflow-scrolling:touch;}
      table{min-width:0;font-size:12px;}
      thead th{padding:8px 5px;font-size:11px;white-space:nowrap;}
      thead th.l{padding-left:10px;}
      tbody td{padding:6px 5px;}
      tbody td.l{padding-left:10px;}
      .rk{font-size:13px;}
      .panel table thead th>div{max-width:84px!important;}
      .panel table thead th:first-child{position:sticky;left:0;z-index:4;width:40px!important;min-width:40px!important;background:linear-gradient(180deg,rgb(31,78,128),rgb(19,49,78));}
      .panel table thead th:nth-child(2){position:sticky;left:40px;z-index:4;background:linear-gradient(180deg,rgb(31,78,128),rgb(19,49,78));box-shadow:2px 0 4px rgba(20,33,58,.18);}
      .panel table tbody td.rk{position:sticky;left:0;z-index:2;background:#fff;width:40px;min-width:40px;max-width:40px;}
      .panel table tbody td.rk+td{position:sticky;left:40px;z-index:2;background:#fff;box-shadow:2px 0 4px rgba(20,33,58,.08);}
      .panel table tbody td.rk+td .namelink{display:inline-block;max-width:31vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:bottom;}
      .boat{gap:8px;}
      .panel table .boat>*:first-child{display:none;} /* avatars: density over decoration in phone tables */
      .cn{font-size:11px;max-width:31vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
      /* import-preview table (admin) gets the same treatment, lighter */
      .rtable-wrap{-webkit-overflow-scrolling:touch;}
      .rtable thead th{padding:6px 3px;}
      .rtable thead th:first-child,.rtable tbody td:first-child{position:sticky;left:0;z-index:2;background:#fff;}
      .rtable thead th:first-child{z-index:3;background:linear-gradient(180deg,rgb(31,78,128),rgb(19,49,78));}

      /* ── §9 landing page ── */
      .home-hero{padding:4px 0 0;}
      .spm-sec{margin:18px 0 44px;}
      .spm-sec--home{margin:6px 0 30px;}
      .spm-duorow--home{justify-content:center;}
      /* Home models now shrink fluidly at every width (see the .spm-duorow--home .spm-holo
         clamp above) — matching the host-page shrink. Both the boat and the course diagram
         stay visible and scale down together, instead of the boat jumping to 82vw and the
         course diagram being hidden on phones. */
      .spm-duo--home .spm-info{position:static;margin-top:8px;text-align:center;min-height:36px;}
      .hero-srch{padding:12px 15px;margin:14px 0 6px;}
    }
  `}</style>

  {/* ── FLOATING TOP BAR (no frame; glass pills that hide on scroll-down) ── */}
  <div className={`topbar2${barHidden?" hidden":""}`}>
    {/* left: two targets on one pill — logo → AthLink landing (shell); "Sailing" → sailing home. */}
    <div className="tb-brand">
      <span className="tb-logo" title="Back to AthLink — all sports"
        onClick={()=>{window.history.pushState(null,"","/");window.dispatchEvent(new Event("locationchange"));}}><img src="/brand/icon-app-circle.png" alt="AthLink"/></span>
      <span className="tb-divider"/>
      <span className="tb-sport" title="Sailing home" onClick={goHome}>Sailing</span>
    </div>
    {/* center: 3-item primary nav — Athletes · Competitions · Rankings — with an
        expanding search in the utility slot. No hamburger on desktop by design. */}
    <div className="tb-center">
      <div className={`menupill${navSearchOpen?" searching":" navmode"}`} onClick={e=>e.stopPropagation()}>
        {navSearchOpen
          ? <div className="mp-bar">
              <div className="mp-search">
                <Sparkles size={14} className="mp-star"/>
                <input autoFocus placeholder="Search athletes, competitions & clubs…" value={gSearch}
                  onChange={e=>{setGSearch(e.target.value);setGSearchOpen(true);runGlobalSearch(e.target.value);}}
                  onFocus={()=>setGSearchOpen(true)}
                  onBlur={()=>setTimeout(()=>setGSearchOpen(false),150)}
                  onKeyDown={e=>{if(e.key==="Escape"){setGSearch("");setGSearchOpen(false);setNavSearchOpen(false);}if(e.key==="Enter"&&gSearchResults.length){execGSearch(gSearchResults[0]);}}}/>
                <button className="mp-clear" title="Close search" onClick={()=>{setGSearch("");setGSearchOpen(false);setGSearchResults([]);setNavSearchOpen(false);}}><X size={13}/></button>
              </div>
            </div>
          : <div className="np-bar">
              {/* Mobile: hamburger collapses the four links into a flat menu */}
              <button className="np-menubtn" title="Menu" aria-label="Menu" onClick={()=>setNavMenuOpen(o=>!o)}><Menu size={18}/></button>
              {/* Athletes — by class / by country / by host */}
              <div className="np-item">
                <button className={`np-link${navOn==="athletes"?" on":""}`} onClick={e=>{e.currentTarget.blur();goTop("athletes");}}>Athletes</button>
                <div className="np-drop">
                  <p className="nd-label">By class</p>
                  <div className="nd-chips">
                    {CLASSES.map(c=>(
                      <button key={c.id} className="nd-chip" onClick={()=>goTop("athletes",{cls:c.id})}>
                        <span className="dot" style={{background:classColor(c.id)}}/>{c.short}
                      </button>
                    ))}
                  </div>
                  <button className="nd-row" onClick={()=>goTop("athletes")}><Globe size={14} style={{flex:"none",color:"var(--navy2)"}}/>By country</button>
                  <div className="nd-subwrap">
                    <button className="nd-row" onClick={()=>goTop("hosts")}><Waves size={14} style={{flex:"none",color:"var(--navy2)"}}/>By host<ChevronRight size={13} style={{marginLeft:"auto",opacity:.6}}/></button>
                    <div className="nd-sub">
                      {navHosts.map(h=>(
                        <button key={h.id} className="nd-row" onClick={()=>enterPortalAthletes(h.id)}>{h.name}<span className="nd-cnt">{h.n}</span></button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Competitions — by class / by country / by host */}
              <div className="np-item">
                <button className={`np-link${navOn==="competitions"?" on":""}`} onClick={e=>{e.currentTarget.blur();goTop("competitions");}}>Competitions</button>
                <div className="np-drop">
                  <p className="nd-label">By class</p>
                  <div className="nd-chips">
                    {CLASSES.map(c=>(
                      <button key={c.id} className="nd-chip" onClick={()=>goTop("competitions",{cls:c.id})}>
                        <span className="dot" style={{background:classColor(c.id)}}/>{c.short}
                      </button>
                    ))}
                  </div>
                  <button className="nd-row" onClick={()=>goTop("competitions")}><Globe size={14} style={{flex:"none",color:"var(--navy2)"}}/>By country</button>
                  <div className="nd-subwrap">
                    <button className="nd-row" onClick={()=>goTop("hosts")}><Waves size={14} style={{flex:"none",color:"var(--navy2)"}}/>By host<ChevronRight size={13} style={{marginLeft:"auto",opacity:.6}}/></button>
                    <div className="nd-sub">
                      {navHosts.map(h=>(
                        <button key={h.id} className="nd-row" onClick={()=>enterPortal(h.id)}>{h.name}<span className="nd-cnt">{h.n}</span></button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Hosts — by type / by country */}
              <div className="np-item">
                <button className={`np-link${navOn==="hosts"?" on":""}`} onClick={e=>{e.currentTarget.blur();goTop("hosts");}}>Hosts</button>
                <div className="np-drop">
                  <p className="nd-label">By type</p>
                  {[["federation","Federations"],["club","Clubs"],["association","Associations"]].map(([t,label])=>(
                    <button key={t} className="nd-row" onClick={()=>goTop("hosts",{type:t})}>{label}<span className="nd-cnt">{navHosts.filter(h=>h.htype===t).length}</span></button>
                  ))}
                  <div className="nd-subwrap">
                    <button className="nd-row" onClick={()=>goTop("hosts")}><Globe size={14} style={{flex:"none",color:"var(--navy2)"}}/>By country<ChevronRight size={13} style={{marginLeft:"auto",opacity:.6}}/></button>
                    <div className="nd-sub">
                      {hostCountries.map(cc=>(
                        <button key={cc} className="nd-row" onClick={()=>goTop("hosts",{country:cc})}>
                          <span style={{fontSize:15,flex:"none"}}>{iocFlag(cc)}</span>{GLOBE_NAMES[IOC_ISO[cc]]||cc}
                          <span className="nd-cnt">{navHosts.filter(h=>h.loc===cc).length}</span>
                        </button>
                      ))}
                      {navHosts.some(h=>!h.loc)&&(
                        <button className="nd-row" onClick={()=>goTop("hosts",{country:"__none__"})}>
                          <span style={{fontSize:15,flex:"none",width:15,display:"inline-block"}}/>Unspecified
                          <span className="nd-cnt">{navHosts.filter(h=>!h.loc).length}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {/* Rankings — by class / by country */}
              <div className="np-item">
                <button className={`np-link${navOn==="ranking"?" on":""}`} onClick={e=>{e.currentTarget.blur();goTop("ranking");}}>Rankings</button>
                <div className="np-drop">
                  <p className="nd-label">By class</p>
                  <div className="nd-chips">
                    {CLASSES.map(c=>(
                      <button key={c.id} className="nd-chip" onClick={()=>goRankingClass(c.id)}>
                        <span className="dot" style={{background:classColor(c.id)}}/>{c.short}
                      </button>
                    ))}
                  </div>
                  <button className="nd-row" onClick={()=>goTop("ranking")}><Globe size={14} style={{flex:"none",color:"var(--navy2)"}}/>By country</button>
                </div>
              </div>
              {/* Scout — talent-scouting workspace (no dropdown); scout-only */}
              {isScout&&<div className="np-item">
                <button className={`np-link${navOn==="scout"?" on":""}`} onClick={e=>{e.currentTarget.blur();goTop("scout");}}>Scout</button>
              </div>}
              <button className="np-srchbtn" title="Search" onClick={()=>setNavSearchOpen(true)}><Search size={16}/></button>
              {navMenuOpen&&(
                <div className="np-menu">
                  <button className={`np-mrow${navOn==="athletes"?" on":""}`} onClick={()=>{setNavMenuOpen(false);goTop("athletes");}}><Users size={16}/>Athletes</button>
                  <button className={`np-mrow${navOn==="competitions"?" on":""}`} onClick={()=>{setNavMenuOpen(false);goTop("competitions");}}><Anchor size={16}/>Competitions</button>
                  <button className={`np-mrow${navOn==="hosts"?" on":""}`} onClick={()=>{setNavMenuOpen(false);goTop("hosts");}}><Waves size={16}/>Hosts</button>
                  <button className={`np-mrow${navOn==="ranking"?" on":""}`} onClick={()=>{setNavMenuOpen(false);goTop("ranking");}}><Trophy size={16}/>Rankings</button>
                  {isScout&&<button className={`np-mrow${navOn==="scout"?" on":""}`} onClick={()=>{setNavMenuOpen(false);goTop("scout");}}><Eye size={16}/>Scout</button>}
                </div>
              )}
            </div>}
        {navSearchOpen&&gSearchOpen&&gSearchResults.length>0&&(
          <div className="mp-drop">
            {gSearchResults.map((r,i)=>(
              <div key={i} className="gsrch-item" onMouseDown={()=>execGSearch(r)}>
                <div className="gi-icon" style={{background:r.type==="athlete"?"#e8f4ff":r.type==="event"?"#f0f4ff":r.type==="portal"?"var(--sky)":"#f0f8f0"}}>
                  {r.type==="athlete"?<Users size={14} color="#1a5e8a"/>:r.type==="event"?<Anchor size={14} color="#1a3e8a"/>:r.type==="portal"?<Waves size={14} color="var(--navy)"/>:<ChevronRight size={14} color="#0a6b41"/>}
                </div>
                <div><div className="gi-label">{r.label}</div><div className="gi-sub">{r.sub}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    {/* right: profile → sign in / sign up */}
    <div className="tb-right">
      {auth
        ? <div style={{position:"relative"}}>
            <button className="tb-profile" onClick={()=>setAccountOpen(o=>!o)} title={devMode?"Developer — full edit access":role} style={{position:"relative"}}>
              <span style={{fontSize:14,fontWeight:800}}>{(auth.profile?.display_name||auth.user?.email||"?").slice(0,1).toUpperCase()}</span>
              {hasPendingHostMembership&&<span style={{position:"absolute",top:-2,right:-2,width:12,height:12,borderRadius:"50%",background:"#f5a623",border:"2px solid #fff"}} title="Host approval pending"/>}
              {showClaimNudge&&!hasPendingHostMembership&&<span style={{position:"absolute",top:-2,right:-2,width:12,height:12,borderRadius:"50%",background:"var(--accent)",border:"2px solid #fff"}} title="Claim your athlete profile"/>}
            </button>
            {accountOpen&&(<div className="tb-acct">
              {(()=>{
                const fullName=`${auth.profile?.first_name||""} ${auth.profile?.last_name||""}`.trim()||auth.profile?.display_name||null;
                // Host portals this user belongs to (verified) — shown as their identity instead of a generic role.
                const myHostNames=myMemberships.filter(m=>m.verified).map(m=>hostById(m.host_id)?.name).filter(Boolean);
                const myHostId=myMemberships.filter(m=>m.verified).map(m=>m.host_id)[0]||null;
                const myAthleteName=auth.profile?.athlete_name||fullName;
                const goToMe=()=>{
                  setAccountOpen(false);
                  if(role==="athlete"&&myAthleteName){go({name:"profile",id:myAthleteName});}
                  else if(myHostId){enterPortal(myHostId);}
                  else if(myAthleteName){go({name:"profile",id:myAthleteName});}
                };
                const canGoToMe=(role==="athlete"&&!!myAthleteName)||!!myHostId;
                const roleLine=devMode?"Developer — full edit access"
                  :myHostNames.length>0?`${myHostNames.length>1?"Hosts":"Host"}: ${myHostNames.join(", ")}`
                  :role==="athlete"?"Athlete":role==="scout"?"Scout":"Guest";
                return(<>
                  {/* identity header: avatar + name + email + role/username line */}
                  <div className="acct-head">
                    <div className="acct-av">{(auth.profile?.display_name||auth.user?.email||"?").slice(0,1).toUpperCase()}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13.5,fontWeight:700,color:"var(--navy)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fullName||"Account"}</div>
                      {/* Dev view uses a hidden admin session — never surface its account email. */}
                      {!devMode&&<div style={{fontSize:11.5,color:"var(--mut)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{auth.user?.email}</div>}
                      <div style={{fontSize:11,color:"var(--mut)",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{roleLine}{auth.profile?.username&&!devMode?` · @${auth.profile.username}`:""}</div>
                    </div>
                  </div>
                  {canGoToMe&&<button className="acct-item" onClick={goToMe}><User size={15}/>View my profile</button>}
                </>);
              })()}
              {/* Username reminder — gentle nudge, only if they haven't set one */}
              {!auth.profile?.username&&!devMode&&(
                <div style={{margin:"2px 8px 6px",padding:"9px 11px",background:"rgba(10,132,255,.07)",border:"1px solid rgba(10,132,255,.18)",borderRadius:9,fontSize:11.5,color:"var(--navy)",lineHeight:1.45}}>
                  <div style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                    <User size={13} style={{flex:"none",marginTop:1,color:"var(--accent)"}}/>
                    <span>Add a username so people can find and tell you apart from others with the same name.</span>
                  </div>
                  <button onClick={()=>{setAccountOpen(false);setShowUsername(true);}} style={{marginTop:7,width:"100%",border:0,background:"var(--accent)",color:"#fff",borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Create username</button>
                </div>
              )}
              {/* Claim-your-profile nudge — athletes who haven't claimed yet */}
              {showClaimNudge&&(
                <div style={{margin:"2px 8px 6px",padding:"9px 11px",background:"rgba(10,132,255,.07)",border:"1px solid rgba(10,132,255,.18)",borderRadius:9,fontSize:11.5,color:"var(--navy)",lineHeight:1.45}}>
                  <div style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                    <BadgeCheck size={13} style={{flex:"none",marginTop:1,color:"var(--accent)"}}/>
                    <span>Claim your athlete profile to verify your results and get a verified badge.</span>
                  </div>
                  <button onClick={()=>{setAccountOpen(false);setShowClaimModal(true);}} style={{marginTop:7,width:"100%",border:0,background:"var(--accent)",color:"#fff",borderRadius:7,padding:"6px 10px",fontSize:12,fontWeight:700,cursor:"pointer"}}>Claim your profile</button>
                </div>
              )}
              {hasPendingHostMembership&&(
                <div style={{margin:"2px 8px 8px",padding:"8px 10px",background:"rgba(255,149,0,.1)",border:"1px solid rgba(255,149,0,.3)",borderRadius:8,fontSize:11.5,color:"#a85c00",lineHeight:1.45,display:"flex",gap:7,alignItems:"flex-start"}}>
                  <Clock size={13} style={{flex:"none",marginTop:1}}/>
                  <span>Your host setup is pending AthLink approval. You're browsing as a guest until verified.</span>
                </div>
              )}
              <div style={{height:1,background:"var(--line)",margin:"6px 2px"}}/>
              <button className="acct-item danger" onClick={signOut}><LogOut size={15}/>{devMode?"Exit dev view":"Sign out"}</button>
            </div>)}
          </div>
        : <button className="tb-profile" onClick={()=>setShowSignIn(true)} title="Sign in / sign up"><User size={18}/></button>}
    </div>
  </div>
  {/* Dev tools moved out of the retired hamburger — a small strip under the top bar. */}
  {devMode&&(
    <div className="devstrip">
      <button onClick={()=>setShowDevApprovals(true)}>Pending approvals</button>
      <button onClick={()=>setShowDevProfiles(true)}>All profiles</button>
      <button onClick={()=>setShowAddHost(true)}><Plus size={11}/>Add host</button>
      {portal&&!isClassPortal&&hostById(portal)&&<button style={{color:"#e74c3c"}} onClick={e=>deleteHost(portal,hostById(portal).name,e)}><Trash2 size={11}/>Delete this host</button>}
      <button onClick={()=>setDevMode(false)}><Pencil size={11}/>Dev view ON — turn off</button>
    </div>
  )}
  <div style={{height:74}}/>
  {showSignIn&&<SignInModal onClose={()=>{setShowSignIn(false);setGoogleOnboarding(null);setPendingInviteToken(null);setSignupRole(null);setSignInNotice("");}} onAuthed={onAuthed} googleOnboarding={googleOnboarding}
    clubs={CLUBS} associations={ASSOCIATIONS} federations={FEDERATIONS}
    onCreateHost={createHostFromSignup} onClaimHost={claimHostFromSignup}
    initialRole={signupRole} pendingInviteToken={pendingInviteToken} initialInfo={signInNotice}/>}
  {recoverySession&&<ResetPasswordModal token={recoverySession.token}
    onClose={()=>setRecoverySession(null)}
    onDone={async()=>{
      const{token,refresh,user}=recoverySession;
      const prof=await fetchProfile(user.id,token)||{role:"guest"};
      onAuthed({token,refresh,user,profile:prof});
      setRecoverySession(null);
    }}/>}
  {showMembers&&host&&!isClassPortal&&(()=>{
    // Athlete names appearing in this host's events (for vouching scope)
    const hostEvents=events.filter(e=>eventAssocs(e).includes(portal));
    const hostAthleteNames=new Set();
    hostEvents.forEach(ev=>ev.entries.forEach(en=>{if(en.helm)hostAthleteNames.add(en.helm);if(en.crew)hostAthleteNames.add(en.crew);}));
    const pendingClaimsHere=allClaims.filter(c=>c.status==="pending"&&[...hostAthleteNames].some(n=>n.toLowerCase()===c.profile_name?.toLowerCase()));
    const pendingEventClaimsHere=allEventClaims.filter(c=>c.status==="pending"&&c.host_id===portal).map(c=>({...c,_eventName:(events.find(e=>e.id===c.event_id)||{}).name||"(event)"}));
    return(
    <HostMembersModal hostId={portal} hostName={host.name} auth={auth} myMembership={myPortalMembership}
      pendingClaims={pendingClaimsHere} pendingEventClaims={pendingEventClaimsHere} canVouch={devMode||(!!myPortalMembership&&myPortalMembership.verified)} canManage={canManageMembers}
      onDecideClaim={(claim,approve)=>resolveClaim(claim,approve,portal)}
      onDecideEventClaim={async(claim,approve)=>{
        await decideEventClaim(claim.id,approve,auth.user.id,portal,auth.token);
        if(approve){
          const patch={owner:portal,owner_confirmed:true,organizer_name:null};
          setEvents(p=>p.map(x=>x.id===claim.event_id?{...x,...patch}:x));
          try{await sbPatch("events",`id=eq.${claim.event_id}`,patch);}catch(e){console.error("event claim approve patch",e);}
        }
        await reloadEventClaims();
      }}
      onClose={()=>setShowMembers(false)} onChanged={reloadMemberships}/>
    );
  })()}
  {inviteRedeemed&&(
    <div className="notice"><div className="ico"><BadgeCheck size={18}/></div>
      <div><b>{inviteRedeemed.status==="joined"?"You're in!":inviteRedeemed.status==="used"?"Invite already used":inviteRedeemed.status==="expired"?"Invite expired":"Invalid invite"}</b>
      <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>
        {inviteRedeemed.status==="joined"?`You've joined as ${inviteRedeemed.role||"a host member"} — full access is active.`:
         inviteRedeemed.status==="used"?"That invite link has already been redeemed.":
         inviteRedeemed.status==="expired"?"That invite link is past its 7-day window.":
         "That invite link isn't valid."}
      </div></div>
      <button className="x" style={{marginLeft:8}} onClick={()=>setInviteRedeemed(null)}><X size={15}/></button>
    </div>
  )}
  {claimNote&&(
    <div className="notice"><div className="ico"><BadgeCheck size={18}/></div>
      <div><b>Claim submitted</b>
      <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>Your claim on <b>{claimNote.name}</b> is pending — a verified host admin will review it.</div></div>
      <button className="x" style={{marginLeft:8}} onClick={()=>setClaimNote(null)}><X size={15}/></button>
    </div>
  )}
  {classNote&&(
    <div className="notice"><div className="ico"><AlertCircle size={18}/></div>
      <div><b>Class not saved yet</b>
      <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>"<b>{classNote.name}</b>" couldn't be written to the database — it will be retried automatically next time you load AthLink signed in.</div></div>
      <button className="x" style={{marginLeft:8}} onClick={()=>setClassNote(null)}><X size={15}/></button>
    </div>
  )}
  {showClaimModal&&(()=>{
    const myName=auth?.profile?.athlete_name||`${auth?.profile?.first_name||""} ${auth?.profile?.last_name||""}`.trim()||auth?.profile?.display_name||"";
    const mine=auth?.user?.id?allClaims.find(c=>c.user_id===auth.user.id&&c.status!=="denied"):null;
    return <ClaimProfileModal
      myName={myName} people={allPeople} events={events}
      alreadyClaimed={mine?mine.profile_name:null}
      onClaim={async(name)=>{await submitClaim(name);setShowClaimModal(false);}}
      onSearchAll={()=>{setShowClaimModal(false);go({name:"athletes"});}}
      onClose={()=>setShowClaimModal(false)}/>;
  })()}
  {showAthEdit&&(()=>{
    const nm=showAthEdit;
    return <AthleteEditModal
      name={nm} profile={athleteProfileOf(nm)}
      onSaveExtras={saveAthleteExtras} onRename={renameOwnedAthlete} onSaveUsername={saveAthleteUsername}
      uploadPhoto={(file)=>uploadAthletePhoto(file,nm,auth?.token)}
      onClose={(finalName)=>{setShowAthEdit(null); if(typeof finalName==="string"&&finalName&&finalName!==nm) go({name:"profile",id:finalName});}}/>;
  })()}
  {showMedia&&(()=>{
    const nm=showMedia;
    return <MediaModal
      name={nm} media={athleteProfileOf(nm)?.media||[]} canEdit={isProfileOwner(nm)}
      uploadMedia={(file)=>uploadAthleteMedia(file,nm,auth?.token)} onSaveMedia={saveAthleteMedia}
      onClose={()=>setShowMedia(null)}/>;
  })()}
  {showDevApprovals&&devMode&&(
    <DevApprovalsModal auth={auth} hosts={[...ASSOCIATIONS,...CLUBS,...FEDERATIONS]}
      nameForHost={(id)=>hostById(id)?.name||id}
      eventCountFor={(id)=>events.filter(e=>eventAssocs(e).includes(id)).length}
      onApprove={devApproveMember} onDelete={devDeleteMember} onReassign={devReassignMember}
      onClose={()=>setShowDevApprovals(false)}/>
  )}
  {showDevProfiles&&devMode&&(
    <DevProfilesModal auth={auth} nameForHost={(id)=>hostById(id)?.name||id} hosts={[...ASSOCIATIONS,...CLUBS,...FEDERATIONS]} onClose={()=>setShowDevProfiles(false)}/>
  )}
  {showHostEdit&&portal&&!isClassPortal&&hostById(portal)&&(()=>{
    const hostEvents=events.filter(e=>eventAssocs(e).includes(portal));
    const hostAthleteNames=new Set();
    hostEvents.forEach(ev=>ev.entries.forEach(en=>{if(en.helm)hostAthleteNames.add(en.helm);if(en.crew)hostAthleteNames.add(en.crew);}));
    const pendingClaimsHere=allClaims.filter(c=>c.status==="pending"&&[...hostAthleteNames].some(n=>n.toLowerCase()===c.profile_name?.toLowerCase()));
    const pendingEventClaimsHere=allEventClaims.filter(c=>c.status==="pending"&&c.host_id===portal).map(c=>({...c,_eventName:(events.find(e=>e.id===c.event_id)||{}).name||"(event)"}));
    return(
    <HostEditModal host={hostById(portal)} canManage={canManageMembers}
      onSave={(patch)=>saveHost(portal,patch)} onSaveSlug={saveHostSlug}
      onUploadLogo={(file)=>uploadHostLogo(file,hostById(portal),auth?.token)}
      membersProps={{hostId:portal,hostName:hostById(portal).name,auth,myMembership:myPortalMembership,
        pendingClaims:pendingClaimsHere,pendingEventClaims:pendingEventClaimsHere,canVouch:devMode||(!!myPortalMembership&&myPortalMembership.verified),
        onDecideClaim:(claim,approve)=>resolveClaim(claim,approve,portal),
        onDecideEventClaim:async(claim,approve)=>{
          await decideEventClaim(claim.id,approve,auth.user.id,portal,auth.token);
          if(approve){const patch={owner:portal,owner_confirmed:true,organizer_name:null};setEvents(p=>p.map(x=>x.id===claim.event_id?{...x,...patch}:x));try{await sbPatch("events",`id=eq.${claim.event_id}`,patch);}catch(e){console.error("event claim approve patch",e);}}
          await reloadEventClaims();
        },
        onClose:()=>setShowHostEdit(false),onChanged:reloadMemberships}}
      onClose={()=>setShowHostEdit(false)}/>
    );
  })()}
  {/* Host auto-grab: competition discovery + bulk-import view */}
  {showDiscovery&&portal&&!isClassPortal&&hostById(portal)&&(
    <HostDiscoveryModal host={hostById(portal)} events={events} auth={auth}
      canImport={canManageMembers} devMode={devMode}
      onSaveDossier={(dossier)=>saveHost(portal,{dossier})}
      onClaimEvent={async(ev)=>{
        if(!auth?.user?.id) return;
        try{
          await createEventClaim(ev.id,portal,auth.user.id,"",auth.token);
          setClaimNote({name:ev.name,status:"pending"}); setTimeout(()=>setClaimNote(null),6000);
          await reloadEventClaims();
        }catch(e){ console.error("discovery event claim",e); }
      }}
      onImport={(rows)=>importDiscoveredCompetitions(rows,hostById(portal))}
      seedSites={discoverySeed}
      importStatuses={discoveryImport?.statuses||{}}
      importSummary={discoveryImport}
      needsReview={hostById(portal)?.dossier?.needs_review||[]}
      openReviewInitially={discoveryReview}
      onReviewItem={openReviewInImport}
      onClose={()=>{setShowDiscovery(false);setDiscoveryImport(null);setDiscoverySeed(null);}}/>
  )}
  {pendingHostNotice&&(
    <div className="notice"><div className="ico"><Clock size={18}/></div>
      <div><b>Setup complete — pending approval</b>
      <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>Your request to manage <b>{hostById(pendingHostNotice)?.name||"your host"}</b> is in. You'll browse as a guest until the AthLink team verifies you.</div></div>
      <button className="x" style={{marginLeft:8}} onClick={()=>setPendingHostNotice(null)}><X size={15}/></button>
    </div>
  )}
  {showUsername&&auth&&(
    <div className="ov" onClick={()=>setShowUsername(false)}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
        <div className="mhead" style={{padding:"18px 24px"}}>
          <User size={18}/><h3 style={{flex:1}}>Create a username</h3>
          <button className="x" onClick={()=>setShowUsername(false)}><X size={16}/></button>
        </div>
        <div style={{padding:"18px 24px 24px",display:"flex",flexDirection:"column",gap:14}}>
          <p style={{margin:0,fontSize:13,color:"var(--mut)",lineHeight:1.5}}>
            A username gives you a unique handle so people can find you and tell you apart from others with the same name.
          </p>
          {usernameErr&&<div style={{background:"rgba(200,50,50,.1)",border:"1px solid rgba(200,50,50,.3)",borderRadius:10,padding:"9px 13px",fontSize:12.5,color:"#c0392b"}}>{usernameErr}</div>}
          <div style={{display:"flex",alignItems:"center",gap:0,border:"1px solid var(--line)",borderRadius:10,background:"rgba(255,255,255,.85)",overflow:"hidden"}}>
            <span style={{padding:"11px 4px 11px 13px",color:"var(--mut)",fontSize:15,fontWeight:700}}>@</span>
            <input autoFocus value={usernameInput}
              onChange={e=>{setUsernameInput(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,""));setUsernameErr("");}}
              onKeyDown={e=>{if(e.key==="Enter"&&usernameInput.trim().length>=3)saveUsername();}}
              placeholder="your_handle" maxLength={24}
              style={{flex:1,border:0,background:"none",outline:"none",font:"inherit",fontSize:14,padding:"11px 13px 11px 2px"}}/>
          </div>
          <button className="btn cta liquidGlass-wrapper" style={{width:"100%",justifyContent:"center"}} disabled={usernameBusy||usernameInput.trim().length<3} onClick={saveUsername}>
            <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{usernameBusy?<Loader2 size={15} className="spin"/>:<CheckCircle size={15}/>}Save username</div>
          </button>
        </div>
      </div>
    </div>
  )}
  {(gSearchOpen||navSearchOpen||navMenuOpen)&&<div style={{position:"fixed",inset:0,zIndex:55}} onClick={()=>{setGSearchOpen(false);setNavSearchOpen(false);setNavMenuOpen(false);}}/>}

  {/* ── Breadcrumb wayfinding — entity pages only (top-level pages carry their own
      titles; the top bar has no back button by rule, so this is the "you are here"). ── */}
  {(()=>{
    const isCls=portal&&String(portal).startsWith("class:");
    const crumbs=[];
    if(view.name==="competitions"&&view.cls){
      crumbs.push({label:"Competitions",go:()=>goTop("competitions")},{label:classLabel(view.cls)});
    }else if(view.name==="athletes"&&!portal&&view.cls){
      crumbs.push({label:"Athletes",go:()=>goTop("athletes")},{label:classLabel(view.cls)});
    }else if(view.name==="event"){
      const ev=events.find(e=>e.id===view.id);
      crumbs.push({label:"Competitions",go:()=>goTop("competitions")},{label:ev?ev.name:"Competition"});
    }else if(view.name==="profile"){
      crumbs.push({label:"Athletes",go:()=>goTop("athletes")},{label:view.id||"Athlete"});
    }else if(isCls){
      const cls=classLabel(String(portal).slice(6));
      crumbs.push({label:"Classes"});
      if(view.name==="athletes") crumbs.push({label:cls,go:()=>{pushNav();setView({name:"events"});window.scrollTo(0,0);}},{label:"Athletes"});
      else crumbs.push({label:cls});
    }else if(portal){
      const h=hostById(portal);
      crumbs.push({label:"Hosts",go:()=>goTop("hosts")});
      if(view.name==="athletes") crumbs.push({label:h?.name||"Club",go:()=>{pushNav();setView({name:"events"});window.scrollTo(0,0);}},{label:"Athletes"});
      else crumbs.push({label:h?.name||"Club"});
    }
    if(!crumbs.length) return null;
    return(
      <div className="wrap">
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((c,i)=>(
            <React.Fragment key={i}>
              {i>0&&<ChevronRight size={13} className="c-sep"/>}
              {c.go
                ? <button className="c-link" onClick={c.go}>{c.label}</button>
                : <span className={i===crumbs.length-1?"c-cur":"c-root"}>{c.label}</span>}
            </React.Fragment>
          ))}
        </nav>
      </div>
    );
  })()}

  {/* ── HOME HERO — search-first: one action, spanning athletes + competitions + clubs ── */}
  {!portal&&view.name==="portals"&&(
    <div className="home-hero">
      <div className="wrap">
        <h1 className="disp" style={{margin:0}}>Sailing</h1>
      </div>
    </div>
  )}

  {/* (Calendar is now a popup modal — see RACE CALENDAR MODAL below) */}

  {/* ── HOME: breadth strip — models up top, then the search + class chips +
      recent competitions + featured athletes. Quiet proof the catalog is deep;
      the two old grids (class buttons + HK/INT host matrix) are gone — clubs
      are reached via search and Competitions. ── */}
  {!portal&&view.name==="portals"&&(()=>{
    const published=events.filter(ev=>ev.status!=="Draft");
    const recent=published.slice().sort((a,b)=>{
      const da=a.date?.split('/').reverse().join('')||'';
      const db=b.date?.split('/').reverse().join('')||'';
      return db.localeCompare(da);
    }).slice(0,4);
    // Most-active athletes across all published competitions — breadth, not a ranking.
    const counts=new Map();
    published.forEach(ev=>ev.entries.forEach(en=>{[en.helm,en.crew].forEach(nm=>{if(!nm)return;const k=canonName(nm);if(k)counts.set(k,(counts.get(k)||0)+1);});}));
    const featured=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,n])=>({
      key:k,name:displayNameFor(k)||k,cls:ATHLETE_ATTRS.get(k)?.recentCls||null,n
    }));
    return(
    <div className="wrap sec">
      <HomeShowcaseRotator/>
      <p style={{margin:"0 0 8px",color:"var(--mut)",fontSize:15}}>Results, athlete profiles and class standings for competitive sailing</p>
      <div className="hero-srch" style={{maxWidth:"none"}} onClick={e=>e.stopPropagation()}>
        <Search size={19} color="#9fb2c8" style={{flex:"none"}}/>
        <input placeholder="Search athletes, competitions & clubs…" value={gSearch}
          onChange={e=>{setGSearch(e.target.value);setGSearchOpen(true);runGlobalSearch(e.target.value);}}
          onFocus={()=>setGSearchOpen(true)}
          onBlur={()=>setTimeout(()=>setGSearchOpen(false),150)}
          onKeyDown={e=>{if(e.key==="Escape"){setGSearch("");setGSearchOpen(false);}if(e.key==="Enter"&&gSearchResults.length){execGSearch(gSearchResults[0]);}}}/>
        {gSearch&&<button className="mp-clear" onClick={()=>{setGSearch("");setGSearchOpen(false);setGSearchResults([]);}}><X size={15}/></button>}
        {!navSearchOpen&&gSearchOpen&&gSearchResults.length>0&&(
          <div className="hero-drop">
            {gSearchResults.map((r,i)=>(
              <div key={i} className="gsrch-item" onMouseDown={()=>execGSearch(r)}>
                <div className="gi-icon" style={{background:r.type==="athlete"?"#e8f4ff":r.type==="event"?"#f0f4ff":r.type==="portal"?"var(--sky)":"#f0f8f0"}}>
                  {r.type==="athlete"?<Users size={14} color="#1a5e8a"/>:r.type==="event"?<Anchor size={14} color="#1a3e8a"/>:r.type==="portal"?<Waves size={14} color="var(--navy)"/>:<ChevronRight size={14} color="#0a6b41"/>}
                </div>
                <div><div className="gi-label">{r.label}</div><div className="gi-sub">{r.sub}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="strip-chips" style={{marginTop:20}}>
        {CLASSES.map(c=>{
          const n=published.filter(e=>e.cls===c.id).length;
          return(
            <button key={c.id} className="strip-chip" onClick={()=>goTop("competitions",{cls:c.id})}>
              <span className="dot" style={{background:classColor(c.id)}}/>{c.short}<span className="cnt">{n}</span>
            </button>
          );
        })}
        <button className="strip-chip" onClick={()=>goTop("competitions")}>All competitions<ChevronRight size={13}/></button>
      </div>
      <p className="seclabel">Recent competitions</p>
      <div className="strip-cards">
        {recent.map(ev=>{
          const host=hostById(ev.owner)?.name||ev.organizer_name||"";
          const n=nuggetFor(ev.cls,ev.subclass);
          return(
          <div key={ev.id} className="strip-card" onClick={()=>go({name:"event",id:ev.id})}>
            <div className="sc-top"><span className="sc-date">{formatDate(ev.date)}</span>
              {isUpcomingEvent(ev)&&<span className="cls" style={{background:"rgba(232,146,26,.15)",color:"#b8860b",boxShadow:"inset 0 0 0 1px rgba(232,146,26,.4)"}}>UPCOMING</span>}
              <span className="cls" style={{background:n.color}}>{n.label}</span></div>
            <p className="sc-name">{ev.name}</p>
            {host&&<p className="sc-sub">{host}</p>}
          </div>);
        })}
      </div>
      <p className="seclabel">Featured athletes</p>
      <div className="strip-cards">
        {featured.map(a=>(
          <div key={a.key} className="strip-card" onClick={()=>go({name:"profile",id:a.name})}>
            <div className="sc-top">
              <span className="av" style={{background:"var(--navy2)",width:34,height:34,fontSize:12}}>{a.name.split(/\s+/).map(w=>w[0]).filter(Boolean).slice(0,2).join("").toUpperCase()}</span>
              {a.cls&&(()=>{const n=nuggetFor(a.cls);return <span className="cls" style={{background:n.color}}>{n.label}</span>;})()}
            </div>
            <p className="sc-name">{a.name}</p>
            <p className="sc-sub">{a.n} competition{a.n!==1?"s":""}</p>
          </div>
        ))}
      </div>
    </div>
    );
  })()}

  {/* ── COMPETITIONS: global list — every published competition across all hosts ── */}
  {!portal&&view.name==="competitions"&&(()=>{
    const q=compQ.trim().toLowerCase();
    const published=events.filter(ev=>ev.status!=="Draft");
    const lens=view.cls||null; // class filter — carried in the view so /class/<id> deep-links
    const cLens=view.country||null; // country filter (competition's host country)
    // Chip row: the 4 main classes plus any custom classes that actually have competitions
    const customIds=[...new Set(published.map(e=>e.cls).filter(Boolean))].filter(id=>!CLASSES.some(c=>c.id===id));
    const chipDefs=[...CLASSES.map(c=>({id:c.id,label:c.short})),...customIds.map(id=>({id,label:classLabel(id)}))];
    const compCountries=[...new Set(published.map(ev=>eventCountryCode(ev)).filter(Boolean))]
      .sort((x,y)=>(GLOBE_NAMES[IOC_ISO[x]]||x).localeCompare(GLOBE_NAMES[IOC_ISO[y]]||y));
    const inLens=published.filter(ev=>(!lens||ev.cls===lens)&&(!cLens||eventCountryCode(ev)===cLens));
    const list=inLens
      .filter(ev=>!q
        ||(ev.name||"").toLowerCase().includes(q)
        ||classLabel(ev.cls||"").toLowerCase().includes(q)
        ||(hostById(ev.owner)?.name||ev.organizer_name||"").toLowerCase().includes(q))
      .slice().sort((a,b)=>{
        const da=a.date?.split('/').reverse().join('')||'';
        const db=b.date?.split('/').reverse().join('')||'';
        return db.localeCompare(da);
      });
    const evItems=[];let lastYear=null;
    list.forEach((ev,i)=>{
      const yr=ev.date?.split('/')?.[2]||null;
      if(yr&&yr!==lastYear){evItems.push({type:'divider',year:yr});lastYear=yr;}
      evItems.push({type:'ev',ev,i});
    });
    return(
    <div className="wrap sec">
      {(()=>{
        const head=(
          <div className="page-head" style={{display:"flex",alignItems:"flex-end",gap:14,flexWrap:"wrap"}}>
            <div style={{flex:"1 1 auto",minWidth:0}}>
              <h1 className="page-title">{lens?`${classLabel(lens)} competitions`:"Competitions"}</h1>
              <p className="page-sub">{inLens.length} competition{inLens.length!==1?"s":""}{(lens||cLens)?"":" across all clubs and classes"}</p>
            </div>
            <button className="btn ghost" style={{fontSize:13,padding:"8px 14px",flex:"none"}} onClick={()=>openCalendar(null)}><Calendar size={15}/>Calendar</button>
          </div>);
        const search=(
          <div className="toolbar" style={{marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
            <div className="srch" style={{flex:1}}>
              <Search size={16} color="#9fb2c8"/>
              <input placeholder="Search competitions, classes & clubs…" value={compQ} onChange={e=>setCompQ(e.target.value)}/>
            </div>
          </div>);
        const chips=(
          <div className="strip-chips" style={{margin:"0 0 14px"}}>
            <button className={`lens-chip${!lens?" on":""}`} onClick={()=>setView(v=>({...v,name:"competitions",cls:undefined}))}>All</button>
            {chipDefs.map(c=>{
              const n=published.filter(e=>e.cls===c.id).length;
              if(!n) return null;
              return(
                <button key={c.id} className={`lens-chip${lens===c.id?" on":""}`} onClick={()=>setView(v=>({...v,name:"competitions",cls:v.cls===c.id?undefined:c.id}))}>
                  <span className="dot" style={{background:nuggetFor(c.id).color}}/>{c.label}<span className="cnt">{n}</span>
                </button>
              );
            })}
            <span className="strip-break"/>{/* selects onto row 2 (Fix 9b) */}
            <span className="lens-selwrap">
              <select className="lens-select" value={cLens||""} onChange={e=>setView(v=>({...v,country:e.target.value||undefined}))}>
                <option value="">All countries</option>
                {compCountries.map(cc=>(<option key={cc} value={cc}>{iocFlag(cc)} {GLOBE_NAMES[IOC_ISO[cc]]||cc}</option>))}
              </select>
              <ChevronRight size={13} className="lens-selchev"/>
            </span>
            <span className="lens-selwrap">
              <select className="lens-select" value="" onChange={e=>{if(e.target.value)enterPortal(e.target.value);}}>
                <option value="">By host…</option>
                {navHosts.map(h=>(<option key={h.id} value={h.id}>{h.name}</option>))}
              </select>
              <ChevronRight size={13} className="lens-selchev"/>
            </span>
          </div>);
        const cfg=lens?SPORT_MODELS[lens]:null;
        if(!cfg) return(<>{head}{search}{chips}</>);
        return( // class explainer: title + search + filters left, the two diagrams packed right on the same row
          <div className="spm-classgrid">
            <div className="spm-classhead">{head}{search}{chips}</div>
            <SpmDuo cfg={cfg}/>
          </div>);
      })()}
      {evItems.map(item=>{
        if(item.type==='divider') return(
          <div key={"yr"+item.year} style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0 8px"}}>
            <span style={{fontSize:12,fontWeight:700,color:"var(--mut)",letterSpacing:".1em"}}>{item.year}</span>
            <div style={{flex:1,height:1,background:"var(--line)"}}/>
          </div>
        );
        const{ev,i}=item;
        const s=scoreEvent(ev);
        const hostName=hostById(ev.owner)?.name||ev.organizer_name||null;
        return(<div className="ev" key={ev.id} style={{animationDelay:`${Math.min(i,12)*50}ms`}} onClick={()=>go({name:"event",id:ev.id})}>
          {(()=>{
            const dp=ev.date?.split('/');
            const hasDate=dp&&dp.length===3&&dp[0]&&dp[2];
            return(<div style={{display:"flex",alignItems:"center",gap:6}}>
              {hasDate&&<div className="evicon-year">{dp[2].split('').map((ch,ci)=><span key={ci}>{ch}</span>)}</div>}
              {hasDate
                ?<div className="evicon-date"><span className="eid">{dp[0]}</span><span className="eim">{MON[parseInt(dp[1])-1]||""}</span></div>
                :<div className="evicon"><Anchor size={20}/></div>}
            </div>);
          })()}
          <div style={{flex:1,minWidth:0}}>
            <p className="evname">{ev.name}</p>
            <div className="evmeta">
              {hostName&&<span><Waves size={13}/>{hostName}</span>}
              <span><MapPin size={13}/>{ev.country?<CountryTag code={ev.country}/>:"—"}</span>
              <span className="ev-cal"><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--link)",fontWeight:600}} title="Open calendar" onClick={e=>{e.stopPropagation();openCalendarAt(ev.date);}}>{formatDate(ev.date)}</span></span>
              <span className="ev-count"><Users size={13}/>{isUpcomingEvent(ev)?`${s.fleet} entered`:`${s.fleet} boats · ${s.races} races`}</span>
            </div>
          </div>
          {isScout&&<SaveButton size="sm" owner={scoutOwnerId(auth)} events={events} kind={isUpcomingEvent(ev)?"upcoming":"event"} eventId={ev.id} title={ev.name}
            snapshot={{evName:ev.name,evDate:ev.date,cls:ev.cls}} onRequireAuth={()=>setShowSignIn(true)}/>}
          {isUpcomingEvent(ev)&&<span className="cls" style={{background:"rgba(232,146,26,.15)",color:"#b8860b",boxShadow:"inset 0 0 0 1px rgba(232,146,26,.4)"}} title="Entry list published — results pending. Open for the fleet forecast.">UPCOMING</span>}
          {(()=>{const n=nuggetFor(ev.cls,ev.subclass);return <span className="cls" style={{background:n.color}}>{n.label}</span>;})()}
          <ChevronRight size={18} color="#9fb2c8"/>
        </div>);
      })}
      {list.length===0&&published.length>0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No competitions match{q?" this search":""}{lens?` in ${classLabel(lens)}`:""}. <button style={{border:0,background:"none",color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setCompQ("");setView({name:"competitions"});}}>Clear</button></p>}
      {published.length===0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No competitions yet.</p>}
      {/* Clubs — browse point (clubs are not a top-level door; they live here + in search) */}
      {(()=>{
        const hosts=[...FEDERATIONS,...CLUBS,...ASSOCIATIONS].map(h=>({
          ...h,n:published.filter(ev=>eventAssocs(ev).includes(h.id)).length
        })).filter(h=>h.n>0).sort((a,b)=>b.n-a.n);
        if(!hosts.length) return null;
        return(<>
          <p className="seclabel" style={{marginTop:34}}>Clubs & organisations</p>
          <div className="strip-chips">
            {hosts.map(h=>(
              <button key={h.id} className="strip-chip" onClick={()=>enterPortal(h.id)}>
                {h.name}<span className="cnt">{h.n}</span>
              </button>
            ))}
          </div>
        </>);
      })()}
    </div>
    );
  })()}

  {/* ── HOSTS: global directory — federations, clubs and associations ── */}
  {!portal&&view.name==="hosts"&&(()=>{
    const q=hostQ.trim().toLowerCase();
    const tLens=view.type||null, cLens=view.country||null;
    const list=navHosts
      .filter(h=>!tLens||h.htype===tLens)
      .filter(h=>!cLens||(cLens==="__none__"?!h.loc:h.loc===cLens))
      .filter(h=>!q||h.name.toLowerCase().includes(q));
    const published=events.filter(ev=>ev.status!=="Draft");
    return(
    <div className="wrap sec">
      <div className="page-head">
        <h1 className="page-title">Hosts</h1>
        <p className="page-sub">{navHosts.length} federations, clubs and associations on AthLink</p>
      </div>
      <div className="toolbar" style={{marginBottom:12,display:"flex",gap:10,alignItems:"center"}}>
        <div className="srch" style={{flex:1}}>
          <Search size={16} color="#9fb2c8"/>
          <input placeholder="Search hosts…" value={hostQ} onChange={e=>setHostQ(e.target.value)}/>
        </div>
      </div>
      <div className="strip-chips" style={{margin:"0 0 16px"}}>
        <button className={`lens-chip${!tLens?" on":""}`} onClick={()=>setView(v=>({...v,type:undefined}))}>All</button>
        {[["federation","Federations"],["club","Clubs"],["association","Associations"]].map(([t,label])=>(
          <button key={t} className={`lens-chip${tLens===t?" on":""}`} onClick={()=>setView(v=>({...v,type:v.type===t?undefined:t}))}>{label}<span className="cnt">{navHosts.filter(h=>h.htype===t).length}</span></button>
        ))}
        <span className="strip-break"/>{/* selects onto row 2 (Fix 9b) */}
        <span className="lens-selwrap">
          <select className="lens-select" value={cLens||""} onChange={e=>setView(v=>({...v,country:e.target.value||undefined}))}>
            <option value="">All countries</option>
            {hostCountries.map(cc=>(<option key={cc} value={cc}>{iocFlag(cc)} {GLOBE_NAMES[IOC_ISO[cc]]||cc}</option>))}
            {navHosts.some(h=>!h.loc)&&<option value="__none__">Unspecified</option>}
          </select>
          <ChevronRight size={13} className="lens-selchev"/>
        </span>
      </div>
      <div className="classes-grid">
        {list.map((h,i)=>{
          const typeLabel=h.htype==="federation"?"Federation":h.htype==="club"?"Club":"Association";
          const pub=published.filter(ev=>eventAssocs(ev).includes(h.id));
          const ppl=new Set();pub.forEach(ev=>ev.entries.forEach(e=>{if(e.helm)ppl.add(canonName(e.helm));if(e.crew)ppl.add(canonName(e.crew));}));
          const ids=Array.from(new Set(pub.map(e=>e.cls).filter(Boolean)));
          const main=CLASSES.filter(c=>ids.includes(c.id)).map(c=>c.id);
          const clsIds=[...main,...ids.filter(id=>!main.includes(id))];
          return(
          <div className="class-card" key={h.id} style={{animationDelay:`${Math.min(i,10)*60}ms`,position:"relative"}} onClick={()=>enterPortal(h.id)}>
            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8,marginBottom:14,minHeight:24}}>
              <span style={{display:"inline-block",fontSize:10,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"#5b6b80",border:"1px solid rgba(91,107,128,.5)",borderRadius:980,padding:"3px 10px",background:"transparent",whiteSpace:"nowrap"}}>{typeLabel}</span>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",justifyContent:"flex-end",alignItems:"center",flex:"1 1 0",minWidth:0}}>
                <HostClassPills classIds={clsIds}/>
              </div>
            </div>
            <p className="class-name">{h.loc?<span style={{marginRight:6}}>{iocFlag(h.loc)}</span>:null}{h.name}</p>
            <div className="class-stats" style={{marginBottom:0}}><div><b>{h.n}</b>competitions</div><div><b>{ppl.size}</b>athletes</div></div>
            {h.logo_url&&<img src={h.logo_url} alt="" style={{position:"absolute",right:16,bottom:16,width:60,height:60,objectFit:"contain",pointerEvents:"none",background:"transparent"}}/>}
            {devMode&&<button className="delbtn" title="Delete host (dev)" style={{position:"absolute",top:10,right:10}} onClick={e=>deleteHost(h.id,h.name,e)}><Trash2 size={15}/></button>}
          </div>);
        })}
      </div>
      {list.length===0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No hosts match. <button style={{border:0,background:"none",color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setHostQ("");setView({name:"hosts"});}}>Clear</button></p>}
    </div>
    );
  })()}

  {/* ── SCOUT: talent-scouting workspace ── */}
  {/* wider than the default wrap: the Stocks-style split view (list + chart
      pane) inside ScoutPortal needs the room on desktop. */}
  {!portal&&view.name==="scout"&&(
    <div className="wrap sec" style={{paddingTop:16,maxWidth:1500}}>
      {isScout
        ? <ScoutPortal events={events} auth={auth} hostById={hostById}
            onPick={name=>go({name:"profile",id:name})}
            onOpenEvent={id=>go({name:"event",id})}
            onRequireAuth={()=>setShowSignIn(true)}/>
        : <ScoutLocked onSignUp={()=>{setSignupRole("scout");setShowSignIn(true);}}/>}
    </div>
  )}

  {/* ── HOME: Ranking ── */}
  {!portal&&view.name==="ranking"&&(()=>{
    const yearOf=ev=>{const m=(ev.date||"").match(/(\d{4})/);return m?m[1]:null;};
    const dateKey=ev=>{const m=(ev.date||"").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);return m?`${m[3]}${m[2].padStart(2,"0")}${m[1].padStart(2,"0")}`:"00000000";};
    const mode=arr=>{const c={};arr.forEach(v=>c[v]=(c[v]||0)+1);const t=Object.entries(c).sort((a,b)=>b[1]-a[1])[0];return t?t[0]:null;};
    const genderOf=div=>{const d=String(div||"").trim().toLowerCase();if(["m","men","male","boy","boys"].includes(d))return"M";if(["f","w","women","female","girl","girls"].includes(d))return"F";return null;};
    const dh=rankCls==="29er"||rankCls==="49er";
    // Class events (non-draft, deduped), split into federation-governed vs international
    const clsEvents=dedupEvents(events.filter(e=>e.cls===rankCls&&e.status!=="Draft"));
    const fedEvents=clsEvents.filter(e=>governingFeds(e).length>0).sort((a,b)=>dateKey(b).localeCompare(dateKey(a)));
    const intEvents=clsEvents.filter(e=>governingFeds(e).length===0).sort((a,b)=>dateKey(b).localeCompare(dateKey(a)));
    const sourceEvents=rankSourceOpen==="federation"?fedEvents:rankSourceOpen==="international"?intEvents:[];
    // Group the open source's events by year (desc) for the picker
    const byYear={};sourceEvents.forEach(e=>{const y=yearOf(e)||"—";(byYear[y]||(byYear[y]=[])).push(e);});
    const years=Object.keys(byYear).sort().reverse();
    // Selected competitions become columns (date asc)
    const comps=clsEvents.filter(e=>rankSelected.has(e.id)).sort((a,b)=>dateKey(a).localeCompare(dateKey(b)));
    // ── Selection-series engine (verified vs HKSF 2025 29er sheet) ────────
    // Unit = boat (crew pair for 29er/49er, else solo). Every boat that sails
    // ANY selected regatta is scored across ALL of them; absence from a regatta
    // scores a DNC for each of that regatta's races.
    //   DNC value  = that regatta's entries + 1 (Appendix A, per-regatta).
    //   Cumulative = one long series of every race; discards drop the worst races.
    //   Position   = sum of each regatta's finishing place; discards drop the worst.
    //   Tiebreak   = best result in the most recent regatta.
    // PDF stays ground truth — per-race points/ranks come from scoreEvent.
    const compMeta={};                                  // ev.id -> {fleetN, dncVal, raceCount}
    const byComp=new Map();
    comps.forEach(ev=>{
      const sc=scoreEvent(ev);
      const raceCount=sc.rows.reduce((m,r)=>Math.max(m,(r.races||[]).length),0)||1;
      const fleetN=ev.entries.length||sc.rows.length||1;
      compMeta[ev.id]={fleetN,dncVal:fleetN+1,raceCount};
      sc.rows.forEach(r=>{
        const cell={net:r.net,rank:r.rank,races:r.races||[],race_codes:r.race_codes||null,sail:r.sail,pts:r.pts||[],discardSet:r.discardSet};
        if(dh){
          const hk=canonName(r.helm||""),ck=canonName(r.crew||"");
          const key=[hk,ck].filter(Boolean).sort().join("|")||hk||ck;if(!key) return;
          if(!byComp.has(key)) byComp.set(key,{type:"team",helm:"",crew:"",perComp:{},genders:[],divs:[]});
          const t=byComp.get(key);
          if(r.helm) t.helm=displayNameFor(hk)||r.helm;
          if(r.crew) t.crew=displayNameFor(ck)||r.crew;
          t.perComp[ev.id]=cell;
          const gc=genderCatOf(r);if(gc.gender)t.genders.push(gc.gender);if(gc.category)t.divs.push(gc.category);
        }else{
          const nm=r.helm;if(!nm) return;const k=canonName(nm);if(!k) return;
          if(!byComp.has(k)) byComp.set(k,{type:"solo",name:displayNameFor(k)||nm,perComp:{},genders:[],divs:[]});
          const a=byComp.get(k);a.perComp[ev.id]=cell;
          const gc=genderCatOf(r);if(gc.gender)a.genders.push(gc.gender);if(gc.category)a.divs.push(gc.category);
        }
      });
    });
    const disc=Math.max(0,rankDiscards|0);
    const lastComp=comps[comps.length-1]||null;
    let rows=[...byComp.entries()].map(([k,a])=>{
      const per={};                       // ev.id -> {contrib, rank, dnc}
      const seriesRaces=[];               // flat race-score list (cumulative)
      comps.forEach(c=>{
        const m=compMeta[c.id],pc=a.perComp[c.id];
        if(pc){
          const raceScores=(pc.pts&&pc.pts.length)?pc.pts.slice():[];
          per[c.id]={rank:pc.rank,dnc:false,
            contrib:rankMode==="position"?(pc.rank??m.dncVal):raceScores.reduce((s,v)=>s+v,0)};
          if(rankMode!=="position") raceScores.forEach(v=>seriesRaces.push(v));
        }else{
          per[c.id]={rank:null,dnc:true,
            contrib:rankMode==="position"?m.dncVal:m.dncVal*m.raceCount};
          if(rankMode!=="position") for(let i=0;i<m.raceCount;i++) seriesRaces.push(m.dncVal);
        }
      });
      let total;
      if(rankMode==="position"){
        const vals=comps.map(c=>per[c.id].contrib).sort((x,y)=>y-x);
        const d=Math.min(disc,Math.max(0,vals.length-1));
        total=vals.slice(d).reduce((s,v)=>s+v,0);
      }else{
        const vals=seriesRaces.slice().sort((x,y)=>y-x);
        const d=Math.min(disc,Math.max(0,vals.length-1));
        total=vals.slice(d).reduce((s,v)=>s+v,0);
      }
      const lastRes=lastComp?(per[lastComp.id]?.rank??compMeta[lastComp.id]?.dncVal??9999):9999;
      const gender=a.genders.length?mode(a.genders):null;
      const division=a.divs.length?mode(a.divs):null;
      return{key:k,type:a.type,name:a.name,helm:a.helm,crew:a.crew,perComp:a.perComp,per,total,lastRes,
        count:comps.filter(c=>a.perComp[c.id]).length,gender,division};
    });
    // Lowest total wins; tiebreak = best result in the most recent regatta, then name.
    rows.sort((a,b)=>a.total-b.total||a.lastRes-b.lastRes||(a.name||a.helm||"").localeCompare(b.name||b.helm||""));
    // Country lens (helm nationality) — re-ranked within the filtered view.
    const natOfRow=r=>{const k=canonName(dh?(r.helm||""):(r.name||""));return (cardStats.get(k)||{}).nat||"";};
    const rankCountries=[...new Set(rows.map(natOfRow).filter(Boolean))]
      .sort((x,y)=>(GLOBE_NAMES[IOC_ISO[x]]||x).localeCompare(GLOBE_NAMES[IOC_ISO[y]]||y));
    if(rankCountry) rows=rows.filter(r=>natOfRow(r)===rankCountry);
    rows.forEach((r,i)=>r.rankNum=i+1);
    const podium=n=>n===1?"#e3b341":n===2?"#9aa6b2":n===3?"#c08457":"var(--navy)";
    const clsShort=classLabel(rankCls);
    // Cumulative tallies across the selected competitions (updates as comps change)
    const rankAthleteCount=(()=>{
      const set=new Set();
      comps.forEach(ev=>scoreEvent(ev).rows.forEach(r=>{
        if(r.helm){const k=canonName(r.helm);if(k)set.add(k);}
        if(r.crew){const k=canonName(r.crew);if(k)set.add(k);}
      }));
      return set.size;
    })();
    const Nug=({children,color})=><span style={{display:"inline-block",fontSize:10,fontWeight:700,color:"#fff",background:color||"var(--mut)",borderRadius:5,padding:"2px 6px",marginRight:4}}>{children}</span>;
    return(
      <div className="wrap sec" style={{paddingTop:16}}>
        <div className="page-head">
          <h1 className="page-title">Rankings</h1>
          <p className="page-sub">{comps.length} competition{comps.length!==1?"s":""} · {rankAthleteCount} athlete{rankAthleteCount!==1?"s":""} in the {clsShort} series</p>
        </div>
        {/* Lenses — class chips + country select, same idiom as every other list page */}
        <div className="strip-chips" style={{margin:"0 0 14px"}}>
          {CLASSES.map(c=>(
            <button key={c.id} className={`lens-chip${rankCls===c.id?" on":""}`} onClick={()=>{setRankCls(c.id);setRankSourceOpen(null);setRankExpanded(new Set());}}>
              <span className="dot" style={{background:classColor(c.id)}}/>{c.short}
            </button>
          ))}
          <span className="strip-break"/>{/* selects onto row 2 (Fix 9b) */}
          <span className="lens-selwrap">
            <select className="lens-select" value={rankCountry} onChange={e=>setRankCountry(e.target.value)}>
              <option value="">All countries</option>
              {rankCountries.map(cc=>(<option key={cc} value={cc}>{iocFlag(cc)} {GLOBE_NAMES[IOC_ISO[cc]]||cc}</option>))}
            </select>
            <ChevronRight size={13} className="lens-selchev"/>
          </span>
        </div>
        {/* Source nuggets */}
        <div className="rank-src-row" style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          {[["federation","Federation",fedEvents.length],["international","International",intEvents.length]].map(([id,label,n])=>{
            const on=rankSourceOpen===id;
            return<button key={id} onClick={()=>setRankSourceOpen(o=>o===id?null:id)}
              style={{border:"0",background:on?"var(--accent)":"rgba(255,255,255,0.62)",color:on?"#fff":"var(--navy)",
                backdropFilter:"blur(22px) saturate(190%)",WebkitBackdropFilter:"blur(22px) saturate(190%)",
                boxShadow:on?"inset 0 1px 0 rgba(255,255,255,.4),0 1px 3px rgba(10,132,255,.3)":"inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.5)",
                borderRadius:980,padding:"8px 15px",fontSize:13,fontWeight:700,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:6,transition:".15s"}}>
              {label}<span style={{fontSize:11,opacity:.75,fontWeight:600}}>{n}</span>{on?<ChevronRight size={14} style={{transform:"rotate(90deg)"}}/>:<ChevronRight size={14}/>}
            </button>;
          })}
        </div>
        {/* Result picker for the open source */}
        {rankSourceOpen&&<div style={{marginBottom:16}}>
          {years.length===0&&<p style={{fontSize:13,color:"var(--mut)",margin:0}}>No {clsShort} {rankSourceOpen==="federation"?"federation":"international"} competitions yet.</p>}
          {years.map(y=>(
            <div key={y} className="rank-year-row" style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",padding:"5px 0"}}>
              <span style={{fontSize:12,fontWeight:800,color:"var(--mut)",letterSpacing:".04em",minWidth:38}}>{y}</span>
              {byYear[y].map(ev=>{
                const sel=rankSelected.has(ev.id);
                return<button key={ev.id} onClick={()=>setRankSelected(prev=>{const n=new Set(prev);n.has(ev.id)?n.delete(ev.id):n.add(ev.id);return n;})}
                  title={ev.name}
                  style={{border:"1px solid "+(sel?classColor(rankCls):classColorA(rankCls,.45)),background:sel?classColor(rankCls):`linear-gradient(${classColorA(rankCls,.18)},${classColorA(rankCls,.18)}),rgba(255,255,255,0.80)`,color:sel?"#fff":classColor(rankCls),
                    backdropFilter:"blur(18px) saturate(185%)",WebkitBackdropFilter:"blur(18px) saturate(185%)",boxShadow:"inset 0 1px 0 rgba(255,255,255,.6)",
                    borderRadius:980,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",maxWidth:260,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"inline-flex",alignItems:"center",gap:5,transition:".12s"}}
                  onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.06)"}
                  onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                  {sel?<CheckCircle size={12}/>:<Plus size={12}/>}{ev.name}
                </button>;
              })}
            </div>
          ))}
        </div>}
        {comps.length===0
          ?<p style={{color:"var(--mut)",fontSize:14,padding:"24px 0"}}>Select one or more competitions above to build the {clsShort} ranking. Selected regattas combine into one series — lowest total wins.</p>
          :<>
          {/* When the source pickers are collapsed, show the selected competitions as removable nuggets */}
          {!rankSourceOpen&&<div className="rank-sel-row" style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:12}}>
            {comps.map(c=>(
              <button key={c.id} onClick={()=>setRankSelected(prev=>{const n=new Set(prev);n.delete(c.id);return n;})} title="Remove from ranking"
                style={{border:"1px solid "+classColor(rankCls),background:classColor(rankCls),color:"#fff",borderRadius:980,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer",maxWidth:260,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",display:"inline-flex",alignItems:"center",gap:5,boxShadow:"inset 0 1px 0 rgba(255,255,255,.35)",transition:".12s"}}
                onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.08)"}
                onMouseLeave={e=>e.currentTarget.style.filter="none"}>
                {c.name}<X size={12}/>
              </button>
            ))}
          </div>}
          {/* Ranking controls: mode toggle + discard stepper (verified engine) */}
          <div className="rank-mode-row" style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap",marginBottom:14}}>
            <div style={{display:"inline-flex",borderRadius:980,overflow:"hidden",border:"1px solid var(--line)"}}>
              {[["cumulative","Cumulative"],["position","Position"]].map(([id,label])=>{
                const on=rankMode===id;
                return<button key={id} onClick={()=>setRankMode(id)} title={id==="cumulative"?"Weighs every race across the combined series":"Weighs each competition's finishing place equally"}
                  style={{border:"0",background:on?"var(--navy)":"rgba(255,255,255,.7)",color:on?"#fff":"var(--navy)",padding:"7px 15px",fontSize:12.5,fontWeight:700,cursor:"pointer",transition:".12s"}}>{label}</button>;
              })}
            </div>
            <div style={{display:"inline-flex",alignItems:"center",gap:7,fontSize:12.5,fontWeight:700,color:"var(--navy)"}}>
              Discards
              <button className="rank-disc-btn" onClick={()=>setRankDiscards(d=>Math.max(0,d-1))} title="Fewer discards" style={{width:26,height:26,borderRadius:8,border:"1px solid var(--line)",background:"rgba(255,255,255,.8)",cursor:"pointer",fontWeight:800,color:"var(--navy)"}}>–</button>
              <span style={{minWidth:16,textAlign:"center"}}>{rankDiscards}</span>
              <button className="rank-disc-btn" onClick={()=>setRankDiscards(d=>d+1)} title="More discards" style={{width:26,height:26,borderRadius:8,border:"1px solid var(--line)",background:"rgba(255,255,255,.8)",cursor:"pointer",fontWeight:800,color:"var(--navy)"}}>+</button>
            </div>
            <span style={{fontSize:11.5,color:"var(--mut)"}}>{rankMode==="cumulative"?"Combined series · every race counts · DNC = entries+1":"Sum of competition placings · DNC = entries+1"}</span>
          </div>
          <div className="panel" style={{overflowX:"auto"}}>
            <table>
              <thead>
                <tr>
                  <th style={{width:48}}>Rank</th>
                  <th className="l">{dh?"Team":"Athlete"}</th>
                  <th>Div</th>
                  {comps.map((c,i)=><th key={c.id} title={c.name} style={{maxWidth:130}}><div style={{maxWidth:130,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",margin:"0 auto"}}>{c.name}</div></th>)}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r=>{
                  const expanded=comps.filter(c=>rankExpanded.has(`${r.key}|${c.id}`)&&r.perComp[c.id]);
                  return(<React.Fragment key={r.key}>
                    <tr>
                      <td className={"rk"+(r.rankNum===1?" p1":r.rankNum===2?" p2":r.rankNum===3?" p3":"")}>{r.rankNum}</td>
                      <td className="l" style={{whiteSpace:"nowrap"}}>
                        {dh
                          ?<div style={{lineHeight:1.35}}>
                            <div><span className="namelink" onClick={()=>r.helm&&go({name:"profile",id:r.helm})}>{r.helm||"—"}</span> <span style={{fontSize:10,color:"var(--mut)",fontWeight:700}}>HELM</span></div>
                            {r.crew&&<div><span className="namelink" onClick={()=>go({name:"profile",id:r.crew})}>{r.crew}</span> <span style={{fontSize:10,color:"var(--mut)",fontWeight:700}}>CREW</span></div>}
                          </div>
                          :<span className="namelink" onClick={()=>go({name:"profile",id:r.name})}>{r.name}</span>}
                      </td>
                      <td style={{whiteSpace:"nowrap"}}>
                        {r.gender&&<Nug color={r.gender==="F"?"#c2477f":"#2d6cc9"}>{r.gender}</Nug>}
                        {r.division&&<Nug>{r.division}</Nug>}
                        {!r.gender&&!r.division&&<span style={{color:"#c8d4e0"}}>—</span>}
                      </td>
                      {comps.map(c=>{
                        const pc=r.perComp[c.id];const pcell=r.per[c.id];
                        const ek=`${r.key}|${c.id}`;const open=rankExpanded.has(ek);
                        // Cumulative mode: show the actual per-race results inline as compact
                        // nuggets (same .rc colour classes as the profile miniraces), flowing
                        // into at most 2 rows. Absent athletes keep the italic "DNC".
                        if(rankMode==="cumulative"){
                          return <td key={c.id} style={{textAlign:"center"}}>
                            {pcell.dnc
                              ?<span style={{color:"var(--mut)",fontSize:12,fontStyle:"italic"}}>DNC</span>
                              :<button onClick={()=>pc&&toggleRankCell(ek)} title="Tap for race detail"
                                 style={{border:"1px solid "+(open?"var(--accent)":"transparent"),background:open?"var(--sky)":"transparent",borderRadius:8,padding:3,cursor:pc?"pointer":"default"}}>
                                 <div className="miniraces rank-mini">{(pc.races||[]).map((rc2,j)=>{
                                   const cls2=isCode(rc2)?"c":pc.discardSet?.has(j)?"d":rc2===1?"g1":rc2===2?"g2":rc2===3?"g3":"";
                                   return<div key={j} className={`rc ${cls2}`}>{isCode(rc2)?rc2.slice(0,2):rc2}</div>;
                                 })}</div>
                               </button>}
                          </td>;
                        }
                        // Position mode: unchanged — the regatta placing (or DNC value).
                        const shown=pcell.dnc?compMeta[c.id].dncVal:(pcell.rank??"–");
                        return <td key={c.id}>
                          <button onClick={()=>pc&&toggleRankCell(ek)} title={pcell.dnc?"DNC — absent from this competition (entries+1)":"Tap for race detail"}
                            style={{border:"1px solid "+(open?"var(--accent)":"transparent"),background:open?"var(--sky)":"transparent",color:pcell.dnc?"var(--mut)":"var(--navy)",borderRadius:6,padding:"3px 8px",fontWeight:600,cursor:pc?"pointer":"default",fontSize:13,fontStyle:pcell.dnc?"italic":"normal"}}>{shown}{pcell.dnc?" DNC":""}</button>
                        </td>;
                      })}
                      <td style={{fontWeight:800}}>{r.total}</td>
                    </tr>
                    {expanded.map(c=>{
                      const pc=r.perComp[c.id];
                      return(<tr key={r.key+c.id} style={{background:"#f3f8fd"}}>
                        <td/><td colSpan={3+comps.length} style={{padding:"8px 14px",textAlign:"left"}}>
                          <div style={{fontSize:12.5,color:"var(--navy)"}}>
                            <strong>{c.name}</strong> — finished #{pc.rank??"–"} {pc.sail&&pc.sail!=="—"?`(${pc.sail})`:""}
                            <div style={{marginTop:5,display:"flex",flexWrap:"wrap",gap:6}}>
                              {(pc.races||[]).map((raw,ri)=>{const code=pc.race_codes?.[ri];return<span key={ri} style={{background:"#fff",border:"1px solid var(--line)",borderRadius:6,padding:"2px 7px",fontSize:11.5}}><span style={{color:"var(--mut)"}}>R{ri+1}</span> <span style={{fontWeight:600,color:code?"#c0392b":"var(--navy)"}}>{raw==null?"":String(raw)}{code?` ${code}`:""}</span></span>;})}
                              <span style={{fontWeight:700}}>Net {pc.net}</span>
                            </div>
                          </div>
                        </td>
                      </tr>);
                    })}
                  </React.Fragment>);
                })}
              </tbody>
            </table>
          </div>
        </>}
      </div>
    );
  })()}

  {/* ── PORTAL: Events list ── */}
  {portal&&view.name==="events"&&(
    <ErrorBoundary resetKey={portal+(view.name||"")} fallback={
      <div className="wrap sec" style={{paddingTop:18}}>
        <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
        <div style={{padding:"40px 0",color:"var(--mut)"}}>Couldn't render these results. <button className="btn ghost" style={{marginLeft:8,fontSize:13,padding:"5px 12px"}} onClick={()=>{setEvFilterChips([]);setEvFilter("");goHome();}}>Back home</button></div>
      </div>}>
    <>
      <div className="strip"><div className="wrap">
        <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
        {(()=>{
          // Models render for any portal whose class has a SPORT_MODEL (e.g. the 49er class association).
          const modelCfg=SPORT_MODELS[isClassPortal?portalCls:(host&&host.cls)]||null;
          // Globe for BOTH association/club/federation portals AND class portals.
          const globe=(()=>{
            // Explicit home country → yellow host marker. Class portals never have one.
            const hc=isClassPortal?null:hostLocation(portal,events);
            const hiso=hc?IOC_ISO[String(hc).toUpperCase()]:null;
            // Show the globe whenever there's ANY location to show — the host's own
            // country OR at least one country in its competition footprint. International
            // associations have no home country but do compete somewhere, so they still
            // get a globe (just without the yellow home marker).
            if(!hiso&&Object.keys(hostCountryCounts).length===0) return null;
            return(<div className="hdr-globe" style={{flex:"none",cursor:"pointer",position:"relative"}} title="Where they compete — click to expand" onClick={()=>setHostFootprintOpen(true)}>
              <SailingGlobe countryData={hostCountryCounts} height={150} dark mini bare fill hostIso={hiso}/>
            </div>);
          })();
          // Host logo — read-only display (the upload UI is paused). It stacks ON TOP of the
          // title (left-aligned to the title), so it's a left-hugging, height-capped box on a
          // transparent ground. Its top isn't aligned to anything; the title below it is what
          // bottom-aligns to the globe.
          const logo=host?.logo_url?<HostLogo src={host.logo_url}/>:null;
          // OWNER/role badge — sits above the logo/title stack, left-aligned.
          const badge=(!isClassPortal&&myPortalMembership&&myPortalMembership.verified)?(
            <div style={{marginBottom:8}}>
              <span style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:800,letterSpacing:".05em",textTransform:"uppercase",
                color:"#6b3fa0",background:"rgba(124,77,196,.13)",border:"1px solid rgba(124,77,196,.34)",borderRadius:980,padding:"3px 11px",whiteSpace:"nowrap"}}>
                <BadgeCheck size={12} style={{flex:"none"}}/>{myPortalMembership.role}
              </span>
            </div>
          ):null;
          // Identity row: globe on the LEFT; to its right a bottom-aligned column holding the
          // (badge →) logo → title. flex-end bottom-aligns the column to the globe, and the title
          // carries a marginBottom that lifts its baseline to the globe's visible circle bottom —
          // the SailingGlobe canvas has a ~16px transparent inset below the circle, so aligning the
          // raw boxes would leave the title sitting ~9px low. The logo stacks above the title and
          // can rise past the globe's top freely.
          const identity=(
            <div style={{display:"flex",alignItems:"flex-end",gap:14,minWidth:0}}>
              {globe}
              <div style={{minWidth:0,display:"flex",flexDirection:"column",alignItems:"flex-start"}}>
                {badge}
                {logo}
                <h1 className="page-title" style={{margin:"0 0 9px"}}>{portalName}</h1>
              </div>
            </div>
          );
          const pillbar=(
            <div className="pillbar" style={{marginTop:14}}>
              <div className="pill"><Trophy size={16}/><b>{classEvents.length}</b> competitions</div>
              <div className="pill" style={{cursor:"pointer"}} onClick={()=>go({name:"athletes"})}><Users size={16}/><b>{people.length}</b> athletes</div>
            </div>
          );
          const actionPills=(<>
            <MagneticItem className="portal-pill" onClick={()=>go({name:"athletes"})} strength={0.28}>
              <Users size={14} style={{flex:"none"}}/> Athletes
            </MagneticItem>
            <MagneticItem className="portal-pill" onClick={()=>openCalendar(portal||null)} strength={0.28}>
              <Calendar size={14} style={{flex:"none"}}/> Calendar
            </MagneticItem>
            {fed&&<MagneticItem className="portal-pill" onClick={()=>{pushNav();setPortal(null);setView({name:"ranking"});setQ("");setAthleteSmart(null);window.scrollTo(0,0);}} strength={0.28}>
              <Trophy size={14} style={{flex:"none"}}/> Rankings
            </MagneticItem>}
            {canManageMembers&&!isClassPortal&&<MagneticItem className="portal-pill" onClick={()=>setShowHostEdit(true)} strength={0.28}>
              <Settings size={14} style={{flex:"none"}}/> Edit page
            </MagneticItem>}
            {/* Host auto-grab: entry is the dismissible "We found your organisation"
                banner below (not a header pill) + the Host website field in Edit page. */}
            {/* Host auto-grab: needs-review badge (non-empty queue) */}
            {!isClassPortal&&(canManageMembers||!!myPortalMembership)&&(host?.dossier?.needs_review?.length>0)&&<MagneticItem className="portal-pill" onClick={()=>{setDiscoveryReview(true);setShowDiscovery(true);}} strength={0.28}>
              <span style={{display:"inline-flex",alignItems:"center",gap:6,color:"#8a6400"}}><AlertCircle size={14} style={{flex:"none"}}/> {host.dossier.needs_review.length} need review</span>
            </MagneticItem>}
          </>);
          // No interactive model: buttons return to the RIGHT of the title, on the far right of
          // the page (space-between) and centred against the globe/identity row — as it was before.
          if(!modelCfg) return(
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",flexWrap:"wrap",gap:16}}>
              <div style={{minWidth:0}}>
                {identity}
                {pillbar}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8,alignItems:"stretch",flex:"none",alignSelf:"center"}}>
                {actionPills}
              </div>
            </div>
          );
          // Interactive model present: the model takes the right half, so actions stay stacked
          // below the pillbar in the left header column.
          const head=(
            <div style={{minWidth:0}}>
              {identity}
              {pillbar}
              <div style={{marginTop:14,display:"flex",gap:8,flexWrap:"wrap"}}>{actionPills}</div>
            </div>
          );
          return(
            <div className="spm-classgrid spm-classgrid--host">
              <div className="spm-classhead">{head}</div>
              <SpmDuo cfg={modelCfg}/>
            </div>);
        })()}
      </div></div>
      <div className="wrap sec" style={{paddingTop:0}}>
        {isPendingHostHere&&(
          <div style={{display:"flex",alignItems:"center",gap:12,background:"rgba(255,149,0,.09)",border:"1px solid rgba(255,149,0,.32)",borderRadius:14,padding:"14px 18px",marginBottom:18}}>
            <Clock size={20} color="#c8860a" style={{flex:"none"}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:700,color:"#a85c00",fontSize:14}}>Your club is pending approval</div>
              <div style={{fontSize:13,color:"#a85c00",marginTop:2,lineHeight:1.5}}>
                Thanks for setting up {host?.name}. The AthLink team is reviewing your ownership request — until it's approved you'll browse as a guest. We'll notify you once you're verified.
              </div>
            </div>
          </div>
        )}
        {/* Host auto-grab invitation banner REMOVED: a host's home website is never
            scraped automatically — competitions are found only from sites the host
            pastes into Import a competition → Import result database. */}
        {fed&&(()=>{
          const feAssoc=ASSOCIATIONS.filter(a=>a.scope===fed.scope);
          if(!feAssoc.length) return null;
          return <div style={{marginBottom:22}}>
            <p className="seclabel" style={{marginBottom:8}}><Anchor size={14}/>Associations under {fed.name}</p>
            <div className="classes-grid">
              {feAssoc.map(a=>{
                const ce=events.filter(e=>eventAssocs(e).includes(a.id));
                const col=classColor(a.cls);const short=classLabel(a.cls);
                return <div className="class-card" key={a.id} style={{cursor:"pointer",position:"relative"}} onClick={()=>enterPortal(a.id)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:14,minHeight:24}}>
                    <span style={{display:"inline-block",fontSize:10,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"var(--mut)",border:"1px solid rgba(91,107,128,.5)",borderRadius:980,padding:"3px 10px"}}>Association</span>
                    <span className="cls" style={{background:col}}>{short}</span>
                  </div>
                  <p className="class-name">{a.name}</p>
                  <div className="class-stats" style={{marginBottom:0}}><div><b>{ce.length}</b>competitions</div></div>
                  {a.logo_url&&<img src={a.logo_url} alt="" style={{position:"absolute",right:16,bottom:16,width:60,height:60,objectFit:"contain",pointerEvents:"none",background:"transparent"}}/>}
                </div>;
              })}
            </div>
          </div>;
        })()}
        {evFilterChips.length>0&&(
          <div style={{marginBottom:8,display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
            {evFilterChips.map((c,ci)=>(
              <div className="filter-chip" key={ci}>
                <Sparkles size={11}/>{c.label}
                <button onClick={()=>setEvFilterChips(prev=>prev.filter((_,j)=>j!==ci))}><X size={13}/></button>
              </div>
            ))}
            {evFilterChips.length>1&&(
              <button onClick={()=>setEvFilterChips([])} style={{border:0,background:"none",color:"var(--mut)",fontSize:11.5,cursor:"pointer",textDecoration:"underline"}}>Clear all</button>
            )}
          </div>
        )}
        <div style={{marginBottom:12,display:"flex",gap:10,alignItems:"stretch"}}>
          <div className="ai-srch-wrap" style={{flex:1,minWidth:0}}>
            <div className="ai-srch">
              <Sparkles size={13} color={evFilterLoading?"#0d8ecf":"#9fb2c8"}/>
              <input
                placeholder="Smart filter — e.g. more than 30 boats, or Emily Polson"
                value={evFilter}
                onChange={e=>{
                  setEvFilter(e.target.value);
                  clearTimeout(evSugTimer);
                  setEvSugTimer(setTimeout(()=>fetchEvSuggestions(e.target.value),200));
                }}
                onKeyDown={e=>{
                  if(e.key==="Enter"){setEvSuggestions([]);runEvFilter();}
                  if(e.key==="Escape"){setEvFilter("");setEvSuggestions([]);}
                }}
                onFocus={()=>{if(evFilter.length>=3)fetchEvSuggestions(evFilter);}}
              />
              {evFilterLoading&&<Loader2 size={13} className="spin" color="#0d8ecf"/>}
              {evFilter&&<button style={{border:0,background:"none",cursor:"pointer",color:"#9fb2c8",padding:0,display:"flex"}} onClick={()=>{setEvFilter("");setEvSuggestions([]);}}><X size={13}/></button>}
            </div>
            {evSuggestions.length>0&&(<>
              <div style={{position:"fixed",inset:0,zIndex:1}} onClick={()=>setEvSuggestions([])}/>
              <div className="sug-drop" style={{zIndex:2}}>
                {evSuggestions.map((s,i)=>(
                  <div key={i} className="sug-item" onClick={()=>{setEvFilter(s);setEvSuggestions([]);setTimeout(runEvFilter,50);}}>
                    <Sparkles size={11} color="#0d8ecf"/>{s}
                  </div>
                ))}
              </div>
            </>)}
          </div>
          {canEdit&&<button className="btn cta liquidGlass-wrapper" style={{whiteSpace:"nowrap",flex:"none"}} onClick={openImport}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Upload size={16}/>Import a competition</div></button>}
        </div>
        {(()=>{
          const allFiltered=(evFilterChips.length
            ?classEvents.filter(ev=>evFilterChips.every(c=>{try{return c.fn(ev,scoreEvent);}catch{return true;}}))
            :classEvents)
            .slice().sort((a,b)=>{
              const da=a.date?.split('/').reverse().join('')||'';
              const db=b.date?.split('/').reverse().join('')||'';
              return db.localeCompare(da);
            });
          // Hosts pin whole competitions to the top of their list (never on the
          // dormant class-portal filter view).
          const canPin=canManageMembers&&!isClassPortal;
          const togglePin=togglePinFor("host",portal,portalPins,setPortalPins);
          const pinIdxOf=ev=>isClassPortal?-1:portalPins.findIndex(p=>String(p.event_id)===String(ev.id));
          const pinnedEvs=allFiltered.filter(ev=>ev.status!=="Draft"&&pinIdxOf(ev)>=0).sort((a,b)=>pinIdxOf(a)-pinIdxOf(b));
          const rest=allFiltered.filter(ev=>!pinnedEvs.includes(ev));
          const renderEvRow=(ev,i,pinned)=>{
            const s=scoreEvent(ev);const isDraft=ev.status==="Draft";
            const pi=pinned?pinIdxOf(ev):-1;
            return(<div className={`ev${isDraft?" draft":""}`} key={(pinned?"pin":"")+ev.id} style={{animationDelay:`${i*60}ms`,position:"relative"}} onClick={()=>go({name:"event",id:ev.id})}
              draggable={pinned&&canPin||undefined}
              onDragStart={pinned&&canPin?()=>setPinDrag(pi):undefined}
              onDragOver={pinned&&canPin?e=>{e.preventDefault();if(pinDrag!=null&&pinDrag!==pi){movePinLocal(setPortalPins,pinDrag,pi);setPinDrag(pi);}}:undefined}
              onDragEnd={pinned&&canPin?()=>{commitPinOrder(portalPins,setPortalPins);setPinDrag(null);}:undefined}>
              {pinned&&<span className="pinbadge" title="Pinned result"><Pin size={11} fill="currentColor"/></span>}
              {pinned&&canPin&&<span className="pingrip" title="Drag to reorder"><GripVertical size={15}/></span>}
{(()=>{
                const dp=ev.date?.split('/');
                const hasDate=dp&&dp.length===3&&dp[0]&&dp[2];
                return(<div style={{display:"flex",alignItems:"center",gap:6}}>
                  {hasDate&&<div className="evicon-year">
                    {dp[2].split('').map((ch,ci)=><span key={ci}>{ch}</span>)}
                  </div>}
                  {hasDate
                    ?<div className="evicon-date">
                        <span className="eid">{dp[0]}</span>
                        <span className="eim">{MON[parseInt(dp[1])-1]||""}</span>
                      </div>
                    :<div className="evicon"><Anchor size={20}/></div>}
                </div>);
              })()}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
                  <p className="evname" style={{margin:0}}>{ev.name}</p>
                  {canPin&&!isDraft&&(
                    <button type="button" className={"pinbtn"+(pinned?" on":"")} title={pinned?"Unpin":"Pin to the top"}
                      onClick={e=>{e.stopPropagation();togglePin({event_id:ev.id,snapshot:{evName:ev.name,evDate:ev.date,cls:ev.cls,subclass:ev.subclass,rank:null,fleet:(ev.entries||[]).length,venue:ev.country||null}});}}>
                      <Pin size={13} fill={pinned?"currentColor":"none"}/>
                    </button>
                  )}
                </div>
                <div className="evmeta">
                  <span><MapPin size={13}/>{ev.country?<CountryTag code={ev.country}/>:"—"}</span>
                  <span className="ev-cal"><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--link)",fontWeight:600}} title="Open calendar" onClick={()=>openCalendarAt(ev.date)}>{formatDate(ev.date)}</span></span>
                  <span className="ev-count"><Users size={13}/>{isUpcomingEvent(ev)?`${s.fleet} entered`:`${s.fleet} boats · ${s.races} races`}{s.countries>0?` · ${s.countries} countr${s.countries===1?"y":"ies"}`:""}</span>
                </div>
              </div>
              {isScout&&!isDraft&&<SaveButton size="sm" owner={scoutOwnerId(auth)} events={events} kind={isUpcomingEvent(ev)?"upcoming":"event"} eventId={ev.id} title={ev.name}
                snapshot={{evName:ev.name,evDate:ev.date,cls:ev.cls}} onRequireAuth={()=>setShowSignIn(true)}/>}
              {!isDraft&&isUpcomingEvent(ev)&&<span className="cls" style={{background:"rgba(232,146,26,.15)",color:"#b8860b",boxShadow:"inset 0 0 0 1px rgba(232,146,26,.4)"}} title="Entry list published — results pending. Open for the fleet forecast.">UPCOMING</span>}
              {isDraft&&<span className="draftbadge"><Clock size={11}/> Draft</span>}
              {(()=>{const n=nuggetFor(ev.cls,ev.subclass);return <span className="cls" style={{background:n.color}}>{n.label}</span>;})()}
              {canEdit&&<button className="delbtn" onClick={e=>deleteEvent(ev.id,ev.name,e)}><Trash2 size={16}/></button>}
              <ChevronRight size={18} color="#9fb2c8"/>
            </div>);
          };
          // Build the remaining items with year dividers
          const evItems=[];let lastYear=null;
          rest.forEach((ev,i)=>{
            const yr=ev.date?.split('/')?.[2]||null;
            if(yr&&yr!==lastYear){evItems.push({type:'divider',year:yr});lastYear=yr;}
            evItems.push({type:'ev',ev,i});
          });
          const filtered=allFiltered;
          return(<>
            {pinnedEvs.length>0&&(
              <div key="pinhead" style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0 8px"}}>
                <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700,color:"var(--accent)",letterSpacing:".1em",fontFamily:"'Barlow',sans-serif"}}><Pin size={12} fill="currentColor"/>PINNED</span>
                <div style={{flex:1,height:1,background:"var(--line)"}}/>
              </div>
            )}
            {pinnedEvs.map((ev,i)=>renderEvRow(ev,i,true))}
            {evItems.map((item,idx)=>{
              if(item.type==='divider') return(
                <div key={"yr"+item.year} style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0 8px"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"var(--mut)",letterSpacing:".1em",fontFamily:"'Barlow',sans-serif"}}>{item.year}</span>
                  <div style={{flex:1,height:1,background:"var(--line)"}}/>
                </div>
              );
              return renderEvRow(item.ev,item.i,false);
            })}
            {filtered.length===0&&classEvents.length>0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No results match {evFilterChips.length>1?"these filters":"this filter"}. <button style={{border:0,background:"none",color:"var(--accent)",cursor:"pointer",fontWeight:600}} onClick={()=>{setEvFilterChips([]);setEvFilter("");}}>Clear {evFilterChips.length>1?"filters":"filter"}</button></p>}
            {classEvents.length===0&&<p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>No competitions yet. Import one to get started.</p>}
          </>);
        })()}
      </div>
    </>
    </ErrorBoundary>
  )}

  {/* ── PORTAL: Event detail ── */}
  {view.name==="event"&&(()=>{
    // NOTE: not gated on `portal` — events are viewable globally (deep link,
    // refresh, or Back from an athlete profile all arrive with portal=null).
    const ev=events.find(e=>e.id===view.id);
    const notFound=(msg)=>(<div className="wrap sec" style={{paddingTop:18}}>
      <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
      <div style={{padding:"40px 0",color:"var(--mut)"}}>{msg} <button className="btn ghost" style={{marginLeft:8,fontSize:13,padding:"5px 12px"}} onClick={()=>go({name:"events"})}>Back to competitions</button></div>
    </div>);
    if(!ev) return notFound("This competition couldn't be found — it may have just been updated or removed.");
    let s=null;try{s=scoreEvent(ev);}catch(err){console.error("event page: scoreEvent failed",err);}
    if(!s) return notFound("Couldn't read this competition's scores.");
    const isDraft=ev.status==="Draft";
    // Published entry list, nothing sailed yet → the page shows the public entry
    // list AS a prediction ranking (FleetForecast) instead of a results table.
    const isUpcoming=!isDraft&&s.races===0&&(ev.entries||[]).length>0;
    return(<ErrorBoundary resetKey={ev.id} fallback={
      <div className="wrap sec" style={{paddingTop:18}}>
        <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
        <div style={{padding:"40px 0",color:"var(--mut)"}}>Couldn't render this competition. <button className="btn ghost" style={{marginLeft:8,fontSize:13,padding:"5px 12px"}} onClick={()=>go({name:"events"})}>Go back</button></div>
      </div>}>
      <div className="wrap sec" style={{paddingTop:18}}>
      <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
      {isDraft&&(
        <div className="draft-banner">
          <Clock size={22} color="#e8921a"/>
          <div style={{flex:1}}>
            <strong>Draft results — not yet official</strong>
            <p style={{fontSize:13}}>These results are provisional and excluded from athlete profiles until confirmed.</p>
          </div>
          <button className="btn green" disabled={busyAction==="confirmDraft_"+ev.id} onClick={()=>runBusy("confirmDraft_"+ev.id,()=>confirmDraft(ev.id))}>{busyAction==="confirmDraft_"+ev.id?<Loader2 size={16} className="spin"/>:<CheckCircle size={16}/>}Confirm Results</button>
        </div>
      )}
      {(()=>{
        const hostIso=IOC_ISO[ev.country]||(ev.country&&ev.country.length===2?ev.country.toUpperCase():"");
        const head=(
        <div style={{display:"flex",alignItems:"stretch",gap:16,marginBottom:16}}>
          {hostIso&&(
            <div onClick={()=>setRegattaFootprint(ev)} title="Who's racing — click to expand"
              style={{width:118,flex:"none",cursor:"pointer",display:"flex",flexDirection:"column",justifyContent:"center"}}>
              <SailingGlobe countryData={{[hostIso]:1}} height={118} dark mini bare hostIso={hostIso}/>
            </div>
          )}
          <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",justifyContent:"center"}}>
            <h1 className="page-title" style={{fontSize:26}}>{ev.name}</h1>
            <div className="evmeta" style={{marginTop:8}}>
              <span><MapPin size={13}/>{ev.country?<CountryTag code={ev.country}/>:"—"}</span>
              <span><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--link)",fontWeight:600}} title="Open calendar" onClick={()=>openCalendarAt(ev.date)}>{formatDate(ev.date)}</span></span>
              {(()=>{const n=nuggetFor(ev.cls,ev.subclass);return <span className="cls" style={{background:n.color}}>{n.label}</span>;})()}
            </div>
            {eventAssocs(ev).length>0&&(
              <div style={{marginTop:7,fontSize:12.5,color:"var(--mut)",display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                <Anchor size={12} style={{flex:"none"}}/>
                <span>Organized by {eventAssocs(ev).map((aid,i)=><React.Fragment key={aid}>
                  {i>0&&<span style={{color:"var(--mut)"}}> & </span>}
                  <b style={{color:"var(--link)",fontWeight:600,cursor:"pointer"}} onClick={()=>enterPortal(aid)}>{assocName(aid)}</b>
                </React.Fragment>)}</span>
              </div>
            )}
            {(ev.imported_by||ev.organizer_name||ev.owner_confirmed===false)&&(()=>{
              const contributor=ev.imported_by&&hostById(ev.imported_by)?.name;
              const isMineUnconfirmed=ev.owner===portal&&ev.owner_confirmed===false&&!isClassPortal;
              const verifiedHere=!!myPortalMembership&&myPortalMembership.verified&&!isClassPortal&&hostById(portal);
              const externalByName=!ev.owner&&!!ev.organizer_name;
              const canClaimHere=verifiedHere&&ev.owner!==portal&&(externalByName||ev.owner_confirmed===false);
              const alreadyClaimed=allEventClaims.some(c=>c.event_id===ev.id&&c.host_id===portal&&c.status==="pending");
              return(
              <div style={{marginTop:7,fontSize:11.5,color:"var(--mut)",display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span>
                  {contributor&&<>Contributed by <b style={{fontWeight:600}}>{contributor}</b></>}
                  {ev.organizer_name&&<>{contributor?" · ":""}Organized by <b style={{fontWeight:600}}>{ev.organizer_name}</b> (external)</>}
                  {ev.owner_confirmed===false&&ev.owner&&<>{(contributor||ev.organizer_name)?" · ":""}attributed to <b style={{fontWeight:600}}>{assocName(ev.owner)}</b>, awaiting confirmation</>}
                </span>
                {isMineUnconfirmed&&(
                  <button className="btn green" style={{fontSize:11.5,padding:"4px 10px"}} onClick={async()=>{
                    const patch={owner_confirmed:true};
                    setEvents(p=>p.map(x=>x.id===ev.id?{...x,...patch}:x));
                    try{await sbPatch("events",`id=eq.${ev.id}`,patch);}catch(e){console.error("confirm organizer patch",e);}
                  }}><CheckCircle size={12}/>Confirm {hostById(portal).name} organized this</button>
                )}
                {!isMineUnconfirmed&&canClaimHere&&(alreadyClaimed
                  ? <span style={{fontStyle:"italic"}}>Claim pending review for {hostById(portal).name}.</span>
                  : <button className="btn ghost" style={{fontSize:11.5,padding:"4px 10px"}} onClick={()=>submitEventClaim(ev.id,portal)}><Anchor size={12}/>Claim this event for {hostById(portal).name}</button>)}
              </div>);
            })()}
          </div>
          <div style={{flex:"none",display:"flex",flexDirection:"column",justifyContent:"center",gap:8}}>
            {isScout&&<SaveButton owner={scoutOwnerId(auth)} events={events} kind={isUpcomingEvent(ev)?"upcoming":"event"} eventId={ev.id} title={ev.name}
              snapshot={{evName:ev.name,evDate:ev.date,cls:ev.cls}} onRequireAuth={()=>setShowSignIn(true)}/>}
            {canEdit&&<button className="btn ghost" style={{fontSize:12,padding:"6px 12px",justifyContent:"flex-start"}} onClick={()=>openEditResults(ev)}><Pencil size={13}/>{isUpcoming?"Edit entry list":"Edit results"}</button>}
          </div>
        </div>);
        // Interactive models are scoped to home/association/global-class pages only — not here.
        return head;
      })()}
      {/* Revealable, scout-focused competition summary */}
      <div style={{marginBottom:16}}>
        <button onClick={()=>{const open=!eventSummaryOpen[ev.id];setEventSummaryOpen(m=>({...m,[ev.id]:open}));if(open)fetchEventSummary(ev);}}
          style={{display:"inline-flex",alignItems:"center",gap:7,background:"rgba(10,132,255,.12)",backdropFilter:"blur(18px) saturate(185%)",WebkitBackdropFilter:"blur(18px) saturate(185%)",color:"var(--navy)",border:"0",borderRadius:980,boxShadow:"inset 0 1px 0 rgba(255,255,255,.5)",
            fontSize:12.5,fontWeight:600,fontFamily:"'Barlow',sans-serif",padding:"7px 14px",cursor:"pointer"}}>
          <Sparkles size={14}/>About this competition
          <ChevronRight size={14} style={{transform:eventSummaryOpen[ev.id]?"rotate(90deg)":"none",transition:".15s"}}/>
        </button>
        {eventSummaryOpen[ev.id]&&(
          <div style={{marginTop:10,background:"rgba(17,40,66,0.55)",backdropFilter:"blur(28px) saturate(180%)",WebkitBackdropFilter:"blur(28px) saturate(180%)",borderRadius:16,padding:"14px 16px",boxShadow:"inset 0 1px 0 rgba(255,255,255,.16)",animation:"calFade .26s both"}}>
            <p className="seclabel" style={{color:"#9fbdd9",margin:"0 0 6px",fontSize:11}}><Sparkles size={12}/>Competition overview</p>
            {eventSummaries[ev.id]===null
              ? <div style={{color:"#9fbdd9",fontSize:13,fontStyle:"italic",opacity:.75,display:"flex",alignItems:"center",gap:6}}><Loader2 size={13} className="spin"/>Researching this competition…</div>
              : eventSummaries[ev.id]
                ? <p style={{color:"#dce8f8",fontSize:13.5,lineHeight:1.55,margin:0}}>{eventSummaries[ev.id]}</p>
                : <p style={{color:"#9fbdd9",fontSize:13,fontStyle:"italic",margin:0}}>Add ANTHROPIC_API_KEY to Vercel env vars to enable AI summaries.</p>}
            <p style={{color:"#6f93b8",fontSize:10.5,margin:"9px 0 0",fontStyle:"italic"}}>AI-generated from the competition's level and fleet; verify specifics independently.</p>
          </div>
        )}
      </div>
      {isUpcoming&&(<>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:14,
          background:"rgba(232,146,26,.09)",borderRadius:14,padding:"10px 14px",boxShadow:"inset 0 0 0 1px rgba(232,146,26,.28)"}}>
          <Clock size={16} color="#b8860b" style={{flex:"none"}}/>
          <span style={{fontSize:12,fontWeight:800,letterSpacing:".06em",textTransform:"uppercase",color:"#b8860b"}}>Upcoming competition</span>
          <span style={{fontSize:13,color:"var(--mut)"}}>{ev.entries.length} entered · no results yet — the table below is a forecast ranking from current skill ratings.</span>
        </div>
        <FleetForecast ev={ev} events={events}
          onPick={n=>go({name:"profile",id:n,fromEvent:ev.id})}
          boatCell={r=>(
            <div className="boat">
              {r.crew
                ? <div style={{position:"relative",width:48,height:30,flex:"none"}}>
                    {(()=>{const cp=athleteProfileOf(r.crew)?.photo_url;return cp
                      ? <img className="av" src={cp} alt="" style={{position:"absolute",left:18,top:0,objectFit:"cover",boxShadow:"0 0 0 2px #fff"}}/>
                      : <div className="av" style={{position:"absolute",left:18,top:0,background:avatarColor(r.crew),boxShadow:"0 0 0 2px #fff"}}>{initials(r.crew)}</div>;})()}
                    {(()=>{const hp=athleteProfileOf(r.helm)?.photo_url;return hp
                      ? <img className="av" src={hp} alt="" style={{position:"absolute",left:0,top:0,zIndex:2,objectFit:"cover",boxShadow:"0 0 0 2px #fff"}}/>
                      : <div className="av" style={{position:"absolute",left:0,top:0,zIndex:2,background:avatarColor(r.helm),boxShadow:"0 0 0 2px #fff"}}>{initials(r.helm)}</div>;})()}
                  </div>
                : (()=>{const hp=athleteProfileOf(r.helm)?.photo_url;return hp
                    ? <img className="av" src={hp} alt="" style={{objectFit:"cover"}}/>
                    : <div className="av" style={{background:avatarColor(r.helm)}}>{initials(r.helm)}</div>;})()}
              <div>
                <div className="namelink" onClick={()=>go({name:"profile",id:r.helm,fromEvent:ev.id})}>{r.helm}</div>
                {r.crew&&<div className="cn">with <span className="namelink" onClick={()=>go({name:"profile",id:r.crew,fromEvent:ev.id})}>{r.crew}</span></div>}
              </div>
            </div>
          )}/>
      </>)}
      {!isUpcoming&&(<>
      <div className="panel"><table>
        <thead><tr>
          <th>Pos</th><th className="l">Boat</th><th aria-label="Gender / Division"></th><th className="l">Sail #</th>
          {Array.from({length:s.races}).map((_,i)=><th key={i}>R{i+1}</th>)}
          <th>Net</th><th aria-label="Save"></th>
        </tr></thead>
        <tbody>{s.rows.map(r=>(
          <React.Fragment key={r.sail+r.helm}>
          <tr className={hoverRow?.evId===ev.id&&hoverRow?.helm===r.helm?"row-hover":""}
            onMouseEnter={e=>{
              const rect=e.currentTarget.getBoundingClientRect();
              setHoverRow({evId:ev.id,helm:r.helm,crew:r.crew||null,y:rect.top+rect.height/2});
              const ag=aggregate(r.helm,events);
              fetchHoverSummary(r.helm,ag,r.crew||null);
            }}
            onMouseLeave={()=>setHoverRow(null)}>
            <td className={`rk ${r.rank<=3?"p"+r.rank:""}`}>{r.rank}</td>
            <td className="l"><div className="boat">
              {ev.doublehanded&&r.crew
                ? <div style={{position:"relative",width:48,height:30,flex:"none"}}>
                    {(()=>{const cp=athleteProfileOf(r.crew)?.photo_url;return cp
                      ? <img className="av" src={cp} alt="" style={{position:"absolute",left:18,top:0,objectFit:"cover",boxShadow:"0 0 0 2px #fff"}}/>
                      : <div className="av" style={{position:"absolute",left:18,top:0,background:avatarColor(r.crew),boxShadow:"0 0 0 2px #fff"}}>{initials(r.crew)}</div>;})()}
                    {(()=>{const hp=athleteProfileOf(r.helm)?.photo_url;return hp
                      ? <img className="av" src={hp} alt="" style={{position:"absolute",left:0,top:0,zIndex:2,objectFit:"cover",boxShadow:"0 0 0 2px #fff"}}/>
                      : <div className="av" style={{position:"absolute",left:0,top:0,zIndex:2,background:avatarColor(r.helm),boxShadow:"0 0 0 2px #fff"}}>{initials(r.helm)}</div>;})()}
                  </div>
                : (()=>{const hp=athleteProfileOf(r.helm)?.photo_url;return hp
                    ? <img className="av" src={hp} alt="" style={{objectFit:"cover"}}/>
                    : <div className="av" style={{background:avatarColor(r.helm)}}>{initials(r.helm)}</div>;})()}
              <div>
                <div className="namelink" onClick={()=>go({name:"profile",id:r.helm,fromEvent:ev.id})}>{r.helm}</div>
                {r.crew&&<div className="cn">with <span className="namelink" onClick={()=>go({name:"profile",id:r.crew,fromEvent:ev.id})}>{r.crew}</span></div>}
              </div>
            </div></td>
            <td style={{textAlign:"center",whiteSpace:"nowrap"}}><ResultNuggets entry={r} doublehanded={!!ev.doublehanded}/></td>
            <td className="l sailcol">{r.nat?<>{iocFlag(r.nat)} {r.nat} {r.sail}</>:r.sail}</td>
            {Array.from({length:s.races}).map((_,i)=>{
              const c=r.races[i];
              if(c===undefined) return<td key={i} className="disc">–</td>;
              const codeLabel=r.race_codes?.[i]||null;
              const displayNum=isCode(c)?c:r.discardSet.has(i)?`(${c})`:c;
              return<td key={i} className={isCode(c)?"code":r.discardSet.has(i)?"disc":""}>
                {codeLabel&&!isCode(c)
                  ?<div className="scorecell"><span className="snum">{displayNum}</span><span className="scode">{codeLabel}</span></div>
                  :displayNum}
              </td>;
            })}
            <td className="net">{r.net}</td>
            <td style={{textAlign:"center",whiteSpace:"nowrap"}}>{isScout&&<SaveButton size="sm" owner={scoutOwnerId(auth)} events={events} kind="result"
              athleteKey={canonName(r.helm)} eventId={ev.id} entryId={r._dbId} title={r.helm}
              snapshot={{evName:ev.name,evDate:ev.date,cls:ev.cls,rank:r.rank,fleet:s.fleet,athlete:r.helm}} onRequireAuth={()=>setShowSignIn(true)}/>}</td>
          </tr>
          </React.Fragment>
        ))}</tbody>
      </table></div>
      <p style={{fontSize:12,color:"var(--mut)",marginTop:12,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><span>( ) = discard · red = penalty code</span></p>
      {hoverRow?.evId===ev.id&&(()=>{
        const k=hoverRow.crew?`${hoverRow.helm}+${hoverRow.crew}`:hoverRow.helm;
        const v=hoverSummaries[hoverRow.helm]??hoverSummaries[k];
        const topPx=Math.min(Math.max((hoverRow.y||0)+14,80),window.innerHeight-120);
        return(
          <div className={`row-ai-tooltip${v===null?" loading":""}`}
            style={{top:topPx}}>
            <Sparkles size={14} style={{flex:"none",marginTop:2,color:"var(--accent)"}}/>
            <span>{v===null?"Generating scout summary…":(v===undefined||v==="")?"AI summary unavailable.":v}</span>
          </div>
        );
      })()}
      </>)}
    </div></ErrorBoundary>);
  })()}

  {/* ── ATHLETES (portal + global) ── */}
  {(portal||(!portal&&(view.name==="athletes"||view.name==="profile")))&&view.name==="athletes"&&(
    <div className="wrap sec" style={{paddingTop:16}}>
      <div className="page-head">
        {/* Back only inside a host portal (drill-down); the global Athletes page is
            top-level and gets no Back, matching Hosts/Competitions. */}
        {portal&&<button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>}
        <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",width:"100%"}}>
          <h1 className="page-title">{athleteTitle} <span style={{fontSize:18,fontWeight:400,color:"var(--mut)"}}>{lensPeople.length}</span></h1>
          {portal&&<button className="portal-pill" style={{marginLeft:"auto"}} onClick={()=>{setPortal(null);go({name:"athletes"});}}>
            <Users size={14} style={{flex:"none"}}/>All Athletes</button>}
        </div>
        <p className="page-sub">One profile per athlete, built automatically from results.</p>
      </div>
      <div className="toolbar">
        <div className="srch" style={{position:"relative"}}>
          {athleteSmartLoading?<Loader2 size={16} className="spin" color="#0d8ecf"/>:<Search size={16} color="#9fb2c8"/>}
          <input placeholder="Search athletes — name, country, or e.g. top 15 in the world championships"
            value={q} onChange={e=>setQ(e.target.value)}
            onKeyDown={e=>{
              if(e.key==="Enter"&&q.trim()) runAthleteSmart(q,currentPeople,isGlobal?events:classEvents);
              if(e.key==="Escape"){setQ("");setAthleteSmart(null);}
            }}/>
          {(q||athleteSmart)&&<button style={{border:0,background:"none",cursor:"pointer",color:"#9fb2c8",padding:0,display:"flex"}} onClick={()=>{setQ("");setAthleteSmart(null);}}><X size={15}/></button>}
        </div>
        <div className="seg">{(()=>{
          // Associations always see both tabs (so you can toggle back to All even
          // after clearing every duplicate). Non-association users see no tabs.
          const tabs=canEdit?["all","duplicates"]:["all"];
          if(tabs.length<2) return null;
          return tabs.map(f=>(
            <button key={f} className={filter===f?"on":""} onClick={()=>setFilter(f)}>
              <span style={{display:"flex",flexDirection:"column",alignItems:"center",lineHeight:1.15}}>
                <span>{f[0].toUpperCase()+f.slice(1)}</span>
                <span style={{fontSize:9.5,fontWeight:600,opacity:.45,marginTop:1}}>{f==="duplicates"?(filter==="duplicates"?visibleDupGroups.length:"·"):lensPeople.length}</span>
              </span>
            </button>
          ));
        })()}</div>
        {canEdit&&filter==="duplicates"&&visibleDupGroups.length>0&&(
          <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"7px 13px",whiteSpace:"nowrap"}} onClick={()=>{
            const keys=visibleDupGroups.map(g=>g.key);
            visibleDupGroups.forEach(g=>mergeGroup(g.names));
            setDismissedDups2(prev=>{const s=new Set(prev);keys.forEach(k=>s.add(k));return s;});
            saveDupDismissals(keys);
          }}>
            <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Users size={14}/>Merge all</div>
          </button>
        )}
      </div>
      {/* Lenses — class chips + country + host (mirrors the Athletes nav menu) */}
      {isGlobal&&(()=>{
        const clsSets={};
        events.forEach(ev=>{if(ev.status==="Draft"||!ev.cls)return;const s2=clsSets[ev.cls]||(clsSets[ev.cls]=new Set());(ev.entries||[]).forEach(e=>{if(e.helm)s2.add(canonName(e.helm));if(e.crew)s2.add(canonName(e.crew));});});
        const customIds=Object.keys(clsSets).filter(id=>!CLASSES.some(c=>c.id===id));
        const chipDefs=[...CLASSES.map(c=>({id:c.id,label:c.short})),...customIds.map(id=>({id,label:classLabel(id)}))];
        const natSet=new Set();cardStats.forEach(v=>{if(v.nat)natSet.add(v.nat);});
        const natList=[...natSet].sort((x,y)=>(GLOBE_NAMES[IOC_ISO[x]]||x).localeCompare(GLOBE_NAMES[IOC_ISO[y]]||y));
        return(
        <div className="strip-chips" style={{margin:"0 0 14px"}}>
          <button className={`lens-chip${!athCls?" on":""}`} onClick={()=>setView(v=>({...v,cls:undefined}))}>All</button>
          {chipDefs.map(c=>{
            const n=clsSets[c.id]?clsSets[c.id].size:0;
            if(!n) return null;
            return(
            <button key={c.id} className={`lens-chip${athCls===c.id?" on":""}`} onClick={()=>setView(v=>({...v,cls:v.cls===c.id?undefined:c.id}))}>
              <span className="dot" style={{background:nuggetFor(c.id).color}}/>{c.label}<span className="cnt">{n}</span>
            </button>);
          })}
          <span className="strip-break"/>{/* selects onto row 2 (Fix 9b) */}
          <span className="lens-selwrap">
            <select className="lens-select" value={athCountry||""} onChange={e=>setView(v=>({...v,country:e.target.value||undefined}))}>
              <option value="">All countries</option>
              {natList.map(cc=>(<option key={cc} value={cc}>{iocFlag(cc)} {GLOBE_NAMES[IOC_ISO[cc]]||cc}</option>))}
            </select>
            <ChevronRight size={13} className="lens-selchev"/>
          </span>
          <span className="lens-selwrap">
            <select className="lens-select" value="" onChange={e=>{if(e.target.value)enterPortalAthletes(e.target.value);}}>
              <option value="">By host…</option>
              {navHosts.map(h=>(<option key={h.id} value={h.id}>{h.name}</option>))}
            </select>
            <ChevronRight size={13} className="lens-selchev"/>
          </span>
        </div>);
      })()}
      {athleteSmart&&(
        <div className="filter-chip" style={{marginBottom:14}}>
          <Sparkles size={11}/>{athleteSmart.label}
          <button onClick={()=>{setAthleteSmart(null);setQ("");}}><X size={13}/></button>
        </div>
      )}
      {filter==="duplicates"&&canEdit&&(
        <div>
          {/* Manual merge — pick ANY two profiles the auto-detector didn't flag. */}
          <div style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:14,padding:16,marginBottom:18}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <Users size={15} color="var(--accent)"/><b style={{fontSize:14}}>Manual merge</b>
            </div>
            <p style={{fontSize:12.5,color:"var(--mut)",margin:"0 0 12px"}}>Same person but not auto-flagged? Pick both profiles below. The first is kept; the second's results move into it.</p>
            <div style={{display:"flex",alignItems:"flex-end",gap:10,flexWrap:"wrap"}}>
              {["a","b"].map(slot=>{
                const val=slot==="a"?mmA:mmB;
                return(
                  <div key={slot} style={{flex:1,minWidth:190,position:"relative"}}>
                    <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:"var(--mut)",marginBottom:4}}>{slot==="a"?"Keep (primary)":"Merge in"}</div>
                    {val
                      ? <div style={{display:"flex",alignItems:"center",gap:8,background:"var(--sky)",borderRadius:10,padding:"8px 10px"}}>
                          <div className="av" style={{background:avatarColor(val),width:24,height:24,fontSize:10}}>{initials(val)}</div>
                          <span style={{fontSize:13,fontWeight:600,flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{val}</span>
                          <button className="mp-clear" onClick={()=>slot==="a"?setMmA(null):setMmB(null)}><X size={14}/></button>
                        </div>
                      : <input placeholder="Search athletes…" value={mmActive===slot?mmQ:""}
                          onFocus={()=>{setMmActive(slot);setMmQ("");}}
                          onChange={e=>{setMmActive(slot);setMmQ(e.target.value);}}
                          onBlur={()=>setTimeout(()=>setMmActive(a=>a===slot?null:a),150)}
                          style={{width:"100%",border:"1px solid var(--line)",borderRadius:10,padding:"8px 10px",fontSize:13,outline:"none",background:"var(--card)",color:"var(--ink)"}}/>}
                    {mmActive===slot&&mmQ.trim()&&(
                      <div className="hero-drop" style={{maxHeight:220}}>
                        {(()=>{
                          const dq=mmQ.trim().toLowerCase();
                          const other=slot==="a"?mmB:mmA;
                          const matches=[...new Set(allPeople.map(p=>p.name).filter(Boolean))]
                            .filter(nm=>nm.toLowerCase().includes(dq)&&nm!==other)
                            .sort((x,y)=>regCountFast(y)-regCountFast(x)).slice(0,8);
                          if(!matches.length) return <div className="gsrch-item" style={{cursor:"default"}}><div className="gi-sub">No matches</div></div>;
                          return matches.map(nm=>(
                            <div key={nm} className="gsrch-item" onMouseDown={()=>{slot==="a"?setMmA(nm):setMmB(nm);setMmActive(null);setMmQ("");}}>
                              <div className="av" style={{background:avatarColor(nm),width:26,height:26,fontSize:10}}>{initials(nm)}</div>
                              <div style={{minWidth:0}}><div className="gi-label">{nm}</div><div className="gi-sub">{regCountFast(nm)} competitions</div></div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}
                  </div>
                );
              })}
              <button className="btn cta" disabled={!mmA||!mmB} style={{fontSize:13,padding:"9px 18px",opacity:(!mmA||!mmB)?.5:1,cursor:(!mmA||!mmB)?"not-allowed":"pointer"}}
                onClick={doManualMerge}><Users size={14}/> Merge</button>
            </div>
          </div>
          <p style={{fontSize:13,color:"var(--mut)",marginBottom:16}}>Below: profiles whose names are close but differ in spelling or use a nickname / short form — these need a human check. (Names that differ only by word order, capitals, accents, hyphens or stray punctuation are merged automatically.) Merging keeps the profile with more competitions and moves the other's results into it.</p>
          {(()=>{
            const dq=q.trim().toLowerCase();
            const shown=visibleDupGroups
              .filter(g=>!dq||g.names.some(nm=>nm.toLowerCase().includes(dq)));
            if(!shown.length) return <p style={{color:"var(--mut)",fontSize:14,padding:"20px 0"}}>{dq?"No duplicates match your search.":"No duplicates to review."}</p>;
            const MiniCard=({name,dim})=>{
              const ag=aggregate(name,events);
              const nat=athleteNat(name,events);
              const attrs=ATHLETE_ATTRS.get(canonName(name));
              const nug=attrs?.recentCls?nuggetFor(attrs.recentCls,attrs.recentSub):null;
              const recent=ag.history[0]?.ev;            // most recent competition (history is newest-first)
              const recentYr=recent?.date?.split('/')?.[2]||"";
              return(
                <div className="acard" style={{flex:1,minWidth:0,opacity:dim?.75:1,cursor:"pointer"}} onClick={()=>go({name:"profile",id:name})}>
                  <div className="achead">
                    <div className="av" style={{background:avatarColor(name)}}>{initials(name)}</div>
                    <div style={{minWidth:0,flex:1}}>
                      <div className="acn">{nat?<span style={{fontSize:17}}>{iocFlag(nat)}</span>:null} {name}</div>
                      {nug&&<span className="cls" style={{background:nug.color,fontSize:9.5,padding:"1px 7px",marginTop:3,display:"inline-block"}}>{nug.label}</span>}
                    </div>
                  </div>
                  {recent&&<div style={{fontSize:11,color:"var(--mut)",margin:"0 0 8px",display:"flex",alignItems:"center",gap:5,minWidth:0}}><Trophy size={11} style={{flex:"none"}}/><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{recent.name}{recentYr?` · ${recentYr}`:""}</span></div>}
                  <div className="acstat">
                    <div><b>{ag.events}</b>competitions</div><div><b>{ag.best?"#"+ag.best:"—"}</b>best</div>
                  </div>
                </div>
              );
            };
            return shown.map((g)=>{
              const key=g.key;
              const flipped=flippedDups.has(key);
              const orderedNames=flipped?[...g.names].reverse():g.names;
              const primary=orderedNames[0];
              const other=orderedNames[orderedNames.length-1];
              const exiting=exitingDups.has(key);
              return(
                <div key={key} className={exiting?"dup-card dup-card-exit":"dup-card"}
                  style={{background:"var(--card)",border:"1px solid var(--line)",borderRadius:14,padding:"16px",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
                    <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",
                      color:"#b8860b",background:"#fdf6e3",borderRadius:6,padding:"3px 9px"}}>
                      <AlertCircle size={12}/>Review — {g.kind==="nick"?"nickname / short form":"spelling differs"}
                    </span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                    <MiniCard name={primary}/>
                    <button className="dup-flip" title="Swap merge direction"
                      style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flex:"none",background:"none",border:"none",cursor:"pointer",padding:4}}
                      onClick={()=>setFlippedDups(prev=>{const s=new Set(prev);s.has(key)?s.delete(key):s.add(key);return s;})}>
                      <ArrowLeft size={22} color="var(--accent)"/>
                      <span style={{fontSize:10,color:"var(--mut)",fontWeight:600,whiteSpace:"nowrap"}}>merge into</span>
                    </button>
                    <MiniCard name={other} dim/>
                  </div>
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:14}}>
                    <button className="btn ghost" style={{fontSize:13,padding:"6px 14px"}}
                      onClick={()=>dismissDupCard(key,()=>{setDismissedDups2(prev=>{const s=new Set(prev);s.add(key);return s;});saveDupDismissals([key]);})}>Don't merge</button>
                    <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"6px 14px"}}
                      onClick={()=>dismissDupCard(key,()=>{mergeGroup(orderedNames);setDismissedDups2(prev=>{const s=new Set(prev);s.add(key);return s;});saveDupDismissals([key]);})}>
                      <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><Users size={14}/>Merge</div>
                    </button>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
      {filter!=="duplicates"&&athleteGridContent}
    </div>
  )}

  {/* ── PROFILE ── */}
  {(portal||(!portal&&(view.name==="athletes"||view.name==="profile")))&&view.name==="profile"&&(()=>{
    const name=view.id;
    const p=currentPeople.find(x=>x.name===name)||{name};
    const ag=aggregate(name,events);
    const extras=athleteProfileOf(name);                 // owner-set photo/bio/instagram/nat
    const nat=extras?.nat_override||athleteNat(name,events);
    const birthYear=athleteBirthYear(name,events);
    const age=birthYear?(new Date().getFullYear()-birthYear):null;
    return(<ErrorBoundary resetKey={name} fallback={
      <div className="wrap sec" style={{paddingTop:22}}>
        <button className="back" onClick={navBack}><ArrowLeft size={16}/>Back</button>
        <div style={{padding:"40px 0",color:"var(--mut)"}}>Couldn't render this profile. <button className="btn ghost" style={{marginLeft:8,fontSize:13,padding:"5px 12px"}} onClick={()=>go({name:"athletes"})}>Go back</button></div>
      </div>}>
      <div className="wrap sec" style={{paddingTop:22}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10,flexWrap:"wrap"}}>
        <button className="back" onClick={navBack} style={{marginBottom:0}}><ArrowLeft size={16}/>Back</button>
        {isScout&&<SaveButton owner={scoutOwnerId(auth)} events={events} kind="athlete" athleteKey={canonName(name)} title={name}
          snapshot={{athlete:name}} onRequireAuth={()=>setShowSignIn(true)}/>}
        {!devMode&&(()=>{
          // Claim-my-profile control. Rules: ATHLETE accounts only (scouts,
          // hosts, fans and guests never see any claim affordance — RLS 0017
          // rejects their inserts too), one live claim per user, one approved
          // claim per profile. Any host the athlete competed under can later
          // verify it.
          const lower=(name||"").toLowerCase();
          const uid=auth?.user?.id;
          // Signed out, or not an athlete account → nothing claim-related at all.
          if(!auth||auth?.profile?.role!=="athlete") return null;
          // Multiple people may have PENDING claims on a profile; only one can be approved.
          const approvedOwner=allClaims.find(c=>c.profile_name?.toLowerCase()===lower&&c.status==="approved");
          const myClaimHere=uid?allClaims.find(c=>c.profile_name?.toLowerCase()===lower&&c.user_id===uid&&c.status!=="denied"):null;
          const myClaimAnywhere=uid?allClaims.find(c=>c.user_id===uid&&c.status!=="denied"):null;
          const pill={marginLeft:"auto",display:"inline-flex",alignItems:"center",gap:6,fontSize:12.5,fontWeight:700,padding:"7px 13px",borderRadius:980};
          // Verified owner of THIS profile → no button (the badge by the name says it).
          if(myClaimHere&&myClaimHere.status==="approved") return null;
          // My own pending claim here.
          if(myClaimHere) return <span style={{...pill,background:"rgba(255,149,0,.14)",color:"#a85c00",boxShadow:"inset 0 0 0 .5px rgba(255,149,0,.4)"}}><Clock size={14}/>Claim pending verification</span>;
          // I already hold a live claim (my own profile) → other profiles show
          // no claim affordance whatsoever.
          if(myClaimAnywhere) return null;
          // Someone else is already the verified owner → can't claim.
          if(approvedOwner) return <span style={{...pill,background:"var(--grouped)",color:"var(--mut)"}} title="This profile already has a verified owner."><BadgeCheck size={14}/>Claimed</span>;
          return <button className="btn cta liquidGlass-wrapper" style={{marginLeft:"auto"}} onClick={()=>submitClaim(name)}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text"><BadgeCheck size={15}/>Claim my profile</div></button>;
        })()}
        {isProfileOwner(name)&&<button className="btn ghost" style={{marginLeft:"auto",fontSize:12.5,padding:"7px 13px"}} onClick={()=>setShowAthEdit(name)}><Pencil size={13}/>Edit profile</button>}
      </div>
      {(()=>{
        // compute footprint + overview once, used by both the globe (right) and the strip (below)
        // ── Shared year selection: one set of nuggets drives Globe · Web · Progress ──
        const yearOfRow=h=>{const dk=dateKey(h.ev.date);return dk?+dk.slice(0,4):null;};
        const careerYears=[...new Set(ag.history.map(yearOfRow).filter(y=>y!=null))].sort((a,b)=>a-b);
        const hasYears=careerYears.length>0;
        // yearSel is keyed by athlete; a stale selection from another profile falls back to all years.
        const selSet=(yearSel&&yearSel.key===name&&yearSel.years&&yearSel.years.length)?new Set(yearSel.years):null;
        const isAllYears=!selSet||careerYears.every(y=>selSet.has(y));
        const selYears=isAllYears?null:[...selSet].sort((a,b)=>a-b);   // null = all years
        const yrKey=selYears?selYears.join(","):"";                    // stable memo key for children
        const inWindow=h=>{if(!selSet)return true;const y=yearOfRow(h);return y!=null&&selSet.has(y);};
        // Per-year boat-class breakdown for the nugget rings (class -> #competitions that year).
        const classByYear=new Map();
        ag.history.forEach(h=>{const y=yearOfRow(h);if(y==null)return;const cls=h.ev.cls||"__none";let m=classByYear.get(y);if(!m){m=new Map();classByYear.set(y,m);}m.set(cls,(m.get(cls)||0)+1);});
        // Toggle handlers: click a year to isolate it, click more to add, "All" resets.
        const pickYear=y=>setYearSel(prev=>{
          const cur=(prev&&prev.key===name&&prev.years)?new Set(prev.years):null;
          let next;
          if(!cur)next=[y];                                            // isolate from "all"
          else if(cur.has(y)){cur.delete(y);next=cur.size?[...cur]:null;} // remove; empty → all
          else{cur.add(y);next=[...cur];}
          return next?{key:name,years:next.sort((a,b)=>a-b)}:null;
        });
        const pickAll=()=>setYearSel(null);
        // Globe footprint. countryCountsAll = whole career (drives the always-all-years
        // mini globe on the profile); countryCounts = year-selection-filtered (drives the
        // popup globe, whose YearNuggets are the ONLY year filter now — Fix 9a).
        const countryCounts={};
        const countryCountsAll={};
        let hasFootprintAll=false;
        ag.history.forEach(h=>{
          const country=h.ev.country; if(!country)return;
          const iso=IOC_ISO[country]; if(!iso)return;
          hasFootprintAll=true;
          countryCountsAll[iso]=(countryCountsAll[iso]||0)+1;
          if(!inWindow(h))return;
          countryCounts[iso]=(countryCounts[iso]||0)+1;
        });
        const hasFootprint=hasFootprintAll;   // frame shows whenever the athlete has ANY footprint ever
        if(ag.events>0&&profileSummaries[name]===undefined) fetchFullProfileSummary(name,ag);
        const summary=profileSummaries[name];
        return(<>
          <div className="phead">
            <div style={{display:"flex",gap:20,alignItems:"flex-start",flex:1,minWidth:260}}>
              {/* Left column: photo (50% bigger), then a compact Calendar and Instagram beneath it */}
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:9,flex:"none"}}>
                {extras?.photo_url
                  ? <img className="av" src={extras.photo_url} alt={name} style={{width:111,height:111,objectFit:"cover"}}/>
                  : <div className="av" style={{background:avatarColor(name),width:111,height:111,fontSize:38}}>{initials(name)}</div>}
                <button style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,width:111,padding:"7px 0",fontSize:12,fontWeight:700,letterSpacing:".02em",marginTop:14,
                  borderRadius:980,cursor:"pointer",transition:"all .2s ease",
                  border:"1px solid rgba(120,160,210,.3)",boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)",
                  background:"rgba(120,160,210,.16)",color:"#cfe0f2"}} onClick={()=>{setSailorCalName(name);setSailorCalClsSet(new Set());setShowSailorCal(true);}}>
                  <Calendar size={13} style={{flex:"none"}}/>Calendar
                </button>
                {((extras?.media?.length>0)||isProfileOwner(name))&&<button style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,width:111,padding:"7px 0",fontSize:12,fontWeight:700,letterSpacing:".02em",
                  borderRadius:980,cursor:"pointer",transition:"all .2s ease",
                  border:"1px solid rgba(120,160,210,.3)",boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)",
                  background:"rgba(120,160,210,.16)",color:"#cfe0f2"}} onClick={()=>setShowMedia(name)}>
                  <LayoutGrid size={13} style={{flex:"none"}}/>Media{extras?.media?.length>0?` (${extras.media.length})`:""}
                </button>}
                {extras?.instagram_url&&<a href={extras.instagram_url} target="_blank" rel="noopener noreferrer" style={{display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6,width:111,padding:"7px 0",fontSize:12,fontWeight:700,letterSpacing:".02em",
                  borderRadius:980,cursor:"pointer",transition:"all .2s ease",textDecoration:"none",
                  border:"1px solid rgba(120,160,210,.3)",boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)",
                  background:"rgba(120,160,210,.16)",color:"#cfe0f2"}}>
                  <Instagram size={13} style={{flex:"none"}}/>Instagram
                </a>}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <h1 className="pname disp" style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{display:"inline-flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                    {nat&&<span className="pflag">{iocFlag(nat)}</span>}{name}
                    {profileVerified(name)&&<VerifyBadge verified size={20} title="Verified athlete — claimed & vouched"/>}
                  </span>
                </h1>
                <div className="pmeta">
                  {(()=>{
                    const attrs=ATHLETE_ATTRS.get(canonName(name));
                    const rc=attrs?.recentCls; const rs=attrs?.recentSub;
                    const nug=rc?nuggetFor(rc,rs):(p.cls?nuggetFor(p.cls,null):null);
                    const g=attrs?.gender;
                    return(<>
                      {nug?<span><span className="cls" style={{background:nug.color,fontSize:10.5,padding:"2px 9px"}}>{nug.label}</span></span>:null}
                      {g&&<span><span style={{background:GENDER_COLOR[g]||"var(--mut)",color:"#fff",borderRadius:980,fontSize:10.5,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:"2px 9px"}} title={g==="Mix"?"Mixed":g==="F"?"Female":"Male"}>{g==="Mix"?"Mixed":g==="F"?"Female":"Male"}</span></span>}
                    </>);
                  })()}
                  {age!=null&&<span style={{fontWeight:600}}>Age {age}</span>}
                  {(()=>{
                    const recent=ag.history[0]?.row;
                    if(!recent?.sail||recent.sail==="—") return null;
                    const sailNat=ag.history[0]?.row?.nat||nat;
                    return<span style={{fontWeight:600}}>{sailNat?<>{sailNat} </>:""}{recent.sail}</span>;
                  })()}
                </div>
                <div className="pstats">
                  <div><div className="v disp">{ag.events}</div><div className="k">Competitions</div></div>
                  <div><div className="v disp">{ag.best?"#"+ag.best:"—"}</div><div className="k">Best result</div></div>
                  <div><div className="v disp">{ag.podiums}</div><div className="k">Podiums</div></div>
                  <div><div className="v disp">{ag.wins}</div><div className="k">Race wins</div></div>
                </div>
                {/* Owner-written bio (verified athlete's own words) */}
                {extras?.bio&&<p style={{color:"#dce8f8",fontSize:13.5,lineHeight:1.55,margin:"16px 0 0",whiteSpace:"pre-wrap"}}>{extras.bio}</p>}
                {/* Athlete overview — directly under the stats, left of the globe */}
                {ag.events>0&&(
                  <div style={{marginTop:16}}>
                    <p className="seclabel" style={{color:"#9fbdd9",margin:"0 0 6px",fontSize:11}}><Sparkles size={12}/>Athlete overview</p>
                    {summary===null
                      ?<div style={{color:"#9fbdd9",fontSize:13,fontStyle:"italic",opacity:.7,display:"flex",alignItems:"center",gap:6}}><Loader2 size={13} className="spin"/>Generating overview…</div>
                      :summary
                        ?<p style={{color:"#dce8f8",fontSize:13.5,lineHeight:1.55,margin:0}}>{summary}</p>
                        :<p style={{color:"#9fbdd9",fontSize:13,fontStyle:"italic",margin:0}}>
                          {profileSummaries[name]===""?"Add ANTHROPIC_API_KEY to Vercel env vars to enable AI overview.":"No data available yet."}
                        </p>}
                  </div>
                )}
              </div>
            </div>

            {/* Footprint globe / Athlete web — toggled, with a shrink/reveal swap */}
            {ag.events>0&&hasFootprint&&(
              <div className="globe-wrap" style={{flex:"0 0 286px",maxWidth:"100%"}}>
                <div style={{display:"flex",gap:4,justifyContent:"center",marginBottom:6}}>
                  {[["footprint","Globe",Globe],["web","Web",WebIcon],["progress","Progress",TrendingUp]].map(([k,lab,Ico])=>(
                    <button key={k} onClick={()=>setProfileTab(k)}
                      style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,letterSpacing:".02em",
                        border:"1px solid rgba(120,160,210,.3)",borderRadius:980,padding:"4px 12px",cursor:"pointer",transition:"all .2s ease",
                        boxShadow:"inset 0 1px 0 rgba(255,255,255,.12)",
                        background:profileTab===k?"rgba(146,180,222,.34)":"rgba(120,160,210,.16)",color:profileTab===k?"#fff":"#cfe0f2"}}>
                      <Ico size={12}/>{lab}
                    </button>
                  ))}
                </div>
                <div style={{position:"relative",height:220,overflow:"hidden"}}>
                  <div onClick={()=>setFootprintOpen(true)} title="Click to expand"
                    style={{position:"absolute",inset:0,cursor:"pointer",transition:"opacity .35s ease,transform .35s ease",
                      opacity:profileTab==="footprint"?1:0,transform:profileTab==="footprint"?"scale(1)":"scale(.82)",
                      pointerEvents:profileTab==="footprint"?"auto":"none"}}>
                    <SailingGlobe countryData={countryCountsAll} height={220} dark bare/>
                    <div className="expand-tip" style={{position:"absolute",top:4,right:6,background:"rgba(8,24,45,.72)",color:"#dcecf8",fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:6,pointerEvents:"none"}}>Click to expand ⤢</div>
                  </div>
                  <div style={{position:"absolute",inset:0,transition:"opacity .35s ease,transform .35s ease",
                      opacity:profileTab==="web"?1:0,transform:profileTab==="web"?"scale(1)":"scale(.82)",
                      pointerEvents:profileTab==="web"?"auto":"none"}}>
                    {profileTab==="web"&&<AthleteWeb name={name} events={events} height={220} dark onOpen={()=>setFootprintOpen(true)} onPick={nm=>go({name:"profile",id:nm})} selYears={null} yrKey=""/>}
                    <div className="expand-tip" style={{position:"absolute",top:4,right:6,background:"rgba(8,24,45,.72)",color:"#dcecf8",fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:6,pointerEvents:"none"}}>Click a node to open ⤢</div>
                  </div>
                  <div onClick={()=>setFootprintOpen(true)} title="Click to expand"
                    style={{position:"absolute",inset:0,cursor:"pointer",transition:"opacity .35s ease,transform .35s ease",
                      opacity:profileTab==="progress"?1:0,transform:profileTab==="progress"?"scale(1)":"scale(.82)",
                      pointerEvents:profileTab==="progress"?"auto":"none"}}>
                    {profileTab==="progress"&&<ProgressChart name={name} events={events} history={ag.history} selYears={null} yrKey="" height={220} w={286} onOpenEvent={id=>go({name:"event",id})}/>}
                    <div className="expand-tip" style={{position:"absolute",top:4,right:6,background:"rgba(8,24,45,.72)",color:"#dcecf8",fontSize:11,fontWeight:600,padding:"3px 8px",borderRadius:6,pointerEvents:"none"}}>Click to expand ⤢</div>
                  </div>
                </div>
                {/* Caption sits below the globe (not over it) so it clears the sphere + glow. */}
                {profileTab==="footprint"&&<div style={{textAlign:"center",fontSize:10,color:"#7fa0c0",marginTop:10}}>Competition footprint</div>}
                {/* Year nuggets live ONLY in the expanded popup now (Fix 9a); the mini
                    displays above always show the entire career. */}
              </div>
            )}
          </div>

          {/* expanded footprint popup */}
          {footprintOpen&&hasFootprint&&(
            <FootprintModal name={name} ag={ag} countryCounts={countryCounts} onClose={()=>{setFootprintOpen(false);setYearSel(null);}} titleSuffix="Competition Footprint"
              initialTab={profileTab==="web"?"web":profileTab==="progress"?"progress":"footprint"}
              years={careerYears} selYears={selYears} yrKey={yrKey} classByYear={classByYear} onPickYear={pickYear} onPickAll={pickAll}
              webProps={{name,events,onPick:nm=>{setFootprintOpen(false);go({name:"profile",id:nm});},onOpenEvent:id=>{setFootprintOpen(false);go({name:"event",id});}}}/>
          )}
        </>);
      })()}
      {/* Upcoming competitions this athlete is entered in — forecast chips above the results history */}
      <div style={{marginTop:18}}>
        <UpcomingStrip name={name} events={events} onOpen={id=>go({name:"event",id,fromProfile:name})}/>
      </div>
      <div style={{marginTop:4}}>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:10}}>
          <div className="ai-srch-wrap" style={{width:"100%"}}>
            <div className="ai-srch">
              <Sparkles size={13} color={profileFilterLoading?"#0d8ecf":"#9fb2c8"}/>
              <input
                placeholder="Filter results — e.g. top 3 finishes, or 2023 competitions"
                value={profileFilter}
                onChange={e=>{
                  setProfileFilter(e.target.value);
                  clearTimeout(profileSugTimer);
                  setProfileSugTimer(setTimeout(()=>fetchProfileSuggestions(e.target.value),200));
                }}
                onKeyDown={e=>{
                  if(e.key==="Enter"){setProfileSuggestions([]);runProfileFilter();}
                  if(e.key==="Escape"){setProfileFilter("");setProfileSuggestions([]);}
                }}
              />
              {profileFilterLoading&&<Loader2 size={13} className="spin" color="#0d8ecf"/>}
              {profileFilter&&<button style={{border:0,background:"none",cursor:"pointer",color:"#9fb2c8",padding:0,display:"flex"}} onClick={()=>{setProfileFilter("");setProfileSuggestions([]);}}><X size={13}/></button>}
            </div>
            {profileSuggestions.length>0&&(<>
              <div style={{position:"fixed",inset:0,zIndex:1}} onClick={()=>setProfileSuggestions([])}/>
              <div className="sug-drop" style={{zIndex:2}}>
                {profileSuggestions.map((s,i)=>(
                  <div key={i} className="sug-item" onClick={()=>{setProfileFilter(s);setProfileSuggestions([]);setTimeout(()=>runProfileFilter(),50);}}>
                    <Sparkles size={11} color="#0d8ecf"/>{s}
                  </div>
                ))}
              </div>
            </>)}
          </div>
          {profileFilterChips.length>0&&(
            <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8}}>
              {profileFilterChips.map((c,ci)=>(
                <div className="filter-chip" key={ci}>
                  <Sparkles size={11}/>{c.label}
                  <button onClick={()=>setProfileFilterChips(prev=>prev.filter((_,j)=>j!==ci))}><X size={13}/></button>
                </div>
              ))}
              {profileFilterChips.length>1&&(
                <button onClick={()=>setProfileFilterChips([])} style={{border:0,background:"none",color:"var(--mut)",fontSize:11.5,cursor:"pointer",textDecoration:"underline"}}>Clear all</button>
              )}
            </div>
          )}
        </div>
        {(()=>{
          // recency order (newest first), mirroring the class-association layout
          const rows=(profileFilterChips.length
              ? ag.history.filter(h=>profileFilterChips.every(c=>{try{return c.fn(h,scoreEvent);}catch{return true;}}))
              : ag.history)
            .slice().sort((a,b)=>{
              const da=a.ev.date?.split('/').reverse().join('')||'';
              const db=b.ev.date?.split('/').reverse().join('')||'';
              return db.localeCompare(da);
            });
          // Only the athlete assigned to this profile (claim or signup link) pins it.
          const canPin=devMode||isProfileOwner(name)||(auth?.profile?.athlete_name&&canonName(auth.profile.athlete_name)===canonName(name));
          const togglePin=togglePinFor("athlete",canonName(name),profilePins,setProfilePins);
          // Pinned rows lift out of the year sections to a "Pinned" block on top,
          // in the owner's order (profilePins array order == render order).
          const pinIdxOf=h=>profilePins.findIndex(p=>String(p.event_id)===String(h.ev.id));
          const pinnedRows=rows.filter(h=>pinIdxOf(h)>=0).sort((a,b)=>pinIdxOf(a)-pinIdxOf(b));
          const rest=rows.filter(h=>pinIdxOf(h)<0);
          // Same row markup for both sections — pinned rows just gain a corner
          // badge, the filled pin, and (owner only) drag-to-reorder.
          const renderRow=(h,i,pinned)=>{
            const pi=pinned?pinIdxOf(h):-1;
            return(
            <div className="ev" key={(pinned?"pin":"")+h.ev.id+i} style={{animationDelay:`${i*60}ms`,position:"relative"}} onClick={()=>go({name:"event",id:h.ev.id})}
              draggable={pinned&&canPin||undefined}
              onDragStart={pinned&&canPin?()=>setPinDrag(pi):undefined}
              onDragOver={pinned&&canPin?e=>{e.preventDefault();if(pinDrag!=null&&pinDrag!==pi){movePinLocal(setProfilePins,pinDrag,pi);setPinDrag(pi);}}:undefined}
              onDragEnd={pinned&&canPin?()=>{commitPinOrder(profilePins,setProfilePins);setPinDrag(null);}:undefined}>
              {pinned&&<span className="pinbadge" title="Pinned result"><Pin size={11} fill="currentColor"/></span>}
              {pinned&&canPin&&<span className="pingrip" title="Drag to reorder"><GripVertical size={15}/></span>}
              <div className={`hrk ${h.row.rank<=3?"p"+h.row.rank:""}`} style={{flex:"none"}}>{h.row.rank}<small>of {h.fleet}</small></div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:9,flexWrap:"wrap"}}>
                  <p className="evname" style={{margin:0}}>{h.ev.name}</p>
                  {canPin&&(
                    <button type="button" className={"pinbtn"+(pinned?" on":"")} title={pinned?"Unpin":"Pin to the top"}
                      onClick={e=>{e.stopPropagation();togglePin({event_id:h.ev.id,snapshot:{evName:h.ev.name,evDate:h.ev.date,cls:h.ev.cls,subclass:h.ev.subclass,rank:h.row.rank,fleet:h.fleet,venue:h.ev.country||null,athlete:canonName(name)}});}}>
                      <Pin size={13} fill={pinned?"currentColor":"none"}/>
                    </button>
                  )}
                  <span className={"rolechip "+h.role.toLowerCase()}>{h.role}</span>
                </div>
                <div className="evmeta" style={{marginTop:3}}>
                  <span><Calendar size={13}/><span style={{cursor:"pointer",color:"var(--link)",fontWeight:600}} onClick={(e)=>{e.stopPropagation();openSailorCalAt(h.ev.date,name);}}>{formatDate(h.ev.date)}</span></span>
                  <span><MapPin size={13}/>{h.ev.country?<CountryTag code={h.ev.country}/>:evLoc(h.ev)}{h.countries>1?<span style={{color:"var(--mut)",marginLeft:6}}>· {h.countries} countries</span>:null}</span>
                  {h.partner?<span><Users size={13}/>with <span className="namelink" onClick={(e)=>{e.stopPropagation();go({name:"profile",id:h.partner});}}>{h.partner}</span></span>:null}
                </div>
                <div className="miniraces">{h.row.races.map((rc2,j)=>{
                  const cls2=isCode(rc2)?"c":h.row.discardSet.has(j)?"d":rc2===1?"g1":rc2===2?"g2":rc2===3?"g3":"";
                  return<div key={j} className={`rc ${cls2}`}>{isCode(rc2)?rc2.slice(0,2):rc2}</div>;
                })}</div>
              </div>
              {(()=>{const oa=outstandingAchievementFor(h,name);return oa?(
                <span className="oab" title={oa.title}>
                  <Award size={13}/>
                  <span className="oabv">{oa.divisionLabel}</span>
                </span>):null;})()}
              {(()=>{const n=nuggetFor(h.ev.cls,h.ev.subclass);return n?<span className="cls" style={{background:n.color}}>{n.label}</span>:null;})()}
              <ChevronRight size={18} color="#9fb2c8"/>
            </div>);
          };
          // Group the remaining rows into year sections with dividers (same look
          // as the host results list).
          const items=[]; let lastYear=null;
          rest.forEach((h,i)=>{
            const yr=h.ev.date?.split('/')?.[2]||"—";
            if(yr!==lastYear){items.push({type:'divider',year:yr});lastYear=yr;}
            items.push({type:'row',h,i});
          });
          return(<>
            {pinnedRows.length>0&&(
              <div key="pinhead" style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0 8px"}}>
                <span style={{display:"inline-flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700,color:"var(--accent)",letterSpacing:".1em",fontFamily:"'Barlow',sans-serif"}}><Pin size={12} fill="currentColor"/>PINNED</span>
                <div style={{flex:1,height:1,background:"var(--line)"}}/>
              </div>
            )}
            {pinnedRows.map((h,i)=>renderRow(h,i,true))}
            {items.map((item)=>{
              if(item.type==='divider') return(
                <div key={"yr"+item.year} style={{display:"flex",alignItems:"center",gap:12,margin:"18px 0 8px"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"var(--mut)",letterSpacing:".1em",fontFamily:"'Barlow',sans-serif"}}>{item.year}</span>
                  <div style={{flex:1,height:1,background:"var(--line)"}}/>
                </div>
              );
              return renderRow(item.h,item.i,false);
            })}
          </>);
        })()}
        {ag.history.length===0&&<p style={{color:"var(--mut)",fontSize:14}}>No confirmed results found.</p>}
      </div>
    </div></ErrorBoundary>);
  })()}

  {/* ══ IMPORT MODAL ══════════════════════════════════════════ */}
  {open&&(
    <div className="ov" onClick={importStep==="preview"?undefined:closeImport}>
      <div className={`modal${importStep==="preview"?" wide":""}`} onClick={e=>e.stopPropagation()}>
        <div className="mhead">
          {importStep==="picker"&&<button className="x" onClick={()=>setImportStep("upload")} style={{marginRight:4}}><ArrowLeft size={16}/></button>}
          {importStep==="preview"&&!editResultsEv&&<button className="x" onClick={backToHub} title="Back to the import list (keeps this result in the queue)" style={{marginRight:4}}><ArrowLeft size={16}/></button>}
          {importStep==="preview"&&editResultsEv&&<button className="x" onClick={()=>{closeImport();setEditResultsEv(null);}} style={{marginRight:4}}><ArrowLeft size={16}/></button>}
          <Upload size={18}/>
          {importStep==="upload"
            ? <div style={{flex:1,display:"flex",alignItems:"center",gap:8,minWidth:0}}>
                <button className={`mktab${importKind==="past"?" on":""}`} onClick={()=>setImportKind("past")} title="Import the results of a competition that has been sailed"><Trophy size={14}/>Past competitions</button>
                <button className={`mktab${importKind==="upcoming"?" on":""}`} onClick={()=>setImportKind("upcoming")} title="Publish an upcoming competition's entry list — AthLink forecasts the fleet"><Calendar size={14}/>Upcoming competitions</button>
              </div>
            : <h3>{importStep==="picker"?"Select fleet":previewEv?.status==="Upcoming"?"Preview & edit entry list":"Preview & edit results"}</h3>}
          {(()=>{const n=pending.filter(p=>p.status==="parsing").length;return n>0&&(
            <span style={{display:"inline-flex",alignItems:"center",gap:7,marginLeft:10,color:"var(--accent)",fontSize:12.5,fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>
              <Loader2 size={15} className="spin"/>
              {n>1?`Parsing ${n}…`:"Parsing…"}
            </span>
          );})()}
          <button className="x" onClick={closeImport}><X size={16}/></button>
        </div>

        {importStep==="upload"&&(<>
          <div className="mtabs">
            <button className={tab==="ai"?"on":""} onClick={()=>setTab("ai")}><Sparkles size={15}/>AI Entry</button>
            <button className={tab==="manual"?"on":""} onClick={()=>setTab("manual")}><ClipboardPaste size={15}/>Manual entry</button>
          </div>
          {(()=>{const fileTab=(tab==="ai"||tab==="rule");const upKind=importKind==="upcoming";const dropMode=tab==="rule"?"rule":upKind?"entries":"ai";const dropActive=fileTab&&dragDepth>0;return(
          <div className="mbody" style={{position:"relative"}}
            onDragEnter={fileTab?onDragEnter:undefined}
            onDragOver={fileTab?onDragOver:undefined}
            onDragLeave={fileTab?onDragLeave:undefined}
            onDrop={fileTab?(e=>onDropFiles(e,dropMode)):undefined}>
            {dropActive&&(
              <div style={{position:"absolute",inset:10,zIndex:60,borderRadius:14,border:"2px dashed var(--accent)",
                background:"var(--sky)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                gap:10,color:"var(--navy)",pointerEvents:"none"}}>
                <Upload size={28} color="var(--accent)"/>
                <span style={{fontSize:15,fontWeight:700,fontFamily:"'Barlow',sans-serif"}}>Drop files to {dropMode==="rule"?"parse":"import"}</span>
              </div>
            )}
            {tab==="rule"&&(<>
              <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 14px",lineHeight:1.55}}>For known formats — <strong style={{color:"var(--ink)"}}>Sailwave</strong>, Sailwave HTML, <strong style={{color:"var(--ink)"}}>Manage2sail</strong>, SailingResults.net and Clubspot. Fast and exact, no AI. Select one or more PDF/HTML files; multi-fleet files split into a tab per fleet. If a file isn't recognised, switch to AI Entry.</p>
              <label className="btn cta" style={{cursor:"pointer"}}>
                {pdfLoading?<><Loader2 size={16} className="spin"/>Parsing…</>:<><Upload size={16}/>Choose files</>}
                <input type="file" multiple style={{display:"none"}} disabled={pdfLoading} onChange={e=>handleFiles(e.target.files,"rule")}/>
              </label>
              <span style={{fontSize:12,color:"var(--mut)",marginLeft:10}}>…or drag &amp; drop files anywhere here</span>
              {pdfError&&<div className="prev err" style={{marginTop:14}}><AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:5}}/>{pdfError}</div>}
            </>)}
            {tab==="ai"&&(<>
              {/* ── Part 1: single competition (results) / entry list (upcoming) ── */}
              <div style={{fontSize:11,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",color:"var(--navy)",margin:"2px 0 7px",fontFamily:"'Barlow',sans-serif"}}>{upKind?"Import an entry list":"Import single competition result"}</div>
              {upKind
                ? <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 14px",lineHeight:1.55}}>Announce a competition <strong style={{color:"var(--ink)"}}>before it's sailed</strong>. Drop in the entry list — a PDF, screenshot, or the entries page link — and AthLink reads who's racing. Once published, the event page shows a <strong style={{color:"var(--ink)"}}>fleet forecast</strong>: win, podium and top-10 chances for every boat, from current skill ratings. When the racing's done, import the results as usual and they attach to this event.</p>
                : <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 14px",lineHeight:1.55}}>The catch-all. Drop in <strong style={{color:"var(--ink)"}}>anything</strong> — odd PDFs, photos or screenshots of a results sheet, or a whole batch at once. Known formats are read by the built-in parser; the rest go to <strong style={{color:"var(--ink)"}}>Claude AI</strong>. Review every AI-parsed result before publishing.</p>}
              <label className="btn cta liquidGlass-wrapper" style={{cursor:"pointer"}}>
                <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/>
                <div className="liquidGlass-text"><Sparkles size={16}/>Choose files</div>
                <input type="file" multiple style={{display:"none"}} onChange={e=>{handleFiles(e.target.files,upKind?"entries":"ai");e.target.value="";}}/>
              </label>
              <span style={{fontSize:12,color:"var(--mut)",marginLeft:10}}>…or drag &amp; drop files anywhere here{pdfLoading?" — you can keep adding while others parse":""}</span>
              <div style={{margin:"16px 0 6px",display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1,height:1,background:"var(--line)"}}/>
                <span style={{fontSize:11,fontWeight:700,letterSpacing:".06em",color:"var(--mut)",textTransform:"uppercase"}}>{upKind?"or paste the entries page link":"or paste a results link"}</span>
                <div style={{flex:1,height:1,background:"var(--line)"}}/>
              </div>
              <div style={{display:"flex",gap:8}}>
                <div className="glassbar" style={{flex:1,display:"flex",alignItems:"center",gap:8,padding:"0 12px"}}>
                  <Link2 size={15} color="#9fb2c8" style={{flex:"none"}}/>
                  <input value={liveUrl} onChange={e=>setLiveUrl(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"&&liveUrl.trim())handleLink(liveUrl,upKind?"entries":"ai");}}
                    placeholder={upKind?"https://… the event's entries / entry list page":"https://… Manage2sail / Clubspot / Sailwave results page"}
                    style={{flex:1,border:0,outline:"none",font:"inherit",fontSize:13,padding:"10px 0",background:"transparent",boxShadow:"none"}}/>
                </div>
                <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"9px 15px",flex:"none"}} disabled={!liveUrl.trim()} onClick={()=>handleLink(liveUrl,upKind?"entries":"ai")}>
                  <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Fetch &amp; parse</div>
                </button>
              </div>
              <p style={{fontSize:11.5,color:"var(--mut)",margin:"8px 0 0",lineHeight:1.5}}>Parsing the page's source is usually more accurate than a PDF. The link is fetched on our server (your browser can't, due to cross-origin rules).</p>
              {pdfError&&<div className="prev err" style={{marginTop:14}}><AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:5}}/>{pdfError}</div>}
              {/* ── Part 2: result database (whole archive → discovery) — past results only ── */}
              {!upKind&&portal&&!isClassPortal&&host&&(<>
                <div style={{margin:"20px 0 12px",height:1,background:"var(--line)"}}/>
                <div style={{fontSize:11,fontWeight:800,letterSpacing:".07em",textTransform:"uppercase",color:"var(--navy)",margin:"0 0 7px",fontFamily:"'Barlow',sans-serif"}}>Import result database</div>
                <p style={{fontSize:13,color:"var(--mut)",margin:"0 0 12px",lineHeight:1.55}}>Point AthLink at the web pages that hold your results — <strong style={{color:"var(--ink)"}}>one link per line</strong>. We scan each site for the competitions you've run, check which we can read, and let you pick and publish them. Great for a results archive or a club's regatta page.</p>
                <textarea value={scrapeText} onChange={e=>setScrapeText(e.target.value)}
                  placeholder={"https://www.mysailingclub.org/results\nhttps://www.regattanetwork.com/club/1234\nhttps://…"}
                  rows={3} spellCheck={false}
                  style={{width:"100%",boxSizing:"border-box",border:0,borderRadius:12,padding:"11px 13px",font:"inherit",fontSize:13,lineHeight:1.6,resize:"vertical",outline:"none",color:"var(--ink)",
                    background:"rgba(255,255,255,.55)",backdropFilter:"blur(24px) saturate(190%)",WebkitBackdropFilter:"blur(24px) saturate(190%)",
                    boxShadow:"inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.5),0 1px 3px rgba(0,0,0,.05)"}}
                  onFocus={e=>e.target.style.boxShadow="inset 0 1px 0 rgba(255,255,255,.7),0 0 0 4px var(--halo)"}
                  onBlur={e=>e.target.style.boxShadow="inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.5),0 1px 3px rgba(0,0,0,.05)"}/>
                <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10}}>
                  <button className="btn cta liquidGlass-wrapper" disabled={!scrapeText.trim()}
                    onClick={()=>{
                      const urls=[...new Set(scrapeText.split(/[\s,]+/).map(s=>s.trim()).filter(u=>u&&(/^https?:\/\//i.test(u)||/\.[a-z]{2,}/i.test(u))))];
                      if(!urls.length) return;
                      setScrapeText("");
                      // Same hub as single results: every found competition lands in the
                      // import queue below — no separate discovery pop-up.
                      discoverIntoQueue(urls);
                    }}
                    style={{...(scrapeText.trim()?{}:{opacity:.55,cursor:"not-allowed"})}}>
                    <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/>
                    <div className="liquidGlass-text"><Globe size={16}/>Find results</div>
                  </button>
                  {/* Saved discoveries: earlier research stored in hosts.dossier — import
                      those directly (known result URLs), skipping the site re-scan. */}
                  {(host?.dossier?.competitions?.length>0)&&(()=>{
                    const queued=pending.some(p=>String(p.id).startsWith("dossier_"));
                    return(
                    <button className="btn cta liquidGlass-wrapper" disabled={queued}
                      onClick={()=>dossierIntoQueue()}
                      style={{flex:"none",...(queued?{opacity:.55,cursor:"not-allowed"}:{})}}>
                      <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/>
                      <div className="liquidGlass-text"><Sparkles size={16}/>Import {host.dossier.competitions.length} saved discoveries</div>
                    </button>);
                  })()}
                  <span style={{fontSize:12,color:"var(--mut)"}}>Found competitions appear in the import queue below, ready to review one by one.</span>
                </div>
              </>)}
            </>)}
            {/* ── Import queue: the hub. Every file/link lands here as a compact nugget;
                   parsed ones carry a Review portal into their own editor tab; published
                   ones tick off and sink to the bottom. Visible on every tab. ── */}
            {pending.length>0&&(()=>{
              const act=pending.filter(p=>p.status!=="published");
              const done=pending.filter(p=>p.status==="published");
              const ordered=[...act,...done];   // published sink to the bottom
              const nP=act.filter(p=>p.status==="parsing").length;
              const nR=act.filter(p=>p.status==="ok").length;
              const nE=act.filter(p=>p.status==="error").length;
              return(
              <div style={{marginTop:16,border:0,borderRadius:14,padding:"11px 13px",
                background:"rgba(255,255,255,.45)",backdropFilter:"blur(24px) saturate(190%)",WebkitBackdropFilter:"blur(24px) saturate(190%)",
                boxShadow:"inset 0 1px 0 rgba(255,255,255,.65),inset 0 0 0 .5px rgba(255,255,255,.45),0 1px 4px rgba(0,0,0,.06)"}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  {nP>0?<Loader2 size={14} className="spin" color="var(--accent)"/>:<CheckCircle size={14} color="#0f8a7e"/>}
                  <span style={{fontSize:12.5,fontWeight:700,color:"var(--navy)",fontFamily:"'Barlow',sans-serif"}}>Import queue</span>
                  <span style={{marginLeft:"auto",fontSize:11.5,color:"var(--mut)",fontWeight:600}}>
                    {[nP?`${nP} parsing`:null,nR?`${nR} ready`:null,nE?`${nE} failed`:null,done.length?`${done.length} published`:null].filter(Boolean).join(" · ")}
                  </span>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:5,maxHeight:236,overflowY:"auto"}}>
                  {ordered.map(p=>{
                    const pub=p.status==="published";
                    return(
                    <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,border:0,
                      background:pub?"transparent":"rgba(255,255,255,.6)",
                      boxShadow:pub?"none":"inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.5),0 1px 3px rgba(0,0,0,.05)",
                      borderRadius:10,padding:"5px 6px 5px 10px",opacity:pub?.6:1,minHeight:26}}>
                      {p.status==="parsing"?<Loader2 size={13} className="spin" color="var(--accent)" style={{flex:"none"}}/>
                        :p.status==="error"?<AlertCircle size={13} color="#c0392b" style={{flex:"none"}}/>
                        :pub?<CheckCircle size={13} color="#0f8a7e" style={{flex:"none"}}/>
                        :<FileText size={13} color="var(--accent)" style={{flex:"none"}}/>}
                      <span style={{fontSize:12.5,fontWeight:600,color:pub?"var(--mut)":"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:"none",maxWidth:"44%",textDecoration:pub?"line-through":"none"}}>{p.previewEv?.name||p.name}</span>
                      <span title={p.status==="error"?(p.error||""):undefined} style={{fontSize:11.5,color:p.status==="error"?"#c0392b":"var(--mut)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>
                        {p.status==="parsing"?((p.notes||[]).slice(-1)[0]||"Parsing…")
                          :p.status==="error"?(p.error||"Couldn't parse this file.")
                          :pub?(p.publishedMsg||"Published")
                          :`${p.previewEv?.entries?.length||0} competitors · ready to review`}
                      </span>
                      {p.status==="ok"&&(
                        <button onClick={()=>openPendingEditor(p.id)} title="Open this result to review & publish"
                          style={{flex:"none",display:"inline-flex",alignItems:"center",gap:3,border:"1px solid var(--accent)",background:"var(--accent)",color:"#fff",borderRadius:7,padding:"3px 9px 3px 11px",fontSize:11.5,fontWeight:700,fontFamily:"'Barlow',sans-serif",cursor:"pointer"}}>
                          Review<ChevronRight size={12}/>
                        </button>
                      )}
                      {!pub&&p.status!=="parsing"&&(
                        <button onClick={()=>removePending(p.id)} title="Remove from the queue"
                          style={{flex:"none",display:"inline-flex",alignItems:"center",justifyContent:"center",width:22,height:22,borderRadius:6,border:0,cursor:"pointer",background:"transparent",color:"#c0392b",transition:".12s"}}
                          onMouseEnter={e=>{e.currentTarget.style.background="rgba(192,57,43,.1)";}}
                          onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
                          <Trash2 size={13}/>
                        </button>
                      )}
                    </div>);
                  })}
                </div>
              </div>);
            })()}
            {tab==="manual"&&(<>
              {(()=>{const evCls=assoc?.cls||mf.cls;return(<>
              <div style={{display:"flex",alignItems:"flex-end",gap:12,marginBottom:10,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:200}}>
                  <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600}}>Competition name</label>
                  <input value={mf.name} onChange={e=>updMeta("name",e.target.value)} placeholder="2025 29er Asian Championship" style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/>
                </div>
              </div>
              {SUBCLASSES[evCls]&&<div style={{marginBottom:12}}>
                <label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600}}>Class type</label>
                <div style={{display:"inline-flex",gap:6,flexWrap:"wrap"}}>
                  {SUBCLASSES[evCls].map(s=>{
                    const on=mf.subclass===s.id;
                    return <button key={s.id} type="button" onClick={()=>updMeta("subclass",on?null:s.id)}
                      style={{border:"1px solid "+(on?s.color:"var(--line)"),background:on?s.color:"transparent",
                        color:on?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,fontFamily:"'Barlow',sans-serif",
                        padding:"5px 11px",cursor:"pointer",transition:".12s"}}>{s.label}</button>;
                  })}
                </div>
              </div>}
              {/* Host country, date and discards on one row */}
              <div className="meta-grid three" style={{marginBottom:14}}>
                <div><label>Host Country</label><CountrySelect value={mf.club||""} onChange={v=>updMeta("club",v)}/></div>
                <div><label>Date</label>
                  <input value={mf.date} onChange={e=>updMeta("date",e.target.value)} placeholder="dd/mm/yyyy" maxLength={10}/>
                  {mf.date?.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)&&<span style={{fontSize:11.5,color:"var(--accent)",fontWeight:600,display:"block",marginTop:3}}>{formatDate(mf.date)}</span>}
                </div>
                {!upKind&&<div><label>Discards</label><input type="number" min="0" max="10" value={mf.discards} onChange={e=>updMeta("discards",Math.max(0,parseInt(e.target.value)||0))}/></div>}
              </div>
              <CollabPicker owner={portal} value={mf.collabs} onChange={v=>updMeta("collabs",v)}/>
              </>);})()}
              {!upKind&&<div className="race-ctrl">
                <span>Number of races</span>
                <div className="stepper">
                  <button onClick={()=>mf.numRaces>1&&setNumRaces(mf.numRaces-1)}><Minus size={13}/></button>
                  <span>{mf.numRaces}</span>
                  <button onClick={()=>mf.numRaces<20&&setNumRaces(mf.numRaces+1)}><Plus size={13}/></button>
                </div>
              </div>}
              <div className="rtable-wrap">
                <table className="rtable">
                  <thead><tr>
                    <th className="l" style={{minWidth:110}}>Helm Name</th>
                    {!((assoc?.cls||mf.cls)==="ilca"||(assoc?.cls||mf.cls)==="optimist")&&<th className="l" style={{minWidth:110}}>Crew Name</th>}
                    <th style={{minWidth:46}}>Nat</th>
                    <th style={{minWidth:46}}>Sail</th>
                    <th style={{minWidth:140}}>Div</th>
                    {!upKind&&Array.from({length:mf.numRaces}).map((_,i)=><th key={i} style={{minWidth:34}}>R{i+1}</th>)}
                    {!upKind&&<th className="calc" style={{minWidth:38}}>Total</th>}
                    {!upKind&&<th className="calc" style={{minWidth:38}}>Net</th>}
                    <th style={{width:26}}></th>
                  </tr></thead>
                  <tbody>
                    {mf.rows.map((row,i)=>(
                      <tr key={i}>
                        <td className="l"><input value={row.helm} onChange={e=>updRow(i,"helm",e.target.value)} placeholder="Helm name"/></td>
                        {!((assoc?.cls||mf.cls)==="ilca"||(assoc?.cls||mf.cls)==="optimist")&&<td className="l"><input value={row.crew} onChange={e=>updRow(i,"crew",e.target.value)} placeholder="Crew name"/></td>}
                        <td><NatInput value={row.nat||""} onChange={v=>updRow(i,"nat",v)}/></td>
                        <td><input value={row.sail} onChange={e=>updRow(i,"sail",e.target.value)} placeholder="···" style={{textAlign:"center"}}/></td>
                        <td style={{padding:"4px 6px"}}><DivisionToggle value={row.div} onChange={v=>updRow(i,"div",v)} noMix={(assoc?.cls||mf.cls)==="ilca"||(assoc?.cls||mf.cls)==="optimist"}/></td>
                        {!upKind&&Array.from({length:mf.numRaces}).map((_,j)=>(
                          <td key={j}><input value={row.scores[j]||""} onChange={e=>updScore(i,j,e.target.value)} placeholder="–" style={{textAlign:"center"}}/></td>
                        ))}
                        {!upKind&&<td className="calc-td" style={{fontSize:12,color:"var(--mut)",fontWeight:600}}>{manualCalc[i]?.total??<span style={{opacity:.3}}>—</span>}</td>}
                        {!upKind&&<td className="calc-td" style={{fontSize:12,color:"var(--navy)",fontWeight:700}}>{manualCalc[i]?.net??<span style={{opacity:.3}}>—</span>}</td>}
                        <td className="del-td"><button style={{background:"none",border:0,color:"#c0392b",cursor:"pointer",padding:4,opacity:.55}} onClick={()=>delRow(i)}><X size={13}/></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <button className="btn ghost" style={{fontSize:13,padding:"7px 12px"}} onClick={addRow}><Plus size={14}/>Add boat</button>
                {!upKind&&<span style={{fontSize:11.5,color:"var(--mut)"}}>Codes: DNF DSQ UFD BFD DNC DNS OCS RET SCP STP DPI DNE NSC ZFP RDG</span>}
              </div>
              <div className="mfoot">
                <button className="btn ghost" onClick={closeImport}>Cancel</button>
                <button className="btn cta liquidGlass-wrapper" disabled={!manualReady||busyAction==="manualImport"} onClick={()=>runBusy("manualImport",()=>doImportManual(upKind))}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busyAction==="manualImport"?<Loader2 size={16} className="spin"/>:<Upload size={16}/>}{upKind?"Publish entry list":"Import competition"}</div></button>
              </div>
            </>)}
          </div>);})()}
        </>)}

        {importStep==="picker"&&(
          <div className="mbody">
            <p style={{fontSize:14,color:"var(--mut)",margin:"0 0 4px"}}>Multiple fleets found in <strong style={{color:"var(--ink)"}}>{pdfMeta?.name}</strong>. Select which fleet to import, or combine all into one overall results page:</p>
            <div className="fleet-grid">
              {/* Overall Results option — merges all fleets, preserves PDF ranks */}
              <div className="fleet-card" style={{borderColor:"var(--accent)",background:"#f0f8ff"}} onClick={()=>{
                // Merge all fleets: combine entries, sort by pdf_rank if available
                const allEntries=[...fleetChoices.flatMap(f=>f.entries)];
                // Deduplicate by helm+sail
                const seen=new Set();
                const merged=allEntries.filter(e=>{const k=e.helm.toLowerCase()+e.sail;if(seen.has(k))return false;seen.add(k);return true;});
                // Sort by pdf_rank if available
                merged.sort((a,b)=>(a.pdf_rank??9999)-(b.pdf_rank??9999));
                const maxDisc=Math.max(...fleetChoices.map(f=>f.discards||1));
                buildPreviewFromFleet(pdfMeta.name,pdfMeta.date,{name:"",entries:merged,discards:maxDisc});
              }}>
                <div className="fname" style={{color:"var(--accent)"}}>🏆 Overall Results</div>
                <div className="fcount">{fleetChoices.reduce((s,f)=>s+f.count,0)} boats total · all {fleetChoices.length} fleets combined</div>
              </div>
              {fleetChoices.map((fleet,i)=>(
                <div key={i} className="fleet-card" onClick={()=>selectFleet(fleet)}>
                  <div className="fname">{fleet.name||"Unnamed fleet"}</div>
                  <div className="fcount">{fleet.count} boats · {fleet.discards} discard{fleet.discards!==1?"s":""}</div>
                </div>
              ))}
            </div>
            <div className="mfoot"><button className="btn ghost" onClick={closeImport}>Cancel</button></div>
          </div>
        )}

        {importStep==="preview"&&(pending.length>0||previewEv)&&(()=>{
          // Upcoming entry list: no scores exist, so no scoring pass (scorePreview
          // would invent DNFs), no race columns, and a Rating column instead of Pos
          // so the host can see which entrants matched an existing rated athlete.
          const isUpEv=previewEv?.status==="Upcoming";
          const scored=isUpEv?null:previewScored;
          const maxR=isUpEv?0:previewMaxRaces;
          const upRatings=isUpEv?(()=>{try{return ratingEngine.getAthleteRatings(events);}catch{return null;}})():null;
          const upRatingOf=(members)=>{
            if(!upRatings)return null;
            const dk=dateKey(previewEv?.date)||"";
            const rr=members.filter(Boolean).map(m=>ratingEngine.ratingAsOf(upRatings.get(canonName(m))||null,dk));
            if(!rr.length)return null;
            return{r:rr.reduce((a,x)=>a+x.r,0)/rr.length,rd:Math.sqrt(rr.reduce((a,x)=>a+x.rd*x.rd,0)/rr.length),provisional:rr.every(x=>x.provisional)};
          };
          const active=pending.find(p=>p.id===activePending);
          const isError=active&&active.status==="error";
          // Editor tabs show only unpublished items — a published result's tab is closed.
          const openTabs=pending.filter(p=>p.status!=="published");
          const missingCells=previewEv&&previewEv.entries.some(e=>!e.helm||(!isUpEv&&(e.races||[]).length<maxR));
          // Effective class for the table comes from the previewEv itself when set
          // by the per-result selector, else the portal association's class.
          const evCls=(previewEv?.cls)||assoc?.cls||"29er";
          const singleHanded=evCls==="ilca"||evCls==="optimist";
          // Associations may only host their own class; clubs (and edit mode) host any.
          const classLocked=!!assoc&&!editResultsEv;
          // Detect fleet groups in pending (same fleetGroupId = same multi-fleet source file)
          const fleetGroupIds=[...new Set(openTabs.filter(p=>p.fleetGroupId).map(p=>p.fleetGroupId))];
          // Days on which the importing host already has competitions — reference/collision
          // info for the date picker. Keyed by the event's DD/MM/YYYY date → competition names.
          // Scope to the resolved host (self-organizing importer, else attributed host); if
          // none is resolved yet, no dots are shown.
          const _dpHost=_pvResolvedHost;
          const markedDays=(()=>{
            if(!_dpHost) return {};
            const out={};
            events.forEach(ev=>{
              if(!ev.date) return;
              const isHosts=ev.owner===_dpHost||(ev.collabs||[]).includes(_dpHost)||ev.imported_by===_dpHost;
              if(!isHosts) return;
              const m=String(ev.date).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
              if(!m) return;
              const key=`${+m[1]}/${+m[2]}/${+m[3]}`;
              (out[key]=out[key]||[]).push(ev.name||"Competition");
            });
            return out;
          })();
          return(<div className="mbody has-actionbar">
            {/* ── Open editor tabs (unpublished results; published tabs auto-close) ── */}
            {openTabs.length>1&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,borderBottom:"1px solid var(--line)",paddingBottom:10}}>
                {openTabs.map(p=>{const on=p.id===activePending;return(
                  <span key={p.id}
                    style={{display:"inline-flex",alignItems:"center",gap:6,maxWidth:220,border:"1px solid "+(on?"var(--accent)":"var(--line)"),
                      background:on?"var(--accent)":(p.status==="error"?"#fdeceA":"#fff"),color:on?"#fff":(p.status==="error"?"#b3261e":"var(--navy)"),
                      borderRadius:8,padding:"6px 6px 6px 10px",fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden"}}>
                    <button onClick={()=>switchPending(p.id)} title="Edit this result"
                      style={{display:"inline-flex",alignItems:"center",gap:6,maxWidth:170,background:"none",border:0,padding:0,margin:0,cursor:"pointer",color:"inherit",font:"inherit",fontWeight:600,overflow:"hidden"}}>
                      {p.status==="error"?<AlertCircle size={12} style={{flex:"none"}}/>:p.status==="parsing"?<Loader2 size={12} className="spin" style={{flex:"none"}}/>:<FileText size={12} style={{flex:"none"}}/>}
                      <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{p.previewEv?.name||p.name}</span>
                    </button>
                    <button onClick={()=>removePending(p.id)} title="Remove this result from the import"
                      style={{flex:"none",display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,borderRadius:5,border:0,cursor:"pointer",
                        background:on?"rgba(255,255,255,.22)":"transparent",color:on?"#fff":"#9aa7b6"}}>
                      <X size={12}/>
                    </button>
                  </span>
                );})}
                {/* Combine fleets button — shown per fleet group */}
                {fleetGroupIds.map(gid=>{
                  const gItems=openTabs.filter(p=>p.fleetGroupId===gid);
                  if(gItems.length<2) return null;
                  // Event title = longest common prefix of the fleet names, trimmed
                  // of any trailing separator (e.g. "29er World Championship — 1-Gold"
                  // + "… — 2-Silver" → "29er World Championship").
                  const names=gItems.map(p=>p.previewEv?.name||p.name||"");
                  let base=names[0]||"";
                  for(const n of names){let k=0;while(k<base.length&&k<n.length&&base[k]===n[k])k++;base=base.slice(0,k);}
                  base=base.replace(/[\s–—\-—–:,#]+$/,"").trim()||"this competition";
                  return(
                    <button key={gid} onClick={()=>combineFleetGroup(gid)}
                      title={`Merge all ${gItems.length} fleets of ${base} into one combined result`}
                      style={{display:"inline-flex",alignItems:"center",gap:5,border:"1px dashed var(--accent)",background:"#f0f8ff",color:"var(--accent)",
                        borderRadius:8,padding:"6px 10px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}>
                      <Trophy size={12} style={{flex:"none"}}/>Combine all “{base}” fleets
                    </button>
                  );
                })}
              </div>
            )}
            {/* ── Unparseable file notice ── */}
            {isError&&(
              <div className="prev err" style={{marginBottom:12}}>
                <AlertCircle size={14} style={{verticalAlign:"-2px",marginRight:6}}/>
                <b>Couldn't parse "{active.name}".</b> {active.error||""} Try exporting this result in a different format (Sailwave <b>HTML</b> or a text-based <b>PDF</b>) and uploading again.
                <div style={{marginTop:10}}>
                  <button className="btn ghost" style={{fontSize:12,padding:"5px 11px"}} onClick={()=>removePending(active.id)}>Dismiss this file</button>
                </div>
              </div>
            )}
            {!isError&&previewEv&&(<>
            <div className="preview-meta wide" style={{marginBottom:8}}>
              {isUpEv&&<div style={{gridColumn:"1/-1",marginBottom:6,display:"flex",alignItems:"center",gap:6,background:"rgba(232,146,26,.09)",border:"1px solid rgba(232,146,26,.35)",borderRadius:7,padding:"5px 10px"}}>
                <Clock size={13} style={{color:"#b8860b",flex:"none"}}/>
                <span style={{fontSize:12,fontWeight:600,color:"#b8860b"}}>Upcoming competition</span>
                <span style={{fontSize:11,color:"#a8873a"}}>— publishing this entry list makes the event page show a fleet forecast. Rated entrants show their current skill rating; "new" entrants start at 1200 with the widest uncertainty.</span>
              </div>}
              {previewEv?.ai_parsed&&<div style={{gridColumn:"1/-1",marginBottom:6,display:"flex",alignItems:"center",gap:6,background:"#f0f4ff",border:"1px solid #c5d3f8",borderRadius:7,padding:"5px 10px"}}>
                <Sparkles size={13} style={{color:"#3b5bdb",flex:"none"}}/>
                <span style={{fontSize:12,fontWeight:600,color:"#3b5bdb"}}>AI parsed</span>
                <span style={{fontSize:11,color:"#6278b5"}}>— This {isUpEv?"entry list":"result"} was parsed by Claude AI. Review all cells before publishing.</span>
              </div>}
              {/* Attach-to-announced-event notice: this result matches an upcoming
                  competition already published as an entry list. Default = attach
                  (no duplicate event); the host can opt out per result. */}
              {!isUpEv&&!editResultsEv&&(()=>{
                const m=findUpcomingMatch({name:previewEv.name,cls:evCls,date:previewEv.date});
                if(!m) return null;
                const off=!!previewEv._noAttach;
                return(
                  <div style={{gridColumn:"1/-1",marginBottom:6,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",background:off?"var(--grouped)":"rgba(46,164,79,.08)",border:"1px solid "+(off?"var(--line)":"rgba(46,164,79,.35)"),borderRadius:7,padding:"5px 10px"}}>
                    <Link2 size={13} style={{color:off?"var(--mut)":"#1a7f37",flex:"none"}}/>
                    <span style={{fontSize:12,fontWeight:600,color:off?"var(--mut)":"#1a7f37"}}>{off?"Publishing as a separate event":"Will attach to your announced competition"}</span>
                    <span style={{fontSize:11,color:off?"var(--mut)":"#3d8054"}}>— {off?`"${m.name}" stays a separate upcoming event.`:`these results replace the entry list on "${m.name}" (same page & link, forecast becomes final results).`}</span>
                    <button type="button" onClick={()=>updPMeta("_noAttach",!off)}
                      style={{marginLeft:"auto",flex:"none",border:"1px solid "+(off?"#1a7f37":"var(--line)"),background:"transparent",color:off?"#1a7f37":"var(--mut)",borderRadius:6,fontSize:11,fontWeight:600,padding:"2px 8px",cursor:"pointer"}}>
                      {off?"Attach instead":"Publish separately"}</button>
                  </div>
                );
              })()}
              <div><label>Competition name</label><input value={previewEv.name||""} onChange={e=>updPMeta("name",e.target.value)} className={!previewEv.name?"pmissing":""} placeholder="Competition name"/></div>
              <div><label>Host Country</label><CountrySelect glass value={previewEv.venue||""} onChange={v=>updSharedMeta("venue",v)}/></div>
              <div><label>Date</label><DateField value={previewEv.date||""} onChange={v=>updSharedMeta("date",v)} className={!previewEv.date?"pmissing":""} markedDays={markedDays} dotColor={classColor(evCls)||"var(--navy2)"}/></div>
              {!isUpEv&&<div><label>Discards</label>
                {/* frameless ± stepper; functional updates so rapid clicks don't read a stale count */}
                <div className="stepper" style={{gap:5,justifyContent:"center",height:35}}>
                  <button type="button" style={{width:26,height:26}} onClick={()=>setPreviewEv(ev=>ev?{...ev,discards:Math.max(0,(ev.discards??1)-1)}:ev)}><Minus size={12}/></button>
                  <span style={{minWidth:16,textAlign:"center",fontSize:13}}>{previewEv.discards??1}</span>
                  <button type="button" style={{width:26,height:26}} onClick={()=>setPreviewEv(ev=>ev?{...ev,discards:Math.min(20,(ev.discards??1)+1)}:ev)}><Plus size={12}/></button>
                </div>
              </div>}
              <div><label>Boat class{classLocked&&<span style={{textTransform:"none",letterSpacing:0}} title={`Fixed to ${assoc.name}'s class`}> 🔒</span>}</label>
                <ClassSelect value={evCls} subValue={mf.subclass} locked={classLocked?assoc.cls:null}
                  classes={customClasses} onAdd={name=>addCustomClass(name)}
                  onPick={(cid,sid)=>{updPMeta("cls",cid);updMeta("subclass",sid);}}/>
              </div>
            </div>
            {/* ── Web-lookup suggestion strip: low-confidence date/country found
                 online for a document that printed none. Never auto-applied —
                 Apply writes through updSharedMeta (same setter as the manual
                 inputs, so fleet-tab sync keeps working). Dismissible. ── */}
            {(()=>{
              const sug=active&&enrichSug[active.id];
              if(!sug||sug.dismissed) return null;
              // Only offer a value the field still lacks (and that was found).
              const showDate=sug.date&&!String(previewEv.date||"").trim();
              const showCty=sug.country&&!String(previewEv.venue||"").trim();
              if(!showDate&&!showCty) return null;
              let domain="";
              try{domain=sug.source?new URL(sug.source).hostname.replace(/^www\./,""):"";}catch{domain="";}
              const dismiss=()=>setEnrichSug(s=>({...s,[active.id]:{...s[active.id],dismissed:true}}));
              return(
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:10,fontSize:12,
                  color:"var(--navy2)",background:"var(--sky)",backdropFilter:"blur(20px) saturate(160%)",WebkitBackdropFilter:"blur(20px) saturate(160%)",
                  border:"0",borderRadius:12,padding:"8px 12px",boxShadow:"inset 0 1px 0 rgba(255,255,255,.5),inset 0 0 0 .5px rgba(31,78,128,.18)"}}>
                  <Search size={13} style={{flex:"none",opacity:.75}}/>
                  <span>Web lookup <span style={{opacity:.7}}>(unconfirmed)</span>:</span>
                  {showDate&&(
                    <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                      <b style={{fontWeight:700}}>{sug.date}</b>
                      <button type="button" onClick={()=>updSharedMeta("date",sug.date)}
                        style={{border:"1px solid var(--navy2)",background:"transparent",color:"var(--navy2)",borderRadius:6,fontSize:11,fontWeight:600,padding:"2px 8px",cursor:"pointer"}}>Apply</button>
                    </span>
                  )}
                  {showDate&&showCty&&<span style={{opacity:.5}}>·</span>}
                  {showCty&&(
                    <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                      <b style={{fontWeight:700}}>{sug.country}</b>
                      <button type="button" onClick={()=>updSharedMeta("venue",sug.country)}
                        style={{border:"1px solid var(--navy2)",background:"transparent",color:"var(--navy2)",borderRadius:6,fontSize:11,fontWeight:600,padding:"2px 8px",cursor:"pointer"}}>Apply</button>
                    </span>
                  )}
                  {domain&&<span style={{opacity:.6}}>— from {domain}</span>}
                  <button type="button" onClick={dismiss} title="Dismiss"
                    style={{marginLeft:"auto",flex:"none",display:"inline-flex",alignItems:"center",justifyContent:"center",width:20,height:20,borderRadius:5,border:0,background:"transparent",color:"var(--navy2)",cursor:"pointer",opacity:.7}}>
                    <X size={13}/>
                  </button>
                </div>
              );
            })()}
            {/* ── Organizer row: addable nuggets. First nugget = the organizer (the
                 importing host by default; X on it demotes the import to an external
                 CONTRIBUTION). Extra nuggets = collab hosts. "+" adds an existing
                 association/club/federation — it fills the empty organizer slot
                 first, then adds collabs. ── */}
            {(()=>{
              const importerHost=(portal&&!isClassPortal)?portal:null;
              const editing=!!editResultsEv;
              const orgMode=previewEv._orgMode||"self";
              const selfOrg=!editing&&!!importerHost&&orgMode!=="external";
              const ownerId=editing?previewEv.owner:(selfOrg?importerHost:(previewEv._orgHost||null));
              const orgName=!editing&&!ownerId?(previewEv._orgName||""):"";
              const collabs=mf.collabs||[];
              const allHosts=[...ASSOCIATIONS,...CLUBS,...FEDERATIONS];
              // Chips go by the host's URL short name (its slug, e.g. RHKYC) when one is
              // set — long official names would truncate; the tooltip keeps the full name.
              const hostShort=id=>{const h=hostById(id);return h?.slug||h?.name||id;};
              const hostFull=id=>hostById(id)?.name||id;
              const nug=(key,label,{dark=false,dashed=false,onX=null,tag=null,onToggle=null,toggleTitle="",full=""})=>(
                <span key={key} onClick={onToggle||undefined} title={[full,onToggle?toggleTitle:""].filter(Boolean).join(" — ")||undefined}
                  style={{display:"inline-flex",alignItems:"center",gap:6,maxWidth:260,
                  border:dashed?"1.5px dashed var(--line)":0,
                  background:dark?"var(--navy)":"rgba(255,255,255,.55)",color:dark?"#fff":"var(--navy)",
                  backdropFilter:dark?undefined:"blur(24px) saturate(190%)",WebkitBackdropFilter:dark?undefined:"blur(24px) saturate(190%)",
                  boxShadow:dark?"inset 0 1px 0 rgba(255,255,255,.28),0 1px 3px rgba(0,0,0,.15)"
                    :dashed?undefined:"inset 0 1px 0 rgba(255,255,255,.7),inset 0 0 0 .5px rgba(255,255,255,.5),0 1px 3px rgba(0,0,0,.05)",
                  borderRadius:12,padding:"6px 8px 6px 12px",fontSize:12.5,fontWeight:600,whiteSpace:"nowrap",
                  cursor:onToggle?"pointer":"default",userSelect:"none",transition:".12s"}}>
                  <span style={{overflow:"hidden",textOverflow:"ellipsis"}}>{label}</span>
                  {tag&&<span style={{flex:"none",fontSize:10,fontWeight:700,letterSpacing:".04em",opacity:.8,
                    border:"1px solid "+(dark?"rgba(255,255,255,.4)":"var(--line)"),borderRadius:6,padding:"1px 6px"}}>{tag}</span>}
                  {onX
                    ?<button type="button" onClick={e=>{e.stopPropagation();onX();}} title="Remove"
                      style={{flex:"none",display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,
                        borderRadius:6,border:0,cursor:"pointer",background:dark?"rgba(255,255,255,.22)":"transparent",
                        color:dark?"#fff":"#9aa7b6"}}><X size={12}/></button>
                    :<span style={{width:2}}/>}
                </span>);
              // Organizer ↔ Collab toggling. Every host is a nugget; the ORGANIZER one is
              // dark with a tag. Click the organizer → it steps down to a collab (the
              // import becomes an external contribution). Click a collab → it becomes THE
              // organizer (any previous organizer steps down to collab). × removes.
              const demoteOrganizer=()=>{
                if(editing||!ownerId) return;
                if(selfOrg)updSharedMeta("_orgMode","external"); else updSharedMeta("_orgHost",null);
                if(!collabs.includes(ownerId))updSharedCollabs([...collabs,ownerId]);
              };
              const promoteToOrganizer=(id)=>{
                if(editing) return;
                const rest=collabs.filter(x=>x!==id);
                updSharedCollabs(ownerId&&ownerId!==id&&!rest.includes(ownerId)?[...rest,ownerId]:rest);
                if(id===importerHost){updSharedMeta("_orgMode","self");updSharedMeta("_orgHost",null);}
                else{updSharedMeta("_orgMode","external");updSharedMeta("_orgHost",id);}
                updSharedMeta("_orgName","");
              };
              // "+" picks: the importer itself → back to self-organized; any host into an
              // empty organizer slot → attributed organizer; otherwise → collab.
              const addHost=id=>{
                if(!editing&&id===importerHost){updSharedMeta("_orgMode","self");updSharedMeta("_orgHost",null);updSharedMeta("_orgName","");return;}
                if(!editing&&!ownerId){updSharedMeta("_orgHost",id);updSharedMeta("_orgName","");return;}
                if(!collabs.includes(id)&&id!==ownerId)updSharedCollabs([...collabs,id]);
              };
              return(
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,color:"var(--mut)",display:"block",marginBottom:5,fontWeight:600,letterSpacing:".04em",textTransform:"uppercase"}}>Organizer</label>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                  {ownerId&&nug("owner",hostShort(ownerId),{dark:true,tag:"Organizer",full:hostFull(ownerId),
                    onToggle:editing?null:demoteOrganizer,toggleTitle:"click to make this host a collab instead",
                    onX:editing?null:()=>{selfOrg?updSharedMeta("_orgMode","external"):updSharedMeta("_orgHost",null);}})}
                  {!ownerId&&orgName&&nug("orgname",orgName,{dashed:true,tag:"Organizer — not on AthLink",
                    onX:()=>updSharedMeta("_orgName","")})}
                  {collabs.map(id=>nug(id,hostShort(id),{tag:"Collab",full:hostFull(id),
                    onToggle:editing?null:()=>promoteToOrganizer(id),toggleTitle:"click to make this host the organizer",
                    onX:()=>updSharedCollabs(collabs.filter(x=>x!==id))}))}
                  <AddHostNugget hosts={allHosts} exclude={[ownerId,...collabs].filter(Boolean)}
                    allowOther={!editing&&!ownerId&&!orgName}
                    onOtherName={v=>updSharedMeta("_orgName",v)}
                    onPick={addHost}
                    title={(!editing&&!ownerId&&!orgName)?"Add the organizer":"Add a collab association or club"}/>
                </div>
                {!editing&&<p style={{fontSize:11.5,color:"var(--mut)",margin:"6px 0 0"}}>
                  {(!ownerId&&!orgName)?"No organizer set — this will be filed as an external contribution"+(importerHost?` by ${hostById(importerHost)?.name||"you"}`:"")+"; the organizer can claim it later."
                    :selfOrg?"Click a host to switch it between Organizer and Collab · × removes it. Collab hosts show the competition on their pages too."
                    :`Filed as externally contributed${importerHost?` by ${hostById(importerHost)?.name||"you"}`:""} — it stays off your page and the organizer can claim it later.`}
                </p>}
              </div>);
            })()}
            {missingCells&&<p className="pmissing-hint"><AlertCircle size={13}/>Amber cells have missing data — click to edit before publishing.</p>}</>)}
            {!isError&&previewEv&&(<>
            <div className="preview-table-wrap">
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12.5px",minWidth:560}}>
                <thead>
                  <tr>
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 6px",textAlign:"center",fontSize:11}} title={isUpEv?"Current skill rating ± uncertainty — 'new' means no rated results on AthLink yet":undefined}>{isUpEv?"Rating":"Pos"}</th>
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 8px",textAlign:"left",fontSize:11}}>Helm</th>
                    {!singleHanded&&<th style={{background:"var(--navy)",color:"#fff",padding:"9px 6px",textAlign:"left",fontSize:11}}>Crew</th>}
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 5px",textAlign:"left",fontSize:11}}>Sail</th>
                    <th style={{background:"var(--navy)",color:"#fff",padding:"9px 6px",textAlign:"center",fontSize:11,minWidth:160}}>
                      <span style={{display:"inline-flex",alignItems:"center",gap:5}}>
                        Gender / Div
                        {/* Rename a division tag (Jr → U18 …) across every row at once. */}
                        <button type="button" title="Rename a division tag across all rows (e.g. Jr → U18)"
                          onClick={e=>{
                            const r=e.currentTarget.getBoundingClientRect();
                            const toks=[...new Set(previewEv.entries.map(_divCatOf).filter(Boolean))];
                            setDivHdrEdit({x:Math.round(r.left-70),y:Math.round(r.bottom+6),rows:toks.map(t=>({from:t,val:t}))});
                          }}
                          style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:18,height:18,border:0,borderRadius:5,
                            background:"rgba(255,255,255,.18)",color:"#fff",cursor:"pointer",padding:0}}>
                          <Pencil size={10}/>
                        </button>
                      </span>
                    </th>
                    {Array.from({length:maxR}).map((_,i)=><th key={i} style={{background:"var(--navy)",color:"#fff",padding:"9px 4px",textAlign:"center",fontSize:11,minWidth:34}}>R{i+1}</th>)}
                    {!isUpEv&&<th style={{background:"#1a4a7a",color:"#fff",padding:"9px 6px",textAlign:"center",fontSize:11}}>Net</th>}
                    <th style={{background:"var(--navy)",width:32,padding:"9px 4px"}} aria-label=""></th>
                  </tr>
                </thead>
                <tbody>
                  {previewEv.entries
                    .map((entry,idx)=>{const scoredRow=scored?.rows.find(r=>r.helm===entry.helm&&r.sail===entry.sail);return{entry,idx,scoredRow,rank:scoredRow?.rank,net:scoredRow?.net};})
                    .sort((a,b)=>{if(a.rank==null&&b.rank==null)return a.idx-b.idx;if(a.rank==null)return 1;if(b.rank==null)return -1;return a.rank-b.rank;})
                    .map(({entry,idx,scoredRow,rank,net})=>{
                    return(<tr key={idx} style={{borderBottom:"1px solid var(--line)"}}>
                      {isUpEv
                        ?<td style={{textAlign:"center",padding:"8px 6px",whiteSpace:"nowrap"}}>{(()=>{
                            const rr=upRatingOf([entry.helm,entry.crew]);
                            if(!rr) return <span style={{color:"var(--mut)"}}>—</span>;
                            return rr.provisional
                              ?<span title="No rated results on AthLink yet — forecast seeds them at 1200 with the widest uncertainty" style={{fontSize:10,fontWeight:800,letterSpacing:".05em",color:"#b8860b",textTransform:"uppercase",background:"rgba(232,146,26,.13)",borderRadius:6,padding:"2px 7px"}}>new</span>
                              :<span style={{fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:13,color:"var(--navy)",fontVariantNumeric:"tabular-nums"}}>{Math.round(rr.r)}<span style={{color:"var(--mut)",fontWeight:600,fontSize:11}}> ±{Math.round(rr.rd)}</span></span>;
                          })()}</td>
                        :<td style={{textAlign:"center",padding:"8px 5px",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:14,color:rank===1?"var(--gold)":rank===2?"#7d8a98":rank===3?"#a86a32":"var(--ink)"}}>{rank||"—"}</td>}
                      <td style={{padding:"4px 6px",minWidth:110}}>
                        {previewEdit?.type==="helm"&&previewEdit.idx===idx
                          ?<input className="pe-input" autoFocus value={previewEditVal} onChange={e=>setPreviewEditVal(e.target.value)} onBlur={commitPreviewEdit} onKeyDown={e=>{if(e.key==="Enter")commitPreviewEdit();if(e.key==="Escape")setPreviewEdit(null);}}/>
                          :<div onClick={()=>startPreviewEdit("helm",idx,0,entry.helm)} style={{cursor:"text",padding:"4px 2px",borderRadius:4,minHeight:24,background:!entry.helm?"#fffbec":"transparent",border:!entry.helm?"1.5px solid #e8921a":"1.5px solid transparent",fontSize:12,fontWeight:600,color:"var(--ink)"}}>{entry.helm||<span style={{color:"#e8921a",fontStyle:"italic"}}>missing</span>}</div>}
                      </td>
                      {!singleHanded&&<td style={{padding:"4px 6px",minWidth:100}}>
                        {previewEdit?.type==="crew"&&previewEdit.idx===idx
                          ?<input className="pe-input" autoFocus value={previewEditVal} onChange={e=>setPreviewEditVal(e.target.value)} onBlur={commitPreviewEdit} onKeyDown={e=>{if(e.key==="Enter")commitPreviewEdit();if(e.key==="Escape")setPreviewEdit(null);}}/>
                          :<div onClick={()=>startPreviewEdit("crew",idx,0,entry.crew)} style={{cursor:"text",padding:"4px 2px",borderRadius:4,minHeight:24,fontSize:12,color:"var(--mut)"}}>{entry.crew||<span style={{fontStyle:"italic",opacity:.4}}>—</span>}</div>}
                      </td>}
                      <td style={{padding:"4px 4px",textAlign:"left",minWidth:80,fontSize:12,color:"var(--mut)"}}>
                        {previewEdit?.type==="sail"&&previewEdit.idx===idx
                          ?<input className="pe-input" autoFocus value={previewEditVal} onChange={e=>setPreviewEditVal(e.target.value)} onBlur={commitPreviewEdit} onKeyDown={e=>{if(e.key==="Enter")commitPreviewEdit();if(e.key==="Escape")setPreviewEdit(null);}}/>
                          :<div onClick={()=>startPreviewEdit("sail",idx,0,entry.sail)} style={{cursor:"text",padding:"4px 2px",borderRadius:4,minHeight:24}}>
                            {entry.nat?<>{iocFlag(entry.nat)} {entry.nat} </>:""}{entry.sail||"—"}
                          </div>}
                      </td>
                      <td style={{padding:"4px 6px",textAlign:"center"}}>
                        <div style={{display:"flex",flexDirection:"column",gap:5,alignItems:"center"}}>
                          <DivisionToggle value={divFromEntry(entry)} onChange={v=>applyPreviewDiv(idx,v)} noMix={singleHanded}/>
                        </div>
                      </td>
                      {Array.from({length:maxR}).map((_,raceIdx)=>{
                        const score=(entry.races||[])[raceIdx];
                        const isMissing=score===null||score===undefined||score==="";
                        const isEditing=previewEdit?.type==="score"&&previewEdit.idx===idx&&previewEdit.raceIdx===raceIdx;
                        const isDisc=scoredRow?.discardSet?.has(raceIdx);
                        return(<td key={raceIdx} style={{padding:"4px 2px",textAlign:"center",minWidth:34,background:isMissing?"#fffbec":"transparent",border:isMissing?"1.5px solid #e8921a":"1.5px solid transparent",cursor:"text"}}>
                          {isEditing
                            ?<input className="pe-input" autoFocus style={{width:38}} value={previewEditVal} onChange={e=>setPreviewEditVal(e.target.value)} onBlur={commitPreviewEdit} onKeyDown={e=>{if(e.key==="Enter")commitPreviewEdit();if(e.key==="Escape")setPreviewEdit(null);}}/>
                            :<div onClick={()=>startPreviewEdit("score",idx,raceIdx,score)} style={{fontSize:12,color:isMissing?"#e8921a":isCode(score)?"#c0392b":isDisc?"var(--mut)":"var(--ink)",fontStyle:isMissing?"italic":"normal"}}>
                              {isMissing?"?":(isCode(score)?score:isDisc?`(${score})`:score)}
                            </div>}
                        </td>);
                      })}
                      {!isUpEv&&<td style={{textAlign:"center",padding:"8px 6px",fontFamily:"'Barlow',sans-serif",fontWeight:700,color:"var(--navy)",fontSize:13}}>{net!==undefined?net:"—"}</td>}
                      <td style={{textAlign:"center",padding:"4px 2px",width:32}}>
                        <button type="button" title="Remove this athlete"
                          onClick={()=>setPreviewEv(ev=>({...ev,entries:ev.entries.filter((_,i)=>i!==idx)}))}
                          style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:24,height:24,padding:0,border:"1px solid transparent",borderRadius:6,background:"transparent",color:"var(--mut)",cursor:"pointer",transition:".12s"}}
                          onMouseEnter={e=>{e.currentTarget.style.color="#c0392b";e.currentTarget.style.background="rgba(192,57,43,.08)";e.currentTarget.style.borderColor="rgba(192,57,43,.25)";}}
                          onMouseLeave={e=>{e.currentTarget.style.color="var(--mut)";e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}>
                          <Trash2 size={13}/>
                        </button>
                      </td>
                    </tr>);
                  })}
                </tbody>
              </table>
            </div>
            <p style={{fontSize:11.5,color:"var(--mut)",margin:"8px 0 0"}}>{isUpEv?"Click any cell to edit · remove withdrawn boats with the bin · reopen this entry list any time via Edit entry list on the event page":"Scores in ( ) are discards · red = penalty · click any cell to edit · Net updates live"}</p>
            {/* ── Div-tag rename popover (fixed: the table wrap clips absolutes) ── */}
            {divHdrEdit&&(<>
              <div onClick={()=>setDivHdrEdit(null)} style={{position:"fixed",inset:0,zIndex:118}}/>
              <div style={{position:"fixed",left:Math.max(10,divHdrEdit.x),top:divHdrEdit.y,zIndex:119,width:250,background:"var(--card)",
                border:"1px solid var(--line)",borderRadius:12,boxShadow:"0 18px 44px -14px rgba(0,0,0,.32)",padding:"11px 13px"}}>
                <div style={{fontSize:11,fontWeight:800,letterSpacing:".05em",textTransform:"uppercase",color:"var(--navy)",marginBottom:8}}>Rename division tags</div>
                {!divHdrEdit.rows.length&&<p style={{fontSize:12,color:"var(--mut)",margin:0}}>No division tags on these results yet — tag a row first (click Jr on any row).</p>}
                {divHdrEdit.rows.map((row,ri)=>(
                  <div key={row.from} style={{display:"flex",alignItems:"center",gap:7,marginBottom:ri<divHdrEdit.rows.length-1?7:0}}>
                    <span style={{flex:"none",background:DIV_COLOR[row.from]||DIV_COLOR.Jr,color:"#fff",borderRadius:5,fontSize:10,fontWeight:700,
                      fontFamily:"'Barlow',sans-serif",padding:"2px 7px"}}>{row.from}</span>
                    <ChevronRight size={12} style={{flex:"none",color:"var(--mut)"}}/>
                    <input value={row.val} autoFocus={ri===0} maxLength={8}
                      onChange={e=>setDivHdrEdit(d=>({...d,rows:d.rows.map((x,i)=>i===ri?{...x,val:e.target.value}:x)}))}
                      onKeyDown={e=>{if(e.key==="Enter"&&row.val.trim()){renameDivToken(row.from,row.val);setDivHdrEdit(null);}if(e.key==="Escape")setDivHdrEdit(null);}}
                      style={{flex:1,minWidth:0,border:"1px solid var(--line)",borderRadius:7,padding:"5px 8px",font:"inherit",fontSize:12.5,outline:"none"}}/>
                    <button type="button" disabled={!row.val.trim()||row.val.trim()===row.from}
                      onClick={()=>{renameDivToken(row.from,row.val);setDivHdrEdit(null);}}
                      style={{flex:"none",border:0,background:(row.val.trim()&&row.val.trim()!==row.from)?"var(--accent)":"var(--line)",color:"#fff",
                        borderRadius:7,padding:"5px 10px",fontSize:11.5,fontWeight:700,cursor:(row.val.trim()&&row.val.trim()!==row.from)?"pointer":"not-allowed"}}>Apply</button>
                  </div>
                ))}
                <p style={{fontSize:10.5,color:"var(--mut)",margin:"9px 0 0",lineHeight:1.45}}>Applies to every row of this result — e.g. Jr → U18.</p>
              </div>
            </>)}
            <div className="import-actionbar">
              {!isUpEv&&<button className="btn ghost" disabled={!!savingResults} onClick={async()=>{if(savingResults)return;setSavingResults("draft");try{await (editResultsEv?saveEditedResults(true):importPreview(true));}finally{setSavingResults(null);}}}>{savingResults==="draft"?<Loader2 size={16} className="spin"/>:<Clock size={16}/>}Save as Draft</button>}
              <button className="btn cta liquidGlass-wrapper" disabled={!!savingResults} onClick={async()=>{if(savingResults)return;setSavingResults("publish");try{await (editResultsEv?saveEditedResults(false):importPreview(false));}finally{setSavingResults(null);}}}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{savingResults==="publish"?<Loader2 size={16} className="spin"/>:<CheckCircle size={16}/>}{editResultsEv?"Save changes":isUpEv?"Publish entry list":(pending.filter(p=>p.status!=="published").length>1?"Publish this result":"Confirm & Publish")}</div></button>
            </div>
            </>)}
          </div>);
        })()}
      </div>
    </div>
  )}

  {/* ── RACE CALENDAR MODAL ── */}
  {showCalendar&&(()=>{
    // Scope to a portal when opened from one, else all events.
    const sp=calScopePortal;
    const isClsScope=typeof sp==="string"&&sp.startsWith("class:");
    const scopeName=!sp?"Global"
      :isClsScope?`All ${classLabel(sp.slice(6))} Results`
      :(hostById(sp)?.name||"Global");
    const scopeEvents=!sp?events
      :isClsScope?events.filter(ev=>ev.cls===sp.slice(6))
      :events.filter(ev=>{
          // Your portal shows events you ORGANIZED (and that organizer status is
          // confirmed) plus events you co-organize. Externally-contributed events
          // (where you're only imported_by, or an unconfirmed attributed owner)
          // stay out of the portal and live in global calendar/search until claimed.
          if(ev.owner===sp) return ev.owner_confirmed!==false;
          return (ev.collabs||[]).includes(sp)||governingFeds(ev).map(f=>f.id).includes(sp);
        });
    const calEvs=scopeEvents.filter(ev=>calClsSet.size===0||calClsSet.has(ev.cls));
    const prevMonth=()=>{if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1);};
    const nextMonth=()=>{if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1);};
    const goToday=()=>{const n=new Date();setCalYear(n.getFullYear());setCalMonth(n.getMonth());};
    const toggleCls=(id)=>{
      if(id==="all"){setCalClsSet(new Set());return;}
      setCalClsSet(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
    };
    return(
      <div className="ov" onClick={()=>setShowCalendar(false)}>
        <div className="cal-modal" onClick={e=>e.stopPropagation()}>
          {/* Header: back button above the title; x vertically centered */}
          <div className="cal-head" style={{alignItems:"center"}}>
            <div style={{flex:1,minWidth:0}}>
              <button className="cal-back" onClick={()=>setShowCalendar(false)}><ArrowLeft size={15}/>Back</button>
              <h3 style={{marginTop:6}}>{scopeName} Calendar</h3>
            </div>
            <button className="x" onClick={()=>setShowCalendar(false)}><X size={16}/></button>
          </div>
          {/* Toolbar: month/day toggle + competition count + floating class pills */}
          <div className="cal-toolbar">
            <button className="cal-viewtoggle" onClick={()=>setCalViewMode(v=>v==="year"?"month":"year")} title={calViewMode==="year"?"Switch to month view":"Switch to year view"}>
              {calViewMode==="year"?<LayoutGrid size={13}/>:<Calendar size={13}/>}
              <span id="cal-cur-label">{calViewMode==="year"?String(calYear):`${MON[calMonth]} ${calYear}`}</span>
            </button>
            <span style={{fontSize:13,fontWeight:700,color:"var(--navy)",fontFamily:"'Barlow',sans-serif"}}>
              {calEvs.length} competition{calEvs.length!==1?"s":""}{calClsSet.size>0?" shown":""}
            </span>
            <div className="cal-cls-box" style={{marginLeft:"auto"}}>
              <button className={`cal-cls-mini${calClsSet.size===0?" on":""}`} onClick={()=>toggleCls("all")}
                style={calClsSet.size===0?{background:"var(--navy)",color:"#fff",borderColor:"var(--navy)"}:{}}>All</button>
              {CLASSES.map(({id,short})=>{const on=calClsSet.has(id);return(
                <button key={id} className={`cal-cls-mini${on?" on":""}`} onClick={()=>toggleCls(id)}
                  style={on?{background:classColor(id),color:"#fff",borderColor:classColor(id)}:{color:classColor(id),borderColor:classColorA(id,.5)}}>{short}</button>);})}
            </div>
          </div>
          <CalendarBody events={calEvs} allEvents={scopeEvents} year={calYear} month={calMonth}
            setYear={setCalYear} setMonth={setCalMonth} viewMode={calViewMode} setViewMode={setCalViewMode}
            onPick={(ev)=>{setShowCalendar(false);setPortal(ev.owner||null);go({name:"event",id:ev.id});}}/>
        </div>
      </div>
    );
  })()}

  {/* ── SAILOR CALENDAR MODAL ── */}
  {showSailorCal&&(()=>{
    const baseEvs=events.filter(ev=>ev.entries.some(e=>e.helm===sailorCalName||e.crew===sailorCalName));
    const sailorEvs=baseEvs.filter(ev=>sailorCalClsSet.size===0||sailorCalClsSet.has(ev.cls));
    const prevM=()=>{if(sailorCalMonth===0){setSailorCalMonth(11);setSailorCalYear(y=>y-1);}else setSailorCalMonth(m=>m-1);};
    const nextM=()=>{if(sailorCalMonth===11){setSailorCalMonth(0);setSailorCalYear(y=>y+1);}else setSailorCalMonth(m=>m+1);};
    const goTodayS=()=>{const n=new Date();setSailorCalYear(n.getFullYear());setSailorCalMonth(n.getMonth());};
    const toggleSCls=(id)=>{
      if(id==="all"){setSailorCalClsSet(new Set());return;}
      setSailorCalClsSet(prev=>{const s=new Set(prev);s.has(id)?s.delete(id):s.add(id);return s;});
    };
    return(
      <div className="ov" onClick={()=>setShowSailorCal(false)}>
        <div className="cal-modal" onClick={e=>e.stopPropagation()}>
          <div className="cal-head" style={{alignItems:"center"}}>
            <div style={{flex:1,minWidth:0}}>
              <button className="cal-back" onClick={()=>setShowSailorCal(false)}><ArrowLeft size={15}/>Back</button>
              <h3 style={{marginTop:6}}>{sailorCalName} — Calendar</h3>
            </div>
            <button className="x" onClick={()=>setShowSailorCal(false)}><X size={16}/></button>
          </div>
          <div className="cal-toolbar">
            <button className="cal-viewtoggle" onClick={()=>setSailorCalViewMode(v=>v==="year"?"month":"year")} title={sailorCalViewMode==="year"?"Switch to month view":"Switch to year view"}>
              {sailorCalViewMode==="year"?<LayoutGrid size={13}/>:<Calendar size={13}/>}
              <span id="cal-cur-label">{sailorCalViewMode==="year"?String(sailorCalYear):`${MON[sailorCalMonth]} ${sailorCalYear}`}</span>
            </button>
            <span style={{fontSize:13,fontWeight:700,color:"var(--navy)",fontFamily:"'Barlow',sans-serif"}}>
              {sailorEvs.length} competition{sailorEvs.length!==1?"s":""}{sailorCalClsSet.size>0?" shown":""}
            </span>
            <div className="cal-cls-box" style={{marginLeft:"auto"}}>
              <button className={`cal-cls-mini${sailorCalClsSet.size===0?" on":""}`} onClick={()=>toggleSCls("all")}
                style={sailorCalClsSet.size===0?{background:"var(--navy)",color:"#fff",borderColor:"var(--navy)"}:{}}>All</button>
              {CLASSES.map(({id,short})=>{const on=sailorCalClsSet.has(id);return(
                <button key={id} className={`cal-cls-mini${on?" on":""}`} onClick={()=>toggleSCls(id)}
                  style={on?{background:classColor(id),color:"#fff",borderColor:classColor(id)}:{color:classColor(id),borderColor:classColorA(id,.5)}}>{short}</button>);})}
            </div>
          </div>
          <CalendarBody events={sailorEvs} allEvents={baseEvs} year={sailorCalYear} month={sailorCalMonth}
            setYear={setSailorCalYear} setMonth={setSailorCalMonth} viewMode={sailorCalViewMode} setViewMode={setSailorCalViewMode}
            onPick={(ev)=>{setShowSailorCal(false);setPortal(ev.owner||null);go({name:"event",id:ev.id});}}
            eventLabel={(ev)=>{const e=ev.entries.find(e=>e.helm===sailorCalName||e.crew===sailorCalName);const s=scoreEvent(ev);const row=e?s.rows.find(r=>r.helm===e.helm&&r.sail===e.sail):null;return (row?`#${row.rank} `:"")+ev.name;}}/>
        </div>
      </div>
    );
  })()}

  {hostFootprintOpen&&portal&&(
    <ErrorBoundary resetKey={portal} fallback={<div className="ov" onClick={()=>setHostFootprintOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440,padding:24,textAlign:"center"}}><p style={{margin:"0 0 14px",fontWeight:600}}>Couldn't open this host's map.</p><button className="btn cta liquidGlass-wrapper" onClick={()=>setHostFootprintOpen(false)}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Close</div></button></div></div>}>
      <FootprintModal name={portalName} ag={{history:hostHistory}} countryCounts={hostCountryCounts} hostMode titleSuffix="Competitions" onClose={()=>setHostFootprintOpen(false)}/>
    </ErrorBoundary>
  )}
  {regattaFootprint&&(
    <ErrorBoundary resetKey={regattaFootprint.id}
      fallback={<div className="ov" onClick={()=>setRegattaFootprint(null)}><div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440,padding:24,textAlign:"center"}}><p style={{margin:"0 0 14px",color:"var(--ink)",fontWeight:600}}>Couldn't open this competition's map.</p><button className="btn cta liquidGlass-wrapper" onClick={()=>setRegattaFootprint(null)}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">Close</div></button></div></div>}>
      <RegattaFootprintModal event={regattaFootprint} homeCountry={homeCountry} onClose={()=>setRegattaFootprint(null)}
        onPickAthlete={(nm)=>{const evId=regattaFootprint.id;setRegattaFootprint(null);setPortal(regattaFootprint.cls);go({name:"profile",id:nm,fromRegatta:evId});}}/>
    </ErrorBoundary>
  )}

  {deleteConfirm&&(
    <div style={{position:"fixed",inset:0,zIndex:75}} onClick={()=>setDeleteConfirm(null)}>
      <div className="del-confirm" style={{top:Math.min(deleteConfirm.y+4,window.innerHeight-120),left:Math.max(deleteConfirm.x-230,8)}} onClick={e=>e.stopPropagation()}>
        <p>Remove <span className="del-name">"{deleteConfirm.name}"</span>?</p>
        <div className="del-confirm-btns">
          <button className="btn ghost" style={{flex:1,fontSize:12,padding:"6px 10px"}} onClick={()=>setDeleteConfirm(null)}>Cancel</button>
          <button className="btn" style={{flex:1,fontSize:12,padding:"6px 10px",background:"#e74c3c",color:"#fff"}} disabled={busyAction==="delEvent"} onClick={()=>runBusy("delEvent",confirmDelete)}>{busyAction==="delEvent"?<Loader2 size={13} className="spin"/>:<Trash2 size={13}/>}Delete</button>
        </div>
      </div>
    </div>
  )}

  {editEvMeta&&(
    <div className="ov" onClick={()=>setEditEvMeta(null)}>
      <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
        <div className="mhead"><Pencil size={17}/><h3>Edit competition details</h3><button className="x" onClick={()=>setEditEvMeta(null)}><X size={16}/></button></div>
        <div className="mbody">
          <div className="meta-grid" style={{gridTemplateColumns:"1fr"}}>
            <div><label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Competition name</label>
            <input value={editEvMeta.name} onChange={e=>setEditEvMeta(m=>({...m,name:e.target.value}))} style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/></div>
          </div>
          <div className="meta-grid three" style={{marginTop:10}}>
            <div><label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Date</label>
            <input value={editEvMeta.date} onChange={e=>setEditEvMeta(m=>({...m,date:e.target.value}))} placeholder="dd/mm/yyyy" style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/></div>
            <div><label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Host Country</label>
            <CountrySelect value={editEvMeta.country||""} onChange={v=>setEditEvMeta(m=>({...m,country:v}))}/></div>
            <div><label style={{fontSize:12,color:"var(--mut)",display:"block",marginBottom:3,fontWeight:600}}>Discards</label>
            <input type="number" min="0" max="20" value={editEvMeta.discards} onChange={e=>setEditEvMeta(m=>({...m,discards:e.target.value}))} style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"8px 10px",font:"inherit",fontSize:13,background:"#fff",outline:"none"}}/></div>
          </div>
          <div className="mfoot" style={{marginTop:16}}>
            <button className="btn ghost" onClick={()=>setEditEvMeta(null)}>Cancel</button>
            <button className="btn cta liquidGlass-wrapper" disabled={busyAction==="evMeta"} onClick={()=>runBusy("evMeta",saveEvMeta)}><div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{busyAction==="evMeta"?<Loader2 size={15} className="spin"/>:<CheckCircle size={15}/>}Save changes</div></button>
          </div>
        </div>
      </div>
    </div>
  )}

  {note&&(<div className="notice"><div className="ico"><Sparkles size={18}/></div>
    <div><b>{note.name}</b>
    <div style={{fontSize:13,color:"#bcd2e8",marginTop:2}}>
      {note.msg||`Matched ${note.matched} athletes · ${note.created} new profiles created`}
    </div></div></div>)}
  {showAddHost&&(
    <div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAddHost(false);}} style={{position:"fixed",inset:0,background:"rgba(8,20,40,.55)",zIndex:90,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"60px 16px",overflow:"auto"}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:460,width:"100%",boxShadow:"0 24px 60px -20px rgba(0,0,0,.4)"}}>
        <div style={{background:"var(--navy)",color:"#fff",padding:"16px 20px",borderRadius:"14px 14px 0 0",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <strong style={{fontSize:16}}>Add a host</strong>
          <button onClick={()=>setShowAddHost(false)} style={{border:0,background:"rgba(255,255,255,.15)",color:"#fff",borderRadius:8,padding:6,cursor:"pointer",display:"flex"}}><X size={16}/></button>
        </div>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:5}}>Type</label>
            <div style={{display:"flex",gap:6}}>
              {[["association","Association"],["club","Club"],["federation","Federation"]].map(([v,l])=>(
                <button key={v} type="button" onClick={()=>setNewHost(h=>({...h,type:v}))}
                  style={{flex:1,border:"1px solid "+(newHost.type===v?"var(--accent)":"var(--line)"),background:newHost.type===v?"var(--accent)":"#fff",color:newHost.type===v?"#fff":"var(--navy)",borderRadius:8,padding:"7px 8px",fontSize:13,fontWeight:600,cursor:"pointer"}}>{l}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:5}}>Name</label>
            <input value={newHost.name} onChange={e=>setNewHost(h=>({...h,name:e.target.value}))} placeholder="e.g. Aberdeen Boat Club"
              style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"9px 11px",font:"inherit",fontSize:13,outline:"none"}}/>
          </div>
          <div style={{display:"flex",gap:12}}>
            <div style={{flex:1}}>
              <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:5}}>Region</label>
              <div style={{display:"flex",gap:6}}>
                {[["HK","Hong Kong"],["INT","International"]].map(([v,l])=>(
                  <button key={v} type="button" onClick={()=>setNewHost(h=>({...h,scope:v}))}
                    style={{flex:1,border:"1px solid "+(newHost.scope===v?"var(--accent)":"var(--line)"),background:newHost.scope===v?"var(--sky)":"#fff",color:"var(--navy)",borderRadius:8,padding:"7px 8px",fontSize:12.5,fontWeight:600,cursor:"pointer"}}>{l}</button>
                ))}
              </div>
            </div>
            {newHost.type==="association"&&<div style={{flex:1}}>
              <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:5}}>Boat class</label>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
                {CLASSES.map(c=>(
                  <button key={c.id} type="button" onClick={()=>setNewHost(h=>({...h,cls:c.id}))}
                    style={{border:"1px solid "+(newHost.cls===c.id?classColor(c.id):"var(--line)"),background:newHost.cls===c.id?classColor(c.id):"#fff",color:newHost.cls===c.id?"#fff":"var(--mut)",borderRadius:7,fontSize:12,fontWeight:700,padding:"5px 9px",cursor:"pointer"}}>{c.short}</button>
                ))}
                <CustomClassPicker classes={customClasses}
                  value={CLASSES.some(c=>c.id===newHost.cls)?null:newHost.cls}
                  onSelect={id=>setNewHost(h=>({...h,cls:id}))}
                  onAdd={name=>addCustomClass(name)}/>
              </div>
            </div>}
            {newHost.type==="federation"&&<div style={{flex:1}}>
              <label style={{fontSize:12,color:"var(--mut)",fontWeight:600,display:"block",marginBottom:5}}>Governing country (IOC)</label>
              <input value={newHost.country} onChange={e=>setNewHost(h=>({...h,country:e.target.value.toUpperCase().slice(0,3)}))} placeholder="HKG" maxLength={3}
                style={{width:"100%",border:"1px solid var(--line)",borderRadius:8,padding:"9px 11px",font:"inherit",fontSize:13,outline:"none",textTransform:"uppercase"}}/>
            </div>}
          </div>
          {newHost.type==="federation"&&<p style={{fontSize:11.5,color:"var(--mut)",margin:0}}>Federations auto-collaborate on every competition hosted in their country.</p>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:4}}>
            <button className="btn ghost" style={{fontSize:13,padding:"8px 14px"}} onClick={()=>setShowAddHost(false)}>Cancel</button>
            <button className="btn cta liquidGlass-wrapper" style={{fontSize:13,padding:"8px 16px"}} disabled={!newHost.name.trim()||addingHost} onClick={saveNewHost}>
              <div className="liquidGlass-effect"/><div className="liquidGlass-tint"/><div className="liquidGlass-shine"/><div className="liquidGlass-text">{addingHost?<><Loader2 size={15} className="spin"/>Saving…</>:<>Add host</>}</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )}
  <ConfirmModal state={confirmState} onClose={()=>setConfirmState(null)}/>
  <div className="foot">Powered by AthLink</div>
  </div>
  );
}

/* ── Landing-page embeds ─────────────────────────────────────────────────────
   The all-sports landing (apps/web/src/Landing.jsx) reuses the interactive
   globe + athlete web as live demos, and needs the DB→app event mapper plus
   the IOC→ISO country map to feed them. Re-exported via manifest.jsx. */
export { SailingGlobe, AthleteWeb, ProgressChart, aggregate, dbToApp, IOC_ISO };
