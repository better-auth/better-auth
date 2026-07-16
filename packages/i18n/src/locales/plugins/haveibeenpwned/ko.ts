import type { haveIBeenPwned } from "better-auth/plugins";

type HaveIBeenPwnedErrorCodes = ReturnType<
	typeof haveIBeenPwned
>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const koHaveIBeenPwned: LocalizedTranslations<HaveIBeenPwnedErrorCodes> =
	{
		PASSWORD_COMPROMISED:
			"입력하신 비밀번호가 유출된 적이 있습니다. 다른 비밀번호를 선택해 주세요.",
	};
