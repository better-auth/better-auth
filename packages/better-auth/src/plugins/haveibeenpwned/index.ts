import type { BetterAuthPlugin } from "@better-auth/core";
import { getCurrentAuthContext } from "@better-auth/core/context";
import { defineErrorCodes } from "@better-auth/core/utils/error-codes";
import { createHash } from "@better-auth/utils/hash";
import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "../../api";
import { isAPIError } from "../../utils/is-api-error";

declare module "@better-auth/core" {
	// biome-ignore lint/correctness/noUnusedVariables: Auth and Context need to be same as declared in the module
	interface BetterAuthPluginRegistry<Auth, Context> {
		"have-i-been-pwned": {
			creator: typeof haveIBeenPwned;
		};
	}
}

const ERROR_CODES = defineErrorCodes({
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
			return {
				context: {
					password: {
						...ctx.password,
						async hash(password) {
							const c = await getCurrentAuthContext();
							if (!c.path || !paths.includes(c.path)) {
								return ctx.password.hash(password);
							}
							await checkPasswordCompromise(
								password,
								options?.customPasswordCompromisedMessage,
							);
							return ctx.password.hash(password);
						},
					},
				},
			};
		},
		options,
		$ERROR_CODES: ERROR_CODES,
	} satisfies BetterAuthPlugin;
};
