import { describe, expect, it } from "vitest";
import { getTestInstance } from "../test-utils/test-instance";
import { getCookieCache, getCookies, getSessionCookie } from "../cookies";
import { parseSetCookieHeader } from "./cookie-utils";
import type { BetterAuthOptions } from "../types/options";

describe("cookies", async () => {
	const { client, testUser } = await getTestInstance();
	it("should set cookies with default options", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toBeDefined();
					expect(setCookie).toContain("Path=/");
					expect(setCookie).toContain("HttpOnly");
					expect(setCookie).toContain("SameSite=Lax");
					expect(setCookie).toContain("better-auth");
				},
			},
		);
	});

	it("should set multiple cookies", async () => {
		await client.signIn.social(
			{
				provider: "github",
				callbackURL: "https://example.com",
			},
			{
				onSuccess(context) {
					const cookies = context.response.headers.get("Set-Cookie");
					expect(cookies?.split(",").length).toBeGreaterThan(1);
				},
			},
		);
	});

	it("should use secure cookies", async () => {
		const { client, testUser } = await getTestInstance({
			advanced: { useSecureCookies: true },
		});
		const res = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toContain("Secure");
				},
			},
		);
	});

	it("should use secure cookies when the base url is https", async () => {
		const { client, testUser } = await getTestInstance({
			baseURL: "https://example.com",
		});

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toContain("Secure");
				},
			},
		);
	});
});

describe("crossSubdomainCookies", () => {
	it("should update cookies with custom domain", async () => {
		const { client, testUser } = await getTestInstance({
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
					domain: "example.com",
				},
			},
		});

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toContain("Domain=example.com");
					expect(setCookie).toContain("SameSite=Lax");
				},
			},
		);
	});

	it("should use default domain from baseURL if not provided", async () => {
		const { testUser, client } = await getTestInstance({
			baseURL: "https://example.com",
			advanced: {
				crossSubDomainCookies: {
					enabled: true,
				},
			},
		});

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toContain("Domain=example.com");
				},
			},
		);
	});
});

describe("cookie configuration", () => {
	it("should return correct cookie options based on configuration", async () => {
		const options = {
			baseURL: "https://example.com",
			database: {} as BetterAuthOptions["database"],
			advanced: {
				useSecureCookies: true,
				crossSubDomainCookies: {
					enabled: true,
					domain: "example.com",
				},
				cookiePrefix: "test-prefix",
			},
		} satisfies BetterAuthOptions;

		const cookies = getCookies(options);

		expect(cookies.sessionToken.options.secure).toBe(true);
		expect(cookies.sessionToken.name).toContain("test-prefix.session_token");
		expect(cookies.sessionData.options.sameSite).toBe("lax");
		expect(cookies.sessionData.options.domain).toBe("example.com");
	});
});

describe("cookie-utils parseSetCookieHeader", () => {
	it("handles Expires with commas and multiple cookies", () => {
		const header =
			"a=1; Expires=Wed, 21 Oct 2015 07:28:00 GMT; Path=/, b=2; Expires=Thu, 22 Oct 2015 07:28:00 GMT; Path=/";
		const map = parseSetCookieHeader(header);
		expect(map.get("a")?.value).toBe("1");
		expect(map.get("b")?.value).toBe("2");
	});
});

describe("getSessionCookie", async () => {
	it("should return the correct session cookie", async () => {
		const { client, testUser, signInWithTestUser } = await getTestInstance();
		const { headers } = await signInWithTestUser();
		const request = new Request("http://localhost:3000/api/auth/session", {
			headers,
		});
		const cookies = getSessionCookie(request);
		expect(cookies).not.toBeNull();
		expect(cookies).toBeDefined();
	});

	it("should return the correct session cookie on production", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			baseURL: "https://example.com",
		});
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		const cookies = getSessionCookie(request);
		expect(cookies).not.toBeNull();
		expect(cookies).toBeDefined();
	});

	it("should allow override cookie prefix", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			advanced: {
				useSecureCookies: true,
				cookiePrefix: "test-prefix",
			},
		});
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{ onSuccess: cookieSetter(headers) },
		);
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		const cookies = getSessionCookie(request, {
			cookiePrefix: "test-prefix",
		});
		expect(cookies).not.toBeNull();
	});

	it("should allow override cookie name", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			advanced: {
				useSecureCookies: true,
				cookiePrefix: "test",
				cookies: {
					session_token: {
						name: "test-session-token",
					},
				},
			},
		});
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		const cookies = getSessionCookie(request, {
			cookieName: "session-token",
			cookiePrefix: "test",
		});
		expect(cookies).not.toBeNull();
	});

	it("should return cookie cache", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			session: {
				cookieCache: {
					enabled: true,
				},
			},
		});

		const headers = new Headers();

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);

		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});

		const cache = await getCookieCache(request, {
			secret: "better-auth.secret",
		});
		expect(cache).not.toBeNull();
		expect(cache?.user?.email).toEqual(testUser.email);
		expect(cache?.session?.token).toEqual(expect.any(String));
	});

	it("should respect dontRememberMe when storing session in cookie cache", async () => {
		const { client, testUser } = await getTestInstance({
			secret: "better-auth.secret",
			session: {
				cookieCache: {
					enabled: true,
				},
			},
		});

		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
				rememberMe: false,
			},
			{
				onSuccess(c) {
					const headers = c.response.headers;
					const setCookieHeader = headers.get("set-cookie");
					expect(setCookieHeader).toBeDefined();

					const parsed = parseSetCookieHeader(setCookieHeader!);

					const sessionTokenCookie = parsed.get("better-auth.session_token")!;
					expect(sessionTokenCookie).toBeDefined();
					expect(sessionTokenCookie["max-age"]).toBeUndefined();

					const sessionDataCookie = parsed.get("better-auth.session_data")!;
					expect(sessionDataCookie).toBeDefined();
					expect(sessionDataCookie["max-age"]).toBeUndefined();
				},
			},
		);
	});

	it("should return null if the cookie is invalid", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
				},
			},
		});
		const headers = new Headers();
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
		});
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		const cache = await getCookieCache(request, {
			secret: "wrong-secret",
		});
		expect(cache).toBeNull();
	});

	it("should throw an error if the secret is not provided", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			session: {
				cookieCache: {
					enabled: true,
				},
			},
		});
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});
		await expect(getCookieCache(request)).rejects.toThrow();
	});

	it("should log error and skip setting cookie when data exceeds size limit", async () => {
		const loggerErrors: string[] = [];
		const mockLogger = {
			log: (level: string, message: string) => {
				if (level === "error") {
					loggerErrors.push(message);
				}
			},
		};

		const { auth } = await getTestInstance({
			secret: "better-auth.secret",
			user: {
				additionalFields: {
					customField1: {
						type: "string",
						defaultValue: "",
					},
					customField2: {
						type: "string",
						defaultValue: "",
					},
					customField3: {
						type: "string",
						defaultValue: "",
					},
				},
			},
			session: {
				cookieCache: {
					enabled: true,
				},
			},
			logger: mockLogger,
		});

		// Create a very large string that will exceed the cookie size limit when combined with session data
		// The limit is 4093 bytes, so we create data that will definitely exceed it
		const largeString = "x".repeat(2000);

		// Sign up with large user data using the server API
		const result = await auth.api.signUpEmail({
			body: {
				name: "Test User",
				email: "large-data-test@example.com",
				password: "password123",
				customField1: largeString,
				customField2: largeString,
				customField3: largeString,
			},
		});

		// Check that logger recorded an error about exceeding size limit
		const sizeError = loggerErrors.find((msg) =>
			msg.includes("Session data exceeds cookie size limit"),
		);
		expect(sizeError).toBeDefined();
		expect(sizeError).toContain("4093 bytes");

		// The sign up should still succeed
		expect(result).toBeDefined();
		expect(result?.user).toBeDefined();
	});
});
