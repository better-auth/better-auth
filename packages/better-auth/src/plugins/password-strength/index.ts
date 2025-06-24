import type { BetterAuthPlugin } from "better-auth";
import type { PasswordStrengthOptions } from "./types";
import { validatePassword } from "./utils";

const DEFAULT_OPTIONS: Required<PasswordStrengthOptions> = {
	minLength: 8,
	minUppercase: 1,
	minLowercase: 1,
	minNumbers: 1,
	minSpecialChars: 1,
	specialChars: "!@#$%^&*()_-+={[}]|:;\"'<,>.?/",
};

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
								throw new Error(
									"Password validation failed: " + result.errors.join(", "),
								);
							}

							return result;
						},
					},
				},
			};
		},
	}) satisfies BetterAuthPlugin;
