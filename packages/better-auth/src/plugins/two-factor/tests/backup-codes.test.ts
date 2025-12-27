import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../../cookies";
import {
	enableTwoFactor,
	generateTOTPCode,
	getTwoFactorSecret,
	initiateTwoFactorFlow,
	setupTwoFactorTest,
	signInUser,
} from "./two-factor-test-utils";

describe("Two Factor Backup Codes", () => {
	it("should generate backup codes on enable", async () => {
		const context = await setupTwoFactorTest();
		const { headers } = await signInUser(context);

		const result = await enableTwoFactor(context, headers);

		expect(result.backupCodes).toHaveLength(10);
		result.backupCodes.forEach((code) => {
			expect(typeof code).toBe("string");
			expect(code.length).toBeGreaterThan(0);
		});
	});

	it("should generate new backup codes", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		const enableResult = await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: {
				headers,
				onSuccess: context.sessionSetter(headers),
			},
		});

		const generateResult = await context.client.twoFactor.generateBackupCodes({
			password: context.testUser.password,
			fetchOptions: { headers },
		});

		expect(generateResult.data?.backupCodes).toHaveLength(10);
		expect(generateResult.data?.backupCodes).not.toEqual(
			enableResult.backupCodes,
		);
	});

	it("should verify with backup code", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		const enableResult = await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: { headers },
		});

		const { headers: flowHeaders } = await initiateTwoFactorFlow(context);
		const backupCode = enableResult.backupCodes[0];

		let sessionToken: string | undefined;
		const verifyResult = await context.client.twoFactor.verifyBackupCode({
			code: backupCode!,
			fetchOptions: {
				headers: flowHeaders,
				onSuccess(ctx) {
					const parsed = parseSetCookieHeader(
						ctx.response.headers.get("Set-Cookie") || "",
					);
					sessionToken = parsed.get("better-auth.session_token")?.value;
				},
			},
		});

		expect(verifyResult.data).toBeDefined();
		expect(sessionToken).toBeDefined();
		expect(sessionToken?.length).toBeGreaterThan(0);
	});

	it("should remove used backup code", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		const enableResult = await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: { headers },
		});

		const { headers: flowHeaders } = await initiateTwoFactorFlow(context);
		const backupCode = enableResult.backupCodes[0];

		await context.client.twoFactor.verifyBackupCode({
			code: backupCode!,
			fetchOptions: { headers: flowHeaders },
		});

		const currentBackupCodes = await context.auth.api.viewBackupCodes({
			body: { userId: session.user.id },
		});

		expect(currentBackupCodes.backupCodes).toBeDefined();
		expect(currentBackupCodes.backupCodes).not.toContain(backupCode);
		expect(currentBackupCodes.backupCodes.length).toBe(
			enableResult.backupCodes.length - 1,
		);
	});

	it("should fail with invalid backup code", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: { headers },
		});

		const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

		const verifyResult = await context.client.twoFactor.verifyBackupCode({
			code: "invalid-backup-code",
			fetchOptions: { headers: flowHeaders },
		});

		expect(verifyResult.error?.message).toBe("Invalid backup code");
	});

	it("should fail with already used backup code", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		const enableResult = await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: { headers },
		});

		const { headers: flowHeaders } = await initiateTwoFactorFlow(context);
		const backupCode = enableResult.backupCodes[0];

		await context.client.twoFactor.verifyBackupCode({
			code: backupCode!,
			fetchOptions: { headers: flowHeaders },
		});

		const { headers: newFlowHeaders } = await initiateTwoFactorFlow(context);

		const secondVerifyResult = await context.client.twoFactor.verifyBackupCode({
			code: backupCode!,
			fetchOptions: { headers: newFlowHeaders },
		});

		expect(secondVerifyResult.error?.message).toBe("Invalid backup code");
	});

	it("should return parsed array of backup codes from viewBackupCodes", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		const enableResult = await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: { headers },
		});

		const viewResult = await context.auth.api.viewBackupCodes({
			body: { userId: session.user.id },
		});

		expect(typeof viewResult.backupCodes).not.toBe("string");
		expect(Array.isArray(viewResult.backupCodes)).toBe(true);
		expect(viewResult.backupCodes).toHaveLength(10);

		viewResult.backupCodes.forEach((code: string) => {
			expect(typeof code).toBe("string");
			expect(code.length).toBeGreaterThan(0);
		});

		expect(viewResult.backupCodes).toEqual(enableResult.backupCodes);
		expect(viewResult.status).toBe(true);
	});
});
