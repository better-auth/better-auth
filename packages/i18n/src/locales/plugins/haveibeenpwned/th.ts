import type { haveIBeenPwned } from "better-auth/plugins";

type HaveIBeenPwnedErrorCodes = ReturnType<
	typeof haveIBeenPwned
>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const thHaveIBeenPwned: LocalizedTranslations<HaveIBeenPwnedErrorCodes> =
	{
		PASSWORD_COMPROMISED: "รหัสผ่านที่คุณป้อนถูกบุกรุก กรุณาเลือกรหัสผ่านอื่น",
	};
