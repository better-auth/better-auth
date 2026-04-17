import type { ClientStore } from "@better-auth/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oneTapClient } from "./client";

type GoogleCredentialCallback = (response: {
	credential: string;
}) => Promise<void>;

function installGoogleWindow() {
	let callback: GoogleCredentialCallback | undefined;
	const container = {};
	const windowObject = {
		googleScriptInitialized: true,
		google: {
			accounts: {
				id: {
					initialize: vi.fn(
						(config: { callback: GoogleCredentialCallback }) => {
							callback = config.callback;
						},
					),
					prompt: vi.fn(),
					renderButton: vi.fn(),
				},
			},
		},
		document: {
			querySelector: vi.fn(() => container),
		},
		location: {
			href: "http://localhost/current",
		},
	};

	Object.defineProperty(globalThis, "window", {
		value: windowObject,
		configurable: true,
	});
	Object.defineProperty(globalThis, "document", {
		value: windowObject.document,
		configurable: true,
	});

	return {
		windowObject,
		getCallback() {
			if (!callback) {
				throw new Error("Expected Google callback to be initialized");
			}
			return callback;
		},
	};
}

afterEach(() => {
	Reflect.deleteProperty(globalThis, "window");
	Reflect.deleteProperty(globalThis, "document");
});

const clientStoreStub: ClientStore = {
	notify: vi.fn(),
	listen: vi.fn(),
	atoms: {},
};

describe("oneTapClient", () => {
	it("redirects 2FA challenges with callback params instead of the bare callback URL", async () => {
		const googleWindow = installGoogleWindow();
		const fetch = vi.fn().mockResolvedValue({
			data: {
				kind: "challenge",
				challenge: {
					kind: "two-factor",
					attemptId: "attempt-id",
					availableMethods: ["otp"],
				},
			},
		});
		const plugin = oneTapClient({
			clientId: "test-client",
		});

		await plugin.getActions(fetch, clientStoreStub).oneTap({
			button: {
				container: "#one-tap",
			},
			callbackURL: "/dashboard",
		});
		await googleWindow.getCallback()({
			credential: "id-token",
		});

		expect(fetch).toHaveBeenCalledWith("/one-tap/callback", {
			method: "POST",
			body: {
				idToken: "id-token",
			},
		});
		expect(googleWindow.windowObject.location.href).toBe(
			"http://localhost/dashboard?challenge=two-factor&methods=otp",
		);
	});

	it("uses onTwoFactorRedirect when provided for challenge responses", async () => {
		const googleWindow = installGoogleWindow();
		const onTwoFactorRedirect = vi.fn();
		const fetch = vi.fn().mockResolvedValue({
			data: {
				kind: "challenge",
				challenge: {
					kind: "two-factor",
					attemptId: "attempt-id",
					availableMethods: ["totp", "otp"],
				},
			},
		});
		const plugin = oneTapClient({
			clientId: "test-client",
		});

		await plugin.getActions(fetch, clientStoreStub).oneTap({
			button: {
				container: "#one-tap",
			},
			callbackURL: "/dashboard",
			onTwoFactorRedirect,
		});
		await googleWindow.getCallback()({
			credential: "id-token",
		});

		expect(onTwoFactorRedirect).toHaveBeenCalledWith({
			attemptId: "attempt-id",
			availableMethods: ["totp", "otp"],
		});
		expect(googleWindow.windowObject.location.href).toBe(
			"http://localhost/current",
		);
	});

	it("handles BetterFetch 2FA challenges in the prompt flow", async () => {
		const googleWindow = installGoogleWindow();
		const fetch = vi.fn().mockResolvedValue({
			data: {
				kind: "challenge",
				challenge: {
					kind: "two-factor",
					attemptId: "prompt-attempt",
					availableMethods: ["otp"],
				},
			},
		});
		const plugin = oneTapClient({
			clientId: "test-client",
		});

		const action = plugin.getActions(fetch, clientStoreStub).oneTap({
			callbackURL: "/dashboard",
		});
		await Promise.resolve();
		await googleWindow.getCallback()({
			credential: "prompt-id-token",
		});
		await action;

		expect(fetch).toHaveBeenCalledWith("/one-tap/callback", {
			method: "POST",
			body: {
				idToken: "prompt-id-token",
			},
		});
		expect(googleWindow.windowObject.location.href).toBe(
			"http://localhost/dashboard?challenge=two-factor&methods=otp",
		);
	});
});
