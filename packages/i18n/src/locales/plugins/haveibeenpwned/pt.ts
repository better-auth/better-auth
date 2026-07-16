import type { haveIBeenPwned } from "better-auth/plugins";

type HaveIBeenPwnedErrorCodes = ReturnType<
	typeof haveIBeenPwned
>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const ptHaveIBeenPwned: LocalizedTranslations<HaveIBeenPwnedErrorCodes> =
	{
		PASSWORD_COMPROMISED:
			"A senha que você digitou foi comprometida. Por favor, escolha uma senha diferente.",
	};
