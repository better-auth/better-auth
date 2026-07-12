import type { haveIBeenPwned } from "better-auth/plugins";

type HaveIBeenPwnedErrorCodes = ReturnType<
	typeof haveIBeenPwned
>["$ERROR_CODES"];

import type { LocalizedTranslations } from "../../../types";

export const bnHaveIBeenPwned: LocalizedTranslations<HaveIBeenPwnedErrorCodes> =
	{
		PASSWORD_COMPROMISED:
			"আপনার প্রবেশ করা পাসওয়ার্ডটি আপোস করা হয়েছে। অনুগ্রহ করে একটি ভিন্ন পাসওয়ার্ড বেছে নিন।",
	};
