import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { getCookieCache, getCookies, getSessionCookie } from "../cookies";
import { parseUserOutput } from "../db/schema";
import { getTestInstance } from "../test-utils/test-instance";
import { parseSetCookieHeader } from "./cookie-utils";

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

	it("should chunk large cookies instead of logging error", async () => {
		const { client, testUser } = await getTestInstance({
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
		});

		// Create a very large string that will exceed the cookie size limit when combined with session data
		// The limit is 4093 bytes, so we create data that will definitely exceed it
		const largeString = "x".repeat(2000);

		const headers = new Headers();
		let hasCookieChunks = false;

		// Sign up with large user data using the server API
		await client.signUp.email(
			{
				name: "Test User",
				email: "large-data-test@example.com",
				password: "password123",
				customField1: largeString,
				customField2: largeString,
				customField3: largeString,
			} as any,
			{
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					if (setCookie) {
						const parsed = parseSetCookieHeader(setCookie);
						parsed.forEach((value, name) => {
							if (
								name.includes("session_data.0") ||
								name.includes("session_data.1")
							) {
								hasCookieChunks = true;
							}
							headers.append("cookie", `${name}=${value.value}`);
						});
					}
				},
			},
		);

		// Verify that chunking happened (instead of logging an error and not caching)
		expect(hasCookieChunks).toBe(true);
	});
});

describe("Cookie Cache Field Filtering", () => {
	it("should exclude user fields with returned: false from cookie cache", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			user: {
				additionalFields: {
					internalNote: {
						type: "string",
						defaultValue: "",
						returned: false,
					},
				},
			},
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
		expect(cache?.user?.internalNote).toBeUndefined();
	});

	it("should correctly filter multiple user fields based on returned config", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			user: {
				additionalFields: {
					publicBio: {
						type: "string",
						defaultValue: "default-bio",
						returned: true,
					},
					internalNotes: {
						type: "string",
						defaultValue: "internal-notes",
						returned: false,
					},
					preferences: {
						type: "string",
						defaultValue: "default-prefs",
						returned: true,
					},
					adminFlags: {
						type: "string",
						defaultValue: "admin-flags",
						returned: false,
					},
				},
			},
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
		// Fields with returned: true should be included
		expect(cache?.user?.publicBio).toBeDefined();
		expect(cache?.user?.preferences).toBeDefined();
		// Fields with returned: false should be excluded
		expect(cache?.user?.internalNotes).toBeUndefined();
		expect(cache?.user?.adminFlags).toBeUndefined();
	});

	it("should always include id in parseUserOutput", () => {
		const options = {
			user: {
				additionalFields: {
					id: { type: "string", returned: false },
				},
			},
		} as any;
		const user = {
			id: "custom-oauth-id-123",
			email: "test@example.com",
			emailVerified: true,
			createdAt: new Date(),
			updatedAt: new Date(),
			name: "Test User",
		};
		const result = parseUserOutput(options, user);
		expect(result.id).toBe("custom-oauth-id-123");
	});

	it("should reduce cookie size when large fields are excluded", async () => {
		const largeString = "x".repeat(2000);
		const { client, testUser, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			user: {
				additionalFields: {
					largeBio: {
						type: "string",
						defaultValue: largeString,
						returned: false,
					},
					smallField: {
						type: "string",
						defaultValue: "small-value",
						returned: true,
					},
				},
			},
			session: {
				cookieCache: {
					enabled: true,
				},
			},
		});

		const headers = new Headers();

		// Sign in with testUser
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

		// Cookie cache should exist (not exceed size limit)
		expect(cache).not.toBeNull();
		// Large field should be excluded
		expect(cache?.user?.largeBio).toBeUndefined();
		// Small field should be included
		expect(cache?.user?.smallField).toBeDefined();
	});

	it("should maintain session field filtering (regression check)", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			session: {
				additionalFields: {
					internalSessionData: {
						type: "string",
						defaultValue: "internal-data",
						returned: false,
					},
					publicSessionData: {
						type: "string",
						defaultValue: "public-data",
						returned: true,
					},
				},
				cookieCache: {
					enabled: true,
				},
			},
		});

		const headers = new Headers();

		// Sign in with testUser
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
		// Verify session field filtering still works correctly
		// Session should have token
		expect(cache?.session?.token).toEqual(expect.any(String));
		// Session field with returned: false should be excluded
		expect(cache?.session?.internalSessionData).toBeUndefined();
	});

	it("should include unknown user fields for backward compatibility", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			user: {
				additionalFields: {
					knownField: {
						type: "string",
						defaultValue: "known-value",
						returned: false,
					},
				},
			},
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
		// Known field with returned: false should be excluded
		expect(cache?.user?.knownField).toBeUndefined();
		// Standard fields like email, name should be included (backward compatibility)
		expect(cache?.user?.email).toEqual(testUser.email);
		expect(cache?.user?.name).toBeDefined();
	});

	it("should work with JWT strategy", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwt",
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
			strategy: "jwt",
		});
		expect(cache).not.toBeNull();
		expect(cache?.user?.email).toEqual(testUser.email);
		expect(cache?.session?.token).toEqual(expect.any(String));
	});

	it("should work with compact strategy", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			session: {
				cookieCache: {
					enabled: true,
					strategy: "compact",
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
			strategy: "compact",
		});
		expect(cache).not.toBeNull();
		expect(cache?.user?.email).toEqual(testUser.email);
		expect(cache?.session?.token).toEqual(expect.any(String));
	});

	it("should return null for invalid JWT token", async () => {
		const { cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			session: {
				cookieCache: {
					enabled: true,
					strategy: "jwt",
				},
			},
		});

		const headers = new Headers();
		// Set an invalid JWT token manually
		headers.set("cookie", "better-auth.session_data=invalid.jwt.token");

		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});

		const cache = await getCookieCache(request, {
			secret: "better-auth.secret",
			strategy: "jwt",
		});
		expect(cache).toBeNull();
	});

	it("should default to JWT strategy when not specified", async () => {
		const { client, testUser, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			session: {
				cookieCache: {
					enabled: true,
					// No strategy specified, should default to "jwt"
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
			// No strategy specified, should default to "jwt"
		});
		expect(cache).not.toBeNull();
		expect(cache?.user?.email).toEqual(testUser.email);
		expect(cache?.session?.token).toEqual(expect.any(String));
	});
});

describe("Cookie Chunking", () => {
	it("should chunk cookies when they exceed 4KB", async () => {
		// Create a large string that will exceed the cookie size limit
		const largeString = "x".repeat(2000);

		const { client, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			user: {
				additionalFields: {
					field1: {
						type: "string",
						defaultValue: "",
					},
					field2: {
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
		});

		const headers = new Headers();

		// Sign up with large user data
		await client.signUp.email(
			{
				name: "Test User",
				email: "chunk-test@example.com",
				password: "password123",
				field1: largeString,
				field2: largeString,
			} as any,
			{
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toBeDefined();

					// Parse set-cookie header to check for chunks
					const parsed = parseSetCookieHeader(setCookie!);
					let hasChunks = false;

					// Check if we have chunked cookies
					parsed.forEach((value, name) => {
						if (
							name.includes("session_data.0") ||
							name.includes("session_data.1")
						) {
							hasChunks = true;
						}
					});

					expect(hasChunks).toBe(true);

					// Set cookies in headers for next request
					parsed.forEach((value, name) => {
						headers.append("cookie", `${name}=${value.value}`);
					});
				},
			},
		);

		// Now verify we can read it back
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});

		const cache = await getCookieCache(request, {
			secret: "better-auth.secret",
		});

		expect(cache).not.toBeNull();
		expect(cache?.user?.email).toEqual("chunk-test@example.com");
		expect(cache?.session?.token).toEqual(expect.any(String));
	});

	it("should reconstruct chunked cookies correctly", async () => {
		const largeString = "y".repeat(2500);

		const { client, cookieSetter } = await getTestInstance({
			secret: "better-auth.secret",
			user: {
				additionalFields: {
					largeField: {
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
		});

		const headers = new Headers();

		await client.signUp.email(
			{
				name: "Large Data User",
				email: "large-chunk-test@example.com",
				password: "password123",
				largeField: largeString,
			} as any,
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
		expect(cache?.user?.email).toEqual("large-chunk-test@example.com");
		expect(cache?.user?.largeField).toEqual(largeString);
	});

	it("should clean up all chunks when deleting session", async () => {
		const largeString = "z".repeat(2000);

		const { client } = await getTestInstance({
			secret: "better-auth.secret",
			user: {
				additionalFields: {
					field1: {
						type: "string",
						defaultValue: "",
					},
					field2: {
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
		});

		const headers = new Headers();

		// Sign up with large data to create chunks
		await client.signUp.email(
			{
				name: "Delete Test User",
				email: "delete-chunk-test@example.com",
				password: "password123",
				field1: largeString,
				field2: largeString,
			} as any,
			{
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					if (setCookie) {
						const parsed = parseSetCookieHeader(setCookie);
						parsed.forEach((value, name) => {
							headers.append("cookie", `${name}=${value.value}`);
						});
					}
				},
			},
		);

		// Sign out
		await client.signOut({
			fetchOptions: {
				headers,
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toBeDefined();

					// Should have maxAge=0 for all chunks
					const parsed = parseSetCookieHeader(setCookie!);
					let hasCleanupChunks = false;

					parsed.forEach((value, name) => {
						if (name.includes("session_data")) {
							expect(value["max-age"]).toBe(0);
							hasCleanupChunks = true;
						}
					});

					expect(hasCleanupChunks).toBe(true);
				},
			},
		});
	});

	it("should NOT chunk cookies when they are under 4KB", async () => {
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
				onSuccess(context) {
					const setCookie = context.response.headers.get("set-cookie");
					expect(setCookie).toBeDefined();

					const parsed = parseSetCookieHeader(setCookie!);
					let hasChunks = false;
					let hasSingleSessionData = false;

					parsed.forEach((value, name) => {
						if (
							name.includes("session_data.0") ||
							name.includes("session_data.1")
						) {
							hasChunks = true;
						}
						if (name.endsWith("session_data")) {
							hasSingleSessionData = true;
						}
					});

					expect(hasChunks).toBe(false);
					expect(hasSingleSessionData).toBe(true);

					parsed.forEach((value, name) => {
						headers.append("cookie", `${name}=${value.value}`);
					});
				},
			},
		);

		// Verify we can read it back
		const request = new Request("https://example.com/api/auth/session", {
			headers,
		});

		const cache = await getCookieCache(request, {
			secret: "better-auth.secret",
		});

		expect(cache).not.toBeNull();
		expect(cache?.user?.email).toEqual(testUser.email);
	});
});
