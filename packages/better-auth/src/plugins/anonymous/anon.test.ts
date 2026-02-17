import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthEndpoint } from "@better-auth/core/api";
import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { getSessionFromCtx } from "../../api";
import { signJWT } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import { DEFAULT_SECRET } from "../../utils/constants";
import { anonymous } from ".";
import { anonymousClient } from "./client";

let testIdToken: string;
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
	const data: GoogleProfile = {
		email: "user@email.com",
		email_verified: true,
		name: "First Last",
		picture: "https://lh3.googleusercontent.com/a-/AOh14GjQ4Z7Vw",
		exp: 1234567890,
		sub: "1234567890",
		iat: 1234567890,
		aud: "test",
		azp: "test",
		nbf: 1234567890,
		iss: "test",
		locale: "en",
		jti: "test",
		given_name: "First",
		family_name: "Last",
	};
	testIdToken = await signJWT(data, DEFAULT_SECRET);

	handlers = [
		http.post("https://oauth2.googleapis.com/token", () => {
			return HttpResponse.json({
				access_token: "test",
				refresh_token: "test",
				id_token: testIdToken,
			});
		}),
	];

	server.listen({ onUnhandledRequest: "bypass" });
	server.use(...handlers);
});

afterEach(() => {
	vi.restoreAllMocks();
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("anonymous", async () => {
	const linkAccountFn = vi.fn();
	const { client, sessionSetter, testUser, cookieSetter } =
		await getTestInstance(
			{
				plugins: [
					anonymous({
						async onLinkAccount(data) {
							linkAccountFn(data);
						},
						schema: {
							user: {
								fields: {
									isAnonymous: "is_anon",
								},
							},
						},
					}),
				],
				socialProviders: {
					google: {
						clientId: "test",
						clientSecret: "test",
					},
				},
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
	const headers = new Headers();

	it("should sign in anonymously", async () => {
		await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.session).toBeDefined();
		expect(session.data?.user.isAnonymous).toBe(true);
	});

	it("link anonymous user account", async () => {
		expect(linkAccountFn).toHaveBeenCalledTimes(0);
		await client.signIn.email(testUser, {
			headers,
		});
		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
		linkAccountFn.mockClear();
	});

	it("should link in social sign on", async () => {
		const headers = new Headers();
		await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});

		await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		const singInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(headers),
			},
		});
		const state = new URL(singInRes.data?.url || "").searchParams.get("state");
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
		});
		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
	});

	it("should work with generateName", async () => {
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					anonymous({
						generateName() {
							return "i-am-anonymous";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		expect(res.data?.user.name).toBe("i-am-anonymous");
	});

	it("should work with generateRandomEmail", async () => {
		const testHeaders = new Headers();
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					anonymous({
						generateRandomEmail() {
							const id = crypto.randomUUID();
							return `custom-${id}@example.com`;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(testHeaders),
			},
		});
		expect(res.data?.user.email).toMatch(/^custom-[a-f0-9-]+@example\.com$/);
	});

	it("should work with async generateRandomEmail", async () => {
		const testHeaders = new Headers();
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					anonymous({
						async generateRandomEmail() {
							const id = crypto.randomUUID();
							return `async-${id}@example.com`;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(testHeaders),
			},
		});
		expect(res.data?.user.email).toMatch(/^async-[a-f0-9-]+@example\.com$/);
	});

	it("should throw error if generateRandomEmail returns invalid email", async () => {
		const testHeaders = new Headers();
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					anonymous({
						generateRandomEmail() {
							return "not-an-email";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);

		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(testHeaders),
			},
		});

		expect(res.error).toBeDefined();
		expect(res.data).toBeNull();
		expect(res.error?.message).toBe(
			"Email was not generated in a valid format",
		);
	});

	it("should throw error if async generateRandomEmail returns invalid email", async () => {
		const testHeaders = new Headers();
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [
					anonymous({
						async generateRandomEmail() {
							return "still-not-an-email";
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);

		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(testHeaders),
			},
		});

		expect(res.error).toBeDefined();
		expect(res.data).toBeNull();
		expect(res.error?.message).toBe(
			"Email was not generated in a valid format",
		);
	});

	it("should not reject first-time anonymous sign-in", async () => {
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [anonymous()],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const freshHeaders = new Headers();

		// First-time anonymous sign-in should succeed without 400 error
		const res = await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(freshHeaders),
			},
		});

		expect(res.data?.user).toBeDefined();
		expect(res.error).toBeNull();

		// Verify session is actually created and contains isAnonymous
		const session = await client.getSession({
			fetchOptions: {
				headers: freshHeaders,
			},
		});
		expect(session.data?.session).toBeDefined();
		expect(session.data?.user.isAnonymous).toBe(true);
	});

	it("should reject subsequent anonymous sign-in attempts once signed in", async () => {
		const { client, sessionSetter } = await getTestInstance(
			{
				plugins: [anonymous()],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const persistentHeaders = new Headers();

		// First sign-in should succeed
		await client.signIn.anonymous({
			fetchOptions: {
				headers: persistentHeaders,
				onSuccess: sessionSetter(persistentHeaders),
			},
		});

		// Verify session is established before testing rejection
		const session = await client.getSession({
			fetchOptions: {
				headers: persistentHeaders,
			},
		});
		expect(session.data?.session).toBeDefined();
		expect(session.data?.user.isAnonymous).toBe(true);

		// Second attempt should be rejected at the endpoint level
		const secondAttempt = await client.signIn.anonymous({
			fetchOptions: {
				headers: persistentHeaders,
			},
		});

		expect(secondAttempt.data).toBeNull();
		expect(secondAttempt.error).toBeDefined();
		expect(secondAttempt.error?.message).toBe(
			"Anonymous users cannot sign in again anonymously",
		);
	});

	describe("anonymous cleanup safeguards", () => {
		const passkeyRegistrationRoutePlugin = {
			id: "passkey-registration-route-plugin",
			endpoints: {
				verifyRegistration: createAuthEndpoint(
					"/passkey/verify-registration",
					{
						method: "POST",
					},
					async (ctx) => {
						return ctx.json({ success: true });
					},
				),
			},
		} satisfies BetterAuthPlugin;

		const callbackLinkRoutePlugin = {
			id: "callback-link-route-plugin",
			endpoints: {
				callbackMock: createAuthEndpoint(
					"/callback/mock",
					{
						method: "GET",
					},
					async (ctx) => {
						const session = await getSessionFromCtx<{
							isAnonymous: boolean | null;
						}>(ctx, { disableRefresh: true });
						if (!session) {
							return ctx.json({ linked: false });
						}
						await ctx.context.internalAdapter.createAccount({
							userId: session.user.id,
							providerId: "mock-provider",
							accountId: `mock-${session.user.id}`,
						});
						return ctx.json({ linked: true });
					},
				),
			},
		} satisfies BetterAuthPlugin;

		async function getAnonymousFlagForUser(
			db: Awaited<ReturnType<typeof getTestInstance>>["db"],
			userId: string,
		) {
			const users = await db.findMany<{ isAnonymous: boolean | null }>({
				model: "user",
				where: [
					{
						field: "id",
						value: userId,
					},
				],
			});
			return users[0]?.isAnonymous;
		}

		/**
		 * @see https://github.com/better-auth/better-auth/issues/7985
		 */
		it("updates anonymous flag when passkey registration completes", async () => {
			const { client, sessionSetter, db } = await getTestInstance(
				{
					plugins: [anonymous(), passkeyRegistrationRoutePlugin],
				},
				{
					clientOptions: {
						plugins: [anonymousClient()],
					},
				},
			);
			const headers = new Headers();
			await client.signIn.anonymous({
				fetchOptions: {
					onSuccess: sessionSetter(headers),
				},
			});

			const sessionBefore = await client.getSession({
				fetchOptions: { headers },
			});
			expect(sessionBefore.data?.user.isAnonymous).toBe(true);
			const anonymousUserId = sessionBefore.data?.user.id;
			expect(anonymousUserId).toBeDefined();
			if (!anonymousUserId) {
				throw new Error("Expected anonymous user id");
			}

			await client.$fetch("/passkey/verify-registration", {
				method: "POST",
				headers,
			});

			expect(await getAnonymousFlagForUser(db, anonymousUserId)).toBe(false);

			const sessionAfter = await client.getSession({
				fetchOptions: { headers },
			});
			expect(sessionAfter.data?.user.isAnonymous).toBe(false);
		});

		it("updates anonymous flag when callback links an account without a new session cookie", async () => {
			const { client, sessionSetter, db } = await getTestInstance(
				{
					plugins: [anonymous(), callbackLinkRoutePlugin],
				},
				{
					clientOptions: {
						plugins: [anonymousClient()],
					},
				},
			);
			const headers = new Headers();
			await client.signIn.anonymous({
				fetchOptions: {
					onSuccess: sessionSetter(headers),
				},
			});

			const sessionBefore = await client.getSession({
				fetchOptions: { headers },
			});
			expect(sessionBefore.data?.user.isAnonymous).toBe(true);
			const anonymousUserId = sessionBefore.data?.user.id;
			expect(anonymousUserId).toBeDefined();
			if (!anonymousUserId) {
				throw new Error("Expected anonymous user id");
			}

			await client.$fetch("/callback/mock", {
				method: "GET",
				headers,
			});

			expect(await getAnonymousFlagForUser(db, anonymousUserId)).toBe(false);

			const sessionAfter = await client.getSession({
				fetchOptions: { headers },
			});
			expect(sessionAfter.data?.user.isAnonymous).toBe(false);
		});
	});
});
