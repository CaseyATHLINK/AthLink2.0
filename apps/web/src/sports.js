import React from "react";

/* Sport registry. Each entry has lightweight metadata for the landing page and a
   lazy `Portal` so a sport's code only loads when you navigate to it.
   Do NOT hand-edit — `pnpm create-sport <name>` inserts new sports automatically. */
export const sports = [
  {
    id: "sailing",
    name: "Sailing",
    tagline: "Class associations, competitions & athlete profiles",
    providesOwnNav: true,
    Portal: React.lazy(() =>
      import("@athlink/sport-sailing").then((m) => ({ default: m.default.Portal }))
    ),
  },
  {
    id: "golf",
    name: "Golf",
    tagline: "Clubs, associations, competitions & athlete profiles",
    providesOwnNav: true,
    Portal: React.lazy(() =>
      import("@athlink/sport-golf").then((m) => ({ default: m.default.Portal }))
    ),
  },
  {
    id: "tennis",
    name: "Tennis",
    tagline: "Competitions & athlete profiles",
    Portal: React.lazy(() =>
      import("@athlink/sport-tennis").then((m) => ({ default: m.default.Portal }))
    ),
  },
  {
    id: "triathlon",
    name: "Triathlon",
    tagline: "Swim, bike, run — competitions & athlete profiles",
    Portal: React.lazy(() =>
      import("@athlink/sport-triathlon").then((m) => ({ default: m.default.Portal }))
    ),
  },
  // __SPORTS_REGISTRY__ (generator inserts new sports above this line)
];
