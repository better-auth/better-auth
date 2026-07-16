import type { haveIBeenPwned } from "better-auth/plugins";

type HaveIBeenPwnedErrorCodes = ReturnType<
	typeof haveIBeenPwned
>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const esHaveIBeenPwned: LocalizedTranslations<HaveIBeenPwnedErrorCodes> =
	{
		PASSWORD_COMPROMISED:
			"La contraseña que ingresaste ha sido comprometida. Por favor, elige una contraseña diferente.",
	};
