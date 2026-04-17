import type { GoogleProfile } from "@better-auth/core/social-providers";
import { createOTP } from "@better-auth/utils/otp";
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
import * as apiModule from "../../api";
import { parseSetCookieHeader, setCookieToHeader } from "../../cookies";
import { signJWT, symmetricDecrypt } from "../../crypto";
import { expectNoTwoFactorChallenge, getTestInstance } from "../../test-utils";
import { DEFAULT_SECRET } from "../../utils/constants";
import { twoFactor } from "../two-factor";
import type { TwoFactorTable } from "../two-factor/types";
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

		await db.update({
			model: "user",
			update: {
				twoFactorEnabled: true,
			},
			where: [{ field: "email", value: testUser.email }],
		});

		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			headers,
			asResponse: true,
		});
		const challengeBody = (await signInRes.clone().json()) as {
			kind: "challenge";
			challenge: {
				kind: "two-factor";
				attemptId: string;
			};
		};
		expect(
			parseSetCookieHeader(signInRes.headers.get("set-cookie") || "").get(
				"better-auth.two_factor",
			),
		).toBeDefined();
		expect(challengeBody.kind).toBe("challenge");
		expect(challengeBody.challenge.kind).toBe("two-factor");
		expect(challengeBody.challenge.attemptId).toBeTruthy();
		expect(onLinkAccount).not.toHaveBeenCalled();

		const challengeHeaders = new Headers(headers);
		setCookieToHeader(challengeHeaders)({ response: signInRes });
		await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {
				attemptId: challengeBody.challenge.attemptId,
			},
		});
		expect(otp).toHaveLength(6);

		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: {
				attemptId: challengeBody.challenge.attemptId,
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

		await db.update({
			model: "user",
			update: {
				twoFactorEnabled: true,
			},
			where: [{ field: "email", value: testUser.email }],
		});

		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			headers,
			asResponse: true,
		});
		const challengeBody = (await signInRes.clone().json()) as {
			kind: "challenge";
			challenge: {
				kind: "two-factor";
				attemptId: string;
			};
		};
		expect(challengeBody.kind).toBe("challenge");
		expect(challengeBody.challenge.kind).toBe("two-factor");
		expect(challengeBody.challenge.attemptId).toBeTruthy();
		expect(onLinkAccount).not.toHaveBeenCalled();

		const challengeHeaders = new Headers(headers);
		setCookieToHeader(challengeHeaders)({ response: signInRes });
		await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {
				attemptId: challengeBody.challenge.attemptId,
			},
		});
		expect(otp).toHaveLength(6);

		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: {
				attemptId: challengeBody.challenge.attemptId,
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
					twoFactor({
						allowPasswordless: true,
					}),
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

		await auth.api.enableTwoFactor({
			headers,
			body: {},
		});
		const twoFactorRecord = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: session.user.id }],
		});
		if (!twoFactorRecord) {
			throw new Error("Expected two factor row");
		}
		const secret = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: twoFactorRecord.secret,
		});
		const code = await createOTP(secret).totp();

		const verifyRes = await auth.api.verifyTOTP({
			headers,
			body: {
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
			newSessionUser,
			deleteUser,
		}: {
			newSessionUser: Record<string, any>;
			deleteUser: ReturnType<typeof vi.fn>;
		}) {
			return {
				path: "/sign-in/anonymous",
				context: (() => {
					const finalized = {
						user: newSessionUser,
						session: {
							token: "new-token",
						},
					};
					return {
						responseHeaders: new Headers(),
						getFinalizedSignIn: () => finalized,
						getNewSession: () => null,
						internalAdapter: {
							deleteUser,
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
				newSessionUser: {
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
			const ctx = createMiddlewareContext({
				newSessionUser: {
					id: "linked-user",
					isAnonymous: false,
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

			expect(deleteUser).toHaveBeenCalledWith("anon-user");
		});
	});
});
