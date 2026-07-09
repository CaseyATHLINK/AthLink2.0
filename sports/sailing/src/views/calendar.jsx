/* Calendar view for sailing — the scrollable month-grid components and their
   grid/pie helpers. Reorg step 4: views/ module, mirroring sports/golf/src/views/.
   Verbatim from App.jsx. */

import React, { useEffect, useMemo, useRef } from "react";
import { MON } from "../util/date.js";
import { classColor } from "../util/class.js";

/* ── Calendar grid helper ─────────────────────────────────────────────── */
export function buildCalGrid(year, month, evList){
  // Returns 6 rows × 7 cols of {date, isCurrentMonth, isToday, events[]}
  const today=new Date();
  const firstDay=new Date(year,month,1).getDay(); // 0=Sun
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  // Previous month fill
  const prevDays=new Date(year,month,0).getDate();
  for(let i=firstDay-1;i>=0;i--){
    cells.push({day:prevDays-i,month:month-1<0?11:month-1,year:month-1<0?year-1:year,other:true,events:[]});
  }
  // Current month
  for(let d=1;d<=daysInMonth;d++){
    const isToday=today.getFullYear()===year&&today.getMonth()===month&&today.getDate()===d;
    const dayEvs=evList.filter(ev=>{
      const p=ev.date.split('/');
      if(p.length!==3) return false;
      return parseInt(p[0])===d&&parseInt(p[1])-1===month&&parseInt(p[2])===year;
    });
    cells.push({day:d,month,year,other:false,today:isToday,events:dayEvs});
  }
  // Next month fill
  let next=1;
  while(cells.length%7!==0) cells.push({day:next++,month:month+1>11?0:month+1,year:month+1>11?year+1:year,other:true,events:[]});
  // Split into rows
  const rows=[];for(let i=0;i<cells.length;i+=7)rows.push(cells.slice(i,i+7));
  return rows;
}

/* ── CalendarBody: month-grid day view + year overview, with pie-split circles ── */
// Build a conic-gradient style for a day circle split by class (pie).
export function classPie(comps){
  if(!comps||!comps.length) return null;
  // count per class, preserve order of first appearance
  const order=[]; const counts={};
  comps.forEach(ev=>{const c=ev.cls;if(!(c in counts)){counts[c]=0;order.push(c);}counts[c]++;});
  const total=comps.length;
  if(order.length===1) return {background:classColor(order[0])};
  let acc=0; const segs=[];
  order.forEach(c=>{const start=acc/total*360;acc+=counts[c];const endd=acc/total*360;segs.push(`${classColor(c)} ${start}deg ${endd}deg`);});
  return {background:`conic-gradient(${segs.join(",")})`};
}

export function CalendarBody({events,allEvents,year,month,setYear,setMonth,viewMode,setViewMode,onPick,eventLabel}){
  const today=React.useMemo(()=>new Date(),[]);
  const DAYS=React.useMemo(()=>["Sun","Mon","Tue","Wed","Thu","Fri","Sat"],[]);
  // Scroll refs
  const yearScrollRef=React.useRef(null);
  const monthScrollRef=React.useRef(null);
  // Prevent programmatic scroll from triggering IO update loop
  const progScrollRef=React.useRef(false);   // true while doing programmatic scroll
  const fromScrollRef=React.useRef(false);   // (legacy) true when IO just set year/month
  const navTargetRef=React.useRef(true);     // true when a nav button / year-click set the target → scroll to it
  const scrollTimerRef=React.useRef(null);
  // Always-fresh refs for scroll handlers (avoid stale closures)
  const yrRef=React.useRef(year); yrRef.current=year;
  const moRef=React.useRef({year,month}); moRef.current={year,month};

  // ── Year view: scroll to current year whenever we enter it
  React.useEffect(()=>{
    if(viewMode!=="year"||!yearScrollRef.current) return;
    const el=yearScrollRef.current.querySelector(`[data-yr="${year}"]`);
    if(el){
      progScrollRef.current=true;
      el.scrollIntoView({block:"start",behavior:"instant"});
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current=setTimeout(()=>{progScrollRef.current=false;},200);
    }
  },[viewMode,year]); // year dep so < > nav buttons scroll correctly

  // ── Year view: update header year as user scrolls
  React.useEffect(()=>{
    if(viewMode!=="year"||!yearScrollRef.current) return;
    const c=yearScrollRef.current;
    const onScroll=()=>{
      if(progScrollRef.current) return;
      const cr=c.getBoundingClientRect();
      for(const el of c.querySelectorAll("[data-yr]")){
        if(el.getBoundingClientRect().bottom>cr.top+10){
          const yr=parseInt(el.dataset.yr);
          if(!isNaN(yr)){ yrRef.current=yr; const lbl=document.getElementById("cal-cur-label"); if(lbl) lbl.textContent=String(yr); }
          break;
        }
      }
    };
    c.addEventListener("scroll",onScroll,{passive:true});
    return()=>c.removeEventListener("scroll",onScroll);
  },[viewMode]);

  // ── Month view: scroll to a month ONLY on first entry into month view, or when
  //    the change came from the year picker. NEVER re-scroll on scroll-driven
  //    updates — that was the source of the year-jump jerkiness.
  const didInitScrollRef=React.useRef(false);
  React.useEffect(()=>{
    if(viewMode!=="month"){didInitScrollRef.current=false;return;}
    if(!monthScrollRef.current) return;
    // Only auto-scroll when explicitly targeted (year-picker / nav), or once on enter.
    if(didInitScrollRef.current&&!navTargetRef.current){navTargetRef.current=true;return;}
    const el=monthScrollRef.current.querySelector(`[data-ym="${year}-${month}"]`);
    if(el){
      progScrollRef.current=true;
      clearTimeout(scrollTimerRef.current);
      el.scrollIntoView({block:"start",behavior:"instant"});
      scrollTimerRef.current=setTimeout(()=>{progScrollRef.current=false;},250);
    }
    didInitScrollRef.current=true;
    navTargetRef.current=false; // subsequent year/month changes are scroll-driven → no re-scroll
  },[year,month,viewMode]);

  // ── Month view: track the visible month WITHOUT triggering React re-renders or
  //    scroll-to effects. We update a ref (used as the year-toggle target) and set
  //    a tiny header label via direct DOM write — keeps the wheel perfectly smooth.
  React.useEffect(()=>{
    if(viewMode!=="month"||!monthScrollRef.current) return;
    const c=monthScrollRef.current;
    let ticking=false;
    const read=()=>{
      ticking=false;
      const cr=c.getBoundingClientRect();
      const anchor=cr.top+8;
      let pick=null;
      for(const el of c.querySelectorAll("[data-ym]")){
        const r=el.getBoundingClientRect();
        if(r.top<=anchor&&r.bottom>anchor){pick=el;break;}
        if(r.top>anchor){pick=pick||el;break;}
      }
      if(!pick) return;
      const [ys,ms]=pick.dataset.ym.split("-");
      const y=parseInt(ys),m=parseInt(ms);
      if(!isNaN(y)&&!isNaN(m)){
        moRef.current={year:y,month:m}; yrRef.current=y;   // remember for year-toggle target
        const lbl=document.getElementById("cal-cur-label");
        if(lbl) lbl.textContent=`${MON[m]} ${y}`;
      }
    };
    const onScroll=()=>{ if(!ticking){ticking=true;requestAnimationFrame(read);} };
    c.addEventListener("scroll",onScroll,{passive:true});
    read();
    return()=>c.removeEventListener("scroll",onScroll);
  },[viewMode]);

  // ── Fixed render range: Jan 1990 → Dec (currentYear + 3). Stable across data
  //    and filter changes, so the month list never re-renders mid-scroll (which
  //    was causing the scroll-up jumpiness). Re-derives only when the year rolls.
  const lo=1990;
  const hi=today.getFullYear()+3;
  const yearList=[];for(let y=lo;y<=hi;y++)yearList.push(y);
  // Month list (memoized stable ref) — declared before any early return so hook
  // order stays constant across year/month views.
  const allMonths=React.useMemo(()=>{
    const out=[];
    for(let y=lo;y<=hi;y++) for(let m=0;m<12;m++) out.push({year:y,month:m});
    return out;
  },[lo,hi]);

  // ── YEAR VIEW
  if(viewMode==="year"){
    const openMonth=(y,mi)=>{setYear(y);setMonth(mi);setViewMode("month");};
    return(
      <div className="cal-year-scroll" ref={yearScrollRef}>
        {yearList.map(y=>(
          <div key={y} className="cal-year-block" data-yr={y}>
            <div className="cal-year-label">{y}</div>
            <div className="cal-year-grid">
              {MON.map((mn,mi)=>(
                <div key={mi} className="cal-mini" onClick={()=>openMonth(y,mi)}>
                  <div className="cal-mini-name">{mn}</div>
                  <div className="cal-mini-dow">{["S","M","T","W","T","F","S"].map((d,k)=><span key={k}>{d}</span>)}</div>
                  <div className="cal-mini-grid">
                    {buildCalGrid(y,mi,events).flat().map((c,ci)=>{
                      const comps=c.other?[]:c.events;
                      const isT=!c.other&&today.getFullYear()===y&&today.getMonth()===mi&&today.getDate()===c.day;
                      const pie=comps.length?classPie(comps):null;
                      const st=pie?{...pie,color:"#fff",fontWeight:700}
                              :isT?{background:"var(--accent)",color:"#fff",fontWeight:700}:{};
                      return<span key={ci} className={"cal-mini-day"+(c.other?" o":"")} style={st}>{c.day}</span>;
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── MONTH VIEW — continuous scroll (Apple Calendar style)

  return(
    <div className="cal-month-scroll" ref={monthScrollRef}>
      <CalMonthList months={allMonths} events={events} onPick={onPick} eventLabel={eventLabel} today={today} DAYS={DAYS}/>
    </div>
  );
}

// Memoized so the (480-month) grid only re-renders when events change — NOT on
// every scroll-driven year/month header update. This is what keeps scroll smooth.
// Custom comparator ignores onPick/eventLabel identity (they're stable in intent,
// just re-created each parent render) so scrolling never forces a 480-grid rebuild.
export const CalMonthList=React.memo(function CalMonthList({months,events,onPick,eventLabel,today,DAYS}){
  // keep latest callbacks without re-rendering on their identity change
  const cbRef=React.useRef({onPick,eventLabel});
  cbRef.current={onPick,eventLabel};
  return months.map(({year:y,month:m})=>{
    const monthCount=events.filter(ev=>{const dp=(ev.date||"").split("/");return dp.length===3&&parseInt(dp[1])-1===m&&parseInt(dp[2])===y;}).length;
    return(
    <div key={`${y}-${m}`} data-ym={`${y}-${m}`} className="cal-month-block">
      <div className="cal-month-lbl">{MON[m]} {y}{monthCount>0?<span style={{fontWeight:600,color:"var(--mut)",fontSize:13,marginLeft:8}}>· {monthCount} competition{monthCount!==1?"s":""}</span>:null}</div>
      <div className="cal-grid">{DAYS.map(d=><div key={d} className="cal-dow">{d}</div>)}</div>
      <div className="cal-grid">
        {buildCalGrid(y,m,events).flat().map((cell,i)=>{
          const comps=cell.other?[]:cell.events;
          const pie=comps.length?classPie(comps):null;
          const isT=!cell.other&&today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===cell.day;
          return(
            <div key={i} className={`cal-cell${cell.other?" other-month":""}${isT?" today":""}`}>
              <div className="cal-cell-num" style={pie?{...pie,color:"#fff"}:isT?{background:"var(--accent)",color:"#fff"}:{}}>{cell.day}</div>
              {comps.map(ev=>(
                <div key={ev.id} className="cal-cell-ev" style={{background:classColor(ev.cls)}} title={ev.name} onClick={()=>cbRef.current.onPick(ev)}>
                  {cbRef.current.eventLabel?cbRef.current.eventLabel(ev):ev.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );});
},(prev,next)=>prev.months===next.months&&prev.events===next.events&&prev.today===next.today&&prev.DAYS===next.DAYS);
