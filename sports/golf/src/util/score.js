/* Golf scoring display helpers. Pure formatting — never recomputes a result
   (To Par and round scores are displayed from stored fields, per ground-truth rule). */

/** Display a to-par value the golf way: 0 -> "E", -3 -> "-3", 5 -> "+5". */
export function formatToPar(toPar) {
  if (toPar == null) return "—";
  if (toPar === 0) return "E";
  return toPar > 0 ? `+${toPar}` : `${toPar}`;
}

/** Build one leaderboard column per round, sized to the most rounds any row carries.
   Displays the stored round score; never derives it. */
export function buildRoundColumns(rows) {
  const maxRounds = rows.reduce(
    (m, r) => Math.max(m, r.roundScores ? r.roundScores.length : 0),
    0
  );
  return Array.from({ length: maxRounds }, (_, i) => ({
    key: `r${i + 1}`,
    label: `R${i + 1}`,
    render: (row) =>
      row.roundScores && row.roundScores[i] != null ? row.roundScores[i] : "—",
  }));
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th". */
export function ordinal(n) {
  if (n == null) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
