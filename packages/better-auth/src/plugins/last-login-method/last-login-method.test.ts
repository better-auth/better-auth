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
import { createAuthMiddleware } from "../../api";
import {
	parseCookies,
	parseSetCookieHeader,
	setCookieToHeader,
} from "../../cookies";
import { signJWT } from "../../crypto";
import { expectNoTwoFactorChallenge, getTestInstance } from "../../test-utils";
import { DEFAULT_SECRET } from "../../utils/constants";
import { genericOAuthClient } from "../generic-oauth/client";
import { genericOAuth } from "../generic-oauth/index";
import { magicLink } from "../magic-link";
import { magicLinkClient } from "../magic-link/client";
import { siwe } from "../siwe";
import { siweClient } from "../siwe/client";
import { twoFactor } from "../two-factor";
import { lastLoginMethod } from ".";
import { lastLoginMethodClient } from "./client";

let testIdToken: string;
let handlers: ReturnType<typeof http.post>[];

const server = setupServer();

beforeAll(async () => {
	const data: GoogleProfile = {
		email: "github-issue-demo@example.com",
		email_verified: true,
		name: "OAuth Test User",
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
		given_name: "OAuth",
		family_name: "Test",
	};
	testIdToken = await signJWT(data, DEFAULT_SECRET);

	handlers = [
		http.post("https://oauth2.googleapis.com/token", () => {
			return HttpResponse.json({
				access_token: "test-access-token",
				refresh_token: "test-refresh-token",
				id_token: testIdToken,
			});
		}),
		http.post("https://provider.example.com/oauth/token", () => {
			return HttpResponse.json({});
		}),
	];

	server.listen({ onUnhandledRequest: "bypass" });
	server.use(...handlers);
});

afterEach(() => {
	server.resetHandlers();
	server.use(...handlers);
});

afterAll(() => server.close());

describe("lastLoginMethod", async () => {
	const { client, cookieSetter, testUser } = await getTestInstance(
		{
			plugins: [
				lastLoginMethod(),
				siwe({
					domain: "example.com",
					async getNonce() {
						return "A1b2C3d4E5f6G7h8J";
					},
					async verifyMessage({ message, signature }) {
						return (
							signature === "valid_signature" && message === "valid_message"
						);
					},
				}),
			],
		},
		{
			clientOptions: {
				plugins: [lastLoginMethodClient(), siweClient()],
			},
		},
	);

	it("should set the last login method cookie", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		);
		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBe("email");
	});

	it("should not stamp the last login method when sign-in is challenged", async () => {
		const { auth, client, db, testUser } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod(),
					twoFactor({
						otpOptions: {
							async sendOTP() {},
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient()],
				},
			},
		);

		await db.update({
			model: "user",
			update: {
				twoFactorEnabled: true,
			},
			where: [{ field: "email", value: testUser.email }],
		});

		let setCookieHeader = "";
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					setCookieHeader = context.response.headers.get("set-cookie") || "";
				},
			},
		);

		const cookies = parseSetCookieHeader(setCookieHeader);
		expect(cookies.get("better-auth.last_used_login_method")).toBeUndefined();
		expect(setCookieHeader).toContain("better-auth.two_factor");

		const context = await auth.$context;
		const attempt = await context.adapter.findOne<{
			loginMethod?: string | null;
		}>({
			model: "signInAttempt",
			where: [
				{
					field: "userId",
					value: (await context.internalAdapter.findUserByEmail(
						testUser.email,
					))!.user.id,
				},
			],
		});
		expect(attempt?.loginMethod).toBe("email");
	});

	it("should stamp the last login method after a two-factor challenge completes", async () => {
		let otp = "";
		const { auth, db, testUser } = await getTestInstance({
			plugins: [
				lastLoginMethod(),
				twoFactor({
					otpOptions: {
						sendOTP({ otp: nextOtp }) {
							otp = nextOtp;
						},
					},
				}),
			],
		});

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
			asResponse: true,
		});
		const challengedUser = await db.findOne<
			(typeof testUser & { lastLoginMethod?: string | null }) | null
		>({
			model: "user",
			where: [{ field: "email", value: testUser.email }],
		});
		expect(challengedUser?.lastLoginMethod).toBeUndefined();
		const challengeHeaders = new Headers();
		setCookieToHeader(challengeHeaders)({ response: signInRes });
		await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {},
		});
		expect(otp).toHaveLength(6);

		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: {
				code: otp,
			},
			asResponse: true,
		});
		const cookies = parseSetCookieHeader(
			verifyRes.headers.get("set-cookie") || "",
		);
		expect(cookies.get("better-auth.last_used_login_method")?.value).toBe(
			"email",
		);
	});

	it("should preserve the pending login method when the two-factor cookie is secure and renamed", async () => {
		let otp = "";
		const { auth, db, testUser } = await getTestInstance({
			baseURL: "https://example.com",
			advanced: {
				useSecureCookies: true,
				cookies: {
					two_factor: {
						name: "custom.two_factor",
					},
				},
			},
			plugins: [
				lastLoginMethod(),
				twoFactor({
					otpOptions: {
						sendOTP({ otp: nextOtp }) {
							otp = nextOtp;
						},
					},
				}),
			],
		});

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
			asResponse: true,
		});
		const challengeCookies = parseSetCookieHeader(
			signInRes.headers.get("set-cookie") || "",
		);
		expect(
			challengeCookies.get("__Secure-custom.two_factor")?.value,
		).toBeDefined();

		const challengeHeaders = new Headers();
		setCookieToHeader(challengeHeaders)({ response: signInRes });
		await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {},
		});
		expect(otp).toHaveLength(6);

		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: {
				code: otp,
			},
			asResponse: true,
		});
		const verifyCookies = parseSetCookieHeader(
			verifyRes.headers.get("set-cookie") || "",
		);
		expect(verifyCookies.get("better-auth.last_used_login_method")?.value).toBe(
			"email",
		);
	});

	it("should set the last login method cookie for siwe", async () => {
		const headers = new Headers();
		const walletAddress = "0x000000000000000000000000000000000000dEaD";
		const chainId = 1;
		await client.siwe.nonce({ walletAddress, chainId });
		await client.siwe.verify(
			{
				message: "valid_message",
				signature: "valid_signature",
				walletAddress,
				chainId,
				email: "user@example.com",
			},
			{
				onSuccess(context) {
					cookieSetter(headers)(context);
				},
			},
		);
		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBe("siwe");
	});

	it("should set the last login method cookie for magic-link", async () => {
		let magicLinkEmail = { email: "", token: "", url: "" };
		const { client, cookieSetter, testUser } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod(),
					magicLink({
						async sendMagicLink(data) {
							magicLinkEmail = data;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient(), magicLinkClient()],
				},
			},
		);
		await client.signIn.magicLink({
			email: testUser.email,
		});
		const token = new URL(magicLinkEmail.url).searchParams.get("token") || "";
		const headers = new Headers();
		await client.$fetch("/magic-link/verify", {
			method: "GET",
			query: {
				token,
				callbackURL: "/callback",
			},
			onError(context) {
				expect(context.response.status).toBe(302);
				cookieSetter(headers)(context as any);
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				const lastMethod = cookies.get(
					"better-auth.last_used_login_method",
				)?.value;
				expect(lastMethod).toBe("magic-link");
			},
		});
	});

	it("should set the last login method for magic-link in the database", async () => {
		let magicLinkEmail = { email: "", token: "", url: "" };
		const { client, auth, testUser } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod({ storeInDatabase: true }),
					magicLink({
						async sendMagicLink(data) {
							magicLinkEmail = data;
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
		await client.signIn.magicLink({
			email: testUser.email,
		});
		const token = new URL(magicLinkEmail.url).searchParams.get("token") || "";
		let sessionToken = "";
		await client.magicLink.verify(
			{
				query: { token },
			},
			{
				onSuccess(context) {
					const data = context.data as { token?: string };
					if (data?.token) {
						sessionToken = data.token;
					}
				},
				onError(context) {
					// magic-link verify redirects with 302, extract session from set-cookie
					if (context.response.status === 302) {
						const cookies = parseSetCookieHeader(
							context.response.headers.get("set-cookie") || "",
						);
						const sessionCookie = cookies.get("better-auth.session_token");
						if (sessionCookie?.value) {
							sessionToken = sessionCookie.value;
						}
					}
				},
			},
		);
		expect(sessionToken).toBeTruthy();
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${sessionToken}`,
			}),
		});
		expect((session?.user as any).lastLoginMethod).toBe("magic-link");
	});

	it("should set the last login method in the database", async () => {
		const { client, auth } = await getTestInstance({
			plugins: [lastLoginMethod({ storeInDatabase: true })],
		});
		const data = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{ throw: true },
		);
		expectNoTwoFactorChallenge(data);
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${data.token}`,
			}),
		});
		expect(session?.user.lastLoginMethod).toBe("email");
	});

	it("should persist the original login method in the database after two-factor verification", async () => {
		let otp = "";
		const { auth, db, testUser } = await getTestInstance({
			plugins: [
				lastLoginMethod({ storeInDatabase: true }),
				twoFactor({
					otpOptions: {
						sendOTP({ otp: nextOtp }) {
							otp = nextOtp;
						},
					},
				}),
			],
		});

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
			asResponse: true,
		});
		const challengeHeaders = new Headers();
		setCookieToHeader(challengeHeaders)({ response: signInRes });
		await auth.api.sendTwoFactorOTP({
			headers: challengeHeaders,
			body: {},
		});

		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: {
				code: otp,
			},
			asResponse: true,
		});
		const verifyJson = (await verifyRes.json()) as { token: string };
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${verifyJson.token}`,
			}),
		});
		expect(session?.user.lastLoginMethod).toBe("email");
	});

	it("should ignore stale challenge cookies for session-scoped two-factor verification", async () => {
		let otp = "";
		let magicLinkEmail = { email: "", token: "", url: "" };
		const activeUser = {
			email: "active-last-login@example.com",
			password: "password1234",
			name: "Active User",
		};
		const challengedUser = {
			email: "magic-last-login@example.com",
			password: "password1234",
			name: "Magic User",
		};
		const { auth, db } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod({ storeInDatabase: true }),
					magicLink({
						async sendMagicLink(data) {
							magicLinkEmail = data;
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
			},
			{
				disableTestUser: true,
			},
		);

		await auth.api.signUpEmail({
			body: activeUser,
		});
		await auth.api.signUpEmail({
			body: challengedUser,
		});

		const activeHeaders = new Headers();
		const activeSignIn = await auth.api.signInEmail({
			body: {
				email: activeUser.email,
				password: activeUser.password,
			},
			asResponse: true,
		});
		setCookieToHeader(activeHeaders)({ response: activeSignIn });

		const activeSession = await auth.api.getSession({
			headers: activeHeaders,
		});
		expect(activeSession?.user.lastLoginMethod).toBe("email");

		await db.update({
			model: "user",
			update: {
				twoFactorEnabled: true,
			},
			where: [{ field: "email", value: challengedUser.email }],
		});

		await auth.api.signInMagicLink({
			body: {
				email: challengedUser.email,
			},
			headers: new Headers(),
		});
		const magicToken =
			new URL(magicLinkEmail.url).searchParams.get("token") || "";
		const challengeResponse = await auth.api.magicLinkVerify({
			query: {
				token: magicToken,
				callbackURL: "/callback",
			},
			headers: activeHeaders,
			asResponse: true,
		});
		setCookieToHeader(activeHeaders)({ response: challengeResponse });

		const challengedCookies = parseCookies(activeHeaders.get("cookie") || "");
		expect(challengedCookies.get("better-auth.two_factor")).toBeDefined();

		await auth.api.sendTwoFactorOTP({
			headers: activeHeaders,
			body: {},
		});
		expect(otp).toHaveLength(6);

		await auth.api.verifyTwoFactorOTP({
			headers: activeHeaders,
			body: {
				code: otp,
			},
			asResponse: true,
		});

		const updatedActiveUser = await db.findOne<
			(typeof activeUser & { lastLoginMethod?: string | null }) | null
		>({
			model: "user",
			where: [{ field: "email", value: activeUser.email }],
		});
		expect(updatedActiveUser?.lastLoginMethod).toBe("email");
	});

	it("should set the last login method for siwe in the database", async () => {
		const walletAddress = "0x000000000000000000000000000000000000dEaD";
		const chainId = 1;
		const { client, auth } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod({ storeInDatabase: true }),
					siwe({
						domain: "example.com",
						async getNonce() {
							return "A1b2C3d4E5f6G7h8J";
						},
						async verifyMessage({ message, signature }) {
							return (
								signature === "valid_signature" && message === "valid_message"
							);
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [siweClient()],
				},
			},
		);
		await client.siwe.nonce({ walletAddress, chainId });
		const { data } = await client.siwe.verify({
			message: "valid_message",
			signature: "valid_signature",
			walletAddress,
			chainId,
			email: "user@example.com",
		});
		expectNoTwoFactorChallenge(data);
		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${data.token}`,
			}),
		});
		expect(session?.user.lastLoginMethod).toBe("siwe");
	});

	it("should NOT set the last login method cookie on failed authentication", async () => {
		const headers = new Headers();
		const response = await client.signIn.email(
			{
				email: testUser.email,
				password: "wrong-password",
			},
			{
				onError(context) {
					cookieSetter(headers)(context);
				},
			},
		);

		expect(response.error).toBeDefined();

		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBeUndefined();
	});

	it("should NOT set the last login method cookie on failed OAuth callback", async () => {
		const headers = new Headers();
		const response = await client.$fetch("/callback/google", {
			method: "GET",
			query: {
				code: "invalid-code",
				state: "invalid-state",
			},
			onError(context) {
				cookieSetter(headers)(context);
			},
		});

		expect(response.error).toBeDefined();

		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBeUndefined();
	});

	it("should ignore missing path in after hooks", async () => {
		const plugin = lastLoginMethod();
		const handler = plugin.hooks?.after?.[0]?.handler;
		const setCookie = vi.fn();

		await expect(
			handler?.({
				path: undefined,
				setCookie,
				context: {
					responseHeaders: undefined,
					authCookies: {
						sessionToken: {
							name: "better-auth.session_token",
							attributes: {},
						},
					},
					getFinalizedSignIn: () => null,
					getSignInAttempt: () => null,
				},
			} as any),
		).resolves.toBeUndefined();

		expect(setCookie).not.toHaveBeenCalled();
	});

	it("should ignore missing path in database hooks", async () => {
		const updateUser = vi.fn();
		const plugin = lastLoginMethod({ storeInDatabase: true });
		const initResult = await plugin.init?.({
			internalAdapter: {
				updateUser,
			},
			logger: {
				error: vi.fn(),
			},
		} as any);
		const userCreateBefore =
			initResult?.options?.databaseHooks?.user?.create?.before;

		await expect(
			userCreateBefore?.(
				{
					email: "test@example.com",
				} as any,
				{
					path: undefined,
				} as any,
			),
		).resolves.toBeUndefined();

		expect(updateUser).not.toHaveBeenCalled();
	});

	it("should normalize missing path for custom resolver in database hooks", async () => {
		const customResolveMethod = vi.fn((ctx) => {
			return ctx.path.startsWith("/magic-link") ? "magic-link" : null;
		});
		const updateUser = vi.fn();
		const plugin = lastLoginMethod({
			storeInDatabase: true,
			customResolveMethod,
		});
		const initResult = await plugin.init?.({
			internalAdapter: {
				updateUser,
			},
			logger: {
				error: vi.fn(),
			},
		} as any);
		const userCreateBefore =
			initResult?.options?.databaseHooks?.user?.create?.before;

		await expect(
			userCreateBefore?.(
				{
					email: "test@example.com",
				} as any,
				{
					path: undefined,
				} as any,
			),
		).resolves.toBeUndefined();

		expect(customResolveMethod).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				path: "",
			}),
		);
		expect(updateUser).not.toHaveBeenCalled();
	});

	it("should update the last login method in the database on subsequent logins", async () => {
		const { client, auth } = await getTestInstance({
			plugins: [lastLoginMethod({ storeInDatabase: true })],
		});

		await client.signUp.email(
			{
				email: "test@example.com",
				password: "password123",
				name: "Test User",
			},
			{ throw: true },
		);

		const emailSignInData = await client.signIn.email(
			{
				email: "test@example.com",
				password: "password123",
			},
			{ throw: true },
		);
		expectNoTwoFactorChallenge(emailSignInData);

		let session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${emailSignInData.token}`,
			}),
		});
		expect((session?.user as any).lastLoginMethod).toBe("email");

		await client.signOut();

		const emailSignInData2 = await client.signIn.email(
			{
				email: "test@example.com",
				password: "password123",
			},
			{ throw: true },
		);
		expectNoTwoFactorChallenge(emailSignInData2);

		session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${emailSignInData2.token}`,
			}),
		});

		expect((session?.user as any).lastLoginMethod).toBe("email");
	});

	it("should update the last login method in the database on subsequent logins with email and OAuth", async () => {
		const { client, auth, cookieSetter } = await getTestInstance({
			plugins: [lastLoginMethod({ storeInDatabase: true })],
			account: {
				accountLinking: {
					enabled: true,
					trustedProviders: ["google"],
				},
			},
		});

		await client.signUp.email(
			{
				email: "github-issue-demo@example.com",
				password: "password123",
				name: "GitHub Issue Demo User",
			},
			{ throw: true },
		);

		const emailSignInData = await client.signIn.email(
			{
				email: "github-issue-demo@example.com",
				password: "password123",
			},
			{ throw: true },
		);
		expectNoTwoFactorChallenge(emailSignInData);

		const session = await auth.api.getSession({
			headers: new Headers({
				authorization: `Bearer ${emailSignInData.token}`,
			}),
		});

		expect((session?.user as any).lastLoginMethod).toBe("email");

		await client.signOut();

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.social({
			provider: "google",
			callbackURL: "/callback",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});
		expect(signInRes.data).toMatchObject({
			url: expect.stringContaining("google.com"),
			redirect: true,
		});
		expectNoTwoFactorChallenge(signInRes.data);
		const state = new URL(signInRes.data.url!).searchParams.get("state") || "";

		const headers = new Headers();
		await client.$fetch("/callback/google", {
			query: {
				state,
				code: "test",
			},
			headers: oAuthHeaders,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();

				cookieSetter(headers)(context as any);

				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				const lastLoginMethod = cookies.get(
					"better-auth.last_used_login_method",
				)?.value;
				if (lastLoginMethod) {
					expect(lastLoginMethod).toBe("google");
				}
			},
		});

		const oauthSession = await client.getSession({
			fetchOptions: {
				headers: headers,
			},
		});
		expect((oauthSession?.data?.user as any).lastLoginMethod).toBe("google");
	});

	it("should set the last login method for generic OAuth provider with /oauth2/callback/:providerId", async () => {
		const { client, cookieSetter } = await getTestInstance(
			{
				plugins: [
					lastLoginMethod({ storeInDatabase: true }),
					genericOAuth({
						config: [
							{
								providerId: "my-provider-id",
								clientId: "test-client-id",
								clientSecret: "test-client-secret",
								authorizationUrl:
									"https://provider.example.com/oauth/authorize",
								tokenUrl: "https://provider.example.com/oauth/token",
								scopes: ["openid", "profile", "email"],
								async getUserInfo(token) {
									return {
										id: "provider-user-123",
										name: "Generic OAuth User",
										email: "generic@example.com",
										image: "https://example.com/avatar.jpg",
										emailVerified: true,
									};
								},
							},
						],
					}),
				],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient(), genericOAuthClient()],
				},
			},
		);

		const oAuthHeaders = new Headers();
		const signInRes = await client.signIn.oauth2({
			providerId: "my-provider-id",
			fetchOptions: {
				onSuccess: cookieSetter(oAuthHeaders),
			},
		});
		const state = new URL(signInRes.data!.url!).searchParams.get("state") || "";

		const headers = new Headers();
		await client.$fetch("/oauth2/callback/my-provider-id", {
			query: {
				state,
				code: "test",
			},
			headers: oAuthHeaders,
			method: "GET",
			onError(context) {
				expect(context.response.status).toBe(302);
				const location = context.response.headers.get("location");
				expect(location).toBeDefined();

				cookieSetter(headers)(context as any);

				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				const lastLoginMethod = cookies.get(
					"better-auth.last_used_login_method",
				)?.value;
				if (lastLoginMethod) {
					expect(lastLoginMethod).toBe("my-provider-id");
				}
			},
		});

		const oauthSession = await client.getSession({
			fetchOptions: {
				headers: headers,
			},
		});
		expect((oauthSession?.data?.user as any).lastLoginMethod).toBe(
			"my-provider-id",
		);
	});

	it("should handle multiple set-cookie headers correctly", async () => {
		// Create a custom plugin that sets an additional cookie to simulate multiple Set-Cookie headers
		const multiCookiePlugin = {
			id: "multi-cookie-test",
			hooks: {
				after: [
					{
						matcher() {
							return true;
						},
						handler: createAuthMiddleware(async (ctx) => {
							if (ctx.context.getFinalizedSignIn()) {
								ctx.setCookie("additional-test-cookie", "test-value", {
									maxAge: 60 * 60 * 24 * 30,
									httpOnly: false,
								});
							}
						}),
					},
				],
			},
		};

		const { client, cookieSetter } = await getTestInstance(
			{
				plugins: [multiCookiePlugin, lastLoginMethod()],
			},
			{
				clientOptions: {
					plugins: [lastLoginMethodClient()],
				},
			},
		);

		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					cookieSetter(headers)(context);

					// Verify that multiple cookies are present in the response
					const setCookieHeaders =
						context.response.headers.getSetCookie?.() || [];
					expect(setCookieHeaders.length).toBeGreaterThan(1);

					// Verify both cookies are present
					const cookieStrings = setCookieHeaders.join(";");
					expect(cookieStrings).toContain("additional-test-cookie=test-value");
					expect(cookieStrings).toContain(
						"better-auth.last_used_login_method=email",
					);
				},
			},
		);

		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBe("email");
		expect(cookies.get("additional-test-cookie")).toBe("test-value");
	});
});
