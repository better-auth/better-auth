import { safeJSONParse } from "@better-auth/core/utils/json";
import { magicLinkClient } from "better-auth/client/plugins";
import { magicLink } from "better-auth/plugins";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it } from "vitest";

interface VerificationEmail {
	email: string;
	token: string;
	url: string;
}

/**
 * @see https://github.com/better-auth/better-auth/issues/8228
 */
describe("magic link with secondary storage (string return)", async () => {
	const store = new Map<string, string>();
	let verificationEmail: VerificationEmail = {
		email: "",
		token: "",
		url: "",
	};

	const { testUser, sessionSetter, client } = await getTestInstance(
		{
			secondaryStorage: {
				set(key, value, ttl) {
					store.set(key, value);
				},
				get(key) {
					return store.get(key) || null;
				},
				delete(key) {
					store.delete(key);
				},
			},
			rateLimit: {
				enabled: false,
			},
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						verificationEmail = data;
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [magicLinkClient()],
			},
		},
	);

	it("should send and verify magic link", async () => {
		await client.signIn.magicLink({
			email: testUser.email,
		});
		expect(verificationEmail.email).toBe(testUser.email);
		expect(verificationEmail.url).toContain(
			"http://localhost:3000/api/auth/magic-link/verify",
		);

		// Verify a verification entry exists in store
		const verificationKeys = [...store.keys()].filter((k) =>
			k.startsWith("verification:"),
		);
		expect(verificationKeys.length).toBeGreaterThan(0);

		const headers = new Headers();
		const response = await client.magicLink.verify({
			query: {
				token: new URL(verificationEmail.url).searchParams.get("token")!,
			},
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		expect(response.data?.token).toBeDefined();
		const betterAuthCookie = headers.get("set-cookie");
		expect(betterAuthCookie).toBeDefined();
	});

	it("should sign up new user via magic link", async () => {
		const email = "new-secondary-user@test.com";
		await client.signIn.magicLink({
			email,
			name: "New User",
		});

		const headers = new Headers();
		await client.magicLink.verify({
			query: {
				token: new URL(verificationEmail.url).searchParams.get("token")!,
			},
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		const session = await client.getSession({
			fetchOptions: { headers },
		});
		expect(session.data?.user).toMatchObject({
			name: "New User",
			email,
			emailVerified: true,
		});
	});

	it("should track attempts and reject when exceeded", async () => {
		const attemptStore = new Map<string, string>();
		let attemptEmail: VerificationEmail = { email: "", token: "", url: "" };

		const {
			testUser: tu,
			sessionSetter: ss,
			client: c,
		} = await getTestInstance(
			{
				secondaryStorage: {
					set(key, value, ttl) {
						attemptStore.set(key, value);
					},
					get(key) {
						return attemptStore.get(key) || null;
					},
					delete(key) {
						attemptStore.delete(key);
					},
				},
				rateLimit: { enabled: false },
				plugins: [
					magicLink({
						allowedAttempts: 3,
						async sendMagicLink(data) {
							attemptEmail = data;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [magicLinkClient()],
				},
			},
		);

		await c.signIn.magicLink({ email: tu.email });
		const token = new URL(attemptEmail.url).searchParams.get("token")!;

		// 3 attempts should succeed
		for (let i = 0; i < 3; i++) {
			const headers = new Headers();
			const response = await c.magicLink.verify({
				query: { token },
				fetchOptions: { onSuccess: ss(headers) },
			});
			expect(response.data?.token).toBeDefined();
		}

		// 4th attempt should be rejected
		await c.magicLink.verify(
			{ query: { token } },
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toContain("?error=ATTEMPTS_EXCEEDED");
				},
			},
		);
	});

	it("should delete expired verification on verify", async () => {
		const expiredStore = new Map<string, string>();
		let expiredEmail: VerificationEmail = { email: "", token: "", url: "" };

		const { testUser: tu, client: c } = await getTestInstance(
			{
				secondaryStorage: {
					set(key, value, ttl) {
						expiredStore.set(key, value);
					},
					get(key) {
						return expiredStore.get(key) || null;
					},
					delete(key) {
						expiredStore.delete(key);
					},
				},
				rateLimit: { enabled: false },
				plugins: [
					magicLink({
						expiresIn: 1, // 1 second
						async sendMagicLink(data) {
							expiredEmail = data;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [magicLinkClient()],
				},
			},
		);

		await c.signIn.magicLink({ email: tu.email });
		const token = new URL(expiredEmail.url).searchParams.get("token")!;

		// Wait for token to expire
		await new Promise((r) => setTimeout(r, 1500));

		await c.magicLink.verify(
			{ query: { token } },
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toContain("?error=EXPIRED_TOKEN");
				},
			},
		);
	});
});

/**
 * Same tests but secondary storage returns already-parsed objects (like some
 * Redis client wrappers do). This exercises the `new Date()` defensive path
 * in updateVerificationByIdentifier.
 *
 * @see https://github.com/better-auth/better-auth/issues/8228
 */
describe("magic link with secondary storage (pre-parsed object return)", async () => {
	const store = new Map<string, any>();
	let verificationEmail: VerificationEmail = {
		email: "",
		token: "",
		url: "",
	};

	const { testUser, sessionSetter, client } = await getTestInstance(
		{
			secondaryStorage: {
				set(key, value, ttl) {
					store.set(key, safeJSONParse(value));
				},
				get(key) {
					return store.get(key) ?? null;
				},
				delete(key) {
					store.delete(key);
				},
			},
			rateLimit: {
				enabled: false,
			},
			plugins: [
				magicLink({
					async sendMagicLink(data) {
						verificationEmail = data;
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [magicLinkClient()],
			},
		},
	);

	it("should send and verify magic link", async () => {
		await client.signIn.magicLink({
			email: testUser.email,
		});
		expect(verificationEmail.email).toBe(testUser.email);

		const headers = new Headers();
		const response = await client.magicLink.verify({
			query: {
				token: new URL(verificationEmail.url).searchParams.get("token")!,
			},
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		expect(response.data?.token).toBeDefined();
		const betterAuthCookie = headers.get("set-cookie");
		expect(betterAuthCookie).toBeDefined();
	});

	it("should track attempts with pre-parsed storage", async () => {
		const attemptStore = new Map<string, any>();
		let attemptEmail: VerificationEmail = { email: "", token: "", url: "" };

		const {
			testUser: tu,
			sessionSetter: ss,
			client: c,
		} = await getTestInstance(
			{
				secondaryStorage: {
					set(key, value, ttl) {
						attemptStore.set(key, safeJSONParse(value));
					},
					get(key) {
						return attemptStore.get(key) ?? null;
					},
					delete(key) {
						attemptStore.delete(key);
					},
				},
				rateLimit: { enabled: false },
				plugins: [
					magicLink({
						allowedAttempts: 2,
						async sendMagicLink(data) {
							attemptEmail = data;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [magicLinkClient()],
				},
			},
		);

		await c.signIn.magicLink({ email: tu.email });
		const token = new URL(attemptEmail.url).searchParams.get("token")!;

		// 2 attempts should succeed
		for (let i = 0; i < 2; i++) {
			const headers = new Headers();
			const response = await c.magicLink.verify({
				query: { token },
				fetchOptions: { onSuccess: ss(headers) },
			});
			expect(response.data?.token).toBeDefined();
		}

		// 3rd attempt should be rejected
		await c.magicLink.verify(
			{ query: { token } },
			{
				onError(context) {
					expect(context.response.status).toBe(302);
					const location = context.response.headers.get("location");
					expect(location).toContain("?error=ATTEMPTS_EXCEEDED");
				},
			},
		);
	});
});
