import type { BetterAuthPlugin } from "@better-auth/core";
import { mergeSchema } from "better-auth/db";
import { PASSKEY_ERROR_CODES } from "./error-codes";
import {
	deletePasskey,
	generatePasskeyAuthenticationOptions,
	generatePasskeyRegistrationOptions,
	listPasskeys,
	updatePasskey,
	verifyPasskeyAuthentication,
	verifyPasskeyRegistration,
} from "./routes";
import { schema } from "./schema";
import type { Passkey, PasskeyOptions } from "./types";

export const passkey = (options?: PasskeyOptions | undefined) => {
	const opts = {
		origin: null,
		...options,
		advanced: {
			webAuthnChallengeCookie: "better-auth-passkey",
			...options?.advanced,
		},
	};
	const expirationTime = new Date(Date.now() + 1000 * 60 * 5);
	const currentTime = new Date();
	const maxAgeInSeconds = Math.floor(
		(expirationTime.getTime() - currentTime.getTime()) / 1000,
	);

	return {
		id: "passkey",
		endpoints: {
			generatePasskeyRegistrationOptions: generatePasskeyRegistrationOptions(
				opts,
				{ maxAgeInSeconds, expirationTime },
			),
			generatePasskeyAuthenticationOptions:
				generatePasskeyAuthenticationOptions(opts, {
					maxAgeInSeconds,
					expirationTime,
				}),
			verifyPasskeyRegistration: verifyPasskeyRegistration(opts),
			verifyPasskeyAuthentication: verifyPasskeyAuthentication(opts),
			listPasskeys,
			deletePasskey,
			updatePasskey,
		},
		schema: mergeSchema(schema, options?.schema),
		$ERROR_CODES: PASSKEY_ERROR_CODES,
	} satisfies BetterAuthPlugin;
};

export type { Passkey, PasskeyOptions };
