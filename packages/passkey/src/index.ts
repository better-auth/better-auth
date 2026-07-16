import type { BetterAuthPlugin } from "@better-auth/core";
import { mergeSchema } from "better-auth/db";
import { PASSKEY_ERROR_CODES } from "./error-codes";
import { passkeySettingsCards } from "./passkey-ui";
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
import { PACKAGE_VERSION } from "./version";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		passkey: {
			creator: typeof passkey;
		};
	}
}

export {
	commonAuthenticatorNames,
	getAuthenticatorName,
} from "./authenticator-metadata";
export { PASSKEY_ERROR_CODES } from "./error-codes";

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
		version: PACKAGE_VERSION,
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
		ui: {
			capabilities: {
				passkey: {
					id: "passkey",
					enabled: true,
					routes: {
						generateRegisterOptions: {
							type: "auth-route",
							path: "/passkey/generate-register-options",
							method: "POST",
						},
						verifyRegistration: {
							type: "auth-route",
							path: "/passkey/verify-registration",
							method: "POST",
						},
						generateAuthenticateOptions: {
							type: "auth-route",
							path: "/passkey/generate-authenticate-options",
							method: "POST",
						},
						verifyAuthentication: {
							type: "auth-route",
							path: "/passkey/verify-authentication",
							method: "POST",
						},
						listUserPasskeys: {
							type: "auth-route",
							path: "/passkey/list-user-passkeys",
							method: "GET",
						},
						deletePasskey: {
							type: "auth-route",
							path: "/passkey/delete-passkey",
							method: "POST",
						},
					},
				},
			},
			settingsCards: passkeySettingsCards,
		},
		schema: mergeSchema(schema, options?.schema),
		$ERROR_CODES: PASSKEY_ERROR_CODES,
		options,
	} satisfies BetterAuthPlugin;
};

export type { Passkey, PasskeyOptions };
