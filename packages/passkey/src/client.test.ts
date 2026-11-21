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

	it("forwards createSession and notifies the session signal", async () => {
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
			if (path === "/passkey/verify-registration") {
				return {
					data: {
						id: "passkey-id",
						userId: "user",
						session: {
							id: "session-id",
							token: "session-token",
						},
						user: {
							id: "user",
						},
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
			clientExtensionResults: {},
			response: {
				transports: ["internal"],
			},
		});

		await actions.passkey.addPasskey({
			createSession: true,
		});

		expect(fetchMock).toHaveBeenCalledWith(
			"/passkey/verify-registration",
			expect.objectContaining({
				body: expect.objectContaining({
					createSession: true,
				}),
			}),
		);
		expect(listPasskeys.set).toHaveBeenCalled();
		expect(store.notify).toHaveBeenCalledWith("$sessionSignal");
	});

	it("does not notify the session signal when registration does not return a session", async () => {
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
			clientExtensionResults: {},
			response: {
				transports: ["internal"],
			},
		});

		await actions.passkey.addPasskey();

		expect(listPasskeys.set).toHaveBeenCalled();
		expect(store.notify).not.toHaveBeenCalledWith("$sessionSignal");
	});

	describe("session refresh", () => {
		const verified = {
			data: {
				id: "passkey-id",
				session: { id: "session" },
				user: { id: "user" },
			},
			error: null,
		};

		function actions(response: unknown, notify: () => Promise<void>) {
			mocks.startAuthentication.mockResolvedValue({
				clientExtensionResults: {},
			});
			mocks.startRegistration.mockResolvedValue({
				clientExtensionResults: {},
				response: {},
			});
			const fetchMock = vi.fn(async (path: string) => {
				if (path === "/passkey/generate-authenticate-options") {
					return {
						data: {
							challenge: "challenge",
							rpId: "example.com",
						},
					};
				}
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
				return response;
			});
			return getPasskeyActions(fetchMock as any, {
				$listPasskeys: { set: vi.fn() } as any,
				$store: { notify } as any,
			});
		}

		type Actions = ReturnType<typeof actions>;
		const calls: [string, (actions: Actions) => Promise<unknown>][] = [
			["sign-in", (actions) => actions.signIn.passkey()],
			[
				"registration with a session",
				(actions) => actions.passkey.addPasskey({ createSession: true }),
			],
		];

		it.for(calls)(
			"resolves a %s only after the session refresh",
			async ([, call]) => {
				let release!: () => void;
				const notify = vi.fn(
					() =>
						new Promise<void>((resolve) => {
							release = resolve;
						}),
				);
				const pending = call(actions(verified, notify));
				await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());

				// A call that did not wait for the refresh resolves within this task.
				const outcome = await Promise.race([
					pending.then(() => "resolved"),
					new Promise((resolve) => setTimeout(resolve, 0, "waiting")),
				]);
				expect(outcome).toBe("waiting");
				release();
				await pending;
			},
		);

		it("does not refresh the session when verification fails", async () => {
			const notify = vi.fn(async () => {});
			await actions(
				{
					data: null,
					error: { status: 400, message: "invalid" },
				},
				notify,
			).signIn.passkey();

			expect(notify).not.toHaveBeenCalled();
		});

		it("does not refresh the session when the signal is disabled", async () => {
			const notify = vi.fn(async () => {});
			const passkey = actions(verified, notify);
			await passkey.signIn.passkey(undefined, { disableSignal: true });
			await passkey.passkey.addPasskey(
				{ createSession: true },
				{ disableSignal: true },
			);

			expect(notify).not.toHaveBeenCalled();
		});
	});
});
