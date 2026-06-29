/* AthLink shell — the landing page (all sports) + a hash router that lazy-loads
   each sport portal. Sports register themselves in sports.js (via create-sport),
   so this file never needs editing when a sport is added. */
import React, { Suspense } from "react";
import { ThemeRoot, Card, PageHeader } from "@athlink/design-system";
import { Loader2, ChevronRight, ArrowLeft } from "lucide-react";
import { sports } from "./sports.js";

function useHashRoute() {
  const [hash, setHash] = React.useState(window.location.hash);
  React.useEffect(() => {
    const f = () => setHash(window.location.hash);
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return hash.replace(/^#\/?/, "").split("/")[0];
}

function Landing() {
  return (
    <div className="wrap" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <PageHeader title="AthLink" sub="Competition results & athlete profiles across sports" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
          gap: 16,
          marginTop: 18,
        }}
      >
        {sports.map((s) => (
          <a key={s.id} href={`#/${s.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <Card hoverable>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, color: "var(--ink)" }}>{s.name}</div>
                  <div style={{ fontSize: 13, color: "var(--mut)", marginTop: 4 }}>{s.tagline}</div>
                </div>
                <ChevronRight size={20} color="var(--accent)" />
              </div>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
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
    return (
      <ThemeRoot>
        <Landing />
      </ThemeRoot>
    );
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
