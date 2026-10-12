// cspell:ignore AQAB
import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { OAuthMappedUser } from "@better-auth/core/oauth2";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { jwtVerify } from "jose";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { oneTapClient } from "./client";
import { oneTap } from "./index";

vi.mock("@better-fetch/fetch", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@better-fetch/fetch")>();
	return {
		...actual,
		betterFetch: vi.fn(async () => ({
			data: {
				keys: [
					{
						kid: "test-google-key",
						alg: "RS256",
						kty: "RSA",
						use: "sig",
						n: "test-modulus",
						e: "AQAB",
					},
				],
			},
			error: null,
		})),
	};
});

const defaultVerifiedPayload = {
	email: "one-tap-user@example.com",
	email_verified: true,
	name: "One Tap User",
	picture: "https://example.com/photo.jpg",
	sub: "google_oauth_sub_one_tap",
};

const verifiedPayload = { ...defaultVerifiedPayload };

vi.mock("jose", async (importOriginal) => {
	const actual = await importOriginal<typeof import("jose")>();
	return {
		...actual,
		decodeProtectedHeader: vi.fn(() => ({
			kid: "test-google-key",
			alg: "RS256",
		})),
		importJWK: vi.fn(async () => ({})),
		jwtVerify: vi.fn(async () => ({
			payload: verifiedPayload,
			protectedHeader: { alg: "RS256" },
		})),
	};
});

afterEach(() => {
	vi.mocked(jwtVerify).mockClear();
});

describe("one-tap implicit linking gate", async () => {
	afterEach(() => {
		Object.assign(verifiedPayload, defaultVerifiedPayload);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-g38m-r43w-p2q7
	 */
	it("rejects implicit linking when the local user is unverified", async () => {
		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
				},
			},
			plugins: [oneTap()],
		});

		await client.signUp.email({
			email: verifiedPayload.email,
			password: "password123",
			name: "Pre-existing Unverified",
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number; code?: string } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error?.status).toBe(401);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-g38m-r43w-p2q7
	 */
	it("allows implicit linking once the local user is verified", async () => {
		const { auth, client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
				},
			},
			plugins: [oneTap()],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => ({
							data: { ...user, emailVerified: true },
						}),
					},
				},
			},
		});

		await client.signUp.email({
			email: verifiedPayload.email,
			password: "password123",
			name: "Pre-existing Verified",
		});

		const res = await client.$fetch<{
			data: { user: { id: string } } | null;
			error: unknown;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		const ctx = await auth.$context;
		const accounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [
				{
					field: "providerId",
					value: "google",
				},
			],
		});
		expect(accounts.length).toBeGreaterThanOrEqual(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/security/advisories/GHSA-g38m-r43w-p2q7
	 */
	it("links the account when requireLocalEmailVerified is opted out, even for an unverified local user", async () => {
		const { auth, client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
				},
			},
			account: {
				accountLinking: {
					requireLocalEmailVerified: false,
				},
			},
			plugins: [oneTap()],
		});

		await client.signUp.email({
			email: verifiedPayload.email,
			password: "password123",
			name: "Pre-existing Unverified (Opted-out)",
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		const ctx = await auth.$context;
		const accounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [
				{
					field: "providerId",
					value: "google",
				},
			],
		});
		expect(accounts.length).toBeGreaterThanOrEqual(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9486
	 */
	it("returns 403 EMAIL_NOT_VERIFIED when the provider requires a verified email", async () => {
		verifiedPayload.email = "one-tap-unverified@example.com";
		verifiedPayload.email_verified = false;
		verifiedPayload.sub = "one_tap_unverified_sub";

		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
					requireEmailVerification: true,
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		// 403 distinguishes the mapped EMAIL_NOT_VERIFIED gate from the generic
		// 401 the unverified-linking path returns.
		expect(res.error?.status).toBe(403);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9502
	 */
	it("links Google One Tap when another provider has the same account ID", async () => {
		verifiedPayload.email = "one-tap-provider-collision@example.com";
		verifiedPayload.sub = "shared-one-tap-provider-account-id";

		const { auth, client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
				},
			},
			account: {
				accountLinking: {
					requireLocalEmailVerified: false,
				},
			},
			plugins: [oneTap()],
		});

		const ctx = await auth.$context;
		const otherUser = await ctx.internalAdapter.createUser(
			{
				name: "Other Provider User",
				email: "one-tap-other-provider@example.com",
			},
			{ method: "test" },
		);
		await ctx.internalAdapter.createAccount({
			userId: otherUser.id,
			providerId: "github",
			accountId: verifiedPayload.sub,
		});

		await client.signUp.email({
			email: verifiedPayload.email,
			password: "password123",
			name: "Pre-existing Local User",
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		const googleAccounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [
				{ field: "providerId", value: "google" },
				{ field: "accountId", value: verifiedPayload.sub },
			],
		});
		expect(googleAccounts).toHaveLength(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9502
	 */
	it("does not duplicate the Google account when the same user signs in again", async () => {
		verifiedPayload.email = "one-tap-returning-user@example.com";
		verifiedPayload.sub = "returning-user-google-sub";

		const { auth, client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
				},
			},
			plugins: [oneTap()],
		});
		const ctx = await auth.$context;

		const callOneTap = () =>
			client.$fetch<{ token?: string }>("/one-tap/callback", {
				method: "POST",
				body: { idToken: "stub-id-token" },
			});

		const first = await callOneTap();
		expect(first.error).toBeFalsy();
		expect(first.data?.token).toBeTruthy();

		// Second sign-in finds the user's own Google account and skips re-linking.
		const second = await callOneTap();
		expect(second.error).toBeFalsy();
		expect(second.data?.token).toBeTruthy();

		const googleAccounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [
				{ field: "providerId", value: "google" },
				{ field: "accountId", value: verifiedPayload.sub },
			],
		});
		expect(googleAccounts).toHaveLength(1);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/9502
	 *
	 * Identity must resolve by the Google `sub`, not the token email. A Google
	 * credential already linked to user A must sign in A, even when the token's
	 * email matches a different local user B.
	 */
	it("signs in the account that owns the Google sub, not the email-matched user", async () => {
		const sharedSub = "one-tap-sub-owned-by-user-a";
		verifiedPayload.email = "one-tap-email-collision-b@example.com";
		verifiedPayload.sub = sharedSub;

		const { auth, client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
				},
			},
			plugins: [oneTap()],
		});
		const ctx = await auth.$context;

		const userA = await ctx.internalAdapter.createUser(
			{
				name: "Sub Owner A",
				email: "one-tap-sub-owner-a@example.com",
			},
			{ method: "test" },
		);
		await ctx.internalAdapter.createAccount({
			userId: userA.id,
			providerId: "google",
			issuer: "https://accounts.google.com",
			accountId: sharedSub,
		});
		const userB = await ctx.internalAdapter.createUser(
			{
				name: "Email Match B",
				email: verifiedPayload.email,
			},
			{ method: "test" },
		);

		const res = await client.$fetch<{ user?: { id: string } }>(
			"/one-tap/callback",
			{ method: "POST", body: { idToken: "stub-id-token" } },
		);

		expect(res.error).toBeFalsy();
		expect(res.data?.user?.id).toBe(userA.id);
		expect(res.data?.user?.id).not.toBe(userB.id);
	});

	it("honors accountLinking.disableImplicitLinking even when the local user is verified", async () => {
		const { auth, client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
				},
			},
			account: {
				accountLinking: {
					disableImplicitLinking: true,
				},
			},
			plugins: [oneTap()],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => ({
							data: { ...user, emailVerified: true },
						}),
					},
				},
			},
		});

		await client.signUp.email({
			email: verifiedPayload.email,
			password: "password123",
			name: "Pre-existing Verified, Linking Disabled",
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error?.status).toBe(401);

		const ctx = await auth.$context;
		const accounts = await ctx.adapter.findMany<{ providerId: string }>({
			model: "account",
			where: [
				{
					field: "providerId",
					value: "google",
				},
			],
		});
		expect(accounts.length).toBe(0);
	});
});

describe("one-tap callbackURL origin validation", async () => {
	const googleProvider = {
		clientId: "test-client",
		clientSecret: "test-secret",
		enabled: true,
	};

	it("rejects an untrusted callbackURL via the global origin check", async () => {
		const { client } = await getTestInstance({
			socialProviders: { google: googleProvider },
			plugins: [oneTap()],
			advanced: { disableOriginCheck: false },
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: {
				idToken: "stub-id-token",
				callbackURL: "https://untrusted.example/callback",
			},
		});

		expect(res.error?.status).toBe(403);
	});

	it("accepts a relative callbackURL (origin check passes)", async () => {
		const { client } = await getTestInstance({
			socialProviders: { google: googleProvider },
			plugins: [oneTap()],
			advanced: { disableOriginCheck: false },
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token", callbackURL: "/dashboard" },
		});

		// The origin check must not block a same-app relative redirect target.
		expect(res.error?.status).not.toBe(403);
	});
});

describe("one-tap audience enforcement", async () => {
	afterEach(() => {
		Object.assign(verifiedPayload, defaultVerifiedPayload);
	});

	it("rejects the callback when no Google client ID is configured", async () => {
		// No `socialProviders.google` and no `oneTap({ clientId })`, so there is no
		// expected audience. Without one, jose would verify Google's signature but
		// not that the token was minted for this app, so the request must fail
		// closed before verification rather than accept a cross-client token.
		// (`socialProviders: {}` overrides the test default, which configures
		// google with a client id.)
		const { client } = await getTestInstance({
			socialProviders: {},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number; message?: string } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error?.status).toBe(400);
		expect(res.error?.message).toContain("Google client ID is required");
		expect(jwtVerify).not.toHaveBeenCalled();
	});

	it("accepts the oneTap-level clientId as the audience without a Google provider", async () => {
		const { client } = await getTestInstance({
			socialProviders: {},
			plugins: [oneTap({ clientId: "explicit-one-tap-client" })],
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number; message?: string } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		// The audience guard is satisfied, so the request is not rejected for a
		// missing client ID (verification proceeds via the mocked jose).
		expect(res.error?.message ?? "").not.toContain(
			"Google client ID is required",
		);
		expect(jwtVerify).toHaveBeenCalledWith(
			"stub-id-token",
			expect.any(Object),
			expect.objectContaining({
				audience: "explicit-one-tap-client",
			}),
		);
	});

	it("rejects the callback when the verified token has no email", async () => {
		const { client } = await getTestInstance({
			socialProviders: {},
			plugins: [oneTap({ clientId: "explicit-one-tap-client" })],
		});

		verifiedPayload.email = "";

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number; message?: string } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error?.status).toBe(400);
		expect(res.error?.message).toContain("Email not available in token");
	});
});

describe("one-tap hosted domain (hd)", async () => {
	afterEach(() => {
		Object.assign(verifiedPayload, defaultVerifiedPayload);
		(verifiedPayload as Record<string, unknown>).hd = undefined;
	});

	const withHd = {
		clientId: "test-client",
		clientSecret: "test-secret",
		enabled: true,
		hd: "company.com",
	};

	it("rejects a token whose hd does not match the configured value", async () => {
		verifiedPayload.email = "one-tap-hd-mismatch@other.com";
		verifiedPayload.sub = "one-tap-hd-mismatch-sub";
		(verifiedPayload as Record<string, unknown>).hd = "other.com";

		const { client } = await getTestInstance({
			socialProviders: { google: withHd },
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error?.status).toBe(400);
	});

	it("rejects a token with no hd when one is configured", async () => {
		verifiedPayload.email = "one-tap-hd-missing@company.com";
		verifiedPayload.sub = "one-tap-hd-missing-sub";

		const { client } = await getTestInstance({
			socialProviders: { google: withHd },
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error?.status).toBe(400);
	});

	it("accepts a token whose hd matches the configured value", async () => {
		verifiedPayload.email = "one-tap-hd-match@company.com";
		verifiedPayload.sub = "one-tap-hd-match-sub";
		(verifiedPayload as Record<string, unknown>).hd = "company.com";

		const { client } = await getTestInstance({
			socialProviders: { google: withHd },
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{ token?: string }>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(res.data?.token).toBeTruthy();
	});

	it("accepts any Workspace hd when the configured value is a wildcard", async () => {
		verifiedPayload.email = "one-tap-hd-wildcard@company.com";
		verifiedPayload.sub = "one-tap-hd-wildcard-sub";
		(verifiedPayload as Record<string, unknown>).hd = "company.com";

		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					...withHd,
					hd: "*",
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{ token?: string }>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(res.data?.token).toBeTruthy();
	});

	it("rejects a token with no hd when the configured value is a wildcard", async () => {
		verifiedPayload.email = "one-tap-hd-wildcard-missing@example.com";
		verifiedPayload.sub = "one-tap-hd-wildcard-missing-sub";

		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					...withHd,
					hd: "*",
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			data: unknown;
			error: { status: number } | null;
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error?.status).toBe(400);
	});

	it("ignores the token hd when no hosted domain is configured", async () => {
		verifiedPayload.email = "one-tap-no-hd-config@anywhere.com";
		verifiedPayload.sub = "one-tap-no-hd-config-sub";
		(verifiedPayload as Record<string, unknown>).hd = "anywhere.com";

		const { client } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{ token?: string }>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(res.data?.token).toBeTruthy();
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10478
 */
describe("one-tap disableSignUp", () => {
	afterEach(() => {
		Object.assign(verifiedPayload, defaultVerifiedPayload);
	});

	it("rejects provider-disabled sign-up without creating a user", async () => {
		verifiedPayload.email = "one-tap-disable-signup@example.com";
		verifiedPayload.sub = "one-tap-disable-signup-sub";

		const { auth } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
					disableSignUp: true,
				},
			},
			plugins: [oneTap()],
		});

		await expect(
			auth.api.oneTapCallback({
				body: { idToken: "stub-id-token" },
			}),
		).rejects.toMatchObject({
			statusCode: 401,
			status: "UNAUTHORIZED",
			body: { message: "signup disabled" },
		});

		const ctx = await auth.$context;
		const users = await ctx.adapter.findMany<{ email: string }>({
			model: "user",
			where: [
				{
					field: "email",
					value: verifiedPayload.email,
				},
			],
		});
		expect(users).toHaveLength(0);
	});

	it("keeps provider sign-up disabled when One Tap enables it", async () => {
		verifiedPayload.email = "one-tap-signup-override@example.com";
		verifiedPayload.sub = "one-tap-signup-override-sub";

		const { auth } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
					disableSignUp: true,
				},
			},
			plugins: [oneTap({ disableSignup: false })],
		});

		await expect(
			auth.api.oneTapCallback({
				body: { idToken: "stub-id-token" },
			}),
		).rejects.toMatchObject({
			statusCode: 401,
			status: "UNAUTHORIZED",
			body: { message: "signup disabled" },
		});
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/9460
 */
describe("one-tap mapProfileToUser and OIDC profile claims", () => {
	afterEach(() => {
		// biome-ignore lint/performance/noDelete: test cleanup
		delete (verifiedPayload as Record<string, unknown>).given_name;
		// biome-ignore lint/performance/noDelete: test cleanup
		delete (verifiedPayload as Record<string, unknown>).family_name;
		// biome-ignore lint/performance/noDelete: test cleanup
		delete (verifiedPayload as Record<string, unknown>).locale;
		Object.assign(verifiedPayload, defaultVerifiedPayload);
	});

	it("honors socialProviders.google.mapProfileToUser and populates mapped attributes on user creation", async () => {
		verifiedPayload.email = "one-tap-map-provider@example.com";
		verifiedPayload.sub = "google_sub_map_provider";
		Object.assign(verifiedPayload, {
			given_name: "Alice",
			family_name: "Smith",
			locale: "en-US",
		});

		const mapProfileToUser = vi.fn((profile: GoogleProfile) => ({
			firstName: profile.given_name,
			lastName: profile.family_name,
			locale: profile.locale,
		}));

		const { client } = await getTestInstance({
			user: {
				additionalFields: {
					firstName: { type: "string", required: false },
					lastName: { type: "string", required: false },
					locale: { type: "string", required: false },
				},
			},
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
					mapProfileToUser,
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			user?: {
				id: string;
				firstName?: string;
				lastName?: string;
				locale?: string;
			};
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(mapProfileToUser).toHaveBeenCalled();
		expect(res.data?.user?.firstName).toBe("Alice");
		expect(res.data?.user?.lastName).toBe("Smith");
		expect(res.data?.user?.locale).toBe("en-US");
	});

	it("honors oneTap({ mapProfileToUser }) option directly", async () => {
		verifiedPayload.email = "one-tap-plugin-mapper@example.com";
		verifiedPayload.sub = "google_sub_plugin_mapper";
		Object.assign(verifiedPayload, {
			given_name: "Bob",
			family_name: "Jones",
			locale: "fr-FR",
		});

		const providerMapper = vi.fn();
		const pluginMapper = vi.fn((profile: GoogleProfile) => ({
			firstName: `plugin_${profile.given_name}`,
			lastName: `plugin_${profile.family_name}`,
		}));

		const { client } = await getTestInstance({
			user: {
				additionalFields: {
					firstName: { type: "string", required: false },
					lastName: { type: "string", required: false },
				},
			},
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
					mapProfileToUser: providerMapper,
				},
			},
			plugins: [
				oneTap({
					mapProfileToUser: pluginMapper,
				}),
			],
		});

		const res = await client.$fetch<{
			user?: {
				id: string;
				firstName?: string;
				lastName?: string;
			};
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(pluginMapper).toHaveBeenCalled();
		expect(providerMapper).not.toHaveBeenCalled();
		expect(res.data?.user?.firstName).toBe("plugin_Bob");
		expect(res.data?.user?.lastName).toBe("plugin_Jones");
	});

	it("passes standard OIDC claims (given_name, family_name, locale) to user if defined in schema additionalFields", async () => {
		verifiedPayload.email = "one-tap-claims@example.com";
		verifiedPayload.sub = "google_sub_claims";
		Object.assign(verifiedPayload, {
			given_name: "Jane",
			family_name: "Doe",
			locale: "en-US",
		});

		const { client, auth } = await getTestInstance({
			user: {
				additionalFields: {
					given_name: { type: "string", required: false },
					family_name: { type: "string", required: false },
					locale: { type: "string", required: false },
				},
			},
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			user?: {
				id: string;
				given_name?: string;
				family_name?: string;
				locale?: string;
			};
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();

		const ctx = await auth.$context;
		const userInDb = await ctx.adapter.findOne<{
			given_name?: string;
			family_name?: string;
			locale?: string;
		}>({
			model: "user",
			where: [{ field: "email", value: "one-tap-claims@example.com" }],
		});

		expect(userInDb?.given_name).toBe("Jane");
		expect(userInDb?.family_name).toBe("Doe");
		expect(userInDb?.locale).toBe("en-US");
	});

	it("strips id if returned from mapProfileToUser so local user primary key is preserved", async () => {
		verifiedPayload.email = "one-tap-strip-id@example.com";
		verifiedPayload.sub = "google_sub_strip_id";

		const { client, auth } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
					mapProfileToUser: () =>
						({
							id: "malicious-external-id",
							name: "Mapped Name",
						}) as unknown as OAuthMappedUser,
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			user?: {
				id: string;
				name: string;
			};
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(res.data?.user?.name).toBe("Mapped Name");
		expect(res.data?.user?.id).not.toBe("malicious-external-id");

		const ctx = await auth.$context;
		const userInDb = await ctx.adapter.findOne<{
			id: string;
			name: string;
		}>({
			model: "user",
			where: [{ field: "email", value: "one-tap-strip-id@example.com" }],
		});

		expect(userInDb?.id).not.toBe("malicious-external-id");
		expect(userInDb?.id).toBe(res.data?.user?.id);
	});

	it("honors async Promise-returning mapProfileToUser and can override emailVerified", async () => {
		verifiedPayload.email = "one-tap-async-mapper@example.com";
		verifiedPayload.sub = "google_sub_async_mapper";
		verifiedPayload.email_verified = false;
		Object.assign(verifiedPayload, {
			given_name: "AsyncAlice",
			family_name: "AsyncSmith",
		});

		const mapProfileToUser = vi.fn(async (profile: GoogleProfile) => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			return {
				firstName: profile.given_name,
				emailVerified: true,
			};
		});

		const { client, auth } = await getTestInstance({
			user: {
				additionalFields: {
					firstName: { type: "string", required: false },
				},
			},
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
					mapProfileToUser,
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			user?: {
				id: string;
				firstName?: string;
				emailVerified?: boolean;
			};
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(mapProfileToUser).toHaveBeenCalled();
		expect(res.data?.user?.firstName).toBe("AsyncAlice");
		expect(res.data?.user?.emailVerified).toBe(true);

		const ctx = await auth.$context;
		const userInDb = await ctx.adapter.findOne<{
			firstName?: string;
			emailVerified?: boolean;
		}>({
			model: "user",
			where: [{ field: "email", value: "one-tap-async-mapper@example.com" }],
		});

		expect(userInDb?.firstName).toBe("AsyncAlice");
		expect(userInDb?.emailVerified).toBe(true);
	});

	it("preserves schema defaultValue for OIDC claims when ID token omits them", async () => {
		verifiedPayload.email = "one-tap-defaults@example.com";
		verifiedPayload.sub = "google_sub_defaults";

		const { client, auth } = await getTestInstance({
			user: {
				additionalFields: {
					locale: {
						type: "string",
						required: false,
						defaultValue: "en-DEFAULT",
					},
					given_name: {
						type: "string",
						required: false,
						defaultValue: "DefaultGiven",
					},
				},
			},
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			user?: {
				id: string;
				locale?: string;
				given_name?: string;
			};
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(res.data?.user?.locale).toBe("en-DEFAULT");
		expect(res.data?.user?.given_name).toBe("DefaultGiven");

		const ctx = await auth.$context;
		const userInDb = await ctx.adapter.findOne<{
			locale?: string;
			given_name?: string;
		}>({
			model: "user",
			where: [{ field: "email", value: "one-tap-defaults@example.com" }],
		});

		expect(userInDb?.locale).toBe("en-DEFAULT");
		expect(userInDb?.given_name).toBe("DefaultGiven");
	});

	it("filters undefined values from mapProfileToUser so claims and schema defaults are preserved", async () => {
		verifiedPayload.email = "one-tap-filter-undefined@example.com";
		verifiedPayload.sub = "google_sub_filter_undefined";
		Object.assign(verifiedPayload, {
			given_name: "OriginalGiven",
		});

		const { client, auth } = await getTestInstance({
			user: {
				additionalFields: {
					given_name: { type: "string", required: false },
					role: {
						type: "string",
						required: false,
						defaultValue: "user",
					},
				},
			},
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
					mapProfileToUser: () => ({
						given_name: undefined,
						role: undefined,
					}),
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			user?: {
				id: string;
				given_name?: string;
				role?: string;
			};
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(res.data?.user?.given_name).toBe("OriginalGiven");
		expect(res.data?.user?.role).toBe("user");

		const ctx = await auth.$context;
		const userInDb = await ctx.adapter.findOne<{
			given_name?: string;
			role?: string;
		}>({
			model: "user",
			where: [
				{ field: "email", value: "one-tap-filter-undefined@example.com" },
			],
		});
		expect(userInDb?.given_name).toBe("OriginalGiven");
		expect(userInDb?.role).toBe("user");
	});

	it("filters undefined values so required schema fields are not bypassed", async () => {
		verifiedPayload.email = "one-tap-required-field@example.com";
		verifiedPayload.sub = "google_sub_required_field";

		const { auth } = await getTestInstance(
			{
				user: {
					additionalFields: {
						mandatoryRole: { type: "string", required: true },
					},
				},
				socialProviders: {
					google: {
						clientId: "test-client",
						clientSecret: "test-secret",
						enabled: true,
						mapProfileToUser: () => ({
							mandatoryRole: undefined,
						}),
					},
				},
				plugins: [oneTap()],
			},
			{ disableTestUser: true },
		);

		await expect(
			auth.api.oneTapCallback({
				body: { idToken: "stub-id-token" },
			}),
		).rejects.toMatchObject({
			statusCode: 400,
			body: expect.objectContaining({
				message: expect.stringContaining("mandatoryRole is required"),
			}),
		});
	});

	it("allows sign-in when token lacks email but mapProfileToUser synthesizes a placeholder email", async () => {
		verifiedPayload.email = "";
		verifiedPayload.sub = "google_sub_placeholder_email";

		const placeholderEmail = "placeholder_user@internal.app";
		const { client, auth } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
					mapProfileToUser: () => ({
						email: placeholderEmail,
					}),
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			user?: {
				id: string;
				email: string;
				emailVerified: boolean;
			};
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(res.data?.user?.email).toBe(placeholderEmail);
		expect(res.data?.user?.emailVerified).toBe(false);

		const ctx = await auth.$context;
		const userInDb = await ctx.adapter.findOne<{
			email: string;
			emailVerified: boolean;
		}>({
			model: "user",
			where: [{ field: "email", value: placeholderEmail }],
		});
		expect(userInDb?.email).toBe(placeholderEmail);
		expect(userInDb?.emailVerified).toBe(false);
	});

	it("defaults emailVerified to false when mapProfileToUser modifies email without an explicit emailVerified flag", async () => {
		verifiedPayload.email = "google-verified@example.com";
		verifiedPayload.email_verified = true;
		verifiedPayload.sub = "google_sub_override_email_unverified";

		const alteredEmail = "custom-override@example.com";
		const { client, auth } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					enabled: true,
					mapProfileToUser: () => ({
						email: alteredEmail,
					}),
				},
			},
			plugins: [oneTap()],
		});

		const res = await client.$fetch<{
			user?: {
				id: string;
				email: string;
				emailVerified: boolean;
			};
		}>("/one-tap/callback", {
			method: "POST",
			body: { idToken: "stub-id-token" },
		});

		expect(res.error).toBeFalsy();
		expect(res.data?.user?.email).toBe(alteredEmail);
		expect(res.data?.user?.emailVerified).toBe(false);

		const ctx = await auth.$context;
		const userInDb = await ctx.adapter.findOne<{
			email: string;
			emailVerified: boolean;
		}>({
			model: "user",
			where: [{ field: "email", value: alteredEmail }],
		});
		expect(userInDb?.email).toBe(alteredEmail);
		expect(userInDb?.emailVerified).toBe(false);
	});
});

/**
 * Declaration emit previously left `getActions`'s `$fetch` parameter
 * un-annotated. With no import of `BetterFetch` in the file, emit had no
 * name to reference and inlined `import("@better-fetch/fetch").BetterFetch`
 * instead, which is not assignable to `BetterAuthClientPlugin`'s
 * `getActions`. As a result, the client lost the `oneTap` action.
 *
 * @see https://github.com/better-auth/better-auth/issues/10583
 */
describe("oneTapClient types", () => {
	it("should be assignable to BetterAuthClientPlugin", () => {
		const plugin: BetterAuthClientPlugin = oneTapClient({
			clientId: "test-client",
		});
		expect(plugin.id).toBe("one-tap");
	});

	it("should preserve the oneTap client action", () => {
		const client = createAuthClient({
			plugins: [oneTapClient({ clientId: "test-client" })],
		});
		expectTypeOf(client.oneTap).toBeFunction();
	});
});
