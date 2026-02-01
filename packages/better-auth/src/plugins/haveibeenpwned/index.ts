import type { BetterAuthPlugin } from "@better-auth/core";
import { getCurrentAuthContext } from "@better-auth/core/context";
import { defineErrorCodes } from "@better-auth/core/utils/error-codes";
import { createHash } from "@better-auth/utils/hash";
import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "../../api";
import { isAPIError } from "../../utils/is-api-error";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"have-i-been-pwned": {
			creator: typeof haveIBeenPwned;
		};
	}
}

const ERROR_CODES = defineErrorCodes({
	/**
	 * @description This error occurs when a password is found in the Have I Been Pwned database of compromised passwords, indicating it has been exposed in data breaches and is unsafe to use.
	 *
	 * ## Common Causes
	 *
	 * - Password appeared in known data breaches
	 * - Password is commonly used and has been compromised
	 * - Password was found in leaked password databases
	 * - Using a weak or predictable password
	 *
	 * ## How to resolve
	 *
	 * - Choose a different, unique password that hasn't been compromised
	 * - Use a password manager to generate strong, unique passwords
	 * - Avoid reusing passwords across multiple services
	 * - Create a password with at least 12 characters using mixed case, numbers, and symbols
	 *
	 * ## Example
	 *
	 * ```typescript
	 * // This will be rejected if password is compromised
	 * await client.auth.signUp.email({
	 *   email: "user@example.com",
	 *   password: "password123" // Likely compromised - will fail
	 * });
	 * // Use a strong unique password instead
	 * await client.auth.signUp.email({
	 *   email: "user@example.com",
	 *   password: "T9$mK#pL@2nQ!vR8" // Strong, unique password
	 * });
	 * ```
	 */
	PASSWORD_COMPROMISED:
		"The password you entered has been compromised. Please choose a different password.",
});

async function checkPasswordCompromise(
	password: string,
	customMessage?: string | undefined,
) {
	if (!password) return;

	const sha1Hash = (
		await createHash("SHA-1", "hex").digest(password)
	).toUpperCase();
	const prefix = sha1Hash.substring(0, 5);
	const suffix = sha1Hash.substring(5);
	try {
		const { data, error } = await betterFetch<string>(
			`https://api.pwnedpasswords.com/range/${prefix}`,
			{
				headers: {
					"Add-Padding": "true",
					"User-Agent": "BetterAuth Password Checker",
				},
			},
		);

		if (error) {
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: `Failed to check password. Status: ${error.status}`,
			});
		}
		const lines = data.split("\n");
		const found = lines.some(
			(line) => line.split(":")[0]!.toUpperCase() === suffix.toUpperCase(),
		);

		if (found) {
			throw APIError.from("BAD_REQUEST", {
				message: customMessage || ERROR_CODES.PASSWORD_COMPROMISED.message,
				code: ERROR_CODES.PASSWORD_COMPROMISED.code,
			});
		}
	} catch (error) {
		if (isAPIError(error)) throw error;
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Failed to check password. Please try again later.",
		});
	}
}

export interface HaveIBeenPwnedOptions {
	customPasswordCompromisedMessage?: string | undefined;
	/**
	 * Paths to check for password
	 *
	 * @default ["/sign-up/email", "/change-password", "/reset-password"]
	 */
	paths?: string[];
}

export const haveIBeenPwned = (options?: HaveIBeenPwnedOptions | undefined) => {
	const paths = options?.paths || [
		"/sign-up/email",
		"/change-password",
		"/reset-password",
	];

	return {
		id: "have-i-been-pwned",
		init(ctx) {
			const originalHash = ctx.password.hash;
			return {
				context: {
					password: {
						...ctx.password,
						async hash(password) {
							const c = await getCurrentAuthContext();
							if (!c.path || !paths.includes(c.path)) {
								return originalHash(password);
							}
							await checkPasswordCompromise(
								password,
								options?.customPasswordCompromisedMessage,
							);
							return originalHash(password);
						},
					},
				},
			};
		},
		options,
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
