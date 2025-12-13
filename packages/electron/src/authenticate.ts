import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { BetterFetch } from "@better-fetch/fetch";
import { generateRandomString } from "better-auth/crypto";
import { isProcessType } from "./helper";
import type { ElectronClientOptions } from "./types";

export const kCodeVerifier = Symbol.for("better-auth:code_verifier");
export const kState = Symbol.for("better-auth:state");

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
	const code_verifier = base64Url.encode(randomBytes(32));
	const code_challenge = base64Url.encode(
		await createHash("SHA-256").digest(code_verifier),
	);

	(globalThis as any)[kCodeVerifier] = code_verifier;
	(globalThis as any)[kState] = state;

	const url = new URL(options.redirectURL);
	url.searchParams.set("client_id", "electron");
	url.searchParams.set("code_challenge", code_challenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("state", state);

	await shell.openExternal(url.toString(), {
		activate: true,
	});
}

export async function authenticate(
	$fetch: BetterFetch,
	options: ElectronClientOptions,
	body: {
		token: string;
	},
	getWindow: () => Electron.BrowserWindow | null | undefined,
) {
	const code_verifier = (globalThis as any)[kCodeVerifier];
	const state = (globalThis as any)[kState];
	(globalThis as any)[kCodeVerifier] = undefined;
	(globalThis as any)[kState] = undefined;

	if (!code_verifier) {
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
			code_verifier,
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
