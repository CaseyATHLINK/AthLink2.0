/* Sailing binding of the universal @athlink/auth sign-in feature. The package's
   makeSignInModal factory receives sailing's pickers, class/flag display
   helpers and host data layer by dependency injection (reorg step 3 contract);
   the bound component is what App.jsx renders. */

import { makeSignInModal } from "@athlink/auth";
import { iocFlag } from "../util/flag.js";
import { classColor, classColorA, classLabel } from "../util/class.js";
import { hostById, hostRest, fetchInviteByShortCode, fetchInviteByToken, markInviteUsed, MOCK_RESEARCH, mockResearchIdentity } from "../data/hosts.js";
import { ClassPicker } from "./atoms.jsx";
import { CountrySelect } from "./forms.jsx";

export const SignInModal = makeSignInModal({
  ClassPicker, CountrySelect,
  classColor, classColorA, classLabel, iocFlag,
  hostById, hostRest,
  fetchInviteByShortCode, fetchInviteByToken, markInviteUsed,
  MOCK_RESEARCH, mockResearchIdentity,
});
