import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it } from "vitest";
import { symmetricDecrypt } from "../../crypto";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { getTestInstance } from "../../test-utils/test-instance";
import type { User } from "../../types";
import { DEFAULT_SECRET } from "../../utils/constants";
import { TWO_FACTOR_ERROR_CODES, twoFactor } from ".";
import { DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS } from "./constant";
import type { TwoFactorTable } from "./types";

/**
 * A single 2FA sign-in challenge must grant only a bounded number of guesses.
 * `verify-otp` already consumes its code row and caps attempts; `verify-totp`
 * and `verify-backup-code` had no per-challenge cap, so one live challenge could
 * absorb unlimited guesses against the TOTP code space (or the backup-code set)
 * for the full challenge TTL.
 */

async function setupTwoFactorChallenge() {
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [twoFactor()],
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
	if (!enrollment.totpURI) {
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

	return { auth, secret, backupCodes: enrollment.backupCodes, startChallenge };
}

describe("two-factor security: TOTP enforces a per-challenge attempt cap", async () => {
	const { auth, secret, startChallenge } = await setupTwoFactorChallenge();

	function verifyTotp(challengeHeaders: Headers, code: string) {
		return auth.api.verifyTOTP({
			body: { code },
			headers: challengeHeaders,
			asResponse: true,
		});
	}

	it("locks out after the limit and cancels the challenge", async () => {
		const challengeHeaders = await startChallenge();

		for (let i = 0; i < DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS; i++) {
			const res = await verifyTotp(challengeHeaders, "000000");
			expect(res.status).toBe(401);
			const json = (await res.json()) as { message: string };
			expect(json.message).toBe(TWO_FACTOR_ERROR_CODES.INVALID_CODE.message);
		}

		// Budget spent: even the correct code is locked out.
		const locked = await verifyTotp(
			challengeHeaders,
			await createOTP(secret).totp(),
		);
		expect(locked.status).toBe(400);
		const lockedJson = (await locked.json()) as { message: string };
		expect(lockedJson.message).toBe(
			TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE.message,
		);

		// Lockout cancels the challenge itself, so a further attempt is no longer
		// a code check but an invalid (consumed) cookie.
		const afterLockout = await verifyTotp(challengeHeaders, "000000");
		expect(afterLockout.status).toBe(401);
		const afterJson = (await afterLockout.json()) as { message: string };
		expect(afterJson.message).toBe(
			TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE.message,
		);
	});
});

describe("two-factor security: backup codes enforce a per-challenge attempt cap", async () => {
	const { auth, backupCodes, startChallenge } = await setupTwoFactorChallenge();
	const backupCode = backupCodes?.[0];
	if (!backupCode) {
		throw new Error("expected backup codes from enrollment");
	}

	function verifyBackup(challengeHeaders: Headers, code: string) {
		return auth.api.verifyBackupCode({
			body: { code },
			headers: challengeHeaders,
			asResponse: true,
		});
	}

	it("counts wrong backup codes up to the limit then locks out", async () => {
		const challengeHeaders = await startChallenge();

		for (let i = 0; i < DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS; i++) {
			const res = await verifyBackup(challengeHeaders, "0000-0000");
			expect(res.status).toBe(401);
			const json = (await res.json()) as { message: string };
			expect(json.message).toBe(
				TWO_FACTOR_ERROR_CODES.INVALID_BACKUP_CODE.message,
			);
		}

		// Budget spent: even a real backup code is locked out.
		const locked = await verifyBackup(challengeHeaders, backupCode);
		expect(locked.status).toBe(400);
		const lockedJson = (await locked.json()) as { message: string };
		expect(lockedJson.message).toBe(
			TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE.message,
		);
	});
});
