import type { SecondaryStorage } from "@better-auth/core/db";
import { getTestInstance } from "better-auth/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emailOTP } from ".";
import { emailOTPClient } from "./client";
import { splitAtLastColon, toOTPIdentifier } from "./utils";

function createSecondaryStorage(): SecondaryStorage {
	const values = new Map<string, string>();
	return {
		get: (key) => values.get(key) ?? null,
		getAndDelete: (key) => {
			const value = values.get(key) ?? null;
			values.delete(key);
			return value;
		},
		increment: (key) => {
			const value = Number(values.get(key) ?? 0) + 1;
			values.set(key, String(value));
			return value;
		},
		set: (key, value) => {
			values.set(key, value);
		},
		delete: (key) => {
			values.delete(key);
		},
	};
}

describe("email OTP preflight attempt accounting", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it.for(["database", "secondary", "mirrored"] as const)(
		"only compares one guess while a %s check holds the OTP",
		async (storage) => {
			let compareCount = 0;
			let releaseFirstComparison: () => void = () => {};
			const firstComparisonHeld = new Promise<void>((resolve) => {
				releaseFirstComparison = resolve;
			});
			let signalFirstComparison: () => void = () => {};
			const firstComparisonStarted = new Promise<void>((resolve) => {
				signalFirstComparison = resolve;
			});
			const { client, auth, testUser } = await getTestInstance(
				{
					...(storage === "database"
						? {}
						: {
								secondaryStorage: createSecondaryStorage(),
								...(storage === "mirrored"
									? { verification: { storeInDatabase: true } }
									: {}),
							}),
					plugins: [
						emailOTP({
							generateOTP: () => "654321",
							async sendVerificationOTP() {},
							storeOTP: {
								async hash(otp) {
									if (otp === "000000" || otp === "111111") {
										compareCount++;
										if (otp === "000000") {
											signalFirstComparison();
											await firstComparisonHeld;
										}
									}
									return `stored-${otp}`;
								},
							},
						}),
					],
				},
				{ clientOptions: { plugins: [emailOTPClient()] } },
			);
			const email = testUser.email;
			await client.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});

			const first = client.emailOtp.checkVerificationOtp({
				email,
				type: "sign-in",
				otp: "000000",
			});
			await firstComparisonStarted;
			const second = await client.emailOtp
				.checkVerificationOtp({
					email,
					type: "sign-in",
					otp: "111111",
				})
				.finally(releaseFirstComparison);
			const firstResult = await first;
			const row = await (
				await auth.$context
			).internalAdapter.findVerificationValue(
				toOTPIdentifier("sign-in", email),
			);
			const [, attempts] = splitAtLastColon(row?.value ?? "");

			expect(firstResult.error?.code).toBe("INVALID_OTP");
			expect(second.error?.code).toBe("INVALID_OTP");
			expect(compareCount).toBe(1);
			expect(Number(attempts)).toBe(1);
		},
	);

	it("keeps a correct preflight available for sign-in and enforces the shared budget", async () => {
		const otp = "654321";
		const { client, auth, testUser } = await getTestInstance(
			{
				plugins: [
					emailOTP({
						generateOTP: () => otp,
						async sendVerificationOTP() {},
						allowedAttempts: 2,
					}),
				],
			},
			{ clientOptions: { plugins: [emailOTPClient()] } },
		);
		const email = testUser.email;
		await client.emailOtp.sendVerificationOtp({
			email,
			type: "sign-in",
		});
		const check = (code: string) =>
			client.emailOtp.checkVerificationOtp({
				email,
				type: "sign-in",
				otp: code,
			});

		expect((await check(otp)).data?.success).toBe(true);
		expect((await check("000000")).error?.code).toBe("INVALID_OTP");
		expect((await check(otp)).data?.success).toBe(true);
		const row = await (
			await auth.$context
		).internalAdapter.findVerificationValue(toOTPIdentifier("sign-in", email));
		const [, attempts] = splitAtLastColon(row?.value ?? "");
		expect(Number(attempts)).toBe(1);
		expect(
			(
				await client.signIn.emailOtp({
					email,
					otp,
				})
			).data?.token,
		).toBeDefined();
		await client.emailOtp.requestPasswordReset({ email });
		expect(
			(
				await client.emailOtp.checkVerificationOtp({
					email,
					type: "forget-password",
					otp,
				})
			).data?.success,
		).toBe(true);
		expect(
			(
				await client.emailOtp.resetPassword({
					email,
					otp,
					password: "new-password-123",
				})
			).data?.success,
		).toBe(true);

		await client.emailOtp.sendVerificationOtp({
			email,
			type: "sign-in",
		});
		expect((await check("000000")).error?.code).toBe("INVALID_OTP");
		expect((await check("111111")).error?.code).toBe("INVALID_OTP");
		expect((await check(otp)).error?.code).toBe("TOO_MANY_ATTEMPTS");
		expect(
			(
				await client.signIn.emailOtp({
					email,
					otp,
				})
			).error?.code,
		).toBe("INVALID_OTP");
	});

	it("keeps a correct preflight available for email verification", async () => {
		const otp = "654321";
		const { client, auth, testUser } = await getTestInstance(
			{
				plugins: [
					emailOTP({
						generateOTP: () => otp,
						async sendVerificationOTP() {},
					}),
				],
			},
			{ clientOptions: { plugins: [emailOTPClient()] } },
		);
		const email = testUser.email;
		const identifier = toOTPIdentifier("email-verification", email);
		expect(
			(
				await client.emailOtp.sendVerificationOtp({
					email,
					type: "email-verification",
				})
			).data?.success,
		).toBe(true);

		expect(
			(
				await client.emailOtp.checkVerificationOtp({
					email,
					type: "email-verification",
					otp,
				})
			).data?.success,
		).toBe(true);
		expect(
			await (await auth.$context).internalAdapter.findVerificationValue(
				identifier,
			),
		).not.toBeNull();

		const verified = await client.emailOtp.verifyEmail({
			email,
			otp,
		});
		expect(verified.data?.status).toBe(true);
		expect(verified.data?.user.emailVerified).toBe(true);
		expect(
			await (await auth.$context).internalAdapter.findVerificationValue(
				identifier,
			),
		).toBeNull();
	});

	it("does not report preflight success when a verification hook vetoes restoration", async () => {
		let allowCreate = true;
		const otp = "654321";
		const { client, auth, testUser } = await getTestInstance(
			{
				databaseHooks: {
					verification: {
						create: {
							async before() {
								return allowCreate ? undefined : false;
							},
						},
					},
				},
				plugins: [
					emailOTP({
						generateOTP: () => otp,
						async sendVerificationOTP() {},
					}),
				],
			},
			{ clientOptions: { plugins: [emailOTPClient()] } },
		);
		const email = testUser.email;
		await client.emailOtp.sendVerificationOtp({
			email,
			type: "sign-in",
		});
		allowCreate = false;

		const check = await client.emailOtp.checkVerificationOtp({
			email,
			type: "sign-in",
			otp,
		});
		expect(check.data).toBeNull();
		expect(check.error?.status).toBe(500);
		expect(
			await (await auth.$context).internalAdapter.findVerificationValue(
				toOTPIdentifier("sign-in", email),
			),
		).toBeNull();
		expect(
			(
				await client.signIn.emailOtp({
					email,
					otp,
				})
			).error?.code,
		).toBe("INVALID_OTP");
	});

	it.for(["database", "secondary", "mirrored"] as const)(
		"does not revive a code that was replaced while it was being checked in %s storage",
		async (storage) => {
			const codes = ["111111", "222222"];
			let holdCheck = false;
			let releaseCheck: () => void = () => {};
			const checkReleased = new Promise<void>((resolve) => {
				releaseCheck = resolve;
			});
			let signalCheck: () => void = () => {};
			const checkStarted = new Promise<void>((resolve) => {
				signalCheck = resolve;
			});
			const { client, testUser } = await getTestInstance(
				{
					...(storage === "database"
						? {}
						: {
								secondaryStorage: createSecondaryStorage(),
								...(storage === "mirrored"
									? { verification: { storeInDatabase: true } }
									: {}),
							}),
					plugins: [
						emailOTP({
							generateOTP: () => codes.shift(),
							async sendVerificationOTP() {},
							storeOTP: {
								async hash(otp) {
									if (holdCheck && otp === "111111") {
										holdCheck = false;
										signalCheck();
										await checkReleased;
									}
									return `stored-${otp}`;
								},
							},
						}),
					],
				},
				{ clientOptions: { plugins: [emailOTPClient()] } },
			);
			const email = testUser.email;
			await client.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});

			holdCheck = true;
			const check = client.emailOtp.checkVerificationOtp({
				email,
				type: "sign-in",
				otp: "111111",
			});
			await checkStarted;
			await client.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});
			releaseCheck();

			expect((await check).error?.code).toBe("INVALID_OTP");
			expect(
				(
					await client.signIn.emailOtp({
						email,
						otp: "111111",
					})
				).error?.code,
			).toBe("INVALID_OTP");
			expect(
				(
					await client.signIn.emailOtp({
						email,
						otp: "222222",
					})
				).data?.token,
			).toBeDefined();
		},
	);

	/**
	 * @see https://github.com/better-auth/better-auth/issues/11105
	 * @see https://github.com/better-auth/better-auth/pull/12893
	 */
	it.for(["database", "secondary", "mirrored"] as const)(
		"keeps a code resent while a wrong guess is checked in %s storage",
		async (storage) => {
			const codes = ["111111", "222222"];
			let releaseCheck: () => void = () => {};
			const checkReleased = new Promise<void>((resolve) => {
				releaseCheck = resolve;
			});
			let signalCheck: () => void = () => {};
			const checkStarted = new Promise<void>((resolve) => {
				signalCheck = resolve;
			});
			const { client, auth, testUser } = await getTestInstance(
				{
					...(storage === "database"
						? {}
						: {
								secondaryStorage: createSecondaryStorage(),
								...(storage === "mirrored"
									? { verification: { storeInDatabase: true } }
									: {}),
							}),
					plugins: [
						emailOTP({
							generateOTP: () => codes.shift(),
							async sendVerificationOTP() {},
							storeOTP: {
								async hash(otp) {
									// The wrong guess is compared after it consumed the code.
									if (otp === "000000") {
										signalCheck();
										await checkReleased;
									}
									return `stored-${otp}`;
								},
							},
						}),
					],
				},
				{ clientOptions: { plugins: [emailOTPClient()] } },
			);
			const email = testUser.email;
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
			await client.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});

			vi.setSystemTime(new Date("2026-01-01T00:00:01.000Z"));
			const guess = client.emailOtp.checkVerificationOtp({
				email,
				type: "sign-in",
				otp: "000000",
			});
			await checkStarted;
			vi.setSystemTime(new Date("2026-01-01T00:00:02.000Z"));
			await client.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});
			vi.setSystemTime(new Date("2026-01-01T00:00:03.000Z"));
			releaseCheck();

			expect((await guess).error?.code).toBe("INVALID_OTP");
			const stored = await (
				await auth.$context
			).internalAdapter.findVerificationValue(
				toOTPIdentifier("sign-in", email),
			);
			expect(stored?.value).toBe("stored-222222:0");
			expect(
				(
					await client.signIn.emailOtp({
						email,
						otp: "222222",
					})
				).data?.token,
			).toBeDefined();
		},
	);

	/**
	 * @see https://github.com/better-auth/better-auth/pull/12893
	 */
	it.for(["database", "mirrored"] as const)(
		"keeps the code after a wrong guess when an older plain-identifier row remains in %s storage",
		async (storage) => {
			const { client, db, testUser } = await getTestInstance(
				{
					...(storage === "mirrored"
						? { secondaryStorage: createSecondaryStorage() }
						: {}),
					verification: {
						storeIdentifier: "hashed",
						...(storage === "mirrored" ? { storeInDatabase: true } : {}),
					},
					plugins: [
						emailOTP({
							generateOTP: () => "222222",
							async sendVerificationOTP() {},
						}),
					],
				},
				{ clientOptions: { plugins: [emailOTPClient()] } },
			);
			const email = testUser.email;
			// Stored before identifiers were hashed.
			await db.create({
				model: "verification",
				data: {
					identifier: toOTPIdentifier("sign-in", email),
					value: "111111:0",
					expiresAt: new Date(Date.now() + 60_000),
					createdAt: new Date(Date.now() - 60_000),
					updatedAt: new Date(Date.now() - 60_000),
				},
			});
			await client.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});

			expect(
				(
					await client.emailOtp.checkVerificationOtp({
						email,
						type: "sign-in",
						otp: "000000",
					})
				).error?.code,
			).toBe("INVALID_OTP");
			expect(
				(
					await client.signIn.emailOtp({
						email,
						otp: "222222",
					})
				).data?.token,
			).toBeDefined();
		},
	);
});
