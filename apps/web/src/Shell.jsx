/* AthLink shell — the landing page (all sports) + a hash router that lazy-loads
   each sport portal. Sports register themselves in sports.js (via create-sport),
   so this file never needs editing when a sport is added. */
import React, { Suspense } from "react";
import { ThemeRoot } from "@athlink/design-system";
import { Loader2, ArrowLeft } from "lucide-react";
import { sports } from "./sports.js";
import Landing from "./Landing.jsx";

// Path-based routing. The first segment picks the view:
//   ""            → AthLink landing (all sports)
//   a sport id    → that sport's portal (e.g. /sailing)
//   anything else → the default sport, which owns the flat entity namespace
//                   (/HongKongSailingFederation, /CaseyLaw, /ranking, …)
// Sports push new paths via history + a "locationchange" event, so we listen to
// both that and the native popstate (back/forward buttons).
const DEFAULT_SPORT = "sailing";
function usePathRoute() {
  const [path, setPath] = React.useState(window.location.pathname);
  React.useEffect(() => {
    const f = () => setPath(window.location.pathname);
    window.addEventListener("popstate", f);
    window.addEventListener("locationchange", f);
    return () => {
      window.removeEventListener("popstate", f);
      window.removeEventListener("locationchange", f);
    };
  }, []);
  return path.split("/").filter(Boolean)[0] || "";
}

function Spinner() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <Loader2 className="spin" size={26} color="var(--accent)" />
    </div>
  );
}

function HomeLink() {
  return (
    <a
      href="/"
      onClick={(e) => { e.preventDefault(); window.history.pushState(null, "", "/"); window.dispatchEvent(new Event("locationchange")); }}
      style={{
        position: "fixed", top: 12, left: 14, zIndex: 200,
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 13, fontWeight: 700, color: "#fff", textDecoration: "none",
        background: "var(--mat-dark)", backdropFilter: "blur(20px)",
        padding: "6px 12px", borderRadius: 980,
      }}
    >
      <ArrowLeft size={14} /> All sports
    </a>
  );
}

export default function Shell() {
  const seg0 = usePathRoute();

  if (!seg0) {
    return <Landing sports={sports} />;
  }
  // Explicit sport id wins; otherwise a bare entity slug (host/athlete) belongs
  // to the default sport, which resolves it internally from the full path.
  const sport =
    sports.find((s) => s.id === seg0) || sports.find((s) => s.id === DEFAULT_SPORT);

  if (!sport) {
    return <Landing sports={sports} />;
  }

  const Portal = sport.Portal;
  return (
    <ThemeRoot>
      {!sport.providesOwnNav && <HomeLink />}
      <Suspense fallback={<Spinner />}>
        <Portal />
      </Suspense>
    </ThemeRoot>
  );
}
