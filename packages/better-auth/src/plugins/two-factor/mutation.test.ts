import type { BetterAuthOptions } from "@better-auth/core";
import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it, vi } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { symmetricDecrypt } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { twoFactor, twoFactorClient } from ".";

/** @see https://github.com/better-auth/better-auth/pull/8915#discussion_r3968096864 */
describe("transactional two-factor configuration", () => {
	it("delivers replacement cookies and lifecycle events despite a failing post-commit database hook", async () => {
		let failAfter = false;
		const enabled = vi.fn();
		const { auth, db, client, testUser, signInWithTestUser, sessionSetter } =
			await getTestInstance(
				{
					plugins: [twoFactor({ onTotpEnabled: enabled })],
					databaseHooks: {
						user: {
							update: {
								after: async () => {
									if (failAfter) throw new Error("after hook failed");
								},
							},
						},
					},
				},
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);
		const { headers, user } = await signInWithTestUser();
		await client.twoFactor.enable({ password: testUser.password }, { headers });
		const factor = await db.findOne<{ secret: string }>({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
		});
		const code = await createOTP(
			await symmetricDecrypt({
				key: (await auth.$context).secretConfig,
				data: factor!.secret,
			}),
		).totp();
		const before = await auth.api.getSession({ headers });
		failAfter = true;
		const result = await client.twoFactor.verifyTotp(
			{ code },
			{ headers, onSuccess: sessionSetter(headers) },
		);
		expect(result.error).toBeNull();
		expect(result.data?.token).not.toBe(before!.session.token);
		expect((await auth.api.getSession({ headers }))?.session.token).toBe(
			result.data?.token,
		);
		expect(enabled).toHaveBeenCalledOnce();
	});

	it.each([
		"create",
		"delete",
	] as const)("rolls back factor and user changes when session %s is vetoed", async (operation) => {
		let blocked = false;
		const enabled = vi.fn();
		const { auth, db, client, testUser, signInWithTestUser, sessionSetter } =
			await getTestInstance(
				{
					plugins: [twoFactor({ onTotpEnabled: enabled })],
					databaseHooks: {
						session: {
							[operation]: {
								before: async () => (blocked ? false : undefined),
							},
						},
					},
				},
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);
		const { headers, user } = await signInWithTestUser();
		await client.twoFactor.enable({ password: testUser.password }, { headers });
		const factor = await db.findOne<{ secret: string }>({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
		});
		const code = await createOTP(
			await symmetricDecrypt({
				key: (await auth.$context).secretConfig,
				data: factor!.secret,
			}),
		).totp();
		const before = await auth.api.getSession({ headers });
		const sessions = await db.findMany({
			model: "session",
			where: [{ field: "userId", value: user.id }],
		});
		blocked = true;
		const result = await client.twoFactor.verifyTotp({ code }, { headers });
		expect(result.error).not.toBeNull();
		expect(enabled).not.toHaveBeenCalled();
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toMatchObject({ twoFactorEnabled: false });
		expect(
			await db.findOne({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			}),
		).toMatchObject({ verified: false });
		expect(
			await db.findMany({
				model: "session",
				where: [{ field: "userId", value: user.id }],
			}),
		).toEqual(sessions);
		blocked = false;
		const retried = await client.twoFactor.verifyTotp(
			{ code },
			{ headers, onSuccess: sessionSetter(headers) },
		);
		expect(retried.error).toBeNull();
		expect(retried.data?.token).not.toBe(before!.session.token);
		expect(retried.data?.token).toBe(
			(await auth.api.getSession({ headers }))?.session.token,
		);
		expect(enabled).toHaveBeenCalledOnce();
	});

	it.each([
		"disabled",
		"memory",
		"secondary",
	] as const)("rejects incompatible %s storage before factor mutation", async (storage) => {
		const { auth, db, client, testUser, signInWithTestUser } =
			await getTestInstance(
				{ plugins: [twoFactor()] },
				{ clientOptions: { plugins: [twoFactorClient()] } },
			);
		const { headers, user } = await signInWithTestUser();
		const context = await auth.$context;
		if (storage === "disabled")
			context.adapter.options!.adapterConfig.transaction = false;
		if (storage === "memory") context.adapter.id = "memory";
		if (storage === "secondary")
			(context.options as BetterAuthOptions).secondaryStorage = {
				get: async () => null,
				set: async () => {},
				delete: async () => {},
				getAndDelete: async () => null,
				increment: async () => 1,
			};
		const before = await db.findOne({
			model: "user",
			where: [{ field: "id", value: user.id }],
		});
		const result = await client.twoFactor.enable(
			{ password: testUser.password },
			{ headers },
		);
		expect(result.error?.code).toBe("TWO_FACTOR_REQUIRES_TRANSACTION");
		expect(
			await db.findOne({
				model: "user",
				where: [{ field: "id", value: user.id }],
			}),
		).toEqual(before);
		expect(
			await db.findMany({
				model: "twoFactor",
				where: [{ field: "userId", value: user.id }],
			}),
		).toEqual([]);
	});

	it("rejects unsupported OTP activation without consuming the valid code", async () => {
		let code = "";
		const { auth, client, testUser, signInWithTestUser } =
			await getTestInstance(
				{
					plugins: [
						twoFactor({
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
		await client.twoFactor.enable({ password: testUser.password }, { headers });
		await client.twoFactor.sendOtp({}, { headers });
		const context = await auth.$context;
		const transaction = context.adapter.options!.adapterConfig.transaction;
		context.adapter.options!.adapterConfig.transaction = false;
		expect(
			(await client.twoFactor.verifyOtp({ code }, { headers })).error?.code,
		).toBe("TWO_FACTOR_REQUIRES_TRANSACTION");
		context.adapter.options!.adapterConfig.transaction = transaction;
		expect(
			(await client.twoFactor.verifyOtp({ code }, { headers })).error,
		).toBeNull();
	});

	it("rolls back OTP consumption after a session veto", async () => {
		let code = "";
		let blocked = false;
		const { client, testUser, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					twoFactor({
						otpOptions: {
							allowedAttempts: 2,
							sendOTP: async ({ otp }) => {
								code = otp;
							},
						},
					}),
				],
				databaseHooks: {
					session: {
						create: { before: async () => (blocked ? false : undefined) },
					},
				},
			},
			{ clientOptions: { plugins: [twoFactorClient()] } },
		);
		const { headers } = await signInWithTestUser();
		await client.twoFactor.enable({ password: testUser.password }, { headers });
		await client.twoFactor.sendOtp({}, { headers });
		blocked = true;
		expect(
			(await client.twoFactor.verifyOtp({ code }, { headers })).error,
		).not.toBeNull();
		blocked = false;
		expect(
			(await client.twoFactor.verifyOtp({ code }, { headers })).error,
		).toBeNull();
	});

	it("commits invalid OTP budgets while authenticated configuration is transactional", async () => {
		let code = "";
		const { client, testUser, signInWithTestUser } = await getTestInstance(
			{
				plugins: [
					twoFactor({
						otpOptions: {
							allowedAttempts: 2,
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
		await client.twoFactor.enable({ password: testUser.password }, { headers });
		await client.twoFactor.sendOtp({}, { headers });
		const wrong = code === "000000" ? "111111" : "000000";
		for (let attempt = 0; attempt < 2; attempt++)
			expect(
				(await client.twoFactor.verifyOtp({ code: wrong }, { headers })).error
					?.code,
			).toBe("INVALID_CODE");
		expect(
			(await client.twoFactor.verifyOtp({ code }, { headers })).error?.code,
		).toBe("TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE");
	});

	it("keeps custom schema mappings isolated between auth instances", async () => {
		const first = await getTestInstance({ plugins: [twoFactor()] });
		await getTestInstance({
			plugins: [
				twoFactor({
					schema: {
						twoFactor: { modelName: "mapped_factor" },
						user: { fields: { twoFactorVersion: "factor_version" } },
					},
				}),
			],
		});
		const { headers } = await first.signInWithTestUser();
		expect(
			await first.auth.api.enableTwoFactor({
				headers,
				body: { password: first.testUser.password },
			}),
		).toMatchObject({ method: "totp" });
		const result = await first.auth.api.getSession({ headers });
		expect(result?.user).not.toHaveProperty("twoFactorVersion");
	});
});

/** @see https://github.com/better-auth/better-auth/pull/8915 */
it.each([
	true,
	false,
])("re-verifies active OTP and TOTP without changing configuration (transactions: %s)", async (transactional) => {
	let code = "";
	const enabled = vi.fn();
	const { auth, client, db, testUser, signInWithTestUser, sessionSetter } =
		await getTestInstance(
			{
				plugins: [
					twoFactor({
						onTotpEnabled: enabled,
						otpOptions: {
							allowedAttempts: 2,
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
	await client.twoFactor.enable({ password: testUser.password }, { headers });
	const factor = await db.findOne<{ secret: string }>({
		model: "twoFactor",
		where: [{ field: "userId", value: user.id }],
	});
	const totp = await createOTP(
		await symmetricDecrypt({
			key: (await auth.$context).secretConfig,
			data: factor!.secret,
		}),
	).totp();
	expect(
		(
			await client.twoFactor.verifyTotp(
				{ code: totp },
				{ headers, onSuccess: sessionSetter(headers) },
			)
		).error,
	).toBeNull();
	enabled.mockClear();
	const before = await db.findOne({
		model: "user",
		where: [{ field: "id", value: user.id }],
	});
	const sessions = await db.findMany({
		model: "session",
		where: [{ field: "userId", value: user.id }],
	});
	if (!transactional)
		(await auth.$context).adapter.options!.adapterConfig.transaction = false;
	await client.twoFactor.sendOtp({}, { headers });
	const wrong = code === "000000" ? "111111" : "000000";
	expect(
		(await client.twoFactor.verifyOtp({ code: wrong }, { headers })).error
			?.code,
	).toBe("INVALID_CODE");
	expect(
		(await client.twoFactor.verifyOtp({ code }, { headers })).error,
	).toBeNull();
	expect(
		(await client.twoFactor.verifyOtp({ code }, { headers })).error?.code,
	).toBe("OTP_HAS_EXPIRED");
	const wrongTotp = totp === "000000" ? "111111" : "000000";
	expect(
		(await client.twoFactor.verifyTotp({ code: wrongTotp }, { headers })).error
			?.code,
	).toBe("INVALID_CODE");
	expect(
		(await client.twoFactor.verifyTotp({ code: totp }, { headers })).error,
	).toBeNull();
	expect(
		await db.findOne({
			model: "user",
			where: [{ field: "id", value: user.id }],
		}),
	).toEqual(before);
	expect(
		await db.findMany({
			model: "session",
			where: [{ field: "userId", value: user.id }],
		}),
	).toEqual(sessions);
	expect(enabled).not.toHaveBeenCalled();
});

/** @see https://github.com/better-auth/better-auth/pull/8915 */
it.each([
	["totp", false],
	["otp", false],
	["skip", false],
	["totp", true],
	["otp", true],
	["skip", true],
] as const)("preserves remember-me lifetime during %s activation and disable (remember: %s)", async (method, rememberMe) => {
	let code = "";
	const { auth, client, db, testUser, sessionSetter } = await getTestInstance(
		{
			plugins: [
				twoFactor({
					skipVerificationOnEnable: method === "skip",
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
	const headers = new Headers();
	const jar = new Map<string, string>();
	const keepCookies = (
		context: Parameters<ReturnType<typeof sessionSetter>>[0],
	) => {
		const cookies = parseSetCookieHeader(
			context.response.headers.get("set-cookie") ?? "",
		);
		for (const [name, cookie] of cookies) jar.set(name, cookie.value);
		headers.set(
			"cookie",
			[...jar].map(([name, value]) => `${name}=${value}`).join("; "),
		);
		const tokenCookie = cookies.get("better-auth.session_token");
		if (tokenCookie?.value) {
			if (rememberMe) expect(tokenCookie["max-age"]).toBeGreaterThan(0);
			else expect(tokenCookie["max-age"]).toBeUndefined();
		}
	};
	const signedIn = await client.signIn.email(
		{ email: testUser.email, password: testUser.password, rememberMe },
		{ onSuccess: keepCookies },
	);
	expect(signedIn.error).toBeNull();
	const before = (await auth.api.getSession({ headers }))!;
	const lifetime =
		before.session.expiresAt.getTime() - before.session.createdAt.getTime();
	if (rememberMe) expect(lifetime).toBeGreaterThan(86400000);
	else expect(lifetime).toBeLessThanOrEqual(86401000);
	const enable = await client.twoFactor.enable(
		{ password: testUser.password, method: method === "otp" ? "otp" : "totp" },
		{ headers, onSuccess: keepCookies },
	);
	expect(enable.error).toBeNull();
	if (method === "totp") {
		const factor = await db.findOne<{ secret: string }>({
			model: "twoFactor",
			where: [{ field: "userId", value: before.user.id }],
		});
		code = await createOTP(
			await symmetricDecrypt({
				key: (await auth.$context).secretConfig,
				data: factor!.secret,
			}),
		).totp();
		expect(
			(
				await client.twoFactor.verifyTotp(
					{ code },
					{ headers, onSuccess: keepCookies },
				)
			).error,
		).toBeNull();
	} else if (method === "otp") {
		await client.twoFactor.sendOtp({}, { headers });
		expect(
			(
				await client.twoFactor.verifyOtp(
					{ code },
					{ headers, onSuccess: keepCookies },
				)
			).error,
		).toBeNull();
	}
	const activated = (await auth.api.getSession({ headers }))!;
	expect(activated.session.token).not.toBe(before.session.token);
	expect(
		activated.session.expiresAt.getTime() -
			activated.session.createdAt.getTime(),
	).toBeLessThanOrEqual(lifetime + 1000);
	expect(
		activated.session.expiresAt.getTime() -
			activated.session.createdAt.getTime(),
	).toBeGreaterThanOrEqual(lifetime - 1000);
	expect(
		(
			await client.twoFactor.disable(
				{ password: testUser.password },
				{ headers, onSuccess: keepCookies },
			)
		).error,
	).toBeNull();
	const disabled = (await auth.api.getSession({ headers }))!;
	expect(disabled.session.token).not.toBe(activated.session.token);
	expect(
		disabled.session.expiresAt.getTime() - disabled.session.createdAt.getTime(),
	).toBeLessThanOrEqual(lifetime + 1000);
	expect(
		disabled.session.expiresAt.getTime() - disabled.session.createdAt.getTime(),
	).toBeGreaterThanOrEqual(lifetime - 1000);
});
