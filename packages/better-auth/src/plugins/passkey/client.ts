import type { BetterFetch, BetterFetchOption } from "@better-fetch/fetch";
import {
	WebAuthnError,
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";
import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import type { Session } from "inspector";
import type { User } from "../../types";
import type { passkey as passkeyPl, Passkey } from ".";
import type { BetterAuthClientPlugin } from "../../client/types";
import { useAuthQuery } from "../../client";
import { atom } from "nanostores";

export const getPasskeyActions = (
	$fetch: BetterFetch,
	{
		$listPasskeys,
	}: {
		$listPasskeys: ReturnType<typeof atom<any>>;
	},
) => {
	const signInPasskey = async (
		opts?: {
			autoFill?: boolean;
			email?: string;
			fetchOptions?: BetterFetchOption;
		},
		options?: BetterFetchOption,
	) => {
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
			const res = await startAuthentication({
				optionsJSON: response.data,
				useBrowserAutofill: opts?.autoFill,
			});
			const verified = await $fetch<{
				session: Session;
				user: User;
			}>("/passkey/verify-authentication", {
				body: {
					response: res,
				},
				...opts?.fetchOptions,
				...options,
				method: "POST",
			});
			if (!verified.data) {
				return verified;
			}
		} catch (e) {
			return {
				data: null,
				error: {
					message: "auth cancelled",
					status: 400,
					statusText: "BAD_REQUEST",
				},
			};
		}
	};

	const registerPasskey = async (
		opts?: {
			fetchOptions?: BetterFetchOption;
			/**
			 * The name of the passkey. This is used to
			 * identify the passkey in the UI.
			 */
			name?: string;

			/**
			 * The type of attachment for the passkey. Defaults to both
			 * platform and cross-platform allowed, with platform preferred.
			 */
			authenticatorAttachment?: "platform" | "cross-platform";

			/**
			 * Try to silently create a passkey with the password manager that the user just signed
			 * in with.
			 * @default false
			 */
			useAutoRegister?: boolean;
		},
		fetchOpts?: BetterFetchOption,
	) => {
		const options = await $fetch<PublicKeyCredentialCreationOptionsJSON>(
			"/passkey/generate-register-options",
			{
				method: "GET",
				query: {
					...(opts?.authenticatorAttachment && {
						authenticatorAttachment: opts.authenticatorAttachment,
					}),
				},
			},
		);
		if (!options.data) {
			return options;
		}
		try {
			const res = await startRegistration({
				optionsJSON: options.data,
				useAutoRegister: opts?.useAutoRegister,
			});
			const verified = await $fetch<{
				passkey: Passkey;
			}>("/passkey/verify-registration", {
				...opts?.fetchOptions,
				...fetchOpts,
				body: {
					response: res,
					name: opts?.name,
				},
				method: "POST",
			});
			if (!verified.data) {
				return verified;
			}
			$listPasskeys.set(Math.random());
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
				if (e.code === "ERROR_CEREMONY_ABORTED") {
					return {
						data: null,
						error: {
							message: "registration cancelled",
							status: 400,
							statusText: "BAD_REQUEST",
						},
					};
				}
				return {
					data: null,
					error: {
						message: e.message,
						status: 400,
						statusText: "BAD_REQUEST",
					},
				};
			}
			return {
				data: null,
				error: {
					message: e instanceof Error ? e.message : "unknown error",
					status: 500,
					statusText: "INTERNAL_SERVER_ERROR",
				},
			};
		}
	};

	return {
		signIn: {
			/**
			 * Sign in with a registered passkey
			 */
			passkey: signInPasskey,
		},
		passkey: {
			/**
			 * Add a passkey to the user account
			 */
			addPasskey: registerPasskey,
		},
		/**
		 * Inferred Internal Types
		 */
		$Infer: {} as {
			Passkey: Passkey;
		},
	};
};

export const passkeyClient = () => {
	const $listPasskeys = atom<any>();
	return {
		id: "passkey",
		$InferServerPlugin: {} as ReturnType<typeof passkeyPl>,
		getActions: ($fetch) =>
			getPasskeyActions($fetch, {
				$listPasskeys,
			}),
		getAtoms($fetch) {
			const listPasskeys = useAuthQuery<Passkey[]>(
				$listPasskeys,
				"/passkey/list-user-passkeys",
				$fetch,
				{
					method: "GET",
				},
			);
			return {
				listPasskeys,
				$listPasskeys,
			};
		},
		pathMethods: {
			"/passkey/register": "POST",
			"/passkey/authenticate": "POST",
		},
		atomListeners: [
			{
				matcher(path) {
					return (
						path === "/passkey/verify-registration" ||
						path === "/passkey/delete-passkey" ||
						path === "/passkey/update-passkey"
					);
				},
				signal: "_listPasskeys",
			},
		],
	} satisfies BetterAuthClientPlugin;
};
