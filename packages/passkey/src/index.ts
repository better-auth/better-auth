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

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<_AuthOptions, _Options> {
		passkey: {
			creator: typeof passkey;
		};
	}
}

const MAX_AGE_IN_SECONDS = 60 * 5; // 5 minutes

export const passkey = (options?: PasskeyOptions | undefined) => {
	const opts = {
		origin: null,
		...options,
		advanced: {
			webAuthnChallengeCookie: "better-auth-passkey",
			...options?.advanced,
		},
	};

	return {
		id: "passkey",
		endpoints: {
			generatePasskeyRegistrationOptions: generatePasskeyRegistrationOptions(
				opts,
				{ maxAgeInSeconds: MAX_AGE_IN_SECONDS },
			),
			generatePasskeyAuthenticationOptions:
				generatePasskeyAuthenticationOptions(opts, {
					maxAgeInSeconds: MAX_AGE_IN_SECONDS,
				}),
			verifyPasskeyRegistration: verifyPasskeyRegistration(opts),
			verifyPasskeyAuthentication: verifyPasskeyAuthentication(opts),
			listPasskeys,
			deletePasskey,
			updatePasskey,
		},
		schema: mergeSchema(schema, options?.schema),
		$ERROR_CODES: PASSKEY_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};

export type { Passkey, PasskeyOptions };
