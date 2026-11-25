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

	it.for([
		"database",
		"database with custom ids",
		"secondary",
		"mirrored",
	] as const)(
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
						: storage === "database with custom ids"
							? {
									advanced: {
										database: { generateId: () => crypto.randomUUID() },
									},
								}
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
	 */
	it.for([
		{ storage: "database", resendAt: "2026-01-01T00:00:02.000Z" },
		{ storage: "secondary", resendAt: "2026-01-01T00:00:02.000Z" },
		{ storage: "mirrored", resendAt: "2026-01-01T00:00:02.000Z" },
		// The server that resends has a clock behind the one checking the guess.
		{ storage: "secondary", resendAt: "2025-12-31T23:59:59.000Z" },
	] as const)(
		"keeps a code resent at $resendAt while a wrong guess is checked in $storage storage",
		async ({ storage, resendAt }) => {
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
			vi.setSystemTime(new Date(resendAt));
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
	 * @see https://github.com/better-auth/better-auth/issues/11105
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

const usedCodeStorages = [
	"database",
	"database with custom ids",
	"database with hashed identifiers",
	"secondary",
	"secondary with hashed identifiers",
	"mirrored",
] as const;

function usedCodeStorageOptions(storage: (typeof usedCodeStorages)[number]) {
	const hashed = storage.endsWith("hashed identifiers");
	return {
		...(storage === "database with custom ids"
			? {
					advanced: {
						database: { generateId: () => crypto.randomUUID() },
					},
				}
			: {}),
		...(storage.startsWith("secondary") || storage === "mirrored"
			? { secondaryStorage: createSecondaryStorage() }
			: {}),
		verification: {
			...(hashed ? { storeIdentifier: "hashed" as const } : {}),
			...(storage === "mirrored" ? { storeInDatabase: true } : {}),
		},
	};
}

/**
 * A wrong guess consumes the code while it is compared and writes it back
 * afterwards. A code sent and used during that comparison must stay the only
 * valid one.
 *
 * @see https://github.com/better-auth/better-auth/issues/11105
 */
describe("email OTP written back after a newer code was sent", () => {
	it.for(usedCodeStorages)(
		"does not revive the older code after the newer one was used in %s storage",
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
					...usedCodeStorageOptions(storage),
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
			await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });

			const guess = client.emailOtp.checkVerificationOtp({
				email,
				type: "sign-in",
				otp: "000000",
			});
			await checkStarted;
			await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
			const newer = await client.signIn.emailOtp({ email, otp: "222222" });
			releaseCheck();

			expect(newer.data?.token).toBeDefined();
			expect((await guess).error?.code).toBe("INVALID_OTP");
			expect(
				await (await auth.$context).internalAdapter.findVerificationValue(
					toOTPIdentifier("sign-in", email),
				),
			).toBeNull();
			expect(
				(await client.signIn.emailOtp({ email, otp: "111111" })).error?.code,
			).toBe("INVALID_OTP");
		},
	);

	it("keeps a code issued without an issuance marker after a wrong guess", async () => {
		const { client, auth, testUser } = await getTestInstance(
			{
				plugins: [emailOTP({ async sendVerificationOTP() {} })],
			},
			{ clientOptions: { plugins: [emailOTPClient()] } },
		);
		const email = testUser.email;
		const identifier = toOTPIdentifier("sign-in", email);
		// Stored the way codes were before issuances were recorded.
		await (await auth.$context).internalAdapter.createVerificationValue({
			identifier,
			value: "111111:0",
			expiresAt: new Date(Date.now() + 60_000),
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
			(await client.signIn.emailOtp({ email, otp: "111111" })).data?.token,
		).toBeDefined();
	});

	it.for(usedCodeStorages)(
		"keeps the newer code when both codes are written back in %s storage",
		async (storage) => {
			const codes = ["111111", "222222"];
			const held = new Map<
				string,
				{ started: Promise<void>; signal: () => void; release: () => void }
			>();
			const gates = new Map<string, Promise<void>>();
			for (const guess of ["000000", "999999"]) {
				let signal: () => void = () => {};
				const started = new Promise<void>((resolve) => {
					signal = resolve;
				});
				let release: () => void = () => {};
				gates.set(
					guess,
					new Promise<void>((resolve) => {
						release = resolve;
					}),
				);
				held.set(guess, { started, signal, release });
			}
			const { client, auth, testUser } = await getTestInstance(
				{
					...usedCodeStorageOptions(storage),
					plugins: [
						emailOTP({
							generateOTP: () => codes.shift(),
							async sendVerificationOTP() {},
							storeOTP: {
								async hash(otp) {
									const gate = held.get(otp);
									if (gate) {
										held.delete(otp);
										gate.signal();
										await gates.get(otp);
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
			const first = held.get("000000")!;
			const second = held.get("999999")!;
			await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });

			const olderGuess = client.emailOtp.checkVerificationOtp({
				email,
				type: "sign-in",
				otp: "000000",
			});
			await first.started;
			await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
			const newerGuess = client.emailOtp.checkVerificationOtp({
				email,
				type: "sign-in",
				otp: "999999",
			});
			await second.started;
			first.release();
			expect((await olderGuess).error?.code).toBe("INVALID_OTP");
			second.release();
			expect((await newerGuess).error?.code).toBe("INVALID_OTP");

			const stored = await (
				await auth.$context
			).internalAdapter.findVerificationValue(
				toOTPIdentifier("sign-in", email),
			);
			expect(stored?.value).toBe("stored-222222:1");
			expect(
				(await client.signIn.emailOtp({ email, otp: "111111" })).error?.code,
			).toBe("INVALID_OTP");
			expect(
				(await client.signIn.emailOtp({ email, otp: "222222" })).data?.token,
			).toBeDefined();
		},
	);
});
