/* Triathlon sport manifest. Scaffolded from sports/_template.
   Currently a "coming soon" placeholder — build the real portal in ./src.
   Import UI from @athlink/design-system and data/auth from @athlink/core —
   never hardcode colors or fonts. */
import { defineSport } from "@athlink/sport-kit";
import { Activity } from "lucide-react";
import Portal from "./src/Portal.jsx";

export default defineSport({
  id: "triathlon",
  name: "Triathlon",
  tagline: "Swim, bike, run — competitions & athlete profiles",
  icon: Activity,
  accentToken: "--accent",
  Portal,
});
