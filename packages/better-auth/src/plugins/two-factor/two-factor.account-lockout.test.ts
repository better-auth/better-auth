import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import type { DBAdapter } from "@better-auth/core/db/adapter";
import { createAdapterFactory } from "@better-auth/core/db/adapter";
import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it } from "vitest";
import { memoryAdapter } from "../../adapters/memory-adapter";
import { symmetricDecrypt } from "../../crypto";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { getTestInstance } from "../../test-utils/test-instance";
import type { User } from "../../types";
import { DEFAULT_SECRET } from "../../utils/constants";
import { TWO_FACTOR_ERROR_CODES, twoFactor } from ".";
import type { TwoFactorOptions, TwoFactorTable } from "./types";
import { recordTwoFactorFailure } from "./verify-two-factor";

/**
 * Account-level lockout caps consecutive failed second-factor verifications per
 * account (NIST SP 800-63B §5.2.2). The cap applies across sign-in challenges
 * and across factors (TOTP, email-OTP, backup codes), and resets on a
 * successful verification.
 */

function createDbWithoutAtomicMethods() {
	const database = memoryAdapter({
		user: [],
		session: [],
		account: [],
		verification: [],
		twoFactor: [],
	});
	return (options: BetterAuthOptions) => {
		const native = database(options);
		return createAdapterFactory({
			config: { adapterId: "legacy-memory" },
			adapter: () => ({
				create: ({ model, data }) =>
					native.create({ model, data, forceAllowId: true }),
				findOne: ({ model, where, select }) =>
					native.findOne({ model, where, select }),
				findMany: async <T>({
					model,
					where,
					limit,
					offset,
					sortBy,
					select,
				}: Parameters<DBAdapter["findMany"]>[0]) =>
					(await native.findMany({
						model,
						where,
						limit,
						offset,
						sortBy,
						select,
					})) as T[],
				update: ({ model, where, update }) =>
					native.update({
						model,
						where,
						update: update as Record<string, unknown>,
					}),
				updateMany: native.updateMany,
				delete: native.delete,
				deleteMany: native.deleteMany,
				count: native.count,
			}),
		})(options);
	};
}

async function setup(
	accountLockout?: TwoFactorOptions["accountLockout"],
	database?: BetterAuthOptions["database"],
) {
	let otp = "";
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		...(database ? { database } : {}),
		plugins: [
			twoFactor({
				accountLockout,
				otpOptions: {
					sendOTP: async (data) => {
						otp = data.otp;
					},
				},
			}),
		],
	});
	const { headers } = await signInWithTestUser();
	const dbUser = await db.findOne<User>({
		model: "user",
		where: [{ field: "email", value: testUser.email }],
	});
	const userId = dbUser?.id as string;
	const enrollment = await auth.api.enableTwoFactor({
		body: { password: testUser.password },
		headers,
	});
	if (enrollment.method !== "totp") {
		throw new Error("expected totp enrollment");
	}
	const row = await db.findOne<TwoFactorTable>({
		model: "twoFactor",
		where: [{ field: "userId", value: userId }],
	});
	const secret = await symmetricDecrypt({
		key: DEFAULT_SECRET,
		data: row!.secret,
	});
	await auth.api.verifyTOTP({
		body: { code: await createOTP(secret).totp() },
		headers,
	});

	async function startChallenge(): Promise<Headers> {
		const signIn = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		expect(signIn.status).toBe(200);
		return convertSetCookieToCookie(signIn.headers);
	}
	function verifyTotp(challengeHeaders: Headers, code: string) {
		return auth.api.verifyTOTP({
			body: { code },
			headers: challengeHeaders,
			asResponse: true,
		});
	}
	function verifyBackup(challengeHeaders: Headers, code: string) {
		return auth.api.verifyBackupCode({
			body: { code },
			headers: challengeHeaders,
			asResponse: true,
		});
	}
	function correctTotp() {
		return createOTP(secret).totp();
	}
	async function failOtpOnce(): Promise<Response> {
		const challengeHeaders = await startChallenge();
		await auth.api.sendTwoFactorOTP({ body: {}, headers: challengeHeaders });
		return auth.api.verifyTwoFactorOTP({
			body: { code: "000000" },
			headers: challengeHeaders,
			asResponse: true,
		});
	}

	return {
		auth,
		db,
		userId,
		backupCodes: enrollment.backupCodes,
		startChallenge,
		verifyTotp,
		verifyBackup,
		correctTotp,
		failOtpOnce,
		getOtp: () => otp,
	};
}

describe("two-factor: account-level lockout across challenges", () => {
	/** @see https://cwe.mitre.org/data/definitions/307.html */
	it("enforces account lockout through legacy adapter fallbacks", async () => {
		const { startChallenge, verifyBackup, backupCodes } = await setup(
			{ maxFailedAttempts: 3 },
			createDbWithoutAtomicMethods(),
		);
		const challenges = await Promise.all(
			Array.from({ length: 3 }, () => startChallenge()),
		);
		const failures = await Promise.all(
			challenges.map((headers) => verifyBackup(headers, "0000-0000")),
		);
		expect(failures.map((response) => response.status)).toEqual([
			401, 401, 401,
		]);
		expect(
			(await verifyBackup(await startChallenge(), backupCodes[0]!)).status,
		).toBe(429);
	});
	/** @see https://cwe.mitre.org/data/definitions/362.html */
	it("consumes an email OTP once through legacy adapter fallbacks", async () => {
		const { auth, startChallenge, getOtp } = await setup(
			undefined,
			createDbWithoutAtomicMethods(),
		);
		const headers = await startChallenge();
		await auth.api.sendTwoFactorOTP({ body: {}, headers });
		const code = getOtp();
		expect(code).toMatch(/^\d{6}$/);
		const responses = await Promise.all(
			[0, 1].map(() =>
				auth.api.verifyTwoFactorOTP({
					body: { code },
					headers,
					asResponse: true,
				}),
			),
		);
		expect(
			responses.filter((response) => response.status === 200),
		).toHaveLength(1);
		expect(
			responses.filter(
				(response) => response.status >= 400 && response.status < 500,
			),
		).toHaveLength(1);
	});
	/** @see https://cwe.mitre.org/data/definitions/362.html */
	it("allows a backup code to be consumed once through legacy adapter fallbacks", async () => {
		const { startChallenge, verifyBackup, backupCodes } = await setup(
			undefined,
			createDbWithoutAtomicMethods(),
		);
		const challenges = await Promise.all([startChallenge(), startChallenge()]);
		const responses = await Promise.all(
			challenges.map((headers) => verifyBackup(headers, backupCodes[0]!)),
		);
		expect(responses.map((response) => response.status).sort()).toEqual([
			200, 409,
		]);
	});
	it("locks the account after failures accumulate across separate challenges", async () => {
		const { startChallenge, verifyTotp, correctTotp } = await setup({
			maxFailedAttempts: 3,
		});

		// One wrong guess per fresh challenge: the per-challenge cap (5) never
		// trips, but the account counter accumulates.
		for (let i = 0; i < 3; i++) {
			const res = await verifyTotp(await startChallenge(), "000000");
			expect(res.status).toBe(401);
			const json = (await res.json()) as { message: string };
			expect(json.message).toBe(TWO_FACTOR_ERROR_CODES.INVALID_CODE.message);
		}

		// The account is now locked: even the correct code on a brand-new
		// challenge is rejected.
		const locked = await verifyTotp(
			await startChallenge(),
			await correctTotp(),
		);
		expect(locked.status).toBe(429);
		const lockedJson = (await locked.json()) as { message: string };
		expect(lockedJson.message).toBe(
			TWO_FACTOR_ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED.message,
		);
	});

	it("counts failures from all factors toward one account lock", async () => {
		const { startChallenge, verifyTotp, verifyBackup, correctTotp } =
			await setup({ maxFailedAttempts: 3 });

		// Two wrong TOTP guesses plus one wrong backup code reach the ceiling.
		for (let i = 0; i < 2; i++) {
			const res = await verifyTotp(await startChallenge(), "000000");
			expect(res.status).toBe(401);
		}
		const backupRes = await verifyBackup(await startChallenge(), "0000-0000");
		expect(backupRes.status).toBe(401);

		const locked = await verifyTotp(
			await startChallenge(),
			await correctTotp(),
		);
		expect(locked.status).toBe(429);
		const lockedJson = (await locked.json()) as { message: string };
		expect(lockedJson.message).toBe(
			TWO_FACTOR_ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED.message,
		);
	});

	it("counts email-OTP failures toward the same account lock", async () => {
		const { startChallenge, verifyTotp, failOtpOnce, correctTotp } =
			await setup({ maxFailedAttempts: 3 });

		// Two wrong TOTP guesses plus one wrong email-OTP reach the ceiling, so a
		// locked TOTP cannot be sidestepped by switching factor.
		for (let i = 0; i < 2; i++) {
			expect((await verifyTotp(await startChallenge(), "000000")).status).toBe(
				401,
			);
		}
		expect((await failOtpOnce()).status).toBe(401);

		const locked = await verifyTotp(
			await startChallenge(),
			await correctTotp(),
		);
		expect(locked.status).toBe(429);
	});

	it("resets the counter on a successful verification", async () => {
		const { startChallenge, verifyTotp, correctTotp } = await setup({
			maxFailedAttempts: 3,
		});

		// Two failures, then a success that resets the counter.
		for (let i = 0; i < 2; i++) {
			expect((await verifyTotp(await startChallenge(), "000000")).status).toBe(
				401,
			);
		}
		const ok = await verifyTotp(await startChallenge(), await correctTotp());
		expect(ok.status).toBe(200);

		// Two more failures must not lock: the counter restarted from zero, so the
		// running total is 2, not 4.
		for (let i = 0; i < 2; i++) {
			expect((await verifyTotp(await startChallenge(), "000000")).status).toBe(
				401,
			);
		}
		const stillOpen = await verifyTotp(
			await startChallenge(),
			await correctTotp(),
		);
		expect(stillOpen.status).toBe(200);
	});

	it("releases the lock once its window elapses", async () => {
		const { db, userId, startChallenge, verifyTotp, correctTotp } = await setup(
			{
				maxFailedAttempts: 3,
			},
		);

		for (let i = 0; i < 3; i++) {
			expect((await verifyTotp(await startChallenge(), "000000")).status).toBe(
				401,
			);
		}
		expect(
			(await verifyTotp(await startChallenge(), await correctTotp())).status,
		).toBe(429);

		// Move the lock deadline into the past to simulate the window elapsing
		// without a timing-dependent wait.
		await db.update({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
			update: { lockedUntil: new Date(Date.now() - 1000) },
		});

		const released = await verifyTotp(
			await startChallenge(),
			await correctTotp(),
		);
		expect(released.status).toBe(200);
	});

	it("does not lock when account lockout is disabled", async () => {
		const { startChallenge, verifyTotp, correctTotp } = await setup({
			enabled: false,
			maxFailedAttempts: 3,
		});

		for (let i = 0; i < 5; i++) {
			expect((await verifyTotp(await startChallenge(), "000000")).status).toBe(
				401,
			);
		}
		const ok = await verifyTotp(await startChallenge(), await correctTotp());
		expect(ok.status).toBe(200);
	});

	it("counts a row with no prior failure count without locking on the first failure", async () => {
		const { db, userId, startChallenge, verifyTotp, correctTotp } = await setup(
			{
				maxFailedAttempts: 3,
			},
		);
		// A row upgraded in place may have no counter value yet; the first failure
		// must register as one attempt, not be read as an already-reached ceiling.
		await db.update({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
			update: { failedVerificationCount: null },
		});

		expect((await verifyTotp(await startChallenge(), "000000")).status).toBe(
			401,
		);
		const ok = await verifyTotp(await startChallenge(), await correctTotp());
		expect(ok.status).toBe(200);
	});

	it("sets the lock with a guarded counter transition", async () => {
		type IncrementOneCall = Parameters<DBAdapter["incrementOne"]>[0];
		const calls: IncrementOneCall[] = [];
		const twoFactorRow: TwoFactorTable = {
			id: "two-factor-id",
			userId: "user-id",
			secret: "secret",
			backupCodes: "codes",
			verified: true,
			failedVerificationCount: 2,
			lockedUntil: null,
		};
		const incrementOne: DBAdapter["incrementOne"] = async <T>(
			data: IncrementOneCall,
		): Promise<T | null> => {
			calls.push(data);
			if (calls.length === 1) {
				return {
					...twoFactorRow,
					failedVerificationCount: 3,
				} as T;
			}
			return null;
		};
		const ctx = {
			context: {
				getPlugin: () => ({
					options: {
						accountLockout: {
							maxFailedAttempts: 3,
							durationSeconds: 60,
						},
					},
				}),
				adapter: {
					incrementOne,
				},
			},
		} as unknown as GenericEndpointContext;

		await recordTwoFactorFailure(ctx, "twoFactor", twoFactorRow);

		expect(calls).toHaveLength(2);
		expect(calls[1]).toMatchObject({
			model: "twoFactor",
			where: [
				{ field: "id", value: "two-factor-id" },
				{
					field: "failedVerificationCount",
					operator: "gte",
					value: 3,
				},
			],
			increment: {},
			set: {
				lockedUntil: expect.any(Date),
			},
		});
	});
});
