import { APIError } from "../../api";
import { createHash } from "@better-auth/utils/hash";
import { betterFetch } from "@better-fetch/fetch";
import type { BetterAuthPlugin } from "../../types/plugins";

const ERROR_CODES = {
	PASSWORD_COMPROMISED:
		"The password you entered has been compromised. Please choose a different password.",
} as const;

async function checkPasswordCompromise(
	password: string,
	customMessage?: string,
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
			(line) => line.split(":")[0].toUpperCase() === suffix.toUpperCase(),
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
	customPasswordCompromisedMessage?: string;
}

export const haveIBeenPwned = (options?: HaveIBeenPwnedOptions) =>
	({
		id: "haveIBeenPwned",
		init(ctx) {
			return {
				context: {
					password: {
						...ctx.password,
						async hash(password) {
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
		$ERROR_CODES: ERROR_CODES,
	}) satisfies BetterAuthPlugin;
