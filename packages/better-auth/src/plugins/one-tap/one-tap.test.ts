// cspell:ignore AQAB
import type { BetterAuthClientPlugin } from "@better-auth/core";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import type { oneTap as oneTapFromSubpath } from "better-auth/plugins/one-tap";
import { jwtVerify } from "jose";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { createAuthClient } from "../../client";
import { getTestInstance } from "../../test-utils/test-instance";
import { lastLoginMethod } from "../last-login-method";
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
		decodeJwt: vi.fn(() => verifiedPayload),
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

/**
 * @see https://github.com/better-auth/better-auth/issues/10995
 */
describe("one-tap last login method", () => {
	it("records Google as the last login method after a one-tap callback", async () => {
		const { auth } = await getTestInstance({
			plugins: [oneTap({ clientId: "test-google-client" }), lastLoginMethod()],
		});
		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/one-tap/callback", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ idToken: "stub-id-token" }),
			}),
		);

		expect(response.status).toBe(200);
		expect(response.headers.getSetCookie()).toContainEqual(
			expect.stringContaining("better-auth.last_used_login_method=google"),
		);
	});

	it("persists Google as the last login method after a one-tap callback", async () => {
		const { auth } = await getTestInstance({
			plugins: [
				oneTap({ clientId: "test-google-client" }),
				lastLoginMethod({ storeInDatabase: true }),
			],
		});
		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/one-tap/callback", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ idToken: "stub-id-token" }),
			}),
		);

		expect(response.status).toBe(200);
		const context = await auth.$context;
		const user = await context.adapter.findOne<{ lastLoginMethod: string }>({
			model: "user",
			where: [{ field: "email", value: defaultVerifiedPayload.email }],
		});
		expect(user?.lastLoginMethod).toBe("google");
	});
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
describe("one-tap Google profile mapping", () => {
	afterEach(() => {
		// biome-ignore lint/performance/noDelete: drop the claim the mapper test adds
		delete (verifiedPayload as Record<string, unknown>).given_name;
		Object.assign(verifiedPayload, defaultVerifiedPayload);
	});

	it("applies socialProviders.google.mapProfileToUser", async () => {
		verifiedPayload.email = "one-tap-mapper@example.com";
		verifiedPayload.sub = "one-tap-mapper-sub";
		Object.assign(verifiedPayload, { given_name: "Mary Jane" });

		const { auth } = await getTestInstance({
			user: {
				additionalFields: {
					firstName: { type: "string", required: false },
				},
			},
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					mapProfileToUser: (profile) => ({
						firstName: profile.given_name,
						name: "Mapped Name",
					}),
				},
			},
			plugins: [oneTap()],
		});

		const res = await auth.api.oneTapCallback({
			body: { idToken: "stub-id-token" },
		});

		expect(res.user).toMatchObject({
			email: "one-tap-mapper@example.com",
			name: "Mapped Name",
			firstName: "Mary Jane",
		});
	});

	it("uses a custom socialProviders.google.getUserInfo, keeping the verified sub as the account id", async () => {
		verifiedPayload.email = "one-tap-override@example.com";
		verifiedPayload.sub = "one-tap-override-sub";

		const { auth } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					getUserInfo: async () => ({
						user: {
							name: "From Override",
							email: "one-tap-override@example.com",
							emailVerified: true,
						},
						data: { ...verifiedPayload } as GoogleProfile,
					}),
				},
			},
			plugins: [oneTap()],
		});

		const res = await auth.api.oneTapCallback({
			body: { idToken: "stub-id-token" },
		});

		expect(res.user.name).toBe("From Override");
		const ctx = await auth.$context;
		const accounts = await ctx.adapter.findMany<{ accountId: string }>({
			model: "account",
			where: [{ field: "userId", value: res.user.id }],
		});
		expect(accounts).toEqual([
			expect.objectContaining({ accountId: "one-tap-override-sub" }),
		]);
	});

	it("refreshes a returning user from the mapper when overrideUserInfoOnSignIn is on", async () => {
		verifiedPayload.email = "one-tap-override-on-sign-in@example.com";
		verifiedPayload.sub = "one-tap-override-on-sign-in-sub";

		const { auth } = await getTestInstance({
			socialProviders: {
				google: {
					clientId: "test-client",
					clientSecret: "test-secret",
					overrideUserInfoOnSignIn: true,
					mapProfileToUser: (profile) => ({ name: `Mapped ${profile.name}` }),
				},
			},
			plugins: [oneTap()],
		});

		await auth.api.oneTapCallback({ body: { idToken: "stub-id-token" } });
		verifiedPayload.name = "Renamed";
		const res = await auth.api.oneTapCallback({
			body: { idToken: "stub-id-token" },
		});

		expect(res.user.name).toBe("Mapped Renamed");
	});

	it("builds the user from the token claims without a Google provider", async () => {
		verifiedPayload.email = "One-Tap-No-Provider@Example.com";
		verifiedPayload.sub = "one-tap-no-provider-sub";

		const { auth } = await getTestInstance({
			socialProviders: {},
			plugins: [oneTap({ clientId: "explicit-one-tap-client" })],
		});

		const res = await auth.api.oneTapCallback({
			body: { idToken: "stub-id-token" },
		});

		expect(res.user).toMatchObject({
			email: "one-tap-no-provider@example.com",
			emailVerified: true,
			name: defaultVerifiedPayload.name,
			image: defaultVerifiedPayload.picture,
		});
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

describe("oneTapClient plugin-level options", async () => {
	const initialize = vi.fn();
	const renderButton = vi.fn();
	// Report "not displayed" so the prompt flow resolves after one attempt.
	const prompt = vi.fn((listener: (notification: unknown) => void) =>
		listener({ isNotDisplayed: () => true }),
	);

	afterEach(() => {
		initialize.mockReset();
		vi.unstubAllGlobals();
	});

	const { client } = await getTestInstance(
		{
			socialProviders: {
				google: { clientId: "test-client", clientSecret: "test-secret" },
			},
			plugins: [oneTap()],
		},
		{
			clientOptions: {
				plugins: [
					oneTapClient({
						clientId: "test-client",
						autoSelect: true,
						cancelOnTapOutside: false,
					}),
				],
			},
		},
	);

	const stubBrowser = () =>
		vi.stubGlobal("window", {
			document: {},
			googleScriptInitialized: true,
			google: { accounts: { id: { initialize, renderButton, prompt } } },
		});

	const flows = [
		["prompt", {}],
		["button", { button: { container: {} as HTMLElement } }],
	] as const;

	it.each(flows)(
		"passes plugin-level options to the %s flow",
		async (_, flow) => {
			stubBrowser();
			await client.oneTap({ ...flow, fetchOptions: {} });

			expect(initialize).toHaveBeenCalledWith(
				expect.objectContaining({
					auto_select: true,
					cancel_on_tap_outside: false,
				}),
			);
		},
	);

	it.each(flows)(
		"lets action options override the plugin in the %s flow",
		async (_, flow) => {
			stubBrowser();
			await client.oneTap({
				...flow,
				autoSelect: false,
				cancelOnTapOutside: true,
				fetchOptions: {},
			});

			expect(initialize).toHaveBeenCalledWith(
				expect.objectContaining({
					auto_select: false,
					cancel_on_tap_outside: true,
				}),
			);
		},
	);
});

/**
 * @see https://github.com/better-auth/better-auth/issues/10172
 */
describe("one-tap subpath export", () => {
	it("should be importable from better-auth/plugins/one-tap", () => {
		expectTypeOf<typeof oneTapFromSubpath>().toEqualTypeOf<typeof oneTap>();
	});
});

/**
 * With FedCM, Google no longer supports display-moment notifications or
 * skipped-moment reasons. FedCM is always on for the prompt, so
 * `fedCM: false` must avoid them too.
 *
 * @see https://github.com/better-auth/better-auth/issues/10380
 * @see https://developers.google.com/identity/gsi/web/guides/fedcm-migration
 */
describe("one-tap prompt notifications", () => {
	const notification = (moment: "display" | "skipped") => ({
		isDisplayMoment: vi.fn(() => moment === "display"),
		isDisplayed: vi.fn(() => false),
		isNotDisplayed: vi.fn(() => moment === "display"),
		getNotDisplayedReason: vi.fn(() => "opt_out_or_no_session"),
		isSkippedMoment: vi.fn(() => moment === "skipped"),
		getSkippedReason: vi.fn(() => "auto_cancel"),
		isDismissedMoment: vi.fn(() => false),
		getDismissedReason: vi.fn(),
	});

	const runPrompt = async (
		moment: ReturnType<typeof notification>,
		fedCM?: boolean,
	) => {
		const { client } = await getTestInstance(
			{ plugins: [oneTap()] },
			{
				clientOptions: {
					plugins: [
						oneTapClient({
							clientId: "test-client",
							promptOptions: { fedCM, baseDelay: 0 },
						}),
					],
				},
			},
		);
		const prompt = vi.fn((listener: (n: unknown) => void) => listener(moment));
		vi.stubGlobal("window", {
			document: {},
			googleScriptInitialized: true,
			google: { accounts: { id: { initialize: vi.fn(), prompt } } },
		});
		const onPromptNotification = vi.fn();
		await client.oneTap({ onPromptNotification });
		return { prompt, onPromptNotification };
	};

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it.each([
		["default", undefined],
		["fedCM: false", false],
	])(
		"ends a skipped prompt without unsupported calls (%s)",
		async (_, fedCM) => {
			const skipped = notification("skipped");
			const { prompt, onPromptNotification } = await runPrompt(skipped, fedCM);

			expect(prompt).toHaveBeenCalledTimes(1);
			expect(onPromptNotification).toHaveBeenCalledExactlyOnceWith(skipped);
			expect(skipped.getSkippedReason).not.toHaveBeenCalled();
			expect(skipped.isDisplayMoment).not.toHaveBeenCalled();
			expect(skipped.isDisplayed).not.toHaveBeenCalled();
			expect(skipped.isNotDisplayed).not.toHaveBeenCalled();
			expect(skipped.getNotDisplayedReason).not.toHaveBeenCalled();
		},
	);

	it("ends a prompt that a browser without FedCM did not display", async () => {
		const notDisplayed = notification("display");
		const { onPromptNotification } = await runPrompt(notDisplayed);

		expect(onPromptNotification).toHaveBeenCalledExactlyOnceWith(notDisplayed);
	});
});
