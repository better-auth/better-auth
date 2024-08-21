import { BetterFetch } from "@better-fetch/fetch";
import {
	startAuthentication,
	startRegistration,
	WebAuthnError,
} from "@simplewebauthn/browser";
import {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";
import { Session } from "inspector";
import { User } from "../adapters/schema";
import { Passkey } from "../providers";

export const getPasskeyActions = ($fetch: BetterFetch) => {
	const signInPasskey = async (opts?: {
		autoFill?: boolean;
	}) => {
		const response = await $fetch<PublicKeyCredentialRequestOptionsJSON>(
			"/passkey/generate-authenticate-options",
			{
				method: "GET",
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
			}>("/passkey/verify", {
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

	const signUpPasskey = async (opts?: {
		autoFill?: boolean;
	}) => {
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
			}>("/passkey/verify", {
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
		signInPasskey,
		signUpPasskey,
	};
};
