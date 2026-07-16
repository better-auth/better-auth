import type { haveIBeenPwned } from "better-auth/plugins";

type HaveIBeenPwnedErrorCodes = ReturnType<
	typeof haveIBeenPwned
>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const itHaveIBeenPwned: LocalizedTranslations<HaveIBeenPwnedErrorCodes> =
	{
		PASSWORD_COMPROMISED:
			"La password che hai inserito è stata compromessa. Scegli una password diversa.",
	};
