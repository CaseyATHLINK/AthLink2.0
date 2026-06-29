import React from "react";

/* Sport registry. Each entry has lightweight metadata for the landing page and a
   lazy `Portal` so a sport's code only loads when you navigate to it.
   Do NOT hand-edit — `pnpm create-sport <name>` inserts new sports automatically. */
export const sports = [
  {
    id: "sailing",
    name: "Sailing",
    tagline: "Class associations, competitions & athlete profiles",
    Portal: React.lazy(() =>
      import("@athlink/sport-sailing").then((m) => ({ default: m.default.Portal }))
    ),
  },
  // __SPORTS_REGISTRY__ (generator inserts new sports above this line)
];
