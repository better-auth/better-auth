import { WebAuthnError } from "@simplewebauthn/browser";
import { describe, expect, it, vi } from "vitest";
import { getPasskeyActions } from "./client";
import { PASSKEY_ERROR_CODES } from "./error-codes";

const mocks = vi.hoisted(() => ({
	startRegistration: vi.fn(),
	startAuthentication: vi.fn(),
}));

vi.mock("@simplewebauthn/browser", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@simplewebauthn/browser")>();

	return {
		...actual,
		startRegistration: mocks.startRegistration,
		startAuthentication: mocks.startAuthentication,
	};
});

const createRegistrationActions = () => {
	const fetchMock = vi.fn(async (path: string) => {
		if (path === "/passkey/generate-register-options") {
			return {
				data: {
					challenge: "challenge",
					rp: { name: "Test", id: "example.com" },
					user: { id: "user", name: "user" },
					pubKeyCredParams: [],
				},
			};
		}

		return { data: null };
	});

	return getPasskeyActions(fetchMock as never, {
		$listPasskeys: { set: vi.fn() } as never,
		$store: { notify: vi.fn() } as never,
	});
};

describe("passkey client", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/issues/10447
	 */
	it.each([
		["ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED", "PREVIOUSLY_REGISTERED"],
		["ERROR_CEREMONY_ABORTED", "REGISTRATION_CANCELLED"],
	] as const)("maps %s to the %s passkey error code", async (webAuthnCode, passkeyCode) => {
		mocks.startRegistration.mockRejectedValueOnce(
			new WebAuthnError({
				code: webAuthnCode,
				message: "WebAuthn registration failed",
				cause: new Error("WebAuthn registration failed"),
			}),
		);
		const actions = createRegistrationActions();

		const result = await actions.passkey.addPasskey();

		expect(result).toMatchObject({
			data: null,
			error: {
				code: passkeyCode,
				message: PASSKEY_ERROR_CODES[passkeyCode].message,
			},
		});
	});

	it("uses passkey error-code keys for mapped registration failures", () => {
		const errorCodes = Object.keys(PASSKEY_ERROR_CODES);

		expect(errorCodes).toContain("PREVIOUSLY_REGISTERED");
		expect(errorCodes).toContain("REGISTRATION_CANCELLED");
	});

	it("merges registration extensions and returns WebAuthn response", async () => {
		const fetchMock = vi.fn(async (path: string, options?: any) => {
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
			context: "onboarding-context",
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/passkey/generate-register-options",
			expect.objectContaining({
				query: expect.objectContaining({
					context: "onboarding-context",
				}),
			}),
		);

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

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9373
	 */
	it("returns an auth error without logging expected authentication ceremony failures", async () => {
		mocks.startAuthentication.mockRejectedValueOnce(
			new Error(
				"Resident credentials or empty 'allowCredentials' lists are not supported at this time.",
			),
		);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const fetchMock = vi.fn(async (path: string) => {
			if (path === "/passkey/generate-authenticate-options") {
				return {
					data: {
						challenge: "challenge",
						rpId: "example.com",
						allowCredentials: [],
						userVerification: "preferred",
					},
				};
			}
			if (path === "/passkey/verify-authentication") {
				throw new Error("verification should not run after ceremony failure");
			}
			return { data: null };
		});
		const listPasskeys = { set: vi.fn() };
		const store = { notify: vi.fn() };
		const actions = getPasskeyActions(fetchMock as any, {
			$listPasskeys: listPasskeys as any,
			$store: store as any,
		});

		try {
			const result = await actions.signIn.passkey({ autoFill: true });

			expect(result).toEqual({
				data: null,
				error: {
					code: "AUTH_CANCELLED",
					message: "Auth cancelled",
					status: 400,
					statusText: "BAD_REQUEST",
				},
			});
			expect(consoleError).not.toHaveBeenCalled();
			expect(fetchMock).not.toHaveBeenCalledWith(
				"/passkey/verify-authentication",
				expect.anything(),
			);
		} finally {
			consoleError.mockRestore();
		}
	});
});
