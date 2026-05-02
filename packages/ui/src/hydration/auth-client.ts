/**
 * Auth API client for hydration scripts.
 * Uses @better-fetch/fetch to mimic the main authClient implementation.
 */

import { createFetch } from "@better-fetch/fetch";
import {
	startAuthentication,
	startRegistration,
} from "@simplewebauthn/browser";
import type { BetterAuthUIConfig } from "../types/config";
import { getConfig } from "./config";

export interface User {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	image?: string;
	createdAt: string;
}

export interface Session {
	id: string;
	userId: string;
	expiresAt: string;
}

let cachedConfig: BetterAuthUIConfig | null = null;
let $fetch: ReturnType<typeof createFetch> | null = null;

function getApiBaseUrl(): string {
	if (!cachedConfig) {
		cachedConfig = getConfig();
	}
	return cachedConfig.apiBaseUrl;
}

function getFetch() {
	if (!$fetch) {
		const baseURL = getApiBaseUrl();
		const isCredentialsSupported = "credentials" in Request.prototype;

		$fetch = createFetch({
			baseURL,
			...(isCredentialsSupported ? { credentials: "include" } : {}),
			method: "GET",
			jsonParser(text) {
				if (!text) {
					return null;
				}
				try {
					return JSON.parse(text);
				} catch {
					return null;
				}
			},
			customFetchImpl: fetch,
		});
	}
	return $fetch;
}

export const authClient = {
	signIn: {
		email: (body: { email: string; password: string; rememberMe?: boolean }) =>
			getFetch()<{ user: User; session: Session }>("/sign-in/email", {
				method: "POST",
				body,
			}),

		social: (provider: string, callbackURL?: string) => {
			const baseUrl = getApiBaseUrl();
			const params = new URLSearchParams({ provider });
			if (callbackURL) {
				params.set("callbackURL", callbackURL);
			}
			window.location.href = `${baseUrl}/sign-in/social?${params}`;
		},
	},

	signUp: {
		email: (body: { email: string; password: string; name: string }) =>
			getFetch()<{ user: User; session: Session }>("/sign-up/email", {
				method: "POST",
				body,
			}),
	},

	signOut: () =>
		getFetch()<{ success: boolean }>("/sign-out", { method: "POST" }),

	getSession: () =>
		getFetch()<{ user: User; session: Session }>("/get-session"),

	forgetPassword: (body: { email: string; redirectTo?: string }) =>
		getFetch()<{ success: boolean }>("/forget-password", {
			method: "POST",
			body,
		}),

	resetPassword: (body: { token: string; newPassword: string }) =>
		getFetch()<{ success: boolean }>("/reset-password", {
			method: "POST",
			body,
		}),

	verifyEmail: (body: { token: string }) =>
		getFetch()<{ user: User }>("/verify-email", { method: "POST", body }),

	sendVerificationEmail: (body: { email: string }) =>
		getFetch()<{ success: boolean }>("/send-verification-email", {
			method: "POST",
			body,
		}),

	updateUser: (body: { name?: string; image?: string }) =>
		getFetch()<{ user: User }>("/update-user", { method: "POST", body }),

	changePassword: (body: { currentPassword: string; newPassword: string }) =>
		getFetch()<{ success: boolean }>("/change-password", {
			method: "POST",
			body,
		}),

	passkey: {
		authenticate: async () => {
			// Step 1: Get authentication options from server
			const optionsResponse = await getFetch()<{
				challenge: string;
				timeout?: number;
				rpId?: string;
				allowCredentials?: Array<{
					id: string;
					type: string;
					transports?: string[];
				}>;
				userVerification?: string;
			}>("/passkey/generate-authenticate-options", {
				method: "GET",
			});

			if (optionsResponse.error || !optionsResponse.data) {
				return optionsResponse as {
					data: null;
					error: typeof optionsResponse.error;
				};
			}

			// Step 2: Use WebAuthn browser API to authenticate
			try {
				const authResponse = await startAuthentication({
					optionsJSON: optionsResponse.data,
				});

				// Step 3: Verify authentication with server
				const { clientExtensionResults, ...responseBody } = authResponse;
				const verifyResponse = await getFetch()<{
					user: User;
					session: Session;
				}>("/passkey/verify-authentication", {
					method: "POST",
					body: { response: responseBody },
				});

				return verifyResponse;
			} catch (err) {
				return {
					data: null,
					error: {
						status: 400,
						statusText:
							err instanceof Error ? err.message : "Authentication cancelled",
					},
				};
			}
		},

		register: async () => {
			// Step 1: Get registration options from server
			const optionsResponse = await getFetch()<{
				challenge: string;
				rp: { name: string; id: string };
				user: { id: string; name: string; displayName: string };
				pubKeyCredParams: Array<{ type: string; alg: number }>;
				timeout?: number;
				excludeCredentials?: Array<{
					id: string;
					type: string;
					transports?: string[];
				}>;
				authenticatorSelection?: {
					authenticatorAttachment?: string;
					requireResidentKey?: boolean;
					userVerification?: string;
				};
				attestation?: string;
			}>("/passkey/generate-register-options", {
				method: "GET",
			});

			if (optionsResponse.error || !optionsResponse.data) {
				return optionsResponse as {
					data: null;
					error: typeof optionsResponse.error;
				};
			}

			// Step 2: Use WebAuthn browser API to register
			try {
				const regResponse = await startRegistration({
					optionsJSON: optionsResponse.data,
				});

				// Step 3: Verify registration with server
				const { clientExtensionResults, ...responseBody } = regResponse;
				const verifyResponse = await getFetch()<{ success: boolean }>(
					"/passkey/verify-registration",
					{
						method: "POST",
						body: { response: responseBody },
					},
				);

				return verifyResponse;
			} catch (err) {
				return {
					data: null,
					error: {
						status: 400,
						statusText:
							err instanceof Error ? err.message : "Registration cancelled",
					},
				};
			}
		},

		addPasskey: async () => {
			// Same as register - just an alias for adding passkey to existing account
			const optionsResponse = await getFetch()<{
				challenge: string;
				rp: { name: string; id: string };
				user: { id: string; name: string; displayName: string };
				pubKeyCredParams: Array<{ type: string; alg: number }>;
				timeout?: number;
				excludeCredentials?: Array<{
					id: string;
					type: string;
					transports?: string[];
				}>;
				authenticatorSelection?: {
					authenticatorAttachment?: string;
					requireResidentKey?: boolean;
					userVerification?: string;
				};
				attestation?: string;
			}>("/passkey/generate-register-options", {
				method: "GET",
			});

			if (optionsResponse.error || !optionsResponse.data) {
				return optionsResponse as {
					data: null;
					error: typeof optionsResponse.error;
				};
			}

			try {
				const regResponse = await startRegistration({
					optionsJSON: optionsResponse.data,
				});

				const { clientExtensionResults, ...responseBody } = regResponse;
				const verifyResponse = await getFetch()<{ success: boolean }>(
					"/passkey/verify-registration",
					{
						method: "POST",
						body: { response: responseBody },
					},
				);

				return verifyResponse;
			} catch (err) {
				return {
					data: null,
					error: {
						status: 400,
						statusText:
							err instanceof Error ? err.message : "Registration cancelled",
					},
				};
			}
		},
	},
};

export type AuthClient = typeof authClient;
