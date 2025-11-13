import type { BetterAuthPlugin, PasswordHashOptions } from "@better-auth/core";
import { defineErrorCodes } from "@better-auth/core/utils";
import { createHash } from "@better-auth/utils/hash";
import { betterFetch } from "@better-fetch/fetch";
import { APIError } from "../../api";

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
			throw new APIError("BAD_REQUEST", {
				message: customMessage || ERROR_CODES.PASSWORD_COMPROMISED,
				code: "PASSWORD_COMPROMISED",
			});
		}
	} catch (error) {
		if (error instanceof APIError) throw error;
		throw new APIError("INTERNAL_SERVER_ERROR", {
			message: "Failed to check password. Please try again later.",
		});
	}
}

export interface HaveIBeenPwnedOptions {
	customPasswordCompromisedMessage?: string | undefined;
}

export const haveIBeenPwned = (options?: HaveIBeenPwnedOptions | undefined) =>
	({
		id: "haveIBeenPwned",
		init(ctx) {
			const originalHash = ctx.password.hash.bind(ctx.password);
			return {
				context: {
					password: {
						...ctx.password,
						async hash(
							password,
							hashOptions?: PasswordHashOptions | undefined,
						) {
							if (hashOptions?.skipCompromiseCheck) {
								return originalHash(password, hashOptions);
							}
							await checkPasswordCompromise(
								password,
								options?.customPasswordCompromisedMessage,
							);
							return originalHash(password, hashOptions);
						},
					},
				},
			};
		},
		$ERROR_CODES: ERROR_CODES,
	}) satisfies BetterAuthPlugin;
