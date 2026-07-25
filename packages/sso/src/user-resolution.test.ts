import type { BetterAuthOptions, DBTransactionAdapter } from "better-auth";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { SSOProviderUserProfile, SSOUserResolutionInput } from "./types";
import {
	assertSSOUserResolutionAsyncContextSupport,
	assertSSOUserResolutionSessionStorage,
	resolveSSOUser,
} from "./user-resolution";

const input = {
	protocol: "oidc",
	providerId: "workforce",
	accountKey: {
		issuer: "https://idp.example.com",
		providerAccountId: "directory-user-1",
	},
	providerUser: {
		email: "employee@example.com",
		emailVerified: true,
		name: "Directory Employee",
		image: null,
	},
	providerClaims: { sub: "directory-user-1" },
} satisfies SSOUserResolutionInput;

const database = {} as DBTransactionAdapter;

describe("SSO user resolution", () => {
	it("fails closed when database transaction async context is unavailable", async () => {
		await expect(
			assertSSOUserResolutionAsyncContextSupport(async () => {
				throw new Error("AsyncLocalStorage unavailable");
			}),
		).rejects.toMatchObject({
			status: "NOT_IMPLEMENTED",
			body: { code: "SSO_USER_RESOLUTION_REQUIRES_ASYNC_CONTEXT" },
		});
	});
	it("exposes mapped provider profile fields as unknown", () => {
		const mappedProviderUser = {
			email: "employee@example.com",
			emailVerified: true,
			name: "Directory Employee",
			image: null,
			department: "Engineering",
		} satisfies SSOProviderUserProfile;
		expectTypeOf(mappedProviderUser.department).toEqualTypeOf<string>();
		expectTypeOf<
			SSOUserResolutionInput["providerUser"]["department"]
		>().toEqualTypeOf<unknown>();
	});

	it("logs resolver exceptions while returning a stable error", async () => {
		const privateError = new Error("private directory topology");
		const logger = { error: vi.fn() };

		await expect(
			resolveSSOUser(
				() => {
					throw privateError;
				},
				input,
				database,
				logger,
			),
		).rejects.toMatchObject({
			body: {
				code: "SSO_USER_RESOLUTION_FAILED",
				message: "Unable to resolve the SSO user",
			},
		});
		expect(logger.error).toHaveBeenCalledWith(
			"SSO user resolution failed",
			privateError,
		);
	});

	it("logs malformed decisions without logging their value", async () => {
		const logger = { error: vi.fn() };
		const malformedResolver = (() => ({
			action: "link",
			userId: "user-1",
		})) as never;

		await expect(
			resolveSSOUser(malformedResolver, input, database, logger),
		).rejects.toMatchObject({
			body: { code: "SSO_USER_RESOLUTION_FAILED" },
		});
		expect(logger.error).toHaveBeenCalledWith(
			"SSO user resolver returned an invalid decision",
		);
	});

	it("requires a database session fallback when secondary storage is configured", () => {
		const secondaryStorage = {
			get: async () => null,
			getAndDelete: async () => null,
			set: async () => {},
			increment: async () => 1,
			delete: async () => {},
		};
		expect(() =>
			assertSSOUserResolutionSessionStorage({
				secondaryStorage,
			} satisfies BetterAuthOptions),
		).toThrow("SSO user resolution requires database-backed sessions");
		expect(() =>
			assertSSOUserResolutionSessionStorage({
				secondaryStorage,
				session: { storeSessionInDatabase: true },
			} satisfies BetterAuthOptions),
		).not.toThrow();
		expect(() =>
			assertSSOUserResolutionSessionStorage({
				secondaryStorage,
				session: {
					storeSessionInDatabase: true,
					preserveSessionInDatabase: true,
				},
			} satisfies BetterAuthOptions),
		).toThrow("SSO user resolution requires database-backed sessions");
	});
});
