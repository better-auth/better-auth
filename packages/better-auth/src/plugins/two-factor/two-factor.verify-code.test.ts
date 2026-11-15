import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it } from "vitest";
import { symmetricDecrypt } from "../../crypto";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { getTestInstance } from "../../test-utils/test-instance";
import type { User } from "../../types";
import { DEFAULT_SECRET } from "../../utils/constants";
import { TWO_FACTOR_ERROR_CODES, twoFactor } from ".";
import type { TwoFactorOptions, TwoFactorTable } from "./types";

async function setup(options?: Pick<TwoFactorOptions, "accountLockout">) {
	const { auth, signInWithTestUser, testUser, db, customFetchImpl } =
		await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor(options)],
		});
	const { headers } = await signInWithTestUser();
	const dbUser = await db.findOne<User>({
		model: "user",
		where: [{ field: "email", value: testUser.email }],
	});
	const userId = dbUser!.id;
	const enrollment = await auth.api.enableTwoFactor({
		body: { password: testUser.password },
		headers,
	});
	if (enrollment.method !== "totp") {
		throw new Error("expected totp enrollment");
	}
	const findRow = () =>
		db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});
	const secret = await symmetricDecrypt({
		key: DEFAULT_SECRET,
		data: (await findRow())!.secret,
	});
	await auth.api.verifyTOTP({
		body: { code: await createOTP(secret).totp() },
		headers,
	});

	async function startChallenge() {
		const signIn = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		return convertSetCookieToCookie(signIn.headers);
	}
	async function verifyTotpWithCookie(code: string) {
		return auth.api.verifyTOTP({
			body: { code },
			headers: await startChallenge(),
			asResponse: true,
		});
	}

	return {
		auth,
		db,
		userId,
		testUser,
		customFetchImpl,
		backupCodes: enrollment.backupCodes,
		findRow,
		correctTotp: () => createOTP(secret).totp(),
		verifyTotpWithCookie,
	};
}

async function errorCodeOf(promise: Promise<unknown>) {
	const error = await promise.then(
		() => null,
		(error: unknown) => error,
	);
	expect(error).not.toBeNull();
	return (error as { body?: { code?: string } }).body?.code;
}

describe("two-factor: verifyTwoFactorCode", () => {
	it("verifies a valid TOTP code without creating a session or setting a cookie", async () => {
		const { auth, db, userId, correctTotp } = await setup();
		const sessionsBefore = await db.count({
			model: "session",
			where: [{ field: "userId", value: userId }],
		});
		const response = await auth.api.verifyTwoFactorCode({
			body: { userId, code: await correctTotp(), method: "totp" },
			asResponse: true,
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: true });
		expect(response.headers.get("set-cookie")).toBeNull();
		const sessionsAfter = await db.count({
			model: "session",
			where: [{ field: "userId", value: userId }],
		});
		expect(sessionsAfter).toBe(sessionsBefore);
	});

	it("rejects an invalid TOTP code and counts it toward the shared lockout budget", async () => {
		const { auth, userId, findRow } = await setup();
		const code = await errorCodeOf(
			auth.api.verifyTwoFactorCode({
				body: { userId, code: "000000", method: "totp" },
			}),
		);
		expect(code).toBe(TWO_FACTOR_ERROR_CODES.INVALID_CODE.code);
		expect((await findRow())?.failedVerificationCount).toBe(1);
	});

	it("resets the shared failure count after a valid code", async () => {
		const { auth, userId, findRow, correctTotp } = await setup();
		await auth.api
			.verifyTwoFactorCode({
				body: { userId, code: "000000", method: "totp" },
			})
			.catch(() => {});
		await auth.api.verifyTwoFactorCode({
			body: { userId, code: await correctTotp(), method: "totp" },
		});
		expect((await findRow())?.failedVerificationCount).toBe(0);
	});

	it("locks the cookie-based verifiers once its failures reach the limit", async () => {
		const { auth, userId, correctTotp, verifyTotpWithCookie } = await setup({
			accountLockout: { maxFailedAttempts: 3 },
		});
		for (let i = 0; i < 3; i++) {
			await auth.api
				.verifyTwoFactorCode({
					body: { userId, code: "000000", method: "totp" },
				})
				.catch(() => {});
		}
		const cookieResponse = await verifyTotpWithCookie(await correctTotp());
		expect(cookieResponse.status).toBe(429);
		const code = await errorCodeOf(
			auth.api.verifyTwoFactorCode({
				body: { userId, code: await correctTotp(), method: "totp" },
			}),
		);
		expect(code).toBe(TWO_FACTOR_ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED.code);
	});

	it("is locked by failures on the cookie-based verifiers", async () => {
		const { auth, userId, correctTotp, verifyTotpWithCookie } = await setup({
			accountLockout: { maxFailedAttempts: 3 },
		});
		for (let i = 0; i < 3; i++) {
			expect((await verifyTotpWithCookie("000000")).status).toBe(401);
		}
		const code = await errorCodeOf(
			auth.api.verifyTwoFactorCode({
				body: { userId, code: await correctTotp(), method: "totp" },
			}),
		);
		expect(code).toBe(TWO_FACTOR_ERROR_CODES.ACCOUNT_TEMPORARILY_LOCKED.code);
	});

	it("consumes a backup code once", async () => {
		const { auth, userId, backupCodes, findRow } = await setup();
		const backupCode = backupCodes[0]!;
		await expect(
			auth.api.verifyTwoFactorCode({
				body: { userId, code: backupCode, method: "backup_code" },
			}),
		).resolves.toEqual({ status: true });
		const remaining = await auth.api.viewBackupCodes({ body: { userId } });
		expect(remaining.backupCodes).not.toContain(backupCode);
		expect(remaining.backupCodes).toHaveLength(backupCodes.length - 1);

		const code = await errorCodeOf(
			auth.api.verifyTwoFactorCode({
				body: { userId, code: backupCode, method: "backup_code" },
			}),
		);
		expect(code).toBe(TWO_FACTOR_ERROR_CODES.INVALID_BACKUP_CODE.code);
		expect((await findRow())?.failedVerificationCount).toBe(1);
	});

	/** @see https://cwe.mitre.org/data/definitions/362.html */
	it("lets only one concurrent request consume the same backup code", async () => {
		const { auth, userId, backupCodes } = await setup();
		const results = await Promise.allSettled(
			[0, 1].map(() =>
				auth.api.verifyTwoFactorCode({
					body: { userId, code: backupCodes[0]!, method: "backup_code" },
				}),
			),
		);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
	});

	it("rejects a user without two-factor enabled", async () => {
		const { auth, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor()],
		});
		const user = await db.findOne<User>({ model: "user", where: [] });
		for (const method of ["totp", "backup_code"] as const) {
			const code = await errorCodeOf(
				auth.api.verifyTwoFactorCode({
					body: { userId: user!.id, code: "000000", method },
				}),
			);
			expect(code).toBe(TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED.code);
		}
	});

	it("rejects an unknown user the same way as a user without two-factor", async () => {
		const { auth } = await setup();
		const code = await errorCodeOf(
			auth.api.verifyTwoFactorCode({
				body: { userId: "missing-user", code: "000000", method: "totp" },
			}),
		);
		expect(code).toBe(TWO_FACTOR_ERROR_CODES.TWO_FACTOR_NOT_ENABLED.code);
	});

	it("is not reachable over HTTP", async () => {
		const { auth, customFetchImpl, userId, correctTotp } = await setup();
		expect(auth.api.verifyTwoFactorCode.path).toBeUndefined();
		const response = await customFetchImpl(
			"http://localhost:3000/api/auth/two-factor/verify-code",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					userId,
					code: await correctTotp(),
					method: "totp",
				}),
			},
		);
		expect(response.status).toBe(404);
	});
});
