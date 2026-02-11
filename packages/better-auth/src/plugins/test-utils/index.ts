import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import {
	createGetAuthHeaders,
	createGetCookies,
	createLogin,
} from "./auth-helpers";
import {
	createAddMember,
	createDeleteOrganization,
	createDeleteUser,
	createSaveOrganization,
	createSaveUser,
} from "./db-helpers";
import { createOrganizationFactory, createUserFactory } from "./factories";
import { createOTPStore } from "./otp-sink";
import type { TestHelpers, TestUtilsOptions } from "./types";

export type {
	LoginResult,
	TestCookie,
	TestHelpers,
	TestUtilsOptions,
} from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"test-utils": {
			creator: typeof testUtils;
		};
	}
}

/**
 * Test utilities plugin for Better Auth.
 *
 * Provides helpers for integration and E2E testing including:
 * - User/Organization factories (creates objects without DB writes)
 * - Database helpers (save, delete)
 * - Auth helpers (login, getAuthHeaders, getCookies)
 * - OTP capture (when captureOTP: true)
 *
 * @example
 * ```ts
 * import { betterAuth } from "better-auth";
 * import { testUtils } from "better-auth/plugins";
 *
 * export const auth = betterAuth({
 *   plugins: [
 *     testUtils({ captureOTP: true }),
 *   ],
 * });
 *
 * // In tests, access helpers via context:
 * const ctx = await auth.$context;
 * const test = ctx.test;
 *
 * const user = test.createUser({ email: "test@example.com" });
 * const savedUser = await test.saveUser(user);
 * const { headers, cookies } = await test.login({ userId: user.id });
 * ```
 */
export const testUtils = (options: TestUtilsOptions = {}) => {
	return {
		id: "test-utils",
		init(ctx) {
			// Check if organization plugin is present
			const hasOrgPlugin = ctx.hasPlugin("organization");

			// Build core helpers
			const helpers: TestHelpers = {
				// Factories
				createUser: createUserFactory(ctx),

				// Database helpers
				saveUser: createSaveUser(ctx),
				deleteUser: createDeleteUser(ctx),

				// Auth helpers
				login: createLogin(ctx),
				getAuthHeaders: createGetAuthHeaders(ctx),
				getCookies: createGetCookies(ctx),
			};

			// Add organization helpers if plugin is present
			if (hasOrgPlugin) {
				helpers.createOrganization = createOrganizationFactory(ctx);
				helpers.saveOrganization = createSaveOrganization(ctx);
				helpers.deleteOrganization = createDeleteOrganization(ctx);
				helpers.addMember = createAddMember(ctx);
			}

			// Instance-scoped OTP store
			const otpStore = createOTPStore();

			// Add OTP helpers if enabled
			if (options.captureOTP) {
				helpers.getOTP = otpStore.get;
				helpers.clearOTPs = otpStore.clear;
			}

			// Build database hooks for OTP capture if enabled
			const databaseHooks = options.captureOTP
				? ({
						verification: {
							create: {
								async after(
									verification: {
										identifier: string;
										value: string;
									} | null,
								) {
									if (verification?.value && verification?.identifier) {
										// Extract the actual OTP (before any encoding)
										// The format is typically "otp:retryCount" or just "otp"
										const otpPart = verification.value.split(":")[0];
										if (otpPart) {
											// Extract base identifier (remove prefix like "email-verification-otp-")
											let identifier = verification.identifier;
											const prefixes = [
												"email-verification-otp-",
												"sign-in-otp-",
												"forget-password-otp-",
												"phone-verification-otp-",
											];
											for (const prefix of prefixes) {
												if (identifier.startsWith(prefix)) {
													identifier = identifier.slice(prefix.length);
													break;
												}
											}
											otpStore.capture(identifier, otpPart);
										}
									}
								},
							},
						},
					} satisfies BetterAuthOptions["databaseHooks"])
				: null;

			return {
				context: {
					test: helpers,
				},
				options: databaseHooks ? { databaseHooks } : undefined,
			};
		},
		options,
	} satisfies BetterAuthPlugin;
};
