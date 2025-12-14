import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { BetterFetch } from "@better-fetch/fetch";
import { generateRandomString } from "better-auth/crypto";
import { isProcessType } from "./helper";
import type { ElectronClientOptions } from "./types";

export const kCodeVerifier = Symbol.for("better-auth:code_verifier");
export const kState = Symbol.for("better-auth:state");

/**
 * Opens the system browser to request user authentication.
 *
 * @internal
 */
export async function requestAuth(options: ElectronClientOptions) {
	let shell: Electron.Shell | null = null;
	try {
		shell = (await import("electron")).shell;
	} catch {
		throw new Error(
			"`requestAuth` can only be called in an Electron environment",
		);
	}

	if (!isProcessType("browser")) {
		throw new Error("`requestAuth` can only be called in the main process");
	}
	const { randomBytes } = await import("node:crypto");

	const state = generateRandomString(16, "A-Z", "a-z", "0-9");

	const codeVerifier = base64Url.encode(randomBytes(32));
	const codeChallenge = base64Url.encode(
		await createHash("SHA-256").digest(codeVerifier),
	);

	(globalThis as any)[kCodeVerifier] = codeVerifier;
	(globalThis as any)[kState] = state;

	const url = new URL(options.redirectURL);
	url.searchParams.set("client_id", options.customClientID || "electron");
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);

	await shell.openExternal(url.toString(), {
		activate: true,
	});
}

/**
 * Exchanges the authorization code for a session.
 *
 * @internal
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
				`${options.namespace || "auth"}:authenticated`,
				ctx.data.user,
			);
		},
		throw: true,
	});
}
