/* __SPORT_NAME__ portal — starter homepage + results table.
   Everything here uses shared components so it matches every other sport.
   Replace the placeholder data with real data from @athlink/core (sbGet ...). */
import React from "react";
import { PageHeader, Card, ResultsTable, Seg } from "@athlink/design-system";

const DEMO_ROWS = [
  { id: 1, rank: 1, name: "Sample Athlete", club: "Sample Club", points: 12 },
  { id: 2, rank: 2, name: "Another Athlete", club: "Other Club", points: 18 },
];

const COLUMNS = [
  { key: "rank", label: "#", render: (r) => <span className="rk">{r.rank}</span> },
  { key: "name", label: "Athlete", align: "left", render: (r) => <span className="namelink">{r.name}</span> },
  { key: "club", label: "Club", align: "left" },
  { key: "points", label: "Net", render: (r) => <b>{r.points}</b> },
];

export default function Portal() {
  const [view, setView] = React.useState("results");
  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <PageHeader title="__SPORT_NAME__" sub="Competitions & athlete profiles" />

      <div style={{ marginBottom: 16 }}>
        <Seg
          value={view}
          onChange={setView}
          options={[{ value: "results", label: "Results" }, { value: "athletes", label: "Athletes" }]}
        />
      </div>

      {view === "results" ? (
        <ResultsTable columns={COLUMNS} rows={DEMO_ROWS} />
      ) : (
        <Card>Athletes view — build me.</Card>
      )}
    </div>
  );
}
