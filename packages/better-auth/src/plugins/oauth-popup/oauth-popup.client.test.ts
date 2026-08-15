// @vitest-environment happy-dom
import type { BetterFetch } from "@better-fetch/fetch";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSignInPopup, popupBearerFetchPlugin } from "./client";
import { OAUTH_POPUP_MESSAGE_TYPE, POPUP_TOKEN_STORAGE_KEY } from "./constants";

const AUTH_ORIGIN = "https://auth.example.com";

function fakePopup() {
	return {
		closed: false,
		close: vi.fn(),
		focus: vi.fn(),
	} as unknown as Window;
}

/**
 * Pretend the page is a cross-origin iframe so the token is stored locally.
 */
function makeEmbedded() {
	vi.stubGlobal("top", {
		get location(): Location {
			throw new Error("cross-origin");
		},
	});
}

/**
 * Starts `signIn.popup` with a mocked `window.open`, returning the result
 * promise and the nonce the client put in the start URL (so a test can forge a
 * completion message that passes — or fails — the gate).
 */
function startPopup() {
	const open = vi.fn((..._args: unknown[]) => fakePopup());
	vi.stubGlobal("open", open);
	const $fetch = vi.fn().mockResolvedValue({
		data: { user: { email: "u@test.com" } },
		error: null,
	});
	const result = createSignInPopup({
		$fetch: $fetch as unknown as BetterFetch,
		options: { baseURL: AUTH_ORIGIN },
		notifySessionSignal: vi.fn(),
	})({ provider: "google" });
	const startUrl = new URL(`${open.mock.calls[0]?.[0]}`);
	return { result, nonce: startUrl.searchParams.get("popupNonce") ?? "" };
}

function post(origin: string, data: unknown) {
	window.dispatchEvent(new MessageEvent("message", { origin, data }));
}

afterEach(() => {
	vi.unstubAllGlobals();
	localStorage.clear();
});

describe("signIn.popup completion gate", () => {
	it("accepts only a token from the auth origin with the right nonce", async () => {
		makeEmbedded();
		const { result, nonce } = startPopup();
		// A spoofed origin and a wrong nonce must both be ignored...
		post("https://evil.example.com", {
			type: OAUTH_POPUP_MESSAGE_TYPE,
			nonce,
			token: "from-evil-origin",
		});
		post(AUTH_ORIGIN, {
			type: OAUTH_POPUP_MESSAGE_TYPE,
			nonce: "wrong-nonce",
			token: "wrong-nonce-token",
		});
		// ...only the genuine completion message wins.
		post(AUTH_ORIGIN, { type: OAUTH_POPUP_MESSAGE_TYPE, nonce, token: "real" });

		await expect(result).resolves.toEqual({
			data: { success: true },
			error: null,
		});
		expect(localStorage.getItem(POPUP_TOKEN_STORAGE_KEY)).toBe("real");
	});

	it("ignores a wrong message type", async () => {
		makeEmbedded();
		const { result, nonce } = startPopup();
		post(AUTH_ORIGIN, { type: "not-ours", nonce, token: "spoofed" });
		post(AUTH_ORIGIN, { type: OAUTH_POPUP_MESSAGE_TYPE, nonce, token: "real" });

		await result;
		expect(localStorage.getItem(POPUP_TOKEN_STORAGE_KEY)).toBe("real");
	});

	it("relays a completion error from the auth origin", async () => {
		const { result, nonce } = startPopup();
		post(AUTH_ORIGIN, {
			type: OAUTH_POPUP_MESSAGE_TYPE,
			nonce,
			error: { code: "access_denied", description: "denied" },
		});

		await expect(result).resolves.toEqual({
			data: null,
			error: { code: "access_denied", message: "denied" },
		});
	});
});

describe("popup bearer fetch plugin", () => {
	const request = (path: string) =>
		({ request: new Request(`${AUTH_ORIGIN}/api/auth${path}`) }) as never;

	it("attaches the stored token only when embedded", async () => {
		localStorage.setItem(POPUP_TOKEN_STORAGE_KEY, "tok");

		const topLevel = await popupBearerFetchPlugin.hooks!.onRequest!({
			headers: new Headers(),
		} as never);
		expect(
			(topLevel as { headers: Headers }).headers.has("authorization"),
		).toBe(false);

		makeEmbedded();
		const embedded = await popupBearerFetchPlugin.hooks!.onRequest!({
			headers: new Headers(),
		} as never);
		expect(
			(embedded as { headers: Headers }).headers.get("authorization"),
		).toBe("Bearer tok");
	});

	it("clears the token when the session ends", async () => {
		localStorage.setItem(POPUP_TOKEN_STORAGE_KEY, "tok");
		await popupBearerFetchPlugin.hooks!.onSuccess!(request("/sign-out"));
		expect(localStorage.getItem(POPUP_TOKEN_STORAGE_KEY)).toBeNull();
	});
});
