import type { GoogleProfile } from "@better-auth/core/social-providers";
import { createOTP } from "@better-auth/utils/otp";
import { betterFetch } from "@better-fetch/fetch";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { OAuth2Server } from "oauth2-mock-server";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import * as apiModule from "../../api";
import { parseSetCookieHeader, setCookieToHeader } from "../../cookies";
import { signJWT, symmetricDecrypt } from "../../crypto";
import {
	expectNoTwoFactorChallenge,
	expectTwoFactorChallenge,
	getTestInstance,
	seedVerifiedOtpMethodForEmail,
} from "../../test-utils";
import { DEFAULT_SECRET } from "../../utils/constants";
import { genericOAuth } from "../generic-oauth";
import { twoFactor } from "../two-factor";
import type { TwoFactorTotpSecret } from "../two-factor/types";
import { anonymous } from ".";
import { anonymousClient } from "./client";

/**
 * Drops the session cookie while keeping every other cookie (notably the OAuth
 * `state` cookie). This reproduces the callback an Expo in-app browser makes:
 * it carries the state cookie forwarded by the auth proxy but never the
 * `httpOnly` session cookie, which was set on the originating app request.
 */
function stripSessionCookie(
	headers: Headers,
	sessionCookiePrefix = "better-auth.session_token",
): Headers {
	const result = new Headers(headers);
	const kept = (headers.get("cookie") ?? "")
		.split(";")
		.map((part) => part.trim())
		.filter((part) => part && !part.startsWith(sessionCookiePrefix));
	result.delete("cookie");
	if (kept.length) {
		result.set("cookie", kept.join("; "));
	}
	return result;
}

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
	const { client, sessionSetter, testUser, cookieSetter, auth } =
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

	it("should reject anonymous sign-in when validateUserInfo returns error", async () => {
		const { client } = await getTestInstance(
			{
				user: {
					validateUserInfo({ source }) {
						if (source.method !== "anonymous") {
							return;
						}
						expect(source.action).toBe("create-user");
						return {
							error: "anonymous_blocked",
							errorDescription: "Anonymous users are not allowed",
						};
					},
				},
				plugins: [anonymous()],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
				disableTestUser: true,
			},
		);

		const res = await client.signIn.anonymous();
		expect(res.error?.code).toBe("anonymous_blocked");
		expect(res.error?.message).toBe("Anonymous users are not allowed");
	});

	it("link anonymous user account", async () => {
		expect(linkAccountFn).toHaveBeenCalledTimes(0);
		await client.signIn.email(testUser, {
			headers,
		});
		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
		linkAccountFn.mockClear();
	});

	it("defers anonymous account linking cleanup until two-factor verification completes", async () => {
		let otp = "";
		const onLinkAccount = vi.fn();
		const { auth, db, testUser } = await getTestInstance({
			plugins: [
				anonymous({
					async onLinkAccount(data) {
						onLinkAccount(data);
					},
				}),
				twoFactor({
					otpOptions: {
						sendOTP({ otp: nextOtp }) {
							otp = nextOtp;
						},
					},
				}),
			],
		});

		const anonymousSignIn = await auth.api.signInAnonymous({
			asResponse: true,
		});
		const headers = new Headers();
		setCookieToHeader(headers)({ response: anonymousSignIn });
		const anonymousSession = await auth.api.getSession({ headers });
		if (!anonymousSession) {
			throw new Error("Expected anonymous session");
		}

		await seedVerifiedOtpMethodForEmail(auth, db, testUser.email);

		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			headers,
			asResponse: true,
		});
		const challengeBody = await signInRes.clone().json();
		expect(
			parseSetCookieHeader(signInRes.headers.get("set-cookie") || "").get(
				"better-auth.two_factor_challenge",
			),
		).toBeDefined();
		expectTwoFactorChallenge(challengeBody);
		const otpMethodId = challengeBody.challenge.methods[0]?.id;
		if (!otpMethodId) {
			throw new Error("Expected OTP method");
		}
		expect(onLinkAccount).not.toHaveBeenCalled();

		const challengeHeaders = new Headers(headers);
		setCookieToHeader(challengeHeaders)({ response: signInRes });
		await auth.api.sendTwoFactorCode({
			headers: challengeHeaders,
			body: {
				attemptId: challengeBody.challenge.attemptId,
				methodId: otpMethodId,
			},
		});
		expect(otp).toHaveLength(6);

		const verifyRes = await auth.api.verifyTwoFactor({
			headers: challengeHeaders,
			body: {
				attemptId: challengeBody.challenge.attemptId,
				methodId: otpMethodId,
				code: otp,
			},
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);
		expect(onLinkAccount).toHaveBeenCalledTimes(1);
		expect(onLinkAccount).toHaveBeenCalledWith(
			expect.objectContaining({
				anonymousUser: expect.objectContaining({
					user: expect.objectContaining({
						id: anonymousSession.user.id,
						isAnonymous: true,
					}),
				}),
				newUser: expect.objectContaining({
					user: expect.objectContaining({
						email: testUser.email,
					}),
				}),
			}),
		);

		const context = await auth.$context;
		const deletedAnonymousUser = await context.internalAdapter.findUserById(
			anonymousSession.user.id,
		);
		expect(deletedAnonymousUser).toBeNull();
	});

	it("still calls onLinkAccount when anonymous deletion is disabled", async () => {
		let otp = "";
		const onLinkAccount = vi.fn();
		const { auth, db, testUser } = await getTestInstance({
			plugins: [
				anonymous({
					disableDeleteAnonymousUser: true,
					async onLinkAccount(data) {
						onLinkAccount(data);
					},
				}),
				twoFactor({
					otpOptions: {
						sendOTP({ otp: nextOtp }) {
							otp = nextOtp;
						},
					},
				}),
			],
		});

		const anonymousSignIn = await auth.api.signInAnonymous({
			asResponse: true,
		});
		const headers = new Headers();
		setCookieToHeader(headers)({ response: anonymousSignIn });
		const anonymousSession = await auth.api.getSession({ headers });
		if (!anonymousSession) {
			throw new Error("Expected anonymous session");
		}

		await seedVerifiedOtpMethodForEmail(auth, db, testUser.email);

		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			headers,
			asResponse: true,
		});
		const challengeBody = await signInRes.clone().json();
		expectTwoFactorChallenge(challengeBody);
		const otpMethodId = challengeBody.challenge.methods[0]?.id;
		if (!otpMethodId) {
			throw new Error("Expected OTP method");
		}
		expect(onLinkAccount).not.toHaveBeenCalled();

		const challengeHeaders = new Headers(headers);
		setCookieToHeader(challengeHeaders)({ response: signInRes });
		await auth.api.sendTwoFactorCode({
			headers: challengeHeaders,
			body: {
				attemptId: challengeBody.challenge.attemptId,
				methodId: otpMethodId,
			},
		});
		expect(otp).toHaveLength(6);

		const verifyRes = await auth.api.verifyTwoFactor({
			headers: challengeHeaders,
			body: {
				attemptId: challengeBody.challenge.attemptId,
				methodId: otpMethodId,
				code: otp,
			},
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);
		expect(onLinkAccount).toHaveBeenCalledTimes(1);

		const preservedAnonymousUser = await db.findOne<{
			id: string;
			isAnonymous: boolean | null;
		}>({
			model: "user",
			where: [{ field: "id", value: anonymousSession.user.id }],
		});
		expect(preservedAnonymousUser).not.toBeNull();
		expect(preservedAnonymousUser?.isAnonymous).toBe(true);
	});

	it("does not treat session-scoped two-factor verification as anonymous linking", async () => {
		const onLinkAccount = vi.fn();
		const { auth, db } = await getTestInstance(
			{
				secret: DEFAULT_SECRET,
				plugins: [
					anonymous({
						async onLinkAccount(data) {
							onLinkAccount(data);
						},
					}),
					twoFactor(),
				],
			},
			{ disableTestUser: true },
		);

		const anonymousSignIn = await auth.api.signInAnonymous({
			asResponse: true,
		});
		const headers = new Headers();
		setCookieToHeader(headers)({ response: anonymousSignIn });
		const session = await auth.api.getSession({ headers });
		if (!session) {
			throw new Error("Expected anonymous session");
		}

		const enableResponse = await auth.api.enableTwoFactorTotp({
			headers,
			body: {},
		});
		const totpRecord = await db.findOne<TwoFactorTotpSecret>({
			model: "twoFactorTotp",
			where: [{ field: "methodId", value: enableResponse.method.id }],
		});
		if (!totpRecord) {
			throw new Error("Expected TOTP record");
		}
		const secret = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: totpRecord.secret,
		});
		const code = await createOTP(secret).totp();

		const verifyRes = await auth.api.verifyTwoFactor({
			headers,
			body: {
				methodId: enableResponse.method.id,
				code,
			},
			asResponse: true,
		});
		expect(verifyRes.status).toBe(200);
		expect(onLinkAccount).not.toHaveBeenCalled();
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
		expectNoTwoFactorChallenge(singInRes.data);
		const state = new URL(singInRes.data.url || "").searchParams.get("state");
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers,
		});
		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
	});

	/**
	 * @see https://github.com/better-auth/better-auth/issues/8692
	 */
	it("should link the anonymous account on social sign-in when the callback has no session cookie (Expo)", async () => {
		linkAccountFn.mockClear();
		const anonHeaders = new Headers();
		await client.signIn.anonymous({
			fetchOptions: { onSuccess: sessionSetter(anonHeaders) },
		});
		const session = await client.getSession({
			fetchOptions: { headers: anonHeaders },
		});
		expect(session.data?.user.isAnonymous).toBe(true);

		// The before-hook reads the anonymous session from this request's cookie
		// and stashes the user id in the server-only OAuth state.
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(anonHeaders),
				headers: anonHeaders,
			},
		});
		expectNoTwoFactorChallenge(signInRes.data);
		const state = new URL(signInRes.data.url || "").searchParams.get("state");

		// The in-app browser returns to the callback with the state cookie but
		// without the session cookie. Linking must still fire via the OAuth state.
		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			headers: stripSessionCookie(anonHeaders),
		});

		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
	});

	it("should ignore a client-supplied anonymousUserId on the OAuth callback", async () => {
		linkAccountFn.mockClear();

		// A real anonymous user whose id an attacker would try to inject.
		const victimHeaders = new Headers();
		const victim = await client.signIn.anonymous({
			fetchOptions: { onSuccess: sessionSetter(victimHeaders) },
		});
		const victimId = victim.data?.user.id;
		expect(victimId).toBeTruthy();

		// The attacker is not anonymous and passes the victim id through the
		// client-controlled additionalData bag.
		const attackerHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/dashboard",
			additionalData: { anonymousUserId: victimId },
			fetchOptions: {
				onSuccess: cookieSetter(attackerHeaders),
				headers: attackerHeaders,
			},
		});
		expectNoTwoFactorChallenge(signInRes.data);
		const state = new URL(signInRes.data.url || "").searchParams.get("state");
		await client.$fetch("/callback/google", {
			query: { state, code: "test" },
			headers: attackerHeaders,
		});

		// The spoofed id is never read from `serverContext`, so no link fires and
		// the victim survives.
		expect(linkAccountFn).not.toHaveBeenCalled();
		const ctx = await auth.$context;
		const stillThere = await ctx.internalAdapter.findUserById(victimId!);
		expect(stillThere?.id).toBe(victimId);
	});

	it("should call onLinkAccount when anonymous user verifies email", async () => {
		/**
		 * @see https://github.com/better-auth/better-auth/issues/9485
		 */
		const linkAccountFn = vi.fn();
		let verificationToken = "";

		const { client, sessionSetter, auth } = await getTestInstance(
			{
				plugins: [
					anonymous({
						async onLinkAccount(data) {
							linkAccountFn(data);
						},
					}),
				],
				emailAndPassword: {
					enabled: true,
					requireEmailVerification: true,
				},
				emailVerification: {
					autoSignInAfterVerification: true,
					async sendVerificationEmail({ url }) {
						verificationToken = new URL(url).searchParams.get("token") || "";
					},
				},
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
				disableTestUser: true,
			},
		);

		const anonHeaders = new Headers();

		await client.signIn.anonymous({
			fetchOptions: {
				onSuccess: sessionSetter(anonHeaders),
			},
		});

		await auth.api.signUpEmail({
			body: {
				email: "newuser@example.com",
				password: "password123",
				name: "New User",
			},
			headers: anonHeaders,
		});

		await auth.api.verifyEmail({
			query: { token: verificationToken },
			headers: anonHeaders,
		});

		expect(linkAccountFn).toHaveBeenCalledTimes(1);
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
		function createMiddlewareContext({
			issuedUser,
			deleteUser,
			deleteUserSessions,
		}: {
			issuedUser: Record<string, any>;
			deleteUser: ReturnType<typeof vi.fn>;
			deleteUserSessions?: ReturnType<typeof vi.fn>;
		}) {
			return {
				path: "/sign-in/anonymous",
				context: (() => {
					const finalized = {
						user: issuedUser,
						session: {
							token: "new-token",
						},
					};
					return {
						responseHeaders: new Headers(),
						getFinalizedSignIn: () => finalized,
						getIssuedSession: () => null,
						internalAdapter: {
							deleteUser,
							deleteUserSessions: deleteUserSessions ?? vi.fn(),
						},
						options: {},
						secret: "secret",
					};
				})(),
				headers: new Headers(),
				query: {},
				error: vi.fn(),
				json: vi.fn(),
				getSignedCookie: vi.fn(),
				setCookie: vi.fn(),
				setSignedCookie: vi.fn(),
			} as any;
		}

		it("does not delete when the new session is still anonymous", async () => {
			const plugin = anonymous();
			const handler = plugin.hooks?.after?.[0]?.handler;
			const deleteUser = vi.fn();
			const ctx = createMiddlewareContext({
				issuedUser: {
					id: "anon-user",
					isAnonymous: true,
				},
				deleteUser,
			});

			vi.spyOn(apiModule, "getSessionFromCtx").mockResolvedValue({
				user: {
					id: "anon-user",
					isAnonymous: true,
				},
				session: {
					token: "old-token",
				},
			} as any);

			await handler?.(ctx);

			expect(deleteUser).not.toHaveBeenCalled();
		});

		it("deletes the previous anonymous user when linking a new account", async () => {
			const plugin = anonymous();
			const handler = plugin.hooks?.after?.[0]?.handler;
			const deleteUser = vi.fn();
			const deleteUserSessions = vi.fn();
			const ctx = createMiddlewareContext({
				issuedUser: {
					id: "linked-user",
					isAnonymous: false,
				},
				deleteUser,
				deleteUserSessions,
			});

			vi.spyOn(apiModule, "getSessionFromCtx").mockResolvedValue({
				user: {
					id: "anon-user",
					isAnonymous: true,
				},
				session: {
					token: "old-token",
				},
			} as any);

			await handler?.(ctx);

			expect(deleteUserSessions).toHaveBeenCalledWith("anon-user");
			expect(deleteUser).toHaveBeenCalledWith("anon-user");
		});
	});
});

/**
 * Generic OAuth providers register as social providers, so they sign in through
 * `/sign-in/social` and return on `/callback/:providerId`. The cookie-less Expo
 * callback must still link the anonymous account on that path.
 *
 * @see https://github.com/better-auth/better-auth/issues/8692
 */
describe("anonymous linking through generic oauth (Expo)", async () => {
	const linkAccountFn = vi.fn();
	const providerId = "test";
	const server = new OAuth2Server();
	await server.start();
	const port = Number(server.issuer.url?.split(":")[2]!);

	afterAll(async () => {
		await server.stop();
	});

	const { client, sessionSetter, cookieSetter, customFetchImpl } =
		await getTestInstance(
			{
				plugins: [
					anonymous({
						async onLinkAccount(data) {
							linkAccountFn(data);
						},
					}),
					genericOAuth({
						config: [
							{
								providerId,
								discoveryUrl: `http://localhost:${port}/.well-known/openid-configuration`,
								clientId: "test-client-id",
								clientSecret: "test-client-secret",
								pkce: true,
							},
						],
					}),
				],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);

	beforeAll(async () => {
		await server.issuer.keys.generate("RS256");
	});

	server.service.on("beforeUserinfo", (userInfoResponse) => {
		userInfoResponse.body = {
			email: "anon-generic-oauth@test.com",
			name: "Anon Generic OAuth",
			sub: "anon-generic-oauth",
			email_verified: true,
		};
		userInfoResponse.statusCode = 200;
	});

	it("links the anonymous account when the callback lacks the session cookie", async () => {
		linkAccountFn.mockClear();
		const anonHeaders = new Headers();
		await client.signIn.anonymous({
			fetchOptions: { onSuccess: sessionSetter(anonHeaders) },
		});

		// Generic providers sign in through /sign-in/social; the before-hook
		// captures the anonymous user id from this request's session cookie.
		const signInRes = await client.signIn.social({
			provider: providerId,
			callbackURL: "http://localhost:3000/dashboard",
			fetchOptions: {
				onSuccess: cookieSetter(anonHeaders),
				headers: anonHeaders,
			},
		});

		// Follow the provider redirect to obtain the callback URL (code + state).
		let callbackLocation: string | null = null;
		expectNoTwoFactorChallenge(signInRes.data);
		await betterFetch(signInRes.data.url || "", {
			method: "GET",
			redirect: "manual",
			onError(context) {
				callbackLocation = context.response.headers.get("location");
			},
		});
		if (!callbackLocation) throw new Error("No redirect location found");

		// Return to the callback without the session cookie (Expo in-app browser).
		await betterFetch(callbackLocation, {
			method: "GET",
			customFetchImpl,
			headers: stripSessionCookie(anonHeaders),
			onError() {},
		});

		expect(linkAccountFn).toHaveBeenCalledWith(expect.any(Object));
	});
});
