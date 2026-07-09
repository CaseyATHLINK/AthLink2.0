/* Golf sport manifest.
   Golf is a verbatim clone of the full sailing app (see sports/sailing) —
   src/App.jsx is the Portal as-is; it carries its own chrome/theme, so it
   renders standalone inside the shell. Relabel pass (sailing → golf wording)
   happens inside src/App.jsx only. */
import { defineSport } from "@athlink/sport-kit";
import { Flag } from "lucide-react";
import App from "./src/App.jsx";

export default defineSport({
  id: "golf",
  name: "Golf",
  tagline: "Clubs, associations, competitions & athlete profiles",
  icon: Flag,
  accentToken: "--accent",
  // Golf has its own top bar (cloned from sailing); its AthLink logo returns
  // to the landing, so the shell's floating "All sports" link is hidden.
  providesOwnNav: true,
  Portal: App,
});
