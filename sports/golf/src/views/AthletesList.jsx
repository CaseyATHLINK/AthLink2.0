/* Golf athletes list — name, club, competitions played, best finish.
   Click an athlete to open their profile. Reuses ResultsTable for a consistent look. */
import React from "react";
import { ResultsTable } from "@athlink/design-system";
import { getAthletes } from "../data/mock.js";
import { ordinal } from "../util/score.js";

export default function AthletesList({ onOpen }) {
  const rows = getAthletes();

  const columns = [
    {
      key: "athlete",
      label: "Athlete",
      align: "left",
      render: (a) => (
        <span className="namelink" onClick={() => onOpen(a.id)}>
          {a.firstName} {a.lastName}
        </span>
      ),
    },
    { key: "club", label: "Club", align: "left" },
    { key: "competitions", label: "Competitions" },
    { key: "best", label: "Best", render: (a) => (a.best ? ordinal(a.best) : "—") },
  ];

  return <ResultsTable columns={columns} rows={rows} />;
}
