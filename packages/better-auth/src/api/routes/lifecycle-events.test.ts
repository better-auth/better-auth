import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it, vi } from "vitest";
import { setSessionCookie } from "../../cookies";
import { symmetricDecrypt } from "../../crypto";
import { deviceAuthorization } from "../../plugins/device-authorization";
import { magicLink } from "../../plugins/magic-link";
import { magicLinkClient } from "../../plugins/magic-link/client";
import { twoFactor, twoFactorClient } from "../../plugins/two-factor";
import { username } from "../../plugins/username";
import { usernameClient } from "../../plugins/username/client";
import { getTestInstance } from "../../test-utils/test-instance";
import { dispatchAuthEndpoint } from "../dispatch";

/** @see https://github.com/better-auth/better-auth/pull/8915 */
describe("authentication lifecycle completion", () => {
	it("emits TOTP activation only after enrollment is verified", async () => {
		const enabled = vi.fn();
		const { auth, db, client, signInWithTestUser, testUser, sessionSetter } =
			await getTestInstance(
				{
					plugins: [twoFactor({ onTotpEnabled: enabled })],
				},
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);
		const { headers } = await signInWithTestUser();
		const enrollment = await client.twoFactor.enable(
			{ password: testUser.password, method: "totp" },
			{ headers },
		);
		if (enrollment.data?.method !== "totp")
			throw new Error("Expected TOTP enrollment");
		expect(enabled).not.toHaveBeenCalled();
		const row = await db.findOne<{ secret: string }>({
			model: "twoFactor",
			where: [
				{
					field: "userId",
					value: (await auth.api.getSession({ headers }))!.user.id,
				},
			],
		});
		const secret = await symmetricDecrypt({
			key: (await auth.$context).secretConfig,
			data: row!.secret,
		});
		const result = await client.twoFactor.verifyTotp(
			{ code: await createOTP(secret).totp() },
			{ headers, onSuccess: sessionSetter(headers) },
		);
		expect(result.error).toBeNull();
		expect(enabled).toHaveBeenCalledOnce();
		expect(enabled.mock.calls[0]?.[0]).toMatchObject({
			user: { twoFactorEnabled: true },
		});
		await client.twoFactor.verifyTotp(
			{ code: await createOTP(secret).totp() },
			{ headers },
		);
		expect(enabled).toHaveBeenCalledOnce();
	});

	it("announces one activation when two valid enrollment requests race", async () => {
		const enabled = vi.fn();
		const { auth, db, client, signInWithTestUser, testUser } =
			await getTestInstance(
				{
					plugins: [twoFactor({ onTotpEnabled: enabled })],
				},
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);
		const { headers, user } = await signInWithTestUser();
		await client.twoFactor.enable(
			{ password: testUser.password, method: "totp" },
			{ headers },
		);
		const row = await db.findOne<{ secret: string }>({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
		});
		const context = await auth.$context;
		const secret = await symmetricDecrypt({
			key: context.secretConfig,
			data: row!.secret,
		});
		const code = await createOTP(secret).totp();
		const findOne = context.adapter.findOne.bind(context.adapter);
		let reads = 0;
		let release!: () => void;
		const bothRead = new Promise<void>((resolve) => {
			release = resolve;
		});
		const spy = vi
			.spyOn(context.adapter, "findOne")
			.mockImplementation(async (input) => {
				const result = await findOne(input);
				if (input.model === "twoFactor" && ++reads <= 2) {
					if (reads === 2) release();
					await bothRead;
				}
				return result;
			});
		try {
			const responses = await Promise.all(
				[1, 2].map(() => client.twoFactor.verifyTotp({ code }, { headers })),
			);
			expect(responses.filter(({ error }) => error === null)).toHaveLength(1);
			expect(responses.find(({ error }) => error !== null)?.error?.code).toBe(
				"SESSION_EXPIRED",
			);
			expect(enabled).toHaveBeenCalledOnce();
		} finally {
			spy.mockRestore();
		}
	});

	it.each([
		"zero",
		"throw",
	] as const)("does not enable the account or rotate its session when factor verification fails: %s", async (failure) => {
		const enabled = vi.fn();
		const { auth, db, client, signInWithTestUser, testUser } =
			await getTestInstance(
				{ plugins: [twoFactor({ onTotpEnabled: enabled })] },
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);
		const { headers, user } = await signInWithTestUser();
		const before = await auth.api.getSession({ headers });
		const enrollment = await client.twoFactor.enable(
			{ password: testUser.password, method: "totp" },
			{ headers },
		);
		if (enrollment.data?.method !== "totp")
			throw new Error("Expected TOTP enrollment");
		const factor = await db.findOne<{ secret: string }>({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
		});
		const secret = await symmetricDecrypt({
			key: (await auth.$context).secretConfig,
			data: factor!.secret,
		});
		const context = await auth.$context;
		const sessionsBefore = await db.findMany({
			model: "session",
			where: [{ field: "userId", value: user.id }],
		});
		const transaction = context.adapter.transaction.bind(context.adapter);
		const spy = vi
			.spyOn(context.adapter, "transaction")
			.mockImplementation(async (callback) =>
				transaction(async (tx) =>
					callback({
						...tx,
						updateMany: async (input) => {
							if (input.model === "twoFactor") {
								if (failure === "throw")
									throw new Error("Factor storage unavailable");
								return 0;
							}
							return tx.updateMany(input);
						},
					}),
				),
			);
		try {
			const result = await client.twoFactor.verifyTotp(
				{ code: await createOTP(secret).totp() },
				{ headers },
			);
			expect(result.error).not.toBeNull();
			expect(enabled).not.toHaveBeenCalled();
			expect(
				await db.findOne({
					model: "user",
					where: [{ field: "id", value: user.id }],
				}),
			).toMatchObject({ twoFactorEnabled: false });
			expect((await auth.api.getSession({ headers }))?.session.token).toBe(
				before?.session.token,
			);
			expect(
				await db.findMany({
					model: "session",
					where: [{ field: "userId", value: user.id }],
				}),
			).toEqual(sessionsBefore);
		} finally {
			spy.mockRestore();
		}
	});

	it("does not verify a replaced enrollment with the previous secret's code", async () => {
		const enabled = vi.fn();
		const { auth, db, client, signInWithTestUser, testUser } =
			await getTestInstance(
				{ plugins: [twoFactor({ onTotpEnabled: enabled })] },
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);
		const { headers, user } = await signInWithTestUser();
		const before = await auth.api.getSession({ headers });
		const enrollment = await client.twoFactor.enable(
			{ password: testUser.password, method: "totp" },
			{ headers },
		);
		if (enrollment.data?.method !== "totp")
			throw new Error("Expected TOTP enrollment");
		const factor = await db.findOne<{ secret: string }>({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
		});
		const secret = await symmetricDecrypt({
			key: (await auth.$context).secretConfig,
			data: factor!.secret,
		});
		const context = await auth.$context;
		const findOne = context.adapter.findOne.bind(context.adapter);
		let replaced = false;
		const spy = vi
			.spyOn(context.adapter, "findOne")
			.mockImplementation(async (input) => {
				const result = await findOne(input);
				if (input.model === "twoFactor" && !replaced) {
					replaced = true;
					const replacement = await client.twoFactor.enable(
						{ password: testUser.password, method: "totp" },
						{ headers },
					);
					expect(replacement.error).toBeNull();
				}
				return result;
			});
		try {
			const result = await client.twoFactor.verifyTotp(
				{ code: await createOTP(secret).totp() },
				{ headers },
			);
			expect(replaced).toBe(true);
			expect(result.error).not.toBeNull();
			expect(enabled).not.toHaveBeenCalled();
			expect(
				await db.findOne({
					model: "twoFactor",
					where: [{ field: "userId", value: user.id }],
				}),
			).toMatchObject({ verified: false });
			expect(
				await db.findOne({
					model: "user",
					where: [{ field: "id", value: user.id }],
				}),
			).toMatchObject({ twoFactorEnabled: false });
			expect((await auth.api.getSession({ headers }))?.session.token).toBe(
				before?.session.token,
			);
		} finally {
			spy.mockRestore();
		}
	});

	it.each(
		(["totp", "otp", "immediate-totp", "immediate-otp"] as const).flatMap(
			(method) => [true, false].map((veto) => ({ method, veto })),
		),
	)("rejects $method activation when its database hook vetoes or rewrites it: $veto", async ({
		method,
		veto,
	}) => {
		const enabled = vi.fn();
		let code = "";
		const immediate = method.startsWith("immediate-");
		const { auth, db, client, signInWithTestUser, testUser } =
			await getTestInstance(
				{
					databaseHooks: {
						user: {
							update: {
								before: async (data) =>
									data.twoFactorEnabled === true
										? veto
											? false
											: { data: { ...data, twoFactorEnabled: false } }
										: undefined,
							},
						},
					},
					plugins: [
						twoFactor({
							onTotpEnabled: enabled,
							skipVerificationOnEnable: immediate,
							otpOptions: {
								sendOTP: async ({ otp }) => {
									code = otp;
								},
							},
						}),
					],
				},
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);
		const { headers, user } = await signInWithTestUser();
		const before = await auth.api.getSession({ headers });
		const enrollment = await client.twoFactor.enable(
			{
				password: testUser.password,
				method: method === "immediate-otp" ? "otp" : "totp",
			},
			{ headers },
		);
		if (immediate) {
			expect(enrollment.error?.code).toBe("FAILED_TO_UPDATE_USER");
		} else if (method === "otp") {
			await client.twoFactor.sendOtp({}, { headers });
			expect(
				(await client.twoFactor.verifyOtp({ code }, { headers })).error?.code,
			).toBe("FAILED_TO_UPDATE_USER");
		} else {
			const row = await db.findOne<{ secret: string }>({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			});
			const secret = await symmetricDecrypt({
				key: (await auth.$context).secretConfig,
				data: row!.secret,
			});
			expect(
				(
					await client.twoFactor.verifyTotp(
						{ code: await createOTP(secret).totp() },
						{ headers },
					)
				).error?.code,
			).toBe("FAILED_TO_UPDATE_USER");
		}
		expect(enabled).not.toHaveBeenCalled();
		expect((await auth.api.getSession({ headers }))?.session.token).toBe(
			before?.session.token,
		);
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ twoFactorEnabled: false });
	});

	it.each([
		true,
		false,
	])("retains the factor when disabling is vetoed or rewritten by a database hook: %s", async (veto) => {
		const disabled = vi.fn();
		let block = false;
		const { auth, db, client, testUser, signInWithTestUser, sessionSetter } =
			await getTestInstance(
				{
					databaseHooks: {
						user: {
							update: {
								before: async (data) => {
									if (block && data.twoFactorEnabled === false)
										return veto
											? false
											: { data: { ...data, twoFactorEnabled: true } };
								},
							},
						},
					},
					plugins: [
						twoFactor({
							skipVerificationOnEnable: true,
							onTotpDisabled: disabled,
						}),
					],
				},
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);
		const { headers, user } = await signInWithTestUser();
		expect(
			(
				await client.twoFactor.enable(
					{ password: testUser.password, method: "totp" },
					{ headers, onSuccess: sessionSetter(headers) },
				)
			).error,
		).toBeNull();
		const before = await auth.api.getSession({ headers });
		block = true;
		expect(
			(
				await client.twoFactor.disable(
					{ password: testUser.password },
					{ headers },
				)
			).error?.code,
		).toBe("FAILED_TO_UPDATE_USER");
		expect(disabled).not.toHaveBeenCalled();
		expect((await auth.api.getSession({ headers }))?.session.token).toBe(
			before?.session.token,
		);
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ twoFactorEnabled: true });
		expect(
			await db.findOne({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			}),
		).not.toBeNull();
	});

	it.each([
		"totp",
		"otp",
	] as const)("emits immediate %s activation with the updated user", async (method) => {
		const enabled = vi.fn();
		const { client, signInWithTestUser, testUser } = await getTestInstance(
			{
				plugins: [
					twoFactor({
						onTotpEnabled: enabled,
						skipVerificationOnEnable: true,
						otpOptions: { sendOTP: async () => {} },
					}),
				],
			},
			{ clientOptions: { plugins: [twoFactorClient()] } },
		);
		const { headers } = await signInWithTestUser();
		expect(
			(
				await client.twoFactor.enable(
					{ password: testUser.password, method },
					{ headers },
				)
			).error,
		).toBeNull();
		expect(enabled).toHaveBeenCalledOnce();
		expect(enabled.mock.calls[0]?.[0]).toMatchObject({
			user: { twoFactorEnabled: true },
		});
	});

	it("does not announce activation when signing into a legacy verified TOTP account", async () => {
		const enabled = vi.fn();
		const {
			auth,
			db,
			client,
			signInWithTestUser,
			testUser,
			sessionSetter,
			cookieSetter,
		} = await getTestInstance(
			{
				plugins: [
					twoFactor({ onTotpEnabled: enabled, skipVerificationOnEnable: true }),
				],
			},
			{ clientOptions: { plugins: [twoFactorClient()] } },
		);
		const { headers, user } = await signInWithTestUser();
		await client.twoFactor.enable(
			{ password: testUser.password, method: "totp" },
			{ headers, onSuccess: sessionSetter(headers) },
		);
		await db.update({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
			update: { verified: null },
		});
		const row = await db.findOne<{ secret: string }>({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
		});
		const secret = await symmetricDecrypt({
			key: (await auth.$context).secretConfig,
			data: row!.secret,
		});
		await client.signOut({}, { headers });
		enabled.mockClear();
		(await auth.$context).adapter.options!.adapterConfig.transaction = false;
		const challenge = new Headers();
		expect(
			(
				await client.signIn.email(testUser, {
					onSuccess: cookieSetter(challenge),
				})
			).data,
		).toMatchObject({ twoFactorRedirect: true });
		expect(
			(
				await client.twoFactor.verifyTotp(
					{ code: await createOTP(secret).totp() },
					{ headers: challenge },
				)
			).error,
		).toBeNull();
		expect(enabled).not.toHaveBeenCalled();
	});

	it("announces activation when an OTP verifies an unverified enrollment", async () => {
		const enabled = vi.fn();
		const login = vi.fn();
		let code = "";
		const { client, testUser, signInWithTestUser, sessionSetter } =
			await getTestInstance(
				{
					onLogin: login,
					plugins: [
						twoFactor({
							onTotpEnabled: enabled,
							otpOptions: {
								sendOTP: async ({ otp }) => {
									code = otp;
								},
							},
						}),
					],
				},
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);
		const { headers } = await signInWithTestUser();
		await client.twoFactor.enable(
			{ password: testUser.password, method: "totp" },
			{ headers },
		);
		login.mockClear();
		expect(enabled).not.toHaveBeenCalled();
		expect((await client.twoFactor.sendOtp({}, { headers })).error).toBeNull();
		expect(code).not.toBe("");
		expect(
			(
				await client.twoFactor.verifyOtp(
					{ code },
					{ headers, onSuccess: sessionSetter(headers) },
				)
			).error,
		).toBeNull();
		expect(enabled).toHaveBeenCalledExactlyOnceWith(
			{ user: expect.objectContaining({ twoFactorEnabled: true }) },
			expect.anything(),
		);
		expect(login).not.toHaveBeenCalled();
	});

	it("announces a device login only when the approved code is exchanged", async () => {
		const login = vi.fn();
		const { auth, signInWithTestUser } = await getTestInstance({
			onLogin: login,
			plugins: [deviceAuthorization()],
		});
		const { headers } = await signInWithTestUser();
		login.mockClear();
		const { device_code, user_code } = await auth.api.deviceCode({
			body: { client_id: "lifecycle-client" },
		});
		await auth.api.deviceVerify({ query: { user_code }, headers });
		await auth.api.deviceApprove({ body: { userCode: user_code }, headers });
		expect(login).not.toHaveBeenCalled();
		const result = await auth.api.deviceToken({
			body: {
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code,
				client_id: "lifecycle-client",
			},
		});
		expect(result).toHaveProperty("access_token");
		if (!("access_token" in result)) throw new Error("Expected device token");
		expect(login).toHaveBeenCalledOnce();
		expect(login.mock.calls[0]?.[0]).toMatchObject({
			session: { token: result.access_token },
		});
	});

	it("announces verification delivery from username sign-in", async () => {
		const requested = vi.fn();
		const { client, testUser } = await getTestInstance(
			{
				plugins: [username()],
				emailAndPassword: { enabled: true, requireEmailVerification: true },
				emailVerification: {
					sendOnSignIn: true,
					sendVerificationEmail: async () => {},
					onEmailVerificationRequested: requested,
				},
			},
			{ disableTestUser: true, clientOptions: { plugins: [usernameClient()] } },
		);
		expect(
			(
				await client.signUp.email({
					email: testUser.email,
					name: testUser.name,
					password: testUser.password,
					username: "lifecycleuser",
				})
			).error,
		).toBeNull();
		requested.mockClear();
		expect(
			(
				await client.signIn.username({
					username: "lifecycleuser",
					password: testUser.password,
				})
			).error?.status,
		).toBe(403);
		expect(requested).toHaveBeenCalledOnce();
	});

	it("emits login after the second factor rather than the password challenge", async () => {
		const login = vi.fn();
		const {
			auth,
			db,
			client,
			signInWithTestUser,
			testUser,
			sessionSetter,
			cookieSetter,
		} = await getTestInstance(
			{
				onLogin: login,
				plugins: [twoFactor({ skipVerificationOnEnable: true })],
			},
			{ clientOptions: { plugins: [twoFactorClient()] } },
		);
		const { headers, user } = await signInWithTestUser();
		const enrollment = await client.twoFactor.enable(
			{ password: testUser.password, method: "totp" },
			{ headers, onSuccess: sessionSetter(headers) },
		);
		if (enrollment.data?.method !== "totp")
			throw new Error("Expected TOTP enrollment");
		await client.signOut({}, { headers });
		login.mockClear();
		const challengeHeaders = new Headers();
		const challenge = await client.signIn.email(testUser, {
			onSuccess: cookieSetter(challengeHeaders),
		});
		expect(challenge.data).toMatchObject({ twoFactorRedirect: true });
		expect(login).not.toHaveBeenCalled();
		const row = await db.findOne<{ secret: string }>({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
		});
		const secret = await symmetricDecrypt({
			key: (await auth.$context).secretConfig,
			data: row!.secret,
		});
		const complete = await client.twoFactor.verifyTotp(
			{ code: await createOTP(secret).totp() },
			{ headers: challengeHeaders },
		);
		expect(complete.error).toBeNull();
		expect(login).toHaveBeenCalledOnce();
		expect(login.mock.calls[0]?.[0]).toMatchObject({
			user: { email: testUser.email },
			session: { token: complete.data?.token },
		});
	});

	it("emits login for a completed magic link", async () => {
		const login = vi.fn();
		let token = "";
		const { client, testUser } = await getTestInstance(
			{
				onLogin: login,
				plugins: [
					magicLink({
						sendMagicLink: async (data) => {
							token = data.token;
						},
					}),
				],
			},
			{
				clientOptions: { plugins: [magicLinkClient()] },
			},
		);
		login.mockClear();
		await client.signIn.magicLink({ email: testUser.email });
		expect(login).not.toHaveBeenCalled();
		const result = await client.magicLink.verify({ query: { token } });
		expect(result.error).toBeNull();
		expect(login).toHaveBeenCalledOnce();
		expect(login.mock.calls[0]?.[0]).toMatchObject({
			user: { email: testUser.email },
			session: { token: result.data?.token },
		});
	});

	it.each([
		false,
		true,
	])("finalizes only after the outer hooks when nested dispatch rewrites cookies: %s", async (reject) => {
		const events: string[] = [];
		const inner = createAuthEndpoint(
			"/lifecycle-inner",
			{ method: "GET" },
			async (ctx) => {
				const inherited = ctx.context.newSession!;
				await setSessionCookie(ctx, {
					session: inherited.session,
					user: inherited.user,
				});
				events.push("inner");
				return ctx.json({ ok: true });
			},
		);
		const { auth, testUser } = await getTestInstance({
			onLogin: async () => {
				events.push("login");
			},
			plugins: [
				{
					id: "lifecycle-nesting",
					hooks: {
						after: [
							{
								matcher: (ctx) => ctx.path === "/sign-in/email",
								handler: createAuthMiddleware(async (ctx) => {
									await dispatchAuthEndpoint(inner, {
										context: ctx.context,
										headers: ctx.headers,
										asResponse: false,
									});
								}),
							},
							{
								matcher: (ctx) => ctx.path === "/sign-in/email",
								handler: createAuthMiddleware(async () => {
									events.push("last");
									if (reject) throw APIError.fromStatus("FORBIDDEN");
								}),
							},
						],
					},
				},
			],
		});
		events.length = 0;
		const response = await auth.api.signInEmail({
			body: testUser,
			asResponse: true,
		});
		expect(response.status).toBe(reject ? 403 : 200);
		expect(events).toEqual(
			reject ? ["inner", "last"] : ["inner", "last", "login"],
		);
	});

	it("does not emit login for a Response rejected by an after hook", async () => {
		const login = vi.fn();
		const { auth, testUser } = await getTestInstance({
			onLogin: login,
			hooks: {
				after: createAuthMiddleware(async (ctx) => {
					if (ctx.path === "/sign-in/email")
						return new Response(null, { status: 403 });
				}),
			},
		});
		login.mockClear();
		expect(
			(await auth.api.signInEmail({ body: testUser, asResponse: true })).status,
		).toBe(403);
		expect(login).not.toHaveBeenCalled();
	});

	it("does not announce login after a rejecting after hook", async () => {
		const login = vi.fn();
		const { auth, testUser } = await getTestInstance({
			onLogin: login,
			hooks: {
				after: createAuthMiddleware(async (ctx) => {
					if (ctx.path === "/sign-in/email")
						throw APIError.fromStatus("FORBIDDEN");
				}),
			},
		});
		login.mockClear();
		await expect(
			auth.api.signInEmail({ body: testUser }),
		).rejects.toMatchObject({ status: "FORBIDDEN" });
		expect(login).not.toHaveBeenCalled();
	});

	it("does not count profile writes or password session rotation as login", async () => {
		const login = vi.fn();
		const { client, testUser, signInWithTestUser } = await getTestInstance({
			onLogin: login,
		});
		const { headers } = await signInWithTestUser();
		login.mockClear();
		expect(
			(await client.updateUser({ name: "Changed" }, { headers })).error,
		).toBeNull();
		expect(
			(
				await client.changePassword(
					{
						currentPassword: testUser.password,
						newPassword: "updated-password",
						revokeOtherSessions: true,
					},
					{ headers },
				)
			).error,
		).toBeNull();
		expect(login).not.toHaveBeenCalled();
	});

	it("does not expose account existence when the reset lifecycle callback throws synchronously", async () => {
		const { client, testUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				sendResetPassword: async () => {},
				onResetPasswordRequested: () => {
					throw new Error("audit unavailable");
				},
			},
		});
		for (const email of [testUser.email, "unknown@example.com"]) {
			expect((await client.requestPasswordReset({ email })).error).toBeNull();
		}
	});

	it("does not announce session deletion when a database hook vetoes sign-out", async () => {
		const logout = vi.fn();
		const { auth, client, signInWithTestUser } = await getTestInstance({
			onLogout: logout,
			databaseHooks: { session: { delete: { before: async () => false } } },
		});
		const { headers } = await signInWithTestUser();
		expect((await client.signOut({}, { headers })).error).toBeNull();
		expect(await auth.api.getSession({ headers })).not.toBeNull();
		expect(logout).not.toHaveBeenCalled();
	});

	it("completes sign-out even if the logout callback throws synchronously", async () => {
		const { auth, client, signInWithTestUser } = await getTestInstance({
			onLogout: () => {
				throw new Error("audit unavailable");
			},
		});
		const { headers } = await signInWithTestUser();
		expect((await client.signOut({}, { headers })).error).toBeNull();
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	it("does not announce a password change vetoed by a database hook", async () => {
		const changed = vi.fn();
		const { client, testUser, signInWithTestUser } = await getTestInstance({
			emailAndPassword: { enabled: true, onPasswordChanged: changed },
			databaseHooks: { account: { update: { before: async () => false } } },
		});
		const { headers } = await signInWithTestUser();
		await client.changePassword(
			{ currentPassword: testUser.password, newPassword: "updated-password" },
			{ headers },
		);
		expect((await client.signIn.email(testUser)).error).toBeNull();
		expect(
			(
				await client.signIn.email({
					email: testUser.email,
					password: "updated-password",
				})
			).error?.status,
		).toBe(401);
		expect(changed).not.toHaveBeenCalled();
	});

	it("completes a password change when its lifecycle callback throws synchronously", async () => {
		const { client, testUser, signInWithTestUser } = await getTestInstance({
			emailAndPassword: {
				enabled: true,
				onPasswordChanged: () => {
					throw new Error("audit unavailable");
				},
			},
		});
		const { headers } = await signInWithTestUser();
		expect(
			(
				await client.changePassword(
					{
						currentPassword: testUser.password,
						newPassword: "updated-password",
					},
					{ headers },
				)
			).error,
		).toBeNull();
		expect(
			(
				await client.signIn.email({
					email: testUser.email,
					password: "updated-password",
				})
			).error,
		).toBeNull();
		expect((await client.signIn.email(testUser)).error?.status).toBe(401);
	});

	it.each([
		"sign-up",
		"sign-in",
		"change-email",
	] as const)("emits verification-requested for %s delivery", async (path) => {
		const requested = vi.fn();
		const { auth, client, testUser, signInWithTestUser } =
			await getTestInstance({
				emailAndPassword: {
					enabled: true,
					requireEmailVerification: path === "sign-in",
				},
				emailVerification: {
					sendOnSignUp: path === "sign-up",
					sendOnSignIn: true,
					sendVerificationEmail: async () => {},
					onEmailVerificationRequested: requested,
				},
				user: { changeEmail: { enabled: true } },
			});
		if (path === "sign-up") {
			expect(requested).toHaveBeenCalledOnce();
		} else if (path === "sign-in") {
			requested.mockClear();
			await expect(
				auth.api.signInEmail({ body: testUser }),
			).rejects.toMatchObject({ status: "FORBIDDEN" });
			expect(requested).toHaveBeenCalledOnce();
		} else {
			const { headers } = await signInWithTestUser();
			requested.mockClear();
			expect(
				(
					await client.changeEmail(
						{ newEmail: "changed@example.com" },
						{ headers },
					)
				).error,
			).toBeNull();
			expect(requested).toHaveBeenCalledOnce();
		}
	});
});

/** @see https://github.com/better-auth/better-auth/pull/8915 */
it("finalizes login once when an endpoint returns a raw Response", async () => {
	let userId = "";
	const login = vi.fn();
	const { auth, signInWithTestUser } = await getTestInstance({
		onLogin: login,
		plugins: [
			{
				id: "raw-response-login",
				endpoints: {
					rawLogin: createAuthEndpoint(
						"/raw-login",
						{ method: "GET" },
						async (ctx) => {
							const user =
								await ctx.context.internalAdapter.findUserById(userId);
							const session =
								await ctx.context.internalAdapter.createSession(userId);
							if (!user || !session) throw new Error("Missing test identity");
							await setSessionCookie(ctx, { user, session, isLogin: true });
							return new Response("signed in", { status: 200 });
						},
					),
				},
			},
		],
	});
	const signedIn = await signInWithTestUser();
	userId = signedIn.user.id;
	login.mockClear();
	const response = await auth.handler(
		new Request(`${(await auth.$context).baseURL}/raw-login`),
	);
	expect(response.status).toBe(200);
	expect(await response.text()).toBe("signed in");
	expect(login).toHaveBeenCalledOnce();
	expect(login.mock.calls[0]![0].user.id).toBe(userId);
});
