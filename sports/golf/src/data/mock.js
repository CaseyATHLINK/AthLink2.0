/* Mock golf data in the real shape (see ./shape.js).
   The selector functions below are the ONLY seam that changes when live data
   lands: each getX() becomes an sbGet(...) call returning the same shape.
   Results are ground truth — totals and to-par are stored fields, not computed. */

/** @type {import("./shape.js").Athlete[]} */
const ATHLETES = [
  { id: "a1", firstName: "Ryan", lastName: "Chan", club: "Clearwater Bay GC", country: "HKG" },
  { id: "a2", firstName: "Wesley", lastName: "Lam", club: "Hong Kong GC", country: "HKG" },
  { id: "a3", firstName: "Marcus", lastName: "Ng", club: "Discovery Bay GC", country: "HKG" },
  { id: "a4", firstName: "Ethan", lastName: "Wong", club: "Kau Sai Chau", country: "HKG" },
  { id: "a5", firstName: "Terrence", lastName: "Yip", club: "Shek O CC", country: "HKG" },
  { id: "a6", firstName: "Jayden", lastName: "Ho", club: "Clearwater Bay GC", country: "HKG" },
  { id: "a7", firstName: "Aaron", lastName: "Lau", club: "Hong Kong GC", country: "HKG" },
  { id: "a8", firstName: "Nathan", lastName: "Tsang", club: "Discovery Bay GC", country: "HKG" },
  { id: "a9", firstName: "Lucas", lastName: "Cheung", club: "Kau Sai Chau", country: "HKG" },
  { id: "a10", firstName: "Dylan", lastName: "Fung", club: "Shek O CC", country: "SGP" },
];

/** @type {import("./shape.js").Competition[]} */
const COMPETITIONS = [
  { id: "c1", name: "Hong Kong Amateur Championship", date: "2026-05-18", venue: "Clearwater Bay G&CC", rounds: 4, athleteCount: 8 },
  { id: "c2", name: "Junior Order of Merit — Spring", date: "2026-04-12", venue: "Hong Kong GC, Fanling", rounds: 2, athleteCount: 6 },
  { id: "c3", name: "Sha Tin Open", date: "2026-06-22", venue: "Kau Sai Chau (Public)", rounds: 1, athleteCount: 6 },
];

/* Raw result rows: athleteId + scores only; athlete fields are joined in getResults. */
const RESULTS = [
  // c1 — 4 rounds, par 288
  { id: "r1", competitionId: "c1", position: 1, athleteId: "a1", roundScores: [70, 68, 71, 69], total: 278, toPar: -10 },
  { id: "r2", competitionId: "c1", position: 2, athleteId: "a2", roundScores: [71, 70, 69, 70], total: 280, toPar: -8 },
  { id: "r3", competitionId: "c1", position: 3, athleteId: "a3", roundScores: [72, 69, 71, 70], total: 282, toPar: -6 },
  { id: "r4", competitionId: "c1", position: 4, athleteId: "a4", roundScores: [70, 72, 72, 70], total: 284, toPar: -4 },
  { id: "r5", competitionId: "c1", position: 5, athleteId: "a6", roundScores: [73, 71, 70, 71], total: 285, toPar: -3 },
  { id: "r6", competitionId: "c1", position: 6, athleteId: "a7", roundScores: [72, 72, 71, 71], total: 286, toPar: -2 },
  { id: "r7", competitionId: "c1", position: 7, athleteId: "a5", roundScores: [74, 71, 72, 70], total: 287, toPar: -1 },
  { id: "r8", competitionId: "c1", position: 8, athleteId: "a8", roundScores: [72, 73, 72, 72], total: 289, toPar: 1 },

  // c2 — 2 rounds, par 144
  { id: "r9", competitionId: "c2", position: 1, athleteId: "a2", roundScores: [69, 68], total: 137, toPar: -7 },
  { id: "r10", competitionId: "c2", position: 2, athleteId: "a1", roundScores: [70, 68], total: 138, toPar: -6 },
  { id: "r11", competitionId: "c2", position: 3, athleteId: "a6", roundScores: [71, 69], total: 140, toPar: -4 },
  { id: "r12", competitionId: "c2", position: 4, athleteId: "a9", roundScores: [70, 71], total: 141, toPar: -3 },
  { id: "r13", competitionId: "c2", position: 5, athleteId: "a4", roundScores: [72, 70], total: 142, toPar: -2 },
  { id: "r14", competitionId: "c2", position: 6, athleteId: "a10", roundScores: [71, 73], total: 144, toPar: 0 },

  // c3 — 1 round, par 72
  { id: "r15", competitionId: "c3", position: 1, athleteId: "a3", roundScores: [67], total: 67, toPar: -5 },
  { id: "r16", competitionId: "c3", position: 2, athleteId: "a5", roundScores: [68], total: 68, toPar: -4 },
  { id: "r17", competitionId: "c3", position: 3, athleteId: "a1", roundScores: [69], total: 69, toPar: -3 },
  { id: "r18", competitionId: "c3", position: 4, athleteId: "a7", roundScores: [70], total: 70, toPar: -2 },
  { id: "r19", competitionId: "c3", position: 5, athleteId: "a8", roundScores: [71], total: 71, toPar: -1 },
  { id: "r20", competitionId: "c3", position: 6, athleteId: "a10", roundScores: [72], total: 72, toPar: 0 },
];

const athleteById = (id) => ATHLETES.find((a) => a.id === id) || null;

/* ── Selectors (the sbGet seam) ── */

/** @returns {import("./shape.js").Competition[]} most recent first */
export function getCompetitions() {
  return COMPETITIONS.slice().sort((a, b) => b.date.localeCompare(a.date));
}

/** @returns {import("./shape.js").Competition | null} */
export function getCompetition(id) {
  return COMPETITIONS.find((c) => c.id === id) || null;
}

/** @returns {import("./shape.js").Result[]} leaderboard rows, ranked, athlete fields joined */
export function getResults(competitionId) {
  return RESULTS.filter((r) => r.competitionId === competitionId)
    .sort((a, b) => a.position - b.position)
    .map((r) => {
      const a = athleteById(r.athleteId) || {};
      return { ...r, firstName: a.firstName, lastName: a.lastName, club: a.club, country: a.country };
    });
}

/** @returns {Array<import("./shape.js").Athlete & {competitions:number, best:number|null}>} */
export function getAthletes() {
  return ATHLETES.map((a) => {
    const rs = RESULTS.filter((r) => r.athleteId === a.id);
    const best = rs.length ? Math.min(...rs.map((r) => r.position)) : null;
    return { ...a, competitions: rs.length, best };
  }).sort((x, y) => x.lastName.localeCompare(y.lastName));
}

/** @returns {import("./shape.js").Athlete | null} with history joined + sorted recent-first */
export function getAthlete(id) {
  const a = athleteById(id);
  if (!a) return null;
  const history = RESULTS.filter((r) => r.athleteId === id)
    .map((r) => {
      const c = getCompetition(r.competitionId);
      return {
        competitionId: r.competitionId,
        competitionName: c ? c.name : r.competitionId,
        date: c ? c.date : "",
        position: r.position,
        total: r.total,
        toPar: r.toPar,
      };
    })
    .sort((x, y) => y.date.localeCompare(x.date));
  return { ...a, history };
}
