import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../../cookies";
import {
	enableTwoFactor,
	expectCookieNotToBeSet,
	expectCookieToBeSet,
	extractCookieValue,
	initiateTwoFactorFlow,
	setupTwoFactorTest,
	signInUser,
} from "./two-factor-test-utils";

describe("Two Factor Custom Configuration", () => {
	const CUSTOM_COOKIE_NAME = "custom_2fa_state";
	const CUSTOM_TRUST_DEVICE_NAME = "custom_trust";
	const CUSTOM_MAX_AGE = 600;
	const CUSTOM_TRUST_MAX_AGE = 60 * 60 * 24 * 7;

	it("should use custom cookie name and max age", async () => {
		const context = await setupTwoFactorTest({
			twoFactorState: {
				cookieName: CUSTOM_COOKIE_NAME,
				maxAge: CUSTOM_MAX_AGE,
				storeStrategy: "cookie",
			},
			skipVerificationOnEnable: true,
		});

		const { headers } = await signInUser(context);
		await enableTwoFactor(context, headers);

		const { cookies } = await initiateTwoFactorFlow(context);

		expectCookieToBeSet(cookies, CUSTOM_COOKIE_NAME);
		expectCookieNotToBeSet(cookies, "two_factor");

		const customCookie = extractCookieValue(cookies, CUSTOM_COOKIE_NAME);
		expect(customCookie).toBeDefined();
	});

	it("should use custom trust device configuration", async () => {
		const context = await setupTwoFactorTest({
			trustDevice: {
				name: CUSTOM_TRUST_DEVICE_NAME,
				maxAge: CUSTOM_TRUST_MAX_AGE,
			},
			skipVerificationOnEnable: true,
		});

		const { headers } = await signInUser(context);
		await enableTwoFactor(context, headers);

		const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

		const trustDeviceCookies = new Map<string, string>();
		await context.client.twoFactor.sendOtp({
			fetchOptions: { headers: flowHeaders },
		});
		const verifyResult = await context.client.twoFactor.verifyOtp({
			code: context.capturedOTP!,
			trustDevice: true,
			fetchOptions: {
				headers: flowHeaders,
				onSuccess(ctx) {
					const parsed = parseSetCookieHeader(
						ctx.response.headers.get("Set-Cookie") || "",
					);
					for (const [name, cookie] of parsed.entries()) {
						if (cookie?.value) {
							trustDeviceCookies.set(name, cookie.value);
						}
					}
				},
			},
		});

		expect(verifyResult.data?.token).toBeDefined();
		expectCookieToBeSet(trustDeviceCookies, CUSTOM_TRUST_DEVICE_NAME);
		expectCookieNotToBeSet(trustDeviceCookies, "trust_device");

		const trustCookieValue = extractCookieValue(
			trustDeviceCookies,
			CUSTOM_TRUST_DEVICE_NAME,
		);
		const newHeaders = new Headers();
		newHeaders.set(
			"cookie",
			`better-auth.${CUSTOM_TRUST_DEVICE_NAME}=${trustCookieValue}`,
		);

		const signInResult = await context.client.signIn.email({
			email: context.testUser.email,
			password: context.testUser.password,
			fetchOptions: { headers: newHeaders },
		});

		expect(signInResult.data?.user).toBeDefined();
		// When trust device cookie is present, 2FA should be skipped and redirect should be false or undefined
		expect(signInResult.data?.redirect).toBeFalsy();
	});

	it("should respect custom issuer from request parameter", async () => {
		const context = await setupTwoFactorTest();
		const { headers } = await signInUser(context);

		const CUSTOM_ISSUER = "Custom App Name";
		const result = await context.client.twoFactor.enable({
			password: context.testUser.password,
			issuer: CUSTOM_ISSUER,
			fetchOptions: { headers },
		});

		const totpURI = result.data?.totpURI;
		expect(totpURI).toMatch(
			new RegExp(`^otpauth://totp/${encodeURIComponent(CUSTOM_ISSUER)}:`),
		);
		expect(totpURI).toContain("&issuer=Custom+App+Name&");
	});

	it("should fallback to default issuer when none provided", async () => {
		const context = await setupTwoFactorTest();
		const { headers } = await signInUser(context);

		const result = await context.client.twoFactor.enable({
			password: context.testUser.password,
			fetchOptions: { headers },
		});

		const totpURI = result.data?.totpURI;
		expect(totpURI).toMatch(/^otpauth:\/\/totp\/Better%20Auth:/);
		expect(totpURI).toContain("&issuer=Better+Auth&");
	});

	it("should work with complete custom configuration", async () => {
		const context = await setupTwoFactorTest({
			twoFactorState: {
				cookieName: "my_2fa_state",
				maxAge: 300,
				storeStrategy: "cookie",
			},
			trustDevice: {
				name: "my_trusted_device",
				maxAge: 30 * 24 * 60 * 60,
			},
			skipVerificationOnEnable: true,
		});

		const { headers } = await signInUser(context);
		const result = await enableTwoFactor(context, headers);

		expect(result.backupCodes).toHaveLength(10);
		expect(result.totpURI).toBeDefined();

		const { cookies } = await initiateTwoFactorFlow(context);
		expectCookieToBeSet(cookies, "my_2fa_state");
		expectCookieNotToBeSet(cookies, "two_factor");
	});
});
