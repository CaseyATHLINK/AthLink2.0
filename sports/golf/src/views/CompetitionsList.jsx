/* Golf homepage — grid of competition cards. Click a card to open its leaderboard.
   Uses shared Card/Chip; layout-only inline styles (no colors/fonts). */
import React from "react";
import { Card, Chip } from "@athlink/design-system";
import { getCompetitions } from "../data/mock.js";

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function CompetitionsList({ onOpen }) {
  const competitions = getCompetitions();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
      {competitions.map((c) => (
        <Card key={c.id} hoverable onClick={() => onOpen(c.id)} style={{ cursor: "pointer" }}>
          <div style={{ fontWeight: 700, fontSize: 17, color: "var(--ink)" }}>{c.name}</div>
          <div style={{ marginTop: 6, fontSize: 14, color: "var(--mut)" }}>
            {fmtDate(c.date)} · {c.venue}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <Chip>{c.rounds} {c.rounds === 1 ? "round" : "rounds"}</Chip>
            <Chip>{c.athleteCount} athletes</Chip>
          </div>
        </Card>
      ))}
    </div>
  );
}
