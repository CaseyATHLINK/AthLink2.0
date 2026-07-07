/* Golf portal — root component. Owns navigation between the four views:
   competitions list, leaderboard, athletes list, athlete profile.
   The shell wraps this in <ThemeRoot>, so we do NOT re-wrap it here.
   All UI comes from @athlink/design-system; data from ./data/mock.js (the sbGet seam). */
import React from "react";
import { PageHeader, Seg } from "@athlink/design-system";
import CompetitionsList from "./views/CompetitionsList.jsx";
import Leaderboard from "./views/Leaderboard.jsx";
import AthletesList from "./views/AthletesList.jsx";
import AthleteProfile from "./views/AthleteProfile.jsx";

export default function Portal() {
  // nav: { view, competitionId?, athleteId? }
  const [nav, setNav] = React.useState({ view: "competitions" });
  const go = (next) => setNav(next);

  // Which Seg pill is active: Results covers competitions + leaderboard;
  // Athletes covers the athletes list + a profile.
  const section = nav.view === "athletes" || nav.view === "profile" ? "athletes" : "results";

  const onSeg = (value) => go({ view: value === "results" ? "competitions" : "athletes" });

  return (
    <div className="wrap" style={{ paddingTop: 24, paddingBottom: 60 }}>
      <PageHeader title="Golf" sub="Competitions & athlete profiles" />

      <div style={{ marginBottom: 16 }}>
        <Seg
          value={section}
          onChange={onSeg}
          options={[{ value: "results", label: "Results" }, { value: "athletes", label: "Athletes" }]}
        />
      </div>

      {nav.view === "competitions" && (
        <CompetitionsList onOpen={(competitionId) => go({ view: "leaderboard", competitionId })} />
      )}

      {nav.view === "leaderboard" && (
        <Leaderboard
          competitionId={nav.competitionId}
          onBack={() => go({ view: "competitions" })}
          onOpenAthlete={(athleteId) => go({ view: "profile", athleteId })}
        />
      )}

      {nav.view === "athletes" && (
        <AthletesList onOpen={(athleteId) => go({ view: "profile", athleteId })} />
      )}

      {nav.view === "profile" && (
        <AthleteProfile
          athleteId={nav.athleteId}
          onBack={() => go({ view: "athletes" })}
          onOpenCompetition={(competitionId) => go({ view: "leaderboard", competitionId })}
        />
      )}
    </div>
  );
}
