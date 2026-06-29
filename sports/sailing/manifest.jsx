/* Sailing sport manifest.
   v1 migration: the existing full sailing app (src/App.jsx) is the Portal as-is —
   it carries its own chrome/theme, so it renders standalone inside the shell.
   Follow-up: refactor it to consume @athlink/design-system + @athlink/core and
   drop its embedded <style> block (see MONOREPO_SETUP.md). */
import { defineSport } from "@athlink/sport-kit";
import { Waves } from "lucide-react";
import App from "./src/App.jsx";

export default defineSport({
  id: "sailing",
  name: "Sailing",
  tagline: "Class associations, competitions & athlete profiles",
  icon: Waves,
  accentToken: "--accent",
  Portal: App,
});
