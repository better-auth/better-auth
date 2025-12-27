import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../../cookies";
import {
	enableTwoFactor,
	expectCookieNotToBeSet,
	expectCookieToBeSet,
	initiateTwoFactorFlow,
	setupTwoFactorTest,
	signInUser,
} from "./two-factor-test-utils";

describe("Trust Device Functionality", () => {
	describe("Trust Device Enabled", () => {
		it("should set trust device cookie when requested", async () => {
			const context = await setupTwoFactorTest({
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
				code: context.capturedOTP,
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
			expectCookieToBeSet(trustDeviceCookies, "trust_device");
		});

		it("should skip 2FA when trust device cookie is present", async () => {
			const context = await setupTwoFactorTest({
				skipVerificationOnEnable: true,
			});
			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			let trustDeviceCookieValue: string = "";
			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});
			await context.client.twoFactor.verifyOtp({
				code: context.capturedOTP,
				trustDevice: true,
				fetchOptions: {
					headers: flowHeaders,
					onSuccess(ctx) {
						const parsed = parseSetCookieHeader(
							ctx.response.headers.get("Set-Cookie") || "",
						);
						const trustCookie = parsed.get("better-auth.trust_device");
						if (trustCookie?.value) {
							trustDeviceCookieValue = trustCookie.value;
						}
					},
				},
			});

			const trustedHeaders = new Headers();
			trustedHeaders.set(
				"cookie",
				`better-auth.trust_device=${trustDeviceCookieValue}`,
			);

			const signInResult = await context.client.signIn.email({
				email: context.testUser.email,
				password: context.testUser.password,
				fetchOptions: { headers: trustedHeaders },
			});

			expect(signInResult.data?.user).toBeDefined();
			// @ts-expect-error - twoFactorRedirect is not defined in the type
			expect(signInResult.data?.twoFactorRedirect).toBeUndefined();
		});

		it("should refresh trust device cookie on successful sign in", async () => {
			const context = await setupTwoFactorTest({
				skipVerificationOnEnable: true,
			});
			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			let trustDeviceCookieValue: string = "";
			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});
			await context.client.twoFactor.verifyOtp({
				code: context.capturedOTP,
				trustDevice: true,
				fetchOptions: {
					headers: flowHeaders,
					onSuccess(ctx) {
						const parsed = parseSetCookieHeader(
							ctx.response.headers.get("Set-Cookie") || "",
						);
						const trustCookie = parsed.get("better-auth.trust_device");
						if (trustCookie?.value) {
							trustDeviceCookieValue = trustCookie.value;
						}
					},
				},
			});

			const trustedHeaders = new Headers();
			trustedHeaders.set(
				"cookie",
				`better-auth.trust_device=${trustDeviceCookieValue}`,
			);

			let updatedTrustCookieValue: string = "";
			const signInResult = await context.client.signIn.email({
				email: context.testUser.email,
				password: context.testUser.password,
				fetchOptions: {
					headers: trustedHeaders,
					onSuccess(ctx) {
						const parsed = parseSetCookieHeader(
							ctx.response.headers.get("Set-Cookie") || "",
						);
						const trustCookie = parsed.get("better-auth.trust_device");
						if (trustCookie?.value) {
							updatedTrustCookieValue = trustCookie.value;
						}
					},
				},
			});

			expect(signInResult.data?.user).toBeDefined();
			expect(updatedTrustCookieValue).toBeDefined();
			expect(updatedTrustCookieValue).not.toBe(trustDeviceCookieValue);
		});

		it("should not set trust device cookie when not requested", async () => {
			const context = await setupTwoFactorTest({
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
				code: context.capturedOTP,
				trustDevice: false,
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
			expectCookieNotToBeSet(trustDeviceCookies, "trust_device");
		});
	});

	describe("Trust Device Disabled", () => {
		it("should not set trust device cookie when disabled", async () => {
			const context = await setupTwoFactorTest({
				trustDevice: { disabled: true },
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
				code: context.capturedOTP,
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
			expectCookieNotToBeSet(trustDeviceCookies, "trust_device");
		});

		it("should still require 2FA on next sign in when trust device is disabled", async () => {
			const context = await setupTwoFactorTest({
				trustDevice: { disabled: true },
				skipVerificationOnEnable: true,
			});

			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});
			await context.client.twoFactor.verifyOtp({
				code: context.capturedOTP,
				trustDevice: true,
				fetchOptions: { headers: flowHeaders },
			});

			const signInResult = await context.client.signIn.email({
				email: context.testUser.email,
				password: context.testUser.password,
			});

			// @ts-expect-error - twoFactorRedirect is not defined in the type
			expect(signInResult.data?.twoFactorRedirect).toBe(true);
		});
	});

	describe("Custom Trust Device Configuration", () => {
		it("should use custom trust device name", async () => {
			const customName = "my_custom_trust";
			const context = await setupTwoFactorTest({
				trustDevice: { name: customName },
				skipVerificationOnEnable: true,
			});

			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			const trustDeviceCookies = new Map<string, string>();
			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});
			await context.client.twoFactor.verifyOtp({
				code: context.capturedOTP,
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

			expectCookieToBeSet(trustDeviceCookies, customName);
			expectCookieNotToBeSet(trustDeviceCookies, "trust_device");
		});

		it("should respect custom max age", async () => {
			const customMaxAge = 3600;
			const context = await setupTwoFactorTest({
				trustDevice: { maxAge: customMaxAge },
				skipVerificationOnEnable: true,
			});

			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);

			let cookieMaxAge: string | undefined;
			await context.client.twoFactor.sendOtp({
				fetchOptions: { headers: flowHeaders },
			});
			await context.client.twoFactor.verifyOtp({
				code: context.capturedOTP,
				trustDevice: true,
				fetchOptions: {
					headers: flowHeaders,
					onSuccess(ctx) {
						const parsed = parseSetCookieHeader(
							ctx.response.headers.get("Set-Cookie") || "",
						);
						const trustCookie = parsed.get("better-auth.trust_device");
						cookieMaxAge = trustCookie?.["max-age"]?.toString();
					},
				},
			});

			expect(cookieMaxAge).toBe(customMaxAge.toString());
		});
	});
});
