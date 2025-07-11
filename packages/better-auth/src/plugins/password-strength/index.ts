import type { BetterAuthPlugin } from "better-auth";
import type { PasswordStrengthOptions } from "./types";
import { validatePassword } from "./utils";
import { APIError } from "better-call";

const DEFAULT_OPTIONS: Required<PasswordStrengthOptions> = {
	minLength: 8,
	minUppercase: 1,
	minLowercase: 1,
	minNumbers: 1,
	minSpecialChars: 1,
	specialChars: "!@#$%^&*()_-+={[}]|:;\"'<,>.?/",
};

const ERROR_CODES = {
	WEAK_PASSWORD: "WEAK_PASSWORD",
} as const;

export const passwordPlugin = (options?: PasswordStrengthOptions) =>
	({
		id: "passwordStrength",

		init(ctx) {
			const config = { ...DEFAULT_OPTIONS, ...options };
			return {
				context: {
					password: {
						...ctx.password,

						async validate(password: string) {
							const result = validatePassword(password, config);

							if (!result.isValid) {
								throw new APIError("BAD_REQUEST", {
									code: ERROR_CODES.WEAK_PASSWORD,
									message: "Password validation failed",
									data: {
										isValid: result.isValid,
										score: result.score,
										errors: result.errors,
									},
								});
							}
						},
					},
				},
			};
		},
		$ERROR_CODES: ERROR_CODES,
	}) satisfies BetterAuthPlugin;
