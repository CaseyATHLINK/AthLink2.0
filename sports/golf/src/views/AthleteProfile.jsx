/* Golf athlete profile — identity panel + competition history.
   Click a history row to jump to that competition's leaderboard. */
import React from "react";
import { Panel, Chip, ResultsTable } from "@athlink/design-system";
import { getAthlete } from "../data/mock.js";
import { formatToPar, ordinal } from "../util/score.js";

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function AthleteProfile({ athleteId, onBack, onOpenCompetition }) {
  const athlete = getAthlete(athleteId);

  const columns = [
    {
      key: "competition",
      label: "Competition",
      align: "left",
      render: (h) => (
        <span className="namelink" onClick={() => onOpenCompetition(h.competitionId)}>
          {h.competitionName}
        </span>
      ),
    },
    { key: "date", label: "Date", align: "left", render: (h) => fmtDate(h.date) },
    { key: "position", label: "Finish", render: (h) => ordinal(h.position) },
    { key: "total", label: "Total", render: (h) => <b>{h.total}</b> },
    { key: "toPar", label: "To Par", render: (h) => formatToPar(h.toPar) },
  ];

  return (
    <div>
      <span className="namelink" onClick={onBack} style={{ display: "inline-block", marginBottom: 12 }}>
        ← Athletes
      </span>

      {athlete ? (
        <>
          <Panel style={{ padding: 20, marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 22, color: "var(--ink)" }}>
              {athlete.firstName} {athlete.lastName}
            </div>
            <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "var(--mut)" }}>{athlete.club}</span>
              <Chip>{athlete.country}</Chip>
            </div>
          </Panel>

          <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink)", margin: "4px 0 10px" }}>
            Competition history
          </div>
          <ResultsTable columns={columns} rows={(athlete.history || []).map((h) => ({ ...h, id: h.competitionId }))} />
        </>
      ) : (
        <Panel style={{ padding: 20 }}>Athlete not found.</Panel>
      )}
    </div>
  );
}
