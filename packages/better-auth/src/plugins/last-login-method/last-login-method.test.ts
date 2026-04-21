import type { GoogleProfile } from "@better-auth/core/social-providers";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuthMiddleware } from "../../api";
import {
	parseCookies,
	parseSetCookieHeader,
	setCookieToHeader,
} from "../../cookies";
import { signJWT } from "../../crypto";
import {
	expectTwoFactorChallenge,
	getTestInstance,
	seedVerifiedOtpMethodForEmail,
} from "../../test-utils";
import { DEFAULT_SECRET } from "../../utils/constants";
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

	it("stamps the cookie with session.amr[0].method for password sign-in", async () => {
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
		expect(cookies.get("better-auth.last_used_login_method")).toBe("password");
	});

	it("does not stamp the cookie while sign-in is challenged by two-factor", async () => {
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

		await seedVerifiedOtpMethodForEmail(auth, db, testUser.email);

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
		expect(setCookieHeader).toContain("better-auth.two_factor_challenge");
	});

	it("stamps the primary factor after two-factor verification completes", async () => {
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

		await seedVerifiedOtpMethodForEmail(auth, db, testUser.email);

		const signInRes = await auth.api.signInEmail({
			body: {
				email: testUser.email,
				password: testUser.password,
			},
			asResponse: true,
		});
		const challengeBody = await signInRes.clone().json();
		expectTwoFactorChallenge(challengeBody);
		const otpMethodId = challengeBody.challenge.methods[0]?.id;
		if (!otpMethodId) {
			throw new Error("Expected OTP method");
		}
		const challengeHeaders = new Headers();
		setCookieToHeader(challengeHeaders)({ response: signInRes });
		await auth.api.sendTwoFactorCode({
			headers: challengeHeaders,
			body: { methodId: otpMethodId },
		});
		expect(otp).toHaveLength(6);

		const verifyRes = await auth.api.verifyTwoFactor({
			headers: challengeHeaders,
			body: {
				methodId: otpMethodId,
				code: otp,
			},
			asResponse: true,
		});
		const cookies = parseSetCookieHeader(
			verifyRes.headers.get("set-cookie") || "",
		);
		expect(cookies.get("better-auth.last_used_login_method")?.value).toBe(
			"password",
		);
	});

	it("preserves the primary factor when the two-factor cookie is renamed", async () => {
		let otp = "";
		const { auth, db, testUser } = await getTestInstance({
			baseURL: "https://example.com",
			advanced: {
				useSecureCookies: true,
				cookies: {
					two_factor_challenge: {
						name: "custom.two_factor_challenge",
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

		await seedVerifiedOtpMethodForEmail(auth, db, testUser.email);

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
			challengeCookies.get("__Secure-custom.two_factor_challenge")?.value,
		).toBeDefined();

		const challengeHeaders = new Headers();
		setCookieToHeader(challengeHeaders)({ response: signInRes });
		const challengeBody = await signInRes.clone().json();
		expectTwoFactorChallenge(challengeBody);
		const otpMethodId = challengeBody.challenge.methods[0]?.id;
		if (!otpMethodId) {
			throw new Error("Expected OTP method");
		}
		await auth.api.sendTwoFactorCode({
			headers: challengeHeaders,
			body: { methodId: otpMethodId },
		});

		const verifyRes = await auth.api.verifyTwoFactor({
			headers: challengeHeaders,
			body: {
				methodId: otpMethodId,
				code: otp,
			},
			asResponse: true,
		});
		const verifyCookies = parseSetCookieHeader(
			verifyRes.headers.get("set-cookie") || "",
		);
		expect(verifyCookies.get("better-auth.last_used_login_method")?.value).toBe(
			"password",
		);
	});

	it("stamps the cookie with the siwe method", async () => {
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

	it("stamps the cookie with the magic-link method", async () => {
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

	it("does not stamp the cookie on failed authentication", async () => {
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

	it("does not stamp the cookie on failed OAuth callback", async () => {
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

	it("throws at init when deprecated options are passed", () => {
		expect(() =>
			(lastLoginMethod as any)({ storeInDatabase: true }).init(),
		).toThrow(/no longer supported/);
		expect(() =>
			(lastLoginMethod as any)({
				customResolveMethod: () => "x",
			}).init(),
		).toThrow(/no longer supported/);
	});

	it("coexists with other after-hook plugins setting cookies", async () => {
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

					const setCookieHeaders =
						context.response.headers.getSetCookie?.() || [];
					expect(setCookieHeaders.length).toBeGreaterThan(1);

					const cookieStrings = setCookieHeaders.join(";");
					expect(cookieStrings).toContain("additional-test-cookie=test-value");
					expect(cookieStrings).toContain(
						"better-auth.last_used_login_method=password",
					);
				},
			},
		);

		const cookies = parseCookies(headers.get("cookie") || "");
		expect(cookies.get("better-auth.last_used_login_method")).toBe("password");
		expect(cookies.get("additional-test-cookie")).toBe("test-value");
	});
});
