import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { betterAuth } from "../auth/full";
import { getCandidateSecrets } from "../context/secret-utils";
import { getMigrations } from "../db/get-migration";
import { parseSetCookieHeader } from "./cookie-utils";

describe("cookie signature secret rotation (#12636)", () => {
	const secretV1 = "secret-v1-at-least-32-chars-long-11111";
	const secretV2 = "secret-v2-at-least-32-chars-long-22222";
	const secretV3 = "secret-v3-at-least-32-chars-long-33333";

	describe("getCandidateSecrets", () => {
		it("returns single secret when string is passed", () => {
			expect(getCandidateSecrets("my-single-secret")).toEqual([
				"my-single-secret",
			]);
		});

		it("returns empty array or fallback when null/undefined", () => {
			expect(getCandidateSecrets(undefined, "fallback")).toEqual(["fallback"]);
			expect(getCandidateSecrets(null)).toEqual([]);
		});

		it("orders currentVersion first, then remaining keys, then legacySecret", () => {
			const keys = new Map<number, string>([
				[1, secretV1],
				[2, secretV2],
				[3, secretV3],
			]);
			const candidates = getCandidateSecrets({
				keys,
				currentVersion: 2,
				legacySecret: "legacy-secret",
			});
			expect(candidates).toEqual([
				secretV2,
				secretV1,
				secretV3,
				"legacy-secret",
			]);
		});
	});

	describe("session retrieval across rotated secrets", () => {
		it("preserves active sessions when secrets are rotated and lazily re-signs with current secret", async () => {
			const db = new DatabaseSync(":memory:");
			const { runMigrations } = await getMigrations({ database: db });
			await runMigrations();

			// Step 1: Initial auth instance running on secret v1
			const auth1 = betterAuth({
				database: db,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				secrets: [{ version: 1, value: secretV1 }],
			});

			// Sign up a user on auth1 to get session cookie
			let signUpSetCookie = "";
			const signUpRes = await auth1.api.signUpEmail({
				body: {
					email: "user@example.com",
					password: "password123",
					name: "User Example",
				},
				asResponse: true,
			});
			signUpSetCookie = (signUpRes as Response).headers.get("set-cookie") || "";
			const parsedSignUpCookies = parseSetCookieHeader(signUpSetCookie);
			const sessionTokenCookie = parsedSignUpCookies.get(
				"better-auth.session_token",
			);
			expect(sessionTokenCookie).toBeDefined();

			const headers = new Headers();
			headers.set(
				"cookie",
				`better-auth.session_token=${sessionTokenCookie?.value}`,
			);

			// Verify session works on auth1
			const initialSession = await auth1.api.getSession({ headers });
			expect(initialSession).not.toBeNull();
			expect(initialSession?.user.email).toBe("user@example.com");

			// Step 2: New deployment with rotated secrets [v2, v1]
			const auth2 = betterAuth({
				database: db,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				secrets: [
					{ version: 2, value: secretV2 },
					{ version: 1, value: secretV1 },
				],
			});

			// User presents cookie signed with v1 to auth2
			const rotatedSessionRes = await auth2.api.getSession({
				headers,
				asResponse: true,
			});
			const rotatedSetCookieHeader =
				(rotatedSessionRes as Response).headers.get("set-cookie") || "";
			const rotatedSessionBody = await (rotatedSessionRes as Response).json();

			// User must NOT be logged out!
			expect(rotatedSessionBody).not.toBeNull();
			expect(rotatedSessionBody.user.email).toBe("user@example.com");

			// Response must include re-signed cookie with current secret (v2)
			expect(rotatedSetCookieHeader).toContain("better-auth.session_token=");
			const parsedRotatedCookies = parseSetCookieHeader(rotatedSetCookieHeader);
			const upgradedTokenCookie = parsedRotatedCookies.get(
				"better-auth.session_token",
			);
			expect(upgradedTokenCookie).toBeDefined();
			// The upgraded cookie signature is different from original v1 signature
			expect(upgradedTokenCookie?.value).not.toBe(sessionTokenCookie?.value);

			// Step 3: Subsequent request using upgraded cookie on auth2
			const upgradedHeaders = new Headers();
			upgradedHeaders.set(
				"cookie",
				`better-auth.session_token=${upgradedTokenCookie?.value}`,
			);

			const upgradedSession = await auth2.api.getSession({
				headers: upgradedHeaders,
			});
			expect(upgradedSession).not.toBeNull();
			expect(upgradedSession?.user.email).toBe("user@example.com");

			// Step 4: Decommission v1 completely (only v2 active)
			const auth3 = betterAuth({
				database: db,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				secrets: [{ version: 2, value: secretV2 }],
			});

			// Upgraded cookie works seamlessly on v2-only instance
			const sessionOnV2 = await auth3.api.getSession({
				headers: upgradedHeaders,
			});
			expect(sessionOnV2).not.toBeNull();
			expect(sessionOnV2?.user.email).toBe("user@example.com");

			// Original v1 cookie is rejected by v2-only instance
			const sessionOnV1WithOnlyV2 = await auth3.api.getSession({
				headers,
			});
			expect(sessionOnV1WithOnlyV2).toBeNull();
		});

		it("allows sign-out with cookie signed by rotated previous secret", async () => {
			const db = new DatabaseSync(":memory:");
			const { runMigrations } = await getMigrations({ database: db });
			await runMigrations();

			const auth1 = betterAuth({
				database: db,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				secrets: [{ version: 1, value: secretV1 }],
			});

			const signUpRes = await auth1.api.signUpEmail({
				body: {
					email: "signout-user@example.com",
					password: "password123",
					name: "SignOut User",
				},
				asResponse: true,
			});
			const setCookie = (signUpRes as Response).headers.get("set-cookie") || "";
			const parsed = parseSetCookieHeader(setCookie);
			const sessionCookie = parsed.get("better-auth.session_token");

			const headers = new Headers();
			headers.set("cookie", `better-auth.session_token=${sessionCookie?.value}`);

			// Rotate to v2 with v1 fallback
			const auth2 = betterAuth({
				database: db,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				secrets: [
					{ version: 2, value: secretV2 },
					{ version: 1, value: secretV1 },
				],
			});

			// Sign out using the v1 cookie
			const signOutRes = await auth2.api.signOut({ headers });
			expect(signOutRes).toEqual({ success: true });

			// Subsequent getSession should be null (session deleted from DB)
			const sessionAfterSignOut = await auth2.api.getSession({ headers });
			expect(sessionAfterSignOut).toBeNull();
		});

		it("supports dynamic in-memory secret rotation", async () => {
			const db = new DatabaseSync(":memory:");
			const { runMigrations } = await getMigrations({ database: db });
			await runMigrations();

			const auth = betterAuth({
				database: db,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				secrets: [{ version: 1, value: secretV1 }],
			});

			const signUpRes = await auth.api.signUpEmail({
				body: {
					email: "dynamic@example.com",
					password: "password123",
					name: "Dynamic User",
				},
				asResponse: true,
			});
			const setCookie = (signUpRes as Response).headers.get("set-cookie") || "";
			const parsed = parseSetCookieHeader(setCookie);
			const sessionCookie = parsed.get("better-auth.session_token");

			const headers = new Headers();
			headers.set("cookie", `better-auth.session_token=${sessionCookie?.value}`);

			// Dynamically rotate secretConfig
			const ctx = await auth.$context;
			if (typeof ctx.secretConfig === "string") {
				throw new Error("Expected versioned secretConfig");
			}
			ctx.secretConfig.keys.set(2, secretV2);
			ctx.secretConfig.currentVersion = 2;

			// Verify getSession succeeds and re-signs
			const res = await auth.api.getSession({
				headers,
				asResponse: true,
			});
			const body = await (res as Response).json();
			expect(body).not.toBeNull();
			expect(body.user.email).toBe("dynamic@example.com");

			const resSetCookie = (res as Response).headers.get("set-cookie") || "";
			expect(resSetCookie).toContain("better-auth.session_token=");
		});
	});

	describe("cookie cache verification across rotated secrets", () => {
		it("decodes compact cookie cache signed with previous secret", async () => {
			const db = new DatabaseSync(":memory:");
			const { runMigrations } = await getMigrations({ database: db });
			await runMigrations();

			const auth1 = betterAuth({
				database: db,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				secrets: [{ version: 1, value: secretV1 }],
				session: {
					cookieCache: {
						enabled: true,
						strategy: "compact",
					},
				},
			});

			const signUpRes = await auth1.api.signUpEmail({
				body: {
					email: "cache-compact@example.com",
					password: "password123",
					name: "Cache Compact",
				},
				asResponse: true,
			});
			const setCookie = (signUpRes as Response).headers.get("set-cookie") || "";
			const parsed = parseSetCookieHeader(setCookie);
			const sessionToken = parsed.get("better-auth.session_token");
			const sessionData = parsed.get("better-auth.session_data");

			const headers = new Headers();
			headers.set(
				"cookie",
				`better-auth.session_token=${sessionToken?.value}; better-auth.session_data=${sessionData?.value}`,
			);

			// Rotate secrets to v2
			const auth2 = betterAuth({
				database: db,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				secrets: [
					{ version: 2, value: secretV2 },
					{ version: 1, value: secretV1 },
				],
				session: {
					cookieCache: {
						enabled: true,
						strategy: "compact",
					},
				},
			});

			const session = await auth2.api.getSession({ headers });
			expect(session).not.toBeNull();
			expect(session?.user.email).toBe("cache-compact@example.com");
		});

		it("decodes jwt cookie cache signed with previous secret", async () => {
			const db = new DatabaseSync(":memory:");
			const { runMigrations } = await getMigrations({ database: db });
			await runMigrations();

			const auth1 = betterAuth({
				database: db,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				secrets: [{ version: 1, value: secretV1 }],
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwt",
					},
				},
			});

			const signUpRes = await auth1.api.signUpEmail({
				body: {
					email: "cache-jwt@example.com",
					password: "password123",
					name: "Cache JWT",
				},
				asResponse: true,
			});
			const setCookie = (signUpRes as Response).headers.get("set-cookie") || "";
			const parsed = parseSetCookieHeader(setCookie);
			const sessionToken = parsed.get("better-auth.session_token");
			const sessionData = parsed.get("better-auth.session_data");

			const headers = new Headers();
			headers.set(
				"cookie",
				`better-auth.session_token=${sessionToken?.value}; better-auth.session_data=${sessionData?.value}`,
			);

			// Rotate secrets to v2
			const auth2 = betterAuth({
				database: db,
				baseURL: "http://localhost:3000",
				emailAndPassword: { enabled: true },
				secrets: [
					{ version: 2, value: secretV2 },
					{ version: 1, value: secretV1 },
				],
				session: {
					cookieCache: {
						enabled: true,
						strategy: "jwt",
					},
				},
			});

			const session = await auth2.api.getSession({ headers });
			expect(session).not.toBeNull();
			expect(session?.user.email).toBe("cache-jwt@example.com");
		});
	});
});
