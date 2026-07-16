/* Sailing date helpers — pure, no deps. Extracted verbatim from App.jsx
   (repo reorg step 4: decompose the monolith into util/data/views like golf). */

export const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export function formatDate(str){
  if(!str||str==="—") return str||"—";
  const m=str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if(m){const d=parseInt(m[1]),mo=parseInt(m[2])-1,y=m[3];if(mo>=0&&mo<=11) return `${d} ${MON[mo]} ${y}`;}
  return str;
}
// Sortable YYYYMMDD key from a dd/mm/yyyy-ish date string. Zero-pads 1-digit
// day/month (naive split-reverse-join mis-sorts "5/6/2024" vs "20/11/2024") and
// tolerates ranges like "12-15/06/2024" (uses the last complete d/m/yyyy found).
// Returns "" for missing/unparseable dates — callers must treat "" as "no date",
// NOT as "most recent" (the old code let the "—" placeholder outrank all digits).
export function dateKey(str){
  const s=String(str||"");
  const re=/(\d{1,2})\/(\d{1,2})\/(\d{4})/g;
  let m,last=null;
  while((m=re.exec(s))) last=m;
  return last?last[3]+last[2].padStart(2,"0")+last[1].padStart(2,"0"):"";
}
// Signed month difference between two dateKey strings ("yyyymmdd"): months(dkB) -
// months(dkA), where months = year*12 + (month-1). Returns 0 if either key is
// empty/short. Callers that want elapsed time take Math.abs (idle months, decay).
export function monthsBetween(dkA,dkB){
  if(!dkA||!dkB||dkA.length<6||dkB.length<6) return 0;
  const ya=+dkA.slice(0,4),ma=+dkA.slice(4,6);
  const yb=+dkB.slice(0,4),mb=+dkB.slice(4,6);
  return (yb*12+(mb-1))-(ya*12+(ma-1));
}
