/* Triathlon portal — "coming soon" placeholder.
   Uses shared design-system components so it matches every other sport.
   Replace with the real homepage + results when the sport goes live. */
import React from "react";
import { PageHeader, Card } from "@athlink/design-system";
import { Activity } from "lucide-react";

export default function Portal() {
  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <PageHeader title="Triathlon" sub="Swim, bike, run — competitions & athlete profiles" />

      <Card>
        <div style={{ display: "grid", placeItems: "center", gap: 12, padding: "48px 20px", textAlign: "center" }}>
          <Activity size={40} color="var(--accent)" />
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Coming soon</h2>
          <p style={{ margin: 0, maxWidth: 440, color: "var(--muted, #667)", lineHeight: 1.5 }}>
            The Triathlon portal is on its way — competitions, results and athlete
            profiles across swim, bike and run. Check back shortly.
          </p>
        </div>
      </Card>
    </div>
  );
}
