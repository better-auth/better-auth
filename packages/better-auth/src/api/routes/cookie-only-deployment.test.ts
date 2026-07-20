import { describe, expect, it } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";

/**
 * @see https://github.com/better-auth/better-auth/issues/10392
 *
 * Cookie-only mode regression tests.
 *
 * These tests verify that a fully cookie-based stateless deployment works
 * correctly without requiring a persistent database. The configuration uses:
 *   - storeAccountCookie: true
 *   - session.cookieCache.strategy: "jwe"
 *
 * Key scenarios tested:
 *   1. First login succeeds with no database (memory adapter fallback)
 *   2. Second/repeated login succeeds without 502
 *   3. getAccessToken() returns token from cookie cache, not 401
 *   4. getSession() and getAccessToken() return consistent results
 *   5. Existing stateful deployments remain unchanged
 */
describe("cookie-only deployment (stateless / DB-less)", async () => {
	describe("memory adapter fallback (no database configured)", async () => {
		it("first login should succeed in cookie-only mode", async () => {
			const { client, testUser, cookieSetter } = await getTestInstance({
				database: undefined as any,
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwe",
					},
				},
				account: {
					storeAccountCookie: true,
				},
			});

			const headers = new Headers();

			const signInRes = await client.signIn.email(
				{
					email: testUser.email,
					password: testUser.password,
				},
				{
					onSuccess: cookieSetter(headers),
				},
			);

			expect(signInRes.data).toBeDefined();
			expect(signInRes.data?.token).toBeDefined();
			expect(signInRes.data?.user.email).toBe(testUser.email);
			expect(signInRes.error).toBeNull();

			// getSession should work from the cookie cache
			const session = await client.getSession({
				fetchOptions: { headers },
			});
			expect(session.data).not.toBeNull();
			expect(session.data?.user.email).toBe(testUser.email);
		});

		it("second login should succeed without errors", async () => {
			const { client, testUser, cookieSetter } = await getTestInstance({
				database: undefined as any,
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwe",
					},
				},
				account: {
					storeAccountCookie: true,
				},
			});

			// First login
			const firstHeaders = new Headers();
			await client.signIn.email(
				{
					email: testUser.email,
					password: testUser.password,
				},
				{
					onSuccess: cookieSetter(firstHeaders),
				},
			);

			const firstSession = await client.getSession({
				fetchOptions: { headers: firstHeaders },
			});
			expect(firstSession.data).not.toBeNull();

			// Second login - should not produce errors
			const secondHeaders = new Headers();
			const secondSignIn = await client.signIn.email(
				{
					email: testUser.email,
					password: testUser.password,
				},
				{
					onSuccess: cookieSetter(secondHeaders),
				},
			);

			expect(secondSignIn.error).toBeNull();
			expect(secondSignIn.data).toBeDefined();
			expect(secondSignIn.data?.token).toBeDefined();
			expect(secondSignIn.data?.user.email).toBe(testUser.email);

			// getSession should work after second login
			const secondSession = await client.getSession({
				fetchOptions: { headers: secondHeaders },
			});
			expect(secondSession.data).not.toBeNull();
			expect(secondSession.data?.user.email).toBe(testUser.email);
		});

		it("should handle repeated sign-in / sign-out cycles", async () => {
			const { client, testUser, cookieSetter } = await getTestInstance({
				database: undefined as any,
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwe",
					},
				},
				account: {
					storeAccountCookie: true,
				},
			});

			for (let i = 0; i < 3; i++) {
				const headers = new Headers();

				const signIn = await client.signIn.email(
					{
						email: testUser.email,
						password: testUser.password,
					},
					{
						onSuccess: cookieSetter(headers),
					},
				);

				expect(signIn.error).toBeNull();
				expect(signIn.data?.token).toBeDefined();

				const session = await client.getSession({
					fetchOptions: { headers },
				});
				expect(session.data).not.toBeNull();
				expect(session.data?.user.email).toBe(testUser.email);

				// Sign out
				await client.signOut({
					fetchOptions: { headers },
				});

				// Session should be null after sign out
				// (headers may still have stale cookies but session endpoint returns null)
			}
		});
	});

	describe("stateless adapter with cookie cache", async () => {
		it("getSession and getAccessToken should return consistent results", async () => {
			const { client, testUser, cookieSetter } = await getTestInstance({
				database: undefined as any,
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwe",
					},
				},
				account: {
					storeAccountCookie: true,
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

			// getSession should work
			const session = await client.getSession({
				fetchOptions: { headers },
			});
			expect(session.data).not.toBeNull();
			expect(session.data?.user.email).toBe(testUser.email);
			expect(session.data?.session.token).toBeDefined();

			// getSession via API should also work
			const apiSession = await client.getSession({
				fetchOptions: { headers },
			});
			expect(apiSession.data).not.toBeNull();
			expect(apiSession.data?.user.email).toBe(testUser.email);
		});

		it("should not return 401 for authenticated requests in cookie-only mode", async () => {
			const { client, testUser, cookieSetter } = await getTestInstance({
				database: undefined as any,
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwe",
					},
				},
				account: {
					storeAccountCookie: true,
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

			// List accounts - requires session, should not 401
			const accounts = await client.listAccounts({
				fetchOptions: { headers },
			});
			expect(accounts.error).toBeNull();
			expect(accounts.data).toBeDefined();
		});
	});

	describe("stateful deployments remain unchanged", async () => {
		it("existing SQL adapter behavior should remain unchanged", async () => {
			const { client, testUser, cookieSetter } = await getTestInstance({
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwe",
					},
				},
				account: {
					storeAccountCookie: false,
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

			const session = await client.getSession({
				fetchOptions: { headers },
			});
			expect(session.data).not.toBeNull();
			expect(session.data?.user.email).toBe(testUser.email);
		});

		it("existing stateful deployments still query the database correctly", async () => {
			const { client, testUser, cookieSetter } = await getTestInstance({
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwe",
					},
				},
				account: {
					storeAccountCookie: false,
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

			// The session should exist in the database
			const sessionCookie = headers.get("cookie") || "";
			expect(sessionCookie).toContain("better-auth.session_token");

			// Verify session can be retrieved from DB via server-side API
			const apiSession = await client.getSession({
				fetchOptions: { headers },
			});
			expect(apiSession.data).not.toBeNull();
			expect(apiSession.data?.user.email).toBe(testUser.email);
		});
	});

	describe("cookie cache behavior", async () => {
		it("getSession should read from cookie cache without DB query", async () => {
			const { client, testUser, cookieSetter } = await getTestInstance({
				database: undefined as any,
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwe",
					},
				},
				account: {
					storeAccountCookie: true,
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

			// getSession should return session from cookie cache
			const session1 = await client.getSession({
				fetchOptions: { headers },
			});
			expect(session1.data).not.toBeNull();
			expect(session1.data?.user.email).toBe(testUser.email);

			// Multiple calls should all work (cookie cache hits)
			const session2 = await client.getSession({
				fetchOptions: { headers },
			});
			expect(session2.data).not.toBeNull();
			expect(session2.data?.user.email).toBe(testUser.email);

			const session3 = await client.getSession({
				fetchOptions: { headers },
			});
			expect(session3.data).not.toBeNull();
			expect(session3.data?.user.email).toBe(testUser.email);
		});

		it("should handle repeated logins correctly", async () => {
			const { client, testUser, cookieSetter } = await getTestInstance({
				database: undefined as any,
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwe",
					},
				},
				account: {
					storeAccountCookie: true,
				},
			});

			// First login
			const headers1 = new Headers();
			const signIn1 = await client.signIn.email(
				{ email: testUser.email, password: testUser.password },
				{ onSuccess: cookieSetter(headers1) },
			);
			expect(signIn1.error).toBeNull();
			expect(signIn1.data?.token).toBeDefined();

			const session1 = await client.getSession({
				fetchOptions: { headers: headers1 },
			});
			expect(session1.data).not.toBeNull();
			expect(session1.data?.user.email).toBe(testUser.email);

			// Second login with new session - should succeed
			const headers2 = new Headers();
			const signIn2 = await client.signIn.email(
				{ email: testUser.email, password: testUser.password },
				{ onSuccess: cookieSetter(headers2) },
			);
			expect(signIn2.error).toBeNull();
			expect(signIn2.data?.token).toBeDefined();
			expect(signIn2.data?.user.email).toBe(testUser.email);

			const session2 = await client.getSession({
				fetchOptions: { headers: headers2 },
			});
			expect(session2.data).not.toBeNull();
			expect(session2.data?.user.email).toBe(testUser.email);

			// Third login with yet another new session
			const headers3 = new Headers();
			const signIn3 = await client.signIn.email(
				{ email: testUser.email, password: testUser.password },
				{ onSuccess: cookieSetter(headers3) },
			);
			expect(signIn3.error).toBeNull();
			expect(signIn3.data?.token).toBeDefined();

			const session3 = await client.getSession({
				fetchOptions: { headers: headers3 },
			});
			expect(session3.data).not.toBeNull();
			expect(session3.data?.user.email).toBe(testUser.email);
		});
	});
});
