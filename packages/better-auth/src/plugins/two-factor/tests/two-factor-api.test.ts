import { describe, expect, it, vi } from "vitest";
import { parseSetCookieHeader } from "../../../cookies";
import { convertSetCookieToCookie } from "../../../test-utils/headers";
import { setupTwoFactorTest } from "./two-factor-test-utils";

describe("Two Factor API", () => {
	describe("Server API Methods", () => {
		it("should enable two factor via server API", async () => {
			const sendOTP = vi.fn();

			const { auth, testUser } = await (async () => {
				const context = await setupTwoFactorTest({
					otpOptions: {
						sendOTP({ otp }) {
							sendOTP(otp);
						},
					},
					skipVerificationOnEnable: true,
				});
				return { auth: context.auth, testUser: context.testUser };
			})();

			const signInResult = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
				},
				asResponse: true,
			});

			let headers = convertSetCookieToCookie(signInResult.headers);

			const enableResult = await auth.api.enableTwoFactor({
				body: { password: testUser.password },
				headers,
				asResponse: true,
			});

			headers = convertSetCookieToCookie(enableResult.headers);

			const enableJson = (await enableResult.json()) as {
				status: boolean;
				backupCodes: string[];
				totpURI: string;
			};

			expect(enableJson.backupCodes).toHaveLength(10);
			expect(enableJson.totpURI).toBeDefined();

			const session = await auth.api.getSession({ headers });
			expect(session?.user.twoFactorEnabled).toBe(true);
		});

		it("should get TOTP URI via server API", async () => {
			const context = await setupTwoFactorTest({
				skipVerificationOnEnable: true,
			});

			const signInResult = await context.auth.api.signInEmail({
				body: {
					email: context.testUser.email,
					password: context.testUser.password,
				},
				asResponse: true,
			});

			let headers = convertSetCookieToCookie(signInResult.headers);

			const enableResult = await context.auth.api.enableTwoFactor({
				body: { password: context.testUser.password },
				headers,
				asResponse: true,
			});
			headers = convertSetCookieToCookie(enableResult.headers);

			const result = await context.auth.api.getTOTPURI({
				headers,
				body: { password: context.testUser.password },
			});

			expect(result.totpURI).toBeDefined();
			expect(result.totpURI).toMatch(/^otpauth:\/\/totp\//);
		});

		it("should handle two factor flow via server API", async () => {
			let capturedOTP = "";
			const sendOTP = vi.fn();

			const context = await setupTwoFactorTest({
				otpOptions: {
					sendOTP({ otp }) {
						capturedOTP = otp;
						sendOTP(otp);
					},
				},
				skipVerificationOnEnable: true,
			});

			const signInResult = await context.auth.api.signInEmail({
				body: {
					email: context.testUser.email,
					password: context.testUser.password,
				},
				asResponse: true,
			});

			let headers = convertSetCookieToCookie(signInResult.headers);

			await context.auth.api.enableTwoFactor({
				body: { password: context.testUser.password },
				headers,
			});

			const twoFactorSignInResult = await context.auth.api.signInEmail({
				body: {
					email: context.testUser.email,
					password: context.testUser.password,
				},
				asResponse: true,
			});

			headers = convertSetCookieToCookie(twoFactorSignInResult.headers);

			expect(twoFactorSignInResult).toBeInstanceOf(Response);
			expect(twoFactorSignInResult.status).toBe(200);

			const parsed = parseSetCookieHeader(
				twoFactorSignInResult.headers.get("Set-Cookie") || "",
			);
			const twoFactorCookie = parsed.get("better-auth.two_factor");
			expect(twoFactorCookie).toBeDefined();

			const sessionToken = parsed.get("better-auth.session_token");
			expect(sessionToken?.value).toBeFalsy();

			await context.auth.api.sendTwoFactorOTP({
				headers,
				body: { trustDevice: false },
			});

			expect(capturedOTP).toHaveLength(6);
			expect(sendOTP).toHaveBeenCalledWith(capturedOTP);

			const verifyResult = await context.auth.api.verifyTwoFactorOTP({
				headers,
				body: { code: capturedOTP },
				asResponse: true,
			});

			expect(verifyResult.status).toBe(200);
			expect(verifyResult.headers.get("Set-Cookie")).toBeDefined();

			headers = convertSetCookieToCookie(verifyResult.headers);
		});

		it("should disable two factor via server API", async () => {
			const context = await setupTwoFactorTest({
				skipVerificationOnEnable: true,
			});

			const signInResult = await context.auth.api.signInEmail({
				body: {
					email: context.testUser.email,
					password: context.testUser.password,
				},
				asResponse: true,
			});

			let headers = convertSetCookieToCookie(signInResult.headers);

			const enableResult = await context.auth.api.enableTwoFactor({
				body: { password: context.testUser.password },
				headers,
				asResponse: true,
			});
			headers = convertSetCookieToCookie(enableResult.headers);

			const disableResult = await context.auth.api.disableTwoFactor({
				headers,
				body: { password: context.testUser.password },
				asResponse: true,
			});

			headers = convertSetCookieToCookie(disableResult.headers);

			expect(disableResult.status).toBe(200);

			const session = await context.auth.api.getSession({ headers });
			expect(session?.user.twoFactorEnabled).toBe(false);
		});
	});

	describe("Backup Codes API", () => {
		it("should return parsed array of backup codes", async () => {
			const context = await setupTwoFactorTest({
				skipVerificationOnEnable: true,
			});

			const signInResult = await context.auth.api.signInEmail({
				body: {
					email: context.testUser.email,
					password: context.testUser.password,
				},
				asResponse: true,
			});

			let headers = convertSetCookieToCookie(signInResult.headers);

			const session = await context.auth.api.getSession({ headers });
			const userId = session?.user.id!;

			const enableResult = await context.auth.api.enableTwoFactor({
				body: { password: context.testUser.password },
				headers,
				asResponse: true,
			});

			expect(enableResult.status).toBe(200);
			headers = convertSetCookieToCookie(enableResult.headers);

			const enableJson = (await enableResult.json()) as {
				backupCodes: string[];
			};

			const viewResult = await context.auth.api.viewBackupCodes({
				body: { userId },
			});

			expect(typeof viewResult.backupCodes).not.toBe("string");
			expect(Array.isArray(viewResult.backupCodes)).toBe(true);
			expect(viewResult.backupCodes).toHaveLength(10);

			viewResult.backupCodes.forEach((code) => {
				expect(typeof code).toBe("string");
				expect(code.length).toBeGreaterThan(0);
			});

			expect(viewResult.backupCodes).toEqual(enableJson.backupCodes);
			expect(viewResult.status).toBe(true);
		});

		it("should generate new backup codes via API", async () => {
			const context = await setupTwoFactorTest({
				skipVerificationOnEnable: true,
			});

			const signInResult = await context.auth.api.signInEmail({
				body: {
					email: context.testUser.email,
					password: context.testUser.password,
				},
				asResponse: true,
			});

			let headers = convertSetCookieToCookie(signInResult.headers);

			const session = await context.auth.api.getSession({ headers });
			const userId = session?.user.id!;

			const enableResult = await context.auth.api.enableTwoFactor({
				body: { password: context.testUser.password },
				headers,
				asResponse: true,
			});
			const newHeaders = convertSetCookieToCookie(enableResult.headers);
			const generateResult = await context.auth.api.generateBackupCodes({
				body: { password: context.testUser.password },
				headers: newHeaders,
			});

			expect(generateResult.backupCodes).toBeDefined();
			expect(generateResult.backupCodes).toHaveLength(10);

			const viewResult = await context.auth.api.viewBackupCodes({
				body: { userId },
			});

			expect(viewResult.status).toBe(true);
			expect(typeof viewResult.backupCodes).not.toBe("string");
			expect(Array.isArray(viewResult.backupCodes)).toBe(true);
			expect(viewResult.backupCodes).toHaveLength(10);

			viewResult.backupCodes.forEach((code) => {
				expect(typeof code).toBe("string");
				expect(code.length).toBeGreaterThan(0);
			});

			expect(viewResult.backupCodes).toEqual(generateResult.backupCodes);
		});

		it("should not expose viewBackupCodes to client", async () => {
			const context = await setupTwoFactorTest();

			const signInResult = await context.auth.api.signInEmail({
				body: {
					email: context.testUser.email,
					password: context.testUser.password,
				},
				asResponse: true,
			});

			const session = await context.auth.api.getSession({
				headers: convertSetCookieToCookie(signInResult.headers),
			});
			const userId = session?.user.id!;

			const response = await context.customFetchImpl(
				"http://localhost:3000/api/auth/two-factor/view-backup-codes",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ userId }),
				},
			);

			expect(response.status).toBe(404);
		});
	});

	describe("Response Format Validation", () => {
		it("should return consistent response format across endpoints", async () => {
			const context = await setupTwoFactorTest({
				skipVerificationOnEnable: true,
			});

			const signInResult = await context.auth.api.signInEmail({
				body: {
					email: context.testUser.email,
					password: context.testUser.password,
				},
				asResponse: true,
			});

			const headers = convertSetCookieToCookie(signInResult.headers);

			const enableResult = await context.auth.api.enableTwoFactor({
				body: { password: context.testUser.password },
				headers,
				asResponse: true,
			});

			const enableJson = await enableResult.json();

			expect(enableJson).toHaveProperty("backupCodes");
			expect(enableJson).toHaveProperty("totpURI");
			expect(Array.isArray(enableJson.backupCodes)).toBe(true);
			expect(typeof enableJson.totpURI).toBe("string");
		});
	});
});
