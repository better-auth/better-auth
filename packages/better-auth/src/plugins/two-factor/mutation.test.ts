import type { BetterAuthOptions } from "@better-auth/core";
import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it, vi } from "vitest";
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
