import type { BetterAuthPlugin } from "@better-auth/core";
import { getCurrentAuthEndpointContext } from "@better-auth/core/context";
import { defineErrorCodes } from "@better-auth/core/utils/error-codes";
import { createHash } from "@better-auth/utils/hash";
import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "../../api";
import { isAPIError } from "../../utils/is-api-error";
import { PACKAGE_VERSION } from "../../version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"have-i-been-pwned": {
			creator: typeof haveIBeenPwned;
		};
	}
}

const ERROR_CODES = defineErrorCodes({
	PASSWORD_COMPROMISED:
		"The password you entered has been compromised. Please choose a different password.",
});

function getPasswordCompromiseCount(response: string, hashSuffix: string) {
	const matchingEntryPrefix = `${hashSuffix}:`;
	for (const line of response.split("\n")) {
		if (!line.startsWith(matchingEntryPrefix)) continue;

		const compromiseCount = Number(line.slice(matchingEntryPrefix.length));
		if (!Number.isSafeInteger(compromiseCount) || compromiseCount < 0) {
			throw new Error("Invalid password compromise count");
		}
		return compromiseCount;
	}
	return 0;
}

/**
 * Checks whether a password appears in the Have I Been Pwned password corpus.
 * Only the first five characters of its SHA-1 hash are sent to the service.
 *
 * @returns Whether the password has been compromised.
 * @throws {APIError} When the password could not be checked.
 */
export async function isPasswordCompromised(
	password: string,
): Promise<boolean> {
	if (!password) return false;
	try {
		const sha1Hash = (
			await createHash("SHA-1", "hex").digest(password)
		).toUpperCase();
		const prefix = sha1Hash.substring(0, 5);
		const suffix = sha1Hash.substring(5);
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
		const compromiseCount = getPasswordCompromiseCount(data, suffix);
		return compromiseCount > 0;
	} catch (error) {
		if (isAPIError(error)) throw error;
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Failed to check password. Please try again later.",
		});
	}
}

async function rejectCompromisedPassword(
	password: string,
	customMessage?: string | undefined,
) {
	const compromised = await isPasswordCompromised(password);
	if (compromised) {
		throw APIError.from("BAD_REQUEST", {
			message: customMessage || ERROR_CODES.PASSWORD_COMPROMISED.message,
			code: ERROR_CODES.PASSWORD_COMPROMISED.code,
		});
	}
}

export interface HaveIBeenPwnedOptions {
	/**
	 * Custom error message shown when a compromised password is detected.
	 */
	customPasswordCompromisedMessage?: string | undefined;
	/**
	 * Paths to check for password
	 *
	 * @default ["/sign-up/email", "/change-password", "/reset-password", "/email-otp/reset-password", "/phone-number/reset-password", "/admin/create-user", "/admin/set-user-password"]
	 */
	paths?: string[];
	/**
	 * Enable or disable password checks against the HIBP database.
	 *
	 * @default true
	 */
	enabled?: boolean | undefined;
}

export const haveIBeenPwned = (options?: HaveIBeenPwnedOptions | undefined) => {
	const paths = options?.paths || [
		"/sign-up/email",
		"/change-password",
		"/reset-password",
		"/email-otp/reset-password",
		"/phone-number/reset-password",
		"/admin/create-user",
		"/admin/set-user-password",
	];

	return {
		id: "have-i-been-pwned",
		version: PACKAGE_VERSION,
		init(ctx) {
			const originalHash = ctx.password.hash;
			return {
				context: {
					password: {
						...ctx.password,
						async hash(password) {
							if (options?.enabled === false) return originalHash(password);

							const c = getCurrentAuthEndpointContext();
							if (!c.path || !paths.includes(c.path)) {
								return originalHash(password);
							}
							await rejectCompromisedPassword(
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
