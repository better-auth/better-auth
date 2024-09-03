import type { BetterFetch } from "@better-fetch/fetch";
import {
	WebAuthnError,
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";
import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";
import type { Session } from "inspector";
import type { User } from "../../adapters/schema";
import type { passkey as passkeyPl, Passkey } from "../../plugins";
import type { AuthClientPlugin } from "../../client/types";

export const getPasskeyActions = ($fetch: BetterFetch) => {
	const signInPasskey = async (opts?: {
		autoFill?: boolean;
		email?: string;
		callbackURL?: string;
	}) => {
		const response = await $fetch<PublicKeyCredentialRequestOptionsJSON>(
			"/passkey/generate-authenticate-options",
			{
				method: "POST",
				body: {
					email: opts?.email,
				},
			},
		);
		if (!response.data) {
			return response;
		}
		try {
			const res = await startAuthentication(
				response.data,
				opts?.autoFill || false,
			);
			const verified = await $fetch<{
				session: Session;
				user: User;
			}>("/passkey/verify-authentication", {
				body: {
					response: res,
					type: "authenticate",
				},
			});
			if (!verified.data) {
				return verified;
			}
		} catch (e) {
			console.log(e);
		}
	};

	const registerPasskey = async () => {
		const options = await $fetch<PublicKeyCredentialCreationOptionsJSON>(
			"/passkey/generate-register-options",
			{
				method: "GET",
			},
		);
		if (!options.data) {
			return options;
		}
		try {
			const res = await startRegistration(options.data);
			const verified = await $fetch<{
				passkey: Passkey;
			}>("/passkey/verify-registration", {
				body: {
					response: res,
					type: "register",
				},
			});
			if (!verified.data) {
				return verified;
			}
		} catch (e) {
			if (e instanceof WebAuthnError) {
				if (e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
					return {
						data: null,
						error: {
							message: "previously registered",
							status: 400,
							statusText: "BAD_REQUEST",
						},
					};
				}
			}
		}
	};
	return {
		signIn: {
			passkey: signInPasskey,
		},
		passkey: {
			registerPasskey,
		},
	};
};

export const passkeyClient = () => {
	return {
		id: "passkey",
		$InferServerPlugin: {} as ReturnType<typeof passkeyPl>,
		getActions: ($fetch) => getPasskeyActions($fetch),
	} satisfies AuthClientPlugin;
};
