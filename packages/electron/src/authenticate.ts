import type { BetterAuthClientOptions } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { BetterFetch } from "@better-fetch/fetch";
import { APIError, getBaseURL } from "better-auth";
import { signInSocial } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { shell } from "electron";
import * as z from "zod";
import type { ElectronClientOptions } from "./types/client";
import { isProcessType } from "./utils";

export const kCodeVerifier = Symbol.for("better-auth:code_verifier");
export const kState = Symbol.for("better-auth:state");

const requestAuthOptionsSchema = (() => {
	const { provider, idToken, loginHint, ...signInSocialBody } =
		signInSocial().options.body.shape;

	return z.object({
		...signInSocialBody,
		provider: z.string().nonempty().optional(),
	});
})();
export type ElectronRequestAuthOptions = z.infer<
	typeof requestAuthOptionsSchema
>;

/**
 * Opens the system browser to request user authentication.
 */
export async function requestAuth(
	clientOptions: BetterAuthClientOptions | undefined,
	options: ElectronClientOptions,
	cfg?: ElectronRequestAuthOptions | undefined,
) {
	if (!isProcessType("browser")) {
		throw new BetterAuthError(
			"`requestAuth` can only be called in the main process",
		);
	}
	const { randomBytes } = await import("node:crypto");

	const state = generateRandomString(16, "A-Z", "a-z", "0-9");

	const codeVerifier = base64Url.encode(randomBytes(32));
	const codeChallenge = base64Url.encode(
		await createHash("SHA-256").digest(codeVerifier),
	);

	(globalThis as any)[kCodeVerifier] = codeVerifier;
	(globalThis as any)[kState] = state;

	let url: URL | null = null;
	if (cfg?.provider) {
		const baseURL = getBaseURL(
			clientOptions?.baseURL,
			clientOptions?.basePath,
			undefined,
			true,
		);

		if (!baseURL) {
			console.log("No base URL found in client options");
			throw APIError.from("INTERNAL_SERVER_ERROR", {
				code: "NO_BASE_URL",
				message: "Base URL is required to use provider-based sign-in.",
			});
		}
		url = new URL(`${baseURL}/electron/init-oauth-proxy`);
		for (const [key, value] of Object.entries(cfg)) {
			url.searchParams.set(
				key,
				typeof value === "string" ? value : JSON.stringify(value),
			);
		}
	} else {
		url = new URL(options.signInURL);
	}
	url.searchParams.set("client_id", options.clientID || "electron");
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);

	if (url === null) {
		throw new Error("Failed to construct sign-in URL.");
	}

	await shell.openExternal(url.toString(), {
		activate: true,
	});
}

/**
 * Exchanges the authorization code for a session.
 */
export async function authenticate(
	$fetch: BetterFetch,
	options: ElectronClientOptions,
	body: {
		token: string;
	},
	getWindow: () => Electron.BrowserWindow | null | undefined,
) {
	const codeVerifier = (globalThis as any)[kCodeVerifier];
	const state = (globalThis as any)[kState];
	(globalThis as any)[kCodeVerifier] = undefined;
	(globalThis as any)[kState] = undefined;

	if (!codeVerifier) {
		throw new Error("Code verifier not found.");
	}
	if (!state) {
		throw new Error("State not found.");
	}

	await $fetch("/electron/token", {
		method: "POST",
		body: {
			...body,
			state,
			code_verifier: codeVerifier,
		},
		onSuccess: (ctx) => {
			getWindow()?.webContents.send(
				`${options.namespace || "better-auth"}:authenticated`,
				ctx.data.user,
			);
		},
		throw: true,
	});
}
