import { describe, expect, it } from "vitest";
import {
	enableTwoFactor,
	expectCookieNotToBeSet,
	expectCookieToBeSet,
	initiateTwoFactorFlow,
	setupTwoFactorTest,
	signInUser,
	verifyOTP,
} from "./two-factor-test-utils";

describe("Two Factor Storage Strategies", () => {
	describe("Cookie Strategy (Default)", () => {
		it("should store state in cookies only", async () => {
			const context = await setupTwoFactorTest({
				twoFactorState: { storeStrategy: "cookie" },
				skipVerificationOnEnable: true,
			});

			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { response, cookies } = await initiateTwoFactorFlow(context);

			// @ts-expect-error - twoFactorRedirect is not defined in the type
			expect(response.data?.twoFactorRedirect).toBe(true);
			// @ts-expect-error - verificationToken is not defined in the type
			expect(response.data?.verificationToken).toBeNull();
			expectCookieToBeSet(cookies, "two_factor");
		});

		it("should complete verification with cookie strategy", async () => {
			const context = await setupTwoFactorTest({
				twoFactorState: { storeStrategy: "cookie" },
				skipVerificationOnEnable: true,
			});

			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);
			const verifyResult = await verifyOTP(context, flowHeaders);

			expect(verifyResult.data?.token).toBeDefined();
		});
	});

	describe("Database Strategy", () => {
		it("should store state in database only", async () => {
			const context = await setupTwoFactorTest({
				twoFactorState: { storeStrategy: "database" },
				skipVerificationOnEnable: true,
			});

			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { response, cookies } = await initiateTwoFactorFlow(context);

			// @ts-expect-error - twoFactorRedirect is not defined in the type
			expect(response.data?.twoFactorRedirect).toBe(true);
			// @ts-expect-error - verificationToken is not defined in the type
			expect(response.data?.verificationToken).toBeDefined();
			// @ts-expect-error - verificationToken is not defined in the type
			expect(typeof response.data?.verificationToken).toBe("string");
			expectCookieNotToBeSet(cookies, "two_factor");
		});

		it("should return verification token for database strategy", async () => {
			const context = await setupTwoFactorTest({
				twoFactorState: { storeStrategy: "database" },
				skipVerificationOnEnable: true,
			});

			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { response } = await initiateTwoFactorFlow(context);

			// @ts-expect-error - verificationToken is not defined in the type
			expect(response.data?.verificationToken).toBeDefined();
			// @ts-expect-error - verificationToken is not defined in the type
			expect(response.data?.verificationToken).not.toBeNull();
		});
	});

	describe("Cookie and Database Strategy", () => {
		it("should store state in both cookie and database", async () => {
			const context = await setupTwoFactorTest({
				twoFactorState: { storeStrategy: "cookieAndDatabase" },
				skipVerificationOnEnable: true,
			});

			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { response, cookies } = await initiateTwoFactorFlow(context);

			// @ts-expect-error - twoFactorRedirect is not defined in the type
			expect(response.data?.twoFactorRedirect).toBe(true);
			// @ts-expect-error - verificationToken is not defined in the type
			expect(response.data?.verificationToken).toBeDefined();
			// @ts-expect-error - verificationToken is not defined in the type
			expect(typeof response.data?.verificationToken).toBe("string");
			expectCookieToBeSet(cookies, "two_factor");
		});

		it("should complete verification with cookie and database strategy", async () => {
			const context = await setupTwoFactorTest({
				twoFactorState: { storeStrategy: "cookieAndDatabase" },
				skipVerificationOnEnable: true,
			});

			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { headers: flowHeaders, response } =
				await initiateTwoFactorFlow(context);

			// @ts-expect-error - verificationToken is not defined in the type
			expect(response.data?.verificationToken).toBeDefined();

			const verifyResult = await verifyOTP(context, flowHeaders);
			expect(verifyResult.data?.token).toBeDefined();
		});

		it("should work with cookie even when verification token is provided", async () => {
			const context = await setupTwoFactorTest({
				twoFactorState: { storeStrategy: "cookieAndDatabase" },
				skipVerificationOnEnable: true,
			});

			const { headers } = await signInUser(context);
			await enableTwoFactor(context, headers);

			const { headers: flowHeaders } = await initiateTwoFactorFlow(context);
			const verifyResult = await verifyOTP(context, flowHeaders);

			expect(verifyResult.data?.token).toBeDefined();
		});
	});

	describe("Strategy Comparison", () => {
		it("should behave differently across strategies", async () => {
			const strategies = ["cookie", "database", "cookieAndDatabase"] as const;
			const results = [];

			for (const strategy of strategies) {
				const context = await setupTwoFactorTest({
					twoFactorState: { storeStrategy: strategy },
					skipVerificationOnEnable: true,
				});

				const { headers } = await signInUser(context);
				await enableTwoFactor(context, headers);
				const { response, cookies } = await initiateTwoFactorFlow(context);

				results.push({
					strategy,
					// @ts-expect-error - verificationToken is not defined in the type
					hasVerificationToken: !!response.data?.verificationToken,
					hasCookie: !!cookies.get("better-auth.two_factor"),
				});
			}

			expect(results[0]).toEqual({
				strategy: "cookie",
				hasVerificationToken: false,
				hasCookie: true,
			});

			expect(results[1]).toEqual({
				strategy: "database",
				hasVerificationToken: true,
				hasCookie: false,
			});

			expect(results[2]).toEqual({
				strategy: "cookieAndDatabase",
				hasVerificationToken: true,
				hasCookie: true,
			});
		});
	});
});
