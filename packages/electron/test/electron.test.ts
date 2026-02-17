import { randomBytes } from "node:crypto";
import { createAuthMiddleware } from "@better-auth/core/api";
import { BetterAuthError } from "@better-auth/core/error";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { createAuthClient } from "better-auth/client";
import { parseSetCookieHeader } from "better-auth/cookies";
import { generateRandomString } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";
import { beforeEach, describe, expect, vi } from "vitest";
import { authenticate, kCodeVerifier, kState } from "../src/authenticate";
import { electronClient } from "../src/client";
import { ELECTRON_ERROR_CODES } from "../src/error-codes";
import { electron } from "../src/index";
import { fetchUserImage, normalizeUserOutput } from "../src/user";
import { it, testUtils } from "./utils";

const mockElectron = vi.hoisted(() => {
	const BrowserWindow = {
		constructor: vi.fn(),
		send: vi.fn(),
		webContents: {
			send: vi.fn(),
		},
	};

	const electron = {
		ipcMain: {
			handle: vi.fn(),
		},
		app: {
			userAgentFallback: "test-user-agent",
			whenReady: vi.fn(() => Promise.resolve()),
			setAsDefaultProtocolClient: vi.fn(() => true),
			requestSingleInstanceLock: vi.fn(() => true),
			on: vi.fn(),
			quit: vi.fn(),
		},
		shell: {
			openExternal: vi.fn(),
		},
		safeStorage: {
			encryptString: vi.fn((str: string) =>
				Buffer.from(str).toString("base64"),
			),
			decryptString: vi.fn((buf: Buffer) =>
				Buffer.from(buf.toString(), "base64").toString(),
			),
		},
		webContents: {
			getFocusedWebContents: vi.fn(() => BrowserWindow),
		},
		session: {
			defaultSession: {
				webRequest: {
					onBeforeSendHeaders: vi.fn(),
					onHeadersReceived: vi.fn(),
				},
			},
		},
		net: {
			fetch: vi.fn(),
		},
		protocol: {
			registerSchemesAsPrivileged: vi.fn(),
			handle: vi.fn(),
		},
		BrowserWindow,
	};

	return {
		...electron,
		default: electron,
	};
});

vi.mock("electron", () => mockElectron);

describe("Electron", () => {
	const { auth, client, proxyClient, options } = testUtils();

	it("should throw error when making requests outside the main process", async ({
		setProcessType,
	}) => {
		setProcessType("renderer");

		await expect(client.getSession()).rejects.toThrowError(
			"Requests must be made from the Electron main process",
		);
	});

	it("should open external url in default browser", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		await client.requestAuth();

		(globalThis as any)[kCodeVerifier] = undefined;
		(globalThis as any)[kState] = undefined;

		expect(mockElectron.shell.openExternal).toHaveBeenCalledWith(
			expect.stringContaining(options.signInURL),
			{
				activate: true,
			},
		);
	});

	it("should set redirect cookie after signing in", async () => {
		(globalThis as any)[kCodeVerifier] = "test-challenge";
		(globalThis as any)[kState] = "abc";

		const { error } = await proxyClient.signUp.email(
			{
				email: "test@test.com",
				password: "password",
				name: "Test User",
			},
			{
				query: {
					client_id: "electron",
					code_challenge: "test-challenge",
					code_challenge_method: "plain",
					state: "abc",
				},
				onResponse: async (ctx) => {
					const cookies = parseSetCookieHeader(
						ctx.response.headers.get("set-cookie") || "",
					);

					const redirectCookie = cookies.get(`better-auth.electron`);
					expect(redirectCookie).toBeDefined();
					expect(redirectCookie?.httponly).not.toBe(true);
					expect(redirectCookie?.["max-age"]).toStrictEqual(120);
				},
				customFetchImpl: (url, init) => {
					const req = new Request(url.toString(), init);
					return auth.handler(req);
				},
			},
		);
		expect(error).toBeNull();
	});

	it("should include `electron_authorization_code` in sign-up response", async () => {
		(globalThis as any)[kCodeVerifier] = "test-challenge";
		(globalThis as any)[kState] = "abc";

		const { data } = await proxyClient.signUp.email(
			{
				email: "electron-code-test@test.com",
				password: "password",
				name: "Electron Code Test",
			},
			{
				query: {
					client_id: "electron",
					code_challenge: "test-challenge",
					code_challenge_method: "plain",
					state: "abc",
				},
			},
		);

		expect(data).not.toBeNull();
		expect(data).toHaveProperty("electron_authorization_code");
		// @ts-expect-error
		expect(data!.electron_authorization_code).toBeTypeOf("string");
	});

	it("should exchange token", async ({ setProcessType }) => {
		setProcessType("browser");

		const { user } = await auth.api.signInEmail({
			body: {
				email: "test@test.com",
				password: "password",
			},
		});

		const codeVerifier = base64Url.encode(randomBytes(32));
		const codeChallenge = base64Url.encode(
			await createHash("SHA-256").digest(codeVerifier),
		);

		const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
		await (await auth.$context).adapter.create({
			model: "verification",
			data: {
				identifier: `electron:${identifier}`,
				value: JSON.stringify({
					userId: user.id,
					codeChallenge,
					codeChallengeMethod: "s256",
					state: "abc",
				}),
				expiresAt: new Date(Date.now() + 300 * 1000),
			},
		});

		const { data } = await client.$fetch<any>("/electron/token", {
			method: "POST",
			body: {
				token: identifier,
				code_verifier: codeVerifier,
				state: "abc",
			},
			onResponse: async (ctx) => {
				const cookies = parseSetCookieHeader(
					ctx.response.headers.get("set-cookie") || "",
				);

				expect(cookies.has("better-auth.session_token")).toBe(true);
			},
		});

		expect(data?.token).toBeDefined();
		expect(data?.user.id).toBe(user.id);

		expect(mockElectron.safeStorage.encryptString).toHaveBeenCalled();
	});

	it("should emit authenticated event on success", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		const { user } = await auth.api.signInEmail({
			body: {
				email: "test@test.com",
				password: "password",
			},
		});

		(globalThis as any)[kCodeVerifier] = "test-challenge";
		(globalThis as any)[kState] = "abc";

		const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
		await (await auth.$context).adapter.create({
			model: "verification",
			data: {
				identifier: `electron:${identifier}`,
				value: JSON.stringify({
					userId: user.id,
					codeChallenge: "test-challenge",
					codeChallengeMethod: "plain",
					state: "abc",
				}),
				expiresAt: new Date(Date.now() + 300 * 1000),
			},
		});

		await expect(
			authenticate({
				$fetch: client.$fetch,
				options,
				token: identifier,
				// @ts-expect-error
				getWindow: () => mockElectron.BrowserWindow,
			}),
		).resolves.toBeDefined();

		expect(mockElectron.BrowserWindow.webContents.send).toHaveBeenCalledWith(
			"better-auth:authenticated",
			expect.objectContaining({
				id: user.id,
			}),
		);
	});

	it("should emit user-updated event when session atom updates", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		client.setupMain();

		const mockUser = {
			id: "test-user",
		};

		client.$store.atoms.session!.set({
			data: {
				user: mockUser,
			},
		});

		// flush
		await Promise.resolve();

		expect(mockElectron.BrowserWindow.send).toHaveBeenCalledWith(
			"better-auth:user-updated",
			mockUser,
		);
	});

	it("should reject expired tokens", async ({ setProcessType }) => {
		setProcessType("browser");
		const { user } = await auth.api.signInEmail({
			body: {
				email: "test@test.com",
				password: "password",
			},
		});

		(globalThis as any)[kCodeVerifier] = "test-challenge";
		(globalThis as any)[kState] = "abc";

		const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
		await (await auth.$context).adapter.create({
			model: "verification",
			data: {
				identifier: `electron:${identifier}`,
				value: JSON.stringify({
					userId: user.id,
					codeChallenge: "test-challenge",
					codeChallengeMethod: "plain",
					state: "abc",
				}),
				expiresAt: new Date(Date.now() + 999),
			},
		});

		vi.advanceTimersByTime(1000);

		await expect(
			authenticate({
				$fetch: client.$fetch,
				options,
				token: identifier,
				// @ts-expect-error
				getWindow: () => mockElectron.BrowserWindow,
				fetchOptions: { throw: true },
			}).catch((err: any) => {
				expect(err.error.message).toBe("Invalid or expired token.");
				throw err;
			}),
		).rejects.toThrowError("NOT_FOUND");
	});

	it("should reject invalid/non-existent tokens", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		(globalThis as any)[kCodeVerifier] = "test-challenge";
		(globalThis as any)[kState] = "abc";

		await expect(
			authenticate({
				$fetch: client.$fetch,
				options,
				token: "non-existent",
				// @ts-expect-error
				getWindow: () => mockElectron.BrowserWindow,
				fetchOptions: { throw: true },
			}).catch((err: any) => {
				expect(err.error.message).toBe("Invalid or expired token.");
				throw err;
			}),
		).rejects.toThrowError("NOT_FOUND");
	});

	it("should emit error event on failure", async ({ setProcessType }) => {
		setProcessType("browser");

		await client.changeEmail({
			// @ts-expect-error
			newEmail: null,
		});

		expect(mockElectron.BrowserWindow.send).toHaveBeenCalledWith(
			"better-auth:error",
			expect.objectContaining({
				status: 400,
			}),
		);
	});

	it("should error when user referenced by token does not exist", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		// Create verification referencing a non-existent user id
		const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
		await (await auth.$context).adapter.create({
			model: "verification",
			data: {
				identifier: `electron:${identifier}`,
				value: JSON.stringify({
					userId: "non-existent-user",
					codeChallenge: "x",
					codeChallengeMethod: "plain",
					state: "abc",
				}),
				expiresAt: new Date(Date.now() + 300_000),
			},
		});

		await expect(
			client
				.$fetch("/electron/token", {
					method: "POST",
					body: { token: identifier, code_verifier: "x", state: "abc" },
					throw: true,
					customFetchImpl: (url, init) => {
						const req = new Request(url.toString(), init);
						return auth.handler(req);
					},
				})
				.catch((err) => {
					throw err.cause;
				}),
		).rejects.toThrow(
			expect.objectContaining({
				code: auth.$ERROR_CODES.USER_NOT_FOUND.code,
			}),
		);
	});

	it("should throw when createSession returns null", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		const { user } = await auth.api.signUpEmail({
			body: {
				name: "Test User",
				email: "test-create-session-null@test.com",
				password: "password",
			},
		});

		const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
		await (await auth.$context).adapter.create({
			model: "verification",
			data: {
				identifier: `electron:${identifier}`,
				value: JSON.stringify({
					userId: user.id,
					codeChallenge: "x",
					codeChallengeMethod: "plain",
					state: "abc",
				}),
				expiresAt: new Date(Date.now() + 300_000),
			},
		});

		const ctx = await auth.$context;
		const original = ctx.internalAdapter.createSession;
		try {
			ctx.internalAdapter.createSession = vi.fn().mockResolvedValue(null);
			await expect(
				client.$fetch("/electron/token", {
					method: "POST",
					body: { token: identifier, code_verifier: "x", state: "abc" },
					throw: true,
					customFetchImpl: (url, init) => {
						const req = new Request(url.toString(), init);
						return auth.handler(req);
					},
				}),
			).rejects.toThrow(/FAILED_TO_CREATE_SESSION|INTERNAL_SERVER_ERROR/);
		} finally {
			ctx.internalAdapter.createSession = original;
		}
	});

	it("requestAuth should throw if called outside browser process", async ({
		setProcessType,
	}) => {
		setProcessType("renderer");
		await expect(client.requestAuth()).rejects.toThrowError(
			"`requestAuth` can only be called in the main process",
		);
	});

	it("authenticate should throw error if called outside browser process", async ({
		setProcessType,
	}) => {
		setProcessType("renderer");
		await expect(
			authenticate({
				$fetch: client.$fetch,
				options,
				token: "any",
				getWindow: () => null,
			}),
		).rejects.toThrow(BetterAuthError);
		await expect(
			authenticate({
				$fetch: client.$fetch,
				options,
				token: "any",
				getWindow: () => null,
			}),
		).rejects.toThrowError(
			"`authenticate` can only be called in the main process.",
		);
	});

	it("authenticate should exchange token and return user", async ({
		setProcessType,
	}) => {
		setProcessType("browser");
		client.setupMain({
			// @ts-expect-error
			getWindow: () => mockElectron.BrowserWindow,
		});

		const { user } = await auth.api.signInEmail({
			body: {
				email: "test@test.com",
				password: "password",
			},
		});

		(globalThis as any)[kCodeVerifier] = "test-challenge";
		(globalThis as any)[kState] = "abc";

		const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
		await (await auth.$context).adapter.create({
			model: "verification",
			data: {
				identifier: `electron:${identifier}`,
				value: JSON.stringify({
					userId: user.id,
					codeChallenge: "test-challenge",
					codeChallengeMethod: "plain",
					state: "abc",
				}),
				expiresAt: new Date(Date.now() + 300 * 1000),
			},
		});

		const result = await client.authenticate({ token: identifier });

		expect(result.data?.user?.id).toBe(user.id);
		expect(mockElectron.BrowserWindow.webContents.send).toHaveBeenCalledWith(
			"better-auth:authenticated",
			expect.objectContaining({ id: user.id }),
		);
	});

	it("IPC authenticate bridge should exchange token via invoke", async ({
		setProcessType,
	}) => {
		setProcessType("browser");
		mockElectron.ipcMain.handle.mockClear();

		client.setupMain({
			bridges: true,
			getWindow: () => mockElectron.BrowserWindow as any,
		});

		const authenticateHandler = mockElectron.ipcMain.handle.mock.calls.find(
			(call) => call[0] === "better-auth:authenticate",
		)?.[1] as (evt: unknown, data: { token: string }) => Promise<void>;

		expect(authenticateHandler).toBeDefined();

		const { user } = await auth.api.signInEmail({
			body: {
				email: "test@test.com",
				password: "password",
			},
		});

		(globalThis as any)[kCodeVerifier] = "test-challenge";
		(globalThis as any)[kState] = "abc";

		const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
		await (await auth.$context).adapter.create({
			model: "verification",
			data: {
				identifier: `electron:${identifier}`,
				value: JSON.stringify({
					userId: user.id,
					codeChallenge: "test-challenge",
					codeChallengeMethod: "plain",
					state: "abc",
				}),
				expiresAt: new Date(Date.now() + 300 * 1000),
			},
		});

		await authenticateHandler(null, { token: identifier });

		expect(mockElectron.BrowserWindow.webContents.send).toHaveBeenCalledWith(
			"better-auth:authenticated",
			expect.objectContaining({ id: user.id }),
		);
	});

	it("should delete verification entry after successful token exchange", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		const { user } = await auth.api.signUpEmail({
			body: {
				name: "Test User",
				email: "test-delete-verification@test.com",
				password: "password",
			},
		});

		const codeVerifier = base64Url.encode(randomBytes(32));
		const codeChallenge = base64Url.encode(
			await createHash("SHA-256").digest(codeVerifier),
		);

		const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
		await (await auth.$context).adapter.create({
			model: "verification",
			data: {
				identifier: `electron:${identifier}`,
				value: JSON.stringify({
					userId: user.id,
					codeChallenge,
					codeChallengeMethod: "s256",
					state: "abc",
				}),
				expiresAt: new Date(Date.now() + 300 * 1000),
			},
		});

		const ctx = await auth.$context;
		const spy = vi.spyOn(ctx.internalAdapter, "deleteVerificationValue");

		const { data } = await client.$fetch<any>("/electron/token", {
			method: "POST",
			body: {
				token: identifier,
				code_verifier: codeVerifier,
				state: "abc",
			},
		});

		expect(data?.token).toBeDefined();
		expect(data?.user.id).toBe(user.id);
		expect(spy).toHaveBeenCalled();
	});

	describe("transferUser", () => {
		const transferQuery =
			"client_id=electron&state=xyz&code_challenge=challenge";
		const post = (cookie: string, body?: object) =>
			auth.handler(
				new Request(
					`http://localhost:3000/api/auth/electron/transfer-user?${transferQuery}`,
					{
						method: "POST",
						headers: {
							cookie: cookie,
							"content-type": "application/json",
						},
						body: JSON.stringify(body ?? {}),
					},
				),
			);

		async function getSessionCookie() {
			let res = await auth.handler(
				new Request("http://localhost:3000/api/auth/sign-up/email", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						email: "transfer-test@test.com",
						password: "password",
						name: "Transfer Test",
					}),
				}),
			);
			if (res.status !== 200) {
				res = await auth.handler(
					new Request("http://localhost:3000/api/auth/sign-in/email", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							email: "transfer-test@test.com",
							password: "password",
						}),
					}),
				);
			}
			const setCookie = res.headers.get("set-cookie") ?? "";
			const parsed = parseSetCookieHeader(setCookie);
			const parts: string[] = [];
			parsed.forEach((value, name) => {
				parts.push(`${name}=${value.value}`);
			});
			return parts.join("; ");
		}

		it("should return url and redirect from body when callbackURL provided", async () => {
			const cookie = await getSessionCookie();
			const res = await post(cookie, {
				callbackURL: "https://app.example.com/callback",
			});
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toMatchObject({
				url: "https://app.example.com/callback",
				redirect: true,
				electron_authorization_code: expect.any(String),
			});
		});

		it("should return null url and false redirect when callbackURL omitted", async () => {
			const cookie = await getSessionCookie();
			const res = await post(cookie);
			expect(res.status).toBe(200);
			const data = await res.json();
			expect(data).toMatchObject({
				url: null,
				redirect: false,
				electron_authorization_code: expect.any(String),
			});
		});

		it("should throw INVALID_CLIENT_ID when client_id does not match", async () => {
			const cookie = await getSessionCookie();
			const res = await auth.handler(
				new Request(
					"http://localhost:3000/api/auth/electron/transfer-user?client_id=wrong&state=xyz&code_challenge=challenge",
					{
						method: "POST",
						headers: {
							cookie,
							"content-type": "application/json",
						},
						body: JSON.stringify({}),
					},
				),
			);
			expect(res.status).toBe(400);
			const data = await res.json();
			expect(data.code).toBe(ELECTRON_ERROR_CODES.INVALID_CLIENT_ID.code);
		});

		it("should set redirect cookie on success", async () => {
			const cookie = await getSessionCookie();
			const res = await post(cookie);
			expect(res.status).toBe(200);
			const setCookie = res.headers.get("set-cookie") ?? "";
			const cookies = parseSetCookieHeader(setCookie);
			expect(cookies.has("better-auth.electron")).toBe(true);
		});
	});

	it("should register protocol", async ({ setProcessType }) => {
		setProcessType("browser");

		client.setupMain({
			scheme: true,
		});

		expect(
			mockElectron.protocol.registerSchemesAsPrivileged,
		).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					scheme: options.protocol.scheme,
				}),
			]),
		);
		expect(mockElectron.app.setAsDefaultProtocolClient).toHaveBeenCalledWith(
			options.protocol.scheme,
		);
	});

	it("should add client origin to CSP if missing", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		client.setupMain({
			csp: true,
		});

		// wait a tick for whenReady then-callback to run
		await Promise.resolve();

		const onHeadersReceived =
			mockElectron.session.defaultSession.webRequest.onHeadersReceived;
		expect(onHeadersReceived).toHaveBeenCalled();

		const handler = onHeadersReceived.mock.calls[0][0];

		const details = {
			responseHeaders: {},
		};

		let callbackResult: any = null;
		const callback = (res: any) => {
			callbackResult = res;
		};

		await handler(details, callback);

		expect(callbackResult).not.toBeNull();
		const respHeaders = callbackResult.responseHeaders;
		expect(respHeaders).toBeDefined();
		const csp = String(respHeaders["content-security-policy"]);
		expect(csp).toContain("connect-src");
		expect(csp).toContain("http://localhost:3000");
	});

	describe("pkce", () => {
		it("should require pkce", async ({ setProcessType }) => {
			setProcessType("browser");

			const { user } = await auth.api.signInEmail({
				body: {
					email: "test@test.com",
					password: "password",
				},
			});

			const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
			await (await auth.$context).adapter.create({
				model: "verification",
				data: {
					identifier: `electron:${identifier}`,
					value: JSON.stringify({
						userId: user.id,
					}),
					expiresAt: new Date(Date.now() + 300 * 1000),
				},
			});

			await expect(
				authenticate({
					$fetch: client.$fetch,
					options,
					token: identifier,
					// @ts-expect-error
					getWindow: () => mockElectron.BrowserWindow,
				}),
			).rejects.toThrowError("Code verifier not found.");
		});

		it("should require a state parameter", async ({ setProcessType }) => {
			setProcessType("browser");

			const { user } = await auth.api.signInEmail({
				body: {
					email: "test@test.com",
					password: "password",
				},
			});

			(globalThis as any)[kCodeVerifier] = "test-challenge";

			const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
			await (await auth.$context).adapter.create({
				model: "verification",
				data: {
					identifier: `electron:${identifier}`,
					value: JSON.stringify({
						userId: user.id,
						codeChallenge: "test-challenge",
						codeChallengeMethod: "plain",
					}),
					expiresAt: new Date(Date.now() + 300 * 1000),
				},
			});

			await expect(
				authenticate({
					$fetch: client.$fetch,
					options,
					token: identifier,
					// @ts-expect-error
					getWindow: () => mockElectron.BrowserWindow,
				}),
			).rejects.toThrowError("State not found.");
		});

		it("should verify that state parameter matches", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const { user } = await auth.api.signInEmail({
				body: {
					email: "test@test.com",
					password: "password",
				},
			});

			(globalThis as any)[kCodeVerifier] = "test-challenge";
			(globalThis as any)[kState] = "abc";

			const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
			await (await auth.$context).adapter.create({
				model: "verification",
				data: {
					identifier: `electron:${identifier}`,
					value: JSON.stringify({
						userId: user.id,
						codeChallenge: "test-challenge",
						codeChallengeMethod: "plain",
						state: "def",
					}),
					expiresAt: new Date(Date.now() + 300 * 1000),
				},
			});

			await expect(
				authenticate({
					$fetch: client.$fetch,
					options,
					token: identifier,
					// @ts-expect-error
					getWindow: () => mockElectron.BrowserWindow,
					fetchOptions: { throw: true },
				}).catch((err: any) => {
					expect(err.error.message).toBe("state mismatch");
					throw err;
				}),
			).rejects.toThrowError("BAD_REQUEST");
		});

		it("should return error when token record is missing code challenge", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const { user } = await auth.api.signInEmail({
				body: { email: "test@test.com", password: "password" },
			});

			const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
			await (await auth.$context).adapter.create({
				model: "verification",
				data: {
					identifier: `electron:${identifier}`,
					value: JSON.stringify({
						userId: user.id,
						state: "abc",
					}),
					expiresAt: new Date(Date.now() + 300_000),
				},
			});

			await expect(
				client.$fetch("/electron/token", {
					method: "POST",
					body: { token: identifier, code_verifier: "anything", state: "abc" },
					throw: true,
					customFetchImpl: (url, init) => {
						const req = new Request(url.toString(), init);
						return auth.handler(req);
					},
				}),
			).rejects.toThrowError("BAD_REQUEST");
		});

		it("should reject when code_verifier does not match", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const { user } = await auth.api.signInEmail({
				body: { email: "test@test.com", password: "password" },
			});

			const actualVerifier = base64Url.encode(randomBytes(32));
			const actualChallenge = base64Url.encode(
				await createHash("SHA-256").digest(actualVerifier),
			);

			const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
			await (await auth.$context).adapter.create({
				model: "verification",
				data: {
					identifier: `electron:${identifier}`,
					value: JSON.stringify({
						userId: user.id,
						codeChallenge: actualChallenge,
						codeChallengeMethod: "s256",
						state: "abc",
					}),
					expiresAt: new Date(Date.now() + 300_000),
				},
			});

			const invalidVerifier = base64Url.encode(randomBytes(32));
			await expect(
				client.$fetch("/electron/token", {
					method: "POST",
					body: {
						token: identifier,
						code_verifier: invalidVerifier,
						state: "abc",
					},
					throw: true,
					customFetchImpl: (url, init) => {
						const req = new Request(url.toString(), init);
						return auth.handler(req);
					},
				}),
			).rejects.toThrowError("BAD_REQUEST");
		});
	});

	describe("cookies", () => {
		it("should send cookie and get session", async ({ setProcessType }) => {
			setProcessType("browser");

			const { data } = await client.getSession();
			expect(data).toMatchObject({
				session: expect.any(Object),
				user: expect.any(Object),
			});

			expect(mockElectron.safeStorage.decryptString).toHaveBeenCalled();
		});

		it("should get cookies", async () => {
			const c = client.getCookie();
			expect(c).includes("better-auth.session_token");
		});

		it("should not trigger infinite refetch with non-./src/cookies", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const { hasBetterAuthCookies } = await import("../src/cookies");

			const betterAuthOnlyHeader = "better-auth.session_token=abc; Path=/";
			expect(hasBetterAuthCookies(betterAuthOnlyHeader, "better-auth")).toBe(
				true,
			);

			const sessionDataHeader = "better-auth.session_data=xyz; Path=/";
			expect(hasBetterAuthCookies(sessionDataHeader, "better-auth")).toBe(true);

			const secureBetterAuthHeader =
				"__Secure-better-auth.session_token=abc; Path=/";
			expect(hasBetterAuthCookies(secureBetterAuthHeader, "better-auth")).toBe(
				true,
			);

			const secureSessionDataHeader =
				"__Secure-better-auth.session_data=xyz; Path=/";
			expect(hasBetterAuthCookies(secureSessionDataHeader, "better-auth")).toBe(
				true,
			);

			const nonBetterAuthHeader = "__cf_bm=abc123; Path=/; HttpOnly; Secure";
			expect(hasBetterAuthCookies(nonBetterAuthHeader, "better-auth")).toBe(
				false,
			);

			const mixedHeader =
				"__cf_bm=abc123; Path=/; HttpOnly; Secure, better-auth.session_token=xyz; Path=/";
			expect(hasBetterAuthCookies(mixedHeader, "better-auth")).toBe(true);

			const customPrefixHeader = "my-app.session_token=abc; Path=/";
			expect(hasBetterAuthCookies(customPrefixHeader, "my-app")).toBe(true);
			expect(hasBetterAuthCookies(customPrefixHeader, "better-auth")).toBe(
				false,
			);

			const customPrefixDataHeader = "my-app.session_data=abc; Path=/";
			expect(hasBetterAuthCookies(customPrefixDataHeader, "my-app")).toBe(true);

			const emptyPrefixHeader = "session_token=abc; Path=/";
			expect(hasBetterAuthCookies(emptyPrefixHeader, "")).toBe(true);

			const customFullNameHeader = "my_custom_session_token=abc; Path=/";
			expect(hasBetterAuthCookies(customFullNameHeader, "")).toBe(true);

			const customFullDataHeader = "my_custom_session_data=xyz; Path=/";
			expect(hasBetterAuthCookies(customFullDataHeader, "")).toBe(true);

			const multipleNonBetterAuthHeader =
				"__cf_bm=abc123; Path=/, _ga=GA1.2.123456789.1234567890; Path=/";
			expect(
				hasBetterAuthCookies(multipleNonBetterAuthHeader, "better-auth"),
			).toBe(false);

			// Non-session better-auth cookies should still be detected (e.g., passkey cookies)
			const nonSessionBetterAuthHeader = "better-auth.other_cookie=abc; Path=/";
			expect(
				hasBetterAuthCookies(nonSessionBetterAuthHeader, "better-auth"),
			).toBe(true);

			// Passkey cookie should be detected
			const passkeyHeader = "better-auth-passkey=xyz; Path=/";
			expect(hasBetterAuthCookies(passkeyHeader, "better-auth")).toBe(true);

			// Secure passkey cookie should be detected
			const securePasskeyHeader = "__Secure-better-auth-passkey=xyz; Path=/";
			expect(hasBetterAuthCookies(securePasskeyHeader, "better-auth")).toBe(
				true,
			);

			// Custom passkey cookie name should be detected
			const customPasskeyHeader = "better-auth-custom-challenge=xyz; Path=/";
			expect(hasBetterAuthCookies(customPasskeyHeader, "better-auth")).toBe(
				true,
			);
		});

		it("should allow independent cookiePrefix configuration", async () => {
			const { hasBetterAuthCookies } = await import("../src/cookies");

			const customCookieHeader = "my-app.session_token=abc; Path=/";

			expect(hasBetterAuthCookies(customCookieHeader, "my-app")).toBe(true);

			expect(hasBetterAuthCookies(customCookieHeader, "better-auth")).toBe(
				false,
			);
		});

		it("should support array of cookie prefixes", async () => {
			const { hasBetterAuthCookies } = await import("../src/cookies");

			// Test with multiple prefixes - should match any of them
			const betterAuthHeader = "better-auth.session_token=abc; Path=/";
			expect(
				hasBetterAuthCookies(betterAuthHeader, ["better-auth", "my-app"]),
			).toBe(true);

			const myAppHeader = "my-app.session_data=xyz; Path=/";
			expect(hasBetterAuthCookies(myAppHeader, ["better-auth", "my-app"])).toBe(
				true,
			);

			const otherAppHeader = "other-app.session_token=def; Path=/";
			expect(
				hasBetterAuthCookies(otherAppHeader, ["better-auth", "my-app"]),
			).toBe(false);

			// Test with passkey cookies
			const passkeyHeader1 = "better-auth-passkey=xyz; Path=/";
			expect(
				hasBetterAuthCookies(passkeyHeader1, ["better-auth", "my-app"]),
			).toBe(true);

			const passkeyHeader2 = "my-app-passkey=xyz; Path=/";
			expect(
				hasBetterAuthCookies(passkeyHeader2, ["better-auth", "my-app"]),
			).toBe(true);

			// Test with __Secure- prefix
			const secureHeader = "__Secure-my-app.session_token=abc; Path=/";
			expect(
				hasBetterAuthCookies(secureHeader, ["better-auth", "my-app"]),
			).toBe(true);

			// Test with empty array (should check for suffixes)
			const sessionTokenHeader = "session_token=abc; Path=/";
			expect(hasBetterAuthCookies(sessionTokenHeader, [])).toBe(false);
			expect(hasBetterAuthCookies(sessionTokenHeader, [""])).toBe(true);
		});
	});

	it("should preserve unchanged client store session properties on signout", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		await client.signUp.email({
			name: "Test User",
			email: "test-2@test.com",
			password: "password",
		});

		const before = client.$store.atoms.session!.get();
		await client.signOut();
		const after = client.$store.atoms.session!.get();

		expect(after).toMatchObject({
			...before,
			data: null,
			error: null,
			isPending: false,
		});
	});

	it("should modify origin header to electron origin if origin is not set", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		let originalOrigin: string | null = null;
		let origin: string | null = null;
		const { auth, client } = testUtils({
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					origin = ctx.request?.headers.get("origin") ?? null;
				}),
			},
			plugins: [
				{
					id: "test",
					async onRequest(request, ctx) {
						const origin = request.headers.get("origin");
						originalOrigin = origin;
					},
				},
				electron(),
			],
		});
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		await client.signUp.email({
			name: "Test User",
			email: "test@test.com",
			password: "password",
			callbackURL: "http://localhost:3000/callback",
		});
		expect(origin).toBe("myapp:/");
		expect(originalOrigin).toBeNull();
	});

	it("should not modify origin header if origin is set", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		const originalOrigin = "test.com";
		let origin: string | null = null;
		const { auth, client } = testUtils({
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					origin = ctx.request?.headers.get("origin") ?? null;
				}),
			},
			plugins: [electron()],
		});
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		await client.signUp.email(
			{
				name: "Test User",
				email: "test@test.com",
				password: "password",
				callbackURL: "http://localhost:3000/callback",
			},
			{
				headers: {
					origin: originalOrigin,
				},
			},
		);
		expect(origin).toBe(originalOrigin);
	});

	it("should not modify origin header if disableOriginOverride is set", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		let origin: string | null = null;
		const { auth, client } = testUtils({
			plugins: [electron({ disableOriginOverride: true })],
			hooks: {
				before: createAuthMiddleware(async (ctx) => {
					origin = ctx.request?.headers.get("origin") ?? null;
				}),
			},
		});
		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();
		await client.signUp.email({
			name: "Test User",
			email: "test@test.com",
			password: "password",
			callbackURL: "http://localhost:3000/callback",
		});
		expect(origin).toBe(null);
	});

	it("should register ipc handlers", async ({ setProcessType }) => {
		setProcessType("browser");

		client.setupMain({
			bridges: true,
		});

		const prefix = `${(options as any).channelPrefix ?? "better-auth"}:`;

		expect(mockElectron.ipcMain.handle).toHaveBeenCalledWith(
			`${prefix}getUser`,
			expect.any(Function),
		);
		expect(mockElectron.ipcMain.handle).toHaveBeenCalledWith(
			`${prefix}requestAuth`,
			expect.any(Function),
		);
		expect(mockElectron.ipcMain.handle).toHaveBeenCalledWith(
			`${prefix}signOut`,
			expect.any(Function),
		);
	});

	it("should surface safeStorage errors during encryption", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		// Create a user and verification entry that would normally trigger
		// cookie/session encryption during the token exchange.
		const { user } = await auth.api.signUpEmail({
			body: {
				name: "Sage Storage Test",
				email: "safe-storage@test.com",
				password: "password",
			},
		});

		const codeVerifier = base64Url.encode(randomBytes(32));
		const codeChallenge = base64Url.encode(
			await createHash("SHA-256").digest(codeVerifier),
		);

		const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
		await (await auth.$context).adapter.create({
			model: "verification",
			data: {
				identifier: `electron:${identifier}`,
				value: JSON.stringify({
					userId: user.id,
					codeChallenge,
					codeChallengeMethod: "s256",
					state: "abc",
				}),
				expiresAt: new Date(Date.now() + 300 * 1000),
			},
		});

		// Make encryptString throw
		mockElectron.safeStorage.encryptString.mockImplementationOnce(() => {
			throw new Error("encryption failed");
		});

		// Expect the token exchange to surface the error (encryption failure)
		await expect(
			client.$fetch("/electron/token", {
				method: "POST",
				body: {
					token: identifier,
					code_verifier: codeVerifier,
					state: "abc",
				},
			}),
		).rejects.toThrow("encryption failed");
	});

	it("should quit when single instance lock not acquired", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		mockElectron.app.requestSingleInstanceLock.mockReturnValueOnce(false);

		client.setupMain({
			scheme: true,
		});

		expect(mockElectron.app.quit).toHaveBeenCalled();
	});

	it("should log error when setAsDefaultProtocolClient fails", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		const original = mockElectron.app.setAsDefaultProtocolClient;
		mockElectron.app.setAsDefaultProtocolClient.mockReturnValueOnce(false);

		const spy = vi.spyOn(console, "error").mockImplementation(() => {});

		client.setupMain({
			scheme: true,
		});

		expect(mockElectron.app.setAsDefaultProtocolClient).toHaveBeenCalled();
		expect(spy).toHaveBeenCalled();

		mockElectron.app.setAsDefaultProtocolClient = original;
	});

	it("should not duplicate CSP origin entry when already present", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		client.setupMain({
			csp: true,
		});

		// wait a tick for whenReady then-callback to run
		await Promise.resolve();

		const onHeadersReceived =
			mockElectron.session.defaultSession.webRequest.onHeadersReceived;
		expect(onHeadersReceived).toHaveBeenCalled();

		const handler = onHeadersReceived.mock.calls[0][0];

		const origin = "http://localhost:3000";
		const details = {
			responseHeaders: {
				"content-security-policy": [`connect-src 'self' ${origin}`],
			},
		};

		let callbackResult: any = null;
		const callback = (res: any) => {
			callbackResult = res;
		};

		// First invocation - policy already contains origin once
		await handler(details, callback);
		const firstPolicy = String(
			callbackResult.responseHeaders["content-security-policy"],
		);
		const firstCount = (
			firstPolicy.match(
				new RegExp(origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
			) || []
		).length;

		// Invoke handler again with the policy that already contains the origin
		callbackResult = null;
		await handler(details, callback);
		const secondPolicy = String(
			callbackResult.responseHeaders["content-security-policy"],
		);
		const secondCount = (
			secondPolicy.match(
				new RegExp(origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
			) || []
		).length;

		// Origin should not be duplicated
		expect(firstCount).toBeGreaterThanOrEqual(1);
		expect(secondCount).toBe(firstCount);
	});

	it("should reject requestAuth when shell.openExternal fails", async ({
		setProcessType,
	}) => {
		setProcessType("browser");

		mockElectron.shell.openExternal.mockRejectedValueOnce(
			new Error("failed to open"),
		);

		await expect(client.requestAuth()).rejects.toThrow();
	});

	describe("sanitizeUser", () => {
		it("should strip fields from user sent in authenticated event", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const { user } = await auth.api.signUpEmail({
				body: {
					email: "sanitize-strip@test.com",
					password: "password",
					name: "Sanitize Strip",
				},
			});

			(globalThis as any)[kCodeVerifier] = "test-challenge";
			(globalThis as any)[kState] = "abc";

			const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
			await (await auth.$context).adapter.create({
				model: "verification",
				data: {
					identifier: `electron:${identifier}`,
					value: JSON.stringify({
						userId: user.id,
						codeChallenge: "test-challenge",
						codeChallengeMethod: "plain",
						state: "abc",
					}),
					expiresAt: new Date(Date.now() + 300 * 1000),
				},
			});

			mockElectron.BrowserWindow.webContents.send.mockClear();

			await authenticate({
				$fetch: client.$fetch,
				options: {
					...options,
					sanitizeUser: (u) => {
						const { email, ...rest } = u;
						return rest as typeof u;
					},
				},
				token: identifier,
				// @ts-expect-error
				getWindow: () => mockElectron.BrowserWindow,
			});

			expect(mockElectron.BrowserWindow.webContents.send).toHaveBeenCalledWith(
				"better-auth:authenticated",
				expect.not.objectContaining({ email: expect.any(String) }),
			);
			expect(mockElectron.BrowserWindow.webContents.send).toHaveBeenCalledWith(
				"better-auth:authenticated",
				expect.objectContaining({ id: user.id }),
			);
		});

		it("should not emit authenticated event when sanitizeUser throws", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const { user } = await auth.api.signUpEmail({
				body: {
					email: "sanitize-throw@test.com",
					password: "password",
					name: "Sanitize Throw",
				},
			});

			(globalThis as any)[kCodeVerifier] = "test-challenge";
			(globalThis as any)[kState] = "abc";

			const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
			await (await auth.$context).adapter.create({
				model: "verification",
				data: {
					identifier: `electron:${identifier}`,
					value: JSON.stringify({
						userId: user.id,
						codeChallenge: "test-challenge",
						codeChallengeMethod: "plain",
						state: "abc",
					}),
					expiresAt: new Date(Date.now() + 300 * 1000),
				},
			});

			mockElectron.BrowserWindow.webContents.send.mockClear();
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			await authenticate({
				$fetch: client.$fetch,
				options: {
					...options,
					sanitizeUser: () => {
						throw new Error("sanitize failed");
					},
				},
				token: identifier,
				// @ts-expect-error
				getWindow: () => mockElectron.BrowserWindow,
			});

			expect(consoleSpy).toHaveBeenCalledWith(
				"Error while sanitizing user",
				expect.any(Error),
			);
			expect(
				mockElectron.BrowserWindow.webContents.send,
			).not.toHaveBeenCalledWith(
				"better-auth:authenticated",
				expect.anything(),
			);

			consoleSpy.mockRestore();
		});

		it("should apply sanitizeUser to user-updated event", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const sanitizeUser = vi.fn((u: any) => {
				const { email, ...rest } = u;
				return rest;
			});

			const { client: sanitizedClient } = (() => {
				const sanitizedOptions = { ...options, sanitizeUser };
				const sanitizedClient = createAuthClient({
					baseURL: "http://localhost:3000",
					fetchOptions: {
						customFetchImpl: (url, init) => {
							const req = new Request(url.toString(), init);
							return auth.handler(req);
						},
					},
					plugins: [electronClient(sanitizedOptions)],
				});
				return { client: sanitizedClient };
			})();

			sanitizedClient.setupMain({
				bridges: true,
				// @ts-expect-error
				getWindow: () => mockElectron.BrowserWindow,
			});

			mockElectron.BrowserWindow.send.mockClear();

			sanitizedClient.$store.atoms.session!.set({
				data: {
					user: {
						id: "user-123",
						email: "secret@test.com",
						name: "Test",
					},
				},
			});

			// Flush
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();

			expect(sanitizeUser).toHaveBeenCalled();
			expect(mockElectron.BrowserWindow.send).toHaveBeenCalledWith(
				"better-auth:user-updated",
				expect.objectContaining({ id: "user-123" }),
			);
			expect(mockElectron.BrowserWindow.send).toHaveBeenCalledWith(
				"better-auth:user-updated",
				expect.not.objectContaining({ email: expect.any(String) }),
			);
		});

		it("should send null user-updated event when sanitizeUser throws", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const { client: sanitizedClient } = (() => {
				const sanitizedOptions = {
					...options,
					sanitizeUser: () => {
						throw new Error("sanitize boom");
					},
				};
				const sanitizedClient = createAuthClient({
					baseURL: "http://localhost:3000",
					fetchOptions: {
						customFetchImpl: (url, init) => {
							const req = new Request(url.toString(), init);
							return auth.handler(req);
						},
					},
					plugins: [electronClient(sanitizedOptions)],
				});
				return { client: sanitizedClient };
			})();

			sanitizedClient.setupMain({
				bridges: true,
				// @ts-expect-error
				getWindow: () => mockElectron.BrowserWindow,
			});

			mockElectron.BrowserWindow.send.mockClear();
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});

			sanitizedClient.$store.atoms.session!.set({
				data: {
					user: {
						id: "user-456",
						email: "test@test.com",
						name: "Test",
					},
				},
			});

			// Flush
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();

			expect(consoleSpy).toHaveBeenCalledWith(
				"Error while sanitizing user",
				expect.any(Error),
			);
			expect(mockElectron.BrowserWindow.send).toHaveBeenCalledWith(
				"better-auth:user-updated",
				null,
			);

			consoleSpy.mockRestore();
		});

		it("should apply async sanitizeUser", async ({ setProcessType }) => {
			setProcessType("browser");

			const { user } = await auth.api.signUpEmail({
				body: {
					email: "sanitize-async@test.com",
					password: "password",
					name: "Sanitize Async",
				},
			});

			(globalThis as any)[kCodeVerifier] = "test-challenge";
			(globalThis as any)[kState] = "abc";

			const identifier = generateRandomString(16, "A-Z", "a-z", "0-9");
			await (await auth.$context).adapter.create({
				model: "verification",
				data: {
					identifier: `electron:${identifier}`,
					value: JSON.stringify({
						userId: user.id,
						codeChallenge: "test-challenge",
						codeChallengeMethod: "plain",
						state: "abc",
					}),
					expiresAt: new Date(Date.now() + 300 * 1000),
				},
			});

			mockElectron.BrowserWindow.webContents.send.mockClear();

			await authenticate({
				$fetch: client.$fetch,
				options: {
					...options,
					sanitizeUser: async (u) => {
						await Promise.resolve();
						return { ...u, name: "Sanitized" };
					},
				},
				token: identifier,
				// @ts-expect-error
				getWindow: () => mockElectron.BrowserWindow,
			});

			expect(mockElectron.BrowserWindow.webContents.send).toHaveBeenCalledWith(
				"better-auth:authenticated",
				expect.objectContaining({ id: user.id, name: "Sanitized" }),
			);
		});
	});

	describe("user normalization", () => {
		const MINIMAL_PNG_BASE64 =
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

		const makeImageBytes = (magic: number[]) =>
			new Uint8Array([...magic, ...new Array(20).fill(0)]);

		async function streamToBytes(
			stream: ReadableStream<Uint8Array>,
		): Promise<Uint8Array> {
			const reader = stream.getReader();
			const chunks: Uint8Array[] = [];
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				chunks.push(value);
			}
			if (chunks.length === 1) return chunks[0]!;
			let total = 0;
			for (const c of chunks) total += c.byteLength;
			const result = new Uint8Array(total);
			let offset = 0;
			for (const c of chunks) {
				result.set(c, offset);
				offset += c.byteLength;
			}
			return result;
		}

		const customFetchImpl = vi.fn(async (input: string | URL | Request) => {
			const url = input.toString();
			if (url.endsWith(".jpg")) {
				return new Response(makeImageBytes([0xff, 0xd8, 0xff, 0xe0]).buffer, {
					headers: new Headers({ "content-type": "image/jpeg" }),
				});
			} else if (url.endsWith(".png") && !url.endsWith("avatar-fail.png")) {
				return new Response(
					makeImageBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
						.buffer,
					{
						headers: new Headers({ "content-type": "image/png" }),
					},
				);
			} else if (url.endsWith(".gif")) {
				return new Response(
					makeImageBytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]).buffer,
					{
						headers: new Headers({ "content-type": "image/gif" }),
					},
				);
			} else if (url.endsWith(".webp")) {
				return new Response(
					makeImageBytes([
						0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42,
						0x50,
					]).buffer,
					{
						headers: new Headers({ "content-type": "image/webp" }),
					},
				);
			} else if (url.endsWith(".bmp")) {
				return new Response(makeImageBytes([0x42, 0x4d]).buffer, {
					headers: new Headers({ "content-type": "image/bmp" }),
				});
			} else if (url.endsWith(".ico")) {
				return new Response(makeImageBytes([0x00, 0x00, 0x01, 0x00]).buffer, {
					headers: new Headers({ "content-type": "image/x-icon" }),
				});
			}
			return new Response(null, { status: 404 });
		});

		beforeEach(() => {
			vi.clearAllMocks();
			mockElectron.net.fetch.mockImplementation(customFetchImpl as any);
		});

		it("normalizeUserOutput should replace image with protocol URL", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const user = normalizeUserOutput({
				id: "abc123",
				name: "Test",
				email: "test@test.com",
				image: "https://example.com/avatar.png",
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			expect(user.image).toBe("user-image://abc123");
		});

		it("normalizeUserOutput should leave null image as null", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const user = normalizeUserOutput({
				id: "abc123",
				name: "Test",
				email: "test@test.com",
				image: null,
				emailVerified: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			});

			expect(user.image).toBeNull();
		});

		it("should decode valid data URL", async ({ setProcessType }) => {
			setProcessType("browser");

			const dataUrl = `data:image/png;base64,${MINIMAL_PNG_BASE64}`;
			const result = await fetchUserImage(undefined, dataUrl);

			expect(result).not.toBeNull();
			expect(result!.mimeType).toBe("image/png");
			const bytes = await streamToBytes(result!.stream);
			expect(bytes.length).toBeGreaterThan(0);
		});

		it("should reject SVG data URL", async ({ setProcessType }) => {
			setProcessType("browser");

			const result = await fetchUserImage(
				undefined,
				"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjwvc3ZnPg==",
			);

			expect(result).toBeNull();
		});

		it("should reject invalid base64 data URL", async ({ setProcessType }) => {
			setProcessType("browser");

			const result = await fetchUserImage(
				undefined,
				"data:image/png;base64,!!!invalid!!!",
			);

			expect(result).toBeNull();
		});

		it("should fetch http URL and return stream", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const result = await fetchUserImage(
				undefined,
				"https://example.com/avatar.png",
			);

			expect(mockElectron.net.fetch).toHaveBeenCalledWith(
				"https://example.com/avatar.png",
				expect.objectContaining({
					method: "GET",
					headers: { accept: "image/*" },
				}),
			);
			expect(result).not.toBeNull();
			expect(result!.mimeType).toBe("image/png");
		});

		it("should return null when fetch fails", async ({ setProcessType }) => {
			setProcessType("browser");

			const result = await fetchUserImage(
				undefined,
				"https://example.com/avatar-fail.png",
			);

			expect(result).toBeNull();
		});

		it("should return null when fetched content is not a valid image", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const result = await fetchUserImage(
				undefined,
				"https://example.com/page.html",
			);

			expect(result).toBeNull();
		});

		it("should fetch JPEG and return correct mimeType", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const result = await fetchUserImage(
				undefined,
				"https://example.com/avatar.jpg",
			);

			expect(result).not.toBeNull();
			expect(result!.mimeType).toBe("image/jpeg");
		});

		it("should fetch GIF and return correct mimeType", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const result = await fetchUserImage(
				undefined,
				"https://example.com/avatar.gif",
			);

			expect(result).not.toBeNull();
			expect(result!.mimeType).toBe("image/gif");
		});

		it("should fetch WebP and return correct mimeType", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const result = await fetchUserImage(
				undefined,
				"https://example.com/avatar.webp",
			);

			expect(result).not.toBeNull();
			expect(result!.mimeType).toBe("image/webp");
		});

		it("should fetch BMP and return correct mimeType", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const result = await fetchUserImage(
				undefined,
				"https://example.com/avatar.bmp",
			);

			expect(result).not.toBeNull();
			expect(result!.mimeType).toBe("image/bmp");
		});

		it("should fetch ICO and return correct mimeType", async ({
			setProcessType,
		}) => {
			setProcessType("browser");

			const result = await fetchUserImage(
				undefined,
				"https://example.com/favicon.ico",
			);

			expect(result).not.toBeNull();
			expect(result!.mimeType).toBe("image/x-icon");
		});

		it("should decode valid GIF87a data URL", async ({ setProcessType }) => {
			setProcessType("browser");

			const gif87aBytes = makeImageBytes([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
			const dataUrl = `data:image/gif;base64,${Buffer.from(gif87aBytes).toString("base64")}`;

			const result = await fetchUserImage(undefined, dataUrl);

			expect(result).not.toBeNull();
			expect(result!.mimeType).toBe("image/gif");
		});

		describe("isLocalOrigin (SSRF mitigation)", () => {
			it.each([
				["http://localhost/avatar.png"],
				["http://127.0.0.1/avatar.png"],
				["http://10.0.0.1/avatar.png"],
				["http://172.16.0.1/avatar.png"],
				["http://192.168.1.1/avatar.png"],
				["http://169.254.169.254/avatar.png"],
				["http://[::1]/avatar.png"],
				["http://[fe80::1]/avatar.png"],
			])("should reject local origin %s", async (imageUrl) => {
				const result = await fetchUserImage(undefined, imageUrl);

				expect(result).toBeNull();
				expect(mockElectron.net.fetch).not.toHaveBeenCalled();
			});

			it.each([
				["https://example.com/avatar/abc.png"],
				["https://gravatar.com/avatar/abc.png"],
				["https://8.8.8.8/avatar.png"],
			])("should allow public origin %s", async (imageUrl) => {
				const result = await fetchUserImage(undefined, imageUrl);

				expect(mockElectron.net.fetch).toHaveBeenCalled();
				expect(result).not.toBeNull();
			});
		});
	});
});
