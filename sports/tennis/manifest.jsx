/* Tennis sport manifest. Scaffolded from sports/_template.
   Build your portal in ./src. Import UI from @athlink/design-system and
   data/auth from @athlink/core — never hardcode colors or fonts. */
import { defineSport } from "@athlink/sport-kit";
import { Trophy } from "lucide-react";
import Portal from "./src/Portal.jsx";

export default defineSport({
  id: "tennis",
  name: "Tennis",
  tagline: "Competitions & athlete profiles",
  icon: Trophy,
  accentToken: "--accent",
  Portal,
});
