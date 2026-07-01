/* AthLink shell — the landing page (all sports) + a hash router that lazy-loads
   each sport portal. Sports register themselves in sports.js (via create-sport),
   so this file never needs editing when a sport is added. */
import React, { Suspense } from "react";
import { ThemeRoot } from "@athlink/design-system";
import { Loader2, ArrowLeft } from "lucide-react";
import { sports } from "./sports.js";
import Landing from "./Landing.jsx";

function useHashRoute() {
  const [hash, setHash] = React.useState(window.location.hash);
  React.useEffect(() => {
    const f = () => setHash(window.location.hash);
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return hash.replace(/^#\/?/, "").split("/")[0];
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
      href="#/"
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
  const route = useHashRoute();
  const sport = sports.find((s) => s.id === route);

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
