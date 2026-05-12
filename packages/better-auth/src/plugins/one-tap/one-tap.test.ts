import { afterEach, describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { oneTap } from "./index";

const verifiedPayload = {
	email: "one-tap-user@example.com",
	email_verified: true,
	name: "One Tap User",
	picture: "https://example.com/photo.jpg",
	sub: "google_oauth_sub_one_tap",
};

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
		verifiedPayload.email_verified = true;
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
