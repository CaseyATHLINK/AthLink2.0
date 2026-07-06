/* Golf leaderboard — stroke-play results for one competition.
   Ground-truth display: round columns and to-par come from stored fields. */
import React from "react";
import { ResultsTable, Chip } from "@athlink/design-system";
import { getCompetition, getResults } from "../data/mock.js";
import { formatToPar, buildRoundColumns } from "../util/score.js";

function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const rankClass = (p) =>
  "rk" + (p === 1 ? " p1" : p === 2 ? " p2" : p === 3 ? " p3" : "");

export default function Leaderboard({ competitionId, onBack, onOpenAthlete }) {
  const competition = getCompetition(competitionId);
  const rows = getResults(competitionId);

  const columns = [
    { key: "position", label: "#", render: (r) => <span className={rankClass(r.position)}>{r.position}</span> },
    {
      key: "athlete",
      label: "Athlete",
      align: "left",
      render: (r) => (
        <span className="namelink" onClick={() => onOpenAthlete(r.athleteId)}>
          {r.firstName} {r.lastName}
        </span>
      ),
    },
    { key: "club", label: "Club", align: "left" },
    { key: "country", label: "Country", render: (r) => <Chip>{r.country}</Chip> },
    ...buildRoundColumns(rows),
    { key: "total", label: "Total", render: (r) => <b>{r.total}</b> },
    { key: "toPar", label: "To Par", render: (r) => formatToPar(r.toPar) },
  ];

  return (
    <div>
      <span className="namelink" onClick={onBack} style={{ display: "inline-block", marginBottom: 12 }}>
        ← Competitions
      </span>
      <div style={{ margin: "2px 0 14px" }}>
        <div style={{ fontWeight: 800, fontSize: 20, color: "var(--ink)" }}>
          {competition ? competition.name : "Competition"}
        </div>
        {competition ? (
          <div style={{ marginTop: 4, fontSize: 14, color: "var(--mut)" }}>
            {fmtDate(competition.date)} · {competition.venue}
          </div>
        ) : null}
      </div>
      <ResultsTable columns={columns} rows={rows} />
    </div>
  );
}
