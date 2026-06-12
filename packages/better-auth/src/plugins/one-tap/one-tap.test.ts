import { afterEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oneTap } from "./index";

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
		createRemoteJWKSet: vi.fn(() => async () => undefined),
		jwtVerify: vi.fn(async () => ({
			payload: verifiedPayload,
			protectedHeader: { alg: "RS256" },
		})),
	};
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
		const otherUser = await ctx.internalAdapter.createUser({
			name: "Other Provider User",
			email: "one-tap-other-provider@example.com",
		});
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

		const userA = await ctx.internalAdapter.createUser({
			name: "Sub Owner A",
			email: "one-tap-sub-owner-a@example.com",
		});
		await ctx.internalAdapter.createAccount({
			userId: userA.id,
			providerId: "google",
			accountId: sharedSub,
		});
		const userB = await ctx.internalAdapter.createUser({
			name: "Email Match B",
			email: verifiedPayload.email,
		});

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
	});
});
