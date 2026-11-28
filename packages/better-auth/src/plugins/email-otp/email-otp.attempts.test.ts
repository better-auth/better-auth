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
		"counts a guess made while a %s check holds the OTP",
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
							generateOTP: () => "654321",
							async sendVerificationOTP() {},
							allowedAttempts: 2,
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
			const check = (otp: string) =>
				client.emailOtp.checkVerificationOtp({
					email,
					type: "sign-in",
					otp,
				});

			const first = check("000000");
			await firstComparisonStarted;
			const second = await check("111111").finally(releaseFirstComparison);
			const firstResult = await first;

			expect(firstResult.error?.code).toBe("INVALID_OTP");
			expect(second.error?.code).toBe("INVALID_OTP");
			expect(compareCount).toBe(2);
			expect((await check("654321")).error?.code).toBe("TOO_MANY_ATTEMPTS");
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
		).toBe("TOO_MANY_ATTEMPTS");
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

	/**
	 * @see https://better-auth.com/docs/concepts/database#database-hooks
	 */
	it("does not compare a guess when a verification hook blocks counting it", async () => {
		let allowUpdate = false;
		const hashed: string[] = [];
		const otp = "654321";
		const { client, testUser } = await getTestInstance(
			{
				databaseHooks: {
					verification: {
						update: {
							async before() {
								return allowUpdate ? undefined : false;
							},
						},
					},
				},
				plugins: [
					emailOTP({
						generateOTP: () => otp,
						async sendVerificationOTP() {},
						storeOTP: {
							async hash(code) {
								hashed.push(code);
								return `stored-${code}`;
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

		const check = await client.emailOtp.checkVerificationOtp({
			email,
			type: "sign-in",
			otp,
		});
		expect(check.data).toBeNull();
		expect(check.error?.status).toBe(500);
		// Only the send hashed a code; the guess was never compared.
		expect(hashed).toEqual([otp]);

		allowUpdate = true;
		expect(
			(
				await client.signIn.emailOtp({
					email,
					otp,
				})
			).data?.token,
		).toBeDefined();
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
									// Hold the wrong guess while it is compared.
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
 * A code sent and used while a wrong guess against an older code is compared
 * must stay the only valid one.
 *
 * @see https://github.com/better-auth/better-auth/issues/11105
 */
describe("email OTP guessed while a newer code was sent", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

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
									// Hold the wrong guess while it is compared.
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

	it("does not revive an older code that a concurrent send stored first", async () => {
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
				plugins: [
					emailOTP({
						generateOTP: () => codes.shift(),
						async sendVerificationOTP() {},
						storeOTP: {
							async hash(otp) {
								// Hold the wrong guess while it is compared.
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
		const { internalAdapter } = await auth.$context;

		// Both sends clear the identifier before either one stores anything.
		let deletes = 0;
		let releaseDeletes: () => void = () => {};
		const deletesDone = new Promise<void>((resolve) => {
			releaseDeletes = resolve;
		});
		const remove = internalAdapter.deleteVerificationByIdentifier;
		vi.spyOn(
			internalAdapter,
			"deleteVerificationByIdentifier",
		).mockImplementation(async (id) => {
			await remove(id);
			if (++deletes === 2) releaseDeletes();
			if (deletes <= 2) await deletesDone;
		});
		// The second send stores its code once the guess consumed the first.
		let signalSecondCode: () => void = () => {};
		const secondCodeReady = new Promise<void>((resolve) => {
			signalSecondCode = resolve;
		});
		let releaseSecondCode: () => void = () => {};
		const secondCodeReleased = new Promise<void>((resolve) => {
			releaseSecondCode = resolve;
		});
		const create = internalAdapter.createVerificationValue;
		vi.spyOn(internalAdapter, "createVerificationValue").mockImplementation(
			async (data) => {
				if (data.value === "stored-222222:0") {
					signalSecondCode();
					await secondCodeReleased;
				}
				return create(data);
			},
		);

		const firstSend = client.emailOtp.sendVerificationOtp({
			email,
			type: "sign-in",
		});
		const secondSend = client.emailOtp.sendVerificationOtp({
			email,
			type: "sign-in",
		});
		await firstSend;
		await secondCodeReady;
		const guess = client.emailOtp.checkVerificationOtp({
			email,
			type: "sign-in",
			otp: "000000",
		});
		await checkStarted;
		releaseSecondCode();
		await secondSend;
		const newer = await client.signIn.emailOtp({ email, otp: "222222" });
		releaseCheck();

		expect(newer.data?.token).toBeDefined();
		expect((await guess).error?.code).toBe("INVALID_OTP");
		expect(
			await internalAdapter.findVerificationValue(
				toOTPIdentifier("sign-in", email),
			),
		).toBeNull();
		expect(
			(await client.signIn.emailOtp({ email, otp: "111111" })).error?.code,
		).toBe("INVALID_OTP");
	});

	it.for(usedCodeStorages)(
		"sends a new code after the previous one expired in %s storage",
		async (storage) => {
			const codes = ["111111", "222222"];
			const sent: string[] = [];
			const { client, testUser } = await getTestInstance(
				{
					...usedCodeStorageOptions(storage),
					plugins: [
						emailOTP({
							expiresIn: 60,
							generateOTP: () => codes.shift(),
							async sendVerificationOTP({ otp }) {
								sent.push(otp);
							},
						}),
					],
				},
				{ clientOptions: { plugins: [emailOTPClient()] } },
			);
			const email = testUser.email;
			vi.useFakeTimers({ toFake: ["Date"] });
			vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
			await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
			vi.setSystemTime(new Date("2026-01-01T00:01:01.000Z"));

			const resent = await client.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});

			expect(resent.error).toBeNull();
			expect(sent).toEqual(["111111", "222222"]);
			expect(
				(await client.signIn.emailOtp({ email, otp: "222222" })).data?.token,
			).toBeDefined();
		},
	);

	it("does not revive a code replaced within the same millisecond with custom ids", async () => {
		const codes = ["111111", "222222"];
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
				...usedCodeStorageOptions("database with custom ids"),
				plugins: [
					emailOTP({
						generateOTP: () => codes.shift(),
						async sendVerificationOTP() {},
						storeOTP: {
							async hash(otp) {
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
			(await client.signIn.emailOtp({ email, otp: "111111" })).error?.code,
		).toBe("INVALID_OTP");
	});

	it("keeps a code stored before attempts were counted in place after a wrong guess", async () => {
		const { client, auth, testUser } = await getTestInstance(
			{
				plugins: [emailOTP({ async sendVerificationOTP() {} })],
			},
			{ clientOptions: { plugins: [emailOTPClient()] } },
		);
		const email = testUser.email;
		const identifier = toOTPIdentifier("sign-in", email);
		// Stored by an earlier version, which may have written it back.
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
		"keeps the newer code when guesses against both codes overlap in %s storage",
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
			const [storedCode, attempts] = splitAtLastColon(stored?.value ?? "");
			expect(storedCode).toBe("stored-222222");
			// Secondary storage counts attempts beside the code instead of in it.
			expect(Number(attempts)).toBe(storage.startsWith("secondary") ? 0 : 1);
			expect(
				(await client.signIn.emailOtp({ email, otp: "111111" })).error?.code,
			).toBe("INVALID_OTP");
			expect(
				(await client.signIn.emailOtp({ email, otp: "222222" })).data?.token,
			).toBeDefined();
		},
	);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11105
 */
describe("email OTP attempts counted in place", () => {
	it.for(usedCodeStorages)(
		"signs in once when the same code is submitted twice at once in %s storage",
		async (storage) => {
			const { client, testUser } = await getTestInstance(
				{
					...usedCodeStorageOptions(storage),
					plugins: [
						emailOTP({
							generateOTP: () => "222222",
							async sendVerificationOTP() {},
							storeOTP: {
								async hash(otp) {
									await new Promise((resolve) => setTimeout(resolve, 5));
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

			const results = await Promise.all([
				client.signIn.emailOtp({ email, otp: "222222" }),
				client.signIn.emailOtp({ email, otp: "222222" }),
			]);

			expect(results.filter((result) => result.data?.token)).toHaveLength(1);
			expect(results.map((result) => result.error?.code ?? null)).toContain(
				"INVALID_OTP",
			);
		},
	);

	it.for(usedCodeStorages)(
		"compares no more than the allowed attempts of a burst of guesses in %s storage",
		async (storage) => {
			let compared = 0;
			const { client, testUser } = await getTestInstance(
				{
					...usedCodeStorageOptions(storage),
					plugins: [
						emailOTP({
							generateOTP: () => "222222",
							async sendVerificationOTP() {},
							allowedAttempts: 3,
							storeOTP: {
								async hash(otp) {
									if (otp !== "222222") {
										compared++;
										await new Promise((resolve) => setTimeout(resolve, 5));
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

			const results = await Promise.all(
				Array.from({ length: 10 }, (_, index) =>
					client.emailOtp.checkVerificationOtp({
						email,
						type: "sign-in",
						otp: `00000${index}`,
					}),
				),
			);

			expect(compared).toBe(3);
			for (const result of results) {
				expect(["INVALID_OTP", "TOO_MANY_ATTEMPTS"]).toContain(
					result.error?.code,
				);
			}
			expect(
				(await client.signIn.emailOtp({ email, otp: "222222" })).data,
			).toBeNull();
		},
	);

	it.for(usedCodeStorages)(
		"keeps the code left by two overlapping sends usable after a typo in %s storage",
		async (storage) => {
			const codes = ["111111", "222222"];
			const sent: string[] = [];
			const { client, auth, testUser } = await getTestInstance(
				{
					...usedCodeStorageOptions(storage),
					plugins: [
						emailOTP({
							generateOTP: () => codes.shift(),
							async sendVerificationOTP({ otp }) {
								sent.push(otp);
							},
						}),
					],
				},
				{ clientOptions: { plugins: [emailOTPClient()] } },
			);
			const email = testUser.email;
			const identifier = toOTPIdentifier("forget-password", email);
			await Promise.all([
				client.emailOtp.sendVerificationOtp({ email, type: "forget-password" }),
				client.emailOtp.sendVerificationOtp({ email, type: "forget-password" }),
			]);
			const stored = await (
				await auth.$context
			).internalAdapter.findVerificationValue(identifier);
			const [otp] = splitAtLastColon(stored?.value ?? "");
			expect(sent).toContain(otp);

			const check = (code: string) =>
				client.emailOtp.checkVerificationOtp({
					email,
					type: "forget-password",
					otp: code,
				});
			expect((await check("000000")).error?.code).toBe("INVALID_OTP");
			expect((await check(otp)).data?.success).toBe(true);
			expect(
				(
					await client.emailOtp.resetPassword({
						email,
						otp,
						password: "new-password-123",
					})
				).data?.success,
			).toBe(true);
			expect(
				await (await auth.$context).internalAdapter.findVerificationValue(
					identifier,
				),
			).toBeNull();
			expect(
				(
					await client.signIn.email({
						email,
						password: "new-password-123",
					})
				).data?.token,
			).toBeDefined();
		},
	);

	it.for(["database", "secondary"] as const)(
		"counts attempts against a code stored without a count in %s storage",
		async (storage) => {
			const { client, auth, testUser } = await getTestInstance(
				{
					...usedCodeStorageOptions(storage),
					plugins: [
						emailOTP({ async sendVerificationOTP() {}, allowedAttempts: 2 }),
					],
				},
				{ clientOptions: { plugins: [emailOTPClient()] } },
			);
			const email = testUser.email;
			await (await auth.$context).internalAdapter.createVerificationValue({
				identifier: toOTPIdentifier("sign-in", email),
				value: "111111",
				expiresAt: new Date(Date.now() + 60_000),
			});
			const check = (otp: string) =>
				client.emailOtp.checkVerificationOtp({
					email,
					type: "sign-in",
					otp,
				});

			expect((await check("000000")).error?.code).toBe("INVALID_OTP");
			expect((await check("111111")).data?.success).toBe(true);
			expect((await check("000000")).error?.code).toBe("INVALID_OTP");
			expect((await check("111111")).error?.code).toBe("TOO_MANY_ATTEMPTS");
		},
	);

	it.for([
		{ storage: "database", resent: "111111" },
		{ storage: "secondary", resent: "222222" },
	] as const)(
		"resends $resent after a wrong guess with the reuse strategy in $storage storage",
		async ({ storage, resent }) => {
			const codes = ["111111", "222222"];
			const sent: string[] = [];
			const { client, testUser } = await getTestInstance(
				{
					...usedCodeStorageOptions(storage),
					plugins: [
						emailOTP({
							resendStrategy: "reuse",
							generateOTP: () => codes.shift(),
							async sendVerificationOTP({ otp }) {
								sent.push(otp);
							},
						}),
					],
				},
				{ clientOptions: { plugins: [emailOTPClient()] } },
			);
			const email = testUser.email;
			await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
			expect(
				(
					await client.emailOtp.checkVerificationOtp({
						email,
						type: "sign-in",
						otp: "000000",
					})
				).error?.code,
			).toBe("INVALID_OTP");

			await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });

			// Secondary storage counts attempts under a key that keeps the
			// original expiry, so a code with counted attempts is not extended.
			expect(sent).toEqual(["111111", resent]);
			expect(
				(await client.signIn.emailOtp({ email, otp: resent })).data?.token,
			).toBeDefined();
		},
	);

	it.for(usedCodeStorages)(
		"accepts a correct last attempt while another guess arrives in %s storage",
		async (storage) => {
			let releaseCheck: () => void = () => {};
			const checkReleased = new Promise<void>((resolve) => {
				releaseCheck = resolve;
			});
			let signalCheck: () => void = () => {};
			const checkStarted = new Promise<void>((resolve) => {
				signalCheck = resolve;
			});
			let holdNext = false;
			const { client, testUser } = await getTestInstance(
				{
					...usedCodeStorageOptions(storage),
					plugins: [
						emailOTP({
							generateOTP: () => "222222",
							async sendVerificationOTP() {},
							allowedAttempts: 2,
							storeOTP: {
								async hash(otp) {
									if (holdNext && otp === "222222") {
										holdNext = false;
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
			expect(
				(
					await client.emailOtp.checkVerificationOtp({
						email,
						type: "sign-in",
						otp: "000000",
					})
				).error?.code,
			).toBe("INVALID_OTP");

			holdNext = true;
			const last = client.signIn.emailOtp({ email, otp: "222222" });
			await checkStarted;
			const extra = await client.signIn.emailOtp({ email, otp: "111111" });
			releaseCheck();

			expect(extra.error?.code).toBe("TOO_MANY_ATTEMPTS");
			expect((await last).data?.token).toBeDefined();
		},
	);

	it.for(["database", "secondary"] as const)(
		"does not return an exhausted code from getVerificationOTP in %s storage",
		async (storage) => {
			const { auth, client, testUser } = await getTestInstance(
				{
					...usedCodeStorageOptions(storage),
					plugins: [
						emailOTP({
							generateOTP: () => "222222",
							async sendVerificationOTP() {},
							allowedAttempts: 1,
						}),
					],
				},
				{ clientOptions: { plugins: [emailOTPClient()] } },
			);
			const email = testUser.email;
			await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
			const readStoredOtp = () =>
				auth.api.getVerificationOTP({ query: { email, type: "sign-in" } });
			expect((await readStoredOtp()).otp).toBe("222222");

			await client.signIn.emailOtp({ email, otp: "000000" });

			expect((await readStoredOtp()).otp).toBeNull();
		},
	);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/11105
 */
describe("email OTP resent while it is verified", () => {
	it("keeps a code sent while a correct guess against the previous one is compared in secondary storage", async () => {
		const codes = ["111111", "222222"];
		let holdNext = false;
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
				...usedCodeStorageOptions("secondary"),
				plugins: [
					emailOTP({
						generateOTP: () => codes.shift(),
						async sendVerificationOTP() {},
						storeOTP: {
							async hash(otp) {
								if (holdNext && otp === "111111") {
									holdNext = false;
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

		holdNext = true;
		const older = client.signIn.emailOtp({ email, otp: "111111" });
		await checkStarted;
		await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
		releaseCheck();

		expect((await older).error?.code).toBe("INVALID_OTP");
		expect(
			(await client.signIn.emailOtp({ email, otp: "222222" })).data?.token,
		).toBeDefined();
	});

	it.for(
		usedCodeStorages.filter((storage) => !storage.startsWith("secondary")),
	)(
		"accepts a correct guess while a reuse resend extends the code in %s storage",
		async (storage) => {
			let resendDuringClaim = false;
			let resend: () => Promise<unknown> = async () => {};
			const { client, testUser } = await getTestInstance(
				{
					...usedCodeStorageOptions(storage),
					databaseHooks: {
						verification: {
							update: {
								// Runs right before the attempt is counted.
								async before(data) {
									if (!resendDuringClaim || !("value" in data)) return;
									resendDuringClaim = false;
									await resend();
								},
							},
						},
					},
					plugins: [
						emailOTP({
							resendStrategy: "reuse",
							generateOTP: () => "222222",
							async sendVerificationOTP() {},
						}),
					],
				},
				{ clientOptions: { plugins: [emailOTPClient()] } },
			);
			const email = testUser.email;
			resend = () =>
				client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
			await resend();

			resendDuringClaim = true;
			const signIn = await client.signIn.emailOtp({ email, otp: "222222" });

			expect(resendDuringClaim).toBe(false);
			expect(signIn.data?.token).toBeDefined();
		},
	);

	it("sends a new code when a guess is counted while a reuse resend extends the code in secondary storage", async () => {
		const codes = ["111111", "222222"];
		const sent: string[] = [];
		let guessDuringExtension = false;
		let guess: () => Promise<unknown> = async () => {};
		const { client, testUser } = await getTestInstance(
			{
				...usedCodeStorageOptions("secondary"),
				databaseHooks: {
					verification: {
						update: {
							// Runs after the reuse check, before the expiry is extended.
							async before() {
								if (!guessDuringExtension) return;
								guessDuringExtension = false;
								await guess();
							},
						},
					},
				},
				plugins: [
					emailOTP({
						resendStrategy: "reuse",
						generateOTP: () => codes.shift(),
						async sendVerificationOTP({ otp }) {
							sent.push(otp);
						},
					}),
				],
			},
			{ clientOptions: { plugins: [emailOTPClient()] } },
		);
		const email = testUser.email;
		guess = () => client.signIn.emailOtp({ email, otp: "000000" });
		await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });

		guessDuringExtension = true;
		await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });

		// The counted guess keeps the first code's original expiry, so it is
		// not extended.
		expect(sent).toEqual(["111111", "222222"]);
		expect(
			(await client.signIn.emailOtp({ email, otp: "222222" })).data?.token,
		).toBeDefined();
	});

	/**
	 * Secondary storage has no conditional delete, so a code stored between
	 * the consume's last read and its `getAndDelete` is removed with the old
	 * one. This pins that limit until storage offers a compare-and-delete.
	 */
	it("drops a code sent between the last read and the consume in secondary storage", async () => {
		const codes = ["111111", "222222"];
		const storage = createSecondaryStorage();
		const getAndDelete = storage.getAndDelete;
		let sendBeforeConsume: (() => Promise<unknown>) | undefined;
		storage.getAndDelete = async (key) => {
			const send = sendBeforeConsume;
			sendBeforeConsume = undefined;
			await send?.();
			return getAndDelete(key);
		};
		const { client, testUser } = await getTestInstance(
			{
				secondaryStorage: storage,
				plugins: [
					emailOTP({
						generateOTP: () => codes.shift(),
						async sendVerificationOTP() {},
					}),
				],
			},
			{ clientOptions: { plugins: [emailOTPClient()] } },
		);
		const email = testUser.email;
		await client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });

		sendBeforeConsume = () =>
			client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
		const older = await client.signIn.emailOtp({ email, otp: "111111" });

		expect(codes).toHaveLength(0);
		expect(older.error?.code).toBe("INVALID_OTP");
		expect(
			(await client.signIn.emailOtp({ email, otp: "222222" })).error?.code,
		).toBe("INVALID_OTP");
	});
});
