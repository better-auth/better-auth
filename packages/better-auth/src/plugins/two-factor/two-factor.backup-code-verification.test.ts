import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it, vi } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { symmetricDecrypt } from "../../crypto";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { getTestInstance } from "../../test-utils/test-instance";
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
		const t = await setup();
		const externalUsers = new Map([[t.user.id, "external-user"]]);
		const verifyExternalCode = vi.fn(
			async (_userId: string | undefined, _code: string) => true,
		);
		t.verify.mockImplementation(async ({ code, user, twoFactor }, ctx) => {
			expect(twoFactor.userId).toBe(user.id);
			expect(ctx.headers?.get("x-verifier-test")).toBe("request-context");
			return verifyExternalCode(externalUsers.get(user.id), code);
		});
		const headers = await t.startChallenge();
		headers.set("x-verifier-test", "request-context");
		// External verification must not try to decrypt local backup codes.
		await t.updateRow({ backupCodes: "external", failedVerificationCount: 2 });
		const row = await t.readRow();
		const response = await t.verifyCode(headers, "external-code", true);
		expect(response.status).toBe(200);
		expect(verifyExternalCode).toHaveBeenCalledWith(
			"external-user",
			"external-code",
		);
		expect(t.verify.mock.calls[0]?.[0].twoFactor).toEqual(row);
		const session = await t.auth.api.getSession({
			headers: convertSetCookieToCookie(response.headers),
		});
		expect(session?.user.id).toBe(t.user.id);
		expect(
			parseSetCookieHeader(response.headers.get("set-cookie") || "").get(
				"better-auth.trust_device",
			)?.value,
		).toBeTruthy();
		expect(await t.readRow()).toMatchObject({
			backupCodes: row.backupCodes,
			failedVerificationCount: 0,
		});
		expect((await t.verifyCode(headers, "external-code")).status).toBe(401);
		expect(t.verify).toHaveBeenCalledTimes(1);
	});

	it("rejects false without falling back to a valid local code", async () => {
		const t = await setup();
		t.verify.mockReturnValue(false);
		const headers = await t.startChallenge();
		const response = await t.verifyCode(headers, t.backupCode);
		expect(response.status).toBe(401);
		expect((await t.readRow()).failedVerificationCount).toBe(1);
		expect(await t.auth.api.getSession({ headers })).toBeNull();
	});

	it("verifies and consumes a local code when the callback returns undefined", async () => {
		const t = await setup();
		expect(
			(await t.verifyCode(await t.startChallenge(), t.backupCode)).status,
		).toBe(200);
		expect(
			(await t.verifyCode(await t.startChallenge(), t.backupCode)).status,
		).toBe(401);
		expect(t.verify).toHaveBeenCalledTimes(2);
	});

	it("propagates service errors without fallback or spending attempts", async () => {
		const t = await setup();
		t.verify.mockRejectedValue(new Error("Verifier unavailable"));
		const headers = await t.startChallenge();
		for (let i = 0; i <= DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS; i++) {
			await expect(t.verifyCode(headers, t.backupCode)).rejects.toThrow(
				"Verifier unavailable",
			);
		}
		expect((await t.readRow()).failedVerificationCount).toBe(0);
		t.verify.mockResolvedValue(true);
		expect((await t.verifyCode(headers, t.backupCode)).status).toBe(200);
	});

	it("enforces the challenge attempt limit before calling the verifier", async () => {
		const t = await setup({ enabled: false });
		t.verify.mockReturnValue(false);
		const headers = await t.startChallenge();
		for (let i = 0; i < DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS; i++) {
			expect((await t.verifyCode(headers, "wrong-code")).status).toBe(401);
		}
		t.verify.mockReturnValue(true);
		expect((await t.verifyCode(headers, "correct-code")).status).toBe(400);
		expect(t.verify).toHaveBeenCalledTimes(DEFAULT_TWO_FACTOR_ALLOWED_ATTEMPTS);
	});

	it.each([
		["missing challenge", 401],
		["missing record", 400],
		["locked account", 429],
	] as const)(
		"does not call the verifier for a %s",
		async (condition, status) => {
			const t = await setup();
			t.verify.mockReturnValue(true);
			const headers =
				condition === "missing challenge"
					? new Headers()
					: await t.startChallenge();
			if (condition === "missing record") {
				await t.db.delete({
					model: "twoFactor",
					where: [{ field: "userId", value: t.user.id }],
				});
			} else if (condition === "locked account") {
				await t.updateRow({ lockedUntil: new Date(Date.now() + 60_000) });
			}
			expect((await t.verifyCode(headers, "external-code")).status).toBe(
				status,
			);
			expect(t.verify).not.toHaveBeenCalled();
		},
	);

	it("supports re-verification with an authenticated session", async () => {
		const t = await setup();
		t.verify.mockReturnValue(true);
		const session = await t.auth.api.getSession({ headers: t.sessionHeaders });
		const response = await t.verifyCode(t.sessionHeaders, "external-code");
		expect(await response.json()).toMatchObject({
			token: session?.session.token,
			user: { id: t.user.id },
		});
		expect(t.verify).toHaveBeenCalledTimes(1);
	});

	it("lets the callback consume external codes without changing local codes", async () => {
		const t = await setup();
		const externalCodes = new Set(["external-code"]);
		t.verify.mockImplementation(async ({ code }) => externalCodes.delete(code));
		const backupCodes = (await t.readRow()).backupCodes;
		const first = await t.startChallenge();
		const second = await t.startChallenge();
		const responses = await Promise.all([
			t.verifyCode(first, "external-code"),
			t.verifyCode(second, "external-code"),
		]);
		expect(responses.map((response) => response.status).sort()).toEqual([
			200, 401,
		]);
		expect((await t.readRow()).backupCodes).toBe(backupCodes);
		// Switch this user back to locally generated backup codes.
		t.verify.mockReturnValue(undefined);
		expect(
			(await t.verifyCode(await t.startChallenge(), t.backupCode)).status,
		).toBe(200);
	});

	it("honors disableSession when the callback succeeds", async () => {
		const t = await setup();
		t.verify.mockReturnValue(true);
		const response = await t.auth.api.verifyBackupCode({
			body: { code: "external-code", disableSession: true },
			headers: await t.startChallenge(),
			asResponse: true,
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ user: { id: t.user.id } });
		expect(response.headers.get("set-cookie")).toBeNull();
	});
});
