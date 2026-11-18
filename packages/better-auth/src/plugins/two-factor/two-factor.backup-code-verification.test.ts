import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it, vi } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { symmetricDecrypt } from "../../crypto";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { getTestInstance } from "../../test-utils/test-instance";
import type { Verification } from "../../types";
import { DEFAULT_SECRET } from "../../utils/constants";
import { twoFactor } from ".";
import type { BackupCodeOptions } from "./backup-codes";
import { DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS } from "./constant";
import type { TwoFactorOptions, TwoFactorTable } from "./types";

async function setup(accountLockout?: TwoFactorOptions["accountLockout"]) {
	const verify = vi.fn<NonNullable<BackupCodeOptions["verify"]>>(
		() => undefined,
	);
	const { auth, db, testUser, signInWithTestUser } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [
			twoFactor({
				accountLockout,
				backupCodeOptions: { amount: 1, verify },
			}),
		],
	});
	const { headers, user } = await signInWithTestUser();
	const enrollment = await auth.api.enableTwoFactor({
		body: { password: testUser.password },
		headers,
	});
	if (enrollment.method !== "totp") throw new Error("Expected TOTP enrollment");
	const backupCode = enrollment.backupCodes[0]!;

	async function readRow() {
		const row = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
		});
		if (!row) throw new Error("Expected two-factor record");
		return row;
	}
	async function updateRow(update: Partial<TwoFactorTable>) {
		await db.update({
			model: "twoFactor",
			where: [{ field: "userId", value: user.id }],
			update,
		});
	}
	const secret = await symmetricDecrypt({
		key: DEFAULT_SECRET,
		data: (await readRow()).secret,
	});
	const response = await auth.api.verifyTOTP({
		body: { code: await createOTP(secret).totp() },
		headers,
		asResponse: true,
	});
	expect(response.status).toBe(200);
	const sessionHeaders = convertSetCookieToCookie(response.headers);

	async function startChallenge() {
		const response = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		expect(await response.json()).toMatchObject({ twoFactorRedirect: true });
		return convertSetCookieToCookie(response.headers);
	}
	function verifyCode(headers: Headers, code: string, trustDevice = false) {
		return auth.api.verifyBackupCode({
			body: { code, trustDevice },
			headers,
			asResponse: true,
		});
	}
	return {
		auth,
		db,
		user,
		verify,
		readRow,
		updateRow,
		startChallenge,
		verifyCode,
		backupCode,
		sessionHeaders,
	};
}

describe("custom backup-code verification", () => {
	it("passes the trusted user, stored record and context, then completes sign-in", async () => {
		const {
			user,
			verify,
			startChallenge,
			updateRow,
			readRow,
			verifyCode,
			auth,
		} = await setup();
		verify.mockResolvedValue(true);
		const headers = await startChallenge();
		headers.set("x-verifier-test", "request-context");
		// External verification must not try to decrypt local backup codes.
		await updateRow({ backupCodes: "external", failedVerificationCount: 2 });
		const row = await readRow();
		const response = await verifyCode(headers, "external-code", true);
		expect(response.status).toBe(200);
		const [data, ctx] = verify.mock.calls[0]!;
		expect(data).toEqual({
			code: "external-code",
			user: expect.objectContaining({ id: user.id }),
			twoFactor: row,
		});
		expect(ctx.headers?.get("x-verifier-test")).toBe("request-context");
		const session = await auth.api.getSession({
			headers: convertSetCookieToCookie(response.headers),
		});
		expect(session?.user.id).toBe(user.id);
		expect(
			parseSetCookieHeader(response.headers.get("set-cookie") || "").get(
				"better-auth.trust_device",
			)?.value,
		).toBeTruthy();
		expect(await readRow()).toMatchObject({
			backupCodes: row.backupCodes,
			failedVerificationCount: 0,
		});
		expect((await verifyCode(headers, "external-code")).status).toBe(401);
		expect(verify).toHaveBeenCalledTimes(1);
	});

	it("rejects false without falling back to a valid local code", async () => {
		const { verify, startChallenge, verifyCode, backupCode, readRow, auth } =
			await setup();
		verify.mockReturnValue(false);
		const headers = await startChallenge();
		const backupCodes = (await readRow()).backupCodes;
		const response = await verifyCode(headers, backupCode);
		expect(response.status).toBe(401);
		expect(await readRow()).toMatchObject({
			backupCodes,
			failedVerificationCount: 1,
		});
		expect(
			await auth.api.getSession({
				headers: convertSetCookieToCookie(response.headers),
			}),
		).toBeNull();
	});

	it("verifies and consumes a local code when the callback returns undefined", async () => {
		const { verifyCode, startChallenge, backupCode, verify } = await setup();
		expect((await verifyCode(await startChallenge(), backupCode)).status).toBe(
			200,
		);
		expect((await verifyCode(await startChallenge(), backupCode)).status).toBe(
			401,
		);
		expect(verify).toHaveBeenCalledTimes(2);
	});

	it("propagates service errors without fallback or changing the remaining attempts", async () => {
		const { verify, startChallenge, verifyCode, backupCode, readRow } =
			await setup();
		const headers = await startChallenge();
		verify.mockReturnValue(false);
		for (let i = 0; i < DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS - 1; i++) {
			expect((await verifyCode(headers, backupCode)).status).toBe(401);
		}
		verify.mockRejectedValue(new Error("Verifier unavailable"));
		await expect(verifyCode(headers, backupCode)).rejects.toThrow(
			"Verifier unavailable",
		);
		expect((await readRow()).failedVerificationCount).toBe(
			DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS - 1,
		);
		// The error must neither spend the last attempt nor reset the budget.
		verify.mockReturnValue(false);
		expect((await verifyCode(headers, backupCode)).status).toBe(401);
		verify.mockReturnValue(true);
		expect((await verifyCode(headers, backupCode)).status).toBe(400);
	});

	it("enforces the challenge attempt limit before calling the verifier", async () => {
		const { verify, startChallenge, verifyCode } = await setup({
			enabled: false,
		});
		verify.mockReturnValue(false);
		const headers = await startChallenge();
		for (let i = 0; i < DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS; i++) {
			expect((await verifyCode(headers, "wrong-code")).status).toBe(401);
		}
		verify.mockReturnValue(true);
		expect((await verifyCode(headers, "correct-code")).status).toBe(400);
		expect(verify).toHaveBeenCalledTimes(DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS);
	});

	it("rejects a challenge that expires during external verification", async () => {
		const { verify, startChallenge, db, user, verifyCode } = await setup();
		const headers = await startChallenge();
		const challenge = await db.findOne<Verification>({
			model: "verification",
			where: [{ field: "value", value: user.id }],
		});
		expect(challenge).not.toBeNull();
		const countSessions = () =>
			db.count({
				model: "session",
				where: [{ field: "userId", value: user.id }],
			});
		const sessionsBefore = await countSessions();
		verify.mockImplementation(async () => {
			await db.update({
				model: "verification",
				where: [{ field: "id", value: challenge!.id }],
				update: { expiresAt: new Date(Date.now() - 60_000) },
			});
			return true;
		});
		const response = await verifyCode(headers, "external-code");
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({
			code: "INVALID_TWO_FACTOR_COOKIE",
		});
		expect(verify).toHaveBeenCalledTimes(1);
		expect(await countSessions()).toBe(sessionsBefore);
	});

	it.each([
		["missing challenge", 401],
		["missing record", 400],
		["locked account", 429],
	] as const)(
		"does not call the verifier for a %s",
		async (condition, status) => {
			const { verify, startChallenge, db, user, updateRow, verifyCode } =
				await setup();
			verify.mockReturnValue(true);
			const headers =
				condition === "missing challenge"
					? new Headers()
					: await startChallenge();
			if (condition === "missing record") {
				await db.delete({
					model: "twoFactor",
					where: [{ field: "userId", value: user.id }],
				});
			} else if (condition === "locked account") {
				await updateRow({ lockedUntil: new Date(Date.now() + 60_000) });
			}
			expect((await verifyCode(headers, "external-code")).status).toBe(status);
			expect(verify).not.toHaveBeenCalled();
		},
	);

	it("supports re-verification with an authenticated session", async () => {
		const { verify, auth, sessionHeaders, verifyCode, user } = await setup();
		verify.mockReturnValue(true);
		const session = await auth.api.getSession({ headers: sessionHeaders });
		const response = await verifyCode(sessionHeaders, "external-code");
		expect(await response.json()).toMatchObject({
			token: session?.session.token,
			user: { id: user.id },
		});
		expect(verify).toHaveBeenCalledTimes(1);
	});

	it("honors disableSession when the callback succeeds", async () => {
		const { verify, auth, startChallenge, user } = await setup();
		verify.mockReturnValue(true);
		const response = await auth.api.verifyBackupCode({
			body: { code: "external-code", disableSession: true },
			headers: await startChallenge(),
			asResponse: true,
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({ user: { id: user.id } });
		expect(body).not.toHaveProperty("token");
		expect(response.headers.get("set-cookie")).toBeNull();
	});
});
