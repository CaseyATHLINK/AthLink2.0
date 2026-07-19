/* Golf sport manifest.
   Golf mirrors sailing's decomposed structure (src/{util,data,views}/ + App.jsx) —
   it is a relabeled clone of the sailing modules. App.jsx is the Portal as-is; it
   carries its own chrome/theme, so it renders standalone inside the shell. The
   sailing→golf relabel is display-only and lives across the copied modules.
   See sports/sailing/src/README.md for the module map and change rules. */
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
