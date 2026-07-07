/* Golf portal data contract — JSDoc typedefs only (no runtime).
   This is the "real shape". mock.js returns this shape today; when live data
   lands, the selectors in mock.js become sbGet(...) calls returning the same shape. */

/**
 * @typedef {Object} Competition
 * @property {string} id
 * @property {string} name
 * @property {string} date          ISO yyyy-mm-dd
 * @property {string} venue
 * @property {number} rounds        number of rounds played
 * @property {number} athleteCount
 */

/**
 * @typedef {Object} Result         // one leaderboard row (denormalized, as uploaded)
 * @property {string} id
 * @property {string} competitionId
 * @property {number} position
 * @property {string} athleteId
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} club
 * @property {string} country       ISO-ish code, e.g. "HKG"
 * @property {number[]} roundScores e.g. [71, 69, 72]
 * @property {number} total
 * @property {number} toPar         stored, displayed as-is (E / -3 / +5)
 */

/**
 * @typedef {Object} HistoryEntry
 * @property {string} competitionId
 * @property {string} competitionName
 * @property {string} date
 * @property {number} position
 * @property {number} total
 * @property {number} toPar
 */

/**
 * @typedef {Object} Athlete
 * @property {string} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} club
 * @property {string} country
 * @property {HistoryEntry[]} [history]
 */

export {};
