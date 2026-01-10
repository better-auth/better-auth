import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../../cookies";
import { TWO_FACTOR_ERROR_CODES } from "../error-code";
import {
	enableTwoFactor,
	generateTOTPCode,
	getTwoFactorFromDB,
	getTwoFactorSecret,
	getUserFromDB,
	setupTwoFactorTest,
	signInUser,
	verifyOTP,
} from "./two-factor-test-utils";

describe("Two Factor Basic Functionality", () => {
	it("should enable two factor authentication", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		const result = await enableTwoFactor(context, headers);

		expect(result.backupCodes).toHaveLength(10);
		expect(result.totpURI).toBeDefined();

		const dbUser = await getUserFromDB(context, session.user.id);
		expect(dbUser?.twoFactorEnabled).toBe(false);

		const twoFactor = await getTwoFactorFromDB(context, session.user.id);
		expect(twoFactor?.secret).toBeDefined();
		expect(twoFactor?.backupCodes).toBeDefined();
	});

	it("should verify TOTP and enable two factor", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		const result = await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: { headers },
		});

		expect(result.data?.token).toBeDefined();

		const dbUser = await getUserFromDB(context, session.user.id);
		expect(dbUser?.twoFactorEnabled).toBe(true);
	});

	it("should require two factor authentication on sign in", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: { headers },
		});

		const signInResult = await context.client.signIn.email({
			email: context.testUser.email,
			password: context.testUser.password,
		});
		expect(signInResult.data).toBeDefined();
		expect("twoFactorRedirect" in signInResult.data!).toBe(true);
	});

	it("should complete OTP verification flow", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: { headers },
		});

		const newHeaders = new Headers();
		const signInResult = await context.client.signIn.email({
			email: context.testUser.email,
			password: context.testUser.password,
			fetchOptions: {
				onResponse(ctx) {
					const parsed = parseSetCookieHeader(
						ctx.response.headers.get("Set-Cookie") || "",
					);
					const twoFactorCookie = parsed.get("better-auth.two_factor");
					if (twoFactorCookie?.value) {
						newHeaders.append(
							"cookie",
							`better-auth.two_factor=${twoFactorCookie.value}`,
						);
					}
				},
			},
		});

		expect(signInResult.data).toBeDefined();
		expect("twoFactorRedirect" in signInResult.data!).toBe(true);

		const verifyResult = await verifyOTP(context, newHeaders);
		expect(verifyResult.data?.token).toBeDefined();
	});

	it("should fail with invalid TOTP code", async () => {
		const context = await setupTwoFactorTest();
		const { headers } = await signInUser(context);

		await enableTwoFactor(context, headers);

		const result = await context.client.twoFactor.verifyTotp({
			code: "invalid-code",
			fetchOptions: { headers },
		});

		expect(result.error?.message).toBe(
			TWO_FACTOR_ERROR_CODES.INVALID_CODE.message,
		);
	});

	it("should fail when two factor cookie is missing", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: { headers },
		});

		await context.client.signIn.email({
			email: context.testUser.email,
			password: context.testUser.password,
		});

		await context.client.twoFactor.sendOtp({
			fetchOptions: { headers: new Headers() },
		});

		const verifyResult = await context.client.twoFactor.verifyOtp({
			code: context.capturedOTP,
			fetchOptions: { headers: new Headers() },
		});

		expect(verifyResult.error?.message).toBe(
			TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE.message,
		);
	});

	it("should disable two factor authentication", async () => {
		const context = await setupTwoFactorTest();
		const { session, headers } = await signInUser(context);

		await enableTwoFactor(context, headers);
		const secret = await getTwoFactorSecret(context, session.user.id);
		const totpCode = await generateTOTPCode(secret);

		await context.client.twoFactor.verifyTotp({
			code: totpCode,
			fetchOptions: {
				onSuccess: context.cookieSetter(headers),
			},
		});

		const result = await context.client.twoFactor.disable({
			password: context.testUser.password,
			fetchOptions: { headers },
		});
		console.log(result);
		expect(result.data?.status).toBe(true);

		const dbUser = await getUserFromDB(context, session.user.id);
		expect(dbUser?.twoFactorEnabled).toBe(false);

		const signInResult = await context.client.signIn.email({
			email: context.testUser.email,
			password: context.testUser.password,
		});

		expect(signInResult.data).toBeDefined();
		expect("twoFactorRedirect" in signInResult.data!).toBe(false);
	});
});
