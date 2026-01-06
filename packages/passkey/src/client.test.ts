import { describe, expect, it, vi } from "vitest";
import { getPasskeyActions } from "./client";

const mocks = vi.hoisted(() => ({
	startRegistration: vi.fn(),
	startAuthentication: vi.fn(),
}));

vi.mock("@simplewebauthn/browser", () => ({
	startRegistration: mocks.startRegistration,
	startAuthentication: mocks.startAuthentication,
	WebAuthnError: class WebAuthnError extends Error {
		code: string;
		constructor(code: string, message?: string) {
			super(message ?? code);
			this.code = code;
		}
	},
}));

describe("passkey client", () => {
	it("merges registration extensions and returns WebAuthn response", async () => {
		const fetchMock = vi.fn(async (path: string) => {
			if (path === "/passkey/generate-register-options") {
				return {
					data: {
						challenge: "challenge",
						rp: { name: "Test", id: "example.com" },
						user: { id: "user", name: "user" },
						pubKeyCredParams: [],
						extensions: { credProps: true },
					},
				};
			}
			if (path === "/passkey/verify-registration") {
				return {
					data: {
						id: "passkey-id",
						userId: "user",
					},
				};
			}
			return { data: null };
		});
		const listPasskeys = { set: vi.fn() };
		const store = { notify: vi.fn() };
		const actions = getPasskeyActions(fetchMock as any, {
			$listPasskeys: listPasskeys as any,
			$store: store as any,
		});

		mocks.startRegistration.mockResolvedValue({
			clientExtensionResults: { credProps: true },
			response: {
				transports: ["internal"],
			},
		});

		const result = await actions.passkey.addPasskey({
			extensions: { hmacCreateSecret: true },
			returnWebAuthnResponse: true,
		});

		expect(mocks.startRegistration).toHaveBeenCalledWith(
			expect.objectContaining({
				optionsJSON: expect.objectContaining({
					extensions: {
						credProps: true,
						hmacCreateSecret: true,
					},
				}),
			}),
		);
		expect(
			"webauthn" in result && result.webauthn?.clientExtensionResults,
		).toEqual({
			credProps: true,
		});
	});

	it("merges authentication extensions and returns WebAuthn response", async () => {
		const fetchMock = vi.fn(async (path: string) => {
			if (path === "/passkey/generate-authenticate-options") {
				return {
					data: {
						challenge: "challenge",
						rpId: "example.com",
						allowCredentials: [],
						userVerification: "preferred",
						extensions: { credProps: true },
					},
				};
			}
			if (path === "/passkey/verify-authentication") {
				return {
					data: {
						session: { id: "session" },
						user: { id: "user" },
					},
				};
			}
			return { data: null };
		});
		const listPasskeys = { set: vi.fn() };
		const store = { notify: vi.fn() };
		const actions = getPasskeyActions(fetchMock as any, {
			$listPasskeys: listPasskeys as any,
			$store: store as any,
		});

		mocks.startAuthentication.mockResolvedValue({
			clientExtensionResults: { credProps: true },
		});

		const result = await actions.signIn.passkey({
			// hmacGetSecret is a valid WebAuthn extension but not in standard type definitions
			extensions: { hmacGetSecret: true } as Record<string, unknown>,
			returnWebAuthnResponse: true,
		});

		expect(mocks.startAuthentication).toHaveBeenCalledWith(
			expect.objectContaining({
				optionsJSON: expect.objectContaining({
					extensions: {
						credProps: true,
						hmacGetSecret: true,
					},
				}),
			}),
		);
		expect(
			"webauthn" in result && result.webauthn?.clientExtensionResults,
		).toEqual({
			credProps: true,
		});
	});
});
